import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extractZip, getZipEntry, readZipEntries, readZipEntry, writeDeterministicZip } from './zip-utils.mjs';

export function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

export function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function assertHash(label, actual, expected) {
  if (!/^[a-f0-9]{64}$/.test(expected || '') || actual !== expected) {
    throw new Error(`${label}_SHA256_MISMATCH:expected=${expected};actual=${actual}`);
  }
}

export function copyDirectory(source, destination) {
  if (!fs.statSync(source).isDirectory()) throw new Error(`SOURCE_DIRECTORY_REQUIRED:${source}`);
  fs.mkdirSync(destination, { recursive: true });
  const entries = fs.readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`SOURCE_SYMLINK_PROHIBITED:${from}`);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    else throw new Error(`SOURCE_SPECIAL_FILE_PROHIBITED:${from}`);
  }
}

export function listPayloadFiles(root) {
  const files = [];
  function visit(current, relative) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const item = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`PAYLOAD_SYMLINK_PROHIBITED:${item}`);
      if (entry.isDirectory()) visit(absolute, item);
      else if (entry.isFile()) files.push(item.replace(/\\/g, '/'));
      else throw new Error(`PAYLOAD_SPECIAL_FILE_PROHIBITED:${item}`);
    }
  }
  visit(root, '');
  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

export function createFileManifest(root, forbiddenPatterns) {
  return listPayloadFiles(root).map((relativePath) => {
    const normalized = relativePath.toLowerCase();
    for (const pattern of forbiddenPatterns) {
      if (normalized.includes(String(pattern).toLowerCase())) throw new Error(`FORBIDDEN_PAYLOAD:${relativePath}`);
    }
    const absolute = path.join(root, ...relativePath.split('/'));
    return {
      path: relativePath,
      size: fs.statSync(absolute).size,
      sha256: sha256File(absolute),
    };
  });
}

