/**
 * Apply phase — execute a WritePlan with automatic rollback on failure.
 *
 * Transaction semantics (Phase 4 task §4):
 *   1. Backup   — copy every existing target to a `.bak` sibling.
 *   2. Replace  — atomic write (temp → rename) for each operation.
 *   3. Verify   — re-read and compare to requested content.
 *   4. Rollback — on any failure, restore backups / remove new files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  WritePlan,
  ApplyResult,
  OperationResult,
  WorkspaceError,
} from './types';
import { ShadowWorkspace } from './shadow';

// Re-export ShadowWorkspace so callers can import from one place.
export { ShadowWorkspace } from './shadow';

/**
 * Execute every operation in `plan`.
 *
 * If `workspace` is supplied the shadow is updated in lock-step (useful for
 * pre-flight review).  It is otherwise optional.
 */
export function applyPlan(
  plan: WritePlan,
  workspace?: ShadowWorkspace,
): ApplyResult {
  const results: OperationResult[] = [];
  const backups: Map<string, string> = new Map(); // target → backup path
  const createdFiles: string[] = [];
  let rolledBack = false;

  try {
    // --- Phase 1: validate & backup ---
    for (const op of plan.operations) {
      // baseSha256 check.
      if (op.baseSha256 !== undefined && fs.existsSync(op.path)) {
        const current = sha256(fs.readFileSync(op.path));
        if (current !== op.baseSha256) {
          throw new WorkspaceError(
            'REPLAN_REQUIRED',
            `Base content changed for ${op.path}`,
          );
        }
      }

      // Backup existing file.
      if (fs.existsSync(op.path)) {
        const bakPath = op.path + '.bak';
        fs.copyFileSync(op.path, bakPath);
        backups.set(op.path, bakPath);
      }
    }

    // --- Phase 2: atomic write ---
    for (const op of plan.operations) {
      if (op.createDirectories) {
        fs.mkdirSync(path.dirname(op.path), { recursive: true });
      }

      const tmpPath = op.path + '.tmp-' + randomHex();
      try {
        fs.writeFileSync(tmpPath, op.content);
        fs.renameSync(tmpPath, op.path);
      } catch (err) {
        // Clean up temp file on failure.
        safeUnlink(tmpPath);
        throw new WorkspaceError(
          'ATOMIC_REPLACE_FAILED',
          `Atomic write failed for ${op.path}: ${(err as Error).message}`,
        );
      }

      if (!backups.has(op.path)) {
        createdFiles.push(op.path);
      }

      // Update shadow workspace if provided.
      if (workspace) {
        workspace.writeFile(op.path, op.content);
      }

      results.push({ path: op.path, success: true });
    }

    // --- Phase 3: post-write verification ---
    for (const op of plan.operations) {
      const written = fs.readFileSync(op.path);
      if (!written.equals(op.content)) {
        throw new WorkspaceError(
          'VERIFY_MISMATCH',
          `Post-write verification failed for ${op.path}`,
        );
      }
    }

    // Cleanup backup files on success.
    for (const [, bakPath] of backups) {
      safeUnlink(bakPath);
    }

    return { success: true, operations: results, rolledBack: false };
  } catch (err) {
    // --- Phase 4: rollback ---
    rolledBack = true;

    // Restore backed-up files.
    for (const [target, bakPath] of backups) {
      try {
        fs.copyFileSync(bakPath, target);
        safeUnlink(bakPath);
      } catch {
        /* best-effort */
      }
    }

    // Remove files that were newly created (no backup existed).
    for (const filePath of createdFiles) {
      safeUnlink(filePath);
    }

    const errorMsg =
      err instanceof WorkspaceError
        ? err.message
        : (err as Error).message;

    return {
      success: false,
      operations: [
        ...results,
        {
          path: 'rollback',
          success: false,
          error: errorMsg,
        },
      ],
      rolledBack,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function randomHex(): string {
  return crypto.randomBytes(8).toString('hex');
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* best-effort */
  }
}
