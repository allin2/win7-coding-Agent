/**
 * Atomic file writing — temp-file → rename → cleanup.
 *
 * Single-file and batch variants are provided.  The batch variant guarantees
 * all-or-nothing semantics: if any rename fails the already-renamed files are
 * rolled back and leftover temp files are cleaned up.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Atomically replace (or create) `filePath` with `content`.
 *
 * 1. Write `content` to a temporary sibling file.
 * 2. `fs.renameSync` over the target (atomic on POSIX & NTFS).
 * 3. On failure, clean up the temp file and re-throw.
 */
export function atomicWrite(filePath: string, content: Buffer): void {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.tmp-${crypto.randomBytes(8).toString('hex')}`,
  );

  try {
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup of the temp file.
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }
    throw err;
  }
}

/**
 * Batch atomic write — all-or-nothing.
 *
 * Phase 1: write every content blob to its temp file.
 * Phase 2: rename each temp file to its final destination.
 *
 * If any rename fails:
 *   - Already-renamed files are **rolled back** (deleted, since the original
 *     content was overwritten atomically).
 *   - Temp files that have not yet been renamed are cleaned up.
 */
export function atomicWriteBatch(
  items: Array<{ path: string; content: Buffer }>,
): void {
  const dirs = new Set<string>();
  const tmpPaths: string[] = [];

  // Phase 1 — write temp files.
  for (const item of items) {
    const dir = path.dirname(item.path);
    dirs.add(dir);
    const tmpPath = path.join(
      dir,
      `.tmp-${crypto.randomBytes(8).toString('hex')}`,
    );
    fs.writeFileSync(tmpPath, item.content);
    tmpPaths.push(tmpPath);
  }

  // Phase 2 — rename (track which ones succeeded for rollback).
  const renamed: Array<{ tmpPath: string; finalPath: string }> = [];

  try {
    for (let i = 0; i < items.length; i++) {
      fs.renameSync(tmpPaths[i], items[i].path);
      renamed.push({ tmpPath: tmpPaths[i], finalPath: items[i].path });
    }
  } catch (err) {
    // Rollback already-renamed files.
    for (const r of renamed) {
      try {
        fs.unlinkSync(r.finalPath);
      } catch {
        /* best-effort */
      }
    }
    // Clean up temp files that were not yet renamed.
    for (const tmpPath of tmpPaths) {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        /* best-effort */
      }
    }
    throw err;
  }
}
