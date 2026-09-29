import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { A9WorkspaceService } from '../../src/a9-workspace-service';

const gitAvailable = (() => {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch (_error) { return false; }
})();

describe('A9-26 recovery ignore', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-r0-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const init = (cwd: string) => {
    git(cwd, 'init', '-q');
    git(cwd, 'config', 'user.name', 'A9 Test');
    git(cwd, 'config', 'user.email', 'a9@example.invalid');
    fs.writeFileSync(path.join(cwd, 'code.txt'), 'before\n', 'utf8');
    git(cwd, 'add', 'code.txt');
    git(cwd, 'commit', '-qm', 'baseline');
  };

  (gitAvailable ? it : it.skip)('R0-01 edit and Shell recovery artifacts stay ignored by status and all add forms', async () => {
    init(root);
    const service = new A9WorkspaceService(root);
    await service.read('code.txt');
    await service.edit('code.txt', 'before', 'after', { turnId: 'turn-1' });
    const baseline = await service.freezeTurnBaseline('turn-2');
    git(root, 'status', '--short');
    await service.collectExternalChanges('turn-2', baseline);
    expect(fs.readFileSync(path.join(root, '.agent_recovery', '.gitignore'), 'utf8')).toBe('*\n');
    expect(git(root, 'status', '--porcelain', '-uall')).not.toContain('.agent_recovery');
    for (const selector of ['-A', '.', ':/']) {
      git(root, 'add', selector);
      expect(git(root, 'diff', '--cached', '--name-only')).not.toContain('.agent_recovery');
      git(root, 'reset', '-q');
    }
  });

  (gitAvailable ? it : it.skip)('R0-02 clean and stash preserve recovery and turn-1 undo', async () => {
    init(root);
    const service = new A9WorkspaceService(root);
    await service.read('code.txt');
    await service.edit('code.txt', 'before', 'after', { turnId: 'turn-1' });
    git(root, 'clean', '-fd');
    git(root, 'stash', '-u');
    expect(fs.existsSync(path.join(root, '.agent_recovery', '.gitignore'))).toBe(true);
    // Stash restored the tracked file; restore the post-edit state before undo.
    fs.writeFileSync(path.join(root, 'code.txt'), 'after\n', 'utf8');
    const undone = service.getCheckpointManager().undoTurn('turn-1');
    expect(undone.errors).toHaveLength(0);
    expect(fs.readFileSync(path.join(root, 'code.txt'), 'utf8')).toBe('before\n');
  });

  it('R0-03 opens an old recovery root once and never rewrites an existing rule', () => {
    const recovery = path.join(root, '.agent_recovery');
    fs.mkdirSync(recovery);
    const first = new A9WorkspaceService(root);
    const rule = path.join(recovery, '.gitignore');
    expect(fs.readFileSync(rule, 'utf8')).toBe('*\n');
    fs.writeFileSync(rule, 'custom\n', 'utf8');
    const second = new A9WorkspaceService(root);
    expect(fs.readFileSync(rule, 'utf8')).toBe('custom\n');
    expect(second.getCheckpointManager().getRecoveryDiagnostics()[0].code).toBe('A9_RECOVERY_GITIGNORE_CUSTOM');
    expect(first.getCheckpointManager().getRecoveryDiagnostics()).toHaveLength(0);
  });

  (gitAvailable ? it : it.skip)('R0-04 repository child workspace ignores its recovery root', async () => {
    init(root);
    const child = path.join(root, 'pkg');
    fs.mkdirSync(child);
    fs.writeFileSync(path.join(child, 'file.txt'), 'before\n', 'utf8');
    const service = new A9WorkspaceService(child);
    await service.read('file.txt');
    await service.edit('file.txt', 'before', 'after', { turnId: 'turn-1' });
    expect(git(root, 'status', '--porcelain', '-uall')).not.toContain('.agent_recovery');
  });

  it.each([
    ['exact star', '*\n', undefined],
    ['comments and CRLF', '# note\r\n*\r\n', undefined],
    ['negation', '*\n!keep.txt\n', 'A9_RECOVERY_GITIGNORE_CUSTOM'],
    ['other', 'foo\n', 'A9_RECOVERY_GITIGNORE_CUSTOM'],
    ['empty', '', 'A9_RECOVERY_GITIGNORE_CUSTOM'],
    ['oversized', `${'#'.repeat(4097)}\n`, 'A9_RECOVERY_GITIGNORE_CUSTOM'],
  ])('R0-03 existing %s remains byte-identical', (_name, content, expectedCode) => {
    const recovery = path.join(root, '.agent_recovery');
    fs.mkdirSync(recovery);
    const rule = path.join(recovery, '.gitignore');
    fs.writeFileSync(rule, content, 'utf8');
    const before = fs.readFileSync(rule);
    const service = new A9WorkspaceService(root);
    expect(fs.readFileSync(rule)).toEqual(before);
    expect(service.getCheckpointManager().getRecoveryDiagnostics().map((item) => item.code)).toEqual(expectedCode ? [expectedCode] : []);
  });

  it.each(['directory', 'symlink'])('R0-03 existing %s is not followed or overwritten', (kind) => {
    const recovery = path.join(root, '.agent_recovery');
    fs.mkdirSync(recovery);
    const rule = path.join(recovery, '.gitignore');
    if (kind === 'directory') fs.mkdirSync(rule);
    else {
      fs.writeFileSync(path.join(root, 'external.txt'), 'private', 'utf8');
      fs.symlinkSync(path.join(root, 'external.txt'), rule);
    }
    const service = new A9WorkspaceService(root);
    expect(service.getCheckpointManager().getRecoveryDiagnostics()[0].code).toBe('A9_RECOVERY_GITIGNORE_CUSTOM');
    expect(fs.lstatSync(rule).isSymbolicLink()).toBe(kind === 'symlink');
  });

  it('R0-05 recovery directory creation uses one ignore-aware entry point', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/checkpoint-manager.ts'), 'utf8');
    const uses = source.match(/fs\.mkdirSync\([^\n]+/g) || [];
    expect(uses.filter((line) => /recoveryRoot|blobsRoot|snapshotsRoot|manifestsRoot|swapRoot|path\.dirname\((target|backup|stage|blobPath)\)/.test(line)))
      .toEqual(['fs.mkdirSync(this.recoveryRoot, { recursive: true });']);
    expect(source).toContain('this.ensureRecoveryIgnore();');
  });
});
