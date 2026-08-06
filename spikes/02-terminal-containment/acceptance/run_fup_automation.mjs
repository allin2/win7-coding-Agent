/*
 * AUTO-FUP-20260805-01: A4 follow-up acceptance orchestrator.
 *
 * This is an acceptance-only coordinator. It never changes product code,
 * network configuration, services, startup items, firewall rules or the
 * management connection. Remote commands are fixed by the profile and are
 * passed to child_process with shell=false. A dry run never invokes ssh/scp.
 */
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DEFAULT_PROFILE = path.join(HERE, 'fup_safe_profile.json');
const DEFAULT_ACCEPTANCE_ID = `A4-${utcStamp()}-${process.pid}`;
const ALLOWED_ROOT = path.join(ROOT, 'spikes', '02-terminal-containment');
const REQUIRED_DOCS = [
  'AGENTS.md',
  'docs/WIN7_CONSTRAINTS.md',
  'docs/tasks/SPIKE_02_TERMINAL_CONTAINMENT.md',
  'docs/tasks/MVP_01_WIN7_REAL_MACHINE_ACCEPTANCE.md',
  'docs/tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md',
  'docs/STATUS.md',
];
const SOURCE_HASH_FILES = REQUIRED_DOCS.concat([
  'docs/status/latest-validation.json',
  'spikes/02-terminal-containment/README.md',
  'spikes/02-terminal-containment/helper/helper.cpp',
  'spikes/02-terminal-containment/helper/helper.h',
  'spikes/02-terminal-containment/helper/CMakeLists.txt',
]);
const AUTO_IDS = ['AUTO-00', 'AUTO-01', 'AUTO-02', 'AUTO-03', 'AUTO-04', 'AUTO-05', 'AUTO-06', 'AUTO-07'];
const LOCKED_CANDIDATE_SHA = '733f549181228273afd65817b6448be1cc4beb888f8bf2caa294e4e1299ceecc';
const LOCKED_FAULT_SHA = '0edb20c94fe5a03a9a461a48c7144e07bd171b2b9591c1c8d4863b659a197d3f';
const LOCKED_ORCHESTRATION_HEAD = '008677e88a638d98cee5eb7e3d7aeeeed135ef51';
const LOCKED_SOURCE_HEAD = 'b2019f022f910b2b8df150ad94c3bccdefa1fa7b';
const LOCKED_SOURCE_WORKTREE = '/Users/qlyf/.codex/worktrees/e36c/win7-coding-Agent';
const LOCKED_SOURCE_SNAPSHOT_REF = 'refs/codex/snapshots/49c20af08ab9c062dc484daf89616393fd5c730d';
const LOCKED_SOURCE_SNAPSHOT_COMMIT = '3445ed4164fa58a2deded29ec5403eed8646715a';
const LOCKED_A3_WORKTREE = '/Users/qlyf/.codex/worktrees/5b96/win7-coding-Agent';
const LOCKED_A3_HEAD = '5ac70da6b4d7b810503e704fd3e4038ae0190346';
const LOCKED_MODULE_DIRS = ['src/core', 'src/gateway', 'src/git-adapter', 'src/runner', 'src/shell', 'src/state', 'src/workspace'];
const REQUIRED_FORBIDDEN = ['taskkill', 'shutdown', 'restart', 'reboot', 'netsh', 'route', 'firewall', 'sc config', 'sc stop', 'sc delete', 'startup', 'proxy', 'Set-NetIPInterface'];

function utcStamp() {
  const now = new Date();
  return now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function now() { return new Date().toISOString(); }

function parseArgs(argv) {
  const args = { dryRun: false, executeWin7: false, profile: DEFAULT_PROFILE, out: null, acceptanceId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--dry-run') args.dryRun = true;
    else if (value === '--execute-win7') args.executeWin7 = true;
    else if (value === '--profile') args.profile = path.resolve(argv[++i]);
    else if (value === '--out') args.out = path.resolve(argv[++i]);
    else if (value === '--acceptance-id') args.acceptanceId = argv[++i];
    else if (value === '--help') args.help = true;
    else throw new Error(`unknown argument: ${value}`);
  }
  if (args.help) return args;
  if (args.dryRun === args.executeWin7) {
    throw new Error('choose exactly one of --dry-run or --execute-win7');
  }
  args.acceptanceId = args.acceptanceId || DEFAULT_ACCEPTANCE_ID;
  validateAcceptanceId(args.acceptanceId);
  return args;
}

function validateAcceptanceId(value) {
  if (!/^A4-[0-9]{8}-[0-9]{6,}$/.test(value)) {
    throw new Error('acceptance ID must match A4-YYYYMMDD-unique-sequence');
  }
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  const digest = crypto.createHash('sha256');
  const stream = fs.createReadStream(file);
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(digest.digest('hex')));
  });
}

function sha256Sync(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isSafeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value)
    && !value.includes('\0') && !/(^|[\\/])\.\.([\\/]|$)/.test(value);
}

function isInside(base, candidate) {
  const relative = path.relative(path.resolve(base), path.resolve(candidate));
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function isSpike02Relative(value) {
  return isSafeRelative(value)
    && (value === 'spikes/02-terminal-containment' || value.startsWith('spikes/02-terminal-containment/'));
}

function resolveRepoPath(relative) {
  if (!isSafeRelative(relative)) throw new Error(`unsafe repository path: ${relative}`);
  const resolved = path.resolve(ROOT, relative);
  if (!isInside(ALLOWED_ROOT, resolved) && relative !== 'AGENTS.md') {
    return resolved;
  }
  return resolved;
}

function redactArgs(argv) {
  const result = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '-i' && i + 1 < argv.length) {
      result.push('-i', '<private-key-path>');
      i += 1;
    } else if (typeof argv[i] === 'string' && /BEGIN (RSA|OPENSSH|EC) PRIVATE KEY/.test(argv[i])) {
      result.push('<private-key-content-redacted>');
    } else {
      result.push(argv[i]);
    }
  }
  return result;
}

