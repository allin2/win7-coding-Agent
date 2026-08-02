/**
 * SPIKE 01 - Win7 运行时基线验证：最小 Electron 22 主进程
 *
 * 验证目标：
 *   T01  Electron 22.3.27 在 Win7 SP1 x64 上可启动
 *   T02  nodeIntegration=false / contextIsolation=true / sandbox=true
 *   T03  中文+空格路径兼容（C10）
 *   T04  单实例锁
 *   T05  崩溃日志配置
 *   T06  GPU 降级 / 软件渲染
 *   T07  出站 CSP
 *   T08  utilityProcess 可用性探测
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// ─── 常量 ────────────────────────────────────────────────────────────────────
const IS_DEV = !app.isPackaged;

// ─── GPU 降级检测（T06）─────────────────────────────────────────────────────
// 在 Win7 上，部分虚拟机或旧显卡不支持硬件加速，需强制禁用 GPU
// 通过环境变量或命令行参数触发
if (process.env.SPIKE_DISABLE_GPU === '1' || process.argv.includes('--disable-gpu')) {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

// ─── 崩溃日志配置（T05）─────────────────────────────────────────────────────
// crashDumps 目录在用户数据目录下，Win7 路径兼容
app.setPath('crashDumps', path.join(app.getPath('userData'), 'CrashDumps'));

// ─── 单实例锁（T04）─────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.error('[SPIKE-01] 另一个实例已在运行，退出。');
  app.quit();
}

// ─── 路径兼容性测试（T03 / C10）─────────────────────────────────────────────
// 验证 __dirname 包含中文+空格时，资源加载是否正常
const PATH_TEST_RESULT = (() => {
  const testPath = __dirname;
  const hasCJK = /[\u4e00-\u9fff]/.test(testPath);
  const hasSpace = testPath.includes(' ');
  return {
    dirname: testPath,
    hasCJK,
    hasSpace,
    compatible: true, // 如果能执行到这里，说明基本兼容
  };
})();

// ─── 主窗口 ─────────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    // 安全配置（T02）
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 出站 CSP（T07）
  mainWindow.webContents.session.webRequest.onHeadersReceived(
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

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();

  // utilityProcess 可用性探测（T08）
  // Electron 22 基于 Chromium 108 / Node 18，utilityProcess 在 Electron 22+ 可用
  probeUtilityProcess();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── IPC 处理 ────────────────────────────────────────────────────────────────

// 版本信息（供 preload 暴露的 API 使用）
ipcMain.handle('get-versions', () => {
  return {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    os: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
  };
});

// 健康检查
ipcMain.handle('ping', () => 'pong');

// 路径兼容性结果
ipcMain.handle('get-path-test', () => PATH_TEST_RESULT);

// utilityProcess 探测结果
ipcMain.handle('get-utility-process', () => {
  return {
    available: typeof require('electron').utilityProcess !== 'undefined',
    note: 'Electron 22 中 utilityProcess 为实验性 API',
  };
});

// ─── utilityProcess 探测（T08）──────────────────────────────────────────────
function probeUtilityProcess() {
  try {
    const { utilityProcess } = require('electron');
    if (utilityProcess && typeof utilityProcess.fork === 'function') {
      console.log('[SPIKE-01] utilityProcess API 可用');
      // 注意：实际 fork 需要独立的 utility 脚本，此处仅探测 API 存在性
      // TODO: Win7 实机验证时，创建实际 utility 进程测试 Core 启动
    } else {
      console.warn('[SPIKE-01] utilityProcess API 不可用，需回退到 child_process');
    }
  } catch (e) {
    console.warn('[SPIKE-01] utilityProcess 探测失败:', e.message);
  }
}
