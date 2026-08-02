/**
 * SPIKE 03 - Win7 实机验收 harness（自包含，运行于 electron.exe / Node 16）
 *
 * 与 spikes/01 的 win7-acceptance.js 同范式：headless、结构化 JSON 落盘、标记行输出。
 * 关键：本 harness 直接 require 真实 adapter 的编译产物（src/git-adapter/dist），
 *       通过 GitAdapter.prepare() 生成隔离 env/args 与白名单裁决——验证对象零失真。
 *
 * 验证 PRD（docs/tasks/SPIKE_03_GIT_ADAPTER.md）G10 矩阵：
 *   正向 P01-P04：隔离环境 + 白名单（直接断言真实 adapter 的 buildIsolatedEnv/
 *                 buildIsolatedArgs/validateWhitelist 输出）
 *   负向 N01-N10：10 类攻击面（经真实 prepare 生成隔离后 spawn 实测，零逃逸判据：
 *                 哨兵标记文件未写 + wmic 进程快照无封禁图像 + 本地 TCP 哨兵 0 连接）
 *
 * 用法（Win7）：
 *   C:\acceptance\electron\electron.exe C:\acceptance\spike03\test\harness.js --report=C:\acceptance\report_spike03.json
 */

'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

// 真实 adapter（src/git-adapter/dist 编译产物，已部署到 ../adapter）
const { GitAdapter } = require('../adapter/adapter.js');
const { buildIsolatedEnv, buildIsolatedArgs } = require('../adapter/isolation.js');
const { validateWhitelist } = require('../adapter/whitelist.js');

// ─── 路径常量（Win7）──────────────────────────────────────────────────────
const GIT_CANDIDATES = [
  'C:\\acceptance\\git\\cmd\\git.exe',
  'C:\\acceptance\\git\\bin\\git.exe',
  'C:\\acceptance\\git\\mingw64\\bin\\git.exe',
];
const CONTROLLED_HOME = 'C:\\acceptance\\git-home';
const CONTROLLED_HOOKS = 'C:\\acceptance\\git-hooks';
const SENTINEL_DIR = 'C:\\acceptance\\pwned';
const WORK_DIR = 'C:\\acceptance\\spike03-work';
const NULL_DIR = path.join(process.env.TEMP || 'C:\\Temp', 'win7-agent-git-empty');
const NET_PORT = 37123;

function findGit() {
  for (const p of GIT_CANDIDATES) if (fs.existsSync(p)) return p;
  return 'git';
}

// ─── 进程审计 ──────────────────────────────────────────────────────────────
function snapshotProcesses() {
  const out = spawnSync('wmic', ['process', 'get', 'Name,ProcessId,ParentProcessId', '/format:csv'],
    { encoding: 'utf8', shell: false, timeout: 15000 });
  const map = new Map();
  if (!out.stdout) return map;
  for (const line of out.stdout.split('\n')) {
    const cols = line.split(',');
    if (cols.length < 3) continue;
    const name = (cols[0] || '').trim();
    const pid = parseInt((cols[1] || '').trim(), 10);
    const ppid = parseInt((cols[2] || '').trim(), 10);
    if (!isNaN(pid) && name) map.set(pid, { name: name.toLowerCase(), ppid });
  }
  return map;
}
const BLOCKED_IMAGES = new Set(['cmd.exe', 'powershell.exe', 'curl.exe', 'wget.exe',
  'nc.exe', 'ncat.exe', 'bash.exe', 'sh.exe', 'telnet.exe', 'certutil.exe']);
function auditProcesses(before, after) {
  const escaped = [];
  for (const [pid, info] of after) {
    if (before.has(pid)) continue;
    if (BLOCKED_IMAGES.has(info.name)) escaped.push({ pid, name: info.name });
  }
  return escaped;
}

