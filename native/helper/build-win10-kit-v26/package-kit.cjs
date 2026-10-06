'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { SOURCES, INPUTS, PROFILE, walk } = require('./prepare-kit.cjs');
const HERE = __dirname;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function packageKit(output) {
  const file = path.resolve(output);
  if (!file.endsWith('.zip') || fs.existsSync(file) || fs.existsSync(file + '.sha256')) throw new Error('A9_V26_PACKAGE_REFUSES_OVERWRITE');
  const manifestBytes = fs.readFileSync(path.join(HERE, 'PACKAGE_MANIFEST.json'));
  const manifest = JSON.parse(manifestBytes);
  const expected = [...INPUTS, 'input-lock.json', ...SOURCES.map((name) => 'src/' + name)].sort();
  if (manifest.status !== 'READY_FOR_WIN10_BUILD' || !/^[a-f0-9]{40}$/.test(manifest.source_commit) ||
      JSON.stringify(manifest.files.map((e) => e.path).sort()) !== JSON.stringify(expected) ||
      JSON.stringify(walk(HERE).sort()) !== JSON.stringify([...expected, 'PACKAGE_MANIFEST.json'].sort())) throw new Error('A9_V26_PACKAGE_FILE_SET');
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(HERE, entry.path));
    if (bytes.length !== entry.size || hash(bytes) !== entry.sha256) throw new Error('A9_V26_PACKAGE_HASH:' + entry.path);
  }
  const lock = JSON.parse(fs.readFileSync(path.join(HERE, 'input-lock.json')));
  if (lock.profile !== PROFILE || lock.source_commit !== manifest.source_commit) throw new Error('A9_V26_PACKAGE_IDENTITY');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execFileSync('tar', ['-a', '-cf', file, ...expected, 'PACKAGE_MANIFEST.json'], { cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'] });
  const names = execFileSync('tar', ['-tf', file], { encoding: 'utf8' }).trim().split(/\r?\n/).sort();
  if (JSON.stringify(names) !== JSON.stringify([...expected, 'PACKAGE_MANIFEST.json'].sort())) throw new Error('A9_V26_PACKAGE_ARCHIVE_SET');
  const digest = hash(fs.readFileSync(file));
  fs.writeFileSync(file + '.sha256', digest + '  ' + path.basename(file) + '\n', { flag: 'wx' });
  return { status: 'PACKAGE_READY_NOT_APPROVED', archive: file, sha256: digest, manifest_sha256: hash(manifestBytes) };
}
if (require.main === module) {
  try { if (process.argv.length !== 4 || process.argv[2] !== '--out') throw new Error('usage: package-kit.cjs --out <new.zip>');
    process.stdout.write(JSON.stringify(packageKit(process.argv[3]), null, 2) + '\n'); }
  catch (error) { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; }
}
module.exports = { packageKit };
