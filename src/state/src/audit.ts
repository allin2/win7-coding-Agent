/**
 * audit.ts — Audit export with automatic sanitization.
 *
 * Exports event data to JSON format with automatic redaction of sensitive fields.
 * Generates summary reports for audit purposes.
 */

import { Event, EventFilter } from './types';
import { IEventStore } from './store';

/** Fields that should be sanitized during export. */
const SENSITIVE_FIELDS = new Set([
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'authorization',
  'credential',
  'privateKey',
  'private_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
]);

/** Sanitization options. */
export interface SanitizeOptions {
  /** Additional field names to treat as sensitive. */
  extraSensitiveFields?: string[];
  /** Replacement value for redacted fields. Default: '[REDACTED]'. */
  replacement?: string;
}

/** Summary report structure. */
export interface AuditSummary {
  /** Total events matching the filter. */
  totalEvents: number;
  /** Breakdown by event type. */
  byType: Record<string, number>;
  /** Breakdown by session. */
  bySession: Record<string, number>;
  /** Time range of events. */
  timeRange: {
    earliest: string | null;
    latest: string | null;
  };
  /** Total payload size in bytes. */
  totalPayloadSize: number;
}

/** Export result. */
export interface ExportResult {
  /** Number of events exported. */
  count: number;
  /** The exported events (sanitized). */
  events: Event[];
  /** Timestamp of the export. */
  exportedAt: string;
}

/** Deep-sanitize a value, redacting sensitive fields. */
function sanitizeValue(
  value: unknown,
  sensitiveFields: Set<string>,
  replacement: string,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, sensitiveFields, replacement));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (sensitiveFields.has(key)) {
        result[key] = replacement;
      } else {
        result[key] = sanitizeValue(val, sensitiveFields, replacement);
      }
    }
    return result;
  }

  return value;
}

/** Sanitize an event's payload. */
function sanitizeEvent(event: Event, options: SanitizeOptions): Event {
  const sensitiveFields = new Set(SENSITIVE_FIELDS);
  if (options.extraSensitiveFields) {
    for (const field of options.extraSensitiveFields) {
      sensitiveFields.add(field);
    }
  }
  const replacement = options.replacement ?? '[REDACTED]';

  return {
    ...event,
    payload: sanitizeValue(event.payload, sensitiveFields, replacement),
  };
}

/** Audit exporter for the EventStore. */
export class AuditExporter {
  private store: IEventStore;

  constructor(store: IEventStore) {
    this.store = store;
  }

  /**
   * Export events matching the filter to a sanitized JSON array.
   * Returns the export result (caller is responsible for writing to file).
   */
  exportToJSON(filter: EventFilter, options: SanitizeOptions = {}): ExportResult {
    const events = this.store.query(filter);
    const sanitized = events.map((e) => sanitizeEvent(e, options));

    return {
      count: sanitized.length,
      events: sanitized,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate a summary report for events matching the filter.
   */
  exportSummary(filter: EventFilter): AuditSummary {
    const events = this.store.query(filter);

    const byType: Record<string, number> = {};
    const bySession: Record<string, number> = {};
    let totalPayloadSize = 0;
    let earliest: string | null = null;
    let latest: string | null = null;

    for (const event of events) {
      // Count by type.
      byType[event.type] = (byType[event.type] ?? 0) + 1;

      // Count by session.
      bySession[event.sessionId] = (bySession[event.sessionId] ?? 0) + 1;

      // Payload size.
      totalPayloadSize += JSON.stringify(event.payload).length;

      // Time range.
      if (earliest === null || event.timestamp < earliest) {
        earliest = event.timestamp;
      }
      if (latest === null || event.timestamp > latest) {
        latest = event.timestamp;
      }
    }

    return {
      totalEvents: events.length,
      byType,
      bySession,
      timeRange: { earliest, latest },
      totalPayloadSize,
    };
  }
}