export function buildRelease(options) {
  const root = path.resolve(options.repositoryRoot);
  const lock = loadJson(options.lockPath);
  validateLock(lock);
  validateSourceCommit(options.sourceCommit);
  const electronZip = requireFile(options.electronZip, 'ELECTRON_ZIP');
  const runnerZip = requireFile(options.runnerZip, 'RUNNER_RETURN_ZIP');
  const storageZip = requireFile(options.storageZip, 'STORAGE_RETURN_ZIP');
  assertHash('ELECTRON_ZIP', sha256File(electronZip), lock.inputs.electron_zip.sha256);
  assertHash('RUNNER_RETURN_ZIP', sha256File(runnerZip), lock.inputs.runner_return_zip.sha256);
  assertHash('STORAGE_RETURN_ZIP', sha256File(storageZip), lock.inputs.storage_return_zip.sha256);

  const electronBytes = getZipEntry(electronZip, lock.inputs.electron_zip.required_entry);
  const helperBytes = getZipEntry(runnerZip, lock.inputs.runner_return_zip.required_entry);
  const sqliteBytes = getZipEntry(storageZip, lock.inputs.storage_return_zip.required_entry);
  assertHash('ELECTRON_EXE', sha256Bytes(electronBytes), lock.inputs.electron_zip.required_entry_sha256);
  assertHash('D013_HELPER', sha256Bytes(helperBytes), lock.inputs.runner_return_zip.required_entry_sha256);
  assertHash('D014_BINDING', sha256Bytes(sqliteBytes), lock.inputs.storage_return_zip.required_entry_sha256);

  const outputRoot = path.resolve(options.outputRoot);
  const workRoot = path.join(outputRoot, 'work');
  const packageName = `Win7CodingAgent-${lock.version}-win7-x64`;
  const stage = path.join(workRoot, packageName);
  fs.rmSync(workRoot, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
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
    name: 'win7-coding-agent-rc',
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
    },
  });
  fs.mkdirSync(path.join(nativeRoot, 'runner'), { recursive: true });
  fs.writeFileSync(path.join(nativeRoot, 'runner', 'spike02_helper.exe'), helperBytes);
  const runnerManifestPath = path.join(nativeRoot, 'runner', 'runner-manifest.json');
  writeJson(runnerManifestPath, createRunnerManifest(lock));
  const runnerManifestSha256 = sha256File(runnerManifestPath);
  extractStorageRuntime(storageZip, nativeRoot);
  assertNativeOutsideApp(stage);
  verifyPackagedJavaScript(appRoot);
  writeJson(path.join(appRoot, 'rc-runtime.json'), {
    schema_version: 1,
    release_id: lock.release_id,
    version: lock.version,
    native_layout: 'EXTERNAL_TO_APP_AND_ASAR',
    runner_manifest: '../native/runner/runner-manifest.json',
    runner_manifest_sha256: runnerManifestSha256,
    runner_work_directory: 'runner-work',
    storage_module_root: '../native/storage/node_modules/better-sqlite3',
    storage_native_binding: '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    storage_database: 'state/agent-events-v2.db',
    storage_profile: lock.inputs.storage_return_zip.profile,
    unsupported: ['interactive-winpty', 'arbitrary-shell', 'network-drive-storage', 'hdd-performance-claim'],
  });

  const licensesRoot = path.join(stage, 'licenses');
  fs.mkdirSync(licensesRoot, { recursive: true });
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(licensesRoot, 'PROJECT-APACHE-2.0.txt'));
  const electronLicense = path.join(stage, 'LICENSE');
  if (!fs.existsSync(electronLicense)) throw new Error('ELECTRON_LICENSE_MISSING');
  fs.copyFileSync(electronLicense, path.join(licensesRoot, 'ELECTRON-MIT.txt'));

  const sbom = buildSbom(lock, options.sourceCommit, electronZip, runnerZip, storageZip, runtimeDependencies);
  writeJson(path.join(stage, 'SBOM.cdx.json'), sbom);
  fs.writeFileSync(path.join(stage, 'THIRD_PARTY_LICENSES.md'), licenseInventory(lock), 'utf8');
  fs.writeFileSync(path.join(stage, 'INSTALLATION.md'), installationGuide(lock), 'utf8');
  fs.copyFileSync(path.join(root, 'release', 'win7-rc', 'rc04-smoke.cjs'), path.join(stage, 'RC04_SMOKE.cjs'));

  const files = createFileManifest(stage, lock.forbidden_payload_patterns);
  const manifest = {
    schema_version: 1,
    release_id: lock.release_id,
    version: lock.version,
    source_commit: options.sourceCommit,
    source_date_epoch: lock.source_date_epoch,
    status: 'DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS',
    target: lock.target,
    layout: {
      application: 'resources/app (unpacked trusted local application)',
      native: 'resources/native (external to app and ASAR)',
      interactive_terminal: 'ABSENT',
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
    },
  };
  writeJson(path.join(stage, 'release-manifest.json'), manifest);
  verifyStagedRcContract(stage, manifest);

  const zipPath = path.join(outputRoot, `${packageName}.zip`);
  fs.rmSync(zipPath, { force: true });
  writeDeterministicZip(workRoot, zipPath, lock.source_date_epoch);
  const zipHash = sha256File(zipPath);
  fs.writeFileSync(`${zipPath}.sha256`, `${zipHash}  ${path.basename(zipPath)}\n`, 'ascii');
  return { lock, packageName, stage, zipPath, zipHash, manifest, fileCount: files.length };
}

