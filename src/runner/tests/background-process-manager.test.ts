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
    const handle = manager.start(
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

    // 停止后台进程
    const stopped = await manager.stop('bg-test-1');
    expect(stopped.status).toBe('stopped');
  });

  it('enforces maximum 3 concurrent background processes', async () => {
    for (let i = 1; i <= 3; i++) {
      manager.start(
        `bg-${i}`,
        'sleep 10',
        process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        process.platform === 'win32' ? ['/c', 'ping -n 10 127.0.0.1'] : ['-c', 'sleep 10'],
        process.cwd(),
      );
    }

    expect(manager.getActiveCount()).toBe(3);

    expect(() => {
      manager.start(
        'bg-4',
        'sleep 10',
        process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        process.platform === 'win32' ? ['/c', 'ping -n 10 127.0.0.1'] : ['-c', 'sleep 10'],
        process.cwd(),
      );
    }).toThrow(/上限/);
  });
});
