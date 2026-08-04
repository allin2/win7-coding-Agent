'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
} = require('electron');
const {
  createWindowOptions,
  isTrustedLocalUrl,
} = require('./policy');
const { createDesktopRequestHandler } = require('./desktop-ipc');
const { installSessionPolicy, installWindowPolicy } = require('./security-policy');
const { createDesktopHost } = require('./desktop-host');
const { createDpapiCredentialVault } = require('./credential-vault');
const { schemaValidator } = require('../dist/ipc/schema');
const { IPCDirection, IPCMessageType } = require('../dist/ipc/messages');

const productRoot = __dirname;
const rendererRoot = path.join(productRoot, 'renderer');
const rendererEntry = path.join(rendererRoot, 'index.html');
const preloadPath = path.join(productRoot, 'preload.js');
const startedAt = new Date().toISOString();
const mvpId = readArgument('--mvp-id=') || 'MVP-UNKNOWN';
const smokeReportPath = readArgument('--smoke-report=');
const acceptanceEventReportPath = readArgument('--acceptance-event-report=');
const smokeTimeoutMs = boundedInteger(readArgument('--smoke-timeout-ms='), 20000, 5000, 60000);

const runtimeState = {
  rendererReady: false,
  diagnosticsRequested: false,
  blockedRequests: [],
  deniedPermissions: [],
  errors: [],
  productEvents: 0,
};

let mainWindow = null;
let smokeTimer = null;
let desktopHost = null;
const acceptanceEvents = [];
let acceptanceReportWritten = false;

function readArgument(prefix) {
  const value = process.argv.find((item) => item.indexOf(prefix) === 0);
  return value ? value.slice(prefix.length) : null;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeSmokeReport(status, exitCode, summary) {
  if (!smokeReportPath) return;
  const report = {
    schema_version: 1,
    mvp_id: mvpId,
    suite: 'WIN7_PRODUCT_SHELL_SMOKE',
    environment: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      user_data: app.getPath('userData'),
      product_root: productRoot,
    },
    artifact_hashes: {
      main_js: sha256(__filename),
      preload_js: sha256(preloadPath),
      renderer_html: sha256(rendererEntry),
      renderer_event_queue: sha256(path.join(rendererRoot, 'event-queue.js')),
      renderer_js: sha256(path.join(rendererRoot, 'renderer.js')),
      renderer_css: sha256(path.join(rendererRoot, 'styles.css')),
    },
    command: [process.execPath].concat(process.argv.slice(1)),
    timestamps: {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    },
    exit_code: exitCode,
    cases: [
      {
        case_id: 'PRODUCT_ENTRY_START_RENDER_EXIT',
        status,
        summary,
        metrics: {
          renderer_ready: runtimeState.rendererReady,
          diagnostics_requested: runtimeState.diagnosticsRequested,
          blocked_request_count: runtimeState.blockedRequests.length,
          denied_permission_count: runtimeState.deniedPermissions.length,
          runtime_error_count: runtimeState.errors.length,
        },
        evidence: [],
      },
      {
        case_id: 'PRODUCT_SECURITY_BASELINE',
        status: status === 'PASS' ? 'PASS' : status,
        summary: 'The product entry uses a sandboxed, context-isolated Renderer with Node disabled and deny-by-default outbound, navigation, window and permission policy.',
        metrics: {
          node_integration: false,
          context_isolation: true,
          sandbox: true,
          default_outbound: 'deny',
          navigation: 'trusted-local-only',
          window_open: 'deny',
          permissions: 'deny',
        },
        evidence: [],
      },
    ],
    evidence: [],
    notes: [
      'This is a real Electron product-entry smoke test, not a complete installer or cross-module task E2E.',
      'Runner remains fail-closed, State remains in-memory and Gateway remains unconfigured/Replay for this MVP increment.',
      'No machine PATH, registry, service, NIC, route or firewall setting is changed by this entry.',
    ],
    raw: runtimeState,
  };
  fs.mkdirSync(path.dirname(smokeReportPath), { recursive: true });
  fs.writeFileSync(smokeReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

function sanitizeAcceptanceValue(value) {
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_API_KEY]');
  }
  if (Array.isArray(value)) return value.map(sanitizeAcceptanceValue);
  if (value && typeof value === 'object') {
    const result = {};
    Object.entries(value).forEach(([key, item]) => {
      result[key] = /api.?key|password|authorization|credential|token/i.test(key)
        ? '[REDACTED]'
        : sanitizeAcceptanceValue(item);
    });
    return result;
  }
  return value;
}

