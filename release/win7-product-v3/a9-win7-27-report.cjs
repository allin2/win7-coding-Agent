'use strict';

/**
 * A9-15 / WIN7-27 验收报告器（ADR-0120）。
 *
 * 与 WIN7-26 的关键差异：投影证据不再是报告中手填的平行字段，而是候选外机器可读
 * 附件。本报告器实际读取并解析 `A9_PROJECTION_QUERY_EXPORT` 与
 * `A9_PROJECTION_DOM_EXPORT` 附件字节，把会话身份、event/turn ID、查询顺序、去重与
 * 终端结果全部从附件里推导出来，再与报告字段交叉核对；附件格式错误、属于另一会话、
 * 缺行、乱序、重复、额外行、结果不符或旧新轮次 turn ID 相同，一律拒绝签发。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { selectPhysicalFileSystem, verifyAcceptanceCandidate } = require('./a9-package-integrity-w27.cjs');

const CANDIDATE_LABEL = 'WIN7-27';
const KIT_ID = 'A9-15-WIN7-27-UI-PROGRESS-20260910-01';
const REPORT_KIND = 'A9_15_WIN7_27_UI_PROGRESS_ACCEPTANCE';
const QUERY_EXPORT_KIND = 'A9_PROJECTION_QUERY_EXPORT';
const DOM_EXPORT_KIND = 'A9_PROJECTION_DOM_EXPORT';
const INSPECTOR_DISPLAY_RULE = 'LAST_60_BY_EVENT_ID_ASC';
const INSPECTOR_DISPLAY_ROWS = 60;
const INSPECTOR_CASE = 'W27-03-INSPECTOR-PERSISTED-RESTART';
const PROJECTION_CASE = 'W27-09-LATEST-OUTCOME-PROJECTION';
const REAL_PROVIDER_CASE = 'W27-07-REAL-PROVIDER-MULTITOOL';
const REQUIRED_CASE_COUNT = 9;
const OUTCOME_CASES = ['W27-03-INSPECTOR-PERSISTED-RESTART', 'W27-09-LATEST-OUTCOME-PROJECTION'];
const TERMINAL_TYPES = ['turn_completed', 'turn_failed', 'turn_cancelled', 'turn_interrupted', 'turn_blocked'];
const DISPLAYED_OUTCOME = 'completed · verified';
const OLDER_LOAD_MODES = ['CLICKED_LOAD_MORE', 'FULL_HISTORY_ALREADY_LOADED'];

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
    assert(item.startsWith('--'), `A9_W27_ARGUMENT_INVALID:${item}`);
    const equal = item.indexOf('=');
    if (equal > 2) values[item.slice(2, equal)] = item.slice(equal + 1);
    else {
      assert(index + 1 < argv.length, `A9_W27_ARGUMENT_VALUE_MISSING:${item}`);
      values[item.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return values;
}
function requiredFile(value, label, fileSystem) {
  assert(typeof value === 'string' && value, `A9_W27_${label}_REQUIRED`);
  const filePath = path.resolve(value);
  assert(fileSystem.existsSync(filePath) && fileSystem.statSync(filePath).isFile(), `A9_W27_${label}_NOT_FILE`);
  return fileSystem.realpathSync(filePath);
}
function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function rejectSecrets(value) {
  const serialized = JSON.stringify(value);
  assert(!/(?:Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(serialized), 'A9_W27_REPORT_SECRET_MATERIAL');
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!plain(item)) return;
    for (const [key, child] of Object.entries(item)) {
      assert(!/^(?:api[_-]?key|apikey|authorization|password|secret|access[_-]?token|refresh[_-]?token|credentials?|private[_-]?key)$/i.test(key), `A9_W27_REPORT_SECRET_FIELD:${key}`);
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
    candidate_label: CANDIDATE_LABEL,
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
    report_kind: REPORT_KIND,
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
  assert(Array.isArray(entries) && entries.length > 0, `A9_W27_EVIDENCE_REQUIRED:${caseId}`);
  const seen = new Set();
  for (const item of entries) {
    assert(plain(item) && typeof item.path === 'string' && item.path
      && /^[a-f0-9]{64}$/.test(String(item.sha256 || '')) && !seen.has(item.path), `A9_W27_EVIDENCE_ENTRY_INVALID:${caseId}`);
    seen.add(item.path);
    const unresolved = path.resolve(evidenceRoot, item.path);
    assert(fileSystem.existsSync(unresolved) && fileSystem.statSync(unresolved).isFile(), `A9_W27_EVIDENCE_NOT_FILE:${caseId}:${item.path}`);
    const absolute = fileSystem.realpathSync(unresolved);
    assert(contained(evidenceRoot, absolute), `A9_W27_EVIDENCE_ESCAPES_ROOT:${caseId}:${item.path}`);
    assert(sha256(fileSystem.readFileSync(absolute)) === item.sha256, `A9_W27_EVIDENCE_HASH_MISMATCH:${caseId}:${item.path}`);
  }
}

/** 附件引用必须同时出现在 evidence 列表中；解析失败一律拒绝。 */
function readArtifact(reference, evidence, evidenceRoot, fileSystem, caseId, label) {
  assert(plain(reference) && typeof reference.path === 'string' && /^[a-f0-9]{64}$/.test(reference.sha256 || ''),
    `A9_W27_PROJECTION_ARTIFACT_INVALID:${caseId}:${label}`);
  assert(evidence.some((item) => item.path === reference.path && item.sha256 === reference.sha256),
    `A9_W27_PROJECTION_ARTIFACT_UNBOUND:${caseId}:${label}`);
  const absolute = fileSystem.realpathSync(path.resolve(evidenceRoot, reference.path));
  const bytes = fileSystem.readFileSync(absolute);
  assert(sha256(bytes) === reference.sha256, `A9_W27_PROJECTION_ARTIFACT_HASH_MISMATCH:${caseId}:${label}`);
  let parsed = null;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (_error) {
    throw new Error(`A9_W27_PROJECTION_ATTACHMENT_NOT_JSON:${caseId}:${label}`);
  }
  assert(plain(parsed), `A9_W27_PROJECTION_ATTACHMENT_INVALID:${caseId}:${label}`);
  return parsed;
}

