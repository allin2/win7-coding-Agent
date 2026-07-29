import {
  parseVersion,
  versionToString,
  isCompatible,
  negotiateVersion,
} from '../../../src/protocol';
import { ErrorCode, GatewayError } from '../../../src/types';

describe('protocol/version', () => {
  describe('parseVersion', () => {
    it('should parse a valid semver string', () => {
      expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('should parse 0.0.0', () => {
      expect(parseVersion('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
    });

    it('should throw on invalid format', () => {
      expect(() => parseVersion('1.2')).toThrow(GatewayError);
      expect(() => parseVersion('abc')).toThrow(GatewayError);
      expect(() => parseVersion('1.2.3.4')).toThrow(GatewayError);
    });
  });

  describe('versionToString', () => {
    it('should convert SemVer back to string', () => {
      expect(versionToString({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
    });
  });

  describe('isCompatible', () => {
    it('should return true for same major version', () => {
      expect(isCompatible({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 5, patch: 9 })).toBe(true);
    });

    it('should return false for different major version', () => {
      expect(isCompatible({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(false);
    });
  });

  describe('negotiateVersion', () => {
    it('should negotiate when versions are compatible', () => {
      const result = negotiateVersion('1.2.0', '1.3.0');
      expect(result).toEqual({ major: 1, minor: 2, patch: 0 });
    });

    it('should pick lower minor when client is lower', () => {
      const result = negotiateVersion('1.1.0', '1.3.0');
      expect(result.minor).toBe(1);
    });

    it('should pick lower minor when server is lower', () => {
      const result = negotiateVersion('1.5.0', '1.2.0');
      expect(result.minor).toBe(2);
    });

    it('should pick lower patch when major and minor match', () => {
      const result = negotiateVersion('1.2.5', '1.2.3');
      expect(result).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('should throw on incompatible versions', () => {
      expect(() => negotiateVersion('1.0.0', '2.0.0')).toThrow(GatewayError);
    });

    it('thrown error has PROTOCOL_VERSION_MISMATCH code', () => {
      try {
        negotiateVersion('1.0.0', '2.0.0');
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(GatewayError);
        expect((e as GatewayError).code).toBe(ErrorCode.PROTOCOL_VERSION_MISMATCH);
      }
    });
  });
});
