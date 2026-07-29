/**
 * @module index
 * @description Agent Core 公共 API 导出入口
 * @remarks 统一导出所有核心模块的公共接口
 */

// 核心类型
export {
  AgentState,
  ApprovalLevel,
  TaskLifecycle,
  ToolCall,
  PolicyDecision,
  CapabilityToken,
  StateTransition,
} from './types';

// 错误定义
export {
  AgentErrorCode,
  AgentError,
  containmentUnavailableError,
  policyDeniedError,
  approvalRequiredError,
  concurrencyLimitError,
  workspaceWriteLockError,
  invalidStateTransitionError,
  capabilityRevokedError,
} from './errors';

// 状态机
export {
  TransitionTrigger,
  transition,
  canTransition,
  getAvailableTransitions,
  getAvailableTriggers,
  isTerminalState,
} from './state-machine';

// Policy 引擎
export {
  PolicyEngine,
  PolicyEngineConfig,
  createPolicyEngine,
} from './policy';

// 能力令牌管理
export {
  CapabilityBroker,
  TokenValidationResult,
  createBroker,
} from './broker';

// 并发管理
export {
  ConcurrencyManager,
  ConcurrencyUsage,
  AcquireResult,
  createConcurrencyManager,
} from './concurrency';

// 上下文管理
export {
  AgentContext,
  createContext,
  getContext,
  destroyContext,
  getAllContexts,
  clearAllContexts,
} from './context';