function parseQueryExport(exported, caseId) {
  assert(exported.schema_version === 1 && exported.kind === QUERY_EXPORT_KIND, `A9_W27_PROJECTION_QUERY_KIND_INVALID:${caseId}`);
  assert(typeof exported.conversation_id === 'string' && exported.conversation_id.length > 0,
    `A9_W27_PROJECTION_CONVERSATION_REQUIRED:${caseId}`);
  assert(Array.isArray(exported.events) && exported.events.length > 0, `A9_W27_PROJECTION_QUERY_EMPTY:${caseId}`);
  const events = [];
  const seen = new Set();
  for (const event of exported.events) {
    assert(plain(event) && isEventId(event.event_id) && !seen.has(event.event_id), `A9_W27_PROJECTION_EVENT_ID_INVALID:${caseId}`);
    assert(event.turn_id === null || (typeof event.turn_id === 'string' && event.turn_id.length > 0),
      `A9_W27_PROJECTION_EVENT_TURN_INVALID:${caseId}`);
    assert(typeof event.type === 'string' && event.type.length > 0, `A9_W27_PROJECTION_EVENT_TYPE_INVALID:${caseId}`);
    assert(event.outcome === undefined || event.outcome === null || typeof event.outcome === 'string', `A9_W27_PROJECTION_EVENT_OUTCOME_INVALID:${caseId}`);
    assert(event.verification === undefined || event.verification === null || typeof event.verification === 'string', `A9_W27_PROJECTION_EVENT_VERIFICATION_INVALID:${caseId}`);
    const previous = events.length ? events[events.length - 1] : null;
    assert(!previous || event.event_id > previous.event_id, `A9_W27_PROJECTION_QUERY_ORDER_INVALID:${caseId}`);
    seen.add(event.event_id);
    events.push({
      event_id: event.event_id, turn_id: event.turn_id, type: event.type,
      outcome: event.outcome === undefined ? null : event.outcome,
      verification: event.verification === undefined ? null : event.verification,
    });
  }
  return { conversationId: exported.conversation_id, events, ids: events.map((event) => event.event_id) };
}

function expectedRange(query) {
  return query.ids.slice(-INSPECTOR_DISPLAY_ROWS);
}

