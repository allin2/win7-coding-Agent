/**
 * A9-06 回归测试：A9 SQLite 持久化（真实 better-sqlite3 adapter，非内存 fake）。
 *
 * 覆盖审查缺陷：A8 白名单迁移与迁移前备份；未知 schema 拒绝覆盖；损坏库
 * 受限诊断；重启把活动任务标记中断且不自动重放；日志 90 天保留；同一
 * 工作区单写锁与多窗口行为；模式值损坏不默认 Full Access。
 */
/// <reference path="./better-sqlite3.d.ts" />
import * as crypto from 'crypto';
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

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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
      'a9_workspace_conversation_state', 'a9_checkpoints', 'a9_approvals',
      'a9_managed_processes', 'a9_events', 'a9_workspace_locks',
    ]) {
      expect(tables).toContain(expected);
    }
    expect((db.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get() as any).schema_version).toBe(A9_SCHEMA_VERSION);
  });

  it('refuses an unknown newer schema without changing bytes, journal mode or sidecar files', () => {
    // 用 DELETE journal 构造未来版本库，以证明拒绝路径没有先切换到 WAL。
    const raw = new Database(env.dbPath);
    raw.pragma('journal_mode = DELETE');
    raw.exec(`
      CREATE TABLE a9_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_meta VALUES (1, ${A9_SCHEMA_VERSION + 1}, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z');
      CREATE TABLE future_only (evidence TEXT NOT NULL);
      INSERT INTO future_only VALUES ('must remain byte-identical');
    `);
    raw.close();
    const beforeHash = sha256(env.dbPath);
    const beforeFiles = fs.readdirSync(env.dataRoot).sort();

    const second = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(second.status).toBe('schema_refused');
    if (second.status === 'schema_refused') {
      expect(second.reason).toContain('拒绝覆盖');
      expect(second.foundVersion).toBe(A9_SCHEMA_VERSION + 1);
    }
    expect(sha256(env.dbPath)).toBe(beforeHash);
    expect(fs.readdirSync(env.dataRoot).sort()).toEqual(beforeFiles);
    expect(fs.existsSync(`${env.dbPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${env.dbPath}-shm`)).toBe(false);

    // 原库未被降级改写，也没有改变 journal mode。
    const check = new Database(env.dbPath, { readonly: true });
    expect((check.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get() as any).schema_version).toBe(A9_SCHEMA_VERSION + 1);
    expect(String(check.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('delete');
    check.close();
  });

  it.each(['empty', 'wrong-row'])('fails closed on an %s a9_meta table without modifying the database', (shape) => {
    const raw = new Database(env.dbPath);
    raw.pragma('journal_mode = DELETE');
    raw.exec('CREATE TABLE a9_meta (id INTEGER, schema_version INTEGER)');
    if (shape === 'wrong-row') raw.exec(`INSERT INTO a9_meta VALUES (2, ${A9_SCHEMA_VERSION})`);
    raw.close();
    const beforeHash = sha256(env.dbPath);
    const beforeFiles = fs.readdirSync(env.dataRoot).sort();

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('diagnostics');
    if (outcome.status === 'diagnostics') expect(outcome.error).toContain('A9_SCHEMA_INVALID');
    expect(sha256(env.dbPath)).toBe(beforeHash);
    expect(fs.readdirSync(env.dataRoot).sort()).toEqual(beforeFiles);
    expect(fs.existsSync(`${env.dbPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${env.dbPath}-shm`)).toBe(false);
  });

  it('fails closed when A9 business tables exist without schema metadata', () => {
    const raw = new Database(env.dbPath);
    raw.exec(`
      CREATE TABLE a9_turns (
        turn_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','completed','completed_with_warnings','blocked','cancelled','interrupted')),
        outcome_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_turns VALUES ('legacy-turn', 'task', 'session', 'blocked', '{}',
        '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
    `);
    raw.close();
    const beforeHash = sha256(env.dbPath);

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });

    expect(outcome.status).toBe('diagnostics');
    expect(sha256(env.dbPath)).toBe(beforeHash);
    const check = new Database(env.dbPath, { readonly: true });
    expect(check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='a9_meta'").get()).toBeUndefined();
    check.close();
  });

  it.each([1, 2])('backs up and atomically migrates a v%s database so failed turns are truthful and existing rows survive', (legacyVersion) => {
    const v2 = new Database(env.dbPath);
    v2.exec(`
      CREATE TABLE a9_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_meta VALUES (1, ${legacyVersion}, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
      CREATE TABLE a9_turns (
        turn_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','completed','completed_with_warnings','blocked','cancelled','interrupted')),
        outcome_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_a9_turns_session_test ON a9_turns (session_id, updated_at);
      INSERT INTO a9_turns VALUES ('turn-existing', 'task-existing', 'session-existing', 'blocked', '{"reason":"kept"}', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
    `);
    v2.close();

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    expect(outcome.backupPath).toBeDefined();
    expect(outcome.backupSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(outcome.backupPath!)).toBe(outcome.backupSha256);
    expect(fs.existsSync(outcome.backupPath!)).toBe(true);
    expect((outcome.manager.db.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get() as any).schema_version).toBe(4);
    expect(outcome.manager.db.prepare("SELECT status, outcome_json FROM a9_turns WHERE turn_id = 'turn-existing'").get()).toEqual({
      status: 'blocked', outcome_json: '{"reason":"kept"}',
    });
    expect(outcome.manager.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_a9_turns_session_test'").get()).toEqual({
      name: 'idx_a9_turns_session_test',
    });

    outcome.manager.upsertTurn('turn-existing', 'task-existing', 'session-existing', 'failed', { reason: 'provider' });
    expect((outcome.manager.db.prepare("SELECT status FROM a9_turns WHERE turn_id = 'turn-existing'").get() as any).status).toBe('failed');
    outcome.manager.db.close();

    const reopened = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(reopened.status).toBe('ready');
    if (reopened.status === 'ready') {
      expect((reopened.manager.db.prepare("SELECT status FROM a9_turns WHERE turn_id = 'turn-existing'").get() as any).status).toBe('failed');
    }
  });

  it('creates a transaction-consistent migration backup containing committed rows still present only in WAL', () => {
    const writer = new Database(env.dbPath);
    writer.pragma('journal_mode = WAL');
    writer.pragma('wal_autocheckpoint = 0');
    writer.exec(`
      CREATE TABLE a9_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_meta VALUES (1, 2, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z');
      CREATE TABLE a9_turns (
        turn_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','completed','completed_with_warnings','blocked','cancelled','interrupted')),
        outcome_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_turns VALUES ('turn-old', 'task', 'session', 'blocked', '{}', '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z');
    `);
    writer.pragma('wal_checkpoint(TRUNCATE)');

    // 活动读事务阻止 latest 页 checkpoint 回主库，但 latest 已经提交。
    const reader = new Database(env.dbPath, { readonly: true });
    reader.exec('BEGIN');
    expect(reader.prepare('SELECT turn_id FROM a9_turns').all()).toEqual([{ turn_id: 'turn-old' }]);
    writer.prepare(`
      INSERT INTO a9_turns VALUES ('turn-latest', 'task', 'session', 'blocked', '{}',
        '2026-08-23T00:01:00.000Z', '2026-08-23T00:01:00.000Z')
    `).run();
    expect(fs.statSync(`${env.dbPath}-wal`).size).toBeGreaterThan(0);

    try {
      const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
      expect(outcome.status).toBe('ready');
      if (outcome.status !== 'ready') return;
      expect(outcome.backupPath).toBeDefined();

      const backup = new Database(outcome.backupPath!, { readonly: true });
      expect((backup.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get() as any).schema_version).toBe(2);
      expect((backup.prepare('SELECT turn_id FROM a9_turns ORDER BY turn_id').all() as any[]).map((row) => row.turn_id)).toEqual([
        'turn-latest', 'turn-old',
      ]);
      backup.close();

      expect((outcome.manager.db.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get() as any).schema_version).toBe(4);
      expect((outcome.manager.db.prepare('SELECT turn_id FROM a9_turns ORDER BY turn_id').all() as any[]).map((row) => row.turn_id)).toEqual([
        'turn-latest', 'turn-old',
      ]);
      outcome.manager.db.close();
    } finally {
      reader.exec('ROLLBACK');
      reader.close();
      writer.close();
    }
  });

  it('rolls back a malformed v2 migration and enters diagnostics without rewriting the schema marker', () => {
    const malformed = new Database(env.dbPath);
    malformed.exec(`
      CREATE TABLE a9_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_meta VALUES (1, 2, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
      CREATE TABLE a9_turns (turn_id TEXT PRIMARY KEY, broken TEXT NOT NULL);
      INSERT INTO a9_turns VALUES ('turn-broken', 'evidence');
    `);
    malformed.close();

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('diagnostics');
    if (outcome.status === 'diagnostics') expect(outcome.hint).toContain('已回滚');
    const check = new Database(env.dbPath, { readonly: true });
    expect((check.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get() as any).schema_version).toBe(2);
    expect(check.prepare("SELECT broken FROM a9_turns WHERE turn_id = 'turn-broken'").get()).toEqual({ broken: 'evidence' });
    check.close();
  });

  it('rolls back the entire v2-to-v4 chain when the v4 step fails after v3 succeeded', () => {
    const legacy = new Database(env.dbPath);
    legacy.exec(`
      CREATE TABLE a9_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_meta VALUES (1, 2, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
      CREATE TABLE a9_turns (
        turn_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','completed','completed_with_warnings','blocked','cancelled','interrupted')),
        outcome_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_turns VALUES ('turn-preserved', 'task', 'session', 'blocked', '{}',
        '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
      CREATE TABLE a9_sessions (
        broken_session_id TEXT PRIMARY KEY, workspace_path TEXT NOT NULL, title TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `);
    legacy.close();

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('diagnostics');

    const check = new Database(env.dbPath, { readonly: true });
    expect(check.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get()).toEqual({ schema_version: 2 });
    const turnSql = (check.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='a9_turns'").get() as any).sql;
    expect(turnSql).not.toContain("'failed'");
    expect(check.prepare("SELECT status FROM a9_turns WHERE turn_id='turn-preserved'").get()).toEqual({ status: 'blocked' });
    expect(check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='a9_turns_pre_v3'").get()).toBeUndefined();
    check.close();
  });

  it('also rolls back migration when final schema creation fails after the version steps', () => {
    const legacy = new Database(env.dbPath);
    legacy.exec(`
      CREATE TABLE a9_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_meta VALUES (1, 2, '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
      CREATE TABLE a9_turns (
        turn_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','completed','completed_with_warnings','blocked','cancelled','interrupted')),
        outcome_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_turns VALUES ('turn-preserved', 'task', 'session', 'blocked', '{}',
        '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
      CREATE TABLE a9_events (broken TEXT NOT NULL);
    `);
    legacy.close();

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('diagnostics');

    const check = new Database(env.dbPath, { readonly: true });
    expect(check.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get()).toEqual({ schema_version: 2 });
    const turnSql = (check.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='a9_turns'").get() as any).sql;
    expect(turnSql).not.toContain("'failed'");
    expect(check.prepare("SELECT status FROM a9_turns WHERE turn_id='turn-preserved'").get()).toEqual({ status: 'blocked' });
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
      CREATE TABLE a8_workspaces (
        workspace_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL CHECK(schema_version = 1),
        canonical_path TEXT NOT NULL,
        comparison_key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_opened_at TEXT,
        archived_at TEXT
      );
      CREATE TABLE a8_sessions (session_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL);
      INSERT INTO a8_workspaces VALUES (
        'workspace-legacy', 1, 'C:/proj/legacy', 'c:/proj/legacy', 'legacy',
        '2026-01-01T00:00:00.000Z', NULL, NULL
      );
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

  it('imports the real physical A8 database read-only without copying sessions or credentials', () => {
    const a8Path = path.join(env.dataRoot, 'state', 'agent-events-v2.db');
    fs.mkdirSync(path.dirname(a8Path), { recursive: true });
    const a8 = new Database(a8Path);
    a8.exec(`
      CREATE TABLE a8_workspaces (
        workspace_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL CHECK(schema_version = 1),
        canonical_path TEXT NOT NULL,
        comparison_key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_opened_at TEXT,
        archived_at TEXT
      );
      CREATE TABLE a8_sessions (session_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider_secret TEXT);
      INSERT INTO a8_workspaces VALUES (
        'workspace-physical', 1, 'C:/physical/a8', 'c:/physical/a8', 'physical',
        '2026-01-01T00:00:00.000Z', NULL, NULL
      );
      INSERT INTO a8_sessions VALUES ('legacy-secret-session', 'workspace-physical', 'DO_NOT_IMPORT');
    `);
    a8.close();
    const before = sha256(a8Path);
    const opens: Array<{ databasePath: string; readonly: boolean }> = [];
    const trackedOpen = (databasePath: string, options?: { readonly?: boolean }): SqliteDatabase => {
      opens.push({ databasePath, readonly: options?.readonly === true });
      return openReal(databasePath, options);
    };

    const outcome = A9PersistenceManager.open({
      databasePath: env.dbPath,
      a8DatabasePath: a8Path,
      openDatabase: trackedOpen,
      dataRoot: env.dataRoot,
    });

    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    expect(opens).toContainEqual({ databasePath: a8Path, readonly: true });
    expect(sha256(a8Path)).toBe(before);
    expect(outcome.importedA8Workspaces).toBe(1);
    expect(outcome.manager.getWorkspaceMode('C:/physical/a8')).toBe('review');
    expect(outcome.manager.db.prepare("SELECT session_id FROM a9_sessions WHERE session_id='legacy-secret-session'").get()).toBeUndefined();
  });

  it('fails closed when an A8-looking physical database does not match the formal workspace schema', () => {
    const a8Path = path.join(env.dataRoot, 'state', 'agent-events-v2.db');
    fs.mkdirSync(path.dirname(a8Path), { recursive: true });
    const malformed = new Database(a8Path);
    malformed.exec('CREATE TABLE a8_workspaces (workspace_path TEXT PRIMARY KEY)');
    malformed.close();

    const outcome = A9PersistenceManager.open({
      databasePath: env.dbPath,
      a8DatabasePath: a8Path,
      openDatabase: openReal,
      dataRoot: env.dataRoot,
    });

    expect(outcome.status).toBe('diagnostics');
    if (outcome.status === 'diagnostics') expect(outcome.error).toMatch(/A8 workspace schema mismatch/);
    expect(fs.existsSync(env.dbPath)).toBe(false);
  });

  it('rejects an A8 table that has the right names but loses PK, CHECK or UNIQUE identity constraints', () => {
    const a8Path = path.join(env.dataRoot, 'state', 'agent-events-v2.db');
    fs.mkdirSync(path.dirname(a8Path), { recursive: true });
    const malformed = new Database(a8Path);
    malformed.exec(`
      CREATE TABLE a8_workspaces (
        workspace_id TEXT,
        schema_version INTEGER NOT NULL,
        canonical_path TEXT NOT NULL,
        comparison_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_opened_at TEXT,
        archived_at TEXT
      );
      INSERT INTO a8_workspaces VALUES
        ('one', 1, 'C:/Foo', 'c:/foo', 'one', '2026-01-01T00:00:00.000Z', NULL, NULL),
        ('two', 1, 'c:/foo', 'c:/foo', 'two', '2026-01-01T00:00:00.000Z', NULL, NULL);
    `);
    malformed.close();

    const outcome = A9PersistenceManager.open({
      databasePath: env.dbPath,
      a8DatabasePath: a8Path,
      openDatabase: openReal,
      dataRoot: env.dataRoot,
    });

    expect(outcome.status).toBe('diagnostics');
    if (outcome.status === 'diagnostics') expect(outcome.error).toMatch(/A8 workspace schema mismatch/);
    expect(fs.existsSync(env.dbPath)).toBe(false);
  });

  it('fails closed on a partial physical v4 schema before any write', () => {
    const created = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(created.status).toBe('ready');
    if (created.status !== 'ready') return;
    created.manager.db.close();
    const raw = new Database(env.dbPath);
    raw.pragma('journal_mode = DELETE');
    raw.exec(`
      DROP TABLE a9_sessions;
      CREATE TABLE a9_sessions (workspace_path TEXT, state TEXT, last_activated_at TEXT);
    `);
    raw.close();
    const beforeHash = sha256(env.dbPath);

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });

    expect(outcome.status).toBe('diagnostics');
    if (outcome.status === 'diagnostics') expect(outcome.error).toMatch(/a9_sessions.*missing columns/);
    expect(sha256(env.dbPath)).toBe(beforeHash);
  });

  it('fails closed when a physical v4 approval table has columns but loses its identity and decision constraints', () => {
    const created = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(created.status).toBe('ready');
    if (created.status !== 'ready') return;
    created.manager.db.close();
    const raw = new Database(env.dbPath);
    raw.pragma('journal_mode = DELETE');
    raw.exec(`
      DROP TABLE a9_approvals;
      CREATE TABLE a9_approvals (
        approval_id TEXT,
        session_id TEXT NOT NULL,
        turn_id TEXT,
        tool_name TEXT NOT NULL,
        binding_json TEXT NOT NULL,
        decision TEXT NOT NULL,
        decided_at TEXT,
        created_at TEXT NOT NULL
      );
    `);
    raw.close();
    const beforeHash = sha256(env.dbPath);

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });

    expect(outcome.status).toBe('diagnostics');
    if (outcome.status === 'diagnostics') expect(outcome.error).toMatch(/a9_approvals.*primary key/);
    expect(sha256(env.dbPath)).toBe(beforeHash);
  });

  it('fails closed when an explicit A8 database path points to the wrong database', () => {
    const a8Path = path.join(env.dataRoot, 'not-a8.db');
    const wrong = new Database(a8Path);
    wrong.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)');
    wrong.close();

    const outcome = A9PersistenceManager.open({
      databasePath: env.dbPath,
      a8DatabasePath: a8Path,
      openDatabase: openReal,
      dataRoot: env.dataRoot,
    });

    expect(outcome.status).toBe('diagnostics');
    expect(fs.existsSync(env.dbPath)).toBe(false);
  });

  it('fails closed when an explicit A8 database path does not exist', () => {
    const outcome = A9PersistenceManager.open({
      databasePath: env.dbPath,
      a8DatabasePath: path.join(env.dataRoot, 'missing-a8.db'),
      openDatabase: openReal,
      dataRoot: env.dataRoot,
    });

    expect(outcome.status).toBe('diagnostics');
    if (outcome.status === 'diagnostics') expect(outcome.error).toMatch(/does not exist/);
    expect(fs.existsSync(env.dbPath)).toBe(false);
  });

  it.each([
    ['unsupported schema version', 99, 'C:/valid/path', 'c:/valid/path'],
    ['wrong comparison key', 1, 'C:/valid/path', 'wrong-key'],
    ['relative canonical path', 1, 'relative/path', 'relative/path'],
  ])('rejects an A8 workspace row with %s and rolls back embedded A9 initialization', (_label, schemaVersion, canonicalPath, comparisonKey) => {
    const a8 = new Database(env.dbPath);
    a8.pragma('journal_mode = DELETE');
    a8.exec(`
      CREATE TABLE a8_workspaces (
        workspace_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        canonical_path TEXT NOT NULL,
        comparison_key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_opened_at TEXT,
        archived_at TEXT
      );
    `);
    a8.prepare(`INSERT INTO a8_workspaces VALUES ('bad-row', ?, ?, ?, 'bad', '2026-01-01T00:00:00.000Z', NULL, NULL)`)
      .run(schemaVersion, canonicalPath, comparisonKey);
    a8.close();
    const beforeHash = sha256(env.dbPath);

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });

    expect(outcome.status).toBe('diagnostics');
    expect(sha256(env.dbPath)).toBe(beforeHash);
    const check = new Database(env.dbPath, { readonly: true });
    expect(check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='a9_meta'").get()).toBeUndefined();
    check.close();
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

  it('projects persisted conversation facts without replaying requests or tools', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const manager = outcome.manager;
    manager.saveSession('s1', '/ws');
    manager.upsertTask('task-conversation', 's1', 'completed');
    manager.upsertTurn('turn-conversation-full-id', 'task-conversation', 's1', 'completed');
    manager.recordModelEvent('s1', null, 'conversation.request', {
      schemaVersion: 1,
      taskId: 'task-conversation',
      requestPrompt: '解释这个工作区',
    });
    manager.saveCheckpoint({
      turnId: 'turn-conversation-full-id',
      sessionId: 's1',
      payload: {
        schemaVersion: 1,
        requestPrompt: '解释这个工作区',
        outcome: 'completed',
        verification: 'verified',
        finalMessage: '已完成解释。',
      },
    });

    expect(manager.listConversationFacts('s1')).toEqual([expect.objectContaining({
      taskId: 'task-conversation',
      turnId: 'turn-conversation-full-id',
      requestPrompt: '解释这个工作区',
      outcome: 'completed',
      verification: 'verified',
      finalMessage: '已完成解释。',
    })]);
    expect(manager.countEvents()).toBe(1);
  });

  it('reconciles only same-workspace interrupted Turns from durable checkpoint manifests', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const manager = outcome.manager;
    manager.saveSession('s-local', '/ws');
    manager.saveSession('s-foreign', '/other');
    manager.upsertTask('task-local', 's-local', 'active');
    manager.upsertTurn('turn-local', 'task-local', 's-local', 'active');
    manager.upsertTask('task-foreign', 's-foreign', 'active');
    manager.upsertTurn('turn-foreign', 'task-foreign', 's-foreign', 'active');
    manager.markInterruptionsOnRestart();

    expect(manager.reconcileInterruptedWorkspaceCheckpoints('/ws', [
      'turn-local', 'turn-foreign', 'turn-unknown', 'turn-local',
    ])).toEqual(['turn-local']);
    expect(manager.getCheckpoint('turn-local')?.payload).toEqual(expect.objectContaining({
      outcome: 'interrupted', recoveredFromWorkspaceManifest: true,
    }));
    expect(manager.getCheckpoint('turn-foreign')).toBeNull();
  });

  it('migrates v3 sessions and invalidates restart-era pending approvals without losing history', () => {
    const legacy = new Database(env.dbPath);
    legacy.exec(`
      CREATE TABLE a9_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO a9_meta VALUES (1, 3, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z');
      CREATE TABLE a9_sessions (
        session_id TEXT PRIMARY KEY, workspace_path TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX idx_a9_sessions_workspace ON a9_sessions (workspace_path);
      INSERT INTO a9_sessions VALUES ('a9-legacy-workspace', 'C:/workspace',
        '2026-08-26T01:00:00.000Z', '2026-08-26T02:00:00.000Z', '{}');
      CREATE TABLE a9_approvals (
        approval_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, turn_id TEXT,
        tool_name TEXT NOT NULL, binding_json TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('pending','approved','denied')),
        decided_at TEXT, created_at TEXT NOT NULL
      );
      INSERT INTO a9_approvals VALUES ('ap-stale', 'a9-legacy-workspace', 'turn-old',
        'shell', '{"commandSha256":"old"}', 'pending', NULL, '2026-08-26T02:00:00.000Z');
    `);
    legacy.close();

    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    expect(outcome.backupSha256).toBe(sha256(outcome.backupPath!));
    expect(outcome.manager.listConversations('C:/workspace')).toEqual([
      expect.objectContaining({
        sessionId: 'a9-legacy-workspace',
        title: '历史对话',
        titleSource: 'legacy',
        state: 'active',
      }),
    ]);
    expect(outcome.manager.db.prepare("SELECT decision FROM a9_approvals WHERE approval_id = 'ap-stale'").get())
      .toEqual({ decision: 'interrupted' });
  });

  it('manages isolated per-workspace conversations, titles, archive/restore and ciphertext drafts', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const manager = outcome.manager;

    const first = manager.ensureActiveConversation('C:/workspace', 'a9-legacy', 'a9c-first');
    expect(first).toEqual(expect.objectContaining({ sessionId: 'a9c-first', title: '新对话' }));
    expect(manager.getActiveConversationId('C:/workspace')).toBe('a9c-first');

    manager.maybeSetAutomaticTitle('a9c-first', '  第一行\n\t第二行  ');
    expect(manager.listConversations('C:/workspace')[0].title).toBe('第一行 第二行');
    expect(() => manager.renameConversation('a9c-first', 'bad\u0007title', 'C:/workspace')).toThrow('A9_CONVERSATION_TITLE_INVALID');
    expect(manager.renameConversation('a9c-first', '手工标题', 'C:/workspace').titleSource).toBe('manual');

    manager.setConversationDraftCiphertext('a9c-first', 'BASE64_CIPHERTEXT_ONLY');
    expect(manager.getConversationDraftCiphertext('a9c-first')).toBe('BASE64_CIPHERTEXT_ONLY');
    const second = manager.createConversation('a9c-second', 'C:/workspace');
    expect(second.sessionId).toBe('a9c-second');
    expect(manager.getConversationDraftCiphertext('a9c-second')).toBeNull();

    const fallback = manager.archiveConversation('a9c-second');
    expect(fallback?.sessionId).toBe('a9c-first');
    expect(manager.getActiveConversationId('C:/workspace')).toBe('a9c-first');
    expect(manager.getConversationDraftCiphertext('a9c-second')).toBeNull();
    expect(manager.restoreConversation('a9c-second', 'C:/workspace').state).toBe('active');
    expect(manager.getActiveConversationId('C:/workspace')).toBe('a9c-second');
  });

  it('rejects rename and restore when the conversation belongs to another workspace', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const manager = outcome.manager;
    manager.createConversation('foreign-conversation', 'C:/workspace-a');
    manager.archiveConversation('foreign-conversation');

    expect(() => manager.renameConversation('foreign-conversation', 'crossed', 'C:/workspace-b'))
      .toThrow(expect.objectContaining({ code: 'A9_CONVERSATION_WORKSPACE_MISMATCH' }));
    expect(() => manager.restoreConversation('foreign-conversation', 'C:/workspace-b'))
      .toThrow(expect.objectContaining({ code: 'A9_CONVERSATION_WORKSPACE_MISMATCH' }));
    expect(manager.listConversations('C:/workspace-a')[0]).toEqual(expect.objectContaining({
      title: '新对话',
      state: 'archived',
    }));
  });

  it('archives the last conversation and creates its replacement atomically', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const manager = outcome.manager;
    manager.createConversation('a9c-only', '/ws');
    const replacement = manager.archiveConversation('a9c-only', 'a9c-replacement');
    expect(replacement?.sessionId).toBe('a9c-replacement');
    expect(manager.getActiveConversationId('/ws')).toBe('a9c-replacement');
    expect(manager.listConversations('/ws')).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: 'a9c-only', state: 'archived' }),
      expect.objectContaining({ sessionId: 'a9c-replacement', state: 'active' }),
    ]));

    // A failed replacement insert rolls the archive and active pointer back.
    manager.archiveConversation('a9c-replacement', 'a9c-next');
    expect(() => manager.archiveConversation('a9c-next', 'a9c-only')).toThrow();
    expect(manager.getActiveConversationId('/ws')).toBe('a9c-next');
    expect(manager.listConversations('/ws').find((item) => item.sessionId === 'a9c-next')?.state).toBe('active');
  });

  it('enforces the 16 unarchived conversation limit without deleting archived history', () => {
    const outcome = A9PersistenceManager.open({ databasePath: env.dbPath, openDatabase: openReal, dataRoot: env.dataRoot });
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    const manager = outcome.manager;
    for (let index = 0; index < 16; index += 1) manager.createConversation(`a9c-${index}`, '/ws');
    expect(() => manager.createConversation('a9c-over-limit', '/ws')).toThrow(expect.objectContaining({ code: 'A9_CONVERSATION_LIMIT' }));
    manager.archiveConversation('a9c-15');
    expect(manager.createConversation('a9c-replacement', '/ws').sessionId).toBe('a9c-replacement');
    expect(manager.listConversations('/ws').filter((item) => item.state === 'archived')).toHaveLength(1);
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

    manager.recordManagedProcess({
      handleId: 'bg-cleanup-required',
      workspacePath: '/ws',
      pid: 9876,
      command: 'managed helper command',
      cwd: '/ws',
      startedAt: new Date().toISOString(),
      lastProbeStatus: 'failed',
      cleanupRequired: true,
    });
    expect(manager.listManagedProcesses('/ws')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        handleId: 'bg-cleanup-required',
        lastProbeStatus: 'cleanup_required',
        cleanupRequired: true,
      }),
    ]));
  });
});
