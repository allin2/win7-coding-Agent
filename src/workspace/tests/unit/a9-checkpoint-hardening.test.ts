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

  it('keeps create semantics when a directory is created and deleted in the same turn', () => {
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-create-delete-dir', 'generated');
    fs.mkdirSync(path.join(root, 'generated'));
    fs.writeFileSync(path.join(root, 'generated', 'temporary.txt'), 'temporary');
    manager.recordPostMutation('turn-create-delete-dir', 'generated', 'create');
    manager.recordPreMutation('turn-create-delete-dir', 'generated');
    fs.rmSync(path.join(root, 'generated'), { recursive: true, force: true });
    manager.recordPostMutation('turn-create-delete-dir', 'generated', 'delete');

    const outcome = new CheckpointManager(root).undoTurn('turn-create-delete-dir');

    expect(outcome.errors).toEqual([]);
    expect(outcome.drifted).toEqual([]);
    expect(fs.existsSync(path.join(root, 'generated'))).toBe(false);
  });

  it('does not delete a user file recreated after a same-turn create and delete', () => {
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-create-delete-file', 'new.txt');
    fs.writeFileSync(path.join(root, 'new.txt'), 'agent');
    manager.recordPostMutation('turn-create-delete-file', 'new.txt', 'create');
    manager.recordPreMutation('turn-create-delete-file', 'new.txt');
    fs.unlinkSync(path.join(root, 'new.txt'));
    manager.recordPostMutation('turn-create-delete-file', 'new.txt', 'delete');
    fs.writeFileSync(path.join(root, 'new.txt'), 'user-after-turn');

    const outcome = manager.undoTurn('turn-create-delete-file');

    expect(outcome.drifted).toEqual([expect.stringContaining('同路径已被重建')]);
    expect(fs.readFileSync(path.join(root, 'new.txt'), 'utf8')).toBe('user-after-turn');
  });

  it.each(['constructor', 'toString', '__proto__'])('round-trips prototype-like Windows file name %s', (name) => {
    fs.writeFileSync(path.join(root, name), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation(`turn-prototype-${name.replace(/_/g, 'x')}`, name);
    fs.writeFileSync(path.join(root, name), 'after');
    manager.recordPostMutation(`turn-prototype-${name.replace(/_/g, 'x')}`, name, 'modify');

    const outcome = new CheckpointManager(root).undoTurn(`turn-prototype-${name.replace(/_/g, 'x')}`);

    expect(outcome.errors).toEqual([]);
    expect(outcome.drifted).toEqual([]);
    expect(fs.readFileSync(path.join(root, name), 'utf8')).toBe('before');
  });

  it('fails closed when post-mutation state was never durably recorded before a crash', () => {
    fs.writeFileSync(path.join(root, 'crash-window.txt'), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-pre-post-crash', 'crash-window.txt');
    fs.writeFileSync(path.join(root, 'crash-window.txt'), 'agent-write');
    fs.writeFileSync(path.join(root, 'crash-window.txt'), 'user-after-crash');

    const outcome = new CheckpointManager(root).undoTurn('turn-pre-post-crash');

    expect(outcome.drifted).toEqual([expect.stringContaining('状态不确定')]);
    expect(fs.readFileSync(path.join(root, 'crash-window.txt'), 'utf8')).toBe('user-after-crash');
  });

  it('preserves the current directory when staging copy fails and succeeds on retry', () => {
    fs.mkdirSync(path.join(root, 'atomic-dir'));
    fs.writeFileSync(path.join(root, 'atomic-dir', 'before.txt'), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-atomic-dir', 'atomic-dir');
    fs.writeFileSync(path.join(root, 'atomic-dir', 'after.txt'), 'after');
    manager.recordPostMutation('turn-atomic-dir', 'atomic-dir', 'modify');
    const mutableFs = require('fs') as typeof fs;
    const cp = jest.spyOn(mutableFs, 'cpSync').mockImplementationOnce((_source, destination) => {
      fs.mkdirSync(destination as fs.PathLike, { recursive: true });
      fs.writeFileSync(path.join(destination as string, 'partial.txt'), 'partial');
      throw new Error('simulated copy interruption');
    });

    const first = manager.undoTurn('turn-atomic-dir');
    cp.mockRestore();

    expect(first.errors).toEqual([expect.stringContaining('simulated copy interruption')]);
    expect(fs.readFileSync(path.join(root, 'atomic-dir', 'after.txt'), 'utf8')).toBe('after');
    expect(manager.undoTurn('turn-atomic-dir').errors).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'atomic-dir', 'before.txt'), 'utf8')).toBe('before');
  });

  it('preserves the current file when staging copy fails and succeeds on retry', () => {
    fs.writeFileSync(path.join(root, 'atomic-file.txt'), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-atomic-file', 'atomic-file.txt');
    fs.writeFileSync(path.join(root, 'atomic-file.txt'), 'after');
    manager.recordPostMutation('turn-atomic-file', 'atomic-file.txt', 'modify');
    const mutableFs = require('fs') as typeof fs;
    const copy = jest.spyOn(mutableFs, 'copyFileSync').mockImplementationOnce(() => {
      throw new Error('simulated file copy interruption');
    });

    const first = manager.undoTurn('turn-atomic-file');
    copy.mockRestore();

    expect(first.errors).toEqual([expect.stringContaining('simulated file copy interruption')]);
    expect(fs.readFileSync(path.join(root, 'atomic-file.txt'), 'utf8')).toBe('after');
    expect(manager.undoTurn('turn-atomic-file').errors).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'atomic-file.txt'), 'utf8')).toBe('before');
  });

  it('preserves the current file when the first swap rename fails', () => {
    fs.writeFileSync(path.join(root, 'rename-failure.txt'), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-rename-failure', 'rename-failure.txt');
    fs.writeFileSync(path.join(root, 'rename-failure.txt'), 'after');
    manager.recordPostMutation('turn-rename-failure', 'rename-failure.txt', 'modify');
    const mutableFs = require('fs') as typeof fs;
    const rename = jest.spyOn(mutableFs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('simulated first rename failure');
    });

    const outcome = manager.undoTurn('turn-rename-failure');
    rename.mockRestore();

    expect(outcome.errors).toEqual([expect.stringContaining('simulated first rename failure')]);
    expect(fs.readFileSync(path.join(root, 'rename-failure.txt'), 'utf8')).toBe('after');
  });

  it('detects target drift that occurs while a directory restore is being staged', () => {
    fs.mkdirSync(path.join(root, 'staging-drift'));
    fs.writeFileSync(path.join(root, 'staging-drift', 'before.txt'), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-staging-drift', 'staging-drift');
    fs.writeFileSync(path.join(root, 'staging-drift', 'agent.txt'), 'agent');
    manager.recordPostMutation('turn-staging-drift', 'staging-drift', 'modify');
    const mutableFs = require('fs') as typeof fs;
    const realCp = mutableFs.cpSync.bind(mutableFs);
    const cp = jest.spyOn(mutableFs, 'cpSync').mockImplementationOnce((source, destination, options) => {
      realCp(source, destination, options);
      fs.writeFileSync(path.join(root, 'staging-drift', 'user.txt'), 'user-during-staging');
    });

    const outcome = manager.undoTurn('turn-staging-drift');
    cp.mockRestore();

    expect(outcome.drifted).toEqual([expect.stringContaining('staging 期间发生变化')]);
    expect(fs.readFileSync(path.join(root, 'staging-drift', 'user.txt'), 'utf8')).toBe('user-during-staging');
  });

  it('does not restore the source when a directory created in the turn is renamed', () => {
    fs.mkdirSync(path.join(root, 'generated'));
    const manager = new CheckpointManager(root);
    // Simulate the workspace-service sequence for a path that was created earlier in the Turn.
    fs.rmSync(path.join(root, 'generated'), { recursive: true, force: true });
    manager.recordPreMutation('turn-create-rename-dir', 'generated');
    fs.mkdirSync(path.join(root, 'generated'));
    manager.recordPostMutation('turn-create-rename-dir', 'generated', 'create');
    manager.recordPreMutation('turn-create-rename-dir', 'generated');
    manager.recordPreMutation('turn-create-rename-dir', 'renamed');
    fs.renameSync(path.join(root, 'generated'), path.join(root, 'renamed'));
    manager.recordPostMutation('turn-create-rename-dir', 'generated', 'delete');
    manager.recordPostMutation('turn-create-rename-dir', 'renamed', 'create');

    const outcome = new CheckpointManager(root).undoTurn('turn-create-rename-dir');

    expect(outcome.errors).toEqual([]);
    expect(fs.existsSync(path.join(root, 'generated'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'renamed'))).toBe(false);
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

  it('rejects a v4 manifest whose directory snapshots are swapped between paths', () => {
    fs.mkdirSync(path.join(root, 'first'));
    fs.mkdirSync(path.join(root, 'second'));
    fs.writeFileSync(path.join(root, 'first', 'value.txt'), 'first');
    fs.writeFileSync(path.join(root, 'second', 'value.txt'), 'second');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-swapped-snapshots', 'first');
    manager.recordPreMutation('turn-swapped-snapshots', 'second');
    const manifestPath = path.join(root, '.agent_recovery', 'checkpoints', 'turn-swapped-snapshots.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const first = manifest.changes.first;
    const second = manifest.changes.second;
    [first.originalSnapshotPath, second.originalSnapshotPath] = [second.originalSnapshotPath, first.originalSnapshotPath];
    [first.originalTreeHash, second.originalTreeHash] = [second.originalTreeHash, first.originalTreeHash];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    expect(() => new CheckpointManager(root).loadCheckpoint('turn-swapped-snapshots'))
      .toThrow(/not bound to its turn and file path/);
  });

  it('rejects a manifest whose file snapshots and hashes are swapped between paths', () => {
    fs.writeFileSync(path.join(root, 'first.txt'), 'first');
    fs.writeFileSync(path.join(root, 'second.txt'), 'second');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-swapped-files', 'first.txt');
    manager.recordPreMutation('turn-swapped-files', 'second.txt');
    const manifestPath = path.join(root, '.agent_recovery', 'checkpoints', 'turn-swapped-files.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const first = manifest.changes['first.txt'];
    const second = manifest.changes['second.txt'];
    [first.originalBlobPath, second.originalBlobPath] = [second.originalBlobPath, first.originalBlobPath];
    [first.originalHash, second.originalHash] = [second.originalHash, first.originalHash];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    expect(() => new CheckpointManager(root).loadCheckpoint('turn-swapped-files'))
      .toThrow(/not bound to its turn, file path and role/);
  });

  it.each(['file', 'directory'] as const)('finishes an interrupted %s restore swap after restart', (kind) => {
    const name = kind === 'file' ? 'interrupted.txt' : 'interrupted-dir';
    const target = path.join(root, name);
    if (kind === 'file') fs.writeFileSync(target, 'before');
    else {
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, 'before.txt'), 'before');
    }
    const turnId = `turn-interrupted-${kind}`;
    const manager = new CheckpointManager(root);
    manager.recordPreMutation(turnId, name);
    if (kind === 'file') fs.writeFileSync(target, 'after');
    else fs.writeFileSync(path.join(target, 'after.txt'), 'after');
    manager.recordPostMutation(turnId, name, 'modify');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.agent_recovery', 'checkpoints', `${turnId}.json`), 'utf8'));
    const record = manifest.changes[name];
    const identity = require('crypto').createHash('sha256').update(name, 'utf8').digest('hex');
    const swapRoot = path.join(root, '.agent_recovery', 'undo-staging', turnId);
    const stage = path.join(swapRoot, `${identity}.stage`);
    const backup = path.join(swapRoot, `${identity}.backup`);
    fs.mkdirSync(swapRoot, { recursive: true });
    if (kind === 'file') fs.copyFileSync(record.originalBlobPath, stage);
    else fs.cpSync(record.originalSnapshotPath, stage, { recursive: true });
    fs.renameSync(target, backup);

    const outcome = new CheckpointManager(root).undoTurn(turnId);

    expect(outcome.errors).toEqual([]);
    expect(outcome.drifted).toEqual([]);
    if (kind === 'file') expect(fs.readFileSync(target, 'utf8')).toBe('before');
    else expect(fs.readFileSync(path.join(target, 'before.txt'), 'utf8')).toBe('before');
    expect(fs.existsSync(backup)).toBe(false);
  });

  it('preserves a tampered pending backup instead of deleting it during restart recovery', () => {
    const name = 'interrupted-tampered.txt';
    const target = path.join(root, name);
    fs.writeFileSync(target, 'before');
    const turnId = 'turn-interrupted-tampered';
    const manager = new CheckpointManager(root);
    manager.recordPreMutation(turnId, name);
    fs.writeFileSync(target, 'agent-after');
    manager.recordPostMutation(turnId, name, 'modify');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.agent_recovery', 'checkpoints', `${turnId}.json`), 'utf8'));
    const record = manifest.changes[name];
    const identity = require('crypto').createHash('sha256').update(name, 'utf8').digest('hex');
    const swapRoot = path.join(root, '.agent_recovery', 'undo-staging', turnId);
    const stage = path.join(swapRoot, `${identity}.stage`);
    const backup = path.join(swapRoot, `${identity}.backup`);
    fs.mkdirSync(swapRoot, { recursive: true });
    fs.copyFileSync(record.originalBlobPath, stage);
    fs.renameSync(target, backup);
    fs.writeFileSync(backup, 'user-after-crash');

    const outcome = new CheckpointManager(root).undoTurn(turnId);

    expect(outcome.drifted).toEqual([expect.stringContaining('未决备份与轮后目标身份不一致')]);
    expect(fs.readFileSync(target, 'utf8')).toBe('user-after-crash');
  });

  it('fails closed after a crash before Shell collection instead of treating unknown post-state as undoable', async () => {
    fs.mkdirSync(path.join(root, 'non-empty'));
    fs.writeFileSync(path.join(root, 'non-empty', 'child.txt'), 'turn-entry');
    const service = new A9WorkspaceService(root);
    await service.freezeTurnBaseline('turn-directory-crash');
    const durableBaseline = JSON.parse(fs.readFileSync(
      path.join(root, '.agent_recovery', 'checkpoints', 'turn-directory-crash.json'), 'utf8',
    )).externalBaseline;
    expect(durableBaseline).toEqual(expect.objectContaining({
      schemaVersion: 1,
      collectionStatus: 'pending',
      files: expect.objectContaining({
        'non-empty/child.txt': expect.objectContaining({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      }),
      directories: expect.objectContaining({
        'non-empty': expect.objectContaining({ treeHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      }),
    }));
    await service.delete('non-empty', { recursive: true, permanent: false, turnId: 'turn-directory-crash' });

    const outcome = new CheckpointManager(root).undoTurn('turn-directory-crash');

    expect(outcome.errors).toEqual([expect.stringContaining('轮后状态尚未完成收集')]);
    expect(outcome.drifted).toEqual([]);
    expect(fs.existsSync(path.join(root, 'non-empty'))).toBe(false);
  });

  it.each([
    ['file-to-directory', 'file', 'directory'],
    ['directory-to-file', 'directory', 'file'],
  ] as const)('restores the original type after a same-turn %s replacement and restart', async (_label, beforeKind, afterKind) => {
    const target = path.join(root, 'replace-target');
    const source = path.join(root, afterKind === 'directory' ? 'source-dir' : 'source.txt');
    if (beforeKind === 'file') fs.writeFileSync(target, 'original-file');
    else {
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, 'original.txt'), 'original-directory');
    }
    if (afterKind === 'file') fs.writeFileSync(source, 'replacement-file');
    else {
      fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'replacement.txt'), 'replacement-directory');
    }
    const turnId = `turn-${beforeKind}-${afterKind}`;
    const service = new A9WorkspaceService(root);
    await service.delete('replace-target', { recursive: true, permanent: false, turnId });
    const manifestPath = path.join(root, '.agent_recovery', 'checkpoints', `${turnId}.json`);
    const afterDelete = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).changes['replace-target'];
    const deleteArtifact = beforeKind === 'file' ? afterDelete.originalBlobPath : afterDelete.originalSnapshotPath;
    expect(fs.existsSync(deleteArtifact)).toBe(true);
    await service.copy(path.basename(source), 'replace-target', { turnId });
    expect(fs.existsSync(deleteArtifact)).toBe(true);

    const outcome = new CheckpointManager(root).undoTurn(turnId);

    expect(outcome.errors).toEqual([]);
    expect(outcome.drifted).toEqual([]);
    expect(fs.statSync(target).isDirectory()).toBe(beforeKind === 'directory');
    if (beforeKind === 'file') expect(fs.readFileSync(target, 'utf8')).toBe('original-file');
    else expect(fs.readFileSync(path.join(target, 'original.txt'), 'utf8')).toBe('original-directory');
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

  it('rejects a v4 manifest when artifact binding is removed', () => {
    fs.writeFileSync(path.join(root, 'bound.txt'), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-binding-required', 'bound.txt');
    const manifestPath = path.join(root, '.agent_recovery', 'checkpoints', 'turn-binding-required.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    delete manifest.artifactBindingVersion;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    expect(() => new CheckpointManager(root).loadCheckpoint('turn-binding-required'))
      .toThrow(/artifact binding is missing/);
  });

  it.each([2, 3])('refuses legacy v%s manifests instead of restoring unbound artifacts', (schemaVersion) => {
    fs.writeFileSync(path.join(root, 'legacy-bound.txt'), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation(`turn-legacy-v${schemaVersion}`, 'legacy-bound.txt');
    const manifestPath = path.join(root, '.agent_recovery', 'checkpoints', `turn-legacy-v${schemaVersion}.json`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.schemaVersion = schemaVersion;
    delete manifest.artifactBindingVersion;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    expect(() => new CheckpointManager(root).loadCheckpoint(`turn-legacy-v${schemaVersion}`))
      .toThrow(/schema mismatch/);
  });

  it('keeps the frozen Turn-entry file baseline immutable across later tool mutations', async () => {
    const target = path.join(root, 'mixed.txt');
    fs.writeFileSync(target, 'turn-entry-A');
    const service = new A9WorkspaceService(root);
    const baseline = await service.freezeTurnBaseline('turn-mixed-baseline');
    fs.writeFileSync(target, 'shell-intermediate-B');
    const manager = service.getCheckpointManager();
    manager.recordPreMutation('turn-mixed-baseline', 'mixed.txt');
    fs.writeFileSync(target, 'tool-final-C');
    manager.recordPostMutation('turn-mixed-baseline', 'mixed.txt', 'modify');
    await service.collectExternalChanges('turn-mixed-baseline', baseline);

    const outcome = new CheckpointManager(root).undoTurn('turn-mixed-baseline');

    expect(outcome.errors).toEqual([]);
    expect(outcome.drifted).toEqual([]);
    expect(fs.readFileSync(target, 'utf8')).toBe('turn-entry-A');
  });

  it('rejects an absent original kind that still carries a restore artifact', () => {
    fs.writeFileSync(path.join(root, 'victim.txt'), 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-kind-confusion', 'victim.txt');
    fs.writeFileSync(path.join(root, 'victim.txt'), 'after');
    manager.recordPostMutation('turn-kind-confusion', 'victim.txt', 'modify');
    const manifestPath = path.join(root, '.agent_recovery', 'checkpoints', 'turn-kind-confusion.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.changes['victim.txt'].originalKind = 'absent';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    expect(() => new CheckpointManager(root).loadCheckpoint('turn-kind-confusion'))
      .toThrow(/mixes original/);
    expect(fs.readFileSync(path.join(root, 'victim.txt'), 'utf8')).toBe('after');
  });

  it('does not delete a created file replaced after its drift hash check', () => {
    const target = path.join(root, 'created.txt');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-created-toctou', 'created.txt');
    fs.writeFileSync(target, 'agent');
    manager.recordPostMutation('turn-created-toctou', 'created.txt', 'create');
    const canonicalTarget = fs.realpathSync(target);
    const originalHashFile = (manager as any).hashFile.bind(manager);
    let changed = false;
    jest.spyOn(manager as any, 'hashFile').mockImplementation((...args: unknown[]) => {
      const candidate = String(args[0]);
      const hash = originalHashFile(candidate);
      if (fs.realpathSync(candidate) === canonicalTarget && !changed) {
        changed = true;
        fs.writeFileSync(target, 'user-after-check');
      }
      return hash;
    });

    const outcome = manager.undoTurn('turn-created-toctou');

    expect(outcome.drifted).toEqual([expect.stringContaining('发生变化')]);
    expect(fs.readFileSync(target, 'utf8')).toBe('user-after-check');
  });

  it('restores a modified file only when the atomically moved post-state still matches', () => {
    const target = path.join(root, 'modified.txt');
    fs.writeFileSync(target, 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-restore-toctou', 'modified.txt');
    fs.writeFileSync(target, 'agent-after');
    manager.recordPostMutation('turn-restore-toctou', 'modified.txt', 'modify');
    const canonicalTarget = fs.realpathSync(target);
    const originalHashFile = (manager as any).hashFile.bind(manager);
    let targetReads = 0;
    jest.spyOn(manager as any, 'hashFile').mockImplementation((...args: unknown[]) => {
      const candidate = String(args[0]);
      const hash = originalHashFile(candidate);
      if (fs.realpathSync(candidate) === canonicalTarget && ++targetReads === 2) fs.writeFileSync(target, 'user-after-check');
      return hash;
    });

    const outcome = manager.undoTurn('turn-restore-toctou');

    expect(outcome.drifted).toEqual([expect.stringContaining('发生变化')]);
    expect(fs.readFileSync(target, 'utf8')).toBe('user-after-check');
  });

  it('does not delete a user object that replaces the staged restore after installation', () => {
    const target = path.join(root, 'post-install-race.txt');
    fs.writeFileSync(target, 'before');
    const manager = new CheckpointManager(root);
    manager.recordPreMutation('turn-post-install-race', 'post-install-race.txt');
    fs.writeFileSync(target, 'agent-after');
    manager.recordPostMutation('turn-post-install-race', 'post-install-race.txt', 'modify');
    const checkpoint = manager.loadCheckpoint('turn-post-install-race')!;
    const record = checkpoint.changes['post-install-race.txt'];
    const originalMatches = (manager as any).artifactMatches.bind(manager);
    let replaced = false;
    let calls = 0;
    const artifact = jest.spyOn(manager as any, 'artifactMatches').mockImplementation((...args: unknown[]) => {
      const [candidate, isDirectory, expectedHash] = args as [string, boolean, string];
      const matches = originalMatches(candidate, isDirectory, expectedHash);
      calls += 1;
      if (!replaced && calls === 5) {
        replaced = true;
        fs.writeFileSync(target, 'user-after-install');
        throw new Error('simulated post-install validation failure');
      }
      return matches;
    });

    expect(() => (manager as any).restoreArtifactAtomically(
      checkpoint,
      'post-install-race.txt',
      record.originalBlobPath,
      false,
      record.originalHash,
      { kind: 'file', hash: record.newHash },
    )).toThrow(/simulated post-install validation failure/);
    artifact.mockRestore();

    expect(replaced).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('user-after-install');
  });
});
