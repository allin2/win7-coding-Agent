import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

// Same vm + fake DOM approach as a9-workbench-contract.test.ts. The whole
// production script runs unchanged except for exposing chooseWorkspace/state.
class FakeNode {
  children: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  className = '';
  value = '';
  hidden = false;
  disabled = false;
  open = false;
  type = '';
  title = '';
  scrollTop = 0;
  scrollHeight = 0;
  private ownText = '';
  private listeners = new Map<string, Array<() => void>>();
  constructor(readonly tagName = 'div') {}
  classList = {
    contains: (name: string) => this.className.split(/\s+/).includes(name),
    add: (name: string) => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
    remove: (name: string) => { this.className = this.className.split(/\s+/).filter((item) => item !== name).join(' '); },
    toggle: (name: string, enabled: boolean) => { if (enabled) this.classList.add(name); else this.classList.remove(name); },
  };
  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(''); }
  set textContent(value: string) {
    this.ownText = String(value == null ? '' : value);
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
  }
  get firstChild(): FakeNode | null { return this.children[0] || null; }
  appendChild(child: FakeNode) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child: FakeNode, before: FakeNode | null) {
    child.remove(); child.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, child); else this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((item) => item !== this);
    this.parentNode = null;
  }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  removeAttribute(name: string) { delete this.attributes[name]; }
  focus() {}
  addEventListener(type: string, handler: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), handler]);
  }
  click() { (this.listeners.get('click') || []).forEach((handler) => handler()); }
  querySelectorAll(selector: string): FakeNode[] {
    const found: FakeNode[] = [];
    const visit = (parent: FakeNode) => parent.children.forEach((child) => {
      if (selector === child.tagName || (selector === 'details[open]' && child.tagName === 'details' && child.open)
        || (selector === '.legacy-note:not(.conversation-history-note)' && child.classList.contains('legacy-note')
          && !child.classList.contains('conversation-history-note'))) found.push(child);
      visit(child);
    });
    visit(this);
    return found;
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] || null; }
}

it('R5-01 real workbench loads 300 of 2500 events on workspace selection without warmup', async () => {
  const script = fs.readFileSync(path.join(__dirname, '../../product/renderer/a9-workbench.js'), 'utf8');
  const nodes = new Map<string, FakeNode>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, new FakeNode());
    return nodes.get(id)!;
  };
  const workspaceRoot = 'C:\\w39\\中文 空格';
  const conversationId = 'seed-conversation';
  const facts = Array.from({ length: 10 }, (_, index) => ({
    taskId: `seed-task-${index}`, turnId: `seed-turn-${index}`, requestPrompt: `seed ${index}`,
    outcome: 'completed', verification: 'not_applicable', createdAt: String(index).padStart(2, '0'),
  }));
  const history = Array.from({ length: 2500 }, (_, index) => ({
    eventId: index + 1, turnId: `seed-turn-${Math.floor(index / 250)}`, eventType: 'model_note',
    payload: { type: 'model_note', data: { content: `seed event ${index + 1}` } },
  }));
  const snapshot = () => ({ status: 'ready', mode: 'full_access', workspaceRoot, activeConversationId: conversationId,
    provider: { configured: true, probe: { classification: 'tool_calling' } }, agentStatus: 'idle',
    conversation: facts,
    conversationPage: { hasMore: false }, timeline: [], checkpoints: [], conversations: [],
  });
  const queryEvents = jest.fn(async ({ conversationId: requested, limit }: any) => {
    expect(requested).toBe(conversationId);
    return { ok: true, events: history.slice(-limit), hasMore: history.length > limit };
  });
  const window: any = { win7Agent: {
    selectWorkspace: jest.fn(async () => ({ selected: { workspacePath: workspaceRoot } })),
    listSessions: jest.fn(async () => ({ sessions: [{ sessionId: 'explorer', status: 'ACTIVE', workspacePath: workspaceRoot }] })),
    listWorkspace: jest.fn(async () => ({ ok: true, result: { path: '', entries: [] } })),
    a9: {
      snapshot: jest.fn(async () => ({ ok: true, snapshot: snapshot() })),
      saveDraft: jest.fn(async () => ({ ok: true })), queryEvents,
    },
  }, setInterval: jest.fn(() => 1), clearInterval: jest.fn(), setTimeout: jest.fn(), clearTimeout: jest.fn() };
  const document = { getElementById: node, createElement: (tag: string) => new FakeNode(tag),
    createTextNode: (value: string) => { const text = new FakeNode(); text.textContent = value; return text; },
    addEventListener: jest.fn(), querySelectorAll: () => [],
  };
  const instrumented = script.replace('  root.win7AgentA9Workbench = Object.freeze({',
    '  root.__w39 = { chooseWorkspace, appendReviewFiles, state };\n  root.win7AgentA9Workbench = Object.freeze({');
  vm.runInNewContext(instrumented, { window, document, Date });
  await window.__w39.chooseWorkspace();
  expect(window.win7Agent.selectWorkspace).toHaveBeenCalledTimes(1);
  expect(node('error-banner').textContent).toBe('');
  expect(queryEvents).toHaveBeenCalledTimes(1);
  expect(window.__w39.state.inspectorEvents.size).toBe(300);
  expect(window.__w39.state.inspectorEvents.has(2500)).toBe(true);
  const topNote = node('a9-task-stream').firstChild!;
  expect(topNote.classList.contains('legacy-note')).toBe(true);
  expect(topNote.classList.contains('conversation-history-note')).toBe(false);
  const button = topNote.querySelector('button')!;
  expect(button.textContent).toBe('加载更早记录');
  expect(button.disabled).toBe(false);
});

