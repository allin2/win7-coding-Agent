/**
 * store.ts — InMemoryEventStore with IEventStore interface.
 *
 * Append-only semantics, filter-based queries, payload truncation (64KB),
 * session foreign-key constraint, and schema version validation.
 * SQLite implementation is reserved behind the IEventStore interface.
 */

import {
  Event,
  EventFilter,
  EventType,
  MAX_PAYLOAD_SIZE,
  SessionInfo,
  StoredEvent,
  StateError,
  StateErrorCode,
  ValidationResult,
} from './types';
import { SchemaRegistry, validateEvent } from './schema';

/** Abstract interface for event stores. SQLite implementation will conform to this. */
export interface IEventStore {
  /** Append a single event. Returns the stored event. */
  append(event: Event): StoredEvent;

  /** Validate and append a batch atomically. Either every event is visible or none are. */
  appendBatch(events: readonly Event[]): StoredEvent[];

  /** Query events matching the given filter. */
  query(filter: EventFilter): StoredEvent[];

  /** Retrieve a single event by its ID. */
  getById(id: string): StoredEvent | undefined;

  /** Count events matching the given filter. */
  count(filter?: EventFilter): number;

  /** Register a session (foreign-key prerequisite). */
  registerSession(session: SessionInfo): void;

  /** Check if a session exists. */
  hasSession(sessionId: string): boolean;

  /** End a session. */
  endSession(sessionId: string): void;

  /** Get all sessions. */
  getSessions(): SessionInfo[];
}

/** In-memory implementation of IEventStore. */
export class InMemoryEventStore implements IEventStore {
  private events: StoredEvent[] = [];
  private eventsById = new Map<string, StoredEvent>();
  private sessions = new Map<string, SessionInfo>();
  private nextSequenceBySession = new Map<string, number>();
  private schemaRegistry: SchemaRegistry;
  private readonly maxEvents: number;

  constructor(schemaRegistry?: SchemaRegistry, maxEvents: number = 100_000) {
    if (!Number.isInteger(maxEvents) || maxEvents < 1) {
      throw new StateError(
        StateErrorCode.EVENTSTORE_CAPACITY_EXCEEDED,
        'maxEvents must be a positive integer',
      );
    }
    this.schemaRegistry = schemaRegistry ?? new SchemaRegistry();
    this.maxEvents = maxEvents;
  }

  /** Expose the schema registry for external use. */
  getRegistry(): SchemaRegistry {
    return this.schemaRegistry;
  }

