import { A9AgentLoop, A9ApprovalRequest, buildA9ApprovalRequest } from '../src/a9-agent-loop';
import { a9ToolSpecs } from '../src/a9-tools';
import { PermissionMode } from '../src/types';
import { ToolRegistry } from '../src/tools';

function loopFor(calls: Array<{ name: string; arguments: string }>, mode = PermissionMode.FULL_ACCESS, auditFail = false,
  onApprovalPending?: (approval: A9ApprovalRequest) => void | Promise<void>) {
  const start = jest.fn(async () => ({ status: 'background_started' as const, handleId: 'h', backgroundHandle: 'h', exitCode: null, stdout: '', stderr: '', durationMs: 1, timedOut: false }));
  const read = jest.fn(() => ({ entries: [{ seq: 1, stream: 'stdout', text: 'tick' }], nextCursor: 'opaque' }));
  const stop = jest.fn(async () => ({ handleId: 'h', status: 'stopped', cleanupRequired: false }));
  const execute = jest.fn();
  let round = 0; const events: any[] = [];
  const loop = new A9AgentLoop({ workspaceRoot: '/w', workspaceService: {} as any, runner: { execute }, permissionMode: mode, managedProcesses: { start, read, stop }, onApprovalPending,
    onAuditEvent: (e) => { if (auditFail && e.type === 'tool_start') throw new Error('disk failed'); }, onEvent: (e) => events.push(e),
    provider: { sendStreamRequest: async () => ++round === 1 ? { id: 'r', content: '', finishReason: 'tool_calls', toolCalls: calls.map((c, i) => ({ id: `call-${i}`, ...c })) } : { id: 'end', content: 'done', finishReason: 'stop' } },
  }); return { loop, start, read, stop, execute, events };
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

const deletionCommand = 'Remove-Item -LiteralPath "C:\\中文 路径\\confirmation-must-not-run" -Force';

it.each(['shell', 'start_process'])('shows the entire original command and cwd for %s approval', (toolName) => {
  for (const command of [
    'git status; npm --registry https://example.invalid publish',
    `${'Write-Output ready; '.repeat(15)}reg.exe delete HKCU\\Software\\A9PolicyProbe`,
    `${'Write-Output ready; '.repeat(15)}${deletionCommand}`,
  ]) {
    const approval = buildA9ApprovalRequest('turn', 'call', toolName, { command, cwd: 'C:\\中文 路径' }, 'confirm');
    expect(approval.summary).toContain(command);
    expect(approval.summary).toContain('C:\\中文 路径');
    expect(approval.args.command).toBe(command);
  }
});

it.each([
  ['shell', 'git status; npm.cmd --registry https://example.invalid publish'],
  ['start_process', 'git status; npm.cmd --registry https://example.invalid publish'],
  ['shell', 'git status & reg.exe add HKCU\\Software\\A9PolicyProbe /v X /d 1'],
  ['start_process', 'git status & reg.exe add HKCU\\Software\\A9PolicyProbe /v X /d 1'],
  ['shell', 'git status; sc.exe delete A9PolicyProbe'],
  ['start_process', 'git status; sc.exe delete A9PolicyProbe'],
  ['shell', "$tool='npm'; & $tool publish"],
  ['start_process', 'cmd /c "set PKG=sc.exe & %PKG% stop A9PolicyProbe"'],
])('blocks %s pending approval and rejects altered high-impact binding: %s', async (name, command) => {
  let saved!: A9ApprovalRequest;
  const f = loopFor([{ name, arguments: JSON.stringify({ command }) }], PermissionMode.FULL_ACCESS, false,
    async (approval) => { saved = approval; });
  const result = await f.loop.runTurn('high impact');
  expect(result.outcome).toBe('needs_approval');
  expect(saved).toBe(result.pendingApproval);
  expect(saved.summary).toContain(command);
  expect(f.events.some((event) => event.type === 'tool_start')).toBe(false);
  expect(f.start).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  const changed = buildA9ApprovalRequest(saved.turnId, saved.callId, name, { ...saved.args, command: command + ' --different-target' }, saved.reason);
  await expect(f.loop.resumeAfterApproval({ approvalId: saved.approvalId, bindingDigest: changed.bindingDigest, decision: 'approved' })).rejects.toMatchObject({ code: 'APPROVAL_INVALID' });
  (f.loop as any).suspended.pending.arguments = JSON.stringify({ command: command + ' --different-target' });
  await expect(f.loop.resumeAfterApproval({ approvalId: saved.approvalId, bindingDigest: saved.bindingDigest, decision: 'approved' })).rejects.toMatchObject({ code: 'APPROVAL_INVALID' });
  expect(f.start).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  (f.loop as any).suspended.pending.arguments = JSON.stringify({ command });
  await f.loop.resumeAfterApproval({ approvalId: saved.approvalId, bindingDigest: saved.bindingDigest, decision: 'denied' });
  expect(f.start).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  expect(f.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'tool_end', data: expect.objectContaining({ denied: true, sideEffects: 0 }) })]));
});

