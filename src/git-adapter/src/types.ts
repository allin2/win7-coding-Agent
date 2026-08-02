/**
 * @module git-adapter/types
 * @description Git Adapter 类型定义 — 命令分类、命令定义、执行请求与结果
 */

/**
 * Git 命令分类
 * @remarks 用于白名单策略和审批决策
 */
export enum GitCommandCategory {
  /** 只读命令（status, diff, log 等） */
  READ = 'read',
  /** 写命令（add, commit 等，需审批） */
  WRITE = 'write',
  /** 网络命令（fetch, push 等，v1 禁止） */
  NETWORK = 'network',
}

/**
 * Git 命令定义
 * @remarks 白名单中每个命令的元数据
 */
export interface GitCommandDef {
  /** Git 命令名（如 'status', 'diff'） */
  command: string;
  /** Git 子命令（如 'list' for 'worktree list'，可为空） */
  subcommand: string;
  /** 命令分类 */
  category: GitCommandCategory;
  /** 是否允许执行 */
  allowed: boolean;
}

/**
 * Git 执行结果
 */
export interface GitResult {
  /** Runner V2 outcome; exit codes are only meaningful for `exited`. */
  status: GitRunnerStatus;
  exitCode: number | null;
  /** 标准输出 */
  stdout: string;
  /** 标准错误输出 */
  stderr: string;
  /** 执行的命令名 */
  command: string;
  /** Compatibility projection for callers which only distinguish total timeout. */
  timedOut: boolean;
  /** 输出是否被截断 */
  truncated: boolean;
  /** 执行时长（毫秒） */
  durationMs: number;
  error?: GitRunnerFailure;
}

export interface GitApprovalBinding {
  approvalId: string;
  sessionId: string;
  subject: string;
  previewSha256: string;
  baselineSha256: string;
}

/**
 * Git 执行请求
 * @remarks 结构化 argv，禁止 shell 拼接
 */
export interface GitRequest {
  /** Git 命令（如 'status', 'log'） */
  command: string;
  /** 结构化参数数组 */
  args: string[];
  /** 工作目录绝对路径 */
  workDir: string;
  /** 超时时间（毫秒，可选） */
  timeout?: number;
  /** 写类命令必须携带的一次性审批绑定 */
  approval?: GitApprovalBinding;
}

export interface GitRunnerRequest {
  command: string;
  args: string[];
  config: {
    timeoutMs: number;
    idleTimeoutMs: number;
    maxStdoutBytes: number;
    maxStderrBytes: number;
    workDir: string;
    envOverlay?: Record<string, string>;
    stdinPolicy: 'closed';
  };
  approvalLevel: 'read_only' | 'workspace_write';
  approval?: GitApprovalBinding;
}

export interface GitRunnerResult {
  schemaVersion: '2.0';
  status: GitRunnerStatus;
  exitCode: number | null;
  stdout: GitCapturedStream;
  stderr: GitCapturedStream;
  durationMs: number;
  termination: {
    requested: boolean;
    processTreeReaped: boolean;
    containment: 'job_object' | 'none';
    detail?: string;
  };
  error?: GitRunnerFailure;
}

export type GitRunnerStatus =
  | 'exited' | 'timeout' | 'idle_timeout' | 'cancelled' | 'spawn_failed'
  | 'rejected' | 'capability_unavailable' | 'cleanup_failed';

export interface GitCapturedStream {
  text: string;
  bytesRead: number;
  bytesRetained: number;
  omittedBytes: number;
  truncated: boolean;
  encoding: 'utf-8' | 'unknown';
  replacementCount: number;
}

export interface GitRunnerFailure {
  code: string;
  message: string;
  recommendedAction: string;
}

/** Immutable, clean Git baseline captured at the start of an Agent session. */
export interface GitSessionBaseline {
  schemaVersion: '1.0';
  sessionId: string;
  workDir: string;
  head: string;
}

export interface GitSessionInspection {
  schemaVersion: '1.0';
  baseline: GitSessionBaseline;
  clean: boolean;
  statusPorcelain: string;
  diffBinary: string;
  untrackedPaths: string[];
  truncated: boolean;
}

export interface GitTrackedRollbackResult {
  schemaVersion: '1.0';
  restoredTrackedFiles: boolean;
  complete: boolean;
  inspection: GitSessionInspection;
  warning?: string;
}

/** Structural port intentionally compatible with @win7-agent/runner IRunner. */
export interface GitRunnerPort {
  execute(request: GitRunnerRequest): Promise<GitRunnerResult>;
}

export enum GitAdapterErrorCode {
  RUNNER_UNAVAILABLE = 'RUNNER_UNAVAILABLE',
  ISOLATION_REQUIRED = 'ISOLATION_REQUIRED',
  COMMAND_DENIED = 'COMMAND_DENIED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  WORKTREE_DIRTY = 'WORKTREE_DIRTY',
  SESSION_BASELINE_INVALID = 'SESSION_BASELINE_INVALID',
  SESSION_OPERATION_FAILED = 'SESSION_OPERATION_FAILED',
}

export class GitAdapterError extends Error {
  constructor(
    public readonly code: GitAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitAdapterError';
    Object.setPrototypeOf(this, GitAdapterError.prototype);
  }
}
