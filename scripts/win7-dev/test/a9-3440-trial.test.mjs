import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const trial = require('../a9-3440-trial.cjs');
const stamp = '20261028010000.000000-420';
const root = { pid: 10, parent: 1, created: stamp, image: 'C:\\A9-DEV\\electron.exe', session: 1, name: 'electron.exe' };
const child = { ...root, pid: 11, parent: 10, created: '20261028010001.000000-420', image: 'C:\\A9-DEV\\cmd.exe', name: 'cmd.exe' };
const sgtool = { ...child, image: 'C:\\Program Files (x86)\\SogouInput\\16.7.0.4673\\SGTool.exe',
  imageSource: 'executable_path', name: 'SGTool.exe' };

test('observed process instances require identity and never turn query failure into absence', () => {
  assert.throws(() => trial.parseProcesses(''), /PROCESS_QUERY_EMPTY/);
  assert.throws(() => trial.parseProcesses('ProcessId\n10'), /PROCESS_QUERY_COLUMNS/);
  assert.throws(() => trial.remainingInstances([root], []), /PROCESS_EVIDENCE_MISSING/);
  assert.throws(() => trial.remainingInstances([root], [{ ...root, created: '' }]), /PROCESS_CURRENT_IDENTITY_UNKNOWN/);
  assert.deepEqual(trial.remainingInstances([root, child], [{ ...root, pid: 1 }, child]), [child]);
  assert.deepEqual(trial.remainingInstances([root], [{ ...root, created: '20261028020000.000000-420' }]), []);
});

test('process-tree collection excludes stale parent links but fails on unknown child identity', () => {
  const stale = { ...child, pid: 12, created: '20261028005959.000000-420' };
  assert.deepEqual(trial.observedTree([root, child, stale], root.pid), [root, child]);
  assert.throws(() => trial.observedTree([root, { ...child, image: '' }], root.pid), /PROCESS_CHILD_IDENTITY_UNKNOWN/);
  assert.throws(() => trial.observedTree([root, { ...child, session: 0 }], root.pid), /PROCESS_CHILD_IDENTITY_UNKNOWN/);
  const rows = trial.parseProcesses('Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId,SessionId\r\n'
    + `HOST,${stamp},"C:\\A9-DEV\\folder, space\\electron.exe",electron.exe,1,10,1\r\n`);
  assert.equal(rows[0].image, 'C:\\A9-DEV\\folder, space\\electron.exe');
  assert.equal(rows[0].imageSource, 'executable_path');
});

test('SGTool classification requires direct normalized image and valid complete session identity', () => {
  assert.equal(trial.isSgToolEnvironment(sgtool, 1), true);
  assert.equal(trial.isSgToolEnvironment({ ...sgtool, image: sgtool.image.toUpperCase(), name: 'sgtool.exe' }, 1), true);
  for (const change of [
    { image: 'C:\\Program Files (x86)\\SogouInput-other\\SGTool.exe' },
    { image: 'C:\\Program Files (x86)\\SogouInput\\..\\other\\SGTool.exe' },
    { image: 'C:\\Program Files (x86)\\SogouInput\\version\\..\\SGTool.exe' },
    { image: 'C:\\Program Files (x86)\\SogouInput\\version.\\SGTool.exe' },
    { image: 'C:\\Program Files (x86)\\SogouInput\\version \\SGTool.exe' },
    { image: 'C:\\Program Files (x86)\\SogouInput\\SGTool.exe:stream' },
    { image: '\\\\host\\share\\SogouInput\\SGTool.exe' },
    { image: 'C:\\A9-DEV\\SGTool.exe' },
    { image: 'C:\\Program Files (x86)\\SogouInput\\SogouExe.exe' },
    { image: '' }, { image: null }, { name: 'SogouExe.exe' }, { name: '' },
    { imageSource: 'command_line' }, { imageSource: undefined },
    { pid: 0 }, { pid: -1 }, { pid: 1.5 }, { parent: 0 }, { parent: undefined },
    { session: 2 }, { session: null }, { session: '1' },
    { created: '' }, { created: 'UNKNOWN' }, { created: '20261328010001.000000-420' },
    { created: '20260230010001.000000-420' }, { created: '20261028240001.000000-420' },
    { created: '20261028010001.000000-999' },
  ]) {
    assert.equal(trial.isSgToolEnvironment({ ...sgtool, ...change }, 1), false, JSON.stringify(change));
  }
  assert.equal(trial.isSgToolEnvironment(sgtool, null), false);
  assert.equal(trial.isSgToolEnvironment(null, 1), false);
  const missing = trial.parseProcesses('Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId,SessionId\n'
    + `HOST,${stamp},,SGTool.exe,10,11,\n`)[0];
  assert.equal(missing.imageSource, null);
  assert.equal(missing.session, null);
  assert.equal(trial.isSgToolEnvironment(missing, 1), false);
  assert.throws(() => trial.parseProcesses('Node,CreationDate,ExecutablePath,ParentProcessId,ProcessId,SessionId\n'
    + `HOST,${stamp},C:\\x.exe,10,11,1\n`), /PROCESS_QUERY_COLUMNS/);
});