function makeWorkbench(query: (request: any) => Promise<any>, empty = false) {
  const script = fs.readFileSync(path.join(__dirname, '../../product/renderer/a9-workbench.js'), 'utf8');
  const nodes = new Map<string, FakeNode>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, new FakeNode());
    return nodes.get(id)!;
  };
  let workspaceRoot = 'C:\\history-a';
  const queryEvents = jest.fn(query);
  const snapshot = () => ({ status: 'ready', mode: 'full_access', workspaceRoot,
    activeConversationId: empty ? null : workspaceRoot.includes('-b') ? 'conversation-b' : 'conversation-a',
    provider: { configured: true, probe: { classification: 'tool_calling' } }, agentStatus: 'idle',
    conversation: empty ? [] : [{ taskId: 'task-1', turnId: 'turn-1', requestPrompt: 'old',
      outcome: 'completed', verification: 'not_applicable' }],
    conversationPage: { hasMore: false }, timeline: [], checkpoints: [], conversations: [],
  });
  const window: any = { win7Agent: {
    selectWorkspace: jest.fn(async () => ({ selected: { workspacePath: workspaceRoot } })),
    listSessions: jest.fn(async () => ({ sessions: [{ sessionId: 'explorer', status: 'ACTIVE', workspacePath: workspaceRoot }] })),
    listWorkspace: jest.fn(async () => ({ ok: true, result: { path: '', entries: [] } })),
    a9: { snapshot: jest.fn(async () => ({ ok: true, snapshot: snapshot() })),
      saveDraft: jest.fn(async () => ({ ok: true })), queryEvents },
  }, setInterval: jest.fn(() => 1), clearInterval: jest.fn(), setTimeout: jest.fn(), clearTimeout: jest.fn() };
  const document = { getElementById: node, createElement: (tag: string) => new FakeNode(tag),
    createTextNode: (value: string) => { const text = new FakeNode(); text.textContent = value; return text; },
    addEventListener: jest.fn(), querySelectorAll: () => [],
    querySelector: (selector: string) => {
      if (selector !== '#a9-task-stream .legacy-note:not(.conversation-history-note)') throw new Error('Unsupported selector: ' + selector);
      return node('a9-task-stream').querySelector('.legacy-note:not(.conversation-history-note)');
    },
  };
  const instrumented = script.replace('  root.win7AgentA9Workbench = Object.freeze({',
    '  root.__w39 = { chooseWorkspace, appendReviewFiles, state };\n  root.win7AgentA9Workbench = Object.freeze({');
  vm.runInNewContext(instrumented, { window, document, Date });
  const stream = node('a9-task-stream');
  const legacyNotes = () => {
    const notes: FakeNode[] = [];
    const visit = (item: FakeNode) => {
      if (item.classList.contains('legacy-note')) notes.push(item);
      item.children.forEach(visit);
    };
    visit(stream);
    return notes;
  };
  return { window, document, node, stream, queryEvents, legacyNotes, setWorkspace: (root: string) => { workspaceRoot = root; } };
}

