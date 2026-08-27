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
import { SqliteDatabase } from './sqlite-event-ledger';

export const A9_SCHEMA_VERSION = 3 as const;
export const A9_DEFAULT_RETENTION_DAYS = 90;

export type A9PermissionModeValue = 'full_access' | 'review' | 'read_only';

export interface A9OpenOptions {
  databasePath: string;
  /** 打开函数由宿主注入（生产为 Electron ABI 的 better-sqlite3，测试为真实 adapter）。 */
  openDatabase: (databasePath: string, options?: { readonly?: boolean }) => SqliteDatabase;
  dataRoot: string;
  retentionDays?: number;
}

export type A9OpenOutcome =
  | { status: 'ready'; manager: A9PersistenceManager; backupPath?: string; importedA8Workspaces: number }
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
    // 现有数据库必须先用只读连接探测。尤其是未来 schema，不能在拒绝前切换
    // journal_mode、创建 WAL/SHM sidecar，或触发任何其他写入。
    if (fs.existsSync(options.databasePath)) {
      let probeDb: SqliteDatabase | undefined;
      try {
        probeDb = options.openDatabase(options.databasePath, { readonly: true });
        const probedVersion = readSchemaVersion(probeDb);
        if (probedVersion !== undefined && probedVersion > A9_SCHEMA_VERSION) {
          return {
            status: 'schema_refused',
            reason: `数据库 schema 版本 ${probedVersion} 高于本应用支持的 ${A9_SCHEMA_VERSION}；拒绝覆盖，请使用更新版本的应用打开。`,
            foundVersion: probedVersion,
          };
        }
      } catch (err) {
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
    } catch (err) {
      try { db.close(); } catch (_closeError) { /* best effort */ }
      return {
        status: 'diagnostics',
        error: err instanceof Error ? err.message : String(err),
        hint: 'schema 探测失败，数据库可能损坏；进入受限诊断模式。',
      };
    }

    if (existingVersion !== undefined && existingVersion > A9_SCHEMA_VERSION) {
      try { db.close(); } catch (_closeError) { /* best effort */ }
      return {
        status: 'schema_refused',
        reason: `数据库 schema 版本 ${existingVersion} 高于本应用支持的 ${A9_SCHEMA_VERSION}；拒绝覆盖，请使用更新版本的应用打开。`,
        foundVersion: existingVersion,
      };
    }

    // 迁移前备份（只针对旧 A9 schema 或 A8 导入；当前 schema 重开无需重复备份）。
    let backupPath: string | undefined;
    const hasA8Data = a8TablesPresent(db);
    const hasExistingData = existingVersion !== undefined || hasA8Data;
    const requiresMigrationBackup = hasA8Data
      || (existingVersion !== undefined && existingVersion < A9_SCHEMA_VERSION);
    if (requiresMigrationBackup && fs.existsSync(options.databasePath)) {
      try {
        backupPath = backupDatabase(db, options.dataRoot);
      } catch (err) {
        try { db.close(); } catch (_closeError) { /* best effort */ }
        return {
          status: 'diagnostics',
          error: err instanceof Error ? err.message : String(err),
          hint: '迁移前备份无法创建；原数据库未执行 schema 迁移。产品进入受限诊断模式。',
        };
      }
    }

    // 只有未来 schema 已拒绝、旧 schema 已完成一致性备份后，才允许切换 WAL。
    try {
      db.exec('PRAGMA journal_mode = WAL');
    } catch (_err) {
      // 诊断环境下 WAL 可能失败；后续 schema 操作仍会以结构化 diagnostics 失败。
    }

    const manager = new A9PersistenceManager(db, options.databasePath, options.retentionDays ?? A9_DEFAULT_RETENTION_DAYS);
    try {
      manager.migrateSchema(existingVersion);
      manager.createSchema();
    } catch (err) {
      try { db.close(); } catch (_closeError) { /* best effort */ }
      return {
        status: 'diagnostics',
        error: err instanceof Error ? err.message : String(err),
        hint: 'A9 schema 迁移失败；已回滚且迁移前备份保持可用。产品进入受限诊断模式，禁止继续执行任务。',
      };
    }

    let importedA8Workspaces = 0;
    if (hasExistingData) {
      importedA8Workspaces = manager.importA8Whitelist(db);
    }

    manager.markInterruptionsOnRestart();
    return { status: 'ready', manager, ...(backupPath ? { backupPath } : {}), importedA8Workspaces };
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_a9_sessions_workspace ON a9_sessions (workspace_path);

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
        decision TEXT NOT NULL CHECK (decision IN ('pending','approved','denied')),
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

  /**
   * A9 v3：Turn 增加真实 failed 终态。SQLite 不能原地修改 CHECK，故在同一
   * 事务内重建表；任何一步失败都回滚，open() 返回 diagnostics。
   */
  private migrateSchema(existingVersion: number | undefined): void {
    if (existingVersion === undefined || existingVersion >= 3 || !tablePresent(this.db, 'a9_turns')) return;
    const turnIndexSql = (this.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'a9_turns' AND sql IS NOT NULL",
    ).all() as any[])
      .map((row) => row.sql)
      .filter((sql): sql is string => typeof sql === 'string' && sql.length > 0);
    const migrate = this.db.transaction(() => {
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
      this.db.prepare('UPDATE a9_meta SET schema_version = ?, updated_at = ? WHERE id = 1')
        .run(A9_SCHEMA_VERSION, new Date().toISOString());
    });
    migrate();
  }

  /**
   * A8 白名单迁移：只读导入工作区列表与非敏感设置；凭据、活动任务、Review
   * 提案一律不迁移（A9-ST03）。
   */
  private importA8Whitelist(db: SqliteDatabase): number {
    let imported = 0;
    try {
      const workspaces = db.prepare('SELECT workspace_path FROM a8_workspaces').all() as any[];
      const now = new Date().toISOString();
      const insert = db.prepare(
        'INSERT OR IGNORE INTO a9_workspaces (workspace_path, display_name, permission_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      );
      for (const row of workspaces) {
        // A8 工作区未选择过 A9 模式：不设默认 Full Access，交由首次选择流程。
        insert.run(row.workspace_path, displayNameFor(row.workspace_path), 'review', now, now);
        imported += 1;
      }
    } catch (_err) {
      // A8 表缺失/不可读 → 0 导入，不阻塞 A9。
    }
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
      this.db.prepare('INSERT INTO a9_sessions (session_id, workspace_path, created_at, updated_at, metadata_json) VALUES (?, ?, ?, ?, ?)')
        .run(sessionId, workspacePath, now, now, JSON.stringify(metadata));
    }
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
    return interrupted;
  }

  listInterruptions(): Array<{ kind: 'task' | 'turn' | 'run'; id: string; sessionId: string }> {
    const result: Array<{ kind: 'task' | 'turn' | 'run'; id: string; sessionId: string }> = [];
    for (const row of this.db.prepare("SELECT task_id, session_id FROM a9_tasks WHERE status = 'interrupted'").all() as any[]) {
      result.push({ kind: 'task', id: row.task_id, sessionId: row.session_id });
    }
    for (const row of this.db.prepare("SELECT turn_id, session_id FROM a9_turns WHERE status = 'interrupted'").all() as any[]) {
      result.push({ kind: 'turn', id: row.turn_id, sessionId: row.session_id });
    }
    for (const row of this.db.prepare("SELECT run_id, session_id FROM a9_runs WHERE status = 'interrupted'").all() as any[]) {
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
   * Rebuilds the local conversation surface from persisted facts. This is a
   * read-only projection: callers may render it after restart, but must never
   * replay the prompt, model request, tools, approvals, or side effects.
   */
  listConversationFacts(sessionId: string, limit = 50): Array<{
    taskId: string;
    turnId: string | null;
    requestPrompt: string;
    outcome: string;
    verification: string;
    finalMessage: string;
    createdAt: string;
    updatedAt: string;
  }> {
    const cappedLimit = Math.max(1, Math.min(Number.isFinite(limit) ? Math.floor(limit) : 50, 100));
    const taskRows = this.db.prepare(
      'SELECT task_id, status, created_at, updated_at FROM a9_tasks WHERE session_id = ?',
    ).all(sessionId) as any[];
    const tasks = new Map(taskRows.map((row) => [row.task_id, row]));
    const requestRows = this.db.prepare(`
      SELECT payload_json, created_at FROM a9_events
      WHERE session_id = ? AND kind = 'model' AND event_type = 'conversation.request'
      ORDER BY id DESC LIMIT ?
    `).all(sessionId, cappedLimit) as any[];
    const checkpointRows = this.db.prepare(`
      SELECT c.turn_id, c.created_at, c.payload_json, t.task_id, t.status
      FROM a9_checkpoints c
      LEFT JOIN a9_turns t ON t.turn_id = c.turn_id
      WHERE c.session_id = ?
      ORDER BY c.created_at DESC LIMIT ?
    `).all(sessionId, cappedLimit) as any[];

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
      });
    }
    return Array.from(facts.values())
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(-cappedLimit);
  }

  recordApproval(approval: {
    approvalId: string;
    sessionId: string;
    turnId?: string;
    toolName: string;
    binding: Record<string, unknown>;
    decision: 'pending' | 'approved' | 'denied';
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
      fact.lastProbeStatus ?? null,
      fact.pidReusePossible ? 1 : 0,
    );
  }

  listManagedProcesses(workspacePath: string): Array<{
    handleId: string; pid: number | null; command: string; cwd: string;
    startedAt: string; lastProbeStatus: string | null; pidReusePossible: boolean;
  }> {
    return (this.db.prepare('SELECT * FROM a9_managed_processes WHERE workspace_path = ?').all(workspacePath) as any[]).map((r) => ({
      handleId: r.handle_id,
      pid: r.pid,
      command: r.command,
      cwd: r.cwd,
      startedAt: r.started_at,
      lastProbeStatus: r.last_probe_status,
      pidReusePossible: r.pid_reuse_possible === 1,
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
  const row = db.prepare('SELECT schema_version FROM a9_meta LIMIT 1').get() as any;
  return row?.schema_version;
}

function backupDatabase(db: SqliteDatabase, dataRoot: string): string {
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
    return backupPath;
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

function safeParse(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_err) {
    return {};
  }
}
