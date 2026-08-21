import { A8SessionCatalog } from '../../src/a8-session-catalog';

function ids(): () => string {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}`;
}

describe('A8 session and Goal catalog', () => {
  it('owns one Thread per Session and globally unique Turn/Task/Run identities', () => {
    const catalog = new A8SessionCatalog({ idFactory: ids(), clock: () => '2026-08-20T00:00:00.000Z' });
    const workspace = catalog.ensureWorkspace('C:\\工作 区');
    const first = catalog.createSession({ workspaceId: workspace.workspaceId, label: '一' });
    const second = catalog.createSession({ workspaceId: workspace.workspaceId, label: '二' });
    const turn1 = catalog.beginTurn(first.sessionId);
    const turn2 = catalog.beginTurn(first.sessionId);
    const other = catalog.beginTurn(second.sessionId);

    expect(first.threadId).not.toBe(second.threadId);
    expect([turn1.ordinal, turn2.ordinal, other.ordinal]).toEqual([1, 2, 1]);
    expect(new Set([turn1.turnId, turn1.taskId, turn1.runId, turn2.turnId, other.turnId]).size).toBe(5);
    expect(catalog.queryFacts(first.sessionId).every((fact) => fact.threadId === first.threadId)).toBe(true);
  });

  it('commits Goal revision and event atomically and restores the same projection', () => {
    const catalog = new A8SessionCatalog({ idFactory: ids(), clock: () => '2026-08-20T00:00:00.000Z' });
    const workspace = catalog.ensureWorkspace('C:\\repo');
    const session = catalog.createSession({ workspaceId: workspace.workspaceId, label: '会话' });
    const first = catalog.setGoal({ sessionId: session.sessionId, text: '完成上下文引用', expectedRevision: 0 });
    expect(() => catalog.setGoal({ sessionId: session.sessionId, text: '冲突', expectedRevision: 0 }))
      .toThrow('GOAL_REVISION_CONFLICT');
    expect(catalog.queryFacts(session.sessionId).filter((fact) => fact.type === 'goal.updated')).toHaveLength(1);
    const achieved = catalog.resolveGoal({ sessionId: session.sessionId, status: 'ACHIEVED', expectedRevision: first.revision });

    const restored = A8SessionCatalog.restore(catalog.snapshot(), { idFactory: ids() });
    expect(restored.getSession(session.sessionId)?.goal).toEqual(achieved);
    expect(restored.queryFacts(session.sessionId)).toEqual(catalog.queryFacts(session.sessionId));
  });

  it('archives without deleting and refuses new turns', () => {
    const catalog = new A8SessionCatalog({ idFactory: ids() });
    const workspace = catalog.ensureWorkspace('C:\\repo');
    const session = catalog.createSession({ workspaceId: workspace.workspaceId, label: '会话' });
    catalog.archiveSession(session.sessionId);
    expect(catalog.getSession(session.sessionId)?.status).toBe('ARCHIVED');
    expect(() => catalog.beginTurn(session.sessionId)).toThrow('SESSION_ARCHIVED');
  });

  it('fails closed on unknown snapshot versions and sequence gaps', () => {
    const catalog = new A8SessionCatalog({ idFactory: ids() });
    const workspace = catalog.ensureWorkspace('C:\\repo');
    catalog.createSession({ workspaceId: workspace.workspaceId, label: '会话' });
    const snapshot = catalog.snapshot();
    expect(() => A8SessionCatalog.restore({ ...snapshot, schemaVersion: 2 } as any)).toThrow('SNAPSHOT_VERSION_UNSUPPORTED');
    snapshot.facts[0].sequence = 2;
    expect(() => A8SessionCatalog.restore(snapshot)).toThrow('SNAPSHOT_SEQUENCE_INVALID');
  });
});
