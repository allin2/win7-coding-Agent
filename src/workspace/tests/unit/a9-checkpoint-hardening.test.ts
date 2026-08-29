import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { A9WorkspaceService } from '../../src';
import { CheckpointManager } from '../../src/checkpoint-manager';

describe('A9-08 checkpoint identity, drift and restart hardening', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-checkpoint-hardening-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('uses collision-free snapshot identities for paths that share the old flattened name', () => {
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
    fs.mkdirSync(path.join(root, 'a__b'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a', 'b', 'one.txt'), 'one');
    fs.writeFileSync(path.join(root, 'a__b', 'two.txt'), 'two');
    const manager = new CheckpointManager(root);

    const nested = manager.recordPreMutation('turn-collision', 'a/b');
    const flattened = manager.recordPreMutation('turn-collision', 'a__b');

    expect(nested.originalSnapshotPath).not.toBe(flattened.originalSnapshotPath);
    expect(nested.originalTreeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(flattened.originalTreeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses to delete a created directory after post-turn user data appears', () => {
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-created-dir', 'generated');
    fs.mkdirSync(path.join(root, 'generated'));
    fs.writeFileSync(path.join(root, 'generated', 'agent.txt'), 'agent');
    manager.recordPostMutation('turn-created-dir', 'generated', 'create');
    fs.writeFileSync(path.join(root, 'generated', 'user.txt'), 'user-after-turn');

    const outcome = manager.undoTurn('turn-created-dir');

    expect(outcome.drifted).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, 'generated', 'user.txt'), 'utf8')).toBe('user-after-turn');
  });

  it('refuses to overwrite a modified directory when an external actor replaces it with a file', () => {
    fs.mkdirSync(path.join(root, 'target'));
    fs.writeFileSync(path.join(root, 'target', 'before.txt'), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-type-drift', 'target');
    fs.writeFileSync(path.join(root, 'target', 'after.txt'), 'after');
    manager.recordPostMutation('turn-type-drift', 'target', 'modify');
    fs.rmSync(path.join(root, 'target'), { recursive: true, force: true });
    fs.writeFileSync(path.join(root, 'target'), 'external replacement');

    const outcome = manager.undoTurn('turn-type-drift');

    expect(outcome.drifted).toEqual([expect.stringContaining('路径类型')]);
    expect(fs.readFileSync(path.join(root, 'target'), 'utf8')).toBe('external replacement');
  });

  it('persists successful undo and does not replay it after restart', () => {
    fs.writeFileSync(path.join(root, 'note.txt'), 'before');
    const first = new CheckpointManager(root);
    first.recordPreMutation('turn-once', 'note.txt');
    fs.writeFileSync(path.join(root, 'note.txt'), 'after');
    first.recordPostMutation('turn-once', 'note.txt', 'modify');
    expect(first.undoTurn('turn-once').errors).toEqual([]);
    fs.writeFileSync(path.join(root, 'note.txt'), 'user-after-undo');

    const second = new CheckpointManager(root);
    const repeated = second.undoTurn('turn-once');

    expect(repeated.restored).toEqual([expect.stringContaining('此前已撤销')]);
    expect(fs.readFileSync(path.join(root, 'note.txt'), 'utf8')).toBe('user-after-undo');
  });

  it('fails closed when a directory snapshot is changed on disk', () => {
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'original.txt'), 'original');
    const manager = new CheckpointManager(root);
    const record = manager.recordPreMutation('turn-tamper', 'assets');
    fs.rmSync(path.join(root, 'assets'), { recursive: true, force: true });
    manager.recordPostMutation('turn-tamper', 'assets', 'delete');
    fs.writeFileSync(path.join(record.originalSnapshotPath!, 'injected.txt'), 'tampered');

    expect(() => new CheckpointManager(root).loadCheckpoint('turn-tamper'))
      .toThrow(/tree SHA-256 mismatch/);
  });

  it('keeps outside-workspace changes as explicit non-executable facts across restart', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-checkpoint-outside-'));
    try {
      const first = new A9WorkspaceService(root);
      await first.write(path.join(outside, 'note.txt'), 'outside', { turnId: 'turn-outside' });

      const checkpoint = new A9WorkspaceService(root).getCheckpointManager().loadCheckpoint('turn-outside');
      expect(checkpoint?.changes).toEqual({});
      expect(Object.values(checkpoint?.unrecoverable ?? {})).toEqual([
        expect.objectContaining({ kind: 'outside' }),
      ]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
