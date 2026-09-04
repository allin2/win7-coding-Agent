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
function startQuickFixture(firstTool: { name: string; arguments: string } = {
  name: 'read', arguments: '{"path":"note.txt"}',
}): Promise<{ baseUrl: string; close: () => Promise<void>; requests: any[] }> {
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
            sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'r1', function: firstTool }] }, finish_reason: 'tool_calls' }] });
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
function startBackgroundFixture(commandOverride?: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const command = commandOverride || `${JSON.stringify(process.execPath)} -e "setInterval(() => {}, 1000)"`;
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

function listDataFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listDataFiles(full));
    else files.push(full);
  }
  return files;
}

function makeRuntime(env: ReturnType<typeof makeEnv>) {
  return createA9AgentRuntime({
    workspaceRoot: env.workspaceRoot,
    dataRoot: env.dataRoot,
    ownerId: `f5-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    openDatabase: (p: string, o?: { readonly?: boolean }) => new Database(p, o?.readonly ? { readonly: true } : {}),
  });
}

function approvalDecision(approval: any, decision: 'approved' | 'denied', overrides: Record<string, unknown> = {}) {
  return {
    approvalId: approval.approvalId,
    decision,
    bindingDigest: approval.bindingDigest,
    conversationId: approval.conversationId,
    taskId: approval.taskId,
    turnId: approval.turnId,
    ...overrides,
  };
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
      const resume = await runtime3.resumeApproval({
        approvalId: 'apr-forged', decision: 'approved', bindingDigest: '0'.repeat(64),
        conversationId: 'a9c-forged', taskId: 'task-forged', turnId: 'turn-forged',
      });
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
      expect(() => runtime.createConversation()).toThrow('A9_CONVERSATION_BUSY');
      const blockedTurn = await runtime.submitTurn('must not replace the pending approval');
      expect(blockedTurn.ok).toBe(false);
      expect(blockedTurn.error.code).toBe('A9_APPROVAL_REQUIRED');
      expect(runtime.getSnapshot().pendingApproval.approvalId).toBe(approval.approvalId);

      const resumedPromise = runtime.resumeApproval(approvalDecision(approval, 'approved'));
      await fixture.resumed;
      const duringResume = runtime.getSnapshot();
      expect(duringResume.pendingApproval).toBeUndefined();
      expect(duringResume.agentStatus).toBe('running');
      expect(duringResume.controls).toMatchObject({ canStop: true, stopKind: 'turn' });

      const duplicate = await runtime.resumeApproval(approvalDecision(approval, 'approved'));
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

        const denied = await runtime.resumeApproval(approvalDecision(first.result.pendingApproval, 'denied'));
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

      const resumed = await runtime.resumeApproval(approvalDecision(firstApproval, 'approved'));
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
        ...approvalDecision(secondApproval, 'approved'),
        bindingDigest: '0'.repeat(64),
      });
      expect(wrongDigest.ok).toBe(false);
      expect(runtime.getSnapshot().pendingApproval.approvalId).toBe(secondApproval.approvalId);

      const stale = await runtime.resumeApproval(approvalDecision(firstApproval, 'approved'));
      expect(stale.ok).toBe(false);
      expect(stale.error.code).toBe('A9_APPROVAL_UNKNOWN');
      expect(runtime.getSnapshot().pendingApproval.approvalId).toBe(secondApproval.approvalId);

      const denied = await runtime.resumeApproval(approvalDecision(secondApproval, 'denied'));
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
      const failed = await runtime.resumeApproval(approvalDecision(approval, 'approved'));
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
      expect(runtime.getSnapshot().controls).toEqual({ canStop: true, stopKind: 'managed_process' });

      const firstStop = runtime.stop();
      const secondStop = runtime.stop();
      expect(secondStop).toBe(firstStop);
      const stopped = await firstStop;
      expect(stopped.ok).toBe(true);
      expect(stopped.stopped).toContain(running[0].handleId);
      const terminal = runtime.getSnapshot().managedProcesses.find((item: any) => item.handleId === running[0].handleId);
      expect(terminal.lastProbeStatus).toBe('stopped');
      expect(runtime.getSnapshot().controls).toEqual({ canStop: false, stopKind: 'none' });
    } finally {
      await runtime.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('restores completed conversation facts after restart without replaying the turn', async () => {
    const env = makeEnv();
    const fixture = await startBackgroundFixture();
    let first: any;
    let reopened: any;
    try {
      first = makeRuntime(env);
      first.setMode('full_access');
      await first.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const turn = await first.submitTurn('restore this exact request after restart');
      expect(turn.ok).toBe(true);
      await first.stop();
      await first.shutdown();

      reopened = makeRuntime(env);
      const snapshot = reopened.getSnapshot();
      expect(snapshot.conversation).toEqual([expect.objectContaining({
        turnId: turn.result.turnId,
        requestPrompt: 'restore this exact request after restart',
        outcome: 'completed',
        finalMessage: expect.any(String),
      })]);
      expect(snapshot.timeline).toEqual([]);
      expect(snapshot.pendingApproval).toBeUndefined();
    } finally {
      if (reopened) await reopened.shutdown();
      else if (first) await first.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('isolates visible and provider text context across conversations in one workspace', async () => {
    const env = makeEnv();
    const fixture = await startQuickFixture();
    let runtime: any;
    try {
      runtime = makeRuntime(env);
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const firstId = runtime.getSnapshot().activeConversationId;
      expect((await runtime.submitTurn('CONVERSATION_ONE_MARKER')).ok).toBe(true);
      const secondId = runtime.createConversation().conversationId;
      expect(secondId).not.toBe(firstId);
      expect(runtime.getSnapshot().conversation).toEqual([]);
      expect((await runtime.submitTurn('CONVERSATION_TWO_MARKER')).ok).toBe(true);

      runtime.activateConversation(firstId);
      expect(JSON.stringify(runtime.getSnapshot().conversation)).toContain('CONVERSATION_ONE_MARKER');
      expect(JSON.stringify(runtime.getSnapshot().conversation)).not.toContain('CONVERSATION_TWO_MARKER');
      const requestCount = fixture.requests.length;
      expect((await runtime.submitTurn('CONVERSATION_ONE_FOLLOWUP')).ok).toBe(true);
      const afterSwitch = fixture.requests.slice(requestCount)
        .find((request: any) => !(request?.tools?.[0]?.function?.name === 'probe_test_echo'));
      const serializedMessages = JSON.stringify(afterSwitch.messages);
      expect(serializedMessages).toContain('CONVERSATION_ONE_MARKER');
      expect(serializedMessages).toContain('CONVERSATION_ONE_FOLLOWUP');
      expect(serializedMessages).not.toContain('CONVERSATION_TWO_MARKER');
    } finally {
      if (runtime) await runtime.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('redacts configured secret material from persisted conversation prompts', async () => {
    const env = makeEnv();
    const fixture = await startBackgroundFixture();
    let first: any;
    let reopened: any;
    try {
      first = makeRuntime(env);
      first.setMode('full_access');
      const secret = 'a9/conversation secret';
      await first.configureProvider({
        baseUrl: fixture.baseUrl,
        model: 'fixture',
        apiKey: secret,
        skipProbe: true,
      });
      const encodedSecret = Buffer.from(secret, 'utf8').toString('base64');
      const unpadded = encodedSecret.replace(/=+$/g, '');
      const base64url = unpadded.replace(/\+/g, '-').replace(/\//g, '_');
      const formEncoded = encodeURIComponent(secret).toLowerCase().replace(/%20/g, '+');
      const mixedPercentBase64 = encodeURIComponent(encodedSecret).replace(/%([a-f0-9]{2})/gi, (_m, hex, offset) =>
        offset % 2 === 0 ? `%${hex.toUpperCase()}` : `%${hex.toLowerCase()}`);
      const mixedPercentSecret = '%61%39%2fconversation+se%63ret';
      const variants = [secret, encodedSecret, unpadded, base64url, formEncoded, mixedPercentBase64, mixedPercentSecret];
      const turn = await first.submitTurn(`do not persist ${variants.join(', ')}`);
      expect(turn.ok).toBe(true);
      const liveSnapshot = JSON.stringify(first.getSnapshot());
      expect(liveSnapshot).toContain('***redacted***');
      for (const variant of variants) expect(liveSnapshot).not.toContain(variant);
      await first.stop();
      await first.shutdown();

      for (const file of fs.readdirSync(env.dataRoot).map((name) => path.join(env.dataRoot, name))) {
        if (!fs.statSync(file).isFile()) continue;
        for (const variant of variants) {
          expect(fs.readFileSync(file).includes(Buffer.from(variant, 'utf8'))).toBe(false);
        }
      }

      reopened = makeRuntime(env);
      const serialized = JSON.stringify(reopened.getSnapshot().conversation);
      expect(serialized).toContain('***redacted***');
      expect(serialized).not.toContain(secret);
    } finally {
      if (reopened) await reopened.shutdown();
      else if (first) await first.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('redacts known secrets from manual conversation titles before SQLite and snapshot projection', async () => {
    const env = makeEnv();
    const fixture = await startQuickFixture();
    const runtime = makeRuntime(env);
    const secret = 'TITLE-SECRET-42';
    try {
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', apiKey: secret, skipProbe: true });
      const activeId = runtime.getSnapshot().activeConversationId;
      runtime.renameConversation(activeId, `manual-${secret}`);
      const snapshot = JSON.stringify(runtime.getSnapshot());
      expect(snapshot).toContain('***redacted***');
      expect(snapshot).not.toContain(secret);
      expect(fs.readFileSync(path.join(env.dataRoot, 'a9-state.db')).includes(Buffer.from(secret, 'utf8'))).toBe(false);
    } finally {
      await runtime.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  });

  it('rejects Provider reconfiguration while a Turn is active', async () => {
    const env = makeEnv();
    const fixture = await startDelayedFixture();
    const runtime = makeRuntime(env);
    try {
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'old-provider', skipProbe: true });
      runtime.setMode('full_access');
      fs.writeFileSync(path.join(env.workspaceRoot, 'note.txt'), 'hello');
      const runningTurn = runtime.submitTurn('hold this turn');
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && runtime.getSnapshot().agentStatus !== 'running') {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const activeSnapshot = runtime.getSnapshot();
      expect(activeSnapshot.agentStatus).toBe('running');

      await expect(runtime.configureProvider({
        baseUrl: `${fixture.baseUrl}/new-provider`, model: 'new-provider', skipProbe: true,
      })).rejects.toMatchObject({ code: 'A9_PROVIDER_RECONFIGURE_BUSY' });
      fixture.release();
      expect((await runningTurn).ok).toBe(true);
      expect(runtime.getSnapshot().provider.model).toBe('old-provider');
    } finally {
      fixture.release();
      await runtime.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('does not publish Read Only while a Full Access Turn is still active', async () => {
    const env = makeEnv();
    const fixture = await startDelayedFixture();
    const runtime = makeRuntime(env);
    try {
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      runtime.setMode('full_access');
      fs.writeFileSync(path.join(env.workspaceRoot, 'note.txt'), 'hello');
      const runningTurn = runtime.submitTurn('hold this turn');
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && runtime.getSnapshot().agentStatus !== 'running') {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(() => runtime.setMode('read_only')).toThrow('A9_MODE_CHANGE_BLOCKED_ACTIVE_TURN');
      expect(runtime.getSnapshot().mode).toBe('full_access');
      fixture.release();
      expect((await runningTurn).ok).toBe(true);
      expect(runtime.setMode('read_only')).toMatchObject({ ok: true, mode: 'read_only' });
    } finally {
      fixture.release();
      await runtime.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('recursively redacts secret-bearing external change paths before checkpoint and event persistence', async () => {
    const env = makeEnv();
    const secret = 'EXTERNAL-PATH-SECRET-42';
    const script = `require('fs').writeFileSync(${JSON.stringify(path.join(env.workspaceRoot, `${secret}.txt`))}, 'x')`;
    const fixture = await startBackgroundFixture(`${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`);
    const runtime = makeRuntime(env);
    try {
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', apiKey: secret, skipProbe: true });
      const turn = await runtime.submitTurn('create the requested test file');
      expect(turn.ok).toBe(false);
      expect(turn.error.message).toContain('A9_CHECKPOINT_COLLECTION_FAILED');
      expect(JSON.stringify(turn)).not.toContain(secret);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const raw = fs.readFileSync(path.join(env.dataRoot, 'a9-state.db'));
      expect(raw.includes(Buffer.from(secret, 'utf8'))).toBe(false);
      const snapshot = JSON.stringify(runtime.getSnapshot());
      expect(snapshot).not.toContain(secret);
    } finally {
      if (runtime.getSnapshot().controls.canStop) await runtime.stop();
      await runtime.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('blocks UTF-16LE known secrets before copying a Shell baseline into recovery', async () => {
    const env = makeEnv();
    const secret = 'UTF16-CHECKPOINT-SECRET-42';
    const encodedSecret = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(secret, 'utf16le')]);
    fs.writeFileSync(path.join(env.workspaceRoot, 'utf16-secret.txt'), encodedSecret);
    const fixture = await startBackgroundFixture();
    const runtime = makeRuntime(env);
    try {
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', apiKey: secret, skipProbe: true });
      const result = await runtime.submitTurn('start background');
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('CHECKPOINT_SECRET_BLOCKED');
      const recoveryRoot = path.join(env.workspaceRoot, '.agent_recovery');
      for (const file of fs.existsSync(recoveryRoot) ? listDataFiles(recoveryRoot) : []) {
        expect(fs.readFileSync(file).includes(Buffer.from(secret, 'utf16le'))).toBe(false);
      }
    } finally {
      await runtime.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('revalidates both standalone and initialized Loop checkpoint caches for a newly known secret', async () => {
    const env = makeEnv();
    const futureSecret = 'FUTURE-LOOP-RECOVERY-SECRET-42';
    const fixture = await startQuickFixture({
      name: 'write', arguments: JSON.stringify({ path: 'future-secret.txt', content: futureSecret }),
    });
    const runtime = makeRuntime(env);
    try {
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      expect((await runtime.submitTurn('write test value')).ok).toBe(true);
      await expect(runtime.configureProvider({
        baseUrl: fixture.baseUrl, model: 'fixture', apiKey: futureSecret, skipProbe: true,
      })).rejects.toThrow(/A9_CHECKPOINT_SECRET_BLOCKED/);
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

  it('redacts known secrets from managed process command persistence and snapshots', async () => {
    const env = makeEnv();
    const secret = 'MANAGED-COMMAND-SECRET-42';
    const command = `${JSON.stringify(process.execPath)} -e "setInterval(() => {}, 1000)" ${secret}`;
    const fixture = await startBackgroundFixture(command);
    const runtime = makeRuntime(env);
    try {
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', apiKey: secret, skipProbe: true });
      expect((await runtime.submitTurn('start background')).ok).toBe(true);
      const snapshot = JSON.stringify(runtime.getSnapshot().managedProcesses);
      expect(snapshot).toContain('***redacted***');
      expect(snapshot).not.toContain(secret);
      for (const file of listDataFiles(env.dataRoot)) {
        if (!fs.statSync(file).isFile()) continue;
        expect(fs.readFileSync(file).includes(Buffer.from(secret, 'utf8'))).toBe(false);
      }
      await runtime.shutdown();
    } finally {
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('reconciles a crash-time workspace manifest before exposing checkpoint undo', async () => {
    const env = makeEnv();
    let first: any;
    let reopened: any;
    try {
      first = makeRuntime(env);
      const sessionId = first.getSnapshot().activeConversationId;
      await first.shutdown();

      const db = new Database(path.join(env.dataRoot, 'a9-state.db'));
      const now = new Date().toISOString();
      db.prepare('INSERT INTO a9_tasks (task_id, session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run('task-crash-manifest', sessionId, 'active', now, now);
      db.prepare('INSERT INTO a9_turns (turn_id, task_id, session_id, status, outcome_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('turn-crash-manifest-full-id', 'task-crash-manifest', sessionId, 'active', '{}', now, now);
      db.prepare('INSERT INTO a9_runs (run_id, turn_id, session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('run-crash-manifest', 'turn-crash-manifest-full-id', sessionId, 'active', now, now);
      db.close();

      const { A9WorkspaceService } = require('../../../workspace/dist');
      const workspace = new A9WorkspaceService(env.workspaceRoot);
      await workspace.freezeTurnBaseline('turn-crash-manifest-full-id');
      fs.writeFileSync(path.join(env.workspaceRoot, 'note.txt'), 'changed before crash\n', 'utf8');

      reopened = makeRuntime(env);
      const snapshot = reopened.getSnapshot();
      expect(snapshot.checkpoints).toEqual(expect.arrayContaining([
        expect.objectContaining({ turnId: 'turn-crash-manifest-full-id' }),
      ]));
      expect(snapshot.interruptions).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'turn', id: 'turn-crash-manifest-full-id' }),
      ]));
      expect(fs.readFileSync(path.join(env.workspaceRoot, 'note.txt'), 'utf8')).toBe('changed before crash\n');
      const firstUndo = await reopened.undoTurn('turn-crash-manifest-full-id');
      expect(firstUndo.ok).toBe(true);
      expect(firstUndo.needsConfirmation).toBe(true);
      expect(firstUndo.externalChanges.changes).toContainEqual(expect.objectContaining({
        path: 'note.txt', kind: 'modified', recoverable: true,
      }));
      expect(fs.readFileSync(path.join(env.workspaceRoot, 'note.txt'), 'utf8')).toBe('changed before crash\n');
      const unconfirmedRetry = await reopened.undoTurn('turn-crash-manifest-full-id');
      expect(unconfirmedRetry.needsConfirmation).toBe(true);
      expect(unconfirmedRetry.confirmationId).toBe(firstUndo.confirmationId);
      expect(fs.readFileSync(path.join(env.workspaceRoot, 'note.txt'), 'utf8')).toBe('changed before crash\n');
      const confirmedUndo = await reopened.undoTurn('turn-crash-manifest-full-id', firstUndo.confirmationId);
      expect(confirmedUndo.ok).toBe(true);
      expect(confirmedUndo.needsConfirmation).toBeUndefined();
      expect(fs.readFileSync(path.join(env.workspaceRoot, 'note.txt'), 'utf8')).toBe('n\n');
    } finally {
      if (reopened) await reopened.shutdown();
      else if (first) await first.shutdown();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('quarantines an older unbound v4 checkpoint without blocking new work', async () => {
    const env = makeEnv();
    const fixture = await startQuickFixture();
    const manifestDir = path.join(env.workspaceRoot, '.agent_recovery', 'checkpoints');
    fs.mkdirSync(manifestDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(manifestDir, 'legacy-v4.json'), `${JSON.stringify({
      schemaVersion: 4,
      turnId: 'legacy-v4',
      createdAt: now,
      updatedAt: now,
      changes: {},
      unrecoverable: {},
    })}\n`, 'utf8');
    const runtime = makeRuntime(env);
    try {
      const initial = runtime.getSnapshot();
      expect(initial.checkpointRecoveryDiagnostics.code).toBe('A9_CHECKPOINT_TURNS_QUARANTINED');
      expect(initial.checkpointRecoveryDiagnostics.rejectedTurns).toEqual([
        expect.objectContaining({ turnId: 'legacy-v4' }),
      ]);

      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture', skipProbe: true });
      const result = await runtime.submitTurn('read note.txt');
      expect(result.ok).toBe(true);
      expect(result.result.outcome).toBe('completed');
      expect(fs.existsSync(path.join(manifestDir, 'legacy-v4.json'))).toBe(true);
    } finally {
      await runtime.shutdown();
      await fixture.close();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('keeps the workspace lock and allows shutdown retry while recovered PID cleanup is unresolved', async () => {
    const env = makeEnv();
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    let runtime: any;
    let contender: any;
    try {
      const seed = makeRuntime(env);
      await seed.shutdown();
      const db = new Database(path.join(env.dataRoot, 'a9-state.db'));
      db.prepare(`
        INSERT INTO a9_managed_processes
          (handle_id, workspace_path, pid, command, cwd, started_at, last_probe_status, pid_reuse_possible)
        VALUES (?, ?, ?, ?, ?, ?, 'running', 0)
      `).run('bg-recovered-shutdown', env.workspaceRoot, child.pid, 'previous command', env.workspaceRoot, new Date().toISOString());
      db.close();

      runtime = makeRuntime(env);
      const unresolved = await runtime.shutdown();
      expect(unresolved.leftToSystem[0]).toContain('recovered PID fact requires explicit stop confirmation');
      expect(runtime.getSnapshot().controls).toEqual({ canStop: true, stopKind: 'managed_process' });
      expect(runtime.getSnapshot().lock.held).toBe(true);

      contender = makeRuntime(env);
      expect(contender.getSnapshot().lock.held).toBe(false);
      await contender.shutdown();
      contender = null;

      const guarded = await runtime.stop();
      expect(guarded.ok).toBe(false);
      expect(guarded.errors[0].code).toBe('A9_RECOVERED_PROCESS_IDENTITY_UNCONFIRMED');
      expect(child.pid && (() => { try { process.kill(child.pid!, 0); return true; } catch (_error) { return false; } })()).toBe(true);

      child.kill();
      await new Promise<void>((resolve) => child.once('close', () => resolve()));
      expect((await runtime.stop()).ok).toBe(true);
      const retried = await runtime.shutdown();
      expect(retried.leftToSystem).toEqual([]);
      expect(runtime.getSnapshot().lock.held).toBe(false);
    } finally {
      if (contender) await contender.shutdown();
      if (runtime && runtime.getSnapshot().controls.canStop) await runtime.stop();
      if (runtime) await runtime.shutdown();
      if (child.pid && (() => { try { process.kill(child.pid, 0); return true; } catch (_err) { return false; } })()) child.kill('SIGKILL');
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);

  it('keeps persisted helper cleanup uncertainty visible and blocks clean exit after restart', async () => {
    const env = makeEnv();
    let runtime: any;
    try {
      const seed = makeRuntime(env);
      await seed.shutdown();
      const db = new Database(path.join(env.dataRoot, 'a9-state.db'));
      db.prepare(`
        INSERT INTO a9_managed_processes
          (handle_id, workspace_path, pid, command, cwd, started_at, last_probe_status, pid_reuse_possible)
        VALUES (?, ?, ?, ?, ?, ?, 'cleanup_required', 0)
      `).run('bg-helper-uncertain', env.workspaceRoot, process.pid, 'redacted helper command', env.workspaceRoot, new Date().toISOString());
      db.close();

      runtime = makeRuntime(env);
      expect(runtime.getSnapshot().managedProcesses).toEqual(expect.arrayContaining([
        expect.objectContaining({ handleId: 'bg-helper-uncertain', cleanupRequired: true }),
      ]));
      expect(runtime.getSnapshot().controls).toEqual({ canStop: true, stopKind: 'managed_process' });

      const guarded = await runtime.stop();
      expect(guarded.ok).toBe(false);
      expect(guarded.errors[0].code).toBe('A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED');

      const unresolved = await runtime.shutdown();
      expect(unresolved.leftToSystem[0]).toContain('recovered helper cleanup remains unconfirmed');
      expect(runtime.getSnapshot().lock.held).toBe(true);
    } finally {
      if (runtime) await runtime.shutdown();
      fs.rmSync(env.root, { recursive: true, force: true });
    }
  }, 30_000);
});
