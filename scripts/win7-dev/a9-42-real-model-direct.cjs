'use strict';
// Candidate-external instrumentation: the product keeps its original HTTPS/TLS path.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { hash } = require('./a9-42-office-journey.cjs');
const { UPSTREAM, usageReader, scanSecrets } = require('./a9-42-real-model-relay.cjs');
const need = (v, code) => { if (!v) throw new Error(code); };
const CONFIG = 'a9/a9-provider-config.v1.json';
const VAULT = 'a9/a9-vault-apikey/credentials/credentials.v1.json';
const SOURCE_FILES = ['Local State', CONFIG, VAULT];

function savedProviderRoot(env = process.env) {
  need(typeof env.LOCALAPPDATA === 'string' && /^[A-Za-z]:\\/.test(env.LOCALAPPDATA)
    && path.win32.normalize(env.LOCALAPPDATA) === env.LOCALAPPDATA && !/[\x00-\x1f]/.test(env.LOCALAPPDATA), 'SAVED_LOCALAPPDATA');
  return path.win32.join(env.LOCALAPPDATA, 'Win7CodingAgent');
}
function readRegular(root, relative, io = fs) {
  const file = path.join(root, ...relative.split('/'));
  const checkPath = () => {
    let current = path.parse(file).root;
    for (const part of file.slice(current.length).split(path.sep)) {
      current = path.join(current, part);
      need(!io.lstatSync(current).isSymbolicLink(), 'SAVED_PROVIDER_LINK');
    }
    need(io.realpathSync(file).toLowerCase() === path.resolve(file).toLowerCase(), 'SAVED_PROVIDER_REALPATH');
  };
  checkPath(); const fd = io.openSync(file, 'r');
  try {
    const before = io.fstatSync(fd); need(before.isFile() && before.size > 0 && before.size <= 1024 * 1024, 'SAVED_PROVIDER_FILE');
    const bytes = Buffer.alloc(before.size + 1); let offset = 0;
    while (offset < bytes.length) {
      const n = io.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!n) break; offset += n;
    }
    const after = io.fstatSync(fd); checkPath(); const current = io.statSync(file);
    need(offset === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs
      && current.ino === before.ino && current.dev === before.dev && current.size === after.size
      && current.mtimeMs === after.mtimeMs, 'SAVED_PROVIDER_CHANGED');
    return bytes.subarray(0, offset);
  } finally { io.closeSync(fd); }
}
function canonicalBase64(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= Math.ceil(max / 3) * 4
    && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
    && Buffer.from(value, 'base64').length <= max && Buffer.from(value, 'base64').toString('base64') === value;
}
function seedSavedProvider(sourceRoot, destination, model, io = fs) {
  need(path.isAbsolute(sourceRoot) && path.isAbsolute(destination) && !io.existsSync(destination), 'SAVED_SEED_DESTINATION');
  const raw = Object.fromEntries(SOURCE_FILES.map(name => [name, readRegular(sourceRoot, name, io)]));
  const doc = JSON.parse(raw[CONFIG].toString('utf8'));
  const keys = ['schemaVersion','baseUrl','model','customHeaderNames','imageInputEnabled','contextBudgetChars',
    'keyRemembered','probe','updatedAt','allowInsecureTLS'];
  need(doc && Object.keys(doc).every(k => keys.includes(k)) && doc.schemaVersion === 1 && doc.model === model
    && doc.keyRemembered === true && (!doc.customHeaderNames || Array.isArray(doc.customHeaderNames) && doc.customHeaderNames.length === 0)
    && doc.allowInsecureTLS !== true, 'SAVED_PROVIDER_CONFIG');
  const url = new URL(doc.baseUrl);
  need(url.origin === UPSTREAM && !url.username && !url.password && !url.search && !url.hash
    && ['', '/', '/v1', '/v1/'].includes(url.pathname), 'SAVED_PROVIDER_ENDPOINT');
  const vault = JSON.parse(raw[VAULT].toString('utf8'));
  need(raw[VAULT].length <= 65536 && vault && Object.keys(vault).sort().join(',') === 'ciphertext,protection,schemaVersion'
    && vault.schemaVersion === 1 && vault.protection === 'electron-safe-storage-windows-dpapi-current-user'
    && canonicalBase64(vault.ciphertext, 32768), 'SAVED_PROVIDER_VAULT');
  const local = JSON.parse(raw['Local State'].toString('utf8'));
  need(local && local.os_crypt && canonicalBase64(local.os_crypt.encrypted_key, 32768)
    && Buffer.from(local.os_crypt.encrypted_key, 'base64').subarray(0, 5).toString('ascii') === 'DPAPI', 'SAVED_OS_CRYPT_KEY');
  const config = { schemaVersion: 1, baseUrl: doc.baseUrl, model, keyRemembered: true, customHeaderNames: [], imageInputEnabled: false, probe: null };
  if (doc.contextBudgetChars !== undefined) {
    need(Number.isSafeInteger(doc.contextBudgetChars) && doc.contextBudgetChars >= 16000 && doc.contextBudgetChars <= 1000000, 'SAVED_CONTEXT_BUDGET');
    config.contextBudgetChars = doc.contextBudgetChars;
  }
  const output = { 'Local State': Buffer.from(JSON.stringify({ os_crypt: { encrypted_key: local.os_crypt.encrypted_key } }) + '\n', 'utf8'),
    [CONFIG]: Buffer.from(JSON.stringify(config) + '\n', 'utf8'), [VAULT]: raw[VAULT] };
  // Recheck all originals before the first write; no decryption or original mutation here.
  const sourceFiles = SOURCE_FILES.map(name => { need(hash(readRegular(sourceRoot, name, io)) === hash(raw[name]), 'SAVED_PROVIDER_CHANGED');
    return { path: name, sha256: hash(raw[name]) }; });
  for (const [name, bytes] of Object.entries(output)) {
    const target = path.join(destination, ...name.split('/'));
    io.mkdirSync(path.dirname(target), { recursive: true }); io.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
  }
  return { schema_version: 1, source: 'current-user-default-dpapi', source_root: sourceRoot,
    source_files: sourceFiles, seeded_files: Object.entries(output).map(([name, bytes]) => ({ path: name, sha256: hash(bytes) })),
    plaintext_read: false, original_written: false, dpapi_restored: 'UNKNOWN' };
}
function verifySeed(destination, record, io = fs) {
  need(record && record.source === 'current-user-default-dpapi' && Array.isArray(record.seeded_files)
    && record.seeded_files.length === SOURCE_FILES.length
    && new Set(record.seeded_files.map(e => e.path)).size === SOURCE_FILES.length, 'SAVED_SEED_RECORD');
  for (const name of SOURCE_FILES) {
    const entry = record.seeded_files.find(e => e.path === name);
    need(entry && hash(readRegular(destination, name, io)) === entry.sha256, 'SAVED_SEED_HASH');
  }
}
function verifyOriginals(record, io = fs) {
  need(record && record.source_files && record.source_files.length === SOURCE_FILES.length
    && new Set(record.source_files.map(e => e.path)).size === SOURCE_FILES.length, 'SAVED_SOURCE_RECORD');
  for (const entry of record.source_files) {
    need(SOURCE_FILES.includes(entry.path) && hash(readRegular(record.source_root, entry.path, io)) === entry.sha256, 'SAVED_SOURCE_CHANGED');
  }
  return { status: 'PASS', files: record.source_files.length };
}

