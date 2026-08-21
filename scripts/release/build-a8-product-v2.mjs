#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
  requireBuiltDirectory,
  sha256File,
  verifyPackagedJavaScript,
  writeJson,
} from './release-contract.mjs';
import { extractZip, getZipEntry, writeDeterministicZip } from './zip-utils.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

export function buildA8ProductCandidate(options) {
  const root = path.resolve(options.repositoryRoot || repositoryRoot);
  const lockPath = path.resolve(options.lockPath || path.join(root, 'release', 'win7-product-v2', 'a8-06-input-lock.json'));
  const lock = loadJson(lockPath);
  validateA8Lock(lock);
  const sourceCommit = options.sourceCommit || git(root, ['rev-parse', 'HEAD']).trim();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('A8_SOURCE_COMMIT_INVALID');
  const sourceStatus = git(root, ['status', '--porcelain', '--untracked-files=all']).trim();
  if (sourceStatus && !options.allowUncommitted) throw new Error('A8_SOURCE_WORKTREE_NOT_CLEAN');

  const electronZip = requiredInput(options.electronZip, lock.inputs.electron_zip.filename, 'A8_ELECTRON_ZIP');
  const runnerZip = requiredInput(options.runnerZip, lock.inputs.runner_return_zip.filename, 'A8_RUNNER_ZIP');
  const storageZip = requiredInput(options.storageZip, lock.inputs.storage_return_zip.filename, 'A8_STORAGE_ZIP');
  assertHash('A8_ELECTRON_ZIP', sha256File(electronZip), lock.inputs.electron_zip.sha256);
  assertHash('A8_RUNNER_ZIP', sha256File(runnerZip), lock.inputs.runner_return_zip.sha256);
  assertHash('A8_STORAGE_ZIP', sha256File(storageZip), lock.inputs.storage_return_zip.sha256);
  const electronBytes = getZipEntry(electronZip, lock.inputs.electron_zip.required_entry);
  const helperBytes = getZipEntry(runnerZip, lock.inputs.runner_return_zip.required_entry);
  const storageBytes = getZipEntry(storageZip, lock.inputs.storage_return_zip.required_entry);
  assertHash('A8_ELECTRON_ENTRY', sha256Bytes(electronBytes), lock.inputs.electron_zip.required_entry_sha256);
  assertHash('A8_RUNNER_ENTRY', sha256Bytes(helperBytes), lock.inputs.runner_return_zip.required_entry_sha256);
  assertHash('A8_STORAGE_ENTRY', sha256Bytes(storageBytes), lock.inputs.storage_return_zip.required_entry_sha256);

  const outputRoot = path.resolve(options.outputRoot || path.join(root, 'release', 'win7-product-v2', 'out'));
  const workRoot = path.join(outputRoot, '.work');
  const packageName = `Win7CodingAgent-${lock.version}-win7-x64`;
  const stage = path.join(workRoot, packageName);
  fs.rmSync(workRoot, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  try {

  extractZip(electronZip, stage);
  const appRoot = path.join(stage, 'resources', 'app');
  const nativeRoot = path.join(stage, 'resources', 'native');
  copyDirectory(path.join(root, 'src', 'shell', 'product'), path.join(appRoot, 'product'));
  copyRuntimeJavaScript(requireBuiltDirectory(root, 'shell'), path.join(appRoot, 'dist'));
  for (const moduleName of ['core', 'gateway', 'runner', 'state', 'workspace']) {
    copyRuntimeJavaScript(requireBuiltDirectory(root, moduleName), path.join(appRoot, moduleName, 'dist'));
  }
  const runtimeDependencies = copyRuntimeDependencies(root, appRoot);
  writeJson(path.join(appRoot, 'package.json'), {
    name: 'win7-coding-agent-a8-alpha1',
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
      native_root: '../native',
      interactive_terminal: 'DISABLED',
      browser: 'DISABLED_DENY_BY_DEFAULT',
    },
  });
  fs.mkdirSync(path.join(nativeRoot, 'runner'), { recursive: true });
  fs.writeFileSync(path.join(nativeRoot, 'runner', 'spike02_helper.exe'), helperBytes);
  const runnerManifestPath = path.join(nativeRoot, 'runner', 'runner-manifest.json');
  writeJson(runnerManifestPath, createRunnerManifest(lock));
  extractStorageRuntime(storageZip, nativeRoot);
  assertNativeOutsideApp(stage);
  verifyPackagedJavaScript(appRoot);
  writeJson(path.join(appRoot, 'rc-runtime.json'), {
    schema_version: 1,
    release_id: lock.release_id,
    version: lock.version,
    native_layout: 'EXTERNAL_TO_APP_AND_ASAR',
    runner_manifest: '../native/runner/runner-manifest.json',
    runner_manifest_sha256: sha256File(runnerManifestPath),
    runner_work_directory: 'runner-work',
    storage_module_root: '../native/storage/node_modules/better-sqlite3',
    storage_native_binding: '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    storage_database: 'state/agent-events-v2.db',
    storage_profile: lock.inputs.storage_return_zip.profile,
    unsupported: ['interactive-winpty', 'arbitrary-shell', 'network-drive-storage', 'hdd-performance-claim'],
  });

  const licensesRoot = path.join(stage, 'licenses'); fs.mkdirSync(licensesRoot, { recursive: true });
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(licensesRoot, 'PROJECT-APACHE-2.0.txt'));
  if (!fs.existsSync(path.join(stage, 'LICENSE'))) throw new Error('A8_ELECTRON_LICENSE_MISSING');
  fs.copyFileSync(path.join(stage, 'LICENSE'), path.join(licensesRoot, 'ELECTRON-MIT.txt'));
  writeJson(path.join(stage, 'SBOM.cdx.json'), buildSbom(lock, sourceCommit, electronZip, runnerZip, storageZip, runtimeDependencies));
  fs.writeFileSync(path.join(stage, 'THIRD_PARTY_LICENSES.md'), a8LicenseInventory(lock), 'utf8');
  fs.writeFileSync(path.join(stage, 'INSTALLATION.md'), a8InstallationGuide(lock), 'utf8');
  const validationKit = createValidationKit(root, sourceCommit, lock);
  writeJson(path.join(stage, 'A8_06_VALIDATION_KIT.json'), validationKit);
  fs.copyFileSync(lockPath, path.join(stage, 'a8-06-input-lock.json'));
  copyEvidenceDocuments(root, stage);
  fs.mkdirSync(path.join(stage, 'validation'), { recursive: true });
  fs.copyFileSync(path.join(root, 'src', 'shell', 'tests', 'product', 'a8-validation-evidence.mjs'), path.join(stage, 'validation', 'a8-validation-evidence.mjs'));
  fs.copyFileSync(path.join(root, 'src', 'shell', 'tests', 'product', 'run-electron-review-smoke.mjs'), path.join(stage, 'validation', 'run-a8-03-electron-review-smoke.mjs'));
  fs.copyFileSync(path.join(root, 'src', 'shell', 'tests', 'product', 'run-electron-a8-04-boundary-smoke.mjs'), path.join(stage, 'validation', 'run-a8-04-boundary-smoke.mjs'));
  fs.copyFileSync(path.join(root, 'src', 'shell', 'tests', 'product', 'run-a8-05-persistence-smoke.mjs'), path.join(stage, 'validation', 'run-a8-05-persistence-smoke.mjs'));
  fs.copyFileSync(path.join(root, 'src', 'shell', 'tests', 'product', 'run-a8-05-electron-smoke.mjs'), path.join(stage, 'validation', 'run-a8-05-electron-smoke.mjs'));
  fs.copyFileSync(path.join(root, 'src', 'shell', 'tests', 'product', 'verify-a8-evidence-set.mjs'), path.join(stage, 'validation', 'verify-a8-evidence-set.mjs'));

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
    layout: { application: 'resources/app (trusted local UI)', native: 'resources/native (external to app and ASAR)', interactive_terminal: 'ABSENT', browser: 'DISABLED_DENY_BY_DEFAULT' },
    locked_inputs: {
      electron_zip: { filename: path.basename(electronZip), sha256: sha256File(electronZip) },
      runner_return_zip: { filename: path.basename(runnerZip), sha256: sha256File(runnerZip) },
      storage_return_zip: { filename: path.basename(storageZip), sha256: sha256File(storageZip) },
    },
    required_native: {
      runner_helper: lock.inputs.runner_return_zip.required_entry_sha256,
      better_sqlite3_node: lock.inputs.storage_return_zip.required_entry_sha256,
      electron_abi: lock.inputs.storage_return_zip.electron_abi,
    },
    files,
    gates: { developer_package_integrity: 'PASS', product_assembly: 'NOT_PERFORMED', win10: 'NOT_PERFORMED', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' },
  };
  writeJson(path.join(stage, 'release-manifest.json'), manifest);
  verifyA8Manifest(stage, manifest, lock);
  const zipPath = path.join(outputRoot, `${packageName}.zip`); fs.mkdirSync(outputRoot, { recursive: true }); fs.rmSync(zipPath, { force: true });
  writeDeterministicZip(workRoot, zipPath, lock.source_date_epoch);
  const zipHash = sha256File(zipPath); fs.writeFileSync(`${zipPath}.sha256`, `${zipHash}  ${path.basename(zipPath)}\n`, 'ascii');
  const buildResult = { schema_version: 1, status: 'A8_06_DEVELOPER_PACKAGE_INTEGRITY_PASS', release_id: lock.release_id, version: lock.version, source_commit: sourceCommit, source_dirty: Boolean(sourceStatus), external_acceptance_eligible: !sourceStatus, package: path.basename(zipPath), package_sha256: zipHash, manifest_sha256: sha256File(path.join(stage, 'release-manifest.json')), gates: manifest.gates };
  writeJson(path.join(outputRoot, 'A8_06_BUILD_RESULT.json'), buildResult);
  return { lock, stage, zipPath, zipHash, manifest, buildResult };
  } catch (error) {
    fs.rmSync(workRoot, { recursive: true, force: true });
    throw error;
  }
}

