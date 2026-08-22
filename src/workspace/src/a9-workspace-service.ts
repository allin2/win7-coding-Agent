/**
 * @module a9-workspace-service
 * @description A9 Full Access 工作区文件工具与服务实现 (PRD §5 / ADR-0089)
 */

import * as fs from 'fs';
import * as path from 'path';
import { detectEncoding, decodeBuffer } from './encoding';
import { atomicWrite } from './atomic';
import { createWorkspaceIgnoreFilter, IgnoreFilter } from './a9-ignore';
import { CheckpointManager } from './checkpoint-manager';

export interface A9ListResult {
  path: string;
  totalEntries: number;
  truncated: boolean;
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
}

export interface A9SearchResult {
  pattern: string;
  totalMatches: number;
  truncated: boolean;
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
}

export interface A9EditResult {
  path: string;
  replaced: boolean;
  diffSummary: string;
}

export class A9WorkspaceService {
  private readonly ignoreFilter: IgnoreFilter;
  private readonly checkpointManager: CheckpointManager;

  constructor(public readonly workspaceRoot: string) {
    this.ignoreFilter = createWorkspaceIgnoreFilter(workspaceRoot);
    this.checkpointManager = new CheckpointManager(workspaceRoot);
  }

  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  private resolvePath(targetPath: string): { absPath: string; relPath: string; isOutside: boolean } {
    const absPath = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(this.workspaceRoot, targetPath);
    const relPath = path.relative(this.workspaceRoot, absPath).replace(/\\/g, '/');
    const isOutside = relPath.startsWith('..') || path.isAbsolute(relPath);
    return { absPath, relPath, isOutside };
  }

  /**
   * list 工具实现
   */
  async list(targetPath: string = '', options: { recursive?: boolean; maxEntries?: number } = {}): Promise<A9ListResult> {
    const { absPath, relPath } = this.resolvePath(targetPath);
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
        if (this.ignoreFilter.isIgnored(itemRel, dirent.isDirectory())) {
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

        entries.push({
          name: dirent.name,
          path: itemRel,
          type,
          sizeBytes,
        });

        if (recursive && dirent.isDirectory() && depth < 10) {
          scan(itemAbs, itemRel, depth + 1);
        }
      }
    };

    scan(absPath, relPath === '.' ? '' : relPath, 0);

