/**
 * A9-06 合同测试：桌面 A9 运行时复合组件 + 版本化 IPC。
 *
 * 使用真实模块 dist（A9AgentLoop/A9WorkspaceService/TrustedShellRunner/
 * OpenAICompatibleProvider/A9PersistenceManager）与真实 better-sqlite3。
 * Renderer 边界：未知 action / 多余字段 / 旧 schema 一律结构化拒绝；
 * 首次未选模式或未配置 Provider 时拒绝执行（正式 UI 不默认 Replay）。
 */
/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;
const { createA9ProductRequestHandler, A9_IPC_SCHEMA_VERSION } = require('../../product/a9-product-ipc') as any;

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function startFixtureModel(script: Array<{ tool?: { id: string; name: string; args: unknown }; content?: string }>): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  let round = 0;
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        // 能力探测请求：以 probe_test_echo 应答（真实 tool_calls 证明）。
        if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe_1', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        const step = script[Math.min(round, script.length - 1)];
        round += 1;
        if (step.tool) {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: step.tool.id, function: { name: step.tool.name, arguments: JSON.stringify(step.tool.args) } }] }, finish_reason: 'tool_calls' }] });
        } else {
          sse(res, { choices: [{ delta: { content: step.content ?? 'done' }, finish_reason: 'stop' }] });
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function makeEnv(): { workspaceRoot: string; dataRoot: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-desktop-'));
  return {
    workspaceRoot: path.join(root, 'ws'),
    dataRoot: path.join(root, 'data'),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function openReal(databasePath: string, opts?: { readonly?: boolean }): any {
  return new Database(databasePath, opts?.readonly ? { readonly: true } : {});
}

const validSender = () => true;

describe('A9-06: desktop a9 runtime composite (real modules, real sqlite)', () => {
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    env = makeEnv();
    fs.mkdirSync(env.workspaceRoot, { recursive: true });
    fs.mkdirSync(env.dataRoot, { recursive: true });
  });

  afterEach(() => {
    env.cleanup();
  });

  it('refuses turns until a mode is explicitly selected (no silent full access)', () => {
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    expect(runtime.status).toBe('ready');
    expect(runtime.getSnapshot().mode).toBe('needs_selection');
    expect(runtime.getSnapshot().modeRecommended).toBe('full_access');
    const result = runtime.submitTurn('do something');
    return result.then((r: any) => {
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe('A9_MODE_SELECTION_REQUIRED');
    });
  });

  it('refuses turns until a real provider is configured (production never defaults to Replay)', async () => {
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    runtime.setMode('full_access');
    const snapshot = runtime.getSnapshot();
    expect(snapshot.provider.configured).toBe(false);
    expect(snapshot.provider.note).toContain('Replay 仅测试');
    const result = await runtime.submitTurn('hello');
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe('A9_PROVIDER_UNCONFIGURED');
  });

  it('accepts an arbitrary base URL and manual model id, then runs a full fixture round', async () => {
    const fixture = await startFixtureModel([
      { tool: { id: 'r1', name: 'read', args: { path: 'calc.ts' } } },
      { tool: { id: 'e1', name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } },
      { tool: { id: 's1', name: 'shell', args: { command: 'node -e \"console.log(\'verified\')\"' } } },
      { content: 'Fixed and verified.' },
    ]);
    try {
      fs.writeFileSync(path.join(env.workspaceRoot, 'calc.ts'), 'export function add(a, b) {\n  return a - b;\n}\n');
      const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
      runtime.setMode('full_access');
      const configured = await runtime.configureProvider({
        baseUrl: fixture.baseUrl,
        model: 'my-manual-model-id',
        customHeaders: { 'X-Workspace': 'a9' },
      });
      expect(configured.ok).toBe(true);
      expect(configured.model).toBe('my-manual-model-id');
      expect(configured.probe.classification).toBe('tool_calling');
      expect(configured.keyRemembered).toBe(false);

      const turn = await runtime.submitTurn('fix the bug');
      expect(turn.ok).toBe(true);
      expect(turn.result.outcome).toBe('completed');
      expect(turn.result.verification).toBe('verified');
      expect(fs.readFileSync(path.join(env.workspaceRoot, 'calc.ts'), 'utf8')).toContain('a + b');

      // Diff 与撤销可用。
      const diff = runtime.getDiff(turn.result.turnId);
      expect(diff.ok).toBe(true);
      expect(JSON.stringify(diff.diff)).toContain('calc.ts');
      const undone = runtime.undoTurn(turn.result.turnId);
      expect(undone.ok).toBe(true);
      expect(fs.readFileSync(path.join(env.workspaceRoot, 'calc.ts'), 'utf8')).toContain('a - b');

      const snapshot = runtime.getSnapshot();
      expect(snapshot.mode).toBe('full_access');
      expect(snapshot.shell.kind).toBeDefined();
      expect(snapshot.provider.model).toBe('my-manual-model-id');
      expect(snapshot.checkpoints.length).toBeGreaterThanOrEqual(1);
      runtime.shutdown();
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it('exposes honest git status including non-git degradation', async () => {
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    const git = await runtime.gitStatus();
    expect(git.ok).toBe(true);
    expect(git.projection.isGit).toBe(false);
    expect(git.projection.degradedReason).toContain('不是 Git 仓库');
    runtime.shutdown();
  });
});

describe('A9-06: a9 product IPC schema validation', () => {
  const handler = createA9ProductRequestHandler({
    getA9Runtime: () => ({ getSnapshot: () => ({ mode: 'read_only' }), setMode: (m: string) => ({ ok: true, mode: m }) }),
    isValidRendererSender: validSender,
  });

  it('rejects unknown actions, extra fields, and unsupported schema versions', async () => {
    const unknownAction = await handler({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.nope', payload: {} });
    expect(unknownAction.ok).toBe(false);
    expect(unknownAction.error.code).toBe('A9_ACTION_UNAVAILABLE');

    const extraField = await handler({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.mode.set', payload: { mode: 'review', evil: 1 } });
    expect(extraField.ok).toBe(false);
    expect(extraField.error.code).toBe('A9_PAYLOAD_INVALID');

    const missingField = await handler({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.mode.set', payload: {} });
    expect(missingField.ok).toBe(false);

    const oldSchema = await handler({}, { schemaVersion: 0, action: 'a9.snapshot.get', payload: {} });
    expect(oldSchema.ok).toBe(false);
    expect(oldSchema.error.code).toBe('A9_SCHEMA_VERSION_UNSUPPORTED');
  });

  it('rejects non-whitelisted senders (renderer capability boundary)', async () => {
    const strict = createA9ProductRequestHandler({
      getA9Runtime: () => ({ getSnapshot: () => ({}) }),
      isValidRendererSender: () => false,
    });
    const denied = await strict({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.snapshot.get', payload: {} });
    expect(denied.ok).toBe(false);
    expect(denied.error.code).toBe('RENDERER_CAPABILITY_DENIED');
  });

  it('forwards valid mode changes', async () => {
    const ok = await handler({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.mode.set', payload: { mode: 'read_only' } });
    expect(ok).toEqual({ ok: true, mode: 'read_only' });
  });
});
