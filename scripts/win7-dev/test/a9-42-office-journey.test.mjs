import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const d = require('../a9-42-office-journey.cjs');
const { verifySourceIdentity, prepare } = require('../a9-42-office-prepare.cjs');
const authority = require('../../release/validation/win7-alpha3/authority.cjs');
const fixture = require('./execution-binding-fixture.cjs');
const now = Date.parse('2026-10-29T17:00:00.000Z');
const RUN_ID = fixture.RUN_ID;
const sha = value => authority.sha256(Buffer.from(value, 'utf8'));
function bindingBytes(evidenceClass = 'DEV_CHANNEL') {
  return fixture.bytes(evidenceClass);
}
const binding = bindingBytes();
const bindingSha = authority.sha256(binding);
const source = sha('source').slice(0, 40);
function config() {
  const layout = d.expandExecutionLayout({ run_id: RUN_ID });
  return { schema_version: 1, evidence_class: 'DEV_CHANNEL', profile: 'office-journey', run_id: RUN_ID,
    source_commit: source, zip_sha256: sha('package'), manifest_sha256: sha('manifest'), driver_sha256: sha('driver'), source_binding_sha256: sha('binding'),
    manifest_file_count: 1000, session_id: 2, task_name: 'A9-DEV-3f1c2a52-office-journey', deadline_utc: '2026-10-29T17:50:00.000Z', real_model_request_limit: 0,
    input_package_root: layout.input_package_root, zip_path: layout.zip_path, run_root: layout.run_root,
    package_root: layout.package_root, workspace_root: layout.workspace_root, data_root: layout.data_root,
    cmd_path: layout.cmd_path, source_binding_path: layout.source_binding_path,
    execution_binding_path: layout.execution_binding_path, execution_binding_sha256: bindingSha, helper_sha256: sha('helper') };
}
const names = ['ask_user','document_write_copy','document_read','document_inspect'];
const request = (prompt, results = []) => ({ tools: names.map(name => ({ function: { name } })), messages: [{ role: 'user', content: prompt }, ...results] });
const resultFor = (s, value) => ({ role: 'tool', tool_call_id: s.pending.id, content: JSON.stringify(value) });
test('strict config refuses missing deadline, drifted layout, cross-root, budget and unknown fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a942-office-binding-'));
  const bindingFile = path.join(root, 'execution-binding.json'); fs.writeFileSync(bindingFile, binding);
  const c = config();
  assert.equal(d.validateConfig(c, now, false, { executionBindingPath: bindingFile }).session_id, 2);
  for (const change of [{ deadline_utc: null },{ deadline_utc: '2026-10-29T18:01:00.000Z' },{ deadline_utc: 'yesterday' },
    { real_model_request_limit: 1 },{ session_id: 0 },{ data_root: 'C:\\A9-DEV\\other' },{ run_root: config().package_root },
    { input_package_root: config().workspace_root },{ zip_path: config().run_root + '\\input.zip' },{ driver_sha256: '' },
    { source_commit: 'main' },{ task_name: 'A9DEV_a942o-1234abcd' },{ unexpected: true }]) assert.throws(() => d.validateConfig({ ...c, ...change }, now, false, { executionBindingPath: bindingFile }));
  assert.equal(d.validateConfig({ ...c, deadline_utc: null }, now, true, { executionBindingPath: bindingFile }).deadline_utc, null);
  assert.throws(() => d.validateConfig(c, now + 3600000, false, { executionBindingPath: bindingFile }), /CONFIG_DEADLINE/);
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
  const execution = d.loadExecutionBinding({ executionBindingBytes: binding });
  assert.equal(parseArgs(['agent-run', name, '"C:\\A9-DEV\\run\\3f1c2a52\\t\\cmd.exe" /c local.cmd']).args[0], name);
  assert.equal(config().task_name, 'A9-DEV-3f1c2a52-office-journey');
  assert.equal(d.expandExecutionLayout({ run_id: RUN_ID }).run_root, 'C:\\A9-DEV\\run\\3f1c2a52');
  assert.equal(execution.layout.task_prefix, 'A9-DEV-3f1c2a52-');
});
test('launcher ownership follows only the exact one or two approved cmd ancestors', () => {
  const c = config();
  const row = (pid, parent, second, image = c.cmd_path) => ({ pid, parent, created: `202610300028${second}.000000+480`, image, session: c.session_id });
  const current = row(30, 20, '20', c.input_package_root + '\\electron.exe');
  const inner = row(20, 10, '19'); const outer = row(10, 1, '18');
  const unrelated = row(99, 1, '17');
  assert.deepEqual(d.launcherInstances([current, inner, outer, unrelated], current, c).map(r => r.pid), [30, 20, 10]);
  assert.deepEqual(d.launcherInstances([current, { ...inner, parent: 1 }, unrelated], current, c).map(r => r.pid), [30, 20]);
  for (const mutation of [{ session: 9 }, { created: 'unknown' }, { created: '20261030002900.000000+480' }, { image: 'C:\\other\\cmd.exe' }]) {
    assert.throws(() => d.launcherInstances([current, { ...inner, ...mutation }, outer], current, c), /LAUNCHER_ANCESTOR_IDENTITY/);
  }
  assert.throws(() => d.launcherInstances([current, { ...inner, parent: 30 }], current, c), /LAUNCHER_CHAIN_DEPTH/);
  assert.throws(() => d.launcherInstances([current, inner, { ...outer, parent: 2 }, row(2, 1, '16')], current, c), /LAUNCHER_CHAIN_DEPTH/);
});
test('source binding accepts later evidence-only commits but rejects changed, dirty or new source files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a942-binding-source-'));
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = () => { git(['add', '--', 'src', 'record.md']); git(['-c', 'user.name=A9 Fixture',
    '-c', 'user.email=a9-fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'local fixture']); };
  git(['init', '--quiet']); fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/main.ts'), 'export const current = 1;\n');
  fs.writeFileSync(path.join(root, 'record.md'), 'first\n'); commit();
  const source_commit = git(['rev-parse', 'HEAD']).trim(); const spec = { source_root: root, source_commit };
  const original = verifySourceIdentity(spec);
  fs.writeFileSync(path.join(root, 'record.md'), 'later evidence\n'); commit();
  assert.equal(verifySourceIdentity(spec).source_tree, original.source_tree);
  assert.notEqual(verifySourceIdentity(spec).binding_tool_commit, source_commit);
  fs.writeFileSync(path.join(root, 'src/main.ts'), 'export const current = 2;\n');
  assert.throws(() => verifySourceIdentity(spec), /PREPARE_SOURCE_DIRTY/);
  fs.writeFileSync(path.join(root, 'src/main.ts'), 'export const current = 1;\n');
  fs.writeFileSync(path.join(root, 'src/new.ts'), 'untracked\n');
  assert.throws(() => verifySourceIdentity(spec), /PREPARE_SOURCE_DIRTY/);
  commit(); assert.throws(() => verifySourceIdentity(spec), /PREPARE_CURRENT_SOURCE/);
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
test('exact task observation requires the bound name and SID and explicit absence', () => {
  const c = config(); const task = { exists: true, path: '\\' + c.task_name, sid: 'S-1-5-21-1708701742-428676696-1831205153-1001' };
  assert.deepEqual(d.taskNamesFromObservation(task, c), [task.path]);
  assert.deepEqual(d.taskNamesFromObservation({ exists: false }, c), []);
  for (const changed of [{ ...task, sid: 'other' }, { ...task, path: '\\other' }, { exists: 'false' },
    { exists: false, error: 'ACCESS_DENIED' }, { exists: true }]) {
    assert.throws(() => d.taskNamesFromObservation(changed, c), /TASK_QUERY_(PARSE|IDENTITY)/);
  }
});
test('native click errors retain a bounded diagnostic code without raw renderer text', async () => {
  for (const [raw, expected] of [['Error invoking renderer: Error: UI_ACTION_OCCLUDED SECRET_SENTINEL', 'UI_ACTION_OCCLUDED'],
    ['Error: UI_ACTION_UNAVAILABLE', 'UI_ACTION_UNAVAILABLE'], ['private renderer detail SECRET_SENTINEL', 'UI_ACTION_FAILED']]) {
    let inputs = 0;
    const port = { evaluate: async () => { throw new Error(raw); }, focus() {}, sendInputEvent() { inputs += 1; } };
    await assert.rejects(d.clickUi(port, '#fixture'), error => error.message === expected);
    assert.equal(inputs, 0);
  }
});
test('manifest verification rejects injected files, hash drift and symlink paths', () => {
  const c = config(); c.manifest_file_count = 101;
  const files = Array.from({ length: 101 }, (_, i) => ({ path: `f${i}.js`, size: 2, sha256: d.hash('ok') }));
  const manifest = Buffer.from(JSON.stringify({ source_commit: c.source_commit, source_dirty: false, external_acceptance_eligible: true, files }));
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
test('execution binding rejects wrong class, CLI root override, old work root, and accepts the new layout', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a942-binding-layout-'));
  const devFile = path.join(root, 'dev.json'); fs.writeFileSync(devFile, binding);
  const formalFile = path.join(root, 'formal.json'); fs.writeFileSync(formalFile, bindingBytes('FORMAL_GATE_A_EXECUTION'));
  const dev = config();
  const loaded = d.loadExecutionBinding({ executionBindingPath: devFile });
  assert.equal(loaded.evidence_class, 'DEV_CHANNEL');
  assert.equal(loaded.layout.run_root, 'C:\\A9-DEV\\run\\3f1c2a52');
  assert.equal(loaded.layout.package_root, 'C:\\A9-DEV\\run\\3f1c2a52\\p');
  assert.equal(loaded.layout.workspace_root, 'C:\\A9-DEV\\run\\3f1c2a52\\w');
  assert.equal(loaded.layout.data_root, 'C:\\A9-DEV\\run\\3f1c2a52\\p\\portable-data');
  const old = { ...dev, run_root: 'C:\\A9-DEV\\work\\a942o-1234abcd' };
  assert.throws(() => d.validateConfig(old, now, false, { executionBindingPath: devFile }), /CONFIG_LAYOUT/);
  assert.throws(() => d.validateConfig({ ...dev, evidence_class: 'FORMAL_GATE_A_EXECUTION' }, now, false, { executionBindingPath: devFile }), /CONFIG_EVIDENCE_CLASS/);
  assert.throws(() => d.validateConfig(dev, now, false,
    { executionBindingPath: devFile, argv: ['--run-root=C:\\outside'] }), /CONFIG_CLI_OVERRIDE/);
  assert.throws(() => d.validateConfig(dev, now, false,
    { executionBindingPath: devFile, argv: ['--data-root=C:\\outside'] }), /CONFIG_CLI_OVERRIDE/);
  assert.throws(() => d.validateConfig(dev, now, false,
    { executionBindingPath: devFile, env: { A9_DEV_ROOT: 'C:\\outside' } }), /CONFIG_ENV_OVERRIDE/);
  assert.throws(() => d.validateConfig({ ...dev, execution_binding_path: '' }, now, false, { executionBindingPath: devFile }), /CONFIG_EXECUTION_BINDING_PATH/);
  assert.throws(() => d.validateConfig({ ...dev, execution_binding_path: 'C:\\A9-DEV\\run\\other\\t\\execution-binding.json' }, now, false,
    { executionBindingPath: devFile }), /CONFIG_LAYOUT/);
  const formal = d.loadExecutionBinding({ executionBindingPath: formalFile });
  assert.equal(formal.evidence_class, 'FORMAL_GATE_A_EXECUTION');
  assert.deepEqual(formal.layout, loaded.layout);
  assert.equal(d.validateConfig({ ...dev, evidence_class: formal.evidence_class, execution_binding_sha256: formal.sha256 },
    now, false, { executionBindingPath: formalFile }).evidence_class, formal.evidence_class);
});
test('Office prepare validates the layout for both evidence classes before reading source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a942-office-prepare-negative-'));
  try {
    const zipPath = path.join(root, 'input.zip'); fs.writeFileSync(zipPath, 'unit fixture zip');
    const devFile = path.join(root, 'dev.json'); fs.writeFileSync(devFile, binding);
    const formalFile = path.join(root, 'formal.json'); fs.writeFileSync(formalFile, bindingBytes('FORMAL_GATE_A_EXECUTION'));
    const base = { source_root: root, zip_path: zipPath, source_commit: fixture.source_commit,
      run_id: fixture.RUN_ID, session_id: 2 };
    const layout = d.expandExecutionLayout({ run_id: fixture.RUN_ID });
    await assert.rejects(() => prepare({ ...base, output_root: path.join(root, 'formal-out'),
      execution_binding_path: formalFile, target_tools_root: 'C:\\outside' }),
    /PREPARE_TARGET_LAYOUT/);
    await assert.rejects(() => prepare({ ...base, output_root: path.join(root, 'old-out'),
      execution_binding_path: devFile, target_tools_root: 'C:\\A9-DEV\\work\\a942o-1234abcd\\t' }),
    /PREPARE_TARGET_LAYOUT/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('deployed driver closures load outside the repository and reject a changed dependency', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a943-deployed-'));
  for (const entry of ['a9-3440-trial.cjs', 'a9-42-office-journey.cjs', 'a9-42-real-model-trial.cjs']) {
    const deployed = path.join(root, entry);
    const records = d.copyDriverClosure(deployed, entry);
    const file = path.join(deployed, 'scripts/win7-dev', entry);
    execFileSync(process.execPath, ['-e', 'require(process.argv[1])', file], { cwd: root });
    assert.doesNotThrow(() => d.verifyDriverClosure(records, entry, fs, deployed));
    const dependency = path.join(deployed, 'scripts/release/validation/win7-alpha3/deny-set.cjs');
    fs.appendFileSync(dependency, '\n// changed dependency\n');
    assert.throws(() => d.verifyDriverClosure(records, entry, fs, deployed), /DRIVER_CLOSURE_HASH/);
  }
});

test('both public prepares reject changed committed closure and code from a different checkout', async () => {
  const { verifyExecutionSource } = require('../a9-42-office-prepare.cjs');
  const real = require('../a9-42-real-model-prepare.cjs');
  for (const [entry, preparer, fileName] of [
    ['a9-42-office-journey.cjs', prepare, 'a9-42-office-prepare.cjs'],
    ['a9-42-real-model-trial.cjs', real.prepare, 'a9-42-real-model-prepare.cjs'],
  ]) {
    const source = fixture.committedSource(entry); const root = source.root;
    const bindingFile = path.join(root, 'binding.json'); fs.writeFileSync(bindingFile, source.bytes());
    const spec = { source_root: root, source_commit: source.commit, zip_path: path.join(root, 'not-opened.zip'),
      output_root: path.join(root, 'not-created'), run_id: fixture.RUN_ID, session_id: 2,
      execution_binding_path: bindingFile, target_tools_root: d.expandExecutionLayout({ run_id: fixture.RUN_ID }).tools_root,
      ...(entry.includes('real-model') ? { model: 'deepseek-chat', idle_seconds: 60, real_model_request_limit: 20 } : {}) };
    assert.equal(verifyExecutionSource(spec, entry).length, d.driverClosure(entry).length);
    const dependency = path.join(root, 'scripts/release/validation/win7-alpha3/deny-set.cjs');
    const original = fs.readFileSync(dependency); fs.appendFileSync(dependency, '\n// uncommitted dependency\n');
    await assert.rejects(() => preparer(spec), /PREPARE_EXECUTION_SOURCE_MISMATCH/);
    assert.equal(fs.existsSync(spec.output_root), false);
    fs.writeFileSync(dependency, original);
    // Keep the declared source checkout pristine; run the prepare from another tree with drift.
    const alternate = path.join(root, 'other-checkout'); d.copyDriverClosure(alternate, entry);
    for (const name of ['a9-42-office-prepare.cjs', 'a9-42-real-model-prepare.cjs']) {
      fs.copyFileSync(path.resolve('scripts/win7-dev', name), path.join(alternate, 'scripts/win7-dev', name));
    }
    fs.appendFileSync(path.join(alternate, 'scripts/release/validation/win7-alpha3/deny-set.cjs'), '\n// other tree\n');
    const specFile = path.join(root, 'prepare-spec.json'); fs.writeFileSync(specFile, JSON.stringify(spec));
    assert.throws(() => execFileSync(process.execPath,
      [path.join(alternate, 'scripts/win7-dev', fileName), specFile], { cwd: root, stdio: ['ignore','pipe','pipe'] }),
    error => error.status === 1 && error.stderr.toString().trim() === 'PREPARE_EXECUTION_SOURCE_MISMATCH');
    assert.equal(fs.existsSync(spec.output_root), false);
  }
});
