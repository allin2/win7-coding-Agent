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
        this._sessionId = null;
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

  /**
   * 经 CPython 将原始字节写到 pty stdout。
   * payload 经 base64 分块（每块远低于 cmd 8191 命令行限制），python 用
   * sys.stdout.buffer.write 解码输出原始字节——避免双引号嵌套被 cmd 截断、
   * 避免超长命令、字节无损（含 \x1b / \x07 / UTF-8 中文）。
   * 用唯一 begin/end marker 圈住输出，等两个 marker 都出现在（经 filter 后的）
   * 输出里再 resolve，确保 payload 已真正进入链路。
   */
  async produceOutput(payload) {
    const py = process.env.WIN7_PYTHON || 'C:\\acceptance\\python38_mvp\\python.exe';
    const seq = (this._produceSeq = (this._produceSeq || 0) + 1);
    const begin = `A5MARKBEGIN${seq}`;
    const end = `A5MARKEND${seq}`;
    const b64 = Buffer.from(String(payload), 'utf8').toString('base64');
    const CHUNK = 6000;
    this.write(`echo ${begin}\r`);
    let writes = 1;
    for (let i = 0; i < b64.length; i += CHUNK) {
      const piece = b64.slice(i, i + CHUNK);
      this.write(`${py} -c "import sys,base64;sys.stdout.buffer.write(base64.b64decode('${piece}'))"\r`);
      writes += 1;
    }
    this.write(`echo ${end}\r`);
    writes += 1;
    this._lastProduceWrites = writes;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (this._output.includes(begin) && this._output.includes(end)) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /**
   * 等待收到至少 count 条 security:blocked（IPC 异步）。
   */
  async waitForBlocks(count, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this._blocked.length >= count) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /**
   * 探测 winpty 交互式 stdin 输入是否可用（Win7 实测：conin write 不生效）。
   * 启动会话、写入 echo probe、检查输出是否出现；随后清理。
   */
  async probeInteractiveInput() {
    try {
      await this.start({ cols: 80, rows: 24 });
      this.clearOutput();
      const probe = `A5_IO_PROBE_${Math.floor(Math.random() * 1e9)}`;
      this.write(`echo ${probe}\r`);
      await new Promise((r) => setTimeout(r, 2500));
      const ok = this._output.includes(probe);
      await this.stop();
      return ok;
    } catch (_) {
      return false;
    }
  }

  sendModelEvent(msg) {
    // type 必须固定为 'model-event'（放最后，避免被 msg.type 覆盖）
    this.child.postMessage({ ...msg, type: 'model-event' });
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
