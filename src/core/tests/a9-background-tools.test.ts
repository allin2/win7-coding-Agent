import { A9AgentLoop, buildA9ApprovalRequest } from '../src/a9-agent-loop';
import { a9ToolSpecs } from '../src/a9-tools';
import { PermissionMode } from '../src/types';
import { ToolRegistry } from '../src/tools';

function loopFor(calls: Array<{ name: string; arguments: string }>, mode = PermissionMode.FULL_ACCESS, auditFail = false) {
  const start = jest.fn(async () => ({ status: 'background_started' as const, handleId: 'h', backgroundHandle: 'h', exitCode: null, stdout: '', stderr: '', durationMs: 1, timedOut: false }));
  const read = jest.fn(() => ({ entries: [{ seq: 1, stream: 'stdout', text: 'tick' }], nextCursor: 'opaque' }));
  const stop = jest.fn(async () => ({ handleId: 'h', status: 'stopped', cleanupRequired: false }));
  let round = 0; const events: any[] = [];
  const loop = new A9AgentLoop({ workspaceRoot: '/w', workspaceService: {} as any, runner: { execute: jest.fn() }, permissionMode: mode, managedProcesses: { start, read, stop },
    onAuditEvent: (e) => { if (auditFail && e.type === 'tool_start') throw new Error('disk failed'); }, onEvent: (e) => events.push(e),
    provider: { sendStreamRequest: async () => ++round === 1 ? { id: 'r', content: '', finishReason: 'tool_calls', toolCalls: calls.map((c, i) => ({ id: `call-${i}`, ...c })) } : { id: 'end', content: 'done', finishReason: 'stop' } },
  }); return { loop, start, read, stop, events };
}
it('dispatches all three tools through the product-owned scope and gives background no verification credit', async () => {
  const f = loopFor([{ name: 'start_process', arguments: '{"command":"npm test"}' }, { name: 'read_process_output', arguments: '{"handleId":"h"}' }, { name: 'stop_process', arguments: '{"handleId":"h"}' }]);
  const result = await f.loop.runTurn('run');
  expect(f.start).toHaveBeenCalledWith('npm test', expect.objectContaining({ cwd: '/w', toolCallId: 'call-0', turnId: expect.any(String) }));
  expect(f.read).toHaveBeenCalledWith('h', undefined, 8192); expect(f.stop).toHaveBeenCalledWith('h');
  expect(result.outcome).not.toBe('completed_verified');
  expect(f.events.filter((e) => e.type === 'tool_end')).toHaveLength(3);
});
it('keeps Git external-write confirmation and target binding for start_process', async () => {
  const f = loopFor([{ name: 'start_process', arguments: '{"command":"git push origin main"}' }]);
  const result = await f.loop.runTurn('run'); expect(result.outcome).toBe('needs_approval'); expect(f.start).not.toHaveBeenCalled();
  const approval = buildA9ApprovalRequest('t', 'c', 'start_process', { command: 'git push origin main' }, 'confirm');
  expect(approval.gitBinding).toBeDefined(); expect(approval.toolName).toBe('start_process');
});
it('does not dispatch start or stop in Read Only but allows owned reads', async () => {
  const f = loopFor([{ name: 'start_process', arguments: '{"command":"echo x"}' }, { name: 'stop_process', arguments: '{"handleId":"h"}' }, { name: 'read_process_output', arguments: '{"handleId":"h"}' }], PermissionMode.READ_ONLY);
  await f.loop.runTurn('run'); expect(f.start).not.toHaveBeenCalled(); expect(f.stop).not.toHaveBeenCalled(); expect(f.read).toHaveBeenCalledTimes(1);
});
it('rejects arbitrary PID, owner and environment overrides and invalid output budgets', () => {
  const registry = new ToolRegistry(); for (const spec of a9ToolSpecs()) registry.register(spec);
  for (const [name, args] of [['start_process', { command: 'echo x', pid: 1 }], ['start_process', { command: 'x', envOverlay: {} }], ['stop_process', { handleId: 'h', conversationId: 'other' }], ['read_process_output', { handleId: 'h', maxBytes: 16385 }]] as const) {
    expect(() => registry.normalizeCall({ id: 'c', toolName: name, args, approvalLevel: registry.resolve(name).approvalLevel })).toThrow();
  }
});
it('mandatory start audit failure prevents background spawning and subsequent dispatch', async () => {
  const f = loopFor([{ name: 'start_process', arguments: '{"command":"echo x"}' }, { name: 'read_process_output', arguments: '{"handleId":"h"}' }], PermissionMode.FULL_ACCESS, true);
  const result = await f.loop.runTurn('run'); expect(result.auditIncomplete).toBeDefined(); expect(f.start).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
});
