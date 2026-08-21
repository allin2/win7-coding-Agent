/**
 * @module index
 * @description Agent Core 公共 API 导出入口
 * @remarks 统一导出所有核心模块的公共接口
 */

// 核心类型
export {
  AgentState,
  ApprovalLevel,
  PolicyVerdict,
  TaskLifecycle,
  ToolCall,
  PolicyDecision,
  CapabilityToken,
  CapabilityBinding,
  StateTransition,
} from './types';

export {
  bindCapabilityToToolCall,
  fingerprintToolCall,
} from './approval-binding';

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
  PolicyFacts,
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

export {
  ContextItemKind,
  ContextItem,
  ContextBudget,
  ContextManifestEntry,
  ContextOmission,
  ContextManifest,
  BuiltContext,
  ContextBuildMetadata,
  ContextProtection,
  ContextPlacement,
  ContextProtectedBudgetError,
  ContextManager,
} from './context-manager';

export {
  ToolObservation,
  createToolObservation,
  foldToolObservation,
} from './tool-observation';

export {
  AgentsDiscoveryInput,
  discoverAgentsRules,
} from './agents-discovery';

export {
  RuntimeEnvironmentSnapshot,
  ContextBootstrapInput,
  buildInitialContext,
} from './context-bootstrap';

export {
  TokenEstimateSource,
  TokenEstimate,
  estimateContextTokens,
} from './token-estimator';

export {
  UPDATE_PLAN_TOOL_NAME,
  WorkingMemoryConstraint,
  WorkingMemorySnapshot,
  WorkingMemoryUpdate,
  WorkingMemory,
  createUpdatePlanToolSpec,
  normalizeUpdatePlanCall,
} from './working-memory';

export {
  WorkspaceReadOnlyPort,
  workspaceReadOnlyToolSpecs,
  registerWorkspaceReadOnlyTools,
  WorkspaceReadOnlyToolExecutor,
} from './workspace-readonly-tools';

export {
  ContextCompactionInput,
  ContextCompactor,
  createDeterministicContextCompactor,
} from './context-compactor';

export {
  ToolInputType,
  ToolInputValue,
  ToolCapability,
  ToolInputProperty,
  ToolInputSchema,
  ToolSpec,
  ToolRegistry,
} from './tools';

export {
  workspaceToolSpecs,
  registerWorkspaceTools,
} from './workspace-tools';

export {
  reviewToolSpecs,
  registerReviewTools,
} from './review-tools';

export {
  VerificationRequirement,
  TaskAcceptance,
  VerificationEvidence,
  EvidenceBundle,
  VerificationGate,
} from './verification';

export {
  TurnOutcome,
  TurnBudget,
  TurnUsage,
  BudgetExceededReason,
  DEFAULT_TURN_BUDGET,
  validateTurnBudget,
  checkTurnBudget,
  LoopDetector,
} from './loop-control';

export {
  ModelRetryAction,
  MODEL_RETRY_POLICY,
  ModelRetryClassifier,
  classifyModelRetry,
} from './model-retry';

export {
  RuntimeMessage,
  RuntimeRequest,
  PlannedToolCall,
  RuntimeModelUsage,
  RuntimePlan,
  RuntimeModelInput,
  RuntimeContextUsage,
  RuntimeModel,
  ToolExecutionStatus,
  ToolCancellationResult,
  ToolExecutionResult,
  RuntimeToolExecutionContext,
  RuntimeToolExecutor,
  ToolCallPreparationPort,
  RuntimeVerificationProvider,
  RuntimeEvent,
  RuntimeEventSink,
  RuntimeEventReceipt,
  RuntimeMessageProjector,
  RuntimeStorageFailureStage,
  ModelRetryConfig,
  RuntimeContextCompaction,
  RuntimeDependencies,
  RuntimeResult,
  RuntimeCheckpoint,
  AgentRuntime,
} from './runtime';

export {
  RuntimeRunner,
  RuntimeEventSubscription,
  RuntimeEventSource,
  RuntimeSessionSafetyPort,
  RuntimeSessionSafetyEvidence,
  RuntimeProtocolResult,
  RuntimeSubmission,
  RuntimeCancelAcknowledgement,
  AgentRuntimeProtocol,
} from './runtime-protocol';
