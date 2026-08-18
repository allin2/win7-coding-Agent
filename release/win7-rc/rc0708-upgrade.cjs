'use strict';

// Electron's ASAR hook changes fs.stat/readFile semantics for .asar paths.
// Lifecycle verification must hash the package's raw on-disk bytes.
process.noAsar = true;

// RC-07 upgrade/rollback lifecycle harness. The .cmd wrapper performs all
// directory renames between phases because this script always runs from the
// product's own electron.exe, and Windows cannot rename a directory that
// hosts the running process image. Phase contract (also in the lock):
//   exit 0  = phase OK (round may continue or complete)
//   exit 1  = fail-closed fatal
//   exit 42 = staging complete, wrapper performs activation renames
//   exit 43 = activated tree failed verification, wrapper performs rollback

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractZip } = require('./rc0708-zip.cjs');
const { verifyKitDirectory, sameProvenance } = require('./rc0708-kit-integrity.cjs');

const EXIT = Object.freeze({ OK: 0, FATAL: 1, STAGE_COMPLETE: 42, ROLLBACK_REQUIRED: 43 });
const RC0708_SCENARIOS = Object.freeze(['success', 'corrupt-staged-file', 'activation-corruption']);
const RC0708_SUFFIXES = Object.freeze({
  staging: '.staging-rc0708',
  extract: '.staging-rc0708.extract',
  rollback: '.rollback-rc0708',
  quarantine: '.quarantine-rc0708',
});
const RC0708_MARKER_FILES = Object.freeze(['rc0708-marker-a.txt', 'rc0708-marker-b.txt']);
const USER_DATA_MAX_FILES = 512;
const USER_DATA_MAX_BYTES = 64 * 1024 * 1024;

async function main(argv) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`RC0708_WINDOWS_X64_REQUIRED:${process.platform}:${process.arch}`);
  }
  const args = parseArguments(argv);
  if (process.env.NODE_OPTIONS) throw new Error('RC0708_NODE_OPTIONS_PROHIBITED');
  const lock = readJson(path.join(__dirname, 'LIFECYCLE_LOCK.json'), 'RC0708_LOCK');
  args.kitProvenance = verifyKitDirectory(__dirname, path.basename(__filename), {
    kitId: lock.kit_id,
    candidateSha256: lock.candidate.sha256,
  });
  if (!RC0708_SCENARIOS.includes(args.scenario)) throw new Error(`RC0708_SCENARIO_INVALID:${args.scenario}`);
  const statePath = path.join(args.evidenceRoot, `rc0708-upgrade-state-${args.scenario}.json`);
  const routes = {
    stage: () => phaseStage(args, lock, statePath),
    verify: () => phaseVerify(args, lock, statePath),
    'verify-rollback': () => phaseVerifyRollback(args, lock, statePath),
    residue: () => phaseResidue(args, lock, statePath),
  };
  const route = routes[args.phase];
  if (!route) throw new Error(`RC0708_PHASE_INVALID:${args.phase}`);
  const code = await route();
  process.exitCode = code;
}

