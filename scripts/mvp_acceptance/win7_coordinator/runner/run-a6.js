'use strict';

// Fixed, package-bound Win7 runner. It never accepts command text; it only
// executes the ADR-0066 standard matrix with structured argv.
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

function fail(message) {
  process.stderr.write('A6_RUNNER_FATAL: ' + message + '\n');
  process.exit(1);
}

const packageRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const manifestPath = path.join(packageRoot, 'manifest.json');
const leasePath = path.join(packageRoot, 'lease.json');
const signaturePath = path.join(packageRoot, 'lease.sig');
const publicKeyPath = path.join(packageRoot, 'coordinator-ed25519-public.pem');
for (const required of [manifestPath, leasePath, signaturePath, publicKeyPath]) {
  if (!fs.existsSync(required)) fail('missing required file: ' + required);
}
const manifestRaw = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestRaw.toString('utf8'));
const lease = JSON.parse(fs.readFileSync(leasePath, 'utf8'));
if (manifest.source_commit !== lease.source_commit) fail('manifest/lease source commit mismatch');

const crypto = require('crypto');
const manifestSha = crypto.createHash('sha256').update(manifestRaw).digest('hex');
if (manifestSha !== lease.package_manifest_sha256) fail('manifest/lease SHA-256 mismatch');

// Win7-side half of the bidirectional hash reconciliation. The Mac package
// builder computed this manifest; the target hashes every delivered file again
// before loading native code or creating evidence.
for (const item of manifest.files) {
  const file = path.resolve(packageRoot, ...item.path.split('/'));
  if (!file.startsWith(packageRoot + path.sep) || !fs.existsSync(file)) fail('manifest file missing or outside package: ' + item.path);
  if (fs.statSync(file).size !== item.bytes) fail('manifest size mismatch: ' + item.path);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (digest !== item.sha256) fail('manifest SHA-256 mismatch: ' + item.path);
}

const electron = path.join(packageRoot, 'runtime', 'electron', 'electron.exe');
const benchmark = path.join(packageRoot, 'harness', 'benchmark', 'benchmark.js');
const evidenceRoot = path.join(packageRoot, 'evidence');
const tempRoot = path.join(packageRoot, 'tmp');
const logsRoot = path.join(packageRoot, 'logs');
const workRoot = path.join(packageRoot, 'work');
for (const dir of [evidenceRoot, tempRoot, logsRoot, workRoot]) fs.mkdirSync(dir, { recursive: true });

const common = [
  benchmark,
  '--backend', 'better-sqlite3',
  '--media', 'ssd',
  '--candidate-evidence',
  '--lease', leasePath,
  '--lease-signature', signaturePath,
  '--public-key', publicKeyPath,
  '--source-commit', lease.source_commit,
  '--package-manifest-sha256', manifestSha,
];
const matrix = [
  { id: 's01', args: ['--scale', '3k', '--cases', 'S01', '--duration-ms', '60000'] },
  { id: 's03-3k', args: ['--scale', '3k', '--cases', 'S03'] },
  { id: 's03-10k', args: ['--scale', '10k', '--cases', 'S03'] },
  { id: 's03-30k', args: ['--scale', '30k', '--cases', 'S03'] },
  { id: 's05', args: ['--scale', '30k', '--cases', 'S05', '--s05-reps', '100'] },
  { id: 's06', args: ['--scale', '3k', '--cases', 'S06', '--s06-limit-mb', '512', '--s06-target-mb', '256'] },
  { id: 'remaining', args: ['--scale', '10k', '--cases', 'S02,S04,S07,S08,F,P'] },
];

