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
const { createDpapiCredentialVault } = require('./credential-vault');

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

  // ----- 工作区模式（R1：键绑定 canonical 路径的 SHA-256，fail-closed） -----
  const canonicalWorkspace = modules.core.canonicalizeWorkspacePath(workspaceRoot);
  const modeStore = new modules.core.WorkspaceModeSettingsStore(
    modules.core.WorkspaceModeSettingsStore.settingsFilePathFor(dataRoot, workspaceRoot),
    { legacyPath: modules.core.WorkspaceModeSettingsStore.legacyBasenameFilePathFor(dataRoot, workspaceRoot) },
  );
  let permissionMode = modeStore.load(workspaceRoot).status === 'configured'
    ? modeStore.load(workspaceRoot).settings.permissionMode
    : undefined;
  const persistedMode = persistence.getWorkspaceMode(canonicalWorkspace);
  if (permissionMode === undefined && persistedMode !== undefined) permissionMode = persistedMode;

  // ----- 工作区单写锁（多窗口） -----
  const lock = persistence.acquireWorkspaceLock(canonicalWorkspace, ownerId);
  const lockHeld = lock.acquired === true;

  // ----- R2：pending 审批（SQLite 记录来自原始 pending 对象） -----
  let currentPendingApproval = null;

  // ----- Agent Loop 状态（声明先于 provider 恢复，避免 TDZ） -----
  let loop = null;
  let activeController = null;
  let agentStatus = 'idle';

  // ----- Provider（R4：非秘密配置版本化持久化；秘密仅 DPAPI；未配置即拒绝执行） -----
  const PROVIDER_CONFIG_SCHEMA_VERSION = 1;
  const providerConfigPath = path.join(dataRoot, 'a9-provider-config.v1.json');

  // DPAPI 不可用时降级为仅内存（vault 构造抛错 → 捕获），不另造明文凭据文件。
  let apiKeySource = 'none'; // 'dpapi' | 'memory' | 'none'
  function createVaultFor(slot) {
    try {
      return createDpapiCredentialVault({
        safeStorage: config.safeStorage,
        // vaultPlatform 仅供开发/测试用 fake safeStorage 验证 DPAPI 合同；
        // 生产路径保持 process.platform（真实 DPAPI 仅 Windows）。
        platform: config.vaultPlatform || process.platform,
        userDataPath: path.join(dataRoot, slot),
      });
    } catch (_err) {
      return null;
    }
  }
  const apiKeyVault = createVaultFor('a9-vault-apikey');
  const secretsVault = createVaultFor('a9-vault-secrets');

  let providerConfig = null;       // 非秘密配置（可持久化）
  let memoryApiKey = null;         // DPAPI 不可用/未记住时仅内存
  let memorySecrets = null;        // header 值/代理密码（仅内存）
  let providerProbe = null;        // { classification, checkedAt, latencyMs, error? }
  let providerDiagnostics = null;  // fail-closed 诊断（不删除证据）
  let provider = null;

  function redactSecrets(text) {
    let out = String(text);
    const secrets = [memoryApiKey, memorySecrets && memorySecrets.proxyPassword,
      ...(memorySecrets && memorySecrets.headerValues ? Object.values(memorySecrets.headerValues) : [])];
    for (const secret of secrets) {
      if (typeof secret === 'string' && secret.length > 0) out = out.split(secret).join('***redacted***');
    }
    return out;
  }

  function readPersistedProviderConfig() {
    try {
      if (!fs.existsSync(providerConfigPath)) return null;
      const doc = JSON.parse(fs.readFileSync(providerConfigPath, 'utf8'));
      if (!doc || doc.schemaVersion !== PROVIDER_CONFIG_SCHEMA_VERSION) {
        providerDiagnostics = { code: 'A9_PROVIDER_CONFIG_SCHEMA_MISMATCH', detail: `schemaVersion=${doc && doc.schemaVersion}` };
        return null;
      }
      return doc;
    } catch (err) {
      providerDiagnostics = { code: 'A9_PROVIDER_CONFIG_UNPARSABLE', detail: redactSecrets(err.message) };
      return null;
    }
  }

  function writePersistedProviderConfig(doc) {
    const tmp = `${providerConfigPath}.tmp-${process.pid}-${Date.now()}`;
    fs.mkdirSync(path.dirname(providerConfigPath), { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, providerConfigPath);
  }

  /** 加载已保存的秘密：DPAPI 优先；解密失败 fail-closed（保留诊断证据，不删除）。 */
  function loadPersistedSecrets() {
    let apiKey = null;
    let secrets = null;
    if (apiKeyVault && apiKeyVault.getStatus().saved) {
      try {
        apiKey = apiKeyVault.loadApiKey();
      } catch (err) {
        providerDiagnostics = { code: err && err.code ? err.code : 'A9_PROVIDER_SECRET_LOAD_FAILED', detail: redactSecrets(err.message) };
      }
    }
    if (secretsVault && secretsVault.getStatus().saved) {
      try {
        secrets = JSON.parse(secretsVault.loadApiKey());
      } catch (err) {
        providerDiagnostics = providerDiagnostics || { code: err && err.code ? err.code : 'A9_PROVIDER_SECRET_LOAD_FAILED', detail: redactSecrets(err.message) };
      }
    }
    return { apiKey, secrets };
  }

  function buildProviderInstance(probeMode) {
    const headerValues = (memorySecrets && memorySecrets.headerValues) || {};
    const headers = {};
    for (const name of providerConfig.customHeaderNames || []) {
      if (typeof headerValues[name] === 'string' && headerValues[name]) headers[name] = headerValues[name];
    }
    const proxy = providerConfig.proxy
      ? {
        host: providerConfig.proxy.host,
        port: providerConfig.proxy.port,
        ...(providerConfig.proxy.protocol ? { protocol: providerConfig.proxy.protocol } : {}),
        ...(providerConfig.proxy.username ? { auth: { username: providerConfig.proxy.username, password: (memorySecrets && memorySecrets.proxyPassword) || '' } } : {}),
      }
      : undefined;
    return new modules.gateway.OpenAICompatibleProvider({
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      ...(memoryApiKey ? { apiKey: memoryApiKey } : {}),
      ...(Object.keys(headers).length > 0 ? { customHeaders: headers } : {}),
      ...(providerConfig.caBundle ? { tlsConfig: { caBundle: providerConfig.caBundle, verifyCertificate: true } } : {}),
      ...(providerConfig.allowInsecureTLS ? { allowInsecureTLS: true } : {}),
      ...(proxy ? { proxyConfig: proxy } : {}),
      ...(probeMode ? {
        // 探测使用短超时/低重试：不可达服务快速分类，不阻塞保存流程。
        timeoutMs: 5_000,
        totalTimeoutMs: 15_000,
        noDataTimeoutMs: 10_000,
        retryConfig: { maxRetries: 1, initialDelayMs: 200, maxDelayMs: 500, backoffMultiplier: 2 },
      } : {}),
    });
  }

  function rebuildProvider() {
    if (!providerConfig) { provider = null; return; }
    loop = null;
    provider = buildProviderInstance(false);
  }

  // 启动时恢复：非秘密配置 + DPAPI 秘密（失败 fail-closed 进入诊断，不覆盖）。
  (function restoreProviderConfig() {
    const doc = readPersistedProviderConfig();
    if (!doc) return;
    providerConfig = {
      baseUrl: doc.baseUrl,
      model: doc.model,
      customHeaderNames: doc.customHeaderNames || [],
      ...(doc.caBundle ? { caBundle: doc.caBundle } : {}),
      allowInsecureTLS: doc.allowInsecureTLS === true,
      ...(doc.proxy ? { proxy: doc.proxy } : {}),
      keyRemembered: doc.keyRemembered === true,
    };
    providerProbe = doc.probe || null;
    const loaded = loadPersistedSecrets();
    memoryApiKey = loaded.apiKey;
    memorySecrets = loaded.secrets;
    apiKeySource = memoryApiKey ? 'dpapi' : 'none';
    if (providerConfig.keyRemembered && !memoryApiKey && !providerDiagnostics) {
      providerDiagnostics = { code: 'A9_PROVIDER_KEY_NOT_RESTORED', detail: '标记为已记住但密文缺失（可能已被清除）' };
    }
    rebuildProvider();
  })();

  // ----- Agent Loop 状态 -----
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
    if (providerProbe) {
      if (providerProbe.classification === 'unavailable') {
        const err = new Error(`A9_PROVIDER_UNVERIFIED: Provider probe 失败（${redactSecrets(providerProbe.error || 'unknown')}）；不得宣称 Agent 可用`);
        err.code = 'A9_PROVIDER_UNVERIFIED';
        throw err;
      }
      if (providerProbe.classification === 'chat_only') {
        const err = new Error('A9_PROVIDER_CHAT_ONLY: 该服务无可靠 tool_calls，仅标记为聊天能力；Agent 工具循环不可用');
        err.code = 'A9_PROVIDER_CHAT_ONLY';
        throw err;
      }
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
        externalChangePort: workspaceService,
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
        onApprovalPending: (approval) => {
          // 等待用户前持久化 pending 审批（含真实工具与目标绑定）。
          currentPendingApproval = approval;
          persistence.recordApproval({
            approvalId: approval.approvalId,
            sessionId: 'a9-desktop',
            turnId: approval.turnId,
            toolName: approval.toolName,
            binding: {
              summary: approval.summary,
              bindingDigest: approval.bindingDigest,
              args: approval.args,
              ...(approval.gitBinding ? { git: approval.gitBinding } : {}),
            },
            decision: 'pending',
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

  /**
   * 配置 Provider：非秘密配置原子持久化；API Key 仅经 DPAPI 保存（不可用则
   * 仅内存并如实报告）；保存时执行最小真实 Tool Calling probe 并分类
   * tool_calling / chat_only / unavailable；模型切换保留会话上下文。
   */
  async function configureProvider(input) {
    const values = input || {};
    if (typeof values.baseUrl !== 'string' || !/^https?:\/\//i.test(values.baseUrl)) {
      throw new Error('A9_PROVIDER_CONFIG_INVALID: baseUrl 必须是 http(s) URL（允许任意 Base URL）');
    }
    if (typeof values.model !== 'string' || values.model.trim().length === 0) {
      throw new Error('A9_PROVIDER_CONFIG_INVALID: model 必须是手工填写的模型 ID');
    }

    const customHeaders = values.customHeaders && typeof values.customHeaders === 'object' ? values.customHeaders : {};
    const customHeaderNames = Object.keys(customHeaders);
    const headerValues = {};
    for (const name of customHeaderNames) headerValues[name] = String(customHeaders[name] ?? '');

    const proxyInput = values.proxy && typeof values.proxy === 'object' ? values.proxy : null;
    const remember = values.rememberApiKey === true;

    const previousHistory = loop ? loop.getConversationHistory() : null;

    providerConfig = {
      baseUrl: values.baseUrl.trim(),
      model: values.model.trim(),
      customHeaderNames,
      ...(values.caBundle ? { caBundle: String(values.caBundle) } : {}),
      allowInsecureTLS: values.allowInsecureTLS === true,
      ...(proxyInput ? {
        proxy: {
          host: String(proxyInput.host),
          port: Number(proxyInput.port),
          ...(proxyInput.protocol ? { protocol: proxyInput.protocol } : {}),
          ...(proxyInput.username !== undefined ? { username: String(proxyInput.username) } : {}),
        },
      } : {}),
      keyRemembered: remember,
    };
    memoryApiKey = typeof values.apiKey === 'string' && values.apiKey ? values.apiKey : memoryApiKey;
    memorySecrets = {
      headerValues,
      ...(proxyInput && proxyInput.password ? { proxyPassword: String(proxyInput.password) } : {}),
    };

    // API Key / 秘密仅经 DPAPI 保存；失败保留诊断并降级仅内存（不写明文）。
    apiKeySource = 'none';
    let apiKeyPersisted = false;
    if (remember && memoryApiKey) {
      if (apiKeyVault) {
        try {
          apiKeyVault.saveApiKey(memoryApiKey);
          apiKeyPersisted = true;
        } catch (err) {
          providerDiagnostics = { code: err && err.code ? err.code : 'A9_PROVIDER_KEY_SAVE_FAILED', detail: redactSecrets(err.message) };
        }
      } else {
        providerDiagnostics = { code: 'A9_PROVIDER_DPAPI_UNAVAILABLE', detail: '当前环境无 DPAPI（非 Windows 或 safeStorage 不可用）：API Key 仅保存在进程内存' };
      }
      if (secretsVault) {
        try {
          secretsVault.saveApiKey(JSON.stringify(memorySecrets));
        } catch (err) {
          providerDiagnostics = providerDiagnostics || { code: err && err.code ? err.code : 'A9_PROVIDER_SECRET_SAVE_FAILED', detail: redactSecrets(err.message) };
        }
      }
      apiKeySource = apiKeyPersisted ? 'dpapi' : 'memory';
    } else if (remember === false) {
      try { if (apiKeyVault) apiKeyVault.clearApiKey(); } catch (_err) { /* best effort */ }
      try { if (secretsVault) secretsVault.clearApiKey(); } catch (_err) { /* best effort */ }
      apiKeySource = memoryApiKey ? 'memory' : 'none';
    } else {
      apiKeySource = memoryApiKey ? 'memory' : 'none';
    }

    rebuildProvider();

    // 保存配置时执行最小真实 Tool Calling probe（分类进入持久化与审计）。
    if (values.skipProbe === true) {
      providerProbe = { classification: 'skipped', checkedAt: new Date().toISOString(), note: '显式跳过（仅测试注入）' };
    } else {
      providerProbe = await classifyProviderWithProbe();
    }

    writePersistedProviderConfig({
      schemaVersion: PROVIDER_CONFIG_SCHEMA_VERSION,
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      customHeaderNames,
      ...(providerConfig.caBundle ? { caBundle: providerConfig.caBundle } : {}),
      allowInsecureTLS: providerConfig.allowInsecureTLS,
      ...(providerConfig.proxy ? { proxy: providerConfig.proxy } : {}),
      keyRemembered: remember === true && apiKeyPersisted === true,
      probe: providerProbe,
      updatedAt: new Date().toISOString(),
    });
    persistence.recordToolEvent('a9-desktop', null, 'provider.configure', {
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      classification: providerProbe.classification,
      keyRemembered: providerConfig.keyRemembered === true,
    });

    // 模型切换：从既有会话历史（标准化事件投影）重建上下文，不丢已完成工具结果。
    if (previousHistory && previousHistory.length > 0 && loop) {
      loop.restoreConversationHistory(previousHistory);
    }

    return {
      ok: true,
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      probe: providerProbe,
      keyRemembered: providerConfig.keyRemembered === true,
    };
  }

  async function classifyProviderWithProbe() {
    if (!providerConfig) return { classification: 'unavailable', checkedAt: new Date().toISOString(), error: 'provider not built' };
    try {
      const probe = await buildProviderInstance(true).probeCapability();
      return {
        classification: probe.ok && probe.hasToolCalling ? 'tool_calling' : probe.ok ? 'chat_only' : 'unavailable',
        checkedAt: new Date().toISOString(),
        latencyMs: probe.latencyMs,
        hasStreaming: probe.hasStreaming,
        ...(probe.error ? { error: redactSecrets(probe.error) } : {}),
      };
    } catch (err) {
      return { classification: 'unavailable', checkedAt: new Date().toISOString(), error: redactSecrets(err.message) };
    }
  }

  async function probeProvider() {
    if (!provider) throw new Error('A9_PROVIDER_UNCONFIGURED');
    const probe = await provider.probeCapability();
    providerProbe = await classifyProviderWithProbe();
    return probe;
  }

  async function submitTurn(prompt) {
    try {
      const activeLoop = ensureRuntime();
      if (activeController) throw new Error('A9_TURN_ALREADY_ACTIVE');
      activeController = new AbortController();
      agentStatus = 'running';
      const result = await activeLoop.runTurn(String(prompt || ''), { signal: activeController.signal });
      currentPendingApproval = result.pendingApproval || currentPendingApproval;
      persistence.saveCheckpoint({
        turnId: result.turnId,
        sessionId: 'a9-desktop',
        payload: {
          outcome: result.outcome,
          verification: result.verification,
          finalMessage: result.finalMessage,
          toolCallsExecuted: result.toolCallsExecuted,
          ...(result.externalChanges ? { externalChanges: result.externalChanges } : {}),
        },
      });
      if (result.externalChanges && result.externalChanges.length > 0) {
        persistence.recordToolEvent('a9-desktop', result.turnId, 'external.changes', { changes: result.externalChanges });
      }
      agentStatus = result.outcome;
      return { ok: true, result };
    } catch (error) {
      agentStatus = 'failed';
      return { ok: false, error: serializeError(error) };
    } finally {
      activeController = null;
    }
  }

  async function resumeApproval(input) {
    try {
      if (!input || typeof input !== 'object' || !input.approvalId || !input.bindingDigest ||
          (input.decision !== 'approved' && input.decision !== 'denied')) {
        throw new Error('A9_APPROVAL_INPUT_INVALID: 回复必须携带 approvalId、decision 与 bindingDigest');
      }
      const activeLoop = ensureRuntime();
      if (activeController) throw new Error('A9_TURN_ALREADY_ACTIVE');
      activeController = new AbortController();
      // R2.7：SQLite 记录来自原始 pending 审批，而不是恢复执行后的结果。
      const original = currentPendingApproval;
      if (!original || original.approvalId !== input.approvalId) {
        throw new Error('A9_APPROVAL_UNKNOWN: 没有匹配的挂起审批');
      }
      const result = await activeLoop.resumeAfterApproval({
        approvalId: input.approvalId,
        decision: input.decision,
        bindingDigest: input.bindingDigest,
      }, { signal: activeController.signal });
      persistence.recordApproval({
        approvalId: original.approvalId,
        sessionId: 'a9-desktop',
        turnId: original.turnId,
        toolName: original.toolName,
        binding: {
          summary: original.summary,
          bindingDigest: original.bindingDigest,
          args: original.args,
          ...(original.gitBinding ? { git: original.gitBinding } : {}),
        },
        decision: input.decision,
      });
      currentPendingApproval = null;
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
    persistence.setWorkspaceMode(canonicalWorkspace, mode);
    persistence.recordToolEvent('a9-desktop', null, 'mode.set', { mode, workspace: canonicalWorkspace });
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
        ? {
          configured: true,
          baseUrl: providerConfig.baseUrl,
          model: providerConfig.model,
          insecureTLS: providerConfig.allowInsecureTLS === true,
          probe: providerProbe,
          apiKey: {
            remembered: providerConfig.keyRemembered === true,
            source: apiKeySource,
            vaultAvailable: Boolean(apiKeyVault),
          },
          ...(providerDiagnostics ? { diagnostics: providerDiagnostics } : {}),
        }
        : { configured: false, note: '正式产品使用真实 OpenAI-compatible Provider；Replay 仅测试入口', ...(providerDiagnostics ? { diagnostics: providerDiagnostics } : {}) },
      agentStatus,
      ...(currentPendingApproval ? { pendingApproval: currentPendingApproval } : {}),
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
