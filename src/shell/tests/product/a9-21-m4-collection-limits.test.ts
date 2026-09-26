import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const root = path.join(__dirname, '../../product');
const rendererSource = fs.readFileSync(path.join(root, 'renderer/a9-workbench.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

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
  private ownText = '';
  private listeners = new Map<string, Array<() => void>>();
  constructor(readonly tagName = 'div') {}
  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(''); }
  set textContent(value: string) {
    this.ownText = String(value == null ? '' : value);
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
  }
  get firstChild(): FakeNode | null { return this.children[0] || null; }
  appendChild(child: FakeNode): FakeNode {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child: FakeNode, before: FakeNode | null): FakeNode {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, child); else this.children.push(child);
    return child;
  }
  remove(): void {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  addEventListener(type: string, handler: () => void): void {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  click(): void { (this.listeners.get('click') || []).forEach((handler) => handler()); }
  setAttribute(): void {}
  querySelectorAll(selector: string): FakeNode[] {
    const matches: FakeNode[] = [];
    const visit = (node: FakeNode) => node.children.forEach((child) => {
      if (selector === 'details' && child.tagName === 'details') matches.push(child);
      if (selector === 'details[open]' && child.tagName === 'details' && child.open) matches.push(child);
      visit(child);
    });
    visit(this);
    return matches;
  }
}

function rendererHarness(limits: { global?: number; bytes?: number; turn?: number } = {}, queryEvents = jest.fn()) {
  const nodes = new Map<string, FakeNode>();
  const node = (id: string) => {
    const found = nodes.get(id) || new FakeNode();
    nodes.set(id, found);
    return found;
  };
  ['a9-task-stream', 'a9-turn-outcome', 'a9-empty-state', 'a9-timeline'].forEach(node);
  const document = {
    getElementById: (id: string) => node(id),
    createElement: (tag: string) => new FakeNode(tag),
    addEventListener: () => {},
  };
  let source = rendererSource;
  if (limits.global) source = source.replace('const EVENT_GLOBAL_LIMIT = 2000;', `const EVENT_GLOBAL_LIMIT = ${limits.global};`);
  if (limits.bytes) source = source.replace('const EVENT_BYTE_LIMIT = 4 * 1024 * 1024;', `const EVENT_BYTE_LIMIT = ${limits.bytes};`);
  if (limits.turn) source = source.replace('const EVENT_TURN_LIMIT = 500;', `const EVENT_TURN_LIMIT = ${limits.turn};`);
  source = source.replace('  root.win7AgentA9Workbench = Object.freeze({',
    '  root.__m4 = { state, ingestEvents, ingestTimelineEvents, renderConversation, renderTimeline, loadConversationEvents, resetConversationEvents };\n  root.win7AgentA9Workbench = Object.freeze({');
  const window: any = { win7Agent: { a9: { queryEvents } } };
  vm.runInNewContext(source, { window, document, setTimeout, Date });
  const api = window.__m4;
  api.state.activeConversationId = 'conversation-a';
  api.state.renderedConversationId = 'conversation-a';
  const snapshot = { activeConversationId: 'conversation-a', conversation: [
    { taskId: 'task-a', turnId: 'turn-a', requestPrompt: 'work', outcome: 'active' },
  ] };
  api.state.snapshot = snapshot;
  const render = () => { api.state.conversationSignature = null; api.renderConversation(api.state.snapshot); };
  return { api, nodes, node, render, queryEvents, snapshot };
}

function events(first: number, last: number, turnId: string | null = 'turn-a', content = 'payload') {
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    eventId: first + index, type: 'model_note', turnId, timestamp: '', data: { content: `${content}[${first + index}]` },
  }));
}

