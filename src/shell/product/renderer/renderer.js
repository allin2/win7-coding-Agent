'use strict';

const state = {
  workspacePath: null,
  session: null,
  taskId: null,
  eventQueue: null,
  eventCount: 0,
  filePaths: new Set(),
  pendingApproval: null,
  scenario: 'structure',
  runnerLog: null,
};

function byId(id) { return document.getElementById(id); }
function setText(id, value) { const element = byId(id); if (element) element.textContent = String(value); }

function showError(error) {
  const banner = byId('error-banner');
  const value = error && error.error ? error.error : error;
  const message = value && value.message ? value.message : String(value || '未知错误');
  const action = value && value.recommendedAction ? ` 建议：${value.recommendedAction}` : '';
  banner.textContent = message + action;
  banner.hidden = false;
  setText('task-state', '可恢复失败');
  byId('task-state').className = 'state failed';
}

function clearError() { const banner = byId('error-banner'); banner.hidden = true; banner.textContent = ''; }

async function call(action) {
  try {
    const result = await action();
    if (result && result.ok === false) { showError(result); return null; }
    return result;
  } catch (error) { showError(error); return null; }
}

function appendTimeline(kind, detail) {
  const list = byId('timeline');
  const item = document.createElement('li');
  const label = document.createElement('span');
  label.className = 'event-kind';
  label.textContent = kind;
  const text = document.createTextNode('  ' + limitText(detail, 2_000));
  item.appendChild(label);
  item.appendChild(text);
  list.appendChild(item);
  while (list.children.length > 120) list.removeChild(list.firstChild);
  list.scrollTop = list.scrollHeight;
}

function limitText(value, maximum) {
  const text = typeof value === 'string' ? value : safeJson(value);
  if (text.length <= maximum) return text;
  setText('result-limit', '时间线内容已截断');
  return text.slice(0, maximum) + '…';
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch (_error) { return String(value); }
}

function renderSessions(sessions) {
  const list = byId('session-list');
  list.textContent = '';
  sessions.forEach((session) => {
    const item = document.createElement('li');
    item.textContent = `${session.label} · ${session.workspacePath}`;
    if (state.session && session.sessionId === state.session.sessionId) item.className = 'active';
    item.addEventListener('click', () => {
      if (state.taskId) return;
      state.session = session;
      setText('session-status', `当前会话：${session.label}`);
      byId('run-task').disabled = false;
      byId('close-session').disabled = false;
      renderSessions(sessions);
    });
    list.appendChild(item);
  });
  byId('session-empty').hidden = sessions.length > 0;
}

function renderDiagnostics(diagnostics) {
  const target = byId('diagnostics');
  target.textContent = '';
  const entries = [
    ['Core', diagnostics.capabilities && diagnostics.capabilities.core],
    ['State', diagnostics.capabilities && diagnostics.capabilities.state],
    ['Workspace', diagnostics.capabilities && diagnostics.capabilities.workspace],
    ['Gateway', diagnostics.capabilities && diagnostics.capabilities.gateway],
    ['Runner', diagnostics.capabilities && diagnostics.capabilities.runner],
    ['Electron', diagnostics.runtime && diagnostics.runtime.electron],
  ];
  entries.forEach(([name, value]) => {
    const term = document.createElement('dt'); const detail = document.createElement('dd');
    term.textContent = name; detail.textContent = value || '不可用'; target.appendChild(term); target.appendChild(detail);
  });
}

async function refreshDiagnostics() {
  const result = await call(() => window.win7Agent.getDiagnostics());
  if (!result) return;
  renderDiagnostics(result);
  setText('runtime-status', '运行正常'); byId('runtime-status').className = 'status ready';
}

async function refreshGatewaySettings() {
  if (!window.win7Agent || typeof window.win7Agent.getSettings !== 'function') return;
  const result = await call(() => window.win7Agent.getSettings());
  const settings = result && result.settings;
  if (!settings) return;
  byId('gateway-mode').value = settings.mode || 'replay';
  byId('gateway-url').value = settings.gatewayUrl || '';
  byId('gateway-model').value = settings.model || 'deepseek-v4-flash';
  byId('gateway-ca').value = settings.caBundlePath || '';
  byId('gateway-api-key').value = '';
  renderCredentialPersistence(settings);
  renderGatewayMode(settings.mode || 'replay');
}

