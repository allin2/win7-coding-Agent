/**
 * A9 正式 Renderer 面板合同：只在 preload 暴露 a9 时激活；A8 表面不被改标。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

interface FakeWindow {
  win7Agent?: { a9?: unknown };
  win7AgentA9Panel?: {
    bind: () => void;
    refreshSnapshot: () => Promise<unknown>;
    decideApproval: (decision: 'approved' | 'denied') => Promise<unknown>;
  };
}

function loadPanel(window: FakeWindow, dom: { getElementById: (id: string) => any; addEventListener?: unknown; readyState?: string }) {
  const source = fs.readFileSync(path.join(__dirname, '../../product/renderer/a9-agent-panel.js'), 'utf8');
  vm.runInNewContext(source, {
    window,
    document: {
      readyState: dom.readyState ?? 'complete',
      getElementById: dom.getElementById,
      addEventListener: dom.addEventListener ?? (() => undefined),
      querySelectorAll: () => [],
    },
  });
  return window;
}

function fakeNode(hidden = false) {
  const attributes = new Map<string, string>();
  return {
    hidden,
    disabled: false,
    textContent: '',
    dataset: {} as Record<string, string>,
    setAttribute(name: string, value: string) { attributes.set(name, value); },
    removeAttribute(name: string) { attributes.delete(name); },
    getAttribute(name: string) { return attributes.get(name); },
  };
}

function approvalSnapshot(approvalId?: string) {
  return {
    status: 'ready',
    workspaceRoot: 'C:\\A9验收\\工作区\\approval-test',
    mode: 'full_access',
    shell: { kind: 'cmd' },
    provider: { configured: false },
    agentStatus: approvalId ? 'needs_approval' : 'completed',
    timeline: [],
    checkpoints: [],
    interruptions: [],
    ...(approvalId ? {
      pendingApproval: {
        approvalId,
        bindingDigest: approvalId.padEnd(64, '0').slice(0, 64),
        summary: `approve ${approvalId}`,
        toolName: 'shell',
      },
    } : {}),
  };
}

describe('A9 renderer panel contract', () => {
  it('unhides the A9 surface only when the preload exposes the a9 API', () => {
    const surfaceWithA9 = { hidden: true };
    const fakeA9 = {
      snapshot: async () => ({ ok: false, error: { code: 'TEST' } }),
      gitStatus: async () => ({ ok: false }),
    };
    const withA9 = loadPanel({ win7Agent: { a9: fakeA9 } as any }, { getElementById: (id) => (id === 'a9-surface' ? surfaceWithA9 : null) });
    expect(withA9.win7AgentA9Panel).toBeDefined();
    expect(surfaceWithA9.hidden).toBe(false);

    const surfaceWithoutA9 = { hidden: true };
    const withoutA9 = loadPanel({ win7Agent: {} }, { getElementById: (id) => (id === 'a9-surface' ? surfaceWithoutA9 : null) });
    expect(withoutA9.win7AgentA9Panel).toBeDefined();
    expect(surfaceWithoutA9.hidden).toBe(true);
  });

  it('keeps the A8 surface identity separate (production html labels)', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../product/renderer/index.html'), 'utf8');
    expect(html).toContain('id="a9-surface"');
    expect(html).toContain('A8 历史能力，不冒充 A9');
    // 无内联脚本（CSP default-src 'none' 下不可用）。
    expect(html).not.toMatch(/<script>\s*\(function/);
  });

  it('coalesces duplicate approval clicks and disables both decisions until the response is reconciled', async () => {
    let resolveResume: ((value: unknown) => void) | null = null;
    let resumeCalls = 0;
    const snapshots = [approvalSnapshot('apr-1'), approvalSnapshot()];
    const nodes: Record<string, ReturnType<typeof fakeNode>> = {
      'a9-surface': fakeNode(),
      'a9-approval-card': fakeNode(true),
      'a9-approval-approve': fakeNode(),
      'a9-approval-deny': fakeNode(),
      'a9-approval-error': fakeNode(true),
    };
    const fakeA9 = {
      snapshot: async () => ({ ok: true, snapshot: snapshots.shift() || approvalSnapshot() }),
      resumeApproval: async () => {
        resumeCalls += 1;
        return new Promise((resolve) => { resolveResume = resolve; });
      },
    };
    const loaded = loadPanel({ win7Agent: { a9: fakeA9 } as any }, {
      readyState: 'loading',
      getElementById: (id) => nodes[id] || null,
    });
    await loaded.win7AgentA9Panel!.refreshSnapshot();

    const first = loaded.win7AgentA9Panel!.decideApproval('approved');
    const duplicate = loaded.win7AgentA9Panel!.decideApproval('approved');
    expect(resumeCalls).toBe(1);
    expect(nodes['a9-approval-approve'].disabled).toBe(true);
    expect(nodes['a9-approval-deny'].disabled).toBe(true);

    resolveResume!({ ok: true, result: { outcome: 'completed' } });
    await Promise.all([first, duplicate]);
    expect(nodes['a9-approval-card'].hidden).toBe(true);
    expect(nodes['a9-approval-approve'].disabled).toBe(false);
    expect(nodes['a9-approval-deny'].disabled).toBe(false);
    expect(nodes['a9-approval-error'].textContent).toBe('');
  });

  it('does not attach an old failed response to a newly rendered approval card', async () => {
    const snapshots = [approvalSnapshot('apr-old'), approvalSnapshot('apr-new')];
    const nodes: Record<string, ReturnType<typeof fakeNode>> = {
      'a9-surface': fakeNode(),
      'a9-approval-card': fakeNode(true),
      'a9-approval-approve': fakeNode(),
      'a9-approval-deny': fakeNode(),
      'a9-approval-error': fakeNode(true),
    };
    const fakeA9 = {
      snapshot: async () => ({ ok: true, snapshot: snapshots.shift() || approvalSnapshot('apr-new') }),
      resumeApproval: async () => ({ ok: false, error: { code: 'TEST_OLD_FAILURE', message: 'old failure' } }),
    };
    const loaded = loadPanel({ win7Agent: { a9: fakeA9 } as any }, {
      readyState: 'loading',
      getElementById: (id) => nodes[id] || null,
    });
    await loaded.win7AgentA9Panel!.refreshSnapshot();
    await loaded.win7AgentA9Panel!.decideApproval('approved');

    expect(nodes['a9-approval-card'].dataset.approvalId).toBe('apr-new');
    expect(nodes['a9-approval-error'].textContent).toBe('');
    expect(nodes['a9-approval-error'].hidden).toBe(true);
  });

  it('keeps a failed approval retryable, then retires the consumed card even if the final snapshot fails', async () => {
    let resumeCalls = 0;
    let snapshotCalls = 0;
    const nodes: Record<string, ReturnType<typeof fakeNode>> = {
      'a9-surface': fakeNode(),
      'a9-approval-card': fakeNode(true),
      'a9-approval-approve': fakeNode(),
      'a9-approval-deny': fakeNode(),
      'a9-approval-error': fakeNode(true),
      'a9-runtime-error': fakeNode(true),
    };
    const fakeA9 = {
      snapshot: async () => {
        snapshotCalls += 1;
        if (snapshotCalls === 3) throw new Error('snapshot unavailable');
        return { ok: true, snapshot: approvalSnapshot('apr-retry') };
      },
      resumeApproval: async () => {
        resumeCalls += 1;
        return resumeCalls === 1
          ? { ok: false, error: { code: 'TRANSIENT', message: 'retry me' } }
          : { ok: true, result: { outcome: 'completed' } };
      },
    };
    const loaded = loadPanel({ win7Agent: { a9: fakeA9 } as any }, {
      readyState: 'loading',
      getElementById: (id) => nodes[id] || null,
    });
    await loaded.win7AgentA9Panel!.refreshSnapshot();

    await loaded.win7AgentA9Panel!.decideApproval('approved');
    expect(nodes['a9-approval-card'].hidden).toBe(false);
    expect(nodes['a9-approval-approve'].disabled).toBe(false);
    expect(nodes['a9-approval-error'].textContent).toBe('retry me');

    await loaded.win7AgentA9Panel!.decideApproval('approved');
    expect(resumeCalls).toBe(2);
    expect(nodes['a9-approval-card'].hidden).toBe(true);
    expect(nodes['a9-approval-card'].dataset.approvalId).toBeUndefined();
    expect(nodes['a9-approval-error'].textContent).toBe('');
    expect(nodes['a9-runtime-error'].textContent).toContain('A9_SNAPSHOT_FAILED');
  });
});
