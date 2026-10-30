// A9-43 batch2 package integrity (WIN7-56 tentative, ADR-0289/0290/0304; ADR-0155 Proposed).
//
// Verifies the exact frozen candidate against candidate-external inputs: the original ZIP, the formal input lock,
// the approval registry and the execution binding pinned by an independent SHA-256. The binding is not an owner
// approval: DEV_CHANNEL and FORMAL_GATE_A_EXECUTION use the same package checks and differ only in evidence_class.
// Every manifest file is hashed
// on disk, every ZIP entry is inflated and hashed, the kit contract must equal the fixtures contract byte for byte,
// and the packaged modules are actually loaded. The JSON report counts files and mismatches so a reviewer can audit
// the verdict beyond the case-level PASS. Runs under the packaged electron.exe in ELECTRON_RUN_AS_NODE=1 mode.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const fixtures = require('./a9-batch2-fixtures.cjs');

const CONTRACT = fixtures.CONTRACT;
const LOCK_FILE = 'a9-batch2-input-lock.json';
const KIT_FILE = 'A9_BATCH2_VALIDATION_KIT.json';
const PACKAGE_NAME = `Win7CodingAgent-${CONTRACT.version}-win7-x64.zip`;
const REGISTRY_FILE = 'a9-v26-approved-build-kits.json';
const REGISTRY_PATH = 'release/win7-product-v3/a9-v26-approved-build-kits.json';
const AUTHORITY_KIND = `${CONTRACT.candidate.replace('-', '_')}_EXECUTION_BINDING`;
const EVIDENCE_CLASSES = Object.freeze(['DEV_CHANNEL', 'FORMAL_GATE_A_EXECUTION']);
const MODULE_ENTRIES = Object.freeze([
  'resources/app/product/a9-package-runtime.js',
  'resources/app/git-adapter/dist/index.js',
  'resources/app/core/dist/index.js',
  'resources/app/gateway/dist/index.js',
  'resources/app/workspace/dist/index.js',
  'resources/app/runner/dist/index.js',
  'resources/app/state/dist/index.js',
]);
// main.js and preload.js need Electron, so they are compiled (syntax only) and never executed here.
const SYNTAX_ENTRIES = Object.freeze(['resources/app/product/main.js', 'resources/app/product/preload.js']);
const SUITE_FILES = Object.freeze([
  'A9_BATCH2_WIN7_VALIDATION.md', 'RUN_A9_BATCH2_INTEGRITY.cmd', 'RUN_A9_BATCH2_SMOKE.cmd', 'RUN_A9_BATCH2_REPORT_VERIFY.cmd',
  'validation/a9-batch2-package-integrity.cjs', 'validation/a9-batch2-report.cjs', 'validation/a9-batch2-smoke.cjs',
  'validation/a9-batch2-fixtures.cjs', 'validation/a9-batch2-desktop-request.cjs', 'validation/a9-batch2-desktop-controller.ps1',
  'validation/a9-batch2-driver.cjs',
]);
const REQUIRED_FILES = [
  'electron.exe', 'resources/default_app.asar', 'LICENSE', 'LICENSES.chromium.html', 'SBOM.cdx.json', 'THIRD_PARTY_LICENSES.md', 'INSTALLATION.md',
  'licenses/PROJECT-APACHE-2.0.txt', 'licenses/ELECTRON-MIT.txt', LOCK_FILE, KIT_FILE,
  'resources/app/package.json', 'resources/app/a9-runtime.json',
  ...['main.js', 'preload.js', 'a9-package-runtime.js', 'a9-agent-runtime.js', 'a9-product-ipc.js', 'active-workspace-store.js',
    'renderer/a9-workbench.js', 'renderer/workbench.html'].map((name) => `resources/app/product/${name}`),
  ...MODULE_ENTRIES.slice(1),
  'resources/native/runner/spike02_helper.exe', 'resources/native/runner/runner-manifest.json',
  'resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  ...SUITE_FILES,
];

function selectPhysicalFileSystem(runtimeVersions = process.versions, loadOriginalFs = () => require('original-fs')) {
  if (!runtimeVersions || !runtimeVersions.electron) return fs;
  const physical = loadOriginalFs();
  for (const method of ['existsSync', 'realpathSync', 'readdirSync', 'readFileSync', 'statSync']) {
    if (!physical || typeof physical[method] !== 'function') throw new Error(`A9_BATCH2_PHYSICAL_FILESYSTEM_UNAVAILABLE:${method}`);
  }
  return physical;
}

