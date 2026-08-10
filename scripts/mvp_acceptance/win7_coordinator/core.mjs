import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LEASE_STATES = Object.freeze([
  'REQUESTED', 'GRANTED', 'RUNNING', 'RETURNED', 'RELEASED', 'RECOVERY_REQUIRED',
]);

const ACTIVE_STATES = new Set(['GRANTED', 'RUNNING', 'RECOVERY_REQUIRED']);
const SHA256_RE = /^[a-f0-9]{64}$/;
const COMMIT_RE = /^[a-f0-9]{40}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class CoordinatorError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'CoordinatorError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new CoordinatorError(code, message, details);
}

function requireString(value, name, pattern) {
  if (typeof value !== 'string' || value.length === 0) fail('INVALID_INPUT', `${name} must be a non-empty string`);
  if (pattern && !pattern.test(value)) fail('INVALID_INPUT', `${name} has invalid format`);
  return value;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = sortValue(value[key]);
  return sorted;
}

export function canonicalJson(value) {
  return `${JSON.stringify(sortValue(value))}\n`;
}

export function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function atomicWrite(filename, data, mode = 0o644) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temporary, data, { mode, flag: 'wx' });
  fs.renameSync(temporary, filename);
}

export function initializeKeyPair(privateKeyPath, publicKeyPath) {
  if (fs.existsSync(privateKeyPath) || fs.existsSync(publicKeyPath)) {
    fail('KEY_EXISTS', 'key initialization refuses to overwrite an existing private or public key');
  }
  const pair = crypto.generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  atomicWrite(privateKeyPath, privatePem, 0o600);
  atomicWrite(publicKeyPath, publicPem, 0o644);
  return { publicKeySha256: sha256Bytes(publicPem) };
}

function validateTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) fail('INVALID_INPUT', 'target is required');
  requireString(target.ip, 'target.ip');
  if (target.port !== 22) fail('INVALID_INPUT', 'target.port must be 22');
  requireString(target.hostname, 'target.hostname', ID_RE);
  if (target.os_build !== '7601' || target.arch !== 'x64') {
    fail('INVALID_INPUT', 'target must be Win7 SP1 x64 build 7601');
  }
  return { ip: target.ip, port: 22, hostname: target.hostname, os_build: '7601', arch: 'x64' };
}

function validateScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) fail('INVALID_INPUT', 'scope is required');
  requireString(scope.suite, 'scope.suite', ID_RE);
  requireString(scope.profile, 'scope.profile', ID_RE);
  if (!Array.isArray(scope.cases) || scope.cases.length === 0) fail('INVALID_INPUT', 'scope.cases must be non-empty');
  const cases = scope.cases.map((item) => requireString(item, 'scope case', ID_RE));
  if (new Set(cases).size !== cases.length) fail('INVALID_INPUT', 'scope.cases contains duplicates');
  const required = scope.required_pass_cases ?? cases;
  if (!Array.isArray(required) || required.some((item) => !cases.includes(item))) {
    fail('INVALID_INPUT', 'scope.required_pass_cases must be a subset of scope.cases');
  }
  return { ...scope, cases, required_pass_cases: [...required] };
}

function validateArtifactHashes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
    fail('INVALID_INPUT', 'artifact_hashes must contain at least one locked artifact');
  }
  const result = {};
  for (const [name, hash] of Object.entries(value)) {
    requireString(name, 'artifact name');
    result[name] = requireString(hash, `artifact_hashes.${name}`, SHA256_RE);
  }
  return result;
}

export function createLeaseRequest(spec, now = new Date()) {
  const requestedAt = now.toISOString();
  const expiresAt = new Date(spec.expires_at_utc);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) fail('INVALID_INPUT', 'expires_at_utc must be in the future');
  return {
    schema_version: 1,
    lease_id: requireString(spec.lease_id, 'lease_id', ID_RE),
    run_id: requireString(spec.run_id, 'run_id', ID_RE),
    nonce: requireString(spec.nonce ?? crypto.randomBytes(16).toString('hex'), 'nonce', ID_RE),
    state: 'REQUESTED',
    requested_at_utc: requestedAt,
    expires_at_utc: expiresAt.toISOString(),
    source_commit: requireString(spec.source_commit, 'source_commit', COMMIT_RE),
    package_manifest_sha256: requireString(spec.package_manifest_sha256, 'package_manifest_sha256', SHA256_RE),
    target: validateTarget(spec.target),
    scope: validateScope(spec.scope),
    artifact_hashes: validateArtifactHashes(spec.artifact_hashes),
  };
}

