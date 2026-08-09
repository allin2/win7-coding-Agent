'use strict';

/**
 * SPIKE 04 - 指标统计（P95 / 中位数 / 均值）
 */

/**
 * 计算分位数。
 * @param {number[]} values
 * @param {number} p  0..1
 * @returns {number}  -Infinity if empty
 */
function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0];
  }
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  // 线性插值取更稳健的 P95：按 (n-1) 索引
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) {
    return sorted[lo];
  }
  const frac = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/**
 * 汇总延迟数组：p50 / p95 / p99 / mean / min / max / count / sum。
 * @param {number[]} values 毫秒
 */
function summarize(values) {
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: n,
    sumMs: n ? sum : 0,
    meanMs: n ? sum / n : null,
    minMs: n ? Math.min(...values) : null,
    maxMs: n ? Math.max(...values) : null,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
  };
}

/**
 * 吞吐：count / elapsedMs * 1000 → 每秒。
 */
function throughput(count, elapsedMs) {
  return elapsedMs > 0 ? (count / elapsedMs) * 1000 : 0;
}

module.exports = { percentile, summarize, throughput };
