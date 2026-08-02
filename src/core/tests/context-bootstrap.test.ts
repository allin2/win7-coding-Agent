import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildInitialContext } from '../src/context-bootstrap';

describe('buildInitialContext', () => {
  it('contains only environment and layered rules in stable protected order', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'context-bootstrap-'));
    const cwd = path.join(repo, 'src');
    fs.mkdirSync(cwd);
    fs.writeFileSync(path.join(repo, 'AGENTS.md'), 'root rule', 'utf8');
    fs.writeFileSync(path.join(cwd, 'AGENTS.md'), 'child rule', 'utf8');
    const items = buildInitialContext({
      repoRoot: repo,
      cwd,
      environment: {
        cwd,
        targetOs: 'Windows 7 SP1 x64',
        shell: 'cmd.exe',
        date: '2026-07-31',
        sandboxMode: 'workspace-write',
        approvalMode: 'on-request',
        git: { available: true, repository: true, branch: 'codex/test', dirty: true },
      },
    });

    expect(items.map((item) => item.kind)).toEqual([
      'environment',
      'instruction',
      'instruction',
    ]);
    expect(items.map((item) => item.content)).toEqual([
      expect.stringContaining('target_os: Windows 7 SP1 x64'),
      expect.stringContaining('root rule'),
      expect.stringContaining('child rule'),
    ]);
    expect(items.every((item) =>
      item.protection === 'protected' && item.placement === 'stable_prefix')).toBe(true);
    expect(items.map((item) => item.content).join('\n')).not.toMatch(/README|directory tree|source code/);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('rejects a timestamp because environment dates are stable for the day', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'context-date-'));
    expect(() => buildInitialContext({
      repoRoot: repo,
      cwd: repo,
      environment: {
        cwd: repo,
        targetOs: 'Windows 7 SP1 x64',
        shell: 'cmd.exe',
        date: '2026-07-31T01:02:03Z',
        sandboxMode: 'workspace-write',
        approvalMode: 'on-request',
        git: { available: false, repository: false },
      },
    })).toThrow('YYYY-MM-DD');
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
