import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const d = require('../a9-42-real-model-trial.cjs');
const b = require('../a9-42-office-journey.cjs');
const prep = require('../a9-42-real-model-prepare.cjs');
// Fail before transport for every non-loopback request, including accidental real probes.
const httpRequest = http.request;
http.request = function(options, ...rest) {
  const host = typeof options === 'string' || options instanceof URL ? new URL(options).hostname : options.hostname;
  assert.equal(host, '127.0.0.1', 'EXTERNAL_NETWORK_FORBIDDEN'); return httpRequest.call(this, options, ...rest);
};
https.request = () => { throw new Error('EXTERNAL_NETWORK_FORBIDDEN'); };
const now = Date.parse('2026-10-29T17:00:00.000Z');
function config() {
  const r = 'C:\\A9-DEV\\work\\a942r-1234abcd';
  return { schema_version: 1, evidence_class: 'DEV_CHANNEL', profile: 'office-real-model', run_id: 'a942r-1234abcd',
    source_commit: '1'.repeat(40), zip_sha256: '2'.repeat(64), manifest_sha256: '3'.repeat(64), driver_sha256: '4'.repeat(64), source_binding_sha256: '5'.repeat(64),
    manifest_file_count: 1000, session_id: 2, task_name: 'A9-DEV-a942r-1234abcd', deadline_utc: '2026-10-29T17:50:00.000Z', real_model_request_limit: 20,
    input_package_root: 'C:\\A9-DEV\\input\\newpkg', zip_path: 'C:\\A9-DEV\\input.zip', run_root: r + '\\run', package_root: r + '\\pkg',
    workspace_root: r + '\\中文 workspace', data_root: r + '\\pkg\\portable-data', cmd_path: r + '\\run\\cmd.exe', source_binding_path: r + '\\run\\source-binding.json',
    upstream: d.UPSTREAM, model: 'deepseek-v4-flash', idle_seconds: 60, api_key_file: r + '\\run\\secret\\key.txt' };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function localServer(handler) {
  const sockets = new Set(); const server = http.createServer(handler);
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => { for (const s of sockets) s.destroy(); server.close(r); }) };
}
function post(url, body = '{"probe":true}', headers = {}) {
  return new Promise((resolve, reject) => {
    const chunks = []; const req = http.request(url + '/chat/completions', { method: 'POST', headers: { authorization: 'Bearer TEST_CREDENTIAL_SENTINEL', 'content-type': 'application/json', ...headers } }, res => {
      res.on('data', c => chunks.push(c)); res.once('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      res.once('aborted', () => resolve({ status: res.statusCode, aborted: true })); res.once('error', () => resolve({ aborted: true }));
    }); req.once('error', reject); req.end(body);
  });
}
async function withRelay(handler, fn, options = {}) {
  const upstream = await localServer(handler); const relay = d.startRelay({ limit: 3, deadline: Date.now() + 5000, ...options }, upstream.url);
  try { await fn(relay, await relay.listen()); } finally { await relay.close(); await upstream.close(); }
}
test('strict config: fixed upstream, limit, secret/layout, profile/run, unknown fields and deadline', () => {
  assert.equal(d.validateConfig(config(), now).idle_seconds, 60);
  for (const change of [{ upstream: 'http://127.0.0.1:1234' },{ upstream: d.UPSTREAM + '/' },{ upstream: 'https://api.deepseek.com.evil' },
    { real_model_request_limit: 0 },{ real_model_request_limit: 41 },{ real_model_request_limit: 1.1 },{ real_model_request_limit: '3' },
    { api_key_file: config().run_root + '\\key.txt' },{ api_key_file: config().run_root + '\\secret\\..\\key.txt' },{ api_key_file: config().run_root + '\\secret2\\key.txt' },
    { run_id: 'a942o-1234abcd' },{ profile: 'office-journey' },{ surprise: 1 },{ deadline_utc: null },{ deadline_utc: '2026-10-29T18:00:00.001Z' },
    { deadline_utc: '2026-10-29T16:59:59.000Z' },{ idle_seconds: 29 },{ idle_seconds: 121 },{ model: 'evil/path' },{ run_root: 'C:\\elsewhere' }]) {
    assert.throws(() => d.validateConfig({ ...config(), ...change }, now), JSON.stringify(change));
  }
  assert.equal(d.validateConfig({ ...config(), real_model_request_limit: 40, idle_seconds: 120 }, now).real_model_request_limit, 40);
  assert.equal(d.validateConfig({ ...config(), deadline_utc: null }, now, true).deadline_utc, null);
  assert.throws(() => d.startRelay({ limit: 1, deadline: Date.now() + 1000 }, 'https://evil.invalid'), /TEST_UPSTREAM/);
});
test('hard cap includes probe; refuses every later request without forwarding even concurrently', async () => {
  let forwarded = 0;
  await withRelay((req, res) => { forwarded++; req.resume(); res.end('{"usage":{"total_tokens":12}}'); }, async (r, url) => {
    const replies = await Promise.all(Array.from({ length: 8 }, () => post(url)));
    assert.equal(forwarded, 3); assert.equal(r.state.requests, 3);
    assert.equal(replies.filter(r => r.status === 429).length, 5);
    assert.ok(replies.filter(r => r.status === 429).every(r => r.body.includes('REAL_MODEL_BUDGET_EXHAUSTED')));
    assert.equal((await post(url)).status, 429); assert.equal(forwarded, 3);
  });
});
test('JSON forwarded byte-for-byte with credentials/headers in memory, only metric projection logged', async () => {
  const input = '{"private_body":"DO_NOT_LOG_123","probe":true}';
  const output = '{"private_body":"DO_NOT_LOG_RESPONSE","usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12,"private":"DO_NOT_LOG_USAGE"}}';
  let received = '';
  await withRelay((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer TEST_CREDENTIAL_SENTINEL'); assert.equal(req.headers['x-private'], 'PRIVATE_HEADER');
    req.on('data', b => received += b); req.on('end', () => { res.setHeader('x-private-response', 'DO_NOT_LOG_HEADER'); res.end(output); });
  }, async (r, url) => {
    const reply = await post(url, input, { 'x-private': 'PRIVATE_HEADER' }); assert.equal(received, input); assert.equal(reply.body, output);
    const record = r.state.records[0]; assert.deepEqual(record.usage, { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 });
    assert.equal(record.request_bytes, Buffer.byteLength(input)); assert.equal(record.response_bytes, Buffer.byteLength(output));
    assert.ok(record.first_byte_ms >= 0 && record.total_ms >= record.first_byte_ms);
    assert.deepEqual(Object.keys(record).sort(), ['sequence','at','method','path','status_code','first_byte_ms','total_ms','request_bytes','response_bytes','usage'].sort());
    assert.equal(/DO_NOT_LOG|PRIVATE_HEADER|TEST_CREDENTIAL|authorization|x-private/.test(JSON.stringify(r.state.records)), false);
  });
});
test('SSE is streamed before EOF; split UTF8/usage and trailing usage preserved without body persistence', async () => {
  let release; const gate = new Promise(r => release = r);
  const output = 'data: {"choices":[{"delta":{"content":"私密文本"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":2,"total_tokens":11}}\n\ndata: [DONE]\n\n';
  await withRelay(async (req, res) => {
    req.resume(); res.setHeader('content-type', 'text/event-stream');
    const bytes = Buffer.from(output); for (let i = 0; i < 70; i++) res.write(bytes.subarray(i, i + 1));
    await gate; for (let i = 70; i < bytes.length; i++) res.write(bytes.subarray(i, i + 1)); res.end();
  }, async (r, url) => {
    const reply = await new Promise((resolve, reject) => {
      const req = http.request(url + '/chat/completions', { method: 'POST' }, res => {
        const chunks = []; res.on('data', b => { chunks.push(b); release(); }); res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }); req.on('error', reject); req.end('{}');
    });
    assert.equal(reply, output); assert.deepEqual(r.state.records[0].usage, { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 });
    assert.equal(JSON.stringify(r.state.records).includes('私密文本'), false);
  });
});
test('5xx remains 5xx, no relay retry, error is only code', async () => {
  let count = 0;
  await withRelay((req, res) => { count++; req.resume(); res.writeHead(503); res.end('PRIVATE_UPSTREAM_ERROR'); }, async (r, url) => {
    assert.equal((await post(url)).status, 503); assert.equal(count, 1);
    assert.equal(r.state.records[0].error_code, 'UPSTREAM_5XX'); assert.equal(JSON.stringify(r.state.records).includes('PRIVATE'), false);
  });
});
test('first byte, total timeout, disconnect and connection refused are bounded and code-only', async () => {
  for (const kind of ['first','total','truncate']) {
    await withRelay((req, res) => {
      req.resume(); if (kind !== 'first') { res.writeHead(200); res.write('data: {}\n\n'); }
      if (kind === 'truncate') setTimeout(() => res.destroy(), 10);
    }, async (r, url) => {
      await post(url); assert.equal(r.state.records.length, 1);
      assert.equal(r.state.records[0].error_code, { first: 'UPSTREAM_FIRST_BYTE_TIMEOUT', total: 'UPSTREAM_TOTAL_TIMEOUT', truncate: 'UPSTREAM_TRUNCATED' }[kind]);
      assert.ok(r.state.records[0].total_ms < 1000);
    }, { timeouts: { connect: 100, firstByte: 80, total: 160 } });
  }
  const upstream = await localServer(() => {}), url = upstream.url; await upstream.close();
  const r = d.startRelay({ limit: 1, deadline: Date.now() + 1000 }, url);
  try { await post(await r.listen()); assert.equal(r.state.records[0].error_code, 'UPSTREAM_CONNECTION_ERROR'); } finally { await r.close(); }
});
test('expired window and stop refuse new forwarding', async () => {
  let count = 0;
  await withRelay((req, res) => { count++; res.end('{}'); }, async (r, url) => {
    assert.equal((await post(url)).status, 503); assert.equal(count, 0);
  }, { deadline: Date.now() - 1 });
  await withRelay((req, res) => { count++; res.end('{}'); }, async (r, url) => {
    r.stop(); assert.equal((await post(url)).status, 503); assert.equal(count, 0);
  });
});
test('usage parser ignores text, bad types, malformed JSON and overflow; reads final unterminated SSE line', () => {
  const reader = d.usageReader(true); for (const part of ['data: {"usage":', '{"total_tokens":7,"prompt_tokens":"bad"}}']) reader.push(Buffer.from(part));
  assert.deepEqual(reader.end(), { total_tokens: 7 });
  for (const text of ['not-json', '{"usage":{"total_tokens":-1}}', 'x'.repeat(2100000)]) { const r = d.usageReader(false); r.push(Buffer.from(text)); assert.equal(r.end(), null); }
});
test('secret file is consumed/deleted/confirmed and leakage scans catch raw or sk prefix anywhere', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a942r-secret-'));
  try {
    const file = path.join(root, 'key.txt'); const key = 'TEST_ONLY_SECRET_90210'; fs.writeFileSync(file, key);
    const calls = []; const io = { existsSync: p => p === config().api_key_file ? fs.existsSync(file) : false,
      lstatSync: () => fs.lstatSync(file), readFileSync: () => fs.readFileSync(file, 'utf8'), unlinkSync: () => { calls.push('delete'); fs.unlinkSync(file); } };
    assert.deepEqual(d.consumeKey(config(), io), { key, sha256: b.hash(key) }); assert.equal(fs.existsSync(file), false); assert.deepEqual(calls, ['delete']);
    assert.equal(d.scanSecrets({ events: [{ data: key }] }, key), false);
    assert.equal(d.scanSecrets(Buffer.from('sk-TEST_ONLY_NEVER_REAL')), false);
    assert.equal(d.scanSecrets('key=sk-0123456789abcdef0123456789abcdef'), false);
    for (const benign of ['disk-cache', 'a9-task-stream', 'Desk-top', 'risk-free plan', 'ask-user']) assert.equal(d.scanSecrets(benign), true, benign);
    assert.equal(d.scanSecrets({ api_key_sha256: b.hash(key) }, key), true);
    fs.writeFileSync(file, key); assert.throws(() => d.consumeKey(config(), { ...io, unlinkSync: () => {} }), /SECRET_FILE_DELETE_FAILED/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('anonymous pipe carries synthetic key without argv/env or disk', async () => {
  const script = `require(${JSON.stringify(require.resolve('../a9-42-real-model-trial.cjs'))}).readKeyPipe().then(k=>process.stdout.write(require('crypto').createHash('sha256').update(k).digest('hex')))`;
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore','pipe','pipe','pipe'] });
  const key = 'TEST_ONLY_PIPE_CREDENTIAL'; child.stdio[3].end(key); let output = ''; child.stdout.on('data', b => output += b);
  const code = await new Promise(r => child.on('close', r)); assert.equal(code, 0); assert.equal(output, b.hash(key));
});
function scenario(id) {
  const values = d.samples(); const originals = Object.fromEntries(Object.entries(values).map(([n, bts]) => [n, b.hash(bts)]));
  const before = Object.fromEntries(Object.entries(values).map(([n, bts]) => [n, { pk: true, sha256: b.hash(bts), text: d.xmlText(bts) }]));
  const input = id === 'S2' ? d.FILES.book : d.FILES.doc;
  const ends = ['document_read', ...(['S2','S3'].includes(id) ? ['document_write_copy'] : [])].map(toolName => ({ event_type: 'tool_end', data: { toolName, result: JSON.stringify(toolName === 'document_read' ? { path: input, sha256: originals[input] } : { sourceSha256: originals[d.FILES.doc] }) } }));
  const f = { before, after: structuredClone(before), originals, answer: d.MARKERS.doc + d.MARKERS.answer, asked: true,
    sql: { turns: [{ status: id === 'S5' ? 'cancelled' : 'completed' }], events: ends } };
  if (['S4','S5'].includes(id)) {
    f.sql.events = [{ event_type: 'question_required', data: {} }, { event_type: 'question_pending', data: {} }, { event_type: 'question_resolved', data: { decision: id === 'S5' ? 'cancelled' : 'answered' } }];
    f.before_cancel = structuredClone(before); f.requests_before_cancel = 2; f.requests_after_cancel = 2; f.late_rejected = true; f.cancel_write_events = 0;
  }
  if (['S2','S3'].includes(id)) f.after[id === 'S2' ? d.FILES.report : d.FILES.copy] = { pk: true, sha256: 'other', text: id === 'S2' ? d.MARKERS.book + ' 17 23 40' : d.MARKERS.copy };
  return f;
}
test('all five scenario verdicts bind files and SQL; wrong models/overwrite/hash change fail', () => {
  for (const id of ['S1','S2','S3','S4','S5']) {
    assert.equal(d.verdict(id, scenario(id)).status, 'PASS', id);
    const changed = scenario(id); changed.after[d.FILES.doc].sha256 = 'corrupt'; assert.equal(d.verdict(id, changed).reason, 'ORIGINAL_HASH_CHANGED');
    const write = scenario(id); write.sql.events.push({ event_type: 'tool_start', data: { toolName: 'document_write_copy', args: { path: 'C:\\workspace\\' + d.FILES.doc } } });
    assert.equal(d.verdict(id, write).reason, 'ORIGINAL_WRITE_ATTEMPT');
    const missingSql = scenario(id); missingSql.sql.turns = []; assert.equal(d.verdict(id, missingSql).reason, 'SQLITE_TURN_FACTS');
  }
  for (const id of ['S4','S5']) { const f = scenario(id); f.asked = false; assert.equal(d.verdict(id, f).reason, 'MODEL_DID_NOT_ASK'); }
  const f = scenario('S5'); f.requests_after_cancel++; assert.equal(d.verdict('S5', f).status, 'FAIL');
  f.requests_after_cancel--; f.late_rejected = false; assert.equal(d.verdict('S5', f).status, 'FAIL');
  const bad = scenario('S2'); bad.after[d.FILES.report].text = 'made up'; assert.equal(d.verdict('S2', bad).status, 'FAIL');
  const answer = scenario('S1'); answer.answer = 'did not read'; assert.equal(d.verdict('S1', answer).status, 'FAIL');
});
test('deterministic bound fixtures are real PK Office XML; workspace tracks writes independently', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a942r-samples-'));
  try {
    const fixtures = d.samples(); assert.deepEqual(fixtures, d.samples());
    for (const [name, bytes] of Object.entries(fixtures)) fs.writeFileSync(path.join(root, name), bytes);
    const facts = d.workspaceFacts(root); assert.ok(facts[d.FILES.doc].text.includes(d.MARKERS.doc)); assert.ok(facts[d.FILES.book].text.includes(d.MARKERS.book));
    assert.throws(() => d.xmlText(Buffer.from('fake docx')), /OFFICE_PK/);
    fs.writeFileSync(path.join(root, 'late-write.txt'), 'changed'); assert.notDeepEqual(d.workspaceFacts(root), facts);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('prepare emits non-executable template, exact support and sample hashes without altering old prepare', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a942r-prepare-'));
  try {
    const zipPath = path.join(root, 'input.zip'); fs.writeFileSync(zipPath, 'unit fixture zip');
    const output = path.join(root, 'prepared');
    const spec = { source_commit: config().source_commit, zip_path: zipPath, run_id: config().run_id, session_id: 2, output_root: output,
      real_model_request_limit: 20, model: config().model, idle_seconds: 60, target_input_package_root: config().input_package_root, target_zip_path: config().zip_path };
    prep.emitMaterials(spec, { manifestBytes: Buffer.from('{}'), m: { files: Array(101).fill({}) }, products: [], compiled: [], sourceIdentity: {}, compilers: [] });
    const c = JSON.parse(fs.readFileSync(path.join(output, 'config-template.json'))); assert.throws(() => d.validateConfig(c), /CONFIG_DEADLINE/);
    assert.equal(d.validateConfig(c, Date.now(), true).deadline_utc, null);
    const bindBytes = fs.readFileSync(path.join(output, 'source-binding.json')), binding = JSON.parse(bindBytes);
    assert.equal(b.hash(bindBytes), c.source_binding_sha256); assert.equal(b.hash(fs.readFileSync(path.join(output, 'driver.cjs'))), c.driver_sha256);
    assert.deepEqual(binding.support_files.map(e => e.path), d.SUPPORT);
    for (const e of [...binding.support_files, ...binding.samples]) assert.equal(b.hash(fs.readFileSync(path.join(output, e.path))), e.sha256);
    const launch = fs.readFileSync(path.join(output, 'launch-template.cmd'), 'utf8'); assert.match(launch, /\r\n/); assert.ok(!launch.includes('api.deepseek'));
    assert.throws(() => prep.emitMaterials(spec, { manifestBytes: Buffer.from('{}'), m: { files: Array(101) }, products: [], compiled: [], sourceIdentity: {}, compilers: [] }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('support/sample binding rejects omitted reuse, drift, duplicate names and tampered samples', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a942r-support-'));
  try {
    const support_files = d.SUPPORT.map(name => { const bytes = fs.readFileSync(path.resolve('scripts/win7-dev', name)); fs.writeFileSync(path.join(root, name), bytes); return { path: name, sha256: b.hash(bytes) }; });
    const samples = Object.entries(d.samples()).map(([name, bytes]) => { fs.writeFileSync(path.join(root, name), bytes); return { path: name, sha256: b.hash(bytes) }; });
    const binding = { source_tree: '1'.repeat(40), profile: config().profile, support_files, samples };
    assert.equal(d.verifySupport(binding, config(), fs, root).samples.length, 2);
    assert.throws(() => d.verifySupport({ ...binding, support_files: support_files.slice(1) }, config(), fs, root), /BINDING_SUPPORT/);
    assert.throws(() => d.verifySupport({ ...binding, support_files: [support_files[0], support_files[0], ...support_files.slice(2)] }, config(), fs, root), /BINDING_SUPPORT_HASH/);
    fs.appendFileSync(path.join(root, samples[0].path), 'drift'); assert.throws(() => d.verifySupport(binding, config(), fs, root), /BINDING_SAMPLE_HASH/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('SQL event serialization escaping cannot hide a synthetic key', () => {
  const key = 'TEST_ONLY_QUOTED_"_KEY';
  assert.equal(d.scanSecrets([{ payload_json: JSON.stringify({ data: { nested: { key } } }) }], key), false);
});
test('S5 rejects transient write observation; S3 requires source hash bound copy; ask must be first', () => {
  const cancel = scenario('S5'); cancel.cancel_write_events = 1; assert.equal(d.verdict('S5', cancel).status, 'FAIL');
  const copy = scenario('S3'); copy.sql.events[1].data.result = '{}'; assert.equal(d.verdict('S3', copy).reason, 'COPY_SOURCE_NOT_BOUND');
  const lateAsk = scenario('S4'); lateAsk.sql.events.unshift({ event_type: 'tool_start', data: { toolName: 'read' } }); assert.equal(d.verdict('S4', lateAsk).reason, 'MODEL_DID_NOT_ASK_FIRST');
});
test('connection timer expires independently before first byte/total timers (no socket transport)', async () => {
  const { Writable } = await import('node:stream');
  const guarded = http.request;
  http.request = function(options, ...rest) {
    if (options && options.agent === false) return new Writable({ write(_b, _enc, done) { done(); } });
    return guarded.call(this, options, ...rest);
  };
  const relay = d.startRelay({ limit: 1, deadline: Date.now() + 1000, timeouts: { connect: 20, firstByte: 200, total: 300 } }, 'http://127.0.0.1:1');
  try { assert.equal((await post(await relay.listen())).status, 502); assert.equal(relay.state.records[0].error_code, 'UPSTREAM_CONNECT_TIMEOUT'); }
  finally { http.request = guarded; await relay.close(); }
});
test('late IPC proof requires a durable stale/conflict error, not schema failure or generic rejection', () => {
  assert.equal(d.lateReplyRejected({ ok: false, error: { code: 'A9_QUESTION_REPLY_CONFLICT' } }), true);
  assert.equal(d.lateReplyRejected({ ok: false, error: { code: 'A9_QUESTION_STALE' } }), true);
  for (const reply of [null, { ok: true }, { ok: false }, { ok: false, error: { code: 'A9_QUESTION_REPLY_INVALID' } }]) assert.equal(d.lateReplyRejected(reply), false);
});
test('one resource query per tick feeds tree observation and samples only the observed product tree', async () => {
  const row = (pid, created, cpu, image = 'C:\\A9-DEV\\work\\x\\pkg\\electron.exe') => ({ pid, parent: 1, created, image, session: 2, name: 'electron.exe',
    workingSet: 100, privateBytes: 50, userTime100ns: cpu, kernelTime100ns: 0, handles: 3, threads: 1 });
  let observed = [{ pid: 10, created: 'a' }], calls = 0, fail = false;
  const m = d.resourceObserver(() => observed, () => { calls++; if (fail) throw new Error('RESOURCE_QUERY_FAILED'); return { rows: [row(10, 'a', 1000 * calls), row(10, 'reused', 5), row(99, 'z', 7, '')], query_ms: 4 }; });
  const rows = m.query();
  assert.equal(calls, 1); assert.equal(rows[0].imageSource, 'executable_path'); assert.equal(rows[2].imageSource, null);
  await m.sample();
  assert.deepEqual(m.sampler.samples()[0].processes.map(p => [p.pid, p.created]), [[10, 'a']]);
  // No new query result: the stale tick must not be re-sampled.
  await m.sample(); assert.equal(m.sampler.samples().length, 1); assert.deepEqual(m.sampler.errors(), { RESOURCE_QUERY_FAILED: 1 });
  fail = true; assert.throws(() => m.query(), /RESOURCE_QUERY_FAILED/); await m.sample();
  assert.equal(m.sampler.samples().length, 1); assert.deepEqual(m.sampler.errors(), { RESOURCE_QUERY_FAILED: 2 });
  fail = false; observed = [...observed, { pid: 99, created: 'z' }]; m.query(); await m.sample();
  assert.deepEqual(m.sampler.samples()[1].processes.map(p => p.pid), [10, 99]); assert.equal(calls, 3);
  await m.sampler.stop();
});
test('key-less network preflight: GET /models without Authorization, 401 only, body discarded, bounded failures', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    if (req.url !== '/models') { res.writeHead(404); res.end(); return; }
    const status = server.nextStatus === undefined ? 401 : Number(server.nextStatus);
    if (status === 0) return; // never answer
    res.writeHead(status, { 'content-type': 'application/json' }); res.end('{"error":{"message":"SECRET_BODY_TEXT"}}');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const ok = await d.upstreamPreflight({}, url);
    assert.equal(ok.status, 'PASS'); assert.equal(ok.status_code, 401); assert.equal(ok.authorization_sent, false); assert.ok(ok.response_bytes > 0);
    assert.deepEqual(seen[0], { method: 'GET', url: '/models', auth: undefined });
    assert.ok(!JSON.stringify(ok).includes('SECRET_BODY_TEXT'));
    server.nextStatus = 200; const wrong = await d.upstreamPreflight({}, url);
    assert.equal(wrong.status, 'FAIL'); assert.equal(wrong.error_code, 'PREFLIGHT_UNEXPECTED_STATUS');
    server.nextStatus = 0; const slow = await d.upstreamPreflight({ timeouts: { connect: 1000, total: 150 } }, url);
    assert.equal(slow.error_code, 'UPSTREAM_TOTAL_TIMEOUT');
  } finally { await new Promise(r => { server.closeAllConnections?.(); server.close(r); }); }
  const refused = await d.upstreamPreflight({ timeouts: { connect: 1000, total: 2000 } }, url);
  assert.equal(refused.status, 'FAIL'); assert.equal(refused.error_code, 'UPSTREAM_ECONNREFUSED');
  assert.throws(() => d.upstreamPreflight({}, 'http://10.0.0.1/'), /TEST_UPSTREAM/);
  assert.throws(() => d.upstreamPreflight({ timeouts: { total: 30001 } }), /PREFLIGHT_TIMEOUT/);
  assert.deepEqual(d.certProjection({ subject: { CN: 'api.deepseek.com', O: 'x' }, issuer: { CN: 'TrustAsia' }, valid_to: 'Jan 1 2027', fingerprint256: 'AA', raw: Buffer.from('x') }),
    { subject_cn: 'api.deepseek.com', issuer_cn: 'TrustAsia', valid_to: 'Jan 1 2027', fingerprint256: 'AA' });
  assert.equal(d.certProjection({}), null);
});
test('preflight runs before key upload; controller gate needs this run PASS record', async () => {
  const driverFile = require.resolve('../a9-42-real-model-trial.cjs');
  const c = { ...config(), driver_sha256: b.hash(fs.readFileSync(driverFile)) };
  const files = new Map();
  const io = { existsSync: p => files.has(p), readFileSync: (p, e) => files.has(p) ? files.get(p) : fs.readFileSync(p, e),
    writeFileSync: (p, v, o) => { if (o && o.flag === 'wx' && files.has(p)) throw new Error('EEXIST'); files.set(p, String(v)); } };
  const pass = async () => ({ schema_version: 1, upstream: d.UPSTREAM, status: 'PASS', error_code: null, tls: { authorized: true, protocol: 'TLSv1.3' } });
  const fail = async () => ({ schema_version: 1, upstream: d.UPSTREAM, status: 'FAIL', error_code: 'UPSTREAM_ENOTFOUND', tls: null });
  const identity = () => ({});
  const write = process.stdout.write; process.stdout.write = () => true;
  try {
    assert.throws(() => d.requirePreflight(c, io), /NETWORK_PREFLIGHT_REQUIRED/);
    files.set(c.api_key_file, 'k'); await assert.rejects(d.networkPreflight(c, { io, check: pass, identity }), /PREFLIGHT_SECRET_PRESENT/); files.delete(c.api_key_file);
    await assert.rejects(d.networkPreflight({ ...c, driver_sha256: '0'.repeat(64) }, { io, check: pass, identity }), /DRIVER_HASH/);
    const failed = await d.networkPreflight(c, { io, check: fail, identity });
    assert.equal(failed.status, 'FAIL'); assert.equal(process.exitCode, 1); process.exitCode = 0;
    assert.throws(() => d.requirePreflight(c, io), /NETWORK_PREFLIGHT_REQUIRED/);
    await assert.rejects(d.networkPreflight(c, { io, check: pass, identity }), /PREFLIGHT_REUSE/);
    files.clear(); await d.networkPreflight(c, { io, check: pass, identity });
    assert.equal(d.requirePreflight(c, io).status, 'PASS');
    assert.throws(() => d.requirePreflight({ ...c, run_id: 'a942r-ffffffff' }, io), /NETWORK_PREFLIGHT_REQUIRED/);
    assert.throws(() => d.requirePreflight({ ...c, driver_sha256: '0'.repeat(64) }, io), /NETWORK_PREFLIGHT_REQUIRED/);
  } finally { process.stdout.write = write; process.exitCode = 0; }
});
