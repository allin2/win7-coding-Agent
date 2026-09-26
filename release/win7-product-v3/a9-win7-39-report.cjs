// DERIVED FROM THE FROZEN WIN7-38 ARTIFACT — WIN7-39 A9-23 validation kit repair, ADR-0142.
// Candidate-scoped tokens rebased to WIN7-39 / W39 / A9-23; identity semantics unchanged.
'use strict';

/**
 * A9-23 / WIN7-39 验收报告器（ADR-0142）。
 * 覆盖 15 项用例：W39-01～W39-15（W37 旅程语义 + A9-20 Git 形态 + A9-21 M1/M1b/M2/M3/M4）。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { selectPhysicalFileSystem, verifyAcceptanceCandidate } = require('./a9-package-integrity-w39.cjs');
const contract = require('./a9-projection-contract.cjs');

const CANDIDATE_LABEL = 'WIN7-39';
const KIT_ID = 'A9-23-WIN7-39-20260926-01';
const REPORT_KIND = 'A9_23_WIN7_39_A9_20_A9_21_ACCEPTANCE';
const QUERY_EXPORT_KIND = contract.QUERY_EXPORT_KIND;
const DOM_EXPORT_KIND = contract.DOM_EXPORT_KIND;
const QUERY_EXPORT_SCHEMA_VERSION = contract.QUERY_EXPORT_SCHEMA_VERSION;
const DOM_EXPORT_SCHEMA_VERSION = contract.DOM_EXPORT_SCHEMA_VERSION;
const INSPECTOR_DISPLAY_RULE = contract.INSPECTOR_DISPLAY_RULE;
const INSPECTOR_DISPLAY_ROWS = contract.INSPECTOR_DISPLAY_ROWS;
const REQUIRED_CASE_COUNT = 15;

const EXPECTED_CASES = [
  'W39-01-CANDIDATE-INTEGRITY',
  'W39-02-CHINESE-SPACE-PATH',
  'W39-03-STARTUP-WITHIN-60S',
  'W39-04-TASK-READ-EDIT-SHELL',
  'W39-05-DIFF-AND-CHECKPOINT',
  'W39-06-APPROVAL-STOP-RESTART',
  'W39-07-A9-20-GIT-FORMS-CMD',
  'W39-08-A9-20-GIT-FORMS-POWERSHELL',
  'W39-09-A9-20-GIT-FORMS-POSIX-AND-BULK',
  'W39-10-M1-STARTUP-TARGETED-RECOVERY',
  'W39-11-M1B-HEX-FREEZE-AND-URL-REDACTION',
  'W39-12-M2-OUTPUT-LIMITS',
  'W39-13-M3-CHECKPOINT-PAGINATION',
  'W39-14-M4-COLLECTION-BOUNDS',
  'W39-15-SECRET-SCAN-AND-POSTFLIGHT',
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
    assert(item.startsWith('--'), `A9_W39_ARGUMENT_INVALID:${item}`);
    const equal = item.indexOf('=');
    if (equal > 2) values[item.slice(2, equal)] = item.slice(equal + 1);
    else {
      assert(index + 1 < argv.length, `A9_W39_ARGUMENT_VALUE_MISSING:${item}`);
      values[item.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return values;
}
function requiredFile(value, label, fileSystem) {
  assert(typeof value === 'string' && value, `A9_W39_${label}_REQUIRED`);
  const filePath = path.resolve(value);
  assert(fileSystem.existsSync(filePath) && fileSystem.statSync(filePath).isFile(), `A9_W39_${label}_NOT_FILE`);
  return fileSystem.realpathSync(filePath);
}
function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function rejectSecrets(value) {
  const serialized = JSON.stringify(value);
  assert(!/(?:Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(serialized), 'A9_W39_REPORT_SECRET_MATERIAL');
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!plain(item)) return;
    for (const [key, child] of Object.entries(item)) {
      assert(!/^(?:api[_-]?key|apikey|authorization|password|secret|access[_-]?token|refresh[_-]?token|credentials?|private[_-]?key)$/i.test(key), `A9_W39_REPORT_SECRET_FIELD:${key}`);
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
  assert(Array.isArray(evidence) && evidence.length > 0, `A9_W39_EVIDENCE_REQUIRED:${caseId}`);
  for (const item of evidence) {
    assert(plain(item) && typeof item.path === 'string' && item.path.length > 0
      && /^[a-f0-9]{64}$/.test(item.sha256 || '') && Number.isSafeInteger(item.bytes) && item.bytes >= 0,
    `A9_W39_EVIDENCE_ENTRY_INVALID:${caseId}`);
    const absolute = path.resolve(evidenceRoot, item.path);
    assert(contained(evidenceRoot, absolute), `A9_W39_EVIDENCE_PATH_ESCAPE:${caseId}:${item.path}`);
    assert(fileSystem.existsSync(absolute) && fileSystem.statSync(absolute).isFile(), `A9_W39_EVIDENCE_NOT_FOUND:${caseId}:${item.path}`);
    const bytes = fileSystem.readFileSync(absolute);
    assert(bytes.length === item.bytes, `A9_W39_EVIDENCE_SIZE_MISMATCH:${caseId}:${item.path}`);
    assert(sha256(bytes) === item.sha256, `A9_W39_EVIDENCE_HASH_MISMATCH:${caseId}:${item.path}`);
  }
}

function validateExecution(execution, validationCase, identity, evidenceRoot, fileSystem) {
  assert(plain(execution) && canonical(execution.candidate) === canonical(identity), `A9_W39_EXECUTION_CANDIDATE_MISMATCH:${validationCase.case_id}`);
  assert(typeof execution.run_id === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(execution.run_id), `A9_W39_RUN_ID_INVALID:${validationCase.case_id}`);
  assert(plain(execution.environment)
    && execution.environment.os === 'Windows 7 SP1 build 7601'
    && execution.environment.architecture === 'x64'
    && execution.environment.user === 'ordinary-user'
    && execution.environment.elevation === 'not-elevated'
    && execution.environment.electron === '22.3.27'
    && execution.environment.electron_abi === 110,
  `A9_W39_ENVIRONMENT_INVALID:${validationCase.case_id}`);
  assert(Array.isArray(execution.assertions), `A9_W39_ASSERTIONS_REQUIRED:${validationCase.case_id}`);
  const expected = new Set(validationCase.assertions.map((item) => item.assertion_id));
  const seen = new Set();
  for (const assertion of execution.assertions) {
    assert(plain(assertion) && expected.has(assertion.assertion_id) && !seen.has(assertion.assertion_id)
      && assertion.status === 'PASS', `A9_W39_ASSERTION_INVALID:${validationCase.case_id}`);
    seen.add(assertion.assertion_id);
  }
  assert(seen.size === expected.size, `A9_W39_ASSERTIONS_MISSING:${validationCase.case_id}`);
  validateEvidence(execution.evidence, evidenceRoot, fileSystem, validationCase.case_id);
}

function verifyReport(report, kit, identity, evidenceRoot, fileSystem) {
  rejectSecrets(report);
  assert(plain(kit) && kit.schema_version === 1 && kit.kit_id === KIT_ID
    && kit.candidate_label === CANDIDATE_LABEL && Array.isArray(kit.required_cases)
    && kit.required_cases.length === REQUIRED_CASE_COUNT,
  'A9_W39_KIT_INVALID');
  for (const caseId of EXPECTED_CASES) {
    assert(kit.required_cases.some((item) => item.case_id === caseId && Array.isArray(item.assertions) && item.assertions.length > 0),
      `A9_W39_KIT_CASE_MISSING:${caseId}`);
  }
  assert(plain(report) && report.schema_version === 1 && report.report_kind === REPORT_KIND, 'A9_W39_REPORT_SCHEMA_INVALID');
  assert(canonical(report.candidate) === canonical(identity), 'A9_W39_CANDIDATE_BINDING_MISMATCH');
  assert(Array.isArray(report.results) && report.results.length === kit.required_cases.length, 'A9_W39_RESULT_COUNT_INVALID');
  const expected = new Map(kit.required_cases.map((item) => [item.case_id, item]));
  const seen = new Set();
  for (const result of report.results) {
    assert(plain(result) && expected.has(result.case_id) && !seen.has(result.case_id), `A9_W39_CASE_ID_INVALID:${result && result.case_id}`);
    seen.add(result.case_id);
    assert(['PASS', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING'].includes(result.status), `A9_W39_CASE_STATUS_INVALID:${result.case_id}`);
    assert(Array.isArray(result.executions), `A9_W39_EXECUTIONS_REQUIRED:${result.case_id}`);
    if (result.status === 'PASS') {
      assert(result.executions.length > 0, `A9_W39_PASS_WITHOUT_EXECUTION:${result.case_id}`);
      result.executions.forEach((execution) => validateExecution(execution, expected.get(result.case_id), identity, evidenceRoot, fileSystem));
    }
  }
  assert(seen.size === expected.size, 'A9_W39_CASE_SET_INCOMPLETE');
  const complete = report.results.every((item) => item.status === 'PASS');
  const expectedStatus = report.results.some((item) => item.status === 'FAIL') ? 'FAIL' : complete ? 'PASS' : 'EVIDENCE_PENDING';
  assert(report.status === expectedStatus, 'A9_W39_OVERALL_STATUS_INVALID');
  return {
    status: report.status,
    disposition: report.status === 'PASS' ? 'A9_23_WIN7_39_A9_20_A9_21_PASS' : report.status,
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
  assert(options.command === 'verify', 'A9_W39_COMMAND_INVALID');
  const reportPath = requiredFile(options.report, 'REPORT', fileSystem);
  assert(typeof options['evidence-root'] === 'string' && options['evidence-root'], 'A9_W39_EVIDENCE_ROOT_REQUIRED');
  const evidenceRoot = fileSystem.realpathSync(path.resolve(options['evidence-root']));
  const report = JSON.parse(fileSystem.readFileSync(reportPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(verifyReport(report, kit, identity, evidenceRoot, fileSystem), null, 2)}\n`);
}

// ==========================================================================
// 投影附件解析函数（从 W37 报告脚本移植，错误码重基线为 A9_W39_*；W38 版没有
// 这一段，其 smoke 也不做该核对——这正是 W38 缺陷之一，W39 smoke 保留 W37 的
// PROJECTION-ARTIFACTS-REPORT-PARSEABLE 断言并依赖下列导出）。
// ==========================================================================
const STAGES = contract.STAGES;
const TERMINAL_TYPES = contract.TERMINAL_TYPES;

/** 终态事实与显示结果由共享契约推导，报告器与 driver 使用同一实现。 */
function terminalFacts(event) { return contract.terminalFacts(event); }
function expectedDisplayed(event) {
  const facts = contract.terminalFacts(event);
  assert(facts, `A9_W39_PROJECTION_TERMINAL_OUTCOME_MISSING:${event && event.event_id}`);
  return `${facts.outcome} · ${facts.verification}`;
}

