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
import * as crypto from 'crypto';
import { AgentError, AgentErrorCode } from './errors';
import { classifyGitCommand, GitCommandApprovalBinding } from './git-command-policy';

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
  read(path: string, options?: { startLine?: number; maxLines?: number; encoding?: string; signal?: AbortSignal }): Promise<any>;
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

export interface A9RunnerExecutionOptions {
  cwd?: string;
  /** 可选任务级 deadline；未提供时不施加固定硬超时（A9/C08）。 */
  timeoutMs?: number;
  signal?: AbortSignal;
  background?: boolean;
  shellKind?: string;
  shellPath?: string;
  /** 产品级环境覆盖（工作区设置），不来自模型参数。 */
  envOverlay?: Record<string, string>;
  maxOutputBytes?: number;
}

export interface A9RunnerExecutionResult {
  status?: 'exited' | 'timeout' | 'cancelled' | 'failed' | 'background_started';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated?: boolean;
  cancelled?: boolean;
  rawStdoutBytes?: number;
  rawStderrBytes?: number;
  /** 有界原始日志路径（stdout/stderr），预览截断后仍可回看。 */
  logPaths?: { stdout: string; stderr: string };
  backgroundHandle?: string;
  processTreeReaped?: boolean;
  residueRisk?: boolean;
  softDurationExceeded?: boolean;
}

export interface A9RunnerPort {
  execute(command: string, options?: A9RunnerExecutionOptions): Promise<A9RunnerExecutionResult>;
}

/** R3：外部变化报告（与 workspace ExternalChangeReport 结构一致）。 */
export interface A9ExternalChangeReport {
  changes: Array<{ path: string; kind: 'created' | 'modified' | 'deleted' | 'renamed'; recoverable: boolean; restoredVia?: string }>;
  unrecoverable: Array<{ path: string; kind: string; reason: string }>;
}

/** R3：Shell/Git/项目脚本外部变化的轮前基线与轮后收集端口。 */
export interface A9ExternalChangePort {
  freezeTurnBaseline(turnId: string, options?: { signal?: AbortSignal }): Promise<unknown>;
  collectExternalChanges(turnId: string, baseline: unknown, options?: { signal?: AbortSignal }): Promise<A9ExternalChangeReport>;
}

/** 纯输出/查看类命令（以及其组合）不构成验证证据。 */
const OUTPUT_ONLY_COMMANDS = new Set([
  'echo', 'printf', 'true', ':', 'pwd', 'cd', 'whoami', 'date', 'uname', 'hostname',
  'ls', 'dir', 'cat', 'type', 'print', 'ver', 'id', 'env', 'set', 'which', 'where',
]);
/** 具备执行/验证能力的常见运行器：出现即视为验证候选。 */
const RUNNER_COMMANDS = new Set([
  'node', 'node.exe', 'python', 'python3', 'python.exe', 'py', 'npm', 'npx', 'yarn', 'pnpm',
  'jest', 'vitest', 'mocha', 'pytest', 'py.test', 'mvn', 'gradle', 'dotnet', 'msbuild',
  'make', 'gmake', 'bash', 'sh', 'zsh', 'powershell', 'powershell.exe', 'pwsh', 'cmd', 'cmd.exe',
  'git', 'git.exe', 'tsc', 'eslint', 'go', 'cargo', 'ruby', 'php', 'perl',
]);

/**
 * 判断一条命令是否不可能构成验证证据：所有出现的命令词都是纯输出/查看类
 * 且不含任何执行运行器。`echo ... | node ...`、`npm test`、`bash -c` 等
 * 都因为含运行器而被视为验证候选；`echo done`、`ls`、`cat x` 不算。
 */
export function isNonVerifyingCommand(command: string): boolean {
  const tokens = tokenizeSimple(command);
  if (tokens.length === 0) return true;
  const commandWords = tokens.map((t) => t.toLowerCase());
  const hasRunner = commandWords.some((word) => RUNNER_COMMANDS.has(word));
  if (hasRunner) return false;
  // 以“命令位置”出现的词（首个词，以及 | && ; 后的首词）判断。
  let expectCommand = true;
  for (const word of commandWords) {
    if (expectCommand) {
      if (!OUTPUT_ONLY_COMMANDS.has(word)) return false;
      expectCommand = false;
    } else if (word === '|' || word === '||' || word === '&&' || word === ';') {
      expectCommand = true;
    }
  }
  return true;
}

