import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..', '..');
const harnessPath = path.join(repositoryRoot, 'release', 'win7-rc', 'rc0506-windows-validation.cjs');
const localProbePath = path.join(repositoryRoot, 'release', 'win7-rc', 'rc0506-local-probe.cjs');
const wrapperPath = path.join(repositoryRoot, 'release', 'win7-rc', 'RUN_RC0506.cmd');
const verifierPath = path.join(repositoryRoot, 'scripts', 'release', 'verify-rc0506-evidence.mjs');
const { RC05_LOCAL_PROBE_MODES, parseArguments, productWhoamiAssertions, requireFreshDirectory, testCase, validateRc05Report, validateRc06Report, validateSummary, validateSummaryShape, verifyKit } = require(harnessPath);

test('RC0506 owns ASAR mode and locks network-free local probe modes', () => {
  assert.equal(process.noAsar, true);
  assert.deepEqual(RC05_LOCAL_PROBE_MODES, {
    positive: 'positive', truncated: 'bounded', cancellation: 'wait-for-cancel',
  });
  const positive = spawnSync(process.execPath, [localProbePath, RC05_LOCAL_PROBE_MODES.positive]);
  const bounded = spawnSync(process.execPath, [localProbePath, RC05_LOCAL_PROBE_MODES.truncated]);
  assert.equal(positive.status, 0);
  assert.deepEqual(positive.stdout, Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0d, 0x0a]));
  assert.equal(bounded.status, 0);
  assert.equal(bounded.stdout.length, 400);
  const wrapper = fs.readFileSync(wrapperPath, 'utf8');
  assert.match(wrapper, /rc0506-process-exit-code\.txt/);
  assert.match(wrapper, /exit \/b %RC0506_EXIT_CODE%/);
});

test('RC0506 accepts a structurally contained nonzero restricted whoami exit', () => {
  const checks = productWhoamiAssertions({
    status: 'exited', exitCode: 1,
    stdout: { encoding: 'cp936', replacementCount: 0 },
    termination: { processTreeReaped: true, containment: 'job_object' },
  });
  assert.equal(checks.every((item) => item.ok), true);
});

test('RC0506 argument parsing requires three separate roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0506-args-'));
  const product = path.join(root, 'product');
  const evidence = path.join(root, 'evidence');
  const state = path.join(root, 'state');
  fs.mkdirSync(product);
  assert.deepEqual(parseArguments([`--package-root=${product}`, `--evidence=${evidence}`, `--user-data=${state}`]), {
    packageRoot: fs.realpathSync(product),
    evidenceRoot: path.join(fs.realpathSync(root), 'evidence'),
    userDataRoot: path.join(fs.realpathSync(root), 'state'),
  });
  assert.throws(() => parseArguments([`--package-root=${product}`, `--evidence=${product}`, `--user-data=${state}`]), /PATHS_MUST_BE_SEPARATE/);
});

test('RC0506 rejects stale evidence and user-data roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0506-fresh-'));
  const empty = path.join(root, 'empty');
  const absent = path.join(root, 'absent');
  fs.mkdirSync(empty);
  requireFreshDirectory(empty, 'NOT_EMPTY');
  requireFreshDirectory(absent, 'NOT_EMPTY');
  fs.writeFileSync(path.join(empty, 'stale.json'), '{}\n', 'utf8');
  assert.throws(() => requireFreshDirectory(empty, 'NOT_EMPTY'), /NOT_EMPTY/);
});

