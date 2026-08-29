/**
 * @module a9-persistence
 * @description A9 SQLite 状态、迁移、Checkpoint、审批、后台进程事实、事件、
 * 中断恢复、保留策略与单写锁 (PRD §8 A9-ST02~ST04 / ADR-0089)
 *
 * 合同：
 * - 打开流程 fail-closed：未知 schema 拒绝覆盖；损坏库进入受限诊断模式；
 * - A8 白名单迁移（只读导入工作区与非敏感设置），迁移前备份；
 * - 重启只把活动任务标记为 interrupted，绝不自动重放模型/Shell/Git/审批；
 * - 日志默认保留 90 天并受空间上限约束；
 * - 同一工作区单写锁（跨窗口/多实例）。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SqliteDatabase } from './sqlite-event-ledger';

export const A9_SCHEMA_VERSION = 4 as const;
export const A9_DEFAULT_RETENTION_DAYS = 90;
export const A9_MAX_ACTIVE_CONVERSATIONS = 16;

export type A9PermissionModeValue = 'full_access' | 'review' | 'read_only';
export type A9ConversationStateValue = 'active' | 'archived';
export type A9ConversationActivityValue = 'idle' | 'running' | 'waiting_approval' | 'interrupted';
export type A9ConversationTitleSource = 'auto' | 'manual' | 'legacy';

function a9PersistenceError(code: string, message: string): Error & { code: string } {
  const error = new Error(`${code}: ${message}`) as Error & { code: string };
  error.code = code;
  return error;
}

export interface A9ConversationRecord {
  sessionId: string;
  workspacePath: string;
  title: string;
  titleSource: A9ConversationTitleSource;
  state: A9ConversationStateValue;
  activity: A9ConversationActivityValue;
  createdAt: string;
  updatedAt: string;
  lastActivatedAt: string;
}

export interface A9OpenOptions {
  databasePath: string;
  /** A8 的真实物理库；只读打开，绝不 attach 或写回。 */
  a8DatabasePath?: string;
  /** 打开函数由宿主注入（生产为 Electron ABI 的 better-sqlite3，测试为真实 adapter）。 */
  openDatabase: (databasePath: string, options?: { readonly?: boolean }) => SqliteDatabase;
  dataRoot: string;
  retentionDays?: number;
}

export type A9OpenOutcome =
  | { status: 'ready'; manager: A9PersistenceManager; backupPath?: string; backupSha256?: string; importedA8Workspaces: number }
  | { status: 'schema_refused'; reason: string; foundVersion?: number }
  | { status: 'diagnostics'; error: string; hint: string };

interface A9EventRow {
  id?: number;
  session_id: string;
  turn_id: string | null;
  kind: 'model' | 'tool';
  event_type: string;
  payload_json: string;
  created_at: string;
}

export class A9PersistenceManager {
  private constructor(
    readonly db: SqliteDatabase,
    private readonly databasePath: string,
    private readonly retentionDays: number,
  ) {}

