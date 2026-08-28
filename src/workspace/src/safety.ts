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

  // Translate targets expressed through a non-canonical root alias (for
  // example macOS /var -> /private/var) into the canonical root before the
  // containment comparison. Absolute paths outside the original root produce
  // a `..` relative path and are still rejected below.
  const lexicalTarget = path.resolve(resolvedRoot, targetPath);
  const relativeToRoot = path.relative(resolvedRoot, lexicalTarget);
  const resolvedTarget = path.resolve(canonicalRoot, relativeToRoot);

  // Reject lexical escapes before inspecting the filesystem. This also makes
  // absolute paths outside the workspace fail closed.
  if (!isInside(resolvedTarget, canonicalRoot)) {
    return {
      valid: false,
      resolvedPath: resolvedTarget,
      error: 'WORKSPACE_BOUNDARY_VIOLATION: path escapes workspace root',
    };
  }
  const lexicalSensitive = sensitiveWorkspaceComponent(resolvedTarget, canonicalRoot);
  if (lexicalSensitive) {
    return {
      valid: false,
      resolvedPath: resolvedTarget,
      error: `WORKSPACE_SENSITIVE_PATH: access to ${lexicalSensitive} is denied`,
    };
  }

  // Resolve the deepest existing ancestor, not only the final target. A
  // not-yet-existing file can still escape through an existing junction or
  // symlink in one of its parent directories.
  const existingAncestor = findExistingAncestor(resolvedTarget);
  if (!existingAncestor) {
    return {
      valid: false,
      resolvedPath: resolvedTarget,
      error: 'WORKSPACE_BOUNDARY_VIOLATION: unable to find an existing ancestor',
    };
  }
  try {
    const realAncestor = fs.realpathSync(existingAncestor);
    if (!isInside(realAncestor, canonicalRoot)) {
      return {
        valid: false,
        resolvedPath: resolvedTarget,
        error:
          'WORKSPACE_BOUNDARY_VIOLATION: path escapes workspace through a reparse ancestor',
      };
    }
    const realSensitive = sensitiveWorkspaceComponent(realAncestor, canonicalRoot);
    if (realSensitive) {
      return {
        valid: false,
        resolvedPath: resolvedTarget,
        error: `WORKSPACE_SENSITIVE_PATH: resolved path reaches ${realSensitive}`,
      };
    }
  } catch {
    return {
      valid: false,
      resolvedPath: resolvedTarget,
      error: 'WORKSPACE_BOUNDARY_VIOLATION: unable to resolve real path',
    };
  }

  return { valid: true, resolvedPath: resolvedTarget };
}

function sensitiveWorkspaceComponent(child: string, root: string): string | undefined {
  const relative = path.relative(root, child);
  for (const component of relative.split(/[\\/]+/)) {
    const normalized = process.platform === 'win32' ? component.toLowerCase() : component;
    if (normalized === '.git') return '.git';
    if (normalized === '.env' || normalized.startsWith('.env.')) return component;
  }
  return undefined;
}

/**
 * Check whether a path looks like a Windows junction / reparse point.
 *
 * Real detection requires `DeviceIoControl(FSCTL_GET_REPARSE_POINT)` which
 * is only available on Windows.  This stub provides the interface so that
 * callers can wire it up when running on Win7.
 */
export function isJunction(targetPath: string): boolean {
  try {
    // Node exposes Windows junctions and symbolic links through lstat as
    // symbolic links. Unknown reparse tags still require SPIKE_02/Win32
    // handle-level validation, so Apply also relies on realpath containment.
    return fs.lstatSync(targetPath).isSymbolicLink();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isInside(child: string, parent: string): boolean {
  const normalizedChild = normalizeForComparison(child);
  const normalizedParent = normalizeForComparison(parent);
  const prefix = normalizedParent.endsWith(path.sep)
    ? normalizedParent
    : normalizedParent + path.sep;
  return (
    normalizedChild === normalizedParent ||
    normalizedChild.startsWith(prefix)
  );
}

function normalizeForComparison(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function findExistingAncestor(targetPath: string): string | undefined {
  let candidate = targetPath;
  while (!hasDirectoryEntry(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) return undefined;
    candidate = parent;
  }
  return candidate;
}

/** `existsSync` follows links and reports dangling links as missing.  The
 * containment check must treat every directory entry, including a dangling
 * reparse point, as existing so `realpathSync` can fail closed. */
function hasDirectoryEntry(candidate: string): boolean {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}
