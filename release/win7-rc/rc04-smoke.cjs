'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function main(argv) {
  if (process.platform !== 'win32') throw new Error(`RC04_WINDOWS_REQUIRED:${process.platform}`);
  const args = parseArguments(argv);
  const packageRoot = fs.realpathSync(__dirname);
  const electron = path.join(packageRoot, 'electron.exe');
  const releaseManifest = path.join(packageRoot, 'release-manifest.json');
  requireFile(electron, 'RC04_ELECTRON');
  requireFile(releaseManifest, 'RC04_RELEASE_MANIFEST');
  fs.mkdirSync(args.evidenceRoot, { recursive: true });
  fs.mkdirSync(args.userDataRoot, { recursive: true });
  const rounds = [];
  for (let round = 1; round <= 2; round += 1) {
    const reportPath = path.join(args.evidenceRoot, `rc04-product-smoke-round-${round}.json`);
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(electron, [
      `--mvp-id=A7-RC04-${round}`,
      `--smoke-report=${reportPath}`,
      `--user-data-dir=${args.userDataRoot}`,
      '--disable-gpu',
    ], {
      cwd: packageRoot,
      env: environment,
      encoding: 'utf8',
      timeout: 90_000,
      windowsHide: true,
    });
    if (result.error) throw new Error(`RC04_ELECTRON_SPAWN_FAILED:${result.error.message}`);
    if (result.status !== 0 || result.signal) {
      throw new Error(`RC04_ELECTRON_EXIT_FAILED:round=${round};status=${result.status};signal=${result.signal || ''};stderr=${bounded(result.stderr)}`);
    }
    const report = readJson(reportPath, `RC04_REPORT_ROUND_${round}`);
    validateReport(report);
    rounds.push({
      round,
      report: path.basename(reportPath),
      report_sha256: sha256(reportPath),
      stdout: bounded(result.stdout),
      stderr: bounded(result.stderr),
    });
  }
  const databasePath = path.join(args.userDataRoot, 'state', 'agent-events-v2.db');
  requireFile(databasePath, 'RC04_STATE_DATABASE');
  const transient = [`${databasePath}-wal`, `${databasePath}-shm`].filter((item) => fs.existsSync(item));
  if (transient.length > 0) throw new Error(`RC04_SQLITE_TRANSIENT_RESIDUE:${transient.join(',')}`);
  const summary = {
    schema_version: 1,
    suite: 'RC04_WINDOWS_PRODUCT_SMOKE',
    status: 'PASS',
    platform: process.platform,
    architecture: process.arch,
    package_root: packageRoot,
    release_manifest_sha256: sha256(releaseManifest),
    state_database: {
      path: databasePath,
      size: fs.statSync(databasePath).size,
      sha256: sha256(databasePath),
      wal_shm_residue: [],
    },
    rounds,
    gates: {
      rc04_windows_product_smoke: 'PASS',
      win10: 'PARTIAL_RC04_SMOKE_ONLY',
      win7: 'NOT_PERFORMED',
      rc: 'NOT_PERFORMED',
    },
  };
  const summaryPath = path.join(args.evidenceRoot, 'rc04-product-smoke-summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function validateReport(report) {
  if (!report || report.schema_version !== 1 || report.exit_code !== 0 || !Array.isArray(report.cases)) {
    throw new Error('RC04_SMOKE_REPORT_INVALID');
  }
  for (const caseId of ['PRODUCT_ENTRY_START_RENDER_EXIT', 'PRODUCT_SECURITY_BASELINE', 'RC_PRODUCT_COMPOSITION']) {
    const matches = report.cases.filter((item) => item && item.case_id === caseId);
    if (matches.length !== 1 || matches[0].status !== 'PASS') throw new Error(`RC04_SMOKE_CASE_FAILED:${caseId}`);
  }
  const composition = report.cases.find((item) => item.case_id === 'RC_PRODUCT_COMPOSITION');
  const metrics = composition.metrics || {};
  if (metrics.runner_profile !== 'win7-whoami' || metrics.storage_profile !== 'E22-SQLITE343-LOCAL-SSD' ||
      metrics.sqlite_version !== '3.43.1' || String(metrics.journal_mode).toLowerCase() !== 'wal' ||
      metrics.interactive_terminal !== 'disabled-winpty-node-pty-not-packaged' ||
      metrics.arbitrary_shell !== 'disabled-fixed-low-risk-profile-only') {
    throw new Error('RC04_COMPOSITION_METRICS_INVALID');
  }
  const entry = report.cases.find((item) => item.case_id === 'PRODUCT_ENTRY_START_RENDER_EXIT');
  if (!entry.metrics || entry.metrics.renderer_ready !== true || entry.metrics.diagnostics_requested !== true ||
      entry.metrics.runtime_error_count !== 0) {
    throw new Error('RC04_PRODUCT_ENTRY_METRICS_INVALID');
  }
  return report;
}

function parseArguments(argv) {
  const values = {};
  for (const item of argv) {
    const separator = item.indexOf('=');
    if (separator < 1) throw new Error(`RC04_ARGUMENT_INVALID:${item}`);
    const key = item.slice(0, separator);
    const value = item.slice(separator + 1);
    if (!value) throw new Error(`RC04_ARGUMENT_INVALID:${item}`);
    if (key === '--evidence') values.evidenceRoot = path.resolve(value);
    else if (key === '--user-data') values.userDataRoot = path.resolve(value);
    else throw new Error(`RC04_ARGUMENT_UNKNOWN:${key}`);
  }
  if (!values.evidenceRoot || !values.userDataRoot) {
    throw new Error('USAGE: electron.exe RC04_SMOKE.cjs --evidence=<absolute-dir> --user-data=<absolute-dir>');
  }
  if (sameOrNested(values.evidenceRoot, values.userDataRoot) || sameOrNested(values.userDataRoot, values.evidenceRoot)) {
    throw new Error('RC04_EVIDENCE_AND_USER_DATA_MUST_BE_SEPARATE');
  }
  return values;
}

function sameOrNested(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`${label}_MISSING:${filePath}`);
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) { throw new Error(`${label}_INVALID:${error && error.message ? error.message : String(error)}`); }
}

function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function bounded(value) { return String(value || '').slice(0, 16 * 1024); }

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`RC04_SMOKE_FAILED:${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseArguments, validateReport };
