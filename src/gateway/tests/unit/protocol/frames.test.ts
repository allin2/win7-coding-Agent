import {
  encodeFrame,
  parseFrame,
  splitFrames,
  parseSSE,
} from '../../../src/protocol';
import { GatewayError } from '../../../src/types';

describe('protocol/frames', () => {
  describe('frame boundary handling', () => {
    it('should encode a frame with type:payload format', () => {
      const encoded = encodeFrame({ type: 'msg', payload: '{"id":1}' });
      expect(encoded).toBe('msg:{"id":1}\n');
    });

    it('should parse a valid frame line', () => {
      const frame = parseFrame('msg:{"id":1}');
      expect(frame).toEqual({ type: 'msg', payload: '{"id":1}' });
    });

    it('should return null for empty lines', () => {
      expect(parseFrame('')).toBeNull();
      expect(parseFrame('\n')).toBeNull();
    });

    it('should throw on malformed frame (no colon)', () => {
      expect(() => parseFrame('malformed')).toThrow(GatewayError);
    });

    it('should handle payload containing colons', () => {
      const frame = parseFrame('data:{"url":"http://example.com:8080"}');
      expect(frame!.type).toBe('data');
      expect(frame!.payload).toBe('{"url":"http://example.com:8080"}');
    });

    it('splitFrames should parse multiple complete frames', () => {
      const buffer = 'msg:hello\nmsg:world\n';
      const result = splitFrames(buffer);
      expect(result.frames).toHaveLength(2);
      expect(result.frames[0]).toEqual({ type: 'msg', payload: 'hello' });
      expect(result.frames[1]).toEqual({ type: 'msg', payload: 'world' });
      expect(result.remainder).toBe('');
    });

    it('splitFrames should handle partial data (remainder)', () => {
      const buffer = 'msg:hello\nmsg:par';
      const result = splitFrames(buffer);
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].payload).toBe('hello');
      expect(result.remainder).toBe('msg:par');
    });

    it('splitFrames should handle empty buffer', () => {
      const result = splitFrames('');
      expect(result.frames).toHaveLength(0);
      expect(result.remainder).toBe('');
    });
  });

  describe('SSE parsing', () => {
    it('should parse a simple SSE event', () => {
      const raw = 'data: {"text":"hello"}\n\n';
      const events = parseSSE(raw);
      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('{"text":"hello"}');
    });

    it('should parse SSE event with event type', () => {
      const raw = 'event: message\ndata: {"text":"hi"}\n\n';
      const events = parseSSE(raw);
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('message');
      expect(events[0].data).toBe('{"text":"hi"}');
    });

    it('should parse SSE event with id', () => {
      const raw = 'id: 42\ndata: test\n\n';
      const events = parseSSE(raw);
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('42');
    });

    it('should parse multiple SSE events', () => {
      const raw = 'data: first\n\ndata: second\n\ndata: third\n\n';
      const events = parseSSE(raw);
      expect(events).toHaveLength(3);
      expect(events[0].data).toBe('first');
      expect(events[1].data).toBe('second');
      expect(events[2].data).toBe('third');
    });

    it('should handle multi-line data', () => {
      const raw = 'data: line1\ndata: line2\n\n';
      const events = parseSSE(raw);
      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('line1\nline2');
    });

    it('preserves application-leading spaces after the optional SSE separator', () => {
      const events = parseSSE('event: chunk\ndata:  World\n\n');
      expect(events[0].data).toBe(' World');
    });

    it('should ignore comment lines', () => {
      const raw = ': this is a comment\ndata: actual\n\n';
      const events = parseSSE(raw);
      expect(events).toHaveLength(1);
      expect(events[0].data).toBe('actual');
    });

    it('should return empty array for empty input', () => {
      expect(parseSSE('')).toEqual([]);
    });
  });
});
