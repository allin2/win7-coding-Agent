/**
 * schema.test.ts — SchemaRegistry & validateEvent tests.
 */
import {
  SchemaRegistry,
  validateEvent,
  createDefaultRegistry,
  PayloadSchema,
} from '../src/schema';
import { Event, EventType } from '../src/types';

// ── helpers ──────────────────────────────────────────────────────────
function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-1',
    type: EventType.MODEL_REQUEST,
    timestamp: '2025-01-01T00:00:00.000Z',
    schemaVersion: 1,
    payload: { modelId: 'gpt-4' },
    sessionId: 'sess-1',
    ...overrides,
  };
}

// ── SchemaRegistry ───────────────────────────────────────────────────
describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  test('register and get a schema', () => {
    const schema: PayloadSchema = {
      version: 1,
      description: 'test',
      requiredFields: ['foo'],
      optionalFields: [],
    };
    registry.register(EventType.MODEL_REQUEST, schema);
    expect(registry.get(EventType.MODEL_REQUEST, 1)).toEqual(schema);
  });

  test('get returns undefined for unregistered type/version', () => {
    expect(registry.get(EventType.MODEL_REQUEST, 1)).toBeUndefined();
    expect(registry.get(EventType.MODEL_REQUEST, 99)).toBeUndefined();
  });

  test('register duplicate throws', () => {
    const schema: PayloadSchema = {
      version: 1,
      description: 'test',
      requiredFields: [],
      optionalFields: [],
    };
    registry.register(EventType.MODEL_REQUEST, schema);
    expect(() => registry.register(EventType.MODEL_REQUEST, schema)).toThrow(
      /already registered/,
    );
  });

  test('getLatestVersion returns highest version', () => {
    registry.register(EventType.MODEL_REQUEST, {
      version: 1, description: 'v1', requiredFields: [], optionalFields: [],
    });
    registry.register(EventType.MODEL_REQUEST, {
      version: 3, description: 'v3', requiredFields: [], optionalFields: [],
    });
    registry.register(EventType.MODEL_REQUEST, {
      version: 2, description: 'v2', requiredFields: [], optionalFields: [],
    });
    expect(registry.getLatestVersion(EventType.MODEL_REQUEST)).toBe(3);
  });

  test('getLatestVersion returns 0 when no schemas registered', () => {
    expect(registry.getLatestVersion(EventType.MODEL_REQUEST)).toBe(0);
  });

  test('getVersions returns sorted version list', () => {
    registry.register(EventType.TOOL_REQUEST, {
      version: 5, description: 'v5', requiredFields: [], optionalFields: [],
    });
    registry.register(EventType.TOOL_REQUEST, {
      version: 1, description: 'v1', requiredFields: [], optionalFields: [],
    });
    registry.register(EventType.TOOL_REQUEST, {
      version: 3, description: 'v3', requiredFields: [], optionalFields: [],
    });
    expect(registry.getVersions(EventType.TOOL_REQUEST)).toEqual([1, 3, 5]);
  });

  test('getVersions returns empty array for unknown type', () => {
    expect(registry.getVersions(EventType.SESSION_START)).toEqual([]);
  });

  test('multiple event types can coexist', () => {
    registry.register(EventType.MODEL_REQUEST, {
      version: 1, description: 'mr', requiredFields: [], optionalFields: [],
    });
    registry.register(EventType.TOOL_REQUEST, {
      version: 1, description: 'tr', requiredFields: [], optionalFields: [],
    });
    expect(registry.get(EventType.MODEL_REQUEST, 1)?.description).toBe('mr');
    expect(registry.get(EventType.TOOL_REQUEST, 1)?.description).toBe('tr');
  });
});

// ── validateEvent ────────────────────────────────────────────────────
describe('validateEvent', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = createDefaultRegistry();
  });

  test('valid event passes validation', () => {
    const event = makeEvent();
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('missing id fails', () => {
    const event = makeEvent({ id: '' });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /id is required/.test(e))).toBe(true);
  });

  test('invalid event type fails', () => {
    const event = makeEvent({ type: 'bogus.type' as EventType });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Invalid event type/.test(e))).toBe(true);
  });

  test('invalid timestamp fails', () => {
    const event = makeEvent({ timestamp: 'not-a-date' });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /timestamp/.test(e))).toBe(true);
  });

  test('schemaVersion < 1 fails', () => {
    const event = makeEvent({ schemaVersion: 0 });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /schemaVersion/.test(e))).toBe(true);
  });

  test('missing sessionId fails', () => {
    const event = makeEvent({ sessionId: '' });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /sessionId/.test(e))).toBe(true);
  });

  test('unregistered schema version fails', () => {
    const event = makeEvent({ schemaVersion: 999 });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /No schema registered/.test(e))).toBe(true);
  });

  test('null payload fails', () => {
    const event = makeEvent({ payload: null });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /non-null object/.test(e))).toBe(true);
  });

  test('missing required field fails', () => {
    const event = makeEvent({ payload: {} });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /missing required field: modelId/.test(e))).toBe(true);
  });

  test('unknown fields allowed by default', () => {
    const event = makeEvent({
      payload: { modelId: 'gpt-4', unknownField: 'x' },
    });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(true);
  });

  test('unknown field rejected when allowAdditionalFields is false', () => {
    const strictRegistry = new SchemaRegistry();
    strictRegistry.register(EventType.MODEL_REQUEST, {
      version: 1,
      description: 'strict',
      requiredFields: ['modelId'],
      optionalFields: [],
      allowAdditionalFields: false,
    });
    const event = makeEvent({
      payload: { modelId: 'gpt-4', unknownField: 'x' },
    });
    const result = validateEvent(event, strictRegistry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /unknown field: unknownField/.test(e))).toBe(true);
  });

  test('custom validator errors propagate', () => {
    const customRegistry = new SchemaRegistry();
    customRegistry.register(EventType.MODEL_REQUEST, {
      version: 1,
      description: 'custom',
      requiredFields: ['modelId'],
      optionalFields: [],
      validate: (payload: unknown) => {
        const p = payload as Record<string, unknown>;
        return typeof p.modelId !== 'string' ? ['modelId must be a string'] : [];
      },
    });
    const event = makeEvent({ payload: { modelId: 123 } });
    const result = validateEvent(event, customRegistry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('modelId must be a string');
  });

  test('POLICY_DECISION requires decision and ruleId', () => {
    const event = makeEvent({
      type: EventType.POLICY_DECISION,
      payload: {},
    });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /decision/.test(e))).toBe(true);
    expect(result.errors.some((e) => /ruleId/.test(e))).toBe(true);
  });
});

// ── createDefaultRegistry ────────────────────────────────────────────
describe('createDefaultRegistry', () => {
  test('registers all 8 event types at version 1', () => {
    const registry = createDefaultRegistry();
    const allTypes = Object.values(EventType);
    expect(allTypes.length).toBe(8);
    for (const t of allTypes) {
      expect(registry.get(t, 1)).toBeDefined();
      expect(registry.getLatestVersion(t)).toBe(1);
    }
  });
});

// ── C10 中文路径兼容 ─────────────────────────────────────────────────
describe('C10 — 中文路径兼容', () => {
  test('sessionId 包含中文字符时验证通过', () => {
    const registry = createDefaultRegistry();
    const event = makeEvent({ sessionId: '会话-测试001' });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(true);
  });

  test('payload 含中文字段值时验证通过', () => {
    const registry = createDefaultRegistry();
    const event = makeEvent({
      type: EventType.RUN_STATUS,
      payload: { status: '运行中', message: '正常执行' },
    });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(true);
  });
});
