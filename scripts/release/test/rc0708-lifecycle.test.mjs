import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getZipEntry, readZipEntries, writeDeterministicZip, crc32 as referenceCrc32 } from '../zip-utils.mjs';

const require = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..', '..');
const upgradePath = path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-upgrade.cjs');
const uninstallPath = path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-uninstall.cjs');
const zipModulePath = path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-zip.cjs');
const integrityModulePath = path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-kit-integrity.cjs');
const upgradeWrapperPath = path.join(repositoryRoot, 'release', 'win7-rc', 'RUN_RC0708_UPGRADE.cmd');
const uninstallWrapperPath = path.join(repositoryRoot, 'release', 'win7-rc', 'RUN_RC0708_UNINSTALL.cmd');
const verifierPath = path.join(repositoryRoot, 'scripts', 'release', 'verify-rc0708-evidence.mjs');
const kitBuilderPath = path.join(repositoryRoot, 'scripts', 'release', 'build-rc0708-lifecycle-kit.mjs');
const upgrade = require(upgradePath);
const uninstall = require(uninstallPath);
const zipModule = require(zipModulePath);
const integrityModule = require(integrityModulePath);
const lock = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-lifecycle-lock.json'), 'utf8'));

test('RC0708 zip module extracts writeDeterministicZip archives byte-identically', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0708-zip-'));
  const source = path.join(root, 'src');
  const nested = path.join(source, '中文 目录', 'nested dir');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(source, 'a.txt'), 'alpha\n', 'utf8');
  fs.writeFileSync(path.join(nested, 'b.bin'), Buffer.from([0x00, 0x01, 0xd6, 0xd0, 0xff]), null);
  const zipPath = path.join(root, 'fixture.zip');
  writeDeterministicZip(source, zipPath, 1786896000);
  const destination = path.join(root, 'out');
  zipModule.extractZip(zipPath, destination);
  assert.equal(fs.readFileSync(path.join(destination, 'a.txt'), 'utf8'), 'alpha\n');
  assert.deepEqual(fs.readFileSync(path.join(destination, '中文 目录', 'nested dir', 'b.bin')), Buffer.from([0x00, 0x01, 0xd6, 0xd0, 0xff]));
  const probe = Buffer.concat([Buffer.from('中文'), Buffer.from([0xd6, 0xd0])]);
  assert.equal(zipModule.crc32(probe), referenceCrc32(probe));
});

test('RC0708 zip module rejects tampered archives and unsafe entry names', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0708-zip-bad-'));
  const source = path.join(root, 'src');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'payload.txt'), 'deterministic payload for corruption\n', 'utf8');
  const zipPath = path.join(root, 'fixture.zip');
  writeDeterministicZip(source, zipPath, 1786896000);
  const archive = fs.readFileSync(zipPath);
  archive[archive.length / 2 | 0] ^= 0xff;
  const tampered = path.join(root, 'tampered.zip');
  fs.writeFileSync(tampered, archive);
  let rejected = false;
  try { zipModule.extractZip(tampered, path.join(root, 'out')); } catch (_error) { rejected = true; }
  assert.equal(rejected, true);
  assert.throws(() => zipModule.normalizeZipPath('../escape.txt'), /ZIP_PATH_TRAVERSAL/);
  assert.throws(() => zipModule.normalizeZipPath('C:/absolute.txt'), /ZIP_PATH_ABSOLUTE/);
});

test('RC0708 strict tree verification enforces exact manifest equality', () => {
  const root = makeInstallTree('commit-aaa');
  const verified = upgrade.strictVerifyTree(root.tree, 'TEST');
  assert.equal(verified.sourceCommit, 'commit-aaa');
  assert.equal(verified.fileCount, 3);
  flipMiddleByte(path.join(root.tree, 'version'));
  assert.throws(() => upgrade.strictVerifyTree(root.tree, 'TEST'), /FILE_HASH_MISMATCH:version/);
  fs.writeFileSync(path.join(root.tree, 'rogue.dll'), 'extra', 'utf8');
  assert.throws(() => upgrade.strictVerifyTree(root.tree, 'TEST'), /FILE_EXTRA:rogue\.dll/);
  fs.rmSync(path.join(root.tree, 'rogue.dll'));
  fs.rmSync(path.join(root.tree, 'version'));
  assert.throws(() => upgrade.strictVerifyTree(root.tree, 'TEST'), /FILE_MISSING:version/);
});

