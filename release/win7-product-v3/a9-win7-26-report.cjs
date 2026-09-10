'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { selectPhysicalFileSystem, verifyAcceptanceCandidate } = require('./a9-package-integrity-w26.cjs');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function assert(condition, code) { if (!condition) throw new Error(code); }
function argumentsOf(argv) {
  const values = { command: argv[0] || '' };
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    assert(item.startsWith('--'), `A9_W26_ARGUMENT_INVALID:${item}`);
    const equal = item.indexOf('=');
    if (equal > 2) values[item.slice(2, equal)] = item.slice(equal + 1);
    else {
      assert(index + 1 < argv.length, `A9_W26_ARGUMENT_VALUE_MISSING:${item}`);
      values[item.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return values;
}
function requiredFile(value, label, fileSystem) {
  assert(typeof value === 'string' && value, `A9_W26_${label}_REQUIRED`);
  const filePath = path.resolve(value);
  assert(fileSystem.existsSync(filePath) && fileSystem.statSync(filePath).isFile(), `A9_W26_${label}_NOT_FILE`);
  return fileSystem.realpathSync(filePath);
}
function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function rejectSecrets(value) {
  const serialized = JSON.stringify(value);
  assert(!/(?:Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(serialized), 'A9_W26_REPORT_SECRET_MATERIAL');
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!plain(item)) return;
    for (const [key, child] of Object.entries(item)) {
      assert(!/^(?:api[_-]?key|apikey|authorization|password|secret|access[_-]?token|refresh[_-]?token|credentials?|private[_-]?key)$/i.test(key), `A9_W26_REPORT_SECRET_FIELD:${key}`);
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
    release_id: verified.manifest.release_id,
    candidate_label: 'WIN7-26',
    version: verified.manifest.version,
    source_commit: verified.manifest.source_commit,
    package_filename: path.basename(zipPath),
    package_sha256: verified.packageSha256,
    manifest_sha256: verified.manifestSha256,
    ...verified.authorityIdentity,
  };
}

function template(kit, identity) {
  return {
    schema_version: 1,
    report_kind: 'A9_15_WIN7_26_UI_PROGRESS_ACCEPTANCE',
    candidate: identity,
    status: 'NOT_PERFORMED',
    results: kit.required_cases.map((validationCase) => ({
      case_id: validationCase.case_id,
      status: 'NOT_PERFORMED',
      executions: [],
    })),
  };
}

function validateEvidence(entries, evidenceRoot, fileSystem, caseId) {
  assert(Array.isArray(entries) && entries.length > 0, `A9_W26_EVIDENCE_REQUIRED:${caseId}`);
  const seen = new Set();
  for (const item of entries) {
    assert(plain(item) && typeof item.path === 'string' && item.path
      && /^[a-f0-9]{64}$/.test(String(item.sha256 || '')) && !seen.has(item.path), `A9_W26_EVIDENCE_ENTRY_INVALID:${caseId}`);
    seen.add(item.path);
    const unresolved = path.resolve(evidenceRoot, item.path);
    assert(fileSystem.existsSync(unresolved) && fileSystem.statSync(unresolved).isFile(), `A9_W26_EVIDENCE_NOT_FILE:${caseId}:${item.path}`);
    const absolute = fileSystem.realpathSync(unresolved);
    assert(contained(evidenceRoot, absolute), `A9_W26_EVIDENCE_ESCAPES_ROOT:${caseId}:${item.path}`);
    assert(sha256(fileSystem.readFileSync(absolute)) === item.sha256, `A9_W26_EVIDENCE_HASH_MISMATCH:${caseId}:${item.path}`);
  }
}

function validateArtifactRef(reference, evidence, caseId) {
  assert(plain(reference) && typeof reference.path === 'string' && /^[a-f0-9]{64}$/.test(reference.sha256 || ''),
    `A9_W26_PROJECTION_ARTIFACT_INVALID:${caseId}`);
  assert(evidence.some((item) => item.path === reference.path && item.sha256 === reference.sha256),
    `A9_W26_PROJECTION_ARTIFACT_UNBOUND:${caseId}`);
}

function validateProjectionEvidence(proof, evidence, caseId) {
  assert(plain(proof) && typeof proof.conversation_id === 'string' && proof.conversation_id.length > 0,
    `A9_W26_PROJECTION_EVIDENCE_REQUIRED:${caseId}`);
  if (caseId === 'W26-03-INSPECTOR-PERSISTED-RESTART') {
    const queried = proof.queried_event_ids;
    const inspector = proof.inspector_event_ids;
    assert(Array.isArray(queried) && queried.length > 0
      && queried.every((id, index) => Number.isSafeInteger(id) && id > 0 && (index === 0 || id > queried[index - 1])),
    'A9_W26_INSPECTOR_QUERY_ORDER_INVALID');
    assert(Array.isArray(inspector) && canonical(inspector) === canonical(queried), 'A9_W26_INSPECTOR_QUERY_DOM_MISMATCH');
    assert(Array.isArray(proof.session_event_ids) && proof.session_event_ids.length > 0
      && proof.session_event_ids.every((id) => queried.includes(id)), 'A9_W26_INSPECTOR_SESSION_EVENTS_MISSING');
    assert(proof.unique === true && proof.cross_session_residue === false, 'A9_W26_INSPECTOR_SCOPE_INVALID');
  } else if (caseId === 'W26-04-LATEST-OUTCOME-PROJECTION') {
    const older = proof.older_failure;
    const newer = proof.newer_success;
    assert(plain(older) && Number.isSafeInteger(older.event_id) && older.event_id > 0
      && typeof older.turn_id === 'string' && older.turn_id
      && older.outcome === 'failed' && older.verification === 'not_applicable', 'A9_W26_OLDER_FAILURE_BINDING_INVALID');
    assert(plain(newer) && Number.isSafeInteger(newer.event_id) && newer.event_id > older.event_id
      && typeof newer.turn_id === 'string' && newer.turn_id
      && newer.outcome === 'completed' && newer.verification === 'verified', 'A9_W26_NEWER_SUCCESS_BINDING_INVALID');
    assert(proof.latest_persisted_turn_id === newer.turn_id && proof.restart_displayed_outcome === 'completed · verified'
      && proof.older_event_load_displayed_outcome === 'completed · verified', 'A9_W26_LATEST_OUTCOME_DOM_MISMATCH');
  }
  validateArtifactRef(proof.dom_export, evidence, caseId);
}

function validateExecution(execution, validationCase, identity, evidenceRoot, fileSystem) {
  assert(plain(execution) && canonical(execution.candidate) === canonical(identity), `A9_W26_EXECUTION_CANDIDATE_MISMATCH:${validationCase.case_id}`);
  assert(typeof execution.run_id === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(execution.run_id), `A9_W26_RUN_ID_INVALID:${validationCase.case_id}`);
  assert(plain(execution.environment)
    && execution.environment.os === 'Windows 7 SP1 build 7601'
    && execution.environment.architecture === 'x64'
    && execution.environment.user === 'ordinary-user'
    && execution.environment.elevation === 'not-elevated'
    && execution.environment.electron === '22.3.27'
    && execution.environment.electron_abi === 110,
  `A9_W26_ENVIRONMENT_INVALID:${validationCase.case_id}`);
  assert(Array.isArray(execution.assertions), `A9_W26_ASSERTIONS_REQUIRED:${validationCase.case_id}`);
  const expected = new Set(validationCase.assertions.map((item) => item.assertion_id));
  const seen = new Set();
  for (const assertion of execution.assertions) {
    assert(plain(assertion) && expected.has(assertion.assertion_id) && !seen.has(assertion.assertion_id)
      && assertion.status === 'PASS', `A9_W26_ASSERTION_INVALID:${validationCase.case_id}`);
    seen.add(assertion.assertion_id);
  }
  assert(seen.size === expected.size, `A9_W26_ASSERTIONS_MISSING:${validationCase.case_id}`);
  validateEvidence(execution.evidence, evidenceRoot, fileSystem, validationCase.case_id);
  if (validationCase.case_id === 'W26-03-INSPECTOR-PERSISTED-RESTART'
      || validationCase.case_id === 'W26-04-LATEST-OUTCOME-PROJECTION') {
    validateProjectionEvidence(execution.projection_evidence, execution.evidence, validationCase.case_id);
  }
  if (validationCase.case_id === 'W26-07-REAL-PROVIDER-MULTITOOL') {
    assert(execution.provider_kind === 'REAL_NON_FIXTURE' && execution.provider_probe === 'tool_calling', 'A9_W26_REAL_PROVIDER_PROOF_INVALID');
  }
}

function verifyReport(report, kit, identity, evidenceRoot, fileSystem) {
  rejectSecrets(report);
  assert(plain(kit) && kit.schema_version === 1 && kit.kit_id === 'A9-15-WIN7-26-UI-PROGRESS-20260910-01'
    && kit.candidate_label === 'WIN7-26' && Array.isArray(kit.required_cases) && kit.required_cases.length === 8,
  'A9_W26_KIT_INVALID');
  assert(plain(report) && report.schema_version === 1
    && report.report_kind === 'A9_15_WIN7_26_UI_PROGRESS_ACCEPTANCE', 'A9_W26_REPORT_SCHEMA_INVALID');
  assert(canonical(report.candidate) === canonical(identity), 'A9_W26_CANDIDATE_BINDING_MISMATCH');
  assert(Array.isArray(report.results) && report.results.length === kit.required_cases.length, 'A9_W26_RESULT_COUNT_INVALID');
  const expected = new Map(kit.required_cases.map((item) => [item.case_id, item]));
  const seen = new Set();
  for (const result of report.results) {
    assert(plain(result) && expected.has(result.case_id) && !seen.has(result.case_id), `A9_W26_CASE_ID_INVALID:${result && result.case_id}`);
    seen.add(result.case_id);
    assert(['PASS', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING'].includes(result.status), `A9_W26_CASE_STATUS_INVALID:${result.case_id}`);
    assert(Array.isArray(result.executions), `A9_W26_EXECUTIONS_REQUIRED:${result.case_id}`);
    if (result.status === 'PASS') {
      assert(result.executions.length > 0, `A9_W26_PASS_WITHOUT_EXECUTION:${result.case_id}`);
      result.executions.forEach((execution) => validateExecution(execution, expected.get(result.case_id), identity, evidenceRoot, fileSystem));
    }
  }
  assert(seen.size === expected.size, 'A9_W26_CASE_SET_INCOMPLETE');
  const complete = report.results.every((item) => item.status === 'PASS');
  const expectedStatus = report.results.some((item) => item.status === 'FAIL') ? 'FAIL' : complete ? 'PASS' : 'EVIDENCE_PENDING';
  assert(report.status === expectedStatus, 'A9_W26_OVERALL_STATUS_INVALID');
  return {
    status: report.status,
    disposition: report.status === 'PASS' ? 'A9_15_WIN7_UI_INTEGRATION_PASS' : report.status,
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
  assert(options.command === 'verify', 'A9_W26_COMMAND_INVALID');
  const reportPath = requiredFile(options.report, 'REPORT', fileSystem);
  assert(typeof options['evidence-root'] === 'string' && options['evidence-root'], 'A9_W26_EVIDENCE_ROOT_REQUIRED');
  const evidenceRoot = fileSystem.realpathSync(path.resolve(options['evidence-root']));
  const report = JSON.parse(fileSystem.readFileSync(reportPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(verifyReport(report, kit, identity, evidenceRoot, fileSystem), null, 2)}\n`);
}

module.exports = { argumentsOf, identityFrom, template, verifyReport };
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
