/**
 * A9-05 回归测试：Trusted Git 投影（真实临时 Git 仓库）。
 *
 * 覆盖：状态/Diff 展示、真实 hooks/helper 提示、非 Git 工作区降级。
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { projectTrustedGit } from '../src';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('A9-05: trusted git projection on real temp repositories', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeTempDir('a9-git-proj-');
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 'agent@example.com');
    git(repo, 'config', 'user.name', 'A9 Test');
    fs.writeFileSync(path.join(repo, 'README.md'), '# demo\n');
    git(repo, 'add', 'README.md');
    git(repo, 'commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('projects branch, head and clean status', async () => {
    const projection = await projectTrustedGit(repo);
    expect(projection.isGit).toBe(true);
    expect(projection.branch).toBe('main');
    expect(projection.head).toMatch(/^[0-9a-f]{40}$/);
    expect(projection.clean).toBe(true);
    expect(projection.entries).toEqual([]);
  });

  it('projects modified and untracked entries with diff preview', async () => {
    fs.writeFileSync(path.join(repo, 'README.md'), '# demo changed\n');
    fs.writeFileSync(path.join(repo, 'new-file.txt'), 'untracked');
    const projection = await projectTrustedGit(repo);
    expect(projection.clean).toBe(false);
    const paths = projection.entries.map((e) => e.path);
    expect(paths).toContain('README.md');
    expect(paths).toContain('new-file.txt');
    expect(projection.diffPreview).toContain('demo changed');
  });

  it('reports active hooks and credential helpers as external mechanisms', async () => {
    fs.writeFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho hook\n');
    fs.chmodSync(path.join(repo, '.git', 'hooks', 'pre-commit'), 0o755);
    git(repo, 'config', 'credential.helper', 'store');

    const projection = await projectTrustedGit(repo);
    const kinds = projection.externalMechanisms.map((m) => m.kind);
    expect(kinds).toContain('hooks');
    expect(kinds).toContain('credential_helper');
    expect(projection.notes.join(' ')).toContain('外部执行机制');
  });

  it('reports core.hooksPath overrides explicitly', async () => {
    const hooksDir = path.join(repo, 'custom-hooks');
    fs.mkdirSync(hooksDir);
    git(repo, 'config', 'core.hooksPath', 'custom-hooks');
    const projection = await projectTrustedGit(repo);
    expect(projection.externalMechanisms.some((m) => m.kind === 'hooks_path_override' && m.detail.includes('custom-hooks'))).toBe(true);
  });

  it('degrades explicitly for non-git workspaces without throwing', async () => {
    const plain = makeTempDir('a9-non-git-');
    try {
      const projection = await projectTrustedGit(plain);
      expect(projection.isGit).toBe(false);
      expect(projection.degradedReason).toContain('不是 Git 仓库');
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });
});
