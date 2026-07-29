import * as http from 'http';
import * as https from 'https';
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

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a local HTTP server for testing. Returns the server and its URL.
 */
function createTestServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ server: http.Server; url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        server,
        url,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on('error', reject);
  });
}

/**
 * Create a self-signed certificate + key for HTTPS test server.
 */
function createSelfSignedCert(): { key: string; cert: string } {
  // Use Node.js crypto to generate a self-signed cert
  // For testing, we'll use a pre-generated minimal cert pair
  // Actually, we'll skip HTTPS server tests and focus on HTTP + unit tests
  // since self-signed cert generation requires native modules
  throw new Error('Not used in this test suite');
}

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

  it('maps ECONNRESET to CONNECTION_TIMEOUT', () => {
    const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.CONNECTION_TIMEOUT);
  });

  it('maps EPIPE to CONNECTION_TIMEOUT', () => {
    const err = Object.assign(new Error('pipe'), { code: 'EPIPE' });
    const gwErr = mapNodeError(err);
    expect(gwErr.code).toBe(ErrorCode.CONNECTION_TIMEOUT);
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
    const stack = new NodeNetworkStack({ timeout: 5000, rejectUnauthorized: false });
    expect(stack.config.timeout).toBe(5000);
    expect(stack.config.rejectUnauthorized).toBe(false);
    expect(stack.config.minTLSVersion).toBe('TLSv1.2'); // default preserved
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

// ── Integration Tests (HTTP mock server) ─────────────────────────────────────

describe('transport/NodeNetworkStack integration (HTTP)', () => {
  let testServer: { server: http.Server; url: string; close: () => Promise<void> } | null = null;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('performs a GET request and returns response', async () => {
    testServer = await createTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ method: req.method, url: req.url }));
    });

    const stack = new NodeNetworkStack({ rejectUnauthorized: false });
    const resp = await stack.request(testServer.url + '/test?q=1', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeoutMs: 5000,
      maxResponseSizeBytes: 1024 * 1024,
      encoding: 'utf-8',
    });

    expect(resp.statusCode).toBe(200);
    expect(resp.headers['content-type']).toContain('application/json');
    const body = JSON.parse(resp.body);
    expect(body.method).toBe('GET');
    expect(body.url).toBe('/test?q=1');
  });

  it('performs a POST request with body', async () => {
    let receivedBody = '';
    testServer = await createTestServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks).toString('utf-8');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      });
    });

    const stack = new NodeNetworkStack();
    const resp = await stack.request(testServer.url + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: '{"prompt":"hello"}',
      timeoutMs: 5000,
      maxResponseSizeBytes: 1024 * 1024,
      encoding: 'utf-8',
    });

    expect(resp.statusCode).toBe(200);
    expect(resp.body).toBe('ok');
    expect(receivedBody).toBe('{"prompt":"hello"}');
  });

  it('handles non-200 status codes', async () => {
    testServer = await createTestServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    });

    const stack = new NodeNetworkStack();
    const resp = await stack.request(testServer.url + '/missing', {
      method: 'GET',
      headers: {},
      timeoutMs: 5000,
      maxResponseSizeBytes: 1024 * 1024,
      encoding: 'utf-8',
    });

    expect(resp.statusCode).toBe(404);
    expect(resp.body).toBe('not found');
  });

  it('handles 500 status codes', async () => {
    testServer = await createTestServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"internal"}');
    });

    const stack = new NodeNetworkStack();
    const resp = await stack.request(testServer.url + '/error', {
      method: 'GET',
      headers: {},
      timeoutMs: 5000,
      maxResponseSizeBytes: 1024 * 1024,
      encoding: 'utf-8',
    });

    expect(resp.statusCode).toBe(500);
    const body = JSON.parse(resp.body);
    expect(body.error).toBe('internal');
  });

  it('rejects on connection refused (bad port)', async () => {
    // Use a port that's not listening
    const stack = new NodeNetworkStack();
    await expect(
      stack.request('http://127.0.0.1:1', {
        method: 'GET',
        headers: {},
        timeoutMs: 2000,
        maxResponseSizeBytes: 1024,
        encoding: 'utf-8',
      }),
    ).rejects.toThrow(GatewayError);

    try {
      await stack.request('http://127.0.0.1:1', {
        method: 'GET',
        headers: {},
        timeoutMs: 2000,
        maxResponseSizeBytes: 1024,
        encoding: 'utf-8',
      });
    } catch (e) {
      expect((e as GatewayError).code).toBe(ErrorCode.CONNECTION_REFUSED);
    }
  });

  it('rejects on DNS lookup failure', async () => {
    const stack = new NodeNetworkStack();
    await expect(
      stack.request('http://this-host-does-not-exist-zzzzz.invalid/path', {
        method: 'GET',
        headers: {},
        timeoutMs: 5000,
        maxResponseSizeBytes: 1024,
        encoding: 'utf-8',
      }),
    ).rejects.toThrow(GatewayError);

    try {
      await stack.request('http://this-host-does-not-exist-zzzzz.invalid/path', {
        method: 'GET',
        headers: {},
        timeoutMs: 5000,
        maxResponseSizeBytes: 1024,
        encoding: 'utf-8',
      });
    } catch (e) {
      const gwErr = e as GatewayError;
      // Could be CONNECTION_REFUSED (ENOTFOUND), CONNECTION_TIMEOUT, or INTERNAL_ERROR depending on DNS
      expect([ErrorCode.CONNECTION_REFUSED, ErrorCode.CONNECTION_TIMEOUT, ErrorCode.INTERNAL_ERROR]).toContain(gwErr.code);
    }
  });
});

