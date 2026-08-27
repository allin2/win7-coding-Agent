'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const FILE_NAME = 'active-workspace.v1.json';
const MAX_FILE_BYTES = 32 * 1024;

function createActiveWorkspaceStore(options) {
  const config = options || {};
  const dataRoot = typeof config.dataRoot === 'string' ? path.resolve(config.dataRoot) : '';
  if (!dataRoot) {
    throw storeError('A9_ACTIVE_WORKSPACE_STORE_PATH_INVALID', '活动工作区存储目录不可用。');
  }
  const filePath = path.join(dataRoot, FILE_NAME);

  function load() {
    if (!fs.existsSync(filePath)) return null;
    let stat;
    let serialized;
    try {
      stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_BYTES) throw new Error('invalid-size-or-type');
      serialized = fs.readFileSync(filePath, 'utf8');
    } catch (_error) {
      throw storeError('A9_ACTIVE_WORKSPACE_STORE_CORRUPT', '活动工作区记录不可读或大小异常。');
    }

    let record;
    try { record = JSON.parse(serialized); } catch (_error) { record = null; }
    const keys = record && typeof record === 'object' && !Array.isArray(record)
      ? Object.keys(record).sort()
      : [];
    if (!record || keys.join(',') !== 'schemaVersion,workspacePath' ||
        record.schemaVersion !== SCHEMA_VERSION || typeof record.workspacePath !== 'string' ||
        !path.isAbsolute(record.workspacePath) || record.workspacePath.includes('\0')) {
      throw storeError('A9_ACTIVE_WORKSPACE_STORE_CORRUPT', '活动工作区记录 schema 不兼容或已损坏。');
    }
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      workspacePath: record.workspacePath,
    });
  }

  function save(workspacePath) {
    if (typeof workspacePath !== 'string' || !path.isAbsolute(workspacePath) || workspacePath.includes('\0')) {
      throw storeError('A9_ACTIVE_WORKSPACE_PATH_INVALID', '活动工作区必须是规范化绝对路径。');
    }
    try {
      const current = load();
      if (current && current.workspacePath === workspacePath) return current;
    } catch (_error) {
      // An explicit, valid user selection is allowed to replace a corrupt pointer.
    }

    const record = { schemaVersion: SCHEMA_VERSION, workspacePath };
    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_FILE_BYTES) {
      throw storeError('A9_ACTIVE_WORKSPACE_STORE_TOO_LARGE', '活动工作区记录超过大小上限。');
    }
    fs.mkdirSync(dataRoot, { recursive: true });
    const temporaryPath = path.join(dataRoot, `${FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temporaryPath, filePath);
    } catch (_error) {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (_cleanupError) { /* best effort */ }
      throw storeError('A9_ACTIVE_WORKSPACE_STORE_WRITE_FAILED', '无法原子保存活动工作区记录。');
    }
    return load();
  }

  return Object.freeze({ filePath, load, save });
}

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.recommendedAction = '保留当前记录用于诊断，然后重新选择一个存在且可读取的工作区。';
  return error;
}

module.exports = { createActiveWorkspaceStore, FILE_NAME, SCHEMA_VERSION };
