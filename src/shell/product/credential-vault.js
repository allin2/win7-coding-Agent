'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const PROTECTION = 'electron-safe-storage-windows-dpapi-current-user';
const FILE_NAME = 'credentials.v1.json';
const MAX_FILE_BYTES = 64 * 1024;
const MAX_CIPHERTEXT_BYTES = 32 * 1024;
const MAX_API_KEY_CHARS = 8192;

function createDpapiCredentialVault(options) {
  const config = options || {};
  const safeStorage = config.safeStorage;
  const platform = config.platform || process.platform;
  const userDataPath = config.userDataPath;
  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function' ||
      typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
    throw vaultError('CREDENTIAL_PROTECTION_UNAVAILABLE', 'Electron safeStorage 不可用。', '继续使用仅内存凭据，或重新安装完整验收包。');
  }
  if (typeof userDataPath !== 'string' || userDataPath.length === 0) {
    throw vaultError('CREDENTIAL_STORE_PATH_INVALID', '凭据目录不可用。', '使用有效的隔离 userData 后重试。');
  }

  const directory = path.join(userDataPath, 'credentials');
  const filePath = path.join(directory, FILE_NAME);

  function encryptionAvailable() {
    if (platform !== 'win32') return false;
    try {
      return safeStorage.isEncryptionAvailable() === true;
    } catch (_error) {
      return false;
    }
  }

  function getStatus() {
    return Object.freeze({
      available: encryptionAvailable(),
      saved: fs.existsSync(filePath),
      protection: PROTECTION,
    });
  }

  function saveApiKey(apiKey) {
    validateApiKey(apiKey);
    requireEncryption();
    let encrypted;
    try {
      encrypted = safeStorage.encryptString(apiKey);
    } catch (_error) {
      throw vaultError('CREDENTIAL_ENCRYPT_FAILED', 'Windows DPAPI 无法加密 API key。', '凭据未保存；继续使用仅内存模式或检查当前 Windows 用户配置。');
    }
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0 || encrypted.length > MAX_CIPHERTEXT_BYTES) {
      throw vaultError('CREDENTIAL_ENCRYPT_FAILED', 'Windows DPAPI 返回了无效密文。', '凭据未保存；继续使用仅内存模式。');
    }
    const record = {
      schemaVersion: SCHEMA_VERSION,
      protection: PROTECTION,
      ciphertext: encrypted.toString('base64'),
    };
    const serialized = JSON.stringify(record, null, 2) + '\n';
    if (Buffer.byteLength(serialized, 'utf8') > MAX_FILE_BYTES) {
      throw vaultError('CREDENTIAL_STORE_TOO_LARGE', '加密凭据文件超过大小上限。', '缩短凭据后重试。');
    }
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = path.join(directory, `${FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temporaryPath, filePath);
    } catch (_error) {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (_cleanupError) { /* ciphertext-only best effort */ }
      throw vaultError('CREDENTIAL_STORE_WRITE_FAILED', '无法原子保存 DPAPI 密文。', '检查当前用户的 userData 写入权限后重试；本次凭据仍只在内存。');
    }
    readRecord();
    return getStatus();
  }

  function loadApiKey() {
    requireEncryption();
    const record = readRecord();
    let plainText;
    try {
      plainText = safeStorage.decryptString(decodeCiphertext(record.ciphertext));
    } catch (_error) {
      throw vaultError('CREDENTIAL_DECRYPT_FAILED', '当前 Windows 用户无法解密已保存的 API key。', '清除已保存凭据并重新输入 API key。');
    }
    validateApiKey(plainText);
    return plainText;
  }

  function clearApiKey() {
    if (!fs.existsSync(filePath)) return getStatus();
    try {
      fs.unlinkSync(filePath);
    } catch (_error) {
      throw vaultError('CREDENTIAL_STORE_CLEAR_FAILED', '无法删除已保存的 DPAPI 密文。', '关闭占用该文件的程序并重试。');
    }
    return getStatus();
  }

  function requireEncryption() {
    if (!encryptionAvailable()) {
      throw vaultError('CREDENTIAL_PROTECTION_UNAVAILABLE', '当前环境无法使用 Windows DPAPI。', '继续使用仅内存凭据；不要启用明文保存。');
    }
  }

  function readRecord() {
    if (!fs.existsSync(filePath)) {
      throw vaultError('CREDENTIAL_NOT_SAVED', '没有已保存的 API key。', '输入 API key，并勾选“使用 Windows DPAPI 记住”。');
    }
    let stat;
    let serialized;
    try {
      stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_BYTES) throw new Error('invalid-size');
      serialized = fs.readFileSync(filePath, 'utf8');
    } catch (_error) {
      throw vaultError('CREDENTIAL_STORE_CORRUPT', '已保存的凭据文件不可读或大小异常。', '保留诊断证据后清除凭据并重新输入。');
    }
    let record;
    try { record = JSON.parse(serialized); } catch (_error) { record = null; }
    const keys = record && typeof record === 'object' && !Array.isArray(record) ? Object.keys(record).sort() : [];
    if (!record || keys.join(',') !== 'ciphertext,protection,schemaVersion' ||
        record.schemaVersion !== SCHEMA_VERSION || record.protection !== PROTECTION ||
        typeof record.ciphertext !== 'string') {
      throw vaultError('CREDENTIAL_STORE_CORRUPT', '已保存的凭据 schema 不兼容或已损坏。', '保留诊断证据后清除凭据并重新输入。');
    }
    decodeCiphertext(record.ciphertext);
    return record;
  }

  return Object.freeze({ getStatus, saveApiKey, loadApiKey, clearApiKey });
}

function decodeCiphertext(value) {
  if (!value || value.length > Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4 ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw vaultError('CREDENTIAL_STORE_CORRUPT', '已保存的凭据密文格式无效。', '保留诊断证据后清除凭据并重新输入。');
  }
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_CIPHERTEXT_BYTES || buffer.toString('base64') !== value) {
    throw vaultError('CREDENTIAL_STORE_CORRUPT', '已保存的凭据密文格式无效。', '保留诊断证据后清除凭据并重新输入。');
  }
  return buffer;
}

function validateApiKey(apiKey) {
  if (typeof apiKey !== 'string' || apiKey.length === 0 || apiKey.length > MAX_API_KEY_CHARS || /[\r\n\0]/.test(apiKey)) {
    throw vaultError('AUTH_INVALID_CREDENTIALS', 'API key 必须非空、有界且不含控制字符。', '重新输入有效的 API key。');
  }
}

function vaultError(code, message, recommendedAction) {
  const error = new Error(message);
  error.code = code;
  error.recommendedAction = recommendedAction;
  return error;
}

module.exports = {
  createDpapiCredentialVault,
  FILE_NAME,
  PROTECTION,
  SCHEMA_VERSION,
};
