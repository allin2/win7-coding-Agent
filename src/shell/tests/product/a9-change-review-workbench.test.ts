import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

class FakeNode {
  children: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  handlers: Record<string, () => void> = {};
  className = '';
  hidden = false;
  disabled = false;
  title = '';
  type = '';
  value = '';
  id = '';
  private ownText = '';
  constructor(readonly tagName = 'div') {}
  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join(''); }
  set textContent(value: string) {
    this.ownText = String(value == null ? '' : value);
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
  }
  get firstChild(): FakeNode | null { return this.children[0] || null; }
  appendChild(child: FakeNode) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((item) => item !== this);
    this.parentNode = null;
  }
  setAttribute(name: string, value: string) { this.attributes[name] = String(value); }
  addEventListener(name: string, handler: () => void) { this.handlers[name] = handler; }
  focus() {}
  classList = {
    contains: (name: string) => this.className.split(/\s+/).includes(name),
    add: (name: string) => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
    remove: (name: string) => { this.className = this.className.split(/\s+/).filter((item) => item !== name).join(' '); },
    toggle: (name: string, enabled: boolean) => { if (enabled) this.classList.add(name); else this.classList.remove(name); },
  };
}

const review = (undone = false) => ({ turnId: 'turn-完整-ID-001', files: [{
  path: 'src/calc.ts', action: 'modify', originalKind: 'file', newKind: 'file',
  additions: 1, deletions: 1, undone, diffText: '@@ -1,1 +1,1 @@\n-old\n+new', diffTruncated: false,
}], unrecoverable: [], externalBaselineStatus: 'none' });