function renderCredentialPersistence(settings) {
  const credentials = settings && settings.credentials ? settings.credentials : {};
  const saved = credentials.apiKeySaved === true;
  const available = credentials.persistenceAvailable === true;
  byId('gateway-remember-api-key').checked = saved;
  byId('gateway-remember-api-key').disabled = !available;
  byId('clear-saved-api-key').disabled = !saved;
  const keyState = saved
    ? 'API key 已由 Windows DPAPI 为当前用户加密保存'
    : credentials.apiKeyConfigured
      ? 'API key 仅在当前主进程内存'
      : available
        ? 'API key 未保存'
        : 'DPAPI 不可用，仅支持进程内存';
  const modeState = settings.mode === 'deepseek'
    ? `DeepSeek ${settings.model} 已显式配置，公网内容可能计费`
    : settings.mode === 'gateway'
      ? 'Gateway 已显式配置'
      : '当前为 Replay，不建立网络连接';
  setText('gateway-settings-status', `${modeState}；${keyState}。`);
}

async function saveGatewaySettings() {
  clearError();
  const mode = byId('gateway-mode').value;
  const values = window.win7AgentGatewaySettingsPayload.build({
    mode,
    gatewayUrl: byId('gateway-url').value,
    model: byId('gateway-model').value,
    caBundlePath: byId('gateway-ca').value,
    apiKey: byId('gateway-api-key').value,
    rememberApiKey: byId('gateway-remember-api-key').checked,
  });
  const result = await call(() => window.win7Agent.setSettings(values));
  if (!result || !result.settings) return;
  byId('gateway-api-key').value = '';
  renderCredentialPersistence(result.settings);
  renderGatewayMode(result.settings.mode);
  await refreshDiagnostics();
}

async function clearSavedApiKey() {
  clearError();
  const result = await call(() => window.win7Agent.clearSavedApiKey());
  if (!result || !result.settings) return;
  byId('gateway-api-key').value = '';
  byId('gateway-mode').value = 'replay';
  renderCredentialPersistence(result.settings);
  renderGatewayMode('replay');
  await refreshDiagnostics();
}

function renderGatewayMode(mode) {
  const deepseek = mode === 'deepseek';
  byId('deepseek-network-warning').hidden = !deepseek;
  if (deepseek) byId('gateway-url').value = 'https://api.deepseek.com';
  byId('gateway-url').readOnly = deepseek;
  byId('gateway-model').disabled = mode === 'replay';
}

async function chooseWorkspace() {
  clearError();
  const result = await call(() => window.win7Agent.selectWorkspace());
  if (!result || !result.selected) return;
  state.workspacePath = result.selected.workspacePath;
  setText('workspace-path', state.workspacePath);
  setText('session-status', '工作区已规范化，请创建会话');
  byId('new-session').disabled = false;
  const created = await call(() => window.win7Agent.createSession(state.workspacePath));
  if (created && created.session) {
    state.session = created.session;
    setText('session-status', '会话已创建 · 进程内内存状态');
    byId('run-task').disabled = false;
    byId('close-session').disabled = false;
    await refreshSessions();
    await refreshRecovery();
    await refreshDiagnostics();
  }
}

async function createSession() {
  if (!state.workspacePath) return;
  const result = await call(() => window.win7Agent.createSession(state.workspacePath));
  if (!result || !result.session) return;
  state.session = result.session;
  setText('session-status', '会话已创建 · 进程内内存状态');
  byId('run-task').disabled = false;
  byId('close-session').disabled = false;
  await refreshSessions();
  await refreshRecovery();
}

async function closeSession() {
  if (!state.session || state.taskId) return;
  const result = await call(() => window.win7Agent.closeSession(state.session.sessionId));
  if (!result) return;
  state.session = null;
  setText('session-status', '会话已关闭，可重新创建内存会话');
  byId('run-task').disabled = true;
  byId('close-session').disabled = true;
  await refreshSessions();
  await refreshDiagnostics();
}

async function refreshSessions() {
  const result = await call(() => window.win7Agent.listSessions());
  if (result) renderSessions(result.sessions || []);
}

async function refreshRecovery() {
  if (!state.session || typeof window.win7Agent.getRecovery !== 'function') return;
  const result = await call(() => window.win7Agent.getRecovery(state.session.sessionId));
  if (!result || !result.recovery) return;
  const pending = result.recovery.pending;
  byId('recovery-panel').hidden = !pending;
  if (pending) {
    const locked = Boolean(result.recovery.locked) || pending.phase === 'rollback_failed';
    const guidance = locked
      ? '写入已锁定；请先点击“恢复原文件”，确认恢复完成后再继续。'
      : '不会自动继续写入；请检查后手动恢复原文件。';
    setText('recovery-detail', `检测到 ${pending.targetPath} 的未完成事务（${pending.phase}）。${guidance}`);
  }
}

