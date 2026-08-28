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
const crypto = require('crypto');
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
function validateProviderBaseUrl(value) {
  if (typeof value !== 'string') {
    const err = new Error('A9_PROVIDER_CONFIG_INVALID: baseUrl 必须是 http(s) URL（允许任意 Base URL）');
    err.code = 'A9_PROVIDER_CONFIG_INVALID';
    throw err;
  }
  const trimmed = value.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_err) {
    const err = new Error('A9_PROVIDER_CONFIG_INVALID: baseUrl 必须是有效的 http(s) URL');
    err.code = 'A9_PROVIDER_CONFIG_INVALID';
    throw err;
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    const err = new Error('A9_PROVIDER_CONFIG_INVALID: baseUrl 必须是有效的 http(s) URL');
    err.code = 'A9_PROVIDER_CONFIG_INVALID';
    throw err;
  }
  if (parsed.username || parsed.password || parsed.hash || parsed.search) {
    const err = new Error('A9_PROVIDER_BASE_URL_CREDENTIALS_FORBIDDEN: baseUrl 不得包含 userinfo、query 或 fragment；请使用 API Key/Header/代理秘密字段');
    err.code = 'A9_PROVIDER_BASE_URL_CREDENTIALS_FORBIDDEN';
    throw err;
  }
  return trimmed;
}

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

  // Electron-ABI better-sqlite3 显式路径 + 预检（Node-ABI 二进制无法在 Electron
  // 主进程加载；缺少显式路径时产品路径在 Electron 下明确不可用，不冒充 PASS）。
  let resolvedOpenDatabase = openDatabase;
  if (config.electronSqliteRoot) {
    const preflight = preflightElectronSqlite(config.electronSqliteRoot);
    if (!preflight.ok) {
      return createSqliteUnavailableRuntime(preflight.reason);
    }
    resolvedOpenDatabase = preflight.openDatabase;
  }

  // F02 / WIN7-03：干净 Windows 用户首次启动时 app.getPath('userData')
  // 已由 Electron 创建，但 A9 子目录尚不存在。better-sqlite3 不会替宿主
  // 创建数据库的父目录；直接 open 会进入 diagnostics runtime，Renderer 因而
  // 得不到 needs_selection。数据根属于产品声明的 userData 边界，可安全按需创建。
  fs.mkdirSync(dataRoot, { recursive: true });

  const persistenceOutcome = modules.state.A9PersistenceManager.open({
    databasePath: path.join(dataRoot, 'a9-state.db'),
    openDatabase: resolvedOpenDatabase,
    dataRoot,
  });
  if (persistenceOutcome.status !== 'ready') {
    return createDiagnosticsRuntime(persistenceOutcome);
  }
  const persistence = persistenceOutcome.manager;

  // ----- 工作区模式（R1：键绑定 canonical 路径的 SHA-256，fail-closed） -----
  const canonicalWorkspace = modules.core.canonicalizeWorkspacePath(workspaceRoot);
  // v3 及更早版本按工作区派生 Session；v4 将它确定性迁移为“历史对话”。
  const legacyA9SessionId = `a9-${crypto.createHash('sha256').update(canonicalWorkspace, 'utf8').digest('hex').slice(0, 16)}`;
  let activeConversation = persistence.ensureActiveConversation(
    canonicalWorkspace,
    legacyA9SessionId,
    createConversationId(),
  );
  let a9SessionId = activeConversation.sessionId;
  const modeStore = new modules.core.WorkspaceModeSettingsStore(
    modules.core.WorkspaceModeSettingsStore.settingsFilePathFor(dataRoot, workspaceRoot),
    { legacyPath: modules.core.WorkspaceModeSettingsStore.legacyBasenameFilePathFor(dataRoot, workspaceRoot) },
  );
  // F3：modeStore.load 只调用一次，并保留完整状态（含 needs_selection reason）。
  // 只有“配置文件确实不存在（missing）”时才允许 SQLite 恢复；JSON 损坏、
  // schema 不支持、workspaceRoot 不匹配、哈希键与内容不一致一律 needs_selection。
  let modeDiagnostics = null;
  const modeState = modeStore.load(workspaceRoot);
  let permissionMode = modeState.status === 'configured' ? modeState.settings.permissionMode : undefined;
  if (modeState.status !== 'configured') {
    if (modeState.reason === 'missing') {
      // 唯一允许的 SQLite 恢复路径：配置文件确实不存在。
      const persistedMode = persistence.getWorkspaceMode(canonicalWorkspace);
      if (persistedMode !== undefined) permissionMode = persistedMode;
    } else {
      // JSON 损坏 / schema 不支持 / workspaceRoot 不匹配：保留证据，禁止回退。
      modeDiagnostics = {
        code: 'A9_MODE_FAIL_CLOSED',
        reason: modeState.reason,
        detail: String(modeState.detail || '').slice(0, 200),
      };
      persistence.recordToolEvent(a9SessionId, null, 'mode.fail_closed', {
        workspace: canonicalWorkspace,
        reason: modeState.reason,
        detail: modeDiagnostics.detail,
      });
    }
  }

  // ----- 工作区单写锁（多窗口） -----
  const lock = persistence.acquireWorkspaceLock(canonicalWorkspace, ownerId);
  const lockHeld = lock.acquired === true;
  let workspaceLockReleased = false;

  // ----- R2：pending 审批（SQLite 记录来自原始 pending 对象） -----
  let currentPendingApproval = null;
  let approvalDecisionInFlightId = null;

  // ----- Agent Loop 状态（声明先于 provider 恢复，避免 TDZ） -----
  let loop = null;
  let activeController = null;
  let agentStatus = activeConversation.activity === 'interrupted' ? 'interrupted' : 'idle';
  // F4：模型切换时保存的会话历史；新 loop 惰性创建后恢复并一次性清除。
  let restoredContext = buildPersistedTextContext(persistence.listConversationFacts(a9SessionId));
  let pendingConversationHistory = restoredContext.messages;
  // F5：当前 Turn 的 task/turn/run 生命周期句柄。
  let activeLifecycle = null;
  let shutdownPromise = null;
  let checkpointRecoveryDiagnostics = null;

  // ----- 按对话草稿（D-020：DPAPI Current User；失败时仅内存） -----
  const memoryDrafts = new Map();
  const draftDiagnostics = new Map();

  function draftEncryptionAvailable() {
    try {
      return (config.vaultPlatform || process.platform) === 'win32'
        && config.safeStorage
        && typeof config.safeStorage.isEncryptionAvailable === 'function'
        && config.safeStorage.isEncryptionAvailable() === true;
    } catch (_err) {
      return false;
    }
  }

  function readDraft(sessionId) {
    if (memoryDrafts.has(sessionId)) {
      return {
        text: memoryDrafts.get(sessionId),
        persistence: 'memory',
        note: draftDiagnostics.get(sessionId) || '草稿仅保存在当前进程内存中。',
      };
    }
    const ciphertext = persistence.getConversationDraftCiphertext(sessionId);
    if (!ciphertext) {
      return draftEncryptionAvailable()
        ? { text: '', persistence: 'dpapi' }
        : { text: '', persistence: 'memory', note: 'Windows DPAPI 不可用，草稿仅在当前进程保留。' };
    }
    if (!draftEncryptionAvailable()) {
      const note = 'Windows DPAPI 不可用，已保存草稿无法解密；原密文未被覆盖。';
      draftDiagnostics.set(sessionId, note);
      return { text: '', persistence: 'memory', note };
    }
    try {
      return {
        text: config.safeStorage.decryptString(Buffer.from(ciphertext, 'base64')),
        persistence: 'dpapi',
      };
    } catch (_err) {
      const note = 'DPAPI 草稿解密失败；原密文未被覆盖，本次降级为仅内存。';
      memoryDrafts.set(sessionId, '');
      draftDiagnostics.set(sessionId, note);
      return { text: '', persistence: 'memory', note };
    }
  }

  function saveDraft(text) {
    const draft = String(text == null ? '' : text).slice(0, 32_000);
    if (draftEncryptionAvailable()) {
      try {
        const ciphertext = draft.length > 0
          ? config.safeStorage.encryptString(draft).toString('base64')
          : null;
        persistence.setConversationDraftCiphertext(a9SessionId, ciphertext);
        memoryDrafts.delete(a9SessionId);
        draftDiagnostics.delete(a9SessionId);
        return { ok: true, persistence: 'dpapi' };
      } catch (_err) {
        // 不覆盖旧密文；当前草稿改为进程内存保留。
      }
    }
    memoryDrafts.set(a9SessionId, draft);
    const note = 'Windows DPAPI 不可用或加密失败，草稿仅在当前进程保留。';
    draftDiagnostics.set(a9SessionId, note);
    return { ok: true, persistence: 'memory', note };
  }

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

  function hasSecretMaterial(secrets) {
    return Boolean(secrets) && (
      Boolean(secrets.proxyPassword) ||
      Boolean(secrets.headerValues && Object.keys(secrets.headerValues).length > 0)
    );
  }

  function redactSecrets(text) {
    let out = String(text);
    const secrets = [memoryApiKey, memorySecrets && memorySecrets.proxyPassword,
      ...(memorySecrets && memorySecrets.headerValues ? Object.values(memorySecrets.headerValues) : [])];
    for (const secret of secrets) {
      if (typeof secret !== 'string' || secret.length === 0) continue;
      const variants = [secret, Buffer.from(secret, 'utf8').toString('base64'), encodeURIComponent(secret)];
      for (const variant of variants) {
        if (variant && variant !== '***redacted***') out = out.split(variant).join('***redacted***');
      }
    }
    out = out.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1***redacted***@');
    out = out.replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi, '$1***redacted***');
    return out;
  }

  const SENSITIVE_FIELD = /(?:authorization|api[-_]?key|password|secret|access[-_]?token|refresh[-_]?token)/i;
  function redactForProjection(value, key, seen) {
    if (value === null || value === undefined) return value;
    if (SENSITIVE_FIELD.test(String(key || ''))) return '***redacted***';
    if (typeof value === 'string') return redactSecrets(value);
    if (typeof value !== 'object') return value;
    const visited = seen || new WeakSet();
    if (visited.has(value)) return '[Circular]';
    visited.add(value);
    if (Array.isArray(value)) return value.map((item) => redactForProjection(item, '', visited));
    const output = {};
    for (const [field, item] of Object.entries(value)) {
      output[field] = redactForProjection(item, field, visited);
    }
    return output;
  }

  function redactApproval(approval) {
    if (!approval) return approval;
    return {
      ...approval,
      summary: redactSecrets(approval.summary || ''),
      args: redactForProjection(approval.args),
      ...(approval.gitBinding ? { gitBinding: redactForProjection(approval.gitBinding) } : {}),
    };
  }

  function readPersistedProviderConfig() {
    try {
      if (!fs.existsSync(providerConfigPath)) return null;
      const doc = JSON.parse(fs.readFileSync(providerConfigPath, 'utf8'));
      if (!doc || doc.schemaVersion !== PROVIDER_CONFIG_SCHEMA_VERSION) {
        providerDiagnostics = { code: 'A9_PROVIDER_CONFIG_SCHEMA_MISMATCH', detail: `schemaVersion=${doc && doc.schemaVersion}` };
        return null;
      }
      if (doc.allowInsecureTLS === true) {
        const error = new Error('A9_PROVIDER_INSECURE_TLS_FORBIDDEN: TLS certificate verification cannot be disabled');
        error.code = 'A9_PROVIDER_INSECURE_TLS_FORBIDDEN';
        throw error;
      }
      doc.baseUrl = validateProviderBaseUrl(doc.baseUrl);
      return doc;
    } catch (err) {
      providerDiagnostics = {
        code: err && err.code ? err.code : 'A9_PROVIDER_CONFIG_UNPARSABLE',
        detail: redactSecrets(err && err.message ? err.message : String(err)),
      };
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
      ...(doc.proxy ? { proxy: doc.proxy } : {}),
      keyRemembered: doc.keyRemembered === true,
    };
    providerProbe = doc.probe || null;
    const loaded = loadPersistedSecrets();
    memoryApiKey = loaded.apiKey;
    memorySecrets = loaded.secrets;
    const restoredSecret = Boolean(memoryApiKey) || hasSecretMaterial(memorySecrets);
    apiKeySource = restoredSecret ? 'dpapi' : 'none';
    if (providerConfig.keyRemembered && !restoredSecret && !providerDiagnostics) {
      providerDiagnostics = { code: 'A9_PROVIDER_KEY_NOT_RESTORED', detail: '标记为已记住但 DPAPI 秘密未恢复（可能已被清除）' };
    }
    rebuildProvider();
  })();

  // ----- Agent Loop 状态 -----
  const timeline = [];
  const MAX_TIMELINE = 500;

  // 独立于 loop 的工作区服务：撤销/Diff/Git 是状态操作，不需要 Provider。
  const standaloneWorkspaceService = new modules.workspace.A9WorkspaceService(workspaceRoot);
  try {
    const checkpointManager = standaloneWorkspaceService.getCheckpointManager();
    const persistedTurnIds = checkpointManager.listPersistedTurns();
    // Validate manifest schema and embedded Turn identity before projecting a
    // filename into SQLite. Corruption is fail-closed and never overwritten.
    for (const turnId of persistedTurnIds) checkpointManager.loadCheckpoint(turnId);
    persistence.reconcileInterruptedWorkspaceCheckpoints(
      canonicalWorkspace,
      persistedTurnIds,
    );
  } catch (err) {
    checkpointRecoveryDiagnostics = {
      code: 'A9_CHECKPOINT_RECONCILIATION_FAILED',
      detail: redactSecrets(err && err.message ? err.message : String(err)),
    };
  }
  // 后台进程生命周期独立于 Provider/Loop 重建；模型切换不得遗失句柄。
  const loopTrustedRunner = new modules.runner.TrustedShellRunner();

  function recordManagedHandle(handle) {
    persistence.recordManagedProcess({
      handleId: handle.handleId,
      workspacePath: workspaceRoot,
      ...(handle.pid ? { pid: handle.pid } : {}),
      command: handle.command,
      cwd: handle.cwd,
      startedAt: handle.startTime,
      lastProbeStatus: handle.status,
      pidReusePossible: handle.pidReusePossible === true,
    });
  }

  function syncManagedProcessFacts() {
    const handles = loopTrustedRunner.getBackgroundManager().list();
    handles.forEach(recordManagedHandle);
    return persistence.listManagedProcesses(workspaceRoot);
  }

  // 崩溃恢复只采纳 PID 事实，不重放命令；PID 复用风险保留给显式 Stop 决策。
  for (const fact of persistence.listManagedProcesses(workspaceRoot)) {
    if ((fact.lastProbeStatus === 'running' || fact.lastProbeStatus === 'starting') && fact.pid) {
      try {
        recordManagedHandle(loopTrustedRunner.getBackgroundManager().adoptRecoveredFact(fact.handleId, {
          pid: fact.pid,
          command: fact.command,
          cwd: fact.cwd,
          startTime: fact.startedAt,
        }));
      } catch (_err) { /* 重复句柄保持现有管理器事实 */ }
    }
  }

  function conversationBlockReason() {
    if (activeController) return '当前任务正在执行';
    if (currentPendingApproval) return '当前对话正在等待审批';
    if (loopTrustedRunner.getBackgroundManager().getActiveCount() > 0) return '当前对话仍有托管后台进程';
    return null;
  }

  function assertConversationSwitchAllowed() {
    const reason = conversationBlockReason();
    if (!reason) return;
    const err = new Error(`A9_CONVERSATION_BUSY: ${reason}，停止或完成后才能切换对话/工作区。`);
    err.code = 'A9_CONVERSATION_BUSY';
    throw err;
  }

  function loadConversation(record) {
    activeConversation = record;
    a9SessionId = record.sessionId;
    loop = null;
    loopWorkspaceService = null;
    currentPendingApproval = null;
    approvalDecisionInFlightId = null;
    activeLifecycle = null;
    timeline.splice(0, timeline.length);
    restoredContext = buildPersistedTextContext(persistence.listConversationFacts(a9SessionId));
    pendingConversationHistory = restoredContext.messages;
    agentStatus = record.activity === 'interrupted' ? 'interrupted' : 'idle';
    return { ok: true, conversationId: a9SessionId };
  }

  function createConversation() {
    assertConversationSwitchAllowed();
    const record = persistence.createConversation(createConversationId(), canonicalWorkspace);
    return loadConversation(record);
  }

  function activateConversation(sessionId) {
    assertConversationSwitchAllowed();
    if (String(sessionId) === a9SessionId) return { ok: true, conversationId: a9SessionId };
    return loadConversation(persistence.activateConversation(canonicalWorkspace, String(sessionId)));
  }

  function renameConversation(sessionId, title) {
    const record = persistence.renameConversation(String(sessionId), String(title));
    if (record.sessionId === a9SessionId) activeConversation = record;
    return { ok: true, conversation: record };
  }

  function archiveConversation(sessionId) {
    assertConversationSwitchAllowed();
    if (String(sessionId) !== a9SessionId) {
      const err = new Error('A9_CONVERSATION_NOT_CURRENT: 只能归档当前对话。');
      err.code = 'A9_CONVERSATION_NOT_CURRENT';
      throw err;
    }
    const next = persistence.archiveConversation(a9SessionId, createConversationId());
    return loadConversation(next);
  }

  function restoreConversation(sessionId) {
    assertConversationSwitchAllowed();
    return loadConversation(persistence.restoreConversation(String(sessionId)));
  }

  function ensureRuntime() {
    if (!lockHeld) {
      const err = new Error(`A9_WORKSPACE_LOCKED: 工作区写锁由 ${lock.holder} 持有`);
      err.code = 'A9_WORKSPACE_LOCKED';
      throw err;
    }
    if (checkpointRecoveryDiagnostics) {
      const err = new Error('A9_CHECKPOINT_RECONCILIATION_FAILED: 崩溃恢复的工作区清单无法与 SQLite 对账，已停止后续自动执行');
      err.code = 'A9_CHECKPOINT_RECONCILIATION_FAILED';
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
      const runnerAdapter = modules.runner.createTrustedShellLoopAdapter(loopTrustedRunner);
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
          const safeEvent = { ...event, data: redactForProjection(event.data) };
          pushTimeline(safeEvent);
          // F5：turn_started 携带 turnId，立即写入 active turn/run（不等 Turn 结束）。
          if (event.type === 'turn_started' && activeLifecycle && !activeLifecycle.turnId) {
            const runId = `run-${event.turnId}`;
            persistence.upsertTurn(event.turnId, activeLifecycle.taskId, a9SessionId, 'active');
            persistence.upsertRun(runId, event.turnId, a9SessionId, 'active');
            activeLifecycle = { ...activeLifecycle, turnId: event.turnId, runId };
          }
          persistence.recordToolEvent(a9SessionId, event.turnId, event.type, {
            type: event.type,
            data: safeEvent.data,
          });
          if (event.type === 'tool_end' && event.data && event.data.toolName === 'shell') {
            syncManagedProcessFacts();
          }
        },
        onApprovalPending: (approval) => {
          // 等待用户前持久化 pending 审批（含真实工具与目标绑定）。
          currentPendingApproval = approval;
          const safeApproval = redactApproval(approval);
          persistence.recordApproval({
            approvalId: approval.approvalId,
            sessionId: a9SessionId,
            turnId: approval.turnId,
            toolName: approval.toolName,
            binding: {
              conversationId: a9SessionId,
              taskId: activeLifecycle && activeLifecycle.taskId,
              turnId: approval.turnId,
              summary: safeApproval.summary,
              bindingDigest: approval.bindingDigest,
              args: safeApproval.args,
              ...(safeApproval.gitBinding ? { git: safeApproval.gitBinding } : {}),
            },
            decision: 'pending',
          });
        },
      });
      loopWorkspaceService = workspaceService;
      if (pendingConversationHistory && pendingConversationHistory.length > 0) {
        loop.restoreConversationHistory(pendingConversationHistory);
        pendingConversationHistory = null;
      }
    }
    return loop;
  }
  let loopWorkspaceService = null;

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
    const validatedBaseUrl = validateProviderBaseUrl(values.baseUrl);
    if (values.allowInsecureTLS === true) {
      const error = new Error('A9_PROVIDER_INSECURE_TLS_FORBIDDEN: TLS certificate verification cannot be disabled');
      error.code = 'A9_PROVIDER_INSECURE_TLS_FORBIDDEN';
      throw error;
    }
    if (typeof values.model !== 'string' || values.model.trim().length === 0) {
      throw new Error('A9_PROVIDER_CONFIG_INVALID: model 必须是手工填写的模型 ID');
    }
    // 新配置尝试从干净诊断状态开始；本次 DPAPI/probe 失败会重新写入真实原因。
    providerDiagnostics = null;

    const customHeaders = values.customHeaders && typeof values.customHeaders === 'object' ? values.customHeaders : {};
    const customHeaderNames = Object.keys(customHeaders);
    const headerValues = {};
    for (const name of customHeaderNames) headerValues[name] = String(customHeaders[name] ?? '');

    const proxyInput = values.proxy && typeof values.proxy === 'object' ? values.proxy : null;
    const remember = values.rememberApiKey === true;

    // F4：模型切换前保存完整标准化 conversation history；rebuildProvider 会
    // 置空 loop，因此用 pending 缓存，在新 loop 创建后恢复并一次性清除。
    pendingConversationHistory = loop ? loop.getConversationHistory() : null;

    const previousOrigin = providerConfig ? new URL(providerConfig.baseUrl).origin : null;
    const nextOrigin = new URL(validatedBaseUrl).origin;
    const suppliedApiKey = typeof values.apiKey === 'string' && values.apiKey.length > 0 ? values.apiKey : null;
    const originChanged = Boolean(previousOrigin && previousOrigin !== nextOrigin);
    if (originChanged && !suppliedApiKey) {
      memoryApiKey = null;
      try { if (apiKeyVault) apiKeyVault.clearApiKey(); } catch (_err) { /* best effort */ }
      try { if (secretsVault) secretsVault.clearApiKey(); } catch (_err) { /* best effort */ }
    }

    providerConfig = {
      baseUrl: validatedBaseUrl,
      model: values.model.trim(),
      customHeaderNames,
      ...(values.caBundle ? { caBundle: String(values.caBundle) } : {}),
      ...(proxyInput ? {
        proxy: {
          host: String(proxyInput.host),
          port: Number(proxyInput.port),
          ...(proxyInput.protocol ? { protocol: proxyInput.protocol } : {}),
          ...(proxyInput.username !== undefined ? { username: String(proxyInput.username) } : {}),
        },
      } : {}),
    };
    memoryApiKey = suppliedApiKey || memoryApiKey;
    memorySecrets = {
      headerValues,
      ...(proxyInput && proxyInput.password ? { proxyPassword: String(proxyInput.password) } : {}),
    };

    // API Key / 秘密仅经 DPAPI 保存；失败保留诊断并降级仅内存（不写明文）。
    // F4：secretsVault（Header 值/代理密码）的保存不依赖 API Key 是否存在。
    apiKeySource = 'none';
    let apiKeyPersisted = false;
    let secretsPersisted = false;
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
    }
    if (remember && secretsVault) {
      try {
        secretsVault.saveApiKey(JSON.stringify(memorySecrets));
        secretsPersisted = Boolean(memorySecrets)
          && (Object.keys(memorySecrets.headerValues || {}).length > 0 || Boolean(memorySecrets.proxyPassword));
      } catch (err) {
        providerDiagnostics = providerDiagnostics || { code: err && err.code ? err.code : 'A9_PROVIDER_SECRET_SAVE_FAILED', detail: redactSecrets(err.message) };
      }
    } else if (remember && hasSecretMaterial(memorySecrets)) {
      providerDiagnostics = providerDiagnostics || { code: 'A9_PROVIDER_DPAPI_UNAVAILABLE', detail: '当前环境无 DPAPI（非 Windows 或 safeStorage 不可用）：Header/代理秘密仅保存在进程内存' };
    }
    if (remember === false) {
      try { if (apiKeyVault) apiKeyVault.clearApiKey(); } catch (_err) { /* best effort */ }
      try { if (secretsVault) secretsVault.clearApiKey(); } catch (_err) { /* best effort */ }
    }
    const persistedSecret = apiKeyPersisted || secretsPersisted;
    apiKeySource = persistedSecret ? 'dpapi'
      : (memoryApiKey || hasSecretMaterial(memorySecrets)) ? 'memory' : 'none';

    rebuildProvider();

    // 保存配置时执行最小真实 Tool Calling probe（分类进入持久化与审计）。
    if (values.skipProbe === true) {
      providerProbe = { classification: 'skipped', checkedAt: new Date().toISOString(), note: '显式跳过（仅测试注入）' };
    } else {
      providerProbe = await classifyProviderWithProbe();
    }

    const keyRemembered = remember === true && persistedSecret === true && (await verifyPersistedSecretsReadable());
    // 返回值、当前快照、审计和重启后的 JSON 必须使用同一个已验证事实。
    providerConfig.keyRemembered = keyRemembered;
    writePersistedProviderConfig({
      schemaVersion: PROVIDER_CONFIG_SCHEMA_VERSION,
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      customHeaderNames,
      ...(providerConfig.caBundle ? { caBundle: providerConfig.caBundle } : {}),
      ...(providerConfig.proxy ? { proxy: providerConfig.proxy } : {}),
      // F4：keyRemembered=true 仅表示秘密（API Key 或 Header/代理密码）已成功经 DPAPI
      // 持久化且当前可读取；仅内存（memory）在返回值与快照中都显示未记住。
      keyRemembered,
      probe: providerProbe,
      updatedAt: new Date().toISOString(),
    });
    persistence.recordToolEvent(a9SessionId, null, 'provider.configure', {
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      classification: providerProbe.classification,
      keyRemembered: providerConfig.keyRemembered === true,
    });

    // 模型切换：新 loop 在下次 ensureRuntime 时恢复会话历史（不丢已完成工具结果）。

    return {
      ok: true,
      baseUrl: providerConfig.baseUrl,
      model: providerConfig.model,
      probe: providerProbe,
      keyRemembered: providerConfig.keyRemembered === true,
    };
  }

  /** F4：验证 DPAPI 秘密已持久化且当前可读取（不返回明文）。 */
  async function verifyPersistedSecretsReadable() {
    try {
      if (apiKeyVault && memoryApiKey) {
        const loaded = apiKeyVault.loadApiKey();
        if (loaded !== memoryApiKey) return false;
      }
      if (secretsVault && memorySecrets && Object.keys(memorySecrets.headerValues || {}).length + (memorySecrets.proxyPassword ? 1 : 0) > 0) {
        const loaded = JSON.parse(secretsVault.loadApiKey());
        if (JSON.stringify(loaded) !== JSON.stringify(memorySecrets)) return false;
      }
      return true;
    } catch (_err) {
      return false;
    }
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

  function statusesForOutcome(outcome) {
    if (outcome === 'needs_approval') return { turn: 'active', task: 'active', run: 'active' };
    if (outcome === 'completed') return { turn: 'completed', task: 'completed', run: 'completed' };
    if (outcome === 'completed_with_warnings') return { turn: 'completed_with_warnings', task: 'completed', run: 'completed' };
    if (outcome === 'blocked') return { turn: 'blocked', task: 'failed', run: 'failed' };
    if (outcome === 'cancelled') return { turn: 'cancelled', task: 'cancelled', run: 'cancelled' };
    return { turn: 'failed', task: 'failed', run: 'failed' };
  }

  function checkpointPayloadFor(result, pendingApproval, requestPrompt) {
    return {
      schemaVersion: 1,
      ...(requestPrompt ? { requestPrompt } : {}),
      outcome: result.outcome,
      verification: result.verification || 'not_applicable',
      finalMessage: redactSecrets(result.finalMessage || ''),
      toolCallsExecuted: Number.isFinite(result.toolCallsExecuted) ? result.toolCallsExecuted : 0,
      externalChanges: Array.isArray(result.externalChanges) ? result.externalChanges : [],
      ...(pendingApproval ? {
        pendingApproval: {
          approvalId: pendingApproval.approvalId,
          toolName: pendingApproval.toolName,
          bindingDigest: pendingApproval.bindingDigest,
        },
      } : {}),
    };
  }

  /** submit/resume 共用的唯一终态汇点：SQLite、快照和 checkpoint 同步更新。 */
  function persistTurnResult(lifecycle, result) {
    const statuses = statusesForOutcome(result.outcome);
    const pendingApproval = result.outcome === 'needs_approval'
      ? (result.pendingApproval || currentPendingApproval)
      : null;
    persistence.upsertTurn(result.turnId, lifecycle.taskId, a9SessionId, statuses.turn, {
      schemaVersion: 1,
      outcome: result.outcome,
      verification: result.verification,
    });
    persistence.upsertRun(lifecycle.runId, result.turnId, a9SessionId, statuses.run);
    persistence.upsertTask(lifecycle.taskId, a9SessionId, statuses.task);
    currentPendingApproval = pendingApproval;
    persistence.saveCheckpoint({
      turnId: result.turnId,
      sessionId: a9SessionId,
      payload: checkpointPayloadFor(result, pendingApproval, lifecycle.requestPrompt),
    });
    if (result.externalChanges && result.externalChanges.length > 0) {
      persistence.recordToolEvent(a9SessionId, result.turnId, 'external.changes', { changes: result.externalChanges });
    }
    restoredContext = buildPersistedTextContext(persistence.listConversationFacts(a9SessionId));
    agentStatus = result.outcome;
    activeLifecycle = result.outcome === 'needs_approval' ? lifecycle : null;
  }

  function persistUnexpectedFailure(error, lifecycle) {
    agentStatus = 'failed';
    if (!lifecycle) return;
    const detail = redactSecrets(error && error.message ? error.message : String(error));
    try {
      persistence.upsertTask(lifecycle.taskId, a9SessionId, 'failed');
      if (lifecycle.turnId) {
        persistence.upsertTurn(lifecycle.turnId, lifecycle.taskId, a9SessionId, 'failed', { schemaVersion: 1, error: detail });
        persistence.upsertRun(lifecycle.runId, lifecycle.turnId, a9SessionId, 'failed');
        persistence.saveCheckpoint({
          turnId: lifecycle.turnId,
          sessionId: a9SessionId,
          payload: {
            schemaVersion: 1,
            ...(lifecycle.requestPrompt ? { requestPrompt: lifecycle.requestPrompt } : {}),
            outcome: 'failed',
            verification: 'not_applicable',
            finalMessage: detail,
            toolCallsExecuted: 0,
            externalChanges: [],
          },
        });
      }
    } catch (persistenceError) {
      // 返回给调用方的错误包含持久化失败，不能静默冒充已落终态。
      if (error && (typeof error === 'object' || typeof error === 'function')) {
        error.persistenceError = redactSecrets(persistenceError && persistenceError.message ? persistenceError.message : String(persistenceError));
      }
    }
    activeLifecycle = null;
    currentPendingApproval = null;
  }

  function approvalIdentity(approval) {
    const safeApproval = redactApproval(approval);
    return {
      ...safeApproval,
      conversationId: a9SessionId,
      taskId: activeLifecycle && activeLifecycle.taskId,
      turnId: approval && (approval.turnId || (activeLifecycle && activeLifecycle.turnId)),
      bindingDigest: approval && approval.bindingDigest,
    };
  }

  function presentTurnResult(result) {
    if (!result || result.outcome !== 'needs_approval') return result;
    const approval = result.pendingApproval || currentPendingApproval;
    return { ...result, pendingApproval: approvalIdentity(approval) };
  }

  async function submitTurn(prompt) {
    if (activeController) {
      const err = new Error('A9_TURN_ALREADY_ACTIVE: 当前已有运行中的任务');
      err.code = 'A9_TURN_ALREADY_ACTIVE';
      return { ok: false, error: serializeError(err) };
    }
    if (currentPendingApproval) {
      const err = new Error('A9_APPROVAL_REQUIRED: 请先处理当前挂起审批');
      err.code = 'A9_APPROVAL_REQUIRED';
      return { ok: false, error: serializeError(err) };
    }
    let createdTaskId = null;
    let ownedController = null;
    try {
      ownedController = new AbortController();
      activeController = ownedController;
      agentStatus = 'running';
      // F5：Turn 开始前创建并持久化 active task。
      createdTaskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const requestPrompt = String(prompt || '').slice(0, 8000);
      const persistedRequestPrompt = redactSecrets(requestPrompt);
      persistence.upsertTask(createdTaskId, a9SessionId, 'active');
      persistence.recordModelEvent(a9SessionId, null, 'conversation.request', {
        schemaVersion: 1,
        taskId: createdTaskId,
        requestPrompt: persistedRequestPrompt,
      });
      activeConversation = persistence.maybeSetAutomaticTitle(a9SessionId, persistedRequestPrompt);
      saveDraft('');
      activeLifecycle = { taskId: createdTaskId, turnId: null, runId: null, requestPrompt: persistedRequestPrompt };
      const activeLoop = ensureRuntime();
      const result = await activeLoop.runTurn(requestPrompt, { signal: ownedController.signal });
      // turn_started 已写入 active turn/run；这里补齐句柄（幂等）。
      const runId = activeLifecycle && activeLifecycle.runId ? activeLifecycle.runId : `run-${result.turnId}`;
      if (!activeLifecycle || !activeLifecycle.turnId) {
        persistence.upsertTurn(result.turnId, createdTaskId, a9SessionId, 'active');
        persistence.upsertRun(runId, result.turnId, a9SessionId, 'active');
      }
      const lifecycle = {
        taskId: createdTaskId,
        turnId: result.turnId,
        runId,
        requestPrompt: activeLifecycle && activeLifecycle.requestPrompt ? activeLifecycle.requestPrompt : persistedRequestPrompt,
      };
      activeLifecycle = lifecycle;
      persistTurnResult(lifecycle, result);
      return { ok: true, result: presentTurnResult(result) };
    } catch (error) {
      let failureLifecycle = activeLifecycle || (createdTaskId ? { taskId: createdTaskId, turnId: null, runId: null } : null);
      if (failureLifecycle && !failureLifecycle.turnId) {
        const failureTurnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        failureLifecycle = { ...failureLifecycle, turnId: failureTurnId, runId: `run-${failureTurnId}` };
      }
      persistUnexpectedFailure(error, failureLifecycle);
      return { ok: false, error: serializeError(error) };
    } finally {
      if (activeController === ownedController) activeController = null;
    }
  }

  async function resumeApproval(input) {
    let resumeProducedResult = false;
    let ownedController = null;
    try {
      if (!input || typeof input !== 'object' || !input.approvalId || !input.bindingDigest ||
          !input.conversationId || !input.taskId || !input.turnId ||
          (input.decision !== 'approved' && input.decision !== 'denied')) {
        const err = new Error('A9_APPROVAL_INPUT_INVALID: 回复必须携带对话/任务/Turn/approval 身份、decision 与 bindingDigest');
        err.code = 'A9_APPROVAL_INPUT_INVALID';
        throw err;
      }
      const original = currentPendingApproval;
      if (!original || original.approvalId !== input.approvalId) {
        const err = new Error('A9_APPROVAL_UNKNOWN: 没有匹配的挂起审批');
        err.code = 'A9_APPROVAL_UNKNOWN';
        throw err;
      }
      const identity = approvalIdentity(original);
      if (input.conversationId !== identity.conversationId || input.taskId !== identity.taskId ||
          input.turnId !== identity.turnId || input.bindingDigest !== identity.bindingDigest) {
        const err = new Error('A9_APPROVAL_STALE: 审批与当前对话/任务/Turn/目标绑定不匹配');
        err.code = 'A9_APPROVAL_STALE';
        throw err;
      }
      const activeLoop = ensureRuntime();
      if (activeController) {
        const duplicate = approvalDecisionInFlightId === input.approvalId;
        const err = new Error(duplicate
          ? 'A9_APPROVAL_DECISION_IN_PROGRESS: 当前审批正在处理，请等待结果'
          : 'A9_TURN_ALREADY_ACTIVE: 当前已有运行中的任务');
        err.code = duplicate ? 'A9_APPROVAL_DECISION_IN_PROGRESS' : 'A9_TURN_ALREADY_ACTIVE';
        throw err;
      }
      ownedController = new AbortController();
      activeController = ownedController;
      approvalDecisionInFlightId = input.approvalId;
      // R2.7：SQLite 记录来自原始 pending 审批，而不是恢复执行后的结果。
      const result = await activeLoop.resumeAfterApproval({
        approvalId: input.approvalId,
        decision: input.decision,
        bindingDigest: input.bindingDigest,
      }, { signal: ownedController.signal });
      resumeProducedResult = true;
      persistence.recordApproval({
        approvalId: original.approvalId,
        sessionId: a9SessionId,
        turnId: original.turnId,
        toolName: original.toolName,
        binding: {
          conversationId: identity.conversationId,
          taskId: identity.taskId,
          turnId: identity.turnId,
          summary: identity.summary,
          bindingDigest: original.bindingDigest,
          args: identity.args,
          ...(identity.gitBinding ? { git: identity.gitBinding } : {}),
        },
        decision: input.decision,
      });
      const lifecycle = activeLifecycle || null;
      if (lifecycle && lifecycle.turnId) {
        persistTurnResult(lifecycle, result);
      } else {
        const err = new Error('A9_LIFECYCLE_MISSING: 挂起审批缺少 task/turn/run 生命周期事实');
        err.code = 'A9_LIFECYCLE_MISSING';
        throw err;
      }
      return { ok: true, result: presentTurnResult(result) };
    } catch (error) {
      if (resumeProducedResult) persistUnexpectedFailure(error, activeLifecycle);
      return { ok: false, error: serializeError(error) };
    } finally {
      if (ownedController && approvalDecisionInFlightId === (input && input.approvalId)) approvalDecisionInFlightId = null;
      if (activeController === ownedController) activeController = null;
    }
  }

  function stop() {
    if (activeController) {
      activeController.abort();
      agentStatus = 'cancelling';
      return { ok: true };
    }
    const manager = loopTrustedRunner.getBackgroundManager();
    const active = manager.list().filter((item) => item.status === 'running' || item.status === 'starting');
    if (active.length === 0) return { ok: false, error: { code: 'NO_ACTIVE_TURN_OR_MANAGED_PROCESS' } };
    return (async () => {
      const stopped = [];
      const errors = [];
      for (const handle of active) {
        try {
          const result = await manager.stop(handle.handleId);
          recordManagedHandle(result);
          stopped.push(handle.handleId);
        } catch (error) {
          errors.push({
            handleId: handle.handleId,
            code: error && error.code ? String(error.code) : 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED',
            message: redactSecrets(error && error.message ? error.message : String(error)),
          });
        }
      }
      syncManagedProcessFacts();
      if (errors.length > 0) {
        return { ok: false, stopped, errors, error: { code: 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED', message: '部分后台进程清理无法确认，请检查残留。' } };
      }
      return { ok: true, stopped };
    })();
  }

  function setMode(mode) {
    if (mode !== 'full_access' && mode !== 'review' && mode !== 'read_only') {
      // F6：精确 A9_MODE_INVALID（serializeError 依赖 error.code 透传）。
      const err = new Error('A9_MODE_INVALID: 权限模式必须是 full_access/review/read_only');
      err.code = 'A9_MODE_INVALID';
      throw err;
    }
    permissionMode = mode;
    modeStore.save(workspaceRoot, mode);
    persistence.setWorkspaceMode(canonicalWorkspace, mode);
    persistence.recordToolEvent(a9SessionId, null, 'mode.set', { mode, workspace: canonicalWorkspace });
    pendingConversationHistory = loop ? loop.getConversationHistory() : pendingConversationHistory;
    loop = null;
    return { ok: true, mode };
  }

  function getSnapshot() {
    const shellSelection = modules.runner.selectShell({});
    const managedProcesses = syncManagedProcessFacts();
    const activeManaged = managedProcesses.filter((item) => item.lastProbeStatus === 'running' || item.lastProbeStatus === 'starting');
    const blockReason = conversationBlockReason();
    return {
      schemaVersion: A9_PROTOCOL_VERSION,
      status: 'ready',
      workspaceRoot,
      lock: { held: lockHeld && !workspaceLockReleased, holder: lock.holder },
      mode: permissionMode === undefined ? 'needs_selection' : permissionMode,
      modeRecommended: 'full_access',
      ...(modeDiagnostics ? { modeDiagnostics } : {}),
      ...(checkpointRecoveryDiagnostics ? { checkpointRecoveryDiagnostics } : {}),
      shell: { kind: shellSelection.kind, version: shellSelection.version, evidence: shellSelection.evidence, reason: shellSelection.reason },
      provider: providerConfig
        ? {
          configured: true,
          baseUrl: providerConfig.baseUrl,
          model: providerConfig.model,
          probe: providerProbe,
          apiKey: {
            // F4：remembered 仅在 DPAPI 持久化成功且当前可读取时为 true；memory 表示未记住。
            remembered: providerConfig.keyRemembered === true,
            source: apiKeySource,
            ...(apiKeySource === 'memory' ? { note: '未记住：仅保存在进程内存（DPAPI 不可用或未启用）' } : {}),
            vaultAvailable: Boolean(apiKeyVault),
          },
          ...(providerDiagnostics ? { diagnostics: providerDiagnostics } : {}),
        }
        : { configured: false, note: '正式产品使用真实 OpenAI-compatible Provider；Replay 仅测试入口', ...(providerDiagnostics ? { diagnostics: providerDiagnostics } : {}) },
      agentStatus,
      activeConversationId: a9SessionId,
      conversations: persistence.listConversations(canonicalWorkspace),
      conversationControls: {
        canSwitch: !blockReason,
        reason: blockReason,
        maxActive: modules.state.A9_MAX_ACTIVE_CONVERSATIONS || 16,
      },
      contextWindow: restoredContext.stats,
      draft: readDraft(a9SessionId),
      ...(persistenceOutcome.backupPath ? {
        migrationBackup: {
          path: persistenceOutcome.backupPath,
          sha256: persistenceOutcome.backupSha256,
        },
      } : {}),
      controls: {
        canStop: Boolean(activeController) || activeManaged.length > 0,
        stopKind: activeController ? 'turn' : activeManaged.length > 0 ? 'managed_process' : 'none',
      },
      // runTurn/resumeAfterApproval 尚未返回时不把审批暴露给 Renderer；否则旧卡片
      // 可在控制器释放前再次提交，形成 A9_TURN_ALREADY_ACTIVE 竞态。
      ...(currentPendingApproval && !activeController ? { pendingApproval: approvalIdentity(currentPendingApproval) } : {}),
      timeline: timeline.slice(-100),
      checkpoints: persistence.listCheckpoints(a9SessionId),
      conversation: persistence.listConversationFacts(a9SessionId),
      interruptions: persistence.listInterruptions(a9SessionId),
      managedProcesses,
    };
  }

  function workspaceServiceForState() {
    return loopWorkspaceService || standaloneWorkspaceService;
  }

  function assertCheckpointForCurrentConversation(turnId) {
    const checkpoint = persistence.getCheckpoint(String(turnId));
    if (!checkpoint) {
      const err = new Error('A9_CHECKPOINT_NOT_FOUND');
      err.code = 'A9_CHECKPOINT_NOT_FOUND';
      throw err;
    }
    if (checkpoint.sessionId !== a9SessionId) {
      const err = new Error('A9_CHECKPOINT_CONVERSATION_MISMATCH: Checkpoint 不属于当前对话');
      err.code = 'A9_CHECKPOINT_CONVERSATION_MISMATCH';
      throw err;
    }
  }

  function undoTurn(turnId) {
    assertCheckpointForCurrentConversation(turnId);
    return { ok: true, outcome: workspaceServiceForState().getCheckpointManager().undoTurn(String(turnId)) };
  }

  function undoFile(turnId, relPath) {
    assertCheckpointForCurrentConversation(turnId);
    return { ok: true, outcome: workspaceServiceForState().getCheckpointManager().undoFile(String(turnId), String(relPath)) };
  }

  function getDiff(turnId) {
    assertCheckpointForCurrentConversation(turnId);
    return { ok: true, diff: workspaceServiceForState().getCheckpointManager().getTurnDiff(String(turnId)) };
  }

  function canLeaveWorkspace() {
    const reason = conversationBlockReason();
    return { allowed: !reason, reason };
  }

  async function gitStatus() {
    const projection = await modules.gitAdapter.projectTrustedGit(workspaceRoot);
    return { ok: true, projection };
  }

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    const manager = loopTrustedRunner.getBackgroundManager();
    const releaseWorkspaceLock = () => {
      if (!workspaceLockReleased) {
        if (lockHeld) persistence.releaseWorkspaceLock(canonicalWorkspace, ownerId);
        workspaceLockReleased = true;
      }
    };
    if (!activeController && manager.getActiveCount() === 0) {
      // 保留既有无负载关闭语义：无需等待时同步释放锁，紧接着切换/重开
      // 同一工作区不会短暂误报 A9_WORKSPACE_LOCKED。
      releaseWorkspaceLock();
      shutdownPromise = Promise.resolve({ stopped: [], leftToSystem: [] });
      return shutdownPromise;
    }
    const attempt = (async () => {
      if (activeController) {
        activeController.abort();
        agentStatus = 'cancelling';
        const deadline = Date.now() + 10_000;
        while (activeController && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      const before = manager.list();
      const result = await manager.dispose({ stopManaged: true });
      for (const handle of before) {
        recordManagedHandle({
          ...handle,
          status: result.stopped.includes(handle.handleId) ? 'stopped' : handle.status,
        });
      }
      if (activeController) {
        result.leftToSystem.push('active turn cleanup did not settle before the 10 second shutdown deadline');
      }
      const cleanupConfirmed = !activeController && manager.getActiveCount() === 0 && result.leftToSystem.length === 0;
      if (cleanupConfirmed) releaseWorkspaceLock();
      return result;
    })();
    shutdownPromise = attempt;
    attempt.then(() => {
      // A clean shutdown remains idempotently cached. An unresolved attempt is
      // retryable after the user stops a recovered process or cleanup settles.
      if (!workspaceLockReleased && shutdownPromise === attempt) shutdownPromise = null;
    }, () => {
      if (shutdownPromise === attempt) shutdownPromise = null;
    });
    return attempt;
  }

  return {
    protocolVersion: A9_PROTOCOL_VERSION,
    status: 'ready',
    configureProvider,
    probeProvider,
    submitTurn,
    resumeApproval,
    stop,
    saveDraft,
    createConversation,
    activateConversation,
    renameConversation,
    archiveConversation,
    restoreConversation,
    canLeaveWorkspace,
    setMode,
    getSnapshot,
    undoTurn,
    undoFile,
    getDiff,
    gitStatus,
    shutdown,
  };
}

function createConversationId() {
  return `a9c-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * 重启/切换时只恢复完整用户+助手文本轮；工具、审批和副作用不进入模型上下文。
 */
function buildPersistedTextContext(facts) {
  const complete = (Array.isArray(facts) ? facts : []).filter((fact) =>
    typeof fact.requestPrompt === 'string' && fact.requestPrompt.length > 0
    && typeof fact.finalMessage === 'string' && fact.finalMessage.length > 0);
  const selected = [];
  let includedChars = 0;
  for (let index = complete.length - 1; index >= 0 && selected.length < 20; index -= 1) {
    const fact = complete[index];
    const roundChars = fact.requestPrompt.length + fact.finalMessage.length;
    if (includedChars + roundChars > 32_000) break;
    selected.push(fact);
    includedChars += roundChars;
  }
  selected.reverse();
  const omittedRounds = Math.max(0, complete.length - selected.length);
  return {
    messages: selected.flatMap((fact) => [
      { role: 'user', content: fact.requestPrompt },
      { role: 'assistant', content: fact.finalMessage },
    ]),
    stats: {
      includedRounds: selected.length,
      includedChars,
      omittedRounds,
      visibleRounds: Array.isArray(facts) ? facts.length : 0,
      maxRounds: 20,
      maxChars: 32_000,
      ...(omittedRounds > 0 ? { note: `更早的 ${omittedRounds} 个完整轮次仅在本地可见，未恢复给 Provider。` } : {}),
    },
  };
}

function preflightElectronSqlite(root) {
  try {
    const modulePath = path.join(String(root), 'node_modules', 'better-sqlite3');
    // eslint-disable-next-line global-require
    const Database = require(modulePath);
    const probe = new Database(':memory:');
    const version = probe.prepare('select sqlite_version() v').get();
    probe.close();
    return {
      ok: true,
      sqliteVersion: version && version.v,
      openDatabase: (databasePath, opts) => new Database(databasePath, opts && opts.readonly ? { readonly: true } : {}),
    };
  } catch (err) {
    return { ok: false, reason: `${err && err.message ? err.message : String(err)}` };
  }
}

function createSqliteUnavailableRuntime(reason) {
  return {
    protocolVersion: 1,
    status: 'electron_sqlite_unavailable',
    diagnostics: { code: 'ELECTRON_SQLITE_UNAVAILABLE', detail: reason },
    configureProvider() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    probeProvider() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    async submitTurn() { return { ok: false, error: { code: 'ELECTRON_SQLITE_UNAVAILABLE', message: 'Electron-ABI better-sqlite3 预检失败，A9 持久化不可用。' } }; },
    async resumeApproval() { return { ok: false, error: { code: 'ELECTRON_SQLITE_UNAVAILABLE' } }; },
    stop() { return { ok: false }; },
    saveDraft() { return { ok: false, error: { code: 'ELECTRON_SQLITE_UNAVAILABLE' } }; },
    createConversation() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    activateConversation() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    renameConversation() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    archiveConversation() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    restoreConversation() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    canLeaveWorkspace() { return { allowed: true, reason: null }; },
    setMode() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    getSnapshot() { return { schemaVersion: 1, status: 'electron_sqlite_unavailable', diagnostics: { code: 'ELECTRON_SQLITE_UNAVAILABLE', detail: reason } }; },
    undoTurn() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    undoFile() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    getDiff() { throw new Error('ELECTRON_SQLITE_UNAVAILABLE'); },
    async gitStatus() { return { ok: false, error: { code: 'ELECTRON_SQLITE_UNAVAILABLE' } }; },
    shutdown() {},
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
    saveDraft() { return { ok: false, error: { code: 'A9_DIAGNOSTICS_MODE' } }; },
    createConversation() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    activateConversation() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    renameConversation() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    archiveConversation() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    restoreConversation() { throw new Error('A9_DIAGNOSTICS_MODE'); },
    canLeaveWorkspace() { return { allowed: true, reason: null }; },
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