/** DOM 导出行必须与查询导出的有界显示范围逐行相等：内容、顺序、去重、身份一致。 */
function parseDomExport(exported, query, caseId, label) {
  assert(exported.schema_version === 1 && exported.kind === DOM_EXPORT_KIND, `A9_W27_PROJECTION_DOM_KIND_INVALID:${caseId}:${label}`);
  assert(exported.conversation_id === query.conversationId, `A9_W27_PROJECTION_CONVERSATION_MISMATCH:${caseId}:${label}`);
  assert(plain(exported.display_range) && exported.display_range.rule === INSPECTOR_DISPLAY_RULE
    && exported.display_range.max_rows === INSPECTOR_DISPLAY_ROWS, `A9_W27_PROJECTION_DISPLAY_RULE_INVALID:${caseId}:${label}`);
  const expected = expectedRange(query);
  assert(Array.isArray(exported.rows), `A9_W27_PROJECTION_DOM_ROWS_REQUIRED:${caseId}:${label}`);
  const rows = [];
  const seen = new Set();
  for (const row of exported.rows) {
    assert(plain(row) && isEventId(row.event_id) && !seen.has(row.event_id), `A9_W27_PROJECTION_DOM_ROW_INVALID:${caseId}:${label}`);
    assert(typeof row.text === 'string' && row.text.trim().length > 0, `A9_W27_PROJECTION_DOM_ROW_TEXT_INVALID:${caseId}:${label}`);
    assert(row.turn_id === null || (typeof row.turn_id === 'string' && row.turn_id.length > 0),
      `A9_W27_PROJECTION_DOM_ROW_TURN_INVALID:${caseId}:${label}`);
    seen.add(row.event_id);
    rows.push({ event_id: row.event_id, turn_id: row.turn_id, text: row.text, event_type: row.event_type });
  }
  const byId = new Map(query.events.map((event) => [event.event_id, event]));
  assert(rows.length === expected.length, `A9_W27_PROJECTION_DOM_ROW_COUNT_MISMATCH:${caseId}:${label}`);
  for (let index = 0; index < expected.length; index += 1) {
    const row = rows[index];
    const event = byId.get(expected[index]);
    assert(row.event_id === expected[index], `A9_W27_PROJECTION_DOM_ORDER_MISMATCH:${caseId}:${label}:${index}`);
    assert((row.turn_id || null) === (event.turn_id || null), `A9_W27_PROJECTION_DOM_TURN_MISMATCH:${caseId}:${label}:${index}`);
    if (row.event_type !== undefined && row.event_type !== null) {
      assert(row.event_type === event.type, `A9_W27_PROJECTION_DOM_TYPE_MISMATCH:${caseId}:${label}:${index}`);
    }
  }
  assert(exported.display_range.rows_total === expected.length, `A9_W27_PROJECTION_DISPLAY_TOTAL_INVALID:${caseId}:${label}`);
  return { rows, conversationId: exported.conversation_id };
}

/** 全局结果必须等于查询导出中最新终态事件的结果，而不是手填值。 */
function latestTerminal(query, caseId) {
  const terminals = query.events.filter((event) => TERMINAL_TYPES.includes(event.type));
  assert(terminals.length > 0, `A9_W27_PROJECTION_TERMINAL_MISSING:${caseId}`);
  const newest = terminals.reduce((a, b) => (b.event_id > a.event_id ? b : a));
  assert(terminalFacts(newest) !== null, `A9_W27_PROJECTION_TERMINAL_OUTCOME_MISSING:${caseId}`);
  const ordered = terminals.every((event, index) => index === 0 || event.event_id > terminals[index - 1].event_id);
  assert(ordered, `A9_W27_PROJECTION_TERMINAL_ORDER_INVALID:${caseId}`);
  return newest;
}

function expectedDisplayed(terminal) {
  const facts = terminalFacts(terminal);
  assert(facts, `A9_W27_PROJECTION_TERMINAL_OUTCOME_MISSING:${terminal && terminal.event_id}`);
  return `${facts.outcome} · ${facts.verification}`;
}

// 产品只在 `turn_completed` 上持久化 outcome/verification；`turn_failed` 的失败语义由事件类型
// 本身承载（其 payload 的 outcome/verification 为 null）。因此终态事实按"显式 payload 优先、
// 事件类型兜底"推导，避免要求产品产出它并不持久化的字段。
const TERMINAL_TYPE_FACTS = {
  turn_failed: { outcome: 'failed', verification: 'not_applicable' },
};

