'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { generateFixtureTree } = require('../lib/fixtures');
const { classifyWindowsMediaOutput } = require('../lib/disk-type');

const ROOT = path.resolve(__dirname, '..');
const BENCHMARK = path.join(ROOT, 'benchmark', 'benchmark.js');
const SOURCE_COMMIT = 'a'.repeat(40);
const MANIFEST_SHA = 'b'.repeat(64);

function runBenchmark(args, expectedStatus) {
  const result = spawnSync(process.execPath, [BENCHMARK].concat(args), {
    cwd: ROOT,
    env: Object.assign({}, process.env, { A6_PYTHON: process.env.A6_PYTHON || '/usr/bin/python3' }),
    encoding: 'utf8',
    timeout: 120000,
  });
  assert.strictEqual(
    result.status,
    expectedStatus,
    'unexpected status\nstdout:\n' + result.stdout + '\nstderr:\n' + result.stderr
  );
  return result;
}

function evidenceFiles(dir) {
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
}

function readEvidence(dir, suffix) {
  const name = evidenceFiles(dir).find((item) => item.endsWith(suffix));
  assert(name, 'missing evidence file ending with ' + suffix);
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}

function makeLease(overrides) {
  const now = Date.now();
  const lease = {
    schema_version: 1,
    lease_id: 'A6-LEASE-TEST-01',
    run_id: 'A6-SSD-TEST-01',
    nonce: 'nonce-test-01',
    state: 'GRANTED',
    issued_at_utc: new Date(now - 60000).toISOString(),
    expires_at_utc: new Date(now + 3600000).toISOString(),
    source_commit: SOURCE_COMMIT,
    package_manifest_sha256: MANIFEST_SHA,
    target: {
      ip: '192.168.1.11',
      port: 22,
      hostname: os.hostname(),
      os_build: '7601',
      arch: 'x64',
    },
    scope: {
      suite: 'SPIKE_04',
      profile: 'E22-SQLITE343-LOCAL-SSD',
      cases: ['F'],
      standard_parameters: {
        s01_duration_ms: 60000,
        s03_scales: ['3k', '10k', '30k'],
        s05_scale: '30k',
        s05_reps: 100,
        s06_limit_mb: 512,
        s06_target_mb: 256,
      },
    },
  };
  return Object.assign(lease, overrides || {});
}

function writeLeaseBundle(dir, lease, privateKey, publicKey) {
  fs.mkdirSync(dir, { recursive: true });
  const leasePath = path.join(dir, 'lease.json');
  const signaturePath = leasePath + '.sig';
  const publicKeyPath = path.join(dir, 'public.pem');
  const raw = Buffer.from(JSON.stringify(lease, null, 2) + '\n', 'utf8');
  fs.writeFileSync(leasePath, raw);
  fs.writeFileSync(signaturePath, crypto.sign(null, raw, privateKey));
  fs.writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
  return { leasePath, signaturePath, publicKeyPath };
}

function commonCandidateArgs(samples, evidenceDir, bundle) {
  return [
    '--backend', 'python-bridge',
    '--samples', samples,
    '--cases', 'F',
    '--media', 'ssd',
    '--evidence-dir', evidenceDir,
    '--candidate-evidence',
    '--lease', bundle.leasePath,
    '--lease-signature', bundle.signaturePath,
    '--public-key', bundle.publicKeyPath,
    '--source-commit', SOURCE_COMMIT,
    '--package-manifest-sha256', MANIFEST_SHA,
  ];
}