function createValidationKit(root, sourceCommit, lock) {
  const relative = (filePath) => path.relative(root, filePath).replace(/\\/g, '/');
  const sourceFiles = [
    'docs/prds/A8_03_SYSTEM_PROMPT_CONTRACT.md',
    'docs/prds/A8_04_TERMINAL_BROWSER_BOUNDARY_CONTRACT.md',
    'docs/prds/A8_05_PERSISTENCE_RECOVERY_MIGRATION_CONTRACT.md',
    'docs/prds/A8_06_DETERMINISTIC_PACKAGE_AND_VALIDATION_CONTRACT.md',
    'src/shell/product/desktop-host.js',
    'src/shell/product/renderer/session-ui.js',
    'src/shell/product/rc-composition.js',
    'src/state/src/a8-persistence.ts',
    'src/shell/tests/product/run-electron-review-smoke.mjs',
    'src/shell/tests/product/run-electron-a8-04-boundary-smoke.mjs',
    'src/shell/tests/product/run-a8-05-persistence-smoke.mjs',
    'src/shell/tests/product/a8-validation-evidence.mjs',
    'src/shell/tests/product/run-a8-05-electron-smoke.mjs',
    'src/shell/tests/product/verify-a8-evidence-set.mjs',
  ];
  const windowsCommands = (layer) => {
    const evidenceRoot = `..\\a8-evidence-${layer}`;
    const common = `--candidate-root=. --manifest=.\\release-manifest.json --expected-candidate-id=${lock.release_id} --validation-layer=${layer} --operator=%USERNAME%`;
    return {
      prepare_evidence_root: `if not exist ${evidenceRoot} mkdir ${evidenceRoot}`,
      preflight: `set ELECTRON_RUN_AS_NODE=1&& .\\electron.exe -v && certutil -hashfile .\\electron.exe SHA256 && certutil -hashfile .\\release-manifest.json SHA256 && certutil -hashfile .\\resources\\native\\storage\\node_modules\\better-sqlite3\\build\\Release\\better_sqlite3.node SHA256`,
      a8_03: `set ELECTRON_RUN_AS_NODE=1&& .\\electron.exe validation\\run-a8-03-electron-review-smoke.mjs --electron=.\\electron.exe --product=.\\resources\\app\\product ${common} --report=${evidenceRoot}\\a8-03-electron-review.json --screenshot=${evidenceRoot}\\a8-03-electron-review.png`,
      a8_04: `set ELECTRON_RUN_AS_NODE=1&& .\\electron.exe validation\\run-a8-04-boundary-smoke.mjs --electron=.\\electron.exe --product=.\\resources\\app\\product ${common} --report=${evidenceRoot}\\a8-04-boundary.json --screenshot=${evidenceRoot}\\a8-04-boundary.png`,
      a8_05: `set ELECTRON_RUN_AS_NODE=1&& .\\electron.exe validation\\run-a8-05-electron-smoke.mjs --electron=.\\electron.exe ${common} --report=${evidenceRoot}\\a8-05-persistence.json`,
      verify_set: `set ELECTRON_RUN_AS_NODE=1&& .\\electron.exe validation\\verify-a8-evidence-set.mjs ${common} --a8-03=${evidenceRoot}\\a8-03-electron-review.json --a8-04=${evidenceRoot}\\a8-04-boundary.json --a8-05=${evidenceRoot}\\a8-05-persistence.json --report=${evidenceRoot}\\a8-evidence-set.json`,
    };
  };
  return {
    schema_version: 2,
    kit_id: 'A8-06-VALIDATION-20260821-03',
    candidate_version: lock.version,
    source_commit: sourceCommit,
    source_files: Object.fromEntries(sourceFiles.map((item) => [item, sha256File(path.join(root, item))])),
    commands: {
      source_developer: 'npm run verify && npm run docs:check && git diff --check',
      package_developer: `node validation/run-a8-05-persistence-smoke.mjs --product=. --candidate-root=. --manifest=./release-manifest.json --expected-candidate-id=${lock.release_id} --validation-layer=developer --operator=AUTOMATED_DEVELOPER --report=../a8-evidence-developer/a8-05-persistence.json`,
      win10: windowsCommands('win10'),
      win7: windowsCommands('win7'),
      lifecycle: 'record ZIP and release-manifest SHA-256; install in a new directory beside A7; execute startup/restart/recovery, parallel co-existence, upgrade failure injection and uninstall cleanup; preserve evidence before deleting only the new candidate directory',
    },
    expected_cases: ['A8K-01', 'A8K-02', 'A8K-03', 'A8K-04', 'A8K-05', 'A8R-01-02-ELECTRON-REVIEW', 'A8UX-01-CONVERSATION-SCROLL', 'A8UX-02-TEXT-ATTACHMENT-DIALOG', 'A8T-01-TERMINAL-DISABLED', 'A8P-01-REOPEN-PROJECTION', 'A8P-02-INTERRUPT-EXECUTION', 'A8P-03-REVIEW-DRIFT', 'A8P-04-FAIL-CLOSED-CORRUPTION', 'A8M-01-A7-SENSITIVE-EXCLUSION', 'A8M-02-ALLOWLIST-IMPORT', 'A8M-03-MIGRATION-RETRY', 'A8C-01-SENSITIVE-DATA-BLOCK'],
    evidence_schema: {
      schema_version: 2,
      required_fields: ['schema_version', 'record_id', 'status', 'candidate_id', 'candidate_manifest_sha256', 'runtime_profile', 'cases', 'external_validation', 'cleanup', 'operator', 'recorded_at'],
      result_values: ['PASS', 'FAIL', 'PARTIAL', 'NOT_RUN', 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE'],
      same_candidate_required: true,
      same_candidate_enforcement: 'Every report recomputes the complete release manifest, records its SHA-256, writes outside the immutable candidate, and must pass verify-a8-evidence-set.mjs.',
    },
    evidence_classes: {
      historical_surrogate_schema_v1: {
        formal_acceptance_eligible: false,
        included_in_candidate: false,
        purpose: 'Historical developer implementation evidence only; never pass it to the A8-06 evidence-set verifier.',
      },
      formal_candidate_schema_v2: {
        required: true,
        authority: 'commands.win10 or commands.win7 in this kit',
        binding: 'candidate_id + candidate_manifest_sha256 + runtime_profile + operator',
      },
    },
    artifact_hashes: Object.fromEntries(sourceFiles.map((item) => [relative(path.join(root, item)), sha256File(path.join(root, item))])),
    external_validation: { electron_22: 'NOT_PERFORMED', win10: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE', win7: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE', rc: 'NOT_PERFORMED' },
    forbidden_actions: ['network-route-firewall-change', 'PATH-service-registry-change', 'reboot', 'interactive-terminal', 'arbitrary-browser-navigation', 'A7-database-write'],
    lifecycle: {
      install: 'new-dedicated-directory-and-userData-only',
      coexistence: 'leave-frozen-A7-directory-untouched-and-use-a-new-userData-root',
      upgrade: 'hash-before-start; retain-old-directory; fail closed on manifest/runtime mismatch',
      rollback: 'stop-candidate; preserve evidence; remove-only-new-directory-and-userData-after-hash',
      uninstall: 'remove-only-A8-directory-and-dedicated-userData; do-not-delete-A7-data',
    },
  };
}

function copyEvidenceDocuments(root, stage) {
  const statusFiles = [
    'a8-06-repair-123-checkpoint-20260822.json',
    'a8-03-developer-checkpoint-20260821.json',
    'a8-03-electron-review-validation-kit-20260821.json',
    'a8-04-developer-checkpoint-20260821.json',
    'a8-04-boundary-validation-kit-20260821.json',
    'a8-05-developer-checkpoint-20260821.json',
    'a8-05-persistence-validation-kit-20260821.json',
  ];
  const prdFiles = [
    'WIN7_AGENT_FIRST_PRODUCT_REQUIREMENTS_V1.md',
    'A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md',
    'A8_03_SYSTEM_PROMPT_CONTRACT.md',
    'A8_04_TERMINAL_BROWSER_BOUNDARY_CONTRACT.md',
    'A8_05_PERSISTENCE_RECOVERY_MIGRATION_CONTRACT.md',
    'A8_06_DETERMINISTIC_PACKAGE_AND_VALIDATION_CONTRACT.md',
  ];
  for (const [directory, files] of [['status', statusFiles], ['prds', prdFiles]]) {
    const destination = path.join(stage, 'evidence', directory);
    fs.mkdirSync(destination, { recursive: true });
    for (const file of files) {
      const source = path.join(root, 'docs', directory, file);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(destination, file));
    }
  }
}

