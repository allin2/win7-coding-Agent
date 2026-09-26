import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

// Same vm + fake DOM approach as a9-workbench-contract.test.ts. The whole
// production script runs unchanged except for exposing chooseWorkspace/state.
class FakeNode {
  children: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  dataset: Record<string, string> = {};
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
  setAttribute() {}
  removeAttribute() {}
  focus() {}
  addEventListener(type: string, handler: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), handler]);
  }
  querySelectorAll(selector: string): FakeNode[] {
    const found: FakeNode[] = [];
    const visit = (parent: FakeNode) => parent.children.forEach((child) => {
      if (selector === child.tagName || (selector === 'details[open]' && child.tagName === 'details' && child.open)) found.push(child);
      visit(child);
    });
    visit(this);
    return found;
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] || null; }
}

it('W39 R4-4 real workbench leaves chosen history unloaded until the warmup turn completes', async () => {
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
  let completeWarmup: (value: any) => void = () => { throw new Error('warmup not submitted'); };
  let warmupDone = false;
  const pendingWarmup = new Promise((resolve) => { completeWarmup = resolve; });
  const warmupEvents = [
    { eventId: 2501, turnId: 'warmup', eventType: 'turn_started', payload: { data: {} } },
    { eventId: 2502, turnId: 'warmup', eventType: 'tool_start', payload: { data: { toolName: 'search' } } },
    { eventId: 2503, turnId: 'warmup', eventType: 'tool_end', payload: { data: { toolName: 'search' } } },
    { eventId: 2504, turnId: 'warmup', eventType: 'turn_completed', payload: { data: { outcome: 'completed' } } },
  ];
  const snapshot = () => ({ status: 'ready', mode: 'full_access', workspaceRoot, activeConversationId: conversationId,
    provider: { configured: true, probe: { classification: 'tool_calling' } }, agentStatus: 'idle',
    conversation: warmupDone ? [...facts, { taskId: 'warmup-task', turnId: 'warmup', requestPrompt: 'load m4 history',
      outcome: 'completed', verification: 'not_applicable' }] : facts,
    conversationPage: { hasMore: false }, timeline: [], checkpoints: [], conversations: [],
  });
  const queryEvents = jest.fn(async ({ conversationId: requested, limit }: any) => {
    expect(requested).toBe(conversationId);
    const all = [...history, ...(warmupDone ? warmupEvents : [])];
    return { ok: true, events: all.slice(-limit), hasMore: all.length > limit };
  });
  const window: any = { win7Agent: {
    selectWorkspace: jest.fn(async () => ({ selected: { workspacePath: workspaceRoot } })),
    listSessions: jest.fn(async () => ({ sessions: [{ sessionId: 'explorer', status: 'ACTIVE', workspacePath: workspaceRoot }] })),
    listWorkspace: jest.fn(async () => ({ ok: true, result: { path: '', entries: [] } })),
    a9: {
      snapshot: jest.fn(async () => ({ ok: true, snapshot: snapshot() })),
      saveDraft: jest.fn(async () => ({ ok: true })), queryEvents,
      submitTurn: jest.fn(() => pendingWarmup),
    },
  }, setInterval: jest.fn(() => 1), clearInterval: jest.fn(), setTimeout: jest.fn(), clearTimeout: jest.fn() };
  const document = { getElementById: node, createElement: (tag: string) => new FakeNode(tag),
    createTextNode: (value: string) => { const text = new FakeNode(); text.textContent = value; return text; },
    addEventListener: jest.fn(), querySelectorAll: () => [],
  };
  const instrumented = script.replace('  root.win7AgentA9Workbench = Object.freeze({',
    '  root.__w39 = { chooseWorkspace, state };\n  root.win7AgentA9Workbench = Object.freeze({');
  vm.runInNewContext(instrumented, { window, document, Date });
  await window.__w39.chooseWorkspace();
  expect(window.win7Agent.selectWorkspace).toHaveBeenCalledTimes(1);
  expect(node('error-banner').textContent).toBe('');
  expect(queryEvents).not.toHaveBeenCalled();
  expect(window.__w39.state.inspectorEvents.size).toBe(0);
  expect(node('a9-task-stream').textContent).toContain('历史记录未包含过程。');
  expect(node('a9-task-stream').textContent).not.toContain('加载更早记录');
  // Negative control: stopping at workspace selection reproduces K11, despite
  // all 2500 seed events existing in the query backend.
  node('task-prompt').value = 'load m4 history';
  const running = window.win7AgentA9Workbench.submitPrompt();
  expect(window.win7Agent.a9.submitTurn).toHaveBeenCalledWith('load m4 history');
  expect(queryEvents).not.toHaveBeenCalled();
  warmupDone = true;
  completeWarmup({ ok: true });
  await running;
  expect(node('error-banner').textContent).toBe('');
  expect(queryEvents).toHaveBeenCalledTimes(1);
  expect(window.__w39.state.inspectorEvents.size).toBe(300);
  expect(warmupEvents.every((event) => window.__w39.state.inspectorEvents.has(event.eventId))).toBe(true);
  const topNote = node('a9-task-stream').firstChild!;
  expect(topNote.classList.contains('legacy-note')).toBe(true);
  expect(topNote.classList.contains('conversation-history-note')).toBe(false);
  const button = topNote.querySelector('button')!;
  expect(button.textContent).toBe('加载更早记录');
  expect(button.disabled).toBe(false);
});
