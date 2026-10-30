import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const d = require('../a9-42-real-model-direct.cjs');
const { hash } = require('../a9-42-office-journey.cjs');
// Independent outer guard forbids external traffic even if the instrumentation is wrong.
const originalHttp = http.request;
http.request = function(o, ...args) { assert.equal(o.hostname, '127.0.0.1', 'EXTERNAL_NETWORK_FORBIDDEN'); return originalHttp.call(this, o, ...args); };
https.request = () => { throw new Error('EXTERNAL_NETWORK_FORBIDDEN'); };
const key = 'TEST_ONLY_OPAQUE_CREDENTIAL_42';
async function fixture(handler) {
  const sockets = new Set(); const server = http.createServer(handler);
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, close: () => new Promise(r => { for (const s of sockets) s.destroy(); server.close(r); }) };
}
function options(url, change = {}) {
  const u = new URL(url); return { protocol: u.protocol, hostname: u.hostname, port: u.port, path: '/v1/chat/completions',
    method: 'POST', headers: { authorization: `Bearer ${key}` }, ...change };
}
function send(o, body = '{}') {
  return new Promise((resolve, reject) => {
    const req = http.request(o, res => { let text = ''; res.on('data', b => text += b); res.on('end', () => resolve({ text, code: res.statusCode })); res.on('error', reject); });
    req.on('error', reject); req.end(body);
  });
}
test('direct guard forwards unchanged bytes and headers, caps concurrent sends before transport, and keeps metadata only', async () => {
  let forwarded = 0; const input = '{"private":"PRIVATE_REQUEST_BODY"}'; const received = [];
  const f = await fixture((req, res) => { forwarded++; let body = ''; req.on('data', b => body += b); req.on('end', () => {
    received.push({ body, auth: req.headers.authorization, custom: req.headers['x-caller'] });
    res.end('{"private":"PRIVATE_RESPONSE_BODY","usage":{"total_tokens":7}}');
  }); });
  const guard = d.installDirectGuard({ limit: 2, deadline: Date.now() + 5000 }, f.url);
  try {
    const replies = await Promise.allSettled(Array.from({ length: 6 }, () => send(options(f.url, { headers: { authorization: `Bearer ${key}`, 'x-caller': 'preserved' } }), input)));
    assert.equal(forwarded, 2); assert.equal(replies.filter(r => r.status === 'fulfilled').length, 2);
    for (const r of replies.filter(r => r.status === 'rejected')) assert.match(r.reason.message, /REAL_MODEL_BUDGET_EXHAUSTED/);
    assert.deepEqual(received, Array(2).fill({ body: input, auth: `Bearer ${key}`, custom: 'preserved' }));
    assert.equal(guard.state.attempts, 6); assert.equal(guard.state.requests, 2); assert.equal(guard.state.blocked, 4);
    for (const r of guard.state.records) { assert.equal(r.request_bytes, Buffer.byteLength(input)); assert.deepEqual(r.usage, { total_tokens: 7 }); }
    assert.equal(/PRIVATE_|CREDENTIAL|authorization/.test(JSON.stringify(guard.state)), false);
    assert.equal(guard.scanSecrets({ nested: { payload_json: JSON.stringify({ key }) } }), false);
    assert.equal(guard.scanSecrets(guard.state), true); assert.throws(() => guard.assertEvidence(), /REAL_MODEL_BUDGET_EXHAUSTED/);
  } finally { guard.restore(); await f.close(); }
});
test('direct guard rejects changed destination/TLS, proxy seams, key drift and post-stop calls before any socket', async () => {
  let forwarded = 0; const f = await fixture((req, res) => { forwarded++; req.resume(); res.end('{}'); });
  const guard = d.installDirectGuard({ limit: 10, deadline: Date.now() + 5000 }, f.url);
  try {
    await send(options(f.url));
    assert.throws(() => http.request(options(f.url, { headers: { authorization: 'Bearer CHANGED_KEY' } })), /DIRECT_CREDENTIAL_DRIFT/);
    for (const change of [{ hostname: 'evil.invalid' }, { path: '/models' }, { method: 'GET' }, { auth: 'a:b' },
      { agent: false }, { socketPath: '/tmp/socket' }, { createConnection: () => {} }, { headers: {} }])
      assert.throws(() => http.request(options(f.url, change)), /DIRECT_(ROUTE_FORBIDDEN|AUTH_REQUIRED|STOPPED)/);
    const tls = options(d.UPSTREAM, { rejectUnauthorized: false });
    assert.throws(() => https.request(tls), /DIRECT_ROUTE_FORBIDDEN/); // test guard allows loopback only
    guard.stop(); assert.throws(() => http.request(options(f.url)), /DIRECT_STOPPED/);
    assert.equal(forwarded, 1); assert.equal(guard.state.requests, 1);
  } finally { guard.restore(); await f.close(); }
  const tlsGuard = d.installDirectGuard({ limit: 1, deadline: Date.now() + 5000 });
  try {
    for (const change of [{ rejectUnauthorized: false }, { ca: 'custom' }, { checkServerIdentity: () => undefined }, { servername: 'other' }])
      assert.throws(() => https.request(options(d.UPSTREAM, { rejectUnauthorized: true, ...change })), /DIRECT_TLS_FORBIDDEN/);
  } finally { tlsGuard.restore(); }
  assert.throws(() => d.installDirectGuard({ limit: 1, deadline: Date.now() + 5000 }, 'https://elsewhere.invalid'), /TEST_UPSTREAM/);
});
test('actual Gateway stream remains incremental, cancellation aborts the socket and never sends another request', async () => {
  const { OpenAICompatibleProvider } = require('../../../src/gateway/dist');
  let sawChunk; const chunk = new Promise(r => sawChunk = r); let peerClosed;
  const closed = new Promise(r => peerClosed = r);
  const f = await fixture((req, res) => { req.resume(); res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"first"},"finish_reason":null}]}\n\n'); res.on('close', peerClosed); });
  const guard = d.installDirectGuard({ limit: 2, deadline: Date.now() + 5000 }, f.url);
  try {
    const provider = new OpenAICompatibleProvider({ baseUrl: f.url + '/v1', model: 'fixture', apiKey: key, retryConfig: { maxRetries: 0 } });
    const cancel = new AbortController();
    const run = provider.sendStreamRequest({ id: 'cancel', messages: [{ role: 'user', content: 'go' }] }, () => sawChunk(), { signal: cancel.signal });
    const rejected = assert.rejects(run); await chunk; const before = guard.state.attempts; cancel.abort(); await rejected;
    await closed; await new Promise(r => setImmediate(r));
    assert.equal(guard.state.attempts, before); assert.equal(guard.state.requests, 1);
  } finally { guard.restore(); await f.close(); }
});
test('actual Gateway retries are counted and cannot bypass direct cap', async () => {
  const { OpenAICompatibleProvider } = require('../../../src/gateway/dist');
  let forwarded = 0; const f = await fixture((req, res) => { forwarded++; req.resume(); res.writeHead(503); res.end('{}'); });
  const guard = d.installDirectGuard({ limit: 1, deadline: Date.now() + 5000 }, f.url);
  try {
    const provider = new OpenAICompatibleProvider({ baseUrl: f.url, model: 'fixture', apiKey: key,
      retryConfig: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 1, backoffMultiplier: 1 } });
    await assert.rejects(provider.sendStreamRequest({ id: 'cap', messages: [{ role: 'user', content: 'go' }] }, () => {}));
    assert.equal(forwarded, 1); assert.equal(guard.state.requests, 1); assert.ok(guard.state.blocked >= 1);
  } finally { guard.restore(); await f.close(); }
});

