import { BackgroundProcessManager } from '../src';

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
