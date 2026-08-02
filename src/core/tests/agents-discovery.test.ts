import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { discoverAgentsRules } from '../src/agents-discovery';

describe('discoverAgentsRules', () => {
  it('loads user then root-to-cwd AGENTS.md as protected stable context', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-rules-'));
    const repo = path.join(base, 'repo');
    const nested = path.join(repo, 'src', 'feature');
    const user = path.join(base, 'user.md');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(user, 'user', 'utf8');
    fs.writeFileSync(path.join(repo, 'AGENTS.md'), 'root', 'utf8');
    fs.writeFileSync(path.join(repo, 'src', 'AGENTS.md'), 'src', 'utf8');
    fs.writeFileSync(path.join(nested, 'AGENTS.md'), 'feature', 'utf8');
    const rules = discoverAgentsRules({ repoRoot: repo, cwd: nested, userRulesPath: user });
    expect(rules.map((item) => item.content)).toEqual([
      expect.stringContaining('user'),
      expect.stringContaining('root'),
      expect.stringContaining('src'),
      expect.stringContaining('feature'),
    ]);
    expect(rules.every((item) => item.protection === 'protected' && item.placement === 'stable_prefix')).toBe(true);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('rejects a cwd outside the repository boundary', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-outside-'));
    const repo = path.join(base, 'repo');
    const outside = path.join(base, 'elsewhere');
    fs.mkdirSync(repo);
    fs.mkdirSync(outside);
    expect(() => discoverAgentsRules({ repoRoot: repo, cwd: outside })).toThrow('inside repoRoot');
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('rejects repository AGENTS rules that resolve through a symlink escape', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-symlink-'));
    const repo = path.join(base, 'repo');
    const outside = path.join(base, 'outside.md');
    fs.mkdirSync(repo);
    fs.writeFileSync(outside, 'outside', 'utf8');
    fs.symlinkSync(outside, path.join(repo, 'AGENTS.md'));
    expect(() => discoverAgentsRules({ repoRoot: repo, cwd: repo }))
      .toThrow('outside repoRoot');
    fs.rmSync(base, { recursive: true, force: true });
  });
});
