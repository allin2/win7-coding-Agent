'use strict';

/**
 * A9 Alpha 1 unified workbench.
 *
 * Renderer capabilities stay limited to the frozen preload API. This file does
 * not access Node, the filesystem, child processes, credentials, or networking.
 *
 * ADR-0114：对话流按事件渲染过程（model_note / plan_updated / 工具活动组 /
 * approval 留痕），事件以 eventId 去重增量并入；历史过程经 a9.events.query
 * 有界回看。所有不可信文本一律 textContent，单条说明 16 KB、单条工具输出
 * 8 KB 截断并明示。
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
  const NOTE_LIMIT = 16 * 1024;
  const TOOL_OUTPUT_LIMIT = 8 * 1024;
  const TERMINAL_OUTCOMES = new Set([
    'completed', 'completed_with_warnings', 'blocked', 'failed', 'cancelled', 'interrupted',
  ]);
  const OUTCOME_LABELS = Object.freeze({
    completed: '完成',
    completed_with_warnings: '完成（有警告）',
    blocked: '受阻',
    failed: '失败',
    cancelled: '已取消',
    interrupted: '已中断',
    needs_approval: '等待批准',
    running: '运行中',
  });
  const state = {
    snapshot: null,
    explorerSessionId: null,
    explorerPath: '',
    viewer: null,
    running: false,
    approvalDecision: null,
    lastFocused: null,
    providerHydratedSignature: null,
    conversationSignature: null,
    renderedConversationId: null,
    activeConversationId: null,
    draftHydratedConversationId: null,
    draftTimer: null,
    draftSaving: false,
    undoConfirmations: Object.create(null),
    // ADR-0114：事件数据层与过程渲染状态。
    inspectorEvents: new Map(),
    turnEvents: new Map(),
    turnIdToFactTask: new Map(),
    activeTurnId: null,
    eventMaxId: 0,
    eventsTruncated: false,
    eventsBeforeId: null,
    eventsError: '',
    eventsLoading: false,
    streamDom: new Map(),
    truncatedNote: null,
    localRequest: null,
    searchQuery: '',
    streamFollow: true,
    liveTimer: null,
    turnStartAt: 0,
    lastEventAt: 0,
    pendingToolLabel: null,
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
  /** ADR-0114 显示上限：截断必须明示，不静默吞内容。 */
  function clampText(value, limit) {
    const content = String(value == null ? '' : value);
    if (content.length <= limit) return content;
    return `${content.slice(0, limit)}\n[已截断；完整内容见持久化事件与日志]`;
  }
  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
  }
  function runtimeDiagnostic(snapshot) {
    const diagnostic = snapshot && snapshot.diagnostics ? snapshot.diagnostics : {};
    const code = String(diagnostic.code || (snapshot && snapshot.status) || 'A9_RUNTIME_RESTRICTED').slice(0, 100);
    const rawDetail = String(diagnostic.detail || diagnostic.hint || diagnostic.error || '').slice(0, 500);
    const detail = rawDetail
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1***redacted***@')
      .replace(/((?:authorization|api[-_]?key|password|secret|access[-_]?token)\s*[:=]\s*)(?:bearer\s+)?[^\s,;&]+/gi, '$1***redacted***');
    return detail ? `${code}: ${detail}` : code;
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
    const runtimeUnavailable = Boolean(snapshot && snapshot.status !== 'ready');
    const blockedMode = !snapshot || runtimeUnavailable || !SUPPORTED_MODES.has(snapshot.mode);
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
    if (runtimeUnavailable) text('session-status', `Runtime 初始化受限：${runtimeDiagnostic(snapshot)}。请打开诊断查看原始运行时事实。`);
    else if (!snapshot) text('session-status', '选择一个本地工作区后再开始任务。');
    else if (blockedMode) text('session-status', '先为当前工作区明确选择 Full Access 或 Read Only。');
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

  // ------------------------------------------------------------------
  // ADR-0114 事件数据层：归一化、去重并入、按轮次组织。
  // ------------------------------------------------------------------

  function normalizeTimelineEvent(raw) {
    if (!raw || typeof raw.type !== 'string') return null;
    const eventId = Number(raw.eventId);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) return null;
    return {
      eventId,
      type: raw.type,
      turnId: raw.turnId || null,
      timestamp: raw.timestamp || '',
      data: raw.data && typeof raw.data === 'object' ? raw.data : {},
    };
  }

  function normalizeQueriedEvent(raw) {
    if (!raw) return null;
    const eventId = Number(raw.eventId);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) return null;
    const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
    const type = payload && typeof payload.type === 'string'
      ? payload.type
      : (typeof raw.eventType === 'string' ? raw.eventType : '');
    if (!type) return null;
    const data = payload && payload.data && typeof payload.data === 'object'
      ? payload.data
      : (payload || {});
    return {
      eventId,
      type,
      turnId: raw.turnId || null,
      timestamp: raw.createdAt || '',
      data,
    };
  }

  function ingestEvents(events) {
    let changed = false;
    for (const event of events) {
      if (!event) continue;
      if (!state.inspectorEvents.has(event.eventId)) {
        state.inspectorEvents.set(event.eventId, event);
        changed = true;
      }
      if (event.eventId > state.eventMaxId) state.eventMaxId = event.eventId;
      if (event.type === 'turn_started' && event.turnId) {
        // 多个轮次同窗时以时间线顺序的最后一个 turn_started 为当前轮。
        state.activeTurnId = event.turnId;
      }
      if (!event.turnId) continue;
      const bucket = state.turnEvents.get(event.turnId);
      if (bucket) {
        if (bucket.ids.has(event.eventId)) continue;
        bucket.ids.add(event.eventId);
        bucket.events.push(event);
        bucket.events.sort((a, b) => a.eventId - b.eventId);
      } else {
        state.turnEvents.set(event.turnId, { ids: new Set([event.eventId]), events: [event] });
      }
      if (event.type === 'tool_start') state.pendingToolLabel = toolHeadline(event.data);
      if (event.type === 'tool_end') state.pendingToolLabel = null;
      state.lastEventAt = Date.now();
      changed = true;
    }
    return changed;
  }

  function ingestTimelineEvents(timeline) {
    return ingestEvents((timeline || []).map(normalizeTimelineEvent).filter(Boolean));
  }

  function eventsForTurn(turnId) {
    const bucket = turnId ? state.turnEvents.get(turnId) : null;
    return bucket ? bucket.events : [];
  }

  function eventsForInspector() {
    return Array.from(state.inspectorEvents.values()).sort((a, b) => a.eventId - b.eventId);
  }

  function resetConversationEvents() {
    state.inspectorEvents = new Map();
    state.turnEvents = new Map();
    state.turnIdToFactTask = new Map();
    state.activeTurnId = null;
    state.eventMaxId = 0;
    state.eventsTruncated = false;
    state.eventsBeforeId = null;
    state.eventsError = '';
    state.eventsLoading = false;
    state.streamDom = new Map();
    state.pendingToolLabel = null;
    state.truncatedNote = null;
    const stream = el('a9-task-stream');
    stream.textContent = '';
  }

  /**
   * 历史过程回看：会话加载/切换/轮次结束后拉取最近 300 条事件；截断以
   * hasMore 明示。失败不阻塞事实渲染（fail-open 于展示层，不涉及写入）。
   */
  async function loadConversationEvents(older = false) {
    if (!a9 || !state.activeConversationId) return;
    if (state.eventsLoading) return;
    const requestedConversationId = state.activeConversationId;
    state.eventsLoading = true;
    try {
      const response = await a9.queryEvents({ conversationId: requestedConversationId, limit: 300,
        ...(older && state.eventsBeforeId ? { beforeEventId: state.eventsBeforeId } : {}) });
      if (requestedConversationId !== state.activeConversationId) return;
      if (!response || response.ok !== true) throw new Error('EVENT_HISTORY_UNAVAILABLE');
      const normalized = (response.events || []).map(normalizeQueriedEvent).filter(Boolean);
      ingestEvents(normalized);
      if (older || state.eventsBeforeId === null) {
        state.eventsTruncated = response.hasMore === true;
        if (normalized.length) state.eventsBeforeId = normalized[0].eventId;
      }
      state.eventsError = '';
    } catch (_error) {
      if (requestedConversationId === state.activeConversationId) {
        state.eventsError = '过程记录加载失败；已有请求和结果仍保留。';
      }
    } finally {
      if (requestedConversationId === state.activeConversationId) {
        state.eventsLoading = false;
        state.conversationSignature = null;
        if (state.snapshot) {
          renderTimeline();
          renderConversation(state.snapshot);
        }
      }
    }
  }

  /** 事实（taskId）与轮次（turnId）在执行期间可能尚未关联；此处补齐映射。 */
  function resolveTurnId(fact) {
    if (fact.turnId) {
      state.turnIdToFactTask.set(fact.turnId, fact.taskId);
      return fact.turnId;
    }
    for (const entry of state.turnIdToFactTask.entries()) {
      if (entry[1] === fact.taskId) return entry[0];
    }
    if ((fact.outcome === 'running' || fact.outcome === 'needs_approval') && state.activeTurnId) {
      state.turnIdToFactTask.set(state.activeTurnId, fact.taskId);
      return state.activeTurnId;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // 友好文案：工具活动与时间线标签（描述性文本，不虚构动作）。
  // ------------------------------------------------------------------

  function toolHeadline(data) {
    const name = data && data.toolName ? String(data.toolName) : 'tool';
    const args = (data && data.args) || {};
    switch (name) {
      case 'read': return `读取 ${args.path || ''}`.trim();
      case 'list': return `列出 ${args.path || '.'}`;
      case 'search': return `搜索 ${args.pattern || ''}`.trim();
      case 'write': return `写入 ${args.path || ''}`.trim();
      case 'edit': return `编辑 ${args.path || ''}`.trim();
      case 'copy': return `复制 ${args.source || ''} → ${args.destination || ''}`;
      case 'move': return `移动 ${args.source || ''} → ${args.destination || ''}`;
      case 'delete': return `删除 ${args.path || ''}`.trim();
      case 'shell': return `运行命令 ${String(args.command || '').slice(0, 80)}`;
      case 'update_plan': return '更新计划';
      default: return name;
    }
  }

  function toolDetailText(data) {
    const parts = [];
    if (data.error) parts.push(String(data.error));
    if (data.result) parts.push(String(data.result));
    const shell = data.shell;
    if (shell && typeof shell === 'object') {
      if (typeof shell.stdout === 'string' && shell.stdout) parts.push(shell.stdout);
      if (typeof shell.stderr === 'string' && shell.stderr) parts.push(`[stderr]\n${shell.stderr}`);
      if (shell.exitCode !== undefined) parts.push(`exit=${shell.exitCode}`);
      if (shell.truncated) parts.push('[输出预览已截断；完整字节见日志路径]');
    }
    if (data.externalChanges && Array.isArray(data.externalChanges) && data.externalChanges.length > 0) {
      parts.push(`外部文件变更 ${data.externalChanges.length} 处`);
    }
    return parts.join('\n').trim();
  }

  function toolEndStatus(data) {
    const shell = data.shell || {};
    if (data.residueRisk || shell.residueRisk) return ['failed', '清理未确认'];
    if (['cancelled', 'canceled', 'interrupted'].includes(shell.status)) return ['stopped', '已停止'];
    if (data.error || ['failed', 'error', 'timeout', 'timed_out'].includes(shell.status)
        || (typeof shell.exitCode === 'number' && shell.exitCode !== 0)
        || /^Tool execution error:|^Error:/i.test(String(data.result || ''))) return ['failed', '失败'];
    if (data.denied) return ['stopped', '已停止'];
    if (data.shell && shell.status !== 'completed' && shell.status !== 'success' && shell.exitCode !== 0) return ['interrupted', '结果未确认'];
    return ['success', '成功'];
  }

  function timelineEntryLabel(event) {
    const data = event.data || {};
    const shell = data.shell && data.shell.schemaVersion === 1 ? data.shell : null;
    switch (event.type) {
      case 'turn_started': return '任务开始';
      case 'turn_completed': return `任务完成 · ${data.outcome || '-'}`;
      case 'turn_failed': return `任务失败 · ${String(data.error || '').slice(0, 120)}`;
      case 'model_note': return '模型说明';
      case 'model_chunk': return '模型输出（汇总）';
      case 'plan_updated': return '更新计划';
      case 'approval_required': return `请求批准 · ${data.toolName || '-'}`;
      case 'approval_resolved': return `审批${data.decision === 'approved' ? '已批准' : '已拒绝'} · ${data.toolName || '-'}`;
      case 'tool_start': return `${toolHeadline(data)} …`;
      case 'tool_end':
        if (shell && shell.exitCode !== undefined) return `${toolHeadline(data)} · exit=${shell.exitCode}`;
        if (data.error) return `${toolHeadline(data)} · 失败`;
        if (data.denied) return `${toolHeadline(data)} · 已拒绝`;
        return toolHeadline(data);
      default: return event.type || 'event';
    }
  }

  // ------------------------------------------------------------------
  // 轮次渲染：按事实顺序维护轮次块，事件增量追加（保留展开态与滚动位置）。
  // ------------------------------------------------------------------

  function ensureTurnBlock(key) {
    let block = state.streamDom.get(key);
    if (block) return block;
    const stream = el('a9-task-stream');
    const rootArticle = document.createElement('article');
    rootArticle.className = 'turn-block';
    rootArticle.dataset.turnKey = key;
    const request = document.createElement('div');
    request.className = 'turn-request';
    const requestHead = document.createElement('div');
    requestHead.className = 'turn-request-head';
    const requestLabel = document.createElement('strong');
    requestLabel.textContent = 'REQUEST';
    const requestTime = document.createElement('span');
    requestHead.appendChild(requestLabel);
    requestHead.appendChild(requestTime);
    const requestBody = document.createElement('div');
    requestBody.className = 'turn-request-body';
    request.appendChild(requestHead);
    request.appendChild(requestBody);
    const progress = document.createElement('div');
    progress.className = 'turn-progress';
    rootArticle.appendChild(request);
    rootArticle.appendChild(progress);
    stream.appendChild(rootArticle);
    block = {
      key,
      root: rootArticle,
      requestTime,
      requestBody,
      progressEl: progress,
      renderedEvents: 0,
      renderedIds: [],
      groupEl: null,
      groupItemsEl: null,
      groupCount: 0,
      pendingItems: new Map(),
      local: key === '__local__',
      legacyEl: null,
      outcomeEl: null,
      outcomeLabelEl: null,
      outcomeMetaEl: null,
      outcomeBodyEl: null,
      outcomeSig: '',
    };
    state.streamDom.set(key, block);
    return block;
  }

  function updateGroupSummary(block) {
    if (block.groupEl && block.groupEl.firstChild) {
      block.groupEl.firstChild.textContent = `工具活动 · ${block.groupCount} 项`;
    }
  }

  function ensureActivityGroup(block) {
    if (block.groupEl) return block.groupEl;
    const group = document.createElement('details');
    group.className = 'activity-group';
    if (state.running) group.open = true;
    const summary = document.createElement('summary');
    summary.textContent = '工具活动';
    const items = document.createElement('ul');
    items.className = 'activity-items';
    group.appendChild(summary);
    group.appendChild(items);
    block.progressEl.appendChild(group);
    block.groupEl = group;
    block.groupItemsEl = items;
    block.groupCount = 0;
    block.pendingItems = new Map();
    return group;
  }

  function closeActivityGroup(block) {
    block.groupEl = null;
    block.groupItemsEl = null;
    block.pendingItems = new Map();
  }

  function addActivityItem(block, data, status, label) {
    ensureActivityGroup(block);
    const li = document.createElement('li');
    li.className = 'activity-item';
    const head = document.createElement('div');
    head.className = 'activity-item-head';
    const tool = document.createElement('span');
    tool.className = 'activity-tool';
    tool.textContent = toolHeadline(data);
    tool.title = data.toolName || '';
    const tag = document.createElement('span');
    tag.className = `status-tag ${status}`;
    tag.textContent = label;
    head.appendChild(tool);
    head.appendChild(tag);
    li.appendChild(head);
    block.groupItemsEl.appendChild(li);
    block.groupCount += 1;
    updateGroupSummary(block);
    return { li, tag };
  }

  function attachActivityDetail(item, data) {
    const detailText = toolDetailText(data);
    if (!detailText) return;
    const detail = document.createElement('pre');
    detail.className = 'activity-detail';
    detail.textContent = clampText(detailText, TOOL_OUTPUT_LIMIT);
    item.li.appendChild(detail);
  }

  function appendEventNode(block, event) {
    const data = event.data || {};
    switch (event.type) {
      case 'model_note': {
        closeActivityGroup(block);
        const note = document.createElement('p');
        note.className = 'note-line';
        note.textContent = clampText(data.content, NOTE_LIMIT);
        block.progressEl.appendChild(note);
        break;
      }
      case 'plan_updated': {
        closeActivityGroup(block);
        block.progressEl.appendChild(buildPlanCard(data));
        break;
      }
      case 'approval_required': {
        closeActivityGroup(block);
        block.progressEl.appendChild(buildApprovalRecord('pending', `需要批准：${data.toolName || 'operation'}`,
          data.summary || data.reason || ''));
        break;
      }
      case 'approval_resolved': {
        closeActivityGroup(block);
        const approved = data.decision === 'approved';
        block.progressEl.appendChild(buildApprovalRecord(approved ? 'approved' : 'denied',
          `${approved ? '已批准' : '已拒绝'}：${data.toolName || 'operation'}`,
          data.decidedAt ? new Date(data.decidedAt).toLocaleString() : ''));
        break;
      }
      case 'tool_start': {
        ensureActivityGroup(block);
        if (!block.groupEl.dataset.eventId) block.groupEl.dataset.eventId = String(event.eventId);
        const item = addActivityItem(block, data, 'running', '执行中');
        if (data.callId) block.pendingItems.set(String(data.callId), item);
        else block.pendingItems.set('__last__', item);
        break;
      }
      case 'tool_end': {
        if (!data.toolName) break; // 仅 externalChanges 的事实不构成工具项
        const key = data.callId ? String(data.callId) : '__last__';
        const item = block.pendingItems.get(key) || (data.callId ? block.pendingItems.get('__last__') : null);
        if (item) {
          block.pendingItems.delete(key);
          const [status, label] = toolEndStatus(data);
          item.tag.className = `status-tag ${status}`;
          item.tag.textContent = label;
          attachActivityDetail(item, data);
        } else {
          // 无配对 start（历史/恢复数据）时也如实展示终态。
          const [status, label] = toolEndStatus(data);
          addActivityItem(block, data, status, label, true);
          const last = Array.from(block.groupItemsEl.children).pop();
          if (last) attachActivityDetail({ li: last, tag: null }, data);
        }
        break;
      }
      default:
        break;
    }
  }

  function buildPlanCard(data) {
    const card = document.createElement('div');
    card.className = 'plan-card';
    const title = document.createElement('p');
    title.className = 'plan-title';
    title.textContent = 'PLAN';
    card.appendChild(title);
    const steps = document.createElement('ol');
    steps.className = 'plan-steps';
    (Array.isArray(data && data.plan) ? data.plan : []).forEach((line) => {
      const step = document.createElement('li');
      step.className = 'plan-step';
      step.textContent = String(line || '');
      steps.appendChild(step);
    });
    card.appendChild(steps);
    if (data && data.explanation) {
      const explanation = document.createElement('p');
      explanation.className = 'plan-explanation';
      explanation.textContent = clampText(data.explanation, 2000);
      card.appendChild(explanation);
    }
    return card;
  }

  function buildApprovalRecord(kind, headline, detailText) {
    const record = document.createElement('p');
    record.className = `approval-record ${kind}`;
    const body = document.createElement('span');
    body.className = 'approval-record-body';
    const strong = document.createElement('strong');
    strong.textContent = headline;
    body.appendChild(strong);
    if (detailText) {
      const detail = document.createElement('span');
      detail.className = 'approval-record-detail';
      detail.textContent = detailText;
      body.appendChild(detail);
    }
    record.appendChild(body);
    return record;
  }

  function projectOutcome(fact, events) {
    let outcome = null;
    let verification = 'not_applicable';
    let message = '';
    for (const event of events) {
      if (event.type === 'turn_completed') {
        outcome = event.data.outcome || 'completed';
        verification = event.data.verification || 'not_applicable';
        message = event.data.finalMessage || '';
      } else if (event.type === 'turn_failed') {
        outcome = 'failed';
        message = event.data.error ? `模型调用失败：${event.data.error}` : '';
      }
    }
    if (!outcome && fact && TERMINAL_OUTCOMES.has(fact.outcome)) {
      outcome = fact.outcome;
      verification = fact.verification || 'not_applicable';
      message = fact.finalMessage || (fact.outcome === 'interrupted'
        ? '应用重启后恢复了中断事实；未重放模型、工具或旧审批。'
        : '');
    }
    return outcome ? { outcome, verification, message } : null;
  }

  function updateOutcomeCard(block, fact, events) {
    const projection = projectOutcome(fact, events);
    if (!projection) {
      if (block.outcomeEl) {
        block.outcomeEl.remove();
        block.outcomeEl = null;
        block.outcomeSig = '';
      }
      return;
    }
    const { outcome, verification, message } = projection;
    const signature = JSON.stringify([outcome, verification, message]);
    if (block.outcomeSig === signature) return;
    block.outcomeSig = signature;
    if (!block.outcomeEl) {
      const card = document.createElement('div');
      const head = document.createElement('div');
      head.className = 'outcome-head';
      const label = document.createElement('strong');
      const meta = document.createElement('span');
      head.appendChild(label);
      head.appendChild(meta);
      const body = document.createElement('div');
      body.className = 'outcome-body';
      card.appendChild(head);
      card.appendChild(body);
      block.root.appendChild(card);
      block.outcomeEl = card;
      block.outcomeLabelEl = label;
      block.outcomeMetaEl = meta;
      block.outcomeBodyEl = body;
    }
    const variant = outcome === 'failed' ? 'fail' : outcome === 'completed' ? '' : 'warn';
    block.outcomeEl.className = `outcome-card ${variant}`.trim();
    block.outcomeLabelEl.textContent = OUTCOME_LABELS[outcome] || outcome;
    block.outcomeMetaEl.textContent = `${verification}${fact && fact.updatedAt ? ` · ${new Date(fact.updatedAt).toLocaleTimeString()}` : ''}`;
    block.outcomeBodyEl.textContent = clampText(message || '任务已返回结果。', NOTE_LIMIT);
  }

  function updateTurnBlock(block, fact, events) {
    let expanded = null;
    // Earlier pages can prepend events. Rebuild only the affected process block.
    if (block.renderedIds.some((id, index) => !events[index] || events[index].eventId !== id)) {
      expanded = new Set(Array.from(block.progressEl.querySelectorAll('details[open]')).map(node => node.dataset.eventId));
      block.progressEl.textContent = '';
      block.renderedEvents = 0;
      block.renderedIds = [];
      block.pendingItems = new Map();
      block.groupEl = null;
      block.groupItemsEl = null;
      block.groupCount = 0;
      block.legacyEl = null;
    }
    if (fact) {
      if (fact.requestPrompt) block.requestBody.textContent = clampText(fact.requestPrompt, NOTE_LIMIT);
      if (fact.createdAt) block.requestTime.textContent = new Date(fact.createdAt).toLocaleString();
    }
    for (; block.renderedEvents < events.length; block.renderedEvents += 1) {
      appendEventNode(block, events[block.renderedEvents]);
      block.renderedIds.push(events[block.renderedEvents].eventId);
    }
    if (expanded) block.progressEl.querySelectorAll('details').forEach(node => {
      if (expanded.has(node.dataset.eventId)) node.open = true;
    });
    if (events.length && block.legacyEl) { block.legacyEl.remove(); block.legacyEl = null; }
    const terminal = (fact && TERMINAL_OUTCOMES.has(fact.outcome))
      || events.some((event) => event.type === 'turn_completed' || event.type === 'turn_failed');
    if (terminal) {
      block.pendingItems.forEach((item) => {
        item.tag.className = 'status-tag interrupted';
        item.tag.textContent = '已中断';
      });
      block.pendingItems = new Map();
      closeActivityGroup(block);
    }
    if (!block.local && !block.legacyEl && events.length === 0 && fact && TERMINAL_OUTCOMES.has(fact.outcome)) {
      const note = document.createElement('p');
      note.className = 'legacy-note';
      note.textContent = '历史记录未包含过程。';
      block.progressEl.appendChild(note);
      block.legacyEl = note;
    }
    updateOutcomeCard(block, fact, events);
  }

  function renderConversation(snapshot) {
    const facts = snapshot.conversation || [];
    const signature = JSON.stringify([
      snapshot.activeConversationId,
      state.eventMaxId,
      state.eventsTruncated,
      state.localRequest ? [state.localRequest.prompt, state.localRequest.at] : 0,
      facts.map((fact) => [
        fact.taskId, fact.turnId, fact.outcome, fact.updatedAt,
        String(fact.requestPrompt || '').length, String(fact.finalMessage || '').length,
      ]),
    ]);
    if (state.conversationSignature === signature) return;
    state.conversationSignature = signature;
    if (state.renderedConversationId !== snapshot.activeConversationId) {
      state.renderedConversationId = snapshot.activeConversationId;
      resetConversationEvents();
    }
    const stream = el('a9-task-stream');
    if (state.localRequest) {
      const latest = facts.length > 0 ? facts[facts.length - 1] : null;
      if (latest && latest.requestPrompt === state.localRequest.prompt) state.localRequest = null;
    }
    let latestProjection = null;
    facts.forEach((fact) => {
      const block = ensureTurnBlock(fact.taskId || `fact:${facts.indexOf(fact)}`);
      const turnId = resolveTurnId(fact);
      const events = turnId ? eventsForTurn(turnId) : [];
      updateTurnBlock(block, fact, events);
      latestProjection = projectOutcome(fact, events);
    });
    if (state.localRequest) {
      const block = ensureTurnBlock('__local__');
      block.requestBody.textContent = clampText(state.localRequest.prompt, NOTE_LIMIT);
      block.requestTime.textContent = new Date(state.localRequest.at).toLocaleTimeString();
      const events = state.activeTurnId ? eventsForTurn(state.activeTurnId) : [];
      updateTurnBlock(block, null, events);
      latestProjection = projectOutcome(null, events) || latestProjection;
    } else if (state.streamDom.has('__local__')) {
      state.streamDom.get('__local__').root.remove();
      state.streamDom.delete('__local__');
    }
    text('a9-turn-outcome', latestProjection
      ? `${latestProjection.outcome} · ${latestProjection.verification}`
      : '');
    if (state.eventsTruncated || state.eventsError) {
      if (!state.truncatedNote || !state.truncatedNote.parentNode) {
        const note = document.createElement('p');
        note.className = 'legacy-note';
        stream.insertBefore(note, stream.firstChild);
        state.truncatedNote = note;
      }
      state.truncatedNote.textContent = state.eventsError || '还有更早的过程记录。';
      const load = document.createElement('button');
      load.type = 'button';
      load.textContent = state.eventsError ? '重试加载' : '加载更早记录';
      load.disabled = state.eventsLoading;
      load.addEventListener('click', () => { void loadConversationEvents(Boolean(state.eventsBeforeId)); });
      state.truncatedNote.appendChild(load);
    } else if (state.truncatedNote) {
      state.truncatedNote.remove();
      state.truncatedNote = null;
    }
    el('a9-empty-state').hidden = facts.length > 0 || Boolean(state.localRequest);
    if (state.streamFollow) scrollToLatest();
  }

  // ------------------------------------------------------------------
  // 等待反馈：本地 1s 计时；距最近事件 >10s 时显示等待对象与真实时长。
  // ------------------------------------------------------------------

  function startLiveTracking() {
    state.turnStartAt = Date.now();
    state.lastEventAt = Date.now();
    if (!state.liveTimer) state.liveTimer = root.setInterval(tickLiveStatus, 1000);
    tickLiveStatus();
  }

  function stopLiveTracking() {
    if (state.liveTimer) {
      root.clearInterval(state.liveTimer);
      state.liveTimer = null;
    }
    const node = el('live-status');
    if (node) {
      node.hidden = true;
      node.classList.remove('active');
    }
    state.pendingToolLabel = null;
  }

  function tickLiveStatus() {
    const node = el('live-status');
    if (!node) return;
    if (!state.running) {
      node.hidden = true;
      node.classList.remove('active');
      return;
    }
    const now = Date.now();
    const idleMs = now - (state.lastEventAt || now);
    if (idleMs >= 10000) {
      node.classList.add('active');
      text('live-label', state.pendingToolLabel ? `正在执行工具：${state.pendingToolLabel}` : '等待模型响应…');
      text('live-elapsed', `已等待 ${formatElapsed(idleMs)}`);
    } else {
      node.classList.remove('active');
      text('live-label', '任务执行中');
      text('live-elapsed', `已运行 ${formatElapsed(now - (state.turnStartAt || now))}`);
    }
    node.hidden = false;
    const jump = el('jump-latest');
    if (jump) jump.hidden = state.streamFollow;
  }

  function scrollToLatest() {
    const conversation = el('conversation');
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }

  // ------------------------------------------------------------------
  // Inspector 与目录渲染。
  // ------------------------------------------------------------------

  // ADR-0120：Inspector 有界显示范围保持既有规则不变（当前会话按 eventId 升序的最后 60 行，
  // 规则名 LAST_60_BY_EVENT_ID_ASC）。仅为每行增加稳定身份属性，供正式验收按范围逐行核对。
  function renderTimeline() {
    const timeline = el('a9-timeline');
    timeline.textContent = '';
    const filePaths = new Set();
    let rawOutput = '';
    const visible = eventsForInspector().slice(-60);
    timeline.dataset.displayRule = 'LAST_60_BY_EVENT_ID_ASC';
    timeline.dataset.displayRows = String(visible.length);
    visible.forEach((event) => {
      const data = event.data || {};
      const shell = data.shell && data.shell.schemaVersion === 1 ? data.shell : null;
      const item = document.createElement('li');
      const stamp = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '';
      item.textContent = stamp ? `${stamp} · ${timelineEntryLabel(event)}` : timelineEntryLabel(event);
      item.dataset.eventId = String(event.eventId);
      item.dataset.eventType = event.type;
      if (event.turnId) item.dataset.turnId = String(event.turnId);
      timeline.appendChild(item);
      [data.path, data.relativePath, data.targetPath].filter(Boolean).forEach((value) => filePaths.add(String(value)));
      [shell && shell.stdout, shell && shell.stderr].filter((value) => typeof value === 'string').forEach((value) => { rawOutput += value; });
      if (shell && shell.truncated) rawOutput += '\n[输出预览已截断；完整字节见日志路径]\n';
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
    const dot = document.createElement('span');
    dot.className = `conversation-dot ${conversation.activity || ''}`;
    dot.setAttribute('aria-hidden', 'true');
    title.appendChild(dot);
    title.appendChild(document.createTextNode(conversation.title || '新对话'));
    const meta = document.createElement('small');
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
    const query = state.searchQuery;
    const visible = query
      ? conversations.filter((item) => String(item.title || '').toLocaleLowerCase().includes(query))
      : conversations;
    const active = visible.filter((item) => item.state === 'active');
    const archived = visible.filter((item) => item.state === 'archived');
    const allActive = conversations.filter((item) => item.state === 'active');
    const controls = snapshot.conversationControls || { canSwitch: false, maxActive: 16 };
    const activeList = el('conversation-list');
    const archivedList = el('conversation-archive-list');
    activeList.textContent = '';
    archivedList.textContent = '';
    active.forEach((item) => appendConversationRow(activeList, item, snapshot, false));
    archived.forEach((item) => appendConversationRow(archivedList, item, snapshot, true));
    if (query && visible.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'conversation-empty-note';
      empty.textContent = '没有匹配的对话。';
      activeList.appendChild(empty);
    }
    text('conversation-archive-count', archived.length);
    el('conversation-archive-section').hidden = archived.length === 0;
    el('conversation-new').disabled = !controls.canSwitch || allActive.length >= controls.maxActive;
    el('conversation-rename').disabled = !snapshot.activeConversationId;
    el('conversation-archive').disabled = !controls.canSwitch || !snapshot.activeConversationId;
    text('conversation-directory-note', query
      ? `找到 ${visible.length} 个匹配的对话（含已归档）`
      : controls.canSwitch
        ? `${allActive.length}/${controls.maxActive} 个未归档对话`
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
    if (state.renderedConversationId !== state.activeConversationId) {
      state.renderedConversationId = state.activeConversationId;
      resetConversationEvents();
    }
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
    const shell = snapshot.shell || {};
    text('a9-shell-value', shell.available === false
      ? '设置无效（已阻止执行）'
      : `${shell.kind || '-'}${shell.version ? ` ${shell.version}` : ''}`);
    text('a9-shell-settings-state', shell.source === 'workspace_explicit'
      ? `当前：${shell.kind} · ${shell.path} · 环境键 ${Array.isArray(shell.envKeys) && shell.envKeys.length > 0 ? shell.envKeys.join(', ') : '无'}`
      : shell.source === 'invalid_saved_setting'
        ? '已保存设置无效；Shell 执行保持关闭。'
        : '当前：自动选择 PowerShell 5.1 / CMD。');
    if (shell.source === 'workspace_explicit') {
      el('a9-shell-kind').value = shell.kind;
      el('a9-shell-path').value = shell.path || '';
      el('a9-shell-version').value = shell.version || '';
    } else if (shell.source === 'automatic') {
      el('a9-shell-kind').value = 'automatic';
      el('a9-shell-path').value = '';
      el('a9-shell-version').value = '';
    }
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
      remembered: Boolean(provider.apiKey && provider.apiKey.remembered),
      caBundle: provider.caBundle || '',
      customHeaderNames: provider.customHeaderNames || [],
      customHeaderValuesAvailable: provider.customHeaderValuesAvailable === true,
      proxy: provider.proxy || null,
    });
    if (state.providerHydratedSignature !== providerHydratedSignature) {
      el('a9-provider-url').value = provider.baseUrl || '';
      el('a9-provider-model').value = provider.model || '';
      el('a9-provider-remember').checked = Boolean(provider.apiKey && provider.apiKey.remembered);
      el('a9-provider-ca').value = provider.caBundle || '';
      el('a9-provider-header-name').value = (provider.customHeaderNames || [])[0] || '';
      el('a9-provider-header-value').value = '';
      el('a9-provider-proxy-host').value = provider.proxy && provider.proxy.host ? provider.proxy.host : '';
      el('a9-provider-proxy-port').value = provider.proxy && provider.proxy.port ? String(provider.proxy.port) : '';
      state.providerHydratedSignature = providerHydratedSignature;
    }
    text('a9-lock-value', snapshot.lock ? (snapshot.lock.held ? '本窗口持有写锁' : `由 ${snapshot.lock.holder || '其他窗口'} 持有`) : '-');
    text('a9-agent-value', snapshot.agentStatus || 'idle');
    const runtimeStatus = el('runtime-status');
    runtimeStatus.className = `connection ${ready ? 'ready' : 'failed'}`;
    runtimeStatus.innerHTML = '<i aria-hidden="true"></i>';
    runtimeStatus.appendChild(document.createTextNode(ready ? 'Runtime 就绪' : 'Runtime 受限'));
    const runtimeError = ready ? '' : runtimeDiagnostic(snapshot);
    setFieldError('a9-runtime-error', runtimeError);
    if (!ready) showGlobalError(`Runtime 初始化受限：${runtimeDiagnostic(snapshot)}`, '打开诊断', () => openDrawer('diagnostics-drawer'));
    const modeButton = el('a9-mode-open');
    modeButton.hidden = !ready || !workspace;
    modeButton.disabled = !ready || !workspace;
    modeButton.textContent = `权限：${modeLabel(snapshot.mode)}`;
    renderApproval(snapshot);
    ingestTimelineEvents(snapshot.timeline);
    renderTimeline();
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
      state.localRequest = null;
      await refreshSnapshot();
      await loadConversationEvents();
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

  async function openWorkspaceFile(filePath, startLine, encoding) {
    if (!state.explorerSessionId || !filePath) return;
    const sameFile = Boolean(state.viewer && state.viewer.path === filePath);
    const selectedEncoding = encoding === undefined
      ? (sameFile ? el('viewer-encoding').value : '')
      : encoding;
    el('viewer-encoding').value = selectedEncoding || '';
    const response = await a9.readWorkspaceFile(filePath, startLine || 1, 500, selectedEncoding || undefined);
    if (!response || response.ok === false || !response.result) {
      showGlobalError(errorMessage(response, '文件读取失败。'), '重试', () => { void openWorkspaceFile(filePath, startLine, selectedEncoding); });
      return;
    }
    state.viewer = response.result;
    text('viewer-file', response.result.path);
    text('viewer-range', `${response.result.startLine || 1}–${response.result.endLine || response.result.lines.length}`);
    el('viewer-panel').hidden = false;
    if (!response.result.isText) {
      showGlobalError('无法自动识别为文本。请选择已知编码后重试；不会以乱码替代字符展示。');
    } else {
      clearGlobalError();
    }
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

  /**
   * ADR-0114：轮次提交复用事件流——本地先建请求卡，过程经 timeline 增量
   * 入流，终态由 turn_completed/事实渲染；不再双写结果卡。
   */
  async function submitPrompt() {
    const prompt = el('task-prompt').value.trim();
    if (!prompt || !canSubmit()) return null;
    clearGlobalError();
    setFieldError('a9-turn-error', '');
    state.localRequest = { prompt, at: Date.now() };
    state.activeTurnId = null;
    el('task-prompt').value = '';
    resizeComposer();
    state.running = true;
    state.streamFollow = true;
    state.conversationSignature = null;
    if (state.snapshot) renderConversation(state.snapshot);
    setTaskState('运行中', 'running', 'Agent 正在读取事实并执行工具。');
    syncComposer();
    startLiveTracking();
    const finishPolling = beginSnapshotPolling();
    let response;
    try {
      response = await a9.submitTurn(prompt);
      if (response && response.ok !== true) {
        const message = errorMessage(response, '任务执行失败。');
        state.localRequest = null;
        state.conversationSignature = null;
        setFieldError('a9-turn-error', message);
        showGlobalError(message, '打开设置', () => openDrawer('settings-drawer'));
      }
    } catch (error) {
      const message = errorMessage(error, '任务执行失败。');
      state.localRequest = null;
      state.conversationSignature = null;
      setFieldError('a9-turn-error', message);
      showGlobalError(message, '重试状态读取', () => { void refreshSnapshot(); });
    } finally {
      await finishPolling();
      state.running = false;
      state.localRequest = null;
      stopLiveTracking();
      await refreshSnapshot();
      await loadConversationEvents();
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

  function beginSnapshotPolling() {
    let snapshotRefreshInFlight = null;
    const pollId = root.setInterval(() => {
      if (snapshotRefreshInFlight) return;
      snapshotRefreshInFlight = Promise.resolve(refreshSnapshot())
        .finally(() => { snapshotRefreshInFlight = null; });
    }, 500);
    return async () => {
      root.clearInterval(pollId);
      if (snapshotRefreshInFlight) await snapshotRefreshInFlight;
    };
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
      state.running = true;
      state.streamFollow = true;
      setTaskState('运行中', 'running', '审批已提交，Agent 正在继续执行；可随时停止。');
      syncComposer();
      startLiveTracking();
      const finishPolling = beginSnapshotPolling();
      let response;
      try {
        response = await a9.resumeApproval(approvalId, decision, bindingDigest, conversationId, taskId, turnId);
        if (!response || response.ok !== true) {
          setFieldError('a9-approval-error', errorMessage(response, '审批回复失败，请刷新状态后重试。'));
          return response;
        }
        card.hidden = true;
        return response;
      } catch (error) {
        setFieldError('a9-approval-error', errorMessage(error, '审批回复失败，请重试。'));
        return null;
      } finally {
        await finishPolling();
        state.running = false;
        stopLiveTracking();
        await refreshSnapshot();
        await loadConversationEvents();
        syncComposer();
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
    const response = await a9.undoTurn(turnId, state.undoConfirmations[turnId]);
    if (response && response.needsConfirmation === true) state.undoConfirmations[turnId] = response.confirmationId;
    else delete state.undoConfirmations[turnId];
    text('a9-undo-state', response && response.ok === true
      ? (response.needsConfirmation === true
        ? response.outcome.errors[0]
        : `restored=${(response.outcome.restored || []).length} · errors=${(response.outcome.errors || []).length}`)
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
    const provider = state.snapshot && state.snapshot.provider ? state.snapshot.provider : {};
    const values = {
      baseUrl: el('a9-provider-url').value.trim(),
      model: el('a9-provider-model').value.trim(),
      rememberApiKey: el('a9-provider-remember').checked,
    };
    const apiKey = el('a9-provider-key').value;
    if (apiKey) values.apiKey = apiKey;
    const caBundle = el('a9-provider-ca').value.trim();
    if (caBundle !== String(provider.caBundle || '')) values.caBundle = caBundle || null;
    const headerName = el('a9-provider-header-name').value.trim();
    const headerValue = el('a9-provider-header-value').value;
    const existingHeaderNames = Array.isArray(provider.customHeaderNames) ? provider.customHeaderNames : [];
    if (headerName && headerValue) {
      values.customHeaders = existingHeaderNames.includes(headerName)
        ? Object.fromEntries(existingHeaderNames.map((name) => [name, name === headerName ? headerValue : null]))
        : { [headerName]: headerValue };
    } else if (!headerName && existingHeaderNames.length > 0) {
      values.customHeaders = {};
    }
    const proxyHost = el('a9-provider-proxy-host').value.trim();
    const proxyPort = Number(el('a9-provider-proxy-port').value || 0);
    const existingProxy = provider.proxy || null;
    if (proxyHost && proxyPort > 0) {
      if (!existingProxy || proxyHost !== existingProxy.host || proxyPort !== Number(existingProxy.port)) {
        values.proxy = { host: proxyHost, port: proxyPort };
      }
    } else if (existingProxy) {
      values.proxy = null;
    }
    return values;
  }

  async function applyProvider() {
    const values = providerValues();
    setFieldError('a9-provider-error', '');
    if (!values.baseUrl || !values.model) {
      setFieldError('a9-provider-error', 'Base URL 与模型 ID 都必须填写。');
      return;
    }
    const headerName = el('a9-provider-header-name').value.trim();
    const headerValue = el('a9-provider-header-value').value;
    const existingHeaderName = state.snapshot && state.snapshot.provider &&
      Array.isArray(state.snapshot.provider.customHeaderNames)
      ? state.snapshot.provider.customHeaderNames[0] || ''
      : '';
    if ((!headerName && headerValue) || (headerName && !headerValue && headerName !== existingHeaderName)) {
      setFieldError('a9-provider-error', '新的自定义 Header 名和值必须同时填写；已保存的同名值可留空以保留。');
      return;
    }
    const proxyHost = el('a9-provider-proxy-host').value.trim();
    const proxyPortText = el('a9-provider-proxy-port').value;
    if ((proxyHost && !proxyPortText) || (!proxyHost && proxyPortText)) {
      setFieldError('a9-provider-error', '代理主机与端口必须同时填写，或同时清空。');
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

  function shellValues() {
    const kind = el('a9-shell-kind').value;
    const envOverlay = {};
    for (const rawLine of el('a9-shell-env').value.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator <= 0) throw new Error('环境覆盖必须使用 NAME=value，每行一项。');
      const name = line.slice(0, separator).trim();
      if (Object.prototype.hasOwnProperty.call(envOverlay, name)) throw new Error(`环境变量重复：${name}`);
      envOverlay[name] = line.slice(separator + 1);
    }
    return { kind, envOverlay };
  }

  async function applyShell() {
    setFieldError('a9-shell-settings-error', '');
    const button = el('a9-shell-apply');
    button.disabled = true;
    try {
      const values = shellValues();
      const response = await a9.configureShell(values);
      if (!response || response.ok !== true) {
        setFieldError('a9-shell-settings-error', errorMessage(response, 'Shell 设置失败。'));
        return;
      }
      // 环境值不通过 snapshot/回执重新展示；再次修改时需输入完整覆盖。
      el('a9-shell-env').value = '';
      await refreshSnapshot();
    } catch (error) {
      setFieldError('a9-shell-settings-error', errorMessage(error, 'Shell 设置失败。'));
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
  function toggleInspector() {
    if (!inspectorIsDrawer()) return;
    if (el('inspector').classList.contains('open')) closeInspector();
    else openInspector();
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
    if (state.snapshot) {
      rows.push(['A9 Runtime status', state.snapshot.status || '-']);
      rows.push(['A9 Runtime diagnostic', state.snapshot.status === 'ready' ? 'ready' : runtimeDiagnostic(state.snapshot)]);
    }
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
      if (event.key === 'Enter' && !event.shiftKey && event.isComposing !== true && event.keyCode !== 229) {
        event.preventDefault();
        void submitPrompt();
      }
    });
    el('run-task').addEventListener('click', () => { void submitPrompt(); });
    el('cancel-task').addEventListener('click', () => { void stopTurn(); });
    el('rail-stop').addEventListener('click', () => { void stopTurn(); });
    el('conversation-new').addEventListener('click', () => { void createConversation(); });
    el('conversation-rename').addEventListener('click', openRenameConversation);
    el('conversation-archive').addEventListener('click', () => { void archiveCurrentConversation(); });
    el('conversation-rename-cancel').addEventListener('click', () => closeDialog(el('conversation-rename-dialog')));
    el('conversation-rename-apply').addEventListener('click', () => { void applyConversationRename(); });
    // ADR-0114：目录搜索（含已归档，按标题过滤）。
    el('conversation-search').addEventListener('input', (event) => {
      state.searchQuery = String(event.target.value || '').trim().toLocaleLowerCase();
      if (state.snapshot) renderConversationDirectory(state.snapshot);
    });
    document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => {
      el('task-prompt').value = button.dataset.prompt;
      resizeComposer();
      scheduleDraftSave();
      el('task-prompt').focus();
    }));
    // ADR-0114：流内滚动与“回到最新”。
    el('conversation').addEventListener('scroll', () => {
      const node = el('conversation');
      state.streamFollow = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      const jump = el('jump-latest');
      if (jump && state.running) jump.hidden = state.streamFollow;
    });
    el('jump-latest').addEventListener('click', () => {
      state.streamFollow = true;
      scrollToLatest();
      const jump = el('jump-latest');
      if (jump) jump.hidden = true;
    });
    el('a9-mode-open').addEventListener('click', () => { if (state.snapshot) configureModeDialog(state.snapshot, true); });
    el('a9-mode-apply').addEventListener('click', () => { void chooseMode(); });
    el('a9-mode-cancel').addEventListener('click', () => closeDialog(el('a9-mode-dialog')));
    el('a9-mode-dialog').addEventListener('cancel', (event) => { if (el('a9-mode-dialog').dataset.required === 'true') event.preventDefault(); });
    el('a9-provider-open').addEventListener('click', () => openDrawer('settings-drawer'));
    el('open-settings').addEventListener('click', () => openDrawer('settings-drawer'));
    el('open-diagnostics').addEventListener('click', () => { openDrawer('diagnostics-drawer'); void refreshDiagnostics(); });
    document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeDrawer(button.dataset.close)));
    el('a9-provider-apply').addEventListener('click', () => { void applyProvider(); });
    el('a9-provider-probe').addEventListener('click', () => { void probeProvider(); });
    el('a9-shell-path').readOnly = true;
    el('a9-shell-path').placeholder = '应用后由系统文件选择器确定';
    const shellVersion = el('a9-shell-version');
    shellVersion.disabled = true;
    shellVersion.placeholder = '选择后由文件身份自动测量';
    const shellVersionLabel = document.querySelector('label[for="a9-shell-version"]');
    if (shellVersionLabel) shellVersionLabel.textContent = '测量版本（不可编辑）';
    el('a9-shell-apply').addEventListener('click', () => { void applyShell(); });
    el('a9-approval-approve').addEventListener('click', () => { void decideApproval('approved'); });
    el('a9-approval-deny').addEventListener('click', () => { void decideApproval('denied'); });
    el('a9-git-refresh').addEventListener('click', () => { void refreshGit(); });
    el('a9-output-copy').addEventListener('click', copyOutput);
    el('workspace-up').addEventListener('click', () => { const parts = state.explorerPath.split(/[\\/]+/).filter(Boolean); parts.pop(); void refreshWorkspace(parts.join('/')); });
    el('viewer-search').addEventListener('input', renderViewer);
    el('viewer-encoding').addEventListener('change', () => { void openWorkspaceFile(state.viewer && state.viewer.path, 1, el('viewer-encoding').value); });
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
      // ADR-0114：Ctrl+K 聚焦目录搜索；Ctrl+I 切换检查器（抽屉模式）。
      const key = String(event.key || '').toLowerCase();
      if (event.ctrlKey && !event.altKey && !event.shiftKey && key === 'k') {
        event.preventDefault();
        const search = el('conversation-search');
        search.focus();
        if (typeof search.select === 'function') search.select();
        return;
      }
      if (event.ctrlKey && !event.altKey && !event.shiftKey && key === 'i') {
        event.preventDefault();
        toggleInspector();
        return;
      }
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
    await loadConversationEvents();
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
