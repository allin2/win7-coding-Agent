#!/usr/bin/env node

/**
 * Ephemeral, deterministic HTTP(S)/SSE fixture for A3 acceptance.
 * It is a build-host/acceptance tool only: no public listener, no model and
 * no credentials are persisted. The caller owns the temporary key/cert and
 * must delete them after the run.
 */
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const protocol = argument('--protocol=') || 'https';
const keyPath = argument('--key=');
const certPath = argument('--cert=');
const bind = argument('--bind=') || '127.0.0.1';
const port = Number(argument('--port=') || 0);
const mode = argument('--mode=') || 'normal';
const metricsPath = argument('--metrics=');
const protocolVersion = argument('--protocol-version=') || '0.1.0';
const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
void fixtureRoot;

if (protocol !== 'http' && protocol !== 'https') throw new Error(`Unsupported fixture protocol: ${protocol}`);
if (protocol === 'https' && (!keyPath || !certPath)) throw new Error('HTTPS fixture requires --key and --cert');
const certPem = certPath ? fs.readFileSync(certPath) : undefined;
const keyPem = keyPath ? fs.readFileSync(keyPath) : undefined;
const certFingerprint = certPem ? crypto.createHash('sha256').update(certPem).digest('hex') : null;
const metrics = [];
const requestHandler = (req, res) => {
  const socket = req.socket;
  const requestId = String(req.headers['x-request-id'] || 'missing');
  const startedAt = Date.now();
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end('{"error":"POST required"}');
    return;
  }
  const bodyChunks = [];
  let bodyBytes = 0;
  req.on('data', (chunk) => {
    bodyBytes += chunk.length;
    if (bodyBytes <= 1024 * 1024) bodyChunks.push(chunk);
  });
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(Buffer.concat(bodyChunks).toString('utf8')); } catch (_error) { /* provider will classify the response */ }
    const messages = payload.params && Array.isArray(payload.params.messages) ? payload.params.messages : [];
    const response = chooseResponse(messages, requestId, protocolVersion);
    const tlsProtocol = typeof socket.getProtocol === 'function' ? socket.getProtocol() : 'unknown';
    metrics.push({
      requestId,
      method: req.method,
      target: req.headers.host || '',
      tlsProtocol,
      mode,
      authorizationPresent: Boolean(req.headers.authorization),
      authorizationLogged: false,
      elapsedMs: Date.now() - startedAt,
    });
    writeMetrics();
    if (mode === 'delay') {
      const timer = setTimeout(() => sendSse(res, response), 2_000);
      req.on('close', () => clearTimeout(timer));
      return;
    }
    if (mode === 'truncated') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' });
      res.write('event: chunk\ndata: partial\n\n');
      res.write('event: done\ndata: [DONE]\n\n');
      res.write('event: chunk\ndata: truncated');
      res.end();
      return;
    }
    if (mode === 'protocol-mismatch') response.protocolVersion = '99.0.0';
    sendSse(res, response);
  });
};
const server = protocol === 'https'
  ? https.createServer({ key: keyPem, cert: certPem, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' }, requestHandler)
  : http.createServer(requestHandler);

server.listen(port, bind, () => {
  const address = server.address();
  const actualPort = address && typeof address !== 'string' ? address.port : port;
  process.stdout.write(`A3_FIXTURE_READY ${JSON.stringify({
    bind,
    port: actualPort,
    url: `${protocol}://${bind}:${actualPort}/v1`,
    tlsMin: protocol === 'https' ? 'TLSv1.2' : null,
    tlsMax: protocol === 'https' ? 'TLSv1.2' : null,
    caCertificateSha256: certFingerprint,
    metricsPath: metricsPath || null,
    mode,
  })}\n`);
});

function chooseResponse(messages, requestId, version) {
  const toolMessages = messages.filter((message) => message && message.role === 'tool');
  const toolNames = toolMessages.map((message) => toolNameFromToolMessage(message));
  if (!toolNames.includes('workspace.list_directory')) {
    return responseWithTool(requestId, version, 'workspace.list_directory', {});
  }
  if (!toolNames.includes('workspace.search_text')) {
    return responseWithTool(requestId, version, 'workspace.search_text', { pattern: 'function', contextLines: 1 });
  }
  if (!toolNames.includes('workspace.read_text')) {
    return responseWithTool(requestId, version, 'workspace.read_text', { path: 'sample.ts', startLine: 1, maxLines: 120 });
  }
  return {
    protocolVersion: version,
    id: requestId,
    result: {
      id: `response-${requestId}`,
      content: '受控 Gateway 已通过 Core 使用只读工具完成分析；此结果来自 A3 fixture，不代表真实模型。',
      finish_reason: 'stop',
    },
  };
}

function responseWithTool(requestId, version, name, args) {
  return {
    protocolVersion: version,
    id: requestId,
    result: {
      id: `response-${requestId}`,
      content: '',
      finish_reason: 'tool_calls',
      tool_calls: [{ id: `tool-${requestId}-${name}`, name, arguments: JSON.stringify(args) }],
    },
  };
}

function toolNameFromToolMessage(message) {
  try {
    const observation = JSON.parse(String(message.content || '{}'));
    const value = JSON.parse(String(observation.content || '{}'));
    return value.toolName || '';
  } catch (_error) {
    return '';
  }
}

function sendSse(res, response) {
  if (res.destroyed) return;
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'close',
  });
  const content = response.result && response.result.content;
  if (content) {
    const split = Math.max(1, Math.ceil(content.length / 2));
    res.write(`event: chunk\ndata: ${content.slice(0, split)}\n\n`);
    res.write(`event: chunk\ndata: ${content.slice(split)}\n\n`);
  }
  res.write(`event: done\ndata: ${JSON.stringify(response)}\n\n`);
  res.end();
}

function writeMetrics() {
  if (!metricsPath) return;
  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
  fs.writeFileSync(metricsPath, JSON.stringify({ schemaVersion: 1, metrics }, null, 2) + '\n', 'utf8');
}

function argument(prefix) {
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function required(prefix) {
  const value = argument(prefix);
  if (!value) throw new Error(`Missing ${prefix}<value>`);
  return value;
}

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
