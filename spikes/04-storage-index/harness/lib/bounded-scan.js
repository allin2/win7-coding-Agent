'use strict';

/**
 * SPIKE 04 - 有界目录扫描（S07）
 *
 * 禁止无界读取整棵目录树：所有扫描必须携带显式预算（文件数 / 深度 / 字节 / 时间），
 * 命中任一预算即停止并返回截断标记。这是对照 Phase 2 `readonly.py` 全树扫描瓶颈
 * 的回退路径（任务书 S07）。
 *
 * 实现为迭代式 DFS（显式栈），避免深目录递归栈溢出；目录项用 withFileTypes
 * 一次读取，不逐项 stat。任何异常按结构化错误记录，不静默吞掉。
 *
 * Win7-Validation: NOT_PERFORMED
 */

const fs = require('fs');
const path = require('path');

const STOP_REASONS = {
  MAX_FILES: 'max_files',
  MAX_DEPTH: 'max_depth',
  MAX_BYTES: 'max_bytes',
  TIME_BUDGET: 'time_budget',
  COMPLETE: 'complete',
  ERROR: 'error',
};

/**
 * 有界扫描目录树。
 * @param {string} root 根目录
 * @param {object} opts
 * @param {number} [opts.maxFiles]        最多记录的文件数（默认 10000）
 * @param {number} [opts.maxDepth]        最大目录深度（root 为 0，默认 64）
 * @param {number} [opts.maxBytes]        读取文件内容字节上限（默认 256MB）
 * @param {number} [opts.timeBudgetMs]    时间预算（默认 30000ms）
 * @param {boolean} [opts.readContent]    是否读取文件内容（索引时 true，仅列举时 false）
 * @param {function} [opts.onFile]        每文件回调（用于流式消费），可选
 * @returns {{entries: Array, truncated: boolean, reason: string|null,
 *            files: number, dirs: number, bytesRead: number,
 *            elapsedMs: number, errors: Array}}
 */
function boundedScan(root, opts) {
  const options = opts || {};
  const maxFiles = Number.isFinite(options.maxFiles) ? options.maxFiles : 10000;
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 64;
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : 256 * 1024 * 1024;
  const timeBudgetMs = Number.isFinite(options.timeBudgetMs) ? options.timeBudgetMs : 30000;
  const readContent = options.readContent === true;
  const onFile = typeof options.onFile === 'function' ? options.onFile : null;

  const startedAt = Date.now();
  const entries = [];
  const errors = [];
  let files = 0;
  let dirs = 0;
  let bytesRead = 0;
  let truncated = false;
  let stopReason = null;

  const seen = new Set(); // 防循环符号链接
  const stack = [{ dir: root, depth: 0 }];
  seen.add(resolveKey(root));

  function resolveKey(p) {
    try {
      return fs.realpathSync(p);
    } catch (_) {
      return path.resolve(p);
    }
  }

  // 时间预算检查：目录可能是扁平超大目录（单目录数万文件），若只在目录边界检查
  // 时间预算会被绕过。每处理 TIME_CHECK_ITERS 个文件检查一次时钟。
  const TIME_CHECK_ITERS = 256;
  let iterSinceTimeCheck = 0;

  outer: while (stack.length > 0) {
    if ((Date.now() - startedAt) > timeBudgetMs) {
      stopReason = STOP_REASONS.TIME_BUDGET;
      truncated = true;
      break;
    }

    const { dir, depth } = stack.pop();
    dirs += 1;

    let dirents;
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      errors.push({ path: dir, error: err.message });
      continue;
    }

    // 同深度目录按字母序稳定遍历，减少跨运行抖动
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const ent of dirents) {
      iterSinceTimeCheck += 1;
      if (iterSinceTimeCheck >= TIME_CHECK_ITERS) {
        iterSinceTimeCheck = 0;
        if ((Date.now() - startedAt) > timeBudgetMs) {
          stopReason = STOP_REASONS.TIME_BUDGET;
          truncated = true;
          break outer;
        }
      }
      const fullPath = path.join(dir, ent.name);

      if (ent.isDirectory()) {
        if (depth + 1 > maxDepth) {
          stopReason = STOP_REASONS.MAX_DEPTH;
          truncated = true;
          break outer;
        }
        // 仅对符号链接目录做 realpath 以检测循环；普通目录用绝对路径即可，
        // 避免对每个子目录都付出 realpathSync 系统调用开销（P2 性能修复）。
        const key = ent.isSymbolicLink() ? resolveKey(fullPath) : path.resolve(fullPath);
        if (!seen.has(key)) {
          seen.add(key);
          stack.push({ dir: fullPath, depth: depth + 1 });
        }
        continue;
      }

      if (ent.isFile()) {
        files += 1;
        if (files > maxFiles) {
          stopReason = STOP_REASONS.MAX_FILES;
          truncated = true;
          break outer;
        }

        let entry = { path: fullPath, name: ent.name, size: null, mtimeMs: null, encoding: null, content: null };
        try {
          const st = fs.statSync(fullPath);
          entry.size = st.size;
          entry.mtimeMs = Math.floor(st.mtimeMs);
        } catch (err) {
          errors.push({ path: fullPath, error: err.message });
        }

        if (readContent && entry.size !== null) {
          if (bytesRead + (entry.size || 0) > maxBytes) {
            stopReason = STOP_REASONS.MAX_BYTES;
            truncated = true;
            break outer;
          }
          try {
            const buf = fs.readFileSync(fullPath);
            bytesRead += buf.length;
            // 内容解码延迟到调用方（encoding.js），这里只透传 Buffer
            entry.buffer = buf;
          } catch (err) {
            errors.push({ path: fullPath, error: err.message });
          }
        }

        entries.push(entry);
        if (onFile) {
          onFile(entry);
        }
        if (files >= maxFiles) {
          stopReason = STOP_REASONS.MAX_FILES;
          truncated = true;
          break outer;
        }
      }
      // symlink / socket / fifo：跳过，不做边界外读取
    }
  }

  // readContent=true 时保留 buffer 供调用方消费（索引器依赖，避免二次读盘）；
  // readContent=false 时本就不产生 buffer。调用方负责释放。
  const elapsedMs = Date.now() - startedAt;

  return {
    entries,
    truncated,
    reason: truncated ? stopReason : null,
    files,
    dirs,
    bytesRead,
    elapsedMs,
    errors,
    limit: { maxFiles, maxDepth, maxBytes, timeBudgetMs, readContent },
  };
}

module.exports = { boundedScan, STOP_REASONS };
