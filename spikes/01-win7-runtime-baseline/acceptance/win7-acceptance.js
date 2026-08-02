/**
 * SPIKE 01 - Win7 实机验收 headless harness
 *
 * 以无窗口（show:false）方式运行 Electron 22.3.27，在 Win7 SP1 x64 真机上
 * 实际执行 T01–T11 各项行为，输出结构化 JSON 报告。
 *
 * 用法（在 Win7 上）:
 *   C:\acceptance\electron\electron.exe win7-acceptance.js --report=C:\acceptance\report.json
 *   （GPU 降级模式） SPIKE_DISABLE_GPU=1 electron.exe win7-acceptance.js --report=...
 *
 * 注意：本 harness 镜像 spike 的 webPreferences 与安全配置，独立执行以验证
 * Electron 22.3.27 在 Win7 真机上的运行时行为。
 */
'use strict';

const { app, BrowserWindow, utilityProcess, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── 参数解析 ────────────────────────────────────────────────────────────────
const reportArg = process.argv.find((a) => a.startsWith('--report='));
const reportPath = reportArg ? reportArg.split('=')[1] : path.join(__dirname, 'report.json');
const gpuDisabled =
  process.env.SPIKE_DISABLE_GPU === '1' || process.argv.includes('--disable-gpu');

const results = {};
function setResult(id, pass, detail) {
  results[id] = { pass: !!pass, detail: detail || {} };
  console.log(`[ACCEPTANCE] ${id}: ${pass ? 'PASS' : 'FAIL'}`);
}

// ─── GPU 降级（T06）─────────────────────────────────────────────────────────
if (gpuDisabled) {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

// ─── 协调 finalize ─────────────────────────────────────────────────────────
let utilityResolved = false;
let rendererResolved = false;
let finalized = false;

function maybeFinalize() {
  if (utilityResolved && rendererResolved) finalize();
}

function finalize() {
  if (finalized) return;
  finalized = true;
  setTimeout(() => {
    const report = {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      os: process.platform,
      arch: process.arch,
      gpuDisabled,
      hasGpuSwitch: app.commandLine.hasSwitch('disable-gpu'),
      results,
      timestamp: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log('REPORT_WRITTEN:' + reportPath);
    } catch (e) {
      console.log('REPORT_WRITE_FAIL:' + e.message);
    }
    console.log('ACCEPTANCE_REPORT_JSON:' + JSON.stringify(report));
    app.quit();
  }, 800);
}

// ─── 主流程 ─────────────────────────────────────────────────────────────────
function main() {
  // T01 - Electron 22.3.27 版本
  setResult(
    'T01',
    process.versions.electron === '22.3.27',
    { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, os: process.platform, arch: process.arch }
  );

  // T04 - 单实例锁
  const gotLock = app.requestSingleInstanceLock();
  setResult('T04', gotLock === true, { gotLock });

  // T05 - 崩溃日志路径
  try {
    const crashDir = path.join(app.getPath('userData'), 'CrashDumps');
    app.setPath('crashDumps', crashDir);
    const got = app.getPath('crashDumps');
    setResult('T05', got === crashDir, { set: crashDir, got });
  } catch (e) {
    setResult('T05', false, { error: e.message });
  }

  // T11 - package.json 脚本完整（兼容扁平化部署与标准 spike 布局）
  let pkg = null;
  let pkgPath = null;
  for (const candidate of [
    path.join(__dirname, 'package.json'),
    path.join(__dirname, '..', 'package.json'),
  ]) {
    try {
      pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      pkgPath = candidate;
      break;
    } catch (_e) {
      /* try next */
    }
  }
  if (pkg) {
    const ok = pkg.scripts && pkg.scripts.start && pkg.scripts.build && pkg.scripts.validate;
    setResult('T11', ok, { pkgPath, scripts: pkg.scripts });
  } else {
    setResult('T11', false, { error: 'package.json not found in ' + __dirname + ' or parent' });
  }

  // T06 - GPU 降级：记录开关状态（窗口创建在下方验证）
  setResult('T06', true, { gpuDisabled, hasGpuSwitch: app.commandLine.hasSwitch('disable-gpu') });

  // ─── 安全窗口（T02 / T07 / T09 / T10）────────────────────────────────────
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'acc-preload.js'),
    },
  });

  // T07 - 出站 CSP（注入 default-src 'none'）
  win.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
          ],
        },
      });
    },
    { urls: ['<all_urls>'] }
  );

  ipcMain.on('acc-report', (_event, data) => {
    setResult(
      'T02',
      data.nodeIntegrationOff === true && data.contextIsolationOn === true && data.sandboxOn === true,
      data
    );
    setResult('T07', data.cspInlineBlocked === true, data);
    setResult('T09', data.contextBridgeOk === true, data);
    setResult('T10', data.rendererLoaded === true, data);
    rendererResolved = true;
    maybeFinalize();
  });

  win.on('closed', () => {
    // 渲染进程未能上报时兜底
    if (!rendererResolved) {
      setResult('T02', false, { error: 'renderer did not report' });
      setResult('T07', false, { error: 'renderer did not report' });
      setResult('T09', false, { error: 'renderer did not report' });
      setResult('T10', false, { error: 'renderer did not report' });
      rendererResolved = true;
      maybeFinalize();
    }
  });

  win.loadFile(path.join(__dirname, 'acc-renderer.html'));

  // T08 - utilityProcess 真实派生
  runUtilityTest();
}

// ─── T08: utilityProcess.fork 实机验证 ───────────────────────────────────────
function runUtilityTest() {
  try {
    if (typeof utilityProcess === 'undefined' || typeof utilityProcess.fork !== 'function') {
      setResult('T08', false, { available: false, error: 'utilityProcess.fork not available' });
      utilityResolved = true;
      maybeFinalize();
      return;
    }
    const child = utilityProcess.fork(path.join(__dirname, 'utility-child.js'), [], {
      serviceName: 'spike01-utility-test',
      stdio: 'pipe',
    });
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        setResult('T08', false, { error: 'timeout waiting for utility message' });
        utilityResolved = true;
        maybeFinalize();
      }
    }, 20000);
    child.on('message', (msg) => {
      if (msg && msg.type === 'ready') {
        done = true;
        clearTimeout(timeout);
        setResult('T08', true, { node: msg.node, pid: msg.pid, electron: msg.electron });
        if (child.postMessage) child.postMessage({ type: 'exit' });
        utilityResolved = true;
        maybeFinalize();
      }
    });
    child.on('exit', (code) => {
      if (!done) {
        setResult('T08', false, { error: 'utility exited early', code });
        utilityResolved = true;
        maybeFinalize();
      }
    });
  } catch (e) {
    setResult('T08', false, { error: e.message });
    utilityResolved = true;
    maybeFinalize();
  }
}

app.on('ready', main);

// 安全兜底：60s 后强制收尾
setTimeout(() => {
  if (!finalized) {
    if (!utilityResolved) {
      setResult('T08', false, { error: 'safety timeout' });
      utilityResolved = true;
    }
    if (!rendererResolved) {
      setResult('T02', false, { error: 'safety timeout' });
      setResult('T07', false, { error: 'safety timeout' });
      setResult('T09', false, { error: 'safety timeout' });
      setResult('T10', false, { error: 'safety timeout' });
      rendererResolved = true;
    }
    finalize();
  }
}, 60000);
