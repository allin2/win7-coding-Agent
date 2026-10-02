import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { createTrustedShellEnvironment } from '../src/trusted-shell-environment';
import { hasCompleteHelperCleanupProof, NativeHelperExecutionResult, NativeHelperRequest, NativeHelperRequestV2, parseNativeHelperResponse, StdioHelperTransport } from '../src';

jest.mock('child_process', () => ({ spawn: jest.fn() }));

class FakeChild extends EventEmitter {
  pid = 4321;
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = jest.fn(() => true);
}

test.each([false, true])('v2 helper receives only the sanitized environment (managed=%s)', async (managed) => {
  const child = new FakeChild();
  (spawn as unknown as jest.Mock).mockReturnValue(child);
  const secret = 'sentinel-helper-private-value';
  const environment = createTrustedShellEnvironment({
    BUILD_MODE: secret, NORMAL: 'release', NODE_DEBUG: 'http', SYSTEMROOT: 'C:\\Windows',
  }, {}, [secret]);
  const transport = new StdioHelperTransport('helper.exe');
  const invocation = managed ? transport.startManaged(requestV2(), environment) : undefined;
  const completion = invocation ? invocation.completion : transport.invoke({ ...requestV2(), managed }, undefined, environment);
  expect((spawn as unknown as jest.Mock).mock.calls.slice(-1)[0][2].env).toEqual({
    NORMAL: 'release', SYSTEMROOT: 'C:\\Windows',
  });
  child.stdout.write(JSON.stringify(startedV2()) + '\n');
  if (invocation) await invocation.ready;
  child.stdout.write(JSON.stringify(cancelledResponseV2()) + '\n');
  child.emit('close', 0);
  await completion;
});

test('managed invocation exposes the helper PID and uses the same bound cancel protocol', async () => {
  const child = new FakeChild();
  (spawn as unknown as jest.Mock).mockReturnValue(child);
  const managed = new StdioHelperTransport('helper.exe').startManaged(requestV2());
  expect(managed.pid).toBe(4321);
  child.stdout.write(`${JSON.stringify(startedV2())}\n`);
  await expect(managed.ready).resolves.toMatchObject({ childPid: 5331 });
  managed.cancel();
  await new Promise((resolve) => setImmediate(resolve));
  child.stdout.write(`${JSON.stringify(cancelledResponseV2())}\n`);
  child.emit('close', 0);
  await expect(managed.completion).resolves.toMatchObject({
    kind: 'response', response: { requestId: 'cancel-1', canceled: true, containmentVerified: true },
  });
});

test('deadlineMode=none keeps only the startup boundary and has no runtime watchdog', async () => {
  const child = new FakeChild();
  (spawn as unknown as jest.Mock).mockReturnValue(child);
  const request = { ...requestV2(), requestId: 'no-deadline', managed: false } as NativeHelperRequestV2;
  const started = { ...startedV2(), requestId: 'no-deadline' };
  const completed = { ...cancelledResponseV2(), requestId: 'no-deadline', canceled: false, exitCode: 0 };
  const pending = new StdioHelperTransport('helper.exe', undefined, 10).invoke(request);
  child.stdout.write(`${JSON.stringify(started)}\n`);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(child.kill).not.toHaveBeenCalled();
  child.stdout.write(`${JSON.stringify(completed)}\n`);
  child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'response', response: { requestId: 'no-deadline' } });
});

function requestV2(): NativeHelperRequestV2 {
  return {
    schemaVersion: 2, requestId: 'cancel-1', profileId: 'a9-trusted-shell-current-user-v1',
    executable: 'C:\\Windows\\System32\\cmd.exe', argv: ['/d', '/s', '/c', 'ping -t 127.0.0.1'],
    shellKind: 'cmd', shellPath: 'C:\\Windows\\System32\\cmd.exe', shellVersion: '6.1.7601',
    shellIdentity: 'a'.repeat(64), shellSource: 'automatic', command: 'ping -t 127.0.0.1',
    cwd: 'C:\\acceptance\\work', envOverlay: {}, maxStdoutBytes: 1024, maxStderrBytes: 1024,
    managed: true, deadlineMode: 'none',
  };
}

