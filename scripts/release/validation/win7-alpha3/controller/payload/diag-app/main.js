'use strict';
const { app, BrowserWindow } = require('electron');
const { context, createWriter } = require('../event-log');
const ctx = context(process.env.A9_DIAG_ROOT, process.env.A9_DIAG_RUN_ID, process.env.A9_DIAG_CASE);
const event = createWriter(ctx, 'app');
let metricsTimer;
let quitTimer;
let window;
function gpuStatus(source) {
  try { event('gpu_status', { source, status: app.getGPUFeatureStatus() }); }
  catch (error) { event('gpu_status_unknown', { source, status: 'UNKNOWN' }); }
}
function actual(details, field) { return Object.prototype.hasOwnProperty.call(details, field) ? details[field] : 'UNKNOWN'; }
app.on('child-process-gone', (ev, details) => {
  event('child_process_gone', { type: actual(details, 'type'), reason: actual(details, 'reason'), exitCode: actual(details, 'exitCode'), serviceName: actual(details, 'serviceName'), name: actual(details, 'name'), pid: actual(details, 'pid') });
});
app.on('gpu-info-update', () => { if (app.isReady()) gpuStatus('gpu-info-update'); });
event('initial_ready', { isReady: app.isReady(), platform: process.platform });
if (process.platform === 'win32' && !app.isReady()) {
  event('guard_enter', { isReady: app.isReady() });
  app.disableHardwareAcceleration();
  event('guard_return', { isReady: app.isReady() });
}
app.on('ready', () => {
  event('ready', { isReady: app.isReady() });
  gpuStatus('ready');
  window = new BrowserWindow({ width: 640, height: 400, show: true, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  window.webContents.on('did-finish-load', () => event('did_finish_load', { url: 'about:blank' }));
  window.on('ready-to-show', () => event('ready_to_show', {}));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (ev, url) => { if (url !== 'about:blank') ev.preventDefault(); });
  window.loadURL('about:blank').catch(() => event('load_failed', { outcome: 'FAIL' }));
  let previous = process.hrtime.bigint();
  metricsTimer = setInterval(() => {
    const now = process.hrtime.bigint();
    try { event('app_metrics', { interval_ticks: (now - previous).toString(), target_ms: 200, processes: app.getAppMetrics().map(p => ({ pid: actual(p, 'pid'), type: actual(p, 'type'), creationTime: actual(p, 'creationTime') })) }); }
    catch (error) { event('app_metrics_unknown', { processes: 'UNKNOWN' }); }
    previous = now;
  }, 200);
  quitTimer = setTimeout(() => { event('quit_requested', { isReady: app.isReady(), ready_delay_ms: 10000 }); app.quit(); }, 10000);
});
app.on('will-quit', () => { clearInterval(metricsTimer); clearTimeout(quitTimer); event('will_quit', {}); });
