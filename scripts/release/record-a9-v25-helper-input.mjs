#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZipEntries, readZipEntry } from './zip-utils.mjs';

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

function inspectEligibleReturn(runnerZip, sidecar) {
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
  const buildProfile = parseJson(readSingle(entries, 'build-profile.json'), 'A9_V25_BUILD_PROFILE');
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
    || buildResult.manifest !== 'embedded' || !/^[a-f0-9]{40}$/.test(buildResult.source_commit || '')) {
    throw new Error('A9_V25_BUILD_RESULT_NOT_ELIGIBLE');
  }
  if (environment.status !== 'PASS' || !String(environment.visual_studio_version || '').startsWith('16.')
    || !String(environment.msvc_version || '').startsWith('14.2')
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
    || returnManifest.candidate_eligible !== true || !Array.isArray(returnManifest.files)) {
    throw new Error('A9_V25_RETURN_MANIFEST_NOT_ELIGIBLE');
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
  return { archiveSha256, buildResult, helperSha256 };
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
  for (const [label, file] of [
    ['RUNNER_ZIP', runnerZip], ['SIDECAR', sidecar],
    ['RUNNER_ZIP_2', runnerZip2], ['SIDECAR_2', sidecar2],
    ['BASE_LOCK', baseLockPath],
  ]) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`A9_V25_${label}_REQUIRED:${file}`);
  }
  if (fs.existsSync(outputPath)) throw new Error(`A9_V25_LOCK_REFUSES_OVERWRITE:${outputPath}`);
  if (runnerZip === runnerZip2 || sidecar === sidecar2) {
    throw new Error('A9_V25_DOUBLE_BUILD_DISTINCT_RETURNS_REQUIRED');
  }

  const first = inspectEligibleReturn(runnerZip, sidecar);
  const second = inspectEligibleReturn(runnerZip2, sidecar2);
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
        reproducible_builds: [
          { filename: path.basename(runnerZip), sha256: archiveSha256 },
          { filename: path.basename(runnerZip2), sha256: second.archiveSha256 },
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
  };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArguments(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(recordA9V25HelperInput({
      runnerZip: args['runner-zip'], sidecar: args.sidecar,
      runnerZip2: args['runner-zip-2'], sidecar2: args['sidecar-2'],
      baseLock: args['base-lock'], output: args.output,
    }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`A9_V25_LOCK_FAILED:${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
