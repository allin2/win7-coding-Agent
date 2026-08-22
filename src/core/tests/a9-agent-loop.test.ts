import {
  A9AgentLoop,
  A9ModelPort,
  A9WorkspacePort,
  A9RunnerPort,
  PermissionMode,
  TurnOutcome,
} from '../src';

describe('A9-05: A9AgentLoop and Coding Workflow', () => {
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
    expect(result.pendingApproval?.args).toEqual({ command: 'git push origin main' });
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
