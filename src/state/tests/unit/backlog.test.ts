import { BacklogQueue, BackpressureSignal } from '../../src/backlog';
import { InMemoryEventStore } from '../../src/store';
import { createDefaultRegistry } from '../../src/schema';
import { Event, EventType, StateErrorCode } from '../../src/types';

function makeEvent(id: string): Event {
  return {
    id,
    type: EventType.SESSION_START,
    timestamp: '2026-07-29T00:00:00.000Z',
    schemaVersion: 1,
    payload: {},
    sessionId: 'sess-1',
  };
}

describe('BacklogQueue', () => {
  it('should enqueue and dequeue events', () => {
    const queue = new BacklogQueue({ maxSize: 10 });
    queue.enqueue(makeEvent('e1'));
    queue.enqueue(makeEvent('e2'));
    expect(queue.size()).toBe(2);

    const e = queue.dequeue();
    expect(e!.id).toBe('e1');
    expect(queue.size()).toBe(1);
  });

  it('should return undefined when dequeueing from empty queue', () => {
    const queue = new BacklogQueue({ maxSize: 10 });
    expect(queue.dequeue()).toBeUndefined();
  });

  it('should reject enqueue when full', () => {
    const queue = new BacklogQueue({ maxSize: 2 });
    queue.enqueue(makeEvent('e1'));
    queue.enqueue(makeEvent('e2'));
    expect(queue.isFull()).toBe(true);

    try {
      queue.enqueue(makeEvent('e3'));
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).toBe(StateErrorCode.EVENTSTORE_BACKPRESSURE);
    }
    expect(queue.getTotalRejected()).toBe(1);
  });

  it('should emit backpressure signal at threshold', () => {
    const signals: BackpressureSignal[] = [];
    const queue = new BacklogQueue({
      maxSize: 10,
      warningThreshold: 0.8,
      onBackpressure: (signal) => signals.push(signal),
    });

    for (let i = 0; i < 8; i++) {
      queue.enqueue(makeEvent(`e${i}`));
    }
    expect(signals).toHaveLength(1);
    expect(signals[0].utilization).toBeGreaterThanOrEqual(0.8);
  });

  it('should drain all events to store', () => {
    const registry = createDefaultRegistry();
    const store = new InMemoryEventStore(registry);
    store.registerSession({ sessionId: 'sess-1', startedAt: '2026-07-29T00:00:00.000Z' });

    const queue = new BacklogQueue({ maxSize: 10 });
    queue.enqueue(makeEvent('d1'));
    queue.enqueue(makeEvent('d2'));
    queue.enqueue(makeEvent('d3'));

    const drained = queue.drain(store);
    expect(drained).toBe(3);
    expect(store.count()).toBe(3);
    expect(queue.isEmpty()).toBe(true);
  });

  it('should track lifetime statistics', () => {
    const queue = new BacklogQueue({ maxSize: 3 });
    queue.enqueue(makeEvent('s1'));
    queue.enqueue(makeEvent('s2'));
    queue.dequeue();
    queue.dequeue();

    expect(queue.getTotalEnqueued()).toBe(2);
    expect(queue.getTotalDequeued()).toBe(2);
  });

  it('should clear the queue', () => {
    const queue = new BacklogQueue({ maxSize: 10 });
    queue.enqueue(makeEvent('c1'));
    queue.enqueue(makeEvent('c2'));
    const discarded = queue.clear();
    expect(discarded).toHaveLength(2);
    expect(queue.isEmpty()).toBe(true);
  });

  it('should throw on invalid maxSize', () => {
    expect(() => new BacklogQueue({ maxSize: 0 })).toThrow('maxSize must be at least 1');
  });

  it('should report isEmpty and isFull', () => {
    const queue = new BacklogQueue({ maxSize: 1 });
    expect(queue.isEmpty()).toBe(true);
    expect(queue.isFull()).toBe(false);

    queue.enqueue(makeEvent('f1'));
    expect(queue.isEmpty()).toBe(false);
    expect(queue.isFull()).toBe(true);
  });
});
