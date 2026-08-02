/**
 * @module context
 * @description Agent Core 上下文管理 — 会话级 AgentContext 生命周期
 * @remarks 持有当前 session、task、state、capabilities 的聚合上下文
 */

import { AgentState, TaskLifecycle, CapabilityToken } from './types';
import { AgentState as StateEnum } from './types';

/**
 * AgentContext 类 — 会话级上下文聚合器
 * @remarks 管理单个会话的状态、任务、能力令牌等上下文信息
 */
export class AgentContext {
  /** 会话 ID */
  public readonly sessionId: string;
  /** 当前状态 */
  private _state: AgentState;
  /** 当前任务 */
  private _task: TaskLifecycle | null;
  /** 有效能力令牌列表 */
  private _capabilities: CapabilityToken[];
  /** 上下文创建时间 */
  public readonly createdAt: string;
  /** 上下文最后活跃时间 */
  private _lastActiveAt: string;

  /**
   * 创建 AgentContext 实例
   * @param sessionId - 会话 ID
   */
  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this._state = StateEnum.IDLE;
    this._task = null;
    this._capabilities = [];
    this.createdAt = new Date().toISOString();
    this._lastActiveAt = this.createdAt;
  }

  /**
   * 获取当前状态
   */
  get state(): AgentState {
    return this._state;
  }

  /**
   * 设置当前状态
   */
  set state(newState: AgentState) {
    this._state = newState;
    this._lastActiveAt = new Date().toISOString();
  }

  /**
   * 获取当前任务
   */
  get task(): TaskLifecycle | null {
    return this._task;
  }

  /**
   * 设置当前任务
   */
  set task(newTask: TaskLifecycle | null) {
    this._task = newTask;
    this._lastActiveAt = new Date().toISOString();
  }

  /**
   * 获取能力令牌列表
   */
  get capabilities(): CapabilityToken[] {
    return [...this._capabilities];
  }

  /**
   * 添加能力令牌
   * @param token - 令牌对象
   */
  addCapability(token: CapabilityToken): void {
    this._capabilities.push(token);
    this._lastActiveAt = new Date().toISOString();
  }

  /**
   * 移除能力令牌
   * @param tokenId - 令牌 ID
   */
  removeCapability(tokenId: string): void {
    this._capabilities = this._capabilities.filter((t) => t.tokenId !== tokenId);
    this._lastActiveAt = new Date().toISOString();
  }

  /**
   * 获取最后活跃时间
   */
  get lastActiveAt(): string {
    return this._lastActiveAt;
  }

  /**
   * 检查上下文是否活跃
   * @param timeoutMs - 超时阈值（毫秒），默认 30 分钟
   * @returns 是否活跃
   */
  isActive(timeoutMs: number = 1800000): boolean {
    return Date.now() - new Date(this._lastActiveAt).getTime() < timeoutMs;
  }

  /**
   * 重置上下文到初始状态
   */
  reset(): void {
    this._state = StateEnum.IDLE;
    this._task = null;
    this._capabilities = [];
    this._lastActiveAt = new Date().toISOString();
  }
}

/**
 * 全局上下文注册表
 */
const contextRegistry: Map<string, AgentContext> = new Map();

/**
 * 创建会话上下文
 * @param sessionId - 会话 ID
 * @returns 创建的上下文
 */
export function createContext(sessionId: string): AgentContext {
  const ctx = new AgentContext(sessionId);
  contextRegistry.set(sessionId, ctx);
  return ctx;
}

/**
 * 获取会话上下文
 * @param sessionId - 会话 ID
 * @returns 上下文或 undefined
 */
export function getContext(sessionId: string): AgentContext | undefined {
  return contextRegistry.get(sessionId);
}

/**
 * 销毁会话上下文
 * @param sessionId - 会话 ID
 */
export function destroyContext(sessionId: string): void {
  contextRegistry.delete(sessionId);
}

/**
 * 获取所有活跃上下文
 * @returns 上下文列表
 */
export function getAllContexts(): AgentContext[] {
  return Array.from(contextRegistry.values());
}

/**
 * 清空所有上下文
 */
export function clearAllContexts(): void {
  contextRegistry.clear();
}
