/**
 * @module a9-workspace-service
 * @description A9 Full Access 工作区文件工具与服务实现 (PRD §5 / ADR-0089)
 *
 * 数据完整性合同（A9-03）：
 * - 写入使用真实目标编码字节（UTF-8 / UTF-8 BOM / UTF-16LE BOM / CP936），
 *   绝不写 UTF-8 字节却报告 GBK；
 * - edit 保持原编码、BOM、CRLF/LF 与末尾换行；
 * - 写入绑定读取基线（hash+mtime+size）；外部变化后拒绝覆盖并要求重新读取；
 * - 工作区外路径在返回值中醒目标记；
 * - canonical/real path 处理 junction/symlink，防止递归环；
 * - 大文件分段读取，搜索可取消且不同步加载超大文件；
 * - delete permanent:false 进入产品恢复区（可恢复），permanent:true 才真正删除。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  detectEncoding,
  decodeBuffer,
  encodeText,
  reencodePreservingOriginal,
  bomPrefixFor,
  EncodingWriteError,
  WritableEncoding,
} from './encoding';
import { atomicWrite } from './atomic';
import { createWorkspaceIgnoreFilter, IgnoreFilter } from './a9-ignore';
import { CheckpointManager } from './checkpoint-manager';
import { WorkspaceError } from './types';

export interface A9ListResult {
  path: string;
  totalEntries: number;
  truncated: boolean;
  outsideWorkspace: boolean;
  entries: Array<{
    name: string;
    path: string;
    type: 'file' | 'directory' | 'symlink' | 'other';
    sizeBytes?: number;
  }>;
}

export interface A9ReadResult {
  path: string;
  isText: boolean;
  encoding: string;
  startLine: number;
  linesRead: number;
  totalLines: number;
  content: string;
  truncated: boolean;
  outsideWorkspace: boolean;
  /** 当前内容哈希，供后续 write/edit 绑定基线。 */
  contentSha256: string;
  truncationReasons?: Array<'line_limit' | 'byte_limit'>;
}

export interface A9SearchResult {
  pattern: string;
  totalMatches: number;
  truncated: boolean;
  outsideWorkspace: boolean;
  filesScanned: number;
  skippedFiles: number;
  matches: Array<{
    filePath: string;
    lineNumber: number;
    lineText: string;
    contextBefore?: string[];
    contextAfter?: string[];
  }>;
}

export interface A9WriteResult {
  path: string;
  bytesWritten: number;
  encoding: string;
  created: boolean;
  outsideWorkspace: boolean;
}

export interface A9EditResult {
  path: string;
  replaced: boolean;
  encoding: string;
  eol: string;
  outsideWorkspace: boolean;
  diffSummary: string;
}

export interface A9DeleteResult {
  path: string;
  deleted: boolean;
  permanent: boolean;
  outsideWorkspace: boolean;
  /** permanent:false 时的恢复事实。 */
  recoverableVia?: string;
}

interface BaselineFact {
  sha256: string;
  mtimeMs: number;
  size: number;
  encoding?: WritableEncoding;
  bom?: boolean;
}

/** 读取内存与模型预览分别有界；文件大小不再阻断行范围读取。 */
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_READ_PREVIEW_BYTES = 128 * 1024;
const READ_TRUNCATION_NOTICE = '\n[preview truncated: byte limit]';
/** 搜索时单文件解码上限：更大的文件按能力缺失跳过并计数。 */
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;
/** 搜索最多扫描的文件数，防止同步全库扫描。 */
const MAX_SEARCH_FILES = 20_000;
/** 轮前内容基线上限：文件数、单文件字节、总字节（超出部分显式标记不可恢复）。 */
const MAX_BASELINE_FILES = 2000;
const MAX_BASELINE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BASELINE_TOTAL_BYTES = 40 * 1024 * 1024;

export interface TurnContentBaseline {
  turnId: string;
  frozenAt: string;
  files: Record<string, { sha256: string; blobPath: string; size: number }>;
  directories: Record<string, { snapshotPath: string; treeHash: string }>;
  /** F2：基线未覆盖的既有文件事实（size/mtime 供 rename 启发式；不保存内容）。 */
  skipped: Array<{ path: string; reason: 'too_large' | 'backup_failed' | 'outside'; size?: number; mtimeMs?: number }>;
}

export interface ExternalChangeReport {
  changes: Array<{ path: string; kind: 'created' | 'modified' | 'deleted' | 'renamed'; recoverable: boolean; restoredVia?: 'delete-new' | 'restore-original' }>;
  unrecoverable: Array<{ path: string; kind: string; reason: string }>;
}

export class A9WorkspaceService {
  public readonly workspaceRoot: string;
  private readonly ignoreFilter: IgnoreFilter;
  private readonly checkpointManager: CheckpointManager;
  private readonly baselines = new Map<string, BaselineFact>();
  private readonly containsSensitiveData: (value: string | Buffer) => boolean;

  private hashFile(filePath: string): string {
    const digest = crypto.createHash('sha256');
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    try {
      let bytesRead = 0;
      do {
        bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
      } while (bytesRead > 0);
    } finally {
      fs.closeSync(fd);
    }
    return digest.digest('hex');
  }

  constructor(
    workspaceRoot: string,
    options: { containsSensitiveData?: (value: string | Buffer) => boolean } = {},
  ) {
    // 规范化工作区根本身（macOS /var → /private/var、junction 等），
    // 否则 realpathSync 的文件会得到跨前缀的 ../../ 相对路径。
    let canonicalRoot = workspaceRoot;
    try {
      canonicalRoot = fs.realpathSync(workspaceRoot);
    } catch (_err) {
      canonicalRoot = path.resolve(workspaceRoot);
    }
    this.workspaceRoot = canonicalRoot;
    this.containsSensitiveData = options.containsSensitiveData ?? (() => false);
    this.ignoreFilter = createWorkspaceIgnoreFilter(canonicalRoot);
    this.checkpointManager = new CheckpointManager(canonicalRoot, undefined, this.containsSensitiveData);
  }

  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  // -------------------------------------------------------------------------
  // 路径与基线
  // -------------------------------------------------------------------------

  private resolvePath(targetPath: string): { absPath: string; relPath: string; isOutside: boolean } {
    const absPath = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(this.workspaceRoot, targetPath);
    // Canonical/real path：解析 junction、symlink 与 reparse point 的真实位置。
    let realPath = absPath;
    try {
      // 对不存在的路径解析其最近存在祖先，保留末段。
      let probe = absPath;
      const suffixSegments: string[] = [];
      while (!fs.existsSync(probe)) {
        suffixSegments.unshift(path.basename(probe));
        const parent = path.dirname(probe);
        if (parent === probe) break;
        probe = parent;
      }
      const realProbe = fs.realpathSync(probe);
      realPath = suffixSegments.length > 0 ? path.join(realProbe, ...suffixSegments) : realProbe;
    } catch (_err) {
      realPath = absPath;
    }
    const relPath = path.relative(this.workspaceRoot, realPath).replace(/\\/g, '/');
    const isOutside = relPath.startsWith('..') || path.isAbsolute(relPath);
    return { absPath: realPath, relPath, isOutside };
  }

