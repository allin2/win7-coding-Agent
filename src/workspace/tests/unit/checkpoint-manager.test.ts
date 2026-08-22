import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { A9WorkspaceService } from '../../src';

describe('A9-03: CheckpointManager and Undo', () => {
  let tempDir: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-cp-test-'));
    service = new A9WorkspaceService(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('records turn checkpoints and undos modifications and deletions', async () => {
    const filePath = 'code.ts';
    fs.writeFileSync(path.join(tempDir, filePath), 'const original = true;\n', 'utf8');

    // Turn 1: modify existing file
    await service.edit(filePath, 'const original = true;', 'const original = false;', { turnId: 'turn-1' });
    expect(fs.readFileSync(path.join(tempDir, filePath), 'utf8')).toContain('false');

    // Turn 1: create new file
    await service.write('new-file.ts', 'export const created = 1;', { turnId: 'turn-1' });
    expect(fs.existsSync(path.join(tempDir, 'new-file.ts'))).toBe(true);

    // Verify turn diff
    const diffs = service.getCheckpointManager().getTurnDiff('turn-1');
    expect(diffs.length).toBe(2);

    // Undo Turn 1
    const undoRes = service.getCheckpointManager().undoTurn('turn-1');
    expect(undoRes.errors).toHaveLength(0);

    // Verify original state restored
    expect(fs.readFileSync(path.join(tempDir, filePath), 'utf8')).toContain('const original = true;');
    expect(fs.existsSync(path.join(tempDir, 'new-file.ts'))).toBe(false);
  });
});
