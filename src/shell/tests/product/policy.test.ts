import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const policy = require('../../product/policy.js') as {
  PRODUCT_WEB_PREFERENCES: Record<string, unknown>;
  createWindowOptions(preloadPath: string): { webPreferences: Record<string, unknown> };
  isTrustedLocalUrl(targetUrl: string, rendererRoot: string): boolean;
};

const productRoot = join(__dirname, '..', '..', 'product');
const rendererRoot = join(productRoot, 'renderer');

describe('MVP Electron product policy', () => {
  it('locks the Renderer to the required least-privilege preferences', () => {
    expect(policy.PRODUCT_WEB_PREFERENCES).toEqual(expect.objectContaining({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    }));
    expect(Object.isFrozen(policy.PRODUCT_WEB_PREFERENCES)).toBe(true);
    expect(policy.createWindowOptions('/locked/preload.js').webPreferences).toEqual(expect.objectContaining({
      preload: '/locked/preload.js',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    }));
  });

  it('allows only file URLs inside the trusted Renderer root', () => {
    expect(policy.isTrustedLocalUrl(pathToFileURL(join(rendererRoot, 'index.html')).href, rendererRoot)).toBe(true);
    expect(policy.isTrustedLocalUrl(pathToFileURL(join(rendererRoot, '..', 'preload.js')).href, rendererRoot)).toBe(false);
    expect(policy.isTrustedLocalUrl('https://example.com/', rendererRoot)).toBe(false);
    expect(policy.isTrustedLocalUrl('file://attacker/share/index.html', rendererRoot)).toBe(false);
    expect(policy.isTrustedLocalUrl('not a url', rendererRoot)).toBe(false);
  });

  it('ships a strict CSP and exposes no arbitrary IPC or execution bridge', () => {
    const html = readFileSync(join(rendererRoot, 'index.html'), 'utf8');
    const preload = readFileSync(join(productRoot, 'preload.js'), 'utf8');
    const main = readFileSync(join(productRoot, 'main.js'), 'utf8');

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).not.toContain("'unsafe-eval'");
    expect(preload).not.toMatch(/\b(send|invoke)\s*:\s*\(/);
    expect(preload).toContain("ipcRenderer.on('desktop:event'");
    expect(preload).not.toContain('ipcRenderer.on(\'arbitrary');
    expect(main).not.toContain('child_process');
    expect(main).not.toContain('shell.openExternal');
    expect(main).toContain("window_open: 'deny'");
    expect(main).toContain("permissions: 'deny'");
  });
});
