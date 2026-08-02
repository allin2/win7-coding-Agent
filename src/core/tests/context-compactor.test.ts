import { createDeterministicContextCompactor } from '../src/context-compactor';

describe('deterministic context compactor', () => {
  it('produces a bounded State-compatible summary with recovery guidance', async () => {
    const compact = createDeterministicContextCompactor(1_024);
    const result = await compact({
      request: {
        sessionId: 's',
        threadId: 't',
        turnId: 'turn',
        taskId: 'task',
        runId: 'run',
        prompt: 'goal',
        acceptance: { schemaVersion: '1.0', checks: [{ checkId: 'result', description: 'Result reviewed' }] },
        contextBudget: { maxTokens: 100, maxItems: 10, maxChars: 10_000 },
      },
      messages: Array.from({ length: 20 }, (_value, index) => ({
        role: 'assistant' as const,
        content: `message ${index} ${'x'.repeat(100)}`,
      })),
      error: new Error('watermark'),
      lastEventSequence: 42,
    });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.length).toBeLessThanOrEqual(1_024);
    expect(result.messages[0].content).toContain('recovery:');
    expect(result.replacedSeqRange).toEqual({ fromSeq: 1, toSeq: 42 });
  });
});
