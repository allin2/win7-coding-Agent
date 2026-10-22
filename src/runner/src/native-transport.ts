import { TextDecoder } from 'util';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { createTrustedShellEnvironment } from './trusted-shell-environment';
import {
  NativeHelperMessage,
  NativeHelperRequest,
  NativeHelperResponse,
  NativeHelperStartedResultV2,
  parseNativeHelperResponse, NativeOutputChunk, NativeOutputTruncated, hasCompleteHelperCleanupProof,
  NativeHelperStartedResultV3, NativeHelperReleasedResultV3, NativeManagedResponse,
} from './native-protocol';

export type HelperTransportResult<R = Exclude<NativeHelperResponse, { schemaVersion: 3 }>> =
  | { kind: 'response'; response: R }
  | { kind: 'spawn_failed' | 'helper_crashed' | 'cancelled' | 'watchdog_timeout'; detail: string; cleanupConfirmed: boolean };

export type NativeOutputHandler = (chunk: NativeOutputChunk | NativeOutputTruncated) => Promise<void> | void;

export interface HelperTransport {
  invoke(request: NativeHelperRequest, signal?: AbortSignal, environment?: NodeJS.ProcessEnv, onOutput?: NativeOutputHandler): Promise<HelperTransportResult<NativeHelperResponse>>;
  startManaged?(request: NativeHelperRequest, environment?: NodeJS.ProcessEnv, onOutput?: NativeOutputHandler): ManagedHelperInvocation;
}

export interface ManagedHelperInvocation {
  /** Helper PID is diagnostic only; managed process identity comes from ready.childPid. */
  pid?: number;
  ready: Promise<NativeHelperStartedResultV2 | NativeHelperStartedResultV3>;
  completion: Promise<HelperTransportResult<NativeManagedResponse>>;
  cancel(): void;
  release?(releaseId: string): Promise<NativeHelperReleasedResultV3>;
}

interface InvocationHooks {
  onSpawn?: (pid: number | undefined) => void;
  onStarted?: (started: NativeHelperStartedResultV2 | NativeHelperStartedResultV3) => void;
  onReadyFailure?: (error: Error) => void;
  bindRelease?: (send: (releaseId: string) => void) => void;
}

/** One request per helper process. No shell and no inherited stdio. */
export class StdioHelperTransport implements HelperTransport {
  constructor(
    private readonly helperPath: string,
    private readonly protocolOutputLimit = 96 * 1024 * 1024,
    private readonly startupTimeoutMs = 15_000,
  ) {}

  invoke(request: NativeHelperRequest, signal?: AbortSignal, environment?: NodeJS.ProcessEnv, onOutput?: NativeOutputHandler): Promise<HelperTransportResult<NativeHelperResponse>> {
    return this.invokeInternal(request, signal, {}, environment, onOutput) as Promise<HelperTransportResult<NativeHelperResponse>>;
  }

  startManaged(request: NativeHelperRequest, environment?: NodeJS.ProcessEnv, onOutput?: NativeOutputHandler): ManagedHelperInvocation {
    if (!('schemaVersion' in request) || ![2, 3].includes(request.schemaVersion) || request.managed !== true) {
      throw new Error('Managed helper execution requires a protocol v2/v3 managed request');
    }
    const controller = new AbortController();
    let pid: number | undefined;
    let resolveReady!: (value: NativeHelperStartedResultV2 | NativeHelperStartedResultV3) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<NativeHelperStartedResultV2 | NativeHelperStartedResultV3>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    let sendRelease: ((releaseId: string) => void) | undefined;
    const completion = this.invokeInternal(request, controller.signal, {
      onSpawn: (spawnedPid) => { pid = spawnedPid; },
      onStarted: resolveReady,
      onReadyFailure: rejectReady,
      bindRelease: (send) => { sendRelease = send; },
    }, environment, onOutput);
    let releaseAttempt: { id: string; result: Promise<NativeHelperReleasedResultV3> } | undefined;
    return { pid, ready, completion, cancel: () => controller.abort(),
      ...(request.schemaVersion === 3 ? { release: (releaseId: string) => {
        if (releaseAttempt) {
          if (releaseAttempt.id !== releaseId) return Promise.reject(new Error('A9_RELEASE_ID_MISMATCH'));
          return releaseAttempt.result;
        }
        const result = (async () => {
          if (!sendRelease) throw new Error('A9_RELEASE_UNAVAILABLE');
          sendRelease(releaseId);
          const terminal = await completion;
          if (terminal.kind !== 'response' || terminal.response.type !== 'execution_released'
            || terminal.response.releaseId !== releaseId) throw new Error('A9_RELEASE_UNKNOWN');
          return terminal.response;
        })();
        releaseAttempt = { id: releaseId, result }; return result;
      } } : {}),
    };
  }

