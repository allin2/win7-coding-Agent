import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  A8MigrationRunner,
  A8PersistentCatalog,
  A8PersistenceError,
  A8RecoveryCoordinator,
} from '../../src/a8-persistence';
import { SqliteDatabase, SqliteStatement } from '../../src/sqlite-event-ledger';

type Row = Record<string, unknown>;

class MemorySqliteDatabase implements SqliteDatabase {
  readonly tables = new Map<string, Map<string, Row>>();
  failTable: string | null = null;

  exec(sql: string): void {
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(a8_[a-z0-9_]+)/gi)) {
      this.table(match[1]);
    }
    for (const match of sql.matchAll(/DELETE FROM\s+(a8_[a-z0-9_]+)/gi)) {
      this.table(match[1]).clear();
    }
  }

  pragma(_source: string): unknown { return []; }

  prepare(sql: string): SqliteStatement {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    return {
      get: (...params: unknown[]) => this.get(normalized, params),
      all: (...params: unknown[]) => this.all(normalized, params),
      run: (...params: unknown[]) => this.run(normalized, params),
    };
  }

  transaction<T>(operation: () => T): () => T {
    return () => {
      const before = this.cloneTables();
      try { return operation(); } catch (error) { this.restoreTables(before); throw error; }
    };
  }

  close(): void {}

  private get(sql: string, params: unknown[]): Row | undefined {
    const maxVersion = sql.startsWith('SELECT MAX(version) AS version FROM a8_schema_migrations');
    if (maxVersion) {
      const rows = Array.from(this.table('a8_schema_migrations').values());
      return { version: rows.length ? Math.max(...rows.map((row) => Number(row.version))) : null };
    }
    const meta = sql.startsWith('SELECT meta_value FROM a8_catalog_meta WHERE meta_key = ?');
    if (meta) return this.table('a8_catalog_meta').get(String(params[0]));
    const review = sql.startsWith('SELECT * FROM a8_review_sets WHERE review_id = ?');
    if (review) return this.table('a8_review_sets').get(String(params[0]));
    throw new Error(`Unexpected get SQL: ${sql}`);
  }

  private all(sql: string, params: unknown[]): Row[] {
    const tableMatch = sql.match(/^SELECT \* FROM (a8_[a-z0-9_]+)/i);
    if (!tableMatch) throw new Error(`Unexpected all SQL: ${sql}`);
    const rows = Array.from(this.table(tableMatch[1]).values());
    if (tableMatch[1] === 'a8_tasks' && sql.includes('WHERE state IN')) {
      const allowed = new Set(params.map(String));
      return rows.filter((row) => allowed.has(String(row.state)));
    }
    if (tableMatch[1] === 'a8_tasks' && sql.includes('WHERE session_id = ?')) {
      return rows.filter((row) => String(row.session_id) === String(params[0]));
    }
    if (tableMatch[1] === 'a8_review_files' && sql.includes('WHERE review_id = ?')) {
      return rows.filter((row) => String(row.review_id) === String(params[0]));
    }
    if (tableMatch[1] === 'a8_validation_runs' && sql.includes('WHERE review_id = ?')) {
      return rows.filter((row) => String(row.review_id) === String(params[0]));
    }
    if (sql.includes('ORDER BY created_at ASC')) return rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (sql.includes('ORDER BY sequence ASC')) return rows.sort((a, b) => Number(a.sequence) - Number(b.sequence));
    return rows;
  }

  private run(sql: string, params: unknown[]): { changes: number } {
    const deleteMatch = sql.match(/^DELETE FROM (a8_[a-z0-9_]+)/i);
    if (deleteMatch) { this.table(deleteMatch[1]).clear(); return { changes: 1 }; }
    const updateTask = sql.match(/^UPDATE (a8_tasks|a8_runs) SET state = \?, error_code = \?, finished_at = \? WHERE (?:task_id|run_id) = \?/i);
    if (updateTask) {
      const table = this.table(updateTask[1]);
      const key = String(params[3]);
      const row = table.get(key);
      if (row) { row.state = params[0]; row.error_code = params[1]; row.finished_at = params[2]; }
      return { changes: row ? 1 : 0 };
    }
    const insert = sql.match(/^INSERT(?: OR REPLACE)? INTO (a8_[a-z0-9_]+) \(([^)]+)\) VALUES \(([^)]+)\)/i);
    if (!insert) throw new Error(`Unexpected run SQL: ${sql}`);
    const tableName = insert[1];
    if (this.failTable === tableName) throw new Error(`injected ${tableName} failure`);
    const columns = insert[2].split(',').map((item) => item.trim());
    const row = Object.fromEntries(columns.map((column, index) => [column, params[index] ?? null]));
    const key = tableName === 'a8_review_files'
      ? `${String(row.review_id)}:${String(row.comparison_key)}`
      : String(row[keyColumn(tableName)]);
    const table = this.table(tableName);
    if (!sql.includes('OR REPLACE') && table.has(key)) throw new Error(`duplicate ${tableName}`);
    table.set(key, row);
    return { changes: 1 };
  }

  private table(name: string): Map<string, Row> {
    const table = this.tables.get(name);
    if (table) return table;
    const next = new Map<string, Row>();
    this.tables.set(name, next);
    return next;
  }

  private cloneTables(): Map<string, Map<string, Row>> {
    return new Map(Array.from(this.tables.entries(), ([name, rows]) => [name, new Map(Array.from(rows.entries(), ([key, row]) => [key, { ...row }]))]));
  }

  private restoreTables(snapshot: Map<string, Map<string, Row>>): void {
    this.tables.clear();
    snapshot.forEach((rows, name) => this.tables.set(name, rows));
  }
}

