'use strict';

/**
 * A9 投影证据共享契约（ADR-0121 / A9-15 §15）。
 *
 * driver 与正式报告器共用本模块的同一套实现，确保：
 * - 正向判定与负向变异走同一个行比较函数（`rowsMatchQuery`），不存在只对负向样本生效的第二套检查；
 * - 期望行表示由查询导出的持久化事实独立推导（`expectedRowLabel`），不复制 DOM 文本、不调用产品的
 *   Renderer 格式化函数，因此 Renderer 若把内容显示错绑，本契约能够发现；
 * - 两套验证规则不会各自漂移。
 *
 * 投影附件 schema_version（ADR-0121/ADR-0122 版本化）：查询附加 `display` 脱敏事实与 `pages` 查询事实
 * （v2）；DOM 附加 `stage` / `displayed_outcome` / `latest_persisted_turn_id`（v2），v3 起每个 DOM 导出
 * 必须携带 `time_baseline`（受测运行时独立记录的时区/格式化探针，W28-H03）。
 */

const QUERY_EXPORT_KIND = 'A9_PROJECTION_QUERY_EXPORT';
const DOM_EXPORT_KIND = 'A9_PROJECTION_DOM_EXPORT';
const QUERY_EXPORT_SCHEMA_VERSION = 2;
const DOM_EXPORT_SCHEMA_VERSION = 3;
const INSPECTOR_DISPLAY_RULE = 'LAST_60_BY_EVENT_ID_ASC';
const INSPECTOR_DISPLAY_ROWS = 60;
const PRODUCT_FIRST_QUERY_LIMIT = 300;
const STAGES = ['restart', 'resume', 'older_load', 'other_conversation'];
const TERMINAL_TYPES = ['turn_completed', 'turn_failed', 'turn_cancelled', 'turn_interrupted', 'turn_blocked'];
// 产品只在 turn_completed 上持久化 outcome/verification；turn_failed 的失败语义由事件类型承载。
const TERMINAL_TYPE_FACTS = { turn_failed: { outcome: 'failed', verification: 'not_applicable' } };
const MAX_TEXT = 2000;
const MAX_ERROR_HEAD = 120;
const MAX_COMMAND = 80;
const MAX_ARGS_FIELD = 400;

function eventIdOf(event) {
  if (!event) return undefined;
  return event.event_id !== undefined ? event.event_id : event.eventId;
}
function turnIdOf(event) {
  if (!event) return null;
  const value = event.turn_id !== undefined ? event.turn_id : event.turnId;
  return value === undefined ? null : value;
}
function isEventId(value) { return Number.isSafeInteger(value) && value > 0; }

/** 终态事件的有效 (outcome, verification)：显式 payload 优先，事件类型兜底。 */
function terminalFacts(event) {
  if (!event || !TERMINAL_TYPES.includes(event.type)) return null;
  const fallback = TERMINAL_TYPE_FACTS[event.type] || null;
  const outcome = typeof event.outcome === 'string' && event.outcome ? event.outcome : (fallback ? fallback.outcome : null);
  const verification = typeof event.verification === 'string' && event.verification
    ? event.verification : (fallback ? fallback.verification : null);
  return outcome && verification ? { outcome, verification } : null;
}
function expectedDisplayed(event) {
  const facts = terminalFacts(event);
  return facts ? `${facts.outcome} · ${facts.verification}` : null;
}
function latestTerminalEvent(events) {
  const terminals = (events || []).filter((event) => TERMINAL_TYPES.includes(event.type));
  if (!terminals.length) return null;
  return terminals.reduce((a, b) => (eventIdOf(b) > eventIdOf(a) ? b : a));
}

/**
 * 期望行标签：仅由查询导出的持久化事实推导。语义与产品 Renderer 的展示一致，但为独立实现。
 */
