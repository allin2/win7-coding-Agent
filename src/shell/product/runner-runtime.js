'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function createProductRunner(options) {
  const config = options || {};
  const runnerModule = config.runnerModule;
  if (!runnerModule) throw new Error('RUNNER_MODULE_REQUIRED');
  const manifestPath = fs.realpathSync(config.manifestPath);
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifestHash = digest(manifestBytes);
  if (!/^[a-f0-9]{64}$/.test(config.expectedManifestSha256 || '') || manifestHash !== config.expectedManifestSha256) {
    throw new Error('RUNNER_MANIFEST_HASH_MISMATCH');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!manifest || manifest.schema_version !== 1 || !manifest.helper || !Array.isArray(manifest.profiles)) {
    throw new Error('RUNNER_MANIFEST_SCHEMA_INVALID');
  }
  const releaseRoot = path.dirname(manifestPath);
  const helperPath = resolveReleaseFile(releaseRoot, manifest.helper.path);
  if (digest(fs.readFileSync(helperPath)) !== manifest.helper.sha256) throw new Error('RUNNER_HELPER_HASH_MISMATCH');
  const profiles = manifest.profiles.map((profile) => ({
    id: profile.id,
    executablePath: profile.executable_path,
    sha256: profile.sha256,
    risk: profile.risk,
    outputEncoding: profile.output_encoding || 'auto',
    workingDirectoryRoots: profile.working_directory_roots,
    validateArgs: compileArgPolicy(profile.argv_policy),
    ...(profile.acl_policy ? { aclPolicy: {
      acceptanceRoot: profile.acl_policy.acceptance_root,
      perRunRoot: profile.acl_policy.per_run_root,
      applyLowIntegrityToWorkDir: profile.acl_policy.apply_low_integrity_to_work_dir === true,
    } } : {}),
  }));
  const registry = new runnerModule.ExecutableProfileRegistry(profiles);
  return {
    runner: new runnerModule.NativeRunner({
      registry,
      transport: new runnerModule.StdioHelperTransport(helperPath),
    }),
    acceptanceAction: normalizeAcceptanceAction(manifest.acceptance_action, profiles),
    manifestSha256: manifestHash,
    helperSha256: manifest.helper.sha256,
  };
}

function resolveReleaseFile(releaseRoot, relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) throw new Error('RUNNER_HELPER_PATH_INVALID');
  const resolved = fs.realpathSync(path.join(releaseRoot, relativePath));
  const relative = path.relative(fs.realpathSync(releaseRoot), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('RUNNER_HELPER_PATH_INVALID');
  return resolved;
}

function compileArgPolicy(policy) {
  if (!policy || !Array.isArray(policy.exact)) return () => false;
  const exact = policy.exact.map((args) => Array.isArray(args) ? args.map(String) : null);
  if (exact.some((args) => !args)) throw new Error('RUNNER_ARG_POLICY_INVALID');
  return (received) => exact.some((allowed) => allowed.length === received.length && allowed.every((value, index) => value === received[index]));
}

function normalizeAcceptanceAction(action, profiles) {
  if (!action || typeof action.profile_id !== 'string' || !Array.isArray(action.args)) throw new Error('RUNNER_ACCEPTANCE_ACTION_INVALID');
  if (!profiles.some((profile) => profile.id === action.profile_id)) throw new Error('RUNNER_ACCEPTANCE_PROFILE_UNKNOWN');
  return Object.freeze({
    profileId: action.profile_id,
    args: action.args.map(String),
    timeoutMs: bounded(action.timeout_ms, 15_000, 1_000, 300_000),
    idleTimeoutMs: bounded(action.idle_timeout_ms, 5_000, 500, 300_000),
    maxStdoutBytes: bounded(action.max_stdout_bytes, 64 * 1024, 0, 4 * 1024 * 1024),
    maxStderrBytes: bounded(action.max_stderr_bytes, 64 * 1024, 0, 4 * 1024 * 1024),
  });
}

function bounded(value, fallback, min, max) {
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

module.exports = { createProductRunner };