/** 返回终态事件的有效 (outcome, verification)；无法推导时返回 null。 */
function terminalFacts(event) {
  if (!event || !TERMINAL_TYPES.includes(event.type)) return null;
  const fallback = TERMINAL_TYPE_FACTS[event.type] || null;
  const outcome = typeof event.outcome === 'string' && event.outcome ? event.outcome : (fallback ? fallback.outcome : null);
  const verification = typeof event.verification === 'string' && event.verification
    ? event.verification : (fallback ? fallback.verification : null);
  return outcome && verification ? { outcome, verification } : null;
}

function validateInspectorProjection(proof, evidence, evidenceRoot, fileSystem, caseId) {
  const query = parseQueryExport(readArtifact(proof.query_export, evidence, evidenceRoot, fileSystem, caseId, 'query_export'), caseId);
  const dom = parseDomExport(readArtifact(proof.dom_export, evidence, evidenceRoot, fileSystem, caseId, 'dom_export'), query, caseId, 'restart');
  assert(query.events.some((event) => event.turn_id === null), `A9_W27_PROJECTION_SESSION_EVENTS_MISSING:${caseId}`);
  assert(query.events.some((event) => event.type === 'tool_start') && query.events.some((event) => event.type === 'tool_end'),
    `A9_W27_PROJECTION_TOOL_EVENTS_MISSING:${caseId}`);
  const terminal = latestTerminal(query, caseId);
  assert(dom.rows.some((row) => row.event_id === terminal.event_id), `A9_W27_PROJECTION_TERMINAL_ROW_MISSING:${caseId}`);
  // 切换会话后不得残留上一会话内容，且切回后逐行复原。
  assert(plain(proof.session_switch), `A9_W27_PROJECTION_SESSION_SWITCH_REQUIRED:${caseId}`);
  const other = readArtifact(proof.session_switch.other_conversation_export, evidence, evidenceRoot, fileSystem, caseId, 'other_conversation_export');
  assert(other.schema_version === 1 && other.kind === DOM_EXPORT_KIND, `A9_W27_PROJECTION_DOM_KIND_INVALID:${caseId}:other`);
  assert(typeof other.conversation_id === 'string' && other.conversation_id.length > 0
    && other.conversation_id !== query.conversationId, `A9_W27_PROJECTION_SESSION_SWITCH_SAME_CONVERSATION:${caseId}`);
  const foreignIds = new Set(query.ids);
  assert(Array.isArray(other.rows) && !other.rows.some((row) => plain(row) && foreignIds.has(row.event_id)),
    `A9_W27_PROJECTION_CROSS_SESSION_RESIDUE:${caseId}`);
  const resumed = parseDomExport(readArtifact(proof.session_switch.resume_export, evidence, evidenceRoot, fileSystem, caseId, 'resume_export'), query, caseId, 'resume');
  assert(canonical(resumed.rows.map((row) => row.event_id)) === canonical(dom.rows.map((row) => row.event_id)),
    `A9_W27_PROJECTION_RESUME_MISMATCH:${caseId}`);
  return { query, terminal, dom };
}

