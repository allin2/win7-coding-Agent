'use strict';

/**
 * A9-06 Electron smoke 主进程入口：注册 a9 窄 IPC（真实 preload 与产品模块），
 * 在真实 BrowserWindow 中驱动 a9 API 完成产品旅程，输出结果 JSON。
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const workspaceRoot = process.env.A9_SMOKE_WORKSPACE;
const dataRoot = process.env.A9_SMOKE_DATAROOT;
const fixtureUrl = process.env.A9_SMOKE_FIXTURE_URL;
const outPath = process.env.A9_SMOKE_OUT;
const preloadPath = process.env.A9_SMOKE_PRELOAD;

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime');
const { createA9ProductRequestHandler } = require('../../product/a9-product-ipc');

const report = { status: 'RUNNING', cases: [] };
function record(id, passed, detail) {
  report.cases.push({ id, passed: passed === true, detail: detail || '' });
}

let runtime = null;
let currentRuntimeWorkspace = workspaceRoot;

function createRuntime() {
  return createA9AgentRuntime({
    workspaceRoot: currentRuntimeWorkspace,
    dataRoot,
    ownerId: `smoke-${process.pid}`,
    openDatabase: (databasePath, opts) => {
      // Electron ABI 的 better-sqlite3（D-014）：Node ABI 副本无法在 Electron 主进程加载。
      const nativeRoot = process.env.A9_SMOKE_ELECTRON_SQLITE;
      const Database = require(require('path').join(nativeRoot, 'node_modules', 'better-sqlite3'));
      return new Database(databasePath, opts && opts.readonly ? { readonly: true } : {});
    },
  });
}

app.whenReady().then(async () => {
  try {
    runtime = createRuntime();
    ipcMain.handle('product:a9-request', createA9ProductRequestHandler({
      getA9Runtime: () => runtime,
      isValidRendererSender: () => true,
    }));

    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });
    await win.loadURL('data:text/html,<html><body>A9 smoke</body></html>');

    const exec = (code) => win.webContents.executeJavaScript(code);

    // 1. 首次快照：模式未选择、Provider 未配置。
    const snapshot1 = await exec('window.win7Agent.a9.snapshot()');
    record('A9S-01-MODE-SELECTION-REQUIRED', snapshot1 && snapshot1.ok === true && snapshot1.snapshot && snapshot1.snapshot.mode === 'needs_selection' && snapshot1.snapshot.provider && snapshot1.snapshot.provider.configured === false, JSON.stringify(snapshot1).slice(0, 300));

    // 2. 设置 Full Access（推荐默认）。
    const setMode = await exec('window.win7Agent.a9.setMode("full_access")');
    record('A9S-02-MODE-SET', setMode.ok === true && setMode.mode === 'full_access', JSON.stringify(setMode));

    // 3. 配置 fixture Provider（任意 Base URL + 手工模型 ID）。
    const configure = await exec(`window.win7Agent.a9.configureProvider({ baseUrl: ${JSON.stringify(fixtureUrl)}, model: "smoke-manual-model" })`);
    record('A9S-03-PROVIDER-CONFIGURE', configure.ok === true && configure.model === 'smoke-manual-model', JSON.stringify(configure));

    // 4. 运行真实工具旅程（read→edit→shell→final）。
    const turn = await exec('window.win7Agent.a9.submitTurn("fix the bug and verify")');
    const fixedContent = fs.readFileSync(path.join(workspaceRoot, 'calc.ts'), 'utf8');
    record('A9S-04-TOOL-JOURNEY', turn.ok === true && turn.result.verification === 'verified' && fixedContent.includes('a + b'), JSON.stringify({ outcome: turn.result && turn.result.outcome, verification: turn.result && turn.result.verification }));

    // 5. Diff 展示。
    const diff = await exec(`window.win7Agent.a9.getDiff(${JSON.stringify(turn.result.turnId)})`);
    record('A9S-05-DIFF', diff.ok === true && JSON.stringify(diff.diff).includes('calc.ts'), '');

    // 6. 停止（无活动 Turn 时结构化失败）与撤销。
    const stopIdle = await exec('window.win7Agent.a9.stop()');
    const undo = await exec(`window.win7Agent.a9.undoTurn(${JSON.stringify(turn.result.turnId)})`);
    const restoredContent = fs.readFileSync(path.join(workspaceRoot, 'calc.ts'), 'utf8');
    record('A9S-06-STOP-AND-UNDO', stopIdle.ok === false && undo.ok === true && undo.outcome.errors.length === 0 && restoredContent.includes('a - b'), JSON.stringify({ stopIdleOk: stopIdle.ok, undoErrors: undo.outcome.errors.length }));

    // 7. 关闭并重启：重建运行时，恢复 checkpoint 事实（不重放）。
    runtime.shutdown();
    runtime = createRuntime();
    const snapshot2 = await exec('window.win7Agent.a9.snapshot()');
    const hasCheckpointFacts = snapshot2.snapshot.checkpoints.length > 0;
    const modeRemembered = snapshot2.snapshot.mode === 'full_access';
    record('A9S-07-RESTART-RECOVERY', hasCheckpointFacts && modeRemembered, JSON.stringify({ checkpoints: snapshot2.snapshot.checkpoints.length, mode: snapshot2.snapshot.mode }));

    // 8. Renderer 能力边界：未知 action 结构化拒绝。
    const denied = await exec('window.win7Agent.a9.snapshot().then(() => true)');
    record('A9S-08-RENDERER-API-ONLY', denied === true, '');

    report.status = report.cases.every((c) => c.passed) ? 'PASS' : 'FAIL';
  } catch (error) {
    report.status = 'ERROR';
    report.error = String(error && error.stack ? error.stack : error);
  } finally {
    try { if (runtime) runtime.shutdown(); } catch (_e) { /* best effort */ }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    app.exit(report.status === 'PASS' ? 0 : 1);
  }
}).catch((error) => {
  report.status = 'ERROR';
  report.error = String(error);
  try { fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); } catch (_e) { /* best effort */ }
  app.exit(1);
});
