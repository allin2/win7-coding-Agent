/**
 * Bounded, actual-result edit feedback.
 *
 * The edit service already holds the decoded original and the re-encoded
 * result. This module adds a local unified-style preview without splitting or
 * joining the whole file. The preview is deliberately marked non-applicable:
 * a truncated preview must never be mistaken for a complete patch.
 */

import * as crypto from 'crypto';

export const EDIT_FEEDBACK_SCHEMA_VERSION = '1.0';
export const DEFAULT_EDIT_DIFF_MAX_BYTES = 4 * 1024;
const MIN_EDIT_DIFF_MAX_BYTES = 256;
const CONTEXT_LINES = 2;
const LINE_CLIP_MARKER = '... [line clipped]';

export interface A9EditFeedbackV1 {
  schemaVersion: typeof EDIT_FEEDBACK_SCHEMA_VERSION;
  available: boolean;
  changed: boolean | null;
  firstChangedLine: number | null;
  unifiedDiff: string;
  truncated: boolean;
  patchApplicable: false;
  byteOnlyChange?: boolean;
  maxDiffBytes: number;
  renderedDiffBytes: number;
  beforeSha256: string;
  afterSha256: string;
  unavailableReason?: 'A9_EDIT_FEEDBACK_UNAVAILABLE' | 'A9_EDIT_FEEDBACK_SENSITIVE';
}

/**
 * Build feedback from the bytes and text that actually took part in the edit.
 * `afterText` must be decoded from the re-encoded result, not from the
 * pre-normalization replacement string.
 */
export function buildEditFeedback(
  beforeRaw: Buffer,
  afterRaw: Buffer,
  beforeText: string,
  afterText: string,
  options: { maxDiffBytes?: number } = {},
): A9EditFeedbackV1 {
  const maxDiffBytes = options.maxDiffBytes ?? DEFAULT_EDIT_DIFF_MAX_BYTES;
  if (!Number.isInteger(maxDiffBytes) || maxDiffBytes < MIN_EDIT_DIFF_MAX_BYTES) {
    throw new TypeError(`maxDiffBytes must be an integer of at least ${MIN_EDIT_DIFF_MAX_BYTES}`);
  }

  const beforeSha256 = sha256(beforeRaw);
  const afterSha256 = sha256(afterRaw);
  if (beforeRaw.equals(afterRaw)) {
    return {
      schemaVersion: EDIT_FEEDBACK_SCHEMA_VERSION,
      available: true,
      changed: false,
      firstChangedLine: null,
      unifiedDiff: '',
      truncated: false,
      patchApplicable: false,
      maxDiffBytes,
      renderedDiffBytes: 0,
      beforeSha256,
      afterSha256,
    };
  }

  if (beforeText === afterText) {
    return {
      schemaVersion: EDIT_FEEDBACK_SCHEMA_VERSION,
      available: true,
      changed: true,
      firstChangedLine: null,
      unifiedDiff: '[byte-level encoding/EOL change only; decoded text is unchanged]\n',
      truncated: false,
      patchApplicable: false,
      byteOnlyChange: true,
      maxDiffBytes,
      renderedDiffBytes: Buffer.byteLength('[byte-level encoding/EOL change only; decoded text is unchanged]\n', 'utf8'),
      beforeSha256,
      afterSha256,
    };
  }

  const prefix = commonPrefixLength(beforeText, afterText);
  const suffix = commonSuffixLength(beforeText, afterText, prefix);
  const lineBreaksBeforeChange = countLineBreaks(beforeText, 0, prefix);
  const beforeChangeStart = prefix;
  const beforeChangeEnd = beforeText.length - suffix;
  const afterChangeStart = prefix;
  const afterChangeEnd = afterText.length - suffix;
  const beforeChangeLine = lineBreaksBeforeChange + 1;

  const beforeBlock = affectedLineBlock(
    beforeText,
    beforeChangeStart,
    beforeChangeEnd,
    afterText,
    afterChangeStart,
    afterChangeEnd,
    'before',
  );
  const afterBlock = affectedLineBlock(
    beforeText,
    beforeChangeStart,
    beforeChangeEnd,
    afterText,
    afterChangeStart,
    afterChangeEnd,
    'after',
  );

  const builder = new BoundedDiffBuilder(maxDiffBytes);
  const beforeContextAnchor = beforeBlock ? beforeBlock.start : beforeChangeStart;
  for (const start of previousLineStarts(beforeText, lineStartAt(beforeText, beforeContextAnchor), CONTEXT_LINES)) {
    if (!builder.appendLine(' ', beforeText, start, lineEndAt(beforeText, start))) break;
  }

  if (beforeBlock) {
    for (const range of blockLines(beforeText, beforeBlock)) {
      if (!builder.appendLine('-', beforeText, range.start, range.end)) break;
    }
  }
  if (afterBlock) {
    for (const range of blockLines(afterText, afterBlock)) {
      if (!builder.appendLine('+', afterText, range.start, range.end)) break;
    }
  }

  let cursor = afterBlock ? afterBlock.end : afterChangeStart;
  for (let index = 0; index < CONTEXT_LINES && cursor < afterText.length; index += 1) {
    const end = nextLineEnd(afterText, cursor);
    if (!builder.appendLine(' ', afterText, cursor, end)) break;
    cursor = end;
  }

  return {
    schemaVersion: EDIT_FEEDBACK_SCHEMA_VERSION,
    available: true,
    changed: true,
    firstChangedLine: beforeChangeLine,
    unifiedDiff: builder.finish(),
    truncated: builder.wasTruncated(),
    patchApplicable: false,
    maxDiffBytes,
    renderedDiffBytes: builder.renderedBytes(),
    beforeSha256,
    afterSha256,
  };
}

