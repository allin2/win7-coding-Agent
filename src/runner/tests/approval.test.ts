/**
 * @file 三档审批逻辑单元测试（ADR-0030）
 * @description 覆盖 READ_ONLY 批准、WORKSPACE_WRITE 需审批、FULL_ACCESS 拒绝
 */

import { checkApproval, ApprovalLevel } from '../src/approval';

describe('checkApproval — ADR-0030 三档审批', () => {
  describe('READ_ONLY — 始终批准', () => {
    it('READ_ONLY 会话 + READ_ONLY 请求 → 批准', () => {
      const result = checkApproval(ApprovalLevel.READ_ONLY, ApprovalLevel.READ_ONLY);
      expect(result.approved).toBe(true);
      expect(result.reason).toContain('always approved');
    });

    it('WORKSPACE_WRITE 会话 + READ_ONLY 请求 → 批准', () => {
      const result = checkApproval(ApprovalLevel.WORKSPACE_WRITE, ApprovalLevel.READ_ONLY);
      expect(result.approved).toBe(true);
    });
  });

  describe('WORKSPACE_WRITE — 需显式审批', () => {
    it('WORKSPACE_WRITE 会话 + WORKSPACE_WRITE 请求 → 批准', () => {
      const result = checkApproval(ApprovalLevel.WORKSPACE_WRITE, ApprovalLevel.WORKSPACE_WRITE);
      expect(result.approved).toBe(true);
      expect(result.reason).toContain('approved');
    });

    it('READ_ONLY 会话 + WORKSPACE_WRITE 请求 → 拒绝', () => {
      const result = checkApproval(ApprovalLevel.READ_ONLY, ApprovalLevel.WORKSPACE_WRITE);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('requires explicit approval');
    });
  });

  describe('FULL_ACCESS — 始终拒绝（ADR-0030 明令不做）', () => {
    it('FULL_ACCESS 请求 → 始终拒绝', () => {
      const result = checkApproval(ApprovalLevel.FULL_ACCESS, ApprovalLevel.FULL_ACCESS);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('prohibited');
    });

    it('READ_ONLY 会话 + FULL_ACCESS 请求 → 拒绝', () => {
      const result = checkApproval(ApprovalLevel.READ_ONLY, ApprovalLevel.FULL_ACCESS);
      expect(result.approved).toBe(false);
    });

    it('WORKSPACE_WRITE 会话 + FULL_ACCESS 请求 → 拒绝', () => {
      const result = checkApproval(ApprovalLevel.WORKSPACE_WRITE, ApprovalLevel.FULL_ACCESS);
      expect(result.approved).toBe(false);
    });

    it('FULL_ACCESS 会话 + READ_ONLY 请求 → 也拒绝（防止越权）', () => {
      const result = checkApproval(ApprovalLevel.FULL_ACCESS, ApprovalLevel.READ_ONLY);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('FULL_ACCESS');
    });
  });

  describe('未知级别 — fail-closed', () => {
    it('未知请求级别 → 拒绝', () => {
      const result = checkApproval(ApprovalLevel.READ_ONLY, 'unknown' as ApprovalLevel);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('fail-closed');
    });
  });
});
