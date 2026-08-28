import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  A8GoalRecord,
  A8SessionCatalog,
  A8SessionCatalogSnapshot,
  A8SessionFact,
  A8SessionRecord,
  A8WorkspaceRecord,
  A8TurnIdentity,
} from './a8-session-catalog';
import { SqliteDatabase } from './sqlite-event-ledger';

export const A8_PERSISTENCE_SCHEMA_VERSION = 1 as const;
export const A8_MAX_PERSISTED_JSON_BYTES = 256 * 1024;
export const A8_MAX_REVIEW_JSON_BYTES = 512 * 1024;

export type A8PersistenceErrorCode =
  | 'A8_SCHEMA_VERSION_UNSUPPORTED'
  | 'A8_PERSISTENCE_INVALID'
  | 'A8_RECOVERY_INCONSISTENT'
  | 'READ_ONLY_RECOVERY_REQUIRED'
  | 'SENSITIVE_DATA_BLOCKED'
  | 'A8_MIGRATION_SOURCE_UNSUPPORTED'
  | 'A8_MIGRATION_FAILED'
  | 'A8_MIGRATION_LOCKED';

export class A8PersistenceError extends Error {
  readonly code: A8PersistenceErrorCode;
  readonly recoverable: boolean;

  constructor(code: A8PersistenceErrorCode, message: string, recoverable = false) {
    super(`${code}: ${message}`);
    this.name = 'A8PersistenceError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

export type A8ReviewPersistenceStatus =
  | 'DRAFT'
  | 'READY'
  | 'STALE'
  | 'APPLYING'
  | 'APPLIED'
  | 'REJECTED'
  | 'FAILED'
  | 'RECOVERY_REQUIRED';

export interface A8PersistedReview {
  schemaVersion: 1;
  reviewId: string;
  sessionId: string;
  taskId: string;
  revision: number;
  status: A8ReviewPersistenceStatus;
  workspaceBaseHash: string;
  previewHash: string;
  acceptedSetHash: string;
  updatedAt: string;
  payload?: Record<string, unknown>;
}

/**
 * Hash-only Review file projection.  The private staging blob bytes never
 * enter SQLite; these fields are sufficient to re-check a workspace
 * baseline and to prove the accepted subset without making the DB a content
 * store.
 */
export interface A8PersistedReviewFile {
  schemaVersion: 1;
  reviewId: string;
  comparisonKey: string;
  relativePath: string;
  revision: number;
  operation: 'CREATE' | 'MODIFY' | 'DELETE';
  decision: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  beforeExists: boolean;
  afterExists: boolean;
  beforeBytes: number;
  afterBytes: number;
  beforeSha256: string | null;
  afterSha256: string | null;
  diffSha256: string;
  beforeBlobRef: string | null;
  afterBlobRef: string | null;
  writable: boolean;
}

export interface A8PersistedValidation {
  schemaVersion: 1;
  validationRunId: string;
  reviewId: string;
  revision: number;
  validatedSetHash: string;
  profileId: string;
  argvDigest: string;
  result: 'PASS' | 'FAIL' | 'CANCELLED' | 'NOT_RUN';
  outputSummary: string;
  applicableFiles: string[];
  finishedAt: string;
}

export type A8PersistedTaskState =
  | 'PLANNING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'AWAITING_REVIEW'
  | 'APPLYING'
  | 'INTERRUPTED'
  | 'CANCELLED'
  | 'FAILED'
  | 'COMPLETED';

export interface A8PersistedTask {
  schemaVersion: 1;
  taskId: string;
  sessionId: string;
  turnId: string;
  state: A8PersistedTaskState;
  currentRunId?: string;
  currentReviewId?: string;
  lastEventSeq: number;
  errorCode?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface A8PersistedRun {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  attempt: number;
  state: A8PersistedTaskState;
  errorCode?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface A8PersistentCatalogOptions {
  readonly idFactory?: () => string;
  readonly clock?: () => string;
  readonly contractSha256?: string;
  readonly knownSensitiveValues?: readonly string[];
  readonly maxJsonBytes?: number;
}

export interface A8RecoveryReport {
  schemaVersion: 1;
  status: 'READY' | 'INTERRUPTED_TASKS' | 'READ_ONLY_RECOVERY_REQUIRED';
  interruptedTaskIds: string[];
  diagnostics: string[];
  catalog: A8SessionCatalogSnapshot | null;
}

export interface A8MigrationSource {
  readonly sourceRoot: string;
  readonly targetRoot: string;
  readonly sourceVersion?: string;
  readonly expectedManifestSha256?: string;
}

export interface A8MigrationResult {
  schemaVersion: 1;
  status: 'IMPORTED' | 'NOOP' | 'ALREADY_COMPLETE' | 'FAILED';
  sourceVersion: string;
  sourceManifestSha256: string;
  targetSchemaVersion: 1;
  imported: { workspaces: number; settings: number; archivedEvents: number };
  skipped: { records: number; files: string[] };
  reportSha256: string;
  markerPath?: string;
  diagnostics?: string[];
}

const A8_SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS a8_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  contract_sha256 TEXT NOT NULL,
  report_sha256 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS a8_workspaces (
  workspace_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  canonical_path TEXT NOT NULL,
  comparison_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_opened_at TEXT,
  archived_at TEXT
);
CREATE TABLE IF NOT EXISTS a8_sessions (
  session_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  workspace_id TEXT NOT NULL,
  thread_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('ACTIVE','ARCHIVED')),
  goal_id TEXT,
  active_task_id TEXT,
  turn_count INTEGER NOT NULL,
  last_event_seq INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE TABLE IF NOT EXISTS a8_goals (
  goal_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  session_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','ACHIEVED','ABANDONED')),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS a8_turns (
  turn_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  session_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  mode TEXT,
  task_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, ordinal)
);
CREATE TABLE IF NOT EXISTS a8_tasks (
  task_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  turn_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  state TEXT NOT NULL,
  current_run_id TEXT,
  current_review_id TEXT,
  last_event_seq INTEGER NOT NULL,
  error_code TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS a8_runs (
  run_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  state TEXT NOT NULL,
  error_code TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE(task_id, attempt)
);
CREATE TABLE IF NOT EXISTS a8_session_facts (
  event_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  session_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  fact_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  UNIQUE(session_id, sequence)
);
CREATE TABLE IF NOT EXISTS a8_review_sets (
  review_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  session_id TEXT NOT NULL,
  task_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  workspace_base_hash TEXT NOT NULL,
  preview_hash TEXT NOT NULL,
  accepted_set_hash TEXT NOT NULL,
  payload_json TEXT,
  payload_sha256 TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS a8_review_files (
  review_id TEXT NOT NULL,
  comparison_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  relative_path TEXT NOT NULL,
  revision INTEGER NOT NULL,
  operation TEXT NOT NULL,
  decision TEXT NOT NULL,
  before_exists INTEGER NOT NULL,
  after_exists INTEGER NOT NULL,
  before_bytes INTEGER NOT NULL,
  after_bytes INTEGER NOT NULL,
  before_sha256 TEXT,
  after_sha256 TEXT,
  diff_sha256 TEXT,
  before_blob_ref TEXT,
  after_blob_ref TEXT,
  writable INTEGER NOT NULL,
  PRIMARY KEY(review_id, comparison_key)
);
CREATE TABLE IF NOT EXISTS a8_validation_runs (
  validation_run_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  review_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  validated_set_hash TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  argv_digest TEXT NOT NULL,
  result TEXT NOT NULL,
  output_summary TEXT NOT NULL,
  applicable_files_json TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS a8_projection_checkpoints (
  thread_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  projection_version TEXT NOT NULL,
  source_seq INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  projection_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS a8_migration_runs (
  migration_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  source_version TEXT NOT NULL,
  target_version INTEGER NOT NULL,
  manifest_hash TEXT NOT NULL,
  report_hash TEXT NOT NULL,
  imported_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS a8_catalog_meta (
  meta_key TEXT PRIMARY KEY,
  meta_value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS a8_recovery_events (
  event_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  task_id TEXT NOT NULL,
  run_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL
);
`;

// Only work that could have been executing at process death is interrupted.
// AWAITING_REVIEW and AWAITING_PLAN_APPROVAL are user-gated states and must
// survive restart as facts/UI projections, never be auto-resumed or marked
// failed by recovery.
const RECOVERABLE_TASK_STATES: A8PersistedTaskState[] = ['PLANNING', 'EXECUTING', 'VERIFYING', 'APPLYING'];
const ACTIVE_TASK_STATES: A8PersistedTaskState[] = RECOVERABLE_TASK_STATES;
const REVIEW_STATUSES = new Set<A8ReviewPersistenceStatus>([
  'DRAFT', 'READY', 'STALE', 'APPLYING', 'APPLIED', 'REJECTED', 'FAILED', 'RECOVERY_REQUIRED',
]);
const TASK_STATES = new Set<A8PersistedTaskState>([
  ...ACTIVE_TASK_STATES, 'AWAITING_PLAN_APPROVAL', 'AWAITING_REVIEW', 'INTERRUPTED', 'CANCELLED', 'FAILED', 'COMPLETED',
]);
const ZERO_HASH = '0'.repeat(64);

export class A8PersistentCatalog {
  private readonly idFactory: () => string;
  private readonly clock: () => string;
  private readonly contractSha256: string;
  private readonly knownSensitiveValues: readonly string[];
  private readonly maxJsonBytes: number;
  private catalog: A8SessionCatalog;

  constructor(
    private readonly database: SqliteDatabase,
    options: A8PersistentCatalogOptions = {},
  ) {
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.contractSha256 = options.contractSha256 ?? ZERO_HASH;
    this.knownSensitiveValues = Object.freeze((options.knownSensitiveValues ?? []).filter((value) => typeof value === 'string' && value.length > 0));
    this.maxJsonBytes = options.maxJsonBytes ?? A8_MAX_PERSISTED_JSON_BYTES;
    if (!Number.isInteger(this.maxJsonBytes) || this.maxJsonBytes < 1024) {
      throw new A8PersistenceError('A8_PERSISTENCE_INVALID', 'maxJsonBytes must be at least 1024');
    }
    this.assertSchemaVersionBeforeCreate();
    try {
      this.database.exec(A8_SQL_SCHEMA);
      this.ensureMigrationMarker();
      this.catalog = this.loadCatalog();
      this.validateDurableEntities();
    } catch (error) {
      if (error instanceof A8PersistenceError) throw error;
      throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `A8 persistent catalog failed closed: ${message(error)}`);
    }
  }

  ensureWorkspace(canonicalPath: string): A8WorkspaceRecord {
    return this.mutate((next) => {
      const before = this.catalog.snapshot();
      const existing = before.workspaces.find((workspace) => workspace.canonicalPath === canonicalPath);
      if (existing) return existing;
      const workspace = next.ensureWorkspace(canonicalPath);
      return workspace;
    });
  }

  createSession(input: { workspaceId: string; label: string }): A8SessionRecord {
    return this.mutate((next) => next.createSession(input));
  }

  getSession(sessionId: string): A8SessionRecord | undefined { return this.catalog.getSession(sessionId); }

  getWorkspace(workspaceId: string): A8WorkspaceRecord | undefined { return this.catalog.getWorkspace(workspaceId); }

  listSessions(): A8SessionRecord[] { return this.catalog.listSessions(); }

  archiveSession(sessionId: string): A8SessionRecord {
    return this.mutate((next) => next.archiveSession(sessionId));
  }

  beginTurn(sessionId: string): A8TurnIdentity {
    const previous = this.catalog.snapshot();
    const next = A8SessionCatalog.restore(previous, { idFactory: this.idFactory, clock: this.clock });
    const identity = next.beginTurn(sessionId);
    try {
      this.persistSnapshot(next.snapshot(), identity, sessionId);
      this.catalog = next;
      return identity;
    } catch (error) {
      this.catalog = A8SessionCatalog.restore(previous, { idFactory: this.idFactory, clock: this.clock });
      throw error;
    }
  }

  setGoal(input: { sessionId: string; text: string; expectedRevision: number }): A8GoalRecord {
    return this.mutate((next) => next.setGoal(input));
  }

  resolveGoal(input: { sessionId: string; status: 'ACHIEVED' | 'ABANDONED'; expectedRevision: number }): A8GoalRecord {
    return this.mutate((next) => next.resolveGoal(input));
  }

  queryFacts(sessionId?: string): A8SessionFact[] { return this.catalog.queryFacts(sessionId); }

  snapshot(): A8SessionCatalogSnapshot { return this.catalog.snapshot(); }

  persistTask(task: A8PersistedTask, run?: A8PersistedRun): void {
    validateTask(task);
    if (run) validateRun(run);
    this.scanSensitive({ task, run });
    const operation = this.database.transaction(() => {
      const taskStatement = this.database.prepare(`INSERT OR REPLACE INTO a8_tasks
        (task_id, schema_version, turn_id, session_id, state, current_run_id, current_review_id, last_event_seq, error_code, started_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      taskStatement.run(task.taskId, 1, task.turnId, task.sessionId, task.state, task.currentRunId ?? null,
        task.currentReviewId ?? null, task.lastEventSeq, task.errorCode ?? null, task.startedAt, task.finishedAt ?? null);
      if (run) {
        this.database.prepare(`INSERT OR REPLACE INTO a8_runs
          (run_id, schema_version, task_id, attempt, state, error_code, started_at, finished_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
          run.runId, 1, run.taskId, run.attempt, run.state, run.errorCode ?? null, run.startedAt, run.finishedAt ?? null,
        );
      }
    });
    try { operation(); } catch (error) { throw persistenceWriteError(error); }
  }

  persistReview(review: A8PersistedReview): void {
    validateReview(review, this.maxJsonBytes);
    this.scanSensitive(review);
    const payload = review.payload === undefined ? null : boundedJson(review.payload, A8_MAX_REVIEW_JSON_BYTES, 'review payload');
    const payloadHash = payload === null ? null : sha256(payload);
    const operation = this.database.transaction(() => {
      this.database.prepare(`INSERT OR REPLACE INTO a8_review_sets
        (review_id, schema_version, session_id, task_id, revision, status, workspace_base_hash, preview_hash, accepted_set_hash, payload_json, payload_sha256, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        review.reviewId, 1, review.sessionId, review.taskId, review.revision, review.status,
        review.workspaceBaseHash, review.previewHash, review.acceptedSetHash, payload, payloadHash, review.updatedAt,
      );
    });
    try { operation(); } catch (error) { throw persistenceWriteError(error); }
  }

  persistReviewFiles(reviewId: string, revision: number, files: readonly A8PersistedReviewFile[]): void {
    if (!reviewId || !Number.isSafeInteger(revision) || revision < 1 || !Array.isArray(files) || files.length > 128) {
      throw new A8PersistenceError('A8_PERSISTENCE_INVALID', 'Persisted Review file projection is invalid');
    }
    files.forEach((file) => validateReviewFile({ ...file, reviewId, revision }, this.maxJsonBytes));
    this.scanSensitive(files);
    const operation = this.database.transaction(() => {
      this.database.prepare('DELETE FROM a8_review_files WHERE review_id = ?').run(reviewId);
      const insert = this.database.prepare(`INSERT INTO a8_review_files
        (review_id, comparison_key, schema_version, relative_path, revision, operation, decision,
         before_exists, after_exists, before_bytes, after_bytes, before_sha256, after_sha256,
         diff_sha256, before_blob_ref, after_blob_ref, writable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      files.forEach((file) => insert.run(
        reviewId, file.comparisonKey, 1, file.relativePath, revision, file.operation, file.decision,
        file.beforeExists ? 1 : 0, file.afterExists ? 1 : 0, file.beforeBytes, file.afterBytes,
        file.beforeSha256, file.afterSha256, file.diffSha256, file.beforeBlobRef, file.afterBlobRef,
        file.writable ? 1 : 0,
      ));
    });
    try { operation(); } catch (error) { throw persistenceWriteError(error); }
  }

  getReviewFiles(reviewId: string): A8PersistedReviewFile[] {
    const rows = this.database.prepare('SELECT * FROM a8_review_files WHERE review_id = ?').all(reviewId) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const file: A8PersistedReviewFile = {
        schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
        reviewId: String(row.review_id), comparisonKey: String(row.comparison_key), relativePath: String(row.relative_path),
        revision: numberField(row.revision, 'revision'), operation: String(row.operation) as A8PersistedReviewFile['operation'],
        decision: String(row.decision) as A8PersistedReviewFile['decision'], beforeExists: Boolean(Number(row.before_exists)),
        afterExists: Boolean(Number(row.after_exists)), beforeBytes: numberField(row.before_bytes, 'before_bytes'),
        afterBytes: numberField(row.after_bytes, 'after_bytes'), beforeSha256: nullableHash(row.before_sha256, 'before_sha256'),
        afterSha256: nullableHash(row.after_sha256, 'after_sha256'), diffSha256: String(row.diff_sha256),
        beforeBlobRef: nullableHash(row.before_blob_ref, 'before_blob_ref'), afterBlobRef: nullableHash(row.after_blob_ref, 'after_blob_ref'),
        writable: Boolean(Number(row.writable)),
      };
      validateReviewFile(file, this.maxJsonBytes);
      return file;
    });
  }

  listTasks(sessionId?: string): A8PersistedTask[] {
    const rows = this.database.prepare(sessionId
      ? 'SELECT * FROM a8_tasks WHERE session_id = ?'
      : 'SELECT * FROM a8_tasks').all(...(sessionId ? [sessionId] : [])) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const task: A8PersistedTask = {
        schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
        taskId: String(row.task_id), sessionId: String(row.session_id), turnId: String(row.turn_id),
        state: String(row.state) as A8PersistedTaskState, lastEventSeq: numberField(row.last_event_seq, 'last_event_seq'),
        ...(row.current_run_id ? { currentRunId: String(row.current_run_id) } : {}),
        ...(row.current_review_id ? { currentReviewId: String(row.current_review_id) } : {}),
        ...(row.error_code ? { errorCode: String(row.error_code) } : {}),
        startedAt: String(row.started_at), ...(row.finished_at ? { finishedAt: String(row.finished_at) } : {}),
      };
      validateTask(task);
      return task;
    });
  }

  getReview(reviewId: string): A8PersistedReview | undefined {
    const row = this.database.prepare('SELECT * FROM a8_review_sets WHERE review_id = ?').get(reviewId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const payload = row.payload_json === null || row.payload_json === undefined ? undefined : parseBoundedJson(String(row.payload_json), A8_MAX_REVIEW_JSON_BYTES, 'review payload');
    if (payload !== undefined && sha256(boundedJson(payload, A8_MAX_REVIEW_JSON_BYTES, 'review payload')) !== String(row.payload_sha256)) {
      throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `Review ${reviewId} payload hash mismatch`);
    }
    const review: A8PersistedReview = {
      schemaVersion: 1,
      reviewId: String(row.review_id), sessionId: String(row.session_id), taskId: String(row.task_id),
      revision: numberField(row.revision, 'revision'), status: String(row.status) as A8ReviewPersistenceStatus,
      workspaceBaseHash: String(row.workspace_base_hash), previewHash: String(row.preview_hash),
      acceptedSetHash: String(row.accepted_set_hash), updatedAt: String(row.updated_at),
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    };
    validateReview(review, this.maxJsonBytes);
    return review;
  }

  persistValidation(validation: A8PersistedValidation): void {
    validateValidation(validation, this.maxJsonBytes);
    this.scanSensitive(validation);
    const operation = this.database.transaction(() => {
      this.database.prepare(`INSERT OR REPLACE INTO a8_validation_runs
        (validation_run_id, schema_version, review_id, revision, validated_set_hash, profile_id, argv_digest, result, output_summary, applicable_files_json, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        validation.validationRunId, 1, validation.reviewId, validation.revision, validation.validatedSetHash,
        validation.profileId, validation.argvDigest, validation.result, validation.outputSummary,
        boundedJson(validation.applicableFiles, this.maxJsonBytes, 'validation files'), validation.finishedAt,
      );
    });
    try { operation(); } catch (error) { throw persistenceWriteError(error); }
  }

  listValidations(reviewId: string): A8PersistedValidation[] {
    const rows = this.database.prepare('SELECT * FROM a8_validation_runs WHERE review_id = ?').all(reviewId) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const applicableFiles = parseBoundedJson(String(row.applicable_files_json), this.maxJsonBytes, 'validation files');
      const validation: A8PersistedValidation = {
        schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
        validationRunId: String(row.validation_run_id), reviewId: String(row.review_id), revision: numberField(row.revision, 'revision'),
        validatedSetHash: String(row.validated_set_hash), profileId: String(row.profile_id), argvDigest: String(row.argv_digest),
        result: String(row.result) as A8PersistedValidation['result'], outputSummary: String(row.output_summary),
        applicableFiles: Array.isArray(applicableFiles) ? applicableFiles.map(String) : [], finishedAt: String(row.finished_at),
      };
      validateValidation(validation, this.maxJsonBytes);
      return validation;
    });
  }

  recover(): A8RecoveryReport {
    let catalog: A8SessionCatalogSnapshot;
    try {
      catalog = this.catalog.snapshot();
      // A second full load catches rows modified after construction and makes the recovery result explicit.
      this.catalog = this.loadCatalog();
      catalog = this.catalog.snapshot();
    } catch (error) {
      return {
        schemaVersion: 1,
        status: 'READ_ONLY_RECOVERY_REQUIRED',
        interruptedTaskIds: [],
        diagnostics: [codeOf(error)],
        catalog: null,
      };
    }
    try {
      const taskReferences = this.database.prepare('SELECT * FROM a8_tasks').all() as Array<Record<string, unknown>>;
      for (const row of taskReferences) {
        if (!row.current_review_id) continue;
        const review = this.database.prepare('SELECT * FROM a8_review_sets WHERE review_id = ?').get(String(row.current_review_id));
        if (!review) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `Task ${String(row.task_id)} references missing Review ${String(row.current_review_id)}`);
      }
      const rows = this.database.prepare(`SELECT * FROM a8_tasks WHERE state IN (${ACTIVE_TASK_STATES.map(() => '?').join(',')})`).all(...ACTIVE_TASK_STATES) as Array<Record<string, unknown>>;
      if (rows.length === 0) return { schemaVersion: 1, status: 'READY', interruptedTaskIds: [], diagnostics: [], catalog };
      const interruptedTaskIds = rows.map((row) => String(row.task_id));
      const operation = this.database.transaction(() => {
        rows.forEach((row) => {
          this.database.prepare('UPDATE a8_tasks SET state = ?, error_code = ?, finished_at = ? WHERE task_id = ?').run(
            'INTERRUPTED', 'UNCLEAN_SHUTDOWN', this.clock(), String(row.task_id),
          );
          if (row.current_run_id) {
            this.database.prepare('UPDATE a8_runs SET state = ?, error_code = ?, finished_at = ? WHERE run_id = ?').run(
              'INTERRUPTED', 'UNCLEAN_SHUTDOWN', this.clock(), String(row.current_run_id),
            );
          }
          const payload = boundedJson({ reason: 'unclean_shutdown', taskId: String(row.task_id) }, this.maxJsonBytes, 'recovery event');
          const eventId = `recovery:${String(row.task_id)}:${Date.now()}`;
          this.database.prepare(`INSERT INTO a8_recovery_events
            (event_id, schema_version, task_id, run_id, event_type, occurred_at, payload_json, payload_sha256)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            eventId, 1, String(row.task_id), row.current_run_id ? String(row.current_run_id) : null,
            'task.interrupted', this.clock(), payload, sha256(payload),
          );
        });
      });
      operation();
      return { schemaVersion: 1, status: 'INTERRUPTED_TASKS', interruptedTaskIds, diagnostics: [], catalog };
    } catch (error) {
      return {
        schemaVersion: 1,
        status: 'READ_ONLY_RECOVERY_REQUIRED',
        interruptedTaskIds: [],
        diagnostics: [codeOf(error)],
        catalog,
      };
    }
  }

  private mutate<T>(operation: (next: A8SessionCatalog) => T): T {
    const previous = this.catalog.snapshot();
    const next = A8SessionCatalog.restore(previous, { idFactory: this.idFactory, clock: this.clock });
    try {
      const value = operation(next);
      this.persistSnapshot(next.snapshot());
      this.catalog = next;
      return value;
    } catch (error) {
      this.catalog = A8SessionCatalog.restore(previous, { idFactory: this.idFactory, clock: this.clock });
      throw error;
    }
  }

  private persistSnapshot(snapshot: A8SessionCatalogSnapshot, turn?: A8TurnIdentity, turnSessionId?: string): void {
    const snapshotText = boundedJson(snapshot, this.maxJsonBytes, 'catalog snapshot');
    this.scanSensitive(snapshot);
    const operation = this.database.transaction(() => {
      this.database.exec('DELETE FROM a8_goals; DELETE FROM a8_sessions; DELETE FROM a8_workspaces; DELETE FROM a8_session_facts;');
      const workspaceInsert = this.database.prepare(`INSERT INTO a8_workspaces
        (workspace_id, schema_version, canonical_path, comparison_key, display_name, created_at, last_opened_at, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      snapshot.workspaces.forEach((workspace) => workspaceInsert.run(
        workspace.workspaceId, 1, workspace.canonicalPath, comparisonKey(workspace.canonicalPath), path.basename(workspace.canonicalPath), workspace.createdAt, null, null,
      ));
      const sessionInsert = this.database.prepare(`INSERT INTO a8_sessions
        (session_id, schema_version, workspace_id, thread_id, title, lifecycle, goal_id, active_task_id, turn_count, last_event_seq, created_at, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      snapshot.sessions.forEach((session) => sessionInsert.run(
        session.sessionId, 1, session.workspaceId, session.threadId, session.label, session.status,
        session.goal?.goalId ?? null, null, session.turnCount, 0, session.createdAt, session.archivedAt ?? null,
      ));
      const goalInsert = this.database.prepare(`INSERT INTO a8_goals
        (goal_id, schema_version, session_id, revision, text, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      snapshot.sessions.filter((session) => session.goal).forEach((session) => {
        const goal = session.goal!;
        goalInsert.run(goal.goalId, 1, session.sessionId, goal.revision, goal.text, goal.status, goal.updatedAt);
      });
      const factInsert = this.database.prepare(`INSERT INTO a8_session_facts
        (event_id, schema_version, session_id, thread_id, sequence, occurred_at, fact_type, payload_json, payload_sha256)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      snapshot.facts.forEach((fact) => {
        const payload = boundedJson(fact.payload, this.maxJsonBytes, 'fact payload');
        factInsert.run(fact.eventId, 1, fact.sessionId, fact.threadId, fact.sequence, fact.occurredAt, fact.type, payload, sha256(payload));
      });
      if (turn && turnSessionId) {
        const session = snapshot.sessions.find((item) => item.sessionId === turnSessionId);
        if (!session) throw new A8PersistenceError('A8_PERSISTENCE_INVALID', 'Turn session reference missing');
        this.database.prepare(`INSERT INTO a8_turns (turn_id, schema_version, session_id, ordinal, mode, task_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(turn.turnId, 1, turnSessionId, turn.ordinal, null, turn.taskId, this.clock());
        this.database.prepare(`INSERT INTO a8_tasks
          (task_id, schema_version, turn_id, session_id, state, current_run_id, current_review_id, last_event_seq, error_code, started_at, finished_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          turn.taskId, 1, turn.turnId, turnSessionId, 'PLANNING', turn.runId, null, 0, null, this.clock(), null,
        );
        this.database.prepare(`INSERT INTO a8_runs
          (run_id, schema_version, task_id, attempt, state, error_code, started_at, finished_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(turn.runId, 1, turn.taskId, 1, 'PLANNING', null, this.clock(), null);
      }
      this.database.prepare('INSERT OR REPLACE INTO a8_catalog_meta (meta_key, meta_value) VALUES (?, ?)').run('snapshot_sha256', sha256(snapshotText));
    });
    try { operation(); } catch (error) { throw persistenceWriteError(error); }
  }

  private loadCatalog(): A8SessionCatalog {
    const workspaces = (this.database.prepare('SELECT * FROM a8_workspaces ORDER BY created_at ASC').all() as Array<Record<string, unknown>>)
      .map((row) => {
        const workspace: A8WorkspaceRecord = {
          schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
          workspaceId: String(row.workspace_id), canonicalPath: String(row.canonical_path), createdAt: String(row.created_at),
        };
        if (workspace.schemaVersion !== 1 || String(row.comparison_key) !== comparisonKey(workspace.canonicalPath)) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', 'Workspace comparison key mismatch');
        return workspace;
      });
    const goals = new Map<string, A8GoalRecord>();
    (this.database.prepare('SELECT * FROM a8_goals').all() as Array<Record<string, unknown>>).forEach((row) => {
      const goal: A8GoalRecord = {
        schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
        goalId: String(row.goal_id), text: String(row.text), status: String(row.status) as A8GoalRecord['status'],
        revision: numberField(row.revision, 'revision'), updatedAt: String(row.updated_at),
      };
      if (goal.schemaVersion !== 1) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', 'Goal schema version unsupported');
      goals.set(String(row.session_id), goal);
    });
    const sessions = (this.database.prepare('SELECT * FROM a8_sessions ORDER BY created_at ASC').all() as Array<Record<string, unknown>>)
      .map((row) => ({
        schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
        sessionId: String(row.session_id), workspaceId: String(row.workspace_id), threadId: String(row.thread_id),
        label: String(row.title), status: String(row.lifecycle) as A8SessionRecord['status'], createdAt: String(row.created_at),
        ...(row.archived_at ? { archivedAt: String(row.archived_at) } : {}), turnCount: numberField(row.turn_count ?? 0, 'turn_count'),
        ...(goals.has(String(row.session_id)) ? { goal: goals.get(String(row.session_id)) } : {}),
      } as A8SessionRecord));
    const facts = (this.database.prepare('SELECT * FROM a8_session_facts ORDER BY sequence ASC').all() as Array<Record<string, unknown>>)
      .map((row) => {
        const payloadText = String(row.payload_json);
        const payload = parseBoundedJson(payloadText, this.maxJsonBytes, 'fact payload') as Record<string, unknown>;
        if (sha256(payloadText) !== String(row.payload_sha256)) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `Fact ${String(row.event_id)} hash mismatch`);
        return {
          schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
          eventId: String(row.event_id), sequence: numberField(row.sequence, 'sequence'), sessionId: String(row.session_id),
          threadId: String(row.thread_id), occurredAt: String(row.occurred_at), type: String(row.fact_type) as A8SessionFact['type'], payload,
        } as A8SessionFact;
      });
    const snapshot: A8SessionCatalogSnapshot = { schemaVersion: 1, workspaces, sessions, facts };
    try {
      const catalog = A8SessionCatalog.restore(snapshot, { idFactory: this.idFactory, clock: this.clock });
      const meta = this.database.prepare('SELECT meta_value FROM a8_catalog_meta WHERE meta_key = ?').get('snapshot_sha256') as Record<string, unknown> | undefined;
      if (meta && String(meta.meta_value) !== sha256(boundedJson(snapshot, this.maxJsonBytes, 'catalog snapshot'))) {
        throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', 'Catalog snapshot hash mismatch');
      }
      return catalog;
    } catch (error) {
      if (error instanceof A8PersistenceError) throw error;
      throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `Catalog references invalid: ${message(error)}`);
    }
  }

  private validateDurableEntities(): void {
    const snapshot = this.catalog.snapshot();
    const sessionIds = new Set(snapshot.sessions.map((session) => session.sessionId));
    const turnIds = new Set<string>();
    const taskIds = new Set<string>();
    (this.database.prepare('SELECT * FROM a8_turns').all() as Array<Record<string, unknown>>).forEach((row) => {
      if (numberField(row.schema_version, 'schema_version') !== 1 || !sessionIds.has(String(row.session_id)) ||
          !String(row.turn_id) || !Number.isSafeInteger(Number(row.ordinal)) || Number(row.ordinal) < 1 || !String(row.task_id)) {
        throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', 'Turn entity reference or schema is invalid');
      }
      turnIds.add(String(row.turn_id));
    });
    const reviewIds = new Set<string>();
    (this.database.prepare('SELECT * FROM a8_review_sets').all() as Array<Record<string, unknown>>).forEach((row) => {
      const review = this.getReview(String(row.review_id));
      if (!review || !sessionIds.has(review.sessionId)) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', 'Review entity reference is invalid');
      reviewIds.add(review.reviewId);
    });
    (this.database.prepare('SELECT * FROM a8_tasks').all() as Array<Record<string, unknown>>).forEach((row) => {
      const task: A8PersistedTask = {
        schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
        taskId: String(row.task_id), sessionId: String(row.session_id), turnId: String(row.turn_id),
        state: String(row.state) as A8PersistedTaskState, lastEventSeq: numberField(row.last_event_seq, 'last_event_seq'),
        ...(row.current_run_id ? { currentRunId: String(row.current_run_id) } : {}),
        ...(row.current_review_id ? { currentReviewId: String(row.current_review_id) } : {}),
        ...(row.error_code ? { errorCode: String(row.error_code) } : {}),
        startedAt: String(row.started_at), ...(row.finished_at ? { finishedAt: String(row.finished_at) } : {}),
      };
      validateTask(task);
      if (!sessionIds.has(task.sessionId) || (turnIds.size > 0 && !turnIds.has(task.turnId)) ||
          (task.currentReviewId && !reviewIds.has(task.currentReviewId))) {
        throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `Task ${task.taskId} reference is invalid`);
      }
      taskIds.add(task.taskId);
    });
    (this.database.prepare('SELECT * FROM a8_runs').all() as Array<Record<string, unknown>>).forEach((row) => {
      const run: A8PersistedRun = {
        schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
        runId: String(row.run_id), taskId: String(row.task_id), attempt: numberField(row.attempt, 'attempt'),
        state: String(row.state) as A8PersistedTaskState,
        ...(row.error_code ? { errorCode: String(row.error_code) } : {}),
        startedAt: String(row.started_at), ...(row.finished_at ? { finishedAt: String(row.finished_at) } : {}),
      };
      validateRun(run);
      if (!taskIds.has(run.taskId)) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `Run ${run.runId} references missing Task`);
    });
    (this.database.prepare('SELECT * FROM a8_validation_runs').all() as Array<Record<string, unknown>>).forEach((row) => {
      if (!reviewIds.has(String(row.review_id))) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', 'Validation references missing Review');
      this.listValidations(String(row.review_id));
    });
    (this.database.prepare('SELECT * FROM a8_review_files').all() as Array<Record<string, unknown>>).forEach((row) => {
      if (!reviewIds.has(String(row.review_id))) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', 'Review file references missing Review');
      validateReviewFile({
        schemaVersion: numberField(row.schema_version, 'schema_version') as 1,
        reviewId: String(row.review_id), comparisonKey: String(row.comparison_key), relativePath: String(row.relative_path),
        revision: numberField(row.revision, 'revision'), operation: String(row.operation) as A8PersistedReviewFile['operation'],
        decision: String(row.decision) as A8PersistedReviewFile['decision'], beforeExists: Boolean(Number(row.before_exists)),
        afterExists: Boolean(Number(row.after_exists)), beforeBytes: numberField(row.before_bytes, 'before_bytes'),
        afterBytes: numberField(row.after_bytes, 'after_bytes'), beforeSha256: nullableHash(row.before_sha256, 'before_sha256'),
        afterSha256: nullableHash(row.after_sha256, 'after_sha256'), diffSha256: String(row.diff_sha256),
        beforeBlobRef: nullableHash(row.before_blob_ref, 'before_blob_ref'), afterBlobRef: nullableHash(row.after_blob_ref, 'after_blob_ref'),
        writable: Boolean(Number(row.writable)),
      }, this.maxJsonBytes);
    });
  }

  private assertSchemaVersionBeforeCreate(): void {
    try {
      const row = this.database.prepare('SELECT MAX(version) AS version FROM a8_schema_migrations').get() as Record<string, unknown>;
      const version = row && row.version !== null && row.version !== undefined ? numberField(row.version, 'version') : 0;
      if (version > A8_PERSISTENCE_SCHEMA_VERSION) throw new A8PersistenceError('A8_SCHEMA_VERSION_UNSUPPORTED', `A8 schema ${version} is newer than supported ${A8_PERSISTENCE_SCHEMA_VERSION}`);
    } catch (error) {
      if (error instanceof A8PersistenceError) throw error;
      // A missing table is the normal first-open path; the schema install below creates it.
      if (!/no such table|not found|missing/i.test(message(error))) throw error;
    }
  }

  private ensureMigrationMarker(): void {
    const row = this.database.prepare('SELECT MAX(version) AS version FROM a8_schema_migrations').get() as Record<string, unknown>;
    const version = row && row.version !== null && row.version !== undefined ? numberField(row.version, 'version') : 0;
    if (version > A8_PERSISTENCE_SCHEMA_VERSION) throw new A8PersistenceError('A8_SCHEMA_VERSION_UNSUPPORTED', `A8 schema ${version} is newer than supported ${A8_PERSISTENCE_SCHEMA_VERSION}`);
    if (version === 0) {
      this.database.prepare(`INSERT INTO a8_schema_migrations (version, applied_at, contract_sha256, report_sha256)
        VALUES (?, ?, ?, ?)`).run(1, this.clock(), this.contractSha256, ZERO_HASH);
    }
    const marker = this.database.prepare('SELECT meta_value FROM a8_catalog_meta WHERE meta_key = ?').get('a8_schema_version') as Record<string, unknown> | undefined;
    if (marker && String(marker.meta_value) !== String(A8_PERSISTENCE_SCHEMA_VERSION)) {
      throw new A8PersistenceError('A8_SCHEMA_VERSION_UNSUPPORTED', `A8 schema marker ${String(marker.meta_value)} is unsupported`);
    }
    this.database.prepare('INSERT OR REPLACE INTO a8_catalog_meta (meta_key, meta_value) VALUES (?, ?)').run(
      'a8_schema_version', String(A8_PERSISTENCE_SCHEMA_VERSION),
    );
  }

  private scanSensitive(value: unknown): void {
    const text = JSON.stringify(value);
    const keyMatch = /api.?key|authorization|password|credential|secret|token/i.test(text);
    const valueMatch = this.knownSensitiveValues.some((secret) => secret && text.includes(secret));
    if (valueMatch || keyMatch && /"(?:api.?key|authorization|password|credential|secret|token)"\s*:\s*"[^"{}]+"/i.test(text)) {
      throw new A8PersistenceError('SENSITIVE_DATA_BLOCKED', 'Known credential field/value blocked before A8 persistence');
    }
  }
}

export class A8RecoveryCoordinator {
  constructor(private readonly catalog: A8PersistentCatalog) {}
  recover(): A8RecoveryReport { return this.catalog.recover(); }
}

export class A8MigrationRunner {
  constructor(private readonly options: { readonly clock?: () => string; readonly idFactory?: () => string } = {}) {}

  run(source: A8MigrationSource): A8MigrationResult {
    const clock = this.options.clock ?? (() => new Date().toISOString());
    const idFactory = this.options.idFactory ?? (() => crypto.randomUUID());
    const sourceRoot = path.resolve(source.sourceRoot);
    const targetRoot = path.resolve(source.targetRoot);
    const sourceVersion = source.sourceVersion ?? 'a7-v1';
    if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) throw new A8PersistenceError('A8_MIGRATION_SOURCE_UNSUPPORTED', 'A7 source root is not a directory');
    fs.mkdirSync(targetRoot, { recursive: true });
    const markerPath = path.join(targetRoot, 'a8-migration-marker.v1.json');
    if (fs.existsSync(markerPath)) {
      const marker = readJsonFile(markerPath, 'migration marker');
      if (marker.schemaVersion !== 1 || marker.targetSchemaVersion !== 1) throw new A8PersistenceError('A8_MIGRATION_SOURCE_UNSUPPORTED', 'Existing migration marker is unsupported');
      return {
        schemaVersion: 1, status: 'ALREADY_COMPLETE', sourceVersion: String(marker.sourceVersion),
        sourceManifestSha256: String(marker.sourceManifestSha256), targetSchemaVersion: 1,
        imported: marker.imported, skipped: marker.skipped, reportSha256: String(marker.reportSha256), markerPath,
      };
    }
    const lockPath = path.join(targetRoot, '.a8-migration.lock');
    let lockFd: number | undefined;
    let tempRoot: string | undefined;
    try {
      try { lockFd = fs.openSync(lockPath, 'wx'); } catch (_error) { throw new A8PersistenceError('A8_MIGRATION_LOCKED', 'A8 migration lock already exists', true); }
      const manifestPath = path.join(sourceRoot, 'manifest.v1.json');
      const manifestBytes = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath) : Buffer.from('{"schemaVersion":1,"files":[]}', 'utf8');
      const sourceManifestSha256 = sha256(manifestBytes);
      if (source.expectedManifestSha256 && source.expectedManifestSha256 !== sourceManifestSha256) throw new A8PersistenceError('A8_MIGRATION_SOURCE_UNSUPPORTED', 'A7 manifest hash mismatch');
      const manifest = parseJson(manifestBytes, 'A7 manifest');
      if (manifest.schemaVersion !== 1) throw new A8PersistenceError('A8_MIGRATION_SOURCE_UNSUPPORTED', 'A7 source manifest version unsupported');
      const skippedFiles: string[] = [];
      const forbiddenNames = ['credentials.v1.json', 'agent-events-v2.db-shm', 'agent-events-v2.db-wal'];
      forbiddenNames.forEach((name) => { if (fs.existsSync(path.join(sourceRoot, name))) skippedFiles.push(name); });
      const workspacePath = path.join(sourceRoot, 'workspace-list.v1.json');
      const settingsPath = path.join(sourceRoot, 'settings.v1.json');
      const workspaces = fs.existsSync(workspacePath) ? readJsonFile(workspacePath, 'workspace list') : [];
      const settings = fs.existsSync(settingsPath) ? readJsonFile(settingsPath, 'settings') : {};
      if (!Array.isArray(workspaces) || typeof settings !== 'object' || settings === null || Array.isArray(settings)) throw new A8MigrationError('A7 whitelist input invalid');
      const safeWorkspaces = workspaces.filter((item) => isSafeWorkspace(item));
      const safeSettings = filterSafeSettings(settings);
      const skippedRecords = workspaces.length - safeWorkspaces.length + Object.keys(settings).length - Object.keys(safeSettings).length;
      tempRoot = path.join(targetRoot, `.a8-migration-${idFactory()}`);
      fs.mkdirSync(tempRoot, { recursive: true });
      const report = {
        schemaVersion: 1,
        sourceVersion,
        sourceManifestSha256,
        targetSchemaVersion: 1,
        imported: { workspaces: safeWorkspaces.length, settings: Object.keys(safeSettings).length, archivedEvents: 0 },
        skipped: { records: skippedRecords, files: skippedFiles },
        occurredAt: clock(),
      };
      const reportText = boundedJson(report, A8_MAX_PERSISTED_JSON_BYTES, 'migration report');
      const reportSha256 = sha256(reportText);
      writeAtomicFile(path.join(tempRoot, 'migration-report.v1.json'), reportText);
      writeAtomicFile(path.join(tempRoot, 'workspaces.v1.json'), boundedJson(safeWorkspaces, A8_MAX_PERSISTED_JSON_BYTES, 'workspace migration'));
      writeAtomicFile(path.join(tempRoot, 'settings.v1.json'), boundedJson(safeSettings, A8_MAX_PERSISTED_JSON_BYTES, 'settings migration'));
      const marker = {
        schemaVersion: 1,
        sourceVersion,
        sourceManifestSha256,
        targetSchemaVersion: 1,
        imported: report.imported,
        skipped: report.skipped,
        reportSha256,
        completedAt: clock(),
      };
      writeAtomicFile(path.join(tempRoot, 'a8-migration-marker.v1.json'), boundedJson(marker, A8_MAX_PERSISTED_JSON_BYTES, 'migration marker'));
      fsyncDirectory(tempRoot);
      fs.renameSync(tempRoot, path.join(targetRoot, 'a8-state-v1'));
      tempRoot = undefined;
      fs.renameSync(path.join(targetRoot, 'a8-state-v1', 'a8-migration-marker.v1.json'), markerPath);
      fsyncDirectory(targetRoot);
      return {
        schemaVersion: 1, status: safeWorkspaces.length === 0 && Object.keys(safeSettings).length === 0 ? 'NOOP' : 'IMPORTED',
        sourceVersion, sourceManifestSha256, targetSchemaVersion: 1, imported: report.imported,
        skipped: report.skipped, reportSha256, markerPath,
      };
    } catch (error) {
      if (tempRoot) safeRemoveDirectory(tempRoot);
      if (error instanceof A8PersistenceError) throw error;
      throw new A8PersistenceError('A8_MIGRATION_FAILED', `A8 migration failed: ${message(error)}`);
    } finally {
      if (lockFd !== undefined) { try { fs.closeSync(lockFd); } catch (_error) { /* diagnostics only */ } }
      try { fs.unlinkSync(lockPath); } catch (_error) { /* lock already removed */ }
    }
  }
}

class A8MigrationError extends Error {}

function validateTask(task: A8PersistedTask): void {
  if (task.schemaVersion !== 1 || !task.taskId || !task.sessionId || !task.turnId || !TASK_STATES.has(task.state) || !Number.isSafeInteger(task.lastEventSeq) || task.lastEventSeq < 0) {
    throw new A8PersistenceError('A8_PERSISTENCE_INVALID', 'Persisted task is invalid');
  }
}

function validateRun(run: A8PersistedRun): void {
  if (run.schemaVersion !== 1 || !run.runId || !run.taskId || !Number.isSafeInteger(run.attempt) || run.attempt < 1 || !TASK_STATES.has(run.state)) {
    throw new A8PersistenceError('A8_PERSISTENCE_INVALID', 'Persisted run is invalid');
  }
}

function validateReview(review: A8PersistedReview, maxJsonBytes: number): void {
  if (review.schemaVersion !== 1 || !review.reviewId || !review.sessionId || !review.taskId || !Number.isSafeInteger(review.revision) || review.revision < 1 ||
      !REVIEW_STATUSES.has(review.status) || !/^[a-f0-9]{64}$/i.test(review.workspaceBaseHash) || !/^[a-f0-9]{64}$/i.test(review.previewHash) ||
      !/^[a-f0-9]{64}$/i.test(review.acceptedSetHash)) throw new A8PersistenceError('A8_PERSISTENCE_INVALID', 'Persisted review is invalid');
  if (review.payload !== undefined) boundedJson(review.payload, Math.min(maxJsonBytes, A8_MAX_REVIEW_JSON_BYTES), 'review payload');
}

function validateReviewFile(file: A8PersistedReviewFile, _maxJsonBytes: number): void {
  const validOperations = new Set(['CREATE', 'MODIFY', 'DELETE']);
  const validDecisions = new Set(['PENDING', 'ACCEPTED', 'REJECTED']);
  if (file.schemaVersion !== 1 || !file.reviewId || !file.comparisonKey || !file.relativePath ||
      !Number.isSafeInteger(file.revision) || file.revision < 1 || !validOperations.has(file.operation) ||
      !validDecisions.has(file.decision) || !Number.isSafeInteger(file.beforeBytes) || file.beforeBytes < 0 ||
      !Number.isSafeInteger(file.afterBytes) || file.afterBytes < 0 || !/^[a-f0-9]{64}$/i.test(file.diffSha256) ||
      (file.beforeSha256 !== null && !/^[a-f0-9]{64}$/i.test(file.beforeSha256)) ||
      (file.afterSha256 !== null && !/^[a-f0-9]{64}$/i.test(file.afterSha256)) ||
      (file.beforeBlobRef !== null && !/^[a-f0-9]{64}$/i.test(file.beforeBlobRef)) ||
      (file.afterBlobRef !== null && !/^[a-f0-9]{64}$/i.test(file.afterBlobRef))) {
    throw new A8PersistenceError('A8_PERSISTENCE_INVALID', `Persisted Review file ${file.relativePath || '(empty)'} is invalid`);
  }
}

function validateValidation(validation: A8PersistedValidation, maxJsonBytes: number): void {
  if (validation.schemaVersion !== 1 || !validation.validationRunId || !validation.reviewId || !Number.isSafeInteger(validation.revision) || validation.revision < 1 ||
      !/^[a-f0-9]{64}$/i.test(validation.validatedSetHash) || !validation.profileId || !/^[a-f0-9]{64}$/i.test(validation.argvDigest) ||
      !['PASS', 'FAIL', 'CANCELLED', 'NOT_RUN'].includes(validation.result) || !Array.isArray(validation.applicableFiles)) {
    throw new A8PersistenceError('A8_PERSISTENCE_INVALID', 'Persisted validation is invalid');
  }
  boundedJson(validation, maxJsonBytes, 'validation');
}

function comparisonKey(value: string): string { return value.toLocaleLowerCase('en-US').replace(/\\/g, '/'); }

function nullableHash(value: unknown, name: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  if (!/^[a-f0-9]{64}$/i.test(text)) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `SQLite ${name} is not a SHA-256 hash`);
  return text;
}

function boundedJson(value: unknown, maxBytes: number, label: string): string {
  const text = canonicalJson(value);
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new A8PersistenceError('A8_PERSISTENCE_INVALID', `${label} exceeds ${maxBytes} bytes`);
  return text;
}

function parseBoundedJson(text: string, maxBytes: number, label: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `${label} exceeds ${maxBytes} bytes`);
  try { return JSON.parse(text); } catch (error) { throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `${label} JSON invalid: ${message(error)}`); }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, sortJson((value as Record<string, unknown>)[key])]));
  return value;
}

function sha256(value: string | Buffer): string { return crypto.createHash('sha256').update(value).digest('hex'); }

function numberField(value: unknown, name: string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(result)) throw new A8PersistenceError('READ_ONLY_RECOVERY_REQUIRED', `SQLite ${name} is invalid`);
  return result;
}

function persistenceWriteError(error: unknown): A8PersistenceError {
  if (error instanceof A8PersistenceError) return error;
  return new A8PersistenceError('A8_RECOVERY_INCONSISTENT', `A8 persistence transaction failed: ${message(error)}`, true);
}

function codeOf(error: unknown): string { return error instanceof A8PersistenceError ? error.code : 'READ_ONLY_RECOVERY_REQUIRED'; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function readJsonFile(filePath: string, label: string): any {
  try { return parseJson(fs.readFileSync(filePath), label); } catch (error) { if (error instanceof A8PersistenceError) throw error; throw new A8PersistenceError('A8_MIGRATION_SOURCE_UNSUPPORTED', `${label} invalid: ${message(error)}`); }
}

function parseJson(value: string | Buffer, label: string): any {
  try { return JSON.parse(value.toString('utf8')); } catch (error) { throw new A8PersistenceError('A8_MIGRATION_SOURCE_UNSUPPORTED', `${label} JSON invalid: ${message(error)}`); }
}

function isSafeWorkspace(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as any).canonicalPath === 'string' &&
    typeof (value as any).displayName === 'string' && !/api.?key|password|authorization|credential|token|secret/i.test(JSON.stringify(value)));
}

function filterSafeSettings(value: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(['providerId', 'modelId', 'mode', 'gatewayUrl', 'caBundlePath', 'displayPreference', 'theme']);
  const output: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, item]) => {
    if (!allowed.has(key)) return;
    if (typeof item === 'string' && /api.?key|password|authorization|credential|token|secret/i.test(`${key}:${item}`)) return;
    if (typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number') output[key] = item;
  });
  return output;
}

function writeAtomicFile(filePath: string, content: string): void {
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx' });
  const fd = fs.openSync(temp, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, filePath);
}

function fsyncDirectory(directoryPath: string): void {
  try { const fd = fs.openSync(directoryPath, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } catch (_error) { /* Windows directory fsync is optional; file fsync remains required. */ }
}

function safeRemoveDirectory(directoryPath: string): void {
  try { fs.rmSync(directoryPath, { recursive: true, force: true }); } catch (_error) { /* caller retains failure state */ }
}
