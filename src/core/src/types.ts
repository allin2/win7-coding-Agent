/**
 * @module types
 * @description Agent Core 核心类型定义 — 状态机、任务生命周期、工具调用与能力令牌
 */

/**
 * AgentState 枚举 — 任务生命周期状态
 * @remarks 继承 Phase 2 §3 语义，定义任务从创建到终结的完整状态空间
 */
export enum AgentState {
  /** 空闲态：等待任务分配 */
  IDLE = 'idle',
  /** 规划态：正在生成执行计划 */
  PLANNING = 'planning',
  /** 等待审批：计划已提交，等待用户确认 */
  AWAITING_APPROVAL = 'awaiting_approval',
  /** 执行态：正在执行已批准的计划 */
  EXECUTING = 'executing',
  /** 验证态：执行结束，等待证据门裁决 */
  VERIFYING = 'verifying',
  /** 暂停态：执行被暂停（用户干预或资源限制） */
  PAUSED = 'paused',
  /** 完成态：任务成功完成 */
  COMPLETED = 'completed',
  /** 失败态：任务执行失败 */
  FAILED = 'failed',
  /** 取消态：任务被用户或系统取消 */
  CANCELLED = 'cancelled',
}

/**
 * TaskLifecycle 接口 — 任务完整生命周期记录
 */
export interface TaskLifecycle {
  /** 任务唯一标识 */
  taskId: string;
  /** 会话唯一标识 */
  sessionId: string;
  /** 当前状态 */
  state: AgentState;
  /** 创建时间（ISO 8601） */
  createdAt: string;
  /** 最后更新时间（ISO 8601） */
  updatedAt: string;
  /** 扩展元数据 */
  metadata: Record<string, unknown>;
}

/**
 * ToolCall 接口 — 结构化工具调用
 * @remarks 结构化 argv，绝不拼接 shell 字符串（C09 约束）
 */
export interface ToolCall {
  /** 调用唯一标识 */
  id: string;
  /** 工具名称（必须在白名单内） */
  toolName: string;
  /** 结构化参数；普通字符串可包含 shell 元字符，因为不会经 shell 解释 */
  args: Record<string, unknown>;
  /** 审批级别（ADR-0030 三档） */
  approvalLevel: ApprovalLevel;
  /**
   * 写操作审批上下文。预览或工作区基线变化时，原令牌必须失效。
   * READ_ONLY 调用不得依赖此字段。
   */
  approvalContext?: {
    previewSha256: string;
    baselineSha256: string;
    /** Trusted single-file write plan identity, when applicable. */
    planId?: string;
    planHash?: string;
  };
}

export enum ApprovalLevel {
  /** 只读操作：无需审批 */
  READ_ONLY = 'read_only',
  /** Review 模式：工作区写操作需要复核/能力令牌 */
  REVIEW = 'review',
  /** 历史工作区写入别名（向后兼容） */
  WORKSPACE_WRITE = 'workspace_write',
  /** Full Access 模式：可信工作区直接执行 */
  FULL_ACCESS = 'full_access',
}

/**
 * A9 PermissionMode 枚举 — 三种产品权限模式（PRD §2 A9-M01 / ADR-0089）
 */
export enum PermissionMode {
  FULL_ACCESS = 'full_access',
  REVIEW = 'review',
  READ_ONLY = 'read_only',
}

/**
 * 规范化权限模式输入
 */
export function normalizePermissionMode(input: unknown): PermissionMode {
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'full_access' || normalized === 'fullaccess') return PermissionMode.FULL_ACCESS;
    if (normalized === 'review') return PermissionMode.REVIEW;
    if (normalized === 'read_only' || normalized === 'readonly') return PermissionMode.READ_ONLY;
  }
  return PermissionMode.FULL_ACCESS;
}

/**
 * PolicyDecision 接口 — Policy 引擎裁决结果
 */
export interface PolicyDecision {
  /** Explicit outcome; `allowed` remains a compatibility projection. */
  verdict: PolicyVerdict;
  /** 是否允许执行 */
  allowed: boolean;
  /** Stable machine-readable rule identifier for audit and UI routing. */
  ruleId: string;
  /** 审批级别 */
  level: ApprovalLevel;
  /** 裁决原因说明 */
  reason?: string;
  /** 附加条件列表 */
  conditions?: string[];
}

/** Policy outcomes are distinct from transport/approval errors. */
export enum PolicyVerdict {
  ALLOW = 'allow',
  ASK = 'ask',
  DENY = 'deny',
}

/**
 * CapabilityToken 接口 — 能力令牌
 * @remarks 用于授权特定会话的工具调用能力
 */
export interface CapabilityToken {
  /** 令牌唯一标识 */
  tokenId: string;
  /** 关联会话标识 */
  sessionId: string;
  /** 授权的能力列表 */
  capabilities: string[];
  /** 过期时间（ISO 8601） */
  expiresAt: string;
  /** 是否已撤销 */
  revoked: boolean;
  /** workspace_write 令牌必须精确绑定到一次 ToolCall。 */
  binding?: CapabilityBinding;
}

/** 能力令牌与具体写请求的不可变绑定。 */
export interface CapabilityBinding {
  callId: string;
  toolName: string;
  requestSha256: string;
  previewSha256: string;
  baselineSha256: string;
}

/**
 * StateTransition 接口 — 状态转移记录
 */
export interface StateTransition {
  /** 源状态 */
  from: AgentState;
  /** 目标状态 */
  to: AgentState;
  /** 触发转移的事件名称 */
  trigger: string;
  /** 转移发生时间（ISO 8601） */
  timestamp: string;
  /** 转移附加元数据 */
  metadata?: Record<string, unknown>;
}
