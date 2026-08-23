'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fileHash(filePath) { return hash(fs.readFileSync(filePath)); }
function listFiles(root, current = root, out = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`A9_PACKAGE_SYMLINK_PROHIBITED:${absolute}`);
    if (entry.isDirectory()) listFiles(root, absolute, out);
    else if (entry.isFile()) out.push(path.relative(root, absolute).replace(/\\/g, '/'));
    else throw new Error(`A9_PACKAGE_SPECIAL_FILE_PROHIBITED:${absolute}`);
  }
  return out;
}

const candidateRoot = fs.realpathSync(path.resolve(argument('candidate-root', '.')));
const outputPath = path.resolve(argument('out', path.join(os.tmpdir(), `a9-package-integrity-${Date.now()}.json`)));
const packageZipArgument = argument('package-zip', '');
let packageZipPath = null;
let packageSha256 = null;
const cases = [];
function check(id, action) {
  try { action(); cases.push({ id, status: 'PASS' }); }
  catch (error) { cases.push({ id, status: 'FAIL', detail: String(error && error.message ? error.message : error) }); }
}

let manifest = null;
check('A9PKG-INTEGRITY-ZIP-BINDING', () => {
  if (!packageZipArgument) throw new Error('original package ZIP path is required');
  packageZipPath = fs.realpathSync(path.resolve(packageZipArgument));
  if (packageZipPath.startsWith(candidateRoot + path.sep)) throw new Error('original ZIP must remain outside the extracted candidate');
  if (!/^Win7CodingAgent-0\.3\.0-alpha\.1-win7-x64\.zip$/i.test(path.basename(packageZipPath))) throw new Error('candidate ZIP filename mismatch');
  packageSha256 = fileHash(packageZipPath);
});
check('A9PKG-INTEGRITY-MANIFEST', () => {
  manifest = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'release-manifest.json'), 'utf8'));
  if (manifest.release_id !== 'WIN7-CODING-AGENT-A9-ALPHA1' || manifest.version !== '0.3.0-alpha.1') throw new Error('identity mismatch');
  if (manifest.gates.win10 !== 'NOT_PERFORMED' || manifest.gates.win7 !== 'NOT_PERFORMED') throw new Error('unearned Windows gate');
});
check('A9PKG-INTEGRITY-FULL-TREE', () => {
  if (!manifest) throw new Error('manifest unavailable');
  const expected = new Map(manifest.files.map((item) => [item.path, item]));
  const actual = listFiles(candidateRoot).filter((item) => item !== 'release-manifest.json');
  if (actual.length !== expected.size) throw new Error(`file count ${actual.length} != ${expected.size}`);
  for (const relative of actual) {
    const item = expected.get(relative);
    const absolute = path.join(candidateRoot, ...relative.split('/'));
    if (!item || fs.statSync(absolute).size !== item.size || fileHash(absolute) !== item.sha256) throw new Error(`mismatch:${relative}`);
  }
});
check('A9PKG-INTEGRITY-NATIVE', () => {
  if (!manifest) throw new Error('manifest unavailable');
  const binding = path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const helper = path.join(candidateRoot, 'resources', 'native', 'runner', 'spike02_helper.exe');
  if (fileHash(binding) !== manifest.required_native.better_sqlite3_node) throw new Error('SQLite binding mismatch');
  if (fileHash(helper) !== manifest.required_native.runner_helper) throw new Error('runner helper mismatch');
  if (Number(process.versions.modules) !== 110 || process.versions.electron !== '22.3.27') throw new Error(`runtime ABI mismatch electron=${process.versions.electron} modules=${process.versions.modules}`);
});
check('A9PKG-INTEGRITY-NO-SYSTEM-NODE', () => {
  if (!process.versions.electron || path.basename(process.execPath).toLowerCase() !== 'electron.exe') throw new Error('must run with packaged electron.exe in Node mode');
});

const report = {
  schema_version: 1,
  record_id: `A9-07-PACKAGE-INTEGRITY-${Date.now()}`,
  recorded_at: new Date().toISOString(),
  status: cases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL',
  candidate_id: manifest && manifest.release_id,
  package_filename: packageZipPath && path.basename(packageZipPath),
  package_sha256: packageSha256,
  candidate_manifest_sha256: fileHash(path.join(candidateRoot, 'release-manifest.json')),
  runtime_profile: { platform: process.platform, arch: process.arch, os_release: os.release(), electron: process.versions.electron, node: process.versions.node, modules: Number(process.versions.modules) },
  cases,
  windows_product_journeys: 'NOT_PERFORMED_BY_THIS_INTEGRITY_CHECK',
};
if (outputPath.startsWith(candidateRoot + path.sep)) throw new Error('A9_EVIDENCE_INSIDE_CANDIDATE_PROHIBITED');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.status === 'PASS' ? 0 : 1;
