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
  /** 审批令牌与请求、预览、基线或会话不匹配 */
  APPROVAL_INVALID = 'APPROVAL_INVALID',
  /** 并发配额已达上限 */
  CONCURRENCY_LIMIT = 'CONCURRENCY_LIMIT',
  /** 工作区写锁冲突 */
  WORKSPACE_WRITE_LOCK = 'WORKSPACE_WRITE_LOCK',
  /** 非法状态转移 */
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  /** 能力令牌已撤销 */
  CAPABILITY_REVOKED = 'CAPABILITY_REVOKED',
  /** 工具未注册 */
  TOOL_NOT_REGISTERED = 'TOOL_NOT_REGISTERED',
  /** 工具输入不符合 ToolSpec */
  TOOL_INPUT_INVALID = 'TOOL_INPUT_INVALID',
  /** 工具执行失败 */
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  /** 验证证据门失败 */
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  /** 同一验证关卡连续失败达到上限，停止自动修复循环 */
  VERIFICATION_STUCK = 'VERIFICATION_STUCK',
  /** 模型规划失败 */
  MODEL_FAILED = 'MODEL_FAILED',
  /** Turn 的步数、Token、时间或工具调用预算耗尽 */
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  /** 连续重复工具调用触发卡死检测 */
  LOOP_STUCK = 'LOOP_STUCK',
  /** 有副作用工具取消后无法确认进程树或清理完成 */
  CANCELLATION_FAILED = 'CANCELLATION_FAILED',
  /** EventSink 在启动、运行或收尾阶段持久化失败 */
  EVENT_STORE_FAILED = 'EVENT_STORE_FAILED',
  /** Turn 建立前的请求、预算、上下文或 Checkpoint 不合法 */
  RUNTIME_INPUT_INVALID = 'RUNTIME_INPUT_INVALID',
  /** 无法归入模型、工具、验证或存储错误域的编排器内部异常 */
  INTERNAL = 'INTERNAL',
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
  /** 用户可直接执行的恢复建议。 */
  public readonly recommendedAction?: string;

  /**
   * 创建 AgentError 实例
   * @param code - 错误码
   * @param message - 错误描述
   * @param context - 附加上下文
   */
  constructor(
    code: AgentErrorCode,
    message: string,
    context: Record<string, unknown> = {},
    recommendedAction?: string,
  ) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.context = context;
    this.recommendedAction = recommendedAction;
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
      ...(this.recommendedAction ? { recommendedAction: this.recommendedAction } : {}),
    };
  }
}

/**
 * 创建 CONTAINMENT_UNAVAILABLE 错误
 * @param detail - 详细信息
 */
export function containmentUnavailableError(detail: string): AgentError {
  return new AgentError(
    AgentErrorCode.CONTAINMENT_UNAVAILABLE,
    detail,
    {},
    '运行 SPIKE_02/Win7 containment 验证并安装受支持的原生 helper；在此之前仅使用只读能力。',
  );
}

/**
 * 创建 POLICY_DENIED 错误
 * @param detail - 详细信息
 * @param context - 附加上下文
 */
export function policyDeniedError(detail: string, context: Record<string, unknown> = {}): AgentError {
  return new AgentError(
    AgentErrorCode.POLICY_DENIED,
    detail,
    context,
    '检查工具白名单、工作区边界和审批级别；不要改用 Shell 字符串绕过策略。',
  );
}

/**
 * 创建 APPROVAL_REQUIRED 错误
 * @param detail - 详细信息
 */
export function approvalRequiredError(detail: string): AgentError {
  return new AgentError(
    AgentErrorCode.APPROVAL_REQUIRED,
    detail,
    {},
    '查看精确变更预览并显式批准；预览或工作区基线变化后需重新审批。',
  );
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
