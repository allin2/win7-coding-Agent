/**
 * @module a9-agent-loop
 * @description A9 真实模型驱动的 Agent 循环与编码工作流执行器 (PRD §5, §6 / ADR-0089)
 *
 * 权限模式契约（A9-01）：
 * - READ_ONLY：只注册只读工具；list/read/search/update_plan 直接允许，不请求写能力令牌；
 *   写、删除、shell 既不暴露给模型，模型误调用时按结构化错误回执。
 * - REVIEW：读工具直接允许；write/edit/copy/move/delete 只进入 Review staging，
 *   不直接写正式工作区；shell 需要用户审批后执行。
 * - FULL_ACCESS：按 ToolSpec 审批级直通，仅 A9-M03 始终确认操作进入审批。
 * 所有工具调用先经 ToolRegistry 严格 JSON Schema 校验（必填/类型/
 * additionalProperties:false/未知工具/别名映射），NEEDS_APPROVAL 挂起保留原始
 * tool call，审批后可恢复继续。
 */

import {
  PermissionMode,
  ApprovalLevel,
  PolicyVerdict,
} from './types';
import { PolicyEngine } from './policy';
import { ToolRegistry } from './tools';
import { a9ToolSpecs, normalizeToolCallArgs } from './a9-tools';
import { buildA9SystemPrompt } from './system-prompt';
import { LoopDetector, TurnOutcome } from './loop-control';
import { AgentError, AgentErrorCode } from './errors';

export interface A9LoopEvent {
  type:
    | 'turn_started'
    | 'model_thinking'
    | 'model_chunk'
    | 'tool_start'
    | 'tool_end'
    | 'approval_required'
    | 'plan_updated'
    | 'turn_completed'
    | 'turn_failed';
  turnId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface A9ModelToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** 会话历史消息。assistant 消息携带 toolCalls，tool 消息携带 toolCallId 与工具名，
 * Provider 负责按 OpenAI 协议组装 assistant.tool_calls / tool.tool_call_id。 */
export interface A9LoopMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: A9ModelToolCall[];
}

export interface A9ModelPort {
  sendStreamRequest(
    request: {
      id: string;
      model?: string;
      messages: A9LoopMessage[];
      tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
      toolChoice?: 'auto' | 'none';
      temperature?: number;
    },
    onChunk: (chunk: { content: string; index: number }) => void,
    options?: { signal?: AbortSignal },
  ): Promise<{
    id: string;
    content: string;
    finishReason: string;
    toolCalls?: A9ModelToolCall[];
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>;
}

export interface A9WorkspacePort {
  list(path?: string, options?: { recursive?: boolean; maxEntries?: number }): Promise<any>;
  read(path: string, options?: { startLine?: number; maxLines?: number; encoding?: string }): Promise<any>;
  search(pattern: string, options?: { path?: string; isRegex?: boolean; maxMatches?: number }): Promise<any>;
  write(path: string, content: string, options?: { encoding?: string; turnId?: string }): Promise<any>;
  edit(path: string, oldText: string, newText: string, options?: { turnId?: string }): Promise<any>;
  copy(src: string, dest: string, options?: { overwrite?: boolean; turnId?: string }): Promise<any>;
  move(src: string, dest: string, options?: { overwrite?: boolean; turnId?: string }): Promise<any>;
  delete(path: string, options?: { recursive?: boolean; permanent?: boolean; turnId?: string }): Promise<any>;
}

/** Review 模式写操作进入准备区；实现方必须保证对正式工作区零副作用。 */
export interface A9ReviewStagingPort {
  stageWrite(path: string, content: string, options?: { encoding?: string; turnId?: string }): Promise<unknown>;
  stageEdit(path: string, oldText: string, newText: string, options?: { turnId?: string }): Promise<unknown>;
  stageCopy(source: string, destination: string, options?: { overwrite?: boolean; turnId?: string }): Promise<unknown>;
  stageMove(source: string, destination: string, options?: { overwrite?: boolean; turnId?: string }): Promise<unknown>;
  stageDelete(path: string, options?: { recursive?: boolean; turnId?: string }): Promise<unknown>;
}

export interface A9RunnerPort {
  execute(command: string, options?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
  }>;
}

export interface A9AgentLoopConfig {
  workspaceRoot: string;
  provider: A9ModelPort;
  workspaceService: A9WorkspacePort;
  runner: A9RunnerPort;
  /** Review 模式必填：缺失时 Review 写操作按结构化错误拒绝，绝不直写工作区。 */
  reviewStaging?: A9ReviewStagingPort;
  policyEngine?: PolicyEngine;
  permissionMode?: PermissionMode;
  maxStepsPerTurn?: number;
  /** 单个工具结果进入模型历史的字符上限，防止上下文无限膨胀。 */
  maxToolResultChars?: number;
  onEvent?: (event: A9LoopEvent) => void;
}

export interface A9PendingToolCall {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
}

export interface A9TurnResult {
  turnId: string;
  outcome: TurnOutcome;
  finalMessage: string;
  totalSteps: number;
  toolCallsExecuted: number;
  plan?: A9VisiblePlan;
  pendingApproval?: A9PendingToolCall;
}

export interface A9VisiblePlan {
  plan: string;
  explanation: string;
  updatedAt: string;
}

interface SuspendedTurn {
  turnId: string;
  signal?: AbortSignal;
  stepCount: number;
  toolCallsExecuted: number;
  queue: A9ModelToolCall[];
  pending: A9ModelToolCall;
  reason: string;
}

/** 进入模型历史的工具结果默认上限（约 16 KiB）。 */
const DEFAULT_MAX_TOOL_RESULT_CHARS = 16 * 1024;

export class A9AgentLoop {
  private readonly policyEngine: PolicyEngine;
  private readonly permissionMode: PermissionMode;
  private readonly toolRegistry: ToolRegistry;
  private readonly loopDetector = new LoopDetector(3);
  private readonly conversationHistory: A9LoopMessage[] = [];
  private readonly maxToolResultChars: number;
  private suspended: SuspendedTurn | undefined;
  private currentTurnId = '';
  private visiblePlan: A9VisiblePlan | undefined;

