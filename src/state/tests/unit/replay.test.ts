import { ReplayEngine } from '../../src/replay';
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

describe('ReplayEngine', () => {
  let store: InMemoryEventStore;
  let engine: ReplayEngine;

  beforeEach(() => {
    const registry = createDefaultRegistry();
    store = new InMemoryEventStore(registry);
    store.registerSession({ sessionId: 'sess-1', startedAt: '2026-07-29T00:00:00.000Z' });
    engine = new ReplayEngine(store);
  });

  describe('replay', () => {
    it('should return empty result for unknown session', () => {
      const result = engine.replay('unknown');
      expect(result.events).toHaveLength(0);
      expect(result.traceComplete).toBe(false);
      expect(result.finalState.started).toBe(false);
    });

    it('should replay events in chronological order', () => {
      store.append(makeEvent('r1', { type: EventType.SESSION_START, timestamp: '2026-07-29T00:00:00.000Z' }));
      store.append(makeEvent('r2', { type: EventType.MODEL_REQUEST, timestamp: '2026-07-29T00:01:00.000Z', payload: { modelId: 'gpt-4' } }));
      store.append(makeEvent('r3', { type: EventType.MODEL_RESPONSE, timestamp: '2026-07-29T00:02:00.000Z', payload: { modelId: 'gpt-4' } }));
      store.append(makeEvent('r4', { type: EventType.SESSION_END, timestamp: '2026-07-29T00:03:00.000Z' }));

      const result = engine.replay('sess-1');
      expect(result.events).toHaveLength(4);
      expect(result.traceComplete).toBe(true);
      expect(result.finalState.started).toBe(true);
      expect(result.finalState.ended).toBe(true);
      expect(result.finalState.modelRequestCount).toBe(1);
      expect(result.finalState.modelResponseCount).toBe(1);
    });

    it('should track tool requests and results', () => {
      store.append(makeEvent('t1', { type: EventType.SESSION_START }));
      store.append(makeEvent('t2', { type: EventType.TOOL_REQUEST, payload: { toolName: 'read_file' } }));
      store.append(makeEvent('t3', { type: EventType.TOOL_RESULT, payload: { toolName: 'read_file' } }));
      store.append(makeEvent('t4', { type: EventType.SESSION_END }));

      const result = engine.replay('sess-1');
      expect(result.finalState.toolRequestCount).toBe(1);
      expect(result.finalState.toolResultCount).toBe(1);
    });

    it('should track run status changes', () => {
      store.append(makeEvent('rs1', { type: EventType.SESSION_START }));
      store.append(makeEvent('rs2', { type: EventType.RUN_STATUS, payload: { status: 'running' } }));
      store.append(makeEvent('rs3', { type: EventType.RUN_STATUS, payload: { status: 'completed' } }));
      store.append(makeEvent('rs4', { type: EventType.SESSION_END }));

      const result = engine.replay('sess-1');
      expect(result.finalState.lastRunStatus).toBe('completed');
    });

    it('should track policy decisions', () => {
      store.append(makeEvent('p1', { type: EventType.SESSION_START }));
      store.append(makeEvent('p2', { type: EventType.POLICY_DECISION, payload: { decision: 'ALLOW', ruleId: 'rule-1' } }));
      store.append(makeEvent('p3', { type: EventType.POLICY_DECISION, payload: { decision: 'DENY', ruleId: 'rule-2' } }));
      store.append(makeEvent('p4', { type: EventType.SESSION_END }));

      const result = engine.replay('sess-1');
      expect(result.finalState.policyDecisionCount).toBe(2);
      expect(result.finalState.policyDecisions).toEqual([
        { ruleId: 'rule-1', decision: 'ALLOW' },
        { ruleId: 'rule-2', decision: 'DENY' },
      ]);
    });

    it('should mark trace incomplete if session has no end', () => {
      store.append(makeEvent('i1', { type: EventType.SESSION_START }));
      store.append(makeEvent('i2', { type: EventType.MODEL_REQUEST, payload: { modelId: 'gpt-4' } }));

      const result = engine.replay('sess-1');
      expect(result.traceComplete).toBe(false);
      expect(result.finalState.started).toBe(true);
      expect(result.finalState.ended).toBe(false);
    });
  });

  describe('verifyReplay', () => {
    it('should verify matching state', () => {
      store.append(makeEvent('v1', { type: EventType.SESSION_START }));
      store.append(makeEvent('v2', { type: EventType.MODEL_REQUEST, payload: { modelId: 'gpt-4' } }));
      store.append(makeEvent('v3', { type: EventType.SESSION_END }));

      const result = engine.verifyReplay('sess-1', {
        started: true,
        ended: true,
        modelRequestCount: 1,
      });
      expect(result.matches).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
    });

    it('should report discrepancies', () => {
      store.append(makeEvent('d1', { type: EventType.SESSION_START }));
      store.append(makeEvent('d2', { type: EventType.SESSION_END }));

      const result = engine.verifyReplay('sess-1', {
        started: true,
        ended: true,
        modelRequestCount: 5, // expected 5, actual 0
      });
      expect(result.matches).toBe(false);
      expect(result.discrepancies).toHaveLength(1);
      expect(result.discrepancies[0]).toContain('modelRequestCount');
    });

    it('should only check specified fields', () => {
      store.append(makeEvent('o1', { type: EventType.SESSION_START }));
      store.append(makeEvent('o2', { type: EventType.SESSION_END }));

      const result = engine.verifyReplay('sess-1', { started: true });
      expect(result.matches).toBe(true);
    });
  });
});
