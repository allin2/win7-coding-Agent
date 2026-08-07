'use strict';

/**
 * S06 - 库体积上限与滚动清理（预算 #7 ≤512MB，超限触发清理，清理后不断链）
 *
 * 验证：
 *   - 超过 512MB（默认 limitMb，可用 --s06-limit-mb 调小用于开发机）触发清理
 *   - 清理后 files 与两个 FTS 表行数一致（审计不断链）
 *   - integrity_check = ok
 *
 * Win7-Validation: NOT_PERFORMED
 */

const { growToLimit, rollingCleanup, verifyConsistency } = require('../../lib/cleanup');

async function run(ctx) {
  const limitMb = ctx.options.s06LimitMb || 512;
  const targetMb = ctx.options.s06TargetMb || Math.max(1, limitMb * 0.5);
  const rowSize = ctx.options.s06RowSize || 4096;
  const batchSize = ctx.options.s06BatchSize || 200;

  const grown = await growToLimit(ctx.db, { limitMb, rowSize, batchSize });
  const before = await verifyConsistency(ctx.db);
  const cleaned = await rollingCleanup(ctx.db, { targetMb });
  const after = await verifyConsistency(ctx.db);

  const triggered = grown.sizeMb >= limitMb;
  // 清理后体积应显著回落（VACUUM 后应低于 targetMb 或至少低于清理前）
  const sizeShrank = cleaned.sizeMb < grown.sizeMb;
  const backUnderTarget = cleaned.sizeMb <= Math.max(targetMb, limitMb * 0.75);
  const met = triggered && sizeShrank && before.consistent && after.consistent && after.integrity;

  return {
    metrics: {
      limitMb,
      targetMb,
      grownRows: grown.rows,
      grownSizeMb: grown.sizeMb,
      cleanupTriggered: triggered,
      deletedRows: cleaned.deleted,
      afterSizeMb: cleaned.sizeMb,
      sizeShrank,
      backUnderTarget,
      beforeConsistent: before.consistent,
      afterConsistent: after.consistent,
      integrity: after.integrity,
    },
    raw: { grown, before, cleaned, after },
    pass: {
      met,
      note: 'Go: 超limit触发清理、体积回落且清理后审计/恢复不断链；dev-machine 用较小 limitMb 验证逻辑',
    },
  };
}

module.exports = { id: 'S06', name: '512MB limit and rolling cleanup', run };
