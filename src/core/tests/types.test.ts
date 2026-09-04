/**
 * @module types.test
 * @description 核心类型测试 — 枚举值和接口结构验证
 */

import { AgentState, ApprovalLevel } from '../src/types';

describe('AgentState enum', () => {
  it('包含所有预期状态', () => {
    expect(AgentState.IDLE).toBe('idle');
    expect(AgentState.PLANNING).toBe('planning');
    expect(AgentState.AWAITING_APPROVAL).toBe('awaiting_approval');
    expect(AgentState.EXECUTING).toBe('executing');
    expect(AgentState.VERIFYING).toBe('verifying');
    expect(AgentState.PAUSED).toBe('paused');
    expect(AgentState.COMPLETED).toBe('completed');
    expect(AgentState.FAILED).toBe('failed');
    expect(AgentState.CANCELLED).toBe('cancelled');
  });

  it('共 9 个状态', () => {
    const values = Object.values(AgentState);
    expect(values).toHaveLength(9);
  });
});

describe('ApprovalLevel enum', () => {
  it('包含所有预期级别', () => {
    expect(ApprovalLevel.READ_ONLY).toBe('read_only');
    expect(ApprovalLevel.REVIEW).toBe('review');
    expect(ApprovalLevel.WORKSPACE_WRITE).toBe('workspace_write');
    expect(ApprovalLevel.FULL_ACCESS).toBe('full_access');
  });

  it('包含 ADR-0089 扩展的级别', () => {
    const values = Object.values(ApprovalLevel);
    expect(values).toEqual(['read_only', 'review', 'workspace_write', 'full_access']);
  });
});
