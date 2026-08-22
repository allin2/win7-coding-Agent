/**
 * A9 正式 Renderer 面板合同：只在 preload 暴露 a9 时激活；A8 表面不被改标。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

interface FakeWindow {
  win7Agent?: { a9?: unknown };
  win7AgentA9Panel?: { bind: () => void };
}

function loadPanel(window: FakeWindow, dom: { getElementById: (id: string) => { hidden: boolean } | null; addEventListener?: unknown; readyState?: string }) {
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
});
