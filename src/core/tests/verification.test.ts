import { VerificationGate } from '../src/verification';

describe('VerificationGate', () => {
  const now = () => new Date('2026-07-30T00:00:00.000Z');
  const requirement = { checkId: 'tests', description: 'Unit tests pass' };
  const evidence = {
    checkId: 'tests',
    status: 'passed' as const,
    complete: true,
    summary: '12 passed',
    source: 'npm test',
    timestamp: '2026-07-30T00:00:00.000Z',
  };

  it('passes complete evidence and produces a stable digest', () => {
    const gate = new VerificationGate(now);
    const first = gate.evaluate('task-1', 'run-1', [requirement], [evidence]);
    const second = gate.evaluate('task-1', 'run-1', [requirement], [evidence]);
    expect(first.passed).toBe(true);
    expect(first.failures).toEqual([]);
    expect(first.failedCheckIds).toEqual([]);
    expect(first.digestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.digestSha256).toBe(second.digestSha256);
  });

  it.each([
    ['missing', []],
    ['failed', [{ ...evidence, status: 'failed' as const }]],
    ['unavailable', [{ ...evidence, status: 'unavailable' as const }]],
    ['incomplete', [{ ...evidence, complete: false }]],
  ])('fails %s evidence', (_name, items) => {
    const bundle = new VerificationGate(now)
      .evaluate('task-1', 'run-1', [requirement], items);
    expect(bundle.passed).toBe(false);
    expect(bundle.failures.length).toBeGreaterThan(0);
    expect(bundle.failedCheckIds).toEqual(['tests']);
  });

  it('does not allow vacuous completion without requirements', () => {
    const bundle = new VerificationGate(now)
      .evaluate('task-1', 'run-1', [], []);
    expect(bundle.passed).toBe(false);
    expect(bundle.failures).toContain('No verification requirements were declared');
  });
});
