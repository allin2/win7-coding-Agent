'use strict';

const fs = require('fs');
const path = require('path');
const { PROFILE_ID, SHA256_RE, fail, readJson, sha256File, walkFiles, writeJson } = require('./common');
const { verifyLeaseFiles } = require('./lease');
const { verifyPackage } = require('./package');

function summariesUnder(root) {
  return walkFiles(root).filter((file) => /-summary\.json$/i.test(file)).map(readJson);
}

function validateEvidence(options) {
  const lease = verifyLeaseFiles(options.leaseFile, options.signatureFile, options.publicKeyFile);
  if (lease.scope.profile !== PROFILE_ID) fail('lease profile is not formal SSD profile', 'PROFILE_REJECTED');
  if (!SHA256_RE.test(lease.package_manifest_sha256)) fail('lease manifest hash invalid', 'LEASE_INVALID');
  const manifest = verifyPackage(options.packageRoot, lease.package_manifest_sha256);
  if (manifest.source_commit !== lease.source_commit || manifest.profile !== PROFILE_ID) fail('manifest binding mismatch', 'PACKAGE_INVALID');
  const returnedManifestFile = path.join(options.evidenceRoot, 'manifest.json');
  if (!fs.existsSync(returnedManifestFile) || sha256File(returnedManifestFile) !== lease.package_manifest_sha256) {
    fail('returned Win7 package manifest hash does not match signed lease', 'PACKAGE_HASH_MISMATCH');
  }
  const returnedManifest = readJson(returnedManifestFile);
  if (returnedManifest.source_commit !== lease.source_commit || returnedManifest.profile !== PROFILE_ID) {
    fail('returned Win7 package manifest binding mismatch', 'PACKAGE_INVALID');
  }
  const preflight = readJson(options.preflightFile);
  const postflight = readJson(options.postflightFile);
  const runner = readJson(path.join(options.evidenceRoot, 'runner-result.json'));
  const smoke = readJson(path.join(options.evidenceRoot, 'runtime-smoke.json'));
  if (preflight.status !== 'PASS' || preflight.profile !== PROFILE_ID) fail('preflight did not pass formal SSD profile', 'PREFLIGHT_BLOCKED');
  if (postflight.status !== 'PASS' || !postflight.zero_residue || !postflight.ssh_service) fail('postflight did not pass', 'RECOVERY_REQUIRED');
  if (smoke.status !== 'PASS' || smoke.electron !== '22.3.27' || Number(smoke.node_abi) !== 110 || smoke.sqlite !== '3.43.1' || smoke.fts5 !== true || smoke.wal !== 'wal' || Number(smoke.package_files_verified) !== manifest.files.length) fail('Win7 runtime/hash smoke did not pass', 'RUNTIME_SMOKE_FAILED');
  if (runner.exit_code !== 0 || runner.run_id !== lease.run_id || runner.invocations.length !== 7 || runner.invocations.some((item) => item.exit_code !== 0)) fail('fixed runner did not complete all invocations', 'EVIDENCE_INCOMPLETE');

  const summaries = summariesUnder(path.join(options.evidenceRoot, 'evidence'));
  if (summaries.length !== 7) fail('expected exactly 7 worker summaries, got ' + summaries.length, 'EVIDENCE_INCOMPLETE');
  const observed = new Map();
  let formalNoGo = false;
  const noGoReasons = [];
  for (const summary of summaries) {
    const ev = summary.evidence || {};
    if (summary.schema_version !== 2 || summary.spike !== 'SPIKE_04' || summary.media !== 'ssd') fail('worker summary schema/media invalid', 'EVIDENCE_INVALID');
    if (ev.grade !== 'CANDIDATE_EVIDENCE' || ev.profile !== PROFILE_ID || ev.run_id !== lease.run_id || ev.lease_id !== lease.lease_id || ev.source_commit !== lease.source_commit || ev.package_manifest_sha256 !== lease.package_manifest_sha256) fail('worker evidence lease binding mismatch', 'EVIDENCE_INVALID');
    for (const result of summary.results) {
      if (result.status !== 'MET') {
        if (result.case === 'S01' && Number(result.metrics.qps) < 150) { formalNoGo = true; noGoReasons.push('S01 QPS < 150'); }
        if (result.case === 'S02') { formalNoGo = true; noGoReasons.push('S02 integrity/recovery failed'); }
        if (result.case === 'S03' && Number(result.metrics.filesPerSec) < 60) { formalNoGo = true; noGoReasons.push('S03 throughput < 60 files/s (' + summary.scale + ')'); }
        if (result.case === 'S05' && Number(result.metrics.p95Ms) > 2500) { formalNoGo = true; noGoReasons.push('S05 P95 > 2500ms'); }
      }
      const key = result.case === 'S03' ? 'S03-' + summary.scale : result.case;
      if (observed.has(key)) fail('duplicate case evidence: ' + key, 'EVIDENCE_INVALID');
      observed.set(key, { summary, result });
    }
  }
  for (const key of ['S01', 'S02', 'S03-3k', 'S03-10k', 'S03-30k', 'S04', 'S05', 'S06', 'S07', 'S08', 'F', 'P']) {
    if (!observed.has(key)) fail('missing case evidence: ' + key, 'EVIDENCE_INCOMPLETE');
  }
  const s01 = observed.get('S01');
  const s05 = observed.get('S05');
  const s06 = observed.get('S06');
  if (s01.summary.results[0].metrics.elapsedMs < 60000 || s01.summary.results[0].metrics.qps < 300) {
    if (!formalNoGo) fail('S01 did not meet Go threshold/standard duration', 'THRESHOLD_NOT_MET');
  }
  if (Number(s05.result.metrics.count) !== 100 || Number(s05.result.metrics.p95Ms) > 1200) {
    if (!formalNoGo) fail('S05 did not meet standard reps/Go threshold', 'THRESHOLD_NOT_MET');
  }
  if (Number(s06.result.metrics.limitMb) !== 512 || Number(s06.result.metrics.targetMb) !== 256 || s06.result.status !== 'MET') fail('S06 standard cleanup did not pass', 'THRESHOLD_NOT_MET');
  for (const key of ['S03-3k', 'S03-10k', 'S03-30k']) {
    if (Number(observed.get(key).result.metrics.filesPerSec) < 120 && !formalNoGo) fail(key + ' did not meet Go threshold', 'THRESHOLD_NOT_MET');
  }
  const nonMet = Array.from(observed.values()).filter((entry) => entry.result.status !== 'MET');
  if (nonMet.length && !formalNoGo) fail('one or more required cases did not meet acceptance', 'THRESHOLD_NOT_MET');

  const evidenceFiles = walkFiles(options.evidenceRoot).map((file) => ({ path: path.relative(options.evidenceRoot, file).split(path.sep).join('/'), bytes: fs.statSync(file).size, sha256: sha256File(file) }));
  const status = {
    schema_version: 1,
    suite: 'SPIKE_04',
    formal_status: formalNoGo ? 'NO_GO' : 'WIN7_PASS',
    run_id: lease.run_id,
    lease_id: lease.lease_id,
    source_commit: lease.source_commit,
    package_manifest_sha256: lease.package_manifest_sha256,
    returned_package_manifest_sha256: sha256File(returnedManifestFile),
    profile: PROFILE_ID,
    target: lease.target,
    validated_at_utc: new Date().toISOString(),
    thresholds: {
      s01_qps: observed.get('S01').result.metrics.qps,
      s03_files_per_sec: Object.fromEntries(['3k', '10k', '30k'].map((scale) => [scale, observed.get('S03-' + scale).result.metrics.filesPerSec])),
      s05_p95_ms: observed.get('S05').result.metrics.p95Ms,
      s06_after_mb: observed.get('S06').result.metrics.afterSizeMb,
    },
    runtime_smoke: {
      electron: smoke.electron,
      node: smoke.node,
      node_abi: smoke.node_abi,
      better_sqlite3: smoke.better_sqlite3,
      sqlite: smoke.sqlite,
      fts5: smoke.fts5,
      wal: smoke.wal,
      package_files_verified: smoke.package_files_verified,
    },
    no_go_reasons: noGoReasons,
    preflight_sha256: sha256File(options.preflightFile),
    postflight_sha256: sha256File(options.postflightFile),
    returned_evidence_files: evidenceFiles,
    note: 'Formal status computed only by the ADR-0065/0066 coordinator; worker evidence remains CANDIDATE_EVIDENCE.',
  };
  writeJson(options.statusFile, status);
  return status;
}

module.exports = { validateEvidence };
