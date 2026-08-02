/**
 * Structural adapter from Core RuntimeEvent v1 to the canonical State V2 ledger.
 * State does not import Core, so the packages remain independently testable.
 */
import {
  EventEnvelopeV2,
  InMemoryEventLedger,
  JsonValue,
} from './event-protocol';
import { EventStream } from './event-stream';

export interface RuntimeEventLike {
  readonly schemaVersion: '1.0';
  readonly sequence: number;
  readonly type: string;
  readonly timestamp: string;
  readonly sessionId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly payload: unknown;
}

export const RUNTIME_EVENT_TYPE_MAP: Readonly<Record<string, string>> = Object.freeze({
  'model.plan': 'model.response.received',
  'tool.request': 'tool.call.started',
  'tool.result': 'tool.call.finished',
  'runtime.error': 'error.raised',
  'verification.feedback': 'message.added',
});

/** Implements Core's RuntimeEventSink shape and makes the V2 ledger the seq authority. */
export class RuntimeEventLedgerSink {
  constructor(
    private readonly ledger: InMemoryEventLedger,
    private readonly stream?: EventStream,
  ) {}

  append(runtimeEvent: RuntimeEventLike): EventEnvelopeV2 {
    const event = this.ledger.submit({
      eventId: runtimeEventId(runtimeEvent),
      schemaVersion: 2,
      sessionId: runtimeEvent.sessionId,
      threadId: runtimeEvent.threadId,
      turnId: runtimeEvent.turnId,
      runId: runtimeEvent.runId,
      occurredAt: runtimeEvent.timestamp,
      type: RUNTIME_EVENT_TYPE_MAP[runtimeEvent.type] ?? runtimeEvent.type,
      payload: normalizePayload(runtimeEvent),
    });
    this.stream?.publish(event);
    return event;
  }
}

function runtimeEventId(event: RuntimeEventLike): string {
  return `runtime:${event.runId}:${event.sequence}`;
}

function normalizePayload(event: RuntimeEventLike): JsonValue {
  const payload = toJsonValue(event.payload);
  if (payload === null || Array.isArray(payload) || typeof payload !== 'object') return payload;
  if (event.type === 'verification.feedback') {
    return {
      role: 'system',
      content: stringValue(payload.content) ?? 'Verification failed; repair is required before completion.',
      verification: payload,
    };
  }
  if (event.type === 'tool.request') {
    return {
      ...payload,
      toolCallId: stringValue(payload.id) ?? stringValue(payload.toolCallId) ?? `sequence-${event.sequence}`,
    };
  }
  if (event.type === 'tool.result') {
    return {
      ...payload,
      toolCallId: stringValue(payload.callId) ?? stringValue(payload.toolCallId) ?? `sequence-${event.sequence}`,
      output: payload,
    };
  }
  return payload;
}

function toJsonValue(value: unknown): JsonValue {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : JSON.parse(encoded) as JsonValue;
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
