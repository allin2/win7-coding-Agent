import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildA9ProductCandidate } from '../build-a9-product-v3.mjs';
import { sha256File, writeJson } from '../release-contract.mjs';
import { writeDeterministicZip } from '../zip-utils.mjs';
import { syntheticV25Pe } from './v25-evidence-fixture.mjs';

// A9-39 batch-2 producer, integrity and report identity tests. Dev-machine evidence only: no Electron, no Windows, no Win10, no Win7.
const require = createRequire(import.meta.url);
const fixtures = require('../../../release/win7-product-v3/a9-batch2-fixtures.cjs');
const requests = require('../../../release/win7-product-v3/a9-batch2-desktop-request.cjs');
const integrity = require('../../../release/win7-product-v3/a9-batch2-package-integrity.cjs');
const reportTool = require('../../../release/win7-product-v3/a9-batch2-report.cjs');
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const HASH = '0'.repeat(64);
const RUN_ID = '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44';
const ELECTRON_ENV = { runtimeVersions: { electron: '22.3.27', node: '16.17.1', modules: '110' }, execPath: path.join(os.tmpdir(), 'TEST_ONLY', 'electron.exe'), loadOriginalFs: () => fs };

function cleanSourceFixture(root) {
  const snapshot = path.join(root, 'source-repository');
  fs.mkdirSync(snapshot, { recursive: true });
  const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: process.cwd(), encoding: 'utf8' }).trim().split('\n');
  for (const relative of names) {
    const source = path.join(process.cwd(), relative);
    if (relative.includes('/dist/') || !fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const destination = path.join(snapshot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  fs.appendFileSync(path.join(snapshot, '.gitignore'), '\n**/dist/\n**/node_modules\n', 'utf8');
  for (const module of ['core', 'gateway', 'git-adapter', 'runner', 'shell', 'state', 'workspace']) {
    fs.symlinkSync(fs.realpathSync(path.join(process.cwd(), 'src', module, 'node_modules')), path.join(snapshot, 'src', module, 'node_modules'), 'dir');
  }
  execFileSync('git', ['init', '--quiet'], { cwd: snapshot });
  execFileSync('git', ['add', '.'], { cwd: snapshot });
  execFileSync('git', ['-c', 'user.name=A9 Fixture', '-c', 'user.email=a9-fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'test-only current source snapshot'], { cwd: snapshot });
  return snapshot;
}
let freshCounter = 0;
const fresh = (root) => path.join(root, `out-negative-${++freshCounter}`);
function commitAll(repository, message) {
  execFileSync('git', ['add', '.'], { cwd: repository });
  execFileSync('git', ['-c', 'user.name=A9 TEST_ONLY', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message], { cwd: repository });
}

// Synthetic native inputs, converted to the v26 managed shape; kind selects the A9-32 developer or the batch-2 lock identity.
function inputsFor(root, repositoryRoot, kind) {
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const inputs = path.join(root, 'inputs'); fs.mkdirSync(inputs, { recursive: true });
  const electronPe = syntheticV25Pe(); const helperPe = syntheticV25Pe(); const sqlitePe = syntheticV25Pe({ characteristics: 0x2002 });
  const electronRoot = path.join(root, 'electron'); fs.mkdirSync(path.join(electronRoot, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(electronRoot, 'electron.exe'), electronPe);
  fs.writeFileSync(path.join(electronRoot, 'LICENSE'), 'Electron MIT');
  fs.writeFileSync(path.join(electronRoot, 'LICENSES.chromium.html'), 'Chromium notices');
  fs.writeFileSync(path.join(electronRoot, 'resources', 'default_app.asar'), 'fixture default Electron app');
  const runnerEntry = 'output/helper.exe'; const runnerRoot = path.join(root, 'runner');
  fs.mkdirSync(path.dirname(path.join(runnerRoot, ...runnerEntry.split('/'))), { recursive: true });
  fs.writeFileSync(path.join(runnerRoot, ...runnerEntry.split('/')), helperPe);
  const storageRoot = path.join(root, 'storage');
  for (const [name, version] of [['better-sqlite3', '8.7.0'], ['bindings', '1.5.0'], ['file-uri-to-path', '1.0.0']]) {
    const dir = path.join(storageRoot, 'output', 'runtime', 'node_modules', name); fs.mkdirSync(dir, { recursive: true });
    writeJson(path.join(dir, 'package.json'), { name, version, license: 'MIT' });
  }
  const binding = path.join(storageRoot, 'output', 'runtime', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  fs.mkdirSync(path.dirname(binding), { recursive: true }); fs.writeFileSync(binding, sqlitePe);
  const electronZip = path.join(inputs, 'electron.zip'); const runnerZip = path.join(inputs, 'runner.zip'); const storageZip = path.join(inputs, 'storage.zip');
  writeDeterministicZip(electronRoot, electronZip, 1787443200); writeDeterministicZip(runnerRoot, runnerZip, 1787443200); writeDeterministicZip(storageRoot, storageZip, 1787443200);

  const buildKit = { revision: 'a9-31-managed-r1', filename: 'fixture-authorized-kit.zip', sha256: '4'.repeat(64), source_commit: sourceCommit, input_lock_sha256: '5'.repeat(64), package_manifest_sha256: '6'.repeat(64) };
  const runnerSha = sha256File(runnerZip);
  const builds = [
    { filename: 'runner.zip', sha256: runnerSha, run_id: '11111111-1111-4111-8111-111111111111', evidence_binding_sha256: '7'.repeat(64) },
    { filename: 'runner-2.zip', sha256: '8'.repeat(64), run_id: '22222222-2222-4222-8222-222222222222', evidence_binding_sha256: '9'.repeat(64) },
  ];
  const registryRelative = 'release/win7-product-v3/a9-v26-approved-build-kits.json';
  const registryPath = path.join(repositoryRoot, registryRelative);
  writeJson(registryPath, { schema_version: 1, kits: [{ ...buildKit, status: 'APPROVED_FOR_RETURN_RECORDING', return_review: { status: 'APPROVED_FOR_INPUT_LOCK',
    independent_reviewer: 'TEST_ONLY reviewer', implementation_author: 'TEST_ONLY implementer', reviewed_at: '2026-10-01T00:00:00Z', report_sha256: 'b'.repeat(64),
    builds: builds.map((b) => ({ run_id: b.run_id, sha256: b.sha256 })) } }] });
  commitAll(repositoryRoot, 'TEST_ONLY approval registry fixture');
  const approvalCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const batch2 = kind === 'batch2';
  const lock = {
    schema_version: 1,
    lock_id: batch2 ? 'A9-BATCH2-INPUTS-D013-V26-MANAGED' : 'A9-32-DEVELOPER-INPUTS-D013-V26-MANAGED',
    release_id: 'WIN7-CODING-AGENT-A9-ALPHA2', version: '0.3.0-alpha.2', source_date_epoch: 1790467200,
    target: { os: 'Windows 7 SP1 build 7601', architecture: 'x64', delivery: 'SELF_CONTAINED_OFFLINE_WIN7_X64' },
    inputs_are_not_a9_pass: true,
    runtime_profiles: { runner: { id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', executable_sha256: HASH, output_encoding: 'cp936', working_directory_token: '${RC_RUNNER_WORK_ROOT}', argv_exact: [[], ['/all']] } },
    inputs: {
      electron_zip: { filename: 'electron.zip', version: '22.3.27', sha256: sha256File(electronZip), required_entry: 'electron.exe', required_entry_sha256: digest(electronPe) },
      runner_return_zip: { filename: 'runner.zip', version: 'D-013-v26-managed-a9-trusted-shell-current-user', sha256: runnerSha, required_entry: runnerEntry,
        required_entry_sha256: digest(helperPe), profile: 'D-013-v26-managed-a9-trusted-shell-current-user', protocol_version: 3, runtime_profile: 'a9-trusted-shell-current-user-v2',
        source_commit: sourceCommit, build_kit: buildKit, managed_contract: { revision: 'a9-31-managed-r1' },
        approval_registry: { commit: approvalCommit, path: registryRelative, sha256: sha256File(registryPath) }, reproducible_builds: builds },
      storage_return_zip: { filename: 'storage.zip', version: '8.7.0', sha256: sha256File(storageZip), required_entry: 'output/runtime/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
        required_entry_sha256: digest(sqlitePe), sqlite: '3.43.1', electron_abi: 110, profile: 'E22-SQLITE343-LOCAL-SSD' },
    },
    gates: { win10: 'PASS_D013_V26_RETURN_REVIEWED', win7: batch2 ? 'NOT_PERFORMED_WIN7_52' : 'NOT_PERFORMED', alpha: 'NOT_PERFORMED' },
    provenance: batch2
      ? { task: 'A9-39', development_only: false, candidate: 'WIN7-52', candidate_tentative: true, decision: 'ADR-0250, ADR-0251 (ADR-0155 remains Proposed)' }
      : { task: 'A9-32', development_only: true },
    forbidden_payload_patterns: ['.git/', '.env', 'private.pem', 'winpty', 'node-pty', 'portable-data/', 'a9-state.db'],
  };
  const lockPath = path.join(root, batch2 ? 'a9-batch2-input-lock.json' : 'a9-32-input-lock.json');
  writeJson(lockPath, lock);
  return { electronZip, runnerZip, storageZip, lockPath, approvalRegistryPath: registryPath, lock, repositoryRoot };
}
const buildOptions = (inputs, outputRoot, extra = {}) => ({ repositoryRoot: inputs.repositoryRoot, electronZip: inputs.electronZip, runnerZip: inputs.runnerZip,
  storageZip: inputs.storageZip, lockPath: inputs.lockPath, approvalRegistryPath: inputs.approvalRegistryPath, outputRoot, ...extra });

// One shared batch-2 candidate keeps the suite fast; mutation tests build their own repositories.
let shared;
function sharedCandidate() {
  if (!shared) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-batch2-TEST_ONLY-'));
    const repositoryRoot = cleanSourceFixture(root);
    const inputs = inputsFor(root, repositoryRoot, 'batch2');
    const built = buildA9ProductCandidate(buildOptions(inputs, path.join(root, 'out')));
    shared = { root, repositoryRoot, inputs, built };
  }
  return shared;
}
function externalFiles(state) {
  const external = path.join(state.root, 'external'); fs.mkdirSync(external, { recursive: true });
  const lockCopy = path.join(external, 'a9-batch2-input-lock.json');
  const registryCopy = path.join(external, 'a9-v26-approved-build-kits.json');
  fs.copyFileSync(state.inputs.lockPath, lockCopy);
  fs.copyFileSync(path.join(state.repositoryRoot, 'release/win7-product-v3/a9-v26-approved-build-kits.json'), registryCopy);
  const stage = state.built.stage;
  const manifestPath = path.join(stage, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const lock = state.inputs.lock;
  const authority = {
    schema_version: 1, kind: integrity.AUTHORITY_KIND, status: integrity.AUTHORITY_STATUS, run_id: RUN_ID,
    target: { machine_name: 'TEST-ONLY-HOST', account_name: 'TEST-ONLY\\runner', account_sid: 'S-1-5-21-1-2-3-1001' },
    formal_input_lock_sha256: sha256File(lockCopy),
    approval_registry: { commit: lock.inputs.runner_return_zip.approval_registry.commit, sha256: sha256File(registryCopy) },
    candidate: { source_commit: manifest.source_commit, package_sha256: sha256File(state.built.zipPath), manifest_sha256: sha256File(manifestPath),
      kit_sha256: sha256File(path.join(stage, integrity.KIT_FILE)), helper_sha256: lock.inputs.runner_return_zip.required_entry_sha256 },
  };
  const authorityPath = path.join(external, 'release-authority.json');
  writeJson(authorityPath, authority);
  return { lockCopy, registryCopy, authorityPath, authority, authoritySha256: sha256File(authorityPath), manifestPath, manifest };
}
function runIntegrity(state, files, evidenceRoot, extraArgs = [], overrides = {}) {
  const argv = [`--candidate-root=${state.built.stage}`, `--evidence-root=${evidenceRoot}`, `--package-zip=${state.built.zipPath}`, `--formal-input-lock=${files.lockCopy}`,
    `--approval-registry=${files.registryCopy}`, `--release-authority=${files.authorityPath}`, `--release-authority-sha256=${overrides.pin || files.authoritySha256}`, `--run-id=${overrides.runId || RUN_ID}`, ...extraArgs];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try { return integrity.main(argv, ELECTRON_ENV); } finally { process.stdout.write = write; process.exitCode = 0; }
}

test('A9-32 developer lock builds a non-candidate managed package without a validation suite', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-developer-TEST_ONLY-'));
  const repositoryRoot = cleanSourceFixture(root);
  const inputs = inputsFor(root, repositoryRoot, 'a9-32');
  const built = buildA9ProductCandidate(buildOptions(inputs, path.join(root, 'out')));
  assert.equal(built.manifest.status, 'A9_32_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE');
  assert.equal(built.manifest.external_acceptance_eligible, false);
  assert.equal(built.manifest.release_authority, undefined);
  assert.equal(built.manifest.lock_id, 'A9-32-DEVELOPER-INPUTS-D013-V26-MANAGED');
  assert.equal(built.manifest.candidate, undefined);
  assert.equal(built.manifest.required_native.runner_helper_profile, 'D-013-v26-managed-a9-trusted-shell-current-user');
  assert.ok(fs.existsSync(path.join(built.stage, 'A9_32_DEVELOPER_CHECK.json')));
  assert.ok(fs.existsSync(path.join(built.stage, 'a9-32-input-lock.json')));
  assert.equal(fs.existsSync(path.join(built.stage, 'validation')), false);
  const runtime = JSON.parse(fs.readFileSync(path.join(built.stage, 'resources/app/a9-runtime.json'), 'utf8'));
  assert.equal(runtime.lock_id, 'A9-32-DEVELOPER-INPUTS-D013-V26-MANAGED');
  assert.equal(runtime.candidate, undefined);
});

test('batch-2 candidate is complete, reproducible and bound to its contract', () => {
  const state = sharedCandidate();
  const { built, root, repositoryRoot, inputs } = state;
  assert.equal(built.manifest.lock_id, 'A9-BATCH2-INPUTS-D013-V26-MANAGED');
  assert.equal(built.manifest.candidate, 'WIN7-52');
  assert.equal(built.manifest.candidate_tentative, true);
  assert.equal(built.manifest.external_acceptance_eligible, true);
  assert.equal(built.manifest.status, 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS');
  assert.equal(built.manifest.gates.win10, 'NOT_PERFORMED');
  assert.equal(built.manifest.gates.win7, 'NOT_PERFORMED');
  for (const relative of integrity.REQUIRED_FILES) assert.ok(fs.existsSync(path.join(built.stage, ...relative.split('/'))), relative);
  // The suite is exactly the files the integrity script names, byte-equal to their sources.
  const sources = {
    'validation/a9-batch2-fixtures.cjs': 'release/win7-product-v3/a9-batch2-fixtures.cjs',
    'validation/a9-batch2-desktop-request.cjs': 'release/win7-product-v3/a9-batch2-desktop-request.cjs',
    'validation/a9-batch2-desktop-controller.ps1': 'release/win7-product-v3/a9-batch2-desktop-controller.ps1',
    'validation/a9-batch2-package-integrity.cjs': 'release/win7-product-v3/a9-batch2-package-integrity.cjs',
    'validation/a9-batch2-report.cjs': 'release/win7-product-v3/a9-batch2-report.cjs',
    'validation/a9-batch2-smoke.cjs': 'release/win7-product-v3/a9-batch2-smoke.cjs',
    'validation/a9-batch2-driver.cjs': 'src/shell/tests/product/a9-batch2-driver-entry.cjs',
    'A9_BATCH2_WIN7_VALIDATION.md': 'release/win7-product-v3/A9_BATCH2_WIN7_VALIDATION.md',
    'RUN_A9_BATCH2_INTEGRITY.cmd': 'release/win7-product-v3/RUN_A9_BATCH2_INTEGRITY.cmd',
    'RUN_A9_BATCH2_SMOKE.cmd': 'release/win7-product-v3/RUN_A9_BATCH2_SMOKE.cmd',
    'RUN_A9_BATCH2_REPORT_VERIFY.cmd': 'release/win7-product-v3/RUN_A9_BATCH2_REPORT_VERIFY.cmd',
  };
  assert.deepEqual(Object.keys(sources).sort(), [...integrity.SUITE_FILES].sort());
  for (const [staged, source] of Object.entries(sources)) {
    assert.deepEqual(fs.readFileSync(path.join(built.stage, ...staged.split('/'))), fs.readFileSync(path.join(repositoryRoot, source)), staged);
  }
  const kit = JSON.parse(fs.readFileSync(path.join(built.stage, integrity.KIT_FILE), 'utf8'));
  assert.equal(kit.candidate_label, 'WIN7-52');
  assert.equal(kit.candidate_tentative, true);
  assert.equal(kit.kit_id, 'A9-39-WIN7-52-BATCH2-1');
  assert.equal(kit.scope.task, 'A9-39');
  assert.equal(kit.scope.decision, 'ADR-0250, ADR-0251 (ADR-0155 remains Proposed)');
  assert.equal(kit.scope.result_on_complete, 'A9_39_WIN7_52_BATCH2_EXECUTION_CAPABILITY_PASS');
  assert.equal(inputs.lock.provenance.task, 'A9-39');
  assert.equal(inputs.lock.provenance.candidate, 'WIN7-52');
  assert.equal(inputs.lock.provenance.candidate_tentative, true);
  assert.equal(inputs.lock.gates.win7, 'NOT_PERFORMED_WIN7_52');
  assert.ok(fs.existsSync(path.join(built.stage, 'evidence/contracts/A9_39_ALPHA2_FINAL_CANDIDATE.md')));
  assert.ok(fs.existsSync(path.join(built.stage, 'evidence/contracts/A9_33_BATCH_2_WIN7_ACCEPTANCE.md')));
  assert.equal(kit.authority, 'NOT_GRANTED_BY_PACKAGE');
  assert.equal(kit.win10, 'NOT_PERFORMED');
  assert.equal(kit.win7, 'NOT_PERFORMED');
  assert.deepEqual(JSON.parse(JSON.stringify(kit.required_cases)), JSON.parse(JSON.stringify(fixtures.CASES)));
  assert.deepEqual(kit.known_limits, [...fixtures.KNOWN_LIMITS]);
  assert.equal(kit.known_limits.filter((item) => item.startsWith('KL-13:')).length, 1);
  assert.equal(kit.limits.max_requests, 16);
  for (const [name, hash] of Object.entries(kit.suite_sha256)) assert.equal(hash, sha256File(path.join(built.stage, ...name.split('/'))), name);
  const runtime = JSON.parse(fs.readFileSync(path.join(built.stage, 'resources/app/a9-runtime.json'), 'utf8'));
  assert.equal(runtime.lock_id, 'A9-BATCH2-INPUTS-D013-V26-MANAGED');
  assert.equal(runtime.candidate, 'WIN7-52');
  // Runtime descriptor schema 1 carries candidate only; tentative belongs to manifest, kit and lock.
  assert.equal(Object.prototype.hasOwnProperty.call(runtime, 'candidate_tentative'), false);
  assert.equal(runtime.runner_helper_protocol, 3);
  // No old candidate suite leaks in.
  assert.equal(fs.existsSync(path.join(built.stage, 'A9_27_WIN7_42_VALIDATION.md')), false);
  assert.equal(fs.existsSync(path.join(built.stage, 'validation', 'a9-package-integrity-w42.cjs')), false);
  // Same inputs, second output root: identical ZIP bytes.
  const second = buildA9ProductCandidate(buildOptions(inputs, path.join(root, 'out-second')));
  assert.deepEqual(fs.readFileSync(second.zipPath), fs.readFileSync(built.zipPath));
});

test('batch-2 integrity accepts the exact candidate and refuses every identity break', () => {
  const state = sharedCandidate();
  const files = externalFiles(state);
  const evidence = path.join(state.root, 'evidence-pass');
  const report = runIntegrity(state, files, evidence);
  assert.equal(report.status, 'PASS', JSON.stringify(report.cases));
  assert.equal(report.mismatches.length, 0);
  assert.ok(report.manifest_files_checked > 20);
  assert.ok(fs.existsSync(path.join(evidence, 'g1-module-load.json')));
  const loaded = JSON.parse(fs.readFileSync(path.join(evidence, 'g1-module-load.json'), 'utf8'));
  assert.equal(loaded.modules.every((item) => item.status === 'PASS'), true, JSON.stringify(loaded.modules));
  assert.deepEqual(loaded.syntax_compiled.map((item) => item.status), ['PASS', 'PASS']);
  // A wrong pin, a tampered authority, a candidate file edit and a wrong run id each fail on their own check.
  assert.equal(runIntegrity(state, files, path.join(state.root, 'evidence-pin'), [], { pin: 'f'.repeat(64) }).status, 'FAIL');
  const tampered = { ...files.authority, candidate: { ...files.authority.candidate, package_sha256: 'e'.repeat(64) } };
  const tamperedPath = path.join(state.root, 'external', 'tampered-authority.json'); writeJson(tamperedPath, tampered);
  const tamperedFiles = { ...files, authorityPath: tamperedPath, authoritySha256: sha256File(tamperedPath) };
  assert.equal(runIntegrity(state, tamperedFiles, path.join(state.root, 'evidence-tamper')).status, 'FAIL');
  const wrongRun = runIntegrity(state, files, path.join(state.root, 'evidence-run'), [], { runId: '00000000-0000-4000-8000-000000000000' });
  assert.equal(wrongRun.status, 'FAIL');
  assert.ok(wrongRun.cases.some((item) => item.id === 'B2PKG-RUN-BINDING' && item.status === 'FAIL'));
  const victim = path.join(state.built.stage, 'validation', 'a9-batch2-fixtures.cjs');
  const original = fs.readFileSync(victim);
  fs.appendFileSync(victim, '\n// TEST_ONLY edit\n');
  try { assert.equal(runIntegrity(state, files, path.join(state.root, 'evidence-edit')).status, 'FAIL'); } finally { fs.writeFileSync(victim, original); }
  assert.equal(runIntegrity(state, files, path.join(state.root, 'evidence-back')).status, 'PASS');
});

test('WIN7-52 integrity refuses WIN7-45, WIN7-47, WIN7-48, WIN7-49, WIN7-50 and WIN7-51 release authority even with an exact independent pin', () => {
  const state = sharedCandidate();
  const files = externalFiles(state);
  assert.equal(integrity.AUTHORITY_KIND, 'WIN7_52_RELEASE_AUTHORITY');
  assert.equal(integrity.AUTHORITY_STATUS, 'APPROVED_FOR_WIN7_52_VALIDATION');
  // Reject each stale identity separately, then the complete old authority identity.
  for (const [index, oldIdentity] of ['WIN7-45', 'WIN7-47', 'WIN7-48', 'WIN7-49', 'WIN7-50', 'WIN7-51'].flatMap((candidate) => {
    const prefix = candidate.replace('-', '_');
    return [
      { kind: `${prefix}_RELEASE_AUTHORITY` },
      { status: `APPROVED_FOR_${prefix}_VALIDATION` },
      { kind: `${prefix}_RELEASE_AUTHORITY`, status: `APPROVED_FOR_${prefix}_VALIDATION` },
    ];
  }).entries()) {
    const authorityPath = path.join(state.root, 'external', `retired-authority-${index}.json`);
    writeJson(authorityPath, { ...files.authority, ...oldIdentity });
    const rejected = runIntegrity(state, { ...files, authorityPath, authoritySha256: sha256File(authorityPath) },
      path.join(state.root, `evidence-retired-authority-${index}`));
    assert.equal(rejected.status, 'FAIL');
    assert.ok(rejected.cases.some((item) => item.status === 'FAIL'
      && /A9_BATCH2_RELEASE_AUTHORITY_BINDING_INVALID/.test(item.detail)), JSON.stringify(rejected.cases));
  }
});

test('batch-2 integrity in phase mode writes a bound phase result that names the failing assertion', () => {
  const state = sharedCandidate();
  const files = externalFiles(state);
  const stage = state.built.stage;
  const bindings = { source_commit: files.manifest.source_commit, package_sha256: files.authority.candidate.package_sha256,
    manifest_sha256: files.authority.candidate.manifest_sha256, kit_sha256: files.authority.candidate.kit_sha256, release_authority_sha256: files.authoritySha256 };
  const runRoot = path.join(state.root, 'run-phase');
  const externalFields = {
    package_zip: { path: state.built.zipPath, sha256: files.authority.candidate.package_sha256 }, formal_input_lock: { path: files.lockCopy, sha256: sha256File(files.lockCopy) },
    approval_registry: { path: files.registryCopy, sha256: sha256File(files.registryCopy) }, release_authority: { path: files.authorityPath, sha256: files.authoritySha256 },
  };
  const request = requests.createRequest({ runId: RUN_ID, phase: 'p02-integrity', requestIndex: 2, sourceCommit: bindings.source_commit, packageSha256: bindings.package_sha256,
    manifestSha256: bindings.manifest_sha256, kitSha256: bindings.kit_sha256, releaseAuthoritySha256: files.authoritySha256, candidateRoot: stage, evidenceRoot: runRoot,
    target: { machine_name: 'TEST-ONLY-HOST', account_name: 'TEST-ONLY\\runner', account_sid: 'S-1-5-21-1-2-3-1001', integrity_level: 'Medium', session_id: 1, elevated: false, in_job: false },
    externalFiles: externalFields });
  const attempt = requests.attemptDirectory(runRoot, 2, 'p02-integrity');
  fs.mkdirSync(attempt, { recursive: true }); writeJson(path.join(attempt, 'request.json'), request);
  const phaseArgs = [`--phase=p02-integrity`, `--request-index=2`, `--run-root=${runRoot}`];
  runIntegrity(state, files, attempt, phaseArgs);
  const result = JSON.parse(fs.readFileSync(path.join(attempt, 'phase-result.json'), 'utf8'));
  assert.equal(result.status, 'PASS', JSON.stringify(result.cases));
  assert.deepEqual(fixtures.phaseResultProblems(result, { runId: RUN_ID, phase: 'p02-integrity', bindings }), []);
  assert.equal(result.cases[0].assertions.length, 4);
  // A pin mismatch fails assertion A01 and leaves the rest UNKNOWN instead of passing them.
  const failAttempt = requests.attemptDirectory(runRoot, 3, 'p02-integrity'); fs.mkdirSync(failAttempt, { recursive: true });
  writeJson(path.join(failAttempt, 'request.json'), { ...request, request_index: 3 });
  runIntegrity(state, files, failAttempt, [`--phase=p02-integrity`, `--request-index=3`, `--run-root=${runRoot}`], { pin: 'f'.repeat(64) });
  const failed = JSON.parse(fs.readFileSync(path.join(failAttempt, 'phase-result.json'), 'utf8'));
  assert.equal(failed.status, 'FAIL');
  assert.equal(failed.cases[0].assertions[0].status, 'FAIL');
  assert.equal(failed.cases[0].assertions[1].status, 'UNKNOWN');
  assert.match(failed.first_failure.detail, /AUTHORITY_PIN_MISMATCH/);
});

const flipHex = (value) => `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;

test('batch-2 producer refuses a drifted lock, a non-ASCII or LF CMD entry and a BOM in suite text', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-batch2-negative-TEST_ONLY-'));
  const repositoryRoot = cleanSourceFixture(root);
  const inputs = inputsFor(root, repositoryRoot, 'batch2');
  const original = inputs.lock;
  for (const mutate of [
    (v) => { v.provenance.development_only = true; },
    (v) => { v.provenance.candidate = 'WIN7-44'; },
    (v) => { v.provenance.candidate_tentative = false; },
    (v) => { v.gates.win7 = 'PASS'; },
    (v) => { v.gates.win10 = 'NOT_PERFORMED'; },
    (v) => { v.provenance.task = 'A9-32'; },
    (v) => { v.inputs.runner_return_zip.protocol_version = 2; },
    (v) => { delete v.inputs.runner_return_zip.managed_contract; },
    // A managed build kit must match its approved identity field by field; one changed hex digit is a different kit.
    (v) => { v.inputs.runner_return_zip.build_kit.input_lock_sha256 = flipHex(v.inputs.runner_return_zip.build_kit.input_lock_sha256); },
    (v) => { v.inputs.runner_return_zip.build_kit.package_manifest_sha256 = flipHex(v.inputs.runner_return_zip.build_kit.package_manifest_sha256); },
    (v) => { v.inputs.runner_return_zip.build_kit.sha256 = flipHex(v.inputs.runner_return_zip.build_kit.sha256); },
    (v) => { v.inputs.runner_return_zip.build_kit.source_commit = flipHex(v.inputs.runner_return_zip.build_kit.source_commit); },
  ]) {
    const lock = JSON.parse(JSON.stringify(original)); mutate(lock); writeJson(inputs.lockPath, lock);
    assert.throws(() => buildA9ProductCandidate(buildOptions(inputs, fresh(root))), /A9_(BATCH2|V26)_/);
  }
  writeJson(inputs.lockPath, original);
  // CMD entries must be ASCII with CRLF only.
  const cmd = path.join(repositoryRoot, 'release/win7-product-v3/RUN_A9_BATCH2_SMOKE.cmd');
  const cmdBytes = fs.readFileSync(cmd);
  fs.writeFileSync(cmd, cmdBytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1'); commitAll(repositoryRoot, 'TEST_ONLY LF cmd');
  assert.throws(() => buildA9ProductCandidate(buildOptions(inputs, fresh(root))), /A9_BATCH2_CMD_ENCODING_INVALID/);
  fs.writeFileSync(cmd, Buffer.concat([cmdBytes, Buffer.from('rem \u4e2d\u6587\r\n', 'utf8')])); commitAll(repositoryRoot, 'TEST_ONLY non-ASCII cmd');
  assert.throws(() => buildA9ProductCandidate(buildOptions(inputs, fresh(root))), /A9_BATCH2_CMD_ENCODING_INVALID/);
  fs.writeFileSync(cmd, cmdBytes); commitAll(repositoryRoot, 'TEST_ONLY restore cmd');
  const guide = path.join(repositoryRoot, 'release/win7-product-v3/A9_BATCH2_WIN7_VALIDATION.md');
  const guideBytes = fs.readFileSync(guide);
  fs.writeFileSync(guide, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), guideBytes])); commitAll(repositoryRoot, 'TEST_ONLY BOM doc');
  assert.throws(() => buildA9ProductCandidate(buildOptions(inputs, fresh(root))), /A9_BATCH2_SUITE_BOM_PROHIBITED/);
});

test('the committed formal and developer locks name a build kit that the committed approval registry approves', () => {
  // Reads the real files, not a fixture: one changed hex digit in either lock makes the kit unapproved and this test fail.
  const release = path.join(process.cwd(), 'release/win7-product-v3');
  for (const name of ['a9-batch2-input-lock.json', 'a9-32-input-lock.json']) {
    const lock = JSON.parse(fs.readFileSync(path.join(release, name), 'utf8'));
    const runner = lock.inputs.runner_return_zip;
    const kit = runner.build_kit;
    const registryBytes = fs.readFileSync(path.join(release, 'a9-v26-approved-build-kits.json'));
    assert.equal(digest(registryBytes), runner.approval_registry.sha256, `${name}: registry digest`);
    const registry = JSON.parse(registryBytes.toString('utf8'));
    const approved = registry.kits.find((entry) => entry.status === 'APPROVED_FOR_RETURN_RECORDING' && entry.sha256 === kit.sha256
      && entry.filename === kit.filename && entry.revision === kit.revision && entry.source_commit === runner.source_commit
      && entry.input_lock_sha256 === kit.input_lock_sha256 && entry.package_manifest_sha256 === kit.package_manifest_sha256);
    assert.ok(approved, `${name}: build kit is not approved by the committed registry`);
  }
});

test('batch-2 report verifier accepts a complete bound run and rejects every tampering control', () => {
  const state = sharedCandidate();
  const files = externalFiles(state);
  const runRoot = path.join(state.root, 'run-report');
  const bindings = { source_commit: files.manifest.source_commit, package_sha256: files.authority.candidate.package_sha256,
    manifest_sha256: files.authority.candidate.manifest_sha256, kit_sha256: files.authority.candidate.kit_sha256 };
  fs.mkdirSync(runRoot, { recursive: true });
  let index = 0;
  for (const phase of fixtures.PHASES) {
    if (phase.id === 'p09-report') break;
    index += 1;
    const attempt = requests.attemptDirectory(runRoot, index, phase.id); fs.mkdirSync(attempt, { recursive: true });
    const result = fixtures.newPhaseResult(phase.id, RUN_ID, index, bindings);
    for (const item of fixtures.casesForPhase(phase.id)) for (const a of item.assertions) fixtures.setAssertion(result, item.case_id, a.assertion_id, 'PASS', `TEST_ONLY observation for ${a.assertion_id}`);
    result.evidence = fixtures.evidenceForPhase(phase.id).map((name) => {
      const bytes = Buffer.from(`TEST_ONLY evidence ${phase.id} ${name}\n`); fs.writeFileSync(path.join(attempt, name), bytes);
      return { file: name, size: bytes.length, sha256: digest(bytes) };
    });
    fixtures.finalizePhaseResult(result, null);
    writeJson(path.join(attempt, 'phase-result.json'), result);
    const request = { phase: phase.id, request_index: index, run_id: RUN_ID, digest: `${index}`.repeat(64).slice(0, 64) };
    requests.appendLedger(runRoot, { state: 'CONSUMED', request_index: index, phase: phase.id, run_id: RUN_ID, digest: request.digest, consumed_at: new Date().toISOString() });
    requests.completeRequest(request, runRoot, 'PASS', '');
  }
  const argv = [`--run-root=${runRoot}`, `--release-authority=${files.authorityPath}`, `--release-authority-sha256=${files.authoritySha256}`, '--through=p08-ui'];
  const write = process.stdout.write.bind(process.stdout); process.stdout.write = () => true;
  let verdict;
  try { verdict = reportTool.main(argv); } finally { process.stdout.write = write; process.exitCode = 0; }
  assert.equal(verdict.status, 'PASS', JSON.stringify(verdict.problems));
  assert.equal(verdict.negative_controls.results.every((item) => item.status === 'PASS'), true);
  const controlIds = verdict.negative_controls.results.map((item) => item.id);
  for (const id of ['NEG-WRONG-PIN', 'NEG-WRONG-CANDIDATE', 'NEG-MISSING-EVIDENCE', 'NEG-EDITED-EVIDENCE', 'NEG-EDITED-REPORT',
    'NEG-STRIPPED-OBSERVATION', 'NEG-REPLAYED-REQUEST', 'NEG-ORPHAN-COMPLETION']) assert.ok(controlIds.includes(id), `missing negative control ${id}`);
  // Editing one result after the ledger hashed it is caught.
  const first = path.join(requests.attemptDirectory(runRoot, 1, 'p01-env'), 'phase-result.json');
  const keep = fs.readFileSync(first);
  fs.writeFileSync(first, keep.toString('utf8').replace('"PASS"', '"FAIL"'));
  process.stdout.write = () => true;
  try { assert.equal(reportTool.main(argv).status, 'FAIL'); } finally { process.stdout.write = write; process.exitCode = 0; }
  fs.writeFileSync(first, keep);
});

test('batch-2 evidence names, case ids and request cost stay a closed contract', () => {
  const contract = fixtures.selfCheck();
  assert.equal(contract.ok, true, JSON.stringify(contract.problems));
  assert.equal(contract.cases, 37);
  assert.equal(contract.assertions, 67);
  assert.equal(contract.phases, 10);
  assert.equal(contract.request_cost, 10);
  assert.equal(contract.max_requests, 16);
  assert.equal(contract.retry_headroom, 6);
  const names = fixtures.evidenceSet();
  assert.equal(names.length === new Set(names).size, true);
  assert.ok(names.length >= 55);
});
