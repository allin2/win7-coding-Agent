'use strict';

const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { createLease, loadLedger, transitionLease, verifyLeaseFiles } = require('../lib/lease');
const { createPackage, verifyPackage } = require('../lib/package');
const { validateEvidence } = require('../lib/evidence');
const { sha256File, writeJson } = require('../lib/common');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a6-coordinator-'));
  const keyDir = path.join(root, 'coordinator');
  fs.mkdirSync(keyDir, { mode: 0o700 });
  fs.chmodSync(keyDir, 0o700);
  const pair = crypto.generateKeyPairSync('ed25519');
  const privateFile = path.join(keyDir, 'private.pem');
  const publicFile = path.join(root, 'public.pem');
  fs.writeFileSync(privateFile, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.chmodSync(privateFile, 0o600);
  fs.writeFileSync(publicFile, pair.publicKey.export({ type: 'spki', format: 'pem' }));
  return { root, keyDir, privateFile, publicFile, stateFile: path.join(keyDir, 'state.json') };
}

function buildTinyPackage(ctx) {
  const runtime = path.join(ctx.root, 'runtime-source');
  fs.mkdirSync(path.join(runtime, 'output', 'electron'), { recursive: true });
  fs.mkdirSync(path.join(runtime, 'output', 'runtime', 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(runtime, 'output', 'electron', 'electron.exe'), 'electron');
  fs.writeFileSync(path.join(runtime, 'output', 'runtime', 'node_modules', 'native.node'), 'native');
  const harness = path.join(ctx.root, 'harness');
  const runner = path.join(ctx.root, 'runner');
  fs.mkdirSync(harness); fs.mkdirSync(runner);
  fs.writeFileSync(path.join(harness, 'benchmark.js'), 'ok');
  fs.writeFileSync(path.join(runner, 'run-a6.js'), 'ok');
  const packageRoot = path.join(ctx.root, 'A6-SSD-20260810-01');
  const created = createPackage({ sourceCommit: 'a'.repeat(40), runtimeSourceSha256: 'b'.repeat(64), runtimeRoot: runtime, harnessRoot: harness, runnerRoot: runner, publicKeyFile: ctx.publicFile, output: packageRoot });
  return Object.assign(created, { packageRoot });
}

test('signed lease binds standard SSD profile and rejects concurrent lease', () => {
  const ctx = setup();
  const leaseFile = path.join(ctx.root, 'lease.json');
  const result = createLease({ keyFile: ctx.privateFile, stateFile: ctx.stateFile, sourceCommit: 'a'.repeat(40), packageManifestSha256: 'b'.repeat(64), runId: '20260810-01', leaseFile });
  const verified = verifyLeaseFiles(leaseFile, result.signatureFile, ctx.publicFile);
  assert.equal(verified.scope.profile, 'E22-SQLITE343-LOCAL-SSD');
  assert.equal(verified.scope.standard_parameters.s01_duration_ms, 60000);
  assert.throws(() => createLease({ keyFile: ctx.privateFile, stateFile: ctx.stateFile, sourceCommit: 'a'.repeat(40), packageManifestSha256: 'b'.repeat(64), runId: '20260810-02', leaseFile: path.join(ctx.root, 'lease2.json') }), /active lease/);
  transitionLease({ stateFile: ctx.stateFile, leaseId: result.lease.lease_id, toState: 'RELEASED' });
  assert.equal(loadLedger(ctx.stateFile).leases[0].state, 'RELEASED');
});

test('private key permissions fail closed', () => {
  const ctx = setup();
  fs.chmodSync(ctx.privateFile, 0o644);
  assert.throws(() => createLease({ keyFile: ctx.privateFile, stateFile: ctx.stateFile, sourceCommit: 'a'.repeat(40), packageManifestSha256: 'b'.repeat(64), runId: '20260810-01', leaseFile: path.join(ctx.root, 'lease.json') }), /0600/);
});

test('package manifest detects changed files', () => {
  const ctx = setup();
  const pkg = buildTinyPackage(ctx);
  assert.equal(verifyPackage(pkg.packageRoot, pkg.manifestSha256).profile, 'E22-SQLITE343-LOCAL-SSD');
  fs.appendFileSync(path.join(pkg.packageRoot, 'harness', 'benchmark.js'), 'changed');
  assert.throws(() => verifyPackage(pkg.packageRoot, pkg.manifestSha256), /mismatch/);
});

test('validator alone emits formal WIN7_PASS for complete bound evidence', () => {
  const ctx = setup();
  const pkg = buildTinyPackage(ctx);
  const leaseFile = path.join(ctx.root, 'lease.json');
  const signed = createLease({ keyFile: ctx.privateFile, stateFile: ctx.stateFile, sourceCommit: 'a'.repeat(40), packageManifestSha256: pkg.manifestSha256, runId: '20260810-01', leaseFile });
  const evidenceRoot = path.join(ctx.root, 'returned');
  const evidenceDir = path.join(evidenceRoot, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const commonEvidence = { grade: 'CANDIDATE_EVIDENCE', profile: 'E22-SQLITE343-LOCAL-SSD', run_id: signed.lease.run_id, lease_id: signed.lease.lease_id, source_commit: signed.lease.source_commit, package_manifest_sha256: signed.lease.package_manifest_sha256 };
  const summaries = [
    ['s01', '3k', [{ case: 'S01', status: 'MET', metrics: { qps: 500, elapsedMs: 60001 } }]],
    ['s03-3k', '3k', [{ case: 'S03', status: 'MET', metrics: { filesPerSec: 200 } }]],
    ['s03-10k', '10k', [{ case: 'S03', status: 'MET', metrics: { filesPerSec: 190 } }]],
    ['s03-30k', '30k', [{ case: 'S03', status: 'MET', metrics: { filesPerSec: 180 } }]],
    ['s05', '30k', [{ case: 'S05', status: 'MET', metrics: { p95Ms: 40, count: 100 } }]],
    ['s06', '3k', [{ case: 'S06', status: 'MET', metrics: { limitMb: 512, targetMb: 256, afterSizeMb: 200 } }]],
    ['remaining', '10k', ['S02', 'S04', 'S07', 'S08', 'F', 'P'].map((caseId) => ({ case: caseId, status: 'MET', metrics: {} }))],
  ];
  for (const [id, scale, results] of summaries) {
    const dir = path.join(evidenceDir, id); fs.mkdirSync(dir);
    writeJson(path.join(dir, 'run-summary.json'), { schema_version: 2, spike: 'SPIKE_04', media: 'ssd', scale, evidence: commonEvidence, results });
  }
  writeJson(path.join(evidenceRoot, 'runner-result.json'), { exit_code: 0, run_id: signed.lease.run_id, invocations: summaries.map(([id]) => ({ id, exit_code: 0 })) });
  writeJson(path.join(evidenceRoot, 'runtime-smoke.json'), { status: 'PASS', electron: '22.3.27', node: '16.17.1', node_abi: 110, better_sqlite3: '8.7.0', sqlite: '3.43.1', fts5: true, wal: 'wal', package_files_verified: JSON.parse(fs.readFileSync(pkg.manifestPath)).files.length });
  const preflightFile = path.join(ctx.root, 'preflight.json');
  const postflightFile = path.join(ctx.root, 'postflight.json');
  writeJson(preflightFile, { status: 'PASS', profile: 'E22-SQLITE343-LOCAL-SSD' });
  writeJson(postflightFile, { status: 'PASS', zero_residue: true, ssh_service: true });
  const statusFile = path.join(ctx.root, 'status.json');
  const status = validateEvidence({ leaseFile, signatureFile: signed.signatureFile, publicKeyFile: ctx.publicFile, packageRoot: pkg.packageRoot, evidenceRoot, preflightFile, postflightFile, statusFile });
  assert.equal(status.formal_status, 'WIN7_PASS');
  assert.equal(JSON.parse(fs.readFileSync(statusFile)).formal_status, 'WIN7_PASS');
  assert.equal(sha256File(statusFile).length, 64);
});
