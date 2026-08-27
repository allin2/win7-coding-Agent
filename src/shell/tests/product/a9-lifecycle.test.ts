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

/** A9SH-03 fixture：启动真实托管后台进程后结束 Turn。 */
function startBackgroundFixture(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const command = `${JSON.stringify(process.execPath)} -e "setInterval(() => {}, 1000)"`;
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        const toolMsgs = (parsed.messages ?? []).filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo');
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (toolMsgs.length === 0) {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'bg1', function: { name: 'shell', arguments: JSON.stringify({ command, background: true }) } }] }, finish_reason: 'tool_calls' }] });
        } else {
          sse(res, { choices: [{ delta: { content: 'background started' }, finish_reason: 'stop' }] });
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>((done) => server.close(() => done())) });
    });
  });
}

function startApprovalFixture(options: { secondApproval?: boolean; failAfterFirstTool?: boolean } = {}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        const toolMsgs = (parsed.messages ?? []).filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo');
        if (options.failAfterFirstTool && toolMsgs.length > 0) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'forced resume provider failure' } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (toolMsgs.length === 0) {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'd1', function: { name: 'delete', arguments: '{"path":"note.txt","permanent":true}' } }] }, finish_reason: 'tool_calls' }] });
        } else if (options.secondApproval && toolMsgs.length === 1) {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'd2', function: { name: 'delete', arguments: '{"path":"second.txt","permanent":true}' } }] }, finish_reason: 'tool_calls' }] });
        } else {
          sse(res, { choices: [{ delta: { content: 'handled' }, finish_reason: 'stop' }] });
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>((done) => server.close(() => done())) });
    });
  });
}

/** 审批通过后的第二轮 Provider 请求保持挂起，用于观察恢复中的产品快照。 */
function startHeldApprovalFixture(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
  release: () => void;
  resumed: Promise<void>;
}> {
  let releaseResponse: (() => void) | null = null;
  let markResumed: (() => void) | null = null;
  const resumed = new Promise<void>((resolve) => { markResumed = resolve; });
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        const toolMsgs = (parsed.messages ?? []).filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo');
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (toolMsgs.length === 0) {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'd1', function: { name: 'delete', arguments: '{"path":"note.txt","permanent":true}' } }] }, finish_reason: 'tool_calls' }] });
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        if (markResumed) {
          markResumed();
          markResumed = null;
        }
        releaseResponse = () => {
          sse(res, { choices: [{ delta: { content: 'handled' }, finish_reason: 'stop' }] });
          res.write('data: [DONE]\n\n');
          res.end();
        };
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
        resumed,
        release: () => {
          const release = releaseResponse;
          releaseResponse = null;
          if (release) release();
        },
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function startFailingFixture(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'forced provider failure' } }));
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>((done) => server.close(() => done())) });
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
    failedTasks: read('a9_tasks', 'failed'),
    failedTurns: read('a9_turns', 'failed'),
    failedRuns: read('a9_runs', 'failed'),
  };
  db.close();
  return out;
}

function lifecycleFacts(env: ReturnType<typeof makeEnv>) {
  const db = new Database(path.join(env.dataRoot, 'a9-state.db'), { readonly: true });
  const checkpointRows = db.prepare('SELECT turn_id, payload_json FROM a9_checkpoints ORDER BY created_at').all() as any[];
  const out = {
    tasks: db.prepare('SELECT task_id, status FROM a9_tasks ORDER BY task_id').all() as any[],
    turns: db.prepare('SELECT turn_id, status FROM a9_turns ORDER BY turn_id').all() as any[],
    runs: db.prepare('SELECT run_id, status FROM a9_runs ORDER BY run_id').all() as any[],
    approvals: db.prepare('SELECT approval_id, decision FROM a9_approvals ORDER BY created_at').all() as any[],
    checkpoints: checkpointRows.map((row) => ({ turnId: row.turn_id, payload: JSON.parse(row.payload_json) })),
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
      expect(resume.error.code).toBe('A9_APPROVAL_UNKNOWN');
      runtime3.shutdown();
    } finally {
      fixture.release();
      await fixture.close();
    }
  }, 90_000);
});

