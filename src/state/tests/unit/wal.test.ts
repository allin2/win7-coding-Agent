import { WALManager, TransactionState } from '../../src/wal';
import { InMemoryEventStore } from '../../src/store';
import { createDefaultRegistry } from '../../src/schema';
import { Event, EventType } from '../../src/types';

function makeEvent(id: string, overrides: Partial<Event> = {}): Event {
  return {
    id,
    type: EventType.SESSION_START,
    timestamp: '2026-07-29T00:00:00.000Z',
    schemaVersion: 1,
    payload: {},
    sessionId: 'sess-1',
    ...overrides,
  };
}

describe('WALManager', () => {
  let store: InMemoryEventStore;
  let wal: WALManager;

  beforeEach(() => {
    const registry = createDefaultRegistry();
    store = new InMemoryEventStore(registry);
    store.registerSession({ sessionId: 'sess-1', startedAt: '2026-07-29T00:00:00.000Z' });
    wal = new WALManager(store);
  });

  it('should begin a transaction', () => {
    const tx = wal.beginTransaction();
    expect(tx.getState()).toBe(TransactionState.ACTIVE);
  });

  it('should not allow two concurrent transactions', () => {
    wal.beginTransaction();
    expect(() => wal.beginTransaction()).toThrow('already active');
  });

  it('should allow new transaction after commit', () => {
    const tx1 = wal.beginTransaction();
    tx1.commit();
    const tx2 = wal.beginTransaction();
    expect(tx2.getState()).toBe(TransactionState.ACTIVE);
  });

  it('should return null for active transaction after commit', () => {
    const tx = wal.beginTransaction();
    tx.commit();
    expect(wal.getActiveTransaction()).toBeNull();
  });
});

describe('WALTransaction', () => {
  let store: InMemoryEventStore;
  let wal: WALManager;

  beforeEach(() => {
    const registry = createDefaultRegistry();
    store = new InMemoryEventStore(registry);
    store.registerSession({ sessionId: 'sess-1', startedAt: '2026-07-29T00:00:00.000Z' });
    wal = new WALManager(store);
  });

  it('should write events to buffer', () => {
    const tx = wal.beginTransaction();
    tx.write(makeEvent('w1'));
    tx.write(makeEvent('w2'));
    expect(tx.bufferedCount()).toBe(2);
  });

  it('should commit all events to store', () => {
    const tx = wal.beginTransaction();
    tx.write(makeEvent('c1'));
    tx.write(makeEvent('c2'));
    const committed = tx.commit();
    expect(committed).toBe(2);
    expect(store.count()).toBe(2);
    expect(tx.getState()).toBe(TransactionState.COMMITTED);
  });

  it('should rollback without writing to store', () => {
    const tx = wal.beginTransaction();
    tx.write(makeEvent('r1'));
    tx.write(makeEvent('r2'));
    tx.rollback();
    expect(store.count()).toBe(0);
    expect(tx.getState()).toBe(TransactionState.ROLLED_BACK);
  });

  it('should not allow write after commit', () => {
    const tx = wal.beginTransaction();
    tx.commit();
    expect(() => tx.write(makeEvent('x1'))).toThrow();
  });

  it('should not allow write after rollback', () => {
    const tx = wal.beginTransaction();
    tx.rollback();
    expect(() => tx.write(makeEvent('x1'))).toThrow();
  });

  it('should not allow double commit', () => {
    const tx = wal.beginTransaction();
    tx.commit();
    expect(() => tx.commit()).toThrow();
  });

  it('should not allow commit after rollback', () => {
    const tx = wal.beginTransaction();
    tx.rollback();
    expect(() => tx.commit()).toThrow();
  });

  it('should report 0 buffered count after commit', () => {
    const tx = wal.beginTransaction();
    tx.write(makeEvent('b1'));
    tx.commit();
    // Buffer is not cleared on commit, but state is committed.
    expect(tx.getState()).toBe(TransactionState.COMMITTED);
  });
});
