import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CoordinatorError, canonicalJson, createLeaseRequest, gradeCandidateEvidence, grantLease,
  initializeKeyPair, loadState, recoverLease, recoverRelocatedLease, registerGrantedLease, releaseLease, returnLease, startLease,
  verifyLeaseBundle,
} from '../core.mjs';

const HASH = 'a'.repeat(64);
const COMMIT = 'b'.repeat(40);

function spec(overrides = {}) {
  return {
    lease_id: 'lease-d013-1', run_id: 'D013-20260810-1', nonce: 'nonce-1',
    expires_at_utc: '2026-08-11T00:00:00.000Z', source_commit: COMMIT,
    package_manifest_sha256: HASH,
    target: { ip: '192.168.1.11', port: 22, hostname: 'WIN7-A5', os_build: '7601', arch: 'x64' },
    scope: { suite: 'SPIKE_02_D013', profile: 'D013-CLOSURE-01', cases: ['C01', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'N06'], required_pass_cases: ['C01', 'C03', 'C04', 'C06', 'C07', 'C08', 'N06'] },
    artifact_hashes: { 'spike02_helper.exe': HASH }, ...overrides,
  };
}

function keyPair() { return crypto.generateKeyPairSync('ed25519'); }
function snapshot(lease, extra = {}) {
  return {
    service: { name: 'BvSshServer', state: 'RUNNING' }, ssh: { port: 22, reachable: true },
    target: { ip: lease.target.ip, os_build: '7601', arch: 'x64' }, residues: [],
    artifact_hashes: { ...lease.artifact_hashes }, ...extra,
  };
}

test('canonical signed lease verifies exact bindings and rejects tampering/expiry', () => {
  const pair = keyPair();
  const request = createLeaseRequest(spec(), new Date('2026-08-10T00:00:00Z'));
  const granted = grantLease(request, pair.privateKey, new Date('2026-08-10T00:01:00Z'));
  const lease = verifyLeaseBundle(granted.raw, granted.signature, pair.publicKey, { nowMs: Date.parse('2026-08-10T00:02:00Z'), sourceCommit: COMMIT, targetIp: '192.168.1.11' });
  assert.equal(lease.state, 'GRANTED');
  assert.throws(() => verifyLeaseBundle(Buffer.from(granted.raw.toString().replace('192.168.1.11', '192.168.1.12')), granted.signature, pair.publicKey), (error) => error.code === 'LEASE_SIGNATURE_INVALID');
  assert.throws(() => verifyLeaseBundle(granted.raw, granted.signature, pair.publicKey, { nowMs: Date.parse('2026-08-12T00:00:00Z') }), (error) => error.code === 'LEASE_EXPIRED');
  assert.doesNotThrow(() => verifyLeaseBundle(granted.raw, granted.signature, pair.publicKey,
    { nowMs: Date.parse('2026-08-12T00:00:00Z'), allowExpired: true }));
});

test('key initialization is no-overwrite and private mode is restrictive', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coordinator-key-'));
  const privateKey = path.join(root, 'private.pem');
  const publicKey = path.join(root, 'public.pem');
  initializeKeyPair(privateKey, publicKey);
  assert.equal(fs.statSync(privateKey).mode & 0o777, 0o600);
  assert.throws(() => initializeKeyPair(privateKey, publicKey), (error) => error.code === 'KEY_EXISTS');
});

test('only one active lease exists and lifecycle releases it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coordinator-state-'));
  const stateFile = path.join(root, 'state.json');
  const first = grantLease(createLeaseRequest(spec(), new Date('2026-08-10T00:00:00Z')), keyPair().privateKey, new Date('2026-08-10T00:01:00Z')).lease;
  registerGrantedLease(stateFile, first);
  const second = { ...first, lease_id: 'lease-d013-2' };
  assert.throws(() => registerGrantedLease(stateFile, second), (error) => error.code === 'ACTIVE_LEASE_EXISTS');
  startLease(stateFile, first, snapshot(first));
  returnLease(stateFile, first, snapshot(first));
  releaseLease(stateFile, first.lease_id);
  assert.equal(loadState(stateFile).active_lease_id, null);
});

