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
import { BackgroundProcessHandle, BackgroundProcessManager } from './background-process-manager';
import { killProcessTree } from './process-cleanup';
import { HelperTransport } from './native-transport';
import { createTrustedShellEnvironment, validateTrustedShellEnvironmentOverlay } from './trusted-shell-environment';
import {
  decodeNativeHelperBase64,
  hasCompleteHelperCleanupProof,
  NativeHelperRequestV2,
} from './native-protocol';

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
  /** Ready/start failures expose conservative process facts; unknown is never treated as not-spawned. */
  spawnFacts?: {
    helperSpawned: boolean;
    backgroundProcess: 'spawned' | 'not_spawned' | 'unknown';
    cleanupConfirmed: boolean;
    cleanupRequired: boolean;
  };
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
  /** 仅供确定性合同测试覆盖；生产始终使用 process.platform。 */
  platform?: NodeJS.Platform;
  /** 产品注入的仅内存脱敏器；执行参数仍保留原值，输出/日志投影先脱敏。 */
  redactText?: (text: string) => string;
  /** 当前进程见过的秘密值；用于跨 chunk 的原始字节日志脱敏。 */
  getSensitiveValues?: () => readonly string[];
  /** Product persistence hook for asynchronous background terminal states. */
  onBackgroundStateChange?: (handle: BackgroundProcessHandle) => void;
  /** 测试可注入；生产绑定 canonical path + 当前文件 SHA-256。 */
  resolveShellIdentity?: (shellPath: string) => ShellFileIdentity;
  /** 用户选择时持久化的不可变 Shell 文件绑定；执行时必须与当前文件完全一致。 */
  getConfiguredShellIdentity?: (shellPath: string) => ShellFileIdentity | undefined;
}

/** 单流原始日志默认上限（1 MiB）。 */
const DEFAULT_MAX_LOG_BYTES = 1024 * 1024;

export interface ShellFileIdentity {
  canonicalPath: string;
  sha256: string;
  fileId: string;
  version?: string;
}

export class TrustedShellRunner {
  private readonly backgroundManager: BackgroundProcessManager;
  private readonly logDir: string;
  private readonly maxLogBytes: number;
  private readonly platform: NodeJS.Platform;

  constructor(private readonly options: TrustedShellRunnerOptions = {}) {
    this.logDir = options.logDir ?? path.join(os.tmpdir(), 'win7-agent-shell-logs');
    this.maxLogBytes = options.maxLogBytes ?? DEFAULT_MAX_LOG_BYTES;
    this.platform = options.platform ?? process.platform;
    this.backgroundManager = new BackgroundProcessManager(
      options.helperTransport && this.platform === 'win32' ? options.helperTransport : undefined,
      (text) => this.redact(text),
      () => this.options.getSensitiveValues?.() ?? [],
      (handle) => this.options.onBackgroundStateChange?.(handle),
    );
  }

  private redact(text: string): string {
    return this.options.redactText ? this.options.redactText(text) : text;
  }

  private resolveAndValidateShellIdentity(exe: string, explicit: boolean, shellMeta: TrustedShellResult['shell']): ShellFileIdentity {
    const identity = this.options.resolveShellIdentity
      ? this.options.resolveShellIdentity(exe)
      : resolveShellFileIdentity(exe);
    if (explicit) {
      const configured = this.options.getConfiguredShellIdentity?.(identity.canonicalPath);
      if (!configured || !sameShellFileIdentity(configured, identity)) {
        throw new Error('A9_SHELL_IDENTITY_CHANGED: configured Shell file changed; user must select it again');
      }
    }
    shellMeta.path = identity.canonicalPath;
    shellMeta.version = identity.version ?? 'unknown';
    shellMeta.evidence = 'verified_file_identity';
    if (explicit) shellMeta.reason = 'workspace explicit Shell selection; persisted file identity verified';
    return identity;
  }

