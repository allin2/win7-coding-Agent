import {
  ApprovalLevel,
  PermissionMode,
  normalizePermissionMode,
  createPolicyEngine,
  PolicyVerdict,
  ToolCall,
} from '../src';

describe('A9-01: Permission Modes and Policy Engine', () => {
  const policy = createPolicyEngine();

  describe('PermissionMode normalization', () => {
    it('normalizes valid mode strings', () => {
      expect(normalizePermissionMode('full_access')).toBe(PermissionMode.FULL_ACCESS);
      expect(normalizePermissionMode('FullAccess')).toBe(PermissionMode.FULL_ACCESS);
      expect(normalizePermissionMode('review')).toBe(PermissionMode.REVIEW);
      expect(normalizePermissionMode('read_only')).toBe(PermissionMode.READ_ONLY);
      expect(normalizePermissionMode('readonly')).toBe(PermissionMode.READ_ONLY);
    });

    it('defaults unknown inputs to full_access', () => {
      expect(normalizePermissionMode(undefined)).toBe(PermissionMode.FULL_ACCESS);
      expect(normalizePermissionMode(null)).toBe(PermissionMode.FULL_ACCESS);
      expect(normalizePermissionMode('invalid')).toBe(PermissionMode.FULL_ACCESS);
    });
  });

  describe('Full Access Policy Decisions', () => {
    it('allows standard file and shell operations without capability token', () => {
      const readCall: ToolCall = {
        id: 'call-1',
        toolName: 'read',
        args: { path: 'src/index.ts' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const readDecision = policy.evaluate(readCall);
      expect(readDecision.verdict).toBe(PolicyVerdict.ALLOW);
      expect(readDecision.allowed).toBe(true);

      const writeCall: ToolCall = {
        id: 'call-2',
        toolName: 'write',
        args: { path: 'src/new-file.ts', content: 'console.log(1);' },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      };
      const writeDecision = policy.evaluate(writeCall);
      expect(writeDecision.verdict).toBe(PolicyVerdict.ALLOW);
      expect(writeDecision.allowed).toBe(true);
      expect(writeDecision.ruleId).toBe('POLICY_FULL_ACCESS_ALLOWED');

      const shellCall: ToolCall = {
        id: 'call-3',
        toolName: 'shell',
        args: { command: 'npm test' },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      };
      const shellDecision = policy.evaluate(shellCall);
      expect(shellDecision.verdict).toBe(PolicyVerdict.ALLOW);
      expect(shellDecision.allowed).toBe(true);
    });

    it('requires confirmation (ASK) for always-confirm operations in Full Access (A9-M03)', () => {
      const gitPushCall: ToolCall = {
        id: 'call-push',
        toolName: 'shell',
        args: { command: 'git push origin main' },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      };
      const pushDecision = policy.evaluate(gitPushCall);
      expect(pushDecision.verdict).toBe(PolicyVerdict.ASK);
      expect(pushDecision.allowed).toBe(false);
      expect(pushDecision.ruleId).toBe('POLICY_ALWAYS_CONFIRM_REQUIRED');

      const gitResetCall: ToolCall = {
        id: 'call-reset',
        toolName: 'shell',
        args: { command: 'git reset --hard HEAD~1' },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      };
      const resetDecision = policy.evaluate(gitResetCall);
      expect(resetDecision.verdict).toBe(PolicyVerdict.ASK);
      expect(resetDecision.ruleId).toBe('POLICY_ALWAYS_CONFIRM_REQUIRED');

      const permDeleteCall: ToolCall = {
        id: 'call-del',
        toolName: 'delete',
        args: { path: 'temp/file.txt', permanent: true },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      };
      const delDecision = policy.evaluate(permDeleteCall);
      expect(delDecision.verdict).toBe(PolicyVerdict.ASK);
      expect(delDecision.ruleId).toBe('POLICY_ALWAYS_CONFIRM_REQUIRED');

      const publishCall: ToolCall = {
        id: 'call-pub',
        toolName: 'shell',
        args: { command: 'npm publish' },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      };
      expect(policy.evaluate(publishCall).verdict).toBe(PolicyVerdict.ASK);
    });
  });

  describe('Read-Only and Review Regression Protection', () => {
    it('allows read-only tools without approval', () => {
      const listCall: ToolCall = {
        id: 'call-list',
        toolName: 'list',
        args: { path: '' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      expect(policy.evaluate(listCall).verdict).toBe(PolicyVerdict.ALLOW);
    });

    it('requires valid token and binding for REVIEW/WORKSPACE_WRITE calls', () => {
      const writeCall: ToolCall = {
        id: 'call-w1',
        toolName: 'write',
        args: { path: 'file.txt', content: 'test' },
        approvalLevel: ApprovalLevel.REVIEW,
      };
      const decision = policy.evaluate(writeCall);
      expect(decision.verdict).toBe(PolicyVerdict.ASK);
      expect(decision.ruleId).toBe('POLICY_APPROVAL_REQUIRED');
    });

    it('denies sensitive system credential paths', () => {
      const samCall: ToolCall = {
        id: 'call-sam',
        toolName: 'read',
        args: { path: 'C:/Windows/System32/config/SAM' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const samDecision = policy.evaluate(samCall);
      expect(samDecision.verdict).toBe(PolicyVerdict.DENY);
      expect(samDecision.ruleId).toBe('POLICY_SENSITIVE_PATH_DENIED');
    });
  });
});
