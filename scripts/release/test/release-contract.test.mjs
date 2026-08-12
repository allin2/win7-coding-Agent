import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertHash,
  createFileManifest,
  sha256File,
  verifyReleaseZip,
  writeJson,
} from '../release-contract.mjs';
import { writeDeterministicZip } from '../zip-utils.mjs';

const HASH = '0'.repeat(64);

test('hash and forbidden-payload checks fail closed', () => {
  assert.doesNotThrow(() => assertHash('INPUT', HASH, HASH));
  assert.throws(() => assertHash('INPUT', '1'.repeat(64), HASH), /INPUT_SHA256_MISMATCH/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a7-forbidden-'));
  fs.writeFileSync(path.join(root, 'private.pem'), 'not-a-real-key', 'utf8');
  assert.throws(() => createFileManifest(root, ['private.pem']), /FORBIDDEN_PAYLOAD/);
});

test('release verifier checks the sidecar, every manifest file and native layout', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a7-contract-'));
  const packageName = 'Win7CodingAgent-test-win7-x64';
  const packageRoot = path.join(root, 'stage', packageName);
  const runner = path.join(packageRoot, 'resources', 'native', 'runner', 'spike02_helper.exe');
  const runnerManifest = path.join(packageRoot, 'resources', 'native', 'runner', 'runner-manifest.json');
  const storage = path.join(packageRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const runtime = path.join(packageRoot, 'resources', 'app', 'rc-runtime.json');
  fs.mkdirSync(path.dirname(runner), { recursive: true });
  fs.mkdirSync(path.dirname(storage), { recursive: true });
  fs.writeFileSync(runner, 'runner', 'utf8');
  fs.writeFileSync(storage, 'storage', 'utf8');
  fs.writeFileSync(path.join(packageRoot, 'payload.txt'), 'payload', 'utf8');
  writeJson(runnerManifest, {
    schema_version: 1,
    helper: { path: 'spike02_helper.exe', sha256: sha256File(runner) },
    profiles: [{
      id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', sha256: HASH,
      risk: 'low', output_encoding: 'cp936', working_directory_roots: ['${RC_RUNNER_WORK_ROOT}'],
      argv_policy: { exact: [[]] },
    }],
    acceptance_action: { profile_id: 'win7-whoami', args: [] },
  });
  writeJson(runtime, {
    schema_version: 1, release_id: 'TEST-RC', version: '0.0.0-test',
    native_layout: 'EXTERNAL_TO_APP_AND_ASAR',
    runner_manifest: '../native/runner/runner-manifest.json',
    runner_manifest_sha256: sha256File(runnerManifest), runner_work_directory: 'runner-work',
    storage_module_root: '../native/storage/node_modules/better-sqlite3',
    storage_native_binding: '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    storage_database: 'state/agent-events-v2.db', storage_profile: 'E22-SQLITE343-LOCAL-SSD',
    unsupported: ['interactive-winpty', 'arbitrary-shell', 'network-drive-storage', 'hdd-performance-claim'],
  });

  const manifest = {
    schema_version: 1,
    release_id: 'TEST-RC',
    version: '0.0.0-test',
    source_commit: '1'.repeat(40),
    required_native: {
      runner_helper: sha256File(runner), better_sqlite3_node: sha256File(storage), electron_abi: 110,
    },
    gates: { developer_package_integrity: 'PASS', win10: 'NOT_PERFORMED', win7: 'NOT_PERFORMED' },
    files: createFileManifest(packageRoot, []),
  };
  writeJson(path.join(packageRoot, 'release-manifest.json'), manifest);
  const zipPath = path.join(root, `${packageName}.zip`);
  writeDeterministicZip(path.join(root, 'stage'), zipPath, 1786464000);
  const sidecarPath = `${zipPath}.sha256`;
  fs.writeFileSync(sidecarPath, `${sha256File(zipPath)}  ${path.basename(zipPath)}\n`, 'ascii');
  const lockPath = path.join(root, 'lock.json');
  writeJson(lockPath, {
    schema_version: 1,
    release_id: manifest.release_id,
    version: manifest.version,
    source_date_epoch: 1786464000,
    runtime_profiles: {
      runner: {
        id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe',
        executable_sha256: HASH, working_directory_token: '${RC_RUNNER_WORK_ROOT}', argv_exact: [[]],
      },
    },
    inputs: {
      electron: { sha256: HASH, required_entry_sha256: HASH },
      runner: { sha256: HASH, required_entry_sha256: HASH },
      storage: { sha256: HASH, required_entry_sha256: HASH },
    },
  });

  const result = verifyReleaseZip(zipPath, sidecarPath, lockPath);
  assert.equal(result.file_count, 5);
  assert.equal(result.native_file_count, 2);
  assert.equal(result.source_commit, manifest.source_commit);

  fs.writeFileSync(sidecarPath, `${'f'.repeat(64)}  ${path.basename(zipPath)}\n`, 'ascii');
  assert.throws(() => verifyReleaseZip(zipPath, sidecarPath, lockPath), /RC_ZIP_SIDECAR_MISMATCH/);
});
