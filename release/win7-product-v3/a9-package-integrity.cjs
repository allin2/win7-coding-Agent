'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

function selectPhysicalFileSystem(runtimeVersions = process.versions, loadOriginalFs = () => require('original-fs')) {
  if (!runtimeVersions || !runtimeVersions.electron) return fs;
  try {
    const physicalFs = loadOriginalFs();
    for (const method of ['existsSync', 'realpathSync', 'readdirSync', 'readFileSync', 'statSync']) {
      if (!physicalFs || typeof physicalFs[method] !== 'function') throw new Error(`missing_${method}`);
    }
    return physicalFs;
  } catch (error) {
    throw new Error(`A9_PHYSICAL_FILESYSTEM_UNAVAILABLE:${error && error.message ? error.message : String(error)}`);
  }
}

function argument(argv, name, fallback) {
  const prefix = `--${name}=`;
  const value = argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fileHash(filePath, fileSystem = fs) { return hash(fileSystem.readFileSync(filePath)); }
function listFiles(root, current = root, out = [], fileSystem = fs) {
  for (const entry of fileSystem.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`A9_PACKAGE_SYMLINK_PROHIBITED:${absolute}`);
    if (entry.isDirectory()) listFiles(root, absolute, out, fileSystem);
    else if (entry.isFile()) out.push(path.relative(root, absolute).replace(/\\/g, '/'));
    else throw new Error(`A9_PACKAGE_SPECIAL_FILE_PROHIBITED:${absolute}`);
  }
  return out;
}

function verifyFullTree(candidateRoot, manifest, fileSystem) {
  const expected = new Map(manifest.files.map((item) => [item.path, item]));
  if (expected.size !== manifest.files.length) throw new Error('duplicate manifest path');
  const actual = listFiles(candidateRoot, candidateRoot, [], fileSystem).filter((item) => item !== 'release-manifest.json');
  if (actual.length !== expected.size) throw new Error(`file count ${actual.length} != ${expected.size}`);
  for (const relative of actual) {
    const item = expected.get(relative);
    const absolute = path.join(candidateRoot, ...relative.split('/'));
    if (!item) throw new Error(`unmanifested:${relative}`);
    const actualSize = fileSystem.statSync(absolute).size;
    const actualSha256 = fileHash(absolute, fileSystem);
    if (actualSize !== item.size || actualSha256 !== item.sha256) {
      throw new Error(`mismatch:${relative};expected_size=${item.size};actual_size=${actualSize};expected_sha256=${item.sha256};actual_sha256=${actualSha256}`);
    }
  }
}

const ACCEPTANCE_REQUIRED_FILES = [
  'electron.exe', 'LICENSE', 'LICENSES.chromium.html', 'SBOM.cdx.json', 'THIRD_PARTY_LICENSES.md', 'INSTALLATION.md',
  'licenses/PROJECT-APACHE-2.0.txt', 'licenses/ELECTRON-MIT.txt', 'a9-14-win7-22-input-lock.json',
  'resources/app/package.json', 'resources/app/a9-runtime.json',
  ...[
    'a8-product-ipc.js', 'a9-agent-runtime.js', 'a9-package-runtime.js', 'a9-product-ipc.js',
    'active-workspace-store.js', 'credential-vault.js', 'desktop-host.js', 'desktop-ipc.js',
    'gateway-runtime.js', 'main.js', 'package.json', 'policy.js', 'preload.js', 'rc-composition.js',
    'replay.js', 'runner-runtime.js', 'security-policy.js',
    'renderer/a8-workspace.css', 'renderer/a9-agent-panel.js', 'renderer/a9-workbench.css',
    'renderer/a9-workbench.js', 'renderer/composer-controller.js', 'renderer/conversation-projector.js',
    'renderer/event-queue.js', 'renderer/gateway-settings-payload.js', 'renderer/index.html',
    'renderer/renderer.js', 'renderer/runner-log.js', 'renderer/session-ui.js',
    'renderer/styles.css', 'renderer/workbench.html',
  ].map((name) => `resources/app/product/${name}`),
  ...[
    'dist/errors.js', 'dist/index.js',
    ...['a9-agent-loop', 'a9-mode-settings', 'a9-tools', 'agents-discovery', 'approval-binding', 'broker',
      'concurrency', 'context-bootstrap', 'context-compactor', 'context-manager', 'context', 'errors',
      'git-command-policy', 'index', 'loop-control', 'model-retry', 'policy', 'review-tools', 'runtime-helpers',
      'runtime-protocol', 'runtime-types', 'runtime', 'state-machine', 'system-prompt', 'token-estimator',
      'tool-observation', 'tools', 'types', 'verification', 'working-memory', 'workspace-readonly-tools',
      'workspace-tools'].map((name) => `core/dist/${name}.js`),
    'gateway/dist/index.js',
    ...['adapter', 'index', 'isolation', 'session', 'trusted-projection', 'types', 'whitelist']
      .map((name) => `git-adapter/dist/${name}.js`),
    ...['approval', 'background-process-manager', 'containment', 'index', 'native-protocol', 'native-runner',
      'native-transport', 'output', 'process-cleanup', 'profiles', 'runner', 'shell-detection',
      'trusted-shell-adapter', 'trusted-shell-environment', 'trusted-shell-runner', 'types'].map((name) => `runner/dist/${name}.js`),
    ...['a8-persistence', 'a8-session-catalog', 'a9-persistence', 'audit', 'backlog', 'event-protocol',
      'event-stream', 'index', 'replay', 'runtime-event-adapter', 'runtime-message-projector', 'schema',
      'sqlite-event-ledger', 'store', 'types', 'wal'].map((name) => `state/dist/${name}.js`),
    ...['a9-ignore', 'a9-workspace-service', 'apply', 'atomic', 'checkpoint-manager', 'diff', 'encoding',
      'index', 'plan', 'readonly-port', 'readonly', 'replace', 'review-staging', 'safety', 'shadow',
      'trusted-write', 'types'].map((name) => `workspace/dist/${name}.js`),
  ].map((name) => `resources/app/${name}`),
  'resources/native/runner/spike02_helper.exe', 'resources/native/runner/runner-manifest.json',
  'resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'A9_14_VALIDATION_KIT.json', 'A9_14_WINDOWS_VALIDATION.md', 'RUN_A9_14_INTEGRITY.cmd',
  'RUN_WIN7_22_REPORT_VERIFY.cmd', 'RUN_WIN7_17_REPORT_VERIFY.cmd',
  'validation/a9-package-integrity.cjs', 'validation/a9-win7-17-report.cjs',
  'validation/a9-win7-22-report.cjs',
];

