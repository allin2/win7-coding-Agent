import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildA9ProductCandidate } from '../build-a9-product-v3.mjs';
import { recordA9V25HelperInput, verifyCommittedApprovalRegistry } from '../record-a9-v25-helper-input.mjs';
import { createFileManifest, sha256File, writeJson } from '../release-contract.mjs';
import { writeDeterministicZip } from '../zip-utils.mjs';
import { requiredV25Evidence, inspectV25Pe } from '../a9-v25-return-evidence.mjs';
import { syntheticV25Pe, syntheticV25Evidence } from './v25-evidence-fixture.mjs';

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const HASH = '0'.repeat(64);
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const canonicalValue = (value) => Array.isArray(value) ? value.map(canonicalValue)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])])) : value;
const integrity = require('../../../release/win7-product-v3/a9-package-integrity.cjs');
const { ACCEPTANCE_REQUIRED_FILES } = integrity;
const win7Report = require('../../../release/win7-product-v3/a9-win7-17-report.cjs');
const win22Report = require('../../../release/win7-product-v3/a9-win7-22-report.cjs');

function createV25AuthorizedKit(root) {
  const kitRoot = path.join(root, 'authorized-kit');
  const sourceRepositoryRoot = path.join(root, 'source-repository');
  fs.mkdirSync(kitRoot, { recursive: true });
  const sourceBytes = Buffer.from('authorized-v25-source');
  const committedSource = path.join(sourceRepositoryRoot, 'native', 'helper', 'helper.cpp');
  fs.mkdirSync(path.dirname(committedSource), { recursive: true });
  fs.writeFileSync(committedSource, sourceBytes);
  execFileSync('git', ['init', '--quiet'], { cwd: sourceRepositoryRoot });
  execFileSync('git', ['config', 'user.name', 'A9 Fixture'], { cwd: sourceRepositoryRoot });
  execFileSync('git', ['config', 'user.email', 'a9-fixture@example.invalid'], { cwd: sourceRepositoryRoot });
  execFileSync('git', ['add', 'native/helper/helper.cpp'], { cwd: sourceRepositoryRoot });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture source'], { cwd: sourceRepositoryRoot });
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRepositoryRoot, encoding: 'utf8' }).trim();
  const inputLock = {
    schema_version: 1,
    source_commit: sourceCommit,
    sources: [{ path: 'src/helper.cpp', size: sourceBytes.length, sha256: digest(sourceBytes) }],
  };
  writeJson(path.join(kitRoot, 'input-lock.json'), inputLock);
  fs.copyFileSync(path.join(process.cwd(), 'native/helper/build-win10-kit-v25/build-profile.json'), path.join(kitRoot, 'build-profile.json'));
  fs.mkdirSync(path.join(kitRoot, 'src'));
  fs.writeFileSync(path.join(kitRoot, 'src', 'helper.cpp'), sourceBytes);
  fs.writeFileSync(path.join(kitRoot, 'build.ps1'), '# locked fixture build script\n', 'utf8');
  fs.writeFileSync(path.join(kitRoot, 'prepare-kit.cjs'), '// locked fixture preparation script\n', 'utf8');
  const shipped = ['build-profile.json', 'build.ps1', 'input-lock.json', 'prepare-kit.cjs', 'src/helper.cpp'];
  writeJson(path.join(kitRoot, 'PACKAGE_MANIFEST.json'), {
    schema_version: 1,
    source_commit: inputLock.source_commit,
    status: 'READY_FOR_WIN10_BUILD',
    files: shipped.map((relative) => ({
      path: relative,
      size: fs.statSync(path.join(kitRoot, relative)).size,
      sha256: sha256File(path.join(kitRoot, relative)),
    })),
  });
  const kitZip = path.join(root, 'approved-v25-kit.zip');
  writeDeterministicZip(kitRoot, kitZip, 1787443200);
  const approvedKitRegistry = path.join(root, 'approved-kits.json');
  writeJson(approvedKitRegistry, {
    schema_version: 1,
    kits: [{
      revision: 'fixture-1', filename: path.basename(kitZip), sha256: sha256File(kitZip),
      source_commit: sourceCommit,
      input_lock_sha256: sha256File(path.join(kitRoot, 'input-lock.json')),
      package_manifest_sha256: sha256File(path.join(kitRoot, 'PACKAGE_MANIFEST.json')),
      status: 'APPROVED_FOR_RETURN_RECORDING',
    }],
  });
  return { kitRoot, kitZip, approvedKitRegistry, sourceRepositoryRoot };
}

