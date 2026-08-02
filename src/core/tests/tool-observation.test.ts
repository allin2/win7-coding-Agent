import {
  createToolObservation,
  foldToolObservation,
} from '../src/tool-observation';

describe('ToolObservation', () => {
  it('is strictly bounded and retains digest/truncation metadata', () => {
    const observation = createToolObservation({ output: '中'.repeat(2_000) }, 512);
    expect(observation.truncated).toBe(true);
    expect(observation.content.length).toBeLessThanOrEqual(512);
    expect(observation.originalChars).toBeGreaterThan(512);
    expect(observation.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(observation.state).toBe('full');
  });

  it('folds to a recoverable reference without changing source digest', () => {
    const observation = createToolObservation({ output: 'large result' });
    const folded = foldToolObservation(observation, 'call-1');
    expect(folded.state).toBe('folded');
    expect(folded.sha256).toBe(observation.sha256);
    expect(folded.content).toContain('Re-run');
  });
});
