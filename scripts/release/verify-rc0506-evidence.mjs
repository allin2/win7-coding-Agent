#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const validators = require(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0506-windows-validation.cjs'));

try {
  const evidenceRoot = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.statSync(evidenceRoot).isDirectory()) throw new Error('USAGE:verify-rc0506-evidence.mjs <evidence-directory>');
  const fatalPath = path.join(evidenceRoot, 'rc0506-windows-fatal.json');
  if (fs.existsSync(fatalPath)) {
    const fatal = read(fatalPath);
    throw new Error(`RC0506_FATAL_EVIDENCE_PRESENT:${fatal.error || 'UNKNOWN'}`);
  }
  const summaryPath = path.join(evidenceRoot, 'rc0506-windows-summary.json');
  const rc05Path = path.join(evidenceRoot, 'rc05-runner-windows.json');
  const rc06Path = path.join(evidenceRoot, 'rc06-storage-windows.json');
  const summary = validators.validateSummary(read(summaryPath));
  const exitCodePath = path.join(evidenceRoot, 'rc0506-process-exit-code.txt');
  if (!fs.existsSync(exitCodePath) || fs.readFileSync(exitCodePath, 'ascii').trim() !== 'RC0506_EXIT_CODE=0') {
    throw new Error('RC0506_PROCESS_EXIT_CODE_NOT_ZERO');
  }
  const rc05 = validators.validateRc05Report(read(rc05Path));
  const rc06 = validators.validateRc06Report(read(rc06Path));
  if (summary.reports.rc05.sha256 !== sha256(rc05Path) || summary.reports.rc06.sha256 !== sha256(rc06Path)) throw new Error('RC0506_REPORT_HASH_MISMATCH');
  if (summary.reports.rc05.status !== rc05.status || summary.reports.rc06.status !== rc06.status) throw new Error('RC0506_REPORT_STATUS_MISMATCH');
  const databasePath = evidenceFile(evidenceRoot, rc06.database.evidence_file);
  if (!fs.existsSync(databasePath) || fs.statSync(databasePath).size !== rc06.database.size || sha256(databasePath) !== rc06.database.sha256) {
    throw new Error('RC0506_PRODUCTION_DATABASE_MISMATCH');
  }
  const corruptionCase = rc06.cases.find((item) => item.case_id === 'RC06-N02');
  const corruptionPath = evidenceFile(evidenceRoot, 'rc06-intentionally-corrupted-probe.db');
  if (!corruptionCase || !fs.existsSync(corruptionPath) || sha256(corruptionPath) !== corruptionCase.evidence.probe_sha256) {
    throw new Error('RC0506_CORRUPTION_PROBE_MISMATCH');
  }
  const lock = read(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0506-validation-lock.json'));
  if (!summary.kit || summary.kit.kit_id !== lock.kit_id || summary.kit.integrity !== 'PASS' || summary.candidate.release_manifest_sha256 !== lock.candidate.release_manifest_sha256 || rc05.candidate_sha256 !== lock.candidate.sha256 || rc06.candidate_sha256 !== lock.candidate.sha256 || rc06.native_binding_sha256 !== lock.candidate.storage_binding_sha256) {
    throw new Error('RC0506_CANDIDATE_BINDING_MISMATCH');
  }
  process.stdout.write(`${JSON.stringify({
    schema_version: 1,
    status: 'PASS',
    summary_sha256: sha256(summaryPath),
    rc05_sha256: sha256(rc05Path),
    rc06_sha256: sha256(rc06Path),
    rc05: rc05.status,
    rc06: rc06.status,
    win10: summary.gates.win10,
    win7: 'NOT_PERFORMED',
    rc: 'NOT_PERFORMED',
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`RC0506_EVIDENCE_VERIFY_FAILED:${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function read(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function evidenceFile(root, name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name || '')) throw new Error('RC0506_EVIDENCE_FILENAME_INVALID');
  return path.join(root, name);
}
