'use strict';
// Formal closure is generated only from the exact committed helper sources.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../..');
const SOURCES = ['helper.cpp', 'helper.h', 'protocol.cpp', 'logic_tests.cpp', 'CMakeLists.txt',
  'stream_writer.cpp', 'stream_writer.h', 'whitelist.cpp', 'whitelist.h', 'argv_builder.cpp',
  'argv_builder.h', 'json_parser.cpp', 'json_parser.h'];
const INPUTS = ['prepare-kit.cjs', 'package-kit.cjs', 'build.ps1', 'build-profile.json',
  'README_BUILD.md', 'helper.exe.manifest', 'SOURCE_COMMIT.txt', 'SOURCE_COMMIT_TIMESTAMP.txt'];
const PROFILE = 'WIN10-VS2019-V142-SDK19041-D013-V26-STREAMING-X64';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (name) => fs.readFileSync(path.join(HERE, name));
function git(args) { return execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }); }
function walk(dir, prefix = '') {
  return fs.readdirSync(dir).sort().flatMap((name) => {
    if (['work', 'output', 'evidence', 'result', 'candidate'].includes(name) && !prefix) return [];
    const full = path.join(dir, name); const rel = prefix + name; const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error('A9_V26_KIT_SYMLINK');
    if (stat.isDirectory()) return walk(full, rel + '/');
    if (!stat.isFile()) throw new Error('A9_V26_KIT_FILE_TYPE');
    return [rel];
  });
}
function prepare() {
  const commit = read('SOURCE_COMMIT.txt').toString('utf8').trim();
  const timestamp = read('SOURCE_COMMIT_TIMESTAMP.txt').toString('utf8').trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A9_V26_SOURCE_NOT_LOCKED');
  const actualTime = git(['show', '-s', '--format=%cI', commit]).toString('utf8').trim();
  if (timestamp !== actualTime) throw new Error('A9_V26_SOURCE_TIMESTAMP_MISMATCH');
  const allowed = new Set([...INPUTS, 'input-lock.json', 'PACKAGE_MANIFEST.json', ...SOURCES.map((s) => 'src/' + s)]);
  if (walk(HERE).some((name) => !allowed.has(name))) throw new Error('A9_V26_KIT_EXTRA_FILE');
  const snapshots = new Map();
  for (const source of SOURCES) {
    const bytes = git(['show', commit + ':native/helper/' + source]);
    if (!bytes.equals(fs.readFileSync(path.join(ROOT, 'native/helper', source)))) throw new Error('A9_V26_SOURCE_UNCOMMITTED:' + source);
    snapshots.set('src/' + source, bytes);
  }
  const helper = snapshots.get('src/helper.cpp').toString('utf8');
  const writer = snapshots.get('src/stream_writer.cpp').toString('utf8');
  const profile = JSON.parse(read('build-profile.json'));
  const script = read('build.ps1').toString('utf8');
  if (!helper.includes('1.4.0-d013-v26') || !helper.includes('DrainStreaming') || !writer.includes('CancelSynchronousIo')) throw new Error('A9_V26_SOURCE_STREAMING_CONTRACT');
  if (profile.profile !== PROFILE || profile.target?.winver !== '0x0601' || profile.target.architecture !== 'x64' ||
      profile.target.crt !== 'static /MT (no VCRUNTIME140/MSVCP140/UCRTBASE dynamic dependencies)' ||
      profile.build_host.platform_toolset !== 'v142' || profile.build_host.msvc_version_family !== '14.29' ||
      profile.build_host.visual_studio_product_version !== '[16.11,16.12)' ||
      !profile.build_flags?.compile?.includes('/MT') || !profile.build_flags.compile.includes('/Brepro') ||
      !profile.build_flags.link.includes('/INCREMENTAL:NO') || profile.build_host.windows_sdk_version !== '10.0.19041.0' ||
      profile.build_flags.path_map !== '<kit-root>=C:\\a9-v26-kit' ||
      JSON.stringify([...profile.source_contract.files].sort()) !== JSON.stringify([...snapshots.keys()].sort())) throw new Error('A9_V26_BUILD_PROFILE_CONTRACT');
  for (const marker of ['stream_writer.cpp', 'Invoke-V26StreamingSmoke', 'v26-streaming.json', 'v26-tools.json', '/pathmap:$KitRoot=C:\\a9-v26-kit']) {
    if (!script.includes(marker)) throw new Error('A9_V26_BUILD_SMOKE_CONTRACT:' + marker);
  }
  if (!read('README_BUILD.md').toString('utf8').includes('--output release/win7-product-v3/a9-v26-input-lock.json')) throw new Error('A9_V26_README_OUTPUT_CONTRACT');
  for (const input of INPUTS) snapshots.set(input, read(input));
  // Complete validation before writing any generated source or lock.
  for (const [name, bytes] of snapshots) {
    if (!name.startsWith('src/')) continue;
    const dest = path.join(HERE, name); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, bytes);
  }
  const entry = ([name, bytes]) => ({ path: name, size: bytes.length, sha256: hash(bytes) });
  const lock = { schema_version: 1, profile: PROFILE, source_commit: commit, source_commit_timestamp: timestamp,
    generated_at: timestamp, sources: [...snapshots].map(entry) };
  const lockBytes = Buffer.from(JSON.stringify(lock, null, 2) + '\n');
  snapshots.set('input-lock.json', lockBytes);
  const manifest = { schema_version: 1, package: 'WIN10_D013_V26_HELPER_BUILD_KIT', revision: 'a9-30-r1',
    status: 'READY_FOR_WIN10_BUILD', source_commit: commit, source_commit_timestamp: timestamp, generated_at: timestamp,
    delivery_type: 'offline build inputs; independent approval required; not a Win7 candidate',
    excluded: ['work/', 'output/', 'evidence/', 'result/', 'candidate/'], files: [...snapshots].map(entry) };
  fs.writeFileSync(path.join(HERE, 'input-lock.json'), lockBytes);
  fs.writeFileSync(path.join(HERE, 'PACKAGE_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { status: 'KIT_REFRESHED', sources: SOURCES.length, lock_hash: hash(lockBytes), manifest_hash: hash(read('PACKAGE_MANIFEST.json')) };
}
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(prepare(), null, 2) + '\n'); }
  catch (error) { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; }
}
module.exports = { prepare, SOURCES, INPUTS, PROFILE, walk };