export function verifyReleaseZip(zipPath, sidecarPath, lockPath) {
  const lock = loadJson(lockPath);
  validateLock(lock);
  const actualZipHash = sha256File(zipPath);
  const sidecar = fs.readFileSync(sidecarPath, 'ascii').trim().split(/\s+/);
  if (sidecar.length < 2 || sidecar[0] !== actualZipHash || sidecar.slice(1).join(' ') !== path.basename(zipPath)) {
    throw new Error('RC_ZIP_SIDECAR_MISMATCH');
  }
  const entries = readZipEntries(zipPath).filter((entry) => !entry.directory);
  const manifestEntries = entries.filter((entry) => entry.name.endsWith('/release-manifest.json'));
  if (manifestEntries.length !== 1) throw new Error(`RC_MANIFEST_COUNT:${manifestEntries.length}`);
  const rootPrefix = manifestEntries[0].name.slice(0, -'release-manifest.json'.length);
  const manifest = JSON.parse(readZipEntry(manifestEntries[0]).toString('utf8'));
  if (manifest.schema_version !== 1 || manifest.release_id !== lock.release_id || manifest.version !== lock.version) {
    throw new Error('RC_MANIFEST_IDENTITY_INVALID');
  }
  const archiveByName = new Map(entries.map((entry) => [entry.name, entry]));
  for (const file of manifest.files) {
    const entry = archiveByName.get(`${rootPrefix}${file.path}`);
    if (!entry) throw new Error(`RC_MANIFEST_FILE_MISSING:${file.path}`);
    const bytes = readZipEntry(entry);
    if (bytes.length !== file.size || sha256Bytes(bytes) !== file.sha256) {
      throw new Error(`RC_MANIFEST_FILE_MISMATCH:${file.path}`);
    }
  }
  const expectedNames = new Set(manifest.files.map((file) => `${rootPrefix}${file.path}`));
  expectedNames.add(`${rootPrefix}release-manifest.json`);
  for (const entry of entries) {
    if (!expectedNames.has(entry.name)) throw new Error(`RC_UNMANIFESTED_FILE:${entry.name}`);
  }
  if (entries.some((entry) => /(?:^|\/)(?:winpty|node-pty)(?:\/|$)/i.test(entry.name))) {
    throw new Error('RC_INTERACTIVE_TERMINAL_PAYLOAD_PROHIBITED');
  }
  const nativeEntries = entries.filter((entry) => /\.(?:node|dll|exe)$/i.test(entry.name) && entry.name.includes('/resources/native/'));
  const appNativeEntries = entries.filter((entry) => /\.(?:node|dll)$/i.test(entry.name) && entry.name.includes('/resources/app/'));
  if (nativeEntries.length < 2 || appNativeEntries.length !== 0) throw new Error('RC_NATIVE_LAYOUT_INVALID');
  verifyArchivedRcContract(archiveByName, rootPrefix, manifest);
  return {
    zip_sha256: actualZipHash,
    file_count: manifest.files.length,
    source_commit: manifest.source_commit,
    gates: manifest.gates,
    manifest,
    native_file_count: nativeEntries.length,
  };
}

