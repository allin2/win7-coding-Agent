'use strict';

/**
 * SPIKE 04 - CP936(GBK) 编码器
 *
 * Node 无内置 GBK 编码（TextEncoder 仅 UTF-8），因此用预生成的
 * gbk-table.json（覆盖 fixtures 与 harness 用到的字符集）做字节级编码。
 * 未收录字符显式抛错，避免静默产出混合编码（GBK 流混入 UTF-8 字节会在
 * 重读时解码成乱码），违反 C11。
 *
 * 解码方向使用 WHATWG TextDecoder('gb18030')（见 encoding.js）。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const table = require('./gbk-table.json');

/**
 * 将文本编码为 CP936(GBK) 字节。
 * @param {string} text
 * @returns {Buffer}
 */
function encodeCp936(text) {
  const out = [];
  for (const ch of text) {
    const mapped = table[ch];
    if (Array.isArray(mapped)) {
      if (mapped.length === 1) {
        out.push(mapped[0]);
      } else {
        out.push(mapped[0], mapped[1]);
      }
    } else if (ch === '\n') {
      out.push(0x0a);
    } else if (ch === '\t') {
      out.push(0x09);
    } else {
      const code = ch.codePointAt(0);
      if (code < 0x80) {
        out.push(code);
      } else {
        throw new Error(
          'encodeCp936: 未收录字符无法编码为 GBK: ' + JSON.stringify(ch) +
          ' (U+' + code.toString(16) + '). 请将所需字符加入 lib/gbk-table.json.'
        );
      }
    }
  }
  return Buffer.from(out);
}

module.exports = { encodeCp936 };
