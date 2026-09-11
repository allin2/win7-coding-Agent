'use strict';

/**
 * A9-06 正式产品 Electron smoke 驱动入口（四进程版）。
 *
 * 进程内 require 正式 product/main.js（真实入口、真实 preload、真实
 * workbench.html/a9-workbench.js），经 BrowserWindow.getAllWindows() 在真实 DOM 上
 * 完成模式选择、Provider 配置、Turn、越权拒绝、Diff、撤销与重启恢复。
 *
 * 多进程模式：A9_SMOKE_MODE=first|second|stop。first 绑定工作区/模式/fixture
 * Provider、跑 read/edit/真实测试、Diff、触发永久删除或 git push 审批，
 * 检查审批卡真实目标与绑定、拒绝后交由宿主检查真实文件，checkpoint 后退出；second 打开
 * 相同 dataRoot，验证模式/Provider/checkpoint/中断恢复、fixture 请求计数
 * 证明无模型重放、旧审批不可执行；stop 经真实 UI 启动并取消 Shell 子进程。
 *
 * ADR-0120：driver 协议由 A9_SMOKE_DRIVER_PROTOCOL 显式选择。
 * - `projection`：启用投影协议——额外形成旧 failed/not_applicable 与较新
 *   completed/verified 轮次，逐行核对 Inspector 有界显示范围，并导出机器可读投影证据。
 * - 缺省（legacy）：只执行历史 profile 原本支持的旅程，不发送投影专用提示词，
 *   以保证 W23/W24/W25 profile 的 fixture 协议保持兼容。
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { app, BrowserWindow, dialog } = require('electron');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const productMain = process.env.A9_SMOKE_PRODUCT_MAIN || path.join(repositoryRoot, 'src/shell/product/main.js');
const requireModelNotes = process.env.A9_SMOKE_REQUIRE_MODEL_NOTES === '1';
const driverProtocol = process.env.A9_SMOKE_DRIVER_PROTOCOL === 'projection' ? 'projection' : 'legacy';
const projectionEnabled = driverProtocol === 'projection';
const projectionDirectory = process.env.A9_SMOKE_PROJECTION_DIR || '';
const PROJECTION_FAILURE_PROMPT = 'record expected provider failure';
const PROJECTION_LATEST_SUCCESS_PROMPT = 'produce latest verified turn';
const PROJECTION_BULK_PROMPT = 'generate bulk history events';
const PROJECTION_APPROVE_PROMPT = 'approve the high impact operation';

// ADR-0121 / W28-H01：共享契约的显式解析合同（不回退搜索任意本机路径，不依赖源码仓库存在）：
//   1) A9_SMOKE_PROJECTION_CONTRACT：外置 smoke / 开发机 runner 显式传入的契约绝对路径；
//   2) driver 同级 a9-projection-contract.cjs：候选 validation/ 与外置 driver-app/ 布局。
// projection 协议必须有契约：缺失即 fail-closed（模块初始化抛错、进程非零退出、smoke 失败），
// 不回退 legacy 跳过投影验收。legacy 协议不解析契约：历史 profile 在无契约目录仍可完整运行。
const PROJECTION_CONTRACT_FILENAME = 'a9-projection-contract.cjs';
// 查询导出事实的边界。legacy 无契约也要运行，因此在 driver 内声明；
// projection 契约加载后必须与契约一致，否则 fail-closed（防止两套边界漂移）。
const EXPORT_BOUNDS = Object.freeze({ MAX_ERROR_HEAD: 120, MAX_COMMAND: 80, MAX_ARGS_FIELD: 400 });
function resolveProjectionContractPath() {
  const explicit = String(process.env.A9_SMOKE_PROJECTION_CONTRACT || '');
  if (explicit) {
    if (!path.isAbsolute(explicit)) throw new Error(`A9_PROJECTION_CONTRACT_PATH_NOT_ABSOLUTE:${explicit}`);
    if (!fs.existsSync(explicit)) throw new Error(`A9_PROJECTION_CONTRACT_UNAVAILABLE:${explicit}`);
    return explicit;
  }
  const sibling = path.join(__dirname, PROJECTION_CONTRACT_FILENAME);
  if (fs.existsSync(sibling)) return sibling;
  throw new Error(`A9_PROJECTION_CONTRACT_UNAVAILABLE:${sibling}`);
}
let projectionContract = null;
function requireProjectionContract() {
  if (projectionContract) return projectionContract;
  const contractPath = resolveProjectionContractPath();
  const loaded = require(contractPath);
  for (const [key, value] of Object.entries(EXPORT_BOUNDS)) {
    if (loaded[key] !== value) throw new Error(`A9_PROJECTION_CONTRACT_BOUNDS_MISMATCH:${key}:${loaded[key]}`);
  }
  projectionContract = loaded;
  return projectionContract;
}
const projectionContractApi = projectionEnabled ? requireProjectionContract() : {};
const {
  INSPECTOR_DISPLAY_RULE, INSPECTOR_DISPLAY_ROWS, QUERY_EXPORT_KIND, DOM_EXPORT_KIND,
  QUERY_EXPORT_SCHEMA_VERSION, DOM_EXPORT_SCHEMA_VERSION, PRODUCT_FIRST_QUERY_LIMIT,
  TIME_BASELINE_PROBE_VERSION, TIME_BASELINE_PROBE_UTC_MS, deriveTimeBaseline,
  expectedRowLabel, rowLabelOf, hasTimestampPrefix, rowsMatchQuery,
  sessionResidueViolation, validatePagingChain,
  allMutationsRejected, terminalFacts, expectedDisplayed, latestTerminalEvent, eventIdOf, turnIdOf,
  isEventId,
} = projectionContractApi;
const INSPECTOR_DISPLAY_LABEL = String(INSPECTOR_DISPLAY_ROWS);

/** 把 DOM 观察行转换为投影附件行（snake_case）；行判定统一由共享契约执行。 */
function exportRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    event_id: row.eventId,
    turn_id: row.turnId === undefined ? null : row.turnId,
    event_type: row.eventType === undefined ? null : row.eventType,
    text: row.text,
  }));
}
/** 观察值层面的终态行判定：最新 turn_* 行必须绑定给定终态。 */
function terminalRowOutcomeMatches(rows, terminalEventId, terminalTurnId) {
  const exported = exportRows(rows);
  const terminals = exported.filter((row) => row && row.event_type && String(row.event_type).startsWith('turn_'));
  if (!terminals.length) return false;
  const newest = terminals.reduce((a, b) => (b.event_id > a.event_id ? b : a));
  return newest.event_id === terminalEventId && (newest.turn_id || null) === (terminalTurnId || null);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
/**
 * 负向敏感性：缺行、乱序、重复、跨会话残留，内容类（替换全部标签内容、交换两行文字、替换工具摘要/
 * 路径、挪入另一轮次标签）与时间/身份类（错误时间、统一错时、单行错时、时间缺失/无效、丢失
 * event_type）变异；全部与正向断言共用同一函数与同一时间基准。
 */
function negativeSensitivity(rows, events, baseline) {
  return allMutationsRejected(exportRows(rows), events, baseline);
}

/**
 * W28-H03：在受测 Renderer 内用与产品相同的 `Date#toLocaleTimeString()`（内建，非产品函数）渲染
 * 契约固定 UTC 探针，形成独立时间基准。期望时间由基准偏移 + 持久化 timestamp_ms 推导，
 * 不从待验 DOM 首行自校准；每阶段各自采集并随该阶段 DOM 导出绑定。
 */
function collectTimeBaseline(exec) {
  return exec(`(() => ({
    probe_version: ${JSON.stringify(TIME_BASELINE_PROBE_VERSION)},
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    probes: ${JSON.stringify(TIME_BASELINE_PROBE_UTC_MS)}.map((utcMs) => ({ utc_ms: utcMs, rendered: new Date(utcMs).toLocaleTimeString() })),
  }))()`);
}
function writeProjectionExport(name, payload) {
  if (!projectionDirectory) return null;
  fs.mkdirSync(projectionDirectory, { recursive: true });
  const target = path.join(projectionDirectory, name);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return target;
}

const report = {
  status: 'RUNNING',
  mode: process.env.A9_SMOKE_MODE || 'first',
  driver_protocol: driverProtocol,
  cases: [],
};
// F3/W28-H06：一次性事件查询故障注入状态（由 main() 在加载产品入口前安装的 IPC 包装使用）。
// retry 进程以 A9_SMOKE_RETRY_CONVERSATION 绑定目标会话：只有 conversationId 匹配的
// a9.events.query 才被注入一次结构化失败，其他会话/其他动作的查询不受影响。
let injectQueryFailureOnce = false;
let injectQueryFailureConversation = null;
let injectedQueryFailure = null;

// W28-H04：主进程 IPC 观察边界记录的真实 a9.events.query 请求/响应（有界缓冲）。
// 只记录身份/计数/范围/hasMore/终态身份等脱敏事实，不落任何事件内容或秘密；
// 不修改、不拦截产品行为。观察条目按 seq 单调递增，供分页探针按因果顺序逐轮绑定。
const queryObservations = [];
let queryObservationSeq = 0;
let queryObservationsDropped = 0;
const QUERY_OBSERVATION_MAX = 128;
const QUERY_OBSERVATION_EVENT_IDS_MAX = 320;
const QUERY_OBSERVATION_TERMINAL_TYPES = ['turn_completed', 'turn_failed', 'turn_cancelled', 'turn_interrupted', 'turn_blocked'];
function pushQueryObservation(entry) {
  queryObservationSeq += 1;
  queryObservations.push({ ...entry, seq: queryObservationSeq });
  if (queryObservations.length > QUERY_OBSERVATION_MAX) {
    queryObservations.shift();
    queryObservationsDropped += 1;
  }
}
/**
 * W28-H04：把一次真实 a9.events.query 调用归纳为脱敏观察事实。成员 ID 集合仅对
 * 产品窗口（limit ≤ 320）记录，driver 独立参考查询（limit=1000）只记计数/范围摘要，
 * 两条查询链在证据中显式区分，不混写为同一来源。
 */
function summarizeQueryObservation(request, result, injected) {
  const payload = (request && request.payload) || {};
  const events = result && result.ok === true && Array.isArray(result.events) ? result.events : [];
  const ids = [];
  const terminalEvents = [];
  for (const item of events) {
    if (!item || !Number.isSafeInteger(item.eventId)) continue;
    ids.push(item.eventId);
    const type = item.eventType || item.type;
    if (QUERY_OBSERVATION_TERMINAL_TYPES.includes(type) && terminalEvents.length < 128) {
      terminalEvents.push({ event_id: item.eventId, turn_id: item.turnId || null, type });
    }
  }
  return {
    at: new Date().toISOString(),
    action: 'a9.events.query',
    conversation_id: typeof payload.conversationId === 'string' ? payload.conversationId : null,
    limit: Number.isSafeInteger(payload.limit) ? payload.limit : null,
    before_event_id: Number.isSafeInteger(payload.beforeEventId) ? payload.beforeEventId : null,
    ok: result ? result.ok === true : false,
    has_more: result ? result.hasMore === true : null,
    count: ids.length,
    first_event_id: ids.length ? ids[0] : null,
    last_event_id: ids.length ? ids[ids.length - 1] : null,
    event_ids: Number.isSafeInteger(payload.limit) && payload.limit <= QUERY_OBSERVATION_EVENT_IDS_MAX
      ? ids.slice(0, QUERY_OBSERVATION_EVENT_IDS_MAX) : null,
    terminal_events: terminalEvents,
    error: result && result.ok !== true && result.error && result.error.code
      ? String(result.error.code).slice(0, 64) : null,
    injected: injected === true,
  };
}

/** 渲染器内：按真实分页把所有事件完整采集并按 eventId 升序合并（超过单次上限时不得只取一页）。 */
const COLLECT_ALL_EVENTS = `(async () => {
  const api = window.win7Agent.a9;
  const current = (await api.snapshot()).snapshot;
  const conversationId = current.activeConversationId;
  const pages = [];
  const collected = [];
  const seen = new Set();
  let beforeEventId = null;
  for (let guard = 0; guard < 60; guard += 1) {
    const options = { conversationId, limit: 1000 };
    if (beforeEventId !== null) options.beforeEventId = beforeEventId;
    const response = await api.queryEvents(options);
    const events = (response && response.ok === true && response.events) ? response.events : [];
    pages.push({
      limit: 1000, before_event_id: beforeEventId, has_more: response && response.hasMore === true,
      returned_count: events.length, returned_first_event_id: events.length ? events[0].eventId : null,
      returned_last_event_id: events.length ? events[events.length - 1].eventId : null,
      ok: response && response.ok === true,
    });
    for (const event of events) if (!seen.has(event.eventId)) { seen.add(event.eventId); collected.push(event); }
    if (!(response && response.hasMore === true) || !events.length) break;
    beforeEventId = events[0].eventId;
  }
  collected.sort((a, b) => a.eventId - b.eventId);
  return { conversationId, events: collected, ids: collected.map((event) => event.eventId), pages };
})()`;
function record(id, passed, detail) {
  report.cases.push({ id, passed: passed === true, detail: detail || '' });
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function captureVisual(win, scene) {
  const directory = process.env.A9_SMOKE_VISUAL_DIR;
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true });
  await win.webContents.executeJavaScript(`(() => {
    if (document.getElementById('inspector').classList.contains('open')) {
      document.getElementById('close-inspector').click();
    }
    return true;
  })()`);
  await sleep(600);
  const target = path.join(directory, `${scene}.png`);
  fs.writeFileSync(target, (await win.webContents.capturePage()).toPNG());
  record(`A9-15-CAPTURE-${scene}`, fs.existsSync(target), JSON.stringify({
    path: target, contentSize: win.getContentSize(), zoom: win.webContents.getZoomFactor(),
  }));
}
async function waitFor(condition, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await condition();
      if (value) return value;
    } catch (err) {
      report.lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(300);
  }
  throw new Error(`TIMEOUT waiting for ${label} (last: ${report.lastError || 'none'})`);
}

