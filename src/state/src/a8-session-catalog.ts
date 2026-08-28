import * as crypto from 'crypto';

export type A8SessionStatus = 'ACTIVE' | 'ARCHIVED';
export type A8GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'ABANDONED';

export interface A8GoalRecord {
  schemaVersion: 1;
  goalId: string;
  text: string;
  status: A8GoalStatus;
  revision: number;
  updatedAt: string;
}

export interface A8WorkspaceRecord {
  schemaVersion: 1;
  workspaceId: string;
  canonicalPath: string;
  createdAt: string;
}

export interface A8SessionRecord {
  schemaVersion: 1;
  sessionId: string;
  workspaceId: string;
  threadId: string;
  label: string;
  status: A8SessionStatus;
  createdAt: string;
  archivedAt?: string;
  turnCount: number;
  goal?: A8GoalRecord;
}

export interface A8TurnIdentity {
  turnId: string;
  taskId: string;
  runId: string;
  ordinal: number;
}

export interface A8SessionFact {
  schemaVersion: 1;
  eventId: string;
  sequence: number;
  sessionId: string;
  threadId: string;
  occurredAt: string;
  type: 'session.created' | 'session.archived' | 'turn.started' | 'goal.updated';
  payload: Record<string, unknown>;
}

export interface A8SessionCatalogSnapshot {
  schemaVersion: 1;
  workspaces: A8WorkspaceRecord[];
  sessions: A8SessionRecord[];
  facts: A8SessionFact[];
}

export interface A8SessionCatalogOptions {
  idFactory?: () => string;
  clock?: () => string;
}

/**
 * Versioned A8-02 session/Goal contract. It is deliberately storage-neutral:
 * A8-05 may persist the same snapshot/facts after its SQLite recovery gate.
 */
export class A8SessionCatalog {
  private readonly idFactory: () => string;
  private readonly clock: () => string;
  private readonly workspaces = new Map<string, A8WorkspaceRecord>();
  private readonly sessions = new Map<string, A8SessionRecord>();
  private readonly facts: A8SessionFact[] = [];

