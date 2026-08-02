/**
 * SPIKE 02 - 终端会话管理
 *
 * 管理单个终端会话的生命周期：
 *   - stdin 仅接收用户输入（过滤自动化注入）
 *   - stdout 经过 VT/OSC 过滤器处理后输出
 *   - 与 C++ Helper 协同工作
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

const { EventEmitter } = require('events');
const { WinptyHost } = require('./winpty_host');
const { VTFilter } = require('./filter');

// ─── 常量 ────────────────────────────────────────────────────────────────────

// stdin 输入模式
const INPUT_MODE = {
  USER_ONLY: 'user_only',     // 仅接收用户手动输入
  FILTERED: 'filtered',       // 接收输入但过滤危险序列
};

// ─── TerminalSession 类 ─────────────────────────────────────────────────────

/**
 * 终端会话管理器
 * 
 * 负责：
 *   - 管理会话生命周期
 *   - stdin 输入过滤（C09）
 *   - stdout 输出过滤（C13-C15）
 */
class TerminalSession extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.shell - 要启动的 shell（如 cmd.exe, powershell.exe）
   * @param {string} options.cwd - 工作目录（支持中文+空格路径 C10）
   * @param {string} options.inputMode - stdin 输入模式
   * @param {boolean} options.enableFilter - 是否启用 VT/OSC 过滤
   */
  constructor(options = {}) {
    super();
    this.shell = options.shell || 'cmd.exe';
    this.cwd = options.cwd || process.cwd();
    this.inputMode = options.inputMode || INPUT_MODE.USER_ONLY;
    this.enableFilter = options.enableFilter !== false;
    
    this._winptyHost = null;
    this._vtFilter = null;
    this._active = false;
    this._sessionId = this._generateSessionId();
  }

  /**
   * 启动终端会话
   * 
   * @returns {Promise<void>}
   */
  async start() {
    if (this._active) {
      throw new Error('会话已激活');
    }

    // 创建 VT 过滤器（C13-C15）
    if (this.enableFilter) {
      this._vtFilter = new VTFilter();
    }

    // 创建 winpty 宿主
    this._winptyHost = new WinptyHost();
    
    // 监听 winpty 事件
    this._winptyHost.on('error', (err) => {
      this.emit('error', { sessionId: this._sessionId, error: err });
    });

    this._winptyHost.on('exit', ({ code, signal }) => {
      this._active = false;
      this.emit('exit', { sessionId: this._sessionId, code, signal });
    });

    // 启动 winpty
    await this._winptyHost.start();
    this._active = true;
    
    this.emit('started', { sessionId: this._sessionId });
  }

  /**
   * 向终端写入数据（用户输入）
   * 
   * stdin 仅接收用户输入（C09），自动化命令通过安全通道发送
   * 
   * @param {string|Buffer} data - 用户输入数据
   */
  write(data) {
    if (!this._active) {
      throw new Error('会话未激活');
    }

    // 输入模式处理
    if (this.inputMode === INPUT_MODE.USER_ONLY) {
      // 过滤掉非用户输入（如自动化脚本注入）
      // TODO: 实现用户输入识别逻辑
    }

    // 写入 winpty
    this._winptyHost.write(data);
    this.emit('input', { sessionId: this._sessionId, data });
  }

  /**
   * 处理终端输出（经过 VT 过滤）
   * 
   * @param {string} data - 原始输出数据
   * @returns {string} 过滤后的数据
   */
  processOutput(data) {
    if (!this.enableFilter || !this._vtFilter) {
      return data;
    }

    // 应用 VT/OSC 过滤（C13-C15）
    const filtered = this._vtFilter.filter(data);
    
    // 记录被过滤的内容
    if (filtered !== data) {
      this.emit('filtered', { 
        sessionId: this._sessionId, 
        original: data, 
        filtered 
      });
    }
    
    return filtered;
  }

  /**
   * 调整终端大小
   * 
   * @param {number} cols - 列数
   * @param {number} rows - 行数
   */
  resize(cols, rows) {
    if (!this._active) return;
    this._winptyHost.resize(cols, rows);
    this.emit('resize', { sessionId: this._sessionId, cols, rows });
  }

  /**
   * 停止终端会话
   */
  async stop() {
    if (!this._active) return;
    
    await this._winptyHost.stop();
    this._active = false;
    
    this.emit('stopped', { sessionId: this._sessionId });
  }

  /**
   * 是否激活
   */
  get isActive() {
    return this._active;
  }

  /**
   * 会话 ID
   */
  get sessionId() {
    return this._sessionId;
  }

  /**
   * 生成会话 ID
   * @private
   */
  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

module.exports = { TerminalSession, INPUT_MODE };
