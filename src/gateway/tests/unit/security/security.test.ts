import {
  TLSVersion,
  TLSConfig,
  defaultTLSConfig,
  validateTLSConfig,
  InMemoryCredentialStore,
  redactApiKey,
  sanitizeForLog,
  sanitizeForAudit,
} from '../../../src/security';
import { ErrorCode, GatewayError } from '../../../src/types';

describe('security', () => {
  // ── TLS Configuration ──────────────────────────────────────────────────────

  describe('TLS config', () => {
    it('defaultTLSConfig should be secure by default', () => {
      const cfg = defaultTLSConfig();
      expect(cfg.verifyCertificate).toBe(true);
      expect(cfg.minTLSVersion).toBe(TLSVersion.TLS_1_2);
      expect(cfg.caBundle).toBeUndefined();
    });

    it('validateTLSConfig should accept a valid secure config', () => {
      const cfg: TLSConfig = {
        verifyCertificate: true,
        minTLSVersion: TLSVersion.TLS_1_2,
      };
      expect(() => validateTLSConfig(cfg)).not.toThrow();
    });

    it('validateTLSConfig should accept TLS 1.3', () => {
      const cfg: TLSConfig = {
        verifyCertificate: true,
        minTLSVersion: TLSVersion.TLS_1_3,
      };
      expect(() => validateTLSConfig(cfg)).not.toThrow();
    });

    it('should fail-closed when verifyCertificate is false', () => {
      const cfg: TLSConfig = {
        verifyCertificate: false,
        minTLSVersion: TLSVersion.TLS_1_2,
      };
      expect(() => validateTLSConfig(cfg)).toThrow(GatewayError);
      try {
        validateTLSConfig(cfg);
      } catch (e) {
        expect((e as GatewayError).code).toBe(ErrorCode.TLS_VERIFY_FAILED);
      }
    });

    it('should fail-closed when verifyCertificate is undefined', () => {
      const cfg = { verifyCertificate: undefined, minTLSVersion: TLSVersion.TLS_1_2 } as unknown as TLSConfig;
      expect(() => validateTLSConfig(cfg)).toThrow(GatewayError);
    });

    it('should reject TLS versions below 1.2', () => {
      const cfg: TLSConfig = {
        verifyCertificate: true,
        minTLSVersion: TLSVersion.TLS_1_0,
      };
      expect(() => validateTLSConfig(cfg)).toThrow(/below TLS 1.2/);
    });

    it('should reject TLS 1.1', () => {
      const cfg: TLSConfig = {
        verifyCertificate: true,
        minTLSVersion: TLSVersion.TLS_1_1,
      };
      expect(() => validateTLSConfig(cfg)).toThrow(/below TLS 1.2/);
    });

    it('should accept a valid caBundle path', () => {
      const cfg: TLSConfig = {
        verifyCertificate: true,
        minTLSVersion: TLSVersion.TLS_1_2,
        caBundle: '/path/to/ca-bundle.crt',
      };
      expect(() => validateTLSConfig(cfg)).not.toThrow();
    });

    it('should reject an empty caBundle path', () => {
      const cfg: TLSConfig = {
        verifyCertificate: true,
        minTLSVersion: TLSVersion.TLS_1_2,
        caBundle: '   ',
      };
      expect(() => validateTLSConfig(cfg)).toThrow(/non-empty string/);
    });

    it('should throw TLS_VERIFY_FAILED for null config', () => {
      expect(() => validateTLSConfig(null as unknown as TLSConfig)).toThrow(GatewayError);
    });
  });

  // ── Credential Store ───────────────────────────────────────────────────────

  describe('InMemoryCredentialStore', () => {
    let store: InMemoryCredentialStore;

    beforeEach(() => {
      store = new InMemoryCredentialStore();
    });

    it('should return undefined when no API key is set', () => {
      expect(store.getApiKey()).toBeUndefined();
    });

    it('should store and retrieve an API key', () => {
      store.setApiKey('sk-test-key-1234567890abcdef');
      expect(store.getApiKey()).toBe('sk-test-key-1234567890abcdef');
    });

    it('should reject empty API key', () => {
      expect(() => store.setApiKey('')).toThrow(GatewayError);
    });

    it('should store and retrieve proxy credentials', () => {
      store.setProxyCredentials({ username: 'user', password: 'pass' });
      const creds = store.getProxyCredentials();
      expect(creds).toEqual({ username: 'user', password: 'pass' });
    });

    it('should reject invalid proxy credentials', () => {
      expect(() => store.setProxyCredentials({ username: '', password: '' } as any)).not.toThrow();
      expect(() => store.setProxyCredentials(null as any)).toThrow(GatewayError);
    });

    it('should clear all credentials', () => {
      store.setApiKey('sk-test-key-1234567890abcdef');
      store.setProxyCredentials({ username: 'user', password: 'pass' });
      store.clear();
      expect(store.getApiKey()).toBeUndefined();
      expect(store.getProxyCredentials()).toBeUndefined();
    });
  });

  // ── Data Sanitization ──────────────────────────────────────────────────────

  describe('redactApiKey', () => {
    it('should show first 4 chars + ***', () => {
      expect(redactApiKey('sk-abcdefghijklmnopqrstuvwxyz')).toBe('sk-a***');
    });

    it('should return *** for short strings', () => {
      expect(redactApiKey('abc')).toBe('***');
      expect(redactApiKey('')).toBe('***');
    });

    it('should return *** for strings of 4 chars or fewer', () => {
      expect(redactApiKey('abcd')).toBe('***');
      expect(redactApiKey('abc')).toBe('***');
      expect(redactApiKey('')).toBe('***');
    });

    it('should show first 4 chars + *** for strings longer than 4', () => {
      expect(redactApiKey('abcde')).toBe('abcd***');
    });
  });

  describe('sanitizeForLog', () => {
    it('should redact API key patterns in strings', () => {
      const input = 'Using key sk-abcdefghijklmnopqrstuvwxyz1234567890 for auth';
      const result = sanitizeForLog(input) as string;
      expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890');
      expect(result).toContain('sk-a***');
    });

    it('should redact sensitive fields in objects', () => {
      const input = {
        apiKey: 'sk-secret-key-value-12345678',
        model: 'gpt-4',
        password: 'super-secret-password',
      };
      const result = sanitizeForLog(input) as Record<string, unknown>;
      expect(result.model).toBe('gpt-4');
      expect(result.apiKey).not.toBe('sk-secret-key-value-12345678');
      expect(result.password).not.toBe('super-secret-password');
    });

    it('should redact nested sensitive fields', () => {
      const input = {
        config: {
          auth: {
            token: 'bearer-token-value-12345678',
          },
          endpoint: 'https://api.example.com',
        },
      };
      const result = sanitizeForLog(input) as Record<string, unknown>;
      const config = result.config as Record<string, unknown>;
      const auth = config.auth as Record<string, unknown>;
      expect(auth.token).not.toBe('bearer-token-value-12345678');
      expect(config.endpoint).toBe('https://api.example.com');
    });

    it('should truncate long prompt content when configured', () => {
      const longContent = 'x'.repeat(300);
      const result = sanitizeForLog(longContent, { redactPromptContent: true }) as string;
      expect(result.length).toBeLessThan(300);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact messages in model request objects', () => {
      const input = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'x'.repeat(200) },
        ],
      };
      const result = sanitizeForLog(input, { redactPromptContent: true }) as Record<string, unknown>;
      const messages = result.messages as Array<{ content: string }>;
      expect(messages[0].content).toContain('[REDACTED]');
    });

    it('should not mutate the original object', () => {
      const original = { apiKey: 'secret-key-value-12345678', model: 'gpt-4' };
      const originalCopy = { ...original };
      sanitizeForLog(original);
      expect(original.apiKey).toBe(originalCopy.apiKey);
    });
  });

  describe('sanitizeForAudit', () => {
    it('should preserve structural fields', () => {
      const input = {
        id: 'req-123',
        requestId: 'req-123',
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
      const result = sanitizeForAudit(input);
      expect(result.id).toBe('req-123');
      expect(result.model).toBe('gpt-4');
      expect(result.finishReason).toBe('stop');
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    });

    it('should add audit metadata', () => {
      const result = sanitizeForAudit({ id: 'test' });
      expect(result._auditTimestamp).toBeDefined();
      expect(typeof result._auditTimestamp).toBe('number');
      expect(result._sanitized).toBe(true);
    });

    it('should redact sensitive fields in audit output', () => {
      const input = {
        id: 'req-123',
        apiKey: 'sk-secret-key-1234567890abcdef',
        password: 'my-password',
      };
      const result = sanitizeForAudit(input);
      expect(result.id).toBe('req-123');
      expect(result.apiKey).not.toBe('sk-secret-key-1234567890abcdef');
      expect(result.password).not.toBe('my-password');
    });
  });
});
