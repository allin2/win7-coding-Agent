'use strict';

/**
 * SPIKE 04 - indexer + query 回归测试
 *
 * 用 python3 sqlite3 后端验证：schema 加载、WAL、FTS 双表、全量索引、
 * 增量索引、中文+空格路径查询、trigram 中文子串、有界扫描回退。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../lib/db');
const { initSchema, fullIndex, incrementalIndex, boundedFallbackScan } = require('../lib/indexer');
const { queryPath, queryContent, queryByPath } = require('../lib/query');
const fixtures = require('../lib/fixtures');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema', 'spike04.sql'), 'utf8');
const BACKEND = process.env.A6_DB_BACKEND || 'python-bridge';

async function testFullAndQuery() {
  const base = path.join(os.tmpdir(), 'spike04_test_idx_' + Date.now());
  fs.mkdirSync(base, { recursive: true });
  const sampleRoot = path.join(base, 'samples');
  const dbPath = path.join(base, 'idx.db');
  fixtures.generateFixtureTree({ root: sampleRoot, fileCount: 400, seed: 42 });

  const db = await openDatabase(dbPath, { backend: BACKEND });
  await initSchema(db, SCHEMA);
  assert.ok(/^3\./.test(db.sqliteVersion), 'dev backend sqlite major version 3, got ' + db.sqliteVersion);

  const full = await fullIndex(db, sampleRoot, { timeBudgetMs: 60000 });
  assert.strictEqual(full.indexed, 400, 'full index all files');
  assert.strictEqual(full.scan.truncated, false, 'full scan not truncated');

  // 路径查询：中文+空格路径命中
  const pq = await queryPath(db, '文件');
  assert.ok(pq.rows.length > 0, 'path query 文件 hits');
  const withSpace = pq.rows.filter((r) => /\s/.test(r.file_path) && /[一-鿿]/.test(r.file_path)).length;
  assert.ok(withSpace > 0, 'path query hits chinese+space rows');

  // 内容查询：中文子串（trigram >=3 字符）
  const cq = await queryContent(db, '分布式');
  assert.ok(cq.rows.length > 0, 'content query 分布式 hits');

  // 精确路径查询
  const sample = full.indexed > 0 ? (await (await db.prepare('SELECT file_path FROM files LIMIT 1')).get()).file_path : null;
  if (sample) {
    const exact = await queryByPath(db, sample);
    assert.ok(exact, 'exact path query');
  }

  // 增量索引：修改后 updated。按文件编码回写，避免混合编码（CP936 文件不能追加 UTF-8 字节）
  let modified = 0;
  const { encodeCp936 } = require('../lib/cp936');
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
      } else if (ent.isFile() && modified < 5) {
        const buf = fs.readFileSync(p);
        const isCp936 = buf.length >= 2 && buf[0] === 0xa3 && buf[1] === 0xac;
        const append = '// 增量 分布式测试\n';
        if (isCp936) {
          fs.appendFileSync(p, encodeCp936(append));
        } else {
          fs.appendFileSync(p, Buffer.from(append, 'utf8'));
        }
        modified += 1;
      }
    }
  }
  walk(sampleRoot);
  const inc = await incrementalIndex(db, sampleRoot, { timeBudgetMs: 60000 });
  assert.strictEqual(inc.updated, 5, 'incremental updated 5 files');
  const cq2 = await queryContent(db, '分布式测试');
  assert.ok(cq2.rows.length >= 5, 'incremental content query hits');

  await db.close();
  console.log('testFullAndQuery PASS: full=' + full.indexed + ' inc.updated=' + inc.updated);
}

function testBoundedScan() {
  const root = path.join(os.tmpdir(), 'spike04_test_bs_' + Date.now());
  fixtures.generateFixtureTree({ root, fileCount: 2000, seed: 1 });
  const bounded = boundedFallbackScan(root, { maxFiles: 300, timeBudgetMs: 10000 });
  assert.strictEqual(bounded.truncated, true, 'bounded truncated');
  assert.ok(bounded.files <= 300, 'bounded files within limit');
  const full = boundedFallbackScan(root, { maxFiles: 100000, timeBudgetMs: 60000 });
  assert.strictEqual(full.truncated, false, 'full not truncated');
  assert.strictEqual(full.files, 2000, 'full covers all');
  console.log('testBoundedScan PASS: bounded=' + bounded.files + ' full=' + full.files);
}

testBoundedScan();
testFullAndQuery().then(() => console.log('ALL INDEXER TESTS PASS')).catch((e) => { console.error('FAIL', e); process.exit(1); });
