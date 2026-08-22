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
}

/** 单文件整读上限：超过则要求分段读取，避免内存失控。 */
const MAX_WHOLE_READ_BYTES = 8 * 1024 * 1024;
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
  skipped: Array<{ path: string; reason: 'too_large' | 'backup_failed' | 'outside' }>;
}

export interface ExternalChangeReport {
  changes: Array<{ path: string; kind: 'created' | 'modified' | 'deleted' | 'renamed'; recoverable: boolean; restoredVia?: 'delete-new' | 'restore-original' }>;
  unrecoverable: Array<{ path: string; kind: string; reason: string }>;
}

export class A9WorkspaceService {
  private readonly ignoreFilter: IgnoreFilter;
  private readonly checkpointManager: CheckpointManager;
  private readonly baselines = new Map<string, BaselineFact>();

  constructor(public readonly workspaceRoot: string) {
    this.ignoreFilter = createWorkspaceIgnoreFilter(workspaceRoot);
    this.checkpointManager = new CheckpointManager(workspaceRoot);
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

  private recordBaseline(relPath: string, absPath: string): void {
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      this.baselines.set(relPath, this.fileHash(absPath));
    } else {
      this.baselines.delete(relPath);
    }
  }

  /**
   * 写入前的基线校验：已存在的文件必须有新鲜读取基线；基线与磁盘不一致时
   * 拒绝覆盖（BASELINE_DRIFT），从未读取时要求先读（READ_REQUIRED）。
   */
  private ensureWritableBaseline(absPath: string, relPath: string): void {
    if (!fs.existsSync(absPath)) return;
    if (!fs.statSync(absPath).isFile()) return;
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
    options: { startLine?: number; maxLines?: number; encoding?: string } = {},
  ): Promise<A9ReadResult> {
    const { absPath, relPath, isOutside } = this.resolvePath(targetPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`文件不存在: ${targetPath}`);
    }
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) {
      throw new Error(`路径不是文件: ${targetPath}`);
    }
    if (stat.size > MAX_WHOLE_READ_BYTES) {
      throw new WorkspaceError(
        'FILE_TOO_LARGE',
        `文件 ${relPath} 为 ${stat.size} 字节，超过整读上限 ${MAX_WHOLE_READ_BYTES} 字节。请使用 startLine/maxLines 分段读取，或使用二进制工具。`,
      );
    }

    const raw = fs.readFileSync(absPath);
    const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
    // 读取即建立写入基线。
    this.baselines.set(relPath, { sha256, mtimeMs: stat.mtimeMs, size: stat.size });
    const detection = detectEncoding(raw);

    if (detection.encoding === 'ambiguous' && options.encoding !== 'binary') {
      return {
        path: relPath,
        isText: false,
        encoding: 'binary',
        startLine: 1,
        linesRead: 0,
        totalLines: 0,
        content: `[Binary or ambiguous file: size ${raw.length} bytes; use encoding:'binary' for metadata]`,
        truncated: false,
        outsideWorkspace: isOutside,
        contentSha256: sha256,
      };
    }

    const enc = (options.encoding && options.encoding !== 'binary'
      ? options.encoding
      : (detection.encoding !== 'ambiguous' ? detection.encoding : 'utf-8')) as WritableEncoding;
    const text = decodeBuffer(raw, enc) ?? (() => {
      throw new WorkspaceError('ENCODING_AMBIGUOUS', `文件 ${relPath} 无法按 ${enc} 严格解码；请确认编码后重读。`);
    })();

    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;
    const startLine = Math.max(1, options.startLine || 1);
    const maxLines = Math.max(1, options.maxLines || 200);

    const sliceStart = startLine - 1;
    const sliceEnd = Math.min(totalLines, sliceStart + maxLines);
    const selectedLines = lines.slice(sliceStart, sliceEnd);
    const truncated = sliceEnd < totalLines;

    const formattedContent = selectedLines
      .map((line, idx) => `${sliceStart + idx + 1}: ${line}`)
      .join('\n');

    return {
      path: relPath,
      isText: true,
      encoding: enc,
      startLine,
      linesRead: selectedLines.length,
      totalLines,
      content: formattedContent,
      truncated,
      outsideWorkspace: isOutside,
      contentSha256: sha256,
    };
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
      if (detection.encoding === 'ambiguous') {
        throw new WorkspaceError(
          'ENCODING_AMBIGUOUS',
          `文件 ${relPath} 的现有编码无法可靠识别；请显式指定 encoding 或先以 binary 查看。`,
        );
      }
      const body = encodeText(content, detection.encoding as WritableEncoding);
      const bom = detection.bom
        ? (detection.encoding === 'utf-8' ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.from([0xff, 0xfe]))
        : Buffer.alloc(0);
      buffer = bom.length > 0 ? Buffer.concat([bom, body]) : body;
      encodingUsed = detection.encoding;
    } else {
      // 新文件默认 UTF-8 无 BOM。
      buffer = encodeText(content, 'utf-8');
      encodingUsed = 'utf-8';
    }

    this.ensureParentDir(absPath);
    atomicWrite(absPath, buffer);

    this.checkpointManager.recordPostMutation(turnId, relPath, isNew ? 'create' : 'modify');
    this.recordBaseline(relPath, absPath);

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
    this.ensureWritableBaseline(absPath, relPath);

    this.checkpointManager.recordPreMutation(turnId, relPath);

    const raw = fs.readFileSync(absPath);
    const detection = detectEncoding(raw);
    if (detection.encoding === 'ambiguous') {
      throw new WorkspaceError('ENCODING_AMBIGUOUS', `文件 ${relPath} 编码无法可靠识别，拒绝文本编辑以避免损坏原始字节。`);
    }
    const originalText = decodeBuffer(raw, detection.encoding as WritableEncoding);
    if (originalText === undefined) {
      throw new WorkspaceError('ENCODING_AMBIGUOUS', `文件 ${relPath} 按 ${detection.encoding} 解码失败，拒绝编辑。`);
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
      const result = reencodePreservingOriginal(raw, originalText, replacedText);
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
    this.recordBaseline(relPath, absPath);

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
    const files: TurnContentBaseline['files'] = {};
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
        continue;
      }
      for (const dirent of dirents) {
        const fullPath = path.join(dir, dirent.name);
        const rel = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
        if (rel.startsWith('.agent_recovery')) continue;
        if (this.ignoreFilter.isIgnored(rel, dirent.isDirectory())) continue;
        if (dirent.isDirectory()) {
          const real = this.safeRealPath(fullPath);
          if (real && !visited.has(real)) {
            visited.add(real);
            stack.push(fullPath);
          }
        } else if (dirent.isFile()) {
          if (fileCount >= MAX_BASELINE_FILES) {
            skipped.push({ path: rel, reason: 'too_large' });
            continue;
          }
          let stat: fs.Stats;
          try {
            stat = fs.statSync(fullPath);
          } catch (_e) {
            skipped.push({ path: rel, reason: 'backup_failed' });
            continue;
          }
          if (stat.size > MAX_BASELINE_FILE_BYTES || totalBytes + stat.size > MAX_BASELINE_TOTAL_BYTES) {
            skipped.push({ path: rel, reason: 'too_large' });
            continue;
          }
          try {
            const content = fs.readFileSync(fullPath);
            const blobPath = this.checkpointManager.saveToRecovery(rel, content);
            const sha256 = crypto.createHash('sha256').update(content).digest('hex');
            files[rel] = { sha256, blobPath, size: stat.size };
            totalBytes += stat.size;
            fileCount += 1;
          } catch (_e) {
            skipped.push({ path: rel, reason: 'backup_failed' });
          }
        }
      }
    }

    return { turnId, frozenAt: new Date().toISOString(), files, skipped };
  }

  /**
   * 轮后收集外部变化并写入同一份 checkpoint 记录（Diff/undo/SQLite/UI 共用）：
   * created → undo 删除；modified/deleted（有基线 blob）→ 恢复原内容；
   * rename = 同哈希的 delete+create 对；无基线/超限/失败 → 显式不可恢复标记。
   */
  async collectExternalChanges(
    turnId: string,
    baseline: TurnContentBaseline,
    options: { signal?: AbortSignal } = {},
  ): Promise<ExternalChangeReport> {
    const report: ExternalChangeReport = { changes: [], unrecoverable: [] };
    const current = new Map<string, { sha256: string; size: number }>();
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
        if (dirent.isDirectory()) {
          const real = this.safeRealPath(fullPath);
          if (real && !visited.has(real)) {
            visited.add(real);
            stack.push(fullPath);
          }
        } else if (dirent.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size <= MAX_BASELINE_FILE_BYTES) {
              const hash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
              current.set(rel, { sha256: hash, size: stat.size });
            } else {
              current.set(rel, { sha256: `too-large:${stat.size}`, size: stat.size });
            }
          } catch (_e) { /* unreadable now */ }
        }
      }
    }

    const skippedPaths = new Set(baseline.skipped.map((item) => item.path));
    const createdHashes = new Map<string, string>();

    // 新建与修改。
    for (const [rel, fact] of current) {
      const before = baseline.files[rel];
      if (!before) {
        createdHashes.set(fact.sha256, rel);
        this.checkpointManager.recordExternalFact(turnId, rel, 'created', { newHash: fact.sha256.startsWith('too-large:') ? undefined : fact.sha256 });
        report.changes.push({ path: rel, kind: 'created', recoverable: true, restoredVia: 'delete-new' });
        continue;
      }
      if (before.sha256 !== fact.sha256) {
        if (skippedPaths.has(rel)) {
          this.checkpointManager.recordUnrecoverableExternal(turnId, { path: rel, kind: 'modified', reason: '轮前基线未覆盖该文件（超限或备份失败），无法恢复原内容' });
          report.unrecoverable.push({ path: rel, kind: 'modified', reason: 'baseline-missing' });
          report.changes.push({ path: rel, kind: 'modified', recoverable: false });
        } else {
          this.checkpointManager.recordExternalFact(turnId, rel, 'modified', {
            originalBlobPath: before.blobPath,
            originalHash: before.sha256,
            newHash: fact.sha256.startsWith('too-large:') ? undefined : fact.sha256,
          });
          report.changes.push({ path: rel, kind: 'modified', recoverable: true, restoredVia: 'restore-original' });
        }
      }
    }

    // 删除与重命名（同哈希 delete+create 对 → renamed）。
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

    return report;
  }

  private safeRealPath(target: string): string | undefined {
    try {
      return fs.realpathSync(target);
    } catch (_err) {
      return undefined;
    }
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
