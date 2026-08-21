#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertEvidenceOutsideCandidate,
  bindCandidate,
  validateEvidenceReport,
} from './a8-validation-evidence.mjs';

const EXPECTED_CASES = Object.freeze({
  'a8-03': ['A8R-01-02-ELECTRON-REVIEW', 'A8C-02-FORGED-APPROVAL', 'A8R-04-BASELINE-DRIFT-ZERO-WRITE', 'A8R-05-RECOVERY-RENDERER'],
  'a8-04': ['A8T-01-TERMINAL-DISABLED', 'A8B-01-BROWSER-DISABLED', 'A8R-09-RUNNER-LOG-BOUNDARY', 'A8C-04-IPC-TERMINAL-FAIL-CLOSED'],
  'a8-05': ['A8P-01-REOPEN-PROJECTION', 'A8P-02-INTERRUPT-EXECUTION', 'A8P-03-REVIEW-DRIFT', 'A8P-04-FAIL-CLOSED-CORRUPTION', 'A8M-01-A7-SENSITIVE-EXCLUSION', 'A8M-02-ALLOWLIST-IMPORT', 'A8M-03-MIGRATION-RETRY', 'A8C-01-SENSITIVE-DATA-BLOCK'],
});

function argumentsMap(argv) {
  return Object.fromEntries(argv.map((value) => {
    const index = value.indexOf('=');
    if (!value.startsWith('--') || index < 3) throw new Error(`A8_ARGUMENT_INVALID:${value}`);
    return [value.slice(2, index), value.slice(index + 1)];
  }));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function verifyA8EvidenceSet(argv = process.argv.slice(2)) {
  const args = argumentsMap(argv);
  const validationLayer = args['validation-layer'];
  if (!['win10', 'win7'].includes(validationLayer)) throw new Error('A8_FORMAL_EVIDENCE_LAYER_REQUIRED');
  const binding = bindCandidate({
    candidateRoot: args['candidate-root'],
    manifestPath: args.manifest,
    expectedManifestSha256: args['expected-manifest-sha256'],
    expectedCandidateId: args['expected-candidate-id'],
  });
  if (binding.manifest.source_dirty === true) throw new Error('A8_FORMAL_CANDIDATE_SOURCE_DIRTY');

  const reports = {};
  for (const [stage, expectedCaseIds] of Object.entries(EXPECTED_CASES)) {
    const reportPath = assertEvidenceOutsideCandidate(binding.candidateRoot, args[stage]);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    validateEvidenceReport(report, { validationLayer, expectedCaseIds });
    if (report.status !== 'PASS') throw new Error(`A8_EVIDENCE_REPORT_NOT_PASS:${stage}`);
    if (report.candidate_id !== binding.candidateId || report.candidate_manifest_sha256 !== binding.manifestSha256) {
      throw new Error(`A8_EVIDENCE_CANDIDATE_MISMATCH:${stage}`);
    }
    reports[stage] = { path: reportPath, sha256: sha256File(reportPath), case_count: report.cases.length };
  }

  const outputPath = assertEvidenceOutsideCandidate(binding.candidateRoot, args.report);
  const summary = {
    schema_version: 1,
    record_id: `A8-EVIDENCE-SET-${validationLayer.toUpperCase()}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
    status: 'PASS',
    validation_layer: validationLayer,
    candidate_id: binding.candidateId,
    candidate_manifest_sha256: binding.manifestSha256,
    source_commit: binding.manifest.source_commit,
    source_dirty: false,
    reports,
    operator: args.operator,
    recorded_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return summary;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    verifyA8EvidenceSet();
  } catch (error) {
    process.stderr.write(`A8_EVIDENCE_SET_VERIFY_FAILED:${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
  }
}
