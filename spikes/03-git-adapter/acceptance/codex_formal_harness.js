'use strict';

// SPIKE_03 independent MVP harness. It executes only structured argv and
// records every denial/escape as schema-v1 JSON. The target is a controlled,
// GCM/LFS-free derivative of MinGit, never the user's installed Git.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const net = require('net');
const childProcess = require('child_process');
const { GitAdapter } = require('./adapter/adapter.js');
const { buildIsolatedArgs, buildIsolatedEnv } = require('./adapter/isolation.js');
const { validateWhitelist } = require('./adapter/whitelist.js');

const arg = (prefix, fallback) => {
  const found = process.argv.find((item) => item.indexOf(prefix) === 0);
  return found ? found.slice(prefix.length) : fallback;
};
const mvpId = arg('--mvp-id=', 'MVP-UNKNOWN');
const reportPath = arg('--report=', 'C:\\acceptance\\report_spike03_formal.json');
const startedAt = new Date().toISOString();
const git = 'C:\\acceptance\\mvp_mingit\\cmd\\git.exe';
const root = 'C:\\acceptance\\mvp_spike03_codex';
const sentinelDir = path.join(root, 'sentinels');
const repoDir = path.join(root, 'repo');
const results = [];
const evidence = { network_connections: 0, process_snapshots: [] };

