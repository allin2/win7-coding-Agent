/**
 * @module state-machine
 * @description Agent Core 状态机 — 任务生命周期状态转移引擎
 * @remarks 继承 Phase 2 §3 语义，定义合法转移表并生成结构化转移记录
 */

import { AgentState, StateTransition } from './types';
import { invalidStateTransitionError } from './errors';

/**
 * 转移触发事件类型
 */
export type TransitionTrigger =
  | 'start_planning'
  | 'submit_for_approval'
  | 'plan_ready'
  | 'approval_granted'
  | 'approval_rejected'
  | 'execution_complete'
  | 'execution_failed'
  | 'verification_passed'
  | 'verification_failed'
  | 'verification_repair_requested'
  | 'pause'
  | 'resume'
  | 'cancel';

/**
 * 合法转移表 — 定义所有允许的状态转移
 * @remarks key: 源状态, value: Map<触发事件, 目标状态>
 */
const TRANSITION_TABLE: ReadonlyMap<AgentState, Map<TransitionTrigger, AgentState>> = new Map([
  [
    AgentState.IDLE,
    new Map<TransitionTrigger, AgentState>([
      ['start_planning', AgentState.PLANNING],
      ['execution_failed', AgentState.FAILED],
      ['cancel', AgentState.CANCELLED],
    ]),
  ],
  [
    AgentState.PLANNING,
    new Map<TransitionTrigger, AgentState>([
      ['submit_for_approval', AgentState.AWAITING_APPROVAL],
      ['plan_ready', AgentState.EXECUTING],
      ['pause', AgentState.PAUSED],
      ['cancel', AgentState.CANCELLED],
      ['execution_failed', AgentState.FAILED],
    ]),
  ],
  [
    AgentState.AWAITING_APPROVAL,
    new Map<TransitionTrigger, AgentState>([
      ['approval_granted', AgentState.EXECUTING],
      ['approval_rejected', AgentState.PLANNING],
      ['execution_failed', AgentState.FAILED],
      ['cancel', AgentState.CANCELLED],
    ]),
  ],
  [
    AgentState.EXECUTING,
    new Map<TransitionTrigger, AgentState>([
      ['submit_for_approval', AgentState.AWAITING_APPROVAL],
      ['execution_complete', AgentState.VERIFYING],
      ['execution_failed', AgentState.FAILED],
      ['pause', AgentState.PAUSED],
      ['cancel', AgentState.CANCELLED],
    ]),
  ],
  [
    AgentState.VERIFYING,
    new Map<TransitionTrigger, AgentState>([
      ['verification_passed', AgentState.COMPLETED],
      ['verification_failed', AgentState.FAILED],
      ['verification_repair_requested', AgentState.EXECUTING],
      ['cancel', AgentState.CANCELLED],
    ]),
  ],
  [
    AgentState.PAUSED,
    new Map<TransitionTrigger, AgentState>([
      ['resume', AgentState.PLANNING],
      ['cancel', AgentState.CANCELLED],
    ]),
  ],
  // 终态：无合法转移
  [AgentState.COMPLETED, new Map<TransitionTrigger, AgentState>()],
  [AgentState.FAILED, new Map<TransitionTrigger, AgentState>()],
  [AgentState.CANCELLED, new Map<TransitionTrigger, AgentState>()],
]);

/**
 * 执行状态转移
 * @param current - 当前状态
 * @param trigger - 触发事件
 * @param metadata - 附加元数据
 * @returns 状态转移记录
 * @throws AgentError(INVALID_STATE_TRANSITION) 非法转移时抛出
 */
export function transition(
  current: AgentState,
  trigger: TransitionTrigger,
  metadata?: Record<string, unknown>,
): StateTransition {
  const transitions = TRANSITION_TABLE.get(current);
  if (!transitions) {
    throw invalidStateTransitionError(
      `状态 ${current} 无定义的转移规则`,
      { from: current, trigger },
    );
  }

  const target = transitions.get(trigger);
  if (!target) {
    throw invalidStateTransitionError(
      `状态 ${current} 下不允许触发事件 ${trigger}`,
      { from: current, trigger, available: getAvailableTransitions(current) },
    );
  }

  return {
    from: current,
    to: target,
    trigger,
    timestamp: new Date().toISOString(),
    ...(metadata ? { metadata } : {}),
  };
}

/**
 * 检查是否允许从 from 转移到 to
 * @param from - 源状态
 * @param to - 目标状态
 * @returns 是否允许转移
 */
export function canTransition(from: AgentState, to: AgentState): boolean {
  const transitions = TRANSITION_TABLE.get(from);
  if (!transitions) return false;
  for (const target of transitions.values()) {
    if (target === to) return true;
  }
  return false;
}

/**
 * 获取指定状态下所有可达的目标状态
 * @param state - 当前状态
 * @returns 可达目标状态数组
 */
export function getAvailableTransitions(state: AgentState): AgentState[] {
  const transitions = TRANSITION_TABLE.get(state);
  if (!transitions) return [];
  return Array.from(transitions.values());
}

/**
 * 获取指定状态下所有可用的触发事件
 * @param state - 当前状态
 * @returns 可用触发事件数组
 */
export function getAvailableTriggers(state: AgentState): TransitionTrigger[] {
  const transitions = TRANSITION_TABLE.get(state);
  if (!transitions) return [];
  return Array.from(transitions.keys());
}

/**
 * 检查状态是否为终态
 * @param state - 待检查状态
 * @returns 是否为终态
 */
export function isTerminalState(state: AgentState): boolean {
  return (
    state === AgentState.COMPLETED ||
    state === AgentState.FAILED ||
    state === AgentState.CANCELLED
  );
}
