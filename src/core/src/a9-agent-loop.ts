/**
 * @module a9-agent-loop
 * @description A9 真实模型驱动的 Agent 循环与编码工作流执行器 (PRD §5, §6 / ADR-0089)
 */

import {
  PermissionMode,
  ApprovalLevel,
  PolicyVerdict,
} from './types';
import { PolicyEngine } from './policy';
import { a9ToolSpecs } from './a9-tools';
import { buildA9SystemPrompt } from './system-prompt';
import { LoopDetector, TurnOutcome } from './loop-control';

export interface A9LoopEvent {
  type:
    | 'turn_started'
    | 'model_thinking'
    | 'model_chunk'
    | 'tool_start'
    | 'tool_end'
    | 'approval_required'
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

export interface A9ModelPort {
  sendStreamRequest(
    request: {
      id: string;
      model?: string;
      messages: Array<{ role: string; content: string; toolCallId?: string }>;
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
  policyEngine?: PolicyEngine;
  permissionMode?: PermissionMode;
  maxStepsPerTurn?: number;
  onEvent?: (event: A9LoopEvent) => void;
}

export interface A9TurnResult {
  turnId: string;
  outcome: TurnOutcome;
  finalMessage: string;
  totalSteps: number;
  toolCallsExecuted: number;
  pendingApproval?: {
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
  };
}

export class A9AgentLoop {
  private readonly policyEngine: PolicyEngine;
  private readonly permissionMode: PermissionMode;
  private readonly loopDetector = new LoopDetector(3);
  private readonly conversationHistory: Array<{ role: string; content: string; toolCallId?: string }> = [];

  constructor(private readonly config: A9AgentLoopConfig) {
    this.permissionMode = config.permissionMode || PermissionMode.FULL_ACCESS;
    this.policyEngine = config.policyEngine || new PolicyEngine();
  }

  /**
   * 执行一轮交互 Turn
   */
  async runTurn(userPrompt: string, options: { signal?: AbortSignal } = {}): Promise<A9TurnResult> {
    const turnId = `turn-${Date.now()}`;
    const maxSteps = this.config.maxStepsPerTurn || 30;
    let stepCount = 0;
    let toolCallsExecuted = 0;

    this.emitEvent({
      type: 'turn_started',
      turnId,
      timestamp: new Date().toISOString(),
      data: { userPrompt, mode: this.permissionMode },
    });

    if (this.conversationHistory.length === 0) {
      const systemPromptContract = buildA9SystemPrompt({
        cwd: this.config.workspaceRoot,
        mode: this.permissionMode,
      });
      this.conversationHistory.push({ role: 'system', content: systemPromptContract.content });
    }

    this.conversationHistory.push({ role: 'user', content: userPrompt });

    const specs = a9ToolSpecs(this.permissionMode);
    const openAITools = specs.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as unknown as Record<string, unknown>,
    }));

    while (stepCount < maxSteps) {
      if (options.signal?.aborted) {
        return {
          turnId,
          outcome: TurnOutcome.CANCELLED,
          finalMessage: 'Turn cancelled by user',
          totalSteps: stepCount,
          toolCallsExecuted,
        };
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
          { signal: options.signal },
        );
      } catch (err: any) {
        this.emitEvent({
          type: 'turn_failed',
          turnId,
          timestamp: new Date().toISOString(),
          data: { error: err.message },
        });
        return {
          turnId,
          outcome: TurnOutcome.FAILED,
          finalMessage: `Model invocation failed: ${err.message}`,
          totalSteps: stepCount,
          toolCallsExecuted,
        };
      }

      const toolCalls = response.toolCalls || [];

      // 如果模型没有调用工具，说明已给出最终结论
      if (toolCalls.length === 0) {
        this.conversationHistory.push({
          role: 'assistant',
          content: response.content || 'Task complete.',
        });

        this.emitEvent({
          type: 'turn_completed',
          turnId,
          timestamp: new Date().toISOString(),
          data: { finalMessage: response.content },
        });

        return {
          turnId,
          outcome: TurnOutcome.COMPLETED,
          finalMessage: response.content || 'Task completed successfully',
          totalSteps: stepCount,
          toolCallsExecuted,
        };
      }

