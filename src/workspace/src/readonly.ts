/**
 * Bounded, deterministic read-only workspace tools for model consumption.
 *
 * These functions perform no writes and never invoke a shell. Every path is
 * resolved through the same workspace boundary logic used by Apply.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';
import {
  ReadTextLine,
  ReadTextOptions,
  ReadTextResult,
  SearchTextMatch,
  SearchTextOptions,
  SearchTextResult,
  SearchTruncationReason,
  ListDirectoryEntry,
  ListDirectoryOptions,
  ListDirectoryResult,
  WorkspaceError,
  WorkspaceErrorCode,
} from './types';
import { validatePath } from './safety';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const DEFAULT_READ_LINES = 200;
const DEFAULT_READ_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_READ_FILE_BYTES = 4 * 1024 * 1024;
const DEFAULT_SEARCH_MATCHES = 200;
const DEFAULT_SEARCH_CONTEXT = 2;
const DEFAULT_SEARCH_FILES = 2_000;
const DEFAULT_SEARCH_BYTES = 64 * 1024 * 1024;
const DEFAULT_SEARCH_FILE_BYTES = 1024 * 1024;
const DEFAULT_SEARCH_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_IGNORED_NAMES = ['.git', 'node_modules', 'dist'];
const DEFAULT_LIST_ENTRIES = 500;
const DEFAULT_LIST_OUTPUT_BYTES = 64 * 1024;

/** A deterministic one-level listing; recursion requires another explicit call. */
export function listDirectory(options: ListDirectoryOptions): ListDirectoryResult {
  const maxEntries = options.maxEntries ?? DEFAULT_LIST_ENTRIES;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_LIST_OUTPUT_BYTES;
  assertPositiveInteger(maxEntries, 'maxEntries');
  assertPositiveInteger(maxOutputBytes, 'maxOutputBytes', 256);
  const target = resolveInside(options.path ?? '', options.workspaceRoot);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw pathError(
      'PATH_NOT_DIRECTORY',
      target,
      options.workspaceRoot,
      'list_directory requires an existing directory',
    );
  }
  const all = fs.readdirSync(target, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  const entries: ListDirectoryEntry[] = [];
  const reasons = new Set<ListDirectoryResult['truncationReasons'][number]>();
  let outputBytes = 0;
  for (const entry of all) {
    if (entries.length >= maxEntries) {
      reasons.add('entry_limit');
      break;
    }
    const absolute = path.join(target, entry.name);
    const item: ListDirectoryEntry = {
      name: entry.name,
      path: relativePath(absolute, options.workspaceRoot),
      type: entry.isDirectory()
        ? 'directory'
        : entry.isFile()
          ? 'file'
          : entry.isSymbolicLink()
            ? 'symlink'
            : 'other',
      ...(!entry.isSymbolicLink() && entry.isFile()
        ? { size: fs.statSync(absolute).size }
        : {}),
    };
    const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8');
    if (outputBytes + itemBytes > maxOutputBytes) {
      reasons.add('output_bytes');
      break;
    }
    entries.push(item);
    outputBytes += itemBytes;
  }
  return {
    schemaVersion: '1.0',
    path: relativePath(target, options.workspaceRoot),
    depth: 1,
    entries,
    returnedEntries: entries.length,
    totalEntries: all.length,
    truncated: reasons.size > 0,
    truncationReasons: Array.from(reasons),
  };
}

