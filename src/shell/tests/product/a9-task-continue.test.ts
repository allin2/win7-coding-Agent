/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as vm from 'vm';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime');
const { createA9ProductRequestHandler } = require('../../product/a9-product-ipc');
const seed = (f: any, tool: string, args: any) => f.db.prepare("INSERT INTO a9_events(session_id,turn_id,kind,event_type,payload_json,created_at) VALUES(?,'old-turn','tool','tool_start',?,'2026-01-01')").run(f.fact().conversationId, JSON.stringify({ data: { toolName: tool, callId: 'unknown-' + tool, args } }));
async function setup(options: { fail?: boolean; hold?: boolean; budget?: boolean; unconfigured?: boolean; sequence?: Array<{ name: string; args: any }> } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-runtime-')), workspaceRoot = path.join(root, '中文 workspace'), dataRoot = path.join(root, 'data');
  fs.mkdirSync(workspaceRoot); fs.mkdirSync(dataRoot); fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'current fact\n', 'utf8');
  const requests: any[] = []; let fail = options.fail === true, hold = options.hold === true;
  const pending: http.ServerResponse[] = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (chunk) => { body += chunk.toString('utf8'); }); req.on('end', () => {
      const payload = JSON.parse(body); requests.push(payload);
      if (fail) { res.writeHead(401); res.end('{}'); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (hold) { pending.push(res); return; }
      const tool = options.sequence?.[requests.length - 1];
      if (tool) { res.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'new-' + requests.length, function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`); return; }
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'new response' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  const make = () => createA9AgentRuntime({ workspaceRoot, dataRoot, ownerId: `a9-32-${process.pid}-${Math.random()}`, openDatabase: (p: string, opts: any) => new Database(p, opts) });
  let runtime = make(); runtime.setMode('full_access');
  if (!options.unconfigured) await runtime.configureProvider({ baseUrl, model: 'fixture', skipProbe: true, ...(options.budget ? { contextBudgetChars: 16000 } : {}) });
  const conversationId = runtime.getSnapshot().activeConversationId;
  const db = new Database(path.join(dataRoot, 'a9-state.db'));
  db.prepare('INSERT INTO a9_tasks(task_id,session_id,status,created_at,updated_at) VALUES(?,?,?,?,?)').run('task', conversationId, 'active', '2026-01-01', '2026-01-01');
  db.prepare('INSERT INTO a9_turns(turn_id,task_id,session_id,status,outcome_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('old-turn', 'task', conversationId, 'active', '{}', '2026-01-01', '2026-01-01');
  db.prepare("INSERT INTO a9_events(session_id,turn_id,kind,event_type,payload_json,created_at) VALUES(?,?, 'model','conversation.request',?,?)").run(conversationId, null, JSON.stringify({ taskId: 'task', requestPrompt: '修复 note.txt' }), '2026-01-01');
  db.prepare("INSERT INTO a9_approvals(approval_id,session_id,turn_id,tool_name,binding_json,decision,created_at) VALUES('old-approval',?,'old-turn','shell','{}','pending','2026-01-01')").run(conversationId);
  await runtime.shutdown();
  if (options.budget) { const file = path.join(dataRoot, 'a9-provider-config.v1.json'); const config = JSON.parse(fs.readFileSync(file, 'utf8')); config.contextBudgetChars = 16000; fs.writeFileSync(file, JSON.stringify(config), 'utf8'); }
  runtime = make();
  const ipc = () => createA9ProductRequestHandler({ isValidRendererSender: () => true, getA9Runtime: () => runtime });
  return { root, workspaceRoot, dataRoot, db, requests, get runtime() { return runtime; },
    fact: () => runtime.getSnapshot().recoveryTasks[0],
    click: (fact: any) => ipc()({}, { schemaVersion: 7, action: 'a9.task.continue', payload: { conversationId: fact.conversationId, taskId: fact.taskId, interruptedTurnId: fact.interruptedTurnId, recoveryRevision: fact.recoveryRevision } }),
    setFail: (value: boolean) => { fail = value; },
    release: () => { hold = false; for (const response of pending.splice(0)) response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`); },
    restart: async () => { await runtime.shutdown(); runtime = make(); },
    close: async () => { for (const response of pending) response.destroy(); await runtime.shutdown(); db.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }, ipc,
  };
}
it('restart and refresh send zero requests; concurrent duplicate/restart return the same new Turn', async () => {
  const f = await setup();
  try {
    const fact = f.fact(); f.runtime.getSnapshot(); f.runtime.getSnapshot({ conversationPage: true });
    expect(f.requests).toHaveLength(0); expect(f.db.prepare("SELECT decision FROM a9_approvals WHERE approval_id='old-approval'").get()).toEqual({ decision: 'interrupted' });
    const [first, second] = await Promise.all([f.click(fact), f.click(fact)]);
    expect(first.ok).toBe(true); expect(second.ok).toBe(true); expect(first.continuation.turnId).toBe(second.continuation.turnId);
    expect(f.requests).toHaveLength(1); expect(f.db.prepare('SELECT count(*) n FROM a9_turns').get()).toEqual({ n: 2 });
    expect(f.db.prepare("SELECT status FROM a9_turns WHERE turn_id='old-turn'").get()).toEqual({ status: 'interrupted' });
    await f.restart(); expect(f.requests).toHaveLength(1); expect((await f.click(fact)).continuation.turnId).toBe(first.continuation.turnId); expect(f.requests).toHaveLength(1);
    const messages = f.requests[0].messages;
    expect(JSON.stringify(messages)).not.toContain('old-approval'); expect(messages.filter((m: any) => m.role === 'tool')).toEqual([]);
  } finally { await f.close(); }
});
it.each(['revision', 'task', 'conversation', 'archived', 'residue', 'audit', 'budget', 'mode', 'unconfigured'])('rejects %s before Provider/new dispatch', async (condition) => {
  const f = await setup({ budget: condition === 'budget', unconfigured: condition === 'unconfigured' });
  try {
    const fact = { ...f.fact() };
    if (condition === 'revision') fact.recoveryRevision = '0'.repeat(64);
    if (condition === 'task') fact.taskId = 'foreign';
    if (condition === 'conversation') fact.conversationId = 'foreign';
    if (condition === 'archived') f.db.prepare("UPDATE a9_sessions SET state='archived' WHERE session_id=?").run(fact.conversationId);
    if (condition === 'residue') f.db.prepare("INSERT INTO a9_managed_processes(handle_id,workspace_path,pid,command,cwd,last_probe_status,started_at) VALUES('old-h',?,0,'',?,'running_unknown','now')").run(f.workspaceRoot, f.workspaceRoot);
    if (condition === 'audit') f.db.exec("CREATE TRIGGER fail_continue BEFORE INSERT ON a9_events WHEN NEW.event_type='task_continue_requested' BEGIN SELECT RAISE(ABORT, 'audit failed'); END;");
    if (condition === 'budget') fs.writeFileSync(path.join(f.workspaceRoot, 'AGENTS.md'), 'x'.repeat(30000), 'utf8');
    if (condition === 'mode') {
      const modeRoot = path.join(f.dataRoot, 'workspace-modes');
      const modeFile = fs.readdirSync(modeRoot).find((name) => name.endsWith('.json'));
      expect(modeFile).toBeDefined(); fs.writeFileSync(path.join(modeRoot, modeFile!), '{}', 'utf8');
    }
    const result = await f.click(fact);
    if (condition === 'budget') { expect(result.result.outcome).toBe('failed'); expect(result.result.finalMessage).toContain('上下文'); }
    else expect(result.ok).toBe(false);
    expect(f.requests).toHaveLength(0);
    if (condition !== 'budget') expect(f.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='task_continue_requested'").get()).toEqual({ n: 0 });
  } finally { await f.close(); }
});
it('Provider failure retains a new interrupted attempt and permits a fresh explicit retry', async () => {
  const f = await setup({ fail: true });
  try {
    const old = f.fact(); const first = await f.click(old);
    expect(first.result.outcome).toBe('failed'); const retry = f.fact(); expect(retry.interruptedTurnId).toBe(first.continuation.turnId);
    const requests = f.requests.length; expect((await f.click(old)).continuation.duplicate).toBe(true); expect(f.requests.length).toBe(requests);
    f.setFail(false); const second = await f.click(retry); expect(second.result.outcome).toBe('completed'); expect(second.continuation.turnId).not.toBe(first.continuation.turnId);
  } finally { await f.close(); }
});
it('Stop cancels the active new Turn and preserves facts for another explicit attempt', async () => {
  const f = await setup({ hold: true });
  try {
    const pending = f.click(f.fact());
    for (let i = 0; i < 100 && f.requests.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(f.requests).toHaveLength(1); expect(f.runtime.getSnapshot().controls.canStop).toBe(true);
    expect(f.runtime.stop().ok).toBe(true); const stopped = await pending; expect(stopped.result.outcome).toBe('cancelled');
    const retry = f.fact(); expect(retry.interruptedTurnId).toBe(stopped.continuation.turnId); f.release(); expect((await f.click(retry)).ok).toBe(true);
  } finally { await f.close(); }
});
it('strict IPC rejects prompt/permissions/tools and malformed identity; diagnostics stay closed', async () => {
  const f = await setup();
  try {
    const fact = f.fact(); const payload = { conversationId: fact.conversationId, taskId: fact.taskId, interruptedTurnId: fact.interruptedTurnId, recoveryRevision: fact.recoveryRevision };
    for (const patch of [{ prompt: 'execute' }, { permissions: 'full_access' }, { tools: [] }, { recoveryRevision: '' }, { taskId: 1 }]) {
      const response = await f.ipc()({}, { schemaVersion: 7, action: 'a9.task.continue', payload: { ...payload, ...patch } });
      expect(response.error.code).toBe('A9_PAYLOAD_INVALID');
    }
    expect(f.requests).toHaveLength(0);
    const restricted = createA9AgentRuntime({ workspaceRoot: f.workspaceRoot, dataRoot: path.join(f.root, 'bad'), openDatabase: () => { throw new Error('broken db'); } });
    expect((await restricted.continueTask(payload)).error.code).toBe('A9_DIAGNOSTICS_MODE');
  } finally { await f.close(); }
});
it('preload exposes only the four identity fields through the actual invoke channel', async () => {
  let api: any; const invoke = jest.fn(async () => ({ ok: true }));
  const file = path.resolve(__dirname, '../../product/preload.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { process: { argv: [] }, require: () => ({ contextBridge: { exposeInMainWorld: (_name: string, value: any) => { api = value; } }, ipcRenderer: { invoke } }), Date });
  await api.a9.continueTask('c', 'task', 'old', 'a'.repeat(64));
  expect(invoke).toHaveBeenCalledWith('product:a9-request', { schemaVersion: 7, action: 'a9.task.continue', payload: { conversationId: 'c', taskId: 'task', interruptedTurnId: 'old', recoveryRevision: 'a'.repeat(64) } });
});

it('a mandatory final SQLite checkpoint failure stops every later continuation dispatch', async () => {
  const f = await setup();
  try {
    const fact = f.fact(); f.db.exec("CREATE TRIGGER fail_checkpoint BEFORE INSERT ON a9_checkpoints BEGIN SELECT RAISE(ABORT, 'checkpoint audit failed'); END;");
    const first = await f.click(fact); expect(first.error.code).toBe('A9_AUDIT_PERSISTENCE_FAILED'); expect(f.requests).toHaveLength(1);
    const retry = { ...fact, recoveryRevision: '0'.repeat(64) }; const second = await f.click(retry); expect(second.error.code).toBe('A9_AUDIT_PERSISTENCE_FAILED'); expect(f.requests).toHaveLength(1);
  } finally { await f.close(); }
});

it('actual workspace read precedes a fresh write when an old edit has result_unknown', async () => {
  const f = await setup({ sequence: [{ name: 'write', args: { path: 'note.txt', content: 'unsafe replay' } }, { name: 'read', args: { path: 'note.txt' } }, { name: 'write', args: { path: 'note.txt', content: 'fresh write' } }] });
  try {
    const id = f.fact().conversationId;
    f.db.prepare("INSERT INTO a9_events(session_id,turn_id,kind,event_type,payload_json,created_at) VALUES(?,'old-turn','tool','tool_start',?,'2026-01-01')").run(id, JSON.stringify({ data: { toolName: 'edit', callId: 'unknown-edit', args: { path: 'note.txt', new_text: 'old unauthorized content' } } }));
    const result = await f.click(f.fact()); expect(result.ok).toBe(true); expect(fs.readFileSync(path.join(f.workspaceRoot, 'note.txt'), 'utf8')).toBe('fresh write');
    const starts = f.db.prepare("SELECT payload_json FROM a9_events WHERE turn_id=? AND event_type='tool_start' ORDER BY id").all(result.continuation.turnId) as any[];
    expect(starts.map((row) => JSON.parse(row.payload_json).data.toolName)).toEqual(['read', 'write']);
    expect(JSON.stringify(f.requests[1].messages)).toContain('A9_CONTINUE_READ_ONLY_CHECK_REQUIRED');
    expect(JSON.stringify(f.requests)).not.toContain('old unauthorized content');
  } finally { await f.close(); }
});


it.each(['write', 'delete'])('audited absent %s target releases new writes through actual workspace and SQLite', async (tool) => {
  const f = await setup({ sequence: [{ name: 'read', args: { path: 'new.txt' } }, { name: 'write', args: { path: 'other.txt', content: 'other' } }, { name: 'write', args: { path: 'new.txt', content: 'fresh' } }] });
  try {
    seed(f, tool, { path: 'new.txt', content: 'old' }); const result = await f.click(f.fact());
    expect(result.ok).toBe(true); expect(fs.readFileSync(path.join(f.workspaceRoot, 'other.txt'), 'utf8')).toBe('other'); expect(fs.readFileSync(path.join(f.workspaceRoot, 'new.txt'), 'utf8')).toBe('fresh');
    const events = f.db.prepare("SELECT payload_json FROM a9_events WHERE turn_id=? AND event_type='tool_end' ORDER BY id").all(result.continuation.turnId) as any[];
    expect(JSON.parse(events[0].payload_json).data.result).toContain('ENOENT');
  } finally { await f.close(); }
});
it('successful read accepts ./ alias through the actual workspace before fresh write', async () => {
  const f = await setup({ sequence: [{ name: 'read', args: { path: 'note.txt' } }, { name: 'write', args: { path: 'note.txt', content: 'fresh' } }] });
  try { seed(f, 'edit', { path: './note.txt' }); await f.click(f.fact()); expect(fs.readFileSync(path.join(f.workspaceRoot, 'note.txt'), 'utf8')).toBe('fresh'); }
  finally { await f.close(); }
});
it('directory read and parent list stay blocked until the exact directory is successfully listed', async () => {
  const f = await setup({ sequence: [{ name: 'read', args: { path: 'dir' } }, { name: 'list', args: { path: '.' } }, { name: 'write', args: { path: 'blocked.txt', content: 'unsafe' } }, { name: 'list', args: { path: './dir' } }, { name: 'write', args: { path: 'fresh.txt', content: 'fresh' } }] });
  try {
    fs.mkdirSync(path.join(f.workspaceRoot, 'dir')); seed(f, 'delete', { path: 'dir' }); await f.click(f.fact());
    expect(fs.existsSync(path.join(f.workspaceRoot, 'blocked.txt'))).toBe(false); expect(fs.readFileSync(path.join(f.workspaceRoot, 'fresh.txt'), 'utf8')).toBe('fresh');
  } finally { await f.close(); }
});
it.each([true, false])('unknown move requires both source and destination observations (source exists=%s)', async (sourceExists) => {
  const existing = sourceExists ? 'source.txt' : 'destination.txt', absent = sourceExists ? 'destination.txt' : 'source.txt';
  const f = await setup({ sequence: [{ name: 'read', args: { path: existing } }, { name: 'write', args: { path: 'blocked.txt', content: 'unsafe' } }, { name: 'read', args: { path: absent } }, { name: 'write', args: { path: 'fresh.txt', content: 'fresh' } }] });
  try {
    fs.writeFileSync(path.join(f.workspaceRoot, existing), 'current', 'utf8'); seed(f, 'move', { source: 'source.txt', destination: 'destination.txt' }); await f.click(f.fact());
    expect(fs.existsSync(path.join(f.workspaceRoot, 'blocked.txt'))).toBe(false); expect(fs.readFileSync(path.join(f.workspaceRoot, 'fresh.txt'), 'utf8')).toBe('fresh');
  } finally { await f.close(); }
});
it('a foreground Shell that ended with residueRisk keeps the continuation opaque until a verified list', async () => {
  const f = await setup({ sequence: [{ name: 'write', args: { path: 'blocked-1.txt', content: 'unsafe' } }, { name: 'read', args: { path: 'note.txt' } },
    { name: 'write', args: { path: 'blocked-2.txt', content: 'unsafe' } }, { name: 'list', args: { path: '.' } }, { name: 'write', args: { path: 'fresh.txt', content: 'fresh' } }] });
  try {
    seed(f, 'shell', { command: 'stop dev server' });
    f.db.prepare("INSERT INTO a9_events(session_id,turn_id,kind,event_type,payload_json,created_at) VALUES(?,'old-turn','tool','tool_end',?,'2026-01-01')").run(f.fact().conversationId, JSON.stringify({ data: { toolName: 'shell', callId: 'unknown-shell', residueRisk: true, result: 'process tree cleanup unconfirmed' } }));
    expect(f.fact().unknownResults).toEqual([{ toolName: 'shell', callId: 'unknown-shell', status: 'result_unknown', paths: [] }]);
    const result = await f.click(f.fact()); expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(f.workspaceRoot, 'blocked-1.txt'))).toBe(false); expect(fs.existsSync(path.join(f.workspaceRoot, 'blocked-2.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(f.workspaceRoot, 'fresh.txt'), 'utf8')).toBe('fresh');
  } finally { await f.close(); }
});
it('normal and paged conversation show the original user goal before, after continuation and restart', async () => {
  const f = await setup();
  try {
    const check = () => { for (const conversationPage of [false, true]) expect(f.runtime.getSnapshot({ conversationPage }).conversation[0].requestPrompt).toBe('修复 note.txt'); };
    check(); const result = await f.click(f.fact()); check(); await f.restart(); check();
    const audit: any = f.db.prepare("SELECT payload_json FROM a9_events WHERE turn_id=? AND event_type='turn_started'").get(result.continuation.turnId);
    expect(JSON.parse(audit.payload_json).data.userPrompt).toContain('用户主动请求继续原任务');
    expect(f.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='conversation.request'").get()).toEqual({ n: 1 });
    const checkpoint: any = f.db.prepare('SELECT payload_json FROM a9_checkpoints WHERE turn_id=?').get(result.continuation.turnId);
    expect(JSON.parse(checkpoint.payload_json).requestPrompt).toBe('修复 note.txt');
    const intent: any = f.db.prepare("SELECT payload_json FROM a9_events WHERE event_type='task_continue_requested'").get();
    expect(JSON.parse(intent.payload_json).schemaVersion).toBe(1);
  } finally { await f.close(); }
});
it('after original-request retention a legacy generated goal cannot nest during retry or restart', async () => {
  const f = await setup({ fail: true });
  try {
    const old = f.fact(), first = await f.click(old);
    f.db.prepare("INSERT INTO a9_events(session_id,turn_id,kind,event_type,payload_json,created_at) VALUES(?,?,'model','conversation.request',?,'2026-10-11')").run(old.conversationId, first.continuation.turnId, JSON.stringify({ schemaVersion: 1, taskId: 'task', interruptedTurnId: 'old-turn', requestPrompt: 'generated JSON recovery' }));
    f.db.exec("DELETE FROM a9_events WHERE event_type='conversation.request' AND turn_id IS NULL");
    await f.restart(); const calls = f.requests.length;
    const result = await f.click({ ...old, interruptedTurnId: first.continuation.turnId });
    expect(result.error.code).toBe('A9_RECOVERY_GOAL_UNAVAILABLE'); expect(f.requests).toHaveLength(calls);
    for (const conversationPage of [false, true]) expect(JSON.stringify(f.runtime.getSnapshot({ conversationPage }).conversation)).not.toContain('generated JSON recovery');
  } finally { await f.close(); }
});
