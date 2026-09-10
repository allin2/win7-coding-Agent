'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const LOCK_FILE = 'a9-15-win7-27-input-lock.json';
const KIT_FILE = 'A9_15_VALIDATION_KIT.json';
const PACKAGE_NAME = 'Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip';
const REQUIRED_FILES = [
  'electron.exe', 'resources/default_app.asar', 'LICENSE', 'LICENSES.chromium.html', 'SBOM.cdx.json', 'THIRD_PARTY_LICENSES.md', 'INSTALLATION.md',
  'licenses/PROJECT-APACHE-2.0.txt', 'licenses/ELECTRON-MIT.txt', LOCK_FILE,
  'resources/app/package.json', 'resources/app/a9-runtime.json',
  ...[
    'a8-product-ipc.js', 'a9-agent-runtime.js', 'a9-package-runtime.js', 'a9-product-ipc.js',
    'active-workspace-store.js', 'credential-vault.js', 'desktop-host.js', 'desktop-ipc.js',
    'gateway-runtime.js', 'main.js', 'package.json', 'policy.js', 'preload.js', 'rc-composition.js',
    'replay.js', 'runner-runtime.js', 'security-policy.js',
    'renderer/a8-workspace.css', 'renderer/a9-agent-panel.js', 'renderer/a9-workbench.css',
    'renderer/a9-workbench.js', 'renderer/composer-controller.js', 'renderer/conversation-projector.js',
    'renderer/event-queue.js', 'renderer/gateway-settings-payload.js', 'renderer/index.html',
    'renderer/renderer.js', 'renderer/runner-log.js', 'renderer/session-ui.js', 'renderer/styles.css',
    'renderer/workbench.html',
  ].map((name) => `resources/app/product/${name}`),
  ...[
    'core/dist/a9-agent-loop.js', 'core/dist/system-prompt.js', 'core/dist/index.js',
    'gateway/dist/index.js', 'git-adapter/dist/index.js', 'runner/dist/index.js',
    'state/dist/a9-persistence.js', 'state/dist/index.js', 'workspace/dist/index.js',
  ].map((name) => `resources/app/${name}`),
  'resources/native/runner/spike02_helper.exe', 'resources/native/runner/runner-manifest.json',
  'resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  KIT_FILE, 'A9_15_WIN7_27_VALIDATION.md', 'RUN_A9_15_W27_INTEGRITY.cmd', 'RUN_WIN7_27_REPORT_VERIFY.cmd',
  'validation/a9-package-integrity-w27.cjs', 'validation/a9-win7-27-report.cjs',
  'validation/a9-win7-27-smoke.cjs', 'validation/a9-win7-27-driver.cjs',
];

function selectPhysicalFileSystem(runtimeVersions = process.versions, loadOriginalFs = () => require('original-fs')) {
  if (!runtimeVersions || !runtimeVersions.electron) return fs;
  const physical = loadOriginalFs();
  for (const method of ['existsSync', 'realpathSync', 'readdirSync', 'readFileSync', 'statSync']) {
    if (!physical || typeof physical[method] !== 'function') throw new Error(`A9_W27_PHYSICAL_FILESYSTEM_UNAVAILABLE:${method}`);
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
    if (entry.isSymbolicLink()) throw new Error(`A9_W27_PACKAGE_SYMLINK_PROHIBITED:${absolute}`);
    if (entry.isDirectory()) listFiles(root, absolute, out, fileSystem);
    else if (entry.isFile()) out.push(path.relative(root, absolute).replace(/\\/g, '/'));
    else throw new Error(`A9_W27_PACKAGE_SPECIAL_FILE_PROHIBITED:${absolute}`);
  }
  return out;
}
function readJson(filePath, fileSystem, code) {
  try { return JSON.parse(fileSystem.readFileSync(filePath, 'utf8')); }
  catch (_error) { throw new Error(code); }
}
function externalFile(value, candidateRoot, label, fileSystem) {
  if (!value) throw new Error(`A9_W27_${label}_REQUIRED`);
  const unresolved = path.resolve(value);
  if (!fileSystem.existsSync(unresolved) || !fileSystem.statSync(unresolved).isFile()) throw new Error(`A9_W27_${label}_NOT_FILE`);
  const resolved = fileSystem.realpathSync(unresolved);
  if (contained(candidateRoot, resolved)) throw new Error(`A9_W27_${label}_INSIDE_CANDIDATE`);
  return resolved;
}

