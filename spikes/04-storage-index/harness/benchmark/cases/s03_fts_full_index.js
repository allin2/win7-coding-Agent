'use strict';

/**
 * S03 - FTS5 首次全量索引吞吐（预算 #5 ≥120 文件/s，上限 3 万文件）
 *
 * 对三档规模样本（3千/1万/3万）做全量索引，度量 files/s。
 * 用 python-bridge（开发机）或 better-sqlite3（Win7 锁定）。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const { fullIndex } = require('../../lib/indexer');

async function run(ctx) {
  const scale = ctx.options.scale; // '3k' | '10k' | '30k'
  const sampleRoot = ctx.options.sampleRoot;
  const result = await fullIndex(ctx.db, sampleRoot, {
    timeBudgetMs: ctx.options.s03TimeBudgetMs || 600000,
    batchSize: 500,
  });

  const filesPerSec = result.indexed / (result.elapsedMs / 1000);
  const met = filesPerSec >= 120;
  const noGo = filesPerSec < 60;

  return {
    metrics: {
      scale,
      files: result.indexed,
      filesPerSec,
      elapsedMs: result.elapsedMs,
      truncated: result.scan.truncated,
      truncationReason: result.scan.truncationReason,
      skipped: result.skipped,
    },
    raw: result,
    pass: {
      met,
      noGo,
      note: 'Go >=120 files/s, No-Go <60; dev-machine value is trend only',
    },
  };
}

module.exports = { id: 'S03', name: 'FTS5 full index throughput', run };
