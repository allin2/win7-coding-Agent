import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
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
const win23Integrity = require('../../../release/win7-product-v3/a9-package-integrity-w23.cjs');
const win23Report = require('../../../release/win7-product-v3/a9-win7-23-report.cjs');
const win24Integrity = require('../../../release/win7-product-v3/a9-package-integrity-w24.cjs');
const win24Report = require('../../../release/win7-product-v3/a9-win7-24-report.cjs');
const win25Integrity = require('../../../release/win7-product-v3/a9-package-integrity-w25.cjs');
const win25Report = require('../../../release/win7-product-v3/a9-win7-25-report.cjs');
const win26Integrity = require('../../../release/win7-product-v3/a9-package-integrity-w26.cjs');
const win26Report = require('../../../release/win7-product-v3/a9-win7-26-report.cjs');
const win27Integrity = require('../../../release/win7-product-v3/a9-package-integrity-w27.cjs');
const win27Report = require('../../../release/win7-product-v3/a9-win7-27-report.cjs');
const win28Integrity = require('../../../release/win7-product-v3/a9-package-integrity-w28.cjs');
const win28Report = require('../../../release/win7-product-v3/a9-win7-28-report.cjs');
const projectionContract = require('../../../release/win7-product-v3/a9-projection-contract.cjs');
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
function cleanSourceFixture(root, sourceRef = '') {
  const snapshot = path.join(root, 'source-repository');
  fs.mkdirSync(snapshot, { recursive: true });
  if (sourceRef) {
    const archive = path.join(root, 'source.tar');
    execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, sourceRef], { cwd: process.cwd() });
    execFileSync('tar', ['-xf', archive, '-C', snapshot]);
    fs.rmSync(archive);
  } else {
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

function fixture(root, sourceRepositoryRoot = process.cwd(), candidate = 'win23') {
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
  fs.mkdirSync(path.join(electronRoot, 'resources'));
  fs.writeFileSync(path.join(electronRoot, 'resources', 'default_app.asar'), 'fixture default Electron app');

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
  if (['win23', 'win24', 'win25', 'win26', 'win27', 'win28'].includes(candidate)) {
    const number = candidate.slice(-2);
    lock.lock_id = `A9-15-INPUTS-UI-PROGRESS-WIN7-${number}`;
    lock.source_date_epoch = 1788912000;
    lock.gates.win10 = 'INHERITED_NATIVE_INPUTS_FROM_WIN7_22_EXACT_HASH';
    lock.gates.win7 = `NOT_PERFORMED_WIN7_${number}`;
    lock.provenance = candidate === 'win28'
      ? {
        task: 'A9-15', previous_candidate: 'WIN7-27',
        previous_candidate_result: 'ACCEPTANCE_GAP_REPAIR_REQUIRED',
        change_scope: 'DOM_OUTCOME_TURN_IDENTITY_ROW_CONTENT_PAGINATION_AND_APPROVAL_EXECUTION',
      }
      : candidate === 'win27'
      ? {
        task: 'A9-15', previous_candidate: 'WIN7-26',
        previous_candidate_result: 'PROJECTION_EVIDENCE_AND_INTEGRATION_ASSERTION_REPAIR_REQUIRED',
        change_scope: 'MACHINE_READABLE_PROJECTION_EVIDENCE_AND_DRIVER_PROTOCOL_ISOLATION',
      }
      : candidate === 'win26'
      ? {
        task: 'A9-15', previous_candidate: 'WIN7-25',
        previous_candidate_result: 'VALIDATION_CONTRACT_GAP_REPAIR_REQUIRED',
        change_scope: 'RESTART_PROJECTION_REGRESSION_AND_EXECUTABLE_ACCEPTANCE_ASSERTIONS',
      }
      : candidate === 'win25'
      ? {
        task: 'A9-15', previous_candidate: 'WIN7-24',
        previous_candidate_result: 'FIX_BEFORE_WIN7_25_VALIDATION',
        change_scope: 'RENDERER_RESTART_TIMELINE_AND_LATEST_OUTCOME',
      }
      : candidate === 'win24'
      ? {
        task: 'A9-15', previous_candidate: 'WIN7-23',
        previous_candidate_result: 'FIX_BEFORE_WIN7_24_VALIDATION',
        change_scope: 'VALIDATION_DRIVER_LAUNCH_AND_WIN7_TYPOGRAPHY_CLARITY',
      }
      : {
        task: 'A9-15', previous_candidate: 'WIN7-22',
        previous_candidate_result: 'A9_14_WIN7_22_GO_FOR_ALPHA',
        change_scope: 'UI_PROGRESS_FEEDBACK',
      };
  }
  const lockPath = path.join(root, ['win23', 'win24', 'win25', 'win26', 'win27', 'win28'].includes(candidate)
    ? `a9-15-win7-${candidate.slice(-2)}-input-lock.json`
    : 'a9-14-win7-22-input-lock.json');
  writeJson(lockPath, lock);
  return { electronZip, runnerZip, storageZip, lockPath, approvalRegistryPath };
}

test('A9 v3 builder produces byte-identical fixture candidates with the complete runtime closure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-package-fixture-'));
  const sourceRepositoryRoot = cleanSourceFixture(root, '1c0464441db049d25a28425ebaf9b2db65b0ff59');
  const inputs = fixture(root, sourceRepositoryRoot, 'win22');
  const options = { repositoryRoot: sourceRepositoryRoot, ...inputs, outputRoot: path.join(root, 'out') };
  const first = buildA9ProductCandidate(options);
  const firstBytes = fs.readFileSync(first.zipPath);
  const ignoredRogue = path.join(sourceRepositoryRoot, 'src/runner/dist/.a9-release-ignored-rogue.js');
  fs.writeFileSync(ignoredRogue, 'module.exports = "rogue";\n', 'utf8');
  let second;
  try {
    second = buildA9ProductCandidate(options);
  } finally {
    fs.rmSync(ignoredRogue, { force: true });
  }
  assert.deepEqual(fs.readFileSync(second.zipPath), firstBytes);
  assert.equal(fs.existsSync(path.join(second.stage, 'resources', 'app', 'runner', 'dist', '.a9-release-ignored-rogue.js')), false);
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
  const formalLock = JSON.parse(fs.readFileSync(inputs.lockPath, 'utf8'));
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
  assert.equal(validationKit.required_runner_helper_sha256,
    formalLock.inputs.runner_return_zip.required_entry_sha256);
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

