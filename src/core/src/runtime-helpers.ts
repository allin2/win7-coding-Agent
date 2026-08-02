import * as crypto from 'crypto';

import { ContextItem, ContextManifest } from './context-manager';
import { estimateContextTokens } from './token-estimator';
import { AgentError, AgentErrorCode } from './errors';
import {
  ToolObservation,
  createToolObservation,
  foldToolObservation,
} from './tool-observation';
import { ToolSpec } from './tools';
import { ToolCall } from './types';
import {
  EvidenceBundle,
  TaskAcceptance,
  VerificationRequirement,
} from './verification';
import {
  InterruptCause,
  RuntimeMessage,
  RuntimePlan,
  RuntimeRequest,
  RuntimeStorageFailure,
  ToolExecutionResult,
  TurnInterrupted,
  VerificationFeedback,
} from './runtime-types';

export class TurnControl {
  private readonly controller = new AbortController();
  private readonly timer: NodeJS.Timeout;
  private readonly externalSignal?: AbortSignal;
  private readonly onExternalAbort: () => void;
  cause?: InterruptCause;

  constructor(externalSignal: AbortSignal | undefined, maxWallMs: number) {
    this.externalSignal = externalSignal;
    this.onExternalAbort = () => this.abort('user_cancelled');
    if (externalSignal?.aborted) {
      this.abort('user_cancelled');
    } else {
      externalSignal?.addEventListener('abort', this.onExternalAbort, {
        once: true,
      });
    }
    this.timer = setTimeout(
      () => this.abort('wall_budget_exceeded'),
      maxWallMs,
    );
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  abort(cause: InterruptCause): void {
    if (this.controller.signal.aborted) return;
    this.cause = cause;
    this.controller.abort();
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.externalSignal?.removeEventListener(
      'abort',
      this.onExternalAbort,
    );
  }
}

export function validateTaskAcceptance(acceptance: TaskAcceptance | undefined): asserts acceptance is TaskAcceptance {
  if (!acceptance || acceptance.schemaVersion !== '1.0' || !Array.isArray(acceptance.checks)) {
    throw new AgentError(
      AgentErrorCode.RUNTIME_INPUT_INVALID,
      'RuntimeRequest must include a TaskAcceptance v1.0 contract',
      {},
      '由任务编排边界提供至少一个稳定、可验证的完成检查；模型计划不能替代它。',
    );
  }
  const seen = new Set<string>();
  if (acceptance.checks.length === 0 || acceptance.checks.some((check) => {
    if (!check || !check.checkId || !check.description || seen.has(check.checkId)) return true;
    seen.add(check.checkId);
    return false;
  })) {
    throw new AgentError(
      AgentErrorCode.RUNTIME_INPUT_INVALID,
      'TaskAcceptance must contain non-empty, uniquely identified checks',
      { checkIds: acceptance.checks.map((check) => check?.checkId) },
      '为每个验收条件提供唯一 checkId 和可理解的描述；不要使用模型输出定义完成条件。',
    );
  }
}

export function createVerificationFeedback(
  bundle: EvidenceBundle,
  gateId: string,
  attempt: number,
): VerificationFeedback {
  const failures = bundle.failures.slice();
  return {
    schemaVersion: '1.0',
    gateId,
    attempt,
    maxAttempts: 3,
    evidenceDigestSha256: bundle.digestSha256,
    failures,
    content: [
      `Verification gate ${gateId} failed (repair attempt ${attempt}/3).`,
      ...failures.map((failure) => `- ${failure}`),
      'Repair the underlying work, then return an updated plan or final response. Do not claim completion until this gate passes.',
    ].join('\n'),
  };
}

export function validatePlan(plan: RuntimePlan): void {
  if (plan.schemaVersion !== '1.0' || !plan.summary) {
    throw new AgentError(
      AgentErrorCode.MODEL_FAILED,
      'Model returned an invalid RuntimePlan',
    );
  }
  if (
    plan.usage &&
    (
      !Number.isInteger(plan.usage.inputTokens) ||
      plan.usage.inputTokens < 0 ||
      !Number.isInteger(plan.usage.outputTokens) ||
      plan.usage.outputTokens < 0
    )
  ) {
    throw new AgentError(
      AgentErrorCode.MODEL_FAILED,
      'Model returned invalid token usage',
    );
  }
  const ids = new Set<string>();
  for (const { call } of plan.toolCalls) {
    if (!call.id || ids.has(call.id)) {
      throw new AgentError(
        AgentErrorCode.MODEL_FAILED,
        `Tool call id is empty or duplicated: ${call.id}`,
      );
    }
    ids.add(call.id);
  }
}

export function normalizeToolResult(
  result: ToolExecutionResult,
  call: ToolCall,
): ToolExecutionResult {
  return {
    ...result,
    callId: call.id,
    toolName: call.toolName,
    status: result.status ?? (result.success ? 'succeeded' : 'failed'),
  };
}

export function cloneMessage(message: RuntimeMessage): RuntimeMessage {
  return {
    ...message,
    ...(message.toolCalls
      ? { toolCalls: message.toolCalls.map(cloneToolCall) }
      : {}),
    ...(message.observation
      ? { observation: { ...message.observation } }
      : {}),
  };
}

export function cloneToolCall(call: ToolCall): ToolCall {
  return {
    ...call,
    args: cloneJson(call.args) as Record<string, unknown>,
    ...(call.approvalContext
      ? { approvalContext: { ...call.approvalContext } }
      : {}),
  };
}

export function cloneJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, cloneJson(item)]),
    );
  }
  return value;
}