function verifyStagedRcContract(stage, manifest) {
  const runtimePath = path.join(stage, 'resources', 'app', 'rc-runtime.json');
  const runnerManifestPath = path.join(stage, 'resources', 'native', 'runner', 'runner-manifest.json');
  const helperPath = path.join(stage, 'resources', 'native', 'runner', 'spike02_helper.exe');
  const storagePath = path.join(stage, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  validateRcDocuments(
    loadJson(runtimePath),
    loadJson(runnerManifestPath),
    manifest,
    sha256File(runnerManifestPath),
    sha256File(helperPath),
    sha256File(storagePath),
  );
}

function verifyArchivedRcContract(archiveByName, rootPrefix, manifest) {
  const bytes = (relativePath) => {
    const entry = archiveByName.get(`${rootPrefix}${relativePath}`);
    if (!entry) throw new Error(`RC_CONTRACT_FILE_MISSING:${relativePath}`);
    return readZipEntry(entry);
  };
  const runtimeBytes = bytes('resources/app/rc-runtime.json');
  const runnerBytes = bytes('resources/native/runner/runner-manifest.json');
  const helperBytes = bytes('resources/native/runner/spike02_helper.exe');
  const storageBytes = bytes('resources/native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node');
  validateRcDocuments(
    JSON.parse(runtimeBytes.toString('utf8')),
    JSON.parse(runnerBytes.toString('utf8')),
    manifest,
    sha256Bytes(runnerBytes),
    sha256Bytes(helperBytes),
    sha256Bytes(storageBytes),
  );
}

function validateRcDocuments(runtime, runnerManifest, manifest, runnerManifestHash, helperHash, storageHash) {
  const expectedUnsupported = ['interactive-winpty', 'arbitrary-shell', 'network-drive-storage', 'hdd-performance-claim'];
  if (!runtime || runtime.schema_version !== 1 || runtime.release_id !== manifest.release_id || runtime.version !== manifest.version ||
      runtime.native_layout !== 'EXTERNAL_TO_APP_AND_ASAR' || runtime.runner_manifest !== '../native/runner/runner-manifest.json' ||
      runtime.storage_module_root !== '../native/storage/node_modules/better-sqlite3' ||
      runtime.storage_native_binding !== '../native/storage/node_modules/better-sqlite3/build/Release/better_sqlite3.node' ||
      runtime.storage_database !== 'state/agent-events-v2.db' || runtime.runner_work_directory !== 'runner-work' ||
      runtime.storage_profile !== 'E22-SQLITE343-LOCAL-SSD' || runtime.runner_manifest_sha256 !== runnerManifestHash ||
      !expectedUnsupported.every((item) => runtime.unsupported && runtime.unsupported.includes(item))) {
    throw new Error('RC_RUNTIME_CONTRACT_INVALID');
  }
  if (!runnerManifest || runnerManifest.schema_version !== 1 || !runnerManifest.helper ||
      runnerManifest.helper.path !== 'spike02_helper.exe' || runnerManifest.helper.sha256 !== helperHash ||
      !Array.isArray(runnerManifest.profiles) || runnerManifest.profiles.length !== 1) {
    throw new Error('RC_RUNNER_MANIFEST_INVALID');
  }
  const profile = runnerManifest.profiles[0];
  if (profile.id !== 'win7-whoami' || profile.executable_path !== 'C:\\Windows\\System32\\whoami.exe' ||
      profile.risk !== 'low' || profile.output_encoding !== 'cp936' ||
      !Array.isArray(profile.working_directory_roots) || profile.working_directory_roots.length !== 1 ||
      profile.working_directory_roots[0] !== '${RC_RUNNER_WORK_ROOT}') {
    throw new Error('RC_RUNNER_PROFILE_INVALID');
  }
  if (manifest.required_native.runner_helper !== helperHash || manifest.required_native.better_sqlite3_node !== storageHash ||
      manifest.required_native.electron_abi !== 110) {
    throw new Error('RC_REQUIRED_NATIVE_INVALID');
  }
}

function validateLock(lock) {
  if (!lock || lock.schema_version !== 1 || !lock.release_id || !lock.version || !Number.isInteger(lock.source_date_epoch)) {
    throw new Error('RC_INPUT_LOCK_INVALID');
  }
  for (const input of Object.values(lock.inputs || {})) {
    if (!input || !/^[a-f0-9]{64}$/.test(input.sha256 || '') || !/^[a-f0-9]{64}$/.test(input.required_entry_sha256 || '')) {
      throw new Error('RC_INPUT_LOCK_HASH_INVALID');
    }
  }
  const runner = lock.runtime_profiles && lock.runtime_profiles.runner;
  if (!runner || runner.id !== 'win7-whoami' || runner.executable_path !== 'C:\\Windows\\System32\\whoami.exe' ||
      !/^[a-f0-9]{64}$/.test(runner.executable_sha256 || '') || runner.working_directory_token !== '${RC_RUNNER_WORK_ROOT}' ||
      !Array.isArray(runner.argv_exact)) {
    throw new Error('RC_RUNNER_PROFILE_LOCK_INVALID');
  }
}

function createRunnerManifest(lock) {
  const runner = lock.runtime_profiles.runner;
  return {
    schema_version: 1,
    release: `${lock.release_id}-${lock.version}`,
    helper: {
      path: 'spike02_helper.exe',
      sha256: lock.inputs.runner_return_zip.required_entry_sha256,
    },
    profiles: [{
      id: runner.id,
      executable_path: runner.executable_path,
      sha256: runner.executable_sha256,
      risk: 'low',
      output_encoding: runner.output_encoding,
      working_directory_roots: [runner.working_directory_token],
      argv_policy: { exact: runner.argv_exact },
    }],
    acceptance_action: {
      profile_id: runner.id,
      args: [],
      timeout_ms: 15_000,
      idle_timeout_ms: 5_000,
      max_stdout_bytes: 65_536,
      max_stderr_bytes: 65_536,
    },
  };
}

function validateSourceCommit(value) {
  if (!/^[a-f0-9]{40}$/.test(value || '')) throw new Error('SOURCE_COMMIT_INVALID');
}

function requireFile(filePath, label) {
  const resolved = path.resolve(filePath || '');
  if (!filePath || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`${label}_REQUIRED:${resolved}`);
  return resolved;
}

function requireBuiltDirectory(root, moduleName) {
  const directory = path.join(root, 'src', moduleName, 'dist');
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error(`MODULE_BUILD_REQUIRED:${moduleName}`);
  return directory;
}

function copyRuntimeJavaScript(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const entries = fs.readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`SOURCE_SYMLINK_PROHIBITED:${from}`);
    if (entry.isDirectory()) copyRuntimeJavaScript(from, to);
    else if (entry.isFile() && entry.name.endsWith('.js')) fs.copyFileSync(from, to);
    else if (!entry.isFile()) throw new Error(`SOURCE_SPECIAL_FILE_PROHIBITED:${from}`);
  }
}

