/**
 * SPIKE 02 - VT/OSC 过滤器
 *
 * 过滤终端输出中的危险 VT/OSC 序列，防止终端注入攻击（C19 负向防护）。
 *
 * 防护目标：
 *   - OSC 52: 剪贴板写入（数据泄露）
 *   - 窗口标题注入：社会工程攻击
 *   - DECRQSS: 终端配置探测
 *   - 其他危险序列
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

// ─── 常量：危险序列正则 ─────────────────────────────────────────────────────

// ESC 字符
const ESC = '\x1b';
const CSI = ESC + '[';    // Control Sequence Introducer
const OSC = ESC + ']';    // Operating System Command

// 危险序列正则表达式
const PATTERNS = {
  // OSC 52: 剪贴板操作（数据泄露风险）
  // 格式: ESC ] 52 ; <selection> ; <base64-data> ST
  OSC_52_CLIPBOARD: /\x1b\]52;[pc0-7];[A-Za-z0-9+/=]*\x07/g,
  OSC_52_CLIPBOARD_ST: /\x1b\]52;[pc0-7];[A-Za-z0-9+/=]*\x1b\\/g,

  // 窗口标题设置（社会工程风险）
  // 格式: ESC ] 0 ; <title> ST  或  ESC ] 2 ; <title> ST
  WINDOW_TITLE: /\x1b\][02];[^\x07\x1b]*(?:\x07|\x1b\\)/g,

  // DECRQSS: 终端设置请求（信息泄露）
  // 格式: ESC P $ q <name> ESC \
  DECRQSS: /\x1bP\$q[^\x1b]*(?:\x1b\\)/g,

  // 设备属性请求
  // 格式: ESC [ c  或  ESC [ > c
  DEVICE_ATTR: /\x1b\[>?c/g,

  // 光标位置报告（可能被用于终端指纹识别）
  // 格式: ESC [ <row> ; <col> R
  CURSOR_POSITION: /\x1b\[\d+;\d+R/g,

  // 终端状态报告
  STATUS_REPORT: /\x1b\[5n/g,

  // 键盘布局请求
  KEYBOARD_LAYOUT: /\x1b\[.*?u/g,
};

// ─── VTFilter 类 ────────────────────────────────────────────────────────────

/**
 * VT/OSC 序列过滤器
 * 
 * 功能：
 *   - 检测并移除危险的 VT/OSC 序列
 *   - 记录被过滤的序列（用于审计）
 *   - 支持自定义过滤规则
 */
class VTFilter {
  /**
   * @param {object} options
   * @param {boolean} options.stripOSC52 - 是否过滤 OSC 52（默认 true）
   * @param {boolean} options.stripWindowTitle - 是否过滤窗口标题（默认 true）
   * @param {boolean} options.stripDECRQSS - 是否过滤 DECRQSS（默认 true）
   * @param {boolean} options.logFiltered - 是否记录被过滤的内容（默认 true）
   */
  constructor(options = {}) {
    this.stripOSC52 = options.stripOSC52 !== false;
    this.stripWindowTitle = options.stripWindowTitle !== false;
    this.stripDECRQSS = options.stripDECRQSS !== false;
    this.logFiltered = options.logFiltered !== false;
    
    // 过滤统计
    this._stats = {
      osc52Count: 0,
      windowTitleCount: 0,
      decrqssCount: 0,
      otherCount: 0,
      totalBytesFiltered: 0,
    };
    
    // 过滤日志
    this._log = [];
  }

  /**
   * 过滤输入数据中的危险序列
   * 
   * @param {string} data - 原始数据
   * @returns {string} 过滤后的数据
   */
  filter(data) {
    if (!data || typeof data !== 'string') {
      return data;
    }

    let filtered = data;
    const originalLength = data.length;

    // OSC 52 剪贴板过滤（C13）
    if (this.stripOSC52) {
      const matches = filtered.match(PATTERNS.OSC_52_CLIPBOARD) || 
                      filtered.match(PATTERNS.OSC_52_CLIPBOARD_ST) || [];
      if (matches.length > 0) {
        this._stats.osc52Count += matches.length;
        this._logEntry('OSC_52', matches);
      }
      filtered = filtered.replace(PATTERNS.OSC_52_CLIPBOARD, '');
      filtered = filtered.replace(PATTERNS.OSC_52_CLIPBOARD_ST, '');
    }

    // 窗口标题注入过滤（C14）
    if (this.stripWindowTitle) {
      const matches = filtered.match(PATTERNS.WINDOW_TITLE) || [];
      if (matches.length > 0) {
        this._stats.windowTitleCount += matches.length;
        this._logEntry('WINDOW_TITLE', matches);
      }
      filtered = filtered.replace(PATTERNS.WINDOW_TITLE, '');
    }

    // DECRQSS 过滤（C15）
    if (this.stripDECRQSS) {
      const matches = filtered.match(PATTERNS.DECRQSS) || [];
      if (matches.length > 0) {
        this._stats.decrqssCount += matches.length;
        this._logEntry('DECRQSS', matches);
      }
      filtered = filtered.replace(PATTERNS.DECRQSS, '');
    }

    // 其他危险序列过滤
    // TODO: 根据需要启用更多过滤规则

    // 更新统计
    const bytesFiltered = originalLength - filtered.length;
    if (bytesFiltered > 0) {
      this._stats.totalBytesFiltered += bytesFiltered;
    }

    return filtered;
  }

  /**
   * 获取过滤统计信息
   * 
   * @returns {object} 统计信息
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * 获取过滤日志
   * 
   * @returns {Array} 过滤日志
   */
  getLog() {
    return [...this._log];
  }

  /**
   * 重置统计和日志
   */
  reset() {
    this._stats = {
      osc52Count: 0,
      windowTitleCount: 0,
      decrqssCount: 0,
      otherCount: 0,
      totalBytesFiltered: 0,
    };
    this._log = [];
  }

  /**
   * 记录过滤条目
   * @private
   */
  _logEntry(type, matches) {
    if (!this.logFiltered) return;
    
    this._log.push({
      timestamp: Date.now(),
      type,
      count: matches.length,
      samples: matches.slice(0, 3), // 仅保留前 3 个样本
    });
  }
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

module.exports = { VTFilter, PATTERNS };
