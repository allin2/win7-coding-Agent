'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createProductRunner } = require('./runner-runtime');

const EXPECTED_LAYOUT = Object.freeze({
  runnerManifest: '../native/runner/runner-manifest.json',
  storageModuleRoot: '../native/storage/node_modules/better-sqlite3',
  storageNativeBinding: '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  storageDatabase: 'state/agent-events-v2.db',
  runnerWorkDirectory: 'runner-work',
});

function createRcComposition(options) {
  const config = options || {};
  const applicationRoot = fs.realpathSync(config.applicationRoot);
  const releaseRoot = fs.realpathSync(path.join(applicationRoot, '..', '..'));
  const runtimeConfigPath = path.join(applicationRoot, 'rc-runtime.json');
  const releaseManifestPath = path.join(releaseRoot, 'release-manifest.json');
  const runtime = readJson(runtimeConfigPath, 'RC_RUNTIME_CONFIG');
  const releaseManifest = readJson(releaseManifestPath, 'RC_RELEASE_MANIFEST');
  validateRuntime(runtime, releaseManifest);

  const runnerManifestPath = resolveReleasePath(applicationRoot, runtime.runner_manifest, releaseRoot);
  const storageModuleRoot = resolveReleasePath(applicationRoot, runtime.storage_module_root, releaseRoot);
  const nativeBinding = resolveReleasePath(applicationRoot, runtime.storage_native_binding, releaseRoot);
  const helperPath = path.join(path.dirname(runnerManifestPath), 'spike02_helper.exe');
  const criticalFiles = [runtimeConfigPath, runnerManifestPath, helperPath, nativeBinding];
  for (const filePath of criticalFiles) verifyManifestFile(releaseManifest, releaseRoot, filePath);
  assertHash('RC_RUNNER_MANIFEST', runnerManifestPath, runtime.runner_manifest_sha256);
  assertHash('RC_RUNNER_HELPER', helperPath, releaseManifest.required_native.runner_helper);
  assertHash('RC_STORAGE_BINDING', nativeBinding, releaseManifest.required_native.better_sqlite3_node);

  const storagePackage = readJson(path.join(storageModuleRoot, 'package.json'), 'RC_STORAGE_PACKAGE');
  if (storagePackage.name !== 'better-sqlite3' || storagePackage.version !== '8.7.0') {
    throw new Error('RC_STORAGE_PACKAGE_IDENTITY_INVALID');
  }
  const platform = config.platform || process.platform;
  if (platform !== 'win32' && platform !== 'test') throw new Error(`RC_PLATFORM_UNSUPPORTED:${platform}`);
  const userDataPath = path.resolve(config.userDataPath || '');
  if (!config.userDataPath) throw new Error('RC_USER_DATA_REQUIRED');
  if (platform === 'win32' && (!path.win32.isAbsolute(config.userDataPath) || /^\\\\/.test(config.userDataPath))) {
    throw new Error('RC_STORAGE_LOCAL_DRIVE_REQUIRED');
  }
  let runnerWorkRoot = path.join(userDataPath, EXPECTED_LAYOUT.runnerWorkDirectory);
  const stateRoot = path.join(userDataPath, 'state');
  fs.mkdirSync(runnerWorkRoot, { recursive: true });
  fs.mkdirSync(stateRoot, { recursive: true });
  runnerWorkRoot = fs.realpathSync(runnerWorkRoot);
  const databasePath = path.join(userDataPath, ...EXPECTED_LAYOUT.storageDatabase.split('/'));

  const stateModule = config.stateModule;
  const runnerModule = config.runnerModule;
  if (!stateModule || typeof stateModule.SqliteEventLedger !== 'function') throw new Error('RC_STATE_MODULE_INVALID');
  if (!runnerModule) throw new Error('RC_RUNNER_MODULE_INVALID');
  const database = config.databaseFactory
    ? config.databaseFactory(databasePath, nativeBinding, storageModuleRoot)
    : createDatabase(storageModuleRoot, databasePath, nativeBinding, config.moduleLoader || require);
  let ledger;
  try {
    ledger = new stateModule.SqliteEventLedger(database, {
      maxEvents: 100_000,
      expectedSqliteVersion: '3.43.1',
      requiredCompileOptions: ['ENABLE_FTS5', 'ENABLE_COLUMN_METADATA', 'THREADSAFE=2'],
      databasePath,
    });
  } catch (error) {
    try { database.close(); } catch (closeError) {
      throw new Error(`RC_STORAGE_INITIALIZATION_AND_CLOSE_FAILED:${message(error)};${message(closeError)}`);
    }
    throw error;
  }
  let sessionCatalog;
  let recoveryReport = null;
  if (typeof stateModule.A8PersistentCatalog === 'function') {
    try {
      sessionCatalog = new stateModule.A8PersistentCatalog(database, {
        ...(config.a8ContractSha256 ? { contractSha256: config.a8ContractSha256 } : {}),
      });
      recoveryReport = new stateModule.A8RecoveryCoordinator(sessionCatalog).recover();
      if (recoveryReport.status === 'READ_ONLY_RECOVERY_REQUIRED') {
        throw new Error(`A8_RECOVERY_READ_ONLY:${recoveryReport.diagnostics.join(';')}`);
      }
    } catch (error) {
      try { ledger.close(); } catch (closeError) {
        throw new Error(`RC_SESSION_CATALOG_AND_STORAGE_CLOSE_FAILED:${message(error)};${message(closeError)}`);
      }
      throw error;
    }
  }
  let runner;
  try {
    runner = createProductRunner({
      runnerModule,
      manifestPath: runnerManifestPath,
      expectedManifestSha256: runtime.runner_manifest_sha256,
      runnerWorkRoot,
      requireLowRiskOnly: true,
    });
  } catch (error) {
    try {
      ledger.close();
    } catch (closeError) {
      throw new Error(`RC_RUNNER_INITIALIZATION_AND_STORAGE_CLOSE_FAILED:${message(error)};${message(closeError)}`);
    }
    throw error;
  }
  let closed = false;
  return {
    schemaVersion: 1,
    releaseId: runtime.release_id,
    version: runtime.version,
    ledger,
    database,
    sessionCatalog,
    recoveryReport,
    runner: runner.runner,
    runnerAcceptanceAction: runner.acceptanceAction,
    runnerWorkDirectory: runnerWorkRoot,
    stateCapability: `sqlite-wal-fts5:${runtime.storage_profile}`,
    stateRuntimeProfile: ledger.runtimeProfile,
    disabledCapabilities: Object.freeze({
      interactiveTerminal: 'disabled-winpty-node-pty-not-packaged',
      arbitraryShell: 'disabled-fixed-low-risk-profile-only',
      networkDriveStorage: 'unsupported-local-ntfs-ssd-only',
      hddPerformance: 'unsupported-no-inherited-performance-claim',
    }),
    close() {
      if (closed) return;
      closed = true;
      ledger.close();
    },
  };
}

