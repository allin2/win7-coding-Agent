import { encode, decode, roundTrip } from '../../../src/types';

describe('types/codecs', () => {
  describe('JSON serialization round-trip', () => {
    it('should round-trip a simple object', () => {
      const obj = { name: 'test', count: 42, nested: { a: true } };
      expect(roundTrip(obj)).toEqual(obj);
    });

    it('should round-trip arrays', () => {
      const arr = [1, 'two', null, { three: 3 }];
      expect(roundTrip(arr)).toEqual(arr);
    });

    it('should round-trip primitive values', () => {
      expect(roundTrip(42)).toBe(42);
      expect(roundTrip('hello')).toBe('hello');
      expect(roundTrip(null)).toBe(null);
      expect(roundTrip(true)).toBe(true);
    });

    it('encode produces valid JSON string', () => {
      const result = encode({ x: 1 });
      expect(typeof result).toBe('string');
      expect(JSON.parse(result)).toEqual({ x: 1 });
    });

    it('decode parses a JSON string', () => {
      const result = decode<{ x: number }>('{"x":1}');
      expect(result).toEqual({ x: 1 });
    });
  });

  describe('unknown field tolerance', () => {
    it('should preserve unknown fields through decode', () => {
      const raw = '{"known":1,"unknownField":"preserved"}';
      const result = decode<Record<string, unknown>>(raw);
      expect(result.known).toBe(1);
      expect(result.unknownField).toBe('preserved');
    });

    it('should not throw on extra fields in typed decode', () => {
      interface Simple { a: number }
      const raw = '{"a":1,"b":2,"c":"extra"}';
      const result = decode<Simple>(raw);
      expect(result.a).toBe(1);
      // b and c are present but not typed — should not throw
    });

    it('round-trip preserves all fields including unknown', () => {
      const obj = { known: 'yes', extra: 'data', another: 99 };
      const result = roundTrip(obj);
      expect(result).toEqual(obj);
    });
  });
});
