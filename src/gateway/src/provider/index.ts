// Gateway provider — vendor-neutral model interface adapter

import {
  ErrorCode,
  GatewayError,
  ModelRequest,
  ModelResponse,
  FinishReason,
  StreamEvent,
  encode,
  decode,
} from '../types';
import { negotiateVersion, parseSSE } from '../protocol';
import {
  IConnection,
  MockConnection,
  ConnectionState,
  ConnectionConfig,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  ProxyConfig,
  INetworkStack,
  NodeNetworkStack,
} from '../transport';
import {
  TLSConfig,
  validateTLSConfig,
  defaultTLSConfig,
  CredentialStore,
  InMemoryCredentialStore,
  sanitizeForLog,
  sanitizeForAudit,
  redactApiKey,
} from '../security';

// ── Exit Codes (Phase 1/2 compatible) ────────────────────────────────────────

export enum ExitCode {
  COMPLETED = 0,
  FAILED = 1,
  CANCELLED = 2,
  SETUP_ERROR = 3,
}

// ── Provider Configuration ───────────────────────────────────────────────────

export interface GatewayProviderConfig {
  /** Gateway URL to connect to. */
  gatewayUrl: string;
  /** TLS configuration (default: secure). */
  tlsConfig?: TLSConfig;
  /** Retry configuration. */
  retryConfig?: RetryConfig;
  /** Optional proxy configuration. */
  proxyConfig?: ProxyConfig;
  /** Credential store (default: InMemoryCredentialStore). */
  credentialStore?: CredentialStore;
  /** Network stack abstraction (default: MockNetworkStack for prototype). */
  networkStack?: INetworkStack;
  /** Connection timeout in ms (default: 30000). */
  timeoutMs?: number;
  /** Hard deadline across attempts and backoff (default: 90000). */
  totalTimeoutMs?: number;
}

// ── Chunk Callback ───────────────────────────────────────────────────────────

export type StreamChunkCallback = (chunk: StreamChunk) => void;

export interface GatewayRequestOptions {
  /** Cancels the request and suppresses all subsequent stream callbacks. */
  signal?: AbortSignal;
}

