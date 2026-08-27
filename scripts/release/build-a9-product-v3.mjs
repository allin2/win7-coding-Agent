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
  requireBuiltDirectory,
  sha256File,
  verifyPackagedJavaScript,
  writeJson,
} from './release-contract.mjs';
import { extractZip, getZipEntry, readZipEntries, readZipEntry, writeDeterministicZip } from './zip-utils.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

export function buildA9ProductCandidate(options) {
  const root = path.resolve(options.repositoryRoot || repositoryRoot);
  const lockPath = path.resolve(options.lockPath || path.join(root, 'release', 'win7-product-v3', 'a9-07-input-lock.json'));
  const lock = loadJson(lockPath);
  validateA9Lock(lock);
  const sourceCommit = options.sourceCommit || git(root, ['rev-parse', 'HEAD']).trim();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('A9_SOURCE_COMMIT_INVALID');
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

  // Ignored dist directories are build outputs, never trusted inputs. Compile
  // from the current source tree before creating any candidate work directory.
  buildRuntimeDistributions(root);

  const outputRoot = path.resolve(options.outputRoot || path.join(root, 'release', 'win7-product-v3', 'out'));
  const workRoot = path.join(outputRoot, '.work');
  const packageName = `Win7CodingAgent-${lock.version}-win7-x64`;
  const stage = path.join(workRoot, packageName);
  const zipPath = path.join(outputRoot, `${packageName}.zip`);
  const temporaryZipPath = `${zipPath}.tmp-${process.pid}`;
  const temporarySidecarPath = `${zipPath}.sha256.tmp-${process.pid}`;
  fs.rmSync(workRoot, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  try {
    extractZip(electronZip, stage);
    const appRoot = path.join(stage, 'resources', 'app');
    const nativeRoot = path.join(stage, 'resources', 'native');
    copyDirectory(path.join(root, 'src', 'shell', 'product'), path.join(appRoot, 'product'));
    copyRuntimeJavaScript(requireBuiltDirectory(root, 'shell'), path.join(appRoot, 'dist'));
    for (const moduleName of ['core', 'gateway', 'git-adapter', 'runner', 'state', 'workspace']) {
      copyRuntimeJavaScript(requireBuiltDirectory(root, moduleName), path.join(appRoot, moduleName, 'dist'));
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
    fs.copyFileSync(lockPath, path.join(stage, 'a9-07-input-lock.json'));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', 'A9_07_WINDOWS_VALIDATION.md'), path.join(stage, 'A9_07_WINDOWS_VALIDATION.md'));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', 'RUN_A9_07_INTEGRITY.cmd'), path.join(stage, 'RUN_A9_07_INTEGRITY.cmd'));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', 'RUN_WIN7_17_REPORT_VERIFY.cmd'), path.join(stage, 'RUN_WIN7_17_REPORT_VERIFY.cmd'));
    const validationRoot = path.join(stage, 'validation');
    fs.mkdirSync(validationRoot, { recursive: true });
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', 'a9-package-integrity.cjs'), path.join(validationRoot, 'a9-package-integrity.cjs'));
    fs.copyFileSync(path.join(root, 'release', 'win7-product-v3', 'a9-win7-17-report.cjs'), path.join(validationRoot, 'a9-win7-17-report.cjs'));
    writeJson(path.join(stage, 'A9_07_VALIDATION_KIT.json'), createValidationKit(root, sourceCommit, lock));
    copyContractEvidence(root, stage);
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
        better_sqlite3_node: lock.inputs.storage_return_zip.required_entry_sha256,
        electron_abi: lock.inputs.storage_return_zip.electron_abi,
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
      status: 'A9_07_DEVELOPER_PACKAGE_INTEGRITY_PASS',
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
    writeJson(path.join(outputRoot, 'A9_07_BUILD_RESULT.json'), buildResult);
    return { lock, stage, zipPath, zipHash, manifest, buildResult };
  } catch (error) {
    fs.rmSync(workRoot, { recursive: true, force: true });
    fs.rmSync(temporaryZipPath, { force: true });
    fs.rmSync(temporarySidecarPath, { force: true });
    throw error;
  }
}

