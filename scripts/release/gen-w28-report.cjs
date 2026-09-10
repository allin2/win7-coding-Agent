'use strict';
// 从已提交的 WIN7-27 报告器生成 WIN7-28 报告器（ADR-0121）：
// 版本化投影附件 schema v2、DOM 结果/turn/阶段强制校验（F1）、共享契约逐行内容与时间核对（F2）、
// 以及 W28-10 分页用例（F4）。所有改写都基于锚点切片，避免手工整篇重写引入偏差。
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '..', 'release', 'win7-product-v3');
const src = fs.readFileSync(path.join(dir, 'a9-win7-27-report.cjs'), 'utf8');

const toW28 = (text) => text
  .split('WIN7_27').join('WIN7_28')
  .split('WIN7-27').join('WIN7-28')
  .split('win7-27').join('win7-28')
  .split('W27').join('W28')
  .split('ADR-0120').join('ADR-0121');

let out = toW28(src);

function replaceBetween(startAnchor, endAnchor, replacement, label) {
  const start = out.indexOf(startAnchor);
  if (start < 0) throw new Error(`start anchor missing: ${label}`);
  const end = out.indexOf(endAnchor, start);
  if (end < 0) throw new Error(`end anchor missing: ${label}`);
  out = out.slice(0, start) + replacement + out.slice(end);
}

// 1) 头部说明 + 常量（含共享契约与 schema v2）
replaceBetween(' * A9-15 / WIN7-28 验收报告器（ADR-0121）。', 'const OLDER_LOAD_MODES', ` * A9-15 / WIN7-28 验收报告器（ADR-0121）。
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
`, 'header');

