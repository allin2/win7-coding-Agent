import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { NativeHelperExecutionResult, NativeHelperRequest, StdioHelperTransport } from '../src';

jest.mock('child_process', () => ({ spawn: jest.fn() }));

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = jest.fn(() => true);
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
    tokenAudit: { verified: true, isRestricted: true, tokenType: 'primary', restrictedSidSetVerified: true, integrityRid: 4096 },
    stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '',
    aclChanges: [{ applied: true, verified: true, rolledBack: true, error: '' }],
  };
}

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
