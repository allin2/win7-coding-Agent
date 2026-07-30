/**
 * backlog.ts — Bounded backpressure queue.
 *
 * Events enter a bounded queue before being drained into the EventStore.
 * When the queue is full, enqueue operations are rejected (backpressure signal)
 * rather than silently dropping events.
 */

import { Event, StateError, StateErrorCode } from './types';
import { IEventStore } from './store';

/** Backpressure signal emitted when queue approaches capacity. */
export interface BackpressureSignal {
  /** Current queue size. */
  currentSize: number;
  /** Maximum queue size. */
  maxSize: number;
  /** Utilization ratio (0-1). */
  utilization: number;
  /** Warning message. */
  message: string;
}

/** Callback for backpressure warnings. */
export type BackpressureCallback = (signal: BackpressureSignal) => void;

/** Options for the BacklogQueue. */
export interface BacklogQueueOptions {
  /** Maximum number of events in the queue. */
  maxSize: number;
  /** Threshold (0-1) at which backpressure warnings are emitted. Default: 0.8. */
  warningThreshold?: number;
  /** Callback invoked when backpressure threshold is reached. */
  onBackpressure?: BackpressureCallback;
}

/** Bounded backpressure queue for events. */
export class BacklogQueue {
  private queue: Event[] = [];
  private maxSize: number;
  private warningThreshold: number;
  private onBackpressure?: BackpressureCallback;
  private totalEnqueued = 0;
  private totalDequeued = 0;
  private totalRejected = 0;

  constructor(options: BacklogQueueOptions) {
    if (options.maxSize < 1) {
      throw new Error('maxSize must be at least 1');
    }
    this.maxSize = options.maxSize;
    this.warningThreshold = options.warningThreshold ?? 0.8;
    this.onBackpressure = options.onBackpressure;
  }

  /**
   * Enqueue an event. Rejects with EVENTSTORE_BACKPRESSURE if queue is full.
   * Returns true if enqueued, false if rejected.
   */
  enqueue(event: Event): boolean {
    if (this.queue.length >= this.maxSize) {
      this.totalRejected++;
      throw new StateError(
        StateErrorCode.EVENTSTORE_BACKPRESSURE,
        `Queue is full (${this.queue.length}/${this.maxSize}). Event rejected.`,
      );
    }

    this.queue.push(event);
    this.totalEnqueued++;

    // Check backpressure threshold.
    const utilization = this.queue.length / this.maxSize;
    if (utilization >= this.warningThreshold && this.onBackpressure) {
      this.onBackpressure({
        currentSize: this.queue.length,
        maxSize: this.maxSize,
        utilization,
        message: `Queue utilization at ${(utilization * 100).toFixed(1)}% (${this.queue.length}/${this.maxSize})`,
      });
    }

    return true;
  }

  /**
   * Dequeue the next event. Returns undefined if queue is empty.
   */
  dequeue(): Event | undefined {
    const event = this.queue.shift();
    if (event) {
      this.totalDequeued++;
    }
    return event;
  }

  /**
   * Drain all queued events into the provided EventStore.
   * Returns the number of events drained.
   */
  drain(store: IEventStore): number {
    let count = 0;
    while (this.queue.length > 0) {
      const event = this.queue.shift();
      if (event) {
        store.append(event);
        this.totalDequeued++;
        count++;
      }
    }
    return count;
  }

  /** Current number of events in the queue. */
  size(): number {
    return this.queue.length;
  }

  /** Whether the queue is empty. */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /** Whether the queue is full. */
  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  /** Maximum queue capacity. */
  getMaxSize(): number {
    return this.maxSize;
  }

  /** Total events enqueued (lifetime). */
  getTotalEnqueued(): number {
    return this.totalEnqueued;
  }

  /** Total events dequeued (lifetime). */
  getTotalDequeued(): number {
    return this.totalDequeued;
  }

  /** Total events rejected due to backpressure (lifetime). */
  getTotalRejected(): number {
    return this.totalRejected;
  }

  /** Clear the queue without draining. Returns discarded events. */
  clear(): Event[] {
    const discarded = this.queue.slice();
    this.queue = [];
    return discarded;
  }
}
