import crypto from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assertHash, sha256File } from './release-contract.mjs';
import { getZipEntry } from './zip-utils.mjs';

export const WIN7_55_HELPER_SOURCE = Object.freeze({
  kind: 'WIN7_55_PRODUCT_HELPER_RECOVERY',
  candidate: 'WIN7-55',
  filename: 'Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip',
  sha256: '7de63dd8db0fde0f7c76aafa48f44ce6c9841c651c03b93215e175ad3792824a',
  source_commit: 'b4ce2be42cc9448142b831612dc7d5bc3a4df3cd',
  manifest_sha256: '13f1f892288c28f1c9cc212502129a48872060d654fb6e85d008786a9c86accf',
  member: 'Win7CodingAgent-0.3.0-alpha.2-win7-x64/resources/native/runner/spike02_helper.exe',
  helper_bytes: 361472,
  helper_sha256: '2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7',
});

export function validateRunnerInputSelection(options, profile) {
  if (options.runnerZip && options.runnerProductZip) throw new Error('A9_RUNNER_INPUTS_MUTUALLY_EXCLUSIVE');
  if (!options.runnerZip && !options.runnerProductZip) throw new Error('A9_RUNNER_INPUT_REQUIRED');
  if (options.runnerProductZip && !profile.developmentOnly) throw new Error('A9_HELPER_RECOVERY_DEVELOPMENT_ONLY');
}

function validateRecoveryLock(lock) {
  const runner = lock.inputs.runner_return_zip;
  if (lock.lock_id !== 'A9-32-DEVELOPER-INPUTS-D013-V26-MANAGED'
    || runner.required_entry_sha256 !== WIN7_55_HELPER_SOURCE.helper_sha256
    || runner.profile !== 'D-013-v26-managed-a9-trusted-shell-current-user'
    || runner.protocol_version !== 3 || runner.managed_contract?.revision !== 'a9-31-managed-r1') {
    throw new Error('A9_HELPER_RECOVERY_LOCK_MISMATCH');
  }
}

export function helperRecoveryRecord(lock) {
  validateRecoveryLock(lock);
  const runner = lock.inputs.runner_return_zip;
  return { schema_version: 1, ...WIN7_55_HELPER_SOURCE,
    original_return_zip: { filename: runner.filename, sha256: runner.sha256, availability: 'NOT_AVAILABLE' },
  };
}

export function loadRecoveredHelper(zipPath, lock) {
  validateRecoveryLock(lock);
  if (path.basename(zipPath) !== WIN7_55_HELPER_SOURCE.filename) throw new Error('A9_HELPER_RECOVERY_FILENAME_MISMATCH');
  assertHash('A9_HELPER_RECOVERY_ZIP', sha256File(zipPath), WIN7_55_HELPER_SOURCE.sha256);
  const root = WIN7_55_HELPER_SOURCE.member.slice(0, -'resources/native/runner/spike02_helper.exe'.length);
  const manifestBytes = getZipEntry(zipPath, `${root}release-manifest.json`);
  assertHash('A9_HELPER_RECOVERY_MANIFEST', digest(manifestBytes), WIN7_55_HELPER_SOURCE.manifest_sha256);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const runner = lock.inputs.runner_return_zip;
  if (manifest.candidate !== 'WIN7-55' || manifest.source_commit !== WIN7_55_HELPER_SOURCE.source_commit
    || manifest.lock_id !== 'A9-BATCH2-INPUTS-D013-V26-MANAGED'
    || manifest.required_native.runner_helper !== runner.required_entry_sha256
    || manifest.required_native.runner_helper_profile !== runner.profile
    || manifest.required_native.runner_helper_protocol !== runner.protocol_version
    || manifest.locked_inputs.runner_return_zip.sha256 !== runner.sha256) {
    throw new Error('A9_HELPER_RECOVERY_SOURCE_IDENTITY_MISMATCH');
  }
  const helperBytes = getZipEntry(zipPath, WIN7_55_HELPER_SOURCE.member);
  assertHash('A9_RUNNER_ENTRY', digest(helperBytes), runner.required_entry_sha256);
  if (helperBytes.length !== WIN7_55_HELPER_SOURCE.helper_bytes) throw new Error('A9_HELPER_RECOVERY_SIZE_MISMATCH');
  return { helperBytes, recovery: helperRecoveryRecord(lock) };
}

export function applyHelperRecoveryToSbom(sbom, recovery) {
  sbom.metadata.properties.push(
    { name: 'win7:helper_recovery', value: JSON.stringify(recovery) },
  );
}

export function verifyHelperRecoveryManifest(manifest, lock, profile, sbom) {
  const recovery = manifest.development_inputs?.helper_recovery;
  if (!recovery) {
    if (manifest.locked_inputs?.runner_product_zip) throw new Error('A9_HELPER_RECOVERY_RECORD_REQUIRED');
    return;
  }
  if (!profile.developmentOnly || manifest.external_acceptance_eligible !== false) throw new Error('A9_HELPER_RECOVERY_DEVELOPMENT_ONLY');
  if (!isDeepStrictEqual(recovery, helperRecoveryRecord(lock))
    || manifest.locked_inputs.runner_return_zip !== undefined
    || !isDeepStrictEqual(manifest.locked_inputs.runner_product_zip,
      { filename: WIN7_55_HELPER_SOURCE.filename, sha256: WIN7_55_HELPER_SOURCE.sha256 })) {
    throw new Error('A9_HELPER_RECOVERY_MANIFEST_MISMATCH');
  }
  if (sbom) {
    const properties = sbom.metadata?.properties?.filter((item) => item.name === 'win7:helper_recovery') || [];
    if (properties.length !== 1 || properties[0].value !== JSON.stringify(recovery)
      || !sbom.externalReferences?.some((item) => item.url === `file:${WIN7_55_HELPER_SOURCE.filename}` && item.comment === WIN7_55_HELPER_SOURCE.sha256)
      || sbom.externalReferences.some((item) => item.url === `file:${lock.inputs.runner_return_zip.filename}`)) {
      throw new Error('A9_HELPER_RECOVERY_SBOM_MISMATCH');
    }
  }
}

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
