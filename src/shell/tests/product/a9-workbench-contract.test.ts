import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

describe('A9 unified desktop workbench contract', () => {
  const productRoot = path.join(__dirname, '../../product');
  const html = fs.readFileSync(path.join(productRoot, 'renderer/workbench.html'), 'utf8');
  const css = fs.readFileSync(path.join(productRoot, 'renderer/a9-workbench.css'), 'utf8');
  const script = fs.readFileSync(path.join(productRoot, 'renderer/a9-workbench.js'), 'utf8');
  const main = fs.readFileSync(path.join(productRoot, 'main.js'), 'utf8');
  const smokeDriver = fs.readFileSync(path.join(__dirname, 'a9-06-driver-entry.cjs'), 'utf8');

  it('loads the unified workbench for the product while preserving the historical A8 smoke entry', () => {
    expect(main).toContain("const legacyRendererEntry = path.join(rendererRoot, 'index.html');");
    expect(main).toContain(": path.join(rendererRoot, 'workbench.html');");
    expect(main).toContain("item.indexOf('--a8-review-smoke-') === 0");
    expect(main).toContain("item.indexOf('--a8-boundary-smoke-') === 0");
    expect(main).toContain("readArgument('--a9-workbench-screenshot=')");
    expect(main).toContain('mainWindow.setContentSize(1366, 768);');
    expect(main).toContain('mainWindow.webContents.setZoomFactor(a9WorkbenchZoom);');
    expect(main).toContain("document.getElementById('workspace-select').focus()");
    expect(main).toContain('mainWindow.webContents.capturePage()');
  });

  it('has one visible A9 task entry and one central approval action area', () => {
    expect((html.match(/id="task-prompt"/g) || [])).toHaveLength(1);
    expect((html.match(/id="run-task"/g) || [])).toHaveLength(1);
    expect((html.match(/id="cancel-task"/g) || [])).toHaveLength(1);
    expect((html.match(/id="a9-approval-card"/g) || [])).toHaveLength(1);
    expect(html).not.toContain('id="a9-prompt"');
    expect(html.indexOf('id="a9-approval-card"')).toBeLessThan(html.indexOf('id="task-prompt"'));
    expect(script).toContain('await a9.submitTurn(prompt)');
    expect(script).toContain("snapshot.provider.probe.classification === 'tool_calling'");
    expect(script).not.toContain('api.submitTask');
    expect(script).toContain('activeManagedProcesses(snapshot)');
    expect(script).toContain('snapshot.controls && snapshot.controls.canStop');
    expect(script).toContain("stopKind === 'turn' ? '停止任务' : stopKind === 'managed_process' ? '停止后台进程' : '停止'");
    expect(script).toContain('应用不会发送终止信号');
    expect(script).toContain('function renderConversation(snapshot)');
    expect((html.match(/id="rail-stop"/g) || [])).toHaveLength(1);
    expect(script).toContain("el('rail-stop').addEventListener('click'");
  });

  it('provides isolated conversation navigation and per-conversation encrypted drafts', () => {
    ['conversation-new', 'conversation-list', 'conversation-rename', 'conversation-archive', 'conversation-archive-list'].forEach((id) => {
      expect(html).toContain(`id="${id}"`);
    });
    expect(script).toContain('function renderConversationDirectory(snapshot)');
    expect(script).toContain('a9.createConversation()');
    expect(script).toContain('a9.activateConversation(conversationId)');
    expect(script).toContain('a9.archiveConversation(state.activeConversationId)');
    expect(script).toContain('a9.restoreConversation(conversationId)');
    expect(script).toContain("root.setTimeout(() => { void saveDraftNow(); }, 450)");
    expect(script).toContain("a9.saveDraft(el('task-prompt').value)");
    expect(css).toContain('.conversation-directory');
    expect(css).toContain('.conversation-list');
  });

  it('shows complete checkpoint identities and rebuilds persisted conversation cards', () => {
    expect(script).toContain('identity.textContent = String(checkpoint.turnId);');
    expect(script).toContain('identity.title = String(checkpoint.turnId);');
    expect(script).not.toContain('String(checkpoint.turnId).slice(0, 16)');
    expect(script).toContain("copy.textContent = '复制 ID';");
    expect(script).toContain('copyText(String(checkpoint.turnId))');
    expect(script).toContain('const facts = snapshot.conversation || [];');
    expect(css).toContain('.checkpoint-id');
    expect(css).toContain('overflow-wrap: anywhere');
  });

  it('waits for A9 managed-process cleanup before Electron quits', () => {
    expect(main).toContain("app.on('before-quit', beginA9ShutdownBeforeQuit)");
    expect(main).toContain('await a9RuntimeInstance.shutdown()');
    expect(main).toContain('A9_SHUTDOWN_RESIDUE');
    expect(main).toContain("dialog.showErrorBox('无法确认安全退出'");
    expect(main).toContain("window.on('close', (event) => {");
    expect(main).toContain('窗口与工作区锁保持可用');
    expect(main).toContain('runnerHelperPath: a9PackageRuntime.runnerHelper');
    expect(main).toContain('requireRunnerHelper: true');
    expect(main).toContain('selectShellExecutable: async (kind) =>');
    expect(main).toContain("properties: ['openFile']");
    expect(main).toContain('Array.isArray(leftToSystem)');
    expect(main).toContain("residueLines.join('\\n')");
    expect(main).not.toContain('String(leftToSystem || []).slice(0, 20).join');
  });

  it('binds approvals to conversation/task/turn and disables both actions while processing', () => {
    expect(script).toContain('card.dataset.conversationId = pending.conversationId');
    expect(script).toContain('card.dataset.taskId = pending.taskId');
    expect(script).toContain('card.dataset.turnId = pending.turnId');
    expect(script).toContain('a9.resumeApproval(approvalId, decision, bindingDigest, conversationId, taskId, turnId)');
    expect(script).toContain("button.textContent = busy ? '处理中…' : label");
    expect(script).toContain("setTaskState('运行中', 'running', '审批已提交");
    expect(script).toContain('const finishPolling = beginSnapshotPolling();');
  });

  it('drives the production workbench contract in the formal Electron smoke', () => {
    expect(smokeDriver).toContain("includes('renderer/workbench.html')");
    expect(smokeDriver).toContain("getElementById('task-prompt')");
    expect(smokeDriver).toContain("getElementById('run-task')");
    expect(smokeDriver).toContain("getElementById(\"cancel-task\")");
    expect(smokeDriver).toContain('A9F0-MAIN-COMPOSER-A9-BOUNDARY');
    expect(smokeDriver).toContain('A9F1-VIEWER-EXPLICIT-GBK');
    expect(smokeDriver).toContain('A9F1-FORMAL-EXPLORER-SESSION');
    expect(smokeDriver).toContain('A9F1-VIEWER-ENCODING-PER-FILE');
    expect(smokeDriver).toContain('A9F1-SHELL-EVENT-DTO-UI');
    expect(smokeDriver).toContain("mode === 'workspace_select' || mode === 'first' || mode === 'stop'");
    expect(smokeDriver).not.toContain('getElementById("a9-prompt")');
    expect(smokeDriver).not.toContain('getElementById("a9-submit")');
    expect(smokeDriver).not.toContain('getElementById("a9-stop")');
  });

  it('limits Alpha 1 mode selection to Full Access and Read Only', () => {
    expect(html).toContain('name="a9-mode-choice" value="full_access"');
    expect(html).toContain('name="a9-mode-choice" value="read_only"');
    expect(html).not.toContain('value="review"');
    expect(html).toContain('Review</strong><p>完整准备、审批与应用工作流将在下一阶段提供');
    expect(script).toContain("const SUPPORTED_MODES = new Set(['full_access', 'read_only']);");
    expect(script).toContain("snapshot.mode === 'review'");
  });

  it('uses contextual Inspector tabs instead of a long duplicate control stack', () => {
    ['files', 'changes', 'activity', 'environment'].forEach((name) => {
      expect(html).toContain(`id="inspector-tab-${name}"`);
      expect(html).toContain(`id="inspector-panel-${name}"`);
    });
    expect(html).not.toContain('Provider 配置（任意 Base URL');
    expect(html).not.toContain('A8 历史能力');
    expect(script).toContain("const TAB_IDS = ['files', 'changes', 'activity', 'environment'];");
  });

  it('uses the A9 bounded reader with visible encoding recovery for the code Viewer', () => {
    expect(html).toContain('id="viewer-encoding"');
    expect(html).toContain('value="gbk"');
    expect(html).toContain('value="utf-16le"');
    expect(script).toContain('await a9.readWorkspaceFile(filePath');
    expect(script).not.toContain('api.readWorkspaceFile(state.explorerSessionId');
    expect(script).toContain('无法自动识别为文本');
    expect(script).toContain("el('viewer-encoding').addEventListener('change'");
    expect(script).toContain('const sameFile = Boolean(state.viewer && state.viewer.path === filePath);');
    expect(script).toContain("? (sameFile ? el('viewer-encoding').value : '')");
    expect(css).toContain('grid-template-columns: 104px minmax(0, 1fr) 64px 52px');
  });

  it('renders versioned Shell events and refreshes activity while a Turn is running', () => {
    expect(script).toContain('data.shell && data.shell.schemaVersion === 1');
    expect(script).toContain('shell && shell.stdout');
    expect(script).toContain('root.setInterval(() => {');
    expect(script).toContain('snapshotRefreshInFlight = Promise.resolve(refreshSnapshot())');
    expect(script).toContain('if (snapshotRefreshInFlight) await snapshotRefreshInFlight;');
    expect(script).toContain('root.clearInterval(pollId);');
  });

  it('keeps Provider secrets in one progressive Settings surface with mandatory TLS verification', () => {
    expect((html.match(/id="a9-provider-key"/g) || [])).toHaveLength(1);
    expect((html.match(/id="a9-provider-apply"/g) || [])).toHaveLength(1);
    expect(html).toContain('<summary>企业网络</summary>');
    expect(html).toContain('TLS 证书与主机名验证始终开启');
    expect(html).not.toContain('a9-provider-insecure');
    expect(html).not.toContain('a9-insecure-dialog');
    expect(script).not.toContain('allowInsecureTLS');
    expect(script).toContain("el('a9-provider-key').value = '';");
    expect(script).toContain("el('a9-provider-header-value').value = '';");
    expect(script).toContain("setFieldError('a9-provider-diagnostics'");
    expect(script).toContain('provider.customHeaderNames || []');
    expect(script).toContain("el('a9-provider-ca').value = provider.caBundle || '';");
    expect(script).toContain('headerName !== existingHeaderName');
  });

  it('exposes user-explicit Shell settings without echoing saved environment values', () => {
    ['a9-shell-kind', 'a9-shell-path', 'a9-shell-version', 'a9-shell-env', 'a9-shell-apply'].forEach((id) => {
      expect(html).toContain(`id="${id}"`);
    });
    expect(html).toContain('每行 NAME=value');
    expect(html).toContain('已保存的值不会回显');
    expect(script).toContain('await a9.configureShell(values)');
    expect(script).toContain("el('a9-shell-env').value = '';");
    expect(script).toContain("el('a9-shell-path').readOnly = true;");
    expect(script).toContain('shellVersion.disabled = true;');
    expect(script).toContain("shellVersionLabel.textContent = '测量版本（不可编辑）';");
    expect(script).not.toContain("const version = el('a9-shell-version').value.trim();");
    expect(script).toContain('shell.envKeys.join');
  });

  it('preserves the local CSP and Renderer isolation boundary', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(script).not.toMatch(/require\(|child_process|\bfetch\(|WebSocket\(|XMLHttpRequest/);
    expect(script).toContain('const api = root.win7Agent;');
  });

  it('shows bounded A9 initialization diagnostics instead of misreporting a mode-selection problem', () => {
    expect(script).toContain('function runtimeDiagnostic(snapshot)');
    expect(script).toContain("setFieldError('a9-runtime-error', runtimeError)");
    expect(script).toContain('Runtime 初始化受限：${runtimeDiagnostic(snapshot)}');
    expect(script).toContain("rows.push(['A9 Runtime diagnostic'");
  });

  it('does not submit Enter while a Chinese IME composition is active, including legacy keyCode 229', () => {
    const listeners: Record<string, Array<(event?: any) => any>> = {};
    const nodes = new Map<string, any>();
    class FakeNode {
      value = '';
      hidden = false;
      disabled = false;
      readOnly = false;
      dataset: Record<string, string> = {};
      style: Record<string, string> = {};
      className = '';
      classList = { add() {}, remove() {}, contains() { return false; } };
      addEventListener(type: string, handler: (event: any) => any) {
        (listeners[`${(this as any).id}:${type}`] ||= []).push(handler);
      }
      setAttribute() {}
      removeAttribute() {}
      appendChild() {}
      querySelectorAll() { return []; }
      querySelector() { return null; }
      focus() {}
      getClientRects() { return [{}]; }
    }
    const idPattern = /id="([^"]+)"/g;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = idPattern.exec(html)) !== null) {
      const id = idMatch[1];
      const node: any = new FakeNode();
      node.id = id;
      nodes.set(id, node);
    }
    const documentStub: any = {
      getElementById: (id: string) => nodes.get(id),
      addEventListener: (type: string, handler: (event?: any) => any) => { (listeners[`document:${type}`] ||= []).push(handler); },
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => new FakeNode(),
      createTextNode: () => new FakeNode(),
      body: new FakeNode(),
    };
    const windowStub: any = {
      win7Agent: {
        a9: { snapshot: () => new Promise(() => {}) },
        signalReady: jest.fn(),
      },
      addEventListener: jest.fn(),
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
    };
    vm.runInNewContext(script, { window: windowStub, document: documentStub, console, Promise, Set, Map, Object, Array, String, Number, Date });
    listeners['document:DOMContentLoaded'][0]();
    const keydown = listeners['task-prompt:keydown'][0];
    const composingPrevented = jest.fn();
    keydown({ key: 'Enter', shiftKey: false, isComposing: true, keyCode: 13, preventDefault: composingPrevented });
    expect(composingPrevented).not.toHaveBeenCalled();
    const legacyPrevented = jest.fn();
    keydown({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229, preventDefault: legacyPrevented });
    expect(legacyPrevented).not.toHaveBeenCalled();
    const ordinaryPrevented = jest.fn();
    keydown({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13, preventDefault: ordinaryPrevented });
    expect(ordinaryPrevented).toHaveBeenCalledTimes(1);
  });

  it('defines semantic light tokens, stable targets, responsive drawers and reduced motion', () => {
    expect(css).toContain('color-scheme: light');
    expect(css).toContain('--bg: #f4f3ef');
    expect(css).toContain('--bg-canvas:');
    expect(css).toContain('--text-primary:');
    expect(css).toContain('--accent: #0f766e');
    expect(css).toContain('--muted: #59616b');
    expect(css).toContain('--font-ui: "Microsoft YaHei", "Microsoft YaHei UI", "Segoe UI", sans-serif');
    expect(css).toContain('font: 15px/1.55 var(--font-ui)');
    expect(css).not.toMatch(/font(?:-size)?:[^;]*(?:9|10)px/);
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('@media (max-width: 1199px)');
    expect(css).toContain('@media (max-width: 799px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('grid-template-columns: 232px minmax(500px, 1fr) 360px');
    expect(script).toContain('function trapFocus(container, event)');
  });

  it('renders ADR-0114 turn process events with bounded text and renderer-safe DOM', () => {
    // 新 HTML 结构：目录搜索（含已归档）、运行状态行与“回到最新”。
    ['conversation-search', 'live-status', 'live-elapsed', 'jump-latest'].forEach((id) => {
      expect(html).toContain(`id="${id}"`);
    });
    expect(html).toContain('role="status"');
    expect(html).toContain('搜索对话标题，包含已归档');
    // 事件数据层：eventId 去重增量并入 + 有界历史回看（截断以 hasMore 明示）。
    expect(script).toContain('function normalizeTimelineEvent(raw)');
    expect(script).toContain('function ingestEvents(events)');
    expect(script).toContain('state.inspectorEvents');
    expect(script).toContain('eventsForInspector().slice(-60)');
    expect(script).toContain('state.turnEvents');
    expect(script).toContain('beforeEventId: state.eventsBeforeId');
    expect(script).toContain('state.eventsTruncated = response.hasMore === true');
    expect(script).toContain('加载更早记录');
    // 轮次过程渲染：说明行 / 计划条 / 工具活动组（callId 配对）/ 审批留痕。
    ["case 'model_note':", "case 'plan_updated':", "case 'approval_required':",
      "case 'approval_resolved':", "case 'tool_start':", "case 'tool_end':"].forEach((fragment) => {
      expect(script).toContain(fragment);
    });
    expect(script).toContain('function toolHeadline(data)');
    expect(script).toContain("const key = data.callId ? String(data.callId) : '__last__';");
    expect(script).toContain('历史记录未包含过程。');
    // 搜索与键盘：Ctrl+K 聚焦搜索、Ctrl+I 切换检查器；空结果如实提示。
    expect(script).toContain("el('conversation-search').addEventListener('input'");
    expect(script).toContain('state.searchQuery');
    expect(script).toContain('没有匹配的对话。');
    expect(script).toContain("key === 'k'");
    expect(script).toContain("key === 'i'");
    // 等待反馈：本地计时 + >10s 空闲检测；无百分比、无虚构动作。
    expect(script).toContain('function startLiveTracking()');
    expect(script).toContain('function tickLiveStatus()');
    expect(script).toContain('idleMs >= 10000');
    expect(script).toContain('等待模型响应…');
    // 显示上限（ADR-0114）：单条说明 16 KB、单条工具输出 8 KB，截断必须明示。
    expect(script).toContain('const NOTE_LIMIT = 16 * 1024');
    expect(script).toContain('const TOOL_OUTPUT_LIMIT = 8 * 1024');
    expect(script).toContain('已截断；完整内容见持久化事件与日志');
    // 渲染安全：唯一 innerHTML 为静态状态图标，不可信文本一律 textContent。
    expect((script.match(/innerHTML/g) || [])).toHaveLength(1);
    expect(script).toContain("runtimeStatus.innerHTML = '<i aria-hidden=\"true\"></i>'");
    expect(script).toContain('clampText(data.content, NOTE_LIMIT)');
  });

  it('classifies actual tool failure, cancellation and uncertain cleanup without claiming success', () => {
    const source = script.slice(script.indexOf('  function toolEndStatus('), script.indexOf('  function timelineEntryLabel('));
    const context: any = {};
    vm.runInNewContext(source + ';this.classify = toolEndStatus;', context);
    expect(context.classify({ shell: { exitCode: 1 } })[0]).toBe('failed');
    expect(context.classify({ result: 'Tool execution error: file not found' })[0]).toBe('failed');
    expect(context.classify({ residueRisk: true })[1]).toBe('清理未确认');
    expect(context.classify({ shell: { status: 'cancelled' } })[0]).toBe('stopped');
    expect(context.classify({ shell: { exitCode: null, status: 'unknown' } })[0]).toBe('interrupted');
    expect(context.classify({ shell: { exitCode: 0, status: 'completed' } })[0]).toBe('success');
  });

  it('keeps queried session events available to the Inspector across restart', () => {
    const source = script.slice(script.indexOf('  function ingestEvents('), script.indexOf('  function ingestTimelineEvents('));
    const state: any = {
      inspectorEvents: new Map(), turnEvents: new Map(), eventMaxId: 0,
      activeTurnId: null, pendingToolLabel: null, lastEventAt: 0,
    };
    const context: any = { state, toolHeadline: jest.fn() };
    vm.runInNewContext(source + ';this.ingest = ingestEvents;', context);
    context.ingest([
      { eventId: 1, type: 'provider.configure', turnId: null, data: {} },
      { eventId: 2, type: 'turn_completed', turnId: 'turn-1', data: { outcome: 'completed' } },
    ]);
    expect(Array.from(state.inspectorEvents.keys())).toEqual([1, 2]);
    expect(state.turnEvents.get('turn-1').events).toHaveLength(1);
    expect(state.eventMaxId).toBe(2);
  });

  it('projects the global outcome from the latest turn instead of an older rerendered failure', () => {
    const source = script.slice(script.indexOf('  function projectOutcome('), script.indexOf('  function updateOutcomeCard('));
    const context: any = { TERMINAL_OUTCOMES: new Set(['completed', 'failed']) };
    vm.runInNewContext(source + ';this.project = projectOutcome;', context);
    const olderFailure = context.project(
      { outcome: 'failed', verification: 'not_applicable', finalMessage: '' },
      [{ type: 'turn_failed', data: { error: 'expected failure' } }],
    );
    const latestSuccess = context.project(
      { outcome: 'completed', verification: 'verified', finalMessage: 'done' },
      [{ type: 'turn_completed', data: { outcome: 'completed', verification: 'verified', finalMessage: 'done' } }],
    );
    expect(olderFailure).toEqual(expect.objectContaining({ outcome: 'failed', verification: 'not_applicable' }));
    expect(latestSuccess).toEqual({ outcome: 'completed', verification: 'verified', message: 'done' });
    expect(script.indexOf("text('a9-turn-outcome', latestProjection")).toBeGreaterThan(script.indexOf('facts.forEach((fact) =>'));
  });

  it('pages older history and exposes recoverable query errors without losing loaded events', async () => {
    const source = script.slice(script.indexOf('  async function loadConversationEvents('), script.indexOf('  /** 事实'));
    const queryEvents = jest.fn()
      .mockResolvedValueOnce({ ok: true, events: [{ eventId: 301 }], hasMore: true })
      .mockRejectedValueOnce(new Error('private failure detail'))
      .mockResolvedValueOnce({ ok: true, events: [{ eventId: 1 }], hasMore: false });
    const state: any = { activeConversationId: 'c', eventsBeforeId: null, snapshot: {}, eventsLoading: false };
    const ingested: any[] = [];
    const render = jest.fn();
    const renderTimeline = jest.fn();
    const context: any = { a9: { queryEvents }, state, normalizeQueriedEvent: (x: any) => x,
      ingestEvents: (xs: any[]) => ingested.push(...xs), renderConversation: render, renderTimeline };
    vm.runInNewContext(source + ';this.load = loadConversationEvents;', context);
    await context.load();
    expect(state.eventsBeforeId).toBe(301);
    await context.load(true);
    expect(state.eventsError).toContain('加载失败');
    expect(state.eventsError).not.toContain('private');
    expect(ingested).toHaveLength(1);
    await context.load(true);
    expect(queryEvents.mock.calls[2][0].beforeEventId).toBe(301);
    expect(ingested.map(x => x.eventId)).toEqual([301, 1]);
    expect(state.eventsError).toBe('');
    expect(state.eventsTruncated).toBe(false);
    expect(render).toHaveBeenCalledTimes(3);
    expect(renderTimeline).toHaveBeenCalledTimes(3);
  });
});
