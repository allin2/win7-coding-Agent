import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { buildA9ProductCandidate } from '../build-a9-product-v3.mjs';
import { recordA9V25HelperInput } from '../record-a9-v25-helper-input.mjs';
import { sha256File, writeJson } from '../release-contract.mjs';
import { writeDeterministicZip } from '../zip-utils.mjs';

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const HASH = '0'.repeat(64);
const require = createRequire(import.meta.url);
const integrity = require('../../../release/win7-product-v3/a9-package-integrity.cjs');
const win7Report = require('../../../release/win7-product-v3/a9-win7-17-report.cjs');

function createV25ReturnFixture(root) {
  const returnRoot = path.join(root, 'v25-return');
  const helper = Buffer.from('v25-helper-fixture');
  const result = {
    schema_version: 3,
    status: 'PASS',
    candidate_eligible: true,
    source_commit: '1'.repeat(40),
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
  });
  writeJson(path.join(returnRoot, 'build-profile.json'), {
    profile: 'WIN10-VS2019-V142-SDK19041-D013-V25-CURRENT-USER-X64',
    target: {
      architecture: 'x64',
      crt: 'static /MT (no VCRUNTIME140/MSVCP140/UCRTBASE dynamic dependencies)',
    },
    build_flags: { link: ['/SUBSYSTEM:CONSOLE', '/Brepro', '/INCREMENTAL:NO'] },
  });
  const files = [
    ['evidence/build-result.json', fs.readFileSync(path.join(returnRoot, 'evidence', 'build-result.json'))],
    ['evidence/environment.json', fs.readFileSync(path.join(returnRoot, 'evidence', 'environment.json'))],
    ['build-profile.json', fs.readFileSync(path.join(returnRoot, 'build-profile.json'))],
    ['output/helper.exe', helper],
  ].map(([filePath, bytes]) => ({ path: filePath, size: bytes.length, sha256: digest(bytes) }));
  writeJson(path.join(returnRoot, 'RETURN_PACKAGE_MANIFEST.json'), {
    schema_version: 1,
    status: 'PASS',
    candidate_eligible: true,
    files,
  });
  const zipPath = path.join(root, 'D013-V25-WIN10-RETURN.zip');
  writeDeterministicZip(returnRoot, zipPath, 1787443200);
  fs.writeFileSync(`${zipPath}.sha256`, `${sha256File(zipPath)}  ${path.basename(zipPath)}\n`, 'ascii');
  return zipPath;
}

