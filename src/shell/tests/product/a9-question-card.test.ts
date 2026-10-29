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
  const source = fs.readFileSync(path.resolve(__dirname, '../../product/renderer/a9-question-card.js'), 'utf8');
  vm.runInNewContext(source, { window, document, globalThis: window, Set, Array, String, Boolean, Object });
  const root = new Node('section');
  const calls: any[] = [];
  let replyResult: Promise<any> | null = null;
  const card = window.A9QuestionCard.create(root, async (payload: any) => {
    calls.push(payload);
    if (replyResult) return replyResult;
    if (payload.decision === 'answered' && payload.answer === 'explode') throw new Error('network failed');
    return { ok: true };
  });
  return {
    root, card, calls, Node,
    holdReply(promise: Promise<any>) { replyResult = promise; },
    releaseReply() { replyResult = null; },
    async flush() { for (let i = 0; i < 12; i += 1) await Promise.resolve(); },
    find(node: Node, predicate: (candidate: Node) => boolean): Node | undefined {
      if (predicate(node)) return node;
      for (const child of node.children) {
        const match = this.find(child, predicate);
        if (match) return match;
      }
      return undefined;
    },
  };
}

describe('A9-42 real question card', () => {
  it('renders prompt/options/free text with textContent only and no automatic submit', () => {
    const h = harness();
    h.card.update({
      conversationId: 'conversation-1', questionId: 'question-1', revision: 1,
      prompt: '<img src=x onerror=alert(1)>', options: ['<b>staging</b>', 'production'], recovered: false,
    });
    const radios = h.root.children.filter((child) => child.tagName === 'fieldset')[0].children
      .filter((child) => child.tagName === 'label').slice(0, 2).map((label) => label.children[0]);
    expect(h.root.children.some((child) => child.tagName === 'img')).toBe(false);
    expect(h.root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(h.root.textContent).toContain('<b>staging</b>');
    expect(h.calls).toHaveLength(0);
    expect(radios).toHaveLength(2);
    expect(h.find(h.root, (node) => node.tagName === 'textarea')).toBeTruthy();
  });

  it('option selection fills the controlled choice without submitting, then explicit submit sends it', async () => {
    const h = harness();
    h.card.update({
      conversationId: 'conversation-1', questionId: 'question-1', revision: 1,
      prompt: 'Pick', options: ['staging', 'production'], recovered: false,
    });
    const fieldset = h.root.children.find((child) => child.tagName === 'fieldset')!;
    const radio = fieldset.children.filter((child) => child.tagName === 'label')[1].children[0];
    radio.checked = true;
    radio.fire('change');
    expect(h.calls).toHaveLength(0);
    const actions = h.root.children.find((child) => child.className === 'a9-question-actions')!;
    actions.children[0].fire('click');
    await h.flush();
    expect(h.calls).toEqual([{
      conversationId: 'conversation-1', questionId: 'question-1', revision: 1,
      decision: 'answered', answer: 'production',
    }]);
  });

  it('free-form answer overrides selection; cancel sends no answer; busy disables controls', async () => {
    const h = harness();
    h.card.update({
      conversationId: 'conversation-1', questionId: 'question-1', revision: 1,
      prompt: 'Pick', options: ['staging'], recovered: true,
    });
    const fieldset = h.root.children.find((child) => child.tagName === 'fieldset')!;
    const textarea = fieldset.children.filter((child) => child.tagName === 'label').slice(-1)[0].children[0];
    textarea.value = 'custom answer';
    textarea.fire('input');
    const actions = h.root.children.find((child) => child.className === 'a9-question-actions')!;
    const submit = actions.children[0];
    const cancel = actions.children[1];
    let release!: (value: any) => void;
    h.holdReply(new Promise((resolve) => { release = resolve; }));
    submit.fire('click');
    await h.flush();
    expect(h.calls[0]).toMatchObject({ decision: 'answered', answer: 'custom answer' });
    expect(h.root.getAttribute('aria-busy')).toBe('true');
    expect(textarea.disabled).toBe(true);
    expect(submit.disabled).toBe(true);
    cancel.fire('click');
    expect(h.calls).toHaveLength(1);
    release({ ok: true });
    h.releaseReply();
    await h.flush();
    h.card.update({ conversationId: 'conversation-1', questionId: 'question-2', revision: 1,
      prompt: 'Cancel me', options: [], recovered: false });
    const nextActions = h.root.children.find((child) => child.className === 'a9-question-actions')!;
    nextActions.children[1].fire('click');
    await h.flush();
    expect(h.calls[1]).toEqual({
      conversationId: 'conversation-1', questionId: 'question-2', revision: 1, decision: 'cancelled',
    });
  });

  it('shows a recoverable error and re-enables the same question after reply failure', async () => {
    const h = harness();
    h.card.update({
      conversationId: 'conversation-1', questionId: 'question-1', revision: 1,
      prompt: 'Pick', options: [], recovered: false,
    });
    const fieldset = h.root.children.find((child) => child.tagName === 'fieldset')!;
    const textarea = fieldset.children.filter((child) => child.tagName === 'label').slice(-1)[0].children[0];
    textarea.value = 'explode';
    textarea.fire('input');
    h.root.children.find((child) => child.className === 'a9-question-actions')!.children[0].fire('click');
    await h.flush();
    const error = h.root.children.find((child) => child.className === 'a9-question-error')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('network failed');
    expect(h.root.getAttribute('aria-busy')).toBe('false');
    expect(textarea.disabled).toBe(false);
    expect(h.root.children.find((child) => child.className === 'a9-question-actions')!.children[0].disabled).toBe(false);
  });
});
