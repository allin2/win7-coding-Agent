'use strict';

/** Run the packaged A3 Gateway -> Core -> Workspace -> UI slice inside Electron on Win7. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const packageRoot = path.resolve(__dirname, '../..');
const product = require(path.join(packageRoot, 'product/desktop-host'));
const workspaceRoot = required('--workspace=');
const gatewayUrl = required('--url=');
const caBundlePath = argument('--ca=');
const reportPath = path.resolve(argument('--report=') || path.join(__dirname, 'A3-WIN7-http-report.json'));
const userDataDir = argument('--user-data-dir=');
const events = [];

if (userDataDir) app.setPath('userData', path.resolve(userDataDir));

app.whenReady().then(async () => {
  const host = product.createDesktopHost({ onTaskEvent: (event) => events.push(event) });
  const secret = crypto.randomBytes(24).toString('hex');
  let accepted = null;
  let error = null;
  try {
    host.setSettings({ values: {
      mode: 'gateway',
      gatewayUrl,
      ...(caBundlePath ? { caBundlePath } : {}),
      apiKey: secret,
    } });
    await host.selectWorkspace(workspaceRoot);
    const session = host.createSession({ label: 'A3 Win7 HTTP acceptance' });
    accepted = host.submitTask({ sessionId: session.sessionId, prompt: '分析这个工作区的代码结构', scenario: 'structure' });
    for (let index = 0; index < 600 && host.activeTask; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      host.flushEvents();
    }
  } catch (caught) {
    error = { code: caught && caught.code, message: caught && caught.message };
  } finally {
    host.dispose();
  }

  const serialized = JSON.stringify(events);
  const toolNames = events.filter((event) => event.eventKind === 'tool.started').map((event) => event.data.toolName);
  const report = {
    schemaVersion: 1,
    acceptanceId: 'A3-WIN7-HTTP-20260804',
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    gatewayUrl: redactUrl(gatewayUrl),
    transport: new URL(gatewayUrl).protocol.replace(':', ''),
    workspaceRoot,
    userDataDir: userDataDir || null,
    accepted,
    eventKinds: events.map((event) => event.eventKind),
    toolNames,
    orderedReadOnlyTools: toolNames.join('>') === 'workspace.list_directory>workspace.search_text>workspace.read_text',
    finalUiCompleted: events.filter((event) => event.eventKind === 'task.completed').length === 1,
    credentials: { secretInEvents: serialized.includes(secret), secretInReport: false },
    error,
    status: !error && toolNames.length === 3 && events.filter((event) => event.eventKind === 'task.completed').length === 1 && !serialized.includes(secret) ? 'PASS' : 'FAIL',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  app.exit(report.status === 'PASS' ? 0 : 1);
}).catch((caught) => {
  process.stderr.write(String(caught && caught.stack ? caught.stack : caught) + '\n');
  app.exit(2);
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
function redactUrl(value) {
  try { const parsed = new URL(value); return `${parsed.protocol}//${parsed.host}${parsed.pathname}`; } catch (_error) { return '[invalid-url]'; }
}
