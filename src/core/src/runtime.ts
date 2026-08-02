import { performance } from 'perf_hooks';

import { ContextBudget, ContextItem, ContextManager, ContextManifest } from './context-manager';
import { ContextBootstrapInput, buildInitialContext } from './context-bootstrap';
import {
  ContextCompactor,
  createDeterministicContextCompactor,
} from './context-compactor';
import { estimateContextTokens } from './token-estimator';
import { AgentError, AgentErrorCode } from './errors';
import {
  BudgetExceededReason,
  checkTurnBudget,
  DEFAULT_TURN_BUDGET,
  LoopDetector,
  TurnBudget,
  TurnOutcome,
  TurnUsage,
  validateTurnBudget,
} from './loop-control';
import { PolicyEngine } from './policy';
import {
  classifyModelRetry,
  ModelRetryAction,
  ModelRetryClassifier,
} from './model-retry';
import { transition, TransitionTrigger } from './state-machine';
import { ToolRegistry, ToolSpec } from './tools';
import {
  createToolObservation,
  ToolObservation,
} from './tool-observation';
import {
  createUpdatePlanToolSpec,
  normalizeUpdatePlanCall,
  UPDATE_PLAN_TOOL_NAME,
  WorkingMemory,
  WorkingMemorySnapshot,
} from './working-memory';
import { AgentState, ApprovalLevel, PolicyVerdict, ToolCall } from './types';
import {
  EvidenceBundle,
  TaskAcceptance,
  VerificationEvidence,
  VerificationGate,
  VerificationRequirement,
} from './verification';
import {
  DEFAULT_MODEL_RETRY,
  InterruptCause,
  RuntimeCheckpoint,
  RuntimeContextCompaction,
  RuntimeDependencies,
  RuntimeEvent,
  RuntimeMessage,
  RuntimeModel,
  RuntimePlan,
  RuntimeRequest,
  RuntimeResult,
  RuntimeStorageFailure,
  RuntimeStorageFailureStage,
  ModelRetryConfig,
  ToolCancellationResult,
  ToolExecutionResult,
  TurnInterrupted,
} from './runtime-types';
import {
  TurnControl,
  validateTaskAcceptance,
  createVerificationFeedback,
  validatePlan,
  normalizeToolResult,
  cloneMessage,
  cloneToolCall,
  cloneToolSpec,
  projectModelMessages,
  foldStaleToolMessages,
  runMetadata,
  digestToolCatalog,
  estimateProjectedTokens,
  mergeToolCatalog,
  normalizeProjectedMessage,
  raceWithAbort,
  abortableDelay,
  withTimeout,
  errorMessage,
  runtimeInputError,
  runtimeFailure,
  isEventStoreFailure,
} from './runtime-helpers';

// Re-export all runtime types for backward compatibility
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
} from './runtime-types';

import type {
  PlannedToolCall,
  RuntimeModelUsage,
  RuntimeToolExecutionContext,
  RuntimeToolExecutor,
  ToolCallPreparationPort,
  RuntimeVerificationProvider,
  RuntimeEventSink,
  RuntimeEventReceipt,
  RuntimeMessageProjector,
} from './runtime-types';

interface RunVars {
  state: AgentState;
  plan: RuntimePlan | undefined;
  finalResponse: string | undefined;
}

interface FinishOptions {
  error?: AgentError;
  summary?: string;
  evidenceBundle?: EvidenceBundle;
  checkpointPlan?: RuntimePlan;
}

interface RunState {
  vars: RunVars;
  toolResults: ToolExecutionResult[];
  messages: RuntimeMessage[];
  verificationRequirements: VerificationRequirement[];
  verificationFailuresByGate: Map<string, number>;
  verificationFailureHistoryByGate: Map<string, Array<{
    attempt: number;
    evidenceDigestSha256: string;
    failures: string[];
  }>>;
  usage: TurnUsage;
  detector: LoopDetector;
  turnDeadlineMs: number;
  control: TurnControl;
  refreshElapsed: () => void;
}

interface VerificationGateResult {
  action: 'completed' | 'continue' | 'failed';
  result?: RuntimeResult;
}

/**
 * Single-Agent production loop. The model is the only task-level decision
 * maker; Core enforces budgets, policy, approval, cancellation and audit.
 */
export class AgentRuntime {
  private readonly contextManager: ContextManager;
  private readonly now: () => Date;
  private readonly monotonicMs: () => number;
  private readonly retry: ModelRetryConfig;
  private readonly modelRetryClassifier: ModelRetryClassifier;
  private readonly loopDetectorThreshold: number;
  private readonly toolCancelGraceMs: number;
  private readonly compactContext: ContextCompactor;
  private readonly sequenceByRun = new Map<string, number>();
  private readonly acceptedSequenceByRun = new Map<string, number>();
  private readonly storageFailureByRun =
    new Map<string, RuntimeStorageFailure>();
  private runStartedAtMs = 0;
  private runElapsedBeforeResume = 0;

  constructor(private readonly dependencies: RuntimeDependencies) {
    this.contextManager = dependencies.contextManager ?? new ContextManager();
    this.now = dependencies.now ?? (() => new Date());
    this.monotonicMs = dependencies.monotonicMs ?? (() => performance.now());
    this.retry = {
      ...DEFAULT_MODEL_RETRY,
      ...dependencies.modelRetry,
    };
    this.modelRetryClassifier = dependencies.modelRetryClassifier ?? classifyModelRetry;
    if (
      !Number.isInteger(this.retry.maxAttempts) ||
      this.retry.maxAttempts < 1 ||
      !Number.isInteger(this.retry.baseDelayMs) ||
      this.retry.baseDelayMs < 0
    ) {
      throw new TypeError('Invalid model retry configuration');
    }
    this.loopDetectorThreshold = dependencies.loopDetectorThreshold ?? 3;
    this.toolCancelGraceMs = dependencies.toolCancelGraceMs ?? 5_000;
    this.compactContext =
      dependencies.compactContext ?? createDeterministicContextCompactor();
  }

  // ── Extracted private helpers (formerly run() closures) ───────────

  private async transitionState(
    request: RuntimeRequest,
    trigger: TransitionTrigger,
    currentState: AgentState,
    metadata?: Record<string, unknown>,
  ): Promise<AgentState> {
    const stateTransition = transition(currentState, trigger, metadata);
    await this.emit(request, 'state.transition', stateTransition);
    return stateTransition.to;
  }

