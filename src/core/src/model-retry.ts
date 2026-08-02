/** Data-driven retry classification at the Core model boundary. */

export enum ModelRetryAction {
  RETRY = 'RETRY',
  FAIL = 'FAIL',
  COMPACT_CONTEXT = 'COMPACT_CONTEXT',
}

/**
 * Numeric values intentionally mirror the versioned Gateway error protocol
 * without importing its implementation package into Core.
 */
export const MODEL_RETRY_POLICY: Readonly<Record<number, ModelRetryAction>> = Object.freeze({
  100: ModelRetryAction.RETRY, // CONNECTION_TIMEOUT
  101: ModelRetryAction.RETRY, // CONNECTION_REFUSED
  102: ModelRetryAction.FAIL, // TLS_HANDSHAKE_FAILED
  103: ModelRetryAction.FAIL, // TLS_VERIFY_FAILED
  104: ModelRetryAction.RETRY, // GATEWAY_UNREACHABLE
  105: ModelRetryAction.RETRY, // STREAM_INTERRUPTED
  106: ModelRetryAction.FAIL, // REQUEST_CANCELLED
  200: ModelRetryAction.FAIL, // PROTOCOL_VERSION_MISMATCH
  201: ModelRetryAction.FAIL, // INVALID_FRAME
  202: ModelRetryAction.FAIL, // DECODE_ERROR
  203: ModelRetryAction.FAIL, // ENCODE_ERROR
  300: ModelRetryAction.FAIL, // AUTH_REQUIRED
  301: ModelRetryAction.FAIL, // AUTH_INVALID_CREDENTIALS
  302: ModelRetryAction.FAIL, // AUTH_EXPIRED
  303: ModelRetryAction.FAIL, // PROXY_AUTH_FAILED
  400: ModelRetryAction.RETRY, // RATE_LIMITED
  401: ModelRetryAction.RETRY, // INTERNAL_ERROR
  402: ModelRetryAction.FAIL, // MODEL_NOT_FOUND
  403: ModelRetryAction.COMPACT_CONTEXT, // CONTEXT_LENGTH_EXCEEDED
});

export type ModelRetryClassifier = (error: unknown) => ModelRetryAction;

export function classifyModelRetry(error: unknown): ModelRetryAction {
  if (!error || typeof error !== 'object') return ModelRetryAction.FAIL;
  const candidate = error as { code?: unknown; retryable?: unknown };
  if (typeof candidate.retryable === 'boolean') {
    return candidate.retryable ? ModelRetryAction.RETRY : ModelRetryAction.FAIL;
  }
  return typeof candidate.code === 'number'
    ? MODEL_RETRY_POLICY[candidate.code] ?? ModelRetryAction.FAIL
    : ModelRetryAction.FAIL;
}
