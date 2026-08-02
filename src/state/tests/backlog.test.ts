/**
 * backlog.test.ts — BacklogQueue tests.
 */
import { BacklogQueue, BackpressureSignal } from '../src/backlog';
import { InMemoryEventStore } from '../src/store';
import { createDefaultRegistry } from '../src/schema';
import {
  Event,
  EventType,
  StateError,
  StateErrorCode,
} from '../src/types';

// ── helpers ──────────────────────────────────────────────────────────
let idCounter = 0;
function makeEvent(overrides: Partial<Event> = {}): Event {
  idCounter++;
  return {
    id: `bq-evt-${idCounter}`,
    type: EventType.MODEL_REQUEST,
    timestamp: `2025-01-01T00:00:${String(idCounter).padStart(2, '0')}.000Z`,
    schemaVersion: 1,
    payload: { modelId: 'gpt-4' },
    sessionId: 'sess-1',
    ...overrides,
  };
}

// ── Constructor ──────────────────────────────────────────────────────
describe('BacklogQueue — constructor', () => {
  test('creates queue with given maxSize', () => {
    const q = new BacklogQueue({ maxSize: 10 });
    expect(q.getMaxSize()).toBe(10);
  });

  test('maxSize < 1 throws', () => {
    expect(() => new BacklogQueue({ maxSize: 0 })).toThrow(/maxSize must be at least 1/);
    expect(() => new BacklogQueue({ maxSize: -5 })).toThrow(/maxSize must be at least 1/);
  });

  test('default warningThreshold is 0.8', () => {
    const signals: BackpressureSignal[] = [];
    const q = new BacklogQueue({
      maxSize: 10,
      onBackpressure: (s) => signals.push(s),
    });
    for (let i = 0; i < 7; i++) q.enqueue(makeEvent());
    expect(signals).toHaveLength(0);
    q.enqueue(makeEvent()); // 8/10 = 80%
    expect(signals).toHaveLength(1);
  });
});

// ── enqueue / dequeue ────────────────────────────────────────────────
describe('BacklogQueue — enqueue & dequeue', () => {
  test('enqueue returns true', () => {
    const q = new BacklogQueue({ maxSize: 5 });
    expect(q.enqueue(makeEvent())).toBe(true);
  });

  test('size increases after enqueue', () => {
    const q = new BacklogQueue({ maxSize: 5 });
    q.enqueue(makeEvent());
    q.enqueue(makeEvent());
    expect(q.size()).toBe(2);
  });

  test('dequeue returns event in FIFO order', () => {
    const q = new BacklogQueue({ maxSize: 5 });
    const e1 = makeEvent({ id: 'first' });
    const e2 = makeEvent({ id: 'second' });
    q.enqueue(e1);
    q.enqueue(e2);
    expect(q.dequeue()?.id).toBe('first');
    expect(q.dequeue()?.id).toBe('second');
  });

  test('dequeue on empty queue returns undefined', () => {
    const q = new BacklogQueue({ maxSize: 5 });
    expect(q.dequeue()).toBeUndefined();
  });

  test('isEmpty and isFull', () => {
    const q = new BacklogQueue({ maxSize: 2 });
    expect(q.isEmpty()).toBe(true);
    expect(q.isFull()).toBe(false);
    q.enqueue(makeEvent());
    expect(q.isEmpty()).toBe(false);
    q.enqueue(makeEvent());
    expect(q.isFull()).toBe(true);
  });
});

// ── backpressure ─────────────────────────────────────────────────────
describe('BacklogQueue — backpressure', () => {
  test('EVENTSTORE_BACKPRESSURE when queue is full', () => {
    const q = new BacklogQueue({ maxSize: 2 });
    q.enqueue(makeEvent());
    q.enqueue(makeEvent());
    expect(() => q.enqueue(makeEvent())).toThrow(StateError);
    try {
      q.enqueue(makeEvent());
    } catch (e) {
      expect((e as StateError).code).toBe(StateErrorCode.EVENTSTORE_BACKPRESSURE);
    }
  });

  test('backpressure callback fires at threshold', () => {
    const signals: BackpressureSignal[] = [];
    const q = new BacklogQueue({
      maxSize: 10,
      warningThreshold: 0.5,
      onBackpressure: (s) => signals.push(s),
    });
    for (let i = 0; i < 5; i++) q.enqueue(makeEvent());
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(signals[0].utilization).toBeGreaterThanOrEqual(0.5);
    expect(signals[0].currentSize).toBe(5);
    expect(signals[0].maxSize).toBe(10);
  });

  test('backpressure signal message contains utilization', () => {
    const signals: BackpressureSignal[] = [];
    const q = new BacklogQueue({
      maxSize: 10,
      warningThreshold: 0.8,
      onBackpressure: (s) => signals.push(s),
    });
    for (let i = 0; i < 8; i++) q.enqueue(makeEvent());
    expect(signals[0].message).toMatch(/80\.0%/);
  });

  test('rejected count increments on full queue', () => {
    const q = new BacklogQueue({ maxSize: 1 });
    q.enqueue(makeEvent());
    try { q.enqueue(makeEvent()); } catch { /* expected */ }
    try { q.enqueue(makeEvent()); } catch { /* expected */ }
    expect(q.getTotalRejected()).toBe(2);
  });
});

