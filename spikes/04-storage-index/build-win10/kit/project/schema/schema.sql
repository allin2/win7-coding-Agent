-- SPIKE 04 - SQLite Schema 定义
--
-- 包含：
--   - 事件表（events）
--   - FTS5 虚拟表（全文索引）
--   - schema_version 表（迁移管理）
--
-- Win7-Validation: NOT_PERFORMED

-- ─── schema_version 表 ──────────────────────────────────────────────────────
-- 用于管理 schema 迁移版本

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT
);

-- 初始版本
INSERT OR IGNORE INTO schema_version (version, description) 
VALUES (1, 'Initial schema: events + FTS5');

-- ─── 事件表 ─────────────────────────────────────────────────────────────────
-- 存储文件系统事件（创建、修改、删除等）

CREATE TABLE IF NOT EXISTS events (
    -- 主键：自增 ID
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 事件类型：create, modify, delete, rename
    event_type TEXT NOT NULL CHECK (event_type IN ('create', 'modify', 'delete', 'rename')),
    
    -- 文件路径（支持中文+空格路径）
    file_path TEXT NOT NULL,
    
    -- 文件哈希（用于去重和变更检测）
    file_hash TEXT,
    
    -- 文件大小（字节）
    file_size INTEGER,
    
    -- 文件修改时间（Unix 时间戳）
    mtime INTEGER,
    
    -- 文件创建时间（Unix 时间戳）
    ctime INTEGER,
    
    -- 事件时间戳（Unix 时间戳，毫秒精度）
    timestamp INTEGER NOT NULL,
    
    -- 额外元数据（JSON 格式）
    metadata TEXT,
    
    -- 索引状态：0=未索引, 1=已索引, 2=索引失败
    index_status INTEGER NOT NULL DEFAULT 0,
    
    -- 创建时间
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引：按时间查询
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC);

-- 索引：按文件路径查询
CREATE INDEX IF NOT EXISTS idx_events_file_path ON events (file_path);

-- 索引：按事件类型查询
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);

-- 索引：按索引状态查询（用于增量索引）
CREATE INDEX IF NOT EXISTS idx_events_index_status ON events (index_status);

-- ─── FTS5 虚拟表 ────────────────────────────────────────────────────────────
-- 全文索引表，支持文件路径和内容的全文搜索

-- 注意：FTS5 需要 SQLite 3.9.0+ 且启用 FTS5 扩展
-- Win7 上需要使用 better-sqlite3 或编译时启用 FTS5

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    -- 索引字段
    file_path,
    content,
    
    -- 非索引字段（仅存储）
    event_id UNINDEXED,
    
    -- 分词器配置
    -- 默认使用 unicode61，中文支持需要额外配置
    -- TODO: 实现中文分词器接口
    tokenize='unicode61'
);

-- FTS5 内容同步触发器
-- 当 events 表插入时，同步到 FTS 表
CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
    INSERT INTO events_fts (rowid, file_path, content, event_id)
    VALUES (new.id, new.file_path, new.metadata, new.id);
END;

-- 当 events 表删除时，同步到 FTS 表
CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
    INSERT INTO events_fts (events_fts, rowid, file_path, content, event_id)
    VALUES ('delete', old.id, old.file_path, old.metadata, old.id);
END;

-- 当 events 表更新时，同步到 FTS 表
CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
    INSERT INTO events_fts (events_fts, rowid, file_path, content, event_id)
    VALUES ('delete', old.id, old.file_path, old.metadata, old.id);
    INSERT INTO events_fts (rowid, file_path, content, event_id)
    VALUES (new.id, new.file_path, new.metadata, new.id);
END;

-- ─── 辅助视图 ───────────────────────────────────────────────────────────────

-- 未索引事件视图
CREATE VIEW IF NOT EXISTS v_unindexed_events AS
SELECT * FROM events WHERE index_status = 0;

-- 最近事件视图（最近 1000 条）
CREATE VIEW IF NOT EXISTS v_recent_events AS
SELECT * FROM events 
ORDER BY timestamp DESC 
LIMIT 1000;

-- ─── 清理策略 ───────────────────────────────────────────────────────────────

-- 清理函数：删除超过指定天数的事件
-- 注意：SQLite 不支持存储过程，需要通过应用层实现
-- 示例 SQL：
-- DELETE FROM events WHERE timestamp < strftime('%s', 'now', '-30 days') * 1000;
-- DELETE FROM events WHERE id NOT IN (
--     SELECT id FROM events ORDER BY timestamp DESC LIMIT 100000
-- );
