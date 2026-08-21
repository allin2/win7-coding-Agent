'use strict';

const state = {
  workspacePath: null,
  session: null,
  taskId: null,
  taskRunning: false,
  executionMode: 'direct',
  scenario: 'structure',
  eventQueue: null,
  projector: null,
  filePaths: new Set(),
  filePathsBySession: new Map(),
  pendingApproval: null,
  pendingPlanApproval: null,
  review: null,
  reviewTaskId: null,
  reviewFilePath: null,
  reviewApproval: null,
  assistantBlocks: new Map(),
  toolCards: new Map(),
  runnerLog: null,
  lastSubmission: null,
  sessions: [],
  conversationViews: new Map(),
  renderSessionId: null,
  activeTaskSessionId: null,
  cancelRequested: false,
  pendingCloseSessionId: null,
  pendingContexts: new Map(),
  explorerPath: '',
  viewer: null,
  lastFocusedElement: null,
  lastInspectorFocusedElement: null,
  lastNavigationFocusedElement: null,
};

function byId(id) { return document.getElementById(id); }
function setText(id, value) { const node = byId(id); if (node) node.textContent = String(value); }
function safeJson(value) { try { return JSON.stringify(value, null, 2); } catch (_error) { return String(value); } }
function limitText(value, maximum) { const text = typeof value === 'string' ? value : safeJson(value); return text.length <= maximum ? text : `${text.slice(0, maximum)}…`; }
function scrollConversation() { const target = byId('conversation'); target.scrollTop = target.scrollHeight; }

function currentRenderSessionId() { return state.renderSessionId || (state.session && state.session.sessionId); }
function workspaceDisplayName(workspacePath) {
  const parts = String(workspacePath || '').split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || '已连接工作区';
}

function ensureConversationView(sessionId) {
  if (!sessionId) return byId('conversation');
  if (state.conversationViews.has(sessionId)) return state.conversationViews.get(sessionId);
  const view = document.createElement('div'); view.className = 'session-view'; view.dataset.sessionId = sessionId;
  const welcome = document.createElement('section'); welcome.className = 'welcome';
  welcome.innerHTML = '<div class="welcome-glyph">⌘</div><p class="kicker">AGENT-FIRST WORKSPACE</p><h2>先描述你想完成的事。</h2><p>按需添加文件、目录或文本上下文；工具实际读取的文件会单独记录。</p>';
  welcome.querySelector('.welcome-glyph').setAttribute('aria-hidden', 'true');
  const suggestions = document.createElement('div'); suggestions.className = 'suggestions';
  [['分析这个工作区的代码结构，并指出最重要的入口。', '梳理代码结构'], ['检查中文路径、编码与 CRLF 兼容风险。', '检查 Win7 兼容性']].forEach(([prompt, label]) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = `${label} →`;
    button.addEventListener('click', () => { byId('task-prompt').value = prompt; resizeComposer(); byId('task-prompt').focus(); });
    suggestions.appendChild(button);
  });
  welcome.appendChild(suggestions); view.appendChild(welcome); byId('conversation').appendChild(view);
  state.conversationViews.set(sessionId, view); return view;
}

function activateConversation(sessionId) {
  state.conversationViews.forEach((view, id) => { view.hidden = id !== sessionId; });
  if (sessionId) ensureConversationView(sessionId).hidden = false;
  const empty = byId('empty-session');
  if (empty) empty.hidden = Boolean(sessionId);
  scrollConversation();
}

function updateEmptySession() {
  const empty = byId('empty-session');
  if (!empty) return;
  empty.hidden = Boolean(state.session);
  const action = byId('empty-session-action');
  if (action) {
    const hasWorkspace = Boolean(state.workspacePath);
    action.textContent = hasWorkspace ? '新建会话' : '选择工作区';
    action.setAttribute('aria-label', hasWorkspace ? '新建会话' : '选择工作区');
  }
}

function setTaskState(label, className) {
  if (state.renderSessionId && state.session && state.renderSessionId !== state.session.sessionId) return;
  setText('task-state', label);
  byId('task-state').className = `task-pill ${className}`;
}

function showError(error) {
  const value = error && error.error ? error.error : error;
  const message = value && value.message ? value.message : String(value || '未知错误');
  const action = value && value.recommendedAction ? ` 建议：${value.recommendedAction}` : '';
  setText('error-banner', message + action);
  byId('error-banner').hidden = false;
}

function clearError() { byId('error-banner').hidden = true; setText('error-banner', ''); }

async function call(action) {
  try {
    const result = await action();
    if (result && result.ok === false) { showError(result); return null; }
    return result;
  } catch (error) { showError(error); return null; }
}

function appendTimeline(kind, detail) {
  const item = document.createElement('li');
  const label = document.createElement('span');
  label.className = 'event-kind';
  label.textContent = kind;
  item.appendChild(label);
  item.appendChild(document.createTextNode(`  ${limitText(detail, 1600)}`));
  byId('timeline').appendChild(item);
  while (byId('timeline').children.length > 120) byId('timeline').removeChild(byId('timeline').firstChild);
  byId('timeline').scrollTop = byId('timeline').scrollHeight;
}

function createMessage(role, meta, text) {
  const target = ensureConversationView(currentRenderSessionId());
  const welcome = target.querySelector('.welcome'); if (welcome) welcome.hidden = true;
  const node = byId('message-template').content.firstElementChild.cloneNode(true);
  node.classList.add(role);
  node.querySelector('.message-meta').textContent = meta;
  node.querySelector('.message-content').textContent = text || '';
  target.appendChild(node);
  scrollConversation();
  return node;
}

function addCard(kind, title, status, body) {
  const target = ensureConversationView(currentRenderSessionId());
  const welcome = target.querySelector('.welcome'); if (welcome) welcome.hidden = true;
  const card = document.createElement('section');
  card.className = `card ${kind}`;
  const header = document.createElement('div'); header.className = 'card-header';
  const strong = document.createElement('strong'); strong.textContent = title;
  const badge = document.createElement('span'); badge.textContent = status || '';
  header.appendChild(strong); header.appendChild(badge);
  const content = document.createElement('div'); content.className = 'card-body';
  if (body instanceof Node) content.appendChild(body); else content.textContent = body || '';
  card.appendChild(header); card.appendChild(content);
  target.appendChild(card);
  scrollConversation();
  return { card, header, badge, content };
}

function addActions(card, actions) {
  const row = document.createElement('div'); row.className = 'card-actions';
  actions.forEach((action) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = action.label;
    if (action.className) button.className = action.className;
    button.disabled = Boolean(action.disabled);
    button.addEventListener('click', action.onClick);
    row.appendChild(button);
  });
  card.appendChild(row);
}

function renderAssistantBlocks() {
  const snapshot = state.projector.snapshot();
  snapshot.blocks.forEach((block) => {
    let node = state.assistantBlocks.get(block.blockId);
    if (!node) {
      node = createMessage('assistant', block.continuation ? 'Agent · continuation' : 'Agent', '');
      node.dataset.blockId = block.blockId;
      state.assistantBlocks.set(block.blockId, node);
    }
    node.querySelector('.message-content').textContent = block.text;
    node.querySelector('.message-meta').textContent = block.closedBy
      ? `Agent · ${block.closedBy.toLowerCase()}` : 'Agent · streaming';
  });
  snapshot.warnings.slice(-3).forEach((warning) => appendTimeline('projection.warning', warning.code));
  scrollConversation();
}

