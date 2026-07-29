// Contract types, error codes, event schemas — vendor-neutral model interface

// ── Error Codes ──────────────────────────────────────────────────────────────

export enum ErrorCode {
  // Connection errors (1xx)
  CONNECTION_TIMEOUT = 100,
  CONNECTION_REFUSED = 101,
  TLS_HANDSHAKE_FAILED = 102,
  TLS_VERIFY_FAILED = 103,

  // Protocol errors (2xx)
  PROTOCOL_VERSION_MISMATCH = 200,
  INVALID_FRAME = 201,
  DECODE_ERROR = 202,
  ENCODE_ERROR = 203,

  // Auth errors (3xx)
  AUTH_REQUIRED = 300,
  AUTH_INVALID_CREDENTIALS = 301,
  AUTH_EXPIRED = 302,

  // Server errors (4xx)
  RATE_LIMITED = 400,
  INTERNAL_ERROR = 401,
  MODEL_NOT_FOUND = 402,
  CONTEXT_LENGTH_EXCEEDED = 403,
}

export enum ErrorCategory {
  CONNECTION = 'CONNECTION',
  PROTOCOL = 'PROTOCOL',
  AUTH = 'AUTH',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN',
}

export function categorizeError(code: ErrorCode): ErrorCategory {
  if (code >= 100 && code < 200) return ErrorCategory.CONNECTION;
  if (code >= 200 && code < 300) return ErrorCategory.PROTOCOL;
  if (code >= 300 && code < 400) return ErrorCategory.AUTH;
  if (code >= 400 && code < 500) return ErrorCategory.SERVER;
  return ErrorCategory.UNKNOWN;
}

export class GatewayError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly category: ErrorCategory = categorizeError(code),
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

// ── Domain Model Types ───────────────────────────────────────────────────────

export enum FinishReason {
  STOP = 'stop',
  LENGTH = 'length',
  TOOL_CALLS = 'tool_calls',
  CONTENT_FILTER = 'content_filter',
  ERROR = 'error',
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON-encoded arguments
}

export interface ToolRequest {
  id: string;
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}

export interface ModelRequest {
  id: string;
  model: string;
  messages: Message[];
  tools?: ToolCall[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ModelResponse {
  id: string;
  requestId: string;
  content: string;
  finishReason: FinishReason;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export function createModelRequest(
  id: string,
  model: string,
  messages: Message[],
  options: { tools?: ToolCall[]; maxTokens?: number; temperature?: number; stream?: boolean } = {},
): ModelRequest {
  return { id, model, messages, ...options };
}

export function createModelResponse(
  id: string,
  requestId: string,
  content: string,
  finishReason: FinishReason = FinishReason.STOP,
  extra: { toolCalls?: ToolCall[]; usage?: ModelResponse['usage'] } = {},
): ModelResponse {
  return { id, requestId, content, finishReason, ...extra };
}

// ── Codecs ───────────────────────────────────────────────────────────────────

/**
 * Serialize a value to JSON string.
 */
export function encode<T>(value: T): string {
  return JSON.stringify(value);
}

/**
 * Deserialize a JSON string, tolerating unknown fields (they are preserved).
 */
export function decode<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

/**
 * Round-trip encode then decode; useful for tests.
 */
export function roundTrip<T>(value: T): T {
  return decode<T>(encode(value));
}

// ── Messages ─────────────────────────────────────────────────────────────────

export interface Request {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface Response {
  id: string;
  result?: unknown;
  error?: { code: ErrorCode; message: string };
}

export interface StreamEvent {
  type: 'chunk' | 'done' | 'error';
  data?: string;
  error?: { code: ErrorCode; message: string };
}

export function createRequest(id: string, method: string, params: Record<string, unknown> = {}): Request {
  return { id, method, params };
}

export function createResponse(id: string, result: unknown): Response {
  return { id, result };
}

export function createErrorResponse(id: string, code: ErrorCode, message: string): Response {
  return { id, error: { code, message } };
}

export function createStreamChunk(data: string): StreamEvent {
  return { type: 'chunk', data };
}

export function createStreamDone(): StreamEvent {
  return { type: 'done' };
}

export function createStreamError(code: ErrorCode, message: string): StreamEvent {
  return { type: 'error', error: { code, message } };
}

/**
 * Validate that a StreamEvent has the expected shape.
 */
export function isValidStreamEvent(event: unknown): event is StreamEvent {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  if (!['chunk', 'done', 'error'].includes(e.type as string)) return false;
  if (e.type === 'chunk' && typeof e.data !== 'string') return false;
  if (e.type === 'error' && (typeof e.error !== 'object' || e.error === null)) return false;
  return true;
}
