/**
 * Diff contract — compare shadow state against the real filesystem.
 */

import * as crypto from 'crypto';
import { TextDecoder } from 'util';
import { ContentDiffPreview, DiffEntry, DiffResult } from './types';

const DEFAULT_PREVIEW_BYTES = 64 * 1024;
const CONTEXT_LINES = 3;

/**
 * Compute the set of changes between the original filesystem state and the
 * current shadow state.
 *
 * @param originals  Map of absolute-path → original content (null = did not exist).
 * @param current    Map of absolute-path → current shadow content.
 */
export function computeDiff(
  originals: Map<string, Buffer | null>,
  current: Map<string, Buffer>,
): DiffResult {
  const entries: DiffEntry[] = [];

  // Paths that exist in the shadow.
  for (const [filePath, content] of current.entries()) {
    const original = originals.get(filePath);

    if (original === null || original === undefined) {
      // File did not exist on disk → added.
      entries.push({
        path: filePath,
        status: 'added',
        preview: buildContentDiffPreview(null, content),
      });
    } else if (!original.equals(content)) {
      entries.push({
        path: filePath,
        status: 'modified',
        preview: buildContentDiffPreview(original, content),
      });
    }
    // else: identical — no entry needed.
  }

  // Paths that existed originally but are absent from the shadow → deleted.
  for (const [filePath] of originals.entries()) {
    if (!current.has(filePath)) {
      entries.push({
        path: filePath,
        status: 'deleted',
        preview: buildContentDiffPreview(originals.get(filePath) ?? null, null),
      });
    }
  }

  return { entries };
}

/**
 * Produce a deterministic, bounded content preview. Binary/undecodable input
 * is never guessed; callers still receive hashes and an explicit marker.
 */
export function buildContentDiffPreview(
  before: Buffer | null,
  after: Buffer | null,
  maxPreviewBytes = DEFAULT_PREVIEW_BYTES,
): ContentDiffPreview {
  if (!Number.isInteger(maxPreviewBytes) || maxPreviewBytes < 256) {
    throw new TypeError('maxPreviewBytes must be an integer of at least 256 bytes');
  }
  const beforeText = decodeUtf8(before);
  const afterText = decodeUtf8(after);
  const binary = beforeText === undefined || afterText === undefined;
  if (binary) {
    return {
      schemaVersion: '1.0',
      encoding: 'binary',
      beforeSha256: digest(before),
      afterSha256: digest(after),
      startLine: 1,
      removedLineCount: 0,
      addedLineCount: 0,
      unifiedDiff: '[binary or non-UTF-8 content changed; inspect the byte hashes before approval]',
      truncated: false,
    };
  }

  const beforeLines = lines(beforeText);
  const afterLines = lines(afterText);
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  const contextBefore = beforeLines.slice(Math.max(0, prefix - CONTEXT_LINES), prefix);
  const contextAfter = afterLines.slice(afterLines.length - suffix, afterLines.length - suffix + CONTEXT_LINES);
  const header = `@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`;
  const rendered = [
    header,
    ...contextBefore.map((line) => ` ${line}`),
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...contextAfter.map((line) => ` ${line}`),
  ].join('\n');
  const capped = capUtf8(rendered, maxPreviewBytes);
  return {
    schemaVersion: '1.0',
    encoding: 'utf-8',
    beforeSha256: digest(before),
    afterSha256: digest(after),
    startLine: prefix + 1,
    removedLineCount: removed.length,
    addedLineCount: added.length,
    unifiedDiff: capped.text,
    truncated: capped.truncated,
  };
}

function decodeUtf8(value: Buffer | null): string | undefined {
  if (value === null) return '';
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const bomBytes = value.length >= 3 && value[0] === 0xef && value[1] === 0xbb && value[2] === 0xbf
      ? value.subarray(3)
      : value;
    return decoder.decode(bomBytes);
  } catch {
    return undefined;
  }
}

function lines(value: string): string[] {
  if (value.length === 0) return [];
  return value.split(/\r\n|\n|\r/);
}

function digest(value: Buffer | null): string | null {
  return value === null
    ? null
    : crypto.createHash('sha256').update(value).digest('hex');
}

function capUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return { text: value, truncated: false };
  const notice = Buffer.from('\n[diff preview truncated; narrow the edit or inspect the target range]\n', 'utf8');
  const available = Math.max(0, maxBytes - notice.length);
  const head = Math.floor(available / 2);
  const tail = available - head;
  let headEnd = head;
  while (headEnd > 0 && (bytes[headEnd] & 0xc0) === 0x80) headEnd -= 1;
  let tailStart = bytes.length - tail;
  while (tailStart < bytes.length && (bytes[tailStart] & 0xc0) === 0x80) tailStart += 1;
  return {
    text: Buffer.concat([
      bytes.subarray(0, headEnd),
      notice,
      bytes.subarray(tailStart),
    ]).toString('utf8'),
    truncated: true,
  };
}