function renderPlan(data) {
  const plan = data && data.plan ? data.plan : data;
  if (!plan || (!Array.isArray(plan.targets) && !Array.isArray(plan.toolCalls))) return;
  const targets = Array.isArray(plan.targets) ? plan.targets : plan.toolCalls.map((entry) => {
    const call = entry && entry.call ? entry.call : {};
    return { toolName: call.toolName, paths: call.args && call.args.path ? [call.args.path] : [] };
  });
  if (state.executionMode !== 'plan' && targets.length === 0) return;
  const body = document.createElement('div');
  const summary = document.createElement('p'); summary.textContent = plan.summary || '执行计划'; body.appendChild(summary);
  if (targets.length) {
    const details = document.createElement('details'); const toggle = document.createElement('summary'); toggle.textContent = '查看步骤与影响范围'; details.appendChild(toggle);
    const list = document.createElement('ol');
    targets.forEach((target) => { const item = document.createElement('li'); item.textContent = `${target.toolName || '步骤'}${target.paths && target.paths.length ? ` · ${target.paths.join(', ')}` : ''}`; list.appendChild(item); });
    details.appendChild(list);
    const verification = document.createElement('p'); verification.textContent = `验证：${plan.verificationRequirements && plan.verificationRequirements.length ? plan.verificationRequirements.map((item) => item.description || item.checkId || safeJson(item)).join('；') : '由任务验收合同收集证据'}`; details.appendChild(verification);
    const risks = document.createElement('p'); risks.textContent = `风险：${plan.risks && plan.risks.length ? plan.risks.join('；') : '只读步骤'}`; details.appendChild(risks);
    body.appendChild(details);
  }
  addCard('plan-card', '执行计划', `${targets.length} 个步骤`, body);
}

function renderPlanApproval(data) {
  state.pendingPlanApproval = { approvalId: data.approvalId, planHash: data.planHash };
  const card = addCard('approval-card', '确认执行计划', '等待决定', '在开始任何工具调用前，请核对上方目标、影响范围与验证方式。拒绝不会启动工具。');
  addActions(card.card, [
    { label: '拒绝计划', className: 'danger', onClick: () => decidePlan('rejected') },
    { label: '批准并执行', className: 'primary', onClick: () => decidePlan('approved') },
  ]);
  setTaskState('等待计划批准', 'awaiting');
}

async function decidePlan(resolution) {
  const pending = state.pendingPlanApproval;
  if (!pending || !state.session || !state.taskId) return;
  setTaskState(resolution === 'approved' ? '恢复执行' : '拒绝计划', 'running');
  const result = resolution === 'approved'
    ? await call(() => window.win7Agent.approvePlan(state.session.sessionId, state.taskId, pending.approvalId, pending.planHash))
    : await call(() => window.win7Agent.rejectPlan(state.session.sessionId, state.taskId, pending.approvalId, pending.planHash, '用户拒绝执行计划'));
  if (result) state.pendingPlanApproval = null;
}

function renderTool(kind, data, event) {
  const key = data.toolCallId || `${data.toolName || 'tool'}:${event.sequence}`;
  let entry = state.toolCards.get(key);
  if (!entry) {
    const details = document.createElement('details'); const toggle = document.createElement('summary'); toggle.textContent = '查看调用参数';
    const args = document.createElement('pre'); args.textContent = safeJson(data.args || {}); details.appendChild(toggle); details.appendChild(args);
    entry = addCard('tool-card running', data.toolName || '工具调用', 'RUNNING', details);
    state.toolCards.set(key, entry);
  }
  if (kind === 'tool.completed') {
    entry.card.classList.remove('running'); entry.card.classList.add('completed');
    entry.badge.textContent = String(data.status || 'COMPLETED').toUpperCase();
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '查看结果';
    const output = document.createElement('pre'); output.textContent = limitText(data.output || data.error || {}, 6000);
    details.appendChild(summary); details.appendChild(output); entry.content.appendChild(details);
  }
  scrollConversation();
}

function renderWriteApproval(data) {
  const preparation = data && data.preparation;
  if (!preparation) return;
  state.pendingApproval = { approvalId: data.approvalId, planHash: preparation.planHash, baseSha256: preparation.baseSha256 };
  const body = document.createElement('div');
  const summary = document.createElement('p'); summary.textContent = `${preparation.relativePath} · ${preparation.encoding} · ${preparation.eol}`; body.appendChild(summary);
  const diff = document.createElement('pre'); diff.className = 'diff';
  const preview = preparation.preview || {}; const diffText = preview.unifiedDiff || preview.diff || '';
  diff.textContent = diffText || 'Diff 为空，禁止审批。'; body.appendChild(diff);
  const card = addCard('approval-card', '单文件写入审批', '一次性绑定', body);
  addActions(card.card, [
    { label: '拒绝', className: 'danger', onClick: rejectWrite },
    { label: '批准并写入', className: 'primary', disabled: Boolean(preview.truncated) || !diffText, onClick: approveWrite },
  ]);
  setTaskState('等待写入审批', 'awaiting');
}

function renderReview(data) {
  const review = data && data.review ? data.review : data;
  if (!review || !Array.isArray(review.files)) return;
  state.review = review;
  state.reviewTaskId = state.taskId;
  if (!state.reviewFilePath || !review.files.some((item) => item.relativePath === state.reviewFilePath)) {
    state.reviewFilePath = review.files[0] && review.files[0].relativePath;
  }
  const panel = byId('review-panel');
  if (panel) panel.hidden = false;
  setText('review-status', review.status || 'READY');
  setText('review-nav-state', review.status === 'APPLIED' ? '已应用' : `${review.files.length} 文件`);
  setText('review-summary', `${review.files.filter((item) => item.decision === 'ACCEPTED').length} 已接受 · ${review.files.filter((item) => item.decision === 'REJECTED').length} 已拒绝 · revision ${review.revision}`);
  const list = byId('review-files'); list.textContent = '';
  review.files.forEach((file) => {
    const row = document.createElement('li');
    if (file.relativePath === state.reviewFilePath) row.classList.add('selected');
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-pressed', String(file.relativePath === state.reviewFilePath)); button.textContent = `${file.operation} · ${file.relativePath}`;
    button.addEventListener('click', () => { state.reviewFilePath = file.relativePath; renderReview(review); });
    const decision = document.createElement('span'); decision.className = 'review-decision'; decision.textContent = file.decision;
    row.appendChild(button); row.appendChild(decision); list.appendChild(row);
  });
  const selected = review.files.find((item) => item.relativePath === state.reviewFilePath);
  const diff = byId('review-diff');
  if (diff) diff.textContent = selected
    ? `${selected.relativePath}\n${selected.beforeEncoding} → ${selected.afterEncoding} · ${selected.beforeEol} → ${selected.afterEol}\n\n${selected.diff && selected.diff.unifiedDiff ? selected.diff.unifiedDiff : '无 Diff'}`
    : '选择文件查看 Diff。';
  const canDecide = Boolean(selected && state.session && state.session.status === 'ACTIVE' && review.status === 'READY' && state.taskRunning);
  byId('review-accept').disabled = !canDecide || !selected.writable;
  byId('review-reject').disabled = !canDecide;
  const allDecided = review.files.every((item) => item.decision !== 'PENDING');
  const hasAccepted = review.files.some((item) => item.decision === 'ACCEPTED');
  byId('review-issue-approval').disabled = !allDecided || !hasAccepted || review.status !== 'READY' || Boolean(state.reviewApproval);
  byId('review-apply').disabled = !state.reviewApproval || review.status !== 'READY';
  const validationRuns = Array.isArray(review.validationRuns) ? review.validationRuns : [];
  const latestValidation = validationRuns.length > 0 ? validationRuns[validationRuns.length - 1] : null;
  setText('review-validation-state', latestValidation ? `${latestValidation.status}${latestValidation.stale ? ' · STALE' : ''}` : 'NOT_RUN');
  setText('review-validation-detail', latestValidation
    ? `${latestValidation.summary || '无摘要'} · ${latestValidation.applicablePaths ? latestValidation.applicablePaths.length : 0} 个适用文件`
    : '尚未登记验证；没有合格 Runner Profile 时保持 NOT_RUN。');
  byId('review-validation-not-run').disabled = !allDecided || !hasAccepted || review.status !== 'READY' || !state.taskRunning;
  let recoveryButton = byId('review-recovery');
  if (!recoveryButton) {
    recoveryButton = document.createElement('button');
    recoveryButton.id = 'review-recovery'; recoveryButton.type = 'button'; recoveryButton.className = 'secondary'; recoveryButton.textContent = '恢复 Review 写入';
    recoveryButton.addEventListener('click', restoreReviewRecovery);
    const validationPanel = document.querySelector('.review-validation');
    if (validationPanel) validationPanel.appendChild(recoveryButton);
  }
  recoveryButton.disabled = review.status !== 'RECOVERY_REQUIRED' || state.taskRunning;
  setText('review-unverified', review.unverifiedItems && review.unverifiedItems.length ? `未验证项：${review.unverifiedItems.join('、')}` : '验证已覆盖当前集合。');
}