it('R5-02 A4 keeps the legacy note until the history request returns', async () => {
  let respond!: (value: any) => void;
  const pending = new Promise<any>((resolve) => { respond = resolve; });
  const h = makeWorkbench(async () => pending);
  const selecting = h.window.__w39.chooseWorkspace();
  for (let i = 0; i < 32 && h.queryEvents.mock.calls.length === 0; i += 1) await Promise.resolve();
  expect(h.queryEvents).toHaveBeenCalledTimes(1);
  expect(h.stream.firstChild?.attributes.role).toBe('status');
  expect(h.stream.firstChild?.textContent).toContain('正在加载过程记录');
  expect(h.legacyNotes().map((item) => item.textContent)).toContain('历史记录未包含过程。');
  respond({ ok: true, events: [{ eventId: 1, turnId: 'turn-1', eventType: 'model_note',
    payload: { type: 'model_note', data: { content: 'loaded' } } }], hasMore: false });
  await selecting;
  expect(h.stream.firstChild?.attributes.role).not.toBe('status');
  expect(h.legacyNotes()).toHaveLength(0);
  expect(h.window.__w39.state.inspectorEvents.size).toBe(1);
});

it('B2 R5-02 initial failure exposes the inherited driver retry selector and recovers', async () => {
  let attempts = 0;
  const h = makeWorkbench(async () => ++attempts === 1 ? { ok: false }
    : { ok: true, events: [{ eventId: 2, turnId: 'turn-1', eventType: 'model_note',
      payload: { type: 'model_note', data: { content: 'retried' } } }], hasMore: false });
  await h.window.__w39.chooseWorkspace();
  const note = h.document.querySelector('#a9-task-stream .legacy-note:not(.conversation-history-note)');
  expect(note?.attributes.role).toBe('alert');
  expect(note?.textContent).toContain('过程记录加载失败');
  expect(note?.querySelector('button')?.textContent).toBe('重试加载');
  expect(h.stream.querySelectorAll('button').filter((button) => button.textContent.includes('重试'))).toHaveLength(1);
  note?.querySelector('button')?.click();
  for (let i = 0; i < 8 && h.window.__w39.state.eventsLoading; i += 1) await Promise.resolve();
  expect(h.queryEvents).toHaveBeenCalledTimes(2);
  expect(h.window.__w39.state.inspectorEvents.size).toBe(1);
  expect(h.queryEvents.mock.calls[1][0]).toEqual({ conversationId: 'conversation-a', limit: 300 });
  expect(h.window.__w39.state.eventsError).toBe('');
  expect(h.stream.textContent).not.toContain('重试加载');
  expect(h.stream.firstChild?.attributes.role).not.toBe('alert');
});

