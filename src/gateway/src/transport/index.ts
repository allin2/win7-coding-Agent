// Connection management, retry, reconnect, proxy

import { ErrorCode, GatewayError } from '../types';

// ── Connection State Machine ─────────────────────────────────────────────────

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
}

/**
 * Legal state transitions map.
 * Key: current state → Value: set of allowed next states.
 */
const VALID_TRANSITIONS: Readonly<Record<ConnectionState, ReadonlySet<ConnectionState>>> = {
  [ConnectionState.DISCONNECTED]: new Set([ConnectionState.CONNECTING]),
  [ConnectionState.CONNECTING]: new Set([ConnectionState.CONNECTED, ConnectionState.DISCONNECTED]),
  [ConnectionState.CONNECTED]: new Set([ConnectionState.DISCONNECTED, ConnectionState.RECONNECTING]),
  [ConnectionState.RECONNECTING]: new Set([ConnectionState.CONNECTED, ConnectionState.DISCONNECTED]),
};

export interface StateTransitionEvent {
  from: ConnectionState;
  to: ConnectionState;
  timestamp: number;
  reason?: string;
}

export type StateChangeListener = (event: StateTransitionEvent) => void;

export class ConnectionStateMachine {
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private _listeners: StateChangeListener[] = [];
  private _history: StateTransitionEvent[] = [];

  get state(): ConnectionState {
    return this._state;
  }

  get history(): ReadonlyArray<StateTransitionEvent> {
    return this._history;
  }

  /**
   * Attempt a state transition. Throws if the transition is not legal.
   */
  transition(to: ConnectionState, reason?: string): StateTransitionEvent {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.has(to)) {
      throw new GatewayError(
        ErrorCode.INTERNAL_ERROR,
        `Invalid state transition: ${this._state} → ${to}`,
      );
    }
    const event: StateTransitionEvent = {
      from: this._state,
      to,
      timestamp: Date.now(),
      reason,
    };
    this._state = to;
    this._history.push(event);
    for (const listener of this._listeners) {
      listener(event);
    }
    return event;
  }

  onStateChange(listener: StateChangeListener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  reset(): void {
    this._state = ConnectionState.DISCONNECTED;
    this._history = [];
  }
}

// ── Connection Configuration ─────────────────────────────────────────────────

export interface RetryConfig {
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in ms between retries (default: 30000) */
  maxDelayMs: number;
  /** Maximum number of retry attempts (default: 5) */
  maxRetries: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  maxRetries: 5,
  backoffMultiplier: 2,
};

export interface ConnectionConfig {
  /** Connection timeout in ms */
  timeoutMs: number;
  /** Hard deadline across the initial attempt, backoff and all retries. */
  totalTimeoutMs: number;
  /** Maximum response body size in bytes */
  maxResponseSizeBytes: number;
  /** Retry configuration */
  retry: RetryConfig;
  /** Optional proxy configuration */
  proxy?: ProxyConfig;
  /** Target URL */
  url: string;
  /** Encoding (explicitly UTF-8) */
  encoding: 'utf-8';
}

export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  timeoutMs: 30000,
  totalTimeoutMs: 90000,
  maxResponseSizeBytes: 10 * 1024 * 1024, // 10 MB
  retry: DEFAULT_RETRY_CONFIG,
  url: '',
  encoding: 'utf-8',
};

// ── Proxy Support ────────────────────────────────────────────────────────────

export interface ProxyAuth {
  username: string;
  password: string;
}

export interface ProxyConfig {
  host: string;
  port: number;
  auth?: ProxyAuth;
  /** Proxy protocol (default: 'http') */
  protocol?: 'http' | 'https' | 'socks5';
}

/**
 * Build proxy authorization header value.
 */
