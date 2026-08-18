#!/usr/bin/env node
// Builds the single delivery ZIP handed to the Win10 operator for the
// RC-07/RC-08 lifecycle matrix. Contents: the locked new candidate ZIP (name
// preserved - the harness stage binds basename), the renamed byte copy of the
// previous candidate (upgrade source), the RC0708 lifecycle kit, a SHA-256
// manifest of the three packages, and the operation prompt. Deterministic:
// the archive bytes are a pure function of the payload and the epoch.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getZipEntry, writeDeterministicZip } from './zip-utils.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const EPOCH_SECONDS = 1786896000;
const PREVIOUS_CANDIDATE = Object.freeze({
  filename: 'Win7CodingAgent-0.1.0-rc.1-win7-x64-PREVIOUS-f24d9a4.zip',
  size: 100877883,
  sha256: '909166478a8766ed380221d7b349e4db841651516be42feba7db281e0678f1d5',
});
const LIFECYCLE_KIT = Object.freeze({
  filename: 'RC0708_WINDOWS_LIFECYCLE_KIT_20260819-v2.zip',
  size: 20952,
  sha256: '0c3be0323e07b5caa1541ad9c0daa7977440c47b625ef64b559eccadb0f155d2',
});

try {
  const args = parseArguments(process.argv.slice(2));
  const head = git(['rev-parse', 'HEAD']).trim();
  const status = git(['status', '--porcelain', '--untracked-files=all']).trim();
  if (status && !args.allowUncommitted) throw new Error('SOURCE_WORKTREE_NOT_CLEAN');
  const lockPath = path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-lifecycle-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  verifyPackage(args.candidateZip, lock.candidate, 'CANDIDATE_ZIP');
  verifyPackage(args.previousZip, PREVIOUS_CANDIDATE, 'PREVIOUS_CANDIDATE_ZIP');
  verifyPackage(args.kitZip, LIFECYCLE_KIT, 'KIT_ZIP');
  const kitManifest = getKitManifest(args.kitZip, lock.kit_id);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'a7-rc0708-delivery-'));
  const payload = path.join(temporary, 'payload');
  fs.mkdirSync(payload, { recursive: true });
  const deliverable = [
    [lock.candidate.filename, args.candidateZip],
    [PREVIOUS_CANDIDATE.filename, args.previousZip],
    [lock.output_filename, args.kitZip],
  ];
  for (const [name, source] of deliverable) fs.copyFileSync(source, path.join(payload, name));
  const manifest = {
    schema_version: 1,
    deliverable: 'A7-RC0708-WIN10-DELIVERY-20260819-V2',
    source_commit: head,
    kit_id: lock.kit_id,
    kit_manifest_sha256: kitManifest,
    packages: deliverable.map(([name]) => packageEntry(payload, name)),
  };
  writeJson(path.join(payload, 'RC0708_WIN10_DELIVERY_SHA256.txt'), manifest);
  fs.copyFileSync(path.join(repositoryRoot, 'release', 'win7-rc', 'RC0708_WIN10_OPERATION_PROMPT.txt'), path.join(payload, 'RC0708_WIN10_OPERATION_PROMPT.txt'));
  const outputRoot = path.resolve(args.output || path.join(repositoryRoot, 'release', 'win7-rc', 'out'));
  fs.mkdirSync(outputRoot, { recursive: true });
  const zipPath = path.join(outputRoot, 'RC0708_WIN10_DELIVERY_20260819-v2.zip');
  writeDeterministicZip(payload, zipPath, EPOCH_SECONDS);
  const zipHash = sha256(zipPath);
  fs.writeFileSync(`${zipPath}.sha256`, `${zipHash}  ${path.basename(zipPath)}\n`, 'ascii');
  const result = {
    schema_version: 1,
    status: 'RC0708_WIN10_DELIVERY_BUILD_PASS',
    source_commit: head,
    zip: path.basename(zipPath),
    zip_size: fs.statSync(zipPath).size,
    zip_sha256: zipHash,
    packages: deliverable.length,
    prompt: 'RC0708_WIN10_OPERATION_PROMPT.txt',
    target_candidate_sha256: lock.candidate.sha256,
    previous_candidate_sha256: PREVIOUS_CANDIDATE.sha256,
    kit_sha256: LIFECYCLE_KIT.sha256,
    kit_manifest_sha256: kitManifest,
  };
  writeJson(path.join(outputRoot, 'rc0708-win10-delivery-build-result.json'), result);
  fs.rmSync(temporary, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`RC0708_DELIVERY_BUILD_FAILED:${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function verifyPackage(zipPath, expected, label) {
  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size !== expected.size || sha256(zipPath) !== expected.sha256) {
    throw new Error(`${label}_MISMATCH`);
  }
}

function getKitManifest(kitZipPath, kitId) {
  const manifestBytes = getZipEntry(kitZipPath, 'KIT_MANIFEST.json');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.kit_id !== kitId) throw new Error('KIT_MANIFEST_KIT_ID_MISMATCH');
  return digest(manifestBytes);
}

function packageEntry(root, name) {
  const filePath = path.join(root, name);
  return { filename: name, size: fs.statSync(filePath).size, sha256: sha256(filePath) };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--allow-uncommitted') { values.allowUncommitted = true; continue; }
    const value = argv[index + 1];
    if (!key.startsWith('--') || !value || value.startsWith('--')) throw new Error(`ARGUMENT_INVALID:${key}`);
    index += 1;
    if (key === '--candidate-zip') values.candidateZip = path.resolve(value);
    else if (key === '--previous-zip') values.previousZip = path.resolve(value);
    else if (key === '--kit-zip') values.kitZip = path.resolve(value);
    else if (key === '--output') values.output = path.resolve(value);
    else throw new Error(`ARGUMENT_UNKNOWN:${key}`);
  }
  for (const required of ['candidateZip', 'previousZip', 'kitZip']) {
    if (!values[required]) throw new Error(`ARGUMENT_REQUIRED:--${required.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`);
  }
  return values;
}

function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function sha256(filePath) { return digest(fs.readFileSync(filePath)); }
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function git(args) { return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
