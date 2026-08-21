/**
 * V2 event protocol: immutable facts are the only source of truth.
 *
 * This module intentionally has no storage-engine dependency. A durable store may
 * implement the same submit/query boundary after SPIKE_04; projections must remain
 * reproducible from the retained facts.
 */

import { StateError, StateErrorCode } from './types';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface EventEnvelopeInputV2 {
  readonly eventId: string;
  readonly schemaVersion: 2;
  readonly sessionId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly occurredAt: string;
  readonly type: string;
  readonly payload: JsonValue;
}

export interface EventEnvelopeV2 extends EventEnvelopeInputV2 {
  /** Monotonically increasing only within one Thread. Assigned after validation. */
  readonly seq: number;
}

export interface EventProtocolWarning {
  readonly code: 'UNKNOWN_EVENT_TYPE' | 'INVALID_COMPACTION';
  readonly eventId: string;
  readonly message: string;
}

export interface ProjectedToolResult {
  readonly toolCallId: string;
  readonly status: string;
  readonly output?: JsonValue;
  readonly derivedFromEventId: string;
}

export interface FileChangeProjection {
  readonly path: string;
  readonly operation: string;
  readonly beforeSha256?: string;
  readonly afterSha256?: string;
  readonly eventId: string;
}

export interface ThreadProjection {
  readonly messages: readonly JsonValue[];
  readonly toolResults: readonly ProjectedToolResult[];
  readonly fileChanges: readonly FileChangeProjection[];
  readonly usage: readonly JsonValue[];
  readonly activeCompactionIds: readonly string[];
  readonly warnings: readonly EventProtocolWarning[];
}

/** Storage boundary shared by the in-memory reference and the D-014 SQLite implementation. */
export interface EventLedger {
  submit(input: EventEnvelopeInputV2): EventEnvelopeV2;
  submitBatch(inputs: readonly EventEnvelopeInputV2[]): EventEnvelopeV2[];
  queryThread(threadId: string): readonly EventEnvelopeV2[];
  getById(eventId: string): EventEnvelopeV2 | undefined;
  readonly size: number;
}

const KNOWN_TYPES = new Set<string>([
  'turn.started', 'turn.suspended', 'turn.resumed', 'turn.finished',
  'step.started', 'step.retry', 'step.completed', 'state.transition',
  'model.request.started', 'model.response.received',
  'message.added', 'tool.call.started', 'tool.output.delta', 'tool.call.finished',
  'file.changed', 'usage.recorded', 'approval.requested', 'approval.resolved',
  'policy.decision', 'budget.exceeded', 'verification.bundle', 'verification.feedback',
  'error.raised', 'compaction.applied', 'working_memory.updated',
  'gateway.delta',
]);

/** An in-memory reference ledger. It is deliberately not claimed as durable recovery. */
export class InMemoryEventLedger implements EventLedger {
  private readonly eventsByThread = new Map<string, EventEnvelopeV2[]>();
  private readonly eventsById = new Map<string, EventEnvelopeV2>();

  constructor(private readonly maxEvents = 10_000) {
    if (!Number.isInteger(maxEvents) || maxEvents < 1) {
      throw new StateError(StateErrorCode.EVENTSTORE_CAPACITY_EXCEEDED, 'maxEvents must be a positive integer');
    }
  }

  submit(input: EventEnvelopeInputV2): EventEnvelopeV2 {
    return this.submitBatch([input])[0];
  }

  /** Validates the whole batch before publishing any of its facts. */
  submitBatch(inputs: readonly EventEnvelopeInputV2[]): EventEnvelopeV2[] {
    const staged = new Map<string, EventEnvelopeV2>();
    const nextSeq = new Map<string, number>();
    const result: EventEnvelopeV2[] = [];
    for (const input of inputs) {
      validateV2Input(input);
      const existing = this.eventsById.get(input.eventId) ?? staged.get(input.eventId);
      if (existing) {
        if (eventFingerprint(existing) !== eventFingerprint(input)) {
          throw constraint(`Event ${input.eventId} conflicts with an existing fact`);
        }
        result.push(existing);
        continue;
      }
      const assigned = nextSeq.get(input.threadId) ?? ((this.eventsByThread.get(input.threadId)?.length ?? 0) + 1);
      const event = freezeEvent({ ...cloneInput(input), seq: assigned });
      staged.set(event.eventId, event);
      nextSeq.set(event.threadId, assigned + 1);
      result.push(event);
    }
    const newEventCount = Array.from(staged.values()).filter((event) => !this.eventsById.has(event.eventId)).length;
    if (this.eventsById.size + newEventCount > this.maxEvents) {
      throw new StateError(
        StateErrorCode.EVENTSTORE_CAPACITY_EXCEEDED,
        `Event ledger capacity ${this.maxEvents} would be exceeded`,
      );
    }
    for (const event of staged.values()) {
      const thread = this.eventsByThread.get(event.threadId) ?? [];
      thread.push(event);
      this.eventsByThread.set(event.threadId, thread);
      this.eventsById.set(event.eventId, event);
    }
    return result.slice();
  }

