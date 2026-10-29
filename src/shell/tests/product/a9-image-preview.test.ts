import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

function harness() {
  const listeners = new Map<any, Array<(event?: any) => void>>();
  class Node {
    children: Node[] = [];
    parentNode: Node | null = null;
    className = '';
    hidden = false;
    isConnected = true;
    style: any = {};
    src = '';
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; this.isConnected = false; }
    disabled = false;
    type = '';
    value = '';
    maxLength = 0;
    rows = 0;
    checked = false;
    private ownText = '';
    attributes = new Map<string, string>();
    constructor(readonly tagName = 'div') {}
    classList = {
      add: (name: string) => {
        if (!this.className.split(/\s+/).includes(name)) this.className = `${this.className} ${name}`.trim();
      },
    };
    get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(''); }
    set textContent(value: string) {
      this.ownText = String(value == null ? '' : value);
      this.children = [];
    }
    append(...children: Node[]) { for (const child of children) this.appendChild(child); }
    appendChild(child: Node) { child.parentNode = this; this.children.push(child); return child; }
    setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
    getAttribute(name: string) { return this.attributes.get(name) || null; }
    removeAttribute(name: string) { this.attributes.delete(name); }
    addEventListener(type: string, listener: (event?: any) => void) {
      const list = listeners.get(this) || [];
      list.push(listener);
      listeners.set(this, list);
    }
    fire(type: string) { (listeners.get(this) || []).forEach((listener) => listener({ target: this })); }
  }
  const document = {
    createElement: (tag: string) => new Node(tag),
    querySelectorAll: () => [],
  };
  const window: any = { document };
  const source = fs.readFileSync(path.resolve(__dirname, '../../product/renderer/a9-image-preview.js'), 'utf8');
  vm.runInNewContext(source, { window, document, globalThis: window, Set, Array, String, Boolean, Object });
  return { Node, create: window.A9ImagePreview.create, async flush() { for(let i=0;i<12;i++) await Promise.resolve(); } };
}
describe('A9-42 real image preview component', () => {
  const metadata = { path: '<img onerror=bad>', width: 1, height: 1, conversationId: 'c', reference: 'r' };
  it('loads only on click and removes pixels on close', async () => {
    const h = harness(); const fetch = jest.fn(async () => ({ ok: true, preview: { dataUrl: 'data:image/png;base64,eA==' } }));
    const root = h.create(metadata, fetch);
    expect(fetch).not.toHaveBeenCalled();
    expect(root.children[0].textContent).toContain('<img onerror=bad>');
    const button = root.children[1]; button.fire('click'); await h.flush();
    expect(fetch).toHaveBeenCalledWith('c', 'r');
    const img = root.children.find((n: any) => n.tagName === 'img'); expect(img).toBeTruthy();
    button.fire('click'); expect(root.children.some((n: any) => n.tagName === 'img')).toBe(false);
  });
  it('rejects late responses after close, and rejects remote URLs', async () => {
    const h = harness(); let resolve: any;
    const root = h.create(metadata, () => new Promise(r => { resolve = r; }));
    const button = root.children[1]; button.fire('click'); button.fire('click');
    resolve({ ok: true, preview: { dataUrl: 'data:image/png;base64,eA==' } }); await h.flush();
    expect(root.children.some((n: any) => n.tagName === 'img')).toBe(false);
    const invalid = h.create(metadata, async () => ({ ok: true, preview: { dataUrl: 'https://example.com/tracker' } }));
    invalid.children[1].fire('click'); await h.flush();
    expect(invalid.children.some((n: any) => n.tagName === 'img')).toBe(false);
    expect(invalid.textContent).toContain('预览已过期或不可用');
  });
});