function startedV2(): any {
  return {
    schemaVersion: 2, type: 'execution_started', requestId: 'cancel-1',
    profileId: 'a9-trusted-shell-current-user-v1', helperPid: 4321, childPid: 5331,
    ready: { childJobAssignmentVerified: true, inputDetached: true, stdoutCaptureReady: true, stderrCaptureReady: true },
    tokenAudit: currentUserTokenProof(),
  };
}

function currentUserTokenProof(): any {
  return { source: 'suspended_child_process_token', verified: true, tokenMode: 'current_user',
    restrictedToken: false, tokenType: 'primary', sameUser: true, lowIntegrity: false,
    integritySid: 'S-1-16-8192', integrityRid: 8192 };
}

function cancelledResponseV2(): any {
  return {
    schemaVersion: 2, type: 'execution_result', requestId: 'cancel-1',
    profileId: 'a9-trusted-shell-current-user-v1', status: 'completed', exitCode: 1,
    executionTimeMs: 20, timedOut: false, idleTimedOut: false, canceled: true,
    outputTruncated: false, containmentVerified: true, inputDetached: true,
    cleanupConfirmed: true, workDirAclModified: false,
    hostJob: { detected: true, breakaway: 'silent', limitFlags: 0x3000, childJobAssignmentVerified: true },
    tokenAudit: currentUserTokenProof(), stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '',
  };
}

function request(): NativeHelperRequest {
  return {
    schema_version: 1, requestId: 'cancel-1', executable: 'C:\\Windows\\System32\\ping.exe', argv: ['-t', '127.0.0.1'],
    workingDirectory: 'C:\\acceptance\\work', timeoutMs: 20_000, idleTimeoutMs: 5_000,
    maxOutputSize: 1024, allowNetwork: false, allowedDirectories: [], protectedDirectories: [],
  };
}

function cancelledResponse(): NativeHelperExecutionResult {
  return {
    schema_version: 1, type: 'execution_result', requestId: 'cancel-1', status: 'completed', exitCode: 1,
    executionTimeMs: 20, timedOut: false, idleTimedOut: false, canceled: true, outputTruncated: false,
    containmentVerified: true, inputDetached: true,
    hostJob: { detected: true, breakaway: 'silent', limitFlags: 0x3000, childJobAssignmentVerified: true },
    tokenAudit: {
      source: 'suspended_child_process_token', verified: true, isRestricted: true, tokenType: 'primary',
      restrictedSidSetVerified: true, userRestrictedSid: true, worldRestrictedSid: true,
      administratorsRestrictedSid: false, restrictedSidCount: 2, integritySid: 'S-1-16-4096', integrityRid: 4096,
    },
    stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '',
    aclChanges: [{ path: 'C:\\acceptance\\work', mechanism: 'deny_ace', applied: true, verified: true, rolledBack: true, error: '' }],
  };
}

test('rejects helper exit codes outside the Windows DWORD domain', () => {
  expect(() => parseNativeHelperResponse(JSON.stringify({
    ...cancelledResponse(), exitCode: Number.MAX_SAFE_INTEGER + 1,
  }), 'cancel-1')).toThrow(/execution response fields are invalid/);
});

test('cooperative cancellation waits for helper acknowledgement and never kills a clean helper', async () => {
  const child = new FakeChild();
  (spawn as unknown as jest.Mock).mockReturnValue(child);
  const written: Buffer[] = [];
  child.stdin.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)));
  const controller = new AbortController();
  const pending = new StdioHelperTransport('helper.exe').invoke(request(), controller.signal);
  expect((spawn as unknown as jest.Mock).mock.calls.slice(-1)[0][2]).not.toHaveProperty('env');
  controller.abort();
  await new Promise((resolve) => setImmediate(resolve));
  child.stdout.write(`${JSON.stringify(cancelledResponse())}\n`);
  child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'response', response: { canceled: true } });
  expect(child.kill).not.toHaveBeenCalled();
  const controls = Buffer.concat(written).toString('utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
  expect(controls).toHaveLength(2);
  expect(controls[1]).toEqual({ schema_version: 1, type: 'cancel', requestId: 'cancel-1' });
});

