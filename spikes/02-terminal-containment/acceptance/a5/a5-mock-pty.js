/**
 * A5 - MockPty：node-pty IPty 接口的确定性模拟
 *
 * 用途：开发机（macOS，无 Windows 原生二进制）上驱动 WinptyHost /
 * TerminalSession 的完整链路，并让断言可以精确观察到：
 *   - 写入 pty 的全部字节（recordedWrites）→ N01 结构性 stdin 不可达证明
 *   - resize 调用序列（resizeLog）→ T03
 *   - kill 调用（killed）→ T05 回收前置
 *   - 脚本化输出（emitData / scriptOutput）→ T01-T04 与 N02-N05 注入
 *
 * MockPtyModule.spawn 与 node-pty 同签名；winpty/winpty_host.js 通过可注入
 * ptyModule 使用本模块，因此同一份生产代码在开发机可完整测试。
 */

'use strict';

class MockPty {
  /**
   * @param {object} init
   * @param {string} init.file 程序路径
   * @param {string[]} init.args 参数
   * @param {object} init.opts spawn 选项（含可选的 _scriptOutput）
   */
  constructor(init) {
    this.file = init.file;
    this.args = init.args;
    this.opts = init.opts || {};
    this.pid = init.pid || 42000 + MockPty._seq++;
    this.cols = this.opts.cols || 80;
    this.rows = this.opts.rows || 24;
    this.recordedWrites = [];
    this.resizeLog = [];
    this.killed = false;
    this.usedConpty = this.opts.useConpty;

    this._dataListeners = [];
    this._exitListeners = [];
    this._scriptOutput = Array.isArray(this.opts._scriptOutput) ? this.opts._scriptOutput.slice() : [];
    this._scriptTimer = null;
  }

  onData(listener) {
    this._dataListeners.push(listener);
    return { dispose: () => { this._dataListeners = this._dataListeners.filter((l) => l !== listener); } };
  }

  onExit(listener) {
    this._exitListeners.push(listener);
    return { dispose: () => { this._exitListeners = this._exitListeners.filter((l) => l !== listener); } };
  }

  write(data) {
    this.recordedWrites.push(String(data));
  }

  resize(cols, rows) {
    this.resizeLog.push([cols, rows]);
    this.cols = cols;
    this.rows = rows;
  }

  kill() {
    this.killed = true;
    this._emitExit({ exitCode: 0 });
  }

  // ── 测试辅助 ────────────────────────────────────────────────────────────────

  /**
   * 模拟终端收到一段输出（等价于恶意程序在 pty 内写入这些字节）。
   */
  emitData(data) {
    this._dataListeners.forEach((listener) => listener(String(data)));
  }

  emitExit(event) {
    this._emitExit(event);
  }

  /**
   * 按时间序列自动回放脚本化输出。条目格式 {delayMs, data}。
   */
  startScript() {
    let at = 0;
    this._scriptOutput.forEach((item) => {
      at += item.delayMs;
      this._scriptTimer = setTimeout(() => this.emitData(item.data), at);
    });
  }

  _emitExit(event) {
    this._exitListeners.forEach((listener) => listener(event || { exitCode: 0 }));
  }
}
MockPty._seq = 1;

const MockPtyModule = {
  spawn(file, args, opts) {
    const pty = new MockPty({ file, args, opts, pid: MockPtyModule.nextPid && MockPtyModule.nextPid() });
    MockPtyModule.last = pty;
    if (opts && Array.isArray(opts._scriptOutput) && opts._scriptOutput.length > 0) {
      // 短暂异步回放，模拟真实 pty 的输出时序
      setTimeout(() => pty.startScript(), 5);
    }
    return pty;
  },
  last: null,
  reset() {
    MockPtyModule.last = null;
  },
};

module.exports = { MockPty, MockPtyModule };