function verifyFullTree(candidateRoot, manifest, fileSystem) {
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('A9_W27_MANIFEST_FILES_INVALID');
  const expected = new Map(manifest.files.map((item) => [item.path, item]));
  if (expected.size !== manifest.files.length) throw new Error('A9_W27_MANIFEST_DUPLICATE_PATH');
  const actual = listFiles(candidateRoot, candidateRoot, [], fileSystem).filter((item) => item !== 'release-manifest.json');
  if (actual.length !== expected.size) throw new Error(`A9_W27_FILE_COUNT_MISMATCH:${actual.length}:${expected.size}`);
  for (const relative of actual) {
    const item = expected.get(relative);
    const absolute = path.join(candidateRoot, ...relative.split('/'));
    if (!item || !Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) {
      throw new Error(`A9_W27_MANIFEST_ENTRY_INVALID:${relative}`);
    }
    if (fileSystem.statSync(absolute).size !== item.size || fileHash(absolute, fileSystem) !== item.sha256) {
      throw new Error(`A9_W27_FILE_MISMATCH:${relative}`);
    }
  }
  return expected;
}

function verifyPe32PlusAmd64(filePath, expectDll, fileSystem) {
  const bytes = fileSystem.readFileSync(filePath);
  if (bytes.length < 0x100 || bytes.readUInt16LE(0) !== 0x5a4d) throw new Error(`A9_W27_NATIVE_NOT_PE:${filePath}`);
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 0x40 || pe + 24 > bytes.length || bytes.readUInt32LE(pe) !== 0x00004550
    || bytes.readUInt16LE(pe + 4) !== 0x8664 || bytes.readUInt16LE(pe + 24) !== 0x20b) {
    throw new Error(`A9_W27_NATIVE_NOT_AMD64_PE:${filePath}`);
  }
  const characteristics = bytes.readUInt16LE(pe + 22);
  if ((characteristics & 0x0002) === 0 || Boolean(characteristics & 0x2000) !== expectDll) {
    throw new Error(`A9_W27_NATIVE_PE_CONTRACT_INVALID:${filePath}`);
  }
}