test('cancellation without a helper acknowledgement remains cleanup_failed evidence', async () => {
  const child = new FakeChild();
  (spawn as unknown as jest.Mock).mockReturnValue(child);
  const controller = new AbortController();
  const pending = new StdioHelperTransport('helper.exe').invoke(request(), controller.signal);
  controller.abort();
  child.stdout.write(`${JSON.stringify({ ...cancelledResponse(), canceled: false })}\n`);
  child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'cancelled', cleanupConfirmed: false });
});

test.each([
  ['malformed response', '{not-json}\n'],
  ['multiple responses', `${JSON.stringify(cancelledResponse())}\n${JSON.stringify(cancelledResponse())}\n`],
])('helper exit zero with %s never proves cleanup', async (_label, output) => {
  const child = new FakeChild();
  (spawn as unknown as jest.Mock).mockReturnValue(child);
  const pending = new StdioHelperTransport('helper.exe').invoke(request());
  child.stdout.write(output);
  child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'helper_crashed', cleanupConfirmed: false });
});

test('truthy string containment fields are rejected instead of proving cleanup', async () => {
  const child = new FakeChild();
  (spawn as unknown as jest.Mock).mockReturnValue(child);
  const pending = new StdioHelperTransport('helper.exe').invoke(request());
  child.stdout.write(`${JSON.stringify({
    ...cancelledResponse(),
    containmentVerified: 'false',
    inputDetached: 'false',
  })}\n`);
  child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'helper_crashed', cleanupConfirmed: false });
});

test('a structurally valid but semantically contradictory token/job audit never proves cleanup', () => {
  const contradictory = {
    ...cancelledResponse(),
    hostJob: { detected: false, breakaway: 'silent', limitFlags: 0x3000, childJobAssignmentVerified: true },
    tokenAudit: {
      ...cancelledResponse().tokenAudit,
      userRestrictedSid: false,
      worldRestrictedSid: false,
      administratorsRestrictedSid: true,
      restrictedSidCount: 0,
      integritySid: 'S-1-16-8192',
    },
  };
  const parsed = parseNativeHelperResponse(JSON.stringify(contradictory), 'cancel-1');
  expect(parsed.type).toBe('execution_result');
  if (parsed.type === 'execution_result') expect(hasCompleteHelperCleanupProof(parsed)).toBe(false);
});

function requestV3(): import('../src/native-protocol').NativeHelperRequestV3 {
  return { ...requestV2(), schemaVersion: 3, profileId: 'a9-trusted-shell-current-user-v2', managed: false, outputEncoding: { stdout: 'utf-8', stderr: 'utf-8' } };
}
function startedV3() { return { ...startedV2(), schemaVersion: 3, profileId: 'a9-trusted-shell-current-user-v2' }; }
function chunkV3(seq = 1, stream = 'stdout', text = 'tick 1\n', offset = 0) {
  const bytes = Buffer.from(text);
  return { schemaVersion: 3, type: 'output_chunk', requestId: 'cancel-1', profileId: 'a9-trusted-shell-current-user-v2', seq, stream, streamOffset: offset, byteLength: bytes.length, dataBase64: bytes.toString('base64') };
}
function terminalV3(lastOutputSeq = 1, stdout = 7, stderr = 0, canceled = false) {
  const { stdoutSize, stderrSize, stdoutBase64, stderrBase64, ...rest } = cancelledResponseV2();
  return { ...rest, schemaVersion: 3, profileId: 'a9-trusted-shell-current-user-v2', canceled, lastOutputSeq,
    stdout: { rawBytesRead: stdout, emittedBytes: stdout, omittedBytes: 0 }, stderr: { rawBytesRead: stderr, emittedBytes: stderr, omittedBytes: 0 } };
}
function send(child: FakeChild, message: unknown) { child.stdout.write(JSON.stringify(message) + '\n'); }

