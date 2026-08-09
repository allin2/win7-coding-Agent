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

const electron = path.join(packageRoot, 'runtime', 'electron', 'electron.exe');
const benchmark = path.join(packageRoot, 'harness', 'benchmark', 'benchmark.js');
const evidenceRoot = path.join(packageRoot, 'evidence');
const tempRoot = path.join(packageRoot, 'tmp');
const logsRoot = path.join(packageRoot, 'logs');
for (const dir of [evidenceRoot, tempRoot, logsRoot]) fs.mkdirSync(dir, { recursive: true });

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