export function buildProxyAuthHeader(auth: ProxyAuth): string {
  const encoded = typeof btoa === 'function'
    ? btoa(`${auth.username}:${auth.password}`)
    : Buffer.from(`${auth.username}:${auth.password}`, 'utf-8').toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Build the full proxy URL from config.
 */
export function buildProxyUrl(proxy: ProxyConfig): string {
  const protocol = proxy.protocol ?? 'http';
  const authPart = proxy.auth
    ? `${encodeURIComponent(proxy.auth.username)}:${encodeURIComponent(proxy.auth.password)}@`
    : '';
  return `${protocol}://${authPart}${proxy.host}:${proxy.port}`;
}

// ── Network Stack Abstraction ────────────────────────────────────────────────

/**
 * Abstract network stack interface.
 * Implementations: Electron net, Node https, WinHTTP.
 */
export interface INetworkStack {
  readonly name: string;
  request(url: string, options: NetworkRequestOptions): Promise<NetworkResponse>;
}

export interface NetworkRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: string; // UTF-8 encoded
  timeoutMs: number;
  maxResponseSizeBytes: number;
  proxy?: ProxyConfig;
  encoding: 'utf-8';
  /** Incremental UTF-8 response delivery. When set, body may be empty. */
  onData?: (chunk: string) => void;
  /** Cancels the in-flight request. */
  signal?: {
    readonly aborted: boolean;
    addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
    removeEventListener(type: 'abort', listener: () => void): void;
  };
}

export interface NetworkResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string; // UTF-8 encoded
}

/**
 * Mock network stack for development/testing (theory-first phase).
 */
export class MockNetworkStack implements INetworkStack {
  readonly name = 'mock';
  private _handler?: (url: string, options: NetworkRequestOptions) => Promise<NetworkResponse>;

  setHandler(handler: (url: string, options: NetworkRequestOptions) => Promise<NetworkResponse>): void {
    this._handler = handler;
  }

  async request(url: string, options: NetworkRequestOptions): Promise<NetworkResponse> {
    if (this._handler) {
      return this._handler(url, options);
    }
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: '{}',
    };
  }
}

// ── Retry Logic ──────────────────────────────────────────────────────────────

/**
 * Error classification for retry decisions.
 */
export enum Retryability {
  RETRIABLE = 'RETRIABLE',
  NON_RETRIABLE = 'NON_RETRIABLE',
}

/**
 * Retry policy is an explicit, reviewable matrix rather than a numeric error-range
 * heuristic. In particular, certificate failures and user cancellation must never
 * turn into hidden reconnect loops.
 */
export const RETRY_POLICY: Readonly<Record<ErrorCode, Retryability>> = Object.freeze({
  [ErrorCode.CONNECTION_TIMEOUT]: Retryability.RETRIABLE,
  [ErrorCode.CONNECTION_REFUSED]: Retryability.RETRIABLE,
  [ErrorCode.TLS_HANDSHAKE_FAILED]: Retryability.NON_RETRIABLE,
  [ErrorCode.TLS_VERIFY_FAILED]: Retryability.NON_RETRIABLE,
  [ErrorCode.GATEWAY_UNREACHABLE]: Retryability.RETRIABLE,
  [ErrorCode.STREAM_INTERRUPTED]: Retryability.RETRIABLE,
  [ErrorCode.REQUEST_CANCELLED]: Retryability.NON_RETRIABLE,
  [ErrorCode.PROTOCOL_VERSION_MISMATCH]: Retryability.NON_RETRIABLE,
  [ErrorCode.INVALID_FRAME]: Retryability.NON_RETRIABLE,
  [ErrorCode.DECODE_ERROR]: Retryability.NON_RETRIABLE,
  [ErrorCode.ENCODE_ERROR]: Retryability.NON_RETRIABLE,
  [ErrorCode.AUTH_REQUIRED]: Retryability.NON_RETRIABLE,
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: Retryability.NON_RETRIABLE,
  [ErrorCode.AUTH_EXPIRED]: Retryability.NON_RETRIABLE,
  [ErrorCode.PROXY_AUTH_FAILED]: Retryability.NON_RETRIABLE,
  [ErrorCode.RATE_LIMITED]: Retryability.RETRIABLE,
  [ErrorCode.INTERNAL_ERROR]: Retryability.RETRIABLE,
  [ErrorCode.MODEL_NOT_FOUND]: Retryability.NON_RETRIABLE,
  [ErrorCode.CONTEXT_LENGTH_EXCEEDED]: Retryability.NON_RETRIABLE,
});