function readCandidateJson(candidateRoot, relative, fileSystem) {
  try { return JSON.parse(fileSystem.readFileSync(path.join(candidateRoot, ...relative.split('/')), 'utf8')); }
  catch (_error) { throw new Error(`A9_W22_CANDIDATE_JSON_INVALID:${relative}`); }
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function verifyPe32PlusAmd64(filePath, role, expectDll, fileSystem) {
  const bytes = fileSystem.readFileSync(filePath);
  if (bytes.length < 0x100 || bytes.readUInt16LE(0) !== 0x5a4d) throw new Error(`A9_W22_NATIVE_NOT_PE:${role}`);
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 0x40 || pe + 24 > bytes.length || bytes.readUInt32LE(pe) !== 0x00004550
    || bytes.readUInt16LE(pe + 4) !== 0x8664 || bytes.readUInt16LE(pe + 6) === 0) {
    throw new Error(`A9_W22_NATIVE_NOT_AMD64_PE:${role}`);
  }
  const optionalSize = bytes.readUInt16LE(pe + 20);
  const characteristics = bytes.readUInt16LE(pe + 22);
  if (optionalSize < 0xf0 || pe + 24 + optionalSize > bytes.length || bytes.readUInt16LE(pe + 24) !== 0x20b
    || (characteristics & 0x0002) === 0 || Boolean(characteristics & 0x2000) !== expectDll) {
    throw new Error(`A9_W22_NATIVE_PE_CONTRACT_INVALID:${role}`);
  }
  const sectionStart = pe + 24 + optionalSize;
  const sectionCount = bytes.readUInt16LE(pe + 6);
  if (sectionCount > 96 || sectionStart + sectionCount * 40 > bytes.length) {
    throw new Error(`A9_W22_NATIVE_PE_SECTIONS_INVALID:${role}`);
  }
  let payloadSections = 0;
  for (let index = 0; index < sectionCount; index += 1) {
    const section = sectionStart + index * 40;
    const size = bytes.readUInt32LE(section + 16);
    const offset = bytes.readUInt32LE(section + 20);
    if (size && (offset < sectionStart + sectionCount * 40 || offset + size > bytes.length)) {
      throw new Error(`A9_W22_NATIVE_PE_SECTION_TRUNCATED:${role}`);
    }
    if (size) payloadSections += 1;
  }
  if (!payloadSections) throw new Error(`A9_W22_NATIVE_PE_PAYLOAD_MISSING:${role}`);
}

