#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getZipEntry } from './zip-utils.mjs';

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const upgradeModule = require(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-upgrade.cjs'));
const uninstallModule = require(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-uninstall.cjs'));

try {
  const args = parseArguments(process.argv.slice(2));
  const evidenceRoot = args.evidenceRoot;
  if (!fs.existsSync(evidenceRoot) || !fs.statSync(evidenceRoot).isDirectory()) throw new Error('RC0708_EVIDENCE_DIRECTORY_INVALID');
  const lock = read(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-lifecycle-lock.json'));
  const expectedKit = readExpectedKit(args.kitZip, lock);
  const reports = [];
  for (const scenario of lock.upgrade.scenarios) {
    const reportPath = path.join(evidenceRoot, `rc07-upgrade-${scenario}.json`);
    if (!fs.existsSync(reportPath)) throw new Error(`RC0708_UPGRADE_REPORT_MISSING:${scenario}`);
    const report = upgradeModule.validateRc07Report(read(reportPath), lock, scenario);
    verifyProvenance(report.kit_provenance, expectedKit, 'rc0708-upgrade.cjs');
    const exitCodePath = path.join(evidenceRoot, `rc0708-upgrade-exit-code-${scenario}.txt`);
    if (!fs.existsSync(exitCodePath) || fs.readFileSync(exitCodePath, 'ascii').trim() !== `RC0708_UPGRADE_EXIT_CODE=0`) {
      throw new Error(`RC0708_UPGRADE_EXIT_CODE_NOT_ZERO:${scenario}`);
    }
    const transcriptPath = path.join(evidenceRoot, `rc0708-upgrade-transcript-${scenario}.txt`);
    if (!fs.existsSync(transcriptPath)) throw new Error(`RC0708_UPGRADE_TRANSCRIPT_MISSING:${scenario}`);
    const transcript = fs.readFileSync(transcriptPath, 'utf8');
    if (!transcript.includes(`RC0708_UPGRADE_SCENARIO=${scenario}`) || !transcript.includes('RC0708_UPGRADE_BRANCH=residue')) {
      throw new Error(`RC0708_UPGRADE_TRANSCRIPT_INVALID:${scenario}`);
    }
    reports.push({ kind: 'rc07', scenario, sha256: sha256(reportPath), status: report.status });
  }
  for (const policy of lock.uninstall.policies) {
    const reportPath = path.join(evidenceRoot, `rc08-uninstall-${policy}.json`);
    if (!fs.existsSync(reportPath)) throw new Error(`RC0708_UNINSTALL_REPORT_MISSING:${policy}`);
    const report = uninstallModule.validateRc08Report(read(reportPath), lock, policy);
    verifyProvenance(report.kit_provenance, expectedKit, 'rc0708-uninstall.cjs');
    const exitCodePath = path.join(evidenceRoot, `rc0708-uninstall-exit-code-${policy}.txt`);
    if (!fs.existsSync(exitCodePath) || fs.readFileSync(exitCodePath, 'ascii').trim() !== `RC0708_UNINSTALL_EXIT_CODE=0`) {
      throw new Error(`RC0708_UNINSTALL_EXIT_CODE_NOT_ZERO:${policy}`);
    }
    const transcriptPath = path.join(evidenceRoot, `rc0708-uninstall-transcript-${policy}.txt`);
    if (!fs.existsSync(transcriptPath)) throw new Error(`RC0708_UNINSTALL_TRANSCRIPT_MISSING:${policy}`);
    const transcript = fs.readFileSync(transcriptPath, 'utf8');
    if (!transcript.includes(`RC0708_UNINSTALL_POLICY=${policy}`) || !transcript.includes('RC0708_UNINSTALL_BRANCH=cleanup_quarantine') || !transcript.includes('RC0708_QUARANTINE_REMOVED=1')) {
      throw new Error(`RC0708_UNINSTALL_TRANSCRIPT_INVALID:${policy}`);
    }
    reports.push({ kind: 'rc08', policy, sha256: sha256(reportPath), status: report.status });
  }
  process.stdout.write(`${JSON.stringify({
    schema_version: 1,
    status: 'PASS',
    reports,
    kit: {
      filename: path.basename(args.kitZip),
      sha256: sha256(args.kitZip),
      manifest_sha256: expectedKit.manifestSha256,
      source_commit: expectedKit.manifest.source_commit,
    },
    win10: 'PARTIAL_RC0708_LIFECYCLE_ONLY',
    win7: 'NOT_PERFORMED',
    rc: 'NOT_PERFORMED',
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`RC0708_EVIDENCE_VERIFY_FAILED:${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function read(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function parseArguments(argv) {
  if (argv.length !== 3 || argv[1] !== '--kit') {
    throw new Error('USAGE:verify-rc0708-evidence.mjs <evidence-directory> --kit <kit-zip>');
  }
  return { evidenceRoot: path.resolve(argv[0]), kitZip: path.resolve(argv[2]) };
}

function readExpectedKit(kitZip, lock) {
  if (!fs.existsSync(kitZip) || !fs.statSync(kitZip).isFile()) throw new Error('RC0708_KIT_ZIP_INVALID');
  const manifestBytes = getZipEntry(kitZip, 'KIT_MANIFEST.json');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!manifest || manifest.schema_version !== 1 || manifest.kit_id !== lock.kit_id ||
      manifest.target_candidate_sha256 !== lock.candidate.sha256 || !Array.isArray(manifest.files)) {
    throw new Error('RC0708_KIT_MANIFEST_INVALID');
  }
  const filesSha256 = Object.fromEntries(manifest.files.map((item) => [item.path, item.sha256]));
  if (Object.keys(filesSha256).length !== manifest.files.length) throw new Error('RC0708_KIT_MANIFEST_DUPLICATE');
  return { manifest, manifestSha256: digest(manifestBytes), filesSha256 };
}

function verifyProvenance(actual, expected, entrypoint) {
  const manifest = expected.manifest;
  if (!actual || actual.schema_version !== 1 || actual.kit_id !== manifest.kit_id ||
      actual.source_commit !== manifest.source_commit || actual.target_candidate_sha256 !== manifest.target_candidate_sha256 ||
      actual.manifest_sha256 !== expected.manifestSha256 || actual.manifest_files_verified !== true ||
      actual.entrypoint !== entrypoint || actual.entrypoint_sha256 !== expected.filesSha256[entrypoint] ||
      JSON.stringify(actual.files_sha256) !== JSON.stringify(expected.filesSha256) ||
      !Array.isArray(actual.unexpected_control_files) || actual.unexpected_control_files.length !== 0) {
    throw new Error(`RC0708_EXECUTION_PROVENANCE_MISMATCH:${entrypoint}`);
  }
}