test('RC0708 lifecycle paths, sibling naming and argument parsing handle CJK and spaces', () => {
  const product = 'C:\\rc0708\\产品 目录\\product';
  const paths = upgrade.lifecyclePaths(product);
  assert.equal(paths.parent, 'C:\\rc0708\\产品 目录');
  assert.equal(paths.base, 'product');
  assert.equal(paths.staging, 'C:\\rc0708\\产品 目录\\product.staging-rc0708');
  assert.equal(paths.extract, 'C:\\rc0708\\产品 目录\\product.staging-rc0708.extract');
  assert.equal(paths.rollback, 'C:\\rc0708\\产品 目录\\product.rollback-rc0708');
  assert.equal(paths.quarantine, 'C:\\rc0708\\产品 目录\\product.quarantine-rc0708');
  const parsed = upgrade.parseArguments([
    '--phase=stage', '--scenario=success',
    `--product=${product}`, '--new-zip=C:\\zips\\new zip.zip',
    '--evidence=D:\\证据', '--user-data=D:\\用户 数据',
  ]);
  assert.equal(parsed.phase, 'stage');
  assert.equal(parsed.productRoot, product);
  assert.throws(() => upgrade.parseArguments(['--phase=stage']), /RC0708_REQUIRED_ARGUMENT_MISSING/);
  assert.throws(() => upgrade.parseArguments(['--phase']), /RC0708_ARGUMENT_INVALID/);
  assert.throws(() => upgrade.parseArguments(['phase=stage']), /RC0708_ARGUMENT_UNKNOWN/);
  assert.deepEqual(upgrade.RC0708_SCENARIOS, lock.upgrade.scenarios);
  assert.equal(upgrade.EXIT.STAGE_COMPLETE, 42);
  assert.equal(upgrade.EXIT.ROLLBACK_REQUIRED, 43);
});

test('RC0708 corruption victim selection and snapshot equality stay deterministic', () => {
  const manifest = {
    files: [
      { path: 'release-manifest.json', size: 100, sha256: 'a'.repeat(64) },
      { path: 'LICENSE', size: 50, sha256: 'b'.repeat(64) },
      { path: 'locales/de.pak', size: 2048, sha256: 'c'.repeat(64) },
      { path: 'empty.txt', size: 0, sha256: 'd'.repeat(64) },
    ],
  };
  assert.equal(upgrade.pickCorruptionVictim(manifest).path, 'LICENSE');
  const left = { totalBytes: 30, files: [{ path: 'm', sha256: '1' }, { path: 'n', sha256: '2' }] };
  assert.equal(upgrade.snapshotEqual(left, { totalBytes: 30, files: [{ path: 'm', sha256: '1' }, { path: 'n', sha256: '2' }] }), true);
  assert.equal(upgrade.snapshotEqual(left, { totalBytes: 30, files: [{ path: 'm', sha256: '9' }, { path: 'n', sha256: '2' }] }), false);
  assert.equal(upgrade.snapshotEqual(left, { totalBytes: 31, files: left.files }), false);
  assert.equal(upgrade.snapshotEqual(left, { totalBytes: 30, files: [{ path: 'n', sha256: '2' }, { path: 'm', sha256: '1' }] }), false);
});

