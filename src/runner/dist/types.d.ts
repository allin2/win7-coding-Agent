/**
 * @module runner/types
 * @description Runner 接口层类型定义 — 执行结果、配置、请求与 Containment 状态
 */
/** Expected, non-bug outcomes of one execution attempt. */
export type RunStatus = 'exited' | 'timeout' | 'idle_timeout' | 'cancelled' | 'spawn_failed' | 'rejected' | 'capability_unavailable' | 'cleanup_failed';
/** Bounded decoded representation of one byte stream. */
export interface CapturedStream {
    text: string;
    bytesRead: number;
    bytesRetained: number;
    omittedBytes: number;
    truncated: boolean;
    /** The native helper will later supply CP936 detection; mocks use UTF-8. */
    encoding: 'utf-8' | 'unknown';
    replacementCount: number;
}
/** A model- and UI-actionable failure. Expected execution failures never throw. */
export interface RunnerFailure {
    code: RunnerErrorCode;
    message: string;
    recommendedAction: string;
}
/**
 * Runner execution result. `status` is authoritative; `exitCode` is null when
 * no process exited normally. Only Runner implementation bugs may reject.
 */
export interface RunResult {
    schemaVersion: '2.0';
    status: RunStatus;
    exitCode: number | null;
    stdout: CapturedStream;
    stderr: CapturedStream;
    durationMs: number;
    termination: {
        requested: boolean;
        processTreeReaped: boolean;
        containment: 'job_object' | 'none';
        detail?: string;
    };
    error?: RunnerFailure;
}
/**
 * Runner 配置
 * @remarks 控制命令执行的超时、输出上限、工作目录等参数
 */
export interface RunnerConfig {
    /** Total command deadline in milliseconds. */
    timeoutMs: number;
    /** Maximum interval without stdout or stderr bytes. */
    idleTimeoutMs: number;
    /** Per-stream retained output cap in bytes. Readers must continue draining. */
    maxStdoutBytes: number;
    maxStderrBytes: number;
    /** 工作目录绝对路径 */
    workDir: string;
    /** Overlay applied to a controlled base environment by a production runner. */
    envOverlay?: Record<string, string>;
    /** Agent execution never receives an interactive stdin stream. */
    stdinPolicy: 'closed';
}
/**
 * 执行请求
 * @remarks 结构化 argv，绝不拼接 shell 字符串（C09 约束）
 */
export interface RunRequest {
    /** 要执行的命令（如 'git', 'node'） */
    command: string;
    /** 结构化参数数组；元字符作为普通参数数据传递，不经 Shell 解释 */
    args: string[];
    /** Runner 执行配置 */
    config: RunnerConfig;
    /** 审批级别，引用 core 的 ApprovalLevel */
    approvalLevel: 'read_only' | 'workspace_write';
    /** workspace-write 必须携带的精确审批绑定 */
    approval?: ApprovalExecutionBinding;
}
export declare enum RunnerErrorCode {
    CONTAINMENT_UNAVAILABLE = "CONTAINMENT_UNAVAILABLE",
    SHELL_HOST_PROHIBITED = "SHELL_HOST_PROHIBITED",
    INVALID_REQUEST = "INVALID_REQUEST",
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED",
    APPROVAL_INVALID = "APPROVAL_INVALID",
    APPROVAL_REPLAYED = "APPROVAL_REPLAYED",
    SENSITIVE_ENVIRONMENT_REJECTED = "SENSITIVE_ENVIRONMENT_REJECTED"
}
export declare class RunnerError extends Error {
    readonly code: RunnerErrorCode;
    readonly recommendedAction: string;
    constructor(code: RunnerErrorCode, message: string, recommendedAction: string);
}
export interface ApprovalExecutionBinding {
    approvalId: string;
    sessionId: string;
    subject: string;
    previewSha256: string;
    baselineSha256: string;
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