/** A feedback failure must not turn a successful write into a failed edit. */
export function unavailableEditFeedback(
  beforeRaw: Buffer,
  afterRaw: Buffer,
  maxDiffBytes = DEFAULT_EDIT_DIFF_MAX_BYTES,
): A9EditFeedbackV1 {
  return {
    schemaVersion: EDIT_FEEDBACK_SCHEMA_VERSION,
    available: false,
    changed: null,
    firstChangedLine: null,
    unifiedDiff: '',
    truncated: false,
    patchApplicable: false,
    maxDiffBytes,
    renderedDiffBytes: 0,
    beforeSha256: sha256(beforeRaw),
    afterSha256: sha256(afterRaw),
    unavailableReason: 'A9_EDIT_FEEDBACK_UNAVAILABLE',
  };
}

function sha256(value: Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function commonPrefixLength(before: string, after: string): number {
  const limit = Math.min(before.length, after.length);
  let index = 0;
  while (index < limit && before.charCodeAt(index) === after.charCodeAt(index)) index += 1;
  return index;
}

function commonSuffixLength(before: string, after: string, prefix: number): number {
  const limit = Math.min(before.length, after.length) - prefix;
  let index = 0;
  while (
    index < limit
    && before.charCodeAt(before.length - 1 - index) === after.charCodeAt(after.length - 1 - index)
  ) {
    index += 1;
  }
  return index;
}

function countLineBreaks(text: string, start: number, end: number): number {
  let count = 0;
  for (let index = start; index < end; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 10 || (code === 13 && text.charCodeAt(index + 1) !== 10)) count += 1;
  }
  return count;
}

function lineStartAt(text: string, position: number): number {
  const bounded = Math.max(0, Math.min(position, text.length));
  for (let index = bounded - 1; index >= 0; index -= 1) {
    const code = text.charCodeAt(index);
    if (code === 10) return index + 1;
    if (code === 13) return text.charCodeAt(index + 1) === 10 ? index + 2 : index + 1;
  }
  return 0;
}

function nextLineEnd(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === 10) return index + 1;
    if (code === 13) return text.charCodeAt(index + 1) === 10 ? index + 2 : index + 1;
    index += 1;
  }
  return text.length;
}

function lineEndAt(text: string, position: number): number {
  if (text.length === 0) return 0;
  const bounded = Math.max(0, Math.min(position, text.length - 1));
  return nextLineEnd(text, bounded);
}

function previousLineStarts(text: string, firstLineStart: number, count: number): number[] {
  const starts: number[] = [];
  let current = firstLineStart;
  for (let index = 0; index < count && current > 0; index += 1) {
    current = previousLineStart(text, current);
    starts.unshift(current);
  }
  return starts;
}

function previousLineStart(text: string, currentLineStart: number): number {
  let lineBreakStart = currentLineStart - 1;
  if (
    lineBreakStart >= 1
    && text.charCodeAt(lineBreakStart) === 10
    && text.charCodeAt(lineBreakStart - 1) === 13
  ) {
    lineBreakStart -= 1;
  }
  for (let index = lineBreakStart - 1; index >= 0; index -= 1) {
    const code = text.charCodeAt(index);
    if (code === 10) return index + 1;
    if (code === 13) return text.charCodeAt(index + 1) === 10 ? index + 2 : index + 1;
  }
  return 0;
}

interface LineBlock {
  start: number;
  end: number;
}

function affectedLineBlock(
  beforeText: string,
  beforeStart: number,
  beforeEnd: number,
  afterText: string,
  afterStart: number,
  afterEnd: number,
  side: 'before' | 'after',
): LineBlock | null {
  const text = side === 'before' ? beforeText : afterText;
  const spanStart = side === 'before' ? beforeStart : afterStart;
  const spanEnd = side === 'before' ? beforeEnd : afterEnd;
  const insertion = beforeStart === beforeEnd;
  const deletion = afterStart === afterEnd;
  if (text.length === 0 && spanStart === spanEnd) return null;

  if (spanStart !== spanEnd) {
    return {
      start: lineStartAt(text, spanStart),
      end: lineEndAt(text, spanEnd - 1),
    };
  }

  if (insertion && side === 'before') {
    // Inserting one or more complete lines at a line boundary does not remove
    // the following line; it becomes context after the added lines.
    if (isLineBoundary(text, spanStart) && endsAtLineBoundary(afterText, afterEnd)) return null;
  }
  if (deletion && side === 'after') {
    // Deleting complete lines leaves no replacement line to render.
    if (isLineBoundary(beforeText, beforeStart) && endsAtLineBoundary(beforeText, beforeEnd)) return null;
  }

  if (spanStart === text.length) {
    // An insertion or partial deletion at EOF after a trailing newline creates
    // an empty final line; represent it without reading beyond the text.
    return { start: text.length, end: text.length };
  }
  return {
    start: lineStartAt(text, spanStart),
    end: lineEndAt(text, spanStart),
  };
}