/** 轻量 tokenizer：处理引号内内容为一个 token（供命令分类）。 */
function tokenizeSimple(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '\"' | '\'' | undefined;
  let hasToken = false;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) { quote = undefined; continue; }
      current += ch;
      continue;
    }
    if (ch === '\"' || ch === '\'') { quote = ch; hasToken = true; continue; }
    if (/\s/.test(ch)) {
      if (hasToken || current) { tokens.push(current); current = ''; hasToken = false; }
      continue;
    }
    if (ch === '|' || ch === ';') {
      if (hasToken || current) { tokens.push(current); current = ''; hasToken = false; }
      tokens.push(ch === ';' ? ';' : (command[i + 1] === '|' ? '||' : '|'));
      if (ch === '|' && command[i + 1] === '|') i += 1;
      continue;
    }
    if (ch === '&') {
      if (hasToken || current) { tokens.push(current); current = ''; hasToken = false; }
      tokens.push(command[i + 1] === '&' ? '&&' : '&');
      if (command[i + 1] === '&') i += 1;
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (hasToken || current) tokens.push(current);
  return tokens;
}

export interface A9AgentLoopConfig {
  workspaceRoot: string;
  provider: A9ModelPort;
  workspaceService: A9WorkspacePort;
  runner: A9RunnerPort;
  /** Review 模式必填：缺失时 Review 写操作按结构化错误拒绝，绝不直写工作区。 */
  reviewStaging?: A9ReviewStagingPort;
  /** 产品级 Shell 选择与环境覆盖（工作区设置），逐次传入 Runner。 */
  shellOptions?: { kind?: string; path?: string; version?: string; envOverlay?: Record<string, string> };
  /** NEEDS_APPROVAL 挂起时同步持久化 pending 审批（等待用户前调用）。 */
  onApprovalPending?: (approval: A9ApprovalRequest) => void | Promise<void>;
  /** R3：外部变化端口（提供时，Shell/Git 变化进入同一 checkpoint/Diff/undo 链路）。 */
  externalChangePort?: A9ExternalChangePort;
  policyEngine?: PolicyEngine;
  permissionMode?: PermissionMode;
  maxStepsPerTurn?: number;
  /** 单个工具结果进入模型历史的字符上限，防止上下文无限膨胀。 */
  maxToolResultChars?: number;
  onEvent?: (event: A9LoopEvent) => void;
}

/**
 * 不可变审批对象（A9-01/R2）：挂起时生成并在等待用户前持久化；
 * 恢复执行前校验 approvalId 与 bindingDigest 与当前挂起调用完全一致。
 */
export interface A9ApprovalRequest {
  approvalId: string;
  turnId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** 人类可读操作摘要（审批 UI 展示）。 */
  summary: string;
  /** 绑定摘要：目标/参数/摘要变化即失效。 */
  bindingDigest: string;
  /** shell 工具为 git 操作时携带目标绑定。 */
  gitBinding?: GitCommandApprovalBinding;
  reason: string;
}

export interface A9ApprovalDecision {
  approvalId: string;
  decision: 'approved' | 'denied';
  bindingDigest: string;
}

/** 每次签发都加入随机 nonce；同一 Turn 重用 callId/args 也必须得到新的一次性身份。 */
function computeApprovalId(turnId: string, callId: string, bindingDigest: string): string {
  const issuanceNonce = crypto.randomBytes(16).toString('hex');
  return `apr-${crypto.createHash('sha256').update(`${turnId}\n${callId}\n${bindingDigest}\n${issuanceNonce}`).digest('hex').slice(0, 24)}`;
}

/** canonical JSON（键排序），供 bindingDigest 稳定计算。 */
export function canonicalizeArgsJson(args: Record<string, unknown>): string {
  return JSON.stringify(args, (_key, value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value as Record<string, unknown>).sort()
        .reduce<Record<string, unknown>>((acc, k) => { acc[k] = (value as Record<string, unknown>)[k]; return acc; }, {});
    }
    return value;
  });
}