function createV25ReturnFixture(root, kitRoot, runId, suffix, completedAt = '2026-08-30T00:00:00.000Z', mutate = () => {}) {
  const returnRoot = path.join(root, `v25-return-${suffix}`);
  const helper = syntheticV25Pe();
  const inputLock = JSON.parse(fs.readFileSync(path.join(kitRoot, 'input-lock.json'), 'utf8'));
  const result = {
    schema_version: 3,
    run_id: runId,
    status: 'PASS',
    candidate_eligible: true,
    source_commit: inputLock.source_commit,
    completed_at: completedAt,
    helper_profile: 'D-013-v25-a9-trusted-shell-current-user',
    helper_protocol: 2,
    profile: 'WIN10-VS2019-V142-SDK19041-D013-V25-CURRENT-USER-X64',
    architecture: 'x64',
    toolset: 'v142',
    windows_sdk: '10.0.19041.0',
    crt: 'static /MT',
    manifest: 'embedded',
    logic_tests: 'PASS',
    process_capture_selftest: 'PASS',
    win10_smoke: 'PASS',
    pe_api_crt_analysis: 'PASS',
    artifacts: [{ path: 'helper.exe', size: helper.length, sha256: digest(helper) }],
  };
  fs.mkdirSync(path.join(returnRoot, 'output'), { recursive: true });
  fs.mkdirSync(path.join(returnRoot, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(returnRoot, 'output', 'helper.exe'), helper);
  writeJson(path.join(returnRoot, 'evidence', 'build-result.json'), result);
  writeJson(path.join(returnRoot, 'evidence', 'environment.json'), {
    status: 'PASS',
    visual_studio_version: '16.11.35',
    msvc_version: '14.29.30133',
    platform_toolset: 'v142',
    windows_sdk_version: '10.0.19041.0',
    network_required: false,
    os_caption: 'Microsoft Windows 10 Pro', os_version: '10.0.19045',
  });
  writeJson(path.join(returnRoot, 'evidence', 'input-verification.json'), {
    schema_version: 1,
    status: 'PASS',
    sources: inputLock.sources.map((entry) => ({ ...entry, status: 'PASS' })),
  });
  for (const name of ['input-lock.json', 'PACKAGE_MANIFEST.json', 'build-profile.json']) {
    fs.copyFileSync(path.join(kitRoot, name), path.join(returnRoot, name));
  }
  for (const [name, contents] of Object.entries(syntheticV25Evidence())) {
    fs.writeFileSync(path.join(returnRoot, 'evidence', name), contents, 'utf8');
  }
  writeJson(path.join(returnRoot, 'evidence/validation-binding.json'), {
    schema_version: 1, status: 'PASS', run_id: runId, source_commit: inputLock.source_commit,
    profile: result.profile, helper_sha256: digest(helper),
    files: requiredV25Evidence.map((relative) => ({
      path: relative, size: fs.statSync(path.join(returnRoot, relative)).size, sha256: sha256File(path.join(returnRoot, relative)),
    })),
    exit_codes: Object.fromEntries(['logic', 'capture', 'version', 'v1_smoke', 'v1_cancel', 'v2_smoke', 'v2_cancel', 'v2_overlay_reject'].map((key) => [key, 0])),
  });
  mutate(returnRoot);
  const files = [
    ...fs.readdirSync(path.join(returnRoot, 'evidence')).map((name) => [`evidence/${name}`, fs.readFileSync(path.join(returnRoot, 'evidence', name))]),
    ['build-profile.json', fs.readFileSync(path.join(returnRoot, 'build-profile.json'))],
    ['input-lock.json', fs.readFileSync(path.join(returnRoot, 'input-lock.json'))],
    ['PACKAGE_MANIFEST.json', fs.readFileSync(path.join(returnRoot, 'PACKAGE_MANIFEST.json'))],
    ['output/helper.exe', fs.readFileSync(path.join(returnRoot, 'output/helper.exe'))],
  ].map(([filePath, bytes]) => ({ path: filePath, size: bytes.length, sha256: digest(bytes) }));
  writeJson(path.join(returnRoot, 'RETURN_PACKAGE_MANIFEST.json'), {
    schema_version: 1,
    run_id: runId,
    source_commit: inputLock.source_commit,
    status: 'PASS',
    candidate_eligible: true,
    authorized_inputs: {
      input_lock_sha256: sha256File(path.join(kitRoot, 'input-lock.json')),
      package_manifest_sha256: sha256File(path.join(kitRoot, 'PACKAGE_MANIFEST.json')),
    },
    files,
  });
  const zipPath = path.join(root, `D013-V25-WIN10-RETURN-${suffix}.zip`);
  writeDeterministicZip(returnRoot, zipPath, 1787443200);
  fs.writeFileSync(`${zipPath}.sha256`, `${sha256File(zipPath)}  ${path.basename(zipPath)}\n`, 'ascii');
  return zipPath;
}

// A real clean Git snapshot of the current sources, not a production option
// that fabricates source_dirty=false. Dependencies are shared read-only.
function cleanSourceFixture(root) {
  const snapshot = path.join(root, 'source-repository');
  fs.mkdirSync(snapshot, { recursive: true });
  const names = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: process.cwd(), encoding: 'utf8',
  }).trim().split('\n');
  for (const relative of names) {
    const source = path.join(process.cwd(), relative);
    if (relative.includes('/dist/') || !fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const destination = path.join(snapshot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  fs.appendFileSync(path.join(snapshot, '.gitignore'), '\n**/dist/\n**/node_modules\n', 'utf8');
  for (const module of ['core', 'gateway', 'git-adapter', 'runner', 'shell', 'state', 'workspace']) {
    fs.symlinkSync(fs.realpathSync(path.join(process.cwd(), 'src', module, 'node_modules')),
      path.join(snapshot, 'src', module, 'node_modules'), 'dir');
  }
  execFileSync('git', ['init', '--quiet'], { cwd: snapshot });
  execFileSync('git', ['add', '.'], { cwd: snapshot });
  execFileSync('git', ['-c', 'user.name=A9 Fixture', '-c', 'user.email=a9-fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'test-only current source snapshot'], { cwd: snapshot });
  return snapshot;
}

function fixture(root, sourceRepositoryRoot = process.cwd()) {
  const inputs = path.join(root, 'inputs'); fs.mkdirSync(inputs, { recursive: true });
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRepositoryRoot, encoding: 'utf8' }).trim();
  const electronPe = syntheticV25Pe();
  const helperPe = syntheticV25Pe();
  const sqlitePe = syntheticV25Pe({ characteristics: 0x2002 });
  const electronRoot = path.join(root, 'electron');
  fs.mkdirSync(electronRoot, { recursive: true });
  fs.writeFileSync(path.join(electronRoot, 'electron.exe'), electronPe);
  fs.writeFileSync(path.join(electronRoot, 'LICENSE'), 'Electron MIT');
  fs.writeFileSync(path.join(electronRoot, 'LICENSES.chromium.html'), 'Chromium notices');

  const runnerEntry = 'output/helper.exe';
  const runnerRoot = path.join(root, 'runner');
  fs.mkdirSync(path.dirname(path.join(runnerRoot, ...runnerEntry.split('/'))), { recursive: true });
  fs.writeFileSync(path.join(runnerRoot, ...runnerEntry.split('/')), helperPe);

  const storageRoot = path.join(root, 'storage');
  for (const [moduleName, version] of [['better-sqlite3', '8.7.0'], ['bindings', '1.5.0'], ['file-uri-to-path', '1.0.0']]) {
    const moduleRoot = path.join(storageRoot, 'output', 'runtime', 'node_modules', moduleName);
    fs.mkdirSync(moduleRoot, { recursive: true });
    writeJson(path.join(moduleRoot, 'package.json'), { name: moduleName, version, license: 'MIT' });
  }
  const binding = path.join(storageRoot, 'output', 'runtime', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  fs.mkdirSync(path.dirname(binding), { recursive: true });
  fs.writeFileSync(binding, sqlitePe);

  const electronZip = path.join(inputs, 'electron.zip');
  const runnerZip = path.join(inputs, 'runner.zip');
  const storageZip = path.join(inputs, 'storage.zip');
  writeDeterministicZip(electronRoot, electronZip, 1787443200);
  writeDeterministicZip(runnerRoot, runnerZip, 1787443200);
  writeDeterministicZip(storageRoot, storageZip, 1787443200);
  const buildKit = {
    revision: 'fixture-authorized-kit', filename: 'fixture-authorized-kit.zip', sha256: '4'.repeat(64),
    source_commit: sourceCommit, input_lock_sha256: '5'.repeat(64), package_manifest_sha256: '6'.repeat(64),
  };
  const approvalRegistryPath = path.join(root, 'a9-v25-approved-kits.json');
  writeJson(approvalRegistryPath, {
    schema_version: 1,
    kits: [{ ...buildKit, status: 'APPROVED_FOR_RETURN_RECORDING' }],
  });
  const firstReturnSha256 = sha256File(runnerZip);
  const lock = {
    schema_version: 1,
    lock_id: 'A9-14-INPUTS-D013-V25-WIN7-22',
    release_id: 'WIN7-CODING-AGENT-A9-ALPHA1',
    version: '0.3.0-alpha.1',
    source_date_epoch: 1787443200,
    target: { os: 'Windows 7 SP1 build 7601', architecture: 'x64', delivery: 'SELF_CONTAINED_OFFLINE_WIN7_X64' },
    inputs_are_not_a9_pass: true,
    runtime_profiles: { runner: { id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', executable_sha256: HASH, output_encoding: 'cp936', working_directory_token: '${RC_RUNNER_WORK_ROOT}', argv_exact: [[], ['/all']] } },
    inputs: {
      electron_zip: { filename: 'electron.zip', version: '22.3.27', sha256: sha256File(electronZip), required_entry: 'electron.exe', required_entry_sha256: digest(electronPe) },
      runner_return_zip: {
        filename: 'runner.zip', version: 'D-013-v25-a9-trusted-shell-current-user', sha256: firstReturnSha256,
        required_entry: runnerEntry, required_entry_sha256: digest(helperPe), profile: 'D-013-v25-a9-trusted-shell-current-user',
        protocol_version: 2, runtime_profile: 'a9-trusted-shell-current-user-v1', source_commit: sourceCommit,
        build_kit: buildKit,
        approval_registry: {
          commit: sourceCommit, sha256: sha256File(approvalRegistryPath),
          path: 'release/win7-product-v3/a9-v25-approved-kits.json',
        },
        reproducible_builds: [
          { filename: 'runner.zip', sha256: firstReturnSha256, run_id: '11111111-1111-4111-8111-111111111111', evidence_binding_sha256: '7'.repeat(64) },
          { filename: 'runner-2.zip', sha256: '8'.repeat(64), run_id: '22222222-2222-4222-8222-222222222222', evidence_binding_sha256: '9'.repeat(64) },
        ],
      },
      storage_return_zip: { filename: 'storage.zip', version: '8.7.0', sha256: sha256File(storageZip), required_entry: 'output/runtime/node_modules/better-sqlite3/build/Release/better_sqlite3.node', required_entry_sha256: digest(sqlitePe), sqlite: '3.43.1', electron_abi: 110, profile: 'E22-SQLITE343-LOCAL-SSD' },
      runner_return_zip_v24_historical: JSON.parse(fs.readFileSync(path.join(process.cwd(), 'release/win7-product-v3/a9-07-input-lock.json'), 'utf8')).inputs.runner_return_zip,
    },
    gates: {
      win10: 'PASS_D013_V25_RETURN_REVIEWED',
      win7: 'NOT_PERFORMED_WIN7_22', alpha: 'NOT_PERFORMED',
    },
    provenance: {
      task: 'A9-14', superseded_candidate: 'WIN7-21',
      superseded_candidate_result: 'FIX_BEFORE_ALPHA',
    },
    forbidden_payload_patterns: ['.git/', '.env', 'private.pem', 'winpty', 'node-pty', 'portable-data/', 'a9-state.db'],
  };
  const lockPath = path.join(root, 'a9-14-win7-22-input-lock.json'); writeJson(lockPath, lock);
  return { electronZip, runnerZip, storageZip, lockPath, approvalRegistryPath };
}

test('A9 v3 builder produces byte-identical fixture candidates with the complete runtime closure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-package-fixture-'));
  const inputs = fixture(root);
  const options = { repositoryRoot: process.cwd(), ...inputs, outputRoot: path.join(root, 'out'), allowUncommitted: true };
  const first = buildA9ProductCandidate(options);
  const firstBytes = fs.readFileSync(first.zipPath);
  const second = buildA9ProductCandidate(options);
  assert.deepEqual(fs.readFileSync(second.zipPath), firstBytes);
  const oldLockPath = path.join(root, 'a9-09-input-lock.json');
  const oldLock = JSON.parse(fs.readFileSync(inputs.lockPath, 'utf8'));
  oldLock.lock_id = 'A9-09-INPUTS-D013-V25';
  oldLock.gates.win10 = 'PASS_D013_V25_RETURN_REVIEWED';
  oldLock.gates.win7 = 'NOT_PERFORMED_WIN7_20';
  delete oldLock.provenance;
  writeJson(oldLockPath, oldLock);
  assert.throws(() => buildA9ProductCandidate({ ...options, lockPath: oldLockPath }), /A9_INPUT_LOCK_INVALID/);
  assert.equal(second.manifest.status, 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS');
  assert.equal(second.manifest.gates.developer_package_integrity, 'PASS');
  assert.equal(second.manifest.gates.win10, 'NOT_PERFORMED');
  assert.equal(second.manifest.gates.win7, 'NOT_PERFORMED');
  assert.equal(second.manifest.gates.alpha, 'NOT_PERFORMED');
  assert.equal(second.manifest.external_acceptance_eligible, !second.manifest.source_dirty);
  for (const relative of ACCEPTANCE_REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(second.stage, ...relative.split('/'))), `formal builder closure: ${relative}`);
  }

  const appRoot = path.join(second.stage, 'resources', 'app');
  assert.ok(fs.existsSync(path.join(appRoot, 'git-adapter', 'dist', 'index.js')));
  assert.ok(fs.existsSync(path.join(appRoot, 'product', 'a9-package-runtime.js')));
  assert.ok(fs.existsSync(path.join(appRoot, 'product', 'active-workspace-store.js')));
  assert.ok(fs.existsSync(path.join(appRoot, 'a9-runtime.json')));
  assert.equal(fs.existsSync(path.join(appRoot, 'rc-runtime.json')), false);
  assert.ok(fs.existsSync(path.join(second.stage, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')));
  assert.ok(fs.existsSync(path.join(second.stage, 'validation', 'a9-package-integrity.cjs')));
  assert.ok(fs.existsSync(path.join(second.stage, 'validation', 'a9-win7-17-report.cjs')));
  assert.ok(fs.existsSync(path.join(second.stage, 'validation', 'a9-win7-22-report.cjs')));
  assert.ok(fs.existsSync(path.join(second.stage, 'RUN_WIN7_17_REPORT_VERIFY.cmd')));

  const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, '0.3.0-alpha.1');
  assert.equal(packageJson.main, 'product/main.js');
  assert.equal(packageJson.runtime_profile.state_schema, 4);
  const runtimeProfile = JSON.parse(fs.readFileSync(path.join(appRoot, 'a9-runtime.json'), 'utf8'));
  assert.equal(runtimeProfile.state_schema, 4);
  const validationKit = JSON.parse(fs.readFileSync(path.join(second.stage, 'A9_14_VALIDATION_KIT.json'), 'utf8'));
  assert.equal(validationKit.win7_revalidation_policy.decision, 'ADR-0097');
  assert.deepEqual(validationKit.win7_revalidation_policy.mandatory_impacted, [
    'WIN7_19_SCHEMA_V4_PROFILE',
    'MIGRATION_BACKUP',
    'ATOMIC_CANONICALIZATION',
    'DATA_PRESERVATION',
    'ROLLBACK_DIAGNOSTICS',
    'ELECTRON_STARTUP',
    'D013_V25_PROFILE',
    'D013_PROTOCOL_V2',
    'CURRENT_USER_TOKEN',
    'SHELL_IDENTITY',
    'ENV_OVERLAY_SECRET_FILTER',
    'NO_DEADLINE',
    'READY_ACK',
    'MANAGED_PROCESS_STOP',
  ]);
  assert.equal(validationKit.win7_revalidation_policy.review, 'DEFERRED_TO_ALPHA2_KNOWN_LIMITATION');
  assert.equal(validationKit.incremental_win7_cases.length, 13);
  const schemaCase = validationKit.incremental_win7_cases.find((item) => item.case_id === 'W22-WIN7-19-SCHEMA-V4-COMPAT');
  assert.ok(schemaCase);
  assert.equal(schemaCase.assertions.length, 5);
  assert.match(schemaCase.evidence.join('\n'), /backup SHA-256.*quick_check/i);
  for (const validationCase of validationKit.incremental_win7_cases) {
    assert.match(validationCase.case_id, /^W(?:17|22)-/);
    assert.ok(validationCase.preconditions.length > 0);
    assert.ok(validationCase.steps.length > 0);
    assert.ok(validationCase.expected.length > 0);
    assert.equal(validationCase.assertions.length, validationCase.expected.length);
    assert.ok(validationCase.assertions.every((item) => item.assertion_id.startsWith(`${validationCase.case_id}-A`)));
    assert.ok(validationCase.evidence.length > 0);
  }
  assert.ok(validationKit.source_artifact_hashes['src/core/src/git-command-policy.ts']);
  assert.ok(validationKit.source_artifact_hashes['src/runner/src/background-process-manager.ts']);
  assert.equal(validationKit.source_artifact_hashes['native/helper/argv_builder.cpp'],
    sha256File(path.join(process.cwd(), 'native/helper/argv_builder.cpp')));
  assert.equal(validationKit.source_artifact_hashes['native/helper/argv_builder.h'],
    sha256File(path.join(process.cwd(), 'native/helper/argv_builder.h')));
  assert.match(fs.readFileSync(path.join(second.stage, 'THIRD_PARTY_LICENSES.md'), 'utf8'), /A9 Schema v4/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /set "ELECTRON_RUN_AS_NODE=1"/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /set "NODE_OPTIONS="/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /--package-zip=%~f1/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_14_INTEGRITY.cmd'), 'utf8'), /a9-win7-22-evidence/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_WIN7_22_REPORT_VERIFY.cmd'), 'utf8'), /A9_14_VALIDATION_KIT\.json/);
  const runnerManifest = JSON.parse(fs.readFileSync(path.join(second.stage, 'resources', 'native', 'runner', 'runner-manifest.json'), 'utf8'));
  assert.equal(runnerManifest.helper.profile, 'D-013-v25-a9-trusted-shell-current-user');
  assert.equal(runnerManifest.helper.protocol_version, 2);
  assert.doesNotMatch(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /\bnode(?:\.exe)?\b/i);
  assert.match(fs.readFileSync(path.join(second.stage, 'validation', 'a9-package-integrity.cjs'), 'utf8'), /package_sha256: packageSha256/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('A9 v3 formal source identity must equal the current clean HEAD', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-source-identity-'));
  const inputs = fixture(root);
  assert.throws(() => buildA9ProductCandidate({
    repositoryRoot: process.cwd(),
    ...inputs,
    outputRoot: path.join(root, 'out'),
    allowUncommitted: true,
    sourceCommit: 'f'.repeat(40),
  }), /A9_SOURCE_COMMIT_HEAD_MISMATCH/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('A9 v25 input recorder requires a preapproved kit ZIP and two independently identified returns', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-v25-lock-'));
  const { kitRoot, kitZip, approvedKitRegistry, sourceRepositoryRoot } = createV25AuthorizedKit(root);
  const runnerZip = createV25ReturnFixture(root, kitRoot, '11111111-1111-4111-8111-111111111111', '1');
  const runnerZip2 = createV25ReturnFixture(root, kitRoot, '22222222-2222-4222-8222-222222222222', '2', '2026-08-30T00:01:00.000Z');
  const output = path.join(root, 'a9-09-input-lock.json');
  const result = recordA9V25HelperInput({
    runnerZip,
    sidecar: `${runnerZip}.sha256`,
    runnerZip2,
    sidecar2: `${runnerZip2}.sha256`,
    baseLock: path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'),
    kitZip, testOnlyApprovedKitRegistry: approvedKitRegistry, testOnly: true,
    sourceRepositoryRoot,
    lockId: 'A9-14-INPUTS-D013-V25-WIN7-22',
    win7Gate: 'NOT_PERFORMED_WIN7_22',
    provenance: 'A9-14 test provenance.',
    releaseTask: 'A9-14',
    supersededCandidate: 'WIN7-21',
    releaseRule: 'Test starts a new candidate.',
    output,
  });
  const lock = JSON.parse(fs.readFileSync(output, 'utf8'));
  const v24 = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'), 'utf8'));
  assert.deepEqual(lock.inputs.runner_return_zip_v24_historical, v24.inputs.runner_return_zip);
  assert.equal(lock.inputs.runner_return_zip.profile, 'D-013-v25-a9-trusted-shell-current-user');
  assert.equal(lock.inputs.runner_return_zip.protocol_version, 2);
  assert.equal(lock.inputs.runner_return_zip.runtime_profile, 'a9-trusted-shell-current-user-v1');
  assert.equal(lock.inputs.runner_return_zip.required_entry_sha256, digest(syntheticV25Pe()));
  assert.equal(lock.inputs.runner_return_zip.build_kit.sha256, sha256File(kitZip));
  assert.equal(lock.inputs.runner_return_zip.approval_registry.commit, 'TEST_ONLY');
  assert.equal(lock.inputs.runner_return_zip.approval_registry.sha256, sha256File(approvedKitRegistry));
  assert.equal(lock.lock_id, 'A9-14-INPUTS-D013-V25-WIN7-22');
  assert.equal(lock.gates.win7, 'NOT_PERFORMED_WIN7_22');
  assert.equal(lock.inputs.runner_return_zip.provenance, 'A9-14 test provenance.');
  assert.deepEqual(lock.provenance, {
    task: 'A9-14', superseded_candidate: 'WIN7-21',
    superseded_candidate_result: 'FIX_BEFORE_ALPHA', rule: 'Test starts a new candidate.',
  });
  assert.equal(result.buildKit.source_commit, lock.inputs.runner_return_zip.source_commit);
  assert.throws(() => recordA9V25HelperInput({
    runnerZip, sidecar: `${runnerZip}.sha256`, runnerZip2, sidecar2: `${runnerZip2}.sha256`,
    baseLock: path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'),
    kitZip, testOnlyApprovedKitRegistry: approvedKitRegistry, sourceRepositoryRoot,
    output: path.join(root, 'a9-09-test-registry-without-test-mode.json'),
  }), /A9_V25_TEST_REGISTRY_REQUIRES_TEST_MODE/);
  assert.equal(result.helperSha256, digest(syntheticV25Pe()));
  assert.throws(() => recordA9V25HelperInput({
    runnerZip, runnerZip2, output, kitZip, testOnlyApprovedKitRegistry: approvedKitRegistry, testOnly: true,
  }), /A9_V25_LOCK_REFUSES_OVERWRITE/);
  const reusedOutput = path.join(root, 'a9-09-reused-input-lock.json');
  assert.throws(() => recordA9V25HelperInput({
    runnerZip,
    sidecar: `${runnerZip}.sha256`,
    runnerZip2: runnerZip,
    sidecar2: `${runnerZip}.sha256`,
    baseLock: path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'),
    kitZip, testOnlyApprovedKitRegistry: approvedKitRegistry, testOnly: true,
    sourceRepositoryRoot,
    output: reusedOutput,
  }), /A9_V25_DOUBLE_BUILD_DISTINCT_RETURNS_REQUIRED/);

  const copiedZip = path.join(root, 'D013-V25-WIN10-RETURN-COPY.zip');
  fs.copyFileSync(runnerZip, copiedZip);
  fs.writeFileSync(`${copiedZip}.sha256`, `${sha256File(copiedZip)}  ${path.basename(copiedZip)}\n`, 'ascii');
  assert.throws(() => recordA9V25HelperInput({
    runnerZip, sidecar: `${runnerZip}.sha256`, runnerZip2: copiedZip, sidecar2: `${copiedZip}.sha256`,
    baseLock: path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'),
    kitZip, testOnlyApprovedKitRegistry: approvedKitRegistry, testOnly: true, sourceRepositoryRoot, output: path.join(root, 'a9-09-copy-rejected.json'),
  }), /A9_V25_DOUBLE_BUILD_RETURN_HASH_REUSED/);

  const sameRunZip = createV25ReturnFixture(
    root, kitRoot, '11111111-1111-4111-8111-111111111111', 'same-run', '2026-08-30T00:02:00.000Z',
  );
  assert.throws(() => recordA9V25HelperInput({
    runnerZip, sidecar: `${runnerZip}.sha256`, runnerZip2: sameRunZip, sidecar2: `${sameRunZip}.sha256`,
    baseLock: path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'),
    kitZip, testOnlyApprovedKitRegistry: approvedKitRegistry, testOnly: true, sourceRepositoryRoot, output: path.join(root, 'a9-09-run-rejected.json'),
  }), /A9_V25_DOUBLE_BUILD_RUN_ID_REUSED/);

  const bad = createV25AuthorizedKit(path.join(root, 'bad-source-binding'));
  const badLockPath = path.join(bad.kitRoot, 'input-lock.json');
  const badManifestPath = path.join(bad.kitRoot, 'PACKAGE_MANIFEST.json');
  const badLock = JSON.parse(fs.readFileSync(badLockPath, 'utf8'));
  badLock.source_commit = 'f'.repeat(40);
  writeJson(badLockPath, badLock);
  const badManifest = JSON.parse(fs.readFileSync(badManifestPath, 'utf8'));
  badManifest.source_commit = badLock.source_commit;
  badManifest.files[0].size = fs.statSync(badLockPath).size;
  badManifest.files[0].sha256 = sha256File(badLockPath);
  writeJson(badManifestPath, badManifest);
  const badZip1 = createV25ReturnFixture(root, bad.kitRoot, '33333333-3333-4333-8333-333333333333', 'bad-source-1');
  const badZip2 = createV25ReturnFixture(root, bad.kitRoot, '44444444-4444-4444-8444-444444444444', 'bad-source-2');
  assert.throws(() => recordA9V25HelperInput({
    runnerZip: badZip1, sidecar: `${badZip1}.sha256`, runnerZip2: badZip2, sidecar2: `${badZip2}.sha256`,
    baseLock: path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'),
    kitZip: bad.kitZip, testOnlyApprovedKitRegistry: bad.approvedKitRegistry, testOnly: true, sourceRepositoryRoot: bad.sourceRepositoryRoot,
    output: path.join(root, 'a9-09-source-commit-rejected.json'),
  }), /A9_V25_AUTHORIZED_KIT_BINDING_MISMATCH/);
  const unapprovedKit = path.join(root, 'unapproved-kit.zip');
  fs.copyFileSync(kitZip, unapprovedKit);
  assert.throws(() => recordA9V25HelperInput({
    runnerZip, sidecar: `${runnerZip}.sha256`, runnerZip2, sidecar2: `${runnerZip2}.sha256`,
    baseLock: path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'),
    kitZip: unapprovedKit, testOnlyApprovedKitRegistry: approvedKitRegistry, testOnly: true, sourceRepositoryRoot,
    output: path.join(root, 'a9-09-unapproved-kit-rejected.json'),
  }), /A9_V25_BUILD_KIT_NOT_PREAPPROVED/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('v25 production approval registry must be tracked and byte-identical to clean HEAD', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-v25-registry-head-'));
  const relative = 'release/win7-product-v3/a9-v25-approved-kits.json';
  const registry = path.join(root, relative);
  fs.mkdirSync(path.dirname(registry), { recursive: true });
  writeJson(registry, { schema_version: 1, kits: [] });
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'A9 Fixture'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'a9-fixture@example.invalid'], { cwd: root });
  execFileSync('git', ['add', relative], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'approved registry'], { cwd: root });
  const identity = verifyCommittedApprovalRegistry(registry, root);
  assert.equal(identity.commit, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
  assert.equal(identity.sha256, sha256File(registry));
  assert.equal(identity.path, relative);
  writeJson(registry, { schema_version: 1, kits: [{ status: 'APPROVED_FOR_RETURN_RECORDING' }] });
  assert.throws(() => verifyCommittedApprovalRegistry(registry, root), /APPROVAL_REGISTRY_NOT_CLEAN_HEAD/);
  execFileSync('git', ['add', relative], { cwd: root });
  assert.throws(() => verifyCommittedApprovalRegistry(registry, root), /APPROVAL_REGISTRY_NOT_CLEAN_HEAD/);
  const untrackedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-v25-registry-untracked-'));
  const untracked = path.join(untrackedRoot, relative);
  fs.mkdirSync(path.dirname(untracked), { recursive: true });
  writeJson(untracked, { schema_version: 1, kits: [] });
  execFileSync('git', ['init', '--quiet'], { cwd: untrackedRoot });
  assert.throws(() => verifyCommittedApprovalRegistry(untracked, untrackedRoot), /APPROVAL_REGISTRY_NOT_COMMITTED/);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(untrackedRoot, { recursive: true, force: true });
});

test('A9 integrity uses Electron original-fs so physical ASAR bytes are not virtualized', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-integrity-asar-'));
  const resources = path.join(root, 'resources');
  fs.mkdirSync(resources, { recursive: true });
  const payload = Buffer.from('physical-default-app-asar');
  fs.writeFileSync(path.join(resources, 'default_app.asar'), payload);
  const manifest = { files: [{ path: 'resources/default_app.asar', size: payload.length, sha256: digest(payload) }] };
  const patchedFs = {
    ...fs,
    readFileSync(filePath, ...args) {
      if (String(filePath).endsWith(`${path.sep}default_app.asar`)) return Buffer.from('electron-virtualized-asar-view');
      return fs.readFileSync(filePath, ...args);
    },
  };
  assert.equal(integrity.selectPhysicalFileSystem({ electron: '22.3.27' }, () => fs), fs);
  assert.throws(() => integrity.verifyFullTree(root, manifest, patchedFs), /mismatch:resources\/default_app\.asar/);
  assert.doesNotThrow(() => integrity.verifyFullTree(root, manifest, fs));
  assert.throws(
    () => integrity.selectPhysicalFileSystem({ electron: '22.3.27' }, () => { throw new Error('original-fs unavailable'); }),
    /A9_PHYSICAL_FILESYSTEM_UNAVAILABLE:original-fs unavailable/,
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('v25 recorder requires raw evidence, actual PE/API/CRT closure and matching run/helper bindings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-v25-evidence-'));
  const kit = createV25AuthorizedKit(root);
  const second = createV25ReturnFixture(root, kit.kitRoot, '22222222-2222-4222-8222-222222222222', 'second');
  const rewriteBinding = (directory, update) => {
    const file = path.join(directory, 'evidence/validation-binding.json');
    const binding = JSON.parse(fs.readFileSync(file, 'utf8'));
    update(binding);
    for (const entry of binding.files) {
      const target = path.join(directory, entry.path);
      if (fs.existsSync(target)) { entry.sha256 = sha256File(target); entry.size = fs.statSync(target).size; }
    }
    writeJson(file, binding);
  };
  const variants = [
    ['missing-raw', (directory) => fs.renameSync(path.join(directory, 'evidence/pe-helper-imports.txt'), path.join(root, 'removed-imports.txt')), /RETURN_ENTRY_COUNT/],
    ['text-helper', (directory) => {
      fs.writeFileSync(path.join(directory, 'output/helper.exe'), 'v25-helper-fixture');
      const resultPath = path.join(directory, 'evidence/build-result.json');
      const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
      result.artifacts = [{ path: 'helper.exe', size: Buffer.byteLength('v25-helper-fixture'), sha256: digest('v25-helper-fixture') }];
      writeJson(resultPath, result);
      rewriteBinding(directory, (binding) => { binding.helper_sha256 = digest('v25-helper-fixture'); });
    }, /PE_DOS_SIGNATURE_INVALID/],
    ['wrong-run', (directory) => rewriteBinding(directory, (binding) => { binding.run_id = '33333333-3333-4333-8333-333333333333'; }), /EVIDENCE_RUN_HELPER_BINDING_MISMATCH/],
    ['wrong-helper', (directory) => rewriteBinding(directory, (binding) => { binding.helper_sha256 = HASH; }), /EVIDENCE_RUN_HELPER_BINDING_MISMATCH/],
    ['failed-exit', (directory) => rewriteBinding(directory, (binding) => { binding.exit_codes.v2_smoke = 1; }), /EVIDENCE_EXECUTION_FAILED/],
    ['failed-logic', (directory) => {
      fs.writeFileSync(path.join(directory, 'evidence/logic-tests.txt'), 'logic_tests: FAIL');
      rewriteBinding(directory, () => {});
    }, /LOGIC_EVIDENCE_NOT_PASS/],
    ['false-cleanup', (directory) => {
      const file = path.join(directory, 'evidence/v25-cancel-smoke-stdout.txt');
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"cleanupConfirmed":true', '"cleanupConfirmed":false'));
      rewriteBinding(directory, () => {});
    }, /SMOKE_CLEANUP_PROOF_INVALID/],
    ['bad-capture', (directory) => {
      fs.writeFileSync(path.join(directory, 'evidence/capture-selftest-stdout.bin'), 'wrong bytes');
      rewriteBinding(directory, () => {});
    }, /CAPTURE_EVIDENCE_NOT_PASS/],
    ['false-cmd-marker', (directory) => {
      fs.writeFileSync(path.join(directory, 'evidence/v25-smoke-marker.bin'), 'wrong marker');
      rewriteBinding(directory, () => {});
    }, /CMD_VERBATIM_SMOKE_PROOF_INVALID/],
    ['false-cmd-response', (directory) => {
      fs.writeFileSync(path.join(directory, 'evidence/v25-smoke-response.jsonl'), 'not the raw response');
      rewriteBinding(directory, () => {});
    }, /CMD_VERBATIM_RESPONSE_CAPTURE_MISMATCH/],
    ['false-cmd-request', (directory) => {
      const file = path.join(directory, 'evidence/v25-smoke-request.json');
      const request = JSON.parse(fs.readFileSync(file, 'utf8'));
      request.command = request.command.replace('> "%A9_D013_MARKER_PATH%"', '> %A9_D013_MARKER_PATH%');
      request.argv[3] = request.command;
      writeJson(file, request);
      rewriteBinding(directory, () => {});
    }, /CMD_VERBATIM_SMOKE_PROOF_INVALID/],
    ['lying-dumpbin', (directory) => {
      fs.writeFileSync(path.join(directory, 'evidence/pe-helper-imports.txt'), 'not real imports');
      rewriteBinding(directory, () => {});
    }, /PE_RAW_EVIDENCE_MISMATCH/],
  ];
  for (const [name, mutate, expected] of variants) {
    const first = createV25ReturnFixture(root, kit.kitRoot, '11111111-1111-4111-8111-111111111111', name, undefined, mutate);
    const output = path.join(root, `${name}-must-not-exist.json`);
    assert.throws(() => recordA9V25HelperInput({
      runnerZip: first, runnerZip2: second, kitZip: kit.kitZip, testOnly: true,
      testOnlyApprovedKitRegistry: kit.approvedKitRegistry, sourceRepositoryRoot: kit.sourceRepositoryRoot, output,
    }), expected, name);
    assert.equal(fs.existsSync(output), false);
  }
  const profile = JSON.parse(fs.readFileSync(path.join(kit.kitRoot, 'build-profile.json'), 'utf8'));
  assert.doesNotThrow(() => inspectV25Pe(syntheticV25Pe(), profile));
  assert.throws(() => inspectV25Pe(syntheticV25Pe({ api: 'CreatePseudoConsole' }), profile), /PE_FORBIDDEN_API/);
  assert.throws(() => inspectV25Pe(syntheticV25Pe({ dll: 'VCRUNTIME140.dll' }), profile), /PE_DYNAMIC_CRT/);
  const x86 = syntheticV25Pe(); x86.writeUInt16LE(0x14c, 0x84);
  assert.throws(() => inspectV25Pe(x86, profile), /PE_NOT_AMD64/);
  assert.throws(() => inspectV25Pe(syntheticV25Pe().subarray(0, 300), profile), /PE_TRUNCATED/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('WIN7-22 acceptance requires the formal input lock and complete product closure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-win20-candidate-'));
  const sourceRepositoryRoot = cleanSourceFixture(root);
  const inputs = fixture(root, sourceRepositoryRoot);
  const built = buildA9ProductCandidate({
    repositoryRoot: sourceRepositoryRoot, ...inputs, outputRoot: path.join(root, 'out'),
  });
  const stage = built.stage;
  const manifestPath = path.join(stage, 'release-manifest.json');
  const zip = built.zipPath;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const formalLockBytes = fs.readFileSync(inputs.lockPath);
  const electronPath = path.join(stage, 'electron.exe');
  const electronBytes = fs.readFileSync(electronPath);
  const releaseAuthorityPath = path.join(root, 'release-authority.json');
  const releaseAuthority = {
    schema_version: 1, kind: 'WIN7_22_RELEASE_AUTHORITY', status: 'APPROVED_FOR_WIN7_22_VALIDATION',
    formal_input_lock_sha256: sha256File(inputs.lockPath),
    approval_registry: { commit: manifest.source_commit, sha256: sha256File(inputs.approvalRegistryPath) },
    candidate: { source_commit: manifest.source_commit, package_sha256: sha256File(zip), manifest_sha256: sha256File(manifestPath) },
  };
  writeJson(releaseAuthorityPath, releaseAuthority);
  const options = {
    zip,
    'release-manifest': manifestPath,
    kit: path.join(stage, 'A9_14_VALIDATION_KIT.json'),
    'formal-input-lock': inputs.lockPath,
    'approval-registry': inputs.approvalRegistryPath,
    'release-authority': releaseAuthorityPath,
    'release-authority-sha256': sha256File(releaseAuthorityPath),
  };
  // Only this test owns approval pins. Production never derives approval from
  // a candidate; malformed-lock/PE cases below deliberately issue new TEST pins
  // to exercise defense in depth after the external trust gate.
  const pinTestAuthority = () => {
    releaseAuthority.formal_input_lock_sha256 = sha256File(inputs.lockPath);
    releaseAuthority.approval_registry.sha256 = sha256File(inputs.approvalRegistryPath);
    writeJson(releaseAuthorityPath, releaseAuthority);
    options['release-authority-sha256'] = sha256File(releaseAuthorityPath);
  };
  const publish = () => {
    fs.rmSync(manifestPath, { force: true });
    manifest.files = createFileManifest(stage, JSON.parse(fs.readFileSync(inputs.lockPath, 'utf8')).forbidden_payload_patterns);
    writeJson(manifestPath, manifest);
    writeDeterministicZip(path.dirname(stage), zip, 1787443200);
  };
  const validZip = fs.readFileSync(zip);
  const identity = win22Report.identityFrom(options, fs);
  assert.equal(identity.package_sha256, digest(validZip));
  assert.equal(identity.manifest_sha256, sha256File(manifestPath));
  assert.equal(identity.formal_input_lock_sha256, sha256File(inputs.lockPath));
  assert.equal(identity.approval_registry_sha256, sha256File(inputs.approvalRegistryPath));
  assert.equal(identity.approval_registry_commit, manifest.source_commit);
  assert.equal(identity.release_authority_sha256, options['release-authority-sha256']);
  const cliOptions = Object.entries(options).flatMap(([key, value]) => [`--${key}`, value]);
  const initialized = JSON.parse(execFileSync(process.execPath, [
    path.join(process.cwd(), 'release/win7-product-v3/a9-win7-22-report.cjs'), 'init', ...cliOptions,
  ], { encoding: 'utf8' }));
  assert.deepEqual(initialized.candidate, identity);
  assert.equal(initialized.status, 'NOT_PERFORMED');
  const cliIntegrity = spawnSync(process.execPath, [
    path.join(process.cwd(), 'release/win7-product-v3/a9-package-integrity.cjs'),
    `--candidate-root=${stage}`, `--package-zip=${zip}`, `--formal-input-lock=${inputs.lockPath}`,
    `--approval-registry=${inputs.approvalRegistryPath}`, `--release-authority=${releaseAuthorityPath}`,
    `--release-authority-sha256=${options['release-authority-sha256']}`, `--out=${path.join(root, 'integrity.json')}`,
  ], { encoding: 'utf8' });
  const cliReport = JSON.parse(cliIntegrity.stdout);
  // A development Node host must not impersonate packaged Windows Electron.
  assert.equal(cliIntegrity.status, 1);
  assert.equal(cliReport.status, 'FAIL');
  assert.equal(cliReport.cases.find((item) => item.id === 'A9PKG-INTEGRITY-A9-14-CLOSURE').status, 'PASS');
  assert.equal(cliReport.release_authority.release_authority_sha256, options['release-authority-sha256']);
  assert.throws(() => win22Report.identityFrom({ ...options, 'release-authority-sha256': undefined }, fs), /EXTERNAL_AUTHORITY_REQUIRED/);
  assert.throws(() => win22Report.identityFrom({ ...options, 'release-authority-sha256': 'f'.repeat(64) }, fs), /AUTHORITY_PIN_MISMATCH/);
  assert.throws(() => win22Report.identityFrom({ ...options, 'formal-input-lock': undefined }, fs), /FORMAL_INPUT_LOCK_REQUIRED/);
  assert.throws(() => win22Report.identityFrom({ ...options, 'formal-input-lock': path.join(stage, 'a9-14-win7-22-input-lock.json') }, fs), /EXTERNAL_AUTHORITY_INSIDE_CANDIDATE/);
  for (const flags of [{ source_dirty: true }, { external_acceptance_eligible: false }, { source_dirty: undefined }]) {
    writeJson(manifestPath, { ...manifest, ...flags });
    assert.throws(() => win22Report.identityFrom(options, fs), /CANDIDATE_NOT_ACCEPTANCE_ELIGIBLE/);
  }
  publish();
  fs.writeFileSync(zip, 'not a ZIP');
  assert.throws(() => win22Report.identityFrom(options, fs), /CANDIDATE_ZIP_INVALID/);
  fs.writeFileSync(zip, validZip);
  writeJson(manifestPath, { ...manifest, source_commit: 'b'.repeat(40) });
  assert.throws(() => win22Report.identityFrom(options, fs), /INPUT_LOCK_CONTRACT_INVALID/);
  publish();
  fs.appendFileSync(electronPath, 'tampered');
  assert.throws(() => win22Report.identityFrom(options, fs), /mismatch:electron.exe/);
  fs.writeFileSync(electronPath, electronBytes);
  const fakeKit = path.join(root, 'fake-kit.json'); writeJson(fakeKit, { arbitrary: true });
  assert.throws(() => win22Report.identityFrom({ ...options, kit: fakeKit }, fs), /CANDIDATE_CLOSURE_MISMATCH/);

  const fakeLock = JSON.parse(formalLockBytes.toString('utf8'));
  fakeLock.inputs.electron_zip.required_entry_sha256 = digest('synthetic electron');
  fs.writeFileSync(inputs.lockPath, `${JSON.stringify(fakeLock, null, 2)}\n`);
  fs.copyFileSync(inputs.lockPath, path.join(stage, 'a9-14-win7-22-input-lock.json'));
  fs.writeFileSync(electronPath, 'synthetic electron');
  manifest.release_authority.formal_input_lock_sha256 = sha256File(inputs.lockPath);
  publish();
  assert.throws(() => win22Report.identityFrom(options, fs), /RELEASE_AUTHORITY_BINDING_INVALID/);
  pinTestAuthority();
  assert.throws(() => win22Report.identityFrom(options, fs), /NATIVE_NOT_PE:electron\.exe/);
  fs.writeFileSync(inputs.lockPath, formalLockBytes);
  fs.copyFileSync(inputs.lockPath, path.join(stage, 'a9-14-win7-22-input-lock.json'));
  fs.writeFileSync(electronPath, electronBytes);
  manifest.release_authority.formal_input_lock_sha256 = sha256File(inputs.lockPath);
  pinTestAuthority();

  for (const [mutate, expected] of [
    [(runner) => { runner.reproducible_builds[1].sha256 = runner.reproducible_builds[0].sha256; }, /REPRODUCIBLE_BUILD_BINDING_INVALID/],
    [(runner) => { runner.reproducible_builds[1].run_id = runner.reproducible_builds[0].run_id; }, /REPRODUCIBLE_BUILD_BINDING_INVALID/],
    [(runner) => { delete runner.reproducible_builds[1].evidence_binding_sha256; }, /REPRODUCIBLE_BUILD_BINDING_INVALID/],
    [(runner) => { runner.reproducible_builds[1].evidence_binding_sha256 = runner.reproducible_builds[0].evidence_binding_sha256; }, /REPRODUCIBLE_BUILD_BINDING_INVALID/],
    [(runner) => { runner.approval_registry.commit = 'TEST_ONLY'; }, /EXTERNAL_AUTHORITY_CONTRACT_INVALID/],
    [(runner) => { runner.approval_registry.commit = 'e'.repeat(40); }, /EXTERNAL_AUTHORITY_CONTRACT_INVALID/],
    [(runner) => { runner.build_kit.source_commit = 'e'.repeat(40); }, /EXTERNAL_AUTHORITY_CONTRACT_INVALID/],
    [(runner) => { runner.build_kit.sha256 = 'e'.repeat(64); }, /BUILD_KIT_NOT_EXTERNALLY_APPROVED/],
  ]) {
    const invalidLock = JSON.parse(formalLockBytes.toString('utf8'));
    mutate(invalidLock.inputs.runner_return_zip);
    writeJson(inputs.lockPath, invalidLock);
    fs.copyFileSync(inputs.lockPath, path.join(stage, 'a9-14-win7-22-input-lock.json'));
    manifest.release_authority.formal_input_lock_sha256 = sha256File(inputs.lockPath);
    publish();
    pinTestAuthority();
    assert.throws(() => win22Report.identityFrom(options, fs), expected);
  }
  fs.writeFileSync(inputs.lockPath, formalLockBytes);
  fs.copyFileSync(inputs.lockPath, path.join(stage, 'a9-14-win7-22-input-lock.json'));
  manifest.release_authority.formal_input_lock_sha256 = sha256File(inputs.lockPath);
  pinTestAuthority();

  for (const [relative, inputKey, nativeKey, mutate, expected] of [
    ['resources/native/runner/spike02_helper.exe', 'runner_return_zip', 'runner_helper', () => Buffer.from('synthetic helper'), /NATIVE_NOT_PE:spike02_helper/],
    ['resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'storage_return_zip', 'better_sqlite3_node', () => Buffer.from('synthetic sqlite'), /NATIVE_NOT_PE:better_sqlite3/],
    ['electron.exe', 'electron_zip', null, (bytes) => { bytes.writeUInt16LE(0x14c, 0x84); return bytes; }, /NATIVE_NOT_AMD64_PE/],
    ['electron.exe', 'electron_zip', null, (bytes) => bytes.subarray(0, 0x250), /NATIVE_PE_SECTION_TRUNCATED/],
    ['resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'storage_return_zip', 'better_sqlite3_node', () => syntheticV25Pe(), /NATIVE_PE_CONTRACT_INVALID/],
  ]) {
    const absolute = path.join(stage, relative);
    const original = fs.readFileSync(absolute);
    const bytes = mutate(Buffer.from(original));
    fs.writeFileSync(absolute, bytes);
    const invalidLock = JSON.parse(formalLockBytes.toString('utf8'));
    invalidLock.inputs[inputKey].required_entry_sha256 = digest(bytes);
    writeJson(inputs.lockPath, invalidLock);
    fs.copyFileSync(inputs.lockPath, path.join(stage, 'a9-14-win7-22-input-lock.json'));
    const originalNativeHash = nativeKey && manifest.required_native[nativeKey];
    if (nativeKey) manifest.required_native[nativeKey] = digest(bytes);
    manifest.release_authority.formal_input_lock_sha256 = sha256File(inputs.lockPath);
    publish();
    pinTestAuthority();
    assert.throws(() => win22Report.identityFrom(options, fs), expected);
    fs.writeFileSync(absolute, original);
    if (nativeKey) manifest.required_native[nativeKey] = originalNativeHash;
  }
  fs.writeFileSync(inputs.lockPath, formalLockBytes);
  fs.copyFileSync(inputs.lockPath, path.join(stage, 'a9-14-win7-22-input-lock.json'));
  manifest.release_authority.formal_input_lock_sha256 = sha256File(inputs.lockPath);
  pinTestAuthority();

  const originalRegistry = fs.readFileSync(inputs.approvalRegistryPath);
  const registry = JSON.parse(originalRegistry.toString('utf8'));
  registry.kits[0].status = 'REVOKED_FOR_TEST';
  fs.writeFileSync(inputs.approvalRegistryPath, `${JSON.stringify(registry, null, 2)}\n`);
  publish();
  assert.throws(() => win22Report.identityFrom(options, fs), /RELEASE_AUTHORITY_BINDING_INVALID/);
  pinTestAuthority();
  assert.throws(() => win22Report.identityFrom(options, fs), /EXTERNAL_AUTHORITY_CONTRACT_INVALID/);
  fs.writeFileSync(inputs.approvalRegistryPath, originalRegistry);
  pinTestAuthority();
  publish();

  const mainPath = path.join(stage, 'resources/app/product/main.js');
  const mainBytes = fs.readFileSync(mainPath);
  fs.appendFileSync(mainPath, '\n// tampered runtime with self-consistent ZIP/manifest\n');
  publish();
  assert.throws(() => win22Report.identityFrom(options, fs), /APPROVED_CANDIDATE_HASH_MISMATCH/);
  fs.writeFileSync(mainPath, mainBytes);

  for (const relative of ACCEPTANCE_REQUIRED_FILES) {
    const absolute = path.join(stage, relative);
    const original = fs.readFileSync(absolute);
    fs.rmSync(absolute);
    publish();
    assert.throws(() => win22Report.identityFrom(options, fs), /A9_W22_(?:CANDIDATE_CLOSURE_MISSING|CANDIDATE_CLOSURE_MISMATCH|KIT_NOT_FILE)/, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, original);
  }
  fs.rmSync(path.join(stage, 'resources/app/node_modules/ajv/package.json'));
  publish();
  assert.throws(() => win22Report.identityFrom(options, fs), /RUNTIME_DEPENDENCY_CLOSURE_MISSING:ajv/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('WIN7-17 report verifier requires candidate binding, every assertion, and hashed external evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-win7-report-'));
  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(evidenceRoot);
  fs.writeFileSync(path.join(evidenceRoot, 'proof.txt'), 'external proof\n', 'utf8');
  const evidence = [{ path: 'proof.txt', sha256: sha256File(path.join(evidenceRoot, 'proof.txt')) }];
  const identity = {
    release_id: 'WIN7-CODING-AGENT-A9-ALPHA1', version: '0.3.0-alpha.1', source_commit: 'a'.repeat(40),
    package_filename: 'Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip', package_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64),
  };
  const kit = {
    incremental_win7_cases: Array.from({ length: 8 }, (_value, index) => ({
      case_id: `W17-CASE-${index + 1}`,
      assertions: [{ assertion_id: `W17-CASE-${index + 1}-A1`, expected: 'verified' }],
    })),
  };
  const report = {
    schema_version: 1, report_kind: 'WIN7_17_INCREMENTAL_ACCEPTANCE', candidate: identity, status: 'PASS',
    results: kit.incremental_win7_cases.map((validationCase) => ({
      case_id: validationCase.case_id, status: 'PASS', executions: [{
        environment: {
          windows_version: 'Windows 7 SP1 build 7601', architecture: 'x64', token_kind: 'ordinary-user',
          elevation: 'not-elevated', dpi: '100%', shell_profile: 'POWERSHELL_5_1', evidence_root: fs.realpathSync(evidenceRoot),
        },
        assertions: [{ assertion_id: validationCase.assertions[0].assertion_id, passed: true, detail: 'observed on physical machine', evidence }],
      }],
    })),
  };
  assert.equal(win7Report.verifyReport(report, kit, identity, fs.realpathSync(evidenceRoot), fs).status, 'PASS');
  report.results[0].executions[0].assertions = [];
  assert.throws(() => win7Report.verifyReport(report, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W17_ASSERTIONS_REQUIRED/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('WIN7-22 report verifier binds inheritance and parses direct D-013 protocol evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-win22-report-'));
  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(evidenceRoot);
  fs.writeFileSync(path.join(evidenceRoot, 'proof.txt'), 'external proof\n', 'utf8');
  const evidence = [{ path: 'proof.txt', sha256: sha256File(path.join(evidenceRoot, 'proof.txt')) }];
  const identity = {
    release_id: 'WIN7-CODING-AGENT-A9-ALPHA1', version: '0.3.0-alpha.1', source_commit: 'd'.repeat(40),
    package_filename: 'Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip', package_sha256: 'e'.repeat(64), manifest_sha256: 'f'.repeat(64),
  };
  const inheritedCandidate = {
    release_id: 'WIN7-CODING-AGENT-A9-ALPHA1', version: '0.3.0-alpha.1',
    source_commit: '781b20e3da277570f85c28286d7ea5bbbdd5fa28',
    package_filename: 'Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip',
    package_sha256: '824a10cd213534aca87c348d8304b053d27a5bd896831daf528ed13b1c1c72b0',
    manifest_sha256: 'b483e9b0bcab19cf96114bda39e5d8a9ef8a48842c9aaabbaabfa7e87af12c26',
  };
  const inheritedRoot = path.join(evidenceRoot, 'WIN7-19');
  fs.mkdirSync(inheritedRoot);
  const disposition = {
    schema_version: 1, candidate_id: 'WIN7-19', decision: 'GO_FOR_ALPHA',
    candidate: {
      source_commit: inheritedCandidate.source_commit,
      package_sha256: inheritedCandidate.package_sha256,
      manifest_sha256: inheritedCandidate.manifest_sha256,
    },
    report_verifier: { verified_cases: 8 },
  };
  const ledger = {
    schema_version: 1, candidate_id: 'WIN7-19', policy: 'ADR-0097_IMPACT_SCOPED_INCREMENTAL_REVALIDATION',
    current_source_commit: inheritedCandidate.source_commit,
    inherited_unaffected_scope: ['conversation', 'schema', 'checkpoint', 'managed process', 'path and encoding'],
  };
  const oldReport = {
    schema_version: 1, report_kind: 'WIN7_17_INCREMENTAL_ACCEPTANCE',
    candidate: inheritedCandidate,
    results: Array.from({ length: 8 }, (_value, index) => ({
      case_id: `W17-CASE-${index + 1}`,
      status: index === 4 ? 'PASS' : 'EVIDENCE_PENDING',
    })),
  };
  const sourceDocuments = [
    ['final', 'WIN7-19-final-disposition.json', disposition, [
      ['/schema_version', 1], ['/candidate_id', 'WIN7-19'], ['/decision', 'GO_FOR_ALPHA'],
      ['/candidate/source_commit', inheritedCandidate.source_commit], ['/report_verifier/verified_cases', 8],
    ]],
    ['ledger', 'WIN7-19-INHERITED-EVIDENCE.json', ledger, [
      ['/schema_version', 1], ['/candidate_id', 'WIN7-19'], ['/current_source_commit', inheritedCandidate.source_commit],
    ]],
    ['report', 'win7-19-incremental-report.json', oldReport, [
      ['/schema_version', 1], ['/report_kind', 'WIN7_17_INCREMENTAL_ACCEPTANCE'],
      ['/results/4/case_id', 'W17-CASE-5'], ['/results/4/status', 'PASS'],
    ]],
  ].map(([sourceId, filename, document, requirements]) => {
    const file = path.join(inheritedRoot, filename);
    writeJson(file, document);
    return {
      source_id: sourceId, path: `WIN7-19/${filename}`, sha256: sha256File(file),
      required_values: requirements.map(([json_pointer, value]) => ({ json_pointer, value })),
    };
  });
  const caseBindings = Object.fromEntries(Array.from({ length: 8 }, (_value, index) => {
    const caseId = `W17-CASE-${index + 1}`;
    return [caseId, [{
      source_id: index === 4 ? 'report' : 'ledger',
      json_pointer: index === 4 ? '/results/4' : `/inherited_unaffected_scope/${Math.min(index, 4)}`,
    }]];
  }));
  const kit = {
    schema_version: 2,
    inherited_evidence: {
      decision: 'ADR-0097', allowed_case_prefix: 'W17-', candidate: inheritedCandidate,
      evidence_sources: sourceDocuments, case_bindings: caseBindings,
    },
    schema_v4_inheritance: {
      status: 'INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH', source_commit: 'd'.repeat(40),
      from_candidate: { candidate_id: 'WIN7-21', result: 'FIX_BEFORE_ALPHA' },
      source_artifact_hashes: { 'src/state/src/a9-persistence.ts': '1'.repeat(64) }, evidence,
    },
    incremental_win7_cases: [...Array.from({ length: 8 }, (_value, index) => `W17-CASE-${index + 1}`),
      'W22-WIN7-19-SCHEMA-V4-COMPAT', 'W22-D013-V25-CURRENT-USER', 'W22-D013-V25-ENV-IDENTITY',
      'W22-D013-V25-NO-DEADLINE-STOP', 'W22-D013-V25-BACKGROUND-READY'].map((caseId) => {
      return { case_id: caseId, assertions: [{ assertion_id: `${caseId}-A1`, expected: 'verified' }] };
    }),
  };
  const environment = {
    windows_version: 'Windows 7 SP1 build 7601', architecture: 'x64', token_kind: 'ordinary-user',
    elevation: 'not-elevated', dpi: '100%', shell_profile: 'D-013-v25-a9-trusted-shell-current-user', evidence_root: fs.realpathSync(evidenceRoot),
  };
  const probeId = '55555555-5555-4555-8555-555555555555';
  const jsonEvidence = (filename, document) => {
    const file = path.join(evidenceRoot, filename);
    writeJson(file, document);
    return [{ path: filename, sha256: sha256File(file) }];
  };
  const machineBinding = {
    probe_id: probeId, os_build: '6.1.7601', integrity_level: 'medium',
    os_probe_command: 'cmd.exe /d /s /c ver', token_probe_command: 'C:\\Windows\\System32\\whoami.exe /all',
    candidate_start_candidate: identity, postflight_candidate: identity,
    evidence: {
      os_probe: jsonEvidence('w20-os-probe.json', {
        schema_version: 1, evidence_kind: 'WIN7_OS_PROBE', probe_id: probeId,
        command: 'cmd.exe /d /s /c ver', windows_version: 'Microsoft Windows [Version 6.1.7601]',
      }),
      token_probe: jsonEvidence('w20-token-probe.json', {
        schema_version: 1, evidence_kind: 'WIN7_TOKEN_PROBE', probe_id: probeId,
        command: 'C:\\Windows\\System32\\whoami.exe /all', token_kind: 'ordinary-user', elevation: 'not-elevated',
        integrity_level: 'medium', user_sid: 'S-1-5-21-111-222-333-1001',
      }),
      candidate_start: jsonEvidence('w20-candidate-start.json', {
        schema_version: 1, evidence_kind: 'WIN7_CANDIDATE_START', probe_id: probeId, status: 'PASS',
        executable: '.\\electron.exe', candidate: identity,
      }),
      postflight_identity: jsonEvidence('w20-postflight.json', {
        schema_version: 1, evidence_kind: 'WIN7_POSTFLIGHT_IDENTITY', probe_id: probeId, status: 'PASS',
        managed_processes: 0, helper_processes: 0, package_hashes_unchanged: true, candidate: identity,
      }),
    },
  };
  const markerNames = ['w22-ps-current-user-r3.txt', 'w22-cmd-current-user-r3.txt', 'w22-explicit-shell-r3.txt'];
  const markerValues = ['W22_PS_CURRENT_USER', 'W22_CMD_CURRENT_USER', 'W22_EXPLICIT_SHELL'];
  const markerEvidence = markerNames.map((name, index) => {
    fs.writeFileSync(path.join(evidenceRoot, name), `${markerValues[index]}\r\n`, 'utf8');
    return { path: name, sha256: sha256File(path.join(evidenceRoot, name)) };
  });
  const tokenAudit = {
    verified: true, tokenMode: 'current_user', restrictedToken: false, tokenType: 'primary', sameUser: true,
    lowIntegrity: false,
  };
  const transcript = (requestId, shellKind, command, stdout, canceled = false) => {
    const shellPath = shellKind === 'cmd' ? 'C:\\Windows\\System32\\cmd.exe'
      : 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const wrapped = `$ProgressPreference='SilentlyContinue'\r\n${command}\r\nexit 0`;
    const argv = shellKind === 'cmd' ? ['/d', '/s', '/c', command]
      : ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(wrapped, 'utf16le').toString('base64')];
    const stdoutBase64 = Buffer.from(stdout).toString('base64');
    return {
      request: { schemaVersion: 2, requestId, profileId: 'a9-trusted-shell-current-user-v1', executable: shellPath,
        argv, shellKind, shellPath, shellIdentity: 'a'.repeat(64), command, cwd: 'C:\\A9验收\\工作区\\中文 空格项目',
        managed: true, deadlineMode: 'none' },
      ready: { schemaVersion: 2, type: 'execution_started', requestId, profileId: 'a9-trusted-shell-current-user-v1',
        helperPid: 101, childPid: 102, ready: { childJobAssignmentVerified: true, inputDetached: true,
          stdoutCaptureReady: true, stderrCaptureReady: true }, tokenAudit },
      result: { schemaVersion: 2, type: 'execution_result', requestId, profileId: 'a9-trusted-shell-current-user-v1',
        status: 'completed', containmentVerified: true, inputDetached: true, cleanupConfirmed: true,
        workDirAclModified: false, hostJob: { childJobAssignmentVerified: true }, tokenAudit, canceled,
        timedOut: false, idleTimedOut: false, stdoutBase64, stdoutSize: Buffer.byteLength(stdout),
        stderrBase64: '', stderrSize: 0 },
    };
  };
  const ps = transcript('w22-current-ps', 'powershell', "Write-Output 'w22-ps-current-user'; Write-Output 'PS_WRITE_OK'", 'PS_WRITE_OK\r\n');
  const cmd = transcript('w22-current-cmd', 'cmd', '> "%A9_W22_WORKSPACE%\\w22-cmd-current-user-r3.txt" echo W22_CMD_CURRENT_USER & echo CMD_WRITE_OK', 'CMD_WRITE_OK\r\n');
  const explicit = transcript('w22-current-explicit', 'cmd', '> "C:\\A9验收\\工作区\\中文 空格项目\\w22-explicit-shell-r3.txt" echo W22_EXPLICIT_SHELL', '');
  const filtered = transcript('w22-env-filtered', 'cmd', 'echo FILTERED_OK', 'FILTERED_OK\r\n');
  const visible = transcript('w22-env-visible', 'cmd', 'echo VISIBLE_OK', 'VISIBLE_OK\r\n');
  const noDeadline = transcript('w22-no-deadline-stop', 'powershell', 'Start-Sleep -Seconds 30', '', true);
  const background = transcript('w22-background-ready', 'cmd', 'ping.exe -t 127.0.0.1', '', true);
  const d013Document = {
    schema_version: 1, evidence_kind: 'WIN7_22_D013_V25_CURRENT_CANDIDATE_CASES', candidate: identity,
    probe_id: probeId, environment: { token_kind: 'ordinary-user', elevation: 'not-elevated', integrity_level: 'medium',
      shell_profile: 'D-013-v25-a9-trusted-shell-current-user', helper_sha256: 'b'.repeat(64) },
    cases: {
      'W22-D013-V25-CURRENT-USER': { status: 'PASS', powershell: ps, cmd, explicit_shell: explicit,
        acl_unchanged: true, acl_sddl_sha256_before: 'c'.repeat(64), acl_sddl_sha256_after: 'c'.repeat(64),
        created_files: markerEvidence },
      'W22-D013-V25-ENV-IDENTITY': { status: 'PASS', filtered_child: filtered, visible_child: visible,
        rejected_entries: ['API_TOKEN', 'NODE_OPTIONS', 'ELECTRON_ENABLE_LOGGING', 'NODE_TLS_REJECT_UNAUTHORIZED',
          'BUILD_SECRET_VALUE', 'BUILD_SECRET_BASE64', 'BUILD_SECRET_BASE64URL', 'BUILD_SECRET_PERCENT']
          .map((name) => ({ name, code: 'A9_ENV_OVERLAY_REJECTED' })),
        ordinary_overlay_visible: true, inherited_secret_variants_absent: true,
        provider_rotation_rejection: 'A9_ENV_OVERLAY_REJECTED', persisted_rejection_survived_restart: true,
        explicit_reapply_required_and_succeeded: true,
        explicit_shell_identity_mismatch: { status: 'failed', error_code: 'A9_SHELL_IDENTITY_CHANGED', child_executed: false } },
      'W22-D013-V25-NO-DEADLINE-STOP': { status: 'PASS', transcript: noDeadline,
        observed_active_before_stop_ms: 4000, repeated_stop_idempotent: true, execution_count: 1 },
      'W22-D013-V25-BACKGROUND-READY': { status: 'PASS', transcript: background, persisted_pid: 102,
        persisted_pid_is_child_not_helper: true, first_stop_status: 'stopped', second_stop_status: 'exited',
        uncertain_cleanup: { initial_cleanup_required: true, stop_error_code: 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED', process_survived_blind_stop: true },
        recovered_pid: { first_stop_error_code: 'A9_RECOVERED_PROCESS_IDENTITY_UNCONFIRMED', process_survived_blind_stop: true,
          external_stop_then_second_stop_status: 'exited' }, post_case_active_count: 0,
        state_transitions: [{ status: 'running' }] },
    }, secret_scan: { synthetic_plaintext_persisted_in_this_evidence: false },
  };
  const d013Path = path.join(evidenceRoot, 'w22-d013.json');
  const publishD013 = (targetReport) => {
    writeJson(d013Path, d013Document);
    const ref = [{ path: 'w22-d013.json', sha256: sha256File(d013Path) }];
    for (const item of targetReport.results.slice(9)) item.executions[0].d013_evidence = ref;
  };
  const report = {
    schema_version: 2, report_kind: 'WIN7_22_INCREMENTAL_ACCEPTANCE', candidate: identity,
    inherited_evidence_policy: kit.inherited_evidence, status: 'PASS',
    results: kit.incremental_win7_cases.map((validationCase, index) => index < 8 ? {
      case_id: validationCase.case_id, status: 'INHERITED_EVIDENCE', inherited_from: inheritedCandidate,
      evidence_refs: kit.inherited_evidence.case_bindings[validationCase.case_id],
    } : index === 8 ? {
      case_id: validationCase.case_id, status: 'INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH',
      inherited_from: kit.schema_v4_inheritance.from_candidate, evidence,
    } : {
      case_id: validationCase.case_id, status: 'PASS', executions: [{
        candidate: identity, environment, machine_binding: machineBinding,
        assertions: [{ assertion_id: validationCase.assertions[0].assertion_id, passed: true, detail: 'current WIN7-22 execution', evidence }],
      }],
    }),
  };
  publishD013(report);
  const verified = win22Report.verifyReport(report, kit, identity, fs.realpathSync(evidenceRoot), fs);
  assert.equal(verified.status, 'PASS');
  assert.equal(verified.inherited_cases, 9);
  assert.equal(verified.direct_current_candidate_cases, 4);
  const schemaAsCurrentPass = JSON.parse(JSON.stringify(report));
  schemaAsCurrentPass.results[8] = { case_id: 'W22-WIN7-19-SCHEMA-V4-COMPAT', status: 'PASS', executions: [] };
  assert.throws(() => win22Report.verifyReport(schemaAsCurrentPass, kit, identity, fs.realpathSync(evidenceRoot), fs),
    /A9_W22_CASE_STATUS_INVALID/);
  const proofOnly = JSON.parse(JSON.stringify(report));
  delete proofOnly.results[9].executions[0].d013_evidence;
  assert.throws(() => win22Report.verifyReport(proofOnly, kit, identity, fs.realpathSync(evidenceRoot), fs),
    /A9_W22_D013_W22-D013-V25-CURRENT-USER_SINGLE_JSON_EVIDENCE_REQUIRED/);
  const originalCmdArgv = d013Document.cases['W22-D013-V25-CURRENT-USER'].cmd.request.argv;
  d013Document.cases['W22-D013-V25-CURRENT-USER'].cmd.request.argv = ['/d', '/s', '/c', 'echo forged'];
  const forgedCmd = JSON.parse(JSON.stringify(report));
  publishD013(forgedCmd);
  assert.throws(() => win22Report.verifyReport(forgedCmd, kit, identity, fs.realpathSync(evidenceRoot), fs),
    /A9_W22_D013_CURRENT_CMD_CMD_ARGV_INVALID/);
  d013Document.cases['W22-D013-V25-CURRENT-USER'].cmd.request.argv = originalCmdArgv;
  publishD013(report);
  const invalid = JSON.parse(JSON.stringify(report));
  invalid.results[8] = {
    case_id: invalid.results[8].case_id,
    status: 'INHERITED_EVIDENCE',
    inherited_from: inheritedCandidate,
    evidence_refs: [],
  };
  assert.throws(() => win22Report.verifyReport(invalid, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W22_CASE_STATUS_INVALID/);
  const staleCandidate = JSON.parse(JSON.stringify(report));
  staleCandidate.results[9].executions[0].candidate.package_sha256 = '0'.repeat(64);
  assert.throws(() => win22Report.verifyReport(staleCandidate, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W22_EXECUTION_CANDIDATE_BINDING_MISMATCH/);
  const wrongEnvironment = JSON.parse(JSON.stringify(report));
  wrongEnvironment.results[9].executions[0].environment.windows_version = 'macOS 15';
  wrongEnvironment.results[9].executions[0].environment.token_kind = 'administrator';
  wrongEnvironment.results[9].executions[0].environment.elevation = 'elevated';
  assert.throws(() => win22Report.verifyReport(wrongEnvironment, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W22_WINDOWS_VERSION_NOT_WIN7_SP1_7601/);
  const arbitraryInheritance = JSON.parse(JSON.stringify(report));
  arbitraryInheritance.results[0].evidence_refs = [{ source_id: 'ledger', json_pointer: '/candidate_id' }];
  assert.throws(() => win22Report.verifyReport(arbitraryInheritance, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W22_INHERITED_CASE_REFS_MISMATCH/);
  fs.writeFileSync(path.join(inheritedRoot, 'WIN7-19-INHERITED-EVIDENCE.json'), '{"tampered":true}\n', 'utf8');
  assert.throws(() => win22Report.verifyReport(report, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W22_INHERITED_SOURCE_HASH_MISMATCH/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('A9 v3 builder fails before publishing when an input hash differs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-package-input-'));
  const inputs = fixture(root);
  fs.appendFileSync(inputs.storageZip, 'tamper');
  assert.throws(() => buildA9ProductCandidate({ repositoryRoot: process.cwd(), ...inputs, outputRoot: path.join(root, 'out'), allowUncommitted: true }), /A9_STORAGE_ZIP_SHA256_MISMATCH/);
  assert.equal(fs.existsSync(path.join(root, 'out')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('A9 v3 builder removes a partial work tree when sensitive payload scanning fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-package-secret-'));
  const inputs = fixture(root);
  const productFile = path.join(process.cwd(), 'src', 'shell', 'product', 'a9-package-runtime.js');
  const original = fs.readFileSync(productFile, 'utf8');
  // Inject through the Electron fixture instead of mutating repository source.
  const electronRoot = path.join(root, 'electron-secret');
  fs.mkdirSync(electronRoot, { recursive: true });
  fs.writeFileSync(path.join(electronRoot, 'electron.exe'), syntheticV25Pe());
  fs.writeFileSync(path.join(electronRoot, 'LICENSE'), 'Electron MIT');
  fs.writeFileSync(path.join(electronRoot, 'leaked.txt'), 'sk-123456789012345678901234567890');
  writeDeterministicZip(electronRoot, inputs.electronZip, 1787443200);
  const lock = JSON.parse(fs.readFileSync(inputs.lockPath, 'utf8'));
  lock.inputs.electron_zip.sha256 = sha256File(inputs.electronZip);
  writeJson(inputs.lockPath, lock);
  const outputRoot = path.join(root, 'out');
  assert.equal(fs.readFileSync(productFile, 'utf8'), original);
  assert.throws(() => buildA9ProductCandidate({ repositoryRoot: process.cwd(), ...inputs, outputRoot, allowUncommitted: true }), /A9_SENSITIVE_PAYLOAD_PROHIBITED:leaked\.txt/);
  assert.equal(fs.existsSync(path.join(outputRoot, '.work')), false);
  fs.rmSync(root, { recursive: true, force: true });
});
