/**
 * @module broker.test
 * @description 能力令牌管理测试 — 发放/撤销/验证/过期/能力检查
 */

import { CapabilityBroker } from '../src/broker';
import { AgentError, AgentErrorCode } from '../src/errors';

describe('CapabilityBroker', () => {
  let broker: CapabilityBroker;

  beforeEach(() => {
    broker = new CapabilityBroker();
  });

  describe('issueToken()', () => {
    it('发放令牌并返回完整对象', () => {
      const token = broker.issueToken('session-1', ['read_only', 'workspace_write']);
      expect(token.tokenId).toBeDefined();
      expect(token.tokenId).toMatch(/^tok_/);
      expect(token.sessionId).toBe('session-1');
      expect(token.capabilities).toEqual(['read_only', 'workspace_write']);
      expect(token.expiresAt).toBeDefined();
      expect(token.revoked).toBe(false);
    });

    it('每次发放生成唯一 tokenId', () => {
      const token1 = broker.issueToken('session-1', ['read_only']);
      const token2 = broker.issueToken('session-1', ['read_only']);
      expect(token1.tokenId).not.toBe(token2.tokenId);
    });

    it('支持自定义 TTL', () => {
      const token = broker.issueToken('session-1', ['read_only'], 60000);
      const expiresAt = new Date(token.expiresAt).getTime();
      const now = Date.now();
      // 过期时间应在 60 秒左右
      expect(expiresAt - now).toBeGreaterThan(50000);
      expect(expiresAt - now).toBeLessThan(70000);
    });
  });

  describe('revokeToken()', () => {
    it('成功撤销令牌', () => {
      const token = broker.issueToken('session-1', ['read_only']);
      broker.revokeToken(token.tokenId);
      const result = broker.validateToken(token.tokenId);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('令牌已撤销');
    });

    it('撤销不存在的令牌抛出错误', () => {
      expect(() => broker.revokeToken('nonexistent')).toThrow(AgentError);
      try {
        broker.revokeToken('nonexistent');
      } catch (e) {
        expect((e as AgentError).code).toBe(AgentErrorCode.CAPABILITY_REVOKED);
      }
    });
  });

  describe('validateToken()', () => {
    it('有效令牌验证通过', () => {
      const token = broker.issueToken('session-1', ['read_only']);
      const result = broker.validateToken(token.tokenId);
      expect(result.valid).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token?.tokenId).toBe(token.tokenId);
    });

    it('不存在的令牌验证失败', () => {
      const result = broker.validateToken('nonexistent');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('令牌不存在');
    });

    it('已撤销令牌验证失败', () => {
      const token = broker.issueToken('session-1', ['read_only']);
      broker.revokeToken(token.tokenId);
      const result = broker.validateToken(token.tokenId);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('令牌已撤销');
    });

    it('过期令牌验证失败', () => {
      // 发放一个 TTL 为 0 的令牌（立即过期）
      const token = broker.issueToken('session-1', ['read_only'], 0);
      // 等待 1ms 确保过期
      const result = broker.validateToken(token.tokenId);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('令牌已过期');
    });
  });

  describe('hasCapability()', () => {
    it('有效令牌具有授权的能力', () => {
      const token = broker.issueToken('session-1', ['read_only', 'workspace_write']);
      expect(broker.hasCapability(token.tokenId, 'read_only')).toBe(true);
      expect(broker.hasCapability(token.tokenId, 'workspace_write')).toBe(true);
    });

    it('有效令牌不具有未授权的能力', () => {
      const token = broker.issueToken('session-1', ['read_only']);
      expect(broker.hasCapability(token.tokenId, 'workspace_write')).toBe(false);
    });

    it('无效令牌返回 false', () => {
      expect(broker.hasCapability('nonexistent', 'read_only')).toBe(false);
    });

    it('已撤销令牌返回 false', () => {
      const token = broker.issueToken('session-1', ['read_only']);
      broker.revokeToken(token.tokenId);
      expect(broker.hasCapability(token.tokenId, 'read_only')).toBe(false);
    });
  });

  describe('getTokensBySession()', () => {
    it('返回会话的所有有效令牌', () => {
      broker.issueToken('session-1', ['read_only']);
      broker.issueToken('session-1', ['workspace_write']);
      broker.issueToken('session-2', ['read_only']);

      const tokens = broker.getTokensBySession('session-1');
      expect(tokens).toHaveLength(2);
      expect(tokens.every((t) => t.sessionId === 'session-1')).toBe(true);
    });

    it('不存在的会话返回空数组', () => {
      expect(broker.getTokensBySession('nonexistent')).toHaveLength(0);
    });

    it('不包含已撤销的令牌', () => {
      const token1 = broker.issueToken('session-1', ['read_only']);
      broker.issueToken('session-1', ['workspace_write']);
      broker.revokeToken(token1.tokenId);

      const tokens = broker.getTokensBySession('session-1');
      expect(tokens).toHaveLength(1);
    });
  });

  describe('clearSession()', () => {
    it('清理会话的所有令牌', () => {
      broker.issueToken('session-1', ['read_only']);
      broker.issueToken('session-1', ['workspace_write']);
      broker.clearSession('session-1');

      expect(broker.getTokensBySession('session-1')).toHaveLength(0);
    });

    it('清理不存在的会话不报错', () => {
      expect(() => broker.clearSession('nonexistent')).not.toThrow();
    });
  });
});
