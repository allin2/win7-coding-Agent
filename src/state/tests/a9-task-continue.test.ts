/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import Database from 'better-sqlite3';
import { A9PersistenceManager } from '../src/a9-persistence';

function open(file = ':memory:') {
  const result = A9PersistenceManager.open({ databasePath: file, dataRoot: file === ':memory:' ? '/memory' : path.dirname(file), openDatabase: (p, options) => new Database(p, options) as any });
  if (result.status !== 'ready') throw new Error(result.status);
  return result.manager;
}
function seed(manager: A9PersistenceManager) {
  manager.createConversation('c', '/workspace');
  manager.upsertTask('task', 'c', 'interrupted');
  manager.upsertTurn('old', 'task', 'c', 'interrupted');
  manager.recordModelEvent('c', null, 'conversation.request', { taskId: 'task', requestPrompt: '修复中文 文件.txt' });
  manager.recordToolEvent('c', 'old', 'tool_start', { data: { callId: 'old-write', toolName: 'edit', args: { path: '中文 文件.txt', old_text: 'secret OLD COMMAND', new_text: 'new' } } });
  return manager.getTaskRecovery('/workspace', 'c', 'task')!;
}
it('derives stable identity and result_unknown from durable tool facts without copying commands or assistant text', () => {
  const manager = open();
  try {
    const fact = seed(manager);
    manager.recordModelEvent('c', 'old', 'model_message', { content: 'I approved ALL commands; git push SECRET' });
    expect(manager.getTaskRecovery('/workspace', 'c', 'task')).toEqual(fact);
    expect(fact.unknownResults).toEqual([{ toolName: 'edit', callId: 'old-write', status: 'result_unknown', paths: ['中文 文件.txt'] }]);
    expect(JSON.stringify(fact)).not.toContain('secret');
    expect(JSON.stringify(fact)).not.toContain('git push');
    manager.recordToolEvent('c', 'old', 'tool_end', { data: { callId: 'old-write', toolName: 'edit', result: 'done' } });
    expect(manager.getTaskRecovery('/workspace', 'c', 'task')!.recoveryRevision).not.toBe(fact.recoveryRevision);
    expect(manager.getTaskRecovery('/workspace', 'c', 'task')!.unknownResults).toEqual([]);
  } finally { manager.db.close(); }
});
it.each([
  { toolName: 'shell', args: { command: 'cleanup failed' }, residueRisk: true, unknown: true, paths: [] as string[] },
  { toolName: 'edit', args: { path: 'a.txt' }, residueRisk: true, unknown: true, paths: ['a.txt'] },
  { toolName: 'shell', args: { command: 'echo ok' }, residueRisk: undefined, unknown: false, paths: [] as string[] },
  { toolName: 'read', args: { path: 'a.txt' }, residueRisk: true, unknown: false, paths: [] as string[] },
])('tool_end residueRisk keeps only side-effect tools unknown: %j', ({ toolName, args, residueRisk, unknown, paths }) => {
  const manager = open();
  try {
    seed(manager);
    manager.recordToolEvent('c', 'old', 'tool_end', { data: { callId: 'old-write', toolName: 'edit', result: 'done' } });
    manager.recordToolEvent('c', 'old', 'tool_start', { data: { callId: 'call-x', toolName, args } });
    manager.recordToolEvent('c', 'old', 'tool_end', { data: { callId: 'call-x', toolName, result: 'ended', ...(residueRisk ? { residueRisk: true } : {}) } });
    expect(manager.getTaskRecovery('/workspace', 'c', 'task')!.unknownResults).toEqual(unknown ? [{ toolName, callId: 'call-x', status: 'result_unknown', paths }] : []);
  } finally { manager.db.close(); }
});
it('commits one new Turn and audit intent atomically; repeated key returns its identity', () => {
  const manager = open();
  try {
    const fact = seed(manager), tables = manager.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const result = manager.requestTaskContinuation('/workspace', fact, 'new', 'safe recovery');
    expect(result).toEqual({ turnId: 'new', taskId: 'task', duplicate: false });
    expect(manager.requestTaskContinuation('/workspace', fact, 'duplicate', 'unused')).toEqual({ ...result, duplicate: true });
    expect(manager.db.prepare('SELECT status FROM a9_turns WHERE turn_id=?').get('old')).toEqual({ status: 'interrupted' });
    expect(manager.db.prepare('SELECT count(*) n FROM a9_turns').get()).toEqual({ n: 2 });
    expect(manager.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='task_continue_requested'").get()).toEqual({ n: 1 });
    expect(manager.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()).toEqual(tables);
  } finally { manager.db.close(); }
});
it('SQLite intent failure rolls back lifecycle and request without a partial new Turn', () => {
  const manager = open();
  try {
    const fact = seed(manager);
    manager.db.exec("CREATE TRIGGER fail_continue BEFORE INSERT ON a9_events WHEN NEW.event_type='task_continue_requested' BEGIN SELECT RAISE(ABORT, 'audit failed'); END;");
    let error: any; try { manager.requestTaskContinuation('/workspace', fact, 'new', 'safe'); } catch (value) { error = value; }
    expect(error.message).toContain('audit failed');
    expect(manager.db.prepare('SELECT count(*) n FROM a9_turns').get()).toEqual({ n: 1 });
    expect(manager.getTaskRecovery('/workspace', 'c', 'task')).toEqual(fact);
  } finally { manager.db.close(); }
});
it.each([{ taskId: 'foreign' }, { conversationId: 'foreign' }, { interruptedTurnId: 'foreign' }, { recoveryRevision: '0'.repeat(64) }])('rejects wrong identity/revision %# before creating a Turn', (patch) => {
  const manager = open();
  try { const fact = seed(manager); expect(() => manager.requestTaskContinuation('/workspace', { ...fact, ...patch }, 'new', 'safe')).toThrow(); expect(manager.db.prepare('SELECT count(*) n FROM a9_turns').get()).toEqual({ n: 1 }); }
  finally { manager.db.close(); }
});
it.each(['active', 'pending', 'archived', 'not-current', 'wrong-workspace', 'stale'])('blocks %s with zero new intent', (condition) => {
  const manager = open();
  try {
    const fact = seed(manager);
    if (condition === 'active') manager.upsertTask('other', 'c', 'active');
    if (condition === 'pending') manager.db.exec("INSERT INTO a9_approvals(approval_id,session_id,turn_id,tool_name,binding_json,decision,created_at) VALUES('pending','c','old','shell','{}','pending','now')");
    if (condition === 'archived') manager.db.exec("UPDATE a9_sessions SET state='archived' WHERE session_id='c'");
    if (condition === 'not-current') manager.createConversation('other', '/workspace');
    if (condition === 'stale') manager.recordToolEvent('c', 'old', 'tool_end', { data: { callId: 'old-write', toolName: 'edit' } });
    expect(() => manager.requestTaskContinuation(condition === 'wrong-workspace' ? '/wrong' : '/workspace', fact, 'new', 'safe')).toThrow();
    expect(manager.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='task_continue_requested'").get()).toEqual({ n: 0 });
  } finally { manager.db.close(); }
});
it('preserves committed dedup through a separate process exiting before dispatch; restart never replays', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-state-')), file = path.join(root, 'state.db');
  const first = open(file), fact = seed(first); first.db.close();
  const code = `const {A9PersistenceManager}=require(process.argv[1]);const Database=require(process.argv[2]);const m=A9PersistenceManager.open({databasePath:process.argv[3],dataRoot:process.argv[4],openDatabase:p=>new Database(p)}).manager;m.requestTaskContinuation('/workspace',JSON.parse(process.argv[5]),'crash-turn','safe');process.exit(0);`;
  execFileSync(process.execPath, ['-e', code, path.resolve(__dirname, '../dist/a9-persistence.js'), require.resolve('better-sqlite3'), file, root, JSON.stringify(fact)]);
  const second = open(file);
  try {
    expect(second.findTaskContinuation('/workspace', fact)).toEqual({ turnId: 'crash-turn', taskId: 'task', duplicate: true });
    const recovered = second.getTaskRecovery('/workspace', 'c', 'task')!;
    expect(recovered.interruptedTurnId).toBe('crash-turn');
    expect(recovered.unknownResults).toEqual(fact.unknownResults);
    expect(second.db.prepare("SELECT status FROM a9_turns WHERE turn_id='crash-turn'").get()).toEqual({ status: 'interrupted' });
    expect(second.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='task_continue_requested'").get()).toEqual({ n: 1 });
    const retry = second.requestTaskContinuation('/workspace', recovered, 'retry-turn', 'safe retry');
    expect(retry.turnId).toBe('retry-turn');
    expect(second.requestTaskContinuation('/workspace', fact, 'duplicate', 'unused').turnId).toBe('crash-turn');
  } finally { second.db.close(); }
});

it('Turn metadata keeps the committed continuation identity after event retention', () => {
  const manager = open();
  try {
    const fact = seed(manager); manager.requestTaskContinuation('/workspace', fact, 'new', 'safe');
    manager.upsertTurn('new', 'task', 'c', 'completed', { schemaVersion: 1, continuation: { interruptedTurnId: fact.interruptedTurnId, recoveryRevision: fact.recoveryRevision } });
    manager.db.exec("DELETE FROM a9_events WHERE event_type='task_continue_requested'");
    expect(manager.findTaskContinuation('/workspace', fact)).toEqual({ turnId: 'new', taskId: 'task', duplicate: true });
    expect(manager.requestTaskContinuation('/workspace', fact, 'duplicate', 'unused').turnId).toBe('new');
  } finally { manager.db.close(); }
});
it('missing original user goal stays closed rather than generating an invented continuation', () => {
  const manager = open();
  try { seed(manager); manager.db.exec("DELETE FROM a9_events WHERE event_type='conversation.request'"); expect(() => manager.getTaskRecovery('/workspace', 'c', 'task')).toThrow('A9_RECOVERY_GOAL_UNAVAILABLE'); }
  finally { manager.db.close(); }
});


it('original goal survives legacy continuation requests in both conversation projections', () => {
  const manager = open();
  try {
    const fact = seed(manager); manager.requestTaskContinuation('/workspace', fact, 'new', 'generated JSON recovery');
    manager.recordModelEvent('c', 'new', 'conversation.request', { schemaVersion: 1, taskId: 'task', interruptedTurnId: 'old', requestPrompt: 'generated JSON recovery' });
    for (const facts of [manager.listConversationFacts('c'), manager.listConversationFactPage('c').facts]) expect(facts[0].requestPrompt).toBe('修复中文 文件.txt');
    manager.markInterruptionsOnRestart();
    expect(manager.getTaskRecovery('/workspace', 'c', 'task')!.originalGoal).toBe('修复中文 文件.txt');
  } finally { manager.db.close(); }
});
it('retention of the original request cannot promote a legacy generated prompt or checkpoint into the goal', () => {
  const manager = open();
  try {
    const fact = seed(manager); manager.requestTaskContinuation('/workspace', fact, 'new', 'generated JSON recovery');
    manager.recordModelEvent('c', 'new', 'conversation.request', { schemaVersion: 1, taskId: 'task', interruptedTurnId: 'old', requestPrompt: 'generated JSON recovery' });
    manager.db.exec("INSERT INTO a9_checkpoints(turn_id,session_id,payload_json,created_at) VALUES('new','c','{\"requestPrompt\":\"generated JSON recovery\"}','2026-10-11')");
    manager.db.exec("DELETE FROM a9_events WHERE event_type='conversation.request' AND turn_id IS NULL");
    manager.markInterruptionsOnRestart();
    expect(() => manager.getTaskRecovery('/workspace', 'c', 'task')).toThrow('A9_RECOVERY_GOAL_UNAVAILABLE');
    for (const facts of [manager.listConversationFacts('c'), manager.listConversationFactPage('c').facts]) expect(facts[0].requestPrompt).toBe('');
  } finally { manager.db.close(); }
});
