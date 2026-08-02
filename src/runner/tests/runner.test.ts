import {
  ApprovalLedger,
  buildRunApprovalRequest,
  captureText,
  findProhibitedShellHost,
  MockRunner,
  RunRequest,
  RunnerErrorCode,
  UnavailableRunner,
} from '../src';

const defaultConfig = {
  timeoutMs: 5_000,
  idleTimeoutMs: 1_000,
  maxStdoutBytes: 1_024,
  maxStderrBytes: 1_024,
  workDir: '/tmp/test',
  stdinPolicy: 'closed' as const,
};

function readRequest(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    command: 'git',
    args: ['status', '--porcelain'],
    config: defaultConfig,
    approvalLevel: 'read_only',
    ...overrides,
  };
}

describe('Runner V2 result contract', () => {
  it('returns an exited result with bounded streams', async () => {
    const runner = new MockRunner({ defaultStdout: 'hello', defaultStderr: 'warning', mockDurationMs: 0 });
    const result = await runner.execute(readRequest());

    expect(result).toMatchObject({ schemaVersion: '2.0', status: 'exited', exitCode: 0, durationMs: 0 });
    expect(result.stdout).toMatchObject({ text: 'hello', bytesRead: 5, truncated: false });
    expect(result.stderr).toMatchObject({ text: 'warning', bytesRead: 7, truncated: false });
    expect(result.termination.processTreeReaped).toBe(true);
  });

  it.each([
    ['timeout', 5_000],
    ['idle_timeout', 1_000],
    ['cancelled', 0],
    ['spawn_failed', 0],
    ['cleanup_failed', 0],
  ] as const)('returns structured %s without rejecting', async (status, expectedDuration) => {
    const result = await new MockRunner({ simulateStatus: status, mockDurationMs: 0 }).execute(readRequest());
    expect(result.status).toBe(status);
    expect(result.exitCode).toBeNull();
    expect(result.error?.message).toBeTruthy();
    expect(result.durationMs).toBe(expectedDuration);
  });

  it('keeps generic Shell hosts outside the structured argv Runner', async () => {
    const result = await new MockRunner({ mockDurationMs: 0 }).execute(readRequest({
      command: 'cmd.exe',
      args: ['/c', 'dir'],
    }));
    expect(result).toMatchObject({
      status: 'rejected',
      error: { code: RunnerErrorCode.SHELL_HOST_PROHIBITED },
    });
  });

  it('returns capability_unavailable before SPIKE_02 instead of spawning', async () => {
    const result = await new UnavailableRunner().execute(readRequest());
    expect(result).toMatchObject({
      status: 'capability_unavailable',
      exitCode: null,
      error: { code: RunnerErrorCode.CONTAINMENT_UNAVAILABLE },
    });
  });
});

describe('Runner request boundary', () => {
  it.each([
    ['relative cwd', { ...defaultConfig, workDir: 'relative/path' }],
    ['parent traversal', { ...defaultConfig, workDir: '/tmp/../escape' }],
    ['idle timeout larger than total', { ...defaultConfig, idleTimeoutMs: 6_000 }],
    ['interactive stdin', { ...defaultConfig, stdinPolicy: 'open' as 'closed' }],
  ])('rejects %s as a structured result', async (_label, config) => {
    const result = await new MockRunner({ mockDurationMs: 0 }).execute(readRequest({ config }));
    expect(result.status).toBe('rejected');
    expect(result.error?.code).toBe(RunnerErrorCode.INVALID_REQUEST);
  });

  it('accepts Windows absolute paths and metacharacters as argv data', async () => {
    const result = await new MockRunner({ mockDurationMs: 0 }).execute(readRequest({
      command: 'rg.exe',
      args: ['a|b;$(literal)', '中文 路径'],
      config: { ...defaultConfig, workDir: 'C:\\repo\\中文 路径' },
    }));
    expect(result.status).toBe('exited');
  });

  it('rejects malformed environment overlays', async () => {
    const result = await new MockRunner({ mockDurationMs: 0 }).execute(readRequest({
      config: { ...defaultConfig, envOverlay: { 'BAD=NAME': 'value' } },
    }));
    expect(result).toMatchObject({ status: 'rejected', error: { code: RunnerErrorCode.INVALID_REQUEST } });
  });

  it('rejects credentials passed through an Agent environment overlay', async () => {
    const result = await new MockRunner({ mockDurationMs: 0 }).execute(readRequest({
      config: { ...defaultConfig, envOverlay: { SERVICE_TOKEN: 'not-a-secret-channel' } },
    }));
    expect(result).toMatchObject({
      status: 'rejected',
      error: { code: RunnerErrorCode.SENSITIVE_ENVIRONMENT_REJECTED },
    });
  });

  it('detects prohibited shell host basenames without rejecting ordinary executables', () => {
    expect(findProhibitedShellHost('C:\\Windows\\System32\\cmd.exe')).toBe('cmd.exe');
    expect(findProhibitedShellHost('C:\\工具\\rg.exe')).toBeNull();
  });
});

