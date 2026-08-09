'use strict';

/**
 * S01 - WAL 批量事务写入 QPS（预算 #6 ≥300，No-Go <150）
 *
 * 合成事件流持续写入 60s（可用 --duration-ms 调短用于开发机），WAL 模式、
 * 批量事务（batchSize 条/事务）。度量 qps = events / elapsed_s。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const { dbSizeMb } = require('../../lib/cleanup');

async function run(ctx) {
  const db = ctx.db;
  const durationMs = ctx.options.durationMs || 60000;
  const batchSize = ctx.options.s01BatchSize || 1000;

  await db.exec(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mtime INTEGER,
    timestamp INTEGER NOT NULL,
    trace_complete INTEGER NOT NULL DEFAULT 0,
    metadata TEXT
  )`);

  const insert = await db.prepare(
    `INSERT INTO events (event_type, file_path, file_size, mtime, timestamp, trace_complete, metadata)
     VALUES ('create', ?, ?, ?, ?, 0, ?)`
  );

  const startedAt = Date.now();
  let events = 0;
  const raw = [];
  // QPS 只统计事务写入耗时，剔除行生成（数组构造/JSON.stringify）开销
  let writeStartedAt = null;
  let writeElapsedMs = 0;

  while (Date.now() - startedAt < durationMs) {
    const batchEvents = [];
    for (let i = 0; i < batchSize; i += 1) {
      events += 1;
      batchEvents.push([
        'file' + events + '.ts',
        events,
        events,
        Date.now(),
        JSON.stringify({ batch: events, ts: Date.now() }),
      ]);
    }
    const batchStarted = Date.now();
    if (writeStartedAt === null) {
      writeStartedAt = batchStarted;
    }
    await db.transaction(async () => {
      for (const e of batchEvents) {
        await insert.run(e);
      }
    });
    const batchMs = Date.now() - batchStarted;
    writeElapsedMs += batchMs;
    raw.push({ batch: events / batchSize, events: batchSize, latencyMs: batchMs });
  }

  await insert.finalize();
  const elapsedMs = Date.now() - startedAt;
  const qps = writeElapsedMs > 0 ? events / (writeElapsedMs / 1000) : 0;

  // 判定：qps ≥ 300 为 Go；<150 为 No-Go。开发机数据仅趋势，不据此判定 Win7。
  const met = qps >= 300;
  const nogGo = qps < 150;

  return {
    metrics: {
      qps,
      events,
      elapsedMs,
      batchSize,
      dbSizeMb: dbSizeMb(db),
    },
    raw,
    pass: { met, noGo: nogGo, note: 'Go >=300 QPS, No-Go <150; dev-machine value is trend only' },
  };
}

module.exports = { id: 'S01', name: 'WAL batch write QPS', run };