  /**
   * 打开/迁移 A9 数据库。任何失败都返回结构化结果，不覆盖旧库。
   */
  static open(options: A9OpenOptions): A9OpenOutcome {
    let externalA8Db: SqliteDatabase | undefined;
    if (options.a8DatabasePath
      && path.resolve(options.a8DatabasePath) !== path.resolve(options.databasePath)
      && !fs.existsSync(options.a8DatabasePath)) {
      return {
        status: 'diagnostics',
        error: 'Explicit A8 database does not exist',
        hint: '显式 A8 物理库路径不存在；为避免静默漏迁移，产品进入受限诊断模式。',
      };
    }
    if (options.a8DatabasePath
      && path.resolve(options.a8DatabasePath) !== path.resolve(options.databasePath)
      && fs.existsSync(options.a8DatabasePath)) {
      try {
        externalA8Db = options.openDatabase(options.a8DatabasePath, { readonly: true });
        if (!a8TablesPresentStrict(externalA8Db)) {
          externalA8Db.close();
          return {
            status: 'diagnostics',
            error: 'Explicit A8 database does not contain the required a8_workspaces table',
            hint: '显式 A8 物理库身份不匹配；为避免静默漏迁移，产品进入受限诊断模式。',
          };
        }
      } catch (err) {
        try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }
        return {
          status: 'diagnostics',
          error: err instanceof Error ? err.message : String(err),
          hint: 'A8 物理数据库无法只读探测；为避免静默漏迁移，产品进入受限诊断模式。',
        };
      }
    }
    // 现有数据库必须先用只读连接探测。尤其是未来 schema，不能在拒绝前切换
    // journal_mode、创建 WAL/SHM sidecar，或触发任何其他写入。
    if (fs.existsSync(options.databasePath)) {
      let probeDb: SqliteDatabase | undefined;
      try {
        probeDb = options.openDatabase(options.databasePath, { readonly: true });
        const probedVersion = readSchemaVersion(probeDb);
        if (probedVersion === A9_SCHEMA_VERSION) assertA9CurrentSchema(probeDb);
        if (probedVersion === undefined && a9BusinessTablesPresent(probeDb)) {
          try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }
          return {
            status: 'diagnostics',
            error: 'A9 schema metadata is missing while A9 business tables already exist',
            hint: '数据库缺少有效 a9_meta，拒绝把未知/损坏结构标记为当前版本；原始文件保持未修改。',
          };
        }
        if (probedVersion !== undefined && probedVersion > A9_SCHEMA_VERSION) {
          try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }
          return {
            status: 'schema_refused',
            reason: `数据库 schema 版本 ${probedVersion} 高于本应用支持的 ${A9_SCHEMA_VERSION}；拒绝覆盖，请使用更新版本的应用打开。`,
            foundVersion: probedVersion,
          };
        }
      } catch (err) {
        try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }
        return {
          status: 'diagnostics',
          error: err instanceof Error ? err.message : String(err),
          hint: 'schema 探测失败，数据库可能损坏；进入受限诊断模式。',
        };
      } finally {
        try { probeDb?.close(); } catch (_closeError) { /* best effort */ }
      }
    }

    let db: SqliteDatabase;
    try {
      db = options.openDatabase(options.databasePath);
    } catch (err) {
      try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }
      return {
        status: 'diagnostics',
        error: err instanceof Error ? err.message : String(err),
        hint: '数据库无法打开（可能已损坏或被占用）。产品进入受限诊断模式；原始文件保持未修改。',
      };
    }

    // 写连接打开后再次检查，避免只读探测与迁移之间数据库被替换。
    let existingVersion: number | undefined;
    try {
      existingVersion = readSchemaVersion(db);
      if (existingVersion === A9_SCHEMA_VERSION) assertA9CurrentSchema(db);
      if (existingVersion === undefined && a9BusinessTablesPresent(db)) {
        throw new Error('A9 schema metadata is missing while A9 business tables already exist');
      }
    } catch (err) {
      try { db.close(); } catch (_closeError) { /* best effort */ }
      try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }
      return {
        status: 'diagnostics',
        error: err instanceof Error ? err.message : String(err),
        hint: 'schema 探测失败，数据库可能损坏；进入受限诊断模式。',
      };
    }

    if (existingVersion !== undefined && existingVersion > A9_SCHEMA_VERSION) {
      try { db.close(); } catch (_closeError) { /* best effort */ }
      try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }
      return {
        status: 'schema_refused',
        reason: `数据库 schema 版本 ${existingVersion} 高于本应用支持的 ${A9_SCHEMA_VERSION}；拒绝覆盖，请使用更新版本的应用打开。`,
        foundVersion: existingVersion,
      };
    }

    // 迁移前备份（只针对旧 A9 schema 或 A8 导入；当前 schema 重开无需重复备份）。
    let backupPath: string | undefined;
    let backupSha256: string | undefined;
    const embeddedA8Data = a8TablesPresent(db);
    const hasA8Data = embeddedA8Data || Boolean(externalA8Db);
    const requiresMigrationBackup = embeddedA8Data
      || (existingVersion !== undefined && existingVersion < A9_SCHEMA_VERSION);
    if (requiresMigrationBackup && fs.existsSync(options.databasePath)) {
      try {
        const backup = backupDatabase(db, options.dataRoot);
        backupPath = backup.path;
        backupSha256 = backup.sha256;
      } catch (err) {
        try { db.close(); } catch (_closeError) { /* best effort */ }
        try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }
        return {
          status: 'diagnostics',
          error: err instanceof Error ? err.message : String(err),
          hint: '迁移前备份无法创建；原数据库未执行 schema 迁移。产品进入受限诊断模式。',
        };
      }
    }

    const manager = new A9PersistenceManager(db, options.databasePath, options.retentionDays ?? A9_DEFAULT_RETENTION_DAYS);
    let importedA8Workspaces = 0;
    try {
      const initializeSchema = db.transaction(() => {
        manager.migrateSchema(existingVersion);
        manager.createSchema();
        assertA9CurrentSchema(db);
        if (hasA8Data) importedA8Workspaces = manager.importA8Whitelist(externalA8Db ?? db);
      });
      initializeSchema();
    } catch (err) {
      try { db.close(); } catch (_closeError) { /* best effort */ }
      try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }
      return {
        status: 'diagnostics',
        error: err instanceof Error ? err.message : String(err),
        hint: 'A9 schema 迁移失败；已回滚且迁移前备份保持可用。产品进入受限诊断模式，禁止继续执行任务。',
      };
    }

    // 只有 schema 创建/迁移和 A8 白名单导入整体成功后才切换 WAL；失败路径
    // 不应仅因 journal mode 预写而改变原库身份。
    try {
      db.exec('PRAGMA journal_mode = WAL');
    } catch (_err) {
      // WAL 不可用时不伪造成功；后续 SQLite 操作会返回实际错误。
    }

    try { externalA8Db?.close(); } catch (_closeError) { /* best effort */ }

    manager.markInterruptionsOnRestart();
    return {
      status: 'ready',
      manager,
      ...(backupPath ? { backupPath, backupSha256 } : {}),
      importedA8Workspaces,
    };
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS a9_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS a9_workspaces (
        workspace_path TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        permission_mode TEXT NOT NULL CHECK (permission_mode IN ('full_access','review','read_only')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS a9_sessions (
        session_id TEXT PRIMARY KEY,
        workspace_path TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '新对话',
        title_source TEXT NOT NULL DEFAULT 'auto' CHECK (title_source IN ('auto','manual','legacy')),
        state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_activated_at TEXT NOT NULL,
        draft_ciphertext TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_a9_sessions_workspace ON a9_sessions (workspace_path, state, last_activated_at);

      CREATE TABLE IF NOT EXISTS a9_workspace_conversation_state (
        workspace_path TEXT PRIMARY KEY,
        active_session_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS a9_tasks (
        task_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','completed','failed','cancelled','interrupted')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS a9_turns (
        turn_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','completed','completed_with_warnings','blocked','failed','cancelled','interrupted')),
        outcome_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS a9_runs (
        run_id TEXT PRIMARY KEY,
        turn_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','completed','failed','cancelled','interrupted')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS a9_checkpoints (
        turn_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_a9_checkpoints_session ON a9_checkpoints (session_id, created_at);

      CREATE TABLE IF NOT EXISTS a9_approvals (
        approval_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn_id TEXT,
        tool_name TEXT NOT NULL,
        binding_json TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('pending','approved','denied','interrupted')),
        decided_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS a9_managed_processes (
        handle_id TEXT PRIMARY KEY,
        workspace_path TEXT NOT NULL,
        pid INTEGER,
        command TEXT NOT NULL,
        cwd TEXT NOT NULL,
        started_at TEXT NOT NULL,
        last_probe_status TEXT,
        pid_reuse_possible INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS a9_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        turn_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('model','tool')),
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_a9_events_session ON a9_events (session_id, id);

      CREATE TABLE IF NOT EXISTS a9_workspace_locks (
        workspace_path TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT schema_version FROM a9_meta WHERE id = 1').get() as any;
    if (!existing) {
      this.db.prepare('INSERT INTO a9_meta (id, schema_version, created_at, updated_at) VALUES (1, ?, ?, ?)')
        .run(A9_SCHEMA_VERSION, now, now);
    } else if (existing.schema_version < A9_SCHEMA_VERSION) {
      this.db.prepare('UPDATE a9_meta SET schema_version = ?, updated_at = ? WHERE id = 1')
        .run(A9_SCHEMA_VERSION, now);
    }
  }

  /** A9 v3 增加 failed Turn；v4 引入对话目录、活动对话和草稿密文。 */
  private migrateSchema(existingVersion: number | undefined): void {
    if (existingVersion === undefined || existingVersion >= A9_SCHEMA_VERSION) return;
    let version = existingVersion;
    if (version < 3 && tablePresent(this.db, 'a9_turns')) {
      const turnIndexSql = (this.db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'a9_turns' AND sql IS NOT NULL",
      ).all() as any[])
        .map((row) => row.sql)
        .filter((sql): sql is string => typeof sql === 'string' && sql.length > 0);
      this.db.exec(`
          ALTER TABLE a9_turns RENAME TO a9_turns_pre_v3;
          CREATE TABLE a9_turns (
            turn_id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('active','completed','completed_with_warnings','blocked','failed','cancelled','interrupted')),
            outcome_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          INSERT INTO a9_turns (turn_id, task_id, session_id, status, outcome_json, created_at, updated_at)
          SELECT turn_id, task_id, session_id, status, outcome_json, created_at, updated_at
          FROM a9_turns_pre_v3;
          DROP TABLE a9_turns_pre_v3;
      `);
      for (const indexSql of turnIndexSql) this.db.exec(indexSql);
      this.db.prepare('UPDATE a9_meta SET schema_version = 3, updated_at = ? WHERE id = 1')
        .run(new Date().toISOString());
      version = 3;
    }
    if (version >= 4) return;

    const now = new Date().toISOString();
    if (tablePresent(this.db, 'a9_sessions')) {
      const sessionColumns = new Set((this.db.prepare('PRAGMA table_info(a9_sessions)').all() as any[])
        .map((row) => row.name));
      const metadataExpression = sessionColumns.has('metadata_json') ? "COALESCE(metadata_json, '{}')" : "'{}'";
      this.db.exec(`
          ALTER TABLE a9_sessions RENAME TO a9_sessions_pre_v4;
          CREATE TABLE a9_sessions (
            session_id TEXT PRIMARY KEY,
            workspace_path TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '新对话',
            title_source TEXT NOT NULL DEFAULT 'auto' CHECK (title_source IN ('auto','manual','legacy')),
            state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_activated_at TEXT NOT NULL,
            draft_ciphertext TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}'
          );
          INSERT INTO a9_sessions
            (session_id, workspace_path, title, title_source, state, created_at, updated_at, last_activated_at, draft_ciphertext, metadata_json)
          SELECT session_id, workspace_path, '历史对话', 'legacy', 'active', created_at, updated_at,
            COALESCE(updated_at, created_at, '${now}'), NULL, ${metadataExpression}
          FROM a9_sessions_pre_v4;
          DROP TABLE a9_sessions_pre_v4;
      `);
    } else {
      this.db.exec(`
          CREATE TABLE a9_sessions (
            session_id TEXT PRIMARY KEY,
            workspace_path TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '新对话',
            title_source TEXT NOT NULL DEFAULT 'auto' CHECK (title_source IN ('auto','manual','legacy')),
            state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_activated_at TEXT NOT NULL,
            draft_ciphertext TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}'
          );
      `);
    }
    this.db.exec(`
        DROP INDEX IF EXISTS idx_a9_sessions_workspace;
        CREATE INDEX idx_a9_sessions_workspace ON a9_sessions (workspace_path, state, last_activated_at);
        CREATE TABLE IF NOT EXISTS a9_workspace_conversation_state (
          workspace_path TEXT PRIMARY KEY,
          active_session_id TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
    `);
    if (tablePresent(this.db, 'a9_approvals')) {
      this.db.exec(`
          ALTER TABLE a9_approvals RENAME TO a9_approvals_pre_v4;
          CREATE TABLE a9_approvals (
            approval_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            turn_id TEXT,
            tool_name TEXT NOT NULL,
            binding_json TEXT NOT NULL,
            decision TEXT NOT NULL CHECK (decision IN ('pending','approved','denied','interrupted')),
            decided_at TEXT,
            created_at TEXT NOT NULL
          );
          INSERT INTO a9_approvals
          SELECT approval_id, session_id, turn_id, tool_name, binding_json, decision, decided_at, created_at
          FROM a9_approvals_pre_v4;
          DROP TABLE a9_approvals_pre_v4;
      `);
    }
    this.db.prepare('UPDATE a9_meta SET schema_version = 4, updated_at = ? WHERE id = 1').run(now);
  }

  /**
   * A8 白名单迁移：只读导入工作区列表与非敏感设置；凭据、活动任务、Review
   * 提案一律不迁移（A9-ST03）。
   */
  private importA8Whitelist(db: SqliteDatabase): number {
    assertA8WorkspaceSchema(db);
    const workspaces = db.prepare('SELECT schema_version, canonical_path, comparison_key FROM a8_workspaces').all() as any[];
    let imported = 0;
    const importAll = this.db.transaction(() => {
      const now = new Date().toISOString();
      const seenComparisonKeys = new Set<string>();
      const insert = this.db.prepare(
        'INSERT OR IGNORE INTO a9_workspaces (workspace_path, display_name, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      );
      for (const row of workspaces) {
        const canonicalPath = row.canonical_path;
        if (Number(row.schema_version) !== 1
          || typeof canonicalPath !== 'string' || canonicalPath.length === 0
          || (!path.isAbsolute(canonicalPath) && !path.win32.isAbsolute(canonicalPath))
          || row.comparison_key !== canonicalPath.toLocaleLowerCase('en-US').replace(/\\/g, '/')) {
          throw new Error('A8 workspace row invariants are invalid');
        }
        const windowsIdentity = row.comparison_key.toLocaleLowerCase('en-US').replace(/\\/g, '/');
        if (seenComparisonKeys.has(windowsIdentity)) {
          throw new Error('A8 workspace rows contain a duplicate Windows comparison identity');
        }
        seenComparisonKeys.add(windowsIdentity);
        // A8 工作区未选择过 A9 模式：不设默认 Full Access，交由首次选择流程。
        insert.run(canonicalPath, displayNameFor(canonicalPath), 'review', now, now);
        imported += 1;
      }
    });
    importAll();
    return imported;
  }

  // ---------------------------------------------------------------------
  // 工作区与模式（fail-closed：无默认 Full Access）
  // ---------------------------------------------------------------------

  getWorkspaceMode(workspacePath: string): A9PermissionModeValue | undefined {
    const row = this.db.prepare('SELECT permission_mode FROM a9_workspaces WHERE workspace_path = ?').get(workspacePath) as any;
    if (!row) return undefined;
    const mode = row.permission_mode;
    if (mode === 'full_access' || mode === 'review' || mode === 'read_only') return mode;
    return undefined;
  }

  setWorkspaceMode(workspacePath: string, mode: A9PermissionModeValue): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT workspace_path FROM a9_workspaces WHERE workspace_path = ?').get(workspacePath);
    if (existing) {
      this.db.prepare('UPDATE a9_workspaces SET permission_mode = ?, updated_at = ? WHERE workspace_path = ?').run(mode, now, workspacePath);
    } else {
      this.db.prepare(
        'INSERT INTO a9_workspaces (workspace_path, display_name, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(workspacePath, displayNameFor(workspacePath), mode, now, now);
    }
  }

  // ---------------------------------------------------------------------
  // 会话 / 任务 / Turn / Run
  // ---------------------------------------------------------------------

  saveSession(sessionId: string, workspacePath: string, metadata: Record<string, unknown> = {}): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT session_id FROM a9_sessions WHERE session_id = ?').get(sessionId);
    if (existing) {
      this.db.prepare('UPDATE a9_sessions SET workspace_path = ?, updated_at = ?, metadata_json = ? WHERE session_id = ?')
        .run(workspacePath, now, JSON.stringify(metadata), sessionId);
    } else {
      this.db.prepare(`
        INSERT INTO a9_sessions
          (session_id, workspace_path, title, title_source, state, created_at, updated_at, last_activated_at, draft_ciphertext, metadata_json)
        VALUES (?, ?, '新对话', 'auto', 'active', ?, ?, ?, NULL, ?)
      `).run(sessionId, workspacePath, now, now, now, JSON.stringify(metadata));
    }
  }

  /**
   * 首次开启 v4 时确定性保留旧的“工作区派生 Session”；无旧事实时创建新对话。
   */
  ensureActiveConversation(workspacePath: string, legacySessionId: string, newSessionId: string): A9ConversationRecord {
    const active = this.db.prepare(`
      SELECT s.session_id FROM a9_workspace_conversation_state w
      JOIN a9_sessions s ON s.session_id = w.active_session_id
      WHERE w.workspace_path = ? AND s.workspace_path = ? AND s.state = 'active'
    `).get(workspacePath, workspacePath) as any;
    if (active?.session_id) return this.activateConversation(workspacePath, active.session_id);

    if (this.sessionHasFacts(legacySessionId)) {
      this.saveSession(legacySessionId, workspacePath, { migratedFromWorkspaceSession: true });
      this.db.prepare(`
        UPDATE a9_sessions
        SET title = '历史对话', title_source = 'legacy', updated_at = ?
        WHERE session_id = ?
      `).run(new Date().toISOString(), legacySessionId);
      return this.activateConversation(workspacePath, legacySessionId);
    }
    const mostRecent = this.db.prepare(`
      SELECT session_id FROM a9_sessions
      WHERE workspace_path = ? AND state = 'active'
      ORDER BY last_activated_at DESC, created_at DESC LIMIT 1
    `).get(workspacePath) as any;
    if (mostRecent?.session_id) return this.activateConversation(workspacePath, mostRecent.session_id);
    return this.createConversation(newSessionId, workspacePath);
  }

  createConversation(sessionId: string, workspacePath: string): A9ConversationRecord {
    const activeCount = (this.db.prepare(`
      SELECT COUNT(*) AS n FROM a9_sessions WHERE workspace_path = ? AND state = 'active'
    `).get(workspacePath) as any)?.n ?? 0;
    if (Number(activeCount) >= A9_MAX_ACTIVE_CONVERSATIONS) {
      throw a9PersistenceError('A9_CONVERSATION_LIMIT', `每个工作区最多 ${A9_MAX_ACTIVE_CONVERSATIONS} 个未归档对话。`);
    }
    const now = new Date().toISOString();
    const create = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO a9_sessions
          (session_id, workspace_path, title, title_source, state, created_at, updated_at, last_activated_at, draft_ciphertext, metadata_json)
        VALUES (?, ?, '新对话', 'auto', 'active', ?, ?, ?, NULL, '{}')
      `).run(sessionId, workspacePath, now, now, now);
      this.setActiveConversation(workspacePath, sessionId, now);
    });
    create();
    return this.requireConversation(sessionId);
  }

  activateConversation(workspacePath: string, sessionId: string): A9ConversationRecord {
    const row = this.requireConversation(sessionId);
    if (row.workspacePath !== workspacePath || row.state !== 'active') {
      throw a9PersistenceError('A9_CONVERSATION_NOT_ACTIVE', '对话不属于当前工作区或已归档。');
    }
    const now = new Date().toISOString();
    const activate = this.db.transaction(() => {
      this.db.prepare('UPDATE a9_sessions SET last_activated_at = ?, updated_at = ? WHERE session_id = ?')
        .run(now, now, sessionId);
      this.setActiveConversation(workspacePath, sessionId, now);
    });
    activate();
    return this.requireConversation(sessionId);
  }

  renameConversation(sessionId: string, title: string, workspacePath: string): A9ConversationRecord {
    if (typeof title !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(title)) {
      throw a9PersistenceError('A9_CONVERSATION_TITLE_INVALID', '对话名称不能为空或包含控制字符。');
    }
    const normalized = normalizeConversationTitle(title, 80);
    if (!normalized) throw a9PersistenceError('A9_CONVERSATION_TITLE_INVALID', '对话名称不能为空或包含控制字符。');
    const conversation = this.requireConversation(sessionId);
    if (!sameWorkspacePath(conversation.workspacePath, workspacePath)) {
      throw a9PersistenceError('A9_CONVERSATION_WORKSPACE_MISMATCH', '对话不属于当前工作区。');
    }
    this.db.prepare(`
      UPDATE a9_sessions SET title = ?, title_source = 'manual', updated_at = ? WHERE session_id = ?
    `).run(normalized, new Date().toISOString(), sessionId);
    return this.requireConversation(sessionId);
  }

  maybeSetAutomaticTitle(sessionId: string, title: string): A9ConversationRecord {
    const normalized = normalizeConversationTitle(title, 40) || '新对话';
    this.requireConversation(sessionId);
    this.db.prepare(`
      UPDATE a9_sessions SET title = ?, updated_at = ?
      WHERE session_id = ? AND title_source = 'auto' AND title = '新对话'
    `).run(normalized, new Date().toISOString(), sessionId);
    return this.requireConversation(sessionId);
  }

  archiveConversation(sessionId: string, fallbackSessionId?: string): A9ConversationRecord | null {
    const row = this.requireConversation(sessionId);
    if (this.getActiveConversationId(row.workspacePath) !== sessionId) {
      throw a9PersistenceError('A9_CONVERSATION_NOT_CURRENT', '只能归档当前对话。');
    }
    const archive = this.db.transaction(() => {
      const now = new Date().toISOString();
      this.db.prepare("UPDATE a9_sessions SET state = 'archived', updated_at = ? WHERE session_id = ?")
        .run(now, sessionId);
      const next = this.db.prepare(`
        SELECT session_id FROM a9_sessions
        WHERE workspace_path = ? AND state = 'active' AND session_id <> ?
        ORDER BY last_activated_at DESC, created_at DESC LIMIT 1
      `).get(row.workspacePath, sessionId) as any;
      if (next?.session_id) {
        this.setActiveConversation(row.workspacePath, next.session_id, now);
        return this.requireConversation(next.session_id);
      }
      if (fallbackSessionId) {
        this.db.prepare(`
          INSERT INTO a9_sessions
            (session_id, workspace_path, title, title_source, state, created_at, updated_at, last_activated_at, draft_ciphertext, metadata_json)
          VALUES (?, ?, '新对话', 'auto', 'active', ?, ?, ?, NULL, '{}')
        `).run(fallbackSessionId, row.workspacePath, now, now, now);
        this.setActiveConversation(row.workspacePath, fallbackSessionId, now);
        return this.requireConversation(fallbackSessionId);
      }
      this.db.prepare('DELETE FROM a9_workspace_conversation_state WHERE workspace_path = ?').run(row.workspacePath);
      return null;
    });
    return archive();
  }

  restoreConversation(sessionId: string, workspacePath: string): A9ConversationRecord {
    const row = this.requireConversation(sessionId);
    if (!sameWorkspacePath(row.workspacePath, workspacePath)) {
      throw a9PersistenceError('A9_CONVERSATION_WORKSPACE_MISMATCH', '对话不属于当前工作区。');
    }
    const activeCount = (this.db.prepare(`
      SELECT COUNT(*) AS n FROM a9_sessions WHERE workspace_path = ? AND state = 'active'
    `).get(row.workspacePath) as any)?.n ?? 0;
    if (row.state === 'archived' && Number(activeCount) >= A9_MAX_ACTIVE_CONVERSATIONS) {
      throw a9PersistenceError('A9_CONVERSATION_LIMIT', `每个工作区最多 ${A9_MAX_ACTIVE_CONVERSATIONS} 个未归档对话。`);
    }
    const now = new Date().toISOString();
    const restore = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE a9_sessions SET state = 'active', last_activated_at = ?, updated_at = ? WHERE session_id = ?
      `).run(now, now, sessionId);
      this.setActiveConversation(row.workspacePath, sessionId, now);
    });
    restore();
    return this.requireConversation(sessionId);
  }

  listConversations(workspacePath: string): A9ConversationRecord[] {
    return (this.db.prepare(`
      SELECT s.*,
        CASE
          WHEN EXISTS (SELECT 1 FROM a9_approvals a WHERE a.session_id = s.session_id AND a.decision = 'pending') THEN 'waiting_approval'
          WHEN EXISTS (SELECT 1 FROM a9_tasks t WHERE t.session_id = s.session_id AND t.status = 'active') THEN 'running'
          WHEN EXISTS (SELECT 1 FROM a9_tasks t WHERE t.session_id = s.session_id AND t.status = 'interrupted') THEN 'interrupted'
          ELSE 'idle'
        END AS activity
      FROM a9_sessions s WHERE s.workspace_path = ?
      ORDER BY CASE WHEN s.state = 'active' THEN 0 ELSE 1 END,
        s.last_activated_at DESC, s.updated_at DESC
    `).all(workspacePath) as any[]).map(conversationFromRow);
  }

  getActiveConversationId(workspacePath: string): string | null {
    const row = this.db.prepare(`
      SELECT s.session_id FROM a9_workspace_conversation_state w
      JOIN a9_sessions s ON s.session_id = w.active_session_id
      WHERE w.workspace_path = ? AND s.workspace_path = ? AND s.state = 'active'
    `).get(workspacePath, workspacePath) as any;
    return typeof row?.session_id === 'string' ? row.session_id : null;
  }

  setConversationDraftCiphertext(sessionId: string, ciphertext: string | null): void {
    this.requireConversation(sessionId);
    this.db.prepare('UPDATE a9_sessions SET draft_ciphertext = ?, updated_at = ? WHERE session_id = ?')
      .run(ciphertext, new Date().toISOString(), sessionId);
  }

  getConversationDraftCiphertext(sessionId: string): string | null {
    const row = this.db.prepare('SELECT draft_ciphertext FROM a9_sessions WHERE session_id = ?').get(sessionId) as any;
    if (!row) throw a9PersistenceError('A9_CONVERSATION_NOT_FOUND', '未找到对话。');
    return typeof row.draft_ciphertext === 'string' ? row.draft_ciphertext : null;
  }

  getConversationMetadata(sessionId: string): Record<string, unknown> {
    const row = this.db.prepare('SELECT metadata_json FROM a9_sessions WHERE session_id = ?').get(sessionId) as any;
    if (!row) throw a9PersistenceError('A9_CONVERSATION_NOT_FOUND', '未找到对话。');
    return safeParse(typeof row.metadata_json === 'string' ? row.metadata_json : '{}');
  }

  mergeConversationMetadata(sessionId: string, patch: Record<string, unknown>): void {
    const metadata = { ...this.getConversationMetadata(sessionId), ...patch };
    this.db.prepare('UPDATE a9_sessions SET metadata_json = ?, updated_at = ? WHERE session_id = ?')
      .run(JSON.stringify(metadata), new Date().toISOString(), sessionId);
  }

  private requireConversation(sessionId: string): A9ConversationRecord {
    const row = this.db.prepare(`
      SELECT s.*,
        CASE
          WHEN EXISTS (SELECT 1 FROM a9_approvals a WHERE a.session_id = s.session_id AND a.decision = 'pending') THEN 'waiting_approval'
          WHEN EXISTS (SELECT 1 FROM a9_tasks t WHERE t.session_id = s.session_id AND t.status = 'active') THEN 'running'
          WHEN EXISTS (SELECT 1 FROM a9_tasks t WHERE t.session_id = s.session_id AND t.status = 'interrupted') THEN 'interrupted'
          ELSE 'idle'
        END AS activity
      FROM a9_sessions s WHERE s.session_id = ?
    `).get(sessionId) as any;
    if (!row) throw a9PersistenceError('A9_CONVERSATION_NOT_FOUND', '未找到对话。');
    return conversationFromRow(row);
  }

  private setActiveConversation(workspacePath: string, sessionId: string, now: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO a9_workspace_conversation_state (workspace_path, active_session_id, updated_at)
      VALUES (?, ?, ?)
    `).run(workspacePath, sessionId, now);
  }

  private sessionHasFacts(sessionId: string): boolean {
    for (const table of ['a9_tasks', 'a9_turns', 'a9_runs', 'a9_checkpoints', 'a9_approvals', 'a9_events']) {
      const row = this.db.prepare(`SELECT 1 AS present FROM ${table} WHERE session_id = ? LIMIT 1`).get(sessionId);
      if (row) return true;
    }
    return false;
  }

  upsertTask(taskId: string, sessionId: string, status: 'active' | 'completed' | 'failed' | 'cancelled' | 'interrupted'): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT task_id FROM a9_tasks WHERE task_id = ?').get(taskId);
    if (existing) {
      this.db.prepare('UPDATE a9_tasks SET status = ?, updated_at = ? WHERE task_id = ?').run(status, now, taskId);
    } else {
      this.db.prepare('INSERT INTO a9_tasks (task_id, session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(taskId, sessionId, status, now, now);
    }
  }

  upsertTurn(
    turnId: string,
    taskId: string,
    sessionId: string,
    status: 'active' | 'completed' | 'completed_with_warnings' | 'blocked' | 'failed' | 'cancelled' | 'interrupted',
    outcome: Record<string, unknown> = {},
  ): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT turn_id FROM a9_turns WHERE turn_id = ?').get(turnId);
    if (existing) {
      this.db.prepare('UPDATE a9_turns SET status = ?, outcome_json = ?, updated_at = ? WHERE turn_id = ?')
        .run(status, JSON.stringify(outcome), now, turnId);
    } else {
      this.db.prepare('INSERT INTO a9_turns (turn_id, task_id, session_id, status, outcome_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(turnId, taskId, sessionId, status, JSON.stringify(outcome), now, now);
    }
  }

  upsertRun(runId: string, turnId: string, sessionId: string, status: 'active' | 'completed' | 'failed' | 'cancelled' | 'interrupted'): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT run_id FROM a9_runs WHERE run_id = ?').get(runId);
    if (existing) {
      this.db.prepare('UPDATE a9_runs SET status = ?, updated_at = ? WHERE run_id = ?').run(status, now, runId);
    } else {
      this.db.prepare('INSERT INTO a9_runs (run_id, turn_id, session_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(runId, turnId, sessionId, status, now, now);
    }
  }

  /**
   * 重启恢复：把所有 active 任务/Turn/Run 标记为 interrupted，返回事实清单。
   * 只记录事实，不自动重放任何模型、Shell、Git 或审批动作。
   */
  markInterruptionsOnRestart(): Array<{ kind: 'task' | 'turn' | 'run'; id: string }> {
    const now = new Date().toISOString();
    const interrupted: Array<{ kind: 'task' | 'turn' | 'run'; id: string }> = [];
    const tasks = this.db.prepare("SELECT task_id FROM a9_tasks WHERE status = 'active'").all() as any[];
    for (const row of tasks) {
      this.db.prepare('UPDATE a9_tasks SET status = ?, updated_at = ? WHERE task_id = ?').run('interrupted', now, row.task_id);
      interrupted.push({ kind: 'task', id: row.task_id });
    }
    const turns = this.db.prepare("SELECT turn_id FROM a9_turns WHERE status = 'active'").all() as any[];
    for (const row of turns) {
      this.db.prepare('UPDATE a9_turns SET status = ?, updated_at = ? WHERE turn_id = ?').run('interrupted', now, row.turn_id);
      interrupted.push({ kind: 'turn', id: row.turn_id });
    }
    const runs = this.db.prepare("SELECT run_id FROM a9_runs WHERE status = 'active'").all() as any[];
    for (const row of runs) {
      this.db.prepare('UPDATE a9_runs SET status = ?, updated_at = ? WHERE run_id = ?').run('interrupted', now, row.run_id);
      interrupted.push({ kind: 'run', id: row.run_id });
    }
    // 重启前的审批不得重放。保留历史行，但终态标记为 interrupted。
    this.db.prepare(`
      UPDATE a9_approvals SET decision = 'interrupted', decided_at = ? WHERE decision = 'pending'
    `).run(now);
    return interrupted;
  }

  listInterruptions(sessionId?: string): Array<{ kind: 'task' | 'turn' | 'run'; id: string; sessionId: string }> {
    const result: Array<{ kind: 'task' | 'turn' | 'run'; id: string; sessionId: string }> = [];
    const suffix = sessionId ? ' AND session_id = ?' : '';
    const args = sessionId ? [sessionId] : [];
    for (const row of this.db.prepare(`SELECT task_id, session_id FROM a9_tasks WHERE status = 'interrupted'${suffix}`).all(...args) as any[]) {
      result.push({ kind: 'task', id: row.task_id, sessionId: row.session_id });
    }
    for (const row of this.db.prepare(`SELECT turn_id, session_id FROM a9_turns WHERE status = 'interrupted'${suffix}`).all(...args) as any[]) {
      result.push({ kind: 'turn', id: row.turn_id, sessionId: row.session_id });
    }
    for (const row of this.db.prepare(`SELECT run_id, session_id FROM a9_runs WHERE status = 'interrupted'${suffix}`).all(...args) as any[]) {
      result.push({ kind: 'run', id: row.run_id, sessionId: row.session_id });
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // Checkpoint / 审批 / 后台进程事实
  // ---------------------------------------------------------------------

  saveCheckpoint(checkpoint: { turnId: string; sessionId: string; payload: Record<string, unknown> }): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO a9_checkpoints (turn_id, session_id, created_at, payload_json)
      VALUES (?, ?, ?, ?)
    `).run(checkpoint.turnId, checkpoint.sessionId, now, JSON.stringify(checkpoint.payload));
  }

  getCheckpoint(turnId: string): { turnId: string; sessionId: string; createdAt: string; payload: Record<string, unknown> } | null {
    const row = this.db.prepare('SELECT * FROM a9_checkpoints WHERE turn_id = ?').get(turnId) as any;
    if (!row) return null;
    return {
      turnId: row.turn_id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      payload: safeParse(row.payload_json),
    };
  }

  listCheckpoints(sessionId: string): Array<{ turnId: string; createdAt: string }> {
    return (this.db.prepare('SELECT turn_id, created_at FROM a9_checkpoints WHERE session_id = ? ORDER BY created_at').all(sessionId) as any[])
      .map((r) => ({ turnId: r.turn_id, createdAt: r.created_at }));
  }

  /**
   * Reconcile durable workspace checkpoint manifests after a crash. Only an
   * interrupted Turn already bound to the same workspace may gain the missing
   * SQLite projection; completed/foreign/unknown Turns are ignored. The
   * workspace manifest remains the source of file-level undo facts.
   */
  reconcileInterruptedWorkspaceCheckpoints(workspacePath: string, turnIds: string[]): string[] {
    const candidates = Array.from(new Set(turnIds.filter((turnId) => typeof turnId === 'string' && turnId.length > 0)));
    const recovered: string[] = [];
    const reconcile = this.db.transaction(() => {
      const find = this.db.prepare(`
        SELECT t.turn_id, t.session_id
        FROM a9_turns t
        JOIN a9_sessions s ON s.session_id = t.session_id
        LEFT JOIN a9_checkpoints c ON c.turn_id = t.turn_id
        WHERE t.turn_id = ? AND t.status = 'interrupted'
          AND s.workspace_path = ? AND c.turn_id IS NULL
      `);
      const insert = this.db.prepare(`
        INSERT INTO a9_checkpoints (turn_id, session_id, created_at, payload_json)
        VALUES (?, ?, ?, ?)
      `);
      for (const turnId of candidates) {
        const row = find.get(turnId, workspacePath) as any;
        if (!row) continue;
        const now = new Date().toISOString();
        insert.run(turnId, row.session_id, now, JSON.stringify({
          schemaVersion: 1,
          outcome: 'interrupted',
          verification: 'not_applicable',
          finalMessage: 'Turn interrupted before its final SQLite checkpoint was committed. Workspace undo facts were recovered from the durable manifest.',
          toolCallsExecuted: 0,
          externalChanges: [],
          recoveredFromWorkspaceManifest: true,
        }));
        recovered.push(turnId);
      }
    });
    reconcile();
    return recovered;
  }

  /**
   * Rebuilds the local conversation surface from persisted facts. This is a
   * read-only projection: callers may render it after restart, but must never
   * replay the prompt, model request, tools, approvals, or side effects.
   */
  listConversationFacts(sessionId: string, limit?: number): Array<{
    taskId: string;
    turnId: string | null;
    requestPrompt: string;
    outcome: string;
    verification: string;
    finalMessage: string;
    createdAt: string;
    updatedAt: string;
    providerContextGeneration?: number;
  }> {
    const cappedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(Math.floor(limit as number), 1000))
      : undefined;
    const taskRows = this.db.prepare(
      'SELECT task_id, status, created_at, updated_at FROM a9_tasks WHERE session_id = ?',
    ).all(sessionId) as any[];
    const tasks = new Map(taskRows.map((row) => [row.task_id, row]));
    const requestRows = this.db.prepare(`
      SELECT payload_json, created_at FROM a9_events
      WHERE session_id = ? AND kind = 'model' AND event_type = 'conversation.request'
      ORDER BY id DESC${cappedLimit ? ' LIMIT ?' : ''}
    `).all(...(cappedLimit ? [sessionId, cappedLimit] : [sessionId])) as any[];
    const checkpointRows = this.db.prepare(`
      SELECT c.turn_id, c.created_at, c.payload_json, t.task_id, t.status
      FROM a9_checkpoints c
      LEFT JOIN a9_turns t ON t.turn_id = c.turn_id
      WHERE c.session_id = ?
      ORDER BY c.created_at DESC${cappedLimit ? ' LIMIT ?' : ''}
    `).all(...(cappedLimit ? [sessionId, cappedLimit] : [sessionId])) as any[];

    const facts = new Map<string, any>();
    for (const row of requestRows.reverse()) {
      const payload = safeParse(row.payload_json) as any;
      if (!payload.taskId || typeof payload.requestPrompt !== 'string') continue;
      const task = tasks.get(payload.taskId);
      facts.set(payload.taskId, {
        taskId: payload.taskId,
        turnId: null,
        requestPrompt: payload.requestPrompt,
        outcome: task?.status === 'interrupted' ? 'interrupted' : task?.status || 'running',
        verification: 'not_applicable',
        finalMessage: '',
        createdAt: row.created_at,
        updatedAt: task?.updated_at || row.created_at,
      });
    }
    for (const row of checkpointRows.reverse()) {
      const payload = safeParse(row.payload_json) as any;
      const taskId = row.task_id || `legacy:${row.turn_id}`;
      const existing = facts.get(taskId);
      facts.set(taskId, {
        taskId,
        turnId: row.turn_id,
        requestPrompt: existing?.requestPrompt || (typeof payload.requestPrompt === 'string' ? payload.requestPrompt : ''),
        outcome: payload.outcome || row.status || 'completed',
        verification: payload.verification || 'not_applicable',
        finalMessage: typeof payload.finalMessage === 'string' ? payload.finalMessage : '',
        createdAt: existing?.createdAt || row.created_at,
        updatedAt: row.created_at,
        ...(Number.isSafeInteger(payload.providerContextGeneration)
          ? { providerContextGeneration: payload.providerContextGeneration }
          : {}),
      });
    }
    const sorted = Array.from(facts.values())
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return cappedLimit ? sorted.slice(-cappedLimit) : sorted;
  }

  recordApproval(approval: {
    approvalId: string;
    sessionId: string;
    turnId?: string;
    toolName: string;
    binding: Record<string, unknown>;
    decision: 'pending' | 'approved' | 'denied' | 'interrupted';
  }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO a9_approvals (approval_id, session_id, turn_id, tool_name, binding_json, decision, decided_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      approval.approvalId,
      approval.sessionId,
      approval.turnId ?? null,
      approval.toolName,
      JSON.stringify(approval.binding),
      approval.decision,
      approval.decision === 'pending' ? null : new Date().toISOString(),
      new Date().toISOString(),
    );
  }

  recordManagedProcess(fact: {
    handleId: string;
    workspacePath: string;
    pid?: number;
    command: string;
    cwd: string;
    startedAt: string;
    lastProbeStatus?: string;
    pidReusePossible?: boolean;
    cleanupRequired?: boolean;
  }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO a9_managed_processes
        (handle_id, workspace_path, pid, command, cwd, started_at, last_probe_status, pid_reuse_possible)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fact.handleId,
      fact.workspacePath,
      fact.pid ?? null,
      fact.command,
      fact.cwd,
      fact.startedAt,
      fact.cleanupRequired === true ? 'cleanup_required' : fact.lastProbeStatus ?? null,
      fact.pidReusePossible ? 1 : 0,
    );
  }

  listManagedProcesses(workspacePath: string): Array<{
    handleId: string; pid: number | null; command: string; cwd: string;
    startedAt: string; lastProbeStatus: string | null; pidReusePossible: boolean; cleanupRequired: boolean;
  }> {
    return (this.db.prepare('SELECT * FROM a9_managed_processes WHERE workspace_path = ?').all(workspacePath) as any[]).map((r) => ({
      handleId: r.handle_id,
      pid: r.pid,
      command: r.command,
      cwd: r.cwd,
      startedAt: r.started_at,
      lastProbeStatus: r.last_probe_status,
      pidReusePossible: r.pid_reuse_possible === 1,
      cleanupRequired: r.last_probe_status === 'cleanup_required',
    }));
  }

  // ---------------------------------------------------------------------
  // 事件与保留策略
  // ---------------------------------------------------------------------

  recordModelEvent(sessionId: string, turnId: string | null, eventType: string, payload: Record<string, unknown>): void {
    this.insertEvent(sessionId, turnId, 'model', eventType, payload);
  }

  recordToolEvent(sessionId: string, turnId: string | null, eventType: string, payload: Record<string, unknown>): void {
    this.insertEvent(sessionId, turnId, 'tool', eventType, payload);
  }

  private insertEvent(sessionId: string, turnId: string | null, kind: 'model' | 'tool', eventType: string, payload: Record<string, unknown>): void {
    this.db.prepare(`
      INSERT INTO a9_events (session_id, turn_id, kind, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, turnId, kind, eventType, JSON.stringify(payload), new Date().toISOString());
  }

  /**
   * 保留策略：删除超过保留期的已结束事件；活动 checkpoint 与审批不删。
   */
  enforceRetention(now: Date = new Date()): { purgedEvents: number } {
    const cutoff = new Date(now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const info = this.db.prepare('DELETE FROM a9_events WHERE created_at < ?').run(cutoff);
    return { purgedEvents: Number(info.changes ?? 0) };
  }

  countEvents(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM a9_events').get() as any).n;
  }

  // ---------------------------------------------------------------------
  // 单写锁（同一工作区）
  // ---------------------------------------------------------------------

  acquireWorkspaceLock(workspacePath: string, ownerId: string): { acquired: boolean; holder?: string; acquiredAt?: string } {
    const now = new Date();
    const nowIso = now.toISOString();
    const row = this.db.prepare('SELECT owner_id, heartbeat_at FROM a9_workspace_locks WHERE workspace_path = ?').get(workspacePath) as any;
    if (row) {
      if (row.owner_id === ownerId) {
        this.db.prepare('UPDATE a9_workspace_locks SET heartbeat_at = ? WHERE workspace_path = ?').run(nowIso, workspacePath);
        return { acquired: true, holder: ownerId, acquiredAt: row.heartbeat_at };
      }
      // 过期接管（心跳超过 15 分钟视为持有者已死）。
      const heartbeat = new Date(row.heartbeat_at as string);
      const heartbeatAge = now.getTime() - heartbeat.getTime();
      if (heartbeatAge < 15 * 60 * 1000) {
        return { acquired: false, holder: row.owner_id, acquiredAt: row.heartbeat_at };
      }
    }
    this.db.prepare(`
      INSERT OR REPLACE INTO a9_workspace_locks (workspace_path, owner_id, acquired_at, heartbeat_at)
      VALUES (?, ?, ?, ?)
    `).run(workspacePath, ownerId, nowIso, nowIso);
    return { acquired: true, holder: ownerId, acquiredAt: nowIso };
  }

  releaseWorkspaceLock(workspacePath: string, ownerId: string): void {
    this.db.prepare('DELETE FROM a9_workspace_locks WHERE workspace_path = ? AND owner_id = ?').run(workspacePath, ownerId);
  }
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function a8TablesPresent(db: SqliteDatabase): boolean {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='a8_workspaces'").get();
    return Boolean(row);
  } catch (_err) {
    return false;
  }
}

function a9BusinessTablesPresent(db: SqliteDatabase): boolean {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'a9_%' AND name <> 'a9_meta' LIMIT 1",
  ).get();
  return Boolean(row);
}

function assertA9CurrentSchema(db: SqliteDatabase): void {
  const required: Record<string, string[]> = {
    a9_meta: ['id', 'schema_version', 'created_at', 'updated_at'],
    a9_workspaces: ['workspace_path', 'display_name', 'permission_mode', 'created_at', 'updated_at'],
    a9_sessions: ['session_id', 'workspace_path', 'title', 'title_source', 'state', 'created_at', 'updated_at', 'last_activated_at', 'draft_ciphertext', 'metadata_json'],
    a9_workspace_conversation_state: ['workspace_path', 'active_session_id', 'updated_at'],
    a9_tasks: ['task_id', 'session_id', 'status', 'created_at', 'updated_at'],
    a9_turns: ['turn_id', 'task_id', 'session_id', 'status', 'outcome_json', 'created_at', 'updated_at'],
    a9_runs: ['run_id', 'turn_id', 'session_id', 'status', 'created_at', 'updated_at'],
    a9_checkpoints: ['turn_id', 'session_id', 'created_at', 'payload_json'],
    a9_approvals: ['approval_id', 'session_id', 'turn_id', 'tool_name', 'binding_json', 'decision', 'decided_at', 'created_at'],
    a9_managed_processes: ['handle_id', 'workspace_path', 'pid', 'command', 'cwd', 'started_at', 'last_probe_status', 'pid_reuse_possible'],
    a9_events: ['id', 'session_id', 'turn_id', 'kind', 'event_type', 'payload_json', 'created_at'],
    a9_workspace_locks: ['workspace_path', 'owner_id', 'acquired_at', 'heartbeat_at'],
  };
  for (const [table, columns] of Object.entries(required)) {
    if (!tablePresent(db, table)) throw new Error(`A9 schema v4 is missing table ${table}`);
    const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    const present = new Set(tableInfo.map((row) => row.name)
      .filter((name): name is string => typeof name === 'string'));
    const missing = columns.filter((column) => !present.has(column));
    if (missing.length > 0) throw new Error(`A9 schema v4 table ${table} is missing columns: ${missing.join(', ')}`);
  }

  const primaryKeys: Record<string, string> = {
    a9_meta: 'id',
    a9_workspaces: 'workspace_path',
    a9_sessions: 'session_id',
    a9_workspace_conversation_state: 'workspace_path',
    a9_tasks: 'task_id',
    a9_turns: 'turn_id',
    a9_runs: 'run_id',
    a9_checkpoints: 'turn_id',
    a9_approvals: 'approval_id',
    a9_managed_processes: 'handle_id',
    a9_events: 'id',
    a9_workspace_locks: 'workspace_path',
  };
  for (const [table, column] of Object.entries(primaryKeys)) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (!info.some((row) => row.name === column && Number(row.pk) > 0)) {
      throw new Error(`A9 schema v4 table ${table} is missing primary key on ${column}`);
    }
    if (db.prepare(`SELECT 1 AS invalid FROM ${table} WHERE ${column} IS NULL LIMIT 1`).get()) {
      throw new Error(`A9 schema v4 table ${table} contains a null primary identity`);
    }
  }

  const integerColumns = new Set(['a9_meta.id', 'a9_meta.schema_version', 'a9_managed_processes.pid',
    'a9_managed_processes.pid_reuse_possible', 'a9_events.id']);
  const nullableColumns = new Set(['a9_sessions.draft_ciphertext', 'a9_approvals.turn_id', 'a9_approvals.decided_at',
    'a9_managed_processes.pid', 'a9_managed_processes.last_probe_status', 'a9_events.turn_id']);
  for (const [table, columns] of Object.entries(required)) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    for (const column of columns) {
      const row = info.find((item) => item.name === column);
      const identity = `${table}.${column}`;
      const expectedType = integerColumns.has(identity) ? 'INTEGER' : 'TEXT';
      if (String(row?.type ?? '').toUpperCase() !== expectedType) {
        throw new Error(`A9 schema v4 column ${identity} has the wrong type`);
      }
      if (!nullableColumns.has(identity) && primaryKeys[table] !== column && Number(row?.notnull) !== 1) {
        throw new Error(`A9 schema v4 column ${identity} must be NOT NULL`);
      }
    }
  }

  const defaults: Record<string, string> = {
    'a9_sessions.title': "'新对话'",
    'a9_sessions.title_source': "'auto'",
    'a9_sessions.state': "'active'",
    'a9_sessions.metadata_json': "'{}'",
    'a9_turns.outcome_json': "'{}'",
    'a9_managed_processes.pid_reuse_possible': '0',
  };
  for (const [identity, expected] of Object.entries(defaults)) {
    const [table, column] = identity.split('.');
    const row = (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).find((item) => item.name === column);
    if (String(row?.dflt_value ?? '') !== expected) {
      throw new Error(`A9 schema v4 column ${identity} has the wrong default`);
    }
  }

  const requiredChecks: Record<string, string[]> = {
    a9_meta: ['check(id=1)'],
    a9_workspaces: ["check(permission_modein('full_access','review','read_only'))"],
    a9_sessions: ["check(title_sourcein('auto','manual','legacy'))", "check(statein('active','archived'))"],
    a9_tasks: ["check(statusin('active','completed','failed','cancelled','interrupted'))"],
    a9_turns: ["check(statusin('active','completed','completed_with_warnings','blocked','failed','cancelled','interrupted'))"],
    a9_runs: ["check(statusin('active','completed','failed','cancelled','interrupted'))"],
    a9_approvals: ["check(decisionin('pending','approved','denied','interrupted'))"],
    a9_events: ["check(kindin('model','tool'))"],
  };
  for (const [table, fragments] of Object.entries(requiredChecks)) {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as any;
    const normalized = String(row?.sql ?? '').toLowerCase().replace(/[\s\"`\[\]]+/g, '');
    for (const fragment of fragments) {
      if (!normalized.includes(fragment)) throw new Error(`A9 schema v4 table ${table} is missing required CHECK constraint`);
    }
  }

  const indexes: Record<string, { table: string; columns: string[] }> = {
    idx_a9_sessions_workspace: { table: 'a9_sessions', columns: ['workspace_path', 'state', 'last_activated_at'] },
    idx_a9_checkpoints_session: { table: 'a9_checkpoints', columns: ['session_id', 'created_at'] },
    idx_a9_events_session: { table: 'a9_events', columns: ['session_id', 'id'] },
  };
  for (const [index, contract] of Object.entries(indexes)) {
    const indexRow = (db.prepare(`PRAGMA index_list(${contract.table})`).all() as any[])
      .find((row) => row.name === index);
    if (!indexRow || Number(indexRow.unique) !== 0 || Number(indexRow.partial) !== 0) {
      throw new Error(`A9 schema v4 is missing compatible index ${index}`);
    }
    const columns = (db.prepare(`PRAGMA index_info(${index})`).all() as any[])
      .sort((left, right) => Number(left.seqno) - Number(right.seqno)).map((row) => row.name);
    if (columns.length !== contract.columns.length || columns.some((column, i) => column !== contract.columns[i])) {
      throw new Error(`A9 schema v4 index ${index} has the wrong columns`);
    }
  }
  const eventSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='a9_events'").get() as any;
  if (!/\bid\s+integer\s+primary\s+key\s+autoincrement\b/i.test(String(eventSql?.sql ?? ''))) {
    throw new Error('A9 schema v4 a9_events.id must be AUTOINCREMENT');
  }
}