/** bindingDigest：callId + toolName + canonical args + summary。 */
export function computeApprovalBindingDigest(callId: string, toolName: string, args: Record<string, unknown>, summary: string): string {
  return crypto.createHash('sha256')
    .update(`${callId}\n${toolName}\n${canonicalizeArgsJson(args)}\n${summary}`, 'utf8')
    .digest('hex');
}

function buildApprovalSummary(toolName: string, args: Record<string, any>): string {
  if (toolName === 'delete') {
    return `delete path=${String(args.path)} permanent=${String(args.permanent === true)}`;
  }
  if (toolName === 'shell') {
    const command = typeof args.command === 'string' ? args.command : '';
    const git = classifyGitCommand(command);
    if (git) return git.binding.summary;
    return `shell: ${command.slice(0, 160)}`;
  }
  if (toolName === 'write') return `write path=${String(args.path)}`;
  if (toolName === 'edit') return `edit path=${String(args.path)}`;
  if (toolName === 'copy') return `copy ${String(args.source)} -> ${String(args.destination)}`;
  if (toolName === 'move') return `move ${String(args.source)} -> ${String(args.destination)}`;
  return `${toolName} ${JSON.stringify(args).slice(0, 120)}`;
}

function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch (_err) {
    return {};
  }
}

export function buildA9ApprovalRequest(
  turnId: string,
  callId: string,
  toolName: string,
  args: Record<string, unknown>,
  reason: string,
): A9ApprovalRequest {
  const summary = buildApprovalSummary(toolName, args as Record<string, any>);
  const bindingDigest = computeApprovalBindingDigest(callId, toolName, args, summary);
  const gitBinding = toolName === 'shell' && typeof (args as any).command === 'string'
    ? classifyGitCommand((args as any).command)?.binding
    : undefined;
  return {
    approvalId: computeApprovalId(turnId, callId, bindingDigest),
    turnId,
    callId,
    toolName,
    args,
    summary,
    bindingDigest,
    ...(gitBinding ? { gitBinding } : {}),
    reason,
  };
}

/** 诚实完成三态（A9-A05）：verified 需要真实验证证据。 */
export type A9VerificationStatus = 'verified' | 'unverified' | 'not_applicable';

