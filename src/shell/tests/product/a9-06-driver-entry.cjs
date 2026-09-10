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

// ADR-0121：投影行判定与期望标签推导来自共享契约模块，driver 与正式报告器共用同一实现，
// 避免两套规则漂移。开发机上契约位于 release/win7-product-v3/；候选内由构建器复制到 validation/
// 与 driver 同级。
function loadProjectionContract() {
  const candidates = [
    path.join(__dirname, 'a9-projection-contract.cjs'),
    path.join(repositoryRoot, 'release', 'win7-product-v3', 'a9-projection-contract.cjs'),
  ];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return require(candidate);
  throw new Error('A9_PROJECTION_CONTRACT_UNAVAILABLE');
}
const projectionContract = loadProjectionContract();
const {
  INSPECTOR_DISPLAY_RULE, INSPECTOR_DISPLAY_ROWS, QUERY_EXPORT_KIND, DOM_EXPORT_KIND,
  QUERY_EXPORT_SCHEMA_VERSION, DOM_EXPORT_SCHEMA_VERSION, PRODUCT_FIRST_QUERY_LIMIT,
  expectedRowLabel, rowLabelOf, hasTimestampPrefix, rowsMatchQuery, crossSessionResidue,
  allMutationsRejected, terminalFacts, expectedDisplayed, latestTerminalEvent, eventIdOf, turnIdOf,
  isEventId, MAX_ERROR_HEAD, MAX_COMMAND, MAX_ARGS_FIELD,
} = projectionContract;
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
 * 负向敏感性：缺行、乱序、重复、跨会话残留，以及内容类（替换全部标签内容、交换两行文字、替换工具摘要/
 * 路径、挪入另一轮次标签）与时间/身份类（错误时间、丢失 event_type）变异；全部与正向断言共用同一函数。
 */
