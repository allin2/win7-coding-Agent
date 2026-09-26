/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import { A9PersistenceManager } from '../src';

describe('A9-21 M3 checkpoint pagination', () => {
  let root: string;
  let manager: A9PersistenceManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-m3-state-'));
    const opened = A9PersistenceManager.open({
      databasePath: path.join(root, 'a9.db'), dataRoot: root,
      openDatabase: (file: string) => new Database(file),
    });
    if (opened.status !== 'ready') throw new Error(`SQLite fixture: ${opened.status}`);
    manager = opened.manager;
  });
  afterEach(() => {
    manager.db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function insert(sessionId: string, turnId: string, createdAt: string) {
    manager.db.prepare('INSERT INTO a9_checkpoints (turn_id, session_id, created_at, payload_json) VALUES (?, ?, ?, ?)')
      .run(turnId, sessionId, createdAt, '{}');
  }

  it('returns the latest 50 and pages all 180 in stable old-to-new order without duplicates', () => {
    for (let i = 0; i < 180; i += 1) insert('one', `t${String(i).padStart(3, '0')}`, new Date(1700000000000 + i).toISOString());
    const all = manager.listCheckpoints('one');
    const recent = manager.listRecentCheckpoints('one', 50);
    expect(recent.total).toBe(180);
    expect(recent.checkpoints).toEqual(all.slice(-50));
    const pages: Array<{ turnId: string; createdAt: string }> = [];
    let before: { createdAt: string; turnId: string } | undefined;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const page = manager.listCheckpointPage('one', { before, limit: 17 });
      expect(page.total).toBe(180);
      pages.unshift(...page.checkpoints);
      if (!page.hasMore) {
        expect(page.nextBefore).toBeNull();
        break;
      }
      expect(page.nextBefore).toEqual({ createdAt: page.checkpoints[0].createdAt, turnId: page.checkpoints[0].turnId });
      before = page.nextBefore!;
    }
    expect(pages).toEqual(all);
    expect(new Set(pages.map((row) => row.turnId)).size).toBe(180);
  });

  it('uses turnId to split equal timestamps and excludes another session from rows and total', () => {
    for (let i = 0; i < 7; i += 1) insert('one', `t${i}`, '2026-09-26T00:00:00.000Z');
    insert('other', 'foreign', '2026-09-26T00:00:00.000Z');
    const expected = manager.listCheckpoints('one');
    expect(expected.map((row) => row.turnId)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6']);
    const first = manager.listCheckpointPage('one', { limit: 3 });
    const second = manager.listCheckpointPage('one', { before: first.nextBefore!, limit: 3 });
    const third = manager.listCheckpointPage('one', { before: second.nextBefore!, limit: 3 });
    expect([...third.checkpoints, ...second.checkpoints, ...first.checkpoints]).toEqual(expected);
    expect([first.total, second.total, third.total]).toEqual([7, 7, 7]);
    expect(third.hasMore).toBe(false);
    expect(manager.listRecentCheckpoints('one', 2).checkpoints).toEqual(expected.slice(-2));
    expect(manager.listCheckpoints('one')).toEqual(expected);
  });
});
