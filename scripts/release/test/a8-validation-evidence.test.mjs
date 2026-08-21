import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertEvidenceOutsideCandidate,
  bindCandidate,
  finalizeEvidenceReport,
  validateEvidenceReport,
} from '../../../src/shell/tests/product/a8-validation-evidence.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function candidateFixture(sourceDirty = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-evidence-candidate-'));
  fs.mkdirSync(path.join(root, 'resources', 'app'), { recursive: true });
  const payload = Buffer.from('candidate-payload');
  fs.writeFileSync(path.join(root, 'resources', 'app', 'index.js'), payload);
  const manifest = {
    schema_version: 1,
    release_id: 'A8-TEST-CANDIDATE',
    version: '0.2.0-alpha.1',
    source_commit: '1'.repeat(40),
    source_dirty: sourceDirty,
    files: [{ path: 'resources/app/index.js', size: payload.length, sha256: sha256(payload) }],
  };
  fs.writeFileSync(path.join(root, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return root;
}

function passingReport() {
  return {
    record_id: 'A8-TEST-EVIDENCE',
    status: 'PASS',
    cases: [{ id: 'A8-TEST-CASE', status: 'PASS', detail: 'ok' }],
    recorded_at: '2026-08-21T00:00:00.000Z',
  };
}

test('candidate binding verifies the complete manifested tree and evidence schema v2', () => {
  const root = candidateFixture(false);
  const binding = bindCandidate({ candidateRoot: root, expectedCandidateId: 'A8-TEST-CANDIDATE' });
  const report = finalizeEvidenceReport(passingReport(), {
    binding,
    validationLayer: 'win10',
    operatorId: 'tester',
    environment: { platform: 'win32', arch: 'x64', electron: '22.3.27', node: '16.17.1', node_abi: 110, system_version: '10.0.19045' },
    temporaryRoot: path.join(os.tmpdir(), 'a8-evidence-run'),
    cleanupStatus: 'REMOVED_AFTER_PASS',
    expectedCaseIds: ['A8-TEST-CASE'],
  });
  assert.equal(report.schema_version, 2);
  assert.equal(report.candidate_id, 'A8-TEST-CANDIDATE');
  assert.equal(report.candidate_manifest_sha256, binding.manifestSha256);
  assert.equal(report.external_validation.win10, 'PASS');
  assert.equal(validateEvidenceReport(report, { validationLayer: 'win10', expectedCaseIds: ['A8-TEST-CASE'] }), report);
  fs.rmSync(root, { recursive: true, force: true });
});

test('candidate binding fails closed on payload tamper, unmanifested files and in-candidate evidence', () => {
  const root = candidateFixture(false);
  fs.writeFileSync(path.join(root, 'resources', 'app', 'index.js'), 'tampered');
  assert.throws(() => bindCandidate({ candidateRoot: root }), /A8_CANDIDATE_FILE_MISMATCH/);
  fs.writeFileSync(path.join(root, 'resources', 'app', 'index.js'), 'candidate-payload');
  fs.writeFileSync(path.join(root, 'unexpected.json'), '{}');
  assert.throws(() => bindCandidate({ candidateRoot: root }), /A8_CANDIDATE_UNMANIFESTED_FILE/);
  assert.throws(() => assertEvidenceOutsideCandidate(root, path.join(root, 'evidence.json')), /A8_EVIDENCE_INSIDE_CANDIDATE_PROHIBITED/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('formal evidence rejects dirty source and a non-target Electron ABI', () => {
  const dirtyRoot = candidateFixture(true);
  const dirtyBinding = bindCandidate({ candidateRoot: dirtyRoot });
  assert.throws(() => finalizeEvidenceReport(passingReport(), {
    binding: dirtyBinding,
    validationLayer: 'win7',
    operatorId: 'tester',
    environment: { platform: 'win32', arch: 'x64', electron: '22.3.27', node: '16.17.1', node_abi: 110, system_version: '6.1.7601' },
  }), /A8_FORMAL_CANDIDATE_SOURCE_DIRTY/);
  fs.rmSync(dirtyRoot, { recursive: true, force: true });

  const cleanRoot = candidateFixture(false);
  const cleanBinding = bindCandidate({ candidateRoot: cleanRoot });
  assert.throws(() => finalizeEvidenceReport(passingReport(), {
    binding: cleanBinding,
    validationLayer: 'win7',
    operatorId: 'tester',
    environment: { platform: 'win32', arch: 'x64', electron: null, node: '16.17.1', node_abi: 93, system_version: '6.1.7601' },
  }), /A8_TARGET_RUNTIME_MISMATCH/);
  fs.rmSync(cleanRoot, { recursive: true, force: true });
});

test('formal evidence rejects a caller-supplied layer that does not match the OS version', () => {
  const root = candidateFixture(false);
  const binding = bindCandidate({ candidateRoot: root });
  assert.throws(() => finalizeEvidenceReport(passingReport(), {
    binding,
    validationLayer: 'win7',
    operatorId: 'tester',
    environment: { platform: 'win32', arch: 'x64', electron: '22.3.27', node: '16.17.1', node_abi: 110, system_version: '10.0.19045' },
  }), /A8_VALIDATION_LAYER_OS_MISMATCH/);
  fs.rmSync(root, { recursive: true, force: true });
});
