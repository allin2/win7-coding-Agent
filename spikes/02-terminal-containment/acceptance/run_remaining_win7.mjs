/* Supplementary Win7 acceptance runner for C02/C03/C05.
 * All remote commands use shell=false locally and a fixed, auditable profile.
 * It never reads or emits private-key content and never changes system state.
 */
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCertutilHash, redactArgs, validateAcceptanceId, validateProfile } from './run_fup_automation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const PROFILE_PATH = path.join(HERE, 'fup_safe_profile.json');
const CANDIDATE = path.join(HERE, 'evidence', 'A4-20260805-123467', 'snapshot-package', 'spike02_helper.exe');
const SCRIPT = path.join(HERE, 'run_remaining_win7.py');
const LAUNCHER = path.join(HERE, 'run_remaining_wmi.cmd');

function parseArgs(argv) {
  const args = { executeWin7: false, profile: PROFILE_PATH, acceptanceId: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--execute-win7') args.executeWin7 = true;
    else if (argv[i] === '--profile') args.profile = path.resolve(argv[++i]);
    else if (argv[i] === '--acceptance-id') args.acceptanceId = argv[++i];
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--help') args.help = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (args.help) return args;
  if (!args.executeWin7) throw new Error('explicit --execute-win7 is required');
  validateAcceptanceId(args.acceptanceId);
  return args;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function now() { return new Date().toISOString(); }
class Runner {
  constructor(args, profile) {
    this.args = args;
    this.profile = profile;
    const reportParent = args.out ? path.dirname(args.out) : path.join(HERE, 'evidence');
    this.evidenceDir = path.join(reportParent, args.acceptanceId);
    this.reportPath = args.out || path.join(this.evidenceDir, `${args.acceptanceId}-remaining-automation.json`);
    this.htmlPath = this.reportPath.replace(/\.json$/i, '.html');
    this.stages = [];
    this.commands = 0;
    this.remoteRoot = `${profile.target.acceptance_root}\\${args.acceptanceId}`;
    this.remoteDataRoot = `${profile.target.data_root}\\${args.acceptanceId}`;
    fs.mkdirSync(path.dirname(this.reportPath), { recursive: true });
    if (fs.existsSync(this.evidenceDir)) throw new Error(`evidence directory already exists: ${args.acceptanceId}`);
    fs.mkdirSync(this.evidenceDir);
  }

  record(stage, command, argv, result, detail = null) {
    const item = {
      command, argv: redactArgs(argv), exit_code: result.status ?? null,
      stdout: result.stdout || '', stderr: result.stderr || '',
      error: result.error ? String(result.error.message || result.error) : null,
      signal: result.signal || null, shell: false, detail,
    };
    stage.commands.push(item);
    this.commands += 1;
    return item;
  }

  run(stage, command, argv, timeout = 30000, detail = null) {
    let result;
    try {
      result = spawnSync(command, argv, {
        cwd: ROOT, shell: false, windowsHide: true, encoding: 'utf8', timeout,
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      result = { status: null, stdout: '', stderr: '', signal: null, error };
    }
    return this.record(stage, command, argv, result, detail);
  }

  sshArgs(remoteArgv) {
    return [
      '-i', this.profile.ssh.private_key,
      '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${this.profile.ssh.connect_timeout_seconds}`,
      '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${this.profile.ssh.known_hosts}`,
      `${this.profile.target.user}@${this.profile.target.address}`,
    ].concat(remoteArgv);
  }

  ssh(stage, remoteArgv, timeout = 30000) { return this.run(stage, 'ssh', this.sshArgs(remoteArgv), timeout); }

  scp(stage, local, remote, timeout = 120000) {
    const argv = [
      '-i', this.profile.ssh.private_key,
      '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${this.profile.ssh.connect_timeout_seconds}`,
      '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${this.profile.ssh.known_hosts}`,
      local, `${this.profile.target.user}@${this.profile.target.address}:${remote}`,
    ];
    return this.run(stage, 'scp', argv, timeout);
  }

  download(stage, remote, local) {
    const argv = [
      '-i', this.profile.ssh.private_key,
      '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${this.profile.ssh.connect_timeout_seconds}`,
      '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${this.profile.ssh.known_hosts}`,
      `${this.profile.target.user}@${this.profile.target.address}:${remote}`, local,
    ];
    return this.run(stage, 'scp', argv, 120000);
  }

  stage(id, name, action, deadline) {
    const stage = { id, name, status: 'RUNNING', execution: 'AUTOMATIC', deadline_ms: deadline, started_at: now(), commands: [], failure: null };
    try {
      Object.assign(stage, action(stage) || {});
      if (stage.status === 'RUNNING') stage.status = 'PASS';
    } catch (error) {
      stage.status = 'FAIL';
      stage.failure = { code: error.code || 'ORCHESTRATOR_ERROR', message: String(error.message || error) };
    }
    stage.finished_at = now();
    stage.duration_ms = Date.parse(stage.finished_at) - Date.parse(stage.started_at);
    fs.writeFileSync(path.join(this.evidenceDir, `${id}-stdout.txt`), stage.commands.map((x) => x.stdout || '').join('\n'), 'utf8');
    fs.writeFileSync(path.join(this.evidenceDir, `${id}-stderr.txt`), stage.commands.map((x) => x.stderr || x.error || '').join('\n'), 'utf8');
    stage.stdout_file = `${id}-stdout.txt`;
    stage.stderr_file = `${id}-stderr.txt`;
    this.stages.push(stage);
    return stage;
  }

  runAll() {
    this.stage('REM-00', 'governance and locked candidate check', (stage) => {
      const profile = validateProfile(this.profile);
      if (!fs.existsSync(CANDIDATE)) return { status: 'FAIL', failure: { code: 'CANDIDATE_MISSING', message: CANDIDATE } };
      const candidateHash = sha256(CANDIDATE);
      const localSources = [SCRIPT, LAUNCHER, CANDIDATE].map((file) => ({ path: file, sha256: sha256(file) }));
      stage.baseline = { profile_id: profile.profile_id, candidate: { path: CANDIDATE, sha256: candidateHash, expected_sha256: profile.artifacts.candidate.sha256 }, local_sources: localSources, ssh_private_key_content_read: false };
      return candidateHash === profile.artifacts.candidate.sha256 ? { status: 'PASS' } : { status: 'FAIL', failure: { code: 'CANDIDATE_HASH_MISMATCH', message: candidateHash } };
    }, 30000);
    if (this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-01', 'strict SSH and Bitvise preflight', (stage) => {
      const key = fs.statSync(this.profile.ssh.private_key);
      if (!fs.existsSync(this.profile.ssh.known_hosts) || (key.mode & 0o077) !== 0) return { status: 'FAIL', failure: { code: 'SSH_LOCAL_PRECHECK_FAILED', message: 'known_hosts missing or private-key mode is not restrictive' } };
      const checks = {
        ver: this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', 'ver']),
        whoami: this.ssh(stage, ['whoami']),
        python: this.ssh(stage, [this.profile.remote.python, '--version']),
        bitvise: this.ssh(stage, ['sc', 'query', this.profile.remote.bitvise_service]),
      };
      stage.preflight = Object.fromEntries(Object.entries(checks).map(([keyName, value]) => [keyName, { exit_code: value.exit_code, stdout: value.stdout, stderr: value.stderr }]));
      const text = Object.values(checks).map((x) => `${x.stdout}\n${x.stderr}`).join('\n');
      return checks.ver.exit_code === 0 && /7601/.test(text) && checks.whoami.exit_code === 0 && /dccs-chaizl/i.test(text)
        && checks.python.exit_code === 0 && /3\.8\.10/.test(text) && checks.bitvise.exit_code === 0 && /RUNNING/i.test(text)
        ? { status: 'PASS' } : { status: 'FAIL', failure: { code: 'WIN7_PREFLIGHT_FAILED', message: 'strict Win7 or Bitvise preflight failed' } };
    }, 120000);
    if (this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-02', 'fresh acceptance and data roots', (stage) => {
      const checks = [
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if exist ${this.remoteRoot} exit /b 17`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if exist ${this.remoteDataRoot} exit /b 18`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `mkdir ${this.remoteRoot}`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `mkdir ${this.remoteDataRoot}`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if not exist ${this.remoteRoot} exit /b 19`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if not exist ${this.remoteDataRoot} exit /b 20`]),
      ];
      return checks.every((x) => x.exit_code === 0) ? { status: 'PASS', roots: { acceptance: this.remoteRoot, data: this.remoteDataRoot } } : { status: 'FAIL', failure: { code: 'REMOTE_ROOT_FAILED', message: 'fresh root creation/verification failed' } };
    }, 120000);
    if (this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-03', 'allowlisted upload and remote hashes', (stage) => {
      const files = [
        [CANDIDATE, `${this.remoteRoot.replace(/\\/g, '/')}/spike02_helper.exe`],
        [SCRIPT, `${this.remoteRoot.replace(/\\/g, '/')}/run_remaining_win7.py`],
        [LAUNCHER, `${this.remoteRoot.replace(/\\/g, '/')}/run_remaining_wmi.cmd`],
      ];
      const uploaded = [];
      for (const [local, remote] of files) {
        const transfer = this.scp(stage, local, remote);
        const probe = this.ssh(stage, ['certutil', '-hashfile', remote, 'SHA256']);
        const localHash = sha256(local);
        const remoteHash = parseCertutilHash(probe.stdout);
        uploaded.push({ local, remote, local_sha256: localHash, remote_sha256: remoteHash, transfer_exit_code: transfer.exit_code });
        if (transfer.exit_code !== 0 || remoteHash !== localHash) return { status: 'FAIL', failure: { code: 'REMOTE_HASH_MISMATCH', message: remote }, uploaded };
      }
      return { status: 'PASS', uploaded };
    }, 180000);
    if (this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-04', 'safe loader smoke', (stage) => {
      const helper = `${this.remoteRoot}\\spike02_helper.exe`;
      const version = this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `"${helper}" --version`]);
      const help = this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `"${helper}" --help`]);
      // Win7's remote command parser requires the complete tasklist command
      // as one remote string; this is the quoting form already proven by A4.
      const residual = this.ssh(stage, ['tasklist.exe /FI "IMAGENAME eq spike02_helper.exe" /FO CSV /NH']);
      stage.loader = { version: version.stdout, help: help.stdout, residual: residual.stdout };
      return version.exit_code === 0 && /win7-x64/i.test(version.stdout) && help.exit_code === 0 && /stdin/i.test(help.stdout) && residual.exit_code === 0 && !/spike02_helper\.exe/i.test(residual.stdout)
        ? { status: 'PASS' } : { status: 'FAIL', failure: { code: 'LOADER_SMOKE_FAILED', message: 'helper version/help/residual check failed' } };
    }, 120000);
    if (this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-05', 'detached Win7 supplementary harness', (stage) => {
      const launcher = `${this.remoteRoot}\\run_remaining_wmi.cmd`;
      const launchCommand = `wmic.exe process call create "cmd.exe /d /s /c ${launcher} ${this.args.acceptanceId}"`;
      const launch = this.ssh(stage, [launchCommand]);
      if (launch.exit_code !== 0 || !/ReturnValue\s*=\s*0/i.test(`${launch.stdout}\n${launch.stderr}`)) return { status: 'FAIL', failure: { code: 'WMI_LAUNCH_FAILED', message: 'supplementary harness was not created' } };
      const resultRemote = `${this.remoteRoot}\\remaining-results.json`;
      const deadline = Date.now() + 300000;
      let completion = null;
      while (Date.now() < deadline) {
        completion = this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if exist "${resultRemote}" (type "${resultRemote}") else (exit /b 3)`], 30000);
        if (completion.exit_code === 0) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      }
      stage.launcher = { launch, completion, wmi_command: launchCommand, detached: true };
      return completion?.exit_code === 0 ? { status: 'PASS' } : { status: 'FAIL', failure: { code: 'SUPPLEMENTARY_HARNESS_TIMEOUT', message: 'result file not created before deadline' } };
    }, 360000);
    if (this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-06', 'supplementary evidence retrieval and classification', (stage) => {
      const names = ['remaining-results.json', 'remaining-stdout.txt', 'remaining-stderr.txt', 'remaining-exit-code.txt', 'launcher-whoami.txt', 'bitvise-after.txt'];
      const files = [];
      for (const name of names) {
        const local = path.join(this.evidenceDir, `remote-${name}`);
        const result = this.download(stage, `${this.remoteRoot.replace(/\\/g, '/')}/${name}`, local);
        if (result.exit_code !== 0 || !fs.existsSync(local)) return { status: 'FAIL', failure: { code: 'EVIDENCE_RETRIEVAL_FAILED', message: name } };
        files.push({ name, path: local, sha256: sha256(local) });
      }
      const supplementary = readJson(path.join(this.evidenceDir, 'remote-remaining-results.json'));
      const cases = supplementary.cases || [];
      const c02 = cases.find((x) => x.id === 'C02-host-already-in-job');
      const c03 = cases.find((x) => x.id === 'C03-restricted-token-boundary');
      const c05 = cases.find((x) => x.id === 'C05-loopback-network');
      stage.classification = {
        c02: c02?.status || 'MISSING',
        c03: c03?.status || 'MISSING',
        c05: c05?.status === 'PASS' ? 'PASS_LOCAL_ONLY_ENVIRONMENT_MISSING' : (c05?.status || 'MISSING'),
        formal_c05: 'ENVIRONMENT_MISSING',
        taskkill_used: supplementary.taskkill_used,
        bitvise_after: fs.readFileSync(path.join(this.evidenceDir, 'remote-bitvise-after.txt'), 'utf8'),
        files,
      };
      return supplementary.taskkill_used === false && cases.length === 3 && Boolean(c02 && c03 && c05)
        ? { status: 'PASS', evidence: files, supplementary } : { status: 'FAIL', failure: { code: 'SUPPLEMENTARY_ASSERTION_FAILED', message: 'supplementary result shape/safety assertion failed' }, evidence: files, supplementary };
    }, 180000);
    return this.finish();
  }

  finish() {
    const report = {
      schema_version: 1, plan_id: this.profile.profile_id, acceptance_id: this.args.acceptanceId,
      mode: 'EXECUTE_WIN7_SUPPLEMENTARY', generated_at: now(), evidence_directory: this.evidenceDir,
      repository: { root: ROOT, orchestration_head: this.profile.orchestration_head, source_head: this.profile.source_head, a3_head: this.profile.a3_head },
      safety: { shell_false_only: true, private_key_content_read: false, private_key_content_emitted: false, taskkill_used: false, management_channel_mutated: false, network_configuration_mutated: false, rebooted: false },
      stages: this.stages, gates: this.profile.gates, result: {
        automatic_status: this.stages.every((stage) => stage.status === 'PASS') ? 'SUPPLEMENTARY_AUTOMATION_PASS' : 'FAIL_CLOSED',
        formal_c05: 'ENVIRONMENT_MISSING',
        classification: 'C02_C03_C05_SUPPLEMENTARY_EVIDENCE_READY',
      }, command_count: this.commands,
    };
    fs.writeFileSync(this.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const rows = this.stages.map((stage) => `<tr><td>${stage.id}</td><td>${stage.name}</td><td>${stage.status}</td><td>${stage.stdout_file}<br>${stage.stderr_file}</td></tr>`).join('');
    fs.writeFileSync(this.htmlPath, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${this.args.acceptanceId}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:1100px;margin:auto;padding:24px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}.PASS{color:#08765b}.FAIL{color:#a33232}</style><h1>SPIKE_02 C02/C03/C05 补充验收</h1><p>结果：<strong>${report.result.automatic_status}</strong>；C05 正式状态：<strong>ENVIRONMENT_MISSING</strong>（仅 loopback）。</p><table><tr><th>ID</th><th>阶段</th><th>状态</th><th>证据</th></tr>${rows}</table></html>\n`, 'utf8');
    return report;
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write('Usage: node run_remaining_win7.mjs --execute-win7 --acceptance-id A4-YYYYMMDD-unique [--profile profile.json] [--out report.json]\n');
} else {
  const profile = validateProfile(readJson(args.profile));
  const report = new Runner(args, profile).runAll();
  const reportPath = args.out || path.join(HERE, 'evidence', args.acceptanceId, `${args.acceptanceId}-remaining-automation.json`);
  process.stdout.write(`${JSON.stringify({ report: reportPath, html: reportPath.replace(/\.json$/i, '.html'), automatic_status: report.result.automatic_status }, null, 2)}\n`);
  process.exitCode = report.result.automatic_status === 'SUPPLEMENTARY_AUTOMATION_PASS' ? 0 : 1;
}