function parseQueryExport(exported, caseId) {
  assert(exported.schema_version === QUERY_EXPORT_SCHEMA_VERSION && exported.kind === QUERY_EXPORT_KIND,
    `A9_W39_PROJECTION_QUERY_KIND_INVALID:${caseId}`);
  assert(typeof exported.conversation_id === 'string' && exported.conversation_id.length > 0,
    `A9_W39_PROJECTION_CONVERSATION_REQUIRED:${caseId}`);
  assert(Array.isArray(exported.events) && exported.events.length > 0, `A9_W39_PROJECTION_QUERY_EMPTY:${caseId}`);
  assert(Array.isArray(exported.pages) && exported.pages.length > 0, `A9_W39_PROJECTION_QUERY_PAGES_REQUIRED:${caseId}`);
  for (const page of exported.pages) {
    assert(plain(page) && page.ok === true && typeof page.has_more === 'boolean'
      && (page.limit === null || Number.isSafeInteger(page.limit))
      && (page.before_event_id === null || isEventId(page.before_event_id))
      && (page.returned_count === null || Number.isSafeInteger(page.returned_count)),
    `A9_W39_PROJECTION_QUERY_PAGE_INVALID:${caseId}`);
  }
  const bound = (value, cap) => {
    assert(value === null || value === undefined || (typeof value === 'string' && value.length <= cap),
      `A9_W39_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
  };
  const events = [];
  const seen = new Set();
  for (const event of exported.events) {
    assert(plain(event) && isEventId(event.event_id) && !seen.has(event.event_id), `A9_W39_PROJECTION_EVENT_ID_INVALID:${caseId}`);
    assert(event.turn_id === null || (typeof event.turn_id === 'string' && event.turn_id.length > 0),
      `A9_W39_PROJECTION_EVENT_TURN_INVALID:${caseId}`);
    assert(typeof event.type === 'string' && event.type.length > 0, `A9_W39_PROJECTION_EVENT_TYPE_INVALID:${caseId}`);
    assert(event.outcome === undefined || event.outcome === null || typeof event.outcome === 'string', `A9_W39_PROJECTION_EVENT_OUTCOME_INVALID:${caseId}`);
    assert(event.verification === undefined || event.verification === null || typeof event.verification === 'string', `A9_W39_PROJECTION_EVENT_VERIFICATION_INVALID:${caseId}`);
    assert(Number.isSafeInteger(event.timestamp_ms), `A9_W39_PROJECTION_EVENT_TIMESTAMP_REQUIRED:${caseId}`);
    const display = event.display;
    assert(plain(display), `A9_W39_PROJECTION_EVENT_DISPLAY_REQUIRED:${caseId}`);
    bound(display.outcome, 200);
    bound(display.error_head, contract.MAX_ERROR_HEAD);
    bound(display.tool_name, 200);
    bound(display.decision, 40);
    bound(display.call_id, 200);
    assert(display.denied === undefined || typeof display.denied === 'boolean', `A9_W39_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(display.has_error === undefined || typeof display.has_error === 'boolean', `A9_W39_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(display.shell_has_exit_code === undefined || typeof display.shell_has_exit_code === 'boolean', `A9_W39_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(display.shell_exit_code === undefined || display.shell_exit_code === null || Number.isSafeInteger(display.shell_exit_code), `A9_W39_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(display.step === undefined || display.step === null || Number.isSafeInteger(display.step), `A9_W39_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(plain(display.args), `A9_W39_PROJECTION_DISPLAY_ARGS_REQUIRED:${caseId}`);
    for (const key of ['path', 'pattern', 'source', 'destination']) bound(display.args[key], contract.MAX_ARGS_FIELD);
    bound(display.args.command, contract.MAX_COMMAND);
    const previous = events.length ? events[events.length - 1] : null;
    assert(!previous || event.event_id > previous.event_id, `A9_W39_PROJECTION_QUERY_ORDER_INVALID:${caseId}`);
    seen.add(event.event_id);
    events.push({
      event_id: event.event_id, turn_id: event.turn_id, type: event.type,
      outcome: event.outcome === undefined ? null : event.outcome,
      verification: event.verification === undefined ? null : event.verification,
      timestamp_ms: event.timestamp_ms,
      display,
    });
  }
  return { conversationId: exported.conversation_id, events, ids: events.map((event) => event.event_id), pages: exported.pages };
}

function expectedRange(query) {
  return query.ids.slice(-INSPECTOR_DISPLAY_ROWS);
}

function parseDomExport(exported, query, caseId, stage) {
  assert(exported.schema_version === DOM_EXPORT_SCHEMA_VERSION && exported.kind === DOM_EXPORT_KIND,
    `A9_W39_PROJECTION_DOM_KIND_INVALID:${caseId}:${stage}`);
  assert(typeof exported.stage === 'string' && STAGES.includes(exported.stage) && exported.stage === stage,
    `A9_W39_PROJECTION_DOM_STAGE_MISMATCH:${caseId}:${stage}:${exported.stage}`);
  assert(exported.conversation_id === query.conversationId, `A9_W39_PROJECTION_CONVERSATION_MISMATCH:${caseId}:${stage}`);
  assert(typeof exported.displayed_outcome === 'string' && exported.displayed_outcome.length > 0,
    `A9_W39_PROJECTION_DOM_OUTCOME_MISSING:${caseId}:${stage}`);
  assert(exported.latest_persisted_turn_id === null
    || (typeof exported.latest_persisted_turn_id === 'string' && exported.latest_persisted_turn_id.length > 0),
  `A9_W39_PROJECTION_DOM_LATEST_TURN_INVALID:${caseId}:${stage}`);
  assert(plain(exported.time_baseline) && contract.deriveTimeBaseline(exported.time_baseline) !== null,
    `A9_W39_PROJECTION_DOM_TIME_BASELINE_INVALID:${caseId}:${stage}`);
  assert(plain(exported.display_range) && exported.display_range.rule === INSPECTOR_DISPLAY_RULE
    && exported.display_range.max_rows === INSPECTOR_DISPLAY_ROWS, `A9_W39_PROJECTION_DISPLAY_RULE_INVALID:${caseId}:${stage}`);
  assert(Array.isArray(exported.rows), `A9_W39_PROJECTION_DOM_ROWS_REQUIRED:${caseId}:${stage}`);
  assert(contract.rowsMatchQuery(exported.rows, query.events, exported.time_baseline),
    `A9_W39_PROJECTION_DOM_ROWS_MISMATCH:${caseId}:${stage}`);
  assert(exported.display_range.rows_total === expectedRange(query).length, `A9_W39_PROJECTION_DISPLAY_TOTAL_INVALID:${caseId}:${stage}`);
  return {
    rows: exported.rows, conversationId: exported.conversation_id,
    displayedOutcome: exported.displayed_outcome,
    latestPersistedTurnId: exported.latest_persisted_turn_id, stage: exported.stage,
    timeBaseline: exported.time_baseline,
  };
}

function latestTerminal(query, caseId) {
  const terminals = query.events.filter((event) => TERMINAL_TYPES.includes(event.type));
  assert(terminals.length > 0, `A9_W39_PROJECTION_TERMINAL_MISSING:${caseId}`);
  const newest = terminals.reduce((a, b) => (b.event_id > a.event_id ? b : a));
  assert(terminalFacts(newest) !== null, `A9_W39_PROJECTION_TERMINAL_OUTCOME_MISSING:${caseId}`);
  const ordered = terminals.every((event, index) => index === 0 || event.event_id > terminals[index - 1].event_id);
  assert(ordered, `A9_W39_PROJECTION_TERMINAL_ORDER_INVALID:${caseId}`);
  return newest;
}

module.exports = {
  argumentsOf, identityFrom, template, verifyReport,
  parseQueryExport, parseDomExport, latestTerminal, expectedRange, terminalFacts, expectedDisplayed,
  KIT_ID, REPORT_KIND, INSPECTOR_DISPLAY_RULE, INSPECTOR_DISPLAY_ROWS, REQUIRED_CASE_COUNT, EXPECTED_CASES,
};
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