function fixture(root) {
  const inputs = path.join(root, 'inputs'); fs.mkdirSync(inputs, { recursive: true });
  const electronRoot = path.join(root, 'electron');
  fs.mkdirSync(electronRoot, { recursive: true });
  fs.writeFileSync(path.join(electronRoot, 'electron.exe'), 'electron-fixture');
  fs.writeFileSync(path.join(electronRoot, 'LICENSE'), 'Electron MIT');

  const runnerEntry = 'output/helper.exe';
  const runnerRoot = path.join(root, 'runner');
  fs.mkdirSync(path.dirname(path.join(runnerRoot, ...runnerEntry.split('/'))), { recursive: true });
  fs.writeFileSync(path.join(runnerRoot, ...runnerEntry.split('/')), 'runner-fixture');

  const storageRoot = path.join(root, 'storage');
  for (const [moduleName, version] of [['better-sqlite3', '8.7.0'], ['bindings', '1.5.0'], ['file-uri-to-path', '1.0.0']]) {
    const moduleRoot = path.join(storageRoot, 'output', 'runtime', 'node_modules', moduleName);
    fs.mkdirSync(moduleRoot, { recursive: true });
    writeJson(path.join(moduleRoot, 'package.json'), { name: moduleName, version, license: 'MIT' });
  }
  const binding = path.join(storageRoot, 'output', 'runtime', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  fs.mkdirSync(path.dirname(binding), { recursive: true });
  fs.writeFileSync(binding, 'sqlite-fixture');

  const electronZip = path.join(inputs, 'electron.zip');
  const runnerZip = path.join(inputs, 'runner.zip');
  const storageZip = path.join(inputs, 'storage.zip');
  writeDeterministicZip(electronRoot, electronZip, 1787443200);
  writeDeterministicZip(runnerRoot, runnerZip, 1787443200);
  writeDeterministicZip(storageRoot, storageZip, 1787443200);
  const lock = {
    schema_version: 1,
    lock_id: 'TEST-A9-09',
    release_id: 'WIN7-CODING-AGENT-A9-ALPHA1',
    version: '0.3.0-alpha.1',
    source_date_epoch: 1787443200,
    target: { os: 'Windows 7 SP1 build 7601', architecture: 'x64', delivery: 'SELF_CONTAINED_OFFLINE_WIN7_X64' },
    inputs_are_not_a9_pass: true,
    runtime_profiles: { runner: { id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', executable_sha256: HASH, output_encoding: 'cp936', working_directory_token: '${RC_RUNNER_WORK_ROOT}', argv_exact: [[], ['/all']] } },
    inputs: {
      electron_zip: { filename: 'electron.zip', version: '22.3.27', sha256: sha256File(electronZip), required_entry: 'electron.exe', required_entry_sha256: digest('electron-fixture') },
      runner_return_zip: { filename: 'runner.zip', version: 'D-013-v25-a9-trusted-shell-current-user', sha256: sha256File(runnerZip), required_entry: runnerEntry, required_entry_sha256: digest('runner-fixture'), profile: 'D-013-v25-a9-trusted-shell-current-user', protocol_version: 2 },
      storage_return_zip: { filename: 'storage.zip', version: '8.7.0', sha256: sha256File(storageZip), required_entry: 'output/runtime/node_modules/better-sqlite3/build/Release/better_sqlite3.node', required_entry_sha256: digest('sqlite-fixture'), sqlite: '3.43.1', electron_abi: 110, profile: 'E22-SQLITE343-LOCAL-SSD' },
    },
    forbidden_payload_patterns: ['.git/', '.env', 'private.pem', 'winpty', 'node-pty', 'portable-data/', 'a9-state.db'],
  };
  const lockPath = path.join(root, 'lock.json'); writeJson(lockPath, lock);
  return { electronZip, runnerZip, storageZip, lockPath };
}

test('A9 v3 builder produces byte-identical fixture candidates with the complete runtime closure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-package-fixture-'));
  const inputs = fixture(root);
  const options = { repositoryRoot: process.cwd(), ...inputs, outputRoot: path.join(root, 'out'), allowUncommitted: true };
  const first = buildA9ProductCandidate(options);
  const firstBytes = fs.readFileSync(first.zipPath);
  const second = buildA9ProductCandidate(options);
  assert.deepEqual(fs.readFileSync(second.zipPath), firstBytes);
  assert.equal(second.manifest.status, 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS');
  assert.equal(second.manifest.gates.developer_package_integrity, 'PASS');
  assert.equal(second.manifest.gates.win10, 'NOT_PERFORMED');
  assert.equal(second.manifest.gates.win7, 'NOT_PERFORMED');
  assert.equal(second.manifest.gates.alpha, 'NOT_PERFORMED');
  assert.equal(second.manifest.external_acceptance_eligible, !second.manifest.source_dirty);

  const appRoot = path.join(second.stage, 'resources', 'app');
  assert.ok(fs.existsSync(path.join(appRoot, 'git-adapter', 'dist', 'index.js')));
  assert.ok(fs.existsSync(path.join(appRoot, 'product', 'a9-package-runtime.js')));
  assert.ok(fs.existsSync(path.join(appRoot, 'product', 'active-workspace-store.js')));
  assert.ok(fs.existsSync(path.join(appRoot, 'a9-runtime.json')));
  assert.equal(fs.existsSync(path.join(appRoot, 'rc-runtime.json')), false);
  assert.ok(fs.existsSync(path.join(second.stage, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')));
  assert.ok(fs.existsSync(path.join(second.stage, 'validation', 'a9-package-integrity.cjs')));
  assert.ok(fs.existsSync(path.join(second.stage, 'validation', 'a9-win7-17-report.cjs')));
  assert.ok(fs.existsSync(path.join(second.stage, 'RUN_WIN7_17_REPORT_VERIFY.cmd')));

  const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, '0.3.0-alpha.1');
  assert.equal(packageJson.main, 'product/main.js');
  assert.equal(packageJson.runtime_profile.state_schema, 4);
  const runtimeProfile = JSON.parse(fs.readFileSync(path.join(appRoot, 'a9-runtime.json'), 'utf8'));
  assert.equal(runtimeProfile.state_schema, 4);
  const validationKit = JSON.parse(fs.readFileSync(path.join(second.stage, 'A9_09_VALIDATION_KIT.json'), 'utf8'));
  assert.equal(validationKit.win7_revalidation_policy.decision, 'ADR-0097');
  assert.deepEqual(validationKit.win7_revalidation_policy.mandatory_impacted, [
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
  assert.equal(validationKit.incremental_win7_cases.length, 12);
  for (const validationCase of validationKit.incremental_win7_cases) {
    assert.match(validationCase.case_id, /^W(?:17|20)-/);
    assert.ok(validationCase.preconditions.length > 0);
    assert.ok(validationCase.steps.length > 0);
    assert.ok(validationCase.expected.length > 0);
    assert.equal(validationCase.assertions.length, validationCase.expected.length);
    assert.ok(validationCase.assertions.every((item) => item.assertion_id.startsWith(`${validationCase.case_id}-A`)));
    assert.ok(validationCase.evidence.length > 0);
  }
  assert.ok(validationKit.source_artifact_hashes['src/core/src/git-command-policy.ts']);
  assert.ok(validationKit.source_artifact_hashes['src/runner/src/background-process-manager.ts']);
  assert.match(fs.readFileSync(path.join(second.stage, 'THIRD_PARTY_LICENSES.md'), 'utf8'), /A9 Schema v4/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /set "ELECTRON_RUN_AS_NODE=1"/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /set "NODE_OPTIONS="/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /--package-zip=%~f1/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_09_INTEGRITY.cmd'), 'utf8'), /a9-win7-20-evidence/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_WIN7_20_REPORT_VERIFY.cmd'), 'utf8'), /A9_09_VALIDATION_KIT\.json/);
  const runnerManifest = JSON.parse(fs.readFileSync(path.join(second.stage, 'resources', 'native', 'runner', 'runner-manifest.json'), 'utf8'));
  assert.equal(runnerManifest.helper.profile, 'D-013-v25-a9-trusted-shell-current-user');
  assert.equal(runnerManifest.helper.protocol_version, 2);
  assert.doesNotMatch(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /\bnode(?:\.exe)?\b/i);
  assert.match(fs.readFileSync(path.join(second.stage, 'validation', 'a9-package-integrity.cjs'), 'utf8'), /package_sha256: packageSha256/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('A9 v25 input recorder preserves v24 and accepts only a manifest-bound eligible return', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-v25-lock-'));
  const runnerZip = createV25ReturnFixture(root);
  const runnerZip2 = path.join(root, 'D013-V25-WIN10-RETURN-2.zip');
  fs.copyFileSync(runnerZip, runnerZip2);
  fs.writeFileSync(`${runnerZip2}.sha256`, `${sha256File(runnerZip2)}  ${path.basename(runnerZip2)}\n`, 'ascii');
  const output = path.join(root, 'a9-09-input-lock.json');
  const result = recordA9V25HelperInput({
    runnerZip,
    sidecar: `${runnerZip}.sha256`,
    runnerZip2,
    sidecar2: `${runnerZip2}.sha256`,
    baseLock: path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'),
    output,
  });
  const lock = JSON.parse(fs.readFileSync(output, 'utf8'));
  const v24 = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'), 'utf8'));
  assert.deepEqual(lock.inputs.runner_return_zip_v24_historical, v24.inputs.runner_return_zip);
  assert.equal(lock.inputs.runner_return_zip.profile, 'D-013-v25-a9-trusted-shell-current-user');
  assert.equal(lock.inputs.runner_return_zip.protocol_version, 2);
  assert.equal(lock.inputs.runner_return_zip.runtime_profile, 'a9-trusted-shell-current-user-v1');
  assert.equal(lock.inputs.runner_return_zip.required_entry_sha256, digest('v25-helper-fixture'));
  assert.equal(result.helperSha256, digest('v25-helper-fixture'));
  assert.throws(() => recordA9V25HelperInput({ runnerZip, runnerZip2, output }), /A9_V25_LOCK_REFUSES_OVERWRITE/);
  const reusedOutput = path.join(root, 'a9-09-reused-input-lock.json');
  assert.throws(() => recordA9V25HelperInput({
    runnerZip,
    sidecar: `${runnerZip}.sha256`,
    runnerZip2: runnerZip,
    sidecar2: `${runnerZip}.sha256`,
    baseLock: path.join(process.cwd(), 'release', 'win7-product-v3', 'a9-07-input-lock.json'),
    output: reusedOutput,
  }), /A9_V25_DOUBLE_BUILD_DISTINCT_RETURNS_REQUIRED/);
  fs.rmSync(root, { recursive: true, force: true });
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
  fs.writeFileSync(path.join(electronRoot, 'electron.exe'), 'electron-fixture');
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
