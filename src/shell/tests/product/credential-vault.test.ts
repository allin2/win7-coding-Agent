import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createDpapiCredentialVault, FILE_NAME, PROTECTION } = require('../../product/credential-vault') as any;

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: jest.fn(() => true),
    encryptString: jest.fn((value: string) => Buffer.from(`dpapi:${value}`, 'utf8')),
    decryptString: jest.fn((value: Buffer) => {
      const decoded = value.toString('utf8');
      if (!decoded.startsWith('dpapi:')) throw new Error('wrong user');
      return decoded.slice(6);
    }),
  };
}

function captureError(action: () => unknown): any {
  try { action(); } catch (error) { return error; }
  throw new Error('Expected action to throw');
}

describe('A3.2 Windows DPAPI credential vault', () => {
  let userData: string;

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'a3p-凭据 空格-'));
  });

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
  });

  it('writes only versioned Base64 ciphertext and reloads it', () => {
    const safeStorage = fakeSafeStorage();
    const vault = createDpapiCredentialVault({ safeStorage, userDataPath: userData, platform: 'win32' });
    const secret = 'unit-secret-value-that-must-not-be-plaintext';

    expect(vault.getStatus()).toMatchObject({ available: true, saved: false, protection: PROTECTION });
    vault.saveApiKey(secret);

    const filePath = path.join(userData, 'credentials', FILE_NAME);
    const raw = fs.readFileSync(filePath, 'utf8');
    const record = JSON.parse(raw);
    expect(Object.keys(record).sort()).toEqual(['ciphertext', 'protection', 'schemaVersion']);
    expect(record).toMatchObject({ schemaVersion: 1, protection: PROTECTION });
    expect(raw).not.toContain(secret);
    expect(vault.loadApiKey()).toBe(secret);
    expect(safeStorage.decryptString).toHaveBeenCalledTimes(1);
  });

  it('atomically replaces an existing encrypted key', () => {
    const vault = createDpapiCredentialVault({ safeStorage: fakeSafeStorage(), userDataPath: userData, platform: 'win32' });
    vault.saveApiKey('first-key-value');
    vault.saveApiKey('second-key-value');
    expect(vault.loadApiKey()).toBe('second-key-value');
    expect(fs.readdirSync(path.join(userData, 'credentials')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('fails closed without DPAPI and never creates a plaintext file', () => {
    const safeStorage = fakeSafeStorage();
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    const vault = createDpapiCredentialVault({ safeStorage, userDataPath: userData, platform: 'win32' });
    expect(captureError(() => vault.saveApiKey('must-stay-memory-only'))).toMatchObject({ code: 'CREDENTIAL_PROTECTION_UNAVAILABLE' });
    expect(fs.existsSync(path.join(userData, 'credentials', FILE_NAME))).toBe(false);
  });

  it('preserves corrupt evidence and rejects unknown fields before decryption', () => {
    const safeStorage = fakeSafeStorage();
    const directory = path.join(userData, 'credentials');
    const filePath = path.join(directory, FILE_NAME);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 1, protection: PROTECTION, ciphertext: 'AAAA', apiKey: 'forbidden' }), 'utf8');
    const vault = createDpapiCredentialVault({ safeStorage, userDataPath: userData, platform: 'win32' });
    expect(captureError(() => vault.loadApiKey())).toMatchObject({ code: 'CREDENTIAL_STORE_CORRUPT' });
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('maps a different-user DPAPI failure without deleting ciphertext', () => {
    const safeStorage = fakeSafeStorage();
    const vault = createDpapiCredentialVault({ safeStorage, userDataPath: userData, platform: 'win32' });
    vault.saveApiKey('current-user-only-key');
    safeStorage.decryptString.mockImplementation(() => { throw new Error('wrong Windows user'); });
    expect(captureError(() => vault.loadApiKey())).toMatchObject({ code: 'CREDENTIAL_DECRYPT_FAILED' });
    expect(vault.getStatus().saved).toBe(true);
  });

  it('clears ciphertext idempotently', () => {
    const vault = createDpapiCredentialVault({ safeStorage: fakeSafeStorage(), userDataPath: userData, platform: 'win32' });
    vault.saveApiKey('clear-this-key');
    expect(vault.clearApiKey().saved).toBe(false);
    expect(vault.clearApiKey().saved).toBe(false);
  });
});
