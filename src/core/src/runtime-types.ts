import { ContextBudget, ContextItem, ContextManager, ContextManifest } from './context-manager';
import { ContextBootstrapInput } from './context-bootstrap';
import { ContextCompactor } from './context-compactor';
import { AgentError } from './errors';
import {
  BudgetExceededReason,
  TurnBudget,
  TurnOutcome,
  TurnUsage,
} from './loop-control';
import { PolicyEngine } from './policy';
import { ModelRetryClassifier } from './model-retry';
import { ToolRegistry, ToolSpec } from './tools';
import { ToolObservation } from './tool-observation';
import { WorkingMemorySnapshot } from './working-memory';
import { AgentState, ToolCall } from './types';
import {
  EvidenceBundle,
  TaskAcceptance,
  VerificationEvidence,
  VerificationGate,
  VerificationRequirement,
} from './verification';

export interface RuntimeMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  observation?: ToolObservation;
}

export interface RuntimeRequest {
  sessionId: string;
  threadId: string;
  turnId: string;
  taskId: string;
  runId: string;
  prompt: string;
  /** Product execution contract. Plan mode suspends before the first tool call. */
  executionMode?: 'direct' | 'plan';
  /** Required when resuming a plan-mode checkpoint; the original plan is never regenerated. */
  planApprovalDecision?: 'approved' | 'rejected';
  /** Trusted completion contract supplied by the orchestration boundary. */
  acceptance: TaskAcceptance;
  /** Additional explicit context; prefer contextBootstrap for a new Turn. */
  contextItems?: ContextItem[];
  contextBootstrap?: ContextBootstrapInput;
  contextBudget: ContextBudget;
  turnBudget?: Partial<TurnBudget>;
  /** Legacy fallback only when no event-backed message projector is configured. */
  previousMessages?: RuntimeMessage[];
  tokenIdsByCallId?: Record<string, string>;
  /** Cancel the current Turn without destroying the containing Thread. */
  abortSignal?: AbortSignal;
  /** Resume an approved step without asking the model to recreate it. */
  approvedPlan?: RuntimePlan;
  /** Context digest that was shown together with approvedPlan. */
  approvedContextDigestSha256?: string;
  /** Preferred crash-safe resume contract for an approval suspension. */
  resumeCheckpoint?: RuntimeCheckpoint;
  /** Explicit user rejection of one pending approval; reason is fed back as a ToolResult. */
  approvalRejection?: {
    callId: string;
    reason: string;
  };
}

export interface PlannedToolCall {
  call: ToolCall;
}

export interface RuntimeModelUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * One model Step response. A response with toolCalls continues the loop; a
 * response without toolCalls is the model's final answer for this Turn.
 */
export interface RuntimePlan {
  schemaVersion: '1.0';
  summary: string;
  finalResponse?: string;
  toolCalls: PlannedToolCall[];
  verificationRequirements: VerificationRequirement[];
  usage?: RuntimeModelUsage;
}

export interface RuntimeModelInput {
  /** Safe run IDs only; raw context and approval tokens never cross this boundary. */
  run: Pick<RuntimeRequest, 'sessionId' | 'threadId' | 'turnId' | 'taskId' | 'runId'>;
  context: ContextManifest;
  messages: RuntimeMessage[];
  tools: ToolSpec[];
  contextUsage: RuntimeContextUsage;
  step: number;
  attempt: number;
  toolChoice: 'auto' | 'none';
  finalizeReason?: BudgetExceededReason;
  signal: AbortSignal;
}

export interface RuntimeContextUsage {
  projectedInputTokens: number;
  highWatermarkTokens: number;
  outputReserveTokens: number;
  modelWindowTokens?: number;
  compactedBeforeCall: boolean;
}

export interface RuntimeModel {
  createPlan(input: RuntimeModelInput): Promise<RuntimePlan>;
}

export type ToolExecutionStatus = 'succeeded' | 'failed' | 'denied' | 'cancelled';

export interface ToolCancellationResult {
  terminationRequested: boolean;
  cleanupComplete: boolean;
  detail?: string;
}

export interface ToolExecutionResult {
  callId: string;
  toolName: string;
  success: boolean;
  status: ToolExecutionStatus;
  output?: unknown;
  error?: string;
  cancellation?: ToolCancellationResult;
}

export interface RuntimeToolExecutionContext {
  signal: AbortSignal;
  deadlineMs: number;
  sessionId: string;
  threadId: string;
  turnId: string;
  runId: string;
}

export interface RuntimeToolExecutor {
  execute(
    spec: ToolSpec,
    call: ToolCall,
    context: RuntimeToolExecutionContext,
  ): Promise<ToolExecutionResult>;
  /**
   * The Win7 Runner implementation must terminate and reap the complete Job
   * Object process tree. Core does not emulate containment with taskkill.
   */
  cancel?(
    call: ToolCall,
    reason: 'user_cancelled' | 'wall_budget_exceeded',
  ): Promise<ToolCancellationResult>;
}

/**
 * Trusted preparation boundary for side-effecting tool calls. The model may
 * propose only intent; this port may replace the call with a trusted,
 * hash-bound call and return bounded approval material for the UI.
 */
export interface ToolCallPreparationPort {
  prepare(input: {
    request: RuntimeRequest;
    call: ToolCall;
    spec: ToolSpec;
    signal: AbortSignal;
  }): Promise<{
    call: ToolCall;
    preparation?: unknown;
  }>;
}