export interface A9TurnResult {
  turnId: string;
  outcome: TurnOutcome;
  finalMessage: string;
  totalSteps: number;
  toolCallsExecuted: number;
  plan?: A9VisiblePlan;
  /** 挂起审批（不可变绑定对象；恢复必须携带 approvalId + bindingDigest）。 */
  pendingApproval?: A9ApprovalRequest;
  verification?: A9VerificationStatus;
  /** onEvent 处理器抛出的错误（不得静默吞掉）。 */
  eventHandlerErrors?: string[];
  /** R3：本轮 Shell/Git/脚本造成的工作区变化（与 checkpoint/Diff 同源）。 */
  externalChanges?: Array<{ path: string; kind: string; recoverable: boolean }>;
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
  /** 挂起时生成并已持久化的不可变审批对象。 */
  approval: A9ApprovalRequest;
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
  private eventHandlerErrors: string[] = [];
  private turnStats = { attempted: 0, executed: 0, mutations: false, verifiedAfterMutation: false };
  private turnSequence = 0;
  private frozenBaseline: unknown;
  private baselineFrozen = false;
  private externalChanges: Array<{ path: string; kind: string; recoverable: boolean }> = [];

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
    this.eventHandlerErrors = [];
    this.turnStats = { attempted: 0, executed: 0, mutations: false, verifiedAfterMutation: false };
    this.frozenBaseline = undefined;
    this.baselineFrozen = false;
    this.externalChanges = [];
    this.turnSequence += 1;
    const turnId = `turn-${Date.now()}-${this.turnSequence}`;
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
        shell: this.config.shellOptions?.kind,
        ...(this.config.shellOptions?.version ? { shellVersion: this.config.shellOptions.version } : {}),
        visibleTools: this.getVisibleTools(),
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
  async resumeAfterApproval(input: A9ApprovalDecision, options: { signal?: AbortSignal } = {}): Promise<A9TurnResult> {
    const suspended = this.suspended;
    if (!suspended) {
      throw new AgentError(AgentErrorCode.RUNTIME_INPUT_INVALID, 'No suspended turn awaiting approval.', {}, '先通过 runTurn 触发 NEEDS_APPROVAL。');
    }
    if (!input || typeof input !== 'object' || !input.approvalId || !input.bindingDigest ||
        (input.decision !== 'approved' && input.decision !== 'denied')) {
      throw new AgentError(AgentErrorCode.APPROVAL_INVALID, '审批回复必须携带 approvalId、decision(approved|denied) 与 bindingDigest。', {}, '使用挂起审批返回的完整审批对象回复。');
    }
    if (input.approvalId !== suspended.approval.approvalId) {
      throw new AgentError(AgentErrorCode.APPROVAL_INVALID, `approvalId 不匹配（期望 ${suspended.approval.approvalId}）`, {}, '审批与挂起调用不对应；重新确认当前挂起的审批。');
    }
    // 与当前挂起调用重算摘要比对（与挂起时相同的规范化管道，含默认值填充）：
    // 目标、参数或摘要变化后旧审批失效。
    const currentArgs = this.normalizePendingArgs(suspended.pending);
    const currentDigest = computeApprovalBindingDigest(
      suspended.pending.id,
      suspended.pending.name,
      currentArgs,
      buildApprovalSummary(suspended.pending.name, currentArgs as Record<string, any>),
    );
    if (input.bindingDigest !== currentDigest || input.bindingDigest !== suspended.approval.bindingDigest) {
      throw new AgentError(AgentErrorCode.APPROVAL_INVALID, 'bindingDigest 与当前挂起调用不一致；审批已失效。', {}, '目标或参数已变化，重新审批新请求。');
    }
    // 一次性消费：先清空挂起再执行；重复/跨 Turn 请求都会因无挂起被拒绝。
    this.suspended = undefined;
    const { turnId } = suspended;
    const approved = input.decision === 'approved';

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

    // The product runtime creates a fresh AbortController for the resumed
    // execution. Use that signal for the approved call itself, not only for the
    // following model loop, otherwise Stop cannot reach a long-running command.
    const resumeSignal = options.signal ?? suspended.signal;
    const result = await this.executeValidatedToolCall(turnId, suspended.pending, resumeSignal);
    if (result.residueRisk) {
      return this.residueStop(turnId, suspended.stepCount, suspended.toolCallsExecuted, result.logPaths);
    }
    return this.runLoop(
      turnId,
      resumeSignal,
      suspended.stepCount,
      suspended.toolCallsExecuted + (result.executed ? 1 : 0),
      suspended.queue,
    );
  }