function negativeSensitivity(rows, events) {
  return allMutationsRejected(exportRows(rows), events);
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
// F3：一次性事件查询故障注入状态（由 main() 在加载产品入口前安装的 IPC 包装使用）。
let injectQueryFailureOnce = false;
let injectedQueryFailure = null;

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
  // F3 故障注入接缝：在加载正式产品入口之前包装 ipcMain.handle，使事件查询通道可被**一次性**注入
  // 结构化失败。注入只发生在测试进程内、只影响一次调用，不修改产品源码、守卫或清理保证。
  {
    const { ipcMain } = require('electron');
    const originalHandle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = (channel, listener) => {
      if (typeof listener !== 'function' || String(channel) !== 'product:a9-request') {
        return originalHandle(channel, listener);
      }
      return originalHandle(channel, async (...args) => {
        const request = args[1];
        const serialized = (() => { try { return JSON.stringify(request || {}); } catch (_e) { return ''; } })();
        if (injectQueryFailureOnce && serialized.includes('events')) {
          injectQueryFailureOnce = false;
          injectedQueryFailure = {
            channel: String(channel), matchedRequest: serialized.slice(0, 200), at: new Date().toISOString(),
          };
          return { ok: false, error: { code: 'A9_INJECTED_QUERY_FAILURE' } };
        }
        return listener(...args);
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
  const observed = await waitFor(async () => {
    const captured = await captureInspectorDom(exec);
    return captured && captured.rows.length > 0 ? captured : null;
  }, 20_000, 'persisted Inspector timeline rows');

  const exportedRows = exportRows(observed.rows);
  const rowMatch = rowsMatchQuery(exportedRows, queryEvents);
  const labelMismatch = exportedRows.find((row, index) => {
    const event = queryEvents.slice(-INSPECTOR_DISPLAY_ROWS)[index];
    return !event || rowLabelOf(row.text) !== expectedRowLabel(event);
  });
  record('A9-15-INSPECTOR-PERSISTED-EVENTS', rowMatch
    && observed.displayRule === INSPECTOR_DISPLAY_RULE
    && observed.displayRows === String(expectedRowCount)
    && queryEvents.some((event) => event.turn_id === null)
    && queryEvents.some((event) => event.type === 'tool_start')
    && queryEvents.some((event) => event.type === 'tool_end'),
  JSON.stringify({
    displayRule: observed.displayRule, displayRows: observed.displayRows,
    expectedRowCount, domRows: observed.rows.length, queryEvents: queryEvents.length,
    sessionEvents: queryEvents.filter((event) => event.turn_id === null).length,
    timestampsPresent: exportedRows.filter((row) => hasTimestampPrefix(row.text)).length,
  }));

  record('A9-15-INSPECTOR-ROW-CONTENT', rowMatch === true && !labelMismatch, JSON.stringify({
    checked: exportedRows.length, firstMismatch: labelMismatch || null,
    sampleLabels: exportedRows.slice(0, 3).map((row) => rowLabelOf(row.text)),
  }));

  const negative = negativeSensitivity(observed.rows, queryEvents);
  const requiredMutations = ['missing', 'reordered', 'duplicated', 'residue', 'foreignContent',
    'swappedText', 'wrongDetail', 'otherTurnLabel', 'wrongTime', 'missingEventType'];
  record('A9-15-INSPECTOR-ASSERTION-NEGATIVE-CHECKS', negative.baseline === true
    && requiredMutations.every((name) => negative.rejected[name] === true),
  JSON.stringify(negative));

  const sessionSwitch = await exec(`(async () => {
    const api = window.win7Agent.a9;
    const readRows = () => Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => ({
      eventId: Number(item.dataset.eventId), turnId: item.dataset.turnId || null,
      eventType: item.dataset.eventType || null, text: item.textContent,
    }));
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
    const otherRows = readRows();
    const otherDisplayed = document.getElementById('a9-turn-outcome').textContent;
    if (!clickOtherRow()) return { ok: false, code: 'A9_W27_NO_RETURN_CONVERSATION_ROW' };
    switches += 1;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const rows = readRows();
      if ((await activeId()) === originalId && rows.length === ${expectedRowCount}
          && rows.length > 0 && rows[rows.length - 1].eventId === ${lastQueryEventId}) break;
    }
    const resumeRows = readRows();
    return {
      ok: true, originalId, otherConversationId, otherRows, otherDisplayed, resumeRows, switches,
      resumeDisplayed: document.getElementById('a9-turn-outcome').textContent,
    };
  })()`);
  const rowIds = (rows) => (Array.isArray(rows) ? rows.map((row) => row.eventId) : []);
  const resumeMatch = Array.isArray(sessionSwitch.resumeRows)
    && sessionSwitch.resumeRows.length === observed.rows.length
    && canonical(rowIds(sessionSwitch.resumeRows)) === canonical(rowIds(observed.rows));
  const otherDifference = sessionSwitch.otherConversationId && sessionSwitch.otherConversationId !== sessionSwitch.originalId;
  const noResidue = Array.isArray(sessionSwitch.otherRows)
    && !crossSessionResidue(exportRows(sessionSwitch.otherRows), queryEventIds);
  record('A9-15-INSPECTOR-SESSION-SWITCH-NO-RESIDUE',
    sessionSwitch.ok === true && otherDifference && noResidue && resumeMatch
    && sessionSwitch.resumeDisplayed === observed.displayed,
  JSON.stringify({
    ok: sessionSwitch.ok, code: sessionSwitch.code || '', switches: sessionSwitch.switches,
    otherConversationId: sessionSwitch.otherConversationId, otherRows: rowIds(sessionSwitch.otherRows),
    resumeRows: rowIds(sessionSwitch.resumeRows), otherDifference, noResidue, resumeMatch,
    resumeDisplayed: sessionSwitch.resumeDisplayed, displayed: observed.displayed,
  }));

  // 旧事件补载后的观察：真实分页请求已由 F4 probe（A9-15-PAGING-PROBE-FACTS）经产品按钮发起，
  // 此处只重新采集分页完成后的可见有界投影与全局结果，不再点击或替代加载动作。
  const olderLoad = await exec(`(async () => {
    const rows = Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => ({
      eventId: Number(item.dataset.eventId), turnId: item.dataset.turnId || null,
      eventType: item.dataset.eventType || null, text: item.textContent,
    }));
    const note = document.querySelector('#a9-task-stream .legacy-note');
    return {
      hasControl: Boolean(note && note.querySelector('button')),
      controlLabel: note && note.querySelector('button') ? note.querySelector('button').textContent : '',
      rows, displayed: document.getElementById('a9-turn-outcome').textContent,
    };
  })()`);

  const latestTerminal = latestTerminalEvent(queryEvents);
  const olderFailureEvent = queryEvents.find((event) => event.type === 'turn_failed') || null;
  const newerSuccessEvent = queryEvents.filter((event) => event.type === 'turn_completed'
    && event.outcome === 'completed' && event.verification === 'verified').pop() || null;
  const expectedOutcome = expectedDisplayed(latestTerminal);
  const restartOutcomeOk = expectedOutcome === 'completed · verified' && observed.displayed === expectedOutcome;
  const olderLoadOutcomeOk = olderLoad.displayed === expectedOutcome;
  const olderLoadMode = restoredEvents.paging && restoredEvents.paging.controlConsumed
    ? 'CLICKED_LOAD_MORE' : 'FULL_HISTORY_ALREADY_LOADED';
  const latestTurnId = latestTerminal ? latestTerminal.turn_id : null;
  const restartTerminalOk = Boolean(latestTerminal) && Boolean(newerSuccessEvent)
    && latestTerminal.event_id === newerSuccessEvent.event_id
    && terminalRowOutcomeMatches(observed.rows, newerSuccessEvent.event_id, newerSuccessEvent.turn_id);
  // F1：DOM 附件必须保留实际显示结果与最新持久化 turn 身份，且与查询最新终态、snapshot 事实一致。
  const domOutcomeIdentityOk = observed.displayed === expectedOutcome
    && (observed.latestTurnId || null) === (latestTurnId || null);
  record('A9-15-DOM-OUTCOME-TURN-IDENTITY', domOutcomeIdentityOk && restartOutcomeOk, JSON.stringify({
    displayed: observed.displayed, expectedOutcome, domLatestTurnId: observed.latestTurnId || null,
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
    displayed: observed.displayed, expectedOutcome, olderRowPresent, restartTerminalOk,
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
  const domExport = (stage, conversationId, rows, displayedOutcome, latestPersistedTurnId, extra) => ({
    schema_version: DOM_EXPORT_SCHEMA_VERSION, kind: DOM_EXPORT_KIND, stage,
    conversation_id: conversationId,
    display_range: { rule: INSPECTOR_DISPLAY_RULE, max_rows: INSPECTOR_DISPLAY_ROWS, rows_total: (rows || []).length },
    rows: exportRows(rows), displayed_outcome: displayedOutcome,
    latest_persisted_turn_id: latestPersistedTurnId, checked_at: new Date().toISOString(), ...(extra || {}),
  });
  const domReference = writeArtifact('projection-dom-export.json', domExport(
    'restart', restoredEvents.conversationId, observed.rows, observed.displayed, observed.latestTurnId || null));
  const otherReference = writeArtifact('projection-dom-other-conversation.json', domExport(
    'other_conversation', sessionSwitch.otherConversationId || '', sessionSwitch.otherRows,
    sessionSwitch.otherDisplayed || '', null));
  const resumeReference = writeArtifact('projection-dom-resume.json', domExport(
    'resume', restoredEvents.conversationId, sessionSwitch.resumeRows, sessionSwitch.resumeDisplayed || '',
    observed.latestTurnId || null));
  const olderLoadReference = writeArtifact('projection-dom-after-older-load.json', domExport(
    'older_load', restoredEvents.conversationId, olderLoad.rows, olderLoad.displayed,
    observed.latestTurnId || null, { older_load_mode: olderLoadMode }));
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
          restart_displayed_outcome: observed.displayed,
          older_event_load_displayed_outcome: olderLoad.displayed,
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
              ? null : String(payloadData.error).slice(0, ${MAX_ERROR_HEAD}),
            tool_name: payloadData.toolName === undefined ? null : String(payloadData.toolName),
            decision: payloadData.decision === undefined ? null : String(payloadData.decision),
            denied: payloadData.denied === true,
            has_error: payloadData.error !== undefined && payloadData.error !== null,
            shell_has_exit_code: Boolean(shell && shell.exitCode !== undefined),
            shell_exit_code: shell && Number.isFinite(shell.exitCode) ? shell.exitCode : null,
            call_id: payloadData.callId === undefined ? null : String(payloadData.callId),
            step: Number.isSafeInteger(payloadData.step) ? payloadData.step : null,
            args: {
              path: bounded(args.path, ${MAX_ARGS_FIELD}), pattern: bounded(args.pattern, ${MAX_ARGS_FIELD}),
              source: bounded(args.source, ${MAX_ARGS_FIELD}), destination: bounded(args.destination, ${MAX_ARGS_FIELD}),
              command: bounded(args.command, ${MAX_COMMAND}),
            },
          },
        };
      }),
    };
  })()`);
  record('A9-15-HISTORY-RESTART-EVENTS', restoredEvents.count > 0 && restoredEvents.unique && restoredEvents.ordered &&
    (!requireModelNotes || restoredEvents.modelNotes > 0), JSON.stringify({ ...restoredEvents, events: undefined }));



  // F4：旧失败必须位于首次查询范围之外，并经真实 beforeEventId 分页加载。
  let pagingFacts = { ok: false, reason: 'NOT_PROJECTION' };
  if (projectionEnabled) {
    pagingFacts = await exec(`(async () => {
      const api = window.win7Agent.a9;
      const current = (await api.snapshot()).snapshot;
      const conversationId = current.activeConversationId;
      const first = await api.queryEvents({ conversationId, limit: ${PRODUCT_FIRST_QUERY_LIMIT} });
      if (!first || first.ok !== true) return { ok: false, reason: 'FIRST_QUERY_FAILED' };
      const firstEvents = first.events || [];
      const firstPageOldestId = firstEvents.length ? firstEvents[0].eventId : null;
      const note = document.querySelector('#a9-task-stream .legacy-note');
      const button = note ? note.querySelector('button') : null;
      const beforeLabel = button ? button.textContent : '';
      const beforeVisible = Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => Number(item.dataset.eventId));
      if (!button || button.disabled) {
        return { ok: false, reason: 'NO_LOAD_MORE_CONTROL', firstPageLimit: ${PRODUCT_FIRST_QUERY_LIMIT},
          firstPageCount: firstEvents.length, firstPageHasMore: first.hasMore === true, firstPageOldestId };
      }
      // 真实点击产品"加载更早记录"入口，按产品自身的 beforeEventId 游标逐页加载，直到无法继续或
      // 找到旧失败终态。旧失败可能位于首屏之后很远的页，单页加载不足以证明补载。
      const pages = [];
      let olderFailure = null;
      let controlConsumed = false;
      let cursor = firstPageOldestId;
      let afterVisible = beforeVisible;
      let afterLabel = beforeLabel;
      for (let round = 0; round < 12; round += 1) {
        const roundNote = document.querySelector('#a9-task-stream .legacy-note');
        const roundButton = roundNote ? roundNote.querySelector('button') : null;
        if (!roundButton || roundButton.disabled) { afterLabel = roundButton ? roundButton.textContent : ''; break; }
        const label = roundButton.textContent;
        const visibleBefore = Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => Number(item.dataset.eventId));
        roundButton.click();
        let changed = false;
        for (let attempt = 0; attempt < 200; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          afterVisible = Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => Number(item.dataset.eventId));
          const nowNote = document.querySelector('#a9-task-stream .legacy-note');
          const nowLabel = nowNote && nowNote.querySelector('button') ? nowNote.querySelector('button').textContent : '';
          afterLabel = nowLabel;
          changed = !nowNote || nowLabel !== label || JSON.stringify(afterVisible) !== JSON.stringify(visibleBefore);
          if (changed) break;
        }
        controlConsumed = controlConsumed || changed;
        // 用该轮真实游标经官方 IPC 取回同一页，记录响应范围与页内旧失败身份。
        const page = cursor === null ? null
          : await api.queryEvents({ conversationId, limit: ${PRODUCT_FIRST_QUERY_LIMIT}, beforeEventId: cursor });
        const batch = (page && page.ok === true && page.events) ? page.events : [];
        const ids = batch.map((event) => event.eventId);
        const found = batch.find((event) => (event.eventType || event.type) === 'turn_failed') || null;
        pages.push({
          round, before_event_id: cursor, count: ids.length,
          first_id: ids.length ? ids[0] : null, last_id: ids.length ? ids[ids.length - 1] : null,
          has_more: page && page.hasMore === true, ok: page && page.ok === true, has_older_failure: Boolean(found),
        });
        if (found && !olderFailure) olderFailure = found;
        if (!(page && page.ok === true) || !ids.length) break;
        cursor = ids[0];
        if (olderFailure) break;
      }
      const allPageIds = pages.flatMap((item) => (item.first_id === null ? [] : [item.first_id, item.last_id]));
      const lastPage = pages.length ? pages[pages.length - 1] : null;
      return {
        ok: true, conversationId, firstPageLimit: ${PRODUCT_FIRST_QUERY_LIMIT}, firstPageCount: firstEvents.length,
        firstPageHasMore: first.hasMore === true, firstPageOldestId, beforeEventId: firstPageOldestId,
        beforeLabel, afterLabel, controlConsumed, hadTruncatedNote: true, pageRounds: pages.length,
        beforeVisibleCount: beforeVisible.length, afterVisibleCount: afterVisible.length,
        pages,
        pageCount: pages.reduce((sum, item) => sum + (item.count || 0), 0),
        pageHasMore: lastPage ? lastPage.has_more === true : false,
        pageFirstId: lastPage ? lastPage.first_id : null,
        pageLastId: lastPage ? lastPage.last_id : null,
        pageEventIds: allPageIds.filter((id) => Number.isSafeInteger(id)).slice(0, 400),
        pageHasOlderFailure: Boolean(olderFailure),
        pageOlderFailureId: olderFailure ? olderFailure.eventId : null,
        firstPageExcludesOlderFailure: olderFailure
          ? !firstEvents.some((event) => event.eventId === olderFailure.eventId) : false,
      };
    })()`);
  }
  record('A9-15-PAGING-PROBE-FACTS', projectionEnabled ? pagingFacts.ok === true : true, JSON.stringify(pagingFacts));


  // F3：历史查询失败后可见重试。通过 main() 在加载产品入口前安装的 ipcMain.handle 包装，对事件查询
  // 通道注入**一次**结构化失败（注入点：IPC 主进程边界；证据等级：测试替身，非真实 OS/DB 故障），
  // 随后通过产品真实"重试加载"入口恢复，并核对重试后事件不重复；不修改冻结源码、守卫或清理保证。
  let retryFacts = { ok: false, reason: 'NOT_PROJECTION' };
  if (projectionEnabled) {
    const beforeRetry = await exec(`(() => {
      const note = document.querySelector('#a9-task-stream .legacy-note');
      const button = note ? note.querySelector('button') : null;
      return { hasNote: Boolean(note), label: button ? button.textContent : '', disabled: button ? button.disabled : null };
    })()`);
    injectQueryFailureOnce = true;
    injectedQueryFailure = null;
    // 控制器已被 F4 分页探针用尽；此处走 eventsError 路径——真实重新加载失败时同样渲染重试入口。
    const errorState = await exec(`(async () => {
      const labelOf = () => {
        const note = document.querySelector('#a9-task-stream .legacy-note');
        const button = note ? note.querySelector('button') : null;
        return button ? button.textContent : '';
      };
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await window.win7AgentA9Workbench.refreshSnapshot();
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (labelOf() === '重试加载') return { ok: true, attempts: attempt + 1 };
      }
      return { ok: false, reason: 'NO_RETRY_AFFORDANCE', label: labelOf() };
    })()`);
    const errorVisible = errorState.ok === true;
    injectQueryFailureOnce = false;
    const clickedRetry = await exec(`(() => {
      const note = document.querySelector('#a9-task-stream .legacy-note');
      const button = note ? note.querySelector('button') : null;
      if (button) button.click();
      return Boolean(button);
    })()`);
    const recoveredState = await waitFor(() => exec(`(() => {
      const note = document.querySelector('#a9-task-stream .legacy-note');
      const button = note ? note.querySelector('button') : null;
      const label = button ? button.textContent : '';
      return label !== '重试加载' ? { label, noteGone: !note } : null;
    })()`), 60_000, 'retry recovers').catch(() => null);
    // 回到原会话：轮询直到 Inspector 重新出现行且截断控件回到"加载更早记录"，供 F4 分页探针使用。
    const afterRetry = await exec(COLLECT_ALL_EVENTS);
    const afterIds = afterRetry.ids || [];
    retryFacts = {
      ok: true, beforeRetry, errorState, errorVisible, clickedRetry,
      recovered: Boolean(recoveredState), afterLabel: recoveredState ? recoveredState.label : '',
      injectedFailure: injectedQueryFailure, injectedCount: injectedQueryFailure ? 1 : 0,
      countAfterRetry: afterIds.length, uniqueAfterRetry: new Set(afterIds).size === afterIds.length,
      injectionPoint: 'IPC_MAIN_HANDLE_SINGLE_SHOT_WRAPPER',
      evidenceLevel: 'TEST_DOUBLE_NOT_REAL_OS_FAILURE',
    };
  }
  record('A9-15-QUERY-FAILURE-VISIBLE-RETRY',
    projectionEnabled && retryFacts.ok === true && retryFacts.injectedCount === 1
    && retryFacts.errorVisible === true && retryFacts.recovered === true && retryFacts.uniqueAfterRetry === true,
  JSON.stringify(retryFacts));
  restoredEvents.retry = retryFacts;

  restoredEvents.paging = pagingFacts;
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