function a8TablesPresentStrict(db: SqliteDatabase): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='a8_workspaces'").get();
  if (!row) return false;
  assertA8WorkspaceSchema(db);
  return true;
}

function assertA8WorkspaceSchema(db: SqliteDatabase): void {
  const info = db.prepare('PRAGMA table_info(a8_workspaces)').all() as any[];
  const columns = info.map((row) => row.name)
    .filter((name): name is string => typeof name === 'string');
  const required = [
    'workspace_id', 'schema_version', 'canonical_path', 'comparison_key',
    'display_name', 'created_at', 'last_opened_at', 'archived_at',
  ];
  const missing = required.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    throw new Error(`A8 workspace schema mismatch; missing columns: ${missing.join(', ')}`);
  }
  const expected: Record<string, { type: 'TEXT' | 'INTEGER'; notnull: boolean; primary?: boolean }> = {
    workspace_id: { type: 'TEXT', notnull: false, primary: true },
    schema_version: { type: 'INTEGER', notnull: true },
    canonical_path: { type: 'TEXT', notnull: true },
    comparison_key: { type: 'TEXT', notnull: true },
    display_name: { type: 'TEXT', notnull: true },
    created_at: { type: 'TEXT', notnull: true },
    last_opened_at: { type: 'TEXT', notnull: false },
    archived_at: { type: 'TEXT', notnull: false },
  };
  for (const [name, contract] of Object.entries(expected)) {
    const row = info.find((item) => item.name === name);
    if (String(row?.type ?? '').toUpperCase() !== contract.type
      || Boolean(Number(row?.notnull)) !== contract.notnull
      || Boolean(Number(row?.pk)) !== Boolean(contract.primary)) {
      throw new Error(`A8 workspace schema mismatch; invalid column contract: ${name}`);
    }
  }
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='a8_workspaces'").get() as any;
  const normalizedSql = String(tableSql?.sql ?? '').toLowerCase().replace(/[\s"`\[\]]+/g, '');
  if (!normalizedSql.includes('check(schema_version=1)')) {
    throw new Error('A8 workspace schema mismatch; schema_version CHECK is missing');
  }
  const uniqueComparisonKey = (db.prepare('PRAGMA index_list(a8_workspaces)').all() as any[]).some((index) => {
    if (Number(index.unique) !== 1 || Number(index.partial) !== 0) return false;
    const names = (db.prepare(`PRAGMA index_info(${String(index.name)})`).all() as any[])
      .sort((left, right) => Number(left.seqno) - Number(right.seqno))
      .map((row) => row.name);
    return names.length === 1 && names[0] === 'comparison_key';
  });
  if (!uniqueComparisonKey) throw new Error('A8 workspace schema mismatch; comparison_key UNIQUE is missing');
}

function tablePresent(db: SqliteDatabase, tableName: string): boolean {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
    return Boolean(row);
  } catch (_err) {
    return false;
  }
}

