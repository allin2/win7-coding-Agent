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
const fixture = require('./execution-binding-fixture.cjs');
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

test('failed current identity retains the exact failing sample without exposing command lines', () => {
  for (const change of [{ image: '' }, { created: '' }, { image: '', created: '' }]) {
    const current = { ...child, ...change, commandLine: 'private process arguments' };
    const previous = trial.processObservation([root, child], [child], 1);
    assert.deepEqual(previous.blocking_instances, [child]);
    assert.throws(() => trial.processObservation([root, child], [current], 1), error => {
      assert.equal(error.message, 'PROCESS_CURRENT_IDENTITY_UNKNOWN');
      const saved = JSON.parse(JSON.stringify(error.process_identity_failure));
      assert(Number.isFinite(Date.parse(saved.at)));
      assert.equal(saved.observed_instance.pid, child.pid);
      assert.equal(saved.observed_instance.created, child.created);
      assert.equal(saved.current_instance.image, current.image);
      assert.equal(saved.current_instance.created, current.created);
      assert.equal(saved.current_instance.imageSource, null);
      assert.equal(JSON.stringify(saved).includes('private process arguments'), false);
      assert.deepEqual(Object.keys(saved.current_instance).sort(),
        ['created', 'image', 'imageSource', 'name', 'parent', 'pid', 'session']);
      return true;
    });
  }
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a93440-binding-'));
  const bindingFile = path.join(root, 'execution-binding.json'); fs.writeFileSync(bindingFile, fixture.bytes());
  const execution = require('../a9-42-office-journey.cjs').loadExecutionBinding({ executionBindingPath: bindingFile });
  const config = { schema_version: 1, evidence_class: 'DEV_CHANNEL', run_id: fixture.RUN_ID,
    source_commit: fixture.source_commit, zip_sha256: fixture.package_sha256,
    helper_sha256: fixture.helper_sha256, manifest_sha256: fixture.manifest_sha256,
    execution_binding_sha256: execution.sha256, driver_sha256: 'b'.repeat(64), source_binding_sha256: 'c'.repeat(64),
    run_root: execution.layout.run_root, package_root: execution.layout.package_root,
    input_package_root: execution.layout.input_package_root, workspace_root: execution.layout.workspace_root,
    data_root: execution.layout.data_root, zip_path: execution.layout.zip_path,
    cmd_path: execution.layout.cmd_path, source_binding_path: execution.layout.source_binding_path,
    execution_binding_path: execution.layout.execution_binding_path,
    task_name: execution.layout.task_prefix + 'a93440',
    real_model_request_limit: 0, deadline_utc: '2026-10-29T18:00:00.000Z' };
  assert.equal(trial.validateConfig(config, { executionBindingPath: bindingFile }), config);
  for (const change of [{ source_commit: '0'.repeat(40) }, { zip_sha256: '0'.repeat(64) },
    { real_model_request_limit: 1 }, { deadline_utc: null }, { cmd_path: 'C:\\Windows\\System32\\cmd.exe' },
    { package_root: config.run_root + '\\package' }, { run_root: 'C:\\outside' },
    { run_root: 'C:\\A9-DEV\\work\\a942o-1234abcd' }, { evidence_class: 'FORMAL_GATE_A_EXECUTION' }]) {
    assert.throws(() => trial.validateConfig({ ...config, ...change }, { executionBindingPath: bindingFile }));
  }
  assert.throws(() => trial.validateConfig(config, { executionBindingPath: bindingFile, argv: ['--run-root=C:\\outside'] }), /CONFIG_CLI_OVERRIDE/);
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a93440-portable-binding-'));
  const bindingFile = path.join(root, 'execution-binding.json'); fs.writeFileSync(bindingFile, fixture.bytes());
  const execution = require('../a9-42-office-journey.cjs').loadExecutionBinding({ executionBindingPath: bindingFile });
  const config = { schema_version: 1, evidence_class: 'DEV_CHANNEL', profile: 'portable-smoke', run_id: fixture.RUN_ID,
    source_commit: fixture.source_commit, zip_sha256: fixture.package_sha256,
    helper_sha256: fixture.helper_sha256, manifest_sha256: fixture.manifest_sha256,
    execution_binding_sha256: execution.sha256, driver_sha256: 'b'.repeat(64), source_binding_sha256: 'c'.repeat(64),
    run_root: execution.layout.run_root, package_root: execution.layout.package_root,
    input_package_root: execution.layout.input_package_root, workspace_root: execution.layout.workspace_root,
    data_root: execution.layout.data_root, zip_path: execution.layout.zip_path,
    cmd_path: execution.layout.cmd_path, source_binding_path: execution.layout.source_binding_path,
    execution_binding_path: execution.layout.execution_binding_path,
    task_name: execution.layout.task_prefix + 'a93440',
    real_model_request_limit: 0, deadline_utc: '2026-10-29T18:00:00.000Z' };
  assert.equal(trial.validateConfig(config, { executionBindingPath: bindingFile }), config);
  for (const change of [
    { profile: 'unknown' },
    { source_commit: '0'.repeat(40) },
    { zip_sha256: '0'.repeat(64) },
    { manifest_sha256: 'a'.repeat(64) }, { real_model_request_limit: 1 },
    { input_package_root: 'C:\\outside\\app' },
    { input_package_root: config.package_root.toUpperCase() },
    { input_package_root: config.run_root },
    { input_package_root: config.package_root + '\\source' },
    { package_root: config.input_package_root + '\\copy' },
  ]) assert.throws(() => trial.validateConfig({ ...config, ...change }, { executionBindingPath: bindingFile }));
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
  const base = require('../a9-42-office-journey.cjs');
  config.source_binding_path = path.join(root, 'source-binding.json');
  const binding = { schema_version: 1, driver_sha256: config.driver_sha256, execution_files: base.driverClosure('a9-3440-trial.cjs').map(relative => ({
    path: relative, sha256: digest(fs.readFileSync(path.resolve('scripts/win7-dev/../..', relative))) })) };
  const bytes = Buffer.from(JSON.stringify(binding));
  config.source_binding_sha256 = digest(bytes); fs.writeFileSync(config.source_binding_path, bytes);
  const runtime = trial.prepareDriverRuntime(config, fs);
  assert.equal(fs.readFileSync(path.join(path.dirname(runtime.executable), 'resources/default_app.asar'), 'utf8'), 'physical-asar');
  assert.equal(fs.existsSync(path.join(path.dirname(runtime.executable), 'resources/app')), false);
  assert.equal(digest(fs.readFileSync(path.join(runtime.app_root, 'scripts/win7-dev/a9-3440-trial.cjs'))), config.driver_sha256);
  assert.throws(() => trial.prepareDriverRuntime(config, fs), /DRIVER_RUNTIME_EXISTS/);
  fs.writeFileSync(path.join(packageRoot, 'electron.exe'), 'changed');
  assert.throws(() => trial.prepareDriverRuntime({ ...config, run_root: path.join(root, 'bad') }, fs), /DRIVER_RUNTIME_SOURCE_HASH/);
});

