import {
  A9AgentLoop, A9ExternalChangePort, A9ModelPort, A9RunnerPort, A9WorkspacePort,
  PermissionMode,
} from '../src';
import {
  classifyShellCommandForVerification, DIRECT_VERIFICATION_COMMANDS, NEUTRAL_COMMANDS,
  NPX_VERIFICATION_COMMANDS, READ_ONLY_GIT_COMMANDS,
} from '../src/a9-verification-evidence';

type Step = { tool: 'read' | 'edit' | 'shell'; command?: string };

async function runSequence(
  steps: Step[],
  externalReports: Array<{ path: string; kind: 'created' | 'modified'; recoverable: boolean; newHash?: string }[]> = [],
  options: { exitCodes?: number[]; events?: any[]; redactText?: (value: string) => string } = {},
) {
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
          : next.tool === 'read' ? { path: 'calc.ts' } : { command: next.command }) }],
      };
    }),
  };
  const workspace: A9WorkspacePort = {
    list: jest.fn().mockResolvedValue({ entries: [] }), read: jest.fn().mockResolvedValue({ content: 'old' }),
    search: jest.fn().mockResolvedValue({ matches: [] }), write: jest.fn().mockResolvedValue({ created: true }),
    edit: jest.fn().mockResolvedValue({ replaced: true }), copy: jest.fn().mockResolvedValue({ copied: true }),
    move: jest.fn().mockResolvedValue({ moved: true }), delete: jest.fn().mockResolvedValue({ deleted: true }),
  };
  let execution = 0;
  const runner: A9RunnerPort = { execute: jest.fn().mockImplementation(async () => ({
    status: 'exited', exitCode: options.exitCodes?.[execution++] ?? 0, stdout: 'ok', stderr: '', durationMs: 1, timedOut: false,
  })) };
  const externalChangePort: A9ExternalChangePort = {
    freezeTurnBaseline: jest.fn().mockResolvedValue({}),
    collectExternalChanges: jest.fn().mockImplementation(async () => ({
      changes: externalReports[collection++] || [], unrecoverable: [],
    })),
  };
  const loop = new A9AgentLoop({ workspaceRoot: '/mock/workspace', provider, workspaceService: workspace,
    runner, externalChangePort, permissionMode: PermissionMode.FULL_ACCESS,
    ...(options.events ? { onEvent: (event) => options.events!.push(event) } : {}),
    ...(options.redactText ? { redactText: options.redactText } : {}),
  });
  return loop.runTurn('Fix calc.ts');
}

