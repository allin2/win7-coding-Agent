import { AuditExporter } from '../../src/audit';
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

describe('AuditExporter', () => {
  let store: InMemoryEventStore;
  let exporter: AuditExporter;

  beforeEach(() => {
    const registry = createDefaultRegistry();
    store = new InMemoryEventStore(registry);
    store.registerSession({ sessionId: 'sess-1', startedAt: '2026-07-29T00:00:00.000Z' });
    exporter = new AuditExporter(store);
  });

  describe('exportToJSON', () => {
    it('should export all events with empty filter', () => {
      store.append(makeEvent('a1'));
      store.append(makeEvent('a2'));
      const result = exporter.exportToJSON({});
      expect(result.count).toBe(2);
      expect(result.events).toHaveLength(2);
      expect(result.exportedAt).toBeDefined();
    });

    it('should sanitize sensitive fields in payloads', () => {
      store.append(
        makeEvent('s1', {
          type: EventType.MODEL_REQUEST,
          payload: { modelId: 'gpt-4', parameters: { apiKey: 'sk-secret-key' } },
        }),
      );
      const result = exporter.exportToJSON({});
      const payload = result.events[0].payload as Record<string, any>;
      expect(payload.parameters.apiKey).toBe('[REDACTED]');
      expect(payload.modelId).toBe('gpt-4');
    });

    it('should sanitize nested sensitive fields', () => {
      store.append(
        makeEvent('n1', {
          type: EventType.MODEL_REQUEST,
          payload: {
            modelId: 'gpt-4',
            parameters: { token: 'abc123', temperature: 0.7 },
          },
        }),
      );
      const result = exporter.exportToJSON({});
      const payload = result.events[0].payload as Record<string, any>;
      expect(payload.parameters.token).toBe('[REDACTED]');
      expect(payload.parameters.temperature).toBe(0.7);
    });

    it('should support custom replacement and extra fields', () => {
      store.append(
        makeEvent('c1', {
          type: EventType.MODEL_REQUEST,
          payload: { modelId: 'gpt-4', parameters: { customSecret: 'my-secret' } },
        }),
      );
      const result = exporter.exportToJSON(
        {},
        { extraSensitiveFields: ['customSecret'], replacement: '***' },
      );
      const payload = result.events[0].payload as Record<string, any>;
      expect(payload.parameters.customSecret).toBe('***');
    });

    it('should respect filter criteria', () => {
      store.append(makeEvent('f1', { type: EventType.SESSION_START }));
      store.append(makeEvent('f2', { type: EventType.SESSION_END }));
      const result = exporter.exportToJSON({ types: [EventType.SESSION_END] });
      expect(result.count).toBe(1);
    });
  });

  describe('exportSummary', () => {
    it('should generate a summary report', () => {
      store.append(makeEvent('s1', { type: EventType.SESSION_START, timestamp: '2026-07-29T00:00:00.000Z' }));
      store.append(makeEvent('s2', { type: EventType.MODEL_REQUEST, timestamp: '2026-07-29T00:01:00.000Z', payload: { modelId: 'gpt-4' } }));
      store.append(makeEvent('s3', { type: EventType.SESSION_END, timestamp: '2026-07-29T00:02:00.000Z' }));

      const summary = exporter.exportSummary({});
      expect(summary.totalEvents).toBe(3);
      expect(summary.byType[EventType.SESSION_START]).toBe(1);
      expect(summary.byType[EventType.MODEL_REQUEST]).toBe(1);
      expect(summary.bySession['sess-1']).toBe(3);
      expect(summary.timeRange.earliest).toBe('2026-07-29T00:00:00.000Z');
      expect(summary.timeRange.latest).toBe('2026-07-29T00:02:00.000Z');
      expect(summary.totalPayloadSize).toBeGreaterThan(0);
    });

    it('should handle empty results', () => {
      const summary = exporter.exportSummary({ sessionId: 'nonexistent' });
      expect(summary.totalEvents).toBe(0);
      expect(summary.timeRange.earliest).toBeNull();
      expect(summary.timeRange.latest).toBeNull();
    });
  });
});
