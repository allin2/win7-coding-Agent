'use strict';

/**
 * SPIKE 04 - 崩溃恢复写进程（被 crash-recovery.js fork）
 *
 * 打开同一 DB，WAL 模式，分批写入 events 事件。每批最后一条 trace_complete=1。
 * 写批序号达到 A6_CRASH_KILL_AT 时，在该批【事务内部中途】向父进程发 KILL_ME，
 * 父进程随即 SIGKILL 本进程（模拟写入中途断电），此时本批事务尚未 COMMIT，
 * 真正考验 WAL 的批中途原子性（整批回滚，不产生半批残留）。
 *
 * 本文件由 crash-recovery.js 以 fork 启动，env 传入全部参数。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const fs = require('fs');
const path = require('path');
const { openDatabase } = require('./db');

async function main() {
  const dbPath = process.env.A6_CRASH_DB;
  const totalBatches = Number(process.env.A6_CRASH_TOTAL || 20);
  const batchSize = Number(process.env.A6_CRASH_BATCH || 500);
  const killAtBatch = Number(process.env.A6_CRASH_KILL_AT || 7);
  const pauseMs = Number(process.env.A6_CRASH_PAUSE || 5);
  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'schema', 'spike04.sql'), 'utf8');

  const db = await openDatabase(dbPath, {
    backend: process.env.A6_DB_BACKEND || 'python-bridge',
  });

  await db.exec(schemaSql);
  await db.pragma('PRAGMA journal_mode = WAL', true);
  const insert = await db.prepare(
    `INSERT INTO events (event_type, file_path, file_hash, file_size, mtime, timestamp, trace_complete, metadata)
     VALUES ('create', ?, ?, ?, ?, ?, ?, ?)`
  );

  let seq = 0;
  for (let b = 1; b <= totalBatches; b += 1) {
    const isKillBatch = b === killAtBatch;

    if (!isKillBatch) {
      // 普通批：整批一个事务，最后一条 trace_complete=1
      const events = [];
      for (let i = 0; i < batchSize; i += 1) {
        seq += 1;
        events.push([
          'file' + seq + '.ts',
          'hash' + seq,
          seq,
          seq,
          Date.now(),
          0,
          JSON.stringify({ batch: b, seq }),
        ]);
      }
      events[events.length - 1][5] = 1; // trace_complete
      await db.transaction(async () => {
        for (const e of events) {
          await insert.run(e);
        }
      });
      if (pauseMs > 0) {
        await new Promise((r) => setTimeout(r, pauseMs));
      }
      continue;
    }

    // kill 批：事务内部写到 60% 时发 KILL_ME 并等待父进程 SIGKILL。
    // 事务保持打开（不 COMMIT），父进程 kill 落在写入中途，验证 WAL 回滚。
    const killed = await new Promise((resolveKilled) => {
      let signaled = false;
      const killTimer = setTimeout(() => {
        // 父进程迟迟未杀（异常路径）→ 放弃等待，回滚该批后退出
        resolveKilled(false);
      }, 30000);
      db.transaction(async () => {
        for (let i = 0; i < batchSize; i += 1) {
          seq += 1;
          if (i === Math.floor(batchSize * 0.6)) {
            // 事务中途通知父进程
            if (typeof process.send === 'function') {
              process.send('KILL_ME');
            }
            signaled = true;
            // 等父进程 SIGKILL（signal 处理器杀掉我们）；若 30s 未收到则超时
            await new Promise((r) => setTimeout(r, 30000));
          }
          await insert.run([
            'file' + seq + '.ts',
            'hash' + seq,
            seq,
            seq,
            Date.now(),
            i === batchSize - 1 ? 1 : 0,
            JSON.stringify({ batch: killAtBatch, seq }),
          ]);
        }
        clearTimeout(killTimer);
        resolveKilled(signaled);
      }).catch(() => {
        clearTimeout(killTimer);
        resolveKilled(signaled);
      });
    });

    if (killed) {
      // 已被父进程 SIGKILL，不会走到这里
      process.exit(0);
    }
    // 超时未被杀：停止
    break;
  }

  await db.close();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exit(1);
});
