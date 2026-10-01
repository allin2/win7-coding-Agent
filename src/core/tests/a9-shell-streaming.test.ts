import { A9AgentLoop, A9LoopEvent } from '../src/a9-agent-loop';

function makeLoop(fail = false) {
  const events: A9LoopEvent[] = [];
  let round = 0;
  const runner = { execute: jest.fn(async (_command, options) => {
    await options.onOutput({ requestId: 'req', stream: 'stdout', outputSeq: 1, sourceSeqThrough: 1, text: 'tick\n', rawBytesRead: 5, truncated: false });
    expect(events.some((e) => e.type === 'tool_end')).toBe(false);
    return { status: 'exited', exitCode: 1, stdout: 'tick\n', stderr: '', timedOut: false, durationMs: 1, outputProtocolVersion: 3 };
  }) };
  const loop = new A9AgentLoop({ workspaceRoot: '/mock', workspaceService: {} as any, runner: runner as any,
    provider: { sendStreamRequest: async () => ++round === 1 ? { id: 'r', content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'call', name: 'shell', arguments: '{"command":"echo tick"}' }] } : { id: 'done', content: 'done', finishReason: 'stop' } },
    onAuditEvent: (e) => { if (fail && e.type === 'tool_output') throw new Error('disk failed'); }, onEvent: (e) => events.push(e),
  });
  return { loop, events, runner };
}
it('emits versioned, turn/tool-bound output before terminal and keeps it out of model history', async () => {
  const { loop, events } = makeLoop(); await loop.runTurn('run');
  const output = events.find((e) => e.type === 'tool_output')!;
  expect(output.data).toMatchObject({ schemaVersion: 1, toolCallId: 'call', requestId: 'req', outputSeq: 1 });
  expect(output.turnId).toBe(events.find((e) => e.type === 'tool_start')!.turnId);
  expect(events.find((e) => e.type === 'tool_end')!.data.shell).toMatchObject({ exitCode: 1, outputProtocolVersion: 3 });
  expect(loop.getConversationHistory().filter((m) => m.role === 'tool')).toHaveLength(1);
});
it('required output audit failure stops publication and later tools', async () => {
  const { loop, events, runner } = makeLoop(true); const result = await loop.runTurn('run');
  expect(result.auditIncomplete).toMatchObject({ code: 'A9_AUDIT_PERSISTENCE_FAILED', failedEvent: 'tool_output' });
  expect(events.some((e) => e.type === 'tool_output')).toBe(false); expect(runner.execute).toHaveBeenCalledTimes(1);
});
