'use strict';

/**
 * A9-15 / WIN7-28 验收报告器（ADR-0121）。
 *
 * 与 WIN7-27 的关键差异（复核 F1/F2）：
 * - DOM 附件的 displayed_outcome / latest_persisted_turn_id / stage 不再被丢弃，而是解析后强制校验：
 *   必须与查询导出的最新终态、snapshot 独立采集的 turn 身份一致；报告平行字段只能由附件推导。
 * - 逐行内容不再只看非空与标签：期望行标签由查询导出的持久化事实经共享契约独立推导，与实际 DOM 文本
 *   （剥离时间前缀后）逐行比较；时间必须与持久化时间自洽，event_type 缺失同样被拒绝。
 * - 行判定与标签推导来自共享契约模块 a9-projection-contract.cjs（driver 与报告器同一实现）。
 * - 投影附件 schema_version = 2；查询附件携带脱敏 display 事实与真实 pages 查询事实。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { selectPhysicalFileSystem, verifyAcceptanceCandidate } = require('./a9-package-integrity-w28.cjs');
const contract = require('./a9-projection-contract.cjs');

const CANDIDATE_LABEL = 'WIN7-28';
const KIT_ID = 'A9-15-WIN7-28-UI-PROGRESS-20260910-01';
const REPORT_KIND = 'A9_15_WIN7_28_UI_PROGRESS_ACCEPTANCE';
const QUERY_EXPORT_KIND = contract.QUERY_EXPORT_KIND;
const DOM_EXPORT_KIND = contract.DOM_EXPORT_KIND;
const QUERY_EXPORT_SCHEMA_VERSION = contract.QUERY_EXPORT_SCHEMA_VERSION;
const DOM_EXPORT_SCHEMA_VERSION = contract.DOM_EXPORT_SCHEMA_VERSION;
const INSPECTOR_DISPLAY_RULE = contract.INSPECTOR_DISPLAY_RULE;
const INSPECTOR_DISPLAY_ROWS = contract.INSPECTOR_DISPLAY_ROWS;
const STAGES = contract.STAGES;
const INSPECTOR_CASE = 'W28-03-INSPECTOR-PERSISTED-RESTART';
const PROJECTION_CASE = 'W28-09-LATEST-OUTCOME-PROJECTION';
const PAGING_CASE = 'W28-10-OLDER-EVENT-PAGINATION';
const REAL_PROVIDER_CASE = 'W28-07-REAL-PROVIDER-MULTITOOL';
const REQUIRED_CASE_COUNT = 10;
const OUTCOME_CASES = [INSPECTOR_CASE, PROJECTION_CASE];
const PROJECTION_EVIDENCE_CASES = [INSPECTOR_CASE, PROJECTION_CASE, PAGING_CASE];
const TERMINAL_TYPES = contract.TERMINAL_TYPES;
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
    assert(item.startsWith('--'), `A9_W28_ARGUMENT_INVALID:${item}`);
    const equal = item.indexOf('=');
    if (equal > 2) values[item.slice(2, equal)] = item.slice(equal + 1);
    else {
      assert(index + 1 < argv.length, `A9_W28_ARGUMENT_VALUE_MISSING:${item}`);
      values[item.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return values;
}
function requiredFile(value, label, fileSystem) {
  assert(typeof value === 'string' && value, `A9_W28_${label}_REQUIRED`);
  const filePath = path.resolve(value);
  assert(fileSystem.existsSync(filePath) && fileSystem.statSync(filePath).isFile(), `A9_W28_${label}_NOT_FILE`);
  return fileSystem.realpathSync(filePath);
}
function contained(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function rejectSecrets(value) {
  const serialized = JSON.stringify(value);
  assert(!/(?:Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(serialized), 'A9_W28_REPORT_SECRET_MATERIAL');
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!plain(item)) return;
    for (const [key, child] of Object.entries(item)) {
      assert(!/^(?:api[_-]?key|apikey|authorization|password|secret|access[_-]?token|refresh[_-]?token|credentials?|private[_-]?key)$/i.test(key), `A9_W28_REPORT_SECRET_FIELD:${key}`);
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
  assert(Array.isArray(entries) && entries.length > 0, `A9_W28_EVIDENCE_REQUIRED:${caseId}`);
  const seen = new Set();
  for (const item of entries) {
    assert(plain(item) && typeof item.path === 'string' && item.path
      && /^[a-f0-9]{64}$/.test(String(item.sha256 || '')) && !seen.has(item.path), `A9_W28_EVIDENCE_ENTRY_INVALID:${caseId}`);
    seen.add(item.path);
    const unresolved = path.resolve(evidenceRoot, item.path);
    assert(fileSystem.existsSync(unresolved) && fileSystem.statSync(unresolved).isFile(), `A9_W28_EVIDENCE_NOT_FILE:${caseId}:${item.path}`);
    const absolute = fileSystem.realpathSync(unresolved);
    assert(contained(evidenceRoot, absolute), `A9_W28_EVIDENCE_ESCAPES_ROOT:${caseId}:${item.path}`);
    assert(sha256(fileSystem.readFileSync(absolute)) === item.sha256, `A9_W28_EVIDENCE_HASH_MISMATCH:${caseId}:${item.path}`);
  }
}

/** 附件引用必须同时出现在 evidence 列表中；解析失败一律拒绝。 */
function readArtifact(reference, evidence, evidenceRoot, fileSystem, caseId, label) {
  assert(plain(reference) && typeof reference.path === 'string' && /^[a-f0-9]{64}$/.test(reference.sha256 || ''),
    `A9_W28_PROJECTION_ARTIFACT_INVALID:${caseId}:${label}`);
  assert(evidence.some((item) => item.path === reference.path && item.sha256 === reference.sha256),
    `A9_W28_PROJECTION_ARTIFACT_UNBOUND:${caseId}:${label}`);
  const absolute = fileSystem.realpathSync(path.resolve(evidenceRoot, reference.path));
  const bytes = fileSystem.readFileSync(absolute);
  assert(sha256(bytes) === reference.sha256, `A9_W28_PROJECTION_ARTIFACT_HASH_MISMATCH:${caseId}:${label}`);
  let parsed = null;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (_error) {
    throw new Error(`A9_W28_PROJECTION_ATTACHMENT_NOT_JSON:${caseId}:${label}`);
  }
  assert(plain(parsed), `A9_W28_PROJECTION_ATTACHMENT_INVALID:${caseId}:${label}`);
  return parsed;
}

