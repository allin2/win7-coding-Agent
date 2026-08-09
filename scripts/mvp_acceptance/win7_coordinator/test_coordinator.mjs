/* Pure-local ADR-0065 coordinator regression tests. Never opens a socket. */
'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LeaseLedger,
  generateCoordinatorKeyPair,
  gradeA4Candidate,
  jsonBytes,
  signLeaseBytes,
  verifyLeaseBytes,
} from './lease.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'win7-coordinator-test-'));
let passed = 0;

function check(name, action) {
  action();
  passed += 1;
  process.stdout.write(`PASS ${name}\n`);
}

function fails(name, action, pattern) {
  assert.throws(action, pattern);
  passed += 1;
  process.stdout.write(`PASS ${name}\n`);
}

try {
  const privateKey = path.join(temp, 'state', 'lease_private.pem');
  const publicKey = path.join(temp, 'lease_public.pem');
  const metadataFile = path.join(temp, 'lease_public.json');
  const metadata = generateCoordinatorKeyPair(privateKey, publicKey, metadataFile);
  check('Ed25519 private key mode is 0600', () => assert.equal(fs.statSync(privateKey).mode & 0o777, 0o600));

  const now = Date.parse('2026-08-10T01:00:00.000Z');
  const payload = {
    schema_version: 1,
    kind: 'WIN7_ACCEPTANCE_LEASE',
    algorithm: 'Ed25519',
    key_id: metadata.key_id,
    state: 'GRANTED',
    commit: 'a'.repeat(40),
    acceptance_id: 'A4-20260810-000001',
    target: { address: '192.168.1.11', user: 'dccs-chaizl', os: 'Windows 7 SP1 x64 build 7601' },
    scope: { track: 'A4', acceptance: 'D-013', minimum_acl: 'PER_RUN_ROOT_ONLY' },
    artifact_manifest_sha256: 'b'.repeat(64),
    nonce: 'c'.repeat(64),
    issued_at: '2026-08-10T00:30:00.000Z',
    expires_at: '2026-08-10T02:30:00.000Z',
    allowed_remote_roots: ['C:\\Win7CodingAgent\\acceptance\\A4-20260810-000001', 'C:\\Win7CodingAgent\\data\\A4-20260810-000001'],
    forbidden_operations: ['taskkill', 'shutdown'],
  };
  const bytes = jsonBytes(payload);
  const signature = signLeaseBytes(bytes, privateKey, metadata.key_id);
  const expected = {
    commit: payload.commit,
    acceptance_id: payload.acceptance_id,
    target: payload.target,
    scope: payload.scope,
    artifact_manifest_sha256: payload.artifact_manifest_sha256,
    nonce: payload.nonce,
    allowed_remote_roots: payload.allowed_remote_roots,
    forbidden_operations: payload.forbidden_operations,
  };
  check('Ed25519 signs and verifies exact UTF-8 bytes', () => {
    assert.equal(verifyLeaseBytes(bytes, signature, publicKey, expected, now).acceptance_id, payload.acceptance_id);
  });
  const tampered = Buffer.from(bytes);
  tampered[tampered.length - 2] ^= 1;
  fails('any payload byte change is rejected', () => verifyLeaseBytes(tampered, signature, publicKey, expected, now), /payload hash mismatch/);

  for (const [name, value] of [
    ['commit', 'd'.repeat(40)],
    ['artifact_manifest_sha256', 'e'.repeat(64)],
    ['target', { ...payload.target, address: '10.0.0.1' }],
    ['scope', { ...payload.scope, acceptance: 'D-011' }],
    ['nonce', 'f'.repeat(64)],
  ]) {
    const label = name === 'artifact_manifest_sha256' ? 'wrong helper/artifact manifest hash fails closed' : `wrong ${name} fails closed`;
    fails(label, () => verifyLeaseBytes(bytes, signature, publicKey, { ...expected, [name]: value }, now), new RegExp(`${name} mismatch`));
  }
  fails('expired lease fails closed', () => verifyLeaseBytes(bytes, signature, publicKey, expected, Date.parse('2026-08-10T02:30:00.000Z')), /not currently valid/);

  const ledger = new LeaseLedger(path.join(temp, 'state', 'ledger.json'));
  ledger.request({ acceptance_id: 'A4-20260810-000001', requested_at: '2026-08-10T00:00:00Z' });
  ledger.request({ acceptance_id: 'A4-20260810-000002', requested_at: '2026-08-10T00:01:00Z' });
  ledger.grant('A4-20260810-000001', '1'.repeat(64), '2026-08-10T00:02:00Z');
  fails('second active lease is rejected', () => ledger.grant('A4-20260810-000002', '2'.repeat(64), '2026-08-10T00:03:00Z'), /active/);
  check('lease state machine releases cleanly', () => {
    ledger.transition('A4-20260810-000001', 'RUNNING', '2026-08-10T00:04:00Z');
    ledger.transition('A4-20260810-000001', 'RETURNED', '2026-08-10T00:05:00Z');
    ledger.transition('A4-20260810-000001', 'RELEASED', '2026-08-10T00:06:00Z');
    assert.equal(ledger.active().length, 0);
  });
  check('unsigned request can be made permanently ungrantable', () => {
    ledger.transition('A4-20260810-000002', 'REQUEST_SUPERSEDED', '2026-08-10T00:07:00Z');
    assert.throws(() => ledger.grant('A4-20260810-000002', '3'.repeat(64), '2026-08-10T00:08:00Z'), /not REQUESTED/);
  });

  const passReport = {
    result: { automatic_status: 'D013_CANDIDATE_EVIDENCE', classification: 'CANDIDATE_EVIDENCE' },
    safety: { taskkill_used: false, management_channel_mutated: false, network_configuration_mutated: false, rebooted: false },
    stages: ['REM-D01', 'REM-D02', 'REM-D03', 'REM-D04', 'REM-D05', 'REM-D06', 'REM-D07', 'REM-D08'].map((id) => ({
      id,
      status: 'PASS',
      uploaded: id === 'REM-D04' ? Array.from({ length: 3 }, () => ({ local_sha256: 'a'.repeat(64), remote_sha256: 'a'.repeat(64) })) : undefined,
      classification: id === 'REM-D07' ? {
        files: Array.from({ length: 9 }, () => ({ local_sha256: 'b'.repeat(64), remote_sha256: 'b'.repeat(64) })),
        missing_case_ids: [], duplicate_case_ids: [], taskkill_used: false, harness_exit_code: 0,
      } : undefined,
    })),
  };
  check('only coordinator grades complete candidate as WIN7_PASS', () => assert.equal(gradeA4Candidate(passReport).classification, 'WIN7_PASS'));
  check('hash mismatch is not graded WIN7_PASS', () => {
    passReport.stages.find((stage) => stage.id === 'REM-D07').classification.files[0].remote_sha256 = 'c'.repeat(64);
    assert.equal(gradeA4Candidate(passReport).status, 'FAIL_CLOSED');
  });

  const privateContents = fs.readFileSync(privateKey, 'utf8');
  check('public metadata and test output contain no private key', () => {
    assert.equal(JSON.stringify(metadata).includes(privateContents), false);
    assert.equal(fs.readFileSync(metadataFile, 'utf8').includes('BEGIN PRIVATE KEY'), false);
  });
  process.stdout.write(`Coordinator tests: ${passed} PASS\n`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
