/**
 * replay.test.ts — ReplayEngine tests.
 */
import { ReplayEngine } from '../src/replay';
import { InMemoryEventStore } from '../src/store';
import { createDefaultRegistry } from '../src/schema';
import { Event, EventType } from '../src/types';

// ── helpers ──────────────────────────────────────────────────────────
let idCounter = 0;

beforeEach(() => {
  idCounter = 0;
});

function makeEvent(overrides: Partial<Event> = {}): Event {
  idCounter++;
  return {
    id: `rep-evt-${idCounter}`,
    type: EventType.MODEL_REQUEST,
    timestamp: `2025-01-01T00:00:${String(idCounter).padStart(2, '0')}.000Z`,
    schemaVersion: 1,
    payload: { modelId: 'gpt-4' },
    sessionId: 'sess-1',
    ...overrides,
  };
}

function createPopulatedStore(): InMemoryEventStore {
  const store = new InMemoryEventStore(createDefaultRegistry());
  store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });

  store.append(makeEvent({ type: EventType.SESSION_START, payload: {} }));
  store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
  store.append(makeEvent({ type: EventType.MODEL_RESPONSE, payload: { modelId: 'gpt-4' } }));
  store.append(makeEvent({ type: EventType.TOOL_REQUEST, payload: { toolName: 'bash' } }));
  store.append(makeEvent({ type: EventType.TOOL_RESULT, payload: { toolName: 'bash' } }));
  store.append(
    makeEvent({
      type: EventType.POLICY_DECISION,
      payload: { decision: 'ALLOW', ruleId: 'rule-1' },
    }),
  );
  store.append(
    makeEvent({
      type: EventType.RUN_STATUS,
      payload: { status: 'completed' },
    }),
  );
  store.append(makeEvent({ type: EventType.SESSION_END, payload: {} }));
  return store;
}

// ── replay — basic ───────────────────────────────────────────────────
describe('ReplayEngine — replay basic', () => {
  test('replay returns events in chronological order', () => {
    const store = createPopulatedStore();
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.sessionId).toBe('sess-1');
    expect(result.events.length).toBe(8);
    // Verify chronological order
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].timestamp >= result.events[i - 1].timestamp).toBe(true);
    }
  });

  test('replay empty session returns empty result', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    const engine = new ReplayEngine(store);
    const result = engine.replay('nonexistent');
    expect(result.events).toEqual([]);
    expect(result.traceComplete).toBe(false);
    expect(result.finalState.started).toBe(false);
    expect(result.finalState.ended).toBe(false);
  });

  test('replay derives correct session state', () => {
    const store = createPopulatedStore();
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    const state = result.finalState;

    expect(state.started).toBe(true);
    expect(state.ended).toBe(true);
    expect(state.modelRequestCount).toBe(1);
    expect(state.modelResponseCount).toBe(1);
    expect(state.toolRequestCount).toBe(1);
    expect(state.toolResultCount).toBe(1);
    expect(state.policyDecisionCount).toBe(1);
    expect(state.lastRunStatus).toBe('completed');
    expect(state.lastEventTimestamp).toBeDefined();
  });

  test('trace_complete when both SESSION_START and SESSION_END exist', () => {
    const store = createPopulatedStore();
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.traceComplete).toBe(true);
  });

  test('trace_complete is false when SESSION_END is missing', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ type: EventType.SESSION_START, payload: {} }));
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    // No SESSION_END
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.traceComplete).toBe(false);
  });

  test('trace_complete is false when SESSION_START is missing', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    store.append(makeEvent({ type: EventType.SESSION_END, payload: {} }));
    // No SESSION_START
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.traceComplete).toBe(false);
  });
});

