import {
  cloneInput,
  constraint,
  EventEnvelopeInputV2,
  EventEnvelopeV2,
  EventLedger,
  eventFingerprint,
  freezeEvent,
  validateV2Input,
} from './event-protocol';
import { MAX_PAYLOAD_SIZE, StateError, StateErrorCode } from './types';

export interface SqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes?: number | bigint; lastInsertRowid?: number | bigint };
}

/** The synchronous subset supplied by locked better-sqlite3 8.7.0. */
export interface SqliteDatabase {
  pragma(source: string, options?: { simple?: boolean }): unknown;
  exec(source: string): void;
  prepare(source: string): SqliteStatement;
  transaction<T>(operation: () => T): () => T;
  close(): void;
}

export interface SqliteEventLedgerOptions {
  readonly maxEvents?: number;
  readonly expectedSqliteVersion?: string;
  readonly requiredCompileOptions?: readonly string[];
  readonly databasePath?: string;
}

export interface SqliteRuntimeProfile {
  readonly schemaVersion: 1;
  readonly profile: 'E22-SQLITE343-LOCAL-SSD';
  readonly backend: 'better-sqlite3';
  readonly sqliteVersion: string;
  readonly journalMode: 'wal';
  readonly compileOptions: readonly string[];
  readonly databasePath?: string;
}