test('RC0708 report validators bind cases, candidate and gates', () => {
  const good = (suite, id, extra, entrypoint = 'rc0708-upgrade.cjs') => ({
    schema_version: 1, suite, status: 'PASS', candidate_zip_sha256: lock.candidate.sha256,
    product_command_surface_changed: false, external_network_used: false, system_configuration_changed: false,
    win7_validation: 'NOT_PERFORMED',
    gates: { win10: 'PARTIAL_RC0708_LIFECYCLE_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' },
    kit_provenance: syntheticProvenance(entrypoint),
    cases: [{ case_id: id, status: 'PASS' }, { case_id: 'RC07-Z01', status: 'PASS' }],
    ...extra,
  });
  assert.equal(upgrade.validateRc07Report(good('RC07_WINDOWS_UPGRADE_ROLLBACK', 'RC07-U01', { scenario: 'success' }), lock, 'success').status, 'PASS');
  assert.equal(upgrade.validateRc07Report(good('RC07_WINDOWS_UPGRADE_ROLLBACK', 'RC07-U02', { scenario: 'corrupt-staged-file' }), lock, 'corrupt-staged-file').status, 'PASS');
  assert.equal(upgrade.validateRc07Report(good('RC07_WINDOWS_UPGRADE_ROLLBACK', 'RC07-U03', { scenario: 'activation-corruption' }), lock, 'activation-corruption').status, 'PASS');
  assert.throws(() => upgrade.validateRc07Report(good('RC07_WINDOWS_UPGRADE_ROLLBACK', 'RC07-U01', { scenario: 'corrupt-staged-file' }), lock, 'corrupt-staged-file'), /RC07_CASE_FAILED/);
  assert.throws(() => upgrade.validateRc07Report({ ...good('RC07_WINDOWS_UPGRADE_ROLLBACK', 'RC07-U01', { scenario: 'success' }), candidate_zip_sha256: '0'.repeat(64) }, lock, 'success'), /RC07_GATE_INVALID/);
  const rc08 = {
    schema_version: 1, suite: 'RC08_WINDOWS_UNINSTALL', policy: 'retain', status: 'PASS',
    candidate_zip_sha256: lock.candidate.sha256, product_command_surface_changed: false,
    external_network_used: false, system_configuration_changed: false, registry_or_service_or_path_touched: false,
    win7_validation: 'NOT_PERFORMED',
    gates: { win10: 'PARTIAL_RC0708_LIFECYCLE_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' },
    kit_provenance: syntheticProvenance('rc0708-uninstall.cjs'),
    cases: [{ case_id: 'RC08-D01', status: 'PASS' }, { case_id: 'RC08-D02', status: 'PASS' }, { case_id: 'RC08-Z01', status: 'PASS' }],
  };
  assert.equal(uninstall.validateRc08Report(rc08, lock, 'retain').status, 'PASS');
  assert.throws(() => uninstall.validateRc08Report(rc08, lock, 'purge'), /RC08_REPORT_INVALID/);
  assert.throws(() => uninstall.validateRc08Report({ ...rc08, cases: rc08.cases.slice(0, 2) }, lock, 'retain'), /RC08_CASE_FAILED/);
});

test('RC0708 candidate zip layout matches the scratch-rename extraction contract', (t) => {
  const zipPath = path.join(repositoryRoot, 'release', 'win7-rc', 'out', lock.candidate.filename);
  if (!fs.existsSync(zipPath)) t.skip('candidate zip not built locally');
  const entries = zipModule.readZipEntries(zipPath);
  const root = lock.candidate.filename.replace(/\.zip$/i, '');
  assert.ok(entries.length > 700, `unexpected entry count ${entries.length}`);
  for (const entry of entries) {
    assert.ok(entry.name.startsWith(`${root}/`), `entry outside zip root: ${entry.name}`);
  }
  assert.ok(entries.some((entry) => entry.name === `${root}/release-manifest.json`));
});

