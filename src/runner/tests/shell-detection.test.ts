import { detectSystemShells, getActiveShell } from '../src';

describe('A9-02: Shell Detection', () => {
  it('detects available system shells', () => {
    const shells = detectSystemShells();
    expect(shells.length).toBeGreaterThan(0);
    expect(shells.some((s) => s.available)).toBe(true);
  });

  it('resolves active shell with fallback', () => {
    const active = getActiveShell();
    expect(active).toBeDefined();
    expect(typeof active.kind).toBe('string');
    expect(typeof active.path).toBe('string');
  });

  it('respects workspace preferred shell if available', () => {
    const active = getActiveShell({ workspacePreferred: 'sh' });
    if (process.platform !== 'win32') {
      expect(active.kind).toBe('sh');
    }
  });
});
