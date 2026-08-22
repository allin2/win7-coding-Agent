import { A9PersistenceManager, SqliteDatabase, SqliteStatement } from '../../src';

type Row = Record<string, unknown>;

class SimpleMemoryDb implements SqliteDatabase {
  readonly sessions = new Map<string, Row>();
  readonly checkpoints = new Map<string, Row>();

  exec(_sql: string): void {}
  pragma(_source: string): unknown { return []; }
  close(): void {}

  prepare(sql: string): SqliteStatement {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    return {
      get: (...params: unknown[]) => {
        if (normalized.includes('FROM a9_sessions WHERE session_id = ?')) {
          return this.sessions.get(String(params[0])) || null;
        }
        if (normalized.includes('FROM a9_checkpoints WHERE turn_id = ?')) {
          return this.checkpoints.get(String(params[0])) || null;
        }
        return null;
      },
      all: (...params: unknown[]) => {
        if (normalized.includes('FROM a9_checkpoints WHERE session_id = ?')) {
          const sid = String(params[0]);
          return Array.from(this.checkpoints.values()).filter((r) => r.session_id === sid);
        }
        return [];
      },
      run: (...params: unknown[]) => {
        if (normalized.startsWith('INSERT INTO a9_sessions') || normalized.startsWith('UPDATE a9_sessions')) {
          const sid = String(params[0] || params[4]);
          this.sessions.set(sid, {
            session_id: sid,
            workspace_path: params[1] || params[0],
            permission_mode: params[2] || params[1],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata_json: params[5] || params[3] || '{}',
          });
        } else if (normalized.includes('INTO a9_checkpoints')) {
          const tid = String(params[0]);
          this.checkpoints.set(tid, {
            turn_id: tid,
            session_id: String(params[1]),
            created_at: String(params[2]),
            payload_json: String(params[3]),
          });
        }
        return { changes: 1, lastInsertRowid: 1 };
      },
    };
  }

  transaction<T>(operation: () => T): () => T {
    return () => operation();
  }
}

describe('A9-06: A9PersistenceManager and State Migration', () => {
  let db: SimpleMemoryDb;
  let manager: A9PersistenceManager;

  beforeEach(() => {
    db = new SimpleMemoryDb();
    manager = new A9PersistenceManager(db);
  });

  it('saves and restores session metadata and permission mode', () => {
    manager.saveSession({
      sessionId: 'session-1',
      workspacePath: 'D:\\Project\\App',
      permissionMode: 'FULL_ACCESS',
      metadata: { goal: 'Fix memory leak' },
    });

    const session = manager.getSession('session-1');
    expect(session).not.toBeNull();
    expect(session?.sessionId).toBe('session-1');
    expect(session?.workspacePath).toBe('D:\\Project\\App');
    expect(session?.permissionMode).toBe('FULL_ACCESS');
    expect(session?.metadata.goal).toBe('Fix memory leak');
  });

  it('saves and lists turn checkpoints for interrupt recovery', () => {
    manager.saveCheckpoint({
      turnId: 'turn-101',
      sessionId: 'session-1',
      payload: { changedFiles: ['index.ts', 'calc.ts'], reason: 'Applied fix' },
    });

    const cp = manager.getCheckpoint('turn-101');
    expect(cp).not.toBeNull();
    expect(cp?.turnId).toBe('turn-101');
    expect(cp?.sessionId).toBe('session-1');
    expect(cp?.payload.changedFiles).toEqual(['index.ts', 'calc.ts']);

    const list = manager.listCheckpoints('session-1');
    expect(list).toHaveLength(1);
    expect(list[0].turnId).toBe('turn-101');
  });
});
