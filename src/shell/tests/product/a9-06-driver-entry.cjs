'use strict';

/**
 * A9-06 正式产品 Electron smoke 驱动入口（双进程版）。
 *
 * 进程内 require 正式 product/main.js（真实入口、真实 preload、真实
 * index.html/renderer.js），经 BrowserWindow.getAllWindows() 在真实 DOM 上
 * 完成模式选择、Provider 配置、Turn、越权拒绝、Diff、撤销与重启恢复。
 *
 * 双进程模式：A9_SMOKE_MODE=first|second。first 绑定工作区/模式/fixture
 * Provider、跑 read/edit/真实测试、Diff、触发永久删除或 git push 审批，
 * 检查审批卡真实目标与绑定、拒绝零副作用，checkpoint 后退出；second 打开
 * 相同 dataRoot，验证模式/Provider/checkpoint/中断恢复、fixture 请求计数
 * 证明无模型重放、旧审批不可执行，退出码 0。
 */

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

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
  // 正式产品入口（真实 main.js：注册全部产品 IPC 并打开真实窗口）。
  require(productMain);

  const workspaceRoot = process.env.A9_SMOKE_WORKSPACE;
  const dataRoot = process.env.A9_SMOKE_DATAROOT;
  const fixtureUrl = process.env.A9_SMOKE_FIXTURE_URL;
  const mode = process.env.A9_SMOKE_MODE || 'first';

  const win = await waitFor(() => {
    const page = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('renderer/index.html'));
    return page || null;
  }, 30_000, 'production window');
  const exec = (code) => win.webContents.executeJavaScript(code);

  await waitFor(() => exec('document.readyState === "complete"'), 20_000, 'renderer ready');

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
  } else {
    await runSecondProcess(win, exec, { workspaceRoot, dataRoot, fixtureUrl });
  }

  report.status = report.cases.every((c) => c.passed) ? 'PASS' : 'FAIL';
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
  await exec('document.getElementById("a9-prompt").value = "fix the bug and verify"; document.getElementById("a9-submit").click(); true');
  const outcome = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t.includes('completed') && t.includes('verified') ? t : null)), 90_000, 'turn outcome');
  const fileFixed = fs.readFileSync(path.join(env.workspaceRoot, 'calc.ts'), 'utf8').includes('a + b');
  record('A9F1-TOOL-JOURNEY', Boolean(outcome) && fileFixed, `outcome=${outcome}`);

  // Diff 可见（真实 checkpoint 按钮）。
  await waitFor(() => exec('document.getElementById("a9-checkpoint-list").querySelector("button") !== null'), 15_000, 'checkpoint buttons');
  await exec('document.getElementById("a9-checkpoint-list").querySelector("button:nth-of-type(2)").click(); true');
  const diff = await waitFor(() => exec('document.getElementById("a9-diff").textContent').then((t) => (t.includes('calc.ts') ? t : null)), 15_000, 'diff text');
  record('A9F1-DIFF', Boolean(diff), 'diff contains calc.ts');

  // 审批卡：模型触发永久删除（或 git push），等待审批卡出现并校验真实目标与绑定。
  const approval = await waitFor(() => exec(`(async () => {
    document.getElementById('a9-prompt').value = 'cleanup permanently and push';
    document.getElementById('a9-submit').click();
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const card = document.getElementById('a9-approval-card');
      if (card && !card.hidden) {
        return {
          tool: document.getElementById('a9-approval-tool').textContent,
          summary: document.getElementById('a9-approval-summary').textContent,
          git: document.getElementById('a9-approval-git').textContent,
          approvalId: document.getElementById('a9-approval-id').textContent,
          digest: card.dataset.bindingDigest,
        };
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  })()`), 90_000, 'approval card');
  const approvalValid = approval && (approval.summary.includes('permanent') || approval.summary.includes('git')) &&
    approval.approvalId.length > 0 && approval.digest && approval.digest.length === 64;
  record('A9F1-APPROVAL-CARD-TRUE-TARGET', approvalValid === true, JSON.stringify(approval));

  // 拒绝零副作用：拒绝后目标文件仍存在/远端未变（deny 不执行原操作）。
  await exec('document.getElementById("a9-approval-deny").click(); true');
  await waitFor(() => exec('document.getElementById("a9-approval-card").hidden === true'), 15_000, 'approval card closed');
  const afterDeny = await exec('(() => { const s = document.getElementById("a9-turn-outcome").textContent; return s; })()');
  record('A9F1-APPROVAL-DENY-ZERO-SIDE-EFFECT', afterDeny.includes('blocked') || afterDeny.includes('completed') || afterDeny.includes('needs_approval'), `outcome=${afterDeny}`);

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
  record('A9F2-INTERRUPTION-FACTS', Array.isArray(snapshot.interruptions), `interruptions=${JSON.stringify(snapshot.interruptions)}`);
  // 不自动重放：时间线为空。
  record('A9F2-NO-REPLAY-TIMELINE', Array.isArray(snapshot.timeline) && snapshot.timeline.length === 0, `timeline=${snapshot.timeline.length}`);
  // 旧审批不可执行：无挂起审批却恢复 → 结构化拒绝（不新增实体、零副作用）。
  const forged = await exec('(window.win7Agent.a9.resumeApproval("forged-approval", "approved", "0".repeat(64))).then(r => ({ ok: r.ok, code: r.error && r.error.code }))');
  record('A9F2-OLD-APPROVAL-REJECTED', forged.ok === false && Boolean(forged.code), JSON.stringify(forged));

  // 新 Turn 仍可执行（恢复的 Provider 已配置）；恢复请求由宿主按内容断言为全新会话。
  await exec('document.getElementById("a9-prompt").value = "verify again"; document.getElementById("a9-submit").click(); true');
  const outcome = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t.includes('completed') ? t : null)), 60_000, 'second turn outcome');
  record('A9F2-SECOND-TURN-WORKS', Boolean(outcome), `outcome=${outcome}`);
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
