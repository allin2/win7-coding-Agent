/**
 * @file 三档审批逻辑单元测试（ADR-0030）
 * @description 覆盖 READ_ONLY 批准、WORKSPACE_WRITE 需审批、FULL_ACCESS 拒绝
 */

import {
  ApprovalLedger,
  ApprovalLevel,
  checkApproval,
  fingerprintApprovalRequest,
} from '../src/approval';

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
      const result = checkApproval('full_access', 'full_access');
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('prohibited');
    });

    it('READ_ONLY 会话 + FULL_ACCESS 请求 → 拒绝', () => {
      const result = checkApproval(ApprovalLevel.READ_ONLY, 'full_access');
      expect(result.approved).toBe(false);
    });

    it('WORKSPACE_WRITE 会话 + FULL_ACCESS 请求 → 拒绝', () => {
      const result = checkApproval(ApprovalLevel.WORKSPACE_WRITE, 'full_access');
      expect(result.approved).toBe(false);
    });

    it('FULL_ACCESS 会话 + READ_ONLY 请求 → 也拒绝（防止越权）', () => {
      const result = checkApproval('full_access', ApprovalLevel.READ_ONLY);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('FULL_ACCESS');
    });
  });

  describe('未知级别 — fail-closed', () => {
    it('未知请求级别 → 拒绝', () => {
      const result = checkApproval(ApprovalLevel.READ_ONLY, 'unknown');
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('fail-closed');
    });
  });
});

describe('ApprovalLedger — exact binding and one-time use', () => {
  const previewSha256 = 'a'.repeat(64);
  const baselineSha256 = 'b'.repeat(64);
  const request = {
    command: 'git.exe',
    args: ['add', 'src/a.ts'],
    workDir: 'C:\\repo',
  };

  it('fingerprints objects independently of property insertion order', () => {
    expect(fingerprintApprovalRequest({ a: 1, b: ['x'] }))
      .toBe(fingerprintApprovalRequest({ b: ['x'], a: 1 }));
  });

  it('accepts an exact binding once and then rejects replay', () => {
    const ledger = new ApprovalLedger();
    const record = ledger.issue({
      sessionId: 'session-1',
      subject: 'git.add',
      request,
      previewSha256,
      baselineSha256,
    });
    const binding = {
      approvalId: record.approvalId,
      sessionId: record.sessionId,
      subject: record.subject,
      previewSha256,
      baselineSha256,
    };

    expect(ledger.validateAndConsume(binding, request).valid).toBe(true);
    expect(ledger.validateAndConsume(binding, request)).toMatchObject({
      valid: false,
      code: 'APPROVAL_REPLAYED',
    });
  });

  it.each([
    ['request', { ...request, args: ['add', 'src/other.ts'] }, previewSha256, baselineSha256],
    ['preview', request, 'c'.repeat(64), baselineSha256],
    ['baseline', request, previewSha256, 'd'.repeat(64)],
  ])('rejects changed %s binding', (_field, executionRequest, preview, baseline) => {
    const ledger = new ApprovalLedger();
    const record = ledger.issue({
      sessionId: 'session-1',
      subject: 'git.add',
      request,
      previewSha256,
      baselineSha256,
    });

    expect(ledger.validateAndConsume({
      approvalId: record.approvalId,
      sessionId: record.sessionId,
      subject: record.subject,
      previewSha256: preview,
      baselineSha256: baseline,
    }, executionRequest)).toMatchObject({
      valid: false,
      code: 'APPROVAL_INVALID',
    });
  });

  it('rejects an expired approval', () => {
    const ledger = new ApprovalLedger();
    const record = ledger.issue({
      sessionId: 'session-1',
      subject: 'git.add',
      request,
      previewSha256,
      baselineSha256,
      ttlMs: 1,
    });

    expect(ledger.validateAndConsume({
      approvalId: record.approvalId,
      sessionId: record.sessionId,
      subject: record.subject,
      previewSha256,
      baselineSha256,
    }, request, new Date(record.expiresAt).getTime())).toMatchObject({
      valid: false,
      code: 'APPROVAL_INVALID',
    });
  });
});
