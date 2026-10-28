import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const rendererRoot = path.resolve(__dirname, '../../product/renderer');
const source = fs.readFileSync(path.join(rendererRoot, 'a9-workbench.js'), 'utf8');
const html = fs.readFileSync(path.join(rendererRoot, 'workbench.html'), 'utf8');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function snapshot(overrides: any = {}) {
  const managedProcesses = overrides.managedProcesses || [];
  const active = ['running', 'cancelling'].includes(overrides.agentStatus);
  const managed = managedProcesses.some((item: any) =>
    ['running', 'starting', 'running_unknown', 'identity_mismatch'].includes(item.lastProbeStatus) || item.cleanupRequired === true);
  return {
    status: 'ready', workspaceRoot: 'C:\\中文 空格\\project', mode: 'full_access', agentStatus: 'idle',
    activeConversationId: 'conversation', provider: { configured: true, model: 'fixture',
      baseUrl: 'https://example.invalid', probe: { classification: 'tool_calling' } },
    conversations: [{ sessionId: 'conversation', state: 'active', title: '后台任务', activity: 'idle' }],
    conversationControls: { canSwitch: !active && !managed, maxActive: 16 },
    controls: { canStop: active || managed, stopKind: active ? 'turn' : managed ? 'managed_process' : 'none' },
    conversation: [], timeline: [], managedProcesses, checkpoints: [], interruptions: [], ...overrides,
  };
}

const runningProcess = { handleId: 'managed', lastProbeStatus: 'running', ownershipState: 'owned',
  cleanupRequired: true, pidReusePossible: false };
const fact = { taskId: 'task', turnId: 'turn', requestPrompt: '启动后台任务', outcome: 'completed',
  finalMessage: '已启动', createdAt: '2026-10-27T10:00:00Z', updatedAt: '2026-10-27T10:00:01Z' };
const event = (eventId: number, type: string, data: any) =>
  ({ eventId, type, turnId: 'turn', timestamp: '2026-10-27T10:00:00Z', data });
const toolEvents = [
  event(1, 'tool_start', { toolName: 'start_process', callId: 'start' }),
  event(2, 'tool_end', { toolName: 'start_process', callId: 'start', result: 'managed process started' }),
  event(3, 'turn_completed', { outcome: 'completed', finalMessage: '已启动' }),
];
const outputEvent = (id: number, stream: string, text: string) => event(id, 'tool_output', {
  schemaVersion: 1, toolName: 'start_process', toolCallId: 'start', outputSeq: id - 3, stream, text,
});

