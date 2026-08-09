'use strict';

/**
 * S04 - 增量索引延迟（任务书 S04）
 *
 * 修改 N 个文件后增量索引：记录延迟；判定增量显著优于全量。
 *
 * 流程：
 *   1. 对样本全量索引（基准）。
 *   2. 随机修改 N 个文件（append 新词）。
 *   3. 增量索引，记录 elapsedMs / filesPerSec。
 *   4. 判定：增量按"变更文件数"计吞吐应远高于全量按"全部文件数"。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const fs = require('fs');
const path = require('path');
const { incrementalIndex, fullIndex } = require('../../lib/indexer');

async function run(ctx) {
  const sampleRoot = ctx.options.sampleRoot;
  const modifyN = ctx.options.s04ModifyN || 20;

  // 全量基准（如果还没做，做一次）
  const full = await fullIndex(ctx.db, sampleRoot, { timeBudgetMs: 600000, batchSize: 500 });
  const fullPerSec = full.indexed / (full.elapsedMs / 1000);

  // 修改 N 个文件
  const modified = [];
  function walk(dir) {
    if (modified.length >= modifyN) {
      return;
    }
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of ents) {
      if (modified.length >= modifyN) {
        return;
      }
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
      } else if (ent.isFile()) {
        // 按文件编码回写，避免 CP936 文件混入 UTF-8 字节
        const buf = fs.readFileSync(p);
        const isCp936 = buf.length >= 2 && buf[0] === 0xa3 && buf[1] === 0xac;
        const append = '// S04 增量修改 分布式索引 追加内容\n';
        if (isCp936) {
          const { encodeCp936 } = require('../../lib/cp936');
          fs.appendFileSync(p, encodeCp936(append));
        } else {
          fs.appendFileSync(p, Buffer.from(append, 'utf8'));
        }
        modified.push(p);
      }
    }
  }
  walk(sampleRoot);

  const inc = await incrementalIndex(ctx.db, sampleRoot, { timeBudgetMs: 600000, batchSize: 500 });
  const incPerSec = (inc.added + inc.updated) / (inc.elapsedMs / 1000);

  // 判定：增量索引应显著快于全量（变更文件数远小于全量文件数）。
  // 全量对全部 N 文件扫描+写，增量对全部 N 做 hash 预查但只重写变更文件。
  // 合理度量：耗时比 incElapsed / fullElapsed < 0.5 即显著更优。
  const ratio = full.elapsedMs > 0 ? inc.elapsedMs / full.elapsedMs : null;
  const met = ratio !== null && ratio < 0.5;
  return {
    metrics: {
      fullFilesPerSec: fullPerSec,
      fullElapsedMs: full.elapsedMs,
      incElapsedMs: inc.elapsedMs,
      incFilesPerSec: incPerSec,
      added: inc.added,
      updated: inc.updated,
      unchanged: inc.unchanged,
      deleted: inc.deleted,
      modifiedCount: modified.length,
      incrementalFaster: met,
      elapsedRatio: ratio,
      speedup: fullPerSec > 0 ? incPerSec / fullPerSec : null,
    },
    raw: { full, inc, modified: modified.slice(0, 10) },
    pass: { met, note: '增量索引耗时 < 全量 50% 即显著更优（只重写变更文件）' },
  };
}

module.exports = { id: 'S04', name: 'Incremental index latency', run };