function toolHeadline(display) {
  const name = display && display.tool_name ? String(display.tool_name) : 'tool';
  const args = (display && display.args) || {};
  switch (name) {
    case 'read': return `读取 ${args.path || ''}`.trim();
    case 'list': return `列出 ${args.path || '.'}`;
    case 'search': return `搜索 ${args.pattern || ''}`.trim();
    case 'write': return `写入 ${args.path || ''}`.trim();
    case 'edit': return `编辑 ${args.path || ''}`.trim();
    case 'copy': return `复制 ${args.source || ''} → ${args.destination || ''}`;
    case 'move': return `移动 ${args.source || ''} → ${args.destination || ''}`;
    case 'delete': return `删除 ${args.path || ''}`.trim();
    case 'shell': return `运行命令 ${String(args.command || '').slice(0, MAX_COMMAND)}`;
    case 'update_plan': return '更新计划';
    default: return name;
  }
}
function expectedRowLabel(event) {
  const display = (event && event.display) || {};
  switch (event.type) {
    case 'turn_started': return '任务开始';
    case 'turn_completed': return `任务完成 · ${display.outcome || '-'}`;
    case 'turn_failed': return `任务失败 · ${String(display.error_head || '').slice(0, MAX_ERROR_HEAD)}`;
    case 'model_note': return '模型说明';
    case 'model_chunk': return '模型输出（汇总）';
    case 'plan_updated': return '更新计划';
    case 'approval_required': return `请求批准 · ${display.tool_name || '-'}`;
    case 'approval_resolved': return `审批${display.decision === 'approved' ? '已批准' : '已拒绝'} · ${display.tool_name || '-'}`;
    case 'tool_start': return `${toolHeadline(display)} …`;
    case 'tool_end':
      if (display.shell_has_exit_code === true) return `${toolHeadline(display)} · exit=${display.shell_exit_code}`;
      if (display.has_error === true) return `${toolHeadline(display)} · 失败`;
      if (display.denied === true) return `${toolHeadline(display)} · 已拒绝`;
      return toolHeadline(display);
    default: return event.type || 'event';
  }
}

// DOM 行文本形如 `HH:MM:SS · <label>`；时间前缀与语言环境相关，比较时剥离但要求其存在且一致。
const TIMESTAMP_PREFIX = /^\s*(?:(上午|下午|AM|PM)\s*)?(\d{1,2}):(\d{2}):(\d{2})(?:\s*(上午|下午|AM|PM))?\s*·\s*/i;
// 时间基准探针只有时间串（受测 Renderer 的 Date#toLocaleTimeString 输出），不含 `·` 分隔符。
const TIME_OF_DAY_ONLY = /^\s*(?:(上午|下午|AM|PM)\s*)?(\d{1,2}):(\d{2}):(\d{2})(?:\s*(上午|下午|AM|PM))?\s*$/i;
function hasTimestampPrefix(text) { return TIMESTAMP_PREFIX.test(String(text || '')); }
function rowLabelOf(text) { return String(text || '').replace(TIMESTAMP_PREFIX, '').trim(); }
function stampPrefixOf(text) { const match = String(text || '').match(TIMESTAMP_PREFIX); return match ? match[0] : null; }

/** 解析 12/24 小时制时钟（含 meridiem 归一化）为本机当日秒数；失败返回 null。 */
function clockSeconds(match) {
  if (!match) return null;
  const meridian = String(match[1] || match[5] || '').toUpperCase();
  let hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (meridian) {
    const isPm = meridian === 'PM' || meridian === '下午';
    if (hour === 12) hour = isPm ? 12 : 0;
    else if (isPm) hour += 12;
  }
  if (!Number.isSafeInteger(hour) || hour > 23 || minute > 59 || second > 59) return null;
  return hour * 3600 + minute * 60 + second;
}
/** 解析显示时间（24h 与 12h 均支持）为本机当日秒数；失败返回 null。 */
function parseStampSeconds(text) { return clockSeconds(String(text || '').match(TIMESTAMP_PREFIX)); }
/** 解析纯时间串（无 `·` 分隔符，用于时间基准探针）；失败返回 null。 */
function parseTimeOfDay(text) { return clockSeconds(String(text || '').match(TIME_OF_DAY_ONLY)); }
function utcSecondsOfDay(timestampMs) { return Math.floor(timestampMs / 1000) % 86400; }

/** 时间前缀的 meridiem 制式：'none'（24h）、'latin'（AM/PM）或 'cjk'（上午/下午）。 */
function meridiemModeOf(text) {
  const value = String(text || '');
  if (/(上午|下午)/.test(value)) return 'cjk';
  if (/AM|PM/i.test(value)) return 'latin';
  return 'none';
}