// ── drain ────────────────────────────────────────────────────────────
describe('BacklogQueue — drain', () => {
  test('drain flushes all events to store', () => {
    const q = new BacklogQueue({ maxSize: 10 });
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    q.enqueue(makeEvent());
    q.enqueue(makeEvent());
    q.enqueue(makeEvent());
    const count = q.drain(store);
    expect(count).toBe(3);
    expect(q.isEmpty()).toBe(true);
    expect(store.count()).toBe(3);
  });

  test('drain on empty queue returns 0', () => {
    const q = new BacklogQueue({ maxSize: 10 });
    const store = new InMemoryEventStore(createDefaultRegistry());
    expect(q.drain(store)).toBe(0);
  });

  test('failed drain leaves the whole queue available for retry', () => {
    const q = new BacklogQueue({ maxSize: 10 });
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    q.enqueue(makeEvent({ id: 'same-id' }));
    q.enqueue(makeEvent({ id: 'same-id' }));

    expect(() => q.drain(store)).toThrow(StateError);
    expect(q.size()).toBe(2);
    expect(q.getTotalDequeued()).toBe(0);
    expect(store.count()).toBe(0);
  });
});

// ── statistics ───────────────────────────────────────────────────────
describe('BacklogQueue — statistics', () => {
  test('totalEnqueued tracks lifetime enqueues', () => {
    const q = new BacklogQueue({ maxSize: 10 });
    q.enqueue(makeEvent());
    q.enqueue(makeEvent());
    expect(q.getTotalEnqueued()).toBe(2);
  });

  test('totalDequeued tracks lifetime dequeues', () => {
    const q = new BacklogQueue({ maxSize: 10 });
    q.enqueue(makeEvent());
    q.enqueue(makeEvent());
    q.dequeue();
    expect(q.getTotalDequeued()).toBe(1);
  });

  test('clear returns discarded events and empties queue', () => {
    const q = new BacklogQueue({ maxSize: 10 });
    q.enqueue(makeEvent({ id: 'c1' }));
    q.enqueue(makeEvent({ id: 'c2' }));
    const discarded = q.clear();
    expect(discarded).toHaveLength(2);
    expect(q.isEmpty()).toBe(true);
    expect(q.size()).toBe(0);
  });
});

// ── 空队列/满队列边界 ────────────────────────────────────────────────
describe('BacklogQueue — 边界条件', () => {
  test('maxSize=1 的队列：入队/满/拒绝', () => {
    const q = new BacklogQueue({ maxSize: 1 });
    expect(q.enqueue(makeEvent())).toBe(true);
    expect(q.isFull()).toBe(true);
    expect(() => q.enqueue(makeEvent())).toThrow(StateError);
  });

  test('连续 enqueue-dequeue 不泄漏', () => {
    const q = new BacklogQueue({ maxSize: 3 });
    for (let i = 0; i < 100; i++) {
      q.enqueue(makeEvent());
      q.dequeue();
    }
    expect(q.size()).toBe(0);
    expect(q.getTotalEnqueued()).toBe(100);
    expect(q.getTotalDequeued()).toBe(100);
  });
});

// ── C10 中文路径兼容 ─────────────────────────────────────────────────
describe('C10 — 中文路径兼容', () => {
  test('中文 sessionId 事件可以正常入队出队', () => {
    const q = new BacklogQueue({ maxSize: 5 });
    const event = makeEvent({ sessionId: '会话-中文测试' });
    q.enqueue(event);
    const out = q.dequeue();
    expect(out?.sessionId).toBe('会话-中文测试');
  });
});
