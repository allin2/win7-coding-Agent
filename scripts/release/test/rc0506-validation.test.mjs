import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseArguments, testCase, validateRc05Report, validateRc06Report, validateSummary, verifyKit } = require('../../../release/win7-rc/rc0506-windows-validation.cjs');

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

test('RC0506 cases and summary preserve partial gates', () => {
  assert.equal(testCase('X', 'ok', [{ name: 'a', ok: true }], {}).status, 'PASS');
  assert.equal(testCase('X', 'bad', [{ name: 'a', ok: false }], {}).status, 'FAIL');
  assert.equal(validateSummary({ schema_version: 1, suite: 'A7_RC05_RC06_WINDOWS_VALIDATION', status: 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED', reports: {}, gates: { win10: 'PARTIAL_RC05_RC06_WINDOWS_VALIDATION_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' } }).suite, 'A7_RC05_RC06_WINDOWS_VALIDATION');
  assert.throws(() => validateSummary({ schema_version: 1 }), /SUMMARY_INVALID/);
});

test('RC0506 report validators require every atomic case', () => {
  const rc05Cases = ['RC05-N01', 'RC05-P01', 'RC05-P02', 'RC05-N02', 'RC05-C01', 'RC05-Z01']
    .map((case_id) => ({ case_id, status: case_id === 'RC05-P01' ? 'NOT_APPLICABLE_TARGET_PROFILE_HASH' : 'PASS' }));
  const rc05 = { schema_version: 1, suite: 'RC05_WINDOWS_RUNNER', status: 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED', cases: rc05Cases, product_command_surface_changed: false, external_network_used: false, win7_validation: 'NOT_PERFORMED' };
  assert.equal(validateRc05Report(rc05).status, 'PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED');
  assert.throws(() => validateRc05Report({ ...rc05, cases: rc05Cases.slice(1) }), /CASE_COUNT_INVALID/);
  const rc06 = { schema_version: 1, suite: 'RC06_WINDOWS_STORAGE', status: 'PASS', cases: ['RC06-P01', 'RC06-P02', 'RC06-P03', 'RC06-N01', 'RC06-N02', 'RC06-N03', 'RC06-M01'].map((case_id) => ({ case_id, status: 'PASS' })), database: { wal_shm_residue: [] }, win7_validation: 'NOT_PERFORMED' };
  assert.equal(validateRc06Report(rc06).status, 'PASS');
  assert.throws(() => validateRc06Report({ ...rc06, cases: rc06.cases.map((item, index) => index ? item : { ...item, status: 'FAIL' }) }), /CASE_FAILED/);
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