function copyRuntimeDependencies(root, appRoot) {
  const names = ['ajv', 'fast-deep-equal', 'fast-uri', 'json-schema-traverse', 'require-from-string'];
  return names.map((name) => {
    const source = path.join(root, 'src', 'shell', 'node_modules', name);
    const packageJson = loadJson(path.join(source, 'package.json'));
    copyDirectory(source, path.join(appRoot, 'node_modules', name));
    return {
      name,
      version: packageJson.version,
      license: packageJson.license || 'UNKNOWN',
      package_json_sha256: sha256File(path.join(source, 'package.json')),
    };
  });
}

function verifyPackagedJavaScript(appRoot) {
  const requireFromApp = createRequire(path.join(appRoot, 'package.json'));
  for (const entry of [
    './dist/ipc/schema.js',
    './core/dist/index.js',
    './gateway/dist/index.js',
    './runner/dist/index.js',
    './state/dist/index.js',
    './workspace/dist/index.js',
  ]) {
    try {
      requireFromApp(entry);
    } catch (error) {
      throw new Error(`PACKAGED_MODULE_LOAD_FAILED:${entry}:${error && error.message ? error.message : String(error)}`);
    }
  }
}

function extractStorageRuntime(storageZip, nativeRoot) {
  const temporary = path.join(nativeRoot, '.storage-extract');
  const allowed = [
    'output/runtime/node_modules/better-sqlite3/',
    'output/runtime/node_modules/bindings/',
    'output/runtime/node_modules/file-uri-to-path/',
  ];
  extractZip(storageZip, temporary, (name) => allowed.some((prefix) => name.startsWith(prefix)));
  const source = path.join(temporary, 'output', 'runtime', 'node_modules');
  const destination = path.join(nativeRoot, 'storage', 'node_modules');
  for (const moduleName of ['better-sqlite3', 'bindings', 'file-uri-to-path']) {
    copyDirectory(path.join(source, moduleName), path.join(destination, moduleName));
  }
  fs.rmSync(temporary, { recursive: true, force: true });
}

