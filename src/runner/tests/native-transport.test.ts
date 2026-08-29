import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { hasCompleteHelperCleanupProof, NativeHelperExecutionResult, NativeHelperRequest, NativeHelperRequestV2, parseNativeHelperResponse, StdioHelperTransport } from '../src';

jest.mock('child_process', () => ({ spawn: jest.fn() }));

class FakeChild extends EventEmitter {
  pid = 4321;
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = jest.fn(() => true);
}

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