async function decideReviewFile(decision) {
  if (!state.review || !state.reviewTaskId || !state.session || !state.reviewFilePath) return;
  const result = await call(() => window.win7Agent.decideReview(state.session.sessionId, state.reviewTaskId, state.reviewFilePath, decision));
  if (result && result.result) { state.reviewApproval = null; renderReview(result.result.review); }
}

async function issueReviewApproval() {
  if (!state.review || !state.reviewTaskId || !state.session) return;
  const result = await call(() => window.win7Agent.issueReviewApproval(state.session.sessionId, state.reviewTaskId, 'desktop-user'));
  if (result && result.result) { state.reviewApproval = result.result.approval; renderReview(result.result.review); setTaskState('等待 Review 应用', 'awaiting'); }
}

async function applyReview() {
  if (!state.reviewApproval || !state.reviewTaskId || !state.session) return;
  const result = await call(() => window.win7Agent.applyReview(state.session.sessionId, state.reviewTaskId, state.reviewApproval));
  if (result && result.result) { state.reviewApproval = null; renderReview(result.result.review); }
}

async function recordReviewNotRun() {
  if (!state.review || !state.reviewTaskId || !state.session) return;
  const result = await call(() => window.win7Agent.recordReviewValidation(state.session.sessionId, state.reviewTaskId, {
    status: 'NOT_RUN',
    complete: true,
    outputTruncated: false,
    summary: '当前没有登记的项目测试 Runner Profile。',
    source: 'desktop-product-validation',
    trustedAdapter: false,
  }));
  if (result && result.result) renderReview(result.result.review);
}

async function restoreReviewRecovery() {
  if (!state.review || !state.reviewTaskId || !state.session) return;
  const result = await call(() => window.win7Agent.restoreReviewRecovery(state.session.sessionId, state.reviewTaskId));
  if (result && result.result && result.result.result && result.result.result.restored) {
    state.activeTaskSessionId = state.session.sessionId;
    setRunning(true);
    setTaskState('等待 Review 决定', 'awaiting');
    renderReview(result.result.review);
  }
}

async function approveWrite() {
  if (!state.pendingApproval || !state.session || !state.taskId) return;
  const p = state.pendingApproval; setTaskState('提交批准', 'running');
  const result = await call(() => window.win7Agent.approveTask(state.session.sessionId, state.taskId, p.approvalId, p.planHash, p.baseSha256));
  if (result) state.pendingApproval = null;
}

async function rejectWrite() {
  if (!state.pendingApproval || !state.session || !state.taskId) return;
  const p = state.pendingApproval; setTaskState('拒绝写入', 'running');
  const result = await call(() => window.win7Agent.rejectTask(state.session.sessionId, state.taskId, p.approvalId, '用户拒绝受控写入'));
  if (result) state.pendingApproval = null;
}

function renderTaskError(data) {
  const value = data.error && typeof data.error === 'object' ? data.error : data;
  const card = addCard('error-card', value.code || '任务失败', '可恢复', value.message || value.outcome || '任务未能完成。');
  if (state.lastSubmission) addActions(card.card, [{ label: '重试原任务', className: 'primary', onClick: retryLastTask }]);
}

function addFile(filePath) {
  const sessionId = currentRenderSessionId();
  if (!filePath || !sessionId) return;
  if (!state.filePathsBySession.has(sessionId)) state.filePathsBySession.set(sessionId, new Set());
  state.filePathsBySession.get(sessionId).add(filePath);
  if (state.session && state.session.sessionId === sessionId) renderFileActivity();
}

function renderFileActivity() {
  const paths = state.session ? state.filePathsBySession.get(state.session.sessionId) || new Set() : new Set();
  const list = byId('file-activity'); list.textContent = '';
  paths.forEach((filePath) => {
    const item = document.createElement('li');
    const button = document.createElement('button'); button.type = 'button'; button.textContent = filePath;
    button.addEventListener('click', () => openWorkspaceFile(filePath)); item.appendChild(button); list.appendChild(item);
  });
  byId('file-empty').hidden = paths.size > 0; setText('file-count', paths.size);
}

function activeContexts() {
  if (!state.session) return [];
  if (!state.pendingContexts.has(state.session.sessionId)) state.pendingContexts.set(state.session.sessionId, []);
  return state.pendingContexts.get(state.session.sessionId);
}

function addContext(ref) {
  if (!state.session || state.session.status !== 'ACTIVE') return;
  const refs = activeContexts();
  const key = `${ref.kind}:${ref.path || ref.label || ''}:${ref.startLine || ''}:${ref.endLine || ''}`;
  if (refs.some((item) => item.key === key)) return;
  if (refs.length >= 24) { showError({ message: '单轮最多添加 24 项上下文。' }); return; }
  refs.push({ key, ...ref }); renderContextChips();
}

function renderContextChips() {
  const target = byId('context-chips'); target.textContent = '';
  activeContexts().forEach((ref, index) => {
    const chip = document.createElement('span'); chip.className = 'context-chip';
    chip.appendChild(document.createTextNode(`@${ref.kind} ${ref.path || ref.label}${ref.startLine ? `:${ref.startLine}-${ref.endLine}` : ''}`));
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `移除上下文 ${ref.path || ref.label || index + 1}`);
    remove.addEventListener('click', () => { activeContexts().splice(index, 1); renderContextChips(); });
    chip.appendChild(remove); target.appendChild(chip);
  });
  target.hidden = target.children.length === 0;
}

