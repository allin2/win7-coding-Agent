'use strict';

/**
 * A9 桌面运行时复合组件（A9-06）。
 *
 * 实例化并连接真实组件：A9AgentLoop、A9WorkspaceService、TrustedShellRunner
 * （经 loop 适配器）、OpenAICompatibleProvider、A9 Persistence（真实 SQLite）
 * 与事件账本。正式产品不默认 Replay：Provider 未配置时 submitTurn 结构化拒绝。
 * Renderer 不获得任何 fs/child_process/凭据/网络能力——全部经本组件的
 * 版本化 IPC 动作。
 */

const fs = require('fs');
const path = require('path');
const { serializeError } = require('./desktop-host');

function requireModule(relativeName) {
  const candidates = [
    path.join(__dirname, '../../', relativeName),
    path.join(__dirname, '../', relativeName),
  ];
  const candidate = candidates.find((item) => fs.existsSync(item));
  if (!candidate) throw new Error(`MODULE_NOT_FOUND:${relativeName}`);
  // eslint-disable-next-line global-require
  return require(candidate);
}

function loadModules() {
  return {
    core: requireModule('core/dist'),
    gateway: requireModule('gateway/dist'),
    state: requireModule('state/dist'),
    workspace: requireModule('workspace/dist'),
    runner: requireModule('runner/dist'),
    gitAdapter: requireModule('git-adapter/dist'),
  };
}

const A9_PROTOCOL_VERSION = 1;

