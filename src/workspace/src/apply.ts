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
import { validatePath } from './safety';

// Re-export ShadowWorkspace so callers can import from one place.
export { ShadowWorkspace } from './shadow';

export interface WorkspaceApprovalBinding {
  approvalId: string;
  sessionId: string;
  subject: string;
  previewSha256: string;
  baselineSha256: string;
}

export interface WorkspaceApprovalValidation {
  valid: boolean;
  reason?: string;
}

/** Structurally compatible with Runner ApprovalLedger. */
export interface WorkspaceApprovalPort {
  validateAndConsume(
    binding: WorkspaceApprovalBinding | undefined,
    request: unknown,
  ): WorkspaceApprovalValidation;
}

export interface ApplyPlanOptions {
  workspaceRoot: string;
  approval: WorkspaceApprovalBinding;
  approvalLedger: WorkspaceApprovalPort;
  workspace?: ShadowWorkspace;
  /** Testable recovery seam; production defaults to fs.copyFileSync. */
  restoreBackup?: (backupPath: string, targetPath: string) => void;
}

/**
 * Execute every operation in `plan`.
 *
 * The workspace root is mandatory. Each target is checked before backup,
 * after directory creation, and after replacement so callers cannot bypass
 * the workspace boundary by supplying absolute paths or reparse ancestors.
 */
export function applyPlan(
  plan: WritePlan,
  options: ApplyPlanOptions,
): ApplyResult {
  if (!options || !options.workspaceRoot) {
    throw new WorkspaceError(
      'WORKSPACE_ROOT_INVALID',
      'applyPlan requires an explicit workspaceRoot',
    );
  }
  if (!fs.existsSync(options.workspaceRoot) || !fs.statSync(options.workspaceRoot).isDirectory()) {
    throw new WorkspaceError(
      'WORKSPACE_ROOT_INVALID',
      `Workspace root is not an existing directory: ${options.workspaceRoot}`,
    );
  }
  if (!options.approval || !options.approvalLedger) {
    throw new WorkspaceError(
      'APPROVAL_REQUIRED',
      'applyPlan requires an exact, one-time approval binding',
    );
  }
  const approval = options.approvalLedger.validateAndConsume(
    options.approval,
    buildApplyApprovalRequest(plan, options.workspaceRoot),
  );
  if (!approval.valid) {
    throw new WorkspaceError(
      'APPROVAL_INVALID',
      approval.reason ?? 'Workspace apply approval validation failed',
    );
  }

  const results: OperationResult[] = [];
  const backups: Map<string, string> = new Map(); // target → backup path
  const createdFiles: string[] = [];
  const cleanupWarnings: string[] = [];

  try {
    // --- Phase 1: validate & backup ---
    for (const op of plan.operations) {
      assertInsideWorkspace(op.path, options.workspaceRoot);

      // baseSha256 check.
      if (op.baseSha256 !== undefined) {
        if (!fs.existsSync(op.path) || !fs.statSync(op.path).isFile()) {
          throw new WorkspaceError(
            'REPLAN_REQUIRED',
            `Base content disappeared for ${op.path}`,
          );
        }
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
      assertInsideWorkspace(op.path, options.workspaceRoot);

      const tmpPath = op.path + '.tmp-' + randomHex();
      assertInsideWorkspace(tmpPath, options.workspaceRoot);
      try {
        fs.writeFileSync(tmpPath, op.content);
        fs.renameSync(tmpPath, op.path);
        assertInsideWorkspace(op.path, options.workspaceRoot);
      } catch (err) {
        // Clean up temp file on failure.
        const cleanupError = safeUnlink(tmpPath);
        if (cleanupError) cleanupWarnings.push(cleanupError);
        throw new WorkspaceError(
          'ATOMIC_REPLACE_FAILED',
          `Atomic write failed for ${op.path}: ${(err as Error).message}`,
        );
      }

      if (!backups.has(op.path)) {
        createdFiles.push(op.path);
      }

      // Update shadow workspace if provided.
      if (options.workspace) {
        options.workspace.writeFile(op.path, op.content);
      }

      results.push({
        path: op.path,
        success: true,
        ...(op.preview ? { preview: op.preview } : {}),
      });
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
      const cleanupError = safeUnlink(bakPath);
      if (cleanupError) cleanupWarnings.push(cleanupError);
    }

    return {
      success: true,
      operations: results,
      rolledBack: false,
      rollbackStatus: 'not_required',
      rollbackErrors: [],
      cleanupWarnings,
    };
  } catch (err) {
    // --- Phase 4: rollback ---
    const rollbackErrors: string[] = [];

    // Restore backed-up files.
    for (const [target, bakPath] of backups) {
      try {
        if (options.restoreBackup) {
          options.restoreBackup(bakPath, target);
        } else {
          fs.copyFileSync(bakPath, target);
        }
        const cleanupError = safeUnlink(bakPath);
        if (cleanupError) cleanupWarnings.push(cleanupError);
      } catch (rollbackError) {
        rollbackErrors.push(
          `Failed to restore ${target}: ${errorMessage(rollbackError)}`,
        );
      }
    }

    // Remove files that were newly created (no backup existed).
    for (const filePath of createdFiles) {
      const rollbackError = safeUnlink(filePath);
      if (rollbackError) rollbackErrors.push(rollbackError);
    }

    const errorMsg =
      err instanceof WorkspaceError
        ? err.message
        : errorMessage(err);
    const rollbackCompleted = rollbackErrors.length === 0;

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
      rolledBack: rollbackCompleted,
      rollbackStatus: rollbackCompleted ? 'completed' : 'failed',
      rollbackErrors,
      cleanupWarnings,
    };
  }
}

export function buildApplyApprovalRequest(
  plan: WritePlan,
  workspaceRoot: string,
): unknown {
  return {
    workspaceRoot: path.resolve(workspaceRoot),
    plan: {
      version: plan.version,
      timestamp: plan.timestamp,
      operations: plan.operations.map((operation) => ({
        path: path.resolve(operation.path),
        contentSha256: sha256(operation.content),
        encoding: operation.encoding,
        createDirectories: operation.createDirectories,
        baseSha256: operation.baseSha256 ?? null,
      })),
    },
  };
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

function assertInsideWorkspace(targetPath: string, workspaceRoot: string): void {
  const validation = validatePath(targetPath, workspaceRoot);
  if (!validation.valid) {
    throw new WorkspaceError(
      'WORKSPACE_BOUNDARY_VIOLATION',
      validation.error ?? `Unsafe workspace path: ${targetPath}`,
    );
  }
}

function safeUnlink(filePath: string): string | undefined {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return undefined;
  } catch (error) {
    return `Failed to remove ${filePath}: ${errorMessage(error)}`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
