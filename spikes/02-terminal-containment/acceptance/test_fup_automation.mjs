'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCertutilHash, peInfo, redactArgs, validateAcceptanceId, validateProfile } from './run_fup_automation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SCRIPT = path.join(HERE, 'run_fup_automation.mjs');
const PROFILE_PATH = path.join(HERE, 'fup_safe_profile.json');

function expectThrow(fn, text) {
  assert.throws(fn, new RegExp(text));
}

function loadProfile() {
  return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
}

function runCli(mode, out) {
  return spawnSync(process.execPath, [SCRIPT, mode, '--profile', PROFILE_PATH, '--acceptance-id', 'A4-20260805-999999', '--out', out], {
    cwd: ROOT, encoding: 'utf8', shell: false, timeout: 300000,
  });
}

function runCliArgs(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT, encoding: 'utf8', shell: false, timeout: 300000,
  });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a4-fup-test-'));
try {
  const help = runCliArgs(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--dry-run/);
  assert.match(help.stdout, /--execute-win7/);
  assert.match(help.stdout, /--acceptance-id/);

  expectThrow(() => validateAcceptanceId('A4-20260805-reused'), 'acceptance ID');
  expectThrow(() => validateAcceptanceId('A4-20260805-12345'), 'acceptance ID');

  const outside = loadProfile();
  outside.artifacts.candidate.path = '../outside.exe';
  expectThrow(() => validateProfile(outside), 'unsafe path');

  const keyContent = loadProfile();
  keyContent.ssh.private_key = '-----BEGIN OPENSSH PRIVATE KEY-----';
  expectThrow(() => validateProfile(keyContent), 'private key content');

  const incomplete = loadProfile();
  incomplete.implementation_allowlist = ['spikes/03-git-adapter/**'];
  expectThrow(() => validateProfile(incomplete), 'allowlist');

  const wrongSource = loadProfile();
  wrongSource.source_worktree = ROOT;
  expectThrow(() => validateProfile(wrongSource), 'baseline');

  const badManifestHash = loadProfile();
  badManifestHash.package_manifest_sha256 = '0'.repeat(64);
  validateProfile(badManifestHash);

  assert.deepEqual(redactArgs(['-i', '/secret/key', 'host', '--help']), ['-i', '<private-key-path>', 'host', '--help']);
  assert.equal(redactArgs(['--key=-----BEGIN RSA PRIVATE KEY-----'])[0], '<private-key-content-redacted>');
  assert.equal(parseCertutilHash('SHA256 hash of file:\n733F549181228273AFD65817B6448BE1CC4BEB888F8BF2CAA294E4E1299CEECC\nCertUtil: -hashfile command completed successfully.'), '733f549181228273afd65817b6448be1cc4beb888f8bf2caa294e4e1299ceecc');
  assert.equal(parseCertutilHash('SHA256 hash:\r\n73 3f 54 91 81 22 82 73 af d6 58 17 b6 44 8b e1 cc 4b eb 88 8f 8b f2 ca a2 94 e4 e1 29 9c ee cc\r\n'), '733f549181228273afd65817b6448be1cc4beb888f8bf2caa294e4e1299ceecc');
  assert.equal(parseCertutilHash('no hash'), null);

  const pe = Buffer.alloc(128);
  pe.write('MZ', 0, 'ascii');
  pe.writeUInt32LE(0x40, 0x3c);
  pe.write('PE\0\0', 0x40, 'ascii');
  pe.writeUInt16LE(0x8664, 0x44);
  const peFile = path.join(tempRoot, 'fixture.exe');
  fs.writeFileSync(peFile, pe);
  assert.deepEqual(peInfo(peFile), { is_pe: true, machine: '0x8664', x64: true, size: 128 });
  const badFile = path.join(tempRoot, 'bad.exe');
  fs.writeFileSync(badFile, Buffer.from('not-pe'));
  assert.equal(peInfo(badFile).is_pe, false);

  const dryOut = path.join(tempRoot, 'dry-run.json');
  const dry = runCli('--dry-run', dryOut);
  assert.equal(dry.status, 0, dry.stderr);
  const dryReport = JSON.parse(fs.readFileSync(dryOut, 'utf8'));
  assert.equal(dryReport.mode, 'DRY_RUN');
  assert.equal(dryReport.result.automatic_status, 'DRY_RUN');
  assert.equal(dryReport.safety.private_key_content_read, false);
  assert.equal(dryReport.safety.taskkill_used, false);
  assert.equal(dryReport.stages.length, 8);
  assert.deepEqual(dryReport.stages.slice(0, 3).map((stage) => stage.status), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(dryReport.stages.slice(3).map((stage) => stage.status), Array(5).fill('NOT_PERFORMED'));
  assert.equal(dryReport.repository.orchestration_base_head, loadProfile().orchestration_head);
  assert.equal(dryReport.stages[0].baseline.orchestration_base_is_ancestor, true);
  assert.equal(dryReport.repository.observed_source_head, loadProfile().source_head);
  assert.equal(dryReport.stages.some((stage) => stage.commands.some((command) => command.command === 'ssh' || command.command === 'scp')), false);
  assert.equal(fs.existsSync(dryOut.replace(/\.json$/, '.html')), true);

  const duplicate = runCli('--dry-run', dryOut);
  assert.equal(duplicate.status, 2);
  assert.match(duplicate.stderr, /evidence directory already exists/);

  process.stdout.write('A4 FUP negative/protection tests: PASS\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
