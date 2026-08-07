/**
 * A5 - 终端宿主进程（Electron utilityProcess / 普通 node 双通道）
 *
 * 进程级通道隔离（C19 / N01）：
 *   - `user-input` 消息是**唯一**会调用 session.sendUserInput()（最终写 pty stdin）的入口；
 *   - `model-event` 消息只进入 session.handleModelEvent()，该处理器结构性没有 pty 写能力；
 *     任何形如"向 stdin 写入"的模型消息都以 security:blocked（NO_STDIN_CHANNEL）被拒绝。
 *
 * 传输：
 *   - Electron utilityProcess：process.parentPort（Win7 模式，由 a5-electron-main.js fork）
 *   - 普通 node：stdio 行分隔 JSON（开发机模式，设置 A5_PTY_MODULE=mock 使用 mock pty）
 *
 * Win7-Validation: NOT_PERFORMED
 */

'use strict';

const path = require('path');
const { TerminalSession, INPUT_MODE } = require(path.join(__dirname, '..', '..', 'winpty', 'terminal_session'));

function makeTransport() {
  if (process.parentPort && typeof process.parentPort.postMessage === 'function') {
    return {
      onMessage(callback) {
        process.parentPort.on('message', (event) => callback(event.data));
      },
      post(message) {
        process.parentPort.postMessage(message);
      },
    };
  }
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const listeners = [];
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (_) {
      return;
    }
    listeners.forEach((callback) => callback(message));
  });
  return {
    onMessage(callback) { listeners.push(callback); },
    post(message) { process.stdout.write(`${JSON.stringify(message)}\n`); },
  };
}

function resolvePtyModule() {
  if (process.env.A5_PTY_MODULE === 'mock') {
    return require(path.join(__dirname, 'a5-mock-pty')).MockPtyModule;
  }
  return undefined; // 真实模式：WinptyHost 惰性 require('node-pty')
}

const transport = makeTransport();
let session = null;

function wireSession(s) {
  session = s;
  s.on('started', (e) => transport.post({ type: 'session:started', sessionId: e.sessionId, pid: e.pid }));
  s.on('output', (e) => transport.post({ type: 'output', sessionId: e.sessionId, data: e.data }));
  s.on('filtered', (e) => transport.post({
    type: 'filtered',
    sessionId: e.sessionId,
    stats: e.stats,
    rawLength: e.rawLength,
    safeLength: e.safeLength,
  }));
  s.on('security:blocked', (e) => transport.post({
    type: 'security:blocked',
    sessionId: e.sessionId,
    reason: e.reason,
    attempted: e.attempted,
  }));
  s.on('model:event', (e) => transport.post({ type: 'model:event', sessionId: e.sessionId, event: e.event }));
  s.on('exit', (e) => transport.post({ type: 'session:exit', sessionId: e.sessionId, code: e.code, signal: e.signal }));
  s.on('stopped', (e) => transport.post({ type: 'session:stopped', sessionId: e.sessionId }));
  s.on('error', (e) => transport.post({ type: 'session:error', sessionId: e.sessionId, error: String(e.error && e.error.message || e.error) }));
}

function handleStart(msg) {
  if (session) {
    transport.post({ type: 'host:error', message: 'a session is already active' });
    return;
  }
  const cfg = (msg && msg.session) || {};
  const s = new TerminalSession({
    shell: cfg.shell,
    args: cfg.args,
    cwd: cfg.cwd,
    cols: cfg.cols,
    rows: cfg.rows,
    env: cfg.env,
    inputMode: INPUT_MODE.USER_ONLY,
    ptyModule: resolvePtyModule(),
  });
  wireSession(s);
  s.start().catch((error) => {
    transport.post({ type: 'session:error', message: String(error && error.message || error) });
  });
}

function handleStop() {
  if (!session) {
    transport.post({ type: 'host:error', message: 'no active session' });
    return;
  }
  session.stop().catch(() => {});
}

transport.onMessage((msg) => {
  if (!msg || typeof msg.type !== 'string') return;
  try {
    switch (msg.type) {
      case 'session:start':
        // 启动会话需受信来源（system/user），避免任意消息拉起任意 shell
        if (msg.source !== 'system' && msg.source !== 'user') {
          transport.post({ type: 'security:blocked', reason: 'UNTRUSTED_ORIGIN', attempted: msg.type });
          break;
        }
        handleStart(msg);
        break;
      case 'user-input':
        // 用户通道：唯一写 pty stdin 的入口；来源必须是 user，否则结构性拒绝
        if (msg.source !== 'user') {
          transport.post({
            type: 'security:blocked',
            sessionId: session ? session.sessionId : null,
            reason: 'NO_STDIN_CHANNEL',
            attempted: `user-input:source=${String(msg.source)}`,
          });
          break;
        }
        if (session) session.sendUserInput(msg.data);
        else transport.post({ type: 'host:error', message: 'no active session for user-input' });
        break;
      case 'session:resize':
        if (session && Number.isFinite(msg.cols) && Number.isFinite(msg.rows)) {
          session.resize(msg.cols, msg.rows);
        }
        break;
      case 'session:stop':
        handleStop();
        break;
      case 'model-event':
        // 模型通道：结构性无 stdin 写能力（见 TerminalSession.handleModelEvent）
        if (session) session.handleModelEvent(msg);
        break;
      case 'introspect':
        // 开发机 mock 模式下上报 pty 写入计数等；真实 node-pty 无 recordedWrites，上报可用字段
        if (session && session._host && session._host._pty) {
          const pty = session._host._pty;
          transport.post({
            type: 'introspect',
            sessionId: session.sessionId,
            ptyWrites: Array.isArray(pty.recordedWrites) ? pty.recordedWrites.slice() : undefined,
            ptyWriteCount: Array.isArray(pty.recordedWrites) ? pty.recordedWrites.length : null,
            resizeLog: Array.isArray(pty.resizeLog) ? pty.resizeLog.slice() : undefined,
            killed: typeof pty.killed === 'boolean' ? pty.killed : null,
            pid: session.pid,
          });
        } else {
          transport.post({ type: 'introspect', sessionId: session ? session.sessionId : null, ptyWriteCount: null });
        }
        break;
      case 'shutdown':
        process.exit(0);
        break;
      default:
        transport.post({ type: 'host:unknown', rejected: msg.type });
    }
  } catch (error) {
    // 任何分发异常都不让宿主崩溃（含会话关闭后的 sendUserInput 抛错）
    transport.post({ type: 'host:error', message: String(error && error.message || error) });
  }
});

transport.post({ type: 'host:ready', pid: process.pid, mode: process.env.A5_PTY_MODULE === 'mock' ? 'mock' : 'real' });
