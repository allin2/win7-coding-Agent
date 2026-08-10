/**
 * A5 - 终端验收编排入口
 *
 * 用法：
 *   node a5-run.js --mode dev --acceptance-id A5-YYYYMMDD-unique [--out dir] [--dry-run]
 *   node a5-run.js --mode manifest --acceptance-id A5-YYYYMMDD-unique [--zip path] [--out dir]
 *   node a5-run.js --mode win7 --acceptance-id A5-YYYYMMDD-unique --lease lease.json
 *
 * 约束：
 *   - `--mode win7` 必须验证协调器 Ed25519 签名租约，否则拒绝连接 Win7；
 *   - 原始 D-011 ZIP 只读；候选包由 ZIP 子树装配，不改动 ZIP；
 *   - dev 结果只记 DEVELOPMENT_PASS / PASS(DEV) / NOT_PERFORMED，不宣称 Win7 PASS；
 *   - 禁止 taskkill/shutdown/reboot/路由/防火墙等操作。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const HERE = __dirname;
const SPIKE_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_ZIP = '/Users/qlyf/Developer/win7-coding-Agent/WIN7_NATIVE_ARTIFACTS_20260806-160514.zip';

const WIN7 = {
  address: '192.168.1.11',
  user: 'dccs-chaizl',
  acceptanceRoot: 'C:\\Win7CodingAgent\\acceptance',
  privateKey: '/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/id_rsa_win7accept',
  knownHosts: '/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/known_hosts_win7',
  remotePython: 'C:\\acceptance\\python38_mvp\\python.exe',
  electron: process.env.WIN7_ELECTRON || 'C:\\acceptance\\electron\\electron.exe',
};

const FORBIDDEN = ['taskkill', 'shutdown', 'restart', 'reboot', 'netsh', 'route', 'firewall'];

/**
 * 任何发给 Win7 的远程命令都不得包含禁止操作（N06 / A4 forbidden_operations）。
 */
function assertNoForbidden(remoteCommand) {
  const hit = FORBIDDEN.find((token) => new RegExp(`\\b${token}\\b`, 'i').test(remoteCommand));
  if (hit) {
    throw new Error(`远程命令包含禁止操作: ${hit}`);
  }
  return remoteCommand;
}

function usage() {
  return `usage: node a5-run.js --mode dev|manifest|win7 --acceptance-id A5-YYYYMMDD-unique [options]
  --out <dir>         evidence 输出目录（默认 acceptance/a5/evidence/<id>）
  --zip <path>        D-011 原始 ZIP（默认已知路径）
  --helper <path>     D-013 helper 路径（T05；默认缺席）
  --dry-run           只打印计划，不执行
  --lease <path>      协调器签名的 canonical lease JSON
  --lease-signature <path> detached Ed25519 signature
  --coordinator-public-key <path> 协调器公钥
  --electron <path>   win7 上 Electron 可执行文件路径`;
}

function parseArgs(argv) {
  const args = { mode: 'dev', out: null, zip: DEFAULT_ZIP, helper: '', dryRun: false, lease: null, leaseSignature: null, coordinatorPublicKey: null, acceptanceId: null, electron: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--mode') args.mode = argv[++i];
    else if (a === '--acceptance-id') args.acceptanceId = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--zip') args.zip = argv[++i];
    else if (a === '--helper') args.helper = argv[++i];
    else if (a === '--electron') args.electron = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--lease') args.lease = path.resolve(argv[++i]);
    else if (a === '--lease-signature') args.leaseSignature = path.resolve(argv[++i]);
    else if (a === '--coordinator-public-key') args.coordinatorPublicKey = path.resolve(argv[++i]);
    else if (a === '--help') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.acceptanceId || !/^A5-[0-9]{8}-[0-9]{6,}$/.test(args.acceptanceId)) {
    throw new Error('acceptance-id 必须匹配 A5-YYYYMMDD-unique');
  }
  if (!['dev', 'manifest', 'win7'].includes(args.mode)) {
    throw new Error(`unknown mode: ${args.mode}`);
  }
  args.out = args.out || path.join(HERE, 'evidence', args.acceptanceId);
  if (args.electron) WIN7.electron = args.electron;
  return args;
}

