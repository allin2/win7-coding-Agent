/**
 * SPIKE 02 - 终端会话管理
 *
 * 单个终端会话的生命周期，以及两条通道的结构性隔离（C19 / ADR-0031）：
 *
 *   - 用户输入通道：`sendUserInput(data)` 是**唯一**会调用 `WinptyHost.write()` 的
 *     公开方法，只由用户输入路径（harness 的 user-input 消息）触发。
 *   - 模型/Agent Core 通道：`handleModelEvent(msg)` 结构性**没有** pty 写能力。
 *     它只接受白名单内的 display/status 事件；任何形如"向 stdin 写入"的消息都会
 *     以 `security:blocked`（NO_STDIN_CHANNEL）被拒绝。这使 N01 的"写入不可达"
 *     在代码层面成立，不依赖运行时权限检查。
 *
 * 输出经 VTFilter 过滤后再上抛（N02-N05），过滤统计随 `filtered` 事件上报。
 *
 * 状态机：idle -> starting -> running -> closing -> closed
 *
 * Win7-Validation: NOT_PERFORMED（Win7 端到端由 A5 harness 在授权 lease 后执行）
 */

'use strict';

const { EventEmitter } = require('events');
const { WinptyHost } = require('./winpty_host');
const { VTFilter } = require('./filter');

// stdin 输入模式
const INPUT_MODE = {
  USER_ONLY: 'user_only',   // 仅用户输入写入 pty（默认；C19 输入隔离基线）
  FILTERED: 'filtered',     // 额外对输入中的危险序列（OSC 52 等）做过滤
};

// 模型事件白名单（仅展示/状态类，绝不含 stdin 写入）
const MODEL_EVENT_ALLOWED = new Set(['display', 'status']);

// 状态机
const STATE = {
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  CLOSING: 'closing',
  CLOSED: 'closed',
};

