import { BackgroundProcessManager, NativeHelperExecutionResult, NativeHelperRequest } from '../src';

describe('A9-02: BackgroundProcessManager', () => {
  let manager: BackgroundProcessManager;

  beforeEach(() => {
    manager = new BackgroundProcessManager();
  });

  afterEach(async () => {
    await manager.cleanupAll();
  });

  it('starts background process, polls output, and stops gracefully', async () => {
    const handle = await manager.start(
      'bg-test-1',
      'node -e "setInterval(() => console.log(\'tick\'), 100)"',
      process.execPath,
      ['-e', 'setInterval(() => console.log(\'tick\'), 100)'],
      process.cwd(),
    );

    expect(handle.handleId).toBe('bg-test-1');
    expect(handle.status).toBe('running');
    expect(handle.pid).toBeDefined();

    // 等待输出
    await new Promise((r) => setTimeout(r, 350));

    const pollResult = manager.poll('bg-test-1');
    expect(pollResult.status).toBe('running');
    expect(pollResult.stdoutDelta).toContain('tick');

    // 再次轮询增量为空或仅有新 tick
    const secondPoll = manager.poll('bg-test-1');
    expect(secondPoll.status).toBe('running');

    // 停止后台进程：只有清理可证明才标记 stopped。
    const stopped = await manager.stop('bg-test-1');
    expect(stopped.status).toBe('stopped');
  });

  it('contains a spawned process when durable state persistence fails', async () => {
    const failing = new BackgroundProcessManager(undefined, (text) => text, () => [], () => {
      throw new Error('SQLITE_FULL');
    });
    try {
      await expect(failing.start(
        'bg-persist-failure',
        'long-running child',
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        process.cwd(),
      )).rejects.toMatchObject({ code: 'A9_BACKGROUND_STATE_PERSIST_FAILED', cleanupConfirmed: true });
      expect(failing.getActiveCount()).toBe(0);
    } finally {
      await failing.cleanupAll();
    }
  });

  it('holds Windows background work in the D-013 helper until bound cancellation is confirmed', async () => {
    let finish!: (value: any) => void;
    let cancelCount = 0;
    const completion = new Promise<any>((resolve) => { finish = resolve; });
    const helperTransport = {
      invoke: jest.fn(),
      startManaged: jest.fn(() => ({
        pid: 7331,
        completion,
        cancel: () => {
          cancelCount += 1;
          const response: NativeHelperExecutionResult = {
            schema_version: 1, type: 'execution_result', requestId: 'bg-helper', status: 'completed',
            exitCode: 1, executionTimeMs: 20, timedOut: false, idleTimedOut: false, canceled: true, outputTruncated: false,
            containmentVerified: true, inputDetached: true,
            hostJob: { detected: true, breakaway: 'silent', limitFlags: 0x3000, childJobAssignmentVerified: true },
            tokenAudit: { source: 'suspended_child_process_token', verified: true, isRestricted: true, tokenType: 'primary', restrictedSidSetVerified: true, userRestrictedSid: true, worldRestrictedSid: true, administratorsRestrictedSid: false, restrictedSidCount: 2, integritySid: 'S-1-16-4096', integrityRid: 4096 },
            stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '', aclChanges: [],
          };
          finish({ kind: 'response', response });
        },
      })),
    };
    manager = new BackgroundProcessManager(helperTransport as any);
    const helperRequest: NativeHelperRequest = {
      schema_version: 1, requestId: 'bg-helper', executable: 'cmd.exe', argv: ['/c', 'ping -t 127.0.0.1'],
      workingDirectory: 'C:\\acceptance', timeoutMs: 60_000, idleTimeoutMs: 0,
      maxOutputSize: 1024, allowNetwork: false, allowedDirectories: [], protectedDirectories: [],
    };
    const handle = await manager.start('bg-helper', 'ping', 'cmd.exe', [], 'C:\\acceptance', undefined, helperRequest);
    expect(handle).toMatchObject({ pid: 7331, status: 'running' });
    const stopped = await manager.stop('bg-helper');
    expect(stopped.status).toBe('stopped');
    expect(cancelCount).toBe(1);
  });

  it('enforces maximum 3 concurrent background processes', async () => {
    for (let i = 1; i <= 3; i++) {
      await manager.start(
        `bg-${i}`,
        'sleep 10',
        process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        process.platform === 'win32' ? ['/c', 'ping -n 10 127.0.0.1'] : ['-c', 'sleep 10'],
        process.cwd(),
      );
    }

    expect(manager.getActiveCount()).toBe(3);

    await expect(manager.start(
      'bg-4',
      'sleep 10',
      process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      process.platform === 'win32' ? ['/c', 'ping -n 10 127.0.0.1'] : ['-c', 'sleep 10'],
      process.cwd(),
    )).rejects.toThrow(/上限/);
  });

  it('reports start failure honestly (never success without a PID)', async () => {
    const handle = await manager.start(
      'bg-missing-exe',
      'definitely-not-a-real-executable --flag',
      'definitely-not-a-real-executable',
      ['--flag'],
      process.cwd(),
    );
    expect(handle.status).toBe('failed');
    expect(handle.pid).toBeUndefined();
    expect(manager.getActiveCount()).toBe(0);
  });

  it('marks exited only after the process truly closes (never running-as-exited)', async () => {
    const handle = await manager.start(
      'bg-short',
      'node -e "setTimeout(() => process.exit(7), 120)"',
      process.execPath,
      ['-e', 'setTimeout(() => process.exit(7), 120)'],
      process.cwd(),
    );
    expect(handle.status).toBe('running');
    await new Promise((r) => setTimeout(r, 600));
    const poll = manager.poll('bg-short');
    expect(poll.status).toBe('exited');
    expect(poll.exitCode).toBe(7);
  });

  it('bounds stored logs and reports dropped lines', async () => {
    const handle = await manager.start(
      'bg-logs',
      'node -e "for (let i = 0; i < 3000; i++) console.log(\'line \' + i)"',
      process.execPath,
      ['-e', 'for (let i = 0; i < 3000; i++) console.log(\'line \' + i)'],
      process.cwd(),
    );
    expect(handle.status).toBe('running');
    await new Promise((r) => setTimeout(r, 900));
    const poll = manager.poll('bg-logs');
    expect(poll.status).toBe('exited');
    expect(poll.totalStdoutLines).toBeLessThanOrEqual(2000);
    expect(poll.logsDropped.stdout).toBeGreaterThan(0);
  });

  it('continues returning new log lines after the bounded ring shifts', async () => {
    await manager.start(
      'bg-ring-cursor',
      'node ring cursor',
      process.execPath,
      ['-e', [
        "for (let i = 0; i < 2300; i++) { console.log('old-out-' + i); console.error('old-err-' + i); }",
        "setTimeout(() => { console.log('fresh-out'); console.error('fresh-err'); }, 700);",
        'setTimeout(() => process.exit(0), 1300);',
      ].join(' ')],
      process.cwd(),
    );
    await new Promise((r) => setTimeout(r, 450));
    const first = manager.poll('bg-ring-cursor');
    expect(first.logsDropped.stdout).toBeGreaterThan(0);
    expect(first.logsDropped.stderr).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 550));
    const second = manager.poll('bg-ring-cursor');
    expect(second.stdoutDelta).toContain('fresh-out');
    expect(second.stderrDelta).toContain('fresh-err');
  });

  it('recovers after restart by probe-only facts (no auto-replay, PID-reuse flagged)', () => {
    const ownPid = process.pid;
    const handle = manager.adoptRecoveredFact('bg-recovered', {
      pid: ownPid,
      command: 'previous-session-command',
      cwd: process.cwd(),
      startTime: new Date().toISOString(),
    });
    expect(handle.status).toBe('running');
    expect(handle.pidReusePossible).toBe(true);
    expect(manager.isRecoveredFact('bg-recovered')).toBe(true);
    // 探测事实没有日志增量，也不会自动重启命令。
    const poll = manager.poll('bg-recovered');
    expect(poll.stdoutDelta).toBe('');
    expect(poll.logsDropped).toEqual({ stdout: 0, stderr: 0 });
  });

  it('polls stderr with an independent cursor', async () => {
    await manager.start(
      'bg-asymmetric-logs',
      'node asymmetric logs',
      process.execPath,
      ['-e', "console.log('out-1'); console.log('out-2'); console.error('err-1'); setTimeout(() => {}, 1000)"],
      process.cwd(),
    );
    await new Promise((r) => setTimeout(r, 150));
    const poll = manager.poll('bg-asymmetric-logs');
    expect(poll.stdoutDelta).toContain('out-2');
    expect(poll.stderrDelta).toContain('err-1');
  });

  it('redacts a secret split across background output chunks before poll exposure', async () => {
    const secret = 'BG-SPLIT-SECRET';
    manager = new BackgroundProcessManager(
      undefined,
      (text) => text.split(secret).join('***redacted***'),
      () => [secret],
    );
    const script = "process.stdout.write('BG-SPLIT-'); setTimeout(() => process.stdout.write('SECRET'), 30)";
    await manager.start('bg-secret-split', script, process.execPath, ['-e', script], process.cwd());
    await new Promise((resolve) => setTimeout(resolve, 100));

    const poll = manager.poll('bg-secret-split');
    expect(poll.stdoutDelta).toContain('***redacted***');
    expect(poll.stdoutDelta).not.toContain(secret);
  });

  it('retains unconfirmed recovered process facts after managed disposal', async () => {
    manager.adoptRecoveredFact('bg-recovered-dispose', {
      pid: process.pid,
      command: 'previous-session-command',
      cwd: process.cwd(),
      startTime: new Date().toISOString(),
    });
    const result = await manager.dispose({ stopManaged: true });
    expect(result.leftToSystem).toEqual([
      'bg-recovered-dispose (recovered PID fact requires explicit stop confirmation)',
    ]);
    expect(manager.getActiveCount()).toBe(1);
    expect(manager.list().map((handle) => handle.handleId)).toEqual(['bg-recovered-dispose']);
  });

  it('retains an unconfirmed helper cleanup fact across repeated shutdown attempts', async () => {
    let finish!: (value: any) => void;
    const completion = new Promise<any>((resolve) => { finish = resolve; });
    const helperTransport = {
      invoke: jest.fn(),
      startManaged: jest.fn(() => ({
        pid: 7332,
        completion,
        cancel: () => finish({ kind: 'cancelled', detail: 'cleanup unconfirmed', cleanupConfirmed: false }),
      })),
    };
    manager = new BackgroundProcessManager(helperTransport as any);
    const request: NativeHelperRequest = {
      schema_version: 1, requestId: 'bg-unconfirmed', executable: 'cmd.exe', argv: ['/d', '/s', '/c', 'ping -t 127.0.0.1'],
      workingDirectory: 'C:\\acceptance', timeoutMs: 60_000, idleTimeoutMs: 60_000,
      maxOutputSize: 1024, allowNetwork: false, allowedDirectories: [], protectedDirectories: [],
    };
    await manager.start('bg-unconfirmed', 'ping', 'cmd.exe', [], 'C:\\acceptance', undefined, request);

    const first = await manager.dispose({ stopManaged: true });
    const second = await manager.dispose({ stopManaged: true });

    expect(first.leftToSystem).toEqual([expect.stringContaining('helper cleanup unconfirmed')]);
    expect(second.leftToSystem).toEqual([expect.stringContaining('helper cleanup unconfirmed')]);
    expect(manager.getActiveCount()).toBe(1);
    expect(manager.list()).toEqual([expect.objectContaining({ handleId: 'bg-unconfirmed', cleanupRequired: true })]);
  });

  it('publishes a helper terminal state so products can replace the persisted cleanup_required fact', async () => {
    let finish!: (value: any) => void;
    const completion = new Promise<any>((resolve) => { finish = resolve; });
    const states: any[] = [];
    const helperTransport = {
      invoke: jest.fn(),
      startManaged: jest.fn(() => ({ pid: 7441, completion, cancel: jest.fn() })),
    };
    manager = new BackgroundProcessManager(helperTransport as any, undefined, undefined, (handle) => states.push(handle));
    const request: NativeHelperRequest = {
      schema_version: 1, requestId: 'bg-natural', executable: 'cmd.exe', argv: ['/c', 'echo ok'],
      workingDirectory: 'C:\\acceptance', timeoutMs: 60_000, idleTimeoutMs: 60_000,
      maxOutputSize: 1024, allowNetwork: false, allowedDirectories: [], protectedDirectories: [],
    };
    await manager.start('bg-natural', 'echo ok', 'cmd.exe', [], 'C:\\acceptance', undefined, request);
    finish({
      kind: 'response',
      response: {
        schema_version: 1, type: 'execution_result', requestId: 'bg-natural', status: 'completed',
        exitCode: 0, executionTimeMs: 20, timedOut: false, canceled: false, outputTruncated: false,
        containmentVerified: true, inputDetached: true,
        hostJob: { detected: true, breakaway: 'silent', limitFlags: 0x3000, childJobAssignmentVerified: true },
        tokenAudit: { source: 'suspended_child_process_token', verified: true, isRestricted: true, tokenType: 'primary', restrictedSidSetVerified: true, userRestrictedSid: true, worldRestrictedSid: true, administratorsRestrictedSid: false, restrictedSidCount: 2, integritySid: 'S-1-16-4096', integrityRid: 4096 },
        stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '', aclChanges: [],
      },
    });
    await completion;
    await new Promise((resolve) => setImmediate(resolve));

    expect(states).toEqual([
      expect.objectContaining({ handleId: 'bg-natural', status: 'running', cleanupRequired: true }),
      expect.objectContaining({ handleId: 'bg-natural', status: 'exited', cleanupRequired: false }),
    ]);
  });

  it('persists the running helper fact immediately and rejects contradictory cleanup proof', async () => {
    let finish!: (value: any) => void;
    const completion = new Promise<any>((resolve) => { finish = resolve; });
    const states: any[] = [];
    const helperTransport = {
      invoke: jest.fn(),
      startManaged: jest.fn(() => ({ pid: 7442, completion, cancel: jest.fn() })),
    };
    manager = new BackgroundProcessManager(helperTransport as any, undefined, undefined, (handle) => states.push(handle));
    const request: NativeHelperRequest = {
      schema_version: 1, requestId: 'bg-contradictory', executable: 'cmd.exe', argv: ['/c', 'echo ok'],
      workingDirectory: 'C:\\acceptance', timeoutMs: 60_000, idleTimeoutMs: 60_000,
      maxOutputSize: 1024, allowNetwork: false, allowedDirectories: [], protectedDirectories: [],
    };
    await manager.start('bg-contradictory', 'echo ok', 'cmd.exe', [], 'C:\\acceptance', undefined, request);
    expect(states).toEqual([expect.objectContaining({ status: 'running', cleanupRequired: true, pid: 7442 })]);

    finish({
      kind: 'response',
      response: {
        schema_version: 1, type: 'execution_result', requestId: 'bg-contradictory', status: 'completed',
        exitCode: 0, executionTimeMs: 20, timedOut: false, canceled: false, outputTruncated: false,
        containmentVerified: true, inputDetached: true,
        hostJob: { detected: true, breakaway: 'silent', limitFlags: 0x3000, childJobAssignmentVerified: false },
        tokenAudit: { source: 'suspended_child_process_token', verified: false, isRestricted: false, tokenType: 'primary', restrictedSidSetVerified: false, userRestrictedSid: false, worldRestrictedSid: false, administratorsRestrictedSid: true, restrictedSidCount: 0, integritySid: 'S-1-16-8192', integrityRid: 4096 },
        stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '', aclChanges: [],
      },
    });
    await completion;
    await new Promise((resolve) => setImmediate(resolve));
    expect(states[states.length - 1]).toEqual(expect.objectContaining({ status: 'failed', cleanupRequired: true }));
  });

  it('never kills a recovered PID without provable process identity', async () => {
    const child = require('child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    expect(child.pid).toBeDefined();
    manager.adoptRecoveredFact('bg-recovered-stop', {
      pid: child.pid!,
      command: 'previous-session-command',
      cwd: process.cwd(),
      startTime: new Date().toISOString(),
    });

    await expect(manager.stop('bg-recovered-stop')).rejects.toMatchObject({
      code: 'A9_RECOVERED_PROCESS_IDENTITY_UNCONFIRMED',
    });
    expect(BackgroundProcessManager.probeProcessAlive(child.pid!)).toBe(true);

    child.kill();
    await new Promise<void>((resolve) => child.once('close', () => resolve()));
    const observed = await manager.stop('bg-recovered-stop');
    expect(observed.status).toBe('exited');
    expect(observed.pidReusePossible).toBe(false);
  });

  it('dispose can leave managed processes to the system without killing them', async () => {
    await manager.start(
      'bg-leave',
      'node short-lived',
      process.execPath,
      ['-e', 'setTimeout(() => process.exit(0), 400)'],
      process.cwd(),
    );
    const result = await manager.dispose({ stopManaged: false });
    expect(result.leftToSystem).toContain('bg-leave');
    expect(manager.list()).toEqual([]);
  });
});
