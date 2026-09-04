'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Load and verify the A9 package-only runtime descriptor.
 *
 * Source/developer launches have no a9-runtime.json and return null. A packaged
 * launch fails closed when its descriptor, manifest binding, native SQLite or
 * D-013 helper differs from the immutable release manifest.
 */
function loadA9PackageRuntime(options) {
  const config = options || {};
  const productRoot = path.resolve(config.productRoot || __dirname);
  const applicationRoot = path.resolve(productRoot, '..');
  const descriptorPath = path.join(applicationRoot, 'a9-runtime.json');
  if (!fs.existsSync(descriptorPath)) return null;

  const descriptor = readJson(descriptorPath, 'A9_PACKAGE_RUNTIME');
  const releaseRoot = fs.realpathSync(path.resolve(applicationRoot, '..', '..'));
  const manifestPath = path.join(releaseRoot, 'release-manifest.json');
  const manifest = readJson(manifestPath, 'A9_PACKAGE_MANIFEST');
  validateDescriptor(descriptor, manifest);

  const storageRoot = resolveReleasePath(applicationRoot, descriptor.storage_module_root, releaseRoot);
  const storageBinding = resolveReleasePath(applicationRoot, descriptor.storage_native_binding, releaseRoot);
  const runnerHelper = resolveReleasePath(applicationRoot, descriptor.runner_helper, releaseRoot);
  assertHash('A9_PACKAGE_STORAGE_BINDING', storageBinding, manifest.required_native.better_sqlite3_node);
  assertHash('A9_PACKAGE_RUNNER_HELPER', runnerHelper, manifest.required_native.runner_helper);

  const argv = Array.isArray(config.argv) ? config.argv : process.argv;
  const env = config.env || process.env;
  const platform = config.platform || process.platform;
  const portable = argv.includes('--portable') || env.WIN7AGENT_PORTABLE === '1';
  let userDataPath = null;
  if (portable) {
    userDataPath = path.join(releaseRoot, 'portable-data');
  } else if (platform === 'win32') {
    if (!env.LOCALAPPDATA || !path.win32.isAbsolute(env.LOCALAPPDATA)) {
      throw new Error('A9_PACKAGE_LOCALAPPDATA_REQUIRED');
    }
    userDataPath = path.win32.join(env.LOCALAPPDATA, 'Win7CodingAgent');
  }
  if (userDataPath && config.app && typeof config.app.setPath === 'function') {
    const ensureDirectory = config.ensureDirectory || ((directory) => fs.mkdirSync(directory, { recursive: true }));
    ensureDirectory(userDataPath);
    config.app.setPath('userData', userDataPath);
  }

  return Object.freeze({
    schemaVersion: 1,
    releaseId: descriptor.release_id,
    version: descriptor.version,
    releaseRoot,
    applicationRoot,
    manifestPath,
    storageRoot,
    storageBinding,
    runnerHelper,
    runnerHelperProfile: descriptor.runner_helper_profile,
    runnerHelperProtocol: descriptor.runner_helper_protocol,
    portable,
    userDataPath,
  });
}

function validateDescriptor(descriptor, manifest) {
  if (!descriptor || descriptor.schema_version !== 1 || descriptor.release_id !== manifest.release_id ||
      descriptor.version !== manifest.version || descriptor.native_layout !== 'EXTERNAL_TO_APP_AND_ASAR' ||
      descriptor.storage_module_root !== '../native/storage' ||
      descriptor.storage_native_binding !== '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node' ||
      descriptor.runner_helper !== '../native/runner/spike02_helper.exe' ||
      descriptor.runner_helper_profile !== 'D-013-v25-a9-trusted-shell-current-user' ||
      descriptor.runner_helper_protocol !== 2 ||
      descriptor.data_root !== '%LOCALAPPDATA%\\Win7CodingAgent\\a9' || descriptor.portable_flag !== '--portable') {
    throw new Error('A9_PACKAGE_RUNTIME_CONFIG_INVALID');
  }
  if (!manifest || manifest.schema_version !== 1 || manifest.status !== 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS' ||
      manifest.version !== '0.3.0-alpha.1' || !manifest.required_native || !Array.isArray(manifest.files) ||
      manifest.required_native.runner_helper_profile !== descriptor.runner_helper_profile ||
      manifest.required_native.runner_helper_protocol !== descriptor.runner_helper_protocol ||
      manifest.gates?.win10 !== 'NOT_PERFORMED' || manifest.gates?.win7 !== 'NOT_PERFORMED') {
    throw new Error('A9_PACKAGE_RELEASE_MANIFEST_INVALID');
  }
}

function resolveReleasePath(root, relativePath, releaseRoot) {
  const resolved = fs.realpathSync(path.resolve(root, relativePath));
  const relative = path.relative(releaseRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`A9_PACKAGE_PATH_ESCAPE:${relativePath}`);
  }
  return resolved;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label}_UNREADABLE:${error && error.message ? error.message : String(error)}`);
  }
}

function assertHash(label, filePath, expected) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expected || '') || actual !== expected) throw new Error(`${label}_SHA256_MISMATCH`);
}

module.exports = { loadA9PackageRuntime };