async function phaseStage(args, lock, statePath) {
  if (fs.existsSync(statePath)) throw new Error('RC0708_STATE_ALREADY_EXISTS');
  requireFreshEvidence(args.evidenceRoot, args.scenario, 'upgrade');
  const productRoot = fs.realpathSync(args.productRoot);
  requireDirectory(productRoot, 'RC0708_PRODUCT_ROOT_INVALID');
  const siblings = lifecyclePaths(productRoot);
  requireAbsentSiblingNames(siblings);
  const original = strictVerifyTree(productRoot, 'RC0708_CURRENT_INSTALL');
  const newZip = fs.realpathSync(args.newZip);
  if (path.basename(newZip) !== lock.candidate.filename || fs.statSync(newZip).size !== lock.candidate.size || sha256(newZip) !== lock.candidate.sha256) {
    throw new Error('RC0708_NEW_ZIP_MISMATCH');
  }
  fs.mkdirSync(args.userDataRoot, { recursive: true });
  for (const marker of RC0708_MARKER_FILES) {
    fs.writeFileSync(path.join(args.userDataRoot, marker), `RC0708_MARKER ${marker}\n`, 'ascii');
  }
  const userDataSnapshot = snapshotUserData(args.userDataRoot);
  // The candidate ZIP nests everything under a single top-level directory, so
  // extraction lands in a scratch sibling first and the ZIP root is renamed
  // into place as the staging directory; renames stay on one volume.
  const scratch = siblings.extract;
  extractZip(newZip, scratch);
  const extractedRoot = path.join(scratch, lock.candidate.filename.replace(/\.zip$/i, ''));
  if (!fs.existsSync(extractedRoot) || !fs.statSync(extractedRoot).isDirectory()) throw new Error('RC0708_ZIP_ROOT_MISSING');
  fs.renameSync(extractedRoot, siblings.staging);
  fs.rmSync(scratch, { recursive: true, force: true });
  if (fs.existsSync(scratch)) throw new Error('RC0708_EXTRACT_SCRATCH_CLEANUP_FAILED');
  const staged = strictVerifyTree(siblings.staging, 'RC0708_STAGED_TREE');
  if (staged.manifestSha256 !== lock.candidate.release_manifest_sha256 || staged.sourceCommit !== lock.candidate.source_commit) {
    throw new Error('RC0708_STAGED_MANIFEST_NOT_LOCK_BOUND');
  }
  const state = {
    schema_version: 1,
    kind: 'rc0708-upgrade',
    scenario: args.scenario,
    product_root: productRoot,
    new_zip: newZip,
    user_data_root: fs.realpathSync(args.userDataRoot),
    staging_dir: siblings.staging,
    rollback_dir: siblings.rollback,
    original_manifest_sha256: original.manifestSha256,
    original_source_commit: original.sourceCommit,
    original_file_count: original.fileCount,
    new_manifest_sha256: staged.manifestSha256,
    new_source_commit: staged.sourceCommit,
    user_data_snapshot: userDataSnapshot,
    kit_provenance: args.kitProvenance,
    phase: 'staged',
  };
  if (args.scenario === 'corrupt-staged-file') {
    const victim = pickCorruptionVictim(staged.manifest);
    const victimPath = path.join(siblings.staging, ...victim.path.split('/'));
    flipMiddleByte(victimPath);
    let detected = '';
    try { strictVerifyTree(siblings.staging, 'RC0708_STAGED_TREE'); } catch (error) { detected = message(error); }
    if (!detected || !/FILE_HASH_MISMATCH|FILE_MISSING|FILE_EXTRA/.test(detected)) {
      throw new Error(`RC0708_STAGED_CORRUPTION_NOT_DETECTED:${detected}`);
    }
    fs.rmSync(siblings.staging, { recursive: true, force: true });
    if (fs.existsSync(siblings.staging)) throw new Error('RC0708_STAGING_CLEANUP_FAILED');
    strictVerifyTree(productRoot, 'RC0708_CURRENT_INSTALL');
    state.phase = 'round_complete';
    state.injection = { victim: victim.path, detected };
    writeJson(statePath, state);
    return EXIT.OK;
  }
  writeJson(statePath, state);
  return EXIT.STAGE_COMPLETE;
}

async function phaseVerify(args, lock, statePath) {
  const state = readJson(statePath, 'RC0708_STATE');
  requireMatchingProvenance(state, args);
  if (state.scenario !== args.scenario || state.phase !== 'staged') throw new Error(`RC0708_STATE_PHASE_INVALID:${state.phase}`);
  const productRoot = fs.realpathSync(args.productRoot);
  if (productRoot !== state.product_root) throw new Error('RC0708_PRODUCT_ROOT_CHANGED');
  let injected = null;
  if (args.scenario === 'activation-corruption') {
    const manifest = readJson(path.join(productRoot, 'release-manifest.json'), 'RC0708_ACTIVATED_MANIFEST');
    const victim = pickCorruptionVictim(manifest);
    flipMiddleByte(path.join(productRoot, ...victim.path.split('/')));
    injected = victim.path;
  }
  let verified = null;
  let failure = '';
  try { verified = strictVerifyTree(productRoot, 'RC0708_ACTIVATED_TREE'); } catch (error) { failure = message(error); }
  if (!failure && (verified.manifestSha256 !== state.new_manifest_sha256 || verified.sourceCommit !== state.new_source_commit)) {
    failure = `RC0708_ACTIVATED_MANIFEST_UNEXPECTED:${verified.manifestSha256}`;
  }
  if (!failure) {
    state.phase = 'verified';
    writeJson(statePath, state);
    return EXIT.OK;
  }
  if (args.scenario !== 'activation-corruption') throw new Error(`RC0708_ACTIVATED_TREE_UNEXPECTEDLY_INVALID:${failure}`);
  state.phase = 'verify_failed';
  state.injection = { victim: injected, detected: failure };
  writeJson(statePath, state);
  return EXIT.ROLLBACK_REQUIRED;
}

