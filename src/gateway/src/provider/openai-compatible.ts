/**
 * @module openai-compatible
 * @description 供应商中立的 OpenAI-compatible Chat Completions Provider (PRD §7 A9-GW01 / ADR-0089)
 */

import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as fs from 'fs';
import {
  ErrorCode,
  FinishReason,
  GatewayError,
  Message,
  ModelResponse,
  ToolCall,
} from '../types';
import {
  DEFAULT_RETRY_CONFIG,
  ProxyConfig,
  RetryConfig,
} from '../transport';
import {
  CredentialStore,
  InMemoryCredentialStore,
  TLSConfig,
} from '../security';

export interface OpenAICompatibleFunctionTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenAIModelRequest {
  id: string;
  model: string;
  messages: Message[];
  tools?: OpenAICompatibleFunctionTool[];
  toolChoice?: 'auto' | 'none' | Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface OpenAIProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
  tlsConfig?: TLSConfig;
  allowInsecureTLS?: boolean;
  retryConfig?: RetryConfig;
  proxyConfig?: ProxyConfig;
  credentialStore?: CredentialStore;
  timeoutMs?: number;
  totalTimeoutMs?: number;
}

export interface OpenAIRequestOptions {
  signal?: AbortSignal;
}

export interface OpenAIStreamChunk {
  content: string;
  index: number;
}

export interface ProviderCapabilityProbeResult {
  ok: boolean;
  hasToolCalling: boolean;
  hasStreaming: boolean;
  latencyMs: number;
  model: string;
  notes?: string;
  error?: string;
}

interface OpenAIDeltaToolCall {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ToolAccumulator {
  id: string;
  name: string;
  arguments: string;
}

export class OpenAICompatibleProvider {
  private readonly config: OpenAIProviderConfig;
  private readonly store: CredentialStore;

  constructor(config: OpenAIProviderConfig) {
    if (!config || !config.baseUrl || config.baseUrl.trim().length === 0) {
      throw new GatewayError(
        ErrorCode.INVALID_FRAME,
        'Base URL must be provided for OpenAICompatibleProvider',
      );
    }
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
      retryConfig: config.retryConfig || DEFAULT_RETRY_CONFIG,
    };
    this.store = config.credentialStore || new InMemoryCredentialStore();
    if (config.apiKey) {
      this.store.setApiKey(config.apiKey);
    }
  }

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  getModel(): string {
    return this.config.model;
  }

  /**
   * 发送 SSE 流式 Chat Completions 请求
   */
  async sendStreamRequest(
    request: OpenAIModelRequest,
    onChunk: (chunk: OpenAIStreamChunk) => void,
    options: OpenAIRequestOptions = {},
  ): Promise<ModelResponse> {
    const maxRetries = this.config.retryConfig?.maxRetries ?? 3;
    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= maxRetries) {
      if (options.signal?.aborted) {
        throw new GatewayError(ErrorCode.REQUEST_CANCELLED, 'Request cancelled by user');
      }

      try {
        return await this.executeSingleStreamRequest(request, onChunk, options);
      } catch (err: any) {
        lastError = err;
        const statusCode = err?.statusCode;
        const isRetryable =
          statusCode === 429 ||
          (statusCode >= 500 && statusCode <= 599) ||
          err?.code === 'ECONNRESET' ||
          err?.code === 'ETIMEDOUT' ||
          err?.code === 'NETWORK_ERROR';

        if (!isRetryable || attempt >= maxRetries || options.signal?.aborted) {
          throw err;
        }

        attempt++;
        const backoffMs = Math.min(200 * Math.pow(2, attempt), 2000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError || new GatewayError(ErrorCode.CONNECTION_TIMEOUT, 'Max retries reached');
  }

  private async executeSingleStreamRequest(
    request: OpenAIModelRequest,
    onChunk: (chunk: OpenAIStreamChunk) => void,
    options: OpenAIRequestOptions,
  ): Promise<ModelResponse> {
    const endpoint = this.normalizeChatEndpoint(this.config.baseUrl);
    const parsedUrl = new url.URL(endpoint);

    const apiKey = this.store.getApiKey();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...(this.config.customHeaders || {}),
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const payload = JSON.stringify({
      model: request.model || this.config.model,
      messages: request.messages.map((m) => {
        if (m.role === 'tool') {
          return { role: m.role, content: m.content, tool_call_id: m.toolCallId };
        }
        return { role: m.role, content: m.content };
      }),
      ...(request.tools && request.tools.length > 0 ? {
        tools: request.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        tool_choice: request.toolChoice || 'auto',
      } : {}),
      stream: true,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    });

    headers['Content-Length'] = String(Buffer.byteLength(payload, 'utf8'));

    const isHttps = parsedUrl.protocol === 'https:';
    const requestOptions: https.RequestOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers,
      timeout: this.config.timeoutMs || 30_000,
    };

    if (isHttps) {
      if (this.config.allowInsecureTLS) {
        requestOptions.rejectUnauthorized = false;
      } else if (this.config.tlsConfig?.caBundle && fs.existsSync(this.config.tlsConfig.caBundle)) {
        requestOptions.ca = fs.readFileSync(this.config.tlsConfig.caBundle);
      }
    }

    return new Promise<ModelResponse>((resolve, reject) => {
      let accumulatedContent = '';
      const toolMap = new Map<number, ToolAccumulator>();
      let finishReason: FinishReason = FinishReason.STOP;
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let chunkIndex = 0;

      const httpModule = isHttps ? https : http;
      const req = httpModule.request(requestOptions, (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode >= 400) {
          let errBody = '';
          res.on('data', (d) => { errBody += d.toString('utf8'); });
          res.on('end', () => {
            const err = new GatewayError(
              statusCode === 401 || statusCode === 403 ? ErrorCode.AUTH_INVALID_CREDENTIALS : ErrorCode.INVALID_FRAME,
              `Server returned status ${statusCode}: ${errBody.slice(0, 500)}`,
            );
            (err as any).statusCode = statusCode;
            reject(err);
          });
          return;
        }

        let buffer = '';

        res.on('data', (chunkBuffer: Buffer) => {
          buffer += chunkBuffer.toString('utf8');
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') {
              continue;
            }
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const choice = parsed.choices?.[0];
                if (choice) {
                  if (choice.delta?.content || choice.delta?.tool_calls) {
                    if (choice.delta?.content) {
                      accumulatedContent += choice.delta.content;
                    }
                    onChunk({
                      content: choice.delta?.content || '',
                      index: chunkIndex++,
                    });
                  }

                  if (Array.isArray(choice.delta?.tool_calls)) {
                    for (const tc of choice.delta.tool_calls as OpenAIDeltaToolCall[]) {
                      const idx = tc.index ?? 0;
                      let acc = toolMap.get(idx);
                      if (!acc) {
                        acc = { id: tc.id || `call_${idx}`, name: '', arguments: '' };
                        toolMap.set(idx, acc);
                      }
                      if (tc.id) acc.id = tc.id;
                      if (tc.function?.name) acc.name += tc.function.name;
                      if (tc.function?.arguments) acc.arguments += tc.function.arguments;
                    }
                  }

                  if (choice.finish_reason) {
                    if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'function_call') {
                      finishReason = FinishReason.TOOL_CALLS;
                    } else if (choice.finish_reason === 'length') {
                      finishReason = FinishReason.LENGTH;
                    } else {
                      finishReason = FinishReason.STOP;
                    }
                  }
                }

                if (parsed.usage) {
                  promptTokens = parsed.usage.prompt_tokens || promptTokens;
                  completionTokens = parsed.usage.completion_tokens || completionTokens;
                  totalTokens = parsed.usage.total_tokens || totalTokens;
                }
              } catch (_e) {
                // ignore SSE json parse error on partial chunks
              }
            }
          }
        });

