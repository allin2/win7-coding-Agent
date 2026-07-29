/**
 * @module state-machine.test
 * @description 状态机模块测试 — 覆盖所有合法转移、非法转移拒绝、可用转移查询
 */

import {
  transition,
  canTransition,
  getAvailableTransitions,
  getAvailableTriggers,
  isTerminalState,
  TransitionTrigger,
} from '../src/state-machine';
import { AgentState } from '../src/types';
import { AgentError, AgentErrorCode } from '../src/errors';

describe('state-machine', () => {
  describe('transition()', () => {
    // IDLE 出发的合法转移
    it('IDLE → PLANNING (start_planning)', () => {
      const result = transition(AgentState.IDLE, 'start_planning');
      expect(result.from).toBe(AgentState.IDLE);
      expect(result.to).toBe(AgentState.PLANNING);
      expect(result.trigger).toBe('start_planning');
      expect(result.timestamp).toBeDefined();
    });

    it('IDLE → CANCELLED (cancel)', () => {
      const result = transition(AgentState.IDLE, 'cancel');
      expect(result.to).toBe(AgentState.CANCELLED);
    });

    // PLANNING 出发的合法转移
    it('PLANNING → AWAITING_APPROVAL (submit_for_approval)', () => {
      const result = transition(AgentState.PLANNING, 'submit_for_approval');
      expect(result.to).toBe(AgentState.AWAITING_APPROVAL);
    });

    it('PLANNING → PAUSED (pause)', () => {
      const result = transition(AgentState.PLANNING, 'pause');
      expect(result.to).toBe(AgentState.PAUSED);
    });

    it('PLANNING → CANCELLED (cancel)', () => {
      const result = transition(AgentState.PLANNING, 'cancel');
      expect(result.to).toBe(AgentState.CANCELLED);
    });

    it('PLANNING → FAILED (execution_failed)', () => {
      const result = transition(AgentState.PLANNING, 'execution_failed');
      expect(result.to).toBe(AgentState.FAILED);
    });

    // AWAITING_APPROVAL 出发的合法转移
    it('AWAITING_APPROVAL → EXECUTING (approval_granted)', () => {
      const result = transition(AgentState.AWAITING_APPROVAL, 'approval_granted');
      expect(result.to).toBe(AgentState.EXECUTING);
    });

    it('AWAITING_APPROVAL → PLANNING (approval_rejected)', () => {
      const result = transition(AgentState.AWAITING_APPROVAL, 'approval_rejected');
      expect(result.to).toBe(AgentState.PLANNING);
    });

    it('AWAITING_APPROVAL → CANCELLED (cancel)', () => {
      const result = transition(AgentState.AWAITING_APPROVAL, 'cancel');
      expect(result.to).toBe(AgentState.CANCELLED);
    });

    // EXECUTING 出发的合法转移
    it('EXECUTING → COMPLETED (execution_complete)', () => {
      const result = transition(AgentState.EXECUTING, 'execution_complete');
      expect(result.to).toBe(AgentState.COMPLETED);
    });

    it('EXECUTING → FAILED (execution_failed)', () => {
      const result = transition(AgentState.EXECUTING, 'execution_failed');
      expect(result.to).toBe(AgentState.FAILED);
    });

    it('EXECUTING → PAUSED (pause)', () => {
      const result = transition(AgentState.EXECUTING, 'pause');
      expect(result.to).toBe(AgentState.PAUSED);
    });

    it('EXECUTING → CANCELLED (cancel)', () => {
      const result = transition(AgentState.EXECUTING, 'cancel');
      expect(result.to).toBe(AgentState.CANCELLED);
    });

    // PAUSED 出发的合法转移
    it('PAUSED → PLANNING (resume)', () => {
      const result = transition(AgentState.PAUSED, 'resume');
      expect(result.to).toBe(AgentState.PLANNING);
    });

    it('PAUSED → CANCELLED (cancel)', () => {
      const result = transition(AgentState.PAUSED, 'cancel');
      expect(result.to).toBe(AgentState.CANCELLED);
    });

    // 非法转移拒绝
    it('拒绝 IDLE → EXECUTING（非法转移）', () => {
      expect(() => transition(AgentState.IDLE, 'approval_granted')).toThrow(AgentError);
      try {
        transition(AgentState.IDLE, 'approval_granted');
      } catch (e) {
        expect(e).toBeInstanceOf(AgentError);
        expect((e as AgentError).code).toBe(AgentErrorCode.INVALID_STATE_TRANSITION);
      }
    });

    it('拒绝 COMPLETED → 任何状态（终态无转移）', () => {
      expect(() => transition(AgentState.COMPLETED, 'start_planning')).toThrow(AgentError);
    });

    it('拒绝 FAILED → 任何状态（终态无转移）', () => {
      expect(() => transition(AgentState.FAILED, 'cancel')).toThrow(AgentError);
    });

    it('拒绝 CANCELLED → 任何状态（终态无转移）', () => {
      expect(() => transition(AgentState.CANCELLED, 'resume')).toThrow(AgentError);
    });

    // 带 metadata 的转移
    it('转移可携带 metadata', () => {
      const result = transition(AgentState.IDLE, 'start_planning', { reason: 'user request' });
      expect(result.metadata).toEqual({ reason: 'user request' });
    });
  });

  describe('canTransition()', () => {
    it('IDLE → PLANNING 允许', () => {
      expect(canTransition(AgentState.IDLE, AgentState.PLANNING)).toBe(true);
    });

    it('IDLE → EXECUTING 不允许', () => {
      expect(canTransition(AgentState.IDLE, AgentState.EXECUTING)).toBe(false);
    });

    it('PLANNING → PAUSED 允许', () => {
      expect(canTransition(AgentState.PLANNING, AgentState.PAUSED)).toBe(true);
    });

    it('COMPLETED → 任何状态不允许', () => {
      expect(canTransition(AgentState.COMPLETED, AgentState.IDLE)).toBe(false);
      expect(canTransition(AgentState.COMPLETED, AgentState.PLANNING)).toBe(false);
    });

    it('PAUSED → PLANNING 允许', () => {
      expect(canTransition(AgentState.PAUSED, AgentState.PLANNING)).toBe(true);
    });
  });

  describe('getAvailableTransitions()', () => {
    it('IDLE 可达 [PLANNING, CANCELLED]', () => {
      const targets = getAvailableTransitions(AgentState.IDLE);
      expect(targets).toContain(AgentState.PLANNING);
      expect(targets).toContain(AgentState.CANCELLED);
      expect(targets).toHaveLength(2);
    });

    it('PLANNING 可达 [AWAITING_APPROVAL, PAUSED, CANCELLED, FAILED]', () => {
      const targets = getAvailableTransitions(AgentState.PLANNING);
      expect(targets).toContain(AgentState.AWAITING_APPROVAL);
      expect(targets).toContain(AgentState.PAUSED);
      expect(targets).toContain(AgentState.CANCELLED);
      expect(targets).toContain(AgentState.FAILED);
      expect(targets).toHaveLength(4);
    });

    it('EXECUTING 可达 [COMPLETED, FAILED, PAUSED, CANCELLED]', () => {
      const targets = getAvailableTransitions(AgentState.EXECUTING);
      expect(targets).toContain(AgentState.COMPLETED);
      expect(targets).toContain(AgentState.FAILED);
      expect(targets).toContain(AgentState.PAUSED);
      expect(targets).toContain(AgentState.CANCELLED);
      expect(targets).toHaveLength(4);
    });

    it('COMPLETED 无可达状态', () => {
      expect(getAvailableTransitions(AgentState.COMPLETED)).toHaveLength(0);
    });

    it('FAILED 无可达状态', () => {
      expect(getAvailableTransitions(AgentState.FAILED)).toHaveLength(0);
    });

    it('CANCELLED 无可达状态', () => {
      expect(getAvailableTransitions(AgentState.CANCELLED)).toHaveLength(0);
    });
  });

  describe('getAvailableTriggers()', () => {
    it('IDLE 可用触发 [start_planning, cancel]', () => {
      const triggers = getAvailableTriggers(AgentState.IDLE);
      expect(triggers).toContain('start_planning');
      expect(triggers).toContain('cancel');
    });

    it('终态无可用触发', () => {
      expect(getAvailableTriggers(AgentState.COMPLETED)).toHaveLength(0);
      expect(getAvailableTriggers(AgentState.FAILED)).toHaveLength(0);
      expect(getAvailableTriggers(AgentState.CANCELLED)).toHaveLength(0);
    });
  });

  describe('isTerminalState()', () => {
    it('COMPLETED 是终态', () => {
      expect(isTerminalState(AgentState.COMPLETED)).toBe(true);
    });

    it('FAILED 是终态', () => {
      expect(isTerminalState(AgentState.FAILED)).toBe(true);
    });

    it('CANCELLED 是终态', () => {
      expect(isTerminalState(AgentState.CANCELLED)).toBe(true);
    });

    it('IDLE 不是终态', () => {
      expect(isTerminalState(AgentState.IDLE)).toBe(false);
    });

    it('EXECUTING 不是终态', () => {
      expect(isTerminalState(AgentState.EXECUTING)).toBe(false);
    });

    it('PAUSED 不是终态', () => {
      expect(isTerminalState(AgentState.PAUSED)).toBe(false);
    });
  });
});
