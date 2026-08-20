#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getZipEntry, writeDeterministicZip } from './zip-utils.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

try {
  const args = parseArguments(process.argv.slice(2));
  const head = git(['rev-parse', 'HEAD']).trim();
  const status = git(['status', '--porcelain', '--untracked-files=all']).trim();
  if (status && !args.allowUncommitted) throw new Error('SOURCE_WORKTREE_NOT_CLEAN');
  const lockPath = path.join(repositoryRoot, 'release', 'win7-rc', 'rc0506-validation-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  verifyCandidateZip(args.candidateZip, lock.candidate);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'a7-rc0506-kit-'));
  const payload = path.join(temporary, 'payload');
  fs.mkdirSync(payload, { recursive: true });
  const sources = [
    ['RC0506_WINDOWS_VALIDATION.cjs', path.join(repositoryRoot, 'release', 'win7-rc', 'rc0506-windows-validation.cjs')],
    ['RUN_RC0506.cmd', path.join(repositoryRoot, 'release', 'win7-rc', 'RUN_RC0506.cmd')],
    ['VALIDATION_LOCK.json', lockPath],
    ['README.txt', path.join(repositoryRoot, 'release', 'win7-rc', 'RC0506_WINDOWS_VALIDATION_README.txt')],
  ];
  for (const [name, source] of sources) fs.copyFileSync(source, path.join(payload, name));
  const manifest = {
    schema_version: 1,
    kit_id: lock.kit_id,
    source_commit: head,
    target_candidate_sha256: lock.candidate.sha256,
    files: sources.map(([name]) => fileEntry(payload, name)),
    gates: lock.gates,
  };
  writeJson(path.join(payload, 'KIT_MANIFEST.json'), manifest);
  const outputRoot = path.resolve(args.output || path.join(repositoryRoot, 'release', 'win7-rc', 'out'));
  fs.mkdirSync(outputRoot, { recursive: true });
  if (!/^RC0506_WINDOWS_VALIDATION_KIT_[A-Za-z0-9._-]+\.zip$/.test(lock.output_filename || '')) {
    throw new Error('VALIDATION_KIT_OUTPUT_FILENAME_INVALID');
  }
  const zipPath = path.join(outputRoot, lock.output_filename);
  const files = writeDeterministicZip(payload, zipPath, lock.source_date_epoch);
  const zipHash = sha256(zipPath);
  fs.writeFileSync(`${zipPath}.sha256`, `${zipHash}  ${path.basename(zipPath)}\n`, 'ascii');
  const result = {
    schema_version: 1,
    status: 'RC0506_VALIDATION_KIT_BUILD_PASS',
    source_commit: head,
    target_candidate_sha256: lock.candidate.sha256,
    zip: path.basename(zipPath),
    zip_size: fs.statSync(zipPath).size,
    zip_sha256: zipHash,
    files: files.length,
    gates: lock.gates,
  };
  writeJson(path.join(outputRoot, 'rc0506-kit-build-result.json'), result);
  fs.rmSync(temporary, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`RC0506_KIT_BUILD_FAILED:${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function verifyCandidateZip(zipPath, expected) {
  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size !== expected.size || sha256(zipPath) !== expected.sha256) {
    throw new Error('TARGET_CANDIDATE_ZIP_MISMATCH');
  }
  const root = expected.filename.replace(/\.zip$/i, '');
  const manifest = getZipEntry(zipPath, `${root}/release-manifest.json`);
  if (digest(manifest) !== expected.release_manifest_sha256) throw new Error('TARGET_RELEASE_MANIFEST_MISMATCH');
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
    else if (key === '--output') values.output = path.resolve(value);
    else throw new Error(`ARGUMENT_UNKNOWN:${key}`);
  }
  if (!values.candidateZip) throw new Error('ARGUMENT_REQUIRED:--candidate-zip');
  return values;
}

function fileEntry(root, name) { const filePath = path.join(root, name); return { path: name, size: fs.statSync(filePath).size, sha256: sha256(filePath) }; }
function writeJson(filePath, value) { fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function sha256(filePath) { return digest(fs.readFileSync(filePath)); }
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function git(args) { return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
