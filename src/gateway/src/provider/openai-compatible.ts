/**
 * @module openai-compatible
 * @description 供应商中立的 OpenAI-compatible Chat Completions Provider (PRD §7 A9-GW01 / ADR-0089)
 *
 * 协议合同（A9-04）：
 * - 多轮消息保存 assistant tool_calls / tool_call_id / 工具名，多个并行
 *   tool_calls 的协议关联不因顺序执行而丢失；
 * - SSE 解析处理跨 chunk 行、末尾无换行 buffer、[DONE]，畸形完整事件
 *   结构化上报；重试退避使用 RetryConfig；401/403/参数与工具格式错误不重试；
 * - totalTimeoutMs 与无数据超时真实生效，超时取消请求并解除监听；
 * - proxyConfig 真实生效（HTTP 绝对形式 / HTTPS CONNECT 隧道）；
 * - API Key 只进入 Authorization 头，不进入错误文本、日志或模型内容。
 */

import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
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
  calculateRetryDelay,
  buildProxyAuthHeader,
} from '../transport';
import {
  CredentialStore,
  defaultTLSConfig,
  InMemoryCredentialStore,
  TLSConfig,
  validateTLSConfig,
} from '../security';
import {
  SseParser,
  ToolCallAccumulator,
  MAX_TOOL_CALL_ARG_BYTES,
  MAX_TOOL_CALL_NAME_BYTES,
  MAX_TOOL_CALL_SLOTS,
} from './sse-parser';
import type { TruncationInfo } from '../types';

/** A9-21 M2 G-1：单响应内容上限（UTF-8 字节）。 */
const MAX_RESPONSE_CONTENT_BYTES = 1024 * 1024;

/**
 * 按 UTF-8 字符边界截断到不超过 limitBytes 的最长前缀。
 * 不切开多字节序列，不产生 U+FFFD。
 */
export function truncateUtf8ToByteLimit(text: string, limitBytes: number): { text: string; bytes: number } {
  if (limitBytes <= 0) return { text: '', bytes: 0 };
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= limitBytes) return { text, bytes: buf.length };
  let end = limitBytes;
  while (end > 0) {
    const byte = buf[end];
    // UTF-8 连续字节为 0b10xxxxxx；落在字符中间则回退。
    if ((byte & 0xc0) !== 0x80) break;
    end -= 1;
  }
  return { text: buf.slice(0, end).toString('utf8'), bytes: end };
}

export interface OpenAICompatibleFunctionTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Provider 接受的消息形状：标准 Message 或 Agent Loop 传递的
 * {role, content, toolCallId, toolName, toolCalls} 形状（结构兼容）。
 */
export type ProviderMessageInput =
  | Message
  | {
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      toolCallId?: string;
      toolName?: string;
      toolCalls?: ToolCall[];
    };

export interface OpenAIModelRequest {
  id: string;
  /** 缺省时使用 Provider 配置的模型。 */
  model?: string;
  messages: ProviderMessageInput[];
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
  /** 连接/首字节超时。 */
  timeoutMs?: number;
  /** 整个请求（含所有重试累计不重置的单次上限）的硬截止。 */
  totalTimeoutMs?: number;
  /** 无数据超时：持续收不到 SSE 字节即取消请求。 */
  noDataTimeoutMs?: number;
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

const DEFAULT_TOTAL_TIMEOUT_MS = 300_000;
const DEFAULT_NO_DATA_TIMEOUT_MS = 120_000;

/**
 * OpenAI-compatible function parameters must be an object JSON Schema. Core's
 * ToolInputSchema historically models only the object body (properties,
 * required, additionalProperties), so normalize that internal shorthand at
 * the Provider wire boundary. Explicit vendor schemas keep their declared type.
 */
function normalizeFunctionParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  if (parameters.type !== undefined) return { ...parameters };
  return { ...parameters, type: 'object' };
}

