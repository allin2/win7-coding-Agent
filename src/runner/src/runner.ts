/**
 * @module runner/runner
 * @description IRunner 接口定义与 MockRunner 实现
 * @remarks MockRunner 用于测试和无 containment 环境下的命令模拟执行
 */

import { RunRequest, RunResult } from './types';

/**
 * Shell 元字符正则匹配
 * @remarks 检测 |, ;, &&, ||, ` 等危险字符，防止 shell 注入（C09 约束）
 */
const SHELL_META_RE = /[|;&`]/;
const SHELL_AND_OR_RE = /&&|\|\|/;

/**
 * 验证参数中是否包含 shell 元字符
 * @param args - 待验证的参数数组
 * @returns 包含元字符时返回该字符，否则返回 null
 */
export function findShellMetaChar(args: string[]): string | null {
  for (const arg of args) {
    if (SHELL_AND_OR_RE.test(arg)) {
      const match = arg.match(SHELL_AND_OR_RE);
      return match ? match[0] : null;
    }
    if (SHELL_META_RE.test(arg)) {
      const match = arg.match(SHELL_META_RE);
      return match ? match[0] : null;
    }
  }
  return null;
}

/**
 * IRunner 接口 — 命令执行器抽象
 * @remarks 定义统一的命令执行契约，支持真实实现和 Mock 实现
 */
export interface IRunner {
  /**
   * 执行命令
   * @param request - 执行请求（结构化 argv）
   * @returns 执行结果
   * @throws 当参数包含 shell 元字符时抛出错误
   */
  execute(request: RunRequest): Promise<RunResult>;
}

/**
 * MockRunner 配置
 */
export interface MockRunnerConfig {
  /** 默认退出码 */
  defaultExitCode?: number;
  /** 默认 stdout 输出 */
  defaultStdout?: string;
  /** 默认 stderr 输出 */
  defaultStderr?: string;
  /** 模拟执行耗时（毫秒） */
  mockDuration?: number;
  /** 是否模拟超时 */
  simulateTimeout?: boolean;
  /** 是否模拟输出截断 */
  simulateTruncation?: boolean;
}

/**
 * MockRunner — IRunner 的模拟实现
 * @remarks 用于单元测试和无 containment 环境，不实际执行系统命令
 */
export class MockRunner implements IRunner {
  private readonly config: MockRunnerConfig;

  /**
   * 创建 MockRunner 实例
   * @param config - Mock 行为配置
   */
  constructor(config: MockRunnerConfig = {}) {
    this.config = {
      defaultExitCode: config.defaultExitCode ?? 0,
      defaultStdout: config.defaultStdout ?? '',
      defaultStderr: config.defaultStderr ?? '',
      mockDuration: config.mockDuration ?? 10,
      simulateTimeout: config.simulateTimeout ?? false,
      simulateTruncation: config.simulateTruncation ?? false,
    };
  }

  /**
   * 模拟执行命令
   * @param request - 执行请求
   * @returns 模拟的执行结果
   * @throws 当参数包含 shell 元字符时抛出 Error
   */
  async execute(request: RunRequest): Promise<RunResult> {
    // 验证 args 中无 shell 元字符
    const metaChar = findShellMetaChar(request.args);
    if (metaChar !== null) {
      throw new Error(
        `Shell metacharacter rejected: "${metaChar}" found in args. ` +
        `Structured argv only — no shell string concatenation (C09).`
      );
    }

    // 模拟执行耗时
    if (this.config.mockDuration && this.config.mockDuration > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.mockDuration));
    }

    // 模拟超时
    if (this.config.simulateTimeout) {
      return {
        exitCode: -1,
        stdout: '',
        stderr: 'Command timed out',
        duration: request.config.timeout,
        timedOut: true,
        truncated: false,
      };
    }

    // 模拟输出截断
    if (this.config.simulateTruncation) {
      const truncatedStdout = this.config.defaultStdout!.slice(0, request.config.maxOutput);
      return {
        exitCode: this.config.defaultExitCode!,
        stdout: truncatedStdout,
        stderr: this.config.defaultStderr!,
        duration: this.config.mockDuration!,
        timedOut: false,
        truncated: true,
      };
    }

    // 正常执行结果
    return {
      exitCode: this.config.defaultExitCode!,
      stdout: this.config.defaultStdout!,
      stderr: this.config.defaultStderr!,
      duration: this.config.mockDuration!,
      timedOut: false,
      truncated: false,
    };
  }
}
