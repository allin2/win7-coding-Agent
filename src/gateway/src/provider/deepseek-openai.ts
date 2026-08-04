import {
  ErrorCode,
  FinishReason,
  GatewayError,
  Message,
  ModelResponse,
  ToolCall,
} from '../types';
import {
  ConnectionConfig,
  ConnectionState,
  DEFAULT_RETRY_CONFIG,
  IConnection,
  INetworkStack,
  MockConnection,
  NodeNetworkStack,
  ProxyConfig,
  RetryConfig,
} from '../transport';
import {
  CredentialStore,
  defaultTLSConfig,
  InMemoryCredentialStore,
  TLSConfig,
  validateTLSConfig,
} from '../security';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_MODELS = Object.freeze(['deepseek-v4-flash', 'deepseek-v4-pro'] as const);
export type DeepSeekModel = typeof DEEPSEEK_MODELS[number];

export interface OpenAIFunctionTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface DeepSeekModelRequest {
  id: string;
  model: DeepSeekModel;
  messages: Message[];
  tools?: OpenAIFunctionTool[];
  toolChoice?: 'auto' | 'none';
  maxTokens?: number;
  temperature?: number;
}

export interface DeepSeekProviderConfig {
  baseUrl: string;
  model: DeepSeekModel;
  tlsConfig?: TLSConfig;
  retryConfig?: RetryConfig;
  proxyConfig?: ProxyConfig;
  credentialStore?: CredentialStore;
  networkStack?: INetworkStack;
  timeoutMs?: number;
  totalTimeoutMs?: number;
}

export interface DeepSeekRequestOptions {
  signal?: AbortSignal;
}

export interface DeepSeekStreamChunk {
  content: string;
  index: number;
}

