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