describe('bounded output capture', () => {
  it('preserves head and tail, records omitted byte count, and exposes a notice', () => {
    const captured = captureText('HEAD-12345-MIDDLE-67890-TAIL', 10);
    expect(captured).toMatchObject({ bytesRead: 28, bytesRetained: 10, omittedBytes: 18, truncated: true });
    expect(captured.text).toContain('HEAD-');
    expect(captured.text).toContain('-TAIL');
    expect(captured.text).toContain('18 bytes omitted');
  });

  it('counts UTF-8 bytes rather than JavaScript characters', () => {
    const captured = captureText('中文', 6);
    expect(captured).toMatchObject({ bytesRead: 6, bytesRetained: 6, truncated: false, text: '中文' });
  });

  it('applies independent stdout and stderr caps in MockRunner', async () => {
    const result = await new MockRunner({
      defaultStdout: '1234567890',
      defaultStderr: 'abcdefghij',
      mockDurationMs: 0,
    }).execute(readRequest({
      config: { ...defaultConfig, maxStdoutBytes: 6, maxStderrBytes: 6 },
    }));
    expect(result.stdout).toMatchObject({ truncated: true, bytesRetained: 6 });
    expect(result.stderr).toMatchObject({ truncated: true, bytesRetained: 6 });
  });
});

describe('workspace-write approval binding', () => {
  const previewSha256 = 'a'.repeat(64);
  const baselineSha256 = 'b'.repeat(64);

  function writeRequest(): RunRequest {
    return readRequest({
      command: 'git.exe',
      args: ['add', 'src/file.ts'],
      approvalLevel: 'workspace_write',
      config: { ...defaultConfig, workDir: 'C:\\repo', envOverlay: { GIT_CONFIG_NOSYSTEM: '1' } },
    });
  }

  it('returns APPROVAL_REQUIRED rather than throwing without a ledger', async () => {
    const result = await new MockRunner({ mockDurationMs: 0 }).execute(writeRequest());
    expect(result).toMatchObject({ status: 'rejected', error: { code: RunnerErrorCode.APPROVAL_REQUIRED } });
  });

  it('consumes exact approval and returns replay as a structured rejection', async () => {
    const ledger = new ApprovalLedger();
    const request = writeRequest();
    const record = ledger.issue({
      sessionId: 'session-1', subject: 'git.add', request: buildRunApprovalRequest(request), previewSha256, baselineSha256,
    });
    request.approval = {
      approvalId: record.approvalId, sessionId: record.sessionId, subject: record.subject, previewSha256, baselineSha256,
    };
    const runner = new MockRunner({ mockDurationMs: 0, approvalLedger: ledger });

    expect((await runner.execute(request)).status).toBe('exited');
    expect(await runner.execute(request)).toMatchObject({
      status: 'rejected', error: { code: RunnerErrorCode.APPROVAL_REPLAYED },
    });
  });
});