  queryThread(threadId: string): readonly EventEnvelopeV2[] {
    return (this.eventsByThread.get(threadId) ?? []).slice();
  }

  getById(eventId: string): EventEnvelopeV2 | undefined {
    return this.eventsById.get(eventId);
  }

  get size(): number {
    return this.eventsById.size;
  }
}

/** Build all user-visible state from facts; unknown future facts never crash an old reader. */
export function projectThread(events: readonly EventEnvelopeV2[]): ThreadProjection {
  const orderedEvents = events.slice().sort((a, b) => a.seq - b.seq);
  const messageEntries: Array<{ seq: number; value: JsonValue }> = [];
  const toolResults: ProjectedToolResult[] = [];
  const fileChanges: FileChangeProjection[] = [];
  const usage: JsonValue[] = [];
  const warnings: EventProtocolWarning[] = [];
  const started = new Map<string, EventEnvelopeV2>();
  const compactions = new Map<string, {
    eventId: string;
    supersedes: readonly string[];
    fromSeq?: number;
    toSeq?: number;
    summary?: JsonValue;
  }>();

  for (const event of orderedEvents) {
    if (!KNOWN_TYPES.has(event.type)) {
      warnings.push({ code: 'UNKNOWN_EVENT_TYPE', eventId: event.eventId, message: `Skipped unknown event type ${event.type}` });
      continue;
    }
    const payload = objectPayload(event.payload);
    switch (event.type) {
      case 'turn.started': {
        const prompt = stringField(payload, 'prompt');
        if (prompt) messageEntries.push({ seq: event.seq, value: { role: 'user', content: prompt } });
        break;
      }
      case 'message.added':
        messageEntries.push({ seq: event.seq, value: event.payload });
        break;
      case 'model.response.received':
        messageEntries.push({ seq: event.seq, value: projectModelResponse(payload) });
        break;
      case 'tool.call.started': {
        const toolCallId = stringField(payload, 'toolCallId');
        if (toolCallId) started.set(toolCallId, event);
        break;
      }
      case 'tool.call.finished': {
        const toolCallId = stringField(payload, 'toolCallId');
        if (toolCallId) {
          started.delete(toolCallId);
          const toolResult = { toolCallId, status: stringField(payload, 'status') ?? 'completed', output: payload.output, derivedFromEventId: event.eventId };
          toolResults.push(toolResult);
          const observation = payload.observation;
          messageEntries.push({
            seq: event.seq,
            value: {
              role: 'tool',
              toolCallId,
              content: JSON.stringify(observation ?? toolResult.output ?? toolResult),
              ...(observation !== undefined ? { observation } : {}),
            },
          });
        }
        break;
      }
      case 'file.changed': {
        const path = stringField(payload, 'path');
        const operation = stringField(payload, 'operation');
        if (path && operation) fileChanges.push({ path, operation, beforeSha256: stringField(payload, 'beforeSha256'), afterSha256: stringField(payload, 'afterSha256'), eventId: event.eventId });
        break;
      }
      case 'usage.recorded':
        usage.push(event.payload);
        break;
      case 'compaction.applied': {
        const compactionId = stringField(payload, 'compactionId');
        const supersedes = arrayOfStrings(payload.supersedesCompactionIds);
        const range = objectPayload(payload.replacedSeqRange ?? null);
        const fromSeq = numberField(range, 'fromSeq');
        const toSeq = numberField(range, 'toSeq');
        if (compactionId && validRange(fromSeq, toSeq) && payload.summary !== undefined) {
          compactions.set(compactionId, { eventId: event.eventId, supersedes, fromSeq, toSeq, summary: payload.summary });
        } else if (compactionId && payload.replacedSeqRange === undefined && payload.summary === undefined) {
          // Compatibility with the first V2 draft: retain DAG identity but do not rewrite messages.
          compactions.set(compactionId, { eventId: event.eventId, supersedes });
        }
        else warnings.push({ code: 'INVALID_COMPACTION', eventId: event.eventId, message: 'Skipped compaction without compactionId' });
        break;
      }
      default:
        break;
    }
  }

  for (const [toolCallId, event] of started) {
    const interrupted: ProjectedToolResult = { toolCallId, status: 'interrupted', output: { reason: 'missing_finished_event' }, derivedFromEventId: event.eventId };
    toolResults.push(interrupted);
    messageEntries.push({ seq: event.seq, value: { role: 'tool', toolCallId, content: JSON.stringify(interrupted) } });
  }
  const superseded = new Set<string>();
  for (const compaction of compactions.values()) for (const id of compaction.supersedes) superseded.add(id);
  const activeCompactionIds = Array.from(compactions.keys()).filter((id) => !superseded.has(id));
  const activeRanges = activeCompactionIds.flatMap((id) => {
    const compaction = compactions.get(id)!;
    return compaction.fromSeq !== undefined && compaction.toSeq !== undefined && compaction.summary !== undefined
      ? [{ fromSeq: compaction.fromSeq, toSeq: compaction.toSeq, summary: compaction.summary }]
      : [];
  });
  const compactedMessages = messageEntries
    .filter((entry) => !activeRanges.some((range) => entry.seq >= range.fromSeq && entry.seq <= range.toSeq))
    .concat(activeRanges.map((range) => ({ seq: range.fromSeq, value: range.summary })))
    .sort((left, right) => left.seq - right.seq)
    .map((entry) => entry.value);
  return { messages: compactedMessages, toolResults, fileChanges, usage, activeCompactionIds, warnings };
}