  private createV2HelperRequest(
    requestId: string,
    request: TrustedShellRequest,
    exe: string,
    args: string[],
    cwd: string,
    shellMeta: TrustedShellResult['shell'],
    maxOutputBytes: number,
    managed: boolean,
  ): NativeHelperRequestV2 {
    if (shellMeta.kind === 'sh') {
      throw new Error('D-013 v25 requires cmd, Windows PowerShell, or an explicitly configured bash host');
    }
    const envOverlay = validateTrustedShellEnvironmentOverlay(request.envOverlay ?? {}, this.options.getSensitiveValues?.());
    const identity = this.resolveAndValidateShellIdentity(exe, Boolean(request.shellPath), shellMeta);
    const deadline = request.timeoutMs !== undefined && request.timeoutMs > 0
      ? { deadlineMode: 'fixed' as const, timeoutMs: request.timeoutMs }
      : { deadlineMode: 'none' as const };
    return {
      schemaVersion: 2,
      requestId,
      profileId: 'a9-trusted-shell-current-user-v1',
      executable: identity.canonicalPath,
      argv: args,
      shellKind: shellMeta.kind,
      shellPath: identity.canonicalPath,
      // shellVersion is evidence, not a user label. Always derive it from the
      // same measured file identity that supplies shellIdentity.
      shellVersion: identity.version ?? 'unknown',
      shellIdentity: identity.sha256.toLowerCase(),
      shellSource: request.shellPath ? 'workspace_explicit' : 'automatic',
      command: request.command,
      cwd,
      envOverlay,
      maxStdoutBytes: Math.max(maxOutputBytes, 1024),
      maxStderrBytes: Math.max(maxOutputBytes, 1024),
      managed,
      ...deadline,
    };
  }

  getBackgroundManager(): BackgroundProcessManager {
    return this.backgroundManager;
  }