export function verifyA9ProductZip(zipPath, lockOrPath) {
  const lock = typeof lockOrPath === 'string' ? loadJson(lockOrPath) : lockOrPath;
  validateA9Lock(lock);
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
  for (const relative of [
    'resources/app/product/main.js',
    'resources/app/product/active-workspace-store.js',
    'resources/app/product/a9-package-runtime.js',
    'resources/app/git-adapter/dist/index.js',
    'resources/app/a9-runtime.json',
    'resources/native/runner/spike02_helper.exe',
    'resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    'validation/a9-package-integrity.cjs',
    'validation/a9-win7-17-report.cjs',
    'RUN_WIN7_17_REPORT_VERIFY.cmd',
  ]) if (!byName.has(`${rootPrefix}${relative}`)) throw new Error(`A9_ZIP_CLOSURE_MISSING:${relative}`);
  if (entries.some((entry) => /(?:^|\/)(?:winpty|node-pty|portable-data)(?:\/|$)/i.test(entry.name))) throw new Error('A9_ZIP_FORBIDDEN_PAYLOAD');
  return { manifest, fileCount: manifest.files.length, zipSha256: sha256File(zipPath) };
}

function createValidationKit(root, sourceCommit, lock) {
  const sourceFiles = [
    'docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md',
    'docs/tasks/A9_TRUSTED_AGENT_RUNTIME.md',
    'src/shell/product/main.js',
    'src/shell/product/desktop-host.js',
    'src/shell/product/active-workspace-store.js',
    'src/shell/product/a9-agent-runtime.js',
    'src/shell/product/a9-product-ipc.js',
    'src/shell/product/a9-package-runtime.js',
    'src/shell/product/preload.js',
    'src/shell/product/renderer/a9-workbench.js',
    'src/runner/src/trusted-shell-runner.ts',
    'src/runner/src/background-process-manager.ts',
    'src/core/src/git-command-policy.ts',
    'src/core/src/a9-agent-loop.ts',
    'src/state/src/a9-persistence.ts',
    'src/workspace/src/checkpoint-manager.ts',
    'scripts/release/build-a9-product-v3.mjs',
    'release/win7-product-v3/a9-win7-17-report.cjs',
  ];
  const windows = (layer) => ({
    integrity: `RUN_A9_07_INTEGRITY.cmd`,
    launch: `.\\electron.exe`,
    launch_portable: `.\\electron.exe --portable`,
    evidence_root: `..\\a9-evidence-${layer}`,
    required: layer === 'win7'
      ? 'candidate identity + integrity + startup + postflight + ADR-0098 impacted cases; other journeys follow ADR-0097 evidence inheritance'
      : 'native ABI + startup/restart + provider/DPAPI + stop cleanup',
  });
  return {
    schema_version: 1,
    kit_id: 'A9-07-VALIDATION-20260828-02',
    candidate_id: lock.release_id,
    candidate_version: lock.version,
    source_commit: sourceCommit,
    source_artifact_hashes: Object.fromEntries(sourceFiles.map((item) => [item, sha256File(path.join(root, item))])),
    commands: {
      source_developer: 'npm run verify && npm run docs:check && git diff --check',
      package_integrity: 'RUN_A9_07_INTEGRITY.cmd',
      win10: windows('win10'),
      win7: windows('win7'),
    },
    required_win7_journeys: ['J1_PROJECT_EXPLANATION', 'J2_BUG_FIX', 'J3_SMALL_FEATURE', 'J4_SHELL_AND_GIT', 'J5_UNDO_AND_RECOVERY'],
    win7_revalidation_policy: {
      decision: 'ADR-0097',
      every_candidate: ['IDENTITY', 'PACKAGE_INTEGRITY', 'STARTUP_BINDING', 'POSTFLIGHT'],
      mandatory_impacted: ['A9_SCHEMA_V4_MIGRATION', 'MULTI_CONVERSATION', 'DPAPI_DRAFT', 'APPROVAL_IDENTITY', 'CHECKPOINT_IDENTITY', 'MANAGED_PROCESS_STOP'],
      unaffected_previous_evidence: 'INHERITED_EVIDENCE_OR_OPTIONAL_REGRESSION_NOT_CURRENT_CANDIDATE_PASS',
      review: 'DEFERRED_TO_ALPHA2_KNOWN_LIMITATION',
    },
    incremental_win7_cases: createWin7IncrementalCases(),
    same_candidate_binding: ['release_id', 'package_sha256', 'release_manifest_sha256'],
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
  ];
}

