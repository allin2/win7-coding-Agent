/**
 * Encoding detection — BOM → UTF-8 → GBK → AMBIGUOUS.
 *
 * Detection order (PRD §8, Phase 4 task §3):
 *   1. BOM present  → return the BOM-indicated encoding immediately.
 *   2. No BOM, valid UTF-8 → 'utf-8' (confidence 0.95).
 *   3. Otherwise → 'ambiguous' (confidence 0) — never guess.
 */

import { Encoding, EncodingResult } from './types';

// Well-known BOM byte sequences
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

/**
 * Detect the encoding of a raw byte buffer.
 *
 * The function is pure and never throws — undecidable input yields
 * `{ encoding: 'ambiguous', bom: false, confidence: 0 }`.
 */
export function detectEncoding(buffer: Buffer): EncodingResult {
  // Empty buffer — treat as UTF-8 with full confidence.
  if (buffer.length === 0) {
    return { encoding: 'utf-8', bom: false, confidence: 1 };
  }

  // --- BOM detection (highest priority) ---
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(UTF8_BOM)) {
    return { encoding: 'utf-8', bom: true, confidence: 1 };
  }
  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(UTF16LE_BOM)) {
    return { encoding: 'utf-16le', bom: true, confidence: 1 };
  }
  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(UTF16BE_BOM)) {
    return { encoding: 'ambiguous', bom: true, confidence: 0 };
  }

  // --- Strict UTF-8 validation (no BOM) ---
  if (isValidUtf8(buffer)) {
    return { encoding: 'utf-8', bom: false, confidence: 0.95 };
  }

  // Node's ICU-backed decoder gives us a deterministic CP936/GBK probe. Do
  // not classify buffers containing NUL bytes as text: binary data frequently
  // happens to be decodable by legacy code pages.
  if (!buffer.includes(0x00) && looksLikeGbk(buffer) && isValidLegacyText(buffer, 'gbk')) {
    return { encoding: 'gbk', bom: false, confidence: 0.75 };
  }

  // --- Undecidable ---
  return { encoding: 'ambiguous', bom: false, confidence: 0 };
}

/** Decode a buffer using an explicit, persisted encoding contract. */
export function decodeBuffer(buffer: Buffer, encoding: Exclude<Encoding, 'ambiguous'>): string | undefined {
  try {
    const input = stripBom(buffer, encoding);
    const decoder = new TextDecoder(decoderLabel(encoding), { fatal: true });
    return decoder.decode(input);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// GBK/CP936 encoding (str → bytes) without new dependencies.
//
// Node's TextEncoder only supports UTF-8, but the built-in full-ICU
// TextDecoder('gbk') can decode every valid two-byte GBK sequence. We build
// the reverse table at runtime by decoding each sequence once; small-ICU
// builds report GBK_WRITE_UNSUPPORTED instead of silently corrupting bytes.
// ---------------------------------------------------------------------------

let gbkTableCache: Map<string, number> | null | undefined;

function getGbkEncodeTable(): Map<string, number> | null {
  if (gbkTableCache !== undefined) return gbkTableCache;
  let decoder: InstanceType<typeof TextDecoder>;
  try {
    decoder = new TextDecoder('gbk', { fatal: true });
  } catch (_err) {
    gbkTableCache = null;
    return null;
  }
  const table = new Map<string, number>();
  // GBK single byte 0x80 is the euro sign.
  try {
    const euro = decoder.decode(Buffer.from([0x80]));
    if (euro && euro !== '\ufffd') table.set(euro, 0x80);
  } catch (_err) { /* not representable in this runtime */ }
  const pair = Buffer.alloc(2);
  for (let lead = 0x81; lead <= 0xfe; lead += 1) {
    pair[0] = lead;
    for (let trail = 0x40; trail <= 0xfe; trail += 1) {
      if (trail === 0x7f) continue;
      pair[1] = trail;
      let text: string;
      try {
        text = decoder.decode(pair);
      } catch (_err) {
        continue;
      }
      if (text && text !== '\ufffd' && !table.has(text)) {
        table.set(text, (lead << 8) | trail);
      }
    }
  }
  gbkTableCache = table;
  return table;
}

export type WritableEncoding = 'utf-8' | 'gbk' | 'utf-16le';

export class EncodingWriteError extends Error {
  constructor(
    readonly code: 'GBK_WRITE_UNSUPPORTED' | 'GBK_UNMAPPABLE',
    message: string,
  ) {
    super(message);
    this.name = 'EncodingWriteError';
  }
}

/**
 * Encode text to bytes for a writable encoding. GBK uses the runtime reverse
 * table; failures are structured (never silently re-encoded as UTF-8).
 */
export function encodeText(text: string, encoding: WritableEncoding): Buffer {
  if (encoding === 'utf-8') return Buffer.from(text, 'utf8');
  if (encoding === 'utf-16le') return Buffer.from(text, 'utf16le');

  const table = getGbkEncodeTable();
  if (!table) {
    throw new EncodingWriteError(
      'GBK_WRITE_UNSUPPORTED',
      'This runtime lacks GBK decoding support (small-ICU build), so GBK bytes cannot be produced. Refusing to write UTF-8 bytes labelled as GBK.',
    );
  }
  const out = Buffer.alloc(text.length * 2);
  let written = 0;
  const unmappable = new Set<string>();
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7f) {
      out[written] = code;
      written += 1;
      continue;
    }
    const mapped = table.get(ch);
    if (mapped === undefined) {
      unmappable.add(ch);
      continue;
    }
    out[written] = mapped >> 8;
    out[written + 1] = mapped & 0xff;
    written += 2;
  }
  if (unmappable.size > 0) {
    throw new EncodingWriteError(
      'GBK_UNMAPPABLE',
      `Characters not representable in GBK: ${[...unmappable].map((c) => `U+${c.codePointAt(0)!.toString(16)}`).join(', ')}. Convert them or write as UTF-8.`,
    );
  }
  return out.subarray(0, written);
}