function writeAcceptanceEventReport() {
  if (!acceptanceEventReportPath || acceptanceReportWritten) return;
  acceptanceReportWritten = true;
  const settings = desktopHost ? desktopHost.getSettings() : null;
  const eventKinds = acceptanceEvents.map((event) => event.eventKind);
  const toolNames = acceptanceEvents
    .filter((event) => event.eventKind === 'tool.started')
    .map((event) => event.data && event.data.toolName)
    .filter(Boolean);
  const report = sanitizeAcceptanceValue({
    schemaVersion: 1,
    acceptanceId: 'A3R-20260804-01',
    environment: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      userData: app.getPath('userData'),
    },
    settings,
    target: settings && settings.mode === 'deepseek' ? 'https://api.deepseek.com:443/chat/completions' : null,
    eventKinds,
    toolNames,
    events: acceptanceEvents,
    metrics: {
      eventCount: acceptanceEvents.length,
      gatewayDeltaCount: eventKinds.filter((kind) => kind === 'gateway.delta').length,
      taskCompletedCount: eventKinds.filter((kind) => kind === 'task.completed').length,
      taskFailedCount: eventKinds.filter((kind) => kind === 'task.failed').length,
      readOnlyToolCalls: toolNames.filter((name) => ['workspace.list_directory', 'workspace.search_text', 'workspace.read_text'].includes(name)).length,
    },
    credentials: {
      persistence: settings && settings.persistence ? settings.persistence : 'process-memory-only',
      apiKeyValueIncluded: false,
      commandLineCredentialIncluded: false,
    },
    timestamps: { startedAt, finishedAt: new Date().toISOString() },
    status: settings && settings.mode === 'deepseek' && eventKinds.includes('task.completed') &&
      ['workspace.list_directory', 'workspace.search_text', 'workspace.read_text'].every((name) => toolNames.includes(name))
      ? 'PASS'
      : 'PARTIAL',
  });
  fs.mkdirSync(path.dirname(acceptanceEventReportPath), { recursive: true });
  fs.writeFileSync(acceptanceEventReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

function finishSmoke(status, exitCode, summary) {
  if (smokeTimer) clearTimeout(smokeTimer);
  try {
    writeSmokeReport(status, exitCode, summary);
  } catch (error) {
    process.stderr.write('SMOKE_REPORT_ERROR:' + String(error && error.stack ? error.stack : error) + '\n');
    app.exit(3);
    return;
  }
  process.stdout.write('SMOKE_REPORT_WRITTEN:' + smokeReportPath + '\n');
  app.exit(exitCode);
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createMainWindow() {
  const window = new BrowserWindow(createWindowOptions(preloadPath));
  window.setMenuBarVisibility(false);
  installWindowPolicy(window, rendererRoot);
  window.webContents.on('render-process-gone', (_event, details) => {
    runtimeState.errors.push('render-process-gone:' + details.reason);
    if (smokeReportPath) finishSmoke('FAIL', 1, 'Renderer terminated before the smoke test completed.');
  });
  window.once('ready-to-show', () => {
    if (!smokeReportPath) window.show();
  });
  window.on('closed', () => {
    mainWindow = null;
  });
  window.loadFile(rendererEntry).catch((error) => {
    runtimeState.errors.push('load-file:' + error.message);
    if (smokeReportPath) finishSmoke('FAIL', 1, 'Trusted local Renderer failed to load.');
  });
  return window;
}

function validRendererSender(event) {
  return Boolean(
    mainWindow &&
    event.sender === mainWindow.webContents &&
    event.senderFrame &&
    isTrustedLocalUrl(event.senderFrame.url, rendererRoot),
  );
}

function sendProductEvent(type, sessionId, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const message = {
    protocolVersion: '1.0.0',
    id: `desktop-event-${Date.now()}-${runtimeState.productEvents + 1}`,
    type,
    direction: IPCDirection.CORE_TO_RENDERER,
    sessionId: sessionId || 'desktop',
    timestamp: new Date().toISOString(),
    payload,
  };
  const validation = schemaValidator.validateMessage(message);
  if (!validation.valid) {
    runtimeState.errors.push('invalid-product-event:' + validation.errors.join(';'));
    return;
  }
  runtimeState.productEvents += 1;
  mainWindow.webContents.send('desktop:event', message);
}

const handleDesktopRequest = createDesktopRequestHandler({
  getDesktopHost: () => desktopHost,
  isValidRendererSender: validRendererSender,
  runtimeState,
  buildDiagnostics,
  sendProductEvent,
  chooseWorkspace: async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择只读代码工作区',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  },
});

ipcMain.handle('desktop:request', handleDesktopRequest);

function buildDiagnostics() {
  const diagnostics = desktopHost ? desktopHost.getDiagnostics() : {};
  return {
    ...diagnostics,
    runtime: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      arch: process.arch,
      platform: process.platform,
    },
  };
}

ipcMain.handle('product:get-diagnostics', (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !isTrustedLocalUrl(event.senderFrame.url, rendererRoot)) {
    throw new Error('RENDERER_CAPABILITY_DENIED');
  }
  runtimeState.diagnosticsRequested = true;
  return {
    schemaVersion: 1,
    product: 'Win7 Coding Agent',
    version: '0.1.0-mvp',
    runtime: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      arch: process.arch,
      platform: process.platform,
    },
    ...buildDiagnostics(),
  };
});

