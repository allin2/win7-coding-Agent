/**
 * A5 - Win7 harness driver：经 utilityProcess 宿主驱动真实 node-pty/winpty
 *
 * 与开发机 InProcessDriver 实现同一 driver 接口，使 a5-terminal-harness.js 的
 * T01~T05 / N01~N05 过程在 Win7 上运行同样的确定性逻辑。
 *
 * produceOutput(payload)：Win7 上通过 CPython（C:\acceptance\python38_mvp\python.exe）
 * 以二进制写 payload 到 pty stdout，模拟"终端内程序输出恶意字节"。
 *
 * Win7-Validation: NOT_PERFORMED（需授权 lease 与真实 D-011 工件）
 */

'use strict';

const path = require('path');

class HostDriver {
  /**
   * @param {object} child utilityProcess fork 返回的宿主子进程
   */
  constructor(child) {
    this.child = child;
    this._output = '';
    this._blocked = [];
    this._filtered = [];
    this._stopped = [];
    this._sessionId = null;
    this._waiters = new Map();
    this._resizeLog = [];
    this._ptyWriteCount = 0;
    this._ptyWrites = [];

    child.on('message', (msg) => this._onMessage(msg));
  }

  _waitFor(type, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._waiters.delete(type);
        reject(new Error(`win7 host timeout waiting for ${type}`));
      }, timeoutMs);
      this._waiters.set(type, { resolve, reject, timer });
    });
  }

  _resolve(type, payload) {
    const waiter = this._waiters.get(type);
    if (waiter) {
      clearTimeout(waiter.timer);
      this._waiters.delete(type);
      waiter.resolve(payload);
    }
  }

  _onMessage(msg) {
    switch (msg.type) {
      case 'output':
        this._output += msg.data;
        break;
      case 'filtered':
        this._filtered.push(msg.stats);
        break;
      case 'security:blocked':
        this._blocked.push(msg);
        break;
      case 'session:started':
        this._sessionId = msg.sessionId;
        this._resolve('session:started', msg);
        break;
      case 'session:stopped':
        this._stopped.push(msg);
        this._resolve('session:stopped', msg);
        break;
      case 'session:exit':
        this._resolve('session:exit', msg);
        break;
      case 'session:error':
        this._resolve('session:error', msg);
        break;
      default:
        break;
    }
  }

  async start(cfg = {}) {
    this.child.postMessage({
      type: 'session:start',
      source: 'system',
      session: {
        shell: cfg.shell || process.env.ComSpec || 'cmd.exe',
        args: cfg.args || [],
        cwd: cfg.cwd,
        cols: cfg.cols || 80,
        rows: cfg.rows || 24,
        env: cfg.env,
      },
    });
    return this._waitFor('session:started');
  }

  write(data) {
    this.child.postMessage({ type: 'user-input', source: 'user', data: String(data) });
    this._ptyWrites.push(String(data));
    this._ptyWriteCount += 1;
  }

  async resize(cols, rows) {
    this.child.postMessage({ type: 'session:resize', cols, rows });
    this._resizeLog.push([cols, rows]);
  }

  async stop() {
    if (!this._sessionId) return;
    this.child.postMessage({ type: 'session:stop' });
    await this._waitFor('session:stopped');
  }

  produceOutput(payload) {
    // 经 CPython 将原始字节写到 pty stdout；命令本身回显会经过过滤器，属预期
    const py = process.env.WIN7_PYTHON || 'C:\\acceptance\\python38_mvp\\python.exe';
    const arg = `import sys;sys.stdout.write(${JSON.stringify(payload)})`;
    this.write(`${py} -c "${arg}"\r`);
  }

  sendModelEvent(msg) {
    this.child.postMessage({ type: 'model-event', ...msg });
  }

  collect() { return this._output; }
  clearOutput() { this._output = ''; }

  get blocked() { return this._blocked; }

  introspect() {
    return {
      ptyWrites: this._ptyWrites.slice(),
      ptyWriteCount: this._ptyWriteCount,
      resizeLog: this._resizeLog.slice(),
      sessionId: this._sessionId,
      stats: this._filtered.length ? this._filtered[this._filtered.length - 1] : null,
    };
  }

  async close() {
    try { this.child.postMessage({ type: 'shutdown' }); } catch (_) { /* already gone */ }
  }
}

module.exports = { HostDriver };