      // 将助手的 ToolCall 消息记录入历史
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content || '',
      });

      // 依次执行每个 ToolCall
      for (const tc of toolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.arguments || '{}');
        } catch (_e) {
          parsedArgs = { raw: tc.arguments };
        }

        // 循环卡死检测
        if (this.loopDetector.observe(tc.name, parsedArgs)) {
          return {
            turnId,
            outcome: TurnOutcome.STUCK,
            finalMessage: `Agent loop detected: tool ${tc.name} repeated 3 times with identical arguments without making progress.`,
            totalSteps: stepCount,
            toolCallsExecuted,
          };
        }

        // 策略裁决
        const approvalLevel = this.permissionMode === PermissionMode.FULL_ACCESS
          ? ApprovalLevel.FULL_ACCESS
          : ApprovalLevel.REVIEW;
        const decision = this.policyEngine.evaluate({
          id: tc.id,
          toolName: tc.name,
          args: parsedArgs,
          approvalLevel,
        });

        if (decision.verdict === PolicyVerdict.DENY) {
          this.conversationHistory.push({
            role: 'tool',
            toolCallId: tc.id,
            content: `Error: Tool execution denied by policy: ${tc.name}`,
          });
          continue;
        }

        if (decision.verdict === PolicyVerdict.ASK) {
          this.emitEvent({
            type: 'approval_required',
            turnId,
            timestamp: new Date().toISOString(),
            data: { toolName: tc.name, args: parsedArgs },
          });

          return {
            turnId,
            outcome: TurnOutcome.NEEDS_APPROVAL,
            finalMessage: `High impact operation requires confirmation: ${tc.name}`,
            totalSteps: stepCount,
            toolCallsExecuted,
            pendingApproval: {
              toolName: tc.name,
              args: parsedArgs,
              reason: decision.reason || 'Policy requires user approval for high impact operation',
            },
          };
        }

        // 执行工具
        this.emitEvent({
          type: 'tool_start',
          turnId,
          timestamp: new Date().toISOString(),
          data: { toolName: tc.name, args: parsedArgs },
        });

        let toolResultStr = '';
        try {
          const result = await this.dispatchTool(tc.name, parsedArgs, turnId, options.signal);
          toolResultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          toolCallsExecuted++;
        } catch (err: any) {
          toolResultStr = `Tool execution error: ${err.message}`;
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
          content: toolResultStr,
        });
      }
    }

    return {
      turnId,
      outcome: TurnOutcome.BUDGET_EXCEEDED,
      finalMessage: `Turn reached max step limit (${maxSteps})`,
      totalSteps: stepCount,
      toolCallsExecuted,
    };
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
        return await ws.list(args.path, { recursive: args.recursive, maxEntries: args.maxEntries ?? args.max_entries });
      case 'read':
        return await ws.read(args.path, { startLine: args.startLine ?? args.start_line, maxLines: args.maxLines ?? args.max_lines, encoding: args.encoding });
      case 'search':
        return await ws.search(args.pattern, { path: args.path, isRegex: args.isRegex ?? args.is_regex, maxMatches: args.maxMatches ?? args.max_matches });
      case 'write':
        return await ws.write(args.path, args.content, { encoding: args.encoding, turnId });
      case 'edit':
        return await ws.edit(args.path, args.oldText ?? args.old_text, args.newText ?? args.new_text, { turnId });
      case 'copy':
        return await ws.copy(args.source, args.destination, { overwrite: args.overwrite, turnId });
      case 'move':
        return await ws.move(args.source, args.destination, { overwrite: args.overwrite, turnId });
      case 'delete':
        return await ws.delete(args.path, { recursive: args.recursive, permanent: args.permanent, turnId });
      case 'shell':
        return await this.config.runner.execute(args.command, { timeoutMs: args.timeout_seconds ? args.timeout_seconds * 1000 : 60_000, signal });
      case 'update_plan':
        return { success: true, plan: args.plan, currentStep: args.currentStep ?? args.current_step };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private emitEvent(event: A9LoopEvent): void {
    if (this.config.onEvent) {
      try {
        this.config.onEvent(event);
      } catch (_e) {}
    }
  }
}
