import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildA8ProductCandidate } from '../build-a8-product-v2.mjs';
import { sha256File, writeJson } from '../release-contract.mjs';
import { writeDeterministicZip } from '../zip-utils.mjs';

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const HASH = '0'.repeat(64);

function assertRelativeModuleClosure(directory) {
  const modules = fs.readdirSync(directory).filter((fileName) => fileName.endsWith('.mjs')).sort();
  assert.ok(modules.length > 0, 'validation module set must not be empty');
  for (const fileName of modules) {
    const source = fs.readFileSync(path.join(directory, fileName), 'utf8');
    const specifiers = [];
    for (const pattern of [/\bfrom\s+['"](\.[^'"]+)['"]/g, /\bimport\s+['"](\.[^'"]+)['"]/g]) {
      for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
    }
    for (const specifier of specifiers) {
      const dependency = path.resolve(directory, specifier);
      assert.ok(fs.existsSync(dependency), `${fileName} has missing packaged dependency ${specifier}`);
      assert.ok(fs.statSync(dependency).isFile(), `${fileName} dependency ${specifier} must be a file`);
    }
  }
}

function fixture(root) {
  const inputs = path.join(root, 'inputs'); fs.mkdirSync(inputs, { recursive: true });
  const electronRoot = path.join(root, 'electron'); fs.mkdirSync(electronRoot, { recursive: true }); fs.writeFileSync(path.join(electronRoot, 'electron.exe'), 'electron-fixture'); fs.writeFileSync(path.join(electronRoot, 'LICENSE'), 'Electron MIT');
  const runnerRoot = path.join(root, 'runner'); fs.mkdirSync(path.join(runnerRoot, 'output'), { recursive: true }); fs.writeFileSync(path.join(runnerRoot, 'output', 'helper.exe'), 'runner-fixture');
  const storageRoot = path.join(root, 'storage');
  for (const moduleName of ['better-sqlite3', 'bindings', 'file-uri-to-path']) {
    fs.mkdirSync(path.join(storageRoot, 'output', 'runtime', 'node_modules', moduleName), { recursive: true });
    writeJson(path.join(storageRoot, 'output', 'runtime', 'node_modules', moduleName, 'package.json'), { name: moduleName, version: '1.0.0', license: 'MIT' });
  }
  fs.mkdirSync(path.join(storageRoot, 'output', 'runtime', 'node_modules', 'better-sqlite3', 'build', 'Release'), { recursive: true });
  fs.writeFileSync(path.join(storageRoot, 'output', 'runtime', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'), 'sqlite-fixture');
  const electronZip = path.join(inputs, 'electron.zip'); const runnerZip = path.join(inputs, 'runner.zip'); const storageZip = path.join(inputs, 'storage.zip');
  writeDeterministicZip(electronRoot, electronZip, 1786896000); writeDeterministicZip(runnerRoot, runnerZip, 1786896000); writeDeterministicZip(storageRoot, storageZip, 1786896000);
  const lock = {
    schema_version: 1, lock_id: 'TEST-A8-06', release_id: 'TEST-A8-ALPHA1', version: '0.2.0-alpha.1', source_date_epoch: 1786896000,
    target: { os: 'Windows 7 SP1 build 7601', architecture: 'x64', delivery: 'SELF_CONTAINED_OFFLINE_WIN7_X64' }, inputs_are_not_a7_pass: true,
    runtime_profiles: { runner: { id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', executable_sha256: HASH, output_encoding: 'cp936', working_directory_token: '${RC_RUNNER_WORK_ROOT}', argv_exact: [[], ['/all']] } },
    inputs: {
      electron_zip: { filename: 'electron.zip', version: '22.3.27', sha256: sha256File(electronZip), required_entry: 'electron.exe', required_entry_sha256: digest(Buffer.from('electron-fixture')) },
      runner_return_zip: { filename: 'runner.zip', version: 'v24', sha256: sha256File(runnerZip), required_entry: 'output/helper.exe', required_entry_sha256: digest(Buffer.from('runner-fixture')), profile: 'D-013-v24-low-risk-noninteractive' },
      storage_return_zip: { filename: 'storage.zip', version: '8.7.0', sha256: sha256File(storageZip), required_entry: 'output/runtime/node_modules/better-sqlite3/build/Release/better_sqlite3.node', required_entry_sha256: digest(Buffer.from('sqlite-fixture')), sqlite: '3.43.1', electron_abi: 110, profile: 'E22-SQLITE343-LOCAL-SSD' },
    },
    forbidden_payload_patterns: ['.git/', '.env', 'private.pem', 'winpty', 'node-pty'],
  };
  const lockPath = path.join(root, 'lock.json'); writeJson(lockPath, lock);
  return { electronZip, runnerZip, storageZip, lockPath };
}

test('A8 builder produces byte-identical fixture candidates and locked manifest status', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-package-fixture-')); const inputs = fixture(root);
  const one = buildA8ProductCandidate({ repositoryRoot: process.cwd(), lockPath: inputs.lockPath, electronZip: inputs.electronZip, runnerZip: inputs.runnerZip, storageZip: inputs.storageZip, outputRoot: path.join(root, 'out'), allowUncommitted: true });
  const firstBytes = fs.readFileSync(one.zipPath); const firstHash = sha256File(one.zipPath);
  const two = buildA8ProductCandidate({ repositoryRoot: process.cwd(), lockPath: inputs.lockPath, electronZip: inputs.electronZip, runnerZip: inputs.runnerZip, storageZip: inputs.storageZip, outputRoot: path.join(root, 'out'), allowUncommitted: true });
  assert.deepEqual(fs.readFileSync(two.zipPath), firstBytes);
  assert.equal(sha256File(two.zipPath), firstHash);
  assert.equal(two.manifest.status, 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS');
  assert.equal(two.manifest.gates.win10, 'NOT_PERFORMED');
  assert.equal(two.manifest.external_acceptance_eligible, !two.manifest.source_dirty);
  const validationKit = JSON.parse(fs.readFileSync(path.join(two.stage, 'A8_06_VALIDATION_KIT.json'), 'utf8'));
  assert.equal(validationKit.schema_version, 2);
  assert.match(validationKit.commands.win10.preflight, /set ELECTRON_RUN_AS_NODE=1&& \.\\electron\.exe -v/);
  assert.doesNotMatch(validationKit.commands.win10.preflight, /where node/);
  assert.doesNotMatch(validationKit.commands.win7.preflight, /where node/);
  assert.match(validationKit.commands.win10.a8_05, /set ELECTRON_RUN_AS_NODE=1&& \.\\electron\.exe validation\\run-a8-05-electron-smoke\.mjs/);
  assert.match(validationKit.commands.win10.a8_05, /--electron=\.\\electron\.exe/);
  assert.doesNotMatch(validationKit.commands.win10.a8_05, /run-a8-05-persistence-smoke\.mjs/);
  assert.match(validationKit.commands.win10.a8_05, /--validation-layer=win10/);
  assert.match(validationKit.commands.win7.verify_set, /set ELECTRON_RUN_AS_NODE=1&& \.\\electron\.exe validation\\verify-a8-evidence-set\.mjs/);
  assert.match(validationKit.commands.win7.a8_03, /\.\.\\a8-evidence-win7/);
  assert.ok(validationKit.expected_cases.includes('A8UX-01-CONVERSATION-SCROLL'));
  for (const layer of ['win10', 'win7']) {
    for (const commandName of ['preflight', 'a8_03', 'a8_04', 'a8_05', 'verify_set']) {
      const command = validationKit.commands[layer][commandName];
      assert.match(command, /^set ELECTRON_RUN_AS_NODE=1&& \.\\electron\.exe/);
      assert.doesNotMatch(command, /(?:^|\s|&&)node(?:\.exe)?\s/);
      if (commandName !== 'preflight') {
        assert.match(command, new RegExp(`\\.\\.\\\\a8-evidence-${layer}`));
        assert.doesNotMatch(command, /(?:--report|--screenshot)=evidence\\/);
      }
    }
  }
  assert.ok(validationKit.evidence_schema.required_fields.includes('candidate_manifest_sha256'));
  for (const fileName of ['a8-validation-evidence.mjs', 'run-a8-05-electron-smoke.mjs', 'verify-a8-evidence-set.mjs']) {
    assert.ok(fs.existsSync(path.join(two.stage, 'validation', fileName)));
  }
  assertRelativeModuleClosure(path.join(two.stage, 'validation'));
  assert.equal(validationKit.evidence_classes.historical_surrogate_schema_v1.formal_acceptance_eligible, false);
  assert.equal(validationKit.evidence_classes.formal_candidate_schema_v2.required, true);
  for (const sourceKit of ['a8-03-electron-review-validation-kit-20260821.json', 'a8-04-boundary-validation-kit-20260821.json']) {
    const sourceKitRecord = JSON.parse(fs.readFileSync(path.join(two.stage, 'evidence', 'status', sourceKit), 'utf8'));
    assert.match(sourceKitRecord.status, /SUPERSEDED_FOR_FORMAL_EXECUTION_BY_A8_06_EVIDENCE_V2/);
  }
  assert.equal(fs.existsSync(path.join(two.stage, 'evidence', 'status', 'a8-03-electron-review-qa-20260821.json')), false);
  assert.equal(fs.existsSync(path.join(two.stage, 'evidence', 'status', 'a8-04-boundary-electron-qa-20260821.json')), false);
  assert.equal(
    fs.existsSync(path.join(two.stage, 'evidence', 'status', 'a8-agent-first-product-latest.json')),
    false,
    'build-dependent current status must remain outside the immutable candidate',
  );
  assert.ok(fs.existsSync(path.join(two.stage, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('A8 builder refuses a missing or changed input before publishing output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-package-negative-')); const inputs = fixture(root);
  const outputRoot = path.join(root, 'out');
  assert.throws(() => buildA8ProductCandidate({ repositoryRoot: process.cwd(), lockPath: inputs.lockPath, electronZip: path.join(root, 'missing.zip'), runnerZip: inputs.runnerZip, storageZip: inputs.storageZip, outputRoot, allowUncommitted: true }), /A8_ELECTRON_ZIP_REQUIRED/);
  assert.equal(fs.existsSync(outputRoot), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('A8 builder rejects a forbidden payload and removes the partial work tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-package-forbidden-')); const inputs = fixture(root);
  fs.writeFileSync(path.join(root, 'electron', '.env'), 'do-not-package');
  writeDeterministicZip(path.join(root, 'electron'), inputs.electronZip, 1786896000);
  const lock = JSON.parse(fs.readFileSync(inputs.lockPath, 'utf8'));
  lock.inputs.electron_zip.sha256 = sha256File(inputs.electronZip);
  writeJson(inputs.lockPath, lock);
  const outputRoot = path.join(root, 'out');
  assert.throws(() => buildA8ProductCandidate({ repositoryRoot: process.cwd(), lockPath: inputs.lockPath, electronZip: inputs.electronZip, runnerZip: inputs.runnerZip, storageZip: inputs.storageZip, outputRoot, allowUncommitted: true }), /FORBIDDEN_PAYLOAD/);
  assert.equal(fs.existsSync(path.join(outputRoot, '.work')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('A8 package validation kit contract executes without system Node in PATH (包内 Electron Node-mode 闭包)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-package-no-node-'));
  const inputs = fixture(root);
  const candidate = buildA8ProductCandidate({
    repositoryRoot: process.cwd(),
    lockPath: inputs.lockPath,
    electronZip: inputs.electronZip,
    runnerZip: inputs.runnerZip,
    storageZip: inputs.storageZip,
    outputRoot: path.join(root, 'out'),
    allowUncommitted: true,
  });

  const kit = JSON.parse(fs.readFileSync(path.join(candidate.stage, 'A8_06_VALIDATION_KIT.json'), 'utf8'));
  const requiredEntrypoints = [
    'run-a8-03-electron-review-smoke.mjs',
    'run-a8-04-boundary-smoke.mjs',
    'run-a8-05-electron-smoke.mjs',
    'verify-a8-evidence-set.mjs',
  ];

  for (const layer of ['win10', 'win7']) {
    const commands = kit.commands[layer];
    assert.ok(commands, `commands.${layer} must exist`);

    // 1. Preflight must verify packaged electron.exe in node mode and certutil hashes, never querying system node
    assert.match(commands.preflight, /^set ELECTRON_RUN_AS_NODE=1&& \.\\electron\.exe -v/);
    assert.doesNotMatch(commands.preflight, /\bwhere\s+node\b/i);
    assert.doesNotMatch(commands.preflight, /\bnode(?:\.exe)?\s+--version\b/i);

    // 2. All smoke/verification commands must use packaged electron.exe in node mode
    for (const key of ['a8_03', 'a8_04', 'a8_05', 'verify_set']) {
      const cmd = commands[key];
      assert.match(cmd, /^set ELECTRON_RUN_AS_NODE=1&& \.\\electron\.exe\s+validation\\/);
      assert.doesNotMatch(cmd, /(?:^|\s|&&)node(?:\.exe)?\s+/);
    }
  }

  // 3. Packaged validation scripts closure
  const validationDir = path.join(candidate.stage, 'validation');
  for (const script of requiredEntrypoints) {
    const scriptPath = path.join(validationDir, script);
    assert.ok(fs.existsSync(scriptPath), `Packaged validation script ${script} must exist`);
    const content = fs.readFileSync(scriptPath, 'utf8');

    // UI smoke scripts must sanitize child environment by deleting ELECTRON_RUN_AS_NODE before launching GUI Electron
    if (script.includes('review-smoke') || script.includes('boundary-smoke')) {
      assert.match(content, /delete\s+env\.ELECTRON_RUN_AS_NODE/);
      assert.match(content, /childProcess\.spawnSync\(electron,\s*args/);
    }

    // ABI 110 smoke must explicitly bind ELECTRON_RUN_AS_NODE for D-014 SQLite binding
    if (script.includes('run-a8-05-electron-smoke')) {
      assert.match(content, /ELECTRON_RUN_AS_NODE:\s*'1'/);
    }
  }
  const evidenceModule = fs.readFileSync(path.join(validationDir, 'a8-validation-evidence.mjs'), 'utf8');
  assert.match(evidenceModule, /require\('original-fs'\)/);
  assert.match(evidenceModule, /A8_PHYSICAL_FILESYSTEM_UNAVAILABLE/);
  assertRelativeModuleClosure(validationDir);

  fs.rmSync(root, { recursive: true, force: true });
});