// ── Timeout Handling ─────────────────────────────────────────────────────────

describe('transport/NodeNetworkStack timeout', () => {
  let testServer: { server: http.Server; url: string; close: () => Promise<void> } | null = null;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('rejects with CONNECTION_TIMEOUT when server is slow', async () => {
    testServer = await createTestServer((_req, res) => {
      // Never respond — let the timeout fire
      setTimeout(() => {
        try {
          res.writeHead(200);
          res.end('late');
        } catch {
          // ignore if socket already destroyed
        }
      }, 10_000);
    });

    const stack = new NodeNetworkStack();
    await expect(
      stack.request(testServer.url + '/slow', {
        method: 'GET',
        headers: {},
        timeoutMs: 200,
        maxResponseSizeBytes: 1024,
        encoding: 'utf-8',
      }),
    ).rejects.toThrow(GatewayError);

    try {
      await stack.request(testServer.url + '/slow', {
        method: 'GET',
        headers: {},
        timeoutMs: 200,
        maxResponseSizeBytes: 1024,
        encoding: 'utf-8',
      });
    } catch (e) {
      expect((e as GatewayError).code).toBe(ErrorCode.CONNECTION_TIMEOUT);
      expect((e as GatewayError).message).toContain('timed out');
    }
  });
});

// ── Response Size Limit ──────────────────────────────────────────────────────

