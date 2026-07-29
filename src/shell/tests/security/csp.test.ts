/**
 * CSP 生成测试
 */

import { generateCSP, getDefaultCSP } from '../../src/security/csp';

describe('generateCSP', () => {
  describe('默认策略', () => {
    it('包含 default-src none', () => {
      const csp = generateCSP();
      expect(csp).toContain("default-src 'none'");
    });

    it('包含 script-src self', () => {
      const csp = generateCSP();
      expect(csp).toContain("script-src 'self'");
    });

    it('不包含 unsafe-inline', () => {
      const csp = generateCSP();
      expect(csp).not.toContain("'unsafe-inline'");
    });

    it('不包含 unsafe-eval（默认禁止）', () => {
      const csp = generateCSP();
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it('connect-src 默认仅 self', () => {
      const csp = generateCSP();
      expect(csp).toContain("connect-src 'self'");
    });

    it('frame-ancestors 为 none', () => {
      const csp = generateCSP();
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe('自定义 gatewayOrigins', () => {
    it('connect-src 包含指定 gateway origin', () => {
      const csp = generateCSP({ gatewayOrigins: ['http://localhost:9800'] });
      expect(csp).toContain('connect-src http://localhost:9800');
    });

    it('多个 gateway origins 全部包含', () => {
      const csp = generateCSP({
        gatewayOrigins: ['http://localhost:9800', 'https://api.prod.local'],
      });
      expect(csp).toContain('http://localhost:9800');
      expect(csp).toContain('https://api.prod.local');
    });
  });

  describe('allowEval', () => {
    it('allowEval=true 时包含 unsafe-eval', () => {
      const csp = generateCSP({ allowEval: true });
      expect(csp).toContain("'unsafe-eval'");
    });
  });

  describe('extraScriptSrc', () => {
    it('额外 script-src 来源被包含', () => {
      const csp = generateCSP({ extraScriptSrc: ['https://cdn.local'] });
      expect(csp).toMatch(/script-src[^;]*https:\/\/cdn\.local/);
    });
  });

  describe('getDefaultCSP', () => {
    it('返回与无参 generateCSP 相同结果', () => {
      expect(getDefaultCSP()).toBe(generateCSP());
    });
  });
});