test('RC0708 wrappers stay ASCII, record exit codes and orchestrate renames', () => {
  for (const wrapper of [upgradeWrapperPath, uninstallWrapperPath]) {
    const content = fs.readFileSync(wrapper, 'ascii');
    assert.equal(Buffer.compare(fs.readFileSync(wrapper), Buffer.from(content, 'ascii')), 0);
    assert.match(content, /set "ELECTRON_RUN_AS_NODE=1"/);
    assert.match(content, /set "NODE_OPTIONS="/);
    assert.match(content, /exit \/b %RC0708_EXIT_CODE%/);
    assert.match(content, /cd \/d "%~dp0"/);
  }
  const upgradeWrapper = fs.readFileSync(upgradeWrapperPath, 'ascii');
  assert.doesNotMatch(upgradeWrapper, /RC0708_UPGRADE\.cjs/);
  assert.match(upgradeWrapper, /rc0708-upgrade\.cjs/);
  assert.match(upgradeWrapper, /ren "%PRODUCT_ROOT%" "%BASE%\.rollback-rc0708"/);
  assert.match(upgradeWrapper, /ren "%STAGING%" "%BASE%"/);
  assert.match(upgradeWrapper, /"--phase=verify-rollback"/);
  assert.match(upgradeWrapper, /rc0708-upgrade-exit-code-%SCENARIO%\.txt/);
  const uninstallWrapper = fs.readFileSync(uninstallWrapperPath, 'ascii');
  assert.doesNotMatch(uninstallWrapper, /RC0708_UNINSTALL\.cjs/);
  assert.match(uninstallWrapper, /rc0708-uninstall\.cjs/);
  assert.match(uninstallWrapper, /ren "%PRODUCT_ROOT%" "%BASE%\.quarantine-rc0708"/);
  assert.match(uninstallWrapper, /"%QUARANTINE%\\electron\.exe"/);
  assert.match(uninstallWrapper, /RC0708_QUARANTINE_REMOVED=1/);
  assert.match(uninstallWrapper, /rc0708-uninstall-exit-code-%POLICY%\.txt/);
});

test('RC0708 independent verifier accepts a complete matrix and rejects gaps', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0708-return-'));
  const kit = makeSyntheticKit();
  const rc07Case = { status: 'PASS' };
  const base07 = {
    schema_version: 1, suite: 'RC07_WINDOWS_UPGRADE_ROLLBACK', status: 'PASS',
    candidate_zip_sha256: lock.candidate.sha256, product_command_surface_changed: false,
    external_network_used: false, system_configuration_changed: false, win7_validation: 'NOT_PERFORMED',
    gates: { win10: 'PARTIAL_RC0708_LIFECYCLE_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' },
    kit_provenance: kit.provenance('rc0708-upgrade.cjs'),
    cases: [rc07Case, { case_id: 'RC07-Z01', status: 'PASS' }],
  };
  for (const [scenario, id] of [['success', 'RC07-U01'], ['corrupt-staged-file', 'RC07-U02'], ['activation-corruption', 'RC07-U03']]) {
    fs.writeFileSync(path.join(root, `rc07-upgrade-${scenario}.json`), `${JSON.stringify({ ...base07, scenario, cases: [{ case_id: id, status: 'PASS' }, { case_id: 'RC07-Z01', status: 'PASS' }] })}\n`, 'utf8');
    fs.writeFileSync(path.join(root, `rc0708-upgrade-exit-code-${scenario}.txt`), 'RC0708_UPGRADE_EXIT_CODE=0\n', 'ascii');
    fs.writeFileSync(path.join(root, `rc0708-upgrade-transcript-${scenario}.txt`), `RC0708_UPGRADE_SCENARIO=${scenario}\r\nRC0708_UPGRADE_BRANCH=residue\r\n`, 'ascii');
  }
  for (const policy of ['retain', 'purge']) {
    fs.writeFileSync(path.join(root, `rc08-uninstall-${policy}.json`), `${JSON.stringify({
      schema_version: 1, suite: 'RC08_WINDOWS_UNINSTALL', policy, status: 'PASS',
      candidate_zip_sha256: lock.candidate.sha256, product_command_surface_changed: false,
      external_network_used: false, system_configuration_changed: false, registry_or_service_or_path_touched: false,
      win7_validation: 'NOT_PERFORMED',
      gates: { win10: 'PARTIAL_RC0708_LIFECYCLE_ONLY', win7: 'NOT_PERFORMED', rc: 'NOT_PERFORMED' },
      kit_provenance: kit.provenance('rc0708-uninstall.cjs'),
      cases: [{ case_id: 'RC08-D01', status: 'PASS' }, { case_id: 'RC08-D02', status: 'PASS' }, { case_id: 'RC08-Z01', status: 'PASS' }],
    })}\n`, 'utf8');
    fs.writeFileSync(path.join(root, `rc0708-uninstall-exit-code-${policy}.txt`), 'RC0708_UNINSTALL_EXIT_CODE=0\n', 'ascii');
    fs.writeFileSync(path.join(root, `rc0708-uninstall-transcript-${policy}.txt`), `RC0708_UNINSTALL_POLICY=${policy}\r\nRC0708_UNINSTALL_BRANCH=cleanup_quarantine\r\nRC0708_QUARANTINE_REMOVED=1\r\n`, 'ascii');
  }
  const accepted = spawnSync(process.execPath, [verifierPath, root, '--kit', kit.zip], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).status, 'PASS');
  fs.rmSync(path.join(root, 'rc07-upgrade-success.json'));
  const rejected = spawnSync(process.execPath, [verifierPath, root, '--kit', kit.zip], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /RC0708_UPGRADE_REPORT_MISSING:success/);
});