  private async buildResult(
    request: RuntimeRequest,
    vars: RunVars,
    toolResults: ToolExecutionResult[],
    builtContext: ReturnType<ContextManager['build']>,
    budget: TurnBudget,
    usage: TurnUsage,
    verificationRequirements: VerificationRequirement[],
    workingMemory: WorkingMemory,
    outcome: TurnOutcome,
    options: FinishOptions = {},
  ): Promise<RuntimeResult> {
    usage.elapsedMs =
      this.runElapsedBeforeResume + Math.max(0, this.monotonicMs() - this.runStartedAtMs);
    const resumeCheckpoint = options.checkpointPlan
      ? {
        schemaVersion: '2.0' as const,
        sessionId: request.sessionId,
        threadId: request.threadId,
        turnId: request.turnId,
        taskId: request.taskId,
        runId: request.runId,
        contextDigestSha256: builtContext.manifest.digestSha256,
        lastEventSequence: this.acceptedSequenceByRun.get(request.runId) ?? 0,
        lastRuntimeSequence: (this.sequenceByRun.get(request.runId) ?? 0) + 1,
        budget: { ...budget },
        pendingPlan: options.checkpointPlan,
        usage: { ...usage },
        verificationRequirements: verificationRequirements.map((requirement) => ({ ...requirement })),
        workingMemory: workingMemory.snapshot(),
      }
      : undefined;
    const eventType = outcome === TurnOutcome.NEEDS_APPROVAL
      ? 'turn.suspended'
      : 'turn.finished';
    const persistenceStage: RuntimeStorageFailureStage =
      outcome === TurnOutcome.NEEDS_APPROVAL ? 'running' : 'finalizing';
    try {
      await this.emit(request, eventType, {
        outcome,
        state: vars.state,
        usage: { ...usage },
        ...(resumeCheckpoint ? { checkpoint: resumeCheckpoint } : {}),
        ...(options.error ? { error: options.error.toJSON() } : {}),
      }, persistenceStage);
    } catch (error) {
      if (
        persistenceStage !== 'finalizing' ||
        !isEventStoreFailure(error)
      ) {
        throw error;
      }
    }
    const storageFailure = this.storageFailureByRun.get(request.runId);
    const result: RuntimeResult = {
      state: vars.state,
      outcome,
      context: builtContext.manifest,
      traceComplete: storageFailure === undefined,
      ...(storageFailure
        ? {
          storageFailureStage: storageFailure.stage,
          eventStoreError: storageFailure.error,
        }
        : {}),
      ...(vars.plan ? { plan: vars.plan } : {}),
      ...(vars.finalResponse ? { finalResponse: vars.finalResponse } : {}),
      ...(options.summary ? { summary: options.summary } : {}),
      ...(resumeCheckpoint ? { checkpoint: resumeCheckpoint } : {}),
      toolResults,
      usage: { ...usage },
      ...(options.evidenceBundle
        ? { evidenceBundle: options.evidenceBundle }
        : {}),
      ...(options.error ? { error: options.error } : {}),
    };
    if (outcome !== TurnOutcome.NEEDS_APPROVAL) {
      this.sequenceByRun.delete(request.runId);
      this.acceptedSequenceByRun.delete(request.runId);
      this.storageFailureByRun.delete(request.runId);
    }
    return result;
  }

  private async transitionToFailure(
    request: RuntimeRequest,
    error: AgentError,
    vars: RunVars,
  ): Promise<void> {
    if (
      vars.state === AgentState.IDLE ||
      vars.state === AgentState.PLANNING ||
      vars.state === AgentState.EXECUTING ||
      vars.state === AgentState.AWAITING_APPROVAL
    ) {
      vars.state = await this.transitionState(request, 'execution_failed', vars.state, { code: error.code });
    } else if (vars.state === AgentState.VERIFYING) {
      vars.state = await this.transitionState(request, 'verification_failed', vars.state, { code: error.code });
    }
  }

  private async finishWithRuntimeFailure(
    request: RuntimeRequest,
    failure: unknown,
    vars: RunVars,
    toolResults: ToolExecutionResult[],
    builtContext: ReturnType<ContextManager['build']>,
    budget: TurnBudget,
    usage: TurnUsage,
    verificationRequirements: VerificationRequirement[],
    workingMemory: WorkingMemory,
  ): Promise<RuntimeResult> {
    let agentError = runtimeFailure(failure, request);
    try {
      await this.transitionToFailure(request, agentError, vars);
      await this.emit(request, 'runtime.error', agentError.toJSON());
    } catch (reportingFailure) {
      agentError = runtimeFailure(reportingFailure, request);
      try {
        await this.transitionToFailure(request, agentError, vars);
        await this.emit(request, 'runtime.error', agentError.toJSON());
      } catch {
        // EventSink failure is already retained in storageFailureByRun.
      }
    }
    return await this.buildResult(
      request, vars, toolResults, builtContext, budget, usage,
      verificationRequirements, workingMemory, TurnOutcome.FAILED, { error: agentError },
    );
  }

  private async finishWithBudgetExceeded(
    request: RuntimeRequest,
    reason: BudgetExceededReason,
    vars: RunVars,
    toolResults: ToolExecutionResult[],
    builtContext: ReturnType<ContextManager['build']>,
    budget: TurnBudget,
    usage: TurnUsage,
    verificationRequirements: VerificationRequirement[],
    workingMemory: WorkingMemory,
    messages: RuntimeMessage[],
    toolCatalog: ToolSpec[],
  ): Promise<RuntimeResult> {
    await this.emit(request, 'budget.exceeded', {
      reason,
      usage: { ...usage },
      budget,
    });
    const summary = await this.requestFinalSummary(
      request,
      builtContext.manifest,
      builtContext.items,
      messages,
      toolCatalog,
      usage,
      reason,
      budget.finalSummaryGraceMs,
    );
    const error = new AgentError(
      AgentErrorCode.BUDGET_EXCEEDED,
      `Turn budget exceeded: ${reason}`,
      { reason, usage: { ...usage }, budget },
      '查看收尾摘要后新建 Turn 继续，或调整显式预算。',
    );
    await this.transitionToFailure(request, error, vars);
    await this.emit(request, 'runtime.error', error.toJSON());
    return this.buildResult(
      request, vars, toolResults, builtContext, budget, usage,
      verificationRequirements, workingMemory, TurnOutcome.BUDGET_EXCEEDED, { error, summary },
    );
  }

  // ── Main run loop ─────────────────────────────────────────────────

