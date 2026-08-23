/**
 * F5 回归：task/turn/run 生命周期与真实子进程中断恢复。
 *
 * 复现缺陷：产品 submitTurn 未调用 upsertTask/upsertTurn/upsertRun，真实
 * 一轮后 tasks=0/turns=0/runs=0；旧 J5 用测试代码直接 INSERT crash-task。
 */
/// <reference path="./better-sqlite3.d.ts" />
import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

/** 延迟 fixture：read 工具回执后不结束响应（保持 Turn active），可解锁。 */
function startDelayedFixture(): Promise<{ baseUrl: string; close: () => Promise<void>; release: () => void }> {
  let released = false;
  const pending: import('http').ServerResponse[] = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'p1', function: { name: 'probe_test_echo', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        const toolMsgs = (parsed.messages ?? []).filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo');
        if (toolMsgs.length === 0) {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'r1', function: { name: 'read', arguments: '{"path":"note.txt"}' } }] }, finish_reason: 'tool_calls' }] });
          res.write('data: [DONE]\n\n');
          res.end();
        } else if (released) {
          sse(res, { choices: [{ delta: { content: 'late final' }, finish_reason: 'stop' }] });
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          pending.push(res); // 不结束：模型“停住”
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
        release: () => {
          released = true;
          for (const res of pending.splice(0)) {
            sse(res, { choices: [{ delta: { content: 'late final' }, finish_reason: 'stop' }] });
            res.write('data: [DONE]\n\n');
            res.end();
          }
        },
      });
    });
  });
}

/** 常规行为 fixture：read→final。 */
function startQuickFixture(): Promise<{ baseUrl: string; close: () => Promise<void>; requests: any[] }> {
  const requests: any[] = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        requests.push(parsed);
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
      resolve({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, requests, close: () => new Promise<void>((done) => server.close(() => done())) });
    });
  });
}

function makeEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-f5-'));
  const workspaceRoot = path.join(root, 'ws');
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'n\n');
  return { root, workspaceRoot, dataRoot };
}

function makeRuntime(env: ReturnType<typeof makeEnv>) {
  return createA9AgentRuntime({
    workspaceRoot: env.workspaceRoot,
    dataRoot: env.dataRoot,
    ownerId: `f5-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    openDatabase: (p: string, o?: { readonly?: boolean }) => new Database(p, o?.readonly ? { readonly: true } : {}),
  });
}

function counts(env: ReturnType<typeof makeEnv>) {
  const db = new Database(path.join(env.dataRoot, 'a9-state.db'), { readonly: true });
  const read = (table: string, status?: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${status ? 'WHERE status = ?' : ''}`).get(...(status ? [status] : []) as any[]) as any).n;
  const out = {
    tasks: read('a9_tasks'),
    turns: read('a9_turns'),
    runs: read('a9_runs'),
    activeTasks: read('a9_tasks', 'active'),
    activeTurns: read('a9_turns', 'active'),
    activeRuns: read('a9_runs', 'active'),
    interruptedTasks: read('a9_tasks', 'interrupted'),
  };
  db.close();
  return out;
}