  /** 清理无法证明时停止后续自动执行并如实报告残留（C08 / W7C-09）。 */
  private residueStop(
    turnId: string,
    stepCount: number,
    toolCallsExecuted: number,
    logPaths?: { stdout: string; stderr: string },
  ): A9TurnResult {
    return this.finalize(turnId, {
      turnId,
      outcome: TurnOutcome.FAILED,
      finalMessage: 'Shell process cleanup could not be confirmed. Automatic execution stopped; possible process residue requires manual inspection before continuing.',
      totalSteps: stepCount,
      toolCallsExecuted,
    }, 'turn_failed', { error: 'residue risk', ...(logPaths ? { logPaths } : {}) });
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
        // 用户主动取消（stop）打断模型请求 → cancelled，而不是 failed；
        // Provider 网络/鉴权异常仍是 failed（F5 状态语义）。
        if (signal?.aborted) {
          return this.finalize(turnId, {
            turnId,
            outcome: TurnOutcome.CANCELLED,
            finalMessage: 'Turn cancelled by user',
            totalSteps: stepCount,
            toolCallsExecuted,
          });
        }
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

      // 模型未调用工具：给出最终结论。按诚实完成规则分类：
      // 有副作用但无后续成功验证 → COMPLETED_WITH_WARNINGS；全部工具失败 → BLOCKED。
      if (toolCalls.length === 0) {
        const finalContent = response.content || 'Task complete.';
        this.conversationHistory.push({
          role: 'assistant',
          content: finalContent,
        });
        let outcome = TurnOutcome.COMPLETED;
        const stats = this.turnStats;
        if (stats.attempted > 0 && stats.executed === 0) {
          outcome = TurnOutcome.BLOCKED;
        } else if (stats.mutations && !stats.verifiedAfterMutation) {
          outcome = TurnOutcome.COMPLETED_WITH_WARNINGS;
        }
        const verification: A9VerificationStatus = stats.mutations
          ? (stats.verifiedAfterMutation ? 'verified' : 'unverified')
          : 'not_applicable';
        return this.finalize(turnId, {
          turnId,
          outcome,
          finalMessage: finalContent,
          totalSteps: stepCount,
          toolCallsExecuted,
          verification,
        }, 'turn_completed', { finalMessage: response.content, outcome, verification });
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

      this.turnStats.attempted += 1;

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

      // R3：第一个潜在副作用工具前冻结轮前内容基线（读工具不冻结）。
      if (!this.baselineFrozen && this.config.externalChangePort && this.isPotentialSideEffectTool(tc.name)) {
        try {
          this.frozenBaseline = await this.config.externalChangePort.freezeTurnBaseline(turnId, { signal });
          this.baselineFrozen = true;
        } catch (err) {
          const detail = `freezeTurnBaseline failed: ${err instanceof Error ? err.message : String(err)}`;
          this.eventHandlerErrors.push(detail);
          // No side effect may run without a durable Turn-entry baseline.
          // Failing closed here is the only way to keep crash recovery honest.
          throw new Error(`A9_CHECKPOINT_BASELINE_FAILED: ${detail}`);
        }
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
        if (!staged.startsWith('Error:')) {
          this.turnStats.executed += 1;
        }
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
        const reason = decision.reason || 'Policy requires user approval for high impact operation';
        const approval = buildA9ApprovalRequest(turnId, tc.id, tc.name, validatedCall.args, reason);
        this.emitEvent({
          type: 'approval_required',
          turnId,
          timestamp: new Date().toISOString(),
          data: { toolName: tc.name, args: validatedCall.args, callId: tc.id, reason, approvalId: approval.approvalId, bindingDigest: approval.bindingDigest, summary: approval.summary },
        });
        // 等待用户前先持久化 pending 审批（不可变绑定对象）。
        if (this.config.onApprovalPending) {
          await this.config.onApprovalPending(approval);
        }
        // 挂起：保留原 tool call 与同批剩余队列，审批后恢复。
        this.suspended = {
          turnId,
          signal,
          stepCount,
          toolCallsExecuted: executed,
          queue: queue.slice(index + 1),
          pending: { ...tc },
          reason,
          approval,
        };
        return {
          kind: 'suspended',
          result: this.finalize(turnId, {
            turnId,
            outcome: TurnOutcome.NEEDS_APPROVAL,
            finalMessage: `High impact operation requires confirmation: ${approval.summary}`,
            totalSteps: stepCount,
            toolCallsExecuted: executed,
            pendingApproval: approval,
          }),
        };
      }

      const execResult = await this.executeValidatedToolCall(turnId, { ...tc }, signal);
      if (execResult.executed) executed++;
      if (execResult.residueRisk) {
        return { kind: 'final', result: this.residueStop(turnId, stepCount, executed, execResult.logPaths) };
      }
    }
    return { kind: 'continue', stepCount, toolCallsExecuted: executed };
  }

  /** 与挂起时一致的参数规范化（别名 → ToolRegistry normalizeCall 默认值填充）。 */
  private normalizePendingArgs(tc: A9ModelToolCall): Record<string, unknown> {
    const spec = this.toolRegistry.resolve(tc.name);
    const validated = this.toolRegistry.normalizeCall({
      id: tc.id,
      toolName: tc.name,
      args: normalizeToolCallArgs(tc.name, safeParseArgs(tc.arguments)),
      approvalLevel: spec.approvalLevel,
    });
    return validated.args;
  }

  private isStagedWriteTool(name: string): boolean {
    return ['write', 'edit', 'copy', 'move', 'delete'].includes(name);
  }

