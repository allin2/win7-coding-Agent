/* ADR-0065 lease primitives. Node.js standard library only. */
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ACTIVE_STATES = new Set(['GRANTED', 'RUNNING']);
const TRANSITIONS = new Map([
  ['REQUESTED', new Set(['GRANTED'])],
  ['GRANTED', new Set(['RUNNING'])],
  ['RUNNING', new Set(['RETURNED', 'RECOVERY_REQUIRED'])],
  ['RETURNED', new Set(['RELEASED'])],
]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function jsonBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

export function publicKeyId(publicKey) {
  const key = crypto.createPublicKey(publicKey);
  const der = key.export({ type: 'spki', format: 'der' });
  return `ed25519:${sha256Bytes(der)}`;
}

export function generateCoordinatorKeyPair(privateKeyPath, publicKeyPath, metadataPath) {
  if (fs.existsSync(privateKeyPath) || fs.existsSync(publicKeyPath) || fs.existsSync(metadataPath)) {
    throw new Error('refusing to overwrite an existing coordinator key');
  }
  fs.mkdirSync(path.dirname(privateKeyPath), { recursive: true });
  fs.mkdirSync(path.dirname(publicKeyPath), { recursive: true });
  const pair = crypto.generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  fs.writeFileSync(privateKeyPath, privatePem, { mode: 0o600 });
  fs.chmodSync(privateKeyPath, 0o600);
  fs.writeFileSync(publicKeyPath, publicPem, { mode: 0o644 });
  const metadata = {
    schema_version: 1,
    algorithm: 'Ed25519',
    key_id: publicKeyId(publicPem),
    private_key_location: 'GIT_EXTERNAL_COORDINATOR_STATE',
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o644 });
  return metadata;
}

export function buildArtifactManifest(repoRoot, profile) {
  const files = profile.upload_files.map((item) => {
    const absolute = path.join(repoRoot, item.local);
    const stat = fs.statSync(absolute);
    return {
      role: item.remote === 'spike02_helper.exe' ? 'helper' : 'upload_script',
      local: item.local,
      remote: item.remote,
      size: stat.size,
      sha256: sha256File(absolute),
    };
  });
  const inputLockPath = 'spikes/02-terminal-containment/helper/build-win10-kit/input-lock.json';
  const inputLock = path.join(repoRoot, inputLockPath);
  const inputStat = fs.statSync(inputLock);
  files.push({
    role: 'input_lock',
    local: inputLockPath,
    remote: null,
    size: inputStat.size,
    sha256: sha256File(inputLock),
  });
  return {
    schema_version: 1,
    profile_id: profile.profile_id,
    return_package: {
      filename: profile.win10_return_package.filename,
      sha256: profile.win10_return_package.sha256,
    },
    files,
  };
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function requireMatch(name, actual, expected) {
  if (!same(actual, expected)) throw new Error(`lease ${name} mismatch`);
}

export function validateLeasePayload(payload, expected = {}, nowMs = Date.now()) {
  if (!payload || payload.schema_version !== 1 || payload.kind !== 'WIN7_ACCEPTANCE_LEASE') {
    throw new Error('invalid lease schema or kind');
  }
  if (payload.algorithm !== 'Ed25519' || payload.state !== 'GRANTED') {
    throw new Error('lease is not an Ed25519 GRANTED lease');
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(payload.commit || '')) throw new Error('invalid lease commit');
  if (!/^[0-9a-f]{64}$/.test(payload.artifact_manifest_sha256 || '')) throw new Error('invalid manifest hash');
  if (!/^[0-9a-f]{64}$/.test(payload.nonce || '')) throw new Error('invalid lease nonce');
  const issued = Date.parse(payload.issued_at);
  const expires = Date.parse(payload.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > 2 * 60 * 60 * 1000) {
    throw new Error('invalid lease time window');
  }
  if (nowMs < issued - 5 * 60 * 1000 || nowMs >= expires) throw new Error('lease is not currently valid');
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== undefined) requireMatch(name, payload[name], expectedValue);
  }
  return payload;
}

export function signLeaseBytes(payloadBytes, privateKeyPath, keyId) {
  const privateMode = fs.statSync(privateKeyPath).mode & 0o777;
  if ((privateMode & 0o077) !== 0) throw new Error('coordinator private key permissions must be 0600');
  const signature = crypto.sign(null, payloadBytes, fs.readFileSync(privateKeyPath));
  return {
    schema_version: 1,
    algorithm: 'Ed25519',
    key_id: keyId,
    payload_sha256: sha256Bytes(payloadBytes),
    signature_base64: signature.toString('base64'),
  };
}

export function verifyLeaseBytes(payloadBytes, signatureRecord, publicKeyPath, expected = {}, nowMs = Date.now()) {
  if (!signatureRecord || signatureRecord.schema_version !== 1 || signatureRecord.algorithm !== 'Ed25519') {
    throw new Error('invalid lease signature record');
  }
  const publicPem = fs.readFileSync(publicKeyPath);
  const expectedKeyId = publicKeyId(publicPem);
  if (signatureRecord.key_id !== expectedKeyId) throw new Error('lease key id mismatch');
  if (signatureRecord.payload_sha256 !== sha256Bytes(payloadBytes)) throw new Error('lease payload hash mismatch');
  const signature = Buffer.from(signatureRecord.signature_base64 || '', 'base64');
  if (!crypto.verify(null, payloadBytes, publicPem, signature)) throw new Error('lease signature verification failed');
  let payload;
  try { payload = JSON.parse(payloadBytes.toString('utf8')); } catch { throw new Error('lease payload is not UTF-8 JSON'); }
  if (payload.key_id !== signatureRecord.key_id) throw new Error('lease payload key id mismatch');
  return validateLeasePayload(payload, expected, nowMs);
}

