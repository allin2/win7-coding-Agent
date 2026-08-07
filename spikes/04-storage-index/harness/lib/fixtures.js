'use strict';

/**
 * SPIKE 04 - 样本仓库生成器（fixtures）
 *
 * 生成三档规模的混合中英文源码样本：
 *   - 3 千 / 1 万 / 3 万文件
 *   - 中文 + 空格路径（满足 C10）
 *   - 内容混合 UTF-8 与 CP936（GBK）编码（满足 C11 / S08）
 *   - 确定性伪随机（固定种子），可复现
 *
 * 目录形态：root/模块名/子模块名/文件.扩展名
 * 中文路径：使用中文模块名与含空格目录名，模拟真实工作区。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TextEncoder } = require('util');

// 确定性伪随机（xorshift32），避免依赖 Math.random 的全局状态
function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

// 中文词汇池（用于模块名/目录名/内容）
const CHINESE_MODULES = [
  '工作区', '源码', '核心服务', '数据引擎', '前端界面', '后端网关',
  '存储层', '任务调度', '权限系统', '日志审计', '配置中心', '测试框架',
];
const CHINESE_SUBDIRS = [
  '模块 一', '模块 二', '子目录 甲', '子目录 乙', '测试 目录', '构建 输出',
  '公共 组件', '业务 逻辑', '中间 层', '运行时', '扩展 插件', '资源 文件',
];
const CHINESE_CONTENT_WORDS = [
  '分布式', '系统', '设计与实现', '缓存', '索引', '事务', '并发', '性能',
  '容错', '一致性', '负载均衡', '监控', '告警', '持久化', '检索', '分词',
  '中文', '路径', '空格', '编码', 'UTF8', 'CP936', '数据库', 'WAL', 'FTS',
];
const CODE_KEYWORDS = [
  'function', 'class', 'import', 'export', 'const', 'let', 'async', 'await',
  'interface', 'type', 'module', 'require', 'return', 'throw', 'try', 'catch',
  'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
  'int', 'void', 'public', 'private', 'static', 'final', 'new', 'extends',
];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.cs', '.json'];
// CP936 内容后缀（内容以 GBK 字节写入，仍以 .txt/.js 形式存在）
const CP936_HINT = 'CP936';

/**
 * 生成单文件内容（UTF-8 或 CP936）。
 * @param {Function} rng
 * @param {boolean} forceCp936  强制 CP936 编码内容（否则随机混编）
 * @returns {{text: string, encoding: string, buffer: Buffer}}
 */
function makeContent(rng, forceCp936) {
  const lines = [];
  const nLines = 20 + Math.floor(rng() * 60);
  for (let i = 0; i < nLines; i += 1) {
    const kind = rng();
    if (kind < 0.3) {
      const kw = CODE_KEYWORDS[Math.floor(rng() * CODE_KEYWORDS.length)];
      lines.push(`  ${kw} sample${Math.floor(rng() * 1000)};`);
    } else if (kind < 0.6) {
      const w1 = CHINESE_CONTENT_WORDS[Math.floor(rng() * CHINESE_CONTENT_WORDS.length)];
      const w2 = CHINESE_CONTENT_WORDS[Math.floor(rng() * CHINESE_CONTENT_WORDS.length)];
      lines.push(`  // ${w1}${w2} 说明行${i}`);
    } else {
      lines.push(`  const value_${i} = ${Math.floor(rng() * 100000)};`);
    }
  }
  const text = lines.join('\n') + '\n';
  const useCp936 = forceCp936 === true ? true : rng() < 0.3;
  if (useCp936) {
    // 以全角逗号（GBK A3 AC）开头：A3 AC 不是合法 UTF-8 多字节序列，
    // 保证 detectEncoding 稳定判为 cp936，消除编码歧义。
    return { text: '，' + text, encoding: 'cp936', buffer: encodeCp936('，' + text) };
  }
  return { text, encoding: 'utf-8', buffer: Buffer.from(text, 'utf8') };
}

const { encodeCp936 } = require('./cp936');

module.exports = {
  CHINESE_MODULES,
  CHINESE_SUBDIRS,
  CHINESE_CONTENT_WORDS,
  CODE_KEYWORDS,
  EXTENSIONS,
  CP936_HINT,
  createRng,
  makeContent,
  generateFixtureTree,
};

/**
 * 生成样本仓库到指定根目录。
 * @param {object} opts
 * @param {string} opts.root         目标根目录
 * @param {number} opts.fileCount    目标文件数（3000/10000/30000）
 * @param {number} [opts.seed]
 * @param {boolean} [opts.verbose]
 * @returns {{root:string, files:number, cp936Count:number, utf8Count:number,
 *            elapsedMs:number, sampleList:Array}}
 */
function generateFixtureTree(opts) {
  const root = opts.root;
  const fileCount = opts.fileCount;
  const seed = opts.seed || 0x5eed0000;
  const rng = createRng(seed);
  const startedAt = Date.now();

  fs.mkdirSync(root, { recursive: true });
  const sampleList = [];
  let cp936Count = 0;
  let utf8Count = 0;

  // 确定目录结构：模块 × 子目录 展开，尽量平铺到目标文件数
  const moduleCount = Math.max(4, Math.min(24, Math.ceil(fileCount / 300)));
  const perModule = Math.ceil(fileCount / moduleCount);

  let created = 0;
  for (let m = 0; m < moduleCount && created < fileCount; m += 1) {
    const modName = CHINESE_MODULES[m % CHINESE_MODULES.length] + '_m' + m;
    const modDir = path.join(root, modName);
    fs.mkdirSync(modDir, { recursive: true });

    for (let s = 0; s < perModule && created < fileCount; s += 1) {
      const subName = CHINESE_SUBDIRS[s % CHINESE_SUBDIRS.length] + '_s' + s;
      const subDir = path.join(modDir, subName);
      fs.mkdirSync(subDir, { recursive: true });

      // 每子目录若干文件
      const filesInSub = Math.min(6, fileCount - created);
      for (let f = 0; f < filesInSub && created < fileCount; f += 1) {
        const ext = EXTENSIONS[Math.floor(rng() * EXTENSIONS.length)];
        // 部分文件名含中文与空格
        const nameStyle = rng();
        let fileName;
        if (nameStyle < 0.3) {
          fileName = `文件 ${created}${ext}`;
        } else if (nameStyle < 0.5) {
          fileName = `模块 代码 ${created}${ext}`;
        } else {
          fileName = `source_${created}${ext}`;
        }
        const filePath = path.join(subDir, fileName);
        // 约 30% 文件内容为 CP936 编码
        const cp936 = rng() < 0.3;
        const { text, encoding, buffer } = makeContent(rng, cp936);
        fs.writeFileSync(filePath, buffer);
        if (encoding === 'cp936') {
          cp936Count += 1;
        } else {
          utf8Count += 1;
        }
        sampleList.push({ path: filePath, encoding, text });
        created += 1;
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;
  return {
    root,
    files: created,
    cp936Count,
    utf8Count,
    elapsedMs,
    sampleList,
  };
}