it('B2 older page failure retries the same beforeEventId through the inherited selector', async () => {
  let attempts = 0;
  const event = (eventId: number) => ({ eventId, turnId: 'turn-1', eventType: 'model_note',
    payload: { type: 'model_note', data: { content: 'event ' + eventId } } });
  const h = makeWorkbench(async () => {
    attempts += 1;
    if (attempts === 1) return { ok: true, events: [event(301)], hasMore: true };
    if (attempts === 2) return { ok: false };
    return { ok: true, events: [event(1)], hasMore: true };
  });
  await h.window.__w39.chooseWorkspace();
  const selector = '#a9-task-stream .legacy-note:not(.conversation-history-note)';
  h.document.querySelector(selector)?.querySelector('button')?.click();
  for (let i = 0; i < 32 && h.window.__w39.state.eventsLoading; i += 1) await Promise.resolve();
  const errorNote = h.document.querySelector(selector);
  expect(errorNote?.attributes.role).toBe('alert');
  expect(errorNote?.querySelector('button')?.textContent).toBe('重试加载');
  expect(h.window.__w39.state.inspectorEvents.size).toBe(1);
  errorNote?.querySelector('button')?.click();
  for (let i = 0; i < 32 && h.window.__w39.state.eventsLoading; i += 1) await Promise.resolve();
  expect(h.queryEvents).toHaveBeenCalledTimes(3);
  expect(h.queryEvents.mock.calls[1][0]).toEqual({ conversationId: 'conversation-a', limit: 300, beforeEventId: 301 });
  expect(h.queryEvents.mock.calls[2][0]).toEqual(h.queryEvents.mock.calls[1][0]);
  expect(h.window.__w39.state.inspectorEvents.size).toBe(2);
  expect(h.window.__w39.state.eventsError).toBe('');
  expect(h.stream.textContent).not.toContain('重试加载');
  expect(h.document.querySelector(selector)?.attributes.role).not.toBe('alert');
  expect(h.document.querySelector(selector)?.querySelector('button')?.textContent).toBe('加载更早记录');
});

it('R5-03 discards A late response after selecting B', async () => {
  let respondA!: (value: any) => void;
  const pendingA = new Promise<any>((resolve) => { respondA = resolve; });
  const h = makeWorkbench(async ({ conversationId }: any) => conversationId === 'conversation-a'
    ? pendingA : { ok: true, events: [{ eventId: 9001, turnId: 'turn-1', eventType: 'model_note',
      payload: { type: 'model_note', data: { content: 'B' } } }], hasMore: false });
  const choosingA = h.window.__w39.chooseWorkspace();
  for (let i = 0; i < 32 && h.queryEvents.mock.calls.length === 0; i += 1) await Promise.resolve();
  h.setWorkspace('C:\\history-b');
  await h.window.__w39.chooseWorkspace();
  respondA({ ok: true, events: [{ eventId: 8001, turnId: 'turn-1', eventType: 'model_note',
    payload: { type: 'model_note', data: { content: 'A' } } }], hasMore: false });
  await choosingA;
  expect(h.window.__w39.state.activeConversationId).toBe('conversation-b');
  expect([...h.window.__w39.state.inspectorEvents.keys()]).toEqual([9001]);
});

it('R5-04 empty workspace shows empty state without querying events', async () => {
  const h = makeWorkbench(async () => ({ ok: true, events: [], hasMore: false }), true);
  await h.window.__w39.chooseWorkspace();
  expect(h.queryEvents).not.toHaveBeenCalled();
  expect(h.node('a9-empty-state').hidden).toBe(false);
  expect(h.stream.textContent).not.toContain('加载失败');
});

it('R5 O-2 renders a recorded size reason without the internal code', () => {
  const h = makeWorkbench(async () => ({ ok: true, events: [], hasMore: false }));
  const item = new FakeNode();
  h.window.__w39.state.reviewOpenTurn = 'turn-1';
  h.window.__w39.appendReviewFiles(item, 'turn-1', { files: [], unrecoverable: [{
    path: 'large.bin', kind: 'modified', reasonCode: 'too_large',
    reason: '轮前基线未覆盖（too_large），无法恢复原内容',
  }] });
  expect(item.textContent).toContain('超过备份上限（单文件 2 MiB），轮前未保存原内容');
  expect(item.textContent).not.toContain('too_large');
});

it('A6-1 maps a legacy reason token when reasonCode is absent', () => {
  const h = makeWorkbench(async () => ({ ok: true, events: [], hasMore: false }));
  const item = new FakeNode();
  h.window.__w39.state.reviewOpenTurn = 'turn-1';
  h.window.__w39.appendReviewFiles(item, 'turn-1', { files: [], unrecoverable: [{
    path: 'large.bin', kind: 'modified', reason: '轮前基线未覆盖（too_large），无法恢复原内容',
  }] });
  expect(item.textContent).toContain('超过备份上限');
  expect(item.textContent).not.toContain('too_large');
});
