/**
 * wal.test.ts — WAL transaction tests.
 */
import { InMemoryEventStore } from '../src/store';
import { createDefaultRegistry } from '../src/schema';
import { WALManager, TransactionState } from '../src/wal';
import {
  Event,
  EventType,
  MAX_PAYLOAD_SIZE,
  StateError,
  StateErrorCode,
} from '../src/types';

// ── helpers ──────────────────────────────────────────────────────────
let idCounter = 0;
function makeEvent(overrides: Partial<Event> = {}): Event {
  idCounter++;
  return {
    id: `wal-evt-${idCounter}`,
    type: EventType.MODEL_REQUEST,
    timestamp: `2025-01-01T00:00:${String(idCounter).padStart(2, '0')}.000Z`,
    schemaVersion: 1,
    payload: { modelId: 'gpt-4' },
    sessionId: 'sess-1',
    ...overrides,
  };
}

function createManager(): WALManager {
  const store = new InMemoryEventStore(createDefaultRegistry());
  store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
  return new WALManager(store);
}

// ── WALManager ───────────────────────────────────────────────────────
describe('WALManager', () => {
  test('beginTransaction returns active transaction', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    expect(tx.getState()).toBe(TransactionState.ACTIVE);
  });

  test('cannot start two concurrent transactions', () => {
    const mgr = createManager();
    mgr.beginTransaction();
    expect(() => mgr.beginTransaction()).toThrow(/already active/);
  });

  test('getActiveTransaction returns null when none active', () => {
    const mgr = createManager();
    expect(mgr.getActiveTransaction()).toBeNull();
  });

  test('getActiveTransaction returns tx when active', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    expect(mgr.getActiveTransaction()).toBe(tx);
  });

  test('can start new transaction after commit', () => {
    const mgr = createManager();
    const tx1 = mgr.beginTransaction();
    tx1.write(makeEvent());
    tx1.commit();
    const tx2 = mgr.beginTransaction();
    expect(tx2.getState()).toBe(TransactionState.ACTIVE);
  });

  test('can start new transaction after rollback', () => {
    const mgr = createManager();
    const tx1 = mgr.beginTransaction();
    tx1.rollback();
    const tx2 = mgr.beginTransaction();
    expect(tx2.getState()).toBe(TransactionState.ACTIVE);
  });
});

// ── WALTransaction — write & commit ──────────────────────────────────
describe('WALTransaction — write & commit', () => {
  test('write buffers events', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    tx.write(makeEvent());
    tx.write(makeEvent());
    expect(tx.bufferedCount()).toBe(2);
  });

  test('commit flushes to store and returns count', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    tx.write(makeEvent());
    tx.write(makeEvent());
    tx.write(makeEvent());
    const committed = tx.commit();
    expect(committed).toBe(3);
    expect(tx.getState()).toBe(TransactionState.COMMITTED);
  });

  test('committed events are queryable from store', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    const mgr = new WALManager(store);
    const tx = mgr.beginTransaction();
    tx.write(makeEvent({ id: 'wal-e1' }));
    tx.commit();
    expect(store.getById('wal-e1')).toBeDefined();
  });

  test('commit empty buffer returns 0', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    expect(tx.commit()).toBe(0);
  });
});

// ── WALTransaction — rollback ────────────────────────────────────────
describe('WALTransaction — rollback', () => {
  test('rollback discards buffer', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    tx.write(makeEvent());
    tx.write(makeEvent());
    tx.rollback();
    expect(tx.bufferedCount()).toBe(0);
    expect(tx.getState()).toBe(TransactionState.ROLLED_BACK);
  });

  test('rolled-back events are NOT in store', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    const mgr = new WALManager(store);
    const tx = mgr.beginTransaction();
    tx.write(makeEvent({ id: 'rb-e1' }));
    tx.rollback();
    expect(store.getById('rb-e1')).toBeUndefined();
  });
});

// ── WALTransaction — error paths ─────────────────────────────────────
describe('WALTransaction — error paths', () => {
  test('write after commit throws', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    tx.commit();
    expect(() => tx.write(makeEvent())).toThrow(/Cannot write/);
  });

  test('write after rollback throws', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    tx.rollback();
    expect(() => tx.write(makeEvent())).toThrow(/Cannot write/);
  });

  test('commit after commit throws', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    tx.commit();
    expect(() => tx.commit()).toThrow(/Cannot commit/);
  });

  test('rollback after commit throws', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    tx.commit();
    expect(() => tx.rollback()).toThrow(/Cannot rollback/);
  });

  test('commit with oversized payload propagates PAYLOAD_BUDGET_EXCEEDED', () => {
    const mgr = createManager();
    const tx = mgr.beginTransaction();
    const bigPayload = { data: 'x'.repeat(MAX_PAYLOAD_SIZE + 1) };
    tx.write(makeEvent({ payload: bigPayload }));
    try {
      tx.commit();
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(StateError);
      expect((e as StateError).code).toBe(StateErrorCode.PAYLOAD_BUDGET_EXCEEDED);
    }
  });

  test('failed batch is all-or-none and marks transaction ROLLED_BACK', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    const mgr = new WALManager(store);
    const tx = mgr.beginTransaction();
    tx.write(makeEvent({ id: 'ok-1' }));
    tx.write(makeEvent({ id: 'ok-1' })); // duplicate — will fail
    expect(() => tx.commit()).toThrow();
    expect(tx.getState()).toBe(TransactionState.ROLLED_BACK);
    expect(store.count()).toBe(0);
    expect(store.getById('ok-1')).toBeUndefined();
  });
});

// ── 崩溃恢复模拟 ─────────────────────────────────────────────────────
describe('WAL — 崩溃恢复模拟', () => {
  test('事务未提交时事件不在 store 中（模拟崩溃）', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    const mgr = new WALManager(store);
    const tx = mgr.beginTransaction();
    tx.write(makeEvent({ id: 'crash-1' }));
    tx.write(makeEvent({ id: 'crash-2' }));
    // Simulate crash — transaction never committed
    expect(store.count()).toBe(0);
    expect(store.getById('crash-1')).toBeUndefined();
  });

  test('RECOVERY_INCONSISTENT 错误码存在', () => {
    expect(StateErrorCode.RECOVERY_INCONSISTENT).toBe('RECOVERY_INCONSISTENT');
  });
});
