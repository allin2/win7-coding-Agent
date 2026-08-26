'use strict';

/**
 * A9 Agent 面板（正式 Renderer 表面）。
 *
 * 只经 window.win7Agent.a9 的版本化窄 IPC 访问能力；本文件不接触
 * fs/child_process/凭据/网络。A8 历史表面保持原标识，不冒充 A9。
 */
(function exposeA9AgentPanel(root) {
  const a9 = root.win7Agent && root.win7Agent.a9 ? root.win7Agent.a9 : null;

  function el(id) { return document.getElementById(id); }
  function text(id, value) { const node = el(id); if (node) node.textContent = value; }

  const MODE_LABELS = Object.freeze({
    full_access: 'Full Access',
    review: 'Review',
    read_only: 'Read Only',
    needs_selection: '待选择',
  });
  let lastSnapshot = null;
  let approvalDecisionInFlight = null;

  function clearApprovalError() {
    const node = el('a9-approval-error');
    if (!node) return;
    node.textContent = '';
    node.hidden = true;
  }

  function setApprovalDecisionBusy(busy) {
    for (const id of ['a9-approval-approve', 'a9-approval-deny']) {
      const button = el(id);
      if (!button) continue;
      button.disabled = busy;
      if (busy) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    }
  }

  function modeLabel(mode) { return MODE_LABELS[mode] || String(mode || '-'); }

  function closeModeDialog() {
    const modeDialog = el('a9-mode-dialog');
    if (!modeDialog) return;
    if (modeDialog.open && typeof modeDialog.close === 'function') modeDialog.close();
    else modeDialog.removeAttribute('open');
    modeDialog.hidden = true;
  }

  function configureModeDialog(snapshot, open) {
    const modeDialog = el('a9-mode-dialog');
    if (!modeDialog) return;
    const configured = snapshot.mode !== 'needs_selection';
    const selectedMode = configured ? snapshot.mode : (snapshot.modeRecommended || 'full_access');
    const modeRadios = modeDialog.querySelectorAll('input[name="a9-mode-choice"]');
    modeRadios.forEach((radio) => { radio.checked = radio.value === selectedMode; });
    text('a9-mode-workspace', snapshot.workspaceRoot || '尚未绑定工作区');
    text('a9-mode-kicker', 'WORKSPACE PERMISSIONS');
    text('a9-mode-title', configured ? '更改此工作区的权限' : '选择此工作区的权限');
    text('a9-mode-badge', configured ? '可随时更改' : '首次设置');
    text('a9-mode-intro', configured
      ? '当前模式已保存到此工作区。重新选择后立即保存；正在执行的当前轮不会改变，下一轮使用新模式。'
      : '每个工作区单独保存权限。推荐 Full Access；它使用当前 Windows 用户权限，不提供额外沙箱。');
    text('a9-mode-apply', configured ? '保存权限模式' : '使用所选模式');
    const cancel = el('a9-mode-cancel');
    if (cancel) cancel.hidden = !configured;
    modeDialog.dataset.modeConfigured = configured ? 'true' : 'false';
    if (open) {
      modeDialog.hidden = false;
    } else if (!modeDialog.open) {
      modeDialog.hidden = true;
    }
    if (open && !modeDialog.open) {
      if (typeof modeDialog.showModal === 'function') modeDialog.showModal();
      else modeDialog.setAttribute('open', '');
      const selected = Array.from(modeRadios).find((radio) => radio.checked);
      if (selected && typeof selected.focus === 'function') selected.focus();
    }
  }

  function openModeDialog() {
    if (!lastSnapshot || lastSnapshot.status !== 'ready' || !lastSnapshot.workspaceRoot) return;
    configureModeDialog(lastSnapshot, true);
  }

  function renderRuntimeError(error) {
    const node = el('a9-runtime-error');
    if (!node) return;
    if (!error) {
      node.textContent = '';
      node.hidden = true;
      return;
    }
    const code = error.code || 'A9_RUNTIME_UNAVAILABLE';
    const detail = error.detail || error.error || error.message || error.reason || '';
    const hint = error.hint || error.recommendedAction || '';
    node.textContent = [code, detail, hint].filter(Boolean).join('：');
    node.hidden = false;
  }

  async function refreshSnapshot() {
    if (!a9) return null;
    let response;
    try {
      response = await a9.snapshot();
    } catch (error) {
      renderRuntimeError({ code: 'A9_SNAPSHOT_FAILED', message: error && error.message ? error.message : String(error) });
      return null;
    }
    if (!response || response.ok !== true) {
      // 尚未选择工作区是正常的首次启动状态；选择后的真实初始化错误必须可见。
      const error = response && response.error;
      renderRuntimeError(error && error.code === 'A9_WORKSPACE_REQUIRED' ? null : error);
      const modeButton = el('a9-mode-open');
      if (modeButton) modeButton.hidden = true;
      return null;
    }
    renderSnapshot(response.snapshot);
    return response.snapshot;
  }

  function renderSnapshot(snapshot) {
    const surface = el('a9-surface');
    if (!surface) return;
    lastSnapshot = snapshot;
    surface.dataset.a9Status = snapshot.status || 'ready';
    const diagnostics = snapshot.diagnostics;
    renderRuntimeError(snapshot.status && snapshot.status !== 'ready'
      ? { code: diagnostics && diagnostics.code ? diagnostics.code : `A9_RUNTIME_${String(snapshot.status).toUpperCase()}`, ...(diagnostics || {}) }
      : null);

    // 状态栏：工作区（主进程确认的绝对路径）/ 模式 / Shell / Provider / Agent。
    const workspaceNode = el('a9-workspace-value');
    if (workspaceNode) {
      workspaceNode.textContent = snapshot.workspaceRoot || '-';
      workspaceNode.title = snapshot.workspaceRoot || '';
    }
    text('a9-mode-value', modeLabel(snapshot.mode));
    const modeButton = el('a9-mode-open');
    const modeAvailable = snapshot.status === 'ready' && Boolean(snapshot.workspaceRoot);
    if (modeButton) {
      modeButton.hidden = !modeAvailable;
      modeButton.disabled = !modeAvailable;
      modeButton.textContent = `权限：${modeLabel(snapshot.mode)}`;
      modeButton.setAttribute('aria-label', `重新选择权限模式，当前为${modeLabel(snapshot.mode)}`);
    }
    text('a9-shell-value', snapshot.shell ? `${snapshot.shell.kind}${snapshot.shell.version ? ' ' + snapshot.shell.version : ''}` : '-');
    const provider = snapshot.provider || {};
    text('a9-provider-value', provider.configured ? `${provider.model} @ ${provider.baseUrl}` : '未配置（正式产品不默认 Replay）');
    text('a9-agent-value', String(snapshot.agentStatus || 'idle'));
    text('a9-lock-value', snapshot.lock
      ? (snapshot.lock.held ? '本窗口持有写锁' : `被 ${snapshot.lock.holder || '其他窗口'} 持有`)
      : '-');

    // 首次模式选择，或由全局头部按钮重新打开。
    const modeDialog = el('a9-mode-dialog');
    if (modeDialog) {
      const needsSelection = !(snapshot.status && snapshot.status !== 'ready') && snapshot.mode === 'needs_selection';
      configureModeDialog(snapshot, needsSelection);
      // A manually opened dialog remains open across unrelated snapshot refreshes;
      // chooseMode closes it explicitly after the new mode is persisted.
      if (needsSelection && modeDialog.open !== true) configureModeDialog(snapshot, true);
    }

    // Provider 状态（不回显密钥）。
    const apiKey = provider.apiKey || {};
    text('a9-provider-key-state', provider.configured
      ? `key: ${apiKey.remembered ? '已记住' : '未记住'}（${apiKey.source || 'none'}）`
      : '-');
    text('a9-provider-probe-state', provider.probe ? `${provider.probe.classification}` : '未探测');
    if (provider.diagnostics) text('a9-provider-diagnostics', `${provider.diagnostics.code}: ${provider.diagnostics.detail || ''}`);

    // 审批卡：显示绑定目标。
    const approvalCard = el('a9-approval-card');
    if (approvalCard) {
      const pending = snapshot.pendingApproval;
      const previousApprovalId = approvalCard.dataset.approvalId || '';
      approvalCard.hidden = !pending;
      if (pending) {
        if (previousApprovalId !== pending.approvalId) clearApprovalError();
        text('a9-approval-summary', pending.summary);
        text('a9-approval-tool', pending.toolName);
        text('a9-approval-id', pending.approvalId);
        const git = pending.gitBinding;
        text('a9-approval-git', git
          ? `remote=${git.remote || '-'} branch=${git.branch || '-'} force=${git.force} delete=${git.deleteTarget || '-'}`
          : '非 Git 操作');
        approvalCard.dataset.approvalId = pending.approvalId;
        approvalCard.dataset.bindingDigest = pending.bindingDigest;
      } else {
        delete approvalCard.dataset.approvalId;
        delete approvalCard.dataset.bindingDigest;
        clearApprovalError();
      }
      setApprovalDecisionBusy(Boolean(approvalDecisionInFlight));
    }

    // 工具时间线。
    const timeline = el('a9-timeline');
    if (timeline) {
      timeline.textContent = '';
      for (const event of (snapshot.timeline || []).slice(-40)) {
        const item = document.createElement('li');
        const data = event.data || {};
        const bits = [event.type];
        if (data.toolName) bits.push(data.toolName);
        if (data.exitCode !== undefined) bits.push(`exit=${data.exitCode}`);
        if (data.summary) bits.push(String(data.summary).slice(0, 80));
        item.textContent = bits.join(' · ');
        timeline.appendChild(item);
      }
    }

    // Checkpoint / 中断 / 诊断。
    text('a9-checkpoint-count', String((snapshot.checkpoints || []).length));
    const interruptions = el('a9-interruptions');
    if (interruptions) {
      interruptions.textContent = (snapshot.interruptions || []).map((i) => `${i.kind}:${i.id}`).join(', ') || '无';
    }
    const checkpointList = el('a9-checkpoint-list');
    if (checkpointList) {
      checkpointList.textContent = '';
      for (const checkpoint of (snapshot.checkpoints || []).slice(-10)) {
        const item = document.createElement('li');
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.textContent = `撤销 ${checkpoint.turnId.slice(0, 18)}`;
        undo.addEventListener('click', () => {
          void undoTurn(checkpoint.turnId);
        });
        const diff = document.createElement('button');
        diff.type = 'button';
        diff.textContent = 'Diff';
        diff.addEventListener('click', () => {
          void showDiff(checkpoint.turnId);
        });
        item.appendChild(undo);
        item.appendChild(diff);
        checkpointList.appendChild(item);
      }
    }
    renderGitStatus(snapshot.git);
  }

  let lastGitStatus = null;
  function renderGitStatus(git) {
    lastGitStatus = git || lastGitStatus;
    const node = el('a9-git-status');
    if (!node || !lastGitStatus) return;
    if (lastGitStatus.isGit === false) {
      node.textContent = lastGitStatus.degradedReason || '非 Git 工作区';
      return;
    }
    const external = (lastGitStatus.externalMechanisms || []).map((m) => m.kind).join(', ');
    node.textContent = `${lastGitStatus.branch || '-'} · ${lastGitStatus.clean ? 'clean' : `${lastGitStatus.entries.length} 处变更`} · 外部机制: ${external || '无'}`;
  }

  async function chooseMode(mode) {
    const applyButton = el('a9-mode-apply');
    if (applyButton) {
      applyButton.disabled = true;
      applyButton.setAttribute('aria-busy', 'true');
    }
    try {
      const response = await a9.setMode(mode);
      if (response && response.ok === true) {
        closeModeDialog();
        await refreshSnapshot();
      } else {
        const modeError = el('a9-mode-error');
        if (modeError) modeError.hidden = false;
        text('a9-mode-error', (response && response.error && response.error.message) || '模式设置失败');
      }
      return response;
    } finally {
      if (applyButton) {
        applyButton.disabled = false;
        applyButton.removeAttribute('aria-busy');
      }
    }
  }

  async function applyProviderForm() {
    const values = {
      baseUrl: (el('a9-provider-url') || {}).value || '',
      model: (el('a9-provider-model') || {}).value || '',
      apiKey: (el('a9-provider-key') || {}).value || undefined,
      rememberApiKey: Boolean((el('a9-provider-remember') || {}).checked),
      caBundle: (el('a9-provider-ca') || {}).value || undefined,
      allowInsecureTLS: Boolean((el('a9-provider-insecure') || {}).checked),
    };
    const headerName = (el('a9-provider-header-name') || {}).value || '';
    const headerValue = (el('a9-provider-header-value') || {}).value || '';
    if (headerName && headerValue) values.customHeaders = { [headerName]: headerValue };
    const proxyHost = (el('a9-provider-proxy-host') || {}).value || '';
    const proxyPort = Number((el('a9-provider-proxy-port') || {}).value || 0);
    if (proxyHost && proxyPort > 0) values.proxy = { host: proxyHost, port: proxyPort };

    const response = await a9.configureProvider(values);
    if (response && response.ok === true) {
      const keyInput = el('a9-provider-key');
      if (keyInput) keyInput.value = '';
      text('a9-provider-probe-state', `${response.probe.classification}`);
      await refreshSnapshot();
    } else {
      text('a9-provider-error', (response && response.error && response.error.message) || 'Provider 配置失败');
    }
    return response;
  }

  async function runProbe() {
    const response = await a9.probeProvider();
    text('a9-provider-probe-state', response && response.ok === true
      ? (response.probe.hasToolCalling ? 'tool_calling' : 'chat_only')
      : 'unavailable');
    await refreshSnapshot();
    return response;
  }

  let runningTurnId = null;
  async function submitPrompt() {
    const prompt = (el('a9-prompt') || {}).value || '';
    if (!prompt) return null;
    const stopButton = el('a9-stop');
    if (stopButton) stopButton.hidden = false;
    const response = await a9.submitTurn(prompt);
    if (stopButton) stopButton.hidden = true;
    if (response && response.ok === true) {
      runningTurnId = response.result.turnId;
      text('a9-turn-outcome', `${response.result.outcome} / ${response.result.verification || 'not_applicable'}`);
      const output = el('a9-shell-output');
      if (output) output.textContent = response.result.finalMessage || '';
    } else {
      text('a9-turn-error', (response && response.error && response.error.message) || 'Turn 失败');
    }
    await refreshSnapshot();
    return response;
  }

  async function stopTurn() {
    const response = await a9.stop();
    await refreshSnapshot();
    return response;
  }

  async function decideApproval(decision) {
    if (approvalDecisionInFlight) return approvalDecisionInFlight.promise;
    const card = el('a9-approval-card');
    if (!card || card.hidden) return null;
    const approvalId = card.dataset.approvalId;
    const bindingDigest = card.dataset.bindingDigest;
    const operation = { approvalId, promise: null };
    approvalDecisionInFlight = operation;
    clearApprovalError();
    setApprovalDecisionBusy(true);
    operation.promise = (async () => {
      let response;
      try {
        try {
          response = await a9.resumeApproval(approvalId, decision, bindingDigest);
        } catch (error) {
          response = { ok: false, error: { message: error && error.message ? error.message : String(error) } };
        }
        if (response && response.ok === true) {
          const resolvedCard = el('a9-approval-card');
          if (resolvedCard && resolvedCard.dataset.approvalId === approvalId) {
            resolvedCard.hidden = true;
            delete resolvedCard.dataset.approvalId;
            delete resolvedCard.dataset.bindingDigest;
            clearApprovalError();
          }
        }
        await refreshSnapshot();
        const currentCard = el('a9-approval-card');
        if (response && response.ok !== true && currentCard && !currentCard.hidden &&
            currentCard.dataset.approvalId === approvalId) {
          const errorNode = el('a9-approval-error');
          if (errorNode) errorNode.hidden = false;
          text('a9-approval-error', (response.error && response.error.message) || '审批回复失败');
        }
        return response;
      } finally {
        if (approvalDecisionInFlight === operation) approvalDecisionInFlight = null;
        setApprovalDecisionBusy(false);
      }
    })();
    return operation.promise;
  }

  async function showDiff(turnId) {
    const response = await a9.getDiff(turnId);
    const node = el('a9-diff');
    if (node) {
      node.textContent = response && response.ok === true
        ? (response.diff || []).map((d) => `--- ${d.path} (${d.action})\n${d.diffText}`).join('\n')
        : 'Diff 不可用';
    }
    return response;
  }

  async function undoTurn(turnId) {
    const response = await a9.undoTurn(turnId);
    text('a9-undo-state', response && response.ok === true
      ? `restored=${(response.outcome.restored || []).length} errors=${(response.outcome.errors || []).length}`
      : '撤销失败');
    await refreshSnapshot();
    return response;
  }

  async function refreshGit() {
    const response = await a9.gitStatus();
    if (response && response.ok === true) renderGitStatus(response.projection);
    return response;
  }

  function bind() {
    const surface = el('a9-surface');
    if (!surface) return;
    const on = (id, handler) => {
      const node = el(id);
      if (node) node.addEventListener('click', handler);
    };
    on('a9-mode-apply', () => {
      const checked = document.querySelector('input[name="a9-mode-choice"]:checked');
      if (checked) void chooseMode(checked.value);
    });
    on('a9-mode-open', () => { openModeDialog(); });
    on('a9-mode-cancel', () => {
      const modeDialog = el('a9-mode-dialog');
      if (modeDialog && modeDialog.dataset.modeConfigured === 'true') closeModeDialog();
    });
    const modeDialog = el('a9-mode-dialog');
    if (modeDialog) {
      modeDialog.addEventListener('cancel', (event) => {
        if (modeDialog.dataset.modeConfigured !== 'true') event.preventDefault();
      });
      modeDialog.addEventListener('close', () => {
        if (modeDialog.dataset.modeConfigured === 'true') modeDialog.hidden = true;
      });
    }
    on('a9-provider-apply', () => { void applyProviderForm(); });
    on('a9-provider-probe', () => { void runProbe(); });
    on('a9-submit', () => { void submitPrompt(); });
    on('a9-stop', () => { void stopTurn(); });
    on('a9-approval-approve', () => { void decideApproval('approved'); });
    on('a9-approval-deny', () => { void decideApproval('denied'); });
    on('a9-git-refresh', () => { void refreshGit(); });
    const prompt = el('a9-prompt');
    if (prompt) {
      prompt.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          void submitPrompt();
        }
      });
    }
    void refreshSnapshot();
    void refreshGit();
  }

  root.win7AgentA9Panel = Object.freeze({
    bind,
    refreshSnapshot,
    chooseMode,
    openModeDialog,
    applyProviderForm,
    runProbe,
    submitPrompt,
    stopTurn,
    decideApproval,
    showDiff,
    undoTurn,
    refreshGit,
  });

  function activate() {
    // CSP 只允许外部脚本；表面显示逻辑在本文件内完成（preload 暴露 a9 时）。
    const surface = document.getElementById('a9-surface');
    if (surface && a9) surface.hidden = false;
    if (a9) bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activate);
  } else {
    activate();
  }
}(window));