  async execute(request: TrustedShellRequest): Promise<TrustedShellResult> {
    const startTime = Date.now();
    const requestId = request.id ?? `sh-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    let validatedRequest: TrustedShellRequest;
    try {
      validatedRequest = {
        ...request,
        envOverlay: validateTrustedShellEnvironmentOverlay(request.envOverlay ?? {}, this.options.getSensitiveValues?.()),
      };
    } catch (error) {
      const unavailableShell = {
        kind: request.shellKind ?? 'cmd' as ShellKind,
        path: request.shellPath ?? '',
        evidence: 'environment_rejected',
        reason: 'environment overlay rejected before shell selection',
      };
      return {
        ...mapHelperFailure(String(error), 'protocol_error', true),
        durationMs: Date.now() - startTime,
        shell: unavailableShell,
      };
    }

    const selection = selectShell({
      workspacePreferred: validatedRequest.shellPath || validatedRequest.shellKind,
      sensitiveValues: this.options.getSensitiveValues?.(),
    });
    if (!validatedRequest.shellPath && !selection.available) {
      const unavailableShell = {
        kind: selection.kind,
        path: selection.path,
        evidence: selection.evidence,
        reason: selection.reason,
      };
      return {
        ...mapHelperFailure('A9_SHELL_UNAVAILABLE: no canonical system PowerShell or CMD passed probing', 'capability_unavailable', true),
        durationMs: Date.now() - startTime,
        shell: unavailableShell,
      };
    }
    const shellKind: ShellKind = validatedRequest.shellKind ?? selection.kind;
    const shellExe = validatedRequest.shellPath ?? selection.path;
    const shellMeta = {
      kind: shellKind,
      path: shellExe,
      version: validatedRequest.shellPath ? undefined : selection.version,
      evidence: validatedRequest.shellPath ? 'explicit_identity_pending' : selection.evidence,
      reason: validatedRequest.shellPath ? 'workspace explicit Shell selection; identity not yet verified' : selection.reason,
    };
    const cwd = validatedRequest.cwd || process.cwd();
    const maxOutputBytes = validatedRequest.maxOutputBytes ?? 65_536;
    const maxOutputLines = validatedRequest.maxOutputLines ?? 500;

    const { exe, args, verbatim } = buildTrustedShellInvocation(shellKind, shellExe, validatedRequest.command);
    if (validatedRequest.shellPath) {
      try {
        // Enforce the persisted selection binding even on development/direct
        // paths. The Windows helper repeats the digest check while holding a
        // no-write/no-delete-sharing handle through CreateProcessW.
        this.resolveAndValidateShellIdentity(exe, true, shellMeta);
      } catch (error) {
        return {
          ...mapHelperFailure(String(error), 'protocol_error', true),
          durationMs: Date.now() - startTime,
          shell: shellMeta,
        };
      }
    }

    // 托管后台进程：启动失败绝不返回成功。
    if (validatedRequest.background) {
      return this.startBackground(requestId, validatedRequest, exe, args, cwd, shellMeta, startTime, maxOutputBytes);
    }

    // D-013 helper 路径（Windows + 显式提供 helper 时）：Job Object 内执行。
    if (this.options.helperTransport && this.platform === 'win32') {
      return this.executeViaHelper(requestId, validatedRequest, exe, args, cwd, shellMeta, startTime, maxOutputBytes, maxOutputLines);
    }

    return this.executeDirect(requestId, validatedRequest, exe, args, verbatim, cwd, shellMeta, startTime, maxOutputBytes, maxOutputLines);
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
      const logCapture = new BoundedLogCapture(this.logDir, requestId, this.maxLogBytes, this.options.getSensitiveValues);

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(exe, args, {
          cwd,
          env: createTrustedShellEnvironment(process.env, request.envOverlay ?? {}, this.options.getSensitiveValues?.()),
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
        const { text: stdoutText, truncated: stdoutTruncated } = truncateOutput(this.redact(stdoutDecode.text), maxOutputBytes, maxOutputLines);
        const { text: stderrText, truncated: stderrTruncated } = truncateOutput(this.redact(stderrDecode.text), maxOutputBytes, maxOutputLines);
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
    let helperRequest: NativeHelperRequestV2;
    try {
      helperRequest = this.createV2HelperRequest(
        requestId, request, exe, args, cwd, shellMeta, maxOutputBytes, false,
      );
    } catch (error) {
      return {
        ...mapHelperFailure(String(error), 'protocol_error', true),
        durationMs: Date.now() - startTime,
        shell: shellMeta,
      };
    }
    const transport = await this.options.helperTransport!.invoke(helperRequest, request.signal,
      createTrustedShellEnvironment(process.env, {}, this.options.getSensitiveValues?.()));
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
    if (!('schemaVersion' in response) || response.schemaVersion !== 2) {
      return {
        ...mapHelperFailure('TrustedShell received a non-v2 helper result', 'protocol_error', false),
        durationMs: Date.now() - startTime,
        shell: shellMeta,
      };
    }
    let stdoutBuf: Buffer;
    let stderrBuf: Buffer;
    try {
      stdoutBuf = decodeNativeHelperBase64(response.stdoutBase64, response.stdoutSize, 'stdoutBase64');
      stderrBuf = decodeNativeHelperBase64(response.stderrBase64, response.stderrSize, 'stderrBase64');
    } catch (error) {
      return {
        ...mapHelperFailure(String(error), 'protocol_error', false),
        durationMs: Date.now() - startTime,
        shell: shellMeta,
      };
    }
    const stdoutDecode = decodeShellBytes(stdoutBuf);
    const stderrDecode = decodeShellBytes(stderrBuf);
    const { text: stdoutText, truncated: outTruncated } = truncateOutput(this.redact(stdoutDecode.text), maxOutputBytes, maxOutputLines);
    const { text: stderrText, truncated: errTruncated } = truncateOutput(this.redact(stderrDecode.text), maxOutputBytes, maxOutputLines);
    const containmentOk = hasCompleteHelperCleanupProof(response);
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
    maxOutputBytes: number,
  ): Promise<TrustedShellResult> {
    try {
      const helperRequest = this.options.helperTransport && this.platform === 'win32'
        ? this.createV2HelperRequest(
          requestId, request, exe, args, cwd, shellMeta, maxOutputBytes, true,
        )
        : undefined;
      const handle = await this.backgroundManager.start(
        requestId, request.command, exe, args, cwd,
        createTrustedShellEnvironment(process.env, request.envOverlay ?? {}, this.options.getSensitiveValues?.()), helperRequest,
      );
      if (handle.status === 'failed' || handle.pid === undefined) {
        return {
          schemaVersion: '2.0',
          status: 'failed',
          exitCode: null,
          stdout: '',
          stderr: this.redact(handle.logs.stderr.join('')) || 'Background process failed to start (no PID assigned).',
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
        termination: {
          requested: false,
          processTreeReaped: false,
          containment: helperRequest ? 'job_object' : 'none',
          detail: helperRequest
            ? 'background process is held by the manifest-bound D-013 helper; stop requires bound cancel acknowledgement'
            : 'background process intentionally left running; stop via handle',
        },
      };
    } catch (err: any) {
      const helperSpawned = err?.helperSpawned === true;
      const backgroundProcess = err?.backgroundProcessSpawned === true
        ? 'spawned' as const
        : err?.backgroundProcessSpawned === false
          ? 'not_spawned' as const
          : helperSpawned
            ? 'unknown' as const
            : 'not_spawned' as const;
      const cancellationRequired = helperSpawned || backgroundProcess !== 'not_spawned';
      const cleanupConfirmed = cancellationRequired && err?.cleanupConfirmed === true;
      const cleanupRequired = cancellationRequired && !cleanupConfirmed;
      const readinessFailed = err?.code === 'A9_BACKGROUND_HELPER_START_FAILED';
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
        spawnFacts: { helperSpawned, backgroundProcess, cleanupConfirmed, cleanupRequired },
        termination: {
          requested: cancellationRequired,
          processTreeReaped: cancellationRequired ? cleanupConfirmed : true,
          containment: helperSpawned && this.platform === 'win32' ? 'job_object' : 'none',
          detail: readinessFailed
            ? cleanupConfirmed
              ? 'helper readiness failed after launch became possible; cancellation completion proved cleanup'
              : 'helper readiness failed after launch became possible; child spawn is unknown and cleanup remains unconfirmed'
            : backgroundProcess === 'spawned'
            ? cleanupConfirmed
              ? 'process started but state persistence failed; controlled cleanup was confirmed'
              : 'process started but state persistence failed; cleanup remains unconfirmed'
            : helperSpawned
              ? 'helper started but child spawn/readiness could not be excluded; cleanup remains unconfirmed'
              : 'start rejected before spawn; nothing left running',
        },
        ...(cleanupRequired ? { residueRisk: true } : {}),
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
      '$ProgressPreference=\'SilentlyContinue\'',
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
      command,
      '$a9CommandSucceeded = $?',
      '$a9NativeExitCode = $LASTEXITCODE',
      'if ($null -ne $a9NativeExitCode) { exit [int]$a9NativeExitCode }',
      'if (-not $a9CommandSucceeded) { exit 1 }',
      'exit 0',
    ].join('\r\n');
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

/** Bind the exact configured shell file. The digest is request metadata, not a model-controlled executable grant. */
export function resolveShellFileIdentity(shellPath: string): {
  canonicalPath: string;
  sha256: string;
  fileId: string;
  version?: string;
} {
  const canonicalPath = fs.realpathSync.native(shellPath);
  const stat = fs.statSync(canonicalPath, { bigint: true });
  if (!stat.isFile()) throw new Error('Configured shell identity is not a regular file');
  return {
    canonicalPath,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(canonicalPath)).digest('hex'),
    fileId: `${stat.dev.toString(10)}:${stat.ino.toString(10)}`,
    version: `file-${stat.size.toString(10)}-${stat.mtimeNs.toString(10)}`,
  };
}

export function sameShellFileIdentity(expected: ShellFileIdentity, actual: ShellFileIdentity): boolean {
  const canonicalEqual = process.platform === 'win32'
    ? expected.canonicalPath.toLowerCase() === actual.canonicalPath.toLowerCase()
    : expected.canonicalPath === actual.canonicalPath;
  return canonicalEqual
    && expected.sha256.toLowerCase() === actual.sha256.toLowerCase()
    && expected.fileId === actual.fileId
    && expected.version === actual.version;
}

export { createTrustedShellEnvironment, validateTrustedShellEnvironmentOverlay, isForbiddenTrustedShellEnvironmentName } from './trusted-shell-environment';

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
  private readonly stdoutChunks: Buffer[] = [];
  private readonly stderrChunks: Buffer[] = [];
  private stdoutWritten = 0;
  private stderrWritten = 0;
  private stdoutTruncated = false;
  private stderrTruncated = false;
  readonly paths: { stdout: string; stderr: string };

  constructor(
    logDir: string,
    requestId: string,
    private readonly maxBytes: number,
    private readonly getSensitiveValues?: () => readonly string[],
  ) {
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
    this.writeBounded(chunk, stream);
  }

  private writeBounded(chunk: Buffer, stream: 'stdout' | 'stderr'): void {
    const written = stream === 'stdout' ? this.stdoutWritten : this.stderrWritten;
    const overlap = maxSensitiveVariantBytes(this.getSensitiveValues?.() ?? []);
    const captureLimit = this.maxBytes + overlap;
    if (written >= captureLimit) {
      if (stream === 'stdout') this.stdoutTruncated = true;
      else this.stderrTruncated = true;
      return;
    }
    const slice = written + chunk.length > captureLimit ? chunk.subarray(0, captureLimit - written) : chunk;
    (stream === 'stdout' ? this.stdoutChunks : this.stderrChunks).push(Buffer.from(slice));
    if (stream === 'stdout') {
      this.stdoutWritten += slice.length;
      if (written + chunk.length > this.maxBytes) this.stdoutTruncated = true;
    } else {
      this.stderrWritten += slice.length;
      if (written + chunk.length > this.maxBytes) this.stderrTruncated = true;
    }
  }

  finish(): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      const chunks = stream === 'stdout' ? this.stdoutChunks : this.stderrChunks;
      if (chunks.length === 0) continue;
      const truncated = stream === 'stdout' ? this.stdoutTruncated : this.stderrTruncated;
      try {
        let content = redactSensitiveBytes(Buffer.concat(chunks), this.getSensitiveValues?.() ?? []);
        if (content.length > this.maxBytes) content = content.subarray(0, this.maxBytes);
        if (truncated) content = Buffer.concat([content, Buffer.from(`\n[raw log truncated at ${this.maxBytes} bytes]`, 'utf8')]);
        fs.writeFileSync(this.paths[stream], content);
      } catch (_err) { /* best effort */ }
    }
    this.stdoutChunks.length = 0;
    this.stderrChunks.length = 0;
  }
}

function replaceAllBytes(content: Buffer, needle: Buffer, replacement: Buffer): Buffer {
  if (needle.length === 0) return content;
  const parts: Buffer[] = [];
  let cursor = 0;
  let found = content.indexOf(needle, cursor);
  if (found < 0) return content;
  while (found >= 0) {
    parts.push(content.subarray(cursor, found), replacement);
    cursor = found + needle.length;
    found = content.indexOf(needle, cursor);
  }
  parts.push(content.subarray(cursor));
  return Buffer.concat(parts);
}

function redactSensitiveBytes(content: Buffer, secrets: readonly string[]): Buffer {
  let output = content;
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length === 0) continue;
    const values = sensitiveTextVariants(secret);
    for (const value of values) {
      output = replaceAllBytes(output, Buffer.from(value, 'utf8'), Buffer.from('***redacted***', 'utf8'));
      output = replaceAllBytes(output, Buffer.from(value, 'utf16le'), Buffer.from('***redacted***', 'utf16le'));
    }
    const base64 = Buffer.from(secret, 'utf8').toString('base64');
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_');
    for (const value of [secret, base64, base64.replace(/=+$/g, ''), base64url, base64url.replace(/=+$/g, '')]) {
      output = replacePercentEquivalentBytes(output, value, false);
      output = replacePercentEquivalentBytes(output, value, true);
    }
  }
  return output;
}

function replacePercentEquivalentBytes(content: Buffer, value: string, utf16le: boolean): Buffer {
  const encoded = encodeURIComponent(value);
  let pattern = '';
  let cursor = 0;
  const unit = (source: string) => source.split('').map((ch) => escapeRegex(ch) + (utf16le ? '\\x00' : '')).join('');
  for (const match of encoded.matchAll(/%([0-9A-F]{2})/g)) {
    const index = match.index ?? 0;
    pattern += unit(encoded.slice(cursor, index));
    const hex = match[1];
    const digit = (ch: string) => /[a-f]/i.test(ch) ? `[${ch.toLowerCase()}${ch.toUpperCase()}]` : ch;
    const percentToken = unit('%') + digit(hex[0]) + (utf16le ? '\\x00' : '') + digit(hex[1]) + (utf16le ? '\\x00' : '');
    pattern += hex === '20' ? `(?:${percentToken}|${unit('+')})` : percentToken;
    cursor = index + match[0].length;
  }
  pattern += unit(encoded.slice(cursor));
  if (!pattern || pattern === unit(encoded)) return content;
  const raw = content.toString('latin1');
  const replacement = Buffer.from('***redacted***', utf16le ? 'utf16le' : 'utf8').toString('latin1');
  return Buffer.from(raw.replace(new RegExp(pattern, 'g'), replacement), 'latin1');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sensitiveTextVariants(secret: string): string[] {
  const base64 = Buffer.from(secret, 'utf8').toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_');
  const baseEncodings = [base64, base64.replace(/=+$/g, ''), base64url, base64url.replace(/=+$/g, '')];
  const encodeVariants = (value: string): string[] => {
    const percent = encodeURIComponent(value);
    return [percent, percent.toLowerCase(), percent.toUpperCase(), percent.replace(/%20/gi, '+')];
  };
  return Array.from(new Set([secret, ...baseEncodings, ...encodeVariants(secret), ...baseEncodings.flatMap(encodeVariants)]));
}

function maxSensitiveVariantBytes(secrets: readonly string[]): number {
  let max = 0;
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length === 0) continue;
    for (const value of sensitiveTextVariants(secret)) {
      max = Math.max(max, Buffer.byteLength(value, 'utf8'), Buffer.byteLength(value, 'utf16le'));
    }
  }
  return max;
}