test('RC0708 kit integrity rejects aliases and mutated manifest-bound files', () => {
  const kit = makeSyntheticKit();
  const accepted = integrityModule.verifyKitDirectory(kit.directory, 'rc0708-upgrade.cjs', {
    kitId: lock.kit_id,
    candidateSha256: lock.candidate.sha256,
  });
  assert.deepEqual(accepted, kit.provenance('rc0708-upgrade.cjs'));
  fs.writeFileSync(path.join(kit.directory, 'rc0708-upgrade-alias.cjs'), 'module.exports = {};\n', 'utf8');
  assert.throws(() => integrityModule.verifyKitDirectory(kit.directory, 'rc0708-upgrade.cjs', {
    kitId: lock.kit_id,
    candidateSha256: lock.candidate.sha256,
  }), /RC0708_KIT_UNMANIFESTED_CONTROL_FILE/);
  fs.rmSync(path.join(kit.directory, 'rc0708-upgrade-alias.cjs'));
  fs.appendFileSync(path.join(kit.directory, 'RUN_RC0708_UPGRADE.cmd'), 'rem changed\r\n', 'ascii');
  assert.throws(() => integrityModule.verifyKitDirectory(kit.directory, 'rc0708-upgrade.cjs', {
    kitId: lock.kit_id,
    candidateSha256: lock.candidate.sha256,
  }), /RC0708_KIT_FILE_MISMATCH:RUN_RC0708_UPGRADE\.cmd/);
});

test('RC0708 v2 builder binds matching module names and CRLF wrappers', (t) => {
  const candidate = path.join(repositoryRoot, 'release', 'win7-rc', 'out', lock.candidate.filename);
  if (!fs.existsSync(candidate)) t.skip('candidate zip not built locally');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0708-kit-build-'));
  const built = spawnSync(process.execPath, [kitBuilderPath, '--candidate-zip', candidate, '--output', output, '--allow-uncommitted'], {
    cwd: repositoryRoot, encoding: 'utf8',
  });
  assert.equal(built.status, 0, built.stderr);
  const zipPath = path.join(output, lock.output_filename);
  const names = readZipEntries(zipPath).map((entry) => entry.name);
  for (const required of ['rc0708-upgrade.cjs', 'rc0708-uninstall.cjs', 'rc0708-zip.cjs', 'rc0708-kit-integrity.cjs']) {
    assert.ok(names.includes(required), `missing ${required}`);
  }
  assert.ok(!names.includes('RC0708_UPGRADE.cjs'));
  const manifest = JSON.parse(getZipEntry(zipPath, 'KIT_MANIFEST.json').toString('utf8'));
  for (const item of manifest.files) {
    const bytes = getZipEntry(zipPath, item.path);
    assert.equal(bytes.length, item.size);
    assert.equal(hashBytes(bytes), item.sha256);
  }
  for (const wrapper of ['RUN_RC0708_UPGRADE.cmd', 'RUN_RC0708_UNINSTALL.cmd']) {
    const bytes = getZipEntry(zipPath, wrapper);
    assert.equal(bytes.equals(Buffer.from(bytes.toString('ascii'), 'ascii')), true);
    assertCrLfOnly(bytes);
  }
  assert.match(getZipEntry(zipPath, 'rc0708-upgrade.cjs').toString('utf8'), /process\.noAsar = true/);
  assert.match(getZipEntry(zipPath, 'rc0708-uninstall.cjs').toString('utf8'), /process\.noAsar = true/);
});

