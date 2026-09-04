import * as crypto from 'crypto';

/**
 * The exhaustive outcomes for one user- or system-triggered Turn.
 * NEEDS_APPROVAL is a serializable suspension point rather than a terminal
 * Thread state. COMPLETED_WITH_WARNINGS 与 BLOCKED 支撑诚实完成三态
 * （A9-A05）：未验证的完成不冒充已验证完成。
 */
export enum TurnOutcome {
  COMPLETED = 'completed',
  COMPLETED_WITH_WARNINGS = 'completed_with_warnings',
  NEEDS_APPROVAL = 'needs_approval',
  BUDGET_EXCEEDED = 'budget_exceeded',
  CANCELLED = 'cancelled',
  STUCK = 'stuck',
  BLOCKED = 'blocked',
  FAILED = 'failed',
}

/** Four independent guardrails applied to one Turn. */
export interface TurnBudget {
  maxSteps: number;
  maxTokens: number;
  maxWallMs: number;
  maxToolCalls: number;
  /** Separate bounded grace period for the no-tool final summary call. */
  finalSummaryGraceMs: number;
}

export const DEFAULT_TURN_BUDGET: Readonly<TurnBudget> = Object.freeze({
  maxSteps: 40,
  maxTokens: 400_000,
  maxWallMs: 15 * 60_000,
  maxToolCalls: 100,
  finalSummaryGraceMs: 5_000,
});

export type BudgetExceededReason =
  | 'max_steps'
  | 'max_tokens'
  | 'max_wall_ms'
  | 'max_tool_calls';

export interface TurnUsage {
  steps: number;
  tokens: number;
  toolCalls: number;
  modelAttempts: number;
  elapsedMs: number;
}

export function validateTurnBudget(budget: TurnBudget): void {
  const fields: Array<keyof TurnBudget> = [
    'maxSteps',
    'maxTokens',
    'maxWallMs',
    'maxToolCalls',
    'finalSummaryGraceMs',
  ];
  for (const field of fields) {
    const value = budget[field];
    if (!Number.isFinite(value) || value < 1 || !Number.isInteger(value)) {
      throw new TypeError(`TurnBudget.${field} must be a positive integer`);
    }
  }
}

export function checkTurnBudget(
  budget: TurnBudget,
  usage: TurnUsage,
): BudgetExceededReason | undefined {
  if (usage.elapsedMs >= budget.maxWallMs) return 'max_wall_ms';
  if (usage.steps >= budget.maxSteps) return 'max_steps';
  if (usage.tokens >= budget.maxTokens) return 'max_tokens';
  if (usage.toolCalls >= budget.maxToolCalls) return 'max_tool_calls';
  return undefined;
}

/**
 * Detects a consecutive repetition of the same tool name and canonicalized
 * argument object. The implementation uses only Node 16-compatible APIs.
 */
export class LoopDetector {
  private readonly recent: string[] = [];

  constructor(private readonly threshold = 3) {
    if (!Number.isInteger(threshold) || threshold < 2) {
      throw new TypeError('LoopDetector threshold must be an integer >= 2');
    }
  }

  observe(toolName: string, args: Record<string, unknown>): boolean {
    const signature = crypto
      .createHash('sha256')
      .update(`${toolName}\n${stableSerialize(args)}`, 'utf8')
      .digest('hex');
    this.recent.push(signature);
    if (this.recent.length > this.threshold) this.recent.shift();
    return (
      this.recent.length === this.threshold &&
      this.recent.every((item) => item === signature)
    );
  }

  /**
   * 循环检测按 Turn 重置：连续重复计数不得跨用户 Turn 累积，
   * 否则上一轮的正常调用会被误判为卡死。
   */
  reset(): void {
    this.recent.length = 0;
  }
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const item = source[key];
      if (item !== undefined) result[key] = canonicalize(item);
    }
    return result;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  return value;
}
