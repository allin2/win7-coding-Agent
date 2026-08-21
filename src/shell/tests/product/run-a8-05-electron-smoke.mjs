#!/usr/bin/env node

import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEvidenceOutsideCandidate, bindCandidate, validateEvidenceReport } from './a8-validation-evidence.mjs';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));

function argumentsMap(argv) {
  return Object.fromEntries(argv.map((value) => {
    const index = value.indexOf('=');
    if (!value.startsWith('--') || index < 3) throw new Error(`A8_ARGUMENT_INVALID:${value}`);
    return [value.slice(2, index), value.slice(index + 1)];
  }));
}

function requireFile(filePath, label) {
  const resolved = path.resolve(filePath || '');
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`${label}_NOT_FOUND:${resolved}`);
  return resolved;
}

export function runA805ElectronSmoke(argv = process.argv.slice(2)) {
  const args = argumentsMap(argv);
  if (!['win10', 'win7'].includes(args['validation-layer'])) throw new Error('A8_FORMAL_EVIDENCE_LAYER_REQUIRED');
  if (!String(args.operator || '').trim()) throw new Error('A8_FORMAL_EVIDENCE_OPERATOR_REQUIRED');
  const candidateRoot = path.resolve(args['candidate-root'] || '.');
  const electron = requireFile(args.electron, 'A8_ELECTRON');
  if (!args.report) throw new Error('A8_EVIDENCE_REPORT_REQUIRED');
  const report = path.resolve(args.report);
  const binding = bindCandidate({
    candidateRoot,
    manifestPath: args.manifest,
    expectedManifestSha256: args['expected-manifest-sha256'],
    expectedCandidateId: args['expected-candidate-id'],
  });
  if (binding.manifest.source_dirty === true) throw new Error('A8_FORMAL_CANDIDATE_SOURCE_DIRTY');
  if (electron !== path.join(binding.candidateRoot, 'electron.exe')) throw new Error('A8_05_ELECTRON_RUNTIME_ROOT_MISMATCH');
  assertEvidenceOutsideCandidate(binding.candidateRoot, report);
  const persistenceRunner = requireFile(path.join(scriptRoot, 'run-a8-05-persistence-smoke.mjs'), 'A8_PERSISTENCE_RUNNER');
  const childArguments = [
    persistenceRunner,
    `--product=${candidateRoot}`,
    '--require-d014',
    `--candidate-root=${candidateRoot}`,
    `--manifest=${binding.manifestPath}`,
    `--expected-manifest-sha256=${binding.manifestSha256}`,
    `--expected-candidate-id=${binding.candidateId}`,
    `--validation-layer=${args['validation-layer'] || ''}`,
    `--operator=${args.operator || ''}`,
    `--report=${report}`,
  ];
  const result = childProcess.spawnSync(electron, childArguments, {
    cwd: candidateRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 120_000,
    windowsHide: false,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`A8_05_ELECTRON_SMOKE_EXIT_${result.status}`);
  const evidence = JSON.parse(fs.readFileSync(report, 'utf8'));
  validateEvidenceReport(evidence, {
    validationLayer: args['validation-layer'],
    expectedCaseIds: [
      'A8P-01-REOPEN-PROJECTION',
      'A8P-02-INTERRUPT-EXECUTION',
      'A8P-03-REVIEW-DRIFT',
      'A8P-04-FAIL-CLOSED-CORRUPTION',
      'A8M-01-A7-SENSITIVE-EXCLUSION',
      'A8M-02-ALLOWLIST-IMPORT',
      'A8M-03-MIGRATION-RETRY',
      'A8C-01-SENSITIVE-DATA-BLOCK',
    ],
  });
  if (evidence.storage_profile !== 'D-014-E22-SQLITE343-LOCAL-SSD') throw new Error(`A8_05_STORAGE_PROFILE_INVALID:${evidence.storage_profile}`);
  if (evidence.candidate_manifest_sha256 !== binding.manifestSha256) throw new Error('A8_05_EVIDENCE_CANDIDATE_MISMATCH');
  process.stdout.write(`${JSON.stringify({ status: 'PASS', candidate_id: binding.candidateId, candidate_manifest_sha256: binding.manifestSha256, report })}\n`);
  return evidence;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    runA805ElectronSmoke();
  } catch (error) {
    process.stderr.write(`A8_05_ELECTRON_SMOKE_RUNNER_FAILED:${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
  }
}
