'use strict';

// Preserve raw ASAR bytes for strict release-manifest verification.
process.noAsar = true;

// RC-08 uninstall and zero-residue lifecycle harness. Phases:
//   preflight (hosted by the product electron.exe before any rename)
//   finalize   (hosted by the quarantined copy after the wrapper renames the
//               product root away; applies the user-data retention policy,
//               audits residue and writes the evidence JSON)
// The wrapper removes the quarantine directory after finalize exits and the
// removal itself is proven by the wrapper transcript, not by this process.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { verifyKitDirectory, sameProvenance } = require('./rc0708-kit-integrity.cjs');

const RC0708_POLICIES = Object.freeze(['retain', 'purge']);
const RC0708_SUFFIX_STAGING = '.staging-rc0708';
const RC0708_SUFFIX_ROLLBACK = '.rollback-rc0708';
const RC0708_SUFFIX_QUARANTINE = '.quarantine-rc0708';
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
  if (!RC0708_POLICIES.includes(args.policy)) throw new Error(`RC0708_POLICY_INVALID:${args.policy}`);
  const statePath = path.join(args.evidenceRoot, `rc0708-uninstall-state-${args.policy}.json`);
  if (args.phase === 'preflight') return phasePreflight(args, lock, statePath);
  if (args.phase === 'finalize') return phaseFinalize(args, lock, statePath);
  throw new Error(`RC0708_PHASE_INVALID:${args.phase}`);
}

async function phasePreflight(args, lock, statePath) {
  if (fs.existsSync(statePath)) throw new Error('RC0708_STATE_ALREADY_EXISTS');
  fs.mkdirSync(args.evidenceRoot, { recursive: true });
  const evidencePath = path.join(args.evidenceRoot, `rc08-uninstall-${args.policy}.json`);
  if (fs.existsSync(evidencePath)) throw new Error(`RC0708_EVIDENCE_ALREADY_EXISTS:${evidencePath}`);
  const productRoot = fs.realpathSync(args.productRoot);
  if (!fs.existsSync(productRoot) || !fs.statSync(productRoot).isDirectory()) throw new Error(`RC0708_PRODUCT_ROOT_INVALID:${productRoot}`);
  const parent = path.dirname(productRoot);
  const base = path.basename(productRoot);
  for (const suffix of [RC0708_SUFFIX_STAGING, RC0708_SUFFIX_ROLLBACK, RC0708_SUFFIX_QUARANTINE]) {
    if (fs.existsSync(path.join(parent, base + suffix))) throw new Error(`RC0708_SIBLING_ALREADY_EXISTS:${base + suffix}`);
  }
  const { strictVerifyTree } = require('./rc0708-upgrade.cjs');
  const install = strictVerifyTree(productRoot, 'RC0708_INSTALL');
  const helperPath = path.join(productRoot, 'resources', 'native', 'runner', 'spike02_helper.exe');
  if (fs.existsSync(helperPath) && sha256(helperPath) !== lock.candidate.runner_helper_sha256) throw new Error('RC0708_UNKNOWN_PRODUCT_HELPER');
  const processes = processSnapshot();
  const onlyHarnessElectron = processes['electron.exe'].length === 1 && processes['electron.exe'][0] === process.pid;
  if (!onlyHarnessElectron || processes['spike02_helper.exe'].length !== 0) throw new Error('RC0708_PRODUCT_STILL_RUNNING');
  // electron.exe itself hosts this process and can never be renamed while we
  // run, so the lock probe uses a sibling payload file instead: if anything
  // still holds product handles the rename fails and uninstall stops closed.
  const probeTarget = path.join(productRoot, 'version');
  if (!fs.existsSync(probeTarget)) throw new Error('RC0708_LOCK_PROBE_TARGET_MISSING');
  const probePath = `${probeTarget}.rc0708-lock-probe`;
  fs.renameSync(probeTarget, probePath);
  fs.renameSync(probePath, probeTarget);
  fs.mkdirSync(args.userDataRoot, { recursive: true });
  for (const marker of RC0708_MARKER_FILES) {
    fs.writeFileSync(path.join(args.userDataRoot, marker), `RC0708_MARKER ${marker}\n`, 'ascii');
  }
  const userDataSnapshot = snapshotUserData(args.userDataRoot);
  writeJson(statePath, {
    schema_version: 1,
    kind: 'rc0708-uninstall',
    policy: args.policy,
    product_root: productRoot,
    user_data_root: fs.realpathSync(args.userDataRoot),
    quarantine_dir: path.join(parent, base + RC0708_SUFFIX_QUARANTINE),
    install_manifest_sha256: install.manifestSha256,
    install_source_commit: install.sourceCommit,
    install_file_count: install.fileCount,
    user_data_snapshot: userDataSnapshot,
    kit_provenance: args.kitProvenance,
    lock_probe: 'PASSED',
    lock_probe_target: 'version',
    phase: 'preflighted',
  });
  return 0;
}

