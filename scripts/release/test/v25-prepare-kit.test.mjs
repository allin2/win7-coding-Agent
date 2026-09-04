import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const kitRoot = path.join(root, 'native/helper/build-win10-kit-v25');
const requiredNames = [
  'AZURE_OPENAI_KEY', 'CUSTOM_PROVIDER_KEY', 'NODE_EXTRA_CA_CERTS', 'SSLKEYLOGFILE',
  'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_PRESERVE_SYMLINKS', 'NODE_ICU_DATA', 'NODE_NO_WARNINGS',
];
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function fixture() {
  // Only this isolated TEST_ONLY repository is committed. The working checkout,
  // historical input locks and revoked kit are never modified by this test.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-v25-prepare-TEST_ONLY-'));
  const helper = path.join(dir, 'native/helper');
  const kit = path.join(helper, 'build-win10-kit-v25');
  fs.mkdirSync(helper, { recursive: true });
  for (const name of fs.readdirSync(path.join(root, 'native/helper'))) {
    if (/\.(?:cpp|h)$/.test(name) || name === 'CMakeLists.txt') {
      fs.copyFileSync(path.join(root, 'native/helper', name), path.join(helper, name));
    }
  }
  fs.cpSync(kitRoot, kit, { recursive: true,
    filter: (source) => !['work', 'output', 'evidence', 'result', 'candidate'].includes(path.basename(source)) });
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '--quiet']);
  git(['add', 'native/helper']);
  git(['-c', 'user.name=A9 TEST_ONLY Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'isolated generator fixture']);
  const commit = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(kit, 'SOURCE_COMMIT.txt'), commit + '\n', 'utf8');
  fs.writeFileSync(path.join(kit, 'SOURCE_COMMIT_TIMESTAMP.txt'), git(['show', '-s', '--format=%cI', 'HEAD']) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'TEST_ONLY.txt'), 'Not an approved build kit or Windows evidence.\n', 'utf8');
  return { dir, helper, kit, commit };
}

function runPrepare(kit) {
  return spawnSync(process.execPath, [path.join(kit, 'prepare-kit.cjs')], { cwd: kit, encoding: 'utf8' });
}

function verifyEntries(base, entries) {
  for (const entry of entries) {
    const bytes = fs.readFileSync(path.join(base, entry.path));
    assert.equal(bytes.length, entry.size, entry.path);
    assert.equal(digest(bytes), entry.sha256, entry.path);
  }
}

test('real v25 prepare-kit entry generates exact source/input/manifest closure from an isolated commit', () => {
  const f = fixture();
  const result = runPrepare(f.kit);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'KIT_REFRESHED');
  const lock = JSON.parse(fs.readFileSync(path.join(f.kit, 'input-lock.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(f.kit, 'PACKAGE_MANIFEST.json'), 'utf8'));
  assert.equal(lock.source_commit, f.commit);
  assert.equal(manifest.source_commit, f.commit);
  verifyEntries(f.kit, lock.sources);
  verifyEntries(f.kit, manifest.files);
  for (const entry of lock.sources.filter((entry) => entry.path.startsWith('src/'))) {
    const source = execFileSync('git', ['show', f.commit + ':native/helper/' + entry.path.slice(4)], { cwd: f.dir });
    assert.equal(digest(source), entry.sha256);
  }
});

test('prepare-kit accepts reordered/extended smoke names and rejects every missing required name', () => {
  const f = fixture();
  const buildPath = path.join(f.kit, 'build.ps1');
  const original = fs.readFileSync(buildPath, 'utf8');
  const withNames = (names) => original.replace(/\$blockedInheritedNames\s*=\s*@\([^)]*\)/,
    '$blockedInheritedNames = @(\n' + names.map((name) => "  '" + name + "'").join(',\n') + '\n)');
  fs.writeFileSync(buildPath, withNames([...requiredNames].reverse().concat('NODE_FUTURE_CONTROL')), 'utf8');
  assert.equal(runPrepare(f.kit).status, 0);
  const before = ['input-lock.json', 'PACKAGE_MANIFEST.json'].map((name) => fs.readFileSync(path.join(f.kit, name)));
  for (const removed of requiredNames) {
    fs.writeFileSync(buildPath, withNames(requiredNames.filter((name) => name !== removed)), 'utf8');
    const result = runPrepare(f.kit);
    assert.notEqual(result.status, 0, removed);
    assert.match(result.stderr, /inherited environment smoke must include every required/);
    for (const [index, name] of ['input-lock.json', 'PACKAGE_MANIFEST.json'].entries()) {
      assert.deepEqual(fs.readFileSync(path.join(f.kit, name)), before[index], name);
    }
  }
});

test('prepare-kit still refuses uncommitted helper source instead of forging a new input lock', () => {
  const f = fixture();
  const lockBefore = fs.readFileSync(path.join(f.kit, 'input-lock.json'));
  fs.appendFileSync(path.join(f.helper, 'helper.cpp'), '\n// TEST_ONLY uncommitted change\n', 'utf8');
  const result = runPrepare(f.kit);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /live source is not committed at SOURCE_COMMIT: helper.cpp/);
  assert.deepEqual(fs.readFileSync(path.join(f.kit, 'input-lock.json')), lockBefore);
});

test('production smoke and isolated PowerShell self-test call the same ordered-dictionary copy', () => {
  const script = fs.readFileSync(path.join(kitRoot, 'build.ps1'), 'utf8');
  assert.doesNotMatch(script, /\$v2RequestPayload\.Clone\s*\(/);
  assert.match(script, /\$v2RejectedOverlay = New-V25RejectedEnvironmentRequest \$v2RequestPayload/);
  assert.match(script, /\$items = @\(New-V25RejectedEnvironmentRequest \$original\)/);
  assert.ok(script.indexOf('if ($TestSmokeRequestOnly)') < script.indexOf('$KitRoot ='));
});

test('Windows PowerShell 5.1 executes smoke request copy without building or writing artifacts', {
  skip: process.platform !== 'win32' ? 'Windows PowerShell 5.1 unavailable; NOT_PERFORMED on this host' : false,
}, () => {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-ExecutionPolicy', 'Bypass', '-File', path.join(kitRoot, 'build.ps1'), '-TestSmokeRequestOnly'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.match(result.stdout, /D013_V25_SMOKE_REQUEST_SELFTEST_PASS WindowsPowerShell=5\.1/);
});
