'use strict';
// Offline Electron22/Node16 consumer check for the deployed P4 code closure.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const cp = require('child_process');
const vm = require('vm');
const base = require('../a9-42-office-journey.cjs');
const trial = require('../a9-3440-trial.cjs');
const prepare = require('../a9-42-real-model-prepare.cjs');
const fixture = require('./execution-binding-fixture.cjs');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
assert(output && path.isAbsolute(output) && !fs.existsSync(output), 'NEW_OUTPUT_REQUIRED');
assert.strictEqual(process.versions.electron, '22.3.27');
assert.strictEqual(process.versions.node, '16.17.1');
fs.mkdirSync(output, { recursive: true });
const checks = [];
const entries = ['a9-3440-trial.cjs', 'a9-42-office-journey.cjs', 'a9-42-real-model-trial.cjs'];
for (const entry of entries) {
  const destination = path.join(output, entry);
  const records = base.copyDriverClosure(destination, entry);
  for (const record of records) new vm.Script(fs.readFileSync(path.join(destination, record.path), 'utf8'));
  const deployed = path.join(destination, 'scripts/win7-dev', entry);
  cp.execFileSync(process.execPath, ['-e', 'require(process.argv[1])', deployed], {
    cwd: output, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 10000,
  });
  base.verifyDriverClosure(records, entry, fs, destination);
  const changed = path.join(destination, records[records.length - 1].path);
  fs.appendFileSync(changed, '\n// mutation: dependency byte drift\n');
  assert.throws(() => base.verifyDriverClosure(records, entry, fs, destination), /DRIVER_CLOSURE_HASH/);
  checks.push('deployed_load_and_dependency_mutation:' + entry);
}
let first;
for (const evidenceClass of ['DEV_CHANNEL', 'FORMAL_GATE_A_EXECUTION']) {
  const bindingFile = path.join(output, evidenceClass + '.json');
  fs.writeFileSync(bindingFile, fixture.bytes(evidenceClass));
  const execution = base.loadExecutionBinding({ executionBindingPath: bindingFile });
  if (first) assert.deepStrictEqual(execution.layout, first.layout);
  first = execution;
  const l = execution.layout;
  const config = { schema_version: 1, evidence_class: evidenceClass, profile: 'portable-smoke',
    run_id: execution.run_id, source_commit: execution.source_commit, zip_sha256: execution.package_sha256,
    manifest_sha256: execution.manifest_sha256, helper_sha256: execution.helper_sha256,
    execution_binding_sha256: execution.sha256, driver_sha256: fixture.sha('driver'), source_binding_sha256: fixture.sha('source-binding'),
    task_name: l.task_prefix + 'a93440', real_model_request_limit: 0, deadline_utc: '2026-10-30T14:00:00.000Z',
    ...Object.fromEntries(['run_root','package_root','input_package_root','workspace_root','data_root',
      'zip_path','cmd_path','source_binding_path','execution_binding_path'].map(key => [key, l[key]])) };
  assert.strictEqual(trial.validateConfig(config, { executionBindingPath: bindingFile }), config);
  assert.throws(() => trial.validateConfig({ ...config, evidence_class: 'UNKNOWN' },
    { executionBindingPath: bindingFile }), /CONFIG_EVIDENCE_CLASS/);
  assert.throws(() => trial.validateConfig({ ...config, run_root: 'C:\\A9-DEV\\work\\retired' },
    { executionBindingPath: bindingFile }), /CONFIG_LAYOUT/);
  checks.push('binding_layout_and_rejections:' + evidenceClass);
  const codeRoot = path.join(output, evidenceClass + '-guard');
  const records = base.copyDriverClosure(codeRoot, 'a9-3440-trial.cjs');
  config.driver_sha256 = records.find(item => item.path.endsWith('/a9-3440-trial.cjs')).sha256;
  const binding = { schema_version: 1, execution_files: records,
    ...Object.fromEntries(['source_commit','zip_sha256','manifest_sha256','driver_sha256','execution_binding_sha256']
      .map(key => [key, config[key]])) };
  const bytes = Buffer.from(JSON.stringify(binding)); config.source_binding_sha256 = base.hash(bytes);
  const io = { ...fs, readFileSync: file => file === config.source_binding_path ? bytes : fs.readFileSync(file) };
  const options = { executionBindingPath: bindingFile, codeRoot, io };
  assert.strictEqual(trial.admitConfig(config, options), config);
  fs.appendFileSync(path.join(codeRoot, 'scripts/release/validation/win7-alpha3/deny-set.cjs'), '\n// dependency mutation\n');
  assert.throws(() => trial.admitConfig(config, options), /DRIVER_CLOSURE_HASH/);
  checks.push('real_entry_guard_rejects_dependency_drift:' + evidenceClass);

}
// This calls the public prepare entry (not only its material-emission helper).
prepare.prepare({ source_root: output, zip_path: path.join(output, 'absent.zip'),
  output_root: path.join(output, 'not-created'), source_commit: fixture.source_commit,
  run_id: '11111111-2222-4333-8444-555555555555', session_id: 2,
  execution_binding_path: path.join(output, 'DEV_CHANNEL.json'), target_tools_root: first.layout.tools_root,
  real_model_request_limit: 20, model: 'deepseek-chat', idle_seconds: 60 }).then(
  () => { throw new Error('PREPARE_EXPECTED_REJECTION'); },
  error => {
    assert.strictEqual(error.message, 'PREPARE_EXECUTION_BINDING');
    checks.push('public_prepare_uses_binding_before_package_access');
    const result = { status: 'PASS', evidence_class: 'DEVELOPMENT_ELECTRON_NODE16',
      node: process.versions.node, electron: process.versions.electron, checks,
      win7: 'NOT_PERFORMED', powershell: 'NOT_PERFORMED', network: 'NOT_PERFORMED' };
    fs.writeFileSync(path.join(output, 'RESULT.json'), JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(JSON.stringify(result) + '\n');
  }).catch(error => { process.stderr.write(base.safeError(error) + '\n'); process.exitCode = 1; });
