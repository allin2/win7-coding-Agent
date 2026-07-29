import {
  SchemaRegistry,
  validateEvent,
  createDefaultRegistry,
} from '../../src/schema';
import { Event, EventType } from '../../src/types';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-1',
    type: EventType.SESSION_START,
    timestamp: '2026-07-29T00:00:00.000Z',
    schemaVersion: 1,
    payload: {},
    sessionId: 'sess-1',
    ...overrides,
  };
}

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  it('should register and retrieve a schema', () => {
    registry.register(EventType.SESSION_START, {
      version: 1,
      description: 'test',
      requiredFields: [],
      optionalFields: ['agentVersion'],
    });
    const schema = registry.get(EventType.SESSION_START, 1);
    expect(schema).toBeDefined();
    expect(schema!.description).toBe('test');
  });

  it('should throw on duplicate registration', () => {
    const schemaDef = {
      version: 1,
      description: 'test',
      requiredFields: [],
      optionalFields: [],
    };
    registry.register(EventType.SESSION_START, schemaDef);
    expect(() => registry.register(EventType.SESSION_START, schemaDef)).toThrow(
      'Schema already registered',
    );
  });

  it('should return undefined for unregistered type/version', () => {
    expect(registry.get(EventType.MODEL_REQUEST, 1)).toBeUndefined();
  });

  it('should get latest version', () => {
    registry.register(EventType.MODEL_REQUEST, {
      version: 1,
      description: 'v1',
      requiredFields: ['modelId'],
      optionalFields: [],
    });
    registry.register(EventType.MODEL_REQUEST, {
      version: 2,
      description: 'v2',
      requiredFields: ['modelId'],
      optionalFields: ['temperature'],
    });
    expect(registry.getLatestVersion(EventType.MODEL_REQUEST)).toBe(2);
  });

  it('should get all versions sorted', () => {
    registry.register(EventType.TOOL_REQUEST, {
      version: 3,
      description: 'v3',
      requiredFields: [],
      optionalFields: [],
    });
    registry.register(EventType.TOOL_REQUEST, {
      version: 1,
      description: 'v1',
      requiredFields: [],
      optionalFields: [],
    });
    expect(registry.getVersions(EventType.TOOL_REQUEST)).toEqual([1, 3]);
  });
});

describe('validateEvent', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = createDefaultRegistry();
  });

  it('should validate a correct event', () => {
    const event = makeEvent({
      type: EventType.MODEL_REQUEST,
      payload: { modelId: 'gpt-4' },
    });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject event with missing required fields', () => {
    const event = makeEvent({
      type: EventType.MODEL_REQUEST,
      payload: {},
    });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('modelId'))).toBe(true);
  });

  it('should reject event with unknown fields', () => {
    const event = makeEvent({
      type: EventType.MODEL_REQUEST,
      payload: { modelId: 'gpt-4', unknownField: 'x' },
    });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknownField'))).toBe(true);
  });

  it('should reject event with invalid timestamp', () => {
    const event = makeEvent({ timestamp: 'not-a-date' });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
  });

  it('should reject event with no schema registered', () => {
    const event = makeEvent({
      type: EventType.MODEL_REQUEST,
      schemaVersion: 999,
      payload: { modelId: 'gpt-4' },
    });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('No schema registered'))).toBe(true);
  });

  it('should reject null payload', () => {
    const event = makeEvent({ payload: null });
    const result = validateEvent(event, registry);
    expect(result.valid).toBe(false);
  });
});

describe('createDefaultRegistry', () => {
  it('should have schemas for all event types', () => {
    const registry = createDefaultRegistry();
    for (const type of Object.values(EventType)) {
      expect(registry.get(type, 1)).toBeDefined();
    }
  });
});