async function phaseVerifyRollback(args, lock, statePath) {
  const state = readJson(statePath, 'RC0708_STATE');
  requireMatchingProvenance(state, args);
  if (state.scenario !== args.scenario || state.phase !== 'verify_failed') throw new Error(`RC0708_STATE_PHASE_INVALID:${state.phase}`);
  const productRoot = fs.realpathSync(args.productRoot);
  if (productRoot !== state.product_root) throw new Error('RC0708_PRODUCT_ROOT_CHANGED');
  const restored = strictVerifyTree(productRoot, 'RC0708_RESTORED_TREE');
  if (restored.manifestSha256 !== state.original_manifest_sha256 || restored.sourceCommit !== state.original_source_commit || restored.fileCount !== state.original_file_count) {
    throw new Error('RC0708_ROLLBACK_NOT_BYTE_IDENTICAL');
  }
  if (fs.existsSync(state.staging_dir)) {
    fs.rmSync(state.staging_dir, { recursive: true, force: true });
    if (fs.existsSync(state.staging_dir)) throw new Error('RC0708_BROKEN_TREE_CLEANUP_FAILED');
  }
  state.phase = 'rolled_back';
  writeJson(statePath, state);
  return EXIT.OK;
}

async function phaseResidue(args, lock, statePath) {
  const state = readJson(statePath, 'RC0708_STATE');
  requireMatchingProvenance(state, args);
  const productRoot = fs.realpathSync(args.productRoot);
  const siblings = lifecyclePaths(productRoot);
  const before = processSnapshot();
  const expected = state.phase === 'verified'
    ? { manifestSha256: state.new_manifest_sha256, sourceCommit: state.new_source_commit, fileCount: undefined }
    : { manifestSha256: state.original_manifest_sha256, sourceCommit: state.original_source_commit, fileCount: state.original_file_count };
  const current = strictVerifyTree(productRoot, 'RC0708_FINAL_TREE');
  const userDataNow = snapshotUserData(state.user_data_root);
  const userDataUnchanged = snapshotEqual(userDataNow, state.user_data_snapshot);
  const residueAbsent = !fs.existsSync(siblings.staging) && !fs.existsSync(siblings.rollback) && !fs.existsSync(siblings.quarantine);
  const cases = [];
  if (state.scenario === 'success') {
    cases.push(testCase('RC07-U01', 'Side-by-side staging, hash verification and rename activation advance to the locked new manifest', [
      assertion('new-manifest-active', current.manifestSha256 === state.new_manifest_sha256),
      assertion('new-commit-active', current.sourceCommit === state.new_source_commit),
      assertion('original-was-replaced', state.original_manifest_sha256 !== state.new_manifest_sha256 || state.original_source_commit !== state.new_source_commit),
    ], { original_manifest_sha256: state.original_manifest_sha256, new_manifest_sha256: state.new_manifest_sha256, original_source_commit: state.original_source_commit, new_source_commit: state.new_source_commit, file_count: current.fileCount }));
  } else if (state.scenario === 'corrupt-staged-file') {
    cases.push(testCase('RC07-U02', 'A corrupted staged file is detected before activation and the install is untouched', [
      assertion('corruption-detected', /FILE_HASH_MISMATCH|FILE_MISSING|FILE_EXTRA/.test(state.injection.detected)),
      assertion('staging-removed', !fs.existsSync(state.staging_dir)),
      assertion('original-untouched', current.manifestSha256 === state.original_manifest_sha256 && current.sourceCommit === state.original_source_commit),
    ], { injection: state.injection }));
  } else {
    cases.push(testCase('RC07-U03', 'Post-activation corruption triggers rollback to a byte-identical original without mixed versions', [
      assertion('corruption-detected', /FILE_HASH_MISMATCH|FILE_MISSING|FILE_EXTRA/.test(state.injection.detected)),
      assertion('original-manifest-restored', current.manifestSha256 === state.original_manifest_sha256),
      assertion('original-commit-restored', current.sourceCommit === state.original_source_commit),
      assertion('original-file-count-restored', current.fileCount === state.original_file_count),
      assertion('no-mixed-version-tree', current.fileCount === state.original_file_count && current.manifestSha256 === state.original_manifest_sha256),
    ], { injection: state.injection, restored: { manifest_sha256: current.manifestSha256, source_commit: current.sourceCommit, file_count: current.fileCount } }));
  }
  cases.push(testCase('RC07-Z01', 'Upgrade round leaves no lifecycle residue and user data is untouched', [
    assertion('staging-absent', !fs.existsSync(siblings.staging)),
    assertion('extract-scratch-absent', !fs.existsSync(siblings.extract)),
    assertion('rollback-absent', !fs.existsSync(siblings.rollback)),
    assertion('quarantine-absent', !fs.existsSync(siblings.quarantine)),
    assertion('user-data-unchanged', userDataUnchanged),
    assertion('only-host-electron', before['electron.exe'].length === 1 && before['electron.exe'][0] === process.pid),
    assertion('zero-helper', before['spike02_helper.exe'].length === 0),
  ], { user_data_files: userDataNow.files.length, user_data_bytes: userDataNow.totalBytes, processes: before, host_pid: process.pid }));
  const allPass = cases.every((item) => item.status === 'PASS');
  const report = {
    schema_version: 1,
    suite: 'RC07_WINDOWS_UPGRADE_ROLLBACK',
    scenario: state.scenario,
    status: allPass ? 'PASS' : 'FAIL',
    candidate_zip_sha256: lock.candidate.sha256,
    expected_final_manifest_sha256: expected.manifestSha256,
    cases,
    product_command_surface_changed: false,
    external_network_used: false,
    system_configuration_changed: false,
    kit_provenance: args.kitProvenance,
    win7_validation: 'NOT_PERFORMED',
    gates: { win10: 'PARTIAL_RC0708_LIFECYCLE_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' },
  };
  const evidencePath = path.join(args.evidenceRoot, `rc07-upgrade-${state.scenario}.json`);
  if (fs.existsSync(evidencePath)) throw new Error(`RC0708_EVIDENCE_ALREADY_EXISTS:${evidencePath}`);
  writeJson(evidencePath, report);
  return allPass ? EXIT.OK : EXIT.FATAL;
}