  constructor(private readonly config: A9AgentLoopConfig) {
    this.permissionMode = config.permissionMode ?? PermissionMode.FULL_ACCESS;
    this.policyEngine = config.policyEngine ?? new PolicyEngine();
    this.maxToolResultChars = config.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS;
    // 工具目录按模式生成：Read Only 不注册写/删除/shell，模型不可见。
    this.toolRegistry = new ToolRegistry();
    for (const spec of a9ToolSpecs(this.permissionMode)) {
      this.toolRegistry.register(spec);
    }
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  /** 当前对模型可见的工具名列表（Read Only 下不含写、删除和 shell）。 */
  getVisibleTools(): string[] {
    return this.toolRegistry.list().map((spec) => spec.name);
  }

  getCurrentPlan(): A9VisiblePlan | undefined {
    return this.visiblePlan ? { ...this.visiblePlan } : undefined;
  }

  getConversationHistory(): A9LoopMessage[] {
    return this.conversationHistory.map((message) => ({ ...message }));
  }

  /**
   * 执行一轮交互 Turn。若返回 NEEDS_APPROVAL，原 tool call 保留在挂起状态，
   * 可调用 `resumeAfterApproval` 恢复。
   */
  async runTurn(userPrompt: string, options: { signal?: AbortSignal } = {}): Promise<A9TurnResult> {
    this.suspended = undefined;
    // 循环检测按 Turn 重置，避免跨用户 Turn 累积误判。
    this.loopDetector.reset();
    const turnId = `turn-${Date.now()}`;
    this.currentTurnId = turnId;
    const maxSteps = this.config.maxStepsPerTurn || 30;

    this.emitEvent({
      type: 'turn_started',
      turnId,
      timestamp: new Date().toISOString(),
      data: { userPrompt, mode: this.permissionMode },
    });

    if (!this.conversationHistory.some((m) => m.role === 'system')) {
      const systemPromptContract = buildA9SystemPrompt({
        cwd: this.config.workspaceRoot,
        mode: this.permissionMode,
      });
      this.conversationHistory.push({ role: 'system', content: systemPromptContract.content });
    }

    this.conversationHistory.push({ role: 'user', content: userPrompt });

    return this.runLoop(turnId, options.signal, 0, 0, []);
  }

  /**
   * 审批后恢复挂起的 Turn。
   * - approved=true：执行原 tool call 并继续循环；
   * - approved=false：向模型回执“用户已拒绝”，原 tool call 零副作用。
   */
  async resumeAfterApproval(approved: boolean, options: { signal?: AbortSignal } = {}): Promise<A9TurnResult> {
    const suspended = this.suspended;
    if (!suspended) {
      throw new AgentError(AgentErrorCode.RUNTIME_INPUT_INVALID, 'No suspended turn awaiting approval.', {}, '先通过 runTurn 触发 NEEDS_APPROVAL。');
    }
    this.suspended = undefined;
    const { turnId } = suspended;

    if (!approved) {
      this.conversationHistory.push({
        role: 'tool',
        toolCallId: suspended.pending.id,
        toolName: suspended.pending.name,
        content: `User denied the approval request. The operation was NOT executed. Reason: ${suspended.reason}. Adjust your approach or ask the user how to proceed.`,
      });
      this.emitEvent({
        type: 'tool_end',
        turnId,
        timestamp: new Date().toISOString(),
        data: { toolName: suspended.pending.name, denied: true, sideEffects: 0 },
      });
      return this.runLoop(turnId, options.signal ?? suspended.signal, suspended.stepCount, suspended.toolCallsExecuted, suspended.queue);
    }

    const result = await this.executeValidatedToolCall(turnId, suspended.pending, suspended.signal);
    return this.runLoop(
      turnId,
      options.signal ?? suspended.signal,
      suspended.stepCount,
      suspended.toolCallsExecuted + (result.executed ? 1 : 0),
      suspended.queue,
    );
  }

  private async runLoop(
    turnId: string,
    signal: AbortSignal | undefined,
    startSteps: number,
    startToolCalls: number,
    leadingQueue: A9ModelToolCall[],
  ): Promise<A9TurnResult> {
    const maxSteps = this.config.maxStepsPerTurn || 30;
    let stepCount = startSteps;
    let toolCallsExecuted = startToolCalls;

    // 先消费审批挂起时未执行的同一批 tool call。
    if (leadingQueue.length > 0) {
      const queueResult = await this.drainToolCallQueue(turnId, signal, leadingQueue, stepCount, toolCallsExecuted);
      if (queueResult.kind === 'suspended') return queueResult.result;
      if (queueResult.kind === 'final') return queueResult.result;
      stepCount = queueResult.stepCount;
      toolCallsExecuted = queueResult.toolCallsExecuted;
    }

    const specs = this.toolRegistry.list();
    const openAITools = specs.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as unknown as Record<string, unknown>,
    }));

