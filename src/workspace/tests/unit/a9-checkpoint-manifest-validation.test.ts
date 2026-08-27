import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CheckpointManager } from '../../src/checkpoint-manager';

describe('A9 checkpoint manifest fail-closed validation', () => {
  let root: string;
  let recovery: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-checkpoint-contract-'));
    recovery = path.join(root, '.agent_recovery');
    fs.writeFileSync(path.join(root, 'note.txt'), 'before\n', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function seed(turnId = 'turn-manifest'): { manifestPath: string; document: any } {
    const manager = new CheckpointManager(root, recovery);
    manager.recordPreMutation(turnId, 'note.txt');
    fs.writeFileSync(path.join(root, 'note.txt'), 'after\n', 'utf8');
    manager.recordPostMutation(turnId, 'note.txt', 'modify');
    const manifestPath = path.join(recovery, 'checkpoints', `${turnId}.json`);
    return { manifestPath, document: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
  }

  it('loads a structurally valid content-addressed manifest after restart', () => {
    seed();
    expect(new CheckpointManager(root, recovery).loadCheckpoint('turn-manifest')?.changes['note.txt'])
      .toMatchObject({ filePath: 'note.txt', action: 'modify' });
  });

  it('rejects a change key/path mismatch and workspace traversal', () => {
    const { manifestPath, document } = seed();
    document.changes['../outside.txt'] = { ...document.changes['note.txt'], filePath: '../outside.txt' };
    delete document.changes['note.txt'];
    fs.writeFileSync(manifestPath, JSON.stringify(document), 'utf8');

    expect(() => new CheckpointManager(root, recovery).loadCheckpoint('turn-manifest'))
      .toThrow(/escapes the workspace/);
  });

  it('rejects a manifest entry that could target the workspace root', () => {
    const { manifestPath, document } = seed();
    document.changes['.'] = { ...document.changes['note.txt'], filePath: '.' };
    delete document.changes['note.txt'];
    fs.writeFileSync(manifestPath, JSON.stringify(document), 'utf8');

    expect(() => new CheckpointManager(root, recovery).loadCheckpoint('turn-manifest'))
      .toThrow(/escapes the workspace/);
  });

  it('rejects recovery artifacts outside the content-addressed store', () => {
    const { manifestPath, document } = seed();
    const outside = path.join(root, 'outside-blob');
    fs.writeFileSync(outside, 'before\n', 'utf8');
    document.changes['note.txt'].originalBlobPath = outside;
    fs.writeFileSync(manifestPath, JSON.stringify(document), 'utf8');

    expect(() => new CheckpointManager(root, recovery).loadCheckpoint('turn-manifest'))
      .toThrow(/outside the recovery root/);
  });

  it('rejects a blob whose bytes no longer match its content-addressed SHA-256', () => {
    const { document } = seed();
    fs.writeFileSync(document.changes['note.txt'].originalBlobPath, 'tampered\n', 'utf8');

    expect(() => new CheckpointManager(root, recovery).loadCheckpoint('turn-manifest'))
      .toThrow(/content SHA-256 mismatch/);
  });

  it('rejects unsafe turn identifiers before filename projection', () => {
    expect(() => new CheckpointManager(root, recovery).startTurn('../turn-collision'))
      .toThrow(/unsafe turn id/);
  });
});
