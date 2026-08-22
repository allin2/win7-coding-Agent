'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
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
const { createA8ProductRequestHandler } = require('./a8-product-ipc');
const { createA9ProductRequestHandler } = require('./a9-product-ipc');
const { createA9AgentRuntime } = require('./a9-agent-runtime');
const { installSessionPolicy, installWindowPolicy } = require('./security-policy');
const { createDesktopHost } = require('./desktop-host');
const { createDpapiCredentialVault } = require('./credential-vault');
const { createProductRunner } = require('./runner-runtime');
const { createRcComposition } = require('./rc-composition');
const { schemaValidator } = require('../dist/ipc/schema');
const { IPCDirection, IPCMessageType } = require('../dist/ipc/messages');

const productRoot = __dirname;
const rendererRoot = path.join(productRoot, 'renderer');
const rendererEntry = path.join(rendererRoot, 'index.html');
const preloadPath = path.join(productRoot, 'preload.js');
const startedAt = new Date().toISOString();
const mvpId = readArgument('--mvp-id=') || 'MVP-UNKNOWN';
const smokeReportPath = readArgument('--smoke-report=');
const a8ReviewSmokeReportPath = readArgument('--a8-review-smoke-report=');
const a8ReviewSmokeWorkspace = readArgument('--a8-review-smoke-workspace=');
const a8ReviewSmokeScreenshotPath = readArgument('--a8-review-smoke-screenshot=');
const a8BoundarySmokeReportPath = readArgument('--a8-boundary-smoke-report=');
const a8BoundarySmokeScreenshotPath = readArgument('--a8-boundary-smoke-screenshot=');
const acceptanceEventReportPath = readArgument('--acceptance-event-report=');
const runnerManifestPath = readArgument('--runner-manifest=');
const runnerManifestSha256 = readArgument('--runner-manifest-sha256=');
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
let rcComposition = null;
const acceptanceEvents = [];
let acceptanceReportWritten = false;
let a8ReviewSmokeSession = null;
let a8ReviewSmokeFinished = false;
let a8ReviewSmokeFailureMode = null;
let a8BoundarySmokeFinished = false;

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

function a8ReviewArtifactHashes() {
  const files = {
    main_js: __filename,
    preload_js: preloadPath,
    desktop_host_js: path.join(productRoot, 'desktop-host.js'),
    a8_product_ipc_js: path.join(productRoot, 'a8-product-ipc.js'),
    gateway_runtime_js: path.join(productRoot, 'gateway-runtime.js'),
    renderer_html: rendererEntry,
    renderer_js: path.join(rendererRoot, 'renderer.js'),
    renderer_session_ui: path.join(rendererRoot, 'session-ui.js'),
    renderer_css: path.join(rendererRoot, 'styles.css'),
    renderer_a8_css: path.join(rendererRoot, 'a8-workspace.css'),
  };
  return Object.fromEntries(Object.entries(files).map(([name, filePath]) => [name, sha256(filePath)]));
}

function a8BoundaryArtifactHashes() {
  return {
    ...a8ReviewArtifactHashes(),
    renderer_runner_log: sha256(path.join(rendererRoot, 'runner-log.js')),
  };
}

