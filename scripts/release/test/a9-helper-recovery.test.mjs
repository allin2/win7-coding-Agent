import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildA9ProductCandidate } from '../build-a9-product-v3.mjs';
import { applyHelperRecoveryToSbom, helperRecoveryRecord, loadRecoveredHelper,
  validateRunnerInputSelection, verifyHelperRecoveryManifest, WIN7_55_HELPER_SOURCE } from '../a9-helper-recovery.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const load = (name) => JSON.parse(fs.readFileSync(path.join(root, 'release/win7-product-v3', name), 'utf8'));
const lock = load('a9-32-input-lock.json');
const profile = { developmentOnly: true };
function recoveredManifest() {
  return { external_acceptance_eligible: false,
    locked_inputs: { runner_product_zip: { filename: WIN7_55_HELPER_SOURCE.filename, sha256: WIN7_55_HELPER_SOURCE.sha256 } },
    development_inputs: { helper_recovery: helperRecoveryRecord(lock) },
  };
}
function recoveredSbom() {
  const sbom = { metadata: { properties: [] }, externalReferences: [
    { type: 'distribution', url: `file:${WIN7_55_HELPER_SOURCE.filename}`, comment: WIN7_55_HELPER_SOURCE.sha256 },
  ] };
  applyHelperRecoveryToSbom(sbom, helperRecoveryRecord(lock));
  return sbom;
}

test('recovery keeps the original return identity separate from the actual product source', () => {
  const manifest = recoveredManifest();
  verifyHelperRecoveryManifest(manifest, lock, profile, recoveredSbom());
  assert.equal(manifest.development_inputs.helper_recovery.original_return_zip.availability, 'NOT_AVAILABLE');
  assert.equal(manifest.development_inputs.helper_recovery.original_return_zip.sha256, lock.inputs.runner_return_zip.sha256);
  assert.equal(manifest.locked_inputs.runner_return_zip, undefined);
});

test('runner input selection requires exactly one source', () => {
  assert.throws(() => validateRunnerInputSelection({}, profile), /A9_RUNNER_INPUT_REQUIRED/);
  assert.throws(() => validateRunnerInputSelection({ runnerZip: 'a', runnerProductZip: 'b' }, profile), /MUTUALLY_EXCLUSIVE/);
  validateRunnerInputSelection({ runnerZip: 'a' }, {});
  validateRunnerInputSelection({ runnerProductZip: 'b' }, profile);
});

test('formal producer rejects recovered helper before reading source or archives', () => {
  assert.throws(() => buildA9ProductCandidate({ lockPath: path.join(root, 'release/win7-product-v3/a9-batch2-input-lock.json'),
    runnerProductZip: 'unused.zip', repositoryRoot: '/does-not-exist' }), /A9_HELPER_RECOVERY_DEVELOPMENT_ONLY/);
});

test('CLI accepts product source and rejects combined runner inputs', () => {
  const args = [path.join(root, 'scripts/release/build-a9-product-v3.mjs'),
    '--formal-input-lock', path.join(root, 'release/win7-product-v3/a9-batch2-input-lock.json'),
    '--electron-zip', 'unused-electron.zip', '--storage-zip', 'unused-storage.zip', '--runner-product-zip', 'unused-product.zip'];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /A9_HELPER_RECOVERY_DEVELOPMENT_ONLY/);
  const combined = spawnSync(process.execPath, [...args, '--runner-zip', 'unused-return.zip'], { encoding: 'utf8' });
  assert.equal(combined.status, 1);
  assert.match(combined.stderr, /A9_RUNNER_INPUTS_MUTUALLY_EXCLUSIVE/);
});

test('recovery rejects incompatible helper locks', () => {
  for (const mutate of [
    (value) => { value.inputs.runner_return_zip.required_entry_sha256 = '0'.repeat(64); },
    (value) => { value.inputs.runner_return_zip.managed_contract.revision = 'wrong'; },
    (value) => { value.lock_id = 'A9-30-DEVELOPER-INPUTS-D013-V26'; },
  ]) {
    const changed = structuredClone(lock); mutate(changed);
    assert.throws(() => helperRecoveryRecord(changed), /A9_HELPER_RECOVERY_LOCK_MISMATCH/);
  }
});

test('recovery rejects an unapproved archive before parsing ZIP content', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-helper-recovery-'));
  const zipPath = path.join(directory, WIN7_55_HELPER_SOURCE.filename);
  fs.writeFileSync(zipPath, 'not the approved WIN7-55 archive');
  try { assert.throws(() => loadRecoveredHelper(zipPath, lock), /A9_HELPER_RECOVERY_ZIP/); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('recovery verifier rejects missing provenance, mixed input identities and source drift', () => {
  for (const mutate of [
    (value) => { delete value.development_inputs.helper_recovery; },
    (value) => { value.locked_inputs.runner_return_zip = { sha256: lock.inputs.runner_return_zip.sha256 }; },
    (value) => { value.development_inputs.helper_recovery.sha256 = '0'.repeat(64); },
    (value) => { value.locked_inputs.runner_product_zip.sha256 = '0'.repeat(64); },
    (value) => { value.development_inputs.helper_recovery.original_return_zip.availability = 'AVAILABLE'; },
  ]) {
    const manifest = recoveredManifest(); mutate(manifest);
    assert.throws(() => verifyHelperRecoveryManifest(manifest, lock, profile, recoveredSbom()), /A9_HELPER_RECOVERY_/);
  }
});

test('recovery verifier rejects formal eligibility and misleading SBOM references', () => {
  assert.throws(() => verifyHelperRecoveryManifest(recoveredManifest(), lock, {}, recoveredSbom()), /DEVELOPMENT_ONLY/);
  const manifest = recoveredManifest(); manifest.external_acceptance_eligible = true;
  assert.throws(() => verifyHelperRecoveryManifest(manifest, lock, profile, recoveredSbom()), /DEVELOPMENT_ONLY/);
  for (const mutate of [
    (value) => { value.metadata.properties = []; },
    (value) => { value.externalReferences[0].comment = '0'.repeat(64); },
    (value) => { value.externalReferences.push({ url: `file:${lock.inputs.runner_return_zip.filename}` }); },
  ]) {
    const sbom = recoveredSbom(); mutate(sbom);
    assert.throws(() => verifyHelperRecoveryManifest(recoveredManifest(), lock, profile, sbom), /SBOM_MISMATCH/);
  }
});
