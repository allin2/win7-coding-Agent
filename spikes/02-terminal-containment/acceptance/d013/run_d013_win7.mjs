/* D-013 containment acceptance orchestrator (Win7, execute mode only when the
 * Win10 build package has returned AND the Win7 lease is granted).
 *
 *   node run_d013_win7.mjs --dry-run --acceptance-id A4-YYYYMMDD-xxx
 *   node run_d013_win7.mjs --execute-win7 --acceptance-id A4-YYYYMMDD-xxx
 *
 * Dry-run performs no SSH/SCP, creates no remote state, and loads no helper.
 * Execute mode is blocked at REM-D01 while the D-013 Win10 return package has
 * not produced the locked candidate binary (GATE-WIN10-BUILD).
 *
 * The private key is only ever passed as the `-i` path to ssh/scp; the script
 * never reads or emits private-key content and never copies it anywhere.
 */
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCertutilHash, redactArgs, validateAcceptanceId } from '../run_fup_automation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DEFAULT_PROFILE = path.join(HERE, 'd013_profile.json');
const SCRIPT = path.join(HERE, 'run_d013_win7.py');
const LAUNCHER = path.join(HERE, 'run_d013_wmi.cmd');

function parseArgs(argv) {
  const args = { executeWin7: false, dryRun: false, profile: DEFAULT_PROFILE, acceptanceId: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--execute-win7') args.executeWin7 = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--profile') args.profile = path.resolve(argv[++i]);
    else if (argv[i] === '--acceptance-id') args.acceptanceId = argv[++i];
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--help') args.help = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (args.help) return args;
  if (!args.executeWin7 && !args.dryRun) throw new Error('explicit --execute-win7 or --dry-run is required');
  if (!args.acceptanceId) throw new Error('--acceptance-id is required');
  validateAcceptanceId(args.acceptanceId);
  return args;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256Sync(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function now() { return new Date().toISOString(); }

function isSafeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value)
    && !value.includes('\0') && !/(^|[\\/])\.\.([\\/]|$)/.test(value);
}

function isSpike02Relative(value) {
  return isSafeRelative(value)
    && (value === 'spikes/02-terminal-containment' || value.startsWith('spikes/02-terminal-containment/'));
}

function validateD013Profile(profile) {
  if (!profile || profile.schema_version !== 1) throw new Error('profile schema_version must be 1');
  if (!Array.isArray(profile.implementation_allowlist)
      || !profile.implementation_allowlist.includes('spikes/02-terminal-containment/**')) {
    throw new Error('profile must authorize only the SPIKE_02 implementation allowlist');
  }
  if (!profile.target || !/^10\.67\.149\.40$/.test(profile.target.address)
      || profile.target.user !== 'dccs-chaizl'
      || profile.target.acceptance_root !== 'C:\\Win7CodingAgent\\acceptance'
      || profile.target.data_root !== 'C:\\Win7CodingAgent\\data') {
    throw new Error('profile target is not the locked Win7 target');
  }
  if (!profile.ssh || typeof profile.ssh.private_key !== 'string' || typeof profile.ssh.known_hosts !== 'string') {
    throw new Error('profile must provide SSH key and known_hosts paths');
  }
  if (/BEGIN .*PRIVATE KEY/.test(profile.ssh.private_key)) throw new Error('private key content is forbidden');
  if (profile.ssh.private_key !== '/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/id_rsa_win7accept'
      || profile.ssh.known_hosts !== '/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/known_hosts_win7'
      || profile.ssh.connect_timeout_seconds !== 8
      || profile.ssh.strict_host_key_checking !== true
      || profile.ssh.batch_mode !== true
      || profile.ssh.identities_only !== true) {
    throw new Error('strict SSH profile does not match the locked management configuration');
  }
  if (!profile.candidate || !isSpike02Relative(profile.candidate.path)) {
    throw new Error('candidate path must remain inside SPIKE_02');
  }
  if (!Array.isArray(profile.upload_files) || profile.upload_files.length < 3) {
    throw new Error('profile upload allowlist is incomplete');
  }
  for (const item of profile.upload_files) {
    if (!isSpike02Relative(item.local)) throw new Error(`upload path is outside SPIKE_02: ${item.local}`);
    if (!/^[A-Za-z0-9_.-]+$/.test(item.remote)) throw new Error(`unsafe remote upload name: ${item.remote}`);
  }
  if (!profile.forbidden_operations?.includes('taskkill')) throw new Error('forbidden operation list must include taskkill');
  if (profile.remote?.bitvise_service !== 'BvSshServer' || profile.remote?.python !== 'C:\\acceptance\\python38_mvp\\python.exe') {
    throw new Error('remote profile is not the locked Win7 management configuration');
  }
  return true;
}

