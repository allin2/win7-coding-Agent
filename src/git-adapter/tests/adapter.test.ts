import {
  GitAdapter,
  GitAdapterErrorCode,
  GitRunnerPort,
  GitRunnerRequest,
} from '../src';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

class RecordingRunner implements GitRunnerPort {
  requests: GitRunnerRequest[] = [];
  error?: Error;

  async execute(request: GitRunnerRequest) {
    this.requests.push(request);
    if (this.error) throw this.error;
    return {
      schemaVersion: '2.0' as const,
      status: 'exited' as const,
      exitCode: 0,
      stdout: { text: 'ok', bytesRead: 2, bytesRetained: 2, omittedBytes: 0, truncated: false, encoding: 'utf-8' as const, replacementCount: 0 },
      stderr: { text: '', bytesRead: 0, bytesRetained: 0, omittedBytes: 0, truncated: false, encoding: 'utf-8' as const, replacementCount: 0 },
      durationMs: 7,
      termination: { requested: false, processTreeReaped: true, containment: 'none' as const },
    };
  }
}

describe('GitAdapter Runner boundary', () => {
  it('fails closed when no Runner is injected', async () => {
    const adapter = new GitAdapter();
    await expect(adapter.execute({
      command: 'status',
      args: ['--porcelain'],
      workDir: 'C:\\repo',
    })).rejects.toMatchObject({
      code: GitAdapterErrorCode.RUNNER_UNAVAILABLE,
    });
  });

  it('routes a read command through the Runner with isolated global arguments', async () => {
    const runner = new RecordingRunner();
    const adapter = new GitAdapter({
      runner,
      gitBinary: 'C:\\app\\mingit\\git.exe',
      defaultTimeout: 1234,
      maxOutput: 2048,
    });

    const result = await adapter.execute({
      command: 'status',
      args: ['--porcelain', '路径 with space;literal'],
      workDir: 'C:\\repo',
    });

    expect(result).toMatchObject({
      exitCode: 0,
      command: 'status',
      durationMs: 7,
    });
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]).toMatchObject({
      command: 'C:\\app\\mingit\\git.exe',
      approvalLevel: 'read_only',
      config: {
        timeoutMs: 1234,
        idleTimeoutMs: 1234,
        maxStdoutBytes: 2048,
        maxStderrBytes: 2048,
        workDir: 'C:\\repo',
        stdinPolicy: 'closed',
      },
    });
    expect(runner.requests[0].args).toContain('status');
    expect(runner.requests[0].args).toContain('路径 with space;literal');
    expect(runner.requests[0].args.indexOf('-c'))
      .toBeLessThan(runner.requests[0].args.indexOf('status'));
  });

  it('requires exact approval binding for write commands', async () => {
    const adapter = new GitAdapter({ runner: new RecordingRunner() });
    await expect(adapter.execute({
      command: 'add',
      args: ['src/a.ts'],
      workDir: 'C:\\repo',
    })).rejects.toMatchObject({
      code: GitAdapterErrorCode.APPROVAL_REQUIRED,
    });
  });

  it('passes write approval to the Runner for final revalidation', async () => {
    const runner = new RecordingRunner();
    const adapter = new GitAdapter({ runner });
    const approval = {
      approvalId: 'apr-1',
      sessionId: 'session-1',
      subject: 'git.add',
      previewSha256: 'a'.repeat(64),
      baselineSha256: 'b'.repeat(64),
    };

    await adapter.execute({
      command: 'add',
      args: ['src/a.ts'],
      workDir: 'C:\\repo',
      approval,
    });

    expect(runner.requests[0]).toMatchObject({
      approvalLevel: 'workspace_write',
      approval,
    });
  });

  it('exposes the exact prepared Runner request for approval hashing', () => {
    const adapter = new GitAdapter({ runner: new RecordingRunner() });
    const prepared = adapter.prepare({
      command: 'add',
      args: ['src/a.ts'],
      workDir: 'C:\\repo',
    });

    expect(prepared).toMatchObject({
      command: 'git',
      approvalLevel: 'workspace_write',
      config: { workDir: 'C:\\repo' },
    });
    expect(prepared.args.indexOf('-c')).toBeLessThan(prepared.args.indexOf('add'));
  });

  it('does not permit disabling the Git isolation profile', () => {
    expect(() => new GitAdapter({
      runner: new RecordingRunner(),
      isolation: false,
    })).toThrow('Git isolation cannot be disabled');
  });

  it('fails closed when repository-local attributes select filter or textconv commands', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-adapter-attributes-'));
    fs.writeFileSync(path.join(root, '.gitattributes'), '*.txt filter=unsafe\n', 'utf8');
    try {
      expect(() => new GitAdapter().prepare({
        command: 'status', args: [], workDir: root,
      })).toThrow(/attributes contain filter\/diff/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['branch', ['-D', 'feature']],
    ['branch', ['release']],
    ['tag', ['-d', 'v1.0']],
    ['tag', ['v1.0']],
  ])('classifies %s %o as workspace-write', (command, args) => {
    const prepared = new GitAdapter({ runner: new RecordingRunner() }).prepare({
      command,
      args,
      workDir: 'C:\\repo',
    });
    expect(prepared.approvalLevel).toBe('workspace_write');
  });

  it('keeps unambiguous branch listing read-only', () => {
    const prepared = new GitAdapter({ runner: new RecordingRunner() }).prepare({
      command: 'branch', args: ['--list'], workDir: 'C:\\repo',
    });
    expect(prepared.approvalLevel).toBe('read_only');
  });

  it('propagates Runner fail-closed errors', async () => {
    const runner = new RecordingRunner();
    runner.error = new Error('CONTAINMENT_UNAVAILABLE');
    const adapter = new GitAdapter({ runner });

    await expect(adapter.execute({
      command: 'status',
      args: [],
      workDir: 'C:\\repo',
    })).rejects.toThrow('CONTAINMENT_UNAVAILABLE');
  });
});
