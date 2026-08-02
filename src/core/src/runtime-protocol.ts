/** Replaceable command/event facade for CLI and desktop clients. */
import { AgentError, AgentErrorCode } from './errors';
import { RuntimeRequest, RuntimeResult } from './runtime';

export interface RuntimeRunner {
  run(request: RuntimeRequest): Promise<RuntimeResult>;
}

export interface RuntimeEventSubscription<TEvent = unknown> {
  readonly id: string;
  drain(): readonly TEvent[];
  unsubscribe(): void;
}

export interface RuntimeEventSource<TEvent = unknown> {
  subscribe(maxPending?: number): RuntimeEventSubscription<TEvent>;
}

/**
 * Structural port implemented by GitSessionGuard without creating a package
 * dependency from Core to Git Adapter.
 */
export interface RuntimeSessionSafetyPort<TBaseline = unknown, TInspection = unknown> {
  begin(sessionId: string, workDir: string): Promise<TBaseline>;
  inspect(baseline: TBaseline): Promise<TInspection>;
}

export interface RuntimeSessionSafetyEvidence<TBaseline = unknown, TInspection = unknown> {
  baselineCreated: boolean;
  baseline: TBaseline;
  inspection: TInspection;
}

export type RuntimeProtocolResult<TBaseline = unknown, TInspection = unknown> =
  RuntimeResult & {
    sessionSafety?: RuntimeSessionSafetyEvidence<TBaseline, TInspection>;
  };

export type RuntimeSubmission =
  | { readonly kind: 'turn.run'; readonly request: RuntimeRequest }
  | { readonly kind: 'turn.resume'; readonly request: RuntimeRequest }
  | { readonly kind: 'turn.cancel'; readonly runId: string };

export interface RuntimeCancelAcknowledgement {
  readonly runId: string;
  readonly accepted: boolean;
}

/**
 * SQ/EQ protocol: all commands enter through submit(), while each UI/CLI
 * consumer owns an independent event subscription supplied by State V2.
 */
export class AgentRuntimeProtocol<
  TEvent = unknown,
  TBaseline = unknown,
  TInspection = unknown,
