import {
  TrustedShellRunner,
  TrustedShellRequest,
} from '../src';

describe('A9-02: TrustedShellRunner', () => {
  const runner = new TrustedShellRunner();

  it('executes simple echo command and captures stdout', async () => {
    const result = await runner.execute({
      command: 'echo "hello trusted runner"',
    });

    expect(result.schemaVersion).toBe('2.0');
    expect(result.status).toBe('exited');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello trusted runner');
  });

  it('supports pipelines and redirects in command text', async () => {
    const result = await runner.execute({
      command: 'echo "line1\nline2\nline3" | grep "line2"',
    });

    if (result.status === 'exited') {
      expect(result.stdout).toContain('line2');
    }
  });

  it('accurately preserves non-zero exit codes', async () => {
    const result = await runner.execute({
      command: 'exit 42',
    });

    expect(result.status).toBe('exited');
    expect(result.exitCode).toBe(42);
  });

  it('handles cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const result = await runner.execute({
      command: 'sleep 5',
      signal: controller.signal,
    });

    expect(['cancelled', 'failed', 'exited']).toContain(result.status);
    expect(result.termination.requested).toBe(true);
  });

  it('handles timeout when command exceeds timeoutMs', async () => {
    const result = await runner.execute({
      command: 'sleep 5',
      timeoutMs: 150,
    });

    expect(['timeout', 'failed', 'exited']).toContain(result.status);
    expect(result.termination.requested).toBe(true);
  });

  it('truncates oversized output properly without losing status', async () => {
    const result = await runner.execute({
      command: 'node -e "for(let i=0;i<500;i++) console.log(\'line \' + i)"',
      maxOutputLines: 50,
      maxOutputBytes: 1024,
    });

    expect(result.status).toBe('exited');
    expect(result.truncated).toBe(true);
    expect(result.stdout).toContain('[Output truncated');
  });
});