function sha256(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
  catch (error) { return 'UNAVAILABLE:' + error.code; }
}
function add(id, status, summary, metrics, paths) {
  results.push({ case_id: id, status, summary, metrics: metrics || {}, evidence: paths || [] });
}
function run(command, args, options) {
  const result = childProcess.spawnSync(command, args, Object.assign({
    cwd: repoDir, shell: false, windowsHide: true, encoding: 'utf8', timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  }, options || {}));
  return { exit_code: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error ? result.error.message : null };
}
function sentinel(id) { return path.join(sentinelDir, id + '.txt'); }
function clear(id) { try { fs.unlinkSync(sentinel(id)); } catch (_) {} }
function writeHook(id, command) {
  fs.mkdirSync(path.join(repoDir, '.git', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n' + command + '\n', 'utf8');
}
function setConfig(key, value) { return run(git, ['config', key, value]); }
function snapshotProcesses() {
  const result = childProcess.spawnSync('wmic', ['process', 'get', 'Name,CommandLine,ProcessId', '/format:list'], {
    shell: false, windowsHide: true, encoding: 'utf8', timeout: 15000,
  });
  return { exit_code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}
function initRepo() {
  fs.mkdirSync(repoDir, { recursive: true });
  run(git, ['init']);
  run(git, ['config', 'user.email', 'mvp@example.invalid']);
  run(git, ['config', 'user.name', 'MVP']);
  fs.writeFileSync(path.join(repoDir, 'README.md'), '# MVP\n', 'utf8');
  run(git, ['add', 'README.md']);
  run(git, ['commit', '-m', 'init']);
}
function cleanRepoFiles() {
  for (const file of ['.gitattributes', path.join('.git', 'config')]) {
    // The config is reconstructed for each case; the repository itself stays
    // inside the dedicated acceptance directory.
    if (file === '.gitattributes') { try { fs.unlinkSync(path.join(repoDir, file)); } catch (_) {} }
  }
  try { fs.rmSync(path.join(repoDir, '.git', 'hooks'), { recursive: true, force: true }); } catch (_) {}
  fs.mkdirSync(path.join(repoDir, '.git', 'hooks'), { recursive: true });
  run(git, ['config', '--local', 'core.pager', '']);
  run(git, ['config', '--local', 'core.fsmonitor', '']);
}
function execute(adapter, request) {
  try {
    const prepared = adapter.prepare(request);
    const result = childProcess.spawnSync(prepared.command, prepared.args, {
      cwd: prepared.config.workDir, env: prepared.config.envOverlay, shell: false,
      windowsHide: true, encoding: 'utf8', timeout: prepared.config.timeoutMs,
      maxBuffer: prepared.config.maxStdoutBytes * 2,
    });
    return { denied: false, exit_code: result.status, stdout: result.stdout || '', stderr: result.stderr || '', args: prepared.args };
  } catch (error) {
    return { denied: true, error: error.message, code: error.code || null };
  }
}
function guardedCase(id, request, predicate, summary) {
  clear(id);
  const before = snapshotProcesses();
  const result = execute(adapter, request);
  const after = snapshotProcesses();
  evidence.process_snapshots.push({ case_id: id, before: before, after: after });
  const pass = predicate(result) && !fs.existsSync(sentinel(id));
  add(id, pass ? 'PASS' : 'FAIL', pass ? summary : 'guard predicate failed: ' + JSON.stringify(result), {
    denied: result.denied, exit_code: result.exit_code, stderr: (result.stderr || '').slice(0, 1000),
  }, fs.existsSync(sentinel(id)) ? [sentinel(id)] : []);
}

fs.mkdirSync(sentinelDir, { recursive: true });
try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch (_) {}
initRepo();
const adapter = new GitAdapter({ gitBinary: git, isolation: true });

const version = run(git, ['--version'], { cwd: root });
add('P01', version.exit_code === 0 ? 'PASS' : 'FAIL', 'Controlled Git binary reports a version.', { git: version.stdout.trim(), git_path: git });
const isolated = buildIsolatedEnv({ GIT_DIR: 'escape', SSH_AUTH_SOCK: 'escape', SAFE: 'ok' });
const args = buildIsolatedArgs([]).join(' ');
add('P02', isolated.HOME && isolated.GIT_DIR === undefined && isolated.SSH_AUTH_SOCK === undefined ? 'PASS' : 'FAIL', 'Dangerous GIT_/SSH_ variables are removed and HOME is controlled.', { home: isolated.HOME });
add('P03', ['core.hooksPath', 'core.pager', 'credential.helper', 'core.sshCommand', 'core.fsmonitor', 'core.attributesFile', 'protocol.allow=never'].every((value) => args.indexOf(value) !== -1) ? 'PASS' : 'FAIL', 'Isolation argv contains the mandatory command-line controls.', { args: args });
const whitelist = [
  validateWhitelist({ command: 'status', args: [] }).allowed === true,
  validateWhitelist({ command: 'add', args: [] }).allowed === true,
  validateWhitelist({ command: 'fetch', args: [] }).allowed === false,
  validateWhitelist({ command: 'config', args: ['--global'] }).allowed === false,
];
add('P04', whitelist.every(Boolean) ? 'PASS' : 'FAIL', 'Whitelist accepts local read/write and rejects network/global configuration.', { checks: whitelist });

writeHook('N01', 'cmd.exe /c "echo escaped > ' + sentinel('N01').replace(/\\/g, '/') + '"');
guardedCase('N01', { command: 'commit', args: ['--allow-empty', '-m', 'hook'], workDir: repoDir }, (r) => !r.denied && r.exit_code === 0, 'Repository hook did not execute under the controlled hooks path.');
cleanRepoFiles();
fs.writeFileSync(path.join(repoDir, '.gitattributes'), '*.txt filter=unsafe\n', 'utf8');
setConfig('filter.unsafe.process', 'cmd.exe /c "echo escaped > ' + sentinel('N02').replace(/\\/g, '/') + '"');
guardedCase('N02', { command: 'status', args: ['--porcelain'], workDir: repoDir }, (r) => r.denied === true, 'Repository-local filter attributes are rejected fail-closed.');
cleanRepoFiles();
fs.writeFileSync(path.join(repoDir, '.gitattributes'), '*.txt diff=unsafe\n', 'utf8');
setConfig('diff.unsafe.textconv', 'cmd.exe /c "echo escaped > ' + sentinel('N03').replace(/\\/g, '/') + '"');
guardedCase('N03', { command: 'show', args: ['--textconv', 'HEAD'], workDir: repoDir }, (r) => r.denied === true, 'Repository-local textconv attributes are rejected fail-closed.');
cleanRepoFiles();
setConfig('core.pager', 'cmd.exe /c "echo escaped > ' + sentinel('N04').replace(/\\/g, '/') + '"');
guardedCase('N04', { command: 'log', args: ['-n', '1'], workDir: repoDir }, (r) => !r.denied, 'Pager configuration is overridden by the isolated argv.');
cleanRepoFiles();
setConfig('core.fsmonitor', 'cmd.exe /c "echo escaped > ' + sentinel('N07').replace(/\\/g, '/') + '"');
guardedCase('N07', { command: 'status', args: ['--porcelain'], workDir: repoDir }, (r) => !r.denied, 'Filesystem monitor configuration is overridden by the isolated argv.');
const gitEnvClean = buildIsolatedEnv({ GIT_CONFIG_GLOBAL: 'escape', GIT_DIR: 'escape' });
add('N08', gitEnvClean.GIT_CONFIG_GLOBAL === undefined && gitEnvClean.GIT_DIR === undefined ? 'PASS' : 'FAIL', 'GIT_* environment injection is removed.', { removed: ['GIT_CONFIG_GLOBAL', 'GIT_DIR'] });
const sshEnvClean = buildIsolatedEnv({ SSH_AUTH_SOCK: 'escape', SSH_AGENT_PID: 'escape' });
add('N09', sshEnvClean.SSH_AUTH_SOCK === undefined && sshEnvClean.SSH_AGENT_PID === undefined ? 'PASS' : 'FAIL', 'SSH_* environment injection is removed.', { removed: ['SSH_AUTH_SOCK', 'SSH_AGENT_PID'] });
guardedCase('N05', { command: 'fetch', args: ['origin'], workDir: repoDir }, (r) => r.denied === true, 'Credential/network operation is rejected before Git starts.');
guardedCase('N06', { command: 'ls-remote', args: ['origin'], workDir: repoDir }, (r) => r.denied === true, 'Remote helper/SSH operation is rejected by the whitelist.');
guardedCase('N10', { command: 'config', args: ['--global', 'user.name', 'escape'], workDir: repoDir }, (r) => r.denied === true, 'Global configuration mutation is rejected by the whitelist.');

const server = net.createServer((socket) => { evidence.network_connections += 1; socket.destroy(); });
server.listen(37123, '127.0.0.1', () => setTimeout(() => {
  server.close();
  const pass = results.filter((item) => item.status === 'PASS').length;
  const report = {
    schema_version: 1, mvp_id: mvpId, suite: 'SPIKE_03_GIT_ADAPTER_CODEX_FORMAL_AUTOMATION',
    environment: { os: process.platform, arch: process.arch, git_path: git },
    artifact_hashes: { harness: sha256(__filename), adapter: sha256(path.join(__dirname, 'adapter', 'adapter.js')), isolation: sha256(path.join(__dirname, 'adapter', 'isolation.js')), git_exe: sha256(git) },
    command: [process.execPath].concat(process.argv.slice(1)),
    timestamps: { started_at: startedAt, finished_at: new Date().toISOString() }, exit_code: pass === results.length ? 0 : 1,
    cases: results, evidence: [], notes: ['N02/N03 are fail-closed denials because Win7 Git cannot safely disable repository-local attributes.', 'Network listener observed connections: ' + evidence.network_connections, 'This is a controlled MinGit derivative; the untrimmed official archive is not a D-012 delivery closure.'], raw: evidence,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write('REPORT_WRITTEN:' + reportPath + '\n');
  process.exit(report.exit_code);
}, 1200));
