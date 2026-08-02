/**
 * Encoding detection — BOM → UTF-8 → GBK → AMBIGUOUS.
 *
 * Detection order (PRD §8, Phase 4 task §3):
 *   1. BOM present  → return the BOM-indicated encoding immediately.
 *   2. No BOM, valid UTF-8 → 'utf-8' (confidence 0.95).
 *   3. Otherwise → 'ambiguous' (confidence 0) — never guess.
 */

import { EncodingResult } from './types';

// Well-known BOM byte sequences
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);

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

  // --- Strict UTF-8 validation (no BOM) ---
  if (isValidUtf8(buffer)) {
    return { encoding: 'utf-8', bom: false, confidence: 0.95 };
  }

  // --- Undecidable ---
  return { encoding: 'ambiguous', bom: false, confidence: 0 };
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
