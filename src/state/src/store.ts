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
  StateError,
  StateErrorCode,
  ValidationResult,
} from './types';
import { SchemaRegistry, validateEvent } from './schema';

/** Abstract interface for event stores. SQLite implementation will conform to this. */
export interface IEventStore {
  /** Append a single event. Returns the stored event. */
  append(event: Event): Event;

  /** Query events matching the given filter. */
  query(filter: EventFilter): Event[];

  /** Retrieve a single event by its ID. */
  getById(id: string): Event | undefined;

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
  private events: Event[] = [];
  private eventsById = new Map<string, Event>();
  private sessions = new Map<string, SessionInfo>();
  private schemaRegistry: SchemaRegistry;

  constructor(schemaRegistry?: SchemaRegistry) {
    this.schemaRegistry = schemaRegistry ?? new SchemaRegistry();
  }

  /** Expose the schema registry for external use. */
  getRegistry(): SchemaRegistry {
    return this.schemaRegistry;
  }

  registerSession(session: SessionInfo): void {
    if (this.sessions.has(session.sessionId)) {
      throw new Error(`Session already registered: ${session.sessionId}`);
    }
    this.sessions.set(session.sessionId, { ...session });
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.endedAt = new Date().toISOString();
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  append(event: Event): Event {
    // Payload size check.
    const payloadStr = JSON.stringify(event.payload);
    if (payloadStr.length > MAX_PAYLOAD_SIZE) {
      throw new StateError(
        StateErrorCode.PAYLOAD_BUDGET_EXCEEDED,
        `Payload size ${payloadStr.length} exceeds limit ${MAX_PAYLOAD_SIZE}`,
      );
    }

    // Session foreign-key constraint.
    if (!this.sessions.has(event.sessionId)) {
      throw new Error(
        `Session not found: ${event.sessionId}. Register session before appending events.`,
      );
    }

    // Schema validation.
    const validation: ValidationResult = validateEvent(event, this.schemaRegistry);
    if (!validation.valid) {
      throw new Error(`Event validation failed: ${validation.errors.join('; ')}`);
    }

    // Duplicate ID check.
    if (this.eventsById.has(event.id)) {
      throw new Error(`Event with id ${event.id} already exists`);
    }

    const stored: Event = { ...event };
    this.events.push(stored);
    this.eventsById.set(event.id, stored);
    return stored;
  }

  query(filter: EventFilter): Event[] {
    let results = this.events.slice();

    if (filter.types && filter.types.length > 0) {
      const typeSet = new Set<string>(filter.types);
      results = results.filter((e) => typeSet.has(e.type));
    }

    if (filter.sessionId) {
      results = results.filter((e) => e.sessionId === filter.sessionId);
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
    results.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const offset = filter.offset ?? 0;
    if (offset > 0) {
      results = results.slice(offset);
    }

    if (filter.limit !== undefined && filter.limit >= 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  getById(id: string): Event | undefined {
    return this.eventsById.get(id);
  }

  count(filter?: EventFilter): number {
    if (!filter) {
      return this.events.length;
    }
    return this.query(filter).length;
  }
}