// ── replay — state accumulation ──────────────────────────────────────
describe('ReplayEngine — state accumulation', () => {
  test('multiple model requests accumulate', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.finalState.modelRequestCount).toBe(3);
  });

  test('lastRunStatus reflects the most recent RUN_STATUS event', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ type: EventType.RUN_STATUS, payload: { status: 'running' } }));
    store.append(makeEvent({ type: EventType.RUN_STATUS, payload: { status: 'paused' } }));
    store.append(makeEvent({ type: EventType.RUN_STATUS, payload: { status: 'completed' } }));
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.finalState.lastRunStatus).toBe('completed');
  });

  test('policy decisions are logged', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.POLICY_DECISION,
        payload: { decision: 'ALLOW', ruleId: 'rule-1' },
      }),
    );
    store.append(
      makeEvent({
        type: EventType.POLICY_DECISION,
        payload: { decision: 'DENY', ruleId: 'rule-2' },
      }),
    );
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.finalState.policyDecisions).toEqual([
      { ruleId: 'rule-1', decision: 'ALLOW' },
      { ruleId: 'rule-2', decision: 'DENY' },
    ]);
  });

  test('policy decision without valid ruleId/decision still counts', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.POLICY_DECISION,
        payload: { decision: 123, ruleId: null },
      }),
    );
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.finalState.policyDecisionCount).toBe(1);
    expect(result.finalState.policyDecisions).toEqual([]);
  });
});

// ── verifyReplay ─────────────────────────────────────────────────────
describe('ReplayEngine — verifyReplay', () => {
  test('matches when expected state equals actual', () => {
    const store = createPopulatedStore();
    const engine = new ReplayEngine(store);
    const result = engine.verifyReplay('sess-1', {
      started: true,
      ended: true,
      modelRequestCount: 1,
      modelResponseCount: 1,
      toolRequestCount: 1,
      toolResultCount: 1,
      policyDecisionCount: 1,
      lastRunStatus: 'completed',
    });
    expect(result.matches).toBe(true);
    expect(result.discrepancies).toEqual([]);
  });

  test('discrepancies listed for mismatched fields', () => {
    const store = createPopulatedStore();
    const engine = new ReplayEngine(store);
    const result = engine.verifyReplay('sess-1', {
      modelRequestCount: 99,
      lastRunStatus: 'failed',
    });
    expect(result.matches).toBe(false);
    expect(result.discrepancies.length).toBe(2);
    expect(result.discrepancies.some((d) => d.includes('modelRequestCount'))).toBe(true);
    expect(result.discrepancies.some((d) => d.includes('lastRunStatus'))).toBe(true);
  });

  test('partial expected state only checks specified fields', () => {
    const store = createPopulatedStore();
    const engine = new ReplayEngine(store);
    const result = engine.verifyReplay('sess-1', { started: true });
    expect(result.matches).toBe(true);
    expect(result.discrepancies).toEqual([]);
  });

  test('verifyReplay on empty session', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    const engine = new ReplayEngine(store);
    const result = engine.verifyReplay('nonexistent', { started: true });
    expect(result.matches).toBe(false);
    expect(result.discrepancies.some((d) => d.includes('started'))).toBe(true);
  });

  test('verification result includes replay data', () => {
    const store = createPopulatedStore();
    const engine = new ReplayEngine(store);
    const result = engine.verifyReplay('sess-1', {});
    expect(result.replay.sessionId).toBe('sess-1');
    expect(result.replay.events.length).toBe(8);
  });
});

// ── 断裂检测 ─────────────────────────────────────────────────────────
describe('ReplayEngine — 断裂检测', () => {
  test('仅有中间事件的会话 traceComplete=false', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ type: EventType.MODEL_REQUEST }));
    store.append(makeEvent({ type: EventType.TOOL_REQUEST, payload: { toolName: 'bash' } }));
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.traceComplete).toBe(false);
    expect(result.finalState.started).toBe(false);
    expect(result.finalState.ended).toBe(false);
  });

  test('RUN_STATUS 无 payload 时 lastRunStatus 保持 null', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ type: EventType.RUN_STATUS, payload: { status: null } }));
    const engine = new ReplayEngine(store);
    const result = engine.replay('sess-1');
    expect(result.finalState.lastRunStatus).toBeNull();
  });
});

// ── C10 中文路径兼容 ─────────────────────────────────────────────────
describe('C10 — 中文路径兼容', () => {
  test('中文 sessionId 可以正常回放', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: '回放-中文测试', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ type: EventType.SESSION_START, sessionId: '回放-中文测试', payload: {} }));
    store.append(makeEvent({ type: EventType.SESSION_END, sessionId: '回放-中文测试', payload: {} }));
    const engine = new ReplayEngine(store);
    const result = engine.replay('回放-中文测试');
    expect(result.traceComplete).toBe(true);
    expect(result.sessionId).toBe('回放-中文测试');
  });
});