function requireModuleFromProduct(relativeName) {
  const candidates = [
    path.join(__dirname, '../../', relativeName),
    path.join(__dirname, '../', relativeName),
  ];
  const candidate = candidates.find((item) => fs.existsSync(item));
  if (!candidate) throw new Error(`Product module is not packaged: ${relativeName}`);
  return require(candidate);
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
      renderer_runner_log: sha256(path.join(rendererRoot, 'runner-log.js')),
      renderer_js: sha256(path.join(rendererRoot, 'renderer.js')),
      renderer_session_ui: sha256(path.join(rendererRoot, 'session-ui.js')),
      renderer_css: sha256(path.join(rendererRoot, 'styles.css')),
      runner_runtime: sha256(path.join(productRoot, 'runner-runtime.js')),
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
      ...(rcComposition ? [{
        case_id: 'RC_PRODUCT_COMPOSITION',
        status,
        summary: 'The release composition verified its manifest-bound D-013 Runner and D-014 SQLite runtime before creating the Renderer.',
        metrics: {
          release_id: rcComposition.releaseId,
          version: rcComposition.version,
          runner_profile: rcComposition.runnerAcceptanceAction.profileId,
          storage_profile: rcComposition.stateRuntimeProfile.profile,
          sqlite_version: rcComposition.stateRuntimeProfile.sqliteVersion,
          journal_mode: rcComposition.stateRuntimeProfile.journalMode,
          interactive_terminal: rcComposition.disabledCapabilities.interactiveTerminal,
          arbitrary_shell: rcComposition.disabledCapabilities.arbitraryShell,
        },
        evidence: [],
      }] : []),
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

async function runA8ReviewElectronSmoke() {
  if (!a8ReviewSmokeReportPath || !a8ReviewSmokeWorkspace || !a8ReviewSmokeSession) {
    throw new Error('A8_REVIEW_SMOKE_CONFIGURATION_INVALID');
  }
  const workspaceRoot = path.resolve(a8ReviewSmokeWorkspace);
  const initial = {
    app: fs.readFileSync(path.join(workspaceRoot, 'src', 'app.ts')),
    obsolete: fs.readFileSync(path.join(workspaceRoot, 'docs', 'obsolete.md')),
    driftA: fs.readFileSync(path.join(workspaceRoot, 'src', 'drift-a.ts')),
    driftB: fs.readFileSync(path.join(workspaceRoot, 'src', 'drift-b.ts')),
    recoveryA: fs.readFileSync(path.join(workspaceRoot, 'src', 'recovery-a.ts')),
    recoveryB: fs.readFileSync(path.join(workspaceRoot, 'src', 'recovery-b.ts')),
  };
  const expected = {
    app: Buffer.from('export const value = "reviewed";\r\n', 'utf8'),
    created: Buffer.from('export const created = true;\n', 'utf8'),
  };
  const proposals = [
    { relativePath: 'src/app.ts', operation: 'MODIFY', afterContentBase64: expected.app.toString('base64') },
    { relativePath: 'src/new.ts', operation: 'CREATE', afterContentBase64: expected.created.toString('base64') },
    { relativePath: 'docs/obsolete.md', operation: 'DELETE' },
  ];

  const textAttachment = await mainWindow.webContents.executeJavaScript(`(() => {
    const first = document.querySelector('#session-list li');
    if (!first) throw new Error('A8_REVIEW_SMOKE_SESSION_NOT_RENDERED');
    first.click();
    const trigger = document.getElementById('attach-text');
    if (trigger.disabled) throw new Error('A8_TEXT_ATTACHMENT_TRIGGER_DISABLED');
    trigger.click();
    const drawer = document.getElementById('text-context-drawer');
    const opened = drawer.hidden === false && document.activeElement === document.getElementById('text-context-label');
    document.getElementById('text-context-label').value = '验收说明.txt';
    document.getElementById('text-context-content').value = 'Win10 文本上下文验收';
    document.getElementById('text-context-content').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('text-context-form').requestSubmit();
    return {
      opened,
      closedAfterSubmit: drawer.hidden === true,
      chipText: document.getElementById('context-chips').textContent,
      counterReset: document.getElementById('text-context-counter').textContent === '0 B / 64 KiB',
      nodeIntegration: typeof require !== 'undefined',
      processExposed: typeof process !== 'undefined',
      preloadApi: typeof window.win7Agent === 'object',
    };
  })()`);
  const task = desktopHost.submitTask({
    sessionId: a8ReviewSmokeSession.sessionId,
    prompt: '准备三文件 Review，并保持删除项不写入。',
    scenario: 'review',
    reviewProposals: proposals,
  });
  await waitForRenderer(`document.querySelectorAll('#review-files li').length === 3 && document.getElementById('review-status').textContent === 'READY'`);

  const decisions = await decideA8ReviewFiles([
    { key: 'modify', relativePath: 'src/app.ts', actionId: 'review-accept', expected: 'ACCEPTED' },
    { key: 'create', relativePath: 'src/new.ts', actionId: 'review-accept', expected: 'ACCEPTED' },
    { key: 'delete', relativePath: 'docs/obsolete.md', actionId: 'review-reject', expected: 'REJECTED' },
  ]);

  await mainWindow.webContents.executeJavaScript(`document.getElementById('review-validation-not-run').click()`);
  await waitForRenderer(`document.getElementById('review-validation-state').textContent.indexOf('NOT_RUN') === 0`);
  const forgedApproval = await mainWindow.webContents.executeJavaScript(`(async () => {
    const issued = await window.win7Agent.issueReviewApproval(${JSON.stringify(a8ReviewSmokeSession.sessionId)}, ${JSON.stringify(task.taskId)}, 'electron-smoke-negative');
    if (!issued || !issued.ok || !issued.result || !issued.result.approval) throw new Error('A8_REVIEW_SMOKE_APPROVAL_NOT_ISSUED');
    const forged = { ...issued.result.approval, acceptedSetHash: '0'.repeat(64) };
    const result = await window.win7Agent.applyReview(${JSON.stringify(a8ReviewSmokeSession.sessionId)}, ${JSON.stringify(task.taskId)}, forged);
    return result;
  })()`);
  if (!forgedApproval || forgedApproval.ok !== false || !forgedApproval.error || forgedApproval.error.code !== 'APPROVAL_INVALID') {
    throw new Error('A8_REVIEW_SMOKE_FORGED_APPROVAL_NOT_REJECTED');
  }

  await mainWindow.webContents.executeJavaScript(`document.getElementById('review-issue-approval').click()`);
  await waitForRenderer(`document.getElementById('review-apply').disabled === false`);
  await mainWindow.webContents.executeJavaScript(`document.getElementById('review-apply').click()`);
  await waitForRenderer(`document.getElementById('review-status').textContent === 'APPLIED'`);
  await waitForRenderer(`document.getElementById('task-state').textContent === '已完成'`);

  const renderer = await mainWindow.webContents.executeJavaScript(`(() => {
    const conversation = document.getElementById('conversation');
    const composer = document.querySelector('.composer-wrap');
    const activeView = conversation.querySelector('.session-view:not([hidden])');
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.height = '2000px';
    probe.style.pointerEvents = 'none';
    activeView.appendChild(probe);
    const composerRect = composer.getBoundingClientRect();
    const scrollBefore = conversation.scrollTop;
    conversation.scrollTop = conversation.scrollHeight;
    const layout = {
      composerTop: composerRect.top,
      composerBottom: composerRect.bottom,
      composerVisible: composerRect.top >= 0 && composerRect.bottom <= window.innerHeight,
      conversationClientHeight: conversation.clientHeight,
      conversationScrollHeight: conversation.scrollHeight,
      scrollBefore,
      scrollAfter: conversation.scrollTop,
      scrollable: conversation.scrollHeight > conversation.clientHeight && conversation.scrollTop > 0,
    };
    probe.remove();
    return {
      nodeIntegration: typeof require !== 'undefined',
      processExposed: typeof process !== 'undefined',
      preloadApi: typeof window.win7Agent === 'object',
      reviewStatus: document.getElementById('review-status').textContent,
      validationStatus: document.getElementById('review-validation-state').textContent,
      summary: document.getElementById('review-summary').textContent,
      fileRows: Array.from(document.querySelectorAll('#review-files li')).map((item) => item.textContent),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      layout,
    };
  })()`);
  if (a8ReviewSmokeScreenshotPath) {
    fs.mkdirSync(path.dirname(a8ReviewSmokeScreenshotPath), { recursive: true });
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(a8ReviewSmokeScreenshotPath, image.toPNG());
  }
  const final = {
    app: fs.readFileSync(path.join(workspaceRoot, 'src', 'app.ts')),
    created: fs.readFileSync(path.join(workspaceRoot, 'src', 'new.ts')),
    obsolete: fs.readFileSync(path.join(workspaceRoot, 'docs', 'obsolete.md')),
  };

  const driftExpectedA = Buffer.from('export const driftA = "reviewed";\n', 'utf8');
  const driftExpectedB = Buffer.from('export const driftB = "reviewed";\n', 'utf8');
  const driftTask = desktopHost.submitTask({
    sessionId: a8ReviewSmokeSession.sessionId,
    prompt: '验证 Review 基线漂移时整组零写入。',
    scenario: 'review',
    reviewProposals: [
      { relativePath: 'src/drift-a.ts', operation: 'MODIFY', afterContentBase64: driftExpectedA.toString('base64') },
      { relativePath: 'src/drift-b.ts', operation: 'MODIFY', afterContentBase64: driftExpectedB.toString('base64') },
    ],
  });
  await waitForRenderer(`document.querySelectorAll('#review-files li').length === 2 && document.getElementById('review-files').textContent.includes('src/drift-b.ts') && document.getElementById('review-status').textContent === 'READY'`);
  const driftDecisions = await decideA8ReviewFiles([
    { key: 'first', relativePath: 'src/drift-a.ts', actionId: 'review-accept', expected: 'ACCEPTED' },
    { key: 'second', relativePath: 'src/drift-b.ts', actionId: 'review-accept', expected: 'ACCEPTED' },
  ]);
  await mainWindow.webContents.executeJavaScript(`document.getElementById('review-issue-approval').click()`);
  await waitForRenderer(`document.getElementById('review-apply').disabled === false`);
  const externalDrift = Buffer.from('export const driftB = "external-change";\n', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, 'src', 'drift-b.ts'), externalDrift);
  await mainWindow.webContents.executeJavaScript(`document.getElementById('review-apply').click()`);
  await waitForRenderer(`document.getElementById('review-status').textContent === 'STALE'`);
  await waitForRenderer(`document.getElementById('task-state').textContent === '失败'`);
  const driftFinal = {
    first: fs.readFileSync(path.join(workspaceRoot, 'src', 'drift-a.ts')),
    second: fs.readFileSync(path.join(workspaceRoot, 'src', 'drift-b.ts')),
  };
  const driftRenderer = await mainWindow.webContents.executeJavaScript(`(() => ({
    status: document.getElementById('review-status').textContent,
    taskState: document.getElementById('task-state').textContent,
    fileRows: Array.from(document.querySelectorAll('#review-files li')).map((item) => item.textContent),
  }))()`);

  a8ReviewSmokeFailureMode = 'verify-and-rollback';
  const recoveryExpectedA = Buffer.from('export const recoveryA = "reviewed";\n', 'utf8');
  const recoveryExpectedB = Buffer.from('export const recoveryB = "reviewed";\n', 'utf8');
  const recoveryTask = desktopHost.submitTask({
    sessionId: a8ReviewSmokeSession.sessionId,
    prompt: '验证 Review 回滚不确定后的恢复闭环。',
    scenario: 'review',
    reviewProposals: [
      { relativePath: 'src/recovery-a.ts', operation: 'MODIFY', afterContentBase64: recoveryExpectedA.toString('base64') },
      { relativePath: 'src/recovery-b.ts', operation: 'MODIFY', afterContentBase64: recoveryExpectedB.toString('base64') },
    ],
  });
  await waitForRenderer(`document.querySelectorAll('#review-files li').length === 2 && document.getElementById('review-files').textContent.includes('src/recovery-b.ts') && document.getElementById('review-status').textContent === 'READY'`);
  const recoveryDecisions = await decideA8ReviewFiles([
    { key: 'first', relativePath: 'src/recovery-a.ts', actionId: 'review-accept', expected: 'ACCEPTED' },
    { key: 'second', relativePath: 'src/recovery-b.ts', actionId: 'review-accept', expected: 'ACCEPTED' },
  ]);
  await mainWindow.webContents.executeJavaScript(`document.getElementById('review-issue-approval').click()`);
  await waitForRenderer(`document.getElementById('review-apply').disabled === false`);
  await mainWindow.webContents.executeJavaScript(`document.getElementById('review-apply').click()`);
  await waitForRenderer(`document.getElementById('review-status').textContent === 'RECOVERY_REQUIRED' && document.getElementById('review-recovery').disabled === false`);
  const recoveryBefore = await mainWindow.webContents.executeJavaScript(`(() => ({
    status: document.getElementById('review-status').textContent,
    recoveryEnabled: document.getElementById('review-recovery').disabled === false,
    taskState: document.getElementById('task-state').textContent,
  }))()`);
  a8ReviewSmokeFailureMode = null;
  await mainWindow.webContents.executeJavaScript(`document.getElementById('review-recovery').click()`);
  await waitForRenderer(`document.getElementById('review-status').textContent === 'READY' && document.getElementById('review-recovery').disabled === true`);
  const recoveryFinal = {
    first: fs.readFileSync(path.join(workspaceRoot, 'src', 'recovery-a.ts')),
    second: fs.readFileSync(path.join(workspaceRoot, 'src', 'recovery-b.ts')),
  };
  const recoveryAfter = await mainWindow.webContents.executeJavaScript(`(() => ({
    status: document.getElementById('review-status').textContent,
    recoveryEnabled: document.getElementById('review-recovery').disabled === false,
    taskState: document.getElementById('task-state').textContent,
  }))()`);
  const cases = [
    resultCase('A8R-01-02-ELECTRON-REVIEW', decisions.modify === 'ACCEPTED' && decisions.create === 'ACCEPTED' && decisions.delete === 'REJECTED' && renderer.fileRows.length === 3, '真实 Renderer 经 Preload/IPC 完成三文件逐项决定。'),
    resultCase('A8R-07-NOT-RUN', renderer.validationStatus.indexOf('NOT_RUN') === 0, '没有登记项目 Runner Profile 时真实显示 NOT_RUN。'),
    resultCase('A8C-02-FORGED-APPROVAL', forgedApproval.ok === false && forgedApproval.error.code === 'APPROVAL_INVALID', '伪造 accepted-set hash 的 Apply 经真实 IPC fail-closed。'),
    resultCase('A8R-02-04-APPLY-SUBSET', final.app.equals(expected.app) && final.created.equals(expected.created) && final.obsolete.equals(initial.obsolete), '只应用已接受集合，拒绝删除项保持原字节。'),
    resultCase('A8R-04-BASELINE-DRIFT-ZERO-WRITE', driftTask.taskId !== task.taskId && driftDecisions.first === 'ACCEPTED' && driftDecisions.second === 'ACCEPTED' && driftRenderer.status === 'STALE' && driftFinal.first.equals(initial.driftA) && driftFinal.second.equals(externalDrift), '第二个目标发生外部漂移时，真实 Renderer 显示 STALE，整组未写入任何提案字节。'),
    resultCase('A8R-05-RECOVERY-RENDERER', recoveryTask.taskId !== driftTask.taskId && recoveryDecisions.first === 'ACCEPTED' && recoveryDecisions.second === 'ACCEPTED' && recoveryBefore.status === 'RECOVERY_REQUIRED' && recoveryBefore.recoveryEnabled === true && recoveryAfter.status === 'READY' && recoveryAfter.recoveryEnabled === false && recoveryFinal.first.equals(initial.recoveryA) && recoveryFinal.second.equals(initial.recoveryB), '验证与回滚故障进入 RECOVERY_REQUIRED；用户经真实 Renderer 恢复后原字节一致且写锁解除。'),
    resultCase('A8C-02-RENDERER-CAPABILITY', renderer.nodeIntegration === false && renderer.processExposed === false && renderer.preloadApi === true, 'Renderer 无 Node/process，只获得冻结 Preload API。'),
    resultCase('A8R-01-VISUAL-BOUNDS', renderer.horizontalOverflow <= 0, '真实 Electron 视口无水平页面溢出。'),
    resultCase('A8UX-01-CONVERSATION-SCROLL', renderer.verticalOverflow <= 0 && renderer.layout.composerVisible === true && renderer.layout.conversationClientHeight > 0 && renderer.layout.scrollable === true, '长对话只在中间内容区滚动，Composer 始终位于真实 Electron 视口内。'),
    resultCase('A8UX-02-TEXT-ATTACHMENT-DIALOG', textAttachment.opened === true && textAttachment.closedAfterSubmit === true && textAttachment.chipText.includes('@text 验收说明.txt') && textAttachment.counterReset === true, '“＋ 文本”打开应用内对话框，提交后生成当前轮上下文标签并关闭对话框。'),
  ];
  const report = {
    schema_version: 1,
    record_id: 'A8-03-ELECTRON-REVIEW-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14),
    recorded_at: new Date().toISOString(),
    status: cases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL',
    evidence_class: process.versions.electron === '22.3.27' ? 'TARGET_ELECTRON' : 'DEVELOPER_SURROGATE_ELECTRON',
    environment: { platform: process.platform, arch: process.arch, electron: process.versions.electron, node: process.versions.node, node_abi: Number(process.versions.modules), system_version: os.release(), chrome: process.versions.chrome },
    command: [process.execPath].concat(process.argv.slice(1)),
    artifact_hashes: a8ReviewArtifactHashes(),
    system_prompt: require('./gateway-runtime').getSystemPromptContract(),
    workspace: {
      isolated: true,
      initial_sha256: { app: sha256Buffer(initial.app), obsolete: sha256Buffer(initial.obsolete), drift_a: sha256Buffer(initial.driftA), drift_b: sha256Buffer(initial.driftB), recovery_a: sha256Buffer(initial.recoveryA), recovery_b: sha256Buffer(initial.recoveryB) },
      final_sha256: { app: sha256Buffer(final.app), created: sha256Buffer(final.created), obsolete: sha256Buffer(final.obsolete), drift_a: sha256Buffer(driftFinal.first), drift_b: sha256Buffer(driftFinal.second), recovery_a: sha256Buffer(recoveryFinal.first), recovery_b: sha256Buffer(recoveryFinal.second) },
    },
    renderer,
    drift_renderer: driftRenderer,
    recovery_renderer: { before: recoveryBefore, after: recoveryAfter },
    cases,
    external_validation: { win10: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE', win7: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE' },
    notes: [
      'This run uses the real Electron BrowserWindow, production preload, product IPC validators, Desktop Host, Review staging and Renderer scripts.',
      'A non-22 developer Electron is surrogate evidence only and cannot replace the locked Electron 22.3.27 Windows or Win7 product Gate.',
      'No project Runner Profile exists; the validation result is intentionally NOT_RUN.',
    ],
  };
  fs.mkdirSync(path.dirname(a8ReviewSmokeReportPath), { recursive: true });
  fs.writeFileSync(a8ReviewSmokeReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  a8ReviewSmokeFinished = true;
  process.stdout.write('A8_REVIEW_SMOKE_REPORT_WRITTEN:' + a8ReviewSmokeReportPath + '\n');
  app.exit(report.status === 'PASS' ? 0 : 1);
}

async function runA8BoundaryElectronSmoke() {
  if (!a8BoundarySmokeReportPath || !a8BoundarySmokeSessionReady()) {
    throw new Error('A8_BOUNDARY_SMOKE_CONFIGURATION_INVALID');
  }
  const terminalInputResult = await handleDesktopRequest(
    { sender: mainWindow.webContents, senderFrame: mainWindow.webContents.mainFrame },
    {
      protocolVersion: '1.0.0',
      id: 'a8-boundary-terminal-negative',
      type: IPCMessageType.TERMINAL_INPUT,
      direction: IPCDirection.RENDERER_TO_CORE,
      sessionId: 'desktop',
      timestamp: new Date().toISOString(),
      payload: { sessionId: 'desktop', data: 'forbidden-input\r' },
    },
  );
  const inspection = await mainWindow.webContents.executeJavaScript(`(async () => {
    const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
    const nav = Array.from(document.querySelectorAll('.product-nav .nav-item')).map((item) => ({
      text: item.textContent.trim(), disabled: item.disabled, title: item.getAttribute('title') || '',
    }));
    const terminal = nav.find((item) => item.text.includes('Terminal')) || {};
    const browser = nav.find((item) => item.text.includes('Browser')) || {};
    const apiKeys = Object.keys(window.win7Agent || {}).sort();
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
    document.getElementById('open-settings').click();
    await pause();
    const settingsDrawerOpen = document.getElementById('settings-drawer').hidden === false;
    const apiKeyInput = document.getElementById('gateway-api-key');
    const fakeSecret = 'a8-boundary-secret-sentinel-not-for-report';
    const configured = await window.win7Agent.setSettings({
      mode: 'gateway', gatewayUrl: 'http://127.0.0.1:9', model: 'a8-boundary-smoke', caBundlePath: 'a8-boundary-ca.pem', apiKey: fakeSecret, rememberApiKey: false,
    });
    const readback = await window.win7Agent.getSettings();
    const settingsText = JSON.stringify({ configured, readback });
    const secretEchoed = settingsText.includes(fakeSecret) || apiKeyInput.value.includes(fakeSecret);
    const passwordInput = { type: apiKeyInput.type, autocomplete: apiKeyInput.autocomplete, valueEmpty: apiKeyInput.value === '' };
    document.querySelector('[data-close="settings-drawer"]').click();
    document.getElementById('open-diagnostics').click();
    await pause();
    const diagnosticsDrawerOpen = document.getElementById('diagnostics-drawer').hidden === false;
    const diagnostics = await window.win7Agent.getDiagnostics();
    const diagnosticsText = JSON.stringify(diagnostics);
    const diagnosticsHasSecret = diagnosticsText.includes(fakeSecret);
    const capabilities = diagnostics.capabilities || {};
    const systemPrompt = diagnostics.systemPrompt || {};
    const hostileRunnerText = '\\x1b[31mred\\x1b[0m \\x1b]52;c;Y2xpcGJvYXJk\\x07 javascript:alert(1)';
    const cleanRunnerText = window.win7AgentRunnerLog.sanitize(hostileRunnerText);
    const runnerLog = window.win7AgentRunnerLog.create(64 * 1024);
    runnerLog.append('stdout', 'x'.repeat(70 * 1024));
    runnerLog.append('stderr', cleanRunnerText);
    const runnerSnapshot = runnerLog.snapshot();
    await window.win7Agent.setSettings({ mode: 'replay' });
    return {
      terminal, browser, apiKeys, csp, settingsDrawerOpen, diagnosticsDrawerOpen, passwordInput,
      secretEchoed, diagnosticsHasSecret,
      capabilities: { runner: capabilities.runner || '', terminal: capabilities.terminal || '', gateway: capabilities.gateway || '' },
      systemPrompt: { version: systemPrompt.version || '', sha256: systemPrompt.sha256 || '' },
      runnerLog: { cleanRunnerText, snapshot: runnerSnapshot },
      cspDeny: csp.includes("default-src 'none'") && csp.includes("connect-src 'none'") && csp.includes("frame-src 'none'"),
    };
  })()`);
  const cases = [
    resultCase('A8T-01-TERMINAL-DISABLED', inspection.terminal.disabled === true && /未授权|禁用/.test(inspection.terminal.title + inspection.terminal.text) && !inspection.apiKeys.some((key) => /terminal|pty|stdin|input/i.test(key)), 'Terminal 在真实 Renderer 中保持 disabled，且 Preload 不暴露输入/pty API。'),
    resultCase('A8B-01-BROWSER-DISABLED', inspection.browser.disabled === true && /未授权|禁用|公网/.test(inspection.browser.title + inspection.browser.text) && !inspection.apiKeys.some((key) => /browser|navigate|openUrl|url/i.test(key)), 'Browser 在真实 Renderer 中保持 disabled，且 Preload 不暴露导航/远程网页 API。'),
    resultCase('A8R-08-RUNNER-PRESENTATION', /unavailable|native-trusted-profile-only|profile/i.test(inspection.capabilities.runner) && !/shell|arbitrary/i.test(inspection.capabilities.runner), 'Runner 能力只显示受信 Profile/不可用状态，不扩大为任意 Shell。'),
    resultCase('A8R-09-RUNNER-LOG-BOUNDARY', inspection.runnerLog.snapshot.stdout.length === 64 * 1024 && inspection.runnerLog.snapshot.stdoutTruncated === true && inspection.runnerLog.snapshot.stderr.includes('[blocked-link]') && inspection.runnerLog.cleanRunnerText.indexOf(String.fromCharCode(27)) < 0 && !/javascript:|clipboard/i.test(inspection.runnerLog.cleanRunnerText), '真实 Renderer RunnerLog 分离 stdout/stderr，限制 64 KiB，并清除控制序列与危险链接。'),
    resultCase('A8D-01-SETTINGS-REDACTION', inspection.settingsDrawerOpen === true && inspection.passwordInput.type === 'password' && inspection.passwordInput.valueEmpty === true && inspection.secretEchoed === false, 'Settings 通过真实 IPC 配置 fake key 后不回显原值，仅保留状态元数据。'),
    resultCase('A8D-02-DIAGNOSTICS-SYSTEM-PROMPT', inspection.diagnosticsDrawerOpen === true && inspection.diagnosticsHasSecret === false && /^a8-system-prompt-v1$/.test(inspection.systemPrompt.version) && /^[a-f0-9]{64}$/.test(inspection.systemPrompt.sha256), 'Diagnostics 按需打开并提供版本化 System Prompt/hash，不含凭据。'),
    resultCase('A8C-04-IPC-TERMINAL-FAIL-CLOSED', terminalInputResult && terminalInputResult.ok === false && terminalInputResult.error && terminalInputResult.error.code === 'CAPABILITY_UNAVAILABLE', '直接调用兼容 terminal.input IPC 仍返回结构化 CAPABILITY_UNAVAILABLE，未执行输入。'),
    resultCase('A8C-03-CSP-PRELOAD-BOUNDARY', inspection.cspDeny === true, '真实 Renderer CSP 保持 default/connect/frame deny-by-default。'),
  ];
  const renderer = {
    viewport: await mainWindow.webContents.executeJavaScript('({ width: window.innerWidth, height: window.innerHeight, horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight })'),
    inspection,
  };
  if (a8BoundarySmokeScreenshotPath) {
    fs.mkdirSync(path.dirname(a8BoundarySmokeScreenshotPath), { recursive: true });
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(a8BoundarySmokeScreenshotPath, image.toPNG());
  }
  const report = {
    schema_version: 1,
    record_id: 'A8-04-BOUNDARY-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14),
    recorded_at: new Date().toISOString(),
    status: cases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL',
    evidence_class: process.versions.electron === '22.3.27' ? 'TARGET_ELECTRON' : 'DEVELOPER_SURROGATE_ELECTRON',
    environment: { platform: process.platform, arch: process.arch, electron: process.versions.electron, node: process.versions.node, node_abi: Number(process.versions.modules), system_version: os.release(), chrome: process.versions.chrome },
    artifact_hashes: a8BoundaryArtifactHashes(),
    ipc_probe: terminalInputResult,
    renderer,
    cases,
    external_validation: { win10: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE', win7: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE' },
    notes: [
      'This run uses the production BrowserWindow, Preload, CSP, Settings/Diagnostics IPC and disabled Terminal/Browser navigation surface.',
      'The fake credential sentinel is used only in-process and is not written to this report.',
      'No Terminal input, arbitrary Browser navigation, Shell command or new network target is enabled.',
    ],
  };
  fs.mkdirSync(path.dirname(a8BoundarySmokeReportPath), { recursive: true });
  fs.writeFileSync(a8BoundarySmokeReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  a8BoundarySmokeFinished = true;
  process.stdout.write('A8_BOUNDARY_SMOKE_REPORT_WRITTEN:' + a8BoundarySmokeReportPath + '\n');
  app.exit(report.status === 'PASS' ? 0 : 1);
}

function a8BoundarySmokeSessionReady() {
  return Boolean(mainWindow && !mainWindow.isDestroyed());
}

function resultCase(caseId, passed, summary) {
  return { case_id: caseId, status: passed ? 'PASS' : 'FAIL', summary };
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function waitForRenderer(expression, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    if (await mainWindow.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('A8_REVIEW_SMOKE_RENDERER_TIMEOUT:' + expression);
}

async function decideA8ReviewFiles(decisions) {
  return mainWindow.webContents.executeJavaScript(`(async () => {
    const decisions = ${JSON.stringify(decisions)};
    const result = {};
    const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
    for (const decision of decisions) {
      const row = Array.from(document.querySelectorAll('#review-files li')).find((item) => item.textContent.includes(decision.relativePath));
      if (!row) throw new Error('A8_REVIEW_SMOKE_FILE_NOT_RENDERED:' + decision.relativePath);
      row.querySelector('button').click();
      await pause();
      const action = document.getElementById(decision.actionId);
      if (!action || action.disabled) throw new Error('A8_REVIEW_SMOKE_ACTION_DISABLED:' + decision.actionId + ':' + decision.relativePath);
      action.click();
      let observed = false;
      for (let index = 0; index < 100; index += 1) {
        await pause();
        const current = Array.from(document.querySelectorAll('#review-files li')).find((item) => item.textContent.includes(decision.relativePath));
        if (current && current.querySelector('.review-decision').textContent === decision.expected) {
          result[decision.key] = decision.expected;
          observed = true;
          break;
        }
      }
      if (!observed) throw new Error('A8_REVIEW_SMOKE_DECISION_TIMEOUT:' + decision.relativePath);
    }
    return result;
  })()`);
}

async function failA8ReviewSmoke(error) {
  if (a8ReviewSmokeFinished) return;
  a8ReviewSmokeFinished = true;
  let rendererDebug = null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      rendererDebug = await mainWindow.webContents.executeJavaScript(`(() => ({
        taskState: document.getElementById('task-state') && document.getElementById('task-state').textContent,
        reviewStatus: document.getElementById('review-status') && document.getElementById('review-status').textContent,
        reviewPanelHidden: document.getElementById('review-panel') ? document.getElementById('review-panel').hidden : null,
        reviewRows: Array.from(document.querySelectorAll('#review-files li')).map((item) => item.textContent),
        reviewAcceptDisabled: document.getElementById('review-accept') ? document.getElementById('review-accept').disabled : null,
        reviewRejectDisabled: document.getElementById('review-reject') ? document.getElementById('review-reject').disabled : null,
        reviewApplyDisabled: document.getElementById('review-apply') ? document.getElementById('review-apply').disabled : null,
        timeline: Array.from(document.querySelectorAll('#timeline li')).slice(-20).map((item) => item.textContent),
      }))()`);
    } catch (debugError) {
      rendererDebug = { error: String(debugError && debugError.message ? debugError.message : debugError) };
    }
  }
  const report = {
    schema_version: 1,
    record_id: 'A8-03-ELECTRON-REVIEW-FAILED',
    recorded_at: new Date().toISOString(),
    status: 'FAIL',
    evidence_class: 'DEVELOPER_ELECTRON_FAILURE',
    error: sanitizeAcceptanceValue({ code: error && error.code ? error.code : 'A8_REVIEW_SMOKE_FAILED', message: error && error.message ? error.message : String(error) }),
    renderer_debug: rendererDebug,
    external_validation: { win10: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE', win7: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE' },
  };
  try {
    fs.mkdirSync(path.dirname(a8ReviewSmokeReportPath), { recursive: true });
    fs.writeFileSync(a8ReviewSmokeReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  } catch (writeError) {
    process.stderr.write('A8_REVIEW_SMOKE_REPORT_ERROR:' + String(writeError && writeError.stack ? writeError.stack : writeError) + '\n');
  }
  process.stderr.write('A8_REVIEW_SMOKE_FAILED:' + String(error && error.stack ? error.stack : error) + '\n');
  app.exit(1);
}

function failA8BoundarySmoke(error) {
  if (a8BoundarySmokeFinished) return;
  a8BoundarySmokeFinished = true;
  const report = {
    schema_version: 1,
    record_id: 'A8-04-BOUNDARY-FAILED',
    recorded_at: new Date().toISOString(),
    status: 'FAIL',
    evidence_class: 'DEVELOPER_ELECTRON_FAILURE',
    error: sanitizeAcceptanceValue({
      code: error && error.code ? error.code : 'A8_BOUNDARY_SMOKE_FAILED',
      message: error && error.message ? error.message : String(error),
    }),
    external_validation: {
      win10: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE',
      win7: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE',
    },
  };
  try {
    fs.mkdirSync(path.dirname(a8BoundarySmokeReportPath), { recursive: true });
    fs.writeFileSync(a8BoundarySmokeReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  } catch (writeError) {
    process.stderr.write('A8_BOUNDARY_SMOKE_REPORT_ERROR:' + String(writeError && writeError.stack ? writeError.stack : writeError) + '\n');
  }
  process.stderr.write('A8_BOUNDARY_SMOKE_FAILED:' + String(error && error.stack ? error.stack : error) + '\n');
  app.exit(1);
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
    else if (a8ReviewSmokeReportPath) failA8ReviewSmoke(new Error('Renderer terminated before the A8 Review smoke completed.'));
    else if (a8BoundarySmokeReportPath) failA8BoundarySmoke(new Error('Renderer terminated before the A8-04 boundary smoke completed.'));
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
    else if (a8ReviewSmokeReportPath) failA8ReviewSmoke(error);
    else if (a8BoundarySmokeReportPath) failA8BoundarySmoke(error);
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
ipcMain.handle('product:a8-request', createA8ProductRequestHandler({
  getDesktopHost: () => desktopHost,
  isValidRendererSender: validRendererSender,
}));

// A9 Trusted Agent Runtime（A9-06）：Renderer 只经此窄 IPC 访问。
let a9RuntimeInstance = null;
function getOrCreateA9Runtime() {
  if (!a9RuntimeInstance) {
    const a9DataRoot = path.join(app.getPath('userData'), 'a9');
    const workspaceRoot = desktopHost && desktopHost.getActiveWorkspacePath
      ? desktopHost.getActiveWorkspacePath()
      : process.env.WIN7AGENT_A9_WORKSPACE || a9DataRoot;
    a9RuntimeInstance = createA9AgentRuntime({
      workspaceRoot,
      dataRoot: a9DataRoot,
      ownerId: `main-${process.pid}`,
    });
  }
  return a9RuntimeInstance;
}
ipcMain.handle('product:a9-request', createA9ProductRequestHandler({
  getA9Runtime: getOrCreateA9Runtime,
  isValidRendererSender: validRendererSender,
}));
app.on('will-quit', () => {
  if (a9RuntimeInstance) a9RuntimeInstance.shutdown();
});

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
  } else if (a8ReviewSmokeReportPath) {
    void runA8ReviewElectronSmoke().catch(failA8ReviewSmoke);
  } else if (a8BoundarySmokeReportPath) {
    void runA8BoundaryElectronSmoke().catch(failA8BoundarySmoke);
  }
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.exit(2);
} else {
  app.on('second-instance', focusMainWindow);
  app.whenReady().then(async () => {
    installSessionPolicy(session.defaultSession, {
      rendererRoot,
      onRequestBlocked: (url) => runtimeState.blockedRequests.push(url),
      onPermissionDenied: (permission) => runtimeState.deniedPermissions.push(permission),
    });
    let productRunner = null;
    const rcRuntimePath = path.join(__dirname, '..', 'rc-runtime.json');
    if (fs.existsSync(rcRuntimePath)) {
      rcComposition = createRcComposition({
        applicationRoot: path.join(__dirname, '..'),
        userDataPath: app.getPath('userData'),
        stateModule: requireModuleFromProduct('state/dist'),
        runnerModule: requireModuleFromProduct('runner/dist'),
      });
      productRunner = {
        runner: rcComposition.runner,
        acceptanceAction: rcComposition.runnerAcceptanceAction,
      };
    } else if (runnerManifestPath || runnerManifestSha256) {
      try {
        productRunner = createProductRunner({
          runnerModule: requireModuleFromProduct('runner/dist'),
          manifestPath: runnerManifestPath,
          expectedManifestSha256: runnerManifestSha256,
        });
      } catch (error) {
        runtimeState.errors.push('runner-manifest:' + String(error && error.message ? error.message : error));
      }
    }
    desktopHost = createDesktopHost({
      recoveryDirectory: path.join(app.getPath('userData'), 'a2-recovery'),
      reviewDirectory: path.join(app.getPath('userData'), 'a8-reviews'),
      ...(a8ReviewSmokeReportPath ? {
        reviewFailureInjector: (phase) => {
          if (a8ReviewSmokeFailureMode === 'verify-and-rollback' && (phase === 'verify' || phase === 'rollback')) {
            throw new Error(`A8_REVIEW_SMOKE_INJECTED_${phase.toUpperCase()}_FAILURE`);
          }
        },
      } : {}),
      credentialVault: createDpapiCredentialVault({
        safeStorage,
        userDataPath: app.getPath('userData'),
        platform: process.platform,
      }),
      ...(productRunner ? { runner: productRunner.runner, runnerAcceptanceAction: productRunner.acceptanceAction } : {}),
      ...(rcComposition ? {
        ledger: rcComposition.ledger,
        sessionCatalog: rcComposition.sessionCatalog,
        recoveryReport: rcComposition.recoveryReport,
        closeState: () => rcComposition.close(),
        runnerWorkDirectory: rcComposition.runnerWorkDirectory,
        stateCapability: rcComposition.stateCapability,
        stateRuntimeProfile: rcComposition.stateRuntimeProfile,
        disabledCapabilities: rcComposition.disabledCapabilities,
        productIdentity: { product: 'Win7 Coding Agent RC', version: rcComposition.version },
      } : {}),
      onTaskEvent: (event, task) => {
        if (acceptanceEventReportPath && acceptanceEvents.length < 5000) {
          acceptanceEvents.push(sanitizeAcceptanceValue(event));
        }
        sendProductEvent(IPCMessageType.TASK_EVENT, task.sessionId, event);
      },
    });
    if (a8ReviewSmokeReportPath || a8ReviewSmokeWorkspace) {
      if (!a8ReviewSmokeReportPath || !a8ReviewSmokeWorkspace) throw new Error('A8_REVIEW_SMOKE_CONFIGURATION_INVALID');
      const selected = await desktopHost.selectWorkspace(a8ReviewSmokeWorkspace);
      a8ReviewSmokeSession = desktopHost.createSession({ workspacePath: selected.workspacePath, label: 'A8 Electron Review Smoke' });
    }
    mainWindow = createMainWindow();
    if (smokeReportPath || a8ReviewSmokeReportPath || a8BoundarySmokeReportPath) {
      smokeTimer = setTimeout(() => {
        runtimeState.errors.push('smoke-timeout');
        if (smokeReportPath) finishSmoke('FAIL', 1, 'The product entry did not receive the Renderer-ready signal before the timeout.');
        else if (a8ReviewSmokeReportPath) failA8ReviewSmoke(new Error('The A8 Review Electron smoke exceeded its timeout.'));
        else failA8BoundarySmoke(new Error('The A8-04 boundary Electron smoke exceeded its timeout.'));
      }, smokeTimeoutMs);
    }
  }).catch((error) => {
    runtimeState.errors.push('startup:' + String(error && error.stack ? error.stack : error));
    if (smokeReportPath) finishSmoke('FAIL', 1, 'The Electron product entry failed during startup.');
    else if (a8ReviewSmokeReportPath) failA8ReviewSmoke(error);
    else if (a8BoundarySmokeReportPath) failA8BoundarySmoke(error);
    else app.exit(1);
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    try {
      writeAcceptanceEventReport();
    } catch (error) {
      process.stderr.write('ACCEPTANCE_REPORT_ERROR:' + String(error && error.message ? error.message : error) + '\n');
    }
    if (desktopHost) {
      try {
        desktopHost.dispose();
      } catch (error) {
        runtimeState.errors.push('dispose:' + String(error && error.message ? error.message : error));
        process.stderr.write('PRODUCT_DISPOSE_ERROR:' + String(error && error.stack ? error.stack : error) + '\n');
      }
    } else if (rcComposition) {
      try {
        rcComposition.close();
      } catch (error) {
        runtimeState.errors.push('dispose-rc:' + String(error && error.message ? error.message : error));
        process.stderr.write('RC_DISPOSE_ERROR:' + String(error && error.stack ? error.stack : error) + '\n');
      }
    }
    desktopHost = null;
    rcComposition = null;
  });
}