// W28-H03：时间基准探针的固定 UTC 输入（2026-01-15 的 00:00/06:00/12:00/18:00/23:59:59Z）。
// 五个探针覆盖全天，足以在任何时区同时暴露 AM 与 PM 本地时段，从而推导偏移与 12/24 小时制；
// 不含年份/日期信息，跨日语义由 timestamp_ms + 偏移的模运算处理。
const TIME_BASELINE_PROBE_VERSION = 2;
// 探针固定使用当日 5 个跨越不同小时段的 UTC 时间戳，用于探测受测 Renderer
// 的实际时区偏移与 12/24 小时制（含 AM/PM 与中文上午/下午）。
const TIME_BASELINE_PROBE_UTC_MS = Object.freeze([
  Date.UTC(2026, 0, 15, 0, 0, 0),
  Date.UTC(2026, 0, 15, 6, 0, 0),
  Date.UTC(2026, 0, 15, 12, 0, 0),
  Date.UTC(2026, 0, 15, 18, 0, 0),
  Date.UTC(2026, 0, 15, 23, 59, 59),
]);

/**
 * RF04：根据显式 timeZone 独立计算指定 timestamp 的实际 UTC 偏移秒数（精确区分夏令时与冬令时）。
 */
function getTzOffsetSeconds(utcMs, timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return null;
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
    const localMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    );
    const utcSec = Math.floor(utcMs / 1000);
    const localSec = Math.floor(localMs / 1000);
    return localSec - utcSec;
  } catch (_e) {
    return null;
  }
}

/**
 * W28-H03 / RF04：从受测运行时记录的独立时间基准推导 { offsetSeconds, meridiemMode, timeZone }。
 * 基准探针在受测 Renderer 内用与产品相同的 `Date#toLocaleTimeString()` 渲染固定 UTC 时间戳；
 * 偏移由探针与显式时区共同保障，不从待验 DOM 首行自校准；支持按事件日期独立重算夏令时偏移。
 * 探针缺失、版本不符、输入被改动、不可解析或彼此不一致一律返回 null（fail-closed）。
 */
function deriveTimeBaseline(baseline) {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) return null;
  if (baseline.probe_version !== 1 && baseline.probe_version !== 2) return null;
  const probes = baseline.probes;
  if (!Array.isArray(probes) || probes.length !== TIME_BASELINE_PROBE_UTC_MS.length) return null;
  let offsetSeconds = null;
  let meridiemMode = null;
  for (let index = 0; index < probes.length; index += 1) {
    const probe = probes[index];
    if (!probe || typeof probe !== 'object' || probe.utc_ms !== TIME_BASELINE_PROBE_UTC_MS[index]) return null;
    const local = parseTimeOfDay(probe.rendered);
    if (local === null) return null;
    const probeOffset = (((local - utcSecondsOfDay(probe.utc_ms)) % 86400) + 86400) % 86400;
    if (offsetSeconds === null) offsetSeconds = probeOffset;
    else if (probeOffset !== offsetSeconds) return null;
    const probeMode = meridiemModeOf(probe.rendered);
    if (meridiemMode === null) meridiemMode = probeMode;
    else if (probeMode !== meridiemMode) return null;
  }
  const timeZone = typeof baseline.time_zone === 'string' && baseline.time_zone.trim() ? baseline.time_zone.trim() : null;
  if (baseline.probe_version === 2 && !timeZone) return null;
  if (timeZone) {
    const probeTzOffset = getTzOffsetSeconds(TIME_BASELINE_PROBE_UTC_MS[0], timeZone);
    if (probeTzOffset === null) return null;
    const normalizedProbeTz = (((probeTzOffset % 86400) + 86400) % 86400);
    if (normalizedProbeTz !== offsetSeconds) return null;
  }
  return offsetSeconds === null ? null : { offsetSeconds, meridiemMode, timeZone };
}

/**
 * W28-H03 / RF04 时间一致性：每行期望时间由独立基准（若声明时区则按该行事件日期计算实际夏/冬令时偏移，
 * 否则使用基准探针偏移）与该行持久化 timestamp_ms 计算（模 86400，跨日自然回绕）。
 * 整列加 1 秒/1 小时、单行错时、仅一个阶段错时均与期望不符；夏令时地区冬夏偏移互换均被拒绝。
 */
