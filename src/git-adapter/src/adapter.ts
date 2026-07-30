/**
 * @module git-adapter/adapter
 * @description GitAdapter — 安全 Git 命令执行器
 * @remarks
 * 执行流程：白名单验证 → 隔离配置注入 → 结构化 argv 构建 → 执行（通过 IRunner）
 * - 禁止 shell=True，使用 spawn 结构化调用
 * - 中文+空格路径兼容（C10）
 */

import { spawn } from 'child_process';
import { GitRequest, GitResult, GitCommandCategory } from './types';
import { validateWhitelist } from './whitelist';
import { buildIsolatedEnv, buildIsolatedArgs } from './isolation';

/**
 * Shell 元字符正则（C09 约束）
 */
const SHELL_META_RE = /[|;&`]/;
const SHELL_AND_OR_RE = /&&|\|\|/;

/**
 * GitAdapter 配置
 */
export interface GitAdapterConfig {
  /** Git 可执行文件路径（默认 'git'） */
  gitBinary?: string;
  /** 默认超时时间（毫秒） */
  defaultTimeout?: number;
  /** 最大输出字节数 */
  maxOutput?: number;
  /** 是否启用隔离模式（默认 true） */
  isolation?: boolean;
}

/**
 * GitAdapter — 安全 Git 命令执行器
 * @remarks
 * 所有 Git 操作必须通过此类执行，确保：
 * 1. 命令白名单验证
 * 2. 隔离环境变量注入
 * 3. 结构化 argv（禁止 shell 拼接）
 * 4. 中文+空格路径兼容
 */
export class GitAdapter {
  private readonly config: Required<GitAdapterConfig>;

  /**
   * 创建 GitAdapter 实例
   * @param config - 适配器配置
   */
  constructor(config: GitAdapterConfig = {}) {
    this.config = {
      gitBinary: config.gitBinary ?? 'git',
      defaultTimeout: config.defaultTimeout ?? 30000,
      maxOutput: config.maxOutput ?? 10 * 1024 * 1024, // 10MB
      isolation: config.isolation ?? true,
    };
  }

  /**
   * 执行 Git 命令
   * @param request - Git 执行请求
   * @returns Git 执行结果
   * @throws 当命令被白名单拒绝时抛出 Error
   * @throws 当参数包含 shell 元字符时抛出 Error
   *
   * @example
   * ```typescript
   * const adapter = new GitAdapter();
   * const result = await adapter.execute({
   *   command: 'status',
   *   args: ['--porcelain'],
   *   workDir: '/path/to/repo',
   * });
   * ```
   */
  async execute(request: GitRequest): Promise<GitResult> {
    // 1. 白名单验证
    const whitelistResult = validateWhitelist(request);
    if (!whitelistResult.allowed) {
      throw new Error(
        `Git command denied: ${whitelistResult.reason}`
      );
    }

    // 2. 验证参数无 shell 元字符
    this.validateArgs(request.args);

    // 3. 构建结构化 argv
    let finalArgs = [...request.args];
    if (this.config.isolation) {
      finalArgs = buildIsolatedArgs(finalArgs);
    }

    // 4. 构建隔离环境变量
    const env = this.config.isolation ? buildIsolatedEnv() : undefined;

    // 5. 执行命令（spawn 结构化调用，禁止 shell=True）
    return this.spawnGit(request.command, finalArgs, request.workDir, env, request.timeout);
  }

  /**
   * 验证参数中无 shell 元字符
   * @param args - 待验证的参数数组
   * @throws 当发现 shell 元字符时抛出 Error
   */
  private validateArgs(args: string[]): void {
    for (const arg of args) {
      if (SHELL_AND_OR_RE.test(arg)) {
        const match = arg.match(SHELL_AND_OR_RE);
        throw new Error(
          `Shell metacharacter rejected: "${match?.[0]}" found in arg "${arg}". ` +
          `Structured argv only — no shell string concatenation (C09).`
        );
      }
      if (SHELL_META_RE.test(arg)) {
        const match = arg.match(SHELL_META_RE);
        throw new Error(
          `Shell metacharacter rejected: "${match?.[0]}" found in arg "${arg}". ` +
          `Structured argv only — no shell string concatenation (C09).`
        );
      }
    }
  }

  /**
   * 使用 spawn 执行 Git 命令（结构化调用，禁止 shell）
   * @param command - Git 子命令（如 'status'）
   * @param args - 完整参数数组（含 -c 隔离参数）
   * @param workDir - 工作目录
   * @param env - 隔离环境变量
   * @param timeout - 超时时间
   * @returns Git 执行结果
   */
  private spawnGit(
    command: string,
    args: string[],
    workDir: string,
    env?: Record<string, string>,
    timeout?: number
  ): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const fullArgs = [command, ...args];
      const effectiveTimeout = timeout ?? this.config.defaultTimeout;

      const child = spawn(this.config.gitBinary, fullArgs, {
        cwd: workDir,
        env: env ?? process.env,
        shell: false, // 禁止 shell=True
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const startTime = Date.now();

      // 超时处理
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // 给进程 5 秒优雅退出
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, effectiveTimeout);

      // 输出大小限制
      let truncated = false;
      const maxOutput = this.config.maxOutput;

      child.stdout.on('data', (data: Buffer) => {
        if (!truncated) {
          const newContent = data.toString('utf-8');
          if (Buffer.byteLength(stdout + newContent, 'utf-8') > maxOutput) {
            truncated = true;
            stdout += newContent.slice(0, maxOutput - Buffer.byteLength(stdout, 'utf-8'));
          } else {
            stdout += newContent;
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        if (!truncated) {
          const newContent = data.toString('utf-8');
          if (Buffer.byteLength(stderr + newContent, 'utf-8') > maxOutput) {
            truncated = true;
            stderr += newContent.slice(0, maxOutput - Buffer.byteLength(stderr, 'utf-8'));
          } else {
            stderr += newContent;
          }
        }
      });

      child.on('error', (error: Error) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn git: ${error.message}`));
      });

      child.on('close', (exitCode: number | null) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;

        if (timedOut) {
          resolve({
            exitCode: -1,
            stdout,
            stderr: stderr || 'Command timed out',
            command,
          });
          return;
        }

        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr,
          command,
        });
      });
    });
  }

  /**
   * 获取命令分类（用于审批决策）
   * @param command - Git 命令名
   * @param subcommand - Git 子命令（可选）
   * @returns 命令分类
   */
  getCommandCategory(command: string, subcommand?: string): GitCommandCategory | undefined {
    const { getCommandCategory: getCategory } = require('./whitelist');
    return getCategory(command, subcommand);
  }
}