export interface RuntimeVerificationProvider {
  collect(input: {
    request: RuntimeRequest;
    plan: RuntimePlan;
    acceptance: TaskAcceptance;
    toolResults: ToolExecutionResult[];
    signal: AbortSignal;
    deadlineMs: number;
  }): Promise<VerificationEvidence[]>;
}

export interface RuntimeEvent {
  schemaVersion: '1.0';
  sequence: number;
  type:
    | 'turn.started'
    | 'turn.suspended'
    | 'turn.resumed'
    | 'turn.finished'
    | 'step.started'
    | 'step.retry'
    | 'step.completed'
    | 'state.transition'
    | 'model.plan'
    | 'approval.requested'
    | 'approval.resolved'
    | 'policy.decision'
    | 'tool.request'
    | 'tool.result'
    | 'budget.exceeded'
    | 'compaction.applied'
    | 'working_memory.updated'
    | 'verification.bundle'
    | 'verification.feedback'
    | 'runtime.error';
  timestamp: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  taskId: string;
  runId: string;
  payload: unknown;
}

export interface RuntimeEventSink {
  append(event: RuntimeEvent): void | RuntimeEventReceipt | Promise<void | RuntimeEventReceipt>;
}

export interface RuntimeEventReceipt {
  /** Canonical State V2 Thread sequence. */
  readonly seq?: number;
  /** Compatibility spelling for other durable stores. */
  readonly sequence?: number;
}

/** Event-backed projection port. State V2 implements this without a Core dependency. */
export interface RuntimeMessageProjector {
  projectMessages(input: {
    sessionId: string;
    threadId: string;
    turnId: string;
    runId: string;
    upToSequence?: number;
  }): readonly unknown[];
}

export type RuntimeStorageFailureStage =
  | 'startup'
  | 'running'
  | 'finalizing';

export interface ModelRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
}

export interface RuntimeContextCompaction {
  readonly messages: readonly RuntimeMessage[];
  readonly compactionId: string;
  readonly replacedSeqRange: { readonly fromSeq: number; readonly toSeq: number };
  readonly summary: unknown;
  readonly supersedesCompactionIds?: readonly string[];
}

export interface RuntimeDependencies {
  model: RuntimeModel;
  tools: ToolRegistry;
  executor: RuntimeToolExecutor;
  toolCallPreparation?: ToolCallPreparationPort;
  policy: PolicyEngine;
  verifier: RuntimeVerificationProvider;
  verificationGate: VerificationGate;
  events: RuntimeEventSink;
  /** When present, this projection is authoritative over request/checkpoint message snapshots. */
  messageProjector?: RuntimeMessageProjector;
  contextManager?: ContextManager;
  modelRetry?: Partial<ModelRetryConfig>;
  /** Classifies structured Gateway/model failures; unknown errors fail closed. */
  modelRetryClassifier?: ModelRetryClassifier;
  /** Explicit context-overflow recovery; absence makes overflow non-retriable. */
  compactContext?: (input: {
    request: RuntimeRequest;
    messages: readonly RuntimeMessage[];
    error: unknown;
    lastEventSequence?: number;
    targetSummaryChars?: number;
  }) => Promise<RuntimeContextCompaction>;
  loopDetectorThreshold?: number;
  toolCancelGraceMs?: number;
  now?: () => Date;
  monotonicMs?: () => number;
}

export interface RuntimeResult {
  state: AgentState;
  outcome: TurnOutcome;
  context: ContextManifest;
  /** True only when the result/suspension event was durably accepted. */
  traceComplete: boolean;
  /** Identifies the event persistence phase that broke the complete trace. */
  storageFailureStage?: RuntimeStorageFailureStage;
  /** Kept separate so a finalization-only failure does not rewrite outcome. */
  eventStoreError?: AgentError;
  plan?: RuntimePlan;
  finalResponse?: string;
  summary?: string;
  checkpoint?: RuntimeCheckpoint;
  toolResults: ToolExecutionResult[];
  usage: TurnUsage;
  evidenceBundle?: EvidenceBundle;
  error?: AgentError;
}

export interface RuntimeCheckpoint {
  schemaVersion: '2.0';
  sessionId: string;
  threadId: string;
  turnId: string;
  taskId: string;
  runId: string;
  contextDigestSha256: string;
  /** Canonical State V2 sequence through which messages must be projected. */
  lastEventSequence: number;
  /** Core Run-local sequence used only to continue deterministic Runtime event IDs. */
  lastRuntimeSequence: number;
  budget: TurnBudget;
  pendingPlan: RuntimePlan;
  /** Distinguishes product execution-plan consent from a tool-level write approval. */
  approvalKind?: 'execution_plan' | 'tool';
  usage: TurnUsage;
  verificationRequirements: VerificationRequirement[];
  workingMemory?: WorkingMemorySnapshot;
}

export const DEFAULT_MODEL_RETRY: Readonly<ModelRetryConfig> = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 100,
});

export interface RuntimeStorageFailure {
  stage: RuntimeStorageFailureStage;
  error: AgentError;
}

export type InterruptCause = 'user_cancelled' | 'wall_budget_exceeded';

export class TurnInterrupted extends Error {
  constructor(readonly cause: InterruptCause) {
    super(cause);
    this.name = 'TurnInterrupted';
  }
}

export interface VerificationFeedback {
  schemaVersion: '1.0';
  gateId: string;
  attempt: number;
  maxAttempts: 3;
  evidenceDigestSha256: string;
  failures: string[];
  content: string;
}