export function verifyLeaseFiles(payloadPath, signaturePath, publicKeyPath, expected = {}, nowMs = Date.now()) {
  return verifyLeaseBytes(
    fs.readFileSync(payloadPath),
    JSON.parse(fs.readFileSync(signaturePath, 'utf8')),
    publicKeyPath,
    expected,
    nowMs,
  );
}

function emptyLedger() {
  return { schema_version: 1, leases: [] };
}

export class LeaseLedger {
  constructor(file) {
    this.file = file;
    this.lock = `${file}.lock`;
  }

  read() {
    if (!fs.existsSync(this.file)) return emptyLedger();
    const ledger = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (ledger.schema_version !== 1 || !Array.isArray(ledger.leases)) throw new Error('invalid lease ledger');
    return ledger;
  }

  active(ledger = this.read()) {
    return ledger.leases.filter((lease) => ACTIVE_STATES.has(lease.state));
  }

  mutate(action) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const lockFd = fs.openSync(this.lock, 'wx', 0o600);
    try {
      const ledger = this.read();
      const result = action(ledger);
      const temporary = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, this.file);
      fs.chmodSync(this.file, 0o600);
      return result;
    } finally {
      fs.closeSync(lockFd);
      fs.unlinkSync(this.lock);
    }
  }

  request(entry) {
    return this.mutate((ledger) => {
      if (ledger.leases.some((lease) => lease.acceptance_id === entry.acceptance_id)) {
        throw new Error('acceptance id already exists in ledger');
      }
      ledger.leases.push({ ...entry, state: 'REQUESTED', history: [{ state: 'REQUESTED', at: entry.requested_at }] });
      return ledger.leases.at(-1);
    });
  }

  grant(acceptanceId, leasePayloadSha256, at) {
    return this.mutate((ledger) => {
      if (this.active(ledger).length !== 0) throw new Error('another GRANTED/RUNNING lease is active');
      const lease = ledger.leases.find((item) => item.acceptance_id === acceptanceId);
      if (!lease || lease.state !== 'REQUESTED') throw new Error('lease is not REQUESTED');
      lease.state = 'GRANTED';
      lease.lease_payload_sha256 = leasePayloadSha256;
      lease.history.push({ state: 'GRANTED', at });
      return lease;
    });
  }

  transition(acceptanceId, nextState, at) {
    return this.mutate((ledger) => {
      const lease = ledger.leases.find((item) => item.acceptance_id === acceptanceId);
      if (!lease) throw new Error('lease not found');
      if (!TRANSITIONS.get(lease.state)?.has(nextState)) throw new Error(`invalid lease transition ${lease.state} -> ${nextState}`);
      if (nextState === 'RUNNING' && this.active(ledger).some((item) => item.acceptance_id !== acceptanceId)) {
        throw new Error('another GRANTED/RUNNING lease is active');
      }
      lease.state = nextState;
      lease.history.push({ state: nextState, at });
      return lease;
    });
  }
}

export function gradeA4Candidate(report) {
  const required = ['REM-D01', 'REM-D02', 'REM-D03', 'REM-D04', 'REM-D05', 'REM-D06', 'REM-D07', 'REM-D08'];
  const stages = new Map((report.stages || []).map((stage) => [stage.id, stage]));
  const exactStages = required.length === stages.size && required.every((id) => stages.get(id)?.status === 'PASS');
  const uploads = stages.get('REM-D04')?.uploaded || [];
  const returns = stages.get('REM-D07')?.classification?.files || [];
  const transfersMatch = uploads.length === 3 && uploads.every((item) => /^[0-9a-f]{64}$/.test(item.local_sha256 || '')
    && item.local_sha256 === item.remote_sha256);
  const returnsMatch = returns.length === 9 && returns.every((item) => /^[0-9a-f]{64}$/.test(item.local_sha256 || '')
    && item.local_sha256 === item.remote_sha256);
  const classification = stages.get('REM-D07')?.classification;
  const completeCases = classification?.missing_case_ids?.length === 0
    && classification?.duplicate_case_ids?.length === 0
    && classification?.taskkill_used === false
    && classification?.harness_exit_code === 0;
  const safe = report.safety?.taskkill_used === false && report.safety?.management_channel_mutated === false
    && report.safety?.network_configuration_mutated === false && report.safety?.rebooted === false;
  if (report.result?.automatic_status === 'D013_CANDIDATE_EVIDENCE' && report.result?.classification === 'CANDIDATE_EVIDENCE'
      && exactStages && transfersMatch && returnsMatch && completeCases && safe) {
    return { classification: 'WIN7_PASS', status: 'PASS' };
  }
  return { classification: 'CANDIDATE_EVIDENCE', status: 'FAIL_CLOSED' };
}