function buildRuntimeDistributions(root) {
  const npmName = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npmExecutable = path.join(path.dirname(process.execPath), npmName);
  if (!fs.existsSync(npmExecutable) || !fs.statSync(npmExecutable).isFile()) {
    throw new Error(`A9_BUILD_TOOL_IDENTITY_UNAVAILABLE:${npmExecutable}`);
  }
  try {
    execFileSync(npmExecutable, ['run', 'build', '--workspaces', '--if-present'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = String((error && (error.stderr || error.message)) || error).trim().slice(0, 2000);
    throw new Error(`A9_RUNTIME_BUILD_FAILED:${detail}`);
  }
  for (const moduleName of ['shell', 'core', 'gateway', 'git-adapter', 'runner', 'state', 'workspace']) {
    requireBuiltDirectory(root, moduleName);
  }
}

function copyContractEvidence(root, stage) {
  const destination = path.join(stage, 'evidence', 'contracts');
  fs.mkdirSync(destination, { recursive: true });
  for (const relative of [
    'docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md',
    'docs/tasks/A9_TRUSTED_AGENT_RUNTIME.md',
    'docs/status/a9-01-to-a9-06-developer-gates-20260823.json',
  ]) {
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
  if (!lock || lock.schema_version !== 1 || lock.release_id !== 'WIN7-CODING-AGENT-A9-ALPHA1' ||
      lock.version !== '0.3.0-alpha.1' || lock.inputs_are_not_a9_pass !== true || !lock.runtime_profiles?.runner) {
    throw new Error('A9_INPUT_LOCK_INVALID');
  }
  for (const input of Object.values(lock.inputs || {})) {
    if (!/^[a-f0-9]{64}$/.test(input.sha256 || '') || !/^[a-f0-9]{64}$/.test(input.required_entry_sha256 || '')) throw new Error('A9_INPUT_LOCK_HASH_INVALID');
  }
  if (lock.inputs.storage_return_zip.sqlite !== '3.43.1' || lock.inputs.storage_return_zip.electron_abi !== 110) throw new Error('A9_STORAGE_PROFILE_INVALID');
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
function installationGuide(lock) { return `# A9 Alpha 1 installation and rollback\n\n- Target: ${lock.target.os}, ${lock.target.architecture}; self-contained offline ZIP; ordinary user.\n- Extract to a new directory. Do not overwrite A7, A8 or an earlier A9 directory.\n- Run RUN_A9_07_INTEGRITY.cmd before first launch, then start electron.exe. No system Node is required.\n- Default state is %LOCALAPPDATA%\\Win7CodingAgent\\a9. Use electron.exe --portable only when package-adjacent state is explicitly wanted.\n- The application does not change PATH, services, registry or firewall and does not download a runtime.\n- Keep the old program directory during upgrade. On failure stop the new candidate and relaunch the old directory against the preserved data; retain corruption backups and evidence.\n- API keys must be entered only in Settings and are remembered only through Windows DPAPI. Never put them in validation commands or reports.\n- This package remains NOT_PERFORMED for Win10, Win7 and Alpha until same-candidate external evidence is recorded.\n`; }

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
    else throw new Error(`A9_ARGUMENT_UNKNOWN:${key}`);
  }
  if (!values.electronZip || !values.runnerZip || !values.storageZip) throw new Error('A9_ARGUMENT_REQUIRED_INPUT_ARCHIVES');
  return values;
}
