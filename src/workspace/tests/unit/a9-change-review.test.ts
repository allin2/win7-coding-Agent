import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { A9WorkspaceService } from '../../src';

function fileHashes(root: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) hashes[path.relative(root, full)] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  visit(root);
  return hashes;
}

describe('A9-24 change review read-only projection', () => {
  let root: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-change-review-'));
    service = new A9WorkspaceService(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('counts bounded diff lines, lists unrecoverable command changes, and does not write workspace or recovery files', async () => {
    fs.writeFileSync(path.join(root, '中文 空格.txt'), 'alpha\nbeta', 'utf8');
    await service.read('中文 空格.txt');
    await service.edit('中文 空格.txt', 'beta', 'gamma', { turnId: 'turn-review' });
    await service.write('new.txt', 'created', { turnId: 'turn-review' });
    const manager = service.getCheckpointManager();
    manager.recordUnrecoverableExternal('turn-review', {
      path: 'large.bin', kind: 'too_large', reason: '超过备份上限',
    });
    const before = fileHashes(root);
    const review = manager.getTurnReview('turn-review');
    expect(review).not.toBeNull();
    expect(review!.files).toMatchObject([
      { path: '中文 空格.txt', action: 'modify', additions: 1, deletions: 1, undone: false, diffTruncated: false },
      { path: 'new.txt', action: 'create', additions: 1, deletions: 0, undone: false, diffTruncated: false },
    ]);
    expect(review!.files[0].diffText).toContain('+gamma');
    expect(review!.unrecoverable).toEqual([{ path: 'large.bin', kind: 'too_large', reason: '超过备份上限' }]);
    expect(review!.externalBaselineStatus).toBe('none');
    expect(manager.getTurnReview('missing')).toBeNull();
    expect(fileHashes(root)).toEqual(before);
  });

  it('reads persisted undo state after restart without applying the undo again', async () => {
    fs.writeFileSync(path.join(root, 'calc.ts'), 'before', 'utf8');
    await service.read('calc.ts');
    await service.edit('calc.ts', 'before', 'after', { turnId: 'turn-undo' });
    const manager = service.getCheckpointManager();
    expect(manager.undoFile('turn-undo', 'calc.ts').restored).toHaveLength(1);
    const before = fileHashes(root);
    const reopened = new A9WorkspaceService(root).getCheckpointManager();
    expect(reopened.getTurnReview('turn-undo')!.files[0].undone).toBe(true);
    expect(fs.readFileSync(path.join(root, 'calc.ts'), 'utf8')).toBe('before');
    expect(fileHashes(root)).toEqual(before);
  });

  it('keeps a directory entry at zero line counts with the same Diff text as the legacy query', () => {
    const manager = service.getCheckpointManager();
    manager.recordPreMutation('turn-dir', 'folder');
    fs.mkdirSync(path.join(root, 'folder'));
    manager.recordPostMutation('turn-dir', 'folder', 'create');
    const review = manager.getTurnReview('turn-dir')!;
    expect(review.files).toMatchObject([{ path: 'folder', originalKind: 'absent', newKind: 'directory', additions: 0, deletions: 0 }]);
    expect(review.files[0].diffText).toBe(manager.getTurnDiff('turn-dir')[0].diffText);
  });
});
