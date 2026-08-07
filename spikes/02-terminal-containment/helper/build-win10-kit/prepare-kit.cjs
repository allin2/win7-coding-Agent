/**
 * prepare-kit.cjs — regenerate the D-013 Win10 build kit closure.
 *
 *   node prepare-kit.cjs
 *
 * Copies the live helper sources into src/, then rewrites input-lock.json
 * (source snapshot + kit files) and PACKAGE_MANIFEST.json (every shipped kit
 * file) with exact SHA-256 + sizes. Run it after any helper change so the
 * offline Win10 build host verifies exactly what the repository contains.
 *
 * Generated dirs (work/, output/, evidence/, result/, candidate/) are never
 * part of the manifest.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HERE = __dirname;
const HELPER_ROOT = path.resolve(HERE, '..');

const SOURCES = [
  'helper.cpp', 'helper.h',
  'json_parser.cpp', 'json_parser.h',
  'argv_builder.cpp', 'argv_builder.h',
  'whitelist.cpp', 'whitelist.h',
  'protocol.cpp', 'CMakeLists.txt',
];

const EXCLUDED_DIRS = new Set(['work', 'output', 'evidence', 'result', 'candidate']);

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(dir, base) {
  const entries = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const relative = path.relative(base, full).split(path.sep).join('/');
    if (fs.statSync(full).isDirectory()) {
      if (EXCLUDED_DIRS.has(name)) continue;
      entries.push(...walk(full, base));
    } else {
      entries.push(relative);
    }
  }
  return entries;
}

// 1. Snapshot the live sources.
fs.mkdirSync(path.join(HERE, 'src'), { recursive: true });
for (const source of SOURCES) {
  const from = path.join(HELPER_ROOT, source);
  if (!fs.existsSync(from)) throw new Error(`source not found: ${source}`);
  fs.copyFileSync(from, path.join(HERE, 'src', source));
}

// 2. input-lock.json: source snapshot + kit scripts.
const lockEntries = SOURCES.map((source) => {
  const file = path.join(HERE, 'src', source);
  return { path: `src/${source}`, size: fs.statSync(file).size, sha256: sha256File(file) };
});
for (const kitFile of ['build.ps1', 'build-profile.json', 'helper.exe.manifest']) {
  const file = path.join(HERE, kitFile);
  lockEntries.push({ path: kitFile, size: fs.statSync(file).size, sha256: sha256File(file) });
}
const lock = {
  schema_version: 1,
  profile: 'WIN10-VS2019-V142-SDK19041-D013-HELPER-X64',
  generated_at: new Date().toISOString(),
  sources: lockEntries,
};
fs.writeFileSync(path.join(HERE, 'input-lock.json'), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');

// 3. PACKAGE_MANIFEST.json: every shipped kit file.
const files = walk(HERE, HERE)
  .filter((relative) => relative !== 'input-lock.json' && relative !== 'PACKAGE_MANIFEST.json' && relative !== 'prepare-kit.cjs')
  .map((relative) => {
    const file = path.join(HERE, relative);
    return { path: relative, size: fs.statSync(file).size, sha256: sha256File(file) };
  });
files.push({ path: 'input-lock.json', size: fs.statSync(path.join(HERE, 'input-lock.json')).size, sha256: sha256File(path.join(HERE, 'input-lock.json')) });
const manifest = {
  schema_version: 1,
  package: 'WIN10_D013_HELPER_BUILD_KIT',
  revision: new Date().toISOString().slice(0, 10),
  status: 'READY_FOR_WIN10_BUILD',
  generated_at: new Date().toISOString(),
  delivery_type: 'offline Win10 build-input kit; not a Win7 runtime package',
  expected_host: 'Windows 10 x64 + VS2019/v142 + SDK 10.0.19041.0',
  excluded: ['work/', 'output/', 'evidence/', 'result/', 'candidate/'],
  files,
};
fs.writeFileSync(path.join(HERE, 'PACKAGE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

process.stdout.write(JSON.stringify({
  status: 'KIT_REFRESHED',
  sources: SOURCES.length,
  manifest_files: files.length,
  lock_hash: sha256File(path.join(HERE, 'input-lock.json')),
  manifest_hash: sha256File(path.join(HERE, 'PACKAGE_MANIFEST.json')),
}, null, 2) + '\n');