describe('transport/NodeNetworkStack response size limit', () => {
  let testServer: { server: http.Server; url: string; close: () => Promise<void> } | null = null;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('rejects when response exceeds max size', async () => {
    testServer = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      // Send 10KB of data
      const data = Buffer.alloc(10 * 1024, 'A');
      res.end(data);
    });

    const stack = new NodeNetworkStack();
    await expect(
      stack.request(testServer.url + '/big', {
        method: 'GET',
        headers: {},
        timeoutMs: 5000,
        maxResponseSizeBytes: 1024, // only 1KB allowed
        encoding: 'utf-8',
      }),
    ).rejects.toThrow(GatewayError);

    try {
      await stack.request(testServer.url + '/big', {
        method: 'GET',
        headers: {},
        timeoutMs: 5000,
        maxResponseSizeBytes: 1024,
        encoding: 'utf-8',
      });
    } catch (e) {
      const gwErr = e as GatewayError;
      expect(gwErr.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(gwErr.message).toContain('exceeded maximum size');
    }
  });

  it('accepts response within size limit', async () => {
    testServer = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('small');
    });

    const stack = new NodeNetworkStack();
    const resp = await stack.request(testServer.url + '/small', {
      method: 'GET',
      headers: {},
      timeoutMs: 5000,
      maxResponseSizeBytes: 1024,
      encoding: 'utf-8',
    });

    expect(resp.statusCode).toBe(200);
    expect(resp.body).toBe('small');
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

  it('per-request proxy overrides stack-level proxy', async () => {
    // Set up two servers: one as "proxy", one as "origin"
    const proxyServer = await createTestServer((req, res) => {
      // Proxy just returns that it received the request
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('proxy-response');
    });

    try {
      const stack = new NodeNetworkStack({
        proxy: { host: '127.0.0.1', port: 1 }, // bad default proxy
      });

      // Override with good per-request proxy pointing to our test proxy
      const resp = await stack.request(proxyServer.url + '/target', {
        method: 'GET',
        headers: {},
        timeoutMs: 5000,
        maxResponseSizeBytes: 1024,
        encoding: 'utf-8',
        proxy: { host: '127.0.0.1', port: parseInt(proxyServer.url.split(':').pop()!) },
      });

      expect(resp.statusCode).toBe(200);
      expect(resp.body).toBe('proxy-response');
    } finally {
      await proxyServer.close();
    }
  });
});

// ── Headers Handling ─────────────────────────────────────────────────────────

describe('transport/NodeNetworkStack headers', () => {
  let testServer: { server: http.Server; url: string; close: () => Promise<void> } | null = null;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('sends custom headers and receives response headers', async () => {
    testServer = await createTestServer((req, res) => {
      res.writeHead(200, {
        'X-Custom-Response': 'from-server',
        'Content-Type': 'text/plain',
      });
      res.end(`x-custom-request:${req.headers['x-custom-request']}`);
    });

    const stack = new NodeNetworkStack();
    const resp = await stack.request(testServer.url + '/headers', {
      method: 'GET',
      headers: { 'X-Custom-Request': 'from-client' },
      timeoutMs: 5000,
      maxResponseSizeBytes: 1024,
      encoding: 'utf-8',
    });

    expect(resp.headers['x-custom-response']).toBe('from-server');
    expect(resp.body).toBe('x-custom-request:from-client');
  });

  it('normalizes response header keys to lowercase', async () => {
    testServer = await createTestServer((_req, res) => {
      res.writeHead(200, { 'X-UPPER-CASE': 'value' });
      res.end('');
    });

    const stack = new NodeNetworkStack();
    const resp = await stack.request(testServer.url + '/', {
      method: 'GET',
      headers: {},
      timeoutMs: 5000,
      maxResponseSizeBytes: 1024,
      encoding: 'utf-8',
    });

    expect(resp.headers['x-upper-case']).toBe('value');
  });
});

// ── UTF-8 Encoding ───────────────────────────────────────────────────────────

describe('transport/NodeNetworkStack UTF-8', () => {
  let testServer: { server: http.Server; url: string; close: () => Promise<void> } | null = null;

  afterEach(async () => {
    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it('correctly handles UTF-8 response bodies', async () => {
    testServer = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(Buffer.from('你好世界 — こんにちは', 'utf-8'));
    });

    const stack = new NodeNetworkStack();
    const resp = await stack.request(testServer.url + '/utf8', {
      method: 'GET',
      headers: {},
      timeoutMs: 5000,
      maxResponseSizeBytes: 1024,
      encoding: 'utf-8',
    });

    expect(resp.body).toBe('你好世界 — こんにちは');
  });

  it('correctly sends UTF-8 request bodies', async () => {
    let receivedBody = '';
    testServer = await createTestServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks).toString('utf-8');
        res.writeHead(200);
        res.end('ok');
      });
    });

    const stack = new NodeNetworkStack();
    await stack.request(testServer.url + '/utf8', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: '数据：你好',
      timeoutMs: 5000,
      maxResponseSizeBytes: 1024,
      encoding: 'utf-8',
    });

    expect(receivedBody).toBe('数据：你好');
  });
});