function makeInstallTree(commit) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0708-tree-'));
  const tree = path.join(root, 'install');
  fs.mkdirSync(path.join(tree, 'locales'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'electron.exe'), `fake electron ${commit}`, 'utf8');
  fs.writeFileSync(path.join(tree, 'version'), `${commit}\n`, 'utf8');
  fs.writeFileSync(path.join(tree, 'locales', 'de.pak'), 'x'.repeat(64), 'utf8');
  const files = ['electron.exe', 'version', 'locales/de.pak'].map((relative) => {
    const filePath = path.join(tree, ...relative.split('/'));
    return { path: relative, size: fs.statSync(filePath).size, sha256: hash(filePath) };
  });
  fs.writeFileSync(path.join(tree, 'release-manifest.json'), `${JSON.stringify({ schema_version: 1, source_commit: commit, files })}\n`, 'utf8');
  return { tree, commit };
}

function flipMiddleByte(filePath) {
  const content = fs.readFileSync(filePath);
  content[Math.floor(content.length / 2)] ^= 0xff;
  fs.writeFileSync(filePath, content);
}

function hash(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function hashBytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function syntheticProvenance(entrypoint) {
  const files = {
    'rc0708-upgrade.cjs': '1'.repeat(64),
    'rc0708-uninstall.cjs': '2'.repeat(64),
  };
  return {
    schema_version: 1,
    kit_id: lock.kit_id,
    source_commit: 'a'.repeat(40),
    target_candidate_sha256: lock.candidate.sha256,
    manifest_sha256: 'b'.repeat(64),
    manifest_files_verified: true,
    entrypoint,
    entrypoint_sha256: files[entrypoint],
    files_sha256: files,
    unexpected_control_files: [],
  };
}

function makeSyntheticKit() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc0708-kit-fixture-'));
  const directory = path.join(root, 'kit');
  fs.mkdirSync(directory);
  const contents = {
    'rc0708-upgrade.cjs': "'use strict';\n",
    'rc0708-uninstall.cjs': "'use strict';\n",
    'RUN_RC0708_UPGRADE.cmd': '@echo off\r\n',
    'RUN_RC0708_UNINSTALL.cmd': '@echo off\r\n',
    'LIFECYCLE_LOCK.json': '{}\n',
  };
  for (const [name, content] of Object.entries(contents)) fs.writeFileSync(path.join(directory, name), content, name.endsWith('.cmd') ? 'ascii' : 'utf8');
  const files = Object.keys(contents).sort().map((name) => ({
    path: name,
    size: fs.statSync(path.join(directory, name)).size,
    sha256: hash(path.join(directory, name)),
  }));
  const manifest = {
    schema_version: 1,
    kit_id: lock.kit_id,
    source_commit: 'a'.repeat(40),
    target_candidate_sha256: lock.candidate.sha256,
    files,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(directory, 'KIT_MANIFEST.json'), manifestBytes);
  const zip = path.join(root, 'kit.zip');
  writeDeterministicZip(directory, zip, 1786896000);
  const filesSha256 = Object.fromEntries(files.map((item) => [item.path, item.sha256]));
  return {
    directory,
    zip,
    provenance(entrypoint) {
      return {
        schema_version: 1,
        kit_id: manifest.kit_id,
        source_commit: manifest.source_commit,
        target_candidate_sha256: manifest.target_candidate_sha256,
        manifest_sha256: hashBytes(manifestBytes),
        manifest_files_verified: true,
        entrypoint,
        entrypoint_sha256: filesSha256[entrypoint],
        files_sha256: filesSha256,
        unexpected_control_files: [],
      };
    },
  };
}

function assertCrLfOnly(bytes) {
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x0a) assert.equal(bytes[index - 1], 0x0d, `bare LF at ${index}`);
    if (bytes[index] === 0x0d) assert.equal(bytes[index + 1], 0x0a, `bare CR at ${index}`);
  }
}