function sha256File(file) {
  return require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifyPreparedCandidate(candidateDir, manifest) {
  const files = [];
  for (const item of manifest.candidate_runtime?.files || []) {
    files.push({ expected: item.sha256, file: path.join(candidateDir, 'node_modules', 'node-pty', item.path) });
  }
  for (const item of manifest.candidate_harness?.files || []) {
    files.push({ expected: item.sha256, file: path.join(candidateDir, item.path) });
  }
  if (manifest.containment_helper) {
    files.push({ expected: manifest.containment_helper.sha256, file: path.join(candidateDir, manifest.containment_helper.path) });
  }
  if (files.length === 0) throw new Error('PREPARED_CANDIDATE_MANIFEST_EMPTY');
  for (const item of files) {
    if (!fs.existsSync(item.file) || sha256File(item.file) !== item.expected) {
      throw new Error(`PREPARED_CANDIDATE_HASH_MISMATCH: ${item.file}`);
    }
  }
}

function sshArgs(remoteCommand) {
  return [
    '-i', WIN7.privateKey,
    '-o', 'IdentitiesOnly=yes',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${WIN7.knownHosts}`,
    `${WIN7.user}@${WIN7.address}`,
    remoteCommand,
  ];
}

function runChecked(command, argv, options = {}) {
  const result = spawnSync(command, argv, {
    shell: false,
    encoding: 'utf8',
    timeout: options.timeout || 120000,
    maxBuffer: 32 * 1024 * 1024,
    cwd: options.cwd,
  });
  if (result.status !== 0) {
    const error = new Error(`${command} failed (${String(result.status)}): ${result.stderr || result.error || ''}`);
    error.result = result;
    throw error;
  }
  return result;
}

function strictSsh(remoteArgv, timeout = 120000) {
  const argv = [
    '-i', WIN7.privateKey,
    '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${WIN7.knownHosts}`,
    `${WIN7.user}@${WIN7.address}`,
    ...remoteArgv,
  ];
  return runChecked('ssh', argv, { timeout });
}

function strictScp(local, remote, recursive = false) {
  const argv = [
    ...(recursive ? ['-r'] : []),
    '-i', WIN7.privateKey,
    '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${WIN7.knownHosts}`,
    local, `${WIN7.user}@${WIN7.address}:${remote}`,
  ];
  return runChecked('scp', argv, { timeout: 180000 });
}

function strictDownload(remote, local) {
  const argv = [
    '-i', WIN7.privateKey,
    '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${WIN7.knownHosts}`,
    `${WIN7.user}@${WIN7.address}:${remote}`, local,
  ];
  return runChecked('scp', argv, { timeout: 180000 });
}

function parseCertutilHash(output) {
  for (const line of String(output || '').split(/\r?\n/)) {
    const compact = line.replace(/\s/g, '');
    if (/^[0-9a-fA-F]{64}$/.test(compact)) return compact.toLowerCase();
  }
  throw new Error('REMOTE_HASH_INVALID');
}

function remoteHash(remotePath) {
  return parseCertutilHash(strictSsh(['certutil.exe', '-hashfile', remotePath, 'SHA256']).stdout);
}

function waitForRemoteFile(remotePath, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = spawnSync('ssh', sshArgs(`cmd.exe /d /s /c if exist "${remotePath}" (exit /b 0) else (exit /b 3)`), {
      shell: false, encoding: 'utf8', timeout: 30000,
    });
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error(`REMOTE_RESULT_TIMEOUT: ${remotePath}`);
}

async function runDev(args) {
  const { runSuite, InProcessDriver } = require('./a5-terminal-harness');
  const driver = new InProcessDriver();
  const result = await runSuite({ driver, sourceRoot: SPIKE_ROOT, helperPath: args.helper });
  fs.mkdirSync(args.out, { recursive: true });

  const summary = {
    schema_version: 1,
    acceptance_id: args.acceptanceId,
    mode: 'dev',
    generated_at: new Date().toISOString(),
    evidence_class: 'DEVELOPMENT_PASS_NOT_WIN7_EVIDENCE',
    cases: result.cases,
    counts: result.counts,
    formal: result.formal,
    win7_validation: 'NOT_PERFORMED_PENDING_LEASE',
    note: '开发机确定性结果，不构成 Win7 实机证据；T01-T04 保真与 Win7 端到端待授权 lease。',
  };
  const outFile = path.join(args.out, `a5-${args.acceptanceId}-dev.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const txt = result.cases
    .map((c) => `[${c.status}] ${c.id} ${c.title} — ${c.detail}`)
    .join('\n');
  fs.writeFileSync(path.join(args.out, `a5-${args.acceptanceId}-dev.txt`), `${txt}\n`, 'utf8');
  return { status: 'DEVELOPMENT_PASS_NOT_WIN7_EVIDENCE', outFile, counts: result.counts };
}

function runManifest(args) {
  const { generateManifest } = require('./a5-manifest');
  fs.mkdirSync(args.out, { recursive: true });
  const { manifest, outFile } = generateManifest({
    zipPath: args.zip,
    spikeRoot: SPIKE_ROOT,
    outDir: args.out,
    revision: args.acceptanceId,
  });
  return { status: 'MANIFEST_GENERATED', outFile, source_zip_match: manifest.source_zip.match, native_lock: manifest.native_lock };
}

function assembleCandidate(zipPath, candidateDir) {
  const { generateManifest, extractNodePty } = require('./a5-manifest');
  fs.mkdirSync(path.join(candidateDir, 'node_modules'), { recursive: true });

  // 1. 从 ZIP 解出 node-pty 运行时子树 → node_modules/node-pty
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-candidate-'));
  const { root } = extractNodePty(zipPath, tmp);
  const destRoot = path.join(candidateDir, 'node_modules', 'node-pty');
  fs.mkdirSync(destRoot, { recursive: true });
  copyTree(root, destRoot);

  // 2. 复制 winpty 模块与 A5 harness
  copyFiles([
    'winpty/filter.js', 'winpty/winpty_host.js', 'winpty/terminal_session.js',
    'acceptance/a5/a5-mock-pty.js',
    'acceptance/a5/a5-d013-client.js',
    'acceptance/a5/a5-terminal-host.js',
    'acceptance/a5/a5-terminal-harness.js',
    'acceptance/a5/a5-host-driver.js',
    'acceptance/a5/a5-electron-main.js',
    'acceptance/a5/a5-manifest.js',
    'acceptance/a5/a5-run.js',
    'acceptance/a5/a5_wmi.cmd',
  ], candidateDir);

  const helperSource = path.join(SPIKE_ROOT, 'helper', 'build-win10-kit', 'candidate', 'spike02_helper.exe');
  fs.copyFileSync(helperSource, path.join(candidateDir, 'spike02_helper.exe'));

  // 3. 校验原生哈希并写内部 manifest
  const { manifest, outFile } = generateManifest({
    zipPath,
    spikeRoot: SPIKE_ROOT,
    outDir: candidateDir,
    revision: path.basename(candidateDir),
  });
  return { candidateDir, manifest, outFile };
}

function copyTree(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function copyFiles(rels, dest) {
  for (const rel of rels) {
    const src = path.join(SPIKE_ROOT, rel);
    const d = path.join(dest, rel);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(src, d);
  }
}

async function runWin7(args) {
  // Dry-run prepares and freezes the candidate manifest before a lease is
  // granted. Execute mode must reuse those exact bytes; regenerating the
  // timestamped manifest after signing would invalidate the binding.
  const candidateDir = path.join(HERE, 'package-a5', args.acceptanceId);
  const manifestPath = path.join(candidateDir, `a5-${args.acceptanceId}-manifest.json`);
  let prepared;
  if (args.dryRun) {
    if (fs.existsSync(candidateDir)) throw new Error('PREPARED_CANDIDATE_ALREADY_EXISTS: use a new acceptance id');
    prepared = assembleCandidate(args.zip, candidateDir);
  } else {
    if (!fs.existsSync(manifestPath)) {
      return { status: 'CANDIDATE_PREPARATION_REQUIRED', detail: '先以相同 acceptance-id 执行 --dry-run，冻结 manifest 后再签发租约。' };
    }
    prepared = { candidateDir, manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')), outFile: manifestPath };
  }
  const { candidateDir: dir, manifest, outFile } = prepared;
  verifyPreparedCandidate(dir, manifest);
  const manifestSha256 = sha256File(outFile);
  const repoRoot = path.resolve(SPIKE_ROOT, '..', '..');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, shell: false, encoding: 'utf8' });
  if (head.status !== 0 || !/^[0-9a-f]{40}$/.test((head.stdout || '').trim())) {
    throw new Error('无法绑定当前 source commit');
  }

  if (args.dryRun) {
    return { status: 'DRY_RUN_PLAN', candidateDir: dir, source_commit: head.stdout.trim(), package_manifest_sha256: manifestSha256, source_zip_match: manifest.source_zip.match, native_lock: manifest.native_lock };
  }
  if (!args.lease || !args.leaseSignature || !args.coordinatorPublicKey) {
    return { status: 'SIGNED_WIN7_LEASE_REQUIRED', detail: '缺少 lease、detached signature 或协调器公钥；拒绝连接 Win7。' };
  }
  const coordinator = await import('../../../../scripts/mvp_acceptance/win7_coordinator/core.mjs');
  const lease = coordinator.verifyLeaseBundle(
    fs.readFileSync(args.lease), fs.readFileSync(args.leaseSignature), fs.readFileSync(args.coordinatorPublicKey),
    { sourceCommit: head.stdout.trim(), packageManifestSha256: manifestSha256, targetIp: WIN7.address, suite: 'SPIKE_02_A5' },
  );
  for (const artifact of manifest.native_lock) {
    if (!artifact.match || lease.artifact_hashes[artifact.name] !== artifact.sha256) {
      throw new Error(`LEASE_ARTIFACT_HASH_MISMATCH: ${artifact.name}`);
    }
  }
  if (!manifest.containment_helper?.match
      || lease.artifact_hashes['spike02_helper.exe'] !== manifest.containment_helper.sha256) {
    throw new Error('LEASE_ARTIFACT_HASH_MISMATCH: spike02_helper.exe');
  }
  if (lease.artifact_hashes['a5-manifest.json'] !== manifestSha256) {
    throw new Error('LEASE_ARTIFACT_HASH_MISMATCH: a5-manifest.json');
  }

  const remoteBase = `${WIN7.acceptanceRoot}\\a5\\${args.acceptanceId}`;
  const remotePosix = remoteBase.replace(/\\/g, '/');
  assertNoForbidden(`${WIN7.electron} a5-electron-main.js --acceptance-id ${args.acceptanceId}`);

  if (remoteHash(WIN7.electron) !== '2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb') {
    throw new Error('WIN7_ELECTRON_HASH_MISMATCH');
  }
  const rootProbe = spawnSync('ssh', sshArgs(`cmd.exe /d /s /c if exist ${remoteBase} (exit /b 17) else (exit /b 0)`), {
    shell: false, encoding: 'utf8', timeout: 30000,
  });
  if (rootProbe.status !== 0) throw new Error('REMOTE_ACCEPTANCE_ROOT_NOT_FRESH');
  strictSsh(['cmd.exe', '/d', '/s', '/c', `if not exist ${WIN7.acceptanceRoot}\\a5 mkdir ${WIN7.acceptanceRoot}\\a5`]);
  strictSsh(['cmd.exe', '/d', '/s', '/c', `mkdir ${remoteBase}`]);

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    strictScp(path.join(dir, entry.name), `${remotePosix}/${entry.name}`, entry.isDirectory());
  }

  const remoteArtifacts = {
    'pty.node': `${remoteBase}\\node_modules\\node-pty\\build\\Release\\pty.node`,
    'winpty-agent.exe': `${remoteBase}\\node_modules\\node-pty\\build\\Release\\winpty-agent.exe`,
    'winpty.dll': `${remoteBase}\\node_modules\\node-pty\\build\\Release\\winpty.dll`,
    'spike02_helper.exe': `${remoteBase}\\spike02_helper.exe`,
    'a5-manifest.json': `${remoteBase}\\${path.basename(outFile)}`,
  };
  for (const [name, remotePath] of Object.entries(remoteArtifacts)) {
    if (remoteHash(remotePath) !== lease.artifact_hashes[name]) {
      throw new Error(`REMOTE_ARTIFACT_HASH_MISMATCH: ${name}`);
    }
  }

  const launcher = `${remoteBase}\\acceptance\\a5\\a5_wmi.cmd`;
  const launchCommand = `wmic.exe process call create "cmd.exe /d /s /c ${launcher} ${args.acceptanceId} ${lease.lease_id} ${lease.source_commit} ${lease.package_manifest_sha256}"`;
  const launch = strictSsh([launchCommand]);
  if (!/ReturnValue\s*=\s*0/i.test(`${launch.stdout}\n${launch.stderr}`)) {
    throw new Error('WMI_LAUNCH_FAILED');
  }

  const resultRemote = `${remoteBase}\\evidence\\a5-${args.acceptanceId}-win7.json`;
  const exitRemote = `${remoteBase}\\harness-exit-code.txt`;
  waitForRemoteFile(resultRemote);
  waitForRemoteFile(exitRemote);
  fs.mkdirSync(args.out, { recursive: true });
  const evidenceFile = path.join(args.out, `a5-${args.acceptanceId}-win7.json`);
  strictDownload(`${remotePosix}/evidence/a5-${args.acceptanceId}-win7.json`, evidenceFile);
  for (const name of ['harness-stdout.txt', 'harness-stderr.txt', 'harness-exit-code.txt', 'launcher-whoami.txt', 'bitvise-after.txt']) {
    strictDownload(`${remotePosix}/${name}`, path.join(args.out, name));
  }
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  if (evidence.lease_id !== lease.lease_id || evidence.source_commit !== lease.source_commit
      || evidence.package_manifest_sha256 !== lease.package_manifest_sha256) {
    throw new Error('RETURNED_EVIDENCE_BINDING_MISMATCH');
  }
  return {
    status: 'CANDIDATE_EVIDENCE', evidence_grade: 'CANDIDATE_EVIDENCE',
    lease_id: lease.lease_id, source_commit: lease.source_commit,
    package_manifest_sha256: lease.package_manifest_sha256,
    cases: evidence.cases, evidence_file: evidenceFile, candidateDir: dir,
    remote_artifacts: remoteArtifacts,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (args.mode === 'dev') {
    const out = await runDev(args);
    process.stdout.write(`${JSON.stringify({ mode: 'dev', ...out }, null, 2)}\n`);
  } else if (args.mode === 'manifest') {
    const out = runManifest(args);
    process.stdout.write(`${JSON.stringify({ mode: 'manifest', ...out }, null, 2)}\n`);
  } else {
    const out = await runWin7(args);
    process.stdout.write(`${JSON.stringify({ mode: 'win7', ...out }, null, 2)}\n`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack || error}\n`);
    process.exit(2);
  });
}

module.exports = { runDev, runManifest, assembleCandidate, verifyPreparedCandidate, WIN7 };