describe('A9-21 M4 renderer event bounds', () => {
  it('trims global count to 90 percent by eventId and removes evicted turn and DOM entries', () => {
    const { api, nodes, render } = rendererHarness({ global: 20, turn: 100 });
    api.ingestEvents([...events(10, 20), ...events(1, 9)]);
    render();
    api.ingestEvents(events(21, 21));
    render();
    expect((Array.from(api.state.inspectorEvents.keys()) as number[]).sort((a, b) => a - b))
      .toEqual(events(4, 21).map((item) => item.eventId));
    expect(api.state.turnEvents.get('turn-a').events.map((item: any) => item.eventId)).toEqual(events(4, 21).map((item) => item.eventId));
    expect(api.state.turnEvents.get('turn-a').ids.has(1)).toBe(false);
    expect(nodes.get('a9-task-stream')!.textContent).not.toContain('payload[1]');
    expect(nodes.get('a9-task-stream')!.textContent).toContain('payload[21]');
    expect(api.state.streamDom.get('task-a').progressEl.children).toHaveLength(19);
    expect(api.state.streamDom.get('task-a').renderedIds).toEqual(events(4, 21).map((item) => item.eventId));
    expect(api.state.releasedEventIds.size).toBe(3);
  });

  it('trims one turn to 90 percent and renders its released and remaining counts', () => {
    const { api, nodes, render } = rendererHarness({ global: 100, turn: 5 });
    api.ingestEvents(events(1, 6));
    render();
    expect(api.state.turnEvents.get('turn-a').events.map((item: any) => item.eventId)).toEqual([3, 4, 5, 6]);
    expect(nodes.get('a9-task-stream')!.textContent).toContain('本轮较早的 2 条过程已从界面释放，下方只显示最近 4 条。');
    expect(api.state.inspectorEvents.has(1)).toBe(false);
  });

  it('retains only counts in an emptied turn bucket and does not claim that history lacks process', () => {
    const { api, nodes, render } = rendererHarness({ global: 10, turn: 100 });
    api.ingestEvents([...events(1, 5), ...events(6, 20, 'turn-b')]);
    api.state.snapshot.conversation[0].outcome = 'completed';
    render();
    const bucket = api.state.turnEvents.get('turn-a');
    expect(bucket.events).toHaveLength(0);
    expect(bucket.ids.size).toBe(0);
    expect(bucket.released).toBe(5);
    expect(nodes.get('a9-task-stream')!.textContent).toContain('本轮较早的 5 条过程已从界面释放，下方只显示最近 0 条。');
    expect(nodes.get('a9-task-stream')!.textContent).not.toContain('历史记录未包含过程。');
  });

  it('trims on estimated bytes before count and subtracts the stored size', () => {
    const { api } = rendererHarness({ global: 100, bytes: 650, turn: 100 });
    api.ingestEvents(events(1, 3, 'turn-a', 'x'.repeat(60)));
    expect(api.state.inspectorEvents.size).toBeLessThan(3);
    expect(api.state.eventBytes).toBe(Array.from(api.state.inspectorEvents.values())
      .reduce((sum: number, item: any) => sum + item.estimatedBytes, 0));
    expect(api.state.eventBytes).toBeLessThanOrEqual(650 * 0.9);
  });

  it('does not reaccept released events from repeated snapshot polling', () => {
    const { api, render, nodes } = rendererHarness({ global: 10, turn: 100 });
    api.ingestEvents(events(1, 11));
    render();
    const retained = Array.from(api.state.inspectorEvents.keys());
    const released = api.state.releasedEventIds.size;
    for (let index = 0; index < 5; index += 1) api.ingestTimelineEvents(events(1, 11));
    render();
    expect(Array.from(api.state.inspectorEvents.keys())).toEqual(retained);
    expect(api.state.releasedEventIds.size).toBe(released);
    expect(nodes.get('a9-task-stream')!.textContent).toContain(`界面已释放最早的 ${released} 条`);
  });

  it('loads older only into free slots, restores release counts, and stops at capacity', async () => {
    const query = jest.fn().mockResolvedValueOnce({ ok: true, events: events(1, 2).map((item) => ({
      eventId: item.eventId, eventType: item.type, turnId: item.turnId, payload: { data: item.data },
    })), hasMore: true });
    const { api, render, nodes } = rendererHarness({ global: 10, turn: 100 }, query);
    api.ingestEvents(events(1, 11));
    api.state.eventsBeforeId = 3;
    api.state.eventsTruncated = true;
    expect(api.state.inspectorEvents.size).toBe(9);
    await api.loadConversationEvents(true);
    expect(query).toHaveBeenCalledWith({ conversationId: 'conversation-a', limit: 1, beforeEventId: 3 });
    expect(api.state.inspectorEvents.has(11)).toBe(true);
    expect(api.state.inspectorEvents.has(1)).toBe(true);
    expect(api.state.inspectorEvents.has(2)).toBe(false);
    expect(api.state.releasedEventIds.size).toBe(1);
    await api.loadConversationEvents(true);
    expect(query).toHaveBeenCalledTimes(1);
    render();
    expect(nodes.get('a9-task-stream')!.textContent).toContain('已达界面上限 2000 条，更早记录不再加载。');
    expect(nodes.get('a9-task-stream')!.textContent).not.toContain('加载更早记录');
  });

  it('resets bytes, counts and eviction watermark on conversation switch', () => {
    const { api, render, nodes } = rendererHarness({ global: 10 });
    api.ingestEvents(events(1, 11));
    render();
    api.state.activeConversationId = 'conversation-b';
    api.resetConversationEvents();
    api.state.snapshot = { activeConversationId: 'conversation-b', conversation: [] };
    render();
    expect(api.state.inspectorEvents.size).toBe(0);
    expect(api.state.eventBytes).toBe(0);
    expect(api.state.releasedEventIds.size).toBe(0);
    expect(api.state.evictedThroughId).toBe(0);
    expect(nodes.get('a9-task-stream')!.textContent).not.toContain('界面已释放');
    api.ingestEvents(events(1, 1));
    expect(api.state.inspectorEvents.has(1)).toBe(true);
  });
});