async function refreshWorkspace(pathValue) {
  if (!state.session || state.session.status !== 'ACTIVE') return;
  const result = await call(() => window.win7Agent.listWorkspace(state.session.sessionId, pathValue || ''));
  if (!result || !result.result) return;
  const listing = result.result; state.explorerPath = listing.path || '';
  setText('explorer-path', state.explorerPath || '/'); byId('workspace-up').disabled = !state.explorerPath;
  const tree = byId('workspace-tree'); tree.textContent = '';
  (listing.entries || []).forEach((entry) => {
    const row = document.createElement('li');
    const open = document.createElement('button'); open.type = 'button'; open.textContent = `${entry.type === 'directory' ? '▸' : '·'} ${entry.name}`; open.title = entry.path;
    open.addEventListener('click', () => entry.type === 'directory' ? refreshWorkspace(entry.path) : entry.type === 'file' ? openWorkspaceFile(entry.path) : undefined);
    row.appendChild(open);
    if (entry.type === 'directory' || entry.type === 'file') {
      const add = document.createElement('button'); add.type = 'button'; add.dataset.addContext = 'true'; add.textContent = '+CTX'; add.setAttribute('aria-label', `加入上下文 ${entry.name}`);
      add.addEventListener('click', () => addContext({ kind: entry.type === 'file' ? 'file' : 'directory', path: entry.path })); row.appendChild(add);
    }
    tree.appendChild(row);
  });
  byId('workspace-tree-empty').hidden = tree.children.length > 0;
}

async function openWorkspaceFile(filePath, startLine) {
  if (!state.session) return;
  const result = await call(() => window.win7Agent.readWorkspaceFile(state.session.sessionId, filePath, startLine || 1, 500, 'utf-8'));
  if (!result || !result.result) return;
  state.viewer = { result: result.result, selectionStart: null, selectionEnd: null };
  byId('viewer-panel').hidden = false; setText('viewer-file', result.result.path); setText('viewer-range', '未选择');
  byId('viewer-search').value = ''; renderViewerLines();
  toggleInspector(true);
}

function renderViewerLines() {
  const target = byId('code-viewer'); target.textContent = '';
  if (!state.viewer) return;
  const query = byId('viewer-search').value.toLocaleLowerCase();
  state.viewer.result.lines.forEach((line) => {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'code-line'; row.dataset.line = String(line.line);
    if (query && line.text.toLocaleLowerCase().includes(query)) row.classList.add('match');
    if (state.viewer.selectionStart && line.line >= state.viewer.selectionStart && line.line <= state.viewer.selectionEnd) row.classList.add('selected');
    const number = document.createElement('span'); number.className = 'line-no'; number.textContent = line.line;
    const code = document.createElement('span'); code.className = 'line-code'; code.textContent = line.text || ' ';
    row.appendChild(number); row.appendChild(code); row.addEventListener('click', (event) => selectViewerLine(line.line, event.shiftKey)); target.appendChild(row);
  });
}

function selectViewerLine(line, extend) {
  if (!state.viewer) return;
  if (!extend || !state.viewer.selectionStart) state.viewer.selectionStart = state.viewer.selectionEnd = line;
  else {
    const anchor = state.viewer.selectionStart;
    state.viewer.selectionStart = Math.min(anchor, line); state.viewer.selectionEnd = Math.max(anchor, line);
  }
  setText('viewer-range', `L${state.viewer.selectionStart}–L${state.viewer.selectionEnd}`); renderViewerLines();
}

function viewerRef() {
  if (!state.viewer) return null;
  return {
    kind: 'file', path: state.viewer.result.path,
    startLine: state.viewer.selectionStart || state.viewer.result.startLine,
    endLine: state.viewer.selectionEnd || state.viewer.result.endLine,
  };
}

function primePromptFromViewer(verb) {
  const ref = viewerRef(); if (!ref) return;
  addContext(ref); byId('task-prompt').value = `${verb} @file:${ref.path}#L${ref.startLine}-L${ref.endLine}`; resizeComposer(); byId('task-prompt').focus();
}

async function refreshSessionProjection() {
  if (!state.session) { renderGoal(null); return; }
  const result = await call(() => window.win7Agent.getSession(state.session.sessionId));
  if (result && result.projection) renderGoal(result.projection.goal);
}

function renderGoal(goal) {
  setText('goal-text', goal ? goal.text : '尚未设置 Goal');
  setText('goal-meta', goal ? `${goal.status} · revision ${goal.revision}` : '每个会话同时只有一个活动 Goal。');
  const editable = Boolean(state.session && state.session.status === 'ACTIVE');
  byId('edit-goal').disabled = !editable;
  byId('achieve-goal').disabled = !editable || !goal || goal.status !== 'ACTIVE';
  byId('abandon-goal').disabled = !editable || !goal || goal.status !== 'ACTIVE';
  state.goal = goal;
}

async function editGoal() {
  if (!state.session) return;
  const text = window.prompt('设置当前会话 Goal', state.goal ? state.goal.text : '');
  if (!text) return;
  const result = await call(() => window.win7Agent.setGoal(state.session.sessionId, text, state.goal ? state.goal.revision : 0));
  if (result && result.result) renderGoal(result.result.goal);
}

async function resolveGoal(status) {
  if (!state.session || !state.goal) return;
  const result = await call(() => window.win7Agent.resolveGoal(state.session.sessionId, status, state.goal.revision));
  if (result && result.result) renderGoal(result.result.goal);
}

function attachText() {
  const content = window.prompt('粘贴文本上下文（单轮总量上限 64 KiB）', '');
  if (!content) return;
  const label = window.prompt('附件名称', 'notes.txt') || 'notes.txt';
  addContext({ kind: 'text', label: label.slice(0, 120), content });
}

function resetTaskState() {
  state.taskId = null; state.pendingApproval = null; state.pendingPlanApproval = null;
  state.cancelRequested = false;
  state.review = null; state.reviewTaskId = null; state.reviewFilePath = null; state.reviewApproval = null;
  if (byId('review-panel')) byId('review-panel').hidden = true;
  setText('review-nav-state', '待准备');
  state.eventQueue = window.win7AgentEventQueue.create(240);
  state.projector = window.win7AgentConversationProjector.create();
  state.assistantBlocks = new Map(); state.toolCards = new Map();
  byId('timeline').textContent = '';
  state.runnerLog = window.win7AgentRunnerLog.create(64 * 1024);
  setText('runner-stdout', ''); setText('runner-stderr', ''); setText('runner-stdout-limit', ''); setText('runner-stderr-limit', '');
}

function setRunning(running) {
  state.taskRunning = running;
  const viewingActive = running && state.session && state.session.sessionId === state.activeTaskSessionId;
  const closingCurrent = Boolean(state.session && state.pendingCloseSessionId === state.session.sessionId);
  byId('run-task').hidden = viewingActive; byId('cancel-task').hidden = !viewingActive;
  byId('cancel-task').disabled = !viewingActive || state.cancelRequested; byId('run-task').disabled = running || closingCurrent || !state.session || state.session.status !== 'ACTIVE' || !byId('task-prompt').value.trim();
  byId('task-prompt').disabled = closingCurrent || !state.session || state.session.status !== 'ACTIVE';
  byId('attach-text').disabled = closingCurrent || !state.session || state.session.status !== 'ACTIVE' || running;
  const canClose = Boolean(state.session && state.session.status === 'ACTIVE');
  const closeLabel = window.win7AgentSessionUi.closeLabel(state.session, running, state.activeTaskSessionId);
  ['close-session', 'close-session-header'].forEach((id) => {
    const closeButton = byId(id);
    closeButton.disabled = !canClose || closingCurrent;
    closeButton.textContent = id === 'close-session-header' && closeLabel === '关闭当前会话' ? '关闭会话' : closeLabel;
    closeButton.title = viewingActive ? '先停止当前任务，再关闭会话' : '归档当前会话';
    closeButton.setAttribute('aria-label', closeLabel);
  });
  byId('mode-direct').disabled = running; byId('mode-plan').disabled = running;
}