test('environment classification retains the complete tree and blocks ordinary and late descendants', () => {
  const grandchild = { ...child, pid: 12, parent: sgtool.pid,
    created: '20261028010002.000000-420' };
  const initial = trial.observedTree([root, sgtool, grandchild], root.pid);
  assert.deepEqual(initial, [root, sgtool, grandchild]);
  const current = [sgtool, grandchild];
  const observation = trial.processObservation(initial, current, 1);
  assert.deepEqual(observation.remaining_instances, [sgtool, grandchild]);
  assert.deepEqual(observation.blocking_instances, [grandchild]);
  assert.equal(observation.environment_instances[0].state, 'present');
  assert.deepEqual(observation.environment_instances[0].current_instance, sgtool);
  const extended = trial.extendObservedTree([root, sgtool], current, 1);
  assert.deepEqual(extended, [root, sgtool, grandchild]);
  assert.deepEqual(trial.processObservation(extended, current, 1).blocking_instances, [grandchild]);
  assert.throws(() => trial.extendObservedTree([root, sgtool], [sgtool, { ...grandchild, image: '' }], 1),
    /PROCESS_CHILD_IDENTITY_UNKNOWN/);
  assert.throws(() => trial.extendObservedTree([root, sgtool], [sgtool, { ...grandchild, session: 2 }], 1),
    /PROCESS_CHILD_IDENTITY_UNKNOWN/);
  const reusedParent = { ...sgtool, parent: 99, created: '20261028010003.000000-420' };
  const unrelatedChild = { ...grandchild, created: '20261028010004.000000-420' };
  assert.deepEqual(trial.extendObservedTree([root, sgtool], [reusedParent, unrelatedChild], 1), [root, sgtool]);
});

test('SGTool observations preserve absent and reused states and never exempt changed or unknown identity', () => {
  for (const change of [
    { image: 'C:\\Program Files (x86)\\SogouInput\\different\\SGTool.exe' },
    { parent: 99 }, { session: 2 }, { imageSource: 'command_line' }, { name: 'other.exe' },
  ]) {
    const current = { ...sgtool, ...change };
    const observation = trial.processObservation([root, sgtool], [current], 1);
    assert.deepEqual(observation.blocking_instances, [sgtool]);
    assert.equal(observation.environment_instances[0].state, 'identity_changed');
  }
  assert.throws(() => trial.processObservation([root, sgtool], [{ ...sgtool, image: '' }], 1),
    /PROCESS_CURRENT_IDENTITY_UNKNOWN/);
  const absent = trial.processObservation([root, sgtool], [{ ...root, pid: 99 }], 1);
  assert.deepEqual(absent.blocking_instances, []);
  assert.equal(absent.environment_instances[0].state, 'absent');
  const reused = trial.processObservation([root, sgtool], [{ ...sgtool, created: '20261028020000.000000-420' }], 1);
  assert.equal(reused.environment_instances[0].state, 'pid_reused');
  assert.deepEqual(reused.remaining_instances, []);
  const oldSourceUnknown = { ...sgtool, imageSource: undefined };
  const noRetroactiveClassification = trial.processObservation([root, oldSourceUnknown], [sgtool], 1);
  assert.deepEqual(noRetroactiveClassification.blocking_instances, [oldSourceUnknown]);
  assert.deepEqual(noRetroactiveClassification.environment_instances, []);
});