function requireMatchingProvenance(state, args) {
  if (!state.kit_provenance || !sameProvenance(state.kit_provenance, args.kitProvenance)) {
    throw new Error('RC0708_KIT_PROVENANCE_CHANGED_BETWEEN_PHASES');
  }
}

function lifecyclePaths(productRoot) {
  const root = String(productRoot || '').replace(/[\\/]+$/, '');
  const parent = path.win32.dirname(root);
  const base = path.win32.basename(root);
  return {
    parent,
    base,
    staging: path.win32.join(parent, base + RC0708_SUFFIXES.staging),
    extract: path.win32.join(parent, base + RC0708_SUFFIXES.extract),
    rollback: path.win32.join(parent, base + RC0708_SUFFIXES.rollback),
    quarantine: path.win32.join(parent, base + RC0708_SUFFIXES.quarantine),
  };
}

function requireAbsentSiblingNames(siblings) {
  for (const name of ['staging', 'extract', 'rollback', 'quarantine']) {
    if (fs.existsSync(siblings[name])) throw new Error(`RC0708_SIBLING_ALREADY_EXISTS:${siblings[name]}`);
  }
}

function strictVerifyTree(root, label) {
  const manifestPath = path.join(root, 'release-manifest.json');
  const manifestSha256 = sha256(manifestPath);
  const manifest = readJson(manifestPath, `${label}_MANIFEST`);
  if (!manifest || !Array.isArray(manifest.files) || !manifest.files.every((item) => item && typeof item.path === 'string' && Number.isInteger(item.size) && /^[0-9a-f]{64}$/.test(item.sha256 || ''))) {
    throw new Error(`${label}_MANIFEST_SCHEMA_INVALID`);
  }
  const expected = new Map(manifest.files.map((item) => [normalizeManifestPath(item.path), item]));
  if (expected.size !== manifest.files.length) throw new Error(`${label}_MANIFEST_DUPLICATE_PATH`);
  if (expected.has('release-manifest.json')) throw new Error(`${label}_MANIFEST_SELF_LISTED`);
  const present = new Set();
  const visit = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`${label}_SYMLINK_PROHIBITED:${relative}`);
      if (entry.isDirectory()) { visit(child, relative); continue; }
      if (!entry.isFile()) throw new Error(`${label}_SPECIAL_FILE_PROHIBITED:${relative}`);
      present.add(relative);
      // The manifest never lists itself; its own integrity is the caller's
      // manifestSha256 binding, so it is the single exempt root file.
      if (relative === 'release-manifest.json') continue;
      const item = expected.get(relative);
      if (!item) throw new Error(`${label}_FILE_EXTRA:${relative}`);
      if (fs.statSync(child).size !== item.size || sha256(child) !== item.sha256) throw new Error(`${label}_FILE_HASH_MISMATCH:${relative}`);
    }
  };
  visit(path.resolve(root), '');
  for (const relative of expected.keys()) {
    if (!present.has(relative)) throw new Error(`${label}_FILE_MISSING:${relative}`);
  }
  if (!present.has('release-manifest.json')) throw new Error(`${label}_MANIFEST_MISSING`);
  return { manifest, manifestSha256, sourceCommit: manifest.source_commit, fileCount: manifest.files.length };
}