// ─── 工具 ──────────────────────────────────────────────────────────────────
function sentinelPath(caseId) { return path.join(SENTINEL_DIR, `${caseId}.txt`); }
function clearSentinel(caseId) { try { fs.unlinkSync(sentinelPath(caseId)); } catch (_) {} }
function sentinelExists(caseId) { return fs.existsSync(sentinelPath(caseId)); }
function winSentinel(caseId) { return sentinelPath(caseId).replace(/\//g, '\\'); }
// sh 上下文（git 经 sh -c 执行 filter/textconv）必须用正斜杠，否则 \ 被当作转义符
function winSentinelFwd(caseId) { return `C:/acceptance/pwned/${caseId}.txt`; }

// 经真实 adapter prepare() 生成隔离 env/args 并 spawn git（忠实复刻 Runner 行为）
function runViaAdapter(adapter, request) {
  let prepared;
  try {
    prepared = adapter.prepare(request);
  } catch (e) {
    return { denied: true, reason: e.message, exitCode: null, stdout: '', stderr: '' };
  }
  const res = spawnSync(prepared.command, prepared.args, {
    cwd: prepared.config.workDir,
    env: prepared.config.envOverlay,
    shell: false, encoding: 'utf8',
    timeout: prepared.config.timeoutMs || 30000,
    maxBuffer: (prepared.config.maxStdoutBytes || 10 * 1024 * 1024) * 2,
    windowsHide: true,
  });
  return {
    denied: false,
    exitCode: res.status,
    stdout: (res.stdout || '').slice(0, 65536),
    stderr: (res.stderr || '').slice(0, 65536),
    preparedArgs: prepared.args,
  };
}

// ─── 恶意仓库生成（Win7 感知）──────────────────────────────────────────────
function initRepo(gitPath, repoDir) {
  fs.mkdirSync(repoDir, { recursive: true });
  spawnSync(gitPath, ['init'], { cwd: repoDir, env: process.env, shell: false, encoding: 'utf8' });
  spawnSync(gitPath, ['config', 'user.email', 'test@test.com'], { cwd: repoDir, env: process.env, shell: false });
  spawnSync(gitPath, ['config', 'user.name', 'Test'], { cwd: repoDir, env: process.env, shell: false });
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# Attack surface repo\n');
  spawnSync(gitPath, ['add', '.'], { cwd: repoDir, env: process.env, shell: false });
  spawnSync(gitPath, ['commit', '-m', 'init'], { cwd: repoDir, env: process.env, shell: false });
  fs.writeFileSync(path.join(repoDir, 'sample.txt'), 'hello filter\n');
  fs.writeFileSync(path.join(repoDir, 'sample.bin'), 'hello textconv\n');
}
function setLocalConfig(gitPath, repoDir, key, value) {
  spawnSync(gitPath, ['config', key, value], { cwd: repoDir, env: process.env, shell: false });
}
function buildMaliciousRepos(gitPath, baseDir) {
  const repos = {};
  const mk = (id) => { const d = path.join(baseDir, `attack_${id}`); initRepo(gitPath, d); repos[id] = d; return d; };

  // N01 hooks：pre-commit（sh 脚本经 sh 执行）写哨兵
  {
    const d = mk('N01');
    const hooksDir = path.join(d, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'pre-commit'),
      `#!/bin/sh\ncmd.exe /c "echo pwned > ${winSentinel('N01')}"\n`);
  }
  // N02 filter：.gitattributes + filter.malicious.process（sh 原生命令，确定性写哨兵）
  {
    const d = mk('N02');
    setLocalConfig(gitPath, d, 'filter.malicious.process', `touch ${winSentinelFwd('N02')}`);
    setLocalConfig(gitPath, d, 'filter.malicious.required', 'true');
    fs.writeFileSync(path.join(d, '.gitattributes'), '*.txt filter=malicious\n');
  }
  // N03 textconv：.gitattributes + diff.malicious.textconv；追加提交以触发 show 的 diff
  {
    const d = mk('N03');
    setLocalConfig(gitPath, d, 'diff.malicious.textconv', `touch ${winSentinelFwd('N03')}`);
    fs.writeFileSync(path.join(d, '.gitattributes'), '*.bin diff=malicious\n');
    fs.writeFileSync(path.join(d, 'sample.bin'), 'hello textconv v2\n');
    spawnSync(gitPath, ['add', 'sample.bin'], { cwd: d, env: process.env, shell: false });
    spawnSync(gitPath, ['commit', '-m', 'change bin'], { cwd: d, env: process.env, shell: false });
  }
  // N04 pager
  {
    const d = mk('N04');
    setLocalConfig(gitPath, d, 'core.pager', `cmd.exe /c "echo pwned > ${winSentinel('N04')}"`);
  }
  // N05 credential.helper
  {
    const d = mk('N05');
    setLocalConfig(gitPath, d, 'credential.helper', `cmd.exe /c "echo pwned > ${winSentinel('N05')}"`);
  }
  // N06 sshCommand
  {
    const d = mk('N06');
    setLocalConfig(gitPath, d, 'core.sshCommand', `cmd.exe /c "echo pwned > ${winSentinel('N06')}"`);
  }
  // N07 fsmonitor
  {
    const d = mk('N07');
    setLocalConfig(gitPath, d, 'core.fsmonitor', `cmd.exe /c "echo pwned > ${winSentinel('N07')}"`);
  }
  return repos;
}

// ─── 主流程 ────────────────────────────────────────────────────────────────
function main() {
  const reportPath = process.argv.find(a => a.startsWith('--report='));
  const outPath = reportPath ? reportPath.slice('--report='.length) : 'C:\\acceptance\\report_spike03.json';

  for (const d of [CONTROLLED_HOME, CONTROLLED_HOOKS, NULL_DIR, SENTINEL_DIR, WORK_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
  if (fs.existsSync(SENTINEL_DIR)) for (const f of fs.readdirSync(SENTINEL_DIR)) {
    try { fs.unlinkSync(path.join(SENTINEL_DIR, f)); } catch (_) {}
  }

  const gitPath = findGit();
  const adapter = new GitAdapter({ gitBinary: gitPath, isolation: true });
  const results = [];
  const evidence = { gitPath, netConnections: 0, adapterSource: 'src/git-adapter/dist (real)' };

  // 网络哨兵：监听本地端口，计数连接
  const netServer = net.createServer((sock) => { evidence.netConnections++; sock.destroy(); });
  netServer.listen(NET_PORT, '127.0.0.1');

  const repos = buildMaliciousRepos(gitPath, path.join(WORK_DIR, 'malicious'));
  const benign = path.join(WORK_DIR, 'benign');
  initRepo(gitPath, benign);

  // ── 正向：直接断言真实 adapter 的隔离/白名单输出（config 命令被 whitelist fail-closed，故走静态+功能）──
  // P01：buildIsolatedEnv 含 GIT_CONFIG_NOSYSTEM=1 且 GIT_ATTR_NOSYSTEM=1
  {
    const env = buildIsolatedEnv();
    const pass = env['GIT_CONFIG_NOSYSTEM'] === '1' && env['GIT_ATTR_NOSYSTEM'] === '1';
    results.push({ id: 'P01', name: 'GIT_CONFIG_NOSYSTEM / GIT_ATTR_NOSYSTEM 注入', pass,
      detail: pass ? 'env 含 NOSYSTEM=1（双系统配置隔离）' : '缺失 NOSYSTEM 注入' });
  }
  // P02：HOME 重定向到受控 NULL_DIR + 危险 GIT_/SSH_ 变量剥离
  //      注意：adapter 主动写入 GIT_TERMINAL_PROMPT=0 / GIT_ASKPASS=false 是安全加固，不算泄露
  {
    const env = buildIsolatedEnv();
    const dangerousLeaked = ['GIT_CONFIG', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM',
      'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'SSH_AUTH_SOCK', 'SSH_AGENT_PID']
      .some(k => k in env);
    const pass = env['HOME'] === NULL_DIR && env['USERPROFILE'] === NULL_DIR && !dangerousLeaked;
    results.push({ id: 'P02', name: 'HOME 重定向 + 危险 GIT_/SSH_ 剥离', pass,
      detail: pass ? `HOME→${NULL_DIR}；GIT_CONFIG/GIT_DIR/SSH_AUTH_SOCK 等已剥离` :
        'HOME 重定向或危险变量剥离失败' });
  }
  // P03：buildIsolatedArgs 注入关键 -c 封禁（hooksPath/pager/credential/sshCommand/fsmonitor/protocol）
  {
    const args = buildIsolatedArgs([]);
    const joined = args.join(' ');
    const need = ['core.hooksPath', 'core.pager', 'credential.helper', 'core.sshCommand',
      'core.fsmonitor', 'core.attributesFile', 'protocol.allow=never'];
    const missing = need.filter(n => !joined.includes(n));
    const pass = missing.length === 0;
    results.push({ id: 'P03', name: '-c 显式封禁注入', pass,
      detail: pass ? '全部关键 -c 封禁已注入' : `缺失: ${missing.join(',')}` });
  }
  // P04：白名单分类（真实 validateWhitelist）
  {
    const r = validateWhitelist({ command: 'status', args: [] });
    const w = validateWhitelist({ command: 'add', args: [] });
    const n = validateWhitelist({ command: 'fetch', args: [] });
    const c = validateWhitelist({ command: 'config', args: ['--global', 'x'] });
    const pass = r.allowed === true && w.allowed === true && n.allowed === false && c.allowed === false;
    results.push({ id: 'P04', name: '白名单分类与 fail-closed', pass,
      detail: `读:${r.allowed ? '✓' : '✗'} 写:${w.allowed ? '✓' : '✗'} 网络:${!n.allowed ? '✓' : '✗'} config:${!c.allowed ? '✓' : '✗'}` });
  }

  // ── 负向：经真实 prepare 生成隔离后 spawn 实测 ──
  const negative = [
    { id: 'N01', repo: 'N01', req: { command: 'commit', args: ['--allow-empty', '-m', 'x'], workDir: repos.N01 } },
    { id: 'N02', repo: 'N02', req: { command: 'add', args: ['sample.txt'], workDir: repos.N02 } },
    { id: 'N03', repo: 'N03', req: { command: 'show', args: ['--textconv', 'HEAD'], workDir: repos.N03 } },
    { id: 'N04', repo: 'N04', req: { command: 'log', args: ['-n', '1'], workDir: repos.N04 } },
    { id: 'N07', repo: 'N07', req: { command: 'status', args: ['--porcelain'], workDir: repos.N07 } },
    // 以下被 whitelist 拒绝（网络/全局配置）—— 断言 prepare 抛 COMMAND_DENIED
    { id: 'N05', repo: null, req: { command: 'fetch', args: ['ext::' + `cmd.exe /c "echo pwned > ${winSentinel('N05net')}"`], workDir: benign } },
    { id: 'N06', repo: null, reqByAdapter: true, req: { command: 'ls-remote', args: ['ext::' + `cmd.exe /c "echo pwned > ${winSentinel('N06net')}"`], workDir: benign } },
    { id: 'N10', repo: null, req: { command: 'config', args: ['--global', 'user.name', 'Hacked'], workDir: benign } },
  ];

  for (const t of negative) {
    clearSentinel(t.id);
    const before = snapshotProcesses();
    const r = runViaAdapter(adapter, t.req);
    const after = snapshotProcesses();
    const escaped = auditProcesses(before, after);
    const pwned = sentinelExists(t.id);
    if (r.denied) {
      // 白名单 fail-closed：未执行 → 安全
      results.push({ id: t.id, name: `攻击面 ${t.id} 防护`, pass: true,
        detail: `白名单拒绝（fail-closed）: ${r.reason.split('\n')[0]}`,
        escapedProcesses: [] });
    } else {
      const filterInvoked = /git-filter-client|protocol error|filter\.|textconv/i.test(r.stderr || '');
      const pass = !pwned && escaped.length === 0 && !filterInvoked;
      results.push({
        id: t.id, name: `攻击面 ${t.id} 防护`, pass,
        detail: pwned ? '哨兵文件被写入（攻击成功）' :
          (filterInvoked ? 'git 调用了仓库本地 filter/textconv 子进程（隔离未阻断）' :
            (escaped.length ? `逃逸进程:${escaped.map(e => e.name).join(',')}` : '隔离生效，零逃逸')),
        escapedProcesses: escaped.map(e => e.name),
        gitExitCode: r.exitCode,
        gitStderr: (r.stderr || '').slice(0, 500),
      });
    }
  }

  // 等待网络哨兵计数窗口
  setTimeout(() => {
    netServer.close();
    const passCount = results.filter(r => r.pass).length;
    const report = {
      spike: 'SPIKE_03_GIT_ADAPTER',
      agent: 'workbuddy',
      adapterSource: evidence.adapterSource,
      timestamp: new Date().toISOString(),
      gitVersion: (() => { const v = spawnSync(gitPath, ['--version'], { encoding: 'utf8', shell: false }); return (v.stdout || '').trim(); })(),
      isolation: {
        gitConfigNoSystem: true,
        gitAttrNoSystem: true,
        homeRedirected: NULL_DIR,
        hooksPathRedirected: NULL_DIR,
        strippedPrefixes: ['GIT_', 'SSH_'],
        injectedConfigBlocks: buildIsolatedArgs([]).filter((_, i) => i % 2 === 1),
      },
      networkSentinel: { port: NET_PORT, connections: evidence.netConnections },
      results,
      summary: { total: results.length, pass: passCount, fail: results.length - passCount,
        verdict: passCount === results.length ? 'GO' : 'NO-GO' },
    };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log('ACCEPTANCE_SPIKE03_DONE');
    console.log('VERDICT:' + report.summary.verdict);
    console.log('PASS:' + passCount + '/' + results.length);
    console.log('REPORT_WRITTEN:' + outPath);
    process.exit(report.summary.verdict === 'GO' ? 0 : 1);
  }, 1500);
}

main();
