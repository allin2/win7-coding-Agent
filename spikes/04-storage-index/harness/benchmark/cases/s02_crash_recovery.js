'use strict';

/**
 * S02 - 崩溃安全：写入中途杀进程后重开（任务书 S02）
 *
 * 通过 crash-recovery harness 验证：WAL 恢复无损坏、trace_complete 语义可判定、
 * 无半批残留。
 *
 * 开发机与 Win7 共用同一逻辑（子进程 fork，同后端）。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { runCrashRecovery } = require('../../lib/crash-recovery');

async function run(ctx) {
  const base = path.join(os.tmpdir(), 'spike04_s02_' + Date.now());
  fs.mkdirSync(base, { recursive: true });
  const dbPath = path.join(base, 'crash.db');
  const backend = ctx.options.backend;

  const report = await runCrashRecovery({
    dbPath,
    dbOptions: { backend },
    totalBatches: ctx.options.s02TotalBatches || 20,
    batchSize: ctx.options.s02BatchSize || 500,
    killAtBatch: ctx.options.s02KillAtBatch || 7,
    batchPauseMs: ctx.options.s02PauseMs || 2,
  });

  const met = report.status === 'PASS';
  return {
    metrics: {
      status: report.status,
      integrity: report.integrity,
      totalRows: report.totalRows,
      completeRows: report.completeRows,
      partialBatchDetected: report.partialBatchDetected,
      lastCompleteBatch: report.lastCompleteBatch,
      killAtBatch: report.killAtBatch,
      batchCounts: report.batchCounts,
    },
    raw: report,
    pass: { met, note: 'PASS = integrity ok + no partial batch + trace_complete semantics' },
  };
}

module.exports = { id: 'S02', name: 'Crash recovery (WAL)', run };
