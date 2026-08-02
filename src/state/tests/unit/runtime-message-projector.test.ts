import { InMemoryEventLedger } from '../../src/event-protocol';
import { RuntimeEventLedgerSink, RuntimeEventLike } from '../../src/runtime-event-adapter';
import { RuntimeMessageProjection } from '../../src/runtime-message-projector';

function event(sequence: number, type: string, payload: unknown): RuntimeEventLike {
  return { schemaVersion: '1.0', sequence, type, timestamp: '2026-07-30T00:00:00.000Z', sessionId: 's', threadId: 't', turnId: 'turn', runId: 'run', payload };
}

describe('RuntimeMessageProjection', () => {
  it('rebuilds model history and synthesizes an interrupted orphan result', () => {
    const ledger = new InMemoryEventLedger();
    const sink = new RuntimeEventLedgerSink(ledger);
    sink.append(event(1, 'turn.started', { prompt: 'inspect repository' }));
    sink.append(event(2, 'model.plan', { plan: { summary: 'Search', toolCalls: [{ call: { id: 'call-1', toolName: 'code.search', args: {} } }] } }));
    sink.append(event(3, 'tool.request', { id: 'call-1', toolName: 'code.search', args: {} }));

    const messages = new RuntimeMessageProjection(ledger).projectMessages({ sessionId: 's', threadId: 't', turnId: 'turn', runId: 'run' });
    expect(messages).toEqual([
      { role: 'user', content: 'inspect repository' },
      { role: 'assistant', content: 'Search', toolCalls: [{ id: 'call-1', toolName: 'code.search', args: {} }] },
      expect.objectContaining({ role: 'tool', toolCallId: 'call-1' }),
    ]);
    expect((messages[2] as { content: string }).content).toContain('interrupted');
  });

  it('honours an event sequence recovery anchor', () => {
    const ledger = new InMemoryEventLedger();
    const sink = new RuntimeEventLedgerSink(ledger);
    sink.append(event(1, 'turn.started', { prompt: 'first' }));
    sink.append(event(2, 'turn.started', { prompt: 'second' }));
    const messages = new RuntimeMessageProjection(ledger).projectMessages({ sessionId: 's', threadId: 't', turnId: 'turn', runId: 'run', upToSequence: 1 });
    expect(messages).toEqual([{ role: 'user', content: 'first' }]);
  });
});