function blockedRecorder() {
  const start = mainSource.indexOf('// A9-21 M4 blocked-request recorder start.');
  const end = mainSource.indexOf('// A9-21 M4 blocked-request recorder end.');
  const runtimeState = { blockedRequests: [] as string[], blockedRequestBytes: 0,
    blockedRequestCount: 0, blockedRequestDropped: 0 };
  const context: any = { runtimeState };
  if (start >= 0 && end > start) {
    vm.runInNewContext(`${mainSource.slice(start, end)}\nthis.record = recordBlockedRequest;`, context);
  } else {
    // Negative baseline: execute the actual legacy callback expression in vm.
    const legacy = mainSource.match(/onRequestBlocked: \(url\) => ([^,\n]+),/);
    expect(legacy).not.toBeNull();
    vm.runInNewContext(`this.record = (url) => ${legacy![1]};`, context);
  }
  return { runtimeState, record: context.record as (url: string) => void };
}

describe('A9-21 M4 main blocked-request bounds', () => {
  it('keeps the newest 500 of 600 while diagnostics count all 600 and 100 drops', () => {
    const { runtimeState, record } = blockedRecorder();
    for (let index = 0; index < 600; index += 1) record(`https://example.test/${index}`);
    expect(runtimeState.blockedRequests).toHaveLength(500);
    expect(runtimeState.blockedRequests[0]).toBe('https://example.test/100');
    expect(runtimeState.blockedRequests[499]).toBe('https://example.test/599');
    expect(runtimeState.blockedRequestCount).toBe(600);
    expect(runtimeState.blockedRequestDropped).toBe(100);
  });

  it('truncates URLs to 2048 characters and enforces the byte cap', () => {
    const { runtimeState, record } = blockedRecorder();
    record('u'.repeat(3000));
    expect(runtimeState.blockedRequests[0]).toHaveLength(2048);
    for (let index = 0; index < 300; index += 1) record(String(index).padStart(4, '0') + 'x'.repeat(2044));
    expect(runtimeState.blockedRequests.length).toBeLessThan(300);
    expect(runtimeState.blockedRequestBytes).toBeLessThanOrEqual(1024 * 1024);
    expect(runtimeState.blockedRequestBytes).toBe(runtimeState.blockedRequests.reduce((sum, item) => sum + item.length * 2, 0));
    expect(runtimeState.blockedRequestDropped).toBeGreaterThan(0);
  });

  it('wires the bounded recorder and cumulative diagnostics without changing permission denial handling', () => {
    expect(mainSource).toContain('// A9-21 M4 blocked-request recorder start.');
    expect(mainSource).toContain('// A9-21 M4 blocked-request recorder end.');
    expect(mainSource).toContain('blocked_request_count: runtimeState.blockedRequestCount');
    expect(mainSource).toContain('blocked_request_dropped: runtimeState.blockedRequestDropped');
    expect(mainSource).toContain('onRequestBlocked: (url) => recordBlockedRequest(url)');
    expect(mainSource).toContain('onPermissionDenied: (permission) => runtimeState.deniedPermissions.push(permission)');
  });
});
