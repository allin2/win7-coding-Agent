'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROFILE_ID = 'E22-SQLITE343-LOCAL-SSD';
const SUITE_ID = 'SPIKE_04';
const STANDARD_CASES = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'F', 'P'];
const STANDARD_PARAMETERS = Object.freeze({
  s01_duration_ms: 60000,
  s03_scales: ['3k', '10k', '30k'],
  s05_scale: '30k',
  s05_reps: 100,
  s06_limit_mb: 512,
  s06_target_mb: 256,
});
const COMMIT_RE = /^[a-f0-9]{40}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function fail(message, code) {
  const error = new Error(message);
  error.code = code || 'COORDINATOR_ERROR';
  throw error;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function randomId(bytes) {
  return crypto.randomBytes(bytes || 18).toString('base64url');
}

function requirePattern(value, name, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail(name + ' has invalid format', 'INVALID_ARGUMENT');
  }
  return value;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const name = token.slice(2);
    if (name === 'json') {
      args.json = true;
      continue;
    }
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      fail('missing value for --' + name, 'INVALID_ARGUMENT');
    }
    args[name] = argv[++i];
  }
  return args;
}

function walkFiles(root) {
  const output = [];
  function visit(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) output.push(full);
      else fail('package contains unsupported filesystem entry: ' + full, 'PACKAGE_INVALID');
    }
  }
  visit(root);
  return output;
}

module.exports = {
  PROFILE_ID,
  SUITE_ID,
  STANDARD_CASES,
  STANDARD_PARAMETERS,
  COMMIT_RE,
  SHA256_RE,
  SAFE_ID_RE,
  ensureDir,
  fail,
  parseArgs,
  randomId,
  readJson,
  requirePattern,
  sha256Bytes,
  sha256File,
  walkFiles,
  writeJson,
};
