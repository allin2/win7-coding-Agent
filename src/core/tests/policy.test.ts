/**
 * @module policy.test
 * @description Policy 引擎测试 — READ_ONLY、WORKSPACE_WRITE、外部 FULL_ACCESS 拒绝与结构化 argv
 */

import { PolicyEngine } from '../src/policy';
import { ToolCall, ApprovalLevel, PolicyVerdict } from '../src/types';
import { bindCapabilityToToolCall } from '../src/approval-binding';

function writeCall(id: string = 'call-write'): ToolCall {
  return {
    id,
    toolName: 'fs.writeFile',
    args: { path: '/workspace/file.txt', content: 'hello' },
    approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
    approvalContext: {
      previewSha256: 'preview-sha',
      baselineSha256: 'baseline-sha',
    },
  };
}

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('READ_ONLY 工具', () => {
    it('白名单内的只读工具始终允许', () => {
      const toolCall: ToolCall = {
        id: 'call-1',
        toolName: 'fs.readFile',
        args: { path: '/some/file.txt' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);
      expect(decision.level).toBe(ApprovalLevel.READ_ONLY);
      expect(decision).toMatchObject({ verdict: PolicyVerdict.ALLOW, ruleId: 'POLICY_READ_ONLY_ALLOWED' });
    });

    it('只读工具无需令牌', () => {
      const toolCall: ToolCall = {
        id: 'call-2',
        toolName: 'fs.readdir',
        args: { path: '/some/dir' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);
    });
  });

  describe('WORKSPACE_WRITE 工具', () => {
    it('无令牌时拒绝', () => {
      const toolCall = writeCall('call-3');
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('能力令牌');
      expect(decision.verdict).toBe(PolicyVerdict.ASK);
    });

    it('即使有令牌 ID，无 tokenValidator 时也 fail-closed', () => {
      const decision = engine.evaluate(writeCall('call-4'), 'some-token-id', 'sess-1');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('fail-closed');
    });

    it('有令牌但 tokenValidator 返回无效时拒绝', () => {
      const engineWithValidator = new PolicyEngine({
        tokenValidator: () => ({ valid: false, reason: '令牌已过期' }),
      });
      const toolCall = writeCall('call-5');
      const decision = engineWithValidator.evaluate(toolCall, 'expired-token', 'sess-1');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('令牌已过期');
    });

    it('令牌缺少 workspace_write 能力时拒绝', () => {
      const engineWithValidator = new PolicyEngine({
        tokenValidator: () => ({
          valid: true,
          token: {
            tokenId: 'tok-1',
            sessionId: 'sess-1',
            capabilities: ['read_only'],
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            revoked: false,
          },
        }),
      });
      const toolCall = writeCall('call-6');
      const decision = engineWithValidator.evaluate(toolCall, 'tok-1', 'sess-1');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('workspace_write');
    });

    it('仅允许会话、请求、预览和基线完全匹配的令牌', () => {
      const toolCall = writeCall('call-bound');
      const token = {
        tokenId: 'tok-bound',
        sessionId: 'sess-1',
        capabilities: ['workspace_write'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        revoked: false,
        binding: bindCapabilityToToolCall(toolCall),
      };
      const boundEngine = new PolicyEngine({
        tokenValidator: () => ({ valid: true, token }),
      });

      expect(boundEngine.evaluate(toolCall, token.tokenId, 'sess-1').allowed).toBe(true);
      const changed = writeCall('call-bound');
      changed.args = { path: '/workspace/file.txt', content: 'changed' };
      expect(boundEngine.evaluate(changed, token.tokenId, 'sess-1').allowed).toBe(false);
      expect(boundEngine.evaluate(toolCall, token.tokenId, 'other-session').allowed).toBe(false);
    });
  });

  describe('FULL_ACCESS 工具', () => {
    it('在 A9 Full Access 下允许已批准的工具执行（ADR-0089）', () => {
      const toolCall: ToolCall = {
        id: 'call-7',
        toolName: 'shell',
        args: { command: 'git status' },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);
      expect(decision.ruleId).toBe('POLICY_FULL_ACCESS_ALLOWED');
    });

    it('asks before a git push hidden inside a compound CMD payload', () => {
      const decision = engine.evaluate({
        id: 'call-cmd-push',
        toolName: 'shell',
        args: {
          command: 'cmd.exe /d /v:off /c \'set "GIT_CONFIG_COUNT=1" && C:\\tools\\git.exe push a9-win7-13 main:main\'',
        },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      });
      expect(decision).toMatchObject({
        allowed: false,
        verdict: PolicyVerdict.ASK,
        ruleId: 'POLICY_ALWAYS_CONFIRM_REQUIRED',
      });
      expect(decision.reason).toContain('remote=a9-win7-13');
      expect(decision.reason).toContain('branch=main');
    });
  });

  it('evaluates approval facts without consulting a token store', () => {
    const call = writeCall('pure-call');
    const token = {
      tokenId: 'pure-token', sessionId: 'sess-1', capabilities: ['workspace_write'],
      expiresAt: '2099-01-01T00:00:00.000Z', revoked: false,
      binding: bindCapabilityToToolCall(call),
    };
    expect(engine.evaluateFacts(call, { sessionId: 'sess-1', token })).toMatchObject({
      verdict: PolicyVerdict.ALLOW,
      ruleId: 'POLICY_APPROVAL_BOUND',
    });
  });

  describe('工具名白名单验证', () => {
    it('不在白名单内的工具被拒绝', () => {
      const toolCall: ToolCall = {
        id: 'call-8',
        toolName: 'malicious.tool',
        args: {},
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('白名单');
    });
  });

  describe('结构化参数验证', () => {
    it('文件名中的元字符作为普通数据允许通过', () => {
      const toolCall: ToolCall = {
        id: 'call-9',
        toolName: 'fs.readFile',
        args: { path: '/workspace/a|b;$(literal).txt' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);
    });

    it('terminal.exec 拒绝 commandLine 字符串', () => {
      const toolCall: ToolCall = {
        id: 'call-10',
        toolName: 'terminal.exec',
        args: { commandLine: 'git status && whoami' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('command + argv');
    });

    it('terminal.exec 拒绝通用 Shell 宿主', () => {
      const toolCall: ToolCall = {
        id: 'call-11',
        toolName: 'terminal.exec',
        args: { command: 'cmd.exe', argv: ['/c', 'dir'] },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Shell 宿主');
    });

    it('terminal.exec requires an approved command profile even with structured argv', () => {
      const toolCall: ToolCall = {
        id: 'call-12',
        toolName: 'terminal.exec',
        args: { command: 'rg.exe', argv: ['a|b', '/workspace'] },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision).toMatchObject({
        allowed: false,
        ruleId: 'POLICY_COMMAND_PROFILE_REQUIRED',
      });
    });

    it.each([
      'C:\\Windows\\System32\\config\\SAM',
      'C:\\repo\\.env',
      'C:\\repo\\.git\\config',
    ])('rejects direct access to sensitive path %s', (path) => {
      const decision = engine.evaluate({
        id: 'sensitive-path', toolName: 'fs.readFile', args: { path }, approvalLevel: ApprovalLevel.READ_ONLY,
      });
      expect(decision).toMatchObject({ verdict: PolicyVerdict.DENY, ruleId: 'POLICY_SENSITIVE_PATH_DENIED' });
    });
  });

  describe('自定义白名单', () => {
    it('使用自定义白名单覆盖默认', () => {
      const customEngine = new PolicyEngine({
        toolWhitelist: new Set(['custom.tool']),
      });
      const toolCall: ToolCall = {
        id: 'call-18',
        toolName: 'custom.tool',
        args: {},
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = customEngine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);

      // 默认白名单工具应被拒绝
      const defaultTool: ToolCall = {
        id: 'call-19',
        toolName: 'fs.readFile',
        args: {},
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision2 = customEngine.evaluate(defaultTool);
      expect(decision2.allowed).toBe(false);
    });
  });
});
