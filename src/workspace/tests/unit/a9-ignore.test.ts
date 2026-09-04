import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createWorkspaceIgnoreFilter } from '../../src';

describe('A9-03: A9 Ignore Filter', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-ignore-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('filters built-in ignored patterns like node_modules, .git, .venv', () => {
    const filter = createWorkspaceIgnoreFilter(tempDir);
    expect(filter.isIgnored('.git')).toBe(true);
    expect(filter.isIgnored('.git/config')).toBe(true);
    expect(filter.isIgnored('node_modules/package/index.js')).toBe(true);
    expect(filter.isIgnored('.venv/lib/python3.8')).toBe(true);
    expect(filter.isIgnored('src/index.ts')).toBe(false);
  });

  it('reads and respects .gitignore and .agentignore files', () => {
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'temp_*\n*.secret\nbuild/\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, '.agentignore'), 'custom_agent_ignore.md\n', 'utf8');

    const filter = createWorkspaceIgnoreFilter(tempDir);
    expect(filter.isIgnored('temp_output.log')).toBe(true);
    expect(filter.isIgnored('secrets.secret')).toBe(true);
    expect(filter.isIgnored('build/out.js')).toBe(true);
    expect(filter.isIgnored('custom_agent_ignore.md')).toBe(true);
    expect(filter.isIgnored('src/main.ts')).toBe(false);
  });
});
