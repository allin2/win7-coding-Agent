import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

function createQueue(maxPending: number): any {
  const source = fs.readFileSync(path.join(__dirname, '../../product/renderer/event-queue.js'), 'utf8');
  const window: Record<string, unknown> = {};
  vm.runInNewContext(source, { window });
  return (window.win7AgentEventQueue as any).create(maxPending);
}

describe('Renderer bounded task event queue', () => {
  it('deduplicates, rejects old sequence and reports gaps', () => {
    const queue = createQueue(4);
    expect(queue.push({ eventId: 'a', sequence: 1 }).accepted).toBe(true);
    expect(queue.push({ eventId: 'a', sequence: 1 })).toEqual({ accepted: false, reason: 'duplicate' });
    expect(queue.push({ eventId: 'old', sequence: 1 })).toEqual({ accepted: false, reason: 'out_of_order' });
    expect(queue.push({ eventId: 'c', sequence: 3 })).toMatchObject({ accepted: true, gap: true });
  });

  it('bounds pending events and retains the newest entries', () => {
    const queue = createQueue(2);
    queue.push({ eventId: 'a', sequence: 1 });
    queue.push({ eventId: 'b', sequence: 2 });
    expect(queue.push({ eventId: 'c', sequence: 3 })).toMatchObject({ accepted: true, overflowed: true });
    expect(queue.size).toBe(2);
    expect(queue.drain()).toEqual([
      { eventId: 'b', sequence: 2 },
      { eventId: 'c', sequence: 3 },
    ]);
  });
});