export interface StreamChunk {
  /** The incremental text content in this chunk. */
  content: string;
  /** Index of this chunk in the stream (0-based). */
  index: number;
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Build a wire-level request payload from a ModelRequest + API key.
 */
function buildWirePayload(request: ModelRequest): string {
  return encode({
    jsonrpc: '2.0',
    id: request.id,
    method: 'model/completion',
    params: {
      model: request.model,
      messages: request.messages,
      tools: request.tools,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: request.stream ?? false,
    },
    _meta: {
      protocolVersion: '0.1.0',
      encoding: 'utf-8',
    },
  });
}

/**
 * Parse a wire-level response into a ModelResponse.
 */
const CLIENT_PROTOCOL_VERSION = '0.1.0';

function parseWireResponse(rawBody: string): ModelResponse {
  const parsed = decode<{
    id?: string;
    protocolVersion?: string;
    _meta?: { protocolVersion?: string };
    result?: {
      id?: string;
      content?: string;
      finish_reason?: string;
      tool_calls?: Array<{ id: string; name: string; arguments: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    error?: { code: number; message: string };
  }>(rawBody);

  const serverProtocolVersion = parsed.protocolVersion ?? parsed._meta?.protocolVersion;
  if (!serverProtocolVersion) {
    throw new GatewayError(
      ErrorCode.PROTOCOL_VERSION_MISMATCH,
      'Gateway response is missing the required protocolVersion field',
    );
  }
  negotiateVersion(CLIENT_PROTOCOL_VERSION, serverProtocolVersion);

  if (parsed.error) {
    throw new GatewayError(
      parsed.error.code as ErrorCode,
      parsed.error.message,
    );
  }

  if (!parsed.result) {
    throw new GatewayError(ErrorCode.DECODE_ERROR, 'Response missing result');
  }

  const r = parsed.result;
  if (!parsed.id || !r.id) {
    throw new GatewayError(ErrorCode.DECODE_ERROR, 'Response is missing request or response id');
  }
  if (typeof r.content !== 'string') {
    throw new GatewayError(ErrorCode.DECODE_ERROR, 'Response result is missing string content');
  }
  return {
    id: r.id,
    requestId: parsed.id,
    content: r.content,
    finishReason: mapFinishReason(r.finish_reason),
    toolCalls: r.tool_calls,
    usage: r.usage ? {
      promptTokens: r.usage.prompt_tokens,
      completionTokens: r.usage.completion_tokens,
      totalTokens: r.usage.total_tokens,
    } : undefined,
  };
}

function mapFinishReason(raw?: string): FinishReason {
  switch (raw) {
    case 'stop': return FinishReason.STOP;
    case 'length': return FinishReason.LENGTH;
    case 'tool_calls': return FinishReason.TOOL_CALLS;
    case 'content_filter': return FinishReason.CONTENT_FILTER;
    default:
      throw new GatewayError(
        ErrorCode.DECODE_ERROR,
        `Unknown or missing finish_reason: ${String(raw)}`,
      );
  }
}

// ── GatewayProvider ──────────────────────────────────────────────────────────

export class GatewayProvider {
  private readonly _config: GatewayProviderConfig;
  private readonly _tlsConfig: TLSConfig;
  private readonly _credentialStore: CredentialStore;
  private _connection: IConnection | null = null;
  private _exitCode: ExitCode = ExitCode.COMPLETED;

  constructor(config: GatewayProviderConfig) {
    this._config = { ...config };

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(config.gatewayUrl);
    } catch {
      throw new GatewayError(ErrorCode.GATEWAY_UNREACHABLE, 'Gateway URL is invalid');
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new GatewayError(
        ErrorCode.TLS_VERIFY_FAILED,
        'Gateway URL must use HTTP or HTTPS',
      );
    }

    // Validate TLS config (fail-closed)
    this._tlsConfig = validateTLSConfig(config.tlsConfig ?? defaultTLSConfig());

    // Set up credential store
    this._credentialStore = config.credentialStore ?? new InMemoryCredentialStore();
  }

  /** Current exit code reflecting the last operation result. */
  get exitCode(): ExitCode {
    return this._exitCode;
  }

  /** The credential store used by this provider. */
  get credentialStore(): CredentialStore {
    return this._credentialStore;
  }

  /** The TLS config in use. */
  get tlsConfig(): TLSConfig {
    return this._tlsConfig;
  }

  /**
   * Ensure a connection is established to the gateway.
   * Returns the exit code for setup errors.
   */
  private async ensureConnection(): Promise<IConnection> {
    if (this._connection && this._connection.state === ConnectionState.CONNECTED) {
      return this._connection;
    }

    const connConfig: ConnectionConfig = {
      url: this._config.gatewayUrl,
      timeoutMs: this._config.timeoutMs ?? 30000,
      totalTimeoutMs: this._config.totalTimeoutMs ?? 90000,
      maxResponseSizeBytes: 10 * 1024 * 1024,
      retry: this._config.retryConfig ?? DEFAULT_RETRY_CONFIG,
      proxy: this._config.proxyConfig,
      encoding: 'utf-8',
    };

    const network = this._config.networkStack ?? new NodeNetworkStack({
      caBundlePath: this._tlsConfig.caBundle,
      rejectUnauthorized: this._tlsConfig.verifyCertificate,
      minTLSVersion: this._tlsConfig.minTLSVersion,
      timeout: connConfig.timeoutMs,
      maxResponseSize: connConfig.maxResponseSizeBytes,
      proxy: connConfig.proxy,
    });
    const conn = new MockConnection(connConfig, network);

    try {
      await conn.connect();
    } catch (e) {
      this._exitCode = ExitCode.SETUP_ERROR;
      throw new GatewayError(
        ErrorCode.GATEWAY_UNREACHABLE,
        `Failed to connect to gateway: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    this._connection = conn;
    return conn;
  }

  /**
   * Send a non-streaming request to the model gateway.
   */
  async sendRequest(request: ModelRequest, options: GatewayRequestOptions = {}): Promise<ModelResponse> {
    // 1. Get API key from credential store
    const apiKey = this._credentialStore.getApiKey();
    if (!apiKey) {
      this._exitCode = ExitCode.SETUP_ERROR;
      throw new GatewayError(
        ErrorCode.AUTH_REQUIRED,
        'No API key configured — call credentialStore.setApiKey() first',
      );
    }

    // Log sanitized request info
    const sanitizedReq = sanitizeForLog({ model: request.model, id: request.id, messageCount: request.messages.length });
    // (In production, this would go to a logger; here we just ensure it doesn't throw)
    void sanitizedReq;

    // 2. Build wire payload using protocol encoding
    const payload = buildWirePayload(request);

    // 3. Ensure connection via transport layer
    const conn = await this.ensureConnection();

    // 4. Send and collect response
    try {
      let responseBody: string | null = null;

      const offData = conn.onData((responseRequestId: string, data: string) => {
        if (responseRequestId === request.id) {
          responseBody = (responseBody ?? '') + data;
        }
      });

      let sendError: Error | null = null;
      const offError = conn.onError((responseRequestId: string, err: GatewayError) => {
        if (responseRequestId === request.id) {
          sendError = err;
        }
      });

      try {
        const removeAbort = attachRequestAbort(options.signal, conn, request.id);
        try {
          await conn.send(request.id, payload, {
          authorization: `Bearer ${apiKey}`,
          });
        } finally {
          removeAbort();
        }
      } finally {
        offData();
        offError();
      }

      if (sendError) {
        this._exitCode = ExitCode.FAILED;
        throw sendError;
      }

      if (!responseBody) {
        this._exitCode = ExitCode.FAILED;
        throw new GatewayError(ErrorCode.DECODE_ERROR, 'No response received from gateway');
      }

      // 5. Decode response using protocol layer
      const response = parseWireResponse(responseBody);

      // 6. Audit log (sanitized)
      const auditEntry = sanitizeForAudit({
        requestId: request.id,
        model: request.model,
        responseId: response.id,
        finishReason: response.finishReason,
        usage: response.usage,
      });
      void auditEntry;

      this._exitCode = ExitCode.COMPLETED;
      conn.tracker.remove(request.id);
      return response;
    } catch (e) {
      if (e instanceof GatewayError) {
        if (e.code >= 300 && e.code < 400) {
          this._exitCode = ExitCode.SETUP_ERROR;
        } else {
          this._exitCode = ExitCode.FAILED;
        }
      } else {
        this._exitCode = ExitCode.FAILED;
      }
      conn.tracker.remove(request.id);
      throw e;
    }
  }

  /**
   * Send a streaming request to the model gateway.
   * Chunks are delivered via the onChunk callback.
   */
  async sendStreamRequest(
    request: ModelRequest,
    onChunk: StreamChunkCallback,
    options: GatewayRequestOptions = {},
  ): Promise<ModelResponse> {
    // 1. Get API key
    const apiKey = this._credentialStore.getApiKey();
    if (!apiKey) {
      this._exitCode = ExitCode.SETUP_ERROR;
      throw new GatewayError(
        ErrorCode.AUTH_REQUIRED,
        'No API key configured — call credentialStore.setApiKey() first',
      );
    }

    // Force stream mode
    const streamRequest: ModelRequest = { ...request, stream: true };

    // Log sanitized info
    void sanitizeForLog({ model: streamRequest.model, id: streamRequest.id, streaming: true });

    // 2. Build wire payload
    const payload = buildWirePayload(streamRequest);

    // 3. Ensure connection
    const conn = await this.ensureConnection();

    // 4. Send and collect streaming response
    try {
      const chunks: string[] = [];
      let chunkIndex = 0;
      let finalResponse: ModelResponse | null = null;
      let streamBuffer = '';
      let sawSSEEvent = false;
      let sawDone = false;
      let streamParseError: GatewayError | null = null;
      let cancelled = Boolean(options.signal?.aborted);

      const consumeSSEEvent = (rawEvent: string): void => {
        const events = parseSSE(`${rawEvent}\n\n`);
        for (const event of events) {
          sawSSEEvent = true;
          if (event.event === 'chunk' || event.event === 'message') {
            if (cancelled) return;
            if (sawDone) {
              throw new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'Gateway stream emitted data after completion');
            }
            chunks.push(event.data);
            onChunk({ content: event.data, index: chunkIndex++ });
          } else if (event.event === 'error') {
            try {
              const wireError = decode<{ code?: number; message?: string }>(event.data);
              throw new GatewayError(
                (wireError.code ?? ErrorCode.STREAM_INTERRUPTED) as ErrorCode,
                wireError.message ?? 'Gateway stream reported an error',
              );
            } catch (error) {
              if (error instanceof GatewayError) throw error;
              throw new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'Gateway stream reported malformed error data');
            }
          } else if (event.event === 'done' || event.event === 'complete') {
            if (sawDone) {
              throw new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'Gateway stream emitted data after completion');
            }
            sawDone = true;
            if (event.data && event.data !== '[DONE]') {
              finalResponse = parseWireResponse(event.data);
            }
          }
        }
      };

      const offData = conn.onData((responseRequestId: string, data: string) => {
        if (responseRequestId !== request.id) return;
        streamBuffer += data;
        while (true) {
          const boundary = streamBuffer.search(/\r?\n\r?\n/);
          if (boundary < 0) break;
          const rawEvent = streamBuffer.slice(0, boundary);
          const separator = streamBuffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n';
          streamBuffer = streamBuffer.slice(boundary + separator.length);
          if (rawEvent.length > 0) {
            try {
              consumeSSEEvent(rawEvent);
            } catch (error) {
              streamParseError = error instanceof GatewayError
                ? error
                : new GatewayError(ErrorCode.STREAM_INTERRUPTED, String(error));
            }
          }
        }
      });

      let sendError: Error | null = null;
      const offError = conn.onError((responseRequestId: string, err: GatewayError) => {
        if (responseRequestId === request.id) {
          sendError = err;
        }
      });

      const removeAbort = options.signal
        ? attachRequestAbort(options.signal, conn, request.id, () => { cancelled = true; })
        : () => undefined;
      try {
        await conn.send(request.id, payload, {
          authorization: `Bearer ${apiKey}`,
        });
      } finally {
        removeAbort();
        offData();
        offError();
      }

      if (sendError) {
        this._exitCode = ExitCode.FAILED;
        throw sendError;
      }
      if (streamParseError) {
        throw streamParseError;
      }

      if (cancelled || options.signal?.aborted) {
        throw new GatewayError(ErrorCode.REQUEST_CANCELLED, 'Gateway stream was cancelled');
      }

      if (!sawSSEEvent && streamBuffer.length > 0) {
        finalResponse = parseWireResponse(streamBuffer);
        streamBuffer = '';
      }

      // A response that ends with an incomplete SSE event is not a successful
      // stream, even if a previous event carried a completion marker. The
      // non-SSE JSON path above is a complete response and is allowed.
      if (sawSSEEvent && streamBuffer.trim().length > 0) {
        throw new GatewayError(
          ErrorCode.STREAM_INTERRUPTED,
          'Gateway stream ended with a truncated SSE event',
        );
      }

      // If we got a final response from the stream, use it
      if (finalResponse) {
        this._exitCode = ExitCode.COMPLETED;
        conn.tracker.remove(request.id);
        return finalResponse;
      }

      if (!sawDone) {
        throw new GatewayError(
          ErrorCode.STREAM_INTERRUPTED,
          `Gateway stream ended without a completion event after ${chunkIndex} chunk(s)`,
        );
      }

      // A standard [DONE] marker completes a text-only stream.
      const synthesized: ModelResponse = {
        id: `stream-${request.id}`,
        requestId: request.id,
        content: chunks.join(''),
        finishReason: FinishReason.STOP,
      };

      // Audit log
      void sanitizeForAudit({
        requestId: request.id,
        model: request.model,
        streaming: true,
        chunkCount: chunkIndex,
      });

      this._exitCode = ExitCode.COMPLETED;
      conn.tracker.remove(request.id);
      return synthesized;
    } catch (e) {
      if (e instanceof GatewayError) {
        if (e.code >= 300 && e.code < 400) {
          this._exitCode = ExitCode.SETUP_ERROR;
        } else {
          this._exitCode = ExitCode.FAILED;
        }
      } else {
        this._exitCode = ExitCode.FAILED;
      }
      conn.tracker.remove(request.id);
      throw e;
    }
  }

  /**
   * Disconnect and clean up resources.
   */
  disconnect(): void {
    if (this._connection) {
      this._connection.disconnect('provider shutdown');
      this._connection = null;
    }
  }
}

function attachRequestAbort(
  signal: AbortSignal | undefined,
  connection: IConnection,
  requestId: string,
  onAbort?: () => void,
): () => void {
  if (!signal) return () => undefined;
  const abort = (): void => {
    onAbort?.();
    connection.cancel(requestId);
  };
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export { ErrorCode, GatewayError } from '../types';
export * from './deepseek-openai';
export * from './openai-compatible';
