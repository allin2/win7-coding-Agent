/**
 * @module trusted-shell-runner
 * @description A9 TrustedShellRunner 核心实现 (PRD §4 / ADR-0089 / D-019)
 *
 * 合同要点：
 * - PowerShell 5.1 使用 UTF-16LE Base64 `-EncodedCommand`；CMD 使用 `/d /s /c`
 *   + windowsVerbatimArguments 保证空格/中文 cwd 与退出码正确；
 * - stdout/stderr 按原始字节计数并写入有界原始日志，解码按 UTF-8 → CP936 探测；
 * - 取消/超时后检查 killProcessTree 的真实返回值，只有可证明清理成功才写
 *   processTreeReaped:true；否则标记 residueRisk 并停止后续自动执行；
 * - taskkill/PID kill 是尽力回收，不是隔离等价物（containment:'none'）；
 * - 可选接入 D-013 Job Object helper（helperTransport）：接入时命令在 Job Object
 *   内执行并以 helper 证明为清理依据；
 * - 后台进程启动失败绝不返回成功，状态不把“正在运行”写成 exited。
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { selectShell, ShellKind } from './shell-detection';
import { BackgroundProcessManager } from './background-process-manager';
import { killProcessTree } from './process-cleanup';
import { HelperTransport } from './native-transport';

export interface TrustedShellRequest {
  id?: string;
  command: string;
  cwd?: string;
  shellKind?: ShellKind;
  shellPath?: string;
  envOverlay?: Record<string, string>;
  /** 可选任务级 deadline；未设置时不施加固定硬超时（A9 对 C08 的局部取代）。 */
  timeoutMs?: number;
  /** 软时长提示阈值：超过后只提示不终止。 */
  softDurationMs?: number;
  maxOutputBytes?: number;
  maxOutputLines?: number;
  background?: boolean;
  signal?: AbortSignal;
}

export interface TrustedShellTermination {
  requested: boolean;
  processTreeReaped: boolean;
  /** none：直接子进程 + taskkill/PID kill 尽力回收，非隔离；job_object：经 D-013 helper。 */
  containment: 'none' | 'job_object';
  detail?: string;
}

export interface TrustedShellResult {
  schemaVersion: '2.0';
  status: 'exited' | 'timeout' | 'cancelled' | 'failed' | 'background_started';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  rawStdoutBytes: number;
  rawStderrBytes: number;
  truncated: boolean;
  durationMs: number;
  shell: { kind: ShellKind; path: string; version?: string; evidence: string; reason: string };
  /** stdout/stderr 的解码依据（字节流可能混合；预览截断不改变原始日志）。 */
  encoding: 'utf-8' | 'gbk' | 'utf-16le' | 'unknown';
  /** 有界原始日志路径；截断后仍可回看完整字节。 */
  logPaths?: { stdout: string; stderr: string };
  /** 软时长提示（不终止进程）。 */
  softDurationExceeded?: boolean;
  /** 无法证明进程树清理完成时为 true：调用方必须停止后续自动执行并提示残留。 */
  residueRisk?: boolean;
  backgroundHandle?: string;
  termination: TrustedShellTermination;
  error?: string;
}

export interface TrustedShellRunnerOptions {
  /** 提供 D-013 helper 传输时，Windows 上命令在 Job Object 内执行。 */
  helperTransport?: HelperTransport;
  /** 原始日志目录；默认 os.tmpdir()/win7-agent-shell-logs。 */
  logDir?: string;
  /** 单流原始日志字节上限。 */
  maxLogBytes?: number;
}

/** 单流原始日志默认上限（1 MiB）。 */
const DEFAULT_MAX_LOG_BYTES = 1024 * 1024;

export class TrustedShellRunner {
  private readonly backgroundManager = new BackgroundProcessManager();
  private readonly logDir: string;
  private readonly maxLogBytes: number;

  constructor(private readonly options: TrustedShellRunnerOptions = {}) {
    this.logDir = options.logDir ?? path.join(os.tmpdir(), 'win7-agent-shell-logs');
    this.maxLogBytes = options.maxLogBytes ?? DEFAULT_MAX_LOG_BYTES;
  }

  getBackgroundManager(): BackgroundProcessManager {
    return this.backgroundManager;
  }

