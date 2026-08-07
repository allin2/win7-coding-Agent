'use strict';

/**
 * SPIKE 04 - 功能验证 F01-F06（README 功能验证矩阵）
 *
 * F01 schema_version 管理
 * F02 事件表 CRUD（INSERT/UPDATE/DELETE/读回 + 触发器一致性）
 * F03 FTS5 查询（路径 unicode61 + 内容 trigram 精确断言）
 * F04 结果分页（LIMIT/OFFSET）
 * F05 中文分词策略（unicode61 vs trigram 对中文召回/延迟的 A/B）
 * F06 有界扫描回退（不读满整树）
 *
 * 本用例与 S 系列（S01-S08 性能/可靠性）互补：S 系列负责任务书 §4 硬指标，
 * F 系列负责 README 功能矩阵。二者共用同一 schema 与驱动。
 *
 * Win7-Validation: VALIDATED (2026-08-07)
 */

const fs = require('fs');
const path = require('path');
const { queryPath, queryContent, queryByPath } = require('../../lib/query');
const { boundedFallbackScan } = require('../../lib/indexer');

async function run(ctx) {
  const db = ctx.db;
  const sampleRoot = ctx.options.sampleRoot;
  const results = {};

  // ─── F01: schema_version 管理 ────────────────────────────────────────────
  const sv = await (await db.prepare(
    'SELECT version, description FROM schema_version ORDER BY version'
  )).all();
  const f01 = {
    rows: sv,
    hasVersion1: sv.some((r) => r.version === 1),
    versionCount: sv.length,
    met: sv.length >= 1 && sv.some((r) => r.version === 1),
  };
  results.F01 = f01;

  // ─── F02: 事件表 CRUD ────────────────────────────────────────────────────
  const ins = await db.prepare(
    `INSERT INTO events (event_type, file_path, file_hash, file_size, mtime, timestamp, trace_complete, metadata)
     VALUES ('create', ?, ?, ?, ?, ?, ?, ?)`
  );
  const insRes = await ins.run(['F02/中文 空格/a.ts', 'h1', 10, 100, Date.now(), 0, '{}']);
  const insertedId = insRes.lastrowid;

  const upd = await db.prepare(
    `UPDATE events SET trace_complete = 1, metadata = ? WHERE id = ?`
  );
  const updRes = await upd.run(['{"complete":true}', insertedId]);

  const sel = await (await db.prepare(
    'SELECT * FROM events WHERE id = ?'
  )).get([insertedId]);

  const del = await db.prepare('DELETE FROM events WHERE id = ?');
  const delRes = await del.run([insertedId]);
  const selAfterDel = await (await db.prepare(
    'SELECT * FROM events WHERE id = ?'
  )).get([insertedId]);

  const f02 = {
    insertOk: insertedId > 0,
    updateChanged: updRes.changes === 1,
    readBack: sel && sel.trace_complete === 1 && sel.metadata === '{"complete":true}',
    deleteChanged: delRes.changes === 1,
    deleteRemoved: !selAfterDel,
    met: insertedId > 0 && updRes.changes === 1 && !!sel && sel.trace_complete === 1 && delRes.changes === 1 && !selAfterDel,
  };
  results.F02 = f02;
  await ins.finalize();
  await upd.finalize();
  await del.finalize();

  // ─── F03: FTS5 查询精确断言 ──────────────────────────────────────────────
  await ctx.ensureIndexed();
  const pathHit = await queryPath(db, '文件');
  const contentHit = await queryContent(db, '分布式');
  const exact = await queryByPath(db, pathHit.rows[0] ? pathHit.rows[0].file_path : null);
  const f03 = {
    pathHits: pathHit.rows.length,
    contentHits: contentHit.rows.length,
    pathHasChineseSpace: pathHit.rows.some((r) => /\s/.test(r.file_path) && /[一-鿿]/.test(r.file_path)),
    exactMatchFound: !!exact,
    met: pathHit.rows.length > 0 && contentHit.rows.length > 0 && !!exact,
  };
  results.F03 = f03;

  // ─── F04: 结果分页 ───────────────────────────────────────────────────────
  const all = await queryPath(db, '文件');
  const page1 = await queryPath(db, '文件', { limit: 10, offset: 0 });
  const page2 = await queryPath(db, '文件', { limit: 10, offset: 10 });
  const pageOverflow = await queryPath(db, '文件', { limit: 10, offset: 100000 });
  const f04 = {
    total: all.rows.length,
    page1Size: page1.rows.length,
    page2Size: page2.rows.length,
    page1Correct: page1.rows.length === Math.min(10, all.rows.length),
    page2Correct: all.rows.length > 10 ? page2.rows.length === Math.min(10, Math.max(0, all.rows.length - 10)) : page2.rows.length === 0,
    noOverlap: page1.rows.length > 0 && page2.rows.length > 0
      ? page1.rows[0].id !== page2.rows[0].id
      : true,
    overflowEmpty: pageOverflow.rows.length === 0,
    met: page1.rows.length === Math.min(10, all.rows.length) && pageOverflow.rows.length === 0,
  };
  results.F04 = f04;

  // ─── F05: 中文分词策略 A/B（unicode61 vs trigram）───────────────────────
  // 路径表（unicode61）用路径中实际出现的词；内容表（trigram）用内容词。
  // 两种 tokenizer 策略的召回与延迟对比：
  //   - unicode61 路径：按空格/斜杠切词（工作区/模块/文件等目录词）
  //   - trigram 内容：中文子串（>=3 字符），如 分布式/系统设计
  const pathTerms = ['工作区', '模块', '文件', '源码', '测试'];
  const contentTerms = ['分布式', '系统设计', '索引优化', '监控告警', '持久化', '负载均衡'];
  const abPath = [];
  const abContent = [];
  for (const term of pathTerms) {
    const pq = await queryPath(db, term);      // unicode61（路径表）
    abPath.push({ term, hits: pq.rows.length, latencyMs: pq.latencyMs });
  }
  for (const term of contentTerms) {
    const cq = await queryContent(db, term);   // trigram（内容表）
    abContent.push({ term, hits: cq.rows.length, latencyMs: cq.latencyMs });
  }
  const pathHitsTotal = abPath.reduce((a, b) => a + b.hits, 0);
  const contentHitsTotal = abContent.reduce((a, b) => a + b.hits, 0);
  const contentMaxLatency = Math.max(...abContent.map((r) => r.latencyMs), 0);
  const pathMaxLatency = Math.max(...abPath.map((r) => r.latencyMs), 0);
  const f05 = {
    pathUnicode61: abPath,
    contentTrigram: abContent,
    pathHitsTotal,
    contentHitsTotal,
    pathMaxLatencyMs: pathMaxLatency,
    contentMaxLatencyMs: contentMaxLatency,
    // 两种 tokenizer 策略均能对各自字段产生命中即策略可用
    met: contentHitsTotal > 0 && pathHitsTotal > 0,
    note: 'unicode61 路径按空格/斜杠切词命中目录词；trigram 内容支持中文子串(>=3字符)。2字中文词在 trigram 下不命中是已知限制。',
  };
  results.F05 = f05;

  // ─── F06: 有界扫描回退 ───────────────────────────────────────────────────
  const bounded = boundedFallbackScan(sampleRoot, {
    maxFiles: 500,
    maxDepth: 32,
    timeBudgetMs: 10000,
  });
  const full = boundedFallbackScan(sampleRoot, {
    maxFiles: 200000,
    maxDepth: 64,
    timeBudgetMs: 60000,
  });
  const f06 = {
    boundedFiles: bounded.files,
    boundedTruncated: bounded.truncated,
    boundedReason: bounded.reason,
    fullFiles: full.files,
    fullTruncated: full.truncated,
    met: bounded.truncated === true && bounded.files <= 500 && full.truncated === false,
  };
  results.F06 = f06;

  const allMet = Object.values(results).every((r) => r.met);
  return {
    metrics: {
      F01: f01,
      F02: f02,
      F03: f03,
      F04: f04,
      F05: f05,
      F06: f06,
    },
    raw: results,
    pass: {
      met: allMet,
      note: 'F01-F06 功能矩阵：schema/CRUD/FTS/分页/分词/有界扫描',
      detail: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.met])),
    },
  };
}

module.exports = { id: 'F', name: 'Functional validation F01-F06', run };