  private async prepareRun(
    request: RuntimeRequest,
  ): Promise<{
    workingMemory: WorkingMemory;
    toolCatalog: ToolSpec[];
    buildContext: () => ReturnType<ContextManager['build']>;
    builtContext: ReturnType<ContextManager['build']>;
    budget: TurnBudget;
  }> {
    const checkpoint = request.resumeCheckpoint;
    if (checkpoint && checkpoint.schemaVersion !== '2.0') {
      throw new AgentError(
        AgentErrorCode.RUNTIME_INPUT_INVALID,
        'Unsupported RuntimeCheckpoint schemaVersion',
        { schemaVersion: checkpoint.schemaVersion },
        '使用当前版本生成的 Checkpoint，或重新开始该 Turn。',
      );
    }
    if (request.approvalRejection) {
      const rejection = request.approvalRejection;
      if (
        !checkpoint ||
        !rejection.callId ||
        !rejection.reason.trim() ||
        rejection.reason.length > 2_000 ||
        !checkpoint.pendingPlan.toolCalls.some(({ call }) => call.id === rejection.callId) ||
        request.tokenIdsByCallId?.[rejection.callId]
      ) {
        throw new AgentError(
          AgentErrorCode.RUNTIME_INPUT_INVALID,
          'Approval rejection must identify one pending checkpoint call with a non-empty reason and no approval token',
          { callId: rejection.callId },
          '从原审批 Checkpoint 提交拒绝原因；不要同时提交能力令牌。',
        );
      }
    }
    validateTaskAcceptance(request.acceptance);
    const baseContextItems = [
      ...(request.contextBootstrap ? buildInitialContext(request.contextBootstrap) : []),
      ...(request.contextItems ?? []),
    ];
    const workingMemory = new WorkingMemory(
      request.prompt,
      baseContextItems.filter((item) => item.protection === 'protected'),
      checkpoint?.workingMemory,
    );
    const toolCatalog = mergeToolCatalog(
      this.dependencies.tools.list(),
      createUpdatePlanToolSpec(),
    );
    const buildContext = (): ReturnType<ContextManager['build']> =>
      this.contextManager.build(
        [...baseContextItems, workingMemory.toContextItem()],
        request.contextBudget,
        {
          systemPromptVersion: 'core-runtime-v1',
          toolCatalogDigestSha256: digestToolCatalog(toolCatalog),
        },
      );
    let builtContext: ReturnType<ContextManager['build']>;
    try {
      builtContext = buildContext();
    } catch (error) {
      throw runtimeInputError('Invalid runtime context', error, request);
    }
    const budget: TurnBudget = checkpoint
      ? { ...checkpoint.budget }
      : {
        ...DEFAULT_TURN_BUDGET,
        ...request.turnBudget,
      };
    try {
      validateTurnBudget(budget);
    } catch (error) {
      throw runtimeInputError('Invalid Turn budget', error, request);
    }
    return { workingMemory, toolCatalog, buildContext, builtContext, budget };
  }

  private initializeRunState(
    request: RuntimeRequest,
    checkpoint: RuntimeCheckpoint | undefined,
    builtContext: ReturnType<ContextManager['build']>,
    budget: TurnBudget,
  ): RunState {
    const vars: RunVars = { state: AgentState.IDLE, plan: undefined, finalResponse: undefined };
    const toolResults: ToolExecutionResult[] = [];
    if (checkpoint && !this.dependencies.messageProjector) {
      throw new AgentError(
        AgentErrorCode.RUNTIME_INPUT_INVALID,
        'RuntimeCheckpoint v2 requires an event-backed message projector',
        { runId: request.runId, threadId: request.threadId },
        '装配 State V2 RuntimeMessageProjection 后再恢复；不得从消息快照恢复。',
      );
    }
    const projectedMessages = this.dependencies.messageProjector?.projectMessages({
      sessionId: request.sessionId,
      threadId: request.threadId,
      turnId: request.turnId,
      runId: request.runId,
      ...(checkpoint ? { upToSequence: checkpoint.lastEventSequence } : {}),
    }).map(normalizeProjectedMessage);
    const messages: RuntimeMessage[] = checkpoint
      ? projectedMessages!
      : [
        ...(projectedMessages ?? (request.previousMessages ?? []).map(cloneMessage)),
        { role: 'user', content: request.prompt },
      ];
    const verificationRequirements = request.acceptance.checks.map((r) => ({ ...r }));
    const verificationFailuresByGate = new Map<string, number>();
    const verificationFailureHistoryByGate = new Map<string, Array<{
      attempt: number;
      evidenceDigestSha256: string;
      failures: string[];
    }>>();
    const startedAtMs = this.monotonicMs();
    const elapsedBeforeResume = checkpoint?.usage.elapsedMs ?? 0;
    const usage: TurnUsage = {
      steps: checkpoint?.usage.steps ?? 0,
      tokens: checkpoint?.usage.tokens ?? 0,
      toolCalls: checkpoint?.usage.toolCalls ?? 0,
      modelAttempts: checkpoint?.usage.modelAttempts ?? 0,
      elapsedMs: elapsedBeforeResume,
    };
    const detector = new LoopDetector(this.loopDetectorThreshold);
    const remainingWallMs = Math.max(1, budget.maxWallMs - elapsedBeforeResume);
    const turnDeadlineMs = startedAtMs + remainingWallMs;
    const control = new TurnControl(request.abortSignal, remainingWallMs);
    const refreshElapsed = (): void => {
      usage.elapsedMs = elapsedBeforeResume + Math.max(0, this.monotonicMs() - startedAtMs);
    };
    this.runStartedAtMs = startedAtMs;
    this.runElapsedBeforeResume = elapsedBeforeResume;
    return {
      vars, toolResults, messages, verificationRequirements,
      verificationFailuresByGate, verificationFailureHistoryByGate,
      usage, detector, turnDeadlineMs, control, refreshElapsed,
    };
  }

  private async executeModelCall(
    request: RuntimeRequest,
    builtContext: ReturnType<ContextManager['build']>,
    messages: RuntimeMessage[],
    toolCatalog: ToolSpec[],
    approvedPlan: RuntimePlan | undefined,
    checkpoint: RuntimeCheckpoint | undefined,
    usage: TurnUsage,
    control: TurnControl,
    refreshElapsed: () => void,
  ): Promise<{ plan: RuntimePlan; resumed: boolean; resumedFromCheckpoint: boolean }> {
    const resumed = Boolean(approvedPlan);
    const resumedFromCheckpoint = resumed && Boolean(checkpoint);
    if (approvedPlan) {
      validatePlan(approvedPlan);
      await this.emit(request, 'model.plan', { resumed: true, step: usage.steps, plan: approvedPlan });
      return { plan: approvedPlan, resumed, resumedFromCheckpoint };
    }
    const step = usage.steps + 1;
    await this.emit(request, 'step.started', { step, kind: 'model' });
    const plan = await this.callModelWithRetry(
      request, builtContext.manifest, builtContext.items, messages, toolCatalog,
      step, 'auto', control,
      async (attempt, error) => {
        usage.modelAttempts += 1;
        if (attempt > 1) {
          await this.emit(request, 'step.retry', { step, attempt, error: errorMessage(error) });
        }
      },
    );
    validatePlan(plan);
    usage.steps += 1;
    usage.tokens += (plan.usage?.inputTokens ?? 0) + (plan.usage?.outputTokens ?? 0);
    refreshElapsed();
    await this.emit(request, 'model.plan', { resumed: false, step, plan });
    await this.emit(request, 'step.completed', { step, usage: plan.usage ?? { inputTokens: 0, outputTokens: 0 } });
    return { plan, resumed, resumedFromCheckpoint };
  }