// 2) 查询与 DOM 解析（F1 必填字段 + F2 共享契约逐行判定）
replaceBetween('function parseQueryExport(', '/** 全局结果必须等于查询导出中最新终态事件的结果', `function parseQueryExport(exported, caseId) {
  assert(exported.schema_version === QUERY_EXPORT_SCHEMA_VERSION && exported.kind === QUERY_EXPORT_KIND,
    \`A9_W28_PROJECTION_QUERY_KIND_INVALID:\${caseId}\`);
  assert(typeof exported.conversation_id === 'string' && exported.conversation_id.length > 0,
    \`A9_W28_PROJECTION_CONVERSATION_REQUIRED:\${caseId}\`);
  assert(Array.isArray(exported.events) && exported.events.length > 0, \`A9_W28_PROJECTION_QUERY_EMPTY:\${caseId}\`);
  // F4：查询附件必须保存真实查询事实（limit/beforeEventId/hasMore/返回范围），不得硬编码。
  assert(Array.isArray(exported.pages) && exported.pages.length > 0, \`A9_W28_PROJECTION_QUERY_PAGES_REQUIRED:\${caseId}\`);
  for (const page of exported.pages) {
    assert(plain(page) && page.ok === true && typeof page.has_more === 'boolean'
      && (page.limit === null || Number.isSafeInteger(page.limit))
      && (page.before_event_id === null || isEventId(page.before_event_id))
      && (page.returned_count === null || Number.isSafeInteger(page.returned_count)),
    \`A9_W28_PROJECTION_QUERY_PAGE_INVALID:\${caseId}\`);
  }
  const bound = (value, cap) => {
    assert(value === null || value === undefined || (typeof value === 'string' && value.length <= cap),
      \`A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:\${caseId}\`);
  };
  const events = [];
  const seen = new Set();
  for (const event of exported.events) {
    assert(plain(event) && isEventId(event.event_id) && !seen.has(event.event_id), \`A9_W28_PROJECTION_EVENT_ID_INVALID:\${caseId}\`);
    assert(event.turn_id === null || (typeof event.turn_id === 'string' && event.turn_id.length > 0),
      \`A9_W28_PROJECTION_EVENT_TURN_INVALID:\${caseId}\`);
    assert(typeof event.type === 'string' && event.type.length > 0, \`A9_W28_PROJECTION_EVENT_TYPE_INVALID:\${caseId}\`);
    assert(event.outcome === undefined || event.outcome === null || typeof event.outcome === 'string', \`A9_W28_PROJECTION_EVENT_OUTCOME_INVALID:\${caseId}\`);
    assert(event.verification === undefined || event.verification === null || typeof event.verification === 'string', \`A9_W28_PROJECTION_EVENT_VERIFICATION_INVALID:\${caseId}\`);
    // F2/时间：重建显示文本与显示时间所需的脱敏事实必须具备且必须有界。
    assert(Number.isSafeInteger(event.timestamp_ms), \`A9_W28_PROJECTION_EVENT_TIMESTAMP_REQUIRED:\${caseId}\`);
    const display = event.display;
    assert(plain(display), \`A9_W28_PROJECTION_EVENT_DISPLAY_REQUIRED:\${caseId}\`);
    bound(display.outcome, 200);
    bound(display.error_head, contract.MAX_ERROR_HEAD);
    bound(display.tool_name, 200);
    bound(display.decision, 40);
    bound(display.call_id, 200);
    assert(display.denied === undefined || typeof display.denied === 'boolean', \`A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:\${caseId}\`);
    assert(display.has_error === undefined || typeof display.has_error === 'boolean', \`A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:\${caseId}\`);
    assert(display.shell_has_exit_code === undefined || typeof display.shell_has_exit_code === 'boolean', \`A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:\${caseId}\`);
    assert(display.shell_exit_code === undefined || display.shell_exit_code === null || Number.isSafeInteger(display.shell_exit_code), \`A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:\${caseId}\`);
    assert(display.step === undefined || display.step === null || Number.isSafeInteger(display.step), \`A9_W28_PROJECTION_DISPLAY_BOUND_INVALID:\${caseId}\`);
    assert(plain(display.args), \`A9_W28_PROJECTION_DISPLAY_ARGS_REQUIRED:\${caseId}\`);
    for (const key of ['path', 'pattern', 'source', 'destination']) bound(display.args[key], contract.MAX_ARGS_FIELD);
    bound(display.args.command, contract.MAX_COMMAND);
    const previous = events.length ? events[events.length - 1] : null;
    assert(!previous || event.event_id > previous.event_id, \`A9_W28_PROJECTION_QUERY_ORDER_INVALID:\${caseId}\`);
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
 * 并且必须保留实际显示结果、最新持久化 turn 身份（F1）与自身阶段标识。
 */
function parseDomExport(exported, query, caseId, stage) {
  assert(exported.schema_version === DOM_EXPORT_SCHEMA_VERSION && exported.kind === DOM_EXPORT_KIND,
    \`A9_W28_PROJECTION_DOM_KIND_INVALID:\${caseId}:\${stage}\`);
  assert(typeof exported.stage === 'string' && STAGES.includes(exported.stage) && exported.stage === stage,
    \`A9_W28_PROJECTION_DOM_STAGE_MISMATCH:\${caseId}:\${stage}:\${exported.stage}\`);
  assert(exported.conversation_id === query.conversationId, \`A9_W28_PROJECTION_CONVERSATION_MISMATCH:\${caseId}:\${stage}\`);
  assert(typeof exported.displayed_outcome === 'string' && exported.displayed_outcome.length > 0,
    \`A9_W28_PROJECTION_DOM_OUTCOME_MISSING:\${caseId}:\${stage}\`);
  assert(exported.latest_persisted_turn_id === null
    || (typeof exported.latest_persisted_turn_id === 'string' && exported.latest_persisted_turn_id.length > 0),
  \`A9_W28_PROJECTION_DOM_LATEST_TURN_INVALID:\${caseId}:\${stage}\`);
  assert(plain(exported.display_range) && exported.display_range.rule === INSPECTOR_DISPLAY_RULE
    && exported.display_range.max_rows === INSPECTOR_DISPLAY_ROWS, \`A9_W28_PROJECTION_DISPLAY_RULE_INVALID:\${caseId}:\${stage}\`);
  assert(Array.isArray(exported.rows), \`A9_W28_PROJECTION_DOM_ROWS_REQUIRED:\${caseId}:\${stage}\`);
  // 正向判定与全部负向变异共用同一函数：身份、顺序、去重、内容或时间不符一律拒绝。
  assert(contract.rowsMatchQuery(exported.rows, query.events), \`A9_W28_PROJECTION_DOM_ROWS_MISMATCH:\${caseId}:\${stage}\`);
  assert(exported.display_range.rows_total === expectedRange(query).length, \`A9_W28_PROJECTION_DISPLAY_TOTAL_INVALID:\${caseId}:\${stage}\`);
  return {
    rows: exported.rows, conversationId: exported.conversation_id,
    displayedOutcome: exported.displayed_outcome,
    latestPersistedTurnId: exported.latest_persisted_turn_id, stage: exported.stage,
  };
}

`, 'parse');

