/**
 * @module runner/types
 * @description Runner 接口层类型定义 — 执行结果、配置、请求与 Containment 状态
 */
/**
 * Runner 执行结果
 * @remarks 包含退出码、输出内容、执行时长等完整执行信息
 */
export interface RunResult {
    /** 进程退出码（0 表示成功） */
    exitCode: number;
    /** 标准输出内容 */
    stdout: string;
    /** 标准错误输出内容 */
    stderr: string;
    /** 执行耗时（毫秒） */
    duration: number;
    /** 是否因超时被终止 */
    timedOut: boolean;
    /** 输出是否被截断（超过 maxOutput 限制） */
    truncated: boolean;
}
/**
 * Runner 配置
 * @remarks 控制命令执行的超时、输出上限、工作目录等参数
 */
export interface RunnerConfig {
    /** 命令超时时间（毫秒） */
    timeout: number;
    /** 输出上限（字节数） */
    maxOutput: number;
    /** 工作目录绝对路径 */
    workDir: string;
    /** 附加环境变量（可选） */
    env?: Record<string, string>;
}
/**
 * 执行请求
 * @remarks 结构化 argv，绝不拼接 shell 字符串（C09 约束）
 */
export interface RunRequest {
    /** 要执行的命令（如 'git', 'node'） */
    command: string;
    /** 结构化参数数组，禁止包含 shell 元字符 */
    args: string[];
    /** Runner 执行配置 */
    config: RunnerConfig;
    /** 审批级别，引用 core 的 ApprovalLevel */
    approvalLevel: string;
}
/**
 * Containment 状态
 * @remarks 描述当前进程的隔离状态（Job Object 等）
 */
export interface ContainmentStatus {
    /** Containment 机制是否可用 */
    available: boolean;
    /** 当前进程是否在 Job Object 中 */
    inJob: boolean;
    /** 进程是否处于受限令牌状态 */
    restricted: boolean;
    /** 不可用时的原因说明 */
    reason?: string;
}
//# sourceMappingURL=types.d.ts.map