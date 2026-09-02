import {
  A9AgentLoop,
  A9ModelPort,
  A9WorkspacePort,
  A9RunnerPort,
  PermissionMode,
  TurnOutcome,
} from '../src';

describe('A9-05: A9AgentLoop and Coding Workflow', () => {
  it('passes explicit read encoding and the original cancellation signal without defaulting auto-detection', async () => {
    const controller = new AbortController();
    let round = 0;
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        round += 1;
        if (round <= 2) return {
          id: `r${round}`, content: '', finishReason: 'tool_calls',
          toolCalls: [{ id: `c${round}`, name: 'read', arguments: JSON.stringify({
            path: '中文.txt', ...(round === 1 ? { encoding: 'gbk' } : {}), start_line: 2, max_lines: 1,
          }) }],
        };
        return { id: 'done', content: 'Read complete', finishReason: 'stop' };
      }),
    };
    const loop = new A9AgentLoop({ workspaceRoot: '/test/workspace', provider,
      workspaceService: mockWorkspace, runner: mockRunner, permissionMode: PermissionMode.READ_ONLY });
    await loop.runTurn('read', { signal: controller.signal });
    expect(mockWorkspace.read).toHaveBeenNthCalledWith(1, '中文.txt', {
      startLine: 2, maxLines: 1, encoding: 'gbk', signal: controller.signal,
    });
    expect(mockWorkspace.read).toHaveBeenNthCalledWith(2, '中文.txt', {
      startLine: 2, maxLines: 1, encoding: undefined, signal: controller.signal,
    });
  });
  let mockWorkspace: A9WorkspacePort;
  let mockRunner: A9RunnerPort;

  beforeEach(() => {
    mockWorkspace = {
      list: jest.fn().mockResolvedValue({ totalEntries: 1, entries: [{ name: 'calc.ts', type: 'file' }] }),
      read: jest.fn().mockResolvedValue({ content: '1: export function add(a, b) { return a - b; }' }),
      search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
      write: jest.fn().mockResolvedValue({ bytesWritten: 50, created: true }),
      edit: jest.fn().mockResolvedValue({ replaced: true }),
      copy: jest.fn().mockResolvedValue({ copied: true }),
      move: jest.fn().mockResolvedValue({ moved: true }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };

    mockRunner = {
      execute: jest.fn().mockResolvedValue({ exitCode: 0, stdout: 'PASS all tests', stderr: '', durationMs: 120, timedOut: false }),
    };
  });

  it('runs complete coding agent loop: read -> edit -> test -> complete', async () => {
    let callCount = 0;
    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async (_req, onChunk) => {
        callCount++;
        if (callCount === 1) {
          // Step 1: Read file
          return {
            id: 'res-1',
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'tc-1', name: 'read', arguments: JSON.stringify({ path: 'calc.ts' }) }],
          };
        } else if (callCount === 2) {
          // Step 2: Edit file
          return {
            id: 'res-2',
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'tc-2', name: 'edit', arguments: JSON.stringify({ path: 'calc.ts', old_text: 'return a - b;', new_text: 'return a + b;' }) }],
          };
        } else if (callCount === 3) {
          // Step 3: Run test command via shell
          return {
            id: 'res-3',
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'tc-3', name: 'shell', arguments: JSON.stringify({ command: 'npm test' }) }],
          };
        } else {
          // Step 4: Final summary
          onChunk({ content: 'Bug fixed and verified by test.', index: 0 });
          return {
            id: 'res-4',
            content: 'Bug fixed and verified by test.',
            finishReason: 'stop',
          };
        }
      }),
    };

    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });

    const result = await loop.runTurn('Fix bug in calc.ts');
    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.totalSteps).toBe(4);
    expect(result.toolCallsExecuted).toBe(3);
    expect(mockWorkspace.read).toHaveBeenCalledWith('calc.ts', expect.anything());
    expect(mockWorkspace.edit).toHaveBeenCalledWith('calc.ts', 'return a - b;', 'return a + b;', expect.anything());
    expect(mockRunner.execute).toHaveBeenCalledWith('npm test', expect.anything());
  });

  it('emits a versioned bounded Shell result DTO for Renderer and audit consumers', async () => {
    const events: any[] = [];
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn()
        .mockResolvedValueOnce({
          id: 'shell-1', content: '', finishReason: 'tool_calls',
          toolCalls: [{ id: 'shell-call', name: 'shell', arguments: '{"command":"npm test"}' }],
        })
        .mockResolvedValueOnce({ id: 'done', content: 'done', finishReason: 'stop' }),
    };
    mockRunner.execute = jest.fn().mockResolvedValue({
      status: 'exited', exitCode: 7, stdout: '中文 stdout', stderr: '失败 stderr',
      durationMs: 42, timedOut: false, truncated: true,
      rawStdoutBytes: 99, rawStderrBytes: 88,
      logPaths: { stdout: 'stdout.log', stderr: 'stderr.log' },
    });
    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace', provider, workspaceService: mockWorkspace,
      runner: mockRunner, permissionMode: PermissionMode.FULL_ACCESS,
      onEvent: (event) => events.push(event),
    });

    await loop.runTurn('run tests');

    const toolEnd = events.find((event) => event.type === 'tool_end' && event.data.toolName === 'shell');
    expect(toolEnd.data).toMatchObject({
      schemaVersion: 1,
      shell: {
        schemaVersion: 1, status: 'exited', exitCode: 7,
        stdout: '中文 stdout', stderr: '失败 stderr', durationMs: 42,
        timedOut: false, truncated: true, rawStdoutBytes: 99, rawStderrBytes: 88,
        logPaths: { stdout: 'stdout.log', stderr: 'stderr.log' },
      },
    });
  });

  it('detects 3-turn no-progress loop and halts with STUCK outcome', async () => {
    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn().mockResolvedValue({
        id: 'stuck-res',
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'tc-dup', name: 'search', arguments: JSON.stringify({ pattern: 'infinite' }) }],
      }),
    };

    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
    });

    const result = await loop.runTurn('Infinite loop test');
    expect(result.outcome).toBe(TurnOutcome.STUCK);
    expect(result.finalMessage).toContain('repeated 3 times');
  });

  it('intercepts high-impact git push and requests approval', async () => {
    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn().mockResolvedValue({
        id: 'push-res',
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'tc-push', name: 'shell', arguments: JSON.stringify({ command: 'git push origin main' }) }],
      }),
    };

    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });

    const result = await loop.runTurn('Push changes to remote');
    expect(result.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(result.pendingApproval?.toolName).toBe('shell');
    expect(result.pendingApproval?.args).toEqual(expect.objectContaining({ command: 'git push origin main' }));
  });

  it('requires a fresh one-shot approval when the same absolute git push is requested in a new Turn', async () => {
    const command = 'cmd.exe /d /s /c "if exist alpha.txt (C:\\acceptance\\mvp_mingit\\cmd\\git.exe push origin HEAD:refs/heads/w18-cmd-if)"';
    const toolResponse = {
      id: 'push-res',
      content: '',
      finishReason: 'tool_calls',
      toolCalls: [{ id: 'tc-push', name: 'shell', arguments: JSON.stringify({ command }) }],
    };
    const finalResponse = { id: 'done', content: 'done', finishReason: 'stop' };
    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn()
        .mockResolvedValueOnce(toolResponse)
        .mockResolvedValueOnce(finalResponse)
        .mockResolvedValueOnce(toolResponse)
        .mockResolvedValueOnce(finalResponse),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });

    const first = await loop.runTurn('first push');
    expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(mockRunner.execute).not.toHaveBeenCalled();
    await loop.resumeAfterApproval({
      approvalId: first.pendingApproval!.approvalId,
      decision: 'approved',
      bindingDigest: first.pendingApproval!.bindingDigest,
    });
    expect(mockRunner.execute).toHaveBeenCalledTimes(1);

    const second = await loop.runTurn('same push in a new turn');
    expect(second.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(second.turnId).not.toBe(first.turnId);
    expect(second.pendingApproval!.approvalId).not.toBe(first.pendingApproval!.approvalId);
    expect(mockRunner.execute).toHaveBeenCalledTimes(1);

    await expect(loop.resumeAfterApproval({
      approvalId: first.pendingApproval!.approvalId,
      decision: 'approved',
      bindingDigest: first.pendingApproval!.bindingDigest,
    })).rejects.toMatchObject({ code: 'APPROVAL_INVALID' });
    expect(mockRunner.execute).toHaveBeenCalledTimes(1);

    await loop.resumeAfterApproval({
      approvalId: second.pendingApproval!.approvalId,
      decision: 'approved',
      bindingDigest: second.pendingApproval!.bindingDigest,
    });
    expect(mockRunner.execute).toHaveBeenCalledTimes(2);
  });

  it('handles user cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn(),
    };

    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
    });

    const result = await loop.runTurn('Cancelled task', { signal: controller.signal });
    expect(result.outcome).toBe(TurnOutcome.CANCELLED);
  });
});