function readSchemaVersion(db: SqliteDatabase): number | undefined {
  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='a9_meta'",
  ).get() as unknown;
  if (!table) return undefined;
  const rows = db.prepare('SELECT id, schema_version FROM a9_meta').all() as any[];
  if (rows.length !== 1 || rows[0]?.id !== 1 || !Number.isInteger(rows[0]?.schema_version) || rows[0].schema_version < 1) {
    throw new Error('A9_SCHEMA_INVALID: a9_meta 必须且只能包含 id=1 的正整数 schema_version。');
  }
  return rows[0].schema_version;
}

function backupDatabase(db: SqliteDatabase, dataRoot: string): { path: string; sha256: string } {
  const backupDir = path.join(dataRoot, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let suffix = 0;
  let backupPath: string;
  do {
    const uniqueSuffix = suffix === 0 ? '' : `-${suffix}`;
    backupPath = path.join(backupDir, `pre-a9-${stamp}-${process.pid}${uniqueSuffix}.db`);
    suffix += 1;
  } while (fs.existsSync(backupPath));

  try {
    // VACUUM INTO 由 SQLite 生成事务一致的独立数据库；它会读取已提交的 WAL
    // 页面，且不依赖 checkpoint 能否取得排他锁。
    db.prepare('VACUUM INTO ?').run(backupPath);
    const bytes = fs.readFileSync(backupPath);
    if (bytes.length < 16 || bytes.subarray(0, 16).toString('ascii') !== 'SQLite format 3\u0000') {
      throw new Error('迁移备份可读性检查失败：不是有效 SQLite 文件头。');
    }
    return {
      path: backupPath,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (err) {
    // 不把不完整快照暴露为可恢复备份。
    try { fs.rmSync(backupPath, { force: true }); } catch (_cleanupError) { /* best effort */ }
    throw err;
  }
}

function displayNameFor(workspacePath: string): string {
  const base = workspacePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? workspacePath;
  return base.length > 0 ? base : workspacePath;
}

function sameWorkspacePath(left: string, right: string): boolean {
  const looksWindows = path.win32.isAbsolute(left) || path.win32.isAbsolute(right);
  if (looksWindows) {
    return path.win32.normalize(left).replace(/[\\/]+$/, '').toLowerCase()
      === path.win32.normalize(right).replace(/[\\/]+$/, '').toLowerCase();
  }
  return path.resolve(left) === path.resolve(right);
}

function conversationFromRow(row: any): A9ConversationRecord {
  return {
    sessionId: row.session_id,
    workspacePath: row.workspace_path,
    title: row.title,
    titleSource: row.title_source,
    state: row.state,
    activity: row.activity || 'idle',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivatedAt: row.last_activated_at,
  };
}

function normalizeConversationTitle(value: string, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function safeParse(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}