  private isPotentialSideEffectTool(name: string): boolean {
    // Workspace write tools create their own pre/post mutation checkpoints.
    // Only opaque Shell execution needs the bounded whole-workspace baseline.
    // This also preserves Review mode's zero-write staging contract.
    return name === 'shell';
  }

  private async collectExternal(turnId: string, signal: AbortSignal | undefined): Promise<void> {
    if (!this.config.externalChangePort || !this.baselineFrozen) return;
    try {
      // 收集不携带用户取消信号：取消后仍必须如实记录已发生的文件变化。
      const report = await this.config.externalChangePort.collectExternalChanges(turnId, this.frozenBaseline);
      const changes = Array.isArray(report) ? report : (report?.changes ?? []);
      if (changes.length > 0) {
        this.externalChanges.push(...changes);
        // 外部（Shell）造成的真实文件变化：计为副作用并使既有验证失效。
        this.turnStats.mutations = true;
        this.turnStats.verifiedAfterMutation = false;
        this.emitEvent({
          type: 'tool_end',
          turnId,
          timestamp: new Date().toISOString(),
          data: { externalChanges: changes },
        });
      }
    } catch (err) {
      const detail = `collectExternalChanges failed: ${err instanceof Error ? err.message : String(err)}`;
      this.eventHandlerErrors.push(detail);
      // Once Shell has run, an uncollectable post-state invalidates the
      // checkpoint chain. Stop the Turn before any later model tool can add
      // more side effects under a permanently pending baseline.
      throw new Error(`A9_CHECKPOINT_COLLECTION_FAILED: ${detail}`);
    }
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
  ): Promise<{ executed: boolean; result: string; residueRisk?: boolean; logPaths?: { stdout: string; stderr: string } }> {
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
    let residueRisk: boolean | undefined;
    let logPaths: { stdout: string; stderr: string } | undefined;
    const isShellTool = tc.name === 'shell';
    try {
      const outcome = await this.dispatchTool(tc.name, args, turnId, signal);
      toolResultStr = typeof outcome.payload === 'string' ? outcome.payload : JSON.stringify(outcome.payload, null, 2);
      residueRisk = outcome.residueRisk;
      logPaths = outcome.logPaths;
      executed = !residueRisk;
    } catch (err: any) {
      toolResultStr = `Tool execution error: ${err.message}`;
    }
    if (isShellTool) {
      // 成功、超时、取消、residueRisk 后都要收集变化（同一 checkpoint 链路）。
      await this.collectExternal(turnId, signal);
    }

    let shellEvent: Record<string, unknown> | undefined;
    if (isShellTool) {
      const previewLimit = 32 * 1024;
      try {
        const parsed = JSON.parse(toolResultStr);
        const stdout = typeof parsed.stdout === 'string' ? parsed.stdout : '';
        const stderr = typeof parsed.stderr === 'string' ? parsed.stderr : '';
        shellEvent = {
          schemaVersion: 1,
          status: typeof parsed.status === 'string' ? parsed.status : 'unknown',
          exitCode: typeof parsed.exitCode === 'number' || parsed.exitCode === null ? parsed.exitCode : null,
          stdout: stdout.slice(0, previewLimit),
          stderr: stderr.slice(0, previewLimit),
          durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : 0,
          timedOut: parsed.timedOut === true,
          truncated: parsed.truncated === true || stdout.length > previewLimit || stderr.length > previewLimit,
          ...(typeof parsed.rawStdoutBytes === 'number' ? { rawStdoutBytes: parsed.rawStdoutBytes } : {}),
          ...(typeof parsed.rawStderrBytes === 'number' ? { rawStderrBytes: parsed.rawStderrBytes } : {}),
          ...(parsed.backgroundHandle ? { backgroundHandle: String(parsed.backgroundHandle) } : {}),
          ...(logPaths ? { logPaths } : {}),
          ...(residueRisk ? { residueRisk: true } : {}),
        };
      } catch (_parseErr) {
        shellEvent = {
          schemaVersion: 1,
          status: 'protocol_error',
          exitCode: null,
          stdout: '',
          stderr: toolResultStr.slice(0, previewLimit),
          durationMs: 0,
          timedOut: false,
          truncated: toolResultStr.length > previewLimit,
          ...(logPaths ? { logPaths } : {}),
          ...(residueRisk ? { residueRisk: true } : {}),
        };
      }
    }

    if (toolResultStr.length > this.maxToolResultChars) {
      toolResultStr = `${toolResultStr.slice(0, this.maxToolResultChars)}\n[Tool output truncated at ${this.maxToolResultChars} characters; full output preserved in tool logs]`;
    }

    if (executed) {
      this.turnStats.executed += 1;
      if (this.permissionMode === PermissionMode.FULL_ACCESS && ['write', 'edit', 'copy', 'move', 'delete'].includes(tc.name)) {
        // Review staging 不触碰正式工作区，不计为副作用。
        this.turnStats.mutations = true;
        // 验证之后又发生源码修改 → 回到 unverified。
        this.turnStats.verifiedAfterMutation = false;
      } else if (tc.name === 'shell' && !residueRisk) {
        // git 写操作经分类器计入副作用（A9-T02：Shell 变化纳入同一审计链路）。
        const gitDecision = typeof args.command === 'string' ? classifyGitCommand(args.command) : null;
        if (gitDecision?.mutatesWorktree) {
          this.turnStats.mutations = true;
          this.turnStats.verifiedAfterMutation = false;
        }
        // 只有“非纯输出”的命令成功执行且此前存在文件副作用 → 才算验证证据；
        // echo/ls/cat 等纯输出命令成功不产生 verified。
        const command = typeof args.command === 'string' ? args.command : '';
        try {
          const parsed = JSON.parse(toolResultStr);
          if (
            typeof parsed.exitCode === 'number' && parsed.exitCode === 0 &&
            this.turnStats.mutations && !gitDecision?.mutatesWorktree &&
            !isNonVerifyingCommand(command)
          ) {
            this.turnStats.verifiedAfterMutation = true;
          }
        } catch (_parseErr) { /* 非 JSON 结果无法证明验证 */ }
      }
    }

    this.emitEvent({
      type: 'tool_end',
      turnId,
      timestamp: new Date().toISOString(),
      data: {
        schemaVersion: 1,
        toolName: tc.name,
        result: toolResultStr.slice(0, 1000),
        ...(shellEvent ? { shell: shellEvent } : {}),
        ...(residueRisk ? { residueRisk: true } : {}),
      },
    });

    this.conversationHistory.push({
      role: 'tool',
      toolCallId: tc.id,
      toolName: tc.name,
      content: toolResultStr,
    });
    return { executed, result: toolResultStr, ...(residueRisk ? { residueRisk } : {}), ...(logPaths ? { logPaths } : {}) };
  }

