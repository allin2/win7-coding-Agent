import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const d = require('../a9-42-office-journey.cjs');
const now = Date.parse('2026-10-29T17:00:00.000Z');
function config() {
  const root = 'C:\\A9-DEV\\work\\a942o-1234abcd';
  return { schema_version: 1, evidence_class: 'DEV_CHANNEL', profile: 'office-journey', run_id: 'a942o-1234abcd',
    source_commit: '1'.repeat(40), zip_sha256: '2'.repeat(64), manifest_sha256: '3'.repeat(64), driver_sha256: '4'.repeat(64), source_binding_sha256: '5'.repeat(64),
    manifest_file_count: 1000, session_id: 2, task_name: 'A9-DEV-a942o-1234abcd', deadline_utc: '2026-10-29T17:50:00.000Z', real_model_request_limit: 0,
    input_package_root: 'C:\\A9-DEV\\input\\newpkg', zip_path: 'C:\\A9-DEV\\input.zip', run_root: root + '\\run',
    package_root: root + '\\pkg', workspace_root: root + '\\中文 workspace', data_root: root + '\\pkg\\portable-data',
    cmd_path: root + '\\run\\cmd.exe', source_binding_path: root + '\\run\\source-binding.json' };
}
const names = ['ask_user','document_write_copy','document_read','document_inspect'];
const request = (prompt, results = []) => ({ tools: names.map(name => ({ function: { name } })), messages: [{ role: 'user', content: prompt }, ...results] });
const resultFor = (s, value) => ({ role: 'tool', tool_call_id: s.pending.id, content: JSON.stringify(value) });
test('strict config refuses missing deadline, drifted layout, cross-root, budget and unknown fields', () => {
  assert.equal(d.validateConfig(config(), now).session_id, 2);
  for (const change of [{ deadline_utc: null },{ deadline_utc: '2026-10-29T18:01:00.000Z' },{ deadline_utc: 'yesterday' },
    { real_model_request_limit: 1 },{ session_id: 0 },{ data_root: 'C:\\A9-DEV\\other' },{ run_root: config().package_root },
    { input_package_root: config().workspace_root },{ zip_path: config().run_root + '\\input.zip' },{ driver_sha256: '' },
    { source_commit: 'main' },{ task_name: 'A9DEV_a942o-1234abcd' },{ unexpected: true }]) assert.throws(() => d.validateConfig({ ...config(), ...change }, now));
  assert.equal(d.validateConfig({ ...config(), deadline_utc: null }, now, true).deadline_utc, null);
  assert.throws(() => d.validateConfig(config(), now + 3600000), /CONFIG_DEADLINE/);
});
test('paths reject aliases, devices, traversal, UNC, ADS, drive changes; preserve Chinese, space, percent and hash', () => {
  for (const p of ['C:\\A9-DEV\\中文 空格%#','C:\\A9-DEV\\a.docx']) assert.equal(d.canonical(p), true);
  for (const p of ['C:\\A9-DEV\\..\\outside','C:\\A9-DEV\\x.','C:\\A9-DEV\\x ','C:\\A9-DEV\\NUL.txt',
    'C:\\A9-DEV\\x:ads','C:/A9-DEV/x','\\\\host\\share','D:\\A9-DEV\\x','C:\\A9-DEV-other\\x']) assert.equal(d.canonical(p), false, p);
  assert.throws(() => d.noLinks('C:\\A9-DEV', 'C:\\A9-DEV\\x\\a', { existsSync: () => true, lstatSync: () => ({ isSymbolicLink: () => true }) }), /PHYSICAL_LINK/);
});
test('journey task identity matches the existing channel launcher prefix', async () => {
  const { parseArgs } = await import('../win7-dev.mjs');
  const name = config().run_id;
  assert.equal(parseArgs(['agent-run', name, '"C:\\A9-DEV\\cmd.exe" /c local.cmd']).args[0], name);
  assert.equal(config().task_name, 'A9-DEV-' + name);
});
test('fixture stops at ask, emits a forbidden later write, and refuses unsolicited/unknown results', () => {
  const s = d.makeFixtureState(); const ask = d.fixtureStep(s, request('a942:office:new'));
  assert.deepEqual(ask.tool_calls.map(t => t.function.name), ['ask_user','document_write_copy']);
  assert.throws(() => d.fixtureStep(s, request('a942:office:new')), /UNANSWERED_REDISPATCH/);
  s.phase = 'answer_allowed';
  assert.throws(() => d.fixtureStep(s, request('a942:office:new')), /ANSWER_MISSING/);
  d.fixtureStep(s, request('a942:office:new', [{ role: 'tool', content: '{"status":"answered","answer":"小样本"}' }]));
  assert.throws(() => d.fixtureStep(s, request('a942:office:new', [{ role: 'tool', tool_call_id: 'foreign', content: '{}' }])), /RESULT_ID/);
  assert.throws(() => d.fixtureStep(s, request('a942:office:new', [resultFor(s, { error: { message: 'secret' } })])), /TOOL_FAILED/);
  assert.throws(() => d.fixtureStep(d.makeFixtureState(), request('do shell')), /FIXTURE_PROMPT/);
  assert.throws(() => d.fixtureStep(d.makeFixtureState(), { ...request('a942:office:new'), tools: [] }), /TOOLS_MISSING/);
});
test('fixture consumes actual success facts and binds copy to the hash returned by read', () => {
  const s = d.makeFixtureState(); d.fixtureStep(s, request('a942:office:new')); s.phase = 'answer_allowed';
  d.fixtureStep(s, request('a942:office:new', [{ role: 'tool', content: '{"status":"answered","answer":"小样本"}' }]));
  const sha = 'a'.repeat(64);
  const send = value => d.fixtureStep(s, request('a942:office:new', [resultFor(s, { path: s.pending.args.path, ...value })]));
  send({ created: true, bytesWritten: 5, fidelity: 'content_only' }); send({ created: true, bytesWritten: 5, fidelity: 'content_only' });
  send({ sha256: sha, canModify: true }); send({ sha256: sha, units: ['原稿甲'] }); send({ sha256: sha });
  assert.ok(send({ sha256: sha, units: ['项目'] }).content);
  d.fixtureStep(s, request('a942:office:copy'));
  const copy = d.fixtureStep(s, request('a942:office:copy', [resultFor(s, { path: d.FILES.doc, sha256: sha })]));
  assert.equal(JSON.parse(copy.tool_calls[0].function.arguments).sourceSha256, sha);
  assert.throws(() => d.fixtureStep(s, request('a942:office:copy', [resultFor(s, { path: d.FILES.copy, created: true, bytesWritten: 5, fidelity: 'content_only', sourceSha256: 'b'.repeat(64) })])), /COPY_BINDING/);
});
function post(url, body, route = '/chat/completions') {
  return new Promise((resolve, reject) => {
    const req = http.request(url + route, { method: 'POST', headers: { Authorization: 'Bearer SECRET_SENTINEL' } }, res => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ code: res.statusCode, body }));
    }); req.on('error', reject); req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}
