import {
  ConnectionState,
  ConnectionStateMachine,
  RetryConfig,
  RetryController,
  DEFAULT_RETRY_CONFIG,
  calculateRetryDelay,
  classifyRetryability,
  Retryability,
  RequestTracker,
  RequestStatus,
  generateIdempotencyKey,
  StreamRecoveryPoint,
  MockConnection,
  MockNetworkStack,
  buildProxyAuthHeader,
  buildProxyUrl,
  DEFAULT_CONNECTION_CONFIG,
  StateTransitionEvent,
} from '../../../src/transport';
import { ErrorCode, GatewayError } from '../../../src/types';

// ── State Machine ────────────────────────────────────────────────────────────

describe('transport/ConnectionStateMachine', () => {
  let fsm: ConnectionStateMachine;

  beforeEach(() => {
    fsm = new ConnectionStateMachine();
  });

  it('starts in DISCONNECTED state', () => {
    expect(fsm.state).toBe(ConnectionState.DISCONNECTED);
  });

  it('allows DISCONNECTED → CONNECTING → CONNECTED', () => {
    fsm.transition(ConnectionState.CONNECTING);
    expect(fsm.state).toBe(ConnectionState.CONNECTING);
    fsm.transition(ConnectionState.CONNECTED);
    expect(fsm.state).toBe(ConnectionState.CONNECTED);
  });

  it('allows CONNECTED → RECONNECTING → CONNECTED', () => {
    fsm.transition(ConnectionState.CONNECTING);
    fsm.transition(ConnectionState.CONNECTED);
    fsm.transition(ConnectionState.RECONNECTING);
    expect(fsm.state).toBe(ConnectionState.RECONNECTING);
    fsm.transition(ConnectionState.CONNECTED);
    expect(fsm.state).toBe(ConnectionState.CONNECTED);
  });

  it('allows CONNECTED → DISCONNECTED', () => {
    fsm.transition(ConnectionState.CONNECTING);
    fsm.transition(ConnectionState.CONNECTED);
    fsm.transition(ConnectionState.DISCONNECTED);
    expect(fsm.state).toBe(ConnectionState.DISCONNECTED);
  });

  it('allows RECONNECTING → DISCONNECTED', () => {
    fsm.transition(ConnectionState.CONNECTING);
    fsm.transition(ConnectionState.CONNECTED);
    fsm.transition(ConnectionState.RECONNECTING);
    fsm.transition(ConnectionState.DISCONNECTED);
    expect(fsm.state).toBe(ConnectionState.DISCONNECTED);
  });

  it('rejects illegal transition DISCONNECTED → CONNECTED', () => {
    expect(() => fsm.transition(ConnectionState.CONNECTED)).toThrow(GatewayError);
  });

  it('rejects illegal transition CONNECTING → RECONNECTING', () => {
    fsm.transition(ConnectionState.CONNECTING);
    expect(() => fsm.transition(ConnectionState.RECONNECTING)).toThrow(GatewayError);
  });

  it('rejects illegal transition DISCONNECTED → RECONNECTING', () => {
    expect(() => fsm.transition(ConnectionState.RECONNECTING)).toThrow(GatewayError);
  });

  it('records transition history', () => {
    fsm.transition(ConnectionState.CONNECTING, 'test connect');
    fsm.transition(ConnectionState.CONNECTED, 'established');
    expect(fsm.history).toHaveLength(2);
    expect(fsm.history[0].from).toBe(ConnectionState.DISCONNECTED);
    expect(fsm.history[0].to).toBe(ConnectionState.CONNECTING);
    expect(fsm.history[0].reason).toBe('test connect');
    expect(fsm.history[1].from).toBe(ConnectionState.CONNECTING);
    expect(fsm.history[1].to).toBe(ConnectionState.CONNECTED);
  });

  it('notifies state change listeners', () => {
    const events: StateTransitionEvent[] = [];
    fsm.onStateChange(e => events.push(e));
    fsm.transition(ConnectionState.CONNECTING);
    fsm.transition(ConnectionState.CONNECTED);
    expect(events).toHaveLength(2);
  });

  it('unsubscribes listener correctly', () => {
    const events: StateTransitionEvent[] = [];
    const unsub = fsm.onStateChange(e => events.push(e));
    fsm.transition(ConnectionState.CONNECTING);
    unsub();
    fsm.transition(ConnectionState.CONNECTED);
    expect(events).toHaveLength(1);
  });

  it('reset returns to DISCONNECTED and clears history', () => {
    fsm.transition(ConnectionState.CONNECTING);
    fsm.transition(ConnectionState.CONNECTED);
    fsm.reset();
    expect(fsm.state).toBe(ConnectionState.DISCONNECTED);
    expect(fsm.history).toHaveLength(0);
  });
});

