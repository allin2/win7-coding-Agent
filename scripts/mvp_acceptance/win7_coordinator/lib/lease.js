'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  COMMIT_RE,
  PROFILE_ID,
  SAFE_ID_RE,
  SHA256_RE,
  STANDARD_CASES,
  STANDARD_PARAMETERS,
  SUITE_ID,
  ensureDir,
  fail,
  randomId,
  readJson,
  requirePattern,
  writeJson,
} = require('./common');

const ACTIVE_STATES = new Set(['GRANTED', 'RUNNING', 'RETURNED', 'RECOVERY_REQUIRED']);

function defaultStateFile(keyFile) {
  return path.join(path.dirname(keyFile), 'lease-state.json');
}

function checkPrivateKeyPermissions(keyFile) {
  const parentMode = fs.statSync(path.dirname(keyFile)).mode & 0o777;
  const keyMode = fs.statSync(keyFile).mode & 0o777;
  if (parentMode !== 0o700) fail('signing-key directory must have mode 0700', 'KEY_PERMISSION_INVALID');
  if (keyMode !== 0o600) fail('signing key must have mode 0600', 'KEY_PERMISSION_INVALID');
}

function loadLedger(stateFile) {
  if (!fs.existsSync(stateFile)) return { schema_version: 1, leases: [] };
  const ledger = readJson(stateFile);
  if (ledger.schema_version !== 1 || !Array.isArray(ledger.leases)) {
    fail('lease state ledger is invalid', 'STATE_INVALID');
  }
  return ledger;
}

function saveLedger(stateFile, ledger) {
  ensureDir(path.dirname(stateFile));
  writeJson(stateFile, ledger);
  fs.chmodSync(stateFile, 0o600);
}

function activeLease(ledger) {
  return ledger.leases.find((entry) => ACTIVE_STATES.has(entry.state));
}

function createLease(options) {
  const keyFile = options.keyFile || process.env.WIN7_ACCEPTANCE_SIGNING_KEY_FILE;
  if (!keyFile) fail('WIN7_ACCEPTANCE_SIGNING_KEY_FILE is required', 'KEY_MISSING');
  checkPrivateKeyPermissions(keyFile);
  const stateFile = options.stateFile || defaultStateFile(keyFile);
  const ledger = loadLedger(stateFile);
  const active = activeLease(ledger);
  if (active) fail('active lease already exists: ' + active.lease_id + ' (' + active.state + ')', 'LEASE_CONFLICT');

  const sourceCommit = requirePattern(options.sourceCommit, 'source commit', COMMIT_RE);
  const manifestSha = requirePattern(options.packageManifestSha256, 'package manifest SHA-256', SHA256_RE);
  const runId = requirePattern(options.runId, 'run ID', SAFE_ID_RE);
  const now = options.now ? new Date(options.now) : new Date();
  const ttlMinutes = Number(options.ttlMinutes || 240);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 10 || ttlMinutes > 1440) {
    fail('lease TTL must be between 10 and 1440 minutes', 'INVALID_ARGUMENT');
  }
  const expires = new Date(now.getTime() + ttlMinutes * 60000);
  const lease = {
    schema_version: 1,
    lease_id: 'lease-' + randomId(18),
    run_id: runId,
    nonce: randomId(24),
    state: 'GRANTED',
    issued_at_utc: now.toISOString(),
    expires_at_utc: expires.toISOString(),
    source_commit: sourceCommit,
    package_manifest_sha256: manifestSha,
    target: {
      ip: options.ip || '192.168.1.11',
      port: 22,
      hostname: options.hostname || 'dccs-chaizl-PC',
      os_build: '7601',
      arch: 'x64',
    },
    scope: {
      suite: SUITE_ID,
      profile: PROFILE_ID,
      cases: STANDARD_CASES.slice(),
      standard_parameters: Object.assign({}, STANDARD_PARAMETERS, { s03_scales: STANDARD_PARAMETERS.s03_scales.slice() }),
    },
  };
  const raw = Buffer.from(JSON.stringify(lease, null, 2) + '\n', 'utf8');
  const privateKey = fs.readFileSync(keyFile);
  const signature = crypto.sign(null, raw, privateKey);
  const leaseFile = options.leaseFile;
  if (!leaseFile) fail('lease output file is required', 'INVALID_ARGUMENT');
  ensureDir(path.dirname(leaseFile));
  fs.writeFileSync(leaseFile, raw);
  fs.writeFileSync(options.signatureFile || leaseFile + '.sig', signature);
  ledger.leases.push({
    lease_id: lease.lease_id,
    run_id: lease.run_id,
    state: 'GRANTED',
    lease_file: path.resolve(leaseFile),
    source_commit: sourceCommit,
    package_manifest_sha256: manifestSha,
    updated_at_utc: now.toISOString(),
  });
  saveLedger(stateFile, ledger);
  return { lease, leaseFile, signatureFile: options.signatureFile || leaseFile + '.sig', stateFile };
}

const TRANSITIONS = {
  GRANTED: new Set(['RUNNING', 'RELEASED']),
  RUNNING: new Set(['RETURNED', 'RECOVERY_REQUIRED']),
  RETURNED: new Set(['RELEASED', 'RECOVERY_REQUIRED']),
  RECOVERY_REQUIRED: new Set(['RELEASED']),
};

function transitionLease(options) {
  const ledger = loadLedger(options.stateFile);
  const entry = ledger.leases.find((item) => item.lease_id === options.leaseId);
  if (!entry) fail('lease not present in state ledger', 'LEASE_NOT_FOUND');
  const allowed = TRANSITIONS[entry.state];
  if (!allowed || !allowed.has(options.toState)) {
    fail('invalid lease transition ' + entry.state + ' -> ' + options.toState, 'STATE_TRANSITION_INVALID');
  }
  entry.state = options.toState;
  entry.updated_at_utc = new Date().toISOString();
  if (options.note) entry.note = options.note;
  saveLedger(options.stateFile, ledger);
  return entry;
}

function verifyLeaseFiles(leaseFile, signatureFile, publicKeyFile) {
  const raw = fs.readFileSync(leaseFile);
  const signature = fs.readFileSync(signatureFile || leaseFile + '.sig');
  const publicKey = fs.readFileSync(publicKeyFile);
  if (!crypto.verify(null, raw, publicKey, signature)) fail('lease signature mismatch', 'LEASE_SIGNATURE_INVALID');
  const lease = JSON.parse(raw.toString('utf8'));
  if (lease.schema_version !== 1 || lease.state !== 'GRANTED') fail('lease schema/state invalid', 'LEASE_INVALID');
  if (Date.parse(lease.expires_at_utc) <= Date.now()) fail('lease expired', 'LEASE_EXPIRED');
  return lease;
}

module.exports = {
  checkPrivateKeyPermissions,
  createLease,
  defaultStateFile,
  loadLedger,
  transitionLease,
  verifyLeaseFiles,
};
