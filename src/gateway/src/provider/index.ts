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
import { encodeFrame, parseFrame, splitFrames, parseSSE } from '../protocol';
import type { Frame } from '../protocol';
import {
  IConnection,
  MockConnection,
  ConnectionState,
  ConnectionConfig,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  ProxyConfig,
  INetworkStack,
  MockNetworkStack,
  NetworkResponse,
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
}

// ── Chunk Callback ───────────────────────────────────────────────────────────

export type StreamChunkCallback = (chunk: StreamChunk) => void;

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
function buildWirePayload(request: ModelRequest, apiKey: string): string {
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
      apiKey,
      protocolVersion: '0.1.0',
      encoding: 'utf-8',
    },
  });
}

/**
 * Parse a wire-level response into a ModelResponse.
 */
function parseWireResponse(rawBody: string): ModelResponse {
  const parsed = decode<{
    id?: string;
    result?: {
      id?: string;
      content?: string;
      finish_reason?: string;
      tool_calls?: Array<{ id: string; name: string; arguments: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    error?: { code: number; message: string };
  }>(rawBody);

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
  return {
    id: r.id ?? '',
    requestId: parsed.id ?? '',
    content: r.content ?? '',
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
    default: return FinishReason.STOP;
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
      maxResponseSizeBytes: 10 * 1024 * 1024,
      retry: this._config.retryConfig ?? DEFAULT_RETRY_CONFIG,
      proxy: this._config.proxyConfig,
      encoding: 'utf-8',
    };

    const network = this._config.networkStack ?? new MockNetworkStack();
    const conn = new MockConnection(connConfig, network);

    try {
      await conn.connect();
    } catch (e) {
      this._exitCode = ExitCode.SETUP_ERROR;
      throw new GatewayError(
        ErrorCode.CONNECTION_REFUSED,
        `Failed to connect to gateway: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    this._connection = conn;
    return conn;
  }

  /**
   * Send a non-streaming request to the model gateway.
   */
  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
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
    const payload = buildWirePayload(request, apiKey);

    // 3. Ensure connection via transport layer
    const conn = await this.ensureConnection();

    // 4. Send and collect response
    try {
      let responseBody: string | null = null;

      const offData = conn.onData((data: string) => {
        responseBody = data;
      });

      let sendError: Error | null = null;
      const offError = conn.onError((err: GatewayError) => {
        sendError = err;
      });

      try {
        await conn.send(request.id, payload);
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
    const payload = buildWirePayload(streamRequest, apiKey);

    // 3. Ensure connection
    const conn = await this.ensureConnection();

    // 4. Send and collect streaming response
    try {
      const chunks: string[] = [];
      let chunkIndex = 0;
      let finalResponse: ModelResponse | null = null;

      const offData = conn.onData((data: string) => {
        // Try parsing as SSE events
        try {
          const sseEvents = parseSSE(data);
          for (const event of sseEvents) {
            if (event.event === 'chunk' || event.event === 'message') {
              const content = event.data;
              chunks.push(content);
              onChunk({ content, index: chunkIndex++ });
            } else if (event.event === 'done' || event.event === 'complete') {
              // Parse final response from done event
              try {
                finalResponse = parseWireResponse(event.data);
              } catch {
                // If done event doesn't contain a full response, synthesize one
              }
            }
          }

          // If SSE parsing produced no events, try as plain JSON or text
          if (sseEvents.length === 0) {
            try {
              finalResponse = parseWireResponse(data);
            } catch {
              // Treat as a plain text chunk
              chunks.push(data);
              onChunk({ content: data, index: chunkIndex++ });
            }
          }
        } catch {
          // Not SSE — try as a single JSON response
          try {
            finalResponse = parseWireResponse(data);
          } catch {
            // Treat as a plain text chunk
            chunks.push(data);
            onChunk({ content: data, index: chunkIndex++ });
          }
        }
      });

      let sendError: Error | null = null;
      const offError = conn.onError((err: GatewayError) => {
        sendError = err;
      });

      try {
        await conn.send(request.id, payload);
      } finally {
        offData();
        offError();
      }

      if (sendError) {
        this._exitCode = ExitCode.FAILED;
        throw sendError;
      }

      // If we got a final response from the stream, use it
      if (finalResponse) {
        this._exitCode = ExitCode.COMPLETED;
        return finalResponse;
      }

      // Synthesize a response from collected chunks
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

// ── Re-exports ───────────────────────────────────────────────────────────────

export { ErrorCode, GatewayError } from '../types';