test('RC0506 cases and summary preserve partial gates', () => {
  assert.equal(testCase('X', 'ok', [{ name: 'a', ok: true }], {}).status, 'PASS');
  assert.equal(testCase('X', 'bad', [{ name: 'a', ok: false }], {}).status, 'FAIL');
  assert.equal(validateSummary({ schema_version: 1, suite: 'A7_RC05_RC06_WINDOWS_VALIDATION', status: 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED', reports: {}, gates: { win10: 'PARTIAL_RC05_RC06_WINDOWS_VALIDATION_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' } }).suite, 'A7_RC05_RC06_WINDOWS_VALIDATION');
  const failed = { schema_version: 1, suite: 'A7_RC05_RC06_WINDOWS_VALIDATION', status: 'FAIL', reports: {}, gates: { win10: 'PARTIAL_RC05_RC06_WINDOWS_VALIDATION_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' } };
  assert.equal(validateSummaryShape(failed).status, 'FAIL');
  assert.throws(() => validateSummary(failed), /SUMMARY_CASES_NOT_PASS/);
  assert.throws(() => validateSummary({ schema_version: 1 }), /SUMMARY_INVALID/);
});

test('RC0506 command-line fatal path writes evidence and exits nonzero', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0506-fatal-'));
  const product = path.join(root, 'product');
  const evidence = path.join(root, 'evidence');
  const state = path.join(root, 'state');
  fs.mkdirSync(product);
  const result = spawnSync(process.execPath, [harnessPath, `--package-root=${product}`, `--evidence=${evidence}`, `--user-data=${state}`], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RC0506_VALIDATION_FAILED:RC0506_WINDOWS_X64_REQUIRED/);
  const fatal = JSON.parse(fs.readFileSync(path.join(evidence, 'rc0506-windows-fatal.json'), 'utf8'));
  assert.equal(fatal.status, 'FAIL');
  assert.equal(fatal.win10, 'FAIL_CLOSED');
});

test('RC0506 report validators require every atomic case', () => {
  const rc05Cases = ['RC05-N01', 'RC05-P01', 'RC05-P02', 'RC05-N02', 'RC05-C01', 'RC05-Z01']
    .map((case_id) => ({ case_id, status: case_id === 'RC05-P01' ? 'NOT_APPLICABLE_TARGET_PROFILE_HASH' : 'PASS' }));
  const rc05 = { schema_version: 1, suite: 'RC05_WINDOWS_RUNNER', status: 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED', cases: rc05Cases, product_command_surface_changed: false, external_network_used: false, win7_validation: 'NOT_PERFORMED' };
  assert.equal(validateRc05Report(rc05).status, 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED');
  assert.throws(() => validateRc05Report({ ...rc05, cases: rc05Cases.slice(1) }), /CASE_COUNT_INVALID/);
  const rc06 = { schema_version: 1, suite: 'RC06_WINDOWS_STORAGE', status: 'PASS', cases: ['RC06-P01', 'RC06-P02', 'RC06-P03', 'RC06-N01', 'RC06-N02', 'RC06-N03', 'RC06-M01'].map((case_id) => ({ case_id, status: 'PASS' })), database: { evidence_file: 'rc06-production-state.db', size: 49152, sha256: 'a'.repeat(64), wal_shm_residue: [] }, win7_validation: 'NOT_PERFORMED' };
  assert.equal(validateRc06Report(rc06).status, 'PASS');
  assert.throws(() => validateRc06Report({ ...rc06, cases: rc06.cases.map((item, index) => index ? item : { ...item, status: 'FAIL' }) }), /CASE_FAILED/);
});

test('RC0506 independent verifier binds reports, databases and rejects fatal evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0506-return-'));
  const lock = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0506-validation-lock.json'), 'utf8'));
  const rc05Cases = ['RC05-N01', 'RC05-P01', 'RC05-P02', 'RC05-N02', 'RC05-C01', 'RC05-Z01']
    .map((case_id) => ({ case_id, status: case_id === 'RC05-P01' ? 'NOT_APPLICABLE_TARGET_PROFILE_HASH' : 'PASS' }));
  const rc05 = { schema_version: 1, suite: 'RC05_WINDOWS_RUNNER', status: 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED', candidate_sha256: lock.candidate.sha256, cases: rc05Cases, product_command_surface_changed: false, external_network_used: false, win7_validation: 'NOT_PERFORMED' };
  const productionPath = path.join(root, 'rc06-production-state.db');
  const corruptionPath = path.join(root, 'rc06-intentionally-corrupted-probe.db');
  fs.writeFileSync(productionPath, 'production-fixture', 'utf8');
  fs.writeFileSync(corruptionPath, 'corruption-fixture', 'utf8');
  const rc06Cases = ['RC06-P01', 'RC06-P02', 'RC06-P03', 'RC06-N01', 'RC06-N02', 'RC06-N03', 'RC06-M01']
    .map((case_id) => ({ case_id, status: 'PASS', ...(case_id === 'RC06-N02' ? { evidence: { probe_sha256: hash(corruptionPath) } } : {}) }));
  const rc06 = { schema_version: 1, suite: 'RC06_WINDOWS_STORAGE', status: 'PASS', candidate_sha256: lock.candidate.sha256, native_binding_sha256: lock.candidate.storage_binding_sha256, cases: rc06Cases, database: { evidence_file: path.basename(productionPath), size: fs.statSync(productionPath).size, sha256: hash(productionPath), wal_shm_residue: [] }, win7_validation: 'NOT_PERFORMED' };
  const rc05Path = path.join(root, 'rc05-runner-windows.json');
  const rc06Path = path.join(root, 'rc06-storage-windows.json');
  fs.writeFileSync(rc05Path, `${JSON.stringify(rc05)}\n`, 'utf8');
  fs.writeFileSync(rc06Path, `${JSON.stringify(rc06)}\n`, 'utf8');
  const summary = { schema_version: 1, suite: 'A7_RC05_RC06_WINDOWS_VALIDATION', status: 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED', kit: { kit_id: lock.kit_id, integrity: 'PASS' }, candidate: { release_manifest_sha256: lock.candidate.release_manifest_sha256 }, reports: { rc05: { sha256: hash(rc05Path), status: rc05.status }, rc06: { sha256: hash(rc06Path), status: rc06.status } }, gates: { win10: 'PARTIAL_RC05_RC06_WINDOWS_VALIDATION_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' } };
  fs.writeFileSync(path.join(root, 'rc0506-windows-summary.json'), `${JSON.stringify(summary)}\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'rc0506-process-exit-code.txt'), 'RC0506_EXIT_CODE=0\n', 'ascii');
  const accepted = spawnSync(process.execPath, [verifierPath, root], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).status, 'PASS');
  fs.writeFileSync(path.join(root, 'rc0506-windows-fatal.json'), '{"error":"TEST_FATAL"}\n', 'utf8');
  const rejected = spawnSync(process.execPath, [verifierPath, root], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /RC0506_FATAL_EVIDENCE_PRESENT:TEST_FATAL/);
});

test('RC0506 kit manifest rejects changed harness bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0506-kit-'));
  const files = ['RC0506_WINDOWS_VALIDATION.cjs', 'VALIDATION_LOCK.json', 'README.txt'];
  for (const name of files) fs.writeFileSync(path.join(root, name), name, 'utf8');
  const manifest = {
    schema_version: 1, kit_id: 'test', source_commit: 'a'.repeat(40),
    files: files.map((name) => ({ path: name, size: fs.statSync(path.join(root, name)).size, sha256: hash(path.join(root, name)) })),
  };
  fs.writeFileSync(path.join(root, 'KIT_MANIFEST.json'), `${JSON.stringify(manifest)}\n`, 'utf8');
  assert.equal(verifyKit(root).integrity, 'PASS');
  fs.appendFileSync(path.join(root, files[0]), 'changed', 'utf8');
  assert.throws(() => verifyKit(root), /KIT_FILE_MISMATCH/);
});

function hash(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
