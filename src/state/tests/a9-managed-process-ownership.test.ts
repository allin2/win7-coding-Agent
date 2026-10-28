/// <reference path="./better-sqlite3.d.ts" />
import Database from 'better-sqlite3';
import * as path from 'path';
import { A9PersistenceManager } from '../src/a9-persistence';
function testPlatform(value: NodeJS.Platform) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { ...original, value });
  return { restore: () => Object.defineProperty(process, 'platform', original) };
}
function setup(workspace = '/w') {
  const open = A9PersistenceManager.open({ databasePath: ':memory:', dataRoot: '/memory', openDatabase: () => new Database(':memory:') as any });
  if (open.status !== 'ready') throw new Error(open.status); const p = open.manager;
  p.createConversation('c', workspace); p.upsertTask('task', 'c', 'active'); p.upsertTurn('turn', 'task', 'c', 'active');
  const fact = { handleId: 'h', workspacePath: workspace, command: 'safe', cwd: workspace, startedAt: '2026-10-03', lastProbeStatus: 'running', cleanupRequired: true, pid: 345 };
  const ownership = { schemaVersion: 1 as const, owner: { workspace, conversationId: 'c', taskId: 'task', turnId: 'turn', toolCallId: 'call' }, requestId: 'request', ownershipState: 'owned' as const };
  return { p, fact, ownership };
}
it('persists owner plus fact atomically and freezes origin across a completed turn', () => {
  const { p, fact, ownership } = setup(); try {
    p.recordManagedOwnership(fact, ownership);
    expect(p.listManagedProcesses('/w')[0]).toMatchObject({ lastProbeStatus: 'running', cleanupRequired: true });
    p.upsertTurn('turn', 'task', 'c', 'completed');
    p.recordManagedOwnership({ ...fact, lastProbeStatus: 'exited', cleanupRequired: false }, ownership);
    expect(p.getManagedOwnership('h')).toEqual(ownership);
    expect(p.listSessionEvents('c').filter((e) => e.eventType === 'managed_process_ownership')).toHaveLength(1);
    expect(() => p.recordManagedOwnership(fact, { ...ownership, requestId: 'replacement' })).toThrow('OWNER_IMMUTABLE');
    expect(p.listManagedProcesses('/w')[0].lastProbeStatus).toBe('exited');
  } finally { p.db.close(); }
});