function selectMode(mode) {
  if (state.taskRunning) return;
  state.executionMode = window.win7AgentComposerController.normalizeMode(mode);
  ['direct', 'plan'].forEach((name) => {
    const active = state.executionMode === name; const button = byId(`mode-${name}`);
    button.classList.toggle('active', active); button.setAttribute('aria-checked', String(active));
  });
}

async function runTask(submission) {
  if (!state.session) { showError({ message: '请先选择工作区并创建会话。' }); return; }
  const prompt = submission && submission.prompt ? submission.prompt : byId('task-prompt').value.trim();
  if (!prompt || state.taskRunning) return;
  clearError(); resetTaskState();
  state.scenario = submission && submission.scenario ? submission.scenario : byId('scenario').value;
  state.executionMode = submission && submission.executionMode ? submission.executionMode : state.executionMode;
  const refs = submission && submission.refs ? submission.refs : activeContexts().map(({ key, ...ref }) => ref);
  const submissionSessionId = state.session.sessionId;
  state.lastSubmission = { prompt, scenario: state.scenario, executionMode: state.executionMode, refs };
  state.renderSessionId = submissionSessionId;
  createMessage('user', state.executionMode === 'plan' ? '你 · 先计划' : '你 · 直接做', prompt);
  state.renderSessionId = null;
  byId('task-prompt').value = ''; state.pendingContexts.set(submissionSessionId, []); renderContextChips(); resizeComposer();
  state.activeTaskSessionId = submissionSessionId; setRunning(true); setTaskState('运行中', 'running');
  const result = state.scenario === 'review'
    ? await call(() => window.win7Agent.submitReviewTask(submissionSessionId, prompt))
    : await call(() => window.win7Agent.submitTask(submissionSessionId, prompt, state.scenario, state.executionMode, refs));
  const task = result && (result.task || result.result);
  if (!task || !task.taskId) {
    const pendingCloseSessionId = state.pendingCloseSessionId;
    state.pendingCloseSessionId = null;
    setRunning(false); setTaskState('提交失败', 'failed');
    if (pendingCloseSessionId) void archiveSession(pendingCloseSessionId);
    return;
  }
  state.taskId = task.taskId;
  if (state.pendingCloseSessionId === submissionSessionId) {
    if (state.session && state.session.sessionId === submissionSessionId) setText('session-status', '正在停止任务，完成后关闭会话…');
    void cancelTask();
  }
}

function retryLastTask() { if (state.lastSubmission && !state.taskRunning) void runTask(state.lastSubmission); }

async function cancelTask() {
  if (!state.taskId || !state.activeTaskSessionId) return false;
  const taskId = state.taskId;
  const sessionId = state.activeTaskSessionId;
  state.cancelRequested = true;
  const previousRenderSessionId = state.renderSessionId; state.renderSessionId = sessionId;
  setTaskState('正在停止', 'running'); state.renderSessionId = previousRenderSessionId; byId('cancel-task').disabled = true;
  const result = await call(() => window.win7Agent.cancelTask(sessionId, taskId));
  if (!result) { state.cancelRequested = false; setRunning(state.taskRunning); return false; }
  return true;
}

function finishTask(label, className) {
  const finishedTaskSessionId = state.activeTaskSessionId;
  const pendingCloseSessionId = state.pendingCloseSessionId === finishedTaskSessionId ? state.pendingCloseSessionId : null;
  setTaskState(label, className); state.cancelRequested = false; setRunning(false); state.projector.close('TASK_TERMINAL'); state.activeTaskSessionId = null;
  if (pendingCloseSessionId) void archiveSession(pendingCloseSessionId);
}

function handleTaskEvent(event) {
  if (event && event.taskId && state.taskId && event.taskId !== state.taskId && event.eventKind === 'task.accepted' && !state.taskRunning) {
    // Product event sequences are scoped to a task. Recreate the queue before
    // accepting a new task's sequence-1 event after the previous task ended.
    resetTaskState();
  }
  if (!state.eventQueue) resetTaskState();
  const accepted = state.eventQueue.push(event);
  if (!accepted.accepted) { if (accepted.reason !== 'duplicate') appendTimeline('event.ignored', accepted.reason); return; }
  if (accepted.gap) appendTimeline('event.gap', '产品事件序列存在间隙');
  state.eventQueue.drain(32).forEach(processTaskEvent);
}

function processTaskEvent(event) {
  if (!event || !event.taskId) return;
  if (state.taskId && event.taskId !== state.taskId) {
    // A completed/failed Review can be followed by a new task in the same
    // session. Accept only that new task's authoritative start event and
    // reset the old projection; all other cross-task events remain denied.
    if (event.eventKind !== 'task.accepted' || state.taskRunning) return;
    resetTaskState();
  }
  if (!state.taskId && event.eventKind === 'task.accepted') state.taskId = event.taskId;
  const data = event.data || {};
  const eventSessionId = data.sessionId || state.activeTaskSessionId || (state.session && state.session.sessionId);
  state.renderSessionId = eventSessionId;
  appendTimeline(event.eventKind, data);
  const projection = state.projector.push(event);
  if (event.eventKind === 'gateway.delta') { if (projection.accepted) renderAssistantBlocks(); state.renderSessionId = null; return; }
  if (event.eventKind.indexOf('runner.') === 0) { renderRunnerEvent(event.eventKind, data); state.renderSessionId = null; return; }
  if (event.eventKind === 'task.accepted') {
    // Rehydrate the active-task affordances from the authoritative product
    // event. This also covers a Renderer refresh or a trusted Host submission
    // where the optimistic click path did not set the running flag first.
    state.activeTaskSessionId = eventSessionId;
    setRunning(true);
    setTaskState('运行中', 'running');
  }
  else if (event.eventKind === 'plan.presented') renderPlan(data);
  else if (event.eventKind === 'plan.approval_requested') renderPlanApproval(data);
  else if (event.eventKind === 'plan.awaiting_approval') setTaskState('等待计划批准', 'awaiting');
  else if (event.eventKind === 'tool.started' || event.eventKind === 'tool.completed') renderTool(event.eventKind, data, event);
  else if (event.eventKind === 'assistant.delta' && !state.projector.hasGatewayContent(event.taskId) && data.delta) createMessage('assistant', 'Agent', data.delta);
  else if (event.eventKind === 'file.reference') addFile(data.path);
  else if (event.eventKind === 'review.created' || event.eventKind === 'review.updated' || event.eventKind === 'review.validation_recorded' || event.eventKind === 'review.recovery') { state.reviewTaskId = event.taskId; renderReview(data.review); }
  else if (event.eventKind === 'review.awaiting_decision') setTaskState('等待 Review 决定', 'awaiting');
  else if (event.eventKind === 'review.approval_requested') { state.reviewApproval = data.approval; renderReview(data.review); setTaskState('等待 Review 应用', 'awaiting'); }
  else if (event.eventKind === 'review.applied') { state.reviewApproval = null; renderReview(data.review); setTaskState('已应用', 'completed'); }
  else if (event.eventKind === 'review.security_blocked') { state.reviewApproval = null; state.reviewTaskId = event.taskId; renderReview(data.review); }
  else if (event.eventKind === 'review.stale' || event.eventKind === 'review.apply_failed') { state.reviewApproval = null; renderReview(data.review); setTaskState(data.result && data.result.status === 'STALE' ? '目标已变化' : '应用失败', 'failed'); }
  else if (event.eventKind === 'approval.requested') renderWriteApproval(data);
  else if (event.eventKind === 'task.awaiting_approval') setTaskState('等待写入审批', 'awaiting');
  else if (event.eventKind === 'task.completed') { finishTask('已完成', 'completed'); renderUndoIfAvailable(); }
  else if (event.eventKind === 'task.cancelled') finishTask('已取消', 'cancelled');
  else if (event.eventKind === 'task.failed') {
    renderTaskError(data);
    finishTask('失败', 'failed');
    // Apply failures arrive before the terminal task.failed event. Re-render
    // after the running flag is cleared so RECOVERY_REQUIRED exposes its
    // explicit user recovery action.
    if (state.review && state.review.status === 'RECOVERY_REQUIRED') renderReview(state.review);
  }
  else if (event.eventKind === 'error.occurred') renderTaskError(data);
  state.renderSessionId = null;
}

