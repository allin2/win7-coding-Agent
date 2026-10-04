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
