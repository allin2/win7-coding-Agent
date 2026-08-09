-- SPIKE 04 - 统一验证 schema
--
-- 本 schema 是 harness 使用的独立验证基线，用于覆盖 S01-S08：
--   - events        事件流（S01 WAL 批量写入 QPS）
--   - files         文件清单（S03 全量索引 / S04 增量 / S05 检索）
--   - files_fts_path    路径全文索引（unicode61，空格/斜杠分隔的中英文词）
--   - files_fts_content 内容全文索引（trigram，中文子串查询）
--   - meta          运行元数据 / 介质类型声明
--
-- 全部含版本号字段（schema_version）。中文内容统一以 UTF-8 落库（CP936 内容
-- 在读取时转码），满足 C11/C10。
--
-- Win7-Validation: NOT_PERFORMED

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT
);

INSERT OR IGNORE INTO schema_version (version, description)
VALUES (1, 'SPIKE 04 unified validation schema: events + files + FTS');

-- 事件流：WAL 批量写入目标（S01），崩溃恢复判定载体（S02）
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN ('create','modify','delete','rename')),
  file_path TEXT NOT NULL,
  file_hash TEXT,
  file_size INTEGER,
  mtime INTEGER,
  timestamp INTEGER NOT NULL,
  trace_complete INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_file_path ON events (file_path);
CREATE INDEX IF NOT EXISTS idx_events_trace_complete ON events (trace_complete);

-- 文件索引：S03/S04/S05 主体
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  sha256 TEXT,
  content_encoding TEXT NOT NULL DEFAULT 'utf-8',
  content TEXT,
  indexed_at INTEGER NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_files_mtime ON files (mtime);
CREATE INDEX IF NOT EXISTS idx_files_indexed_at ON files (indexed_at);

-- 路径全文索引（unicode61：按空格/斜杠/标点切词，支持中英文路径词）
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts_path USING fts5(
  file_path,
  content='files',
  content_rowid='id',
  tokenize='unicode61'
);

-- 内容全文索引（trigram：中文子串查询；>=3 字符有效）
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts_content USING fts5(
  content,
  content='files',
  content_rowid='id',
  tokenize='trigram'
);

-- 外部内容表同步触发器（保证 files 与两个 FTS 表一致性）
CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
  INSERT INTO files_fts_path(rowid, file_path) VALUES (new.id, new.file_path);
  INSERT INTO files_fts_content(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
  INSERT INTO files_fts_path(files_fts_path, rowid, file_path) VALUES ('delete', old.id, old.file_path);
  INSERT INTO files_fts_content(files_fts_content, rowid, content) VALUES ('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
  INSERT INTO files_fts_path(files_fts_path, rowid, file_path) VALUES ('delete', old.id, old.file_path);
  INSERT INTO files_fts_path(rowid, file_path) VALUES (new.id, new.file_path);
  INSERT INTO files_fts_content(files_fts_content, rowid, content) VALUES ('delete', old.id, old.content);
  INSERT INTO files_fts_content(rowid, content) VALUES (new.id, new.content);
END;

-- 运行元数据（介质类型 / 后端 / 时间）
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

COMMIT;

-- 由 harness 在执行时设置：
-- INSERT OR REPLACE INTO meta(key,value) VALUES ('media_type', 'ssd|hdd|unknown');
-- INSERT OR REPLACE INTO meta(key,value) VALUES ('backend', 'better-sqlite3|python-bridge');
-- INSERT OR REPLACE INTO meta(key,value) VALUES ('started_at_utc', '...');
