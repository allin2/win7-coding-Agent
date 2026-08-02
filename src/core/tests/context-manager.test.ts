import { ContextManager } from '../src/context-manager';

describe('ContextManager', () => {
  const manager = new ContextManager();

  it('selects deterministically by priority then id and records omissions', () => {
    const first = manager.build([
      { id: 'b', kind: 'history', content: 'bbbb', priority: 1, estimatedTokens: 2 },
      { id: 'a', kind: 'instruction', content: 'aaaa', priority: 3, estimatedTokens: 2 },
      { id: 'c', kind: 'task', content: 'cccc', priority: 2, estimatedTokens: 2 },
    ], {
      maxTokens: 4,
      maxItems: 2,
      maxChars: 20,
    });
    const second = manager.build([
      { id: 'c', kind: 'task', content: 'cccc', priority: 2, estimatedTokens: 2 },
      { id: 'a', kind: 'instruction', content: 'aaaa', priority: 3, estimatedTokens: 2 },
      { id: 'b', kind: 'history', content: 'bbbb', priority: 1, estimatedTokens: 2 },
    ], {
      maxTokens: 4,
      maxItems: 2,
      maxChars: 20,
    });

    expect(first.items.map((item) => item.id)).toEqual(['a', 'c']);
    expect(first.manifest.omitted).toEqual([
      expect.objectContaining({ id: 'b', reason: 'item_limit' }),
    ]);
    expect(first.manifest.truncated).toBe(true);
    expect(first.manifest.digestSha256).toBe(second.manifest.digestSha256);
  });

  it('distinguishes token and character budget omissions', () => {
    const tokenLimited = manager.build([
      { id: 'a', kind: 'task', content: 'abcd', priority: 1, estimatedTokens: 5 },
    ], { maxTokens: 4, maxItems: 2, maxChars: 20 });
    expect(tokenLimited.manifest.omitted[0].reason).toBe('token_limit');

    const charLimited = manager.build([
      { id: 'a', kind: 'task', content: 'abcdefgh', priority: 1, estimatedTokens: 1 },
    ], { maxTokens: 4, maxItems: 2, maxChars: 4 });
    expect(charLimited.manifest.omitted[0].reason).toBe('character_limit');
  });

  it('rejects duplicate item ids and invalid budgets', () => {
    expect(() => manager.build([
      { id: 'same', kind: 'task', content: 'a', priority: 1 },
      { id: 'same', kind: 'history', content: 'b', priority: 1 },
    ], { maxTokens: 10, maxItems: 2, maxChars: 10 })).toThrow('unique');
    expect(() => manager.build([], {
      maxTokens: 0,
      maxItems: 1,
      maxChars: 1,
    })).toThrow('positive integer');
  });

  it('binds the manifest digest to the actual selected content', () => {
    const budget = { maxTokens: 10, maxItems: 2, maxChars: 100 };
    const allow = manager.build([{ id: 'rule', kind: 'instruction', content: 'ALLOW', priority: 1 }], budget);
    const deny = manager.build([{ id: 'rule', kind: 'instruction', content: 'DENY!', priority: 1 }], budget);
    expect(allow.manifest.digestSha256).not.toBe(deny.manifest.digestSha256);
    expect(allow.manifest.included[0].contentSha256).not.toBe(deny.manifest.included[0].contentSha256);
  });

  it('fails closed instead of omitting a protected rule', () => {
    expect(() => manager.build([
      { id: 'policy', kind: 'instruction', content: 'mandatory', priority: 1, protection: 'protected' },
    ], { maxTokens: 1, maxItems: 1, maxChars: 1 })).toThrow('Protected context item');
  });
});
