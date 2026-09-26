// DERIVED FROM THE FROZEN WIN7-37 ARTIFACT — WIN7-38 A9-20 & A9-21, ADR-0141.
// Candidate-scoped tokens rebased to WIN7-38 / W38 / A9-22.
'use strict';

/**
 * A9-22 / WIN7-38 验收报告器（ADR-0141）。
 * 覆盖 15 项用例：W38-01～W38-15（A9-20 Git 确认分类器绕过修复 + A9-21 运行时加固）。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { selectPhysicalFileSystem, verifyAcceptanceCandidate } = require('./a9-package-integrity-w38.cjs');
const contract = require('./a9-projection-contract.cjs');

const CANDIDATE_LABEL = 'WIN7-38';
const KIT_ID = 'A9-22-WIN7-38-20260926-01';
const REPORT_KIND = 'A9_22_WIN7_38_A9_20_A9_21_ACCEPTANCE';
const QUERY_EXPORT_KIND = contract.QUERY_EXPORT_KIND;
const DOM_EXPORT_KIND = contract.DOM_EXPORT_KIND;
const QUERY_EXPORT_SCHEMA_VERSION = contract.QUERY_EXPORT_SCHEMA_VERSION;
const DOM_EXPORT_SCHEMA_VERSION = contract.DOM_EXPORT_SCHEMA_VERSION;
const INSPECTOR_DISPLAY_RULE = contract.INSPECTOR_DISPLAY_RULE;
const INSPECTOR_DISPLAY_ROWS = contract.INSPECTOR_DISPLAY_ROWS;
const REQUIRED_CASE_COUNT = 15;

const EXPECTED_CASES = [
  'W38-01-CANDIDATE-INTEGRITY',
  'W38-02-CHINESE-SPACE-PATH',
  'W38-03-STARTUP-WORKSPACE-SELECT',
  'W38-04-TASK-READ-EDIT-SHELL',
  'W38-05-DIFF-AND-CHECKPOINT',
  'W38-06-APPROVAL-STOP-RESTART',
  'W38-07-A9-20-CMD-CONCAT-GIT-CONFIRM',
  'W38-08-A9-20-POWERSHELL-PREFIX-GIT-CONFIRM',
  'W38-09-A9-20-POWERSHELL-POSITIONAL-GIT-CONFIRM',
  'W38-10-M1-STARTUP-TARGETED-RECOVERY',
  'W38-11-M1B-HEX-FREEZE-AND-URL-REDACTION',
  'W38-12-M2-OUTPUT-LIMITS',
  'W38-13-M3-CHECKPOINT-PAGINATION',
  'W38-14-M4-COLLECTION-BOUNDS',
  'W38-15-SECRET-SCAN-AND-POSTFLIGHT',
];

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function assert(condition, code) { if (!condition) throw new Error(code); }
function isEventId(value) { return Number.isSafeInteger(value) && value > 0; }
function argumentsOf(argv) {
  const values = { command: argv[0] || '' };
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    assert(item.startsWith('--'), `A9_W38_ARGUMENT_INVALID:${item}`);
    const equal = item.indexOf('=');
    if (equal > 2) values[item.slice(2, equal)] = item.slice(equal + 1);
    else {
      assert(index + 1 < argv.length, `A9_W38_ARGUMENT_VALUE_MISSING:${item}`);
      values[item.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return values;
}
function requiredFile(value, label, fileSystem) {
  assert(typeof value === 'string' && value, `A9_W38_${label}_REQUIRED`);
  const filePath = path.resolve(value);
  assert(fileSystem.existsSync(filePath) && fileSystem.statSync(filePath).isFile(), `A9_W38_${label}_NOT_FILE`);
  return fileSystem.realpathSync(filePath);
}
function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function rejectSecrets(value) {
  const serialized = JSON.stringify(value);
  assert(!/(?:Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(serialized), 'A9_W38_REPORT_SECRET_MATERIAL');
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!plain(item)) return;
    for (const [key, child] of Object.entries(item)) {
      assert(!/^(?:api[_-]?key|apikey|authorization|password|secret|access[_-]?token|refresh[_-]?token|credentials?|private[_-]?key)$/i.test(key), `A9_W38_REPORT_SECRET_FIELD:${key}`);
      visit(child);
    }
  };
  visit(value);
}

function identityFrom(options, fileSystem) {
  const zipPath = requiredFile(options.zip, 'ZIP', fileSystem);
  const manifestPath = requiredFile(options['release-manifest'], 'MANIFEST', fileSystem);
  const kitPath = requiredFile(options.kit, 'KIT', fileSystem);
  const verified = verifyAcceptanceCandidate(zipPath, manifestPath, kitPath, {
    formalInputLockPath: requiredFile(options['formal-input-lock'], 'FORMAL_INPUT_LOCK', fileSystem),
    approvalRegistryPath: requiredFile(options['approval-registry'], 'APPROVAL_REGISTRY', fileSystem),
    releaseAuthorityPath: requiredFile(options['release-authority'], 'RELEASE_AUTHORITY', fileSystem),
    releaseAuthoritySha256: options['release-authority-sha256'],
  }, fileSystem);
  return {
    candidate_id: verified.manifest.release_id,
    candidate_label: CANDIDATE_LABEL,
    candidate_version: verified.manifest.version,
    source_commit: verified.manifest.source_commit,
    package_filename: path.basename(zipPath),
    package_sha256: verified.packageSha256,
    candidate_manifest_sha256: verified.manifestSha256,
    release_authority: verified.authorityIdentity,
  };
}

function template(kit, identity) {
  return {
    schema_version: 1,
    report_kind: REPORT_KIND,
    recorded_at: new Date().toISOString(),
    status: 'EVIDENCE_PENDING',
    candidate: identity,
    results: kit.required_cases.map((item) => ({
      case_id: item.case_id,
      status: 'EVIDENCE_PENDING',
      executions: [],
    })),
  };
}

function validateEvidence(evidence, evidenceRoot, fileSystem, caseId) {
  assert(Array.isArray(evidence) && evidence.length > 0, `A9_W38_EVIDENCE_REQUIRED:${caseId}`);
  for (const item of evidence) {
    assert(plain(item) && typeof item.path === 'string' && item.path.length > 0
      && /^[a-f0-9]{64}$/.test(item.sha256 || '') && Number.isSafeInteger(item.bytes) && item.bytes >= 0,
    `A9_W38_EVIDENCE_ENTRY_INVALID:${caseId}`);
    const absolute = path.resolve(evidenceRoot, item.path);
    assert(contained(evidenceRoot, absolute), `A9_W38_EVIDENCE_PATH_ESCAPE:${caseId}:${item.path}`);
    assert(fileSystem.existsSync(absolute) && fileSystem.statSync(absolute).isFile(), `A9_W38_EVIDENCE_NOT_FOUND:${caseId}:${item.path}`);
    const bytes = fileSystem.readFileSync(absolute);
    assert(bytes.length === item.bytes, `A9_W38_EVIDENCE_SIZE_MISMATCH:${caseId}:${item.path}`);
    assert(sha256(bytes) === item.sha256, `A9_W38_EVIDENCE_HASH_MISMATCH:${caseId}:${item.path}`);
  }
}

function validateExecution(execution, validationCase, identity, evidenceRoot, fileSystem) {
  assert(plain(execution) && canonical(execution.candidate) === canonical(identity), `A9_W38_EXECUTION_CANDIDATE_MISMATCH:${validationCase.case_id}`);
  assert(typeof execution.run_id === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(execution.run_id), `A9_W38_RUN_ID_INVALID:${validationCase.case_id}`);
  assert(plain(execution.environment)
    && execution.environment.os === 'Windows 7 SP1 build 7601'
    && execution.environment.architecture === 'x64'
    && execution.environment.user === 'ordinary-user'
    && execution.environment.elevation === 'not-elevated'
    && execution.environment.electron === '22.3.27'
    && execution.environment.electron_abi === 110,
  `A9_W38_ENVIRONMENT_INVALID:${validationCase.case_id}`);
  assert(Array.isArray(execution.assertions), `A9_W38_ASSERTIONS_REQUIRED:${validationCase.case_id}`);
  const expected = new Set(validationCase.assertions.map((item) => item.assertion_id));
  const seen = new Set();
  for (const assertion of execution.assertions) {
    assert(plain(assertion) && expected.has(assertion.assertion_id) && !seen.has(assertion.assertion_id)
      && assertion.status === 'PASS', `A9_W38_ASSERTION_INVALID:${validationCase.case_id}`);
    seen.add(assertion.assertion_id);
  }
  assert(seen.size === expected.size, `A9_W38_ASSERTIONS_MISSING:${validationCase.case_id}`);
  validateEvidence(execution.evidence, evidenceRoot, fileSystem, validationCase.case_id);
}

function verifyReport(report, kit, identity, evidenceRoot, fileSystem) {
  rejectSecrets(report);
  assert(plain(kit) && kit.schema_version === 1 && kit.kit_id === KIT_ID
    && kit.candidate_label === CANDIDATE_LABEL && Array.isArray(kit.required_cases)
    && kit.required_cases.length === REQUIRED_CASE_COUNT,
  'A9_W38_KIT_INVALID');
  for (const caseId of EXPECTED_CASES) {
    assert(kit.required_cases.some((item) => item.case_id === caseId && Array.isArray(item.assertions) && item.assertions.length > 0),
      `A9_W38_KIT_CASE_MISSING:${caseId}`);
  }
  assert(plain(report) && report.schema_version === 1 && report.report_kind === REPORT_KIND, 'A9_W38_REPORT_SCHEMA_INVALID');
  assert(canonical(report.candidate) === canonical(identity), 'A9_W38_CANDIDATE_BINDING_MISMATCH');
  assert(Array.isArray(report.results) && report.results.length === kit.required_cases.length, 'A9_W38_RESULT_COUNT_INVALID');
  const expected = new Map(kit.required_cases.map((item) => [item.case_id, item]));
  const seen = new Set();
  for (const result of report.results) {
    assert(plain(result) && expected.has(result.case_id) && !seen.has(result.case_id), `A9_W38_CASE_ID_INVALID:${result && result.case_id}`);
    seen.add(result.case_id);
    assert(['PASS', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING'].includes(result.status), `A9_W38_CASE_STATUS_INVALID:${result.case_id}`);
    assert(Array.isArray(result.executions), `A9_W38_EXECUTIONS_REQUIRED:${result.case_id}`);
    if (result.status === 'PASS') {
      assert(result.executions.length > 0, `A9_W38_PASS_WITHOUT_EXECUTION:${result.case_id}`);
      result.executions.forEach((execution) => validateExecution(execution, expected.get(result.case_id), identity, evidenceRoot, fileSystem));
    }
  }
  assert(seen.size === expected.size, 'A9_W38_CASE_SET_INCOMPLETE');
  const complete = report.results.every((item) => item.status === 'PASS');
  const expectedStatus = report.results.some((item) => item.status === 'FAIL') ? 'FAIL' : complete ? 'PASS' : 'EVIDENCE_PENDING';
  assert(report.status === expectedStatus, 'A9_W38_OVERALL_STATUS_INVALID');
  return {
    status: report.status,
    disposition: report.status === 'PASS' ? 'A9_22_WIN7_38_A9_20_A9_21_PASS' : report.status,
    candidate: identity,
    verified_cases: report.results.length,
    direct_current_candidate_cases: report.results.filter((item) => item.status === 'PASS').length,
  };
}

function main(argv = process.argv.slice(2)) {
  const options = argumentsOf(argv);
  const fileSystem = selectPhysicalFileSystem();
  const kitPath = requiredFile(options.kit, 'KIT', fileSystem);
  const kit = JSON.parse(fileSystem.readFileSync(kitPath, 'utf8'));
  const identity = identityFrom(options, fileSystem);
  if (options.command === 'init') {
    process.stdout.write(`${JSON.stringify(template(kit, identity), null, 2)}\n`);
    return;
  }
  assert(options.command === 'verify', 'A9_W38_COMMAND_INVALID');
  const reportPath = requiredFile(options.report, 'REPORT', fileSystem);
  assert(typeof options['evidence-root'] === 'string' && options['evidence-root'], 'A9_W38_EVIDENCE_ROOT_REQUIRED');
  const evidenceRoot = fileSystem.realpathSync(path.resolve(options['evidence-root']));
  const report = JSON.parse(fileSystem.readFileSync(reportPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(verifyReport(report, kit, identity, evidenceRoot, fileSystem), null, 2)}\n`);
}

module.exports = {
  argumentsOf, identityFrom, template, verifyReport,
  KIT_ID, REPORT_KIND, REQUIRED_CASE_COUNT, EXPECTED_CASES,
};
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