function verifyA8Manifest(stage, manifest, lock) {
  if (manifest.status !== 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS' || manifest.gates.win10 !== 'NOT_PERFORMED' || manifest.gates.win7 !== 'NOT_PERFORMED') throw new Error('A8_MANIFEST_GATE_STATUS_INVALID');
  const appRoot = path.join(stage, 'resources', 'app');
  const nativeRoot = path.join(stage, 'resources', 'native');
  if (listPayloadFiles(appRoot).some((item) => /\.(?:node|dll|exe)$/i.test(item))) throw new Error('A8_NATIVE_INSIDE_APP_PROHIBITED');
  if (!fs.existsSync(path.join(nativeRoot, 'runner', 'spike02_helper.exe')) || !fs.existsSync(path.join(nativeRoot, 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'))) throw new Error('A8_NATIVE_LAYOUT_MISSING');
  if (manifest.required_native.electron_abi !== 110 || lock.inputs.storage_return_zip.sqlite !== '3.43.1') throw new Error('A8_NATIVE_PROFILE_INVALID');
  const actual = createFileManifest(stage, lock.forbidden_payload_patterns).filter((item) => item.path !== 'release-manifest.json');
  if (actual.length !== manifest.files.length || actual.some((item, index) => item.path !== manifest.files[index].path || item.sha256 !== manifest.files[index].sha256 || item.size !== manifest.files[index].size)) throw new Error('A8_MANIFEST_FILE_HASH_MISMATCH');
}

function validateA8Lock(lock) {
  if (!lock || lock.schema_version !== 1 || lock.version !== '0.2.0-alpha.1' || lock.inputs_are_not_a7_pass !== true || !lock.runtime_profiles?.runner) throw new Error('A8_INPUT_LOCK_INVALID');
  for (const input of Object.values(lock.inputs || {})) if (!/^[a-f0-9]{64}$/.test(input.sha256 || '') || !/^[a-f0-9]{64}$/.test(input.required_entry_sha256 || '')) throw new Error('A8_INPUT_LOCK_HASH_INVALID');
  if (lock.inputs.storage_return_zip.sqlite !== '3.43.1' || lock.inputs.storage_return_zip.electron_abi !== 110) throw new Error('A8_STORAGE_PROFILE_INVALID');
}

function requiredInput(explicit, fallbackName, label) {
  const filePath = path.resolve(explicit || fallbackName || '');
  if (!explicit || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`${label}_REQUIRED:${filePath}`);
  return filePath;
}
function sha256Bytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function git(root, args) { return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function a8LicenseInventory(lock) { return `# A8 third-party licenses and support risk\n\n| Component | Version | License | Boundary |\n|---|---:|---|---|\n| Electron | ${lock.inputs.electron_zip.version} | MIT + Chromium notices | Trusted local UI only; no arbitrary web content |\n| D-013 helper | ${lock.inputs.runner_return_zip.version} | Apache-2.0 | Low-risk noninteractive profiles only |\n| better-sqlite3 | ${lock.inputs.storage_return_zip.version} | MIT | Electron ABI ${lock.inputs.storage_return_zip.electron_abi}; local SSD |\n| SQLite | ${lock.inputs.storage_return_zip.sqlite} | Public Domain | Embedded FTS5/WAL; project owns backports |\n| ajv/runtime closure | locked package tree | MIT/BSD | Offline IPC schema validation |\n\nThis is an A8 developer candidate. EOL and Win7 compatibility remain separate evidence gates.\n`; }
function a8InstallationGuide(lock) { return `# A8 alpha installation and lifecycle\n\n- Target: ${lock.target.os}, ${lock.target.architecture}; delivery is self-contained/offline.\n- Install beside, never over, the frozen A7 0.1.0-rc.1 directory. Use a new userData/state root.\n- Do not change PATH, services, firewall, routes, registry or reboot.\n- Keep Terminal, arbitrary Shell and Browser navigation disabled. Runner is low-risk structured argv only.\n- Before startup verify release-manifest.json and the ZIP sidecar with SHA-256.\n- On upgrade failure, stop the product, retain the previous directory and state, remove only the new candidate directory, and record the failure report.\n- Uninstall removes only the A8 product directory and its dedicated userData after evidence capture; do not delete A7 data.\n- A8-06 package status remains NOT_PERFORMED for product/Win10/Win7/RC until the validation kit passes on one immutable candidate.\n`; }

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const result = buildA8ProductCandidate({ ...args, repositoryRoot });
    writeJson(path.join(path.dirname(result.zipPath), 'A8_06_BUILD_RESULT.json'), result.buildResult);
    process.stdout.write(`${JSON.stringify(result.buildResult, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`A8_BUILD_FAILED:${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--allow-uncommitted') { values.allowUncommitted = true; continue; }
    const value = argv[index + 1];
    if (!key.startsWith('--') || !value || value.startsWith('--')) throw new Error(`A8_ARGUMENT_INVALID:${key}`);
    index += 1;
    if (key === '--electron-zip') values.electronZip = value;
    else if (key === '--runner-zip') values.runnerZip = value;
    else if (key === '--storage-zip') values.storageZip = value;
    else if (key === '--output') values.outputRoot = value;
    else if (key === '--source-commit') values.sourceCommit = value;
    else throw new Error(`A8_ARGUMENT_UNKNOWN:${key}`);
  }
  if (!values.electronZip || !values.runnerZip || !values.storageZip) throw new Error('A8_ARGUMENT_REQUIRED_INPUT_ARCHIVES');
  return values;
}