export function validateV2Input(input: EventEnvelopeInputV2): void {
  if (input.schemaVersion !== 2 || !input.eventId || !input.sessionId || !input.threadId || !input.turnId || !input.runId || !input.type) throw constraint('V2 event identity fields are required');
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw constraint('occurredAt must be a valid UTC timestamp');
  try { JSON.stringify(input.payload); } catch { throw constraint('payload must be JSON serializable'); }
}
export function constraint(message: string): StateError { return new StateError(StateErrorCode.EVENTSTORE_CONSTRAINT_VIOLATION, message); }
export function cloneInput(input: EventEnvelopeInputV2): EventEnvelopeInputV2 { return JSON.parse(JSON.stringify(input)) as EventEnvelopeInputV2; }
export function freezeEvent(event: EventEnvelopeV2): EventEnvelopeV2 { return Object.freeze(event); }
export function eventFingerprint(event: Omit<EventEnvelopeV2, 'seq'> | EventEnvelopeV2): string {
  return JSON.stringify({
    eventId: event.eventId,
    schemaVersion: event.schemaVersion,
    sessionId: event.sessionId,
    threadId: event.threadId,
    turnId: event.turnId,
    runId: event.runId,
    occurredAt: event.occurredAt,
    type: event.type,
    payload: event.payload,
  });
}
function objectPayload(payload: JsonValue): { [key: string]: JsonValue } { return payload !== null && !Array.isArray(payload) && typeof payload === 'object' ? payload : {}; }
function stringField(payload: { [key: string]: JsonValue }, name: string): string | undefined { return typeof payload[name] === 'string' ? payload[name] as string : undefined; }
function numberField(payload: { [key: string]: JsonValue }, name: string): number | undefined { return typeof payload[name] === 'number' ? payload[name] as number : undefined; }
function arrayOfStrings(value: JsonValue | undefined): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function validRange(fromSeq: number | undefined, toSeq: number | undefined): fromSeq is number { return Number.isInteger(fromSeq) && Number.isInteger(toSeq) && (fromSeq as number) >= 1 && (toSeq as number) >= (fromSeq as number); }
function projectModelResponse(payload: { [key: string]: JsonValue }): JsonValue {
  const plan = objectPayload(payload.plan ?? payload);
  const summary = stringField(plan, 'finalResponse') ?? stringField(plan, 'summary') ?? '';
  const plannedCalls = Array.isArray(plan.toolCalls) ? plan.toolCalls : [];
  const toolCalls = plannedCalls.map((item) => objectPayload(objectPayload(item).call ?? item));
  return { role: 'assistant', content: summary, ...(toolCalls.length > 0 ? { toolCalls } : {}) };
}
