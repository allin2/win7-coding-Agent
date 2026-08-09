'use strict';

/**
 * SPIKE 04 - 索引器（全量 / 增量 / 有界回退）
 *
 * 全量索引：对样本目录做有界扫描（S07 约束），逐文件读取内容（UTF-8/CP936 探测），
 *   批量事务写入 files 表 + 双 FTS 表（路径 unicode61 / 内容 trigram）。
 * 增量索引：以 mtime+size+path 哈希判定变更，只处理新增/修改文件，支持删除同步。
 * 有界回退：无索引或索引超限时，回退到有界目录扫描（bounded-scan），不读满整树。
 *
 * 统一使用 db 驱动（better-sqlite3 / python-bridge），SQL 一致。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { boundedScan } = require('./bounded-scan');
const { readContent } = require('./encoding');

const SCHEMA_VERSION = 1;

/**
 * 打开/创建索引数据库并应用 schema。
 * @param {object} db 统一异步驱动
 * @param {string} schemaSql
 */
async function initSchema(db, schemaSql) {
  await db.exec(schemaSql);
}

function pathKey(p) {
  return p.replace(/\\/g, '/');
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * 全量索引：扫描 root 下所有文件并入库。
 * @param {object} db
 * @param {string} root
 * @param {object} [opts]  {maxFiles, maxDepth, maxBytes, timeBudgetMs, batchSize}
 * @returns {Promise<object>} 统计
 */
async function fullIndex(db, root, opts) {
  const options = opts || {};
  const batchSize = options.batchSize || 500;
  const scan = boundedScan(root, {
    maxFiles: options.maxFiles || 100000,
    maxDepth: options.maxDepth || 64,
    maxBytes: options.maxBytes || 512 * 1024 * 1024,
    timeBudgetMs: options.timeBudgetMs || 600000,
    readContent: true,
  });

  const insert = await db.prepare(
    `INSERT INTO files
       (file_path, file_size, mtime, sha256, content_encoding, content, indexed_at, schema_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(file_path) DO UPDATE SET
       file_size = excluded.file_size,
       mtime = excluded.mtime,
       sha256 = excluded.sha256,
       content_encoding = excluded.content_encoding,
       content = excluded.content,
       indexed_at = excluded.indexed_at,
       schema_version = excluded.schema_version`
  );
  const exists = await db.prepare(
    'SELECT sha256 FROM files WHERE file_path = ?'
  );

  const startedAt = Date.now();
  let indexed = 0;
  let skipped = 0;
  let errors = 0;
  let batch = [];

  async function flush() {
    if (batch.length === 0) {
      return;
    }
    await db.transaction(async () => {
      for (const item of batch) {
        await insert.run(item);
      }
    });
    batch = [];
  }

  try {
    for (const entry of scan.entries) {
      if (entry.size === null || entry.size < 0) {
        skipped += 1;
        continue;
      }
      if (!entry.buffer && entry.size !== null) {
        // boundedScan 在 readContent 时会给 buffer；若无则重读
        try {
          entry.buffer = fs.readFileSync(entry.path);
        } catch (err) {
          errors += 1;
          continue;
        }
      }
      const buf = entry.buffer;
      const { encoding, text } = readContent(entry.path, buf);
      // 优先用 boundedScan 已 stat 的 size/mtime；缺失时（罕见 TOCTOU）重取
      let size = entry.size;
      let mtime = entry.mtimeMs;
      if (size === null || mtime === null) {
        try {
          const st = fs.statSync(entry.path);
          size = st.size;
          mtime = Math.floor(st.mtimeMs);
        } catch (err) {
          errors += 1;
          continue;
        }
      }
      const item = [
        pathKey(entry.path),
        size,
        mtime,
        sha256Hex(buf),
        encoding,
        text,
        Date.now(),
        SCHEMA_VERSION,
      ];
      // 跳过内容未变化的重复路径
      const existing = await exists.get([pathKey(entry.path)]);
      if (existing && existing.sha256 === item[3]) {
        skipped += 1;
        continue;
      }
      batch.push(item);
      indexed += 1;
      if (batch.length >= batchSize) {
        await flush();
      }
    }
    await flush();
  } finally {
    await insert.finalize();
    await exists.finalize();
  }

  const elapsedMs = Date.now() - startedAt;
  return {
    mode: 'full',
    root,
    scan: {
      filesScanned: scan.files,
      dirs: scan.dirs,
      truncated: scan.truncated,
      truncationReason: scan.reason,
      errors: scan.errors,
    },
    indexed,
    skipped,
    errors,
    elapsedMs,
    startedAt,
  };
}

/**
 * 增量索引：只处理新增/修改/删除。
 * @param {object} db
 * @param {string} root
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
async function incrementalIndex(db, root, opts) {
  const options = opts || {};
  const scan = boundedScan(root, {
    maxFiles: options.maxFiles || 100000,
    maxDepth: options.maxDepth || 64,
    maxBytes: options.maxBytes || 512 * 1024 * 1024,
    timeBudgetMs: options.timeBudgetMs || 600000,
    readContent: true,
  });

  const upsert = await db.prepare(
    `INSERT INTO files
       (file_path, file_size, mtime, sha256, content_encoding, content, indexed_at, schema_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(file_path) DO UPDATE SET
       file_size = excluded.file_size,
       mtime = excluded.mtime,
       sha256 = excluded.sha256,
       content_encoding = excluded.content_encoding,
       content = excluded.content,
       indexed_at = excluded.indexed_at,
       schema_version = excluded.schema_version`
  );
  const existing = await db.prepare(
    'SELECT sha256, mtime, file_size FROM files WHERE file_path = ?'
  );
  const delByPath = await db.prepare('DELETE FROM files WHERE file_path = ?');

  const startedAt = Date.now();
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let deleted = 0;
  let errors = 0;
  const batch = [];

  async function flush() {
    if (batch.length === 0) {
      return;
    }
    await db.transaction(async () => {
      for (const item of batch) {
        await upsert.run(item);
      }
    });
    batch.length = 0;
  }

  const seen = new Set();
  try {
    for (const entry of scan.entries) {
      const key = pathKey(entry.path);
      seen.add(key);
      if (entry.size === null) {
        continue;
      }
      try {
        const buf = entry.buffer || fs.readFileSync(entry.path);
        // 优先用 boundedScan 已 stat 的 size/mtime；缺失时重取
        let size = entry.size;
        let mtime = entry.mtimeMs;
        if (size === null || mtime === null) {
          try {
            const st = fs.statSync(entry.path);
            size = st.size;
            mtime = Math.floor(st.mtimeMs);
          } catch (statErr) {
            errors += 1;
            continue;
          }
        }
        const hash = sha256Hex(buf);
        const row = await existing.get([key]);
        if (row && row.sha256 === hash) {
          unchanged += 1;
          continue;
        }
        const { encoding, text } = readContent(entry.path, buf);
        batch.push([
          key, size, mtime, hash,
          encoding, text, Date.now(), SCHEMA_VERSION,
        ]);
        if (row) {
          updated += 1;
        } else {
          added += 1;
        }
        if (batch.length >= (options.batchSize || 500)) {
          await flush();
        }
      } catch (err) {
        errors += 1;
      }
    }
    await flush();

    // 删除已不在树中的记录。仅当扫描未截断时执行：
    // 扫描因 maxFiles/maxBytes/timeBudget 提前停止时，seen 只含已扫到的子集，
    // 此时删除会把树中仍存在但未被扫到的索引行误删（数据丢失且不可自愈）。
    if (!scan.truncated) {
      const allRows = await (await db.prepare('SELECT file_path FROM files')).all();
      await db.transaction(async () => {
        for (const row of allRows) {
          if (!seen.has(row.file_path)) {
            await delByPath.run([row.file_path]);
            deleted += 1;
          }
        }
      });
    } else {
      deleted = -1; // 标记：因截断跳过删除同步
    }
  } finally {
    await upsert.finalize();
    await existing.finalize();
    await delByPath.finalize();
  }

  const elapsedMs = Date.now() - startedAt;
  return {
    mode: 'incremental',
    root,
    scan: {
      filesScanned: scan.files,
      dirs: scan.dirs,
      truncated: scan.truncated,
      truncationReason: scan.reason,
    },
    added,
    updated,
    unchanged,
    deleted,
    errors,
    elapsedMs,
    startedAt,
  };
}

/**
 * 有界回退：不建索引时仅做有界扫描，返回目录统计与截断标记。
 * 对照 Phase 2 readonly.py 全树扫描：本函数保证不读满整树。
 * @param {string} root
 * @param {object} [opts]
 */
function boundedFallbackScan(root, opts) {
  const options = opts || {};
  const scan = boundedScan(root, {
    maxFiles: options.maxFiles || 2000,
    maxDepth: options.maxDepth || 32,
    maxBytes: options.maxBytes || 64 * 1024 * 1024,
    timeBudgetMs: options.timeBudgetMs || 10000,
    readContent: false,
  });
  return {
    mode: 'bounded-fallback',
    root,
    files: scan.files,
    dirs: scan.dirs,
    truncated: scan.truncated,
    reason: scan.reason,
    elapsedMs: scan.elapsedMs,
    errors: scan.errors,
  };
}

module.exports = { initSchema, fullIndex, incrementalIndex, boundedFallbackScan, pathKey, sha256Hex };
