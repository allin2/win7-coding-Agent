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
