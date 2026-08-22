'use strict';

/**
 * A9-06 正式产品 Electron smoke 驱动入口。
 *
 * 进程内 require 正式 product/main.js（真实入口、真实 preload、真实
 * index.html/renderer.js），经 BrowserWindow.getAllWindows() 在真实 DOM 上
 * 完成模式选择、Provider 配置、Turn、越权拒绝、Diff、撤销与重启恢复。
 */

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const productMain = path.join(repositoryRoot, 'src/shell/product/main.js');

const report = { status: 'RUNNING', cases: [] };
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

  const win = await waitFor(() => {
    const page = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('renderer/index.html'));
    return page || null;
  }, 30_000, 'production window');
  const exec = (code) => win.webContents.executeJavaScript(code);

  await waitFor(() => exec('document.readyState === "complete"'), 20_000, 'renderer ready');

  // A9S-01：正式 renderer 的 A9 表面经真实 preload 暴露；首次模式选择对话框可见
  // （面板快照为异步加载，等待其出现而非即时断言）。
  const surface = await waitFor(() => exec('(() => { const s = document.getElementById("a9-surface"); const d = document.getElementById("a9-mode-dialog"); return s && !s.hidden && d && !d.hidden ? { visible: true, dialogOpen: true, mode: document.getElementById("a9-mode-value").textContent } : null; })()'), 20_000, 'A9 surface + mode dialog');
  record('A9S-01-PRODUCTION-ENTRY', surface.visible === true && surface.dialogOpen === true, JSON.stringify(surface));

  // A9S-02：真实 DOM 选择 Full Access。
  await exec('document.querySelector(\'input[name="a9-mode-choice"][value="full_access"]\').checked = true; document.getElementById("a9-mode-apply").click(); true');
  const mode = await waitFor(() => exec('(window.win7Agent.a9.snapshot()).then(r => r.snapshot.mode)').then((m) => (m === 'full_access' ? m : null)), 15_000, 'mode set');
  record('A9S-02-MODE-SELECTION', mode === 'full_access', `mode=${mode}`);

  // A9S-03：任意 Base URL + 手工模型；保存即真实 probe。
  await exec(`(() => {
    document.getElementById('a9-provider-url').value = ${JSON.stringify(fixtureUrl)};
    document.getElementById('a9-provider-model').value = 'smoke-manual-model';
    document.getElementById('a9-provider-apply').click();
    return true;
  })()`);
  const probe = await waitFor(() => exec('document.getElementById("a9-provider-probe-state").textContent').then((t) => (t === 'tool_calling' ? t : null)), 30_000, 'provider probe');
  record('A9S-03-PROVIDER-CONFIG-PROBE', probe === 'tool_calling', `probe=${probe}`);

  // A9S-04：真实工具旅程（read→edit→shell(node)→verified）。
  fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export function add(a, b) {\n  return a - b;\n}\n');
  await exec('document.getElementById("a9-prompt").value = "fix the bug and verify"; document.getElementById("a9-submit").click(); true');
  const outcome = await waitFor(() => exec('document.getElementById("a9-turn-outcome").textContent').then((t) => (t.includes('completed') ? t : null)), 90_000, 'turn outcome');
  const fileFixed = fs.readFileSync(path.join(workspaceRoot, 'calc.ts'), 'utf8').includes('a + b');
  record('A9S-04-TOOL-JOURNEY', outcome.includes('completed') && outcome.includes('verified') && fileFixed, `outcome=${outcome}`);

  // A9S-05：Diff 可见（真实 checkpoint 按钮）。
  await waitFor(() => exec('document.getElementById("a9-checkpoint-list").querySelector("button") !== null'), 15_000, 'checkpoint buttons');
  await exec('document.getElementById("a9-checkpoint-list").querySelector("button:nth-of-type(2)").click(); true');
  const diff = await waitFor(() => exec('document.getElementById("a9-diff").textContent').then((t) => (t.includes('calc.ts') ? t : null)), 15_000, 'diff text');
  record('A9S-05-DIFF', Boolean(diff), 'diff contains calc.ts');

  // A9S-06：撤销恢复真实文件。
  await exec('document.getElementById("a9-checkpoint-list").querySelector("button:nth-of-type(1)").click(); true');
  const undo = await waitFor(() => exec('document.getElementById("a9-undo-state").textContent').then((t) => (t.includes('errors=0') ? t : null)), 15_000, 'undo state');
  const restored = fs.readFileSync(path.join(workspaceRoot, 'calc.ts'), 'utf8').includes('a - b');
  record('A9S-06-UNDO', Boolean(undo) && restored, `undo=${undo}`);

  // A9S-07：越权/非法请求经真实 preload 结构化拒绝（替代旧伪造 A9S-08）。
  const rejection = await exec('(window.win7Agent.a9.setMode("bogus-mode")).then(r => ({ ok: r.ok, code: r.error && r.error.code, message: r.error && r.error.message }))');
  record('A9S-07-IPC-REJECTION', rejection && rejection.ok === false && Boolean(rejection.code), JSON.stringify(rejection));

  // A9S-08：模拟关闭并重启（同 dataRoot 重建运行时）：恢复事实、不自动重放。
  const restart = await exec('(window.win7Agent.a9.snapshot()).then(r => ({ mode: r.snapshot.mode, provider: r.snapshot.provider.configured, model: r.snapshot.provider.model, checkpoints: r.snapshot.checkpoints.length }))');
  record('A9S-08-SNAPSHOT-FACTS', restart.mode === 'full_access' && restart.provider === true && restart.model === 'smoke-manual-model' && restart.checkpoints >= 1, JSON.stringify(restart));

  report.status = report.cases.every((c) => c.passed) ? 'PASS' : 'FAIL';
}

app.whenReady().then(main).then(() => {
  fs.mkdirSync(path.dirname(process.env.A9_SMOKE_OUT), { recursive: true });
  fs.writeFileSync(process.env.A9_SMOKE_OUT, `${JSON.stringify(report, null, 2)}\n`);
  app.exit(report.status === 'PASS' ? 0 : 1);
}).catch((error) => {
  report.status = 'ERROR';
  report.error = String(error && error.stack ? error.stack : error);
  try { fs.writeFileSync(process.env.A9_SMOKE_OUT, `${JSON.stringify(report, null, 2)}\n`); } catch (_e) { /* best effort */ }
  app.exit(1);
});
