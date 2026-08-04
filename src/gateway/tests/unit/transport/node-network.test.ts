import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  NodeNetworkStack,
  NodeNetworkStackConfig,
  DEFAULT_NODE_NETWORK_CONFIG,
  mapNodeError,
  loadCaBundle,
} from '../../../src/transport/node-network';
import { ErrorCode, GatewayError } from '../../../src/types';

// ── Error Mapping ────────────────────────────────────────────────────────────

describe('transport/NodeNetworkStack error mapping', () => {
  it('maps ETIMEDOUT to CONNECTION_TIMEOUT', () => {
    const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.CONNECTION_TIMEOUT);
    expect(gwErr.message).toContain('timed out');
  });

  it('maps ESOCKETTIMEDOUT to CONNECTION_TIMEOUT', () => {
    const err = Object.assign(new Error('socket timed out'), { code: 'ESOCKETTIMEDOUT' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.CONNECTION_TIMEOUT);
  });

  it('maps ECONNREFUSED to CONNECTION_REFUSED', () => {
    const err = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.CONNECTION_REFUSED);
  });

  it('maps CERT_HAS_EXPIRED to TLS_VERIFY_FAILED', () => {
    const err = Object.assign(new Error('expired'), { code: 'CERT_HAS_EXPIRED' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.TLS_VERIFY_FAILED);
    expect(gwErr.message).toContain('CERT_HAS_EXPIRED');
  });

  it('maps UNABLE_TO_VERIFY_LEAF_SIGNATURE to TLS_VERIFY_FAILED', () => {
    const err = Object.assign(new Error('leaf'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.TLS_VERIFY_FAILED);
  });

  it('maps UNABLE_TO_GET_ISSUER_CERTIFICATE to TLS_VERIFY_FAILED', () => {
    const err = Object.assign(new Error('issuer'), { code: 'UNABLE_TO_GET_ISSUER_CERTIFICATE' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.TLS_VERIFY_FAILED);
  });

  it('maps ERR_TLS_CERT_ALTNAME_INVALID to TLS_VERIFY_FAILED', () => {
    const err = Object.assign(new Error('altname'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.TLS_VERIFY_FAILED);
  });

  it('maps ECONNRESET to STREAM_INTERRUPTED', () => {
    const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.STREAM_INTERRUPTED);
  });

  it('maps EPIPE to STREAM_INTERRUPTED', () => {
    const err = Object.assign(new Error('pipe'), { code: 'EPIPE' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.STREAM_INTERRUPTED);
  });

  it('maps ENOTFOUND to CONNECTION_REFUSED', () => {
    const err = Object.assign(new Error('dns'), { code: 'ENOTFOUND' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.CONNECTION_REFUSED);
    expect(gwErr.message).toContain('DNS');
  });

  it('maps unknown error code to INTERNAL_ERROR', () => {
    const err = Object.assign(new Error('weird'), { code: 'EWEIRD' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(gwErr.message).toContain('EWEIRD');
  });

  it('maps error without code to INTERNAL_ERROR', () => {
    const err = new Error('no code');
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(gwErr.message).toContain('UNKNOWN');
  });
});

// ── CA Bundle Loading ────────────────────────────────────────────────────────

describe('transport/NodeNetworkStack CA bundle', () => {
  let tmpFile: string;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  it('loadCaBundle returns undefined for no path', () => {
    expect(loadCaBundle(undefined)).toBeUndefined();
    expect(loadCaBundle('')).toBeUndefined();
  });

  it('loadCaBundle reads a PEM file', () => {
    tmpFile = path.join(os.tmpdir(), `test-ca-${Date.now()}.pem`);
    fs.writeFileSync(tmpFile, '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n', 'utf-8');
    const ca = loadCaBundle(tmpFile);
    expect(ca).toBeInstanceOf(Buffer);
    expect(ca!.toString('utf-8')).toContain('BEGIN CERTIFICATE');
  });

  it('loadCaBundle throws GatewayError for missing file', () => {
    expect(() => loadCaBundle('/nonexistent/ca.pem')).toThrow(GatewayError);
    try {
      loadCaBundle('/nonexistent/ca.pem');
    } catch (e) {
      expect((e as GatewayError).code).toBe(ErrorCode.INTERNAL_ERROR);
      expect((e as GatewayError).message).toContain('Failed to read CA bundle');
    }
  });
});

// ── Configuration ────────────────────────────────────────────────────────────

describe('transport/NodeNetworkStack configuration', () => {
  it('uses default config when none provided', () => {
    const stack = new NodeNetworkStack();
    expect(stack.name).toBe('node-https');
    expect(stack.config.rejectUnauthorized).toBe(true);
    expect(stack.config.minTLSVersion).toBe('TLSv1.2');
    expect(stack.config.timeout).toBe(30_000);
    expect(stack.config.maxResponseSize).toBe(10 * 1024 * 1024);
    expect(stack.config.caBundlePath).toBeUndefined();
    expect(stack.config.proxy).toBeUndefined();
  });

  it('merges partial config with defaults', () => {
    const stack = new NodeNetworkStack({ timeout: 5000 });
    expect(stack.config.timeout).toBe(5000);
    expect(stack.config.rejectUnauthorized).toBe(true);
    expect(stack.config.minTLSVersion).toBe('TLSv1.2'); // default preserved
  });

  it('refuses disabled certificate validation and TLS below 1.2', () => {
    expect(() => new NodeNetworkStack({ rejectUnauthorized: false })).toThrow(GatewayError);
    expect(() => new NodeNetworkStack({ minTLSVersion: 'TLSv1.0' })).toThrow(GatewayError);
  });

  it('loads CA bundle from config', () => {
    const tmpFile = path.join(os.tmpdir(), `test-ca-cfg-${Date.now()}.pem`);
    fs.writeFileSync(tmpFile, '-----BEGIN CERTIFICATE-----\nCFG\n-----END CERTIFICATE-----\n', 'utf-8');
    try {
      const stack = new NodeNetworkStack({ caBundlePath: tmpFile });
      expect(stack.ca).toBeInstanceOf(Buffer);
      expect(stack.ca!.toString('utf-8')).toContain('BEGIN CERTIFICATE');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('setCaBundle replaces CA at runtime', () => {
    const stack = new NodeNetworkStack();
    expect(stack.ca).toBeUndefined();
    const buf = Buffer.from('test-ca-data', 'utf-8');
    stack.setCaBundle(buf);
    expect(stack.ca).toBe(buf);
    stack.setCaBundle(undefined);
    expect(stack.ca).toBeUndefined();
  });
});

// ── Transport policy ─────────────────────────────────────────────────────────

describe('transport/NodeNetworkStack HTTP(S) policy', () => {
  it('accepts HTTP and reports ordinary connection failures', async () => {
    const stack = new NodeNetworkStack();
    await expect(stack.request('http://127.0.0.1:1', {
      method: 'GET',
      headers: {},
      timeoutMs: 200,
      maxResponseSizeBytes: 1024,
      encoding: 'utf-8',
    })).rejects.not.toMatchObject({ code: ErrorCode.TLS_VERIFY_FAILED });
  });

  it('rejects unsupported schemes before opening a socket', async () => {
    const stack = new NodeNetworkStack();
    await expect(stack.request('ftp://127.0.0.1:1', {
      method: 'GET',
      headers: {},
      timeoutMs: 200,
      maxResponseSizeBytes: 1024,
      encoding: 'utf-8',
    })).rejects.toMatchObject({ code: ErrorCode.TLS_VERIFY_FAILED });
  });

  it('maps a refused HTTPS endpoint to a structured connection error', async () => {
    const stack = new NodeNetworkStack();
    await expect(stack.request('https://127.0.0.1:1', {
      method: 'GET',
      headers: {},
      timeoutMs: 200,
      maxResponseSizeBytes: 1024,
      encoding: 'utf-8',
    })).rejects.toMatchObject({ code: expect.any(Number) });
  });
});

// ── Proxy Configuration ──────────────────────────────────────────────────────

describe('transport/NodeNetworkStack proxy', () => {
  it('stores proxy config from constructor', () => {
    const stack = new NodeNetworkStack({
      proxy: { host: 'proxy.example.com', port: 8080 },
    });
    expect(stack.config.proxy).toBeDefined();
    expect(stack.config.proxy!.host).toBe('proxy.example.com');
    expect(stack.config.proxy!.port).toBe(8080);
  });

  it('builds proxy authorization without exposing credentials in the URL', () => {
    const { buildProxyAuthHeader } = require('../../../src/transport');
    expect(buildProxyAuthHeader({ username: 'user', password: 'secret' })).toBe(
      'Basic dXNlcjpzZWNyZXQ=',
    );
  });
});
