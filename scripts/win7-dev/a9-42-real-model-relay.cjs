'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { hash, noLinks } = require('./a9-42-office-journey.cjs');
const UPSTREAM = 'https://api.deepseek.com';
const need = (v, code) => { if (!v) throw new Error(code); };
function usageReader(sse) {
  let pending = '', length = 0, overflow = false, usage = null;
  const parse = text => {
    try { const p = JSON.parse(text); if (p.usage && typeof p.usage === 'object') {
      const tokens = {};
      for (const k of ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens']) {
        if (Number.isSafeInteger(p.usage[k]) && p.usage[k] >= 0) tokens[k] = p.usage[k];
      }
      if (Object.keys(tokens).length) usage = tokens;
    } } catch (_) { /* Usage is optional; content is never logged. */ }
  };
  // StringDecoder preserves JSON/SSE boundaries even inside a UTF-8 code point.
  const decoder = new (require('string_decoder').StringDecoder)('utf8');
  function append(text) {
    if (!sse) { length += Buffer.byteLength(text); if (length <= 2 * 1024 * 1024) pending += text; else { overflow = true; pending = ''; } return; }
    for (const part of text.split(/(?<=\n)/)) {
      if (!overflow) pending += part;
      if (pending.length > 65536) { overflow = true; pending = ''; }
      if (part.endsWith('\n')) { if (!overflow && pending.startsWith('data:')) parse(pending.slice(5).trim()); pending = ''; overflow = false; }
    }
  }
  return { push: b => append(decoder.write(b)), end: () => { append(decoder.end()); if (!overflow) { if (sse && pending.startsWith('data:')) parse(pending.slice(5).trim()); else if (!sse) parse(pending); } pending = ''; return usage; } };
}
function scanSecrets(value, secret, depth = 0) {
  if (depth > 32) return false;
  if (Buffer.isBuffer(value)) return scanSecrets(value.toString('utf8'), secret, depth + 1);
  if (typeof value === 'string') {
    // Boundary + key-length shape: ordinary words such as "disk-cache" or "task-stream" in
    // Chromium logs or model text must not halt a paid run. The exact key is matched above.
    if ((secret && value.includes(secret)) || /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_]{16,}/.test(value)) return false;
    if (/^\s*[\[{]/.test(value)) { try { return scanSecrets(JSON.parse(value), secret, depth + 1); } catch (_) { /* Plain text. */ } }
    return true;
  }
  if (value && typeof value === 'object') return Object.entries(value).every(([k, v]) => scanSecrets(k, secret, depth + 1) && scanSecrets(v, secret, depth + 1));
  return true;
}

function consumeKey(c, io = fs) {
  noLinks(c.run_root, c.api_key_file, io);
  const stat = io.lstatSync(c.api_key_file); need(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 512, 'SECRET_FILE_TYPE');
  const raw = io.readFileSync(c.api_key_file, 'utf8');
  io.unlinkSync(c.api_key_file); need(!io.existsSync(c.api_key_file), 'SECRET_FILE_DELETE_FAILED');
  const key = raw.trim(); need(key.length >= 8 && key.length <= 256 && /^[\x21-\x7e]+$/.test(key), 'SECRET_FORMAT');
  return { key, sha256: hash(key) };
}
// Injection is a FUNCTION ARGUMENT, never a config field. Only loopback HTTP is accepted for tests.
function startRelay(options, fakeUpstream) {
  need(Number.isInteger(options.limit) && options.limit >= 1 && options.limit <= 40, 'REAL_MODEL_LIMIT');
  let upstream = new URL(UPSTREAM);
  if (fakeUpstream !== undefined) { upstream = new URL(fakeUpstream); need(upstream.protocol === 'http:' && upstream.hostname === '127.0.0.1' && upstream.pathname === '/' && !upstream.search && !upstream.username && !upstream.password, 'TEST_UPSTREAM'); }
  const timeouts = Object.assign({ connect: 15000, firstByte: 60000, total: 180000 }, options.timeouts);
  for (const [key, max] of [['connect',15000],['firstByte',60000],['total',180000]]) need(Number.isInteger(timeouts[key]) && timeouts[key] > 0 && timeouts[key] <= max, 'RELAY_TIMEOUT');
  const state = { requests: 0, attempts: 0, stopped: false, records: [] }, sockets = new Set(), active = new Set();
  const server = http.createServer((req, res) => {
    const start = Date.now(); const valid = req.method === 'POST' && req.url === '/v1/chat/completions';
    const record = { sequence: ++state.attempts, at: start, method: req.method === 'POST' ? 'POST' : 'OTHER', path: valid ? req.url : 'REJECTED_ROUTE',
      status_code: null, first_byte_ms: null, total_ms: null, request_bytes: 0, response_bytes: 0, usage: null };
    let finished = false, request, response, reader, connectTimer, firstTimer, totalTimer;
    const finish = code => {
      if (finished) return; finished = true;
      clearTimeout(connectTimer); clearTimeout(firstTimer); clearTimeout(totalTimer);
      if (code) record.error_code = code;
      if (reader) record.usage = reader.end(); record.total_ms = Date.now() - start;
      state.records.push(record); if (options.log) options.log(record);
      active.delete(abort);
    };
    const abort = code => { if (!res.headersSent) record.status_code = 502; finish(code); if (request) request.destroy(); if (response) response.destroy(); if (!res.headersSent) { record.status_code = 502; res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code } })); } else res.destroy(); };
    const refuse = (status, code) => { record.status_code = status; res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code } })); req.resume(); finish(code); };
    if (state.stopped || Date.now() >= options.deadline) { refuse(503, 'WINDOW_DEADLINE'); return; }
    if (!valid) { refuse(400, 'RELAY_ROUTE'); return; }
    if (state.requests >= options.limit) { refuse(429, 'REAL_MODEL_BUDGET_EXHAUSTED'); return; }
    state.requests++; active.add(abort);
    req.on('data', b => { record.request_bytes += b.length; });
    req.once('error', () => abort('CLIENT_STREAM_ERROR'));
    req.once('aborted', () => abort('CLIENT_ABORTED'));
    res.once('close', () => { if (!finished) abort('CLIENT_DISCONNECTED'); });
    const headers = { ...req.headers, host: upstream.host };
    for (const k of ['connection','proxy-connection','keep-alive','transfer-encoding','upgrade','te','trailer','proxy-authorization']) delete headers[k];
    const transport = upstream.protocol === 'https:' ? https : http;
    request = transport.request({ protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port || undefined,
      method: req.method, path: req.url, headers, agent: false }, incoming => {
      response = incoming; record.status_code = incoming.statusCode;
      reader = usageReader(/text\/event-stream/i.test(incoming.headers['content-type'] || ''));
      const h = { ...incoming.headers }; for (const k of ['connection','keep-alive','transfer-encoding','upgrade','trailer']) delete h[k];
      res.writeHead(incoming.statusCode, h);
      incoming.on('data', b => { if (record.first_byte_ms === null) { record.first_byte_ms = Date.now() - start; clearTimeout(firstTimer); } record.response_bytes += b.length; reader.push(b); });
      incoming.once('aborted', () => abort('UPSTREAM_TRUNCATED'));
      incoming.once('error', () => abort('UPSTREAM_STREAM_ERROR'));
      incoming.once('end', () => finish(incoming.statusCode >= 500 ? 'UPSTREAM_5XX' : undefined));
      incoming.pipe(res);
    });
    request.once('socket', socket => { socket.once(upstream.protocol === 'https:' ? 'secureConnect' : 'connect', () => clearTimeout(connectTimer)); });
    request.once('error', () => abort('UPSTREAM_CONNECTION_ERROR'));
    connectTimer = setTimeout(() => abort('UPSTREAM_CONNECT_TIMEOUT'), timeouts.connect);
    firstTimer = setTimeout(() => abort('UPSTREAM_FIRST_BYTE_TIMEOUT'), timeouts.firstByte);
    totalTimer = setTimeout(() => abort('UPSTREAM_TOTAL_TIMEOUT'), Math.max(1, Math.min(timeouts.total, options.deadline - start)));
    req.pipe(request);
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.requestTimeout = 180000; server.headersTimeout = 15000;
  return { state, listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/v1`)); }),
    stop: () => { state.stopped = true; for (const abort of [...active]) abort('RELAY_STOPPED'); },
    close: () => new Promise(resolve => { state.stopped = true; for (const abort of [...active]) abort('RELAY_STOPPED'); for (const socket of sockets) socket.destroy(); server.close(resolve); }) };
}
module.exports = { UPSTREAM, startRelay, usageReader, scanSecrets, consumeKey };