function validateRuntime(runtime, manifest) {
  if (!runtime || runtime.schema_version !== 1 || runtime.release_id !== manifest.release_id || runtime.version !== manifest.version ||
      runtime.native_layout !== 'EXTERNAL_TO_APP_AND_ASAR' || runtime.runner_manifest !== EXPECTED_LAYOUT.runnerManifest ||
      runtime.storage_module_root !== EXPECTED_LAYOUT.storageModuleRoot || runtime.storage_native_binding !== EXPECTED_LAYOUT.storageNativeBinding ||
      runtime.storage_database !== EXPECTED_LAYOUT.storageDatabase || runtime.runner_work_directory !== EXPECTED_LAYOUT.runnerWorkDirectory ||
      runtime.storage_profile !== 'E22-SQLITE343-LOCAL-SSD' || !/^[a-f0-9]{64}$/.test(runtime.runner_manifest_sha256 || '')) {
    throw new Error('RC_RUNTIME_CONFIG_INVALID');
  }
  if (!manifest || manifest.schema_version !== 1 || manifest.status !== 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS' ||
      !manifest.required_native || !Array.isArray(manifest.files)) {
    throw new Error('RC_RELEASE_MANIFEST_INVALID');
  }
  const unsupported = new Set(runtime.unsupported || []);
  for (const item of ['interactive-winpty', 'arbitrary-shell', 'network-drive-storage', 'hdd-performance-claim']) {
    if (!unsupported.has(item)) throw new Error(`RC_DISABLED_CAPABILITY_MISSING:${item}`);
  }
}

function resolveReleasePath(root, relativePath, releaseRoot) {
  const resolved = fs.realpathSync(path.resolve(root, relativePath));
  const relative = path.relative(releaseRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`RC_PATH_ESCAPE:${relativePath}`);
  return resolved;
}

function verifyManifestFile(manifest, releaseRoot, filePath) {
  const relative = path.relative(releaseRoot, filePath).replace(/\\/g, '/');
  const matches = manifest.files.filter((item) => item && item.path === relative);
  if (matches.length !== 1) throw new Error(`RC_MANIFEST_FILE_COUNT:${relative}:${matches.length}`);
  const bytes = fs.readFileSync(filePath);
  if (bytes.length !== matches[0].size || digest(bytes) !== matches[0].sha256) {
    throw new Error(`RC_MANIFEST_FILE_MISMATCH:${relative}`);
  }
}

function assertHash(label, filePath, expected) {
  const actual = digest(fs.readFileSync(filePath));
  if (!/^[a-f0-9]{64}$/.test(expected || '') || actual !== expected) {
    throw new Error(`${label}_SHA256_MISMATCH`);
  }
}

function createDatabase(moduleRoot, databasePath, nativeBinding, moduleLoader) {
  const Database = moduleLoader(moduleRoot);
  if (typeof Database !== 'function') throw new Error('RC_STORAGE_CONSTRUCTOR_INVALID');
  return new Database(databasePath, { nativeBinding });
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label}_INVALID:${message(error)}`);
  }
}

function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function message(error) { return error && error.message ? error.message : String(error); }

module.exports = { createRcComposition };
