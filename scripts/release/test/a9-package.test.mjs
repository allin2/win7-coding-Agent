import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { buildA9ProductCandidate } from '../build-a9-product-v3.mjs';
import { sha256File, writeJson } from '../release-contract.mjs';
import { writeDeterministicZip } from '../zip-utils.mjs';

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const HASH = '0'.repeat(64);
const require = createRequire(import.meta.url);
const integrity = require('../../../release/win7-product-v3/a9-package-integrity.cjs');

function fixture(root) {
  const inputs = path.join(root, 'inputs'); fs.mkdirSync(inputs, { recursive: true });
  const electronRoot = path.join(root, 'electron');
  fs.mkdirSync(electronRoot, { recursive: true });
  fs.writeFileSync(path.join(electronRoot, 'electron.exe'), 'electron-fixture');
  fs.writeFileSync(path.join(electronRoot, 'LICENSE'), 'Electron MIT');

  const runnerEntry = 'Win7CodingAgent-0.2.0-alpha.1-win7-x64/resources/native/runner/spike02_helper.exe';
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
    lock_id: 'TEST-A9-07',
    release_id: 'WIN7-CODING-AGENT-A9-ALPHA1',
    version: '0.3.0-alpha.1',
    source_date_epoch: 1787443200,
    target: { os: 'Windows 7 SP1 build 7601', architecture: 'x64', delivery: 'SELF_CONTAINED_OFFLINE_WIN7_X64' },
    inputs_are_not_a9_pass: true,
    runtime_profiles: { runner: { id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', executable_sha256: HASH, output_encoding: 'cp936', working_directory_token: '${RC_RUNNER_WORK_ROOT}', argv_exact: [[], ['/all']] } },
    inputs: {
      electron_zip: { filename: 'electron.zip', version: '22.3.27', sha256: sha256File(electronZip), required_entry: 'electron.exe', required_entry_sha256: digest('electron-fixture') },
      runner_return_zip: { filename: 'runner.zip', version: 'D-013-v24-from-locked-A8-candidate', sha256: sha256File(runnerZip), required_entry: runnerEntry, required_entry_sha256: digest('runner-fixture'), profile: 'D-013-v24-low-risk-noninteractive' },
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
  assert.ok(fs.existsSync(path.join(appRoot, 'a9-runtime.json')));
  assert.equal(fs.existsSync(path.join(appRoot, 'rc-runtime.json')), false);
  assert.ok(fs.existsSync(path.join(second.stage, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')));
  assert.ok(fs.existsSync(path.join(second.stage, 'validation', 'a9-package-integrity.cjs')));

  const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, '0.3.0-alpha.1');
  assert.equal(packageJson.main, 'product/main.js');
  assert.equal(packageJson.runtime_profile.state_schema, 3);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /set "ELECTRON_RUN_AS_NODE=1"/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /set "NODE_OPTIONS="/);
  assert.match(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /--package-zip=%~f1/);
  assert.doesNotMatch(fs.readFileSync(path.join(second.stage, 'RUN_A9_07_INTEGRITY.cmd'), 'utf8'), /\bnode(?:\.exe)?\b/i);
  assert.match(fs.readFileSync(path.join(second.stage, 'validation', 'a9-package-integrity.cjs'), 'utf8'), /package_sha256: packageSha256/);
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
