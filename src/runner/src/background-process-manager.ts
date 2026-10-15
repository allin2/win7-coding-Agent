/**
 * @module background-process-manager
 * @description A9 托管后台进程管理器 (PRD §4 A9-SH03 / ADR-0089)
 *
 * 合同：最多 3 个；日志有界；start/poll/stop；启动失败不能返回成功；
 * 状态不把“正在运行”写成 exited；保存 PID/命令/启动事实；重启后只探测
 * 不自动重放；提供退出时停止或留给系统的选择。
 */

import { ChildProcess, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { SafeOutputStream, secretVariants, ShellOutputChunk } from './stream-output';
import { StringDecoder } from 'string_decoder';
import { killProcessTree } from './process-cleanup';
import { HelperTransport, HelperTransportResult, ManagedHelperInvocation } from './native-transport';
import { decodeNativeHelperBase64, hasCompleteHelperCleanupProof, NativeHelperRequest, NativeManagedResponse } from './native-protocol';

export interface ManagedProcessOwner {
  workspace: string; conversationId: string; taskId: string; turnId: string; toolCallId: string;
}
export interface ManagedStartOptions {
  owner?: ManagedProcessOwner;
  onOutput?: (chunk: ShellOutputChunk) => Promise<void> | void;
}
interface OutputEntry { seq: number; stream: 'stdout' | 'stderr'; text: string; }
interface ManagedRing { nonce: string; nextSeq: number; bytes: { stdout: number; stderr: number }; entries: OutputEntry[]; }
function managedError(code: string): Error & { code: string } { return Object.assign(new Error(code), { code }); }

export interface BackgroundProcessHandle {
  handleId: string;
  owner?: ManagedProcessOwner;
  requestId?: string;
  ownershipState?: 'owned' | 'release_intent' | 'released' | 'release_unknown';
  releaseId?: string;
  recoveryStatus?: 'running_unknown' | 'identity_mismatch' | 'exited';
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
  owner?: ManagedProcessOwner;
  ownershipState?: BackgroundProcessHandle['ownershipState'];
  releaseId?: string;
  requestId?: string;
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
    terminal?: Promise<void>;
    ring?: ManagedRing;
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
    options: ManagedStartOptions = {},
  ): Promise<BackgroundProcessHandle> {
    if (this.getActiveCount() >= BackgroundProcessManager.MAX_PROCESSES) {
      throw new Error(`已达到托管后台进程上限 (${BackgroundProcessManager.MAX_PROCESSES})，请先停止已有后台进程。`);
    }
    if (this.processes.has(handleId)) {
      throw new Error(`后台进程句柄已存在: ${handleId}`);
    }
    if (options.owner && (!helperRequest || !('schemaVersion' in helperRequest) || helperRequest.schemaVersion !== 3)) throw managedError('A9_MANAGED_V3_REQUIRED');
    if (options.owner && Object.values(options.owner).some((v) => typeof v !== 'string' || !v.trim())) throw managedError('A9_MANAGED_OWNER_INVALID');
    if (helperRequest) return this.startViaHelper(handleId, command, cwd, helperRequest, environment, options);

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
    options: ManagedStartOptions = {},
  ): Promise<BackgroundProcessHandle> {
    if (!this.helperTransport?.startManaged) {
      throw Object.assign(new Error('D-013 helper does not support managed execution'), { code: 'A9_BACKGROUND_HELPER_UNAVAILABLE' });
    }
    const v3 = 'schemaVersion' in request && request.schemaVersion === 3;
    const variants = secretVariants(this.getSensitiveValues());
    const encoding = v3 ? request.outputEncoding : { stdout: 'utf-8' as const, stderr: 'utf-8' as const };
    const streams = { stdout: new SafeOutputStream(encoding.stdout, variants, this.redactText), stderr: new SafeOutputStream(encoding.stderr, variants, this.redactText) };
    const handle: BackgroundProcessHandle = {
      handleId,
      command,
      cwd,
      pid: undefined,
      startTime: new Date().toISOString(),
      status: 'starting',
      ...(options.owner ? { owner: Object.freeze({ ...options.owner }), requestId: request.requestId, ownershipState: 'owned' as const } : {}),
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
      helperInvocation: undefined as ManagedHelperInvocation | undefined,
      terminal: undefined as Promise<void> | undefined,
      ring: { nonce: randomBytes(16).toString('hex'), nextSeq: 1, bytes: { stdout: 0, stderr: 0 }, entries: [] } as ManagedRing,
      helperCleanupConfirmed: false,
      pendingLogText: { stdout: '', stderr: '' },
      logDecoders: { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') },
    };
    this.processes.set(handleId, entry);
    // Starting intent is a mandatory durable boundary BEFORE any child can be created.
    const intentError = this.notifyStateChange(handle);
    if (intentError) { this.processes.delete(handleId); throw managedError('A9_BACKGROUND_STATE_PERSIST_FAILED'); }
    const raw = { stdout: 0, stderr: 0 }, source = { stdout: 0, stderr: 0 }, truncated = { stdout: false, stderr: false };
    let outputSeq = 0;
    const publish = async (stream: 'stdout' | 'stderr', text: string, terminal = false) => {
      if (!text && !terminal && !streams[stream].warning) return;
      let piece = '', size = 0;
      const pieces: string[] = [];
      for (const c of text) {
        const n = Buffer.byteLength(c); if (size + n > 16 * 1024) { pieces.push(piece); piece = ''; size = 0; }
        piece += c; size += n;
      }
      if (piece || !pieces.length) pieces.push(piece);
      for (const projected of pieces) {
        const chunk: ShellOutputChunk = { requestId: request.requestId, stream, outputSeq: ++outputSeq, sourceSeqThrough: source[stream], text: projected,
          rawBytesRead: raw[stream], truncated: truncated[stream] || Boolean(streams[stream].warning), ...(streams[stream].warning ? { warning: streams[stream].warning } : {}) };
        await options.onOutput?.(chunk); // Mandatory audit before ring/model/UI publication.
        this.appendRedactedText(handle, stream, projected);
        const ring = entry.ring;
        ring.entries.push({ seq: ring.nextSeq++, stream, text: projected }); ring.bytes[stream] += Buffer.byteLength(projected);
        while (ring.entries.length > 4096 || ring.bytes.stdout > 1024 * 1024 || ring.bytes.stderr > 1024 * 1024) {
          const old = ring.entries.shift()!; ring.bytes[old.stream] -= Buffer.byteLength(old.text);
        }
      }
    };
    let invocation: ManagedHelperInvocation;
    try { invocation = this.helperTransport.startManaged(request, environment, v3 ? async (chunk) => {
      const stream = chunk.stream;
      if (chunk.type === 'output_truncated') { truncated[stream] = true; await publish(stream, streams[stream].finish(), true); return; }
      raw[stream] += chunk.byteLength; source[stream] = chunk.seq;
      await publish(stream, streams[stream].push(decodeNativeHelperBase64(chunk.dataBase64, chunk.byteLength, 'output')));
    } : undefined); }
    catch (error) { handle.status = 'failed'; handle.cleanupRequired = false; entry.helperCleanupConfirmed = true; this.notifyStateChange(handle); throw error; }
    entry.helperInvocation = invocation;
    entry.terminal = invocation.completion.then(async (result) => {
      try {
        if (v3 && result.kind === 'response' && ['execution_result', 'execution_released'].includes(result.response.type)) for (const stream of ['stdout', 'stderr'] as const) await publish(stream, streams[stream].finish());
        this.finishHelperInvocation(entry, result, request);
      } catch (error) {
        handle.status = 'failed'; handle.cleanupRequired = true;
        this.appendRedactedText(handle, 'stderr', 'A9_MANAGED_OUTPUT_AUDIT_FAILED');
        const failure = this.notifyStateChange(handle); if (failure) handle.cleanupRequired = true;
      }
    });
    try {
      const started = await invocation.ready;
      if (handle.status === 'failed') throw new Error(handle.logs.stderr.join('\n') || 'helper failed after readiness');
      handle.pid = started.childPid;
      if (handle.status === 'starting') handle.status = 'running';
    } catch (error) {
      // The helper process may already have created and Job-bound the child
      // even when execution_started is missing or malformed. Cancel this same
      // invocation and wait for its real terminal result before reporting the
      // start failure; the retained map entry remains actionable when cleanup
      // cannot be proven.
      invocation.cancel();
      let completion: HelperTransportResult<NativeManagedResponse>;
      try {
        completion = await invocation.completion;
        await entry.terminal;
      } catch (completionError) {
        completion = {
          kind: 'helper_crashed',
          detail: String(completionError),
          cleanupConfirmed: false,
        };
      }
      const cleanupConfirmed = completion.kind === 'response'
        ? completion.response.type === 'execution_result'
          && completion.response.requestId === request.requestId
          && ('schemaVersion' in completion.response ? completion.response.schemaVersion : 1) === ('schemaVersion' in request ? request.schemaVersion : 1)
          && ('profileId' in completion.response ? completion.response.profileId : undefined) === ('profileId' in request ? request.profileId : undefined)
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
    result: HelperTransportResult<NativeManagedResponse>,
    request: NativeHelperRequest,
  ): void {
    const handle = entry.handle;
    if (result.kind === 'response' && (result.response.requestId !== request.requestId
      || ('schemaVersion' in result.response ? result.response.schemaVersion : 1) !== ('schemaVersion' in request ? request.schemaVersion : 1)
      || (result.response.type !== 'error' && ('profileId' in result.response ? result.response.profileId : undefined) !== ('profileId' in request ? request.profileId : undefined)))) {
      result = { kind: 'helper_crashed', detail: 'A9_BACKGROUND_HELPER_IDENTITY_MISMATCH', cleanupConfirmed: false };
    }
    if (result.kind === 'response' && result.response.type === 'execution_released') {
      handle.ownershipState = 'released'; handle.releaseId = result.response.releaseId;
      handle.cleanupRequired = false; entry.helperCleanupConfirmed = false;
      const failure = this.notifyStateChange(handle);
      if (failure) { handle.ownershipState = 'release_unknown'; handle.cleanupRequired = true; }
      return;
    }
    if (handle.ownershipState === 'release_intent') handle.ownershipState = 'release_unknown';
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
      if (!('schemaVersion' in response) || response.schemaVersion !== 3) {
      this.appendLog(entry, 'stdout', decodeNativeHelperBase64(response.stdoutBase64, response.stdoutSize, 'stdoutBase64'));
      this.appendLog(entry, 'stderr', decodeNativeHelperBase64(response.stderrBase64, response.stderrSize, 'stderrBase64'));
      }
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
    const persistenceError = this.notifyStateChange(handle);
    if (persistenceError) handle.cleanupRequired = true;
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
    if (handle.ownershipState === 'released' || handle.ownershipState === 'release_unknown' || handle.ownershipState === 'release_intent') throw managedError('A9_MANAGED_OWNERSHIP_UNCONFIRMED');
    if (entry.recoveredFact && handle.cleanupRequired === true) {
      throw Object.assign(new Error(
        `后台进程 ${handleId} 是重启前遗留的未确认 D-013 清理事实；应用不会把 helper PID 消失误判为进程树已清理。请完成独立残留检查。`,
      ), { code: 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED' });
    }
    if (entry.helperInvocation && entry.helperCleanupConfirmed !== true) {
      if (handle.status === 'running' || handle.status === 'starting') {
        entry.helperInvocation.cancel();
        await entry.helperInvocation.completion;
        await entry.terminal;
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
      pid: fact.pid || undefined,
      requestId: fact.requestId,
      startTime: fact.startTime,
      status: alive ? 'running' : 'exited',
      exitCode: alive ? null : null,
      logs: { stdout: [], stderr: [] },
      droppedLogLines: { stdout: 0, stderr: 0 },
      pidReusePossible: alive,
      recoveryStatus: alive ? 'running_unknown' : 'exited',
      ...(fact.owner ? { owner: { ...fact.owner } } : {}),
      ...(fact.ownershipState ? { ownershipState: fact.ownershipState } : {}),
      ...(fact.releaseId ? { releaseId: fact.releaseId } : {}),
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
    if (entry.handle.ownershipState === 'released') return false;
    return entry.handle.status === 'running' || entry.handle.status === 'starting'
      || entry.handle.cleanupRequired === true
      || Boolean(entry.helperInvocation && entry.helperCleanupConfirmed !== true);
  }

  /**
   * 应用退出策略：stopManaged=true 停止全部受管进程后移除已终止项；
   * 清理无法确认的活动项必须保留，以便上层阻止退出并允许再次处置。
   * false 将进程留给系统（仅忘记句柄，不发送信号）。
   */
  async dispose(options: { stopManaged: boolean }): Promise<{ stopped: string[]; leftToSystem: string[]; unresolved: string[] }> {
    const stopped: string[] = [], leftToSystem: string[] = [], unresolved: string[] = [];
    for (const [id, entry] of this.processes) {
      if (!this.requiresCleanupAttention(entry)) continue;
      try {
        if (options.stopManaged) { await this.stop(id); stopped.push(id); }
        else if (entry.helperInvocation) {
          if (entry.recoveredFact || !entry.helperInvocation.release || entry.handle.status !== 'running'
            || entry.handle.ownershipState === 'release_unknown') throw managedError('A9_RELEASE_UNAVAILABLE');
          entry.handle.releaseId = entry.handle.releaseId ?? randomBytes(16).toString('hex');
          entry.handle.ownershipState = 'release_intent';
          const failure = this.notifyStateChange(entry.handle); if (failure) { entry.handle.ownershipState = 'owned'; throw managedError('A9_RELEASE_AUDIT_FAILED'); }
          await entry.helperInvocation.release(entry.handle.releaseId); await entry.terminal;
          if (entry.handle.ownershipState as string !== 'released') throw managedError('A9_RELEASE_UNKNOWN');
          leftToSystem.push(id);
        } else if (!entry.recoveredFact && !entry.handle.owner && entry.child?.pid) {
          // Legacy direct-spawn profile has no Job ownership to release.
          leftToSystem.push(id); entry.handle.ownershipState = 'released';
        } else throw managedError('A9_RELEASE_UNAVAILABLE');
      } catch (error) {
        if (entry.handle.ownershipState === 'release_intent') { entry.handle.ownershipState = 'release_unknown'; entry.handle.cleanupRequired = true; this.notifyStateChange(entry.handle); }
        const reason = entry.recoveredFact ? (entry.handle.cleanupRequired ? 'recovered helper cleanup remains unconfirmed' : 'recovered PID fact requires explicit stop confirmation')
          : entry.helperInvocation && options.stopManaged ? `helper cleanup unconfirmed: ${this.redactText(String(error)).slice(0, 512)}` : this.redactText(String(error)).slice(0, 512);
        const detail = `${id} (${reason})`;
        unresolved.push(detail);
        // Legacy stop callers already use leftToSystem as their exit blocker.
        if (options.stopManaged) leftToSystem.push(detail);
      }
    }
    for (const [id, entry] of this.processes) if (!this.requiresCleanupAttention(entry)) this.processes.delete(id);
    return { stopped, leftToSystem, unresolved };
  }

  private ownedEntry(handleId: string, owner: Pick<ManagedProcessOwner, 'workspace' | 'conversationId'>) {
    const entry = this.processes.get(handleId);
    if (!entry) throw managedError('A9_MANAGED_HANDLE_UNKNOWN');
    if (!entry.handle.owner || entry.handle.owner.workspace !== owner.workspace || entry.handle.owner.conversationId !== owner.conversationId) throw managedError('A9_MANAGED_HANDLE_WRONG_OWNER');
    return entry;
  }

  async stopOwned(handleId: string, owner: Pick<ManagedProcessOwner, 'workspace' | 'conversationId'>): Promise<BackgroundProcessHandle> {
    this.ownedEntry(handleId, owner); return this.stop(handleId);
  }

  readOutput(handleId: string, owner: Pick<ManagedProcessOwner, 'workspace' | 'conversationId'>, cursor?: string, maxBytes = 8192) {
    const entry = this.ownedEntry(handleId, owner), ring = entry.ring;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16384) throw managedError('A9_MANAGED_OUTPUT_BUDGET_INVALID');
    if (!ring || entry.recoveredFact) throw managedError('CURSOR_EXPIRED');
    const oldest = ring.entries[0]?.seq ?? ring.nextSeq;
    let seq = oldest, offset = 0;
    if (cursor !== undefined) {
      const m = /^([a-f0-9]{32})\.([1-9][0-9]*)\.([0-9]+)$/.exec(cursor);
      if (!m || m[1] !== ring.nonce) throw managedError('A9_MANAGED_CURSOR_INVALID');
      seq = Number(m[2]); offset = Number(m[3]);
      if (!Number.isSafeInteger(seq) || !Number.isSafeInteger(offset) || seq > ring.nextSeq) throw managedError('A9_MANAGED_CURSOR_INVALID');
      if (seq < oldest) throw Object.assign(managedError('CURSOR_EXPIRED'), { oldestCursor: `${ring.nonce}.${oldest}.0` });
    }
    const target = ring.entries.find((e) => e.seq === seq);
    if ((!target && offset !== 0) || (target && (offset > target.text.length || (offset > 0 && /[\uDC00-\uDFFF]/.test(target.text[offset] ?? ''))))) throw managedError('A9_MANAGED_CURSOR_INVALID');
    const entries: OutputEntry[] = []; let bytes = 0;
    for (const item of ring.entries) {
      if (item.seq < seq) continue;
      let text = '', consumed = offset;
      for (const c of item.text.slice(offset)) {
        const n = Buffer.byteLength(c); if (bytes + n > maxBytes) break;
        text += c; bytes += n; consumed += c.length;
      }
      if (text || item.text.length === 0) entries.push({ seq: item.seq, stream: item.stream, text });
      if (consumed < item.text.length) { seq = item.seq; offset = consumed; break; }
      seq = item.seq + 1; offset = 0;
    }
    return { handleId, entries, nextCursor: `${ring.nonce}.${seq}.${offset}`, oldestCursor: `${ring.nonce}.${oldest}.0`,
      truncated: oldest > 1, status: entry.handle.status, exitCode: entry.handle.exitCode, ownershipState: entry.handle.ownershipState,
      cleanupRequired: entry.handle.cleanupRequired === true, recoveryStatus: entry.handle.recoveryStatus };
  }

  /** 兼容旧入口：停止全部。 */
  async cleanupAll(): Promise<void> {
    await this.dispose({ stopManaged: true });
  }
}