function mount() {
  const nodes = new Map<string, FakeNode>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, new FakeNode());
    return nodes.get(id)!;
  };
  const getDiff = jest.fn(async () => ({ ok: true, diff: [{ path: 'src/calc.ts', action: 'modify', diffText: review().files[0].diffText }], review: review() }));
  const undoFile = jest.fn(() => new Promise(() => {}));
  const undoTurn = jest.fn(() => new Promise(() => {}));
  const root: any = {
    innerWidth: 1400,
    win7Agent: { a9: { getDiff, undoFile, undoTurn } },
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  const document = {
    getElementById: node,
    createElement: (tag: string) => new FakeNode(tag),
    querySelector: () => new FakeNode(),
    addEventListener: jest.fn(),
  };
  const source = fs.readFileSync(path.join(__dirname, '../../product/renderer/a9-workbench.js'), 'utf8');
  const instrumented = source.replace('  root.win7AgentA9Workbench = Object.freeze({',
    '  root.__review = { state, syncCheckpointScope, renderCheckpoints, loadRecentSummaries, updateSummaryForTurn, queueUndo, cancelPendingUndo, executeUndo, undoResultText, syncComposer };\n  root.win7AgentA9Workbench = Object.freeze({');
  expect(instrumented).not.toBe(source);
  vm.runInNewContext(instrumented, { window: root, document, Date, Map, Set, Promise });
  const hooks = root.__review;
  const snapshot = { workspaceRoot: 'C:\\中文 空格', activeConversationId: 'conversation-1',
    mode: 'full_access', status: 'ready', provider: { configured: true, probe: { classification: 'tool_calling' } },
    agentStatus: 'idle', checkpoints: [{ turnId: 'turn-完整-ID-001', createdAt: '2026-09-27T01:00:00Z' }], checkpointsTotal: 1,
    conversation: [{ taskId: 'task-1', turnId: 'turn-完整-ID-001', outcome: 'completed' }], interruptions: [],
  };
  hooks.syncCheckpointScope(snapshot);
  hooks.state.activeConversationId = snapshot.activeConversationId;
  hooks.state.snapshot = snapshot;
  hooks.renderCheckpoints(snapshot);
  return { hooks, node, snapshot, getDiff, undoFile, undoTurn };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('A9-24 real workbench change review', () => {
  it('keeps full Turn ID, first-button whole Diff, count and paging contract', async () => {
    const view = mount();
    const row = view.node('a9-checkpoint-list').children[0];
    expect(row.tagName).toBe('li');
    expect(row.className).toBe('checkpoint-row');
    expect(row.children[0].className).toBe('checkpoint-id');
    expect(row.children[0].textContent).toBe('turn-完整-ID-001');
    expect(row.children[0].title).toBe('turn-完整-ID-001');
    expect(row.children[1].children.map((item) => item.textContent)).toEqual(['查看改动', '撤销本轮全部', '复制 ID']);
    expect(view.node('a9-checkpoint-count').textContent).toBe('共 1');
    row.children[1].children[0].handlers.click();
    await flush();
    expect(view.node('a9-diff').textContent).toContain('--- src/calc.ts (modify)');
    expect(view.node('a9-checkpoint-list').textContent).toContain('src/calc.ts');
    expect(view.getDiff).toHaveBeenCalledWith('turn-完整-ID-001');
  });

  it('offers a five-second cancellable undo and cancels when the conversation changes', () => {
    jest.useFakeTimers();
    try {
      const view = mount();
      view.hooks.state.reviewCache.set('turn-完整-ID-001', review());
      view.hooks.queueUndo('file', 'turn-完整-ID-001', 'src/calc.ts');
      expect(view.node('a9-checkpoint-list').textContent).toContain('撤回');
      const firstRow = view.node('a9-checkpoint-list').children[0];
      const pending = firstRow.children.find((child) => child.className === 'review-files')!
        .children.find((child) => child.className === 'review-pending')!;
      const cancelButton = pending.children[1];
      jest.advanceTimersByTime(1000);
      expect(firstRow.children.find((child) => child.className === 'review-files')!
        .children.find((child) => child.className === 'review-pending')!.children[1]).toBe(cancelButton);
      jest.advanceTimersByTime(3900);
      expect(view.undoFile).not.toHaveBeenCalled();
      view.hooks.cancelPendingUndo();
      jest.advanceTimersByTime(1000);
      expect(view.undoFile).not.toHaveBeenCalled();
      view.hooks.queueUndo('file', 'turn-完整-ID-001', 'src/calc.ts');
      view.hooks.syncCheckpointScope({ ...view.snapshot, activeConversationId: 'conversation-2' });
      jest.advanceTimersByTime(6000);
      expect(view.undoFile).not.toHaveBeenCalled();
      view.hooks.state.activeConversationId = 'conversation-1';
      view.hooks.state.snapshot = view.snapshot;
      view.hooks.syncCheckpointScope(view.snapshot);
      view.hooks.queueUndo('file', 'turn-完整-ID-001', 'src/calc.ts');
      view.hooks.syncCheckpointScope({ ...view.snapshot, workspaceRoot: 'D:\\另一工作区' });
      jest.advanceTimersByTime(6000);
      expect(view.undoFile).not.toHaveBeenCalled();
      view.hooks.syncCheckpointScope(view.snapshot);
      view.hooks.queueUndo('file', 'turn-完整-ID-001', 'src/calc.ts');
      jest.advanceTimersByTime(5000);
      expect(view.undoFile).toHaveBeenCalledTimes(1);
      expect(view.undoFile).toHaveBeenCalledWith('turn-完整-ID-001', 'src/calc.ts', undefined);
      view.hooks.queueUndo('file', 'turn-完整-ID-001', 'src/calc.ts');
      jest.advanceTimersByTime(5000);
      expect(view.undoFile).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });

  it('distinguishes later-turn and external drift in user-facing text', () => {
    const view = mount();
    view.hooks.state.reviewCache.set('turn-完整-ID-001', review());
    const later = view.hooks.undoResultText('turn-完整-ID-001', { ok: true,
      outcome: { restored: [], errors: [], drifted: ['src/calc.ts (drift)'] },
      driftReasons: [{ path: 'src/calc.ts', kind: 'later_turn', laterTurnId: 'turn-2' }],
    });
    expect(later).toContain('后续轮次 turn-2');
    expect(later).toContain('先撤销');
    const external = view.hooks.undoResultText('turn-完整-ID-001', { ok: true,
      outcome: { restored: [], errors: [], drifted: ['src/calc.ts (drift)'] },
      driftReasons: [{ path: 'src/calc.ts', kind: 'external' }],
    });
    expect(external).toContain('被外部修改');
    expect(external).toContain('工作区未改动');
  });

  it('shows recoverable and command-unrecoverable items and reports each result of a partial turn undo', () => {
    const view = mount();
    const second = { ...review().files[0], path: 'tests/calc.test.ts' };
    view.hooks.state.reviewCache.set('turn-完整-ID-001', {
      ...review(), files: [review().files[0], second],
      unrecoverable: [{ path: 'coverage/lcov.info', kind: 'too_large', reason: '2.4 MB' }],
    });
    view.hooks.state.reviewOpenTurn = 'turn-完整-ID-001';
    view.hooks.renderCheckpoints(view.snapshot);
    expect(view.node('a9-checkpoint-list').textContent).toContain('命令产生 · 无法撤销');
    expect(view.node('a9-checkpoint-list').textContent).toContain('超过备份上限');
    const result = view.hooks.undoResultText('turn-完整-ID-001', { ok: true,
      outcome: { restored: ['src/calc.ts (已恢复)'], errors: [], drifted: ['tests/calc.test.ts (drift)'] },
      driftReasons: [{ path: 'tests/calc.test.ts', kind: 'external' }],
    });
    expect(result).toContain('已撤销 src/calc.ts');
    expect(result).toContain('tests/calc.test.ts 在本轮之后被外部修改');
  });

  it('shows the command-baseline confirmation card and passes its exact identity', async () => {
    const view = mount();
    view.hooks.state.reviewOpenTurn = 'turn-完整-ID-001';
    view.hooks.state.reviewCache.set('turn-完整-ID-001', review());
    view.undoFile.mockResolvedValueOnce({ ok: true, needsConfirmation: true, confirmationId: 'confirm-123',
      outcome: { restored: [], errors: [], drifted: [] } });
    await view.hooks.executeUndo({ kind: 'file', turnId: 'turn-完整-ID-001', path: 'src/calc.ts', conversationId: 'conversation-1' });
    expect(view.node('a9-checkpoint-list').textContent).toContain('已重新收集命令后的当前状态');
    const row = view.node('a9-checkpoint-list').children[0];
    const files = row.children.find((child) => child.className === 'review-files')!;
    const confirmation = files.children.find((child) => child.className === 'review-confirmation')!;
    confirmation.children[1].handlers.click();
    expect(view.undoFile).toHaveBeenLastCalledWith('turn-完整-ID-001', 'src/calc.ts', 'confirm-123');
  });

  it('loads only recent checkpoint summaries and keeps a writable composer with unreviewed changes', async () => {
    const view = mount();
    const block: { root: FakeNode; summaryEl: FakeNode | null } = { root: new FakeNode('article'), summaryEl: null };
    view.hooks.state.streamDom.set('task-1', block);
    view.hooks.loadRecentSummaries(view.snapshot);
    await flush();
    expect(view.getDiff).toHaveBeenCalledTimes(1);
    expect(block.root.textContent).toContain('第 1 轮改动了 1 个文件');
    expect(block.summaryEl!.dataset.turnId).toBe('turn-完整-ID-001');
    view.node('task-prompt').value = '继续修改';
    view.hooks.syncComposer();
    expect(view.node('task-prompt').disabled).toBe(false);
    expect(view.node('run-task').disabled).toBe(false);
    view.hooks.state.reviewCache.set('turn-完整-ID-001', { ...review(), files: [] });
    view.hooks.updateSummaryForTurn('turn-完整-ID-001');
    expect(block.root.textContent).not.toContain('改动了');
  });

  it('offers only Full Access and Read Only in the permission dialog', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../product/renderer/workbench.html'), 'utf8');
    const dialog = html.match(/<dialog id="a9-mode-dialog"[\s\S]*?<\/dialog>/)![0];
    expect([...dialog.matchAll(/name="a9-mode-choice" value="([^"]+)"/g)].map((match) => match[1]))
      .toEqual(['full_access', 'read_only']);
    expect(dialog).not.toContain('Review</strong>');
  });
});