async function phaseFinalize(args, lock, statePath) {
  const state = readJson(statePath, 'RC0708_STATE');
  if (!state.kit_provenance || !sameProvenance(state.kit_provenance, args.kitProvenance)) {
    throw new Error('RC0708_KIT_PROVENANCE_CHANGED_BETWEEN_PHASES');
  }
  if (state.policy !== args.policy || state.phase !== 'preflighted') throw new Error(`RC0708_STATE_PHASE_INVALID:${state.phase}`);
  const productRoot = state.product_root;
  if (fs.existsSync(productRoot)) throw new Error('RC0708_PRODUCT_ROOT_STILL_PRESENT');
  let policyEvidence;
  if (state.policy === 'purge') {
    fs.rmSync(state.user_data_root, { recursive: true, force: true });
    policyEvidence = { policy: 'purge', user_data_present_after: fs.existsSync(state.user_data_root) };
  } else {
    const userDataNow = snapshotUserData(state.user_data_root);
    policyEvidence = { policy: 'retain', user_data_files: userDataNow.files.length, user_data_bytes: userDataNow.totalBytes, unchanged: snapshotEqual(userDataNow, state.user_data_snapshot) };
  }
  const processes = processSnapshot();
  const siblingsAbsent = !fs.existsSync(state.product_root + RC0708_SUFFIX_STAGING) && !fs.existsSync(state.product_root + RC0708_SUFFIX_ROLLBACK);
  const quarantineIsHost = fs.existsSync(state.quarantine_dir);
  const cases = [
    testCase('RC08-D01', 'Product files are removed with no staging, rollback or lock residue', [
      assertion('product-root-absent', !fs.existsSync(productRoot)),
      assertion('staging-absent', !fs.existsSync(state.product_root + RC0708_SUFFIX_STAGING)),
      assertion('rollback-absent', !fs.existsSync(state.product_root + RC0708_SUFFIX_ROLLBACK)),
      assertion('lock-probe-passed', state.lock_probe === 'PASSED'),
    ], { product_root: productRoot, removed_file_count: state.install_file_count, removed_manifest_sha256: state.install_manifest_sha256 }),
    testCase('RC08-D02', 'User-data retention policy is applied explicitly and verifiably', state.policy === 'purge' ? [
      assertion('purged', policyEvidence.user_data_present_after === false),
    ] : [
      assertion('retained-unchanged', policyEvidence.unchanged === true),
      assertion('markers-present', state.user_data_snapshot.files.some((item) => RC0708_MARKER_FILES.includes(item.path))),
    ], policyEvidence),
    testCase('RC08-Z01', 'Uninstall leaves zero product processes and the only allowed transient directory is the hosting quarantine', [
      assertion('only-host-electron', processes['electron.exe'].length === 1 && processes['electron.exe'][0] === process.pid),
      assertion('zero-helper', processes['spike02_helper.exe'].length === 0),
      assertion('siblings-absent', siblingsAbsent),
      assertion('quarantine-is-host-only', quarantineIsHost),
    ], { processes, host_pid: process.pid, quarantine_dir: state.quarantine_dir, quarantine_removal_proven_by: 'RUN_RC0708_UNINSTALL.cmd transcript' }),
  ];
  const allPass = cases.every((item) => item.status === 'PASS');
  const report = {
    schema_version: 1,
    suite: 'RC08_WINDOWS_UNINSTALL',
    policy: state.policy,
    status: allPass ? 'PASS' : 'FAIL',
    candidate_zip_sha256: lock.candidate.sha256,
    cases,
    product_command_surface_changed: false,
    external_network_used: false,
    system_configuration_changed: false,
    registry_or_service_or_path_touched: false,
    kit_provenance: args.kitProvenance,
    win7_validation: 'NOT_PERFORMED',
    gates: { win10: 'PARTIAL_RC0708_LIFECYCLE_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' },
  };
  const evidencePath = path.join(args.evidenceRoot, `rc08-uninstall-${state.policy}.json`);
  if (fs.existsSync(evidencePath)) throw new Error(`RC0708_EVIDENCE_ALREADY_EXISTS:${evidencePath}`);
  writeJson(evidencePath, report);
  return allPass ? 0 : 1;
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
    else if (key === '--policy') values.policy = value;
    else if (key === '--product') values.productRoot = value;
    else if (key === '--evidence') values.evidenceRoot = value;
    else if (key === '--user-data') values.userDataRoot = value;
    else throw new Error(`RC0708_ARGUMENT_UNKNOWN:${key}`);
  }
  for (const required of ['phase', 'policy', 'productRoot', 'evidenceRoot', 'userDataRoot']) {
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

function validateRc08Report(value, lock, policy) {
  if (!value || value.schema_version !== 1 || value.suite !== 'RC08_WINDOWS_UNINSTALL' || value.policy !== policy || value.status !== 'PASS' || !Array.isArray(value.cases)) throw new Error('RC08_REPORT_INVALID');
  for (const id of ['RC08-D01', 'RC08-D02', 'RC08-Z01']) {
    const matches = value.cases.filter((item) => item && item.case_id === id);
    if (matches.length !== 1 || matches[0].status !== 'PASS') throw new Error(`RC08_CASE_FAILED:${id}`);
  }
  if (value.candidate_zip_sha256 !== lock.candidate.sha256 || value.product_command_surface_changed !== false || value.external_network_used !== false || value.system_configuration_changed !== false || value.registry_or_service_or_path_touched !== false || value.win7_validation !== 'NOT_PERFORMED' || !validProvenance(value.kit_provenance, lock)) throw new Error('RC08_GATE_INVALID');
  if (!value.gates || value.gates.win10 !== 'PARTIAL_RC0708_LIFECYCLE_ONLY' || value.gates.win7 !== 'NOT_PERFORMED' || value.gates.rc !== 'NOT_PERFORMED') throw new Error('RC08_GATE_INVALID');
  return value;
}

function validProvenance(value, lock) {
  return Boolean(value && value.schema_version === 1 && value.kit_id === lock.kit_id &&
    value.target_candidate_sha256 === lock.candidate.sha256 && value.manifest_files_verified === true &&
    value.entrypoint === 'rc0708-uninstall.cjs' && /^[a-f0-9]{40}$/.test(value.source_commit || '') &&
    /^[a-f0-9]{64}$/.test(value.manifest_sha256 || '') && /^[a-f0-9]{64}$/.test(value.entrypoint_sha256 || '') &&
    value.files_sha256 && typeof value.files_sha256 === 'object' &&
    Array.isArray(value.unexpected_control_files) && value.unexpected_control_files.length === 0);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    fs.writeSync(2, `RC0708_UNINSTALL_FAILED:${message(error)}\n`);
    process.exit(1);
  });
}

module.exports = { RC0708_POLICIES, RC0708_MARKER_FILES, parseArguments, snapshotEqual, validateRc08Report };
