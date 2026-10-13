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

const STREAMING_PROFILE = 'D-013-v26-a9-trusted-shell-current-user';
const MANAGED_PROFILE = 'D-013-v26-managed-a9-trusted-shell-current-user';
const A9_32_LOCK_ID = 'A9-32-DEVELOPER-INPUTS-D013-V26-MANAGED';
const BATCH2_LOCK_ID = 'A9-BATCH2-INPUTS-D013-V26-MANAGED';
const HISTORICAL_STATUS = 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS';

/**
 * Select the manifest contract for a descriptor.
 *
 * v25/protocol 2 keeps its historical contract. Protocol 3 is a developer package unless the
 * descriptor names the formal batch-2 lock. Developer descriptors never carry a candidate, and
 * A9-30/A9-31 descriptors never carry a lock identity, so a stamped package cannot pass as an
 * earlier developer package. A formal batch-2 package must use the managed helper profile.
 */
function manifestContract(descriptor) {
  if (descriptor.runner_helper_protocol !== 3) {
    return { kind: 'HISTORICAL', status: HISTORICAL_STATUS };
  }
  const managed = descriptor.runner_helper_profile === MANAGED_PROFILE;
  const lockId = descriptor.lock_id;
  const hasCandidate = Object.prototype.hasOwnProperty.call(descriptor, 'candidate');
  if (lockId === undefined) {
    if (hasCandidate) throw new Error('A9_PACKAGE_RUNTIME_CONFIG_INVALID');
    return { kind: 'DEVELOPER', status: managed ? 'A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE' : 'A9_30_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE', lockId: undefined };
  }
  if (!managed || (lockId !== A9_32_LOCK_ID && lockId !== BATCH2_LOCK_ID)) throw new Error('A9_PACKAGE_RUNTIME_CONFIG_INVALID');
  if (lockId === A9_32_LOCK_ID) {
    if (hasCandidate) throw new Error('A9_PACKAGE_RUNTIME_CONFIG_INVALID');
    return { kind: 'DEVELOPER', status: 'A9_32_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE', lockId };
  }
  if (!/^WIN7-[0-9]{2}$/.test(String(descriptor.candidate || ''))) throw new Error('A9_PACKAGE_RUNTIME_CONFIG_INVALID');
  return { kind: 'FORMAL_BATCH2', status: HISTORICAL_STATUS, lockId, candidate: descriptor.candidate };
}

function validateDescriptor(descriptor, manifest) {
  if (!descriptor || descriptor.schema_version !== 1 || descriptor.release_id !== manifest.release_id ||
      descriptor.version !== manifest.version || descriptor.native_layout !== 'EXTERNAL_TO_APP_AND_ASAR' ||
      descriptor.storage_module_root !== '../native/storage' ||
      descriptor.storage_native_binding !== '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node' ||
      descriptor.runner_helper !== '../native/runner/spike02_helper.exe' ||
      !((descriptor.runner_helper_profile === 'D-013-v25-a9-trusted-shell-current-user' && descriptor.runner_helper_protocol === 2 && descriptor.version === '0.3.0-alpha.1') ||
        ([STREAMING_PROFILE, MANAGED_PROFILE].includes(descriptor.runner_helper_profile) && descriptor.runner_helper_protocol === 3 && descriptor.version === '0.3.0-alpha.2')) ||
      descriptor.data_root !== '%LOCALAPPDATA%\\Win7CodingAgent\\a9' || descriptor.portable_flag !== '--portable') {
    throw new Error('A9_PACKAGE_RUNTIME_CONFIG_INVALID');
  }
  const contract = manifestContract(descriptor);
  const streaming = descriptor.runner_helper_protocol === 3;
  if (!manifest || manifest.schema_version !== 1 || manifest.status !== contract.status ||
      !['0.3.0-alpha.1', '0.3.0-alpha.2'].includes(manifest.version) || !manifest.required_native || !Array.isArray(manifest.files) ||
      manifest.required_native.runner_helper_profile !== descriptor.runner_helper_profile ||
      manifest.required_native.runner_helper_protocol !== descriptor.runner_helper_protocol ||
      manifest.gates?.win10 !== 'NOT_PERFORMED' || manifest.gates?.win7 !== 'NOT_PERFORMED' ||
      !manifestIdentityMatches(contract, manifest, streaming)) {
    throw new Error('A9_PACKAGE_RELEASE_MANIFEST_INVALID');
  }
}

function manifestIdentityMatches(contract, manifest, streaming) {
  const has = (key) => Object.prototype.hasOwnProperty.call(manifest, key);
  if (!streaming) return true;
  if (contract.kind === 'DEVELOPER') {
    // 开发包：无 authority、不可作外部验收；A9-30/31 manifest 不带锁身份，A9-32 带自身锁身份且不带候选。
    return manifest.external_acceptance_eligible === false && !has('release_authority') && !has('candidate') &&
      (contract.lockId === undefined ? !has('lock_id') : manifest.lock_id === contract.lockId);
  }
  // 正式 batch2：锁身份、候选号一致，并携带候选内 authority 绑定；是否外部验收合格由干净源码决定。
  const authority = manifest.release_authority;
  return manifest.lock_id === contract.lockId && manifest.candidate === contract.candidate &&
    typeof manifest.candidate_tentative === 'boolean' && typeof manifest.external_acceptance_eligible === 'boolean' &&
    Boolean(authority) && /^[a-f0-9]{64}$/.test(authority.formal_input_lock_sha256 || '') &&
    /^[a-f0-9]{40}$/.test(authority.approval_registry_commit || '') && /^[a-f0-9]{64}$/.test(authority.approval_registry_sha256 || '');
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
