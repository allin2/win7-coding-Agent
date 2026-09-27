import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

type Checkpoint = { turnId: string; createdAt: string };
const row = (index: number): Checkpoint => ({
  turnId: `t${String(index).padStart(3, '0')}`,
  createdAt: `2026-09-26T00:00:${String(index).padStart(3, '0')}Z`,
});

function mount(listCheckpoints: jest.Mock = jest.fn(async () => ({ ok: true, conversationId: 'one', checkpoints: Array.from({ length: 20 }, (_, i) => row(i)), total: 70, hasMore: false, nextBefore: null }))) {
  class FakeNode {
    children: FakeNode[] = [];
    className = '';
    disabled = false;
    title = '';
    type = '';
    attributes: Record<string, string> = {};
    handlers: Record<string, () => void> = {};
    private ownText = '';
    set textContent(value: string) { this.ownText = String(value); this.children = []; }
    get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(''); }
    appendChild(child: FakeNode) { this.children.push(child); return child; }
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    addEventListener(name: string, handler: () => void) { this.handlers[name] = handler; }
  }
  const nodes = new Map<string, FakeNode>();
  for (const id of ['a9-checkpoint-count', 'a9-interruptions', 'a9-checkpoint-list']) nodes.set(id, new FakeNode());
  const document = {
    getElementById: (id: string) => nodes.get(id) || null,
    createElement: () => new FakeNode(),
    addEventListener: () => {},
  };
  const window: any = { win7Agent: { a9: { listCheckpoints } } };
  const source = fs.readFileSync(path.join(__dirname, '../../product/renderer/a9-workbench.js'), 'utf8');
  const instrumented = source.replace('}(window));', "window.__m3 = { state, syncCheckpointScope: typeof syncCheckpointScope === 'function' ? syncCheckpointScope : () => {}, renderCheckpoints, loadOlderCheckpoints: typeof loadOlderCheckpoints === 'function' ? loadOlderCheckpoints : () => {} };}(window));");
  expect(instrumented).not.toBe(source);
  vm.runInNewContext(instrumented, { window, document, Promise, Map, Set, Array, Object, String, Number, Date, console });
  const hooks = window.__m3;
  const render = (checkpoints: Checkpoint[], total: number, conversationId = 'one', workspaceRoot = '/ws') => {
    const snapshot = { checkpoints, checkpointsTotal: total, activeConversationId: conversationId, workspaceRoot, interruptions: [] };
    hooks.syncCheckpointScope(snapshot);
    hooks.state.activeConversationId = conversationId;
    hooks.state.snapshot = snapshot;
    hooks.renderCheckpoints(snapshot);
  };
  const list = nodes.get('a9-checkpoint-list')!;
  const checkpointIds = () => list.children.filter((item) => item.className === 'checkpoint-row').map((item) => item.children[0].textContent);
  const button = () => list.children[list.children.length - 1]?.children[0];
  return { nodes, hooks, render, checkpointIds, button, list, listCheckpoints };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('A9-21 M3 real workbench checkpoint list', () => {
  const recent = Array.from({ length: 50 }, (_, i) => row(i + 20));

  it('shows 10, uses cached 50, requests older 20 with the oldest cursor, then shows the total', async () => {
    const view = mount();
    view.render(recent, 70);
    expect(view.checkpointIds()).toHaveLength(10);
    expect(view.nodes.get('a9-checkpoint-count')!.textContent).toBe('最近 10 / 共 70');
    expect(view.list.children[0].children[1].children[0].textContent).toBe('查看改动');
    expect(view.button()!.textContent).toBe('加载更早的 20 条（还有 60 条）');
    view.button()!.handlers.click();
    expect(view.checkpointIds()).toHaveLength(30);
    view.button()!.handlers.click();
    expect(view.checkpointIds()).toHaveLength(50);
    expect(view.listCheckpoints).not.toHaveBeenCalled();
    view.button()!.handlers.click();
    await flush();
    expect(view.listCheckpoints).toHaveBeenCalledWith({
      conversationId: 'one', before: { createdAt: row(20).createdAt, turnId: row(20).turnId }, limit: 20,
    });
    expect(view.checkpointIds()).toEqual(Array.from({ length: 70 }, (_, i) => row(69 - i).turnId));
    expect(view.nodes.get('a9-checkpoint-count')!.textContent).toBe('共 70');
    expect(view.list.children[view.list.children.length - 1].className).toBe('checkpoint-row');
    expect(view.list.children[69].children[1].children.map((action) => action.textContent)).toEqual(['查看改动', '撤销本轮全部', '复制 ID']);
  });

  it('keeps loaded history continuous and deduplicated when a new checkpoint arrives', async () => {
    const view = mount();
    view.render(recent, 70);
    for (let i = 0; i < 3; i += 1) view.button()!.handlers.click();
    await flush();
    view.render(Array.from({ length: 50 }, (_, i) => row(i + 21)), 71);
    expect(view.checkpointIds()).toEqual(Array.from({ length: 71 }, (_, i) => row(70 - i).turnId));
    expect(new Set(view.checkpointIds()).size).toBe(71);
    expect(view.nodes.get('a9-checkpoint-count')!.textContent).toBe('共 71');
  });

  it('clears old pages on conversation or workspace change and discards a late response', async () => {
    let finish!: (response: any) => void;
    const request = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
    const view = mount(request);
    view.render(recent, 70);
    view.button()!.handlers.click();
    view.button()!.handlers.click();
    view.button()!.handlers.click();
    expect(view.button()!.disabled).toBe(true);
    expect(view.button()!.textContent).toBe('加载中…');
    view.render(Array.from({ length: 50 }, (_, i) => row(i + 100)), 50, 'two');
    expect(view.checkpointIds()).toHaveLength(10);
    finish({ ok: true, conversationId: 'one', checkpoints: Array.from({ length: 20 }, (_, i) => row(i)), total: 70 });
    await flush();
    expect(view.checkpointIds()[0]).toBe(row(149).turnId);
    expect(view.checkpointIds()).toHaveLength(10);
    view.render(Array.from({ length: 50 }, (_, i) => row(i + 200)), 50, 'two', '/other');
    expect(view.checkpointIds()[0]).toBe(row(249).turnId);
    expect(view.checkpointIds()).toHaveLength(10);
  });

  it('shows a structured loading error and allows a retry', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'A9_PAGE_FAILED', message: '读取失败' } })
      .mockResolvedValueOnce({ ok: true, conversationId: 'one', checkpoints: Array.from({ length: 20 }, (_, i) => row(i)), total: 70 });
    const view = mount(request);
    view.render(recent, 70);
    view.button()!.handlers.click();
    view.button()!.handlers.click();
    view.button()!.handlers.click();
    await flush();
    expect(view.list.textContent).toContain('读取失败');
    expect(view.button()!.disabled).toBe(false);
    view.button()!.handlers.click();
    await flush();
    expect(view.checkpointIds()).toHaveLength(70);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
