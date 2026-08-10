'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CASE_IDS = Object.freeze(['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10']);
const SUITE = 'NATIVE_RUNNER_L01_L10';

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`unexpected argument: ${item}`);
    result[item.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = argv[++index];
  }
  for (const name of ['acceptanceId', 'lease', 'signature', 'publicKey', 'packageManifest', 'packageManifestSha256', 'sourceCommit', 'out']) {
    if (!result[name]) throw new Error(`--${name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)} is required`);
  }
  if (!/^D013-RUNNER-[A-Za-z0-9._-]{4,100}$/.test(result.acceptanceId)) throw new Error('invalid runner acceptance id');
  return result;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const sorted = {};
  for (const key of Object.keys(value).sort()) sorted[key] = sortValue(value[key]);
  return sorted;
}

function canonicalJson(value) { return `${JSON.stringify(sortValue(value))}\n`; }
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256File(filename) { return digest(fs.readFileSync(filename)); }

function verifyLease(args, root) {
  const raw = fs.readFileSync(args.lease);
  const signature = fs.readFileSync(args.signature);
  const publicKey = fs.readFileSync(args.publicKey);
  if (!crypto.verify(null, raw, publicKey, signature)) throw new Error('LEASE_SIGNATURE_INVALID');
  const lease = JSON.parse(raw.toString('utf8'));
  if (canonicalJson(lease) !== raw.toString('utf8')) throw new Error('LEASE_NOT_CANONICAL');
  if (lease.schema_version !== 1 || lease.state !== 'GRANTED' || Date.parse(lease.expires_at_utc) <= Date.now()) {
    throw new Error('LEASE_INVALID_OR_EXPIRED');
  }
  if (lease.lease_id !== path.basename(args.lease, '.json') && path.basename(args.lease) !== 'lease.json') {
    throw new Error('LEASE_PATH_BINDING_INVALID');
  }
  if (lease.run_id !== args.acceptanceId || lease.source_commit !== args.sourceCommit ||
      lease.package_manifest_sha256 !== args.packageManifestSha256 || lease.target.ip !== '192.168.1.11' ||
      lease.target.os_build !== '7601' || lease.target.arch !== 'x64' || lease.scope.suite !== SUITE) {
    throw new Error('LEASE_BINDING_MISMATCH');
  }
  if (CASE_IDS.some((id) => !lease.scope.required_pass_cases.includes(id))) throw new Error('LEASE_CASE_SCOPE_INCOMPLETE');
  if (sha256File(args.packageManifest) !== args.packageManifestSha256) throw new Error('PACKAGE_MANIFEST_HASH_MISMATCH');
  const packageManifest = JSON.parse(fs.readFileSync(args.packageManifest, 'utf8'));
  if (packageManifest.source_commit !== args.sourceCommit || packageManifest.acceptance_id !== args.acceptanceId) {
    throw new Error('PACKAGE_MANIFEST_BINDING_MISMATCH');
  }
  const expected = new Map(packageManifest.files.map((entry) => [entry.path, entry]));
  for (const [relative, entry] of expected) {
    const absolute = path.join(root, relative.split('/').join(path.sep));
    if (!fs.existsSync(absolute) || fs.statSync(absolute).size !== entry.size || sha256File(absolute) !== entry.sha256) {
      throw new Error(`PACKAGE_FILE_MISMATCH:${relative}`);
    }
  }
  const artifactChecks = {
    helper: path.join(root, 'spike02_helper.exe'),
    runner_release_manifest: path.join(root, 'runner-release-manifest.json'),
    electron: process.execPath,
  };
  for (const [name, filename] of Object.entries(artifactChecks)) {
    if (!lease.artifact_hashes[name] || sha256File(filename) !== lease.artifact_hashes[name]) {
      throw new Error(`LEASE_ARTIFACT_MISMATCH:${name}`);
    }
  }
  return { lease, packageManifest };
}

