'use strict';

/**
 * SPIKE 04 - 崩溃恢复 harness（S02）
 *
 * 模拟"写入中途断电/杀进程后重开"：
 *   1. spawn 一个独立子进程，用同一驱动打开库，WAL 模式下分批写入事件，
 *      每批最后一条带 trace_complete=1；批次之间停顿让 WAL 落盘。
 *   2. 在某个批次写入中途 kill 子进程（模拟断电）。
 *   3. 主进程重开库，验证：
 *        - integrity_check = ok
 *        - 已提交的完整批次存在且 trace_complete 可判定
 *        - 中断批次不产生半条记录（WAL 原子性）
 *
 * 子进程使用 child_process.fork，与主进程同 backend（开发机 python-bridge /
 * Win7 better-sqlite3）。崩溃恢复语义依赖 SQLite WAL（锁定与开发机同系列）。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const WORKER = path.join(__dirname, 'crash-writer.js');

/**
 * 运行一次崩溃恢复用例。
 * @param {object} opts
 * @param {string} opts.dbPath
 * @param {object} opts.dbOptions  传给 openDatabase 的后端配置
 * @param {string} opts.schemaSql
 * @param {number} [opts.totalBatches]   计划批次（默认 20）
 * @param {number} [opts.batchSize]      每批事件数（默认 500）
 * @param {number} [opts.killAtBatch]    在第几批中途 kill（默认 7）
 * @param {number} [opts.batchPauseMs]   批间停顿（默认 5ms，开发机足够）
 * @returns {Promise<object>} 恢复报告
 */
async function runCrashRecovery(opts) {
  const dbPath = opts.dbPath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const totalBatches = opts.totalBatches || 20;
  const batchSize = opts.batchSize || 500;
  const killAtBatch = opts.killAtBatch || 7;
  const batchPauseMs = opts.batchPauseMs || 5;

  const worker = fork(WORKER, [], {
    env: Object.assign({}, process.env, {
      A6_CRASH_DB: dbPath,
      A6_CRASH_TOTAL: String(totalBatches),
      A6_CRASH_BATCH: String(batchSize),
      A6_CRASH_KILL_AT: String(killAtBatch),
      A6_CRASH_PAUSE: String(batchPauseMs),
      A6_DB_BACKEND: (opts.dbOptions && opts.dbOptions.backend) || process.env.A6_DB_BACKEND || 'python-bridge',
      A6_BS3_ROOT: process.env.A6_BS3_ROOT || '',
      A6_BS3_NATIVE: process.env.A6_BS3_NATIVE || '',
    }),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  let workerOut = '';
  let workerErr = '';
  worker.stdout.on('data', (d) => { workerOut += d; });
  worker.stderr.on('data', (d) => { workerErr += d; });

  // 等待 worker 发出 KILL_ME 信号（表示已在 kill 批事务内部写至 60%，等待被 SIGKILL）。
  // 收到 KILL_ME 后立即 SIGKILL worker，确认其退出后再 resolve。
  let gotKillSignal = false;
  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.kill('SIGKILL');
        reject(new Error('timeout waiting for KILL_ME signal; stderr=' + workerErr.slice(-500)));
      }
    }, 60000);
    worker.on('message', (m) => {
      if (m === 'KILL_ME' && !settled) {
        gotKillSignal = true;
        clearTimeout(timer);
        settled = true;
        // 立即 SIGKILL，模拟断电（kill 落在 kill 批事务未 COMMIT 的写入中途）
        worker.kill('SIGKILL');
        // 等 worker 退出事件确认，再继续（避免 WAL 尚未落盘就重开库）
        worker.once('exit', () => resolve());
      }
    });
    worker.on('exit', (code, signal) => {
      clearTimeout(timer);
      // 未收到 KILL_ME 就退出 → 异常路径，不得静默吞掉
      if (!settled) {
        settled = true;
        reject(new Error('worker exited without KILL_ME; code=' + code + ' signal=' + signal + ' out=' + workerOut.slice(-300)));
      }
    });
    worker.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });

  // worker 已 SIGKILL。重开库验证。
  const { openDatabase } = require('./db');
  const db = await openDatabase(dbPath, opts.dbOptions);

  try {
    const integrity = await db.pragma('PRAGMA integrity_check');
    const icOk = integrity[0] && integrity[0].integrity_check === 'ok';

    const traceRows = await (await db.prepare(
      'SELECT id, trace_complete FROM events ORDER BY id'
    )).all();
    const totalRows = traceRows.length;
    const completeRows = traceRows.filter((r) => r.trace_complete === 1);

    // 按批次分组，验证整批原子性：
    //   - 每个含 trace_complete=1 的批次，其行数必须恰好 == batchSize（整批提交）
    //   - 任何批次行数既非 0 也非 batchSize 且位于最后完整批次之前 → 半批残留
    // WAL 语义下：中断批次要么整批落盘（含 trace_complete），要么整批回滚。
    const counts = new Map();
    for (const row of traceRows) {
      const b = Math.floor((row.id - 1) / batchSize);
      const c = counts.get(b) || { rows: 0, complete: 0 };
      c.rows += 1;
      if (row.trace_complete === 1) {
        c.complete += 1;
      }
      counts.set(b, c);
    }

    let partialBatchDetected = false;
    let lastCompleteBatch = null;
    for (const [b, c] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      if (c.complete > 0) {
        if (c.rows !== batchSize) {
          partialBatchDetected = true; // 声称完整但行数不足 → 半批
        }
        lastCompleteBatch = b;
      } else if (lastCompleteBatch !== null) {
        // 位于最后完整批次之后且行数不足 → 中断残留
        if (c.rows !== batchSize) {
          partialBatchDetected = true;
        }
      }
    }
    // 若最后完整批次之后有完整行数的批次，则它也应含 trace_complete（否则未提交完）
    for (const [b, c] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      if (lastCompleteBatch !== null && b > lastCompleteBatch && c.rows === batchSize && c.complete === 0) {
        partialBatchDetected = true;
      }
    }

    const consistent = !partialBatchDetected && completeRows.length > 0;
    const report = {
      status: icOk && consistent ? 'PASS' : 'FAIL',
      integrity: icOk,
      totalRows,
      completeRows: completeRows.length,
      partialBatchDetected,
      consistent,
      killAtBatch,
      batchSize,
      totalBatches,
      lastCompleteBatch,
      lastCompleteId: completeRows.length ? Math.max(...completeRows.map((r) => r.id)) : null,
      traceCompleteIds: completeRows.map((r) => r.id).slice(-5),
      batchCounts: [...counts.entries()].map(([b, c]) => ({ batch: b, rows: c.rows, complete: c.complete })),
    };
    return report;
  } finally {
    await db.close();
  }
}

module.exports = { runCrashRecovery };