  private async runVerificationGate(
    request: RuntimeRequest,
    rs: RunState,
    vars: RunVars,
    builtContext: ReturnType<ContextManager['build']>,
    budget: TurnBudget,
    workingMemory: WorkingMemory,
    toolCatalog: ToolSpec[],
  ): Promise<VerificationGateResult> {
    if ((vars.state as AgentState) === AgentState.PLANNING) {
      vars.state = await this.transitionState(request, 'plan_ready', vars.state);
    }
    vars.finalResponse = vars.plan!.finalResponse ?? vars.plan!.summary;
    vars.state = await this.transitionState(request, 'execution_complete', vars.state);
    let evidence: VerificationEvidence[];
    try {
      evidence = await raceWithAbort(
        this.dependencies.verifier.collect({
          request, plan: vars.plan!, acceptance: request.acceptance,
          toolResults: rs.toolResults, signal: rs.control.signal, deadlineMs: rs.turnDeadlineMs,
        }),
        rs.control,
      );
    } catch (error) {
      if (error instanceof TurnInterrupted) throw error;
      throw new AgentError(
        AgentErrorCode.VERIFICATION_FAILED,
        `Verification collection failed: ${errorMessage(error)}`,
        { runId: request.runId },
        '修复验证环境或命令后重新运行；不得跳过验证门。',
      );
    }
    const bundle = this.dependencies.verificationGate.evaluate(
      request.taskId, request.runId, rs.verificationRequirements, evidence,
    );
    await this.emit(request, 'verification.bundle', bundle);
    if (!bundle.passed) {
      const gateId = bundle.failedCheckIds[0] ?? '__acceptance__';
      const attempt = (rs.verificationFailuresByGate.get(gateId) ?? 0) + 1;
      rs.verificationFailuresByGate.set(gateId, attempt);
      const failureHistory = rs.verificationFailureHistoryByGate.get(gateId) ?? [];
      failureHistory.push({ attempt, evidenceDigestSha256: bundle.digestSha256, failures: bundle.failures.slice() });
      rs.verificationFailureHistoryByGate.set(gateId, failureHistory);
      const feedback = createVerificationFeedback(bundle, gateId, attempt);
      await this.emit(request, 'verification.feedback', feedback);
      rs.messages.push({ role: 'system', content: feedback.content });
      if (attempt < 3) {
        vars.state = await this.transitionState(request, 'verification_repair_requested', vars.state, {
          gateId, attempt, evidenceDigest: bundle.digestSha256,
        });
        return { action: 'continue' };
      }
      const error = new AgentError(
        AgentErrorCode.VERIFICATION_STUCK,
        `Verification gate ${gateId} failed three times: ${bundle.failures.join('; ')}`,
        {
          gateId, attempts: attempt, evidenceDigest: bundle.digestSha256,
          failures: bundle.failures,
          failureHistory: failureHistory.map((e) => ({ ...e, failures: e.failures.slice() })),
        },
        '检查三次验证证据并人工修复或调整可信验收合同后，新建 Turn 重试。',
      );
      vars.state = await this.transitionState(request, 'verification_failed', vars.state, { failures: bundle.failures });
      await this.emit(request, 'runtime.error', error.toJSON());
      return {
        action: 'failed',
        result: await this.buildResult(
          request, vars, rs.toolResults, builtContext, budget, rs.usage,
          rs.verificationRequirements, workingMemory, TurnOutcome.FAILED,
          { error, evidenceBundle: bundle },
        ),
      };
    }
    vars.state = await this.transitionState(request, 'verification_passed', vars.state, {
      evidenceDigest: bundle.digestSha256,
    });
    return {
      action: 'completed',
      result: await this.buildResult(
        request, vars, rs.toolResults, builtContext, budget, rs.usage,
        rs.verificationRequirements, workingMemory, TurnOutcome.COMPLETED,
        { evidenceBundle: bundle },
      ),
    };
  }

  private async evaluateToolCalls(
    request: RuntimeRequest,
    vars: RunVars,
    pendingApprovalRejection: RuntimeRequest['approvalRejection'],
  ): Promise<{
    resolved: Array<{
      call: ToolCall; spec: ToolSpec | undefined;
      validationError: AgentError | undefined;
      decision: ReturnType<PolicyEngine['evaluate']> | undefined;
      tokenId: string | undefined;
      preparation?: unknown;
    }>;
    pendingRejection: RuntimeRequest['approvalRejection'];
  }> {
    const resolved = await Promise.all(vars.plan!.toolCalls.map(async ({ call: plannedCall }: { call: ToolCall }) => {
      let call = plannedCall;
      let spec: ToolSpec | undefined;
      let validationError: AgentError | undefined;
      let preparation: unknown;
      try {
        if (plannedCall.toolName === UPDATE_PLAN_TOOL_NAME) {
          call = normalizeUpdatePlanCall(plannedCall);
          spec = createUpdatePlanToolSpec();
        } else {
          call = this.dependencies.tools.normalizeCall(plannedCall);
          spec = this.dependencies.tools.resolve(call.toolName);
        }
      } catch (error) {
        validationError = error instanceof AgentError
          ? error
          : new AgentError(
            AgentErrorCode.TOOL_INPUT_INVALID,
            errorMessage(error),
            { callId: call.id, toolName: call.toolName },
          );
      }
      if (!validationError && spec && call.approvalLevel === ApprovalLevel.WORKSPACE_WRITE && this.dependencies.toolCallPreparation) {
        try {
          const prepared = await this.dependencies.toolCallPreparation.prepare({
            request,
            call,
            spec,
            signal: request.abortSignal ?? new AbortController().signal,
          });
          call = prepared.call;
          preparation = prepared.preparation;
        } catch (error) {
          validationError = error instanceof AgentError
            ? error
            : new AgentError(
              AgentErrorCode.TOOL_INPUT_INVALID,
              errorMessage(error),
              { callId: call.id, toolName: call.toolName },
              '重新读取目标文件并生成新的可信写入计划。',
            );
        }
      }
      const tokenId = request.tokenIdsByCallId?.[call.id];
      const decision = validationError
        ? undefined
        : call.toolName === UPDATE_PLAN_TOOL_NAME
          ? {
            verdict: PolicyVerdict.ALLOW, allowed: true,
            level: ApprovalLevel.READ_ONLY,
            ruleId: 'POLICY_HARNESS_INTERNAL',
            reason: 'Harness-internal working-memory update',
          }
          : this.dependencies.policy.evaluate(call, tokenId, request.sessionId, spec?.capability);
      return { call, spec, validationError, decision, tokenId, preparation };
    }));
    if (pendingApprovalRejection) {
      const rejected = resolved.find(({ call }: { call: ToolCall }) => call.id === pendingApprovalRejection!.callId)!;
      rejected.decision = {
        verdict: PolicyVerdict.DENY, allowed: false,
        level: rejected.call.approvalLevel,
        ruleId: 'POLICY_USER_REJECTED',
        reason: `User rejected approval: ${pendingApprovalRejection.reason.trim()}`,
      };
      void this.emit(request, 'approval.resolved', {
        callId: rejected.call.id, resolution: 'rejected',
        reason: pendingApprovalRejection.reason.trim(),
      });
      pendingApprovalRejection = undefined;
    }
    return { resolved, pendingRejection: pendingApprovalRejection };
  }