class TerminalSession extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} [options.shell] 要启动的 shell（如 cmd.exe）
   * @param {string[]} [options.args] shell 参数
   * @param {string} [options.cwd] 工作目录（支持中文+空格路径 C10）
   * @param {number} [options.cols] 初始列数
   * @param {number} [options.rows] 初始行数
   * @param {object} [options.env] 环境变量
   * @param {string} [options.inputMode] 输入模式（USER_ONLY / FILTERED）
   * @param {boolean} [options.enableFilter] 是否启用输出 VT/OSC 过滤
   * @param {object} [options.ptyModule] 透传给 WinptyHost（dev 注入 mock）
   * @param {object} [options.filter] 注入的过滤器实例（默认新建 VTFilter）
   */
  constructor(options = {}) {
    super();
    this.shell = options.shell || 'cmd.exe';
    this.args = Array.isArray(options.args) ? options.args.slice() : [];
    this.cwd = options.cwd || undefined;
    this.cols = options.cols || 80;
    this.rows = options.rows || 24;
    this.env = options.env || undefined;
    this.inputMode = options.inputMode || INPUT_MODE.USER_ONLY;
    this.enableFilter = options.enableFilter !== false;
    this.ptyModule = options.ptyModule || undefined;

    this._host = null;
    this._filter = options.filter || (this.enableFilter ? new VTFilter() : null);
    // 输入过滤使用独立实例，避免与输出过滤共享 _pending/_stats 造成方向污染
    this._inputFilter = options.inputMode === INPUT_MODE.FILTERED ? new VTFilter() : null;
    this._state = STATE.IDLE;
    this._sessionId = this._generateSessionId();
  }

  /**
   * 启动终端会话。
   * @returns {Promise<void>}
   */
  async start() {
    if (this._state !== STATE.IDLE) {
      throw new Error(`会话状态不允许启动: ${this._state}`);
    }
    this._state = STATE.STARTING;

    this._host = new WinptyHost({
      file: this.shell,
      args: this.args,
      cwd: this.cwd,
      env: this.env,
      cols: this.cols,
      rows: this.rows,
      ptyModule: this.ptyModule,
    });

    this._host.on('data', (data) => {
      const safe = this._processOutput(data);
      this.emit('output', { sessionId: this._sessionId, data: safe, rawLength: String(data).length });
    });
    this._host.on('exit', ({ code, signal }) => {
      this._state = STATE.CLOSED;
      // 排空过滤器中未判定的缓冲（危险前缀已被 flush 剥离），避免尾部输出静默丢失
      const tail = this._filter ? this._filter.flush() : '';
      if (tail) {
        this.emit('output', { sessionId: this._sessionId, data: tail, rawLength: tail.length });
      }
      this.emit('exit', { sessionId: this._sessionId, code, signal });
    });
    this._host.on('error', (error) => {
      this.emit('error', { sessionId: this._sessionId, error });
    });

    try {
      await this._host.start();
      this._state = STATE.RUNNING;
      this.emit('started', { sessionId: this._sessionId, pid: this._host.pid });
    } catch (error) {
      this._state = STATE.CLOSED;
      this.emit('error', { sessionId: this._sessionId, error });
      throw error;
    }
  }

  /**
   * 用户输入通道：**唯一**写入 pty 的公开方法。
   * 由 harness / 宿主进程的 `user-input` 消息调用；模型侧不能到达本方法。
   * @param {string|Buffer} data
   */
  sendUserInput(data) {
    this._assertRunning();
    if (this.inputMode === INPUT_MODE.FILTERED && this._inputFilter) {
      data = this._inputFilter.filter(String(data));
    }
    this._host.write(data);
    this.emit('input', { sessionId: this._sessionId, data: String(data) });
  }

  /**
   * 模型/Agent Core 事件通道：结构性**无** pty 写能力（N01）。
   *
   * 只处理白名单内的 display / status 事件；其余一律以
   * `security:blocked`（NO_STDIN_CHANNEL）拒绝。本方法正文不含任何 write 调用，
   * A5 harness 会用源码断言 + mock 写入计数双重证明。
   *
   * @param {object} msg 模型事件
   * @returns {{accepted:boolean, reason?:string}}
   */
  handleModelEvent(msg) {
    const event = msg && msg.event;
    if (typeof event === 'string' && MODEL_EVENT_ALLOWED.has(event)) {
      this.emit('model:event', { sessionId: this._sessionId, event });
      return { accepted: true };
    }
    const reason = 'NO_STDIN_CHANNEL';
    this.emit('security:blocked', {
      sessionId: this._sessionId,
      reason,
      attempted: msg && msg.type ? `${msg.type}:${event}` : 'model-output-to-stdin',
    });
    return { accepted: false, reason };
  }

  /**
   * 处理终端输出：经 VT 过滤后返回。
   * @param {string} data 原始输出
   * @returns {string} 过滤后的输出
   */
  _processOutput(data) {
    if (!this._filter) return String(data);
    const raw = String(data);
    const safe = this._filter.filter(raw);
    const stats = this._filter.getStats();
    this.emit('filtered', { sessionId: this._sessionId, stats, rawLength: raw.length, safeLength: safe.length });
    return safe;
  }

  /**
   * 调整终端尺寸。
   * @param {number} cols
   * @param {number} rows
   */
  resize(cols, rows) {
    if (this._state !== STATE.RUNNING || !this._host) return;
    this._host.resize(cols, rows);
    this.cols = cols;
    this.rows = rows;
    this.emit('resize', { sessionId: this._sessionId, cols, rows });
  }

  /**
   * 停止会话并回收。
   * @returns {Promise<void>}
   */
  async stop() {
    if (this._state === STATE.IDLE || this._state === STATE.CLOSED) return;
    if (this._state === STATE.CLOSING) return;
    this._state = STATE.CLOSING;
    if (this._host) await this._host.stop();
    this._state = STATE.CLOSED;
    this.emit('stopped', { sessionId: this._sessionId });
  }

  get isActive() {
    return this._state === STATE.RUNNING;
  }

  get sessionId() {
    return this._sessionId;
  }

  get state() {
    return this._state;
  }

  get pid() {
    return this._host ? this._host.pid : null;
  }

  get stats() {
    return this._filter ? this._filter.getStats() : null;
  }

  _assertRunning() {
    if (this._state !== STATE.RUNNING) {
      throw new Error(`会话未运行: ${this._state}`);
    }
  }

  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

module.exports = { TerminalSession, INPUT_MODE, STATE, MODEL_EVENT_ALLOWED };
