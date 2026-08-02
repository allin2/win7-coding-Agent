/**
 * Exact anchor replacement frontend for WritePlan.
 *
 * It never writes directly: successful replacement produces the same
 * base-SHA-bound plan consumed by the existing approval and rollback path.
 */

import * as fs from 'fs';
import {
  CreateTextReplacePlanOptions,
  TextReplacementPlan,
  WorkspaceError,
} from './types';
import { detectEncoding } from './encoding';
import { createPlan } from './plan';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export function createTextReplacePlan(
  targetPath: string,
  oldText: string,
  newText: string,
  options: CreateTextReplacePlanOptions = {},
): TextReplacementPlan {
  if (oldText.length === 0 || oldText === newText) {
    throw new WorkspaceError(
      'ANCHOR_INVALID',
      'oldText must be non-empty and different from newText; read the target range and provide an exact anchor.',
    );
  }
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    throw new WorkspaceError(
      'PATH_NOT_FILE',
      `Anchor replacement requires an existing file: ${targetPath}. List the parent directory and select a file before retrying.`,
    );
  }
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new WorkspaceError('ANCHOR_INVALID', 'maxFileBytes must be a positive integer');
  }
  const original = fs.readFileSync(targetPath);
  if (original.length > maxFileBytes) {
    throw new WorkspaceError(
      'FILE_TOO_LARGE',
      `Anchor replacement refused ${original.length} bytes (limit ${maxFileBytes}); narrow the file or use an approved streaming edit tool.`,
    );
  }
  const encoding = detectEncoding(original);
  if (encoding.encoding !== 'utf-8') {
    throw new WorkspaceError(
      'ENCODING_AMBIGUOUS',
      `Anchor replacement requires unambiguous UTF-8 input; detected ${encoding.encoding}. Read as bytes or use an encoding-specific approved plan.`,
    );
  }

  const hasBom = original.subarray(0, 3).equals(UTF8_BOM);
  const content = original.subarray(hasBom ? 3 : 0).toString('utf8');
  const positions = findMatches(content, oldText);
  if (positions.length === 0) {
    const candidate = closestSnippet(content, oldText);
    throw new WorkspaceError(
      'ANCHOR_NOT_FOUND',
      `Exact anchor was not found in ${targetPath}.${candidate ? ` Closest text starts at line ${candidate.line}: ${JSON.stringify(candidate.text)}.` : ''} Re-read that range and retry with the exact current text.`,
    );
  }
  if (positions.length > 1) {
    const lines = positions.slice(0, 5).map((position) => lineAt(content, position)).join(', ');
    throw new WorkspaceError(
      'ANCHOR_AMBIGUOUS',
      `Exact anchor matched ${positions.length} locations in ${targetPath} (first lines: ${lines}); include more surrounding text so the anchor is unique.`,
    );
  }

  const position = positions[0];
  const replaced = content.slice(0, position) + newText + content.slice(position + oldText.length);
  const body = Buffer.from(replaced, 'utf8');
  const updated = hasBom ? Buffer.concat([UTF8_BOM, body]) : body;
  const plan = createPlan(targetPath, updated, {
    encoding: 'utf-8',
    createDirectories: options.createDirectories ?? false,
    maxPreviewBytes: options.maxPreviewBytes,
  });
  return {
    plan,
    preview: plan.operations[0].preview!,
    matchLine: lineAt(content, position),
  };
}

function findMatches(content: string, anchor: string): number[] {
  const matches: number[] = [];
  let offset = 0;
  while (offset <= content.length - anchor.length) {
    const position = content.indexOf(anchor, offset);
    if (position < 0) break;
    matches.push(position);
    // Advance by one code unit so overlapping matches are also classified as
    // ambiguous instead of silently selecting the first occurrence.
    offset = position + 1;
  }
  return matches;
}

function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 10 || (code === 13 && content.charCodeAt(index + 1) !== 10)) line += 1;
  }
  return line;
}

function closestSnippet(content: string, anchor: string): { line: number; text: string } | undefined {
  const contentLines = content.split(/\r\n|\n|\r/);
  if (contentLines.length === 0) return undefined;
  const anchorLineCount = Math.max(1, anchor.split(/\r\n|\n|\r/).length);
  let best = { line: 1, text: '', score: -1 };
  for (let index = 0; index < contentLines.length; index += 1) {
    const text = contentLines.slice(index, index + anchorLineCount).join('\n');
    const score = diceSimilarity(anchor, text);
    if (score > best.score) best = { line: index + 1, text, score };
  }
  const bounded = best.text.length > 400 ? best.text.slice(0, 400) + '…' : best.text;
  return { line: best.line, text: bounded };
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
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 2) return normalized ? [normalized] : [];
  const result: string[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.push(normalized.slice(index, index + 2));
  }
  return result;
}