function verifyAcceptanceAuthority(candidateRoot, authority, fileSystem) {
  if (!authority || typeof authority.formalInputLockPath !== 'string'
    || typeof authority.approvalRegistryPath !== 'string'
    || typeof authority.releaseAuthorityPath !== 'string'
    || !/^[a-f0-9]{64}$/.test(String(authority.releaseAuthoritySha256 || ''))) {
    throw new Error('A9_W22_EXTERNAL_AUTHORITY_REQUIRED');
  }
  const unresolvedLock = path.resolve(authority.formalInputLockPath);
  const unresolvedRegistry = path.resolve(authority.approvalRegistryPath);
  const unresolvedAuthority = path.resolve(authority.releaseAuthorityPath);
  if (!fileSystem.existsSync(unresolvedLock) || !fileSystem.statSync(unresolvedLock).isFile()
    || !fileSystem.existsSync(unresolvedRegistry) || !fileSystem.statSync(unresolvedRegistry).isFile()
    || !fileSystem.existsSync(unresolvedAuthority) || !fileSystem.statSync(unresolvedAuthority).isFile()) {
    throw new Error('A9_W22_EXTERNAL_AUTHORITY_NOT_FILE');
  }
  const formalInputLockPath = fileSystem.realpathSync(unresolvedLock);
  const approvalRegistryPath = fileSystem.realpathSync(unresolvedRegistry);
  const releaseAuthorityPath = fileSystem.realpathSync(unresolvedAuthority);
  if (contained(candidateRoot, formalInputLockPath) || contained(candidateRoot, approvalRegistryPath)
    || contained(candidateRoot, releaseAuthorityPath)) {
    throw new Error('A9_W22_EXTERNAL_AUTHORITY_INSIDE_CANDIDATE');
  }
  if (path.basename(formalInputLockPath).toLowerCase() !== 'a9-14-win7-22-input-lock.json'
    || path.basename(approvalRegistryPath).toLowerCase() !== 'a9-v25-approved-kits.json') {
    throw new Error('A9_W22_EXTERNAL_AUTHORITY_FILENAME_INVALID');
  }
  const formalBytes = fileSystem.readFileSync(formalInputLockPath);
  const registryBytes = fileSystem.readFileSync(approvalRegistryPath);
  const authorityBytes = fileSystem.readFileSync(releaseAuthorityPath);
  // The pin must be supplied from the independent release approval, never
  // inferred from the candidate, its sidecar, or this external file itself.
  if (hash(authorityBytes) !== authority.releaseAuthoritySha256) throw new Error('A9_W22_AUTHORITY_PIN_MISMATCH');
  const packagedBytes = fileSystem.readFileSync(path.join(candidateRoot, 'a9-14-win7-22-input-lock.json'));
  if (!formalBytes.equals(packagedBytes)) throw new Error('A9_W22_FORMAL_INPUT_LOCK_BYTE_MISMATCH');
  let lock;
  let registry;
  let approvedRelease;
  try {
    lock = JSON.parse(formalBytes.toString('utf8'));
    registry = JSON.parse(registryBytes.toString('utf8'));
    approvedRelease = JSON.parse(authorityBytes.toString('utf8'));
  } catch (_error) { throw new Error('A9_W22_EXTERNAL_AUTHORITY_JSON_INVALID'); }
  if (approvedRelease.schema_version !== 1 || approvedRelease.kind !== 'WIN7_22_RELEASE_AUTHORITY'
    || approvedRelease.status !== 'APPROVED_FOR_WIN7_22_VALIDATION'
    || approvedRelease.formal_input_lock_sha256 !== hash(formalBytes)
    || approvedRelease.approval_registry?.sha256 !== hash(registryBytes)
    || !/^[a-f0-9]{40}$/.test(String(approvedRelease.approval_registry?.commit || ''))
    || !/^[a-f0-9]{64}$/.test(String(approvedRelease.candidate?.package_sha256 || ''))
    || !/^[a-f0-9]{64}$/.test(String(approvedRelease.candidate?.manifest_sha256 || ''))
    || !/^[a-f0-9]{40}$/.test(String(approvedRelease.candidate?.source_commit || ''))) {
    throw new Error('A9_W22_RELEASE_AUTHORITY_BINDING_INVALID');
  }
  const runner = lock.inputs?.runner_return_zip;
  const approval = runner?.approval_registry;
  const buildKit = runner?.build_kit;
  const builds = runner?.reproducible_builds;
  const registrySha256 = hash(registryBytes);
  if (!approval || !/^[a-f0-9]{40}$/.test(String(approval.commit || ''))
    || approval.commit !== approvedRelease.approval_registry.commit
    || approval.path !== 'release/win7-product-v3/a9-v25-approved-kits.json'
    || approval.sha256 !== registrySha256 || registry.schema_version !== 1 || !Array.isArray(registry.kits)
    || !buildKit || buildKit.source_commit !== runner.source_commit
    || !/^[a-f0-9]{40}$/.test(String(buildKit.source_commit || ''))
    || typeof buildKit.revision !== 'string' || !buildKit.revision
    || typeof buildKit.filename !== 'string' || !buildKit.filename
    || !/^[a-f0-9]{64}$/.test(String(buildKit.sha256 || ''))
    || !/^[a-f0-9]{64}$/.test(String(buildKit.input_lock_sha256 || ''))
    || !/^[a-f0-9]{64}$/.test(String(buildKit.package_manifest_sha256 || ''))
    || !Array.isArray(builds) || builds.length !== 2) {
    throw new Error('A9_W22_EXTERNAL_AUTHORITY_CONTRACT_INVALID');
  }
  const approved = registry.kits.find((item) => item?.status === 'APPROVED_FOR_RETURN_RECORDING'
    && item.revision === buildKit.revision && item.filename === buildKit.filename
    && item.sha256 === buildKit.sha256 && item.source_commit === buildKit.source_commit
    && item.input_lock_sha256 === buildKit.input_lock_sha256
    && item.package_manifest_sha256 === buildKit.package_manifest_sha256);
  if (!approved) throw new Error('A9_W22_BUILD_KIT_NOT_EXTERNALLY_APPROVED');
  const seenArchives = new Set();
  const seenRuns = new Set();
  const seenBindings = new Set();
  const seenFilenames = new Set();
  for (const build of builds) {
    if (!build || typeof build.filename !== 'string' || build.filename.length === 0
      || !/^[a-f0-9]{64}$/.test(String(build.sha256 || ''))
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(build.run_id || ''))
      || !/^[a-f0-9]{64}$/.test(String(build.evidence_binding_sha256 || ''))
      || seenArchives.has(build.sha256) || seenRuns.has(build.run_id.toLowerCase())
      || seenBindings.has(build.evidence_binding_sha256) || seenFilenames.has(build.filename.toLowerCase())) {
      throw new Error('A9_W22_REPRODUCIBLE_BUILD_BINDING_INVALID');
    }
    seenArchives.add(build.sha256);
    seenRuns.add(build.run_id.toLowerCase());
    seenBindings.add(build.evidence_binding_sha256);
    seenFilenames.add(build.filename.toLowerCase());
  }
  if (runner.sha256 !== builds[0].sha256 || runner.filename !== builds[0].filename) throw new Error('A9_W22_PRIMARY_RETURN_BINDING_INVALID');
  return {
    lock,
    approvedCandidate: approvedRelease.candidate,
    identity: {
      release_authority_sha256: hash(authorityBytes),
      formal_input_lock_sha256: hash(formalBytes),
      approval_registry_commit: approval.commit,
      approval_registry_sha256: registrySha256,
    },
  };
}

