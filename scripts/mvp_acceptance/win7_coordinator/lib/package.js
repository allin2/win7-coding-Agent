'use strict';

const fs = require('fs');
const path = require('path');
const {
  COMMIT_RE,
  PROFILE_ID,
  SHA256_RE,
  ensureDir,
  fail,
  requirePattern,
  sha256File,
  walkFiles,
  writeJson,
} = require('./common');

function copyTree(source, destination, filter) {
  ensureDir(destination);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (filter && !filter(entry.name, source)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to, filter);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    else fail('unsupported package source entry: ' + from, 'PACKAGE_INVALID');
  }
}

function createPackage(options) {
  const sourceCommit = requirePattern(options.sourceCommit, 'source commit', COMMIT_RE);
  const runtimeSourceSha = requirePattern(options.runtimeSourceSha256, 'runtime source SHA-256', SHA256_RE);
  const output = path.resolve(options.output);
  if (fs.existsSync(output) && fs.readdirSync(output).length !== 0) {
    fail('package output must be absent or empty: ' + output, 'PACKAGE_OUTPUT_NOT_EMPTY');
  }
  ensureDir(output);
  copyTree(path.join(options.runtimeRoot, 'output', 'electron'), path.join(output, 'runtime', 'electron'));
  copyTree(path.join(options.runtimeRoot, 'output', 'runtime', 'node_modules'), path.join(output, 'runtime', 'node_modules'));
  copyTree(options.harnessRoot, path.join(output, 'harness'), (name) => !['evidence', 'work'].includes(name));
  copyTree(options.runnerRoot, path.join(output, 'runner'));
  fs.copyFileSync(options.publicKeyFile, path.join(output, 'coordinator-ed25519-public.pem'));

  const manifest = {
    schema_version: 1,
    package_id: path.basename(output),
    source_commit: sourceCommit,
    created_at_utc: new Date().toISOString(),
    delivery_mode: 'SELF_CONTAINED_OFFLINE_WIN7_PACKAGE',
    target: { os: 'Windows 7 SP1', build: '7601', arch: 'x64' },
    profile: PROFILE_ID,
    runtime: {
      electron: '22.3.27',
      node_abi: 110,
      better_sqlite3: '8.7.0',
      sqlite: '3.43.1',
      features: ['FTS5', 'WAL'],
      source_archive_sha256: runtimeSourceSha,
    },
    entrypoint: 'runner/run-a6.js',
    files: [],
  };
  const manifestPath = path.join(output, 'manifest.json');
  manifest.files = walkFiles(output)
    .filter((file) => file !== manifestPath)
    .map((file) => ({
      path: path.relative(output, file).split(path.sep).join('/'),
      bytes: fs.statSync(file).size,
      sha256: sha256File(file),
    }));
  writeJson(manifestPath, manifest);
  return { packageRoot: output, manifestPath, manifestSha256: sha256File(manifestPath), files: manifest.files.length };
}

function verifyPackage(packageRoot, expectedManifestSha256) {
  const manifestPath = path.join(packageRoot, 'manifest.json');
  if (expectedManifestSha256 && sha256File(manifestPath) !== expectedManifestSha256) {
    fail('package manifest SHA-256 mismatch', 'PACKAGE_HASH_MISMATCH');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const item of manifest.files) {
    const file = path.resolve(packageRoot, ...item.path.split('/'));
    if (!file.startsWith(path.resolve(packageRoot) + path.sep) || !fs.existsSync(file)) {
      fail('package file missing or escaped root: ' + item.path, 'PACKAGE_HASH_MISMATCH');
    }
    if (fs.statSync(file).size !== item.bytes || sha256File(file) !== item.sha256) {
      fail('package file mismatch: ' + item.path, 'PACKAGE_HASH_MISMATCH');
    }
  }
  return manifest;
}

module.exports = { createPackage, verifyPackage };
