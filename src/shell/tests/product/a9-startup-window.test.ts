import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { EventEmitter } from 'events';

function loadMainHarness(options: { failHost?: boolean; deferPaint?: boolean; restore?: Promise<void> } = {}) {
  const productMain = path.join(__dirname, '..', '..', 'product', 'main.js');
  const source = fs.readFileSync(productMain, 'utf8');
  const calls: string[] = [];
  const ipc: Record<string, any> = {};
  const app = new EventEmitter() as any;
  app.requestSingleInstanceLock = () => true;
  app.whenReady = () => Promise.resolve();
  app.getPath = () => '/tmp/a9-startup-test';
  app.quit = () => { calls.push('app.quit'); app.emit('will-quit'); };
  app.exit = () => calls.push('app.exit');
  const window = new (class extends EventEmitter {
    webContents: any = new EventEmitter(); destroyed = false;
    constructor() { super(); this.webContents.send = () => {}; }
    setMenuBarVisibility() {} loadFile() { if (!options.deferPaint) process.nextTick(() => this.emit('ready-to-show')); return Promise.resolve(); }
    show() { calls.push('window.show'); } focus() {} isDestroyed() { return this.destroyed; } isMinimized() { return false; } restore() {}
    destroy() { this.destroyed = true; this.emit('closed'); } close() { this.emit('close', { preventDefault() {} }); }
  })();
  const electron = { app, BrowserWindow: class { constructor() { return window as any; } }, dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showErrorBox() {}, showMessageBox: async () => ({ response: 0 }) }, ipcMain: { handle: (name: string, handler: any) => { ipc[name] = handler; }, on: () => {} }, safeStorage: {}, session: { defaultSession: {} } };
  const host = { selectWorkspace: async () => { calls.push('restore.start'); if (options.restore) await options.restore; calls.push('restore.end'); return { workspacePath: '/workspace', displayName: 'test' }; }, listSessions: () => [], createSession: () => ({ sessionId: 's1' }), getDiagnostics: () => ({}), getSettings: () => ({}), dispose: () => calls.push('host.dispose'), getActiveWorkspacePath: () => null };
  const local = (request: string): any => {
    if (request.endsWith('/policy')) return { createWindowOptions: () => ({}), isTrustedLocalUrl: () => true };
    if (request.endsWith('/desktop-ipc')) return { createDesktopRequestHandler: () => async (event: any) => { if (event.sender !== window.webContents) throw new Error('RENDERER_CAPABILITY_DENIED'); calls.push('desktop.handler'); return { ok: true }; } };
    if (request.endsWith('/a8-product-ipc')) return { createA8ProductRequestHandler: () => async () => ({ ok: true }) };
    if (request.endsWith('/a9-product-ipc')) return { createA9ProductRequestHandler: () => async () => ({ ok: true }) };
    if (request.endsWith('/a9-agent-runtime')) return { createA9AgentRuntime: () => ({}) };
    if (request.endsWith('/a9-package-runtime')) return { loadA9PackageRuntime: () => null };
    if (request.endsWith('/active-workspace-store')) return { createActiveWorkspaceStore: () => ({ load: () => options.restore ? { workspacePath: '/workspace' } : null, save() {} }) };
    if (request.endsWith('/security-policy')) return { installSessionPolicy() {}, installWindowPolicy() {} };
    if (request.endsWith('/desktop-host')) return { createDesktopHost: () => { calls.push('createDesktopHost'); if (options.failHost) throw new Error('HOST_FAIL'); return host; }, serializeError: (e: any) => ({ code: e.code || 'ERR', message: e.message }) };
    if (request.endsWith('/credential-vault')) return { createDpapiCredentialVault: () => ({}) };
    if (request.endsWith('/runner-runtime')) return { createProductRunner: () => null };
    if (request.endsWith('/rc-composition')) return { createRcComposition: () => null };
    if (request.endsWith('/dist/ipc/schema')) return { schemaValidator: { validateMessage: () => ({ valid: true, errors: [] }) } };
    if (request.endsWith('/dist/ipc/messages')) return { IPCDirection: { RENDERER_TO_CORE: 'renderer-to-core', CORE_TO_RENDERER: 'core-to-renderer' }, IPCMessageType: { TASK_EVENT: 'task:event', WORKSPACE_SELECTED: 'workspace:selected' } };
    throw new Error(`unexpected local require ${request}`);
  };
  const fsMock = { ...fs, existsSync: () => false };
  const context: any = { require: (request: string) => request === 'electron' ? electron : request.startsWith('.') ? local(path.resolve(path.dirname(productMain), request)) : request === 'fs' ? fsMock : require(request), __dirname: path.dirname(productMain), __filename: productMain, process, console, Buffer, setImmediate, clearTimeout, setTimeout, Promise, Date, Object, String, Number, Array, JSON, Error };
  vm.runInNewContext(source, context, { filename: productMain });
  return { app, window, ipc, calls };
}

describe('A9-17 real main entry startup ordering', () => {
  test('defers host creation until ready-to-show and gates valid IPC', async () => {
    const h = loadMainHarness();
    await Promise.resolve();
    expect(h.calls).not.toContain('createDesktopHost');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.calls).toContain('createDesktopHost');
    await h.ipc['desktop:request']({ sender: h.window.webContents, senderFrame: { url: 'file:///tmp' } }, {});
    expect(h.calls).toContain('desktop.handler');
  });

  test('initialization failure does not execute IPC handler', async () => {
    const h = loadMainHarness({ failHost: true });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    await expect(h.ipc['desktop:request']({ sender: h.window.webContents, senderFrame: { url: 'file:///tmp' } }, {})).rejects.toBeTruthy();
    expect(h.calls).not.toContain('desktop.handler');
  });

  test('closing before paint prevents late host creation', async () => {
    const h = loadMainHarness({ deferPaint: true });
    await Promise.resolve();
    h.window.close();
    await Promise.resolve();
    h.window.emit('ready-to-show');
    await new Promise(resolve => setImmediate(resolve));
    expect(h.window.destroyed).toBe(true);
    expect(h.calls).not.toContain('createDesktopHost');
    expect(h.calls).not.toContain('desktop.handler');
  });

  test('IPC waits through workspace restoration and is cancelled on close', async () => {
    let release!: () => void;
    const restore = new Promise<void>(resolve => { release = resolve; });
    const h = loadMainHarness({ restore });
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect(h.calls).toContain('restore.start');
    const pending = h.ipc['desktop:request']({ sender: h.window.webContents, senderFrame: { url: 'file:///tmp' } }, {});
    const result = expect(pending).rejects.toBeTruthy();
    expect(h.calls).not.toContain('desktop.handler');
    h.window.close();
    h.app.emit('will-quit');
    release();
    await result;
    expect(h.calls).toContain('host.dispose');
    expect(h.calls).not.toContain('desktop.handler');
  });

  test('invalid sender is rejected without waiting for startup', async () => {
    const h = loadMainHarness();
    await expect(h.ipc['desktop:request']({ sender: {}, senderFrame: { url: 'file:///tmp' } }, {})).rejects.toThrow('RENDERER_CAPABILITY_DENIED');
    expect(h.calls).not.toContain('desktop.handler');
  });
});