  private fileHash(absPath: string): { sha256: string; mtimeMs: number; size: number } {
    const stat = fs.statSync(absPath);
    const content = fs.readFileSync(absPath);
    return {
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  }

  private recordBaseline(
    relPath: string,
    absPath: string,
    binding?: { encoding: WritableEncoding; bom: boolean },
  ): void {
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      this.baselines.set(relPath, { ...this.fileHash(absPath), ...(binding || {}) });
    } else {
      this.baselines.delete(relPath);
    }
  }

  /**
   * 写入前的基线校验：已存在的文件必须有新鲜读取基线；基线与磁盘不一致时
   * 拒绝覆盖（BASELINE_DRIFT），从未读取时要求先读（READ_REQUIRED）。
   */
  private ensureWritableBaseline(absPath: string, relPath: string): BaselineFact | undefined {
    if (!fs.existsSync(absPath)) return undefined;
    if (!fs.statSync(absPath).isFile()) return undefined;
    const current = this.fileHash(absPath);
    const baseline = this.baselines.get(relPath);
    if (!baseline) {
      throw new WorkspaceError(
        'READ_REQUIRED',
        `文件 ${relPath} 已存在但尚未读取。请先 read 该文件建立基线，再执行写入。`,
      );
    }
    if (baseline.sha256 !== current.sha256 || baseline.size !== current.size) {
      throw new WorkspaceError(
        'BASELINE_DRIFT',
        `文件 ${relPath} 在上次读取后被外部修改（hash 或大小变化）。拒绝覆盖；请重新读取后再写入。`,
      );
    }
    return baseline;
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  async list(targetPath: string = '', options: { recursive?: boolean; maxEntries?: number } = {}): Promise<A9ListResult> {
    const { absPath, relPath, isOutside } = this.resolvePath(targetPath);
    const maxEntries = options.maxEntries || 500;
    const recursive = options.recursive || false;

    if (!fs.existsSync(absPath)) {
      throw new Error(`目录不存在: ${targetPath}`);
    }

    const stat = fs.statSync(absPath);
    if (!stat.isDirectory()) {
      throw new Error(`路径不是目录: ${targetPath}`);
    }

    const entries: A9ListResult['entries'] = [];
    let truncated = false;
    // canonical path 集合防止 junction/symlink 递归环。
    const visitedDirs = new Set<string>([fs.realpathSync(absPath)]);

    const scan = (currentDir: string, currentRel: string, depth: number) => {
      if (entries.length >= maxEntries) {
        truncated = true;
        return;
      }

      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (_e) {
        return;
      }

      dirents.sort((a, b) => a.name.localeCompare(b.name));

      for (const dirent of dirents) {
        if (entries.length >= maxEntries) {
          truncated = true;
          break;
        }

        const itemRel = currentRel ? `${currentRel}/${dirent.name}` : dirent.name;
        if (!isOutside && this.ignoreFilter.isIgnored(itemRel, dirent.isDirectory())) {
          continue;
        }

        const itemAbs = path.join(currentDir, dirent.name);
        let type: 'file' | 'directory' | 'symlink' | 'other' = 'other';
        let sizeBytes: number | undefined;

        if (dirent.isDirectory()) type = 'directory';
        else if (dirent.isFile()) {
          type = 'file';
          try {
            sizeBytes = fs.statSync(itemAbs).size;
          } catch (_e) {
            // ignore
          }
        } else if (dirent.isSymbolicLink()) type = 'symlink';

        entries.push({ name: dirent.name, path: itemRel, type, sizeBytes });

        if (recursive && dirent.isDirectory() && depth < 10) {
          let realChild: string;
          try {
            realChild = fs.realpathSync(itemAbs);
          } catch (_e) {
            continue;
          }
          if (!visitedDirs.has(realChild)) {
            visitedDirs.add(realChild);
            scan(itemAbs, itemRel, depth + 1);
          }
        }
      }
    };

    scan(absPath, relPath === '.' ? '' : relPath, 0);

    return {
      path: relPath || '.',
      totalEntries: entries.length,
      truncated,
      outsideWorkspace: isOutside,
      entries,
    };
  }

  // -------------------------------------------------------------------------
  // read
  // -------------------------------------------------------------------------

  async read(
    targetPath: string,
    options: { startLine?: number; maxLines?: number; encoding?: string; signal?: AbortSignal } = {},
  ): Promise<A9ReadResult> {
    const startLine = options.startLine ?? 1;
    const maxLines = options.maxLines ?? 200;
    if (!Number.isSafeInteger(startLine) || startLine < 1 ||
        !Number.isSafeInteger(maxLines) || maxLines < 1 || maxLines > 2000) {
      throw new TypeError('read requires a positive integer startLine and maxLines in 1..2000');
    }
    if (options.encoding !== undefined && !['utf-8', 'gbk', 'utf-16le', 'binary'].includes(options.encoding)) {
      throw new TypeError('read encoding must be utf-8, gbk, utf-16le or binary');
    }
    const checkCanceled = () => {
      if (options.signal?.aborted) throw new Error('文件读取已取消');
    };
    checkCanceled();
    const { absPath, relPath, isOutside } = this.resolvePath(targetPath);
    this.baselines.delete(relPath);
    const pathBefore = await fs.promises.stat(absPath);
    if (!pathBefore.isFile()) throw new Error(`路径不是文件: ${targetPath}`);
    checkCanceled();
    const handle = await fs.promises.open(absPath, 'r');
    let result: A9ReadResult;
    let baseline: BaselineFact;
    try {
      const before = await handle.stat();
      if (!before.isFile()) throw new Error(`路径不是文件: ${targetPath}`);
      if (before.dev !== pathBefore.dev || before.ino !== pathBefore.ino || before.size !== pathBefore.size ||
          before.mtimeMs !== pathBefore.mtimeMs || before.ctimeMs !== pathBefore.ctimeMs) {
        throw new WorkspaceError('BASELINE_DRIFT', '文件在打开期间变化，请重读。');
      }
      if (!Number.isSafeInteger(before.size)) throw new Error('文件大小超出安全读取范围');
      const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
      let headerSize = 0;
      while (headerSize < Math.min(3, before.size)) {
        checkCanceled();
        const { bytesRead } = await handle.read(buffer, headerSize, Math.min(3, before.size) - headerSize, headerSize);
        if (!bytesRead) throw new WorkspaceError('BASELINE_DRIFT', '文件在读取期间被截断，请重读。');
        headerSize += bytesRead;
      }
      const header = buffer.subarray(0, headerSize);
      const automatic = options.encoding === undefined;
      // Probe entire streams, not a prefix: a long ASCII header may precede GBK.
      const encodings: Array<WritableEncoding | 'binary'> = options.encoding
        ? [options.encoding as WritableEncoding | 'binary']
        : header.subarray(0, 2).equals(Buffer.from([0xff, 0xfe])) ? ['utf-16le']
        : header.subarray(0, 2).equals(Buffer.from([0xfe, 0xff])) ? ['binary']
        : header.equals(Buffer.from([0xef, 0xbb, 0xbf])) ? ['utf-8'] : ['utf-8', 'gbk'];
      let finalResult: A9ReadResult | undefined;
      for (const encoding of encodings) {
        checkCanceled();
        let decoder: InstanceType<typeof TextDecoder> | undefined;
        if (encoding !== 'binary') {
          try { decoder = new TextDecoder(encoding, { fatal: true }); }
          catch { /* Unsupported decoder follows the explicit/automatic failure contract below. */ }
        }
        let valid = decoder !== undefined;
        let gbkPending = false;
        let gbkPairs = 0;
        let gbkValid = true;
        let line = 1;
        let linesRead = 0;
        let lineStarted = false;
        let pendingCR = '';
        let remaining = MAX_READ_PREVIEW_BYTES - Buffer.byteLength(READ_TRUNCATION_NOTICE, 'utf8');
        let byteLimited = false;
        const preview: string[] = [];
        const append = (text: string) => {
          if (byteLimited) return;
          const bytes = Buffer.from(text, 'utf8');
          let end = Math.min(bytes.length, remaining);
          if (end < bytes.length) {
            while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
            byteLimited = true;
          }
          preview.push(bytes.subarray(0, end).toString('utf8'));
          remaining -= end;
        };
        const consume = (text: string, final = false) => {
          text = pendingCR + text;
          pendingCR = !final && text.endsWith('\r') ? '\r' : '';
          if (pendingCR) text = text.slice(0, -1);
          // Each split is bounded by a decoded chunk, even for a gigabyte line.
          const parts = text.replace(/\r\n/g, '\n').split('\n');
          for (let index = 0; index < parts.length; index += 1) {
            if (line >= startLine && line - startLine < maxLines && !byteLimited) {
              if (!lineStarted) {
                const prefix = `${linesRead ? '\n' : ''}${line}: `;
                if (Buffer.byteLength(prefix, 'utf8') > remaining) byteLimited = true;
                else { append(prefix); linesRead += 1; lineStarted = true; }
              }
              append(parts[index]);
            }
            if (index < parts.length - 1) { line += 1; lineStarted = false; }
          }
        };
        const digest = crypto.createHash('sha256');
        let position = 0;
        while (position < before.size) {
          checkCanceled();
          const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, before.size - position), position);
          if (!bytesRead) throw new WorkspaceError('BASELINE_DRIFT', '文件在读取期间被截断，请重读。');
          position += bytesRead;
          const chunk = buffer.subarray(0, bytesRead);
          digest.update(chunk);
          if (automatic && encoding !== 'utf-16le' && chunk.includes(0)) valid = false;
          if (automatic && encoding === 'gbk') {
            for (const byte of chunk) {
              if (gbkPending) {
                if (byte < 0x40 || byte > 0xfe || byte === 0x7f) gbkValid = false;
                gbkPending = false; gbkPairs += 1;
              } else if (byte > 0x7f) {
                if (byte < 0x81 || byte > 0xfe) gbkValid = false;
                gbkPending = true;
              }
            }
          }
          if (valid && decoder) {
            try { consume(decoder.decode(chunk, { stream: true })); }
            catch { valid = false; }
          }
        }
        if (valid && decoder) {
          try { consume(decoder.decode(), true); }
          catch { valid = false; }
        }
        if (automatic && encoding === 'gbk' && (!gbkValid || gbkPending || gbkPairs < 2)) valid = false;
        checkCanceled();
        const after = await handle.stat();
        const current = await fs.promises.stat(absPath);
        if (![after, current].every((stat) => stat.dev === before.dev && stat.ino === before.ino &&
            stat.size === before.size && stat.mtimeMs === before.mtimeMs && stat.ctimeMs === before.ctimeMs)) {
          throw new WorkspaceError('BASELINE_DRIFT', '文件身份或内容在读取期间变化，请重读。');
        }
        const sha256 = digest.digest('hex');
        finalResult = {
          path: relPath, isText: false, encoding: 'binary', startLine: 1, linesRead: 0, totalLines: 0,
          content: `[Binary or ambiguous file: size ${before.size} bytes; specify a known text encoding to read]`,
          truncated: false, outsideWorkspace: isOutside, contentSha256: sha256,
        };
        if (valid) {
          const reasons: Array<'line_limit' | 'byte_limit'> = [];
          if (line - startLine >= maxLines) reasons.push('line_limit');
          if (byteLimited) reasons.push('byte_limit');
          finalResult = {
            ...finalResult, isText: true, encoding, startLine, linesRead, totalLines: line,
            content: preview.join('') + (byteLimited ? READ_TRUNCATION_NOTICE : ''),
            truncated: reasons.length > 0, truncationReasons: reasons,
          };
          break;
        }
        if (!automatic && encoding !== 'binary') {
          throw new WorkspaceError('ENCODING_AMBIGUOUS', `文件 ${relPath} 无法按 ${encoding} 严格解码；请确认编码后重读。`);
        }
      }
      checkCanceled();
      // Only complete, stable scans can become a write baseline, never a preview hash.
      result = finalResult!;
      const hasUtf8Bom = header.length >= 3 && header.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
      const hasUtf16LeBom = header.length >= 2 && header.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]));
      baseline = {
        sha256: result.contentSha256,
        mtimeMs: before.mtimeMs,
        size: before.size,
        ...(result.isText ? {
          encoding: result.encoding as WritableEncoding,
          bom: result.encoding === 'utf-8' ? hasUtf8Bom : result.encoding === 'utf-16le' ? hasUtf16LeBom : false,
        } : {}),
      };
    } finally {
      await handle.close();
    }
    checkCanceled();
    this.baselines.set(relPath, baseline);
    return result;
  }

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  async search(
    pattern: string,
    options: { path?: string; isRegex?: boolean; maxMatches?: number; signal?: AbortSignal } = {},
  ): Promise<A9SearchResult> {
    const { absPath, isOutside } = this.resolvePath(options.path || '');
    const maxMatches = options.maxMatches || 200;
    const isRegex = options.isRegex || false;

    if (!fs.existsSync(absPath)) {
      throw new Error(`搜索路径不存在: ${options.path || ''}`);
    }

    let regex: RegExp;
    try {
      regex = isRegex ? new RegExp(pattern, 'i') : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    } catch (e: any) {
      throw new Error(`搜索正则表达式无效: ${e.message}`);
    }

    const matches: A9SearchResult['matches'] = [];
    let truncated = false;
    let filesScanned = 0;
    let skippedFiles = 0;
    // 迭代遍历 + canonical path 集合：可取消、无递归环、不整体加载。
    const queue: Array<{ dir: string; rel: string }> = [{ dir: absPath, rel: '' }];
    const visitedDirs = new Set<string>([fs.realpathSync(absPath)]);

    while (queue.length > 0) {
      if (options.signal?.aborted) {
        throw new Error('搜索已被用户取消');
      }
      if (matches.length >= maxMatches || filesScanned >= MAX_SEARCH_FILES) {
        truncated = true;
        break;
      }

      const { dir, rel } = queue.shift()!;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        continue;
      }

      for (const dirent of dirents) {
        if (options.signal?.aborted) {
          throw new Error('搜索已被用户取消');
        }
        if (matches.length >= maxMatches || filesScanned >= MAX_SEARCH_FILES) {
          truncated = true;
          break;
        }

        const fullPath = path.join(dir, dirent.name);
        const relPath = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
        if (!isOutside && this.ignoreFilter.isIgnored(relPath, dirent.isDirectory())) continue;

        if (dirent.isDirectory()) {
          let realChild: string;
          try {
            realChild = fs.realpathSync(fullPath);
          } catch (_e) {
            continue;
          }
          if (!visitedDirs.has(realChild)) {
            visitedDirs.add(realChild);
            queue.push({ dir: fullPath, rel: rel ? `${rel}/${dirent.name}` : dirent.name });
          }
          continue;
        }
        if (!dirent.isFile()) continue;

        filesScanned += 1;
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch (_e) {
          skippedFiles += 1;
          continue;
        }
        if (stat.size > MAX_SEARCH_FILE_BYTES) {
          skippedFiles += 1;
          continue;
        }
        try {
          const buf = fs.readFileSync(fullPath);
          const detection = detectEncoding(buf);
          if (detection.encoding === 'ambiguous') continue;
          const text = decodeBuffer(buf, detection.encoding as WritableEncoding);
          if (text === undefined) continue;

          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push({
                filePath: relPath,
                lineNumber: i + 1,
                lineText: lines[i],
                contextBefore: i > 0 ? [lines[i - 1]] : [],
                contextAfter: i < lines.length - 1 ? [lines[i + 1]] : [],
              });
              if (matches.length >= maxMatches) {
                truncated = true;
                break;
              }
            }
          }
        } catch (_e) {
          skippedFiles += 1;
        }
      }
    }

    return {
      pattern,
      totalMatches: matches.length,
      truncated,
      outsideWorkspace: isOutside,
      filesScanned,
      skippedFiles,
      matches,
    };
  }

  // -------------------------------------------------------------------------
  // write
  // -------------------------------------------------------------------------

  async write(
    targetPath: string,
    content: string,
    options: { encoding?: string; turnId?: string } = {},
  ): Promise<A9WriteResult> {
    const { absPath, relPath, isOutside } = this.resolvePath(targetPath);
    const turnId = options.turnId || 'turn-default';
    const isNew = !fs.existsSync(absPath);

    if (!isNew) {
      // 覆盖已有文件必须绑定新鲜读取基线。
      this.ensureWritableBaseline(absPath, relPath);
    }

    this.checkpointManager.recordPreMutation(turnId, relPath);

    let buffer: Buffer;
    let encodingUsed: string;
    if (options.encoding && options.encoding !== 'utf-8') {
      encodingUsed = options.encoding;
      try {
        buffer = encodeText(content, options.encoding as WritableEncoding);
      } catch (err) {
        if (err instanceof EncodingWriteError) {
          throw new WorkspaceError('ENCODING_WRITE_UNSUPPORTED', err.message);
        }
        throw err;
      }
    } else if (!isNew) {
      // 未显式指定编码时保持原文件编码与 BOM。
      const raw = fs.readFileSync(absPath);
      const detection = detectEncoding(raw);
      const baseline = this.baselines.get(relPath);
      const boundEncoding = baseline && baseline.encoding;
      if (!boundEncoding && detection.encoding === 'ambiguous') {
        throw new WorkspaceError(
          'ENCODING_AMBIGUOUS',
          `文件 ${relPath} 的现有编码无法可靠识别；请显式指定 encoding 或先以 binary 查看。`,
        );
      }
      const encoding = boundEncoding || detection.encoding as WritableEncoding;
      const body = encodeText(content, encoding);
      const bom = bomPrefixFor(encoding, boundEncoding ? baseline!.bom === true : detection.bom);
      buffer = bom.length > 0 ? Buffer.concat([bom, body]) : body;
      encodingUsed = encoding;
    } else {
      // 新文件默认 UTF-8 无 BOM。
      buffer = encodeText(content, 'utf-8');
      encodingUsed = 'utf-8';
    }

    this.ensureParentDir(absPath);
    atomicWrite(absPath, buffer);

    this.checkpointManager.recordPostMutation(turnId, relPath, isNew ? 'create' : 'modify');
    const writtenBom = encodingUsed === 'utf-8'
      ? buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))
      : encodingUsed === 'utf-16le' && buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]));
    this.recordBaseline(relPath, absPath, { encoding: encodingUsed as WritableEncoding, bom: writtenBom });

    return {
      path: relPath,
      bytesWritten: buffer.length,
      encoding: encodingUsed,
      created: isNew,
      outsideWorkspace: isOutside,
    };
  }

  // -------------------------------------------------------------------------
  // edit
  // -------------------------------------------------------------------------

  async edit(
    targetPath: string,
    oldText: string,
    newText: string,
    options: { turnId?: string } = {},
  ): Promise<A9EditResult> {
    const { absPath, relPath, isOutside } = this.resolvePath(targetPath);
    const turnId = options.turnId || 'turn-default';

    if (!fs.existsSync(absPath)) {
      throw new Error(`待编辑文件不存在: ${targetPath}`);
    }
    // 编辑必须基于新鲜读取基线；外部变化后拒绝覆盖。
    const baseline = this.ensureWritableBaseline(absPath, relPath)!;

    this.checkpointManager.recordPreMutation(turnId, relPath);

    const raw = fs.readFileSync(absPath);
    const detection = detectEncoding(raw);
    const encoding = baseline.encoding || (detection.encoding === 'ambiguous' ? undefined : detection.encoding as WritableEncoding);
    if (!encoding) {
      throw new WorkspaceError('ENCODING_AMBIGUOUS', `文件 ${relPath} 编码无法可靠识别，拒绝文本编辑以避免损坏原始字节。`);
    }
    const originalText = decodeBuffer(raw, encoding);
    if (originalText === undefined) {
      throw new WorkspaceError('ENCODING_AMBIGUOUS', `文件 ${relPath} 按 ${encoding} 解码失败，拒绝编辑。`);
    }

    const firstIndex = originalText.indexOf(oldText);
    if (firstIndex === -1) {
      throw new Error(`未在 ${relPath} 中找到匹配的 oldText，请重新读取文件并确认锚点内容。`);
    }

    const secondIndex = originalText.indexOf(oldText, firstIndex + oldText.length);
    if (secondIndex !== -1) {
      throw new Error(`oldText 在 ${relPath} 中存在多处匹配，请提供包含更多上下文的唯一文本块。`);
    }

    const replacedText = originalText.slice(0, firstIndex) + newText + originalText.slice(firstIndex + oldText.length);

    // 保持原编码、BOM、EOL 与末尾换行。
    let preserved: { buffer: Buffer; encoding: WritableEncoding; eol: string };
    try {
      const result = reencodePreservingOriginal(raw, originalText, replacedText, {
        encoding,
        bom: baseline.encoding ? baseline.bom === true : detection.bom,
      });
      preserved = { buffer: result.buffer, encoding: result.encoding, eol: result.eol };
    } catch (err) {
      if (err instanceof EncodingWriteError) {
        throw new WorkspaceError('ENCODING_WRITE_UNSUPPORTED', err.message);
      }
      throw err;
    }

    this.ensureParentDir(absPath);
    atomicWrite(absPath, preserved.buffer);

    this.checkpointManager.recordPostMutation(turnId, relPath, 'modify');
    this.recordBaseline(relPath, absPath, { encoding: preserved.encoding, bom: preserved.buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || preserved.buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe])) });

    return {
      path: relPath,
      replaced: true,
      encoding: preserved.encoding,
      eol: preserved.eol,
      outsideWorkspace: isOutside,
      diffSummary: `Replaced anchor of length ${oldText.length} with ${newText.length} characters (encoding ${preserved.encoding} preserved).`,
    };
  }

  // -------------------------------------------------------------------------
  // copy / move
  // -------------------------------------------------------------------------

  async copy(
    sourcePath: string,
    destinationPath: string,
    options: { overwrite?: boolean; turnId?: string } = {},
  ): Promise<{ source: string; destination: string; copied: boolean; outsideWorkspace: boolean }> {
    const { absPath: srcAbs, relPath: srcRel, isOutside: srcOutside } = this.resolvePath(sourcePath);
    const { absPath: destAbs, relPath: destRel, isOutside: destOutside } = this.resolvePath(destinationPath);
    const turnId = options.turnId || 'turn-default';

    if (!fs.existsSync(srcAbs)) {
      throw new Error(`源文件/目录不存在: ${sourcePath}`);
    }

    const destExisted = fs.existsSync(destAbs);
    if (destExisted && !options.overwrite) {
      throw new Error(`目标已存在且 overwrite 未开启: ${destinationPath}`);
    }
    if (destExisted && fs.statSync(destAbs).isFile()) {
      // 覆盖已有目标必须绑定新鲜基线，撤销要能恢复原目标。
      this.ensureWritableBaseline(destAbs, destRel);
    }

    this.checkpointManager.recordPreMutation(turnId, destRel);

    this.ensureParentDir(destAbs);
    fs.cpSync(srcAbs, destAbs, { recursive: true, force: true });

    this.checkpointManager.recordPostMutation(turnId, destRel, destExisted ? 'modify' : 'create');
    this.recordBaseline(destRel, destAbs);

    return {
      source: srcRel,
      destination: destRel,
      copied: true,
      outsideWorkspace: srcOutside || destOutside,
    };
  }

  async move(
    sourcePath: string,
    destinationPath: string,
    options: { overwrite?: boolean; turnId?: string } = {},
  ): Promise<{ source: string; destination: string; moved: boolean; outsideWorkspace: boolean }> {
    const { absPath: srcAbs, relPath: srcRel, isOutside: srcOutside } = this.resolvePath(sourcePath);
    const { absPath: destAbs, relPath: destRel, isOutside: destOutside } = this.resolvePath(destinationPath);
    const turnId = options.turnId || 'turn-default';

    if (!fs.existsSync(srcAbs)) {
      throw new Error(`源文件/目录不存在: ${sourcePath}`);
    }

    const destExisted = fs.existsSync(destAbs);
    if (destExisted && !options.overwrite) {
      throw new Error(`目标已存在且 overwrite 未开启: ${destinationPath}`);
    }
    if (destExisted && fs.statSync(destAbs).isFile()) {
      this.ensureWritableBaseline(destAbs, destRel);
    }

    // 源与目标都要可撤销：源记 delete（保留原始内容），目标记 modify/create。
    this.checkpointManager.recordPreMutation(turnId, srcRel);
    this.checkpointManager.recordPreMutation(turnId, destRel);

    this.ensureParentDir(destAbs);
    fs.renameSync(srcAbs, destAbs);

    this.checkpointManager.recordPostMutation(turnId, srcRel, 'delete');
    this.checkpointManager.recordPostMutation(turnId, destRel, destExisted ? 'modify' : 'create');
    this.baselines.delete(srcRel);
    this.recordBaseline(destRel, destAbs);

    return {
      source: srcRel,
      destination: destRel,
      moved: true,
      outsideWorkspace: srcOutside || destOutside,
    };
  }

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  /**
   * 删除语义：permanent:false 时文件/目录进入产品恢复区（checkpoint 持久化，
   * 可按文件/按 Turn 撤销）；permanent:true 才执行不可恢复删除（调用方必须
   * 已获得用户确认）。非空目录必须显式 recursive:true。
   */
  async delete(
    targetPath: string,
    options: { recursive?: boolean; permanent?: boolean; turnId?: string } = {},
  ): Promise<A9DeleteResult> {
    const { absPath, relPath, isOutside } = this.resolvePath(targetPath);
    const turnId = options.turnId || 'turn-default';

    if (!fs.existsSync(absPath)) {
      throw new Error(`待删除文件/目录不存在: ${targetPath}`);
    }

    const stat = fs.statSync(absPath);
    if (stat.isDirectory() && !options.recursive) {
      const children = fs.readdirSync(absPath);
      if (children.length > 0) {
        throw new WorkspaceError(
          'INVALID_TOOL_INPUT',
          `目录 ${relPath} 非空。确认递归删除请设置 recursive:true（permanent:false 时内容仍可从恢复区找回）。`,
        );
      }
    }

    // 副作用前先落恢复事实：permanent:false 的可恢复性由此保证。
    const record = this.checkpointManager.recordPreMutation(turnId, relPath);

    if (options.permanent === true) {
      if (stat.isDirectory()) {
        fs.rmSync(absPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(absPath);
      }
      this.checkpointManager.recordPostMutation(turnId, relPath, 'delete');
      this.baselines.delete(relPath);
      return {
        path: relPath,
        deleted: true,
        permanent: true,
        outsideWorkspace: isOutside,
      };
    }

    // permanent:false：内容已随 recordPreMutation 进入恢复区（blob/目录快照），
    // 此时移除原路径；undo 可整体恢复。
    if (stat.isDirectory()) {
      if (!record.originalSnapshotPath && !record.currentStateSnapshotPath) {
        throw new WorkspaceError('CHECKPOINT_PERSIST_FAILED', `目录 ${relPath} 的恢复快照未能建立，拒绝删除以保持可恢复性。`);
      }
      fs.rmSync(absPath, { recursive: true, force: true });
    } else {
      if (!record.originalBlobPath && !record.currentStateBlobPath && !record.newBlobPath) {
        throw new WorkspaceError('CHECKPOINT_PERSIST_FAILED', `文件 ${relPath} 的恢复内容未能建立，拒绝删除以保持可恢复性。`);
      }
      fs.unlinkSync(absPath);
    }
    this.checkpointManager.recordPostMutation(turnId, relPath, 'delete');
    this.baselines.delete(relPath);

    return {
      path: relPath,
      deleted: true,
      permanent: false,
      outsideWorkspace: isOutside,
      recoverableVia: `checkpoint ${turnId} (undo file or turn)`,
    };
  }

  // -------------------------------------------------------------------------
  // R3：Shell/Git/项目脚本外部变化的轮前基线与轮后收集
  // -------------------------------------------------------------------------

  /**
   * 冻结轮前内容基线（第一个潜在副作用前调用）：遵循 ignore；文件数/单文件/
   * 总量有界；超限或读取失败显式记入 skipped（后续变化将标记不可恢复）。
   */
  async freezeTurnBaseline(turnId: string, options: { signal?: AbortSignal } = {}): Promise<TurnContentBaseline> {
    const files: TurnContentBaseline['files'] = Object.create(null);
    const directories: TurnContentBaseline['directories'] = Object.create(null);
    const skipped: TurnContentBaseline['skipped'] = [];
    let totalBytes = 0;
    let fileCount = 0;

    const stack: string[] = [this.workspaceRoot];
    const visited = new Set<string>([this.safeRealPath(this.workspaceRoot)].filter((v): v is string => v !== undefined));
    while (stack.length > 0) {
      if (options.signal?.aborted) throw new Error('基线冻结已被取消');
      const dir = stack.pop()!;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        if (dir === this.workspaceRoot) throw new Error('无法读取工作区根目录，拒绝建立不完整的轮前基线');
        const skippedPath = path.relative(this.workspaceRoot, dir).replace(/\\/g, '/');
        skipped.push({ path: skippedPath, reason: 'backup_failed' });
        continue;
      }
      for (const dirent of dirents) {
        const fullPath = path.join(dir, dirent.name);
        const rel = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
        if (rel.startsWith('.agent_recovery')) continue;
        if (this.ignoreFilter.isIgnored(rel, dirent.isDirectory())) continue;
        if (this.containsSensitiveData(rel)) {
          throw new Error('A9_CHECKPOINT_SECRET_BLOCKED: workspace path contains known secret material');
        }
        if (dirent.isDirectory()) {
          directories[rel] = this.checkpointManager.saveEmptyDirectoryBaseline(turnId, rel);
          const real = this.safeRealPath(fullPath);
          if (real && !visited.has(real)) {
            visited.add(real);
            stack.push(fullPath);
          }
        } else if (dirent.isFile()) {
          let stat: fs.Stats;
          try {
            stat = fs.statSync(fullPath);
          } catch (_e) {
            skipped.push({ path: rel, reason: 'backup_failed' });
            continue;
          }
          if (fileCount >= MAX_BASELINE_FILES) {
            skipped.push({ path: rel, reason: 'too_large', size: stat.size, mtimeMs: stat.mtimeMs });
            continue;
          }
          if (stat.size > MAX_BASELINE_FILE_BYTES || totalBytes + stat.size > MAX_BASELINE_TOTAL_BYTES) {
            skipped.push({ path: rel, reason: 'too_large', size: stat.size, mtimeMs: stat.mtimeMs });
            continue;
          }
          try {
            const content = this.readBaselineFile(fullPath);
            if (this.containsSensitiveData(content)) {
              throw new Error('A9_CHECKPOINT_SECRET_BLOCKED: workspace file contains known secret material');
            }
            const blobPath = this.checkpointManager.saveToRecovery(turnId, rel, content);
            const sha256 = crypto.createHash('sha256').update(content).digest('hex');
            files[rel] = { sha256, blobPath, size: stat.size };
            totalBytes += stat.size;
            fileCount += 1;
          } catch (error) {
            if (error instanceof Error && error.message.includes('A9_CHECKPOINT_SECRET_BLOCKED')) throw error;
            skipped.push({ path: rel, reason: 'backup_failed', size: stat.size, mtimeMs: stat.mtimeMs });
          }
        }
      }
    }

    const baseline = { turnId, frozenAt: new Date().toISOString(), files, directories, skipped };
    this.checkpointManager.persistExternalBaseline(turnId, {
      frozenAt: baseline.frozenAt,
      files: baseline.files,
      directories: baseline.directories,
      skipped: baseline.skipped,
    });
    return baseline;
  }

  /**
   * 轮后收集外部变化并写入同一份 checkpoint 记录（Diff/undo/SQLite/UI 共用）：
   * created → undo 删除；modified/deleted（有基线 blob）→ 恢复原内容；
   * rename = 同哈希的 delete+create 对；无基线/超限/失败 → 显式不可恢复标记。
   */
  async collectExternalChanges(
    turnId: string,
    baseline: TurnContentBaseline,
    options: { signal?: AbortSignal; requireUndoConfirmation?: boolean } = {},
  ): Promise<ExternalChangeReport> {
    const report: ExternalChangeReport = { changes: [], unrecoverable: [] };
    const current = new Map<string, { sha256: string; size: number; mtimeMs: number }>();
    const currentDirectories = new Set<string>();
    const stack: string[] = [this.workspaceRoot];
    const visited = new Set<string>([this.safeRealPath(this.workspaceRoot)].filter((v): v is string => v !== undefined));
    while (stack.length > 0) {
      if (options.signal?.aborted) throw new Error('外部变化收集已被取消');
      const dir = stack.pop()!;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        continue;
      }
      for (const dirent of dirents) {
        const fullPath = path.join(dir, dirent.name);
        const rel = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
        if (rel.startsWith('.agent_recovery')) continue;
        if (this.ignoreFilter.isIgnored(rel, dirent.isDirectory())) continue;
        if (this.containsSensitiveData(rel)) {
          throw new Error('A9_CHECKPOINT_SECRET_BLOCKED: changed workspace path contains known secret material');
        }
        if (dirent.isDirectory()) {
          currentDirectories.add(rel);
          const real = this.safeRealPath(fullPath);
          if (real && !visited.has(real)) {
            visited.add(real);
            stack.push(fullPath);
          }
        } else if (dirent.isFile()) {
          let stat: fs.Stats;
          try {
            stat = fs.statSync(fullPath);
          } catch (_e) {
            continue;
          }
          try {
            current.set(rel, { sha256: this.hashFile(fullPath), size: stat.size, mtimeMs: stat.mtimeMs });
          } catch (_e) {
            // 内容当前不可读时仍保留 stat 事实，避免把仍存在的文件误判为删除。
            current.set(rel, { sha256: `unreadable:${stat.size}:${stat.mtimeMs}`, size: stat.size, mtimeMs: stat.mtimeMs });
          }
        }
      }
    }

    // F2：skipped = 冻结时已存在但基线未覆盖的文件（携带事实，不含内容）。
    const skippedFacts = new Map(baseline.skipped.map((item) => [item.path, item]));
    const createdHashes = new Map<string, string>();
    const isContentHash = (value: string): boolean => /^[a-f0-9]{64}$/.test(value);

    // 新建与修改。
    for (const [rel, fact] of current) {
      const before = Object.prototype.hasOwnProperty.call(baseline.files, rel)
        ? baseline.files[rel]
        : undefined;
      const skippedFact = skippedFacts.get(rel);
      if (!before && skippedFact) {
        // skipped 不含内容，只能比较冻结时保存的 stat 事实。事实完整且未变化时
        // 不制造虚假 Diff；事实缺失或 size/mtime 变化时保守标记不可恢复修改。
        const metadataUnchanged = skippedFact.size !== undefined && skippedFact.mtimeMs !== undefined
          && skippedFact.size === fact.size && skippedFact.mtimeMs === fact.mtimeMs;
        if (metadataUnchanged) continue;
        this.checkpointManager.recordExternalFact(turnId, rel, 'modified', {
          newHash: isContentHash(fact.sha256) ? fact.sha256 : undefined,
          unrecoverable: true,
        });
        this.checkpointManager.recordUnrecoverableExternal(turnId, { path: rel, kind: 'modified', reason: `轮前基线未覆盖（${skippedFact.reason}），无法恢复原内容` });
        report.unrecoverable.push({ path: rel, kind: 'modified', reason: skippedFact.reason });
        report.changes.push({ path: rel, kind: 'modified', recoverable: false });
        continue;
      }
      if (!before) {
        if (isContentHash(fact.sha256)) {
          createdHashes.set(fact.sha256, rel);
          this.checkpointManager.recordExternalFact(turnId, rel, 'created', { newHash: fact.sha256 });
          report.changes.push({ path: rel, kind: 'created', recoverable: true, restoredVia: 'delete-new' });
        } else {
          this.checkpointManager.recordExternalFact(turnId, rel, 'created', { unrecoverable: true });
          this.checkpointManager.recordUnrecoverableExternal(turnId, { path: rel, kind: 'created', reason: '轮后文件不可读，无法绑定删除目标身份' });
          report.unrecoverable.push({ path: rel, kind: 'created', reason: 'backup_failed' });
          report.changes.push({ path: rel, kind: 'created', recoverable: false });
        }
        continue;
      }
      if (before.sha256 !== fact.sha256) {
        this.checkpointManager.recordExternalFact(turnId, rel, 'modified', {
          originalBlobPath: before.blobPath,
          originalHash: before.sha256,
          newHash: isContentHash(fact.sha256) ? fact.sha256 : undefined,
          ...(!isContentHash(fact.sha256) ? { unrecoverable: true } : {}),
        });
        if (isContentHash(fact.sha256)) {
          report.changes.push({ path: rel, kind: 'modified', recoverable: true, restoredVia: 'restore-original' });
        } else {
          this.checkpointManager.recordUnrecoverableExternal(turnId, { path: rel, kind: 'modified', reason: '轮后文件不可读，无法绑定撤销目标身份' });
          report.unrecoverable.push({ path: rel, kind: 'modified', reason: 'backup_failed' });
          report.changes.push({ path: rel, kind: 'modified', recoverable: false });
        }
      }
    }

    // 删除与重命名（同哈希 delete+create 对 → renamed；skipped 侧明确不可恢复）。
    for (const [rel, before] of Object.entries(baseline.files)) {
      if (current.has(rel)) continue;
      const renamedTo = createdHashes.get(before.sha256);
      if (renamedTo && renamedTo !== rel) {
        this.checkpointManager.recordExternalFact(turnId, rel, 'deleted', { originalBlobPath: before.blobPath, originalHash: before.sha256 });
        report.changes.push({ path: rel, kind: 'renamed', recoverable: true, restoredVia: 'restore-original' });
        report.changes.push({ path: renamedTo, kind: 'renamed', recoverable: true, restoredVia: 'delete-new' });
        continue;
      }
      this.checkpointManager.recordExternalFact(turnId, rel, 'deleted', { originalBlobPath: before.blobPath, originalHash: before.sha256 });
      report.changes.push({ path: rel, kind: 'deleted', recoverable: true, restoredVia: 'restore-original' });
    }

    // 基线跳过的既有文件被删除/改名离开：明确不可恢复，undo 保留现场并报告。
    for (const [rel, skippedFact] of skippedFacts) {
      if (current.has(rel)) continue;
      const sizeMatchRename = Array.from(current.entries()).find(([candidate, fact]) => {
        void candidate;
        return skippedFact.size !== undefined && fact.size === skippedFact.size;
      });
      const kind = sizeMatchRename ? 'renamed' : 'deleted';
      this.checkpointManager.recordExternalFact(turnId, rel, 'deleted', { unrecoverable: true });
      this.checkpointManager.recordUnrecoverableExternal(turnId, { path: rel, kind, reason: `轮前基线未覆盖（${skippedFact.reason}），${kind === 'renamed' ? '疑似重命名' : '删除'}后原内容无法恢复` });
      report.unrecoverable.push({ path: rel, kind, reason: skippedFact.reason });
      report.changes.push({ path: rel, kind, recoverable: false });
      if (sizeMatchRename) {
        // 重命名的新路径同样标记不可恢复（不可伪装为可恢复的 delete-new）。
        const newSide = sizeMatchRename[0];
        this.checkpointManager.recordExternalFact(turnId, newSide, 'modified', { unrecoverable: true });
        this.checkpointManager.recordUnrecoverableExternal(turnId, { path: newSide, kind: 'renamed', reason: '疑似自基线未覆盖文件重命名而来，两侧均不可恢复' });
        report.unrecoverable.push({ path: newSide, kind: 'renamed', reason: 'rename-from-skipped' });
      }
    }

    const emptyTreeHash = this.checkpointManager.emptyDirectoryTreeHash();
    const baselineDirectories = baseline.directories ?? {};
    // 目录事实最后写入；undo 会先移除轮内新建的深层对象，再恢复目录骨架和文件。
    for (const [rel, before] of Object.entries(baselineDirectories)) {
      if (currentDirectories.has(rel)) continue;
      if (current.has(rel)) {
        this.checkpointManager.recordExternalDirectoryFact(turnId, rel, 'replaced_by_file', {
          originalSnapshotPath: before.snapshotPath,
          originalTreeHash: before.treeHash,
        });
        report.changes.push({ path: rel, kind: 'modified', recoverable: true, restoredVia: 'restore-original' });
      } else {
        this.checkpointManager.recordExternalDirectoryFact(turnId, rel, 'deleted', {
          originalSnapshotPath: before.snapshotPath,
          originalTreeHash: before.treeHash,
        });
        report.changes.push({ path: rel, kind: 'deleted', recoverable: true, restoredVia: 'restore-original' });
      }
    }
    for (const rel of currentDirectories) {
      if (Object.prototype.hasOwnProperty.call(baselineDirectories, rel)) continue;
      this.checkpointManager.recordExternalDirectoryFact(turnId, rel, 'created', { emptyTreeHash });
      report.changes.push({ path: rel, kind: baseline.files[rel] ? 'modified' : 'created', recoverable: true, restoredVia: 'delete-new' });
    }

    this.checkpointManager.markExternalBaselineCollected(turnId, options.requireUndoConfirmation === true);
    return report;
  }

  /**
   * J5：首次显式 Undo 只把崩溃后的当前工作区与已持久化轮前基线对账，
   * 生成可检查 Diff 并把 pending 转成 complete；调用方须再次显式 Undo
   * 才能实际改写文件。这样不会静默覆盖崩溃后的人工作业。
   */
  async reconcilePendingExternalBaseline(turnId: string): Promise<{
    report?: ExternalChangeReport;
    confirmationId: string;
  } | undefined> {
    const awaiting = this.checkpointManager.getExternalUndoConfirmation(turnId);
    if (awaiting) return { confirmationId: awaiting };
    const persisted = this.checkpointManager.getPendingExternalBaseline(turnId);
    if (!persisted) return undefined;
    const report = await this.collectExternalChanges(turnId, {
      turnId,
      frozenAt: persisted.frozenAt,
      files: persisted.files,
      directories: persisted.directories,
      skipped: persisted.skipped,
    }, { requireUndoConfirmation: true });
    const confirmationId = this.checkpointManager.getExternalUndoConfirmation(turnId);
    if (!confirmationId) throw new Error('A9_CHECKPOINT_CONFIRMATION_NOT_PERSISTED');
    return { report, confirmationId };
  }

  private safeRealPath(target: string): string | undefined {
    try {
      return fs.realpathSync(target);
    } catch (_err) {
      return undefined;
    }
  }

  /** 可覆盖的基线读取汇点，生产默认按字节读取；测试用它稳定注入读取失败。 */
  protected readBaselineFile(target: string): Buffer {
    return fs.readFileSync(target);
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  /** 探测一轮之内 Shell/外部工具造成的工作区变化（A9-F03 轮前/轮后基线）。 */
  async scanExternalChanges(
    baseline: Map<string, { size: number; mtimeMs: number }>,
    options: { signal?: AbortSignal } = {},
  ): Promise<Array<{ path: string; kind: 'created' | 'modified' | 'deleted' }>> {
    const current = new Map<string, { size: number; mtimeMs: number }>();
    const stack: string[] = [this.workspaceRoot];
    const visited = new Set<string>([fs.realpathSync(this.workspaceRoot)]);
    while (stack.length > 0) {
      if (options.signal?.aborted) throw new Error('扫描已被取消');
      const dir = stack.pop()!;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        continue;
      }
      for (const dirent of dirents) {
        const fullPath = path.join(dir, dirent.name);
        const rel = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
        if (this.ignoreFilter.isIgnored(rel, dirent.isDirectory())) continue;
        if (rel.startsWith('.agent_recovery')) continue;
        if (dirent.isDirectory()) {
          let real: string;
          try {
            real = fs.realpathSync(fullPath);
          } catch (_e) {
            continue;
          }
          if (!visited.has(real)) {
            visited.add(real);
            stack.push(fullPath);
          }
        } else if (dirent.isFile()) {
          try {
            const st = fs.statSync(fullPath);
            current.set(rel, { size: st.size, mtimeMs: st.mtimeMs });
          } catch (_e) { /* unreadable */ }
        }
      }
    }
    const changes: Array<{ path: string; kind: 'created' | 'modified' | 'deleted' }> = [];
    for (const [rel, fact] of current) {
      const before = baseline.get(rel);
      if (!before) changes.push({ path: rel, kind: 'created' });
      else if (before.size !== fact.size || before.mtimeMs !== fact.mtimeMs) changes.push({ path: rel, kind: 'modified' });
    }
    for (const rel of baseline.keys()) {
      if (!current.has(rel)) changes.push({ path: rel, kind: 'deleted' });
    }
    return changes;
  }

  /** 建立轮前 stat 基线（供 scanExternalChanges 比对）。 */
  async snapshotStatBaseline(options: { signal?: AbortSignal } = {}): Promise<Map<string, { size: number; mtimeMs: number }>> {
    const map = new Map<string, { size: number; mtimeMs: number }>();
    const stack: string[] = [this.workspaceRoot];
    const visited = new Set<string>([fs.realpathSync(this.workspaceRoot)]);
    while (stack.length > 0) {
      if (options.signal?.aborted) throw new Error('扫描已被取消');
      const dir = stack.pop()!;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        continue;
      }
      for (const dirent of dirents) {
        const fullPath = path.join(dir, dirent.name);
        const rel = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
        if (rel.startsWith('.agent_recovery')) continue;
        if (this.ignoreFilter.isIgnored(rel, dirent.isDirectory())) continue;
        if (dirent.isDirectory()) {
          let real: string;
          try {
            real = fs.realpathSync(fullPath);
          } catch (_e) {
            continue;
          }
          if (!visited.has(real)) {
            visited.add(real);
            stack.push(fullPath);
          }
        } else if (dirent.isFile()) {
          try {
            const st = fs.statSync(fullPath);
            map.set(rel, { size: st.size, mtimeMs: st.mtimeMs });
          } catch (_e) { /* unreadable */ }
        }
      }
    }
    return map;
  }

  private ensureParentDir(absPath: string): void {
    const parent = path.dirname(absPath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
  }
}
