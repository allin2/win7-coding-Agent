'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runner-h3-package-')), 'package');
const sourceCommit = 'a'.repeat(40);
const result = spawnSync(process.execPath, [path.join(root, 'prepare-h3-package.mjs'), `--out=${out}`, `--source-commit=${sourceCommit}`], {
  encoding: 'utf8',
});
assert.equal(result.status, 0, result.stderr || result.stdout);

const packageManifest = readJson('H3_PACKAGE_MANIFEST.json');
assert.equal(packageManifest.source_commit, sourceCommit);
assert.equal(packageManifest.target.ip, '192.168.1.11');
assert.equal(packageManifest.helper_sha256, '7f86dac89862b2c61d55fe83ba00bf7cdaa69714d24d0f9d21b62f9040d1c134');
for (const entry of packageManifest.files) {
  const bytes = fs.readFileSync(path.join(out, entry.path.split('/').join(path.sep)));
  assert.equal(bytes.length, entry.size, entry.path);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
}

const logManifest = readJson('runner-h3-log-manifest.json');
const cancelManifest = readJson('runner-h3-cancel-manifest.json');
assert.deepEqual(logManifest.acceptance_action.args, ['-n', '10', '-w', '10', '127.0.0.1']);
assert.equal(logManifest.acceptance_action.max_stdout_bytes, 128);
assert.deepEqual(cancelManifest.acceptance_action.args, ['-t', '127.0.0.1']);
assert.equal(logManifest.profiles[0].acl_policy.apply_low_integrity_to_work_dir, false);
assert.equal(cancelManifest.profiles[0].acl_policy.apply_low_integrity_to_work_dir, false);
const logCommand = fs.readFileSync(path.join(out, 'start-h3-log.cmd'), 'utf8');
assert.match(logCommand, /runner-manifest-sha256=[a-f0-9]{64}/);
assert.match(logCommand, /C:\\Win7CodingAgent\\acceptance\\D013-RUNNER-20260811-020000\\work\\h3/);
assert.doesNotMatch(logCommand, /%~dp0work/);
assert.match(fs.readFileSync(path.join(out, 'README-H3.txt'), 'utf8'), /No terminal input/);
assert.match(fs.readFileSync(path.join(out, 'README-H3.txt'), 'utf8'), /does not mutate the work\\h3 label/);
assert(packageManifest.files.some((entry) => entry.path === 'verify-h3-package.cjs'));
assert(packageManifest.files.some((entry) => entry.path === 'verify-h3-package.cmd'));
const verify = spawnSync(process.execPath, [path.join(out, 'verify-h3-package.cjs')], { encoding: 'utf8' });
assert.equal(verify.status, 0, verify.stderr || verify.stdout);
assert.match(verify.stdout, /^H3_PACKAGE_VERIFY_PASS files=\d+\n$/);
process.stdout.write('h3-package-tests: ALL PASS\n');

function readJson(name) { return JSON.parse(fs.readFileSync(path.join(out, name), 'utf8')); }
