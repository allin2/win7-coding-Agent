import {
  DEEPSEEK_BASE_URL,
  DeepSeekOpenAIProvider,
  DeepSeekProviderConfig,
  validateDeepSeekBaseUrl,
  validateOpenAIFunctionToolName,
} from '../../../src/provider/deepseek-openai';
import { ErrorCode, FinishReason, GatewayError } from '../../../src/types';
import { InMemoryCredentialStore } from '../../../src/security';
import { MockNetworkStack, NetworkRequestOptions, NetworkResponse } from '../../../src/transport';

describe('DeepSeekOpenAIProvider', () => {
  let store: InMemoryCredentialStore;
  let network: MockNetworkStack;

  beforeEach(() => {
    store = new InMemoryCredentialStore();
    store.setApiKey('unit-test-secret-never-persist');
    network = new MockNetworkStack();
  });

  function provider(overrides: Partial<DeepSeekProviderConfig> = {}): DeepSeekOpenAIProvider {
    return new DeepSeekOpenAIProvider({
      baseUrl: DEEPSEEK_BASE_URL,
      model: 'deepseek-v4-flash',
      credentialStore: store,
      networkStack: network,
      retryConfig: { initialDelayMs: 1, maxDelayMs: 2, maxRetries: 0, backoffMultiplier: 2 },
      ...overrides,
    });
  }

  function request() {
    return {
      id: 'deepseek-test-1',
      model: 'deepseek-v4-flash' as const,
      messages: [{ role: 'user' as const, content: 'Inspect the workspace.' }],
      tools: [{
        name: 'workspace_read_text',
        description: 'Read one file.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
          additionalProperties: false,
        },
      }],
      toolChoice: 'auto' as const,
    };
  }

  it('pins the public endpoint to the reviewed DeepSeek HTTPS host', () => {
    expect(() => validateDeepSeekBaseUrl('https://api.deepseek.com')).not.toThrow();
    expect(() => validateDeepSeekBaseUrl('https://api.deepseek.com:443/')).not.toThrow();
    for (const rejected of [
      'http://api.deepseek.com',
      'https://api.deepseek.com.evil.test',
      'https://api.deepseek.com/beta',
      'https://user:pass@api.deepseek.com',
    ]) {
      expect(() => validateDeepSeekBaseUrl(rejected)).toThrow(GatewayError);
    }
  });

  it('rejects unreviewed model identifiers before a request', () => {
    expect(() => provider({ model: 'deepseek-unknown' as never })).toThrow(GatewayError);
  });

  it('rejects dotted Core tool names before they can cause a DeepSeek HTTP 400', () => {
    expect(() => validateOpenAIFunctionToolName('workspace_read_text')).not.toThrow();
    expect(() => validateOpenAIFunctionToolName('workspace.read_text')).toThrow(GatewayError);
  });

  it('maps messages and function tools to OpenAI Chat Completions without putting the key in the body', async () => {
    let target = '';
    let options: NetworkRequestOptions | undefined;
    network.setHandler(async (url, input): Promise<NetworkResponse> => {
      target = url;
      options = input;
      return {
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: [
          'data: {"id":"chat-1","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
          'data: {"id":"chat-1","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n',
          'data: [DONE]\n\n',
        ].join(''),
      };
    });
    const chunks: string[] = [];
    const result = await provider().sendStreamRequest(request(), (chunk) => chunks.push(chunk.content));
    const body = JSON.parse(options!.body!);

    expect(target).toBe('https://api.deepseek.com/chat/completions');
    expect(options!.headers.authorization).toBe('Bearer unit-test-secret-never-persist');
    expect(options!.body).not.toContain('unit-test-secret-never-persist');
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.stream).toBe(true);
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.tools[0].function.name).toBe('workspace_read_text');
    expect(chunks).toEqual(['Hello', ' world']);
    expect(result.content).toBe('Hello world');
    expect(result.finishReason).toBe(FinishReason.STOP);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2, totalTokens: 12 });
  });

  it('assembles incremental tool call names and arguments', async () => {
    network.setHandler(async (): Promise<NetworkResponse> => ({
      statusCode: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: [
        'data: {"id":"chat-tool","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"workspace_read_","arguments":"{\\"path\\":"}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"chat-tool","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"name":"text","arguments":"\\"sample.ts\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ].join(''),
    }));

    const result = await provider().sendStreamRequest(request(), () => undefined);
    expect(result.finishReason).toBe(FinishReason.TOOL_CALLS);
    expect(result.toolCalls).toEqual([{
      id: 'call-1',
      name: 'workspace_read_text',
      arguments: '{"path":"sample.ts"}',
    }]);
  });

  it('fails closed for truncated streams and missing completion markers', async () => {
    network.setHandler(async (): Promise<NetworkResponse> => ({
      statusCode: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: 'data: {"id":"chat-truncated","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":"stop"}]}\n\n',
    }));
    await expect(provider().sendStreamRequest(request(), () => undefined))
      .rejects.toMatchObject({ code: ErrorCode.STREAM_INTERRUPTED });
  });

  it('maps HTTP authentication failures without exposing credentials', async () => {
    network.setHandler(async (): Promise<NetworkResponse> => ({
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: '{"error":{"message":"invalid"}}',
    }));
    await expect(provider().sendStreamRequest(request(), () => undefined))
      .rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_CREDENTIALS });
  });

  it('cancels an in-flight request and does not deliver chunks', async () => {
    network.setHandler(async (_url, options): Promise<NetworkResponse> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (options.signal?.aborted) throw new GatewayError(ErrorCode.REQUEST_CANCELLED, 'cancelled');
      return { statusCode: 200, headers: {}, body: '' };
    });
    const controller = new AbortController();
    const chunks: string[] = [];
    const pending = provider().sendStreamRequest(request(), (chunk) => chunks.push(chunk.content), { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: ErrorCode.REQUEST_CANCELLED });
    expect(chunks).toEqual([]);
  });

  it('requires a process-memory API key', async () => {
    store.clear();
    await expect(provider().sendStreamRequest(request(), () => undefined))
      .rejects.toMatchObject({ code: ErrorCode.AUTH_REQUIRED });
  });
});
