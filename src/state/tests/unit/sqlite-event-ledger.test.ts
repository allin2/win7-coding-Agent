import {
  EventEnvelopeInputV2,
  SqliteDatabase,
  SqliteEventLedger,
  SqliteStatement,
  StateErrorCode,
} from '../../src';

interface StoredRow {
  event_id: string;
  schema_version: number;
  session_id: string;
  thread_id: string;
  turn_id: string;
  run_id: string;
  occurred_at: string;
  event_type: string;
  payload_json: string;
  fingerprint: string;
  seq: number;
}

interface FakeStore {
  events: Map<string, StoredRow>;
  fts: Array<{ eventId: string; type: string; payload: string }>;
}

class StructuralSqliteDriver implements SqliteDatabase {
  readonly pragmas: string[] = [];
  closed = false;
  failFtsInsert = false;

  constructor(
    readonly store: FakeStore = { events: new Map(), fts: [] },
    readonly options: { version?: string; compileOptions?: string[]; journalMode?: string; quickCheck?: string } = {},
  ) {}

  pragma(source: string, options?: { simple?: boolean }): unknown {
    this.pragmas.push(`${source}:${options?.simple === true ? 'simple' : 'rows'}`);
    if (source === 'compile_options') {
      return (this.options.compileOptions ?? ['ENABLE_FTS5', 'ENABLE_COLUMN_METADATA', 'THREADSAFE=2'])
        .map((compile_options) => ({ compile_options }));
    }
    if (source === 'journal_mode = WAL') return this.options.journalMode ?? 'wal';
    if (source === 'quick_check') return this.options.quickCheck ?? 'ok';
    return [];
  }

  exec(_source: string): void {}

  prepare(source: string): SqliteStatement {
    if (source.startsWith('SELECT sqlite_version()')) {
      return statement({ get: () => ({ version: this.options.version ?? '3.43.1' }) });
    }
    if (source.startsWith('SELECT COUNT(*)')) {
      return statement({ get: () => ({ count: this.store.events.size }) });
    }
    if (source.startsWith('SELECT * FROM rc_events_v2 WHERE event_id')) {
      return statement({ get: (eventId) => this.store.events.get(String(eventId)) });
    }
    if (source.startsWith('SELECT * FROM rc_events_v2 WHERE thread_id')) {
      return statement({ all: (threadId) => Array.from(this.store.events.values())
        .filter((row) => row.thread_id === threadId)
        .sort((left, right) => left.seq - right.seq) });
    }
    if (source.startsWith('SELECT * FROM rc_events_v2 ORDER BY thread_id')) {
      return statement({ all: () => Array.from(this.store.events.values())
        .sort((left, right) => left.thread_id.localeCompare(right.thread_id) || left.seq - right.seq) });
    }
    if (source.startsWith('SELECT COALESCE(MAX(seq)')) {
      return statement({ get: (threadId) => ({
        next_seq: Math.max(0, ...Array.from(this.store.events.values())
          .filter((row) => row.thread_id === threadId)
          .map((row) => row.seq)) + 1,
      }) });
    }
    if (source.startsWith('INSERT INTO rc_events_v2\n')) {
      return statement({ run: (...params) => {
        const row: StoredRow = {
          event_id: String(params[0]), schema_version: Number(params[1]), session_id: String(params[2]),
          thread_id: String(params[3]), turn_id: String(params[4]), run_id: String(params[5]),
          occurred_at: String(params[6]), event_type: String(params[7]), payload_json: String(params[8]),
          fingerprint: String(params[9]), seq: Number(params[10]),
        };
        if (this.store.events.has(row.event_id)) throw new Error('duplicate event');
        this.store.events.set(row.event_id, row);
        return { changes: 1 };
      } });
    }
    if (source.startsWith('INSERT INTO rc_events_v2_fts')) {
      return statement({ run: (eventId, type, payload) => {
        if (this.failFtsInsert) throw new Error('injected FTS failure');
        this.store.fts.push({ eventId: String(eventId), type: String(type), payload: String(payload) });
        return { changes: 1 };
      } });
    }
    throw new Error(`Unexpected SQL in structural driver: ${source}`);
  }

  transaction<T>(operation: () => T): () => T {
    return () => {
      const eventSnapshot = new Map(Array.from(this.store.events, ([key, value]) => [key, { ...value }]));
      const ftsSnapshot = this.store.fts.map((entry) => ({ ...entry }));
      try {
        return operation();
      } catch (error) {
        this.store.events = eventSnapshot;
        this.store.fts = ftsSnapshot;
        throw error;
      }
    };
  }

  close(): void { this.closed = true; }
}

function statement(overrides: {
  get?: (...params: unknown[]) => unknown;
  all?: (...params: unknown[]) => unknown[];
  run?: (...params: unknown[]) => { changes?: number | bigint; lastInsertRowid?: number | bigint };
}): SqliteStatement {
  return {
    get: overrides.get ?? (() => undefined),
    all: overrides.all ?? (() => []),
    run: overrides.run ?? (() => ({ changes: 0 })),
  };
}

function fact(eventId: string, overrides: Partial<EventEnvelopeInputV2> = {}): EventEnvelopeInputV2 {
  return {
    eventId, schemaVersion: 2, sessionId: 'session-1', threadId: 'thread-1', turnId: 'turn-1',
    runId: 'run-1', occurredAt: '2026-08-12T00:00:00.000Z', type: 'message.added',
    payload: { role: 'user', content: '中文 空格' }, ...overrides,
  };
}

