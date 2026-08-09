'use strict';

/**
 * SPIKE 04 - 崩溃恢复回归测试（S02）
 *
 * 验证 WAL 崩溃后：integrity ok、无半批残留、trace_complete 语义可判定。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const assert = require('assert');
const os = require('os');
const path = require('path');
const { runCrashRecovery } = require('../lib/crash-recovery');

const BACKEND = process.env.A6_DB_BACKEND || 'python-bridge';

async function testCrash() {
  const base = path.join(os.tmpdir(), 'spike04_test_crash_' + Date.now());
  const dbPath = path.join(base, 'crash.db');
  const report = await runCrashRecovery({
    dbPath,
    dbOptions: { backend: BACKEND },
    totalBatches: 15,
    batchSize: 200,
    killAtBatch: 7,
    batchPauseMs: 2,
  });
  assert.strictEqual(report.status, 'PASS', 'crash recovery PASS');
  assert.strictEqual(report.integrity, true, 'integrity ok');
  assert.strictEqual(report.partialBatchDetected, false, 'no partial batch');
  assert.ok(report.lastCompleteBatch !== null, 'trace_complete semantics');
  // 已验证：中断批次要么整批存在（含 trace_complete）要么整批不存在
  for (const c of report.batchCounts) {
    assert.ok(c.rows === 200, 'batch ' + c.batch + ' has exactly 200 rows');
  }
  console.log('testCrash PASS: batches=' + report.batchCounts.length + ' lastCompleteBatch=' + report.lastCompleteBatch);
}

testCrash().then(() => console.log('CRASH-RECOVERY TEST PASS')).catch((e) => { console.error('FAIL', e); process.exit(1); });