const env = Object.assign({}, process.env, {
  ELECTRON_RUN_AS_NODE: '1',
  A6_BS3_ROOT: path.join(packageRoot, 'runtime', 'node_modules', 'better-sqlite3'),
  A6_BS3_NATIVE: path.join(packageRoot, 'runtime', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
  A6_SOURCE_COMMIT: lease.source_commit,
  A6_PACKAGE_MANIFEST_SHA256: manifestSha,
  TEMP: tempRoot,
  TMP: tempRoot,
});

// Exact runtime/native/database smoke precedes the performance matrix.
const smoke = {
  schema_version: 1,
  checked_at_utc: new Date().toISOString(),
  electron: process.versions.electron || null,
  node: process.versions.node,
  node_abi: Number(process.versions.modules),
  better_sqlite3: '8.7.0',
  sqlite: null,
  fts5: false,
  wal: null,
  package_files_verified: manifest.files.length,
  status: 'FAIL',
};
let smokeDb;
try {
  if (smoke.electron !== '22.3.27') fail('Electron version mismatch: ' + smoke.electron);
  if (smoke.node_abi !== 110) fail('Electron Node ABI mismatch: ' + smoke.node_abi);
  const Database = require(env.A6_BS3_ROOT);
  smokeDb = new Database(path.join(workRoot, 'runtime-smoke.db'));
  smoke.sqlite = smokeDb.prepare('select sqlite_version() as version').get().version;
  if (smoke.sqlite !== '3.43.1') fail('SQLite version mismatch: ' + smoke.sqlite);
  const options = smokeDb.pragma('compile_options').map((row) => String(row.compile_options || row));
  smoke.fts5 = options.some((value) => value === 'ENABLE_FTS5');
  if (!smoke.fts5) fail('SQLite FTS5 is not enabled');
  smoke.wal = String(smokeDb.pragma('journal_mode = WAL', { simple: true })).toLowerCase();
  if (smoke.wal !== 'wal') fail('SQLite WAL mode unavailable: ' + smoke.wal);
  smokeDb.exec('CREATE VIRTUAL TABLE smoke_fts USING fts5(content); INSERT INTO smoke_fts(content) VALUES (\'中文 FTS5 smoke\');');
  if (smokeDb.prepare("SELECT COUNT(*) AS c FROM smoke_fts WHERE smoke_fts MATCH 'FTS5'").get().c !== 1) fail('FTS5 smoke query failed');
  smoke.status = 'PASS';
} finally {
  if (smokeDb) smokeDb.close();
  fs.writeFileSync(path.join(packageRoot, 'runtime-smoke.json'), JSON.stringify(smoke, null, 2) + '\n', 'utf8');
}
const runResult = {
  schema_version: 1,
  run_id: lease.run_id,
  lease_id: lease.lease_id,
  profile: lease.scope.profile,
  started_at_utc: new Date().toISOString(),
  package_manifest_sha256: manifestSha,
  invocations: [],
};

let exitCode = 0;
try {
  for (const item of matrix) {
    const evidenceDir = path.join(evidenceRoot, item.id);
    fs.mkdirSync(evidenceDir, { recursive: true });
    const args = common.concat(item.args, ['--evidence-dir', evidenceDir]);
    const started = new Date().toISOString();
    const result = childProcess.spawnSync(electron, args, {
      cwd: packageRoot,
      env,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      shell: false,
    });
    fs.writeFileSync(path.join(logsRoot, item.id + '.stdout.log'), result.stdout || '', 'utf8');
    fs.writeFileSync(path.join(logsRoot, item.id + '.stderr.log'), result.stderr || '', 'utf8');
    const code = typeof result.status === 'number' ? result.status : 1;
    runResult.invocations.push({ id: item.id, started_at_utc: started, finished_at_utc: new Date().toISOString(), exit_code: code, signal: result.signal || null });
    if (code !== 0) {
      exitCode = code;
      break;
    }
  }
} finally {
  runResult.finished_at_utc = new Date().toISOString();
  runResult.exit_code = exitCode;
  fs.writeFileSync(path.join(packageRoot, 'runner-result.json'), JSON.stringify(runResult, null, 2) + '\n', 'utf8');
}
process.exit(exitCode);