/** BOM prefixes for re-encoding a file with its original byte signature. */
export function bomPrefixFor(encoding: WritableEncoding, withBom: boolean): Buffer {
  if (!withBom) return Buffer.alloc(0);
  if (encoding === 'utf-8') return Buffer.from([0xef, 0xbb, 0xbf]);
  if (encoding === 'utf-16le') return Buffer.from([0xff, 0xfe]);
  return Buffer.alloc(0);
}

export type EolStyle = 'crlf' | 'lf' | 'none';

/**
 * Detect the dominant end-of-line style of decoded text.
 * 'none' means no line breaks exist at all.
 */
export function detectEolStyle(text: string): EolStyle {
  let crlf = 0;
  let lf = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      lf += 1;
      if (i > 0 && text[i - 1] === '\r') crlf += 1;
    }
  }
  if (lf === 0) return 'none';
  return crlf >= lf - crlf ? 'crlf' : 'lf';
}

/** Convert all line breaks in `text` to the requested style (content lines unchanged). */
export function normalizeEol(text: string, style: EolStyle): string {
  if (style === 'none') return text;
  const unified = text.replace(/\r\n/g, '\n');
  return style === 'crlf' ? unified.replace(/\n/g, '\r\n') : unified;
}

/**
 * Preserve the original file's trailing-newline contract on edited text:
 * if the original ended with a newline (LF or CRLF), the replacement keeps one;
 * if it did not, any trailing newline introduced by the replacement is removed.
 */
export function applyTrailingNewlinePolicy(original: string, replacement: string): string {
  const originalEndsWithNewline = original.endsWith('\n');
  const replacementEndsWithNewline = replacement.endsWith('\n');
  if (originalEndsWithNewline && !replacementEndsWithNewline) {
    return original.endsWith('\r\n') ? `${replacement}\r\n` : `${replacement}\n`;
  }
  if (!originalEndsWithNewline && replacementEndsWithNewline) {
    return replacement.replace(/(?:\r?\n)+$/, '');
  }
  return replacement;
}

export interface PreserveEncodingResult {
  buffer: Buffer;
  encoding: WritableEncoding;
  hadBom: boolean;
  eol: EolStyle;
}

/**
 * Re-encode edited text into the original file's encoding, BOM signature and
 * EOL style, preserving the trailing-newline contract. Never falls back to
 * UTF-8 for a non-UTF-8 original: failures throw EncodingWriteError.
 */
export function reencodePreservingOriginal(
  originalRaw: Buffer,
  originalDecoded: string,
  editedText: string,
  binding?: { encoding: WritableEncoding; bom: boolean },
): PreserveEncodingResult {
  const detection = detectEncoding(originalRaw);
  const encoding: WritableEncoding = binding
    ? binding.encoding
    : detection.encoding === 'ambiguous' ? 'utf-8' : (detection.encoding as WritableEncoding);
  const eol = detectEolStyle(originalDecoded);
  const normalized = eol === 'none' ? editedText : normalizeEol(editedText, eol);
  const withNewlinePolicy = applyTrailingNewlinePolicy(originalDecoded, normalized);
  const body = encodeText(withNewlinePolicy, encoding);
  const hadBom = binding ? binding.bom : detection.bom;
  const bom = bomPrefixFor(encoding, hadBom);
  return {
    buffer: bom.length > 0 ? Buffer.concat([bom, body]) : body,
    encoding,
    hadBom,
    eol,
  };
}

function isValidLegacyText(buffer: Buffer, encoding: 'gbk'): boolean {
  return decodeBuffer(buffer, encoding) !== undefined;
}

function looksLikeGbk(buffer: Buffer): boolean {
  let pairs = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    if (byte <= 0x7f) continue;
    const next = buffer[index + 1];
    if (byte < 0x81 || byte > 0xfe || next < 0x40 || next > 0xfe || next === 0x7f) return false;
    pairs += 1;
    index += 1;
  }
  // A single undecidable legacy pair is intentionally kept ambiguous. Two
  // coherent pairs are enough for a CP936/GBK text fixture without turning
  // arbitrary binary bytes into a writable text file.
  return pairs >= 2;
}

function decoderLabel(encoding: Exclude<Encoding, 'ambiguous'>): string {
  if (encoding === 'gbk') return 'gbk';
  if (encoding === 'utf-16le') return 'utf-16le';
  return 'utf-8';
}

function stripBom(buffer: Buffer, encoding: Exclude<Encoding, 'ambiguous'>): Buffer {
  if (encoding === 'utf-8' && buffer.subarray(0, 3).equals(UTF8_BOM)) return buffer.subarray(3);
  if (encoding === 'utf-16le' && buffer.subarray(0, 2).equals(UTF16LE_BOM)) return buffer.subarray(2);
  return buffer;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return `true` when `buffer` is a valid UTF-8 byte sequence.
 *
 * Uses the built-in TextDecoder in fatal mode (available in Node ≥ 16).
 */
function isValidUtf8(buffer: Buffer): boolean {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(buffer);
    return true;
  } catch {
    return false;
  }
}
