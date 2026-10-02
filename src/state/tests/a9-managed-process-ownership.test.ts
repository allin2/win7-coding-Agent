/// <reference path="./better-sqlite3.d.ts" />
import Database from 'better-sqlite3';
import { A9PersistenceManager } from '../src/a9-persistence';
function setup() {
  const open = A9PersistenceManager.open({ databasePath: ':memory:', dataRoot: '/memory', openDatabase: () => new Database(':memory:') as any });
  if (open.status !== 'ready') throw new Error(open.status); const p = open.manager;
  p.createConversation('c', '/w'); p.upsertTask('task', 'c', 'active'); p.upsertTurn('turn', 'task', 'c', 'active');
  const fact = { handleId: 'h', workspacePath: '/w', command: 'safe', cwd: '/w', startedAt: '2026-10-03', lastProbeStatus: 'running', cleanupRequired: true, pid: 345 };
  const ownership = { schemaVersion: 1 as const, owner: { workspace: '/w', conversationId: 'c', taskId: 'task', turnId: 'turn', toolCallId: 'call' }, requestId: 'request', ownershipState: 'owned' as const };
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