interface OpenAIStreamDelta {
  id?: string;
  choices?: Array<{
    index?: number;
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

interface ToolAccumulator {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Strict DeepSeek OpenAI-ChatCompletions adapter for the A3.1 real-model slice.
 * The endpoint is intentionally fixed and credentials remain in the injected
 * in-memory store.
 */
export class DeepSeekOpenAIProvider {
  private readonly config: DeepSeekProviderConfig;
  private readonly tlsConfig: TLSConfig;
  private readonly store: CredentialStore;
  private connection: IConnection | null = null;

  constructor(config: DeepSeekProviderConfig) {
    validateDeepSeekBaseUrl(config.baseUrl);
    validateDeepSeekModel(config.model);
    this.config = { ...config, baseUrl: DEEPSEEK_BASE_URL };
    this.tlsConfig = validateTLSConfig(config.tlsConfig ?? defaultTLSConfig());
    this.store = config.credentialStore ?? new InMemoryCredentialStore();
  }

  get credentialStore(): CredentialStore {
    return this.store;
  }

  get model(): DeepSeekModel {
    return this.config.model;
  }

  async sendStreamRequest(
    request: DeepSeekModelRequest,
    onChunk: (chunk: DeepSeekStreamChunk) => void,
    options: DeepSeekRequestOptions = {},
  ): Promise<ModelResponse> {
    validateDeepSeekModel(request.model);
    if (request.model !== this.config.model) {
      throw new GatewayError(ErrorCode.MODEL_NOT_FOUND, 'DeepSeek request model differs from the explicitly configured model');
    }
    for (const tool of request.tools ?? []) validateOpenAIFunctionToolName(tool.name);
    for (const message of request.messages) {
      if (message.role === 'assistant') {
        for (const tool of message.toolCalls ?? []) validateOpenAIFunctionToolName(tool.name);
      }
    }
    const apiKey = this.store.getApiKey();
    if (!apiKey) {
      throw new GatewayError(ErrorCode.AUTH_REQUIRED, 'No DeepSeek API key is configured in process memory');
    }
    const connection = await this.ensureConnection();
    const payload = buildDeepSeekPayload(request);
    let streamBuffer = '';
    let responseId = '';
    let chunkIndex = 0;
    let finishReason: FinishReason | null = null;
    let sawDone = false;
    let parseError: GatewayError | null = null;
    let cancelled = Boolean(options.signal?.aborted);
    const content: string[] = [];
    const tools = new Map<number, ToolAccumulator>();
    let usage: ModelResponse['usage'];

    const consumeEvent = (rawEvent: string): void => {
      const data = extractSseData(rawEvent);
      if (data === null) return;
      if (data === '[DONE]') {
        sawDone = true;
        return;
      }
      let event: OpenAIStreamDelta;
      try {
        event = JSON.parse(data) as OpenAIStreamDelta;
      } catch {
        throw new GatewayError(ErrorCode.INVALID_FRAME, 'DeepSeek stream contained malformed JSON');
      }
      if (event.id) responseId = event.id;
      if (event.usage) {
        usage = {
          promptTokens: event.usage.prompt_tokens ?? 0,
          completionTokens: event.usage.completion_tokens ?? 0,
          totalTokens: event.usage.total_tokens ?? 0,
        };
      }
      const choice = event.choices?.find((item) => (item.index ?? 0) === 0);
      if (!choice) return;
      const deltaContent = choice.delta?.content;
      if (!cancelled && typeof deltaContent === 'string' && deltaContent.length > 0) {
        content.push(deltaContent);
        onChunk({ content: deltaContent, index: chunkIndex++ });
      }
      for (const delta of choice.delta?.tool_calls ?? []) {
        const index = delta.index ?? 0;
        const current = tools.get(index) ?? { id: '', name: '', arguments: '' };
        if (delta.id) current.id += delta.id;
        if (delta.function?.name) current.name += delta.function.name;
        if (delta.function?.arguments) current.arguments += delta.function.arguments;
        tools.set(index, current);
      }
      if (choice.finish_reason) finishReason = mapOpenAIFinishReason(choice.finish_reason);
    };

    const offData = connection.onData((responseRequestId, data) => {
      if (responseRequestId !== request.id || cancelled) return;
      streamBuffer += data;
      while (true) {
        const boundary = streamBuffer.search(/\r?\n\r?\n/);
        if (boundary < 0) break;
        const rawEvent = streamBuffer.slice(0, boundary);
        const separator = streamBuffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n';
        streamBuffer = streamBuffer.slice(boundary + separator.length);
        try {
          consumeEvent(rawEvent);
        } catch (error) {
          parseError = error instanceof GatewayError
            ? error
            : new GatewayError(ErrorCode.STREAM_INTERRUPTED, String(error));
        }
      }
    });
    let sendError: GatewayError | null = null;
    const offError = connection.onError((responseRequestId, error) => {
      if (responseRequestId === request.id) sendError = error;
    });
    const removeAbort = attachAbort(options.signal, connection, request.id, () => { cancelled = true; });

    try {
      await connection.send(request.id, payload, { authorization: `Bearer ${apiKey}` });
    } finally {
      removeAbort();
      offData();
      offError();
    }
    connection.tracker.remove(request.id);

    if (sendError) throw sendError;
    if (parseError) throw parseError;
    if (cancelled || options.signal?.aborted) {
      throw new GatewayError(ErrorCode.REQUEST_CANCELLED, 'DeepSeek stream was cancelled');
    }
    if (streamBuffer.trim().length > 0) {
      throw new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'DeepSeek stream ended with a truncated SSE event');
    }
    if (!sawDone) {
      throw new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'DeepSeek stream ended without data: [DONE]');
    }
    if (!finishReason) {
      throw new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'DeepSeek stream completed without finish_reason');
    }

    const toolCalls: ToolCall[] = Array.from(tools.entries())
      .sort(([left], [right]) => left - right)
      .map(([, tool], index) => {
        if (!tool.id || !tool.name) {
          throw new GatewayError(ErrorCode.DECODE_ERROR, `DeepSeek tool call ${index} is incomplete`);
        }
        try {
          JSON.parse(tool.arguments || '{}');
        } catch {
          throw new GatewayError(ErrorCode.DECODE_ERROR, `DeepSeek tool call ${index} arguments are invalid JSON`);
        }
        return { id: tool.id, name: tool.name, arguments: tool.arguments || '{}' };
      });
    if (finishReason === FinishReason.TOOL_CALLS && toolCalls.length === 0) {
      throw new GatewayError(ErrorCode.DECODE_ERROR, 'DeepSeek returned tool_calls finish reason without a tool call');
    }
    return {
      id: responseId || `deepseek-${request.id}`,
      requestId: request.id,
      content: content.join(''),
      finishReason,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(usage ? { usage } : {}),
    };
  }

