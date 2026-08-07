'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const excludedPrefixes = ['work/', 'output/', 'evidence/', 'result/', 'tooling/node_modules/', 'npm-cache/_logs/'];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
    if (relative === 'PACKAGE_MANIFEST.json' || excludedPrefixes.some(prefix => relative.startsWith(prefix))) continue;
    if (entry.isDirectory()) walk(absolute);
    if (entry.isFile()) {
      const data = fs.readFileSync(absolute);
      files.push({ path: relative, size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') });
    }
  }
}
walk(root);
const manifest = {
  schema_version: 1,
  package: 'WIN10_A6_SQLITE_BUILD_KIT',
  revision: '20260807-01',
  status: 'BUILD_KIT_READY_FOR_WIN10_BUILD',
  generated_at: '2026-08-07T00:00:00Z',
  delivery_type: 'offline Win10 A6 SQLite build-input kit; not a Win7 runtime package',
  expected_host: 'Windows 10 x64 + VS2019/v142 + SDK 10.0.19041.0 + CPython 3.8.10 AMD64',
  expected_return: ['WIN7_A6_SQLITE_ARTIFACTS_*.zip', 'WIN7_A6_SQLITE_ARTIFACTS_*.zip.sha256'],
  excluded: excludedPrefixes,
  files
};
fs.writeFileSync(path.join(root, 'PACKAGE_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ files: files.length }) + '\n');
