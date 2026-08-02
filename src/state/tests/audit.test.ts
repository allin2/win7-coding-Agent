/**
 * audit.test.ts — AuditExporter tests.
 */
import { AuditExporter } from '../src/audit';
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
    id: `audit-evt-${idCounter}`,
    type: EventType.MODEL_REQUEST,
    timestamp: `2025-01-01T00:00:${String(idCounter).padStart(2, '0')}.000Z`,
    schemaVersion: 1,
    payload: { modelId: 'gpt-4' },
    sessionId: 'sess-1',
    ...overrides,
  };
}

function createStoreWithEvents(): InMemoryEventStore {
  const store = new InMemoryEventStore(createDefaultRegistry());
  store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
  store.registerSession({ sessionId: 'sess-2', startedAt: '2025-01-01T00:00:00.000Z' });
  store.append(makeEvent({ type: EventType.MODEL_REQUEST, sessionId: 'sess-1' }));
  store.append(makeEvent({ type: EventType.TOOL_REQUEST, payload: { toolName: 'bash' }, sessionId: 'sess-1' }));
  store.append(makeEvent({ type: EventType.MODEL_REQUEST, sessionId: 'sess-2' }));
  store.append(makeEvent({ type: EventType.SESSION_START, payload: {}, sessionId: 'sess-1' }));
  return store;
}

// ── exportToJSON ─────────────────────────────────────────────────────
describe('AuditExporter — exportToJSON', () => {
  test('exports all events when filter is empty', () => {
    const store = createStoreWithEvents();
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({});
    expect(result.count).toBe(4);
    expect(result.events).toHaveLength(4);
    expect(result.exportedAt).toBeDefined();
  });

  test('exports filtered events', () => {
    const store = createStoreWithEvents();
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({ types: [EventType.MODEL_REQUEST] });
    expect(result.count).toBe(2);
  });

  test('exports empty array when no match', () => {
    const store = createStoreWithEvents();
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({ sessionId: 'nonexistent' });
    expect(result.count).toBe(0);
    expect(result.events).toEqual([]);
  });

  test('exportedAt is a valid ISO-8601 string', () => {
    const store = createStoreWithEvents();
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({});
    expect(Date.parse(result.exportedAt)).not.toBeNaN();
  });
});

// ── sanitization ─────────────────────────────────────────────────────
describe('AuditExporter — sanitization', () => {
  test('redacts password field', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.MODEL_REQUEST,
        payload: { modelId: 'gpt-4', password: 'secret123' },
      }),
    );
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({});
    const payload = result.events[0].payload as Record<string, unknown>;
    expect(payload.password).toBe('[REDACTED]');
    expect(payload.modelId).toBe('gpt-4');
  });

  test('redacts token, apiKey, secret fields', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.MODEL_REQUEST,
        payload: {
          modelId: 'gpt-4',
          token: 'tok-123',
          apiKey: 'key-abc',
          secret: 'shh',
        },
      }),
    );
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({});
    const payload = result.events[0].payload as Record<string, unknown>;
    expect(payload.token).toBe('[REDACTED]');
    expect(payload.apiKey).toBe('[REDACTED]');
    expect(payload.secret).toBe('[REDACTED]');
  });

  test('redacts nested sensitive fields', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.MODEL_REQUEST,
        payload: {
          modelId: 'gpt-4',
          config: { authorization: 'Bearer xyz', nested: { access_token: 'at-123' } },
        },
      }),
    );
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({});
    const payload = result.events[0].payload as any;
    expect(payload.config.authorization).toBe('[REDACTED]');
    expect(payload.config.nested.access_token).toBe('[REDACTED]');
  });

  test('custom replacement string', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.MODEL_REQUEST,
        payload: { modelId: 'gpt-4', password: 'secret' },
      }),
    );
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({}, { replacement: '***' });
    const payload = result.events[0].payload as Record<string, unknown>;
    expect(payload.password).toBe('***');
  });

  test('extraSensitiveFields option', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.MODEL_REQUEST,
        payload: { modelId: 'gpt-4', myCustomField: 'sensitive-data' },
      }),
    );
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({}, { extraSensitiveFields: ['myCustomField'] });
    const payload = result.events[0].payload as Record<string, unknown>;
    expect(payload.myCustomField).toBe('[REDACTED]');
  });

  test('redacts sensitive fields in arrays', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.MODEL_REQUEST,
        payload: { modelId: 'gpt-4', items: [{ password: 'p1' }, { password: 'p2' }] },
      }),
    );
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({});
    const payload = result.events[0].payload as any;
    expect(payload.items[0].password).toBe('[REDACTED]');
    expect(payload.items[1].password).toBe('[REDACTED]');
  });

  test('does not mutate original event', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.MODEL_REQUEST,
        payload: { modelId: 'gpt-4', password: 'secret' },
      }),
    );
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({});
    const original = store.getById('audit-evt-1')!;
    expect((original.payload as any).password).toBe('secret');
    expect((result.events[0].payload as any).password).toBe('[REDACTED]');
  });
});

// ── exportSummary ────────────────────────────────────────────────────
describe('AuditExporter — exportSummary', () => {
  test('summary counts by type and session', () => {
    const store = createStoreWithEvents();
    const exporter = new AuditExporter(store);
    const summary = exporter.exportSummary({});
    expect(summary.totalEvents).toBe(4);
    expect(summary.byType[EventType.MODEL_REQUEST]).toBe(2);
    expect(summary.byType[EventType.TOOL_REQUEST]).toBe(1);
    expect(summary.byType[EventType.SESSION_START]).toBe(1);
    expect(summary.bySession['sess-1']).toBe(3);
    expect(summary.bySession['sess-2']).toBe(1);
  });

  test('summary time range', () => {
    const store = createStoreWithEvents();
    const exporter = new AuditExporter(store);
    const summary = exporter.exportSummary({});
    expect(summary.timeRange.earliest).toBe('2025-01-01T00:00:01.000Z');
    expect(summary.timeRange.latest).toBe('2025-01-01T00:00:04.000Z');
  });

  test('summary totalPayloadSize > 0', () => {
    const store = createStoreWithEvents();
    const exporter = new AuditExporter(store);
    const summary = exporter.exportSummary({});
    expect(summary.totalPayloadSize).toBeGreaterThan(0);
  });

  test('empty store summary', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    const exporter = new AuditExporter(store);
    const summary = exporter.exportSummary({});
    expect(summary.totalEvents).toBe(0);
    expect(summary.timeRange.earliest).toBeNull();
    expect(summary.timeRange.latest).toBeNull();
    expect(summary.totalPayloadSize).toBe(0);
  });
});

// ── C10 中文路径兼容 ─────────────────────────────────────────────────
describe('C10 — 中文路径兼容', () => {
  test('中文 sessionId 事件可以正常导出', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: '审计-中文会话', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(makeEvent({ sessionId: '审计-中文会话' }));
    const exporter = new AuditExporter(store);
    const result = exporter.exportToJSON({ sessionId: '审计-中文会话' });
    expect(result.count).toBe(1);
  });

  test('中文 payload 值在 summary 中正确统计', () => {
    const store = new InMemoryEventStore(createDefaultRegistry());
    store.registerSession({ sessionId: 'sess-1', startedAt: '2025-01-01T00:00:00.000Z' });
    store.append(
      makeEvent({
        type: EventType.RUN_STATUS,
        payload: { status: '运行中', message: '正常' },
      }),
    );
    const exporter = new AuditExporter(store);
    const summary = exporter.exportSummary({});
    expect(summary.totalPayloadSize).toBeGreaterThan(0);
  });
});
