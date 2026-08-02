/**
 * Plan phase — generate a write plan without performing any I/O.
 *
 * A `WritePlan` captures every target file together with the SHA-256 of its
 * current on-disk content (`baseSha256`).  The hash is later verified during
 * Apply to prevent blind overwrites of concurrently-modified files.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  WriteOperation,
  WritePlan,
  CreatePlanOptions,
} from './types';
import { buildContentDiffPreview } from './diff';

const PLAN_VERSION = '0.1.0';

/**
 * Build a `WritePlan` for a single target file.
 *
 * This function is **pure** — it reads the existing file only to compute the
 * `baseSha256` and never writes anything.
 */
export function createPlan(
  targetPath: string,
  content: Buffer,
  options: CreatePlanOptions = {},
): WritePlan {
  const encoding = options.encoding ?? 'utf-8';
  const createDirectories = options.createDirectories ?? true;

  // Compute base SHA-256 (null → new file).
  let baseSha256: string | undefined;
  let existing: Buffer | null = null;
  if (fs.existsSync(targetPath)) {
    existing = fs.readFileSync(targetPath);
    baseSha256 = sha256(existing);
  }

  const operation: WriteOperation = {
    path: targetPath,
    content: Buffer.from(content),
    encoding,
    createDirectories,
    baseSha256,
    preview: buildContentDiffPreview(existing, content, options.maxPreviewBytes),
  };

  return {
    operations: [operation],
    timestamp: new Date().toISOString(),
    version: PLAN_VERSION,
  };
}

/**
 * Build a `WritePlan` for multiple target files at once.
 */
export function createPlanBatch(
  items: Array<{
    path: string;
    content: Buffer;
    options?: CreatePlanOptions;
  }>,
): WritePlan {
  const operations: WriteOperation[] = items.map((item) => {
    const encoding = item.options?.encoding ?? 'utf-8';
    const createDirectories = item.options?.createDirectories ?? true;

    let baseSha256: string | undefined;
    let existing: Buffer | null = null;
    if (fs.existsSync(item.path)) {
      existing = fs.readFileSync(item.path);
      baseSha256 = sha256(existing);
    }

    return {
      path: item.path,
      content: Buffer.from(item.content),
      encoding,
      createDirectories,
      baseSha256,
      preview: buildContentDiffPreview(existing, item.content, item.options?.maxPreviewBytes),
    };
  });

  return {
    operations,
    timestamp: new Date().toISOString(),
    version: PLAN_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