// No server, proxy, URL/header rewriting or extra network request. Reject before transport.
// The test-only upstream argument is never available in JSON/CLI configuration.
function installDirectGuard(options, fakeUpstream) {
  need(Number.isInteger(options.limit) && options.limit >= 1 && options.limit <= 40
    && Number.isFinite(options.deadline) && options.deadline > Date.now(), 'DIRECT_BUDGET');
  const target = new URL(fakeUpstream || UPSTREAM);
  if (fakeUpstream) need(target.protocol === 'http:' && target.hostname === '127.0.0.1'
    && target.pathname === '/' && !target.search && !target.hash && !target.username && !target.password, 'TEST_UPSTREAM');
  const state = { requests: 0, attempts: 0, blocked: 0, stopped: false, records: [], first_failure: null };
  const originals = { http: http.request, https: https.request };
  const active = new Set(), secrets = new Set(); let restored = false;
  const scan = value => scanSecrets(value) && [...secrets].every(secret => scanSecrets(value, secret));
  const reject = code => {
    state.blocked++; state.first_failure = state.first_failure || code;
    state.stopped = true;
    if (options.log) options.log();
    const error = new Error(code); error.code = code; throw error;
  };
  function wrap(kind, original) {
    return function guarded(optionsArg, callback) {
      state.attempts++;
      const o = optionsArg;
      if (!o || typeof o !== 'object' || o instanceof URL) return reject('DIRECT_REQUEST_SHAPE');
      const valid = o.protocol === target.protocol && kind === (target.protocol === 'https:' ? 'https' : 'http')
        && o.hostname === target.hostname && Number(o.port || (kind === 'https' ? 443 : 80)) === Number(target.port || (kind === 'https' ? 443 : 80))
        && o.method === 'POST' && ['/chat/completions','/v1/chat/completions'].includes(o.path)
        && !o.host && !o.socketPath && !o.auth && !o.createConnection && o.agent === undefined;
      if (!valid) return reject('DIRECT_ROUTE_FORBIDDEN');
      if (kind === 'https' && (o.rejectUnauthorized !== true || o.ca || o.checkServerIdentity
        || o.servername && o.servername !== target.hostname || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0')) return reject('DIRECT_TLS_FORBIDDEN');
      if (state.requests >= options.limit) return reject('REAL_MODEL_BUDGET_EXHAUSTED');
      if (state.stopped || Date.now() >= options.deadline) return reject('DIRECT_STOPPED');
      const auth = Object.entries(o.headers || {}).filter(([k]) => k.toLowerCase() === 'authorization');
      if (auth.length !== 1 || typeof auth[0][1] !== 'string' || !/^Bearer [\x21-\x7e]{1,8192}$/.test(auth[0][1])) return reject('DIRECT_AUTH_REQUIRED');
      const secret = auth[0][1].slice(7);
      if (secrets.size && !secrets.has(secret)) return reject('DIRECT_CREDENTIAL_DRIFT');
      secrets.add(secret);
      const started = Date.now();
      const record = { sequence: ++state.requests, at: started, method: 'POST', path: o.path,
        status_code: null, first_byte_ms: null, total_ms: null, request_bytes: 0, response_bytes: 0, usage: null, tls: null };
      state.records.push(record); let done = false, req, reader;
      const persist = () => { if (options.log) options.log(); };
      const finish = code => {
        if (done) return; done = true; active.delete(req);
        if (reader) record.usage = reader.end(); record.total_ms = Date.now() - started;
        if (code) record.error_code = code; persist();
      };
      try { req = Reflect.apply(original, this, [o, res => {
        record.status_code = res.statusCode;
        reader = usageReader(/text\/event-stream/i.test(res.headers['content-type'] || ''));
        res.on('data', bytes => { if (record.first_byte_ms === null) record.first_byte_ms = Date.now() - started;
          record.response_bytes += bytes.length; reader.push(bytes); });
        res.once('end', () => finish()); res.once('aborted', () => finish('DIRECT_RESPONSE_ABORTED'));
        res.once('error', () => finish('DIRECT_RESPONSE_ERROR'));
        if (callback) callback(res);
      }]); } catch (error) { finish('DIRECT_REQUEST_FAILED'); throw new Error('DIRECT_REQUEST_FAILED'); }
      active.add(req); persist();
      // Count bytes without retaining or changing request content or write return values.
      for (const name of ['write','end']) {
        const originalMethod = req[name]; req[name] = function(chunk, encoding, ...rest) {
          if (typeof chunk === 'string' || Buffer.isBuffer(chunk) || chunk instanceof Uint8Array)
            record.request_bytes += Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : undefined);
          return Reflect.apply(originalMethod, this, [chunk, encoding, ...rest]);
        };
      }
      req.once('socket', socket => {
        if (kind !== 'https') return;
        const capture = () => { record.tls = { authorized: socket.authorized === true, protocol: socket.getProtocol() };
          if (!record.tls.authorized) { state.first_failure = state.first_failure || 'DIRECT_TLS_UNAUTHORIZED'; req.destroy(new Error('DIRECT_TLS_UNAUTHORIZED')); } };
        if (socket.authorized === true) capture(); else socket.once('secureConnect', capture);
      });
      req.once('error', error => finish(/^E[A-Z0-9_]{1,60}$/.test(error && error.code || '') ? error.code : 'DIRECT_REQUEST_ERROR'));
      req.once('close', () => finish(req.destroyed && !req.writableFinished ? 'DIRECT_REQUEST_ABORTED' : undefined));
      return req;
    };
  }
  const wrappers = { http: wrap('http', originals.http), https: wrap('https', originals.https) };
  http.request = wrappers.http; https.request = wrappers.https;
  function assertInstalled() { need(http.request === wrappers.http && https.request === wrappers.https, 'DIRECT_GUARD_REPLACED'); }
  function stop() { state.stopped = true; for (const req of active) req.destroy(new Error('DIRECT_STOPPED')); }
  function restore() {
    if (restored) return; assertInstalled(); stop(); http.request = originals.http; https.request = originals.https; restored = true;
  }
  return { state, scanSecrets: scan, assertInstalled, stop, restore,
    assertEvidence: () => { assertInstalled(); need(!state.first_failure, state.first_failure || 'DIRECT_GUARD_FAILURE');
      need(state.requests > 0 && state.requests <= options.limit && active.size === 0, 'DIRECT_REQUEST_EVIDENCE');
      need(fakeUpstream || state.records.every(r => r.tls && r.tls.authorized), 'DIRECT_TLS_EVIDENCE'); } };
}
module.exports = { UPSTREAM, SOURCE_FILES, savedProviderRoot, seedSavedProvider, verifySeed, verifyOriginals, installDirectGuard };
