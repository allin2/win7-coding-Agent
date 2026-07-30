/**
 * index.ts — Module entry point for win7-agent-state.
 *
 * Re-exports all public types, classes, and functions.
 */

// Types
export {
  Event,
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
