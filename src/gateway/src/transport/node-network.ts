// Node.js built-in https implementation of INetworkStack

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as url from 'url';
import * as net from 'net';
import * as tls from 'tls';
import { Duplex } from 'stream';
import { StringDecoder } from 'string_decoder';
import {
  INetworkStack,
  NetworkRequestOptions,
  NetworkResponse,
  ProxyConfig,
  buildProxyAuthHeader,
} from './index';
import { ErrorCode, GatewayError } from '../types';

// ── Configuration ────────────────────────────────────────────────────────────

export interface NodeNetworkStackConfig {
  /** Path to a PEM-encoded CA bundle file for custom trust anchors. */
  caBundlePath?: string;
  /** Whether to reject unauthorized TLS certificates (default: true). */
  rejectUnauthorized: boolean;
  /** Minimum TLS version (default: 'TLSv1.2'). */
  minTLSVersion: string;
  /** Connection + response timeout in milliseconds. */
  timeout: number;
  /** Maximum response body size in bytes. */
  maxResponseSize: number;
  /** Optional HTTP proxy configuration. */
  proxy?: ProxyConfig;
}

export const DEFAULT_NODE_NETWORK_CONFIG: NodeNetworkStackConfig = {
  rejectUnauthorized: true,
  minTLSVersion: 'TLSv1.2',
  timeout: 30_000,
  maxResponseSize: 10 * 1024 * 1024, // 10 MB
};

// ── Error Mapping ────────────────────────────────────────────────────────────

/**
 * Map a Node.js system error code to the appropriate GatewayError.
 */
export function mapNodeError(err: Error & { code?: string }): GatewayError {
  const code = err.code ?? '';

  switch (code) {
    case 'ETIMEDOUT':
    case 'ESOCKETTIMEDOUT':
      return new GatewayError(
        ErrorCode.CONNECTION_TIMEOUT,
        `Connection timed out: ${err.message}`,
      );

    case 'ECONNREFUSED':
      return new GatewayError(
        ErrorCode.CONNECTION_REFUSED,
        `Connection refused: ${err.message}`,
      );

    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'UNABLE_TO_GET_ISSUER_CERTIFICATE':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return new GatewayError(
        ErrorCode.TLS_VERIFY_FAILED,
        `TLS verification failed (${code}): ${err.message}`,
      );

    case 'ECONNRESET':
    case 'EPIPE':
      return new GatewayError(
        ErrorCode.STREAM_INTERRUPTED,
        `Connection reset: ${err.message}`,
      );

    case 'ABORT_ERR':
      return new GatewayError(
        ErrorCode.REQUEST_CANCELLED,
        'Gateway request was cancelled',
      );

    case 'ENOTFOUND':
      return new GatewayError(
        ErrorCode.CONNECTION_REFUSED,
        `DNS lookup failed: ${err.message}`,
      );

    default:
      return new GatewayError(
        ErrorCode.INTERNAL_ERROR,
        `Network error (${code || 'UNKNOWN'}): ${err.message}`,
      );
  }
}

// ── CA Bundle Loading ────────────────────────────────────────────────────────

/**
 * Load a PEM CA bundle from disk. Returns undefined if no path is configured.
 * Throws GatewayError if the file cannot be read.
 */
export function loadCaBundle(caBundlePath?: string): Buffer | undefined {
  if (!caBundlePath) return undefined;
  try {
    return fs.readFileSync(caBundlePath);
  } catch (err) {
    throw new GatewayError(
      ErrorCode.INTERNAL_ERROR,
      `Failed to read CA bundle at "${caBundlePath}": ${(err as Error).message}`,
    );
  }
}

// ── TLS Version Mapping ──────────────────────────────────────────────────────

function mapMinTLSVersion(version: string): tls.SecureVersion {
  // Node.js tls module uses 'TLSv1.2', 'TLSv1.3' etc. as minVersion strings.
  return version as tls.SecureVersion;
}

// ── NodeNetworkStack ─────────────────────────────────────────────────────────

export class NodeNetworkStack implements INetworkStack {
  readonly name = 'node-https';

  private _config: NodeNetworkStackConfig;
  private _ca: Buffer | undefined;

  constructor(config: Partial<NodeNetworkStackConfig> = {}) {
    this._config = { ...DEFAULT_NODE_NETWORK_CONFIG, ...config };
    if (this._config.rejectUnauthorized !== true) {
      throw new GatewayError(
        ErrorCode.TLS_VERIFY_FAILED,
        'Node network stack cannot disable certificate verification',
      );
    }
    if (this._config.minTLSVersion !== 'TLSv1.2' && this._config.minTLSVersion !== 'TLSv1.3') {
      throw new GatewayError(
        ErrorCode.TLS_VERIFY_FAILED,
        `Minimum TLS version ${this._config.minTLSVersion} is below TLS 1.2`,
      );
    }
    this._ca = loadCaBundle(this._config.caBundlePath);
  }