function resetTaskView() {
  state.taskId = null; state.pendingApproval = null; state.eventQueue = window.win7AgentEventQueue.create(120); state.eventCount = 0; state.filePaths.clear();
  byId('timeline').textContent = ''; byId('file-activity').textContent = ''; byId('final-result').textContent = '任务运行中，等待 Replay 结果。'; setText('result-limit', ''); byId('file-empty').hidden = false;
  byId('approval-panel').hidden = true; byId('approve-task').disabled = true; byId('reject-task').disabled = true; byId('undo-task').disabled = true;
  state.runnerLog = window.win7AgentRunnerLog.create(64 * 1024);
  byId('runner-stdout').textContent = ''; byId('runner-stderr').textContent = '';
  setText('runner-stdout-limit', ''); setText('runner-stderr-limit', '');
  setText('runner-log-summary', '尚无非交互执行。'); setText('runner-log-state', '未运行'); byId('runner-log-state').className = 'state idle';
}

async function runTask() {
  if (!state.session) { showError({ message: '请先选择工作区并创建会话', recommendedAction: '选择一个本地目录。' }); return; }
  clearError(); resetTaskView();
  const prompt = byId('task-prompt').value.trim();
  if (!prompt) { showError({ message: '请输入只读分析任务', recommendedAction: '填写任务描述后重试。' }); return; }
  state.scenario = byId('scenario').value;
  const result = await call(() => window.win7Agent.submitTask(state.session.sessionId, prompt, state.scenario));
  if (!result || !result.task) return;
  state.taskId = result.task.taskId;
  setText('task-state', '运行中'); byId('task-state').className = 'state running';
  byId('run-task').disabled = true; byId('close-session').disabled = true; byId('cancel-task').disabled = false; byId('task-prompt').disabled = true; byId('scenario').disabled = true;
}

async function cancelTask() {
  if (!state.taskId || !state.session) return;
  setText('task-state', '正在取消'); byId('task-state').className = 'state cancelling'; byId('cancel-task').disabled = true;
  await call(() => window.win7Agent.cancelTask(state.session.sessionId, state.taskId));
}

async function approveTask() {
  if (!state.pendingApproval || !state.session || !state.taskId) return;
  byId('approve-task').disabled = true; byId('reject-task').disabled = true;
  setText('task-state', '正在提交批准'); byId('task-state').className = 'state running';
  await call(() => window.win7Agent.approveTask(state.session.sessionId, state.taskId, state.pendingApproval.approvalId, state.pendingApproval.planHash, state.pendingApproval.baseSha256));
}

async function rejectTask() {
  if (!state.pendingApproval || !state.session || !state.taskId) return;
  // Avoid a native prompt here: on legacy Electron/Win7 it can open behind
  // the BrowserWindow and make a visible button click appear to do nothing.
  const reason = 'A2-W03 用户拒绝测试';
  byId('approve-task').disabled = true; byId('reject-task').disabled = true;
  setText('task-state', '正在提交拒绝'); byId('task-state').className = 'state cancelling';
  appendTimeline('approval.rejection_requested', reason);
  const result = await call(() => window.win7Agent.rejectTask(state.session.sessionId, state.taskId, state.pendingApproval.approvalId, reason));
  if (result) appendTimeline('approval.rejected', '拒绝已提交，等待 Core 安全收口');
}

async function prepareUndo() {
  if (!state.session || !state.taskId) return;
  const sourceTaskId = state.taskId;
  // The host starts the undo task before the IPC response reaches Renderer.
  // Clear the old task filter first so early approval events for the new task
  // are rendered instead of being discarded as cross-task events.
  resetTaskView();
  state.scenario = 'undo';
  setText('task-state', '正在准备撤销'); byId('task-state').className = 'state running';
  const result = await call(() => window.win7Agent.prepareUndo(state.session.sessionId, sourceTaskId));
  if (result && result.task) {
    appendTimeline('undo.prepared', '已生成新的撤销计划，仍需重新审批');
    state.taskId = result.task.taskId;
    setText('task-state', '运行中'); byId('task-state').className = 'state running';
    byId('undo-task').disabled = true; byId('run-task').disabled = true; byId('cancel-task').disabled = false;
  } else {
    state.taskId = sourceTaskId;
    byId('undo-task').disabled = false;
  }
}

