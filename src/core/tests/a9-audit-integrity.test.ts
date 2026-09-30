import { A9AgentLoop, A9LoopEvent, A9ModelPort, PermissionMode } from '../src';

describe('A9-29 mandatory audit boundary', () => {
  async function execute(failedEvent?: string, observerFails = false) {
    const edit = jest.fn().mockResolvedValue({ replaced: true });
    const recorded: string[] = [];
    let requests = 0;
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockImplementation(async () => ++requests === 1
      ? { id: 'tools', content: '', finishReason: 'tool_calls', toolCalls: [1, 2].map((i) => ({ id: `edit-${i}`, name: 'edit',
        arguments: JSON.stringify({ path: 'x', old_text: 'a', new_text: 'b' }) })) }
      : { id: 'done', content: 'done', finishReason: 'stop' }) };
    const config: any = { workspaceRoot: '/mock', provider, workspaceService: { edit }, runner: {},
      onAuditEvent: (event: A9LoopEvent) => {
        if (event.type === failedEvent) throw new Error('private injected storage failure');
        recorded.push(event.type);
      },
      onEvent: () => { if (observerFails) throw new Error('observer failed'); },
    };
    const result = await new A9AgentLoop(config).runTurn('edit twice');
    return { result, edit, recorded, provider };
  }

  it.each([['turn_started', 0], ['tool_start', 0], ['tool_end', 1], ['turn_completed', 2]])(
    '%s failure stops execution and preserves %i dispatched edits', async (event, edits) => {
      const { result, edit, recorded } = await execute(event as string);
      expect(edit).toHaveBeenCalledTimes(edits as number);
      expect(result.outcome).toBe('failed');
      expect((result as any).auditIncomplete).toEqual({ code: 'A9_AUDIT_PERSISTENCE_FAILED', failedEvent: event });
      expect(result.toolCallsExecuted).toBe(edits);
      expect(recorded).not.toContain(event);
      expect(result.finalMessage).not.toContain('private injected');
      expect(result.verification).toBe(edits ? 'unverified' : 'not_applicable');
    });

  it('observer failure does not stop an audited tool or hide final observer diagnostics', async () => {
    const { result, edit, recorded } = await execute(undefined, true);
    expect(edit).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('completed_with_warnings');
    expect((result as any).auditIncomplete).toBeUndefined();
    expect(recorded.filter((type) => type === 'tool_start')).toHaveLength(2);
    expect(result.eventHandlerErrors?.some((error) => error.includes('turn_completed'))).toBe(true);
  });

  it.each([false, true])('counts the Shell before its external-change audit fails (residue=%s)', async (residueRisk) => {
    const runner = { execute: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 1, residueRisk }) };
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockResolvedValue({ id: 'shell', content: '', finishReason: 'tool_calls',
      toolCalls: [{ id: 's', name: 'shell', arguments: '{"command":"echo changed"}' }] }) };
    const loop = new A9AgentLoop({ workspaceRoot: '/mock', provider, runner, workspaceService: {} as any,
      externalChangePort: { freezeTurnBaseline: jest.fn().mockResolvedValue({}),
        collectExternalChanges: jest.fn().mockResolvedValue([{ path: 'x', kind: 'created', recoverable: true }]) } as any,
      onAuditEvent: (event) => { if (event.type === 'tool_end') throw new Error('audit failed'); } });
    const result = await loop.runTurn('shell');
    expect(runner.execute).toHaveBeenCalledTimes(1);
    expect(result.toolCallsExecuted).toBe(1);
    expect(result.totalSteps).toBe(1);
    expect(result.externalChanges).toEqual([{ path: 'x', kind: 'created', recoverable: true }]);
    expect(result.auditIncomplete?.failedEvent).toBe('tool_end');
    await loop.runTurn('retry');
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(1);
  });

  it('records successful staging before its end audit fails without double counting', async () => {
    const staging = { stageEdit: jest.fn().mockResolvedValue({ staged: true }) };
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockResolvedValue({ id: 'edit', content: '', finishReason: 'tool_calls',
      toolCalls: [{ id: 'e', name: 'edit', arguments: '{"path":"x","old_text":"a","new_text":"b"}' }] }) };
    const loop = new A9AgentLoop({ workspaceRoot: '/mock', provider, runner: {} as any, workspaceService: {} as any,
      permissionMode: PermissionMode.REVIEW, reviewStaging: staging as any,
      onAuditEvent: (event) => { if (event.type === 'tool_end') throw new Error('audit failed'); } });
    const result = await loop.runTurn('stage');
    expect(staging.stageEdit).toHaveBeenCalledTimes(1);
    expect(result.toolCallsExecuted).toBe(1);
    expect(result.auditIncomplete?.failedEvent).toBe('tool_end');
  });

  it.each(['tool_start', 'tool_end'])('approved operation still obeys the %s audit gate', async (failedEvent) => {
    const remove = jest.fn().mockResolvedValue({ deleted: true });
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockResolvedValue({ id: 'delete', content: '', finishReason: 'tool_calls',
      toolCalls: [{ id: 'd', name: 'delete', arguments: '{"path":"x","permanent":true}' }] }) };
    const loop = new A9AgentLoop({ workspaceRoot: '/mock', provider, runner: {} as any, workspaceService: { delete: remove } as any,
      onAuditEvent: (event) => { if (event.type === failedEvent) throw new Error('audit failed'); } });
    const pending = await loop.runTurn('delete');
    expect(pending.outcome).toBe('needs_approval');
    const result = await loop.resumeAfterApproval({ approvalId: pending.pendingApproval!.approvalId,
      bindingDigest: pending.pendingApproval!.bindingDigest, decision: 'approved' });
    expect(remove).toHaveBeenCalledTimes(failedEvent === 'tool_start' ? 0 : 1);
    expect(result.toolCallsExecuted).toBe(failedEvent === 'tool_start' ? 0 : 1);
    expect(result.auditIncomplete?.failedEvent).toBe(failedEvent);
  });

  it.each(['stop', 'length', 'content_filter', ''])('does not dispatch tools with incompatible finishReason %s', async (finishReason) => {
    const edit = jest.fn().mockResolvedValue({ replaced: true });
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockResolvedValue({ id: 'bad', content: '', finishReason,
      toolCalls: [{ id: 'edit', name: 'edit', arguments: '{"path":"x","old_text":"a","new_text":"b"}' }] }) };
    const result = await new A9AgentLoop({ workspaceRoot: '/mock', provider, workspaceService: { edit } as any, runner: {} as any }).runTurn('edit');
    expect(edit).not.toHaveBeenCalled();
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('failed');
  });
});
