#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  assertHash,
  assertNativeOutsideApp,
  buildSbom,
  copyDirectory,
  copyRuntimeDependencies,
  copyRuntimeJavaScript,
  createFileManifest,
  createRunnerManifest,
  extractStorageRuntime,
  listPayloadFiles,
  loadJson,
  sha256File,
  verifyPackagedJavaScript,
  writeJson,
} from './release-contract.mjs';
import { extractZip, getZipEntry, readZipEntries, readZipEntry, writeDeterministicZip } from './zip-utils.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const RUNTIME_MODULES = ['core', 'gateway', 'git-adapter', 'runner', 'shell', 'state', 'workspace'];

const RELEASE_PROFILES = {
  'A9-14-INPUTS-D013-V25-WIN7-22': {
    task: 'A9-14', candidate: 'WIN7-22', lockFile: 'a9-14-win7-22-input-lock.json',
    kitFile: 'A9_14_VALIDATION_KIT.json', validationDoc: 'A9_14_WINDOWS_VALIDATION.md',
    integrityCommand: 'RUN_A9_14_INTEGRITY.cmd', reportCommand: 'RUN_WIN7_22_REPORT_VERIFY.cmd',
    integrityScript: 'a9-package-integrity.cjs', reportScript: 'a9-win7-22-report.cjs',
    evidenceDirectory: 'a9-win7-22-evidence',
  },
  'A9-15-INPUTS-UI-PROGRESS-WIN7-23': {
    task: 'A9-15', candidate: 'WIN7-23', lockFile: 'a9-15-win7-23-input-lock.json',
    kitFile: 'A9_15_VALIDATION_KIT.json', validationDoc: 'A9_15_WINDOWS_VALIDATION.md',
    integrityCommand: 'RUN_A9_15_INTEGRITY.cmd', reportCommand: 'RUN_WIN7_23_REPORT_VERIFY.cmd',
    integrityScript: 'a9-package-integrity-w23.cjs', reportScript: 'a9-win7-23-report.cjs',
    extraValidationScripts: ['a9-win7-23-smoke.cjs'],
    evidenceDirectory: 'a9-win7-23-evidence',
  },
  'A9-15-INPUTS-UI-PROGRESS-WIN7-24': {
    task: 'A9-15', candidate: 'WIN7-24', lockFile: 'a9-15-win7-24-input-lock.json',
    kitFile: 'A9_15_VALIDATION_KIT.json', validationDoc: 'A9_15_WIN7_24_VALIDATION.md',
    integrityCommand: 'RUN_A9_15_W24_INTEGRITY.cmd', reportCommand: 'RUN_WIN7_24_REPORT_VERIFY.cmd',
    integrityScript: 'a9-package-integrity-w24.cjs', reportScript: 'a9-win7-24-report.cjs',
    extraValidationScripts: ['a9-win7-24-smoke.cjs'],
    evidenceDirectory: 'a9-win7-24-evidence',
  },
};

