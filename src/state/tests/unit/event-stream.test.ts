import { EventEnvelopeV2 } from '../../src/event-protocol';
import { EventStream } from '../../src/event-stream';

function event(eventId: string, type: string): EventEnvelopeV2 {
  return { eventId, schemaVersion: 2, seq: Number(eventId.replace(/\D/g, '')) || 1, sessionId: 's', threadId: 't', turnId: 'turn', runId: 'run', occurredAt: '2026-07-30T00:00:00.000Z', type, payload: {} };
}

describe('EventStream', () => {
  it('delivers a fact independently to every subscriber', () => {
    const stream = new EventStream();
    const left = stream.subscribe();
    const right = stream.subscribe();
    stream.publish(event('event-1', 'file.changed'));
    expect(left.drain().map((item) => item.eventId)).toEqual(['event-1']);
    expect(right.drain().map((item) => item.eventId)).toEqual(['event-1']);
  });

  it('coalesces only deltas and refuses to drop a fact for a full subscriber', () => {
    const stream = new EventStream();
    const subscription = stream.subscribe(1);
    stream.publish(event('delta-1', 'tool.output.delta'));
    stream.publish(event('delta-2', 'tool.output.delta'));
    expect(subscription.drain().map((item) => item.eventId)).toEqual(['delta-2']);
    stream.publish(event('fact-1', 'file.changed'));
    expect(() => stream.publish(event('fact-2', 'file.changed'))).toThrow('subscriber is full');
    expect(subscription.drain().map((item) => item.eventId)).toEqual(['fact-1']);
  });
});