export function grantLease(request, privateKeyPem, now = new Date()) {
  if (request?.state !== 'REQUESTED') fail('INVALID_TRANSITION', 'only REQUESTED leases may be granted');
  const expiresAt = Date.parse(request.expires_at_utc);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) fail('LEASE_EXPIRED', 'lease request has expired');
  const lease = { ...request, state: 'GRANTED', issued_at_utc: now.toISOString() };
  const raw = Buffer.from(canonicalJson(lease), 'utf8');
  const signature = crypto.sign(null, raw, privateKeyPem);
  return { lease, raw, signature, rawSha256: sha256Bytes(raw) };
}

export function verifyLeaseBundle(raw, signature, publicKeyPem, expected = {}) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (!crypto.verify(null, bytes, publicKeyPem, signature)) fail('LEASE_SIGNATURE_INVALID', 'Ed25519 signature mismatch');
  let lease;
  try { lease = JSON.parse(bytes.toString('utf8')); } catch (error) { fail('LEASE_JSON_INVALID', error.message); }
  if (canonicalJson(lease) !== bytes.toString('utf8')) fail('LEASE_NOT_CANONICAL', 'signed lease bytes are not canonical JSON');
  if (lease.schema_version !== 1 || lease.state !== 'GRANTED') fail('LEASE_INVALID', 'signed lease must be schema 1 and GRANTED');
  validateTarget(lease.target);
  validateScope(lease.scope);
  validateArtifactHashes(lease.artifact_hashes);
  requireString(lease.source_commit, 'source_commit', COMMIT_RE);
  requireString(lease.package_manifest_sha256, 'package_manifest_sha256', SHA256_RE);
  if (Date.parse(lease.expires_at_utc) <= (expected.nowMs ?? Date.now())) fail('LEASE_EXPIRED', 'signed lease is expired');
  const checks = [
    ['source_commit', expected.sourceCommit],
    ['package_manifest_sha256', expected.packageManifestSha256],
  ];
  for (const [field, wanted] of checks) if (wanted && lease[field] !== wanted) fail('LEASE_BINDING_MISMATCH', `${field} mismatch`);
  if (expected.targetIp && lease.target.ip !== expected.targetIp) fail('LEASE_BINDING_MISMATCH', 'target.ip mismatch');
  if (expected.suite && lease.scope.suite !== expected.suite) fail('LEASE_BINDING_MISMATCH', 'scope.suite mismatch');
  return lease;
}

export function loadState(filename) {
  if (!fs.existsSync(filename)) return { schema_version: 1, revision: 0, active_lease_id: null, leases: {} };
  const state = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (state.schema_version !== 1 || !state.leases || typeof state.leases !== 'object') fail('STATE_INVALID', 'coordinator state is invalid');
  return state;
}

function saveState(filename, state) {
  const next = { ...state, revision: state.revision + 1, updated_at_utc: new Date().toISOString() };
  atomicWrite(filename, canonicalJson(next));
  return next;
}

export function registerGrantedLease(filename, lease) {
  const state = loadState(filename);
  const active = state.active_lease_id && state.leases[state.active_lease_id];
  if (active && ACTIVE_STATES.has(active.state)) fail('ACTIVE_LEASE_EXISTS', `active lease ${active.lease_id} is ${active.state}`);
  if (state.leases[lease.lease_id]) fail('LEASE_REPLAYED', `lease ${lease.lease_id} already exists`);
  const record = { lease_id: lease.lease_id, state: 'GRANTED', suite: lease.scope.suite, target: lease.target, history: [{ state: 'GRANTED', at_utc: new Date().toISOString() }] };
  return saveState(filename, { ...state, active_lease_id: lease.lease_id, leases: { ...state.leases, [lease.lease_id]: record } });
}

