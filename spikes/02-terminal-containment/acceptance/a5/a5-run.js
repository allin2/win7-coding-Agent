/**
 * A5 - 终端验收编排入口
 *
 * 用法：
 *   node a5-run.js --mode dev --acceptance-id A5-YYYYMMDD-unique [--out dir] [--dry-run]
 *   node a5-run.js --mode manifest --acceptance-id A5-YYYYMMDD-unique [--zip path] [--out dir]
 *   node a5-run.js --mode win7 --acceptance-id A5-YYYYMMDD-unique [--lease-granted]
 *
 * 约束：
 *   - `--mode win7` 必须显式授予 lease（WIN7_LEASE_GRANTED=1 或 --lease-granted），
 *     否则拒绝连接 Win7；
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
  address: '10.67.149.40',
  user: 'dccs-chaizl',
  acceptanceRoot: 'C:\\Win7CodingAgent\\acceptance',
  privateKey: '/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/id_rsa_win7accept',
  knownHosts: '/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/known_hosts_win7',
  remotePython: 'C:\\acceptance\\python38_mvp\\python.exe',
  electron: process.env.WIN7_ELECTRON || 'C:\\Win7CodingAgent\\a5\\electron.exe',
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
  --lease-granted     win7 模式显式授权（等价 WIN7_LEASE_GRANTED=1）
  --electron <path>   win7 上 Electron 可执行文件路径`;
}

function parseArgs(argv) {
  const args = { mode: 'dev', out: null, zip: DEFAULT_ZIP, helper: '', dryRun: false, leaseGranted: false, acceptanceId: null, electron: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--mode') args.mode = argv[++i];
    else if (a === '--acceptance-id') args.acceptanceId = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--zip') args.zip = argv[++i];
    else if (a === '--helper') args.helper = argv[++i];
    else if (a === '--electron') args.electron = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--lease-granted') args.leaseGranted = true;
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
  ], candidateDir);

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

function runWin7(args) {
  const lease = process.env.WIN7_LEASE_GRANTED === '1' || args.leaseGranted;
  if (!lease) {
    return {
      status: 'WIN7_LEASE_REQUIRED',
      detail: '未收到 WIN7_LEASE_GRANTED，拒绝连接 Win7（遵守任务约束）。',
    };
  }
  // 装配候选包 + 内部 manifest（不触碰原始 ZIP）
  const candidateDir = path.join(HERE, 'package-a5', args.acceptanceId);
  const { candidateDir: dir, manifest } = assembleCandidate(args.zip, candidateDir);

  if (args.dryRun) {
    return { status: 'DRY_RUN_PLAN', candidateDir: dir, source_zip_match: manifest.source_zip.match, native_lock: manifest.native_lock };
  }

  const remoteBase = `${WIN7.acceptanceRoot}\\a5\\${args.acceptanceId}`;
  // 组合远程命令前先过禁止操作守卫（N06）
  assertNoForbidden(`${WIN7.electron} a5-electron-main.js --acceptance-id ${args.acceptanceId}`);
  const cmds = [
    `scp -r ${dir} → ${remoteBase}`,
    `ssh: run ${WIN7.electron} a5-electron-main.js --acceptance-id ${args.acceptanceId}`,
    `scp: evidence ← ${remoteBase}\\a5-${args.acceptanceId}-win7.json`,
    `ssh: verify BvSshServer RUNNING + zero residue (tasklist)`,
  ];
  return { status: 'WIN7_DEPLOY_REQUIRES_EXECUTION', plan: cmds, candidateDir: dir };
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
    const out = runWin7(args);
    process.stdout.write(`${JSON.stringify({ mode: 'win7', ...out }, null, 2)}\n`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack || error}\n`);
    process.exit(2);
  });
}

module.exports = { runDev, runManifest, assembleCandidate, WIN7 };
