import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

function loadProjector(): any {
  const source = fs.readFileSync(path.join(__dirname, '../../product/renderer/conversation-projector.js'), 'utf8');
  const context: any = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.win7AgentConversationProjector;
}

function delta(sequence: number, index: number, chunk: string, overrides: Record<string, unknown> = {}): any {
  const taskId = String(overrides.taskId || 'task-1');
  const requestId = String(overrides.requestId || 'request-1');
  return {
    taskId,
    eventId: String(overrides.eventId || `event-${sequence}`),
    eventKind: 'gateway.delta',
    sequence,
    data: {
      schemaVersion: 1,
      taskId,
      requestId,
      index,
      chunk,
      isFinal: overrides.isFinal === true,
      finishReason: overrides.finishReason || null,
    },
  };
}

function fact(sequence: number, eventKind: string, taskId = 'task-1'): any {
  return { taskId, eventId: `event-${sequence}`, eventKind, sequence, data: {} };
}

describe('A8-01 deterministic conversation projector', () => {
  it('A8E-01 merges Chinese character deltas without changing raw event count', () => {
    const projector = loadProjector().create();
    const events = [delta(1, 0, '你'), delta(2, 1, '好'), delta(3, 2, '。', { isFinal: true })];
    events.forEach((event) => expect(projector.push(event).accepted).toBe(true));

    const snapshot = projector.snapshot();
    expect(snapshot.blocks).toHaveLength(1);
    expect(snapshot.blocks[0]).toMatchObject({ text: '你好。', indexFrom: 0, indexTo: 2, closedBy: 'FINAL_FLAG' });
    expect(events).toHaveLength(3);
  });

  it('A8E-02 keeps English tokens ordered and closes on request switch', () => {
    const projector = loadProjector().create();
    projector.push(delta(1, 0, 'Hello'));
    projector.push(delta(2, 1, ' world'));
    projector.push(delta(3, 0, 'Next', { requestId: 'request-2' }));

    const blocks = projector.snapshot().blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ text: 'Hello world', closedBy: 'REQUEST_SWITCH' });
    expect(blocks[1]).toMatchObject({ text: 'Next', requestId: 'request-2' });
  });

  it('A8E-03 closes a text segment before projecting a non-delta fact', () => {
    const projector = loadProjector().create();
    projector.push(delta(1, 0, 'Inspecting'));
    const result = projector.push(fact(2, 'tool.started'));

    expect(result).toMatchObject({ accepted: true, kind: 'fact' });
    expect(projector.snapshot().blocks[0].closedBy).toBe('NON_DELTA_EVENT');
  });

  it('A8E-04 rejects gaps, out-of-order/conflicting duplicates and late terminal deltas', () => {
    const projector = loadProjector().create();
    expect(projector.push(delta(1, 0, 'A')).accepted).toBe(true);
    expect(projector.push(delta(2, 2, 'gap')).reason).toBe('index_gap');
    expect(projector.push(delta(3, 0, 'B', { eventId: 'conflict' })).accepted).toBe(true);
    const reorderedDuplicate = {
      sequence: 3,
      eventKind: 'gateway.delta',
      eventId: 'conflict',
      taskId: 'task-1',
      data: { isFinal: false, chunk: 'B', index: 0, requestId: 'request-1', taskId: 'task-1', schemaVersion: 1, finishReason: null },
    };
    expect(projector.push(reorderedDuplicate).reason).toBe('duplicate');
    expect(projector.push(delta(3, 0, 'different', { eventId: 'conflict' })).reason).toBe('conflict');
    projector.push(fact(4, 'task.completed'));
    expect(projector.push(delta(5, 1, 'late')).reason).toBe('late');
    expect(projector.snapshot().warnings.map((item: any) => item.code)).toEqual(expect.arrayContaining([
      'INDEX_GAP', 'EVENT_ID_CONFLICT', 'LATE_DELTA_AFTER_TERMINAL',
    ]));
  });

  it('A8E-05 creates continuation blocks at the segment limit and truncates at the message limit', () => {
    const projector = loadProjector().create({ segmentLimitBytes: 6, messageLimitBytes: 10 });
    projector.push(delta(1, 0, '你好abcde', { isFinal: true }));

    const snapshot = projector.snapshot();
    expect(snapshot.blocks.map((block: any) => block.text)).toEqual(['你好', 'abcd']);
    expect(snapshot.blocks[0].closedBy).toBe('SEGMENT_LIMIT');
    expect(snapshot.blocks[1]).toMatchObject({ closedBy: 'MESSAGE_LIMIT', truncated: true });
    expect(snapshot.warnings.map((item: any) => item.code)).toContain('MESSAGE_LIMIT');
  });

  it('A8E-06 rebuilds an identical projection after cache/reset loss', () => {
    const api = loadProjector();
    const events = [
      delta(1, 0, 'one'), delta(2, 1, ' two', { isFinal: true }),
      fact(3, 'tool.started'), fact(4, 'tool.completed'),
      delta(5, 0, 'done', { requestId: 'request-2', isFinal: true }),
    ];
    const first = api.create();
    const rebuilt = api.create();
    events.forEach((event) => { first.push(event); rebuilt.push(JSON.parse(JSON.stringify(event))); });
    expect(rebuilt.snapshot()).toEqual(first.snapshot());
  });
});
