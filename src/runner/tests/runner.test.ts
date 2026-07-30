/**
 * @file Runner 模块单元测试
 * @description 覆盖 MockRunner 执行、shell 元字符拒绝、超时、输出截断
 */

import { MockRunner, findShellMetaChar, RunRequest } from '../src';

describe('MockRunner', () => {
  const defaultConfig = {
    timeout: 5000,
    maxOutput: 1024 * 1024,
    workDir: '/tmp/test',
  };

  describe('execute — 正常执行', () => {
    it('应返回成功结果（exitCode=0）', async () => {
      const runner = new MockRunner({ defaultExitCode: 0, mockDuration: 1 });
      const request: RunRequest = {
        command: 'git',
        args: ['status', '--porcelain'],
        config: defaultConfig,
        approvalLevel: 'read_only',
      };

      const result = await runner.execute(request);

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.truncated).toBe(false);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('应返回配置的 stdout 和 stderr', async () => {
      const runner = new MockRunner({
        defaultStdout: 'hello world',
        defaultStderr: 'warning',
        mockDuration: 1,
      });
      const request: RunRequest = {
        command: 'echo',
        args: ['test'],
        config: defaultConfig,
        approvalLevel: 'read_only',
      };

      const result = await runner.execute(request);

      expect(result.stdout).toBe('hello world');
      expect(result.stderr).toBe('warning');
    });

    it('应返回非零退出码', async () => {
      const runner = new MockRunner({ defaultExitCode: 128, mockDuration: 1 });
      const request: RunRequest = {
        command: 'git',
        args: ['log'],
        config: defaultConfig,
        approvalLevel: 'read_only',
      };

      const result = await runner.execute(request);

      expect(result.exitCode).toBe(128);
    });
  });

  describe('execute — 超时模拟', () => {
    it('应返回 timedOut=true', async () => {
      const runner = new MockRunner({ simulateTimeout: true, mockDuration: 1 });
      const request: RunRequest = {
        command: 'sleep',
        args: ['100'],
        config: { ...defaultConfig, timeout: 100 },
        approvalLevel: 'read_only',
      };

      const result = await runner.execute(request);

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toContain('timed out');
    });
  });

  describe('execute — 输出截断模拟', () => {
    it('应返回 truncated=true 并截断输出', async () => {
      const longOutput = 'a'.repeat(1000);
      const runner = new MockRunner({
        defaultStdout: longOutput,
        simulateTruncation: true,
        mockDuration: 1,
      });
      const request: RunRequest = {
        command: 'cat',
        args: ['large-file.txt'],
        config: { ...defaultConfig, maxOutput: 100 },
        approvalLevel: 'read_only',
      };

      const result = await runner.execute(request);

      expect(result.truncated).toBe(true);
      expect(result.stdout.length).toBe(100);
    });
  });
});

describe('findShellMetaChar — shell 元字符检测', () => {
  it('应检测管道符 |', () => {
    expect(findShellMetaChar(['ls', '|', 'grep', 'test'])).toBe('|');
  });

  it('应检测分号 ;', () => {
    expect(findShellMetaChar(['echo', 'hello;', 'rm', '-rf'])).toBe(';');
  });

  it('应检测 && 操作符', () => {
    expect(findShellMetaChar(['cmd1', '&&', 'cmd2'])).toBe('&&');
  });

  it('应检测 || 操作符', () => {
    expect(findShellMetaChar(['cmd1', '||', 'cmd2'])).toBe('||');
  });

  it('应检测反引号 `', () => {
    expect(findShellMetaChar(['echo', '`whoami`'])).toBe('`');
  });

  it('应在安全参数时返回 null', () => {
    expect(findShellMetaChar(['status', '--porcelain', '--branch'])).toBeNull();
  });

  it('应处理中文路径参数', () => {
    expect(findShellMetaChar(['中文路径/文件.txt', '--verbose'])).toBeNull();
  });

  it('应处理含空格的中文路径', () => {
    expect(findShellMetaChar(['我的 文件/测试.txt'])).toBeNull();
  });
});

describe('MockRunner — shell 元字符拒绝', () => {
  const defaultConfig = {
    timeout: 5000,
    maxOutput: 1024 * 1024,
    workDir: '/tmp/test',
  };

  it('应拒绝包含 | 的参数', async () => {
    const runner = new MockRunner({ mockDuration: 1 });
    const request: RunRequest = {
      command: 'ls',
      args: ['|', 'grep', 'test'],
      config: defaultConfig,
      approvalLevel: 'read_only',
    };

    await expect(runner.execute(request)).rejects.toThrow('Shell metacharacter rejected');
  });

  it('应拒绝包含 && 的参数', async () => {
    const runner = new MockRunner({ mockDuration: 1 });
    const request: RunRequest = {
      command: 'cmd1',
      args: ['&&', 'cmd2'],
      config: defaultConfig,
      approvalLevel: 'read_only',
    };

    await expect(runner.execute(request)).rejects.toThrow('Shell metacharacter rejected');
  });

  it('应拒绝包含 ; 的参数', async () => {
    const runner = new MockRunner({ mockDuration: 1 });
    const request: RunRequest = {
      command: 'echo',
      args: ['hello;'],
      config: defaultConfig,
      approvalLevel: 'read_only',
    };

    await expect(runner.execute(request)).rejects.toThrow('Shell metacharacter rejected');
  });

  it('应拒绝包含反引号的参数', async () => {
    const runner = new MockRunner({ mockDuration: 1 });
    const request: RunRequest = {
      command: 'echo',
      args: ['`whoami`'],
      config: defaultConfig,
      approvalLevel: 'read_only',
    };

    await expect(runner.execute(request)).rejects.toThrow('Shell metacharacter rejected');
  });
});
