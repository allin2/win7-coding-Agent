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
  /** 结构化参数，禁止包含 shell 元字符 */
  args: Record<string, unknown>;
  /** 审批级别（ADR-0030 三档） */
  approvalLevel: ApprovalLevel;
}

/**
 * ApprovalLevel 枚举 — 工具调用审批级别（ADR-0030）
 * @remarks FULL_ACCESS 明令不做，保留用于拒绝场景
 */
export enum ApprovalLevel {
  /** 只读操作：无需审批 */
  READ_ONLY = 'read_only',
  /** 工作区写操作：需要能力令牌验证 */
  WORKSPACE_WRITE = 'workspace_write',
  /** 完全访问：ADR-0030 明令不做，始终拒绝 */
  FULL_ACCESS = 'full_access',
}

/**
 * PolicyDecision 接口 — Policy 引擎裁决结果
 */
export interface PolicyDecision {
  /** 是否允许执行 */
  allowed: boolean;
  /** 审批级别 */
  level: ApprovalLevel;
  /** 裁决原因说明 */
  reason?: string;
  /** 附加条件列表 */
  conditions?: string[];
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