function renderUndoIfAvailable() {
  if (state.scenario !== 'edit') return;
  const sourceTaskId = state.taskId;
  const card = addCard('tool-card completed', '受控写入已完成', '可撤销', '撤销会创建一笔新的精确计划，并再次请求审批。');
  addActions(card.card, [{ label: '准备撤销', onClick: async () => {
    if (!state.session || state.taskRunning) return;
    resetTaskState(); setRunning(true); setTaskState('准备撤销', 'running'); state.scenario = 'undo';
    const result = await call(() => window.win7Agent.prepareUndo(state.session.sessionId, sourceTaskId));
    if (result && result.task) state.taskId = result.task.taskId; else setRunning(false);
  } }]);
}

function renderRunnerEvent(kind, data) {
  if (!state.runnerLog) state.runnerLog = window.win7AgentRunnerLog.create(64 * 1024);
  if (kind === 'runner.started') { setText('runner-log-state', '运行中'); byId('runner-log-state').className = 'task-pill running'; setText('runner-log-summary', `${data.profileId || '受信 profile'} · ${data.cwd || ''}`); }
  else if (kind === 'runner.stdout' || kind === 'runner.stderr') {
    const stream = kind === 'runner.stdout' ? 'stdout' : 'stderr'; const update = state.runnerLog.append(stream, data.text || '');
    if (update.accepted) { setText(`runner-${stream}`, update.text); if (update.truncated) setText(`runner-${stream}-limit`, '已保留最近 64K'); }
  } else if (kind === 'runner.truncated') setText(`runner-${data.stream === 'stderr' ? 'stderr' : 'stdout'}-limit`, `已截断 ${Number(data.omittedBytes) || 0} bytes`);
  else if (kind === 'runner.finished') { setText('runner-log-state', data.status || 'failed'); byId('runner-log-state').className = `task-pill ${data.status === 'exited' ? 'completed' : 'failed'}`; setText('runner-log-summary', `${data.status || 'failed'} · ${Number(data.durationMs) || 0} ms`); }
}

function renderSessions(sessions) {
  state.sessions = sessions;
  byId('session-list').textContent = '';
  byId('archived-session-list').textContent = '';
  sessions.forEach((session) => {
    ensureConversationView(session.sessionId);
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'session-item'; button.textContent = session.label;
    button.title = session.workspacePath;
    button.setAttribute('aria-label', `${session.label}${session.status === 'ARCHIVED' ? '（归档，只读）' : ''}`);
    button.setAttribute('aria-current', state.session && session.sessionId === state.session.sessionId ? 'true' : 'false');
    if (session.status === 'ARCHIVED') item.classList.add('archived');
    if (state.session && session.sessionId === state.session.sessionId) item.classList.add('active');
    button.addEventListener('click', () => { state.session = session; activateConversation(session.sessionId); updateSessionUi(); renderSessions(sessions); toggleNavigation(false); void refreshRecovery(); void refreshSessionProjection(); if (session.status === 'ACTIVE') void refreshWorkspace(''); });
    item.appendChild(button);
    byId(session.status === 'ARCHIVED' ? 'archived-session-list' : 'session-list').appendChild(item);
  });
  const activeCount = sessions.filter((session) => session.status === 'ACTIVE').length;
  const archivedCount = sessions.length - activeCount;
  byId('session-empty').hidden = activeCount > 0;
  byId('archived-sessions').hidden = archivedCount === 0;
  setText('archived-session-count', archivedCount);
}

function updateSessionUi() {
  setText('session-label', state.session ? state.session.label : '未连接会话');
  setText('session-status', state.session ? `${state.session.status === 'ARCHIVED' ? '只读归档' : '当前会话'}：${state.session.label} · 产品级单前台任务` : '选择一个本地工作区开始。');
  const active = Boolean(state.session && state.session.status === 'ACTIVE');
  byId('run-task').disabled = !active || state.taskRunning || !byId('task-prompt').value.trim();
  byId('task-prompt').disabled = !active;
  byId('attach-text').disabled = !active || state.taskRunning;
  activateConversation(state.session && state.session.sessionId); renderContextChips(); setRunning(state.taskRunning);
  if (state.taskRunning) setTaskState(state.session && state.session.sessionId === state.activeTaskSessionId ? '运行中' : '另一会话运行中', 'running');
  else setTaskState('空闲', 'idle');
  renderFileActivity();
  updateEmptySession();
}

async function chooseWorkspace() {
  clearError(); const result = await call(() => window.win7Agent.selectWorkspace()); if (!result || !result.selected) return;
  state.workspacePath = result.selected.workspacePath; setText('workspace-name', result.selected.displayName); setText('workspace-path', state.workspacePath); byId('new-session').disabled = false;
  const created = await call(() => window.win7Agent.createSession(state.workspacePath));
  if (created && created.session) { state.session = created.session; ensureConversationView(state.session.sessionId); activateConversation(state.session.sessionId); updateSessionUi(); await refreshSessions(); await refreshRecovery(); await refreshSessionProjection(); await refreshWorkspace(''); await refreshDiagnostics(); }
}

async function createSession() { if (!state.workspacePath) return; const result = await call(() => window.win7Agent.createSession(state.workspacePath)); if (result && result.session) { state.session = result.session; ensureConversationView(state.session.sessionId); activateConversation(state.session.sessionId); updateSessionUi(); await refreshSessions(); await refreshSessionProjection(); await refreshWorkspace(''); } }

