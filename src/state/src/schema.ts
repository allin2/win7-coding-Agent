/**
 * schema.ts — Versioned event schemas with registry and validation.
 *
 * Each event type has a registered schema that defines the expected payload
 * structure for a given schema version. Incompatible changes require a version bump.
 */

import { Event, EventType, ValidationResult } from './types';

/** A payload schema definition for a specific version. */
export interface PayloadSchema {
  /** Schema version number. */
  version: number;
  /** Human-readable description. */
  description: string;
  /** Required field names in the payload. */
  requiredFields: string[];
  /** Optional field names in the payload. */
  optionalFields: string[];
  /** Custom validator function for complex rules. */
  validate?: (payload: unknown) => string[];
}

/** Key used to register schemas: combination of event type and version. */
interface SchemaKey {
  type: EventType;
  version: number;
}

/** Registry that manages event schemas across versions. */
export class SchemaRegistry {
  private schemas = new Map<string, PayloadSchema>();

  private key(type: EventType, version: number): string {
    return `${type}@${version}`;
  }

  /** Register a payload schema for a given event type and version. */
  register(type: EventType, schema: PayloadSchema): void {
    const k = this.key(type, schema.version);
    if (this.schemas.has(k)) {
      throw new Error(`Schema already registered: ${k}`);
    }
    this.schemas.set(k, schema);
  }

  /** Look up the schema for a given event type and version. */
  get(type: EventType, version: number): PayloadSchema | undefined {
    return this.schemas.get(this.key(type, version));
  }

  /** Get the latest version number for a given event type. */
  getLatestVersion(type: EventType): number {
    let max = 0;
    for (const [k, schema] of this.schemas.entries()) {
      if (k.startsWith(type + '@') && schema.version > max) {
        max = schema.version;
      }
    }
    return max;
  }

  /** Get all registered versions for an event type. */
  getVersions(type: EventType): number[] {
    const versions: number[] = [];
    for (const [k, schema] of this.schemas.entries()) {
      if (k.startsWith(type + '@')) {
        versions.push(schema.version);
      }
    }
    return versions.sort((a, b) => a - b);
  }
}

/** Validate an event against its registered schema. */
export function validateEvent(
  event: Event,
  registry: SchemaRegistry,
): ValidationResult {
  const errors: string[] = [];

  // Basic structural checks.
  if (!event.id || typeof event.id !== 'string') {
    errors.push('Event id is required and must be a string');
  }
  if (!event.type || !Object.values(EventType).includes(event.type)) {
    errors.push(`Invalid event type: ${event.type}`);
  }
  if (!event.timestamp || isNaN(Date.parse(event.timestamp))) {
    errors.push('Event timestamp is required and must be a valid ISO-8601 string');
  }
  if (typeof event.schemaVersion !== 'number' || event.schemaVersion < 1) {
    errors.push('Event schemaVersion is required and must be a positive integer');
  }
  if (!event.sessionId || typeof event.sessionId !== 'string') {
    errors.push('Event sessionId is required and must be a string');
  }

  // Schema-based payload validation.
  const schema = registry.get(event.type, event.schemaVersion);
  if (!schema) {
    errors.push(
      `No schema registered for type=${event.type} version=${event.schemaVersion}`,
    );
    return { valid: errors.length === 0, errors };
  }

  const payload = event.payload;
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    errors.push('Payload must be a non-null object');
    return { valid: false, errors };
  }

  const payloadObj = payload as Record<string, unknown>;

  // Check required fields.
  for (const field of schema.requiredFields) {
    if (!(field in payloadObj)) {
      errors.push(`Payload missing required field: ${field}`);
    }
  }

  // Check for unknown fields.
  const knownFields = new Set([...schema.requiredFields, ...schema.optionalFields]);
  for (const field of Object.keys(payloadObj)) {
    if (!knownFields.has(field)) {
      errors.push(`Payload contains unknown field: ${field}`);
    }
  }

  // Custom validator.
  if (schema.validate) {
    const customErrors = schema.validate(payload);
    errors.push(...customErrors);
  }

  return { valid: errors.length === 0, errors };
}

/** Build a default SchemaRegistry with baseline schemas for all event types. */
export function createDefaultRegistry(): SchemaRegistry {
  const registry = new SchemaRegistry();

  registry.register(EventType.SESSION_START, {
    version: 1,
    description: 'Session started',
    requiredFields: [],
    optionalFields: ['agentVersion', 'environment'],
  });

  registry.register(EventType.SESSION_END, {
    version: 1,
    description: 'Session ended',
    requiredFields: [],
    optionalFields: ['reason', 'duration'],
  });

  registry.register(EventType.MODEL_REQUEST, {
    version: 1,
    description: 'Model invocation request',
    requiredFields: ['modelId'],
    optionalFields: ['prompt', 'parameters'],
  });

  registry.register(EventType.MODEL_RESPONSE, {
    version: 1,
    description: 'Model invocation response',
    requiredFields: ['modelId'],
    optionalFields: ['response', 'tokensUsed', 'error'],
  });

  registry.register(EventType.TOOL_REQUEST, {
    version: 1,
    description: 'Tool invocation request',
    requiredFields: ['toolName'],
    optionalFields: ['parameters', 'correlationId'],
  });

  registry.register(EventType.TOOL_RESULT, {
    version: 1,
    description: 'Tool invocation result',
    requiredFields: ['toolName'],
    optionalFields: ['result', 'error', 'correlationId'],
  });

  registry.register(EventType.RUN_STATUS, {
    version: 1,
    description: 'Agent run status change',
    requiredFields: ['status'],
    optionalFields: ['message'],
  });

  registry.register(EventType.POLICY_DECISION, {
    version: 1,
    description: 'Policy engine decision',
    requiredFields: ['decision', 'ruleId'],
    optionalFields: ['reason', 'context'],
  });

  return registry;
}
