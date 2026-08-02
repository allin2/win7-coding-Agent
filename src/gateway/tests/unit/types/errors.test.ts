import {
  ErrorCode,
  ErrorCategory,
  categorizeError,
  GatewayError,
} from '../../../src/types';

describe('types/errors', () => {
  describe('ErrorCode enum completeness', () => {
    it('should contain all connection error codes (1xx)', () => {
      expect(ErrorCode.CONNECTION_TIMEOUT).toBe(100);
      expect(ErrorCode.CONNECTION_REFUSED).toBe(101);
      expect(ErrorCode.TLS_HANDSHAKE_FAILED).toBe(102);
    });

    it('should contain all protocol error codes (2xx)', () => {
      expect(ErrorCode.PROTOCOL_VERSION_MISMATCH).toBe(200);
      expect(ErrorCode.INVALID_FRAME).toBe(201);
      expect(ErrorCode.DECODE_ERROR).toBe(202);
      expect(ErrorCode.ENCODE_ERROR).toBe(203);
    });

    it('should contain all auth error codes (3xx)', () => {
      expect(ErrorCode.AUTH_REQUIRED).toBe(300);
      expect(ErrorCode.AUTH_INVALID_CREDENTIALS).toBe(301);
      expect(ErrorCode.AUTH_EXPIRED).toBe(302);
    });

    it('should contain all server error codes (4xx)', () => {
      expect(ErrorCode.RATE_LIMITED).toBe(400);
      expect(ErrorCode.INTERNAL_ERROR).toBe(401);
      expect(ErrorCode.MODEL_NOT_FOUND).toBe(402);
      expect(ErrorCode.CONTEXT_LENGTH_EXCEEDED).toBe(403);
    });

    it('should have exactly 19 error codes', () => {
      // Numeric enums in TS produce reverse mappings, so count only numeric values
      const numericValues = Object.values(ErrorCode).filter(v => typeof v === 'number');
      expect(numericValues.length).toBe(19);
    });
  });

  describe('error categorization', () => {
    it('should categorize 1xx as CONNECTION', () => {
      expect(categorizeError(ErrorCode.CONNECTION_TIMEOUT)).toBe(ErrorCategory.CONNECTION);
      expect(categorizeError(ErrorCode.CONNECTION_REFUSED)).toBe(ErrorCategory.CONNECTION);
      expect(categorizeError(ErrorCode.TLS_HANDSHAKE_FAILED)).toBe(ErrorCategory.CONNECTION);
    });

    it('should categorize 2xx as PROTOCOL', () => {
      expect(categorizeError(ErrorCode.PROTOCOL_VERSION_MISMATCH)).toBe(ErrorCategory.PROTOCOL);
      expect(categorizeError(ErrorCode.INVALID_FRAME)).toBe(ErrorCategory.PROTOCOL);
    });

    it('should categorize 3xx as AUTH', () => {
      expect(categorizeError(ErrorCode.AUTH_REQUIRED)).toBe(ErrorCategory.AUTH);
      expect(categorizeError(ErrorCode.AUTH_EXPIRED)).toBe(ErrorCategory.AUTH);
    });

    it('should categorize 4xx as SERVER', () => {
      expect(categorizeError(ErrorCode.RATE_LIMITED)).toBe(ErrorCategory.SERVER);
      expect(categorizeError(ErrorCode.INTERNAL_ERROR)).toBe(ErrorCategory.SERVER);
    });
  });

  describe('GatewayError', () => {
    it('should create error with code and message', () => {
      const err = new GatewayError(ErrorCode.CONNECTION_TIMEOUT, 'timed out');
      expect(err.code).toBe(ErrorCode.CONNECTION_TIMEOUT);
      expect(err.message).toBe('timed out');
      expect(err.category).toBe(ErrorCategory.CONNECTION);
      expect(err.name).toBe('GatewayError');
      expect(err instanceof Error).toBe(true);
    });

    it('should auto-categorize from code', () => {
      const err = new GatewayError(ErrorCode.AUTH_EXPIRED, 'token expired');
      expect(err.category).toBe(ErrorCategory.AUTH);
    });
  });
});
