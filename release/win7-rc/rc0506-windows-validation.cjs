'use strict';

// Electron keeps ASAR interception enabled in ELECTRON_RUN_AS_NODE mode. The
// release manifest hashes the outer .asar bytes, so validation must use normal
// filesystem semantics. Keep this inside the manifest-bound harness; an
// external NODE_OPTIONS preload would execute unverified code first.
process.noAsar = true;

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CASE_PASS = 'PASS';
const CASE_SKIP = 'NOT_APPLICABLE_TARGET_PROFILE_HASH';
const RC05_LOCAL_PROBE_MODES = Object.freeze({
  positive: 'positive',
  truncated: 'bounded',
  cancellation: 'wait-for-cancel',
});

async function main(argv) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`RC0506_WINDOWS_X64_REQUIRED:${process.platform}:${process.arch}`);
  }
  const args = parseArguments(argv);
  if (process.env.NODE_OPTIONS) throw new Error('RC0506_NODE_OPTIONS_PROHIBITED');
  requireFreshDirectory(args.evidenceRoot, 'RC0506_EVIDENCE_ROOT_NOT_EMPTY');
  requireFreshDirectory(args.userDataRoot, 'RC0506_USER_DATA_ROOT_NOT_EMPTY');
  const kit = verifyKit(__dirname);
  const lock = readJson(path.join(__dirname, 'VALIDATION_LOCK.json'), 'VALIDATION_LOCK');
  const candidate = verifyCandidate(args.packageRoot, lock.candidate);
  const modules = loadCandidateModules(args.packageRoot);
  const environment = collectEnvironment(args.userDataRoot);
  fs.mkdirSync(args.evidenceRoot, { recursive: true });
  fs.mkdirSync(args.userDataRoot, { recursive: true });
  const rc05 = await runRc05(args, lock, modules, candidate);
  writeJson(path.join(args.evidenceRoot, 'rc05-runner-windows.json'), rc05);
  const rc06 = runRc06(args, lock, modules, candidate, environment);
  writeJson(path.join(args.evidenceRoot, 'rc06-storage-windows.json'), rc06);
  const combinedStatus = rc06.status !== 'PASS' || !rc05.status.startsWith('PASS')
    ? 'FAIL'
    : rc05.status === 'PASS' ? 'PASS' : 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED';
  const summary = {
    schema_version: 1,
    suite: 'A7_RC05_RC06_WINDOWS_VALIDATION',
    status: combinedStatus,
    kit,
    candidate,
    environment,
    reports: {
      rc05: { file: 'rc05-runner-windows.json', sha256: sha256(path.join(args.evidenceRoot, 'rc05-runner-windows.json')), status: rc05.status },
      rc06: { file: 'rc06-storage-windows.json', sha256: sha256(path.join(args.evidenceRoot, 'rc06-storage-windows.json')), status: rc06.status },
    },
    gates: {
      rc05_windows: rc05.status,
      rc06_windows: rc06.status,
      win10: 'PARTIAL_RC05_RC06_WINDOWS_VALIDATION_ONLY',
      win7: 'NOT_PERFORMED',
      rc: 'NOT_PERFORMED',
    },
  };
  validateSummaryShape(summary);
  writeJson(path.join(args.evidenceRoot, 'rc0506-windows-summary.json'), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.status.startsWith('PASS')) {
    throw new Error(`RC0506_CASES_FAILED:RC05=${rc05.status}:RC06=${rc06.status}`);
  }
  validateSummary(summary);
  return summary;
}