test('v3 output is delivered before exit, preserves cross-stream sequence, awaits callbacks', async () => {
  const child = new FakeChild(); (spawn as unknown as jest.Mock).mockReturnValue(child);
  const output: unknown[] = [];
  const pending = new StdioHelperTransport('helper').invoke(requestV3(), undefined, undefined, async (chunk) => { await Promise.resolve(); output.push(chunk); });
  send(child, startedV3()); send(child, chunkV3());
  await new Promise((r) => setImmediate(r)); expect(output).toHaveLength(1);
  send(child, chunkV3(2, 'stderr', 'bad\n')); send(child, terminalV3(2, 7, 4)); child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'response', response: { lastOutputSeq: 2 } });
  expect(output).toHaveLength(2);
});
test.each([
  { requestId: 'wrong' }, { schemaVersion: 2 }, { profileId: 'wrong' }, { seq: 2 },
  { streamOffset: 2 }, { byteLength: 4 }, { dataBase64: 'invalid' }, { extra: true },
])('v3 rejects protocol corruption %j and requests bound cancellation', async (patch) => {
  const child = new FakeChild(); (spawn as unknown as jest.Mock).mockReturnValue(child);
  const controls: string[] = []; child.stdin.on('data', (b) => controls.push(b.toString()));
  const output = jest.fn(); const pending = new StdioHelperTransport('helper').invoke(requestV3(), undefined, undefined, output);
  send(child, startedV3()); send(child, { ...chunkV3(), ...patch }); child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'helper_crashed', cleanupConfirmed: false });
  expect(output).not.toHaveBeenCalled(); expect(controls.join('')).toContain('"type":"cancel"');
});
test.each(['before_start', 'duplicate', 'missing_terminal', 'after_terminal', 'wrong_counts'])('v3 rejects %s', async (mode) => {
  const child = new FakeChild(); (spawn as unknown as jest.Mock).mockReturnValue(child);
  const output = jest.fn(); const pending = new StdioHelperTransport('helper').invoke(requestV3(), undefined, undefined, output);
  if (mode !== 'before_start') send(child, startedV3());
  send(child, chunkV3());
  if (mode === 'duplicate') send(child, chunkV3());
  if (!['before_start', 'missing_terminal', 'duplicate'].includes(mode)) send(child, terminalV3(1, mode === 'wrong_counts' ? 8 : 7));
  if (mode === 'after_terminal') send(child, chunkV3(2, 'stdout', 'later', 7));
  child.emit('close', 0); await expect(pending).resolves.toMatchObject({ kind: 'helper_crashed' });
  if (mode === 'before_start') expect(output).not.toHaveBeenCalled();
});
test('v3 audit callback failure suppresses later dispatch and retains proven cleanup', async () => {
  const child = new FakeChild(); (spawn as unknown as jest.Mock).mockReturnValue(child);
  const callback = jest.fn().mockRejectedValue(new Error('private diagnostic'));
  const pending = new StdioHelperTransport('helper').invoke(requestV3(), undefined, undefined, callback);
  send(child, startedV3()); send(child, chunkV3()); await new Promise((r) => setImmediate(r));
  send(child, chunkV3(2, 'stdout', 'next\n', 7)); send(child, terminalV3(2, 12, 0, true)); child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'helper_crashed', detail: 'A9_OUTPUT_AUDIT_OR_CONSUMER_FAILED', cleanupConfirmed: true });
  expect(callback).toHaveBeenCalledTimes(1);
});
test('v3 slow consumer is bounded and cannot block cancel control', async () => {
  const child = new FakeChild(); (spawn as unknown as jest.Mock).mockReturnValue(child);
  const controls: string[] = []; child.stdin.on('data', (b) => controls.push(b.toString()));
  let unblock!: () => void;
  const blocked = new Promise<void>((r) => { unblock = r; });
  const pending = new StdioHelperTransport('helper').invoke({ ...requestV3(), maxStdoutBytes: 1024 * 1024 }, undefined, undefined, () => blocked);
  send(child, startedV3());
  for (let n = 1; n <= 20; n++) send(child, chunkV3(n, 'stdout', 'x'.repeat(16384), (n - 1) * 16384));
  expect(controls.join('')).toContain('"type":"cancel"'); unblock(); child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'helper_crashed', detail: 'A9_OUTPUT_BACKPRESSURE' });
});