> {
  private readonly activeRuns = new Map<string, AbortController>();
  private readonly activeRunsBySession = new Map<string, number>();
  private readonly safetySessions = new Map<string, { workDir: string; baseline: TBaseline }>();
  private readonly pendingSafetySessions =
    new Map<string, Promise<{ workDir: string; baseline: TBaseline; created: boolean }>>();

  constructor(
    private readonly runner: RuntimeRunner,
    private readonly events: RuntimeEventSource<TEvent>,
    private readonly sessionSafety?: RuntimeSessionSafetyPort<TBaseline, TInspection>,
  ) {}

  submit(submission: Extract<RuntimeSubmission, { kind: 'turn.cancel' }>): Promise<RuntimeCancelAcknowledgement>;
  submit(submission: Exclude<RuntimeSubmission, { kind: 'turn.cancel' }>): Promise<RuntimeProtocolResult<TBaseline, TInspection>>;
  async submit(submission: RuntimeSubmission): Promise<RuntimeProtocolResult<TBaseline, TInspection> | RuntimeCancelAcknowledgement> {
    if (submission.kind === 'turn.cancel') {
      const controller = this.activeRuns.get(submission.runId);
      controller?.abort();
      return { runId: submission.runId, accepted: controller !== undefined };
    }

    const { request } = submission;
    if (this.activeRuns.has(request.runId)) {
      throw new AgentError(
        AgentErrorCode.RUNTIME_INPUT_INVALID,
        `Run is already active: ${request.runId}`,
        { runId: request.runId },
      );
    }
    const controller = new AbortController();
    const relayAbort = (): void => controller.abort();
    if (request.abortSignal?.aborted) controller.abort();
    else request.abortSignal?.addEventListener('abort', relayAbort, { once: true });
    this.activeRuns.set(request.runId, controller);
    this.activeRunsBySession.set(
      request.sessionId,
      (this.activeRunsBySession.get(request.sessionId) ?? 0) + 1,
    );
    try {
      if (
        request.contextBootstrap?.environment.git.repository &&
        !this.sessionSafety
      ) {
        throw new AgentError(
          AgentErrorCode.RUNTIME_INPUT_INVALID,
          'Git repository Turn requires a configured SessionSafetyPort',
          {
            sessionId: request.sessionId,
            workDir: request.contextBootstrap.environment.cwd,
          },
          '在产品组合根注入 GitSessionGuard；无法建立会话基线时不得启动 Turn。',
        );
      }
      // Preserve the original synchronous hand-off to runner when no Git
      // safety port is configured, so an immediate cancel cannot race ahead
      // of the runner's AbortSignal listener registration.
      const safety = this.sessionSafety
        ? await this.ensureSessionSafety(request)
        : undefined;
      const runtimeResult = await this.runner.run({ ...request, abortSignal: controller.signal });
      if (!safety || !this.sessionSafety) return runtimeResult;
      const inspection = await this.sessionSafety.inspect(safety.baseline);
      return {
        ...runtimeResult,
        sessionSafety: {
          baselineCreated: safety.created,
          baseline: safety.baseline,
          inspection,
        },
      };
    } finally {
      request.abortSignal?.removeEventListener('abort', relayAbort);
      this.activeRuns.delete(request.runId);
      const remaining = (this.activeRunsBySession.get(request.sessionId) ?? 1) - 1;
      if (remaining > 0) this.activeRunsBySession.set(request.sessionId, remaining);
      else this.activeRunsBySession.delete(request.sessionId);
    }
  }

  /** Inspect and release one session baseline after the product closes it. */
  async closeSession(sessionId: string): Promise<TInspection | undefined> {
    if ((this.activeRunsBySession.get(sessionId) ?? 0) > 0) {
      throw new AgentError(
        AgentErrorCode.RUNTIME_INPUT_INVALID,
        `Cannot close Session ${sessionId} while a Run is active`,
        { sessionId },
        '先取消或等待当前 Run 结束，再关闭 Session 并检查最终 diff。',
      );
    }
    const safety = this.safetySessions.get(sessionId);
    if (!safety || !this.sessionSafety) return undefined;
    const inspection = await this.sessionSafety.inspect(safety.baseline);
    this.safetySessions.delete(sessionId);
    return inspection;
  }

  subscribe(maxPending?: number): RuntimeEventSubscription<TEvent> {
    return this.events.subscribe(maxPending);
  }

  private async ensureSessionSafety(request: RuntimeRequest): Promise<{
    workDir: string;
    baseline: TBaseline;
    created: boolean;
  } | undefined> {
    if (!this.sessionSafety) return undefined;
    const environment = request.contextBootstrap?.environment;
    if (!environment?.git.repository) return undefined;
    const workDir = environment.cwd;
    const existing = this.safetySessions.get(request.sessionId);
    if (existing) {
      this.assertSessionWorkDir(request.sessionId, existing.workDir, workDir);
      return { ...existing, created: false };
    }
    const pending = this.pendingSafetySessions.get(request.sessionId);
    if (pending) {
      const opened = await pending;
      this.assertSessionWorkDir(request.sessionId, opened.workDir, workDir);
      return { ...opened, created: false };
    }
    const opening = this.sessionSafety.begin(request.sessionId, workDir)
      .then((baseline) => {
        const opened = { workDir, baseline };
        this.safetySessions.set(request.sessionId, opened);
        return { ...opened, created: true };
      })
      .finally(() => {
        this.pendingSafetySessions.delete(request.sessionId);
      });
    this.pendingSafetySessions.set(request.sessionId, opening);
    return await opening;
  }

  private assertSessionWorkDir(
    sessionId: string,
    expected: string,
    received: string,
  ): void {
    if (expected !== received) {
      throw new AgentError(
        AgentErrorCode.RUNTIME_INPUT_INVALID,
        `Session ${sessionId} is already bound to a different Git workspace`,
        { expectedWorkDir: expected, receivedWorkDir: received },
        '为新的工作区创建独立 Session；不得复用既有 Git 基线。',
      );
    }
  }
}