test('trial paths cannot overlap protected roots or use Windows path aliases', () => {
  assert.equal(trial.inside('C:\\A9-DEV', 'C:\\A9-DEV\\run\\fixture.cjs'), true);
  for (const file of ['C:\\A9-DEV-other\\x', 'C:\\A9-DEV\\..\\x', 'C:\\A9-DEV', '\\\\host\\share\\x', 'C:\\A9-DEV\\x:stream']) {
    assert.equal(trial.inside('C:\\A9-DEV', file), false, file);
  }
});

test('trial admission binds the exact development package and refuses broader execution budgets', () => {
  const config = { schema_version: 1, evidence_class: 'DEV_CHANNEL',
    source_commit: 'f68b6c8eb748f548b2306f5263bc02cf180f1ef7',
    zip_sha256: 'efccd14a97fd146aa22e37c23e028d1aa04a7a7590df80c9dbbd7a2182469bcc',
    helper_sha256: '2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7',
    manifest_sha256: 'a'.repeat(64), driver_sha256: 'b'.repeat(64), run_root: 'C:\\A9-DEV\\trials\\one',
    package_root: 'C:\\A9-DEV\\cand\\one', cmd_path: 'C:\\A9-DEV\\trials\\one\\cmd.exe',
    real_model_request_limit: 0, deadline_utc: '2026-10-28T08:00:00Z' };
  assert.equal(trial.validateConfig(config), config);
  for (const change of [{ source_commit: '0'.repeat(40) }, { zip_sha256: '0'.repeat(64) },
    { real_model_request_limit: 1 }, { deadline_utc: null }, { cmd_path: 'C:\\Windows\\System32\\cmd.exe' },
    { package_root: config.run_root + '\\package' }, { run_root: 'C:\\outside' }]) {
    assert.throws(() => trial.validateConfig({ ...config, ...change }));
  }
});

test('fixture dispatch is limited to the selected prompt and exactly one background start', () => {
  const commands = { progress: 'fixed command' };
  const messages = [{ role: 'user', content: 'a93440:progress' }];
  const first = trial.fixtureStep({ messages }, commands, true);
  assert.equal(first.tool_calls[0].function.name, 'start_process');
  assert.deepEqual(JSON.parse(first.tool_calls[0].function.arguments), { command: 'fixed command' });
  assert.equal(trial.fixtureStep({ messages: [...messages, { role: 'tool', content: 'started' }] }, commands, true).content, 'Controlled fixture completed.');
  assert.throws(() => trial.fixtureStep({ messages: [{ role: 'user', content: 'arbitrary shell' }] }, commands, true), /FIXTURE_PROMPT_REJECTED/);
  assert.throws(() => trial.fixtureStep({ messages }, commands, false), /FIXTURE_RESTART_REQUEST/);
  assert.throws(() => trial.fixtureStep({ tools: [{ function: { name: 'probe_test_echo' } }] }, commands, false), /FIXTURE_RESTART_REQUEST/);
});

