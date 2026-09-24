import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

function createRendererDomHarness() {
  class FakeNode {
    children: FakeNode[] = [];
    parentNode: FakeNode | null = null;
    dataset: Record<string, string> = {};
    className = '';
    hidden = false;
    disabled = false;
    open = false;
    type = '';
    title = '';
    scrollTop = 0;
    scrollHeight = 0;
    private ownText = '';

    constructor(readonly tagName = 'div') {}

    get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(''); }
    set textContent(value: string) {
      this.ownText = String(value == null ? '' : value);
      this.children.forEach((child) => { child.parentNode = null; });
      this.children = [];
    }
    get firstChild() { return this.children[0] || null; }
    appendChild(child: FakeNode) { child.parentNode = this; this.children.push(child); return child; }
    insertBefore(child: FakeNode, before: FakeNode | null) {
      child.parentNode = this;
      const index = before ? this.children.indexOf(before) : -1;
      if (index >= 0) this.children.splice(index, 0, child); else this.children.push(child);
      return child;
    }
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }
    addEventListener() {}
    attributes: Record<string, string> = {};
    setAttribute(name: string, value: string) { this.attributes[name] = String(value); }
    querySelectorAll(selector: string) {
      const matches: FakeNode[] = [];
      const visit = (node: FakeNode) => {
        node.children.forEach((child) => {
          if (selector === 'details' && child.tagName === 'details') matches.push(child);
          if (selector === 'details[open]' && child.tagName === 'details' && child.open) matches.push(child);
          visit(child);
        });
      };
      visit(this);
      return matches;
    }
  }
  const nodes = new Map<string, FakeNode>();
  const node = (id: string, tagName = 'div') => {
    const value = new FakeNode(tagName);
    nodes.set(id, value);
    return value;
  };
  ['a9-task-stream', 'a9-turn-outcome', 'a9-empty-state', 'a9-timeline', 'file-count',
    'file-activity', 'file-empty', 'a9-shell-output'].forEach((id) => node(id, id === 'a9-timeline' || id === 'file-activity' ? 'ul' : 'div'));
  return {
    FakeNode,
    nodes,
    document: {
      getElementById: (id: string) => nodes.get(id) || null,
      createElement: (tagName: string) => new FakeNode(tagName),
    },
  };
}

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

  it('loads persisted session events into the Inspector in order without duplicates or cross-session residue', async () => {
    const { document, nodes } = createRendererDomHarness();
    const eventsByConversation: Record<string, any[]> = {
      'conversation-a': [
        { eventId: 15, eventType: 'turn_completed', turnId: 'turn-a', payload: { data: { outcome: 'completed' } } },
        { eventId: 11, eventType: 'provider.configure', turnId: null, payload: {} },
        { eventId: 13, eventType: 'tool_start', turnId: 'turn-a', payload: { data: { toolName: 'shell', args: { command: 'echo ok' } } } },
        { eventId: 12, eventType: 'turn_started', turnId: 'turn-a', payload: {} },
        { eventId: 13, eventType: 'tool_start', turnId: 'turn-a', payload: { data: { toolName: 'shell', args: { command: 'echo ok' } } } },
        { eventId: 14, eventType: 'tool_end', turnId: 'turn-a', payload: { data: { toolName: 'shell', shell: { schemaVersion: 1, exitCode: 0, stdout: 'session-a-output' } } } },
      ],
      'conversation-b': [
        { eventId: 21, eventType: 'turn_started', turnId: 'turn-b', payload: {} },
        { eventId: 22, eventType: 'model_note', turnId: 'turn-b', payload: { data: { content: 'session-b-only' } } },
      ],
    };
    const state: any = {
      activeConversationId: 'conversation-a', inspectorEvents: new Map(), turnEvents: new Map(),
      turnIdToFactTask: new Map(), eventMaxId: 0, activeTurnId: null, pendingToolLabel: null,
      lastEventAt: 0, eventsBeforeId: null, snapshot: {}, eventsLoading: false,
      eventsTruncated: false, eventsError: '', streamDom: new Map(), truncatedNote: null,
    };
    const queryEvents = jest.fn(async ({ conversationId }: any) => ({
      ok: true, events: eventsByConversation[conversationId], hasMore: false,
    }));
    const normalizeAndLoad = script.slice(script.indexOf('  function normalizeTimelineEvent('), script.indexOf('  /** 事实'));
    const labels = script.slice(script.indexOf('  function toolHeadline('), script.indexOf('  // ------------------------------------------------------------------\n  // 轮次渲染'));
    const timeline = script.slice(script.indexOf('  function renderTimeline('), script.indexOf('  function renderCheckpoints('));
    const context: any = {
      state, document, a9: { queryEvents }, Date,
      el: (id: string) => nodes.get(id),
      text: (id: string, value: any) => { const target = nodes.get(id); if (target) target.textContent = String(value == null ? '' : value); },
      renderConversation: jest.fn(), openWorkspaceFile: jest.fn(),
    };
    vm.runInNewContext(`${labels}\n${normalizeAndLoad}\n${timeline};this.load = loadConversationEvents;this.reset = resetConversationEvents;`, context);

    await context.load();
    const firstTimeline = nodes.get('a9-timeline')!;
    expect(Array.from(state.inspectorEvents.keys()).sort((a: any, b: any) => a - b)).toEqual([11, 12, 13, 14, 15]);
    expect(firstTimeline.children).toHaveLength(5);
    expect(firstTimeline.children.map((item: any) => item.textContent)).toEqual([
      'provider.configure', '任务开始', '运行命令 echo ok …', '运行命令  · exit=0', '任务完成 · completed',
    ]);
    expect(nodes.get('a9-shell-output')!.textContent).toContain('session-a-output');

    state.activeConversationId = 'conversation-b';
    context.reset();
    await context.load();
    expect(Array.from(state.inspectorEvents.keys())).toEqual([21, 22]);
    expect(nodes.get('a9-timeline')!.textContent).toContain('模型说明');
    expect(nodes.get('a9-timeline')!.textContent).not.toContain('session-a-output');
    expect(queryEvents.mock.calls.map((call) => call[0].conversationId)).toEqual(['conversation-a', 'conversation-b']);
  });

  it('keeps the latest verified outcome through a real incremental rerender and rejects the old side effect', () => {
    const rendererFunctions = [
      script.slice(script.indexOf('  function resolveTurnId('), script.indexOf('  // ------------------------------------------------------------------\n  // 友好文案')),
      script.slice(script.indexOf('  function toolHeadline('), script.indexOf('  function timelineEntryLabel(')),
      script.slice(script.indexOf('  function ensureTurnBlock('), script.indexOf('  function startLiveTracking(')),
    ].join('\n');

    const runScenario = (source: string) => {
      const { document, nodes } = createRendererDomHarness();
      const state: any = {
        eventMaxId: 0, eventsTruncated: false, eventsError: '', eventsLoading: false,
        localRequest: null, conversationSignature: null, renderedConversationId: 'conversation-a',
        streamDom: new Map(), turnEvents: new Map(), turnIdToFactTask: new Map(),
        activeTurnId: null, truncatedNote: null, streamFollow: false,
      };
      const context: any = {
        state, document, Date, Map, Set, Array, String, JSON,
        NOTE_LIMIT: 16 * 1024, TOOL_OUTPUT_LIMIT: 8 * 1024,
        TERMINAL_OUTCOMES: new Set(['completed', 'failed']),
        OUTCOME_LABELS: { completed: '完成', failed: '失败' },
        clampText: (value: any, limit: number) => String(value == null ? '' : value).slice(0, limit),
        el: (id: string) => nodes.get(id),
        text: (id: string, value: any) => { const target = nodes.get(id); if (target) target.textContent = String(value == null ? '' : value); },
        eventsForTurn: (turnId: string) => state.turnEvents.get(turnId)?.events || [],
        resetConversationEvents: jest.fn(), loadConversationEvents: jest.fn(), scrollToLatest: jest.fn(),
      };
      vm.runInNewContext(`${source};this.render = renderConversation;`, context);
      const snapshot = {
        activeConversationId: 'conversation-a',
        conversation: [
          { taskId: 'task-old', turnId: 'turn-old', outcome: 'failed', verification: 'not_applicable', finalMessage: 'old fact' },
          { taskId: 'task-new', turnId: 'turn-new', outcome: 'completed', verification: 'verified', finalMessage: 'latest success' },
        ],
      };
      context.render(snapshot);
      const latestSignatureBefore = state.streamDom.get('task-new').outcomeSig;
      state.turnEvents.set('turn-old', { ids: new Set([101]), events: [
        { eventId: 101, type: 'turn_failed', turnId: 'turn-old', data: { error: 'older persisted failure detail' } },
      ] });
      state.eventMaxId = 101;
      context.render(snapshot);
      return {
        displayed: nodes.get('a9-turn-outcome')!.textContent,
        latestSignatureBefore,
        latestSignatureAfter: state.streamDom.get('task-new').outcomeSig,
      };
    };

    const fixed = runScenario(rendererFunctions);
    expect(fixed).toEqual(expect.objectContaining({
      displayed: 'completed · verified',
      latestSignatureAfter: fixed.latestSignatureBefore,
    }));

    const oldSideEffect = "    block.outcomeBodyEl.textContent = clampText(message || '任务已返回结果。', NOTE_LIMIT);";
    const globalProjection = "    text('a9-turn-outcome', latestProjection\n      ? `${latestProjection.outcome} · ${latestProjection.verification}`\n      : '');";
    expect(rendererFunctions).toContain(oldSideEffect);
    expect(rendererFunctions).toContain(globalProjection);
    const faultRestored = rendererFunctions
      .replace(oldSideEffect, `${oldSideEffect}\n    text('a9-turn-outcome', \`${'${outcome}'} · ${'${verification}'}\`);`)
      .replace(globalProjection, '    void latestProjection;');
    expect(runScenario(faultRestored).displayed).toBe('failed · not_applicable');
  });

  it('A9-19 F1/P02/P05: renders a running turn (persisted as active) live with its tool card, elapsed time and preview', () => {
    const rendererFunctions = [
      script.slice(script.indexOf('  function resolveTurnId('), script.indexOf('  // ------------------------------------------------------------------\n  // 友好文案')),
      script.slice(script.indexOf('  function toolHeadline('), script.indexOf('  function timelineEntryLabel(')),
      script.slice(script.indexOf('  function ensureTurnBlock('), script.indexOf('  function startLiveTracking(')),
    ].join('\n');
    const runScenario = (source: string, outcome: string, preview: any) => {
      const { document, nodes } = createRendererDomHarness();
      const turnEvents = new Map([['turn-live', { ids: new Set([1, 2]), events: [
        { eventId: 1, type: 'turn_started', turnId: 'turn-live', timestamp: new Date().toISOString(), data: {} },
        { eventId: 2, type: 'tool_start', turnId: 'turn-live', timestamp: new Date(Date.now() - 3000).toISOString(),
          data: { toolName: 'shell', callId: 'c1', args: { command: 'ping -n 30 127.0.0.1' } } },
      ] }]]);
      const state: any = {
        eventMaxId: 2, eventsTruncated: false, eventsError: '', eventsLoading: false, localRequest: null,
        conversationSignature: null, renderedConversationId: 'c', streamDom: new Map(), turnEvents,
        turnIdToFactTask: new Map(), activeTurnId: 'turn-live', truncatedNote: null, streamFollow: false,
        running: true, runningItems: new Set(), liveModelPreview: preview,
      };
      const context: any = {
        state, document, Date, Map, Set, Array, String, JSON, Number,
        NOTE_LIMIT: 16 * 1024, TOOL_OUTPUT_LIMIT: 8 * 1024,
        TERMINAL_OUTCOMES: new Set(['completed', 'completed_with_warnings', 'blocked', 'failed', 'cancelled', 'interrupted']),
        OUTCOME_LABELS: {},
        clampText: (value: any, limit: number) => String(value == null ? '' : value).slice(0, limit),
        formatElapsed: (ms: number) => `${Math.floor(ms / 1000)}秒`,
        el: (id: string) => nodes.get(id),
        text: (id: string, value: any) => { const target = nodes.get(id); if (target) target.textContent = String(value == null ? '' : value); },
        eventsForTurn: (turnId: string) => turnEvents.get(turnId)?.events || [],
        resetConversationEvents: jest.fn(), loadConversationEvents: jest.fn(), scrollToLatest: jest.fn(),
      };
      vm.runInNewContext(`${source};this.render = renderConversation;`, context);
      context.render({ activeConversationId: 'c', conversation: [{ taskId: 'task-1', turnId: null, outcome, requestPrompt: 'run the long shell task' }] });
      const block = state.streamDom.get('task-1');
      return { rendered: block.renderedEvents, stream: nodes.get('a9-task-stream')!.textContent };
    };

    for (const outcome of ['active', 'running', 'needs_approval']) {
      const live = runScenario(rendererFunctions, outcome, { turnId: 'turn-live', text: '正在分析日志输出…', updatedAt: 'x' });
      expect(live.rendered).toBe(2);
      expect(live.stream).toContain('运行命令 ping -n 30 127.0.0.1');
      expect(live.stream).toContain('执行中');
      expect(live.stream).toMatch(/已运行 \d+秒/);
      expect(live.stream).toContain('命令运行中；输出将在命令结束后显示。');
      expect(live.stream).toContain('模型正在输出');
      expect(live.stream).toContain('正在分析日志输出…');
    }
    // 预览只属于其轮次：其他轮次的预览不得出现在本轮。
    expect(runScenario(rendererFunctions, 'active', { turnId: 'turn-other', text: '别的轮次', updatedAt: 'x' }).stream).not.toContain('别的轮次');
    // 负向对照：恢复 A9-16 的非终态判定后，active 轮次在运行中拿不到任何过程事件。
    const oldBinding = rendererFunctions.replace(
      "!TERMINAL_OUTCOMES.has(fact.outcome) && state.activeTurnId\n      && !state.turnIdToFactTask.has(state.activeTurnId)",
      "(fact.outcome === 'running' || fact.outcome === 'needs_approval') && state.activeTurnId",
    );
    expect(oldBinding).not.toBe(rendererFunctions);
    expect(runScenario(oldBinding, 'active', null).rendered).toBe(0);
  });

  it('A9-19 L01: conversation rows keep the title and show only a short time', () => {
    const source = script.slice(script.indexOf('  function conversationStatusLabel('), script.indexOf('  function appendConversationGroup('));
    const context: any = { Date, String, Number };
    vm.runInNewContext(`${source};this.short = shortConversationTime;`, context);
    const now = new Date();
    expect(context.short(new Date(now.getTime() - 10 * 1000).toISOString())).toBe('刚刚');
    expect(context.short(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 5).toISOString())).toMatch(/^(00:05|刚刚)$/);
    expect(context.short(new Date(now.getFullYear() - 1, 2, 9, 10, 0).toISOString())).toBe(`${now.getFullYear() - 1}/3/9`);
    expect(context.short('')).toBe('');
    expect(script).toContain('meta.textContent = shortConversationTime(conversation.updatedAt);');
    expect(css).toContain('.conversation-list button { grid-template-columns: minmax(0, 1fr) auto; }');
  });

  it('retries bounded fact pages without losing facts and discards results after switching conversations', async () => {
    const source = script.slice(script.indexOf('  function sortedConversationFacts('), script.indexOf('  function renderSnapshot('));
    const { document, nodes, FakeNode } = createRendererDomHarness();
    nodes.set('conversation', new FakeNode());
    const cursor = { createdAt: '2', taskId: 'new' };
    const state: any = { activeConversationId: 'c', conversationPage: { hasMore: true, nextBefore: cursor },
      conversationFacts: new Map([['new', { taskId: 'new', createdAt: '2' }]]), snapshot: {},
      streamDom: new Map(), historyLoading: false, historyError: '', streamFollow: true };
    let resolvePage: any;
    const queryConversation = jest.fn().mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ ok: true, conversationId: 'c', facts: [{ taskId: 'old', createdAt: '1' }], hasMore: true, nextBefore: { createdAt: '1', taskId: 'old' } })
      .mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
    const context: any = { state, document, Array, a9: { queryConversation },
      el: (id: string) => nodes.get(id), renderConversation: jest.fn(), errorMessage: () => '加载失败，请重试' };
    vm.runInNewContext(source + ';this.load = loadOlderConversation;', context);
    await context.load();
    expect(state.historyError).toContain('重试');
    expect(state.conversationFacts.size).toBe(1);
    expect(state.conversationPage.nextBefore).toEqual(cursor);
    await context.load();
    expect(queryConversation.mock.calls[1][0]).toEqual({ conversationId: 'c', before: cursor, limit: 20 });
    expect(state.snapshot.conversation.map((x: any) => x.taskId)).toEqual(['old', 'new']);
    expect(state.streamFollow).toBe(true);
    const pending = context.load();
    state.activeConversationId = 'other';
    resolvePage({ ok: true, conversationId: 'c', facts: [{ taskId: 'wrong', createdAt: '0' }] });
    await pending;
    expect(state.conversationFacts.has('wrong')).toBe(false);
  });

  it('signals initial readiness before optional history, Git and diagnostics work', async () => {
    const source = script.slice(script.indexOf('  async function initialize('), script.indexOf('  root.win7AgentA9Workbench'));
    const order: string[] = [];
    const deferred: Function[] = [];
    const context: any = { api: { signalReady: () => order.push('ready') }, a9: {}, state: { snapshot: {} },
      bind: () => order.push('bind'), refreshSnapshot: async () => { order.push('snapshot'); },
      root: { setTimeout: (fn: Function) => deferred.push(fn) }, text: () => {},
      loadConversationEvents: () => order.push('history'), refreshGit: () => { throw new Error('eager git'); },
      refreshDiagnostics: () => { throw new Error('eager diagnostics'); } };
    vm.runInNewContext(source + ';this.initialize = initialize;', context);
    await context.initialize();
    expect(order).toEqual(['bind', 'snapshot', 'ready']);
    deferred[0]();
    expect(order[3]).toBe('history');
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

  function createPaneHarness() {
    class PaneNode {
      children: PaneNode[] = [];
      parentNode: PaneNode | null = null;
      attrs = new Map<string, string>();
      classes = new Set<string>();
      nodeListeners = new Map<string, Array<() => void>>();
      dataset: Record<string, string> = {};
      style: Record<string, string> = {};
      hidden = false;
      disabled = false;
      open = false;
      scrollTop = 0;
      scrollHeight = 0;
      value = '';
      private ownText = '';
      constructor(public tagName = 'div') {}
      get textContent() { return this.ownText + this.children.map((c) => c.textContent).join(''); }
      set textContent(v: string) { this.ownText = String(v == null ? '' : v); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; }
      get className() { return Array.from(this.classes).join(' '); }
      set className(v: string) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
      get classList() {
        const self = this;
        return {
          add: (...names: string[]) => names.forEach((n) => self.classes.add(n)),
          remove: (...names: string[]) => names.forEach((n) => self.classes.delete(n)),
          contains: (n: string) => self.classes.has(n),
          toggle: (n: string, on?: boolean) => {
            const target = on === undefined ? !self.classes.has(n) : Boolean(on);
            if (target) self.classes.add(n); else self.classes.delete(n);
            return target;
          },
        };
      }
      appendChild(child: PaneNode) { child.parentNode = this; this.children.push(child); return child; }
      setAttribute(name: string, value: string) { this.attrs.set(name, String(value)); }
      getAttribute(name: string) { return this.attrs.has(name) ? String(this.attrs.get(name)) : null; }
      addEventListener(type: string, handler: () => void) {
        const list = this.nodeListeners.get(type) || [];
        list.push(handler);
        this.nodeListeners.set(type, list);
      }
      fire(type: string) { (this.nodeListeners.get(type) || []).forEach((h) => h()); }
      focus() { this.attrs.set('data-focused', 'true'); documentStub.activeElement = this; }
      select() { this.attrs.set('data-selected', 'true'); }
      contains(node: PaneNode | null) {
        let cur: PaneNode | null = node;
        while (cur) { if (cur === this) return true; cur = cur.parentNode; }
        return false;
      }
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; }
    }
    const nodes = new Map<string, PaneNode>();
    const listeners: Record<string, Array<(event?: unknown) => void>> = {};
    const workbench = new PaneNode('main');
    const windowListeners: Record<string, Array<() => void>> = {};
    const windowStub: any = {
      win7Agent: { a9: { snapshot: () => new Promise(() => {}) }, signalReady: jest.fn() },
      addEventListener: (type: string, handler: () => void) => { (windowListeners[type] ||= []).push(handler); },
      innerWidth: 1366,
      setInterval, clearInterval, setTimeout, clearTimeout,
    };
    const documentStub: any = {
      getElementById: (id: string) => { if (!nodes.has(id)) nodes.set(id, new PaneNode()); return nodes.get(id); },
      querySelector: (selector: string) => (selector === '.workbench' ? workbench : null),
      querySelectorAll: () => [],
      createElement: (tagName?: string) => new PaneNode(String(tagName || 'div')),
      createTextNode: (t: string) => { const n = new PaneNode('#text'); n.textContent = t; return n; },
      addEventListener: (type: string, handler: (event?: unknown) => void) => { (listeners[`document:${type}`] ||= []).push(handler); },
      body: new PaneNode('body'),
      activeElement: null,
    };
    const sink: any = {};
    return {
      nodes, listeners, workbench, windowStub, sink,
      document: documentStub,
      run(source: string, extra?: string) {
        vm.runInNewContext(source + (extra || ''), { window: windowStub, document: documentStub, console, Promise, Set, Map, Object, Array, String, Number, Date, sink });
      },
      ready() { (listeners['document:DOMContentLoaded'] || []).forEach((h) => h()); },
      fireWindow(type: string) { (windowListeners[type] || []).forEach((h) => h()); },
    };
  }

  it('implements the A9-16 four-state responsive shell and dense conversation directory (U01-U06)', () => {
    expect(css).toContain('@media (min-width: 1200px)');
    expect(css).toContain('.workbench.rail-closed');
    expect(css).toContain('.workbench.inspector-closed');
    expect(css).toContain('.workbench.rail-closed.inspector-closed');
    expect(css).toContain('.rail-inner {');
    expect(css).toContain('.inspector-inner {');
    expect(css).toContain('.workbench.rail-closed .rail-inner');
    expect(css).toMatch(/@media \(max-width: 1199px\)[\s\S]*\.workbench\.rail-closed/);
    expect(css).toContain('.conversation-list button { display: grid');
    expect(css).toContain('.conversation-list .conversation-group-head');
    expect(html).toContain('class="rail-inner"');
    expect(html).toContain('class="inspector-inner"');
    expect(html).toContain('id="trust-note"');
    expect(html).toContain('aria-label="开关左侧导航"');
    expect(html).toContain('aria-label="开关检查器"');
    expect(script).toContain("setWorkbenchPaneClass('inspector-closed', true)");
    expect(script).toContain('function appendConversationGroup(');
    expect(script).toContain('function syncPaneState()');
    expect(script).toContain("root.addEventListener('resize', syncPaneState)");
    expect(script).toContain('function toggleNavigation()');
    // U06：≤799px 的抽屉断点必须把桌面折叠类压回单列，否则主对话区会落进 0 宽列。
    expect(css).toMatch(/@media \(max-width: 799px\)[\s\S]*\.workbench\.rail-closed \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    // U02 密度：行与组头是左栏高度预算的两个乘数。
    expect(css).toContain('.conversation-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px; margin: 1px 0; }');
    expect(css).toContain('.conversation-list .conversation-group-head { display: flex; align-items: baseline; justify-content: space-between; min-height: 20px;');
  });

  it('keeps the A9-16 rail height budget above the U02 floor of four visible conversation rows', () => {
    // 静态预算模型：U02 要求 1366x768 / 100% DPI 默认工作台至少完整显示 4 条普通对话行。
    // 无法在契约测试里跑真实布局时，把「左栏固定 chrome 合计」钉住，任何把
    // chrome 撑大或把行/组头撑高的改动都会在这里失败并给出新行数。
    const rule = (selector: string): string => {
      const pattern = selector.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      const match = css.match(new RegExp(`${pattern}\\s*\\{([^}]*)\\}`));
      expect(match).not.toBeNull();
      return match![1];
    };
    const px = (selector: string, property: string): number => {
      const match = rule(selector).match(new RegExp(`(?:^|;)\\s*${property}:\\s*(-?[\\d.]+)px`));
      expect(match).not.toBeNull();
      return Number.parseFloat(match![1]);
    };
    const box = (selector: string, property: string): number[] => {
      const match = rule(selector).match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`));
      expect(match).not.toBeNull();
      const values = Array.from(match![1].matchAll(/(-?[\d.]+)px/g)).map((m) => Number.parseFloat(m[1]));
      if (values.length === 1) return [values[0], values[0], values[0], values[0]];
      if (values.length === 2) return [values[0], values[1], values[0], values[1]];
      if (values.length === 3) return [values[0], values[1], values[2], values[1]];
      return values;
    };
    const LINE = (fontSize: number, lineHeight: number) => fontSize * lineHeight;

    const chrome = 2 * box('.rail-inner', 'padding')[0]
      + Math.max(px('.brand-mark', 'height'), LINE(14, 1.55) + LINE(11, 1.4)) + box('.brand', 'padding')[2]
      + (LINE(11, 1.55) + px('.workspace-card > span:first-child', 'margin-bottom')) + LINE(14, 1.55)
      + (4 + LINE(12, 1.55)) + 2 * box('.workspace-card', 'padding')[0]
      + 2 * 44 + 4 + 2 * box('.product-nav', 'margin')[0]
      + 2 * box('.rail-task', 'padding')[0] + 2 + LINE(11, 1.4)
      + (px('.rail-task-state', 'margin-top') + LINE(13, 1.55)) + (box('.rail-task p', 'margin')[0] + LINE(11, 1.45))
      + px('.trust-note summary', 'min-height') + 2 + box('.trust-note', 'margin')[2]
      + 40;
    const directory = (768 - chrome) - box('.conversation-directory', 'margin')[2] - 2;
    const overhead = px('.conversation-directory > header', 'min-height')
      + box('.conversation-search', 'padding')[0] + box('.conversation-search', 'padding')[2] + px('.conversation-search input', 'min-height')
      + px('.conversation-current-actions button', 'min-height') + 1
      // 最坏情况还包含可见的归档区折叠摘要（有已归档对话时必然出现）。
      + px('.conversation-archive-section summary', 'min-height') + 2
      + (2 * box('.conversation-directory-note', 'padding')[0] + LINE(11, 1.55));
    const list = directory - overhead;
    const step = (selector: string) => px(selector, 'min-height') + 2 * box('.conversation-list li', 'margin')[0];
    const rowStep = step('.conversation-list button');
    const headStep = step('.conversation-list .conversation-group-head');

    expect(list).toBeGreaterThan(0);
    // 最坏情况是「进行中 / 更早」两个组头都出现。
    const rows = Math.floor((list - 2 * headStep) / rowStep);
    expect(rows).toBeGreaterThanOrEqual(4);
  });

  it('binds directory-note layout selectors to the real HTML node (static-green/real-red guard)', () => {
    // WIN7-35 根因：预算模型读的是 `.conversation-directory-note`，但 workbench.html
    // 上该节点只有 `class="quiet"`。选择器未命中时 UA 默认 p 外边距（1em×2）会多吃约 28px，
    // 静态预算仍绿、真实 1079×540 几何只剩 3 行。这里把「选择器必须命中真实节点」钉死。
    const noteTag = html.match(/<p id="conversation-directory-note"([^>]*)>/);
    expect(noteTag).not.toBeNull();
    const classAttr = noteTag![1].match(/class="([^"]*)"/);
    expect(classAttr).not.toBeNull();
    const classes = classAttr![1].split(/\s+/);
    expect(classes).toContain('conversation-directory-note');
    // 紧凑层必须同时用 class 与 id 覆盖，避免再次漏绑。
    const compactStart = css.indexOf('@media (max-height: 650px)');
    const compactCss = css.slice(compactStart);
    expect(compactCss).toMatch(/#conversation-directory-note\s*\{[^}]*margin:\s*0/);
    expect(compactCss).toMatch(/#conversation-directory-note\s*\{[^}]*white-space:\s*nowrap/);
    // 列表禁止横向滚动条：Win7 经典滚动条会吃掉 clientHeight，制造「模型 4 行、实机 3 行」。
    expect(css).toMatch(/\.conversation-list\s*\{[^}]*overflow-x:\s*hidden/);
  });

  it('keeps four 36px rows visible in the real 125% DPI worst-form height budget (U02/U07)', () => {
    // WIN7-35 实机：1366x768、120 DPI、可用内容视口 1079x540 CSS px（不是被最小窗口
    // 钳大的 1080x584）。最坏形态同时出现 Stop、两个组头、归档摘要与目录状态。
    // 本模型必须按「已绑定到真实节点」的声明值计高；未绑定选择器不得再假装生效。
    const compactStart = css.indexOf('@media (max-height: 650px)');
    const compactEnd = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(compactStart).toBeGreaterThanOrEqual(0);
    expect(compactEnd).toBeGreaterThan(compactStart);
    const compactCss = css.slice(compactStart, compactEnd);
    const noteTag = html.match(/<p id="conversation-directory-note"([^>]*)>/);
    expect(noteTag).not.toBeNull();
    expect(noteTag![1]).toMatch(/class="[^"]*\bconversation-directory-note\b/);

    const rule = (selector: string): string => {
      const pattern = selector.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      const match = compactCss.match(new RegExp(`${pattern}\\s*\\{([^}]*)\\}`));
      expect(match).not.toBeNull();
      return match![1];
    };
    const px = (selector: string, property: string): number => {
      const match = rule(selector).match(new RegExp(`(?:^|;)\\s*${property}:\\s*(-?[\\d.]+)px`));
      expect(match).not.toBeNull();
      return Number.parseFloat(match![1]);
    };
    const box = (selector: string, property: string): number[] => {
      const match = rule(selector).match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`));
      expect(match).not.toBeNull();
      const values = Array.from(match![1].matchAll(/(-?[\d.]+)px/g)).map((item) => Number.parseFloat(item[1]));
      if (values.length === 1) return [values[0], values[0], values[0], values[0]];
      if (values.length === 2) return [values[0], values[1], values[0], values[1]];
      if (values.length === 3) return [values[0], values[1], values[2], values[1]];
      return values;
    };
    const LINE = (fontSize: number, lineHeight: number) => fontSize * lineHeight;
    const baseBox = (selector: string, property: string): number[] => {
      const pattern = selector.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      const match = css.slice(0, compactStart).match(new RegExp(`${pattern}\\s*\\{([^}]*)\\}`));
      expect(match).not.toBeNull();
      const declaration = match![1].match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`));
      expect(declaration).not.toBeNull();
      const values = Array.from(declaration![1].matchAll(/(-?[\d.]+)px/g)).map((item) => Number.parseFloat(item[1]));
      if (values.length === 1) return [values[0], values[0], values[0], values[0]];
      if (values.length === 2) return [values[0], values[1], values[0], values[1]];
      if (values.length === 3) return [values[0], values[1], values[2], values[1]];
      return values;
    };

    expect(rule('.product-nav')).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)');
    expect(rule('.nav-item i')).toContain('display: none');
    // 行高合同不可借紧凑模式缩小。
    expect(compactCss).not.toMatch(/\.conversation-list button\s*\{[^}]*min-height:/);
    // 注记必须单行，否则 Win7 字体度量换行会再次吃掉列表高度。
    expect(rule('#conversation-directory-note')).toContain('white-space: nowrap');
    expect(rule('#conversation-directory-note')).toContain('margin: 0');

    // 真实视口/DPR/行数由白名单内可重放探针读取；本静态模型不得用常量比较假装已验证。
    // 失败式回归门是 verify-geometry-probe.mjs（不符非零退出），Jest 只锁定探针合同存在。
    const probeDir = path.join(__dirname, '../../../../docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair');
    const probeJs = fs.readFileSync(path.join(probeDir, 'probe/probe.js'), 'utf8');
    const probeHtml = fs.readFileSync(path.join(probeDir, 'probe/index.html'), 'utf8');
    const verifyGate = fs.readFileSync(path.join(probeDir, 'verify-geometry-probe.mjs'), 'utf8');
    // 根目录不得再承载探针入口（保持 C14 白名单外零实现文件）。
    expect(fs.existsSync(path.join(__dirname, '../../../../index.html'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../../../../probe.js'))).toBe(false);
    expect(probeHtml).toContain('id="conversation-list"');
    expect(probeHtml).toContain('id="conversation-directory-note"');
    expect(probeHtml).not.toContain('probe-banner');
    expect(probeHtml).not.toContain('AI生成');
    expect(probeJs).toContain('CLAMPED_HEIGHT = 584');
    expect(probeJs).toContain('TARGET = { width: 1079, height: 540 }');
    expect(probeJs).toContain('devicePixelRatio');
    expect(probeJs).toContain('INVALID_VIEWPORT_CLAMPED_584');
    expect(probeJs).toContain('INVALID_VIEWPORT_UNEXPECTED');
    expect(probeJs).toMatch(/innerHeight !== TARGET\.height|vh !== TARGET\.height/);
    expect(probeJs).toContain('fully_visible_rows');
    expect(probeJs).toContain('fully_in_viewport');
    expect(probeJs).toContain('stop_in_viewport');
    expect(probeJs).toContain('workbench_origin_ok');
    expect(probeJs).toContain('applySelectorMissSimulation');
    expect(probeJs).toContain('vh === CLAMPED_HEIGHT');
    expect(verifyGate).toContain('requireWorkbenchOrigin');
    // 失败式门：解析三组实测结果，不符必须非零退出。
    expect(verifyGate).toContain('A9_GEOMETRY_VERIFY_FAIL');
    expect(verifyGate).toContain('process.exit(1)');
    expect(verifyGate).toContain('INVALID_VIEWPORT_CLAMPED_584');
    expect(verifyGate).toContain('simulate=selector-miss');
    expect(verifyGate).toContain('stop_in_viewport');
    // 静态预算仍按物理可用 540 计算；584 是探针的无效视口，不是第二目标。
    const PHYSICAL_CONTENT_HEIGHT = 540;

    const chrome = 2 * box('.rail-inner', 'padding')[0]
      + Math.max(px('.brand-mark', 'height'), px('.navigation-close', 'height'), px('.brand', 'min-height'))
      + px('.workspace-card', 'min-height')
      // 两个产品入口在紧凑高度下横排，因此只占一行。
      + px('.nav-item', 'min-height')
      // 运行中状态与 Stop 横排；边框在 border-box 高度外只计 rail-task 自身的上下边框。
      + 2 * box('.rail-task', 'padding')[0] + 2
      + Math.max(LINE(12, 1.55), px('.rail-stop', 'min-height'))
      + px('.trust-note summary', 'min-height') + 2 + px('.trust-note', 'margin-bottom')
      + px('.utility', 'min-height');
    const directory = PHYSICAL_CONTENT_HEIGHT - chrome - px('.conversation-directory', 'margin-bottom');
    const noteDecl = rule('#conversation-directory-note');
    // 已绑定 + nowrap + margin:0 时，注记只占一行；若缺 nowrap，按 2 行计入以使模型变红。
    const noteLines = /white-space:\s*nowrap/.test(noteDecl) ? 1 : 2;
    const noteFont = (noteDecl.match(/font-size:\s*([\d.]+)px/) || [])[1];
    const noteLh = (noteDecl.match(/line-height:\s*([\d.]+)/) || [])[1];
    expect(noteFont).toBeTruthy();
    expect(noteLh).toBeTruthy();
    const noteHeight = noteLines * LINE(Number(noteFont), Number(noteLh)) + 1;
    const overhead = 2
      + px('.conversation-directory > header', 'min-height')
      + box('.conversation-search', 'padding')[0] + box('.conversation-search', 'padding')[2]
      + px('.conversation-search input', 'min-height')
      + px('.conversation-current-actions button', 'min-height') + 1
      + px('.conversation-archive-section summary', 'min-height') + 1
      + noteHeight
      + 2 * baseBox('.conversation-list', 'padding')[0];
    const listClientHeight = directory - (overhead - 2 * baseBox('.conversation-list', 'padding')[0]);
    const listContent = directory - overhead;
    // 与 measure3 探针同口径：按钮边框盒必须完整落在 list 的 border-box 内。
    // 相邻 li 外边距折叠为 1px，组头 20px、行 36px；最坏序列是 H1 R1 H2 R2 R3 R4。
    const listPad = baseBox('.conversation-list', 'padding')[0];
    const rowStep = 36 + 1;
    const headStep = 20 + 1;
    const fourthButtonBottom = listPad + 2 * headStep + 4 * rowStep;
    expect(listContent).toBeGreaterThan(0);
    expect(listClientHeight).toBeGreaterThanOrEqual(fourthButtonBottom);
    // 同时用整除模型给出可读行数，便于失败时对照。
    const rows = Math.floor((listContent - 2 * headStep) / rowStep);
    expect(rows).toBeGreaterThanOrEqual(4);
  });

  it('drives desktop four-state panes through state classes without rebuilding conversation DOM (U03-U05)', () => {
    const h = createPaneHarness();
    h.run(script);
    h.ready();
    const openInspectorBtn = h.nodes.get('open-inspector')!;
    const openNavigationBtn = h.nodes.get('open-navigation')!;
    const conversationList = h.nodes.get('conversation-list')!;
    expect(h.workbench.classList.contains('rail-closed')).toBe(false);
    expect(h.workbench.classList.contains('inspector-closed')).toBe(false);
    expect(openInspectorBtn.getAttribute('aria-expanded')).toBe('true');
    openInspectorBtn.fire('click');
    expect(h.workbench.classList.contains('inspector-closed')).toBe(true);
    expect(openInspectorBtn.getAttribute('aria-expanded')).toBe('false');
    openNavigationBtn.fire('click');
    expect(h.workbench.classList.contains('rail-closed')).toBe(true);
    expect(h.workbench.classList.contains('inspector-closed')).toBe(true);
    expect(h.nodes.get('conversation-list')).toBe(conversationList);
    openNavigationBtn.fire('click');
    expect(h.workbench.classList.contains('rail-closed')).toBe(false);
    expect(h.workbench.classList.contains('inspector-closed')).toBe(true);
    openInspectorBtn.fire('click');
    expect(h.workbench.classList.contains('inspector-closed')).toBe(false);
    h.windowStub.innerWidth = 1100;
    openInspectorBtn.fire('click');
    expect(h.workbench.classList.contains('inspector-closed')).toBe(false);
    expect(h.nodes.get('inspector')!.classList.contains('open')).toBe(true);
    expect(h.nodes.get('inspector-backdrop')!.hidden).toBe(false);
    expect(openInspectorBtn.getAttribute('aria-expanded')).toBe('true');
    h.nodes.get('close-inspector')!.fire('click');
    expect(h.nodes.get('inspector')!.classList.contains('open')).toBe(false);
    expect(h.nodes.get('inspector-backdrop')!.hidden).toBe(true);
    h.windowStub.innerWidth = 760;
    openNavigationBtn.fire('click');
    expect(h.nodes.get('navigation-rail')!.classList.contains('open')).toBe(true);
    h.nodes.get('close-navigation')!.fire('click');
    expect(h.nodes.get('navigation-rail')!.classList.contains('open')).toBe(false);
  });

  it('opens a collapsed navigation pane before Ctrl+K focuses and selects search (U03/U14)', () => {
    const h = createPaneHarness();
    h.run(script);
    h.ready();
    const navBtn = h.nodes.get('open-navigation')!;
    const search = h.nodes.get('conversation-search')!;
    navBtn.fire('click');
    expect(h.workbench.classList.contains('rail-closed')).toBe(true);

    const preventDefault = jest.fn();
    (h.listeners['document:keydown'] || []).forEach((handler) => handler({
      key: 'k', ctrlKey: true, altKey: false, shiftKey: false, preventDefault,
    }));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(h.workbench.classList.contains('rail-closed')).toBe(false);
    expect(h.document.activeElement).toBe(search);
    expect(search.getAttribute('data-selected')).toBe('true');
    expect(navBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('re-syncs drawer and desktop pane state across breakpoints without collapsing open sidebars (U06)', () => {
    const h = createPaneHarness();
    h.run(script);
    h.ready();
    const wb = h.workbench;
    const rail = h.nodes.get('navigation-rail')!;
    const inspector = h.nodes.get('inspector')!;
    const navBtn = h.nodes.get('open-navigation')!;
    const inspectorBtn = h.nodes.get('open-inspector')!;

    // 桌面默认左右均开。
    expect(navBtn.getAttribute('aria-expanded')).toBe('true');
    expect(inspectorBtn.getAttribute('aria-expanded')).toBe('true');

    // 回归（U06/U05）：桌面断点上的任何 resize 都不得折叠用户打开的侧栏。
    h.fireWindow('resize');
    expect(wb.classList.contains('inspector-closed')).toBe(false);
    expect(wb.classList.contains('rail-closed')).toBe(false);
    expect(navBtn.getAttribute('aria-expanded')).toBe('true');
    expect(inspectorBtn.getAttribute('aria-expanded')).toBe('true');

    // 用户显式折叠两侧后，resize 也不得把折叠翻转回展开。
    inspectorBtn.fire('click');
    navBtn.fire('click');
    expect(wb.classList.contains('inspector-closed')).toBe(true);
    expect(wb.classList.contains('rail-closed')).toBe(true);
    h.fireWindow('resize');
    expect(wb.classList.contains('inspector-closed')).toBe(true);
    expect(wb.classList.contains('rail-closed')).toBe(true);
    expect(navBtn.getAttribute('aria-expanded')).toBe('false');
    expect(inspectorBtn.getAttribute('aria-expanded')).toBe('false');

    // 缩到 ≤799px：导航变抽屉，折叠类不再表达可见性，aria 跟随抽屉状态。
    h.windowStub.innerWidth = 700;
    h.fireWindow('resize');
    expect(navBtn.getAttribute('aria-expanded')).toBe('false');
    expect(rail.classList.contains('open')).toBe(false);

    // 打开抽屉：先清掉残留的桌面折叠类，再进入抽屉态。
    navBtn.fire('click');
    expect(rail.classList.contains('open')).toBe(true);
    expect(wb.classList.contains('rail-closed')).toBe(false);
    expect(h.nodes.get('navigation-backdrop')!.hidden).toBe(false);
    expect(navBtn.getAttribute('aria-expanded')).toBe('true');

    // 放大回桌面：抽屉机制退场，桌面态是「展开」而不是被 resize 折叠。
    h.windowStub.innerWidth = 1366;
    h.fireWindow('resize');
    expect(rail.classList.contains('open')).toBe(false);
    expect(h.nodes.get('navigation-backdrop')!.hidden).toBe(true);
    expect(wb.classList.contains('rail-closed')).toBe(false);
    expect(navBtn.getAttribute('aria-expanded')).toBe('true');

    // 800–1199px：导航仍是可关的列，Inspector 才是抽屉。
    h.windowStub.innerWidth = 1100;
    h.fireWindow('resize');
    expect(inspectorBtn.getAttribute('aria-expanded')).toBe('false');
    navBtn.fire('click');
    expect(wb.classList.contains('rail-closed')).toBe(true);
    expect(navBtn.getAttribute('aria-expanded')).toBe('false');
    navBtn.fire('click');
    expect(wb.classList.contains('rail-closed')).toBe(false);
    inspectorBtn.fire('click');
    expect(inspector.classList.contains('open')).toBe(true);
    expect(inspectorBtn.getAttribute('aria-expanded')).toBe('true');
    h.nodes.get('close-inspector')!.fire('click');
    expect(inspector.classList.contains('open')).toBe(false);
    h.windowStub.innerWidth = 1366;
    h.fireWindow('resize');
    // 抽屉关闭后回到桌面，Inspector 是列，必须自报展开。
    expect(inspectorBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders the A9-16 conversation directory with live/older group heads and single-line rows (U01/A-3)', () => {
    const h = createPaneHarness();
    const source = script.slice(script.indexOf('  function conversationStatusLabel('), script.indexOf('  function hydrateDraft('));
    const el = (id: string) => h.document.getElementById(id) as any;
    const context: any = {
      Date, document: h.document,
      state: { searchQuery: '' },
      el,
      text: (id: string, value: unknown) => { el(id).textContent = String(value); },
      switchConversation: () => {},
    };
    vm.runInNewContext(source + ';this.renderDirectory = renderConversationDirectory;', context);
    const snapshot = {
      activeConversationId: 's1',
      conversationControls: { canSwitch: true, maxActive: 16 },
      conversations: [
        { sessionId: 's1', title: '运行中对话', state: 'active', activity: 'running' },
        { sessionId: 's2', title: '空闲对话', state: 'active', activity: 'idle' },
        { sessionId: 's3', title: '已归档对话', state: 'archived', activity: 'idle' },
      ],
    };
    context.renderDirectory(snapshot);
    const list = h.nodes.get('conversation-list')!;
    const heads = list.children.filter((c) => c.classList.contains('conversation-group-head'));
    expect(heads).toHaveLength(2);
    expect(heads[0].textContent).toBe('进行中1');
    expect(heads[1].textContent).toBe('更早1');
    const runningRow = list.children[1].children[0];
    expect(runningRow.getAttribute('aria-current')).toBe('true');
    const archiveCount = h.nodes.get('conversation-archive-count')!;
    expect(archiveCount.textContent).toBe('1');
  });
});
