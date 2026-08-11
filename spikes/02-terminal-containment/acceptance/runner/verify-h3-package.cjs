'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const manifestName = 'H3_PACKAGE_MANIFEST.json';

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestName), 'utf8'));
  if (manifest.schema_version !== 1 || manifest.package !== 'WIN7_NATIVE_RUNNER_H3_READONLY_LOG') {
    throw new Error('unsupported H3 package manifest');
  }

  const expected = new Map();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error('invalid manifest file entry');
    }
    if (entry.path === manifestName || expected.has(entry.path)) throw new Error(`invalid manifest path: ${entry.path}`);
    expected.set(entry.path, entry);
  }

  const actual = walk(root).filter((name) => name !== manifestName);
  if (actual.length !== expected.size) throw new Error(`file count mismatch: expected ${expected.size}, got ${actual.length}`);
  for (const relative of actual) {
    const entry = expected.get(relative);
    if (!entry) throw new Error(`unexpected file: ${relative}`);
    const absolute = path.join(root, relative.split('/').join(path.sep));
    const bytes = fs.readFileSync(absolute);
    if (bytes.length !== entry.size) throw new Error(`size mismatch: ${relative}`);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== entry.sha256) throw new Error(`hash mismatch: ${relative}`);
  }

  process.stdout.write(`H3_PACKAGE_VERIFY_PASS files=${actual.length}\n`);
  process.exit(0);
} catch (error) {
  process.stderr.write(`H3_PACKAGE_VERIFY_FAIL ${error && error.message ? error.message : String(error)}\n`);
  process.exit(1);
}

function walk(base, current = base) {
  const result = [];
  const entries = fs.readdirSync(current).sort();
  for (const name of entries) {
    const absolute = path.join(current, name);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) result.push(...walk(base, absolute));
    else if (stat.isFile()) result.push(path.relative(base, absolute).split(path.sep).join('/'));
  }
  return result;
}
