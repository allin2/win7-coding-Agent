/**
 * store.test.ts — InMemoryEventStore tests.
 */
import { InMemoryEventStore } from '../src/store';
import { createDefaultRegistry } from '../src/schema';
import {
  Event,
  EventType,
  MAX_PAYLOAD_SIZE,
  SessionInfo,
  StateError,
  StateErrorCode,
} from '../src/types';

// ── helpers ──────────────────────────────────────────────────────────
let idCounter = 0;
function makeEvent(overrides: Partial<Event> = {}): Event {
  idCounter++;
  return {
    id: `evt-${idCounter}`,
    type: EventType.MODEL_REQUEST,
    timestamp: `2025-01-01T00:00:${String(idCounter).padStart(2, '0')}.000Z`,
    schemaVersion: 1,
    payload: { modelId: 'gpt-4' },
    sessionId: 'sess-1',
    ...overrides,
  };
}

function createStore(): InMemoryEventStore {
  return new InMemoryEventStore(createDefaultRegistry());
}

function createStoreWithSession(): InMemoryEventStore {
  const store = createStore();
  store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
  return store;
}

// ── Session management ───────────────────────────────────────────────
describe('InMemoryEventStore — sessions', () => {
  test('registerSession and hasSession', () => {
    const store = createStore();
    expect(store.hasSession('sess-1')).toBe(false);
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    expect(store.hasSession('sess-1')).toBe(true);
  });

  test('duplicate registerSession throws', () => {
    const store = createStore();
    const session: SessionInfo = { sessionId: 's1', startedAt: '2025-01-01T00:00:00.000Z' };
    store.registerSession(session);
    expect(() => store.registerSession(session)).toThrow(/already registered/);
  });

  test('endSession sets endedAt', () => {
    const store = createStore();
    store.registerSession({ sessionId: 's1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.endSession('s1');
    const sessions = store.getSessions();
    expect(sessions[0].endedAt).toBeDefined();
  });

  test('endSession on unknown session throws', () => {
    const store = createStore();
    expect(() => store.endSession('unknown')).toThrow(/not found/);
  });

  test('getSessions returns all sessions', () => {
    const store = createStore();
    store.registerSession({ sessionId: 's1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.registerSession({ sessionId: 's2', startedAt: '2025-01-01T00:00:00.000Z' });
    expect(store.getSessions()).toHaveLength(2);
  });
});

// ── append ───────────────────────────────────────────────────────────
describe('InMemoryEventStore — append', () => {
  test('append returns stored event', () => {
    const store = createStoreWithSession();
    const event = makeEvent();
    const stored = store.append(event);
    expect(stored.id).toBe(event.id);
    expect(stored).toEqual({
      ...event,
      threadId: event.sessionId,
      runId: event.sessionId,
      sequence: 1,
    });
  });

  test('append without session throws', () => {
    const store = createStore();
    expect(() => store.append(makeEvent())).toThrow(/Session not found/);
  });

  test('conflicting duplicate id throws', () => {
    const store = createStoreWithSession();
    const e1 = makeEvent({ id: 'dup' });
    store.append(e1);
    expect(() => store.append(makeEvent({ id: 'dup' }))).toThrow(/conflicts/);
  });

  test('same id and same content is idempotent', () => {
    const store = createStoreWithSession();
    const event = makeEvent({ id: 'retry' });
    const first = store.append(event);
    const retry = store.append({ ...event, payload: { modelId: 'gpt-4' } });
    expect(retry).toEqual(first);
    expect(store.count()).toBe(1);
  });

  test('assigns stable per-session sequence and run/thread identity', () => {
    const store = createStoreWithSession();
    const first = store.append(makeEvent({
      id: 'seq-1',
      threadId: 'thread-1',
      runId: 'run-1',
    }));
    const second = store.append(makeEvent({
      id: 'seq-2',
      threadId: 'thread-1',
      runId: 'run-1',
    }));
    expect([first.sequence, second.sequence]).toEqual([1, 2]);
    expect(second).toMatchObject({
      threadId: 'thread-1',
      runId: 'run-1',
    });
  });

  test('PAYLOAD_BUDGET_EXCEEDED on oversized payload', () => {
    const store = createStoreWithSession();
    const bigPayload = { data: 'x'.repeat(MAX_PAYLOAD_SIZE + 1) };
    const event = makeEvent({ payload: bigPayload });
    expect(() => store.append(event)).toThrow(StateError);
    try {
      store.append(makeEvent({ id: 'evt-x', payload: bigPayload }));
    } catch (e) {
      expect((e as StateError).code).toBe(StateErrorCode.PAYLOAD_BUDGET_EXCEEDED);
    }
  });

  test('schema validation failure throws', () => {
    const store = createStoreWithSession();
    const event = makeEvent({ payload: {} });
    expect(() => store.append(event)).toThrow(/validation failed/);
  });

  test('append stores a copy (not reference)', () => {
    const store = createStoreWithSession();
    const event = makeEvent();
    store.append(event);
    event.payload = { modelId: 'modified' };
    const stored = store.getById(event.id);
    expect((stored?.payload as any).modelId).toBe('gpt-4');
  });
});

// ── query ────────────────────────────────────────────────────────────
describe('InMemoryEventStore — query', () => {
  test('empty filter returns all events', () => {
    const store = createStoreWithSession();
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    store.append(makeEvent({ type: EventType.TOOL_REQUEST, payload: { toolName: 'bash' } }));
    expect(store.query({})).toHaveLength(2);
  });

  test('filter by types', () => {
    const store = createStoreWithSession();
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    store.append(makeEvent({ type: EventType.TOOL_REQUEST, payload: { toolName: 'bash' } }));
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    const results = store.query({ types: [EventType.MODEL_REQUEST] });
    expect(results).toHaveLength(2);
  });

  test('filter by sessionId', () => {
    const store = createStoreWithSession();
    store.registerSession({ sessionId: 'sess-2', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ sessionId: 'sess-1' }));
    store.append(makeEvent({ sessionId: 'sess-2' }));
    const results = store.query({ sessionId: 'sess-2' });
    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe('sess-2');
  });

  test('filter by threadId and runId', () => {
    const store = createStoreWithSession();
    store.append(makeEvent({
      id: 'run-a',
      threadId: 'thread-1',
      runId: 'run-1',
    }));
    store.append(makeEvent({
      id: 'run-b',
      threadId: 'thread-1',
      runId: 'run-2',
    }));
    expect(store.query({ threadId: 'thread-1' })).toHaveLength(2);
    expect(store.query({ runId: 'run-2' }).map((event) => event.id))
      .toEqual(['run-b']);
  });

  test('filter by since/until', () => {
    const store = createStoreWithSession();
    store.append(makeEvent({ timestamp: '2025-01-01T00:00:01.000Z' }));
    store.append(makeEvent({ timestamp: '2025-01-01T00:00:02.000Z' }));
    store.append(makeEvent({ timestamp: '2025-01-01T00:00:03.000Z' }));
    const results = store.query({
      since: '2025-01-01T00:00:02.000Z',
      until: '2025-01-01T00:00:02.000Z',
    });
    expect(results).toHaveLength(1);
  });

  test('results sorted by timestamp ascending', () => {
    const store = createStoreWithSession();
    store.append(makeEvent({ timestamp: '2025-01-01T00:00:03.000Z' }));
    store.append(makeEvent({ timestamp: '2025-01-01T00:00:01.000Z' }));
    store.append(makeEvent({ timestamp: '2025-01-01T00:00:02.000Z' }));
    const results = store.query({});
    expect(results[0].timestamp).toBe('2025-01-01T00:00:01.000Z');
    expect(results[2].timestamp).toBe('2025-01-01T00:00:03.000Z');
  });

  test('pagination with limit and offset', () => {
    const store = createStoreWithSession();
    for (let i = 0; i < 10; i++) {
      store.append(makeEvent({ timestamp: `2025-01-01T00:00:${String(i).padStart(2, '0')}.000Z` }));
    }
    const page = store.query({ limit: 3, offset: 2 });
    expect(page).toHaveLength(3);
  });

  test('limit 0 returns empty', () => {
    const store = createStoreWithSession();
    store.append(makeEvent());
    expect(store.query({ limit: 0 })).toHaveLength(0);
  });

  test('offset beyond length returns empty', () => {
    const store = createStoreWithSession();
    store.append(makeEvent());
    expect(store.query({ offset: 100 })).toHaveLength(0);
  });
});

// ── getById / count ──────────────────────────────────────────────────
describe('InMemoryEventStore — getById & count', () => {
  test('getById returns stored event', () => {
    const store = createStoreWithSession();
    const event = makeEvent({ id: 'findme' });
    store.append(event);
    expect(store.getById('findme')).toMatchObject(event);
  });

  test('getById returns undefined for unknown id', () => {
    const store = createStoreWithSession();
    expect(store.getById('nope')).toBeUndefined();
  });

  test('count without filter returns total', () => {
    const store = createStoreWithSession();
    store.append(makeEvent());
    store.append(makeEvent());
    expect(store.count()).toBe(2);
  });

  test('count with filter', () => {
    const store = createStoreWithSession();
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    store.append(makeEvent({ type: EventType.TOOL_REQUEST, payload: { toolName: 'bash' } }));
    expect(store.count({ types: [EventType.MODEL_REQUEST] })).toBe(1);
  });
});

describe('InMemoryEventStore — atomic batch and capacity', () => {
  test('appendBatch publishes no events when duplicate IDs conflict', () => {
    const store = createStoreWithSession();
    const valid = makeEvent({ id: 'batch-duplicate' });
    const duplicate = makeEvent({ id: 'batch-duplicate' });

    expect(() => store.appendBatch([valid, duplicate])).toThrow(StateError);
    expect(store.count()).toBe(0);
  });

  test('maxEvents rejects a batch before publishing it', () => {
    const store = new InMemoryEventStore(createDefaultRegistry(), 1);
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });

    expect(() => store.appendBatch([makeEvent(), makeEvent()])).toThrow(
      expect.objectContaining({ code: StateErrorCode.EVENTSTORE_CAPACITY_EXCEEDED }),
    );
    expect(store.count()).toBe(0);
  });

  test('payload budget is measured in UTF-8 bytes', () => {
    const store = createStoreWithSession();
    const multiBytePayload = { modelId: '中'.repeat(MAX_PAYLOAD_SIZE / 2) };

    expect(() => store.append(makeEvent({ payload: multiBytePayload }))).toThrow(
      expect.objectContaining({ code: StateErrorCode.PAYLOAD_BUDGET_EXCEEDED }),
    );
  });
});

// ── empty store ──────────────────────────────────────────────────────
describe('InMemoryEventStore — empty store edge cases', () => {
  test('query on empty store returns []', () => {
    const store = createStore();
    expect(store.query({})).toEqual([]);
  });

  test('count on empty store returns 0', () => {
    const store = createStore();
    expect(store.count()).toBe(0);
  });

  test('getSessions on empty store returns []', () => {
    const store = createStore();
    expect(store.getSessions()).toEqual([]);
  });
});

// ── C10 中文路径兼容 ─────────────────────────────────────────────────
describe('C10 — 中文路径兼容', () => {
  test('中文 sessionId 可以正常存取', () => {
    const store = createStore();
    store.registerSession({ sessionId: '会话-001', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ sessionId: '会话-001' }));
    const results = store.query({ sessionId: '会话-001' });
    expect(results).toHaveLength(1);
  });

  test('中文 payload 值可以正常存取', () => {
    const store = createStoreWithSession();
    store.append(
      makeEvent({
        type: EventType.RUN_STATUS,
        payload: { status: '运行中', message: '任务执行正常' },
      }),
    );
    const results = store.query({});
    expect(results).toHaveLength(1);
    expect((results[0].payload as any).status).toBe('运行中');
  });
});