function request(profile, args, workDir, overrides = {}) {
  return {
    requestId: overrides.requestId || `runner-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    command: profile,
    args,
    approvalLevel: 'read_only',
    config: {
      timeoutMs: overrides.timeoutMs || 15_000,
      idleTimeoutMs: overrides.idleTimeoutMs || 5_000,
      maxStdoutBytes: overrides.maxStdoutBytes ?? 64 * 1024,
      maxStderrBytes: overrides.maxStderrBytes ?? 64 * 1024,
      workDir,
      stdinPolicy: 'closed',
    },
    ...(overrides.signal ? { signal: overrides.signal } : {}),
  };
}

function imagePresent(image) {
  const probe = spawnSync('tasklist.exe', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], {
    shell: false, encoding: 'utf8', timeout: 15_000, windowsHide: true,
  });
  return { present: new RegExp(image.replace('.', '\\.'), 'i').test(`${probe.stdout || ''}\n${probe.stderr || ''}`), exitCode: probe.status };
}

function bitviseRunning() {
  const probe = spawnSync('sc.exe', ['query', 'BvSshServer'], { shell: false, encoding: 'utf8', timeout: 15_000, windowsHide: true });
  return { running: /STATE\s*:\s*4\s+RUNNING|\bRUNNING\b/i.test(`${probe.stdout || ''}\n${probe.stderr || ''}`), exitCode: probe.status };
}

function makeCase(id, title, checks, detail) {
  const status = checks.every((check) => check.ok === true) ? 'PASS' : 'FAIL';
  return { id, title, status, evidence_class: 'WIN7', detail, subchecks: checks };
}

async function runCases(runtime, root, binding) {
  const cases = [];
  const makeDir = (name) => { const dir = path.join(root, 'work', name); fs.mkdirSync(dir, { recursive: true }); return dir; };
  const baseWork = makeDir('base');

  const l01 = await runtime.runner.execute(request('win7-whoami', [], makeDir('l01'), { requestId: 'l01-product-host' }));
  cases.push(makeCase('L01', 'Electron 产品路径的 Host Job breakaway 与重新 containment', [
    { name: 'normal-exit', ok: l01.status === 'exited' && l01.exitCode === 0 },
    { name: 'whole-tree-containment', ok: l01.termination.processTreeReaped && l01.termination.containment === 'job_object' },
    { name: 'electron-host-job-detected', ok: /host_job_detected=true/.test(l01.termination.detail || '') },
    { name: 'documented-breakaway-used', ok: /breakaway=(explicit|silent)/.test(l01.termination.detail || '') },
    { name: 'child-reassigned-to-helper-job', ok: /child_job_assignment_verified=true/.test(l01.termination.detail || '') },
  ], l01.termination.detail || l01.error?.message || 'missing containment detail'));

  cases.push(makeCase('L02', '签名租约、包清单、Helper 与 Profile 哈希绑定', [
    { name: 'lease-signature-and-bindings', ok: true, note: binding.lease.lease_id },
    { name: 'package-manifest-bound', ok: binding.packageManifest.acceptance_id === binding.lease.run_id },
    { name: 'release-manifest-injected', ok: runtime.manifestSha256 === binding.lease.artifact_hashes.runner_release_manifest },
    { name: 'helper-hash-injected', ok: runtime.helperSha256 === binding.lease.artifact_hashes.helper },
  ], 'Ed25519 lease and both manifest layers were verified before NativeRunner construction.'));

  const missing = await runtime.runner.execute(request('missing-profile', [], baseWork, { requestId: 'l03-missing' }));
  const shell = await runtime.runner.execute(request('cmd.exe', ['/d', '/s', '/c', 'echo denied'], baseWork, { requestId: 'l03-shell' }));
  const high = await runtime.runner.execute(request('high-risk-whoami', [], baseWork, { requestId: 'l03-high' }));
  cases.push(makeCase('L03', '未知 Profile、Shell 与高风险本地执行拒绝', [
    { name: 'unknown-profile-rejected', ok: missing.status === 'rejected' && missing.error?.code === 'PROFILE_NOT_FOUND' },
    { name: 'shell-rejected', ok: shell.status === 'rejected' && shell.error?.code === 'SHELL_HOST_PROHIBITED' },
    { name: 'high-risk-rejected', ok: high.status === 'rejected' && high.error?.code === 'PROFILE_RISK_REJECTED' },
    { name: 'rejection-left-no-helper', ok: !imagePresent('spike02_helper.exe').present },
  ], 'All prohibited requests were rejected before helper transport.'));

  const l04 = await runtime.runner.execute(request('win7-ping', ['-n', '2', '127.0.0.1'], makeDir('中文 空格-l04'), { requestId: 'l04-encoding' }));
  cases.push(makeCase('L04', 'CP936、CRLF、中文与空格工作目录', [
    { name: 'normal-exit', ok: l04.status === 'exited' && l04.exitCode === 0 },
    { name: 'cp936-decoded', ok: l04.stdout.encoding === 'cp936' && l04.stdout.replacementCount === 0 },
    { name: 'crlf-preserved', ok: l04.stdout.text.includes('\r\n') },
    { name: 'chinese-space-cwd-contained', ok: l04.termination.processTreeReaped },
  ], `encoding=${l04.stdout.encoding}; bytes=${l04.stdout.bytesRead}`));

  const l05 = await runtime.runner.execute(request('win7-ping', ['-n', '4', '-w', '10', '127.0.0.1'], makeDir('l05'), {
    requestId: 'l05-truncation', maxStdoutBytes: 64, maxStderrBytes: 32,
  }));
  cases.push(makeCase('L05', 'stdout/stderr 独立上限与截断提示', [
    { name: 'normal-exit', ok: l05.status === 'exited' },
    { name: 'stdout-truncated', ok: l05.stdout.truncated && l05.stdout.bytesRetained === 64 && l05.stdout.omittedBytes > 0 },
    { name: 'stderr-independent', ok: l05.stderr.bytesRetained <= 32 },
    { name: 'truncation-marker', ok: l05.stdout.text.includes('[output truncated:') },
  ], `stdout=${l05.stdout.bytesRead}/${l05.stdout.bytesRetained}; stderr=${l05.stderr.bytesRead}/${l05.stderr.bytesRetained}`));

  const l06 = await runtime.runner.execute(request('win7-ping', ['-t', '127.0.0.1'], makeDir('l06'), {
    requestId: 'l06-total-timeout', timeoutMs: 700, idleTimeoutMs: 5_000,
  }));
  cases.push(makeCase('L06', '总超时终止整个 Job 进程树', [
    { name: 'timeout-result', ok: l06.status === 'timeout' },
    { name: 'tree-reaped', ok: l06.termination.processTreeReaped },
    { name: 'zero-ping-residue', ok: !imagePresent('ping.exe').present },
  ], l06.error?.message || 'total timeout completed'));

  const l07 = await runtime.runner.execute(request('win7-ping', ['-t', '127.0.0.1'], makeDir('l07'), {
    requestId: 'l07-idle-timeout', timeoutMs: 8_000, idleTimeoutMs: 250,
  }));
  cases.push(makeCase('L07', '空闲超时独立于总超时', [
    { name: 'idle-timeout-result', ok: l07.status === 'idle_timeout' },
    { name: 'tree-reaped', ok: l07.termination.processTreeReaped },
    { name: 'zero-ping-residue', ok: !imagePresent('ping.exe').present },
  ], l07.error?.message || 'idle timeout completed'));

  const controller = new AbortController();
  const cancelPromise = runtime.runner.execute(request('win7-ping', ['-t', '127.0.0.1'], makeDir('l08'), {
    requestId: 'l08-cancel', timeoutMs: 20_000, idleTimeoutMs: 5_000, signal: controller.signal,
  }));
  setTimeout(() => controller.abort(), 500);
  const l08 = await cancelPromise;
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  cases.push(makeCase('L08', '取消关闭 Helper 并由 KILL_ON_JOB_CLOSE 回收 child', [
    { name: 'cancelled-result', ok: l08.status === 'cancelled' },
    { name: 'cleanup-confirmed', ok: l08.termination.processTreeReaped },
    { name: 'zero-helper-residue', ok: !imagePresent('spike02_helper.exe').present },
    { name: 'zero-ping-residue', ok: !imagePresent('ping.exe').present },
  ], l08.error?.message || l08.termination.detail || 'cancel completed'));

  const l09 = await runtime.runner.execute(request('win7-whoami', [], makeDir('中文 空格-l09'), { requestId: 'l09-acl' }));
  cases.push(makeCase('L09', '每轮 Low Integrity ACL 应用、验证与回滚', [
    { name: 'normal-exit', ok: l09.status === 'exited' },
    { name: 'acl-change-recorded', ok: /acl_changes=1/.test(l09.termination.detail || '') },
    { name: 'acl-rollback-verified', ok: /acl_rollback_verified=true/.test(l09.termination.detail || '') },
    { name: 'containment-retained', ok: l09.termination.processTreeReaped },
  ], l09.termination.detail || l09.error?.message || 'missing ACL detail'));

  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const finalHelper = imagePresent('spike02_helper.exe');
  const finalPing = imagePresent('ping.exe');
  const service = bitviseRunning();
  cases.push(makeCase('L10', '轮后残留、服务与正式证据边界', [
    { name: 'zero-helper-residue', ok: !finalHelper.present && finalHelper.exitCode === 0 },
    { name: 'zero-ping-residue', ok: !finalPing.present && finalPing.exitCode === 0 },
    { name: 'bitvise-running', ok: service.running && service.exitCode === 0 },
    { name: 'all-prior-cases-pass', ok: cases.every((item) => item.status === 'PASS') },
  ], `helper=${finalHelper.present}; ping=${finalPing.present}; bitvise=${service.running}`));
  return cases;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = path.dirname(path.resolve(args.packageManifest));
  const binding = verifyLease(args, root);
  const runnerModule = require(path.join(root, 'runtime', 'runner'));
  const { createProductRunner } = require(path.join(root, 'runtime', 'runner-runtime.js'));
  const releaseManifest = path.join(root, 'runner-release-manifest.json');
  const runtime = createProductRunner({
    runnerModule,
    manifestPath: releaseManifest,
    expectedManifestSha256: binding.lease.artifact_hashes.runner_release_manifest,
  });
  const cases = await runCases(runtime, root, binding);
  const counts = cases.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), {});
  const evidence = {
    schema_version: 1,
    acceptance_id: args.acceptanceId,
    generated_at: new Date().toISOString(),
    mode: 'win7-electron-native-runner-l01-l10',
    evidence_grade: 'CANDIDATE_EVIDENCE',
    lease_id: binding.lease.lease_id,
    source_commit: args.sourceCommit,
    package_manifest_sha256: args.packageManifestSha256,
    cases,
    counts,
    win7_validation: 'COORDINATOR_POSTFLIGHT_PENDING',
  };
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`RUNNER_WIN7_RESULT_WRITTEN ${args.out}\n`);
  return cases.every((item) => item.status === 'PASS') ? 0 : 2;
}

module.exports = { CASE_IDS, SUITE, canonicalJson, parseArgs, verifyLease, runCases };

if (require.main === module) {
  const { app } = require('electron');
  app.whenReady().then(async () => app.exit(await main())).catch((error) => {
    process.stderr.write(`RUNNER_WIN7_FAILED ${error && error.stack || error}\n`);
    app.exit(2);
  });
}
