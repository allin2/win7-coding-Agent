/**
 * SPIKE 02 - winpty 宿主进程管理
 *
 * 管理 winpty-agent 进程，提供伪终端通信接口。
 * winpty 在 Win7 上提供类 Unix PTY 功能。
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const { spawn } = require('child_process');

// ─── 常量 ────────────────────────────────────────────────────────────────────

const WINPTY_AGENT_PATH = path.join(__dirname, '..', 'vendor', 'winpty-agent.exe');
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

// ─── WinptyHost 类 ──────────────────────────────────────────────────────────

/**
 * winpty 宿主进程管理器
 * 
 * 负责：
 *   - 启动/停止 winpty-agent 进程
 *   - 管理 CONIN/CONOUT 管道
 *   - 处理中文+空格路径（C10）
 */
class WinptyHost extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.agentPath - winpty-agent.exe 路径（支持中文+空格）
   * @param {number} options.cols - 终端列数
   * @param {number} options.rows - 终端行数
   */
  constructor(options = {}) {
    super();
    this.agentPath = options.agentPath || WINPTY_AGENT_PATH;
    this.cols = options.cols || DEFAULT_COLS;
    this.rows = options.rows || DEFAULT_ROWS;
    
    this._agentProcess = null;
    this._pipeConin = null;   // 写入端（stdin）
    this._pipeConout = null;  // 读取端（stdout）
    this._started = false;
  }

  /**
   * 启动 winpty-agent 进程
   * 
   * @returns {Promise<void>}
   */
  async start() {
    if (this._started) {
      throw new Error('WinptyHost 已启动');
    }

    // TODO: 实现 winpty-agent 启动逻辑
    // 1. 创建命名管道（CONIN / CONOUT）
    // 2. 启动 winpty-agent.exe 并传递管道名称
    // 3. 连接到管道
    // 4. 监听 CONOUT 数据

    // 骨架：使用 child_process 模拟
    this._agentProcess = spawn(this.agentPath, [
      '--cols', String(this.cols),
      '--rows', String(this.rows),
    ], {
      // 中文+空格路径兼容（C10）
      cwd: path.dirname(this.agentPath),
      windowsHide: true,
    });

    this._agentProcess.on('error', (err) => {
      this.emit('error', err);
    });

    this._agentProcess.on('exit', (code, signal) => {
      this._started = false;
      this.emit('exit', { code, signal });
    });

    this._started = true;
    this.emit('started');
  }

  /**
   * 向终端写入数据（stdin）
   * 
   * @param {string|Buffer} data - 要写入的数据
   */
  write(data) {
    if (!this._started) {
      throw new Error('WinptyHost 未启动');
    }
    // TODO: 通过 CONIN 管道写入
    // 骨架：直接写入子进程 stdin
    if (this._agentProcess && this._agentProcess.stdin) {
      this._agentProcess.stdin.write(data);
    }
  }

  /**
   * 调整终端大小
   * 
   * @param {number} cols - 新列数
   * @param {number} rows - 新行数
   */
  resize(cols, rows) {
    if (!this._started) return;
    this.cols = cols;
    this.rows = rows;
    // TODO: 通知 winpty-agent 调整大小
  }

  /**
   * 停止 winpty-agent 进程
   */
  async stop() {
    if (!this._started) return;
    
    // TODO: 优雅关闭 winpty-agent
    if (this._agentProcess) {
      this._agentProcess.kill();
      this._agentProcess = null;
    }
    
    this._started = false;
    this.emit('stopped');
  }

  /**
   * 是否已启动
   */
  get isStarted() {
    return this._started;
  }
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

module.exports = { WinptyHost };