export function cloneToolSpec(tool: ToolSpec): ToolSpec {
  return {
    ...tool,
    inputSchema: {
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.properties).map(([name, property]) => [
          name,
          {
            ...property,
            ...(property.enum ? { enum: [...property.enum] } : {}),
            ...(Array.isArray(property.default) ? { default: [...property.default] } : {}),
          },
        ]),
      ),
      required: [...tool.inputSchema.required],
      additionalProperties: tool.inputSchema.additionalProperties ?? false,
    },
  };
}

/** Build the model-only projection; RuntimeRequest is intentionally excluded. */
export function projectModelMessages(
  contextItems: readonly ContextItem[],
  history: readonly RuntimeMessage[],
): RuntimeMessage[] {
  const toMessage = (item: ContextItem): RuntimeMessage => ({
    role: item.kind === 'task' ? 'user' : 'system',
    content: item.content,
  });
  const prefix = contextItems
    .filter((item) => item.placement !== 'tail')
    .map(toMessage);
  const tail = contextItems
    .filter((item) => item.placement === 'tail')
    .map(toMessage);
  return [...prefix, ...foldStaleToolMessages(history), ...tail];
}

/**
 * Fold in batches of eight so the cache prefix changes occasionally rather
 * than after every tool call. The last four observations always remain full.
 */
export function foldStaleToolMessages(history: readonly RuntimeMessage[]): RuntimeMessage[] {
  const observationIndexes = history.flatMap((message, index) =>
    message.role === 'tool' && message.observation ? [index] : []);
  const foldCount = Math.floor(Math.max(0, observationIndexes.length - 4) / 8) * 8;
  const foldedIndexes = new Set(observationIndexes.slice(0, foldCount));
  return history.map((message, index) => {
    const cloned = cloneMessage(message);
    if (!foldedIndexes.has(index) || !cloned.observation || !cloned.toolCallId) return cloned;
    const observation = foldToolObservation(cloned.observation, cloned.toolCallId);
    return {
      ...cloned,
      content: JSON.stringify(observation),
      observation,
    };
  });
}

export function runMetadata(request: RuntimeRequest): Pick<RuntimeRequest, 'sessionId' | 'threadId' | 'turnId' | 'taskId' | 'runId'> {
  const { sessionId, threadId, turnId, taskId, runId } = request;
  return { sessionId, threadId, turnId, taskId, runId };
}

export function digestToolCatalog(tools: readonly ToolSpec[]): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify(tools.map((tool) => ({
      name: tool.name,
      schemaVersion: tool.schemaVersion,
      description: tool.description,
      capability: tool.capability,
      approvalLevel: tool.approvalLevel,
      inputSchema: tool.inputSchema,
    }))), 'utf8')
    .digest('hex');
}