function createA9AgentRuntime(options) {
  const config = options || {};
  const modules = config.modules || loadModules();
  const workspaceRoot = config.workspaceRoot;
  const dataRoot = config.dataRoot;
  const ownerId = config.ownerId || `window-${process.pid}`;
  if (!workspaceRoot || !dataRoot) throw new Error('A9_RUNTIME_CONFIG_INVALID');

  // ----- 持久化（真实 SQLite；openDatabase 由宿主注入或使用 better-sqlite3） -----
  const openDatabase = config.openDatabase || ((databasePath, opts) => {
    // 生产包内为 Electron ABI 的 better-sqlite3（D-014）；开发/测试注入。
    const Database = require('better-sqlite3'); // eslint-disable-line global-require
    return new Database(databasePath, opts && opts.readonly ? { readonly: true } : {});
  });

  const persistenceOutcome = modules.state.A9PersistenceManager.open({
    databasePath: path.join(dataRoot, 'a9-state.db'),
    openDatabase,
    dataRoot,
  });
  if (persistenceOutcome.status !== 'ready') {
    return createDiagnosticsRuntime(persistenceOutcome);
  }
  const persistence = persistenceOutcome.manager;

  // ----- 工作区模式（fail-closed，无默认 Full Access） -----
  const modeStore = new modules.core.WorkspaceModeSettingsStore(
    modules.core.WorkspaceModeSettingsStore.settingsFilePathFor(dataRoot, path.basename(workspaceRoot)),
  );
  let permissionMode = modeStore.load().status === 'configured'
    ? modeStore.load().settings.permissionMode
    : undefined;
  const persistedMode = persistence.getWorkspaceMode(workspaceRoot);
  if (permissionMode === undefined && persistedMode !== undefined) permissionMode = persistedMode;

  // ----- 工作区单写锁（多窗口） -----
  const lock = persistence.acquireWorkspaceLock(workspaceRoot, ownerId);
  const lockHeld = lock.acquired === true;

  // ----- Provider（正式 UI 默认真实 Provider；未配置即拒绝执行） -----
  let providerConfig = null;
  let provider = null;

  // ----- Agent Loop 状态 -----
  let loop = null;
  let activeController = null;
  let agentStatus = 'idle';
  const timeline = [];
  const MAX_TIMELINE = 500;

  function ensureRuntime() {
    if (!lockHeld) {
      const err = new Error(`A9_WORKSPACE_LOCKED: 工作区写锁由 ${lock.holder} 持有`);
      err.code = 'A9_WORKSPACE_LOCKED';
      throw err;
    }
    if (permissionMode === undefined) {
      const err = new Error('A9_MODE_SELECTION_REQUIRED: 首次打开工作区必须显式选择 Full Access / Review / Read Only');
      err.code = 'A9_MODE_SELECTION_REQUIRED';
      throw err;
    }
    if (!provider) {
      const err = new Error('A9_PROVIDER_UNCONFIGURED: 尚未配置真实 OpenAI-compatible Provider（正式产品不默认 Replay）');
      err.code = 'A9_PROVIDER_UNCONFIGURED';
      throw err;
    }
    if (!loop) {
      const workspaceService = new modules.workspace.A9WorkspaceService(workspaceRoot);
      const trustedRunner = new modules.runner.TrustedShellRunner();
      const runnerAdapter = modules.runner.createTrustedShellLoopAdapter(trustedRunner);
      const shellSelection = modules.runner.selectShell({});
      loop = new modules.core.A9AgentLoop({
        workspaceRoot,
        provider,
        workspaceService,
        runner: runnerAdapter,
        permissionMode,
        shellOptions: {
          kind: shellSelection.kind,
          ...(shellSelection.version ? { version: shellSelection.version } : {}),
        },
        onEvent: (event) => {
          pushTimeline(event);
          persistence.recordToolEvent('a9-desktop', event.turnId, event.type, {
            type: event.type,
            data: event.data,
          });
        },
      });
      loopWorkspaceService = workspaceService;
      loopTrustedRunner = trustedRunner;
    }
    return loop;
  }
  let loopWorkspaceService = null;
  let loopTrustedRunner = null;

  function pushTimeline(event) {
    timeline.push({ type: event.type, turnId: event.turnId, timestamp: event.timestamp, data: event.data });
    if (timeline.length > MAX_TIMELINE) timeline.splice(0, timeline.length - MAX_TIMELINE);
  }

  function configureProvider(input) {
    const values = input || {};
    if (typeof values.baseUrl !== 'string' || !/^https?:\/\//i.test(values.baseUrl)) {
      throw new Error('A9_PROVIDER_CONFIG_INVALID: baseUrl 必须是 http(s) URL（允许任意 Base URL）');
    }
    if (typeof values.model !== 'string' || values.model.trim().length === 0) {
      throw new Error('A9_PROVIDER_CONFIG_INVALID: model 必须是手工填写的模型 ID');
    }
    providerConfig = {
      baseUrl: values.baseUrl.trim(),
      model: values.model.trim(),
      customHeaders: values.customHeaders && typeof values.customHeaders === 'object' ? values.customHeaders : undefined,
      caBundle: values.caBundle,
      allowInsecureTLS: values.allowInsecureTLS === true,
      proxy: values.proxy && typeof values.proxy === 'object' ? values.proxy : undefined,
    };
    loop = null;
    provider = new modules.gateway.OpenAICompatibleProvider({
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      ...(values.apiKey ? { apiKey: values.apiKey } : {}),
      ...(providerConfig.customHeaders ? { customHeaders: providerConfig.customHeaders } : {}),
      ...(providerConfig.caBundle ? { tlsConfig: { caBundle: providerConfig.caBundle, verifyCertificate: true } } : {}),
      ...(providerConfig.allowInsecureTLS ? { allowInsecureTLS: true } : {}),
      ...(providerConfig.proxy ? { proxyConfig: providerConfig.proxy } : {}),
    });
    return { ok: true, baseUrl: providerConfig.baseUrl, model: providerConfig.model };
  }

  async function probeProvider() {
    if (!provider) throw new Error('A9_PROVIDER_UNCONFIGURED');
    return provider.probeCapability();
  }

  async function submitTurn(prompt) {
    try {
      const activeLoop = ensureRuntime();
      if (activeController) throw new Error('A9_TURN_ALREADY_ACTIVE');
      activeController = new AbortController();
      agentStatus = 'running';
      const result = await activeLoop.runTurn(String(prompt || ''), { signal: activeController.signal });
      persistence.saveCheckpoint({
        turnId: result.turnId,
        sessionId: 'a9-desktop',
        payload: {
          outcome: result.outcome,
          verification: result.verification,
          finalMessage: result.finalMessage,
          toolCallsExecuted: result.toolCallsExecuted,
        },
      });
      agentStatus = result.outcome;
      return { ok: true, result };
    } catch (error) {
      agentStatus = 'failed';
      return { ok: false, error: serializeError(error) };
    } finally {
      activeController = null;
    }
  }

  async function resumeApproval(approved) {
    try {
      const activeLoop = ensureRuntime();
      if (activeController) throw new Error('A9_TURN_ALREADY_ACTIVE');
      activeController = new AbortController();
      const result = await activeLoop.resumeAfterApproval(approved === true, { signal: activeController.signal });
      persistence.recordApproval({
        approvalId: `ap-${result.turnId}-${Date.now()}`,
        sessionId: 'a9-desktop',
        turnId: result.turnId,
        toolName: result.pendingApproval ? result.pendingApproval.toolName : 'unknown',
        binding: result.pendingApproval ? result.pendingApproval.args : {},
        decision: approved === true ? 'approved' : 'denied',
      });
      agentStatus = result.outcome;
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    } finally {
      activeController = null;
    }
  }

  function stop() {
    if (activeController) {
      activeController.abort();
      agentStatus = 'cancelling';
      return { ok: true };
    }
    return { ok: false, error: { code: 'NO_ACTIVE_TURN' } };
  }

  function setMode(mode) {
    if (mode !== 'full_access' && mode !== 'review' && mode !== 'read_only') {
      throw new Error('A9_MODE_INVALID');
    }
    permissionMode = mode;
    modeStore.save(workspaceRoot, mode);
    persistence.setWorkspaceMode(workspaceRoot, mode);
    loop = null;
    return { ok: true, mode };
  }

  function getSnapshot() {
    const shellSelection = modules.runner.selectShell({});
    return {
      schemaVersion: A9_PROTOCOL_VERSION,
      workspaceRoot,
      lock: { held: lockHeld, holder: lock.holder },
      mode: permissionMode === undefined ? 'needs_selection' : permissionMode,
      modeRecommended: 'full_access',
      shell: { kind: shellSelection.kind, version: shellSelection.version, evidence: shellSelection.evidence, reason: shellSelection.reason },
      provider: providerConfig
        ? { configured: true, baseUrl: providerConfig.baseUrl, model: providerConfig.model, insecureTLS: providerConfig.allowInsecureTLS === true }
        : { configured: false, note: '正式产品使用真实 OpenAI-compatible Provider；Replay 仅测试入口' },
      agentStatus,
      timeline: timeline.slice(-100),
      checkpoints: persistence.listCheckpoints('a9-desktop'),
      interruptions: persistence.listInterruptions(),
      managedProcesses: persistence.listManagedProcesses(workspaceRoot),
    };
  }

  function undoTurn(turnId) {
    if (!loopWorkspaceService) throw new Error('A9_RUNTIME_NOT_STARTED');
    return { ok: true, outcome: loopWorkspaceService.getCheckpointManager().undoTurn(String(turnId)) };
  }

  function undoFile(turnId, relPath) {
    if (!loopWorkspaceService) throw new Error('A9_RUNTIME_NOT_STARTED');
    return { ok: true, outcome: loopWorkspaceService.getCheckpointManager().undoFile(String(turnId), String(relPath)) };
  }

  function getDiff(turnId) {
    if (!loopWorkspaceService) throw new Error('A9_RUNTIME_NOT_STARTED');
    return { ok: true, diff: loopWorkspaceService.getCheckpointManager().getTurnDiff(String(turnId)) };
  }

  async function gitStatus() {
    const projection = await modules.gitAdapter.projectTrustedGit(workspaceRoot);
    return { ok: true, projection };
  }

  function shutdown() {
    persistence.releaseWorkspaceLock(workspaceRoot, ownerId);
    if (loopTrustedRunner) {
      loopTrustedRunner.getBackgroundManager().dispose({ stopManaged: true }).catch(() => undefined);
    }
  }

  return {
    protocolVersion: A9_PROTOCOL_VERSION,
    status: 'ready',
    configureProvider,
    probeProvider,
    submitTurn,
    resumeApproval,
    stop,
    setMode,
    getSnapshot,
    undoTurn,
    undoFile,
    getDiff,
    gitStatus,
    shutdown,
  };
}

function createDiagnosticsRuntime(outcome) {
  return {
    protocolVersion: A9_PROTOCOL_VERSION,
    status: outcome.status === 'diagnostics' ? 'diagnostics' : 'schema_refused',
    diagnostics: outcome,
    configureProvider() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    probeProvider() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    async submitTurn() { return { ok: false, error: { code: 'A9_DIAGNOSTICS_MODE', message: '数据库受限诊断模式，禁止执行任务。' } }; },
    async resumeApproval() { return { ok: false, error: { code: 'A9_DIAGNOSTICS_MODE' } }; },
    stop() { return { ok: false }; },
    setMode() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    getSnapshot() { return { schemaVersion: A9_PROTOCOL_VERSION, status: 'diagnostics', diagnostics: outcome }; },
    undoTurn() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    undoFile() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    getDiff() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    async gitStatus() { return { ok: false, error: { code: 'A9_DIAGNOSTICS_MODE' } }; },
    shutdown() {},
  };
}

module.exports = { createA9AgentRuntime, A9_PROTOCOL_VERSION };