function verifyAcceptanceProductClosure(candidateRoot, manifest, kitPath, files, authority, fileSystem) {
  if (manifest.status !== 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS'
    || manifest.gates?.developer_package_integrity !== 'PASS'
    || manifest.gates?.product_assembly !== 'NOT_PERFORMED'
    || manifest.gates?.win10 !== 'NOT_PERFORMED' || manifest.gates?.win7 !== 'NOT_PERFORMED'
    || manifest.gates?.alpha !== 'NOT_PERFORMED') {
    throw new Error('A9_W22_CANDIDATE_GATE_STATUS_INVALID');
  }
  for (const relative of ACCEPTANCE_REQUIRED_FILES) {
    if (!files.has(relative)) throw new Error(`A9_W22_CANDIDATE_CLOSURE_MISSING:${relative}`);
  }
  const { lock, identity: authorityIdentity, approvedCandidate } = verifyAcceptanceAuthority(candidateRoot, authority, fileSystem);
  const runner = lock.inputs?.runner_return_zip;
  const electron = lock.inputs?.electron_zip;
  const storage = lock.inputs?.storage_return_zip;
  if (lock.schema_version !== 1 || lock.lock_id !== 'A9-14-INPUTS-D013-V25-WIN7-22'
    || lock.release_id !== manifest.release_id || lock.version !== manifest.version
    || lock.target?.os !== 'Windows 7 SP1 build 7601' || lock.target?.architecture !== 'x64'
    || lock.target?.delivery !== 'SELF_CONTAINED_OFFLINE_WIN7_X64' || lock.inputs_are_not_a9_pass !== true
    || runner?.profile !== 'D-013-v25-a9-trusted-shell-current-user' || runner?.protocol_version !== 2
    || runner?.runtime_profile !== 'a9-trusted-shell-current-user-v1'
    || !/^[a-f0-9]{40}$/.test(String(runner?.source_commit || ''))
    || approvedCandidate.source_commit !== manifest.source_commit
    || storage?.sqlite !== '3.43.1' || storage?.electron_abi !== 110
    || lock.gates?.win10 !== 'PASS_D013_V25_RETURN_REVIEWED'
    || lock.gates?.win7 !== 'NOT_PERFORMED_WIN7_22' || lock.gates?.alpha !== 'NOT_PERFORMED'
    || lock.provenance?.task !== 'A9-14' || lock.provenance?.superseded_candidate !== 'WIN7-21'
    || lock.provenance?.superseded_candidate_result !== 'FIX_BEFORE_ALPHA') {
    throw new Error('A9_W22_INPUT_LOCK_CONTRACT_INVALID');
  }
  for (const [key, input] of Object.entries({ electron_zip: electron, runner_return_zip: runner, storage_return_zip: storage })) {
    if (!/^[a-f0-9]{64}$/.test(input?.sha256 || '') || !/^[a-f0-9]{64}$/.test(input?.required_entry_sha256 || '')
      || manifest.locked_inputs?.[key]?.filename !== input.filename || manifest.locked_inputs?.[key]?.sha256 !== input.sha256) {
      throw new Error(`A9_W22_INPUT_LOCK_BINDING_INVALID:${key}`);
    }
  }
  if (manifest.required_native.runner_helper !== runner.required_entry_sha256
    || manifest.required_native.runner_helper_profile !== runner.profile
    || manifest.required_native.runner_helper_protocol !== runner.protocol_version
    || manifest.required_native.better_sqlite3_node !== storage.required_entry_sha256
    || manifest.required_native.electron_abi !== storage.electron_abi) {
    throw new Error('A9_W22_NATIVE_LOCK_BINDING_INVALID');
  }
  if (manifest.release_authority?.formal_input_lock_sha256 !== authorityIdentity.formal_input_lock_sha256
    || manifest.release_authority?.approval_registry_commit !== authorityIdentity.approval_registry_commit
    || manifest.release_authority?.approval_registry_sha256 !== authorityIdentity.approval_registry_sha256) {
    throw new Error('A9_W22_MANIFEST_AUTHORITY_BINDING_INVALID');
  }
  if (files.get('electron.exe')?.sha256 !== electron.required_entry_sha256) {
    throw new Error('A9_W22_ELECTRON_ENTRY_BINDING_INVALID');
  }
  verifyPe32PlusAmd64(path.join(candidateRoot, 'electron.exe'), 'electron.exe', false, fileSystem);
  verifyPe32PlusAmd64(path.join(candidateRoot, 'resources', 'native', 'runner', 'spike02_helper.exe'), 'spike02_helper.exe', false, fileSystem);
  verifyPe32PlusAmd64(path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'), 'better_sqlite3.node', true, fileSystem);
  const runnerManifest = readCandidateJson(candidateRoot, 'resources/native/runner/runner-manifest.json', fileSystem);
  if (runnerManifest.schema_version !== 1 || runnerManifest.release !== `${lock.release_id}-${lock.version}`
    || runnerManifest.helper?.path !== 'spike02_helper.exe' || runnerManifest.helper?.sha256 !== runner.required_entry_sha256
    || runnerManifest.helper?.profile !== runner.profile || runnerManifest.helper?.protocol_version !== 2
    || runnerManifest.helper?.runtime_profile !== runner.runtime_profile) {
    throw new Error('A9_W22_RUNNER_MANIFEST_BINDING_INVALID');
  }
  const runtime = readCandidateJson(candidateRoot, 'resources/app/a9-runtime.json', fileSystem);
  const packageJson = readCandidateJson(candidateRoot, 'resources/app/package.json', fileSystem);
  if (runtime.schema_version !== 1 || runtime.release_id !== lock.release_id || runtime.version !== lock.version
    || runtime.runner_helper_profile !== runner.profile || runtime.runner_helper_protocol !== 2
    || runtime.state_schema !== 4 || packageJson.version !== lock.version || packageJson.main !== 'product/main.js'
    || packageJson.runtime_profile?.electron !== electron.version || packageJson.runtime_profile?.electron_abi !== 110
    || packageJson.runtime_profile?.state_schema !== 4 || !packageJson.dependencies?.ajv) {
    throw new Error('A9_W22_RUNTIME_PROFILE_BINDING_INVALID');
  }
  for (const dependency of Object.keys(packageJson.dependencies)) {
    const prefix = `resources/app/node_modules/${dependency}/`;
    if (!files.has(`${prefix}package.json`) || !Array.from(files.keys()).some((name) => name.startsWith(prefix) && name.endsWith('.js'))) {
      throw new Error(`A9_W22_RUNTIME_DEPENDENCY_CLOSURE_MISSING:${dependency}`);
    }
  }
  const sbom = readCandidateJson(candidateRoot, 'SBOM.cdx.json', fileSystem);
  const components = Array.isArray(sbom.components) ? sbom.components : [];
  const componentHash = (name) => components.find((item) => item.name === name)?.hashes?.find((item) => item.alg === 'SHA-256')?.content;
  if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.5'
    || sbom.metadata?.component?.version !== lock.version
    || !sbom.metadata?.properties?.some((item) => item.name === 'win7:source_commit' && item.value === manifest.source_commit)
    || componentHash('Electron') !== electron.sha256 || componentHash('D-013 native helper') !== runner.required_entry_sha256
    || componentHash('better-sqlite3') !== storage.required_entry_sha256) {
    throw new Error('A9_W22_SBOM_BINDING_INVALID');
  }
  const kit = readCandidateJson(candidateRoot, 'A9_14_VALIDATION_KIT.json', fileSystem);
  if (fileHash(kitPath, fileSystem) !== files.get('A9_14_VALIDATION_KIT.json').sha256
    || kit.schema_version !== 2 || kit.candidate_id !== lock.release_id || kit.candidate_version !== lock.version
    || kit.source_commit !== manifest.source_commit || !Array.isArray(kit.incremental_win7_cases)
    || kit.incremental_win7_cases.length !== 13
    || kit.incremental_win7_cases.filter((item) => item?.case_id?.startsWith('W17-')).length !== 8
    || kit.incremental_win7_cases.filter((item) => item?.case_id?.startsWith('W22-')).length !== 5
    || !kit.incremental_win7_cases.some((item) => item?.case_id === 'W22-WIN7-19-SCHEMA-V4-COMPAT')
    || kit.schema_v4_inheritance?.status !== 'INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH'
    || kit.schema_v4_inheritance?.source_commit !== 'd28c1b9510d6d528f07e8a76a7527b4fc25c35ba'
    || kit.schema_v4_inheritance?.from_candidate?.candidate_id !== 'WIN7-21'
    || kit.schema_v4_inheritance?.from_candidate?.result !== 'FIX_BEFORE_ALPHA'
    || kit.required_runner_helper_sha256 !== runner.required_entry_sha256
    || kit.schema_v4_inheritance?.source_artifact_hashes?.['src/state/src/a9-persistence.ts'] !== '7c939264107a730f4eb835ff3a3f199a1c45c7066a1f9bef7a552cce39d5ac09'
    || kit.schema_v4_inheritance?.source_artifact_hashes?.['src/state/src/schema.ts'] !== 'a2bd34b3477f2a261da4240feb08cdb9b9c1162175f5b1e2ef2f83da7b0fc90a'
    || !Array.isArray(kit.schema_v4_inheritance?.evidence)
    || kit.schema_v4_inheritance.evidence.length !== 4) {
    throw new Error('A9_W22_VALIDATION_KIT_BINDING_INVALID');
  }
  return { authorityIdentity, approvedCandidate };
}