async function archiveSession(sessionId) {
  if (!sessionId) return false;
  const preserveActiveTask = window.win7AgentSessionUi.shouldPreserveActiveTask(state.taskRunning, state.activeTaskSessionId, sessionId);
  const result = await call(() => window.win7Agent.closeSession(sessionId));
  if (!result) {
    if (state.pendingCloseSessionId === sessionId) {
      state.pendingCloseSessionId = null;
      updateSessionUi();
    }
    return false;
  }
  await refreshSessions();
  const next = window.win7AgentSessionUi.selectNextSession(state.sessions, sessionId);
  state.session = next;
  if (!preserveActiveTask) {
    state.taskId = null;
    state.renderSessionId = null;
  }
  if (state.pendingCloseSessionId === sessionId) state.pendingCloseSessionId = null;
  if (!next && !preserveActiveTask) resetTaskState();
  renderSessions(state.sessions);
  updateSessionUi();
  await refreshSessionProjection();
  await refreshRecovery();
  if (next && next.status === 'ACTIVE') await refreshWorkspace('');
  return true;
}

async function closeSession() {
  const session = state.session;
  if (!session || session.status !== 'ACTIVE') return;
  const currentTask = window.win7AgentSessionUi.isCurrentTask(session, state.taskRunning, state.activeTaskSessionId);
  if (currentTask) {
    if (!state.taskId) {
      state.pendingCloseSessionId = session.sessionId;
      setText('session-status', '正在等待任务句柄，随后停止并关闭会话…');
      setRunning(true);
      return;
    }
    state.pendingCloseSessionId = session.sessionId;
    setText('session-status', '正在停止任务，完成后关闭会话…');
    setRunning(true);
    if (!await cancelTask()) state.pendingCloseSessionId = null;
    setRunning(state.taskRunning);
    return;
  }
  await archiveSession(session.sessionId);
}
async function refreshSessions() {
  const result = await call(() => window.win7Agent.listSessions());
  if (!result) return;
  const sessions = result.sessions || [];
  renderSessions(sessions);
  if (!state.session) {
    const initial = window.win7AgentSessionUi.selectNextSession(sessions, '');
    if (initial) {
      state.session = initial;
      state.workspacePath = initial.workspacePath || state.workspacePath;
      if (state.workspacePath) {
        setText('workspace-name', workspaceDisplayName(state.workspacePath));
        setText('workspace-path', state.workspacePath);
        byId('new-session').disabled = false;
      }
      renderSessions(sessions);
      activateConversation(initial.sessionId);
      updateSessionUi();
      await refreshRecovery();
      await refreshSessionProjection();
      if (initial.status === 'ACTIVE') await refreshWorkspace('');
    } else {
      updateSessionUi();
    }
  }
}

async function refreshRecovery() {
  if (!state.session || state.session.status !== 'ACTIVE' || typeof window.win7Agent.getRecovery !== 'function') { byId('recovery-panel').hidden = true; return; }
  const result = await call(() => window.win7Agent.getRecovery(state.session.sessionId)); if (!result || !result.recovery) return;
  const pending = result.recovery.pending; byId('recovery-panel').hidden = !pending;
  if (pending) setText('recovery-detail', `${pending.targetPath} 存在未完成事务（${pending.phase}），不会自动续跑。`);
}

async function restoreRecovery() { if (!state.session) return; const result = await call(() => window.win7Agent.restoreRecovery(state.session.sessionId)); if (result && result.result && result.result.restored) byId('recovery-panel').hidden = true; }

function renderDiagnostics(diagnostics) {
  const target = byId('diagnostics'); target.textContent = '';
  const capabilities = diagnostics.capabilities || {};
  [['Core', capabilities.core], ['State', capabilities.state], ['Workspace', capabilities.workspace], ['Gateway', capabilities.gateway], ['Runner', capabilities.runner], ['Terminal', capabilities.terminal], ['Git', capabilities.git]].forEach(([name, value]) => {
    const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = name; dd.textContent = value || '不可用'; target.appendChild(dt); target.appendChild(dd);
  });
}

async function refreshDiagnostics() { const result = await call(() => window.win7Agent.getDiagnostics()); if (result) { renderDiagnostics(result); setText('runtime-status', '运行正常'); byId('runtime-status').className = 'connection ready'; } }

async function refreshGatewaySettings() {
  if (!window.win7Agent.getSettings) return; const result = await call(() => window.win7Agent.getSettings()); const settings = result && result.settings; if (!settings) return;
  byId('gateway-mode').value = settings.mode || 'replay'; byId('gateway-url').value = settings.gatewayUrl || ''; byId('gateway-model').value = settings.model || 'deepseek-v4-flash'; byId('gateway-ca').value = settings.caBundlePath || ''; byId('gateway-api-key').value = '';
  renderCredentialPersistence(settings); renderGatewayMode(settings.mode || 'replay');
}

function renderCredentialPersistence(settings) {
  const credentials = settings.credentials || {}; byId('gateway-remember-api-key').checked = credentials.apiKeySaved === true; byId('gateway-remember-api-key').disabled = credentials.persistenceAvailable !== true; byId('clear-saved-api-key').disabled = credentials.apiKeySaved !== true;
  setText('gateway-settings-status', settings.mode === 'replay' ? '当前为 Replay，不建立网络连接。' : `${settings.mode} 已配置；API key ${credentials.apiKeySaved ? '由 DPAPI 保存' : '仅驻留内存'}。`);
}

function renderGatewayMode(mode) { byId('deepseek-network-warning').hidden = mode !== 'deepseek'; if (mode === 'deepseek') byId('gateway-url').value = 'https://api.deepseek.com'; byId('gateway-url').readOnly = mode === 'deepseek'; byId('gateway-model').disabled = mode === 'replay'; }

async function saveGatewaySettings() {
  const values = window.win7AgentGatewaySettingsPayload.build({ mode: byId('gateway-mode').value, gatewayUrl: byId('gateway-url').value, model: byId('gateway-model').value, caBundlePath: byId('gateway-ca').value, apiKey: byId('gateway-api-key').value, rememberApiKey: byId('gateway-remember-api-key').checked });
  const result = await call(() => window.win7Agent.setSettings(values)); if (result && result.settings) { byId('gateway-api-key').value = ''; renderCredentialPersistence(result.settings); renderGatewayMode(result.settings.mode); await refreshDiagnostics(); }
}

async function clearSavedApiKey() { const result = await call(() => window.win7Agent.clearSavedApiKey()); if (result && result.settings) { byId('gateway-mode').value = 'replay'; renderCredentialPersistence(result.settings); renderGatewayMode('replay'); } }

function resizeComposer() { const input = byId('task-prompt'); input.style.height = 'auto'; input.style.height = `${Math.min(170, input.scrollHeight)}px`; byId('run-task').disabled = state.taskRunning || !state.session || state.session.status !== 'ACTIVE' || !input.value.trim(); }

function toggleDrawer(id, open) {
  const drawer = byId(id);
  if (!drawer) return;
  const workbench = document.querySelector('.workbench');
  if (open) {
    if (byId('navigation-rail').classList.contains('open')) toggleNavigation(false);
    if (byId('inspector').classList.contains('open')) toggleInspector(false);
    state.lastFocusedElement = document.activeElement;
    drawer.hidden = false;
    if (workbench) { workbench.inert = true; workbench.setAttribute('aria-hidden', 'true'); }
    const closeButton = drawer.querySelector('.drawer-panel [data-close]');
    if (closeButton) closeButton.focus();
    return;
  }
  drawer.hidden = true;
  if (workbench) { workbench.inert = false; workbench.removeAttribute('aria-hidden'); }
  if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === 'function') state.lastFocusedElement.focus();
  state.lastFocusedElement = null;
}