function verifyLock(lock, manifest, registryBytes) {
  const runner = lock.inputs && lock.inputs.runner_return_zip;
  const storage = lock.inputs && lock.inputs.storage_return_zip;
  const electron = lock.inputs && lock.inputs.electron_zip;
  if (lock.schema_version !== 1 || lock.lock_id !== 'A9-15-INPUTS-UI-PROGRESS-WIN7-27'
    || lock.release_id !== manifest.release_id || lock.version !== manifest.version
    || lock.target?.os !== 'Windows 7 SP1 build 7601' || lock.target?.architecture !== 'x64'
    || lock.target?.delivery !== 'SELF_CONTAINED_OFFLINE_WIN7_X64' || lock.inputs_are_not_a9_pass !== true
    || lock.gates?.win10 !== 'INHERITED_NATIVE_INPUTS_FROM_WIN7_22_EXACT_HASH'
    || lock.gates?.win7 !== 'NOT_PERFORMED_WIN7_27' || lock.gates?.alpha !== 'NOT_PERFORMED'
    || lock.provenance?.task !== 'A9-15' || lock.provenance?.previous_candidate !== 'WIN7-26'
    || lock.provenance?.previous_candidate_result !== 'PROJECTION_EVIDENCE_AND_INTEGRATION_ASSERTION_REPAIR_REQUIRED'
    || lock.provenance?.change_scope !== 'MACHINE_READABLE_PROJECTION_EVIDENCE_AND_DRIVER_PROTOCOL_ISOLATION'
    || electron?.version !== '22.3.27' || runner?.profile !== 'D-013-v25-a9-trusted-shell-current-user'
    || runner?.protocol_version !== 2 || runner?.runtime_profile !== 'a9-trusted-shell-current-user-v1'
    || storage?.sqlite !== '3.43.1' || storage?.electron_abi !== 110) {
    throw new Error('A9_W27_INPUT_LOCK_CONTRACT_INVALID');
  }
  for (const input of [electron, runner, storage]) {
    if (!/^[a-f0-9]{64}$/.test(input?.sha256 || '') || !/^[a-f0-9]{64}$/.test(input?.required_entry_sha256 || '')) {
      throw new Error('A9_W27_INPUT_LOCK_HASH_INVALID');
    }
  }
  const approval = runner.approval_registry;
  if (approval?.path !== 'release/win7-product-v3/a9-v25-approved-kits.json'
    || !/^[a-f0-9]{40}$/.test(approval.commit || '') || approval.sha256 !== sha256(registryBytes)) {
    throw new Error('A9_W27_APPROVAL_REGISTRY_BINDING_INVALID');
  }
  return { runner, storage, electron, approval };
}

function verifyAuthority(candidateRoot, manifest, zipPath, authority, fileSystem) {
  const lockPath = externalFile(authority.formalInputLockPath, candidateRoot, 'FORMAL_INPUT_LOCK', fileSystem);
  const registryPath = externalFile(authority.approvalRegistryPath, candidateRoot, 'APPROVAL_REGISTRY', fileSystem);
  const authorityPath = externalFile(authority.releaseAuthorityPath, candidateRoot, 'RELEASE_AUTHORITY', fileSystem);
  if (path.basename(lockPath).toLowerCase() !== LOCK_FILE || path.basename(registryPath).toLowerCase() !== 'a9-v25-approved-kits.json') {
    throw new Error('A9_W27_EXTERNAL_AUTHORITY_FILENAME_INVALID');
  }
  const lockBytes = fileSystem.readFileSync(lockPath);
  const registryBytes = fileSystem.readFileSync(registryPath);
  const authorityBytes = fileSystem.readFileSync(authorityPath);
  if (!/^[a-f0-9]{64}$/.test(String(authority.releaseAuthoritySha256 || ''))
    || sha256(authorityBytes) !== authority.releaseAuthoritySha256) throw new Error('A9_W27_AUTHORITY_PIN_MISMATCH');
  if (!lockBytes.equals(fileSystem.readFileSync(path.join(candidateRoot, LOCK_FILE)))) {
    throw new Error('A9_W27_FORMAL_INPUT_LOCK_BYTE_MISMATCH');
  }
  const lock = readJson(lockPath, fileSystem, 'A9_W27_FORMAL_INPUT_LOCK_JSON_INVALID');
  const registry = readJson(registryPath, fileSystem, 'A9_W27_APPROVAL_REGISTRY_JSON_INVALID');
  const approved = readJson(authorityPath, fileSystem, 'A9_W27_RELEASE_AUTHORITY_JSON_INVALID');
  const { runner, storage, electron, approval } = verifyLock(lock, manifest, registryBytes);
  if (approved.schema_version !== 1 || approved.kind !== 'WIN7_27_RELEASE_AUTHORITY'
    || approved.status !== 'APPROVED_FOR_WIN7_27_VALIDATION'
    || approved.formal_input_lock_sha256 !== sha256(lockBytes)
    || approved.approval_registry?.commit !== approval.commit
    || approved.approval_registry?.sha256 !== approval.sha256
    || approved.candidate?.source_commit !== manifest.source_commit
    || approved.candidate?.package_sha256 !== fileHash(zipPath, fileSystem)
    || approved.candidate?.manifest_sha256 !== fileHash(path.join(candidateRoot, 'release-manifest.json'), fileSystem)) {
    throw new Error('A9_W27_RELEASE_AUTHORITY_BINDING_INVALID');
  }
  const buildKit = runner.build_kit;
  const found = registry.schema_version === 1 && Array.isArray(registry.kits)
    && registry.kits.some((item) => item?.status === 'APPROVED_FOR_RETURN_RECORDING'
      && item.revision === buildKit?.revision && item.filename === buildKit?.filename
      && item.sha256 === buildKit?.sha256 && item.source_commit === buildKit?.source_commit
      && item.input_lock_sha256 === buildKit?.input_lock_sha256
      && item.package_manifest_sha256 === buildKit?.package_manifest_sha256);
  if (!found) throw new Error('A9_W27_NATIVE_BUILD_KIT_NOT_APPROVED');
  return {
    lock, runner, storage, electron,
    authorityIdentity: {
      release_authority_sha256: sha256(authorityBytes),
      formal_input_lock_sha256: sha256(lockBytes),
      approval_registry_commit: approval.commit,
      approval_registry_sha256: approval.sha256,
    },
  };
}

