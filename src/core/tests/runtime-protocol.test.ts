import {
  AgentRuntimeProtocol,
  RuntimeEventSource,
  RuntimeEventSubscription,
} from '../src/runtime-protocol';
import { RuntimeRequest, RuntimeResult } from '../src/runtime';
import { AgentState } from '../src/types';
import { TurnOutcome } from '../src/loop-control';

function request(): RuntimeRequest {
  return { sessionId: 's', threadId: 't', turnId: 'turn', taskId: 'task', runId: 'run', prompt: 'x', acceptance: { schemaVersion: '1.0', checks: [{ checkId: 'result', description: 'Result reviewed' }] }, contextItems: [], contextBudget: { maxTokens: 1, maxItems: 1, maxChars: 1 } };
}

function gitRequest(overrides: Partial<RuntimeRequest> = {}): RuntimeRequest {
  return {
    ...request(),
    contextBootstrap: {
      repoRoot: 'C:\\repo',
      cwd: 'C:\\repo',
      environment: {
        cwd: 'C:\\repo',
        targetOs: 'windows-7',
        shell: 'none',
        date: '2026-07-31',
        sandboxMode: 'workspace-write',
        approvalMode: 'workspace-write',
        git: { available: true, repository: true, branch: 'main', dirty: false },
      },
    },
    ...overrides,
  };
}

function result(): RuntimeResult {
  return { state: AgentState.CANCELLED, outcome: TurnOutcome.CANCELLED, context: { schemaVersion: '2.0', budget: { maxTokens: 1, maxItems: 1, maxChars: 1 }, included: [], omitted: [], usedTokens: 0, usedChars: 0, highWatermarkTokens: 1, outputReserveTokens: 1, watermarkExceeded: false, truncated: false, digestSha256: 'digest' }, traceComplete: true, toolResults: [], usage: { steps: 0, tokens: 0, toolCalls: 0, modelAttempts: 0, elapsedMs: 0 } };
}

class FakeEventSource implements RuntimeEventSource<string> {
  readonly subscriptions: Array<RuntimeEventSubscription<string>> = [];
  subscribe(): RuntimeEventSubscription<string> {
    const subscription = { id: `sub-${this.subscriptions.length + 1}`, drain: () => [] as string[], unsubscribe: () => undefined };
    this.subscriptions.push(subscription);
    return subscription;
  }
}

