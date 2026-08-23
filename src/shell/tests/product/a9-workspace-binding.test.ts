/**
 * F1 回归：正式产品把 A9 runtime 绑定到主进程确认的活动工作区。
 *
 * 复现缺陷：main.js 调用不存在的 desktopHost.getActiveWorkspacePath()，
 * 普通启动回退到 userData/a9 并缓存 runtime；未选工作区时没有
 * A9_WORKSPACE_REQUIRED；工作区切换不重建 runtime。
 */
/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;
const { createA9ProductRequestHandler } = require('../../product/a9-product-ipc') as any;
const { createDesktopHost } = require('../../product/desktop-host') as any;

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function startFixtureModel(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'p1', function: { name: 'probe_test_echo', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
        } else {
          const toolMsgs = (parsed.messages ?? []).filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo');
          if (toolMsgs.length === 0) {
            sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'r1', function: { name: 'read', arguments: '{"path":"note.txt"}' } }] }, finish_reason: 'tool_calls' }] });
          } else {
            sse(res, { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] });
          }
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>((d) => server.close(() => d())) });
    });
  });
}

describe('F1: a9 IPC returns A9_WORKSPACE_REQUIRED before a workspace is confirmed', () => {
  const handler = createA9ProductRequestHandler({
    // 主进程未确认工作区时 getA9Runtime 返回哨兵（与 main.js 行为一致）。
    getA9Runtime: () => Object.freeze({ __a9WorkspaceRequired: true, status: 'workspace_required' }),
    isValidRendererSender: () => true,
  });

  it('snapshot reports A9_WORKSPACE_REQUIRED (not DESKTOP_RUNTIME_ERROR)', async () => {
    const response = await handler({}, { schemaVersion: 2, action: 'a9.snapshot.get', payload: {} });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe('A9_WORKSPACE_REQUIRED');
    expect(response.error.recommendedAction).toContain('选择');
  });

  it('turn submission is refused with the same structured code', async () => {
    const response = await handler({}, { schemaVersion: 2, action: 'a9.turn.submit', payload: { prompt: 'x' } });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe('A9_WORKSPACE_REQUIRED');
  });
});

describe('F1: desktopHost exposes the confirmed active workspace', () => {
  it('returns null before selection and the selected path afterwards', () => {
    const host = createDesktopHost({ stateRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'f1-host-')) });
    try {
      expect(host.getActiveWorkspacePath()).toBeNull();
      const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-ws-'));
      host.selectWorkspace(ws);
      expect(host.getActiveWorkspacePath()).toBe(fs.realpathSync(ws));
      fs.rmSync(ws, { recursive: true, force: true });
    } finally {
      // 关闭 desktopHost 的事件定时器，避免 Jest 挂住不退出。
      host.dispose();
    }
  });
});

describe('F1: workspaces A and B stay isolated (mode, lock, checkpoints)', () => {
  let root: string;
  let dataRoot: string;
  let wsA: string;
  let wsB: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-iso-'));
    dataRoot = path.join(root, 'data');
    wsA = path.join(root, 'ws-a');
    wsB = path.join(root, 'ws-b');
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.mkdirSync(wsA, { recursive: true });
    fs.mkdirSync(wsB, { recursive: true });
    fs.writeFileSync(path.join(wsA, 'only-a.txt'), 'A\n');
    fs.writeFileSync(path.join(wsB, 'only-b.txt'), 'B\n');
  });

  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function makeRuntime(ws: string) {
    return createA9AgentRuntime({
      workspaceRoot: ws,
      dataRoot,
      ownerId: `f1-${ws}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      openDatabase: (p: string, o?: { readonly?: boolean }) => new Database(p, o?.readonly ? { readonly: true } : {}),
    });
  }

  it('mode chosen in A does not leak to B; checkpoints and locks are isolated', async () => {
    const fixture = await startFixtureModel();
    try {
      const runtimeA1 = makeRuntime(wsA);
      runtimeA1.setMode('full_access');
      await runtimeA1.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const turnA = await runtimeA1.submitTurn('write in A');
      expect(turnA.ok).toBe(true);
      expect(turnA.result.externalChanges === undefined || turnA.result.externalChanges.every((c: any) => c.path.startsWith('ws-a') || !c.path.includes('ws-b'))).toBe(true);
      runtimeA1.shutdown();

      // B 首次打开：needs_selection，看不到 A 的 checkpoint。
      const runtimeB = makeRuntime(wsB);
      const snapB = runtimeB.getSnapshot();
      expect(snapB.mode).toBe('needs_selection');
      expect(snapB.checkpoints).toEqual([]);
      expect(snapB.workspaceRoot).toContain('ws-b');

      // A 重启恢复：模式与 checkpoint 保持。
      const runtimeA2 = makeRuntime(wsA);
      const snapA = runtimeA2.getSnapshot();
      expect(snapA.mode).toBe('full_access');
      expect(snapA.checkpoints.length).toBeGreaterThanOrEqual(1);
      expect(snapA.workspaceRoot).toContain('ws-a');

      // 同一 dataRoot 下 A/B 的锁互不挤占（不同 canonical 路径）。
      runtimeB.setMode('read_only');
      expect(runtimeB.getSnapshot().lock.held).toBe(true);
      expect(runtimeA2.getSnapshot().lock.held).toBe(true);

      runtimeA2.shutdown();
      runtimeB.shutdown();
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it('invalid mode returns precise A9_MODE_INVALID, not a generic error', () => {
    const runtime = makeRuntime(wsA);
    expect(() => runtime.setMode('bogus-mode')).toThrow(/A9_MODE_INVALID/);
    const viaIpc = createA9ProductRequestHandler({
      getA9Runtime: () => runtime,
      isValidRendererSender: () => true,
    });
    return viaIpc({}, { schemaVersion: 2, action: 'a9.mode.set', payload: { mode: 'bogus-mode' } }).then((response: any) => {
      expect(response.ok).toBe(false);
      expect(String(response.error.message)).toMatch(/A9_MODE_INVALID/);
      runtime.shutdown();
    });
  });
});