function providerFixture() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'a942-direct-seed-'));
  const source = path.join(root, 'original'); const destination = path.join(root, 'isolated');
  const config = { schemaVersion: 1, baseUrl: d.UPSTREAM, model: 'deepseek-v4-flash', keyRemembered: true, customHeaderNames: [] };
  const files = { 'Local State': { os_crypt: { encrypted_key: Buffer.from('DPAPI_TEST_ONLY').toString('base64') }, unrelated_user_data: 'DO_NOT_COPY' },
    'a9/a9-provider-config.v1.json': config,
    'a9/a9-vault-apikey/credentials/credentials.v1.json': { schemaVersion: 1,
      protection: 'electron-safe-storage-windows-dpapi-current-user', ciphertext: Buffer.from('v10_SYNTHETIC_' + key).toString('base64') } };
  const write = (name, value) => { const file = path.join(source, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value), 'utf8'); };
  for (const [name, value] of Object.entries(files)) write(name, value);
  return { root, source, destination, config, files, write };
}
test('only required encrypted seed is copied; original files and unrelated Local State stay untouched', () => {
  const f = providerFixture(); const before = d.SOURCE_FILES.map(n => hash(fs.readFileSync(path.join(f.source, n))));
  const seed = d.seedSavedProvider(f.source, f.destination, f.config.model);
  d.verifySeed(f.destination, seed); assert.equal(d.verifyOriginals(seed).status, 'PASS');
  assert.equal(seed.plaintext_read, false); assert.equal(JSON.stringify(seed).includes(key), false);
  assert.equal(fs.readFileSync(path.join(f.destination, 'Local State'), 'utf8').includes('DO_NOT_COPY'), false);
  assert.deepEqual(d.SOURCE_FILES.map(n => hash(fs.readFileSync(path.join(f.source, n)))), before);
  assert.throws(() => d.seedSavedProvider(f.source, f.destination, f.config.model), /SAVED_SEED_DESTINATION/);
  fs.appendFileSync(path.join(f.destination, d.SOURCE_FILES[1]), ' '); assert.throws(() => d.verifySeed(f.destination, seed), /SAVED_SEED_HASH/);
  fs.appendFileSync(path.join(f.source, 'Local State'), ' '); assert.throws(() => d.verifyOriginals(seed), /SAVED_SOURCE_CHANGED/);
  assert.equal(d.savedProviderRoot({ LOCALAPPDATA: 'C:\\Users\\agent\\AppData\\Local' }), 'C:\\Users\\agent\\AppData\\Local\\Win7CodingAgent');
  assert.throws(() => d.savedProviderRoot({ LOCALAPPDATA: '\\\\server\\share' }), /SAVED_LOCALAPPDATA/);
});
test('unsafe saved configs, malformed vault/Local State, missing files, links and source changes fail before destination writes', () => {
  for (const change of [{ baseUrl: 'https://evil.invalid' }, { baseUrl: d.UPSTREAM + '/unapproved' }, { model: 'wrong' },
    { keyRemembered: false }, { apiKey: 'PLAINTEXT' }, { proxy: { host: 'x' } }, { caBundle: 'x' },
    { customHeaderNames: ['x-private'] }, { allowInsecureTLS: true }, { contextBudgetChars: 1 }]) {
    const f = providerFixture(); f.write(d.SOURCE_FILES[1], { ...f.config, ...change });
    assert.throws(() => d.seedSavedProvider(f.source, f.destination, f.config.model)); assert.equal(fs.existsSync(f.destination), false);
  }
  for (const [file, value] of [['Local State', { os_crypt: { encrypted_key: 'AAAA' } }], [d.SOURCE_FILES[2], { schemaVersion: 1, ciphertext: 'bad' }]]) {
    const f = providerFixture(); f.write(file, value); assert.throws(() => d.seedSavedProvider(f.source, f.destination, f.config.model));
    assert.equal(fs.existsSync(f.destination), false);
  }
  const missing = providerFixture();
  const io = { ...fs, lstatSync: file => { if (file.endsWith('Local State')) throw new Error('ENOENT'); return fs.lstatSync(file); } };
  assert.throws(() => d.seedSavedProvider(missing.source, missing.destination, missing.config.model, io));
  const linked = providerFixture(); const linkRoot = path.join(linked.root, 'link'); fs.symlinkSync(linked.source, linkRoot, 'dir');
  assert.throws(() => d.seedSavedProvider(linkRoot, linked.destination, linked.config.model), /SAVED_PROVIDER_LINK/);
  const changed = providerFixture(); let changedOnce = false;
  const race = { ...fs, openSync: (file, flags) => { const fd = fs.openSync(file, flags);
    if (!changedOnce && file.endsWith('credentials.v1.json')) { changedOnce = true; fs.appendFileSync(path.join(changed.source, 'Local State'), ' '); } return fd; } };
  assert.throws(() => d.seedSavedProvider(changed.source, changed.destination, changed.config.model, race), /SAVED_PROVIDER_CHANGED/);
  assert.equal(fs.existsSync(changed.destination), false);
});
test('actual Runtime restores seeded config without plaintext UI input; failed decryption remains closed (fake DPAPI only)', async () => {
  const { createA9AgentRuntime } = require('../../../src/shell/product/a9-agent-runtime.js');
  const Database = require('../../../node_modules/better-sqlite3');
  for (const decryptFailure of [false, true]) {
    const f = providerFixture(); const seed = d.seedSavedProvider(f.source, f.destination, f.config.model);
    const workspace = path.join(f.root, 'workspace'); fs.mkdirSync(workspace);
    const runtime = createA9AgentRuntime({ workspaceRoot: workspace, dataRoot: path.join(f.destination, 'a9'),
      openDatabase: (file, o) => new Database(file, o && o.readonly ? { readonly: true } : {}), vaultPlatform: 'win32',
      safeStorage: { isEncryptionAvailable: () => true, encryptString: () => { throw new Error('UNEXPECTED_ENCRYPT'); },
        decryptString: () => { if (decryptFailure) throw new Error('SYNTHETIC_DECRYPT_FAILURE'); return key; } } });
    try {
      const p = runtime.getSnapshot().provider;
      assert.equal(p.apiKey.available, !decryptFailure); assert.equal(p.apiKey.source, decryptFailure ? 'none' : 'dpapi');
      if (decryptFailure) assert.equal(p.diagnostics.code, 'CREDENTIAL_DECRYPT_FAILED');
      assert.equal(JSON.stringify(runtime.getSnapshot()).includes(key), false); d.verifyOriginals(seed);
    } finally { await runtime.shutdown(); }
  }
});