export function buildA9ProductCandidate(options) {
  const root = path.resolve(options.repositoryRoot || repositoryRoot);
  if (!options.lockPath) throw new Error('A9_WIN7_22_FORMAL_INPUT_LOCK_REQUIRED');
  const lockPath = path.resolve(options.lockPath);
  const lock = loadJson(lockPath);
  const profile = validateA9Lock(lock);
  const currentHead = git(root, ['rev-parse', 'HEAD']).trim();
  const sourceCommit = options.sourceCommit || currentHead;
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('A9_SOURCE_COMMIT_INVALID');
  if (sourceCommit !== currentHead) {
    throw new Error('A9_SOURCE_COMMIT_HEAD_MISMATCH');
  }
  const sourceStatus = git(root, ['status', '--porcelain', '--untracked-files=all']).trim();
  if (sourceStatus && !options.allowUncommitted) throw new Error('A9_SOURCE_WORKTREE_NOT_CLEAN');

  const electronZip = requiredInput(options.electronZip, 'A9_ELECTRON_ZIP');
  const runnerZip = requiredInput(options.runnerZip, 'A9_RUNNER_ZIP');
  const storageZip = requiredInput(options.storageZip, 'A9_STORAGE_ZIP');
  verifyInput('A9_ELECTRON', electronZip, lock.inputs.electron_zip);
  verifyInput('A9_RUNNER', runnerZip, lock.inputs.runner_return_zip);
  verifyInput('A9_STORAGE', storageZip, lock.inputs.storage_return_zip);

  const electronBytes = getZipEntry(electronZip, lock.inputs.electron_zip.required_entry);
  const helperBytes = getZipEntry(runnerZip, lock.inputs.runner_return_zip.required_entry);
  const storageBytes = getZipEntry(storageZip, lock.inputs.storage_return_zip.required_entry);
  assertHash('A9_ELECTRON_ENTRY', sha256Bytes(electronBytes), lock.inputs.electron_zip.required_entry_sha256);
  assertHash('A9_RUNNER_ENTRY', sha256Bytes(helperBytes), lock.inputs.runner_return_zip.required_entry_sha256);
  assertHash('A9_STORAGE_ENTRY', sha256Bytes(storageBytes), lock.inputs.storage_return_zip.required_entry_sha256);

  const outputRoot = path.resolve(options.outputRoot || path.join(root, 'release', 'win7-product-v3', 'out'));
  const workRoot = path.join(outputRoot, '.work');
  const runtimeBuildRoot = path.join(outputRoot, `.runtime-build-${process.pid}`);
  const packageName = `Win7CodingAgent-${lock.version}-win7-x64`;
  const stage = path.join(workRoot, packageName);
  const zipPath = path.join(outputRoot, `${packageName}.zip`);
  const temporaryZipPath = `${zipPath}.tmp-${process.pid}`;
  const temporarySidecarPath = `${zipPath}.sha256.tmp-${process.pid}`;
  fs.rmSync(workRoot, { recursive: true, force: true });
  fs.rmSync(runtimeBuildRoot, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  try {
    const runtimeDistributions = buildRuntimeDistributions(root, runtimeBuildRoot);
    extractZip(electronZip, stage);
    const appRoot = path.join(stage, 'resources', 'app');
    const nativeRoot = path.join(stage, 'resources', 'native');
    copyDirectory(path.join(root, 'src', 'shell', 'product'), path.join(appRoot, 'product'));
    copyRuntimeJavaScript(runtimeDistributions.get('shell'), path.join(appRoot, 'dist'));
    for (const moduleName of ['core', 'gateway', 'git-adapter', 'runner', 'state', 'workspace']) {
      copyRuntimeJavaScript(runtimeDistributions.get(moduleName), path.join(appRoot, moduleName, 'dist'));
    }
    const runtimeDependencies = copyRuntimeDependencies(root, appRoot);
    writeJson(path.join(appRoot, 'package.json'), {
      name: 'win7-coding-agent-a9-alpha1',
      productName: 'Win7 Coding Agent',
      version: lock.version,
      private: true,
      main: 'product/main.js',
      dependencies: Object.fromEntries(runtimeDependencies.map((item) => [item.name, item.version])),
      runtime_profile: {
        schema_version: 1,
        target: lock.target,
        electron: lock.inputs.electron_zip.version,
        node: '16.17.1',
        electron_abi: lock.inputs.storage_return_zip.electron_abi,
        state_schema: 4,
        native_root: '../native',
        trusted_shell: 'POWERSHELL_5_1_PREFERRED_CMD_FALLBACK',
        interactive_terminal: 'DISABLED',
        browser: 'DISABLED_DENY_BY_DEFAULT',
      },
    });

    fs.mkdirSync(path.join(nativeRoot, 'runner'), { recursive: true });
    fs.writeFileSync(path.join(nativeRoot, 'runner', 'spike02_helper.exe'), helperBytes);
    writeJson(path.join(nativeRoot, 'runner', 'runner-manifest.json'), createRunnerManifest(lock));
    extractStorageRuntime(storageZip, nativeRoot);
    assertNativeOutsideApp(stage);
    verifyPackagedJavaScript(appRoot);
    verifyA9ModuleClosure(appRoot);

    writeJson(path.join(appRoot, 'a9-runtime.json'), {
      schema_version: 1,
      release_id: lock.release_id,
      version: lock.version,
      native_layout: 'EXTERNAL_TO_APP_AND_ASAR',
      storage_module_root: '../native/storage',
      storage_native_binding: '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
      runner_helper: '../native/runner/spike02_helper.exe',
      runner_helper_profile: 'D-013-v25-a9-trusted-shell-current-user',
      runner_helper_protocol: 2,
      state_schema: 4,
      data_root: '%LOCALAPPDATA%\\Win7CodingAgent\\a9',
      portable_flag: '--portable',
      unsupported: ['interactive-terminal', 'browser-automation', 'automatic-update', 'office-specialized-editing'],
    });

    const licensesRoot = path.join(stage, 'licenses');
    fs.mkdirSync(licensesRoot, { recursive: true });
    fs.copyFileSync(path.join(root, 'LICENSE'), path.join(licensesRoot, 'PROJECT-APACHE-2.0.txt'));
    if (!fs.existsSync(path.join(stage, 'LICENSE'))) throw new Error('A9_ELECTRON_LICENSE_MISSING');
    fs.copyFileSync(path.join(stage, 'LICENSE'), path.join(licensesRoot, 'ELECTRON-MIT.txt'));
    writeJson(path.join(stage, 'SBOM.cdx.json'), buildSbom(lock, sourceCommit, electronZip, runnerZip, storageZip, runtimeDependencies));
    fs.writeFileSync(path.join(stage, 'THIRD_PARTY_LICENSES.md'), licenseInventory(lock), 'utf8');
    fs.writeFileSync(path.join(stage, 'INSTALLATION.md'), installationGuide(lock), 'utf8');
    fs.copyFileSync(lockPath, path.join(stage, profile.lockFile));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', 'A9_07_WINDOWS_VALIDATION.md'), path.join(stage, 'A9_07_WINDOWS_VALIDATION.md'));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', 'RUN_A9_07_INTEGRITY.cmd'), path.join(stage, 'RUN_A9_07_INTEGRITY.cmd'));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', profile.integrityCommand), path.join(stage, profile.integrityCommand));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', profile.validationDoc), path.join(stage, profile.validationDoc));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', profile.reportCommand), path.join(stage, profile.reportCommand));
    if (profile.candidate === 'WIN7-22') {
      fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', 'RUN_WIN7_17_REPORT_VERIFY.cmd'), path.join(stage, 'RUN_WIN7_17_REPORT_VERIFY.cmd'));
    }
    const validationRoot = path.join(stage, 'validation');
    fs.mkdirSync(validationRoot, { recursive: true });
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', profile.integrityScript), path.join(validationRoot, profile.integrityScript));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', profile.reportScript), path.join(validationRoot, profile.reportScript));
    for (const script of profile.extraValidationScripts || []) {
      fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', script), path.join(validationRoot, script));
    }
    if (profile.candidate === 'WIN7-23' || profile.candidate === 'WIN7-24') {
      const driverName = `a9-${profile.candidate.toLowerCase()}-driver.cjs`;
      fs.copyFileSync(path.join(root, 'src', 'shell', 'tests', 'product', 'a9-06-driver-entry.cjs'), path.join(validationRoot, driverName));
    }
    if (profile.candidate === 'WIN7-22') {
      fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', 'a9-win7-17-report.cjs'), path.join(validationRoot, 'a9-win7-17-report.cjs'));
    }
    writeJson(path.join(stage, profile.kitFile), createValidationKit(root, sourceCommit, lock, profile));
    copyContractEvidence(root, stage, profile);
    scanSensitivePayload(stage);

    const files = createFileManifest(stage, lock.forbidden_payload_patterns);
    const manifest = {
      schema_version: 1,
      release_id: lock.release_id,
      version: lock.version,
      source_commit: sourceCommit,
      source_dirty: Boolean(sourceStatus),
      external_acceptance_eligible: !sourceStatus,
      source_date_epoch: lock.source_date_epoch,
      status: 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS',
      target: lock.target,
      layout: {
        application: 'resources/app (trusted local UI and A9 runtime)',
        native: 'resources/native (external to app and ASAR)',
        user_data: '%LOCALAPPDATA%\\Win7CodingAgent\\a9',
        portable_data: 'portable-data only with explicit --portable',
        interactive_terminal: 'ABSENT',
        browser: 'DISABLED_DENY_BY_DEFAULT',
      },
      locked_inputs: {
        electron_zip: { filename: path.basename(electronZip), sha256: sha256File(electronZip) },
        runner_return_zip: { filename: path.basename(runnerZip), sha256: sha256File(runnerZip) },
        storage_return_zip: { filename: path.basename(storageZip), sha256: sha256File(storageZip) },
      },
      required_native: {
        runner_helper: lock.inputs.runner_return_zip.required_entry_sha256,
        runner_helper_profile: lock.inputs.runner_return_zip.profile,
        runner_helper_protocol: lock.inputs.runner_return_zip.protocol_version,
        better_sqlite3_node: lock.inputs.storage_return_zip.required_entry_sha256,
        electron_abi: lock.inputs.storage_return_zip.electron_abi,
      },
      release_authority: {
        formal_input_lock_sha256: sha256File(lockPath),
        approval_registry_commit: lock.inputs.runner_return_zip.approval_registry.commit,
        approval_registry_sha256: lock.inputs.runner_return_zip.approval_registry.sha256,
      },
      files,
      gates: {
        developer_package_integrity: 'PASS',
        product_assembly: 'NOT_PERFORMED',
        win10: 'NOT_PERFORMED',
        win7: 'NOT_PERFORMED',
        alpha: 'NOT_PERFORMED',
      },
    };
    writeJson(path.join(stage, 'release-manifest.json'), manifest);
    verifyA9Manifest(stage, manifest, lock);

    fs.mkdirSync(outputRoot, { recursive: true });
    fs.rmSync(temporaryZipPath, { force: true });
    writeDeterministicZip(workRoot, temporaryZipPath, lock.source_date_epoch);
    verifyA9ProductZip(temporaryZipPath, lock);
    const zipHash = sha256File(temporaryZipPath);
    fs.writeFileSync(temporarySidecarPath, `${zipHash}  ${path.basename(zipPath)}\n`, 'ascii');
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(`${zipPath}.sha256`, { force: true });
    fs.renameSync(temporaryZipPath, zipPath);
    fs.renameSync(temporarySidecarPath, `${zipPath}.sha256`);
    const buildResult = {
      schema_version: 1,
      status: `${profile.task.replace('-', '_')}_DEVELOPER_PACKAGE_INTEGRITY_PASS`,
      release_id: lock.release_id,
      version: lock.version,
      source_commit: sourceCommit,
      source_dirty: Boolean(sourceStatus),
      external_acceptance_eligible: !sourceStatus,
      package: path.basename(zipPath),
      package_sha256: zipHash,
      manifest_sha256: sha256File(path.join(stage, 'release-manifest.json')),
      gates: manifest.gates,
    };
    writeJson(path.join(outputRoot, `${profile.task.replace('-', '_')}_BUILD_RESULT.json`), buildResult);
    fs.rmSync(runtimeBuildRoot, { recursive: true, force: true });
    return { lock, stage, zipPath, zipHash, manifest, buildResult };
  } catch (error) {
    fs.rmSync(workRoot, { recursive: true, force: true });
    fs.rmSync(runtimeBuildRoot, { recursive: true, force: true });
    fs.rmSync(temporaryZipPath, { force: true });
    fs.rmSync(temporarySidecarPath, { force: true });
    throw error;
  }
}

