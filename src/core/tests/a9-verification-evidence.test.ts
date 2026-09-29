import {
  A9AgentLoop, A9ExternalChangePort, A9ModelPort, A9RunnerPort, A9WorkspacePort,
  PermissionMode,
} from '../src';

type Step = { tool: 'edit' | 'shell'; command?: string };

async function runSequence(steps: Step[], externalReports: Array<{ path: string; kind: 'created' | 'modified'; recoverable: boolean }[]> = []) {
  let request = 0;
  let collection = 0;
  const provider: A9ModelPort = {
    sendStreamRequest: jest.fn().mockImplementation(async () => {
      const next = steps[request++];
      if (!next) return { id: 'final', content: 'Done', finishReason: 'stop' };
      return {
        id: `response-${request}`, content: '', finishReason: 'tool_calls',
        toolCalls: [{ id: `call-${request}`, name: next.tool, arguments: JSON.stringify(next.tool === 'edit'
          ? { path: 'calc.ts', old_text: 'old', new_text: 'new' }
          : { command: next.command }) }],
      };
    }),
  };
  const workspace: A9WorkspacePort = {
    list: jest.fn().mockResolvedValue({ entries: [] }), read: jest.fn().mockResolvedValue({ content: 'old' }),
    search: jest.fn().mockResolvedValue({ matches: [] }), write: jest.fn().mockResolvedValue({ created: true }),
    edit: jest.fn().mockResolvedValue({ replaced: true }), copy: jest.fn().mockResolvedValue({ copied: true }),
    move: jest.fn().mockResolvedValue({ moved: true }), delete: jest.fn().mockResolvedValue({ deleted: true }),
  };
  const runner: A9RunnerPort = { execute: jest.fn().mockResolvedValue({
    status: 'exited', exitCode: 0, stdout: 'ok', stderr: '', durationMs: 1, timedOut: false,
  }) };
  const externalChangePort: A9ExternalChangePort = {
    freezeTurnBaseline: jest.fn().mockResolvedValue({}),
    collectExternalChanges: jest.fn().mockImplementation(async () => ({
      changes: externalReports[collection++] || [], unrecoverable: [],
    })),
  };
  const loop = new A9AgentLoop({ workspaceRoot: '/mock/workspace', provider, workspaceService: workspace,
    runner, externalChangePort, permissionMode: PermissionMode.FULL_ACCESS });
  return loop.runTurn('Fix calc.ts');
}

describe('A9-26 verification hypotheses before repair', () => {
  it.failing('R1-01 H1 edit → Write-Output is unverified', async () => {
    const result = await runSequence([{ tool: 'edit' }, { tool: 'shell', command: "Write-Output 'smoke-verified'" }]);
    expect(result.verification).toBe('unverified');
  });

  it.failing.each(['git status', 'git diff', 'git log', 'node -v', 'npm -v', 'python --version'])(
    'R1-01 H2 edit → %s is unverified', async (command) => {
      const result = await runSequence([{ tool: 'edit' }, { tool: 'shell', command }]);
      expect(result.verification).toBe('unverified');
    },
  );

  it.failing('R1-01 H3 edit → npm test → type x remains verified with the same baseline change', async () => {
    const same = [{ path: 'calc.ts', kind: 'modified' as const, recoverable: true }];
    const result = await runSequence([
      { tool: 'edit' }, { tool: 'shell', command: 'npm test' }, { tool: 'shell', command: 'type calc.ts' },
    ], [same, same]);
    expect(result.verification).toBe('verified');
  });

  it('R1-01 H4 未复现 shell generates a file → npm test remains verified', async () => {
    const result = await runSequence([
      { tool: 'shell', command: 'node gen.js' }, { tool: 'shell', command: 'npm test' },
    ], [
      [{ path: 'generated.js', kind: 'created', recoverable: true }],
      [{ path: 'generated.js', kind: 'created', recoverable: true }],
    ]);
    expect(result.verification).toBe('verified');
  });
});