function timestampsConsistent(rows, expected, baseline) {
  if (!Array.isArray(rows) || !Array.isArray(expected) || !rows.length) return false;
  const derived = deriveTimeBaseline(baseline);
  if (!derived) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const row = rows[index];
    const text = (row && typeof row.text === 'string') ? row.text : (typeof row === 'string' ? row : null);
    const local = parseStampSeconds(text);
    const timestampMs = expected[index] && expected[index].timestamp_ms;
    if (local === null || !Number.isSafeInteger(timestampMs)) return false;
    let offsetSec = derived.offsetSeconds;
    if (derived.timeZone) {
      const tzOffset = getTzOffsetSeconds(timestampMs, derived.timeZone);
      if (tzOffset !== null) {
        offsetSec = (((tzOffset % 86400) + 86400) % 86400);
      }
    }
    const expectedLocal = (utcSecondsOfDay(timestampMs) + offsetSec) % 86400;
    if (local !== expectedLocal) return false;
    const prefix = stampPrefixOf(text);
    if (prefix === null || meridiemModeOf(prefix) !== derived.meridiemMode) return false;
  }
  return true;
}

/**
 * 唯一行判定函数：正向断言与全部负向变异共用。
 * 逐行要求 event ID、turn ID、event type、显示文本（标签与查询事实推导值相等）与查询导出的有界显示范围
 * 完全一致，时间由独立基准（W28-H03）核对且无重复。event_type 或文本缺失一律不通过。
 */
function rowsMatchQuery(rows, events, baseline) {
  if (!Array.isArray(rows) || !Array.isArray(events)) return false;
  const expected = events.slice(-INSPECTOR_DISPLAY_ROWS);
  if (rows.length !== expected.length) return false;
  const seen = new Set();
  for (let index = 0; index < expected.length; index += 1) {
    const row = rows[index];
    const event = expected[index];
    if (!row || row.event_id !== eventIdOf(event)) return false;
    if ((row.turn_id || null) !== (turnIdOf(event) || null)) return false;
    if (row.event_type !== event.type) return false;
    if (typeof row.text !== 'string' || !row.text.trim()) return false;
    if (!hasTimestampPrefix(row.text)) return false;
    if (rowLabelOf(row.text) !== expectedRowLabel(event)) return false;
    if (seen.has(row.event_id)) return false;
    seen.add(row.event_id);
  }
  return timestampsConsistent(rows, expected, baseline) && true;
}

function crossSessionResidue(rows, allowedEventIds) {
  if (!Array.isArray(rows)) return true;
  const allowed = new Set(allowedEventIds || []);
  return rows.some((row) => !row || !allowed.has(row.event_id));
}

/**
 * W28-H05：会话残留判定（方向：无交集）。其他会话的 DOM 行必须全部携带有效事件身份，
 * 且与原会话的任何事件 ID 无交集；返回 true 表示存在残留或身份缺失（违规）。
 * 与 `crossSessionResidue`（检测"不属于允许集合的外来行"，用于原会话自身的行敏感性）
 * 语义不同：本函数用于切换后的其他会话视图——其他会话自己的新行合法，原会话行是残留。
 * 空行集同样视为违规：空会话只能作为边界样本，不能单独证明隔离成立。
 */
function sessionResidueViolation(rows, originalEventIds) {
  if (!Array.isArray(rows) || !rows.length) return true;
  const original = new Set(originalEventIds || []);
  return rows.some((row) => !row || !isEventId(eventIdOf(row)) || original.has(eventIdOf(row)));
}

/**
 * W28-H04：分页证据闭环校验（driver 正向自检/负向敏感性与正式报告器共用同一实现）。
 *
 * facts 的全部事实字段来自 IPC 观察边界记录的真实请求/响应（观察边界 = driver 在加载产品
 * 入口前安装的 ipcMain.handle 包装）；便利字段只是推导结果，必须与逐页事实一致：
 * - `window_limit`：本链的产品查询窗口（正式报告器另行断言其等于 PRODUCT_FIRST_QUERY_LIMIT）；
 * - `observation_boundary`：观察边界声明（'IPC_MAIN_HANDLE_OBSERVER'）；
 * - `classification`：产品 UI 请求与 driver 独立参考查询的区分规则说明；
 * - `first_screen`：产品重启后自动发出的真实首屏查询观察（limit=window、无 beforeEventId、
 *   hasMore=true、成员为满窗口且升序唯一）；
 * - `pages[]`：每次真实点击后的产品分页请求/响应观察（request.limit=window、
 *   beforeEventId=上一页实际响应的最旧事件；响应 ok、成员非空升序唯一、与既往无交集、
 *   严格向旧事件推进；click_observed 且 request_observed）；
 * - `older_failure`：旧失败终态身份（event_id/turn_id/type=turn_failed），必须属于某个
 *   实际成功响应页的终态成员，且不在首屏成员内；分页前其轮次内容不得已在 DOM 出现；
 * - `older_failure_loaded_observable`：补载后旧失败轮次内容在产品 DOM 可观察。
 *
 * 返回 `{ ok, violations }`；violations 为机器可读违规码数组（空数组 = 通过）。
 */