export function readText(options: ReadTextOptions): ReadTextResult {
  assertPositiveInteger(options.startLine ?? 1, 'startLine');
  assertPositiveInteger(options.maxLines ?? DEFAULT_READ_LINES, 'maxLines');
  assertPositiveInteger(options.maxOutputBytes ?? DEFAULT_READ_OUTPUT_BYTES, 'maxOutputBytes', 256);
  assertPositiveInteger(options.maxFileBytes ?? DEFAULT_READ_FILE_BYTES, 'maxFileBytes');
  const startLine = options.startLine ?? 1;
  const maxLines = options.maxLines ?? DEFAULT_READ_LINES;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_READ_OUTPUT_BYTES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_READ_FILE_BYTES;
  assertMaximum(maxLines, 1_000, 'maxLines');
  assertMaximum(maxOutputBytes, 262_144, 'maxOutputBytes');
  assertMaximum(maxFileBytes, 32 * 1024 * 1024, 'maxFileBytes');
  const target = resolveInside(options.path, options.workspaceRoot);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw pathError(
      'PATH_NOT_FILE',
      target,
      options.workspaceRoot,
      'read_text requires an existing file',
    );
  }
  const stat = fs.statSync(target);
  if (stat.size > maxFileBytes) {
    throw new WorkspaceError(
      'FILE_TOO_LARGE',
      `read_text refused ${stat.size} bytes (limit ${maxFileBytes}) for ${relativePath(target, options.workspaceRoot)}; request a narrower indexed/search view or raise the reviewed file budget.`,
    );
  }
  const encoding = options.encoding ?? 'utf-8';
  const decoded = decodeCompleteText(fs.readFileSync(target), target, encoding);
  const allLines = splitLines(decoded);
  if (allLines.length > 0 && startLine > allLines.length) {
    throw new WorkspaceError(
      'INVALID_TOOL_INPUT',
      `startLine ${startLine} exceeds the file's ${allLines.length} lines; retry with startLine 1..${allLines.length}.`,
    );
  }
  const selected = allLines.slice(startLine - 1, startLine - 1 + maxLines);
  const rendered: string[] = [];
  const lines: ReadTextLine[] = [];
  const reasons = new Set<ReadTextResult['truncationReasons'][number]>();
  let usedBytes = 0;

  for (let index = 0; index < selected.length; index += 1) {
    const lineNumber = startLine + index;
    const prefix = `${lineNumber}: `;
    const separatorBytes = rendered.length === 0 ? 0 : 1;
    const remaining = maxOutputBytes - usedBytes - separatorBytes;
    if (remaining < Buffer.byteLength(prefix, 'utf8') + Buffer.byteLength('[line truncated]', 'ascii')) {
      reasons.add('output_bytes');
      break;
    }
    const full = prefix + selected[index];
    const bounded = capUtf8Line(full, remaining);
    if (bounded.truncated) reasons.add('line_bytes');
    rendered.push(bounded.text);
    lines.push({ line: lineNumber, text: bounded.text.slice(prefix.length) });
    usedBytes += separatorBytes + Buffer.byteLength(bounded.text, 'utf8');
    if (bounded.truncated) {
      reasons.add('output_bytes');
      break;
    }
  }
  if (startLine - 1 + selected.length < allLines.length) reasons.add('line_limit');
  if (lines.length < selected.length) reasons.add('output_bytes');
  return {
    schemaVersion: '1.0',
    path: relativePath(target, options.workspaceRoot),
    encoding,
    totalLines: allLines.length,
    startLine,
    endLine: lines.length > 0 ? lines[lines.length - 1].line : Math.min(startLine - 1, allLines.length),
    lines,
    content: rendered.join('\n'),
    truncated: reasons.size > 0,
    truncationReasons: Array.from(reasons),
  };
}

