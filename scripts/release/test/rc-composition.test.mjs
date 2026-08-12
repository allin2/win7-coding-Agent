import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createRcComposition } = require('../../../src/shell/product/rc-composition');
const { createDesktopHost } = require('../../../src/shell/product/desktop-host');
const runnerModule = require('../../../src/runner/dist');
const stateModule = require('../../../src/state/dist');
const rc04Smoke = require('../../../release/win7-rc/rc04-smoke.cjs');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a7-rc-composition-'));
  const releaseRoot = path.join(root, 'Win7CodingAgent-test-win7-x64');
  const appRoot = path.join(releaseRoot, 'resources', 'app');
  const runnerRoot = path.join(releaseRoot, 'resources', 'native', 'runner');
  const storageRoot = path.join(releaseRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3');
  const helper = path.join(runnerRoot, 'spike02_helper.exe');
  const binding = path.join(storageRoot, 'build', 'Release', 'better_sqlite3.node');
  fs.mkdirSync(path.dirname(binding), { recursive: true });
  fs.mkdirSync(runnerRoot, { recursive: true });
  fs.mkdirSync(appRoot, { recursive: true });
  fs.writeFileSync(helper, 'locked helper', 'utf8');
  fs.writeFileSync(binding, 'locked native binding', 'utf8');
  writeJson(path.join(storageRoot, 'package.json'), { name: 'better-sqlite3', version: '8.7.0' });
  const runnerManifestPath = path.join(runnerRoot, 'runner-manifest.json');
  writeJson(runnerManifestPath, {
    schema_version: 1,
    release: 'TEST-RC-0.0.0-test',
    helper: { path: 'spike02_helper.exe', sha256: sha256(helper) },
    profiles: [{
      id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', sha256: 'a'.repeat(64),
      risk: 'low', output_encoding: 'cp936', working_directory_roots: ['${RC_RUNNER_WORK_ROOT}'],
      argv_policy: { exact: [[], ['/all']] },
    }],
    acceptance_action: { profile_id: 'win7-whoami', args: [], timeout_ms: 15_000 },
  });
  const runtimePath = path.join(appRoot, 'rc-runtime.json');
  writeJson(runtimePath, {
    schema_version: 1,
    release_id: 'TEST-RC',
    version: '0.0.0-test',
    native_layout: 'EXTERNAL_TO_APP_AND_ASAR',
    runner_manifest: '../native/runner/runner-manifest.json',
    runner_manifest_sha256: sha256(runnerManifestPath),
    runner_work_directory: 'runner-work',
    storage_module_root: '../native/storage/node_modules/better-sqlite3',
    storage_native_binding: '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    storage_database: 'state/agent-events-v2.db',
    storage_profile: 'E22-SQLITE343-LOCAL-SSD',
    unsupported: ['interactive-winpty', 'arbitrary-shell', 'network-drive-storage', 'hdd-performance-claim'],
  });
  const files = [runtimePath, runnerManifestPath, helper, binding].map((filePath) => ({
    path: path.relative(releaseRoot, filePath).replace(/\\/g, '/'),
    size: fs.statSync(filePath).size,
    sha256: sha256(filePath),
  }));
  writeJson(path.join(releaseRoot, 'release-manifest.json'), {
    schema_version: 1,
    release_id: 'TEST-RC',
    version: '0.0.0-test',
    status: 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS',
    required_native: { runner_helper: sha256(helper), better_sqlite3_node: sha256(binding), electron_abi: 110 },
    files,
  });
  return { root, releaseRoot, appRoot, helper, binding, userData: path.join(root, '用户 数据') };
}

class ProfileLedger {
  constructor(database, options) {
    this.database = database;
    this.options = options;
    this.runtimeProfile = Object.freeze({
      schemaVersion: 1, profile: 'E22-SQLITE343-LOCAL-SSD', backend: 'better-sqlite3',
      sqliteVersion: '3.43.1', journalMode: 'wal', compileOptions: ['ENABLE_FTS5'],
    });
    this.size = 0;
  }
  close() { this.database.close(); }
}