function validateOutcomeProjection(proof, evidence, evidenceRoot, fileSystem, caseId) {
  const query = parseQueryExport(readArtifact(proof.query_export, evidence, evidenceRoot, fileSystem, caseId, 'query_export'), caseId);
  const afterRestart = parseDomExport(readArtifact(proof.dom_export, evidence, evidenceRoot, fileSystem, caseId, 'dom_export'), query, caseId, 'restart');
  const afterOlderLoad = parseDomExport(readArtifact(proof.dom_export_after_older_load, evidence, evidenceRoot, fileSystem, caseId, 'dom_export_after_older_load'), query, caseId, 'older_load');
  const older = proof.older_failure;
  const newer = proof.newer_success;
  assert(plain(older) && isEventId(older.event_id) && typeof older.turn_id === 'string' && older.turn_id.length > 0,
    `A9_W27_PROJECTION_OLDER_BINDING_INVALID:${caseId}`);
  assert(plain(newer) && isEventId(newer.event_id) && typeof newer.turn_id === 'string' && newer.turn_id.length > 0,
    `A9_W27_PROJECTION_NEWER_BINDING_INVALID:${caseId}`);
  assert(older.turn_id !== newer.turn_id, `A9_W27_PROJECTION_TURN_IDENTITY_COLLISION:${caseId}`);
  assert(older.event_id < newer.event_id, `A9_W27_PROJECTION_EVENT_IDENTITY_ORDER_INVALID:${caseId}`);
  const byId = new Map(query.events.map((event) => [event.event_id, event]));
  const olderEvent = byId.get(older.event_id);
  const newerEvent = byId.get(newer.event_id);
  const olderFacts = terminalFacts(olderEvent);
  const newerFacts = terminalFacts(newerEvent);
  assert(olderEvent && olderEvent.type === 'turn_failed' && olderEvent.turn_id === older.turn_id
    && olderFacts && olderFacts.outcome === 'failed' && olderFacts.verification === 'not_applicable',
  `A9_W27_PROJECTION_OLDER_QUERY_MISMATCH:${caseId}`);
  assert(newerEvent && newerEvent.type === 'turn_completed' && newerEvent.turn_id === newer.turn_id
    && newerFacts && newerFacts.outcome === 'completed' && newerFacts.verification === 'verified',
  `A9_W27_PROJECTION_NEWER_QUERY_MISMATCH:${caseId}`);
  const terminal = latestTerminal(query, caseId);
  assert(terminal.event_id === newer.event_id, `A9_W27_PROJECTION_STALE_GLOBAL_OUTCOME:${caseId}`);
  const expected = expectedDisplayed(terminal);
  assert(expected === DISPLAYED_OUTCOME, `A9_W27_PROJECTION_LATEST_NOT_VERIFIED:${caseId}`);
  assert(typeof proof.older_load_mode === 'string' && OLDER_LOAD_MODES.includes(proof.older_load_mode),
    `A9_W27_PROJECTION_OLDER_LOAD_MODE_INVALID:${caseId}`);
  assert(query.ids.length <= INSPECTOR_DISPLAY_ROWS || proof.older_load_mode === 'CLICKED_LOAD_MORE',
    `A9_W27_PROJECTION_RANGE_TOO_LARGE:${caseId}`);
  assert(proof.restart_displayed_outcome === expected, `A9_W27_PROJECTION_RESTART_OUTCOME_MISMATCH:${caseId}`);
  assert(proof.older_event_load_displayed_outcome === expected, `A9_W27_PROJECTION_OLDER_LOAD_OUTCOME_MISMATCH:${caseId}`);
  for (const [label, dom] of [['restart', afterRestart], ['older_load', afterOlderLoad]]) {
    assert(dom.rows.some((row) => row.event_id === newer.event_id && (row.turn_id || null) === newer.turn_id),
      `A9_W27_PROJECTION_NEWER_ROW_MISSING:${caseId}:${label}`);
  }
  assert(afterOlderLoad.rows.some((row) => row.event_id === older.event_id)
    || proof.older_load_mode === 'CLICKED_LOAD_MORE',
  `A9_W27_PROJECTION_OLDER_ROW_MISSING:${caseId}`);
  return { query, terminal, olderEvent, newerEvent };
}

function validateProjectionEvidence(proof, evidence, evidenceRoot, fileSystem, caseId) {
  assert(plain(proof), `A9_W27_PROJECTION_EVIDENCE_REQUIRED:${caseId}`);
  if (caseId === INSPECTOR_CASE) return validateInspectorProjection(proof, evidence, evidenceRoot, fileSystem, caseId);
  return validateOutcomeProjection(proof, evidence, evidenceRoot, fileSystem, caseId);
}

function validateExecution(execution, validationCase, identity, evidenceRoot, fileSystem) {
  assert(plain(execution) && canonical(execution.candidate) === canonical(identity), `A9_W27_EXECUTION_CANDIDATE_MISMATCH:${validationCase.case_id}`);
  assert(typeof execution.run_id === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(execution.run_id), `A9_W27_RUN_ID_INVALID:${validationCase.case_id}`);
  assert(plain(execution.environment)
    && execution.environment.os === 'Windows 7 SP1 build 7601'
    && execution.environment.architecture === 'x64'
    && execution.environment.user === 'ordinary-user'
    && execution.environment.elevation === 'not-elevated'
    && execution.environment.electron === '22.3.27'
    && execution.environment.electron_abi === 110,
  `A9_W27_ENVIRONMENT_INVALID:${validationCase.case_id}`);
  assert(Array.isArray(execution.assertions), `A9_W27_ASSERTIONS_REQUIRED:${validationCase.case_id}`);
  const expected = new Set(validationCase.assertions.map((item) => item.assertion_id));
  const seen = new Set();
  for (const assertion of execution.assertions) {
    assert(plain(assertion) && expected.has(assertion.assertion_id) && !seen.has(assertion.assertion_id)
      && assertion.status === 'PASS', `A9_W27_ASSERTION_INVALID:${validationCase.case_id}`);
    seen.add(assertion.assertion_id);
  }
  assert(seen.size === expected.size, `A9_W27_ASSERTIONS_MISSING:${validationCase.case_id}`);
  validateEvidence(execution.evidence, evidenceRoot, fileSystem, validationCase.case_id);
  if (OUTCOME_CASES.includes(validationCase.case_id)) {
    validateProjectionEvidence(execution.projection_evidence, execution.evidence, evidenceRoot, fileSystem, validationCase.case_id);
  }
  if (validationCase.case_id === REAL_PROVIDER_CASE) {
    assert(execution.provider_kind === 'REAL_NON_FIXTURE' && execution.provider_probe === 'tool_calling', 'A9_W27_REAL_PROVIDER_PROOF_INVALID');
  }
}