  private async handleApproval(
    request: RuntimeRequest,
    vars: RunVars,
    resolved: Array<{
      call: ToolCall; spec: ToolSpec | undefined;
      validationError: AgentError | undefined;
      decision: ReturnType<PolicyEngine['evaluate']> | undefined;
      tokenId: string | undefined;
      preparation?: unknown;
    }>,
    builtContext: ReturnType<ContextManager['build']>,
    budget: TurnBudget,
    rs: RunState,
    workingMemory: WorkingMemory,
    toolCatalog: ToolSpec[],
  ): Promise<RuntimeResult | undefined> {
    for (const { call, decision } of resolved) {
      if (decision) {
        await this.emit(request, 'policy.decision', { callId: call.id, decision });
      }
    }
    const approvalRequired = resolved.find(
      ({ call, decision, tokenId }) =>
        call.approvalLevel === ApprovalLevel.WORKSPACE_WRITE &&
        !tokenId && decision?.verdict === PolicyVerdict.ASK,
    );
    if (approvalRequired) {
      vars.state = await this.transitionState(request, 'submit_for_approval', vars.state, {
        callIds: resolved
          .filter(({ call }) => call.approvalLevel === ApprovalLevel.WORKSPACE_WRITE)
          .map(({ call }) => call.id),
      });
      await this.emit(request, 'approval.requested', {
        call: approvalRequired.call,
        contextDigestSha256: builtContext.manifest.digestSha256,
        plan: vars.plan,
        reason: approvalRequired.decision?.reason,
        ruleId: approvalRequired.decision?.ruleId,
        verdict: approvalRequired.decision?.verdict,
        ...(approvalRequired.preparation !== undefined ? { preparation: approvalRequired.preparation } : {}),
      });
      const error = new AgentError(
        AgentErrorCode.APPROVAL_REQUIRED,
        approvalRequired.decision?.reason ?? 'Workspace write approval required',
        { callId: approvalRequired.call.id },
        '批准精确预览和工作区基线后，以有效能力令牌恢复该 Turn。',
      );
      return await this.buildResult(
        request, vars, rs.toolResults, builtContext, budget, rs.usage,
        rs.verificationRequirements, workingMemory, TurnOutcome.NEEDS_APPROVAL,
        { error, checkpointPlan: vars.plan },
      );
    }
    const invalidApproval = resolved.find(
      ({ call, decision, tokenId }) =>
        call.approvalLevel === ApprovalLevel.WORKSPACE_WRITE &&
        Boolean(tokenId) && decision !== undefined && !decision.allowed,
    );
    if (invalidApproval) {
      throw new AgentError(
        AgentErrorCode.APPROVAL_INVALID,
        invalidApproval.decision?.reason ?? 'Write approval is invalid',
        { callId: invalidApproval.call.id },
        '重新生成预览、基线与一次性审批令牌。',
      );
    }
    const approvedWrite = resolved.some(
      ({ call, decision }) =>
        call.approvalLevel === ApprovalLevel.WORKSPACE_WRITE && decision?.allowed,
    );
    if ((vars.state as AgentState) === AgentState.PLANNING) {
      if (approvedWrite) {
        vars.state = await this.transitionState(request, 'submit_for_approval', vars.state, {
          callIds: resolved
            .filter(({ call }) => call.approvalLevel === ApprovalLevel.WORKSPACE_WRITE)
            .map(({ call }) => call.id),
        });
        vars.state = await this.transitionState(request, 'approval_granted', vars.state);
      } else {
        vars.state = await this.transitionState(request, 'plan_ready', vars.state);
      }
    }
    return undefined;
  }

  private async executeToolCalls(
    request: RuntimeRequest,
    vars: RunVars,
    resolved: Array<{
      call: ToolCall; spec: ToolSpec | undefined;
      validationError: AgentError | undefined;
      decision: ReturnType<PolicyEngine['evaluate']> | undefined;
      tokenId: string | undefined;
      preparation?: unknown;
    }>,
    builtContext: ReturnType<ContextManager['build']>,
    buildContext: () => ReturnType<ContextManager['build']>,
    budget: TurnBudget,
    rs: RunState,
    workingMemory: WorkingMemory,
    toolCatalog: ToolSpec[],
  ): Promise<{ builtContext: ReturnType<ContextManager['build']>; result?: RuntimeResult }> {
    for (let index = 0; index < resolved.length; index += 1) {
      const item = resolved[index];
      rs.refreshElapsed();
      const interruptCause = rs.control.cause as InterruptCause | undefined;
      const beforeToolReason =
        interruptCause === 'wall_budget_exceeded' ? 'max_wall_ms'
          : rs.usage.tokens >= budget.maxTokens ? 'max_tokens'
            : rs.usage.toolCalls >= budget.maxToolCalls ? 'max_tool_calls'
              : undefined;
      if (beforeToolReason) {
        await this.pairUnexecutedCalls(
          request, resolved.slice(index).map(({ call }) => call),
          rs.toolResults, rs.messages, rs.usage,
          `Turn budget exceeded: ${beforeToolReason}`,
        );
        return {
          builtContext,
          result: await this.finishWithBudgetExceeded(
            request, beforeToolReason, vars, rs.toolResults, builtContext, budget, rs.usage,
            rs.verificationRequirements, workingMemory, rs.messages, toolCatalog,
          ),
        };
      }
      if (interruptCause === 'user_cancelled') {
        await this.pairUnexecutedCalls(
          request, resolved.slice(index).map(({ call }) => call),
          rs.toolResults, rs.messages, rs.usage,
          'Turn cancelled before tool execution', 'cancelled',
        );
        throw new TurnInterrupted('user_cancelled');
      }
      const { call, spec, validationError, decision } = item;
      await this.emit(request, 'tool.request', call);
      rs.usage.toolCalls += 1;
      if (rs.detector.observe(call.toolName, call.args)) {
        const stuckResult: ToolExecutionResult = {
          callId: call.id, toolName: call.toolName,
          success: false, status: 'denied',
          error: 'Repeated identical tool call blocked by LoopDetector',
        };
        await this.recordToolResult(request, stuckResult, rs.toolResults, rs.messages);
        await this.pairUnexecutedCalls(
          request, resolved.slice(index + 1).map(({ call: c }) => c),
          rs.toolResults, rs.messages, rs.usage,
          'Tool was not started because the Turn was classified as STUCK',
        );
        const error = new AgentError(
          AgentErrorCode.LOOP_STUCK,
          `Repeated tool call detected: ${call.toolName}`,
          { callId: call.id, threshold: this.loopDetectorThreshold },
          '检查模型上下文和工具结果；新建 Turn 时保留卡死证据。',
        );
        await this.transitionToFailure(request, error, vars);
        await this.emit(request, 'runtime.error', error.toJSON());
        return {
          builtContext,
          result: await this.buildResult(
            request, vars, rs.toolResults, builtContext, budget, rs.usage,
            rs.verificationRequirements, workingMemory, TurnOutcome.STUCK, { error },
          ),
        };
      }
      if (validationError || !spec) {
        await this.recordToolResult(request, {
          callId: call.id, toolName: call.toolName,
          success: false, status: 'failed',
          error: validationError?.message ?? 'Tool validation failed',
        }, rs.toolResults, rs.messages);
        continue;
      }
      if (!decision?.allowed) {
        await this.recordToolResult(request, {
          callId: call.id, toolName: call.toolName,
          success: false, status: 'denied',
          error: decision?.reason ?? 'Policy denied tool call',
        }, rs.toolResults, rs.messages);
        continue;
      }
      if (call.toolName === UPDATE_PLAN_TOOL_NAME) {
        try {
          const snapshot = workingMemory.update({
            expectedRevision: call.args.expectedRevision as number,
            plan: call.args.plan as string[],
            currentStep: call.args.currentStep as string,
            findings: call.args.findings as string[],
          });
          builtContext = buildContext();
          await this.emit(request, 'working_memory.updated', {
            revision: snapshot.revision,
            contextDigestSha256: builtContext.manifest.digestSha256,
          });
          await this.recordToolResult(request, {
            callId: call.id, toolName: call.toolName,
            success: true, status: 'succeeded', output: snapshot,
          }, rs.toolResults, rs.messages);
        } catch (error) {
          await this.recordToolResult(request, {
            callId: call.id, toolName: call.toolName,
            success: false, status: 'failed', error: errorMessage(error),
          }, rs.toolResults, rs.messages);
        }
        continue;
      }
      const result = await this.executeTool(request, spec, call, rs.control, rs.turnDeadlineMs);
      await this.recordToolResult(request, result, rs.toolResults, rs.messages);
      if (result.status === 'cancelled') {
        await this.pairUnexecutedCalls(
          request, resolved.slice(index + 1).map(({ call: c }) => c),
          rs.toolResults, rs.messages, rs.usage,
          'Tool was not started because an earlier call cancelled the Turn', 'cancelled',
        );
        if (
          call.approvalLevel === ApprovalLevel.WORKSPACE_WRITE &&
          !result.cancellation?.cleanupComplete
        ) {
          throw new AgentError(
            AgentErrorCode.CANCELLATION_FAILED,
            `Side-effecting tool cancellation was not confirmed: ${call.toolName}`,
            { callId: call.id, cancellation: result.cancellation },
            '保持工作区锁定并人工核对进程树及文件状态；不得自动继续。',
          );
        }
        if (rs.control.cause === 'wall_budget_exceeded') {
          return {
            builtContext,
            result: await this.finishWithBudgetExceeded(
              request, 'max_wall_ms', vars, rs.toolResults, builtContext, budget, rs.usage,
              rs.verificationRequirements, workingMemory, rs.messages, toolCatalog,
            ),
          };
        }
        throw new TurnInterrupted('user_cancelled');
      }
    }
    return { builtContext };
  }