  disconnect(): void {
    if (this.connection) this.connection.disconnect('DeepSeek provider shutdown');
    this.connection = null;
  }

  private async ensureConnection(): Promise<IConnection> {
    if (this.connection?.state === ConnectionState.CONNECTED) return this.connection;
    const connectionConfig: ConnectionConfig = {
      url: `${DEEPSEEK_BASE_URL}/chat/completions`,
      timeoutMs: this.config.timeoutMs ?? 30_000,
      totalTimeoutMs: this.config.totalTimeoutMs ?? 90_000,
      maxResponseSizeBytes: 10 * 1024 * 1024,
      retry: this.config.retryConfig ?? DEFAULT_RETRY_CONFIG,
      proxy: this.config.proxyConfig,
      encoding: 'utf-8',
    };
    const network = this.config.networkStack ?? new NodeNetworkStack({
      caBundlePath: this.tlsConfig.caBundle,
      rejectUnauthorized: this.tlsConfig.verifyCertificate,
      minTLSVersion: this.tlsConfig.minTLSVersion,
      timeout: connectionConfig.timeoutMs,
      maxResponseSize: connectionConfig.maxResponseSizeBytes,
      proxy: connectionConfig.proxy,
    });
    const connection = new MockConnection(connectionConfig, network);
    await connection.connect();
    this.connection = connection;
    return connection;
  }
}

export function validateDeepSeekBaseUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new GatewayError(ErrorCode.GATEWAY_UNREACHABLE, 'DeepSeek base URL is invalid');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'api.deepseek.com' ||
    (parsed.port !== '' && parsed.port !== '443') ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    parsed.username || parsed.password || parsed.search || parsed.hash
  ) {
    throw new GatewayError(ErrorCode.GATEWAY_UNREACHABLE, 'DeepSeek mode only allows https://api.deepseek.com:443');
  }
}

export function validateDeepSeekModel(value: string): asserts value is DeepSeekModel {
  if (!(DEEPSEEK_MODELS as readonly string[]).includes(value)) {
    throw new GatewayError(ErrorCode.MODEL_NOT_FOUND, `Unsupported DeepSeek model: ${value}`);
  }
}

export function validateOpenAIFunctionToolName(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new GatewayError(
      ErrorCode.ENCODE_ERROR,
      'DeepSeek function tool names must contain only letters, digits, underscores, or hyphens and be at most 64 characters',
    );
  }
}

function buildDeepSeekPayload(request: DeepSeekModelRequest): string {
  return JSON.stringify({
    model: request.model,
    messages: request.messages.map((message) => {
      if (message.role === 'tool') {
        return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
      }
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: message.content,
          ...(message.toolCalls?.length ? {
            tool_calls: message.toolCalls.map((tool) => ({
              id: tool.id,
              type: 'function',
              function: { name: tool.name, arguments: tool.arguments },
            })),
          } : {}),
        };
      }
      return { role: message.role, content: message.content };
    }),
    ...(request.tools?.length ? {
      tools: request.tools.map((tool) => ({ type: 'function', function: tool })),
      tool_choice: request.toolChoice ?? 'auto',
    } : {}),
    stream: true,
    stream_options: { include_usage: true },
    thinking: { type: 'disabled' },
    ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
  });
}

function extractSseData(rawEvent: string): string | null {
  const dataLines = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  return dataLines.length > 0 ? dataLines.join('\n') : null;
}

function mapOpenAIFinishReason(value: string): FinishReason {
  switch (value) {
    case 'stop': return FinishReason.STOP;
    case 'length': return FinishReason.LENGTH;
    case 'tool_calls': return FinishReason.TOOL_CALLS;
    case 'content_filter': return FinishReason.CONTENT_FILTER;
    default:
      throw new GatewayError(ErrorCode.DECODE_ERROR, `Unsupported DeepSeek finish_reason: ${value}`);
  }
}

function attachAbort(
  signal: AbortSignal | undefined,
  connection: IConnection,
  requestId: string,
  onAbort: () => void,
): () => void {
  if (!signal) return () => undefined;
  const abort = (): void => {
    onAbort();
    connection.cancel(requestId);
  };
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}
