import {
  checkTurnBudget,
  LoopDetector,
  TurnBudget,
  TurnOutcome,
  TurnUsage,
  validateTurnBudget,
} from '../src/loop-control';

const budget: TurnBudget = {
  maxSteps: 2,
  maxTokens: 20,
  maxWallMs: 100,
  maxToolCalls: 3,
  finalSummaryGraceMs: 10,
};

function usage(overrides: Partial<TurnUsage> = {}): TurnUsage {
  return {
    steps: 0,
    tokens: 0,
    toolCalls: 0,
    modelAttempts: 0,
    elapsedMs: 0,
    ...overrides,
  };
}

describe('Agent Loop control contracts', () => {
  it('defines exactly the exhaustive Turn outcomes (honest completion tri-state)', () => {
    expect(Object.values(TurnOutcome)).toEqual([
      'completed',
      'completed_with_warnings',
      'needs_approval',
      'budget_exceeded',
      'cancelled',
      'stuck',
      'blocked',
      'failed',
    ]);
  });

  it.each([
    ['max_steps', usage({ steps: 2 })],
    ['max_tokens', usage({ tokens: 20 })],
    ['max_wall_ms', usage({ elapsedMs: 100 })],
    ['max_tool_calls', usage({ toolCalls: 3 })],
  ])('checks the independent %s budget', (reason, currentUsage) => {
    expect(checkTurnBudget(budget, currentUsage)).toBe(reason);
  });

  it('rejects invalid budget fields', () => {
    expect(() => validateTurnBudget({ ...budget, maxSteps: 0 })).toThrow(
      'TurnBudget.maxSteps',
    );
    expect(() => validateTurnBudget({ ...budget, maxTokens: 1.5 })).toThrow(
      'TurnBudget.maxTokens',
    );
  });

  it('detects canonicalized repeated arguments but not reordered keys', () => {
    const detector = new LoopDetector(3);
    expect(detector.observe('code.search', { query: 'x', paths: ['src'] }))
      .toBe(false);
    expect(detector.observe('code.search', { paths: ['src'], query: 'x' }))
      .toBe(false);
    expect(detector.observe('code.search', { query: 'x', paths: ['src'] }))
      .toBe(true);
  });

  it('resets the consecutive repetition window when another call intervenes', () => {
    const detector = new LoopDetector(3);
    detector.observe('code.search', { query: 'x' });
    detector.observe('code.search', { query: 'y' });
    expect(detector.observe('code.search', { query: 'x' })).toBe(false);
  });
});
