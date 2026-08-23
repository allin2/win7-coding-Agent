/**
 * F3 回归：模式损坏严格 fail-closed（经真实 createA9AgentRuntime）。
 *
 * 复现缺陷：产品 runtime 丢弃 modeStore.load() 的失败原因，只要 SQLite 有
 * 旧模式（full_access）就恢复，导致损坏模式文件后仍进入 full_access。
 */
/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;

function makeEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-f3-'));
  const workspaceRoot = path.join(root, 'ws');
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(dataRoot, { recursive: true });
  return { root, workspaceRoot, dataRoot };
}

function makeRuntime(env: ReturnType<typeof makeEnv>) {
  return createA9AgentRuntime({
    workspaceRoot: env.workspaceRoot,
    dataRoot: env.dataRoot,
    ownerId: `f3-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    openDatabase: (p: string, o?: { readonly?: boolean }) => new Database(p, o?.readonly ? { readonly: true } : {}),
  });
}

describe('F3: corrupt mode files fail closed through the real runtime', () => {
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => { env = makeEnv(); });
  afterEach(() => { fs.rmSync(env.root, { recursive: true, force: true }); });

  it('reproduced: corrupted settings + SQLite full_access no longer restores full_access', async () => {
    // 第一段：正常选择 full_access（JSON + SQLite 双写）。
    const first = makeRuntime(env);
    first.setMode('full_access');
    first.shutdown();

    // 破坏 JSON 配置文件（模拟损坏）。
    const modesDir = path.join(env.dataRoot, 'workspace-modes');
    const settingsFile = fs.readdirSync(modesDir).find((f) => f.startsWith('ws-') && f.endsWith('.json'));
    expect(settingsFile).toBeDefined();
    fs.writeFileSync(path.join(modesDir, settingsFile!), '{corrupted!!', 'utf8');

    // 第二段：SQLite 里仍是 full_access，但必须 needs_selection（禁止回退）。
    const second = makeRuntime(env);
    const snapshot = second.getSnapshot();
    expect(snapshot.mode).toBe('needs_selection');
    expect(snapshot.modeDiagnostics).toBeDefined();
    expect(snapshot.modeDiagnostics.reason).toBe('unparsable');
    // Turn 拒绝执行。
    const turn = await second.submitTurn('do anything');
    expect(turn.ok).toBe(false);
    expect((turn as any).error.code).toBe('A9_MODE_SELECTION_REQUIRED');
    second.shutdown();
  });

  it('workspace mismatch in the settings document fails closed (no SQLite fallback)', () => {
    const first = makeRuntime(env);
    first.setMode('review');
    first.shutdown();

    // 用另一工作区的文档覆盖当前键（内容 workspaceRoot 不匹配）。
    const modesDir = path.join(env.dataRoot, 'workspace-modes');
    const settingsFile = fs.readdirSync(modesDir).find((f) => f.startsWith('ws-') && f.endsWith('.json'))!;
    const doc = JSON.parse(fs.readFileSync(path.join(modesDir, settingsFile), 'utf8'));
    doc.workspaceRoot = '/definitely/another/workspace';
    fs.writeFileSync(path.join(modesDir, settingsFile), JSON.stringify(doc), 'utf8');

    const second = makeRuntime(env);
    const snapshot = second.getSnapshot();
    expect(snapshot.mode).toBe('needs_selection');
    expect(snapshot.modeDiagnostics.reason).toBe('workspace_mismatch');
    second.shutdown();
  });

  it('unsupported schema version fails closed', () => {
    const first = makeRuntime(env);
    first.setMode('read_only');
    first.shutdown();
    const modesDir = path.join(env.dataRoot, 'workspace-modes');
    const settingsFile = fs.readdirSync(modesDir).find((f) => f.startsWith('ws-') && f.endsWith('.json'))!;
    const doc = JSON.parse(fs.readFileSync(path.join(modesDir, settingsFile), 'utf8'));
    doc.schemaVersion = 99;
    fs.writeFileSync(path.join(modesDir, settingsFile), JSON.stringify(doc), 'utf8');

    const second = makeRuntime(env);
    expect(second.getSnapshot().mode).toBe('needs_selection');
    expect(second.getSnapshot().modeDiagnostics.reason).toBe('schema_mismatch');
    second.shutdown();
  });

  it('the only allowed SQLite restore path is a genuinely missing settings file', () => {
    // 直接经 SQLite 写入模式（不写 JSON），模拟历史数据。
    const runtime = makeRuntime(env);
    runtime.shutdown();
    const db = new Database(path.join(env.dataRoot, 'a9-state.db'));
    const canonical = runtime.getSnapshot().workspaceRoot;
    db.prepare('INSERT OR REPLACE INTO a9_workspaces (workspace_path, display_name, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(canonical, 'ws', 'review', new Date().toISOString(), new Date().toISOString());
    db.close();

    const second = makeRuntime(env);
    expect(second.getSnapshot().mode).toBe('review');
    second.shutdown();
  });

  it('fail-closed diagnostics are audited without secrets', () => {
    const first = makeRuntime(env);
    first.setMode('full_access');
    first.shutdown();
    const modesDir = path.join(env.dataRoot, 'workspace-modes');
    const settingsFile = fs.readdirSync(modesDir).find((f) => f.startsWith('ws-') && f.endsWith('.json'))!;
    fs.writeFileSync(path.join(modesDir, settingsFile), '{corrupted', 'utf8');

    const second = makeRuntime(env);
    second.getSnapshot();
    second.shutdown();

    const db = new Database(path.join(env.dataRoot, 'a9-state.db'), { readonly: true });
    const events = db.prepare("SELECT payload_json FROM a9_events WHERE event_type = 'mode.fail_closed'").all() as any[];
    expect(events.length).toBeGreaterThanOrEqual(1);
    const payload = JSON.parse(events[0].payload_json);
    expect(payload.reason).toBe('unparsable');
    expect(JSON.stringify(payload)).not.toMatch(/sk-|api[_-]?key|authorization/i);
    db.close();
  });
});