/**
 * Classify whether a given error code is retriable.
 */
export function classifyRetryability(code: ErrorCode): Retryability {
  return RETRY_POLICY[code] ?? Retryability.NON_RETRIABLE;
}

export interface RetryState {
  attempt: number;
  lastDelayMs: number;
  totalElapsedMs: number;
}

/**
 * Calculate the delay for the next retry attempt using exponential backoff with jitter.
 */
export function calculateRetryDelay(config: RetryConfig, attempt: number): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const capped = Math.min(baseDelay, config.maxDelayMs);
  // Add ±25% jitter
  const jitter = capped * 0.25 * (Math.random() * 2 - 1);
  return Math.round(capped + jitter);
}

export class RetryController {
  private _config: RetryConfig;
  private _state: RetryState = { attempt: 0, lastDelayMs: 0, totalElapsedMs: 0 };
  private _startTime: number = 0;

  constructor(config: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this._config = { ...config };
  }

  get config(): Readonly<RetryConfig> {
    return this._config;
  }

  get state(): Readonly<RetryState> {
    return this._state;
  }

  get remainingAttempts(): number {
    return Math.max(0, this._config.maxRetries - this._state.attempt);
  }

  get isExhausted(): boolean {
    return this._state.attempt >= this._config.maxRetries;
  }

  /**
   * Record a failed attempt and return the delay before next retry.
   * Throws if retries are exhausted.
   */
  recordFailure(): number {
    if (this.isExhausted) {
      throw new GatewayError(
        ErrorCode.CONNECTION_TIMEOUT,
        `Retry exhausted after ${this._state.attempt} attempts`,
      );
    }
    const delay = calculateRetryDelay(this._config, this._state.attempt);
    this._state.attempt++;
    this._state.lastDelayMs = delay;
    if (this._startTime === 0) this._startTime = Date.now();
    this._state.totalElapsedMs = Date.now() - this._startTime;
    return delay;
  }

  /**
   * Check if a specific error code allows retry.
   */
  canRetry(code: ErrorCode): boolean {
    return !this.isExhausted && classifyRetryability(code) === Retryability.RETRIABLE;
  }

  /**
   * Reset the retry controller for a new request cycle.
   */
  reset(): void {
    this._state = { attempt: 0, lastDelayMs: 0, totalElapsedMs: 0 };
    this._startTime = 0;
  }
}

// ── Request Tracking (Disconnect Recovery) ───────────────────────────────────

export enum RequestStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

export interface TrackedRequest {
  id: string;
  idempotencyKey: string;
  status: RequestStatus;
  payload: string; // UTF-8 encoded request body
  createdAt: number;
  lastAttemptAt: number;
  attemptCount: number;
}

/**
 * Generate an idempotency key (UUID v4 format).
 */