function transition(filename, leaseId, from, to, detail = undefined) {
  const state = loadState(filename);
  const record = state.leases[leaseId];
  if (!record || !from.includes(record.state)) fail('INVALID_TRANSITION', `${leaseId} cannot transition from ${record?.state ?? 'MISSING'} to ${to}`);
  const updated = { ...record, state: to, ...(detail ? { detail } : {}), history: [...record.history, { state: to, at_utc: new Date().toISOString(), ...(detail ? { detail } : {}) }] };
  const activeLeaseId = to === 'RELEASED' ? null : leaseId;
  return saveState(filename, { ...state, active_lease_id: activeLeaseId, leases: { ...state.leases, [leaseId]: updated } });
}

export function evaluateFlightSnapshot(kind, snapshot, lease) {
  const failures = [];
  if (snapshot?.service?.name !== 'BvSshServer' || snapshot.service.state !== 'RUNNING') failures.push('BvSshServer is not RUNNING');
  if (snapshot?.ssh?.port !== 22 || snapshot.ssh.reachable !== true) failures.push('SSH port 22 is not reachable');
  if (snapshot?.target?.ip !== lease.target.ip || String(snapshot?.target?.os_build) !== '7601' || snapshot?.target?.arch !== 'x64') failures.push('observed target does not match signed lease');
  if (!Array.isArray(snapshot?.residues)) failures.push('residue inventory is missing');
  else if (snapshot.residues.length > 0) failures.push(`residue inventory is not empty (${snapshot.residues.length})`);
  if (kind === 'postflight') {
    const observed = snapshot?.artifact_hashes ?? {};
    for (const [name, hash] of Object.entries(lease.artifact_hashes)) {
      if (observed[name] !== hash) failures.push(`returned artifact hash mismatch: ${name}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function startLease(filename, lease, preflight) {
  const check = evaluateFlightSnapshot('preflight', preflight, lease);
  if (!check.ok) fail('PREFLIGHT_BLOCKED', 'preflight failed', check.failures);
  return transition(filename, lease.lease_id, ['GRANTED'], 'RUNNING', { preflight_sha256: sha256Bytes(canonicalJson(preflight)) });
}

export function returnLease(filename, lease, postflight) {
  const check = evaluateFlightSnapshot('postflight', postflight, lease);
  if (!check.ok) return transition(filename, lease.lease_id, ['RUNNING'], 'RECOVERY_REQUIRED', { failures: check.failures });
  return transition(filename, lease.lease_id, ['RUNNING'], 'RETURNED', { postflight_sha256: sha256Bytes(canonicalJson(postflight)) });
}

export function releaseLease(filename, leaseId) {
  return transition(filename, leaseId, ['RETURNED'], 'RELEASED');
}

export function recoverLease(filename, lease, cleanSnapshot) {
  const check = evaluateFlightSnapshot('postflight', cleanSnapshot, lease);
  if (!check.ok) fail('RECOVERY_STILL_REQUIRED', 'recovery snapshot is not clean', check.failures);
  return transition(filename, lease.lease_id, ['RECOVERY_REQUIRED'], 'RETURNED', { recovery_snapshot_sha256: sha256Bytes(canonicalJson(cleanSnapshot)) });
}

export function gradeCandidateEvidence(lease, evidence, coordinatorState) {
  if (evidence?.evidence_grade !== 'CANDIDATE_EVIDENCE') return { grade: 'DEVELOPMENT', reason: 'worker did not produce candidate evidence' };
  const lifecycle = coordinatorState?.leases?.[lease.lease_id];
  if (!lifecycle || !['RETURNED', 'RELEASED'].includes(lifecycle.state)) {
    return { grade: 'CANDIDATE_EVIDENCE', reason: 'coordinator lifecycle has not completed clean postflight' };
  }
  if (evidence.lease_id !== lease.lease_id || evidence.source_commit !== lease.source_commit || evidence.package_manifest_sha256 !== lease.package_manifest_sha256) {
    return { grade: 'CANDIDATE_EVIDENCE', reason: 'evidence binding mismatch' };
  }
  const cases = new Map((evidence.cases ?? []).map((item) => [item.id, item.status]));
  const failures = lease.scope.required_pass_cases.filter((id) => cases.get(id) !== 'PASS');
  return failures.length === 0 ? { grade: 'WIN7_PASS', reason: 'all signed required cases passed' } : { grade: 'CANDIDATE_EVIDENCE', reason: 'required cases not passed', failures };
}