export function searchText(options: SearchTextOptions): SearchTextResult {
  if (!options.pattern) {
    throw new WorkspaceError(
      'INVALID_TOOL_INPUT',
      'search_text pattern must be non-empty; provide literal text and narrow path/context when possible.',
    );
  }
  if (Buffer.byteLength(options.pattern, 'utf8') > 4_096) {
    throw new WorkspaceError(
      'INVALID_TOOL_INPUT',
      'search_text pattern exceeds 4096 UTF-8 bytes; use a shorter literal and narrow the search path.',
    );
  }
  const maxMatches = options.maxMatches ?? DEFAULT_SEARCH_MATCHES;
  const contextLines = options.contextLines ?? DEFAULT_SEARCH_CONTEXT;
  const maxFiles = options.maxFiles ?? DEFAULT_SEARCH_FILES;
  const maxScannedBytes = options.maxScannedBytes ?? DEFAULT_SEARCH_BYTES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_SEARCH_FILE_BYTES;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_SEARCH_OUTPUT_BYTES;
  assertPositiveInteger(maxMatches, 'maxMatches');
  assertNonNegativeInteger(contextLines, 'contextLines');
  assertPositiveInteger(maxFiles, 'maxFiles');
  assertPositiveInteger(maxScannedBytes, 'maxScannedBytes');
  assertPositiveInteger(maxFileBytes, 'maxFileBytes');
  assertPositiveInteger(maxOutputBytes, 'maxOutputBytes', 256);
  assertMaximum(maxMatches, 500, 'maxMatches');
  assertMaximum(contextLines, 10, 'contextLines');
  assertMaximum(maxFiles, 20_000, 'maxFiles');
  assertMaximum(maxScannedBytes, 1024 * 1024 * 1024, 'maxScannedBytes');
  assertMaximum(maxFileBytes, 32 * 1024 * 1024, 'maxFileBytes');
  assertMaximum(maxOutputBytes, 1024 * 1024, 'maxOutputBytes');
  const root = resolveInside(options.path ?? '', options.workspaceRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw pathError(
      'PATH_NOT_DIRECTORY',
      root,
      options.workspaceRoot,
      'search_text requires an existing directory',
    );
  }

  const ignored = new Set(options.ignoredNames ?? DEFAULT_IGNORED_NAMES);
  const matches: SearchTextMatch[] = [];
  const reasons = new Set<SearchTruncationReason>();
  let totalMatches = 0;
  let scannedFiles = 0;
  let scannedBytes = 0;
  let returnedBytes = 0;
  let skippedBinary = 0;
  let skippedUnreadable = 0;
  let skippedOversized = 0;
  let totalMatchesExact = true;
  const queue = [root];

  while (queue.length > 0) {
    const directory = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      skippedUnreadable += 1;
      totalMatchesExact = false;
      reasons.add('unreadable');
      continue;
    }
    for (const entry of entries) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const itemPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        queue.push(itemPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (scannedFiles >= maxFiles) {
        reasons.add('file_count');
        totalMatchesExact = false;
        queue.length = 0;
        break;
      }
      if (scannedBytes >= maxScannedBytes) {
        reasons.add('scanned_bytes');
        totalMatchesExact = false;
        queue.length = 0;
        break;
      }
      scannedFiles += 1;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(itemPath);
      } catch {
        skippedUnreadable += 1;
        totalMatchesExact = false;
        reasons.add('unreadable');
        continue;
      }
      const available = maxScannedBytes - scannedBytes;
      const readBytes = Math.min(stat.size, maxFileBytes, available);
      let bytes: Buffer;
      try {
        bytes = readPrefix(itemPath, readBytes);
      } catch {
        skippedUnreadable += 1;
        totalMatchesExact = false;
        reasons.add('unreadable');
        continue;
      }
      scannedBytes += bytes.length;
      if (stat.size > bytes.length) {
        skippedOversized += 1;
        totalMatchesExact = false;
        reasons.add(stat.size > maxFileBytes ? 'file_too_large' : 'scanned_bytes');
      }
      if (bytes.includes(0)) {
        skippedBinary += 1;
        totalMatchesExact = false;
        reasons.add('unsupported_encoding');
        continue;
      }
      const text = decodeUtf8Prefix(bytes);
      if (text === undefined) {
        skippedBinary += 1;
        totalMatchesExact = false;
        reasons.add('unsupported_encoding');
        continue;
      }
      const fileLines = splitLines(text);
      for (let index = 0; index < fileLines.length; index += 1) {
        if (!fileLines[index].includes(options.pattern)) continue;
        totalMatches += 1;
        if (matches.length >= maxMatches) {
          reasons.add('matches');
          continue;
        }
        const match: SearchTextMatch = {
          path: relativePath(itemPath, options.workspaceRoot),
          line: index + 1,
          text: fileLines[index].slice(0, 1_000),
          before: context(fileLines, Math.max(0, index - contextLines), index),
          after: context(fileLines, index + 1, Math.min(fileLines.length, index + 1 + contextLines)),
        };
        const matchBytes = Buffer.byteLength(JSON.stringify(match), 'utf8');
        if (returnedBytes + matchBytes > maxOutputBytes) {
          reasons.add('output_bytes');
          continue;
        }
        matches.push(match);
        returnedBytes += matchBytes;
      }
    }
  }

  return {
    schemaVersion: '1.0',
    pattern: options.pattern,
    root: relativePath(root, options.workspaceRoot),
    matches,
    returnedMatches: matches.length,
    totalMatches,
    totalMatchesExact,
    scannedFiles,
    scannedBytes,
    skippedBinary,
    skippedUnreadable,
    skippedOversized,
    truncated: reasons.size > 0,
    truncationReasons: Array.from(reasons),
  };
}

function resolveInside(targetPath: string, workspaceRoot: string): string {
  if (!workspaceRoot || !fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
    throw new WorkspaceError(
      'WORKSPACE_ROOT_INVALID',
      `Workspace root is not an existing directory: ${workspaceRoot}`,
    );
  }
  const validation = validatePath(targetPath, workspaceRoot);
  if (!validation.valid) {
    throw new WorkspaceError(
      'WORKSPACE_BOUNDARY_VIOLATION',
      `${validation.error ?? 'Path is outside the workspace'}; use a workspace-relative path.`,
    );
  }
  return validation.resolvedPath;
}

function pathError(
  code: Extract<WorkspaceErrorCode, 'PATH_NOT_FILE' | 'PATH_NOT_DIRECTORY'>,
  target: string,
  workspaceRoot: string,
  requirement: string,
): WorkspaceError {
  const candidates = candidateNames(target, workspaceRoot);
  const suffix = candidates.length > 0
    ? ` Similar entries: ${candidates.join(', ')}.`
    : ' List the parent directory to discover the current path.';
  return new WorkspaceError(
    code,
    `${requirement}: ${relativePath(target, workspaceRoot)}.${suffix}`,
  );
}