    return {
      path: relPath || '.',
      totalEntries: entries.length,
      truncated,
      entries,
    };
  }

  /**
   * read 工具实现
   */
  async read(
    targetPath: string,
    options: { startLine?: number; maxLines?: number; encoding?: string } = {},
  ): Promise<A9ReadResult> {
    const { absPath, relPath } = this.resolvePath(targetPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`文件不存在: ${targetPath}`);
    }

    const raw = fs.readFileSync(absPath);
    const detection = detectEncoding(raw);

    if (detection.encoding === 'ambiguous' && options.encoding !== 'binary') {
      return {
        path: relPath,
        isText: false,
        encoding: 'binary',
        startLine: 1,
        linesRead: 0,
        totalLines: 0,
        content: `[Binary file: size ${raw.length} bytes]`,
        truncated: false,
      };
    }

    const enc = (options.encoding || (detection.encoding !== 'ambiguous' ? detection.encoding : 'utf-8')) as any;
    const text = decodeBuffer(raw, enc) ?? raw.toString('utf8');

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
    };
  }

  /**
   * search 工具实现
   */
  async search(
    pattern: string,
    options: { path?: string; isRegex?: boolean; maxMatches?: number } = {},
  ): Promise<A9SearchResult> {
    const { absPath } = this.resolvePath(options.path || '');
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

    const scanDir = (dir: string) => {
      if (matches.length >= maxMatches) {
        truncated = true;
        return;
      }

      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_e) {
        return;
      }

      for (const dirent of dirents) {
        if (matches.length >= maxMatches) {
          truncated = true;
          break;
        }

        const fullPath = path.join(dir, dirent.name);
        const rel = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');

        if (this.ignoreFilter.isIgnored(rel, dirent.isDirectory())) continue;

        if (dirent.isDirectory()) {
          scanDir(fullPath);
        } else if (dirent.isFile()) {
          try {
            const buf = fs.readFileSync(fullPath);
            const detection = detectEncoding(buf);
            if (detection.encoding === 'ambiguous') continue;

            const text = decodeBuffer(buf, detection.encoding as any) ?? buf.toString('utf8');
            const lines = text.split(/\r?\n/);

            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                matches.push({
                  filePath: rel,
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
            // ignore
          }
        }
      }
    };

    scanDir(absPath);

    return {
      pattern,
      totalMatches: matches.length,
      truncated,
      matches,
    };
  }

  /**
   * write 工具实现
   */
  async write(
    targetPath: string,
    content: string,
    options: { encoding?: string; turnId?: string } = {},
  ): Promise<A9WriteResult> {
    const { absPath, relPath } = this.resolvePath(targetPath);
    const turnId = options.turnId || 'turn-default';
    const isNew = !fs.existsSync(absPath);

    this.checkpointManager.recordPreMutation(turnId, relPath);

    const enc = options.encoding || 'utf-8';
    const buffer = Buffer.from(content, enc === 'gbk' ? 'utf8' : (enc as BufferEncoding));

    atomicWrite(absPath, buffer);

    this.checkpointManager.recordPostMutation(turnId, relPath, isNew ? 'create' : 'modify');

    return {
      path: relPath,
      bytesWritten: buffer.length,
      encoding: enc,
      created: isNew,
    };
  }

  /**
   * edit 工具实现
   */
  async edit(
    targetPath: string,
    oldText: string,
    newText: string,
    options: { turnId?: string } = {},
  ): Promise<A9EditResult> {
    const { absPath, relPath } = this.resolvePath(targetPath);
    const turnId = options.turnId || 'turn-default';

    if (!fs.existsSync(absPath)) {
      throw new Error(`待编辑文件不存在: ${targetPath}`);
    }

    this.checkpointManager.recordPreMutation(turnId, relPath);

    const raw = fs.readFileSync(absPath);
    const detection = detectEncoding(raw);
    const enc = detection.encoding !== 'ambiguous' ? detection.encoding : 'utf-8';
    const originalText = decodeBuffer(raw, enc as any) ?? raw.toString('utf8');

    const firstIndex = originalText.indexOf(oldText);
    if (firstIndex === -1) {
      throw new Error(`未在 ${relPath} 中找到匹配的 oldText，请重新读取文件并确认锚点内容。`);
    }

    const secondIndex = originalText.indexOf(oldText, firstIndex + oldText.length);
    if (secondIndex !== -1) {
      throw new Error(`oldText 在 ${relPath} 中存在多处匹配，请提供包含更多上下文的唯一文本块。`);
    }

    const replacedText = originalText.slice(0, firstIndex) + newText + originalText.slice(firstIndex + oldText.length);
    const buffer = Buffer.from(replacedText, 'utf8');

    atomicWrite(absPath, buffer);

    this.checkpointManager.recordPostMutation(turnId, relPath, 'modify');

    return {
      path: relPath,
      replaced: true,
      diffSummary: `Replaced anchor of length ${oldText.length} with ${newText.length} characters.`,
    };
  }

  /**
   * copy 工具实现
   */
  async copy(
    sourcePath: string,
    destinationPath: string,
    options: { overwrite?: boolean; turnId?: string } = {},
  ): Promise<{ source: string; destination: string; copied: boolean }> {
    const { absPath: srcAbs, relPath: srcRel } = this.resolvePath(sourcePath);
    const { absPath: destAbs, relPath: destRel } = this.resolvePath(destinationPath);
    const turnId = options.turnId || 'turn-default';

    if (!fs.existsSync(srcAbs)) {
      throw new Error(`源文件/目录不存在: ${sourcePath}`);
    }

    if (fs.existsSync(destAbs) && !options.overwrite) {
      throw new Error(`目标已存在且 overwrite 未开启: ${destinationPath}`);
    }

    this.checkpointManager.recordPreMutation(turnId, destRel);

    const parentDir = path.dirname(destAbs);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

    fs.cpSync(srcAbs, destAbs, { recursive: true, force: options.overwrite ?? false });

    this.checkpointManager.recordPostMutation(turnId, destRel, 'create');

    return { source: srcRel, destination: destRel, copied: true };
  }

  /**
   * move 工具实现
   */
  async move(
    sourcePath: string,
    destinationPath: string,
    options: { overwrite?: boolean; turnId?: string } = {},
  ): Promise<{ source: string; destination: string; moved: boolean }> {
    const { absPath: srcAbs, relPath: srcRel } = this.resolvePath(sourcePath);
    const { absPath: destAbs, relPath: destRel } = this.resolvePath(destinationPath);
    const turnId = options.turnId || 'turn-default';

    if (!fs.existsSync(srcAbs)) {
      throw new Error(`源文件/目录不存在: ${sourcePath}`);
    }

    if (fs.existsSync(destAbs) && !options.overwrite) {
      throw new Error(`目标已存在且 overwrite 未开启: ${destinationPath}`);
    }

    this.checkpointManager.recordPreMutation(turnId, srcRel);
    this.checkpointManager.recordPreMutation(turnId, destRel);

    const parentDir = path.dirname(destAbs);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

    fs.renameSync(srcAbs, destAbs);

    this.checkpointManager.recordPostMutation(turnId, srcRel, 'delete');
    this.checkpointManager.recordPostMutation(turnId, destRel, 'create');

    return { source: srcRel, destination: destRel, moved: true };
  }

  /**
   * delete 工具实现
   */
  async delete(
    targetPath: string,
    options: { recursive?: boolean; permanent?: boolean; turnId?: string } = {},
  ): Promise<{ path: string; deleted: boolean; permanent: boolean }> {
    const { absPath, relPath } = this.resolvePath(targetPath);
    const turnId = options.turnId || 'turn-default';

    if (!fs.existsSync(absPath)) {
      throw new Error(`待删除文件/目录不存在: ${targetPath}`);
    }

    this.checkpointManager.recordPreMutation(turnId, relPath);

    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      fs.rmSync(absPath, { recursive: options.recursive ?? true, force: true });
    } else {
      fs.unlinkSync(absPath);
    }

    this.checkpointManager.recordPostMutation(turnId, relPath, 'delete');

    return {
      path: relPath,
      deleted: true,
      permanent: options.permanent ?? false,
    };
  }
}