export function estimateProjectedTokens(
  contextItems: readonly ContextItem[],
  messages: readonly RuntimeMessage[],
  tools: readonly ToolSpec[],
): number {
  const projection = projectModelMessages(contextItems, messages);
  return projection.reduce(
    (total, message) => total + estimateContextTokens(message.content).tokens,
    estimateContextTokens(JSON.stringify(tools)).tokens,
  );
}

export function mergeToolCatalog(tools: readonly ToolSpec[], internal: ToolSpec): ToolSpec[] {
  if (tools.some((tool) => tool.name === internal.name)) {
    throw new Error(`Reserved internal tool is already registered: ${internal.name}`);
  }
  return [...tools.map(cloneToolSpec), cloneToolSpec(internal)]
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function normalizeProjectedMessage(value: unknown): RuntimeMessage {
  if (!value || typeof value !== 'object') {
    throw new AgentError(AgentErrorCode.RUNTIME_INPUT_INVALID, 'Projected message must be an object');
  }
  const message = value as Record<string, unknown>;
  if (!['system', 'user', 'assistant', 'tool'].includes(String(message.role)) || typeof message.content !== 'string') {
    throw new AgentError(AgentErrorCode.RUNTIME_INPUT_INVALID, 'Projected message has an invalid role or content');
  }
  const normalized: RuntimeMessage = {
    role: message.role as RuntimeMessage['role'],
    content: message.content,
  };
  if (typeof message.toolCallId === 'string') normalized.toolCallId = message.toolCallId;
  if (Array.isArray(message.toolCalls)) normalized.toolCalls = message.toolCalls.map((call) => cloneToolCall(call as ToolCall));
  if (isToolObservation(message.observation)) {
    normalized.observation = { ...message.observation };
  }
  return normalized;
}

function isToolObservation(value: unknown): value is ToolObservation {
  if (!value || typeof value !== 'object') return false;
  const observation = value as Record<string, unknown>;
  return observation.schemaVersion === '1.0' &&
    typeof observation.content === 'string' &&
    typeof observation.truncated === 'boolean' &&
    typeof observation.originalChars === 'number' &&
    typeof observation.sha256 === 'string' &&
    (observation.state === 'full' || observation.state === 'folded');
}

export function raceWithAbort<T>(
  promise: Promise<T>,
  control: TurnControl,
): Promise<T> {
  if (control.signal.aborted) {
    return Promise.reject(
      new TurnInterrupted(control.cause ?? 'user_cancelled'),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      cleanup();
      reject(new TurnInterrupted(control.cause ?? 'user_cancelled'));
    };
    const cleanup = (): void => {
      control.signal.removeEventListener('abort', onAbort);
    };
    control.signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export async function abortableDelay(
  delayMs: number,
  control: TurnControl,
): Promise<void> {
  if (delayMs <= 0) return;
  await raceWithAbort(
    new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
    control,
  );
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`cleanup timeout after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runtimeInputError(
  message: string,
  cause: unknown,
  request: RuntimeRequest,
): AgentError {
  return new AgentError(
    AgentErrorCode.RUNTIME_INPUT_INVALID,
    `${message}: ${errorMessage(cause)}`,
    {
      sessionId: request.sessionId,
      threadId: request.threadId,
      turnId: request.turnId,
      runId: request.runId,
    },
    '修正请求、上下文预算、Turn 预算或 Checkpoint 版本后重试。',
  );
}

export function runtimeFailure(
  failure: unknown,
  request: RuntimeRequest,
): AgentError {
  if (failure instanceof AgentError) return failure;
  return new AgentError(
    AgentErrorCode.INTERNAL,
    errorMessage(failure),
    { runId: request.runId },
    '检查结构化事件与 Core 编排器状态；不要把内部异常归因于模型。',
  );
}

export function isEventStoreFailure(error: unknown): error is AgentError {
  return (
    error instanceof AgentError &&
    error.code === AgentErrorCode.EVENT_STORE_FAILED
  );
}