// The product writer emits a single-disk, UTF-8, non-ZIP64 archive with no
// descriptors/comments. Acceptance deliberately accepts only that format.
// Compare every compressed payload with the independently checked full tree;
// a ZIP hash alone says nothing about its relationship to the manifest.
function verifyAcceptanceCandidate(zipPath, manifestPath, kitPath, authority, fileSystem = fs) {
  const manifestBytes = fileSystem.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.source_dirty !== false || manifest.external_acceptance_eligible !== true) {
    throw new Error('A9_W22_CANDIDATE_NOT_ACCEPTANCE_ELIGIBLE');
  }
  if (manifest.schema_version !== 1 || manifest.release_id !== 'WIN7-CODING-AGENT-A9-ALPHA1'
    || manifest.version !== '0.3.0-alpha.1' || !/^[a-f0-9]{40}$/.test(manifest.source_commit || '')
    || !Array.isArray(manifest.files) || manifest.files.length === 0
    || manifest.required_native?.runner_helper_profile !== 'D-013-v25-a9-trusted-shell-current-user'
    || manifest.required_native?.runner_helper_protocol !== 2 || manifest.required_native?.electron_abi !== 110) {
    throw new Error('A9_W22_MANIFEST_IDENTITY_INVALID');
  }
  const candidateRoot = fileSystem.realpathSync(path.dirname(manifestPath));
  verifyFullTree(candidateRoot, manifest, fileSystem);
  const files = new Map(manifest.files.map((item) => [item.path, item]));
  if (files.size !== manifest.files.length || manifest.files.some((item) => typeof item.path !== 'string'
    || !Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f0-9]{64}$/.test(item.sha256 || ''))) {
    throw new Error('A9_W22_MANIFEST_FILE_ENTRY_INVALID');
  }
  for (const [relative, expectedHash] of [
    ['resources/native/runner/spike02_helper.exe', manifest.required_native.runner_helper],
    ['resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node', manifest.required_native.better_sqlite3_node],
    ['A9_14_VALIDATION_KIT.json', fileHash(kitPath, fileSystem)],
  ]) {
    if (!/^[a-f0-9]{64}$/.test(expectedHash || '') || files.get(relative)?.sha256 !== expectedHash) {
      throw new Error('A9_W22_CANDIDATE_CLOSURE_MISMATCH');
    }
  }
  const { authorityIdentity, approvedCandidate } = verifyAcceptanceProductClosure(candidateRoot, manifest, kitPath, files, authority, fileSystem);
  files.set('release-manifest.json', { size: manifestBytes.length, sha256: hash(manifestBytes) });
  const archive = fileSystem.readFileSync(zipPath);
  const fail = () => { throw new Error('A9_W22_CANDIDATE_ZIP_INVALID'); };
  const end = archive.length - 22;
  if (end < 0 || archive.readUInt32LE(end) !== 0x06054b50 || archive.readUInt32LE(end + 4) !== 0
    || archive.readUInt16LE(end + 20) !== 0 || archive.readUInt16LE(end + 8) !== files.size
    || archive.readUInt16LE(end + 10) !== files.size) fail();
  const centralStart = archive.readUInt32LE(end + 16);
  if (centralStart + archive.readUInt32LE(end + 12) !== end) fail();
  const prefix = `Win7CodingAgent-${manifest.version}-win7-x64/`;
  if (path.basename(zipPath) !== `${prefix.slice(0, -1)}.zip`) fail();
  const seen = new Set();
  let cursor = centralStart;
  let localCursor = 0;
  while (cursor < end) {
    if (cursor + 46 > end || archive.readUInt32LE(cursor) !== 0x02014b50) fail();
    const nameLength = archive.readUInt16LE(cursor + 28);
    if (cursor + 46 + nameLength > end || archive.readUInt16LE(cursor + 30) !== 0
      || archive.readUInt16LE(cursor + 32) !== 0 || archive.readUInt16LE(cursor + 34) !== 0) fail();
    const nameBytes = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString('utf8');
    const relative = name.slice(prefix.length);
    const item = files.get(relative);
    if (!name.startsWith(prefix) || !item || seen.has(relative)) fail();
    seen.add(relative);
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const size = archive.readUInt32LE(cursor + 24);
    const local = archive.readUInt32LE(cursor + 42);
    if (archive.readUInt16LE(cursor + 8) !== 0x0800 || ![0, 8].includes(method)
      || local !== localCursor || local + 30 + nameLength + compressedSize > centralStart
      || archive.readUInt32LE(local) !== 0x04034b50 || archive.readUInt16LE(local + 26) !== nameLength
      || archive.readUInt16LE(local + 28) !== 0 || size !== item.size
      || !archive.subarray(local + 6, local + 26).equals(archive.subarray(cursor + 8, cursor + 28))
      || !archive.subarray(local + 30, local + 30 + nameLength).equals(nameBytes)) fail();
    const compressed = archive.subarray(local + 30 + nameLength, local + 30 + nameLength + compressedSize);
    const bytes = method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) });
    if (bytes.length !== item.size || hash(bytes) !== item.sha256) fail();
    localCursor = local + 30 + nameLength + compressedSize;
    cursor += 46 + nameLength;
  }
  if (cursor !== end || localCursor !== centralStart || seen.size !== files.size) fail();
  if (hash(archive) !== approvedCandidate.package_sha256 || hash(manifestBytes) !== approvedCandidate.manifest_sha256
    || manifest.source_commit !== approvedCandidate.source_commit) throw new Error('A9_W22_APPROVED_CANDIDATE_HASH_MISMATCH');
  return { manifest, packageSha256: hash(archive), manifestSha256: hash(manifestBytes), authorityIdentity };
}

