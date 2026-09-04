/**
 * @module background-process-manager
 * @description A9 托管后台进程管理器 (PRD §4 A9-SH03 / ADR-0089)
 *
 * 合同：最多 3 个；日志有界；start/poll/stop；启动失败不能返回成功；
 * 状态不把“正在运行”写成 exited；保存 PID/命令/启动事实；重启后只探测
 * 不自动重放；提供退出时停止或留给系统的选择。
 */

import { ChildProcess, spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { killProcessTree } from './process-cleanup';
import { HelperTransport, HelperTransportResult, ManagedHelperInvocation } from './native-transport';
import { decodeNativeHelperBase64, hasCompleteHelperCleanupProof, NativeHelperRequest } from './native-protocol';

export interface BackgroundProcessHandle {
  handleId: string;
  command: string;
  cwd: string;
  pid: number | undefined;
  startTime: string;
  status: 'starting' | 'running' | 'exited' | 'stopped' | 'failed';
  exitCode: number | null;
  logs: { stdout: string[]; stderr: string[] };
  /** 有界日志丢弃的行数（日志已满时继续运行但丢弃旧行）。 */
  droppedLogLines: { stdout: number; stderr: number };
  /** 重启后恢复的探测事实：PID 存活但可能已被其他进程复用。 */
  pidReusePossible?: boolean;
  /** Helper 已结束但 Job Object 清理尚未证实时，仍须向产品暴露 Stop 重试入口。 */
  cleanupRequired?: boolean;
}

export interface PollResult {
  handleId: string;
  status: BackgroundProcessHandle['status'];
  exitCode: number | null;
  stdoutDelta: string;
  stderrDelta: string;
  totalStdoutLines: number;
  totalStderrLines: number;
  logsDropped: { stdout: number; stderr: number };
}

export interface ProbeFact {
  pid: number;
  command: string;
  cwd: string;
  startTime: string;
  cleanupRequired?: boolean;
}

/** 每流日志行数上限；超出后丢弃最旧行并计数。 */
const MAX_LOG_LINES = 2000;

function backgroundSensitiveVariants(secret: string): string[] {
  if (typeof secret !== 'string' || secret.length === 0) return [];
  const base64 = Buffer.from(secret, 'utf8').toString('base64');
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_');
  const base = [secret, base64, base64.replace(/=+$/g, ''), base64url, base64url.replace(/=+$/g, '')];
  return Array.from(new Set(base.flatMap((value) => {
    const percent = encodeURIComponent(value);
    return [value, percent, percent.toLowerCase(), percent.toUpperCase(), percent.replace(/%20/gi, '+')];
  })));
}

export class BackgroundProcessManager {
  private static readonly MAX_PROCESSES = 3;
  private readonly processes = new Map<string, {
    handle: BackgroundProcessHandle;
    child: ChildProcess | undefined;
    lastPolledStdoutIdx: number;
    lastPolledStderrIdx: number;
    /** 重启恢复的探测事实没有子进程句柄。 */
    recoveredFact: boolean;
    helperInvocation?: ManagedHelperInvocation;
    helperCleanupConfirmed?: boolean;
    pendingLogText: { stdout: string; stderr: string };
    logDecoders: { stdout: StringDecoder; stderr: StringDecoder };
  }>();

  constructor(
    private readonly helperTransport?: HelperTransport,
    private readonly redactText: (text: string) => string = (text) => text,
    private readonly getSensitiveValues: () => readonly string[] = () => [],
    private readonly onStateChange: (handle: BackgroundProcessHandle) => void = () => {},
  ) {}

  private notifyStateChange(handle: BackgroundProcessHandle): Error | undefined {
    try {
      this.onStateChange({ ...handle, logs: { stdout: [...handle.logs.stdout], stderr: [...handle.logs.stderr] } });
      return undefined;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  private containAfterStatePersistenceFailure(handle: BackgroundProcessHandle, error: Error): void {
    handle.cleanupRequired = true;
    this.appendRedactedText(handle, 'stderr', `managed process state persistence failed: ${error.message}`);
    if (handle.status === 'running' || handle.status === 'starting') {
      void this.stop(handle.handleId).catch((stopError) => {
        this.appendRedactedText(handle, 'stderr', `managed process cleanup after persistence failure was not confirmed: ${String(stopError)}`);
      });
    }
  }

  /**
   * 启动托管后台进程。异步方法会等到首个事件循环 tick，使同步 spawn 错误
   * （可执行文件不存在等）在返回前反映到 status，避免把失败报告为成功。
   */
  async start(
    handleId: string,
    command: string,
    shellExe: string,
    shellArgs: string[],
    cwd: string,
    environment?: NodeJS.ProcessEnv,
    helperRequest?: NativeHelperRequest,
  ): Promise<BackgroundProcessHandle> {
    if (this.getActiveCount() >= BackgroundProcessManager.MAX_PROCESSES) {
      throw new Error(`已达到托管后台进程上限 (${BackgroundProcessManager.MAX_PROCESSES})，请先停止已有后台进程。`);
    }
    if (this.processes.has(handleId)) {
      throw new Error(`后台进程句柄已存在: ${handleId}`);
    }
    if (helperRequest) return this.startViaHelper(handleId, command, cwd, helperRequest, environment);

    let child: ChildProcess;
    try {
      child = spawn(shellExe, shellArgs, {
        cwd,
        env: environment ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        windowsHide: true,
      });
    } catch (err: any) {
      throw new Error(`后台进程启动失败: ${err?.message || err}`);
    }

    const handle: BackgroundProcessHandle = {
      handleId,
      command,
      cwd,
      pid: child.pid,
      startTime: new Date().toISOString(),
      status: child.pid === undefined ? 'failed' : 'starting',
      exitCode: null,
      logs: { stdout: [], stderr: [] },
      droppedLogLines: { stdout: 0, stderr: 0 },
    };

    const entry = {
      handle,
      child,
      lastPolledStdoutIdx: 0,
      lastPolledStderrIdx: 0,
      recoveredFact: false,
      pendingLogText: { stdout: '', stderr: '' },
      logDecoders: { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') },
    };
    this.processes.set(handleId, entry);

    child.stdout?.on('data', (chunk: Buffer) => {
      this.appendLog(entry, 'stdout', chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.appendLog(entry, 'stderr', chunk);
    });
    child.on('error', (_err) => {
      handle.status = 'failed';
      const persistenceError = this.notifyStateChange(handle);
      if (persistenceError) this.containAfterStatePersistenceFailure(handle, persistenceError);
    });
    child.on('close', (code) => {
      this.flushPendingLog(entry, 'stdout');
      this.flushPendingLog(entry, 'stderr');
      // 只把真正退出的进程标记为 exited；stopped/failed 不被覆盖。
      if (handle.status === 'running' || handle.status === 'starting') {
        handle.status = 'exited';
      }
      handle.exitCode = code;
      const persistenceError = this.notifyStateChange(handle);
      if (persistenceError) this.containAfterStatePersistenceFailure(handle, persistenceError);
    });

    // 等一个 macrotask 让 spawn error 事件有机会触发。
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    if (handle.status === 'starting' && child.pid !== undefined) {
      handle.status = 'running';
      const persistenceError = this.notifyStateChange(handle);
      if (persistenceError) {
        handle.cleanupRequired = true;
        let cleanupConfirmed = false;
        try {
          const stopped = await this.stop(handleId);
          cleanupConfirmed = stopped.status === 'stopped' || stopped.status === 'exited';
          if (cleanupConfirmed) handle.cleanupRequired = false;
        } catch (_stopError) { /* reported on the structured start error */ }
        throw Object.assign(new Error(`A9_BACKGROUND_STATE_PERSIST_FAILED: ${persistenceError.message}`), {
          code: 'A9_BACKGROUND_STATE_PERSIST_FAILED',
          backgroundProcessSpawned: true,
          cleanupConfirmed,
        });
      }
    }
    return { ...handle, logs: { stdout: [...handle.logs.stdout], stderr: [...handle.logs.stderr] } };
  }

  private async startViaHelper(
    handleId: string,
    command: string,
    cwd: string,
    request: NativeHelperRequest,
    environment?: NodeJS.ProcessEnv,
  ): Promise<BackgroundProcessHandle> {
    if (!this.helperTransport?.startManaged) {
      throw Object.assign(new Error('D-013 helper does not support managed execution'), { code: 'A9_BACKGROUND_HELPER_UNAVAILABLE' });
    }
    const invocation = this.helperTransport.startManaged(request, environment);
    const handle: BackgroundProcessHandle = {
      handleId,
      command,
      cwd,
      pid: undefined,
      startTime: new Date().toISOString(),
      status: 'starting',
      exitCode: null,
      logs: { stdout: [], stderr: [] },
      droppedLogLines: { stdout: 0, stderr: 0 },
      cleanupRequired: true,
    };
    const entry = {
      handle,
      child: undefined,
      lastPolledStdoutIdx: 0,
      lastPolledStderrIdx: 0,
      recoveredFact: false,
      helperInvocation: invocation,
      helperCleanupConfirmed: false,
      pendingLogText: { stdout: '', stderr: '' },
      logDecoders: { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') },
    };
    this.processes.set(handleId, entry);
    invocation.completion.then((result) => this.finishHelperInvocation(entry, result));
    try {
      const started = await invocation.ready;
      if (handle.status === 'failed') throw new Error(handle.logs.stderr.join('\n') || 'helper failed after readiness');
      handle.pid = started.childPid;
      handle.status = 'running';
    } catch (error) {
      // The helper process may already have created and Job-bound the child
      // even when execution_started is missing or malformed. Cancel this same
      // invocation and wait for its real terminal result before reporting the
      // start failure; the retained map entry remains actionable when cleanup
      // cannot be proven.
      invocation.cancel();
      let completion: HelperTransportResult;
      try {
        completion = await invocation.completion;
      } catch (completionError) {
        completion = {
          kind: 'helper_crashed',
          detail: String(completionError),
          cleanupConfirmed: false,
        };
      }
      const cleanupConfirmed = completion.kind === 'response'
        ? completion.response.type === 'execution_result'
          && hasCompleteHelperCleanupProof(completion.response)
        : completion.cleanupConfirmed === true;
      entry.helperCleanupConfirmed = cleanupConfirmed;
      handle.cleanupRequired = !cleanupConfirmed;
      handle.status = 'failed';
      const detail = handle.logs.stderr.join('\n') || 'D-013 helper failed to prove managed execution readiness';
      const persistenceError = this.notifyStateChange(handle);
      if (persistenceError) this.appendRedactedText(handle, 'stderr', `managed process state persistence failed: ${persistenceError.message}`);
      throw Object.assign(new Error(detail), {
        code: 'A9_BACKGROUND_HELPER_START_FAILED',
        cause: error,
        // A spawn_failed terminal result proves that no child was created.
        // Other readiness failures remain conservative because the helper may
        // have created and Job-bound the child before its ready message failed.
        backgroundProcessSpawned: completion.kind === 'spawn_failed' ? false : 'unknown',
        helperSpawned: invocation.pid !== undefined,
        cleanupConfirmed,
        cleanupRequired: !cleanupConfirmed,
        residueRisk: !cleanupConfirmed,
      });
    }
    const persistenceError = this.notifyStateChange(handle);
    if (persistenceError) {
      handle.cleanupRequired = true;
      let cleanupConfirmed = false;
      try {
        const stopped = await this.stop(handleId);
        cleanupConfirmed = stopped.status === 'stopped' || stopped.status === 'exited';
        if (cleanupConfirmed) handle.cleanupRequired = false;
      } catch (_stopError) { /* reported on the structured start error */ }
      throw Object.assign(new Error(`A9_BACKGROUND_STATE_PERSIST_FAILED: ${persistenceError.message}`), {
        code: 'A9_BACKGROUND_STATE_PERSIST_FAILED',
        backgroundProcessSpawned: true,
        cleanupConfirmed,
      });
    }
    return { ...handle, logs: { stdout: [...handle.logs.stdout], stderr: [...handle.logs.stderr] } };
  }

  private finishHelperInvocation(
    entry: {
      handle: BackgroundProcessHandle;
      helperCleanupConfirmed?: boolean;
      pendingLogText: { stdout: string; stderr: string };
      logDecoders: { stdout: StringDecoder; stderr: StringDecoder };
    },
    result: HelperTransportResult,
  ): void {
    const handle = entry.handle;
    if (result.kind !== 'response' || result.response.type !== 'execution_result') {
      entry.helperCleanupConfirmed = result.kind !== 'response' && result.cleanupConfirmed;
      handle.cleanupRequired = !entry.helperCleanupConfirmed;
      handle.status = 'failed';
      const detail = result.kind !== 'response'
        ? result.detail
        : result.response.type === 'error' ? result.response.message : 'unexpected helper response';
      this.appendLog(entry, 'stderr', Buffer.from(
        detail,
        'utf8',
      ));
      this.flushPendingLog(entry, 'stderr');
      this.notifyStateChange(handle);
      return;
    }
    const response = result.response;
    entry.helperCleanupConfirmed = hasCompleteHelperCleanupProof(response);
    handle.cleanupRequired = !entry.helperCleanupConfirmed;
    try {
      this.appendLog(entry, 'stdout', decodeNativeHelperBase64(response.stdoutBase64, response.stdoutSize, 'stdoutBase64'));
      this.appendLog(entry, 'stderr', decodeNativeHelperBase64(response.stderrBase64, response.stderrSize, 'stderrBase64'));
    } catch (error) {
      entry.helperCleanupConfirmed = false;
      handle.cleanupRequired = true;
      handle.status = 'failed';
      this.appendLog(entry, 'stderr', Buffer.from(String(error), 'utf8'));
      this.flushPendingLog(entry, 'stderr');
      this.notifyStateChange(handle);
      return;
    }
    this.flushPendingLog(entry, 'stdout');
    this.flushPendingLog(entry, 'stderr');
    handle.exitCode = response.exitCode;
    handle.status = entry.helperCleanupConfirmed
      ? response.canceled ? 'stopped' : response.timedOut || response.idleTimedOut ? 'failed' : 'exited'
      : 'failed';
    this.notifyStateChange(handle);
  }

  private appendLog(
    entry: {
      handle: BackgroundProcessHandle;
      pendingLogText: { stdout: string; stderr: string };
      logDecoders: { stdout: StringDecoder; stderr: StringDecoder };
    },
    stream: 'stdout' | 'stderr',
    chunk: Buffer,
  ): void {
    const variants = this.getSensitiveValues().flatMap(backgroundSensitiveVariants);
    const maxVariantLength = variants.reduce((max, value) => Math.max(max, value.length), 0);
    const combined = entry.pendingLogText[stream] + entry.logDecoders[stream].write(chunk);
    let safeLength = maxVariantLength > 1 ? Math.max(0, combined.length - maxVariantLength + 1) : combined.length;
    if (safeLength > 0 && variants.length > 0) {
      const prefix = combined.slice(0, safeLength);
      let overlap = 0;
      for (const variant of variants) {
        for (let size = Math.min(variant.length - 1, prefix.length); size > overlap; size -= 1) {
          if (prefix.endsWith(variant.slice(0, size))) { overlap = size; break; }
        }
      }
      safeLength -= overlap;
    }
    entry.pendingLogText[stream] = combined.slice(safeLength);
    this.appendRedactedText(entry.handle, stream, combined.slice(0, safeLength));
  }

  private flushPendingLog(
    entry: {
      handle: BackgroundProcessHandle;
      pendingLogText: { stdout: string; stderr: string };
      logDecoders: { stdout: StringDecoder; stderr: StringDecoder };
    },
    stream: 'stdout' | 'stderr',
  ): void {
    const text = entry.pendingLogText[stream] + entry.logDecoders[stream].end();
    entry.pendingLogText[stream] = '';
    this.appendRedactedText(entry.handle, stream, text);
  }

  private appendRedactedText(handle: BackgroundProcessHandle, stream: 'stdout' | 'stderr', raw: string): void {
    if (!raw) return;
    const target = handle.logs[stream];
    const text = this.redactText(raw);
    for (const line of text.split('\n')) {
      target.push(line);
      if (target.length > MAX_LOG_LINES) {
        target.shift();
        if (stream === 'stdout') handle.droppedLogLines.stdout += 1;
        else handle.droppedLogLines.stderr += 1;
      }
    }
  }

  /**
   * 轮询后台进程日志增量和状态。状态来自本管理器持有的事实
   * （close 事件），不通过 PID 推断，避免 PID 复用误判。
   */
  poll(handleId: string): PollResult {
    const entry = this.processes.get(handleId);
    if (!entry) {
      throw new Error(`未找到后台进程: ${handleId}`);
    }

    const { handle, lastPolledStdoutIdx, lastPolledStderrIdx } = entry;
    const stdoutDelta = handle.logs.stdout
      .slice(Math.max(0, lastPolledStdoutIdx - handle.droppedLogLines.stdout)).join('\n');
    const stderrDelta = handle.logs.stderr
      .slice(Math.max(0, lastPolledStderrIdx - handle.droppedLogLines.stderr)).join('\n');

    // Cursor is an absolute stream-line sequence, not an array index. Once the
    // bounded buffer shifts, droppedLogLines is the retained window's origin.
    entry.lastPolledStdoutIdx = handle.droppedLogLines.stdout + handle.logs.stdout.length;
    entry.lastPolledStderrIdx = handle.droppedLogLines.stderr + handle.logs.stderr.length;

    return {
      handleId,
      status: handle.status,
      exitCode: handle.exitCode,
      stdoutDelta,
      stderrDelta,
      totalStdoutLines: handle.logs.stdout.length,
      totalStderrLines: handle.logs.stderr.length,
      logsDropped: { ...handle.droppedLogLines },
    };
  }

  /**
   * 停止指定的后台进程。只有 kill 可证明成功才标记 stopped；
   * 否则保持 running 并抛出结构化错误，提示残留风险。
   */
  async stop(handleId: string): Promise<BackgroundProcessHandle> {
    const entry = this.processes.get(handleId);
    if (!entry) {
      throw new Error(`未找到后台进程: ${handleId}`);
    }

    const { handle, child } = entry;
    if (entry.recoveredFact && handle.cleanupRequired === true) {
      throw Object.assign(new Error(
        `后台进程 ${handleId} 是重启前遗留的未确认 D-013 清理事实；应用不会把 helper PID 消失误判为进程树已清理。请完成独立残留检查。`,
      ), { code: 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED' });
    }
    if (entry.helperInvocation && entry.helperCleanupConfirmed !== true) {
      if (handle.status === 'running' || handle.status === 'starting') {
        entry.helperInvocation.cancel();
        await entry.helperInvocation.completion;
      }
      const terminalStatus = handle.status as BackgroundProcessHandle['status'];
      if (!entry.helperCleanupConfirmed || (terminalStatus !== 'stopped' && terminalStatus !== 'exited')) {
        throw Object.assign(new Error(`后台进程 ${handleId} 的 D-013 Job Object 清理无法确认。`), {
          code: 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED',
        });
      }
      return { ...handle, logs: { stdout: [...handle.logs.stdout], stderr: [...handle.logs.stderr] } };
    }
    if (handle.status === 'running' || handle.status === 'starting') {
      if (entry.recoveredFact) {
        if (!handle.pid || !BackgroundProcessManager.probeProcessAlive(handle.pid)) {
          handle.status = 'exited';
          handle.pidReusePossible = false;
          return { ...handle, logs: { stdout: [...handle.logs.stdout], stderr: [...handle.logs.stderr] } };
        }
        const error = new Error(
          `后台进程 ${handleId} (PID ${handle.pid}) 是重启后恢复的 PID 事实，无法证明仍是原进程；为避免 PID 复用误杀，应用不会发送停止信号。请在系统中核对并停止后再次点击 Stop。`,
        ) as Error & { code: string };
        error.code = 'A9_RECOVERED_PROCESS_IDENTITY_UNCONFIRMED';
        throw error;
      }
      const targetPid = child?.pid ?? handle.pid;
      if (targetPid) {
        const kill = await killProcessTree(targetPid);
        if (!kill.success) {
          throw new Error(`后台进程 ${handleId} (PID ${targetPid}) 清理无法确认: ${kill.error ?? 'unknown'}；可能存在残留，请手工检查。`);
        }
        handle.status = 'stopped';
      } else {
        handle.status = 'stopped';
      }
    }
    return { ...handle, logs: { stdout: [...handle.logs.stdout], stderr: [...handle.logs.stderr] } };
  }

  /**
   * 重启后恢复：只记录探测事实，绝不自动重放命令。PID 存活只代表
   * “有进程使用该 PID”，复用可能性必须如实标记，由用户决定处置。
   */
  adoptRecoveredFact(handleId: string, fact: ProbeFact): BackgroundProcessHandle {
    if (this.processes.has(handleId)) {
      throw new Error(`后台进程句柄已存在: ${handleId}`);
    }
    const alive = BackgroundProcessManager.probeProcessAlive(fact.pid);
    const handle: BackgroundProcessHandle = {
      handleId,
      command: fact.command,
      cwd: fact.cwd,
      pid: fact.pid,
      startTime: fact.startTime,
      status: alive ? 'running' : 'exited',
      exitCode: alive ? null : null,
      logs: { stdout: [], stderr: [] },
      droppedLogLines: { stdout: 0, stderr: 0 },
      pidReusePossible: alive,
      ...(fact.cleanupRequired === true ? { cleanupRequired: true } : {}),
    };
    this.processes.set(handleId, {
      handle,
      child: undefined,
      lastPolledStdoutIdx: 0,
      lastPolledStderrIdx: 0,
      recoveredFact: true,
      pendingLogText: { stdout: '', stderr: '' },
      logDecoders: { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') },
    });
    return { ...handle };
  }

  isRecoveredFact(handleId: string): boolean {
    return this.processes.get(handleId)?.recoveredFact ?? false;
  }

  /** PID 存活探测（仅事实，不区分是否同一命令）。 */
  static probeProcessAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err?.code === 'EPERM';
    }
  }

  list(): BackgroundProcessHandle[] {
    return Array.from(this.processes.values()).map((e) => ({
      ...e.handle,
      logs: { stdout: [...e.handle.logs.stdout], stderr: [...e.handle.logs.stderr] },
    }));
  }

  getActiveCount(): number {
    return Array.from(this.processes.values()).filter((e) => this.requiresCleanupAttention(e)).length;
  }

  private requiresCleanupAttention(entry: {
    handle: BackgroundProcessHandle;
    helperInvocation?: ManagedHelperInvocation;
    helperCleanupConfirmed?: boolean;
  }): boolean {
    return entry.handle.status === 'running' || entry.handle.status === 'starting'
      || entry.handle.cleanupRequired === true
      || Boolean(entry.helperInvocation && entry.helperCleanupConfirmed !== true);
  }

  /**
   * 应用退出策略：stopManaged=true 停止全部受管进程后移除已终止项；
   * 清理无法确认的活动项必须保留，以便上层阻止退出并允许再次处置。
   * false 将进程留给系统（仅忘记句柄，不发送信号）。
   */
  async dispose(options: { stopManaged: boolean }): Promise<{ stopped: string[]; leftToSystem: string[] }> {
    const stopped: string[] = [];
    const leftToSystem: string[] = [];
    if (options.stopManaged) {
      for (const [id, entry] of this.processes.entries()) {
        const status = entry.handle.status;
        if (entry.handle.cleanupRequired === true && entry.recoveredFact) {
          leftToSystem.push(`${id} (recovered helper cleanup remains unconfirmed)`);
        } else if ((status === 'running' || status === 'starting') && entry.recoveredFact) {
          // 重启恢复的 PID 可能已复用；应用退出不能代替用户确认去杀未知进程。
          leftToSystem.push(`${id} (recovered PID fact requires explicit stop confirmation)`);
        } else if (entry.helperInvocation && entry.helperCleanupConfirmed !== true) {
          try {
            await this.stop(id);
            stopped.push(id);
          } catch (error: any) {
            leftToSystem.push(`${id} (helper cleanup unconfirmed: ${error?.message || error})`);
          }
        } else if ((status === 'running' || status === 'starting') && entry.child?.pid) {
          const kill = await killProcessTree(entry.child.pid);
          if (kill.success) {
            entry.handle.status = 'stopped';
            stopped.push(id);
          } else {
            // 清理失败也必须如实暴露，不静默转为“留给系统”。
            leftToSystem.push(`${id} (cleanup unconfirmed: ${kill.error ?? 'unknown'})`);
          }
        }
      }
    } else {
      for (const [id, entry] of this.processes.entries()) {
        if (entry.handle.status === 'running' || entry.handle.status === 'starting') {
          leftToSystem.push(id);
        }
      }
    }
    for (const [id, entry] of this.processes.entries()) {
      const active = this.requiresCleanupAttention(entry);
      // stopManaged=false 是用户明确选择“留给系统”，因此可以忘记句柄；
      // stopManaged=true 时只有已终止项可移除，残留事实必须继续可见。
      if (!options.stopManaged || !active) this.processes.delete(id);
    }
    return { stopped, leftToSystem };
  }

  /** 兼容旧入口：停止全部。 */
  async cleanupAll(): Promise<void> {
    await this.dispose({ stopManaged: true });
  }
}