function normalizeManifestPath(value) {
  const replaced = String(value || '').replace(/\\/g, '/');
  if (replaced.length === 0 || replaced.startsWith('/') || /^[A-Za-z]:/.test(replaced) || replaced.split('/').some((part) => part.length === 0 || part === '.' || part === '..')) {
    throw new Error(`RC0708_MANIFEST_PATH_INVALID:${value}`);
  }
  return replaced;
}

function pickCorruptionVictim(manifest) {
  const candidates = manifest.files
    .filter((item) => item.path !== 'release-manifest.json' && item.size > 0)
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  if (candidates.length === 0) throw new Error('RC0708_CORRUPTION_VICTIM_MISSING');
  return candidates[0];
}

function flipMiddleByte(filePath) {
  const content = fs.readFileSync(filePath);
  const offset = Math.floor(content.length / 2);
  content[offset] ^= 0xff;
  fs.writeFileSync(filePath, content);
}

function snapshotUserData(root) {
  const files = [];
  let totalBytes = 0;
  const visit = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const child = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { visit(child, relative); continue; }
      if (!entry.isFile()) throw new Error(`RC0708_USER_DATA_SPECIAL_FILE:${relative}`);
      files.push({ path: relative, sha256: sha256(child) });
      totalBytes += fs.statSync(child).size;
      if (files.length > USER_DATA_MAX_FILES || totalBytes > USER_DATA_MAX_BYTES) throw new Error('RC0708_USER_DATA_TOO_LARGE');
    }
  };
  visit(path.resolve(root), '');
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { files, totalBytes };
}

function snapshotEqual(left, right) {
  if (!left || !right || left.files.length !== right.files.length || left.totalBytes !== right.totalBytes) return false;
  return left.files.every((item, index) => item.path === right.files[index].path && item.sha256 === right.files[index].sha256);
}

function requireFreshEvidence(evidenceRoot, scenario, kind) {
  if (fs.existsSync(evidenceRoot)) {
    const stale = [`rc07-upgrade-${scenario}.json`, `rc0708-upgrade-state-${scenario}.json`]
      .filter((name) => kind === 'upgrade' && fs.existsSync(path.join(evidenceRoot, name)));
    if (stale.length > 0) throw new Error(`RC0708_EVIDENCE_ROOT_NOT_FRESH:${stale.join(',')}`);
  } else {
    fs.mkdirSync(evidenceRoot, { recursive: true });
  }
}

function requireDirectory(value, errorCode) {
  if (!fs.existsSync(value) || !fs.statSync(value).isDirectory()) throw new Error(`${errorCode}:${value}`);
}