test('real loopback HTTP probe, unanswered redispatch refusal, stop and no secret-bearing logs', async () => {
  const logs = []; const f = d.startFixture(e => logs.push(e));
  try {
    const url = await f.listen(); assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    const probe = await post(url, { tools: [{ function: { name: 'probe_test_echo' } }], messages: [] });
    assert.equal(probe.code, 200); assert.match(probe.body, /probe_ok/);
    assert.equal((await post(url, request('a942:office:new'))).code, 200);
    const count = f.state.requests; await new Promise(r => setTimeout(r, 30)); assert.equal(f.state.requests, count);
    assert.equal((await post(url, request('a942:office:new'))).code, 400);
    assert.equal(f.state.stopped, true);
    assert.equal((await post(url, request('a942:office:new'))).code, 400);
    assert.equal(JSON.stringify(logs).includes('SECRET_SENTINEL'), false);
    assert.equal(d.safeError(new Error('Authorization: Bearer SECRET_SENTINEL')), 'DRIVER_OPERATION_FAILED');
  } finally { await f.close(); }
});
test('HTTP malformed JSON, route, deadline and request cap fail closed', async () => {
  for (const scenario of ['json','route','deadline','limit','stop']) {
    const f = d.startFixture(() => {}, scenario === 'deadline' ? { deadline: Date.now() - 1 } : {});
    try {
      const url = await f.listen(); if (scenario === 'limit') f.state.requests = 16; if (scenario === 'stop') f.stop();
      const r = await post(url, scenario === 'json' ? '{invalid SECRET_SENTINEL' : request('a942:office:new'), scenario === 'route' ? '/evil' : '/chat/completions');
      assert.equal(r.code, 400); assert.equal(f.state.stopped, true); assert.equal(r.body.includes('SECRET_SENTINEL'), false);
    } finally { await f.close(); }
  }
});
test('task CSV preserves exact names and rejects unparseable observations', () => {
  assert.deepEqual(d.parseTaskNames('"\\A9DEV_a942o-1234abcd","N/A","Ready"\r\n"\\其他,任务","N/A","Ready"\r\n'), ['\\A9DEV_a942o-1234abcd','\\其他,任务']);
  assert.throws(() => d.parseTaskNames('not a task query'), /TASK_QUERY_PARSE/);
});
test('manifest verification rejects injected files, hash drift and symlink paths', () => {
  const c = config(); c.manifest_file_count = 101;
  const files = Array.from({ length: 101 }, (_, i) => ({ path: `f${i}.js`, size: 2, sha256: d.hash('ok') }));
  const manifest = Buffer.from(JSON.stringify({ source_commit: c.source_commit, source_dirty: false, external_acceptance_eligible: false, files }));
  c.manifest_sha256 = d.hash(manifest);
  let injected = false; let drift = false; let link = false;
  const io = { existsSync: () => true, lstatSync: () => ({ isSymbolicLink: () => link }),
    readFileSync: file => String(file).endsWith('release-manifest.json') ? manifest : Buffer.from(drift ? 'no' : 'ok'),
    readdirSync: () => [...files.map(e => e.path), 'release-manifest.json', ...(injected ? ['app.asar'] : [])]
      .map(name => ({ name, isSymbolicLink: () => false, isDirectory: () => false })) };
  assert.equal(d.verifyPackage(c, c.input_package_root, io).files, 101);
  injected = true; assert.throws(() => d.verifyPackage(c, c.input_package_root, io), /PACKAGE_EXTRA_FILE/); injected = false;
  drift = true; assert.throws(() => d.verifyPackage(c, c.input_package_root, io), /PACKAGE_FILE_HASH/); drift = false;
  link = true; assert.throws(() => d.verifyPackage(c, c.input_package_root, io), /PHYSICAL_LINK/);
});