async function runRc05(args, lock, modules, candidate) {
  const workRoot = path.join(args.userDataRoot, 'rc05-runner-work');
  fs.mkdirSync(workRoot, { recursive: true });
  const before = processSnapshot(['spike02_helper.exe', 'electron.exe']);
  const product = modules.createRcComposition({
    applicationRoot: modules.applicationRoot,
    userDataPath: path.join(args.userDataRoot, 'rc05-product'),
    stateModule: modules.stateModule,
    runnerModule: modules.runnerModule,
  });
  const cases = [];
  try {
    const productUnknown = await product.runner.execute(request('missing-profile', [], product.runnerWorkDirectory, 'rc05-product-unknown'));
    const productShell = await product.runner.execute(request('cmd.exe', ['/d', '/c', 'echo denied'], product.runnerWorkDirectory, 'rc05-product-shell'));
    cases.push(testCase('RC05-N01', 'Product manifest rejects unknown and Shell profiles before transport', [
      assertion('unknown-profile', productUnknown.status === 'rejected' && code(productUnknown) === 'PROFILE_NOT_FOUND'),
      assertion('shell-host', productShell.status === 'rejected' && code(productShell) === 'SHELL_HOST_PROHIBITED'),
    ], { unknown: summarizeRun(productUnknown), shell: summarizeRun(productShell) }));

    const whoamiPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe');
    const electronPath = path.join(args.packageRoot, 'electron.exe');
    const localProbePath = path.join(__dirname, 'RC0506_LOCAL_PROBE.cjs');
    const whoamiHash = sha256(whoamiPath);
    const electronHash = sha256(electronPath);
    const localProbeHash = sha256(localProbePath);
    const probeArgs = Object.fromEntries(Object.entries(RC05_LOCAL_PROBE_MODES)
      .map(([name, mode]) => [name, [localProbePath, mode]]));
    const productHashMatch = whoamiHash === candidate.product_whoami_sha256;
    if (productHashMatch) {
      const positive = await product.runner.execute(request('win7-whoami', [], product.runnerWorkDirectory, 'rc05-product-positive'));
      cases.push(testCase('RC05-P01', 'Exact product profile executes with verified containment', [
        ...productWhoamiAssertions(positive),
      ], summarizeRun(positive)));
    } else {
      cases.push({
        case_id: 'RC05-P01', status: CASE_SKIP,
        summary: 'The product profile intentionally pins the Win7 target whoami.exe; this Windows host has different system bytes.',
        assertions: [], evidence: { expected: candidate.product_whoami_sha256, actual: whoamiHash },
      });
    }

    const registry = new modules.runnerModule.ExecutableProfileRegistry([
      profile('rc05-harness-whoami', whoamiPath, whoamiHash, workRoot, (values) => values.length === 0 || same(values, ['/all'])),
      profile('rc05-harness-local-probe', electronPath, electronHash, workRoot, (values) => Object.values(probeArgs).some((allowed) => same(values, allowed))),
      { ...profile('rc05-high-risk-whoami', whoamiPath, whoamiHash, workRoot, (values) => values.length === 0), risk: 'high' },
    ]);
    const harnessRunner = new modules.runnerModule.NativeRunner({
      registry,
      transport: new modules.runnerModule.StdioHelperTransport(candidate.runner_helper_path),
    });
    const positive = await harnessRunner.execute(request('rc05-harness-local-probe', probeArgs.positive, workRoot, 'rc05-harness-positive'));
    const truncated = await harnessRunner.execute({
      ...request('rc05-harness-local-probe', probeArgs.truncated, workRoot, 'rc05-harness-truncated'),
      config: { ...request('x', [], workRoot, 'x').config, maxStdoutBytes: 128, maxStderrBytes: 128 },
    });
    cases.push(testCase('RC05-P02', 'Packaged NativeRunner and helper execute a manifest-bound network-free local probe', [
      assertion('exited-zero', positive.status === 'exited' && positive.exitCode === 0),
      assertion('cp936-output', positive.stdout.encoding === 'cp936' && positive.stdout.replacementCount === 0 && positive.stdout.text.includes('中文')),
      assertion('stdout-nonempty', positive.stdout.bytesRead > 0),
      assertion('whole-tree-containment', positive.termination.processTreeReaped && positive.termination.containment === 'job_object'),
      assertion('bounded-output', truncated.status === 'exited' && truncated.exitCode === 0 && truncated.stdout.truncated && truncated.stdout.bytesRetained <= 128 && truncated.stdout.replacementCount === 0 && !truncated.stdout.text.includes('\uFFFD')),
    ], { positive: summarizeRun(positive), bounded: summarizeRun(truncated), electron_sha256: electronHash, local_probe_sha256: localProbeHash, profile_scope: 'HARNESS_ONLY_NOT_PRODUCT_COMMAND_SURFACE', network_used: false }));

    const unknown = await harnessRunner.execute(request('not-registered', [], workRoot, 'rc05-negative-unknown'));
    const shell = await harnessRunner.execute(request('powershell.exe', ['-NoProfile'], workRoot, 'rc05-negative-shell'));
    const interactive = await harnessRunner.execute({ ...request('rc05-harness-whoami', [], workRoot, 'rc05-negative-stdin'), config: { ...request('x', [], workRoot, 'x').config, stdinPolicy: 'inherit' } });
    const secret = await harnessRunner.execute({ ...request('rc05-harness-whoami', [], workRoot, 'rc05-negative-secret'), config: { ...request('x', [], workRoot, 'x').config, envOverlay: { API_KEY: 'denied' } } });
    const high = await harnessRunner.execute(request('rc05-high-risk-whoami', [], workRoot, 'rc05-negative-high'));
    cases.push(testCase('RC05-N02', 'Unknown, Shell, interactive input, secret overlay and high-risk requests fail closed', [
      assertion('unknown', code(unknown) === 'PROFILE_NOT_FOUND'),
      assertion('shell', code(shell) === 'SHELL_HOST_PROHIBITED'),
      assertion('interactive-stdin', code(interactive) === 'INVALID_REQUEST'),
      assertion('secret-overlay', code(secret) === 'SENSITIVE_ENVIRONMENT_REJECTED'),
      assertion('high-risk', code(high) === 'PROFILE_RISK_REJECTED'),
    ], { unknown: code(unknown), shell: code(shell), interactive: code(interactive), secret: code(secret), high: code(high) }));

    const controller = new AbortController();
    const cancelling = harnessRunner.execute({
      ...request('rc05-harness-local-probe', probeArgs.cancellation, workRoot, 'rc05-cancel'),
      signal: controller.signal,
      config: { ...request('x', [], workRoot, 'x').config, timeoutMs: 20_000, idleTimeoutMs: 5_000 },
    });
    setTimeout(() => controller.abort(), 750);
    const cancelled = await cancelling;
    await delay(1000);
    const afterCancel = processSnapshot(['spike02_helper.exe', 'electron.exe']);
    cases.push(testCase('RC05-C01', 'Cooperative cancellation is acknowledged before helper exit and leaves no new process', [
      assertion('cancelled', cancelled.status === 'cancelled'),
      assertion('cleanup-confirmed', cancelled.termination.processTreeReaped && cancelled.termination.containment === 'job_object'),
      assertion('zero-new-helper', noNewPids(before['spike02_helper.exe'], afterCancel['spike02_helper.exe'])),
      assertion('zero-new-electron', noNewPids(before['electron.exe'], afterCancel['electron.exe'])),
    ], { result: summarizeRun(cancelled), before, after: afterCancel, electron_sha256: electronHash, local_probe_sha256: localProbeHash, profile_scope: 'HARNESS_ONLY_NOT_PRODUCT_COMMAND_SURFACE', network_used: false }));
  } finally {
    product.close();
  }
  await delay(500);
  const after = processSnapshot(['spike02_helper.exe', 'electron.exe']);
  cases.push(testCase('RC05-Z01', 'Round postflight contains no new helper or probe Electron process', [
    assertion('helper', noNewPids(before['spike02_helper.exe'], after['spike02_helper.exe'])),
    assertion('electron', noNewPids(before['electron.exe'], after['electron.exe'])),
  ], { before, after }));
  const required = cases.filter((item) => item.status !== CASE_SKIP);
  const allRequiredPass = required.every((item) => item.status === CASE_PASS);
  const exactProduct = cases.find((item) => item.case_id === 'RC05-P01').status === CASE_PASS;
  return {
    schema_version: 1,
    suite: 'RC05_WINDOWS_RUNNER',
    status: allRequiredPass ? (exactProduct ? 'PASS' : 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED') : 'FAIL',
    candidate_sha256: lock.candidate.sha256,
    cases,
    product_command_surface_changed: false,
    external_network_used: false,
    win7_validation: 'NOT_PERFORMED',
  };
}

function runRc06(args, lock, modules, candidate, environment) {
  const userData = path.join(args.userDataRoot, '中文 空格', 'rc06-state');
  fs.mkdirSync(userData, { recursive: true });
  const cases = [];
  let first = modules.createRcComposition({ applicationRoot: modules.applicationRoot, userDataPath: userData, stateModule: modules.stateModule, runnerModule: modules.runnerModule });
  const databasePath = first.stateRuntimeProfile.databasePath;
  const base = event('rc06-event-1', { role: 'user', content: '中文 空格 persistence' });
  const second = event('rc06-event-2', { tokens: 2 }, 'usage.recorded');
  const written = first.ledger.submitBatch([base, second]);
  const profile = first.stateRuntimeProfile;
  first.close();
  first = null;
  cases.push(testCase('RC06-P01', 'Actual ABI 110 binding opens with locked SQLite, WAL and compile options', [
    assertion('sqlite-version', profile.sqliteVersion === lock.rc06.sqlite),
    assertion('wal', profile.journalMode === 'wal'),
    ...lock.rc06.required_compile_options.map((option) => assertion(`compile-${option}`, profile.compileOptions.includes(option))),
    assertion('unicode-space-path', /中文 空格/.test(databasePath)),
  ], profile));

  const reopened = modules.createRcComposition({ applicationRoot: modules.applicationRoot, userDataPath: userData, stateModule: modules.stateModule, runnerModule: modules.runnerModule });
  const recovered = reopened.ledger.queryThread('rc06-thread');
  reopened.close();
  cases.push(testCase('RC06-P02', 'Immutable Unicode events survive close and reopen with continuous sequence', [
    assertion('count', recovered.length === 2),
    assertion('sequence', recovered.map((item) => item.seq).join(',') === '1,2'),
    assertion('roundtrip', JSON.stringify(recovered.map((item) => item.payload)) === JSON.stringify(written.map((item) => item.payload))),
  ], { recovered }));

  const storageRoot = path.join(args.packageRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3');
  const nativeBinding = path.join(storageRoot, 'build', 'Release', 'better_sqlite3.node');
  const Database = require(storageRoot);
  let database = new Database(databasePath, { nativeBinding });
  const ftsCount = database.prepare('SELECT COUNT(*) AS count FROM rc_events_v2_fts WHERE rc_events_v2_fts MATCH ?').get('中文').count;
  const quickCheck = database.pragma('quick_check', { simple: true });
  database.close();
  cases.push(testCase('RC06-P03', 'FTS5 indexes Unicode payload and quick_check remains clean', [
    assertion('fts-match', ftsCount >= 1),
    assertion('quick-check', String(quickCheck).toLowerCase() === 'ok'),
  ], { fts_match_count: ftsCount, quick_check: quickCheck }));

  database = new Database(databasePath, { nativeBinding });
  const bounded = new modules.stateModule.SqliteEventLedger(database, {
    maxEvents: 3, expectedSqliteVersion: '3.43.1', requiredCompileOptions: lock.rc06.required_compile_options, databasePath,
  });
  let capacityError = '';
  try { bounded.submitBatch([event('rc06-capacity-1', { ok: true }), event('rc06-capacity-2', { ok: true })]); }
  catch (error) { capacityError = message(error); }
  const capacityAtomic = bounded.size === 2 && !bounded.getById('rc06-capacity-1') && !bounded.getById('rc06-capacity-2');
  let payloadError = '';
  try { bounded.submitBatch([event('rc06-payload-small', { ok: true }), event('rc06-payload-large', { content: 'x'.repeat(65 * 1024) })]); }
  catch (error) { payloadError = message(error); }
  const payloadAtomic = bounded.size === 2 && !bounded.getById('rc06-payload-small') && !bounded.getById('rc06-payload-large');
  bounded.close();
  cases.push(testCase('RC06-N01', 'Capacity and payload limits reject complete batches atomically', [
    assertion('capacity-error', /capacity 3/.test(capacityError)),
    assertion('capacity-atomic', capacityAtomic),
    assertion('payload-error', /exceeds limit/.test(payloadError)),
    assertion('payload-atomic', payloadAtomic),
  ], { capacity_error: capacityError, payload_error: payloadError }));

  const corruptPath = path.join(args.evidenceRoot, 'rc06-intentionally-corrupted-probe.db');
  fs.copyFileSync(databasePath, corruptPath);
  database = new Database(corruptPath, { nativeBinding });
  database.prepare('UPDATE rc_events_v2 SET fingerprint = ? WHERE event_id = ?').run('intentionally-corrupted', 'rc06-event-1');
  database.close();
  let recoveryError = '';
  database = new Database(corruptPath, { nativeBinding });
  try {
    const unexpected = new modules.stateModule.SqliteEventLedger(database, {
      maxEvents: 100_000, expectedSqliteVersion: '3.43.1', requiredCompileOptions: lock.rc06.required_compile_options, databasePath: corruptPath,
    });
    unexpected.close();
  } catch (error) {
    recoveryError = message(error);
    database.close();
  }
  cases.push(testCase('RC06-N02', 'Recovery scan rejects a fingerprint-tampered copy fail closed', [
    assertion('recovery-rejected', /fingerprint mismatch/.test(recoveryError)),
  ], { error: recoveryError, probe_sha256: sha256(corruptPath), production_database_unchanged: true }));

  let uncError = '';
  try { modules.createRcComposition({ applicationRoot: modules.applicationRoot, userDataPath: '\\\\localhost\\rc06-denied', stateModule: modules.stateModule, runnerModule: modules.runnerModule }); }
  catch (error) { uncError = message(error); }
  const noResidue = !fs.existsSync(`${databasePath}-wal`) && !fs.existsSync(`${databasePath}-shm`);
  cases.push(testCase('RC06-N03', 'Network storage is rejected and normal close truncates WAL/SHM', [
    assertion('unc-rejected', /RC_STORAGE_LOCAL_DRIVE_REQUIRED/.test(uncError)),
    assertion('zero-wal-shm', noResidue),
  ], { unc_error: uncError, database_sha256: sha256(databasePath) }));

  const localMedia = environment.logical_disk && environment.logical_disk.drive_type === 3 && String(environment.logical_disk.file_system).toUpperCase() === 'NTFS';
  const ssd = environment.physical_disk && String(environment.physical_disk.media_type).toUpperCase() === 'SSD';
  cases.push(testCase('RC06-M01', 'Validation data is on local NTFS SSD media', [
    assertion('local-fixed-disk', localMedia),
    assertion('ntfs', localMedia),
    assertion('physical-ssd', ssd),
  ], { logical_disk: environment.logical_disk, physical_disk: environment.physical_disk }));

  const databaseSha256 = sha256(databasePath);
  const evidenceDatabaseName = 'rc06-production-state.db';
  const evidenceDatabasePath = path.join(args.evidenceRoot, evidenceDatabaseName);
  fs.copyFileSync(databasePath, evidenceDatabasePath);
  if (fs.statSync(evidenceDatabasePath).size !== fs.statSync(databasePath).size || sha256(evidenceDatabasePath) !== databaseSha256) {
    throw new Error('RC06_PRODUCTION_DATABASE_EVIDENCE_MISMATCH');
  }
  const allPass = cases.every((item) => item.status === CASE_PASS);
  return {
    schema_version: 1,
    suite: 'RC06_WINDOWS_STORAGE',
    status: allPass ? 'PASS' : 'FAIL',
    candidate_sha256: lock.candidate.sha256,
    native_binding_sha256: sha256(candidate.storage_binding_path),
    database: { path: databasePath, evidence_file: evidenceDatabaseName, size: fs.statSync(databasePath).size, sha256: databaseSha256, wal_shm_residue: noResidue ? [] : ['present'] },
    cases,
    win7_validation: 'NOT_PERFORMED',
  };
}

function verifyCandidate(packageRoot, expected) {
  const root = fs.realpathSync(packageRoot);
  const manifestPath = path.join(root, 'release-manifest.json');
  if (sha256(manifestPath) !== expected.release_manifest_sha256) throw new Error('RC0506_RELEASE_MANIFEST_MISMATCH');
  const manifest = readJson(manifestPath, 'RELEASE_MANIFEST');
  if (manifest.source_commit !== expected.source_commit) throw new Error('RC0506_CANDIDATE_SOURCE_COMMIT_MISMATCH');
  for (const item of manifest.files) {
    const filePath = path.resolve(root, ...item.path.split('/'));
    if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || fs.statSync(filePath).size !== item.size || sha256(filePath) !== item.sha256) {
      throw new Error(`RC0506_CANDIDATE_FILE_MISMATCH:${item.path}`);
    }
  }
  const helperPath = path.join(root, 'resources', 'native', 'runner', 'spike02_helper.exe');
  const bindingPath = path.join(root, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const runnerManifestPath = path.join(root, 'resources', 'native', 'runner', 'runner-manifest.json');
  if (sha256(helperPath) !== expected.runner_helper_sha256 || sha256(bindingPath) !== expected.storage_binding_sha256 || sha256(runnerManifestPath) !== expected.runner_manifest_sha256) {
    throw new Error('RC0506_NATIVE_BINDING_MISMATCH');
  }
  const runnerManifest = readJson(runnerManifestPath, 'RUNNER_MANIFEST');
  const productWhoami = runnerManifest.profiles.find((item) => item.id === 'win7-whoami');
  if (!productWhoami || !/^[a-f0-9]{64}$/.test(productWhoami.sha256 || '')) throw new Error('RC0506_PRODUCT_PROFILE_MISSING');
  return {
    package_root: root,
    release_manifest_sha256: expected.release_manifest_sha256,
    manifest_files: manifest.files.length,
    source_commit: manifest.source_commit,
    runner_helper_path: helperPath,
    runner_helper_sha256: expected.runner_helper_sha256,
    storage_binding_path: bindingPath,
    storage_binding_sha256: expected.storage_binding_sha256,
    product_whoami_sha256: productWhoami.sha256,
    integrity: 'PASS',
  };
}

function loadCandidateModules(packageRoot) {
  const applicationRoot = path.join(packageRoot, 'resources', 'app');
  return {
    applicationRoot,
    runnerModule: require(path.join(applicationRoot, 'runner', 'dist')),
    stateModule: require(path.join(applicationRoot, 'state', 'dist')),
    createRcComposition: require(path.join(applicationRoot, 'product', 'rc-composition.js')).createRcComposition,
  };
}

function collectEnvironment(userDataRoot) {
  const drive = path.parse(path.resolve(userDataRoot)).root.replace(/[\\/]$/, '');
  const logical = run('wmic.exe', ['logicaldisk', 'where', `DeviceID='${drive}'`, 'get', 'DeviceID,DriveType,FileSystem', '/format:list']);
  const logicalDisk = logical.status === 0 ? parseKeyValue(logical.stdout) : { error: bounded(logical.stderr || logical.stdout) };
  const letter = drive.replace(':', '');
  const script = `$p=Get-Partition -DriveLetter '${letter}' -ErrorAction Stop;$d=$p|Get-Disk -ErrorAction Stop;` +
    `$x=Get-PhysicalDisk -ErrorAction SilentlyContinue|Where-Object{$_.FriendlyName -eq $d.FriendlyName}|Select-Object -First 1;` +
    `[pscustomobject]@{disk_number=$d.Number;friendly_name=$d.FriendlyName;bus_type=[string]$d.BusType;partition_style=[string]$d.PartitionStyle;media_type=$(if($x){[string]$x.MediaType}else{'UNKNOWN'})}|ConvertTo-Json -Compress`;
  const physical = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  let physicalDisk = { media_type: 'UNKNOWN', error: bounded(physical.stderr || physical.stdout) };
  if (physical.status === 0) {
    try { physicalDisk = JSON.parse(physical.stdout.trim()); } catch (_error) { physicalDisk = { media_type: 'UNKNOWN', error: 'PHYSICAL_DISK_JSON_INVALID' }; }
  }
  const os = run('wmic.exe', ['os', 'get', 'Caption,Version,BuildNumber,OSArchitecture', '/format:list']);
  return {
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    os: os.status === 0 ? parseKeyValue(os.stdout) : { error: bounded(os.stderr || os.stdout) },
    logical_disk: {
      device_id: logicalDisk.DeviceID || drive,
      drive_type: Number(logicalDisk.DriveType),
      file_system: logicalDisk.FileSystem || 'UNKNOWN',
    },
    physical_disk: {
      disk_number: physicalDisk.disk_number,
      friendly_name: physicalDisk.friendly_name,
      bus_type: physicalDisk.bus_type,
      partition_style: physicalDisk.partition_style,
      media_type: physicalDisk.media_type || 'UNKNOWN',
      ...(physicalDisk.error ? { error: physicalDisk.error } : {}),
    },
  };
}

function verifyKit(root) {
  const manifest = readJson(path.join(root, 'KIT_MANIFEST.json'), 'KIT_MANIFEST');
  if (!manifest || manifest.schema_version !== 1 || !Array.isArray(manifest.files)) throw new Error('KIT_MANIFEST_SCHEMA_INVALID');
  for (const item of manifest.files) {
    const filePath = path.resolve(root, item.path);
    if (!filePath.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(filePath) || fs.statSync(filePath).size !== item.size || sha256(filePath) !== item.sha256) {
      throw new Error(`KIT_FILE_MISMATCH:${item.path}`);
    }
  }
  return { kit_id: manifest.kit_id, source_commit: manifest.source_commit, manifest_sha256: sha256(path.join(root, 'KIT_MANIFEST.json')), integrity: 'PASS' };
}

function parseArguments(argv) {
  const values = {};
  for (const item of argv) {
    const separator = item.indexOf('=');
    if (separator < 1) throw new Error(`RC0506_ARGUMENT_INVALID:${item}`);
    const key = item.slice(0, separator);
    const value = item.slice(separator + 1);
    if (!value) throw new Error(`RC0506_ARGUMENT_INVALID:${item}`);
    if (key === '--package-root') values.packageRoot = fs.realpathSync(value);
    else if (key === '--evidence') values.evidenceRoot = canonicalProspectivePath(value);
    else if (key === '--user-data') values.userDataRoot = canonicalProspectivePath(value);
    else throw new Error(`RC0506_ARGUMENT_UNKNOWN:${key}`);
  }
  if (!values.packageRoot || !values.evidenceRoot || !values.userDataRoot) throw new Error('RC0506_REQUIRED_ARGUMENT_MISSING');
  for (const [left, right] of [[values.packageRoot, values.evidenceRoot], [values.packageRoot, values.userDataRoot], [values.evidenceRoot, values.userDataRoot]]) {
    if (sameOrNested(left, right) || sameOrNested(right, left)) throw new Error('RC0506_PATHS_MUST_BE_SEPARATE');
  }
  return values;
}

function request(command, args, workDir, requestId) {
  return { requestId, command, args, approvalLevel: 'read_only', config: { timeoutMs: 15_000, idleTimeoutMs: 5_000, maxStdoutBytes: 64 * 1024, maxStderrBytes: 64 * 1024, workDir, stdinPolicy: 'closed' } };
}
function profile(id, executablePath, digest, workRoot, validateArgs) { return { id, executablePath, sha256: digest, risk: 'low', outputEncoding: 'cp936', workingDirectoryRoots: [workRoot], validateArgs }; }
function event(eventId, payload, type = 'message.added') { return { eventId, schemaVersion: 2, sessionId: 'rc06-session', threadId: 'rc06-thread', turnId: 'rc06-turn', runId: 'rc06-run', occurredAt: '2026-08-13T00:00:00.000Z', type, payload }; }
function same(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function code(result) { return result && result.error && result.error.code; }
function productWhoamiAssertions(value) { return [
  assertion('structured-exit', value.status === 'exited' && Number.isInteger(value.exitCode), 'Restricted whoami may return a localized access-denied exit code.'),
  assertion('cp936-output', value.stdout && value.stdout.encoding === 'cp936' && value.stdout.replacementCount === 0),
  assertion('tree-reaped', value.termination && value.termination.processTreeReaped && value.termination.containment === 'job_object'),
]; }
function summarizeRun(value) { return { status: value.status, exit_code: value.exitCode, stdout: value.stdout && { bytes_read: value.stdout.bytesRead, bytes_retained: value.stdout.bytesRetained, truncated: value.stdout.truncated, encoding: value.stdout.encoding, replacement_count: value.stdout.replacementCount, text: bounded(value.stdout.text) }, stderr: value.stderr && { bytes_read: value.stderr.bytesRead, bytes_retained: value.stderr.bytesRetained, truncated: value.stderr.truncated, encoding: value.stderr.encoding, replacement_count: value.stderr.replacementCount, text: bounded(value.stderr.text) }, termination: value.termination, error_code: code(value) }; }
function assertion(name, ok, note) { return { name, ok: ok === true, ...(note ? { note } : {}) }; }
function testCase(id, summary, assertions, evidence) { return { case_id: id, status: assertions.every((item) => item.ok) ? CASE_PASS : 'FAIL', summary, assertions, evidence }; }
function noNewPids(before, after) { return after.every((pid) => before.includes(pid)); }
function processSnapshot(names) { return Object.fromEntries(names.map((name) => [name, imagePids(name)])); }
function imagePids(name) { const result = run('tasklist.exe', ['/FI', `IMAGENAME eq ${name}`, '/FO', 'CSV', '/NH']); if (result.status !== 0) throw new Error(`TASKLIST_FAILED:${name}:${bounded(result.stderr)}`); return Array.from(result.stdout.matchAll(/^"[^"]+","(\d+)"/gm), (match) => Number(match[1])).sort((a, b) => a - b); }
function run(file, args) { return spawnSync(file, args, { shell: false, windowsHide: true, encoding: 'utf8', timeout: 30_000 }); }
function parseKeyValue(value) { return Object.fromEntries(String(value).split(/\r?\n/).map((line) => line.trim()).filter((line) => line.includes('=')).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; })); }
function sameOrNested(candidate, root) { const relative = path.relative(root, candidate); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function requireFreshDirectory(value, errorCode) {
  if (fs.existsSync(value) && fs.readdirSync(value).length !== 0) throw new Error(errorCode);
}
function canonicalProspectivePath(value) {
  let current = path.resolve(value);
  const suffix = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    suffix.unshift(path.basename(current));
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...suffix);
}
function readJson(filePath, label) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) { throw new Error(`${label}_INVALID:${message(error)}`); } }
function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function bounded(value) { return String(value || '').slice(0, 16 * 1024); }
function message(error) { return error && error.message ? error.message : String(error); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function validateRc05Report(value) {
  const expected = ['RC05-N01', 'RC05-P01', 'RC05-P02', 'RC05-N02', 'RC05-C01', 'RC05-Z01'];
  if (!value || value.schema_version !== 1 || value.suite !== 'RC05_WINDOWS_RUNNER' || !Array.isArray(value.cases)) throw new Error('RC05_REPORT_INVALID');
  for (const id of expected) {
    const matches = value.cases.filter((item) => item && item.case_id === id);
    if (matches.length !== 1) throw new Error(`RC05_CASE_COUNT_INVALID:${id}`);
    if (id === 'RC05-P01') {
      if (![CASE_PASS, CASE_SKIP].includes(matches[0].status)) throw new Error(`RC05_CASE_FAILED:${id}`);
    } else if (matches[0].status !== CASE_PASS) throw new Error(`RC05_CASE_FAILED:${id}`);
  }
  const product = value.cases.find((item) => item.case_id === 'RC05-P01');
  const expectedStatus = product.status === CASE_PASS ? 'PASS' : 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED';
  if (value.status !== expectedStatus || value.product_command_surface_changed !== false || value.external_network_used !== false || value.win7_validation !== 'NOT_PERFORMED') {
    throw new Error('RC05_GATE_INVALID');
  }
  return value;
}
function validateRc06Report(value) {
  const expected = ['RC06-P01', 'RC06-P02', 'RC06-P03', 'RC06-N01', 'RC06-N02', 'RC06-N03', 'RC06-M01'];
  if (!value || value.schema_version !== 1 || value.suite !== 'RC06_WINDOWS_STORAGE' || value.status !== 'PASS' || !Array.isArray(value.cases)) throw new Error('RC06_REPORT_INVALID');
  for (const id of expected) {
    const matches = value.cases.filter((item) => item && item.case_id === id);
    if (matches.length !== 1 || matches[0].status !== CASE_PASS) throw new Error(`RC06_CASE_FAILED:${id}`);
  }
  if (!value.database || value.database.evidence_file !== 'rc06-production-state.db' || !/^[a-f0-9]{64}$/.test(value.database.sha256 || '') || !Number.isInteger(value.database.size) || value.database.size <= 0 || !Array.isArray(value.database.wal_shm_residue) || value.database.wal_shm_residue.length !== 0 || value.win7_validation !== 'NOT_PERFORMED') {
    throw new Error('RC06_GATE_INVALID');
  }
  return value;
}
function validateSummary(value) {
  validateSummaryShape(value);
  if (!String(value.status).startsWith('PASS')) throw new Error('RC0506_SUMMARY_CASES_NOT_PASS');
  return value;
}
function validateSummaryShape(value) {
  if (!value || value.schema_version !== 1 || value.suite !== 'A7_RC05_RC06_WINDOWS_VALIDATION' || !value.reports || !value.gates || !['PASS', 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED', 'FAIL'].includes(value.status)) throw new Error('RC0506_SUMMARY_INVALID');
  if (value.gates.win10 !== 'PARTIAL_RC05_RC06_WINDOWS_VALIDATION_ONLY' || value.gates.win7 !== 'NOT_PERFORMED' || value.gates.rc !== 'NOT_PERFORMED') throw new Error('RC0506_SUMMARY_GATE_INVALID');
  return value;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => finishFatal(error, process.argv.slice(2)));
}

function finishFatal(error, argv, terminate = (codeValue) => process.exit(codeValue)) {
  try {
    const args = parseArguments(argv);
    fs.mkdirSync(args.evidenceRoot, { recursive: true });
    writeJson(path.join(args.evidenceRoot, 'rc0506-windows-fatal.json'), {
      schema_version: 1, suite: 'A7_RC05_RC06_WINDOWS_VALIDATION', status: 'FAIL',
      error: message(error), win10: 'FAIL_CLOSED', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED',
    });
  } catch (writeError) {
    fs.writeSync(2, `RC0506_FATAL_EVIDENCE_WRITE_FAILED:${message(writeError)}\n`);
  }
  fs.writeSync(2, `RC0506_VALIDATION_FAILED:${message(error)}\n`);
  terminate(1);
}

module.exports = { RC05_LOCAL_PROBE_MODES, finishFatal, parseArguments, productWhoamiAssertions, requireFreshDirectory, testCase, validateRc05Report, validateRc06Report, validateSummary, validateSummaryShape, verifyKit };