    while (stepCount < maxSteps) {
      if (signal?.aborted) {
        return this.finalize(turnId, {
          turnId,
          outcome: TurnOutcome.CANCELLED,
          finalMessage: 'Turn cancelled by user',
          totalSteps: stepCount,
          toolCallsExecuted,
        });
      }

      stepCount++;

      this.emitEvent({
        type: 'model_thinking',
        turnId,
        timestamp: new Date().toISOString(),
        data: { step: stepCount },
      });

      let response: {
        id: string;
        content: string;
        finishReason: string;
        toolCalls?: A9ModelToolCall[];
      };

      try {
        response = await this.config.provider.sendStreamRequest(
          {
            id: `req-${turnId}-${stepCount}`,
            messages: this.conversationHistory,
            tools: openAITools,
            toolChoice: 'auto',
          },
          (chunk) => {
            this.emitEvent({
              type: 'model_chunk',
              turnId,
              timestamp: new Date().toISOString(),
              data: { content: chunk.content },
            });
          },
          { signal },
        );
      } catch (err: any) {
        this.emitEvent({
          type: 'turn_failed',
          turnId,
          timestamp: new Date().toISOString(),
          data: { error: err.message },
        });
        return this.finalize(turnId, {
          turnId,
          outcome: TurnOutcome.FAILED,
          finalMessage: `Model invocation failed: ${err.message}`,
          totalSteps: stepCount,
          toolCallsExecuted,
        });
      }

      const toolCalls = response.toolCalls || [];

      // 模型未调用工具：给出最终结论，Turn 完成。
      if (toolCalls.length === 0) {
        const finalContent = response.content || 'Task complete.';
        this.conversationHistory.push({
          role: 'assistant',
          content: finalContent,
        });
        return this.finalize(turnId, {
          turnId,
          outcome: TurnOutcome.COMPLETED,
          finalMessage: finalContent,
          totalSteps: stepCount,
          toolCallsExecuted,
        }, 'turn_completed', { finalMessage: response.content });
      }

      // 保留 assistant tool_calls 协议事实，供下一轮模型请求组装。
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content || '',
        toolCalls: toolCalls.map((tc) => ({ ...tc })),
      });

      const queueResult = await this.drainToolCallQueue(turnId, signal, toolCalls, stepCount, toolCallsExecuted);
      if (queueResult.kind === 'suspended') return queueResult.result;
      if (queueResult.kind === 'final') return queueResult.result;
      stepCount = queueResult.stepCount;
      toolCallsExecuted = queueResult.toolCallsExecuted;
    }

    return this.finalize(turnId, {
      turnId,
      outcome: TurnOutcome.BUDGET_EXCEEDED,
      finalMessage: `Turn reached max step limit (${maxSteps})`,
      totalSteps: stepCount,
      toolCallsExecuted,
    });
  }

  private async drainToolCallQueue(
    turnId: string,
    signal: AbortSignal | undefined,
    queue: A9ModelToolCall[],
    stepCount: number,
    toolCallsExecuted: number,
  ): Promise<
    | { kind: 'continue'; stepCount: number; toolCallsExecuted: number }
    | { kind: 'suspended'; result: A9TurnResult }
    | { kind: 'final'; result: A9TurnResult }
  > {
    let executed = toolCallsExecuted;
    for (let index = 0; index < queue.length; index++) {
      const tc = queue[index];
      if (signal?.aborted) {
        return {
          kind: 'final',
          result: this.finalize(turnId, {
            turnId,
            outcome: TurnOutcome.CANCELLED,
            finalMessage: 'Turn cancelled by user',
            totalSteps: stepCount,
            toolCallsExecuted: executed,
          }),
        };
      }

      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
        if (parsedArgs === null || typeof parsedArgs !== 'object' || Array.isArray(parsedArgs)) {
          throw new Error('not an object');
        }
      } catch (_e) {
        this.conversationHistory.push({
          role: 'tool',
          toolCallId: tc.id,
          toolName: tc.name,
          content: `Error: tool arguments must be a JSON object. Got: ${String(tc.arguments).slice(0, 200)}`,
        });
        continue;
      }

      // 循环卡死检测（同一 Turn 内连续重复）。
      if (this.loopDetector.observe(tc.name, parsedArgs)) {
        return {
          kind: 'final',
          result: this.finalize(turnId, {
            turnId,
            outcome: TurnOutcome.STUCK,
            finalMessage: `Agent loop detected: tool ${tc.name} repeated 3 times with identical arguments without making progress.`,
            totalSteps: stepCount,
            toolCallsExecuted: executed,
          }),
        };
      }

      // 未知工具：结构化回执，不执行。
      let specApprovalLevel: ApprovalLevel;
      try {
        specApprovalLevel = this.toolRegistry.resolve(tc.name).approvalLevel;
      } catch (_err) {
        this.conversationHistory.push({
          role: 'tool',
          toolCallId: tc.id,
          toolName: tc.name,
          content: `Error: unknown or unavailable tool '${tc.name}' in ${this.permissionMode} mode. Available tools: ${this.getVisibleTools().join(', ')}.`,
        });
        continue;
      }

      // 别名规范化 + ToolRegistry 严格校验（必填/类型/additionalProperties）。
      const aliasedArgs = normalizeToolCallArgs(tc.name, parsedArgs);
      let validatedCall: { id: string; toolName: string; args: Record<string, unknown>; approvalLevel: ApprovalLevel };
      try {
        validatedCall = this.toolRegistry.normalizeCall({
          id: tc.id,
          toolName: tc.name,
          args: aliasedArgs,
          approvalLevel: specApprovalLevel,
        });
      } catch (err: any) {
        this.conversationHistory.push({
          role: 'tool',
          toolCallId: tc.id,
          toolName: tc.name,
          content: `Error: tool input validation failed for ${tc.name}: ${err.message}`,
        });
        continue;
      }

      // Review 模式的写工具直接进入 staging（对正式工作区零副作用），不经 PolicyEngine 请求写令牌。
      if (this.permissionMode === PermissionMode.REVIEW && this.isStagedWriteTool(tc.name)) {
        if (!this.config.reviewStaging) {
          this.conversationHistory.push({
            role: 'tool',
            toolCallId: tc.id,
            toolName: tc.name,
            content: `Error: REVIEW mode requires a review staging backend, which is not configured. The write was NOT performed.`,
          });
          continue;
        }
        const staged = await this.executeStagedWrite(turnId, tc, validatedCall.args);
        this.conversationHistory.push({
          role: 'tool',
          toolCallId: tc.id,
          toolName: tc.name,
          content: staged,
        });
        executed++;
        continue;
      }

      const decision = this.policyEngine.evaluate({
        id: tc.id,
        toolName: tc.name,
        args: validatedCall.args,
        approvalLevel: specApprovalLevel,
      });

      if (decision.verdict === PolicyVerdict.DENY) {
        this.conversationHistory.push({
          role: 'tool',
          toolCallId: tc.id,
          toolName: tc.name,
          content: `Error: Tool execution denied by policy: ${tc.name} (${decision.ruleId}: ${decision.reason ?? ''})`,
        });
        continue;
      }

      if (decision.verdict === PolicyVerdict.ASK) {
        this.emitEvent({
          type: 'approval_required',
          turnId,
          timestamp: new Date().toISOString(),
          data: { toolName: tc.name, args: validatedCall.args, callId: tc.id, reason: decision.reason },
        });
        // 挂起：保留原 tool call 与同批剩余队列，审批后恢复。
        this.suspended = {
          turnId,
          signal,
          stepCount,
          toolCallsExecuted: executed,
          queue: queue.slice(index + 1),
          pending: { ...tc },
          reason: decision.reason || 'Policy requires user approval for high impact operation',
        };
        return {
          kind: 'suspended',
          result: this.finalize(turnId, {
            turnId,
            outcome: TurnOutcome.NEEDS_APPROVAL,
            finalMessage: `High impact operation requires confirmation: ${tc.name}`,
            totalSteps: stepCount,
            toolCallsExecuted: executed,
            pendingApproval: {
              callId: tc.id,
              toolName: tc.name,
              args: validatedCall.args,
              reason: decision.reason || 'Policy requires user approval for high impact operation',
            },
          }),
        };
      }

      const execResult = await this.executeValidatedToolCall(turnId, { ...tc }, signal);
      if (execResult.executed) executed++;
    }
    return { kind: 'continue', stepCount, toolCallsExecuted: executed };
  }

  private isStagedWriteTool(name: string): boolean {
    return ['write', 'edit', 'copy', 'move', 'delete'].includes(name);
  }

  private async executeStagedWrite(
    turnId: string,
    tc: A9ModelToolCall,
    args: Record<string, any>,
  ): Promise<string> {
    const staging = this.config.reviewStaging!;
    this.emitEvent({
      type: 'tool_start',
      turnId,
      timestamp: new Date().toISOString(),
      data: { toolName: tc.name, args, staged: true },
    });
    let staged: unknown;
    try {
      switch (tc.name) {
        case 'write':
          staged = await staging.stageWrite(args.path, args.content, { encoding: args.encoding, turnId });
          break;
        case 'edit':
          staged = await staging.stageEdit(args.path, args.oldText, args.newText, { turnId });
          break;
        case 'copy':
          staged = await staging.stageCopy(args.source, args.destination, { overwrite: args.overwrite, turnId });
          break;
        case 'move':
          staged = await staging.stageMove(args.source, args.destination, { overwrite: args.overwrite, turnId });
          break;
        case 'delete':
          staged = await staging.stageDelete(args.path, { recursive: args.recursive, turnId });
          break;
        default:
          throw new Error(`Not a staged write tool: ${tc.name}`);
      }
    } catch (err: any) {
      const message = `Error: staging ${tc.name} failed: ${err.message}`;
      this.emitEvent({
        type: 'tool_end',
        turnId,
        timestamp: new Date().toISOString(),
        data: { toolName: tc.name, staged: true, error: err.message },
      });
      return message;
    }
    const message = `Change staged for user review (not applied to workspace): ${JSON.stringify(staged)}`;
    this.emitEvent({
      type: 'tool_end',
      turnId,
      timestamp: new Date().toISOString(),
      data: { toolName: tc.name, staged: true, result: message.slice(0, 1000) },
    });
    return message;
  }

  private async executeValidatedToolCall(
    turnId: string,
    tc: A9ModelToolCall,
    signal: AbortSignal | undefined,
  ): Promise<{ executed: boolean; result: string }> {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
    } catch (_e) {
      parsedArgs = {};
    }
    const spec = this.toolRegistry.resolve(tc.name);
    const validatedCall = this.toolRegistry.normalizeCall({
      id: tc.id,
      toolName: tc.name,
      args: normalizeToolCallArgs(tc.name, parsedArgs),
      approvalLevel: spec.approvalLevel,
    });
    const args = validatedCall.args as Record<string, any>;

    this.emitEvent({
      type: 'tool_start',
      turnId,
      timestamp: new Date().toISOString(),
      data: { toolName: tc.name, args },
    });

    let toolResultStr = '';
    let executed = false;
    try {
      const result = await this.dispatchTool(tc.name, args, turnId, signal);
      toolResultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      executed = true;
    } catch (err: any) {
      toolResultStr = `Tool execution error: ${err.message}`;
    }

    if (toolResultStr.length > this.maxToolResultChars) {
      toolResultStr = `${toolResultStr.slice(0, this.maxToolResultChars)}\n[Tool output truncated at ${this.maxToolResultChars} characters]`;
    }

    this.emitEvent({
      type: 'tool_end',
      turnId,
      timestamp: new Date().toISOString(),
      data: { toolName: tc.name, result: toolResultStr.slice(0, 1000) },
    });

    this.conversationHistory.push({
      role: 'tool',
      toolCallId: tc.id,
      toolName: tc.name,
      content: toolResultStr,
    });
    return { executed, result: toolResultStr };
  }

  private async dispatchTool(
    name: string,
    args: Record<string, any>,
    turnId: string,
    signal?: AbortSignal,
  ): Promise<any> {
    const ws = this.config.workspaceService;
    switch (name) {
      case 'list':
        return await ws.list(args.path ?? '', { recursive: args.recursive, maxEntries: args.maxEntries });
      case 'read':
        return await ws.read(args.path, { startLine: args.startLine, maxLines: args.maxLines, encoding: args.encoding });
      case 'search':
        return await ws.search(args.pattern, { path: args.path, isRegex: args.isRegex, maxMatches: args.maxMatches });
      case 'write':
        return await ws.write(args.path, args.content, { encoding: args.encoding, turnId });
      case 'edit':
        return await ws.edit(args.path, args.oldText, args.newText, { turnId });
      case 'copy':
        return await ws.copy(args.source, args.destination, { overwrite: args.overwrite, turnId });
      case 'move':
        return await ws.move(args.source, args.destination, { overwrite: args.overwrite, turnId });
      case 'delete':
        return await ws.delete(args.path, { recursive: args.recursive, permanent: args.permanent, turnId });
      case 'shell':
        // timeoutMs 为可选软 deadline；未提供时不施加固定硬超时（A9/C08 局部取代）。
        return await this.config.runner.execute(args.command, {
          cwd: args.cwd || undefined,
          timeoutMs: args.timeoutMs,
          signal,
        });
      case 'update_plan': {
        this.visiblePlan = {
          plan: args.plan,
          explanation: args.explanation ?? '',
          updatedAt: new Date().toISOString(),
        };
        this.emitEvent({
          type: 'plan_updated',
          turnId,
          timestamp: new Date().toISOString(),
          data: { plan: args.plan, explanation: args.explanation ?? '' },
        });
        return {
          success: true,
          plan: args.plan,
          explanation: args.explanation ?? '',
          note: 'Plan updated and visible to the user.',
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private finalize(
    turnId: string,
    result: A9TurnResult,
    eventType: 'turn_completed' | 'turn_failed' | undefined = undefined,
    eventData: Record<string, unknown> = {},
  ): A9TurnResult {
    const withPlan = this.visiblePlan ? { ...result, plan: { ...this.visiblePlan } } : result;
    if (eventType) {
      this.emitEvent({ type: eventType, turnId, timestamp: new Date().toISOString(), data: eventData });
    }
    return withPlan;
  }

  private emitEvent(event: A9LoopEvent): void {
    if (this.config.onEvent) {
      try {
        this.config.onEvent(event);
      } catch (_e) {}
    }
  }
}