export function verifyA9ProductZip(zipPath, lockOrPath) {
  const lock = typeof lockOrPath === 'string' ? loadJson(lockOrPath) : lockOrPath;
  const profile = validateA9Lock(lock);
  const entries = readZipEntries(zipPath).filter((entry) => !entry.directory);
  const manifestEntries = entries.filter((entry) => entry.name.endsWith('/release-manifest.json'));
  if (manifestEntries.length !== 1) throw new Error(`A9_ZIP_MANIFEST_COUNT:${manifestEntries.length}`);
  const rootPrefix = manifestEntries[0].name.slice(0, -'release-manifest.json'.length);
  const manifest = JSON.parse(readZipEntry(manifestEntries[0]).toString('utf8'));
  if (manifest.release_id !== lock.release_id || manifest.version !== lock.version ||
      manifest.status !== 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS') throw new Error('A9_ZIP_MANIFEST_IDENTITY_INVALID');
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const expected = new Set([`${rootPrefix}release-manifest.json`]);
  for (const file of manifest.files || []) {
    const name = `${rootPrefix}${file.path}`;
    const entry = byName.get(name);
    if (!entry) throw new Error(`A9_ZIP_MANIFEST_FILE_MISSING:${file.path}`);
    const bytes = readZipEntry(entry);
    if (bytes.length !== file.size || sha256Bytes(bytes) !== file.sha256) throw new Error(`A9_ZIP_MANIFEST_FILE_MISMATCH:${file.path}`);
    expected.add(name);
  }
  for (const entry of entries) if (!expected.has(entry.name)) throw new Error(`A9_ZIP_UNMANIFESTED_FILE:${entry.name}`);
  const commonClosure = [
    'resources/app/product/main.js',
    'resources/app/product/active-workspace-store.js',
    'resources/app/product/a9-package-runtime.js',
    'resources/app/git-adapter/dist/index.js',
    'resources/app/a9-runtime.json',
    'resources/native/runner/spike02_helper.exe',
    'resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  ];
  const profileClosure = [
    `validation/${profile.integrityScript}`, `validation/${profile.reportScript}`,
    profile.kitFile, profile.validationDoc, profile.integrityCommand, profile.reportCommand,
    ...(profile.extraValidationScripts || []).map((item) => `validation/${item}`),
    ...(['WIN7-23', 'WIN7-24'].includes(profile.candidate)
      ? [`validation/a9-${profile.candidate.toLowerCase()}-driver.cjs`] : []),
    ...(profile.candidate === 'WIN7-22' ? ['validation/a9-win7-17-report.cjs', 'RUN_WIN7_17_REPORT_VERIFY.cmd'] : []),
  ];
  for (const relative of [...commonClosure, ...profileClosure]) {
    if (!byName.has(`${rootPrefix}${relative}`)) throw new Error(`A9_ZIP_CLOSURE_MISSING:${relative}`);
  }
  if (entries.some((entry) => /(?:^|\/)(?:winpty|node-pty|portable-data)(?:\/|$)/i.test(entry.name))) throw new Error('A9_ZIP_FORBIDDEN_PAYLOAD');
  return { manifest, fileCount: manifest.files.length, zipSha256: sha256File(zipPath) };
}

function createValidationKit(root, sourceCommit, lock, profile) {
  if (profile.candidate === 'WIN7-23' || profile.candidate === 'WIN7-24') {
    return createA915ValidationKit(root, sourceCommit, lock, profile);
  }
  return createWin22ValidationKit(root, sourceCommit, lock);
}

function createWin22ValidationKit(root, sourceCommit, lock) {
  const sourceFiles = [
    'docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md',
    'docs/tasks/A9_TRUSTED_AGENT_RUNTIME.md',
    'docs/tasks/A9_09_D013_TRUSTED_SHELL_PROFILE.md',
    'native/helper/helper.cpp',
    'native/helper/protocol.cpp',
    'native/helper/whitelist.cpp',
    'src/shell/product/main.js',
    'src/shell/product/desktop-host.js',
    'src/shell/product/active-workspace-store.js',
    'src/shell/product/a9-agent-runtime.js',
    'src/shell/product/a9-product-ipc.js',
    'src/shell/product/a9-package-runtime.js',
    'src/shell/product/preload.js',
    'src/shell/product/renderer/a9-workbench.js',
    'src/shell/product/renderer/workbench.html',
    'src/shell/tests/product/a9-06-driver-entry.cjs',
    'src/runner/src/index.ts',
    'src/runner/src/shell-detection.ts',
    'src/runner/src/trusted-shell-runner.ts',
    'src/runner/src/trusted-shell-environment.ts',
    'src/runner/src/native-transport.ts',
    'src/runner/src/background-process-manager.ts',
    'src/core/src/git-command-policy.ts',
    'src/core/src/a9-agent-loop.ts',
    'src/state/src/a9-persistence.ts',
    'src/workspace/src/checkpoint-manager.ts',
    'native/helper/argv_builder.cpp',
    'native/helper/argv_builder.h',
    'docs/tasks/A9_14_D013_CMD_VERBATIM_AND_WIN7_22.md',
    'release/win7-product-v3/a9-14-win7-22-input-lock.json',
    'scripts/release/build-a9-product-v3.mjs',
    'release/win7-product-v3/a9-package-integrity.cjs',
    'release/win7-product-v3/RUN_A9_14_INTEGRITY.cmd',
    'release/win7-product-v3/A9_14_WINDOWS_VALIDATION.md',
    'release/win7-product-v3/RUN_WIN7_22_REPORT_VERIFY.cmd',
    'release/win7-product-v3/a9-win7-17-report.cjs',
    'release/win7-product-v3/a9-win7-22-report.cjs',
  ];
  const windows = (layer) => ({
    integrity: `RUN_A9_14_INTEGRITY.cmd`,
    launch: `.\\electron.exe`,
    launch_portable: `.\\electron.exe --portable`,
    evidence_root: `..\\a9-evidence-${layer}`,
    required: layer === 'win7'
      ? 'candidate identity + integrity + formal Electron startup + WIN7-19 schema v4 backup/canonicalization/data/rollback evidence + ADR-0101 D-013 v25 impacted cases; only unaffected journeys follow ADR-0097 evidence inheritance'
      : 'native ABI + startup/restart + provider/DPAPI + stop cleanup',
  });
  const schemaV4SourceHashes = {
    'src/state/src/a9-persistence.ts': '7c939264107a730f4eb835ff3a3f199a1c45c7066a1f9bef7a552cce39d5ac09',
    'src/state/src/schema.ts': 'a2bd34b3477f2a261da4240feb08cdb9b9c1162175f5b1e2ef2f83da7b0fc90a',
  };
  for (const [relative, expected] of Object.entries(schemaV4SourceHashes)) {
    if (sha256File(path.join(root, relative)) !== expected) {
      throw new Error(`A9_WIN7_22_SCHEMA_V4_SOURCE_DRIFT:${relative}`);
    }
  }
  return {
    schema_version: 2,
    kit_id: 'A9-14-WIN7-22-D013-CMD-VERBATIM-20260903-01',
    candidate_id: lock.release_id,
    candidate_version: lock.version,
    source_commit: sourceCommit,
    required_runner_helper_sha256: lock.inputs.runner_return_zip.required_entry_sha256,
    source_artifact_hashes: Object.fromEntries(sourceFiles.map((item) => [item, sha256File(path.join(root, item))])),
    external_release_authority: {
      schema_version: 1,
      kind: 'WIN7_22_RELEASE_AUTHORITY',
      required_arguments: ['formal-input-lock', 'approval-registry', 'release-authority', 'release-authority-sha256'],
      pin_source: 'INDEPENDENT_RELEASE_APPROVAL_NOT_CANDIDATE_OR_SIDECAR',
      instructions: 'A9_14_WINDOWS_VALIDATION.md',
    },
    commands: {
      source_developer: 'npm run verify && npm run docs:check && git diff --check',
      package_integrity: 'RUN_A9_14_INTEGRITY.cmd',
      win10: windows('win10'),
      win7: windows('win7'),
    },
    required_win7_journeys: ['J1_PROJECT_EXPLANATION', 'J2_BUG_FIX', 'J3_SMALL_FEATURE', 'J4_SHELL_AND_GIT', 'J5_UNDO_AND_RECOVERY'],
    win7_revalidation_policy: {
      decision: 'ADR-0097',
      every_candidate: ['IDENTITY', 'PACKAGE_INTEGRITY', 'STARTUP_BINDING', 'POSTFLIGHT'],
      mandatory_impacted: ['WIN7_19_SCHEMA_V4_PROFILE', 'MIGRATION_BACKUP', 'ATOMIC_CANONICALIZATION', 'DATA_PRESERVATION', 'ROLLBACK_DIAGNOSTICS', 'ELECTRON_STARTUP', 'D013_V25_PROFILE', 'D013_PROTOCOL_V2', 'CURRENT_USER_TOKEN', 'SHELL_IDENTITY', 'ENV_OVERLAY_SECRET_FILTER', 'NO_DEADLINE', 'READY_ACK', 'MANAGED_PROCESS_STOP'],
      unaffected_previous_evidence: 'INHERITED_EVIDENCE_OR_OPTIONAL_REGRESSION_NOT_CURRENT_CANDIDATE_PASS',
      review: 'DEFERRED_TO_ALPHA2_KNOWN_LIMITATION',
    },
    inherited_evidence: {
      decision: 'ADR-0097',
      allowed_case_prefix: 'W17-',
      candidate: {
        release_id: 'WIN7-CODING-AGENT-A9-ALPHA1',
        version: '0.3.0-alpha.1',
        source_commit: '781b20e3da277570f85c28286d7ea5bbbdd5fa28',
        package_filename: 'Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip',
        package_sha256: '824a10cd213534aca87c348d8304b053d27a5bd896831daf528ed13b1c1c72b0',
        manifest_sha256: 'b483e9b0bcab19cf96114bda39e5d8a9ef8a48842c9aaabbaabfa7e87af12c26',
      },
      evidence_sources: [
        {
          source_id: 'win7_19_final_disposition',
          path: 'WIN7-19/WIN7-19-final-disposition.json',
          sha256: 'cf57d6816285b9472b9b7f718348d3cdefbe9cfad2bb4c96d80c7bcbbf81290f',
          required_values: [
            { json_pointer: '/schema_version', value: 1 },
            { json_pointer: '/candidate_id', value: 'WIN7-19' },
            { json_pointer: '/decision', value: 'GO_FOR_ALPHA' },
            { json_pointer: '/candidate/source_commit', value: '781b20e3da277570f85c28286d7ea5bbbdd5fa28' },
            { json_pointer: '/candidate/package_sha256', value: '824a10cd213534aca87c348d8304b053d27a5bd896831daf528ed13b1c1c72b0' },
            { json_pointer: '/candidate/manifest_sha256', value: 'b483e9b0bcab19cf96114bda39e5d8a9ef8a48842c9aaabbaabfa7e87af12c26' },
            { json_pointer: '/report_verifier/verified_cases', value: 8 },
          ],
        },
        {
          source_id: 'win7_19_inherited_ledger',
          path: 'WIN7-19/WIN7-19-INHERITED-EVIDENCE.json',
          sha256: 'c224d6b6a82960f4d4cbf8ddc1b302d2f8aad9e8dd8bd649c9c6078f99d44252',
          required_values: [
            { json_pointer: '/schema_version', value: 1 },
            { json_pointer: '/candidate_id', value: 'WIN7-19' },
            { json_pointer: '/policy', value: 'ADR-0097_IMPACT_SCOPED_INCREMENTAL_REVALIDATION' },
            { json_pointer: '/current_source_commit', value: '781b20e3da277570f85c28286d7ea5bbbdd5fa28' },
          ],
        },
        {
          source_id: 'win7_19_incremental_report',
          path: 'WIN7-19/win7-19-incremental-report.json',
          sha256: '1e6c1227ded871c045786de7296b14af7b761b5a8fa0ab7a2e7016d5fad3c2ca',
          required_values: [
            { json_pointer: '/schema_version', value: 1 },
            { json_pointer: '/report_kind', value: 'WIN7_17_INCREMENTAL_ACCEPTANCE' },
            { json_pointer: '/candidate/source_commit', value: '781b20e3da277570f85c28286d7ea5bbbdd5fa28' },
            { json_pointer: '/candidate/package_sha256', value: '824a10cd213534aca87c348d8304b053d27a5bd896831daf528ed13b1c1c72b0' },
            { json_pointer: '/results/4/case_id', value: 'W17-APPROVAL-COMPOUND-SHELL' },
            { json_pointer: '/results/4/status', value: 'PASS' },
          ],
        },
      ],
      case_bindings: {
        'W17-CONVERSATION-16-ISOLATION': [{ source_id: 'win7_19_inherited_ledger', json_pointer: '/inherited_unaffected_scope/0' }],
        'W17-HISTORY-BOUNDARY': [{ source_id: 'win7_19_inherited_ledger', json_pointer: '/inherited_unaffected_scope/0' }],
        'W17-SCHEMA-V3-V4-ROLLBACK': [{ source_id: 'win7_19_inherited_ledger', json_pointer: '/inherited_unaffected_scope/1' }],
        'W17-DPAPI-DRAFT': [{ source_id: 'win7_19_inherited_ledger', json_pointer: '/inherited_unaffected_scope/0' }],
        'W17-APPROVAL-COMPOUND-SHELL': [{ source_id: 'win7_19_incremental_report', json_pointer: '/results/4' }],
        'W17-CHECKPOINT-CRASH': [{ source_id: 'win7_19_inherited_ledger', json_pointer: '/inherited_unaffected_scope/2' }],
        'W17-MANAGED-PROCESS-DOUBLE-STOP': [{ source_id: 'win7_19_inherited_ledger', json_pointer: '/inherited_unaffected_scope/3' }],
        'W17-WIN7-PATH-ENCODING-TOKENS': [{ source_id: 'win7_19_inherited_ledger', json_pointer: '/inherited_unaffected_scope/4' }],
      },
      rule: 'Each W17 case may use INHERITED_EVIDENCE only through its kit-locked JSON pointer into the exact hashed WIN7-19 disposition, ledger, or incremental report under evidence_root.',
    },
    schema_v4_inheritance: {
      status: 'INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH',
      source_commit: 'd28c1b9510d6d528f07e8a76a7527b4fc25c35ba',
      from_candidate: {
        candidate_id: 'WIN7-21',
        result: 'FIX_BEFORE_ALPHA',
        package_sha256: '069851faab007b88c858fd23a387c4a22fa309de3e0e2400b7c07a00bc733f8d',
        manifest_sha256: 'dbc68d2cf15f57a3c80915544a11cb19ac60ba75ef002249bbe0bd52a8f13df8',
        scope: 'schema-v4 migration and rollback only; no WIN7-21 candidate PASS is inherited',
      },
      source_artifact_hashes: schemaV4SourceHashes,
      evidence: [
        { path: 'WIN7-21-schema/w21-schema-migration-isolated.json', sha256: 'a8f4ac185c7b374145ccb10d1ce7a21a01070137e93ef5cae44b2d3359f782c0' },
        { path: 'WIN7-21-schema/w21-schema-rollback.json', sha256: '3adfbd30638dbe3016926b9a6f7f2bd23e75d1653b746bd0368e4258ce25d93d' },
        { path: 'WIN7-21-schema/w21-schema-rollback-injection.json', sha256: '0ca0ede9a41560e244025e0ba5a30e688bfff55b6272f0535073ae95281ba9a6' },
        { path: 'WIN7-21-schema/w21-schema-rollback-diagnostics.json', sha256: '4d33bff2c0b64df426548c394805e6353b7f3ab9ee902fcd8faf86e59dfc0f2d' },
      ],
    },
    incremental_win7_cases: createWin7IncrementalCases(),
    same_candidate_binding: ['release_id', 'package_sha256', 'manifest_sha256'],
    external_validation: { win10: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE', win7: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE', alpha: 'NOT_PERFORMED' },
    forbidden_actions: ['write-secret-to-report', 'evidence-inside-candidate', 'runtime-download', 'PATH-service-registry-firewall-change', 'claim-Windows-pass-from-developer-machine'],
  };
}

function createWin7IncrementalCases() {
  const caseOf = (caseId, preconditions, steps, expected, evidence) => ({
    case_id: caseId,
    preconditions,
    steps,
    expected,
    assertions: expected.map((text, index) => ({ assertion_id: `${caseId}-A${index + 1}`, expected: text })),
    evidence,
  });
  return [
    caseOf('W17-CONVERSATION-16-ISOLATION',
      ['1366x768 at 100% DPI, repeat at 125%', 'one Chinese/space workspace', 'Provider configured'],
      ['create 16 unarchived conversations', 'rename/switch/archive/restore conversations', 'attempt a 17th conversation', 'start a Turn and verify switching is blocked'],
      ['16 survive restart', '17th is refused', 'task/turn/run/approval/checkpoint/draft/provider context never crosses conversation identity'],
      ['100% and 125% screenshots', 'redacted conversation export', 'SQLite identity query']),
    caseOf('W17-HISTORY-BOUNDARY',
      ['two conversations with distinguishable markers'],
      ['create more than 20 local turns', 'restart and inspect full local history', 'submit after Provider context exceeds 20 turns and 32000 characters'],
      ['local history remains complete', 'Provider request uses the documented bounded context', 'no marker from another conversation'],
      ['redacted Provider request capture', 'local history screenshot', 'boundary counts']),
    caseOf('W17-SCHEMA-V3-V4-ROLLBACK',
      ['copy of a v3 database with known rows', 'write failure injection for migration copy'],
      ['open once and record backup path/hash', 'verify legacy session becomes 历史对话', 'repeat with injected failure and malformed/empty a9_meta'],
      ['backup SHA-256 precedes migration', 'success preserves facts', 'failure rolls back and enters diagnostics without WAL/SHM or source overwrite'],
      ['database hashes before/after', 'backup file/hash', 'diagnostics screenshot']),
    caseOf('W17-DPAPI-DRAFT',
      ['ordinary-user Windows token', 'DPAPI available for Current User'],
      ['save different drafts in two conversations', 'restart as same user', 'open as another user or corrupt ciphertext', 'scan data/evidence for plaintext'],
      ['same user restores each draft', 'other user/corruption degrades to memory-only', 'plaintext is absent from SQLite/events/checkpoints/logs/snapshots'],
      ['ciphertext row', 'redacted UI screenshots', 'plaintext scan result']),
    caseOf('W17-APPROVAL-COMPOUND-SHELL',
      ['local bare remote with safe.directory configured', 'PowerShell 5.1 and CMD fallback available'],
      ['request git push through grouping, CMD if, PowerShell if block and cmd /c grouping', 'approve one exact target', 'retry an old/duplicate card and changed target', 'Stop a long approved Shell command'],
      ['every push has one current identity-bound card', 'old/duplicate/changed approvals cannot execute', 'Stop reaches the resumed command and no remote write occurs before approval'],
      ['approval identity JSON', 'remote refs before/after', 'process cleanup evidence']),
    caseOf('W17-CHECKPOINT-CRASH',
      ['file with known preimage', 'full checkpoint ID visible'],
      ['modify the file in a Turn', 'terminate after workspace manifest write but before final Turn persistence', 'restart and copy full checkpoint ID', 'undo Turn'],
      ['Turn is interrupted and not replayed', 'manifest binds only to its original conversation', 'undo restores the preimage after restart'],
      ['manifest and SQLite rows', 'copied full checkpoint ID', 'before/after SHA-256']),
    caseOf('W17-MANAGED-PROCESS-DOUBLE-STOP',
      ['one foreground long command and one managed background command'],
      ['Stop foreground Turn', 'Stop background process after Turn completion', 'restart with recovered PID fact', 'attempt normal exit', 'verify the PID in the system, stop it externally, then click Stop again and retry exit'],
      ['both Stop paths remain reachable', 'unconfirmed recovered PID is never killed by the app and keeps the workspace lock', 'after external identity-aware stop, the second Stop observes exit and retry leaves zero residue'],
      ['PID/tree snapshots', 'shutdown result', 'postflight process list']),
    caseOf('W17-WIN7-PATH-ENCODING-TOKENS',
      ['ordinary-user and administrator token runs', 'PowerShell 5.1 and CMD fallback', 'REDUCED_RECOVERY_BASELINE recorded'],
      ['exercise Chinese/space, CP936/UTF-8/UTF-16, CRLF/LF, junction and near-MAX_PATH fixtures', 'repeat critical Shell/Stop flow under both tokens', 'record SSH/Bitvise strict-host-key handshake state without disabling verification'],
      ['supported paths preserve bytes/newlines or fail structurally', 'token level is truthful', 'strict host-key verification remains enabled and handshake closure is classified as environment evidence'],
      ['fixture hashes', 'token/elevation evidence', 'SSH/Bitvise verbose log', 'postflight residue scan']),
    caseOf('W22-WIN7-19-SCHEMA-V4-COMPAT',
      ['ordinary-user token', 'immutable copy of the exact WIN7-19 schema v4 profile with known session/draft/metadata rows', 'new WIN7-22 candidate identity and integrity PASS'],
      ['record source database and sidecar hashes plus PRAGMA table/index/quick_check evidence',
        'launch the formal Electron candidate against the copied profile and wait for workbench ready',
        'close cleanly; record migration backup path/hash/quick_check and canonical PRAGMA schema',
        'verify every known session, draft and metadata fact and the last_activated_at fallback',
        'hold an external SQLite BEGIN IMMEDIATE write lock with the candidate Electron Node runtime, then launch the formal Electron candidate against a fresh copied profile'],
      ['formal Electron startup reaches ready without A9_PERSISTENCE_DIAGNOSTICS',
        'one pre-migration backup binds the exact preimage and passes independent quick_check',
        'the live database is canonical schema v4 and preserves all known facts',
        'the external write-lock injection forces the repair transaction to roll back byte-identically, preserves the consistent backup and enters restricted diagnostics',
        'no WIN7-20 candidate, authority, report or result is used as current-candidate evidence'],
      ['pre/post database and sidecar SHA-256 ledger', 'backup SHA-256 and independent quick_check output',
        'PRAGMA table_info/index_list/index_xinfo/sqlite_master capture', 'session/draft/metadata row export with secrets redacted',
        'Electron startup/ready evidence', 'external BEGIN IMMEDIATE injector log', 'restricted-diagnostics capture and rollback hash evidence']),
    caseOf('W22-D013-V25-CURRENT-USER',
      ['ordinary-user token', 'PowerShell 5.1 and CMD available', 'v25 helper and protocol v2 manifest-bound'],
      ['run equivalent workspace write through PowerShell and CMD', 'run one user-configured explicit Shell', 'inspect helper readiness/result proofs and workdir ACL before/after'],
      ['child is the same ordinary user Primary Token', 'restrictedToken/lowIntegrity/workDirAclModified are false', 'Job/input/output proofs are true', 'workspace write succeeds without elevation'],
      ['redacted protocol transcript', 'token SID/elevation facts', 'workdir SDDL before/after', 'created-file hashes']),
    caseOf('W22-D013-V25-ENV-IDENTITY',
      ['non-secret workspace overlay configured', 'known Provider secret retained only in DPAPI/memory'],
      ['read non-secret overlay from CMD and PowerShell', 'attempt secret-shaped and all NODE_*/ELECTRON_*/TLS controls',
        'use synthetic known secrets and Base64/Base64URL/percent variants under ordinary names in inherited environment and overlay',
        'restore old settings, rotate Provider credentials and restart; explicitly reapply rejected settings',
        'change configured Shell bytes/path after identity capture'],
      ['ordinary overlay is visible to the child', 'secret/control variables are rejected without value echo',
        'known values and encoded variants are absent from probes, helper and foreground/background child environments',
        'rejected persisted overlays are cleared across workspaces and remain blocked after restart until user reconfiguration',
        'inherited Provider secrets are absent', 'identity mismatch fails before child execution'],
      ['redacted output', 'zero-hit secret scan', 'file hashes before/after', 'structured rejection codes']),
    caseOf('W22-D013-V25-NO-DEADLINE-STOP',
      ['protocol v2 deadlineMode=none', 'one foreground long command'],
      ['run beyond the historical fixed timeout boundary or a compressed acceptance equivalent', 'confirm it remains active', 'press Stop', 'repeat Stop after final result'],
      ['no artificial total/idle timeout fires', 'first Stop reaches the same request and reclaims the Job tree', 'repeat Stop causes no new execution', 'final cleanupConfirmed is true'],
      ['monotonic timestamps', 'request IDs', 'PID/tree snapshots', 'postflight zero-residue scan']),
    caseOf('W22-D013-V25-BACKGROUND-READY',
      ['managed v2 command that creates a child process', 'clean and crash-recovery variants'],
      ['start background command', 'verify UI running state appears only after execution_started', 'Stop twice', 'restart with recovered PID fact and exercise exit lock'],
      ['persisted PID is childPid rather than helperPid', 'ready proves Job/stdin/double capture', 'uncertain cleanup stays cleanup_required', 'recovered PID is not identity-blind killed', 'confirmed stop leaves zero residue'],
      ['ready/result transcript', 'persisted managed-process row', 'PID/tree snapshots', 'shutdown decision and postflight']),
  ];
}

function createA915ValidationKit(root, sourceCommit, lock, profile) {
  const casePrefix = profile.candidate.replace('WIN7-', 'W');
  const decision = profile.candidate === 'WIN7-24' ? 'ADR-0116' : 'ADR-0115';
  const historicalCandidate = profile.candidate === 'WIN7-24' ? 'WIN7-23' : 'WIN7-22';
  const sourceFiles = [
    'docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md',
    'docs/tasks/A9_TRUSTED_AGENT_RUNTIME.md',
    'docs/tasks/A9_15_UI_PROGRESS_FEEDBACK.md',
    'src/core/src/a9-agent-loop.ts',
    'src/core/src/system-prompt.ts',
    'src/state/src/a9-persistence.ts',
    'src/shell/product/a9-agent-runtime.js',
    'src/shell/product/a9-product-ipc.js',
    'src/shell/product/preload.js',
    'src/shell/product/renderer/a9-workbench.css',
    'src/shell/product/renderer/a9-workbench.js',
    'src/shell/product/renderer/workbench.html',
    ...(profile.candidate === 'WIN7-24' ? ['src/shell/tests/product/a9-06-driver-entry.cjs'] : []),
    'scripts/release/build-a9-product-v3.mjs',
    `release/win7-product-v3/${profile.lockFile}`,
    `release/win7-product-v3/${profile.integrityScript}`,
    `release/win7-product-v3/${profile.reportScript}`,
    `release/win7-product-v3/${profile.extraValidationScripts[0]}`,
    `release/win7-product-v3/${profile.integrityCommand}`,
    `release/win7-product-v3/${profile.reportCommand}`,
    `release/win7-product-v3/${profile.validationDoc}`,
  ];
  const caseOf = (caseId, purpose, assertions, evidence) => {
    const normalizedCaseId = caseId.replace(/^W23-/, `${casePrefix}-`);
    return {
      case_id: normalizedCaseId,
      purpose,
      environment: {
        os: 'Windows 7 SP1 build 7601', architecture: 'x64',
        user: 'ordinary-user', elevation: 'not-elevated', runtime: 'Electron 22.3.27 / ABI 110',
      },
      assertions: assertions.map((description, index) => ({
        assertion_id: `${normalizedCaseId}-A${String(index + 1).padStart(2, '0')}`,
        description,
      })),
      evidence,
    };
  };
  return {
    schema_version: 1,
    kit_id: `A9-15-${profile.candidate}-UI-PROGRESS-20260909-01`,
    candidate_id: lock.release_id,
    candidate_label: profile.candidate,
    candidate_version: lock.version,
    source_commit: sourceCommit,
    required_runner_helper_sha256: lock.inputs.runner_return_zip.required_entry_sha256,
    source_artifact_hashes: Object.fromEntries(sourceFiles.map((item) => [item, sha256File(path.join(root, item))])),
    external_release_authority: {
      schema_version: 1,
      kind: `${profile.candidate.replace('-', '_')}_RELEASE_AUTHORITY`,
      required_arguments: ['formal-input-lock', 'approval-registry', 'release-authority', 'release-authority-sha256'],
      pin_source: 'INDEPENDENT_RELEASE_APPROVAL_NOT_CANDIDATE_OR_SIDECAR',
      instructions: profile.validationDoc,
    },
    commands: {
      source_developer: 'npm run verify && npm run docs:check && git diff --check',
      package_integrity: profile.integrityCommand,
      direct_smoke: profile.candidate === 'WIN7-24'
        ? `.\\electron.exe .\\validation\\${profile.extraValidationScripts[0]} --evidence-root=<candidate-external-evidence-root>`
        : '.\\electron.exe .\\validation\\a9-win7-23-smoke.cjs --mode=<automatic|interactive>',
      report_verify: profile.reportCommand,
    },
    scope: {
      decision,
      result_on_complete: 'A9_15_WIN7_UI_INTEGRATION_PASS',
      does_not_reissue: ['A9_14_WIN7_22_GO_FOR_ALPHA', 'RC_PASS'],
      historical_candidate: `${historicalCandidate} remains immutable and is not reclassified`,
      provider_rule: `A real configured Provider multi-tool turn is mandatory; fixture evidence cannot satisfy ${casePrefix}-07.`,
    },
    required_cases: [
      caseOf('W23-01-IDENTITY-INTEGRITY-STARTUP',
        'Bind the clean candidate and prove the formal packaged Electron entry starts for the ordinary user.',
        ['external authority, ZIP, manifest, lock and full tree all match', 'Electron main/preload/IPC/renderer reaches ready', 'renderer has no Node/process capability', 'normal exit leaves no candidate Electron process'],
        ['package-integrity JSON', 'ordinary-user token capture', 'startup and exit transcript', 'post-exit process snapshot']),
      caseOf('W23-02-PROGRESS-TIMELINE',
        'Exercise model_note, tool activity grouping, stable IDs and one final result through the formal product UI.',
        ['multi-tool turn shows model note before the associated tool', 'tool_start/tool_end share callId and step', 'eventId/sequence remain stable without duplicate rendering', 'final answer appears exactly once after process cards'],
        ['redacted event export', 'fixture request/response transcript', 'completed UI screenshot']),
      caseOf('W23-03-HISTORY-RESTART-PAGINATION',
        'Prove process history persists, reloads in order and can page without crossing conversations.',
        ['restart restores prior process events without replaying the model request', 'load-more uses beforeEventId and adds older events once', 'cross-conversation query is rejected', 'legacy turn without events visibly states that process history is unavailable'],
        ['SQLite event query export', 'restart transcript', 'pagination/cross-session UI captures']),
      caseOf('W23-04-APPROVAL-FAILURE-ORDER',
        'Prove approval decisions and failures are truthfully ordered and rendered.',
        ['approval_resolved is persisted before resumed tool_start', 'denial performs no target side effect', 'non-zero/tool error/cancelled/unknown cleanup are never labelled successful', 'retry after history-query failure is visible and succeeds without duplicate events'],
        ['approval and event export', 'target hash before/after', 'failure and retry screenshots']),
      caseOf('W23-05-WAIT-STOP-CLEANUP',
        'Prove long waits and cancellation use observed timing and cleanup facts.',
        ['after more than 10 seconds the UI names the actual wait object and observed duration', 'no fabricated percentage or unobserved work claim appears', 'Stop binds the active turn and reaches its process tree', 'cleanupConfirmed and the postflight process list agree'],
        ['monotonic timing transcript', 'waiting UI screenshot', 'PID tree before/after', 'cancellation event export']),
      caseOf('W23-06-SEARCH-FOCUS-VISUAL',
        'Exercise the approved A9-15 workbench interaction and visual surface on Win7.',
        ['Ctrl+K searches active and archived titles with empty/clear/restore states', 'incremental updates preserve focus, scroll and expanded activity state', 'warm three-column layout and primary controls remain readable at target viewport', 'all model/path/command/output text is rendered as text and truncation is explicit'],
        ['search/focus interaction transcript', 'empty/running/approval/completed screenshots', 'viewport and zoom facts']),
      caseOf('W23-07-REAL-PROVIDER-MULTITOOL',
        'Confirm the process-feedback contract with a real configured Provider rather than the local fixture.',
        ['Provider probe reports tool_calling', 'one real multi-tool turn completes through the formal UI', 'at least one real model note or truthful tool-activity fallback appears during the turn', 'Provider credentials are absent from events, logs, screenshots and report'],
        ['redacted Provider identity/probe result', 'redacted multi-tool event export', 'zero-hit secret scan', 'running and completed screenshots']),
      caseOf('W23-08-POSTFLIGHT-IMMUTABILITY',
        'Close the run without changing candidate bytes or leaving product state/process residue outside the declared profile.',
        ['ZIP and manifest hashes equal the approved candidate', 'candidate full tree remains manifest-equal', 'no candidate Electron/helper child remains', 'evidence contains no API key, bearer token or private key material'],
        ['postflight integrity JSON', 'process snapshot', 'evidence secret-scan result']),
    ],
  };
}

function buildRuntimeDistributions(root, outputRoot) {
  const distributions = new Map();
  for (const moduleName of RUNTIME_MODULES) {
    const moduleRoot = path.join(root, 'src', moduleName);
    const moduleRequire = createRequire(path.join(moduleRoot, 'package.json'));
    let compiler;
    try {
      compiler = moduleRequire.resolve('typescript/bin/tsc');
    } catch {
      throw new Error(`A9_BUILD_TOOL_IDENTITY_UNAVAILABLE:src/${moduleName}/node_modules/typescript/bin/tsc`);
    }
    const destination = path.join(outputRoot, moduleName);
    fs.mkdirSync(destination, { recursive: true });
    try {
      execFileSync(process.execPath, [
        compiler,
        '--project', path.join(moduleRoot, 'tsconfig.json'),
        '--outDir', destination,
        '--declaration', 'false',
        '--declarationMap', 'false',
        '--sourceMap', 'false',
      ], {
        cwd: moduleRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const detail = String((error && (error.stderr || error.stdout || error.message)) || error).trim().slice(0, 2000);
      throw new Error(`A9_RUNTIME_BUILD_FAILED:${moduleName}:${detail}`);
    }
    const files = listPayloadFiles(destination);
    if (!files.length || files.some((item) => path.extname(item).toLowerCase() !== '.js')) {
      throw new Error(`A9_RUNTIME_BUILD_OUTPUT_INVALID:${moduleName}`);
    }
    distributions.set(moduleName, destination);
  }
  return distributions;
}

function copyContractEvidence(root, stage, profile) {
  const destination = path.join(stage, 'evidence', 'contracts');
  fs.mkdirSync(destination, { recursive: true });
  const contracts = [
    'docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md',
    'docs/tasks/A9_TRUSTED_AGENT_RUNTIME.md',
    'docs/tasks/A9_09_D013_TRUSTED_SHELL_PROFILE.md',
    'docs/status/a9-01-to-a9-06-developer-gates-20260823.json',
    profile.candidate === 'WIN7-23' || profile.candidate === 'WIN7-24'
      ? 'docs/tasks/A9_15_UI_PROGRESS_FEEDBACK.md'
      : 'docs/tasks/A9_14_D013_CMD_VERBATIM_AND_WIN7_22.md',
  ];
  for (const relative of contracts) {
    const source = path.join(root, relative);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(destination, path.basename(source)));
  }
}

function verifyA9Manifest(stage, manifest, lock) {
  if (manifest.status !== 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS' ||
      manifest.gates.win10 !== 'NOT_PERFORMED' || manifest.gates.win7 !== 'NOT_PERFORMED' || manifest.gates.alpha !== 'NOT_PERFORMED') {
    throw new Error('A9_MANIFEST_GATE_STATUS_INVALID');
  }
  const appRoot = path.join(stage, 'resources', 'app');
  const nativeRoot = path.join(stage, 'resources', 'native');
  if (listPayloadFiles(appRoot).some((item) => /\.(?:node|dll|exe)$/i.test(item))) throw new Error('A9_NATIVE_INSIDE_APP_PROHIBITED');
  for (const required of [
    path.join(appRoot, 'git-adapter', 'dist', 'index.js'),
    path.join(appRoot, 'a9-runtime.json'),
    path.join(appRoot, 'product', 'active-workspace-store.js'),
    path.join(nativeRoot, 'runner', 'spike02_helper.exe'),
    path.join(nativeRoot, 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
  ]) if (!fs.existsSync(required)) throw new Error(`A9_PACKAGE_CLOSURE_MISSING:${required}`);
  if (manifest.required_native.electron_abi !== 110 || lock.inputs.storage_return_zip.sqlite !== '3.43.1') throw new Error('A9_NATIVE_PROFILE_INVALID');
  const actual = createFileManifest(stage, lock.forbidden_payload_patterns).filter((item) => item.path !== 'release-manifest.json');
  if (actual.length !== manifest.files.length || actual.some((item, index) => item.path !== manifest.files[index].path || item.sha256 !== manifest.files[index].sha256 || item.size !== manifest.files[index].size)) {
    throw new Error('A9_MANIFEST_FILE_HASH_MISMATCH');
  }
}

function verifyA9ModuleClosure(appRoot) {
  const appRequire = createRequire(path.join(appRoot, 'package.json'));
  for (const entry of ['./git-adapter/dist/index.js', './product/a9-package-runtime.js']) {
    try { appRequire(entry); }
    catch (error) { throw new Error(`A9_PACKAGED_MODULE_LOAD_FAILED:${entry}:${error && error.message ? error.message : String(error)}`); }
  }
}

function scanSensitivePayload(stage) {
  const patterns = [
    /sk-[A-Za-z0-9_-]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{16,}/i,
  ];
  for (const relative of listPayloadFiles(stage)) {
    const absolute = path.join(stage, ...relative.split('/'));
    if (fs.statSync(absolute).size > 4 * 1024 * 1024 || /\.(?:exe|dll|node|pak|bin|dat|png|ico)$/i.test(relative)) continue;
    const text = fs.readFileSync(absolute, 'utf8');
    if (patterns.some((pattern) => pattern.test(text))) throw new Error(`A9_SENSITIVE_PAYLOAD_PROHIBITED:${relative}`);
  }
}

function validateA9Lock(lock) {
  const profile = lock && RELEASE_PROFILES[lock.lock_id];
  if (!profile || lock.schema_version !== 1
      || lock.release_id !== 'WIN7-CODING-AGENT-A9-ALPHA1' ||
      lock.version !== '0.3.0-alpha.1' || lock.inputs_are_not_a9_pass !== true || !lock.runtime_profiles?.runner) {
    throw new Error('A9_INPUT_LOCK_INVALID');
  }
  for (const input of Object.values(lock.inputs || {})) {
    if (!/^[a-f0-9]{64}$/.test(input.sha256 || '') || !/^[a-f0-9]{64}$/.test(input.required_entry_sha256 || '')) throw new Error('A9_INPUT_LOCK_HASH_INVALID');
  }
  if (lock.inputs.storage_return_zip.sqlite !== '3.43.1' || lock.inputs.storage_return_zip.electron_abi !== 110) throw new Error('A9_STORAGE_PROFILE_INVALID');
  if (lock.inputs.runner_return_zip.profile !== 'D-013-v25-a9-trusted-shell-current-user' ||
      lock.inputs.runner_return_zip.protocol_version !== 2) throw new Error('A9_D013_V25_PROFILE_INVALID');
  const win22Provenance = profile.candidate === 'WIN7-22'
    && lock.gates?.win10 === 'PASS_D013_V25_RETURN_REVIEWED'
    && lock.gates?.win7 === 'NOT_PERFORMED_WIN7_22'
    && lock.provenance?.task === 'A9-14' && lock.provenance?.superseded_candidate === 'WIN7-21'
    && lock.provenance?.superseded_candidate_result === 'FIX_BEFORE_ALPHA';
  const win23Provenance = profile.candidate === 'WIN7-23'
    && lock.gates?.win10 === 'INHERITED_NATIVE_INPUTS_FROM_WIN7_22_EXACT_HASH'
    && lock.gates?.win7 === 'NOT_PERFORMED_WIN7_23'
    && lock.provenance?.task === 'A9-15' && lock.provenance?.previous_candidate === 'WIN7-22'
    && lock.provenance?.previous_candidate_result === 'A9_14_WIN7_22_GO_FOR_ALPHA'
    && lock.provenance?.change_scope === 'UI_PROGRESS_FEEDBACK';
  const win24Provenance = profile.candidate === 'WIN7-24'
    && lock.gates?.win10 === 'INHERITED_NATIVE_INPUTS_FROM_WIN7_22_EXACT_HASH'
    && lock.gates?.win7 === 'NOT_PERFORMED_WIN7_24'
    && lock.provenance?.task === 'A9-15' && lock.provenance?.previous_candidate === 'WIN7-23'
    && lock.provenance?.previous_candidate_result === 'FIX_BEFORE_WIN7_24_VALIDATION'
    && lock.provenance?.change_scope === 'VALIDATION_DRIVER_LAUNCH_AND_WIN7_TYPOGRAPHY_CLARITY';
  if (lock.gates?.alpha !== 'NOT_PERFORMED' || (!win22Provenance && !win23Provenance && !win24Provenance)) {
    throw new Error('A9_WIN7_22_INPUT_LOCK_PROVENANCE_INVALID');
  }
  const runner = lock.inputs.runner_return_zip;
  if (runner.runtime_profile !== 'a9-trusted-shell-current-user-v1'
    || !runner.build_kit || runner.build_kit.source_commit !== runner.source_commit
    || !runner.approval_registry || !/^[a-f0-9]{40}$/.test(String(runner.approval_registry.commit || ''))
    || !/^[a-f0-9]{64}$/.test(String(runner.approval_registry.sha256 || ''))
    || runner.approval_registry.path !== 'release/win7-product-v3/a9-v25-approved-kits.json'
    || !Array.isArray(runner.reproducible_builds) || runner.reproducible_builds.length !== 2
    || new Set(runner.reproducible_builds.map((item) => item.sha256)).size !== 2
    || new Set(runner.reproducible_builds.map((item) => item.run_id)).size !== 2
    || runner.reproducible_builds.some((item) => !/^[a-f0-9]{64}$/.test(String(item.sha256 || ''))
      || !/^[a-f0-9]{64}$/.test(String(item.evidence_binding_sha256 || '')))
    || runner.sha256 !== runner.reproducible_builds[0].sha256) {
    throw new Error('A9_D013_V25_RELEASE_AUTHORITY_INVALID');
  }
  return profile;
}

function verifyInput(label, filePath, input) { assertHash(`${label}_ZIP`, sha256File(filePath), input.sha256); }
function requiredInput(value, label) {
  const filePath = path.resolve(value || '');
  if (!value || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`${label}_REQUIRED:${filePath}`);
  return filePath;
}
function sha256Bytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function git(root, args) { return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function licenseInventory(lock) { return `# A9 third-party licenses and support risk\n\n| Component | Version | License | Boundary |\n|---|---:|---|---|\n| Electron | ${lock.inputs.electron_zip.version} | MIT + Chromium notices | Trusted local UI; no untrusted web content |\n| D-013 helper | ${lock.inputs.runner_return_zip.version} | Apache-2.0 | Process containment compatibility input |\n| better-sqlite3 | ${lock.inputs.storage_return_zip.version} | MIT | Electron ABI 110; local data root |\n| SQLite | ${lock.inputs.storage_return_zip.sqlite} | Public Domain | A9 Schema v4, WAL/backup/recovery |\n| ajv/runtime closure | locked package tree | MIT/BSD | Offline IPC schema validation |\n\nElectron 22 and Node 16 are EOL inputs retained for Win7 compatibility. Win7 support is established only by same-candidate real-machine evidence.\n`; }
function installationGuide(lock) {
  const profile = RELEASE_PROFILES[lock.lock_id];
  return `# A9 Alpha 1 installation and rollback\n\n- Target: ${lock.target.os}, ${lock.target.architecture}; self-contained offline ZIP; ordinary user.\n- Extract to a new directory. Do not overwrite A7, A8, WIN7-19, WIN7-20, WIN7-21, WIN7-22 or an earlier A9 directory.\n- Before running candidate executables, use the trusted repository verifier and independently approved release-authority SHA-256 for preflight (${profile.validationDoc}). Then run ${profile.integrityCommand} with the original ZIP, external formal input lock, external approval registry, external release authority and its approved SHA-256. No system Node is required on Win7.\n- Default state is %LOCALAPPDATA%\\Win7CodingAgent\\a9. Use electron.exe --portable only when package-adjacent state is explicitly wanted.\n- The application does not change PATH, services, registry or firewall and does not download a runtime.\n- Keep the old program directory during upgrade. On failure stop the new candidate and relaunch the old directory against the preserved data; retain corruption backups and evidence.\n- API keys must be entered only in Settings and are remembered only through Windows DPAPI. Never put them in validation commands or reports.\n- This package remains NOT_PERFORMED for Win10, Win7 and Alpha until same-candidate external evidence is recorded.\n`;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    const result = buildA9ProductCandidate({ ...parseArguments(process.argv.slice(2)), repositoryRoot });
    process.stdout.write(`${JSON.stringify(result.buildResult, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`A9_BUILD_FAILED:${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--allow-uncommitted') { values.allowUncommitted = true; continue; }
    const value = argv[index + 1];
    if (!key.startsWith('--') || !value || value.startsWith('--')) throw new Error(`A9_ARGUMENT_INVALID:${key}`);
    index += 1;
    if (key === '--electron-zip') values.electronZip = value;
    else if (key === '--runner-zip') values.runnerZip = value;
    else if (key === '--storage-zip') values.storageZip = value;
    else if (key === '--output') values.outputRoot = value;
    else if (key === '--source-commit') values.sourceCommit = value;
    else if (key === '--formal-input-lock') values.lockPath = value;
    else throw new Error(`A9_ARGUMENT_UNKNOWN:${key}`);
  }
  if (!values.electronZip || !values.runnerZip || !values.storageZip) throw new Error('A9_ARGUMENT_REQUIRED_INPUT_ARCHIVES');
  return values;
}
