/**
 * SPIKE 04 - Schema 迁移管理
 *
 * 管理 SQLite schema 版本迁移。
 *
 * TypeScript target: ES2020
 * Win7-Validation: NOT_PERFORMED
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface Migration {
  version: number;
  description: string;
  up: string;      // SQL for upgrade
  down?: string;   // SQL for downgrade (optional)
}

interface MigrationResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  appliedMigrations: number[];
  error?: string;
}

interface Database {
  exec(sql: string): void;
  prepare(sql: string): { run(...params: any[]): void; get(...params: any[]): any; all(...params: any[]): any[] };
  transaction<T>(fn: () => T): T;
}

// ─── 迁移定义 ────────────────────────────────────────────────────────────────

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema: events + FTS5',
    up: `
      -- 事件表
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL CHECK (event_type IN ('create', 'modify', 'delete', 'rename')),
        file_path TEXT NOT NULL,
        file_hash TEXT,
        file_size INTEGER,
        mtime INTEGER,
        ctime INTEGER,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        index_status INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_events_file_path ON events (file_path);
      CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);
      CREATE INDEX IF NOT EXISTS idx_events_index_status ON events (index_status);

      -- FTS5 虚拟表
      CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
        file_path,
        content,
        event_id UNINDEXED,
        tokenize='unicode61'
      );

      -- 同步触发器
      CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
        INSERT INTO events_fts (rowid, file_path, content, event_id)
        VALUES (new.id, new.file_path, new.metadata, new.id);
      END;

      CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
        INSERT INTO events_fts (events_fts, rowid, file_path, content, event_id)
        VALUES ('delete', old.id, old.file_path, old.metadata, old.id);
      END;

      CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
        INSERT INTO events_fts (events_fts, rowid, file_path, content, event_id)
        VALUES ('delete', old.id, old.file_path, old.metadata, old.id);
        INSERT INTO events_fts (rowid, file_path, content, event_id)
        VALUES (new.id, new.file_path, new.metadata, new.id);
      END;
    `,
    down: `
      DROP TRIGGER IF EXISTS events_au;
      DROP TRIGGER IF EXISTS events_ad;
      DROP TRIGGER IF EXISTS events_ai;
      DROP TABLE IF EXISTS events_fts;
      DROP TABLE IF EXISTS events;
    `,
  },
  // TODO: 添加更多迁移
  // {
  //   version: 2,
  //   description: 'Add Chinese tokenizer support',
  //   up: `...`,
  // },
];

// ─── 迁移管理类 ──────────────────────────────────────────────────────────────

/**
 * Schema 迁移管理器
 */
class SchemaMigrator {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.ensureVersionTable();
  }

  /**
   * 获取当前 schema 版本
   */
  getCurrentVersion(): number {
    try {
      const row = this.db.prepare(
        'SELECT MAX(version) as version FROM schema_version'
      ).get();
      return row?.version || 0;
    } catch {
      return 0;
    }
  }

  /**
   * 获取目标版本（最新迁移版本）
   */
  getTargetVersion(): number {
    return MIGRATIONS.length > 0 ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
  }

  /**
   * 执行迁移（升级到最新版本）
   */
  migrate(): MigrationResult {
    const fromVersion = this.getCurrentVersion();
    const toVersion = this.getTargetVersion();
    const applied: number[] = [];

    if (fromVersion >= toVersion) {
      return {
        success: true,
        fromVersion,
        toVersion: fromVersion,
        appliedMigrations: [],
      };
    }

    try {
      // 获取待应用的迁移
      const pendingMigrations = MIGRATIONS.filter(m => m.version > fromVersion);

      for (const migration of pendingMigrations) {
        this.applyMigration(migration);
        applied.push(migration.version);
      }

      return {
        success: true,
        fromVersion,
        toVersion,
        appliedMigrations: applied,
      };
    } catch (err) {
      return {
        success: false,
        fromVersion,
        toVersion: fromVersion,
        appliedMigrations: applied,
        error: (err as Error).message,
      };
    }
  }

  /**
   * 回滚到指定版本
   */
  rollback(targetVersion: number): MigrationResult {
    const fromVersion = this.getCurrentVersion();
    const applied: number[] = [];

    if (fromVersion <= targetVersion) {
      return {
        success: true,
        fromVersion,
        toVersion: fromVersion,
        appliedMigrations: [],
      };
    }

    try {
      // 获取待回滚的迁移（倒序）
      const migrationsToRollback = MIGRATIONS
        .filter(m => m.version > targetVersion && m.version <= fromVersion)
        .reverse();

      for (const migration of migrationsToRollback) {
        if (migration.down) {
          this.db.transaction(() => {
            this.db.exec(migration.down!);
            this.db.prepare('DELETE FROM schema_version WHERE version = ?').run(migration.version);
          });
          applied.push(migration.version);
        }
      }

      return {
        success: true,
        fromVersion,
        toVersion: targetVersion,
        appliedMigrations: applied.map(v => -v), // 负数表示回滚
      };
    } catch (err) {
      return {
        success: false,
        fromVersion,
        toVersion: fromVersion,
        appliedMigrations: applied.map(v => -v),
        error: (err as Error).message,
      };
    }
  }

  /**
   * 获取待应用的迁移列表
   */
  getPendingMigrations(): Migration[] {
    const currentVersion = this.getCurrentVersion();
    return MIGRATIONS.filter(m => m.version > currentVersion);
  }

  /**
   * 应用单个迁移
   * @private
   */
  private applyMigration(migration: Migration): void {
    this.db.transaction(() => {
      // 执行迁移 SQL
      this.db.exec(migration.up);
      
      // 记录版本
      this.db.prepare(
        'INSERT INTO schema_version (version, description) VALUES (?, ?)'
      ).run(migration.version, migration.description);
    });
  }

  /**
   * 确保 schema_version 表存在
   * @private
   */
  private ensureVersionTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now')),
        description TEXT
      );
    `);
  }
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

export {
  SchemaMigrator,
  Migration,
  MigrationResult,
  Database,
  MIGRATIONS,
};
