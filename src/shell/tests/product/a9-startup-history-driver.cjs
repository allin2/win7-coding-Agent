'use strict';
// Development-only real Electron/Preload/DOM regression. Data is seeded by the runner.
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const output = process.env.A9_STARTUP_TEST_OUTPUT;
if (!output) throw new Error('A9_STARTUP_TEST_OUTPUT_REQUIRED');
app.setPath('userData', path.join(path.dirname(output), 'user-data'));
const timeout = setTimeout(() => finish({ ok: false, error: 'TIMEOUT' }), 30000);
function finish(result) {
  clearTimeout(timeout);
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  app.quit();
  if (!result.ok) process.exitCode = 1;
}
ipcMain.once('product:renderer-ready', async () => {
  try {
    const window = BrowserWindow.getAllWindows()[0];
    const result = await window.webContents.executeJavaScript(`(async () => {
      const snapshot = await window.win7Agent.a9.snapshot();
      const facts = snapshot.snapshot || snapshot;
      if (facts.conversation.length !== 20) throw new Error('FIRST_PAGE_NOT_BOUNDED');
      const count = () => document.querySelectorAll('#a9-task-stream .turn-block').length;
      const initial = count();
      const waitFor = async expected => {
        for (let i = 0; i < 100; i++) {
          if (count() === expected) return;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error('PAGE_DOM_TIMEOUT:' + count());
      };
      for (const expected of [40, 45]) {
        const button = Array.from(document.querySelectorAll('#a9-task-stream button'))
          .find(node => node.textContent === '加载更早对话');
        if (!button) throw new Error('HISTORY_CONTROL_MISSING');
        button.click();
        await waitFor(expected);
      }
      await window.win7AgentA9Workbench.refreshSnapshot();
      if (count() !== 45) throw new Error('REFRESH_DROPPED_HISTORY');
      const ids = Array.from(document.querySelectorAll('#a9-task-stream .turn-block')).map(node => node.dataset.turnKey);
      if (initial !== 20 || new Set(ids).size !== 45) throw new Error('DUPLICATE_OR_UNBOUNDED_DOM');
      return { ok: true, initial, expanded: count() };
    })()`);
    fs.writeFileSync(path.join(path.dirname(output), 'history.png'), (await window.webContents.capturePage()).toPNG());
    finish(result);
  } catch (error) { finish({ ok: false, error: String(error.stack || error) }); }
});
require('../../product/main.js');