async function restoreRecovery() {
  if (!state.session || typeof window.win7Agent.restoreRecovery !== 'function') return;
  const result = await call(() => window.win7Agent.restoreRecovery(state.session.sessionId));
  if (result && result.result && result.result.restored) {
    byId('recovery-panel').hidden = true;
    appendTimeline('recovery.restored', result.result.detail);
    await refreshDiagnostics();
  }
}

function renderApproval(data) {
  const preparation = data && data.preparation;
  if (!preparation) return;
  state.pendingApproval = {
    approvalId: data.approvalId,
    planHash: preparation.planHash,
    baseSha256: preparation.baseSha256,
    planId: preparation.planId,
  };
  byId('approval-panel').hidden = false;
  setText('approval-description', data.description || '请核对 Diff 后决定是否写入。');
  const details = byId('approval-details'); details.textContent = '';
  [['文件', preparation.relativePath], ['编码', `${preparation.encoding}${preparation.bom ? ' + BOM' : ''}`], ['EOL', preparation.eol], ['基线 SHA-256', preparation.baseSha256], ['目标 SHA-256', preparation.contentSha256], ['计划 SHA-256', preparation.planHash]].forEach(([key, value]) => {
    const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = key; dd.textContent = value; details.appendChild(dt); details.appendChild(dd);
  });
  const preview = preparation.preview || {};
  const diffText = preview.unifiedDiff || preview.diff || '';
  byId('approval-diff').textContent = diffText || 'Diff 为空，禁止审批。';
  const disabled = Boolean(preview.truncated) || !diffText;
  byId('approve-task').disabled = disabled; byId('reject-task').disabled = false;
  setText('task-state', '等待审批'); byId('task-state').className = 'state awaiting';
  appendTimeline('approval.requested', `等待一次性审批：${preparation.relativePath}`);
}

function addFile(path) {
  if (state.filePaths.has(path)) return;
  state.filePaths.add(path); byId('file-empty').hidden = true;
  const item = document.createElement('li'); item.textContent = path; byId('file-activity').appendChild(item);
}

function handleTaskEvent(event) {
  if (!state.eventQueue) state.eventQueue = window.win7AgentEventQueue.create(120);
  const accepted = state.eventQueue.push(event);
  if (!accepted.accepted) { if (accepted.reason !== 'duplicate') appendTimeline('event.ignored', `已拒绝${accepted.reason}事件`); return; }
  if (accepted.gap) appendTimeline('event.gap', '检测到事件间隙，界面保留当前可重建状态');
  if (accepted.overflowed) setText('timeline-note', '事件过量：已保留最近 120 条');
  state.eventQueue.drain(24).forEach(processTaskEvent);
}

function processTaskEvent(event) {
  if (!event || !event.taskId || (state.taskId && event.taskId !== state.taskId)) return;
  state.eventCount += 1;
  const data = event.data || {};
  if (event.eventKind.indexOf('runner.') === 0) { renderRunnerEvent(event.eventKind, data); return; }
  if (event.eventKind === 'task.accepted') appendTimeline(event.eventKind, '任务已进入 Core Runtime');
  else if (event.eventKind === 'tool.started') appendTimeline(event.eventKind, `${data.toolName || 'tool'} 已开始`);
  else if (event.eventKind === 'tool.completed') appendTimeline(event.eventKind, `${data.toolName || 'tool'} · ${data.status || 'completed'}`);
  else if (event.eventKind === 'assistant.delta') { appendTimeline(event.eventKind, data.delta || ''); if (data.delta) byId('final-result').textContent = limitText(data.delta, 12_000); }
  else if (event.eventKind === 'gateway.delta') appendTimeline(event.eventKind, data.delta || '');
  else if (event.eventKind === 'file.reference') { addFile(data.path); appendTimeline(event.eventKind, data.path || ''); }
  else if (event.eventKind === 'state.changed') appendTimeline(event.eventKind, `${data.from || '?'} → ${data.to || '?'}`);
  else if (event.eventKind === 'approval.requested') renderApproval(data);
  else if (event.eventKind === 'task.awaiting_approval') appendTimeline(event.eventKind, '任务暂停，等待用户决定');
  else if (event.eventKind === 'approval.resolved') appendTimeline(event.eventKind, data.resolution === 'approved' ? '已批准，恢复执行' : '已拒绝，恢复到安全结束');
  else if (event.eventKind === 'task.cancelling') appendTimeline(event.eventKind, '正在等待 Core 收口取消');
  else if (event.eventKind === 'task.completed') { appendTimeline(event.eventKind, '任务完成'); setText('task-state', '已完成'); byId('task-state').className = 'state completed'; byId('approval-panel').hidden = true; byId('undo-task').disabled = state.scenario !== 'edit'; finishTaskUi(); }
  else if (event.eventKind === 'task.cancelled') { appendTimeline(event.eventKind, '任务已取消'); setText('task-state', '已取消'); byId('task-state').className = 'state cancelled'; finishTaskUi(); }
  else if (event.eventKind === 'task.failed' || event.eventKind === 'error.occurred') { appendTimeline(event.eventKind, data.message || data.outcome || '任务失败'); showError(data); finishTaskUi(); }
}

