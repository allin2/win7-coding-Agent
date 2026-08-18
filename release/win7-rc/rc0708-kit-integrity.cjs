'use strict';

// Runtime integrity gate for the RC-07/RC-08 lifecycle kit. Every harness
// process re-verifies the complete manifest-bound kit directory before it
// reads or mutates a product tree. This deliberately rejects local aliases,
// replacement wrappers and other unmanifested control files.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTROL_FILE = /\.(?:cjs|cmd|json)$/i;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function verifyKitDirectory(rootDirectory, entrypoint, expected) {
  const root = fs.realpathSync(rootDirectory);
  const manifestPath = path.join(root, 'KIT_MANIFEST.json');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!manifest || manifest.schema_version !== 1 || manifest.kit_id !== expected.kitId ||
      manifest.target_candidate_sha256 !== expected.candidateSha256 || !Array.isArray(manifest.files)) {
    throw new Error('RC0708_KIT_MANIFEST_INVALID');
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.source_commit || '')) {
    throw new Error('RC0708_KIT_SOURCE_COMMIT_INVALID');
  }

  const filesSha256 = {};
  const manifestNames = new Set();
  for (const item of manifest.files) {
    if (!item || !SAFE_NAME.test(item.path || '') || path.basename(item.path) !== item.path ||
        !Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f0-9]{64}$/.test(item.sha256 || '') ||
        manifestNames.has(item.path)) {
      throw new Error('RC0708_KIT_MANIFEST_ENTRY_INVALID');
    }
    manifestNames.add(item.path);
    const filePath = path.join(root, item.path);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile() ||
        fs.statSync(filePath).size !== item.size || sha256(filePath) !== item.sha256) {
      throw new Error(`RC0708_KIT_FILE_MISMATCH:${item.path}`);
    }
    filesSha256[item.path] = item.sha256;
  }

  if (!manifestNames.has(entrypoint) || sha256(path.join(root, entrypoint)) !== filesSha256[entrypoint]) {
    throw new Error(`RC0708_KIT_ENTRYPOINT_NOT_BOUND:${entrypoint}`);
  }
  const allowedControlFiles = new Set([...manifestNames, 'KIT_MANIFEST.json']);
  const unexpectedControlFiles = fs.readdirSync(root, { withFileTypes: true })
    .filter((item) => item.isFile() && CONTROL_FILE.test(item.name) && !allowedControlFiles.has(item.name))
    .map((item) => item.name)
    .sort();
  if (unexpectedControlFiles.length > 0) {
    throw new Error(`RC0708_KIT_UNMANIFESTED_CONTROL_FILE:${unexpectedControlFiles.join(',')}`);
  }

  return Object.freeze({
    schema_version: 1,
    kit_id: manifest.kit_id,
    source_commit: manifest.source_commit,
    target_candidate_sha256: manifest.target_candidate_sha256,
    manifest_sha256: digest(manifestBytes),
    manifest_files_verified: true,
    entrypoint,
    entrypoint_sha256: filesSha256[entrypoint],
    files_sha256: filesSha256,
    unexpected_control_files: unexpectedControlFiles,
  });
}

function sameProvenance(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(filePath) {
  return digest(fs.readFileSync(filePath));
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { verifyKitDirectory, sameProvenance };