function argument(argv, name, fallback = '') {
  const prefix = `--${name}=`;
  const value = argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fileHash(filePath, fileSystem = fs) { return sha256(fileSystem.readFileSync(filePath)); }
function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function listFiles(root, current = root, out = [], fileSystem = fs) {
  for (const entry of fileSystem.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`A9_BATCH2_PACKAGE_SYMLINK_PROHIBITED:${absolute}`);
    if (entry.isDirectory()) listFiles(root, absolute, out, fileSystem);
    else if (entry.isFile()) out.push(path.relative(root, absolute).replace(/\\/g, '/'));
    else throw new Error(`A9_BATCH2_PACKAGE_SPECIAL_FILE_PROHIBITED:${absolute}`);
  }
  return out;
}
function readJson(filePath, fileSystem, code) {
  try { return JSON.parse(fileSystem.readFileSync(filePath, 'utf8')); } catch (_error) { throw new Error(code); }
}
function externalFile(value, candidateRoot, label, fileSystem) {
  if (!value) throw new Error(`A9_BATCH2_${label}_REQUIRED`);
  const unresolved = path.resolve(value);
  if (!fileSystem.existsSync(unresolved) || !fileSystem.statSync(unresolved).isFile()) throw new Error(`A9_BATCH2_${label}_NOT_FILE`);
  const resolved = fileSystem.realpathSync(unresolved);
  if (contained(candidateRoot, resolved)) throw new Error(`A9_BATCH2_${label}_INSIDE_CANDIDATE`);
  return resolved;
}

// Collect every mismatch before throwing so the report can carry the array and counts.
function verifyFullTree(candidateRoot, manifest, fileSystem, mismatches) {
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('A9_BATCH2_MANIFEST_FILES_INVALID');
  const expected = new Map(manifest.files.map((item) => [item.path, item]));
  if (expected.size !== manifest.files.length) throw new Error('A9_BATCH2_MANIFEST_DUPLICATE_PATH');
  const actual = listFiles(candidateRoot, candidateRoot, [], fileSystem).filter((item) => item !== 'release-manifest.json');
  if (actual.length !== expected.size) mismatches.push(`A9_BATCH2_FILE_COUNT_MISMATCH:${actual.length}:${expected.size}`);
  const present = new Set(actual);
  for (const relative of expected.keys()) if (!present.has(relative)) mismatches.push(`A9_BATCH2_FILE_MISSING:${relative}`);
  for (const relative of actual) {
    const item = expected.get(relative);
    const absolute = path.join(candidateRoot, ...relative.split('/'));
    if (!item || !Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) {
      mismatches.push(`A9_BATCH2_MANIFEST_ENTRY_INVALID:${relative}`);
      continue;
    }
    if (fileSystem.statSync(absolute).size !== item.size || fileHash(absolute, fileSystem) !== item.sha256) {
      mismatches.push(`A9_BATCH2_FILE_MISMATCH:${relative}`);
    }
  }
  if (mismatches.length > 0) throw new Error(mismatches[0]);
  return { expected, filesChecked: actual.length };
}

function verifyPe32PlusAmd64(filePath, expectDll, fileSystem) {
  const bytes = fileSystem.readFileSync(filePath);
  if (bytes.length < 0x100 || bytes.readUInt16LE(0) !== 0x5a4d) throw new Error(`A9_BATCH2_NATIVE_NOT_PE:${filePath}`);
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 0x40 || pe + 24 > bytes.length || bytes.readUInt32LE(pe) !== 0x00004550
    || bytes.readUInt16LE(pe + 4) !== 0x8664 || bytes.readUInt16LE(pe + 24) !== 0x20b) {
    throw new Error(`A9_BATCH2_NATIVE_NOT_AMD64_PE:${filePath}`);
  }
  const characteristics = bytes.readUInt16LE(pe + 22);
  if ((characteristics & 0x0002) === 0 || Boolean(characteristics & 0x2000) !== expectDll) {
    throw new Error(`A9_BATCH2_NATIVE_PE_CONTRACT_INVALID:${filePath}`);
  }
}

function verifyLock(lock, manifest, registryBytes) {
  const runner = lock.inputs && lock.inputs.runner_return_zip;
  const storage = lock.inputs && lock.inputs.storage_return_zip;
  const electron = lock.inputs && lock.inputs.electron_zip;
  if (lock.schema_version !== 1 || lock.lock_id !== CONTRACT.lock_id
    || lock.release_id !== manifest.release_id || lock.version !== manifest.version
    || lock.release_id !== CONTRACT.release_id || lock.version !== CONTRACT.version
    || lock.target?.os !== 'Windows 7 SP1 build 7601' || lock.target?.architecture !== 'x64'
    || lock.target?.delivery !== 'SELF_CONTAINED_OFFLINE_WIN7_X64' || lock.inputs_are_not_a9_pass !== true
    || lock.gates?.win10 !== 'PASS_D013_V26_RETURN_REVIEWED'
    || lock.gates?.win7 !== `NOT_PERFORMED_${CONTRACT.candidate.replace('-', '_')}` || lock.gates?.alpha !== 'NOT_PERFORMED'
    || lock.provenance?.task !== CONTRACT.task || lock.provenance?.development_only !== false
    || lock.provenance?.candidate !== CONTRACT.candidate || lock.provenance?.candidate_tentative !== true
    || electron?.version !== '22.3.27' || runner?.profile !== 'D-013-v26-managed-a9-trusted-shell-current-user'
    || runner?.protocol_version !== 3 || runner?.runtime_profile !== 'a9-trusted-shell-current-user-v2'
    || runner?.managed_contract?.revision !== 'a9-31-managed-r1'
    || storage?.sqlite !== '3.43.1' || storage?.electron_abi !== 110) {
    throw new Error('A9_BATCH2_INPUT_LOCK_CONTRACT_INVALID');
  }
  for (const input of [electron, runner, storage]) {
    if (!/^[a-f0-9]{64}$/.test(input?.sha256 || '') || !/^[a-f0-9]{64}$/.test(input?.required_entry_sha256 || '')) {
      throw new Error('A9_BATCH2_INPUT_LOCK_HASH_INVALID');
    }
  }
  const approval = runner.approval_registry;
  if (approval?.path !== REGISTRY_PATH || !/^[a-f0-9]{40}$/.test(approval.commit || '') || approval.sha256 !== sha256(registryBytes)) {
    throw new Error('A9_BATCH2_APPROVAL_REGISTRY_BINDING_INVALID');
  }
  return { runner, storage, electron, approval };
}