function isLineBoundary(text: string, position: number): boolean {
  if (position === 0 || position === text.length) return true;
  const previous = text.charCodeAt(position - 1);
  return previous === 10 || previous === 13;
}

function endsAtLineBoundary(text: string, position: number): boolean {
  if (position === 0 || position === text.length) return true;
  const previous = text.charCodeAt(position - 1);
  return previous === 10 || previous === 13;
}

function* blockLines(
  text: string,
  block: LineBlock,
): Generator<{ start: number; end: number }> {
  if (block.start === block.end) {
    if (block.start === text.length) yield { start: block.start, end: block.end };
    return;
  }
  let cursor = block.start;
  while (cursor < block.end) {
    const end = nextLineEnd(text, cursor);
    yield { start: cursor, end: Math.min(end, block.end) };
    cursor = end;
  }
}

class BoundedDiffBuilder {
  private readonly chunks: string[] = [];
  private usedBytes = 0;
  private truncated = false;
  private readonly contentLimit: number;
  private readonly notice: string;

  constructor(private readonly maxBytes: number) {
    this.notice = `\n[diff preview truncated at ${maxBytes} bytes; not a complete patch]\n`;
    this.contentLimit = Math.max(0, maxBytes - Buffer.byteLength(this.notice, 'utf8'));
  }

  appendLine(marker: ' ' | '-' | '+', text: string, start: number, end: number): boolean {
    const lineEnd = contentEnd(text, start, end);
    const fixedBytes = Buffer.byteLength(`${marker}`, 'utf8') + 1;
    if (this.usedBytes + fixedBytes > this.contentLimit) {
      this.truncated = true;
      return false;
    }

    const remaining = this.contentLimit - this.usedBytes - fixedBytes;
    const taken = takeUtf8Prefix(text, start, lineEnd, remaining);
    let content = taken.text;
    let clipped = taken.truncated;
    if (clipped) {
      const markerBytes = Buffer.byteLength(LINE_CLIP_MARKER, 'utf8');
      if (remaining > markerBytes) {
        const beforeMarker = takeUtf8Prefix(text, start, lineEnd, remaining - markerBytes);
        content = `${beforeMarker.text}${LINE_CLIP_MARKER}`;
        clipped = true;
      } else {
        content = '';
        clipped = true;
      }
    }

    const line = `${marker}${content}\n`;
    if (this.usedBytes + Buffer.byteLength(line, 'utf8') > this.contentLimit) {
      this.truncated = true;
      return false;
    }
    this.chunks.push(line);
    this.usedBytes += Buffer.byteLength(line, 'utf8');
    if (clipped) this.truncated = true;
    return !clipped;
  }

  finish(): string {
    if (!this.truncated) return this.chunks.join('');
    return `${this.chunks.join('')}${this.notice}`;
  }

  wasTruncated(): boolean {
    return this.truncated;
  }

  renderedBytes(): number {
    return Buffer.byteLength(this.finish(), 'utf8');
  }
}

function contentEnd(text: string, start: number, end: number): number {
  let contentEndIndex = end;
  if (contentEndIndex > start && text.charCodeAt(contentEndIndex - 1) === 10) contentEndIndex -= 1;
  if (contentEndIndex > start && text.charCodeAt(contentEndIndex - 1) === 13) contentEndIndex -= 1;
  return contentEndIndex;
}

function takeUtf8Prefix(
  text: string,
  start: number,
  end: number,
  maxBytes: number,
): { text: string; truncated: boolean } {
  if (end <= start || maxBytes <= 0) return { text: '', truncated: end > start };
  // A UTF-16 code unit contributes at most four UTF-8 bytes, so this slice is
  // sufficient to fill the byte budget without copying a huge single line.
  let charLimit = Math.min(end, start + maxBytes);
  if (charLimit < end && isHighSurrogate(text.charCodeAt(charLimit - 1))) charLimit -= 1;
  const slice = text.slice(start, charLimit);
  const bytes = Buffer.from(slice, 'utf8');
  if (bytes.length <= maxBytes && charLimit === end) {
    return { text: slice, truncated: false };
  }
  if (bytes.length <= maxBytes) {
    return { text: slice, truncated: true };
  }

  let byteEnd = Math.min(maxBytes, bytes.length);
  while (byteEnd > 0 && (bytes[byteEnd] & 0xc0) === 0x80) byteEnd -= 1;
  return {
    text: bytes.subarray(0, byteEnd).toString('utf8'),
    truncated: true,
  };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
