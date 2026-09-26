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

  it('C1 orders equal timestamps by turnId bytes across small pages and excludes another session', () => {
    const createdAt = '2026-09-26T00:00:00.000Z';
    // Deliberately insert in the reverse of SQLite BINARY/UTF-8 byte order.
    const orderedIds = ['T0', 'T2', 'T4', 't1', 't3', 't5', 't7'];
    for (const turnId of orderedIds.slice().reverse()) insert('one', turnId, createdAt);
    insert('other', 'foreign', createdAt);
    const expected = orderedIds.map((turnId) => ({ turnId, createdAt }));
    expect(manager.listCheckpoints('one')).toEqual(expected);
    expect(manager.listRecentCheckpoints('one', 2)).toEqual({ checkpoints: expected.slice(-2), total: 7 });

    for (const limit of [1, 3]) {
      const collected: typeof expected = [];
      let before: { createdAt: string; turnId: string } | undefined;
      let reachedEnd = false;
      for (let pageNumber = 0; pageNumber <= orderedIds.length; pageNumber += 1) {
        const page = manager.listCheckpointPage('one', { before, limit });
        expect(page.total).toBe(7);
        collected.unshift(...page.checkpoints);
        if (!page.hasMore) {
          expect(page.nextBefore).toBeNull();
          reachedEnd = true;
          break;
        }
        expect(page.nextBefore).toEqual(page.checkpoints[0]);
        before = page.nextBefore!;
      }
      expect(reachedEnd).toBe(true);
      expect(collected).toEqual(expected);
      expect(new Set(collected.map((row) => row.turnId)).size).toBe(7);
    }
  });
});