  constructor(options: A8SessionCatalogOptions = {}) {
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  ensureWorkspace(canonicalPath: string): A8WorkspaceRecord {
    const existing = Array.from(this.workspaces.values())
      .find((workspace) => workspace.canonicalPath === canonicalPath);
    if (existing) return clone(existing);
    const workspace: A8WorkspaceRecord = {
      schemaVersion: 1,
      workspaceId: this.nextId('workspace'),
      canonicalPath,
      createdAt: this.clock(),
    };
    this.workspaces.set(workspace.workspaceId, workspace);
    return clone(workspace);
  }

  createSession(input: { workspaceId: string; label: string }): A8SessionRecord {
    if (!this.workspaces.has(input.workspaceId)) throw catalogError('WORKSPACE_NOT_FOUND');
    const session: A8SessionRecord = {
      schemaVersion: 1,
      sessionId: this.nextId('session'),
      workspaceId: input.workspaceId,
      threadId: this.nextId('thread'),
      label: input.label,
      status: 'ACTIVE',
      createdAt: this.clock(),
      turnCount: 0,
    };
    const fact = this.fact(session, 'session.created', {
      workspaceId: session.workspaceId,
      label: session.label,
    });
    this.sessions.set(session.sessionId, session);
    this.facts.push(fact);
    return clone(session);
  }

  getSession(sessionId: string): A8SessionRecord | undefined {
    const session = this.sessions.get(sessionId);
    return session ? clone(session) : undefined;
  }

  getWorkspace(workspaceId: string): A8WorkspaceRecord | undefined {
    const workspace = this.workspaces.get(workspaceId);
    return workspace ? clone(workspace) : undefined;
  }

  listSessions(): A8SessionRecord[] {
    return Array.from(this.sessions.values(), clone)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  archiveSession(sessionId: string): A8SessionRecord {
    const session = this.requireActiveSession(sessionId);
    const archivedAt = this.clock();
    const next: A8SessionRecord = { ...session, status: 'ARCHIVED', archivedAt };
    const fact = this.fact(next, 'session.archived', { archivedAt });
    this.sessions.set(sessionId, next);
    this.facts.push(fact);
    return clone(next);
  }

  beginTurn(sessionId: string): A8TurnIdentity {
    const session = this.requireActiveSession(sessionId);
    const identity: A8TurnIdentity = {
      turnId: this.nextId('turn'),
      taskId: this.nextId('task'),
      runId: this.nextId('run'),
      ordinal: session.turnCount + 1,
    };
    const next = { ...session, turnCount: identity.ordinal };
    const fact = this.fact(next, 'turn.started', { ...identity });
    this.sessions.set(sessionId, next);
    this.facts.push(fact);
    return clone(identity);
  }

  setGoal(input: { sessionId: string; text: string; expectedRevision: number }): A8GoalRecord {
    const session = this.requireActiveSession(input.sessionId);
    const text = input.text.trim();
    if (!text || text.length > 2_000) throw catalogError('GOAL_INPUT_INVALID');
    const currentRevision = session.goal?.revision ?? 0;
    if (input.expectedRevision !== currentRevision) throw catalogError('GOAL_REVISION_CONFLICT');
    const goal: A8GoalRecord = {
      schemaVersion: 1,
      goalId: session.goal?.goalId ?? this.nextId('goal'),
      text,
      status: 'ACTIVE',
      revision: currentRevision + 1,
      updatedAt: this.clock(),
    };
    this.commitGoal(session, goal);
    return clone(goal);
  }

  resolveGoal(input: { sessionId: string; status: 'ACHIEVED' | 'ABANDONED'; expectedRevision: number }): A8GoalRecord {
    const session = this.requireActiveSession(input.sessionId);
    if (!session.goal || session.goal.status !== 'ACTIVE') throw catalogError('GOAL_NOT_ACTIVE');
    if (input.expectedRevision !== session.goal.revision) throw catalogError('GOAL_REVISION_CONFLICT');
    const goal: A8GoalRecord = {
      ...session.goal,
      status: input.status,
      revision: session.goal.revision + 1,
      updatedAt: this.clock(),
    };
    this.commitGoal(session, goal);
    return clone(goal);
  }

  queryFacts(sessionId?: string): A8SessionFact[] {
    return this.facts.filter((fact) => !sessionId || fact.sessionId === sessionId).map(clone);
  }

  snapshot(): A8SessionCatalogSnapshot {
    return {
      schemaVersion: 1,
      workspaces: Array.from(this.workspaces.values(), clone),
      sessions: this.listSessions(),
      facts: this.queryFacts(),
    };
  }

  static restore(snapshot: A8SessionCatalogSnapshot, options: A8SessionCatalogOptions = {}): A8SessionCatalog {
    validateSnapshot(snapshot);
    const catalog = new A8SessionCatalog(options);
    for (const workspace of snapshot.workspaces) catalog.workspaces.set(workspace.workspaceId, clone(workspace));
    for (const session of snapshot.sessions) catalog.sessions.set(session.sessionId, clone(session));
    catalog.facts.push(...snapshot.facts.map(clone));
    return catalog;
  }

  private commitGoal(session: A8SessionRecord, goal: A8GoalRecord): void {
    const next = { ...session, goal };
    const fact = this.fact(next, 'goal.updated', { goal });
    // All validation and fact construction happen before either mutation.
    this.sessions.set(session.sessionId, next);
    this.facts.push(fact);
  }

  private requireActiveSession(sessionId: string): A8SessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) throw catalogError('SESSION_NOT_FOUND');
    if (session.status !== 'ACTIVE') throw catalogError('SESSION_ARCHIVED');
    return session;
  }

  private fact(session: A8SessionRecord, type: A8SessionFact['type'], payload: Record<string, unknown>): A8SessionFact {
    return {
      schemaVersion: 1,
      eventId: this.nextId('event'),
      sequence: this.facts.length + 1,
      sessionId: session.sessionId,
      threadId: session.threadId,
      occurredAt: this.clock(),
      type,
      payload: clone(payload),
    };
  }

  private nextId(kind: string): string {
    const value = this.idFactory();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw catalogError(`INVALID_${kind.toUpperCase()}_ID`);
    }
    return value;
  }
}

function validateSnapshot(snapshot: A8SessionCatalogSnapshot): void {
  if (!snapshot || snapshot.schemaVersion !== 1) throw catalogError('SNAPSHOT_VERSION_UNSUPPORTED');
  if (!Array.isArray(snapshot.workspaces) || !Array.isArray(snapshot.sessions) || !Array.isArray(snapshot.facts)) {
    throw catalogError('SNAPSHOT_INVALID');
  }
  snapshot.facts.forEach((fact, index) => {
    if (fact.schemaVersion !== 1 || fact.sequence !== index + 1) throw catalogError('SNAPSHOT_SEQUENCE_INVALID');
  });
  const workspaceIds = new Set(snapshot.workspaces.map((workspace) => workspace.workspaceId));
  const sessionIds = new Set<string>();
  for (const session of snapshot.sessions) {
    if (session.schemaVersion !== 1 || !workspaceIds.has(session.workspaceId) || sessionIds.has(session.sessionId)) {
      throw catalogError('SNAPSHOT_REFERENCE_INVALID');
    }
    sessionIds.add(session.sessionId);
  }
  if (snapshot.facts.some((fact) => !sessionIds.has(fact.sessionId))) throw catalogError('SNAPSHOT_REFERENCE_INVALID');
}

function catalogError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
