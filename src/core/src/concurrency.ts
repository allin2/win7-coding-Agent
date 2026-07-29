/**
 * @module concurrency
 * @description Agent Core 并发配额管理 — 执行槽与同工作区写串行锁
 * @remarks 默认并发上限 2（PERFORMANCE_BUDGET #9）；超限排队不丢弃
 */

import { concurrencyLimitError, workspaceWriteLockError } from './errors';

/**
 * 并发使用量快照
 */
export interface ConcurrencyUsage {
  /** 当前活跃任务数 */
  active: number;
  /** 并发上限 */
  limit: number;
  /** 排队中的任务 ID 列表 */
  queue: string[];
}

/**
 * 执行槽获取结果
 */
export interface AcquireResult {
  /** 是否成功获取 */
  granted: boolean;
  /** 排队位置（超限时返回，0-based） */
  position?: number;
}

/**
 * ConcurrencyManager 类 — 并发配额与工作区写锁管理
 */
export class ConcurrencyManager {
  /** 并发上限 */
  private readonly limit: number;
  /** 当前活跃任务集合 */
  private readonly activeTasks: Set<string> = new Set();
  /** 排队任务队列（FIFO） */
  private readonly waitQueue: string[] = [];
  /** 工作区写锁：workspacePath -> taskId */
  private readonly writeLocks: Map<string, string> = new Map();

  /**
   * 创建并发管理器
   * @param limit - 并发上限，默认 2
   */
  constructor(limit: number = 2) {
    this.limit = limit;
  }

  /**
   * 获取执行槽
   * @param taskId - 任务 ID
   * @returns 获取结果（成功或排队位置）
   */
  acquire(taskId: string): AcquireResult {
    // 已在活跃集合中，幂等返回
    if (this.activeTasks.has(taskId)) {
      return { granted: true };
    }

    // 有可用槽位
    if (this.activeTasks.size < this.limit) {
      this.activeTasks.add(taskId);
      return { granted: true };
    }

    // 超限：排队等待
    if (!this.waitQueue.includes(taskId)) {
      this.waitQueue.push(taskId);
    }
    return {
      granted: false,
      position: this.waitQueue.indexOf(taskId),
    };
  }

  /**
   * 释放执行槽
   * @param taskId - 任务 ID
   * @remarks 释放后自动将队列首个任务提升为活跃
   */
  release(taskId: string): void {
    this.activeTasks.delete(taskId);

    // 从队列中移除（如果存在）
    const queueIdx = this.waitQueue.indexOf(taskId);
    if (queueIdx !== -1) {
      this.waitQueue.splice(queueIdx, 1);
    }

    // 自动提升队列首个任务
    if (this.activeTasks.size < this.limit && this.waitQueue.length > 0) {
      const nextTaskId = this.waitQueue.shift()!;
      this.activeTasks.add(nextTaskId);
    }
  }

  /**
   * 获取当前使用量快照
   * @returns 使用量信息
   */
  getUsage(): ConcurrencyUsage {
    return {
      active: this.activeTasks.size,
      limit: this.limit,
      queue: [...this.waitQueue],
    };
  }

  /**
   * 获取工作区写锁
   * @param workspacePath - 工作区路径（支持中文路径 C10）
   * @param taskId - 请求锁的任务 ID
   * @returns 是否成功获取锁
   * @throws AgentError(WORKSPACE_WRITE_LOCK) 锁已被其他任务持有时抛出
   */
  acquireWriteLock(workspacePath: string, taskId: string): boolean {
    const normalizedPath = this.normalizePath(workspacePath);
    const holder = this.writeLocks.get(normalizedPath);

    // 无锁或同一任务持有
    if (!holder || holder === taskId) {
      this.writeLocks.set(normalizedPath, taskId);
      return true;
    }

    // 锁已被其他任务持有
    throw workspaceWriteLockError(
      `工作区 ${workspacePath} 的写锁已被任务 ${holder} 持有`,
    );
  }

  /**
   * 释放工作区写锁
   * @param workspacePath - 工作区路径
   * @param taskId - 持有锁的任务 ID
   * @remarks 仅锁持有者可释放
   */
  releaseWriteLock(workspacePath: string, taskId: string): void {
    const normalizedPath = this.normalizePath(workspacePath);
    const holder = this.writeLocks.get(normalizedPath);
    if (holder === taskId) {
      this.writeLocks.delete(normalizedPath);
    }
  }

  /**
   * 检查工作区是否被锁定
   * @param workspacePath - 工作区路径
   * @returns 是否被锁定
   */
  isWriteLocked(workspacePath: string): boolean {
    const normalizedPath = this.normalizePath(workspacePath);
    return this.writeLocks.has(normalizedPath);
  }

  /**
   * 路径规范化 — 统一大小写（Win7 兼容）
   * @param p - 原始路径
   * @returns 规范化后的路径
   */
  private normalizePath(p: string): string {
    // Win7 文件系统不区分大小写，统一转小写
    return p.toLowerCase().replace(/\\/g, '/');
  }
}

/**
 * 创建默认并发管理器
 * @param limit - 并发上限，默认 2
 * @returns ConcurrencyManager 实例
 */
export function createConcurrencyManager(limit?: number): ConcurrencyManager {
  return new ConcurrencyManager(limit);
}