  registerSession(session: SessionInfo): void {
    if (this.sessions.has(session.sessionId)) {
      throw new StateError(
        StateErrorCode.EVENTSTORE_CONSTRAINT_VIOLATION,
        `Session already registered: ${session.sessionId}`,
      );
    }
    this.sessions.set(session.sessionId, { ...session });
    this.nextSequenceBySession.set(session.sessionId, 1);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new StateError(
        StateErrorCode.EVENTSTORE_CONSTRAINT_VIOLATION,
        `Session not found: ${sessionId}`,
      );
    }
    session.endedAt = new Date().toISOString();
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values(), (session) => ({ ...session }));
  }

  append(event: Event): StoredEvent {
    return this.appendBatch([event])[0];
  }

  appendBatch(events: readonly Event[]): StoredEvent[] {
    if (events.length === 0) return [];
    const stagedById = new Map<string, StoredEvent>();
    const stagedOrder: StoredEvent[] = [];
    const results: StoredEvent[] = [];
    const nextBySession = new Map(this.nextSequenceBySession);
    for (const event of events) {
      // Idempotency must never become a schema-validation bypass.
      this.validateForAppend(event);
      const existing = this.eventsById.get(event.id) ?? stagedById.get(event.id);
      if (existing) {
        if (!sameEventIdentity(existing, event)) {
          throw new StateError(
            StateErrorCode.EVENTSTORE_CONSTRAINT_VIOLATION,
            `Event with id ${event.id} conflicts with an existing event`,
          );
        }
        results.push(cloneStoredEvent(existing));
        continue;
      }
      const sequence = nextBySession.get(event.sessionId) ?? 1;
      nextBySession.set(event.sessionId, sequence + 1);
      const stored = toStoredEvent(event, sequence);
      stagedById.set(stored.id, stored);
      stagedOrder.push(stored);
      results.push(cloneStoredEvent(stored));
    }
    if (this.events.length + stagedOrder.length > this.maxEvents) {
      throw new StateError(
        StateErrorCode.EVENTSTORE_CAPACITY_EXCEEDED,
        `Event store capacity ${this.maxEvents} would be exceeded`,
      );
    }
    for (const stored of stagedOrder) {
      this.events.push(stored);
      this.eventsById.set(stored.id, stored);
    }
    this.nextSequenceBySession = nextBySession;
    return results;
  }

  private validateForAppend(event: Event): void {
    let payloadStr: string;
    try {
      payloadStr = JSON.stringify(event.payload);
    } catch (error) {
      throw new StateError(
        StateErrorCode.EVENTSTORE_CONSTRAINT_VIOLATION,
        `Payload is not JSON serializable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const payloadBytes = Buffer.byteLength(payloadStr, 'utf8');
    if (payloadBytes > MAX_PAYLOAD_SIZE) {
      throw new StateError(
        StateErrorCode.PAYLOAD_BUDGET_EXCEEDED,
        `Payload size ${payloadBytes} bytes exceeds limit ${MAX_PAYLOAD_SIZE}`,
      );
    }

    if (!this.sessions.has(event.sessionId)) {
      throw new StateError(
        StateErrorCode.EVENTSTORE_CONSTRAINT_VIOLATION,
        `Session not found: ${event.sessionId}. Register session before appending events.`,
      );
    }

    const validation: ValidationResult = validateEvent(event, this.schemaRegistry);
    if (!validation.valid) {
      throw new StateError(
        StateErrorCode.EVENTSTORE_CONSTRAINT_VIOLATION,
        `Event validation failed: ${validation.errors.join('; ')}`,
      );
    }
  }

  query(filter: EventFilter): StoredEvent[] {
    let results = this.events.slice();

    if (filter.types && filter.types.length > 0) {
      const typeSet = new Set<string>(filter.types);
      results = results.filter((e) => typeSet.has(e.type));
    }

    if (filter.sessionId) {
      results = results.filter((e) => e.sessionId === filter.sessionId);
    }
    if (filter.threadId) {
      results = results.filter((e) => e.threadId === filter.threadId);
    }
    if (filter.runId) {
      results = results.filter((e) => e.runId === filter.runId);
    }

    if (filter.since) {
      const sinceTime = new Date(filter.since).getTime();
      results = results.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
    }

    if (filter.until) {
      const untilTime = new Date(filter.until).getTime();
      results = results.filter((e) => new Date(e.timestamp).getTime() <= untilTime);
    }

    // Sort by timestamp ascending.
    results.sort((a, b) => {
      const timeDifference =
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (timeDifference !== 0) return timeDifference;
      const sessionDifference = a.sessionId.localeCompare(b.sessionId);
      return sessionDifference !== 0
        ? sessionDifference
        : a.sequence - b.sequence;
    });

    const offset = filter.offset ?? 0;
    if (offset > 0) {
      results = results.slice(offset);
    }

    if (filter.limit !== undefined && filter.limit >= 0) {
      results = results.slice(0, filter.limit);
    }

    return results.map(cloneStoredEvent);
  }

  getById(id: string): StoredEvent | undefined {
    const event = this.eventsById.get(id);
    return event ? cloneStoredEvent(event) : undefined;
  }

  count(filter?: EventFilter): number {
    if (!filter) {
      return this.events.length;
    }
    return this.query(filter).length;
  }
}

function toStoredEvent(event: Event, sequence: number): StoredEvent {
  return {
    ...event,
    payload: cloneJson(event.payload),
    threadId: event.threadId ?? event.sessionId,
    runId: event.runId ?? event.sessionId,
    sequence,
  };
}

function cloneStoredEvent(event: StoredEvent): StoredEvent {
  return {
    ...event,
    payload: cloneJson(event.payload),
  };
}

function sameEventIdentity(stored: StoredEvent, incoming: Event): boolean {
  return canonicalJson({
    id: stored.id,
    type: stored.type,
    timestamp: stored.timestamp,
    schemaVersion: stored.schemaVersion,
    payload: stored.payload,
    sessionId: stored.sessionId,
    threadId: stored.threadId,
    runId: stored.runId,
  }) === canonicalJson({
    id: incoming.id,
    type: incoming.type,
    timestamp: incoming.timestamp,
    schemaVersion: incoming.schemaVersion,
    payload: cloneJson(incoming.payload),
    sessionId: incoming.sessionId,
    threadId: incoming.threadId ?? incoming.sessionId,
    runId: incoming.runId ?? incoming.sessionId,
  });
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new StateError(
    StateErrorCode.EVENTSTORE_CONSTRAINT_VIOLATION,
    `Event identity contains unsupported value: ${typeof value}`,
  );
}