describe('F5: task/turn/run lifecycle is persisted by the product runtime', () => {
  let env: ReturnType<typeof makeEnv>;
  beforeEach(() => { env = makeEnv(); });
  afterEach(() => { fs.rmSync(env.root, { recursive: true, force: true }); });

  it('a completed turn leaves task/turn/run rows in terminal states', async () => {
    const fixture = await startQuickFixture();
    try {
      const runtime = makeRuntime(env);
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const turn = await runtime.submitTurn('go');
      expect(turn.ok).toBe(true);
      const c = counts(env);
      expect(c.tasks).toBeGreaterThanOrEqual(1);
      expect(c.turns).toBeGreaterThanOrEqual(1);
      expect(c.runs).toBeGreaterThanOrEqual(1);
      expect(c.activeTasks).toBe(0);
      expect(c.activeTurns).toBe(0);
      expect(c.activeRuns).toBe(0);
      runtime.shutdown();
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it('a real subprocess crash mid-turn becomes interrupted on restart, with no replay', async () => {
    const fixture = await startDelayedFixture();
    const markerFile = path.join(env.root, 'crash.marker');
    try {
      const childLog = path.join(env.root, 'child.log');
      const logStream = fs.openSync(childLog, 'a');
      const child = spawn(process.execPath, [path.join(__dirname, 'a9-f5-crash-child.cjs')], {
        env: {
          ...process.env,
          A9_F5_WORKSPACE: env.workspaceRoot,
          A9_F5_DATAROOT: env.dataRoot,
          A9_F5_FIXTURE_URL: fixture.baseUrl,
          A9_F5_MARKER: markerFile,
        },
        stdio: ['ignore', 'ignore', logStream],
      });
      child.on('exit', () => { fs.closeSync(logStream); });
      const deadline = Date.now() + 30_000;
      while (!fs.existsSync(markerFile) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(fs.existsSync(markerFile)).toBe(true);
      const before = counts(env);
      expect(before.activeTasks).toBeGreaterThanOrEqual(1);
      expect(before.activeTurns).toBeGreaterThanOrEqual(1);
      expect(before.activeRuns).toBeGreaterThanOrEqual(1);
      // 等待子进程退出（崩溃码 70）。
      // 用 pid 存活探测等待退出（jest 环境下 exit 事件可能不投递）。
      const exitDeadline = Date.now() + 15_000;
      let exited = false;
      while (Date.now() < exitDeadline) {
        const childPid = child.pid ?? 0;
        try { process.kill(childPid, 0); await new Promise((r) => setTimeout(r, 150)); } catch (_e) { exited = true; break; }
      }
      expect(exited).toBe(true);
      expect(child.exitCode).toBe(70);

      // 第二个进程打开相同 dataRoot：active → interrupted，只恢复事实。
      const runtime2 = makeRuntime(env);
      const snapshot = runtime2.getSnapshot();
      expect(snapshot.mode).toBe('full_access');
      expect(snapshot.interruptions.some((i: any) => i.kind === 'task')).toBe(true);
      expect(snapshot.interruptions.some((i: any) => i.kind === 'turn')).toBe(true);
      expect(snapshot.interruptions.some((i: any) => i.kind === 'run')).toBe(true);
      expect(snapshot.timeline).toEqual([]); // 无自动模型/Shell/Git/审批重放
      const after = counts(env);
      expect(after.activeTasks).toBe(0);
      expect(after.interruptedTasks).toBeGreaterThanOrEqual(1);
      runtime2.shutdown();

      // 旧审批不可执行（没有挂起审批却尝试恢复 → 结构化拒绝）。
      const runtime3 = makeRuntime(env);
      const resume = await runtime3.resumeApproval({ approvalId: 'apr-forged', decision: 'approved', bindingDigest: '0'.repeat(64) });
      expect(resume.ok).toBe(false);
      runtime3.shutdown();
    } finally {
      fixture.release();
      await fixture.close();
    }
  }, 90_000);
});

describe('F5: pending approval keeps active state and resume continues the same entities', () => {
  it('needs_approval leaves task/turn/run active; denied resume closes them', async () => {
    const env = makeEnv();
    try {
      // 审批 fixture：先 delete(permanent) 工具调用。
      const requests: any[] = [];
      const fixture = await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
        const server = http.createServer((req, res) => {
          let body = '';
          req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
          req.on('end', () => {
            const parsed = JSON.parse(body);
            requests.push(parsed);
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
              sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'p1', function: { name: 'probe_test_echo', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
            } else {
              const toolMsgs = (parsed.messages ?? []).filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo');
              if (toolMsgs.length === 0) {
                sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'd1', function: { name: 'delete', arguments: '{"path":"note.txt","permanent":true}' } }] }, finish_reason: 'tool_calls' }] });
              } else {
                sse(res, { choices: [{ delta: { content: 'handled' }, finish_reason: 'stop' }] });
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
      try {
        const runtime = makeRuntime(env);
        runtime.setMode('full_access');
        await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
        const first = await runtime.submitTurn('delete note');
        expect(first.result.outcome).toBe('needs_approval');
        let c = counts(env);
        expect(c.activeTasks).toBe(1);
        expect(c.activeTurns).toBe(1);
        expect(c.activeRuns).toBe(1);

        const denied = await runtime.resumeApproval({
          approvalId: first.result.pendingApproval.approvalId,
          decision: 'denied',
          bindingDigest: first.result.pendingApproval.bindingDigest,
        });
        expect(denied.ok).toBe(true);
        c = counts(env);
        expect(c.activeTasks).toBe(0);
        expect(c.activeTurns).toBe(0);
        expect(c.activeRuns).toBe(0);
        // 同一组实体：总数没有因 resume 增长。
        expect(c.turns).toBe(1);
        expect(c.runs).toBe(1);
        runtime.shutdown();
      } finally {
        await fixture.close();
      }
    } finally {
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('stop during a stalled model request returns cancelled and leaves no active rows', async () => {
    const env = makeEnv();
    const fixture = await startDelayedFixture();
    try {
      const runtime = makeRuntime(env);
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const turnPromise = runtime.submitTurn('stalled turn');
      // 等待 read 工具回执后模型停住（Turn 保持 active）。
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        if (runtime.getSnapshot().agentStatus === 'running') break;
        await new Promise((r) => setTimeout(r, 150));
      }
      const stopped = runtime.stop();
      expect(stopped.ok).toBe(true);
      const turned = await turnPromise;
      expect(turned.ok).toBe(true);
      // F5 状态语义：用户 stop 打断模型请求 → cancelled（不是 failed）。
      expect(turned.result.outcome).toBe('cancelled');
      const c = counts(env);
      expect(c.activeTasks).toBe(0);
      expect(c.activeTurns).toBe(0);
      expect(c.activeRuns).toBe(0);
      expect(c.tasks).toBeGreaterThanOrEqual(1);
      runtime.shutdown();
    } finally {
      fixture.release();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);
});