function assertNativeOutsideApp(stage) {
  const appRoot = path.join(stage, 'resources', 'app');
  const bad = listPayloadFiles(appRoot).filter((name) => /\.(?:node|dll|exe)$/i.test(name));
  if (bad.length > 0) throw new Error(`NATIVE_INSIDE_APP_PROHIBITED:${bad.join(',')}`);
  const helper = path.join(stage, 'resources', 'native', 'runner', 'spike02_helper.exe');
  const sqlite = path.join(stage, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  if (!fs.existsSync(helper) || !fs.existsSync(sqlite)) throw new Error('REQUIRED_NATIVE_LAYOUT_MISSING');
}

function buildSbom(lock, sourceCommit, electronZip, runnerZip, storageZip, runtimeDependencies) {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${crypto.createHash('sha256').update(`${lock.release_id}:${sourceCommit}`).digest('hex').slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')}`,
    version: 1,
    metadata: {
      component: { type: 'application', name: 'Win7 Coding Agent', version: lock.version },
      properties: [
        { name: 'win7:source_commit', value: sourceCommit },
        { name: 'win7:delivery', value: lock.target.delivery },
        { name: 'win7:status', value: 'DEVELOPER_PACKAGE_CANDIDATE' },
      ],
    },
    components: [
      component('framework', 'Electron', lock.inputs.electron_zip.version, 'MIT', sha256File(electronZip), 'EOL; trusted local UI only'),
      component('application', 'D-013 native helper', 'v24', 'Apache-2.0', lock.inputs.runner_return_zip.required_entry_sha256, 'Low-risk noninteractive profiles only'),
      component('library', 'better-sqlite3', lock.inputs.storage_return_zip.version, 'MIT', lock.inputs.storage_return_zip.required_entry_sha256, `Electron ABI ${lock.inputs.storage_return_zip.electron_abi}`),
      component('library', 'SQLite', lock.inputs.storage_return_zip.sqlite, 'LicenseRef-Public-Domain', lock.inputs.storage_return_zip.required_entry_sha256, 'Embedded by better-sqlite3; FTS5/WAL'),
      ...runtimeDependencies.map((item) => component('library', item.name, item.version, item.license, item.package_json_sha256, 'Packaged JavaScript runtime dependency')),
    ],
    externalReferences: [
      { type: 'distribution', url: `file:${path.basename(electronZip)}`, comment: sha256File(electronZip) },
      { type: 'distribution', url: `file:${path.basename(runnerZip)}`, comment: sha256File(runnerZip) },
      { type: 'distribution', url: `file:${path.basename(storageZip)}`, comment: sha256File(storageZip) },
    ],
  };
}

function component(type, name, version, license, hash, note) {
  const licenseDeclaration = license.startsWith('LicenseRef-')
    ? { name: license.slice('LicenseRef-'.length).replace(/-/g, ' ') }
    : { id: license };
  return {
    type,
    name,
    version,
    hashes: [{ alg: 'SHA-256', content: hash }],
    licenses: [{ license: licenseDeclaration }],
    properties: [{ name: 'win7:delivery_note', value: note }],
  };
}

function licenseInventory(lock) {
  return `# Third-party licenses and support risk\n\n` +
    `This inventory is bound to ${lock.release_id} ${lock.version}. Full Electron Chromium notices are shipped as \`LICENSES.chromium.html\`.\n\n` +
    `| Component | Version | License | Delivery and risk |\n|---|---:|---|---|\n` +
    `| Electron | ${lock.inputs.electron_zip.version} | MIT plus Chromium third-party notices | EOL; trusted packaged UI only; no untrusted web content |\n` +
    `| D-013 native helper | v24 | Apache-2.0 | Project-maintained; low-risk noninteractive profiles only |\n` +
    `| better-sqlite3 | ${lock.inputs.storage_return_zip.version} | MIT | Locked Electron ABI ${lock.inputs.storage_return_zip.electron_abi}; local SSD only |\n` +
    `| SQLite | ${lock.inputs.storage_return_zip.sqlite} | Public Domain | Embedded, FTS5/WAL enabled; project owns backports |\n` +
    `| bindings | 1.5.0 | MIT | Runtime loader copied from the verified D-014 closure |\n` +
    `| file-uri-to-path | 1.0.0 | MIT | Runtime transitive dependency copied from the verified D-014 closure |\n` +
    `| ajv | 8.20.0 | MIT | IPC Schema validator; packaged for offline startup |\n` +
    `| fast-deep-equal | 3.1.3 | MIT | ajv runtime dependency |\n` +
    `| fast-uri | 3.1.4 | BSD-3-Clause | ajv runtime dependency |\n` +
    `| json-schema-traverse | 1.0.0 | MIT | ajv runtime dependency |\n` +
    `| require-from-string | 2.0.2 | MIT | ajv runtime dependency |\n`;
}

function installationGuide(lock) {
  return `# Installation prerequisites\n\n` +
    `- Target: ${lock.target.os}, ${lock.target.architecture}.\n` +
    `- Delivery: ${lock.target.delivery}; the installer must not download at runtime.\n` +
    `- Supported storage: local NTFS SSD under profile ${lock.inputs.storage_return_zip.profile}.\n` +
    `- Interactive terminal, arbitrary shell, service installation, PATH changes, firewall changes and reboot are not included.\n` +
    `- This package is a developer candidate until separate Win10 and signed Win7 RC gates pass.\n\n` +
    `## RC-04 Windows product smoke\n\n` +
    `From cmd.exe, use a fresh evidence directory and user-data directory:\n\n` +
    `\`\`\`text\n` +
    `set ELECTRON_RUN_AS_NODE=1\n` +
    `electron.exe RC04_SMOKE.cjs --evidence=C:\\rc04-evidence --user-data=C:\\rc04-user-data\n` +
    `set ELECTRON_RUN_AS_NODE=\n` +
    `\`\`\`\n\n` +
    `The harness runs two clean product starts and records only RC-04 product-smoke evidence; it does not declare full Win10 or Win7 PASS.\n`;
}
