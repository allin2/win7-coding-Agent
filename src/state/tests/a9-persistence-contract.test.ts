/**
 * A9-06 回归测试：A9 SQLite 持久化（真实 better-sqlite3 adapter，非内存 fake）。
 *
 * 覆盖审查缺陷：A8 白名单迁移与迁移前备份；未知 schema 拒绝覆盖；损坏库
 * 受限诊断；重启把活动任务标记中断且不自动重放；日志 90 天保留；同一
 * 工作区单写锁与多窗口行为；模式值损坏不默认 Full Access。
 */
/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import { A9PersistenceManager, A9_SCHEMA_VERSION } from '../src';
import type { SqliteDatabase } from '../src';

function openReal(databasePath: string, options?: { readonly?: boolean }): SqliteDatabase {
  return new Database(databasePath, options?.readonly ? { readonly: true } : {}) as unknown as SqliteDatabase;
}

function makeDataRoot(): { dataRoot: string; dbPath: string; cleanup: () => void } {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-state-'));
  return {
    dataRoot,
    dbPath: path.join(dataRoot, 'a9.db'),
    cleanup: () => fs.rmSync(dataRoot, { recursive: true, force: true }),
  };
}

describe('A9-06: A9 persistence with a real SQLite adapter', () => {
  let env: ReturnType<typeof makeDataRoot>;

  beforeEach(() => {
    env = makeDataRoot();
  });

  afterEach(() => {
    env.cleanup();
  });

  it('creates the full A9 schema with workspace/session/task/turn/run, mode, checkpoint, approval, managed process and event tables', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const db = outcome.manager.db;
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'a9_%'").all() as any[]).map((r) => r.name);
    for (const expected of [
      'a9_meta', 'a9_workspaces', 'a9_sessions', 'a9_tasks', 'a9_turns', 'a9_runs',
      'a9_checkpoints', 'a9_approvals', 'a9_managed_processes', 'a9_events', 'a9_workspace_locks',
    ]) {
      expect(tables).toContain(expected);
    }
    expect((db.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get() as any).schema_version).toBe(A9_SCHEMA_VERSION);
  });

  it('fails closed on unknown newer schema instead of overwriting', () => {
    {
      const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
      expect(outcome.status).toBe('ready');
    }
    // 直接篡改版本为未来版本，模拟“由更新应用创建的库”。
    const raw = new Database(env.dbPath);
    raw.prepare('UPDATE a9_meta SET schema_version = ? WHERE id = 1').run(A9_SCHEMA_VERSION + 1);
    raw.close();

    const second = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(second.status).toBe('schema_refused');
    if (second.status === 'schema_refused') {
      expect(second.reason).toContain('拒绝覆盖');
      expect(second.foundVersion).toBe(A9_SCHEMA_VERSION + 1);
    }
    // 原库未被降级改写。
    const check = new Database(env.dbPath, { readonly: true });
    expect((check.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get() as any).schema_version).toBe(A9_SCHEMA_VERSION + 1);
    check.close();
  });

  it('enters restricted diagnostics for corrupted databases without overwriting', () => {
    fs.writeFileSync(env.dbPath, 'this is definitely not a sqlite database', 'utf8');
    const before = fs.readFileSync(env.dbPath, 'utf8');
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('diagnostics');
    if (outcome.status === 'diagnostics') {
      expect(outcome.hint).toContain('受限诊断');
    }
    // 原始损坏文件保持未修改。
    expect(fs.readFileSync(env.dbPath, 'utf8')).toBe(before);
  });

  it('migrates A8 workspaces via whitelist with a pre-migration backup', () => {
    // 构造一个带 A8 表的旧库。
    const a8db = new Database(env.dbPath);
    a8db.exec(`
      CREATE TABLE a8_workspaces (workspace_path TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE a8_sessions (session_id TEXT PRIMARY KEY, workspace_path TEXT NOT NULL);
      INSERT INTO a8_workspaces VALUES ('C:/proj/legacy', '2026-01-01T00:00:00.000Z');
    `);
    a8db.close();

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    expect(outcome.importedA8Workspaces).toBe(1);
    expect(outcome.backupPath).toBeDefined();
    expect(fs.existsSync(outcome.backupPath!)).toBe(true);
    // 白名单导入：模式为 review（保守），不默认 Full Access。
    expect(outcome.manager.getWorkspaceMode('C:/proj/legacy')).toBe('review');
  });

  it('marks active tasks/turns/runs interrupted on restart without replay', () => {
    const first = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;
    const manager = first.manager;
    manager.saveSession('s1', '/ws');
    manager.upsertTask('t1', 's1', 'active');
    manager.upsertTurn('turn-1', 't1', 's1', 'active');
    manager.upsertRun('r1', 'turn-1', 's1', 'active');
    manager.recordModelEvent('s1', 'turn-1', 'request', { model: 'm1' });
    manager.recordToolEvent('s1', 'turn-1', 'shell', { command: 'npm test' });

    // 模拟重启。
    const second = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(second.status).toBe('ready');
    if (second.status !== 'ready') return;
    const interruptions = second.manager.listInterruptions();
    expect(interruptions.map((i) => i.id).sort()).toEqual(['r1', 't1', 'turn-1']);
    // 事件事实保留（供审计/上下文重建），没有被删除也没有被“重放”出新的动作。
    expect(second.manager.countEvents()).toBe(2);
  });

  it('enforces the 90-day retention policy on events', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const manager = outcome.manager;
    manager.saveSession('s1', '/ws');
    manager.recordModelEvent('s1', null, 'request', {});
    // 手工注入一条 100 天前的事件。
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    manager.db.prepare(`
      INSERT INTO a9_events (session_id, turn_id, kind, event_type, payload_json, created_at)
      VALUES ('s1', NULL, 'model', 'stale', '{}', ?)
    `).run(old);

    expect(manager.countEvents()).toBe(2);
    const purge = manager.enforceRetention();
    expect(purge.purgedEvents).toBe(1);
    expect(manager.countEvents()).toBe(1);
  });

  it('enforces a single writer lock per workspace across instances (multi-window behavior)', () => {
    const first = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;

    const lock1 = first.manager.acquireWorkspaceLock('/ws', 'window-1');
    expect(lock1.acquired).toBe(true);

    const lock2 = first.manager.acquireWorkspaceLock('/ws', 'window-2');
    expect(lock2.acquired).toBe(false);
    expect(lock2.holder).toBe('window-1');

    // 同一持有者重入只刷新心跳。
    const reentrant = first.manager.acquireWorkspaceLock('/ws', 'window-1');
    expect(reentrant.acquired).toBe(true);

    // 释放后其他窗口可以获取。
    first.manager.releaseWorkspaceLock('/ws', 'window-1');
    const lock3 = first.manager.acquireWorkspaceLock('/ws', 'window-2');
    expect(lock3.acquired).toBe(true);
  });

  it('never defaults a corrupted permission mode to full access', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const manager = outcome.manager;
    manager.setWorkspaceMode('/ws', 'read_only');
    expect(manager.getWorkspaceMode('/ws')).toBe('read_only');

    // CHECK 约束阻止非法模式值写入数据库（DB 层保护）。
    expect(() => manager.db.prepare('UPDATE a9_workspaces SET permission_mode = ? WHERE workspace_path = ?').run('corrupted!!', '/ws')).toThrow();
    expect(manager.getWorkspaceMode('/ws')).toBe('read_only');
    // 未知工作区没有默认模式，必须进入显式选择流程。
    expect(manager.getWorkspaceMode('/unknown')).toBeUndefined();
  });

  it('round-trips checkpoints, approvals and managed process facts', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const manager = outcome.manager;
    manager.saveSession('s1', '/ws');

    manager.saveCheckpoint({ turnId: 'turn-9', sessionId: 's1', payload: { changes: { 'a.ts': { action: 'modify' } } } });
    const checkpoint = manager.getCheckpoint('turn-9');
    expect(checkpoint?.payload).toEqual({ changes: { 'a.ts': { action: 'modify' } } });
    expect(manager.listCheckpoints('s1').map((c) => c.turnId)).toContain('turn-9');

    manager.recordApproval({
      approvalId: 'ap-1',
      sessionId: 's1',
      turnId: 'turn-9',
      toolName: 'shell',
      binding: { remote: 'origin', branch: 'main', force: false, commandSha256: 'abc123' },
      decision: 'approved',
    });
    const approvalRow = manager.db.prepare('SELECT * FROM a9_approvals WHERE approval_id = ?').get('ap-1') as any;
    expect(approvalRow.decision).toBe('approved');
    expect(JSON.parse(approvalRow.binding_json)).toEqual({ remote: 'origin', branch: 'main', force: false, commandSha256: 'abc123' });

    manager.recordManagedProcess({
      handleId: 'bg-1',
      workspacePath: '/ws',
      pid: 4321,
      command: 'npm run dev',
      cwd: '/ws',
      startedAt: new Date().toISOString(),
      lastProbeStatus: 'running',
      pidReusePossible: true,
    });
    const facts = manager.listManagedProcesses('/ws');
    expect(facts).toHaveLength(1);
    expect(facts[0].pid).toBe(4321);
    expect(facts[0].pidReusePossible).toBe(true);
  });
});
