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
 */

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog } = require('electron');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const productMain = path.join(repositoryRoot, 'src/shell/product/main.js');

const report = { status: 'RUNNING', mode: process.env.A9_SMOKE_MODE || 'first', cases: [] };
function record(id, passed, detail) {
  report.cases.push({ id, passed: passed === true, detail: detail || '' });
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
  if (mode === 'workspace_select') {
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
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    const image = await win.webContents.capturePage();
    fs.writeFileSync(screenshotPath, image.toPNG());
    record('A9F0-MODE-DIALOG-SCREENSHOT', fs.existsSync(screenshotPath), screenshotPath);
  }

  await exec('document.getElementById("a9-mode-apply").click(); true');
  const mode = await waitFor(() => exec('(window.win7Agent.a9.snapshot()).then(r => r.ok && r.snapshot.mode === "full_access" ? r.snapshot.mode : null)'), 15_000, 'full access selection');
  record('A9F0-FULL-ACCESS-SELECTION-PERSISTED', mode === 'full_access', `mode=${mode}`);

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

  // 真实工具旅程：read → edit → shell（真实测试命令）→ verified。
  await exec('(() => { const prompt = document.getElementById("task-prompt"); prompt.value = "fix the bug and verify"; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()');
  const outcome = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t.includes('completed') && t.includes('verified') ? t : null)), 90_000, 'turn outcome');
  const fileFixed = fs.readFileSync(path.join(env.workspaceRoot, 'calc.ts'), 'utf8').includes('a + b');
  record('A9F1-TOOL-JOURNEY', Boolean(outcome) && fileFixed, `outcome=${outcome}`);

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
    };
  })()`), 90_000, 'approval card');
  const approvalValid = approval && (approval.summary.includes('permanent') || approval.summary.includes('git')) &&
    approval.approvalId.length > 0 && approval.digest && approval.digest.length === 64;
  record('A9F1-APPROVAL-CARD-TRUE-TARGET', approvalValid === true, JSON.stringify(approval));
  report.oldApproval = approval ? { approvalId: approval.approvalId, bindingDigest: approval.digest } : null;

  // Renderer 只证明拒绝完成；目标文件事实由宿主进程在 Electron 退出后直接检查。
  await exec('document.getElementById("a9-approval-deny").click(); true');
  await waitFor(() => exec('document.getElementById("a9-approval-card").hidden === true'), 15_000, 'approval card closed');
  const afterDeny = await exec('(() => { const s = document.getElementById("a9-turn-outcome").textContent; return s; })()');
  record('A9F1-APPROVAL-DENY-OUTCOME', afterDeny.includes('blocked') || afterDeny.includes('completed') || afterDeny.includes('needs_approval'), `outcome=${afterDeny}`);

  // checkpoint 事实落库（真实 SQLite；first 进程退出前保留）。
  const snapshot = await exec('(window.win7Agent.a9.snapshot()).then(r => ({ mode: r.snapshot.mode, provider: r.snapshot.provider.configured, model: r.snapshot.provider.model, checkpoints: r.snapshot.checkpoints.length }))');
  record('A9F1-SNAPSHOT-FACTS', snapshot.mode === 'full_access' && snapshot.provider === true && snapshot.model === 'smoke-manual-model' && snapshot.checkpoints >= 1, JSON.stringify(snapshot));
}

async function runSecondProcess(win, exec, env) {
  // 重启恢复：模式、Provider 配置与 checkpoint 从同一 dataRoot 恢复。
  const snapshot = await waitFor(() => exec('(window.win7Agent.a9.snapshot()).then(r => r.snapshot)'), 15_000, 'snapshot');
  record('A9F2-RESTORE-MODE', snapshot.mode === 'full_access', `mode=${snapshot.mode}`);
  record('A9F2-RESTORE-PROVIDER', snapshot.provider && snapshot.provider.configured === true && snapshot.provider.model === 'smoke-manual-model', `model=${snapshot.provider && snapshot.provider.model}`);
  record('A9F2-RESTORE-CHECKPOINT', (snapshot.checkpoints || []).length >= 1, `checkpoints=${(snapshot.checkpoints || []).length}`);
  // 真实中断恢复：first 进程已 checkpoint 后退出，无 active 任务 → 无 interrupted 伪造。
  record('A9F2-NO-SPURIOUS-INTERRUPTION', Array.isArray(snapshot.interruptions) && snapshot.interruptions.length === 0, `interruptions=${JSON.stringify(snapshot.interruptions)}`);
  // 不自动重放：时间线为空。
  record('A9F2-NO-REPLAY-TIMELINE', Array.isArray(snapshot.timeline) && snapshot.timeline.length === 0, `timeline=${snapshot.timeline.length}`);
  // 旧审批不可执行：无挂起审批却恢复 → 结构化拒绝（不新增实体、零副作用）。
  const oldApproval = {
    approvalId: process.env.A9_SMOKE_OLD_APPROVAL_ID,
    bindingDigest: process.env.A9_SMOKE_OLD_APPROVAL_DIGEST,
  };
  const rejected = await exec(`(window.win7Agent.a9.resumeApproval(${JSON.stringify(oldApproval.approvalId)}, "approved", ${JSON.stringify(oldApproval.bindingDigest)})).then(r => ({ ok: r.ok, code: r.error && r.error.code }))`);
  record('A9F2-OLD-APPROVAL-REJECTED', rejected.ok === false && rejected.code === 'A9_APPROVAL_UNKNOWN', JSON.stringify(rejected));

  // 新 Turn 仍可执行（恢复的 Provider 已配置）；恢复请求由宿主按内容断言为全新会话。
  await exec('(() => { const prompt = document.getElementById("task-prompt"); prompt.value = "verify again"; prompt.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("run-task").click(); return true; })()');
  const outcome = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t.includes('completed') ? t : null)), 60_000, 'second turn outcome');
  record('A9F2-SECOND-TURN-WORKS', Boolean(outcome), `outcome=${outcome}`);
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
  await exec('document.getElementById("cancel-task").click(); true');
  const outcome = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t.includes('cancelled') ? t : null)), 45_000, 'cancelled outcome');
  const snapshot = await exec('(window.win7Agent.a9.snapshot()).then(r => r.snapshot)');
  record('A9F6-STOP-TURN-CANCELLED', Boolean(outcome) && snapshot.agentStatus === 'cancelled', `outcome=${outcome}; agentStatus=${snapshot.agentStatus}`);
}

app.whenReady().then(main).then(() => {
  fs.mkdirSync(path.dirname(process.env.A9_SMOKE_OUT), { recursive: true });
  fs.writeFileSync(process.env.A9_SMOKE_OUT, `${JSON.stringify(report, null, 2)}\n`);
  // 走真实 will-quit → a9RuntimeInstance.shutdown() → releaseWorkspaceLock 路径，
  // 让第二进程（真实重启）能获取同一工作区写锁；不能用 app.exit 跳过 will-quit。
  app.emit('will-quit');
  app.exit(report.status === 'PASS' ? 0 : 1);
}).catch((error) => {
  report.status = 'ERROR';
  report.error = String(error && error.stack ? error.stack : error);
  try { fs.writeFileSync(process.env.A9_SMOKE_OUT, `${JSON.stringify(report, null, 2)}\n`); } catch (_e) { /* best effort */ }
  try { app.emit('will-quit'); } catch (_e) { /* best effort */ }
  app.exit(1);
});
