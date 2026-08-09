'use strict';

/**
 * S07 - 有界扫描回退（任务书 S07）
 *
 * 无索引或索引超限时，回退到有界目录扫描且不读满整树。
 *
 * 验证：
 *   - 对样本目录用 maxFiles=500 有界扫描，返回 truncated=true 且 files<=500，
 *     证明未读满整树。
 *   - 对样本目录用足够大的预算全扫描，返回 truncated=false，证明预算正确时
 *     覆盖整树。
 *   - 记录 dirs / files / elapsedMs，对照 Phase 2 全树扫描瓶颈。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const { boundedFallbackScan } = require('../../lib/indexer');

async function run(ctx) {
  const sampleRoot = ctx.options.sampleRoot;

  // 有界（小预算）：应截断
  const bounded = boundedFallbackScan(sampleRoot, {
    maxFiles: ctx.options.s07MaxFiles || 500,
    maxDepth: 32,
    timeBudgetMs: 10000,
  });

  // 全量预算：应覆盖整树（样本实际文件数）
  const full = boundedFallbackScan(sampleRoot, {
    maxFiles: ctx.options.s07FullMaxFiles || 200000,
    maxDepth: 64,
    timeBudgetMs: 60000,
  });

  const boundedTruncated = bounded.truncated === true && bounded.files <= (ctx.options.s07MaxFiles || 500);
  const fullNotTruncated = full.truncated === false;
  const met = boundedTruncated && fullNotTruncated;

  return {
    metrics: {
      boundedFiles: bounded.files,
      boundedTruncated: bounded.truncated,
      boundedReason: bounded.reason,
      boundedDirs: bounded.dirs,
      boundedElapsedMs: bounded.elapsedMs,
      fullFiles: full.files,
      fullTruncated: full.truncated,
      fullDirs: full.dirs,
      fullElapsedMs: full.elapsedMs,
    },
    raw: { bounded, full },
    pass: { met, note: '有界预算必须截断且不读满整树；全量预算必须覆盖整树' },
  };
}

module.exports = { id: 'S07', name: 'Bounded scan fallback', run };
