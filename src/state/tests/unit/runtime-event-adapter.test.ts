import { InMemoryEventLedger, projectThread } from '../../src/event-protocol';
import { EventStream } from '../../src/event-stream';
import { RuntimeEventLedgerSink, RuntimeEventLike } from '../../src/runtime-event-adapter';

function runtimeEvent(sequence: number, type: string, payload: unknown): RuntimeEventLike {
  return { schemaVersion: '1.0', sequence, type, timestamp: '2026-07-30T00:00:00.000Z', sessionId: 'session-1', threadId: 'thread-1', turnId: 'turn-1', runId: 'run-1', payload };
}

describe('RuntimeEventLedgerSink', () => {
  it('maps Core tool lifecycle events into one V2 sequence authority', () => {
    const ledger = new InMemoryEventLedger();
    const stream = new EventStream();
    const subscription = stream.subscribe();
    const sink = new RuntimeEventLedgerSink(ledger, stream);

    sink.append(runtimeEvent(10, 'tool.request', { id: 'call-1', toolName: 'code.search', args: {} }));
    const observation = {
      schemaVersion: '1.0',
      content: 'bounded result',
      truncated: false,
      originalChars: 14,
      sha256: 'a'.repeat(64),
      state: 'full',
    };
    sink.append(runtimeEvent(11, 'tool.result', {
      callId: 'call-1',
      toolName: 'code.search',
      status: 'succeeded',
      success: true,
      output: ['a.ts'],
      observation,
    }));

    const stored = ledger.queryThread('thread-1');
    expect(stored.map((event) => [event.seq, event.type])).toEqual([
      [1, 'tool.call.started'],
      [2, 'tool.call.finished'],
    ]);
    expect(subscription.drain()).toEqual(stored);
    expect(projectThread(stored).toolResults).toEqual([
      expect.objectContaining({ toolCallId: 'call-1', status: 'succeeded' }),
    ]);
    expect(projectThread(stored).messages[0]).toEqual({
      role: 'tool',
      toolCallId: 'call-1',
      content: JSON.stringify(observation),
      observation,
    });
  });

  it('makes a repeated Runtime event idempotent and rejects conflicting reuse', () => {
    const ledger = new InMemoryEventLedger();
    const sink = new RuntimeEventLedgerSink(ledger);
    sink.append(runtimeEvent(1, 'turn.started', { budget: 1 }));
    sink.append(runtimeEvent(1, 'turn.started', { budget: 1 }));
    expect(ledger.queryThread('thread-1')).toHaveLength(1);
    expect(() => sink.append(runtimeEvent(1, 'turn.started', { budget: 2 }))).toThrow('conflicts');
  });

  it('maps model plans into assistant message projections', () => {
    const ledger = new InMemoryEventLedger();
    const sink = new RuntimeEventLedgerSink(ledger);
    sink.append(runtimeEvent(1, 'model.plan', { plan: { summary: 'Search', toolCalls: [{ call: { id: 'call-1', toolName: 'code.search', args: {} } }] } }));
    expect(projectThread(ledger.queryThread('thread-1')).messages).toEqual([
      { role: 'assistant', content: 'Search', toolCalls: [{ id: 'call-1', toolName: 'code.search', args: {} }] },
    ]);
  });

  it('projects verification feedback as a system message for a repair step', () => {
    const ledger = new InMemoryEventLedger();
    const sink = new RuntimeEventLedgerSink(ledger);
    sink.append(runtimeEvent(1, 'verification.feedback', {
      gateId: 'tests', attempt: 1, content: 'Verification gate tests failed (repair attempt 1/3).',
    }));

    expect(projectThread(ledger.queryThread('thread-1')).messages).toEqual([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('repair attempt 1/3'),
      }),
    ]);
  });
});
