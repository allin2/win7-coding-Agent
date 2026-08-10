import * as fs from 'fs';
import * as path from 'path';

function filesUnder(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

describe('noninteractive Runner static security gates', () => {
  const repositoryRoot = path.resolve(__dirname, '../../..');

  it('keeps direct child_process capability inside the Runner transport adapter', () => {
    const roots = [path.join(repositoryRoot, 'src/core/src'), path.join(repositoryRoot, 'src/shell/product')];
    const violations = roots.flatMap(filesUnder).filter((file) => /\.(?:ts|js)$/.test(file)).filter((file) =>
      /(?:from\s+['"]child_process['"]|require\(['"]child_process['"]\))/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(violations).toEqual([]);
    expect(fs.readFileSync(path.join(repositoryRoot, 'src/runner/src/native-transport.ts'), 'utf8')).toContain("from 'child_process'");
  });

  it('uses no shell concatenation or taskkill containment fallback', () => {
    const transport = fs.readFileSync(path.join(repositoryRoot, 'src/runner/src/native-transport.ts'), 'utf8');
    const nativeSource = filesUnder(path.join(repositoryRoot, 'native/helper'))
      .filter((file) => /\.(?:cpp|h)$/.test(file)).map((file) => fs.readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')).join('\n');
    expect(transport).toContain('shell: false');
    expect(transport).not.toMatch(/exec\s*\(/);
    expect(nativeSource.toLowerCase()).not.toContain('taskkill');
    expect(nativeSource).toContain('TerminateJobObject');
  });

  it('exposes no Renderer terminal input, key injection or process bridge', () => {
    const preload = fs.readFileSync(path.join(repositoryRoot, 'src/shell/product/preload.js'), 'utf8');
    const renderer = fs.readFileSync(path.join(repositoryRoot, 'src/shell/product/renderer/renderer.js'), 'utf8');
    expect(preload).not.toMatch(/terminalInput|terminal\.input|child_process|spawn\s*\(/i);
    expect(renderer).not.toMatch(/terminalInput|terminal\.input|sendKey|pty\.write|child_process/i);
  });
});