// These are controlled Windows path tests on the local host, not target-machine evidence.
it.each([
  'C:\\Users\\A9 Builder\\中文 空格%#\\Project',
  'c:/Users/A9 Builder/中文 空格%#/other/../Project/',
  '\\\\Server\\Share\\中文 空格%#\\Project',
  'C:\\Users\\Ä Builder\\Project',
])('persists Windows display paths against canonical session ownership (%s)', (display) => {
  const platform = testPlatform('win32');
  const canonical = path.win32.resolve(display.replace(/\//g, '\\')).toLowerCase();
  const { p, fact, ownership } = setup(canonical);
  try {
    p.recordManagedOwnership({ ...fact, workspacePath: display }, ownership);
    expect(p.getManagedOwnership('h')).toEqual(ownership);
    expect(p.listManagedProcesses(display)).toHaveLength(1);
    expect(p.listManagedProcesses(canonical)).toHaveLength(1);
    expect(p.listManagedProcesses(canonical + '-other')).toEqual([]);
    expect(p.db.prepare('SELECT workspace_path FROM a9_managed_processes').get()).toEqual({ workspace_path: display });
    p.recordManagedOwnership({ ...fact, workspacePath: display, lastProbeStatus: 'exited', cleanupRequired: false }, ownership);
    expect(p.listSessionEvents('c')).toHaveLength(1);
    expect(p.listManagedProcesses(canonical)[0].lastProbeStatus).toBe('exited');
  } finally { p.db.close(); platform.restore(); }
});

it('finds legacy Windows process facts under an equivalent path without rewriting rows', () => {
  const platform = testPlatform('win32');
  const { p, fact } = setup('c:\\users\\a9 builder\\project');
  try {
    const display = 'C:/Users/A9 Builder/Project/';
    p.recordManagedProcess({ ...fact, workspacePath: display, lastProbeStatus: 'running_unknown', cleanupRequired: true });
    p.recordManagedProcess({ ...fact, handleId: 'other', workspacePath: 'C:\\Users\\A9 Builder\\Other' });
    expect(p.listManagedProcesses('c:\\users\\a9 builder\\project')).toEqual([
      expect.objectContaining({ handleId: 'h', cleanupRequired: true }),
    ]);
    expect(p.db.prepare('SELECT workspace_path FROM a9_managed_processes WHERE handle_id=?').get('h')).toEqual({ workspace_path: display });
  } finally { p.db.close(); platform.restore(); }
});

it.each(['workspace', 'owner-workspace', 'conversation', 'task', 'turn', 'archived'])('rejects Windows wrong ownership atomically (%s)', (bad) => {
  const platform = testPlatform('win32');
  const canonical = 'c:\\users\\a9 builder\\project';
  const { p, fact, ownership } = setup(canonical);
  try {
    const owner = { ...ownership.owner };
    if (bad === 'owner-workspace') owner.workspace += '-other';
    if (bad === 'conversation') owner.conversationId = 'other';
    if (bad === 'task') owner.taskId = 'other';
    if (bad === 'turn') owner.turnId = 'other';
    if (bad === 'archived') p.db.prepare("UPDATE a9_sessions SET state='archived' WHERE session_id='c'").run();
    const display = 'C:\\Users\\A9 Builder\\Project' + (bad === 'workspace' ? '-other' : '');
    expect(() => p.recordManagedOwnership({ ...fact, workspacePath: display }, { ...ownership, owner })).toThrow('OWNER_MISMATCH');
    expect(p.db.prepare('SELECT count(*) AS n FROM a9_managed_processes').get()).toEqual({ n: 0 });
    expect(p.countEvents()).toBe(0);
  } finally { p.db.close(); platform.restore(); }
});

it('keeps POSIX case-sensitive for shared conversation and managed-process ownership checks', () => {
  const platform = testPlatform('linux');
  const { p, fact, ownership } = setup('/w');
  try {
    expect(() => p.renameConversation('c', 'wrong workspace', '/W')).toThrow('WORKSPACE_MISMATCH');
    expect(() => p.recordManagedOwnership({ ...fact, workspacePath: '/W' }, ownership)).toThrow('OWNER_MISMATCH');
    expect(p.listConversations('/w')[0].title).toBe('新对话');
    p.db.prepare("UPDATE a9_sessions SET state='archived' WHERE session_id='c'").run();
    expect(() => p.restoreConversation('c', '/W')).toThrow('WORKSPACE_MISMATCH');
    expect(p.listConversations('/w')[0].state).toBe('archived');
    expect(p.restoreConversation('c', '/w').state).toBe('active');
    expect(p.countEvents()).toBe(0);
  } finally { p.db.close(); platform.restore(); }
});
it('requires prior release intent and retains unknown without declaring released', () => {
  const { p, fact, ownership } = setup(); try {
    p.recordManagedOwnership(fact, ownership);
    expect(() => p.recordManagedOwnership(fact, { ...ownership, ownershipState: 'released', releaseId: 'r' })).toThrow('INTENT_MISSING');
    p.recordManagedOwnership(fact, { ...ownership, ownershipState: 'release_intent', releaseId: 'r' });
    p.recordManagedOwnership(fact, { ...ownership, ownershipState: 'release_unknown', releaseId: 'r' });
    expect(p.getManagedOwnership('h')?.ownershipState).toBe('release_unknown');
    expect(p.listManagedProcesses('/w')[0].cleanupRequired).toBe(true);
  } finally { p.db.close(); }
});
it('rejects wrong turn/conversation/workspace without changing the fact table', () => {
  const { p, fact, ownership } = setup(); try {
    for (const owner of [{ ...ownership.owner, turnId: 'other' }, { ...ownership.owner, conversationId: 'other' }]) {
      expect(() => p.recordManagedOwnership(fact, { ...ownership, owner })).toThrow('OWNER_MISMATCH');
    }
    expect(() => p.recordManagedOwnership({ ...fact, workspacePath: '/other' }, ownership)).toThrow('OWNER_MISMATCH');
    expect(p.listManagedProcesses('/w')).toEqual([]); expect(p.countEvents()).toBe(0);
  } finally { p.db.close(); }
});
it('release facts are terminal and repeat writes do not duplicate events', () => {
  const { p, fact, ownership } = setup(); try {
    p.recordManagedOwnership(fact, ownership);
    p.recordManagedOwnership(fact, { ...ownership, ownershipState: 'release_intent', releaseId: 'r' });
    const released = { ...ownership, ownershipState: 'released' as const, releaseId: 'r' };
    p.recordManagedOwnership({ ...fact, lastProbeStatus: 'released', cleanupRequired: false }, released);
    p.recordManagedOwnership({ ...fact, lastProbeStatus: 'released', cleanupRequired: false }, released);
    expect(p.listSessionEvents('c')).toHaveLength(3);
    expect(() => p.recordManagedOwnership(fact, ownership)).toThrow('RELEASE_TERMINAL');
  } finally { p.db.close(); }
});

function dispositionSetup() {
  const { p, fact, ownership } = setup();
  p.acquireWorkspaceLock('/w', 'window');
  p.recordManagedOwnership({ ...fact, lastProbeStatus: 'exited' }, { ...ownership, recoveryStatus: 'exited' });
  const current = p.getManagedProcessRecoveryIdentity('h');
  const input = { workspace: '/w', conversationId: 'c', lockOwnerId: 'window', handleId: 'h', recoveryRevision: current.recoveryRevision,
    identity: { owner: current.owner, requestId: current.requestId, pid: current.pid, startedAt: current.startedAt },
    pidProbe: { pid: current.pid, status: 'absent', checkedAt: new Date().toISOString() } };
  return { p, input };
}
it('A9-34 commits disposition and event together with stable revision and idempotent result', () => {
  const { p, input } = dispositionSetup();
  try {
    const signature = p.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
    expect(p.getManagedProcessRecoveryIdentity('h').recoveryRevision).toBe(input.recoveryRevision);
    const result = p.dismissRecoveredManagedProcess(input);
    expect(result).toMatchObject({ schemaVersion: 1, disposition: 'user_attested_after_restart', handleId: 'h', requestId: 'request', recoveryRevision: input.recoveryRevision,
      owner: input.identity.owner, pidProbe: { status: 'absent', pid: 345 } });
    expect(p.listManagedProcesses('/w')[0]).toMatchObject({ lastProbeStatus: 'user_dismissed', cleanupRequired: false });
    expect(p.getManagedOwnership('h')?.ownershipState).toBe('owned');
    const events = p.listSessionEvents('c').filter((event) => event.eventType === 'managed_process_disposition');
    expect(events).toEqual([expect.objectContaining({ kind: 'tool', turnId: 'turn', payload: expect.objectContaining({ disposition: 'user_attested_after_restart' }) })]);
    expect(p.dismissRecoveredManagedProcess({ ...input, identity: undefined, pidProbe: undefined })).toEqual(result);
    expect(p.listSessionEvents('c').filter((event) => event.eventType === 'managed_process_disposition')).toHaveLength(1);
    expect(() => p.dismissRecoveredManagedProcess({ ...input, recoveryRevision: 'b'.repeat(64) })).toThrow('RECOVERY_STALE');
    expect(p.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name").all()).toEqual(signature);
  } finally { p.db.close(); }
});
it.each(['revision', 'fact-drift', 'wrong-workspace', 'wrong-conversation', 'lock', 'unknown', 'owner-missing', 'owner-incomplete', 'request-missing', 'archived',
  'origin-missing', 'origin-workspace', 'fact-workspace', 'release_intent', 'release_unknown', 'released', 'not-cleanup',
  'memory-owner', 'memory-request', 'memory-pid', 'memory-start', 'pid-invalid', 'probe-alive', 'probe-unknown', 'probe-pid', 'probe-time'])('A9-34 rejects atomic qualification: %s', (bad) => {
  const { p, input } = dispositionSetup();
  try {
    if (bad === 'revision') input.recoveryRevision = 'b'.repeat(64);
    if (bad === 'fact-drift') p.db.prepare("UPDATE a9_managed_processes SET started_at='changed'").run();
    if (bad === 'wrong-workspace') { input.workspace = '/other'; p.acquireWorkspaceLock('/other', 'window'); }
    if (bad === 'wrong-conversation') input.conversationId = 'other';
    if (bad === 'lock') p.db.prepare("UPDATE a9_workspace_locks SET owner_id='other'").run();
    if (bad === 'unknown') input.handleId = 'unknown';
    if (bad === 'owner-missing') p.db.prepare("DELETE FROM a9_events WHERE event_type='managed_process_ownership'").run();
    if (['owner-incomplete', 'request-missing', 'origin-missing', 'release_intent', 'release_unknown', 'released'].includes(bad)) {
      const record = p.getManagedOwnership('h')!;
      if (bad === 'owner-incomplete') record.owner.toolCallId = '';
      else if (bad === 'request-missing') record.requestId = '';
      else if (bad === 'origin-missing') record.owner.turnId = 'missing';
      else record.ownershipState = bad as any;
      p.db.prepare("UPDATE a9_events SET payload_json=? WHERE event_type='managed_process_ownership'").run(JSON.stringify({ handleId: 'h', ...record }));
    }
    if (bad === 'archived') p.db.prepare("UPDATE a9_sessions SET state='archived'").run();
    if (bad === 'origin-workspace') p.db.prepare("UPDATE a9_sessions SET workspace_path='/other'").run();
    if (bad === 'fact-workspace') p.db.prepare("UPDATE a9_managed_processes SET workspace_path='/other'").run();
    if (bad === 'not-cleanup') {
      p.db.prepare("UPDATE a9_managed_processes SET last_probe_status='exited'").run();
      input.recoveryRevision = p.getManagedProcessRecoveryIdentity('h').recoveryRevision;
    }
    if (bad === 'memory-pid') input.identity.pid++;
    if (bad === 'memory-owner') input.identity.owner = { ...input.identity.owner, toolCallId: 'other' };
    if (bad === 'memory-request') input.identity.requestId = 'other';
    if (bad === 'memory-start') input.identity.startedAt = 'other';
    if (bad === 'pid-invalid') {
      p.db.prepare('UPDATE a9_managed_processes SET pid=-1').run();
      input.identity.pid = input.pidProbe.pid = -1;
      input.recoveryRevision = p.getManagedProcessRecoveryIdentity('h').recoveryRevision;
    }
    if (bad === 'probe-alive') input.pidProbe.status = 'alive';
    if (bad === 'probe-unknown') input.pidProbe.status = 'unknown';
    if (bad === 'probe-pid') input.pidProbe.pid++;
    if (bad === 'probe-time') input.pidProbe.checkedAt = 'invalid';
    const before = p.db.prepare('SELECT * FROM a9_managed_processes').all(), count = p.countEvents();
    const code = bad === 'lock' ? 'A9_WORKSPACE_LOCKED'
      : bad === 'unknown' ? 'A9_MANAGED_HANDLE_UNKNOWN'
      : ['wrong-workspace', 'wrong-conversation', 'archived', 'origin-missing', 'origin-workspace', 'fact-workspace'].includes(bad) ? 'A9_MANAGED_HANDLE_WRONG_OWNER'
      : ['owner-missing', 'owner-incomplete', 'request-missing', 'release_intent', 'release_unknown', 'released'].includes(bad) ? 'A9_MANAGED_OWNERSHIP_UNCONFIRMED'
      : bad === 'not-cleanup' ? 'A9_MANAGED_NOT_RECOVERED_CLEANUP'
      : bad.startsWith('probe-') || bad === 'pid-invalid' ? 'A9_MANAGED_PID_PROBE_UNKNOWN' : 'A9_MANAGED_RECOVERY_STALE';
    expect(() => p.dismissRecoveredManagedProcess(input)).toThrow(code);
    expect(p.db.prepare('SELECT * FROM a9_managed_processes').all()).toEqual(before);
    expect(p.countEvents()).toBe(count);
  } finally { p.db.close(); }
});
it.each(['event', 'update'])('A9-34 rolls back fact and required audit on %s failure', (where) => {
  const { p, input } = dispositionSetup();
  try {
    p.db.prepare(where === 'event'
      ? "CREATE TRIGGER fail_disposition AFTER INSERT ON a9_events WHEN NEW.event_type='managed_process_disposition' BEGIN SELECT RAISE(FAIL,'disposition audit failed'); END"
      : "CREATE TRIGGER fail_disposition AFTER UPDATE ON a9_managed_processes WHEN NEW.last_probe_status='user_dismissed' BEGIN SELECT RAISE(FAIL,'disposition update failed'); END").run();
    const count = p.countEvents();
    expect(() => p.dismissRecoveredManagedProcess(input)).toThrow('disposition');
    expect(p.listManagedProcesses('/w')[0]).toMatchObject({ lastProbeStatus: 'cleanup_required', cleanupRequired: true });
    expect(p.countEvents()).toBe(count); expect(p.getManagedProcessDisposition('h')).toBeUndefined();
  } finally { p.db.close(); }
});

it.each(['owner', 'request', 'pid', 'start', 'state'])('A9-34 idempotent retry rejects changed persisted identity: %s', (changed) => {
  const { p, input } = dispositionSetup();
  try {
    p.dismissRecoveredManagedProcess(input);
    if (changed === 'owner' || changed === 'request') {
      const record = p.getManagedOwnership('h')!;
      if (changed === 'owner') record.owner.toolCallId = 'changed';
      else record.requestId = 'changed';
      p.db.prepare("UPDATE a9_events SET payload_json=? WHERE event_type='managed_process_ownership'").run(JSON.stringify({ handleId: 'h', ...record }));
    }
    if (changed === 'pid') p.db.prepare('UPDATE a9_managed_processes SET pid=346').run();
    if (changed === 'start') p.db.prepare("UPDATE a9_managed_processes SET started_at='changed'").run();
    if (changed === 'state') p.db.prepare("UPDATE a9_managed_processes SET last_probe_status='cleanup_required'").run();
    const count = p.countEvents();
    expect(() => p.dismissRecoveredManagedProcess(input)).toThrow('A9_MANAGED_RECOVERY_STALE');
    expect(p.countEvents()).toBe(count);
  } finally { p.db.close(); }
});
