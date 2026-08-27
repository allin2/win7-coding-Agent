/**
 * index.ts — Module entry point for win7-agent-state.
 *
 * Re-exports all public types, classes, and functions.
 */

// Types
export {
  Event,
  StoredEvent,
  EventType,
  EventFilter,
  ValidationResult,
  StateErrorCode,
  StateError,
  MAX_PAYLOAD_SIZE,
  SessionInfo,
} from './types';

// Schema
export {
  PayloadSchema,
  SchemaRegistry,
  validateEvent,
  createDefaultRegistry,
} from './schema';

// Store
export { IEventStore, InMemoryEventStore } from './store';

// WAL
export {
  TransactionState,
  WALTransaction,
  WALManager,
} from './wal';

// Backlog
export {
  BackpressureSignal,
  BackpressureCallback,
  BacklogQueueOptions,
  BacklogQueue,
} from './backlog';

// Audit
export {
  SanitizeOptions,
  AuditSummary,
  ExportResult,
  AuditExporter,
} from './audit';

// Replay
export {
  ReplayResult,
  VerificationResult,
  SessionState,
  ReplayEngine,
} from './replay';

// V2 fact protocol and per-subscriber delivery boundary
export {
  JsonValue,
  EventEnvelopeInputV2,
  EventEnvelopeV2,
  EventLedger,
  EventProtocolWarning,
  ProjectedToolResult,
  FileChangeProjection,
  ThreadProjection,
  InMemoryEventLedger,
  projectThread,
} from './event-protocol';
export {
  SqliteDatabase,
  SqliteEventLedger,
  SqliteEventLedgerOptions,
  SqliteRuntimeProfile,
  SqliteStatement,
} from './sqlite-event-ledger';
export { EventSubscription, EventStream } from './event-stream';
export {
  RuntimeEventLike,
  RUNTIME_EVENT_TYPE_MAP,
  RuntimeEventLedgerSink,
} from './runtime-event-adapter';
export {
  RuntimeProjectionRequest,
  RuntimeMessageProjection,
} from './runtime-message-projector';
export {
  A8GoalRecord,
  A8GoalStatus,
  A8SessionCatalog,
  A8SessionCatalogOptions,
  A8SessionCatalogSnapshot,
  A8SessionFact,
  A8SessionRecord,
  A8SessionStatus,
  A8TurnIdentity,
  A8WorkspaceRecord,
} from './a8-session-catalog';
export {
  A8_MAX_PERSISTED_JSON_BYTES,
  A8_MAX_REVIEW_JSON_BYTES,
  A8_PERSISTENCE_SCHEMA_VERSION,
  A8MigrationRunner,
  A8PersistentCatalog,
  A8PersistenceError,
  A8RecoveryCoordinator,
} from './a8-persistence';
export type {
  A8MigrationResult,
  A8MigrationSource,
  A8PersistedReview,
  A8PersistedReviewFile,
  A8PersistedRun,
  A8PersistedTask,
  A8PersistedTaskState,
  A8PersistedValidation,
  A8PersistentCatalogOptions,
  A8PersistenceErrorCode,
  A8RecoveryReport,
  A8ReviewPersistenceStatus,
} from './a8-persistence';

export {
  A9_SCHEMA_VERSION,
  A9_DEFAULT_RETENTION_DAYS,
  A9_MAX_ACTIVE_CONVERSATIONS,
  A9PermissionModeValue,
  A9ConversationStateValue,
  A9ConversationActivityValue,
  A9ConversationTitleSource,
  A9ConversationRecord,
  A9OpenOptions,
  A9OpenOutcome,
  A9PersistenceManager,
} from './a9-persistence';
