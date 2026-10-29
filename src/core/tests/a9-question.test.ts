import {
  A9AgentLoop,
  A9ModelPort,
  A9WorkspacePort,
  A9RunnerPort,
  PermissionMode,
  TurnOutcome,
} from '../src';

function makeLoop(options: {
  provider: A9ModelPort;
  onQuestionPending?: (question: any) => void | Promise<void>;
  onEvent?: (event: any) => void;
  onAuditEvent?: (event: any) => void;
  permissionMode?: PermissionMode;
}) {
  const workspaceService: A9WorkspacePort = {
    list: jest.fn().mockResolvedValue({ entries: [] }), read: jest.fn().mockResolvedValue({ content: '' }),
    search: jest.fn().mockResolvedValue({ matches: [] }),
    write: jest.fn().mockResolvedValue({ written: true }), edit: jest.fn().mockResolvedValue({ replaced: true }),
    copy: jest.fn().mockResolvedValue({ copied: true }), move: jest.fn().mockResolvedValue({ moved: true }),
    delete: jest.fn().mockResolvedValue({ deleted: true }),
  };
  const runner: A9RunnerPort = { execute: jest.fn() };
  const loop = new A9AgentLoop({
    workspaceRoot: '/workspace',
    questionIdentity: { workspace: '/workspace', conversationId: 'conversation-1', taskId: 'task-1' },
    provider: options.provider,
    workspaceService,
    runner,
    permissionMode: options.permissionMode ?? PermissionMode.FULL_ACCESS,
    onQuestionPending: options.onQuestionPending,
    onEvent: options.onEvent,
    onAuditEvent: options.onAuditEvent,
  });
  return { loop, workspaceService };
}

function providerWith(sequence: Array<{ calls?: any[]; content?: string; finishReason?: string }>): A9ModelPort {
  let index = 0;
  return {
    sendStreamRequest: jest.fn(async () => {
      const step = sequence[index++];
      if (!step) throw new Error('unexpected model request');
      return {
        id: `response-${index}`,
        content: step.content || '',
        finishReason: step.finishReason || (step.calls ? 'tool_calls' : 'stop'),
        ...(step.calls ? { toolCalls: step.calls } : {}),
      };
    }),
  };
}

describe('A9-42 ask_user Core loop', () => {
  it('suspends as needs_input, persists before display, and never dispatches the rest of the batch', async () => {
    const events: any[] = [];
    const persisted: any[] = [];
    const provider = providerWith([
      { calls: [
        { id: 'question-call', name: 'ask_user', arguments: JSON.stringify({
          prompt: 'Which target should I use?', options: ['staging', 'production'],
        }) },
        { id: 'write-call', name: 'write', arguments: JSON.stringify({ path: 'unsafe.txt', content: 'must not run' }) },
      ] },
      { content: 'Using staging.' },
    ]);
    const { loop, workspaceService } = makeLoop({ provider, onQuestionPending: (question) => { persisted.push(question); },
      onEvent: (event) => events.push(event), permissionMode: PermissionMode.READ_ONLY });
    const suspended = await loop.runTurn('ask before acting');
    expect(suspended.outcome).toBe(TurnOutcome.NEEDS_INPUT);
    expect(suspended.pendingQuestion).toMatchObject({
      schemaVersion: 1, conversationId: 'conversation-1', taskId: 'task-1',
      prompt: 'Which target should I use?', options: ['staging', 'production'], revision: 1,
    });
    expect(persisted).toEqual([suspended.pendingQuestion]);
    expect(events.map((event) => event.type)).toContain('question_required');
    expect(workspaceService.write).not.toHaveBeenCalled();
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(1);
  });

  it('answer resumes with a re-planned model call and the answer is not an approval', async () => {
    const events: any[] = [];
    const provider = providerWith([
      { calls: [{ id: 'question-call', name: 'ask_user', arguments: JSON.stringify({ prompt: 'Name the file' }) }] },
      { calls: [{ id: 'write-call', name: 'write', arguments: JSON.stringify({ path: 'chosen.txt', content: 'ok' }) }] },
      { content: 'done' },
    ]);
    const { loop, workspaceService } = makeLoop({ provider, onEvent: (event) => events.push(event) });
    const suspended = await loop.runTurn('need a file name');
    const question = suspended.pendingQuestion!;
    const resumed = await loop.resumeAfterQuestion({
      conversationId: 'conversation-1', questionId: question.questionId, revision: question.revision,
      decision: 'answered', answer: 'chosen.txt',
    });
    expect(resumed.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(3);
    expect(events.find((event) => event.type === 'tool_end' && event.data.answered)).toBeDefined();
    expect(workspaceService.write).toHaveBeenCalledWith('chosen.txt', 'ok', {
      turnId: resumed.turnId, encoding: 'utf-8',
    });
  });

  it('cancelled ends the turn without executing remaining same-batch calls', async () => {
    const provider = providerWith([
      { calls: [
        { id: 'question-call', name: 'ask_user', arguments: JSON.stringify({ prompt: 'Continue?' }) },
        { id: 'write-call', name: 'write', arguments: JSON.stringify({ path: 'must-not.txt', content: 'no' }) },
      ] },
    ]);
    const { loop, workspaceService } = makeLoop({ provider });
    const suspended = await loop.runTurn('ask');
    const question = suspended.pendingQuestion!;
    const cancelled = await loop.resumeAfterQuestion({
      conversationId: 'conversation-1', questionId: question.questionId, revision: question.revision,
      decision: 'cancelled',
    });
    expect(cancelled.outcome).toBe(TurnOutcome.CANCELLED);
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(1);
    expect(workspaceService.write).not.toHaveBeenCalled();
  });

  it('rejects stale/duplicate replies and audit failure before display', async () => {
    const provider = providerWith([
      { calls: [{ id: 'question-call', name: 'ask_user', arguments: JSON.stringify({ prompt: 'Pick' }) }] },
      { content: 'done' },
    ]);
    const { loop } = makeLoop({ provider });
    const suspended = await loop.runTurn('ask');
    const question = suspended.pendingQuestion!;
    await expect(loop.resumeAfterQuestion({
      conversationId: 'conversation-1', questionId: question.questionId, revision: question.revision + 1,
      decision: 'answered', answer: 'x',
    })).rejects.toMatchObject({ code: 'APPROVAL_INVALID' });
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(1);
    const { loop: auditFailure } = makeLoop({
      provider: providerWith([
        { calls: [{ id: 'question-call', name: 'ask_user', arguments: JSON.stringify({ prompt: 'Pick' }) }] },
      ]),
      onAuditEvent: (event) => {
        if (event.type === 'question_required') throw new Error('audit failed');
      },
    });
    const failed = await auditFailure.runTurn('ask');
    expect(failed.outcome).toBe(TurnOutcome.FAILED);
    expect(failed.auditIncomplete?.failedEvent).toBe('question_required');
  });

  it.each([
    ['prompt', { prompt: 'x'.repeat(2001) }],
    ['options', { prompt: 'ok', options: Array.from({ length: 7 }, () => 'o') }],
    ['option', { prompt: 'ok', options: ['x'.repeat(201)] }],
    ['blank option', { prompt: 'ok', options: [''] }],
  ])('rejects invalid %s before suspending', async (_label, args) => {
    const provider = providerWith([{ calls: [{ id: 'question-call', name: 'ask_user', arguments: JSON.stringify(args) }] }]);
    const { loop } = makeLoop({ provider });
    const result = await loop.runTurn('ask');
    expect(result.outcome).not.toBe(TurnOutcome.NEEDS_INPUT);
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(2);
  });
});