function validatePagingChain(facts) {
  const violations = [];
  const fail = (code) => { if (!violations.includes(code)) violations.push(code); };
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
    return { ok: false, violations: ['A9_PAGING_FACTS_INVALID'] };
  }
  if (typeof facts.conversation_id !== 'string' || !facts.conversation_id) fail('A9_PAGING_CONVERSATION_INVALID');
  if (facts.observation_boundary !== 'IPC_MAIN_HANDLE_OBSERVER') fail('A9_PAGING_OBSERVATION_BOUNDARY_INVALID');
  if (!facts.classification || typeof facts.classification !== 'object'
    || typeof facts.classification.product_ui !== 'string'
    || typeof facts.classification.driver_reference !== 'string') fail('A9_PAGING_CLASSIFICATION_INVALID');
  const windowLimit = facts.window_limit;
  if (!Number.isSafeInteger(windowLimit) || windowLimit < 1) fail('A9_PAGING_WINDOW_INVALID');
  const first = facts.first_screen;
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    return { ok: false, violations: [...violations, 'A9_PAGING_FIRST_SCREEN_INVALID'] };
  }
  const firstBefore = first.before_event_id === undefined ? null : first.before_event_id;
  if (first.ok !== true || first.limit !== windowLimit || firstBefore !== null) fail('A9_PAGING_FIRST_SCREEN_INVALID');
  if (first.has_more !== true) fail('A9_PAGING_FIRST_SCREEN_NOT_TRUNCATED');
  const firstIds = Array.isArray(first.event_ids) ? first.event_ids : null;
  if (!firstIds || firstIds.length !== windowLimit) {
    fail('A9_PAGING_FIRST_SCREEN_WINDOW_INVALID');
  } else {
    if (!firstIds.every((id, index) => isEventId(id) && (index === 0 || id > firstIds[index - 1]))) {
      fail('A9_PAGING_FIRST_SCREEN_ORDER_INVALID');
    }
    if (firstIds[0] !== first.first_event_id || firstIds[firstIds.length - 1] !== first.last_event_id
      || !isEventId(first.first_event_id) || !isEventId(first.last_event_id)) fail('A9_PAGING_FIRST_SCREEN_RANGE_INVALID');
    if (!Number.isSafeInteger(first.count) || first.count !== firstIds.length) fail('A9_PAGING_FIRST_SCREEN_COUNT_INVALID');
  }
  const pages = facts.pages;
  if (!Array.isArray(pages) || !pages.length) {
    fail('A9_PAGING_PAGES_EMPTY');
  } else {
    const seenIds = new Set(Array.isArray(firstIds) ? firstIds : []);
    let previousOldest = null;
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      if (!page || typeof page !== 'object' || Array.isArray(page)) { fail('A9_PAGING_PAGE_INVALID'); previousOldest = null; continue; }
      const request = page.request || {};
      const response = page.response;
      if (page.conversation_id !== facts.conversation_id) fail('A9_PAGING_PAGE_CONVERSATION_MISMATCH');
      if (page.click_observed !== true) fail('A9_PAGING_PAGE_NOT_CLICK_DRIVEN');
      if (page.request_observed !== true) fail('A9_PAGING_PAGE_REQUEST_NOT_OBSERVED');
      if (request.limit !== windowLimit || !isEventId(request.before_event_id)) fail('A9_PAGING_PAGE_REQUEST_INVALID');
      if (!response || typeof response !== 'object' || Array.isArray(response)) { fail('A9_PAGING_PAGE_RESPONSE_INVALID'); previousOldest = null; continue; }
      if (response.ok !== true) fail('A9_PAGING_PAGE_RESPONSE_FAILED');
      if (typeof response.has_more !== 'boolean') fail('A9_PAGING_PAGE_HAS_MORE_INVALID');
      if (index < pages.length - 1 && response.has_more !== true) fail('A9_PAGING_PAGE_CONTINUED_AFTER_NO_MORE');
      const ids = Array.isArray(response.event_ids) ? response.event_ids : [];
      if (!ids.length || ids.length !== response.count) fail('A9_PAGING_PAGE_MEMBERS_INVALID');
      if (!ids.every((id, at) => isEventId(id) && (at === 0 || id > ids[at - 1]))) fail('A9_PAGING_PAGE_ORDER_INVALID');
      if (!ids.length || !isEventId(response.first_event_id) || !isEventId(response.last_event_id)
        || ids[0] !== response.first_event_id || ids[ids.length - 1] !== response.last_event_id) {
        fail('A9_PAGING_PAGE_RANGE_INVALID');
      }
      // RF03: 响应终态摘要必须属于同页成员集合（禁止 terminal 自报不属于页成员的事件）
      const terminals = Array.isArray(response.terminal_events) ? response.terminal_events : [];
      const pageMemberSet = new Set(ids);
      for (const terminal of terminals) {
        if (!terminal || !isEventId(terminal.event_id) || !pageMemberSet.has(terminal.event_id)) {
          fail('A9_PAGING_PAGE_TERMINAL_NOT_IN_MEMBERS');
          break;
        }
      }
      // 游标连续性：首页游标 = 首屏最旧事件；后续游标 = 上一页实际响应的最旧事件。
      const expectedCursor = index === 0 ? first.first_event_id : previousOldest;
      if (isEventId(expectedCursor) && request.before_event_id !== expectedCursor) fail('A9_PAGING_CURSOR_NOT_CONTINUOUS');
      // 严格向旧事件推进：本页最新事件必须严格早于上一页（或首屏）的最旧事件。
      if (ids.length && isEventId(expectedCursor) && !(ids[ids.length - 1] < expectedCursor)) fail('A9_PAGING_PAGE_NOT_PROGRESSING');
      // 去重合并：与首屏及既往页不得重复。
      for (const id of ids) {
        if (seenIds.has(id)) { fail('A9_PAGING_PAGE_DUPLICATE_EVENT'); break; }
      }
      for (const id of ids) seenIds.add(id);
      previousOldest = ids.length ? ids[0] : null;
    }
  }
  const older = facts.older_failure;
  const olderInPage = Array.isArray(pages) && pages.some((page) => page && page.response
    && Array.isArray(page.response.event_ids) && Boolean(older) && page.response.event_ids.includes(older.event_id)
    && Array.isArray(page.response.terminal_events)
    && page.response.terminal_events.some((item) => item && item.type === 'turn_failed'
      && item.event_id === older.event_id && (item.turn_id || null) === (older.turn_id || null)));
  if (!older || !isEventId(older.event_id) || typeof older.turn_id !== 'string' || !older.turn_id
    || older.type !== 'turn_failed') {
    fail('A9_PAGING_OLDER_FAILURE_INVALID');
  } else {
    if (!olderInPage) fail('A9_PAGING_OLDER_FAILURE_NOT_IN_PAGE');
    if (Array.isArray(firstIds) && firstIds.includes(older.event_id)) fail('A9_PAGING_OLDER_IN_FIRST_SCREEN');
    if (facts.older_failure_loaded_observable !== true) fail('A9_PAGING_OLDER_FAILURE_NOT_LOADED');
  }
  // RF03: DOM 观察原始详情与加载/预加载摘要强一致交叉核对
  if (!facts.before || typeof facts.before !== 'object' || !facts.after || typeof facts.after !== 'object') {
    fail('A9_PAGING_DOM_OBSERVATIONS_MISSING');
  }
  if (facts.older_failure_loaded_observable === true) {
    if (!facts.after || !facts.after.olderObservable || typeof facts.after.olderObservable !== 'object') {
      fail('A9_PAGING_DOM_OBSERVATIONS_MISSING');
    } else {
      const obs = facts.after.olderObservable;
      if (obs.blockFound !== true || obs.hasLegacyNote !== false) {
        fail('A9_PAGING_DOM_OBSERVATION_CONTRADICTS_SUMMARY');
      }
    }
  }
  if (facts.before && facts.before.olderObservable && typeof facts.before.olderObservable === 'object') {
    const beforeObs = facts.before.olderObservable;
    const populatedBefore = Boolean(beforeObs.blockFound === true && beforeObs.hasLegacyNote === false);
    if (facts.older_failure_block_populated_before_paging !== populatedBefore) {
      fail('A9_PAGING_PRELOAD_CONTRADICTS_DOM');
    }
  } else {
    fail('A9_PAGING_DOM_OBSERVATIONS_MISSING');
  }
  if (facts.older_failure_block_populated_before_paging === true) fail('A9_PAGING_OLDER_FAILURE_PRELOADED');
  // 便利字段只能由已验证事实推导：与逐页事实不一致即拒绝（不能靠摘要布尔值通过）。
  const lastPage = Array.isArray(pages) && pages.length ? pages[pages.length - 1] : null;
  const successSum = Array.isArray(pages)
    ? pages.reduce((sum, page) => (page && page.response && page.response.ok === true
      && Number.isSafeInteger(page.response.count) ? sum + page.response.count : sum), 0)
    : 0;
  const summaryExpectations = [
    ['controlConsumed', Array.isArray(pages) && pages.some((page) => page && page.click_observed === true && page.request_observed === true)],
    ['pageCount', successSum],
    ['pageHasMore', Boolean(lastPage && lastPage.response && lastPage.response.has_more === true)],
    ['pageLastId', lastPage && lastPage.response ? lastPage.response.last_event_id : null],
    ['pageHasOlderFailure', olderInPage],
    ['pageOlderFailureId', older ? older.event_id : null],
    ['firstPageExcludesOlderFailure', older ? !(Array.isArray(firstIds) && firstIds.includes(older.event_id)) : false],
    ['beforeEventId', first.first_event_id],
    ['firstPageLimit', first.limit],
    ['firstPageCount', Array.isArray(firstIds) ? firstIds.length : null],
    ['firstPageHasMore', first.has_more === true],
    ['firstPageOldestId', first.first_event_id],
  ];
  for (const [key, expected] of summaryExpectations) {
    if (facts[key] !== undefined && facts[key] !== expected) fail('A9_PAGING_SUMMARY_INCONSISTENT');
  }
  return { ok: violations.length === 0, violations };
}