function verifyReport(report, kit, identity, evidenceRoot, fileSystem) {
  rejectSecrets(report);
  assert(plain(kit) && kit.schema_version === 1 && kit.kit_id === KIT_ID
    && kit.candidate_label === CANDIDATE_LABEL && Array.isArray(kit.required_cases)
    && kit.required_cases.length === REQUIRED_CASE_COUNT,
  'A9_W27_KIT_INVALID');
  for (const caseId of [...OUTCOME_CASES, 'W27-04-APPROVAL-FAILURE-ORDER']) {
    assert(kit.required_cases.some((item) => item.case_id === caseId && Array.isArray(item.assertions) && item.assertions.length > 0),
      `A9_W27_KIT_CASE_MISSING:${caseId}`);
  }
  assert(plain(report) && report.schema_version === 1 && report.report_kind === REPORT_KIND, 'A9_W27_REPORT_SCHEMA_INVALID');
  assert(canonical(report.candidate) === canonical(identity), 'A9_W27_CANDIDATE_BINDING_MISMATCH');
  assert(Array.isArray(report.results) && report.results.length === kit.required_cases.length, 'A9_W27_RESULT_COUNT_INVALID');
  const expected = new Map(kit.required_cases.map((item) => [item.case_id, item]));
  const seen = new Set();
  for (const result of report.results) {
    assert(plain(result) && expected.has(result.case_id) && !seen.has(result.case_id), `A9_W27_CASE_ID_INVALID:${result && result.case_id}`);
    seen.add(result.case_id);
    assert(['PASS', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING'].includes(result.status), `A9_W27_CASE_STATUS_INVALID:${result.case_id}`);
    assert(Array.isArray(result.executions), `A9_W27_EXECUTIONS_REQUIRED:${result.case_id}`);
    if (result.status === 'PASS') {
      assert(result.executions.length > 0, `A9_W27_PASS_WITHOUT_EXECUTION:${result.case_id}`);
      result.executions.forEach((execution) => validateExecution(execution, expected.get(result.case_id), identity, evidenceRoot, fileSystem));
    }
  }
  assert(seen.size === expected.size, 'A9_W27_CASE_SET_INCOMPLETE');
  const complete = report.results.every((item) => item.status === 'PASS');
  const expectedStatus = report.results.some((item) => item.status === 'FAIL') ? 'FAIL' : complete ? 'PASS' : 'EVIDENCE_PENDING';
  assert(report.status === expectedStatus, 'A9_W27_OVERALL_STATUS_INVALID');
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
  assert(options.command === 'verify', 'A9_W27_COMMAND_INVALID');
  const reportPath = requiredFile(options.report, 'REPORT', fileSystem);
  assert(typeof options['evidence-root'] === 'string' && options['evidence-root'], 'A9_W27_EVIDENCE_ROOT_REQUIRED');
  const evidenceRoot = fileSystem.realpathSync(path.resolve(options['evidence-root']));
  const report = JSON.parse(fileSystem.readFileSync(reportPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(verifyReport(report, kit, identity, evidenceRoot, fileSystem), null, 2)}\n`);
}

module.exports = {
  argumentsOf, identityFrom, template, verifyReport,
  parseQueryExport, parseDomExport, latestTerminal, expectedRange, terminalFacts, expectedDisplayed,
  KIT_ID, REPORT_KIND, INSPECTOR_DISPLAY_RULE, INSPECTOR_DISPLAY_ROWS, REQUIRED_CASE_COUNT,
};
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
