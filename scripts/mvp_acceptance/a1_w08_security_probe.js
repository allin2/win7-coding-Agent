'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session } = require('electron');

const packageRoot = path.resolve(__dirname, '../..');
const productRoot = path.join(packageRoot, 'product');
const distRoot = path.join(packageRoot, 'dist');
const { createDesktopRequestHandler } = require(path.join(productRoot, 'desktop-ipc'));
const { createDesktopHost } = require(path.join(productRoot, 'desktop-host'));
const { schemaValidator } = require(path.join(distRoot, 'ipc/schema'));
const { IPCDirection, IPCMessageType } = require(path.join(distRoot, 'ipc/messages'));
const { createWindowOptions } = require(path.join(productRoot, 'policy'));
const { installSessionPolicy, installWindowPolicy } = require(path.join(productRoot, 'security-policy'));
const workspaceReportPath = argument('--workspace-report=');
const reportPath = argument('--report=') || path.join(process.cwd(), 'W08-security-report.json');

function argument(prefix) {
  const value = process.argv.find((item) => item.indexOf(prefix) === 0);
  return value ? value.slice(prefix.length) : null;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function message(type, sessionId, payload, overrides) {
  return Object.assign({
    protocolVersion: '1.0.0',
    id: `w08-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    direction: IPCDirection.RENDERER_TO_CORE,
    sessionId,
    timestamp: new Date().toISOString(),
    payload,
  }, overrides || {});
}

async function runRejected(label, action, expected) {
  try {
    const result = await action();
    const errorCode = result && result.error && result.error.code;
    const passed = result && result.ok === false && (!expected || errorCode === expected);
    return { case_id: label, status: passed ? 'PASS' : 'FAIL', metrics: { result, expected } };
  } catch (error) {
    const text = String(error && error.message ? error.message : error);
    const passed = Boolean(expected ? text.indexOf(expected) !== -1 : text);
    return { case_id: label, status: passed ? 'PASS' : 'FAIL', metrics: { thrown: text, expected } };
  }
}

async function runIpcProbe(workspace) {
  schemaValidator.clearAuditLog();
  const runtimeState = { diagnosticsRequested: false, errors: [] };
  const events = [];
  const host = createDesktopHost({ onTaskEvent: (event) => events.push(event) });
  const handler = createDesktopRequestHandler({
    getDesktopHost: () => host,
    isValidRendererSender: (event) => Boolean(event && event.trusted === true),
    runtimeState,
    buildDiagnostics: () => host.getDiagnostics(),
    sendProductEvent: (_type, _sessionId, payload) => events.push({ eventKind: 'workspace.selected', data: payload }),
    chooseWorkspace: async () => workspace,
  });
  const trusted = { trusted: true };

  const cases = [];
  cases.push(await runRejected(
    'IPC_UNKNOWN_MESSAGE_TYPE',
    () => handler(trusted, message('evil.message', 'desktop', {})),
    'IPC_SCHEMA_INVALID',
  ));

  const extra = message(IPCMessageType.DIAGNOSTICS_GET, 'desktop', {});
  extra.unexpected = true;
  cases.push(await runRejected('IPC_UNKNOWN_ENVELOPE_FIELD', () => handler(trusted, extra), 'IPC_SCHEMA_INVALID'));

  cases.push(await runRejected(
    'IPC_WRONG_DIRECTION',
    () => handler(trusted, message(IPCMessageType.DIAGNOSTICS_GET, 'desktop', {}, { direction: IPCDirection.CORE_TO_RENDERER })),
    'IPC_SCHEMA_INVALID',
  ));

  cases.push(await runRejected(
    'IPC_UNTRUSTED_RENDERER_SENDER',
    () => handler({ trusted: false }, message(IPCMessageType.DIAGNOSTICS_GET, 'desktop', {})),
    'RENDERER_CAPABILITY_DENIED',
  ));

  const selected = await handler(trusted, message(IPCMessageType.WORKSPACE_SELECT, 'desktop', { path: workspace }));
  const sessionA = (await handler(trusted, message(IPCMessageType.SESSION_CREATE, 'desktop', { workspacePath: workspace, label: 'W08-A' }))).session;
  const sessionB = (await handler(trusted, message(IPCMessageType.SESSION_CREATE, 'desktop', { workspacePath: workspace, label: 'W08-B' }))).session;

  cases.push(await runRejected(
    'IPC_FAKE_SESSION_TASK',
    () => handler(trusted, message(IPCMessageType.TASK_SUBMIT, 'session-forged', { sessionId: 'session-forged', prompt: 'forged' })),
    'SESSION_NOT_FOUND',
  ));

  cases.push(await runRejected(
    'IPC_HEADER_PAYLOAD_SESSION_MISMATCH',
    () => handler(trusted, message(IPCMessageType.TASK_SUBMIT, sessionA.sessionId, { sessionId: sessionB.sessionId, prompt: 'mismatch' })),
    'SESSION_SCOPE_DENIED',
  ));

  const task = (await handler(trusted, message(IPCMessageType.TASK_SUBMIT, sessionA.sessionId, {
    sessionId: sessionA.sessionId,
    prompt: 'W08 cross-session cancellation probe',
    scenario: 'cancellable',
  }))).task;
  await wait(75);
  cases.push(await runRejected(
    'IPC_CROSS_SESSION_CANCEL',
    () => handler(trusted, message(IPCMessageType.TASK_CANCEL, sessionB.sessionId, { taskId: task.taskId })),
    'SESSION_SCOPE_DENIED',
  ));
  await handler(trusted, message(IPCMessageType.TASK_CANCEL, sessionA.sessionId, { taskId: task.taskId }));
  await wait(700);

  const auditCount = schemaValidator.getAuditLog().length;
  cases.push({
    case_id: 'IPC_REJECTION_AUDIT',
    status: auditCount >= 3 ? 'PASS' : 'FAIL',
    metrics: { audit_count: auditCount },
  });
  cases.push({
    case_id: 'IPC_VALID_SETUP',
    status: selected && sessionA && sessionB ? 'PASS' : 'FAIL',
    metrics: { selected, session_ids: [sessionA && sessionA.sessionId, sessionB && sessionB.sessionId] },
  });
  host.dispose();
  return cases;
}

async function runOutboundProbe() {
  const blockedRequests = [];
  const deniedPermissions = [];
  const deniedNavigations = [];
  const deniedWindows = [];
  const deniedWebviews = [];
  const partition = `a1-w08-${Date.now()}`;
  const targetSession = session.fromPartition(partition);
  installSessionPolicy(targetSession, {
    rendererRoot: __dirname,
    onRequestBlocked: (url) => blockedRequests.push(url),
    onPermissionDenied: (permission) => deniedPermissions.push(permission),
  });

  const options = createWindowOptions(path.join(__dirname, 'noop-preload.js'));
  options.webPreferences = Object.assign({}, options.webPreferences, { partition });
  const window = new BrowserWindow(options);
  installWindowPolicy(window, __dirname, {
    onWindowOpenDenied: (url) => deniedWindows.push(url),
    onNavigationDenied: (url) => deniedNavigations.push(url),
    onWebviewDenied: () => deniedWebviews.push(true),
  });
  await window.loadFile(path.join(__dirname, 'probe.html'));
  const rendererResult = await window.webContents.executeJavaScript('window.__a1RunOutboundProbe()', true);
  await wait(250);
  const finalUrl = window.webContents.getURL();
  if (!window.isDestroyed()) window.destroy();

  const fetchBlocked = rendererResult.fetch && rendererResult.fetch.blocked;
  const websocketBlocked = rendererResult.websocket && rendererResult.websocket.blocked;
  const navigationBlocked = deniedNavigations.length > 0 && finalUrl.indexOf('file:') === 0;
  const windowOpenBlocked = deniedWindows.length > 0 && rendererResult.windowOpen === null;
  const permissionBlocked = rendererResult.permission === 'denied' || deniedPermissions.length > 0;
  return [
    { case_id: 'OUTBOUND_FETCH_BLOCKED', status: fetchBlocked ? 'PASS' : 'FAIL', metrics: { fetch: rendererResult.fetch, blocked_requests: blockedRequests } },
    { case_id: 'OUTBOUND_WEBSOCKET_BLOCKED', status: websocketBlocked ? 'PASS' : 'FAIL', metrics: { websocket: rendererResult.websocket, blocked_requests: blockedRequests } },
    { case_id: 'NAVIGATION_BLOCKED', status: navigationBlocked ? 'PASS' : 'FAIL', metrics: { denied_navigations: deniedNavigations, final_url: finalUrl } },
    { case_id: 'WINDOW_OPEN_BLOCKED', status: windowOpenBlocked ? 'PASS' : 'FAIL', metrics: { denied_windows: deniedWindows, returned: rendererResult.windowOpen } },
    { case_id: 'PERMISSION_BLOCKED', status: permissionBlocked ? 'PASS' : 'FAIL', metrics: { permission: rendererResult.permission, denied_permissions: deniedPermissions } },
  ];
}

async function run() {
  const workspaceReport = JSON.parse(fs.readFileSync(workspaceReportPath, 'utf8'));
  const cases = [];
  cases.push(...await runIpcProbe(workspaceReport.workspace));
  cases.push(...await runOutboundProbe());
  const report = {
    schema_version: 1,
    mvp_id: argument('--mvp-id=') || 'MVP-UNKNOWN',
    suite: 'A1_WIN7_W08_SECURITY_NEGATIVE_PROBE',
    environment: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      package_root: packageRoot,
      workspace: workspaceReport.workspace,
    },
    artifact_hashes: {
      probe: sha256(__filename),
      ipc_router: sha256(path.join(packageRoot, 'product', 'desktop-ipc.js')),
      security_policy: sha256(path.join(packageRoot, 'product', 'security-policy.js')),
      product_main: sha256(path.join(packageRoot, 'product', 'main.js')),
    },
    command: [process.execPath].concat(process.argv.slice(1)),
    cases,
    exit_code: cases.every((item) => item.status === 'PASS') ? 0 : 1,
    notes: [
      'All negative cases are executed against the packaged A1 modules on Win7.',
      'External requests are directed to deny-by-default policy and are cancelled before network access; no network target is required.',
      'The probe writes only its report and temporary user data under the acceptance directory.',
    ],
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

app.whenReady().then(async () => {
  try {
    const report = await run();
    app.exit(report.exit_code);
  } catch (error) {
    fs.writeFileSync(reportPath, JSON.stringify({
      schema_version: 1,
      mvp_id: argument('--mvp-id=') || 'MVP-UNKNOWN',
      suite: 'A1_WIN7_W08_SECURITY_NEGATIVE_PROBE',
      exit_code: 1,
      error: String(error && error.stack ? error.stack : error),
    }, null, 2) + '\n', 'utf8');
    app.exit(1);
  }
});
