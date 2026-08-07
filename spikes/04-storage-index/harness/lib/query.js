'use strict';

/**
 * SPIKE 04 - 查询接口（S05 检索延迟）
 *
 * 提供两类查询：
 *   - 路径查询：files_fts_path（unicode61，空格/斜杠分隔的中英文词）
 *   - 内容查询：files_fts_content（trigram，中文子串；>=3 字符有效）
 *
 * 外部内容表 FTS 查询必须 JOIN 回 files 表取非 FTS 列。
 * 返回 { rows, latencyMs } 以便 benchmark 记录原始延迟。
 *
 * Win7-Validation: NOT_PERFORMED
 */

/**
 * 路径查询。
 * @param {object} db
 * @param {string} term
 * @returns {Promise<{rows: Array, latencyMs: number}>}
 */
async function queryPath(db, term) {
  const startedAt = Date.now();
  const sql =
    'SELECT f.id, f.file_path, f.file_size, f.mtime, f.content_encoding ' +
    'FROM files_fts_path JOIN files f ON f.id = files_fts_path.rowid ' +
    'WHERE files_fts_path MATCH ?';
  const stmt = await db.prepare(sql);
  const rows = await stmt.all([term]);
  await stmt.finalize();
  return { rows, latencyMs: Date.now() - startedAt };
}

/**
 * 内容查询。
 * @param {object} db
 * @param {string} term
 * @returns {Promise<{rows: Array, latencyMs: number}>}
 */
async function queryContent(db, term) {
  const startedAt = Date.now();
  const sql =
    'SELECT f.id, f.file_path, f.file_size, f.mtime, f.content_encoding ' +
    'FROM files_fts_content JOIN files f ON f.id = files_fts_content.rowid ' +
    'WHERE files_fts_content MATCH ?';
  const stmt = await db.prepare(sql);
  const rows = await stmt.all([term]);
  await stmt.finalize();
  return { rows, latencyMs: Date.now() - startedAt };
}

/**
 * 精确路径查询（按 file_path 匹配，用于校验索引存在性）。
 * @param {object} db
 * @param {string} filePath
 * @returns {Promise<object|null>}
 */
async function queryByPath(db, filePath) {
  const stmt = await db.prepare('SELECT * FROM files WHERE file_path = ?');
  const row = await stmt.get([filePath]);
  await stmt.finalize();
  return row;
}

/**
 * 统计数据库大小（页数×页大小，MB）。
 * @param {object} db
 */
async function dbSizeMb(db) {
  const row = await (await db.prepare('PRAGMA page_count')).get();
  const pageSize = await db.pragma('PRAGMA page_size', true);
  return (row.page_count * pageSize) / (1024 * 1024);
}

module.exports = { queryPath, queryContent, queryByPath, dbSizeMb };