// ── Retry Logic ──────────────────────────────────────────────────────────────

describe('transport/retry', () => {
  describe('classifyRetryability', () => {
    it('classifies connection errors as retriable', () => {
      expect(classifyRetryability(ErrorCode.CONNECTION_TIMEOUT)).toBe(Retryability.RETRIABLE);
      expect(classifyRetryability(ErrorCode.CONNECTION_REFUSED)).toBe(Retryability.RETRIABLE);
    });

    it('does not retry TLS failures or explicit cancellation', () => {
      expect(classifyRetryability(ErrorCode.TLS_HANDSHAKE_FAILED)).toBe(Retryability.NON_RETRIABLE);
      expect(classifyRetryability(ErrorCode.TLS_VERIFY_FAILED)).toBe(Retryability.NON_RETRIABLE);
      expect(classifyRetryability(ErrorCode.REQUEST_CANCELLED)).toBe(Retryability.NON_RETRIABLE);
    });

    it('classifies RATE_LIMITED as retriable', () => {
      expect(classifyRetryability(ErrorCode.RATE_LIMITED)).toBe(Retryability.RETRIABLE);
    });

    it('classifies INTERNAL_ERROR as retriable', () => {
      expect(classifyRetryability(ErrorCode.INTERNAL_ERROR)).toBe(Retryability.RETRIABLE);
    });

    it('classifies auth errors as non-retriable', () => {
      expect(classifyRetryability(ErrorCode.AUTH_REQUIRED)).toBe(Retryability.NON_RETRIABLE);
      expect(classifyRetryability(ErrorCode.AUTH_INVALID_CREDENTIALS)).toBe(Retryability.NON_RETRIABLE);
    });

    it('classifies protocol errors as non-retriable', () => {
      expect(classifyRetryability(ErrorCode.INVALID_FRAME)).toBe(Retryability.NON_RETRIABLE);
      expect(classifyRetryability(ErrorCode.PROTOCOL_VERSION_MISMATCH)).toBe(Retryability.NON_RETRIABLE);
    });

    it('classifies MODEL_NOT_FOUND as non-retriable', () => {
      expect(classifyRetryability(ErrorCode.MODEL_NOT_FOUND)).toBe(Retryability.NON_RETRIABLE);
    });
  });

  describe('calculateRetryDelay', () => {
    const config: RetryConfig = {
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      maxRetries: 5,
      backoffMultiplier: 2,
    };

    it('returns delay within expected range for attempt 0', () => {
      const delay = calculateRetryDelay(config, 0);
      // 1000 * 2^0 = 1000, ±25% → [750, 1250]
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    });

    it('caps delay at maxDelayMs', () => {
      const delay = calculateRetryDelay(config, 20);
      // Should be capped at 10000 ±25%
      expect(delay).toBeLessThanOrEqual(12500);
    });

    it('increases delay with attempt number', () => {
      // Use fixed values to avoid randomness issues
      const d0 = calculateRetryDelay(config, 0);
      const d5 = calculateRetryDelay(config, 5);
      // d5 should be near max (10000), d0 near 1000
      expect(d5).toBeGreaterThan(d0);
    });
  });

  describe('RetryController', () => {
    let ctrl: RetryController;

    beforeEach(() => {
      ctrl = new RetryController({ ...DEFAULT_RETRY_CONFIG, maxRetries: 3 });
    });

    it('starts with zero attempts', () => {
      expect(ctrl.state.attempt).toBe(0);
      expect(ctrl.remainingAttempts).toBe(3);
      expect(ctrl.isExhausted).toBe(false);
    });

    it('increments attempt on recordFailure', () => {
      ctrl.recordFailure();
      expect(ctrl.state.attempt).toBe(1);
      expect(ctrl.remainingAttempts).toBe(2);
    });

    it('throws when retries exhausted', () => {
      ctrl.recordFailure();
      ctrl.recordFailure();
      ctrl.recordFailure();
      expect(ctrl.isExhausted).toBe(true);
      expect(() => ctrl.recordFailure()).toThrow(GatewayError);
    });

    it('canRetry returns true for retriable codes when not exhausted', () => {
      expect(ctrl.canRetry(ErrorCode.CONNECTION_TIMEOUT)).toBe(true);
    });

    it('canRetry returns false for non-retriable codes', () => {
      expect(ctrl.canRetry(ErrorCode.AUTH_REQUIRED)).toBe(false);
    });

    it('canRetry returns false when exhausted', () => {
      ctrl.recordFailure();
      ctrl.recordFailure();
      ctrl.recordFailure();
      expect(ctrl.canRetry(ErrorCode.CONNECTION_TIMEOUT)).toBe(false);
    });

    it('reset clears state', () => {
      ctrl.recordFailure();
      ctrl.recordFailure();
      ctrl.reset();
      expect(ctrl.state.attempt).toBe(0);
      expect(ctrl.remainingAttempts).toBe(3);
    });
  });
});

