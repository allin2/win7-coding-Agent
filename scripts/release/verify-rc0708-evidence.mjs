#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const upgradeModule = require(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-upgrade.cjs'));
const uninstallModule = require(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-uninstall.cjs'));

try {
  const evidenceRoot = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.statSync(evidenceRoot).isDirectory()) throw new Error('USAGE:verify-rc0708-evidence.mjs <evidence-directory>');
  const lock = read(path.join(repositoryRoot, 'release', 'win7-rc', 'rc0708-lifecycle-lock.json'));
  const reports = [];
  for (const scenario of lock.upgrade.scenarios) {
    const reportPath = path.join(evidenceRoot, `rc07-upgrade-${scenario}.json`);
    if (!fs.existsSync(reportPath)) throw new Error(`RC0708_UPGRADE_REPORT_MISSING:${scenario}`);
    const report = upgradeModule.validateRc07Report(read(reportPath), lock, scenario);
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