interface EventRow {
  event_id: string;
  schema_version: number;
  session_id: string;
  thread_id: string;
  turn_id: string;
  run_id: string;
  occurred_at: string;
  event_type: string;
  payload_json: string;
  fingerprint: string;
  seq: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rc_schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  description TEXT NOT NULL
);
INSERT OR IGNORE INTO rc_schema_version(version, applied_at, description)
VALUES (1, '2026-08-12T00:00:00.000Z', 'RC V2 immutable event ledger');
CREATE TABLE IF NOT EXISTS rc_events_v2 (
  event_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 2),
  session_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  seq INTEGER NOT NULL,
  UNIQUE(thread_id, seq)
);
CREATE INDEX IF NOT EXISTS rc_events_v2_thread_seq ON rc_events_v2(thread_id, seq);
CREATE INDEX IF NOT EXISTS rc_events_v2_run_id ON rc_events_v2(run_id);
CREATE VIRTUAL TABLE IF NOT EXISTS rc_events_v2_fts USING fts5(
  event_id UNINDEXED,
  event_type,
  payload_json,
  tokenize='unicode61'
);
`;

export class SqliteEventLedger implements EventLedger {
  readonly runtimeProfile: SqliteRuntimeProfile;
  private readonly maxEvents: number;

  constructor(private readonly database: SqliteDatabase, options: SqliteEventLedgerOptions = {}) {
    this.maxEvents = options.maxEvents ?? 100_000;
    if (!Number.isInteger(this.maxEvents) || this.maxEvents < 1) {
      throw new StateError(StateErrorCode.EVENTSTORE_CAPACITY_EXCEEDED, 'maxEvents must be a positive integer');
    }
    const expectedVersion = options.expectedSqliteVersion ?? '3.43.1';
    const requiredOptions = [...(options.requiredCompileOptions ?? ['ENABLE_FTS5', 'ENABLE_COLUMN_METADATA', 'THREADSAFE=2'])];
    const sqliteVersion = stringColumn(database.prepare('SELECT sqlite_version() AS version').get(), 'version');
    if (sqliteVersion !== expectedVersion) {
      throw new StateError(StateErrorCode.SCHEMA_MIGRATION_FAILED, `SQLite version ${sqliteVersion} does not match ${expectedVersion}`);
    }
    const compileOptionRows = database.pragma('compile_options');
    const compileOptions = Array.isArray(compileOptionRows)
      ? compileOptionRows.map((row) => stringColumn(row, 'compile_options')).sort()
      : [];
    const missing = requiredOptions.filter((item) => !compileOptions.includes(item));
    if (missing.length > 0) {
      throw new StateError(StateErrorCode.SCHEMA_MIGRATION_FAILED, `SQLite compile options missing: ${missing.join(',')}`);
    }
    const quickCheck = String(database.pragma('quick_check', { simple: true })).toLowerCase();
    if (quickCheck !== 'ok') {
      throw new StateError(StateErrorCode.RECOVERY_INCONSISTENT, `SQLite quick_check failed: ${quickCheck}`);
    }
    database.pragma('trusted_schema = ON');
    const journalMode = String(database.pragma('journal_mode = WAL', { simple: true })).toLowerCase();
    if (journalMode !== 'wal') {
      throw new StateError(StateErrorCode.SCHEMA_MIGRATION_FAILED, `SQLite WAL unavailable: ${journalMode}`);
    }
    database.pragma('synchronous = NORMAL');
    database.pragma('foreign_keys = ON');
    database.exec(SCHEMA);
    if (this.size > this.maxEvents) {
      throw new StateError(StateErrorCode.EVENTSTORE_CAPACITY_EXCEEDED, `Existing event count exceeds capacity ${this.maxEvents}`);
    }
    this.verifyRecovery();
    this.runtimeProfile = Object.freeze({
      schemaVersion: 1,
      profile: 'E22-SQLITE343-LOCAL-SSD',
      backend: 'better-sqlite3',
      sqliteVersion,
      journalMode: 'wal',
      compileOptions: Object.freeze(compileOptions.slice()),
      ...(options.databasePath ? { databasePath: options.databasePath } : {}),
    });
  }

  submit(input: EventEnvelopeInputV2): EventEnvelopeV2 {
    return this.submitBatch([input])[0];
  }

  submitBatch(inputs: readonly EventEnvelopeInputV2[]): EventEnvelopeV2[] {
    if (inputs.length === 0) return [];
    const operation = this.database.transaction(() => this.submitBatchTransaction(inputs));
    try {
      return operation();
    } catch (error) {
      if (error instanceof StateError) throw error;
      throw new StateError(
        StateErrorCode.TRANSACTION_COMMIT_FAILED,
        `SQLite event transaction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  queryThread(threadId: string): readonly EventEnvelopeV2[] {
    const rows = this.database.prepare(
      'SELECT * FROM rc_events_v2 WHERE thread_id = ? ORDER BY seq ASC',
    ).all(threadId);
    const events = rows.map((row) => this.decodeRow(row));
    assertContinuousSequence(events, threadId);
    return events;
  }

  getById(eventId: string): EventEnvelopeV2 | undefined {
    const row = this.database.prepare('SELECT * FROM rc_events_v2 WHERE event_id = ?').get(eventId);
    return row ? this.decodeRow(row) : undefined;
  }

  get size(): number {
    return numberColumn(this.database.prepare('SELECT COUNT(*) AS count FROM rc_events_v2').get(), 'count');
  }

  checkpoint(): void {
    this.database.pragma('wal_checkpoint(TRUNCATE)');
  }

  close(): void {
    let checkpointError: unknown;
    try {
      this.checkpoint();
    } catch (error) {
      checkpointError = error;
    }
    try {
      this.database.close();
    } catch (closeError) {
      throw new StateError(
        StateErrorCode.RECOVERY_INCONSISTENT,
        `SQLite close failed${checkpointError ? ` after checkpoint failure ${String(checkpointError)}` : ''}: ${String(closeError)}`,
      );
    }
    if (checkpointError) {
      throw new StateError(StateErrorCode.RECOVERY_INCONSISTENT, `SQLite checkpoint failed during close: ${String(checkpointError)}`);
    }
  }

  private submitBatchTransaction(inputs: readonly EventEnvelopeInputV2[]): EventEnvelopeV2[] {
    const staged = new Map<string, EventEnvelopeV2>();
    const nextSeq = new Map<string, number>();
    const result: EventEnvelopeV2[] = [];
    for (const input of inputs) {
      validateV2Input(input);
      const payloadBytes = Buffer.byteLength(JSON.stringify(input.payload), 'utf8');
      if (payloadBytes > MAX_PAYLOAD_SIZE) {
        throw new StateError(
          StateErrorCode.PAYLOAD_BUDGET_EXCEEDED,
          `Payload size ${payloadBytes} bytes exceeds limit ${MAX_PAYLOAD_SIZE}`,
        );
      }
      const existing = this.getById(input.eventId) ?? staged.get(input.eventId);
      if (existing) {
        if (eventFingerprint(existing) !== eventFingerprint(input)) {
          throw constraint(`Event ${input.eventId} conflicts with an existing fact`);
        }
        result.push(existing);
        continue;
      }
      const assigned = nextSeq.get(input.threadId) ?? this.nextSequence(input.threadId);
      const event = freezeEvent({ ...cloneInput(input), seq: assigned });
      staged.set(event.eventId, event);
      nextSeq.set(event.threadId, assigned + 1);
      result.push(event);
    }
    if (this.size + staged.size > this.maxEvents) {
      throw new StateError(StateErrorCode.EVENTSTORE_CAPACITY_EXCEEDED, `Event ledger capacity ${this.maxEvents} would be exceeded`);
    }
    const insert = this.database.prepare(`INSERT INTO rc_events_v2
      (event_id, schema_version, session_id, thread_id, turn_id, run_id, occurred_at, event_type, payload_json, fingerprint, seq)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertFts = this.database.prepare(
      'INSERT INTO rc_events_v2_fts(event_id, event_type, payload_json) VALUES (?, ?, ?)',
    );
    for (const event of staged.values()) {
      const payload = JSON.stringify(event.payload);
      insert.run(
        event.eventId, event.schemaVersion, event.sessionId, event.threadId, event.turnId,
        event.runId, event.occurredAt, event.type, payload, eventFingerprint(event), event.seq,
      );
      insertFts.run(event.eventId, event.type, payload);
    }
    return result.slice();
  }

  private nextSequence(threadId: string): number {
    return numberColumn(
      this.database.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM rc_events_v2 WHERE thread_id = ?').get(threadId),
      'next_seq',
    );
  }

  private verifyRecovery(): void {
    const rows = this.database.prepare(
      'SELECT * FROM rc_events_v2 ORDER BY thread_id ASC, seq ASC',
    ).all();
    const byThread = new Map<string, EventEnvelopeV2[]>();
    for (const row of rows) {
      const event = this.decodeRow(row);
      const thread = byThread.get(event.threadId) ?? [];
      thread.push(event);
      byThread.set(event.threadId, thread);
    }
    for (const [threadId, events] of byThread) assertContinuousSequence(events, threadId);
  }

  private decodeRow(value: unknown): EventEnvelopeV2 {
    const row = objectRow(value) as unknown as EventRow;
    let payload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch (error) {
      throw new StateError(StateErrorCode.RECOVERY_INCONSISTENT, `Stored event ${row.event_id} has invalid JSON: ${String(error)}`);
    }
    const event = freezeEvent({
      eventId: row.event_id,
      schemaVersion: row.schema_version as 2,
      sessionId: row.session_id,
      threadId: row.thread_id,
      turnId: row.turn_id,
      runId: row.run_id,
      occurredAt: row.occurred_at,
      type: row.event_type,
      payload,
      seq: row.seq,
    });
    try {
      validateV2Input(event);
    } catch (error) {
      throw new StateError(StateErrorCode.RECOVERY_INCONSISTENT, `Stored event ${row.event_id} is invalid: ${String(error)}`);
    }
    if (eventFingerprint(event) !== row.fingerprint) {
      throw new StateError(StateErrorCode.RECOVERY_INCONSISTENT, `Stored event ${row.event_id} fingerprint mismatch`);
    }
    return event;
  }
}

function objectRow(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StateError(StateErrorCode.RECOVERY_INCONSISTENT, 'SQLite returned an invalid row');
  }
  return value as Record<string, unknown>;
}

function stringColumn(value: unknown, name: string): string {
  const field = objectRow(value)[name];
  if (typeof field !== 'string') throw new StateError(StateErrorCode.RECOVERY_INCONSISTENT, `SQLite column ${name} is invalid`);
  return field;
}

function numberColumn(value: unknown, name: string): number {
  const field = objectRow(value)[name];
  if (typeof field !== 'number' || !Number.isSafeInteger(field)) {
    throw new StateError(StateErrorCode.RECOVERY_INCONSISTENT, `SQLite column ${name} is invalid`);
  }
  return field;
}

function assertContinuousSequence(events: readonly EventEnvelopeV2[], threadId: string): void {
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].seq !== index + 1) {
      throw new StateError(
        StateErrorCode.RECOVERY_INCONSISTENT,
        `Thread ${threadId} has a sequence gap at ${index + 1}`,
      );
    }
  }
}