function verifyAuthority(candidateRoot, manifest, zipPath, kitSha256, authority, fileSystem) {
  const lockPath = externalFile(authority.formalInputLockPath, candidateRoot, 'FORMAL_INPUT_LOCK', fileSystem);
  const registryPath = externalFile(authority.approvalRegistryPath, candidateRoot, 'APPROVAL_REGISTRY', fileSystem);
  const authorityPath = externalFile(authority.releaseAuthorityPath, candidateRoot, 'EXECUTION_BINDING', fileSystem);
  if (path.basename(lockPath).toLowerCase() !== LOCK_FILE || path.basename(registryPath).toLowerCase() !== REGISTRY_FILE) {
    throw new Error('A9_BATCH2_EXTERNAL_BINDING_FILENAME_INVALID');
  }
  const lockBytes = fileSystem.readFileSync(lockPath);
  const registryBytes = fileSystem.readFileSync(registryPath);
  const authorityBytes = fileSystem.readFileSync(authorityPath);
  if (!/^[a-f0-9]{64}$/.test(String(authority.releaseAuthoritySha256 || ''))
    || sha256(authorityBytes) !== authority.releaseAuthoritySha256) throw new Error('A9_BATCH2_AUTHORITY_PIN_MISMATCH');
  if (!lockBytes.equals(fileSystem.readFileSync(path.join(candidateRoot, LOCK_FILE)))) {
    throw new Error('A9_BATCH2_FORMAL_INPUT_LOCK_BYTE_MISMATCH');
  }
  const lock = readJson(lockPath, fileSystem, 'A9_BATCH2_FORMAL_INPUT_LOCK_JSON_INVALID');
  const registry = readJson(registryPath, fileSystem, 'A9_BATCH2_APPROVAL_REGISTRY_JSON_INVALID');
  const approved = readJson(authorityPath, fileSystem, 'A9_BATCH2_EXECUTION_BINDING_JSON_INVALID');
  const { runner, storage, electron, approval } = verifyLock(lock, manifest, registryBytes);
  if (approved.schema_version !== 1 || approved.kind !== AUTHORITY_KIND
    || !EVIDENCE_CLASSES.includes(approved.evidence_class)
    || approved.formal_input_lock_sha256 !== sha256(lockBytes)
    || approved.approval_registry?.commit !== approval.commit
    || approved.approval_registry?.sha256 !== approval.sha256
    || approved.candidate?.source_commit !== manifest.source_commit
    || approved.candidate?.package_sha256 !== fileHash(zipPath, fileSystem)
    || approved.candidate?.manifest_sha256 !== fileHash(path.join(candidateRoot, 'release-manifest.json'), fileSystem)
    || approved.candidate?.kit_sha256 !== kitSha256
    || approved.candidate?.helper_sha256 !== runner.required_entry_sha256
    || typeof approved.run_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(approved.run_id)
    || typeof approved.target?.machine_name !== 'string' || !approved.target.machine_name
    || typeof approved.target?.account_sid !== 'string' || !approved.target.account_sid) {
    throw new Error('A9_BATCH2_EXECUTION_BINDING_INVALID');
  }
  const buildKit = runner.build_kit;
  const found = registry.schema_version === 1 && Array.isArray(registry.kits)
    && registry.kits.some((item) => item?.status === 'APPROVED_FOR_RETURN_RECORDING'
      && item.revision === buildKit?.revision && item.filename === buildKit?.filename
      && item.sha256 === buildKit?.sha256 && item.source_commit === buildKit?.source_commit
      && item.input_lock_sha256 === buildKit?.input_lock_sha256
      && item.package_manifest_sha256 === buildKit?.package_manifest_sha256);
  if (!found) throw new Error('A9_BATCH2_NATIVE_BUILD_KIT_NOT_APPROVED');
  return {
    lock, runner, storage, electron, runId: approved.run_id, target: approved.target,
    authorityIdentity: {
      evidence_class: approved.evidence_class,
      release_authority_sha256: sha256(authorityBytes),
      formal_input_lock_sha256: sha256(lockBytes),
      approval_registry_commit: approval.commit,
      approval_registry_sha256: approval.sha256,
    },
  };
}