async function main() {
  const mode = process.env.A9_SMOKE_MODE || 'first';
  const workspaceRoot = process.env.A9_SMOKE_WORKSPACE;
  if (mode === 'workspace_select' || mode === 'first' || mode === 'stop') {
    // Start with no active workspace, then drive the real workspace.select IPC.
    // The dialog replacement is confined to this acceptance process.
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspaceRoot] });
  }
  // F3 故障注入接缝 + W28-H04 观察边界：在加载正式产品入口之前包装 ipcMain.handle。
  // 注入只发生在测试进程内、只影响一次绑定目标会话的 a9.events.query 调用，不修改产品
  // 源码、守卫或清理保证；观察边界只记录真实 a9.events.query 请求/响应的脱敏摘要
  // （不修改、不拦截、不落内容）。retry 进程在产品入口加载前布防一次性替身，
  // 对 Renderer 初次历史加载触发真实失败（W28-H06 优先方案：独立进程注入）。
  if (mode === 'retry') {
    injectQueryFailureOnce = true;
    injectQueryFailureConversation = process.env.A9_SMOKE_RETRY_CONVERSATION || null;
  }
  {
    const { ipcMain } = require('electron');
    const originalHandle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = (channel, listener) => {
      if (typeof listener !== 'function' || String(channel) !== 'product:a9-request') {
        return originalHandle(channel, listener);
      }
      return originalHandle(channel, async (...args) => {
        const request = args[1];
        const isEventsQuery = Boolean(request) && typeof request === 'object'
          && request.action === 'a9.events.query';
        if (isEventsQuery && injectQueryFailureOnce
          && (!injectQueryFailureConversation
            || (request.payload && request.payload.conversationId === injectQueryFailureConversation))) {
          injectQueryFailureOnce = false;
          injectedQueryFailure = {
            channel: String(channel), matchedRequest: JSON.stringify(request).slice(0, 200), at: new Date().toISOString(),
            boundConversation: injectQueryFailureConversation,
          };
          pushQueryObservation(summarizeQueryObservation(request,
            { ok: false, error: { code: 'A9_INJECTED_QUERY_FAILURE' } }, true));
          return { ok: false, error: { code: 'A9_INJECTED_QUERY_FAILURE' } };
        }
        if (!isEventsQuery) return listener(...args);
        const result = await listener(...args);
        pushQueryObservation(summarizeQueryObservation(request, result, false));
        return result;
      });
    };
  }
  // 正式产品入口（真实 main.js：注册全部产品 IPC 并打开真实窗口）。
  require(productMain);

  const dataRoot = process.env.A9_SMOKE_DATAROOT;
  const fixtureUrl = process.env.A9_SMOKE_FIXTURE_URL;

  const win = await waitFor(() => {
    const page = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('renderer/workbench.html'));
    return page || null;
  }, 30_000, 'production window');
  const exec = (code) => win.webContents.executeJavaScript(code);

  await waitFor(() => exec('document.readyState === "complete"'), 20_000, 'renderer ready');

  if (mode === 'workspace_select') {
    await runWorkspaceSelectionProcess(win, exec, { workspaceRoot });
    report.status = report.cases.every((c) => c.passed) ? 'PASS' : 'FAIL';
    return;
  }

  if (mode === 'first' || mode === 'stop') {
    await exec('document.getElementById("workspace-select").click(); true');
    const explorer = await waitFor(() => exec(`(() => {
      const file = Array.from(document.querySelectorAll('#workspace-tree button'))
        .find((item) => item.title === 'calc.ts');
      return file ? { path: file.title, workspace: document.getElementById('a9-workspace-value').textContent } : null;
    })()`), 20_000, 'formal workspace selection and Explorer session');
    record('A9F1-FORMAL-EXPLORER-SESSION', explorer.path === 'calc.ts' && explorer.workspace.includes(path.basename(workspaceRoot)), JSON.stringify(explorer));
  }

  // 工作区经正式 selectWorkspace 链路绑定（main.js 同进程已完成）；A9 面板出现。
  const surface = await waitFor(() => exec('(() => { const s = document.getElementById("a9-surface"); return s && !s.hidden && s.dataset.a9Status ? { visible: true, workspace: document.getElementById("a9-workspace-value").textContent } : null; })()'), 20_000, 'A9 surface');
  record('A9F0-WORKSPACE-BOUND', surface.visible === true && surface.workspace.includes(path.basename(workspaceRoot)), JSON.stringify(surface));

  // F1：UI 显示绝对路径（正式快照的 workspaceRoot），Renderer 无 Node/process。
  const capability = await exec('({ node: typeof require !== "undefined", process: typeof process !== "undefined", workspaceShown: document.getElementById("a9-workspace-value").textContent })');
  record('A9F0-RENDERER-CAPABILITY', capability.node === false && capability.process === false, JSON.stringify(capability));

  // F6：非法模式返回精确 A9_MODE_INVALID（经真实 preload/IPC）。
  const invalidMode = await exec('(window.win7Agent.a9.setMode("bogus-mode")).then(r => ({ ok: r.ok, code: r.error && r.error.code }))');
  record('A9F6-MODE-INVALID-PRECISE', invalidMode.ok === false && invalidMode.code === 'A9_MODE_INVALID', JSON.stringify(invalidMode));

  if (mode === 'first') {
    await runFirstProcess(win, exec, { workspaceRoot, dataRoot, fixtureUrl });
  } else if (mode === 'second') {
    await runSecondProcess(win, exec, { workspaceRoot, dataRoot, fixtureUrl });
  } else if (mode === 'retry') {
    await runRetryProcess(win, exec, { workspaceRoot, dataRoot, fixtureUrl });
  } else if (mode === 'stop') {
    await runStopProcess(win, exec, {
      workspaceRoot,
      dataRoot,
      fixtureUrl,
      pidMarker: process.env.A9_SMOKE_STOP_PID_MARKER,
    });
  } else {
    throw new Error(`Unsupported A9_SMOKE_MODE: ${mode}`);
  }

  report.status = report.cases.every((c) => c.passed) ? 'PASS' : 'FAIL';
}

async function runWorkspaceSelectionProcess(win, exec, env) {
  const initial = await exec(`(async () => {
    const snapshot = await window.win7Agent.a9.snapshot();
    return {
      code: snapshot.error && snapshot.error.code,
      dialogHidden: document.getElementById('a9-mode-dialog').hidden,
    };
  })()`);
  record('A9F0-WORKSPACE-REQUIRED-BEFORE-SELECTION', initial.code === 'A9_WORKSPACE_REQUIRED' && initial.dialogHidden === true, JSON.stringify(initial));

  await exec('document.getElementById("workspace-select").click(); true');
  const selected = await waitFor(() => exec(`(() => {
    const dialogNode = document.getElementById('a9-mode-dialog');
    const fullAccess = document.querySelector('input[name="a9-mode-choice"][value="full_access"]');
    const shownWorkspace = document.getElementById('a9-workspace-value').textContent;
    if (dialogNode.hidden || !fullAccess || !shownWorkspace.includes(${JSON.stringify(env.workspaceRoot.split(/[\\/]/).pop())})) return null;
    return {
      dialogVisible: true,
      fullAccessVisible: fullAccess.offsetParent !== null || !fullAccess.hidden,
      fullAccessChecked: fullAccess.checked,
      workspace: shownWorkspace,
      errorHidden: document.getElementById('error-banner').hidden,
    };
  })()`), 20_000, 'workspace selection and A9 mode dialog');
  record('A9F0-FULL-ACCESS-REACHABLE-AFTER-WORKSPACE', selected.dialogVisible === true && selected.fullAccessVisible === true && selected.fullAccessChecked === true && selected.errorHidden === true, JSON.stringify(selected));

  const screenshotPath = process.env.A9_SMOKE_WORKSPACE_SELECT_SCREENSHOT;
  if (screenshotPath) {
    win.setSize(860, 620);
    await new Promise((resolve) => setTimeout(resolve, 800));
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    const image = await win.webContents.capturePage();
    fs.writeFileSync(screenshotPath, image.toPNG());
    record('A9F0-MODE-DIALOG-SCREENSHOT', fs.existsSync(screenshotPath), screenshotPath);
  }

  await exec('document.getElementById("a9-mode-apply").click(); true');
  const mode = await waitFor(() => exec('(window.win7Agent.a9.snapshot()).then(r => r.ok && r.snapshot.mode === "full_access" ? r.snapshot.mode : null)'), 15_000, 'full access selection');
  record('A9F0-FULL-ACCESS-SELECTION-PERSISTED', mode === 'full_access', `mode=${mode}`);
  await captureVisual(win, 'empty');

  // The unified Composer is A9-only. Without a configured Provider it remains
  // safely blocked and must not fall back to the historical A8 desktop request.
  const composer = await exec(`(() => {
    const prompt = document.getElementById('task-prompt');
    prompt.value = '分析这个工作区的代码结构';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    const send = document.getElementById('run-task');
    const error = document.getElementById('error-banner');
    return {
      sendDisabled: send.disabled,
      taskState: document.getElementById('task-state').textContent,
      sessionStatus: document.getElementById('session-status').textContent,
      errorHidden: error.hidden,
      error: error.textContent,
    };
  })()`);
  record('A9F0-MAIN-COMPOSER-A9-BOUNDARY', composer.sendDisabled === true && composer.taskState === '空闲' && composer.sessionStatus.includes('Provider 尚未配置') && composer.errorHidden === true && !composer.error.includes('IPC_SCHEMA_INVALID'), JSON.stringify(composer));
}