function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'a6-evidence-contract-'));
  try {
    assert.strictEqual(classifyWindowsMediaOutput('MediaType\r\nFixed hard disk media\r\n'), 'unknown');
    assert.strictEqual(classifyWindowsMediaOutput('MediaType\r\nSSD\r\n'), 'ssd');
    assert.strictEqual(classifyWindowsMediaOutput('MediaType\r\nHDD\r\n'), 'hdd');

    const samples = path.join(temp, 'samples');
    generateFixtureTree({ root: samples, fileCount: 200, seed: 42 });

    const devEvidence = path.join(temp, 'development', 'evidence');
    runBenchmark([
      '--backend', 'python-bridge', '--samples', samples, '--cases', 'F',
      '--evidence-dir', devEvidence,
    ], 0);
    const devCase = readEvidence(devEvidence, '-f.json');
    const devSummary = readEvidence(devEvidence, '-summary.json');
    assert.strictEqual(devCase.schema_version, 2);
    assert.strictEqual(devCase.evidence.grade, 'DEVELOPMENT');
    assert.strictEqual(devSummary.schema_version, 2);
    assert.strictEqual(devSummary.evidence.grade, 'DEVELOPMENT');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(devSummary, 'win7_validation'), false);

    const keys = crypto.generateKeyPairSync('ed25519');
    const validBundle = writeLeaseBundle(temp, makeLease(), keys.privateKey, keys.publicKey);
    const candidateEvidence = path.join(temp, 'candidate', 'evidence');
    runBenchmark(commonCandidateArgs(samples, candidateEvidence, validBundle), 0);
    const candidateCase = readEvidence(candidateEvidence, '-f.json');
    const candidateSummary = readEvidence(candidateEvidence, '-summary.json');
    assert.strictEqual(candidateCase.schema_version, 2);
    assert.strictEqual(candidateCase.evidence.grade, 'CANDIDATE_EVIDENCE');
    assert.strictEqual(candidateCase.evidence.profile, 'E22-SQLITE343-LOCAL-SSD');
    assert.strictEqual(candidateCase.evidence.run_id, 'A6-SSD-TEST-01');
    assert.strictEqual(candidateCase.evidence.lease_id, 'A6-LEASE-TEST-01');
    assert.strictEqual(candidateCase.evidence.source_commit, SOURCE_COMMIT);
    assert.strictEqual(candidateCase.evidence.package_manifest_sha256, MANIFEST_SHA);
    assert.strictEqual(candidateSummary.evidence.grade, 'CANDIDATE_EVIDENCE');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(candidateSummary, 'win7_validation'), false);

    const missingLease = runBenchmark([
      '--backend', 'python-bridge', '--samples', samples, '--cases', 'F', '--media', 'ssd',
      '--evidence-dir', path.join(temp, 'missing-lease'), '--candidate-evidence',
      '--source-commit', SOURCE_COMMIT, '--package-manifest-sha256', MANIFEST_SHA,
    ], 1);
    assert.match(missingLease.stderr, /--lease is required/);

    const badSignaturePath = path.join(temp, 'bad.sig');
    fs.writeFileSync(badSignaturePath, Buffer.alloc(64, 0));
    const invalidSignature = commonCandidateArgs(samples, path.join(temp, 'bad-signature'), validBundle);
    invalidSignature[invalidSignature.indexOf(validBundle.signaturePath)] = badSignaturePath;
    const badSignatureResult = runBenchmark(invalidSignature, 1);
    assert.match(badSignatureResult.stderr, /signature mismatch/);

    const mismatchArgs = commonCandidateArgs(samples, path.join(temp, 'commit-mismatch'), validBundle);
    mismatchArgs[mismatchArgs.indexOf(SOURCE_COMMIT)] = 'c'.repeat(40);
    const mismatchResult = runBenchmark(mismatchArgs, 1);
    assert.match(mismatchResult.stderr, /source commit mismatch/);

    const expiredBundle = writeLeaseBundle(
      path.join(temp, 'expired'),
      makeLease({
        issued_at_utc: new Date(Date.now() - 7200000).toISOString(),
        expires_at_utc: new Date(Date.now() - 3600000).toISOString(),
      }),
      keys.privateKey,
      keys.publicKey
    );
    const expiredResult = runBenchmark(
      commonCandidateArgs(samples, path.join(temp, 'expired-evidence'), expiredBundle),
      1
    );
    assert.match(expiredResult.stderr, /lease is expired/);

    const legacyFlag = runBenchmark(['--win7-validated'], 1);
    assert.match(legacyFlag.stderr, /removed in ADR-0065/);

    process.stdout.write('EVIDENCE CONTRACT TESTS PASS\n');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main();
