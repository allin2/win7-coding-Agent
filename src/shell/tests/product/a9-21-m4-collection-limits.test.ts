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
  // A pagination scenario needs spare slots after both caps have trimmed. Only
  // the vm copy is mutable; production defaults remain const and unchanged.
  source = source.replace('const EVENT_GLOBAL_LIMIT =', 'let EVENT_GLOBAL_LIMIT =')
    .replace('const EVENT_TURN_LIMIT =', 'let EVENT_TURN_LIMIT =');
  source = source.replace('  root.win7AgentA9Workbench = Object.freeze({',
    '  root.__m4 = { state, ingestEvents, ingestTimelineEvents, renderConversation, renderTimeline, loadConversationEvents, resetConversationEvents, setLimits: (global, turn) => { EVENT_GLOBAL_LIMIT = global; EVENT_TURN_LIMIT = turn; } };\n  root.win7AgentA9Workbench = Object.freeze({');
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
    expect(api.state.releasedEventCount).toBe(3);
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
    const released = api.state.releasedEventCount;
    for (let index = 0; index < 5; index += 1) api.ingestTimelineEvents(events(1, 11));
    render();
    expect(Array.from(api.state.inspectorEvents.keys())).toEqual(retained);
    expect(api.state.releasedEventCount).toBe(released);
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
    expect(api.state.releasedEventCount).toBe(1);
    await api.loadConversationEvents(true);
    expect(query).toHaveBeenCalledTimes(1);
    render();
    expect(nodes.get('a9-task-stream')!.textContent).toContain('已达界面上限 10 条，更早记录不再加载。');
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
    expect(api.state.releasedEventCount).toBe(0);
    expect(api.state.lowestLoadedEventId).toBeNull();
    expect(api.state.evictedThroughId).toBe(0);
    expect(nodes.get('a9-task-stream')!.textContent).not.toContain('界面已释放');
    api.ingestEvents(events(1, 1));
    expect(api.state.inspectorEvents.has(1)).toBe(true);
  });

  it('B1 pages directly below the retained minimum through released records before unseen history', async () => {
    const stored = events(1, 24).map((event) => ({
      ...event, turnId: event.eventId <= 7 ? 'turn-a' : null,
    }));
    const query = jest.fn(async ({ beforeEventId, limit }: { beforeEventId: number; limit: number }) => {
      const preceding = stored.filter((event) => event.eventId < beforeEventId);
      const page = preceding.slice(-limit);
      return { ok: true, hasMore: preceding.length > page.length, events: page.map((event) => ({
        eventId: event.eventId, eventType: event.type, turnId: event.turnId, payload: { data: event.data },
      })) };
    });
    const { api } = rendererHarness({ global: 20, turn: 5 }, query);
    api.ingestEvents(stored.slice(1, 7)); // 2–7: the turn cap releases 2–3.
    api.ingestEvents(stored.slice(7)); // 8–24: the global cap additionally releases 4–6.
    expect(api.state.eventsBeforeId).toBe(7);
    expect(api.state.eventsTruncated).toBe(true);
    expect(api.state.releasedEventCount).toBe(5);
    expect(api.state.turnEvents.get('turn-a').released).toBe(5);
    await api.loadConversationEvents(true);
    expect(query.mock.calls[0][0]).toEqual({ conversationId: 'conversation-a', limit: 2, beforeEventId: 7 });
    expect((Array.from(api.state.inspectorEvents.keys()) as number[]).sort((a, b) => a - b))
      .toEqual(events(5, 24).map((event) => event.eventId));
    expect(api.state.eventsBeforeId).toBe(5);
    expect(api.state.releasedEventCount).toBe(3);
    expect(api.state.turnEvents.get('turn-a').released).toBe(3);

    // Test-only capacity expansion makes room to distinguish restored records
    // from the first record that this conversation had never received.
    api.setLimits(23, 10);
    await api.loadConversationEvents(true);
    expect(query.mock.calls[1][0]).toEqual({ conversationId: 'conversation-a', limit: 3, beforeEventId: 5 });
    expect(api.state.releasedEventCount).toBe(0);
    expect(api.state.turnEvents.get('turn-a').released).toBe(0);
    expect(api.state.eventsBeforeId).toBe(2);
    api.setLimits(24, 10);
    await api.loadConversationEvents(true);
    expect(query.mock.calls[2][0]).toEqual({ conversationId: 'conversation-a', limit: 1, beforeEventId: 2 });
    expect(api.state.inspectorEvents.has(1)).toBe(true);
    expect(api.state.lowestLoadedEventId).toBe(1);
    expect(api.state.releasedEventCount).toBe(0);
  });

  it('C2 ignores repeated polling without evictions or rebuilding retained DOM nodes', () => {
    const { api, render } = rendererHarness({ global: 10, turn: 100 });
    api.ingestEvents(events(1, 11));
    render();
    const block = api.state.streamDom.get('task-a');
    const retainedNode = block.progressEl.children.find((child: FakeNode) => child.textContent === 'payload[3]');
    expect(retainedNode).toBeDefined();
    const retainedIds = Array.from(api.state.inspectorEvents.keys());
    const releasedCount = api.state.releasedEventCount;
    const originalDelete = api.state.inspectorEvents.delete.bind(api.state.inspectorEvents);
    let evictions = 0;
    api.state.inspectorEvents.delete = (id: number) => { evictions += 1; return originalDelete(id); };
    for (let index = 0; index < 5; index += 1) api.ingestTimelineEvents(events(1, 11));
    api.renderConversation(api.state.snapshot);
    expect(Array.from(api.state.inspectorEvents.keys())).toEqual(retainedIds);
    expect(api.state.releasedEventCount).toBe(releasedCount);
    expect(evictions).toBe(0);
    expect(block.progressEl.children.find((child: FakeNode) => child.textContent === 'payload[3]')).toBe(retainedNode);
  });

  it('R-2 counts known but unretained events through restore and re-eviction without an ID set', async () => {
    const stored = events(1, 13);
    const query = jest.fn(async ({ beforeEventId, limit }: { beforeEventId: number; limit: number }) => ({
      ok: true, hasMore: beforeEventId - 1 > limit,
      events: stored.filter((event) => event.eventId < beforeEventId).slice(-limit).map((event) => ({
        eventId: event.eventId, eventType: event.type, turnId: event.turnId, payload: { data: event.data },
      })),
    }));
    const { api } = rendererHarness({ global: 10, turn: 100 }, query);
    const known = new Set<number>(events(1, 11).map((event) => event.eventId));
    const expectCount = () => expect(api.state.releasedEventCount).toBe(known.size - api.state.inspectorEvents.size);
    api.ingestEvents(events(1, 11));
    expectCount();
    await api.loadConversationEvents(true);
    expectCount();
    expect(api.state.releasedEventCount).toBe(1);
    api.ingestEvents(events(12, 12)); known.add(12);
    expectCount();
    await api.loadConversationEvents(true);
    expectCount();
    api.ingestEvents(events(13, 13)); known.add(13);
    expectCount();
    expect(rendererSource).not.toContain('releasedEventIds');
  });

  it('D1 counts only previously released records when one older page mixes new and restored events', async () => {
    const page = events(8, 16).map((event) => ({
      eventId: event.eventId, eventType: event.type, turnId: event.turnId, payload: { data: event.data },
    }));
    const query = jest.fn().mockResolvedValueOnce({ ok: true, events: page, hasMore: true });
    const { api } = rendererHarness({ global: 20, turn: 5 }, query);
    api.ingestEvents(events(10, 20, 'turn-a')); // A releases 10–16; retains 17–20.
    api.ingestEvents(events(30, 36, 'turn-b')); // B releases 30–32; retains 33–36.
    expect(api.state.lowestLoadedEventId).toBe(10);
    expect(api.state.eventsBeforeId).toBe(17);
    expect(api.state.releasedEventCount).toBe(10);
    api.setLimits(17, 10); // VM-only headroom: A can accept 8–13, but not 14–16.
    await api.loadConversationEvents(true);
    expect(query).toHaveBeenCalledWith({ conversationId: 'conversation-a', limit: 9, beforeEventId: 17 });
    expect(api.state.inspectorEvents.has(8)).toBe(true);
    expect(api.state.inspectorEvents.has(9)).toBe(true);
    expect(api.state.inspectorEvents.has(13)).toBe(true);
    expect(api.state.inspectorEvents.has(14)).toBe(false);
    expect(api.state.releasedEventCount).toBe(6); // A's 14–16 and B's 30–32 remain released.
    expect(api.state.turnEvents.get('turn-a').released).toBe(3);
    expect(api.state.turnEvents.get('turn-b').released).toBe(3);
    expect(api.state.lowestLoadedEventId).toBe(8);
  });

  it('R-4 shows the injected global limit in the capacity notice', () => {
    const { api, nodes, render } = rendererHarness({ global: 7 });
    api.ingestEvents(events(1, 7));
    render();
    expect(nodes.get('a9-task-stream')!.textContent).toContain('已达界面上限 7 条，更早记录不再加载。');
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
