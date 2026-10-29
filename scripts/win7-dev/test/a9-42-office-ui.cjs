'use strict';
// Development-only native input fixture. It does not run product main, SQLite,
// Office, a model, or Win7. The real Electron renderer uses production CSS.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { app, BrowserWindow } = require('electron');
const { clickUi } = require('../a9-42-office-journey.cjs');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
if (!output || !path.isAbsolute(output) || fs.existsSync(output)) throw new Error('NEW_OUTPUT_REQUIRED');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'user-data'));
app.disableHardwareAcceleration();
const report = { schema_version: 1, evidence_class: 'DEVELOPMENT_ELECTRON_NATIVE_INPUT_FIXTURE',
  runtime: { electron: process.versions.electron, node: process.versions.node },
  platform: process.platform, product_main: 'NOT_PERFORMED', win7: 'NOT_PERFORMED', checks: [] };
let win;
const write = () => fs.writeFileSync(path.join(output, 'RESULT.json'), JSON.stringify(report, null, 2) + '\n');
const timeout = setTimeout(() => { report.failure = 'FIXTURE_TIMEOUT'; write(); if (win) win.destroy(); app.quit(); }, 30000);
app.whenReady().then(async () => {
  assert.strictEqual(process.versions.electron, '22.3.27');
  assert.strictEqual(process.versions.node, '16.17.1');
  const css = fs.readFileSync(path.resolve(__dirname, '../../../src/shell/product/renderer/a9-workbench.css'), 'utf8');
  const groups = Array.from({ length: 8 }, (_, i) => `<details class="activity-group" id="group-${i}"><summary>工具活动 · ${i + 1}</summary><ul class="activity-items"><li style="height:260px">原稿 样本.docx</li></ul></details>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${css}
  body{margin:0;height:100vh;display:flex;flex-direction:column}header,footer{height:92px;flex:none}main{flex:1;overflow:auto;padding:34px 28px}#a9-task-stream{display:grid;gap:18px;max-width:760px;margin:auto}#cover{position:fixed;inset:0;z-index:100;background:white}</style>
  <header>Electron 原生点击夹具</header><main><div style="height:800px"></div><div id="a9-task-stream">${groups}</div><button id="disabled" disabled>禁用</button></main><footer>仅开发机交互证据<textarea id="fixture-composer"></textarea></footer>`;
  fs.writeFileSync(path.join(output, 'fixture.html'), html, { flag: 'wx' });
  win = new BrowserWindow({ width: 1104, height: 690, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  await win.loadFile(path.join(output, 'fixture.html')); win.show();
  let inputs = 0;
  const port = { evaluate: code => win.webContents.executeJavaScript(code), focus: () => win.focus(),
    sendInputEvent: event => { inputs += 1; win.webContents.sendInputEvent(event); } };
  const selector = '#a9-task-stream .activity-group:not([open]) > summary';
  for (let i = 0; i < 8; i += 1) {
    await clickUi(port, selector);
    assert.strictEqual(await port.evaluate('document.querySelectorAll(".activity-group[open]").length'), i + 1);
  }
  report.checks.push({ name: 'eight_native_details_toggles_after_scrolling', status: 'PASS', inputs });
  const before = inputs;
  await assert.rejects(clickUi(port, '#disabled'), /UI_ACTION_UNAVAILABLE/);
  assert.strictEqual(inputs, before);
  report.checks.push({ name: 'disabled_target_rejected_before_input', status: 'PASS' });
  await port.evaluate('document.body.insertAdjacentHTML("beforeend",\'<div id="cover"><button id="close-cover" style="position:absolute;right:12px;top:12px;min-height:44px">关闭检查器</button></div>\');document.getElementById("close-cover").addEventListener("click",()=>document.getElementById("cover").remove())');
  await assert.rejects(clickUi(port, '#group-0 > summary'), /UI_ACTION_OCCLUDED/);
  assert.strictEqual(inputs, before);
  report.checks.push({ name: 'covered_target_rejected_before_input', status: 'PASS' });
  await clickUi(port, '#close-cover');
  assert.strictEqual(await port.evaluate('document.getElementById("cover")===null'), true);
  await clickUi(port, '#fixture-composer');
  assert.strictEqual(await port.evaluate('document.activeElement.id'), 'fixture-composer');
  report.checks.push({ name: 'native_drawer_close_allows_composer_input', status: 'PASS' });
  report.status = 'PASS'; write(); win.close();
}).catch(error => {
  report.status = 'FAIL'; report.failure = String(error.message).slice(0, 500); write();
  process.exitCode = 1; if (win) win.close(); else app.quit();
});
app.on('window-all-closed', () => { clearTimeout(timeout); app.quit(); });
