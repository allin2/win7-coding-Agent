'use strict';

/**
 * S08 - 中文+空格路径与 CP936/UTF-8 内容（任务书 S08）
 *
 * 验证：
 *   - 中文+空格路径能被索引（files 表记录正确 file_path）
 *   - 路径查询能命中含中文+空格路径的行（unicode61）
 *   - CP936 与 UTF-8 内容都能被读取、索引，且内容查询命中对应词
 *   - 编码探测对 fixtures 声明的编码一致
 *
 * Win7-Validation: NOT_PERFORMED
 */

const fs = require('fs');
const path = require('path');
const { queryPath, queryContent } = require('../../lib/query');
const { readContent, detectEncoding } = require('../../lib/encoding');

async function run(ctx) {
  await ctx.ensureIndexed();
  const sampleRoot = ctx.options.sampleRoot;

  // 1. 验证磁盘上存在中文+空格路径文件
  let unicodeSpaceFiles = 0;
  let sampleFile = null;
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
      } else if (ent.isFile()) {
        if (/[一-鿿]/.test(ent.name) && /\s/.test(ent.name)) {
          unicodeSpaceFiles += 1;
          if (!sampleFile) {
            sampleFile = p;
          }
        }
      }
    }
  }
  walk(sampleRoot);

  // 2. 验证 CP936/UTF-8 内容可读且编码探测与写入一致
  let cp936Ok = 0;
  let utf8Ok = 0;
  let cp936Total = 0;
  let utf8Total = 0;
  function walk2(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk2(p);
      } else if (ent.isFile()) {
        const buf = fs.readFileSync(p);
        const detected = detectEncoding(buf);
        // CP936 文件以全角逗号 A3AC 开头 → 必然判 cp936；否则 utf-8
        const expectCp936 = buf.length >= 2 && buf[0] === 0xa3 && buf[1] === 0xac;
        if (expectCp936) {
          cp936Total += 1;
          if (detected === 'cp936') {
            cp936Ok += 1;
          }
        } else {
          utf8Total += 1;
          if (detected === 'utf-8') {
            utf8Ok += 1;
          }
        }
      }
    }
  }
  walk2(sampleRoot);

  // 3. 中文路径查询命中（用已知存在的词：'文件' 在文件名里）
  const pathHit = await queryPath(ctx.db, '文件');
  const pathHitsWithSpace = pathHit.rows.filter((r) => /\s/.test(r.file_path) && /[一-鿿]/.test(r.file_path)).length;

  // 4. 内容查询命中（中文子串，trigram >=3 字符）
  const contentHit = await queryContent(ctx.db, '分布式');
  const contentHitChinese = contentHit.rows.length;

  const met = unicodeSpaceFiles > 0 && pathHitsWithSpace > 0 && cp936Ok === cp936Total && utf8Ok === utf8Total && contentHitChinese > 0;

  return {
    metrics: {
      unicodeSpaceFilesOnDisk: unicodeSpaceFiles,
      cp936Ok: cp936Ok,
      cp936Total: cp936Total,
      utf8Ok: utf8Ok,
      utf8Total: utf8Total,
      pathHits: pathHit.rows.length,
      pathHitsWithSpace: pathHitsWithSpace,
      contentHitsChinese: contentHitChinese,
    },
    raw: {
      sampleFile,
      pathHitSample: pathHit.rows.slice(0, 3),
      contentHitSample: contentHit.rows.slice(0, 3),
    },
    pass: {
      met,
      note: '中文+空格路径可索引/检索；CP936/UTF-8 内容探测与查询正确',
    },
  };
}

module.exports = { id: 'S08', name: 'Chinese+space paths and CP936/UTF-8 content', run };