function validateProfile(profile) {
  if (!profile || profile.schema_version !== 1) throw new Error('profile schema_version must be 1');
  if (!Array.isArray(profile.implementation_allowlist)
      || !profile.implementation_allowlist.includes('spikes/02-terminal-containment/**')) {
    throw new Error('profile must authorize only the SPIKE_02 implementation allowlist');
  }
  if (!profile.target || !/^10\.67\.149\.40$/.test(profile.target.address)
      || profile.target.user !== 'dccs-chaizl'
      || profile.target.acceptance_root !== 'C:\\Win7CodingAgent\\acceptance'
      || profile.target.data_root !== 'C:\\Win7CodingAgent\\data') {
    throw new Error('profile target address is not the locked Win7 target');
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
  if (profile.orchestration_head !== LOCKED_ORCHESTRATION_HEAD
      || profile.source_head !== LOCKED_SOURCE_HEAD
      || profile.source_worktree !== LOCKED_SOURCE_WORKTREE
      || profile.source_snapshot_ref !== LOCKED_SOURCE_SNAPSHOT_REF
      || profile.source_snapshot_commit !== LOCKED_SOURCE_SNAPSHOT_COMMIT
      || profile.a3_worktree !== LOCKED_A3_WORKTREE
      || profile.a3_head !== LOCKED_A3_HEAD) {
    throw new Error('orchestration, A4 source or A3 baseline is not the locked profile');
  }
  if (!isSpike02Relative(profile.reference_plan)) {
    throw new Error('reference plan must remain inside SPIKE_02');
  }
  if (!/^[a-f0-9]{64}$/.test(profile.reference_plan_sha256 || '')) throw new Error('reference plan SHA-256 is invalid');
  if (!isSpike02Relative(profile.package_manifest)
      || !/^[a-f0-9]{64}$/.test(profile.package_manifest_sha256 || '')) {
    throw new Error('package manifest path or SHA-256 is invalid');
  }
  for (const artifact of [profile.artifacts?.candidate, profile.artifacts?.fault_helper]) {
    if (!artifact || !isSafeRelative(artifact.path) || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
      throw new Error('artifact profile has an unsafe path or invalid SHA-256');
    }
    if (!isSpike02Relative(artifact.path)) throw new Error('artifact is outside SPIKE_02');
  }
  if (profile.artifacts.candidate.sha256 !== LOCKED_CANDIDATE_SHA || profile.artifacts.fault_helper.sha256 !== LOCKED_FAULT_SHA) {
    throw new Error('artifact SHA-256 does not match the locked A4 profile');
  }
  if (!Array.isArray(profile.upload_files) || profile.upload_files.length < 5) {
    throw new Error('profile upload allowlist is incomplete');
  }
  for (const item of profile.upload_files) {
    if (!isSpike02Relative(item.local)) {
      throw new Error(`upload path is outside SPIKE_02: ${item.local}`);
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(item.remote)) throw new Error(`unsafe remote upload name: ${item.remote}`);
  }
  if (JSON.stringify(profile.module_dirs) !== JSON.stringify(LOCKED_MODULE_DIRS)) throw new Error('module directory profile is not the locked seven-module set');
  if (!REQUIRED_FORBIDDEN.every((item) => profile.forbidden_operations?.includes(item))) throw new Error('forbidden operation guard list is incomplete');
  if (profile.remote?.bitvise_service !== 'BvSshServer' || profile.remote?.python !== 'C:\\acceptance\\python38_mvp\\python.exe' || profile.remote?.launcher !== 'run_a4_wmi.cmd') {
    throw new Error('remote launcher profile is not locked');
  }
  return profile;
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function peInfo(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 0x40 || buffer.toString('ascii', 0, 2) !== 'MZ') return { is_pe: false, reason: 'missing MZ' };
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 6 > buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    return { is_pe: false, reason: 'missing PE signature' };
  }
  const machine = buffer.readUInt16LE(peOffset + 4);
  return { is_pe: true, machine: `0x${machine.toString(16)}`, x64: machine === 0x8664, size: buffer.length };
}

function parseCertutilHash(stdout) {
  const text = String(stdout);
  const compact = text.match(/\b[a-f0-9]{64}\b/i);
  if (compact) return compact[0].toLowerCase();
  const spaced = text.match(/\b(?:[a-f0-9]{2}[ \t\r\n]+){31}[a-f0-9]{2}\b/i);
  return spaced ? spaced[0].replace(/\s+/g, '').toLowerCase() : null;
}

function commandHasForbiddenOperation(command, argv, forbidden) {
  const joined = [command].concat(argv).join(' ').toLowerCase();
  return forbidden.some((value) => joined.includes(String(value).toLowerCase()));
}

function usage() {
  return [
    'Usage: node run_fup_automation.mjs --dry-run [options]',
    '       node run_fup_automation.mjs --execute-win7 [options]',
    '',
    'Options: --profile FILE --acceptance-id A4-YYYYMMDD-unique --out FILE',
    '         --help',
  ].join('\n');
}

