/**
 * 出站过滤白名单测试
 */

import { OutboundFilter } from '../../src/security/outbound';
import { ShellError, ShellErrorCode } from '../../src/errors';

describe('OutboundFilter', () => {
  let filter: OutboundFilter;

  beforeEach(() => {
    filter = new OutboundFilter();
  });

  describe('默认拒绝', () => {
    it('空过滤器拒绝所有请求', () => {
      const result = filter.checkRequest('https://example.com/api');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('不在白名单中');
    });

    it('无效 URL 被拒绝', () => {
      const result = filter.checkRequest('not-a-url');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('无效 URL');
    });
  });

  describe('白名单管理', () => {
    it('添加白名单后允许对应请求', () => {
      filter.addAllowedHost('api.gateway.local', 9800, 'https');
      const result = filter.checkRequest('https://api.gateway.local:9800/invoke');
      expect(result.allowed).toBe(true);
    });

    it('端口不匹配时拒绝', () => {
      filter.addAllowedHost('api.gateway.local', 9800, 'https');
      const result = filter.checkRequest('https://api.gateway.local:8080/invoke');
      expect(result.allowed).toBe(false);
    });

    it('协议不匹配时拒绝', () => {
      filter.addAllowedHost('api.gateway.local', 443, 'https');
      const result = filter.checkRequest('http://api.gateway.local/invoke');
      expect(result.allowed).toBe(false);
    });

    it('removeAllowedHost 移除后拒绝', () => {
      filter.addAllowedHost('api.gateway.local', 9800, 'https');
      filter.removeAllowedHost('api.gateway.local');
      const result = filter.checkRequest('https://api.gateway.local:9800/invoke');
      expect(result.allowed).toBe(false);
    });

    it('size 反映当前白名单条目数', () => {
      expect(filter.size).toBe(0);
      filter.addAllowedHost('a.local', 80, 'http');
      filter.addAllowedHost('b.local', 443, 'https');
      expect(filter.size).toBe(2);
      filter.removeAllowedHost('a.local');
      expect(filter.size).toBe(1);
    });

    it('clear 清空白名单', () => {
      filter.addAllowedHost('a.local', 80, 'http');
      filter.clear();
      expect(filter.size).toBe(0);
    });

    it('getAllowedHosts 返回只读列表', () => {
      filter.addAllowedHost('a.local', 80, 'http');
      filter.addAllowedHost('b.local', 443, 'https');
      const hosts = filter.getAllowedHosts();
      expect(hosts).toHaveLength(2);
    });
  });

  describe('enforceRequest', () => {
    it('被阻断时抛出 ShellError', () => {
      expect(() => filter.enforceRequest('https://evil.com/steal')).toThrow(ShellError);
      try {
        filter.enforceRequest('https://evil.com/steal');
      } catch (err) {
        expect((err as ShellError).code).toBe(ShellErrorCode.OUTBOUND_BLOCKED);
      }
    });

    it('白名单内请求不抛出', () => {
      filter.addAllowedHost('safe.local', 443, 'https');
      expect(() => filter.enforceRequest('https://safe.local/api')).not.toThrow();
    });
  });

  describe('默认端口推断', () => {
    it('https 无显式端口时默认 443', () => {
      filter.addAllowedHost('host.local', 443, 'https');
      const result = filter.checkRequest('https://host.local/path');
      expect(result.allowed).toBe(true);
    });

    it('http 无显式端口时默认 80', () => {
      filter.addAllowedHost('host.local', 80, 'http');
      const result = filter.checkRequest('http://host.local/path');
      expect(result.allowed).toBe(true);
    });
  });
});
