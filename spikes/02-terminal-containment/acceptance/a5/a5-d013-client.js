/**
 * A5 - D-013 Helper 客户端（冻结接口：argv + JSON over stdio）
 *
 * 冻结协议（SPIKE_02 §7）：
 *   请求（stdin，每行一个 JSON）：
 *     { "executable", "argv": [...], "workingDirectory",
 *       "timeoutMs", "maxOutputSize", "allowNetwork", "allowedDirectories": [...] }
 *   响应（stdout，每行一个 JSON）：
 *     { "exitCode", "executionTimeMs", "timedOut", "outputTruncated",
 *       "stdoutSize", "stderrSize" }  或  { "error": "..." }
 *
 * T05（会话回收）依赖 D-013 的 Job Object（KILL_ON_JOB_CLOSE）保证进程树必杀。
 * 本模块只在 helper 二进制实际存在并可在目标机运行时执行回收断言；
 * D-013 源码→二进制闭包未合入前，T05 必须保持 NOT_PERFORMED，不得宣称 PASS。
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
    return response;
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
function buildRequest({ executable, argv, workingDirectory, timeoutMs, maxOutputSize, allowNetwork = false, allowedDirectories = [] }) {
  return {
    executable,
    argv: argv || [],
    workingDirectory,
    timeoutMs,
    maxOutputSize,
    allowNetwork,
    allowedDirectories,
  };
}

module.exports = { D013HelperClient, buildRequest };
