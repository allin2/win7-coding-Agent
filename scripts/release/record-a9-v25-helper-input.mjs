#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readZipEntries, readZipEntry } from './zip-utils.mjs';
import { verifyV25ReturnEvidence } from './a9-v25-return-evidence.mjs';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, '..', '..');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('A9_V25_LOCK_USAGE');
    result[key.slice(2)] = value;
  }
  return result;
}

function readSingle(entries, name) {
  const matches = entries.filter((entry) => !entry.directory && entry.name === name);
  if (matches.length !== 1) throw new Error(`A9_V25_RETURN_ENTRY_COUNT:${name}:${matches.length}`);
  return readZipEntry(matches[0]);
}

function parseJson(buffer, label) {
  try { return JSON.parse(buffer.toString('utf8')); }
  catch (error) { throw new Error(`${label}_INVALID:${error instanceof Error ? error.message : String(error)}`); }
}

function verifyAuthorizedSourceSnapshot(inputLock, sourceRepositoryRoot) {
  const commit = String(inputLock.source_commit || '');
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A9_V25_SOURCE_COMMIT_BINDING_MISMATCH');
  const sources = Array.isArray(inputLock.sources)
    ? inputLock.sources.filter((entry) => String(entry?.path || '').startsWith('src/'))
    : [];
  if (sources.length === 0) throw new Error('A9_V25_AUTHORIZED_SOURCE_SNAPSHOT_EMPTY');
  const seen = new Set();
  for (const entry of sources) {
    const relative = String(entry.path).slice('src/'.length);
    if (!relative || relative.includes('\\') || relative.split('/').includes('..') || seen.has(relative)
      || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
      throw new Error('A9_V25_AUTHORIZED_SOURCE_ENTRY_INVALID');
    }
    seen.add(relative);
    let committedBytes;
    try {
      committedBytes = execFileSync('git', ['show', `${commit}:native/helper/${relative}`], {
        cwd: sourceRepositoryRoot,
        encoding: 'buffer',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (_error) {
      throw new Error(`A9_V25_SOURCE_COMMIT_FILE_UNAVAILABLE:${relative}`);
    }
    if (committedBytes.length !== entry.size || sha256(committedBytes) !== entry.sha256) {
      throw new Error(`A9_V25_SOURCE_COMMIT_FILE_MISMATCH:${relative}`);
    }
  }
}

export function verifyCommittedApprovalRegistry(registryPath, sourceRepositoryRoot) {
  const relative = 'release/win7-product-v3/a9-v25-approved-kits.json';
  const expected = path.resolve(sourceRepositoryRoot, ...relative.split('/'));
  if (path.resolve(registryPath) !== expected) throw new Error('A9_V25_APPROVAL_REGISTRY_PATH_INVALID');
  let head;
  let committedBytes;
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: sourceRepositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    committedBytes = execFileSync('git', ['show', `HEAD:${relative}`], {
      cwd: sourceRepositoryRoot, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (_error) {
    throw new Error('A9_V25_APPROVAL_REGISTRY_NOT_COMMITTED');
  }
  const workingBytes = fs.readFileSync(registryPath);
  let status;
  try {
    status = execFileSync('git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--', relative], {
      cwd: sourceRepositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_error) {
    throw new Error('A9_V25_APPROVAL_REGISTRY_GIT_STATUS_FAILED');
  }
  if (status || !workingBytes.equals(committedBytes)) {
    throw new Error('A9_V25_APPROVAL_REGISTRY_NOT_CLEAN_HEAD');
  }
  return { commit: head, sha256: sha256(committedBytes), path: relative };
}

function inspectApprovedKit(kitZip, registryPath, sourceRepositoryRoot) {
  const archiveBytes = fs.readFileSync(kitZip);
  const archiveSha256 = sha256(archiveBytes);
  const registry = parseJson(fs.readFileSync(registryPath), 'A9_V25_APPROVED_KIT_REGISTRY');
  if (registry.schema_version !== 1 || !Array.isArray(registry.kits)) {
    throw new Error('A9_V25_APPROVED_KIT_REGISTRY_INVALID');
  }
  const approved = registry.kits.find((item) => item?.status === 'APPROVED_FOR_RETURN_RECORDING'
    && item.filename === path.basename(kitZip) && item.sha256 === archiveSha256);
  if (!approved || typeof approved.revision !== 'string' || approved.revision.length === 0
    || !/^[a-f0-9]{40}$/.test(String(approved.source_commit || ''))
    || !/^[a-f0-9]{64}$/.test(String(approved.input_lock_sha256 || ''))
    || !/^[a-f0-9]{64}$/.test(String(approved.package_manifest_sha256 || ''))) {
    throw new Error('A9_V25_BUILD_KIT_NOT_PREAPPROVED');
  }
  const entries = readZipEntries(kitZip);
  const inputLockBytes = readSingle(entries, 'input-lock.json');
  const packageManifestBytes = readSingle(entries, 'PACKAGE_MANIFEST.json');
  if (sha256(inputLockBytes) !== approved.input_lock_sha256
    || sha256(packageManifestBytes) !== approved.package_manifest_sha256) {
    throw new Error('A9_V25_APPROVED_KIT_LOCK_HASH_MISMATCH');
  }
  const inputLock = parseJson(inputLockBytes, 'A9_V25_AUTHORIZED_INPUT_LOCK');
  const packageManifest = parseJson(packageManifestBytes, 'A9_V25_AUTHORIZED_PACKAGE_MANIFEST');
  if (inputLock.source_commit !== approved.source_commit
    || packageManifest.source_commit !== approved.source_commit
    || packageManifest.status !== 'READY_FOR_WIN10_BUILD'
    || !Array.isArray(packageManifest.files)) {
    throw new Error('A9_V25_APPROVED_KIT_SOURCE_BINDING_MISMATCH');
  }
  const archiveFiles = new Map(entries.filter((entry) => !entry.directory).map((entry) => [entry.name, entry]));
  const authorizedFiles = new Map();
  const expectedPaths = new Set(['PACKAGE_MANIFEST.json']);
  for (const entry of packageManifest.files) {
    if (!entry || typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.startsWith('/')
      || entry.path.split('/').includes('..') || expectedPaths.has(entry.path)
      || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
      throw new Error('A9_V25_APPROVED_KIT_MANIFEST_ENTRY_INVALID');
    }
    expectedPaths.add(entry.path);
    const archived = archiveFiles.get(entry.path);
    if (!archived) throw new Error(`A9_V25_APPROVED_KIT_FILE_MISSING:${entry.path}`);
    const bytes = readZipEntry(archived);
    authorizedFiles.set(entry.path, bytes);
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
      throw new Error(`A9_V25_APPROVED_KIT_FILE_MISMATCH:${entry.path}`);
    }
  }
  if (archiveFiles.size !== expectedPaths.size || Array.from(archiveFiles.keys()).some((name) => !expectedPaths.has(name))) {
    throw new Error('A9_V25_APPROVED_KIT_FILE_SET_MISMATCH');
  }
  for (const required of ['input-lock.json', 'build-profile.json', 'build.ps1', 'prepare-kit.cjs']) {
    if (!authorizedFiles.has(required)) throw new Error(`A9_V25_APPROVED_KIT_REQUIRED_INPUT_MISSING:${required}`);
  }
  verifyAuthorizedSourceSnapshot(inputLock, sourceRepositoryRoot);
  return {
    inputLockBytes, packageManifestBytes, inputLock, packageManifest, authorizedFiles,
    identity: {
      revision: approved.revision,
      filename: approved.filename,
      sha256: approved.sha256,
      source_commit: approved.source_commit,
      input_lock_sha256: approved.input_lock_sha256,
      package_manifest_sha256: approved.package_manifest_sha256,
    },
  };
}

function inspectEligibleReturn(runnerZip, sidecar, authorizedKit, sourceRepositoryRoot) {
  const archiveBytes = fs.readFileSync(runnerZip);
  const archiveSha256 = sha256(archiveBytes);
  const sidecarText = fs.readFileSync(sidecar, 'ascii').trim();
  const sidecarMatch = /^([a-f0-9]{64})\s{2}([^\\/]+)$/i.exec(sidecarText);
  if (!sidecarMatch || sidecarMatch[1].toLowerCase() !== archiveSha256
    || sidecarMatch[2] !== path.basename(runnerZip)) {
    throw new Error('A9_V25_RETURN_SIDECAR_MISMATCH');
  }
  const entries = readZipEntries(runnerZip);
  const buildResult = parseJson(readSingle(entries, 'evidence/build-result.json'), 'A9_V25_BUILD_RESULT');
  const environment = parseJson(readSingle(entries, 'evidence/environment.json'), 'A9_V25_ENVIRONMENT');
  const inputVerification = parseJson(readSingle(entries, 'evidence/input-verification.json'), 'A9_V25_INPUT_VERIFICATION');
  const buildProfileBytes = readSingle(entries, 'build-profile.json');
  const buildProfile = parseJson(buildProfileBytes, 'A9_V25_BUILD_PROFILE');
  const inputLockBytes = readSingle(entries, 'input-lock.json');
  const inputLock = parseJson(inputLockBytes, 'A9_V25_INPUT_LOCK');
  const packageManifestBytes = readSingle(entries, 'PACKAGE_MANIFEST.json');
  const packageManifest = parseJson(packageManifestBytes, 'A9_V25_PACKAGE_MANIFEST');
  const returnManifest = parseJson(readSingle(entries, 'RETURN_PACKAGE_MANIFEST.json'), 'A9_V25_RETURN_MANIFEST');
  const helperBytes = readSingle(entries, 'output/helper.exe');
  const helperSha256 = sha256(helperBytes);
  if (buildResult.schema_version !== 3 || buildResult.status !== 'PASS'
    || buildResult.candidate_eligible !== true
    || buildResult.helper_profile !== 'D-013-v25-a9-trusted-shell-current-user'
    || buildResult.helper_protocol !== 2 || buildResult.win10_smoke !== 'PASS'
    || buildResult.pe_api_crt_analysis !== 'PASS' || buildResult.logic_tests !== 'PASS'
    || buildResult.process_capture_selftest !== 'PASS' || buildResult.architecture !== 'x64'
    || buildResult.toolset !== 'v142' || buildResult.crt !== 'static /MT'
    || buildResult.profile !== 'WIN10-VS2019-V142-SDK19041-D013-V25-CURRENT-USER-X64'
    || buildResult.windows_sdk !== '10.0.19041.0'
    || buildResult.manifest !== 'embedded' || !/^[a-f0-9]{40}$/.test(buildResult.source_commit || '')
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(buildResult.run_id || '')) {
    throw new Error('A9_V25_BUILD_RESULT_NOT_ELIGIBLE');
  }
  if (environment.status !== 'PASS' || !String(environment.visual_studio_version || '').startsWith('16.11.')
    || !String(environment.msvc_version || '').startsWith('14.29.')
    || !/Windows 10/i.test(String(environment.os_caption || '')) || !/^10\.0\./.test(String(environment.os_version || ''))
    || environment.platform_toolset !== 'v142' || environment.windows_sdk_version !== '10.0.19041.0'
    || environment.network_required !== false) {
    throw new Error('A9_V25_BUILD_ENVIRONMENT_NOT_ELIGIBLE');
  }
  if (buildProfile.profile !== 'WIN10-VS2019-V142-SDK19041-D013-V25-CURRENT-USER-X64'
    || buildProfile.target?.architecture !== 'x64' || buildProfile.target?.crt !== 'static /MT (no VCRUNTIME140/MSVCP140/UCRTBASE dynamic dependencies)'
    || !Array.isArray(buildProfile.build_flags?.link)
    || !buildProfile.build_flags.link.includes('/Brepro')
    || !buildProfile.build_flags.link.includes('/INCREMENTAL:NO')) {
    throw new Error('A9_V25_BUILD_PROFILE_NOT_REPRODUCIBLE');
  }
  if (returnManifest.schema_version !== 1 || returnManifest.status !== 'PASS'
    || returnManifest.candidate_eligible !== true || !Array.isArray(returnManifest.files)
    || returnManifest.run_id !== buildResult.run_id
    || returnManifest.source_commit !== buildResult.source_commit) {
    throw new Error('A9_V25_RETURN_MANIFEST_NOT_ELIGIBLE');
  }
  const authorizedInputLock = authorizedKit.inputLockBytes;
  const authorizedPackageManifest = authorizedKit.packageManifestBytes;
  if (!inputLockBytes.equals(authorizedInputLock)
    || !packageManifestBytes.equals(authorizedPackageManifest)
    || !buildProfileBytes.equals(authorizedKit.authorizedFiles.get('build-profile.json'))
    || returnManifest.authorized_inputs?.input_lock_sha256 !== sha256(authorizedInputLock)
    || returnManifest.authorized_inputs?.package_manifest_sha256 !== sha256(authorizedPackageManifest)) {
    throw new Error('A9_V25_AUTHORIZED_KIT_BINDING_MISMATCH');
  }
  if (inputLock.source_commit !== buildResult.source_commit
    || packageManifest.source_commit !== buildResult.source_commit) {
    throw new Error('A9_V25_SOURCE_COMMIT_BINDING_MISMATCH');
  }
  verifyAuthorizedSourceSnapshot(inputLock, sourceRepositoryRoot);
  const expectedSources = Array.isArray(inputLock.sources) ? inputLock.sources : [];
  if (inputVerification.schema_version !== 1 || inputVerification.status !== 'PASS'
    || !Array.isArray(inputVerification.sources)
    || inputVerification.sources.length !== expectedSources.length
    || inputVerification.sources.some((actual, index) => {
      const expected = expectedSources[index];
      return actual?.path !== expected?.path || actual?.sha256 !== expected?.sha256
        || actual?.size !== expected?.size || actual?.status !== 'PASS';
    })) {
    throw new Error('A9_V25_INPUT_VERIFICATION_BINDING_MISMATCH');
  }
  const archiveFiles = new Map(entries.filter((entry) => !entry.directory
    && entry.name !== 'RETURN_PACKAGE_MANIFEST.json').map((entry) => [entry.name, entry]));
  if (archiveFiles.size !== returnManifest.files.length) throw new Error('A9_V25_RETURN_FILE_SET_MISMATCH');
  const seenManifestPaths = new Set();
  for (const entry of returnManifest.files) {
    if (!entry || typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.startsWith('/')
      || entry.path.split('/').includes('..') || seenManifestPaths.has(entry.path)
      || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
      throw new Error('A9_V25_RETURN_MANIFEST_ENTRY_INVALID');
    }
    seenManifestPaths.add(entry.path);
    const archived = archiveFiles.get(entry.path);
    if (!archived) throw new Error(`A9_V25_RETURN_FILE_MISSING:${entry.path}`);
    const bytes = readZipEntry(archived);
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
      throw new Error(`A9_V25_RETURN_FILE_MISMATCH:${entry.path}`);
    }
  }
  const helperEntry = returnManifest.files.find((entry) => entry.path === 'output/helper.exe');
  if (!helperEntry || helperEntry.sha256 !== helperSha256 || helperEntry.size !== helperBytes.length) {
    throw new Error('A9_V25_HELPER_RETURN_BINDING_MISMATCH');
  }
  const evidence = verifyV25ReturnEvidence((name) => readSingle(entries, name), helperBytes, buildResult, buildProfile);
  return { archiveSha256, buildResult, helperSha256, runId: buildResult.run_id, evidence };
}

export function recordA9V25HelperInput(options) {
  const runnerZip = path.resolve(options.runnerZip || '');
  const sidecar = path.resolve(options.sidecar || `${runnerZip}.sha256`);
  const runnerZip2 = path.resolve(options.runnerZip2 || '');
  const sidecar2 = path.resolve(options.sidecar2 || `${runnerZip2}.sha256`);
  const baseLockPath = path.resolve(options.baseLock || path.join(
    repositoryRoot, 'release', 'win7-product-v3', 'a9-07-input-lock.json',
  ));
  const outputPath = path.resolve(options.output || path.join(
    repositoryRoot, 'release', 'win7-product-v3', 'a9-09-input-lock.json',
  ));
  const kitZip = path.resolve(options.kitZip || '');
  if (options.testOnlyApprovedKitRegistry && options.testOnly !== true) {
    throw new Error('A9_V25_TEST_REGISTRY_REQUIRES_TEST_MODE');
  }
  const approvedKitRegistry = path.resolve(options.testOnlyApprovedKitRegistry || path.join(
    repositoryRoot, 'release', 'win7-product-v3', 'a9-v25-approved-kits.json',
  ));
  const sourceRepositoryRoot = path.resolve(options.sourceRepositoryRoot || repositoryRoot);
  for (const [label, file] of [
    ['RUNNER_ZIP', runnerZip], ['SIDECAR', sidecar],
    ['RUNNER_ZIP_2', runnerZip2], ['SIDECAR_2', sidecar2],
    ['BASE_LOCK', baseLockPath], ['BUILD_KIT_ZIP', kitZip], ['APPROVED_KIT_REGISTRY', approvedKitRegistry],
  ]) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`A9_V25_${label}_REQUIRED:${file}`);
  }
  if (fs.existsSync(outputPath)) throw new Error(`A9_V25_LOCK_REFUSES_OVERWRITE:${outputPath}`);
  if (runnerZip === runnerZip2 || sidecar === sidecar2) {
    throw new Error('A9_V25_DOUBLE_BUILD_DISTINCT_RETURNS_REQUIRED');
  }

  const approvalRegistryIdentity = options.testOnly === true && options.testOnlyApprovedKitRegistry
    ? { commit: 'TEST_ONLY', sha256: sha256(fs.readFileSync(approvedKitRegistry)), path: 'TEST_ONLY' }
    : verifyCommittedApprovalRegistry(approvedKitRegistry, sourceRepositoryRoot);
  const authorizedKit = inspectApprovedKit(kitZip, approvedKitRegistry, sourceRepositoryRoot);
  const first = inspectEligibleReturn(runnerZip, sidecar, authorizedKit, sourceRepositoryRoot);
  const second = inspectEligibleReturn(runnerZip2, sidecar2, authorizedKit, sourceRepositoryRoot);
  if (first.archiveSha256 === second.archiveSha256) {
    throw new Error('A9_V25_DOUBLE_BUILD_RETURN_HASH_REUSED');
  }
  if (first.runId === second.runId) {
    throw new Error('A9_V25_DOUBLE_BUILD_RUN_ID_REUSED');
  }
  if (first.helperSha256 !== second.helperSha256
    || first.buildResult.source_commit !== second.buildResult.source_commit
    || first.buildResult.toolset !== second.buildResult.toolset
    || first.buildResult.windows_sdk !== second.buildResult.windows_sdk) {
    throw new Error('A9_V25_DOUBLE_BUILD_MISMATCH');
  }
  const { archiveSha256, buildResult, helperSha256 } = first;

  const base = JSON.parse(fs.readFileSync(baseLockPath, 'utf8'));
  if (base.lock_id !== 'A9-07-INPUTS-20260823-01'
    || base.inputs?.runner_return_zip?.profile !== 'D-013-v24-low-risk-noninteractive') {
    throw new Error('A9_V25_HISTORICAL_V24_LOCK_INVALID');
  }
  const historicalV24 = JSON.parse(JSON.stringify(base.inputs.runner_return_zip));
  const next = {
    ...base,
    lock_id: 'A9-09-INPUTS-D013-V25',
    generated_at: new Date().toISOString(),
    inputs: {
      ...base.inputs,
      runner_return_zip_v24_historical: historicalV24,
      runner_return_zip: {
        filename: path.basename(runnerZip),
        version: 'D-013-v25-a9-trusted-shell-current-user',
        sha256: archiveSha256,
        required_entry: 'output/helper.exe',
        required_entry_sha256: helperSha256,
        profile: 'D-013-v25-a9-trusted-shell-current-user',
        protocol_version: 2,
        runtime_profile: 'a9-trusted-shell-current-user-v1',
        source_commit: buildResult.source_commit || null,
        build_kit: authorizedKit.identity,
        approval_registry: approvalRegistryIdentity,
        reproducible_builds: [
          { filename: path.basename(runnerZip), sha256: archiveSha256, run_id: first.runId, evidence_binding_sha256: first.evidence.bindingSha256 },
          { filename: path.basename(runnerZip2), sha256: second.archiveSha256, run_id: second.runId, evidence_binding_sha256: second.evidence.bindingSha256 },
        ],
        provenance: 'A9-09 locked D-017 double-clean Win10 builds with byte-identical helper; WIN7-20 remains separately required.',
      },
    },
    gates: {
      developer_package_integrity: 'NOT_PERFORMED',
      product_assembly: 'NOT_PERFORMED',
      win10: 'PASS_D013_V25_RETURN_REVIEWED',
      win7: 'NOT_PERFORMED_WIN7_20',
      alpha: 'NOT_PERFORMED',
    },
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return {
    output: outputPath,
    runnerZipSha256: archiveSha256,
    runnerZip2Sha256: second.archiveSha256,
    helperSha256,
    buildKit: authorizedKit.identity,
  };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArguments(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(recordA9V25HelperInput({
      runnerZip: args['runner-zip'], sidecar: args.sidecar,
      runnerZip2: args['runner-zip-2'], sidecar2: args['sidecar-2'],
      baseLock: args['base-lock'], output: args.output,
      kitZip: args['kit-zip'],
    }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`A9_V25_LOCK_FAILED:${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