it('awaits pending approval persistence before returning and denial makes zero Runner/managed dispatches', async () => {
  let entered!: () => void;
  const pendingEntered = new Promise<void>((resolve) => { entered = resolve; });
  let persisted!: () => void;
  const persistence = new Promise<void>((resolve) => { persisted = resolve; });
  let saved!: A9ApprovalRequest;
  const f = loopFor([{ name: 'start_process', arguments: JSON.stringify({ command: deletionCommand }) }], PermissionMode.FULL_ACCESS, false,
    async (approval) => { saved = approval; entered(); await persistence; });
  let returned = false;
  const turn = f.loop.runTurn('delete').then((result) => { returned = true; return result; });
  await pendingEntered;
  expect(returned).toBe(false);
  expect(saved).toMatchObject({ toolName: 'start_process', args: { command: deletionCommand, cwd: '' } });
  expect(f.events.some((event) => event.type === 'tool_start')).toBe(false);
  expect(f.start).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  persisted();
  const result = await turn;
  expect(result.outcome).toBe('needs_approval'); expect(result.pendingApproval).toBe(saved);
  await f.loop.resumeAfterApproval({ approvalId: saved.approvalId, bindingDigest: saved.bindingDigest, decision: 'denied' });
  expect(f.start).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  expect(f.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'tool_end', data: expect.objectContaining({ denied: true, sideEffects: 0 }) })]));
});

it.each([
  'Remove-Item -LiteralPath "C:\\中文 路径\\different-target" -Force',
  `${deletionCommand} -Recurse`,
])('rejects a digest bound to a changed deletion target/argument without native dispatch: %s', async (changed) => {
  const f = loopFor([{ name: 'start_process', arguments: JSON.stringify({ command: deletionCommand }) }]);
  const result = await f.loop.runTurn('delete');
  expect(result.outcome).toBe('needs_approval');
  const approval = result.pendingApproval!;
  const changedApproval = buildA9ApprovalRequest(approval.turnId, approval.callId, 'start_process', { command: changed, cwd: '' }, approval.reason);
  expect(changedApproval.bindingDigest).not.toBe(approval.bindingDigest);
  await expect(f.loop.resumeAfterApproval({ approvalId: approval.approvalId, bindingDigest: changedApproval.bindingDigest, decision: 'approved' })).rejects.toMatchObject({ code: 'APPROVAL_INVALID' });
  expect(f.start).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  await f.loop.resumeAfterApproval({ approvalId: approval.approvalId, bindingDigest: approval.bindingDigest, decision: 'denied' });
});

it('recomputes the original digest when suspended deletion arguments change', async () => {
  const f = loopFor([{ name: 'start_process', arguments: JSON.stringify({ command: deletionCommand }) }]);
  const result = await f.loop.runTurn('delete');
  expect(result.outcome).toBe('needs_approval');
  const approval = result.pendingApproval!;
  // Fault injection at the saved pending-call boundary: the original approval
  // must not authorize a request altered after persistence.
  (f.loop as any).suspended.pending.arguments = JSON.stringify({ command: `${deletionCommand} -Recurse` });
  await expect(f.loop.resumeAfterApproval({ approvalId: approval.approvalId, bindingDigest: approval.bindingDigest, decision: 'approved' })).rejects.toMatchObject({ code: 'APPROVAL_INVALID' });
  expect(f.start).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  (f.loop as any).suspended.pending.arguments = JSON.stringify({ command: deletionCommand });
  await f.loop.resumeAfterApproval({ approvalId: approval.approvalId, bindingDigest: approval.bindingDigest, decision: 'denied' });
});

it('rejects a stale deletion approval in a fresh turn and never promotes Read Only', async () => {
  const previous = loopFor([{ name: 'start_process', arguments: JSON.stringify({ command: deletionCommand }) }]);
  const first = await previous.loop.runTurn('delete');
  expect(first.outcome).toBe('needs_approval');
  const old = first.pendingApproval!;
  await previous.loop.resumeAfterApproval({ approvalId: old.approvalId, bindingDigest: old.bindingDigest, decision: 'denied' });
  const current = loopFor([{ name: 'start_process', arguments: JSON.stringify({ command: deletionCommand }) }]);
  const second = await current.loop.runTurn('delete again');
  expect(second.outcome).toBe('needs_approval');
  await expect(current.loop.resumeAfterApproval({ approvalId: old.approvalId, bindingDigest: old.bindingDigest, decision: 'approved' })).rejects.toMatchObject({ code: 'APPROVAL_INVALID' });
  expect(previous.start).not.toHaveBeenCalled(); expect(current.start).not.toHaveBeenCalled(); expect(current.execute).not.toHaveBeenCalled();
  const fresh = second.pendingApproval!;
  await current.loop.resumeAfterApproval({ approvalId: fresh.approvalId, bindingDigest: fresh.bindingDigest, decision: 'denied' });
  const readOnly = loopFor([{ name: 'start_process', arguments: JSON.stringify({ command: deletionCommand }) }], PermissionMode.READ_ONLY);
  await readOnly.loop.runTurn('delete');
  expect(readOnly.start).not.toHaveBeenCalled(); expect(readOnly.execute).not.toHaveBeenCalled();
  expect(readOnly.events.some((event) => event.type === 'approval_required')).toBe(false);
});