// ── Request Tracker ──────────────────────────────────────────────────────────

describe('transport/RequestTracker', () => {
  let tracker: RequestTracker;

  beforeEach(() => {
    tracker = new RequestTracker();
  });

  it('tracks a new request', () => {
    const req = tracker.track('req-1', '{"test":true}');
    expect(req.id).toBe('req-1');
    expect(req.status).toBe(RequestStatus.PENDING);
    expect(req.idempotencyKey).toBeTruthy();
    expect(req.attemptCount).toBe(0);
  });

  it('generates unique idempotency keys', () => {
    const r1 = tracker.track('a', '{}');
    const r2 = tracker.track('b', '{}');
    expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey);
  });

  it('transitions through status lifecycle', () => {
    tracker.track('req-1', '{}');
    tracker.markSent('req-1');
    expect(tracker.get('req-1')!.status).toBe(RequestStatus.SENT);
    tracker.markAcknowledged('req-1');
    expect(tracker.get('req-1')!.status).toBe(RequestStatus.ACKNOWLEDGED);
  });

  it('marks failed and retrying', () => {
    tracker.track('req-1', '{}');
    tracker.markSent('req-1');
    tracker.markFailed('req-1');
    expect(tracker.get('req-1')!.status).toBe(RequestStatus.FAILED);
    tracker.markRetrying('req-1');
    expect(tracker.get('req-1')!.status).toBe(RequestStatus.RETRYING);
  });

  it('getPendingRetry returns pending and retrying requests', () => {
    tracker.track('a', '{}');
    tracker.track('b', '{}');
    tracker.track('c', '{}');
    tracker.markSent('b');
    tracker.markAcknowledged('b');
    tracker.markRetrying('c');
    const pending = tracker.getPendingRetry();
    expect(pending.map(r => r.id).sort()).toEqual(['a', 'c']);
  });

  it('getUnacknowledged excludes acknowledged', () => {
    tracker.track('a', '{}');
    tracker.track('b', '{}');
    tracker.markSent('a');
    tracker.markAcknowledged('a');
    expect(tracker.getUnacknowledged()).toHaveLength(1);
    expect(tracker.getUnacknowledged()[0].id).toBe('b');
  });

  it('throws on unknown request id', () => {
    expect(() => tracker.markSent('unknown')).toThrow(GatewayError);
  });

  it('remove deletes a request', () => {
    tracker.track('a', '{}');
    tracker.remove('a');
    expect(tracker.get('a')).toBeUndefined();
  });

  it('clear removes all requests', () => {
    tracker.track('a', '{}');
    tracker.track('b', '{}');
    tracker.clear();
    expect(tracker.getUnacknowledged()).toHaveLength(0);
  });
});

// ── Idempotency Key ──────────────────────────────────────────────────────────

describe('transport/generateIdempotencyKey', () => {
  it('generates a UUID v4 format string', () => {
    const key = generateIdempotencyKey();
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(key).toMatch(uuidV4Regex);
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateIdempotencyKey()));
    expect(keys.size).toBe(100);
  });
});

// ── Stream Recovery ──────────────────────────────────────────────────────────

describe('transport/StreamRecoveryPoint', () => {
  let recovery: StreamRecoveryPoint;

  beforeEach(() => {
    recovery = new StreamRecoveryPoint();
  });

  it('starts with null checkpoint', () => {
    expect(recovery.checkpoint).toBeNull();
  });

  it('updates checkpoint', () => {
    recovery.update('req-1', 5, 1024, 'chunk-5');
    expect(recovery.checkpoint).not.toBeNull();
    expect(recovery.checkpoint!.lastChunkIndex).toBe(5);
    expect(recovery.checkpoint!.bytesReceived).toBe(1024);
    expect(recovery.checkpoint!.lastChunkId).toBe('chunk-5');
  });

  it('returns resume position after checkpoint', () => {
    recovery.update('req-1', 5, 1024);
    expect(recovery.getResumePosition('req-1')).toBe(6);
  });

  it('returns 0 for unknown request', () => {
    expect(recovery.getResumePosition('unknown')).toBe(0);
  });

  it('returns 0 when no checkpoint', () => {
    expect(recovery.getResumePosition('req-1')).toBe(0);
  });

  it('clear resets checkpoint', () => {
    recovery.update('req-1', 5, 1024);
    recovery.clear();
    expect(recovery.checkpoint).toBeNull();
    expect(recovery.getResumePosition('req-1')).toBe(0);
  });
});

