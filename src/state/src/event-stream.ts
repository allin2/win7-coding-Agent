/** Per-subscriber bounded queues for V2 facts. */
import { EventEnvelopeV2 } from './event-protocol';
import { StateError, StateErrorCode } from './types';

export interface EventSubscription {
  readonly id: string;
  drain(): readonly EventEnvelopeV2[];
  unsubscribe(): void;
}

interface Subscriber { readonly id: string; readonly maxPending: number; pending: EventEnvelopeV2[]; active: boolean; }

export class EventStream {
  private readonly subscribers = new Map<string, Subscriber>();
  private nextId = 1;

  subscribe(maxPending = 256): EventSubscription {
    if (!Number.isInteger(maxPending) || maxPending < 1) throw new StateError(StateErrorCode.EVENTSTORE_BACKPRESSURE, 'maxPending must be a positive integer');
    const subscriber: Subscriber = { id: `subscriber-${this.nextId++}`, maxPending, pending: [], active: true };
    this.subscribers.set(subscriber.id, subscriber);
    return { id: subscriber.id, drain: () => { const queued = subscriber.pending.slice(); subscriber.pending.length = 0; return queued; }, unsubscribe: () => { subscriber.active = false; this.subscribers.delete(subscriber.id); } };
  }

  publish(event: EventEnvelopeV2): void {
    if (!isDelta(event) && Array.from(this.subscribers.values()).some((subscriber) => subscriber.active && subscriber.pending.length >= subscriber.maxPending)) {
      throw new StateError(StateErrorCode.EVENTSTORE_BACKPRESSURE, 'A subscriber is full; fact event was retained by the ledger and was not dropped');
    }
    for (const subscriber of this.subscribers.values()) {
      if (!subscriber.active) continue;
      if (subscriber.pending.length < subscriber.maxPending) subscriber.pending.push(event);
      else if (isDelta(event)) {
        const existingIndex = subscriber.pending.findIndex(isDelta);
        if (existingIndex >= 0) subscriber.pending[existingIndex] = event;
        // A delta may be discarded when a queue contains only facts; facts remain intact.
      }
    }
  }
}

function isDelta(event: EventEnvelopeV2): boolean { return event.type === 'tool.output.delta'; }