function candidateNames(target: string, workspaceRoot: string): string[] {
  const parent = path.dirname(target);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) return [];
  const requested = path.basename(target).toLowerCase();
  try {
    return fs.readdirSync(parent)
      .map((name) => ({ name, score: diceSimilarity(requested, name.toLowerCase()) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .slice(0, 5)
      .map(({ name }) => relativePath(path.join(parent, name), workspaceRoot));
  } catch {
    return [];
  }
}

function decodeCompleteText(bytes: Buffer, target: string, encoding: 'utf-8' | 'gbk'): string {
  const value = decodeText(bytes, encoding);
  if (value === undefined) {
    const detail = encoding === 'utf-8'
      ? `read_text requires unambiguous UTF-8: ${target}; use a byte-preserving or encoding-specific tool.`
      : `read_text could not decode ${target} as explicit ${encoding}; retry with the known file encoding.`;
    throw new WorkspaceError(
      'ENCODING_AMBIGUOUS',
      detail,
    );
  }
  return value;
}

function decodeUtf8Prefix(bytes: Buffer): string | undefined {
  for (let trim = 0; trim <= Math.min(3, bytes.length); trim += 1) {
    const decoded = decodeUtf8(bytes.subarray(0, bytes.length - trim));
    if (decoded !== undefined) return decoded;
  }
  return undefined;
}

function decodeUtf8(bytes: Buffer): string | undefined {
  return decodeText(bytes, 'utf-8');
}

function decodeText(bytes: Buffer, encoding: 'utf-8' | 'gbk'): string | undefined {
  try {
    const body = encoding === 'utf-8' && bytes.subarray(0, 3).equals(UTF8_BOM)
      ? bytes.subarray(3)
      : bytes;
    return new TextDecoder(encoding, { fatal: true }).decode(body);
  } catch {
    return undefined;
  }
}

function readPrefix(filePath: string, bytes: number): Buffer {
  if (bytes <= 0) return Buffer.alloc(0);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const count = fs.readSync(descriptor, buffer, 0, bytes, 0);
    return buffer.subarray(0, count);
  } finally {
    fs.closeSync(descriptor);
  }
}

function splitLines(value: string): string[] {
  if (value.length === 0) return [];
  const result = value.split(/\r\n|\n|\r/);
  if (result[result.length - 1] === '') result.pop();
  return result;
}

function context(lines: string[], start: number, end: number) {
  return lines.slice(start, end).map((text, index) => ({
    line: start + index + 1,
    text: text.slice(0, 1_000),
  }));
}

function capUtf8Line(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return { text: value, truncated: false };
  const marker = Buffer.from('[line truncated]', 'ascii');
  if (maxBytes <= marker.length) {
    return { text: marker.subarray(0, maxBytes).toString('utf8'), truncated: true };
  }
  let end = maxBytes - marker.length;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return {
    text: Buffer.concat([bytes.subarray(0, end), marker]).toString('utf8'),
    truncated: true,
  };
}

function relativePath(target: string, workspaceRoot: string): string {
  let root = path.resolve(workspaceRoot);
  try {
    root = fs.realpathSync(root);
  } catch {
    // The public entry points already require an existing root. Retaining the
    // resolved lexical path here keeps error reporting deterministic.
  }
  const relative = path.relative(root, target);
  return relative === '' ? '.' : relative.replace(/\\/g, '/');
}

function assertPositiveInteger(value: number, name: string, minimum = 1): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new WorkspaceError(
      'INVALID_TOOL_INPUT',
      `${name} must be an integer >= ${minimum}; correct the structured parameter and retry.`,
    );
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new WorkspaceError(
      'INVALID_TOOL_INPUT',
      `${name} must be a non-negative integer; correct the structured parameter and retry.`,
    );
  }
}

function assertMaximum(value: number, maximum: number, name: string): void {
  if (value > maximum) {
    throw new WorkspaceError(
      'INVALID_TOOL_INPUT',
      `${name} must be <= ${maximum}; narrow the request and retry.`,
    );
  }
}

function diceSimilarity(left: string, right: string): number {
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.length === 0 || b.length === 0) return left === right ? 1 : 0;
  const counts = new Map<string, number>();
  for (const value of a) counts.set(value, (counts.get(value) ?? 0) + 1);
  let overlap = 0;
  for (const value of b) {
    const count = counts.get(value) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(value, count - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : [];
  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    result.push(value.slice(index, index + 2));
  }
  return result;
}