// Execute the complete shipped Renderer. Only DOM and its frozen preload boundary are fixtures.
function workbench(initial: any = snapshot()) {
  const listeners = new Map<string, Array<(event?: any) => any>>();
  const register = (key: string, listener: (event?: any) => any) => {
    const list = listeners.get(key) || []; list.push(listener); listeners.set(key, list);
  };
  let document: any;
  class Node {
    children: Node[] = [];
    parentNode: Node | null = null;
    dataset: any = {};
    style: any = {};
    attributes = new Map<string, string>();
    className = '';
    hidden = false;
    disabled = false;
    open = false;
    value = '';
    scrollTop = 0;
    scrollHeight = 1000;
    clientHeight = 300;
    private ownText = '';
    constructor(readonly tagName = 'div', readonly id = '') {}
    classList = {
      contains: (name: string) => this.className.split(/\s+/).includes(name),
      add: (name: string) => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
      remove: (name: string) => { this.className = this.className.split(/\s+/).filter((item) => item !== name).join(' '); },
      toggle: (name: string, force?: boolean) => {
        const on = force === undefined ? !this.classList.contains(name) : force;
        if (on) this.classList.add(name); else this.classList.remove(name);
        return on;
      },
    };
    get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(''); }
    set textContent(value: string) {
      this.ownText = String(value == null ? '' : value);
      this.children.forEach((child) => { child.parentNode = null; }); this.children = [];
    }
    set innerHTML(value: string) { this.textContent = value; }
    get firstChild() { return this.children[0] || null; }
    appendChild(child: Node) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
    append(...children: Node[]) { children.forEach((child) => this.appendChild(child)); }
    insertBefore(child: Node, before: Node | null) {
      child.remove(); child.parentNode = this;
      const index = before ? this.children.indexOf(before) : -1;
      if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
      return child;
    }
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
      this.parentNode = null;
    }
    setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
    getAttribute(name: string) { return this.attributes.get(name) || null; }
    removeAttribute(name: string) { this.attributes.delete(name); }
    addEventListener(type: string, listener: (event?: any) => any) { register(`${this.id}:${type}`, listener); }
    querySelectorAll(selector: string): Node[] {
      const nodes: Node[] = [];
      for (const child of this.children) {
        if (selector === 'details' && child.tagName === 'details'
          || selector === 'details[open]' && child.tagName === 'details' && child.open) nodes.push(child);
        nodes.push(...child.querySelectorAll(selector));
      }
      return nodes;
    }
    querySelector(selector: string) { return this.querySelectorAll(selector)[0] || null; }
    focus() { document.activeElement = this; }
    select() {}
    contains(node: Node | null): boolean { return node === this || this.children.some((child) => child.contains(node)); }
    getClientRects() { return [{}]; }
  }
  const nodes = new Map<string, Node>();
  for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], new Node('div', match[1]));
  const main = new Node('main');
  document = {
    activeElement: null,
    getElementById: (id: string) => nodes.get(id) || null,
    createElement: (tag: string) => new Node(tag),
    createTextNode: (text: string) => { const node = new Node('#text'); node.textContent = text; return node; },
    querySelectorAll: () => [], querySelector: (selector: string) => selector === '.workbench' ? main : null,
    addEventListener: (type: string, listener: (event?: any) => any) => register(`document:${type}`, listener),
  };
  let current = initial;
  const a9 = {
    snapshot: jest.fn(async () => ({ ok: true, snapshot: current })),
    queryEvents: jest.fn(async () => ({ ok: true, events: [], hasMore: false })),
    submitTurn: jest.fn(async (_prompt: string) => ({ ok: true })),
    saveDraft: jest.fn(async () => ({ ok: true })), stop: jest.fn(async () => ({ ok: true })),
  };
  const api = { a9, signalReady: jest.fn(),
    selectWorkspace: jest.fn(async (): Promise<any> => ({ selected: null })),
    listSessions: jest.fn(async () => ({ sessions: [{ sessionId: 'explorer', status: 'ACTIVE', workspacePath: 'C:\\new' }] })),
    listWorkspace: jest.fn(async () => ({ result: { entries: [] } })),
  };
  const window: any = { win7Agent: api, innerWidth: 1366, setInterval, clearInterval, setTimeout, clearTimeout,
    addEventListener: (type: string, listener: (event?: any) => any) => register(`window:${type}`, listener) };
  vm.runInNewContext(source, { window, document, console }, { filename: 'a9-workbench.js' });
  const fire = (key: string) => Promise.all((listeners.get(key) || []).map((listener) => listener({})));
  return { api, a9, ui: window.win7AgentA9Workbench, document, node: (id: string) => nodes.get(id)!, fire,
    get current() { return current; }, set current(value) { current = value; },
    async ready() { await fire('document:DOMContentLoaded'); await jest.advanceTimersByTimeAsync(0); },
  };
}

