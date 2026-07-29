/**
 * ShadowWorkspace — in-memory workspace mirror.
 *
 * Holds a snapshot of file contents so that writes can be rehearsed and
 * diffed against the real filesystem *before* committing to disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DiffResult } from './types';
import { computeDiff } from './diff';

export class ShadowWorkspace {
  private files: Map<string, Buffer> = new Map();
  private originals: Map<string, Buffer | null> = new Map();
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Resolved workspace root. */
  get rootPath(): string {
    return this.root;
  }

  /** Read a file from the shadow (returns the *current* in-memory copy). */
  readFile(filePath: string): Buffer {
    const key = this.resolve(filePath);
    const data = this.files.get(key);
    if (data === undefined) {
      throw new Error(`File not found in shadow: ${filePath}`);
    }
    return Buffer.from(data);
  }

  /** Write a file into the shadow. */
  writeFile(filePath: string, content: Buffer): void {
    const key = this.resolve(filePath);
    // Record the original content the first time we touch this path.
    if (!this.originals.has(key)) {
      this.originals.set(
        key,
        fs.existsSync(key) ? fs.readFileSync(key) : null,
      );
    }
    this.files.set(key, Buffer.from(content));
  }

  /** List all files currently held in the shadow. */
  listFiles(): string[] {
    return Array.from(this.files.keys());
  }

  /** Compute the diff between the shadow state and the real filesystem. */
  getDiff(): DiffResult {
    return computeDiff(this.originals, this.files);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private resolve(filePath: string): string {
    return path.resolve(this.root, filePath);
  }
}
