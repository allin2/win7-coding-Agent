/**
 * Diff contract — compare shadow state against the real filesystem.
 */

import { DiffEntry, DiffResult } from './types';

/**
 * Compute the set of changes between the original filesystem state and the
 * current shadow state.
 *
 * @param originals  Map of absolute-path → original content (null = did not exist).
 * @param current    Map of absolute-path → current shadow content.
 */
export function computeDiff(
  originals: Map<string, Buffer | null>,
  current: Map<string, Buffer>,
): DiffResult {
  const entries: DiffEntry[] = [];

  // Paths that exist in the shadow.
  for (const [filePath, content] of current.entries()) {
    const original = originals.get(filePath);

    if (original === null || original === undefined) {
      // File did not exist on disk → added.
      entries.push({ path: filePath, status: 'added' });
    } else if (!original.equals(content)) {
      entries.push({ path: filePath, status: 'modified' });
    }
    // else: identical — no entry needed.
  }

  // Paths that existed originally but are absent from the shadow → deleted.
  for (const [filePath] of originals.entries()) {
    if (!current.has(filePath)) {
      entries.push({ path: filePath, status: 'deleted' });
    }
  }

  return { entries };
}