  async run(request: RuntimeRequest): Promise<RuntimeResult> {
    const checkpoint = request.resumeCheckpoint;
    const { workingMemory, toolCatalog, buildContext, builtContext, budget } = await this.prepareRun(request);
    const rs = this.initializeRunState(request, checkpoint, builtContext, budget);
    const { vars, toolResults, messages, control, refreshElapsed, usage } = rs;
    let currentBuiltContext = builtContext;

    try {
      if (checkpoint) {
        const currentSequence = this.sequenceByRun.get(request.runId) ?? 0;
        if (checkpoint.lastRuntimeSequence > currentSequence) {
          this.sequenceByRun.set(request.runId, checkpoint.lastRuntimeSequence);
        }
        this.acceptedSequenceByRun.set(request.runId, checkpoint.lastEventSequence);
      }
      await this.emit(request, checkpoint ? 'turn.resumed' : 'turn.started', {
        budget, resumed: Boolean(checkpoint || request.approvedPlan),
        ...(!checkpoint ? { prompt: request.prompt } : {}),
      }, 'startup');
      vars.state = await this.transitionState(request, 'start_planning', vars.state);

      if (
        checkpoint && (
          checkpoint.sessionId !== request.sessionId ||
          checkpoint.threadId !== request.threadId ||
          checkpoint.turnId !== request.turnId ||
          checkpoint.taskId !== request.taskId ||
          checkpoint.runId !== request.runId
        )
      ) {
        throw new AgentError(
          AgentErrorCode.APPROVAL_INVALID,
          'RuntimeCheckpoint identity does not match the resumed Turn',
          { checkpoint: { sessionId: checkpoint.sessionId, threadId: checkpoint.threadId, turnId: checkpoint.turnId, taskId: checkpoint.taskId, runId: checkpoint.runId } },
          '仅在原 Session/Thread/Turn/Run 中恢复该审批点。',
        );
      }

      let approvedPlan = checkpoint?.pendingPlan ?? request.approvedPlan;
      let pendingApprovalRejection = request.approvalRejection;
      if (
        approvedPlan &&
        (checkpoint?.contextDigestSha256 ?? request.approvedContextDigestSha256) !==
          currentBuiltContext.manifest.digestSha256
      ) {
        throw new AgentError(
          AgentErrorCode.APPROVAL_INVALID,
          'Approved plan context digest no longer matches the current context',
          { runId: request.runId },
          '重新生成上下文清单、变更预览和审批令牌。',
        );
      }

      while (true) {
        refreshElapsed();
        if (control.cause === 'user_cancelled') throw new TurnInterrupted('user_cancelled');
        const budgetReason = control.cause === 'wall_budget_exceeded'
          ? 'max_wall_ms' : checkTurnBudget(budget, usage);
        if (budgetReason) return await this.finishWithBudgetExceeded(
          request, budgetReason, vars, toolResults, currentBuiltContext, budget, usage,
          rs.verificationRequirements, workingMemory, messages, toolCatalog,
        );

        const modelResult = await this.executeModelCall(
          request, currentBuiltContext, messages, toolCatalog,
          approvedPlan, checkpoint, usage, control, refreshElapsed,
        );
        vars.plan = modelResult.plan;
        approvedPlan = undefined;

        if (!modelResult.resumedFromCheckpoint) {
          messages.push({
            role: 'assistant',
            content: vars.plan.finalResponse ?? vars.plan.summary,
            ...(vars.plan.toolCalls.length > 0
              ? { toolCalls: vars.plan.toolCalls.map(({ call }) => cloneToolCall(call)) }
              : {}),
          });
        }

        if (vars.plan.toolCalls.length === 0) {
          const vgResult = await this.runVerificationGate(
            request, rs, vars, currentBuiltContext, budget, workingMemory, toolCatalog,
          );
          if (vgResult.action === 'completed') return vgResult.result!;
          if (vgResult.action === 'failed') return vgResult.result!;
          continue;
        }

        const evalResult = await this.evaluateToolCalls(request, vars, pendingApprovalRejection);
        pendingApprovalRejection = evalResult.pendingRejection;

        const approvalResult = await this.handleApproval(
          request, vars, evalResult.resolved, currentBuiltContext, budget,
          rs, workingMemory, toolCatalog,
        );
        if (approvalResult) return approvalResult;

        const toolResult = await this.executeToolCalls(
          request, vars, evalResult.resolved, currentBuiltContext, buildContext,
          budget, rs, workingMemory, toolCatalog,
        );
        currentBuiltContext = toolResult.builtContext;
        if (toolResult.result) return toolResult.result;

        if (modelResult.resumed) {
          await this.emit(request, 'step.completed', { step: usage.steps, resumedApproval: true });
        }
      }
    } catch (error) {
      if (error instanceof TurnInterrupted) {
        if (error.cause === 'wall_budget_exceeded') {
          return await this.finishWithBudgetExceeded(
            request, 'max_wall_ms', vars, toolResults, currentBuiltContext, budget, usage,
            rs.verificationRequirements, workingMemory, messages, toolCatalog,
          );
        }
        const currentState = vars.state as AgentState;
        if (currentState !== AgentState.COMPLETED && currentState !== AgentState.FAILED && currentState !== AgentState.CANCELLED) {
          try {
            vars.state = await this.transitionState(request, 'cancel', vars.state, { reason: error.cause });
          } catch (moveError) {
            return await this.finishWithRuntimeFailure(
              request, moveError, vars, toolResults, currentBuiltContext, budget, usage,
              rs.verificationRequirements, workingMemory,
            );
          }
        }
        return await this.buildResult(
          request, vars, toolResults, currentBuiltContext, budget, usage,
          rs.verificationRequirements, workingMemory, TurnOutcome.CANCELLED,
          { summary: 'Turn cancelled; all observed tool results were retained.' },
        );
      }
      return await this.finishWithRuntimeFailure(
        request, error, vars, toolResults, currentBuiltContext, budget, usage,
        rs.verificationRequirements, workingMemory,
      );
    } finally {
      control.dispose();
    }
  }

