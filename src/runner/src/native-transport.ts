import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import {
  NativeHelperMessage,
  NativeHelperRequest,
  NativeHelperResponse,
  NativeHelperStartedResultV2,
  parseNativeHelperResponse,
} from './native-protocol';

export type HelperTransportResult =
  | { kind: 'response'; response: NativeHelperResponse }
  | { kind: 'spawn_failed' | 'helper_crashed' | 'cancelled' | 'watchdog_timeout'; detail: string; cleanupConfirmed: boolean };

export interface HelperTransport {
  invoke(request: NativeHelperRequest, signal?: AbortSignal): Promise<HelperTransportResult>;
  startManaged?(request: NativeHelperRequest): ManagedHelperInvocation;
}

export interface ManagedHelperInvocation {
  /** Helper PID is diagnostic only; managed process identity comes from ready.childPid. */
  pid?: number;
  ready: Promise<NativeHelperStartedResultV2>;
  completion: Promise<HelperTransportResult>;
  cancel(): void;
}

interface InvocationHooks {
  onSpawn?: (pid: number | undefined) => void;
  onStarted?: (started: NativeHelperStartedResultV2) => void;
  onReadyFailure?: (error: Error) => void;
}

/** One request per helper process. No shell and no inherited stdio. */
export class StdioHelperTransport implements HelperTransport {
  constructor(
    private readonly helperPath: string,
    private readonly protocolOutputLimit = 96 * 1024 * 1024,
    private readonly startupTimeoutMs = 15_000,
  ) {}

  invoke(request: NativeHelperRequest, signal?: AbortSignal): Promise<HelperTransportResult> {
    return this.invokeInternal(request, signal);
  }

  startManaged(request: NativeHelperRequest): ManagedHelperInvocation {
    if (!('schemaVersion' in request) || request.schemaVersion !== 2 || request.managed !== true) {
      throw new Error('Managed helper execution requires a protocol v2 managed request');
    }
    const controller = new AbortController();
    let pid: number | undefined;
    let resolveReady!: (value: NativeHelperStartedResultV2) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<NativeHelperStartedResultV2>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const completion = this.invokeInternal(request, controller.signal, {
      onSpawn: (spawnedPid) => { pid = spawnedPid; },
      onStarted: resolveReady,
      onReadyFailure: rejectReady,
    });
    return { pid, ready, completion, cancel: () => controller.abort() };
  }

  private invokeInternal(
    request: NativeHelperRequest,
    signal?: AbortSignal,
    hooks: InvocationHooks = {},
  ): Promise<HelperTransportResult> {
    const protocolVersion: 1 | 2 = 'schemaVersion' in request ? 2 : 1;
    return new Promise((resolve) => {
      let settled = false;
      let readySeen = false;
      let finalResponse: NativeHelperResponse | undefined;
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

      const failReady = (detail: string) => {
        if (!readySeen) hooks.onReadyFailure?.(new Error(detail));
      };
      const finish = (result: HelperTransportResult) => {
        if (settled) return;
        settled = true;
        if (watchdog) clearTimeout(watchdog);
        if (startupWatchdog) clearTimeout(startupWatchdog);
        if (forcedExitTimer) clearTimeout(forcedExitTimer);
        signal?.removeEventListener('abort', onAbort);
        if (result.kind !== 'response') failReady(result.detail);
        else if (result.response.type === 'error') failReady(result.response.message);
        resolve(result);
      };
      const onAbort = () => {
        if (cancelRequested || settled) return;
        cancelRequested = true;
        const control = protocolVersion === 2
          ? { schemaVersion: 2, type: 'cancel', requestId: request.requestId }
          : { schema_version: 1, type: 'cancel', requestId: request.requestId };
        try {
          child?.stdin.end(`${JSON.stringify(control)}\n`, 'utf8');
        } catch (_error) {
          cancellationEscalated = true;
          child?.kill();
        }
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
          child?.kill();
          finish({ kind: 'helper_crashed', detail: String(error), cleanupConfirmed: false });
          return;
        }
        if (message.type === 'execution_started') {
          if (protocolVersion !== 2 || readySeen || finalResponse) {
            child?.kill();
            finish({ kind: 'helper_crashed', detail: 'Helper readiness message order is invalid', cleanupConfirmed: false });
            return;
          }
          readySeen = true;
          if (startupWatchdog) clearTimeout(startupWatchdog);
          hooks.onStarted?.(message);
          return;
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
        });
        hooks.onSpawn?.(child.pid);
      } catch (error) {
        finish({ kind: 'spawn_failed', detail: String(error), cleanupConfirmed: true });
        return;
      }
      child.once('error', (error) => finish({ kind: 'spawn_failed', detail: String(error), cleanupConfirmed: true }));
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = Buffer.concat([stdout, chunk]);
        pendingLine = Buffer.concat([pendingLine, chunk]);
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
          if (lineBytes.length > 0) acceptMessage(lineBytes.toString('utf8'));
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 64 * 1024) stderr = Buffer.concat([stderr, chunk]).subarray(0, 64 * 1024);
      });
      child.once('close', (code) => {
        if (settled) return;
        if (pendingLine.length > 0) acceptMessage(pendingLine.toString('utf8').replace(/\r$/, ''));
        if (settled) return;
        if (forcedExit === 'watchdog_timeout') {
          finish({ kind: 'watchdog_timeout', detail: 'Helper required watchdog termination', cleanupConfirmed: false });
          return;
        }
        if (cancellationEscalated) {
          finish({ kind: 'cancelled', detail: 'Helper required forced termination during cancellation', cleanupConfirmed: false });
          return;
        }
        if (code !== 0 || !finalResponse ||
            (protocolVersion === 2 && finalResponse.type === 'execution_result' && !readySeen) ||
            (protocolVersion === 1 && readySeen)) {
          finish({ kind: 'helper_crashed', detail: `Helper exited ${code}: ${stderr.toString('utf8')}`, cleanupConfirmed: false });
          return;
        }
        if (cancelRequested && (finalResponse.type !== 'execution_result' || finalResponse.canceled !== true)) {
          finish({ kind: 'cancelled', detail: 'Helper response did not acknowledge cancellation', cleanupConfirmed: false });
          return;
        }
        finish({ kind: 'response', response: finalResponse });
      });

      if (protocolVersion === 2) {
        startupWatchdog = setTimeout(() => {
          child?.kill();
          finish({ kind: 'watchdog_timeout', detail: 'Helper did not prove execution readiness', cleanupConfirmed: false });
        }, this.startupTimeoutMs);
      }
      armRuntimeWatchdog();
      signal?.addEventListener('abort', onAbort, { once: true });
      child.stdin.write(`${JSON.stringify(request)}\n`, 'utf8');
      if (signal?.aborted) onAbort();
    });
  }
}
