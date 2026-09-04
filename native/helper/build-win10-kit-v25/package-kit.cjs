/**
 * Verify PACKAGE_MANIFEST.json and create an exact Win10 handoff ZIP.
 *
 *   node package-kit.cjs --out result/WIN7_D013_V25_HELPER_BUILDKIT_...zip
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HERE = __dirname;

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function parseOut(argv) {
  if (argv.length !== 2 || argv[0] !== '--out') {
    throw new Error('usage: node package-kit.cjs --out <new.zip>');
  }
  const output = path.resolve(HERE, argv[1]);
  if (!output.toLowerCase().endsWith('.zip')) throw new Error('output must end in .zip');
  if (fs.existsSync(output) || fs.existsSync(`${output}.sha256`)) {
    throw new Error('refusing to overwrite an existing package or checksum');
  }
  return output;
}

const output = parseOut(process.argv.slice(2));
const manifestPath = path.join(HERE, 'PACKAGE_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.status !== 'READY_FOR_WIN10_BUILD' || !Array.isArray(manifest.files)) {
  throw new Error('package manifest is not READY_FOR_WIN10_BUILD');
}

for (const entry of manifest.files) {
  const file = path.join(HERE, entry.path);
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size !== entry.size || sha256File(file) !== entry.sha256) {
    throw new Error(`manifest mismatch: ${entry.path}`);
  }
}

const shipped = manifest.files.map((entry) => entry.path).concat('PACKAGE_MANIFEST.json').sort();
fs.mkdirSync(path.dirname(output), { recursive: true });
const packed = spawnSync('tar', ['-a', '-cf', output, ...shipped], {
  cwd: HERE, shell: false, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
if (packed.status !== 0) {
  throw new Error(`tar packaging failed: ${packed.stderr || packed.stdout}`);
}
const listed = spawnSync('tar', ['-tf', output], {
  cwd: HERE, shell: false, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
if (listed.status !== 0) throw new Error(`tar listing failed: ${listed.stderr || listed.stdout}`);
const actual = listed.stdout.split(/\r?\n/).filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(shipped)) {
  throw new Error('archive entry set does not match PACKAGE_MANIFEST + manifest');
}

const digest = sha256File(output);
fs.writeFileSync(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  status: 'PACKAGE_READY',
  archive: output,
  sha256: digest,
  entries: actual.length,
  manifest_sha256: sha256File(manifestPath),
}, null, 2)}\n`);