function keyColumn(table: string): string {
  return {
    a8_schema_migrations: 'version', a8_workspaces: 'workspace_id', a8_sessions: 'session_id', a8_goals: 'goal_id',
    a8_turns: 'turn_id', a8_tasks: 'task_id', a8_runs: 'run_id', a8_session_facts: 'event_id', a8_review_sets: 'review_id', a8_review_files: 'comparison_key',
    a8_validation_runs: 'validation_run_id', a8_catalog_meta: 'meta_key', a8_recovery_events: 'event_id',
  }[table] || 'migration_id';
}

function ids(): () => string {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}`;
}

function clock(): () => string {
  let value = 0;
  return () => `2026-08-21T00:00:0${value++}.000Z`;
}

function hash(char: string): string { return char.repeat(64); }

describe('A8-05 SQLite persistence and recovery contract', () => {
  it('persists Session, Goal, Turn and facts in structured tables and restores them', () => {
    const db = new MemorySqliteDatabase();
    const first = new A8PersistentCatalog(db, { idFactory: ids(), clock: clock() });
    const workspace = first.ensureWorkspace('C:\\工作 区');
    const session = first.createSession({ workspaceId: workspace.workspaceId, label: '持久会话' });
    const goal = first.setGoal({ sessionId: session.sessionId, text: '完成恢复', expectedRevision: 0 });
    const turn = first.beginTurn(session.sessionId);
    expect(turn.ordinal).toBe(1);
    const reopened = new A8PersistentCatalog(db, { idFactory: ids(), clock: clock() });
    expect(reopened.getSession(session.sessionId)?.goal).toEqual(goal);
    expect(reopened.getSession(session.sessionId)?.turnCount).toBe(1);
    expect(reopened.queryFacts(session.sessionId).map((fact) => fact.type)).toEqual(['session.created', 'goal.updated', 'turn.started']);
    expect(db.tables.get('a8_sessions')?.get(session.sessionId)).toEqual(expect.objectContaining({ turn_count: 1 }));
  });

  it('rolls back the in-memory catalog and SQLite transaction when entity persistence fails', () => {
    const db = new MemorySqliteDatabase();
    const catalog = new A8PersistentCatalog(db, { idFactory: ids(), clock: clock() });
    const workspace = catalog.ensureWorkspace('C:\\repo');
    const session = catalog.createSession({ workspaceId: workspace.workspaceId, label: '回滚' });
    db.failTable = 'a8_goals';
    expect(() => catalog.setGoal({ sessionId: session.sessionId, text: '不得落库', expectedRevision: 0 })).toThrow(A8PersistenceError);
    expect(catalog.getSession(session.sessionId)?.goal).toBeUndefined();
    expect(new A8PersistentCatalog(db, { idFactory: ids(), clock: clock() }).getSession(session.sessionId)?.goal).toBeUndefined();
  });

  it('fails closed on unknown schema, fact hash drift and malformed payloads', () => {
    const db = new MemorySqliteDatabase();
    const catalog = new A8PersistentCatalog(db, { idFactory: ids(), clock: clock() });
    const workspace = catalog.ensureWorkspace('C:\\repo');
    const session = catalog.createSession({ workspaceId: workspace.workspaceId, label: '损坏' });
    catalog.beginTurn(session.sessionId);
    const fact = db.tables.get('a8_session_facts')!.values().next().value as Row;
    fact.payload_json = '{bad';
    expect(() => new A8PersistentCatalog(db, { idFactory: ids(), clock: clock() })).toThrow('READ_ONLY_RECOVERY_REQUIRED');
    fact.payload_json = '{}';
    db.tables.get('a8_schema_migrations')!.set('2', { version: 2 });
    expect(() => new A8PersistentCatalog(db, { idFactory: ids(), clock: clock() })).toThrow('A8 schema 2');
  });

  it('marks active tasks and runs INTERRUPTED without resuming execution', () => {
    const db = new MemorySqliteDatabase();
    const catalog = new A8PersistentCatalog(db, { idFactory: ids(), clock: clock() });
    catalog.persistTask({ schemaVersion: 1, taskId: 'task-1', sessionId: 'session-1', turnId: 'turn-1', state: 'EXECUTING', currentRunId: 'run-1', lastEventSeq: 4, startedAt: '2026-08-21T00:00:00.000Z' }, {
      schemaVersion: 1, runId: 'run-1', taskId: 'task-1', attempt: 1, state: 'EXECUTING', startedAt: '2026-08-21T00:00:00.000Z',
    });
    const report = new A8RecoveryCoordinator(catalog).recover();
    expect(report).toMatchObject({ status: 'INTERRUPTED_TASKS', interruptedTaskIds: ['task-1'] });
    expect(db.tables.get('a8_tasks')!.get('task-1')).toEqual(expect.objectContaining({ state: 'INTERRUPTED', error_code: 'UNCLEAN_SHUTDOWN' }));
    expect(db.tables.get('a8_runs')!.get('run-1')).toEqual(expect.objectContaining({ state: 'INTERRUPTED' }));
    expect(db.tables.get('a8_recovery_events')?.size).toBe(1);
    expect(new A8RecoveryCoordinator(catalog).recover().status).toBe('READY');
  });

  it('persists Review/Validation summaries with hashes and blocks known secrets', () => {
    const db = new MemorySqliteDatabase();
    const catalog = new A8PersistentCatalog(db, { knownSensitiveValues: ['secret-value'], clock: clock(), idFactory: ids() });
    const review = {
      schemaVersion: 1 as const, reviewId: 'review-1', sessionId: 'session-1', taskId: 'task-1', revision: 1,
      status: 'READY' as const, workspaceBaseHash: hash('a'), previewHash: hash('b'), acceptedSetHash: hash('c'),
      updatedAt: '2026-08-21T00:00:00.000Z', payload: { fileCount: 2 },
    };
    catalog.persistReview(review);
    expect(catalog.getReview('review-1')).toEqual(review);
    catalog.persistValidation({
      schemaVersion: 1, validationRunId: 'validation-1', reviewId: 'review-1', revision: 1, validatedSetHash: hash('c'),
      profileId: 'not-run', argvDigest: hash('d'), result: 'NOT_RUN', outputSummary: 'No registered profile', applicableFiles: ['src/app.ts'], finishedAt: '2026-08-21T00:00:00.000Z',
    });
    expect(() => catalog.persistReview({ ...review, reviewId: 'review-2', payload: { note: 'secret-value' } })).toThrow('SENSITIVE_DATA_BLOCKED');
    expect(db.tables.get('a8_review_sets')?.has('review-2')).toBe(false);
  });

  it('persists hash-only Review file projections, validations and durable task projections', () => {
    const db = new MemorySqliteDatabase();
    const catalog = new A8PersistentCatalog(db, { clock: clock(), idFactory: ids() });
    const file = {
      schemaVersion: 1 as const, reviewId: 'review-files', comparisonKey: 'src/app.ts', relativePath: 'src/app.ts', revision: 1,
      operation: 'MODIFY' as const, decision: 'ACCEPTED' as const, beforeExists: true, afterExists: true,
      beforeBytes: 4, afterBytes: 5, beforeSha256: hash('a'), afterSha256: hash('b'), diffSha256: hash('c'),
      beforeBlobRef: hash('d'), afterBlobRef: hash('e'), writable: true,
    };
    catalog.persistReviewFiles(file.reviewId, file.revision, [file]);
    expect(catalog.getReviewFiles(file.reviewId)).toEqual([file]);
    catalog.persistValidation({
      schemaVersion: 1, validationRunId: 'validation-files', reviewId: file.reviewId, revision: 1,
      validatedSetHash: hash('b'), profileId: 'not-run', argvDigest: hash('d'), result: 'NOT_RUN',
      outputSummary: 'No registered profile', applicableFiles: [file.relativePath], finishedAt: '2026-08-21T00:00:00.000Z',
    });
    expect(catalog.listValidations(file.reviewId)).toHaveLength(1);
    catalog.persistTask({
      schemaVersion: 1, taskId: 'task-projection', sessionId: 'session-projection', turnId: 'turn-projection',
      state: 'AWAITING_REVIEW', currentReviewId: file.reviewId, lastEventSeq: 2, startedAt: '2026-08-21T00:00:00.000Z',
    });
    expect(catalog.listTasks('session-projection')).toEqual([expect.objectContaining({ state: 'AWAITING_REVIEW', currentReviewId: file.reviewId })]);
  });

  it('does not interrupt user-gated AWAITING_REVIEW tasks during recovery', () => {
    const db = new MemorySqliteDatabase();
    const catalog = new A8PersistentCatalog(db, { clock: clock(), idFactory: ids() });
    catalog.persistTask({
      schemaVersion: 1, taskId: 'task-review-wait', sessionId: 'session-review-wait', turnId: 'turn-review-wait',
      state: 'AWAITING_REVIEW', lastEventSeq: 1, startedAt: '2026-08-21T00:00:00.000Z',
    });
    expect(new A8RecoveryCoordinator(catalog).recover().status).toBe('READY');
    expect(db.tables.get('a8_tasks')!.get('task-review-wait')).toEqual(expect.objectContaining({ state: 'AWAITING_REVIEW' }));
  });
});

describe('A8-05 A7 to A8 migration contract', () => {
  it('imports only explicit workspace/settings allowlists and is idempotent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-migration-test-'));
    const source = path.join(root, 'a7');
    const target = path.join(root, 'a8');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'manifest.v1.json'), JSON.stringify({ schemaVersion: 1, files: [] }), 'utf8');
    fs.writeFileSync(path.join(source, 'workspace-list.v1.json'), JSON.stringify([
      { canonicalPath: 'C:\\工作 区', displayName: '工作区' },
      { canonicalPath: 'bad', displayName: 'bad', apiKey: 'secret-value' },
    ]), 'utf8');
    fs.writeFileSync(path.join(source, 'settings.v1.json'), JSON.stringify({ providerId: 'internal', mode: 'replay', apiKey: 'secret-value', theme: 'dark' }), 'utf8');
    fs.writeFileSync(path.join(source, 'credentials.v1.json'), '{"apiKey":"secret-value"}', 'utf8');
    const runner = new A8MigrationRunner({ clock: () => '2026-08-21T00:00:00.000Z', idFactory: ids() });
    const result = runner.run({ sourceRoot: source, targetRoot: target });
    expect(result).toMatchObject({ status: 'IMPORTED', imported: { workspaces: 1, settings: 3 }, skipped: { files: ['credentials.v1.json'] } });
    const reportText = fs.readFileSync(path.join(target, 'a8-state-v1', 'migration-report.v1.json'), 'utf8');
    expect(reportText).not.toContain('secret-value');
    expect(runner.run({ sourceRoot: source, targetRoot: target }).status).toBe('ALREADY_COMPLETE');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('rejects an unknown source manifest without creating a target marker', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-migration-invalid-'));
    const source = path.join(root, 'a7');
    const target = path.join(root, 'a8');
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'manifest.v1.json'), JSON.stringify({ schemaVersion: 99 }), 'utf8');
    expect(() => new A8MigrationRunner().run({ sourceRoot: source, targetRoot: target })).toThrow('A7 source manifest version unsupported');
    expect(fs.existsSync(path.join(target, 'a8-migration-marker.v1.json'))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