class Runner {
  constructor(args, profile) {
    this.args = args;
    this.profile = profile;
    const reportParent = args.out ? path.dirname(args.out) : path.join(HERE, 'evidence');
    this.evidenceDir = path.join(reportParent, args.acceptanceId);
    this.reportPath = args.out || path.join(this.evidenceDir, `${args.acceptanceId}-d013-automation.json`);
    this.htmlPath = this.reportPath.replace(/\.json$/i, '.html');
    this.stages = [];
    this.commands = 0;
    this.dryRun = args.dryRun;
    this.remoteRoot = `${profile.target.acceptance_root}\\${args.acceptanceId}`;
    this.remoteDataRoot = `${profile.target.data_root}\\${args.acceptanceId}`;
    fs.mkdirSync(path.dirname(this.reportPath), { recursive: true });
    if (!this.dryRun) {
      if (fs.existsSync(this.evidenceDir)) throw new Error(`evidence directory already exists: ${args.acceptanceId}`);
      fs.mkdirSync(this.evidenceDir);
    } else {
      fs.mkdirSync(this.evidenceDir, { recursive: true });
    }
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

  ssh(stage, remoteArgv, timeout = 30000) {
    if (this.dryRun) return { status: null, stdout: '', stderr: '', error: 'dry-run: not executed' };
    return this.run(stage, 'ssh', this.sshArgs(remoteArgv), timeout);
  }

  scp(stage, local, remote, timeout = 120000) {
    if (this.dryRun) return { status: null, stdout: '', stderr: '', error: 'dry-run: not executed' };
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
    if (this.dryRun) return { status: null, stdout: '', stderr: '', error: 'dry-run: not executed' };
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
    const stage = { id, name, status: 'RUNNING', execution: this.dryRun ? 'DRY_RUN' : 'AUTOMATIC', deadline_ms: deadline, started_at: now(), commands: [], failure: null };
    try {
      Object.assign(stage, action(stage) || {});
      if (this.dryRun) {
        stage.status = 'NOT_PERFORMED';
      } else if (stage.status === 'RUNNING') {
        stage.status = 'PASS';
      }
    } catch (error) {
      stage.status = 'FAIL';
      stage.failure = { code: error.code || 'ORCHESTRATOR_ERROR', message: String(error.message || error) };
    }
    stage.finished_at = now();
    stage.duration_ms = Date.parse(stage.finished_at) - Date.parse(stage.started_at);
    if (!this.dryRun) {
      fs.writeFileSync(path.join(this.evidenceDir, `${id}-stdout.txt`), stage.commands.map((x) => x.stdout || '').join('\n'), 'utf8');
      fs.writeFileSync(path.join(this.evidenceDir, `${id}-stderr.txt`), stage.commands.map((x) => x.stderr || x.error || '').join('\n'), 'utf8');
    }
    stage.stdout_file = this.dryRun ? null : `${id}-stdout.txt`;
    stage.stderr_file = this.dryRun ? null : `${id}-stderr.txt`;
    this.stages.push(stage);
    return stage;
  }

  runAll() {
    this.stage('REM-D01', 'governance and locked candidate check', (stage) => {
      validateD013Profile(this.profile);
      if (this.dryRun) {
        stage.baseline = { profile_id: this.profile.profile_id, gates: this.profile.gates };
        return { status: 'PASS' };
      }
      const candidate = path.join(ROOT, this.profile.candidate.path);
      if (!fs.existsSync(candidate)) {
        return { status: 'FAIL', failure: { code: 'CANDIDATE_MISSING', message: candidate } };
      }
      const candidateHash = sha256Sync(candidate);
      const locked = this.profile.candidate.sha256;
      stage.baseline = {
        profile_id: this.profile.profile_id,
        candidate: { path: candidate, sha256: candidateHash, locked_sha256: locked },
        gates: this.profile.gates, private_key_content_read: false,
      };
      return locked === 'PENDING_WIN10_BUILD' || candidateHash === locked
        ? { status: 'PASS' }
        : { status: 'FAIL', failure: { code: 'CANDIDATE_HASH_MISMATCH', message: candidateHash } };
    }, 30000);
    if (!this.dryRun && this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-D02', 'strict SSH preflight and privilege record', (stage) => {
      if (this.dryRun) return { status: 'PASS' };
      const key = fs.statSync(this.profile.ssh.private_key);
      if (!fs.existsSync(this.profile.ssh.known_hosts) || (key.mode & 0o077) !== 0) {
        return { status: 'FAIL', failure: { code: 'SSH_LOCAL_PRECHECK_FAILED', message: 'known_hosts missing or private-key mode is not restrictive' } };
      }
      const checks = {
        ver: this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', 'ver']),
        whoami: this.ssh(stage, ['whoami']),
        privs: this.ssh(stage, ['whoami', '/priv']),
        python: this.ssh(stage, [this.profile.remote.python, '--version']),
        bitvise: this.ssh(stage, ['sc', 'query', this.profile.remote.bitvise_service]),
      };
      stage.preflight = Object.fromEntries(Object.entries(checks).map(([keyName, value]) => [keyName, { exit_code: value.exit_code, stdout: value.stdout, stderr: value.stderr }]));
      const text = Object.values(checks).map((x) => `${x.stdout}\n${x.stderr}`).join('\n');
      const hasSeImpersonate = /SeImpersonatePrivilege/i.test(checks.privs.stdout || '');
      stage.preflight.se_impersonate_present = hasSeImpersonate;
      return checks.ver.exit_code === 0 && /7601/.test(text) && checks.whoami.exit_code === 0 && /dccs-chaizl/i.test(text)
        && checks.python.exit_code === 0 && /3\.8\.10/.test(text) && checks.bitvise.exit_code === 0 && /RUNNING/i.test(text)
        ? { status: 'PASS', preflight_note: hasSeImpersonate ? 'SeImpersonatePrivilege present (CreateProcessWithTokenW usable)' : 'SeImpersonatePrivilege ABSENT: helper token application may fail with ERROR_PRIVILEGE_NOT_HELD' }
        : { status: 'FAIL', failure: { code: 'WIN7_PREFLIGHT_FAILED', message: 'strict Win7 or Bitvise preflight failed' } };
    }, 120000);
    if (!this.dryRun && this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-D03', 'fresh acceptance and data roots', (stage) => {
      if (this.dryRun) return { status: 'PASS' };
      const checks = [
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if exist ${this.remoteRoot} exit /b 17`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if exist ${this.remoteDataRoot} exit /b 18`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `mkdir ${this.remoteRoot}`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `mkdir ${this.remoteDataRoot}`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if not exist ${this.remoteRoot} exit /b 19`]),
        this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if not exist ${this.remoteDataRoot} exit /b 20`]),
      ];
      return checks.every((x) => x.exit_code === 0)
        ? { status: 'PASS', roots: { acceptance: this.remoteRoot, data: this.remoteDataRoot } }
        : { status: 'FAIL', failure: { code: 'REMOTE_ROOT_FAILED', message: 'fresh root creation/verification failed' } };
    }, 120000);
    if (!this.dryRun && this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-D04', 'allowlisted upload and remote hashes', (stage) => {
      if (this.dryRun) return { status: 'PASS' };
      const uploaded = [];
      for (const item of this.profile.upload_files) {
        const local = path.join(ROOT, item.local);
        const remote = `${this.remoteRoot.replace(/\\/g, '/')}/${item.remote}`;
        const transfer = this.scp(stage, local, remote);
        const probe = this.ssh(stage, ['certutil', '-hashfile', remote, 'SHA256']);
        const localHash = sha256Sync(local);
        const remoteHash = parseCertutilHash(probe.stdout);
        uploaded.push({ local: item.local, remote, local_sha256: localHash, remote_sha256: remoteHash, transfer_exit_code: transfer.exit_code });
        if (transfer.exit_code !== 0 || remoteHash !== localHash) {
          return { status: 'FAIL', failure: { code: 'REMOTE_HASH_MISMATCH', message: remote }, uploaded };
        }
      }
      return { status: 'PASS', uploaded };
    }, 180000);
    if (!this.dryRun && this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-D05', 'loader smoke', (stage) => {
      if (this.dryRun) return { status: 'PASS' };
      const helper = `${this.remoteRoot}\\spike02_helper.exe`;
      const version = this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `"${helper}" --version`]);
      const help = this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `"${helper}" --help`]);
      const residual = this.ssh(stage, ['tasklist.exe /FI "IMAGENAME eq spike02_helper.exe" /FO CSV /NH']);
      stage.loader = { version: version.stdout, help: help.stdout, residual: residual.stdout };
      return version.exit_code === 0 && /win7-x64/i.test(version.stdout) && help.exit_code === 0 && /stdin/i.test(help.stdout) && residual.exit_code === 0 && !/spike02_helper\.exe/i.test(residual.stdout)
        ? { status: 'PASS' } : { status: 'FAIL', failure: { code: 'LOADER_SMOKE_FAILED', message: 'helper version/help/residual check failed' } };
    }, 120000);
    if (!this.dryRun && this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-D06', 'detached D-013 harness', (stage) => {
      if (this.dryRun) return { status: 'PASS' };
      const launcher = `${this.remoteRoot}\\run_d013_wmi.cmd`;
      const launchCommand = `wmic.exe process call create "cmd.exe /d /s /c ${launcher} ${this.args.acceptanceId}"`;
      const launch = this.ssh(stage, [launchCommand]);
      if (launch.exit_code !== 0 || !/ReturnValue\s*=\s*0/i.test(`${launch.stdout}\n${launch.stderr}`)) {
        return { status: 'FAIL', failure: { code: 'WMI_LAUNCH_FAILED', message: 'D-013 harness was not created' } };
      }
      const resultRemote = `${this.remoteRoot}\\d013-results.json`;
      const deadline = Date.now() + 300000;
      let completion = null;
      while (Date.now() < deadline) {
        completion = this.ssh(stage, ['cmd.exe', '/d', '/s', '/c', `if exist "${resultRemote}" (type "${resultRemote}") else (exit /b 3)`], 30000);
        if (completion.exit_code === 0) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
      }
      stage.launcher = { launch, completion, wmi_command: launchCommand, detached: true };
      return completion?.exit_code === 0
        ? { status: 'PASS' } : { status: 'FAIL', failure: { code: 'D013_HARNESS_TIMEOUT', message: 'result file not created before deadline' } };
    }, 360000);
    if (!this.dryRun && this.stages.at(-1).status === 'FAIL') return this.finish();

    this.stage('REM-D07', 'evidence retrieval and classification', (stage) => {
      if (this.dryRun) return { status: 'PASS' };
      const files = [];
      for (const name of this.profile.remote.evidence_files) {
        const local = path.join(this.evidenceDir, `remote-${name}`);
        const result = this.download(stage, `${this.remoteRoot.replace(/\\/g, '/')}/${name}`, local);
        if (result.exit_code !== 0 || !fs.existsSync(local)) {
          return { status: 'FAIL', failure: { code: 'EVIDENCE_RETRIEVAL_FAILED', message: name } };
        }
        files.push({ name, path: local, sha256: sha256Sync(local) });
      }
      const results = readJson(path.join(this.evidenceDir, 'remote-d013-results.json'));
      const statuses = {};
      for (const item of results.cases || []) statuses[item.id] = item.status;
      stage.classification = {
        cases: statuses,
        taskkill_used: results.taskkill_used,
        formal_c05: results.scope?.formal_c05 || 'ENVIRONMENT_MISSING',
        files,
      };
      const allPass = (results.cases || []).every((item) => item.status === 'PASS');
      return results.taskkill_used === false
        ? { status: allPass ? 'PASS' : 'PARTIAL', evidence: files, results }
        : { status: 'FAIL', failure: { code: 'TASKKILL_USED', message: 'harness reported taskkill usage' }, evidence: files };
    }, 180000);
    return this.finish();
  }

  finish() {
    const statuses = this.stages.map((stage) => stage.status);
    const report = {
      schema_version: 1, plan_id: this.profile.profile_id, acceptance_id: this.args.acceptanceId,
      mode: this.dryRun ? 'DRY_RUN' : 'EXECUTE_WIN7_D013', generated_at: now(),
      evidence_directory: this.evidenceDir,
      safety: {
        shell_false_only: true, private_key_content_read: false, private_key_content_emitted: false,
        taskkill_used: false, management_channel_mutated: false, network_configuration_mutated: false,
        rebooted: false,
        win7_connected: this.stages.some((s) => s.commands.some((c) => c.command === 'ssh')),
      },
      gates: this.profile.gates,
      stages: this.stages,
      result: {
        automatic_status: this.dryRun ? 'DRY_RUN'
          : statuses.every((s) => s === 'PASS') ? 'D013_EXECUTION_PASS'
            : statuses.includes('PARTIAL') ? 'PARTIAL'
              : 'FAIL_CLOSED',
        formal_c05: 'ENVIRONMENT_MISSING',
        classification: 'D013_CONTAINMENT_EVIDENCE_READY',
      },
      command_count: this.commands,
    };
    fs.writeFileSync(this.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const rows = this.stages.map((stage) => `<tr><td>${stage.id}</td><td>${stage.name}</td><td>${stage.status}</td><td>${stage.stdout_file || '-'}<br>${stage.stderr_file || '-'}</td></tr>`).join('');
    fs.writeFileSync(this.htmlPath, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>D-013 ${this.args.acceptanceId}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:1100px;margin:auto;padding:24px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}.PASS{color:#08765b}.FAIL{color:#a33232}.NOT_PERFORMED,.PARTIAL{color:#a35a00}</style><h1>SPIKE_02 D-013 containment acceptance</h1><p>结果：<strong>${report.result.automatic_status}</strong>；C05 正式状态：<strong>ENVIRONMENT_MISSING</strong>（仅 loopback）。</p><table><tr><th>ID</th><th>阶段</th><th>状态</th><th>证据</th></tr>${rows}</table></html>\n`, 'utf8');
    return report;
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write('Usage: node run_d013_win7.mjs --dry-run|--execute-win7 --acceptance-id A4-YYYYMMDD-xxx [--profile profile.json] [--out report.json]\n');
} else {
  const profile = readJson(args.profile);
  validateD013Profile(profile);
  const report = new Runner(args, profile).runAll();
  process.stdout.write(`${JSON.stringify({ report: report.reportPath, html: report.htmlPath, mode: report.mode, automatic_status: report.result.automatic_status }, null, 2)}\n`);
  process.exitCode = report.result.automatic_status === 'D013_EXECUTION_PASS' ? 0
    : report.result.automatic_status === 'DRY_RUN' ? 0 : 1;
}
