/**
 * Path safety — escape detection & junction/reparse-point defence interface.
 *
 * Every write target MUST pass `validatePath` before any I/O occurs.
 * The function resolves symlinks where possible and checks that the final
 * path still resides inside `workspaceRoot`.
 */

import * as path from 'path';
import * as fs from 'fs';
import { PathValidation } from './types';

/**
 * Validate that `targetPath` is safely contained within `workspaceRoot`.
 *
 * Checks performed:
 *   1. Resolve both paths to absolute.
 *   2. If the target already exists, `fs.realpathSync` resolves symlinks /
 *      junctions so that reparse-point tricks are caught.
 *   3. The resolved path must start with the resolved workspace root.
 */
export function validatePath(
  targetPath: string,
  workspaceRoot: string,
): PathValidation {
  const resolvedRoot = path.resolve(workspaceRoot);

  // Resolve symlinks in the root itself (e.g. macOS /var → /private/var).
  let canonicalRoot: string;
  try {
    canonicalRoot = fs.existsSync(resolvedRoot)
      ? fs.realpathSync(resolvedRoot)
      : resolvedRoot;
  } catch {
    canonicalRoot = resolvedRoot;
  }

  const resolvedTarget = path.resolve(canonicalRoot, targetPath);

  // If the file already exists, resolve symlinks / junctions.
  if (fs.existsSync(resolvedTarget)) {
    try {
      const real = fs.realpathSync(resolvedTarget);
      if (!isInside(real, canonicalRoot)) {
        return {
          valid: false,
          resolvedPath: resolvedTarget,
          error:
            'WORKSPACE_BOUNDARY_VIOLATION: path escapes workspace after reparse resolution',
        };
      }
    } catch {
      // realpath failure — treat as unsafe.
      return {
        valid: false,
        resolvedPath: resolvedTarget,
        error: 'WORKSPACE_BOUNDARY_VIOLATION: unable to resolve real path',
      };
    }
  }

  // Lexical containment check (covers not-yet-existing targets).
  if (!isInside(resolvedTarget, canonicalRoot)) {
    return {
      valid: false,
      resolvedPath: resolvedTarget,
      error: 'WORKSPACE_BOUNDARY_VIOLATION: path escapes workspace root',
    };
  }

  return { valid: true, resolvedPath: resolvedTarget };
}

/**
 * Check whether a path looks like a Windows junction / reparse point.
 *
 * Real detection requires `DeviceIoControl(FSCTL_GET_REPARSE_POINT)` which
 * is only available on Windows.  This stub provides the interface so that
 * callers can wire it up when running on Win7.
 */
export function isJunction(_targetPath: string): boolean {
  // TODO: Win7 — call DeviceIoControl with FSCTL_GET_REPARSE_POINT.
  return false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isInside(child: string, parent: string): boolean {
  const normalizedChild = path.normalize(child);
  const normalizedParent = path.normalize(parent);
  const prefix = normalizedParent.endsWith(path.sep)
    ? normalizedParent
    : normalizedParent + path.sep;
  return (
    normalizedChild === normalizedParent ||
    normalizedChild.startsWith(prefix)
  );
}
