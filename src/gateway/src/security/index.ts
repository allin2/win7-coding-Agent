// TLS config, credential management, data sanitization

import { ErrorCode, GatewayError } from '../types';

// ── TLS Configuration ────────────────────────────────────────────────────────

export enum TLSVersion {
  TLS_1_0 = 'TLSv1.0',
  TLS_1_1 = 'TLSv1.1',
  TLS_1_2 = 'TLSv1.2',
  TLS_1_3 = 'TLSv1.3',
}

/**
 * Numeric ordering for TLS versions (higher = more secure).
 */
const TLS_VERSION_RANK: Record<TLSVersion, number> = {
  [TLSVersion.TLS_1_0]: 0,
  [TLSVersion.TLS_1_1]: 1,
  [TLSVersion.TLS_1_2]: 2,
  [TLSVersion.TLS_1_3]: 3,
};

export interface TLSConfig {
  /** Path to CA bundle file for custom certificate verification. */
  caBundle?: string;
  /** Whether to verify server certificates (default: true — fail-closed). */
  verifyCertificate: boolean;
  /** Minimum acceptable TLS version (default: TLS 1.2). */
  minTLSVersion: TLSVersion;
}

/**
 * Create a default TLS config that is secure by default (fail-closed).
 */
export function defaultTLSConfig(): TLSConfig {
  return {
    verifyCertificate: true,
    minTLSVersion: TLSVersion.TLS_1_2,
  };
}

/**
 * Validate a TLS configuration.
 * Throws GatewayError(TLS_VERIFY_FAILED) on invalid config — fail-closed.
 * Never allows downgrade to plaintext.
 */
export function validateTLSConfig(config: TLSConfig): TLSConfig {
  if (!config) {
    throw new GatewayError(
      ErrorCode.TLS_VERIFY_FAILED,
      'TLS config is null or undefined — refusing connection',
    );
  }

  // verifyCertificate must be explicitly true; undefined/null/false → fail-closed
  if (config.verifyCertificate !== true) {
    throw new GatewayError(
      ErrorCode.TLS_VERIFY_FAILED,
      'TLS certificate verification is disabled — refusing connection (fail-closed)',
    );
  }

  // minTLSVersion must be TLS 1.2 or higher
  const minRank = TLS_VERSION_RANK[config.minTLSVersion];
  if (minRank === undefined) {
    throw new GatewayError(
      ErrorCode.TLS_VERIFY_FAILED,
      `Unknown TLS version: ${config.minTLSVersion}`,
    );
  }

  const tls12Rank = TLS_VERSION_RANK[TLSVersion.TLS_1_2];
  if (minRank < tls12Rank) {
    throw new GatewayError(
      ErrorCode.TLS_VERIFY_FAILED,
      `Minimum TLS version ${config.minTLSVersion} is below TLS 1.2 — refusing connection`,
    );
  }

  // caBundle path, if provided, must be a non-empty string
  if (config.caBundle !== undefined && config.caBundle !== null) {
    if (typeof config.caBundle !== 'string' || config.caBundle.trim().length === 0) {
      throw new GatewayError(
        ErrorCode.TLS_VERIFY_FAILED,
        'CA bundle path must be a non-empty string when provided',
      );
    }
  }

  return config;
}

// ── Credential Management ────────────────────────────────────────────────────

export interface ProxyCredentials {
  username: string;
  password: string;
}

/**
 * Credential store interface.
 * Implementations: InMemoryCredentialStore (prototype), DPAPICredentialStore (Win7 phase).
 */
export interface CredentialStore {
  /** Retrieve the API key, or undefined if not set. */
  getApiKey(): string | undefined;
  /** Store an API key in memory. */
  setApiKey(key: string): void;
  /** Retrieve proxy credentials, or undefined if not set. */
  getProxyCredentials(): ProxyCredentials | undefined;
  /** Store proxy credentials. */
  setProxyCredentials(creds: ProxyCredentials): void;
  /** Clear all stored credentials. */
  clear(): void;
}

/**
 * In-memory credential store. Credentials are lost when the process exits.
 * No credentials are written to disk.
 */
export class InMemoryCredentialStore implements CredentialStore {
  private _apiKey?: string;
  private _proxyCreds?: ProxyCredentials;

  getApiKey(): string | undefined {
    return this._apiKey;
  }

  setApiKey(key: string): void {
    if (
      typeof key !== 'string' ||
      key.length === 0 ||
      key.length > 8192 ||
      /[\r\n\0]/.test(key)
    ) {
      throw new GatewayError(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'API key must be non-empty, bounded and free of control characters',
      );
    }
    this._apiKey = key;
  }

  getProxyCredentials(): ProxyCredentials | undefined {
    return this._proxyCreds;
  }