export function generateIdempotencyKey(): string {
  try {
    // Node.js 16+ has crypto.randomUUID
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('crypto') as { randomUUID?: () => string; randomFillSync: (buf: Uint8Array) => Uint8Array };
    if (typeof nodeCrypto.randomUUID === 'function') {
      return nodeCrypto.randomUUID();
    }
    // Fallback: manual UUID v4 from random bytes
    const bytes = new Uint8Array(16);
    nodeCrypto.randomFillSync(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const h = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  } catch {
    // Last resort: Math.random (not crypto-safe, but functional)
    const h = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  }
}

export class RequestTracker {
  private _requests: Map<string, TrackedRequest> = new Map();

  /**
   * Register a new request for tracking.
   */
  track(id: string, payload: string): TrackedRequest {
    const request: TrackedRequest = {
      id,
      idempotencyKey: generateIdempotencyKey(),
      status: RequestStatus.PENDING,
      payload,
      createdAt: Date.now(),
      lastAttemptAt: 0,
      attemptCount: 0,
    };
    this._requests.set(id, request);
    return request;
  }

  /**
   * Mark a request as sent.
   */
  markSent(id: string): void {
    const req = this._getOrThrow(id);
    req.status = RequestStatus.SENT;
    req.lastAttemptAt = Date.now();
    req.attemptCount++;
  }

  /**
   * Mark a request as acknowledged (completed successfully).
   */
  markAcknowledged(id: string): void {
    const req = this._getOrThrow(id);
    req.status = RequestStatus.ACKNOWLEDGED;
  }

  /**
   * Mark a request as failed.
   */
  markFailed(id: string): void {
    const req = this._getOrThrow(id);
    req.status = RequestStatus.FAILED;
  }

  /**
   * Mark a request as pending retry.
   */
  markRetrying(id: string): void {
    const req = this._getOrThrow(id);
    req.status = RequestStatus.RETRYING;
  }

  /**
   * Get all requests that need retry (PENDING or RETRYING status).
   */
  getPendingRetry(): TrackedRequest[] {
    return Array.from(this._requests.values()).filter(
      r => r.status === RequestStatus.PENDING || r.status === RequestStatus.RETRYING,
    );
  }

  /**
   * Get all unacknowledged requests (for recovery).
   */
  getUnacknowledged(): TrackedRequest[] {
    return Array.from(this._requests.values()).filter(
      r => r.status !== RequestStatus.ACKNOWLEDGED,
    );
  }

  get(id: string): TrackedRequest | undefined {
    return this._requests.get(id);
  }

  remove(id: string): void {
    this._requests.delete(id);
  }

  clear(): void {
    this._requests.clear();
  }

  private _getOrThrow(id: string): TrackedRequest {
    const req = this._requests.get(id);
    if (!req) {
      throw new GatewayError(ErrorCode.INTERNAL_ERROR, `Unknown request id: ${id}`);
    }
    return req;
  }
}

// ── Stream Recovery ──────────────────────────────────────────────────────────

export interface StreamCheckpoint {
  requestId: string;
  lastChunkIndex: number;
  lastChunkId?: string;
  bytesReceived: number;
  timestamp: number;
}

export class StreamRecoveryPoint {
  private _checkpoint: StreamCheckpoint | null = null;

  get checkpoint(): StreamCheckpoint | null {
    return this._checkpoint;
  }

  /**
   * Update the recovery checkpoint with the latest chunk info.
   */
  update(requestId: string, chunkIndex: number, bytesReceived: number, chunkId?: string): void {
    this._checkpoint = {
      requestId,
      lastChunkIndex: chunkIndex,
      lastChunkId: chunkId,
      bytesReceived,
      timestamp: Date.now(),
    };
  }

  /**
   * Get the resume position for a interrupted stream.
   * Returns the next chunk index to request.
   */
  getResumePosition(requestId: string): number {
    if (!this._checkpoint || this._checkpoint.requestId !== requestId) {
      return 0; // No checkpoint, start from beginning
    }
    return this._checkpoint.lastChunkIndex + 1;
  }

  /**
   * Clear the checkpoint after successful completion or abandonment.
   */
  clear(): void {
    this._checkpoint = null;
  }
}

// ── IConnection Interface ────────────────────────────────────────────────────

export type DataListener = (requestId: string, data: string) => void;
export type ErrorListener = (requestId: string, error: GatewayError) => void;

export interface IConnection {
  /** Establish the connection. */
  connect(): Promise<void>;
  /** Gracefully close the connection. */
  disconnect(reason?: string): void;
  /** Send a request payload (UTF-8 encoded). */
  send(requestId: string, payload: string, headers?: Readonly<Record<string, string>>): Promise<void>;
  /** Cancel one in-flight request. */
  cancel(requestId: string): void;
  /** Register a data callback. */
  onData(listener: DataListener): () => void;
  /** Register an error callback. */
  onError(listener: ErrorListener): () => void;
  /** Current connection state. */
  readonly state: ConnectionState;
  /** The request tracker for disconnect recovery. */
  readonly tracker: RequestTracker;
}

// ── Mock Connection Implementation ───────────────────────────────────────────

export class MockConnection implements IConnection {
  private _fsm = new ConnectionStateMachine();
  private _config: ConnectionConfig;
  private _network: INetworkStack;
  private _dataListeners: DataListener[] = [];
  private _errorListeners: ErrorListener[] = [];
  private _tracker = new RequestTracker();
  private _streamRecovery = new StreamRecoveryPoint();
  private _retryController: RetryController;
  private _abortControllers: Map<string, AbortController> = new Map();
  private _connectionGeneration = 0;

  constructor(
    config: ConnectionConfig = DEFAULT_CONNECTION_CONFIG,
    network: INetworkStack = new MockNetworkStack(),
  ) {
    this._config = {
      ...config,
      retry: { ...config.retry },
      totalTimeoutMs: config.totalTimeoutMs ?? Math.max(config.timeoutMs, 90000),
    };
    this._network = network;
    this._retryController = new RetryController(this._config.retry);
  }

  get state(): ConnectionState {
    return this._fsm.state;
  }

  get tracker(): RequestTracker {
    return this._tracker;
  }

  get streamRecovery(): StreamRecoveryPoint {
    return this._streamRecovery;
  }

  async connect(): Promise<void> {
    if (this._fsm.state === ConnectionState.DISCONNECTED) {
      this._fsm.transition(ConnectionState.CONNECTING, 'initial connect');
    } else if (this._fsm.state === ConnectionState.RECONNECTING) {
      // Already reconnecting, just continue the transition below
    } else {
      throw new GatewayError(
        ErrorCode.INTERNAL_ERROR,
        `Cannot connect from state: ${this._fsm.state}`,
      );
    }

    // HTTP(S) is request-scoped. Opening a second POST here would send a
    // body-less model request and make every logical request hit the server twice.
    this._fsm.transition(ConnectionState.CONNECTED, 'transport ready');
  }

  disconnect(reason?: string): void {
    this._connectionGeneration++;
    for (const controller of this._abortControllers.values()) {
      controller.abort();
    }
    this._abortControllers.clear();
    if (
      this._fsm.state === ConnectionState.CONNECTED ||
      this._fsm.state === ConnectionState.CONNECTING ||
      this._fsm.state === ConnectionState.RECONNECTING
    ) {
      this._fsm.transition(ConnectionState.DISCONNECTED, reason ?? 'explicit disconnect');
    }
  }

  async send(
    requestId: string,
    payload: string,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<void> {
    if (this._fsm.state !== ConnectionState.CONNECTED) {
      // Queue for retry
      const tracked = this._tracker.get(requestId);
      if (!tracked) {
        this._tracker.track(requestId, payload);
      }
      this._tracker.markRetrying(requestId);

      throw new GatewayError(
        ErrorCode.CONNECTION_REFUSED,
        `Cannot send in state: ${this._fsm.state}`,
      );
    }

    // Track and send
    let tracked = this._tracker.get(requestId);
    if (!tracked) {
      tracked = this._tracker.track(requestId, payload);
    }

    this._retryController.reset();
    const startedAt = Date.now();
    const generation = this._connectionGeneration;

    while (true) {
      this._tracker.markSent(requestId);
      const controller = new AbortController();
      this._abortControllers.set(requestId, controller);
      let streamed = false;

      try {
        const response = await this._network.request(this._config.url, {
          method: 'POST',
          headers: {
            ...headers,
            'content-type': 'application/json; charset=utf-8',
            'x-idempotency-key': tracked.idempotencyKey,
            'x-request-id': requestId,
          },
          body: payload,
          timeoutMs: Math.min(
            this._config.timeoutMs,
            Math.max(1, this._config.totalTimeoutMs - (Date.now() - startedAt)),
          ),
          maxResponseSizeBytes: this._config.maxResponseSizeBytes,
          proxy: this._config.proxy,
          encoding: 'utf-8',
          signal: controller.signal,
          onData: (chunk: string) => {
            streamed = true;
            this._notifyData(requestId, chunk);
          },
        });

        this._throwForHttpStatus(response.statusCode);
        this._tracker.markAcknowledged(requestId);
        if (!streamed && response.body.length > 0) {
          this._notifyData(requestId, response.body);
        }
        this._retryController.reset();
        return;
      } catch (e) {
        this._tracker.markFailed(requestId);
        const gwError = e instanceof GatewayError
          ? e
          : new GatewayError(ErrorCode.GATEWAY_UNREACHABLE, String(e));

        const elapsed = Date.now() - startedAt;
        if (
          generation !== this._connectionGeneration ||
          gwError.code === ErrorCode.REQUEST_CANCELLED
        ) {
          this._notifyError(requestId, gwError);
          throw gwError;
        }

        if (
          !this._retryController.canRetry(gwError.code) ||
          elapsed >= this._config.totalTimeoutMs
        ) {
          const finalError = classifyRetryability(gwError.code) === Retryability.RETRIABLE
            ? new GatewayError(
              ErrorCode.GATEWAY_UNREACHABLE,
              `Gateway request failed after ${tracked.attemptCount} attempt(s): ${gwError.message}`,
            )
            : gwError;
          this._notifyError(requestId, finalError);
          throw finalError;
        }

        this._tracker.markRetrying(requestId);
        if (this._fsm.state === ConnectionState.CONNECTED) {
          this._fsm.transition(ConnectionState.RECONNECTING, 'bounded retry after failure');
        }
        const delay = this._retryController.recordFailure();
        if (Date.now() - startedAt + delay >= this._config.totalTimeoutMs) {
          const timeoutError = new GatewayError(
            ErrorCode.GATEWAY_UNREACHABLE,
            `Gateway retry deadline of ${this._config.totalTimeoutMs}ms exhausted`,
          );
          this._notifyError(requestId, timeoutError);
          throw timeoutError;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        if (
          generation !== this._connectionGeneration ||
          (this._fsm.state as ConnectionState) === ConnectionState.DISCONNECTED
        ) {
          const cancelled = new GatewayError(
            ErrorCode.REQUEST_CANCELLED,
            `Request ${requestId} was cancelled while waiting to retry`,
          );
          this._notifyError(requestId, cancelled);
          throw cancelled;
        }
        this._fsm.transition(ConnectionState.CONNECTED, 'retry transport ready');
      } finally {
        this._abortControllers.delete(requestId);
      }
    }
  }

  cancel(requestId: string): void {
    const controller = this._abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this._abortControllers.delete(requestId);
    }
  }

  private _notifyData(requestId: string, data: string): void {
    for (const listener of this._dataListeners) {
      listener(requestId, data);
    }
  }

  private _notifyError(requestId: string, error: GatewayError): void {
    for (const listener of this._errorListeners) {
      listener(requestId, error);
    }
  }

  private _throwForHttpStatus(statusCode: number): void {
    if (statusCode >= 200 && statusCode < 300) return;
    if (statusCode === 401 || statusCode === 403) {
      throw new GatewayError(ErrorCode.AUTH_INVALID_CREDENTIALS, `Gateway authentication failed (HTTP ${statusCode})`);
    }
    if (statusCode === 407) {
      throw new GatewayError(ErrorCode.PROXY_AUTH_FAILED, 'Proxy authentication failed (HTTP 407)');
    }
    if (statusCode === 429) {
      throw new GatewayError(ErrorCode.RATE_LIMITED, 'Gateway rate limit exceeded (HTTP 429)');
    }
    if (statusCode >= 500) {
      throw new GatewayError(ErrorCode.INTERNAL_ERROR, `Gateway server failed (HTTP ${statusCode})`);
    }
    throw new GatewayError(ErrorCode.DECODE_ERROR, `Unexpected gateway response status HTTP ${statusCode}`);
  }

  onData(listener: DataListener): () => void {
    this._dataListeners.push(listener);
    return () => {
      const idx = this._dataListeners.indexOf(listener);
      if (idx >= 0) this._dataListeners.splice(idx, 1);
    };
  }

  onError(listener: ErrorListener): () => void {
    this._errorListeners.push(listener);
    return () => {
      const idx = this._errorListeners.indexOf(listener);
      if (idx >= 0) this._errorListeners.splice(idx, 1);
    };
  }
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export { ErrorCode, GatewayError } from '../types';
export {
  NodeNetworkStack,
  NodeNetworkStackConfig,
  DEFAULT_NODE_NETWORK_CONFIG,
  mapNodeError,
  loadCaBundle,
} from './node-network';
