import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createDesktopHost } = require('../../product/desktop-host') as { createDesktopHost: (options?: any) => any };

function fakeVault(initialSecret?: string) {
  let secret = initialSecret;
  return {
    getStatus: jest.fn(() => ({ available: true, saved: Boolean(secret), protection: 'dpapi' })),
    loadApiKey: jest.fn(() => {
      if (!secret) throw Object.assign(new Error('missing'), { code: 'CREDENTIAL_NOT_SAVED' });
      return secret;
    }),
    saveApiKey: jest.fn((value: string) => { secret = value; }),
    clearApiKey: jest.fn(() => { secret = undefined; }),
  };
}

describe('Desktop Alpha 3 Gateway settings boundary', () => {
  let root: string;
  let host: any;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-alpha3-'));
    fs.writeFileSync(path.join(root, 'sample.ts'), 'export const hello = "world";\n', 'utf8');
    host = createDesktopHost();
  });

  afterEach(() => {
    host.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('defaults to Replay and exposes no credential material', () => {
    expect(host.getSettings()).toEqual(expect.objectContaining({
      schemaVersion: 1,
      mode: 'replay',
      persistence: 'process-memory-only',
    }));
    expect(JSON.stringify(host.getSettings())).not.toContain('a3-secret-key');
  });

  it('explicitly configures HTTPS Gateway with process-memory credentials', () => {
    const settings = host.setSettings({ values: {
      mode: 'gateway',
      gatewayUrl: 'https://gateway.example.test/v1',
      apiKey: 'a3-secret-key-that-must-not-be-persisted',
    } });

    expect(settings.mode).toBe('gateway');
    expect(settings.credentials.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(settings)).not.toContain('a3-secret-key');
    expect(host.getDiagnostics().capabilities.gateway).toContain('https-node');
  });

  it('explicitly configures HTTP Gateway when selected by the user', () => {
    const settings = host.setSettings({ values: {
      mode: 'gateway',
      gatewayUrl: 'http://gateway.example.test/v1',
      apiKey: 'a3-secret-key',
    } });

    expect(settings.mode).toBe('gateway');
    expect(settings.gatewayUrl).toBe('http://gateway.example.test/v1');
    expect(host.getDiagnostics().capabilities.gateway).toContain('http-node');
  });

  it('explicitly configures the reviewed DeepSeek public model without exposing its key', () => {
    const settings = host.setSettings({ values: {
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: 'deepseek-unit-secret',
    } });

    expect(settings).toEqual(expect.objectContaining({
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      persistence: 'process-memory-only',
    }));
    expect(JSON.stringify(settings)).not.toContain('deepseek-unit-secret');
    expect(host.getDiagnostics().capabilities.gateway).toContain('deepseek-openai-deepseek-v4-flash');
  });

  it('rejects unreviewed DeepSeek hosts, paths and models before any request', () => {
    expect(() => host.setSettings({ values: {
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com.evil.test',
      model: 'deepseek-v4-flash',
      apiKey: 'deepseek-unit-secret',
    } })).toThrow(/api\.deepseek\.com/);
    expect(() => host.setSettings({ values: {
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com/beta',
      model: 'deepseek-v4-flash',
      apiKey: 'deepseek-unit-secret',
    } })).toThrow(/api\.deepseek\.com/);
    expect(() => host.setSettings({ values: {
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com',
      model: 'unreviewed-model',
      apiKey: 'deepseek-unit-secret',
    } })).toThrow(/Unsupported DeepSeek model/);
  });

  it('rejects unsupported or ambiguous connection setup before any request', () => {
    expect(() => host.setSettings({ values: {
      mode: 'gateway',
      gatewayUrl: 'ftp://gateway.example.test/v1',
      apiKey: 'a3-secret-key',
    } })).toThrow(/HTTP 或 HTTPS/);
  });

  it('can explicitly return to Replay and disconnect the provider', () => {
    host.setSettings({ values: {
      mode: 'gateway',
      gatewayUrl: 'https://gateway.example.test/v1',
      apiKey: 'a3-secret-key',
    } });
    const settings = host.setSettings({ values: { mode: 'replay' } });
    expect(settings.mode).toBe('replay');
    expect(settings.credentials.apiKeyConfigured).toBe(false);
  });

  it('detects saved DPAPI state at startup without decrypting or leaving Replay', () => {
    host.dispose();
    const vault = fakeVault('saved-unit-key');
    host = createDesktopHost({ credentialVault: vault });

    expect(host.getSettings()).toEqual(expect.objectContaining({
      mode: 'replay',
      persistence: 'windows-dpapi-current-user',
      credentials: expect.objectContaining({ apiKeySaved: true, apiKeyConfigured: false }),
    }));
    expect(vault.loadApiKey).not.toHaveBeenCalled();
  });

  it('decrypts a saved key only when the user explicitly applies DeepSeek mode', () => {
    host.dispose();
    const vault = fakeVault('saved-unit-key');
    host = createDesktopHost({ credentialVault: vault });

    const settings = host.setSettings({ values: {
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      rememberApiKey: true,
    } });

    expect(vault.loadApiKey).toHaveBeenCalledTimes(1);
    expect(settings.credentials).toMatchObject({ apiKeySaved: true, apiKeyConfigured: true });
    expect(JSON.stringify(settings)).not.toContain('saved-unit-key');
  });

  it('saves a newly entered key through the injected main-process vault', () => {
    host.dispose();
    const vault = fakeVault();
    host = createDesktopHost({ credentialVault: vault });

    const settings = host.setSettings({ values: {
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      apiKey: 'new-dpapi-unit-key',
      rememberApiKey: true,
    } });

    expect(vault.saveApiKey).toHaveBeenCalledWith('new-dpapi-unit-key');
    expect(settings.persistence).toBe('windows-dpapi-current-user');
    expect(JSON.stringify(settings)).not.toContain('new-dpapi-unit-key');
  });

  it('clears DPAPI ciphertext and active in-memory credentials, returning to Replay', () => {
    host.dispose();
    const vault = fakeVault('saved-unit-key');
    host = createDesktopHost({ credentialVault: vault });
    host.setSettings({ values: {
      mode: 'deepseek',
      gatewayUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      rememberApiKey: true,
    } });

    const settings = host.clearSavedApiKey();
    expect(vault.clearApiKey).toHaveBeenCalledTimes(1);
    expect(settings).toMatchObject({ mode: 'replay', persistence: 'process-memory-only' });
    expect(settings.credentials).toMatchObject({ apiKeySaved: false, apiKeyConfigured: false });
  });
});