/**
 * 负向样本构造：每个变异都必须被 `rowsMatchQuery` 拒绝。变异只作用于观察值副本。
 * 内容类变异保留行数、ID、turn 与标签，只替换非标签内容或交换两行文字，用于证明内容错绑会被发现。
 */
/** W28-H03 时间平移渲染：保留原制式与 meridiem 位置，把行时间平移 deltaSeconds（12h 制语义重算）。 */
function renderStamp(totalSeconds, mode, leading) {
  const seconds = ((totalSeconds % 86400) + 86400) % 86400;
  const hour = Math.floor(seconds / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  const second = seconds % 60;
  const two = (value) => String(value).padStart(2, '0');
  if (mode === 'none') return `${two(hour)}:${two(minute)}:${two(second)}`;
  const isPm = hour >= 12;
  let hour12 = hour % 12;
  if (hour12 === 0) hour12 = 12;
  if (mode === 'cjk') {
    const stamp = `${two(hour12)}:${two(minute)}:${two(second)}`;
    return leading ? `${isPm ? '下午' : '上午'}${stamp}` : `${stamp} ${isPm ? '下午' : '上午'}`;
  }
  const stamp = `${two(hour12)}:${two(minute)}:${two(second)}`;
  return leading ? `${isPm ? 'PM' : 'AM'} ${stamp}` : `${stamp} ${isPm ? 'PM' : 'AM'}`;
}
function shiftRowStamp(row, deltaSeconds) {
  const prefix = stampPrefixOf(row.text);
  const local = parseStampSeconds(row.text);
  if (prefix === null || local === null) return { ...row };
  const leading = /^\s*(?:上午|下午|AM|PM)/i.test(prefix);
  const mode = meridiemModeOf(prefix);
  return { ...row, text: `${renderStamp(local + deltaSeconds, mode, leading)} · ${rowLabelOf(row.text)}` };
}
function rowMutationSamples(rows, events) {
  const copy = () => (Array.isArray(rows) ? rows.map((row) => ({ ...row })) : []);
  const base = copy();
  const missing = base.slice(0, -1);
  const reordered = base.slice();
  if (reordered.length > 1) { const swap = reordered[0]; reordered[0] = reordered[1]; reordered[1] = swap; }
  const duplicated = base.length ? [base[0], ...base] : [];
  const residue = base.length
    ? [...base, { event_id: 99999999, turn_id: null, event_type: 'turn_failed', text: '00:00:01 · 外来会话行' }]
    : [];
  // 内容变异：保留全部 ID/turn/类型，仅替换标签内容（模拟内容错绑到其他轮次或被打错）。
  const foreignContent = base.map((row) => ({ ...row, text: row.text.replace(/^(\s*\d{1,2}:\d{2}:\d{2}\s*·\s*).*$/s, '$1不相关内容') }));
  // 内容变异：交换两行文字但保留各自 event ID。
  const swappedText = base.slice();
  if (swappedText.length > 1) { const first = swappedText[0].text; swappedText[0] = { ...swappedText[0], text: swappedText[1].text }; swappedText[1] = { ...swappedText[1], text: first }; }
  // 内容变异：只替换工具摘要/路径，保留标签前缀。
  const wrongDetail = base.map((row) => ({ ...row, text: row.text.replace(/(读取|编辑|写入|删除|运行命令|列出|搜索) [^\s]*/u, '$1 其他目标') }));
  // 内容变异：把另一轮次的标签整体挪到本行（保留 ID）。
  const otherTurnLabel = base.map((row) => (row.event_type === 'turn_completed'
    ? { ...row, text: row.text.replace(/^(\s*\d{1,2}:\d{2}:\d{2}\s*·\s*).*$/s, '$1任务失败 · 其他轮次') } : row));
  // 时间变异：保留标签与身份，只把时间前缀换成固定的错误时间。
  const wrongTime = base.map((row, index) => ({
    ...row,
    text: String(row.text).replace(TIMESTAMP_PREFIX, `${String(3 + index % 7).padStart(2, '0')}:07:07 · `),
  }));
  // W28-H03 时间变异：整列统一 +1 秒 / +1 小时（保留 ID/turn/类型/标签与制式），证明统一错时
  // 不再被首行自校准吸收；单行 +1 秒证明逐行核对。
  const uniformShiftPlus1s = base.map((row) => shiftRowStamp(row, 1));
  const uniformShiftPlus1h = base.map((row) => shiftRowStamp(row, 3600));
  const singleRowPlus1s = base.map((row, index) => (index === 0 ? shiftRowStamp(row, 1) : { ...row }));
  // W28-H03 时间变异：时间缺失（无时间前缀）与不可解析时间。
  const missingTime = base.map((row) => ({ ...row, text: rowLabelOf(row.text) }));
  const invalidTime = base.map((row) => ({ ...row, text: `25:61:61 · ${rowLabelOf(row.text)}` }));
  // 身份变异：丢掉 event_type。
  const missingEventType = base.map((row) => ({ ...row, event_type: null }));
  return {
    missing,
    reordered,
    duplicated,
    residue,
    foreignContent,
    swappedText,
    wrongDetail,
    otherTurnLabel,
    wrongTime,
    uniformShiftPlus1s,
    uniformShiftPlus1h,
    singleRowPlus1s,
    missingTime,
    invalidTime,
    missingEventType,
  };
}

function allMutationsRejected(rows, events, baseline) {
  const samples = rowMutationSamples(rows, events);
  const rejected = {};
  for (const [name, sample] of Object.entries(samples)) {
    if (name === 'residue') {
      rejected[name] = crossSessionResidue(sample, (events || []).map(eventIdOf));
    } else {
      rejected[name] = !rowsMatchQuery(sample, events, baseline);
    }
  }
  return { baseline: rowsMatchQuery(rows, events, baseline), rejected };
}

module.exports = {
  QUERY_EXPORT_KIND, DOM_EXPORT_KIND, QUERY_EXPORT_SCHEMA_VERSION, DOM_EXPORT_SCHEMA_VERSION,
  INSPECTOR_DISPLAY_RULE, INSPECTOR_DISPLAY_ROWS, PRODUCT_FIRST_QUERY_LIMIT, STAGES,
  TERMINAL_TYPES, MAX_TEXT, MAX_ERROR_HEAD, MAX_COMMAND, MAX_ARGS_FIELD,
  TIME_BASELINE_PROBE_VERSION, TIME_BASELINE_PROBE_UTC_MS,
  eventIdOf, turnIdOf, isEventId,
  terminalFacts, expectedDisplayed, latestTerminalEvent,
  toolHeadline, expectedRowLabel, hasTimestampPrefix, rowLabelOf, stampPrefixOf,
  parseStampSeconds, parseTimeOfDay, utcSecondsOfDay, meridiemModeOf, deriveTimeBaseline,
  getTzOffsetSeconds,
  timestampsConsistent, TIMESTAMP_PREFIX,
  rowsMatchQuery, crossSessionResidue, sessionResidueViolation, rowMutationSamples, allMutationsRejected,
  validatePagingChain,
};