  private async dispatchTool(
    name: string,
    args: Record<string, any>,
    turnId: string,
    signal?: AbortSignal,
  ): Promise<{ payload: any; residueRisk?: boolean; logPaths?: { stdout: string; stderr: string } }> {
    const ws = this.config.workspaceService;
    switch (name) {
      case 'list':
        return { payload: await ws.list(args.path ?? '', { recursive: args.recursive, maxEntries: args.maxEntries }) };
      case 'read':
        return { payload: await ws.read(args.path, { startLine: args.startLine, maxLines: args.maxLines, encoding: args.encoding, signal }) };
      case 'search':
        return { payload: await ws.search(args.pattern, { path: args.path, isRegex: args.isRegex, maxMatches: args.maxMatches }) };
      case 'write':
        return { payload: await ws.write(args.path, args.content, { encoding: args.encoding, turnId }) };
      case 'edit':
        return { payload: await ws.edit(args.path, args.oldText, args.newText, { turnId }) };
      case 'copy':
        return { payload: await ws.copy(args.source, args.destination, { overwrite: args.overwrite, turnId }) };
      case 'move':
        return { payload: await ws.move(args.source, args.destination, { overwrite: args.overwrite, turnId }) };
      case 'delete':
        return { payload: await ws.delete(args.path, { recursive: args.recursive, permanent: args.permanent, turnId }) };
      case 'shell': {
        // timeoutMs 为可选任务级 deadline；未提供时不施加固定硬超时（A9/C08 局部取代）。
        // background/shell kind/path/env 由产品级配置传入，不取自模型参数。
        const shellResult = await this.config.runner.execute(args.command, {
          cwd: args.cwd || this.config.workspaceRoot,
          ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
          ...(args.background !== undefined ? { background: args.background } : {}),
          ...(this.config.shellOptions?.kind !== undefined ? { shellKind: this.config.shellOptions.kind } : {}),
          ...(this.config.shellOptions?.path !== undefined ? { shellPath: this.config.shellOptions.path } : {}),
          ...(this.config.shellOptions?.envOverlay !== undefined ? { envOverlay: this.config.shellOptions.envOverlay } : {}),
          ...(signal ? { signal } : {}),
        });
        const payload = {
          ...(shellResult.status ? { status: shellResult.status } : {}),
          exitCode: shellResult.exitCode,
          stdout: shellResult.stdout,
          stderr: shellResult.stderr,
          durationMs: shellResult.durationMs,
          timedOut: shellResult.timedOut,
          ...(shellResult.truncated !== undefined ? { truncated: shellResult.truncated } : {}),
          ...(shellResult.rawStdoutBytes !== undefined ? { rawStdoutBytes: shellResult.rawStdoutBytes } : {}),
          ...(shellResult.rawStderrBytes !== undefined ? { rawStderrBytes: shellResult.rawStderrBytes } : {}),
          ...(shellResult.logPaths ? { logPaths: shellResult.logPaths } : {}),
          ...(shellResult.backgroundHandle ? { backgroundHandle: shellResult.backgroundHandle } : {}),
          ...(shellResult.residueRisk
            ? { residueWarning: 'Process tree cleanup could NOT be confirmed. Manual residue inspection is required before continuing.' }
            : {}),
        };
        return {
          payload,
          ...(shellResult.residueRisk ? { residueRisk: true as const } : {}),
          ...(shellResult.logPaths ? { logPaths: shellResult.logPaths } : {}),
        };
      }
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
          payload: {
            success: true,
            plan: args.plan,
            explanation: args.explanation ?? '',
            note: 'Plan updated and visible to the user.',
          },
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
    const withExternal = this.externalChanges.length > 0
      ? { ...withPlan, externalChanges: [...this.externalChanges] }
      : withPlan;
    const withErrors = this.eventHandlerErrors.length > 0
      ? { ...withExternal, eventHandlerErrors: [...this.eventHandlerErrors] }
      : withExternal;
    if (eventType) {
      this.emitEvent({ type: eventType, turnId, timestamp: new Date().toISOString(), data: eventData });
    }
    return withErrors;
  }

  /**
   * 模型切换时从标准化事件账本重建上下文（A9-GW03）：外部持久层将
   * 会话投影为 loop 消息后注入，替代原 System Prompt 重建新模型上下文。
   */
  restoreConversationHistory(messages: A9LoopMessage[]): void {
    if (messages.length === 0) return;
    const rebuilt: A9LoopMessage[] = messages.some((m) => m.role === 'system')
      ? [...messages]
      : [
        {
          role: 'system',
          content: buildA9SystemPrompt({
            cwd: this.config.workspaceRoot,
            mode: this.permissionMode,
            shell: this.config.shellOptions?.kind,
            ...(this.config.shellOptions?.version ? { shellVersion: this.config.shellOptions.version } : {}),
            visibleTools: this.getVisibleTools(),
          }).content,
        },
        ...messages,
      ];
    this.conversationHistory.length = 0;
    this.conversationHistory.push(...rebuilt.map((m) => ({ ...m })));
  }

  private emitEvent(event: A9LoopEvent): void {
    if (this.config.onEvent) {
      try {
        this.config.onEvent(event);
      } catch (err) {
        // 事件处理器错误不得静默吞掉：记录并在 Turn 结果中暴露。
        const message = `onEvent(${event.type}) handler failed: ${err instanceof Error ? err.message : String(err)}`;
        if (this.eventHandlerErrors.length < 50) this.eventHandlerErrors.push(message);
      }
    }
  }
}
