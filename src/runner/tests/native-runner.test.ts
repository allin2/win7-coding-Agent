import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ApprovalLedger,
  buildRunApprovalRequest,
  ExecutableProfileRegistry,
  HelperTransport,
  HelperTransportResult,
  NativeHelperExecutionResult,
  NativeRunner,
  RunRequest,
  RunnerErrorCode,
  RunnerEvent,
} from '../src';

describe('NativeRunner production boundary', () => {
  let root: string;
  let executable: string;
  let executableSha256: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-runner-'));
    executable = path.join(root, 'trusted-tool.exe');
    fs.writeFileSync(executable, 'pinned executable fixture', 'utf8');
    executableSha256 = createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function request(overrides: Partial<RunRequest> = {}): RunRequest {
    return {
      requestId: 'request-1', command: 'trusted-tool', args: ['--version'], approvalLevel: 'read_only',
      config: {
        timeoutMs: 5_000, idleTimeoutMs: 1_000, maxStdoutBytes: 32,
        maxStderrBytes: 32, workDir: root, stdinPolicy: 'closed',
      },
      ...overrides,
    };
  }

  function response(overrides: Partial<NativeHelperExecutionResult> = {}): NativeHelperExecutionResult {
    return {
      schema_version: 1, type: 'execution_result', requestId: 'request-1', status: 'completed',
      exitCode: 0, executionTimeMs: 12, timedOut: false, idleTimedOut: false, canceled: false,
      outputTruncated: false, containmentVerified: true, inputDetached: true,
      hostJob: { detected: false, breakaway: 'none', limitFlags: 0, childJobAssignmentVerified: true },
      tokenAudit: { verified: true, isRestricted: true, tokenType: 'primary', restrictedSidSetVerified: true, integrityRid: 4096 },
      stdoutSize: 2, stderrSize: 0, stdoutBase64: Buffer.from('ok').toString('base64'), stderrBase64: '', aclChanges: [],
      ...overrides,
    };
  }

  function registry(options: { sha256?: string; risk?: 'low' | 'high'; encoding?: 'utf-8' | 'cp936' | 'auto' } = {}) {
    return new ExecutableProfileRegistry([{
      id: 'trusted-tool', executablePath: executable, sha256: options.sha256 || executableSha256,
      risk: options.risk || 'low', outputEncoding: options.encoding, workingDirectoryRoots: [root],
      validateArgs: (args) => args.length <= 2,
    }]);
  }

  function transport(value: HelperTransportResult): HelperTransport {
    return { invoke: jest.fn(async () => value) };
  }

  it('resolves a pinned profile and returns separately captured streams', async () => {
    const stderr = Buffer.from('warning');
    const runner = new NativeRunner({ registry: registry(), transport: transport({ kind: 'response', response: response({
      stderrSize: stderr.length, stderrBase64: stderr.toString('base64'),
    }) }) });
    await expect(runner.execute(request())).resolves.toMatchObject({
      status: 'exited', exitCode: 0, stdout: { text: 'ok' }, stderr: { text: 'warning' },
      termination: { processTreeReaped: true, containment: 'job_object' },
    });
  });

  it.each([
    ['total timeout', { timedOut: true }, 'timeout'],
    ['idle timeout', { idleTimedOut: true }, 'idle_timeout'],
    ['helper-confirmed cancellation', { canceled: true }, 'cancelled'],
  ] as const)('maps %s to the V2 result', async (_name, helperOverrides, expected) => {
    const runner = new NativeRunner({ registry: registry(), transport: transport({ kind: 'response', response: response(helperOverrides) }) });
    expect((await runner.execute(request())).status).toBe(expected);
  });

  it('reports spawn failure without throwing', async () => {
    const runner = new NativeRunner({ registry: registry(), transport: transport({ kind: 'spawn_failed', detail: 'ENOENT', cleanupConfirmed: true }) });
    await expect(runner.execute(request())).resolves.toMatchObject({ status: 'spawn_failed' });
  });

  it.each(['helper_crashed', 'watchdog_timeout', 'cancelled'] as const)('fails cleanup closed after %s without acknowledgement', async (kind) => {
    const runner = new NativeRunner({ registry: registry(), transport: transport({ kind, detail: 'no acknowledgement', cleanupConfirmed: false }) });
    await expect(runner.execute(request())).resolves.toMatchObject({ status: 'cleanup_failed', termination: { processTreeReaped: false } });
  });

  it('returns cancelled only after the helper closes its validated Job', async () => {
    const runner = new NativeRunner({ registry: registry(), transport: transport({
      kind: 'cancelled', detail: 'Job handle closed', cleanupConfirmed: true,
    }) });
    await expect(runner.execute(request())).resolves.toMatchObject({
      status: 'cancelled', termination: { requested: true, processTreeReaped: true, containment: 'job_object' },
    });
  });

  it('applies independent stream limits and emits read-only runner events', async () => {
    const bytes = Buffer.from('1234567890');
    const events: RunnerEvent[] = [];
    const runner = new NativeRunner({ registry: registry(), onEvent: (event) => events.push(event), transport: transport({ kind: 'response', response: response({
      stdoutSize: bytes.length, stderrSize: bytes.length,
      stdoutBase64: bytes.toString('base64'), stderrBase64: bytes.toString('base64'),
    }) }) });
    const run = request({ config: { ...request().config, maxStdoutBytes: 4, maxStderrBytes: 6 } });
    const result = await runner.execute(run);
    expect(result.stdout).toMatchObject({ truncated: true, bytesRetained: 4 });
    expect(result.stderr).toMatchObject({ truncated: true, bytesRetained: 6 });
    expect(events.map((event) => event.kind)).toEqual([
      'runner.started', 'runner.stdout', 'runner.stderr', 'runner.truncated', 'runner.truncated', 'runner.finished',
    ]);
  });

  it('decodes CP936 and preserves CRLF', async () => {
    const cp936 = Buffer.from([0xD6, 0xD0, 0xCE, 0xC4, 0x0D, 0x0A]);
    const runner = new NativeRunner({ registry: registry({ encoding: 'cp936' }), transport: transport({ kind: 'response', response: response({
      stdoutSize: cp936.length, stdoutBase64: cp936.toString('base64'),
    }) }) });
    expect((await runner.execute(request())).stdout).toMatchObject({ text: '中文\r\n', encoding: 'cp936' });
  });

  it('rejects unknown, high-risk, bad-hash and Shell profiles before transport', async () => {
    const invoke = jest.fn(async () => ({ kind: 'response', response: response() } as HelperTransportResult));
    const unknown = new NativeRunner({ registry: registry(), transport: { invoke } });
    expect((await unknown.execute(request({ command: 'missing' }))).error?.code).toBe(RunnerErrorCode.PROFILE_NOT_FOUND);
    const risky = new NativeRunner({ registry: registry({ risk: 'high' }), transport: { invoke } });
    expect((await risky.execute(request())).error?.code).toBe(RunnerErrorCode.PROFILE_RISK_REJECTED);
    const mismatch = new NativeRunner({ registry: registry({ sha256: '0'.repeat(64) }), transport: { invoke } });
    expect((await mismatch.execute(request())).error?.code).toBe(RunnerErrorCode.PROFILE_HASH_MISMATCH);
    expect((await unknown.execute(request({ command: 'cmd.exe' }))).error?.code).toBe(RunnerErrorCode.SHELL_HOST_PROHIBITED);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects malformed helper stream payloads and uncertain containment', async () => {
    const malformed = new NativeRunner({ registry: registry(), transport: transport({ kind: 'response', response: response({ stdoutSize: 99 }) }) });
    expect((await malformed.execute(request())).error?.code).toBe(RunnerErrorCode.HELPER_PROTOCOL_ERROR);
    const uncontained = new NativeRunner({ registry: registry(), transport: transport({ kind: 'response', response: response({ containmentVerified: false }) }) });
    expect((await uncontained.execute(request())).status).toBe('cleanup_failed');
    const inheritedWithoutBreakaway = new NativeRunner({ registry: registry(), transport: transport({ kind: 'response', response: response({
      hostJob: { detected: true, breakaway: 'none', limitFlags: 0, childJobAssignmentVerified: true },
    }) }) });
    expect((await inheritedWithoutBreakaway.execute(request())).status).toBe('cleanup_failed');
    const rollback = new NativeRunner({ registry: registry(), transport: transport({ kind: 'response', response: response({
      aclChanges: [{ applied: true, verified: true, rolledBack: false, error: 'rollback failed' }],
    }) }) });
    expect((await rollback.execute(request())).status).toBe('cleanup_failed');
  });

  it('does not consume workspace approval when profile integrity fails before execution', async () => {
    const ledger = new ApprovalLedger();
    const writeRequest = request({ approvalLevel: 'workspace_write' });
    const previewSha256 = 'a'.repeat(64);
    const baselineSha256 = 'b'.repeat(64);
    const record = ledger.issue({
      sessionId: 'session-1', subject: 'trusted-tool', request: buildRunApprovalRequest(writeRequest),
      previewSha256, baselineSha256,
    });
    writeRequest.approval = {
      approvalId: record.approvalId, sessionId: record.sessionId, subject: record.subject,
      previewSha256, baselineSha256,
    };
    const runner = new NativeRunner({
      registry: registry({ sha256: '0'.repeat(64) }), approvalLedger: ledger,
      transport: transport({ kind: 'response', response: response() }),
    });
    expect((await runner.execute(writeRequest)).error?.code).toBe(RunnerErrorCode.PROFILE_HASH_MISMATCH);
    expect(ledger.validateAndConsume(writeRequest.approval, buildRunApprovalRequest(writeRequest)).valid).toBe(true);
  });
});
