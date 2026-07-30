/**
 * types.ts — Core type definitions for the State & Audit module.
 *
 * Defines the Event base type, EventType enumeration, EventFilter,
 * and related error codes per PHASE_05_STATE_AUDIT §5.
 */

/** All supported event types in the system. */
export enum EventType {
  MODEL_REQUEST = 'model.request',
  MODEL_RESPONSE = 'model.response',
  TOOL_REQUEST = 'tool.request',
  TOOL_RESULT = 'tool.result',
  RUN_STATUS = 'run.status',
  POLICY_DECISION = 'policy.decision',
  SESSION_START = 'session.start',
  SESSION_END = 'session.end',
}

/** Base event structure. Every event stored in the EventStore conforms to this. */
export interface Event {
  /** Unique identifier (UUID v4). */
  id: string;
  /** Event type from the EventType enumeration. */
  type: EventType;
  /** ISO-8601 timestamp of when the event was created. */
  timestamp: string;
  /** Schema version that governs the payload structure. */
  schemaVersion: number;
  /** Event-specific payload. Structure depends on type + schemaVersion. */
  payload: unknown;
  /** Session this event belongs to. */
  sessionId: string;
}

/** Filter criteria for querying events from the store. */
export interface EventFilter {
  /** Filter by event types (empty array = all types). */
  types?: EventType[];
  /** Filter by session ID. */
  sessionId?: string;
  /** Inclusive lower bound for timestamp (ISO-8601). */
  since?: string;
  /** Inclusive upper bound for timestamp (ISO-8601). */
  until?: string;
  /** Maximum number of events to return. */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
}

/** Result of a schema validation. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Error codes per PHASE_05_STATE_AUDIT §5. */
export enum StateErrorCode {
  EVENTSTORE_BACKPRESSURE = 'EVENTSTORE_BACKPRESSURE',
  PAYLOAD_BUDGET_EXCEEDED = 'PAYLOAD_BUDGET_EXCEEDED',
  SCHEMA_MIGRATION_FAILED = 'SCHEMA_MIGRATION_FAILED',
  RECOVERY_INCONSISTENT = 'RECOVERY_INCONSISTENT',
}

/** Custom error class for state module errors. */
export class StateError extends Error {
  constructor(
    public readonly code: StateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StateError';
  }
}

/** Payload size limit: 64 KB. */
export const MAX_PAYLOAD_SIZE = 64 * 1024;

/** Session descriptor for foreign-key tracking. */
export interface SessionInfo {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
}
