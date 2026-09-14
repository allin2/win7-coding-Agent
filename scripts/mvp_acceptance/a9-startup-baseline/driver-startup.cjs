'use strict';
// A9-17 startup A/B driver (source entry mode).
//
// Runs INSIDE Electron and records main-thread timestamps plus Electron's own
// per-process metrics. The Windows sampler (a9_win7_memory_baseline.ps1) records
// the WMI/working-set side independently; this driver only adds the timing marks
// and the first-screen facts that WMI cannot see.
//
// ASCII-only literals on purpose: Windows tooling reads UTF-8-without-BOM as ANSI.
//
// Environment:
//   A9_REPO                 repo root whose src/shell/product/main.js is loaded
//   A9_MEASURE_OUTPUT       path of the marks JSON to write
//   A9_MEASURE_DURATION_MS  total run length (default 60000)
//   A9_MEASURE_STARTUP_MS   high-frequency sampling window (default 10000)
//   A9_MEASURE_FAST_MS      sampling interval inside the startup window (default 250)
//   A9_MEASURE_SLOW_MS      sampling interval after the startup window (default 500)

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

const output = process.env.A9_MEASURE_OUTPUT;
const durationMs = Number(process.env.A9_MEASURE_DURATION_MS || 60000);
const startupMs = Number(process.env.A9_MEASURE_STARTUP_MS || 10000);
const fastMs = Number(process.env.A9_MEASURE_FAST_MS || 250);
const slowMs = Number(process.env.A9_MEASURE_SLOW_MS || 500);

if (!output) {
  process.exitCode = 2;
  throw new Error('A9_MEASURE_OUTPUT is required');
}

const samples = [];
const started = process.hrtime.bigint();
const elapsed = () => Number(process.hrtime.bigint() - started) / 1e6;
const marks = {
  driverStarted: new Date().toISOString(),
  pid: process.pid,
  versions: process.versions,
  durationMs,
  startupMs,
  fastMs,
  slowMs,
};

app.setPath('userData', path.join(path.dirname(output), 'user-data'));

app.on('browser-window-created', (_event, window) => {
  marks.windowCreatedMs = elapsed();
  window.once('ready-to-show', () => { marks.readyToShowMs = elapsed(); });
  window.webContents.once('did-finish-load', () => { marks.didFinishLoadMs = elapsed(); });
});

// The product emits this once the renderer has wired the preload bridge.
ipcMain.on('product:renderer-ready', async () => {
  marks.rendererReadyMs = elapsed();
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) { marks.uiError = 'no window'; return; }
  try {
    marks.ui = await window.webContents.executeJavaScript(`(async () => {
      const response = await window.win7Agent.a9.snapshot();
      const s = response.snapshot;
      return {
        ok: response.ok,
        status: s.status,
        mode: s.mode,
        count: s.conversation.length,
        more: s.conversationPage && s.conversationPage.hasMore,
        provider: s.provider.configured,
      };
    })()`);
    marks.snapshotMs = elapsed();
  } catch (error) {
    marks.uiError = String(error && error.message ? error.message : error);
  }
});

function sample() {
  const metrics = app.getAppMetrics();
  const processes = metrics.map((m) => ({
    pid: m.pid,
    type: m.type,
    name: m.name || null,
    workingSetKiB: m.memory ? m.memory.workingSetSize : null,
    peakWorkingSetKiB: m.memory ? m.memory.peakWorkingSetSize : null,
  }));
  samples.push({
    elapsedMs: elapsed(),
    totalWorkingSetKiB: processes.reduce((sum, p) => sum + (p.workingSetKiB || 0), 0),
    processCount: processes.length,
    processes,
    mainRssBytes: process.memoryUsage().rss,
    mainHeapUsedBytes: process.memoryUsage().heapUsed,
  });
}

app.whenReady().then(() => {
  let timer = setInterval(sample, fastMs);
  setTimeout(() => {
    clearInterval(timer);
    timer = setInterval(sample, slowMs);
  }, startupMs);
  setTimeout(() => {
    clearInterval(timer);
    marks.sampleCount = samples.length;
    fs.writeFileSync(output, JSON.stringify({ marks, samples }, null, 2) + '\n');
    app.quit();
  }, durationMs);
});

// Source entry: the same product main.js the candidate ships.
require(process.env.A9_REPO + '/src/shell/product/main.js');