function verifyZip(zipPath, manifest, manifestBytes, files, fileSystem) {
  if (path.basename(zipPath) !== PACKAGE_NAME) throw new Error('A9_W27_ZIP_FILENAME_INVALID');
  const archive = fileSystem.readFileSync(zipPath);
  const expected = new Map(files);
  expected.set('release-manifest.json', { size: manifestBytes.length, sha256: sha256(manifestBytes) });
  const fail = () => { throw new Error('A9_W27_CANDIDATE_ZIP_INVALID'); };
  const end = archive.length - 22;
  if (end < 0 || archive.readUInt32LE(end) !== 0x06054b50 || archive.readUInt32LE(end + 4) !== 0
    || archive.readUInt16LE(end + 20) !== 0 || archive.readUInt16LE(end + 8) !== expected.size
    || archive.readUInt16LE(end + 10) !== expected.size) fail();
  const centralStart = archive.readUInt32LE(end + 16);
  if (centralStart + archive.readUInt32LE(end + 12) !== end) fail();
  const prefix = `Win7CodingAgent-${manifest.version}-win7-x64/`;
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
    const item = expected.get(relative);
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
    if (bytes.length !== item.size || sha256(bytes) !== item.sha256) fail();
    localCursor = local + 30 + nameLength + compressedSize;
    cursor += 46 + nameLength;
  }
  if (cursor !== end || localCursor !== centralStart || seen.size !== expected.size) fail();
}

