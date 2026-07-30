import { InMemoryEventStore } from '../../src/store';
import { createDefaultRegistry } from '../../src/schema';
import { Event, EventType, MAX_PAYLOAD_SIZE, StateErrorCode } from '../../src/types';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    type: EventType.SESSION_START,
    timestamp: '2026-07-29T00:00:00.000Z',
    schemaVersion: 1,
    payload: {},
    sessionId: 'sess-1',
    ...overrides,
  };
}

describe('InMemoryEventStore', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    const registry = createDefaultRegistry();
    store = new InMemoryEventStore(registry);
    store.registerSession({ sessionId: 'sess-1', startedAt: '2026-07-29T00:00:00.000Z' });
  });

  describe('session management', () => {
    it('should register and check sessions', () => {
      expect(store.hasSession('sess-1')).toBe(true);
      expect(store.hasSession('nonexistent')).toBe(false);
    });

    it('should reject duplicate session registration', () => {
      expect(() =>
        store.registerSession({ sessionId: 'sess-1', startedAt: '2026-07-29T00:00:00.000Z' }),
      ).toThrow('Session already registered');
    });

    it('should end a session', () => {
      store.endSession('sess-1');
      const sessions = store.getSessions();
      expect(sessions[0].endedAt).toBeDefined();
    });

    it('should throw when ending nonexistent session', () => {
      expect(() => store.endSession('nonexistent')).toThrow('Session not found');
    });

    it('should list all sessions', () => {
      store.registerSession({ sessionId: 'sess-2', startedAt: '2026-07-29T01:00:00.000Z' });
      expect(store.getSessions()).toHaveLength(2);
    });
  });

  describe('append', () => {
    it('should append a valid event', () => {
      const event = makeEvent();
      const stored = store.append(event);
      expect(stored.id).toBe(event.id);
      expect(store.count()).toBe(1);
    });

    it('should reject duplicate event IDs', () => {
      const event = makeEvent({ id: 'dup-id' });
      store.append(event);
      expect(() => store.append(event)).toThrow('already exists');
    });

    it('should reject events for unregistered sessions', () => {
      const event = makeEvent({ sessionId: 'unknown-session' });
      expect(() => store.append(event)).toThrow('Session not found');
    });

    it('should reject events with oversized payloads', () => {
      const bigPayload = { data: 'x'.repeat(MAX_PAYLOAD_SIZE + 1) };
      const event = makeEvent({ payload: bigPayload });
      expect(() => store.append(event)).toThrow();
      try {
        store.append(makeEvent({ payload: bigPayload }));
      } catch (err: any) {
        expect(err.code).toBe(StateErrorCode.PAYLOAD_BUDGET_EXCEEDED);
      }
    });

    it('should reject events that fail schema validation', () => {
      const event = makeEvent({
        type: EventType.MODEL_REQUEST,
        payload: {}, // missing required 'modelId'
      });
      expect(() => store.append(event)).toThrow('validation failed');
    });
  });

  describe('query', () => {
    beforeEach(() => {
      store.append(makeEvent({ id: 'e1', type: EventType.SESSION_START, timestamp: '2026-07-29T00:00:00.000Z' }));
      store.append(makeEvent({ id: 'e2', type: EventType.MODEL_REQUEST, timestamp: '2026-07-29T00:01:00.000Z', payload: { modelId: 'gpt-4' } }));
      store.append(makeEvent({ id: 'e3', type: EventType.MODEL_RESPONSE, timestamp: '2026-07-29T00:02:00.000Z', payload: { modelId: 'gpt-4' } }));
      store.append(makeEvent({ id: 'e4', type: EventType.SESSION_END, timestamp: '2026-07-29T00:03:00.000Z' }));
    });

    it('should return all events with empty filter', () => {
      expect(store.query({})).toHaveLength(4);
    });

    it('should filter by type', () => {
      const results = store.query({ types: [EventType.MODEL_REQUEST] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('e2');
    });

    it('should filter by session ID', () => {
      const results = store.query({ sessionId: 'sess-1' });
      expect(results).toHaveLength(4);
    });

    it('should filter by time range', () => {
      const results = store.query({
        since: '2026-07-29T00:01:00.000Z',
        until: '2026-07-29T00:02:00.000Z',
      });
      expect(results).toHaveLength(2);
    });

    it('should support limit and offset', () => {
      const results = store.query({ limit: 2, offset: 1 });
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('e2');
    });

    it('should sort by timestamp ascending', () => {
      const results = store.query({});
      for (let i = 1; i < results.length; i++) {
        expect(new Date(results[i].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(results[i - 1].timestamp).getTime(),
        );
      }
    });
  });

  describe('getById', () => {
    it('should retrieve an event by ID', () => {
      const event = makeEvent({ id: 'find-me' });
      store.append(event);
      expect(store.getById('find-me')).toBeDefined();
      expect(store.getById('find-me')!.id).toBe('find-me');
    });

    it('should return undefined for unknown ID', () => {
      expect(store.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('count', () => {
    it('should count all events', () => {
      store.append(makeEvent({ id: 'c1' }));
      store.append(makeEvent({ id: 'c2' }));
      expect(store.count()).toBe(2);
    });

    it('should count with filter', () => {
      store.append(makeEvent({ id: 'c1', type: EventType.MODEL_REQUEST, payload: { modelId: 'gpt-4' } }));
      store.append(makeEvent({ id: 'c2', type: EventType.SESSION_END }));
      expect(store.count({ types: [EventType.MODEL_REQUEST] })).toBe(1);
    });
  });
});