// ── Proxy Helpers ────────────────────────────────────────────────────────────

describe('transport/proxy', () => {
  it('buildProxyUrl without auth', () => {
    const url = buildProxyUrl({ host: 'proxy.example.com', port: 8080 });
    expect(url).toBe('http://proxy.example.com:8080');
  });

  it('buildProxyUrl with auth', () => {
    const url = buildProxyUrl({
      host: 'proxy.example.com',
      port: 8080,
      auth: { username: 'user', password: 'pass' },
    });
    expect(url).toBe('http://user:pass@proxy.example.com:8080');
  });

  it('buildProxyUrl with https protocol', () => {
    const url = buildProxyUrl({ host: 'proxy.example.com', port: 443, protocol: 'https' });
    expect(url).toBe('https://proxy.example.com:443');
  });

  it('buildProxyAuthHeader returns Basic auth header', () => {
    const header = buildProxyAuthHeader({ username: 'user', password: 'pass' });
    expect(header).toBe(`Basic ${Buffer.from('user:pass', 'utf-8').toString('base64')}`);
  });
});

// ── MockConnection ───────────────────────────────────────────────────────────

describe('transport/MockConnection', () => {
  let conn: MockConnection;
  let mockNet: MockNetworkStack;

  beforeEach(() => {
    mockNet = new MockNetworkStack();
    conn = new MockConnection(
      { ...DEFAULT_CONNECTION_CONFIG, url: 'https://api.example.com/v1' },
      mockNet,
    );
  });

  it('starts in DISCONNECTED state', () => {
    expect(conn.state).toBe(ConnectionState.DISCONNECTED);
  });

  it('connect transitions to CONNECTED', async () => {
    await conn.connect();
    expect(conn.state).toBe(ConnectionState.CONNECTED);
  });

  it('disconnect transitions to DISCONNECTED', async () => {
    await conn.connect();
    conn.disconnect('test');
    expect(conn.state).toBe(ConnectionState.DISCONNECTED);
  });

  it('send delivers data and notifies listeners', async () => {
    const received: string[] = [];
    mockNet.setHandler(async () => ({
      statusCode: 200,
      headers: {},
      body: '{"result":"ok"}',
    }));

    await conn.connect();
    conn.onData((_requestId, data) => received.push(data));
    await conn.send('req-1', '{"prompt":"hello"}');

    expect(received).toEqual(['{"result":"ok"}']);
    expect(conn.tracker.get('req-1')!.status).toBe(RequestStatus.ACKNOWLEDGED);
  });

  it('exposes tracker for request tracking', async () => {
    mockNet.setHandler(async () => ({
      statusCode: 200,
      headers: {},
      body: '{}',
    }));
    await conn.connect();
    await conn.send('req-1', '{"test":true}');
    const tracked = conn.tracker.get('req-1');
    expect(tracked).toBeDefined();
    expect(tracked!.status).toBe(RequestStatus.ACKNOWLEDGED);
  });

  it('onError subscribes and unsubscribes', () => {
    const errors: GatewayError[] = [];
    const unsub = conn.onError((_requestId, e) => errors.push(e));
    expect(typeof unsub).toBe('function');
    unsub(); // should not throw
  });

  it('honours maxRetries and rejects instead of recursively reconnecting forever', async () => {
    let calls = 0;
    mockNet.setHandler(async () => {
      calls++;
      throw new GatewayError(ErrorCode.CONNECTION_TIMEOUT, 'simulated timeout');
    });
    conn = new MockConnection(
      {
        ...DEFAULT_CONNECTION_CONFIG,
        url: 'https://api.example.com/v1',
        totalTimeoutMs: 1000,
        retry: {
          initialDelayMs: 1,
          maxDelayMs: 1,
          maxRetries: 1,
          backoffMultiplier: 1,
        },
      },
      mockNet,
    );
    await conn.connect();

    await expect(conn.send('req-bounded', '{}')).rejects.toMatchObject({
      code: ErrorCode.GATEWAY_UNREACHABLE,
    });
    expect(calls).toBe(2);
  });

  it('cancels an in-flight request', async () => {
    mockNet.setHandler(async (_url, options) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(new GatewayError(ErrorCode.REQUEST_CANCELLED, 'cancelled by test'));
      }, { once: true });
    }));
    await conn.connect();

    const pending = conn.send('req-cancel', '{}');
    conn.cancel('req-cancel');
    await expect(pending).rejects.toMatchObject({ code: ErrorCode.REQUEST_CANCELLED });
  });
});