// 3) 终态推导委托共享契约 + Inspector 阶段 F1 校验
replaceBetween('/** 返回终态事件的有效 (outcome, verification)', 'function validateOutcomeProjection(', `/** 终态事实与显示结果由共享契约推导，报告器与 driver 使用同一实现。 */
function terminalFacts(event) { return contract.terminalFacts(event); }
function expectedDisplayed(event) {
  const facts = contract.terminalFacts(event);
  assert(facts, \`A9_W28_PROJECTION_TERMINAL_OUTCOME_MISSING:\${event && event.event_id}\`);
  return \`\${facts.outcome} · \${facts.verification}\`;
}

function validateInspectorProjection(proof, evidence, evidenceRoot, fileSystem, caseId) {
  const query = parseQueryExport(readArtifact(proof.query_export, evidence, evidenceRoot, fileSystem, caseId, 'query_export'), caseId);
  const dom = parseDomExport(readArtifact(proof.dom_export, evidence, evidenceRoot, fileSystem, caseId, 'dom_export'), query, caseId, 'restart');
  assert(query.events.some((event) => event.turn_id === null), \`A9_W28_PROJECTION_SESSION_EVENTS_MISSING:\${caseId}\`);
  assert(query.events.some((event) => event.type === 'tool_start') && query.events.some((event) => event.type === 'tool_end'),
    \`A9_W28_PROJECTION_TOOL_EVENTS_MISSING:\${caseId}\`);
  const terminal = latestTerminal(query, caseId);
  assert(dom.rows.some((row) => row.event_id === terminal.event_id), \`A9_W28_PROJECTION_TERMINAL_ROW_MISSING:\${caseId}\`);
  // F1：DOM 附件的实际显示结果与最新持久化 turn 身份必须与查询最新终态一致。
  const expectedDisplay = expectedDisplayed(terminal);
  assert(dom.displayedOutcome === expectedDisplay, \`A9_W28_PROJECTION_DOM_OUTCOME_MISMATCH:\${caseId}:restart\`);
  assert((dom.latestPersistedTurnId || null) === (terminal.turn_id || null),
    \`A9_W28_PROJECTION_DOM_LATEST_TURN_MISMATCH:\${caseId}:restart\`);
  // 切换会话后不得残留上一会话内容，且切回后逐行复原。
  assert(plain(proof.session_switch), \`A9_W28_PROJECTION_SESSION_SWITCH_REQUIRED:\${caseId}\`);
  const other = readArtifact(proof.session_switch.other_conversation_export, evidence, evidenceRoot, fileSystem, caseId, 'other_conversation_export');
  assert(other.schema_version === DOM_EXPORT_SCHEMA_VERSION && other.kind === DOM_EXPORT_KIND
    && other.stage === 'other_conversation', \`A9_W28_PROJECTION_DOM_KIND_INVALID:\${caseId}:other\`);
  assert(typeof other.conversation_id === 'string' && other.conversation_id.length > 0
    && other.conversation_id !== query.conversationId, \`A9_W28_PROJECTION_SESSION_SWITCH_SAME_CONVERSATION:\${caseId}\`);
  const foreignIds = new Set(query.ids);
  assert(Array.isArray(other.rows) && !other.rows.some((row) => plain(row) && foreignIds.has(row.event_id)),
    \`A9_W28_PROJECTION_CROSS_SESSION_RESIDUE:\${caseId}\`);
  const resumed = parseDomExport(readArtifact(proof.session_switch.resume_export, evidence, evidenceRoot, fileSystem, caseId, 'resume_export'), query, caseId, 'resume');
  assert(canonical(resumed.rows.map((row) => row.event_id)) === canonical(dom.rows.map((row) => row.event_id)),
    \`A9_W28_PROJECTION_RESUME_MISMATCH:\${caseId}\`);
  assert(resumed.displayedOutcome === expectedDisplay, \`A9_W28_PROJECTION_DOM_OUTCOME_MISMATCH:\${caseId}:resume\`);
  assert((resumed.latestPersistedTurnId || null) === (terminal.turn_id || null),
    \`A9_W28_PROJECTION_DOM_LATEST_TURN_MISMATCH:\${caseId}:resume\`);
  return { query, terminal, dom };
}

`, 'inspector');

// 4) 结果阶段 F1 校验
replaceBetween('  assert(proof.restart_displayed_outcome === expected', '  for (const [label, dom] of [[\'restart\', afterRestart], [\'older_load\', afterOlderLoad]]) {', `  // F1：两个阶段的 DOM 附件必须携带与查询最新终态一致的显示结果与最新持久化 turn 身份；
  // 报告的平行汇总字段只是便利值，必须等于附件推导值。
  for (const [label, dom] of [['restart', afterRestart], ['older_load', afterOlderLoad]]) {
    assert(dom.displayedOutcome === expected, \`A9_W28_PROJECTION_DOM_OUTCOME_MISMATCH:\${caseId}:\${label}\`);
    assert((dom.latestPersistedTurnId || null) === (newer.turn_id || null),
      \`A9_W28_PROJECTION_DOM_LATEST_TURN_MISMATCH:\${caseId}:\${label}\`);
  }
  assert(proof.restart_displayed_outcome === expected && proof.restart_displayed_outcome === afterRestart.displayedOutcome,
    \`A9_W28_PROJECTION_RESTART_OUTCOME_MISMATCH:\${caseId}\`);
  assert(proof.older_event_load_displayed_outcome === expected
    && proof.older_event_load_displayed_outcome === afterOlderLoad.displayedOutcome,
  \`A9_W28_PROJECTION_OLDER_LOAD_OUTCOME_MISMATCH:\${caseId}\`);
`, 'outcome');