  /**
   * Replace the CA bundle at runtime (useful for testing or hot reload).
   */
  setCaBundle(ca: Buffer | undefined): void {
    this._ca = ca;
  }

  /** Get the current effective config (for inspection/testing). */
  get config(): Readonly<NodeNetworkStackConfig> {
    return this._config;
  }

  /** Get the loaded CA buffer (for inspection/testing). */
  get ca(): Buffer | undefined {
    return this._ca;
  }

  /**
   * Perform an HTTP(S) request and return the full response body.
   */
  async request(reqUrl: string, options: NetworkRequestOptions): Promise<NetworkResponse> {
    const parsed = new url.URL(reqUrl);
    const isHttps = parsed.protocol === 'https:';

    // Merge proxy from per-request options or stack-level config
    const proxy = options.proxy ?? this._config.proxy;
    if (proxy?.protocol && proxy.protocol !== 'http') {
      throw new GatewayError(
        ErrorCode.GATEWAY_UNREACHABLE,
        `Proxy protocol ${proxy.protocol} is not supported by the Node HTTP CONNECT stack`,
      );
    }

    return new Promise<NetworkResponse>((resolve, reject) => {
      const timeoutMs = options.timeoutMs || this._config.timeout;
      const maxSize = options.maxResponseSizeBytes || this._config.maxResponseSize;

      let req: http.ClientRequest;

      if (proxy) {
        req = this._buildProxyRequest(parsed, options, proxy, isHttps, timeoutMs, maxSize, resolve, reject);
      } else {
        req = this._buildDirectRequest(parsed, options, isHttps, timeoutMs, maxSize, resolve, reject);
      }

      // Handle request-level errors
      req.on('error', (err: Error & { code?: string }) => {
        reject(err instanceof GatewayError ? err : mapNodeError(err));
      });

      const abort = (): void => {
        const abortError = new Error('Request aborted') as Error & { code?: string };
        abortError.code = 'ABORT_ERR';
        req.destroy(abortError);
      };
      if (options.signal?.aborted) {
        abort();
      } else if (options.signal) {
        options.signal.addEventListener('abort', abort, { once: true });
        req.once('close', () => options.signal?.removeEventListener('abort', abort));
      }

      // Write body if present
      if (options.body) {
        req.write(options.body, 'utf-8');
      }
      req.end();
    });
  }

  // ── Direct Request ───────────────────────────────────────────────────────

  private _buildDirectRequest(
    parsed: url.URL,
    options: NetworkRequestOptions,
    isHttps: boolean,
    timeoutMs: number,
    maxSize: number,
    resolve: (value: NetworkResponse) => void,
    reject: (reason: GatewayError) => void,
  ): http.ClientRequest {
    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method,
      headers: { ...options.headers },
      timeout: timeoutMs,
    };

    if (isHttps) {
      reqOptions.rejectUnauthorized = this._config.rejectUnauthorized;
      if (this._ca) {
        reqOptions.ca = this._ca;
      }
      reqOptions.minVersion = mapMinTLSVersion(this._config.minTLSVersion);
    }