describe('A9-40 background snapshot refresh lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('keeps refreshing after the request settles and appends late stdout/stderr to the original tool card', async () => {
    const view = workbench(); await view.ready();
    view.a9.submitTurn.mockImplementation(async () => {
      view.current = snapshot({ managedProcesses: [runningProcess], conversation: [fact], timeline: toolEvents });
      return { ok: true };
    });
    view.node('task-prompt').value = '启动后台任务';
    await view.ui.submitPrompt();
    const original = view.node('a9-task-stream').querySelectorAll('details')[0];
    original.open = true;
    view.node('task-prompt').focus();
    view.node('conversation').scrollTop = 25;
    await view.fire('conversation:scroll');
    view.current = { ...view.current, timeline: [...toolEvents,
      outputEvent(4, 'stdout', '<script>纯文本</script> token=***redacted***\n'),
      outputEvent(5, 'stderr', '后台诊断\n')] };
    await jest.advanceTimersByTimeAsync(500);
    expect(original.textContent).toContain('<script>纯文本</script> token=***redacted***');
    expect(original.textContent).toContain('stderr:\n后台诊断');
    expect(view.node('a9-task-stream').querySelectorAll('details')).toEqual([original]);
    expect(original.open).toBe(true);
    expect(view.document.activeElement).toBe(view.node('task-prompt'));
    expect(view.node('conversation').scrollTop).toBe(25);
    expect(view.a9.submitTurn).toHaveBeenCalledTimes(1);
  });

  it('starts from existing managed facts, synchronizes natural exit controls, and stops idle polling', async () => {
    const view = workbench(snapshot({ managedProcesses: [runningProcess] })); await view.ready();
    expect(view.node('conversation-new').disabled).toBe(true);
    expect(view.node('cancel-task').hidden).toBe(false);
    view.current = snapshot({ managedProcesses: [{ ...runningProcess, lastProbeStatus: 'exited', cleanupRequired: false }] });
    await jest.advanceTimersByTimeAsync(500);
    expect(view.node('conversation-new').disabled).toBe(false);
    expect(view.node('cancel-task').hidden).toBe(true);
    expect(view.node('cancel-task').disabled).toBe(true);
    expect(view.node('task-state').textContent).toBe('空闲');
    const reads = view.a9.snapshot.mock.calls.length;
    await jest.advanceTimersByTimeAsync(5000);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(reads);
  });

  it('coalesces slow polling and explicit refreshes instead of stacking snapshot requests', async () => {
    const view = workbench(snapshot({ managedProcesses: [runningProcess] })); await view.ready();
    const slow = deferred<any>();
    view.a9.snapshot.mockImplementationOnce(() => slow.promise);
    await jest.advanceTimersByTimeAsync(2500);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(2);
    const refresh = Promise.all([view.ui.refreshSnapshot(), view.ui.refreshSnapshot()]);
    await jest.advanceTimersByTimeAsync(1500);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(2);
    const oldSnapshot = view.current;
    view.current = snapshot();
    slow.resolve({ ok: true, snapshot: oldSnapshot });
    await refresh;
    await jest.advanceTimersByTimeAsync(1000);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(3);
    expect(view.node('conversation-new').disabled).toBe(false);
  });

  it('does not poll historical cleanup and identity facts or relax their backend controls', async () => {
    const facts = [
      { handleId: 'recovered-live', lastProbeStatus: 'running_unknown', pidReusePossible: true, cleanupRequired: true },
      { handleId: 'recovered-dead', lastProbeStatus: 'exited', pidReusePossible: false, cleanupRequired: true },
      { handleId: 'mismatch', lastProbeStatus: 'identity_mismatch', cleanupRequired: true },
      { handleId: 'failed', lastProbeStatus: 'failed', cleanupRequired: true },
      { handleId: 'released', lastProbeStatus: 'released', cleanupRequired: false },
      { handleId: 'dismissed', lastProbeStatus: 'user_dismissed', cleanupRequired: false },
    ];
    const view = workbench(snapshot({ managedProcesses: facts })); await view.ready();
    await jest.advanceTimersByTimeAsync(5000);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(1);
    expect(view.node('conversation-new').disabled).toBe(true);
    expect(view.node('cancel-task').hidden).toBe(false);
    expect(view.a9.stop).not.toHaveBeenCalled();
  });

  it('stops refreshing when the live process exits even if historical cleanup remains', async () => {
    const recovered = { handleId: 'old', lastProbeStatus: 'exited', cleanupRequired: true };
    const view = workbench(snapshot({ managedProcesses: [runningProcess, recovered] })); await view.ready();
    view.current = snapshot({ managedProcesses: [recovered] });
    await jest.advanceTimersByTimeAsync(500);
    const reads = view.a9.snapshot.mock.calls.length;
    await jest.advanceTimersByTimeAsync(3000);
    expect(reads).toBe(2);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(reads);
    expect(view.node('conversation-new').disabled).toBe(true);
  });

  it('reads fresh controls after Stop even when an older snapshot is still in flight', async () => {
    const beforeStop = snapshot({ managedProcesses: [runningProcess] });
    const view = workbench(beforeStop); await view.ready();
    const slow = deferred<any>(); view.a9.snapshot.mockImplementationOnce(() => slow.promise);
    await jest.advanceTimersByTimeAsync(500);
    view.a9.stop.mockImplementationOnce(async () => { view.current = snapshot(); return { ok: true }; });
    const stop = view.ui.stopTurn();
    await jest.advanceTimersByTimeAsync(1000);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(2);
    slow.resolve({ ok: true, snapshot: beforeStop });
    await stop;
    expect(view.a9.snapshot).toHaveBeenCalledTimes(3);
    expect(view.node('cancel-task').hidden).toBe(true);
    expect(view.node('conversation-new').disabled).toBe(false);
  });

  it('clears polling on close and ignores a snapshot already in flight', async () => {
    const view = workbench(snapshot({ managedProcesses: [runningProcess] })); await view.ready();
    const slow = deferred<any>(); view.a9.snapshot.mockImplementationOnce(() => slow.promise);
    await jest.advanceTimersByTimeAsync(500);
    await view.fire('window:beforeunload');
    slow.resolve({ ok: true, snapshot: snapshot({ workspaceRoot: 'C:\\late' }) });
    await jest.advanceTimersByTimeAsync(2000);
    await view.ui.refreshSnapshot();
    expect(view.a9.snapshot).toHaveBeenCalledTimes(2);
    expect(view.node('workspace-path').textContent).toBe('C:\\中文 空格\\project');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('pauses during workspace selection and ignores the old workspace response', async () => {
    const view = workbench(snapshot({ managedProcesses: [runningProcess] })); await view.ready();
    const slow = deferred<any>(); view.a9.snapshot.mockImplementationOnce(() => slow.promise);
    await jest.advanceTimersByTimeAsync(500);
    view.api.selectWorkspace.mockResolvedValue({ selected: { workspacePath: 'C:\\new' } });
    view.current = snapshot({ workspaceRoot: 'C:\\new', activeConversationId: 'new-conversation' });
    await view.fire('workspace-select:click');
    await jest.advanceTimersByTimeAsync(2000);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(2);
    slow.reject(new Error('old workspace snapshot failed'));
    await jest.advanceTimersByTimeAsync(0);
    expect(view.node('workspace-path').textContent).toBe('C:\\new');
    expect(view.node('error-banner').hidden).toBe(true);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(1000);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(3);
  });

  it('resumes the original background refresh after workspace selection is cancelled', async () => {
    const view = workbench(snapshot({ managedProcesses: [runningProcess] })); await view.ready();
    await view.fire('workspace-select:click');
    await jest.advanceTimersByTimeAsync(500);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(2);
  });

  it('shows bounded redacted diagnostics for async failures and recovers on the next refresh', async () => {
    const view = workbench(snapshot({ managedProcesses: [runningProcess] })); await view.ready();
    view.a9.snapshot.mockRejectedValueOnce(new Error('password=fixture-secret ' + 'x'.repeat(1000)));
    await jest.advanceTimersByTimeAsync(500);
    expect(view.node('error-banner').hidden).toBe(false);
    expect(view.node('error-banner').textContent).toContain('***redacted***');
    expect(view.node('error-banner').textContent).not.toContain('fixture-secret');
    expect(view.node('error-banner').textContent.length).toBeLessThan(650);
    view.a9.snapshot.mockResolvedValueOnce({ ok: false, error: { code: 'A9_SNAPSHOT_TEMPORARY', message: '读取失败' } } as any);
    await jest.advanceTimersByTimeAsync(500);
    expect(view.node('error-banner').textContent).toContain('读取失败');
    await jest.advanceTimersByTimeAsync(500);
    expect(view.node('error-banner').hidden).toBe(true);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(4);
  });

  it('keeps foreground preview and cancellation working, then stops polling without a background process', async () => {
    const view = workbench(); await view.ready();
    const turn = deferred<any>(); view.a9.submitTurn.mockImplementationOnce(() => turn.promise);
    view.node('task-prompt').value = '前台任务'; const request = view.ui.submitPrompt();
    view.current = snapshot({ agentStatus: 'running', conversation: [{ ...fact, outcome: 'active' }],
      timeline: [event(1, 'turn_started', {})], liveModelPreview: { turnId: 'turn', text: '前台进展', updatedAt: 1 } });
    await jest.advanceTimersByTimeAsync(500);
    expect(view.node('a9-task-stream').textContent).toContain('前台进展');
    expect(view.node('task-prompt').disabled).toBe(true);
    view.a9.stop.mockImplementationOnce(async () => {
      view.current = snapshot({ agentStatus: 'cancelled', conversation: [{ ...fact, outcome: 'cancelled' }] });
      return { ok: true };
    });
    await view.ui.stopTurn(); turn.resolve({ ok: true }); await request;
    expect(view.a9.stop).toHaveBeenCalledTimes(1);
    expect(view.node('task-prompt').disabled).toBe(false);
    expect(view.node('cancel-task').hidden).toBe(true);
    const reads = view.a9.snapshot.mock.calls.length;
    await jest.advanceTimersByTimeAsync(2000);
    expect(view.a9.snapshot).toHaveBeenCalledTimes(reads);
    expect(jest.getTimerCount()).toBe(0);
  });
});