  async execute(request: TrustedShellRequest): Promise<TrustedShellResult> {
    const startTime = Date.now();
    const requestId = request.id ?? `sh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const selection = selectShell({
      workspacePreferred: request.shellPath || request.shellKind,
    });
    const shellKind: ShellKind = request.shellKind ?? selection.kind;
    const shellExe = request.shellPath ?? selection.path;
    const shellMeta = {
      kind: shellKind,
      path: shellExe,
      version: selection.version,
      evidence: selection.evidence,
      reason: selection.reason,
    };
    const cwd = request.cwd || process.cwd();
    const maxOutputBytes = request.maxOutputBytes ?? 65_536;
    const maxOutputLines = request.maxOutputLines ?? 500;

    const { exe, args, verbatim } = buildTrustedShellInvocation(shellKind, shellExe, request.command);

    // 托管后台进程：启动失败绝不返回成功。
    if (request.background) {
      return this.startBackground(requestId, request, exe, args, cwd, shellMeta, startTime);
    }

    // D-013 helper 路径（Windows + 显式提供 helper 时）：Job Object 内执行。
    if (this.options.helperTransport && process.platform === 'win32') {
      return this.executeViaHelper(requestId, request, exe, args, cwd, shellMeta, startTime, maxOutputBytes, maxOutputLines);
    }

    return this.executeDirect(requestId, request, exe, args, verbatim, cwd, shellMeta, startTime, maxOutputBytes, maxOutputLines);
  }

  // -------------------------------------------------------------------------
  // 直接子进程路径
  // -------------------------------------------------------------------------
  private executeDirect(
    requestId: string,
    request: TrustedShellRequest,
    exe: string,
    args: string[],
    verbatim: boolean,
    cwd: string,
    shellMeta: TrustedShellResult['shell'],
    startTime: number,
    maxOutputBytes: number,
    maxOutputLines: number,
  ): Promise<TrustedShellResult> {
    return new Promise<TrustedShellResult>((resolve) => {
      let stdoutBuffers: Buffer[] = [];
      let stderrBuffers: Buffer[] = [];
      let totalStdoutBytes = 0;
      let totalStderrBytes = 0;
      let settled = false;
      let isCancelled = false;
      let isTimedOut = false;
      let softDurationExceeded = false;
      let killOutcome: { success: boolean; error?: string; method: string } | undefined;
      let terminationPromise: Promise<{ success: boolean; error?: string; method: string }> | undefined;
      let timeoutTimer: NodeJS.Timeout | undefined;
      let softTimer: NodeJS.Timeout | undefined;
      const logCapture = new BoundedLogCapture(this.logDir, requestId, this.maxLogBytes);

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(exe, args, {
          cwd,
          env: { ...process.env, ...(request.envOverlay || {}) },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          // POSIX 必须让 Shell 成为独立进程组组长，kill(-pid) 才能覆盖其后代。
          // Windows 继续由 taskkill /T 或 Job Object 负责进程树回收。
          detached: process.platform !== 'win32',
          ...(verbatim ? { windowsVerbatimArguments: true } : {}),
        });
      } catch (err: any) {
        resolve(this.failureResult(shellMeta, startTime, `Spawn error: ${err.message}`, 0, 0, logCapture));
        return;
      }

      const finalize = (code: number | null) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (softTimer) clearTimeout(softTimer);
        request.signal?.removeEventListener('abort', onAbort);

        const stdoutBuf = Buffer.concat(stdoutBuffers);
        const stderrBuf = Buffer.concat(stderrBuffers);
        logCapture.finish();

        const stdoutDecode = decodeShellBytes(stdoutBuf);
        const stderrDecode = decodeShellBytes(stderrBuf);
        const { text: stdoutText, truncated: stdoutTruncated } = truncateOutput(stdoutDecode.text, maxOutputBytes, maxOutputLines);
        const { text: stderrText, truncated: stderrTruncated } = truncateOutput(stderrDecode.text, maxOutputBytes, maxOutputLines);
        const truncated = stdoutTruncated || stderrTruncated || totalStdoutBytes > stdoutBuf.length || totalStderrBytes > stderrBuf.length;

        let status: TrustedShellResult['status'] = 'exited';
        if (isCancelled) status = 'cancelled';
        else if (isTimedOut) status = 'timeout';

        // processTreeReaped 只有在可证明清理成功时才为 true。
        const terminationRequested = isCancelled || isTimedOut;
        let processTreeReaped = true;
        let residueRisk = false;
        let terminationDetail: string | undefined;
        if (terminationRequested) {
          if (killOutcome?.success) {
            processTreeReaped = true;
            terminationDetail = `cleanup verified via ${killOutcome.method}; PID tree termination confirmed`;
          } else {
            processTreeReaped = false;
            residueRisk = true;
            terminationDetail = `cleanup NOT confirmed: ${killOutcome?.error ?? 'kill result unknown'}. Possible orphaned child processes; manual residue check required.`;
          }
        }
        if (code !== 0 && code !== null && !terminationRequested && status === 'exited' && killOutcome && !killOutcome.success) {
          // 非请求终止但 kill 有异常结果时也如实携带。
          terminationDetail = killOutcome.error;
        }

        resolve({
          schemaVersion: '2.0',
          status,
          exitCode: code,
          stdout: stdoutText,
          stderr: stderrText,
          rawStdoutBytes: totalStdoutBytes,
          rawStderrBytes: totalStderrBytes,
          truncated,
          durationMs: Date.now() - startTime,
          shell: shellMeta,
          encoding: stdoutDecode.encoding,
          logPaths: logCapture.paths,
          ...(softDurationExceeded ? { softDurationExceeded: true } : {}),
          ...(residueRisk ? { residueRisk: true } : {}),
          termination: {
            requested: terminationRequested,
            processTreeReaped,
            containment: 'none',
            detail: [terminationDetail, 'direct child + taskkill/PID-tree best-effort recovery; NOT a sandbox-equivalent boundary']
              .filter(Boolean)
              .join(' | '),
          },
        });
      };

      const onAbort = async () => {
        if (settled || isCancelled || isTimedOut) return;
        isCancelled = true;
        terminationPromise = child.pid
          ? killProcessTree(child.pid)
          : Promise.resolve({ success: true, method: 'already_gone', error: undefined });
        killOutcome = await terminationPromise;
      };

      const onTimeout = async () => {
        if (settled || isTimedOut || isCancelled) return;
        isTimedOut = true;
        terminationPromise = child.pid
          ? killProcessTree(child.pid)
          : Promise.resolve({ success: true, method: 'already_gone' });
        killOutcome = await terminationPromise;
      };

      if (request.signal) {
        if (request.signal.aborted) {
          void onAbort();
        } else {
          request.signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      // timeoutMs 是可选任务级 deadline；未设置时没有固定硬超时。
      if (request.timeoutMs && request.timeoutMs > 0) {
        timeoutTimer = setTimeout(() => void onTimeout(), request.timeoutMs);
      }

      // 软时长提示：只记录，不终止。
      if (request.softDurationMs && request.softDurationMs > 0) {
        softTimer = setTimeout(() => {
          softDurationExceeded = true;
        }, request.softDurationMs);
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        totalStdoutBytes += chunk.length;
        logCapture.appendStdout(chunk);
        if (totalStdoutBytes <= maxOutputBytes * 4) {
          stdoutBuffers.push(chunk);
        }
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        totalStderrBytes += chunk.length;
        logCapture.appendStderr(chunk);
        if (totalStderrBytes <= maxOutputBytes * 4) {
          stderrBuffers.push(chunk);
        }
      });

      child.on('error', (err) => {
        if (settled) return;
        isCancelled = request.signal?.aborted ?? false;
        resolve(this.failureResult(shellMeta, startTime, err.message, totalStdoutBytes, totalStderrBytes, logCapture, isCancelled));
        settled = true;
        request.signal?.removeEventListener('abort', onAbort);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (softTimer) clearTimeout(softTimer);
      });

      child.on('close', (code) => {
        // close 可能早于异步 liveness 验证完成；先等 killOutcome，避免把已经
        // 证明回收的取消误报为 residueRisk/failed。
        if (terminationPromise) void terminationPromise.then(() => finalize(code));
        else finalize(code);
      });
    });
  }

  // -------------------------------------------------------------------------
  // D-013 helper（Job Object）路径
  // -------------------------------------------------------------------------
  private async executeViaHelper(
    requestId: string,
    request: TrustedShellRequest,
    exe: string,
    args: string[],
    cwd: string,
    shellMeta: TrustedShellResult['shell'],
    startTime: number,
    maxOutputBytes: number,
    maxOutputLines: number,
  ): Promise<TrustedShellResult> {
    const helperRequest = {
      schema_version: 1 as const,
      requestId,
      executable: exe,
      argv: args,
      workingDirectory: cwd,
      timeoutMs: request.timeoutMs && request.timeoutMs > 0 ? request.timeoutMs : 60 * 60 * 1000,
      idleTimeoutMs: 0,
      maxOutputSize: Math.max(maxOutputBytes, 1024),
      allowNetwork: false as const,
      allowedDirectories: [],
      protectedDirectories: [],
    };
    const transport = await this.options.helperTransport!.invoke(helperRequest, request.signal);
    if (transport.kind !== 'response' || transport.response.type === 'error') {
      const detail = transport.kind !== 'response'
        ? transport.detail
        : transport.response.type === 'error'
          ? transport.response.message
          : 'unexpected helper response';
      const cleanupConfirmed = transport.kind !== 'response' && transport.cleanupConfirmed;
      return {
        ...mapHelperFailure(detail, transport.kind, cleanupConfirmed),
        durationMs: Date.now() - startTime,
        shell: shellMeta,
      };
    }
    const response = transport.response;
    const stdoutBuf = Buffer.from(response.stdoutBase64, 'base64');
    const stderrBuf = Buffer.from(response.stderrBase64, 'base64');
    const stdoutDecode = decodeShellBytes(stdoutBuf);
    const stderrDecode = decodeShellBytes(stderrBuf);
    const { text: stdoutText, truncated: outTruncated } = truncateOutput(stdoutDecode.text, maxOutputBytes, maxOutputLines);
    const { text: stderrText, truncated: errTruncated } = truncateOutput(stderrDecode.text, maxOutputBytes, maxOutputLines);
    const containmentOk = response.containmentVerified && response.inputDetached;
    const status: TrustedShellResult['status'] = response.canceled
      ? 'cancelled'
      : response.timedOut || response.idleTimedOut
        ? 'timeout'
        : 'exited';
    return {
      schemaVersion: '2.0',
      status: containmentOk ? status : 'failed',
      exitCode: containmentOk ? response.exitCode : null,
      stdout: stdoutText,
      stderr: stderrText,
      rawStdoutBytes: response.stdoutSize,
      rawStderrBytes: response.stderrSize,
      truncated: response.outputTruncated || outTruncated || errTruncated,
      durationMs: response.executionTimeMs,
      shell: shellMeta,
      encoding: stdoutDecode.encoding,
      ...(containmentOk ? {} : { residueRisk: true }),
      termination: {
        requested: response.timedOut || response.canceled || !containmentOk,
        processTreeReaped: containmentOk,
        containment: 'job_object',
        detail: `helper job object: hostJobDetected=${response.hostJob.detected}, childJobAssignmentVerified=${response.hostJob.childJobAssignmentVerified}`,
      },
    };
  }

  // -------------------------------------------------------------------------
  // 后台进程路径
  // -------------------------------------------------------------------------
  private async startBackground(
    requestId: string,
    request: TrustedShellRequest,
    exe: string,
    args: string[],
    cwd: string,
    shellMeta: TrustedShellResult['shell'],
    startTime: number,
  ): Promise<TrustedShellResult> {
    try {
      const handle = await this.backgroundManager.start(requestId, request.command, exe, args, cwd, request.envOverlay);
      if (handle.status === 'failed' || handle.pid === undefined) {
        return {
          schemaVersion: '2.0',
          status: 'failed',
          exitCode: null,
          stdout: '',
          stderr: handle.logs.stderr.join('') || 'Background process failed to start (no PID assigned).',
          rawStdoutBytes: 0,
          rawStderrBytes: 0,
          truncated: false,
          durationMs: Date.now() - startTime,
          shell: shellMeta,
          encoding: 'utf-8',
          termination: { requested: false, processTreeReaped: true, containment: 'none', detail: 'start failure; nothing left running from this request' },
          error: 'background start failed',
        };
      }
      return {
        schemaVersion: '2.0',
        status: 'background_started',
        exitCode: null,
        stdout: `[Background process started; handle=${handle.handleId} PID=${handle.pid}; poll via background manager]`,
        stderr: '',
        rawStdoutBytes: 0,
        rawStderrBytes: 0,
        truncated: false,
        durationMs: Date.now() - startTime,
        shell: shellMeta,
        encoding: 'utf-8',
        backgroundHandle: handle.handleId,
        termination: { requested: false, processTreeReaped: false, containment: 'none', detail: 'background process intentionally left running; stop via handle' },
      };
    } catch (err: any) {
      return {
        schemaVersion: '2.0',
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: String(err?.message || err),
        rawStdoutBytes: 0,
        rawStderrBytes: 0,
        truncated: false,
        durationMs: Date.now() - startTime,
        shell: shellMeta,
        encoding: 'utf-8',
        termination: { requested: false, processTreeReaped: true, containment: 'none', detail: 'start rejected before spawn; nothing left running' },
        error: String(err?.message || err),
      };
    }
  }

  private failureResult(
    shellMeta: TrustedShellResult['shell'],
    startTime: number,
    message: string,
    rawStdoutBytes: number,
    rawStderrBytes: number,
    logCapture: BoundedLogCapture,
    cancelled = false,
  ): TrustedShellResult {
    logCapture.finish();
    return {
      schemaVersion: '2.0',
      status: 'failed',
      exitCode: null,
      stdout: '',
      stderr: message,
      rawStdoutBytes,
      rawStderrBytes,
      truncated: false,
      durationMs: Date.now() - startTime,
      shell: shellMeta,
      encoding: 'utf-8',
      logPaths: logCapture.paths,
      termination: {
        requested: cancelled,
        processTreeReaped: true,
        containment: 'none',
        detail: 'spawn failed before process creation; no residue from this request',
      },
      error: message,
    };
  }
}

/**
 * 构造 Shell 调用。PowerShell 使用 UTF-16LE Base64 EncodedCommand 并归一化
 * $LASTEXITCODE；CMD 使用 /d /s /c（调用方需 windowsVerbatimArguments）。
 * 导出供合同测试验证调用结构，不承载执行逻辑。
 */
export function buildTrustedShellInvocation(
  shellKind: ShellKind,
  shellExe: string,
  command: string,
): { exe: string; args: string[]; verbatim: boolean } {
  if (shellKind === 'powershell') {
    const wrappedScript = [
      '$ProgressPreference=\'SilentlyContinue\';',
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
      command,
      'if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }',
    ].join(' ');
    const encodedCommand = Buffer.from(wrappedScript, 'utf16le').toString('base64');
    return {
      exe: shellExe,
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
      verbatim: false,
    };
  }

  if (shellKind === 'cmd') {
    // cmd.exe 必须以原始命令行传递，避免 Node 的默认引号规则破坏 /s /c 语义。
    return { exe: shellExe, args: ['/d', '/s', '/c', command], verbatim: true };
  }

  // POSIX sh / bash：仅开发机替代，不是 Win7 证据。
  return { exe: shellExe, args: ['-c', command], verbatim: false };
}

/**
 * D-013 helper 传输失败 → TrustedShellResult 的纯映射：清理未确认时必须
 * 标记 residueRisk 且 processTreeReaped=false。
 */
export function mapHelperFailure(
  detail: string,
  kind: string,
  cleanupConfirmed: boolean,
): Omit<TrustedShellResult, 'durationMs' | 'shell'> {
  return {
    schemaVersion: '2.0',
    status: 'failed',
    exitCode: null,
    stdout: '',
    stderr: detail,
    rawStdoutBytes: 0,
    rawStderrBytes: 0,
    truncated: false,
    ...(cleanupConfirmed ? {} : { residueRisk: true }),
    encoding: 'utf-8',
    termination: {
      requested: kind === 'cancelled',
      processTreeReaped: cleanupConfirmed,
      containment: 'job_object',
      detail: `helper transport failure (${kind}): ${detail}`,
    },
    error: detail,
  };
}

// -----------------------------------------------------------------------------
// 输出解码、截断与有界原始日志
// -----------------------------------------------------------------------------

/**
 * Shell 输出字节解码：先严格 UTF-8，失败则尝试 CP936/GBK；都无法确定时使用
 * replacement 保守解码并标记 unknown。字节计数始终以原始流为准。
 */
export function decodeShellBytes(buffer: Buffer): { text: string; encoding: 'utf-8' | 'gbk' | 'utf-16le' | 'unknown' } {
  if (buffer.length === 0) return { text: '', encoding: 'utf-8' };
  // BOM 快路径。
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buffer.subarray(2)), encoding: 'utf-16le' };
  }
  try {
    const strict = new TextDecoder('utf-8', { fatal: true });
    return { text: strict.decode(buffer), encoding: 'utf-8' };
  } catch (_utf8Invalid) {
    // fall through to GBK
  }
  try {
    const gbk = new TextDecoder('gbk', { fatal: true });
    return { text: gbk.decode(buffer), encoding: 'gbk' };
  } catch (_gbkInvalid) {
    return { text: new TextDecoder('utf-8').decode(buffer), encoding: 'unknown' };
  }
}

function truncateOutput(content: string, maxBytes: number, maxLines: number): { text: string; truncated: boolean } {
  const lines = content.split(/\r?\n/);
  let truncated = false;
  let resultLines = lines;

  if (resultLines.length > maxLines) {
    resultLines = resultLines.slice(0, maxLines);
    truncated = true;
  }

  let text = resultLines.join('\n');
  const textBuffer = Buffer.from(text, 'utf8');
  if (textBuffer.length > maxBytes) {
    text = textBuffer.slice(0, maxBytes).toString('utf8');
    truncated = true;
  }

  if (truncated) {
    text += `\n[Output truncated: capped at ${maxLines} lines / ${maxBytes} bytes; raw bytes preserved in the log files]`;
  }

  return { text, truncated };
}

/** 有界原始日志：按字节上限落盘 stdout/stderr，截断记录在文件尾。 */
class BoundedLogCapture {
  private stdoutFd: number | undefined;
  private stderrFd: number | undefined;
  private stdoutWritten = 0;
  private stderrWritten = 0;
  private stdoutTruncated = false;
  private stderrTruncated = false;
  readonly paths: { stdout: string; stderr: string };

  constructor(logDir: string, requestId: string, private readonly maxBytes: number) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (_err) {
      // 日志目录创建失败时保持无日志路径；不吞掉主执行结果。
    }
    this.paths = {
      stdout: path.join(logDir, `${requestId}.stdout.log`),
      stderr: path.join(logDir, `${requestId}.stderr.log`),
    };
  }

  appendStdout(chunk: Buffer): void {
    this.append('stdout', chunk);
  }

  appendStderr(chunk: Buffer): void {
    this.append('stderr', chunk);
  }

  private append(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    try {
      if (stream === 'stdout') {
        if (this.stdoutFd === undefined) this.stdoutFd = fs.openSync(this.paths.stdout, 'a');
        this.writeBounded(this.stdoutFd, chunk, 'stdout');
      } else {
        if (this.stderrFd === undefined) this.stderrFd = fs.openSync(this.paths.stderr, 'a');
        this.writeBounded(this.stderrFd, chunk, 'stderr');
      }
    } catch (_err) {
      // 日志写失败不能影响命令执行；调用方仍拿到字节计数与截断事实。
    }
  }

  private writeBounded(fd: number, chunk: Buffer, stream: 'stdout' | 'stderr'): void {
    const written = stream === 'stdout' ? this.stdoutWritten : this.stderrWritten;
    if (written >= this.maxBytes) {
      if (stream === 'stdout') this.stdoutTruncated = true;
      else this.stderrTruncated = true;
      return;
    }
    const slice = written + chunk.length > this.maxBytes ? chunk.subarray(0, this.maxBytes - written) : chunk;
    fs.writeSync(fd, slice);
    if (stream === 'stdout') {
      this.stdoutWritten += slice.length;
      if (written + chunk.length > this.maxBytes) this.stdoutTruncated = true;
    } else {
      this.stderrWritten += slice.length;
      if (written + chunk.length > this.maxBytes) this.stderrTruncated = true;
    }
  }

  finish(): void {
    for (const [fd, stream] of [[this.stdoutFd, 'stdout'], [this.stderrFd, 'stderr']] as Array<[number | undefined, 'stdout' | 'stderr']>) {
      if (fd === undefined) continue;
      const truncated = stream === 'stdout' ? this.stdoutTruncated : this.stderrTruncated;
      if (truncated) {
        try {
          fs.writeSync(fd, `\n[raw log truncated at ${this.maxBytes} bytes]`);
        } catch (_err) { /* best effort */ }
      }
      try {
        fs.closeSync(fd);
      } catch (_err) { /* best effort */ }
    }
    this.stdoutFd = undefined;
    this.stderrFd = undefined;
  }
}
