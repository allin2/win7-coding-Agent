/**
 * A5 - D-013 Helper 客户端（冻结接口：argv + JSON over stdio）
 *
 * D-013 v21 协议（SPIKE_02 §7）：
 *   请求（stdin，每行一个 JSON）：
 *     { "requestId", "executable", "argv": [...], "workingDirectory",
 *       "timeoutMs", "maxOutputSize", "allowNetwork", "allowedDirectories": [...],
 *       "aclPolicy": { "acceptanceRoot", "perRunRoot" } }
 *   响应（stdout，每行一个 JSON）：
 *     { "schema_version": 1, "type": "execution_result", "requestId", ... }
 *     或 { "schema_version": 1, "type": "error", "requestId", "error": "..." }
 *
 * T05（会话回收）依赖 D-013 的 Job Object（KILL_ON_JOB_CLOSE）保证进程树必杀。
 * 本模块只在 helper 二进制实际存在并可在目标机运行时执行回收断言。
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_TIMEOUT_MS = 10000;

class D013HelperClient {
  /**
   * @param {string} binary helper 可执行文件路径
   */
  constructor(binary) {
    this.binary = binary;
    this.child = null;
    this.buffer = '';
    this.pending = [];
    this.stderr = '';
  }

  static isPresent(binary) {
    return Boolean(binary) && fs.existsSync(binary);
  }

  async start() {
    if (this.child) return;
    this.child = spawn(this.binary, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this._onStdout(chunk));
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk; });
  }

  /**
   * 发送一条 JSON-over-stdio 请求并等待响应。
   * @param {object} request
   * @param {number} timeoutMs
   * @returns {Promise<object>} 解析后的响应
   */
  async request(request, timeoutMs = DEFAULT_TIMEOUT_MS) {
    await this.start();
    const response = this._nextResponse(timeoutMs);
    this.child.stdin.write(`${JSON.stringify(request)}\n`, 'utf8');
    const value = await response;
    if (value.requestId !== request.requestId) {
      throw new Error(`D-013 response requestId mismatch: ${String(value.requestId)}`);
    }
    return value;
  }

  async close() {
    if (!this.child) return;
    if (!this.child.stdin.destroyed) this.child.stdin.end();
    await new Promise((resolve) => {
      if (this.child.exitCode !== null) { resolve(); return; }
      const timer = setTimeout(() => { try { this.child.kill(); } catch (_) {} resolve(); }, 5000);
      this.child.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }

  _nextResponse(timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      };
      const timer = setTimeout(() => {
        const index = this.pending.indexOf(waiter);
        if (index !== -1) this.pending.splice(index, 1);
        reject(new Error(`D-013 helper response timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.push(waiter);
    });
  }

  _onStdout(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const waiter = this.pending.shift();
      if (!waiter) continue;
      try {
        waiter.resolve(JSON.parse(line));
      } catch (error) {
        waiter.reject(new Error(`invalid D-013 response: ${error.message}`));
      }
    }
  }
}

/**
 * 构造一条标准的 helper 请求。
 */
function buildRequest({ requestId, executable, argv, workingDirectory, timeoutMs, maxOutputSize,
  allowNetwork = false, allowedDirectories = [], protectedDirectories = [], aclPolicy }) {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(requestId)) {
    throw new Error('D-013 requestId is required and must be protocol-safe');
  }
  if ((allowedDirectories.length > 0 || protectedDirectories.length > 0)
      && (!aclPolicy || !aclPolicy.acceptanceRoot || !aclPolicy.perRunRoot)) {
    throw new Error('D-013 v21 requires aclPolicy for every ACL target');
  }
  return {
    requestId,
    executable,
    argv: argv || [],
    workingDirectory,
    timeoutMs,
    maxOutputSize,
    allowNetwork,
    allowedDirectories,
    protectedDirectories,
    ...(aclPolicy ? { aclPolicy } : {}),
  };
}

module.exports = { D013HelperClient, buildRequest };