test('RC composition verifies locked native files and assembles Runner plus SQLite State', () => {
  const fixture = createFixture();
  const database = { closed: false, close() { this.closed = true; } };
  const composition = createRcComposition({
    applicationRoot: fixture.appRoot,
    userDataPath: fixture.userData,
    platform: 'test',
    stateModule: { SqliteEventLedger: ProfileLedger },
    runnerModule,
    databaseFactory: (databasePath, nativeBinding) => {
      assert.equal(databasePath, path.join(fixture.userData, 'state', 'agent-events-v2.db'));
      assert.equal(nativeBinding, fs.realpathSync(fixture.binding));
      return database;
    },
  });
  assert.equal(composition.releaseId, 'TEST-RC');
  assert.equal(composition.runnerAcceptanceAction.profileId, 'win7-whoami');
  assert.equal(composition.stateCapability, 'sqlite-wal-fts5:E22-SQLITE343-LOCAL-SSD');
  assert.equal(composition.disabledCapabilities.interactiveTerminal, 'disabled-winpty-node-pty-not-packaged');
  assert.equal(composition.runnerWorkDirectory, fs.realpathSync(path.join(fixture.userData, 'runner-work')));
  composition.close();
  composition.close();
  assert.equal(database.closed, true);
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

test('RC composition fails closed before native loading when a manifest-bound file changes', () => {
  const fixture = createFixture();
  fs.appendFileSync(fixture.helper, 'tamper', 'utf8');
  assert.throws(() => createRcComposition({
    applicationRoot: fixture.appRoot,
    userDataPath: fixture.userData,
    platform: 'test',
    stateModule: { SqliteEventLedger: ProfileLedger },
    runnerModule,
    databaseFactory: () => ({ close() {} }),
  }), /RC_MANIFEST_FILE_MISMATCH/);
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

test('product host reports persistent State and every disabled RC capability explicitly', () => {
  const closeState = { calls: 0 };
  const ledger = new stateModule.InMemoryEventLedger();
  const host = createDesktopHost({
    ledger,
    stateCapability: 'sqlite-wal-fts5:E22-SQLITE343-LOCAL-SSD',
    disabledCapabilities: {
      interactiveTerminal: 'disabled-winpty-node-pty-not-packaged',
      arbitraryShell: 'disabled-fixed-low-risk-profile-only',
    },
    productIdentity: { product: 'Win7 Coding Agent RC', version: '0.1.0-rc.1' },
    closeState: () => { closeState.calls += 1; },
  });
  const diagnostics = host.getDiagnostics();
  assert.equal(diagnostics.product, 'Win7 Coding Agent RC');
  assert.equal(diagnostics.capabilities.state, 'sqlite-wal-fts5:E22-SQLITE343-LOCAL-SSD');
  assert.equal(diagnostics.capabilities.terminal, 'unavailable');
  assert.equal(diagnostics.disabledCapabilities.arbitraryShell, 'disabled-fixed-low-risk-profile-only');
  host.dispose();
  assert.equal(closeState.calls, 1);
});

test('product Runner manifest refuses high-risk profiles even when bytes are pinned', () => {
  const fixture = createFixture();
  const manifestPath = path.join(fixture.releaseRoot, 'resources', 'native', 'runner', 'runner-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.profiles[0].risk = 'high';
  writeJson(manifestPath, manifest);
  const { createProductRunner } = require('../../../src/shell/product/runner-runtime');
  assert.throws(() => createProductRunner({
    runnerModule,
    manifestPath,
    expectedManifestSha256: sha256(manifestPath),
    runnerWorkRoot: fixture.userData,
    requireLowRiskOnly: true,
  }), /RUNNER_PROFILE_RISK_PROHIBITED/);
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

test('Windows RC-04 smoke validator requires both product starts and exact composition metrics', () => {
  const report = {
    schema_version: 1,
    exit_code: 0,
    cases: [
      { case_id: 'PRODUCT_ENTRY_START_RENDER_EXIT', status: 'PASS', metrics: { renderer_ready: true, diagnostics_requested: true, runtime_error_count: 0 } },
      { case_id: 'PRODUCT_SECURITY_BASELINE', status: 'PASS', metrics: {} },
      { case_id: 'RC_PRODUCT_COMPOSITION', status: 'PASS', metrics: {
        runner_profile: 'win7-whoami', storage_profile: 'E22-SQLITE343-LOCAL-SSD',
        sqlite_version: '3.43.1', journal_mode: 'wal',
        interactive_terminal: 'disabled-winpty-node-pty-not-packaged',
        arbitrary_shell: 'disabled-fixed-low-risk-profile-only',
      } },
    ],
  };
  assert.equal(rc04Smoke.validateReport(report), report);
  assert.throws(() => rc04Smoke.validateReport({ ...report, cases: report.cases.slice(0, 2) }), /RC_PRODUCT_COMPOSITION/);
  assert.throws(() => rc04Smoke.parseArguments(['--evidence=C:\\same', '--user-data=C:\\same']), /MUST_BE_SEPARATE/);
});