class Orchestrator {
  constructor(args, profile) {
    this.args = args;
    this.profile = profile;
    const reportParent = args.out ? path.dirname(args.out) : path.join(HERE, 'evidence');
    this.evidenceDir = path.join(reportParent, args.acceptanceId);
    this.reportPath = args.out || path.join(this.evidenceDir, `${args.acceptanceId}-automation.json`);
    this.htmlPath = this.reportPath.replace(/\.json$/i, '.html');
    this.stages = [];
    this.blocked = false;
    this.remoteRoot = null;
    this.remoteDataRoot = null;
    this.recoveredFiles = new Map();
    this.commands = 0;
    fs.mkdirSync(reportParent, { recursive: true });
    try {
      fs.mkdirSync(this.evidenceDir);
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error(`acceptance ID evidence directory already exists: ${args.acceptanceId}`);
      throw error;
    }
  }

  addStage(id, name, execution, action) {
    const stage = {
      id, name, execution, status: 'RUNNING', deadline_ms: this.profile.stage_deadlines_ms[id],
      started_at: now(), commands: [], evidence: [], failure: null,
    };
    this.stages.push(stage);
    try {
      const result = action(stage) || {};
      stage.status = result.status || 'PASS';
      Object.assign(stage, result);
    } catch (error) {
      stage.status = 'FAIL';
      stage.failure = { code: error.code || 'ORCHESTRATOR_ERROR', message: String(error.message || error) };
    }
    stage.finished_at = now();
    stage.duration_ms = Math.max(0, Date.parse(stage.finished_at) - Date.parse(stage.started_at));
    this.writeStageOutput(stage);
    if (stage.status === 'FAIL' || stage.status === 'ENVIRONMENT_MISSING') this.blocked = true;
    return stage;
  }

  skipStage(id, name, execution, reason, status = 'NOT_PERFORMED') {
    const stage = {
      id, name, execution, status, deadline_ms: this.profile.stage_deadlines_ms[id],
      started_at: now(), finished_at: now(), duration_ms: 0,
      commands: [{ command: 'NOT_EXECUTED', argv: [], exit_code: null, stdout: '', stderr: reason, shell: false }], evidence: [],
      failure: { code: 'FAIL_CLOSED', message: reason },
    };
    this.stages.push(stage);
    this.writeStageOutput(stage);
    return stage;
  }

  writeStageOutput(stage) {
    const base = path.join(this.evidenceDir, `${stage.id}`);
    fs.writeFileSync(`${base}-stdout.txt`, stage.commands.map((item) => item.stdout || '').join('\n'), 'utf8');
    fs.writeFileSync(`${base}-stderr.txt`, stage.commands.map((item) => item.stderr || item.error || '').join('\n'), 'utf8');
    stage.stdout_file = `${stage.id}-stdout.txt`;
    stage.stderr_file = `${stage.id}-stderr.txt`;
  }

  capture(stage, command, argv, options = {}) {
    if (commandHasForbiddenOperation(command, argv, this.profile.forbidden_operations || [])) {
      throw new Error(`forbidden operation detected before execution: ${command}`);
    }
    const started = Date.now();
    const limit = Math.min(options.timeout_ms || this.profile.stage_deadlines_ms[stage.id] || 30000, 30 * 60 * 1000);
    let result;
    try {
      result = spawnSync(command, argv, {
        cwd: options.cwd || ROOT,
        env: options.env || process.env,
        shell: false,
        windowsHide: true,
        encoding: 'utf8',
        timeout: limit,
        maxBuffer: options.max_buffer || 32 * 1024 * 1024,
      });
    } catch (error) {
      result = { status: null, signal: null, stdout: '', stderr: '', error };
    }
    const commandRecord = {
      command, argv: redactArgs(argv), exit_code: result.status,
      signal: result.signal || null, stdout: result.stdout || '', stderr: result.stderr || '',
      error: result.error ? String(result.error.message || result.error) : null,
      duration_ms: Date.now() - started, shell: false,
    };
    stage.commands.push(commandRecord);
    this.commands += 1;
    return commandRecord;
  }

