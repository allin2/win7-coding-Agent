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
  /** 进程退出码 */
  exitCode: number;
  /** 标准输出 */
  stdout: string;
  /** 标准错误输出 */
  stderr: string;
  /** 执行的命令名 */
  command: string;
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
}