  setProxyCredentials(creds: ProxyCredentials): void {
    if (!creds || typeof creds.username !== 'string' || typeof creds.password !== 'string') {
      throw new GatewayError(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Proxy credentials must include username and password');
    }
    this._proxyCreds = { username: creds.username, password: creds.password };
  }

  clear(): void {
    this._apiKey = undefined;
    this._proxyCreds = undefined;
  }
}

// ── Data Sanitization / Redaction ────────────────────────────────────────────

/** Patterns that look like API keys (sk-..., key-..., bearer tokens, etc.) */
const API_KEY_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /key-[a-zA-Z0-9]{20,}/g,
  /api[_-]?key["']?\s*[:=]\s*["']?([a-zA-Z0-9]{16,})/gi,
  /bearer\s+([a-zA-Z0-9\-._~+/]+=*)/gi,
];

/** Fields in objects whose names suggest sensitive content. */
const SENSITIVE_FIELD_NAMES = new Set([
  'apikey', 'api_key', 'api-key',
  'password', 'passwd', 'pwd', 'secret',
  'token', 'access_token', 'accessToken',
  'authorization', 'auth',
  'proxy_password', 'proxyPassword',
  'credential', 'credentials',
]);

/**
 * Redact an API key: show only the first 4 characters followed by `***`.
 */
export function redactApiKey(value: string): string {
  if (typeof value !== 'string' || value.length <= 4) {
    return '***';
  }
  return value.slice(0, 4) + '***';
}

/**
 * Redact a single string value if it looks like an API key.
 */
function redactIfSecret(value: string): string {
  for (const pattern of API_KEY_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      pattern.lastIndex = 0;
      return value.replace(pattern, (match) => redactApiKey(match));
    }
  }
  return value;
}

/**
 * Check if a field name is considered sensitive.
 */
function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_FIELD_NAMES.has(name.toLowerCase());
}

/**
 * Deep-redact an object, replacing sensitive field values with redacted forms.
 */
function redactObject(obj: unknown, depth: number = 0): unknown {
  if (depth > 10) return '[max depth]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactIfSecret(obj);
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveFieldName(key)) {
      if (typeof value === 'string') {
        result[key] = redactApiKey(value);
      } else {
        result[key] = '[REDACTED]';
      }
    } else {
      result[key] = redactObject(value, depth + 1);
    }
  }
  return result;
}

/**
 * Configuration for sanitization behavior.
 */
export interface SanitizeConfig {
  /** Whether to redact user prompt content in logs (default: true). */
  redactPromptContent: boolean;
}

const DEFAULT_SANITIZE_CONFIG: SanitizeConfig = {
  redactPromptContent: true,
};

/**
 * Sanitize data for logging.
 * - Redacts API keys, credentials, proxy passwords.
 * - Optionally redacts user prompt content.
 * - Returns a new object; does not mutate the input.
 */
export function sanitizeForLog(data: unknown, config: SanitizeConfig = DEFAULT_SANITIZE_CONFIG): unknown {
  if (typeof data === 'string') {
    let result = redactIfSecret(data);
    if (config.redactPromptContent) {
      // For prompt-like strings over 100 chars, truncate and mark
      if (result.length > 200) {
        result = result.slice(0, 100) + '...[REDACTED]';
      }
    }
    return result;
  }

  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const redacted = redactObject(data) as Record<string, unknown>;

  // If this looks like a model request, redact message content
  if (config.redactPromptContent && 'messages' in redacted && Array.isArray(redacted.messages)) {
    redacted.messages = (redacted.messages as Array<Record<string, unknown>>).map(msg => {
      const copy = { ...msg };
      if (typeof copy.content === 'string' && copy.content.length > 100) {
        copy.content = copy.content.slice(0, 50) + '...[REDACTED]';
      }
      return copy;
    });
  }

  return redacted;
}

/**
 * Sanitize data for audit logs.
 * Preserves structural fields (id, model, timestamp, finishReason, usage)
 * but redacts all sensitive content.
 */
export function sanitizeForAudit(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) {
    return { value: sanitizeForLog(data) };
  }

  const src = data as Record<string, unknown>;
  const audit: Record<string, unknown> = {};

  // Preserve non-sensitive structural fields
  const preservedKeys = [
    'id', 'requestId', 'model', 'timestamp', 'finishReason',
    'usage', 'type', 'statusCode', 'attemptCount',
  ];

  for (const key of preservedKeys) {
    if (key in src) {
      audit[key] = src[key];
    }
  }

  // Redact everything else
  const redacted = redactObject(src) as Record<string, unknown>;
  for (const [key, value] of Object.entries(redacted)) {
    if (!(key in audit)) {
      audit[key] = value;
    }
  }

  // Add audit metadata
  audit._auditTimestamp = Date.now();
  audit._sanitized = true;

  return audit;
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export { ErrorCode, GatewayError } from '../types';
