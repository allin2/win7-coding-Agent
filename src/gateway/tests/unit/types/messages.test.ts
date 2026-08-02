import {
  createRequest,
  createResponse,
  createErrorResponse,
  createStreamChunk,
  createStreamDone,
  createStreamError,
  isValidStreamEvent,
  ErrorCode,
} from '../../../src/types';
import type { Request, Response, StreamEvent } from '../../../src/types';

describe('types/messages', () => {
  describe('request/response pairing', () => {
    it('should create a request with id, method, and params', () => {
      const req = createRequest('req-1', 'chat.completion', { model: 'gpt-4' });
      expect(req.id).toBe('req-1');
      expect(req.method).toBe('chat.completion');
      expect(req.params).toEqual({ model: 'gpt-4' });
    });

    it('should create a response matching request id', () => {
      const req = createRequest('req-2', 'test');
      const res = createResponse(req.id, { output: 'ok' });
      expect(res.id).toBe(req.id);
      expect(res.result).toEqual({ output: 'ok' });
      expect(res.error).toBeUndefined();
    });

    it('should create an error response matching request id', () => {
      const req = createRequest('req-3', 'test');
      const res = createErrorResponse(req.id, ErrorCode.MODEL_NOT_FOUND, 'model not found');
      expect(res.id).toBe(req.id);
      expect(res.error).toBeDefined();
      expect(res.error!.code).toBe(ErrorCode.MODEL_NOT_FOUND);
      expect(res.result).toBeUndefined();
    });

    it('request with default empty params', () => {
      const req = createRequest('req-4', 'ping');
      expect(req.params).toEqual({});
    });
  });

  describe('streaming event schema', () => {
    it('should create a chunk event', () => {
      const event = createStreamChunk('hello world');
      expect(event.type).toBe('chunk');
      expect(event.data).toBe('hello world');
    });

    it('should create a done event', () => {
      const event = createStreamDone();
      expect(event.type).toBe('done');
    });

    it('should create an error event', () => {
      const event = createStreamError(ErrorCode.RATE_LIMITED, 'too many requests');
      expect(event.type).toBe('error');
      expect(event.error!.code).toBe(ErrorCode.RATE_LIMITED);
    });

    it('isValidStreamEvent accepts valid chunk event', () => {
      expect(isValidStreamEvent({ type: 'chunk', data: 'test' })).toBe(true);
    });

    it('isValidStreamEvent accepts valid done event', () => {
      expect(isValidStreamEvent({ type: 'done' })).toBe(true);
    });

    it('isValidStreamEvent accepts valid error event', () => {
      expect(isValidStreamEvent({
        type: 'error',
        error: { code: ErrorCode.INTERNAL_ERROR, message: 'oops' },
      })).toBe(true);
    });

    it('isValidStreamEvent rejects null', () => {
      expect(isValidStreamEvent(null)).toBe(false);
    });

    it('isValidStreamEvent rejects invalid type', () => {
      expect(isValidStreamEvent({ type: 'invalid' })).toBe(false);
    });

    it('isValidStreamEvent rejects chunk without data string', () => {
      expect(isValidStreamEvent({ type: 'chunk' })).toBe(false);
      expect(isValidStreamEvent({ type: 'chunk', data: 123 })).toBe(false);
    });

    it('isValidStreamEvent rejects error without error object', () => {
      expect(isValidStreamEvent({ type: 'error' })).toBe(false);
      expect(isValidStreamEvent({ type: 'error', error: null })).toBe(false);
    });
  });
});
