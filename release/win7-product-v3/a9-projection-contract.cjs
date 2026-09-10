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
 * 投影附件 schema_version = 2（ADR-0121 版本化）：查询附加 `display` 脱敏事实与 `pages` 查询事实，
 * DOM 附加 `stage` / `displayed_outcome` / `latest_persisted_turn_id`。
 */

const QUERY_EXPORT_KIND = 'A9_PROJECTION_QUERY_EXPORT';
const DOM_EXPORT_KIND = 'A9_PROJECTION_DOM_EXPORT';
const QUERY_EXPORT_SCHEMA_VERSION = 2;
const DOM_EXPORT_SCHEMA_VERSION = 2;
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
function hasTimestampPrefix(text) { return TIMESTAMP_PREFIX.test(String(text || '')); }
function rowLabelOf(text) { return String(text || '').replace(TIMESTAMP_PREFIX, '').trim(); }

/** 解析显示时间（24h 与 12h 均支持）为本机当日秒数；失败返回 null。 */
function parseStampSeconds(text) {
  const match = String(text || '').match(TIMESTAMP_PREFIX);
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
function utcSecondsOfDay(timestampMs) { return Math.floor(timestampMs / 1000) % 86400; }

/**
 * 时间一致性：由首行推导本机时区/截断偏移，其余各行必须与该偏移一致。
 * 查询侧必须提供 timestamp_ms；任一行时间被替换、缺失或与持久化时间不符即不通过。
 * 这样既能发现"错误时间"，又不依赖验证机与产品机的时区/语言环境相同。
 */
function timestampsConsistent(rows, expected) {
  if (!Array.isArray(rows) || !Array.isArray(expected) || !rows.length) return false;
  const samples = [];
  for (let index = 0; index < expected.length; index += 1) {
    const local = parseStampSeconds(rows[index] && rows[index].text);
    const timestampMs = expected[index] && expected[index].timestamp_ms;
    if (local === null || !Number.isSafeInteger(timestampMs)) return false;
    samples.push({ local, utc: utcSecondsOfDay(timestampMs) });
  }
  const offset = samples[0].local - samples[0].utc;
  return samples.every((sample) => ((((sample.utc + offset) % 86400) + 86400) % 86400) === sample.local);
}

/**
 * 唯一行判定函数：正向断言与全部负向变异共用。
 * 逐行要求 event ID、turn ID、event type、显示文本（标签与查询事实推导值相等）与查询导出的有界显示范围
 * 完全一致，时间与持久化时间自洽且无重复。event_type 或文本缺失一律不通过。
 */
function rowsMatchQuery(rows, events) {
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
  return timestampsConsistent(rows, expected) && true;
}

function crossSessionResidue(rows, allowedEventIds) {
  if (!Array.isArray(rows)) return true;
  const allowed = new Set(allowedEventIds || []);
  return rows.some((row) => !row || !allowed.has(row.event_id));
}

/**
 * 负向样本构造：每个变异都必须被 `rowsMatchQuery` 拒绝。变异只作用于观察值副本。
 * 内容类变异保留行数、ID、turn 与标签，只替换非标签内容或交换两行文字，用于证明内容错绑会被发现。
 */
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
    missingEventType,
  };
}

function allMutationsRejected(rows, events) {
  const samples = rowMutationSamples(rows, events);
  const rejected = {};
  for (const [name, sample] of Object.entries(samples)) {
    if (name === 'residue') {
      rejected[name] = crossSessionResidue(sample, (events || []).map(eventIdOf));
    } else {
      rejected[name] = !rowsMatchQuery(sample, events);
    }
  }
  return { baseline: rowsMatchQuery(rows, events), rejected };
}

module.exports = {
  QUERY_EXPORT_KIND, DOM_EXPORT_KIND, QUERY_EXPORT_SCHEMA_VERSION, DOM_EXPORT_SCHEMA_VERSION,
  INSPECTOR_DISPLAY_RULE, INSPECTOR_DISPLAY_ROWS, PRODUCT_FIRST_QUERY_LIMIT, STAGES,
  TERMINAL_TYPES, MAX_TEXT, MAX_ERROR_HEAD, MAX_COMMAND, MAX_ARGS_FIELD,
  eventIdOf, turnIdOf, isEventId,
  terminalFacts, expectedDisplayed, latestTerminalEvent,
  toolHeadline, expectedRowLabel, hasTimestampPrefix, rowLabelOf,
  parseStampSeconds, utcSecondsOfDay, timestampsConsistent, TIMESTAMP_PREFIX,
  rowsMatchQuery, crossSessionResidue, rowMutationSamples, allMutationsRejected,
};
