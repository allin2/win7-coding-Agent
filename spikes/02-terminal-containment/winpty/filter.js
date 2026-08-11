/**
 * SPIKE 02 - VT/OSC 流式有界过滤器
 *
 * 过滤终端输出中的危险控制序列，防止终端注入（C19 负向防护）。
 *
 * 防护目标（N02-N05）：
 *   - OSC 52：剪贴板写入（数据泄露）
 *   - OSC 0/2：窗口标题注入（社会工程）
 *   - DECRQSS（DCS $q）与设备应答类 CSI（DA/DSR/CPR）：诱导终端回写 stdin
 *   - 超长 / 深层嵌套控制序列：有界处理，不挂起、不耗尽内存
 *
 * 实现是状态流式扫描器（不是逐 chunk 正则替换）：
 *   - 部分控制序列跨 chunk 缓冲，下一 chunk 继续完成判定；
 *   - 每个序列有长度上界，超过即整段剥离；
 *   - 序列内 ESC 嵌套有深度上界；
 *   - 单次 filter() 有扫描步数与墙钟上界，触顶即暂存待下一调用继续。
 *
 * 导出 `PATTERNS` 仅为兼容既有静态检查（test_containment.sh）与文档参考，
 * 实际过滤行为以流式扫描器为准。
 *
 * Win7-Validation: NOT_PERFORMED（Win7 端到端由 A5 harness 在授权 lease 后执行）
 */

'use strict';

const ESC = '\x1b';
const BEL = '\x07';
const ST = ESC + '\\';

// ─── 有界处理参数（N05）───────────────────────────────────────────────────────

// 单个转义序列最长长度；超过即整段剥离（含尾部到终止符）
const MAX_SEQUENCE_LENGTH = 8192;
// 单个序列内允许的最大 ESC 嵌套数；超过即整段剥离
const MAX_NESTED_ESCAPES = 32;
// 剥离超长序列时向前扫描终止符的硬上界（避免无终止符洪水时无界扫描）
const MAX_DROP_LIMIT = 1 * 1024 * 1024;
// 单次 filter() 最大扫描迭代数与墙钟时间
const MAX_SCAN_STEPS = 200000;
const MAX_SCAN_MS = 100;
// 单次 filter() 可产出的输出字节上界
const MAX_OUTPUT_CHUNK = 1 * 1024 * 1024;
// 过滤日志长度上界（环形）
const MAX_LOG = 200;

// 未终止的危险序列前缀：会话结束时直接剥离
const DANGEROUS_PARTIAL_PREFIX = /^\x1b\](?:0*52|0*[02])(?:;|$)/;
const DANGEROUS_PARTIAL_DCS = /^\x1bP\$q/;

function stripDangerousPartial(partial) {
  if (DANGEROUS_PARTIAL_PREFIX.test(partial)) return '';
  if (DANGEROUS_PARTIAL_DCS.test(partial)) return '';
  return partial;
}

// ─── 危险序列参考正则（兼容旧静态检查 + 文档）──────────────────────────────────