// Each ZIP entry is inflated and hashed; the layout must be the deterministic one the producer writes.
function verifyZip(zipPath, manifest, manifestBytes, files, fileSystem, mismatches) {
  if (path.basename(zipPath) !== PACKAGE_NAME) throw new Error('A9_BATCH2_ZIP_FILENAME_INVALID');
  const archive = fileSystem.readFileSync(zipPath);
  const expected = new Map(files);
  expected.set('release-manifest.json', { size: manifestBytes.length, sha256: sha256(manifestBytes) });
  const fail = (detail) => { throw new Error(detail ? `A9_BATCH2_CANDIDATE_ZIP_INVALID:${detail}` : 'A9_BATCH2_CANDIDATE_ZIP_INVALID'); };
  const end = archive.length - 22;
  if (end < 0 || archive.readUInt32LE(end) !== 0x06054b50 || archive.readUInt32LE(end + 4) !== 0
    || archive.readUInt16LE(end + 20) !== 0 || archive.readUInt16LE(end + 8) !== expected.size
    || archive.readUInt16LE(end + 10) !== expected.size) fail('EOCD');
  const centralStart = archive.readUInt32LE(end + 16);
  if (centralStart + archive.readUInt32LE(end + 12) !== end) fail('CENTRAL_OFFSET');
  const prefix = `Win7CodingAgent-${manifest.version}-win7-x64/`;
  const seen = new Set();
  let cursor = centralStart;
  let localCursor = 0;
  while (cursor < end) {
    if (cursor + 46 > end || archive.readUInt32LE(cursor) !== 0x02014b50) fail('CENTRAL_HEADER');
    const nameLength = archive.readUInt16LE(cursor + 28);
    if (cursor + 46 + nameLength > end || archive.readUInt16LE(cursor + 30) !== 0
      || archive.readUInt16LE(cursor + 32) !== 0 || archive.readUInt16LE(cursor + 34) !== 0) fail('CENTRAL_FLAGS');
    const nameBytes = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString('utf8');
    const relative = name.slice(prefix.length);
    const item = expected.get(relative);
    if (!name.startsWith(prefix) || !item || seen.has(relative)) {
      mismatches.push(`A9_BATCH2_ZIP_ENTRY_UNEXPECTED:${name}`);
      fail(`A9_BATCH2_ZIP_ENTRY_UNEXPECTED:${name}`);
    }
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
      || !archive.subarray(local + 30, local + 30 + nameLength).equals(nameBytes)) {
      mismatches.push(`A9_BATCH2_ZIP_ENTRY_HEADER_MISMATCH:${relative}`);
      fail(`A9_BATCH2_ZIP_ENTRY_HEADER_MISMATCH:${relative}`);
    }
    const compressed = archive.subarray(local + 30 + nameLength, local + 30 + nameLength + compressedSize);
    const bytes = method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) });
    if (bytes.length !== item.size || sha256(bytes) !== item.sha256) {
      mismatches.push(`A9_BATCH2_ZIP_ENTRY_CONTENT_MISMATCH:${relative}`);
      fail(`A9_BATCH2_ZIP_ENTRY_CONTENT_MISMATCH:${relative}`);
    }
    localCursor = local + 30 + nameLength + compressedSize;
    cursor += 46 + nameLength;
  }
  if (cursor !== end || localCursor !== centralStart || seen.size !== expected.size) fail('TRAILER');
  return { entriesChecked: seen.size };
}

// The kit is derived from the fixtures contract; any edit to cases, phases or limits is a different candidate.
function verifyKit(kit, manifest, files, candidateRoot, fileSystem) {
  const reference = JSON.stringify({ cases: fixtures.CASES, phases: fixtures.PHASES, chain: fixtures.CHAIN_STEPS, limits: fixtures.LIMITS,
    gates: fixtures.GATES, known: fixtures.KNOWN_LIMITS });
  const actual = JSON.stringify({ cases: kit.required_cases, phases: kit.phases, chain: kit.chain_steps, limits: kit.limits,
    gates: kit.gates, known: kit.known_limits });
  if (kit.schema_version !== 1 || kit.candidate_label !== CONTRACT.candidate || kit.candidate_tentative !== true
    || kit.candidate_id !== manifest.release_id || kit.candidate_version !== manifest.version
    || kit.lock_id !== CONTRACT.lock_id || kit.source_commit !== manifest.source_commit
    || kit.scope?.task !== CONTRACT.task || kit.win10 !== 'NOT_PERFORMED' || kit.win7 !== 'NOT_PERFORMED'
    || kit.authority !== 'NOT_GRANTED_BY_PACKAGE' || reference !== actual) {
    throw new Error('A9_BATCH2_KIT_CONTRACT_INVALID');
  }
  const contract = fixtures.selfCheck();
  if (!contract.ok) throw new Error(`A9_BATCH2_FIXTURE_CONTRACT_INVALID:${contract.problems.join(',')}`);
  for (const name of SUITE_FILES) {
    const listed = files.get(name);
    if (!listed || kit.suite_sha256?.[name] !== listed.sha256) throw new Error(`A9_BATCH2_SUITE_HASH_MISMATCH:${name}`);
  }
  if (Object.keys(kit.suite_sha256 || {}).length !== SUITE_FILES.length) throw new Error('A9_BATCH2_SUITE_SET_MISMATCH');
  return { cases: kit.required_cases.length, assertions: contract.assertions };
}

