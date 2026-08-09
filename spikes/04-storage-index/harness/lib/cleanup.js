'use strict';

/**
 * SPIKE 04 - 库体积上限与滚动清理（S06）
 *
 * 预算 #7：单事件/索引库体积 ≤512MB，超限触发滚动清理，清理后恢复/审计不断链。
 *
 * 策略：
 *   - 写入 files 表直到数据库文件超过 limitMb（默认 512MB）。
 *   - 超限后按 indexed_at 升序删除最旧记录（滚动清理），同步触发 FTS 删除触发器。
 *   - 清理后执行 integrity_check，确认 files 与两个 FTS 表行数一致（无断链）。
 *
 * 注意：开发机用 python-bridge 时 512MB 需要大量数据，测试用小 limitMb（如 1MB）
 * 验证逻辑；Win7 实机用 512MB。报告必须标记所用阈值。
 *
 * Win7-Validation: NOT_PERFORMED
 */

/**
 * 持续写入样本事件到 files 表，直到数据库体积超过 limitMb。
 * @param {object} db
 * @param {object} opts
 * @param {number} opts.limitMb
 * @param {number} [opts.rowSize]        每行内容目标字节数（默认 4096）
 * @param {number} [opts.batchSize]      每批行数（默认 200）
 * @param {number} [opts.maxRows]        安全上限（默认 2_000_000）
 * @returns {Promise<object>}
 */
async function growToLimit(db, opts) {
  const limitMb = opts.limitMb;
  const rowSize = opts.rowSize || 4096;
  const batchSize = opts.batchSize || 200;
  const maxRows = opts.maxRows || 2000000;
  const limitBytes = limitMb * 1024 * 1024;

  const insert = await db.prepare(
    `INSERT INTO files (file_path, file_size, mtime, sha256, content_encoding, content, indexed_at, schema_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  // 预生成每行内容（含中文+ASCII，UTF-8）
  const contentChunk = 'A'.repeat(rowSize - 64) + ' 分布式索引清理测试 ';
  const startedAt = Date.now();
  let rows = 0;
  let sizeMb = 0;

  while (rows < maxRows) {
    await db.transaction(async () => {
      for (let i = 0; i < batchSize; i += 1) {
        rows += 1;
        const path = 'grow/file_' + rows + '_中文 空格' + (rows % 2 ? '.ts' : '.py');
        await insert.run([
          path,
          Buffer.byteLength(contentChunk, 'utf8'),
          Date.now(),
          'cleanup-hash-' + rows,
          'utf-8',
          contentChunk + rows,
          Date.now(),
        ]);
      }
    });
    sizeMb = await dbSizeMb(db);
    if (sizeMb >= limitMb) {
      break;
    }
    if (rows % 10000 === 0 && process.env.A6_VERBOSE === '1') {
      process.stderr.write('grow rows=' + rows + ' sizeMb=' + sizeMb.toFixed(1) + '\n');
    }
  }

  await insert.finalize();
  return { rows, sizeMb, limitMb, elapsedMs: Date.now() - startedAt };
}

/**
 * 滚动清理：删除最旧记录直到体积低于 targetMb。
 * @param {object} db
 * @param {object} opts
 * @param {number} opts.targetMb
 * @param {number} [opts.maxRows]   单次清理最多删除行数（防误删）
 * @returns {Promise<object>}
 */
async function rollingCleanup(db, opts) {
  const targetMb = opts.targetMb;
  const maxRows = opts.maxRows || 1000000;
  const del = await db.prepare(
    'DELETE FROM files WHERE id IN (SELECT id FROM files ORDER BY indexed_at ASC, id ASC LIMIT ?)'
  );
  const startedAt = Date.now();
  let deleted = 0;
  let sizeMb = await dbSizeMb(db);

  while (sizeMb > targetMb && deleted < maxRows) {
    const n = Math.min(10000, maxRows - deleted);
    // 单轮删除用一个事务包裹，确保提交（python-bridge 的 run 不再隐式 commit）
    const res = await db.transaction(async () => del.run([n]));
    deleted += res.changes || 0;
    await db.pragma('PRAGMA wal_checkpoint(TRUNCATE)', true);
    sizeMb = await dbSizeMb(db);
    if (!res.changes) {
      break;
    }
  }

  // SQLite DELETE 只释放 freelist 页，.db 文件不回缩。VACUUM 真正回收物理空间，
  // 使"清理后体积回落"可被验证（预算 #7）。大库 VACUUM 耗时，但 S06 只需验证逻辑。
  try {
    await db.exec('VACUUM');
    // VACUUM 后把 WAL 合并回主库并清空，避免 -wal 残留掩盖真实体积
    await db.pragma('PRAGMA wal_checkpoint(TRUNCATE)', true);
  } catch (_) {
    /* VACUUM/checkpoint 失败（如库处于事务中）时保留删除效果，物理回缩不阻塞判定 */
  }
  sizeMb = await dbSizeMb(db);

  await del.finalize();
  return { deleted, sizeMb, targetMb, elapsedMs: Date.now() - startedAt };
}

/**
 * 校验 files 与两个 FTS 表行数一致 + integrity_check。
 * @param {object} db
 * @returns {Promise<object>}
 */
async function verifyConsistency(db) {
  const filesCount = await (await db.prepare('SELECT COUNT(*) AS c FROM files')).get();
  const ftsPathCount = await (await db.prepare('SELECT COUNT(*) AS c FROM files_fts_path')).get();
  const ftsContentCount = await (await db.prepare('SELECT COUNT(*) AS c FROM files_fts_content')).get();
  const integrity = await db.pragma('PRAGMA integrity_check');
  const icOk = integrity[0] && integrity[0].integrity_check === 'ok';
  return {
    files: filesCount.c,
    files_fts_path: ftsPathCount.c,
    files_fts_content: ftsContentCount.c,
    consistent: filesCount.c === ftsPathCount.c && filesCount.c === ftsContentCount.c,
    integrity: icOk,
  };
}

/**
 * 统计数据库体积（MB）。用实际文件大小（.db + -wal + -shm），
 * 因为 page_count 不反映删除后回收、也不含 WAL 未 checkpoint 部分。
 */
function dbSizeMb(db) {
  const fs = require('fs');
  const dbPath = db._dbPath;
  if (!dbPath) {
    return 0;
  }
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      total += fs.statSync(dbPath + suffix).size;
    } catch (_) {
      /* ignore missing */
    }
  }
  return total / (1024 * 1024);
}

module.exports = { growToLimit, rollingCleanup, verifyConsistency, dbSizeMb };