test('the shared real-entry guard rejects bound dependency drift before product operations', () => {
  const base = require('../a9-42-office-journey.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a93440-entry-guard-'));
  const records = base.copyDriverClosure(root, 'a9-3440-trial.cjs');
  const execution = base.loadExecutionBinding({ executionBindingBytes: fixture.bytes() }); const l = execution.layout;
  const config = { schema_version: 1, evidence_class: execution.evidence_class, run_id: execution.run_id,
    source_commit: execution.source_commit, zip_sha256: execution.package_sha256,
    manifest_sha256: execution.manifest_sha256, helper_sha256: execution.helper_sha256,
    execution_binding_sha256: execution.sha256,
    driver_sha256: records.find(e => e.path.endsWith('/a9-3440-trial.cjs')).sha256,
    task_name: l.task_prefix + 'a93440', real_model_request_limit: 0, deadline_utc: '2026-10-30T18:00:00.000Z',
    ...Object.fromEntries(['run_root','package_root','input_package_root','workspace_root','data_root','zip_path',
      'cmd_path','source_binding_path','execution_binding_path'].map(key => [key, l[key]])) };
  const binding = { schema_version: 1, execution_files: records,
    ...Object.fromEntries(['source_commit','zip_sha256','manifest_sha256','driver_sha256','execution_binding_sha256']
      .map(key => [key, config[key]])) };
  let bytes = Buffer.from(JSON.stringify(binding)); config.source_binding_sha256 = base.hash(bytes);
  const io = { ...fs, readFileSync: file => file === config.source_binding_path ? bytes : fs.readFileSync(file) };
  const options = { executionBindingBytes: fixture.bytes(), codeRoot: root, io };
  assert.strictEqual(trial.admitConfig(config, options), config);
  for (const relative of ['scripts/win7-dev/a9-42-office-journey.cjs',
    'scripts/release/validation/win7-alpha3/authority.cjs', 'scripts/release/validation/win7-alpha3/deny-set.cjs']) {
    const file = path.join(root, relative); const original = fs.readFileSync(file);
    fs.appendFileSync(file, '\n// changed after approval\n');
    assert.throws(() => trial.admitConfig(config, options), /DRIVER_CLOSURE_HASH/);
    fs.writeFileSync(file, original);
  }
  const original = bytes; bytes = Buffer.from(JSON.stringify({ ...binding, source_commit: '0'.repeat(40) }));
  assert.throws(() => trial.admitConfig(config, options), /SOURCE_BINDING_HASH/);
  config.source_binding_sha256 = base.hash(bytes);
  assert.throws(() => trial.admitConfig(config, options), /SOURCE_BINDING_IDENTITY/);
  bytes = original;
});