  readSnapshotBlob(stage, relative) {
    if (!isSpike02Relative(relative) && !SOURCE_HASH_FILES.includes(relative)) throw new Error(`unsafe snapshot path: ${relative}`);
    const argv = ['show', `${this.profile.source_snapshot_commit}:${relative}`];
    const started = Date.now();
    const result = spawnSync('git', argv, {
      cwd: ROOT, shell: false, windowsHide: true, encoding: null,
      timeout: this.profile.stage_deadlines_ms[stage.id], maxBuffer: 64 * 1024 * 1024,
    });
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0);
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr || '');
    stage.commands.push({
      command: 'git', argv, exit_code: result.status, signal: result.signal || null,
      stdout: result.status === 0 ? `<snapshot blob ${stdout.length} bytes>` : '', stderr,
      error: result.error ? String(result.error.message || result.error) : null,
      duration_ms: Date.now() - started, shell: false,
    });
    this.commands += 1;
    if (result.status !== 0 || result.error) throw new Error(`cannot read locked snapshot blob: ${relative}`);
    return stdout;
  }

  materializeSnapshotFile(stage, relative) {
    if (this.recoveredFiles.has(relative)) return this.recoveredFiles.get(relative);
    const outputDir = path.join(this.evidenceDir, 'snapshot-package');
    fs.mkdirSync(outputDir, { recursive: true });
    const output = path.join(outputDir, path.basename(relative));
    const blob = this.readSnapshotBlob(stage, relative);
    fs.writeFileSync(output, blob, { flag: 'wx' });
    this.recoveredFiles.set(relative, output);
    stage.evidence.push(path.relative(this.evidenceDir, output));
    return output;
  }

  synthetic(stage, label, status, detail) {
    stage.commands.push({ command: label, argv: [], exit_code: status === 'PASS' ? 0 : null, stdout: '', stderr: '', shell: false, detail });
    this.commands += 1;
    return stage.commands[stage.commands.length - 1];
  }

  sshArgs(remoteArgv) {
    const target = `${this.profile.target.user}@${this.profile.target.address}`;
    return [
      '-i', this.profile.ssh.private_key,
      '-o', 'IdentitiesOnly=yes',
      '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${this.profile.ssh.connect_timeout_seconds}`,
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${this.profile.ssh.known_hosts}`,
      target,
    ].concat(remoteArgv);
  }

  remote(stage, remoteArgv, options = {}) {
    return this.capture(stage, 'ssh', this.sshArgs(remoteArgv), options);
  }

  scpUpload(stage, local, remote) {
    const target = `${this.profile.target.user}@${this.profile.target.address}:${remote}`;
    const args = [
      '-i', this.profile.ssh.private_key,
      '-o', 'IdentitiesOnly=yes',
      '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${this.profile.ssh.connect_timeout_seconds}`,
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${this.profile.ssh.known_hosts}`,
      local, target,
    ];
    return this.capture(stage, 'scp', args, { timeout_ms: this.profile.stage_deadlines_ms[stage.id] });
  }

  scpDownload(stage, remote, local) {
    const source = `${this.profile.target.user}@${this.profile.target.address}:${remote}`;
    const args = [
      '-i', this.profile.ssh.private_key,
      '-o', 'IdentitiesOnly=yes',
      '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=${this.profile.ssh.connect_timeout_seconds}`,
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${this.profile.ssh.known_hosts}`,
      source, local,
    ];
    return this.capture(stage, 'scp', args, { timeout_ms: this.profile.stage_deadlines_ms[stage.id] });
  }

  localPath(relative) { return path.resolve(ROOT, relative); }

  stage00() {
    return this.addStage('AUTO-00', 'governance and dirty-worktree fingerprint', 'AUTOMATIC', (stage) => {
      const orchestrationHead = this.capture(stage, 'git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD']);
      const orchestrationBase = this.capture(stage, 'git', ['merge-base', '--is-ancestor', this.profile.orchestration_head, 'HEAD']);
      const orchestrationStatus = this.capture(stage, 'git', ['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--branch']);
      const snapshotCommit = this.capture(stage, 'git', ['-c', 'core.fsmonitor=false', 'rev-parse', `${this.profile.source_snapshot_ref}^{commit}`]);
      const snapshotParent = this.capture(stage, 'git', ['show', '-s', '--format=%P', this.profile.source_snapshot_commit]);
      const a3Head = this.capture(stage, 'git', ['-C', this.profile.a3_worktree, '-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD']);
      const a3Status = this.capture(stage, 'git', ['-C', this.profile.a3_worktree, '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--branch']);
      const sourceHashes = {};
      for (const relative of SOURCE_HASH_FILES) {
        const blob = this.readSnapshotBlob(stage, relative);
        sourceHashes[relative] = crypto.createHash('sha256').update(blob).digest('hex');
      }
      const planBlob = this.readSnapshotBlob(stage, this.profile.reference_plan);
      const planHash = crypto.createHash('sha256').update(planBlob).digest('hex');
      const manifestBlob = this.readSnapshotBlob(stage, this.profile.package_manifest);
      const manifestHash = crypto.createHash('sha256').update(manifestBlob).digest('hex');
      const manifestSourceHead = manifestHash === this.profile.package_manifest_sha256
        ? JSON.parse(manifestBlob.toString('utf8')).source_head : null;
      const sourceHashBinding = snapshotCommit.exit_code === 0
        && snapshotCommit.stdout.trim() === this.profile.source_snapshot_commit
        && snapshotParent.exit_code === 0
        && snapshotParent.stdout.trim().split(/\s+/).includes(this.profile.source_head)
        && planHash === this.profile.reference_plan_sha256
        && manifestHash === this.profile.package_manifest_sha256
        && manifestSourceHead === this.profile.source_head;
      const cleanEnough = orchestrationHead.exit_code === 0 && orchestrationBase.exit_code === 0 && a3Head.exit_code === 0
        && sourceHashBinding
        && a3Head.stdout.trim() === this.profile.a3_head
        && planHash === this.profile.reference_plan_sha256;
      stage.baseline = {
        orchestration_worktree: ROOT, orchestration_head: orchestrationHead.stdout.trim(),
        orchestration_base_head: this.profile.orchestration_head,
        orchestration_base_is_ancestor: orchestrationBase.exit_code === 0,
        orchestration_git_status: orchestrationStatus.stdout,
        archived_source_worktree: this.profile.source_worktree, source_head: manifestSourceHead,
        expected_source_head: this.profile.source_head,
        source_snapshot_ref: this.profile.source_snapshot_ref,
        source_snapshot_commit: snapshotCommit.stdout.trim(),
        expected_source_snapshot_commit: this.profile.source_snapshot_commit,
        source_snapshot_parent: snapshotParent.stdout.trim(),
        source_binding: sourceHashBinding ? 'PROTECTED_GIT_SNAPSHOT_PARENT_AND_EXACT_HASHES' : 'UNBOUND',
        a3_worktree: this.profile.a3_worktree, a3_head: a3Head.stdout.trim(),
        expected_a3_head: this.profile.a3_head, a3_status: a3Status.stdout,
        source_hashes: sourceHashes, reference_plan: `${this.profile.source_snapshot_commit}:${this.profile.reference_plan}`,
        reference_plan_sha256: planHash, expected_reference_plan_sha256: this.profile.reference_plan_sha256,
        package_manifest: `${this.profile.source_snapshot_commit}:${this.profile.package_manifest}`,
        package_manifest_sha256: manifestHash,
        expected_package_manifest_sha256: this.profile.package_manifest_sha256,
        manifest_source_head: manifestSourceHead,
        dirty_worktrees_preserved: true,
        protected_operations: { branch_switch: false, staging: false, commit: false, push: false },
      };
      return cleanEnough
        ? { status: 'PASS' }
        : { status: 'FAIL', failure: { code: 'BASELINE_MISMATCH', message: 'orchestration base ancestry, read-only A4 source, A3 baseline or reference plan hash does not match the locked profile' } };
    });
  }

  stage01() {
    return this.addStage('AUTO-01', 'macOS deterministic regression', 'AUTOMATIC', (stage) => {
      const missing = this.profile.module_dirs.filter((relative) => !fs.existsSync(path.join(ROOT, relative, 'node_modules')));
      this.synthetic(stage, 'dependency-probe', missing.length ? 'ENVIRONMENT_MISSING' : 'PASS', { missing });
      if (missing.length) return { status: 'ENVIRONMENT_MISSING', failure: { code: 'DEPENDENCY_MISSING', message: missing.join(', ') } };
      const docs = this.capture(stage, 'npm', ['run', 'docs:check'], { cwd: ROOT, timeout_ms: 10 * 60 * 1000 });
      const verify = this.capture(stage, 'npm', ['run', 'verify'], { cwd: ROOT, timeout_ms: 25 * 60 * 1000 });
      return docs.exit_code === 0 && verify.exit_code === 0
        ? { status: 'PASS', classification: 'DEVELOPMENT_PASS_NOT_WIN7_EVIDENCE' }
        : { status: 'FAIL', failure: { code: 'DEVELOPMENT_CHECK_FAILED', message: 'docs:check or npm verify failed' } };
    });
  }

  stage02() {
    return this.addStage('AUTO-02', 'candidate integrity and package closure', 'AUTOMATIC', (stage) => {
      const manifestPath = this.materializeSnapshotFile(stage, this.profile.package_manifest);
      const manifestHash = sha256Sync(manifestPath);
      const manifest = readJson(manifestPath);
      let manifestPass = manifestHash === this.profile.package_manifest_sha256
        && manifest.schema_version === 1
        && manifest.source_head === this.profile.source_head
        && manifest.load_status === 'WIN7_LOAD_VERIFIED_FOR_EXACT_SHA256';
      const checks = [];
      for (const [label, item] of Object.entries(this.profile.artifacts)) {
        const file = this.materializeSnapshotFile(stage, item.path);
        const present = fs.existsSync(file);
        const actual = present ? sha256Sync(file) : null;
        const pe = present ? peInfo(file) : null;
        checks.push({ label, path: file, present, expected_sha256: item.sha256, actual_sha256: actual, pe });
      }
      for (const [name, item] of Object.entries(manifest.files || {})) {
        const relative = path.posix.join(path.posix.dirname(this.profile.package_manifest), name);
        const file = this.materializeSnapshotFile(stage, relative);
        const actual = sha256Sync(file);
        item.actual_sha256 = actual;
        if (actual !== item.sha256) manifestPass = false;
      }
      const uploadNames = this.profile.upload_files.map((item) => item.remote).sort();
      const manifestNames = Object.keys(manifest.files || {}).sort();
      if (JSON.stringify(uploadNames) !== JSON.stringify(manifestNames)) manifestPass = false;
      for (const item of this.profile.upload_files) {
        const file = this.recoveredFiles.get(item.local);
        if (path.basename(item.local) !== item.remote || !file || manifest.files?.[item.remote]?.sha256 !== sha256Sync(file)) {
          manifestPass = false;
        }
      }
      stage.integrity = { artifacts: checks, package_manifest: manifestPath, package_manifest_sha256: manifestHash, expected_package_manifest_sha256: this.profile.package_manifest_sha256, manifest_present: Boolean(manifest), manifest_pass: manifestPass };
      this.synthetic(stage, 'sha256-and-pe-probe', checks.every((item) => item.present && item.actual_sha256 === item.expected_sha256 && item.pe?.is_pe && item.pe?.x64) && manifestPass ? 'PASS' : 'FAIL', stage.integrity);
      const pass = checks.length === 2 && checks.every((item) => item.present && item.actual_sha256 === item.expected_sha256 && item.pe?.is_pe && item.pe?.x64) && manifestPass;
      return pass ? { status: 'PASS' } : { status: 'FAIL', failure: { code: 'ARTIFACT_INTEGRITY_FAILED', message: 'locked artifact/package closure is missing or mismatched' } };
    });
  }

  stage03() {
    return this.addStage('AUTO-03', 'strict SSH and Win7 read-only preflight', 'AUTOMATIC', (stage) => {
      const keyStat = fs.existsSync(this.profile.ssh.private_key) ? fs.statSync(this.profile.ssh.private_key) : null;
      const knownHosts = fs.existsSync(this.profile.ssh.known_hosts);
      const checks = {};
      const probes = [
        ['ver', ['cmd.exe', '/d', '/s', '/c', 'ver']],
        ['whoami', ['whoami']],
        ['os', ['wmic', 'os', 'get', 'Version,BuildNumber', '/value']],
        ['kb', ['wmic', 'qfe', 'get', 'HotFixID', '/format:list']],
        ['python', [this.profile.remote.python, '--version']],
        ['bitvise', ['sc', 'query', this.profile.remote.bitvise_service]],
      ];
      if (!keyStat || !knownHosts) return { status: 'ENVIRONMENT_MISSING', failure: { code: 'SSH_CONFIG_MISSING', message: 'strict SSH key path or known_hosts path is unavailable' } };
      for (const [name, argv] of probes) checks[name] = this.remote(stage, argv);
      const stdout = Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, `${value.stdout}\n${value.stderr}`]));
      const pass = checks.ver.exit_code === 0 && /6\.1\.7601|7601/.test(stdout.ver)
        && checks.whoami.exit_code === 0 && /dccs-chaizl/i.test(stdout.whoami)
        && checks.os.exit_code === 0 && /7601/.test(stdout.os)
        && checks.kb.exit_code === 0 && /KB2999226/i.test(stdout.kb)
        && checks.python.exit_code === 0 && /3\.8\.10/.test(stdout.python)
        && checks.bitvise.exit_code === 0 && /RUNNING/i.test(stdout.bitvise);
      stage.preflight = { key_path_present: true, known_hosts_present: true, key_content_read: false, checks: stdout, bitvise: /RUNNING/i.test(stdout.bitvise) ? 'RUNNING' : 'NOT_RUNNING' };
      return pass ? { status: 'PASS' } : { status: 'FAIL', failure: { code: 'WIN7_PREFLIGHT_FAILED', message: 'strict Win7 or Bitvise preflight did not pass' } };
    });
  }

  remotePath(root, name) { return `${root.replace(/\\+$/, '')}\\${name}`; }

  stage04() {
    return this.addStage('AUTO-04', 'fresh remote roots and transfer', 'AUTOMATIC', (stage) => {
      this.remoteRoot = `${this.profile.target.acceptance_root}\\${this.args.acceptanceId}`;
      this.remoteDataRoot = `${this.profile.target.data_root}\\${this.args.acceptanceId}`;
      const acceptanceFresh = this.remote(stage, ['cmd.exe', '/d', '/s', '/c', `if exist ${this.remoteRoot} exit /b 17`]);
      const dataFresh = this.remote(stage, ['cmd.exe', '/d', '/s', '/c', `if exist ${this.remoteDataRoot} exit /b 18`]);
      if (acceptanceFresh.exit_code !== 0 || dataFresh.exit_code !== 0) {
        return { status: 'FAIL', failure: { code: 'REMOTE_ROOT_NOT_FRESH', message: 'acceptance or data root already exists; ID reuse is prohibited' } };
      }
      const acceptanceCreate = this.remote(stage, ['cmd.exe', '/d', '/s', '/c', `mkdir ${this.remoteRoot}`]);
      if (acceptanceCreate.exit_code !== 0) return { status: 'FAIL', failure: { code: 'REMOTE_ROOT_CREATE_FAILED', message: 'could not create the fresh acceptance root' } };
      const dataCreate = this.remote(stage, ['cmd.exe', '/d', '/s', '/c', `mkdir ${this.remoteDataRoot}`]);
      if (dataCreate.exit_code !== 0) return { status: 'FAIL', failure: { code: 'REMOTE_DATA_ROOT_CREATE_FAILED', message: 'could not create the fresh data root; partial acceptance root is preserved for audit' } };
      const acceptanceVerify = this.remote(stage, ['cmd.exe', '/d', '/s', '/c', `if not exist ${this.remoteRoot} exit /b 19`]);
      const dataVerify = this.remote(stage, ['cmd.exe', '/d', '/s', '/c', `if not exist ${this.remoteDataRoot} exit /b 20`]);
      if (acceptanceVerify.exit_code !== 0 || dataVerify.exit_code !== 0) {
        return { status: 'FAIL', failure: { code: 'REMOTE_ROOT_VERIFY_FAILED', message: 'fresh remote roots could not be verified' } };
      }
      const uploaded = [];
      for (const item of this.profile.upload_files) {
        const local = this.recoveredFiles.get(item.local);
        if (!local || !fs.existsSync(local)) return { status: 'FAIL', failure: { code: 'UPLOAD_FILE_MISSING', message: item.local } };
        const remote = this.remotePath(this.remoteRoot, item.remote);
        const result = this.scpUpload(stage, local, remote.replace(/\\/g, '/'));
        const localHash = sha256Sync(local);
        const remoteHashProbe = this.remote(stage, ['certutil', '-hashfile', remote, 'SHA256']);
        const remoteHash = parseCertutilHash(remoteHashProbe.stdout);
        uploaded.push({ local: item.local, remote, local_sha256: localHash, remote_sha256: remoteHash, transfer_exit_code: result.exit_code });
        if (result.exit_code !== 0 || remoteHash !== localHash) return { status: 'FAIL', failure: { code: 'TRANSFER_HASH_MISMATCH', message: item.remote }, uploaded };
      }
      stage.transfer = { acceptance_root: this.remoteRoot, data_root: this.remoteDataRoot, uploaded };
      return { status: 'PASS' };
    });
  }

  stage05() {
    return this.addStage('AUTO-05', 'safe loader smoke', 'AUTOMATIC', (stage) => {
      const helper = this.remotePath(this.remoteRoot, 'spike02_helper.exe');
      const version = this.remote(stage, ['cmd.exe', '/d', '/s', '/c', `"${helper}" --version`]);
      const help = this.remote(stage, ['cmd.exe', '/d', '/s', '/c', `"${helper}" --help`]);
      const ps = this.remote(stage, ['tasklist.exe /FI "IMAGENAME eq spike02_helper.exe" /FO CSV /NH']);
      const pass = version.exit_code === 0 && /win7-x64/i.test(version.stdout)
        && help.exit_code === 0 && /stdin/i.test(help.stdout)
        && ps.exit_code === 0 && !/spike02_helper\.exe/i.test(ps.stdout);
      stage.loader = { version: version.stdout, help: help.stdout, residual_probe: ps.stdout };
      return pass ? { status: 'PASS' } : { status: 'FAIL', failure: { code: 'LOADER_SMOKE_FAILED', message: 'version/help or residual probe failed' } };
    });
  }

  stage06() {
    return this.addStage('AUTO-06', 'A4 non-interactive Win7 matrix', 'AUTOMATIC', (stage) => {
      const launcher = this.remotePath(this.remoteRoot, this.profile.remote.launcher);
      const launchCommand = `wmic.exe process call create "cmd.exe /d /s /c ${launcher} ${this.args.acceptanceId}"`;
      const launch = this.remote(stage, [launchCommand]);
      if (launch.exit_code !== 0 || !/ReturnValue\s*=\s*0/i.test(`${launch.stdout}\n${launch.stderr}`)) {
        return { status: 'FAIL', failure: { code: 'WMI_LAUNCH_FAILED', message: 'Win32_Process.Create did not establish the detached harness process' } };
      }
      const exitCodeFile = this.remotePath(this.remoteRoot, 'harness-exit-code.txt');
      const deadline = Date.now() + this.profile.stage_deadlines_ms['AUTO-06'];
      let completion = null;
      while (Date.now() < deadline) {
        completion = this.remote(stage, ['cmd.exe', '/d', '/s', '/c', `if exist "${exitCodeFile}" (type "${exitCodeFile}") else (exit /b 3)`], { timeout_ms: 30000 });
        if (completion.exit_code === 0) break;
        sleepSync(1000);
      }
      const harnessExitCode = completion?.exit_code === 0 ? Number.parseInt(completion.stdout.trim(), 10) : null;
      stage.launcher = {
        launch, completion, harness_exit_code: harnessExitCode, taskkill_used: false,
        inherited_job_escape: 'Win32_Process.Create via WMI',
      };
      return completion?.exit_code === 0 && harnessExitCode === 0
        ? { status: 'PASS' }
        : { status: 'FAIL', failure: { code: 'WIN7_HARNESS_FAILED', message: 'detached WMI harness timed out or returned non-zero' } };
    });
  }

  stage07() {
    return this.addStage('AUTO-07', 'evidence retrieval and immutable consolidation', 'AUTOMATIC', (stage) => {
      const localFiles = [];
      for (const nameTemplate of this.profile.remote.evidence_files) {
        const name = nameTemplate.replace('{id}', this.args.acceptanceId);
        const local = path.join(this.evidenceDir, `remote-${name}`);
        const remote = this.remotePath(this.remoteRoot, name);
        const result = this.scpDownload(stage, remote.replace(/\\/g, '/'), local);
        if (result.exit_code !== 0 || !fs.existsSync(local)) return { status: 'FAIL', failure: { code: 'EVIDENCE_RETRIEVAL_FAILED', message: name } };
        localFiles.push({ name, path: local, sha256: sha256Sync(local) });
      }
      let harness = null;
      const harnessFile = localFiles.find((item) => item.name.endsWith('-harness.json'));
      if (harnessFile) harness = readJson(harnessFile.path);
      const readEvidence = (name) => {
        const item = localFiles.find((entry) => entry.name === name);
        return item ? fs.readFileSync(item.path, 'utf8') : '';
      };
      const cases = Array.isArray(harness?.cases) ? harness.cases : [];
      const residualCases = cases.filter((item) => Object.hasOwn(item, 'residual_after'));
      const assertions = {
        harness_present: Boolean(harness),
        exact_candidate_sha256: harness?.artifact?.sha256 === LOCKED_CANDIDATE_SHA,
        cases_14: cases.length === 14,
        all_cases_pass: cases.length === 14 && cases.every((item) => item.status === 'PASS'),
        taskkill_false: harness?.taskkill_used === false,
        no_final_residuals: Array.isArray(harness?.final_process_snapshot?.relevant) && harness.final_process_snapshot.relevant.length === 0,
        no_case_residuals: residualCases.length >= 2 && residualCases.every((item) => Array.isArray(item.residual_after) && item.residual_after.length === 0),
        harness_exit_zero: readEvidence('harness-exit-code.txt').trim() === '0',
        launcher_identity: /dccs-chaizl/i.test(readEvidence('launcher-whoami.txt')),
        bitvise_running_after: /RUNNING/i.test(readEvidence('bitvise-after.txt')),
      };
      const pass = Object.values(assertions).every(Boolean);
      stage.evidence_retrieval = {
        files: localFiles,
        harness_summary: harness ? { status: harness.status, cases: cases.length, taskkill_used: harness.taskkill_used } : null,
        assertions,
        note: 'Harness top-level PARTIAL is expected because external/manual gates are excluded; automatic PASS requires all 14 cases and all safety assertions.',
      };
      return pass
        ? { status: 'PASS' }
        : { status: 'FAIL', failure: { code: 'WIN7_EVIDENCE_ASSERTION_FAILED', message: 'retrieved Win7 evidence did not satisfy the locked 14-case safety matrix' } };
    });
  }

  run() {
    this.stage00();
    if (this.blocked) this.skipStage('AUTO-01', 'macOS deterministic regression', 'AUTOMATIC', 'AUTO-00 failed; deterministic chain stopped fail-closed');
    else this.stage01();
    if (this.blocked) this.skipStage('AUTO-02', 'candidate integrity and package closure', 'AUTOMATIC', 'prior stage failed; artifact use prohibited');
    else this.stage02();
    if (this.args.dryRun) {
      for (const [id, name] of [['AUTO-03', 'strict SSH and Win7 read-only preflight'], ['AUTO-04', 'fresh remote roots and transfer'], ['AUTO-05', 'safe loader smoke'], ['AUTO-06', 'A4 non-interactive Win7 matrix'], ['AUTO-07', 'evidence retrieval and immutable consolidation']]) {
        this.skipStage(id, name, 'AUTOMATIC', 'dry-run: no ssh/scp, remote directory, upload or helper execution');
      }
    } else if (this.blocked) {
      for (const [id, name] of [['AUTO-03', 'strict SSH and Win7 read-only preflight'], ['AUTO-04', 'fresh remote roots and transfer'], ['AUTO-05', 'safe loader smoke'], ['AUTO-06', 'A4 non-interactive Win7 matrix'], ['AUTO-07', 'evidence retrieval and immutable consolidation']]) {
        this.skipStage(id, name, 'AUTOMATIC', 'prior stage failed; dangerous stage fail-closed');
      }
    } else {
      this.stage03();
      if (this.blocked) this.skipStage('AUTO-04', 'fresh remote roots and transfer', 'AUTOMATIC', 'strict SSH/Bitvise preflight failed; upload prohibited');
      else this.stage04();
      if (this.blocked) this.skipStage('AUTO-05', 'safe loader smoke', 'AUTOMATIC', 'transfer failed; helper execution prohibited');
      else this.stage05();
      if (this.blocked) this.skipStage('AUTO-06', 'A4 non-interactive Win7 matrix', 'AUTOMATIC', 'loader smoke failed; matrix execution prohibited');
      else this.stage06();
      if (this.blocked) this.skipStage('AUTO-07', 'evidence retrieval and immutable consolidation', 'AUTOMATIC', 'matrix failed; evidence retrieval stopped fail-closed');
      else this.stage07();
    }
    const autoStages = this.stages.filter((stage) => AUTO_IDS.includes(stage.id));
    const autoPass = autoStages.length === 8 && autoStages.every((stage) => stage.status === 'PASS');
    const gates = Object.entries(this.profile.gates || {}).map(([id, status]) => ({ id, status, counted_in_auto_pass: false }));
    const report = {
      schema_version: 1,
      plan_id: this.profile.profile_id,
      acceptance_id: this.args.acceptanceId,
      mode: this.args.dryRun ? 'DRY_RUN' : 'EXECUTE_WIN7',
      generated_at: now(),
      evidence_directory: this.evidenceDir,
      repository: {
        root: ROOT,
        orchestration_head: this.profile.orchestration_head,
        orchestration_base_head: this.profile.orchestration_head,
        current_head: this.stages[0]?.baseline?.orchestration_head || null,
        source_worktree: this.profile.source_worktree,
        source_head: this.profile.source_head,
        observed_source_head: this.stages[0]?.baseline?.source_head || this.stages[0]?.baseline?.manifest_source_head || null,
        a3_worktree: this.profile.a3_worktree,
        a3_head: this.profile.a3_head,
      },
      safety: { shell_false_only: true, private_key_content_read: false, private_key_content_emitted: false, taskkill_used: false, management_channel_mutated: false, rebooted: false },
      stages: this.stages,
      gates,
      result: { automatic_status: this.args.dryRun ? 'DRY_RUN' : (autoPass ? 'AUTOMATION_PASS' : 'AUTOMATION_FAIL'), auto_00_to_07_pass: autoPass, classification: this.args.dryRun ? 'NOT_EXECUTED' : (autoPass ? 'WIN7_EVIDENCE_READY' : 'FAIL_CLOSED') },
      required_follow_up: ['GATE-ACL', 'GATE-NET', 'GATE-PROD', 'GATE-A5-A6'],
      command_count: this.commands,
    };
    fs.mkdirSync(path.dirname(this.reportPath), { recursive: true });
    fs.writeFileSync(this.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(this.htmlPath, renderHtml(report), 'utf8');
    return report;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderHtml(report) {
  const rows = report.stages.map((stage) => `<tr><td>${escapeHtml(stage.id)}</td><td>${escapeHtml(stage.name)}</td><td>${escapeHtml(stage.status)}</td><td>${escapeHtml(stage.duration_ms)} ms</td><td><code>${escapeHtml(stage.stdout_file)}</code><br><code>${escapeHtml(stage.stderr_file)}</code></td></tr>`).join('');
  const gates = report.gates.map((gate) => `<li><strong>${escapeHtml(gate.id)}</strong>: ${escapeHtml(gate.status)}（不计入自动 PASS）</li>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>A4 自动验收编排 ${escapeHtml(report.acceptance_id)}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:1100px;margin:auto;padding:24px;color:#182337}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #dbe3ee;padding:8px;text-align:left;vertical-align:top}.PASS{color:#08765b}.FAIL{color:#a33232}code{background:#edf1f7;padding:2px 4px}</style></head><body><h1>A4 自动验收编排</h1><p>Acceptance ID: <code>${escapeHtml(report.acceptance_id)}</code>；模式: <code>${escapeHtml(report.mode)}</code>；自动结果: <strong>${escapeHtml(report.result.automatic_status)}</strong></p><p>安全断言：private key content read/emitted=false；taskkill=false；管理连接未修改；未重启。</p><h2>AUTO-00～07</h2><table><thead><tr><th>ID</th><th>阶段</th><th>状态</th><th>耗时</th><th>证据</th></tr></thead><tbody>${rows}</tbody></table><h2>未纳入无人值守 PASS 的 Gate</h2><ul>${gates}</ul><h2>说明</h2><p>开发机结果只能标记 DEVELOPMENT_PASS；Win7 PASS 只来自精确工件、严格 SSH、Bitvise 与目标端原始证据。历史报告未被改写。</p></body></html>\n`;
}

export { Orchestrator, parseCertutilHash, peInfo, redactArgs, validateAcceptanceId, validateProfile };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(`${usage()}\n`); return 0; }
  const profile = validateProfile(readJson(args.profile));
  const orchestrator = new Orchestrator(args, profile);
  const report = orchestrator.run();
  process.stdout.write(`${JSON.stringify({ report: orchestrator.reportPath, html: orchestrator.htmlPath, automatic_status: report.result.automatic_status }, null, 2)}\n`);
  return report.result.automatic_status === 'AUTOMATION_PASS' || report.result.automatic_status === 'DRY_RUN' ? 0 : 1;
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPoint && import.meta.url === entryPoint) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 2;
  });
}