describe('F5: pending approval keeps active state and resume continues the same entities', () => {
  it('hides a claimed approval while resume is active and rejects a duplicate decision without consuming it twice', async () => {
    const env = makeEnv();
    const fixture = await startHeldApprovalFixture();
    try {
      const runtime = makeRuntime(env);
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const first = await runtime.submitTurn('delete note');
      const approval = first.result.pendingApproval;
      expect(runtime.getSnapshot().pendingApproval.approvalId).toBe(approval.approvalId);
      const blockedTurn = await runtime.submitTurn('must not replace the pending approval');
      expect(blockedTurn.ok).toBe(false);
      expect(blockedTurn.error.code).toBe('A9_APPROVAL_REQUIRED');
      expect(runtime.getSnapshot().pendingApproval.approvalId).toBe(approval.approvalId);

      const resumedPromise = runtime.resumeApproval({
        approvalId: approval.approvalId,
        decision: 'approved',
        bindingDigest: approval.bindingDigest,
      });
      await fixture.resumed;
      expect(runtime.getSnapshot().pendingApproval).toBeUndefined();

      const duplicate = await runtime.resumeApproval({
        approvalId: approval.approvalId,
        decision: 'approved',
        bindingDigest: approval.bindingDigest,
      });
      expect(duplicate.ok).toBe(false);
      expect(duplicate.error.code).toBe('A9_APPROVAL_DECISION_IN_PROGRESS');
      expect(runtime.getSnapshot().pendingApproval).toBeUndefined();

      const concurrentTurn = await runtime.submitTurn('must not run beside approval resume');
      expect(concurrentTurn.ok).toBe(false);
      expect(concurrentTurn.error.code).toBe('A9_TURN_ALREADY_ACTIVE');
      expect(runtime.getSnapshot().pendingApproval).toBeUndefined();

      fixture.release();
      const resumed = await resumedPromise;
      expect(resumed.ok).toBe(true);
      expect(['completed', 'completed_with_warnings']).toContain(resumed.result.outcome);
      expect(lifecycleFacts(env).approvals.filter((item) => item.decision === 'approved')).toHaveLength(1);
      runtime.shutdown();
    } finally {
      fixture.release();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

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

  it('preserves a second pending approval, rejects the consumed old approval, and refreshes the same checkpoint', async () => {
    const env = makeEnv();
    fs.writeFileSync(path.join(env.workspaceRoot, 'second.txt'), 'second\n');
    const fixture = await startApprovalFixture({ secondApproval: true });
    try {
      const runtime = makeRuntime(env);
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const first = await runtime.submitTurn('delete two files');
      const firstApproval = first.result.pendingApproval;
      expect(first.result.outcome).toBe('needs_approval');
      expect(lifecycleFacts(env).checkpoints[0].payload).toEqual(expect.objectContaining({
        schemaVersion: 1,
        outcome: 'needs_approval',
        pendingApproval: expect.objectContaining({ approvalId: firstApproval.approvalId }),
      }));

      const resumed = await runtime.resumeApproval({
        approvalId: firstApproval.approvalId,
        decision: 'approved',
        bindingDigest: firstApproval.bindingDigest,
      });
      expect(resumed.ok).toBe(true);
      expect(resumed.result.outcome).toBe('needs_approval');
      const secondApproval = resumed.result.pendingApproval;
      expect(secondApproval.approvalId).not.toBe(firstApproval.approvalId);
      expect(runtime.getSnapshot().pendingApproval.approvalId).toBe(secondApproval.approvalId);
      let facts = lifecycleFacts(env);
      expect(facts.tasks).toHaveLength(1);
      expect(facts.turns).toHaveLength(1);
      expect(facts.runs).toHaveLength(1);
      expect(facts.checkpoints[0].payload).toEqual(expect.objectContaining({
        schemaVersion: 1,
        outcome: 'needs_approval',
        toolCallsExecuted: 1,
        externalChanges: expect.any(Array),
        pendingApproval: expect.objectContaining({ approvalId: secondApproval.approvalId }),
      }));

      const malformed = await runtime.resumeApproval({
        approvalId: secondApproval.approvalId,
        decision: 'approved',
      });
      expect(malformed.ok).toBe(false);
      expect(malformed.error.code).toBe('A9_APPROVAL_INPUT_INVALID');
      expect(runtime.getSnapshot().pendingApproval.approvalId).toBe(secondApproval.approvalId);

      const wrongDigest = await runtime.resumeApproval({
        approvalId: secondApproval.approvalId,
        decision: 'approved',
        bindingDigest: '0'.repeat(64),
      });
      expect(wrongDigest.ok).toBe(false);
      expect(runtime.getSnapshot().pendingApproval.approvalId).toBe(secondApproval.approvalId);

      const stale = await runtime.resumeApproval({
        approvalId: firstApproval.approvalId,
        decision: 'approved',
        bindingDigest: firstApproval.bindingDigest,
      });
      expect(stale.ok).toBe(false);
      expect(stale.error.code).toBe('A9_APPROVAL_UNKNOWN');
      expect(runtime.getSnapshot().pendingApproval.approvalId).toBe(secondApproval.approvalId);

      const denied = await runtime.resumeApproval({
        approvalId: secondApproval.approvalId,
        decision: 'denied',
        bindingDigest: secondApproval.bindingDigest,
      });
      expect(denied.ok).toBe(true);
      facts = lifecycleFacts(env);
      expect(facts.tasks[0].status).not.toBe('active');
      expect(facts.turns[0].status).not.toBe('active');
      expect(facts.runs[0].status).not.toBe('active');
      expect(facts.checkpoints[0].payload.outcome).toBe(denied.result.outcome);
      expect(facts.checkpoints[0].payload.pendingApproval).toBeUndefined();
      expect(fs.existsSync(path.join(env.workspaceRoot, 'note.txt'))).toBe(false);
      expect(fs.existsSync(path.join(env.workspaceRoot, 'second.txt'))).toBe(true);
      runtime.shutdown();
    } finally {
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('persists a submit-time provider failure as failed with no active lifecycle rows', async () => {
    const env = makeEnv();
    const fixture = await startFailingFixture();
    try {
      const runtime = makeRuntime(env);
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const failed = await runtime.submitTurn('fail now');
      expect(failed.ok).toBe(true);
      expect(failed.result.outcome).toBe('failed');
      const c = counts(env);
      expect(c.failedTasks).toBe(1);
      expect(c.failedTurns).toBe(1);
      expect(c.failedRuns).toBe(1);
      expect(c.activeTasks + c.activeTurns + c.activeRuns).toBe(0);
      expect(lifecycleFacts(env).checkpoints[0].payload).toEqual(expect.objectContaining({ schemaVersion: 1, outcome: 'failed' }));
      runtime.shutdown();
    } finally {
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('persists provider initialization failure as a synthetic failed turn/run instead of leaking an active task', async () => {
    const env = makeEnv();
    try {
      const runtime = makeRuntime(env);
      runtime.setMode('full_access');
      const failed = await runtime.submitTurn('provider is not configured');
      expect(failed.ok).toBe(false);
      const c = counts(env);
      expect(c.failedTasks).toBe(1);
      expect(c.failedTurns).toBe(1);
      expect(c.failedRuns).toBe(1);
      expect(c.activeTasks + c.activeTurns + c.activeRuns).toBe(0);
      expect(lifecycleFacts(env).checkpoints[0].payload).toEqual(expect.objectContaining({ schemaVersion: 1, outcome: 'failed' }));
      runtime.shutdown();
    } finally {
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('persists a provider failure after approval resume as failed with no active rows', async () => {
    const env = makeEnv();
    const fixture = await startApprovalFixture({ failAfterFirstTool: true });
    try {
      const runtime = makeRuntime(env);
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const first = await runtime.submitTurn('delete then fail');
      const approval = first.result.pendingApproval;
      const failed = await runtime.resumeApproval({
        approvalId: approval.approvalId,
        decision: 'approved',
        bindingDigest: approval.bindingDigest,
      });
      expect(failed.ok).toBe(true);
      expect(failed.result.outcome).toBe('failed');
      const c = counts(env);
      expect(c.failedTasks).toBe(1);
      expect(c.failedTurns).toBe(1);
      expect(c.failedRuns).toBe(1);
      expect(c.activeTasks + c.activeTurns + c.activeRuns).toBe(0);
      expect(lifecycleFacts(env).checkpoints[0].payload).toEqual(expect.objectContaining({ schemaVersion: 1, outcome: 'failed' }));
      runtime.shutdown();
    } finally {
      await fixture.close();
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

  it('persists a managed background process and keeps Stop available after the turn completes', async () => {
    const env = makeEnv();
    const fixture = await startBackgroundFixture();
    const runtime = makeRuntime(env);
    try {
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const turn = await runtime.submitTurn('start a managed background process');
      expect(turn.ok).toBe(true);
      expect(turn.result.outcome).toBe('completed');

      const running = runtime.getSnapshot().managedProcesses.filter((item: any) => item.lastProbeStatus === 'running');
      expect(running).toHaveLength(1);
      expect(running[0].pid).toBeGreaterThan(0);

      const stopped = await runtime.stop();
      expect(stopped.ok).toBe(true);
      expect(stopped.stopped).toContain(running[0].handleId);
      const terminal = runtime.getSnapshot().managedProcesses.find((item: any) => item.handleId === running[0].handleId);
      expect(terminal.lastProbeStatus).toBe('stopped');
    } finally {
      await runtime.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('does not resolve shutdown until managed background processes are reaped', async () => {
    const env = makeEnv();
    const fixture = await startBackgroundFixture();
    const runtime = makeRuntime(env);
    try {
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      await runtime.submitTurn('start a managed background process');
      const running = runtime.getSnapshot().managedProcesses.find((item: any) => item.lastProbeStatus === 'running');
      expect(running.pid).toBeGreaterThan(0);

      const result = await runtime.shutdown();
      expect(result.leftToSystem).toEqual([]);
      expect(result.stopped).toContain(running.handleId);
      expect(() => process.kill(running.pid, 0)).toThrow();
    } finally {
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);
});