function verifyAcceptanceCandidate(zipPath, manifestPath, kitPath, authority, fileSystem = fs) {
  const mismatches = [];
  const manifestBytes = fileSystem.readFileSync(manifestPath);
  const manifest = readJson(manifestPath, fileSystem, 'A9_BATCH2_MANIFEST_JSON_INVALID');
  if (manifest.schema_version !== 1 || manifest.release_id !== CONTRACT.release_id
    || manifest.version !== CONTRACT.version || !/^[a-f0-9]{40}$/.test(manifest.source_commit || '')
    || manifest.source_dirty !== false || manifest.external_acceptance_eligible !== true
    || manifest.lock_id !== CONTRACT.lock_id || manifest.candidate !== CONTRACT.candidate || manifest.candidate_tentative !== true
    || manifest.status !== 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS'
    || manifest.gates?.developer_package_integrity !== 'PASS'
    || manifest.gates?.product_assembly !== 'NOT_PERFORMED' || manifest.gates?.win10 !== 'NOT_PERFORMED'
    || manifest.gates?.win7 !== 'NOT_PERFORMED' || manifest.gates?.alpha !== 'NOT_PERFORMED') {
    throw new Error('A9_BATCH2_MANIFEST_IDENTITY_INVALID');
  }
  const candidateRoot = fileSystem.realpathSync(path.dirname(manifestPath));
  if (contained(candidateRoot, fileSystem.realpathSync(zipPath))) throw new Error('A9_BATCH2_ZIP_INSIDE_CANDIDATE');
  const tree = verifyFullTree(candidateRoot, manifest, fileSystem, mismatches);
  const files = tree.expected;
  for (const relative of REQUIRED_FILES) if (!files.has(relative)) throw new Error(`A9_BATCH2_CLOSURE_MISSING:${relative}`);
  const kitSha256 = fileHash(kitPath, fileSystem);
  if (files.get(KIT_FILE)?.sha256 !== kitSha256) throw new Error('A9_BATCH2_KIT_MANIFEST_MISMATCH');
  const kit = readJson(kitPath, fileSystem, 'A9_BATCH2_KIT_JSON_INVALID');
  const kitCheck = verifyKit(kit, manifest, files, candidateRoot, fileSystem);
  const resolved = verifyAuthority(candidateRoot, manifest, zipPath, kitSha256, authority, fileSystem);
  const { runner, storage, electron } = resolved;
  if (manifest.locked_inputs?.electron_zip?.sha256 !== electron.sha256
    || manifest.locked_inputs?.runner_return_zip?.sha256 !== runner.sha256
    || manifest.locked_inputs?.storage_return_zip?.sha256 !== storage.sha256
    || manifest.required_native?.runner_helper !== runner.required_entry_sha256
    || manifest.required_native?.runner_helper_profile !== runner.profile
    || manifest.required_native?.runner_helper_protocol !== 3
    || manifest.required_native?.better_sqlite3_node !== storage.required_entry_sha256
    || manifest.required_native?.electron_abi !== 110) throw new Error('A9_BATCH2_NATIVE_BINDING_INVALID');
  if (manifest.release_authority?.formal_input_lock_sha256 !== resolved.authorityIdentity.formal_input_lock_sha256
    || manifest.release_authority?.approval_registry_commit !== resolved.authorityIdentity.approval_registry_commit
    || manifest.release_authority?.approval_registry_sha256 !== resolved.authorityIdentity.approval_registry_sha256) {
    throw new Error('A9_BATCH2_MANIFEST_AUTHORITY_BINDING_INVALID');
  }
  verifyPe32PlusAmd64(path.join(candidateRoot, 'electron.exe'), false, fileSystem);
  verifyPe32PlusAmd64(path.join(candidateRoot, 'resources', 'native', 'runner', 'spike02_helper.exe'), false, fileSystem);
  verifyPe32PlusAmd64(path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'), true, fileSystem);
  const runtime = readJson(path.join(candidateRoot, 'resources', 'app', 'a9-runtime.json'), fileSystem, 'A9_BATCH2_RUNTIME_JSON_INVALID');
  const packageJson = readJson(path.join(candidateRoot, 'resources', 'app', 'package.json'), fileSystem, 'A9_BATCH2_PACKAGE_JSON_INVALID');
  if (runtime.release_id !== manifest.release_id || runtime.version !== manifest.version || runtime.state_schema !== 4
    || runtime.lock_id !== CONTRACT.lock_id || runtime.candidate !== CONTRACT.candidate
    || runtime.runner_helper_profile !== runner.profile || runtime.runner_helper_protocol !== 3
    || packageJson.main !== 'product/main.js' || packageJson.runtime_profile?.electron !== '22.3.27'
    || packageJson.runtime_profile?.electron_abi !== 110 || packageJson.runtime_profile?.state_schema !== 4) {
    throw new Error('A9_BATCH2_RUNTIME_PROFILE_INVALID');
  }
  const zipCheck = verifyZip(zipPath, manifest, manifestBytes, files, fileSystem, mismatches);
  return {
    manifest, kit, kitCheck, candidateRoot,
    packageSha256: fileHash(zipPath, fileSystem),
    manifestSha256: sha256(manifestBytes),
    kitSha256,
    runId: resolved.runId,
    target: resolved.target,
    authorityIdentity: resolved.authorityIdentity,
    fileChecks: {
      manifest_files_checked: tree.filesChecked,
      zip_entries_checked: zipCheck.entriesChecked,
      mismatches,
    },
  };
}

// Actually load the packaged modules; the runtime descriptor is validated by the product's own loader.
function loadPackagedModules(candidateRoot, loader = require) {
  const results = [];
  for (const relative of MODULE_ENTRIES) {
    const absolute = path.join(candidateRoot, ...relative.split('/'));
    try {
      const loaded = loader(absolute);
      let detail = `exports=${Object.keys(loaded || {}).length}`;
      if (relative.endsWith('a9-package-runtime.js')) {
        const runtime = loaded.loadA9PackageRuntime({ productRoot: path.dirname(absolute), argv: [], env: {}, platform: 'integrity' });
        if (!runtime || runtime.runnerHelperProtocol !== 3
          || runtime.runnerHelperProfile !== 'D-013-v26-managed-a9-trusted-shell-current-user') throw new Error('A9_BATCH2_RUNTIME_DESCRIPTOR_NOT_BATCH2');
        detail = `descriptor=${runtime.releaseId}:${runtime.version}:protocol${runtime.runnerHelperProtocol}`;
      }
      results.push({ module: relative, status: 'PASS', detail });
    } catch (error) {
      results.push({ module: relative, status: 'FAIL', detail: String(error && error.message ? error.message : error).slice(0, 300) });
    }
  }
  return results;
}

function compilePackagedEntries(candidateRoot, fileSystem = fs) {
  return SYNTAX_ENTRIES.map((relative) => {
    const absolute = path.join(candidateRoot, ...relative.split('/'));
    try {
      const source = fileSystem.readFileSync(absolute, 'utf8').replace(/^#!.*\n/, '');
      // eslint-disable-next-line no-new
      new vm.Script(source, { filename: absolute });
      return { module: relative, status: 'PASS', detail: `compiled_bytes=${Buffer.byteLength(source)}` };
    } catch (error) {
      return { module: relative, status: 'FAIL', detail: String(error && error.message ? error.message : error).slice(0, 300) };
    }
  });
}

// Maps the first integrity failure to the contract assertion it belongs to; later assertions stay UNKNOWN.
const TREE_FAILURE = /A9_BATCH2_(FILE_|PACKAGE_SYMLINK|PACKAGE_SPECIAL|MANIFEST_DUPLICATE|MANIFEST_ENTRY|MANIFEST_FILES|CLOSURE_MISSING|ZIP_|CANDIDATE_ZIP)/;
const NATIVE_FAILURE = /A9_BATCH2_(NATIVE_|INPUT_LOCK_|FORMAL_INPUT_LOCK_|APPROVAL_REGISTRY_|MANIFEST_AUTHORITY_BINDING)/;
function integrityAssertions(cases, verified, moduleResults, syntaxResults) {
  const caseId = 'B2-G1-PACKAGE';
  const ids = fixtures.CASES.find((item) => item.case_id === caseId).assertions.map((item) => item.assertion_id);
  const out = [];
  const first = cases.find((item) => item.id === 'B2PKG-IDENTITY-AUTHORITY-FULL-TREE-ZIP');
  const put = (index, status, observed) => out.push({ case_id: caseId, assertion_id: ids[index], status, observed });
  if (first && first.status === 'PASS' && verified) {
    const checks = verified.fileChecks;
    put(0, 'PASS', `authority=${JSON.stringify(verified.authorityIdentity).slice(0, 400)}; run_id=${verified.runId}`);
    put(1, checks.mismatches.length === 0 && checks.manifest_files_checked > 0 ? 'PASS' : 'FAIL',
      `manifest_files_checked=${checks.manifest_files_checked}; zip_entries_checked=${checks.zip_entries_checked}; mismatches=${checks.mismatches.length}`);
    put(2, 'PASS', `runner_helper_sha256=${verified.manifest.required_native.runner_helper}; better_sqlite3_node=${verified.manifest.required_native.better_sqlite3_node}; abi=${verified.manifest.required_native.electron_abi}`);
  } else {
    const detail = first ? String(first.detail || '') : 'check not executed';
    const index = TREE_FAILURE.test(detail) ? 1 : NATIVE_FAILURE.test(detail) ? 2 : 0;
    [0, 1, 2].forEach((position) => put(position, position === index ? 'FAIL' : 'UNKNOWN',
      position === index ? detail : `not evaluated after first integrity failure: ${detail.slice(0, 200)}`));
  }
  const loadChecks = cases.filter((item) => ['B2PKG-RUNTIME-ABI', 'B2PKG-MODULE-LOAD'].includes(item.id));
  const failedLoad = loadChecks.find((item) => item.status !== 'PASS');
  const failedSyntax = syntaxResults.find((item) => item.status !== 'PASS');
  if (loadChecks.length === 2 && !failedLoad && !failedSyntax) {
    put(3, 'PASS', `modules_loaded=${moduleResults.map((item) => item.module.split('/').slice(-2).join('/')).join(',')}; syntax_compiled=${syntaxResults.map((item) => item.module.split('/').pop()).join(',')}`);
  } else put(3, 'FAIL', failedLoad ? `${failedLoad.id}: ${failedLoad.detail}` : failedSyntax ? `${failedSyntax.module}: ${failedSyntax.detail}` : 'module checks missing');
  return out;
}

function writePhaseResult(argv, evidenceRoot, cases, verified, moduleResults, syntaxResults) {
  const requestFile = path.join(evidenceRoot, 'request.json');
  const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  const phase = argument(argv, 'phase');
  const runId = argument(argv, 'run-id');
  if (request.phase !== phase || request.run_id !== runId || phase !== 'p02-integrity') throw new Error('A9_BATCH2_INTEGRITY_REQUEST_MISMATCH');
  const manifestSha256 = fileHash(path.join(request.candidate_root, 'release-manifest.json'));
  const kitSha256 = fileHash(path.join(request.candidate_root, KIT_FILE));
  const bindings = { source_commit: request.bindings.source_commit, package_sha256: verified ? verified.packageSha256 : request.bindings.package_sha256, manifest_sha256: manifestSha256, kit_sha256: kitSha256 };
  const result = fixtures.newPhaseResult(phase, runId, request.request_index, bindings);
  for (const item of integrityAssertions(cases, verified, moduleResults, syntaxResults)) fixtures.setAssertion(result, item.case_id, item.assertion_id, item.status, item.observed);
  result.evidence = fixtures.evidenceForPhase(phase).filter((name) => fs.existsSync(path.join(evidenceRoot, name))).map((name) => {
    const bytes = fs.readFileSync(path.join(evidenceRoot, name));
    return { file: name, size: bytes.length, sha256: sha256(bytes) };
  });
  const failed = cases.find((item) => item.status !== 'PASS');
  fixtures.finalizePhaseResult(result, failed ? `INTEGRITY_${failed.id}` : null);
  const problems = fixtures.phaseResultProblems(result, { runId, phase, bindings });
  if (result.status === 'PASS' && problems.length) {
    result.status = 'FAIL';
    result.failure_class = 'RESULT_CONTRACT_PROBLEMS';
    result.first_failure = { case_id: null, assertion_id: null, detail: problems.slice(0, 5).join('|') };
  }
  writeRaw(path.join(evidenceRoot, 'phase-result.json'), result);
  return result;
}

function writeRaw(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main(argv = process.argv.slice(2), environment = {}) {
  const runtimeVersions = environment.runtimeVersions || process.versions;
  const execPath = environment.execPath || process.execPath;
  const candidateFs = selectPhysicalFileSystem(runtimeVersions, environment.loadOriginalFs);
  const candidateRoot = candidateFs.realpathSync(path.resolve(argument(argv, 'candidate-root', path.join(__dirname, '..'))));
  const evidenceRoot = path.resolve(argument(argv, 'evidence-root', path.join(candidateRoot, '..', 'a9-batch2-evidence')));
  if (contained(candidateRoot, evidenceRoot)) throw new Error('A9_BATCH2_EVIDENCE_INSIDE_CANDIDATE');
  const outputPath = path.join(evidenceRoot, 'a9-package-integrity.json');
  const zipPath = externalFile(argument(argv, 'package-zip'), candidateRoot, 'PACKAGE_ZIP', candidateFs);
  const manifestPath = path.join(candidateRoot, 'release-manifest.json');
  const kitPath = path.join(candidateRoot, KIT_FILE);
  const cases = [];
  let verified;
  function check(id, action) {
    try { const detail = action(); cases.push({ id, status: 'PASS', ...(detail ? { detail } : {}) }); }
    catch (error) { cases.push({ id, status: 'FAIL', detail: String(error && error.message ? error.message : error) }); }
  }
  check('B2PKG-IDENTITY-AUTHORITY-FULL-TREE-ZIP', () => {
    verified = verifyAcceptanceCandidate(zipPath, manifestPath, kitPath, {
      formalInputLockPath: argument(argv, 'formal-input-lock'),
      approvalRegistryPath: argument(argv, 'approval-registry'),
      releaseAuthorityPath: argument(argv, 'release-authority'),
      releaseAuthoritySha256: argument(argv, 'release-authority-sha256'),
    }, candidateFs);
    return `manifest_files_checked=${verified.fileChecks.manifest_files_checked}; zip_entries_checked=${verified.fileChecks.zip_entries_checked}; mismatches=${verified.fileChecks.mismatches.length}`;
  });
  check('B2PKG-KIT-CONTRACT', () => {
    if (!verified) throw new Error('A9_BATCH2_KIT_NOT_VERIFIED');
    return `cases=${verified.kitCheck.cases}; assertions=${verified.kitCheck.assertions}`;
  });
  check('B2PKG-RUN-BINDING', () => {
    if (!verified) throw new Error('A9_BATCH2_RUN_BINDING_UNVERIFIED');
    const runId = argument(argv, 'run-id');
    if (!runId || runId !== verified.runId) throw new Error('A9_BATCH2_RUN_ID_MISMATCH');
    return `run_id=${runId}`;
  });
  check('B2PKG-RUNTIME-ABI', () => {
    if (!runtimeVersions.electron || runtimeVersions.electron !== '22.3.27'
      || Number(runtimeVersions.modules) !== 110 || path.basename(execPath).toLowerCase() !== 'electron.exe') {
      throw new Error(`A9_BATCH2_RUNTIME_ABI_INVALID:${runtimeVersions.electron}:${runtimeVersions.modules}`);
    }
  });
  let moduleResults = [];
  check('B2PKG-MODULE-LOAD', () => {
    moduleResults = loadPackagedModules(candidateRoot, environment.loader);
    const failed = moduleResults.filter((item) => item.status !== 'PASS');
    if (failed.length) throw new Error(`A9_BATCH2_MODULE_LOAD_FAILED:${failed.map((item) => item.module).join(',')}`);
    return `modules=${moduleResults.length}`;
  });
  const syntaxResults = compilePackagedEntries(candidateRoot, candidateFs);
  writeRaw(path.join(evidenceRoot, 'g1-module-load.json'), {
    schema_version: 1, candidate_label: CONTRACT.candidate, evidence_class: verified ? verified.authorityIdentity.evidence_class : null,
    run_id: argument(argv, 'run-id') || null, modules: moduleResults, syntax_compiled: syntaxResults,
  });
  const report = {
    schema_version: 1,
    record_id: `A9-33-BATCH2-PACKAGE-INTEGRITY-${Date.now()}`,
    recorded_at: new Date().toISOString(),
    status: cases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL',
    candidate_label: CONTRACT.candidate,
    candidate_tentative: true,
    lock_id: CONTRACT.lock_id,
    run_id: argument(argv, 'run-id') || null,
    package_filename: path.basename(zipPath),
    package_sha256: verified?.packageSha256 || fileHash(zipPath, candidateFs),
    candidate_manifest_sha256: fileHash(manifestPath, candidateFs),
    kit_sha256: verified?.kitSha256 || null,
    execution_binding: verified?.authorityIdentity || null,
    manifest_files_checked: verified?.fileChecks.manifest_files_checked || 0,
    zip_entries_checked: verified?.fileChecks.zip_entries_checked || 0,
    mismatches: verified?.fileChecks.mismatches || [],
    filesystem_profile: runtimeVersions.electron ? 'ELECTRON_ORIGINAL_FS_PHYSICAL_BYTES' : 'NODE_FS_PHYSICAL_BYTES',
    runtime_profile: {
      platform: process.platform, arch: process.arch, os_release: os.release(),
      electron: runtimeVersions.electron, node: runtimeVersions.node, modules: Number(runtimeVersions.modules),
    },
    cases,
    product_journeys: 'NOT_PERFORMED_BY_PACKAGE_INTEGRITY',
  };
  if (syntaxResults.some((item) => item.status !== 'PASS')) report.status = 'FAIL';
  writeRaw(outputPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
  if (argument(argv, 'phase')) {
    const phaseResult = writePhaseResult(argv, evidenceRoot, cases, verified, moduleResults, syntaxResults);
    if (phaseResult.status !== 'PASS') process.exitCode = 1;
  }
  return report;
}

module.exports = {
  main, compilePackagedEntries, integrityAssertions, writePhaseResult, selectPhysicalFileSystem, verifyFullTree, verifyAcceptanceCandidate, verifyLock, verifyKit, verifyZip, loadPackagedModules,
  REQUIRED_FILES, SUITE_FILES, MODULE_ENTRIES, SYNTAX_ENTRIES, LOCK_FILE, KIT_FILE, PACKAGE_NAME, AUTHORITY_KIND, EVIDENCE_CLASSES,
};
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