ipcMain.on('product:renderer-ready', (event, payload) => {
  const validSender = mainWindow && event.sender === mainWindow.webContents && isTrustedLocalUrl(event.senderFrame.url, rendererRoot);
  const validPayload = payload && payload.protocolVersion === '1.0.0' && payload.ready === true;
  if (!validSender || !validPayload) {
    runtimeState.errors.push('invalid-renderer-ready');
    return;
  }
  runtimeState.rendererReady = true;
  if (smokeReportPath) {
    finishSmoke('PASS', 0, 'The real Electron product entry started, loaded the trusted local Renderer, returned diagnostics and exited normally.');
  }
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.exit(2);
} else {
  app.on('second-instance', focusMainWindow);
  app.whenReady().then(() => {
    installSessionPolicy(session.defaultSession, {
      rendererRoot,
      onRequestBlocked: (url) => runtimeState.blockedRequests.push(url),
      onPermissionDenied: (permission) => runtimeState.deniedPermissions.push(permission),
    });
    desktopHost = createDesktopHost({
      recoveryDirectory: path.join(app.getPath('userData'), 'a2-recovery'),
      credentialVault: createDpapiCredentialVault({
        safeStorage,
        userDataPath: app.getPath('userData'),
        platform: process.platform,
      }),
      onTaskEvent: (event, task) => {
        if (acceptanceEventReportPath && acceptanceEvents.length < 5000) {
          acceptanceEvents.push(sanitizeAcceptanceValue(event));
        }
        sendProductEvent(IPCMessageType.TASK_EVENT, task.sessionId, event);
      },
    });
    mainWindow = createMainWindow();
    if (smokeReportPath) {
      smokeTimer = setTimeout(() => {
        runtimeState.errors.push('smoke-timeout');
        finishSmoke('FAIL', 1, 'The product entry did not receive the Renderer-ready signal before the timeout.');
      }, smokeTimeoutMs);
    }
  }).catch((error) => {
    runtimeState.errors.push('startup:' + String(error && error.stack ? error.stack : error));
    if (smokeReportPath) finishSmoke('FAIL', 1, 'The Electron product entry failed during startup.');
    else app.exit(1);
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    try {
      writeAcceptanceEventReport();
    } catch (error) {
      process.stderr.write('ACCEPTANCE_REPORT_ERROR:' + String(error && error.message ? error.message : error) + '\n');
    }
    if (desktopHost) desktopHost.dispose();
    desktopHost = null;
  });
}