describe('AgentRuntimeProtocol', () => {
  it('provides independent subscriptions from the canonical event source', () => {
    const source = new FakeEventSource();
    const protocol = new AgentRuntimeProtocol({ run: async () => result() }, source);
    expect(protocol.subscribe().id).toBe('sub-1');
    expect(protocol.subscribe().id).toBe('sub-2');
  });

  it('submits a run and cancels it through the same command boundary', async () => {
    let observedSignal: AbortSignal | undefined;
    const protocol = new AgentRuntimeProtocol({
      run: async (input) => {
        observedSignal = input.abortSignal;
        await new Promise<void>((resolve) => input.abortSignal?.addEventListener('abort', () => resolve(), { once: true }));
        return result();
      },
    }, new FakeEventSource());

    const running = protocol.submit({ kind: 'turn.run', request: request() });
    const cancelled = await protocol.submit({ kind: 'turn.cancel', runId: 'run' });
    expect(cancelled).toEqual({ runId: 'run', accepted: true });
    expect(observedSignal?.aborted).toBe(true);
    await expect(running).resolves.toMatchObject({ outcome: TurnOutcome.CANCELLED });
  });

  it('rejects a duplicate active Run id', async () => {
    let release: (() => void) | undefined;
    const protocol = new AgentRuntimeProtocol({
      run: async () => {
        await new Promise<void>((resolve) => { release = resolve; });
        return result();
      },
    }, new FakeEventSource());
    const first = protocol.submit({ kind: 'turn.run', request: request() });
    await expect(protocol.submit({ kind: 'turn.resume', request: request() })).rejects.toMatchObject({ code: 'RUNTIME_INPUT_INVALID' });
    release?.();
    await first;
  });

  it('automatically opens and inspects one Git safety baseline per Session', async () => {
    const calls: string[] = [];
    const safety = {
      async begin(sessionId: string, workDir: string) {
        calls.push(`begin:${sessionId}:${workDir}`);
        return { sessionId, workDir, head: 'a'.repeat(40) };
      },
      async inspect(baseline: { head: string }) {
        calls.push(`inspect:${baseline.head}`);
        return { clean: true, diffBinary: '' };
      },
    };
    const protocol = new AgentRuntimeProtocol(
      { run: async () => result() },
      new FakeEventSource(),
      safety,
    );

    const first = await protocol.submit({ kind: 'turn.run', request: gitRequest() });
    const second = await protocol.submit({
      kind: 'turn.run',
      request: gitRequest({ runId: 'run-2', turnId: 'turn-2' }),
    });

    expect(first.sessionSafety).toMatchObject({ baselineCreated: true });
    expect(second.sessionSafety).toMatchObject({ baselineCreated: false });
    expect(calls.filter((call) => call.startsWith('begin:'))).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('inspect:'))).toHaveLength(2);
  });

  it('fails closed when a Git repository Turn omits the session safety port', async () => {
    const protocol = new AgentRuntimeProtocol(
      { run: async () => result() },
      new FakeEventSource(),
    );
    await expect(protocol.submit({
      kind: 'turn.run',
      request: gitRequest(),
    })).rejects.toMatchObject({
      code: 'RUNTIME_INPUT_INVALID',
      message: expect.stringContaining('SessionSafetyPort'),
    });
  });

  it('fails closed when one Session is reused for another Git workspace', async () => {
    const protocol = new AgentRuntimeProtocol(
      { run: async () => result() },
      new FakeEventSource(),
      {
        async begin(sessionId: string, workDir: string) {
          return { sessionId, workDir };
        },
        async inspect() {
          return { clean: true };
        },
      },
    );
    await protocol.submit({ kind: 'turn.run', request: gitRequest() });

    await expect(protocol.submit({
      kind: 'turn.run',
      request: gitRequest({
        runId: 'run-2',
        contextBootstrap: {
          ...gitRequest().contextBootstrap!,
          cwd: 'D:\\other',
          environment: {
            ...gitRequest().contextBootstrap!.environment,
            cwd: 'D:\\other',
          },
        },
      }),
    })).rejects.toMatchObject({
      code: 'RUNTIME_INPUT_INVALID',
      message: expect.stringContaining('different Git workspace'),
    });
  });

  it('inspects the final session diff before releasing the baseline', async () => {
    let inspections = 0;
    const protocol = new AgentRuntimeProtocol(
      { run: async () => result() },
      new FakeEventSource(),
      {
        async begin() {
          return { head: 'a'.repeat(40) };
        },
        async inspect() {
          inspections += 1;
          return { clean: inspections === 1 };
        },
      },
    );
    await protocol.submit({ kind: 'turn.run', request: gitRequest() });
    await expect(protocol.closeSession('s')).resolves.toEqual({ clean: false });
    await expect(protocol.closeSession('s')).resolves.toBeUndefined();
  });

  it('does not release a Git baseline while its Session still has an active Run', async () => {
    let release: (() => void) | undefined;
    const protocol = new AgentRuntimeProtocol(
      {
        async run() {
          await new Promise<void>((resolve) => { release = resolve; });
          return result();
        },
      },
      new FakeEventSource(),
      {
        async begin() {
          return { head: 'a'.repeat(40) };
        },
        async inspect() {
          return { clean: true };
        },
      },
    );
    const running = protocol.submit({ kind: 'turn.run', request: gitRequest() });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(protocol.closeSession('s')).rejects.toMatchObject({
      code: 'RUNTIME_INPUT_INVALID',
      message: expect.stringContaining('Run is active'),
    });
    release?.();
    await running;
  });
});
