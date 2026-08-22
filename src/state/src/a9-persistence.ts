/**
 * @module a9-persistence
 * @description A9 SQLite 状态迁移、Checkpoint 持久化与中断恢复存储 (PRD §8 / ADR-0089)
 */

import { SqliteDatabase } from './sqlite-event-ledger';

export const A9_SCHEMA_VERSION = 2 as const;

export class A9PersistenceManager {
  constructor(private readonly db: SqliteDatabase) {
    this.runMigration();
  }

  /**
   * 执行 A9 增量 schema 迁移
   */
  runMigration(): void {
    // 创建 A9 会话元数据表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS a9_sessions (
        session_id TEXT PRIMARY KEY,
        workspace_path TEXT NOT NULL,
        permission_mode TEXT NOT NULL DEFAULT 'FULL_ACCESS',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `);

    // 创建 A9 Checkpoints 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS a9_checkpoints (
        turn_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);

    // 创建 A9 索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_a9_checkpoints_session
      ON a9_checkpoints (session_id, created_at);
    `);
  }

  /**
   * 保存或更新会话模式
   */
  saveSession(session: {
    sessionId: string;
    workspacePath: string;
    permissionMode: string;
    metadata?: Record<string, unknown>;
  }): void {
    const now = new Date().toISOString();
    const metaStr = JSON.stringify(session.metadata || {});

    const existing = this.db.prepare('SELECT session_id FROM a9_sessions WHERE session_id = ?').get(session.sessionId);
    if (existing) {
      this.db.prepare(`
        UPDATE a9_sessions
        SET workspace_path = ?, permission_mode = ?, updated_at = ?, metadata_json = ?
        WHERE session_id = ?
      `).run(session.workspacePath, session.permissionMode, now, metaStr, session.sessionId);
    } else {
      this.db.prepare(`
        INSERT INTO a9_sessions (session_id, workspace_path, permission_mode, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(session.sessionId, session.workspacePath, session.permissionMode, now, now, metaStr);
    }
  }

  /**
   * 读取会话配置与模式
   */
  getSession(sessionId: string): {
    sessionId: string;
    workspacePath: string;
    permissionMode: string;
    createdAt: string;
    updatedAt: string;
    metadata: Record<string, unknown>;
  } | null {
    const row = this.db.prepare('SELECT * FROM a9_sessions WHERE session_id = ?').get(sessionId) as any;
    if (!row) return null;

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(row.metadata_json);
    } catch (_e) {}

    return {
      sessionId: row.session_id,
      workspacePath: row.workspace_path,
      permissionMode: row.permission_mode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata,
    };
  }

  /**
   * 持久化 Turn Checkpoint
   */
  saveCheckpoint(checkpoint: {
    turnId: string;
    sessionId: string;
    payload: Record<string, unknown>;
  }): void {
    const now = new Date().toISOString();
    const payloadJson = JSON.stringify(checkpoint.payload);

    this.db.prepare(`
      INSERT OR REPLACE INTO a9_checkpoints (turn_id, session_id, created_at, payload_json)
      VALUES (?, ?, ?, ?)
    `).run(checkpoint.turnId, checkpoint.sessionId, now, payloadJson);
  }

  /**
   * 读取 Turn Checkpoint
   */
  getCheckpoint(turnId: string): {
    turnId: string;
    sessionId: string;
    createdAt: string;
    payload: Record<string, unknown>;
  } | null {
    const row = this.db.prepare('SELECT * FROM a9_checkpoints WHERE turn_id = ?').get(turnId) as any;
    if (!row) return null;

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.payload_json);
    } catch (_e) {}

    return {
      turnId: row.turn_id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      payload,
    };
  }

  /**
   * 获取会话的所有 Checkpoint 列表
   */
  listCheckpoints(sessionId: string): Array<{
    turnId: string;
    sessionId: string;
    createdAt: string;
    payload: Record<string, unknown>;
  }> {
    const rows = this.db.prepare(`
      SELECT * FROM a9_checkpoints
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(sessionId) as any[];

    return rows.map((r) => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(r.payload_json);
      } catch (_e) {}

      return {
        turnId: r.turn_id,
        sessionId: r.session_id,
        createdAt: r.created_at,
        payload,
      };
    });
  }
}