function parseQueryExport(exported, caseId) {
  assert(exported.schema_version === QUERY_EXPORT_SCHEMA_VERSION && exported.kind === QUERY_EXPORT_KIND,
    `A9_W28_PROJECTION_QUERY_KIND_INVALID:${caseId}`);
  assert(typeof exported.conversation_id === 'string' && exported.conversation_id.length > 0,
    `A9_W28_PROJECTION_CONVERSATION_REQUIRED:${caseId}`);
  assert(Array.isArray(exported.events) && exported.events.length > 0, `A9_W28_PROJECTION_QUERY_EMPTY:${caseId}`);
  // F4：查询附件必须保存真实查询事实（limit/beforeEventId/hasMore/返回范围），不得硬编码。
  assert(Array.isArray(exported.pages) && exported.pages.length > 0, `A9_W28_PROJECTION_QUERY_PAGES_REQUIRED:${caseId}`);
  for (const page of exported.pages) {
    assert(plain(page) && page.ok === true && typeof page.has_more === 'boolean'
      && (page.limit === null || Number.isSafeInteger(page.limit))
      && (page.before_event_id === null || isEventId(page.before_event_id))
      && (page.returned_count === null || Number.isSafeInteger(page.returned_count)),
    `A9_W28_PROJECTION_QUERY_PAGE_INVALID:${caseId}`);
  }
  const bound = (value, cap) => {
    assert(value === null || value === undefined || (typeof value === 'string' && value.length <= cap),
      `A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
  };
  const events = [];
  const seen = new Set();
  for (const event of exported.events) {
    assert(plain(event) && isEventId(event.event_id) && !seen.has(event.event_id), `A9_W28_PROJECTION_EVENT_ID_INVALID:${caseId}`);
    assert(event.turn_id === null || (typeof event.turn_id === 'string' && event.turn_id.length > 0),
      `A9_W28_PROJECTION_EVENT_TURN_INVALID:${caseId}`);
    assert(typeof event.type === 'string' && event.type.length > 0, `A9_W28_PROJECTION_EVENT_TYPE_INVALID:${caseId}`);
    assert(event.outcome === undefined || event.outcome === null || typeof event.outcome === 'string', `A9_W28_PROJECTION_EVENT_OUTCOME_INVALID:${caseId}`);
    assert(event.verification === undefined || event.verification === null || typeof event.verification === 'string', `A9_W28_PROJECTION_EVENT_VERIFICATION_INVALID:${caseId}`);
    // F2/时间：重建显示文本与显示时间所需的脱敏事实必须具备且必须有界。
    assert(Number.isSafeInteger(event.timestamp_ms), `A9_W28_PROJECTION_EVENT_TIMESTAMP_REQUIRED:${caseId}`);
    const display = event.display;
    assert(plain(display), `A9_W28_PROJECTION_EVENT_DISPLAY_REQUIRED:${caseId}`);
    bound(display.outcome, 200);
    bound(display.error_head, contract.MAX_ERROR_HEAD);
    bound(display.tool_name, 200);
    bound(display.decision, 40);
    bound(display.call_id, 200);
    assert(display.denied === undefined || typeof display.denied === 'boolean', `A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(display.has_error === undefined || typeof display.has_error === 'boolean', `A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(display.shell_has_exit_code === undefined || typeof display.shell_has_exit_code === 'boolean', `A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(display.shell_exit_code === undefined || display.shell_exit_code === null || Number.isSafeInteger(display.shell_exit_code), `A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(display.step === undefined || display.step === null || Number.isSafeInteger(display.step), `A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:${caseId}`);
    assert(plain(display.args), `A9_W28_PROJECTION_DISPLAY_ARGS_REQUIRED:${caseId}`);
    for (const key of ['path', 'pattern', 'source', 'destination']) bound(display.args[key], contract.MAX_ARGS_FIELD);
    bound(display.args.command, contract.MAX_COMMAND);
    const previous = events.length ? events[events.length - 1] : null;
    assert(!previous || event.event_id > previous.event_id, `A9_W28_PROJECTION_QUERY_ORDER_INVALID:${caseId}`);
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

/**
 * DOM 导出必须与查询导出的有界显示范围逐行相等：身份、顺序、去重、内容与时间一致（共享契约同一函数），
 * 时间由受测运行时独立记录的 time_baseline 核对（W28-H03：不从待验 DOM 首行自校准，统一错时被拒绝），
 * 并且必须保留实际显示结果、最新持久化 turn 身份（F1）与自身阶段标识。
 */
function parseDomExport(exported, query, caseId, stage) {
  assert(exported.schema_version === DOM_EXPORT_SCHEMA_VERSION && exported.kind === DOM_EXPORT_KIND,
    `A9_W28_PROJECTION_DOM_KIND_INVALID:${caseId}:${stage}`);
  assert(typeof exported.stage === 'string' && STAGES.includes(exported.stage) && exported.stage === stage,
    `A9_W28_PROJECTION_DOM_STAGE_MISMATCH:${caseId}:${stage}:${exported.stage}`);
  assert(exported.conversation_id === query.conversationId, `A9_W28_PROJECTION_CONVERSATION_MISMATCH:${caseId}:${stage}`);
  assert(typeof exported.displayed_outcome === 'string' && exported.displayed_outcome.length > 0,
    `A9_W28_PROJECTION_DOM_OUTCOME_MISSING:${caseId}:${stage}`);
  assert(exported.latest_persisted_turn_id === null
    || (typeof exported.latest_persisted_turn_id === 'string' && exported.latest_persisted_turn_id.length > 0),
  `A9_W28_PROJECTION_DOM_LATEST_TURN_INVALID:${caseId}:${stage}`);
  // W28-H03：schema v3 起 DOM 导出必须携带可推导的独立时间基准；缺失/无效一律拒绝。
  assert(plain(exported.time_baseline) && contract.deriveTimeBaseline(exported.time_baseline) !== null,
    `A9_W28_PROJECTION_DOM_TIME_BASELINE_INVALID:${caseId}:${stage}`);
  assert(plain(exported.display_range) && exported.display_range.rule === INSPECTOR_DISPLAY_RULE
    && exported.display_range.max_rows === INSPECTOR_DISPLAY_ROWS, `A9_W28_PROJECTION_DISPLAY_RULE_INVALID:${caseId}:${stage}`);
  assert(Array.isArray(exported.rows), `A9_W28_PROJECTION_DOM_ROWS_REQUIRED:${caseId}:${stage}`);
  // 正向判定与全部负向变异共用同一函数：身份、顺序、去重、内容或时间不符一律拒绝。
  assert(contract.rowsMatchQuery(exported.rows, query.events, exported.time_baseline),
    `A9_W28_PROJECTION_DOM_ROWS_MISMATCH:${caseId}:${stage}`);
  assert(exported.display_range.rows_total === expectedRange(query).length, `A9_W28_PROJECTION_DISPLAY_TOTAL_INVALID:${caseId}:${stage}`);
  return {
    rows: exported.rows, conversationId: exported.conversation_id,
    displayedOutcome: exported.displayed_outcome,
    latestPersistedTurnId: exported.latest_persisted_turn_id, stage: exported.stage,
    timeBaseline: exported.time_baseline,
  };
}

/** 全局结果必须等于查询导出中最新终态事件的结果，而不是手填值。 */
function latestTerminal(query, caseId) {
  const terminals = query.events.filter((event) => TERMINAL_TYPES.includes(event.type));
  assert(terminals.length > 0, `A9_W28_PROJECTION_TERMINAL_MISSING:${caseId}`);
  const newest = terminals.reduce((a, b) => (b.event_id > a.event_id ? b : a));
  assert(terminalFacts(newest) !== null, `A9_W28_PROJECTION_TERMINAL_OUTCOME_MISSING:${caseId}`);
  const ordered = terminals.every((event, index) => index === 0 || event.event_id > terminals[index - 1].event_id);
  assert(ordered, `A9_W28_PROJECTION_TERMINAL_ORDER_INVALID:${caseId}`);
  return newest;
}

function expectedDisplayed(terminal) {
  const facts = terminalFacts(terminal);
  assert(facts, `A9_W28_PROJECTION_TERMINAL_OUTCOME_MISSING:${terminal && terminal.event_id}`);
  return `${facts.outcome} · ${facts.verification}`;
}

// 产品只在 `turn_completed` 上持久化 outcome/verification；`turn_failed` 的失败语义由事件类型
// 本身承载（其 payload 的 outcome/verification 为 null）。因此终态事实按"显式 payload 优先、
// 事件类型兜底"推导，避免要求产品产出它并不持久化的字段。
const TERMINAL_TYPE_FACTS = {
  turn_failed: { outcome: 'failed', verification: 'not_applicable' },
};

/** 终态事实与显示结果由共享契约推导，报告器与 driver 使用同一实现。 */
function terminalFacts(event) { return contract.terminalFacts(event); }
function expectedDisplayed(event) {
  const facts = contract.terminalFacts(event);
  assert(facts, `A9_W28_PROJECTION_TERMINAL_OUTCOME_MISSING:${event && event.event_id}`);
  return `${facts.outcome} · ${facts.verification}`;
}

function validateInspectorProjection(proof, evidence, evidenceRoot, fileSystem, caseId) {
  const query = parseQueryExport(readArtifact(proof.query_export, evidence, evidenceRoot, fileSystem, caseId, 'query_export'), caseId);
  const dom = parseDomExport(readArtifact(proof.dom_export, evidence, evidenceRoot, fileSystem, caseId, 'dom_export'), query, caseId, 'restart');
  assert(query.events.some((event) => event.turn_id === null), `A9_W28_PROJECTION_SESSION_EVENTS_MISSING:${caseId}`);
  assert(query.events.some((event) => event.type === 'tool_start') && query.events.some((event) => event.type === 'tool_end'),
    `A9_W28_PROJECTION_TOOL_EVENTS_MISSING:${caseId}`);
  const terminal = latestTerminal(query, caseId);
  assert(dom.rows.some((row) => row.event_id === terminal.event_id), `A9_W28_PROJECTION_TERMINAL_ROW_MISSING:${caseId}`);
  // F1：DOM 附件的实际显示结果与最新持久化 turn 身份必须与查询最新终态一致。
  const expectedDisplay = expectedDisplayed(terminal);
  assert(dom.displayedOutcome === expectedDisplay, `A9_W28_PROJECTION_DOM_OUTCOME_MISMATCH:${caseId}:restart`);
  assert((dom.latestPersistedTurnId || null) === (terminal.turn_id || null),
    `A9_W28_PROJECTION_DOM_LATEST_TURN_MISMATCH:${caseId}:restart`);
  // 切换会话后不得残留上一会话内容，且切回后逐行复原。
  assert(plain(proof.session_switch), `A9_W28_PROJECTION_SESSION_SWITCH_REQUIRED:${caseId}`);
  const other = readArtifact(proof.session_switch.other_conversation_export, evidence, evidenceRoot, fileSystem, caseId, 'other_conversation_export');
  assert(other.schema_version === DOM_EXPORT_SCHEMA_VERSION && other.kind === DOM_EXPORT_KIND
    && other.stage === 'other_conversation', `A9_W28_PROJECTION_DOM_KIND_INVALID:${caseId}:other`);
  assert(typeof other.conversation_id === 'string' && other.conversation_id.length > 0
    && other.conversation_id !== query.conversationId, `A9_W28_PROJECTION_SESSION_SWITCH_SAME_CONVERSATION:${caseId}`);
  // W28-H05：其他会话 DOM 必须是非空、身份有效且与原会话事件 ID 无交集（共享契约同一判定，
  // 方向为"无交集"；空会话不能单独证明隔离）。
  assert(!contract.sessionResidueViolation(other.rows, query.ids),
    `A9_W28_PROJECTION_CROSS_SESSION_RESIDUE:${caseId}`);
  const resumed = parseDomExport(readArtifact(proof.session_switch.resume_export, evidence, evidenceRoot, fileSystem, caseId, 'resume_export'), query, caseId, 'resume');
  assert(canonical(resumed.rows.map((row) => row.event_id)) === canonical(dom.rows.map((row) => row.event_id)),
    `A9_W28_PROJECTION_RESUME_MISMATCH:${caseId}`);
  assert(resumed.displayedOutcome === expectedDisplay, `A9_W28_PROJECTION_DOM_OUTCOME_MISMATCH:${caseId}:resume`);
  assert((resumed.latestPersistedTurnId || null) === (terminal.turn_id || null),
    `A9_W28_PROJECTION_DOM_LATEST_TURN_MISMATCH:${caseId}:resume`);
  return { query, terminal, dom };
}

function validateOutcomeProjection(proof, evidence, evidenceRoot, fileSystem, caseId) {
  const query = parseQueryExport(readArtifact(proof.query_export, evidence, evidenceRoot, fileSystem, caseId, 'query_export'), caseId);
  const afterRestart = parseDomExport(readArtifact(proof.dom_export, evidence, evidenceRoot, fileSystem, caseId, 'dom_export'), query, caseId, 'restart');
  const afterOlderLoad = parseDomExport(readArtifact(proof.dom_export_after_older_load, evidence, evidenceRoot, fileSystem, caseId, 'dom_export_after_older_load'), query, caseId, 'older_load');
  const older = proof.older_failure;
  const newer = proof.newer_success;
  assert(plain(older) && isEventId(older.event_id) && typeof older.turn_id === 'string' && older.turn_id.length > 0,
    `A9_W28_PROJECTION_OLDER_BINDING_INVALID:${caseId}`);
  assert(plain(newer) && isEventId(newer.event_id) && typeof newer.turn_id === 'string' && newer.turn_id.length > 0,
    `A9_W28_PROJECTION_NEWER_BINDING_INVALID:${caseId}`);
  assert(older.turn_id !== newer.turn_id, `A9_W28_PROJECTION_TURN_IDENTITY_COLLISION:${caseId}`);
  assert(older.event_id < newer.event_id, `A9_W28_PROJECTION_EVENT_IDENTITY_ORDER_INVALID:${caseId}`);
  const byId = new Map(query.events.map((event) => [event.event_id, event]));
  const olderEvent = byId.get(older.event_id);
  const newerEvent = byId.get(newer.event_id);
  const olderFacts = terminalFacts(olderEvent);
  const newerFacts = terminalFacts(newerEvent);
  assert(olderEvent && olderEvent.type === 'turn_failed' && olderEvent.turn_id === older.turn_id
    && olderFacts && olderFacts.outcome === 'failed' && olderFacts.verification === 'not_applicable',
  `A9_W28_PROJECTION_OLDER_QUERY_MISMATCH:${caseId}`);
  assert(newerEvent && newerEvent.type === 'turn_completed' && newerEvent.turn_id === newer.turn_id
    && newerFacts && newerFacts.outcome === 'completed' && newerFacts.verification === 'verified',
  `A9_W28_PROJECTION_NEWER_QUERY_MISMATCH:${caseId}`);
  const terminal = latestTerminal(query, caseId);
  assert(terminal.event_id === newer.event_id, `A9_W28_PROJECTION_STALE_GLOBAL_OUTCOME:${caseId}`);
  const expected = expectedDisplayed(terminal);
  assert(expected === DISPLAYED_OUTCOME, `A9_W28_PROJECTION_LATEST_NOT_VERIFIED:${caseId}`);
  assert(typeof proof.older_load_mode === 'string' && OLDER_LOAD_MODES.includes(proof.older_load_mode),
    `A9_W28_PROJECTION_OLDER_LOAD_MODE_INVALID:${caseId}`);
  assert(query.ids.length <= INSPECTOR_DISPLAY_ROWS || proof.older_load_mode === 'CLICKED_LOAD_MORE',
    `A9_W28_PROJECTION_RANGE_TOO_LARGE:${caseId}`);
  // F1：两个阶段的 DOM 附件必须携带与查询最新终态一致的显示结果与最新持久化 turn 身份；
  // 报告的平行汇总字段只是便利值，必须等于附件推导值。
  for (const [label, dom] of [['restart', afterRestart], ['older_load', afterOlderLoad]]) {
    assert(dom.displayedOutcome === expected, `A9_W28_PROJECTION_DOM_OUTCOME_MISMATCH:${caseId}:${label}`);
    assert((dom.latestPersistedTurnId || null) === (newer.turn_id || null),
      `A9_W28_PROJECTION_DOM_LATEST_TURN_MISMATCH:${caseId}:${label}`);
  }
  assert(proof.restart_displayed_outcome === expected && proof.restart_displayed_outcome === afterRestart.displayedOutcome,
    `A9_W28_PROJECTION_RESTART_OUTCOME_MISMATCH:${caseId}`);
  assert(proof.older_event_load_displayed_outcome === expected
    && proof.older_event_load_displayed_outcome === afterOlderLoad.displayedOutcome,
  `A9_W28_PROJECTION_OLDER_LOAD_OUTCOME_MISMATCH:${caseId}`);
  for (const [label, dom] of [['restart', afterRestart], ['older_load', afterOlderLoad]]) {
    assert(dom.rows.some((row) => row.event_id === newer.event_id && (row.turn_id || null) === newer.turn_id),
      `A9_W28_PROJECTION_NEWER_ROW_MISSING:${caseId}:${label}`);
  }
  assert(afterOlderLoad.rows.some((row) => row.event_id === older.event_id)
    || proof.older_load_mode === 'CLICKED_LOAD_MORE',
  `A9_W28_PROJECTION_OLDER_ROW_MISSING:${caseId}`);
  return { query, terminal, olderEvent, newerEvent };
}

/**
 * F4：必须证明旧失败经真实 beforeEventId 分页加载，且首批确实不包含它。
 *
 * W28-H04：本函数不再信任 `paging.ok` 摘要布尔值，而是把 driver 观察边界记录的真实分页
 * 链式事实（first_screen + pages[] + older_failure + 便利字段）交给共享契约
 * `validatePagingChain` 逐项自检；`window_limit` 必须绑定产品固定窗口（PRODUCT_FIRST_QUERY_LIMIT），
 * 观察边界必须是 IPC 主进程 handle 观察点。摘要字段只能向导出的逐页事实推导，不可独立填 PASS。
 */
function validatePagingProjection(proof, evidence, evidenceRoot, fileSystem, caseId) {
  const query = parseQueryExport(readArtifact(proof.query_export, evidence, evidenceRoot, fileSystem, caseId, 'query_export'), caseId);
  parseDomExport(readArtifact(proof.dom_export_after_older_load, evidence, evidenceRoot, fileSystem, caseId, 'dom_export_after_older_load'), query, caseId, 'older_load');
  const paging = proof.paging;
  assert(plain(paging), `A9_W28_PROJECTION_PAGING_REQUIRED:${caseId}`);
  // 产品 UI 分页窗口必须等于产品固定窗口（真实 driver 观察其首屏 limit 即此值）。
  assert(paging.window_limit === contract.PRODUCT_FIRST_QUERY_LIMIT,
    `A9_W28_PROJECTION_PAGING_WINDOW_UNBOUND:${caseId}`);
  // 观察边界必须证明证据来自 IPC 主进程 handle 观察点，而非 driver 独立参考查询或摘要。
  assert(paging.observation_boundary === 'IPC_MAIN_HANDLE_OBSERVER',
    `A9_W28_PROJECTION_PAGING_BOUNDARY_INVALID:${caseId}`);
  assert(typeof paging.conversation_id === 'string' && paging.conversation_id === query.conversationId,
    `A9_W28_PROJECTION_PAGING_CONVERSATION_MISMATCH:${caseId}`);
  const older = proof.older_failure;
  assert(plain(older) && isEventId(older.event_id) && typeof older.turn_id === 'string' && older.turn_id,
    `A9_W28_PROJECTION_OLDER_FAILURE_INVALID:${caseId}`);
  // 报告级旧失败身份必须与链内实际返回的旧失败一致。
  assert(paging.older_failure && paging.older_failure.event_id === older.event_id
    && (paging.older_failure.turn_id || null) === (older.turn_id || null)
    && paging.older_failure.type === 'turn_failed',
  `A9_W28_PROJECTION_PAGING_OLDER_BINDING_MISMATCH:${caseId}`);
  // RF03: 报告级旧失败身份必须与独立 query.events 中的同一事件交叉比对（拒绝自造 turn_id）
  const queryOlder = query.events.find((event) => event.event_id === older.event_id);
  assert(queryOlder && queryOlder.turn_id === older.turn_id && queryOlder.type === 'turn_failed',
    `A9_W28_PROJECTION_PAGING_OLDER_QUERY_MISMATCH:${caseId}`);
  // 用同一共享契约独立重算分页链，不信任 paging.ok 摘要。
  const verdict = contract.validatePagingChain(paging);
  assert(verdict.ok === true,
    `A9_W28_PROJECTION_PAGING_CHAIN_INVALID:${caseId}:${(verdict.violations || []).join(',')}`);
  // RF03: 分页返回的所有终态必须与独立 query.events 的事件身份（turn_id / type）一致，
  // 且首屏及各页成员集合必须与独立 query.events 严格一致（防止自造或缺漏成员）。
  if (paging.first_screen && Array.isArray(paging.first_screen.event_ids)) {
    const expectedFirstIds = query.events.slice(-paging.window_limit).map((e) => e.event_id);
    assert(canonical(paging.first_screen.event_ids) === canonical(expectedFirstIds),
      `A9_W28_PROJECTION_PAGING_FIRST_SCREEN_MEMBERS_MISMATCH:${caseId}`);
  }
  if (Array.isArray(paging.pages)) {
    for (const page of paging.pages) {
      if (page && page.request && page.response && Array.isArray(page.response.event_ids)) {
        const before = page.request.before_event_id;
        const limit = page.request.limit;
        const matchingEvents = query.events.filter((e) => e.event_id < before).slice(-limit);
        const expectedIds = matchingEvents.map((e) => e.event_id);
        assert(canonical(page.response.event_ids) === canonical(expectedIds),
          `A9_W28_PROJECTION_PAGING_MEMBERS_MISMATCH:${caseId}`);
        assert(page.response.count === expectedIds.length,
          `A9_W28_PROJECTION_PAGING_COUNT_MISMATCH:${caseId}`);
        const hasMoreExpected = query.events.some((e) => e.event_id < (expectedIds[0] || 0));
        assert(Boolean(page.response.has_more) === hasMoreExpected,
          `A9_W28_PROJECTION_PAGING_HAS_MORE_MISMATCH:${caseId}`);
      }
      for (const terminal of (page.response && page.response.terminal_events) || []) {
        const matchingQuery = query.events.find((e) => e.event_id === terminal.event_id);
        if (matchingQuery) {
          assert((matchingQuery.turn_id || null) === (terminal.turn_id || null) && matchingQuery.type === terminal.type,
            `A9_W28_PROJECTION_PAGING_TERMINAL_QUERY_MISMATCH:${caseId}`);
        }
      }
    }
  }
  // 查询附件必须记录真实游标与 hasMore，而不是硬编码 has_more=false。
  assert(query.pages.some((page) => page.before_event_id !== null), `A9_W28_PROJECTION_PAGES_CURSOR_NOT_RECORDED:${caseId}`);
  assert(query.pages.some((page) => page.before_event_id === null && page.has_more === true),
    `A9_W28_PROJECTION_PAGES_FIRST_HAS_MORE_INVALID:${caseId}`);
  return { query, paging };
}

function validateProjectionEvidence(proof, evidence, evidenceRoot, fileSystem, caseId) {
  assert(plain(proof), `A9_W28_PROJECTION_EVIDENCE_REQUIRED:${caseId}`);
  if (caseId === INSPECTOR_CASE) return validateInspectorProjection(proof, evidence, evidenceRoot, fileSystem, caseId);
  if (caseId === PAGING_CASE) return validatePagingProjection(proof, evidence, evidenceRoot, fileSystem, caseId);
  return validateOutcomeProjection(proof, evidence, evidenceRoot, fileSystem, caseId);
}

function validateExecution(execution, validationCase, identity, evidenceRoot, fileSystem) {
  assert(plain(execution) && canonical(execution.candidate) === canonical(identity), `A9_W28_EXECUTION_CANDIDATE_MISMATCH:${validationCase.case_id}`);
  assert(typeof execution.run_id === 'string' && /^[A-Za-z0-9._-]{8,128}$/.test(execution.run_id), `A9_W28_RUN_ID_INVALID:${validationCase.case_id}`);
  assert(plain(execution.environment)
    && execution.environment.os === 'Windows 7 SP1 build 7601'
    && execution.environment.architecture === 'x64'
    && execution.environment.user === 'ordinary-user'
    && execution.environment.elevation === 'not-elevated'
    && execution.environment.electron === '22.3.27'
    && execution.environment.electron_abi === 110,
  `A9_W28_ENVIRONMENT_INVALID:${validationCase.case_id}`);
  assert(Array.isArray(execution.assertions), `A9_W28_ASSERTIONS_REQUIRED:${validationCase.case_id}`);
  const expected = new Set(validationCase.assertions.map((item) => item.assertion_id));
  const seen = new Set();
  for (const assertion of execution.assertions) {
    assert(plain(assertion) && expected.has(assertion.assertion_id) && !seen.has(assertion.assertion_id)
      && assertion.status === 'PASS', `A9_W28_ASSERTION_INVALID:${validationCase.case_id}`);
    seen.add(assertion.assertion_id);
  }
  assert(seen.size === expected.size, `A9_W28_ASSERTIONS_MISSING:${validationCase.case_id}`);
  validateEvidence(execution.evidence, evidenceRoot, fileSystem, validationCase.case_id);
  if (PROJECTION_EVIDENCE_CASES.includes(validationCase.case_id)) {
    validateProjectionEvidence(execution.projection_evidence, execution.evidence, evidenceRoot, fileSystem, validationCase.case_id);
  }
  if (validationCase.case_id === REAL_PROVIDER_CASE) {
    assert(execution.provider_kind === 'REAL_NON_FIXTURE' && execution.provider_probe === 'tool_calling', 'A9_W28_REAL_PROVIDER_PROOF_INVALID');
  }
}

function verifyReport(report, kit, identity, evidenceRoot, fileSystem) {
  rejectSecrets(report);
  assert(plain(kit) && kit.schema_version === 1 && kit.kit_id === KIT_ID
    && kit.candidate_label === CANDIDATE_LABEL && Array.isArray(kit.required_cases)
    && kit.required_cases.length === REQUIRED_CASE_COUNT,
  'A9_W28_KIT_INVALID');
  for (const caseId of [...OUTCOME_CASES, PAGING_CASE, 'W28-04-APPROVAL-FAILURE-ORDER']) {
    assert(kit.required_cases.some((item) => item.case_id === caseId && Array.isArray(item.assertions) && item.assertions.length > 0),
      `A9_W28_KIT_CASE_MISSING:${caseId}`);
  }
  assert(plain(report) && report.schema_version === 1 && report.report_kind === REPORT_KIND, 'A9_W28_REPORT_SCHEMA_INVALID');
  assert(canonical(report.candidate) === canonical(identity), 'A9_W28_CANDIDATE_BINDING_MISMATCH');
  assert(Array.isArray(report.results) && report.results.length === kit.required_cases.length, 'A9_W28_RESULT_COUNT_INVALID');
  const expected = new Map(kit.required_cases.map((item) => [item.case_id, item]));
  const seen = new Set();
  for (const result of report.results) {
    assert(plain(result) && expected.has(result.case_id) && !seen.has(result.case_id), `A9_W28_CASE_ID_INVALID:${result && result.case_id}`);
    seen.add(result.case_id);
    assert(['PASS', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING'].includes(result.status), `A9_W28_CASE_STATUS_INVALID:${result.case_id}`);
    assert(Array.isArray(result.executions), `A9_W28_EXECUTIONS_REQUIRED:${result.case_id}`);
    if (result.status === 'PASS') {
      assert(result.executions.length > 0, `A9_W28_PASS_WITHOUT_EXECUTION:${result.case_id}`);
      result.executions.forEach((execution) => validateExecution(execution, expected.get(result.case_id), identity, evidenceRoot, fileSystem));
    }
  }
  assert(seen.size === expected.size, 'A9_W28_CASE_SET_INCOMPLETE');
  const complete = report.results.every((item) => item.status === 'PASS');
  const expectedStatus = report.results.some((item) => item.status === 'FAIL') ? 'FAIL' : complete ? 'PASS' : 'EVIDENCE_PENDING';
  assert(report.status === expectedStatus, 'A9_W28_OVERALL_STATUS_INVALID');
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
  assert(options.command === 'verify', 'A9_W28_COMMAND_INVALID');
  const reportPath = requiredFile(options.report, 'REPORT', fileSystem);
  assert(typeof options['evidence-root'] === 'string' && options['evidence-root'], 'A9_W28_EVIDENCE_ROOT_REQUIRED');
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