describe('D-014 SqliteEventLedger', () => {
  it('enforces the locked SQLite/WAL/FTS5 profile before publishing events', () => {
    const driver = new StructuralSqliteDriver();
    const ledger = new SqliteEventLedger(driver, { databasePath: 'C:\\RC 数据\\state.db' });
    expect(ledger.runtimeProfile).toMatchObject({
      profile: 'E22-SQLITE343-LOCAL-SSD', sqliteVersion: '3.43.1', journalMode: 'wal',
      databasePath: 'C:\\RC 数据\\state.db',
    });
    expect(driver.pragmas).toEqual(expect.arrayContaining([
      'journal_mode = WAL:simple', 'synchronous = NORMAL:rows', 'foreign_keys = ON:rows',
    ]));
  });

  it('persists immutable Unicode facts across a reopened database handle', () => {
    const store: FakeStore = { events: new Map(), fts: [] };
    const first = new SqliteEventLedger(new StructuralSqliteDriver(store));
    const written = first.submitBatch([fact('event-1'), fact('event-2', { type: 'usage.recorded', payload: { tokens: 2 } })]);
    expect(written.map((event) => event.seq)).toEqual([1, 2]);
    expect(first.submit(fact('event-1')).seq).toBe(1);

    const reopened = new SqliteEventLedger(new StructuralSqliteDriver(store));
    expect(reopened.queryThread('thread-1')).toEqual(written);
    expect(reopened.getById('event-1')).toEqual(written[0]);
    expect(reopened.size).toBe(2);
    expect(store.fts).toHaveLength(2);
  });

  it('uses a stable persisted fingerprint independent of caller field insertion order', () => {
    const store: FakeStore = { events: new Map(), fts: [] };
    const ledger = new SqliteEventLedger(new StructuralSqliteDriver(store));
    const reordered = {
      payload: { content: 'stable', role: 'user' },
      type: 'message.added',
      occurredAt: '2026-08-12T00:00:00.000Z',
      runId: 'run-1',
      turnId: 'turn-1',
      threadId: 'thread-1',
      sessionId: 'session-1',
      schemaVersion: 2,
      eventId: 'reordered',
    } as EventEnvelopeInputV2;
    const written = ledger.submit(reordered);
    expect(new SqliteEventLedger(new StructuralSqliteDriver(store)).getById('reordered')).toEqual(written);
  });

  it('rolls back the complete batch when the FTS write fails', () => {
    const driver = new StructuralSqliteDriver();
    driver.failFtsInsert = true;
    const ledger = new SqliteEventLedger(driver);
    expect(() => ledger.submit(fact('rollback'))).toThrow('injected FTS failure');
    expect(ledger.size).toBe(0);
    expect(driver.store.fts).toHaveLength(0);
  });

  it('rejects oversized payloads atomically', () => {
    const ledger = new SqliteEventLedger(new StructuralSqliteDriver());
    expect(() => ledger.submit(fact('oversized', { payload: { content: 'x'.repeat(65 * 1024) } })))
      .toThrow('exceeds limit');
    expect(ledger.size).toBe(0);
  });

  it('still closes the database when the final WAL checkpoint fails', () => {
    const driver = new StructuralSqliteDriver();
    const originalPragma = driver.pragma.bind(driver);
    driver.pragma = (source, options) => {
      if (source === 'wal_checkpoint(TRUNCATE)') throw new Error('injected checkpoint failure');
      return originalPragma(source, options);
    };
    const ledger = new SqliteEventLedger(driver);
    expect(() => ledger.close()).toThrow('checkpoint failed');
    expect(driver.closed).toBe(true);
  });

  it('rejects idempotency conflicts, capacity overflow and tampered persisted facts', () => {
    const driver = new StructuralSqliteDriver();
    const ledger = new SqliteEventLedger(driver, { maxEvents: 1 });
    ledger.submit(fact('event-1'));
    expect(() => ledger.submit(fact('event-1', { payload: { changed: true } }))).toThrow('conflicts');
    expect(() => ledger.submit(fact('event-2'))).toThrow('capacity 1');
    driver.store.events.get('event-1')!.payload_json = '{"tampered":true}';
    try {
      ledger.getById('event-1');
      throw new Error('expected recovery failure');
    } catch (error) {
      expect(error).toMatchObject({ code: StateErrorCode.RECOVERY_INCONSISTENT });
    }
  });

  it('detects corrupt facts and sequence gaps during reopen', () => {
    const tamperedStore: FakeStore = { events: new Map(), fts: [] };
    const ledger = new SqliteEventLedger(new StructuralSqliteDriver(tamperedStore));
    ledger.submitBatch([fact('event-1'), fact('event-2')]);
    tamperedStore.events.get('event-1')!.fingerprint = 'tampered';
    expect(() => new SqliteEventLedger(new StructuralSqliteDriver(tamperedStore))).toThrow('fingerprint mismatch');

    const gapStore: FakeStore = { events: new Map(), fts: [] };
    const gapLedger = new SqliteEventLedger(new StructuralSqliteDriver(gapStore));
    gapLedger.submitBatch([fact('gap-1'), fact('gap-2')]);
    gapStore.events.delete('gap-1');
    expect(() => new SqliteEventLedger(new StructuralSqliteDriver(gapStore))).toThrow('sequence gap');
  });

  it.each([
    ['wrong SQLite version', { version: '3.44.0' }, /does not match/],
    ['missing FTS5', { compileOptions: ['ENABLE_COLUMN_METADATA', 'THREADSAFE=2'] }, /ENABLE_FTS5/],
    ['WAL unavailable', { journalMode: 'delete' }, /WAL unavailable/],
    ['quick check failure', { quickCheck: 'database disk image is malformed' }, /quick_check failed/],
  ])('fails closed for %s', (_name, options, pattern) => {
    expect(() => new SqliteEventLedger(new StructuralSqliteDriver(undefined, options))).toThrow(pattern);
  });
});