const PATTERNS = {
  OSC_52_CLIPBOARD: /\x1b\]52;[pc0-7];[A-Za-z0-9+/=]*\x07/g,
  OSC_52_CLIPBOARD_ST: /\x1b\]52;[pc0-7];[A-Za-z0-9+/=]*\x1b\\/g,
  WINDOW_TITLE: /\x1b\][02];[^\x07\x1b]*(?:\x07|\x1b\\)/g,
  DECRQSS: /\x1bP\$q[^\x1b]*(?:\x1b\\)/g,
  DEVICE_ATTR: /\x1b\[>?c/g,
  CURSOR_POSITION: /\x1b\[\d+;\d+R/g,
  STATUS_REPORT: /\x1b\[5n/g,
  KEYBOARD_LAYOUT: /\x1b\[.*?u/g,
};

function isFinalByte(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x40 && c <= 0x7e;
}

// ─── 序列分类 ─────────────────────────────────────────────────────────────────

function classifyOSC(sequence) {
  // sequence: ESC ] <num>[;payload]<BEL|ST>
  let body = sequence.slice(2);
  if (body.endsWith(BEL)) body = body.slice(0, -1);
  else if (body.endsWith(ST)) body = body.slice(0, -2);
  const semi = body.indexOf(';');
  const numStr = semi === -1 ? body : body.slice(0, semi);
  // 数值解析（容忍前导零，如 \x1b]052），避免 "\x1b]0052" 绕过
  const num = parseInt(numStr, 10);
  if (Number.isNaN(num)) return { kind: 'pass', name: 'osc', strip: false };
  if (num === 52) return { kind: 'strip', name: 'osc52', strip: true };
  if (num === 0 || num === 2) return { kind: 'strip', name: 'title', strip: true };
  return { kind: 'pass', name: 'osc', strip: false };
}

function classifyDCS(sequence) {
  let payload = sequence.slice(2);
  if (payload.endsWith(ST)) payload = payload.slice(0, -2);
  if (payload.startsWith('$q')) return { kind: 'strip', name: 'decrqss', strip: true };
  return { kind: 'pass', name: 'dcs', strip: false };
}

function classifyCSI(sequence) {
  // sequence: ESC [ <params><intermediate><final>
  const inner = sequence.slice(2);
  const finalCh = inner[inner.length - 1];
  if (finalCh === 'c') {
    // DA / DA1 / DA2（含带参数形式，如 \x1b[>0c、\x1b[>1;2c、\x1b[=1c）——
    // 设备属性查询，终端一律回写应答
    return { kind: 'strip', name: 'device-answer', strip: true };
  }
  if (finalCh === 'n') {
    // DSR(5n) / CPR(6n / ?6n) —— 终端会回写应答
    const core = inner.slice(0, -1);
    if (core === '5' || core === '6' || core === '?6') {
      return { kind: 'strip', name: 'device-answer', strip: true };
    }
  }
  return { kind: 'pass', name: 'csi', strip: false };
}

// ─── 单序列解析 ────────────────────────────────────────────────────────────────

/**
 * 解析 buf[pos]（必为 ESC）处的一个控制序列。
 * 返回 { consumed, complete, sequence, strip, kind, name }
 *   complete=false 表示输入不完整（需跨 chunk 缓冲）。
 * 超长 / 嵌套超限时返回 complete=true 且 strip=true（整段剥离）。
 */
function parseOne(buf, pos) {
  const intro = buf[pos + 1];
  if (intro === undefined) {
    return { consumed: 0, complete: false };
  }
  if (intro === '[') return parseDelimited(buf, pos, 'csi');
  if (intro === ']') return parseDelimited(buf, pos, 'osc');
  if (intro === 'P') return parseDelimited(buf, pos, 'dcs');
  if (intro === '^' || intro === '_' || intro === 'X') return parseDelimited(buf, pos, 'string');
  if (intro === '\\') {
    const sequence = buf.slice(pos, pos + 2);
    return { consumed: 2, complete: true, sequence, strip: false, kind: 'pass', name: 'st' };
  }
  // 单字符转义（如 ESC 7/8/M/E/=/>/# 等）：视为 2 字符序列透传
  const seq2 = buf.slice(pos, pos + 2);
  return { consumed: seq2.length, complete: seq2.length === 2, sequence: seq2, strip: false, kind: 'pass', name: 'esc' };
}

/**
 * 从 start 向前找 type 的终止符（OSC: BEL/ST；DCS/string: ST；CSI: final byte）。
 * @returns 终止符后的下标；limit 内未找到则返回 limit（有界）。
 */
function findTerminatorEnd(buf, start, type, limit) {
  let i = start;
  const stop = Math.min(buf.length, limit);
  while (i < stop) {
    const ch = buf[i];
    if (type === 'osc' && ch === BEL) return i + 1;
    if (ch === ESC && buf[i + 1] === '\\') return i + 2;
    if (type === 'csi' && isFinalByte(ch)) return i + 1;
    i += 1;
  }
  return stop;
}

function parseDelimited(buf, pos, type) {
  const hardCap = pos + MAX_DROP_LIMIT;
  let i = pos + 2;
  let nested = 0;
  let seqLen = 2;
  let overrun = null; // 'overlong' | 'nested-overflow'：进入"整段剥离"模式
  while (i < buf.length) {
    const ch = buf[i];
    if (overrun === null) {
      if (type === 'csi') {
        if (isFinalByte(ch)) {
          const sequence = buf.slice(pos, i + 1);
          const cls = classifyCSI(sequence);
          return { consumed: sequence.length, complete: true, sequence, strip: cls.strip, kind: cls.kind, name: cls.name };
        }
      } else if (type === 'osc' && ch === BEL) {
        const sequence = buf.slice(pos, i + 1);
        const cls = classifyOSC(sequence);
        return { consumed: sequence.length, complete: true, sequence, strip: cls.strip, kind: cls.kind, name: cls.name };
      } else if (ch === ESC) {
        if (buf[i + 1] === '\\') {
          const sequence = buf.slice(pos, i + 2);
          let cls;
          if (type === 'osc') cls = classifyOSC(sequence);
          else if (type === 'dcs') cls = classifyDCS(sequence);
          else cls = { kind: 'pass', name: type, strip: false };
          return { consumed: sequence.length, complete: true, sequence, strip: cls.strip, kind: cls.kind, name: cls.name };
        }
        nested += 1;
      }
      if (nested > MAX_NESTED_ESCAPES) {
        overrun = 'nested-overflow';
      } else {
        seqLen += 1;
        if (seqLen > MAX_SEQUENCE_LENGTH) overrun = 'overlong';
      }
    }
    if (overrun !== null) {
      // 整段剥离到终止符（有界）：危险控制前缀 + 载荷 + 终止符一次性丢弃
      const end = findTerminatorEnd(buf, i, type, hardCap);
      return { consumed: end - pos, complete: true, strip: true, kind: 'strip', name: overrun, overBounded: true };
    }
    i += 1;
  }
  return { consumed: 0, complete: false };
}

// ─── VTFilter ─────────────────────────────────────────────────────────────────

class VTFilter {
  constructor(options = {}) {
    this.stripOSC52 = options.stripOSC52 !== false;
    this.stripWindowTitle = options.stripWindowTitle !== false;
    this.stripDECRQSS = options.stripDECRQSS !== false;
    this.stripDeviceAnswer = options.stripDeviceAnswer !== false;
    this.logFiltered = options.logFiltered !== false;
    this._pending = '';
    this._log = [];
    this._stats = {
      osc52Count: 0,
      windowTitleCount: 0,
      decrqssCount: 0,
      deviceAnswerCount: 0,
      otherStripCount: 0,
      overlongCount: 0,
      nestedCount: 0,
      boundedCount: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
      totalBytesFiltered: 0,
    };
  }

  /**
   * 过滤一段输出。
   * @param {string} data 原始输出（UTF-8 解码后的字符串）
   * @returns {string} 过滤后的安全输出
   */
  filter(data) {
    if (typeof data !== 'string' || data.length === 0) return '';
    this._stats.totalBytesIn += data.length;

    let buf = this._pending + data;
    this._pending = '';

    let out = '';
    let steps = 0;
    const started = Date.now();

    while (buf.length > 0) {
      steps++;
      if (steps > MAX_SCAN_STEPS || (Date.now() - started) > MAX_SCAN_MS) {
        this._record('bounded', 'scan-budget');
        this._pending += buf; // 追加（保持流顺序）
        break;
      }

      const escIdx = buf.indexOf(ESC);
      if (escIdx === -1) {
        out = this._appendText(out, buf);
        break;
      }
      if (escIdx > 0) {
        out = this._appendText(out, buf.slice(0, escIdx));
        buf = buf.slice(escIdx);
      }

      const parsed = parseOne(buf, 0);
      if (!parsed.complete) {
        this._pending += buf; // 追加（保持流顺序）
        break;
      }

      if (parsed.strip && this._shouldStrip(parsed.name)) {
        this._record('strip', parsed.name);
      } else {
        out = this._appendText(out, parsed.sequence);
      }
      buf = buf.slice(parsed.consumed);

      if (out.length >= MAX_OUTPUT_CHUNK) {
        this._record('bounded', 'output-cap');
        this._pending += buf; // 追加（保持流顺序）
        break;
      }
    }

    this._stats.totalBytesOut += out.length;
    this._stats.totalBytesFiltered = this._stats.totalBytesIn - this._stats.totalBytesOut;
    return out;
  }

  /**
   * 返回尚未判定的缓冲内容（会话结束时应调用以处理残留）。
   * 未终止的危险序列前缀（OSC 52 / 标题 OSC 0,2 / DECRQSS / DA-DSR-CPR）在
   * 会话结束时不再有机会被补全，直接剥离；其余惰性文本原样返回。
   */
  flush() {
    const pending = this._pending;
    this._pending = '';
    if (!pending) return '';
    return stripDangerousPartial(pending);
  }

  getStats() {
    return { ...this._stats };
  }

  getLog() {
    return this._log.slice();
  }

  reset() {
    this._pending = '';
    this._log = [];
    this._stats = {
      osc52Count: 0,
      windowTitleCount: 0,
      decrqssCount: 0,
      deviceAnswerCount: 0,
      otherStripCount: 0,
      overlongCount: 0,
      nestedCount: 0,
      boundedCount: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
      totalBytesFiltered: 0,
    };
  }

  _shouldStrip(name) {
    if (name === 'osc52') return this.stripOSC52;
    if (name === 'title') return this.stripWindowTitle;
    if (name === 'decrqss') return this.stripDECRQSS;
    if (name === 'device-answer') return this.stripDeviceAnswer;
    return true;
  }

  /**
   * 受 MAX_OUTPUT_CHUNK 约束地追加文本；超出部分回写 pending。
   * @returns {string} 追加后的输出
   */
  _appendText(out, text) {
    const room = MAX_OUTPUT_CHUNK - out.length;
    if (text.length <= room) return out + text;
    this._pending += text.slice(room); // 追加（保持流顺序）
    this._record('bounded', 'output-cap');
    return out + text.slice(0, room);
  }

  _record(kind, name) {
    this._log.push({ kind, name, at: Date.now() });
    if (this._log.length > MAX_LOG) this._log.shift();
    if (name === 'overlong') this._stats.overlongCount++;
    else if (name === 'nested-overflow') this._stats.nestedCount++;
    else if (name === 'scan-budget' || name === 'input-cap' || name === 'output-cap') this._stats.boundedCount++;
    else if (kind === 'strip') {
      if (name === 'osc52') this._stats.osc52Count++;
      else if (name === 'title') this._stats.windowTitleCount++;
      else if (name === 'decrqss') this._stats.decrqssCount++;
      else if (name === 'device-answer') this._stats.deviceAnswerCount++;
      else this._stats.otherStripCount++;
    }
  }
}

module.exports = { VTFilter, PATTERNS, MAX_SEQUENCE_LENGTH, MAX_NESTED_ESCAPES };