/** 不可重试的 HTTP 状态：认证、参数与工具格式错误。 */
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 405, 422]);

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
    if (config.allowInsecureTLS === true) {
      throw new GatewayError(
        ErrorCode.TLS_VERIFY_FAILED,
        'TLS certificate verification cannot be disabled',
      );
    }
    const tlsConfig = validateTLSConfig({ ...defaultTLSConfig(), ...(config.tlsConfig || {}) });
    if (tlsConfig.caBundle && !fs.existsSync(tlsConfig.caBundle)) {
      throw new GatewayError(
        ErrorCode.TLS_VERIFY_FAILED,
        `CA bundle does not exist: ${tlsConfig.caBundle}`,
      );
    }
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
      retryConfig: config.retryConfig || DEFAULT_RETRY_CONFIG,
      tlsConfig,
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
    const retry = this.config.retryConfig ?? DEFAULT_RETRY_CONFIG;
    const maxRetries = retry.maxRetries;
    const totalDeadline = Date.now() + (this.config.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS);
    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= maxRetries) {
      if (options.signal?.aborted) {
        throw new GatewayError(ErrorCode.REQUEST_CANCELLED, 'Request cancelled by user');
      }
      if (Date.now() >= totalDeadline) {
        throw new GatewayError(
          ErrorCode.CONNECTION_TIMEOUT,
          `Total timeout of ${this.config.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS}ms exhausted before attempt ${attempt + 1}`,
        );
      }

      try {
        return await this.executeSingleStreamRequest(request, onChunk, options, totalDeadline);
      } catch (err: any) {
        lastError = err;
        if (options.signal?.aborted) throw err;
        if (err?.code === ErrorCode.REQUEST_CANCELLED || err?.code === ErrorCode.CONNECTION_TIMEOUT) throw err;

        const statusCode = err?.statusCode;
        const isRetryable =
          statusCode === 429 ||
          (typeof statusCode === 'number' && statusCode >= 500 && statusCode <= 599) ||
          err?.networkCode === 'ECONNRESET' ||
          err?.networkCode === 'ETIMEDOUT' ||
          err?.networkCode === 'ECONNREFUSED' ||
          err?.networkCode === 'ENOTFOUND' ||
          err?.networkCode === 'NETWORK_ERROR';

        const nonRetryableStatus = typeof statusCode === 'number' && NON_RETRYABLE_STATUS.has(statusCode);
        if (nonRetryableStatus) {
          // 401/403/400/422：认证、参数与工具格式错误不盲目重试。
          throw err;
        }
        if (!isRetryable || attempt >= maxRetries) {
          throw err;
        }

        attempt++;
        const backoffMs = calculateRetryDelay(retry, attempt);
        const remaining = totalDeadline - Date.now();
        if (remaining <= 0) {
          throw new GatewayError(ErrorCode.CONNECTION_TIMEOUT, 'Total timeout exhausted during retry backoff');
        }
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, Math.min(backoffMs, remaining));
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new GatewayError(ErrorCode.REQUEST_CANCELLED, 'Request cancelled by user'));
          }, { once: true });
        });
      }
    }

    throw lastError || new GatewayError(ErrorCode.CONNECTION_TIMEOUT, 'Max retries reached');
  }

  private redact(text: string): string {
    const apiKey = this.store.getApiKey();
    if (!apiKey) return text;
    return text.split(apiKey).join('***redacted-api-key***');
  }

  /**
   * 组装 OpenAI Chat Completions messages 数组。assistant 的 tool_calls 与
   * tool 消息的 tool_call_id/name 必须完整回传，否则第二次请求 400。
   */
  buildOpenAIMessages(messages: ProviderMessageInput[]): Array<Record<string, unknown>> {
    return messages.map((raw) => {
      const m = raw as Record<string, unknown>;
      const role = m.role as string;
      if (role === 'assistant') {
        const toolCalls = m.toolCalls as ToolCall[] | undefined;
        return {
          role: 'assistant',
          ...(m.content ? { content: m.content } : { content: null }),
          ...(toolCalls && toolCalls.length > 0
            ? {
                tool_calls: toolCalls.map((tc) => ({
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: tc.arguments },
                })),
              }
            : {}),
        };
      }
      if (role === 'tool') {
        const name = (m.name as string | undefined) ?? (m.toolName as string | undefined);
        return {
          role: 'tool',
          tool_call_id: m.toolCallId,
          ...(name ? { name } : {}),
          content: m.content as string,
        };
      }
      return { role, content: m.content };
    });
  }

  private async executeSingleStreamRequest(
    request: OpenAIModelRequest,
    onChunk: (chunk: OpenAIStreamChunk) => void,
    options: OpenAIRequestOptions,
    totalDeadline: number,
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
      messages: this.buildOpenAIMessages(request.messages),
      ...(request.tools && request.tools.length > 0 ? {
        tools: request.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: normalizeFunctionParameters(t.parameters),
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
      requestOptions.rejectUnauthorized = true;
      requestOptions.minVersion = this.config.tlsConfig?.minTLSVersion as tls.SecureVersion;
      if (this.config.tlsConfig?.caBundle) {
        requestOptions.ca = fs.readFileSync(this.config.tlsConfig.caBundle);
      }
    }

    const noDataTimeoutMs = this.config.noDataTimeoutMs ?? DEFAULT_NO_DATA_TIMEOUT_MS;

    return new Promise<ModelResponse>((resolve, reject) => {
      let accumulatedContent = '';
      /** G-1：增量字节计数（不得每 chunk 重算整段）。 */
      let contentBytes = 0;
      let droppedAtLeastBytes = 0;
      const toolAccumulator = new ToolCallAccumulator(
        MAX_TOOL_CALL_ARG_BYTES,
        MAX_TOOL_CALL_NAME_BYTES,
        MAX_TOOL_CALL_SLOTS,
      );
      const parser = new SseParser();
      let finishReason: FinishReason = FinishReason.STOP;
      let sawFinishReason = false;
      let sawDataEvent = false;
      let streamDone = false;
      let observedFinishReason: FinishReason | undefined;
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let chunkIndex = 0;
      let settled = false;
      /** G-2/G-3：截断粘性；一旦截断不再接收内容，finishReason 固定 LENGTH。 */
      let responseTruncated = false;
      let truncation: TruncationInfo | undefined;
      let noDataTimer: NodeJS.Timeout | undefined;
      let totalTimer: NodeJS.Timeout | undefined;

      let activeRequest: http.ClientRequest | undefined;

      const settle = (error: Error | undefined, response?: ModelResponse) => {
        if (settled) return;
        settled = true;
        if (noDataTimer) clearTimeout(noDataTimer);
        if (totalTimer) clearTimeout(totalTimer);
        if (onAbort) options.signal?.removeEventListener('abort', onAbort);
        try {
          activeRequest?.destroy();
        } catch (_err) { /* already closed */ }
        if (error) reject(error);
        else resolve(response!);
      };

      /** G-3：截断后立即结算；结算幂等，先于连接销毁落定。 */
      const settleTruncated = (reason: 'response_content_limit' | 'tool_call_limit') => {
        if (settled || responseTruncated) return;
        responseTruncated = true;
        finishReason = FinishReason.LENGTH;
        truncation = {
          reason,
          retainedBytes: contentBytes,
          // R-4：两种 reason 的 limitBytes 均为内容 1 MiB 字节口径；槽位用 limitSlots。
          limitBytes: MAX_RESPONSE_CONTENT_BYTES,
          droppedAtLeastBytes: reason === 'response_content_limit'
            ? droppedAtLeastBytes
            : droppedAtLeastBytes + toolAccumulator.overflowDroppedBytes,
          ...(reason === 'tool_call_limit' ? { limitSlots: MAX_TOOL_CALL_SLOTS } : {}),
        };
        // 被截断的响应不携带任何 toolCalls（G-4）。
        settle(undefined, {
          id: request.id,
          requestId: request.id,
          content: accumulatedContent || '',
          finishReason: FinishReason.LENGTH,
          truncated: true,
          truncation,
          usage: { promptTokens, completionTokens, totalTokens: totalTokens || (promptTokens + completionTokens) },
        });
      };

      const onAbort = () => {
        settle(new GatewayError(ErrorCode.REQUEST_CANCELLED, 'Request aborted by user'));
      };
      if (options.signal) {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      const armNoDataTimer = () => {
        if (noDataTimer) clearTimeout(noDataTimer);
        noDataTimer = setTimeout(() => {
          settle(new GatewayError(
            ErrorCode.CONNECTION_TIMEOUT,
            `No SSE data received for ${noDataTimeoutMs}ms; request cancelled`,
          ));
        }, noDataTimeoutMs);
      };
      armNoDataTimer();
      totalTimer = setTimeout(() => {
        settle(new GatewayError(
          ErrorCode.CONNECTION_TIMEOUT,
          `Total timeout of ${this.config.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS}ms exhausted; request cancelled`,
        ));
      }, Math.max(1, totalDeadline - Date.now()));

      /** 处理一个 SSE 事件；命中上限时截断结算。 */
      const handleEvent = (event: import('./sse-parser').SseStreamEvent): void => {
        if (settled || responseTruncated) return;
        sawDataEvent = true;

        // Once a finish reason has been declared, only usage/empty frames may
        // follow. Accepting further content or tool deltas would allow a
        // provider to append executable work after the terminal frame.
        if (sawFinishReason && (
          (event.toolCallDeltas?.length ?? 0) > 0
          || (event.content !== null && event.content.length > 0)
        )) {
          settle(new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'Gateway stream emitted content after finish_reason'));
          return;
        }

        // R-5：恢复基线行为——content !== null（含空字符串）即触发 onChunk；空串计 0 字节。
        if (event.content !== null) {
          if (event.content) {
            const incomingBytes = Buffer.byteLength(event.content, 'utf8');
            if (contentBytes + incomingBytes > MAX_RESPONSE_CONTENT_BYTES) {
              const remaining = Math.max(0, MAX_RESPONSE_CONTENT_BYTES - contentBytes);
              const cut = truncateUtf8ToByteLimit(event.content, remaining);
              if (cut.text) {
                accumulatedContent += cut.text;
                contentBytes += cut.bytes;
                onChunk({ content: cut.text, index: chunkIndex++ });
              }
              droppedAtLeastBytes += incomingBytes - cut.bytes;
              settleTruncated('response_content_limit');
              return;
            }
            accumulatedContent += event.content;
            contentBytes += incomingBytes;
            onChunk({ content: event.content, index: chunkIndex++ });
          } else {
            onChunk({ content: '', index: chunkIndex++ });
          }
        } else if ((event.toolCallDeltas?.length ?? 0) > 0) {
          // tool_calls 增量同样证明流式通道工作（content 为空字符串）。
          onChunk({ content: '', index: chunkIndex++ });
        }

        for (const delta of event.toolCallDeltas ?? []) {
          toolAccumulator.apply(delta);
        }
        if (toolAccumulator.slotsOverflowed) {
          settleTruncated('tool_call_limit');
          return;
        }

        // G-2：截断粘性——命中后不再改 finishReason；此处尚未截断才更新。
        if (event.finishReason) {
          if (!['stop', 'tool_calls', 'length', 'content_filter'].includes(event.finishReason)) {
            settle(new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'Gateway stream returned unsupported finish_reason'));
            return;
          }
          sawFinishReason = true;
          const nextFinishReason = event.finishReason === 'tool_calls'
            ? FinishReason.TOOL_CALLS
              : event.finishReason === 'length'
                ? FinishReason.LENGTH
                : event.finishReason === 'content_filter'
                  ? FinishReason.CONTENT_FILTER
                  : FinishReason.STOP;
          if (observedFinishReason && observedFinishReason !== nextFinishReason) {
            settle(new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'Gateway stream returned conflicting finish_reason values'));
            return;
          }
          observedFinishReason = nextFinishReason;
          if (event.finishReason === 'tool_calls') {
            finishReason = FinishReason.TOOL_CALLS;
          } else if (event.finishReason === 'length') {
            finishReason = FinishReason.LENGTH;
          } else if (event.finishReason === 'content_filter') {
            finishReason = FinishReason.CONTENT_FILTER;
          } else {
            finishReason = FinishReason.STOP;
          }
        }
        if (event.usage) {
          promptTokens = event.usage.promptTokens ?? promptTokens;
          completionTokens = event.usage.completionTokens ?? completionTokens;
          totalTokens = event.usage.totalTokens ?? totalTokens;
        }
      };

      const handleResponse = (res: http.IncomingMessage) => {
        const statusCode = res.statusCode || 0;
        if (statusCode >= 400) {
          let errBody = '';
          res.on('data', (d) => { errBody += d.toString('utf8'); });
          res.on('end', () => {
            const err = new GatewayError(
              statusCode === 401 || statusCode === 403 ? ErrorCode.AUTH_INVALID_CREDENTIALS : ErrorCode.INVALID_FRAME,
              `Server returned status ${statusCode}: ${this.redact(errBody.slice(0, 500))}`,
            );
            (err as any).statusCode = statusCode;
            settle(err);
          });
          return;
        }

        res.on('data', (chunkBuffer: Buffer) => {
          if (settled) return;
          armNoDataTimer();
          let outcomes: ReturnType<SseParser['feed']>;
          try {
            outcomes = parser.feed(chunkBuffer);
          } catch (err: any) {
            // G-5：行缓冲超限 → 结构化失败。
            settle(err instanceof GatewayError
              ? err
              : new GatewayError(ErrorCode.INVALID_FRAME, this.redact(err.message)));
            return;
          }
          for (const outcome of outcomes) {
            if (settled || responseTruncated) return;
            if (outcome.kind === 'ignore') continue;
            if (outcome.kind === 'done') {
              streamDone = true;
              continue;
            }
            if (streamDone) {
              settle(new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'Gateway stream emitted data after DONE'));
              return;
            }
            handleEvent(outcome.event);
          }
        });

        res.on('end', () => {
          if (settled) return;
          // 末尾无换行的残余 buffer 也要解析。
          try {
            for (const outcome of parser.finish()) {
              if (settled || responseTruncated) return;
              if (outcome.kind === 'ignore' || outcome.kind === 'done') continue;
              if (streamDone) {
                settle(new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'Gateway stream emitted data after DONE'));
                return;
              }
              handleEvent(outcome.event);
            }
          } catch (err: any) {
            settle(err instanceof GatewayError
              ? err
              : new GatewayError(ErrorCode.INVALID_FRAME, this.redact(err.message)));
            return;
          }

          // G-3：截断后已经 settleTruncated；此处只处理未截断路径。
          if (settled || responseTruncated) return;

          if (parser.malformedEventCount > 0) {
            // 畸形完整事件结构化上报，不静默忽略。
            settle(new GatewayError(
              ErrorCode.STREAM_INTERRUPTED,
              `Malformed SSE events received (${parser.malformedEventCount}): ${(parser.malformedEvents[0] || '').slice(0, 120)}`,
            ));
            return;
          }

          const toolCalls: ToolCall[] = toolAccumulator.toArray();
          // G-4：参数/函数名超限的调用已在 ToolCall.truncated 标记；槽位溢出走 settleTruncated。
          // 响应级截断（settleTruncated）不携带 toolCalls；单项截断调用保留在数组中供 Core 拒绝执行。
          if (!sawDataEvent || !sawFinishReason) {
            settle(new GatewayError(
              ErrorCode.STREAM_INTERRUPTED,
              'Gateway stream ended without a finish_reason',
            ));
            return;
          }

          if (toolCalls.length > 0 && finishReason === FinishReason.STOP) {
            // A provider must not turn an ordinary stop (or a missing/late
            // tool finish) into executable tool calls merely because deltas
            // happened to contain tools.
            settle(new GatewayError(
              ErrorCode.STREAM_INTERRUPTED,
              'Gateway stream returned tool calls with stop finish_reason',
            ));
            return;
          }

          if (toolCalls.length > 0 && finishReason !== FinishReason.TOOL_CALLS) {
            // length/content_filter are genuine provider reasons. Preserve
            // them and discard calls so Core cannot execute incomplete output.
            settle(undefined, {
              id: request.id,
              requestId: request.id,
              content: accumulatedContent || '',
              finishReason,
              usage: {
                promptTokens,
                completionTokens,
                totalTokens: totalTokens || (promptTokens + completionTokens),
              },
            });
            return;
          }

          if (finishReason === FinishReason.TOOL_CALLS && toolCalls.length === 0) {
            settle(new GatewayError(ErrorCode.STREAM_INTERRUPTED, 'Gateway stream declared tool_calls without tool calls'));
            return;
          }

          settle(undefined, {
            id: request.id,
            requestId: request.id,
            content: accumulatedContent,
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
          // G-3：截断后连接销毁不得把结果覆盖成 STREAM_INTERRUPTED。
          if (settled) return;
          settle(new GatewayError(ErrorCode.STREAM_INTERRUPTED, this.redact(err.message)));
        });
      };

      const onReqError = (err: any) => {
        const gwErr = new GatewayError(ErrorCode.GATEWAY_UNREACHABLE, `Network request failed: ${this.redact(err.message)}`);
        (gwErr as any).networkCode = err.code ?? 'NETWORK_ERROR';
        settle(gwErr);
      };

      try {
        activeRequest = this.dispatchRequest(
          parsedUrl,
          requestOptions,
          isHttps,
          payload,
          handleResponse,
          onReqError,
          (req) => { activeRequest = req; },
        );
      } catch (err: any) {
        settle(new GatewayError(ErrorCode.GATEWAY_UNREACHABLE, `Request creation failed: ${err.message}`));
      }
    });
  }

  /**
   * 创建并发出请求。proxyConfig 生效：HTTP 目标走绝对形式；HTTPS 目标先
   * CONNECT 建立隧道再发送 payload。返回最外层请求句柄供取消。
   */
  private dispatchRequest(
    parsedUrl: url.URL,
    requestOptions: https.RequestOptions,
    isHttps: boolean,
    payload: string,
    onResponse: (res: http.IncomingMessage) => void,
    onError: (err: Error) => void,
    onTunnelUpgraded: (req: http.ClientRequest) => void,
  ): http.ClientRequest {
    const proxy = this.config.proxyConfig;

    const sendPlain = (options: https.RequestOptions): http.ClientRequest => {
      const transport = options.protocol === 'https:' ? https : http;
      const req = transport.request(options, onResponse);
      req.on('error', onError);
      req.write(payload);
      req.end();
      return req;
    };

    if (!proxy) {
      return sendPlain(requestOptions);
    }

    const proxyHeaders: Record<string, string> = {};
    if (proxy.auth) {
      proxyHeaders['Proxy-Authorization'] = buildProxyAuthHeader(proxy.auth);
    }
    const proxyProtocol = proxy.protocol ?? 'http';
    if (proxyProtocol === 'socks5') {
      throw new GatewayError(ErrorCode.INVALID_FRAME, 'socks5 proxy is not supported by this provider yet');
    }
    const proxyIsHttps = proxyProtocol === 'https';

    if (!isHttps) {
      // HTTP 目标：向代理发送绝对形式请求。
      return sendPlain({
        ...requestOptions,
        protocol: proxyIsHttps ? 'https:' : 'http:',
        hostname: proxy.host,
        port: proxy.port,
        path: parsedUrl.toString(),
        headers: { ...requestOptions.headers, ...proxyHeaders, Host: parsedUrl.host },
      });
    }

    // HTTPS 目标：CONNECT 隧道建立后才能发送 POST payload。
    const connectReq = (proxyIsHttps ? https : http).request({
      protocol: proxyIsHttps ? 'https:' : 'http:',
      hostname: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${parsedUrl.hostname}:${parsedUrl.port || 443}`,
      headers: { ...proxyHeaders, Host: `${parsedUrl.hostname}:${parsedUrl.port || 443}` },
      timeout: requestOptions.timeout,
    });
    connectReq.on('error', onError);
    connectReq.on('connect', (res: http.IncomingMessage, socket: any) => {
      if (res.statusCode !== 200) {
        onError(new Error(`Proxy CONNECT failed with status ${res.statusCode}`));
        return;
      }
      const tlsSocket = tls.connect({
        socket,
        servername: parsedUrl.hostname,
        ...(requestOptions.ca ? { ca: requestOptions.ca } : {}),
        ...(requestOptions.rejectUnauthorized === false ? { rejectUnauthorized: false } : {}),
      });
      tlsSocket.on('error', onError);
      const tunneled = https.request({
        ...requestOptions,
        protocol: 'https:',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        createConnection: (): any => tlsSocket,
      } as https.RequestOptions, onResponse);
      tunneled.on('error', onError);
      onTunnelUpgraded(tunneled);
      tunneled.write(payload);
      tunneled.end();
    });
    connectReq.end();
    return connectReq;
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