function verifyAcceptanceCandidate(zipPath, manifestPath, kitPath, authority, fileSystem = fs) {
  const manifestBytes = fileSystem.readFileSync(manifestPath);
  const manifest = readJson(manifestPath, fileSystem, 'A9_W27_MANIFEST_JSON_INVALID');
  if (manifest.schema_version !== 1 || manifest.release_id !== 'WIN7-CODING-AGENT-A9-ALPHA1'
    || manifest.version !== '0.3.0-alpha.1' || !/^[a-f0-9]{40}$/.test(manifest.source_commit || '')
    || manifest.source_dirty !== false || manifest.external_acceptance_eligible !== true
    || manifest.status !== 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS'
    || manifest.gates?.developer_package_integrity !== 'PASS'
    || manifest.gates?.product_assembly !== 'NOT_PERFORMED' || manifest.gates?.win10 !== 'NOT_PERFORMED'
    || manifest.gates?.win7 !== 'NOT_PERFORMED' || manifest.gates?.alpha !== 'NOT_PERFORMED') {
    throw new Error('A9_W27_MANIFEST_IDENTITY_INVALID');
  }
  const candidateRoot = fileSystem.realpathSync(path.dirname(manifestPath));
  if (contained(candidateRoot, fileSystem.realpathSync(zipPath))) throw new Error('A9_W27_ZIP_INSIDE_CANDIDATE');
  const files = verifyFullTree(candidateRoot, manifest, fileSystem);
  for (const relative of REQUIRED_FILES) if (!files.has(relative)) throw new Error(`A9_W27_CLOSURE_MISSING:${relative}`);
  if (files.get(KIT_FILE)?.sha256 !== fileHash(kitPath, fileSystem)) throw new Error('A9_W27_KIT_MANIFEST_MISMATCH');
  const kit = readJson(kitPath, fileSystem, 'A9_W27_KIT_JSON_INVALID');
  if (kit.schema_version !== 1 || kit.kit_id !== 'A9-15-WIN7-27-UI-PROGRESS-20260910-01'
    || kit.candidate_label !== 'WIN7-27' || kit.candidate_id !== manifest.release_id
    || kit.candidate_version !== manifest.version || kit.source_commit !== manifest.source_commit
    || !Array.isArray(kit.required_cases) || kit.required_cases.length !== 9
    || kit.required_cases.some((item) => !/^W27-0[1-9]-/.test(item?.case_id || '')
      || !Array.isArray(item.assertions) || !item.assertions.length)) {
    throw new Error('A9_W27_KIT_CONTRACT_INVALID');
  }
  const caseIds = new Set(kit.required_cases.map((item) => item.case_id));
  if (!caseIds.has('W27-03-INSPECTOR-PERSISTED-RESTART')
      || !caseIds.has('W27-04-APPROVAL-FAILURE-ORDER')
      || !caseIds.has('W27-09-LATEST-OUTCOME-PROJECTION')) {
    throw new Error('A9_W27_PROJECTION_CASES_MISSING');
  }
  const resolvedAuthority = verifyAuthority(candidateRoot, manifest, zipPath, authority, fileSystem);
  const { runner, storage, electron } = resolvedAuthority;
  if (manifest.locked_inputs?.electron_zip?.sha256 !== electron.sha256
    || manifest.locked_inputs?.runner_return_zip?.sha256 !== runner.sha256
    || manifest.locked_inputs?.storage_return_zip?.sha256 !== storage.sha256
    || manifest.required_native?.runner_helper !== runner.required_entry_sha256
    || manifest.required_native?.better_sqlite3_node !== storage.required_entry_sha256
    || manifest.required_native?.electron_abi !== 110) throw new Error('A9_W27_NATIVE_BINDING_INVALID');
  if (manifest.release_authority?.formal_input_lock_sha256 !== resolvedAuthority.authorityIdentity.formal_input_lock_sha256
    || manifest.release_authority?.approval_registry_commit !== resolvedAuthority.authorityIdentity.approval_registry_commit
    || manifest.release_authority?.approval_registry_sha256 !== resolvedAuthority.authorityIdentity.approval_registry_sha256) {
    throw new Error('A9_W27_MANIFEST_AUTHORITY_BINDING_INVALID');
  }
  verifyPe32PlusAmd64(path.join(candidateRoot, 'electron.exe'), false, fileSystem);
  verifyPe32PlusAmd64(path.join(candidateRoot, 'resources', 'native', 'runner', 'spike02_helper.exe'), false, fileSystem);
  verifyPe32PlusAmd64(path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'), true, fileSystem);
  const runtime = readJson(path.join(candidateRoot, 'resources', 'app', 'a9-runtime.json'), fileSystem, 'A9_W27_RUNTIME_JSON_INVALID');
  const packageJson = readJson(path.join(candidateRoot, 'resources', 'app', 'package.json'), fileSystem, 'A9_W27_PACKAGE_JSON_INVALID');
  if (runtime.release_id !== manifest.release_id || runtime.version !== manifest.version || runtime.state_schema !== 4
    || packageJson.main !== 'product/main.js' || packageJson.runtime_profile?.electron !== '22.3.27'
    || packageJson.runtime_profile?.electron_abi !== 110 || packageJson.runtime_profile?.state_schema !== 4) {
    throw new Error('A9_W27_RUNTIME_PROFILE_INVALID');
  }
  verifyZip(zipPath, manifest, manifestBytes, files, fileSystem);
  return {
    manifest, kit,
    packageSha256: fileHash(zipPath, fileSystem),
    manifestSha256: sha256(manifestBytes),
    authorityIdentity: resolvedAuthority.authorityIdentity,
  };
}

function main(argv = process.argv.slice(2)) {
  const candidateFs = selectPhysicalFileSystem();
  const candidateRoot = candidateFs.realpathSync(path.resolve(__dirname, '..'));
  const outputPath = path.resolve(argument(argv, 'out', path.join(candidateRoot, '..', 'a9-win7-27-evidence', 'a9-package-integrity.json')));
  if (contained(candidateRoot, outputPath)) throw new Error('A9_W27_EVIDENCE_INSIDE_CANDIDATE');
  const zipPath = externalFile(argument(argv, 'package-zip'), candidateRoot, 'PACKAGE_ZIP', candidateFs);
  const manifestPath = path.join(candidateRoot, 'release-manifest.json');
  const kitPath = path.join(candidateRoot, KIT_FILE);
  const cases = [];
  let verified;
  function check(id, action) {
    try { const detail = action(); cases.push({ id, status: 'PASS', ...(detail ? { detail } : {}) }); }
    catch (error) { cases.push({ id, status: 'FAIL', detail: String(error && error.message ? error.message : error) }); }
  }
  check('W27PKG-IDENTITY-AUTHORITY-FULL-TREE-ZIP', () => {
    verified = verifyAcceptanceCandidate(zipPath, manifestPath, kitPath, {
      formalInputLockPath: argument(argv, 'formal-input-lock'),
      approvalRegistryPath: argument(argv, 'approval-registry'),
      releaseAuthorityPath: argument(argv, 'release-authority'),
      releaseAuthoritySha256: argument(argv, 'release-authority-sha256'),
    }, candidateFs);
  });
  check('W27PKG-RUNTIME-ABI', () => {
    if (!process.versions.electron || process.versions.electron !== '22.3.27'
      || Number(process.versions.modules) !== 110 || path.basename(process.execPath).toLowerCase() !== 'electron.exe') {
      throw new Error(`A9_W27_RUNTIME_ABI_INVALID:${process.versions.electron}:${process.versions.modules}`);
    }
  });
  const report = {
    schema_version: 1,
    record_id: `A9-15-WIN7-27-PACKAGE-INTEGRITY-${Date.now()}`,
    recorded_at: new Date().toISOString(),
    status: cases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL',
    candidate_label: 'WIN7-27',
    package_filename: path.basename(zipPath),
    package_sha256: verified?.packageSha256 || fileHash(zipPath, candidateFs),
    candidate_manifest_sha256: fileHash(manifestPath, candidateFs),
    release_authority: verified?.authorityIdentity || null,
    filesystem_profile: process.versions.electron ? 'ELECTRON_ORIGINAL_FS_PHYSICAL_BYTES' : 'NODE_FS_PHYSICAL_BYTES',
    runtime_profile: {
      platform: process.platform, arch: process.arch, os_release: os.release(),
      electron: process.versions.electron, node: process.versions.node, modules: Number(process.versions.modules),
    },
    cases,
    product_journeys: 'NOT_PERFORMED_BY_PACKAGE_INTEGRITY',
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
  return report;
}

module.exports = { main, selectPhysicalFileSystem, verifyFullTree, verifyAcceptanceCandidate, REQUIRED_FILES };
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
