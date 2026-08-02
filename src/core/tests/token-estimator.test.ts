import { estimateContextTokens } from '../src/token-estimator';

describe('estimateContextTokens', () => {
  it('does not apply ASCII chars-per-token assumptions to Chinese rules', () => {
    const chinese = estimateContextTokens('禁止修改数据库结构');
    const ascii = estimateContextTokens('do not change database schema');
    expect(chinese.source).toBe('conservative_utf8');
    expect(chinese.tokens).toBeGreaterThan('禁止修改数据库结构'.length);
    expect(ascii.tokens).toBeLessThan('do not change database schema'.length);
  });

  it('uses a reviewed provider estimate when supplied', () => {
    expect(estimateContextTokens('中文', 2)).toEqual({
      tokens: 2,
      source: 'provided',
    });
  });
});