test('portable admission separates the original-input package from recovery runs and preserves input roots', () => {
  const config = { schema_version: 1, evidence_class: 'DEV_CHANNEL', profile: 'portable-smoke',
    source_commit: '158a737fc56247deea5351a94380533bcbf507ca',
    zip_sha256: '1e8fb7724a378c4a0a2e803aeb1c0f11c61a1626ce4ee46a5832b7fb048f9429',
    helper_sha256: '2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7',
    manifest_sha256: '04f2b608ef41951773522f10792bb9fcccaff561e57d9cfddb3998632cc641ef',
    driver_sha256: 'b'.repeat(64), run_root: 'C:\\A9-DEV\\trials\\portable',
    package_root: 'C:\\A9-DEV\\portable\\one\\app', input_package_root: 'C:\\A9-DEV\\cand\\original\\app',
    cmd_path: 'C:\\A9-DEV\\trials\\portable\\cmd.exe', real_model_request_limit: 0,
    deadline_utc: '2026-10-28T18:00:00Z' };
  assert.equal(trial.validateConfig(config), config);
  for (const change of [
    { profile: undefined }, { profile: 'unknown' },
    { source_commit: 'f68b6c8eb748f548b2306f5263bc02cf180f1ef7' },
    { zip_sha256: 'efccd14a97fd146aa22e37c23e028d1aa04a7a7590df80c9dbbd7a2182469bcc' },
    { manifest_sha256: 'a'.repeat(64) }, { real_model_request_limit: 1 },
    { input_package_root: 'C:\\outside\\app' },
    { input_package_root: config.package_root.toUpperCase() },
    { input_package_root: config.run_root },
    { input_package_root: config.package_root + '\\source' },
    { package_root: config.input_package_root + '\\copy' },
  ]) assert.throws(() => trial.validateConfig({ ...config, ...change }));
});

test('actual loopback fixture returns SSE and rejects all restart requests', async () => {
  const logs = [];
  const fixture = trial.startFixture({ progress: 'fixed command' }, (entry) => logs.push(entry));
  const url = await fixture.listen();
  const request = () => new Promise((resolve, reject) => {
    const req = http.request(url + '/chat/completions', { method: 'POST' }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ messages: [{ role: 'user', content: 'a93440:progress' }] }));
  });
  try {
    const first = await request();
    assert.equal(first.status, 200);
    assert.match(first.body, /start_process/);
    assert.match(first.body, /data: \[DONE\]/);
    fixture.state.allowDispatch = false;
    assert.equal((await request()).status, 400);
    assert.deepEqual(fixture.state.errors, ['FIXTURE_RESTART_REQUEST']);
    assert.equal(logs.length, 1);
  } finally { await new Promise((resolve) => fixture.server.close(resolve)); }
});

test('external driver runtime preserves physical bytes without the packaged app entry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a93440-driver-'));
  const packageRoot = path.join(root, 'package');
  const runRoot = path.join(root, 'run');
  const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  const files = [];
  for (const [relative, content] of [['electron.exe', 'runtime'], ['resources/default_app.asar', 'physical-asar'],
    ['locales/en-US.pak', 'locale'], ['resources/app/package.json', '{"main":"product/main.js"}']]) {
    const file = path.join(packageRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    files.push({ path: relative, size: Buffer.byteLength(content), sha256: digest(content) });
  }
  fs.writeFileSync(path.join(packageRoot, 'release-manifest.json'), JSON.stringify({ files }));
  const config = { package_root: packageRoot, run_root: runRoot,
    driver_sha256: digest(fs.readFileSync(new URL('../a9-3440-trial.cjs', import.meta.url))) };
  const runtime = trial.prepareDriverRuntime(config, fs);
  assert.equal(fs.readFileSync(path.join(path.dirname(runtime.executable), 'resources/default_app.asar'), 'utf8'), 'physical-asar');
  assert.equal(fs.existsSync(path.join(path.dirname(runtime.executable), 'resources/app')), false);
  assert.equal(digest(fs.readFileSync(path.join(runtime.app_root, 'main.cjs'))), config.driver_sha256);
  assert.throws(() => trial.prepareDriverRuntime(config, fs), /DRIVER_RUNTIME_EXISTS/);
  fs.writeFileSync(path.join(packageRoot, 'electron.exe'), 'changed');
  assert.throws(() => trial.prepareDriverRuntime({ ...config, run_root: path.join(root, 'bad') }, fs), /DRIVER_RUNTIME_SOURCE_HASH/);
});
