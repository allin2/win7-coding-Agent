/**
 * SPIKE 02 - winpty 宿主进程管理
 *
 * 基于 node-pty 0.10.0（D-011，Electron 22 ABI 110）封装伪终端：
 *   - 强制 `useConpty: false`（Win7 无 ConPTY，必须是 winpty 后端）
 *   - 提供 data / exit / started / stopped / error 事件
 *   - write / resize / stop 对 pty 的操作契约
 *
 * 可注入 `ptyModule`（默认 `require('node-pty')`），开发机用 mock 注入测试，
 * 避免在无 Windows 原生二进制的主机上加载 `pty.node`。
 *
 * C10：file/args/cwd 原样传递给 node-pty（其内部走宽字符 API，兼容中文+空格路径）。
 *
 * Win7-Validation: NOT_PERFORMED（Win7 端到端由 A5 harness 在授权 lease 后执行）
 */

'use strict';

const { EventEmitter } = require('events');

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_TERM_NAME = 'xterm-256color';

/**
 * 解析 pty 模块。仅在未注入时调用；惰性 require 使开发机无需安装 node-pty。
 */
function loadNodePty() {
  return require('node-pty');
}

/**
 * winpty 宿主：管理一个 node-pty 伪终端会话。
 */
class WinptyHost extends EventEmitter {
  /**
   * @param {object} options
   * @param {object} [options.ptyModule] 兼容 node-pty 的模块（dev 注入 mock）
   * @param {string} [options.file] 要启动的程序（默认 %ComSpec% 即 cmd.exe）
   * @param {string[]} [options.args] 程序参数
   * @param {string} [options.cwd] 工作目录（支持中文+空格）
   * @param {object} [options.env] 环境变量
   * @param {number} [options.cols] 初始列数
   * @param {number} [options.rows] 初始行数
   * @param {string} [options.name] $TERM 值
   */
  constructor(options = {}) {
    super();
    this.ptyModule = options.ptyModule || loadNodePty();
    this.file = options.file || (process.env.ComSpec || 'cmd.exe');
    this.args = Array.isArray(options.args) ? options.args.slice() : [];
    this.cwd = options.cwd || undefined;
    this.env = options.env || undefined;
    this.cols = options.cols || DEFAULT_COLS;
    this.rows = options.rows || DEFAULT_ROWS;
    this.name = options.name || DEFAULT_TERM_NAME;

    this._pty = null;
    this._started = false;
  }

  /**
   * 启动伪终端。
   * @returns {Promise<void>}
   */
  async start() {
    if (this._started) {
      throw new Error('WinptyHost 已启动');
    }
    const pty = this.ptyModule.spawn(this.file, this.args, {
      name: this.name,
      cols: this.cols,
      rows: this.rows,
      cwd: this.cwd,
      env: this.env,
      // Win7 无 CreatePseudoConsole/ConPTY，强制走 winpty 后端（D-011 构建已验证）
      useConpty: false,
    });
    this._pty = pty;

    pty.onData((data) => {
      this.emit('data', data);
    });
    pty.onExit((event) => {
      this._started = false;
      this.emit('exit', { code: event.exitCode, signal: event.signal || null });
    });

    this._started = true;
    this.emit('started', { pid: pty.pid });
  }

  /**
   * 向 pty 写入数据。仅用户输入路径可调用（C19 / N01：模型侧无此通道）。
   * @param {string|Buffer} data
   */
  write(data) {
    if (!this._started || !this._pty) {
      throw new Error('WinptyHost 未启动');
    }
    this._pty.write(String(data));
  }

  /**
   * 调整终端尺寸。
   * @param {number} cols
   * @param {number} rows
   */
  resize(cols, rows) {
    if (!this._pty) return;
    this._pty.resize(cols, rows);
    this.cols = cols;
    this.rows = rows;
  }

  /**
   * 停止伪终端并回收。
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this._pty) return;
    try {
      this._pty.kill();
    } catch (error) {
      this.emit('error', error);
    }
    this._started = false;
    this.emit('stopped');
  }

  get isStarted() {
    return this._started;
  }

  get pid() {
    return this._pty ? this._pty.pid : null;
  }
}

module.exports = { WinptyHost };
