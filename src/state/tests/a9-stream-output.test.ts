/// <reference path="./better-sqlite3.d.ts" />
import Database from 'better-sqlite3';
import { A9PersistenceManager } from '../src/a9-persistence';

function setup() {
  const opened = A9PersistenceManager.open({ databasePath: ':memory:', dataRoot: '/memory', openDatabase: () => new Database(':memory:') as any });
  if (opened.status !== 'ready') throw new Error(opened.status);
  const manager = opened.manager;
  manager.createConversation('conversation', '/workspace');
  const data = { schemaVersion: 1, conversationId: 'conversation', taskId: 'task', turnId: 'turn', toolCallId: 'call', requestId: 'req', stream: 'stdout', outputSeq: 1, sourceSeqThrough: 1, text: 'safe tick\n', rawBytesRead: 10, truncated: false };
  return { manager, data };
}
it('SQLite preserves identity/sequence across paging and rejects duplicate, gap and cross-request output', () => {
  const { manager, data } = setup();
  try {
    const first = manager.recordToolEvent('conversation', 'turn', 'tool_output', { data });
    manager.recordToolEvent('conversation', 'turn', 'tool_output', { data: { ...data, stream: 'stderr', outputSeq: 2, sourceSeqThrough: 2, text: 'other' } });
    expect(() => manager.recordToolEvent('conversation', 'turn', 'tool_output', { data })).toThrow('A9_OUTPUT_EVENT_SEQUENCE');
    expect(() => manager.recordToolEvent('conversation', 'turn', 'tool_output', { data: { ...data, outputSeq: 4 } })).toThrow('A9_OUTPUT_EVENT_SEQUENCE');
    expect(() => manager.recordToolEvent('conversation', 'turn', 'tool_output', { data: { ...data, outputSeq: 3, requestId: 'other' } })).toThrow('A9_OUTPUT_EVENT_SEQUENCE');
    const page = manager.listSessionEvents('conversation', { limit: 1 });
    const older = manager.listSessionEvents('conversation', { beforeEventId: page[0].eventId, limit: 1 });
    expect(older[0].eventId).toBe(first.eventId); expect((older[0].payload as any).data).toEqual(data);
    expect(manager.listSessionEvents('conversation')).toHaveLength(2);
  } finally { manager.db.close(); }
});
it.each([{ conversationId: 'wrong' }, { turnId: 'wrong' }, { outputSeq: 0 }, { rawBytesRead: -1 }, { text: 'x'.repeat(65537) }, { stream: 'other' }])('rejects invalid persisted output case %#', (patch) => {
  const { manager, data } = setup();
  try { expect(() => manager.recordToolEvent('conversation', 'turn', 'tool_output', { data: { ...data, ...patch } })).toThrow('A9_OUTPUT_EVENT_INVALID'); expect(manager.countEvents()).toBe(0); }
  finally { manager.db.close(); }
});


it('restores stable output facts from a reopened on-disk SQLite database without replay', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-stream-recovery-'));
  const file = path.join(root, 'events.db');
  const open = () => A9PersistenceManager.open({ databasePath: file, dataRoot: root, openDatabase: (p) => new Database(p) as any });
  const first = open(); if (first.status !== 'ready') throw new Error(first.status);
  first.manager.createConversation('c', '/workspace');
  const data = { schemaVersion: 1, conversationId: 'c', taskId: 'task', turnId: 'turn', toolCallId: 'call', requestId: 'req', stream: 'stdout', outputSeq: 1, sourceSeqThrough: 1, text: 'persisted', rawBytesRead: 9, truncated: false };
  const id = first.manager.recordToolEvent('c', 'turn', 'tool_output', { data }).eventId;
  first.manager.db.close();
  const second = open(); if (second.status !== 'ready') throw new Error(second.status);
  try {
    const events = second.manager.listSessionEvents('c'); expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe(id); expect((events[0].payload as any).data).toEqual(data);
    expect(() => second.manager.recordToolEvent('c', 'turn', 'tool_output', { data })).toThrow('A9_OUTPUT_EVENT_SEQUENCE');
  } finally { second.manager.db.close(); }
});