async function runFirstProcess(win, exec, env) {
  // 真实 DOM 选择 Full Access。
  await exec('document.querySelector(\'input[name="a9-mode-choice"][value="full_access"]\').checked = true; document.getElementById("a9-mode-apply").click(); true');
  const mode = await waitFor(() => exec('(window.win7Agent.a9.snapshot()).then(r => r.snapshot.mode)').then((m) => (m === 'full_access' ? m : null)), 15_000, 'mode set');
  record('A9F1-MODE-SELECTION', mode === 'full_access', `mode=${mode}`);

  // fixture Provider（任意 Base URL + 手工模型；保存即真实 probe）。
  await exec(`(() => {
    document.getElementById('a9-provider-url').value = ${JSON.stringify(env.fixtureUrl)};
    document.getElementById('a9-provider-model').value = 'smoke-manual-model';
    document.getElementById('a9-provider-apply').click();
    return true;
  })()`);
  const probe = await waitFor(() => exec('document.getElementById("a9-provider-probe-state").textContent').then((t) => (t === 'tool_calling' ? t : null)), 30_000, 'provider probe');
  record('A9F1-PROVIDER-CONFIG-PROBE', probe === 'tool_calling', `probe=${probe}`);

  // 投影协议专用：真实 Provider HTTP 失败，形成早于后续成功轮次的 failed/not_applicable
  // 持久化事实。legacy 协议不发送该提示词，历史 profile fixture 因此保持兼容。
  if (projectionEnabled) {
    await exec(`(() => { const prompt = document.getElementById("task-prompt"); prompt.value = ${JSON.stringify(PROJECTION_FAILURE_PROMPT)}; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()`);
    const failedDisplayed = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t === 'failed · not_applicable' ? t : null)), 90_000, 'expected failed outcome');
    const failedFact = await exec('(window.win7Agent.a9.snapshot()).then(r => { const facts = r.snapshot.conversation || []; return facts[facts.length - 1]; })');
    record('A9F1-OLDER-PROVIDER-FAILURE', failedFact.outcome === 'failed' && failedFact.verification === 'not_applicable' &&
      failedDisplayed === 'failed · not_applicable', JSON.stringify({ failedFact, failedDisplayed }));
    // R3：真实失败必须如实呈现，不得被标记为成功。
    record('A9-15-FAILURE-NOT-LABELLED-SUCCESS', failedFact.outcome === 'failed' && !String(failedDisplayed).includes('completed'),
      JSON.stringify({ outcome: failedFact.outcome, verification: failedFact.verification, displayed: failedDisplayed }));
  }

  // A9 Viewer：自动识别对单 GBK 字符保持 ambiguous，用户显式选择后
  // 通过 v5 A9 IPC 正确显示中文，不再走 legacy UTF-8 读取。
  const gbkButtonReady = await waitFor(() => exec(`(() => {
    const button = Array.from(document.querySelectorAll('#workspace-tree button')).find((item) => item.title === '短GBK.txt');
    return button ? true : null;
  })()`), 15_000, 'GBK viewer fixture');
  if (gbkButtonReady) {
    await exec(`(() => {
      const button = Array.from(document.querySelectorAll('#workspace-tree button')).find((item) => item.title === '短GBK.txt');
      button.click();
      return true;
    })()`);
    await waitFor(() => exec('document.getElementById("error-banner").textContent.includes("无法自动识别为文本")'), 15_000, 'ambiguous viewer warning');
    await exec(`(() => {
      const encoding = document.getElementById('viewer-encoding');
      encoding.value = 'gbk';
      encoding.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    const viewer = await waitFor(() => exec(`(() => {
      const text = document.getElementById('code-viewer').textContent;
      return text.includes('中') ? { text, encoding: document.getElementById('viewer-encoding').value } : null;
    })()`), 15_000, 'explicit GBK viewer');
    record('A9F1-VIEWER-EXPLICIT-GBK', viewer.encoding === 'gbk' && viewer.text.includes('中'), JSON.stringify(viewer));

    await exec(`(() => {
      const button = Array.from(document.querySelectorAll('#workspace-tree button')).find((item) => item.title === 'calc.ts');
      button.click();
      return true;
    })()`);
    const resetViewer = await waitFor(() => exec(`(() => {
      const text = document.getElementById('code-viewer').textContent;
      const encoding = document.getElementById('viewer-encoding').value;
      return text.includes('export function add') ? { text, encoding } : null;
    })()`), 15_000, 'per-file automatic encoding reset');
    record('A9F1-VIEWER-ENCODING-PER-FILE', resetViewer.encoding === '' && resetViewer.text.includes('export function add'), JSON.stringify(resetViewer));
  }

  // 真实工具旅程：read → edit → shell（真实测试命令）→ verified。
  await exec('(() => { const prompt = document.getElementById("task-prompt"); prompt.value = "fix the bug and verify"; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()');
  const outcome = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t.includes('completed') && t.includes('verified') ? t : null)), 90_000, 'turn outcome');
  const fileFixed = fs.readFileSync(path.join(env.workspaceRoot, 'calc.ts'), 'utf8').includes('a + b');
  record('A9F1-TOOL-JOURNEY', Boolean(outcome) && fileFixed, `outcome=${outcome}`);
  const shellUi = await exec(`(() => ({
    timeline: document.getElementById('a9-timeline').textContent,
    output: document.getElementById('a9-shell-output').textContent,
  }))()`);
  record('A9F1-SHELL-EVENT-DTO-UI', shellUi.timeline.includes('运行命令') && shellUi.timeline.includes('exit=0') && shellUi.output.includes('smoke-verified'), JSON.stringify(shellUi));
  const progress = await exec(`(async () => {
    const snapshot = (await window.win7Agent.a9.snapshot()).snapshot;
    const queried = await window.win7Agent.a9.queryEvents({ conversationId: snapshot.activeConversationId, limit: 1000 });
    const events = queried.events || [];
    const kind = (event) => event.eventType || event.type;
    const data = (event) => event.payload?.data || event.payload || event.data || {};
    const ids = events.map((event) => event.eventId);
    const toolStarts = events.filter((event) => kind(event) === 'tool_start');
    const toolEnds = events.filter((event) => kind(event) === 'tool_end');
    const pairs = toolStarts.map((start) => toolEnds.find((end) => data(end).callId === data(start).callId && data(end).step === data(start).step));
    const stream = document.getElementById('a9-task-stream');
    const finalText = 'bug fixed and verified.';
    return {
      conversationId: snapshot.activeConversationId,
      eventCount: events.length,
      modelNotes: events.filter((event) => kind(event) === 'model_note').length,
      turnCompleted: events.filter((event) => kind(event) === 'turn_completed').length,
      stableOrder: ids.every((id, index) => Number.isSafeInteger(id) && (index === 0 || id > ids[index - 1])),
      uniqueIds: new Set(ids).size === ids.length,
      pairedTools: pairs.length === toolStarts.length && pairs.every(Boolean),
      callIds: toolStarts.map((event) => data(event).callId),
      steps: toolStarts.map((event) => data(event).step),
      noteNodes: stream.querySelectorAll('.note-line').length,
      activityGroups: stream.querySelectorAll('.activity-group').length,
      finalOccurrences: stream.textContent.split(finalText).length - 1,
    };
  })()`);
  record('A9-15-PROGRESS-EVENT-ORDER', (!requireModelNotes || progress.modelNotes >= 1) && progress.turnCompleted === 1 &&
    progress.stableOrder && progress.uniqueIds && progress.pairedTools &&
    progress.callIds.every(Boolean) && progress.steps.every((step) => Number.isSafeInteger(step)), JSON.stringify(progress));
  record('A9-15-PROGRESS-RENDERED-ONCE', (!requireModelNotes || progress.noteNodes >= 1) && progress.activityGroups >= 1 && progress.finalOccurrences === 1, JSON.stringify(progress));
  const crossConversation = await exec(`(window.win7Agent.a9.queryEvents({ conversationId: 'cross-' + ${JSON.stringify(progress.conversationId)}, limit: 1 })).then(r => ({ ok: r.ok, code: r.error && r.error.code }))`);
  record('A9-15-EVENTS-CROSS-CONVERSATION-REJECTED', crossConversation.ok === false && crossConversation.code === 'A9_EVENTS_CONVERSATION_MISMATCH', JSON.stringify(crossConversation));
  await captureVisual(win, 'completed');

  // Diff 可见（真实 checkpoint 按钮）。
  await waitFor(() => exec('document.getElementById("a9-checkpoint-list").querySelector("button") !== null'), 15_000, 'checkpoint buttons');
  await exec('document.getElementById("a9-checkpoint-list").querySelector("button").click(); true');
  const diff = await waitFor(() => exec('document.getElementById("a9-diff").textContent').then((t) => (t.includes('calc.ts') ? t : null)), 15_000, 'diff text');
  record('A9F1-DIFF', Boolean(diff), 'diff contains calc.ts');

  // 审批卡：模型触发永久删除（或 git push），等待审批卡出现并校验真实目标与绑定。
  // F3：失败状态分项覆盖。非零退出与工具错误各自形成真实 tool_end 失败观察，
  // 不得用 Provider 503 代表全部失败类型。放在 Viewer/Diff 检查之后，避免扰动既有观察。
  if (projectionEnabled) {
    const failureScenarios = [];
    for (const scenario of [{ prompt: 'run failing shell command', kind: 'NON_ZERO_EXIT' },
      { prompt: 'trigger tool error', kind: 'TOOL_ERROR' }]) {
      const beforeFacts = await exec('(window.win7Agent.a9.snapshot()).then(r => ({ facts: (r.snapshot.conversation || []).length, maxEventId: r.snapshot.lastEventId || null }))');
      const beforeMaxEventId = await exec(`(async () => {
        const api = window.win7Agent.a9;
        const snapshot = (await api.snapshot()).snapshot;
        const response = await api.queryEvents({ conversationId: snapshot.activeConversationId, limit: 1 });
        const events = (response && response.ok === true && response.events) ? response.events : [];
        return events.length ? events[events.length - 1].eventId : 0;
      })()`);
      await exec(`(() => { const prompt = document.getElementById("task-prompt"); prompt.value = ${JSON.stringify(scenario.prompt)}; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()`);
      // 必须等待本场景自己的终态事实，不能把上一轮结果当作本次结果。
      await waitFor(() => exec(`(async () => {
        const snapshot = (await window.win7Agent.a9.snapshot()).snapshot;
        const facts = snapshot.conversation || [];
        if (facts.length <= ${beforeFacts.facts}) return null;
        if (snapshot.agentStatus === 'running') return null;
        return facts[facts.length - 1];
      })()`), 120_000, `failure scenario terminal ${scenario.kind}`);
      // 只在本场景新产生的事件范围内收集失败证据（不把上一个场景的失败算到本场景）。
      const facts = await exec(`(async () => {
        const api = window.win7Agent.a9;
        const snapshot = (await api.snapshot()).snapshot;
        const collected = [];
        const seen = new Set();
        let beforeEventId = null;
        for (let guard = 0; guard < 60; guard += 1) {
          const options = { conversationId: snapshot.activeConversationId, limit: 1000 };
          if (beforeEventId !== null) options.beforeEventId = beforeEventId;
          const response = await api.queryEvents(options);
          const batch = (response && response.ok === true && response.events) ? response.events : [];
          for (const event of batch) if (!seen.has(event.eventId)) { seen.add(event.eventId); collected.push(event); }
          if (!(response && response.hasMore === true) || !batch.length) break;
          beforeEventId = batch[0].eventId;
        }
        collected.sort((a, b) => a.eventId - b.eventId);
        const scoped = collected.filter((event) => event.eventId > ${beforeMaxEventId});
        const data = (event) => event.payload?.data || event.payload || event.data || {};
        const kind = (event) => event.eventType || event.type;
        let reason = '';
        const failed = scoped.filter((event) => kind(event) === 'tool_end').find((event) => {
          const d = data(event); const shell = d.shell || {};
          const result = String(d.result || '');
          if (typeof shell.exitCode === 'number' && shell.exitCode !== 0) { reason = 'NON_ZERO_EXIT'; return true; }
          if (d.error) { reason = 'TOOL_ERROR_FIELD'; return true; }
          if (['failed', 'error', 'timeout', 'timed_out'].includes(shell.status)) { reason = 'TOOL_STATUS_FAILED'; return true; }
          if (/^Tool execution error:|^Error:/i.test(result) || /"status"\\s*:\\s*"(?:error|failed|not_found)"/i.test(result)
              || /ENOENT|not found|不存在|无法读取/i.test(result)) { reason = 'TOOL_RESULT_FAILURE'; return true; }
          return false;
        }) || null;
        const d = failed ? data(failed) : null;
        const terminals = scoped.filter((event) => String(kind(event)).startsWith('turn_'));
        const terminal = terminals.length ? terminals[terminals.length - 1] : null;
        return {
          displayed: document.getElementById('a9-turn-outcome').textContent,
          scopedCount: scoped.length,
          turnOutcome: terminal ? (data(terminal).outcome === undefined ? null : data(terminal).outcome) : null,
          turnVerification: terminal ? (data(terminal).verification === undefined ? null : data(terminal).verification) : null,
          notVerifiedSuccess: !(terminal && data(terminal).outcome === 'completed' && data(terminal).verification === 'verified'),
          failedToolEnd: failed ? {
            eventId: failed.eventId, turnId: failed.turnId || null, reason,
            shellExit: d.shell && typeof d.shell.exitCode === 'number' ? d.shell.exitCode : null,
            hasError: Boolean(d.error), resultHead: String(d.result || '').slice(0, 120),
          } : null,
        };
      })()`);
      failureScenarios.push({ kind: scenario.kind, beforeMaxEventId, ...facts });
    }
    const exitScenario = failureScenarios.find((item) => item.kind === 'NON_ZERO_EXIT') || {};
    const errorScenario = failureScenarios.find((item) => item.kind === 'TOOL_ERROR') || {};
    record('A9-15-FAILURE-TYPES-SEPARATED',
      failureScenarios.length === 2
      && failureScenarios.every((item) => item.failedToolEnd !== null && item.notVerifiedSuccess === true)
      && exitScenario.failedToolEnd && exitScenario.failedToolEnd.shellExit !== null && exitScenario.failedToolEnd.shellExit !== 0
      && errorScenario.failedToolEnd
      && (errorScenario.failedToolEnd.hasError === true || errorScenario.failedToolEnd.reason === 'TOOL_RESULT_FAILURE'
        || errorScenario.failedToolEnd.reason === 'TOOL_STATUS_FAILED' || errorScenario.failedToolEnd.reason === 'TOOL_ERROR_FIELD'),
      JSON.stringify(failureScenarios));
    report.failureScenarios = failureScenarios;
  }

  // F3：拒绝零目标副作用的证据——审批前采集目标存在性、字节哈希与大小。
  const denyTargetPath = path.join(env.workspaceRoot, 'scratch.tmp');
  const fileDigest = (target) => (fs.existsSync(target)
    ? crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') : null);
  const denyTargetBefore = {
    exists: fs.existsSync(denyTargetPath), sha256: fileDigest(denyTargetPath),
    size: fs.existsSync(denyTargetPath) ? fs.statSync(denyTargetPath).size : null,
  };
  report.denyTargetBefore = denyTargetBefore;

  await exec(`(() => {
    const prompt = document.getElementById('task-prompt');
    prompt.value = 'cleanup permanently and push';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('run-task').click();
    return true;
  })()`);
  const approval = await waitFor(() => exec(`(() => {
    const card = document.getElementById('a9-approval-card');
    if (!card || card.hidden) return null;
    return {
      tool: document.getElementById('a9-approval-tool').textContent,
      summary: document.getElementById('a9-approval-summary').textContent,
      git: document.getElementById('a9-approval-git').textContent,
      approvalId: document.getElementById('a9-approval-id').textContent,
      digest: card.dataset.bindingDigest,
      conversationId: card.dataset.conversationId,
      taskId: card.dataset.taskId,
      turnId: card.dataset.turnId,
    };
  })()`), 90_000, 'approval card');
  const approvalValid = approval && (approval.summary.includes('permanent') || approval.summary.includes('git')) &&
    approval.approvalId.length > 0 && approval.digest && approval.digest.length === 64;
  record('A9F1-APPROVAL-CARD-TRUE-TARGET', approvalValid === true, JSON.stringify(approval));
  await captureVisual(win, 'approval');
  report.oldApproval = approval ? {
    approvalId: approval.approvalId.replace(/^approval:\s*/, ''),
    bindingDigest: approval.digest,
    conversationId: approval.conversationId,
    taskId: approval.taskId,
    turnId: approval.turnId,
  } : null;

  // Renderer 只证明拒绝完成；目标文件事实同时由本进程与宿主进程在 Electron 退出后直接检查。
  await exec('document.getElementById("a9-approval-deny").click(); true');
  await waitFor(() => exec('document.getElementById("a9-approval-card").hidden === true'), 15_000, 'approval card closed');
  const afterDeny = await exec('(() => { const s = document.getElementById("a9-turn-outcome").textContent; return s; })()');
  record('A9F1-APPROVAL-DENY-OUTCOME', afterDeny.includes('blocked') || afterDeny.includes('completed') || afterDeny.includes('needs_approval'), `outcome=${afterDeny}`);
  const approvalHistory = await exec(`(async () => {
    const snapshot = (await window.win7Agent.a9.snapshot()).snapshot;
    const queried = await window.win7Agent.a9.queryEvents({ conversationId: snapshot.activeConversationId, limit: 1000 });
    const events = queried.events || [];
    const kind = (event) => event.eventType || event.type;
    const data = (event) => event.payload?.data || event.payload || event.data || {};
    const resolved = events.filter((event) => kind(event) === 'approval_resolved');
    const required = events.filter((event) => kind(event) === 'approval_required');
    const deniedIds = resolved.filter((event) => data(event).decision === 'denied').map((event) => event.eventId);
    const requiredIds = required.map((event) => event.eventId);
    const laterActivities = events
      .filter((event) => ['tool_start', 'model_note', 'model_chunk'].includes(kind(event))
        && requiredIds.length > 0 && event.eventId > requiredIds[0])
      .map((event) => ({ eventId: event.eventId, type: kind(event), turnId: event.turnId || null }));
    return {
      count: resolved.length,
      decisions: resolved.map((event) => data(event).decision),
      resolvedIds: resolved.map((event) => event.eventId),
      requiredIds,
      deniedIds,
      laterActivities,
    };
  })()`);
  record('A9-15-APPROVAL-RESOLVED-PERSISTED', approvalHistory.count >= 1 && approvalHistory.decisions.includes('denied'), JSON.stringify(approvalHistory));
  // R3（拒绝路径）：决定必须先于被消耗后的模型/工具活动，且拒绝只被消费一次。
  const approvalDecisionId = approvalHistory.deniedIds.length ? Math.max(...approvalHistory.deniedIds) : 0;
  record('A9-15-APPROVAL-DENY-CONSUMED-ONCE',
    approvalHistory.requiredIds.length >= 1 && approvalHistory.deniedIds.length === 1 &&
    approvalHistory.requiredIds.every((id) => id < approvalDecisionId) &&
    approvalHistory.laterActivities.length >= 1 &&
    approvalHistory.laterActivities.every((item) => item.eventId > approvalDecisionId),
  JSON.stringify({ requiredIds: approvalHistory.requiredIds, approvalDecisionId, laterActivities: approvalHistory.laterActivities }));
  // R3（拒绝路径）：拒绝必须零目标副作用——目标存在性、字节哈希与大小均不变。
  const denyTargetAfter = {
    exists: fs.existsSync(denyTargetPath), sha256: fileDigest(denyTargetPath),
    size: fs.existsSync(denyTargetPath) ? fs.statSync(denyTargetPath).size : null,
  };
  report.denyTargetAfter = denyTargetAfter;
  record('A9-15-DENY-ZERO-TARGET-SIDE-EFFECT',
    denyTargetBefore.exists === true && denyTargetAfter.exists === true
    && denyTargetAfter.sha256 === denyTargetBefore.sha256 && denyTargetAfter.size === denyTargetBefore.size,
  JSON.stringify({ before: denyTargetBefore, after: denyTargetAfter }));

  // F3（批准路径）：必须真实出现恢复后的 tool_start，且 approval_resolved 更早、绑定同一轮次与工具目标。
  if (projectionEnabled) {
    await exec(`(() => { const prompt = document.getElementById("task-prompt"); prompt.value = ${JSON.stringify(PROJECTION_APPROVE_PROMPT)}; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()`);
    const approveCard = await waitFor(() => exec(`(() => {
      const card = document.getElementById('a9-approval-card');
      if (!card || card.hidden) return null;
      return {
        tool: document.getElementById('a9-approval-tool').textContent,
        summary: document.getElementById('a9-approval-summary').textContent,
        approvalId: document.getElementById('a9-approval-id').textContent,
        conversationId: card.dataset.conversationId, taskId: card.dataset.taskId, turnId: card.dataset.turnId,
      };
    })()`), 90_000, 'approve approval card');
    report.approvedApproval = approveCard;
    await captureVisual(win, 'approval-approved');
    await exec('document.getElementById("a9-approval-approve").click(); true');
    await waitFor(() => exec('document.getElementById("a9-approval-card").hidden === true'), 20_000, 'approve card closed');
    const approved = await waitFor(() => exec(`(async () => {
      const snapshot = (await window.win7Agent.a9.snapshot()).snapshot;
      const queried = await window.win7Agent.a9.queryEvents({ conversationId: snapshot.activeConversationId, limit: 1000 });
      const events = queried.events || [];
      const kind = (event) => event.eventType || event.type;
      const data = (event) => event.payload?.data || event.payload || event.data || {};
      const resolved = events.filter((event) => kind(event) === 'approval_resolved' && data(event).decision === 'approved');
      if (!resolved.length) return null;
      const decision = resolved[resolved.length - 1];
      const decisionId = decision.eventId;
      const decisionTurnId = decision.turnId || null;
      const required = events.filter((event) => kind(event) === 'approval_required');
      const resumedTools = events.filter((event) => kind(event) === 'tool_start' && event.eventId > decisionId
        && (event.turnId || null) === decisionTurnId);
      const boundTool = resumedTools[0] || null;
      return {
        decisionId, decisionTurnId, requiredId: required.length ? required[required.length - 1].eventId : 0,
        resolvedToolName: data(decision).toolName || null,
        resumedTool: boundTool ? { eventId: boundTool.eventId, turnId: boundTool.turnId || null,
          toolName: data(boundTool).toolName || null, args: data(boundTool).args || {} } : null,
        resumedToolCount: resumedTools.length,
        decisionBeforeResumed: boundTool ? decisionId < boundTool.eventId : false,
      };
    })()`), 90_000, 'approved resumed tool activity');
    record('A9-15-APPROVAL-ORDER-BEFORE-RESUME',
      Boolean(approved) && approved.requiredId > 0 && approved.requiredId < approved.decisionId
      && Boolean(approved.resumedTool) && approved.decisionBeforeResumed === true
      && approved.resumedToolCount >= 1
      && approved.resumedTool.toolName === approved.resolvedToolName,
    JSON.stringify(approved));
    report.approvedResume = approved;
  }

  // 首进程退出前再形成真实 mutation + verification 成功轮次，使重启链路的持久化顺序为
  // 旧 failed/not_applicable → 新 completed/verified，而不是审批拒绝作为最新事实。
  // legacy 协议跳过该段，历史 profile 的 fixture 不为该提示词提供服务。
  if (projectionEnabled) {
    // F4：经真实产品链路生成足量过程事件，使旧 failed 终态落在首次查询范围之外。判定以
    // 首批查询 hasMore=true 为准，不硬编码总事件数；每轮必须绑定新的 turn ID 并等待该轮真实终态。
    const bulkTurnsMax = Number(process.env.A9_SMOKE_BULK_TURNS || 40);
    const bulkFacts = [];
    let firstPageHasMore = false;
    for (let index = 0; index < bulkTurnsMax && !firstPageHasMore; index += 1) {
      const before = await exec('(window.win7Agent.a9.snapshot()).then(r => ({ facts: (r.snapshot.conversation || []).length, turnId: r.snapshot.activeTurnId || null }))');
      await exec(`(() => { const prompt = document.getElementById("task-prompt"); prompt.value = ${JSON.stringify(PROJECTION_BULK_PROMPT)} + ' ' + ${index}; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()`);
      const terminal = await waitFor(() => exec(`(async () => {
        const snapshot = (await window.win7Agent.a9.snapshot()).snapshot;
        if (snapshot.agentStatus === 'running') return null;
        const facts = snapshot.conversation || [];
        if (facts.length <= ${before.facts}) return null;
        const last = facts[facts.length - 1];
        if (!last) return null;
        if (last.turnId && last.turnId === ${JSON.stringify(before.turnId)}) return null;
        if (!['completed', 'failed', 'blocked', 'cancelled', 'interrupted'].includes(String(last.outcome || ''))) return null;
        return { turnId: last.turnId || null, outcome: last.outcome || null };
      })()`), 180_000, `bulk turn ${index} terminal state`);
      // 以**产品自身的首屏上限**判定 hasMore（而不是探测用的大 limit），
      // 使事件量刚好越过首屏边界，旧失败可由少量真实分页到达。
      const counted = await exec(`(async () => {
        const snapshot = (await window.win7Agent.a9.snapshot()).snapshot;
        const queried = await window.win7Agent.a9.queryEvents({ conversationId: snapshot.activeConversationId, limit: ${PRODUCT_FIRST_QUERY_LIMIT} });
        const events = queried.ok === true && queried.events ? queried.events : [];
        return { firstPageCount: events.length, hasMore: queried.hasMore === true, firstEventId: events.length ? events[0].eventId : null };
      })()`);
      bulkFacts.push({ turn: index, beforeFacts: before.facts, beforeTurnId: before.turnId, terminal, ...counted });
      // 以产品首屏上限判定：需要 hasMore=true 且旧失败已在首屏之外；同时保留足够的剩余页，
      // 使查询失败重试场景与分页探针不会互相抢用"加载更早记录"控件（非硬编码总事件数）。
      firstPageHasMore = counted.hasMore === true && Number.isSafeInteger(counted.firstEventId)
        && counted.firstEventId > 3 * PRODUCT_FIRST_QUERY_LIMIT;
    }
    report.bulkHistory = bulkFacts;
    record('A9-15-BULK-HISTORY-GENERATED',
      bulkFacts.length > 0 && bulkFacts.every((item) => Boolean(item.terminal))
      && bulkFacts.every((item) => item.terminal.turnId && item.terminal.turnId !== item.beforeTurnId)
      && firstPageHasMore === true,
      JSON.stringify({ turns: bulkFacts.length, last: bulkFacts[bulkFacts.length - 1] || null, firstPageHasMore }));
    await exec(`(() => { const prompt = document.getElementById("task-prompt"); prompt.value = ${JSON.stringify(PROJECTION_LATEST_SUCCESS_PROMPT)}; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()`);
    const latestDisplayed = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t === 'completed · verified' ? t : null)), 90_000, 'latest verified outcome');
    const latestTurn = await exec('(window.win7Agent.a9.snapshot()).then(r => { const facts = r.snapshot.conversation || []; return facts[facts.length - 1]; })');
    const projectionSeed = await exec(`(async () => {
      const snapshot = (await window.win7Agent.a9.snapshot()).snapshot;
      const api = window.win7Agent.a9;
      // 真实分页完整采集：批量轮次后总事件已超过单次上限，只取一页会丢掉最早的旧失败。
      const collected = [];
      const seen = new Set();
      let beforeEventId = null;
      for (let guard = 0; guard < 60; guard += 1) {
        const options = { conversationId: snapshot.activeConversationId, limit: 1000 };
        if (beforeEventId !== null) options.beforeEventId = beforeEventId;
        const response = await api.queryEvents(options);
        const batch = (response && response.ok === true && response.events) ? response.events : [];
        for (const event of batch) if (!seen.has(event.eventId)) { seen.add(event.eventId); collected.push(event); }
        if (!(response && response.hasMore === true) || !batch.length) break;
        beforeEventId = batch[0].eventId;
      }
      collected.sort((a, b) => a.eventId - b.eventId);
      const events = collected;
      const kind = (event) => event.eventType || event.type;
      const data = (event) => event.payload?.data || event.payload || event.data || {};
      const failures = events.filter((event) => kind(event) === 'turn_failed');
      const completions = events.filter((event) => kind(event) === 'turn_completed' && data(event).outcome === 'completed' && data(event).verification === 'verified');
      const olderFailure = failures[0];
      const newerSuccess = completions[completions.length - 1];
      return {
        conversationId: snapshot.activeConversationId,
        oldFailureTurnId: olderFailure && olderFailure.turnId,
        oldFailureEventId: olderFailure && olderFailure.eventId,
        latestSuccessTurnId: newerSuccess && newerSuccess.turnId,
        latestSuccessEventId: newerSuccess && newerSuccess.eventId,
        displayed: document.getElementById('a9-turn-outcome').textContent,
      };
    })()`);
    report.projectionSeed = projectionSeed;
    record('A9F1-OLDER-FAILURE-NEWER-SUCCESS-PERSISTED', latestTurn.outcome === 'completed' &&
      latestTurn.verification === 'verified' && latestDisplayed === 'completed · verified' &&
      Number.isSafeInteger(projectionSeed.oldFailureEventId) && Number.isSafeInteger(projectionSeed.latestSuccessEventId) &&
      projectionSeed.oldFailureEventId < projectionSeed.latestSuccessEventId &&
      projectionSeed.latestSuccessTurnId === latestTurn.turnId, JSON.stringify({ latestTurn, projectionSeed }));
  } else {
    record('A9F1-LEGACY-PROTOCOL-SKIPS-PROJECTION-SEED',
      !process.env.A9_SMOKE_PROJECTION_SEED || process.env.A9_SMOKE_PROJECTION_SEED === '{}',
      `protocol=${driverProtocol}`);
  }

  // checkpoint 事实落库（真实 SQLite；first 进程退出前保留）。
  const snapshot = await exec('(window.win7Agent.a9.snapshot()).then(r => ({ mode: r.snapshot.mode, provider: r.snapshot.provider.configured, model: r.snapshot.provider.model, checkpoints: r.snapshot.checkpoints.length }))');
  record('A9F1-SNAPSHOT-FACTS', snapshot.mode === 'full_access' && snapshot.provider === true && snapshot.model === 'smoke-manual-model' && snapshot.checkpoints >= 1, JSON.stringify(snapshot));
}

async function captureInspectorDom(exec) {
  return exec(`(async () => {
    const current = (await window.win7Agent.a9.snapshot()).snapshot;
    const facts = current.conversation || [];
    const latest = facts.length ? facts[facts.length - 1] : null;
    const timeline = document.getElementById('a9-timeline');
    const rows = Array.from(timeline.querySelectorAll('li')).map((item) => ({
      eventId: Number(item.dataset.eventId),
      turnId: item.dataset.turnId || null,
      eventType: item.dataset.eventType || null,
      text: item.textContent,
    }));
    return {
      conversationId: current.activeConversationId,
      latestTurnId: latest ? latest.turnId : null,
      latestOutcome: latest ? latest.outcome : null,
      rows,
      displayed: document.getElementById('a9-turn-outcome').textContent,
      displayRule: timeline.dataset.displayRule || '',
      displayRows: timeline.dataset.displayRows || '',
    };
  })()`);
}

/**
 * ADR-0121 投影验收（仅在 A9_SMOKE_DRIVER_PROTOCOL=projection 时执行）。
 * 1) 按 Inspector 有界显示范围逐行核对身份、顺序、去重、内容与时间，期望值由共享契约从查询事实推导；
 * 2) 对观察值副本做缺行、乱序、重复、跨会话残留与内容/时间/身份类变异，全部必须被同一函数拒绝；
 * 3) 切换会话不得残留上一会话内容，切回后逐行复原；
 * 4) 旧失败必须经真实 beforeEventId 分页加载，且全局结果仍绑定最新持久化轮次；
 * 5) 导出机器可读投影证据（查询导出、DOM 导出与候选外可粘贴的投影证据包）。
 */
async function runProjectionAcceptance(win, exec, env, restoredEvents, expectedProjection) {
  const queryEvents = restoredEvents.events || [];
  const queryEventIds = restoredEvents.eventIds || [];
  const expectedRowCount = Math.min(INSPECTOR_DISPLAY_ROWS, queryEvents.length);
  const lastQueryEventId = queryEventIds.length ? queryEventIds[queryEventIds.length - 1] : 0;
  const observed = restoredEvents.restartObserved || null;
  // W28-H03：restart 阶段的独立时间基准（受测 Renderer 内建格式化固定 UTC 探针）。
  const restartBaseline = restoredEvents.restartBaseline !== undefined
    ? restoredEvents.restartBaseline
    : null;
  const restartBaselineDerived = restartBaseline ? deriveTimeBaseline(restartBaseline) : null;
  record('A9-15-TIME-BASELINE-DERIVED', restartBaselineDerived !== null, JSON.stringify({
    baseline: restartBaseline, derived: restartBaselineDerived,
  }));

  const exportedRows = exportRows(observed ? observed.rows : []);
  const rowMatch = Boolean(observed) && rowsMatchQuery(exportedRows, queryEvents, restartBaseline);
  const labelMismatch = exportedRows.find((row, index) => {
    const event = queryEvents.slice(-INSPECTOR_DISPLAY_ROWS)[index];
    return !event || rowLabelOf(row.text) !== expectedRowLabel(event);
  });
  record('A9-15-INSPECTOR-PERSISTED-EVENTS', rowMatch
    && Boolean(observed)
    && observed.displayRule === INSPECTOR_DISPLAY_RULE
    && observed.displayRows === String(expectedRowCount)
    && queryEvents.some((event) => event.turn_id === null)
    && queryEvents.some((event) => event.type === 'tool_start')
    && queryEvents.some((event) => event.type === 'tool_end'),
  JSON.stringify({
    displayRule: observed ? observed.displayRule : null, displayRows: observed ? observed.displayRows : null,
    expectedRowCount, domRows: observed ? observed.rows.length : 0, queryEvents: queryEvents.length,
    sessionEvents: queryEvents.filter((event) => event.turn_id === null).length,
    timestampsPresent: exportedRows.filter((row) => hasTimestampPrefix(row.text)).length,
  }));

  record('A9-15-INSPECTOR-ROW-CONTENT', rowMatch === true && !labelMismatch && Boolean(observed), JSON.stringify({
    checked: exportedRows.length, firstMismatch: labelMismatch || null,
    sampleLabels: exportedRows.slice(0, 3).map((row) => rowLabelOf(row.text)),
  }));

  const negative = observed ? negativeSensitivity(observed.rows, queryEvents, restartBaseline) : { baseline: false, rejected: {} };
  const requiredMutations = ['missing', 'reordered', 'duplicated', 'residue', 'foreignContent',
    'swappedText', 'wrongDetail', 'otherTurnLabel', 'wrongTime', 'uniformShiftPlus1s',
    'uniformShiftPlus1h', 'singleRowPlus1s', 'missingTime', 'invalidTime', 'missingEventType'];
  record('A9-15-INSPECTOR-ASSERTION-NEGATIVE-CHECKS', negative.baseline === true
    && requiredMutations.every((name) => negative.rejected[name] === true),
  JSON.stringify(negative));

  const sessionSwitch = await exec(`(async () => {
    const api = window.win7Agent.a9;
    const readRows = () => Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => ({
      eventId: Number(item.dataset.eventId), turnId: item.dataset.turnId || null,
      eventType: item.dataset.eventType || null, text: item.textContent,
    }));
    // W28-H03：会话切换各阶段在受测 Renderer 内采集独立时间基准（固定 UTC 探针）。
    const readBaseline = () => ({
      probe_version: ${JSON.stringify(TIME_BASELINE_PROBE_VERSION)},
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      probes: ${JSON.stringify(TIME_BASELINE_PROBE_UTC_MS)}.map((utcMs) => ({ utc_ms: utcMs, rendered: new Date(utcMs).toLocaleTimeString() })),
    });
    const activeId = async () => { const snap = await api.snapshot(); return snap.ok ? snap.snapshot.activeConversationId : null; };
    const clickOtherRow = () => {
      const rows = Array.from(document.querySelectorAll('#conversation-list button'));
      const target = rows.find((button) => !button.disabled && button.getAttribute('aria-current') !== 'true');
      if (!target) return false;
      target.click();
      return true;
    };
    const originalId = ${JSON.stringify(restoredEvents.conversationId)};
    const created = await api.createConversation();
    if (!created.ok) return { ok: false, code: created.error && created.error.code };
    await window.win7AgentA9Workbench.refreshSnapshot();
    let switches = 0;
    if ((await activeId()) === originalId) {
      if (!clickOtherRow()) return { ok: false, code: 'A9_W27_NO_OTHER_CONVERSATION_ROW' };
      switches += 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    const otherConversationId = await activeId();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    // W28-H05：切换后的会话必须是"它自己的非空会话"。空行集只能作为边界样本，
    // 不能单独证明隔离成立（sessionResidueViolation 对空行集返回违规）。
    // 必要时在该会话内发起一次真实只读轮次（正式 UI + 恢复的 fixture Provider），
    // 等待其事件渲染后再读取该会话自己的行身份集合。
    let otherRows = readRows();
    if (otherRows.length === 0) {
      const prompt = document.getElementById('task-prompt');
      prompt.value = 'verify again';
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('run-task').click();
      for (let attempt = 0; attempt < 600; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (readRows().length > 0) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      otherRows = readRows();
    }
    const otherDisplayed = document.getElementById('a9-turn-outcome').textContent;
    const otherSnap = (await api.snapshot()).snapshot;
    const otherFacts = otherSnap && otherSnap.conversation ? otherSnap.conversation : [];
    const otherLatest = otherFacts.length ? otherFacts[otherFacts.length - 1] : null;
    const otherLatestTurnId = otherLatest ? otherLatest.turnId : null;
    const otherTimeBaseline = readBaseline();
    if (!clickOtherRow()) return { ok: false, code: 'A9_W27_NO_RETURN_CONVERSATION_ROW' };
    switches += 1;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const rows = readRows();
      if ((await activeId()) === originalId && rows.length === ${expectedRowCount}
          && rows.length > 0 && rows[rows.length - 1].eventId === ${lastQueryEventId}) break;
    }
    const resumeRows = readRows();
    const resumeSnap = (await api.snapshot()).snapshot;
    const resumeFacts = resumeSnap && resumeSnap.conversation ? resumeSnap.conversation : [];
    const resumeLatest = resumeFacts.length ? resumeFacts[resumeFacts.length - 1] : null;
    const resumeLatestTurnId = resumeLatest ? resumeLatest.turnId : null;
    return {
      ok: true, originalId, otherConversationId, otherRows, otherDisplayed, resumeRows, switches,
      otherLatestTurnId, resumeLatestTurnId,
      resumeDisplayed: document.getElementById('a9-turn-outcome').textContent,
      otherTimeBaseline, resumeTimeBaseline: readBaseline(),
    };
  })()`);
  const rowIds = (rows) => (Array.isArray(rows) ? rows.map((row) => row.eventId) : []);
  const resumeMatch = Array.isArray(sessionSwitch.resumeRows)
    && sessionSwitch.resumeRows.length === (observed ? observed.rows.length : 0)
    && canonical(rowIds(sessionSwitch.resumeRows)) === canonical(rowIds(observed ? observed.rows : []));
  const otherDifference = sessionSwitch.otherConversationId && sessionSwitch.otherConversationId !== sessionSwitch.originalId;
  // W28-H05：残留方向修正——其他会话 DOM 必须携带自己的非空身份集合，且与原会话事件 ID
  // 无交集（sessionResidueViolation 语义）。旧实现的"行不属于原会话即违规"会把其他会话
  // 自己的新行误判为残留、却放过原会话残留行；空会话也不再单独证明隔离。
  const otherExportedRows = exportRows(sessionSwitch.otherRows);
  const noResidue = Array.isArray(sessionSwitch.otherRows)
    && !sessionResidueViolation(otherExportedRows, queryEventIds);
  // W28-H05 负向敏感性：对其他会话观察值副本注入原会话行、混合残留行与缺失身份行，
  // 同一判定函数必须全部识别为违规（证明方向正确且非空集通过不是偶然）。
  const residueInjectedOriginal = otherExportedRows.length
    ? [...otherExportedRows.slice(0, 1), exportedRows[0]] : [exportedRows[0]];
  const residueMixed = otherExportedRows.length
    ? [...otherExportedRows, exportedRows[exportedRows.length - 1]] : [exportedRows[0]];
  const residueMissingIdentity = [...otherExportedRows,
    { event_id: null, turn_id: null, event_type: 'session_started', text: '00:00:01 · 外来行' }];
  const residueSensitivity = {
    originalRow: sessionResidueViolation(residueInjectedOriginal, queryEventIds),
    mixedRows: sessionResidueViolation(residueMixed, queryEventIds),
    missingIdentity: sessionResidueViolation(residueMissingIdentity, queryEventIds),
  };
  record('A9-15-INSPECTOR-SESSION-SWITCH-NO-RESIDUE',
    sessionSwitch.ok === true && otherDifference && noResidue && resumeMatch
      && sessionSwitch.resumeDisplayed === (observed ? observed.displayed : null)
      && Object.values(residueSensitivity).every((value) => value === true),
  JSON.stringify({
    ok: sessionSwitch.ok, code: sessionSwitch.code || '', switches: sessionSwitch.switches,
    otherConversationId: sessionSwitch.otherConversationId, otherRows: rowIds(sessionSwitch.otherRows),
    otherRowCount: otherExportedRows.length, resumeRows: rowIds(sessionSwitch.resumeRows),
    otherDifference, noResidue, resumeMatch, residueSensitivity,
    resumeDisplayed: sessionSwitch.resumeDisplayed, displayed: observed ? observed.displayed : null,
  }));

  // 旧事件补载后的观察：真实分页请求已由 F4 probe（A9-15-PAGING-PROBE-FACTS）经产品按钮发起，
  // 此处直接消费分页完成且未切换会话前的即时快照（restoredEvents.olderLoadObserved），
  // 杜绝重新采样掩盖即时失败事实。
  const olderLoad = restoredEvents.olderLoadObserved || null;

  const latestTerminal = latestTerminalEvent(queryEvents);
  const olderFailureEvent = queryEvents.find((event) => event.type === 'turn_failed') || null;
  const newerSuccessEvent = queryEvents.filter((event) => event.type === 'turn_completed'
    && event.outcome === 'completed' && event.verification === 'verified').pop() || null;
  const expectedOutcome = expectedDisplayed(latestTerminal);
  const restartOutcomeOk = expectedOutcome === 'completed · verified' && Boolean(observed) && observed.displayed === expectedOutcome;
  const olderLoadOutcomeOk = Boolean(olderLoad) && olderLoad.displayed === expectedOutcome;
  const olderLoadMode = restoredEvents.paging && restoredEvents.paging.controlConsumed
    ? 'CLICKED_LOAD_MORE' : 'FULL_HISTORY_ALREADY_LOADED';
  const latestTurnId = latestTerminal ? latestTerminal.turn_id : null;
  const restartTerminalOk = Boolean(latestTerminal) && Boolean(newerSuccessEvent)
    && latestTerminal.event_id === newerSuccessEvent.event_id
    && Boolean(observed)
    && terminalRowOutcomeMatches(observed.rows, newerSuccessEvent.event_id, newerSuccessEvent.turn_id);
  // F1：DOM 附件必须保留实际显示结果与最新持久化 turn 身份，且与查询最新终态、snapshot 事实一致。
  const domOutcomeIdentityOk = Boolean(observed) && observed.displayed === expectedOutcome
    && (observed.latestTurnId || null) === (latestTurnId || null);
  record('A9-15-DOM-OUTCOME-TURN-IDENTITY', domOutcomeIdentityOk && restartOutcomeOk, JSON.stringify({
    displayed: observed ? observed.displayed : null, expectedOutcome, domLatestTurnId: observed ? (observed.latestTurnId || null) : null,
    queryLatestTurnId: latestTurnId || null,
  }));
  // F4：旧失败只能经 beforeEventId 分页到达，且分页确实把它并入已加载历史。
  const paging = restoredEvents.paging || {};
  record('A9-15-OLDER-EVENT-PAGINATION', paging.ok === true, JSON.stringify(paging));
  // 旧失败必须由真实分页响应返回（页内身份绑定），而不是"首批已包含"。
  const olderRowPresent = olderFailureEvent && paging.pageHasOlderFailure === true
    && paging.pageOlderFailureId === olderFailureEvent.event_id;
  record('A9-15-OLDER-FAILURE-NEWER-SUCCESS-RESTART',
    Boolean(olderFailureEvent) && Boolean(newerSuccessEvent) && olderFailureEvent.event_id < newerSuccessEvent.event_id
    && olderFailureEvent.turn_id !== newerSuccessEvent.turn_id
    && olderFailureEvent.turn_id === expectedProjection.oldFailureTurnId
    && newerSuccessEvent.turn_id === expectedProjection.latestSuccessTurnId
    && restartOutcomeOk && olderLoadOutcomeOk && olderRowPresent && Boolean(restartTerminalOk)
    && paging.firstPageExcludesOlderFailure === true && paging.pageHasOlderFailure === true,
  JSON.stringify({
    olderFailure: olderFailureEvent, newerSuccess: newerSuccessEvent, latestTerminal,
    displayed: observed ? observed.displayed : null, expectedOutcome, olderRowPresent, restartTerminalOk,
    paging: { ok: paging.ok, firstPageLimit: paging.firstPageLimit, firstPageCount: paging.firstPageCount,
      firstPageHasMore: paging.firstPageHasMore, firstPageOldestId: paging.firstPageOldestId,
      beforeEventId: paging.beforeEventId, pageCount: paging.pageCount, pageHasMore: paging.pageHasMore,
      pageHasOlderFailure: paging.pageHasOlderFailure, firstPageExcludesOlderFailure: paging.firstPageExcludesOlderFailure,
      olderLoadMode, olderLoadChanged: restoredEvents.paging ? restoredEvents.paging.controlConsumed === true : false },
  }));

  const artifacts = [];
  const writeArtifact = (name, payload) => {
    const filePath = writeProjectionExport(name, payload);
    if (!filePath) return null;
    const reference = { path: name, sha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') };
    artifacts.push(reference);
    return reference;
  };
  const queryReference = writeArtifact('projection-query-export.json', {
    schema_version: QUERY_EXPORT_SCHEMA_VERSION, kind: QUERY_EXPORT_KIND,
    conversation_id: restoredEvents.conversationId,
    query: { limit: 1000, before_event_id: null, has_more: false },
    pages: restoredEvents.pages || [],
    events: queryEvents,
  });
  // W28-H03：每个 DOM 导出绑定该阶段在受测 Renderer 内采集的独立时间基准（schema v3 必填）。
  const domExport = (stage, conversationId, rows, displayedOutcome, latestPersistedTurnId, timeBaseline, extra) => ({
    schema_version: DOM_EXPORT_SCHEMA_VERSION, kind: DOM_EXPORT_KIND, stage,
    conversation_id: conversationId,
    display_range: { rule: INSPECTOR_DISPLAY_RULE, max_rows: INSPECTOR_DISPLAY_ROWS, rows_total: (rows || []).length },
    rows: exportRows(rows), displayed_outcome: displayedOutcome,
    latest_persisted_turn_id: latestPersistedTurnId,
    time_baseline: timeBaseline, checked_at: new Date().toISOString(), ...(extra || {}),
  });
  const domReference = writeArtifact('projection-dom-export.json', domExport(
    'restart', restoredEvents.conversationId, observed ? observed.rows : [], observed ? observed.displayed : null, observed ? (observed.latestTurnId || null) : null, restartBaseline));
  const otherReference = writeArtifact('projection-dom-other-conversation.json', domExport(
    'other_conversation', sessionSwitch.otherConversationId || '', sessionSwitch.otherRows,
    sessionSwitch.otherDisplayed || '', sessionSwitch.otherLatestTurnId || null, sessionSwitch.otherTimeBaseline || null));
  const resumeReference = writeArtifact('projection-dom-resume.json', domExport(
    'resume', restoredEvents.conversationId, sessionSwitch.resumeRows, sessionSwitch.resumeDisplayed || '',
    sessionSwitch.resumeLatestTurnId || (observed ? observed.latestTurnId : null) || null, sessionSwitch.resumeTimeBaseline || null));
  const olderLoadReference = writeArtifact('projection-dom-after-older-load.json', domExport(
    'older_load', restoredEvents.conversationId, olderLoad ? olderLoad.rows : [], olderLoad ? olderLoad.displayed : null,
    olderLoad ? (olderLoad.latestTurnId || (observed ? observed.latestTurnId : null) || null) : null, olderLoad ? (olderLoad.timeBaseline || null) : null, { older_load_mode: olderLoadMode }));
  const evidencePackage = {
    schema_version: 1,
    kind: 'A9_W28_PROJECTION_EVIDENCE_PACKAGE',
    conversation_id: restoredEvents.conversationId,
    instructions: '把 projection-*.json 复制到候选外 evidence-root 根目录，并按原样粘贴下列 projection_evidence 块；artifacts 即对应用例 evidence 列表中必须包含的路径与 SHA-256。',
    artifacts,
    results: {
      'W28-03-INSPECTOR-PERSISTED-RESTART': {
        projection_evidence: {
          query_export: queryReference, dom_export: domReference,
          session_switch: { other_conversation_export: otherReference, resume_export: resumeReference },
        },
      },
      'W28-09-LATEST-OUTCOME-PROJECTION': {
        projection_evidence: {
          query_export: queryReference, dom_export: domReference,
          dom_export_after_older_load: olderLoadReference, older_load_mode: olderLoadMode,
          older_failure: olderFailureEvent
            ? { event_id: olderFailureEvent.event_id, turn_id: olderFailureEvent.turn_id } : null,
          newer_success: newerSuccessEvent
            ? { event_id: newerSuccessEvent.event_id, turn_id: newerSuccessEvent.turn_id } : null,
          restart_displayed_outcome: observed ? observed.displayed : null,
          older_event_load_displayed_outcome: olderLoad ? olderLoad.displayed : null,
        },
      },
      'W28-10-OLDER-EVENT-PAGINATION': {
        projection_evidence: {
          query_export: queryReference, dom_export_after_older_load: olderLoadReference,
          older_failure: olderFailureEvent
            ? { event_id: olderFailureEvent.event_id, turn_id: olderFailureEvent.turn_id } : null,
          paging: restoredEvents.paging || null,
        },
      },
    },
  };
  const packagePath = writeProjectionExport('projection-evidence.json', evidencePackage);
  report.projectionExports = {
    directory: projectionDirectory,
    packagePath: packagePath || '',
    files: artifacts.map((item) => item.path),
  };
  record('A9-15-PROJECTION-EXPORTS-WRITTEN',
    Boolean(packagePath) && artifacts.length === 5 && artifacts.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)),
  JSON.stringify(report.projectionExports));
}

/**
 * W28-H04：真实分页证据闭环探针。
 *
 * 与旧实现的差异：driver 不再用独立游标调用 api.queryEvents() 冒充分页证据——
 * Renderer 只负责真实点击产品"加载更早记录"入口与读取 DOM 状态；每次点击触发的真实
 * a9.events.query 请求/响应由 main() 安装的 IPC 观察边界记录，node 侧按 seq 因果顺序
 * 逐轮绑定（请求 limit/beforeEventId、响应成员/范围/hasMore/终态身份）。首屏事实同样
 * 取自产品重启后自动发出的真实首屏查询观察，而非 driver 自行重放查询。
 *
 * 采集时序（交接书 §7.5）：本探针由 runSecondProcess 在"重启即时状态采集之后、补载即时
 * 状态/会话切换/其他重载之前"调用；补载后旧失败轮次内容必须在本探针内观察为"分页前
 * 不存在、分页后出现"，证明旧失败确实进入了产品已加载历史（仅数据库存在不算）。
 */
async function runPagingProbe(exec, conversationId, restoredEvents) {
  const windowLimit = PRODUCT_FIRST_QUERY_LIMIT;
  const productQuery = (observation) => Boolean(observation) && observation.limit === windowLimit
    && observation.conversation_id === conversationId;
  const latestObservation = (predicate) => {
    for (let index = queryObservations.length - 1; index >= 0; index -= 1) {
      if (predicate(queryObservations[index])) return queryObservations[index];
    }
    return null;
  };
  const facts = {
    conversation_id: conversationId,
    window_limit: windowLimit,
    observation_boundary: 'IPC_MAIN_HANDLE_OBSERVER',
    classification: {
      product_ui: `limit===${windowLimit}（产品首屏/分页固定窗口；本进程 driver 永不以该 limit 发起参考查询）`,
      driver_reference: 'limit===1000（driver 独立参考查询，仅记计数/范围摘要，不记成员集合）',
    },
    ok: false,
  };
  // 首屏：产品重启恢复后自动发出的真实首屏查询（无 beforeEventId、成功、产品窗口）。
  const firstScreen = latestObservation((item) => productQuery(item)
    && item.before_event_id === null && item.ok === true && !item.injected);
  if (!firstScreen) {
    return { ...facts, reason: 'NO_PRODUCT_FIRST_SCREEN_OBSERVATION',
      observations_tail: queryObservations.slice(-6).map((item) => ({ ...item, event_ids: undefined, terminal_events: undefined })) };
  }
  facts.first_screen = {
    limit: firstScreen.limit, count: firstScreen.count, has_more: firstScreen.has_more === true,
    first_event_id: firstScreen.first_event_id, last_event_id: firstScreen.last_event_id,
    event_ids: firstScreen.event_ids, terminal_events: firstScreen.terminal_events || [],
    ok: firstScreen.ok === true,
  };
  // 旧失败身份（独立参考查询事实）与 DOM 可观察绑定目标（该轮次首个 tool_start 事件）。
  const referenceEvents = restoredEvents.events || [];
  const olderFailureEvent = referenceEvents.find((item) => item.type === 'turn_failed') || null;
  const olderFailureToolStart = olderFailureEvent
    ? referenceEvents.find((item) => item.type === 'tool_start'
      && item.turn_id === olderFailureEvent.turn_id) || null
    : null;
  const readControl = `(() => {
    const note = document.querySelector('#a9-task-stream .legacy-note');
    const button = note ? note.querySelector('button') : null;
    return {
      hasControl: Boolean(button), disabled: button ? button.disabled : null,
      label: button ? button.textContent : '',
      visibleCount: document.querySelectorAll('#a9-timeline li').length,
    };
  })()`;
  // 旧失败轮次内容可观察性：活动组按事件 ID 绑定（不依赖块 key），辅以轮次块过程节点计数。
  const readOlderObservable = (turnId, toolStartEventId) => `(async () => {
    const snapshot = (await window.win7Agent.a9.snapshot()).snapshot;
    const facts = snapshot.conversation || [];
    const fact = facts.find((item) => item.turnId === ${JSON.stringify(turnId)}) || null;
    let block = null;
    if (fact && fact.taskId) {
      block = Array.from(document.querySelectorAll('#a9-task-stream article.turn-block'))
        .find((node) => node.dataset.turnKey === fact.taskId) || null;
    }
    const progressChildren = block ? block.querySelectorAll('.turn-progress > *').length : 0;
    const group = ${Number.isSafeInteger(toolStartEventId)
    ? `Array.from(document.querySelectorAll('#a9-task-stream details.activity-group'))
        .find((node) => Number(node.dataset.eventId) === ${toolStartEventId}) || null`
    : 'null'};
    // W28-H04：产品只在"终态轮次的过程事件尚未加载"时于该轮次块渲染
    // 「历史记录未包含过程。」（a9-workbench.js updateTurnBlock：events.length === 0 且终态）。
    // 该 note 消失即等价于该轮次事件已进入已加载历史——语义信号；
    // .turn-progress > * 计数会把 note 本身与结局卡一并计入，不能作为"是否已加载"的判据。
    const legacyNote = block ? block.querySelector('.legacy-note') : null;
    const activityItems = block ? block.querySelectorAll('.activity-items li').length : 0;
    return {
      factFound: Boolean(fact), taskId: fact ? fact.taskId : null,
      blockFound: Boolean(block), progressChildren, activityItems,
      hasLegacyNote: block ? Boolean(legacyNote) : null,
      groupEventId: group ? Number(group.dataset.eventId) : null,
    };
  })()`;
  const beforeControl = await exec(readControl);
  facts.before = { ...beforeControl };
  if (!beforeControl.hasControl || beforeControl.disabled) {
    facts.reason = 'NO_LOAD_MORE_CONTROL';
    facts.stop_reason = 'NO_LOAD_MORE_CONTROL';
    facts.older_failure = olderFailureEvent
      ? { event_id: olderFailureEvent.event_id, turn_id: olderFailureEvent.turn_id, type: olderFailureEvent.type }
      : null;
    facts.older_failure_loaded_observable = false;
    facts.older_failure_block_populated_before_paging = false;
    const verdict = validatePagingChain(facts);
    facts.validation = verdict;
    return facts;
  }
  const beforeOlder = olderFailureEvent
    ? await exec(readOlderObservable(olderFailureEvent.turn_id, olderFailureToolStart ? olderFailureToolStart.event_id : null))
    : null;
  // W28-H04："分页前已填充"= 该轮次内容在补载前就已渲染（legacy note 不存在），
  // 不是"进程里有子节点"（结局卡与 legacy note 本身都会产生子节点）。
  facts.older_failure_block_populated_before_paging = Boolean(beforeOlder)
    && beforeOlder.blockFound === true && beforeOlder.hasLegacyNote === false;
  facts.before.olderObservable = beforeOlder;
  // 真实点击循环：每轮点击产品入口，等待该轮真实分页请求+响应进入观察日志（主进程侧
  // 完成记录即响应已返回），不依赖"最近 60 行变化"或"按钮消失"作为页成功信号。
  const pages = [];
  let stopReason = 'ROUND_LIMIT';
  let olderFailureFound = null;
  for (let round = 0; round < 12; round += 1) {
    const control = await exec(readControl);
    if (!control.hasControl || control.disabled) { stopReason = 'CONTROL_GONE_OR_DISABLED'; break; }
    const seqBefore = queryObservationSeq;
    await exec(`(() => {
      const note = document.querySelector('#a9-task-stream .legacy-note');
      const button = note ? note.querySelector('button') : null;
      if (button) button.click();
      return Boolean(button);
    })()`);
    const observed = await waitFor(() => {
      for (let index = queryObservations.length - 1; index >= 0; index -= 1) {
        const item = queryObservations[index];
        if (item.seq > seqBefore && productQuery(item) && item.before_event_id !== null) return item;
      }
      return null;
    }, 15_000, `paging round ${round} request`).catch(() => null);
    if (!observed) {
      pages.push({ round, conversation_id: conversationId, click_observed: true, request_observed: false,
        request: null, response: null });
      stopReason = 'NO_REQUEST_AFTER_CLICK';
      break;
    }
    pages.push({
      round, conversation_id: observed.conversation_id,
      request: { limit: observed.limit, before_event_id: observed.before_event_id },
      response: {
        ok: observed.ok === true, count: observed.count, has_more: observed.has_more === true,
        first_event_id: observed.first_event_id, last_event_id: observed.last_event_id,
        event_ids: observed.event_ids, terminal_events: observed.terminal_events || [],
      },
      click_observed: true, request_observed: true,
    });
    const found = (observed.terminal_events || []).find((item) => item.type === 'turn_failed') || null;
    if (found) { olderFailureFound = found; stopReason = 'OLDER_FAILURE_REACHED'; break; }
    if (observed.ok !== true) { stopReason = 'PAGE_RESPONSE_FAILED'; break; }
    if (!observed.count) { stopReason = 'EMPTY_PAGE'; break; }
    if (observed.has_more !== true) { stopReason = 'NO_MORE_HISTORY'; break; }
    // 等待产品消化该页（按钮恢复可用或控件消失），避免下一轮点击落在加载锁上。
    await waitFor(() => exec(`(() => {
      const note = document.querySelector('#a9-task-stream .legacy-note');
      const button = note ? note.querySelector('button') : null;
      return !button || !button.disabled ? true : null;
    })()`), 10_000, 'paging control settle').catch(() => null);
  }
  // 补载后 DOM 可观察：旧失败轮次的过程内容必须因补载出现（此前为空）。
  const afterControl = await exec(readControl);
  facts.after = { ...afterControl };
  let olderLoaded = false;
  if (olderFailureEvent) {
    const toolStartId = olderFailureToolStart ? olderFailureToolStart.event_id : null;
    // W28-H04：补载可观察的判据是该轮次块不再显示 `历史记录未包含过程。`
    //（即其事件已进入产品已加载历史）。旧判据要求存在工具活动组或进度子节点，
    // 但 Provider 失败轮次没有工具调用，补载后反而为空，导致恒为"未加载"。
    const afterOlder = await waitFor(() => exec(readOlderObservable(olderFailureEvent.turn_id, toolStartId))
      .then((state) => (state && state.blockFound === true && state.hasLegacyNote === false ? state : null)),
    10_000, 'older failure turn content populated').catch(() => null);
    facts.after.olderObservable = afterOlder;
    olderLoaded = Boolean(afterOlder) && afterOlder.hasLegacyNote === false;
  }
  const lastPage = pages.length ? pages[pages.length - 1] : null;
  const successSum = pages.reduce((sum, page) => (page.response && page.response.ok === true
    && Number.isSafeInteger(page.response.count) ? sum + page.response.count : sum), 0);
  facts.pages = pages;
  facts.older_failure = olderFailureFound
    ? { event_id: olderFailureFound.event_id, turn_id: olderFailureFound.turn_id, type: olderFailureFound.type }
    : null;
  facts.older_failure_loaded_observable = olderLoaded;
  facts.stop_reason = stopReason;
  facts.controlConsumed = pages.some((page) => page.click_observed === true && page.request_observed !== false);
  facts.pageCount = successSum;
  facts.pageHasMore = Boolean(lastPage && lastPage.response && lastPage.response.has_more === true);
  facts.pageLastId = lastPage && lastPage.response ? lastPage.response.last_event_id : null;
  facts.pageHasOlderFailure = Boolean(olderFailureFound);
  facts.pageOlderFailureId = olderFailureFound ? olderFailureFound.event_id : null;
  facts.firstPageExcludesOlderFailure = olderFailureFound
    ? !(facts.first_screen.event_ids || []).includes(olderFailureFound.event_id) : false;
  facts.beforeEventId = facts.first_screen.first_event_id;
  facts.firstPageLimit = facts.first_screen.limit;
  facts.firstPageCount = facts.first_screen.count;
  facts.firstPageHasMore = facts.first_screen.has_more === true;
  facts.firstPageOldestId = facts.first_screen.first_event_id;
  facts.observations_dropped = queryObservationsDropped;
  const verdict = validatePagingChain(facts);
  facts.validation = verdict;
  facts.ok = verdict.ok === true;
  return facts;
}

/**
 * W28-H04 负向敏感性：对真实分页证据副本施加交接书 §7 的反例变异，同一 validatePagingChain
 * 必须全部拒绝（证明"摘要通过"不可能绕过逐页事实核对）。变异只作用于深拷贝副本。
 */
function pagingNegativeSensitivity(pagingFacts) {
  const applied = {};
  const mutations = {
    emptyPages: (copy) => { copy.pages = []; return true; },
    zeroCountPage: (copy) => {
      if (!copy.pages.length) return false;
      copy.pages[0].response.count = 0;
      copy.pages[0].response.event_ids = [];
      copy.pages[0].response.first_event_id = null;
      copy.pages[0].response.last_event_id = null;
      return true;
    },
    failedPageResponse: (copy) => {
      if (!copy.pages.length) return false;
      copy.pages[copy.pages.length - 1].response.ok = false;
      return true;
    },
    repeatedCursor: (copy) => {
      if (copy.pages.length < 2) return false;
      copy.pages[1].request.before_event_id = copy.pages[0].request.before_event_id;
      return true;
    },
    crossConversationPage: (copy) => {
      if (!copy.pages.length) return false;
      copy.pages[0].conversation_id = 'foreign-conversation';
      return true;
    },
    olderFailureNotInPages: (copy) => {
      copy.pages = copy.pages.map((page) => ({ ...page, response: { ...page.response, terminal_events: [] } }));
      return true;
    },
    olderFailureInFirstScreen: (copy) => {
      if (!copy.older_failure || !Array.isArray(copy.first_screen.event_ids)) return false;
      copy.first_screen.event_ids = [...copy.first_screen.event_ids];
      copy.first_screen.event_ids[0] = copy.older_failure.event_id;
      copy.first_screen.first_event_id = copy.older_failure.event_id;
      return true;
    },
    olderFailureNotLoaded: (copy) => { copy.older_failure_loaded_observable = false; return true; },
    olderFailurePreloaded: (copy) => { copy.older_failure_block_populated_before_paging = true; return true; },
    summaryCountContradiction: (copy) => { copy.pageCount = copy.pageCount + 1; return true; },
    summaryBooleanContradiction: (copy) => { copy.controlConsumed = !copy.controlConsumed; return true; },
    duplicateMergedEvent: (copy) => {
      if (copy.pages.length < 2) return false;
      const donor = copy.pages[0].response;
      copy.pages[1].response = {
        ...copy.pages[1].response, event_ids: [...donor.event_ids],
        count: donor.count, first_event_id: donor.first_event_id, last_event_id: donor.last_event_id,
      };
      return true;
    },
    pageNotProgressing: (copy) => {
      if (copy.pages.length < 2) return false;
      const shifted = copy.pages[1].response.event_ids.map((id) => id + 100000);
      copy.pages[1].response = {
        ...copy.pages[1].response, event_ids: shifted,
        first_event_id: shifted[0], last_event_id: shifted[shifted.length - 1],
      };
      return true;
    },
    clickWithoutRequest: (copy) => {
      copy.pages.push({ round: 99, conversation_id: copy.conversation_id,
        click_observed: true, request_observed: false, request: null, response: null });
      return true;
    },
    olderRemovedFromMembers: (copy) => {
      if (!copy.older_failure || !copy.pages.length) return false;
      const oldId = copy.older_failure.event_id;
      for (const page of copy.pages) {
        if (!page.response || !Array.isArray(page.response.event_ids)) continue;
        page.response.event_ids = page.response.event_ids.filter((id) => id !== oldId);
        page.response.count = page.response.event_ids.length;
      }
      copy.pageCount = copy.pages.reduce((sum, p) => sum + (p.response?.count || 0), 0);
      return true;
    },
    continueAfterHasMoreFalse: (copy) => {
      if (!copy.pages.length) return false;
      copy.pages[0].response.has_more = false;
      if (copy.pages.length === 1) {
        copy.pages.push(JSON.parse(JSON.stringify(copy.pages[0])));
      }
      return true;
    },
    domObservationContradictsSummary: (copy) => {
      copy.after = copy.after || {};
      copy.after.olderObservable = { blockFound: false, hasLegacyNote: true };
      copy.older_failure_loaded_observable = true;
      return true;
    },
    omitRequestObserved: (copy) => {
      if (!copy.pages.length) return false;
      for (const page of copy.pages) delete page.request_observed;
      return true;
    },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const copy = JSON.parse(JSON.stringify(pagingFacts));
    let mutated = false;
    try { mutated = mutate(copy) === true; } catch (_error) { mutated = false; }
    if (!mutated) continue;
    applied[name] = validatePagingChain(copy).ok !== true;
  }
  return applied;
}

async function runSecondProcess(win, exec, env) {
  const expectedProjection = process.env.A9_SMOKE_PROJECTION_SEED
    ? JSON.parse(process.env.A9_SMOKE_PROJECTION_SEED) : {};
  // 重启恢复：不再通过命令行预绑定工作区；产品必须从同一 dataRoot
  // 恢复活动工作区，再恢复模式、Provider 配置与 checkpoint。
  const snapshot = await waitFor(() => exec('(window.win7Agent.a9.snapshot()).then(r => r.snapshot)'), 15_000, 'snapshot');
  const sessionsResult = await exec('(window.win7Agent.listSessions()).then(r => r.sessions)');
  const activeSession = (sessionsResult || []).find((session) => session.status === 'ACTIVE');
  const expectedWorkspace = fs.realpathSync(env.workspaceRoot);
  record('A9F2-RESTORE-ACTIVE-WORKSPACE', snapshot.workspaceRoot === expectedWorkspace && activeSession && activeSession.workspacePath === expectedWorkspace, `expected=${expectedWorkspace}; snapshot=${snapshot.workspaceRoot}; session=${activeSession && activeSession.workspacePath}`);
  record('A9F2-RESTORE-MODE', snapshot.mode === 'full_access', `mode=${snapshot.mode}`);
  record('A9F2-RESTORE-PROVIDER', snapshot.provider && snapshot.provider.configured === true && snapshot.provider.model === 'smoke-manual-model', `model=${snapshot.provider && snapshot.provider.model}`);
  record('A9F2-RESTORE-CHECKPOINT', (snapshot.checkpoints || []).length >= 1, `checkpoints=${(snapshot.checkpoints || []).length}`);
  // 真实中断恢复：first 进程已 checkpoint 后退出，无 active 任务 → 无 interrupted 伪造。
  record('A9F2-NO-SPURIOUS-INTERRUPTION', Array.isArray(snapshot.interruptions) && snapshot.interruptions.length === 0, `interruptions=${JSON.stringify(snapshot.interruptions)}`);
  // 不自动重放：时间线为空。
  record('A9F2-NO-REPLAY-TIMELINE', Array.isArray(snapshot.timeline) && snapshot.timeline.length === 0, `timeline=${snapshot.timeline.length}`);
  const restoredEvents = await exec(`(async () => {
    const api = window.win7Agent.a9;
    const current = (await api.snapshot()).snapshot;
    // 真实分页完整采集：单次查询上限为 1000，必须按 beforeEventId 逐页取回并按 eventId 升序合并，
    // 否则旧失败终态会落在窗口之外而无法核对（不得只取一页）。
    const pages = [];
    const collectedEvents = [];
    const seenIds = new Set();
    let beforeEventId = null;
    for (let guard = 0; guard < 60; guard += 1) {
      const options = { conversationId: current.activeConversationId, limit: 1000 };
      if (beforeEventId !== null) options.beforeEventId = beforeEventId;
      const response = await api.queryEvents(options);
      const batch = (response && response.ok === true && response.events) ? response.events : [];
      pages.push({
        limit: 1000, before_event_id: beforeEventId, has_more: response && response.hasMore === true,
        returned_count: batch.length, returned_first_event_id: batch.length ? batch[0].eventId : null,
        returned_last_event_id: batch.length ? batch[batch.length - 1].eventId : null,
        ok: response && response.ok === true,
      });
      for (const event of batch) if (!seenIds.has(event.eventId)) { seenIds.add(event.eventId); collectedEvents.push(event); }
      if (!(response && response.hasMore === true) || !batch.length) break;
      beforeEventId = batch[0].eventId;
    }
    collectedEvents.sort((a, b) => a.eventId - b.eventId);
    const events = collectedEvents;
    const ids = events.map((event) => event.eventId);
    const data = (event) => event.payload?.data || event.payload || event.data || {};
    return {
      conversationId: current.activeConversationId,
      pages,
      count: ids.length,
      eventIds: ids,
      unique: new Set(ids).size === ids.length,
      ordered: ids.every((id, index) => index === 0 || id > ids[index - 1]),
      modelNotes: events.filter((event) => (event.eventType || event.type) === 'model_note').length,
      sessionEventIds: events.filter((event) => !event.turnId).map((event) => event.eventId),
      turnRows: events.filter((event) => event.turnId).map((event) => ({
        eventId: event.eventId, turnId: event.turnId, type: event.eventType || event.type,
      })),
      events: events.map((event) => {
        const payloadData = data(event);
        const shell = payloadData.shell && payloadData.shell.schemaVersion === 1 ? payloadData.shell : null;
        const args = payloadData.args && typeof payloadData.args === 'object' ? payloadData.args : {};
        const bounded = (value, cap) => (typeof value === 'string' ? value.slice(0, cap) : null);
        const createdAt = event.createdAt === undefined ? event.timestamp : event.createdAt;
        const createdAtMs = typeof createdAt === 'number' ? createdAt : Date.parse(String(createdAt || ''));
        return {
          event_id: event.eventId,
          turn_id: event.turnId || null,
          type: event.eventType || event.type,
          outcome: payloadData.outcome === undefined ? null : payloadData.outcome,
          verification: payloadData.verification === undefined ? null : payloadData.verification,
          timestamp_ms: Number.isSafeInteger(createdAtMs) ? createdAtMs : null,
          // F2：重建显示文本所需的最小脱敏事实（只含被渲染的字段，全部有界）。
          display: {
            outcome: typeof payloadData.outcome === 'string' ? payloadData.outcome : null,
            error_head: payloadData.error === undefined || payloadData.error === null
              ? null : String(payloadData.error).slice(0, ${EXPORT_BOUNDS.MAX_ERROR_HEAD}),
            tool_name: payloadData.toolName === undefined ? null : String(payloadData.toolName),
            decision: payloadData.decision === undefined ? null : String(payloadData.decision),
            denied: payloadData.denied === true,
            has_error: payloadData.error !== undefined && payloadData.error !== null,
            shell_has_exit_code: Boolean(shell && shell.exitCode !== undefined),
            shell_exit_code: shell && Number.isFinite(shell.exitCode) ? shell.exitCode : null,
            call_id: payloadData.callId === undefined ? null : String(payloadData.callId),
            step: Number.isSafeInteger(payloadData.step) ? payloadData.step : null,
            args: {
              path: bounded(args.path, ${EXPORT_BOUNDS.MAX_ARGS_FIELD}), pattern: bounded(args.pattern, ${EXPORT_BOUNDS.MAX_ARGS_FIELD}),
              source: bounded(args.source, ${EXPORT_BOUNDS.MAX_ARGS_FIELD}), destination: bounded(args.destination, ${EXPORT_BOUNDS.MAX_ARGS_FIELD}),
              command: bounded(args.command, ${EXPORT_BOUNDS.MAX_COMMAND}),
            },
          },
        };
      }),
    };
  })()`);
  record('A9-15-HISTORY-RESTART-EVENTS', restoredEvents.count > 0 && restoredEvents.unique && restoredEvents.ordered &&
    (!requireModelNotes || restoredEvents.modelNotes > 0), JSON.stringify({ ...restoredEvents, events: undefined }));



  // W28-H04：真实分页证据闭环（交接书 §7）。重启即时 DOM 状态与独立时间基准必须在分页前采集
  // （§7.5 首次重启状态在分页前采集）；分页探针只做真实点击，请求/响应由 main() 安装的 IPC
  // 观察边界按 seq 因果逐轮绑定，首屏事实取自产品重启后自动发出的真实首屏查询观察；
  // driver 不再用独立游标调用 api.queryEvents() 冒充分页证据。
  let pagingFacts = { ok: false, reason: 'NOT_PROJECTION' };
  let pagingSensitivity = null;
  if (projectionEnabled) {
    // restart 阶段即时状态：Inspector 行与时间基准在任何分页/重载之前采集。
    restoredEvents.restartObserved = await waitFor(async () => {
      const captured = await captureInspectorDom(exec);
      return captured && captured.rows.length > 0 ? captured : null;
    }, 20_000, 'persisted Inspector timeline rows');
    restoredEvents.restartBaseline = await collectTimeBaseline(exec);
    pagingFacts = await runPagingProbe(exec, restoredEvents.conversationId, restoredEvents);
    if (pagingFacts.ok === true) {
      // W28-H04d 负向敏感性：对真实分页证据副本施加交接书 §7 反例变异，同一
      // validatePagingChain 必须全部拒绝（证明摘要布尔值不可能绕过逐页事实核对）。
      pagingSensitivity = pagingNegativeSensitivity(pagingFacts);
    }
    // older_load 阶段即时状态：补载后立即采集，在会话切换与任何其他重载之前（§7.5）。
    restoredEvents.olderLoadObserved = await exec(`(async () => {
      const snap = (await window.win7Agent.a9.snapshot()).snapshot;
      const facts = snap && snap.conversation ? snap.conversation : [];
      const latest = facts.length ? facts[facts.length - 1] : null;
      const latestTurnId = latest ? latest.turnId : null;
      const rows = Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => ({
        eventId: Number(item.dataset.eventId), turnId: item.dataset.turnId || null,
        eventType: item.dataset.eventType || null, text: item.textContent,
      }));
      const note = document.querySelector('#a9-task-stream .legacy-note');
      const timeBaseline = {
        probe_version: ${JSON.stringify(TIME_BASELINE_PROBE_VERSION)},
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        probes: ${JSON.stringify(TIME_BASELINE_PROBE_UTC_MS)}.map((utcMs) => ({ utc_ms: utcMs, rendered: new Date(utcMs).toLocaleTimeString() })),
      };
      return {
        conversationId: snap.activeConversationId,
        latestTurnId,
        hasControl: Boolean(note && note.querySelector('button')),
        controlLabel: note && note.querySelector('button') ? note.querySelector('button').textContent : '',
        rows, displayed: document.getElementById('a9-turn-outcome').textContent, timeBaseline,
      };
    })()`);
  }
  record('A9-15-PAGING-PROBE-FACTS', projectionEnabled
    ? pagingFacts.ok === true && pagingSensitivity !== null
      && Object.values(pagingSensitivity).every((value) => value === true)
    : true,
  JSON.stringify({ ...pagingFacts, negativeSensitivity: pagingSensitivity }));
  restoredEvents.paging = pagingFacts;
  restoredEvents.pagingSensitivity = pagingSensitivity;
  // W28-H06：查询失败重试移交独立 retry 进程（前一进程完全关闭后复用同一 dataRoot；
  // 本进程内反复 refreshSnapshot() 不会触发 a9.events.query，基线证据 injectedCount=0）。
  // 把目标会话写入报告，供宿主以 A9_SMOKE_RETRY_CONVERSATION 传给 retry 进程。
  report.retryTarget = { conversationId: restoredEvents.conversationId };
  // 查询附件保存的是真实分页事实（limit / beforeEventId / hasMore / 返回范围），不硬编码。
  restoredEvents.pages = Array.isArray(restoredEvents.pages) ? restoredEvents.pages : [];
  if (!projectionEnabled) {
    // legacy 协议：保留历史断言；不导出投影证据，也不要求新协议 fixture。
    const legacyProjection = await waitFor(() => exec(`(() => {
      const current = document.getElementById('a9-turn-outcome').textContent;
      const rows = document.querySelectorAll('#a9-timeline li').length;
      return rows > 0 && current ? { rows, current } : null;
    })()`), 20_000, 'legacy Inspector timeline');
    record('A9-15-HISTORY-RESTART-RENDERED', legacyProjection.rows > 0, JSON.stringify(legacyProjection));
    record('A9-15-LEGACY-PROTOCOL-NO-PROJECTION-EXPORT',
      !report.projectionExports || Object.keys(report.projectionExports).length === 0, `protocol=${driverProtocol}`);
  } else {
    await runProjectionAcceptance(win, exec, env, restoredEvents, expectedProjection);
  }

  // Exercise the formal preload/Schema IPC path for the complete 16-conversation
  // boundary and identity-scoped draft/archive/restore operations.
  const conversations = await exec(`(async () => {
    const api = window.win7Agent.a9;
    const initial = await api.snapshot();
    const originalId = initial.snapshot.activeConversationId;
    const created = [];
    while ((await api.snapshot()).snapshot.conversations.filter((item) => !item.archivedAt).length < 16) {
      const next = await api.createConversation();
      if (!next.ok) return { ok: false, phase: 'create', next };
      created.push(next.conversationId);
    }
    const seventeenth = await api.createConversation();
    const currentId = (await api.snapshot()).snapshot.activeConversationId;
    const renamed = await api.renameConversation(currentId, 'Electron IPC conversation 16');
    const draftCurrent = await api.saveDraft('draft-conversation-16');
    const switched = await api.activateConversation(originalId);
    const draftOriginal = await api.saveDraft('draft-original');
    const back = await api.activateConversation(currentId);
    const currentDraft = (await api.snapshot()).snapshot.draft;
    const archived = await api.archiveConversation(currentId);
    const afterArchive = (await api.snapshot()).snapshot;
    const restored = await api.restoreConversation(currentId);
    const afterRestore = (await api.snapshot()).snapshot;
    await api.activateConversation(originalId);
    return {
      ok: renamed.ok && draftCurrent.ok && switched.ok && draftOriginal.ok && back.ok && archived.ok && restored.ok,
      seventeenth: { ok: seventeenth.ok, code: seventeenth.error && seventeenth.error.code },
      currentDraft: currentDraft && currentDraft.text,
      archivedCount: afterArchive.conversations.filter((item) => item.state === 'archived').length,
      activeCount: afterRestore.conversations.filter((item) => item.state === 'active').length,
      restoredActiveId: afterRestore.activeConversationId,
      currentId,
      created: created.length,
    };
  })()`);
  record('A9F2-CONVERSATION-16-IPC-ISOLATION', conversations.ok === true && conversations.seventeenth.ok === false &&
    conversations.seventeenth.code === 'A9_CONVERSATION_LIMIT' &&
    conversations.currentDraft === 'draft-conversation-16' && conversations.archivedCount >= 1 &&
    conversations.activeCount === 16 && conversations.restoredActiveId === conversations.currentId, JSON.stringify(conversations));

  const search = await exec(`(async () => {
    const api = window.win7Agent.a9;
    const before = (await api.snapshot()).snapshot;
    const originalId = before.activeConversationId;
    const target = before.conversations.find((item) => item.sessionId !== originalId && item.state === 'active');
    if (!target) return { ok: false, reason: 'no-target' };
    await api.activateConversation(target.sessionId);
    await api.renameConversation(target.sessionId, 'Archived Search Needle');
    await api.archiveConversation(target.sessionId);
    await window.win7AgentA9Workbench.refreshSnapshot();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const current = (await api.snapshot()).snapshot;
      const archived = current.conversations.find((item) => item.sessionId === target.sessionId);
      if (archived?.state === 'archived' && archived.title === 'Archived Search Needle' &&
          document.getElementById('conversation-archive-list').textContent.includes('Archived Search Needle')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    const input = document.getElementById('conversation-search');
    const focused = document.activeElement === input;
    input.value = 'Archived Search Needle';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (document.getElementById('conversation-directory-note').textContent.includes('1 个匹配')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const note = document.getElementById('conversation-directory-note').textContent;
    const archivedText = document.getElementById('conversation-archive-list').textContent;
    const activeText = document.getElementById('conversation-list').textContent;
    input.value = 'definitely-no-match';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const empty = document.getElementById('conversation-list').textContent.includes('没有匹配的对话');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await api.restoreConversation(target.sessionId);
    await api.activateConversation(originalId);
    await window.win7AgentA9Workbench.refreshSnapshot();
    return { ok: true, focused, note, archivedText, activeText, empty };
  })()`);
  record('A9-15-CONVERSATION-SEARCH-ACTIVE-ARCHIVED', search.ok && search.focused && search.note.includes('1 个匹配') &&
    search.archivedText.includes('Archived Search Needle') && !search.activeText.includes('Archived Search Needle') && search.empty, JSON.stringify(search));

  // 旧审批不可执行：无挂起审批却恢复 → 结构化拒绝（不新增实体、零副作用）。
  const oldApproval = {
    approvalId: process.env.A9_SMOKE_OLD_APPROVAL_ID,
    bindingDigest: process.env.A9_SMOKE_OLD_APPROVAL_DIGEST,
    conversationId: process.env.A9_SMOKE_OLD_APPROVAL_CONVERSATION,
    taskId: process.env.A9_SMOKE_OLD_APPROVAL_TASK,
    turnId: process.env.A9_SMOKE_OLD_APPROVAL_TURN,
  };
  const rejected = await exec(`(window.win7Agent.a9.resumeApproval(${JSON.stringify(oldApproval.approvalId)}, "approved", ${JSON.stringify(oldApproval.bindingDigest)}, ${JSON.stringify(oldApproval.conversationId)}, ${JSON.stringify(oldApproval.taskId)}, ${JSON.stringify(oldApproval.turnId)})).then(r => ({ ok: r.ok, code: r.error && r.error.code }))`);
  record('A9F2-OLD-APPROVAL-REJECTED', rejected.ok === false && rejected.code === 'A9_APPROVAL_UNKNOWN', JSON.stringify(rejected));

  // 新 Turn 仍可执行（恢复的 Provider 已配置）；恢复请求由宿主按内容断言为全新会话。
  const outcome = await exec('(window.win7Agent.a9.submitTurn("verify again")).then(r => ({ ok: r.ok, outcome: r.result && r.result.outcome, code: r.error && r.error.code }))');
  record('A9F2-SECOND-TURN-WORKS', outcome.ok === true && outcome.outcome === 'completed', `outcome=${JSON.stringify(outcome)}`);
}

/**
 * W28-H06：查询失败后的可见重试（独立进程，交接书 §9 H06 优先方案）。
 *
 * 在前一进程完全关闭后复用同一 dataRoot；main() 已在加载产品入口前安装一次性、绑定目标
 * conversation（A9_SMOKE_RETRY_CONVERSATION）的查询失败替身（注入点：IPC 主进程边界；
 * 证据等级：测试替身，非真实 OS/DB 故障，标注 TEST_DOUBLE_NOT_REAL_OS_FAILURE）。
 * 产品重启后 Renderer initialize() 的初次历史加载真实失败 → eventsError 渲染"重试加载"
 * 入口 → 本进程实际点击该入口 → 第二次查询必须成功。核对：错误消失、事件无缺失/重复、
 * 最新结果正确（DOM 行 = 独立对照查询的最后 60 行；全局结果 = 最新持久化终态）。
 * 负向口径（零命中、重试仍失败、未点击、重复事件、恢复内容错绑）均编码为下方断言条件，
 * 任一发生即 FAIL，不以"缺少控件就跳过"或断言降级修复。
 */
async function runRetryProcess(win, exec, env) {
  void env;
  const targetConversationId = process.env.A9_SMOKE_RETRY_CONVERSATION || '';
  // 等待产品重启完成：快照恢复后初次历史加载被替身注入失败，"重试加载"入口出现。
  const errorState = await waitFor(() => exec(`(() => {
    const note = document.querySelector('#a9-task-stream .legacy-note');
    const button = note ? note.querySelector('button') : null;
    if (!button || button.textContent !== '重试加载') return null;
    return {
      hasNote: Boolean(note), label: button.textContent, disabled: button.disabled,
      timelineRows: document.querySelectorAll('#a9-timeline li').length,
      noteText: note.textContent,
    };
  })()`), 30_000, 'retry affordance after injected initial load failure').catch(() => null);
  const errorVisible = Boolean(errorState) && errorState.label === '重试加载';
  // 注入事实：恰好命中一次、绑定目标会话；注入观察与后续成功查询按 seq 保持因果顺序。
  const injectedObservations = queryObservations.filter((item) => item.injected === true).map((item) => ({
    seq: item.seq, conversation_id: item.conversation_id, limit: item.limit,
    before_event_id: item.before_event_id, ok: item.ok, error: item.error, injected: true,
  }));
  const injection = injectedQueryFailure ? {
    ...injectedQueryFailure,
    hitCount: injectedObservations.length,
    observations: injectedObservations,
  } : null;
  const injectedCount = injection ? injection.hitCount : 0;
  const injectedBoundToTarget = Boolean(injection) && injectedCount === 1
    && (!targetConversationId
      || injectedObservations[0].conversation_id === targetConversationId);
  // 实际点击产品"重试加载"入口（真实用户路径，不直接调用产品内部函数）。
  const clickedRetry = errorVisible ? await exec(`(() => {
    const note = document.querySelector('#a9-task-stream .legacy-note');
    const button = note ? note.querySelector('button') : null;
    if (button) button.click();
    return Boolean(button);
  })()`) === true : false;
  // 恢复：错误入口消失，Inspector 重新出现行（初次失败时历史为空，行数 > 0 证明真实补载）。
  const recoveredState = await waitFor(() => exec(`(() => {
    const note = document.querySelector('#a9-task-stream .legacy-note');
    const button = note ? note.querySelector('button') : null;
    const label = button ? button.textContent : '';
    const rows = document.querySelectorAll('#a9-timeline li').length;
    if (label === '重试加载' || rows === 0) return null;
    return { label, noteGone: !note, rows };
  })()`), 60_000, 'retry recovery').catch(() => null);
  const recovered = Boolean(recoveredState) && recoveredState.rows > 0 && recoveredState.label !== '重试加载';
  // 对照查询：恢复后按真实分页取回全量事件（独立于 UI 首屏窗口），核对无重复。
  const afterRetry = recovered ? await exec(COLLECT_ALL_EVENTS) : null;
  const afterIds = (afterRetry && afterRetry.ids) || [];
  // W28-H06：集合去重计数必须用 Set#size（Set 没有 length；旧写法恒为 undefined !== 长度，
  // 使该断言永远为 false，retry 用例不可能通过）。
  const uniqueAfterRetry = afterIds.length > 0 && new Set(afterIds).size === afterIds.length;
  // DOM 有界显示范围必须等于对照查询的最后 60 行（无缺失、无重复、无错绑）。
  const domState = recovered ? await exec(`(() => ({
    ids: Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => Number(item.dataset.eventId)),
    displayed: document.getElementById('a9-turn-outcome').textContent,
  }))()`) : null;
  const domIds = (domState && domState.ids) || [];
  const domUnique = domIds.length > 0 && new Set(domIds).size === domIds.length;
  const rowsMatchReference = domIds.length > 0
    && JSON.stringify(domIds) === JSON.stringify(afterIds.slice(-INSPECTOR_DISPLAY_ROWS));
  // 最新结果正确：全局结果必须等于对照查询里最新终态事件的期望显示（独立于 Renderer 投影）。
  const latestOutcomeOk = (function computeLatest() {
    if (!afterRetry || !Array.isArray(afterRetry.events) || !afterRetry.events.length) return false;
    const terminals = afterRetry.events
      .filter((item) => ['turn_completed', 'turn_failed', 'turn_cancelled', 'turn_interrupted', 'turn_blocked']
        .includes(item.eventType || item.type));
    if (!terminals.length) return false;
    const newest = terminals.reduce((a, b) => (b.eventId > a.eventId ? b : a));
    const type = newest.eventType || newest.type;
    const data = (newest.payload && newest.payload.data) || newest.payload || {};
    const facts = type === 'turn_failed'
      ? { outcome: 'failed', verification: 'not_applicable' }
      : { outcome: String(data.outcome || ''), verification: String(data.verification || '') };
    return domState && domState.displayed === `${facts.outcome} · ${facts.verification}`;
  }());
  // 请求/响应顺序：注入失败必须先于恢复后的成功查询（seq 因果）。
  const successfulObservations = queryObservations
    .filter((item) => item.injected !== true && item.ok === true)
    .map((item) => ({ seq: item.seq, conversation_id: item.conversation_id, limit: item.limit,
      before_event_id: item.before_event_id, count: item.count }));
  const orderOk = injectedObservations.length === 1 && successfulObservations.length >= 1
    && successfulObservations.every((item) => item.seq > injectedObservations[0].seq);
  const retryFacts = {
    ok: injectedBoundToTarget && errorVisible && clickedRetry && recovered
      && uniqueAfterRetry && domUnique && rowsMatchReference && latestOutcomeOk && orderOk,
    targetConversationId, injectedCount, injectedBoundToTarget,
    injection, errorState, errorVisible, clickedRetry, recoveredState, recovered,
    countAfterRetry: afterIds.length, uniqueAfterRetry,
    domRowCount: domIds.length, domUnique, rowsMatchReference,
    displayed: domState ? domState.displayed : null, latestOutcomeOk,
    successfulObservationsTail: successfulObservations.slice(-4),
    injectionPoint: 'IPC_MAIN_HANDLE_SINGLE_SHOT_WRAPPER',
    evidenceLevel: 'TEST_DOUBLE_NOT_REAL_OS_FAILURE',
  };
  record('A9-15-QUERY-FAILURE-VISIBLE-RETRY', retryFacts.ok === true, JSON.stringify(retryFacts));
  report.retryTarget = { conversationId: targetConversationId };
}

async function runStopProcess(win, exec, env) {
  await exec('document.querySelector(\'input[name="a9-mode-choice"][value="full_access"]\').checked = true; document.getElementById("a9-mode-apply").click(); true');
  await waitFor(() => exec('(window.win7Agent.a9.snapshot()).then(r => r.snapshot.mode)').then((m) => (m === 'full_access' ? m : null)), 15_000, 'stop mode set');

  await exec(`(() => {
    document.getElementById('a9-provider-url').value = ${JSON.stringify(env.fixtureUrl)};
    document.getElementById('a9-provider-model').value = 'shell-stall-fixture';
    document.getElementById('a9-provider-apply').click();
    return true;
  })()`);
  await waitFor(() => exec('document.getElementById("a9-provider-probe-state").textContent').then((t) => (t === 'tool_calling' ? t : null)), 30_000, 'stop provider probe');

  await exec('(() => { const prompt = document.getElementById("task-prompt"); prompt.value = "run the long shell task"; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()');
  const childPid = await waitFor(() => {
    if (!env.pidMarker || !fs.existsSync(env.pidMarker)) return null;
    const parsed = Number(fs.readFileSync(env.pidMarker, 'utf8').trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, 45_000, 'shell child pid marker');
  record('A9F6-STOP-SHELL-CHILD-STARTED', childPid > 0, `pid=${childPid}`);

  const stopVisible = await exec('document.getElementById("cancel-task").hidden === false');
  record('A9F6-STOP-UI-ACTIVE', stopVisible === true, `visible=${stopVisible}`);
  await captureVisual(win, 'running');
  await exec('document.getElementById("cancel-task").click(); true');
  const outcome = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t.includes('cancelled') ? t : null)), 45_000, 'cancelled outcome');
  const snapshot = await exec('(window.win7Agent.a9.snapshot()).then(r => r.snapshot)');
  record('A9F6-STOP-TURN-CANCELLED', Boolean(outcome) && snapshot.agentStatus === 'cancelled', `outcome=${outcome}; agentStatus=${snapshot.agentStatus}`);
}

app.whenReady().then(main).then(() => {
  fs.mkdirSync(path.dirname(process.env.A9_SMOKE_OUT), { recursive: true });
  fs.writeFileSync(process.env.A9_SMOKE_OUT, `${JSON.stringify(report, null, 2)}\n`);
  // 走真实 before-quit → async a9RuntimeInstance.shutdown() → app.quit()
  // → will-quit 路径。app.exit/手工 emit 会绕过产品的异步清理门并遗留工作区锁。
  process.exitCode = report.status === 'PASS' ? 0 : 1;
  app.quit();
}).catch((error) => {
  report.status = 'ERROR';
  report.error = String(error && error.stack ? error.stack : error);
  try { fs.writeFileSync(process.env.A9_SMOKE_OUT, `${JSON.stringify(report, null, 2)}\n`); } catch (_e) { /* best effort */ }
  process.exitCode = 1;
  app.quit();
});