    const transport = isHttps ? https : http;
    const req = transport.request(reqOptions);
    this._attachResponseHandler(req, resolve, reject, maxSize, timeoutMs, options.onData);
    return req;
  }

  // ── Proxy Request (HTTP CONNECT tunnel) ──────────────────────────────────

  private _buildProxyRequest(
    parsed: url.URL,
    options: NetworkRequestOptions,
    proxy: ProxyConfig,
    isHttps: boolean,
    timeoutMs: number,
    maxSize: number,
    resolve: (value: NetworkResponse) => void,
    reject: (reason: GatewayError) => void,
  ): http.ClientRequest {
    if (!isHttps) {
      // For plain HTTP through proxy, send absolute-form request to proxy
      return this._buildHttpProxyRequest(parsed, options, proxy, timeoutMs, maxSize, resolve, reject);
    }

    // HTTPS through proxy: use CONNECT tunnel
    const connectHeaders: Record<string, string> = {};
    if (proxy.auth) {
      connectHeaders['Proxy-Authorization'] = buildProxyAuthHeader(proxy.auth);
    }
    connectHeaders['Host'] = `${parsed.hostname}:${parsed.port || 443}`;

    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method,
      headers: { ...options.headers },
      timeout: timeoutMs,
      rejectUnauthorized: this._config.rejectUnauthorized,
      minVersion: mapMinTLSVersion(this._config.minTLSVersion),
      createConnection: (_opts: http.ClientRequestArgs, cb: (err: Error | null, socket: Duplex) => void): Duplex | null | undefined => {
        const connectReq = http.request({
          host: proxy.host,
          port: proxy.port,
          method: 'CONNECT',
          path: `${parsed.hostname}:${parsed.port || 443}`,
          headers: connectHeaders,
          timeout: timeoutMs,
        });

        connectReq.on('connect', (res, socket) => {
          if (res.statusCode !== 200) {
            socket.destroy();
            const code = res.statusCode === 407
              ? ErrorCode.PROXY_AUTH_FAILED
              : ErrorCode.GATEWAY_UNREACHABLE;
            cb(
              new GatewayError(code, `Proxy CONNECT failed with HTTP ${res.statusCode ?? 0}`),
              null as unknown as Duplex,
            );
            return;
          }
          cb(null, socket);
        });

        connectReq.on('error', (err: Error) => {
          cb(err, null as unknown as Duplex);
        });

        connectReq.on('timeout', () => {
          connectReq.destroy();
          cb(new GatewayError(ErrorCode.CONNECTION_TIMEOUT, 'Proxy CONNECT tunnel timed out'), null as unknown as Duplex);
        });

        connectReq.end();
        return undefined;
      },
    };

    if (this._ca) {
      reqOptions.ca = this._ca;
    }

    const req = https.request(reqOptions);
    this._attachResponseHandler(req, resolve, reject, maxSize, timeoutMs, options.onData);
    return req;
  }

  private _buildHttpProxyRequest(
    parsed: url.URL,
    options: NetworkRequestOptions,
    proxy: ProxyConfig,
    timeoutMs: number,
    maxSize: number,
    resolve: (value: NetworkResponse) => void,
    reject: (reason: GatewayError) => void,
  ): http.ClientRequest {
    const headers: Record<string, string> = {
      ...options.headers,
      Host: `${parsed.hostname}:${parsed.port || 80}`,
    };
    if (proxy.auth) {
      headers['Proxy-Authorization'] = buildProxyAuthHeader(proxy.auth);
    }

    const reqOptions: http.RequestOptions = {
      hostname: proxy.host,
      port: proxy.port,
      path: parsed.href,
      method: options.method,
      headers,
      timeout: timeoutMs,
    };

    const req = http.request(reqOptions);
    this._attachResponseHandler(req, resolve, reject, maxSize, timeoutMs, options.onData);
    return req;
  }

  // ── Response Handler ─────────────────────────────────────────────────────

  private _attachResponseHandler(
    req: http.ClientRequest,
    resolve: (value: NetworkResponse) => void,
    reject: (reason: GatewayError) => void,
    maxSize: number,
    timeoutMs: number,
    onData?: (chunk: string) => void,
  ): void {
    req.on('timeout', () => {
      req.destroy();
      reject(
        new GatewayError(
          ErrorCode.CONNECTION_TIMEOUT,
          `Request timed out after ${timeoutMs}ms`,
        ),
      );
    });

    req.on('response', (res: http.IncomingMessage) => {
      const chunks: Buffer[] = [];
      const decoder = new StringDecoder('utf8');
      let totalBytes = 0;
      let aborted = false;

      res.on('data', (chunk: Buffer) => {
        if (aborted) return;
        totalBytes += chunk.length;
        if (totalBytes > maxSize) {
          aborted = true;
          res.destroy();
          req.destroy();
          reject(
            new GatewayError(
              ErrorCode.INTERNAL_ERROR,
              `Response exceeded maximum size of ${maxSize} bytes (received ${totalBytes})`,
            ),
          );
          return;
        }
        if (onData) {
          const decoded = decoder.write(chunk);
          if (decoded.length > 0) onData(decoded);
        } else {
          chunks.push(chunk);
        }
      });

      res.on('end', () => {
        if (aborted) return;
        let body = '';
        if (onData) {
          const decodedRemainder = decoder.end();
          if (decodedRemainder.length > 0) onData(decodedRemainder);
        } else {
          body = Buffer.concat(chunks).toString('utf-8');
        }
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (value !== undefined) {
            headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
          }
        }
        resolve({
          statusCode: res.statusCode ?? 0,
          headers,
          body,
        });
      });

      res.on('error', (err: Error & { code?: string }) => {
        if (aborted) return;
        reject(mapNodeError(err));
      });
    });
  }
}