test('preflight blocks before RUNNING and postflight residue requires recovery', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coordinator-flight-'));
  const stateFile = path.join(root, 'state.json');
  const lease = grantLease(createLeaseRequest(spec(), new Date('2026-08-10T00:00:00Z')), keyPair().privateKey, new Date('2026-08-10T00:01:00Z')).lease;
  registerGrantedLease(stateFile, lease);
  assert.throws(() => startLease(stateFile, lease, snapshot(lease, { service: { name: 'BvSshServer', state: 'STOPPED' } })), (error) => error.code === 'PREFLIGHT_BLOCKED');
  startLease(stateFile, lease, snapshot(lease));
  returnLease(stateFile, lease, snapshot(lease, { residues: [{ pid: 42, image: 'spike02_helper.exe' }] }));
  assert.equal(loadState(stateFile).leases[lease.lease_id].state, 'RECOVERY_REQUIRED');
  assert.throws(() => recoverLease(stateFile, lease, snapshot(lease, { residues: [{ pid: 42 }] })), (error) => error.code === 'RECOVERY_STILL_REQUIRED');
  recoverLease(stateFile, lease, snapshot(lease));
  assert.equal(loadState(stateFile).leases[lease.lease_id].state, 'RETURNED');
});

test('relocated recovery is signed, closes only recovery, and verifies the locked host identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coordinator-relocation-'));
  const stateFile = path.join(root, 'state.json');
  const pair = keyPair();
  const lease = grantLease(createLeaseRequest(spec(), new Date('2026-08-10T00:00:00Z')),
    pair.privateKey, new Date('2026-08-10T00:01:00Z')).lease;
  registerGrantedLease(stateFile, lease);
  startLease(stateFile, lease, snapshot(lease));
  returnLease(stateFile, lease, snapshot(lease, { residues: [{ kind: 'ACL_INTEGRITY_LABEL' }] }));
  const relocated = snapshot(lease, {
    ssh: { port: 22, reachable: true, strict_host_key_checking: true, host_key_alias: '192.168.1.11' },
    target: { ip: '10.49.123.40', hostname: 'win7-a5', os_build: '7601', arch: 'x64' },
  });
  const relocation = {
    schema_version: 1, reason: 'TARGET_IP_CHANGED_DURING_RECOVERY', authorization: 'PROJECT_OWNER_CONFIRMED',
    old_target_ip: '192.168.1.11', new_target_ip: '10.49.123.40', host_key_alias: '192.168.1.11',
  };
  recoverRelocatedLease(stateFile, lease, relocated, relocation, pair.privateKey);
  const detail = loadState(stateFile).leases[lease.lease_id].detail;
  assert.equal(loadState(stateFile).leases[lease.lease_id].state, 'RETURNED');
  assert.equal(detail.relocation_attestation.new_target_ip, '10.49.123.40');
  assert.equal(crypto.verify(null, Buffer.from(canonicalJson(detail.relocation_attestation)), pair.publicKey,
    Buffer.from(detail.relocation_signature_base64, 'base64')), true);
  assert.throws(() => recoverRelocatedLease(stateFile, lease, { ...relocated, ssh: { port: 22, reachable: true } },
    relocation, pair.privateKey), (error) => error.code === 'RELOCATION_IDENTITY_UNVERIFIED');
});

test('formal grade requires every signed required case and exact evidence binding', () => {
  const lease = createLeaseRequest(spec(), new Date('2026-08-10T00:00:00Z'));
  const evidence = { evidence_grade: 'CANDIDATE_EVIDENCE', lease_id: lease.lease_id, source_commit: COMMIT, package_manifest_sha256: HASH, cases: lease.scope.required_pass_cases.map((id) => ({ id, status: 'PASS' })) };
  const state = { leases: { [lease.lease_id]: { state: 'RETURNED' } } };
  assert.equal(gradeCandidateEvidence(lease, evidence).grade, 'CANDIDATE_EVIDENCE');
  assert.equal(gradeCandidateEvidence(lease, evidence, state).grade, 'WIN7_PASS');
  evidence.cases[0].status = 'FAIL';
  assert.equal(gradeCandidateEvidence(lease, evidence, state).grade, 'CANDIDATE_EVIDENCE');
});

test('canonical JSON is deterministic', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}\n');
  assert.ok(CoordinatorError);
});
