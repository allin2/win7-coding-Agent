'use strict';

/**
 * S05 - 检索延迟 P95（预算 #8 P95 ≤1.2s，No-Go >2.5s）
 *
 * 3 万文件库、100 次代表性查询（含中文分词）：
 *   - 路径查询：中文词、英文词、路径片段（unicode61）
 *   - 内容查询：中文子串、中文长词、英文词（trigram）
 * 度量每次查询延迟，取 P95。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const { queryPath, queryContent } = require('../../lib/query');
const { percentile } = require('../../lib/metrics');

async function run(ctx) {
  await ctx.ensureIndexed();
  const reps = ctx.options.s05Reps || 100;
  const queries = [
    { type: 'path', term: '文件' },
    { type: 'path', term: '模块' },
    { type: 'path', term: '中文' },
    { type: 'path', term: '源码' },
    { type: 'path', term: '测试' },
    { type: 'path', term: 'source' },
    { type: 'content', term: '分布式' },
    { type: 'content', term: '系统设计' },
    { type: 'content', term: '索引优化' },
    { type: 'content', term: '事务处理' },
    { type: 'content', term: '持久化' },
    { type: 'content', term: '监控告警' },
  ];

  const latencies = [];
  const raw = [];
  const queryCount = queries.length;

  for (let i = 0; i < reps; i += 1) {
    const q = queries[i % queryCount];
    const result = q.type === 'path'
      ? await queryPath(ctx.db, q.term)
      : await queryContent(ctx.db, q.term);
    latencies.push(result.latencyMs);
    raw.push({ i, type: q.type, term: q.term, latencyMs: result.latencyMs, hits: result.rows.length });
  }

  const p95 = percentile(latencies, 0.95);
  const met = p95 <= 1200;
  const noGo = p95 > 2500;

  return {
    metrics: {
      p95Ms: p95,
      p50Ms: percentile(latencies, 0.5),
      p99Ms: percentile(latencies, 0.99),
      count: reps,
      queryTypes: queryCount,
    },
    raw,
    pass: {
      met,
      noGo,
      note: 'Go P95<=1200ms, No-Go >2500ms; dev-machine value is trend only',
    },
  };
}

module.exports = { id: 'S05', name: 'Query latency P95 (30k files)', run };