function main(argv = process.argv.slice(2)) {
  const candidateFs = selectPhysicalFileSystem();
  const candidateRoot = candidateFs.realpathSync(path.resolve(argument(argv, 'candidate-root', '.')));
  const outputPath = path.resolve(argument(argv, 'out', path.join(os.tmpdir(), `a9-package-integrity-${Date.now()}.json`)));
  const packageZipArgument = argument(argv, 'package-zip', '');
  const formalInputLockArgument = argument(argv, 'formal-input-lock', '');
  const approvalRegistryArgument = argument(argv, 'approval-registry', '');
  let packageZipPath = null;
  let packageSha256 = null;
  let verifiedAuthority = null;
  const cases = [];
  function check(id, action) {
    try { action(); cases.push({ id, status: 'PASS' }); }
    catch (error) { cases.push({ id, status: 'FAIL', detail: String(error && error.message ? error.message : error) }); }
  }

  let manifest = null;
  check('A9PKG-INTEGRITY-ZIP-BINDING', () => {
    if (!packageZipArgument) throw new Error('original package ZIP path is required');
    packageZipPath = candidateFs.realpathSync(path.resolve(packageZipArgument));
    if (packageZipPath.startsWith(candidateRoot + path.sep)) throw new Error('original ZIP must remain outside the extracted candidate');
    if (!/^Win7CodingAgent-0\.3\.0-alpha\.1-win7-x64\.zip$/i.test(path.basename(packageZipPath))) throw new Error('candidate ZIP filename mismatch');
    packageSha256 = fileHash(packageZipPath, candidateFs);
  });
  check('A9PKG-INTEGRITY-MANIFEST', () => {
    manifest = JSON.parse(candidateFs.readFileSync(path.join(candidateRoot, 'release-manifest.json'), 'utf8'));
    if (manifest.release_id !== 'WIN7-CODING-AGENT-A9-ALPHA1' || manifest.version !== '0.3.0-alpha.1') throw new Error('identity mismatch');
    if (manifest.gates.win10 !== 'NOT_PERFORMED' || manifest.gates.win7 !== 'NOT_PERFORMED') throw new Error('unearned Windows gate');
  });
  check('A9PKG-INTEGRITY-FULL-TREE', () => {
    if (!manifest) throw new Error('manifest unavailable');
    verifyFullTree(candidateRoot, manifest, candidateFs);
  });
  check('A9PKG-INTEGRITY-A9-14-CLOSURE', () => {
    if (!manifest || !packageZipPath) throw new Error('candidate identity unavailable');
    const verified = verifyAcceptanceCandidate(
      packageZipPath,
      path.join(candidateRoot, 'release-manifest.json'),
      path.join(candidateRoot, 'A9_14_VALIDATION_KIT.json'),
      {
        formalInputLockPath: formalInputLockArgument,
        approvalRegistryPath: approvalRegistryArgument,
        releaseAuthorityPath: argument(argv, 'release-authority', ''),
        releaseAuthoritySha256: argument(argv, 'release-authority-sha256', ''),
      },
      candidateFs,
    );
    verifiedAuthority = verified.authorityIdentity;
  });
  check('A9PKG-INTEGRITY-NATIVE', () => {
    if (!manifest) throw new Error('manifest unavailable');
    const binding = path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    const helper = path.join(candidateRoot, 'resources', 'native', 'runner', 'spike02_helper.exe');
    if (fileHash(binding, candidateFs) !== manifest.required_native.better_sqlite3_node) throw new Error('SQLite binding mismatch');
    if (fileHash(helper, candidateFs) !== manifest.required_native.runner_helper) throw new Error('runner helper mismatch');
    if (Number(process.versions.modules) !== 110 || process.versions.electron !== '22.3.27') throw new Error(`runtime ABI mismatch electron=${process.versions.electron} modules=${process.versions.modules}`);
  });
  check('A9PKG-INTEGRITY-NO-SYSTEM-NODE', () => {
    if (!process.versions.electron || path.basename(process.execPath).toLowerCase() !== 'electron.exe') throw new Error('must run with packaged electron.exe in Node mode');
  });

  const report = {
    schema_version: 1,
    record_id: `A9-14-PACKAGE-INTEGRITY-${Date.now()}`,
    recorded_at: new Date().toISOString(),
    status: cases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL',
    candidate_id: manifest && manifest.release_id,
    package_filename: packageZipPath && path.basename(packageZipPath),
    package_sha256: packageSha256,
    candidate_manifest_sha256: fileHash(path.join(candidateRoot, 'release-manifest.json'), candidateFs),
    release_authority: verifiedAuthority,
    filesystem_profile: process.versions.electron ? 'ELECTRON_ORIGINAL_FS_PHYSICAL_BYTES' : 'NODE_FS_PHYSICAL_BYTES',
    runtime_profile: { platform: process.platform, arch: process.arch, os_release: os.release(), electron: process.versions.electron, node: process.versions.node, modules: Number(process.versions.modules) },
    cases,
    windows_product_journeys: 'NOT_PERFORMED_BY_THIS_INTEGRITY_CHECK',
  };
  if (outputPath.startsWith(candidateRoot + path.sep)) throw new Error('A9_EVIDENCE_INSIDE_CANDIDATE_PROHIBITED');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
  return report;
}

module.exports = { main, selectPhysicalFileSystem, verifyFullTree, verifyAcceptanceCandidate, ACCEPTANCE_REQUIRED_FILES };
if (require.main === module) main();
