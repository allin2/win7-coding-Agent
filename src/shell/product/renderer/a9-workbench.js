'use strict';

/**
 * A9 Alpha 1 unified workbench.
 *
 * Renderer capabilities stay limited to the frozen preload API. This file does
 * not access Node, the filesystem, child processes, credentials, or networking.
 */
(function startA9Workbench(root) {
  const api = root.win7Agent;
  const a9 = api && api.a9;
  const SUPPORTED_MODES = new Set(['full_access', 'read_only']);
  const MODE_LABELS = Object.freeze({
    full_access: 'Full Access',
    read_only: 'Read Only',
    review: 'Review · Alpha 2',
    needs_selection: '待选择',
  });
  const TAB_IDS = ['files', 'changes', 'activity', 'environment'];
  const state = {
    snapshot: null,
    explorerSessionId: null,
    explorerPath: '',
    viewer: null,
    running: false,
    approvalDecision: null,
    lastFocused: null,
    insecureConfirmed: false,
    providerHydratedSignature: null,
    conversationSignature: null,
    activeConversationId: null,
    draftHydratedConversationId: null,
    draftTimer: null,
    draftSaving: false,
  };

  function el(id) { return document.getElementById(id); }
  function text(id, value) { const node = el(id); if (node) node.textContent = String(value == null ? '' : value); }
  function modeLabel(mode) { return MODE_LABELS[mode] || String(mode || '-'); }
  function pathName(value) {
    const parts = String(value || '').split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] || '已连接工作区';
  }
  function errorMessage(response, fallback) {
    const error = response && response.error ? response.error : response;
    return error && (error.message || error.detail || error.reason)
      ? String(error.message || error.detail || error.reason)
      : fallback;
  }
  function setFieldError(id, message) {
    const node = el(id);
    if (!node) return;
    node.textContent = message || '';
    node.hidden = !message;
  }
  function showGlobalError(message, recoveryLabel, recovery) {
    const banner = el('error-banner');
    if (!banner) return;
    banner.textContent = '';
    const copy = document.createElement('span');
    copy.textContent = message;
    banner.appendChild(copy);
    if (recoveryLabel && typeof recovery === 'function') {
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = recoveryLabel;
      action.addEventListener('click', recovery, { once: true });
      banner.appendChild(action);
    }
    banner.hidden = false;
  }
  function clearGlobalError() {
    const banner = el('error-banner');
    if (!banner) return;
    banner.textContent = '';
    banner.hidden = true;
  }

  function setTaskState(label, kind, detail) {
    text('task-state', label);
    el('task-state').className = `task-pill ${kind || 'idle'}`;
    text('rail-task-value', label);
    text('rail-task-detail', detail || '任务事实会记录在中央时间线。');
  }

  function canSubmit() {
    const snapshot = state.snapshot;
    return Boolean(
      snapshot && snapshot.status === 'ready' &&
      SUPPORTED_MODES.has(snapshot.mode) &&
      snapshot.provider && snapshot.provider.configured &&
      snapshot.provider.probe && snapshot.provider.probe.classification === 'tool_calling' &&
      !state.running && snapshot.agentStatus !== 'needs_approval' &&
      el('task-prompt').value.trim(),
    );
  }

  function activeManagedProcesses(snapshot) {
    return ((snapshot && snapshot.managedProcesses) || []).filter((item) => item.lastProbeStatus === 'running' || item.lastProbeStatus === 'starting');
  }

  function syncComposer() {
    const snapshot = state.snapshot;
    const blockedMode = !snapshot || snapshot.status !== 'ready' || !SUPPORTED_MODES.has(snapshot.mode);
    const blockedApproval = Boolean(snapshot && (snapshot.pendingApproval || snapshot.agentStatus === 'needs_approval'));
    const prompt = el('task-prompt');
    const send = el('run-task');
    const stop = el('cancel-task');
    const railStop = el('rail-stop');
    const hasManaged = activeManagedProcesses(snapshot).length > 0;
    const canStop = state.running || hasManaged || Boolean(snapshot && snapshot.controls && snapshot.controls.canStop);
    const stopKind = state.running
      ? 'turn'
      : snapshot && snapshot.controls ? snapshot.controls.stopKind : hasManaged ? 'managed_process' : 'none';
    prompt.disabled = blockedMode || blockedApproval || state.running;
    send.hidden = state.running;
    stop.hidden = !canStop;
    railStop.hidden = !canStop;
    send.disabled = !canSubmit();
    stop.disabled = !canStop;
    railStop.disabled = !canStop;
    const stopLabel = stopKind === 'turn' ? '停止任务' : stopKind === 'managed_process' ? '停止后台进程' : '停止';
    text('cancel-task-label', stopLabel);
    text('rail-stop-label', stopLabel);
    if (blockedMode) text('session-status', '先为当前工作区明确选择 Full Access 或 Read Only。');
    else if (blockedApproval) text('session-status', '先处理当前绑定审批；同一工作区一次只执行一个 A9 任务。');
    else if (!snapshot.provider || !snapshot.provider.configured) text('session-status', 'Provider 尚未配置。打开设置并完成原生 tool_calls 探测。');
    else if (!snapshot.provider.probe || snapshot.provider.probe.classification !== 'tool_calling') text('session-status', 'Provider 尚未通过原生 tool_calls 探测；任务发送保持禁用。');
    else if (state.running) text('session-status', '任务正在执行；可随时停止。工具调用与退出码会写入活动记录。');
    else if (hasManaged) {
      const recovered = activeManagedProcesses(snapshot).filter((item) => item.pidReusePossible === true);
      text('session-status', recovered.length > 0
        ? `检测到 ${recovered.length} 个重启恢复的 PID 事实；身份无法证明，应用不会发送终止信号。请在系统中核对并停止后再次点击“停止后台进程”。`
        : '托管后台进程仍在运行；可继续工作，或点击“停止后台进程”回收进程树。');
    }
    else text('session-status', '当前工作区已就绪。高影响操作会在执行前显示精确目标并请求批准。');
  }

  function resizeComposer() {
    const prompt = el('task-prompt');
    prompt.style.height = 'auto';
    prompt.style.height = `${Math.min(prompt.scrollHeight, 170)}px`;
    syncComposer();
  }

  function appendTaskCard(kind, title, meta, body, actions) {
    const stream = el('a9-task-stream');
    const card = document.createElement('article');
    card.className = `task-card ${kind || ''}`;
    const header = document.createElement('div');
    header.className = 'task-card-header';
    const heading = document.createElement('strong');
    const detail = document.createElement('span');
    heading.textContent = title;
    detail.textContent = meta || '';
    detail.title = meta || '';
    header.appendChild(heading);
    header.appendChild(detail);
    const content = document.createElement('div');
    content.className = 'task-card-body';
    content.textContent = body || '';
    card.appendChild(header);
    card.appendChild(content);
    if (Array.isArray(actions) && actions.length > 0) {
      const actionRow = document.createElement('div');
      actionRow.className = 'task-card-actions';
      actions.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        button.addEventListener('click', item.action);
        actionRow.appendChild(button);
      });
      card.appendChild(actionRow);
    }
    stream.appendChild(card);
    el('a9-empty-state').hidden = true;
    el('conversation').scrollTop = el('conversation').scrollHeight;
    return card;
  }

  function openDialog(dialog) {
    if (!dialog) return;
    dialog.hidden = false;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
  }
  function closeDialog(dialog) {
    if (!dialog) return;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    dialog.hidden = true;
  }

  function configureModeDialog(snapshot, forceOpen) {
    const dialog = el('a9-mode-dialog');
    if (!dialog || !snapshot || snapshot.status !== 'ready') return;
    const supported = SUPPORTED_MODES.has(snapshot.mode);
    const needsSelection = snapshot.mode === 'needs_selection' || !supported;
    const selectedMode = supported ? snapshot.mode : (snapshot.modeRecommended || 'full_access');
    dialog.querySelectorAll('input[name="a9-mode-choice"]').forEach((radio) => {
      radio.checked = radio.value === selectedMode;
    });
    text('a9-mode-workspace', snapshot.workspaceRoot || '尚未绑定工作区');
    text('a9-mode-title', needsSelection ? '选择此工作区的权限' : '更改此工作区的权限');
    text('a9-mode-badge', needsSelection ? '必须选择' : '可随时更改');
    text('a9-mode-intro', snapshot.mode === 'review'
      ? '此工作区保存的是 Review。完整 Review 已延期到 Alpha 2；请选择 Alpha 1 支持的模式后才能继续。'
      : needsSelection
        ? '每个工作区单独保存权限。Full Access 使用当前 Windows 用户权限，不提供额外沙箱。'
        : '模式将保存到此工作区；正在执行的任务不会被静默改变。');
    text('a9-mode-apply', needsSelection ? '使用所选模式' : '保存权限模式');
    el('a9-mode-cancel').hidden = needsSelection;
    dialog.dataset.required = needsSelection ? 'true' : 'false';
    if (forceOpen || needsSelection) {
      openDialog(dialog);
      const selected = dialog.querySelector('input[name="a9-mode-choice"]:checked');
      if (selected && typeof selected.focus === 'function') selected.focus();
    }
  }

  async function chooseMode() {
    const checked = document.querySelector('input[name="a9-mode-choice"]:checked');
    if (!checked || !SUPPORTED_MODES.has(checked.value)) return;
    const button = el('a9-mode-apply');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    setFieldError('a9-mode-error', '');
    try {
      const response = await a9.setMode(checked.value);
      if (!response || response.ok !== true) {
        setFieldError('a9-mode-error', errorMessage(response, '权限模式保存失败。'));
        return;
      }
      closeDialog(el('a9-mode-dialog'));
      await refreshSnapshot();
    } catch (error) {
      setFieldError('a9-mode-error', errorMessage(error, '权限模式保存失败。'));
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  function renderApproval(snapshot) {
    const card = el('a9-approval-card');
    const pending = snapshot.pendingApproval;
    card.hidden = !pending;
    if (!pending) {
      delete card.dataset.approvalId;
      delete card.dataset.bindingDigest;
      delete card.dataset.conversationId;
      delete card.dataset.taskId;
      delete card.dataset.turnId;
      setFieldError('a9-approval-error', '');
      setApprovalBusy(false);
      return;
    }
    if (card.dataset.approvalId !== pending.approvalId) setFieldError('a9-approval-error', '');
    card.dataset.approvalId = pending.approvalId;
    card.dataset.bindingDigest = pending.bindingDigest;
    card.dataset.conversationId = pending.conversationId;
    card.dataset.taskId = pending.taskId;
    card.dataset.turnId = pending.turnId;
    text('a9-approval-tool', pending.toolName || 'operation');
    text('a9-approval-summary', pending.summary || '高影响操作需要确认。');
    text('a9-approval-id', `approval: ${pending.approvalId}`);
    const git = pending.gitBinding;
    text('a9-approval-git', git
      ? `remote=${git.remote || '-'} · branch=${git.branch || '-'} · force=${git.force} · delete=${git.deleteTarget || '-'}`
      : `target digest: ${String(pending.bindingDigest || '').slice(0, 18)}…`);
  }

  function renderTimeline(snapshot) {
    const timeline = el('a9-timeline');
    timeline.textContent = '';
    const filePaths = new Set();
    let rawOutput = '';
    (snapshot.timeline || []).slice(-60).forEach((event) => {
      const data = event.data || {};
      const item = document.createElement('li');
      const bits = [event.type || 'event'];
      if (data.toolName) bits.push(data.toolName);
      if (data.exitCode !== undefined) bits.push(`exit=${data.exitCode}`);
      if (data.summary) bits.push(String(data.summary).slice(0, 100));
      item.textContent = bits.join(' · ');
      timeline.appendChild(item);
      [data.path, data.relativePath, data.targetPath].filter(Boolean).forEach((value) => filePaths.add(String(value)));
      [data.stdout, data.stderr, data.output].filter((value) => typeof value === 'string').forEach((value) => { rawOutput += value; });
    });
    text('file-count', filePaths.size);
    const fileList = el('file-activity');
    fileList.textContent = '';
    filePaths.forEach((filePath) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = filePath;
      button.addEventListener('click', () => { void openWorkspaceFile(filePath); });
      item.appendChild(button);
      fileList.appendChild(item);
    });
    el('file-empty').hidden = filePaths.size > 0;
    if (rawOutput) text('a9-shell-output', rawOutput.slice(-64 * 1024));
  }

  function renderCheckpoints(snapshot) {
    const checkpoints = snapshot.checkpoints || [];
    text('a9-checkpoint-count', checkpoints.length);
    text('a9-interruptions', (snapshot.interruptions || []).map((item) => `${item.kind}:${item.id}`).join(', ') || '无');
    const list = el('a9-checkpoint-list');
    list.textContent = '';
    checkpoints.slice(-10).reverse().forEach((checkpoint) => {
      const item = document.createElement('li');
      item.className = 'checkpoint-row';
      const identity = document.createElement('code');
      identity.className = 'checkpoint-id';
      identity.textContent = String(checkpoint.turnId);
      identity.title = String(checkpoint.turnId);
      const actions = document.createElement('div');
      actions.className = 'checkpoint-actions';
      const diff = document.createElement('button');
      diff.type = 'button';
      diff.textContent = '查看 Diff';
      diff.setAttribute('aria-label', `查看 ${checkpoint.turnId} Diff`);
      diff.addEventListener('click', () => { void showDiff(checkpoint.turnId); });
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.textContent = '撤销';
      undo.setAttribute('aria-label', `撤销 ${checkpoint.turnId}`);
      undo.addEventListener('click', () => { void undoTurn(checkpoint.turnId); });
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = '复制 ID';
      copy.setAttribute('aria-label', `复制完整 Turn ID ${checkpoint.turnId}`);
      copy.addEventListener('click', () => {
        const copied = copyText(String(checkpoint.turnId));
        copy.textContent = copied ? '已复制' : '复制失败';
      });
      actions.appendChild(diff);
      actions.appendChild(undo);
      actions.appendChild(copy);
      item.appendChild(identity);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function renderConversation(snapshot) {
    const facts = snapshot.conversation || [];
    const signature = JSON.stringify([snapshot.activeConversationId, facts.map((fact) => [
      fact.taskId, fact.turnId, fact.outcome, fact.updatedAt,
      String(fact.requestPrompt || '').length, String(fact.finalMessage || '').length,
    ])]);
    if (state.conversationSignature === signature) return;
    state.conversationSignature = signature;
    const stream = el('a9-task-stream');
    stream.textContent = '';
    el('a9-empty-state').hidden = facts.length > 0;
    facts.forEach((fact) => {
      const timestamp = fact.createdAt ? new Date(fact.createdAt).toLocaleString() : '';
      if (fact.requestPrompt) appendTaskCard('request', 'Request', timestamp, fact.requestPrompt);
      const kind = fact.outcome === 'completed'
        ? 'completed'
        : fact.outcome === 'running' || fact.outcome === 'needs_approval'
          ? 'running'
          : fact.outcome === 'interrupted' || fact.outcome === 'cancelled'
            ? 'interrupted'
            : 'failed';
      const title = fact.requestPrompt ? fact.outcome : '历史任务';
      const identity = fact.turnId || fact.taskId || timestamp;
      const body = fact.finalMessage || (fact.outcome === 'interrupted'
        ? '应用重启后恢复了中断事实；未重放模型、工具或旧审批。'
        : '已恢复本地任务事实；此历史记录没有可显示的结果文本。');
      appendTaskCard(kind, title, identity, body);
    });
  }

  function conversationStatusLabel(activity) {
    if (activity === 'running') return '运行中';
    if (activity === 'waiting_approval') return '待审批';
    if (activity === 'interrupted') return '已中断';
    return '空闲';
  }

  function appendConversationRow(list, conversation, snapshot, archived) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = archived || !(snapshot.conversationControls && snapshot.conversationControls.canSwitch)
      || conversation.sessionId === snapshot.activeConversationId;
    button.setAttribute('aria-current', String(conversation.sessionId === snapshot.activeConversationId));
    button.title = conversation.title;
    const title = document.createElement('strong');
    const meta = document.createElement('small');
    title.textContent = conversation.title || '新对话';
    const updated = conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleString() : '';
    meta.textContent = `${conversationStatusLabel(conversation.activity)}${updated ? ` · ${updated}` : ''}`;
    button.appendChild(title);
    button.appendChild(meta);
    if (!archived) button.addEventListener('click', () => { void switchConversation(conversation.sessionId); });
    item.appendChild(button);
    if (archived) {
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'conversation-restore';
      restore.textContent = '恢复';
      restore.disabled = !(snapshot.conversationControls && snapshot.conversationControls.canSwitch);
      restore.addEventListener('click', () => { void restoreConversation(conversation.sessionId); });
      item.appendChild(restore);
    }
    list.appendChild(item);
  }

  function renderConversationDirectory(snapshot) {
    const conversations = snapshot.conversations || [];
    const active = conversations.filter((item) => item.state === 'active');
    const archived = conversations.filter((item) => item.state === 'archived');
    const controls = snapshot.conversationControls || { canSwitch: false, maxActive: 16 };
    const activeList = el('conversation-list');
    const archivedList = el('conversation-archive-list');
    activeList.textContent = '';
    archivedList.textContent = '';
    active.forEach((item) => appendConversationRow(activeList, item, snapshot, false));
    archived.forEach((item) => appendConversationRow(archivedList, item, snapshot, true));
    text('conversation-archive-count', archived.length);
    el('conversation-archive-section').hidden = archived.length === 0;
    el('conversation-new').disabled = !controls.canSwitch || active.length >= controls.maxActive;
    el('conversation-rename').disabled = !snapshot.activeConversationId;
    el('conversation-archive').disabled = !controls.canSwitch || !snapshot.activeConversationId;
    text('conversation-directory-note', controls.canSwitch
      ? `${active.length}/${controls.maxActive} 个未归档对话`
      : `已锁定：${controls.reason || '当前任务尚未结束'}`);
    const current = conversations.find((item) => item.sessionId === snapshot.activeConversationId);
    if (current) text('workbench-title', current.title || '和工作区一起完成任务');
  }

  function hydrateDraft(snapshot) {
    if (!snapshot.activeConversationId || state.draftHydratedConversationId === snapshot.activeConversationId) return;
    state.draftHydratedConversationId = snapshot.activeConversationId;
    const draft = snapshot.draft || { text: '', persistence: 'memory' };
    el('task-prompt').value = draft.text || '';
    text('draft-status', draft.note || (draft.persistence === 'dpapi' ? '草稿已由 Windows DPAPI 为当前用户保护。' : '草稿仅在当前进程保留。'));
    resizeComposer();
  }

  function renderSnapshot(snapshot) {
    state.snapshot = snapshot;
    state.activeConversationId = snapshot.activeConversationId || null;
    const surface = el('a9-surface');
    surface.hidden = false;
    surface.dataset.a9Status = snapshot.status || 'unknown';
    const ready = snapshot.status === 'ready';
    const workspace = snapshot.workspaceRoot || '';
    text('workspace-name', workspace ? pathName(workspace) : '选择本地工作区');
    text('workspace-path', workspace || '尚未选择');
    text('workspace-label', workspace ? pathName(workspace) : '未连接工作区');
    text('a9-workspace-value', workspace || '-');
    text('a9-mode-value', modeLabel(snapshot.mode));
    text('a9-shell-value', snapshot.shell ? `${snapshot.shell.kind}${snapshot.shell.version ? ` ${snapshot.shell.version}` : ''}` : '-');
    const provider = snapshot.provider || {};
    text('a9-provider-value', provider.configured ? `${provider.model} @ ${provider.baseUrl}` : '未配置');
    text('a9-provider-chip', provider.configured ? (provider.probe && provider.probe.classification ? provider.probe.classification : provider.model) : 'Provider 未配置');
    text('a9-provider-key-state', provider.configured ? `key: ${provider.apiKey && provider.apiKey.remembered ? '已由 DPAPI 记住' : '仅当前进程'} (${provider.apiKey && provider.apiKey.source || 'none'})` : 'key: 未配置');
    text('a9-provider-probe-state', provider.probe ? provider.probe.classification : '未探测');
    setFieldError('a9-provider-diagnostics', provider.diagnostics
      ? `${provider.diagnostics.code || 'A9_PROVIDER_DIAGNOSTICS'}: ${provider.diagnostics.detail || 'Provider 需要检查。'}`
      : '');
    const providerHydratedSignature = JSON.stringify({
      configured: provider.configured === true,
      baseUrl: provider.baseUrl || '',
      model: provider.model || '',
      insecureTLS: provider.insecureTLS === true,
      remembered: Boolean(provider.apiKey && provider.apiKey.remembered),
    });
    if (state.providerHydratedSignature !== providerHydratedSignature) {
      el('a9-provider-url').value = provider.baseUrl || '';
      el('a9-provider-model').value = provider.model || '';
      el('a9-provider-insecure').checked = provider.insecureTLS === true;
      el('a9-provider-remember').checked = Boolean(provider.apiKey && provider.apiKey.remembered);
      state.providerHydratedSignature = providerHydratedSignature;
    }
    text('a9-lock-value', snapshot.lock ? (snapshot.lock.held ? '本窗口持有写锁' : `由 ${snapshot.lock.holder || '其他窗口'} 持有`) : '-');
    text('a9-agent-value', snapshot.agentStatus || 'idle');
    const runtimeStatus = el('runtime-status');
    runtimeStatus.className = `connection ${ready ? 'ready' : 'failed'}`;
    runtimeStatus.innerHTML = '<i aria-hidden="true"></i>';
    runtimeStatus.appendChild(document.createTextNode(ready ? 'Runtime 就绪' : 'Runtime 受限'));
    const modeButton = el('a9-mode-open');
    modeButton.hidden = !ready || !workspace;
    modeButton.disabled = !ready || !workspace;
    modeButton.textContent = `权限：${modeLabel(snapshot.mode)}`;
    renderApproval(snapshot);
    renderTimeline(snapshot);
    renderCheckpoints(snapshot);
    renderConversationDirectory(snapshot);
    renderConversation(snapshot);
    hydrateDraft(snapshot);
    const context = snapshot.contextWindow || {};
    const contextNote = el('context-window-note');
    contextNote.hidden = !context.note;
    contextNote.textContent = context.note || '';
    configureModeDialog(snapshot, false);
    const active = ['running', 'cancelling'].includes(snapshot.agentStatus);
    const managedActive = activeManagedProcesses(snapshot).length;
    state.running = active;
    if (snapshot.pendingApproval || snapshot.agentStatus === 'needs_approval') setTaskState('等待批准', 'running', '操作已暂停，等待你的决定。');
    else if (active) setTaskState(snapshot.agentStatus === 'cancelling' ? '正在停止' : '运行中', 'running');
    else if (snapshot.agentStatus === 'failed') setTaskState('失败', 'failed');
    else if (managedActive > 0) setTaskState(`后台运行 ${managedActive}`, 'running', '托管后台进程可通过下方停止按钮回收。');
    else setTaskState('空闲', 'idle');
    syncComposer();
  }

  async function refreshSnapshot() {
    if (!a9) return null;
    try {
      const response = await a9.snapshot();
      if (!response || response.ok !== true) {
        const code = response && response.error && response.error.code;
        if (code === 'A9_WORKSPACE_REQUIRED') {
          state.snapshot = null;
          const surface = el('a9-surface');
          surface.hidden = false;
          surface.dataset.a9Status = 'workspace_required';
          text('runtime-status', '等待工作区');
          syncComposer();
          return null;
        }
        showGlobalError(errorMessage(response, 'A9 Runtime 初始化失败。'), '重试初始化', () => { void refreshSnapshot(); });
        return null;
      }
      clearGlobalError();
      renderSnapshot(response.snapshot);
      await ensureExplorerSession(response.snapshot.workspaceRoot);
      return response.snapshot;
    } catch (error) {
      showGlobalError(errorMessage(error, '无法读取 A9 Runtime 状态。'), '重试初始化', () => { void refreshSnapshot(); });
      return null;
    }
  }

  async function saveDraftNow() {
    if (!a9 || !state.activeConversationId) return null;
    if (state.draftTimer) {
      root.clearTimeout(state.draftTimer);
      state.draftTimer = null;
    }
    state.draftSaving = true;
    try {
      const response = await a9.saveDraft(el('task-prompt').value);
      if (response && response.note) text('draft-status', response.note);
      else if (response && response.persistence === 'dpapi') text('draft-status', '草稿已由 Windows DPAPI 为当前用户保护。');
      return response;
    } finally {
      state.draftSaving = false;
    }
  }

  function scheduleDraftSave() {
    if (state.draftTimer) root.clearTimeout(state.draftTimer);
    text('draft-status', '正在保存当前对话草稿…');
    state.draftTimer = root.setTimeout(() => { void saveDraftNow(); }, 450);
  }

  async function runConversationOperation(operation) {
    clearGlobalError();
    try {
      await saveDraftNow();
      const response = await operation();
      if (!response || response.ok !== true) {
        showGlobalError(errorMessage(response, '对话操作失败。'), '刷新状态', () => { void refreshSnapshot(); });
        return response;
      }
      state.conversationSignature = null;
      state.draftHydratedConversationId = null;
      await refreshSnapshot();
      closeNavigation();
      return response;
    } catch (error) {
      showGlobalError(errorMessage(error, '对话操作失败。'), '刷新状态', () => { void refreshSnapshot(); });
      return null;
    }
  }

  function createConversation() {
    return runConversationOperation(() => a9.createConversation());
  }

  function switchConversation(conversationId) {
    if (conversationId === state.activeConversationId) return Promise.resolve(null);
    return runConversationOperation(() => a9.activateConversation(conversationId));
  }

  function restoreConversation(conversationId) {
    return runConversationOperation(() => a9.restoreConversation(conversationId));
  }

  function archiveCurrentConversation() {
    if (!state.activeConversationId) return Promise.resolve(null);
    return runConversationOperation(() => a9.archiveConversation(state.activeConversationId));
  }

  function openRenameConversation() {
    const current = ((state.snapshot && state.snapshot.conversations) || [])
      .find((item) => item.sessionId === state.activeConversationId);
    if (!current) return;
    el('conversation-rename-input').value = current.title || '';
    setFieldError('conversation-rename-error', '');
    openDialog(el('conversation-rename-dialog'));
    el('conversation-rename-input').focus();
    el('conversation-rename-input').select();
  }

  async function applyConversationRename() {
    const title = el('conversation-rename-input').value.trim();
    if (!title) {
      setFieldError('conversation-rename-error', '对话名称不能为空。');
      return;
    }
    const response = await a9.renameConversation(state.activeConversationId, title);
    if (!response || response.ok !== true) {
      setFieldError('conversation-rename-error', errorMessage(response, '重命名失败。'));
      return;
    }
    closeDialog(el('conversation-rename-dialog'));
    await refreshSnapshot();
  }

  async function ensureExplorerSession(workspaceRoot) {
    if (!workspaceRoot || state.explorerSessionId) return;
    const result = await api.listSessions();
    const sessions = result && result.sessions ? result.sessions : [];
    const active = sessions.find((session) => session.status === 'ACTIVE' && session.workspacePath === workspaceRoot);
    if (active) {
      state.explorerSessionId = active.sessionId;
      await refreshWorkspace('');
    }
  }

  async function chooseWorkspace() {
    clearGlobalError();
    try {
      await saveDraftNow();
      const result = await api.selectWorkspace();
      if (!result || !result.selected) return;
      let sessionsResult = await api.listSessions();
      let sessions = sessionsResult && sessionsResult.sessions ? sessionsResult.sessions : [];
      let session = sessions.find((item) => item.status === 'ACTIVE' && item.workspacePath === result.selected.workspacePath);
      if (!session) {
        const created = await api.createSession(result.selected.workspacePath, result.selected.displayName);
        session = created && created.session;
      }
      state.explorerSessionId = session ? session.sessionId : null;
      await refreshSnapshot();
      await refreshWorkspace('');
      closeNavigation();
    } catch (error) {
      showGlobalError(errorMessage(error, '工作区选择失败。'), '重新选择', () => { void chooseWorkspace(); });
    }
  }

  async function refreshWorkspace(pathValue) {
    if (!state.explorerSessionId) return;
    const response = await api.listWorkspace(state.explorerSessionId, pathValue || '');
    if (!response || response.ok === false || !response.result) return;
    const listing = response.result;
    state.explorerPath = listing.path || '';
    text('explorer-path', state.explorerPath || '/');
    el('workspace-up').disabled = !state.explorerPath;
    const tree = el('workspace-tree');
    tree.textContent = '';
    (listing.entries || []).forEach((entry) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${entry.type === 'directory' ? '▸' : '·'} ${entry.name}`;
      button.title = entry.path;
      button.addEventListener('click', () => {
        if (entry.type === 'directory') void refreshWorkspace(entry.path);
        else if (entry.type === 'file') void openWorkspaceFile(entry.path);
      });
      item.appendChild(button);
      tree.appendChild(item);
    });
    el('workspace-tree-empty').hidden = tree.children.length > 0;
  }

  async function openWorkspaceFile(filePath, startLine) {
    if (!state.explorerSessionId) return;
    const response = await api.readWorkspaceFile(state.explorerSessionId, filePath, startLine || 1, 500, 'utf-8');
    if (!response || response.ok === false || !response.result) return;
    state.viewer = response.result;
    text('viewer-file', response.result.path);
    text('viewer-range', `${response.result.startLine || 1}–${response.result.endLine || response.result.lines.length}`);
    el('viewer-panel').hidden = false;
    renderViewer();
    openInspector('files');
  }

  function renderViewer() {
    const target = el('code-viewer');
    target.textContent = '';
    if (!state.viewer) return;
    const query = el('viewer-search').value.toLocaleLowerCase();
    (state.viewer.lines || []).forEach((line) => {
      if (query && !String(line.text).toLocaleLowerCase().includes(query)) return;
      const row = document.createElement('div');
      row.className = 'code-line';
      row.dataset.line = String(line.line);
      const number = document.createElement('span');
      number.className = 'line-no';
      number.textContent = line.line;
      const code = document.createElement('span');
      code.className = 'line-code';
      code.textContent = line.text || ' ';
      row.appendChild(number);
      row.appendChild(code);
      target.appendChild(row);
    });
  }

  async function submitPrompt() {
    const prompt = el('task-prompt').value.trim();
    if (!prompt || !canSubmit()) return null;
    clearGlobalError();
    setFieldError('a9-turn-error', '');
    appendTaskCard('request', 'Request', new Date().toLocaleTimeString(), prompt);
    el('task-prompt').value = '';
    resizeComposer();
    state.running = true;
    setTaskState('运行中', 'running', 'Agent 正在读取事实并执行工具。');
    syncComposer();
    let response;
    try {
      response = await a9.submitTurn(prompt);
      if (response && response.ok === true) {
        const result = response.result || {};
        const kind = result.outcome === 'completed' ? 'completed' : result.outcome === 'needs_approval' ? 'running' : result.outcome === 'cancelled' ? 'interrupted' : 'failed';
        appendTaskCard(kind, result.outcome || 'Result', result.verification || 'not_applicable', result.finalMessage || '任务已返回结果。');
        text('a9-turn-outcome', `${result.outcome || '-'} · ${result.verification || 'not_applicable'}`);
      } else {
        const message = errorMessage(response, '任务执行失败。');
        appendTaskCard('failed', 'Task failed', response && response.error && response.error.code || 'ERROR', message, [{ label: '打开设置', action: () => openDrawer('settings-drawer') }]);
        setFieldError('a9-turn-error', message);
      }
    } catch (error) {
      const message = errorMessage(error, '任务执行失败。');
      appendTaskCard('failed', 'Task failed', 'UNEXPECTED', message, [{ label: '重试状态读取', action: () => { void refreshSnapshot(); } }]);
    } finally {
      state.running = false;
      await refreshSnapshot();
      syncComposer();
    }
    return response;
  }

  async function stopTurn() {
    const canStop = state.running || activeManagedProcesses(state.snapshot).length > 0 ||
      Boolean(state.snapshot && state.snapshot.controls && state.snapshot.controls.canStop);
    if (!canStop) return;
    el('cancel-task').disabled = true;
    setTaskState('正在停止', 'running', '正在清理当前任务和受管子进程。');
    try {
      const response = await a9.stop();
      if (!response || response.ok !== true) setFieldError('a9-turn-error', errorMessage(response, '停止请求失败。'));
    } finally {
      await refreshSnapshot();
    }
  }

  function setApprovalBusy(busy) {
    [['a9-approval-approve', '批准此操作'], ['a9-approval-deny', '拒绝']].forEach(([id, label]) => {
      const button = el(id);
      button.disabled = busy;
      button.textContent = busy ? '处理中…' : label;
      if (busy) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    });
  }

  async function decideApproval(decision) {
    if (state.approvalDecision) return state.approvalDecision;
    const card = el('a9-approval-card');
    if (card.hidden || !card.dataset.approvalId) return null;
    const approvalId = card.dataset.approvalId;
    const bindingDigest = card.dataset.bindingDigest;
    const conversationId = card.dataset.conversationId;
    const taskId = card.dataset.taskId;
    const turnId = card.dataset.turnId;
    setFieldError('a9-approval-error', '');
    setApprovalBusy(true);
    state.approvalDecision = (async () => {
      let response;
      try {
        response = await a9.resumeApproval(approvalId, decision, bindingDigest, conversationId, taskId, turnId);
        if (!response || response.ok !== true) {
          setFieldError('a9-approval-error', errorMessage(response, '审批回复失败，请刷新状态后重试。'));
          return response;
        }
        card.hidden = true;
        const result = response.result || {};
        appendTaskCard(result.outcome === 'completed' ? 'completed' : 'failed', decision === 'approved' ? 'Approval applied' : 'Approval denied', result.verification || 'not_applicable', result.finalMessage || (decision === 'approved' ? '已批准并继续执行。' : '已拒绝，未执行该操作。'));
        text('a9-turn-outcome', `${result.outcome || '-'} · ${result.verification || 'not_applicable'}`);
        await refreshSnapshot();
        return response;
      } catch (error) {
        setFieldError('a9-approval-error', errorMessage(error, '审批回复失败，请重试。'));
        return null;
      } finally {
        state.approvalDecision = null;
        setApprovalBusy(false);
      }
    })();
    return state.approvalDecision;
  }

  async function showDiff(turnId) {
    const response = await a9.getDiff(turnId);
    text('a9-diff', response && response.ok === true
      ? (response.diff || []).map((item) => `--- ${item.path} (${item.action})\n${item.diffText}`).join('\n') || '此 checkpoint 没有文件变更。'
      : errorMessage(response, 'Diff 不可用。'));
    openInspector('changes');
  }

  async function undoTurn(turnId) {
    const response = await a9.undoTurn(turnId);
    text('a9-undo-state', response && response.ok === true
      ? `restored=${(response.outcome.restored || []).length} · errors=${(response.outcome.errors || []).length}`
      : errorMessage(response, '撤销失败。'));
    await refreshSnapshot();
  }

  async function refreshGit() {
    const response = await a9.gitStatus();
    if (!response || response.ok !== true) {
      text('a9-git-status', errorMessage(response, 'Git 状态不可用。'));
      return;
    }
    const git = response.projection;
    text('a9-git-status', git.isGit === false
      ? (git.degradedReason || '非 Git 工作区')
      : `${git.branch || '-'} · ${git.clean ? 'clean' : `${(git.entries || []).length} 处变更`} · 外部机制：${(git.externalMechanisms || []).map((item) => item.kind).join(', ') || '无'}`);
  }

  function providerValues() {
    const values = {
      baseUrl: el('a9-provider-url').value.trim(),
      model: el('a9-provider-model').value.trim(),
      apiKey: el('a9-provider-key').value || undefined,
      rememberApiKey: el('a9-provider-remember').checked,
      caBundle: el('a9-provider-ca').value.trim() || undefined,
      allowInsecureTLS: el('a9-provider-insecure').checked,
    };
    const headerName = el('a9-provider-header-name').value.trim();
    const headerValue = el('a9-provider-header-value').value;
    if (headerName && headerValue) values.customHeaders = { [headerName]: headerValue };
    const proxyHost = el('a9-provider-proxy-host').value.trim();
    const proxyPort = Number(el('a9-provider-proxy-port').value || 0);
    if (proxyHost && proxyPort > 0) values.proxy = { host: proxyHost, port: proxyPort };
    return values;
  }

  async function applyProvider(confirmed) {
    const values = providerValues();
    setFieldError('a9-provider-error', '');
    if (!values.baseUrl || !values.model) {
      setFieldError('a9-provider-error', 'Base URL 与模型 ID 都必须填写。');
      return;
    }
    const headerName = el('a9-provider-header-name').value.trim();
    const headerValue = el('a9-provider-header-value').value;
    if ((headerName && !headerValue) || (!headerName && headerValue)) {
      setFieldError('a9-provider-error', '自定义 Header 名和值必须同时填写。');
      return;
    }
    if (values.allowInsecureTLS && !confirmed && !state.insecureConfirmed) {
      openDialog(el('a9-insecure-dialog'));
      return;
    }
    const button = el('a9-provider-apply');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const response = await a9.configureProvider(values);
      if (!response || response.ok !== true) {
        setFieldError('a9-provider-error', errorMessage(response, 'Provider 配置失败。'));
        return;
      }
      el('a9-provider-key').value = '';
      el('a9-provider-header-value').value = '';
      state.insecureConfirmed = false;
      await refreshSnapshot();
    } catch (error) {
      setFieldError('a9-provider-error', errorMessage(error, 'Provider 配置失败。'));
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  async function probeProvider() {
    const button = el('a9-provider-probe');
    button.disabled = true;
    try {
      const response = await a9.probeProvider();
      text('a9-provider-probe-state', response && response.ok === true
        ? (response.probe.hasToolCalling ? 'tool_calling' : 'chat_only')
        : 'unavailable');
      await refreshSnapshot();
    } finally {
      button.disabled = false;
    }
  }

  function selectTab(name, focus) {
    if (!TAB_IDS.includes(name)) return;
    TAB_IDS.forEach((tabName) => {
      const tab = el(`inspector-tab-${tabName}`);
      const panel = el(`inspector-panel-${tabName}`);
      const active = tabName === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
    });
    if (focus) el(`inspector-tab-${name}`).focus();
  }

  function inspectorIsDrawer() { return root.innerWidth < 1200; }
  function navigationIsDrawer() { return root.innerWidth < 800; }
  function openInspector(tabName) {
    if (tabName) selectTab(tabName, false);
    if (!inspectorIsDrawer()) return;
    state.lastFocused = document.activeElement;
    el('inspector').classList.add('open');
    el('inspector-backdrop').hidden = false;
    el('open-inspector').setAttribute('aria-expanded', 'true');
    el('close-inspector').focus();
  }
  function closeInspector() {
    el('inspector').classList.remove('open');
    el('inspector-backdrop').hidden = true;
    el('open-inspector').setAttribute('aria-expanded', 'false');
    if (state.lastFocused && typeof state.lastFocused.focus === 'function') state.lastFocused.focus();
    state.lastFocused = null;
  }
  function openNavigation() {
    if (!navigationIsDrawer()) return;
    state.lastFocused = document.activeElement;
    el('navigation-rail').classList.add('open');
    el('navigation-backdrop').hidden = false;
    el('open-navigation').setAttribute('aria-expanded', 'true');
    el('close-navigation').focus();
  }
  function closeNavigation() {
    el('navigation-rail').classList.remove('open');
    el('navigation-backdrop').hidden = true;
    el('open-navigation').setAttribute('aria-expanded', 'false');
  }

  function openDrawer(id) {
    const drawer = el(id);
    if (!drawer) return;
    state.lastFocused = document.activeElement;
    drawer.hidden = false;
    el('navigation-rail').classList.remove('open');
    el('navigation-backdrop').hidden = true;
    const workbench = document.querySelector('.workbench');
    if (workbench) workbench.inert = true;
    const focusTarget = drawer.querySelector('input:not(:disabled), button:not(:disabled)');
    if (focusTarget) focusTarget.focus();
  }
  function closeDrawer(id) {
    const drawer = el(id);
    if (!drawer) return;
    drawer.hidden = true;
    const workbench = document.querySelector('.workbench');
    if (workbench) workbench.inert = false;
    if (state.lastFocused && typeof state.lastFocused.focus === 'function') state.lastFocused.focus();
    state.lastFocused = null;
  }

  function trapFocus(container, event) {
    const focusable = Array.from(container.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'))
      .filter((node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function refreshDiagnostics() {
    const response = await api.getDiagnostics();
    const target = el('diagnostics');
    target.textContent = '';
    const rows = [
      ['Product', response.product], ['Version', response.version],
      ['Electron', response.runtime && response.runtime.electron], ['Node', response.runtime && response.runtime.node],
      ['Chrome', response.runtime && response.runtime.chrome], ['Architecture', response.runtime && response.runtime.arch],
      ['Platform', response.runtime && response.runtime.platform],
    ];
    rows.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value || '-';
      target.appendChild(dt);
      target.appendChild(dd);
    });
  }

  function copyOutput() {
    const output = el('a9-shell-output');
    const selection = root.getSelection();
    const range = document.createRange();
    range.selectNodeContents(output);
    selection.removeAllRanges();
    selection.addRange(range);
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_error) { copied = false; }
    selection.removeAllRanges();
    text('a9-output-note', copied ? '已复制当前可见输出。' : '复制不可用，请手工选择输出。');
  }

  function copyText(value) {
    const input = document.createElement('textarea');
    input.value = String(value);
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_error) { copied = false; }
    document.body.removeChild(input);
    return copied;
  }

  function bind() {
    el('workspace-select').addEventListener('click', () => { void chooseWorkspace(); });
    el('task-prompt').addEventListener('input', () => { resizeComposer(); scheduleDraftSave(); });
    el('task-prompt').addEventListener('blur', () => { void saveDraftNow(); });
    el('task-prompt').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitPrompt(); }
    });
    el('run-task').addEventListener('click', () => { void submitPrompt(); });
    el('cancel-task').addEventListener('click', () => { void stopTurn(); });
    el('rail-stop').addEventListener('click', () => { void stopTurn(); });
    el('conversation-new').addEventListener('click', () => { void createConversation(); });
    el('conversation-rename').addEventListener('click', openRenameConversation);
    el('conversation-archive').addEventListener('click', () => { void archiveCurrentConversation(); });
    el('conversation-rename-cancel').addEventListener('click', () => closeDialog(el('conversation-rename-dialog')));
    el('conversation-rename-apply').addEventListener('click', () => { void applyConversationRename(); });
    document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => {
      el('task-prompt').value = button.dataset.prompt;
      resizeComposer();
      scheduleDraftSave();
      el('task-prompt').focus();
    }));
    el('a9-mode-open').addEventListener('click', () => { if (state.snapshot) configureModeDialog(state.snapshot, true); });
    el('a9-mode-apply').addEventListener('click', () => { void chooseMode(); });
    el('a9-mode-cancel').addEventListener('click', () => closeDialog(el('a9-mode-dialog')));
    el('a9-mode-dialog').addEventListener('cancel', (event) => { if (el('a9-mode-dialog').dataset.required === 'true') event.preventDefault(); });
    el('a9-provider-open').addEventListener('click', () => openDrawer('settings-drawer'));
    el('open-settings').addEventListener('click', () => openDrawer('settings-drawer'));
    el('open-diagnostics').addEventListener('click', () => { openDrawer('diagnostics-drawer'); void refreshDiagnostics(); });
    document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeDrawer(button.dataset.close)));
    el('a9-provider-apply').addEventListener('click', () => { void applyProvider(false); });
    el('a9-provider-probe').addEventListener('click', () => { void probeProvider(); });
    el('a9-insecure-cancel').addEventListener('click', () => { state.insecureConfirmed = false; closeDialog(el('a9-insecure-dialog')); });
    el('a9-insecure-dialog').addEventListener('cancel', () => { state.insecureConfirmed = false; });
    el('a9-insecure-confirm').addEventListener('click', () => { state.insecureConfirmed = true; closeDialog(el('a9-insecure-dialog')); void applyProvider(true); });
    el('a9-approval-approve').addEventListener('click', () => { void decideApproval('approved'); });
    el('a9-approval-deny').addEventListener('click', () => { void decideApproval('denied'); });
    el('a9-git-refresh').addEventListener('click', () => { void refreshGit(); });
    el('a9-output-copy').addEventListener('click', copyOutput);
    el('workspace-up').addEventListener('click', () => { const parts = state.explorerPath.split(/[\\/]+/).filter(Boolean); parts.pop(); void refreshWorkspace(parts.join('/')); });
    el('viewer-search').addEventListener('input', renderViewer);
    el('viewer-jump-go').addEventListener('click', () => { const line = Number(el('viewer-jump').value || 1); void openWorkspaceFile(state.viewer && state.viewer.path, line); });
    TAB_IDS.forEach((name, index) => {
      const tab = el(`inspector-tab-${name}`);
      tab.addEventListener('click', () => selectTab(name, false));
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const offset = event.key === 'ArrowRight' ? 1 : -1;
        selectTab(TAB_IDS[(index + offset + TAB_IDS.length) % TAB_IDS.length], true);
      });
    });
    el('open-inspector').addEventListener('click', () => openInspector());
    el('close-inspector').addEventListener('click', closeInspector);
    el('inspector-backdrop').addEventListener('click', closeInspector);
    el('open-navigation').addEventListener('click', openNavigation);
    el('close-navigation').addEventListener('click', closeNavigation);
    el('navigation-backdrop').addEventListener('click', closeNavigation);
    el('refresh-diagnostics').addEventListener('click', () => { void refreshDiagnostics(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        const drawer = Array.from(document.querySelectorAll('.drawer:not([hidden])')).pop();
        if (drawer) { trapFocus(drawer, event); return; }
        if (inspectorIsDrawer() && el('inspector').classList.contains('open')) { trapFocus(el('inspector'), event); return; }
        if (navigationIsDrawer() && el('navigation-rail').classList.contains('open')) { trapFocus(el('navigation-rail'), event); return; }
      }
      if (event.key !== 'Escape') return;
      const drawer = Array.from(document.querySelectorAll('.drawer:not([hidden])')).pop();
      if (drawer) { event.preventDefault(); closeDrawer(drawer.id); return; }
      if (el('inspector').classList.contains('open')) { event.preventDefault(); closeInspector(); return; }
      if (el('navigation-rail').classList.contains('open')) { event.preventDefault(); closeNavigation(); }
    });
    root.addEventListener('resize', () => { if (!inspectorIsDrawer()) closeInspector(); if (!navigationIsDrawer()) closeNavigation(); });
  }

  async function initialize() {
    if (!api || !a9) {
      showGlobalError('可信 Preload API 不可用。', null, null);
      return;
    }
    bind();
    await refreshSnapshot();
    await refreshGit();
    await refreshDiagnostics();
    if (!state.snapshot) el('workspace-select').focus();
    api.signalReady();
  }

  root.win7AgentA9Workbench = Object.freeze({
    refreshSnapshot,
    submitPrompt,
    stopTurn,
    decideApproval,
    chooseMode,
    applyProvider,
    selectTab,
  });
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
}(window));
