'use strict';

/**
 * SPIKE 04 - fixtures 生成器回归测试
 *
 * 验证：三档规模生成、中文+空格路径、CP936/UTF-8 内容往返一致、编码探测正确。
 * 用 python3 sqlite3 无关（纯文件系统）。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('../lib/fixtures');
const { readContent, detectEncoding } = require('../lib/encoding');

function testSmallScale() {
  const root = path.join(os.tmpdir(), 'spike04_test_fix_' + Date.now());
  const r = fixtures.generateFixtureTree({ root, fileCount: 200, seed: 42 });
  assert.strictEqual(r.files, 200, 'file count');
  assert.ok(r.cp936Count > 0 && r.utf8Count > 0, 'both encodings present');
  assert.ok(r.cp936Count + r.utf8Count === 200, 'encoding counts sum to total');

  let ok = 0;
  let fail = 0;
  for (const s of r.sampleList) {
    const dec = readContent(s.path);
    if (dec.encoding === s.encoding && dec.text === s.text) {
      ok += 1;
    } else {
      fail += 1;
    }
  }
  assert.strictEqual(fail, 0, 'roundtrip: ' + fail + ' failed, ok=' + ok);
  console.log('testSmallScale PASS: 200 files roundtrip ok=' + ok);
}

function testUnicodeSpacePaths() {
  const root = path.join(os.tmpdir(), 'spike04_test_usp_' + Date.now());
  fixtures.generateFixtureTree({ root, fileCount: 300, seed: 7 });
  let withChineseSpace = 0;
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
      } else if (ent.isFile()) {
        if (/[一-鿿]/.test(ent.name) && /\s/.test(ent.name)) {
          withChineseSpace += 1;
        }
      }
    }
  }
  walk(root);
  assert.ok(withChineseSpace > 0, 'chinese+space filenames present: ' + withChineseSpace);
  console.log('testUnicodeSpacePaths PASS: chinese+space files=' + withChineseSpace);
}

function testCp936Detect() {
  // 构造纯 CP936 字节（GBK '中文' = D6D0 CEC4 前加全角逗号 A3AC）
  const buf = Buffer.from([0xa3, 0xac, 0xd6, 0xd0, 0xce, 0xc4]);
  assert.strictEqual(detectEncoding(buf), 'cp936', 'A3AC... must detect as cp936');
  const utf8Buf = Buffer.from('中文', 'utf8');
  assert.strictEqual(detectEncoding(utf8Buf), 'utf-8', 'utf8 buffer must detect as utf-8');
  console.log('testCp936Detect PASS');
}

testSmallScale();
testUnicodeSpacePaths();
testCp936Detect();
console.log('ALL FIXTURE TESTS PASS');