  private invokeInternal(
    request: NativeHelperRequest,
    signal?: AbortSignal,
    hooks: InvocationHooks = {},
    environment?: NodeJS.ProcessEnv,
    onOutput?: NativeOutputHandler,
  ): Promise<HelperTransportResult<NativeManagedResponse>> {
    const protocolVersion = 'schemaVersion' in request ? request.schemaVersion : 1;
    return new Promise((resolve) => {
      let settled = false;
      let readySeen = false;
      let finalResponse: NativeManagedResponse | undefined;
      let readyChildPid: number | undefined;
      let releaseRequested: string | undefined;
      let forcedExit: 'watchdog_timeout' | null = null;
      let cancelRequested = false;
      let cancellationEscalated = false;
      let forcedExitTimer: NodeJS.Timeout | undefined;
      let watchdog: NodeJS.Timeout | undefined;
      let startupWatchdog: NodeJS.Timeout | undefined;
      let stdout = Buffer.alloc(0);
      let pendingLine = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let child: ChildProcessWithoutNullStreams | undefined;
      let outputSeq = 0;
      const offsets = { stdout: 0, stderr: 0 };
      const chunks = { stdout: 0, stderr: 0 };
      const truncated = { stdout: false, stderr: false };
      let queuedBytes = 0;
      let delivery = Promise.resolve();
      let streamFailure: string | undefined;
      let inputFailed = false;
      const failStream = (detail: string) => {
        if (streamFailure) return;
        // Never include child protocol/raw diagnostics (they may contain credentials).
        streamFailure = detail;
        onAbort();
      };

      const failReady = (detail: string) => {
        if (!readySeen) hooks.onReadyFailure?.(new Error(detail));
      };
      const finish = (result: HelperTransportResult<NativeManagedResponse>) => {
        if (settled) return;
        settled = true;
        if (watchdog) clearTimeout(watchdog);
        if (startupWatchdog) clearTimeout(startupWatchdog);
        if (forcedExitTimer) clearTimeout(forcedExitTimer);
        signal?.removeEventListener('abort', onAbort);
        if (result.kind !== 'response') failReady(result.detail);
        else if (result.response.type === 'error') failReady(result.response.message);
        if (releaseRequested && result.kind !== 'response') {
          // Close only our control endpoint. Native EOF cleanup/release remains authoritative; never claim cleanup here.
          try { child?.stdin.end(); } catch (_error) { /* structured UNKNOWN already retained */ }
        }
        resolve(result);
      };
      const onInputFailure = () => {
        if (inputFailed) return;
        inputFailed = true;
        // Keep this listener after settlement: an already queued stream error
        // must not escape into Electron's uncaught-exception handler.
        if (settled) return;
        if (releaseRequested) {
          finish({ kind: 'helper_crashed', detail: 'A9_RELEASE_UNKNOWN', cleanupConfirmed: false });
          return;
        }
        streamFailure = streamFailure ?? 'A9_HELPER_CONTROL_PIPE_FAILED';
        cancelRequested = true;
        cancellationEscalated = true;
        if (watchdog) clearTimeout(watchdog);
        if (startupWatchdog) clearTimeout(startupWatchdog);
        if (forcedExitTimer) clearTimeout(forcedExitTimer);
        forcedExitTimer = setTimeout(() => finish({
          kind: 'helper_crashed', detail: streamFailure!, cleanupConfirmed: false,
        }), 5_000);
        child?.kill();
      };
      const onAbort = () => {
        if (cancelRequested || settled) return;
        if (releaseRequested) { finish({ kind: 'helper_crashed', detail: 'A9_RELEASE_UNKNOWN', cleanupConfirmed: false }); return; }
        cancelRequested = true;
        const control = protocolVersion >= 2
          ? { schemaVersion: protocolVersion, type: 'cancel', requestId: request.requestId }
          : { schema_version: 1, type: 'cancel', requestId: request.requestId };
        try {
          child?.stdin.end(`${JSON.stringify(control)}\n`, 'utf8');
        } catch (_error) {
          onInputFailure();
        }
        if (inputFailed || settled) return;
        forcedExitTimer = setTimeout(() => {
          cancellationEscalated = true;
          child?.kill();
          forcedExitTimer = setTimeout(() => finish({
            kind: 'cancelled', detail: 'Helper did not acknowledge cooperative cancellation', cleanupConfirmed: false,
          }), 5_000);
        }, 5_000);
      };

      const armRuntimeWatchdog = () => {
        const timeoutMs = 'schemaVersion' in request
          ? request.deadlineMode === 'fixed' ? request.timeoutMs : undefined
          : request.timeoutMs;
        if (timeoutMs === undefined) return;
        watchdog = setTimeout(() => {
          forcedExit = 'watchdog_timeout';
          child?.kill();
          forcedExitTimer = setTimeout(() => finish({
            kind: 'watchdog_timeout', detail: 'Helper did not close after watchdog termination', cleanupConfirmed: false,
          }), 5_000);
        }, timeoutMs + 15_000);
      };

      const acceptMessage = (line: string) => {
        if (settled) return;
        let message: NativeHelperMessage;
        try {
          message = parseNativeHelperResponse(line, request.requestId, protocolVersion);
        } catch (error) {
          if (protocolVersion === 3) { failStream('A9_OUTPUT_PROTOCOL_ERROR'); return; }
          child?.kill();
          finish({ kind: 'helper_crashed', detail: String(error), cleanupConfirmed: false });
          return;
        }
        if (message.type === 'execution_started') {
          if (protocolVersion < 2 || readySeen || finalResponse) {
            if (protocolVersion === 3) { failStream('A9_OUTPUT_PROTOCOL_ORDER'); return; }
            child?.kill();
            finish({ kind: 'helper_crashed', detail: 'Helper readiness message order is invalid', cleanupConfirmed: false });
            return;
          }
          readySeen = true;
          if (startupWatchdog) clearTimeout(startupWatchdog);
          readyChildPid = message.childPid;
          hooks.onStarted?.(message);
          return;
        }
        if (message.type === 'output_chunk' || message.type === 'output_truncated') {
          if (!readySeen || finalResponse) { failStream('A9_OUTPUT_PROTOCOL_ORDER'); return; }
          const stream = message.stream;
          if (message.type === 'output_chunk') {
            const cap = 'schemaVersion' in request ? (stream === 'stdout' ? request.maxStdoutBytes : request.maxStderrBytes) : 0;
            if (message.seq !== outputSeq + 1 || message.streamOffset !== offsets[stream] || truncated[stream]
              || chunks[stream] >= 4096 || offsets[stream] + message.byteLength > cap) { failStream('A9_OUTPUT_PROTOCOL_SEQUENCE'); return; }
            outputSeq = message.seq; offsets[stream] += message.byteLength; chunks[stream]++;
          } else {
            if (truncated[stream]) { failStream('A9_OUTPUT_PROTOCOL_TRUNCATION'); return; }
            const cap = 'schemaVersion' in request ? (stream === 'stdout' ? request.maxStdoutBytes : request.maxStderrBytes) : 0;
            if ((message.reason === 'event_limit' && chunks[stream] < 4096) || (message.reason === 'byte_limit' && offsets[stream] < cap)) { failStream('A9_OUTPUT_PROTOCOL_TRUNCATION'); return; }
            truncated[stream] = true;
          }
          if (!streamFailure) {
            const outputMessage = message;
            const size = Buffer.byteLength(line);
            if (queuedBytes + size > 256 * 1024) { failStream('A9_OUTPUT_BACKPRESSURE'); return; }
            queuedBytes += size;
            delivery = delivery.then(async () => {
              if (!streamFailure && !settled) await onOutput?.(outputMessage);
            }).catch(() => failStream('A9_OUTPUT_AUDIT_OR_CONSUMER_FAILED')).then(() => { queuedBytes -= size; });
          }
          return;
        }
        if (message.type === 'execution_result' && 'schemaVersion' in message && message.schemaVersion === 3) {
          if (!readySeen || message.lastOutputSeq !== outputSeq || message.stdout.emittedBytes !== offsets.stdout
            || message.stderr.emittedBytes !== offsets.stderr || message.outputTruncated !== (truncated.stdout || truncated.stderr)
            || (!truncated.stdout && message.stdout.omittedBytes !== 0) || (!truncated.stderr && message.stderr.omittedBytes !== 0)) {
            failStream('A9_OUTPUT_PROTOCOL_COUNTS'); return;
          }
        }
        if (message.type === 'execution_released') {
          if (!readySeen || !releaseRequested || message.releaseId !== releaseRequested || message.childPid !== readyChildPid
            || message.lastOutputSeq !== outputSeq || message.stdout.emittedBytes !== offsets.stdout || message.stderr.emittedBytes !== offsets.stderr
            || (!truncated.stdout && message.stdout.omittedBytes !== 0) || (!truncated.stderr && message.stderr.omittedBytes !== 0)) {
            failStream('A9_RELEASE_PROTOCOL_ERROR'); return;
          }
        }
        if (finalResponse) {
          child?.kill();
          finish({ kind: 'helper_crashed', detail: 'Helper emitted more than one final response', cleanupConfirmed: false });
          return;
        }
        finalResponse = message;
      };

      try {
        child = spawn(this.helperPath, [], {
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          // v1 keeps its historical contract. v2 uses the caller's filtered
          // snapshot without merging the original process environment back in.
          ...(protocolVersion >= 2 ? { env: createTrustedShellEnvironment(environment ?? process.env, {}) } : {}),
        });
        hooks.onSpawn?.(child.pid);
      } catch (error) {
        finish({ kind: 'spawn_failed', detail: String(error), cleanupConfirmed: true });
        return;
      }
      child.once('error', (error) => finish(child?.pid
        ? { kind: 'helper_crashed', detail: streamFailure ?? 'A9_HELPER_PROCESS_FAILED', cleanupConfirmed: false }
        : { kind: 'spawn_failed', detail: String(error), cleanupConfirmed: true }));
      child.stdin.on('error', onInputFailure);
      child.stdout.on('data', (chunk: Buffer) => {
        if (protocolVersion !== 3) stdout = Buffer.concat([stdout, chunk]);
        pendingLine = Buffer.concat([pendingLine, chunk]);
        if (protocolVersion === 3 && pendingLine.length > 256 * 1024) { failStream('A9_OUTPUT_BACKPRESSURE'); pendingLine = Buffer.alloc(0); return; }
        if (stdout.length > this.protocolOutputLimit) {
          child?.kill();
          finish({ kind: 'helper_crashed', detail: 'Helper protocol output exceeded its hard limit', cleanupConfirmed: false });
          return;
        }
        while (true) {
          const newline = pendingLine.indexOf(0x0A);
          if (newline < 0) break;
          let lineBytes = pendingLine.subarray(0, newline);
          pendingLine = pendingLine.subarray(newline + 1);
          if (lineBytes.length > 0 && lineBytes[lineBytes.length - 1] === 0x0D) {
            lineBytes = lineBytes.subarray(0, lineBytes.length - 1);
          }
          if (protocolVersion === 3 && lineBytes.length > 32768) { failStream('A9_OUTPUT_FRAME_LIMIT'); continue; }
          try { if (lineBytes.length > 0) acceptMessage(new TextDecoder('utf-8', { fatal: true }).decode(lineBytes)); }
          catch (_error) { failStream('A9_OUTPUT_PROTOCOL_ENCODING'); }
        }
        if (protocolVersion === 3 && pendingLine.length > 32768) { failStream('A9_OUTPUT_FRAME_LIMIT'); pendingLine = Buffer.alloc(0); }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 64 * 1024) stderr = Buffer.concat([stderr, chunk]).subarray(0, 64 * 1024);
      });
      child.once('close', async (code) => {
        if (settled) return;
        if (protocolVersion === 3 && pendingLine.length > 0) failStream('A9_OUTPUT_MISSING_LF');
        if (protocolVersion !== 3 && pendingLine.length > 0) acceptMessage(pendingLine.toString('utf8').replace(/\r$/, ''));
        if (settled) return;
        await Promise.race([delivery, new Promise<void>((done) => { const timer = setTimeout(() => { failStream('A9_OUTPUT_BACKPRESSURE'); done(); }, 5000); delivery.finally(() => clearTimeout(timer)); })]);
        if (streamFailure) {
          finish({ kind: 'helper_crashed', detail: streamFailure, cleanupConfirmed: code === 0 && !!finalResponse && finalResponse.type === 'execution_result' && hasCompleteHelperCleanupProof(finalResponse) }); return;
        }
        if (forcedExit === 'watchdog_timeout') {
          finish({ kind: 'watchdog_timeout', detail: 'Helper required watchdog termination', cleanupConfirmed: false });
          return;
        }
        if (cancellationEscalated) {
          finish({ kind: 'cancelled', detail: 'Helper required forced termination during cancellation', cleanupConfirmed: false });
          return;
        }
        if (code !== 0 || !finalResponse ||
            (protocolVersion >= 2 && finalResponse.type === 'execution_result' && !readySeen) ||
            (protocolVersion === 1 && readySeen)) {
          finish({ kind: 'helper_crashed', detail: protocolVersion === 3 ? 'A9_OUTPUT_HELPER_MISSING_TERMINAL' : `Helper exited ${code}: ${stderr.toString('utf8')}`, cleanupConfirmed: false });
          return;
        }
        if (cancelRequested && (finalResponse.type !== 'execution_result' || finalResponse.canceled !== true)) {
          finish({ kind: 'cancelled', detail: 'Helper response did not acknowledge cancellation', cleanupConfirmed: false });
          return;
        }
        finish({ kind: 'response', response: finalResponse });
      });

      if (protocolVersion >= 2) {
        startupWatchdog = setTimeout(() => {
          child?.kill();
          finish({ kind: 'watchdog_timeout', detail: 'Helper did not prove execution readiness', cleanupConfirmed: false });
        }, this.startupTimeoutMs);
      }
      hooks.bindRelease?.((releaseId) => {
        if (protocolVersion !== 3 || !('managed' in request) || request.managed !== true || !readySeen || settled
          || finalResponse || cancelRequested || releaseRequested || streamFailure || !/^[a-zA-Z0-9_-]{1,128}$/.test(releaseId)) {
          throw new Error('A9_RELEASE_STATE_INVALID');
        }
        releaseRequested = releaseId;
        try {
          child!.stdin.write(`${JSON.stringify({ schemaVersion: 3, type: 'release', requestId: request.requestId, releaseId })}\n`, 'utf8');
        } catch (_error) { onInputFailure(); }
        if (settled) return;
        forcedExitTimer = setTimeout(() => finish({ kind: 'helper_crashed', detail: 'A9_RELEASE_UNKNOWN', cleanupConfirmed: false }), 10_000);
      });
      armRuntimeWatchdog();
      signal?.addEventListener('abort', onAbort, { once: true });
      try { child.stdin.write(`${JSON.stringify(request)}\n`, 'utf8'); }
      catch (_error) { onInputFailure(); }
      if (signal?.aborted) onAbort();
    });
  }
}
