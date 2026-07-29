/**
 * @module policy.test
 * @description Policy 引擎测试 — READ_ONLY 允许、WORKSPACE_WRITE 令牌检查、FULL_ACCESS 拒绝、shell 元字符拒绝
 */

import { PolicyEngine } from '../src/policy';
import { ToolCall, ApprovalLevel } from '../src/types';

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
      const toolCall: ToolCall = {
        id: 'call-3',
        toolName: 'fs.writeFile',
        args: { path: '/workspace/file.txt', content: 'hello' },
        approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('能力令牌');
    });

    it('有令牌时允许（无 tokenValidator）', () => {
      const toolCall: ToolCall = {
        id: 'call-4',
        toolName: 'fs.writeFile',
        args: { path: '/workspace/file.txt', content: 'hello' },
        approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
      };
      const decision = engine.evaluate(toolCall, 'some-token-id');
      expect(decision.allowed).toBe(true);
    });

    it('有令牌但 tokenValidator 返回无效时拒绝', () => {
      const engineWithValidator = new PolicyEngine({
        tokenValidator: () => ({ valid: false, reason: '令牌已过期' }),
      });
      const toolCall: ToolCall = {
        id: 'call-5',
        toolName: 'fs.writeFile',
        args: { path: '/workspace/file.txt', content: 'hello' },
        approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
      };
      const decision = engineWithValidator.evaluate(toolCall, 'expired-token');
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
      const toolCall: ToolCall = {
        id: 'call-6',
        toolName: 'fs.writeFile',
        args: { path: '/workspace/file.txt', content: 'hello' },
        approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
      };
      const decision = engineWithValidator.evaluate(toolCall, 'tok-1');
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('workspace_write');
    });
  });

  describe('FULL_ACCESS 工具', () => {
    it('始终拒绝（ADR-0030）', () => {
      const toolCall: ToolCall = {
        id: 'call-7',
        toolName: 'terminal.exec',
        args: { command: 'rm -rf /' },
        approvalLevel: ApprovalLevel.FULL_ACCESS,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('ADR-0030');
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

  describe('Shell 元字符验证', () => {
    it('参数包含 | 被拒绝', () => {
      const toolCall: ToolCall = {
        id: 'call-9',
        toolName: 'fs.readFile',
        args: { path: '/file.txt | cat /etc/passwd' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('shell 元字符');
    });

    it('参数包含 ; 被拒绝', () => {
      const toolCall: ToolCall = {
        id: 'call-10',
        toolName: 'fs.readFile',
        args: { path: '/file.txt; rm -rf /' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
    });

    it('参数包含 && 被拒绝', () => {
      const toolCall: ToolCall = {
        id: 'call-11',
        toolName: 'fs.readFile',
        args: { path: '/file.txt && echo hacked' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
    });

    it('参数包含 || 被拒绝', () => {
      const toolCall: ToolCall = {
        id: 'call-12',
        toolName: 'fs.readFile',
        args: { path: '/file.txt || echo fail' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
    });

    it('参数包含 ` 被拒绝', () => {
      const toolCall: ToolCall = {
        id: 'call-13',
        toolName: 'fs.readFile',
        args: { path: '`whoami`' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
    });

    it('参数包含 $() 被拒绝', () => {
      const toolCall: ToolCall = {
        id: 'call-14',
        toolName: 'fs.readFile',
        args: { path: '$(cat /etc/passwd)' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
    });

    it('嵌套对象中的元字符也被检测', () => {
      const toolCall: ToolCall = {
        id: 'call-15',
        toolName: 'fs.readFile',
        args: { options: { nested: { value: 'safe | dangerous' } } },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
    });

    it('数组中的元字符也被检测', () => {
      const toolCall: ToolCall = {
        id: 'call-16',
        toolName: 'fs.readFile',
        args: { paths: ['/safe.txt', '/bad.txt; rm -rf /'] },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(false);
    });

    it('安全参数正常通过', () => {
      const toolCall: ToolCall = {
        id: 'call-17',
        toolName: 'fs.readFile',
        args: { path: '/workspace/中文路径/文件.txt' },
        approvalLevel: ApprovalLevel.READ_ONLY,
      };
      const decision = engine.evaluate(toolCall);
      expect(decision.allowed).toBe(true);
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
