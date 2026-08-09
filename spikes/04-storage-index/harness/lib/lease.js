'use strict';

/**
 * SPIKE_04 candidate-evidence lease verification.
 *
 * The coordinator signs the exact UTF-8 bytes of the lease JSON with Ed25519.
 * The worker can only emit CANDIDATE_EVIDENCE after verifying the signature and
 * binding the invocation to the signed commit, package manifest, target and
 * standard SSD acceptance parameters. Formal WIN7_PASS remains coordinator-only.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROFILE_ID = 'E22-SQLITE343-LOCAL-SSD';
const SUITE_ID = 'SPIKE_04';
const SHA256_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CASE_RE = /^(?:S0[1-8]|F|P)$/;

function fail(message) {
  const error = new Error('LEASE_INVALID: ' + message);
  error.code = 'LEASE_INVALID';
  throw error;
}

function requireString(value, name, pattern) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(name + ' must be a non-empty string');
  }
  if (pattern && !pattern.test(value)) {
    fail(name + ' has invalid format');
  }
  return value;
}

function requireNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(name + ' must be a finite number');
  }
  return value;
}

function normalizeHostname(value) {
  return String(value || '').trim().toLowerCase();
}

function readLeaseBundle(options) {
  const leasePath = options.leasePath;
  const signaturePath = options.signaturePath || (leasePath ? leasePath + '.sig' : null);
  const publicKeyPath = options.publicKeyPath || path.join(__dirname, '..', 'keys', 'coordinator-ed25519-public.pem');
  if (!leasePath) fail('--lease is required for candidate evidence');
  if (!signaturePath) fail('--lease-signature is required for candidate evidence');

  let raw;
  let signature;
  let publicKey;
  try {
    raw = fs.readFileSync(leasePath);
    signature = fs.readFileSync(signaturePath);
    publicKey = fs.readFileSync(publicKeyPath);
  } catch (error) {
    fail('cannot read lease bundle: ' + error.message);
  }

  let lease;
  try {
    lease = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    fail('lease JSON is invalid: ' + error.message);
  }

  let verified = false;
  try {
    verified = crypto.verify(null, raw, publicKey, signature);
  } catch (error) {
    fail('signature verification error: ' + error.message);
  }
  if (!verified) fail('Ed25519 signature mismatch');
  return { lease, raw, signaturePath, publicKeyPath };
}

function validateLeaseShape(lease, nowMs) {
  if (!lease || typeof lease !== 'object' || Array.isArray(lease)) fail('lease must be an object');
  if (lease.schema_version !== 1) fail('schema_version must be 1');
  requireString(lease.lease_id, 'lease_id', ID_RE);
  requireString(lease.run_id, 'run_id', ID_RE);
  requireString(lease.nonce, 'nonce', ID_RE);
  if (lease.state !== 'GRANTED') fail('state must be GRANTED');
  requireString(lease.source_commit, 'source_commit', COMMIT_RE);
  requireString(lease.package_manifest_sha256, 'package_manifest_sha256', SHA256_RE);

  const issuedMs = Date.parse(requireString(lease.issued_at_utc, 'issued_at_utc'));
  const expiresMs = Date.parse(requireString(lease.expires_at_utc, 'expires_at_utc'));
  if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs)) fail('lease timestamps must be ISO-8601');
  if (expiresMs <= issuedMs) fail('expires_at_utc must be after issued_at_utc');
  const clock = nowMs === undefined ? Date.now() : nowMs;
  if (issuedMs > clock + 5 * 60 * 1000) fail('lease is not yet valid');
  if (expiresMs <= clock) fail('lease is expired');

  const target = lease.target;
  if (!target || typeof target !== 'object') fail('target is required');
  requireString(target.ip, 'target.ip');
  requireNumber(target.port, 'target.port');
  if (target.port !== 22) fail('target.port must be 22');
  requireString(target.hostname, 'target.hostname', ID_RE);
  if (target.os_build !== '7601') fail('target.os_build must be 7601');
  if (target.arch !== 'x64') fail('target.arch must be x64');

  const scope = lease.scope;
  if (!scope || typeof scope !== 'object') fail('scope is required');
  if (scope.suite !== SUITE_ID) fail('scope.suite must be ' + SUITE_ID);
  if (scope.profile !== PROFILE_ID) fail('scope.profile must be ' + PROFILE_ID);
  if (!Array.isArray(scope.cases) || scope.cases.length === 0) fail('scope.cases must be non-empty');
  const uniqueCases = new Set();
  for (const caseId of scope.cases) {
    if (typeof caseId !== 'string' || !CASE_RE.test(caseId)) fail('scope contains invalid case: ' + caseId);
    if (uniqueCases.has(caseId)) fail('scope contains duplicate case: ' + caseId);
    uniqueCases.add(caseId);
  }

  const params = scope.standard_parameters;
  if (!params || typeof params !== 'object') fail('scope.standard_parameters is required');
  if (params.s01_duration_ms !== 60000) fail('s01_duration_ms must be 60000');
  if (JSON.stringify(params.s03_scales) !== JSON.stringify(['3k', '10k', '30k'])) {
    fail('s03_scales must be [3k,10k,30k]');
  }
  if (params.s05_scale !== '30k' || params.s05_reps !== 100) {
    fail('S05 standard parameters must be scale=30k and reps=100');
  }
  if (params.s06_limit_mb !== 512 || params.s06_target_mb !== 256) {
    fail('S06 standard parameters must be limit=512MB and target=256MB');
  }
  return lease;
}

function validateInvocation(lease, options) {
  const sourceCommit = requireString(options.sourceCommit, '--source-commit', COMMIT_RE);
  const manifestSha = requireString(options.packageManifestSha256, '--package-manifest-sha256', SHA256_RE);
  if (lease.source_commit !== sourceCommit) fail('source commit mismatch');
  if (lease.package_manifest_sha256 !== manifestSha) fail('package manifest SHA-256 mismatch');

  const observedHostname = normalizeHostname(options.observedHostname || os.hostname());
  if (normalizeHostname(lease.target.hostname) !== observedHostname) {
    fail('target hostname mismatch: expected ' + lease.target.hostname + ', observed ' + observedHostname);
  }
  if (options.media !== 'ssd') fail('candidate evidence requires --media ssd');

  const wanted = options.cases;
  const allowed = new Set(lease.scope.cases);
  for (const caseId of wanted) {
    if (!allowed.has(caseId)) fail('case outside signed scope: ' + caseId);
  }

  const params = lease.scope.standard_parameters;
  if (wanted.includes('S01') && options.durationMs !== params.s01_duration_ms) {
    fail('S01 duration does not match signed standard parameters');
  }
  if (wanted.includes('S03') && !params.s03_scales.includes(options.scale)) {
    fail('S03 scale does not match signed standard parameters');
  }
  if (wanted.includes('S05') && (options.scale !== params.s05_scale || options.s05Reps !== params.s05_reps)) {
    fail('S05 invocation does not match signed standard parameters');
  }
  if (wanted.includes('S06') &&
      (options.s06LimitMb !== params.s06_limit_mb || options.s06TargetMb !== params.s06_target_mb)) {
    fail('S06 invocation does not match signed standard parameters');
  }

  return {
    grade: 'CANDIDATE_EVIDENCE',
    profile: lease.scope.profile,
    runId: lease.run_id,
    leaseId: lease.lease_id,
    sourceCommit: lease.source_commit,
    packageManifestSha256: lease.package_manifest_sha256,
    target: Object.assign({}, lease.target, { observed_hostname: options.observedHostname || os.hostname() }),
  };
}

function verifyCandidateLease(options) {
  const bundle = readLeaseBundle(options);
  const lease = validateLeaseShape(bundle.lease, options.nowMs);
  return validateInvocation(lease, options);
}

module.exports = {
  PROFILE_ID,
  SUITE_ID,
  validateLeaseShape,
  validateInvocation,
  verifyCandidateLease,
};