function renderRunnerEvent(kind, data) {
  if (!state.runnerLog) state.runnerLog = window.win7AgentRunnerLog.create(64 * 1024);
  if (kind === 'runner.started') {
    setText('runner-log-state', '运行中'); byId('runner-log-state').className = 'state running';
    setText('runner-log-summary', `${data.profileId || '受信 profile'} · ${data.cwd || ''}`);
  } else if (kind === 'runner.stdout' || kind === 'runner.stderr') {
    const stream = kind === 'runner.stdout' ? 'stdout' : 'stderr';
    const update = state.runnerLog.append(stream, data.text || '');
    if (update.accepted) {
      const target = byId(`runner-${stream}`); target.textContent = update.text; target.scrollTop = target.scrollHeight;
      if (update.truncated) setText(`runner-${stream}-limit`, '· 已保留最近 64K 字符');
    }
  } else if (kind === 'runner.truncated') {
    const stream = data.stream === 'stderr' ? 'stderr' : 'stdout';
    state.runnerLog.markTruncated(stream);
    setText(`runner-${stream}-limit`, `· 已截断 ${Number(data.omittedBytes) || 0} bytes`);
  } else if (kind === 'runner.finished') {
    const status = String(data.status || 'failed');
    setText('runner-log-state', status); byId('runner-log-state').className = `state ${status === 'exited' ? 'completed' : status}`;
    setText('runner-log-summary', `状态 ${status} · ${Number(data.durationMs) || 0} ms${data.exitCode == null ? '' : ` · exit ${data.exitCode}`}`);
  }
  appendTimeline(kind, kind === 'runner.stdout' || kind === 'runner.stderr' ? `${Number(data.bytes) || 0} bytes` : data);
}

function finishTaskUi() { byId('run-task').disabled = !state.session; byId('close-session').disabled = !state.session; byId('cancel-task').disabled = true; byId('task-prompt').disabled = false; byId('scenario').disabled = false; }

async function initialize() {
  byId('workspace-select').addEventListener('click', chooseWorkspace);
  byId('new-session').addEventListener('click', createSession);
  byId('close-session').addEventListener('click', closeSession);
  byId('run-task').addEventListener('click', runTask);
  byId('cancel-task').addEventListener('click', cancelTask);
  byId('approve-task').addEventListener('click', approveTask);
  byId('reject-task').addEventListener('click', rejectTask);
  byId('undo-task').addEventListener('click', prepareUndo);
  byId('restore-recovery').addEventListener('click', restoreRecovery);
  byId('refresh-diagnostics').addEventListener('click', refreshDiagnostics);
  byId('save-gateway-settings').addEventListener('click', saveGatewaySettings);
  byId('clear-saved-api-key').addEventListener('click', clearSavedApiKey);
  byId('gateway-mode').addEventListener('change', () => renderGatewayMode(byId('gateway-mode').value));
  byId('scenario').addEventListener('change', () => {
    byId('run-task').textContent = byId('scenario').value === 'edit' || byId('scenario').value === 'undo'
      ? '开始受控修改'
      : '开始任务';
  });
  if (!window.win7Agent || typeof window.win7Agent.onTaskEvent !== 'function') { showError({ message: 'Preload A1 API unavailable', recommendedAction: '重新启动可信本地入口。' }); return; }
  state.eventQueue = window.win7AgentEventQueue.create(120);
  state.runnerLog = window.win7AgentRunnerLog.create(64 * 1024);
  window.win7Agent.onTaskEvent(handleTaskEvent);
  await refreshDiagnostics();
  await refreshGatewaySettings();
  await refreshSessions();
  window.win7Agent.signalReady();
}

window.addEventListener('DOMContentLoaded', initialize, { once: true });
