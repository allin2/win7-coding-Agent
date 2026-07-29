/**
 * wal.ts — WAL (Write-Ahead Log) transaction interface.
 *
 * Provides transactional batch writes with begin/commit/rollback semantics.
 * The current implementation buffers events in memory and flushes on commit.
 * A future SQLite-backed WAL will persist the buffer to disk for crash safety.
 */

import { Event, StateError, StateErrorCode } from './types';
import { IEventStore } from './store';

/** Transaction state. */
export enum TransactionState {
  IDLE = 'idle',
  ACTIVE = 'active',
  COMMITTED = 'committed',
  ROLLED_BACK = 'rolled_back',
}

/** Interface for a single WAL transaction. */
export interface WALTransaction {
  /** Begin the transaction. */
  begin(): void;
  /** Write an event into the transaction buffer. */
  write(event: Event): void;
  /** Commit all buffered events to the store atomically. */
  commit(): number;
  /** Roll back the transaction, discarding all buffered events. */
  rollback(): void;
  /** Current state of the transaction. */
  getState(): TransactionState;
  /** Number of events currently buffered. */
  bufferedCount(): number;
}

/** WAL manager that creates and tracks transactions against an IEventStore. */
export class WALManager {
  private store: IEventStore;
  private activeTransaction: InMemoryWALTransaction | null = null;

  constructor(store: IEventStore) {
    this.store = store;
  }

  /** Begin a new transaction. Only one active transaction at a time. */
  beginTransaction(): WALTransaction {
    if (this.activeTransaction && this.activeTransaction.getState() === TransactionState.ACTIVE) {
      throw new Error('A transaction is already active. Commit or rollback before starting a new one.');
    }
    const tx = new InMemoryWALTransaction(this.store);
    this.activeTransaction = tx;
    tx.begin();
    return tx;
  }

  /** Get the currently active transaction, if any. */
  getActiveTransaction(): WALTransaction | null {
    if (this.activeTransaction && this.activeTransaction.getState() === TransactionState.ACTIVE) {
      return this.activeTransaction;
    }
    return null;
  }
}

/** In-memory WAL transaction implementation. */
class InMemoryWALTransaction implements WALTransaction {
  private store: IEventStore;
  private buffer: Event[] = [];
  private state: TransactionState = TransactionState.IDLE;

  constructor(store: IEventStore) {
    this.store = store;
  }

  begin(): void {
    if (this.state !== TransactionState.IDLE) {
      throw new Error(`Cannot begin transaction in state: ${this.state}`);
    }
    this.buffer = [];
    this.state = TransactionState.ACTIVE;
  }

  write(event: Event): void {
    if (this.state !== TransactionState.ACTIVE) {
      throw new Error(`Cannot write to transaction in state: ${this.state}`);
    }
    this.buffer.push({ ...event });
  }

  commit(): number {
    if (this.state !== TransactionState.ACTIVE) {
      throw new Error(`Cannot commit transaction in state: ${this.state}`);
    }

    let committed = 0;
    try {
      for (const event of this.buffer) {
        this.store.append(event);
        committed++;
      }
      this.state = TransactionState.COMMITTED;
    } catch (err) {
      // Partial commit occurred — mark as rolled back for safety.
      this.state = TransactionState.ROLLED_BACK;
      if (err instanceof StateError) {
        throw err;
      }
      throw new Error(`Transaction commit failed after ${committed} events: ${err}`);
    }

    return committed;
  }

  rollback(): void {
    if (this.state !== TransactionState.ACTIVE) {
      throw new Error(`Cannot rollback transaction in state: ${this.state}`);
    }
    this.buffer = [];
    this.state = TransactionState.ROLLED_BACK;
  }

  getState(): TransactionState {
    return this.state;
  }

  bufferedCount(): number {
    return this.buffer.length;
  }
}
