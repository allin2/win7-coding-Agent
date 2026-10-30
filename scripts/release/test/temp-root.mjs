import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Release tests create isolated TEST_ONLY repositories under the OS temp root.
// Every created root is removed when this test process exits, so a failed
// assertion cannot leave hundreds of megabytes behind.
const roots = new Set();

process.on('exit', () => {
  for (const root of roots) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // Cleanup is best effort; the run result must not change because of it.
    }
  }
});

export function tempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.add(root);
  return root;
}
