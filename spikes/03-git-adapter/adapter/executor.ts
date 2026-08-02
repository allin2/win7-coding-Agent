/**
 * SPIKE 03 - 结构化 argv 执行器
 *
 * 无 shell 调用，直接执行 git 命令。
 * 使用 spawn 而非 exec，避免 shell 注入风险。
 *
 * TypeScript target: ES2020
 * Win7-Validation: NOT_PERFORMED
 */

import { spawn, SpawnOptions, SpawnSyncOptions } from 'child_process';
import { GitIsolation, IsolatedEnv } from './isolation';
import { Whitelist, WhitelistResult } from './whitelist';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface ExecutionResult {
  /** 退出码 */
  exitCode: number | null;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 执行时间（毫秒） */
  durationMs: number;
  /** 是否被白名单拒绝 */
  rejected: boolean;
  /** 拒绝原因 */
  rejectReason?: string;
}

interface ExecutionOptions {
  /** 工作目录（支持中文+空格路径） */
  cwd: string;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 最大输出大小（字节） */
  maxOutputSize?: number;
  /** 是否使用同步执行 */
  sync?: boolean;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_OUTPUT = 16 * 1024 * 1024; // 16 MB

// ─── 执行器类 ────────────────────────────────────────────────────────────────

/**
 * Git 命令执行器
 * 
 * 负责：
 *   - 白名单验证
 *   - 隔离环境应用
 *   - 无 shell 执行
 *   - 输出截断
 */
class GitExecutor {
  private isolation: GitIsolation;
  private whitelist: Whitelist;
  private gitPath: string;

  constructor(gitPath: string = 'git') {
    this.gitPath = gitPath;
    this.isolation = new GitIsolation();
    this.whitelist = new Whitelist();
  }

  /**
   * 执行 git 命令（异步）
   * 
   * @param args - git 命令参数（如 ['status', '--porcelain']）
   * @param options - 执行选项
   * @returns 执行结果
   */
  async execute(args: string[], options: ExecutionOptions): Promise<ExecutionResult> {
    const startTime = Date.now();

    // 1. 白名单验证
    const whitelistResult = this.whitelist.validate(args);
    if (!whitelistResult.allowed) {
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: Date.now() - startTime,
        rejected: true,
        rejectReason: whitelistResult.reason,
      };
    }

    // 2. 创建隔离环境
    const isolatedEnv = this.isolation.createIsolatedEnv();

    // 3. 构建隔离的 git 参数
    const isolatedArgs = this.isolation.buildIsolatedGitArgs(args);

    // 4. 执行命令（无 shell）
    const result = await this.spawnGit(isolatedArgs, isolatedEnv, options);

    return {
      ...result,
      durationMs: Date.now() - startTime,
      rejected: false,
    };
  }

  /**
   * 执行 git 命令（同步）
   * 
   * @param args - git 命令参数
   * @param options - 执行选项
   * @returns 执行结果
   */
  executeSync(args: string[], options: ExecutionOptions): ExecutionResult {
    const startTime = Date.now();

    // 1. 白名单验证
    const whitelistResult = this.whitelist.validate(args);
    if (!whitelistResult.allowed) {
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        durationMs: Date.now() - startTime,
        rejected: true,
        rejectReason: whitelistResult.reason,
      };
    }

    // 2. 创建隔离环境
    const isolatedEnv = this.isolation.createIsolatedEnv();

    // 3. 构建隔离的 git 参数
    const isolatedArgs = this.isolation.buildIsolatedGitArgs(args);

    // 4. 同步执行
    const result = this.spawnGitSync(isolatedArgs, isolatedEnv, options);

    return {
      ...result,
      durationMs: Date.now() - startTime,
      rejected: false,
    };
  }

  /**
   * 内部：异步 spawn git
   * @private
   */
  private spawnGit(
    args: string[],
    env: IsolatedEnv,
    options: ExecutionOptions
  ): Promise<Omit<ExecutionResult, 'rejected' | 'rejectReason'>> {
    return new Promise((resolve) => {
      const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
      const maxOutput = options.maxOutputSize || DEFAULT_MAX_OUTPUT;

      const spawnOptions: SpawnOptions = {
        cwd: options.cwd,
        env: env as NodeJS.ProcessEnv,
        shell: false, // 关键：不使用 shell
        windowsHide: true,
      };

      const child = spawn(this.gitPath, args, spawnOptions);

      let stdout = '';
      let stderr = '';
      let killed = false;

      // 超时处理
      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
      }, timeoutMs);

      // stdout 收集
      child.stdout?.on('data', (data: Buffer) => {
        if (stdout.length < maxOutput) {
          stdout += data.toString();
        }
      });

      // stderr 收集
      child.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < maxOutput) {
          stderr += data.toString();
        }
      });

      // 完成处理
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({
          exitCode: killed ? null : exitCode,
          stdout: stdout.slice(0, maxOutput),
          stderr: stderr.slice(0, maxOutput),
          durationMs: 0, // 由调用者计算
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          exitCode: null,
          stdout: '',
          stderr: err.message,
          durationMs: 0,
        });
      });
    });
  }

  /**
   * 内部：同步 spawn git
   * @private
   */
  private spawnGitSync(
    args: string[],
    env: IsolatedEnv,
    options: ExecutionOptions
  ): Omit<ExecutionResult, 'rejected' | 'rejectReason'> {
    const { spawnSync } = require('child_process');
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const maxOutput = options.maxOutputSize || DEFAULT_MAX_OUTPUT;

    const spawnOptions: SpawnSyncOptions = {
      cwd: options.cwd,
      env: env as NodeJS.ProcessEnv,
      shell: false,
      timeout: timeoutMs,
      maxBuffer: maxOutput,
      windowsHide: true,
    };

    const result = spawnSync(this.gitPath, args, spawnOptions);

    return {
      exitCode: result.status,
      stdout: result.stdout?.toString() || '',
      stderr: result.stderr?.toString() || '',
      durationMs: 0,
    };
  }
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

export {
  GitExecutor,
  ExecutionResult,
  ExecutionOptions,
};
