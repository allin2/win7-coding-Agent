/**
 * @module runner/runner
 * @description IRunner 接口定义与 MockRunner 实现
 * @remarks MockRunner 用于测试和无 containment 环境下的命令模拟执行
 */
import { RunRequest, RunResult } from './types';
/**
 * 验证参数中是否包含 shell 元字符
 * @param args - 待验证的参数数组
 * @returns 包含元字符时返回该字符，否则返回 null
 */
export declare function findShellMetaChar(args: string[]): string | null;
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
export declare class MockRunner implements IRunner {
    private readonly config;
    /**
     * 创建 MockRunner 实例
     * @param config - Mock 行为配置
     */
    constructor(config?: MockRunnerConfig);
    /**
     * 模拟执行命令
     * @param request - 执行请求
     * @returns 模拟的执行结果
     * @throws 当参数包含 shell 元字符时抛出 Error
     */
    execute(request: RunRequest): Promise<RunResult>;
}
//# sourceMappingURL=runner.d.ts.map