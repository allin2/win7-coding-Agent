import {
  GitAdapter,
  GitAdapterErrorCode,
  GitRunnerPort,
  GitRunnerRequest,
  GitRunnerResult,
  GitSessionGuard,
} from '../src';

class ScriptedRunner implements GitRunnerPort {
  requests: GitRunnerRequest[] = [];
  private index = 0;

  constructor(private readonly outputs: string[]) {}

  async execute(request: GitRunnerRequest): Promise<GitRunnerResult> {
    this.requests.push(request);
    const text = this.outputs[this.index++] ?? '';
    return {
      schemaVersion: '2.0',
      status: 'exited',
      exitCode: 0,
      stdout: {
        text,
        bytesRead: Buffer.byteLength(text),
        bytesRetained: Buffer.byteLength(text),
        omittedBytes: 0,
        truncated: false,
        encoding: 'utf-8',
        replacementCount: 0,
      },
      stderr: {
        text: '', bytesRead: 0, bytesRetained: 0, omittedBytes: 0,
        truncated: false, encoding: 'utf-8', replacementCount: 0,
      },
      durationMs: 1,
      termination: { requested: false, processTreeReaped: true, containment: 'none' },
    };
  }
}

const HEAD = 'a'.repeat(40);

describe('GitSessionGuard', () => {
  it('captures a baseline only from a clean worktree', async () => {
    const runner = new ScriptedRunner(['', `${HEAD}\n`]);
    const baseline = await new GitSessionGuard(new GitAdapter({ runner }))
      .begin('session-1', 'C:\\repo');
    expect(baseline).toEqual({
      schemaVersion: '1.0', sessionId: 'session-1', workDir: 'C:\\repo', head: HEAD,
    });
    expect(runner.requests.map((request) => request.approvalLevel)).toEqual(['read_only', 'read_only']);
  });

  it('refuses to hide a pre-existing dirty worktree', async () => {
    const guard = new GitSessionGuard(new GitAdapter({
      runner: new ScriptedRunner([' M user-file.txt\0']),
    }));
    await expect(guard.begin('session-1', 'C:\\repo')).rejects.toMatchObject({
      code: GitAdapterErrorCode.WORKTREE_DIRTY,
    });
  });

  it('renders a session diff and reports untracked files', async () => {
    const guard = new GitSessionGuard(new GitAdapter({
      runner: new ScriptedRunner([' M src/a.ts\0?? generated.txt\0', 'diff --git a/src/a.ts b/src/a.ts']),
    }));
    const inspection = await guard.inspect({
      schemaVersion: '1.0', sessionId: 'session-1', workDir: 'C:\\repo', head: HEAD,
    });
    expect(inspection).toMatchObject({
      clean: false,
      untrackedPaths: ['generated.txt'],
      diffBinary: expect.stringContaining('diff --git'),
    });
  });

  it('requires exact approval for tracked rollback and never deletes untracked files', async () => {
    const runner = new ScriptedRunner([
      '',
      '?? generated.txt\0',
      '',
    ]);
    const guard = new GitSessionGuard(new GitAdapter({ runner }));
    const baseline = {
      schemaVersion: '1.0' as const, sessionId: 'session-1', workDir: 'C:\\repo', head: HEAD,
    };
    await expect(guard.rollbackTracked(baseline, {
      approvalId: 'approval-1',
      sessionId: 'session-1',
      subject: 'git.session.rollback',
      previewSha256: 'b'.repeat(64),
      baselineSha256: 'c'.repeat(64),
    })).resolves.toMatchObject({
      restoredTrackedFiles: true,
      complete: false,
      inspection: { untrackedPaths: ['generated.txt'] },
    });
    expect(runner.requests[0]).toMatchObject({
      approvalLevel: 'workspace_write',
      approval: { subject: 'git.session.rollback' },
    });
    expect(runner.requests.every((request) => !request.args.includes('clean'))).toBe(true);
  });
});
