'use strict';

/** Packaged A3 default Replay probe: no Gateway settings and no network. */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const packageRoot = path.resolve(__dirname, '../..');
const product = require(path.join(packageRoot, 'product/desktop-host'));
const workspaceRoot = required('--workspace=');
const reportPath = path.resolve(argument('--report=') || path.join(__dirname, 'A3-WIN7-replay-report.json'));
const userDataDir = argument('--user-data-dir=');

if (userDataDir) app.setPath('userData', path.resolve(userDataDir));

app.whenReady().then(async () => {
  const events = [];
  let error = null;
  const host = product.createDesktopHost({ onTaskEvent: (event) => events.push(event) });
  try {
    const before = host.getSettings();
    await host.selectWorkspace(workspaceRoot);
    const session = host.createSession({ label: 'A3 Win7 Replay acceptance' });
    host.submitTask({ sessionId: session.sessionId, prompt: '分析这个工作区的代码结构', scenario: 'structure' });
    for (let index = 0; index < 300 && host.activeTask; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      host.flushEvents();
    }
    const after = host.getSettings();
    const report = {
      schemaVersion: 1,
      acceptanceId: argument('--acceptance-id=') || 'A3-W02-20260804',
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      workspaceRoot,
      userDataDir: userDataDir || null,
      before,
      after,
      eventKinds: events.map((event) => event.eventKind),
      gatewayConfigured: Boolean(after.gatewayUrl || after.credentials?.apiKeyConfigured),
      finalCompleted: events.filter((event) => event.eventKind === 'task.completed').length === 1,
      status: before.mode === 'replay' && after.mode === 'replay' && !after.gatewayUrl && !after.credentials.apiKeyConfigured && events.filter((event) => event.eventKind === 'task.completed').length === 1 ? 'PASS' : 'FAIL',
      error,
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    host.dispose();
    app.exit(report.status === 'PASS' ? 0 : 1);
  } catch (caught) {
    error = { code: caught && caught.code, message: caught && caught.message };
    host.dispose();
    process.stderr.write(JSON.stringify(error) + '\n');
    app.exit(2);
  }
});

function argument(prefix) {
  const value = process.argv.find((item) => item.indexOf(prefix) === 0);
  return value ? value.slice(prefix.length) : null;
}
function required(prefix) {
  const value = argument(prefix);
  if (!value) throw new Error(`Missing ${prefix}<value>`);
  return value;
}
