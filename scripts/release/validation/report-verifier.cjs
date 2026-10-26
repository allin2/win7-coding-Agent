'use strict';
// Candidate-external pilot. The caller must verify and pin configuration and candidate identity first.
// Derived report-validation rules from W42; historical candidate files remain untouched.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const VERSION = 'report-verifier-pilot-v1';
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function assert(condition, code) { if (!condition) throw new Error(code); }
function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function rejectSecrets(value) {
  const serialized = JSON.stringify(value);
  assert(!/(?:Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(serialized), 'REPORT_SECRET_MATERIAL');
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!plain(item)) return;
    for (const [key, child] of Object.entries(item)) {
      assert(!/^(?:api[_-]?key|apikey|authorization|password|secret|access[_-]?token|refresh[_-]?token|credentials?|private[_-]?key)$/i.test(key), `REPORT_SECRET_FIELD:${key}`);
      visit(child);
    }
  };
  visit(value);
}


function createReportVerifier(configuration, toolRoot, fileSystem = fs) {
  const fields = ['schema_version', 'candidate_label', 'kit_id', 'report_kind', 'case_ids', 'result_on_complete', 'tools'];
  assert(plain(configuration) && configuration.schema_version === 1
    && Object.keys(configuration).length === fields.length
    && fields.every((field) => Object.prototype.hasOwnProperty.call(configuration, field)), 'REPORT_CONFIGURATION_INVALID');
  for (const field of ['candidate_label', 'kit_id', 'report_kind', 'result_on_complete']) {
    assert(typeof configuration[field] === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(configuration[field]), 'REPORT_CONFIGURATION_INVALID');
  }
  assert(Array.isArray(configuration.case_ids) && configuration.case_ids.length > 0
    && configuration.case_ids.every((id) => typeof id === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(id))
    && new Set(configuration.case_ids).size === configuration.case_ids.length, 'REPORT_CONFIGURATION_CASES_INVALID');
  assert(Array.isArray(configuration.tools) && configuration.tools.length > 0, 'REPORT_TOOLS_REQUIRED');
  const realRoot = fileSystem.realpathSync(toolRoot);
  const toolPaths = new Set();
  for (const tool of configuration.tools) {
    assert(plain(tool) && Object.keys(tool).length === 3 && typeof tool.path === 'string'
      && tool.path.length > 0 && !path.isAbsolute(tool.path) && !toolPaths.has(tool.path)
      && typeof tool.version === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(tool.version)
      && /^[a-f0-9]{64}$/.test(tool.sha256 || ''), 'REPORT_TOOL_BINDING_INVALID');
    const target = fileSystem.realpathSync(path.resolve(realRoot, tool.path));
    assert(contained(realRoot, target) && fileSystem.statSync(target).isFile(), 'REPORT_TOOL_PATH_ESCAPE');
    assert(sha256(fileSystem.readFileSync(target)) === tool.sha256, 'REPORT_TOOL_HASH_MISMATCH');
    toolPaths.add(tool.path);
  }
  // Snapshot caller input: later mutation cannot change admitted rules.
  configuration = JSON.parse(JSON.stringify(configuration));
  const CANDIDATE_LABEL = configuration.candidate_label;
  const KIT_ID = configuration.kit_id;
  const REPORT_KIND = configuration.report_kind;
  const EXPECTED_CASES = configuration.case_ids;
  function validateEvidence(evidence, evidenceRoot, fileSystem, caseId) {
    assert(Array.isArray(evidence) && evidence.length > 0, `REPORT_EVIDENCE_REQUIRED:${caseId}`);
    for (const item of evidence) {
      assert(plain(item) && typeof item.path === 'string' && item.path.length > 0
        && /^[a-f0-9]{64}$/.test(item.sha256 || '') && Number.isSafeInteger(item.bytes) && item.bytes >= 0,
      `REPORT_EVIDENCE_ENTRY_INVALID:${caseId}`);
      const absolute = path.resolve(evidenceRoot, item.path);
      assert(contained(evidenceRoot, absolute), `REPORT_EVIDENCE_PATH_ESCAPE:${caseId}:${item.path}`);
      assert(fileSystem.existsSync(absolute) && fileSystem.statSync(absolute).isFile(), `REPORT_EVIDENCE_NOT_FOUND:${caseId}:${item.path}`);
      assert(contained(fileSystem.realpathSync(evidenceRoot), fileSystem.realpathSync(absolute)), `REPORT_EVIDENCE_REALPATH_ESCAPE:${caseId}`);
      const bytes = fileSystem.readFileSync(absolute);
      assert(bytes.length === item.bytes, `REPORT_EVIDENCE_SIZE_MISMATCH:${caseId}:${item.path}`);
      assert(sha256(bytes) === item.sha256, `REPORT_EVIDENCE_HASH_MISMATCH:${caseId}:${item.path}`);
    }
  }

  function validateExecution(execution, validationCase, identity, evidenceRoot, fileSystem) {
    assert(plain(execution) && canonical(execution.candidate) === canonical(identity), `REPORT_EXECUTION_CANDIDATE_MISMATCH:${validationCase.case_id}`);
    assert(typeof execution.run_id === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(execution.run_id), `REPORT_RUN_ID_INVALID:${validationCase.case_id}`);
    assert(plain(execution.environment)
      && execution.environment.os === 'Windows 7 SP1 build 7601'
      && execution.environment.architecture === 'x64'
      && execution.environment.user === 'ordinary-user'
      && execution.environment.elevation === 'not-elevated'
      && execution.environment.electron === '22.3.27'
      && execution.environment.electron_abi === 110,
    `REPORT_ENVIRONMENT_INVALID:${validationCase.case_id}`);
    assert(Array.isArray(execution.assertions), `REPORT_ASSERTIONS_REQUIRED:${validationCase.case_id}`);
    const expected = new Set(validationCase.assertions.map((item) => item.assertion_id));
    const seen = new Set();
    for (const assertion of execution.assertions) {
      assert(plain(assertion) && expected.has(assertion.assertion_id) && !seen.has(assertion.assertion_id)
        && assertion.status === 'PASS', `REPORT_ASSERTION_INVALID:${validationCase.case_id}`);
      seen.add(assertion.assertion_id);
    }
    assert(seen.size === expected.size, `REPORT_ASSERTIONS_MISSING:${validationCase.case_id}`);
    validateEvidence(execution.evidence, evidenceRoot, fileSystem, validationCase.case_id);
  }

  function verifyReport(report, kit, identity, evidenceRoot, fileSystem = fs) {
    rejectSecrets(report);
    assert(identity && identity.candidate_label === CANDIDATE_LABEL, 'REPORT_IDENTITY_LABEL_MISMATCH');
    assert(plain(kit) && plain(kit.scope) && kit.scope.result_on_complete === configuration.result_on_complete, 'REPORT_COMPLETION_MISMATCH');
    assert(plain(kit) && kit.schema_version === 1 && kit.kit_id === KIT_ID
      && kit.candidate_label === CANDIDATE_LABEL && Array.isArray(kit.required_cases)
      && kit.required_cases.length === EXPECTED_CASES.length,
    'REPORT_KIT_INVALID');
    assert(plain(kit.scope) && typeof kit.scope.result_on_complete === 'string'
      && kit.scope.result_on_complete.length > 0, 'REPORT_KIT_RESULT_ON_COMPLETE_REQUIRED');
    for (const caseId of EXPECTED_CASES) {
      assert(kit.required_cases.some((item) => item.case_id === caseId && Array.isArray(item.assertions) && item.assertions.length > 0),
        `REPORT_KIT_CASE_MISSING:${caseId}`);
    }
    assert(plain(report) && report.schema_version === 1 && report.report_kind === REPORT_KIND, 'REPORT_SCHEMA_INVALID');
    assert(canonical(report.candidate) === canonical(identity), 'REPORT_CANDIDATE_BINDING_MISMATCH');
    assert(Array.isArray(report.results) && report.results.length === kit.required_cases.length, 'REPORT_RESULT_COUNT_INVALID');
    const expected = new Map(kit.required_cases.map((item) => [item.case_id, item]));
    const seen = new Set();
    for (const result of report.results) {
      assert(plain(result) && expected.has(result.case_id) && !seen.has(result.case_id), `REPORT_CASE_ID_INVALID:${result && result.case_id}`);
      seen.add(result.case_id);
      assert(['PASS', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING'].includes(result.status), `REPORT_CASE_STATUS_INVALID:${result.case_id}`);
      assert(Array.isArray(result.executions), `REPORT_EXECUTIONS_REQUIRED:${result.case_id}`);
      if (result.status === 'PASS') {
        assert(result.executions.length > 0, `REPORT_PASS_WITHOUT_EXECUTION:${result.case_id}`);
        result.executions.forEach((execution) => validateExecution(execution, expected.get(result.case_id), identity, evidenceRoot, fileSystem));
      }
    }
    assert(seen.size === expected.size, 'REPORT_CASE_SET_INCOMPLETE');
    const complete = report.results.every((item) => item.status === 'PASS');
    const expectedStatus = report.results.some((item) => item.status === 'FAIL') ? 'FAIL' : complete ? 'PASS' : 'EVIDENCE_PENDING';
    assert(report.status === expectedStatus, 'REPORT_OVERALL_STATUS_INVALID');
    return {
      status: report.status,
      disposition: report.status === 'PASS' ? kit.scope.result_on_complete : report.status,
      candidate: identity,
      verified_cases: report.results.length,
      direct_current_candidate_cases: report.results.filter((item) => item.status === 'PASS').length,
    };
  }


  return { verifyReport, version: VERSION };
}
module.exports = { createReportVerifier, VERSION };