function processSnapshot() {
  const names = ['electron.exe', 'spike02_helper.exe'];
  const result = {};
  for (const name of names) {
    const runResult = run('tasklist.exe', ['/FI', `IMAGENAME eq ${name}`, '/FO', 'CSV', '/NH']);
    if (runResult.status !== 0) throw new Error(`RC0708_TASKLIST_FAILED:${name}`);
    result[name] = Array.from(runResult.stdout.matchAll(/^"[^"]+","(\d+)"/gm), (match) => Number(match[1])).sort((a, b) => a - b);
  }
  return result;
}

function parseArguments(argv) {
  const values = {};
  for (const item of argv) {
    const separator = item.indexOf('=');
    if (separator < 1) throw new Error(`RC0708_ARGUMENT_INVALID:${item}`);
    const key = item.slice(0, separator);
    const value = item.slice(separator + 1);
    if (!value) throw new Error(`RC0708_ARGUMENT_INVALID:${item}`);
    if (key === '--phase') values.phase = value;
    else if (key === '--scenario') values.scenario = value;
    else if (key === '--product') values.productRoot = value;
    else if (key === '--new-zip') values.newZip = value;
    else if (key === '--evidence') values.evidenceRoot = value;
    else if (key === '--user-data') values.userDataRoot = value;
    else throw new Error(`RC0708_ARGUMENT_UNKNOWN:${key}`);
  }
  for (const required of ['phase', 'scenario', 'productRoot', 'newZip', 'evidenceRoot', 'userDataRoot']) {
    if (!values[required]) throw new Error(`RC0708_REQUIRED_ARGUMENT_MISSING:${required}`);
  }
  return values;
}

function assertion(name, ok) { return { name, ok: ok === true }; }
function testCase(id, summary, assertions, evidence) { return { case_id: id, status: assertions.every((item) => item.ok) ? 'PASS' : 'FAIL', summary, assertions, evidence }; }
function run(file, args) { return spawnSync(file, args, { shell: false, windowsHide: true, encoding: 'utf8', timeout: 30_000 }); }
function readJson(filePath, label) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) { throw new Error(`${label}_INVALID:${message(error)}`); } }
function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function message(error) { return error && error.message ? error.message : String(error); }

function validateRc07Report(value, lock, scenario) {
  const required = scenario === 'success' ? ['RC07-U01', 'RC07-Z01'] : scenario === 'corrupt-staged-file' ? ['RC07-U02', 'RC07-Z01'] : ['RC07-U03', 'RC07-Z01'];
  if (!value || value.schema_version !== 1 || value.suite !== 'RC07_WINDOWS_UPGRADE_ROLLBACK' || value.scenario !== scenario || value.status !== 'PASS' || !Array.isArray(value.cases)) throw new Error('RC07_REPORT_INVALID');
  for (const id of required) {
    const matches = value.cases.filter((item) => item && item.case_id === id);
    if (matches.length !== 1 || matches[0].status !== 'PASS') throw new Error(`RC07_CASE_FAILED:${id}`);
  }
  if (value.candidate_zip_sha256 !== lock.candidate.sha256 || value.product_command_surface_changed !== false || value.external_network_used !== false || value.system_configuration_changed !== false || value.win7_validation !== 'NOT_PERFORMED' || !validProvenance(value.kit_provenance, lock, 'rc0708-upgrade.cjs')) throw new Error('RC07_GATE_INVALID');
  if (!value.gates || value.gates.win10 !== 'PARTIAL_RC0708_LIFECYCLE_ONLY' || value.gates.win7 !== 'NOT_PERFORMED' || value.gates.rc !== 'NOT_PERFORMED') throw new Error('RC07_GATE_INVALID');
  return value;
}

function validProvenance(value, lock, entrypoint) {
  return Boolean(value && value.schema_version === 1 && value.kit_id === lock.kit_id &&
    value.target_candidate_sha256 === lock.candidate.sha256 && value.manifest_files_verified === true &&
    value.entrypoint === entrypoint && /^[a-f0-9]{40}$/.test(value.source_commit || '') &&
    /^[a-f0-9]{64}$/.test(value.manifest_sha256 || '') && /^[a-f0-9]{64}$/.test(value.entrypoint_sha256 || '') &&
    value.files_sha256 && typeof value.files_sha256 === 'object' &&
    Array.isArray(value.unexpected_control_files) && value.unexpected_control_files.length === 0);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    fs.writeSync(2, `RC0708_UPGRADE_FAILED:${message(error)}\n`);
    process.exit(EXIT.FATAL);
  });
}

module.exports = {
  EXIT, RC0708_SCENARIOS, RC0708_SUFFIXES, RC0708_MARKER_FILES,
  lifecyclePaths, normalizeManifestPath, parseArguments, pickCorruptionVictim,
  snapshotEqual, strictVerifyTree, validateRc07Report,
};