// 5) W28-10 分页校验 + 证据分发
replaceBetween('function validateProjectionEvidence(', 'function validateExecution(', `/** F4：必须证明旧失败经真实 beforeEventId 分页加载，且首批确实不包含它。 */
function validatePagingProjection(proof, evidence, evidenceRoot, fileSystem, caseId) {
  const query = parseQueryExport(readArtifact(proof.query_export, evidence, evidenceRoot, fileSystem, caseId, 'query_export'), caseId);
  parseDomExport(readArtifact(proof.dom_export_after_older_load, evidence, evidenceRoot, fileSystem, caseId, 'dom_export_after_older_load'), query, caseId, 'older_load');
  const paging = proof.paging;
  assert(plain(paging), \`A9_W28_PROJECTION_PAGING_REQUIRED:\${caseId}\`);
  assert(paging.ok === true, \`A9_W28_PROJECTION_PAGING_NOT_EXECUTED:\${caseId}\`);
  assert(paging.firstPageHasMore === true, \`A9_W28_PROJECTION_PAGING_NO_TRUNCATION:\${caseId}\`);
  assert(isEventId(paging.beforeEventId), \`A9_W28_PROJECTION_PAGING_CURSOR_MISSING:\${caseId}\`);
  assert(paging.controlConsumed === true, \`A9_W28_PROJECTION_PAGING_CONTROL_NOT_CONSUMED:\${caseId}\`);
  assert(Number.isSafeInteger(paging.pageCount) && paging.pageCount > 0
    && isEventId(paging.pageLastId) && paging.pageLastId < paging.beforeEventId,
  \`A9_W28_PROJECTION_PAGING_CURSOR_NOT_ADVANCED:\${caseId}\`);
  assert(paging.pageHasOlderFailure === true, \`A9_W28_PROJECTION_PAGING_OLDER_FAILURE_MISSING:\${caseId}\`);
  assert(paging.firstPageExcludesOlderFailure === true, \`A9_W28_PROJECTION_PAGING_OLDER_IN_FIRST_PAGE:\${caseId}\`);
  const older = proof.older_failure;
  assert(plain(older) && isEventId(older.event_id) && older.event_id === paging.pageOlderFailureId,
    \`A9_W28_PROJECTION_PAGING_OLDER_BINDING_MISMATCH:\${caseId}\`);
  // 查询附件必须记录真实游标与 hasMore，而不是硬编码 has_more=false。
  assert(query.pages.some((page) => page.before_event_id !== null), \`A9_W28_PROJECTION_PAGES_CURSOR_NOT_RECORDED:\${caseId}\`);
  assert(query.pages.some((page) => page.before_event_id === null && page.has_more === true),
    \`A9_W28_PROJECTION_PAGES_FIRST_HAS_MORE_INVALID:\${caseId}\`);
  return { query, paging };
}

function validateProjectionEvidence(proof, evidence, evidenceRoot, fileSystem, caseId) {
  assert(plain(proof), \`A9_W28_PROJECTION_EVIDENCE_REQUIRED:\${caseId}\`);
  if (caseId === INSPECTOR_CASE) return validateInspectorProjection(proof, evidence, evidenceRoot, fileSystem, caseId);
  if (caseId === PAGING_CASE) return validatePagingProjection(proof, evidence, evidenceRoot, fileSystem, caseId);
  return validateOutcomeProjection(proof, evidence, evidenceRoot, fileSystem, caseId);
}

`, 'paging');

out = out.split('if (OUTCOME_CASES.includes(validationCase.case_id)) {').join('if (PROJECTION_EVIDENCE_CASES.includes(validationCase.case_id)) {');
out = out.split("for (const caseId of [...OUTCOME_CASES, 'W28-04-APPROVAL-FAILURE-ORDER']) {")
  .join("for (const caseId of [...OUTCOME_CASES, PAGING_CASE, 'W28-04-APPROVAL-FAILURE-ORDER']) {");

const target = path.join(dir, 'a9-win7-28-report.cjs');
fs.writeFileSync(target, out);
console.log('wrote', target, out.length, 'bytes');