test.each(['request_id', 'gap', 'base64', 'byte_count', 'stream_offset', 'version'])('v3 rejects malformed chunk %s without publishing it', async (mode) => {
  const child = new FakeChild(); (spawn as unknown as jest.Mock).mockReturnValue(child);
  const output = jest.fn();
  const pending = new StdioHelperTransport('helper').invoke(requestV3(), undefined, undefined, output);
  send(child, startedV3());
  const malformed: any = chunkV3();
  if (mode === 'request_id') malformed.requestId = 'other-request';
  if (mode === 'gap') malformed.seq = 2;
  if (mode === 'base64') malformed.dataBase64 = '%%%';
  if (mode === 'byte_count') malformed.byteLength++;
  if (mode === 'stream_offset') malformed.streamOffset = 1;
  if (mode === 'version') malformed.schemaVersion = 2;
  send(child, malformed); child.emit('close', 0);
  await expect(pending).resolves.toMatchObject({ kind: 'helper_crashed', cleanupConfirmed: false });
  expect(output).not.toHaveBeenCalled();
});

function releasedV3() { return { schemaVersion: 3, type: 'execution_released', requestId: 'cancel-1', profileId: 'a9-trusted-shell-current-user-v2',
  releaseId: 'release-1', childPid: startedV3().childPid, lastOutputSeq: 0, jobKillOnCloseDisabled: true, ownershipReleased: true,
  stdout: { rawBytesRead: 0, emittedBytes: 0, omittedBytes: 0 }, stderr: { rawBytesRead: 0, emittedBytes: 0, omittedBytes: 0 } }; }
test('managed v3 release binds the same request and native child and is idempotent per releaseId', async () => {
  const child = new FakeChild(); (spawn as unknown as jest.Mock).mockReturnValue(child);
  const controls: string[] = []; child.stdin.on('data', (b) => controls.push(b.toString()));
  const managed = new StdioHelperTransport('helper').startManaged({ ...requestV3(), managed: true });
  send(child, startedV3()); await managed.ready;
  const release = managed.release!('release-1'); const repeat = managed.release!('release-1');
  await expect(managed.release!('other')).rejects.toThrow('RELEASE_ID_MISMATCH');
  send(child, releasedV3()); child.emit('close', 0);
  await expect(release).resolves.toMatchObject({ ownershipReleased: true }); await expect(repeat).resolves.toMatchObject({ releaseId: 'release-1' });
  expect(controls.filter((s) => s.includes('"type":"release"'))).toHaveLength(1);
  expect(JSON.parse(controls[1])).toEqual({ schemaVersion: 3, type: 'release', requestId: 'cancel-1', releaseId: 'release-1' });
});
test.each([{ childPid: 1 }, { releaseId: 'other' }, { jobKillOnCloseDisabled: false }, { ownershipReleased: false }, { lastOutputSeq: 1 },
  { stdout: { rawBytesRead: 1, emittedBytes: 1, omittedBytes: 0 } }])('managed v3 rejects an invalid release receipt %j', async (patch) => {
  const child = new FakeChild(); (spawn as unknown as jest.Mock).mockReturnValue(child);
  const managed = new StdioHelperTransport('helper').startManaged({ ...requestV3(), managed: true }); send(child, startedV3()); await managed.ready;
  const released = managed.release!('release-1'); send(child, { ...releasedV3(), ...patch }); child.emit('close', 0);
  await expect(released).rejects.toThrow('RELEASE_UNKNOWN'); await expect(managed.completion).resolves.toMatchObject({ cleanupConfirmed: false });
});
test('unsolicited release and cancel-before-release cannot transfer ownership', async () => {
  const child = new FakeChild(); (spawn as unknown as jest.Mock).mockReturnValue(child);
  const managed = new StdioHelperTransport('helper').startManaged({ ...requestV3(), managed: true }); send(child, startedV3()); await managed.ready;
  managed.cancel(); await expect(managed.release!('release-1')).rejects.toThrow('RELEASE_STATE_INVALID');
  send(child, releasedV3()); child.emit('close', 0);
  await expect(managed.completion).resolves.toMatchObject({ cleanupConfirmed: false });
});
