'use strict';

/**
 * SPIKE 04 - 内容编码探测与解码（S08）
 *
 * 锁定运行时为 Node 16.17.1 (Electron 22) + better-sqlite3；Node 无内置 CP936 codec，
 * 使用 WHATWG TextDecoder('gb18030'/'gbk') 解码 GBK/CP936 内容。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const { TextDecoder } = require('util');

const UTF8 = 'utf-8';
const CP936 = 'cp936';

const utf8Strict = new TextDecoder(UTF8, { fatal: true, ignoreBOM: true });
const utf8Lossy = new TextDecoder(UTF8, { fatal: false, ignoreBOM: true });
const gb18030 = new TextDecoder('gb18030', { fatal: false });

/**
 * 探测 Buffer 的编码：能严格按 UTF-8 解码 → utf-8，否则视为 CP936/GBK 内容。
 *
 * 已知局限（ADVISORY）：纯 ASCII 或恰好是合法 UTF-8 序列的 GBK 字节流会被判为
 * utf-8（编码探测本质上有歧义）。fixtures 生成的 CP936 文件以全角逗号（GBK A3 AC）
 * 开头规避此歧义——A3 AC 不是合法 UTF-8 多字节序列，保证稳定判为 cp936。
 *
 * @param {Buffer} buf
 * @returns {'utf-8'|'cp936'}
 */
function detectEncoding(buf) {
  try {
    utf8Strict.decode(buf);
    return UTF8;
  } catch (_) {
    return CP936;
  }
}

/**
 * 按给定编码将 Buffer 解码为字符串。
 * @param {Buffer} buf
 * @param {string} encoding  'utf-8' | 'cp936'
 * @returns {string}
 */
function decode(buf, encoding) {
  if (encoding === UTF8) {
    return utf8Lossy.decode(buf);
  }
  return gb18030.decode(buf);
}

/**
 * 读取文件内容并返回 { encoding, text }。
 * @param {string} filePath
 * @param {Buffer} [contentOverride] 测试注入
 * @returns {{encoding: string, text: string}}
 */
function readContent(filePath, contentOverride) {
  const fs = require('fs');
  const buf = contentOverride || fs.readFileSync(filePath);
  const encoding = detectEncoding(buf);
  const text = decode(buf, encoding);
  return { encoding, text };
}

module.exports = {
  UTF8,
  CP936,
  detectEncoding,
  decode,
  readContent,
};
