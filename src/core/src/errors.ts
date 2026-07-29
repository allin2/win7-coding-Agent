/**
 * @module errors
 * @description Agent Core 结构化错误码定义（per PHASE_06 §5）
 * @remarks 所有错误必须结构化输出，不静默吞异常（C 约束）
 */

/**
 * AgentErrorCode 枚举 — Agent Core 错误码
 */
export enum AgentErrorCode {
  /** 沙箱/容器不可用（Win7 环境 containment 失败） */
  CONTAINMENT_UNAVAILABLE = 'CONTAINMENT_UNAVAILABLE',
  /** Policy 引擎拒绝操作 */
  POLICY_DENIED = 'POLICY_DENIED',
  /** 操作需要用户审批 */
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  /** 并发配额已达上限 */
  CONCURRENCY_LIMIT = 'CONCURRENCY_LIMIT',
  /** 工作区写锁冲突 */
  WORKSPACE_WRITE_LOCK = 'WORKSPACE_WRITE_LOCK',
  /** 非法状态转移 */
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  /** 能力令牌已撤销 */
  CAPABILITY_REVOKED = 'CAPABILITY_REVOKED',
}

/**
 * AgentError 类 — Agent Core 结构化错误
 * @remarks 继承 Error，携带错误码和上下文信息
 */
export class AgentError extends Error {
  /** 错误码 */
  public readonly code: AgentErrorCode;
  /** 错误上下文信息 */
  public readonly context: Record<string, unknown>;

  /**
   * 创建 AgentError 实例
   * @param code - 错误码
   * @param message - 错误描述
   * @param context - 附加上下文
   */
  constructor(code: AgentErrorCode, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.context = context;
    // 确保 instanceof 正确（TypeScript 编译目标 ES2020）
    Object.setPrototypeOf(this, AgentError.prototype);
  }

  /**
   * 序列化为结构化 JSON 对象
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

/**
 * 创建 CONTAINMENT_UNAVAILABLE 错误
 * @param detail - 详细信息
 */
export function containmentUnavailableError(detail: string): AgentError {
  return new AgentError(AgentErrorCode.CONTAINMENT_UNAVAILABLE, detail);
}

/**
 * 创建 POLICY_DENIED 错误
 * @param detail - 详细信息
 * @param context - 附加上下文
 */
export function policyDeniedError(detail: string, context: Record<string, unknown> = {}): AgentError {
  return new AgentError(AgentErrorCode.POLICY_DENIED, detail, context);
}

/**
 * 创建 APPROVAL_REQUIRED 错误
 * @param detail - 详细信息
 */
export function approvalRequiredError(detail: string): AgentError {
  return new AgentError(AgentErrorCode.APPROVAL_REQUIRED, detail);
}

/**
 * 创建 CONCURRENCY_LIMIT 错误
 * @param detail - 详细信息
 * @param context - 附加上下文
 */
export function concurrencyLimitError(detail: string, context: Record<string, unknown> = {}): AgentError {
  return new AgentError(AgentErrorCode.CONCURRENCY_LIMIT, detail, context);
}

/**
 * 创建 WORKSPACE_WRITE_LOCK 错误
 * @param detail - 详细信息
 */
export function workspaceWriteLockError(detail: string): AgentError {
  return new AgentError(AgentErrorCode.WORKSPACE_WRITE_LOCK, detail);
}

/**
 * 创建 INVALID_STATE_TRANSITION 错误
 * @param detail - 详细信息
 * @param context - 附加上下文
 */
export function invalidStateTransitionError(detail: string, context: Record<string, unknown> = {}): AgentError {
  return new AgentError(AgentErrorCode.INVALID_STATE_TRANSITION, detail, context);
}

/**
 * 创建 CAPABILITY_REVOKED 错误
 * @param detail - 详细信息
 */
export function capabilityRevokedError(detail: string): AgentError {
  return new AgentError(AgentErrorCode.CAPABILITY_REVOKED, detail);
}