function trapDrawerFocus(event, drawer) {
  if (!drawer || event.key !== 'Tab') return false;
  const panel = drawer.querySelector('.drawer-panel');
  if (!panel) return false;
  const focusable = Array.from(panel.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
    .filter((node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true');
  if (focusable.length === 0) return false;
  const first = focusable[0]; const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
    event.preventDefault(); last.focus(); return true;
  }
  if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
    event.preventDefault(); first.focus(); return true;
  }
  return false;
}

function narrowInspector() { return window.matchMedia && window.matchMedia('(max-width: 1050px)').matches; }
function narrowNavigation() { return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }

function toggleNavigation(open) {
  const rail = byId('navigation-rail'); const backdrop = byId('navigation-backdrop');
  if (!rail || !backdrop) return;
  const shouldOpen = Boolean(open && narrowNavigation());
  if (shouldOpen) {
    state.lastNavigationFocusedElement = document.activeElement;
    rail.classList.add('open'); backdrop.hidden = false;
  } else {
    rail.classList.remove('open'); backdrop.hidden = true;
  }
  byId('open-navigation').setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) byId('close-navigation').focus();
  else if (state.lastNavigationFocusedElement && typeof state.lastNavigationFocusedElement.focus === 'function') {
    state.lastNavigationFocusedElement.focus(); state.lastNavigationFocusedElement = null;
  }
}

function toggleInspector(open, focusTarget) {
  const inspector = byId('inspector');
  const backdrop = byId('inspector-backdrop');
  if (!inspector || !backdrop) return;
  const shouldOpen = Boolean(open && narrowInspector());
  if (shouldOpen) {
    if (byId('navigation-rail').classList.contains('open')) toggleNavigation(false);
    state.lastInspectorFocusedElement = document.activeElement;
    inspector.classList.add('open');
    backdrop.hidden = false;
  } else {
    inspector.classList.remove('open');
    backdrop.hidden = true;
  }
  byId('open-inspector').setAttribute('aria-expanded', String(shouldOpen));
  byId('review-nav').setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) {
    const target = focusTarget || byId('close-inspector');
    if (target && typeof target.focus === 'function') target.focus();
  } else if (state.lastInspectorFocusedElement && typeof state.lastInspectorFocusedElement.focus === 'function') {
    state.lastInspectorFocusedElement.focus();
    state.lastInspectorFocusedElement = null;
  }
}

async function initialize() {
  if (!window.win7Agent || typeof window.win7Agent.onTaskEvent !== 'function') { showError({ message: '可信 Preload API 不可用。' }); return; }
  resetTaskState();
  byId('workspace-select').addEventListener('click', chooseWorkspace); byId('new-session').addEventListener('click', createSession); byId('close-session').addEventListener('click', closeSession); byId('close-session-header').addEventListener('click', closeSession);
  byId('empty-session-action').addEventListener('click', () => { if (state.workspacePath) void createSession(); else void chooseWorkspace(); });
  byId('edit-goal').addEventListener('click', editGoal); byId('achieve-goal').addEventListener('click', () => resolveGoal('ACHIEVED')); byId('abandon-goal').addEventListener('click', () => resolveGoal('ABANDONED'));
  byId('attach-text').addEventListener('click', attachText);
  byId('workspace-up').addEventListener('click', () => { const parts = state.explorerPath.split(/[\\/]+/).filter(Boolean); parts.pop(); void refreshWorkspace(parts.join('/')); });
  byId('viewer-search').addEventListener('input', renderViewerLines);
  byId('review-nav').addEventListener('click', () => { byId('review-panel').hidden = false; toggleInspector(true, byId('review-panel')); byId('review-panel').scrollIntoView({ block: 'nearest' }); });
  byId('review-accept').addEventListener('click', () => decideReviewFile('ACCEPTED'));
  byId('review-reject').addEventListener('click', () => decideReviewFile('REJECTED'));
  byId('review-issue-approval').addEventListener('click', issueReviewApproval);
  byId('review-apply').addEventListener('click', applyReview);
  byId('review-validation-not-run').addEventListener('click', recordReviewNotRun);
  byId('viewer-jump-go').addEventListener('click', () => { const line = Number(byId('viewer-jump').value); const row = byId('code-viewer').querySelector(`[data-line="${line}"]`); if (row) { row.scrollIntoView({ block: 'center' }); selectViewerLine(line, false); } });
  byId('explain-selection').addEventListener('click', () => primePromptFromViewer('解释'));
  byId('fix-selection').addEventListener('click', () => primePromptFromViewer('修复'));
  byId('add-selection-context').addEventListener('click', () => { const ref = viewerRef(); if (ref) addContext(ref); });
  byId('run-task').addEventListener('click', () => runTask()); byId('cancel-task').addEventListener('click', cancelTask); byId('mode-direct').addEventListener('click', () => selectMode('direct')); byId('mode-plan').addEventListener('click', () => selectMode('plan'));
  byId('task-prompt').addEventListener('input', resizeComposer); byId('task-prompt').addEventListener('keydown', (event) => window.win7AgentComposerController.handleKeydown(event, () => runTask()));
  document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { byId('task-prompt').value = button.dataset.prompt; resizeComposer(); byId('task-prompt').focus(); }));
  byId('open-settings').addEventListener('click', () => toggleDrawer('settings-drawer', true)); byId('open-diagnostics').addEventListener('click', () => toggleDrawer('diagnostics-drawer', true));
  byId('open-navigation').addEventListener('click', () => toggleNavigation(true)); byId('close-navigation').addEventListener('click', () => toggleNavigation(false)); byId('navigation-backdrop').addEventListener('click', () => toggleNavigation(false));
  byId('open-inspector').addEventListener('click', () => toggleInspector(true)); byId('close-inspector').addEventListener('click', () => toggleInspector(false)); byId('inspector-backdrop').addEventListener('click', () => toggleInspector(false));
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => toggleDrawer(button.dataset.close, false)));
  document.addEventListener('keydown', (event) => {
    const drawer = Array.from(document.querySelectorAll('.drawer:not([hidden])')).pop();
    if (drawer && trapDrawerFocus(event, drawer)) return;
    if (event.key !== 'Escape') return;
    if (drawer) { event.preventDefault(); toggleDrawer(drawer.id, false); return; }
    if (byId('inspector').classList.contains('open')) { event.preventDefault(); toggleInspector(false); }
    else if (byId('navigation-rail').classList.contains('open')) { event.preventDefault(); toggleNavigation(false); }
  });
  window.addEventListener('resize', () => { if (!narrowInspector()) toggleInspector(false); if (!narrowNavigation()) toggleNavigation(false); });
  byId('restore-recovery').addEventListener('click', restoreRecovery); byId('refresh-diagnostics').addEventListener('click', refreshDiagnostics); byId('save-gateway-settings').addEventListener('click', saveGatewaySettings); byId('clear-saved-api-key').addEventListener('click', clearSavedApiKey); byId('gateway-mode').addEventListener('change', () => renderGatewayMode(byId('gateway-mode').value));
  window.win7Agent.onTaskEvent(handleTaskEvent);
  updateEmptySession(); await refreshDiagnostics(); await refreshGatewaySettings(); await refreshSessions(); window.win7Agent.signalReady();
}

window.addEventListener('DOMContentLoaded', initialize, { once: true });