describe('A9-26 verification hypotheses before repair', () => {
  it('R1-01 H1 edit → Write-Output is unverified', async () => {
    const result = await runSequence([{ tool: 'edit' }, { tool: 'shell', command: "Write-Output 'smoke-verified'" }]);
    expect(result.verification).toBe('unverified');
  });

  it.each(['git status', 'git diff', 'git log', 'node -v', 'npm -v', 'python --version'])(
    'R1-01 H2 edit → %s is unverified', async (command) => {
      const result = await runSequence([{ tool: 'edit' }, { tool: 'shell', command }]);
      expect(result.verification).toBe('unverified');
    },
  );

  it('R1-01 H3 edit → npm test → type x remains verified with the same baseline change', async () => {
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

  it.each(NEUTRAL_COMMANDS)('R1-02 neutral table: %s', (command) => {
    expect(classifyShellCommandForVerification(command)).toBe('neutral');
  });
  it.each(READ_ONLY_GIT_COMMANDS)('R1-02 read-only git table: %s', (command) => {
    expect(classifyShellCommandForVerification(`git ${command}`)).toBe('neutral');
  });
  it.each(DIRECT_VERIFICATION_COMMANDS)('R1-02 verification table: %s', (command) => {
    expect(classifyShellCommandForVerification(command)).toBe('verify');
  });
  it.each(NPX_VERIFICATION_COMMANDS)('R1-02 npx verification table: %s', (command) => {
    expect(classifyShellCommandForVerification(`npx ${command}`)).toBe('verify');
  });

  it.each([
    ['npm test', 'verify'], ['npm run build', 'verify'], ['npm t', 'verify'],
    ['yarn test', 'verify'], ['yarn run lint', 'verify'], ['pnpm test', 'verify'], ['pnpm run check', 'verify'],
    ['dotnet build', 'verify'], ['dotnet test', 'verify'], ['cargo build', 'verify'], ['cargo test', 'verify'],
    ['cargo check', 'verify'], ['go build', 'verify'], ['go test', 'verify'], ['go vet', 'verify'],
    ['node gen.js', 'verify'], ['python test.py', 'verify'], ['py test.py', 'verify'],
    ['npm -v', 'neutral'], ['node --version', 'neutral'], ['python --help', 'neutral'],
    ['rm x', 'mutating'], ['npm install', 'mutating'], ['git add x', 'mutating'],
    ['echo ok | npm test', 'verify'], ['echo ok | rm x', 'mutating'],
  ] as const)('R1-02 classify %s as %s', (command, expected) => {
    expect(classifyShellCommandForVerification(command)).toBe(expected);
  });

  it('R1-03 verify after edit records redacted evidence, then a new shell change invalidates it', async () => {
    const events: any[] = [];
    const result = await runSequence([
      { tool: 'edit' }, { tool: 'shell', command: 'npm test' }, { tool: 'shell', command: 'rm file.txt' },
    ], [], { events });
    expect(result.verification).toBe('unverified');
    expect(events.find((event) => event.type === 'turn_completed').data.verificationEvidence).toBeUndefined();
    const verifiedEvents: any[] = [];
    const verified = await runSequence([{ tool: 'edit' }, { tool: 'shell', command: 'npm test' }], [], {
      events: verifiedEvents, redactText: () => 'npm ***',
    });
    expect(verified.verificationEvidence).toEqual({ command: 'npm ***', exitCode: 0 });
    expect(verifiedEvents.find((event) => event.type === 'turn_completed').data.verificationEvidence)
      .toEqual({ command: 'npm ***', exitCode: 0 });
  });

  it('R1-03 failed verification leaves a mutated turn unverified', async () => {
    const result = await runSequence([{ tool: 'edit' }, { tool: 'shell', command: 'npm test' }], [], { exitCodes: [1] });
    expect(result.verification).toBe('unverified');
    expect(result.verificationEvidence).toBeUndefined();
  });

  it('R1-03 a changed hash after verification invalidates it; a test-generated file is verified by that test', async () => {
    const changed = await runSequence([
      { tool: 'edit' }, { tool: 'shell', command: 'npm test' }, { tool: 'shell', command: 'type calc.ts' },
    ], [
      [{ path: 'calc.ts', kind: 'modified', recoverable: true, newHash: 'a' }],
      [{ path: 'calc.ts', kind: 'modified', recoverable: true, newHash: 'b' }],
    ]);
    expect(changed.verification).toBe('unverified');
    const generated = await runSequence([{ tool: 'edit' }, { tool: 'shell', command: 'npm test' }], [
      [{ path: 'report.txt', kind: 'created', recoverable: true, newHash: 'report-hash' }],
    ]);
    expect(generated.verification).toBe('verified');
  });

  it.each([
    'powershell -Command "Write-Output ok"', 'cmd /c "echo ok"',
  ])('R1-04 shell host neutral payload %s', (command) => {
    expect(classifyShellCommandForVerification(command)).toBe('neutral');
  });
  it.each([
    'powershell -Command "npm test"', 'cmd /c "npm test"',
  ])('R1-04 shell host verification payload %s', (command) => {
    expect(classifyShellCommandForVerification(command)).toBe('verify');
  });
  it('R1-04 opaque host payload is mutating', () => {
    expect(classifyShellCommandForVerification('powershell -Command')).toBe('mutating');
  });

  it('R1-05 W41 read → edit → Write-Output replay is unverified', async () => {
    const result = await runSequence([
      { tool: 'read' }, { tool: 'edit' }, { tool: 'shell', command: "Write-Output 'smoke-verified'" },
    ]);
    expect(result.verification).toBe('unverified');
  });

  it('A5-1 a mutating-class command without file changes has no observed side effect', async () => {
    const result = await runSequence([{ tool: 'shell', command: 'node -e "console.log(1)"' }]);
    expect(result.outcome).toBe('completed');
    expect(result.verification).toBe('not_applicable');
    expect(result.verificationEvidence).toBeUndefined();
  });

  it('A5-1 an observed external file change makes a mutating-class command unverified', async () => {
    const result = await runSequence([{ tool: 'shell', command: 'node -e "writeFile()"' }], [
      [{ path: 'generated.txt', kind: 'created', recoverable: true, newHash: 'new' }],
    ]);
    expect(result.outcome).toBe('completed_with_warnings');
    expect(result.verification).toBe('unverified');
    expect(result.verificationEvidence).toBeUndefined();
  });

  it('A5-1 Git worktree mutation remains a side effect without an external file report', async () => {
    const result = await runSequence([{ tool: 'shell', command: 'git add calc.ts' }]);
    expect(result.outcome).toBe('completed_with_warnings');
    expect(result.verification).toBe('unverified');
    expect(result.verificationEvidence).toBeUndefined();
  });
});
