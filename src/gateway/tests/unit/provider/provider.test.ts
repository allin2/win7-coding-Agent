import {
  GatewayProvider,
  GatewayProviderConfig,
  ExitCode,
  StreamChunk,
} from '../../../src/provider';
import {
  ErrorCode,
  GatewayError,
  ModelRequest,
  FinishReason,
  createModelRequest,
} from '../../../src/types';
import {
  InMemoryCredentialStore,
  TLSVersion,
} from '../../../src/security';
import {
  MockNetworkStack,
  NetworkRequestOptions,
  NetworkResponse,
} from '../../../src/transport';

describe('provider', () => {
  let credentialStore: InMemoryCredentialStore;
  let networkStack: MockNetworkStack;

  function makeProvider(overrides: Partial<GatewayProviderConfig> = {}): GatewayProvider {
    return new GatewayProvider({
      gatewayUrl: 'https://gateway.example.com/v1',
      credentialStore,
      networkStack,
      ...overrides,
    });
  }

  function makeRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
    return createModelRequest(
      'req-001',
      'gpt-4',
      [{ role: 'user', content: 'Hello, world!' }],
      { maxTokens: 100, ...overrides },
    );
  }

  function mockSuccessResponse(body: object): void {
    networkStack.setHandler(async (): Promise<NetworkResponse> => ({
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ protocolVersion: '0.1.0', ...body }),
    }));
  }

  beforeEach(() => {
    credentialStore = new InMemoryCredentialStore();
    credentialStore.setApiKey('sk-test-key-1234567890abcdef');
    networkStack = new MockNetworkStack();
  });

  // ── Constructor / Setup ──────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create a provider with valid config', () => {
      const provider = makeProvider();
      expect(provider).toBeDefined();
      expect(provider.exitCode).toBe(ExitCode.COMPLETED);
    });

    it('should fail if TLS config is insecure', () => {
      expect(() => makeProvider({
        tlsConfig: {
          verifyCertificate: false,
          minTLSVersion: TLSVersion.TLS_1_2,
        },
      })).toThrow(GatewayError);
    });

    it('should use the provided credential store', () => {
      const provider = makeProvider();
      expect(provider.credentialStore).toBe(credentialStore);
      expect(provider.credentialStore.getApiKey()).toBe('sk-test-key-1234567890abcdef');
    });

    it('accepts an explicitly configured HTTP gateway URL', () => {
      expect(() => makeProvider({ gatewayUrl: 'http://gateway.example.com/v1' }))
        .not.toThrow();
    });

    it('refuses unsupported gateway URL schemes', () => {
      expect(() => makeProvider({ gatewayUrl: 'ftp://gateway.example.com/v1' }))
        .toThrow(GatewayError);
    });
  });

  // ── sendRequest ──────────────────────────────────────────────────────────

  describe('sendRequest', () => {
    it('should throw AUTH_REQUIRED when no API key is set', async () => {
      credentialStore.clear();
      const provider = makeProvider();
      await expect(provider.sendRequest(makeRequest())).rejects.toThrow(GatewayError);
      try {
        await provider.sendRequest(makeRequest());
      } catch (e) {
        expect((e as GatewayError).code).toBe(ErrorCode.AUTH_REQUIRED);
      }
      expect(provider.exitCode).toBe(ExitCode.SETUP_ERROR);
    });

    it('should send a request and return a ModelResponse', async () => {
      let requestOptions: NetworkRequestOptions | undefined;
      mockSuccessResponse({
        id: 'resp-001',
        result: {
          id: 'resp-001',
          content: 'Hello! How can I help you?',
          finish_reason: 'stop',
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18,
          },
        },
      });
      const originalHandler = networkStack.request.bind(networkStack);
      jest.spyOn(networkStack, 'request').mockImplementation(async (url, options) => {
        requestOptions = options;
        return originalHandler(url, options);
      });

      const provider = makeProvider();
      const response = await provider.sendRequest(makeRequest());

      expect(response.id).toBe('resp-001');
      expect(response.content).toBe('Hello! How can I help you?');
      expect(response.finishReason).toBe(FinishReason.STOP);
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
      });
      expect(requestOptions!.headers.authorization).toBe('Bearer sk-test-key-1234567890abcdef');
      expect(requestOptions!.body).not.toContain('sk-test-key-1234567890abcdef');
      expect(provider.exitCode).toBe(ExitCode.COMPLETED);
    });

    it('should handle error responses from gateway', async () => {
      mockSuccessResponse({
        id: 'resp-002',
        error: { code: ErrorCode.MODEL_NOT_FOUND, message: 'Model not found' },
      });

      const provider = makeProvider();
      await expect(provider.sendRequest(makeRequest())).rejects.toThrow(GatewayError);
      expect(provider.exitCode).toBe(ExitCode.FAILED);
    });

    it('should handle auth errors with SETUP_ERROR exit code', async () => {
      mockSuccessResponse({
        id: 'resp-003',
        error: { code: ErrorCode.AUTH_INVALID_CREDENTIALS, message: 'Invalid key' },
      });

      const provider = makeProvider();
      try {
        await provider.sendRequest(makeRequest());
      } catch {
        // expected
      }
      expect(provider.exitCode).toBe(ExitCode.SETUP_ERROR);
    });

    it('should fail when no response body is received', async () => {
      networkStack.setHandler(async (): Promise<NetworkResponse> => ({
        statusCode: 200,
        headers: {},
        body: '',
      }));

      const provider = makeProvider();
      await expect(provider.sendRequest(makeRequest())).rejects.toThrow();
      expect(provider.exitCode).toBe(ExitCode.FAILED);
    });

    it('should handle tool calls in response', async () => {
      mockSuccessResponse({
        id: 'resp-004',
        result: {
          id: 'resp-004',
          content: '',
          finish_reason: 'tool_calls',
          tool_calls: [
            { id: 'tc-1', name: 'read_file', arguments: '{"path":"test.ts"}' },
          ],
        },
      });

      const provider = makeProvider();
      const response = await provider.sendRequest(makeRequest());
      expect(response.finishReason).toBe(FinishReason.TOOL_CALLS);
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].name).toBe('read_file');
    });
  });

  // ── sendStreamRequest ─────────────────────────────────────────────────────

  describe('sendStreamRequest', () => {
    it('should throw AUTH_REQUIRED when no API key is set', async () => {
      credentialStore.clear();
      const provider = makeProvider();
      const chunks: StreamChunk[] = [];
      await expect(
        provider.sendStreamRequest(makeRequest(), () => {}),
      ).rejects.toThrow(GatewayError);
      expect(provider.exitCode).toBe(ExitCode.SETUP_ERROR);
    });

    it('should collect chunks from SSE stream', async () => {
      const sseBody = [
        'event: chunk\ndata: Hello\n\n',
        'event: chunk\ndata:  World\n\n',
        'event: done\ndata: {"protocolVersion":"0.1.0","id":"resp-s1","result":{"id":"resp-s1","content":"Hello World","finish_reason":"stop"}}\n\n',
      ].join('');

      networkStack.setHandler(async (): Promise<NetworkResponse> => ({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody,
      }));

      const provider = makeProvider();
      const chunks: StreamChunk[] = [];

      const response = await provider.sendStreamRequest(
        makeRequest(),
        (chunk) => chunks.push(chunk),
      );

      expect(chunks.length).toBe(2);
      expect(chunks[0].content).toBe('Hello');
      expect(chunks[0].index).toBe(0);
      expect(chunks[1].content).toBe(' World');
      expect(chunks[1].index).toBe(1);
      expect(response.content).toBe('Hello World');
      expect(provider.exitCode).toBe(ExitCode.COMPLETED);
    });

    it('should handle non-SSE JSON response in stream mode', async () => {
      mockSuccessResponse({
        id: 'resp-s2',
        result: {
          id: 'resp-s2',
          content: 'Direct response',
          finish_reason: 'stop',
        },
      });

      const provider = makeProvider();
      const chunks: StreamChunk[] = [];

      const response = await provider.sendStreamRequest(
        makeRequest(),
        (chunk) => chunks.push(chunk),
      );

      expect(response.content).toBe('Direct response');
      expect(provider.exitCode).toBe(ExitCode.COMPLETED);
    });

    it('rejects a stream that ends without a completion event', async () => {
      networkStack.setHandler(async (): Promise<NetworkResponse> => ({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: 'event: chunk\ndata: partial\n\n',
      }));

      const provider = makeProvider();
      await expect(
        provider.sendStreamRequest(makeRequest(), () => {}),
      ).rejects.toMatchObject({ code: ErrorCode.STREAM_INTERRUPTED });
    });

    it('rejects an incompatible protocol version', async () => {
      networkStack.setHandler(async (): Promise<NetworkResponse> => ({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: '99.0.0',
          id: 'req-001',
          result: { id: 'resp-bad-version', content: 'unsafe', finish_reason: 'stop' },
        }),
      }));

      const provider = makeProvider();
      await expect(provider.sendRequest(makeRequest())).rejects.toMatchObject({
        code: ErrorCode.PROTOCOL_VERSION_MISMATCH,
      });
    });

    it('rejects a stream with a completion marker followed by a truncated event', async () => {
      networkStack.setHandler(async (): Promise<NetworkResponse> => ({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: [
          'event: chunk\ndata: first\n\n',
          'event: done\ndata: {"protocolVersion":"0.1.0","id":"resp-truncated","result":{"id":"resp-truncated","content":"first","finish_reason":"stop"}}\n\n',
          'event: chunk\ndata: late',
        ].join(''),
      }));

      const provider = makeProvider();
      await expect(provider.sendStreamRequest(makeRequest(), () => {})).rejects.toMatchObject({
        code: ErrorCode.STREAM_INTERRUPTED,
      });
    });

    it('cancels an in-flight stream without delivering a late completion', async () => {
      let resolveNetwork: (() => void) | undefined;
      networkStack.setHandler(async (_url, options): Promise<NetworkResponse> => {
        options.onData?.('event: chunk\ndata: first\n\n');
        await new Promise<void>((resolve) => {
          resolveNetwork = resolve;
          if (options.signal?.aborted) resolve();
          else options.signal?.addEventListener('abort', resolve, { once: true });
        });
        return {
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream' },
          body: 'event: done\ndata: [DONE]\n\n',
        };
      });

      const provider = makeProvider();
      const controller = new AbortController();
      const chunks: StreamChunk[] = [];
      const pending = provider.sendStreamRequest(makeRequest(), (chunk) => chunks.push(chunk), { signal: controller.signal });
      await new Promise(resolve => setTimeout(resolve, 5));
      controller.abort();
      resolveNetwork?.();

      await expect(pending).rejects.toMatchObject({ code: ErrorCode.REQUEST_CANCELLED });
      expect(chunks.map(chunk => chunk.content)).toEqual(['first']);
    });
  });

  // ── disconnect ─────────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('should disconnect cleanly', async () => {
      mockSuccessResponse({
        id: 'resp-d1',
        result: { id: 'resp-d1', content: 'ok', finish_reason: 'stop' },
      });

      const provider = makeProvider();
      await provider.sendRequest(makeRequest());
      expect(() => provider.disconnect()).not.toThrow();
    });

    it('should be safe to call disconnect without connection', () => {
      const provider = makeProvider();
      expect(() => provider.disconnect()).not.toThrow();
    });
  });
});