  // ── Existing private methods ──────────────────────────────────────

  private async callModelWithRetry(
    request: RuntimeRequest,
    context: ContextManifest,
    contextItems: readonly ContextItem[],
    messages: RuntimeMessage[],
    tools: readonly ToolSpec[],
    step: number,
    toolChoice: 'auto' | 'none',
    control: TurnControl,
    onAttempt: (attempt: number, error?: unknown) => void | Promise<void>,
    finalizeReason?: BudgetExceededReason,
  ): Promise<RuntimePlan> {
    const modelWindowTokens = context.budget.modelWindowTokens;
    let compactedBeforeCall = false;
    if (modelWindowTokens !== undefined) {
      const threshold = Math.min(
        context.highWatermarkTokens,
        modelWindowTokens - context.outputReserveTokens,
      );
      const beforeTokens = estimateProjectedTokens(contextItems, messages, tools);
      if (beforeTokens >= threshold) {
        const fixedTokens = estimateProjectedTokens(contextItems, [], tools);
        const compaction = await this.compactContext({
          request,
          messages: messages.map(cloneMessage),
          error: new Error('Context input high-watermark exceeded'),
          lastEventSequence: this.acceptedSequenceByRun.get(request.runId),
          targetSummaryChars: Math.max(
            256,
            Math.floor(Math.max(0, threshold - fixedTokens) * 2),
          ),
        });
        messages.splice(0, messages.length, ...compaction.messages.map(cloneMessage));
        compactedBeforeCall = true;
        await this.emit(request, 'compaction.applied', {
          compactionId: compaction.compactionId,
          replacedSeqRange: compaction.replacedSeqRange,
          summary: compaction.summary,
          supersedesCompactionIds: compaction.supersedesCompactionIds ?? [],
          reason: 'input_high_watermark',
          beforeTokens,
        });
        const afterTokens = estimateProjectedTokens(contextItems, messages, tools);
        if (afterTokens >= threshold) {
          throw new AgentError(
            AgentErrorCode.RUNTIME_INPUT_INVALID,
            'Protected context and tool catalog cannot fit below the input high-watermark',
            { beforeTokens, afterTokens, threshold, modelWindowTokens },
            'Increase the reviewed model window or reduce protected rules/tool schemas; do not drop constraints.',
          );
        }
      }
    }
    let lastError: unknown;
    let attempts = 0;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt += 1) {
      if (control.signal.aborted) {
        throw new TurnInterrupted(
          control.cause ?? 'user_cancelled',
        );
      }
      await onAttempt(attempt, lastError);
      attempts = attempt;
      try {
        return await raceWithAbort(
          this.dependencies.model.createPlan({
            run: runMetadata(request),
            context,
            messages: projectModelMessages(contextItems, messages),
            tools: tools.map(cloneToolSpec),
            contextUsage: {
              projectedInputTokens: estimateProjectedTokens(contextItems, messages, tools),
              highWatermarkTokens: context.highWatermarkTokens,
              outputReserveTokens: context.outputReserveTokens,
              ...(modelWindowTokens !== undefined ? { modelWindowTokens } : {}),
              compactedBeforeCall,
            },
            step,
            attempt,
            toolChoice,
            ...(finalizeReason ? { finalizeReason } : {}),
            signal: control.signal,
          }),
          control,
        );
      } catch (error) {
        if (error instanceof TurnInterrupted) throw error;
        lastError = error;
        const action = this.modelRetryClassifier(error);
        if (action === ModelRetryAction.COMPACT_CONTEXT) {
          if (attempt >= this.retry.maxAttempts) break;
          const compaction = await this.compactContext({
            request,
            messages: messages.map(cloneMessage),
            error,
            lastEventSequence: this.acceptedSequenceByRun.get(request.runId),
          });
          messages.splice(0, messages.length, ...compaction.messages.map(cloneMessage));
          await this.emit(request, 'compaction.applied', {
            compactionId: compaction.compactionId,
            replacedSeqRange: compaction.replacedSeqRange,
            summary: compaction.summary,
            supersedesCompactionIds: compaction.supersedesCompactionIds ?? [],
          });
        } else if (action !== ModelRetryAction.RETRY) {
          break;
        }
        if (attempt >= this.retry.maxAttempts) break;
        await abortableDelay(
          this.retry.baseDelayMs * Math.pow(2, attempt - 1),
          control,
        );
      }
    }
    throw new AgentError(
      AgentErrorCode.MODEL_FAILED,
      `Model step failed after ${attempts} attempt(s): ${errorMessage(lastError)}`,
      {
        step,
        attempts,
        retryAction: this.modelRetryClassifier(lastError),
      },
      '检查 Gateway 状态和可重试错误分类后重新运行。',
    );
  }

  private async requestFinalSummary(
    request: RuntimeRequest,
    context: ContextManifest,
    contextItems: readonly ContextItem[],
    messages: RuntimeMessage[],
    tools: readonly ToolSpec[],
    usage: TurnUsage,
    reason: BudgetExceededReason,
    graceMs: number,
  ): Promise<string> {
    const control = new TurnControl(request.abortSignal, graceMs);
    const step = usage.steps + 1;
    try {
      await this.emit(request, 'step.started', {
        step,
        kind: 'final_summary',
        reason,
      });
      usage.modelAttempts += 1;
      const summaryPlan = await raceWithAbort(
        this.dependencies.model.createPlan({
          run: runMetadata(request),
          context,
          messages: projectModelMessages(contextItems, messages),
          tools: tools.map(cloneToolSpec),
          contextUsage: {
            projectedInputTokens: estimateProjectedTokens(contextItems, messages, tools),
            highWatermarkTokens: context.highWatermarkTokens,
            outputReserveTokens: context.outputReserveTokens,
            ...(context.budget.modelWindowTokens !== undefined
              ? { modelWindowTokens: context.budget.modelWindowTokens }
              : {}),
            compactedBeforeCall: false,
          },
          step,
          attempt: 1,
          toolChoice: 'none',
          finalizeReason: reason,
          signal: control.signal,
        }),
        control,
      );
      validatePlan(summaryPlan);
      usage.tokens +=
        (summaryPlan.usage?.inputTokens ?? 0) +
        (summaryPlan.usage?.outputTokens ?? 0);
      const summary = summaryPlan.finalResponse ?? summaryPlan.summary;
      await this.emit(request, 'model.plan', {
        resumed: false,
        step,
        finalSummary: true,
        ignoredToolCalls: summaryPlan.toolCalls.length,
        plan: summaryPlan,
      });
      await this.emit(request, 'step.completed', {
        step,
        kind: 'final_summary',
      });
      return summary;
    } catch (error) {
      if (isEventStoreFailure(error)) throw error;
      return [
        `Turn stopped because ${reason}.`,
        `steps=${usage.steps}`,
        `tokens=${usage.tokens}`,
        `toolCalls=${usage.toolCalls}`,
        `summaryUnavailable=${errorMessage(error)}`,
      ].join(' ');
    } finally {
      control.dispose();
    }
  }

  private async executeTool(
    request: RuntimeRequest,
    spec: ToolSpec,
    call: ToolCall,
    control: TurnControl,
    deadlineMs: number,
  ): Promise<ToolExecutionResult> {
    const execution = this.dependencies.executor.execute(spec, call, {
      signal: control.signal,
      deadlineMs,
      sessionId: request.sessionId,
      threadId: request.threadId,
      turnId: request.turnId,
      runId: request.runId,
    });
    try {
      const result = await raceWithAbort(execution, control);
      return normalizeToolResult(result, call);
    } catch (error) {
      if (!(error instanceof TurnInterrupted)) {
        return {
          callId: call.id,
          toolName: call.toolName,
          success: false,
          status: 'failed',
          error: errorMessage(error),
        };
      }
      void execution.catch(() => undefined);
      const cancellation = await this.cancelTool(call, error.cause);
      return {
        callId: call.id,
        toolName: call.toolName,
        success: false,
        status: 'cancelled',
        output: '[Tool execution cancelled; see cancellation metadata]',
        error: error.cause,
        cancellation,
      };
    }
  }

  private async cancelTool(
    call: ToolCall,
    cause: InterruptCause,
  ): Promise<ToolCancellationResult> {
    if (!this.dependencies.executor.cancel) {
      return {
        terminationRequested: false,
        cleanupComplete: false,
        detail: 'Executor does not expose the required cancellation contract',
      };
    }
    try {
      return await withTimeout(
        this.dependencies.executor.cancel(call, cause),
        this.toolCancelGraceMs,
      );
    } catch (error) {
      return {
        terminationRequested: true,
        cleanupComplete: false,
        detail: errorMessage(error),
      };
    }
  }

  private async pairUnexecutedCalls(
    request: RuntimeRequest,
    calls: ToolCall[],
    toolResults: ToolExecutionResult[],
    messages: RuntimeMessage[],
    usage: TurnUsage,
    reason: string,
    status: 'denied' | 'cancelled' = 'denied',
  ): Promise<void> {
    for (const call of calls) {
      await this.emit(request, 'tool.request', call);
      usage.toolCalls += 1;
      await this.recordToolResult(
        request,
        {
          callId: call.id,
          toolName: call.toolName,
          success: false,
          status,
          error: reason,
          ...(status === 'cancelled'
            ? {
              cancellation: {
                terminationRequested: false,
                cleanupComplete: true,
                detail: 'Tool was not started',
              },
            }
            : {}),
        },
        toolResults,
        messages,
      );
    }
  }

  private async recordToolResult(
    request: RuntimeRequest,
    result: ToolExecutionResult,
    toolResults: ToolExecutionResult[],
    messages: RuntimeMessage[],
  ): Promise<void> {
    toolResults.push(result);
    const observation = createToolObservation(result, 15_000);
    await this.emit(request, 'tool.result', { ...result, observation });
    messages.push({
      role: 'tool',
      toolCallId: result.callId,
      content: JSON.stringify(observation),
      observation,
    });
  }

  private async emit(
    request: RuntimeRequest,
    type: RuntimeEvent['type'],
    payload: unknown,
    stage: RuntimeStorageFailureStage = 'running',
  ): Promise<void> {
    if (this.storageFailureByRun.has(request.runId)) return;
    const sequence = (this.sequenceByRun.get(request.runId) ?? 0) + 1;
    try {
      const receipt = await this.dependencies.events.append({
        schemaVersion: '1.0',
        sequence,
        type,
        timestamp: this.now().toISOString(),
        sessionId: request.sessionId,
        threadId: request.threadId,
        turnId: request.turnId,
        taskId: request.taskId,
        runId: request.runId,
        payload,
      });
      this.sequenceByRun.set(request.runId, sequence);
      const acceptedSequence = receipt?.seq ?? receipt?.sequence ?? sequence;
      if (!Number.isInteger(acceptedSequence) || acceptedSequence < 1) {
        throw new Error('Event sink returned an invalid accepted sequence');
      }
      this.acceptedSequenceByRun.set(request.runId, acceptedSequence);
    } catch (error) {
      const eventStoreError = new AgentError(
        AgentErrorCode.EVENT_STORE_FAILED,
        `Event persistence failed during ${stage}: ${errorMessage(error)}`,
        {
          runId: request.runId,
          eventType: type,
          sequence,
          stage,
        },
        stage === 'finalizing'
          ? '业务结局已保留，但审计轨迹不完整；修复存储后再开始后续 Turn。'
          : '停止当前 Turn，修复事件存储容量、权限或连接后再重试。',
      );
      this.storageFailureByRun.set(request.runId, {
        stage,
        error: eventStoreError,
      });
      throw eventStoreError;
    }
  }
}
