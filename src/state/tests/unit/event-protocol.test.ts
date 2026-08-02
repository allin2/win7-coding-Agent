import {
  EventEnvelopeInputV2,
  InMemoryEventLedger,
  projectThread,
} from '../../src/event-protocol';

function fact(overrides: Partial<EventEnvelopeInputV2> = {}): EventEnvelopeInputV2 {
  return {
    eventId: 'event-1', schemaVersion: 2, sessionId: 'session-1', threadId: 'thread-1',
    turnId: 'turn-1', runId: 'run-1', occurredAt: '2026-07-30T00:00:00.000Z',
    type: 'turn.started', payload: {}, ...overrides,
  };
}

describe('V2 event protocol', () => {
  it('assigns a stable Thread sequence and makes an identical retry idempotent', () => {
    const ledger = new InMemoryEventLedger();
    const first = ledger.submit(fact());
    const retried = ledger.submit(fact());
    const second = ledger.submit(fact({ eventId: 'event-2', type: 'message.added', payload: { role: 'user', content: 'hello' } }));

    expect(first.seq).toBe(1);
    expect(retried).toBe(first);
    expect(second.seq).toBe(2);
    expect(ledger.queryThread('thread-1')).toHaveLength(2);
  });

  it('rejects an idempotency-key conflict without appending a new fact', () => {
    const ledger = new InMemoryEventLedger();
    ledger.submit(fact());
    expect(() => ledger.submit(fact({ payload: { changed: true } }))).toThrow('conflicts');
    expect(ledger.queryThread('thread-1')).toHaveLength(1);
  });

  it('enforces a bounded in-memory event capacity before publishing a batch', () => {
    const ledger = new InMemoryEventLedger(1);
    ledger.submit(fact({ eventId: 'capacity-1' }));
    expect(() => ledger.submit(fact({ eventId: 'capacity-2' }))).toThrow(/capacity 1/);
    expect(ledger.size).toBe(1);
  });

  it('projects orphan tool starts as an interrupted result and preserves file facts', () => {
    const ledger = new InMemoryEventLedger();
    ledger.submitBatch([
      fact({ eventId: 'start', type: 'tool.call.started', payload: { toolCallId: 'call-1', name: 'writeFile' } }),
      fact({ eventId: 'file', type: 'file.changed', payload: { path: 'src/a.ts', operation: 'replace', beforeSha256: 'a', afterSha256: 'b' } }),
    ]);

    const projection = projectThread(ledger.queryThread('thread-1'));
    expect(projection.toolResults).toEqual([expect.objectContaining({ toolCallId: 'call-1', status: 'interrupted' })]);
    expect(projection.fileChanges).toEqual([expect.objectContaining({ path: 'src/a.ts', afterSha256: 'b' })]);
  });

  it('skips unknown future facts with a warning and keeps compaction history additive', () => {
    const ledger = new InMemoryEventLedger();
    ledger.submitBatch([
      fact({ eventId: 'compact-1', type: 'compaction.applied', payload: { compactionId: 'c1' } }),
      fact({ eventId: 'compact-2', type: 'compaction.applied', payload: { compactionId: 'c2', supersedesCompactionIds: ['c1'] } }),
      fact({ eventId: 'future', type: 'future.event', payload: {} }),
    ]);
    const projection = projectThread(ledger.queryThread('thread-1'));
    expect(projection.activeCompactionIds).toEqual(['c2']);
    expect(projection.warnings).toEqual([expect.objectContaining({ code: 'UNKNOWN_EVENT_TYPE', eventId: 'future' })]);
    expect(ledger.queryThread('thread-1')).toHaveLength(3);
  });

  it('replaces only the active compaction range in the message projection', () => {
    const ledger = new InMemoryEventLedger();
    ledger.submitBatch([
      fact({ eventId: 'm1', type: 'message.added', payload: { role: 'user', content: 'one' } }),
      fact({ eventId: 'm2', type: 'message.added', payload: { role: 'assistant', content: 'two' } }),
      fact({ eventId: 'm3', type: 'message.added', payload: { role: 'user', content: 'three' } }),
      fact({ eventId: 'c1', type: 'compaction.applied', payload: { compactionId: 'c1', replacedSeqRange: { fromSeq: 1, toSeq: 2 }, summary: { role: 'system', content: 'summary-1' } } }),
      fact({ eventId: 'c2', type: 'compaction.applied', payload: { compactionId: 'c2', supersedesCompactionIds: ['c1'], replacedSeqRange: { fromSeq: 1, toSeq: 2 }, summary: { role: 'system', content: 'summary-2' } } }),
    ]);

    const projection = projectThread(ledger.queryThread('thread-1'));
    expect(projection.messages).toEqual([
      { role: 'system', content: 'summary-2' },
      { role: 'user', content: 'three' },
    ]);
    expect(projection.activeCompactionIds).toEqual(['c2']);
    expect(ledger.queryThread('thread-1')).toHaveLength(5);
  });
});