        res.on('end', () => {
          const toolCalls: ToolCall[] = Array.from(toolMap.values()).map((acc) => ({
            id: acc.id,
            name: acc.name,
            arguments: acc.arguments,
          }));

          if (toolCalls.length > 0) {
            finishReason = FinishReason.TOOL_CALLS;
          }

          resolve({
            id: request.id,
            requestId: request.id,
            content: accumulatedContent || (toolCalls.length > 0 ? '' : 'Completed'),
            finishReason,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: totalTokens || (promptTokens + completionTokens),
            },
          });
        });

        res.on('error', (err) => {
          reject(new GatewayError(ErrorCode.STREAM_INTERRUPTED, err.message));
        });
      });

      if (options.signal) {
        const onAbort = () => {
          req.destroy();
          reject(new GatewayError(ErrorCode.REQUEST_CANCELLED, 'Request aborted by user'));
        };
        if (options.signal.aborted) {
          onAbort();
        } else {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      req.on('error', (err: any) => {
        const gwErr = new GatewayError(ErrorCode.GATEWAY_UNREACHABLE, `Network request failed: ${err.message}`);
        (gwErr as any).code = err.code;
        reject(gwErr);
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * 探测 Provider 真实 Tool Calling 与流式能力 (PRD §7 A9-GW01)
   */
  async probeCapability(options: { modelOverride?: string; signal?: AbortSignal } = {}): Promise<ProviderCapabilityProbeResult> {
    const startTime = Date.now();
    const model = options.modelOverride || this.config.model;

    const probeTool: OpenAICompatibleFunctionTool = {
      name: 'probe_test_echo',
      description: 'Echo test function for model capability verification',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The echo test message' },
        },
        required: ['message'],
      },
    };

    let streamChunksReceived = 0;

    try {
      const response = await this.sendStreamRequest(
        {
          id: `probe-${Date.now()}`,
          model,
          messages: [
            {
              role: 'user',
              content: 'Please call probe_test_echo with message="probe_ok". Do not output plain text.',
            },
          ],
          tools: [probeTool],
          toolChoice: 'auto',
          maxTokens: 150,
          temperature: 0,
        },
        (_chunk) => {
          streamChunksReceived++;
        },
        { signal: options.signal },
      );

      const toolCalls = response.toolCalls || [];
      const hasToolCalling = toolCalls.length > 0 && toolCalls.some((t) => t.name === 'probe_test_echo');
      const hasStreaming = streamChunksReceived > 0;
      const latencyMs = Date.now() - startTime;

      return {
        ok: true,
        hasToolCalling,
        hasStreaming,
        latencyMs,
        model,
        notes: hasToolCalling ? 'Tool calling verified successfully' : 'Model responded without calling required tool',
      };
    } catch (err: any) {
      return {
        ok: false,
        hasToolCalling: false,
        hasStreaming: false,
        latencyMs: Date.now() - startTime,
        model,
        error: err?.message || String(err),
      };
    }
  }

  private normalizeChatEndpoint(baseUrl: string): string {
    if (baseUrl.endsWith('/chat/completions')) return baseUrl;
    if (baseUrl.endsWith('/v1')) return `${baseUrl}/chat/completions`;
    return `${baseUrl}/v1/chat/completions`;
  }
}