test('WIN7-23 builder and verifier bind a clean A9-15 candidate without reusing WIN7-22 identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-win23-candidate-'));
  const sourceRepositoryRoot = cleanSourceFixture(root);
  const inputs = fixture(root, sourceRepositoryRoot, 'win23');
  const built = buildA9ProductCandidate({
    repositoryRoot: sourceRepositoryRoot, ...inputs, outputRoot: path.join(root, 'out'),
  });
  const stage = built.stage;
  const manifestPath = path.join(stage, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.source_dirty, false);
  assert.equal(manifest.external_acceptance_eligible, true);
  assert.ok(fs.existsSync(path.join(stage, 'A9_15_VALIDATION_KIT.json')));
  for (const relative of win23Integrity.REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(stage, ...relative.split('/'))), `WIN7-23 closure: ${relative}`);
  }
  assert.equal(fs.existsSync(path.join(stage, 'A9_14_VALIDATION_KIT.json')), false);
  const authorityPath = path.join(root, 'release-authority.json');
  writeJson(authorityPath, {
    schema_version: 1,
    kind: 'WIN7_23_RELEASE_AUTHORITY',
    status: 'APPROVED_FOR_WIN7_23_VALIDATION',
    formal_input_lock_sha256: sha256File(inputs.lockPath),
    approval_registry: {
      commit: manifest.source_commit,
      sha256: sha256File(inputs.approvalRegistryPath),
    },
    candidate: {
      source_commit: manifest.source_commit,
      package_sha256: sha256File(built.zipPath),
      manifest_sha256: sha256File(manifestPath),
    },
  });
  const options = {
    zip: built.zipPath,
    'release-manifest': manifestPath,
    kit: path.join(stage, 'A9_15_VALIDATION_KIT.json'),
    'formal-input-lock': inputs.lockPath,
    'approval-registry': inputs.approvalRegistryPath,
    'release-authority': authorityPath,
    'release-authority-sha256': sha256File(authorityPath),
  };
  const identity = win23Report.identityFrom(options, fs);
  assert.equal(identity.candidate_label, 'WIN7-23');
  assert.equal(identity.source_commit, manifest.source_commit);
  const kit = JSON.parse(fs.readFileSync(options.kit, 'utf8'));
  const initialized = win23Report.template(kit, identity);
  assert.equal(initialized.report_kind, 'A9_15_WIN7_23_UI_PROGRESS_ACCEPTANCE');
  assert.equal(initialized.results.length, 8);
  assert.ok(initialized.results.some((item) => item.case_id === 'W23-07-REAL-PROVIDER-MULTITOOL'));
  assert.throws(() => win23Report.identityFrom({ ...options, 'release-authority-sha256': 'f'.repeat(64) }, fs), /AUTHORITY_PIN_MISMATCH/);
  const cli = spawnSync(process.execPath, [
    path.join(stage, 'validation', 'a9-package-integrity-w23.cjs'),
    `--package-zip=${built.zipPath}`, `--formal-input-lock=${inputs.lockPath}`,
    `--approval-registry=${inputs.approvalRegistryPath}`, `--release-authority=${authorityPath}`,
    `--release-authority-sha256=${options['release-authority-sha256']}`, `--out=${path.join(root, 'integrity.json')}`,
  ], { encoding: 'utf8' });
  const integrityReport = JSON.parse(cli.stdout);
  assert.equal(cli.status, 1);
  assert.equal(integrityReport.cases[0].status, 'PASS');
  assert.equal(integrityReport.cases[1].status, 'FAIL');
  assert.match(integrityReport.cases[1].detail, /RUNTIME_ABI_INVALID/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('WIN7-24 packages the external driver runtime contract without modifying WIN7-23 identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-win24-candidate-'));
  const sourceRepositoryRoot = cleanSourceFixture(root);
  const inputs = fixture(root, sourceRepositoryRoot, 'win24');
  const built = buildA9ProductCandidate({
    repositoryRoot: sourceRepositoryRoot, ...inputs, outputRoot: path.join(root, 'out'),
  });
  const stage = built.stage;
  const manifestPath = path.join(stage, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.source_dirty, false);
  assert.equal(manifest.external_acceptance_eligible, true);
  for (const relative of win24Integrity.REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(stage, ...relative.split('/'))), `WIN7-24 closure: ${relative}`);
  }
  assert.equal(fs.existsSync(path.join(stage, 'a9-15-win7-23-input-lock.json')), false);
  assert.equal(fs.existsSync(path.join(stage, 'RUN_WIN7_23_REPORT_VERIFY.cmd')), false);
  const smoke = fs.readFileSync(path.join(stage, 'validation', 'a9-win7-24-smoke.cjs'), 'utf8');
  const driver = fs.readFileSync(path.join(stage, 'validation', 'a9-win7-24-driver.cjs'), 'utf8');
  assert.match(smoke, /process\.noAsar = true/);
  assert.match(smoke, /prepareDriverRuntime/);
  assert.match(smoke, /resources', 'default_app\.asar'/);
  assert.doesNotMatch(smoke, /copyTree\([^\n]*resources[^\n]*app/);
  assert.match(smoke, /phaseReportsValid/);
  assert.match(smoke, /fixtureRequests\.journey > 0 && fixtureRequests\.stop > 0/);
  assert.match(driver, /mode === 'workspace_select' \|\| mode === 'first' \|\| mode === 'stop'/);

  const authorityPath = path.join(root, 'release-authority.json');
  writeJson(authorityPath, {
    schema_version: 1,
    kind: 'WIN7_24_RELEASE_AUTHORITY',
    status: 'APPROVED_FOR_WIN7_24_VALIDATION',
    formal_input_lock_sha256: sha256File(inputs.lockPath),
    approval_registry: {
      commit: manifest.source_commit,
      sha256: sha256File(inputs.approvalRegistryPath),
    },
    candidate: {
      source_commit: manifest.source_commit,
      package_sha256: sha256File(built.zipPath),
      manifest_sha256: sha256File(manifestPath),
    },
  });
  const options = {
    zip: built.zipPath,
    'release-manifest': manifestPath,
    kit: path.join(stage, 'A9_15_VALIDATION_KIT.json'),
    'formal-input-lock': inputs.lockPath,
    'approval-registry': inputs.approvalRegistryPath,
    'release-authority': authorityPath,
    'release-authority-sha256': sha256File(authorityPath),
  };
  const identity = win24Report.identityFrom(options, fs);
  const kit = JSON.parse(fs.readFileSync(options.kit, 'utf8'));
  const initialized = win24Report.template(kit, identity);
  assert.equal(identity.candidate_label, 'WIN7-24');
  assert.equal(kit.scope.decision, 'ADR-0116');
  assert.equal(initialized.report_kind, 'A9_15_WIN7_24_UI_PROGRESS_ACCEPTANCE');
  assert.ok(initialized.results.some((item) => item.case_id === 'W24-07-REAL-PROVIDER-MULTITOOL'));
  assert.throws(() => win24Report.identityFrom({ ...options, 'release-authority-sha256': 'f'.repeat(64) }, fs), /AUTHORITY_PIN_MISMATCH/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('WIN7-25 binds the restart projection repair without modifying WIN7-24 identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-win25-candidate-'));
  const sourceRepositoryRoot = cleanSourceFixture(root);
  const inputs = fixture(root, sourceRepositoryRoot, 'win25');
  const built = buildA9ProductCandidate({
    repositoryRoot: sourceRepositoryRoot, ...inputs, outputRoot: path.join(root, 'out'),
  });
  const stage = built.stage;
  const manifestPath = path.join(stage, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.source_dirty, false);
  assert.equal(manifest.external_acceptance_eligible, true);
  for (const relative of win25Integrity.REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(stage, ...relative.split('/'))), `WIN7-25 closure: ${relative}`);
  }
  assert.equal(fs.existsSync(path.join(stage, 'a9-15-win7-24-input-lock.json')), false);
  assert.equal(fs.existsSync(path.join(stage, 'RUN_WIN7_24_REPORT_VERIFY.cmd')), false);
  const packagedRenderer = fs.readFileSync(path.join(stage, 'resources', 'app', 'product', 'renderer', 'a9-workbench.js'), 'utf8');
  assert.match(packagedRenderer, /inspectorEvents: new Map\(\)/);
  assert.match(packagedRenderer, /eventsForInspector\(\)\.slice\(-60\)/);
  assert.match(packagedRenderer, /text\('a9-turn-outcome', latestProjection/);

  const authorityPath = path.join(root, 'release-authority.json');
  writeJson(authorityPath, {
    schema_version: 1,
    kind: 'WIN7_25_RELEASE_AUTHORITY',
    status: 'APPROVED_FOR_WIN7_25_VALIDATION',
    formal_input_lock_sha256: sha256File(inputs.lockPath),
    approval_registry: {
      commit: manifest.source_commit,
      sha256: sha256File(inputs.approvalRegistryPath),
    },
    candidate: {
      source_commit: manifest.source_commit,
      package_sha256: sha256File(built.zipPath),
      manifest_sha256: sha256File(manifestPath),
    },
  });
  const options = {
    zip: built.zipPath,
    'release-manifest': manifestPath,
    kit: path.join(stage, 'A9_15_VALIDATION_KIT.json'),
    'formal-input-lock': inputs.lockPath,
    'approval-registry': inputs.approvalRegistryPath,
    'release-authority': authorityPath,
    'release-authority-sha256': sha256File(authorityPath),
  };
  const identity = win25Report.identityFrom(options, fs);
  const kit = JSON.parse(fs.readFileSync(options.kit, 'utf8'));
  const initialized = win25Report.template(kit, identity);
  assert.equal(identity.candidate_label, 'WIN7-25');
  assert.equal(kit.scope.decision, 'ADR-0118');
  assert.equal(initialized.report_kind, 'A9_15_WIN7_25_UI_PROGRESS_ACCEPTANCE');
  assert.ok(initialized.results.some((item) => item.case_id === 'W25-03-HISTORY-RESTART-PAGINATION'));
  assert.ok(initialized.results.some((item) => item.case_id === 'W25-04-APPROVAL-FAILURE-ORDER'));
  assert.throws(() => win25Report.identityFrom({ ...options, 'release-authority-sha256': 'f'.repeat(64) }, fs), /AUTHORITY_PIN_MISMATCH/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('WIN7-26 kit and report verifier require executable Inspector and latest-outcome projection evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-win26-candidate-'));
  const sourceRepositoryRoot = cleanSourceFixture(root);
  const inputs = fixture(root, sourceRepositoryRoot, 'win26');
  const built = buildA9ProductCandidate({
    repositoryRoot: sourceRepositoryRoot, ...inputs, outputRoot: path.join(root, 'out'),
  });
  const stage = built.stage;
  const manifestPath = path.join(stage, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const relative of win26Integrity.REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(stage, ...relative.split('/'))), `WIN7-26 closure: ${relative}`);
  }
  const authorityPath = path.join(root, 'release-authority.json');
  writeJson(authorityPath, {
    schema_version: 1, kind: 'WIN7_26_RELEASE_AUTHORITY', status: 'APPROVED_FOR_WIN7_26_VALIDATION',
    formal_input_lock_sha256: sha256File(inputs.lockPath),
    approval_registry: { commit: manifest.source_commit, sha256: sha256File(inputs.approvalRegistryPath) },
    candidate: {
      source_commit: manifest.source_commit, package_sha256: sha256File(built.zipPath),
      manifest_sha256: sha256File(manifestPath),
    },
  });
  const options = {
    zip: built.zipPath, 'release-manifest': manifestPath,
    kit: path.join(stage, 'A9_15_VALIDATION_KIT.json'), 'formal-input-lock': inputs.lockPath,
    'approval-registry': inputs.approvalRegistryPath, 'release-authority': authorityPath,
    'release-authority-sha256': sha256File(authorityPath),
  };
  const identity = win26Report.identityFrom(options, fs);
  const kit = JSON.parse(fs.readFileSync(options.kit, 'utf8'));
  assert.equal(kit.scope.decision, 'ADR-0119');
  assert.ok(kit.required_cases.some((item) => item.case_id === 'W26-03-INSPECTOR-PERSISTED-RESTART'));
  assert.ok(kit.required_cases.some((item) => item.case_id === 'W26-04-LATEST-OUTCOME-PROJECTION'));

  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(evidenceRoot);
  const domPath = path.join(evidenceRoot, 'projection-dom.json');
  writeJson(domPath, { queried_event_ids: [1, 2, 3, 4], inspector_event_ids: [1, 2, 3, 4], outcome: 'completed · verified' });
  const domEvidence = { path: 'projection-dom.json', sha256: sha256File(domPath) };
  const report = {
    ...win26Report.template(kit, identity), status: 'PASS',
    results: kit.required_cases.map((validationCase) => {
      const execution = {
        candidate: identity, run_id: `run-${validationCase.case_id}`,
        environment: {
          os: 'Windows 7 SP1 build 7601', architecture: 'x64', user: 'ordinary-user',
          elevation: 'not-elevated', electron: '22.3.27', electron_abi: 110,
        },
        assertions: validationCase.assertions.map((assertion) => ({ assertion_id: assertion.assertion_id, status: 'PASS' })),
        evidence: [domEvidence],
      };
      if (validationCase.case_id === 'W26-03-INSPECTOR-PERSISTED-RESTART') {
        execution.projection_evidence = {
          conversation_id: 'conversation-current', queried_event_ids: [1, 2, 3, 4],
          inspector_event_ids: [1, 2, 3, 4], session_event_ids: [1], unique: true,
          cross_session_residue: false, dom_export: domEvidence,
        };
      }
      if (validationCase.case_id === 'W26-04-LATEST-OUTCOME-PROJECTION') {
        execution.projection_evidence = {
          conversation_id: 'conversation-current',
          older_failure: { event_id: 2, turn_id: 'turn-old', outcome: 'failed', verification: 'not_applicable' },
          newer_success: { event_id: 4, turn_id: 'turn-new', outcome: 'completed', verification: 'verified' },
          latest_persisted_turn_id: 'turn-new', restart_displayed_outcome: 'completed · verified',
          older_event_load_displayed_outcome: 'completed · verified', dom_export: domEvidence,
        };
      }
      if (validationCase.case_id === 'W26-07-REAL-PROVIDER-MULTITOOL') {
        execution.provider_kind = 'REAL_NON_FIXTURE';
        execution.provider_probe = 'tool_calling';
      }
      return { case_id: validationCase.case_id, status: 'PASS', executions: [execution] };
    }),
  };
  assert.equal(win26Report.verifyReport(report, kit, identity, fs.realpathSync(evidenceRoot), fs).status, 'PASS');

  const missingAssertion = JSON.parse(JSON.stringify(report));
  missingAssertion.results.find((item) => item.case_id === 'W26-03-INSPECTOR-PERSISTED-RESTART').executions[0].assertions.pop();
  assert.throws(() => win26Report.verifyReport(missingAssertion, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W26_ASSERTIONS_MISSING/);
  const failedAssertion = JSON.parse(JSON.stringify(report));
  failedAssertion.results.find((item) => item.case_id === 'W26-04-LATEST-OUTCOME-PROJECTION').executions[0].assertions[0].status = 'FAIL';
  assert.throws(() => win26Report.verifyReport(failedAssertion, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W26_ASSERTION_INVALID/);
  const missingProjection = JSON.parse(JSON.stringify(report));
  delete missingProjection.results.find((item) => item.case_id === 'W26-04-LATEST-OUTCOME-PROJECTION').executions[0].projection_evidence;
  assert.throws(() => win26Report.verifyReport(missingProjection, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W26_PROJECTION_EVIDENCE_REQUIRED/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('WIN7-27 report verifier parses machine-readable projection attachments and rejects contradictions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-win27-candidate-'));
  const sourceRepositoryRoot = cleanSourceFixture(root);
  const inputs = fixture(root, sourceRepositoryRoot, 'win27');
  const built = buildA9ProductCandidate({
    repositoryRoot: sourceRepositoryRoot, ...inputs, outputRoot: path.join(root, 'out'),
  });
  const stage = built.stage;
  const manifestPath = path.join(stage, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const relative of win27Integrity.REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(stage, ...relative.split('/'))), `WIN7-27 closure: ${relative}`);
  }
  const authorityPath = path.join(root, 'release-authority.json');
  writeJson(authorityPath, {
    schema_version: 1, kind: 'WIN7_27_RELEASE_AUTHORITY', status: 'APPROVED_FOR_WIN7_27_VALIDATION',
    formal_input_lock_sha256: sha256File(inputs.lockPath),
    approval_registry: { commit: manifest.source_commit, sha256: sha256File(inputs.approvalRegistryPath) },
    candidate: {
      source_commit: manifest.source_commit, package_sha256: sha256File(built.zipPath),
      manifest_sha256: sha256File(manifestPath),
    },
  });
  const options = {
    zip: built.zipPath, 'release-manifest': manifestPath,
    kit: path.join(stage, 'A9_15_VALIDATION_KIT.json'), 'formal-input-lock': inputs.lockPath,
    'approval-registry': inputs.approvalRegistryPath, 'release-authority': authorityPath,
    'release-authority-sha256': sha256File(authorityPath),
  };
  const identity = win27Report.identityFrom(options, fs);
  const kit = JSON.parse(fs.readFileSync(options.kit, 'utf8'));
  assert.equal(kit.scope.decision, 'ADR-0120');
  assert.equal(kit.required_cases.length, 9);
  assert.ok(kit.required_cases.some((item) => item.case_id === 'W27-03-INSPECTOR-PERSISTED-RESTART'));
  assert.ok(kit.required_cases.some((item) => item.case_id === 'W27-04-APPROVAL-FAILURE-ORDER'));
  assert.ok(kit.required_cases.some((item) => item.case_id === 'W27-09-LATEST-OUTCOME-PROJECTION'));

  // 机器可读投影附件：查询导出 + DOM 导出（重启 / 另一会话 / 切回 / 旧事件补载）。
  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(evidenceRoot);
  const queryEvents = [
    { event_id: 1, turn_id: null, type: 'session_started', outcome: null, verification: null },
    { event_id: 2, turn_id: 'turn-old', type: 'turn_started', outcome: null, verification: null },
    { event_id: 3, turn_id: 'turn-old', type: 'tool_start', outcome: null, verification: null },
    { event_id: 4, turn_id: 'turn-old', type: 'tool_end', outcome: null, verification: null },
    { event_id: 5, turn_id: 'turn-old', type: 'turn_failed', outcome: 'failed', verification: 'not_applicable' },
    { event_id: 6, turn_id: 'turn-new', type: 'turn_started', outcome: null, verification: null },
    { event_id: 7, turn_id: 'turn-new', type: 'tool_start', outcome: null, verification: null },
    { event_id: 8, turn_id: 'turn-new', type: 'tool_end', outcome: null, verification: null },
    { event_id: 9, turn_id: 'turn-new', type: 'turn_completed', outcome: 'completed', verification: 'verified' },
  ];
  const domRows = queryEvents.map((event) => ({
    event_id: event.event_id, turn_id: event.turn_id, event_type: event.type, text: `row ${event.event_id} ${event.type}`,
  }));
  const writeEvidence = (name, value) => {
    const target = path.join(evidenceRoot, name);
    writeJson(target, value);
    return { path: name, sha256: sha256File(target) };
  };
  const domExport = (conversationId, rows) => ({
    schema_version: 1, kind: 'A9_PROJECTION_DOM_EXPORT', conversation_id: conversationId,
    display_range: { rule: 'LAST_60_BY_EVENT_ID_ASC', max_rows: 60, rows_total: rows.length }, rows,
  });
  const queryReference = writeEvidence('projection-query-export.json', {
    schema_version: 1, kind: 'A9_PROJECTION_QUERY_EXPORT', conversation_id: 'conversation-current', events: queryEvents,
  });
  const domReference = writeEvidence('projection-dom-export.json', domExport('conversation-current', domRows));
  const otherReference = writeEvidence('projection-dom-other-conversation.json', domExport('conversation-other', [
    { event_id: 100, turn_id: null, event_type: 'session_started', text: 'other conversation row' },
  ]));
  const resumeReference = writeEvidence('projection-dom-resume.json', domExport('conversation-current', domRows));
  const olderLoadReference = writeEvidence('projection-dom-after-older-load.json', domExport('conversation-current', domRows));
  const sharedEvidence = writeEvidence('session-notes.json', { schema_version: 1, note: 'win7-27 fixture evidence' });

  const projectionByCase = {
    'W27-03-INSPECTOR-PERSISTED-RESTART': {
      query_export: queryReference, dom_export: domReference,
      session_switch: { other_conversation_export: otherReference, resume_export: resumeReference },
    },
    'W27-09-LATEST-OUTCOME-PROJECTION': {
      query_export: queryReference, dom_export: domReference, dom_export_after_older_load: olderLoadReference,
      older_load_mode: 'FULL_HISTORY_ALREADY_LOADED',
      older_failure: { event_id: 5, turn_id: 'turn-old' },
      newer_success: { event_id: 9, turn_id: 'turn-new' },
      restart_displayed_outcome: 'completed · verified',
      older_event_load_displayed_outcome: 'completed · verified',
    },
  };
  const report = {
    ...win27Report.template(kit, identity), status: 'PASS',
    results: kit.required_cases.map((validationCase) => {
      const execution = {
        candidate: identity, run_id: `run-${validationCase.case_id}`,
        environment: {
          os: 'Windows 7 SP1 build 7601', architecture: 'x64', user: 'ordinary-user',
          elevation: 'not-elevated', electron: '22.3.27', electron_abi: 110,
        },
        assertions: validationCase.assertions.map((assertion) => ({ assertion_id: assertion.assertion_id, status: 'PASS' })),
        evidence: [sharedEvidence],
      };
      const projection = projectionByCase[validationCase.case_id];
      if (projection) {
        execution.projection_evidence = projection;
        execution.evidence = [sharedEvidence, queryReference, domReference];
        if (validationCase.case_id === 'W27-03-INSPECTOR-PERSISTED-RESTART') execution.evidence.push(otherReference, resumeReference);
        else execution.evidence.push(olderLoadReference);
      }
      if (validationCase.case_id === 'W27-07-REAL-PROVIDER-MULTITOOL') {
        execution.provider_kind = 'REAL_NON_FIXTURE';
        execution.provider_probe = 'tool_calling';
      }
      return { case_id: validationCase.case_id, status: 'PASS', executions: [execution] };
    }),
  };
  assert.equal(win27Report.verifyReport(report, kit, identity, fs.realpathSync(evidenceRoot), fs).status, 'PASS');

  // 正向 2（真实产品形态）：产品只在 `turn_completed` 上持久化 outcome/verification，
  // `turn_failed` 事件不带这两个字段；verifier 必须仍能从事件类型推导 failed · not_applicable。
  const productShapeQuery = writeEvidence('projection-query-export-product-shape.json', {
    schema_version: 1, kind: 'A9_PROJECTION_QUERY_EXPORT', conversation_id: 'conversation-current',
    events: queryEvents.map((event) => (event.type === 'turn_failed'
      ? { ...event, outcome: null, verification: null } : event)),
  });
  const productShape = JSON.parse(JSON.stringify(report));
  {
    const execution = productShape.results.find((item) => item.case_id === 'W27-09-LATEST-OUTCOME-PROJECTION').executions[0];
    execution.projection_evidence.query_export = productShapeQuery;
    execution.evidence.push(productShapeQuery);
  }
  assert.equal(win27Report.verifyReport(productShape, kit, identity, fs.realpathSync(evidenceRoot), fs).status, 'PASS');

  // 负向 1：缺断言。
  const missingAssertion = JSON.parse(JSON.stringify(report));
  missingAssertion.results.find((item) => item.case_id === 'W27-03-INSPECTOR-PERSISTED-RESTART').executions[0].assertions.pop();
  assert.throws(() => win27Report.verifyReport(missingAssertion, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W27_ASSERTIONS_MISSING/);
  // 负向 2：断言状态非 PASS。
  const failedAssertion = JSON.parse(JSON.stringify(report));
  failedAssertion.results.find((item) => item.case_id === 'W27-09-LATEST-OUTCOME-PROJECTION').executions[0].assertions[0].status = 'FAIL';
  assert.throws(() => win27Report.verifyReport(failedAssertion, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W27_ASSERTION_INVALID/);
  // 负向 3：缺投影证据。
  const missingProjection = JSON.parse(JSON.stringify(report));
  delete missingProjection.results.find((item) => item.case_id === 'W27-09-LATEST-OUTCOME-PROJECTION').executions[0].projection_evidence;
  assert.throws(() => win27Report.verifyReport(missingProjection, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W27_PROJECTION_EVIDENCE_REQUIRED/);
  // 负向 4（R1 核心）：旧失败与较新成功复用同一 turn ID。
  const collision = JSON.parse(JSON.stringify(report));
  collision.results.find((item) => item.case_id === 'W27-09-LATEST-OUTCOME-PROJECTION').executions[0].projection_evidence.newer_success.turn_id = 'turn-old';
  assert.throws(() => win27Report.verifyReport(collision, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W27_PROJECTION_TURN_IDENTITY_COLLISION/);
  // 负向 5（R2 核心）：DOM 行乱序。
  const reorderedRows = domRows.slice();
  const swap = reorderedRows[0]; reorderedRows[0] = reorderedRows[1]; reorderedRows[1] = swap;
  const reorderedReference = writeEvidence('projection-dom-reordered.json', domExport('conversation-current', reorderedRows));
  const reordered = JSON.parse(JSON.stringify(report));
  {
    const execution = reordered.results.find((item) => item.case_id === 'W27-03-INSPECTOR-PERSISTED-RESTART').executions[0];
    execution.projection_evidence.dom_export = reorderedReference;
    execution.evidence.push(reorderedReference);
  }
  assert.throws(() => win27Report.verifyReport(reordered, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W27_PROJECTION_DOM_ORDER_MISMATCH/);
  // 负向 6（R2 核心）：另一会话残留本会话事件。
  const residueReference = writeEvidence('projection-dom-residue.json', domExport('conversation-other', [
    { event_id: 3, turn_id: 'turn-old', event_type: 'tool_start', text: 'foreign row' },
  ]));
  const residue = JSON.parse(JSON.stringify(report));
  {
    const execution = residue.results.find((item) => item.case_id === 'W27-03-INSPECTOR-PERSISTED-RESTART').executions[0];
    execution.projection_evidence.session_switch.other_conversation_export = residueReference;
    execution.evidence.push(residueReference);
  }
  assert.throws(() => win27Report.verifyReport(residue, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W27_PROJECTION_CROSS_SESSION_RESIDUE/);
  // 负向 7（R1 核心）：投影附件未绑定到该用例 evidence 列表。
  const unbound = JSON.parse(JSON.stringify(report));
  {
    const execution = unbound.results.find((item) => item.case_id === 'W27-09-LATEST-OUTCOME-PROJECTION').executions[0];
    execution.evidence = execution.evidence.filter((item) => item.path !== 'projection-query-export.json');
  }
  assert.throws(() => win27Report.verifyReport(unbound, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W27_PROJECTION_ARTIFACT_UNBOUND/);
  // 负向 8（R1 契约）：DOM 导出行必须是报告器约定的 snake_case 字段；camelCase 行必须被拒绝，
  // 这正是真实 driver 忘记做内部 camelCase→导出 snake_case 转换时会被捕获的位置。
  const camelReference = writeEvidence('projection-dom-camelcase.json', domExport('conversation-current', [
    { eventId: 1, turnId: null, eventType: 'session_started', text: 'row 1 session_started' },
  ]));
  const camel = JSON.parse(JSON.stringify(report));
  {
    const execution = camel.results.find((item) => item.case_id === 'W27-03-INSPECTOR-PERSISTED-RESTART').executions[0];
    execution.projection_evidence.dom_export = camelReference;
    execution.evidence.push(camelReference);
  }
  assert.throws(() => win27Report.verifyReport(camel, kit, identity, fs.realpathSync(evidenceRoot), fs), /A9_W27_PROJECTION_DOM_ROW_INVALID/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('WIN7-28 verifier binds DOM outcome/turn identity, row content and time, and real pagination', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-win28-candidate-'));
  const sourceRepositoryRoot = cleanSourceFixture(root);
  const inputs = fixture(root, sourceRepositoryRoot, 'win28');
  const built = buildA9ProductCandidate({
    repositoryRoot: sourceRepositoryRoot, ...inputs, outputRoot: path.join(root, 'out'),
  });
  const stage = built.stage;
  const manifestPath = path.join(stage, 'release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const relative of win28Integrity.REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(stage, ...relative.split('/'))), `WIN7-28 closure: ${relative}`);
  }
  const authorityPath = path.join(root, 'release-authority.json');
  writeJson(authorityPath, {
    schema_version: 1, kind: 'WIN7_28_RELEASE_AUTHORITY', status: 'APPROVED_FOR_WIN7_28_VALIDATION',
    formal_input_lock_sha256: sha256File(inputs.lockPath),
    approval_registry: { commit: manifest.source_commit, sha256: sha256File(inputs.approvalRegistryPath) },
    candidate: {
      source_commit: manifest.source_commit, package_sha256: sha256File(built.zipPath),
      manifest_sha256: sha256File(manifestPath),
    },
  });
  const options = {
    zip: built.zipPath, 'release-manifest': manifestPath,
    kit: path.join(stage, 'A9_15_VALIDATION_KIT.json'), 'formal-input-lock': inputs.lockPath,
    'approval-registry': inputs.approvalRegistryPath, 'release-authority': authorityPath,
    'release-authority-sha256': sha256File(authorityPath),
  };
  const identity = win28Report.identityFrom(options, fs);
  const kit = JSON.parse(fs.readFileSync(options.kit, 'utf8'));
  assert.equal(kit.scope.decision, 'ADR-0121');
  assert.equal(kit.required_cases.length, 10);
  for (const caseId of ['W28-03-INSPECTOR-PERSISTED-RESTART', 'W28-04-APPROVAL-FAILURE-ORDER',
    'W28-09-LATEST-OUTCOME-PROJECTION', 'W28-10-OLDER-EVENT-PAGINATION']) {
    assert.ok(kit.required_cases.some((item) => item.case_id === caseId), `WIN7-28 kit case: ${caseId}`);
  }
  // 打包闭包必须包含共享投影契约模块（driver 与报告器在候选内共用同一实现）。
  assert.ok(fs.existsSync(path.join(stage, 'validation', 'a9-projection-contract.cjs')), 'contract module packaged');
  assert.ok(fs.existsSync(path.join(stage, 'validation', 'a9-win7-28-driver.cjs')), 'w28 driver packaged');

  // 与真实产品形态一致的 9 事件会话：id 3 为旧失败，id 9 为较新 verified 成功；
  // 首批查询（limit 6）只覆盖 id 4..9，旧失败必须经 beforeEventId 分页才被加载。
  // 基准时刻取 16:00:00Z：+8h 偏移后正好跨过 UTC 午夜（00:00:01 次日），覆盖跨日回绕（W28-H03）。
  const baseTs = Date.parse('2026-09-10T16:00:00.000Z');
  const blank = { outcome: null, error_head: null, tool_name: null, decision: null, denied: false, has_error: false, shell_has_exit_code: false, shell_exit_code: null, call_id: null, step: null, args: {} };
  const event = (id, turnId, type, extra = {}) => ({
    event_id: id, turn_id: turnId, type, outcome: null, verification: null,
    timestamp_ms: baseTs + id * 1000,
    display: { ...blank, ...(extra.display || {}) },
    ...(extra.outcome ? { outcome: extra.outcome } : {}),
    ...(extra.verification ? { verification: extra.verification } : {}),
  });
  const FIRST_LIMIT = 300;
  const firstScreenEventIds = Array.from({ length: FIRST_LIMIT }, (_, index) => 301 + index);
  const pageEventIds = Array.from({ length: FIRST_LIMIT }, (_, index) => 1 + index);
  const queryEvents = [
    event(1, null, 'session_started'),
    event(2, 'turn-old', 'turn_started'),
    event(3, 'turn-old', 'turn_failed', { display: { error_head: 'fixture failure' } }),
    ...Array.from({ length: 297 }, (_, i) => event(4 + i, 'turn-middle-' + (4 + i), 'tool_start', { display: { tool_name: 'read', args: { path: 'calc.ts' } } })),
    ...Array.from({ length: 298 }, (_, i) => event(301 + i, 'turn-second-' + (301 + i), 'tool_end', { display: { tool_name: 'read' } })),
    event(599, 'turn-new', 'turn_started'),
    event(600, 'turn-new', 'turn_completed', { display: { outcome: 'completed' }, outcome: 'completed', verification: 'verified' }),
  ];
  // W28-H03：行时间与独立时间基准用同一偏移/制式渲染（clockOf 为测试侧的本地渲染器，
  // 期望值本身由共享契约从 timestamp_ms + 基准偏移独立推导）。
  const clockOf = (totalSeconds, mode = 'none') => {
    const seconds = ((Math.floor(totalSeconds) % 86400) + 86400) % 86400;
    const hour = Math.floor(seconds / 3600);
    const minute = Math.floor((seconds % 3600) / 60);
    const second = seconds % 60;
    const two = (value) => String(value).padStart(2, '0');
    if (mode === 'none') return `${two(hour)}:${two(minute)}:${two(second)}`;
    const isPm = hour >= 12;
    let hour12 = hour % 12;
    if (hour12 === 0) hour12 = 12;
    return mode === 'latin' ? `${hour12}:${two(minute)}:${two(second)} ${isPm ? 'PM' : 'AM'}`
      : `${isPm ? '下午' : '上午'}${hour12}:${two(minute)}:${two(second)}`;
  };
  const utcSecondsOfDay = (timestampMs) => Math.floor(timestampMs / 1000) % 86400;
  const stampOf = (timestampMs, offsetSeconds = 0, mode = 'none') =>
    clockOf(utcSecondsOfDay(timestampMs) + offsetSeconds, mode);
  const tzFor = (offset) => {
    if (offset === 0) return 'UTC';
    if (offset === 8 * 3600) return 'Asia/Shanghai';
    if (offset === -5 * 3600) return 'America/Bogota';
    if (offset === 3600) return 'Africa/Lagos';
    return 'UTC';
  };
  const baselineFor = (offsetSeconds, mode = 'none', tz = tzFor(offsetSeconds)) => ({
    probe_version: projectionContract.TIME_BASELINE_PROBE_VERSION,
    time_zone: tz,
    probes: projectionContract.TIME_BASELINE_PROBE_UTC_MS.map((utcMs) => ({
      utc_ms: utcMs, rendered: clockOf(utcSecondsOfDay(utcMs) + offsetSeconds, mode),
    })),
  });
  const rowFor = (queryEvent, render = { offsetSeconds: 0, mode: 'none' }) => ({
    event_id: queryEvent.event_id, turn_id: queryEvent.turn_id, event_type: queryEvent.type,
    text: `${stampOf(queryEvent.timestamp_ms, render.offsetSeconds, render.mode)} · ${projectionContract.expectedRowLabel(queryEvent)}`,
  });
  const defaultRows = () => queryEvents.slice(-projectionContract.INSPECTOR_DISPLAY_ROWS).map((event) => rowFor(event));
  const pages = [
    { limit: 300, before_event_id: null, has_more: true, returned_count: 300, returned_first_event_id: 301, returned_last_event_id: 600, ok: true },
    { limit: 300, before_event_id: 301, has_more: false, returned_count: 300, returned_first_event_id: 1, returned_last_event_id: 300, ok: true },
  ];
  // W28-H04：分页证据改为链式事实形态（first_screen + pages[] + older_failure + 便利字段），
  // 由共享契约 validatePagingChain 独立校验，产品窗口绑定 PRODUCT_FIRST_QUERY_LIMIT(=300)。
  // 旧失败 event 3 不在首屏（301..600），只能经真实分页响应页（1..300）返回；便利字段必须与
  // 逐页事实一致，摘要布尔值不能独立填 PASS。
  const chainOlderFailure = { event_id: 3, turn_id: 'turn-old', type: 'turn_failed' };
  const paging = {
    ok: true,
    conversation_id: 'conversation-current',
    window_limit: FIRST_LIMIT,
    observation_boundary: 'IPC_MAIN_HANDLE_OBSERVER',
    classification: {
      product_ui: `limit===${FIRST_LIMIT}（产品首屏/分页固定窗口）`,
      driver_reference: 'limit===1000（driver 独立参考查询）',
    },
    before: { olderObservable: { blockFound: false, hasLegacyNote: true } },
    after: { olderObservable: { blockFound: true, hasLegacyNote: false } },
    first_screen: {
      ok: true, limit: FIRST_LIMIT, count: FIRST_LIMIT, has_more: true,
      first_event_id: firstScreenEventIds[0], last_event_id: firstScreenEventIds[FIRST_LIMIT - 1],
      event_ids: firstScreenEventIds,
      terminal_events: [{ event_id: firstScreenEventIds[FIRST_LIMIT - 1], turn_id: 'turn-new', type: 'turn_completed' }],
    },
    pages: [{
      round: 0, conversation_id: 'conversation-current', click_observed: true, request_observed: true,
      request: { limit: FIRST_LIMIT, before_event_id: firstScreenEventIds[0] },
      response: {
        ok: true, count: FIRST_LIMIT, has_more: false,
        first_event_id: pageEventIds[0], last_event_id: pageEventIds[FIRST_LIMIT - 1],
        event_ids: pageEventIds, terminal_events: [chainOlderFailure],
      },
    }],
    older_failure: chainOlderFailure,
    older_failure_loaded_observable: true,
    older_failure_block_populated_before_paging: false,
    controlConsumed: true, pageCount: FIRST_LIMIT, pageHasMore: false,
    pageLastId: pageEventIds[FIRST_LIMIT - 1], pageHasOlderFailure: true,
    pageOlderFailureId: chainOlderFailure.event_id, firstPageExcludesOlderFailure: true,
    beforeEventId: firstScreenEventIds[0], firstPageLimit: FIRST_LIMIT, firstPageCount: FIRST_LIMIT,
    firstPageHasMore: true, firstPageOldestId: firstScreenEventIds[0],
  };

  const evidenceRoot = path.join(root, 'evidence');
  fs.mkdirSync(evidenceRoot);
  const cloneJson = (value) => JSON.parse(JSON.stringify(value));
  const writeEvidence = (name, value) => {
    const target = path.join(evidenceRoot, name);
    writeJson(target, value);
    return { path: name, sha256: sha256File(target) };
  };
  const domExport = (stage_, rows, extra = {}) => ({
    schema_version: 3, kind: 'A9_PROJECTION_DOM_EXPORT', stage: stage_,
    conversation_id: extra.conversationId === undefined ? 'conversation-current' : extra.conversationId,
    display_range: { rule: 'LAST_60_BY_EVENT_ID_ASC', max_rows: 60, rows_total: rows.length },
    rows, displayed_outcome: extra.displayedOutcome === undefined ? 'completed · verified' : extra.displayedOutcome,
    latest_persisted_turn_id: extra.latestTurnId === undefined ? 'turn-new' : extra.latestTurnId,
    // W28-H03：schema v3 必填的独立时间基准（默认与行渲染同偏移/同制式）。
    time_baseline: extra.timeBaseline === undefined ? baselineFor(0) : extra.timeBaseline,
  });
  const writeFixture = (mutate, render = { offsetSeconds: 0, mode: 'none' }) => {
    // 每次写入都深拷贝共享夹具，避免某个负向用例的就地变异（pop/reverse/字段改写）污染后续用例。
    const domRows = queryEvents.slice(-projectionContract.INSPECTOR_DISPLAY_ROWS).map((event) => rowFor(event, render));
    const baseline = baselineFor(render.offsetSeconds, render.mode);
    const data = {
      'projection-query-export.json': {
        schema_version: 2, kind: 'A9_PROJECTION_QUERY_EXPORT', conversation_id: 'conversation-current',
        query: { limit: 1000, before_event_id: null, has_more: false },
        pages: cloneJson(pages), events: cloneJson(queryEvents),
      },
      'projection-dom-export.json': domExport('restart', cloneJson(domRows), { timeBaseline: baseline }),
      'projection-dom-other-conversation.json': domExport('other_conversation', [
        { event_id: 700, turn_id: null, event_type: 'session_started', text: '00:00:01 · session_started' },
      ], { displayedOutcome: '', latestTurnId: null, conversationId: 'conversation-other' }),
      'projection-dom-resume.json': domExport('resume', cloneJson(domRows), { timeBaseline: baseline }),
      'projection-dom-after-older-load.json': domExport('older_load', cloneJson(domRows),
        { older_load_mode: 'CLICKED_LOAD_MORE', timeBaseline: baseline }),
    };
    if (mutate) mutate(data);
    const references = {};
    for (const [name, value] of Object.entries(data)) {
      if (name === 'projection-evidence.json') continue;
      references[name] = writeEvidence(name, value);
    }
    return references;
  };
  const buildReport = (references, mutate) => {
    const projectionByCase = {
      'W28-03-INSPECTOR-PERSISTED-RESTART': {
        query_export: references['projection-query-export.json'], dom_export: references['projection-dom-export.json'],
        session_switch: {
          other_conversation_export: references['projection-dom-other-conversation.json'],
          resume_export: references['projection-dom-resume.json'],
        },
      },
      'W28-09-LATEST-OUTCOME-PROJECTION': {
        query_export: references['projection-query-export.json'], dom_export: references['projection-dom-export.json'],
        dom_export_after_older_load: references['projection-dom-after-older-load.json'],
        older_load_mode: 'CLICKED_LOAD_MORE',
        older_failure: { event_id: 3, turn_id: 'turn-old' },
        newer_success: { event_id: 600, turn_id: 'turn-new' },
        restart_displayed_outcome: 'completed · verified', older_event_load_displayed_outcome: 'completed · verified',
      },
      'W28-10-OLDER-EVENT-PAGINATION': {
        query_export: references['projection-query-export.json'],
        dom_export_after_older_load: references['projection-dom-after-older-load.json'],
        older_failure: { event_id: 3, turn_id: 'turn-old' }, paging,
      },
    };
    const report = {
      ...win28Report.template(kit, identity), status: 'PASS',
      results: kit.required_cases.map((validationCase) => {
        const execution = {
          candidate: identity, run_id: `run-${validationCase.case_id}`,
          environment: {
            os: 'Windows 7 SP1 build 7601', architecture: 'x64', user: 'ordinary-user',
            elevation: 'not-elevated', electron: '22.3.27', electron_abi: 110,
          },
          assertions: validationCase.assertions.map((assertion) => ({ assertion_id: assertion.assertion_id, status: 'PASS' })),
          evidence: [references['projection-query-export.json'], references['projection-dom-export.json'],
            references['projection-dom-other-conversation.json'], references['projection-dom-resume.json'],
            references['projection-dom-after-older-load.json']],
        };
        const projection = projectionByCase[validationCase.case_id];
        // 深拷贝：报告级负向变异不得污染共享夹具，也不得影响其它用例。
        if (projection) execution.projection_evidence = cloneJson(projection);
        if (validationCase.case_id === 'W28-07-REAL-PROVIDER-MULTITOOL') {
          execution.provider_kind = 'REAL_NON_FIXTURE';
          execution.provider_probe = 'tool_calling';
        }
        return { case_id: validationCase.case_id, status: 'PASS', executions: [execution] };
      }),
    };
    if (mutate) mutate(report);
    return report;
  };
  const verify = (report) => win28Report.verifyReport(report, kit, identity, fs.realpathSync(evidenceRoot), fs);

  const baseline = buildReport(writeFixture());
  try {
    assert.equal(verify(baseline).status, 'PASS');
  } catch (error) {
    const q = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'projection-query-export.json'), 'utf8'));
    const dom = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'projection-dom-export.json'), 'utf8'));
    console.error('BASELINE_DIAG', JSON.stringify({
      error: String(error && error.message), events: q.events.length, rows: dom.rows.length,
      rowIds: dom.rows.map((r) => r.event_id), eventIds: q.events.map((e) => e.event_id),
      row0: dom.rows[0], event0: q.events[0], event8: q.events[8],
      parsed0: projectionContract.expectedRowLabel(q.events[0]),
      parsed8: projectionContract.expectedRowLabel(q.events[8]),
      ts: q.events.map((e) => e.timestamp_ms),
    }));
    throw error;
  }

  // F1 负向：DOM 实际结果/turn 身份/必填字段/阶段 与查询或槽位不符，重算哈希后仍须拒绝。
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    for (const name of ['projection-dom-export.json', 'projection-dom-resume.json', 'projection-dom-after-older-load.json']) {
      d[name].displayed_outcome = 'failed · not_applicable';
    }
  }))), /A9_W28_PROJECTION_DOM_OUTCOME_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    for (const name of ['projection-dom-export.json', 'projection-dom-resume.json', 'projection-dom-after-older-load.json']) {
      d[name].latest_persisted_turn_id = 'turn-old';
    }
  }))), /A9_W28_PROJECTION_DOM_LATEST_TURN_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { delete d['projection-dom-export.json'].displayed_outcome; }))),
    /A9_W28_PROJECTION_DOM_OUTCOME_MISSING/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { d['projection-dom-export.json'].displayed_outcome = 42; }))),
    /A9_W28_PROJECTION_DOM_OUTCOME_MISSING/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { d['projection-dom-resume.json'].stage = 'older_load'; }))),
    /A9_W28_PROJECTION_DOM_STAGE_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { d['projection-dom-export.json'].conversation_id = 'foreign'; }))),
    /A9_W28_PROJECTION_CONVERSATION_MISMATCH/);
  // F2 负向：保留 ID/turn/类型/标签，只替换内容、时间或丢弃 event_type，必须被同一行判定拒绝。
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-export.json'].rows = d['projection-dom-export.json'].rows.map((row) => ({
      ...row, text: row.text.replace(/^(\s*\d{1,2}:\d{2}:\d{2}\s*·\s*).*$/s, '$1不相关内容'),
    }));
  }))), /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-export.json'].rows = d['projection-dom-export.json'].rows.map((row, index) => ({
      ...row, text: row.text.replace(/^\s*\d{1,2}:\d{2}:\d{2}/, `0${index % 9}:07:07`),
    }));
  }))), /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-export.json'].rows = d['projection-dom-export.json'].rows.map((row) => ({ ...row, event_type: null }));
  }))), /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { d['projection-dom-export.json'].rows.pop(); }))),
    /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { d['projection-dom-export.json'].rows.reverse(); }))),
    /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  // W28-H03 正向（契约层）：独立基准可推导任意时区偏移与 12/24 小时制；行时间由
  // timestamp_ms + 基准偏移独立核对，正确时区转换（含跨日回绕）必须通过。
  assert.equal(projectionContract.deriveTimeBaseline(baselineFor(0)).offsetSeconds, 0);
  assert.equal(projectionContract.deriveTimeBaseline(baselineFor(0)).meridiemMode, 'none');
  const plus8 = projectionContract.deriveTimeBaseline(baselineFor(8 * 3600, 'latin'));
  assert.equal(plus8.offsetSeconds, 8 * 3600);
  assert.equal(plus8.meridiemMode, 'latin');
  assert.equal(projectionContract.rowsMatchQuery(defaultRows(), queryEvents, baselineFor(0)), true);
  // 基线反例（复核 F2）：全部行时间统一 +1 秒曾被首行自校准吸收为时区偏移；现在期望时间
  // 由独立基准推导，同一 rowsMatchQuery 必须拒绝统一错时与基准/行偏移不符。
  assert.equal(projectionContract.rowsMatchQuery(
    projectionContract.rowMutationSamples(defaultRows(), queryEvents).uniformShiftPlus1s,
    queryEvents, baselineFor(0)), false);
  assert.equal(projectionContract.rowsMatchQuery(defaultRows(), queryEvents, baselineFor(3600)), false);
  // W28-H03 正向（报告器层）：+8h 跨日回绕（16:00Z → 次日 00:00 本地）与 -5h 12 小时制均须整单通过。
  assert.equal(verify(buildReport(writeFixture(null, { offsetSeconds: 8 * 3600, mode: 'none' }))).status, 'PASS');
  assert.equal(verify(buildReport(writeFixture(null, { offsetSeconds: -5 * 3600, mode: 'latin' }))).status, 'PASS');
  // W28-H03 负向（报告器层）：整列统一 +1 秒/+1 小时、单行 +1 秒、仅一个阶段错时，
  // 保留 ID/turn/类型/标签并重算附件哈希后仍必须被同一行判定拒绝。
  const mutatedRows = (data, name, mutation) => {
    data[name].rows = projectionContract.rowMutationSamples(data[name].rows, queryEvents)[mutation];
  };
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    for (const name of ['projection-dom-export.json', 'projection-dom-resume.json', 'projection-dom-after-older-load.json']) {
      mutatedRows(d, name, 'uniformShiftPlus1s');
    }
  }))), /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    for (const name of ['projection-dom-export.json', 'projection-dom-resume.json', 'projection-dom-after-older-load.json']) {
      mutatedRows(d, name, 'uniformShiftPlus1h');
    }
  }))), /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { mutatedRows(d, 'projection-dom-export.json', 'singleRowPlus1s'); }))),
    /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { mutatedRows(d, 'projection-dom-after-older-load.json', 'uniformShiftPlus1s'); }))),
    /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { mutatedRows(d, 'projection-dom-export.json', 'missingTime'); }))),
    /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { mutatedRows(d, 'projection-dom-export.json', 'invalidTime'); }))),
    /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  // W28-H03 负向：行制式（12h）与独立基准制式（24h）不一致必须拒绝。
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    for (const name of ['projection-dom-export.json', 'projection-dom-resume.json', 'projection-dom-after-older-load.json']) {
      d[name].rows = queryEvents.map((event) => rowFor(event, { offsetSeconds: 0, mode: 'latin' }));
    }
  }))), /A9_W28_PROJECTION_DOM_ROWS_MISMATCH/);
  // W28-H03 负向：独立时间基准缺失或不可推导（版本不符、探针输入被改、探针彼此不一致、
  // 不可解析、探针缺失）一律 fail-closed，不回退为首行自校准。
  assert.throws(() => verify(buildReport(writeFixture((d) => { delete d['projection-dom-export.json'].time_baseline; }))),
    /A9_W28_PROJECTION_DOM_TIME_BASELINE_INVALID/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { d['projection-dom-export.json'].time_baseline = null; }))),
    /A9_W28_PROJECTION_DOM_TIME_BASELINE_INVALID/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-export.json'].time_baseline.probe_version = 99;
  }))), /A9_W28_PROJECTION_DOM_TIME_BASELINE_INVALID/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-export.json'].time_baseline.probes[1].utc_ms += 1000;
  }))), /A9_W28_PROJECTION_DOM_TIME_BASELINE_INVALID/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-export.json'].time_baseline.probes[2].rendered = '99:99:99';
  }))), /A9_W28_PROJECTION_DOM_TIME_BASELINE_INVALID/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-export.json'].time_baseline.probes.pop();
  }))), /A9_W28_PROJECTION_DOM_TIME_BASELINE_INVALID/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    // 探针彼此不一致：单个探针被平移 1 小时，任何首行自校准都无法发现，独立基准必须拒绝。
    d['projection-dom-export.json'].time_baseline.probes[3].rendered = clockOf(
      utcSecondsOfDay(projectionContract.TIME_BASELINE_PROBE_UTC_MS[3]) + 3600);
  }))), /A9_W28_PROJECTION_DOM_TIME_BASELINE_INVALID/);
  // W28-H05 正向（契约层）：残留方向为"与原会话无交集"——其他会话自己的新行合法，
  // 原会话行、混合行、缺失身份行与空行集都是违规。
  const originalIds = queryEvents.map((event) => event.event_id);
  assert.equal(projectionContract.sessionResidueViolation([
    { event_id: 700, turn_id: null, event_type: 'session_started', text: '00:00:01 · session_started' },
  ], originalIds), false);
  assert.equal(projectionContract.sessionResidueViolation([
    { event_id: 700, turn_id: null, event_type: 'session_started', text: '00:00:01 · session_started' },
    { event_id: 600, turn_id: 'turn-new', event_type: 'turn_completed', text: '16:00:09 · 任务完成 · completed' },
  ], originalIds), true);
  assert.equal(projectionContract.sessionResidueViolation([], originalIds), true);
  assert.equal(projectionContract.sessionResidueViolation([
    { event_id: null, turn_id: null, event_type: 'session_started', text: '00:00:01 · x' },
  ], originalIds), true);
  // W28-H05 负向（报告器层）：其他会话导出混入原会话行、空行集或身份缺失行必须拒绝。
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-other-conversation.json'].rows.push(
      { event_id: 600, turn_id: 'turn-new', event_type: 'turn_completed', text: '16:00:09 · 任务完成 · completed' });
  }))), /A9_W28_PROJECTION_CROSS_SESSION_RESIDUE/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-other-conversation.json'].rows = [];
  }))), /A9_W28_PROJECTION_CROSS_SESSION_RESIDUE/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    d['projection-dom-other-conversation.json'].rows.push(
      { event_id: null, turn_id: null, event_type: 'session_started', text: '00:00:01 · 外来行' });
  }))), /A9_W28_PROJECTION_CROSS_SESSION_RESIDUE/);
  // F4 负向：缺页事实、硬编码 has_more=false、无游标、旧失败归属不符。
  assert.throws(() => verify(buildReport(writeFixture((d) => { delete d['projection-query-export.json'].pages; }))),
    /A9_W28_PROJECTION_QUERY_PAGES_REQUIRED/);
  assert.throws(() => verify(buildReport(writeFixture((d) => { d['projection-query-export.json'].pages[0].has_more = false; }))),
    /A9_W28_PROJECTION_PAGES_FIRST_HAS_MORE_INVALID/);
  assert.throws(() => verify(buildReport(writeFixture((d) => {
    for (const page of d['projection-query-export.json'].pages) page.before_event_id = null;
  }))), /A9_W28_PROJECTION_PAGES_CURSOR_NOT_RECORDED/);
  assert.throws(() => verify(buildReport(writeFixture(), (report) => {
    report.results.find((item) => item.case_id === 'W28-10-OLDER-EVENT-PAGINATION')
      .executions[0].projection_evidence.paging.beforeEventId = null;
  })), /A9_W28_PROJECTION_PAGING_CHAIN_INVALID/);
  assert.throws(() => verify(buildReport(writeFixture(), (report) => {
    report.results.find((item) => item.case_id === 'W28-10-OLDER-EVENT-PAGINATION')
      .executions[0].projection_evidence.paging.pageOlderFailureId = 7;
  })), /A9_W28_PROJECTION_PAGING_CHAIN_INVALID/);
  assert.throws(() => verify(buildReport(writeFixture(), (report) => {
    report.results.find((item) => item.case_id === 'W28-10-OLDER-EVENT-PAGINATION')
      .executions[0].projection_evidence.paging.controlConsumed = false;
  })), /A9_W28_PROJECTION_PAGING_CHAIN_INVALID/);
  // 交接书 §7 反例：仅保留 PASS 摘要而清空逐页事实（pages=[]）必须被链式校验拒绝。
  assert.throws(() => verify(buildReport(writeFixture(), (report) => {
    const pagingRef = report.results.find((item) => item.case_id === 'W28-10-OLDER-EVENT-PAGINATION')
      .executions[0].projection_evidence.paging;
    pagingRef.pages = [];
    pagingRef.filter0Ids = undefined;
  })), /A9_W28_PROJECTION_PAGING_CHAIN_INVALID/);
  // 报告级旧失败身份与链内实际返回的旧失败不一致必须拒绝（OLDER_BINDING_MISMATCH）。
  assert.throws(() => verify(buildReport(writeFixture(), (report) => {
    report.results.find((item) => item.case_id === 'W28-10-OLDER-EVENT-PAGINATION')
      .executions[0].projection_evidence.older_failure = { event_id: 7, turn_id: 'turn-other' };
  })), /A9_W28_PROJECTION_PAGING_OLDER_BINDING_MISMATCH/);
  // 旧失败与新成功共用 turn ID 必须拒绝。
  assert.throws(() => verify(buildReport(writeFixture(), (report) => {
    report.results.find((item) => item.case_id === 'W28-09-LATEST-OUTCOME-PROJECTION')
      .executions[0].projection_evidence.newer_success.turn_id = 'turn-old';
  })), /A9_W28_PROJECTION_TURN_IDENTITY_COLLISION/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('WIN7-28 pagination chain validator rejects the handover §7 counter-examples and accepts a consistent chain', () => {
  const chain = () => {
    const firstScreenEventIds = [4, 5, 6, 7, 8, 9];
    return {
      conversation_id: 'test-conv', window_limit: 6,
      observation_boundary: 'IPC_MAIN_HANDLE_OBSERVER',
      classification: { product_ui: 'limit===6', driver_reference: 'limit===1000' },
      first_screen: {
        ok: true, limit: 6, count: 6, has_more: true,
        first_event_id: 4, last_event_id: 9, event_ids: firstScreenEventIds,
        terminal_events: [{ event_id: 9, turn_id: 'turn-new', type: 'turn_completed' }],
      },
      pages: [{
        round: 0, conversation_id: 'test-conv', click_observed: true, request_observed: true,
        request: { limit: 6, before_event_id: 4 },
        response: {
          ok: true, count: 3, has_more: false, first_event_id: 1, last_event_id: 3,
          event_ids: [1, 2, 3],
          terminal_events: [{ event_id: 3, turn_id: 'turn-old', type: 'turn_failed' }],
        },
      }],
      older_failure: { event_id: 3, turn_id: 'turn-old', type: 'turn_failed' },
      before: { olderObservable: { blockFound: false, hasLegacyNote: true } },
      after: { olderObservable: { blockFound: true, hasLegacyNote: false } },
      older_failure_loaded_observable: true, older_failure_block_populated_before_paging: false,
      controlConsumed: true, pageCount: 3, pageHasMore: false, pageLastId: 3,
      pageHasOlderFailure: true, pageOlderFailureId: 3, firstPageExcludesOlderFailure: true,
      beforeEventId: 4, firstPageLimit: 6, firstPageCount: 6, firstPageHasMore: true, firstPageOldestId: 4,
    };
  };
  const verdict = (mutate) => {
    const facts = chain();
    if (mutate) mutate(facts);
    return projectionContract.validatePagingChain(facts);
  };
  // 正向：完整一致链通过。
  assert.equal(verdict().ok, true, 'consistent paging chain must pass');

  // 负向（交接书 §7）：以下变异都必须被同一 validatePagingChain 拒绝。
  const rejectionCases = {
    pagesEmpty: (f) => { f.pages = []; },
    zeroCountPage: (f) => { f.pages[0].response.count = 0; f.pages[0].response.event_ids = []; },
    failedPageOk: (f) => { f.pages[0].response.ok = false; },
    cursorRepeat: (f) => { // 第二页复用首页游标：上一页最旧事件=1，第二页游标应为 1 而非 4。
      const secondPage = JSON.parse(JSON.stringify(f.pages[0]));
      secondPage.round = 1;
      secondPage.request = { limit: 6, before_event_id: 4 };
      f.pages.push(secondPage);
    },
    cursorDiscontinuous: (f) => { f.pages[0].request.before_event_id = 6; },
    noOlderFailure: (f) => { f.pages[0].response.terminal_events = [{ event_id: 9, turn_id: 'turn-new', type: 'turn_completed' }]; f.pageHasOlderFailure = false; f.pageOlderFailureId = null; },
    olderInFirstScreen: (f) => { f.first_screen.event_ids = [3, 4, 5, 6, 7, 8]; f.first_screen.first_event_id = 3; f.beforeEventId = 3; f.firstPageOldestId = 3; },
    duplicateId: (f) => { const ids = f.pages[0].response.event_ids; ids.push(ids[ids.length - 1]); f.pages[0].response.count = ids.length; f.pages[0].response.last_event_id = ids[ids.length - 1]; },
    notProgressing: (f) => { f.pages[0].response.event_ids = [2, 3, 6]; f.pages[0].response.count = 3; f.pages[0].response.last_event_id = 6; f.pageLastId = 6; },
    crossConversation: (f) => { f.pages[0].conversation_id = 'other-conv'; },
    convenienceLies: (f) => { f.pageCount = 999; },
    windowUnbound: (f) => { f.window_limit = 6; f.first_screen.limit = 6; f.pages[0].request.limit = 6; f.window_limit = 1; },
    oldFailureRemovedFromActualMembers: (f) => {
      f.pages[0].response.event_ids = f.pages[0].response.event_ids.filter((id) => id !== 3);
      f.pages[0].response.count = f.pages[0].response.event_ids.length;
      f.pageCount = f.pages[0].response.count;
    },
    continueAfterHasMoreFalse: (f) => {
      f.pages[0].response.has_more = false;
      const secondPage = JSON.parse(JSON.stringify(f.pages[0]));
      secondPage.round = 1;
      secondPage.request = { limit: 6, before_event_id: 1 };
      f.pages.push(secondPage);
    },
    domObservationContradictsLoadedSummary: (f) => {
      f.after = { olderObservable: { blockFound: false, hasLegacyNote: true } };
      f.older_failure_loaded_observable = true;
    },
    omitActualRequestObservation: (f) => {
      delete f.pages[0].request_observed;
    },
    missingDomObservations: (f) => {
      delete f.before;
      delete f.after;
    },
    missingFirstCount: (f) => {
      delete f.first_screen.count;
    },
  };
  for (const [name, mutate] of Object.entries(rejectionCases)) {
    const result = verdict(mutate);
    assert.equal(result.ok, false, `pagination negative case must be rejected: ${name} violations=${result.violations.join(',')}`);
  }
});

test('WIN7-28 external driver dependency closure relocates the contract and fails closed per protocol', () => {
  const w28SmokeSource = fs.readFileSync(require.resolve('../../../release/win7-product-v3/a9-win7-28-smoke.cjs'), 'utf8');
  const driverSource = fs.readFileSync(require.resolve('../../../src/shell/tests/product/a9-06-driver-entry.cjs'), 'utf8');
  const devRunnerSource = fs.readFileSync(require.resolve('../../../src/shell/tests/product/run-a9-06-electron-smoke.mjs'), 'utf8');
  const contractBytes = fs.readFileSync(require.resolve('../../../release/win7-product-v3/a9-projection-contract.cjs'));
  const extract = (source, startMarker, endMarker) => source.slice(source.indexOf(startMarker), source.indexOf(endMarker));

  // 纯布局回归（W28-H01 基线反例）：外置运行目录必须随 driver 搬移共享契约并做复制后哈希核对。
  // 只在内存虚拟文件系统中复现 prepareDriverRuntime 的搬移/校验合同，不启动 Electron，
  // 也不把开发机路径模拟冒充为 Win7 运行记录。
  const virtualLayout = (options = {}) => {
    const files = new Map();
    const candidateRoot = '/virtual/w28-candidate';
    const runRoot = '/virtual/w28-evidence/automatic-1';
    files.set(path.join(candidateRoot, 'electron.exe'), Buffer.from('fake-electron'));
    files.set(path.join(candidateRoot, 'resources', 'default_app.asar'), Buffer.from('fake-asar'));
    const sourceDriver = path.join(candidateRoot, 'validation', 'a9-win7-28-driver.cjs');
    files.set(sourceDriver, Buffer.from(driverSource, 'utf8'));
    const sourceContract = path.join(candidateRoot, 'validation', 'a9-projection-contract.cjs');
    if (!options.missingSourceContract) files.set(sourceContract, contractBytes);
    return {
      files, candidateRoot, runRoot, sourceDriver, sourceContract,
      virtualFs: {
        mkdirSync() {},
        readdirSync: () => [{ name: 'electron.exe', isFile: () => true }],
        existsSync: (file) => files.has(file),
        copyFileSync: (from, to) => {
          if (!files.has(from)) throw new Error(`A9_TEST_ENOENT:${from}`);
          const bytes = Buffer.from(files.get(from));
          files.set(to, options.corruptContractCopy && String(to).endsWith('a9-projection-contract.cjs')
            ? Buffer.concat([bytes, Buffer.from('corrupted')]) : bytes);
        },
        readFileSync: (file) => {
          if (!files.has(file)) throw new Error(`A9_TEST_ENOENT:${file}`);
          return files.get(file);
        },
        writeFileSync: (file, bytes) => files.set(file, Buffer.from(bytes)),
      },
    };
  };
  const prepareScript = `${extract(w28SmokeSource, 'function copyTree(', '\nfunction sha256File(')}\n${
    extract(w28SmokeSource, 'function sha256File(', '\nfunction createFixture(')}\nprepareDriverRuntime(candidateRoot, runRoot, sourceDriver)`;
  const runPrepare = (options) => {
    const layout = virtualLayout(options);
    const prepared = vm.runInNewContext(prepareScript, {
      fs: layout.virtualFs, path, crypto, __dirname: path.join(layout.candidateRoot, 'validation'),
      candidateRoot: layout.candidateRoot, runRoot: layout.runRoot, sourceDriver: layout.sourceDriver,
    });
    return { layout, prepared };
  };

  const { layout, prepared } = runPrepare({});
  const contractTarget = path.join(layout.runRoot, 'driver-app', 'a9-projection-contract.cjs');
  assert.ok(layout.files.has(contractTarget), 'shared contract relocated beside the external driver');
  assert.equal(digest(layout.files.get(contractTarget)), digest(contractBytes), 'relocated contract bytes match the candidate source');
  assert.equal(prepared.contractPath, contractTarget);
  assert.equal(prepared.contractSha256, digest(contractBytes), 'contract hash pinned after copy');
  assert.ok(layout.files.has(path.join(layout.runRoot, 'driver-app', 'main.cjs')), 'driver relocated to the external app root');
  // 负向：复制后哈希不符必须 fail-closed。
  assert.throws(() => runPrepare({ corruptContractCopy: true }), /A9_W28_DRIVER_CONTRACT_HASH_MISMATCH/);
  // 负向：候选 validation/ 缺契约源必须 fail-closed，不得静默跳过投影验收。
  assert.throws(() => runPrepare({ missingSourceContract: true }), /A9_W28_DRIVER_CONTRACT_SOURCE_MISSING/);

  // 纯模块加载回归（W28-H01 基线反例）：projection 缺契约 fail-closed；legacy 不依赖契约文件。
  // 覆盖候选 validation/（driver 与契约同级）与候选外 driver-app/ 两层布局的同级解析。
  const loadPrefix = driverSource.slice(
    driverSource.indexOf("const fs = require('fs');"),
    driverSource.indexOf('\n/** 把 DOM 观察行转换'),
  );
  const loadDriverPrefix = ({ protocol, contractSibling = false, explicitContract = '', contractModule = projectionContract }) => {
    const driverDir = '/virtual/w28-evidence/automatic-1/driver-app';
    const sibling = path.join(driverDir, 'a9-projection-contract.cjs');
    return vm.runInNewContext(loadPrefix, {
      __dirname: driverDir,
      process: { env: {
        ...(protocol ? { A9_SMOKE_DRIVER_PROTOCOL: protocol } : {}),
        ...(explicitContract ? { A9_SMOKE_PROJECTION_CONTRACT: explicitContract } : {}),
      } },
      require: (name) => {
        if (name === 'fs') return { existsSync: (file) => (contractSibling && file === sibling) || file === explicitContract };
        if (name === 'electron') return {};
        if (name === 'path') return path;
        if (name === 'crypto') return crypto;
        if (name === sibling || name === explicitContract) return contractModule;
        throw new Error(`A9_TEST_UNEXPECTED_REQUIRE:${name}`);
      },
    });
  };
  loadDriverPrefix({ protocol: 'projection', contractSibling: true });
  loadDriverPrefix({ protocol: 'projection', explicitContract: '/virtual/shared/a9-projection-contract.cjs' });
  loadDriverPrefix({ protocol: undefined });
  assert.throws(() => loadDriverPrefix({ protocol: 'projection' }), /A9_PROJECTION_CONTRACT_UNAVAILABLE/);
  assert.throws(() => loadDriverPrefix({ protocol: 'projection', explicitContract: 'relative/contract.cjs' }), /A9_PROJECTION_CONTRACT_PATH_NOT_ABSOLUTE/);
  assert.throws(() => loadDriverPrefix({
    protocol: 'projection', contractSibling: true,
    contractModule: { ...projectionContract, MAX_ERROR_HEAD: 999 },
  }), /A9_PROJECTION_CONTRACT_BOUNDS_MISMATCH/);

  // 解析合同一致性：外置 smoke 与开发机 runner 显式传入契约路径；driver 不再回退搜索源码仓库。
  assert.match(w28SmokeSource, /A9_SMOKE_PROJECTION_CONTRACT: contractPath/);
  assert.match(w28SmokeSource, /A9-W28-DRIVER-CONTRACT-CLOSURE/);
  assert.match(devRunnerSource, /A9_SMOKE_PROJECTION_CONTRACT: path\.join\(repositoryRoot, 'release', 'win7-product-v3', 'a9-projection-contract\.cjs'\)/);
  assert.doesNotMatch(driverSource, /repositoryRoot, 'release', 'win7-product-v3', 'a9-projection-contract\.cjs'/);
});

test('WIN7-28 formal fixture drives all projection scenes and refuses unknown-prompt fallback', () => {
  const w28SmokeSource = fs.readFileSync(require.resolve('../../../release/win7-product-v3/a9-win7-28-smoke.cjs'), 'utf8');
  const driverSource = fs.readFileSync(require.resolve('../../../src/shell/tests/product/a9-06-driver-entry.cjs'), 'utf8');
  const devRunnerSource = fs.readFileSync(require.resolve('../../../src/shell/tests/product/run-a9-06-electron-smoke.mjs'), 'utf8');
  const extract = (source, startMarker, endMarker) => source.slice(source.indexOf(startMarker), source.indexOf(endMarker));

  // 纯路由回归（W28-H02 基线反例）：捕获正式 fixture 传给 createFixture 的 step 函数，
  // 在纯函数层复现各场景的提示路由，不启动 Electron，也不把路由模拟冒充 Win7 运行记录。
  let capturedStep = null;
  const journeyScript = `${extract(w28SmokeSource, 'function createJourneyFixture(', '\nfunction createStopFixture(')}\ncreateJourneyFixture();`;
  vm.runInNewContext(journeyScript, { createFixture: (step) => { capturedStep = step; return {}; } });
  assert.equal(typeof capturedStep, 'function', 'journey step function captured for pure routing replay');
  const ask = (prompt, toolNames = []) => capturedStep({
    messages: [{ role: 'user', content: prompt }, ...toolNames.map((name) => ({ role: 'tool', name }))],
  });

  // 正向（F3）：非零退出——Windows 兼容的确定性非零退出命令，不依赖 node/git 等开发机工具。
  const failingShell = ask('run failing shell command');
  assert.equal(failingShell.tool.name, 'shell');
  assert.equal(failingShell.tool.args.command, 'exit 3');
  assert.doesNotMatch(failingShell.tool.args.command, /node|git/i);
  assert.equal(ask('run failing shell command', ['shell']).tool, undefined, 'non-zero-exit turn ends after the failing call');

  // 正向（F3）：可重复工具错误——测试专用缺失目标，独立于 Provider 503 与非零退出。
  const toolError = ask('trigger tool error');
  assert.equal(toolError.tool.name, 'read');
  assert.equal(toolError.tool.args.path, 'missing-fixture-target.ts');
  assert.equal(ask('trigger tool error', ['read']).tool, undefined, 'tool-error turn ends after the failing read');

  // 正向（F3）：批准路径——预先创建的 approve-target.tmp 精确审批目标；恢复工具活动由 driver 断言。
  const approve = ask('approve the high impact operation');
  assert.equal(approve.tool.name, 'delete');
  assert.equal(approve.tool.args.path, 'approve-target.tmp');
  assert.equal(approve.tool.args.permanent, true);
  assert.equal(ask('approve the high impact operation', ['delete']).tool, undefined, 'approve turn ends after the approved delete');

  // 正向（F4）：批量历史——互不相同的只读参数持续产出，直到 BULK_STEPS 后收尾。
  const BULK_STEPS = 26;
  const bulkPatterns = [];
  for (let count = 0; count < BULK_STEPS; count += 1) {
    const step = ask(`generate bulk history events ${count}`, Array.from({ length: count }, () => 'search'));
    assert.ok(step.tool, `bulk step ${count} must issue a read-only tool call`);
    assert.equal(step.tool.name, 'search');
    bulkPatterns.push(String(step.tool.args.pattern));
  }
  assert.equal(ask(`generate bulk history events ${BULK_STEPS}`, Array.from({ length: BULK_STEPS }, () => 'search')).tool, undefined,
    'bulk turn ends after enough distinct probes');
  assert.equal(new Set(bulkPatterns).size, BULK_STEPS, 'bulk probe patterns must be pairwise distinct');
  assert.ok(bulkPatterns.every((pattern) => /^probe-\d+-\d+$/.test(pattern)), 'bulk probes keep their distinguishable shape');

  // 负向：未知提示不得误路由到任何新增场景——必须回落为旅程 turn 1 的 read calc.ts。
  const unknown = ask('an entirely unknown prompt for the journey');
  assert.equal(unknown.tool.name, 'read');
  assert.equal(unknown.tool.args.path, 'calc.ts');

  // 负向（回归）：既有旅程提示仍按原路由服务，不被新增场景抢占。
  assert.equal(ask('cleanup permanently and push').tool.args.path, 'scratch.tmp');
  assert.equal(ask('verify again').tool.name, 'read');
  assert.equal(ask('produce latest verified').tool.name, 'edit');

  // 协议一致性：driver 与开发机 fixture 实际使用的提示串都能被正式 fixture 路由（绑定两侧协议）。
  for (const prompt of ['run failing shell command', 'trigger tool error', 'approve the high impact operation', 'generate bulk history events']) {
    assert.ok(driverSource.includes(`'${prompt}'`), `driver sends prompt: ${prompt}`);
    assert.ok(devRunnerSource.includes(`'${prompt}'`), `dev fixture routes prompt: ${prompt}`);
  }

  // 正式工作区输入闭环：批准/拒绝目标分开创建，并由宿主在第一进程退出后逐项清点。
  assert.match(w28SmokeSource, /writeFileSync\(path\.join\(workspaceRoot, 'scratch\.tmp'\)/);
  assert.match(w28SmokeSource, /writeFileSync\(path\.join\(workspaceRoot, 'approve-target\.tmp'\)/);
  assert.match(w28SmokeSource, /A9-W28-DENY-TARGET-SURVIVES-DENIAL/);
  assert.match(w28SmokeSource, /A9-W28-APPROVE-TARGET-EXECUTED-AFTER-APPROVAL/);
});

test('WIN7-28 RF01-RF04 repair: retry orchestration, immediate snapshot binding, and DST time baseline', () => {
  const w28SmokeSource = fs.readFileSync(require.resolve('../../../release/win7-product-v3/a9-win7-28-smoke.cjs'), 'utf8');
  const driverSource = fs.readFileSync(require.resolve('../../../src/shell/tests/product/a9-06-driver-entry.cjs'), 'utf8');
  const devRunnerSource = fs.readFileSync(require.resolve('../../../src/shell/tests/product/run-a9-06-electron-smoke.mjs'), 'utf8');

  // RF01: Formal smoke retry process orchestration & assertion fail-closed contract
  assert.match(w28SmokeSource, /A9_SMOKE_MODE: 'retry'/);
  assert.match(w28SmokeSource, /phases\.push\(\{\s*phase: 'retry'/);
  assert.match(w28SmokeSource, /second\.retryTarget && second\.retryTarget\.conversationId/);
  assert.match(w28SmokeSource, /A9_SMOKE_RETRY_CONVERSATION: retryTargetConversation/);
  assert.match(w28SmokeSource, /'A9-W28-RETRY-TARGET-BOUND'/);
  assert.match(w28SmokeSource, /'A9-W28-REQUIRED-ASSERTIONS-PRESENT'/);
  assert.match(w28SmokeSource, /reports\.retry/);
  assert.match(devRunnerSource, /A9-15-QUERY-FAILURE-VISIBLE-RETRY-REPORT/);
  assert.match(devRunnerSource, /'A9-W28-RETRY-TARGET-BOUND'/);
  assert.match(devRunnerSource, /retryReport\.mode === 'retry'/);
  assert.match(devRunnerSource, /retryReport\.retryTarget\?\.conversationId === retryTargetConversation/);
  assert.match(devRunnerSource, /phase: 'retry'/);

  // Dev runner retry 逻辑验证：错会话、错模式、重复断言必须 fail-closed
  const evaluateDevRetry = ({ mode = 'retry', targetConv = 'conv-123', reportTarget = 'conv-123', status = 'PASS', cases = [{ id: 'A9-15-QUERY-FAILURE-VISIBLE-RETRY', passed: true }] }) => {
    const recorded = [];
    const record = (id, passed, detail) => recorded.push({ id, passed: passed === true, detail: detail || '' });
    const retryReport = { status, mode, retryTarget: { conversationId: reportTarget }, cases };
    const retryTargetConversation = targetConv;

    const retryModeOk = retryReport.mode === 'retry';
    const retryTargetBound = Boolean(retryTargetConversation
      && retryModeOk
      && retryReport.retryTarget?.conversationId === retryTargetConversation
      && Array.isArray(retryReport.cases)
      && retryReport.cases.some((c) => c.id === 'A9-15-QUERY-FAILURE-VISIBLE-RETRY' && c.passed === true));
    record('A9-W28-RETRY-TARGET-BOUND', retryTargetBound, '');

    const retryCaseCounts = new Map();
    for (const c of retryReport.cases || []) {
      if (c && typeof c.id === 'string') {
        retryCaseCounts.set(c.id, (retryCaseCounts.get(c.id) || 0) + 1);
      }
    }
    const duplicateRetryCaseIds = Array.from(retryCaseCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id);
    const retryNoDuplicates = Array.isArray(retryReport.cases)
      && duplicateRetryCaseIds.length === 0
      && retryReport.cases.length === retryCaseCounts.size;

    const retryCasesAllPassed = Array.isArray(retryReport.cases)
      && retryReport.cases.length > 0
      && retryReport.cases.every((c) => c && c.passed === true);

    const retryReportValid = retryReport.status === 'PASS'
      && retryModeOk
      && retryTargetBound
      && retryNoDuplicates
      && retryCasesAllPassed;

    record('A9-15-QUERY-FAILURE-VISIBLE-RETRY-REPORT', retryReportValid, '');
    for (const c of retryReport.cases || []) {
      const isDuplicate = (retryCaseCounts.get(c?.id) || 0) > 1;
      record(c.id, !isDuplicate && c.passed === true, isDuplicate ? `DUPLICATE_ASSERTION:${c.id}` : (c.detail || ''));
    }
    return {
      allPassed: recorded.every((r) => r.passed),
      retryTargetBound,
      retryReportValid,
      recorded,
    };
  };

  // 正确用例：PASS
  assert.equal(evaluateDevRetry({}).allPassed, true);
  // 错会话：FAIL
  assert.equal(evaluateDevRetry({ reportTarget: 'wrong-conv' }).allPassed, false);
  assert.equal(evaluateDevRetry({ reportTarget: 'wrong-conv' }).retryTargetBound, false);
  // 错模式：FAIL
  assert.equal(evaluateDevRetry({ mode: 'second' }).allPassed, false);
  assert.equal(evaluateDevRetry({ mode: 'second' }).retryReportValid, false);
  // 重复断言：FAIL
  const duplicateCases = [
    { id: 'A9-15-QUERY-FAILURE-VISIBLE-RETRY', passed: true },
    { id: 'A9-15-QUERY-FAILURE-VISIBLE-RETRY', passed: true },
  ];
  assert.equal(evaluateDevRetry({ cases: duplicateCases }).allPassed, false);
  assert.equal(evaluateDevRetry({ cases: duplicateCases }).retryReportValid, false);

  // RF01 fail-closed 逻辑验证：缺任一必需断言或未全通过时必须记为失败
  const extract = (source, startMarker, endMarker) => source.slice(source.indexOf(startMarker), source.indexOf(endMarker));
  const idsScript = `${extract(w28SmokeSource, 'const requiredSmokeAssertionIds =', '\n  const missingRequiredAssertions =')};\nrequiredSmokeAssertionIds;`;
  const requiredSmokeAssertionIds = vm.runInNewContext(idsScript);
  assert.equal(requiredSmokeAssertionIds.length, 10);
  assert.ok(requiredSmokeAssertionIds.includes('A9-15-QUERY-FAILURE-VISIBLE-RETRY'));
  assert.ok(requiredSmokeAssertionIds.includes('A9-W28-RETRY-TARGET-BOUND'));

  const checkMissing = (items) => requiredSmokeAssertionIds.filter((id) => !items.some((item) => item.id === id && item.passed === true));
  const fullPassed = requiredSmokeAssertionIds.map((id) => ({ id, passed: true }));
  assert.equal(checkMissing(fullPassed).length, 0);
  assert.equal(checkMissing([]).length, 10);
  assert.equal(checkMissing(fullPassed.filter((item) => item.id !== 'A9-15-QUERY-FAILURE-VISIBLE-RETRY')).join(','), 'A9-15-QUERY-FAILURE-VISIBLE-RETRY');
  assert.equal(checkMissing(fullPassed.map((item) => item.id === 'A9-15-QUERY-FAILURE-VISIBLE-RETRY' ? { id: item.id, passed: false } : item)).join(','), 'A9-15-QUERY-FAILURE-VISIBLE-RETRY');

  // RF02: Driver entry immediate snapshot binding & anti-masking
  assert.match(driverSource, /restoredEvents\.restartObserved/);
  assert.match(driverSource, /restoredEvents\.olderLoadObserved/);
  assert.match(driverSource, /sessionSwitch\.otherLatestTurnId/);
  assert.match(driverSource, /sessionSwitch\.resumeLatestTurnId/);
  assert.match(driverSource, /latest_persisted_turn_id: latestPersistedTurnId/);

  // RF04: Date-aware time baseline with daylight saving time (DST)
  // Summer date (September) EDT is UTC-4 (-14400s)
  const sepUtcMs = Date.parse('2026-09-10T10:15:20.000Z');
  const nySepOffset = projectionContract.getTzOffsetSeconds(sepUtcMs, 'America/New_York');
  assert.equal(nySepOffset, -4 * 3600, 'September NY UTC offset must be -4h (EDT)');

  // Winter date (January) EST is UTC-5 (-18000s)
  const janUtcMs = Date.parse('2026-01-10T10:15:20.000Z');
  const nyJanOffset = projectionContract.getTzOffsetSeconds(janUtcMs, 'America/New_York');
  assert.equal(nyJanOffset, -5 * 3600, 'January NY UTC offset must be -5h (EST)');

  // Shanghai is fixed UTC+8 (+28800s) across both seasons
  const shSepOffset = projectionContract.getTzOffsetSeconds(sepUtcMs, 'Asia/Shanghai');
  const shJanOffset = projectionContract.getTzOffsetSeconds(janUtcMs, 'Asia/Shanghai');
  assert.equal(shSepOffset, 8 * 3600, 'September Shanghai UTC offset must be +8h');
  assert.equal(shJanOffset, 8 * 3600, 'January Shanghai UTC offset must be +8h');

  // Baseline derive and time consistency checks:
  const nyBaseline = {
    probe_version: 2,
    time_zone: 'America/New_York',
    probes: projectionContract.TIME_BASELINE_PROBE_UTC_MS.map((utcMs) => {
      const off = projectionContract.getTzOffsetSeconds(utcMs, 'America/New_York');
      const sec = ((Math.floor(utcMs / 1000 + off) % 86400) + 86400) % 86400;
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const two = (v) => String(v).padStart(2, '0');
      const isPm = h >= 12;
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;
      return { utc_ms: utcMs, rendered: `${h12}:${two(m)}:${two(s)} ${isPm ? 'PM' : 'AM'}` };
    }),
  };
  const derived = projectionContract.deriveTimeBaseline(nyBaseline);
  assert.equal(derived.timeZone, 'America/New_York');
  assert.equal(derived.meridiemMode, 'latin');

  // Correct summer row: 10:15:20 UTC -> 6:15:20 AM EDT
  const sepEvent = { event_id: 1, timestamp_ms: sepUtcMs };
  assert.equal(projectionContract.timestampsConsistent(['6:15:20 AM · session_started'], [sepEvent], nyBaseline), true,
    'September event rendered as 6:15:20 AM EDT must pass (raw string)');
  assert.equal(projectionContract.timestampsConsistent([{ text: '6:15:20 AM · session_started' }], [sepEvent], nyBaseline), true,
    'September event rendered as 6:15:20 AM EDT must pass (row object)');
  // 1-hour wrong EST row: 10:15:20 UTC -> 5:15:20 AM EST must be rejected
  assert.equal(projectionContract.timestampsConsistent(['5:15:20 AM · session_started'], [sepEvent], nyBaseline), false,
    'September event rendered as 5:15:20 AM EST must be rejected');

  // Invalid time_zone fails closed (returns null)
  assert.equal(projectionContract.deriveTimeBaseline({
    probe_version: 2,
    time_zone: 'Invalid/Non_Existent_Timezone',
    probes: nyBaseline.probes,
  }), null);
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
  const sourceRepositoryRoot = cleanSourceFixture(root, '1c0464441db049d25a28425ebaf9b2db65b0ff59');
  const inputs = fixture(root, sourceRepositoryRoot, 'win22');
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
    required_runner_helper_sha256: 'b'.repeat(64),
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
    fs.writeFileSync(path.join(evidenceRoot, name), markerValues[index], 'utf8');
    return { path: name, sha256: sha256File(path.join(evidenceRoot, name)) };
  });
  const tokenAudit = {
    verified: true, tokenMode: 'current_user', restrictedToken: false, tokenType: 'primary', sameUser: true,
    lowIntegrity: false,
  };
  const transcript = (requestId, shellKind, command, stdout, canceled = false, envOverlay = {}, shellSource = 'automatic') => {
    const shellPath = shellKind === 'cmd' ? 'C:\\Windows\\System32\\cmd.exe'
      : 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const wrapped = `$ProgressPreference='SilentlyContinue'\r\n${command}\r\nexit 0`;
    const argv = shellKind === 'cmd' ? ['/d', '/s', '/c', command]
      : ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(wrapped, 'utf16le').toString('base64')];
    const stdoutBase64 = Buffer.from(stdout).toString('base64');
    return {
      request: { schemaVersion: 2, requestId, profileId: 'a9-trusted-shell-current-user-v1', executable: shellPath,
        argv, shellKind, shellPath, shellIdentity: 'a'.repeat(64), shellVersion: 'file-123-456',
        shellSource, command, cwd: 'C:\\A9验收\\工作区\\中文 空格项目', envOverlay,
        managed: true, deadlineMode: 'none' },
      ready: { schemaVersion: 2, type: 'execution_started', requestId, profileId: 'a9-trusted-shell-current-user-v1',
        helperPid: 101, childPid: 102, ready: { childJobAssignmentVerified: true, inputDetached: true,
          stdoutCaptureReady: true, stderrCaptureReady: true }, tokenAudit },
      result: { schemaVersion: 2, type: 'execution_result', requestId, profileId: 'a9-trusted-shell-current-user-v1',
        status: 'completed', containmentVerified: true, inputDetached: true, cleanupConfirmed: true,
        workDirAclModified: false, hostJob: { childJobAssignmentVerified: true }, tokenAudit, canceled, exitCode: canceled ? 1 : 0,
        timedOut: false, idleTimedOut: false, stdoutBase64, stdoutSize: Buffer.byteLength(stdout),
        stderrBase64: '', stderrSize: 0 },
    };
  };
  const ps = transcript('w22-current-ps', 'powershell',
    "[IO.File]::WriteAllText((Join-Path $env:A9_W22_WORKSPACE 'w22-ps-current-user-r3.txt'),'W22_PS_CURRENT_USER',(New-Object Text.UTF8Encoding($false))); Write-Output 'PS_WRITE_OK'", 'PS_WRITE_OK\r\n');
  const cmd = transcript('w22-current-cmd', 'cmd', '> "%A9_W22_WORKSPACE%\\w22-cmd-current-user-r3.txt" <nul set /p "=W22_CMD_CURRENT_USER" & echo CMD_WRITE_OK', 'CMD_WRITE_OK\r\n');
  const explicit = transcript('w22-current-explicit', 'cmd', '> "C:\\A9验收\\工作区\\中文 空格项目\\w22-explicit-shell-r3.txt" <nul set /p "=W22_EXPLICIT_SHELL"', '', false, {}, 'workspace_explicit');
  const filteredCommand = 'if defined W22_INHERITED_RAW exit /b 41 & if defined W22_INHERITED_BASE64 exit /b 42 & if defined W22_INHERITED_BASE64URL exit /b 43 & if defined W22_INHERITED_PERCENT exit /b 44 & echo FILTERED_OK';
  const filtered = transcript('w22-env-filtered', 'cmd', filteredCommand, 'FILTERED_OK\r\n');
  const visible = transcript('w22-env-visible', 'cmd', 'if "%A9_W22_VISIBLE%"=="ordinary-overlay" (echo VISIBLE_OK) else (exit /b 51)',
    'VISIBLE_OK\r\n', false, { A9_W22_VISIBLE: 'ordinary-overlay' });
  const noDeadline = transcript('w22-no-deadline-stop', 'powershell', 'Start-Sleep -Seconds 30', '', true);
  const background = transcript('w22-background-ready', 'cmd', 'ping.exe -t 127.0.0.1', '', true);
  const d013Document = {
    schema_version: 1, evidence_kind: 'WIN7_22_D013_V25_CURRENT_CANDIDATE_CASES', candidate: identity,
    probe_id: probeId, environment: { token_kind: 'ordinary-user', elevation: 'not-elevated', integrity_level: 'medium',
      shell_profile: 'D-013-v25-a9-trusted-shell-current-user', helper_sha256: kit.required_runner_helper_sha256,
      shells: {
        powershell: { canonical_path: ps.request.shellPath, sha256: ps.request.shellIdentity, version: ps.request.shellVersion },
        cmd: { canonical_path: cmd.request.shellPath, sha256: cmd.request.shellIdentity, version: cmd.request.shellVersion },
      } },
    cases: {
      'W22-D013-V25-CURRENT-USER': { status: 'PASS', powershell: ps, cmd, explicit_shell: explicit,
        acl_unchanged: true, acl_sddl_sha256_before: 'c'.repeat(64), acl_sddl_sha256_after: 'c'.repeat(64),
        created_files: markerEvidence, raw_protocol: {}, events: [] },
      'W22-D013-V25-ENV-IDENTITY': { status: 'PASS', filtered_child: filtered, visible_child: visible,
        rejected_entries: ['API_TOKEN', 'NODE_OPTIONS', 'ELECTRON_ENABLE_LOGGING', 'NODE_TLS_REJECT_UNAUTHORIZED',
          'BUILD_SECRET_VALUE', 'BUILD_SECRET_BASE64', 'BUILD_SECRET_BASE64URL', 'BUILD_SECRET_PERCENT',
          'BUILD_SECRET_FORM', 'BUILD_SECRET_BASE64_PERCENT']
          .map((name, index) => ({ name, code: 'A9_ENV_OVERLAY_REJECTED',
            ...(index >= 4 ? { value_sha256: [
              'A9 W22+SYNTHETIC/SECRET?VALUE=7f4d0d7052e84b5f',
              Buffer.from('A9 W22+SYNTHETIC/SECRET?VALUE=7f4d0d7052e84b5f').toString('base64'),
              Buffer.from('A9 W22+SYNTHETIC/SECRET?VALUE=7f4d0d7052e84b5f').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''),
              encodeURIComponent('A9 W22+SYNTHETIC/SECRET?VALUE=7f4d0d7052e84b5f'),
              encodeURIComponent('A9 W22+SYNTHETIC/SECRET?VALUE=7f4d0d7052e84b5f').replace(/%20/g, '+'),
              encodeURIComponent(Buffer.from('A9 W22+SYNTHETIC/SECRET?VALUE=7f4d0d7052e84b5f').toString('base64')),
            ].map((value) => digest(value))[index - 4] } : {}) })),
        ordinary_overlay_visible: true, inherited_secret_variants_absent: true,
        provider_rotation_rejection: 'A9_ENV_OVERLAY_REJECTED', persisted_rejection_survived_restart: true,
        explicit_reapply_required_and_succeeded: true,
        explicit_shell_identity_mismatch: { status: 'failed', error_code: 'A9_SHELL_IDENTITY_CHANGED', child_executed: false },
        raw_protocol: {}, events: [] },
      'W22-D013-V25-NO-DEADLINE-STOP': { status: 'PASS', transcript: noDeadline,
        observed_active_before_stop_ms: 4000, repeated_stop_idempotent: true, execution_count: 1,
        raw_protocol: [], events: [] },
      'W22-D013-V25-BACKGROUND-READY': { status: 'PASS', transcript: background, persisted_pid: 102,
        persisted_pid_is_child_not_helper: true, first_stop_status: 'stopped', second_stop_status: 'exited',
        uncertain_cleanup: { initial_cleanup_required: true, stop_error_code: 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED', process_survived_blind_stop: true },
        recovered_pid: { pid: 303, first_stop_error_code: 'A9_RECOVERED_PROCESS_IDENTITY_UNCONFIRMED', process_survived_blind_stop: true,
          external_stop_then_second_stop_status: 'exited' }, post_case_active_count: 0,
        state_transitions: [{ status: 'running' }], raw_protocol: [], events: [] },
    }, secret_scan: { synthetic_plaintext_persisted_in_this_evidence: false },
  };
  const currentProof = d013Document.cases['W22-D013-V25-CURRENT-USER'];
  let seq = 1;
  for (const [name, transcriptValue, marker] of [
    ['ps', ps, markerEvidence[0]], ['cmd', cmd, markerEvidence[1]], ['explicit', explicit, markerEvidence[2]],
  ]) {
    const rawName = `raw-${name}.json`;
    writeJson(path.join(evidenceRoot, rawName), transcriptValue);
    currentProof.raw_protocol[name] = [{ path: rawName, sha256: sha256File(path.join(evidenceRoot, rawName)) }];
    currentProof.events.push({ seq: seq++, monotonic_ms: seq * 10, event: `${name}_raw_response_persisted`,
      request_id: transcriptValue.request.requestId, artifact_sha256: currentProof.raw_protocol[name][0].sha256 });
    currentProof.events.push({ seq: seq++, monotonic_ms: seq * 10, event: `${name}_marker_asserted`,
      request_id: transcriptValue.request.requestId, artifact_sha256: marker.sha256 });
  }
  const configAfterRotation = { workspaces: { other: { environmentRejected: true }, safe: { envOverlay: { MODE: 'release' } } } };
  const configAfterRestart = JSON.parse(JSON.stringify(configAfterRotation));
  writeJson(path.join(evidenceRoot, 'config-after-rotation.json'), configAfterRotation);
  writeJson(path.join(evidenceRoot, 'config-after-restart.json'), configAfterRestart);
  const envProof = d013Document.cases['W22-D013-V25-ENV-IDENTITY'];
  for (const [name, transcriptValue] of [['filtered', filtered], ['visible', visible]]) {
    const rawName = `raw-env-${name}.json`;
    writeJson(path.join(evidenceRoot, rawName), transcriptValue);
    envProof.raw_protocol[name] = [{ path: rawName, sha256: sha256File(path.join(evidenceRoot, rawName)) }];
  }
  envProof.config_after_rotation = [{ path: 'config-after-rotation.json', sha256: sha256File(path.join(evidenceRoot, 'config-after-rotation.json')) }];
  envProof.config_after_restart = [{ path: 'config-after-restart.json', sha256: sha256File(path.join(evidenceRoot, 'config-after-restart.json')) }];
  envProof.events = ['rejections_recorded', 'filtered_child_completed', 'visible_child_completed', 'provider_rotation_rejected',
    'config_scrubbed', 'runtime_reopened_blocked', 'explicit_reapply_completed', 'identity_mismatch_rejected_before_child']
    .map((event, index) => ({ seq: index + 1, monotonic_ms: index * 10, event,
      ...(event === 'rejections_recorded' ? { rejection_count: 10 } : {}),
      ...(event === 'filtered_child_completed' ? { request_id: filtered.request.requestId,
        artifact_sha256: envProof.raw_protocol.filtered[0].sha256 } : {}),
      ...(event === 'visible_child_completed' ? { request_id: visible.request.requestId,
        artifact_sha256: envProof.raw_protocol.visible[0].sha256 } : {}) }));
  const noDeadlineProof = d013Document.cases['W22-D013-V25-NO-DEADLINE-STOP'];
  writeJson(path.join(evidenceRoot, 'raw-no-deadline.json'), noDeadline);
  noDeadlineProof.raw_protocol = [{ path: 'raw-no-deadline.json', sha256: sha256File(path.join(evidenceRoot, 'raw-no-deadline.json')) }];
  noDeadlineProof.events = ['execution_started', 'active_observed', 'stop_requested', 'raw_result_persisted', 'repeat_stop_observed']
    .map((event, index) => ({ seq: index + 1, monotonic_ms: index === 0 ? 0 : 4000 + index, event,
      request_id: noDeadline.request.requestId,
      ...(event === 'raw_result_persisted' ? { result_sha256: digest(JSON.stringify(canonicalValue(noDeadline.result))),
        artifact_sha256: noDeadlineProof.raw_protocol[0].sha256 } : {}) }));
  const backgroundProof = d013Document.cases['W22-D013-V25-BACKGROUND-READY'];
  writeJson(path.join(evidenceRoot, 'raw-background.json'), background);
  backgroundProof.raw_protocol = [{ path: 'raw-background.json', sha256: sha256File(path.join(evidenceRoot, 'raw-background.json')) }];
  backgroundProof.events = ['execution_started', 'running_persisted_after_ready', 'first_stop_requested', 'raw_result_persisted', 'first_stop_completed',
    'second_stop_requested', 'second_stop_completed', 'recovered_pid_adopted', 'exit_lock_observed', 'blind_stop_refused',
    'external_stop_observed', 'second_stop_after_external', 'zero_residue_observed'].map((event, index) => ({
    seq: index + 1, monotonic_ms: index * 10, event,
    ...(index < 7 ? { request_id: background.request.requestId } : {}),
    ...(event === 'running_persisted_after_ready' ? { pid: background.ready.childPid,
      ready_sha256: digest(JSON.stringify(canonicalValue(background.ready))) } : {}),
    ...(event === 'raw_result_persisted' ? { artifact_sha256: backgroundProof.raw_protocol[0].sha256,
      result_sha256: digest(JSON.stringify(canonicalValue(background.result))) } : {}),
    ...(index >= 7 && index <= 11 ? { pid: 303 } : {}),
    ...(event === 'exit_lock_observed' ? { exit_blocked: true } : {}),
    ...(event === 'blind_stop_refused' ? { error_code: 'A9_RECOVERED_PROCESS_IDENTITY_UNCONFIRMED' } : {}),
    ...(event === 'zero_residue_observed' ? { managed_processes: 0, helper_processes: 0 } : {}),
  }));
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
        candidate: identity, environment, machine_binding: machineBinding, d013_helper_sha256: kit.required_runner_helper_sha256,
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
  const wrongHelper = JSON.parse(JSON.stringify(report));
  for (const item of wrongHelper.results.slice(9)) item.executions[0].d013_helper_sha256 = '0'.repeat(64);
  assert.throws(() => win22Report.verifyReport(wrongHelper, kit, identity, fs.realpathSync(evidenceRoot), fs),
    /A9_W22_D013_HELPER_BINDING_INVALID/);
  const rewriteRaw = (name, transcriptValue) => {
    const rawName = `raw-${name}.json`;
    writeJson(path.join(evidenceRoot, rawName), transcriptValue);
    currentProof.raw_protocol[name][0].sha256 = sha256File(path.join(evidenceRoot, rawName));
    currentProof.events.find((item) => item.event === `${name}_raw_response_persisted`).artifact_sha256
      = currentProof.raw_protocol[name][0].sha256;
  };
  delete explicit.request.shellSource;
  rewriteRaw('explicit', explicit);
  const missingExplicitSource = JSON.parse(JSON.stringify(report));
  publishD013(missingExplicitSource);
  assert.throws(() => win22Report.verifyReport(missingExplicitSource, kit, identity, fs.realpathSync(evidenceRoot), fs),
    /A9_W22_D013_CURRENT_EXPLICIT_REQUEST_INVALID/);
  explicit.request.shellSource = 'workspace_explicit';
  rewriteRaw('explicit', explicit);
  cmd.result.exitCode = 9;
  rewriteRaw('cmd', cmd);
  const nonzeroCmd = JSON.parse(JSON.stringify(report));
  publishD013(nonzeroCmd);
  assert.throws(() => win22Report.verifyReport(nonzeroCmd, kit, identity, fs.realpathSync(evidenceRoot), fs),
    /A9_W22_D013_CURRENT_USER_SEMANTICS_INVALID/);
  cmd.result.exitCode = 0;
  rewriteRaw('cmd', cmd);
  fs.appendFileSync(path.join(evidenceRoot, markerNames[1]), '\r\n');
  markerEvidence[1].sha256 = sha256File(path.join(evidenceRoot, markerNames[1]));
  currentProof.events.find((item) => item.event === 'cmd_marker_asserted').artifact_sha256 = markerEvidence[1].sha256;
  const paddedMarker = JSON.parse(JSON.stringify(report));
  publishD013(paddedMarker);
  assert.throws(() => win22Report.verifyReport(paddedMarker, kit, identity, fs.realpathSync(evidenceRoot), fs),
    /A9_W22_D013_MARKER_BYTES_INVALID/);
  fs.writeFileSync(path.join(evidenceRoot, markerNames[1]), markerValues[1], 'utf8');
  markerEvidence[1].sha256 = sha256File(path.join(evidenceRoot, markerNames[1]));
  currentProof.events.find((item) => item.event === 'cmd_marker_asserted').artifact_sha256 = markerEvidence[1].sha256;
  const stopEvent = noDeadlineProof.events.find((item) => item.event === 'stop_requested');
  const originalStopTime = stopEvent.monotonic_ms;
  stopEvent.monotonic_ms = 1;
  const forgedTimeline = JSON.parse(JSON.stringify(report));
  publishD013(forgedTimeline);
  assert.throws(() => win22Report.verifyReport(forgedTimeline, kit, identity, fs.realpathSync(evidenceRoot), fs),
    /A9_W22_D013_NO_DEADLINE_EVENT_SEQUENCE_INVALID/);
  stopEvent.monotonic_ms = originalStopTime;
  const configOriginal = JSON.parse(JSON.stringify(configAfterRotation));
  configAfterRotation.workspaces.other.leak = 'A9 W22+SYNTHETIC/SECRET?VALUE=7f4d0d7052e84b5f';
  writeJson(path.join(evidenceRoot, 'config-after-rotation.json'), configAfterRotation);
  envProof.config_after_rotation[0].sha256 = sha256File(path.join(evidenceRoot, 'config-after-rotation.json'));
  const leakedConfig = JSON.parse(JSON.stringify(report));
  publishD013(leakedConfig);
  assert.throws(() => win22Report.verifyReport(leakedConfig, kit, identity, fs.realpathSync(evidenceRoot), fs),
    /A9_W22_D013_ENV_SECRET_PERSISTED/);
  Object.assign(configAfterRotation, configOriginal);
  writeJson(path.join(evidenceRoot, 'config-after-rotation.json'), configAfterRotation);
  envProof.config_after_rotation[0].sha256 = sha256File(path.join(evidenceRoot, 'config-after-rotation.json'));
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
