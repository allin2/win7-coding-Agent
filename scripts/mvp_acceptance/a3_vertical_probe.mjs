#!/usr/bin/env node

/** Run the packaged Shell -> Gateway -> Core -> Workspace -> UI slice. */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const packageRoot = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const require = createRequire(import.meta.url);
const product = require(path.join(packageRoot, 'product/desktop-host'));
const workspaceRoot = path.resolve(required('--workspace='));
const caBundlePath = argument('--ca=');
const gatewayUrl = required('--url=');
const cancelAfterMs = Number(process.argv.find(item => item.startsWith('--cancel-after-ms='))?.split('=')[1] || 0);
const events = [];
const host = product.createDesktopHost({ onTaskEvent: (event) => events.push(event) });
const secret = crypto.randomBytes(24).toString('hex');
let error;
let accepted;
try {
  host.setSettings({ values: {
    mode: 'gateway',
    gatewayUrl,
    ...(caBundlePath ? { caBundlePath } : {}),
    apiKey: secret,
  } });
  await host.selectWorkspace(workspaceRoot);
  const session = host.createSession({});
  accepted = host.submitTask({ sessionId: session.sessionId, prompt: '分析这个工作区的代码结构', scenario: 'structure' });
  if (cancelAfterMs > 0) {
    await new Promise(resolve => setTimeout(resolve, cancelAfterMs));
    await host.cancelTask(accepted.taskId);
  }
  for (let index = 0; index < 500 && host.activeTask; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 10));
    host.flushEvents();
  }
} catch (caught) {
  error = { code: caught && caught.code, message: caught && caught.message };
} finally {
  host.dispose();
}

const toolNames = events.filter(event => event.eventKind === 'tool.started').map(event => event.data.toolName);
const gatewayRequestIds = events.filter(event => event.eventKind === 'gateway.delta').map(event => event.data.requestId);
const finalEvents = events.filter(event => event.eventKind === 'task.completed');
const serializedEvents = JSON.stringify(events);
const report = {
  schemaVersion: 1,
  suite: 'A3_SHELL_GATEWAY_CORE_WORKSPACE_UI_VERTICAL_PROBE',
  generatedAt: new Date().toISOString(),
  gatewayUrl: redactUrl(gatewayUrl),
  caBundleSha256: caBundlePath ? sha256(caBundlePath) : null,
  accepted: accepted || null,
  error,
  eventKinds: events.map(event => event.eventKind),
  toolNames,
  gatewayRequestIds,
  requestIdsIsolated: new Set(gatewayRequestIds).size >= 1,
  orderedReadOnlyTools: toolNames.join('>') === 'workspace.list_directory>workspace.search_text>workspace.read_text',
  finalUiCompleted: finalEvents.length === 1,
  finalUiCancelled: events.some(event => event.eventKind === 'task.cancelled'),
  credentials: { secretInEvents: serializedEvents.includes(secret), secretInReport: false },
  status: !error && (cancelAfterMs > 0
    ? events.some(event => event.eventKind === 'task.cancelled') && !finalEvents.length
    : toolNames.length === 3 && finalEvents.length === 1) && !serializedEvents.includes(secret) ? 'PASS' : 'FAIL',
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
process.exitCode = report.status === 'PASS' ? 0 : 1;

function required(prefix) {
  const value = argument(prefix);
  if (!value) throw new Error(`Missing ${prefix}<value>`);
  return value;
}
function argument(prefix) {
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function redactUrl(value) { try { const parsed = new URL(value); return `${parsed.protocol}//${parsed.host}${parsed.pathname}`; } catch (_error) { return '[invalid-url]'; } }
