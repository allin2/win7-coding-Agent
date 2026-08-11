const runnerLog = require('../../product/renderer/runner-log') as {
  sanitize(value: unknown): string;
  create(limit: number): any;
};

describe('read-only bounded Runner log', () => {
  it('removes CSI, OSC title/clipboard, string controls and dangerous links', () => {
    const hostile = [
      '\x1b[31mred\x1b[0m',
      '\x1b]0;owned\x07',
      '\x1b]52;c;Y2xpcGJvYXJk\x07',
      '\x1bP$qm\x1b\\',
      'javascript:alert(1) file:///C:/secret data:text/html,pwn',
    ].join(' ');
    const clean = runnerLog.sanitize(hostile);
    expect(clean).toContain('red');
    expect(clean).not.toMatch(/\x1b|clipboard|javascript:|file:|data:/i);
    expect(clean).toContain('[blocked-link]');
  });

  it('keeps stdout/stderr separate and bounds each stream independently', () => {
    const log = runnerLog.create(1024);
    log.append('stdout', 'a'.repeat(1100));
    log.append('stderr', 'error');
    const snapshot = log.snapshot();
    expect(snapshot.stdout).toHaveLength(1024);
    expect(snapshot.stdoutTruncated).toBe(true);
    expect(snapshot.stderr).toBe('error');
    expect(snapshot.stderrTruncated).toBe(false);
  });

  it('rejects unknown stream names', () => {
    expect(runnerLog.create(1024).append('stdin', 'forbidden')).toEqual({ accepted: false, reason: 'invalid_stream' });
  });
});
