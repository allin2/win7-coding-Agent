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
const INSPECTOR_DISPLAY_RULE = 'LAST_60_BY_EVENT_ID_ASC';
const INSPECTOR_DISPLAY_ROWS = 60;
const INSPECTOR_DISPLAY_LABEL = '60';
const QUERY_EXPORT_KIND = 'A9_PROJECTION_QUERY_EXPORT';
const DOM_EXPORT_KIND = 'A9_PROJECTION_DOM_EXPORT';

// 查询导出用 snake_case（event_id/turn_id），DOM 观察值用 camelCase（eventId/turnId），
// 断言统一经这两个访问器读取，避免两侧命名差异造成假阴性。
function eventIdOf(event) { return event ? (event.eventId !== undefined ? event.eventId : event.event_id) : undefined; }
function turnIdOf(event) { return event ? (event.turnId !== undefined ? event.turnId : event.turn_id) : null; }

/**
 * 纯观察值断言：正负向敏感性检查共用同一实现，避免负向检查复刻另一套判定。
 * 逐行要求 event ID、turn ID 与查询导出的有界显示范围完全一致（内容、顺序、去重）。
 */
function inspectorRowsMatchQuery(rows, events) {
  if (!Array.isArray(rows) || !Array.isArray(events)) return false;
  const expected = events.slice(-INSPECTOR_DISPLAY_ROWS);
  if (rows.length !== expected.length) return false;
  const seen = new Set();
  for (let index = 0; index < expected.length; index += 1) {
    const row = rows[index];
    const event = expected[index];
    if (!row || row.eventId !== eventIdOf(event)) return false;
    if ((row.turnId || null) !== (turnIdOf(event) || null)) return false;
    if (typeof row.text !== 'string' || !row.text.trim()) return false;
    if (seen.has(row.eventId)) return false;
    seen.add(row.eventId);
  }
  return true;
}
function terminalRowOutcomeMatches(rows, terminalEventId, terminalTurnId) {
  if (!Array.isArray(rows)) return false;
  const terminals = rows.filter((row) => row && row.eventType && row.eventType.startsWith('turn_'));
  if (!terminals.length) return false;
  const newest = terminals.reduce((a, b) => (b.eventId > a.eventId ? b : a));
  return newest.eventId === terminalEventId && (newest.turnId || null) === (terminalTurnId || null);
}
function hasCrossSessionResidue(rows, allowedEventIds) {
  if (!Array.isArray(rows)) return true;
  const allowed = new Set(allowedEventIds || []);
  return rows.some((row) => !row || !allowed.has(row.eventId));
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
/**
 * 负向敏感性检查：对真实观察值的副本做缺行、乱序、重复与跨会话残留变异，
 * 每一种变异都必须被同一断言拒绝；不改动产品与冻结源码。
 */
function negativeSensitivity(rows, events) {
  const baseline = inspectorRowsMatchQuery(rows, events);
  const missing = Array.isArray(rows) && rows.length ? rows.slice(0, -1) : [];
  const reordered = Array.isArray(rows) ? rows.slice() : [];
  if (reordered.length > 1) { const swap = reordered[0]; reordered[0] = reordered[1]; reordered[1] = swap; }
  const duplicated = Array.isArray(rows) && rows.length ? [rows[0], ...rows] : [];
  const residue = Array.isArray(rows) && rows.length
    ? [...rows, { eventId: -1, turnId: null, eventType: 'turn_failed', text: 'foreign conversation row' }]
    : [];
  return {
    baseline,
    missingRowRejected: !inspectorRowsMatchQuery(missing, events),
    reorderRejected: reordered.length > 1 ? !inspectorRowsMatchQuery(reordered, events) : false,
    duplicateRejected: !inspectorRowsMatchQuery(duplicated, events),
    residueRejected: hasCrossSessionResidue(residue, events.map(eventIdOf)),
  };
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
  // R3：审批决定必须先于恢复后的模型/工具活动，且拒绝只被消费一次。
  const approvalDecisionId = approvalHistory.deniedIds.length ? Math.max(...approvalHistory.deniedIds) : 0;
  record('A9-15-APPROVAL-ORDER-BEFORE-RESUME',
    approvalHistory.requiredIds.length >= 1 && approvalHistory.deniedIds.length === 1 &&
    approvalHistory.requiredIds.every((id) => id < approvalDecisionId) &&
    approvalHistory.laterActivities.every((item) => item.eventId > approvalDecisionId),
  JSON.stringify({ requiredIds: approvalHistory.requiredIds, approvalDecisionId, laterActivities: approvalHistory.laterActivities }));
  // R3：拒绝必须零目标副作用——高影响删除目标在接受拒绝后仍然存在。
  const denyTargetPath = path.join(env.workspaceRoot, 'scratch.tmp');
  record('A9-15-DENY-ZERO-TARGET-SIDE-EFFECT', fs.existsSync(denyTargetPath), `exists=${fs.existsSync(denyTargetPath)} path=${denyTargetPath}`);

  // 首进程退出前再形成真实 mutation + verification 成功轮次，使重启链路的持久化顺序为
  // 旧 failed/not_applicable → 新 completed/verified，而不是审批拒绝作为最新事实。
  // legacy 协议跳过该段，历史 profile 的 fixture 不为该提示词提供服务。
  if (projectionEnabled) {
    await exec(`(() => { const prompt = document.getElementById("task-prompt"); prompt.value = ${JSON.stringify(PROJECTION_LATEST_SUCCESS_PROMPT)}; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()`);
    const latestDisplayed = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t === 'completed · verified' ? t : null)), 90_000, 'latest verified outcome');
    const latestTurn = await exec('(window.win7Agent.a9.snapshot()).then(r => { const facts = r.snapshot.conversation || []; return facts[facts.length - 1]; })');
    const projectionSeed = await exec(`(async () => {
      const snapshot = (await window.win7Agent.a9.snapshot()).snapshot;
      const queried = await window.win7Agent.a9.queryEvents({ conversationId: snapshot.activeConversationId, limit: 1000 });
      const events = queried.events || [];
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

const CONTENT_KEYWORDS = {
  turn_started: '任务开始', turn_completed: '任务完成', turn_failed: '任务失败', model_note: '模型说明',
};

/**
 * ADR-0120 投影验收（仅在 A9_SMOKE_DRIVER_PROTOCOL=projection 时执行）。
 * 1) 按 Inspector 有界显示范围逐行核对内容、顺序、去重与身份；
 * 2) 对观察值副本做缺行、乱序、重复、跨会话残留负向检查，全部必须被拒绝；
 * 3) 切换会话不得残留上一会话内容，切回后逐行复原；
 * 4) 旧事件补载后全局结果仍绑定最新持久化轮次；
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

  const rowMatch = inspectorRowsMatchQuery(observed.rows, queryEvents);
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
  }));

  const contentMismatch = observed.rows.find((row) => {
    const keyword = CONTENT_KEYWORDS[row.eventType];
    return keyword ? !String(row.text).includes(keyword) : false;
  });
  record('A9-15-INSPECTOR-ROW-CONTENT', !contentMismatch, JSON.stringify({
    checked: observed.rows.length, firstMismatch: contentMismatch || null,
  }));

  const negative = negativeSensitivity(observed.rows, queryEvents);
  record('A9-15-INSPECTOR-ASSERTION-NEGATIVE-CHECKS', negative.baseline === true
    && negative.missingRowRejected === true && negative.reorderRejected === true
    && negative.duplicateRejected === true && negative.residueRejected === true,
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
    && !sessionSwitch.otherRows.some((row) => queryEventIds.includes(row.eventId));
  record('A9-15-INSPECTOR-SESSION-SWITCH-NO-RESIDUE',
    sessionSwitch.ok === true && otherDifference && noResidue && resumeMatch
    && sessionSwitch.resumeDisplayed === observed.displayed,
  JSON.stringify({
    ok: sessionSwitch.ok, code: sessionSwitch.code || '', switches: sessionSwitch.switches,
    otherConversationId: sessionSwitch.otherConversationId, otherRows: rowIds(sessionSwitch.otherRows),
    resumeRows: rowIds(sessionSwitch.resumeRows), otherDifference, noResidue, resumeMatch,
    resumeDisplayed: sessionSwitch.resumeDisplayed, displayed: observed.displayed,
  }));

  // 旧事件补载：若产品仍提供「加载更早记录/重试加载」，点击并重新导出；否则确认完整历史已载入。
  const olderLoad = await exec(`(async () => {
    const note = document.querySelector('#a9-task-stream .legacy-note');
    const button = note ? note.querySelector('button') : null;
    const before = Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => Number(item.dataset.eventId));
    if (button && !button.disabled) button.click();
    let after = before.slice();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      after = Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => Number(item.dataset.eventId));
      if (JSON.stringify(after) !== JSON.stringify(before)) break;
    }
    const rows = Array.from(document.querySelectorAll('#a9-timeline li')).map((item) => ({
      eventId: Number(item.dataset.eventId), turnId: item.dataset.turnId || null,
      eventType: item.dataset.eventType || null, text: item.textContent,
    }));
    return {
      hasControl: Boolean(button), controlLabel: button ? button.textContent : '',
      mode: button ? 'CLICKED_LOAD_MORE' : 'FULL_HISTORY_ALREADY_LOADED',
      before, after, rows, displayed: document.getElementById('a9-turn-outcome').textContent,
    };
  })()`);

  const terminalTypes = ['turn_completed', 'turn_failed', 'turn_cancelled', 'turn_interrupted', 'turn_blocked'];
  const terminals = queryEvents.filter((event) => terminalTypes.includes(event.type));
  const olderFailureEvent = queryEvents.find((event) => event.type === 'turn_failed') || null;
  const newerSuccessEvent = terminals.filter((event) => event.type === 'turn_completed'
    && event.outcome === 'completed' && event.verification === 'verified').pop() || null;
  const latestTerminalEvent = terminals.length
    ? terminals.reduce((a, b) => (b.event_id > a.event_id ? b : a)) : null;
  const expectedOutcome = latestTerminalEvent
    ? `${latestTerminalEvent.outcome} · ${latestTerminalEvent.verification}` : '';
  const restartOutcomeOk = expectedOutcome === 'completed · verified' && observed.displayed === expectedOutcome;
  const olderLoadOutcomeOk = olderLoad.displayed === expectedOutcome;
  const olderRowPresent = olderFailureEvent
    ? olderLoad.rows.some((row) => row.eventId === olderFailureEvent.event_id) : false;
  const restartTerminalOk = latestTerminalEvent && newerSuccessEvent
    && latestTerminalEvent.event_id === newerSuccessEvent.event_id
    && terminalRowOutcomeMatches(observed.rows, newerSuccessEvent.event_id, newerSuccessEvent.turn_id);
  record('A9-15-OLDER-FAILURE-NEWER-SUCCESS-RESTART',
    Boolean(olderFailureEvent) && Boolean(newerSuccessEvent) && olderFailureEvent.event_id < newerSuccessEvent.event_id
    && olderFailureEvent.turn_id !== newerSuccessEvent.turn_id
    && olderFailureEvent.turn_id === expectedProjection.oldFailureTurnId
    && newerSuccessEvent.turn_id === expectedProjection.latestSuccessTurnId
    && restartOutcomeOk && olderLoadOutcomeOk && olderRowPresent && Boolean(restartTerminalOk)
    && (olderLoad.mode === 'FULL_HISTORY_ALREADY_LOADED'
      || canonical(olderLoad.before) !== canonical(olderLoad.after)
      || olderLoad.rows.length === expectedRowCount),
  JSON.stringify({
    olderFailure: olderFailureEvent, newerSuccess: newerSuccessEvent, latestTerminal: latestTerminalEvent,
    displayed: observed.displayed, expectedOutcome, olderLoad: {
      mode: olderLoad.mode, hasControl: olderLoad.hasControl, controlLabel: olderLoad.controlLabel,
      displayed: olderLoad.displayed, rows: rowIds(olderLoad.rows), changed: canonical(olderLoad.before) !== canonical(olderLoad.after),
    },
    olderRowPresent, restartTerminalOk,
  }));

  const artifacts = [];
  // 机器可读 DOM 导出行使用报告器约定的 snake_case 字段；内部观察值仍是 camelCase。
  // 两者命名必须在此显式转换，否则真实候选的投影附件无法被报告器解析（ADR-0120 R1）。
  const exportRows = (rows) => (Array.isArray(rows) ? rows.map((row) => ({
    event_id: row.eventId,
    turn_id: row.turnId === undefined ? null : row.turnId,
    event_type: row.eventType === undefined ? null : row.eventType,
    text: row.text,
  })) : []);
  const writeArtifact = (name, payload) => {
    const filePath = writeProjectionExport(name, payload);
    if (!filePath) return null;
    const reference = { path: name, sha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') };
    artifacts.push(reference);
    return reference;
  };
  const queryReference = writeArtifact('projection-query-export.json', {
    schema_version: 1, kind: QUERY_EXPORT_KIND, conversation_id: restoredEvents.conversationId,
    query: { limit: 1000, before_event_id: null, has_more: false },
    events: queryEvents,
  });
  const domReference = writeArtifact('projection-dom-export.json', {
    schema_version: 1, kind: DOM_EXPORT_KIND, conversation_id: restoredEvents.conversationId,
    display_range: { rule: INSPECTOR_DISPLAY_RULE, max_rows: INSPECTOR_DISPLAY_ROWS, rows_total: observed.rows.length },
    rows: exportRows(observed.rows), displayed_outcome: observed.displayed,
    latest_persisted_turn_id: observed.latestTurnId || null, checked_at: new Date().toISOString(),
  });
  const otherReference = writeArtifact('projection-dom-other-conversation.json', {
    schema_version: 1, kind: DOM_EXPORT_KIND, conversation_id: sessionSwitch.otherConversationId || '',
    display_range: { rule: INSPECTOR_DISPLAY_RULE, max_rows: INSPECTOR_DISPLAY_ROWS, rows_total: (sessionSwitch.otherRows || []).length },
    rows: exportRows(sessionSwitch.otherRows), displayed_outcome: sessionSwitch.otherDisplayed || '',
    latest_persisted_turn_id: null, checked_at: new Date().toISOString(),
  });
  const resumeReference = writeArtifact('projection-dom-resume.json', {
    schema_version: 1, kind: DOM_EXPORT_KIND, conversation_id: restoredEvents.conversationId,
    display_range: { rule: INSPECTOR_DISPLAY_RULE, max_rows: INSPECTOR_DISPLAY_ROWS, rows_total: (sessionSwitch.resumeRows || []).length },
    rows: exportRows(sessionSwitch.resumeRows), displayed_outcome: sessionSwitch.resumeDisplayed || '',
    latest_persisted_turn_id: observed.latestTurnId || null, checked_at: new Date().toISOString(),
  });
  const olderLoadReference = writeArtifact('projection-dom-after-older-load.json', {
    schema_version: 1, kind: DOM_EXPORT_KIND, conversation_id: restoredEvents.conversationId,
    display_range: { rule: INSPECTOR_DISPLAY_RULE, max_rows: INSPECTOR_DISPLAY_ROWS, rows_total: olderLoad.rows.length },
    rows: exportRows(olderLoad.rows), displayed_outcome: olderLoad.displayed,
    latest_persisted_turn_id: observed.latestTurnId || null,
    older_load_mode: olderLoad.mode, checked_at: new Date().toISOString(),
  });
  const evidencePackage = {
    schema_version: 1,
    kind: 'A9_W27_PROJECTION_EVIDENCE_PACKAGE',
    conversation_id: restoredEvents.conversationId,
    instructions: '把 projection-*.json 复制到候选外 evidence-root 根目录，并按原样粘贴下列两个 projection_evidence 块；artifacts 即该两个用例 evidence 列表中必须包含的路径与 SHA-256。',
    artifacts,
    results: {
      'W27-03-INSPECTOR-PERSISTED-RESTART': {
        projection_evidence: {
          query_export: queryReference, dom_export: domReference,
          session_switch: { other_conversation_export: otherReference, resume_export: resumeReference },
        },
      },
      'W27-09-LATEST-OUTCOME-PROJECTION': {
        projection_evidence: {
          query_export: queryReference, dom_export: domReference,
          dom_export_after_older_load: olderLoadReference, older_load_mode: olderLoad.mode,
          older_failure: olderFailureEvent
            ? { event_id: olderFailureEvent.event_id, turn_id: olderFailureEvent.turn_id } : null,
          newer_success: newerSuccessEvent
            ? { event_id: newerSuccessEvent.event_id, turn_id: newerSuccessEvent.turn_id } : null,
          restart_displayed_outcome: observed.displayed,
          older_event_load_displayed_outcome: olderLoad.displayed,
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
    const current = (await window.win7Agent.a9.snapshot()).snapshot;
    const queried = await window.win7Agent.a9.queryEvents({ conversationId: current.activeConversationId, limit: 1000 });
    const events = queried.events || [];
    const ids = events.map((event) => event.eventId);
    const data = (event) => event.payload?.data || event.payload || event.data || {};
    return {
      conversationId: current.activeConversationId,
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
        return {
          event_id: event.eventId,
          turn_id: event.turnId || null,
          type: event.eventType || event.type,
          outcome: payloadData.outcome === undefined ? null : payloadData.outcome,
          verification: payloadData.verification === undefined ? null : payloadData.verification,
        };
      }),
    };
  })()`);
  record('A9-15-HISTORY-RESTART-EVENTS', restoredEvents.count > 0 && restoredEvents.unique && restoredEvents.ordered &&
    (!requireModelNotes || restoredEvents.modelNotes > 0), JSON.stringify({ ...restoredEvents, events: undefined }));
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
