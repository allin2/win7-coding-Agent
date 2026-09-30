import { A9AgentLoop, A9LoopMessage, A9ModelPort } from '../src';
import { assembleWithinBudget } from '../src/a9-context-budget';

function protocolPairs(messages: A9LoopMessage[]): boolean {
  for (let index = 0; index < messages.length; index += 1) {
    const calls = messages[index].toolCalls || [];
    if (calls.length === 0) continue;
    const results = messages.slice(index + 1, index + 1 + calls.length);
    if (results.length !== calls.length || results.some((item, offset) => item.role !== 'tool' || item.toolCallId !== calls[offset].id)) return false;
  }
  return true;
}

describe('A9-26 request context budget', () => {
  it.each(['current input', 'project instructions'])('A9-28 blocks an irreducible %s before Provider send', async (source) => {
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockResolvedValue({ id: 'done', content: 'done', finishReason: 'stop' }) };
    const events: any[] = [];
    const loop = new A9AgentLoop({ workspaceRoot: '/mock', provider, workspaceService: {} as any, runner: {} as any,
      contextBudgetChars: 16_000, onEvent: (event) => events.push(event),
      ...(source === 'project instructions' ? { loadProjectInstructions: () => ({ status: 'loaded' as const, bytes: 20_000,
        sha256: 'fixture', content: 'p'.repeat(20_000) }) } : {}),
    });
    const result = await loop.runTurn(source === 'current input' ? 'u'.repeat(17_000) : 'short input');
    expect(provider.sendStreamRequest).not.toHaveBeenCalled();
    expect(result.outcome).toBe('failed');
    expect(result.finalMessage).toContain('上下文');
    expect(events.find((event) => event.type === 'turn_failed')?.data.code).toBe('A9_CONTEXT_BUDGET_EXCEEDED');
    expect(loop.getConversationHistory().find((message) => message.role === 'user')?.content)
      .toBe(source === 'current input' ? 'u'.repeat(17_000) : 'short input');
  });

  it('A9-28 does not send an oversized half-budget retry', async () => {
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockRejectedValue(
      Object.assign(new Error('context_length_exceeded'), { statusCode: 400 })) };
    const loop = new A9AgentLoop({ workspaceRoot: '/mock', provider, workspaceService: {} as any, runner: {} as any,
      contextBudgetChars: 16_000, loadProjectInstructions: () => ({ status: 'loaded', bytes: 9_000, sha256: 'fixture', content: 'p'.repeat(9_000) }) });
    const result = await loop.runTurn('short input');
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('failed');
    expect(result.finalMessage).toBe('对话过长，已尝试压缩仍超出模型上限');
  });

  it.each(['tool arguments', 'last tool result'])('A9-28 never sends irreducible %s or breaks pairing', async (source) => {
    const requests: A9LoopMessage[][] = [];
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockImplementation(async (request) => {
      requests.push(request.messages);
      return { id: 'call', content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'read-1', name: 'read',
        arguments: JSON.stringify({ path: 'x', ...(source === 'tool arguments' ? { marker: 'a'.repeat(20_000) } : {}) }) }] };
    }) };
    const loop = new A9AgentLoop({ workspaceRoot: '/mock', provider, runner: {} as any, contextBudgetChars: 16_000,
      maxToolResultChars: 30_000,
      workspaceService: { read: jest.fn().mockResolvedValue({ content: 'x'.repeat(source === 'last tool result' ? 20_000 : 4) }) } as any });
    const result = await loop.runTurn('read x');
    expect(requests).toHaveLength(1);
    expect(result.outcome).toBe('failed');
    expect(result.finalMessage).toContain('上下文');
    const history = loop.getConversationHistory();
    expect(protocolPairs(history)).toBe(true);
    expect(history.find((message) => message.role === 'user')?.content).toBe('read x');
    if (source === 'tool arguments') {
      expect(JSON.parse(history.find((message) => message.toolCalls)?.toolCalls![0].arguments || '{}').marker)
        .toHaveLength(20_000);
    } else {
      expect(history.find((message) => message.role === 'tool')?.content)
        .toBe(JSON.stringify({ content: 'x'.repeat(20_000) }, null, 2));
    }
  });

  it('R3-01 50 rounds × 30 steps × 16 KiB fit budget with protocol pairs intact', () => {
    const messages: A9LoopMessage[] = [{ role: 'system', content: 'System Prompt' }];
    for (let round = 0; round < 50; round += 1) {
      messages.push({ role: 'user', content: `round ${round}` });
      for (let step = 0; step < 30; step += 1) {
        const id = `r${round}-s${step}`;
        messages.push({ role: 'assistant', content: '', toolCalls: [{ id, name: 'read', arguments: '{"path":"file"}' }] });
        messages.push({ role: 'tool', toolCallId: id, toolName: 'read', content: 'x'.repeat(16 * 1024) });
      }
    }
    const before = messages[2].content;
    const result = assembleWithinBudget(messages, { budgetChars: 96_000, fixedPrefixCount: 1 });
    expect(result.stats.estimatedChars).toBeLessThanOrEqual(96_000);
    expect(protocolPairs(result.messages)).toBe(true);
    expect(result.stats.omittedRounds).toBe(49);
    expect(result.stats.elidedToolResults).toBeGreaterThan(0);
    expect(messages[2].content).toBe(before);
    expect(messages[messages.length - 1].content).toHaveLength(16 * 1024);
  });

  it('R3-02 omits oldest complete rounds and retains current user plus last tool result', () => {
    const messages: A9LoopMessage[] = [{ role: 'system', content: 'fixed' }];
    for (let round = 0; round < 4; round += 1) {
      messages.push({ role: 'user', content: `user-${round}` });
      messages.push({ role: 'assistant', content: 'a'.repeat(50) });
    }
    const selected = assembleWithinBudget(messages, { budgetChars: 130, fixedPrefixCount: 1 });
    expect(selected.messages.filter((message) => message.role === 'user').map((message) => message.content))
      .toEqual(['user-2', 'user-3']);
    expect(selected.stats.omittedRounds).toBe(2);
    const current: A9LoopMessage[] = [
      { role: 'system', content: 'fixed' }, { role: 'user', content: 'current' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'one', name: 'read', arguments: '{}' }] },
      { role: 'tool', content: 'z'.repeat(1000), toolCallId: 'one' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'two', name: 'read', arguments: '{}' }] },
      { role: 'tool', content: 'last-result', toolCallId: 'two' },
    ];
    const reduced = assembleWithinBudget(current, { budgetChars: 180, fixedPrefixCount: 1 });
    expect(reduced.messages.find((message) => message.role === 'user')?.content).toBe('current');
    expect(reduced.messages[reduced.messages.length - 1].content).toBe('last-result');
    expect(reduced.stats.elidedToolResults).toBe(1);
    expect(protocolPairs(reduced.messages)).toBe(true);
  });

  it('R3-03 recognized overflow retries once at half budget and succeeds', async () => {
    const requests: A9LoopMessage[][] = [];
    let count = 0;
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockImplementation(async (request) => {
      requests.push(request.messages);
      count += 1;
      if (count === 1) throw Object.assign(new Error('context_length_exceeded'), { statusCode: 400 });
      return { id: 'done', content: 'done', finishReason: 'stop' };
    }) };
    const events: any[] = [];
    const loop = new A9AgentLoop({ workspaceRoot: '/mock', provider, workspaceService: {} as any, runner: {} as any,
      contextBudgetChars: 16_000, onEvent: (event) => events.push(event) });
    loop.restoreConversationHistory(Array.from({ length: 100 }, (_, index) => [
      { role: 'user' as const, content: `history-${index}-` + 'x'.repeat(150) },
      { role: 'assistant' as const, content: 'y'.repeat(150) },
    ]).flat());
    const result = await loop.runTurn('current');
    expect(result.outcome).toBe('completed');
    expect(requests).toHaveLength(2);
    expect(requests[1].length).toBeLessThan(requests[0].length);
    expect(events.find((event) => event.type === 'turn_started').data.context.budgetChars).toBe(16_000);
  });

  it('R3-03 second overflow fails with a readable reason', async () => {
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockRejectedValue(
      Object.assign(new Error('maximum context length exceeded'), { statusCode: 413 }),
    ) };
    const events: any[] = [];
    const loop = new A9AgentLoop({ workspaceRoot: '/mock', provider, workspaceService: {} as any, runner: {} as any,
      onEvent: (event) => events.push(event) });
    const result = await loop.runTurn('current');
    expect(result.outcome).toBe('failed');
    expect(result.finalMessage).toBe('对话过长，已尝试压缩仍超出模型上限');
    expect(events.find((event) => event.type === 'turn_failed').data.error).toBe(result.finalMessage);
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(2);
  });

  it('R3-04 ample budget preserves request content byte for byte', () => {
    const messages: A9LoopMessage[] = [
      { role: 'system', content: 'prompt' }, { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'one', toolCalls: [{ id: 'id', name: 'read', arguments: '{"path":"x"}' }] },
      { role: 'tool', content: 'result', toolCallId: 'id' },
    ];
    const before = JSON.stringify(messages);
    const result = assembleWithinBudget(messages, { budgetChars: 96_000, fixedPrefixCount: 1 });
    expect(JSON.stringify(result.messages)).toBe(before);
    expect(JSON.stringify(messages)).toBe(before);
    expect(result.stats.omittedRounds).toBe(0);
  });
});
