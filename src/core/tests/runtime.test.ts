import {
  AgentRuntime,
  RuntimeEvent,
  RuntimeMessage,
  RuntimeModelInput,
  RuntimePlan,
  RuntimeRequest,
  RuntimeToolExecutor,
  RuntimeVerificationProvider,
  ToolExecutionResult,
} from '../src/runtime';
import { PolicyEngine } from '../src/policy';
import { ToolRegistry } from '../src/tools';
import { AgentState, ApprovalLevel, CapabilityToken } from '../src/types';
import { VerificationGate } from '../src/verification';
import { AgentErrorCode } from '../src/errors';
import { bindCapabilityToToolCall } from '../src/approval-binding';
import { TurnOutcome } from '../src/loop-control';

function createRequest(overrides: Partial<RuntimeRequest> = {}): RuntimeRequest {
  return {
    sessionId: 'session-1',
    threadId: 'thread-1',
    turnId: 'turn-1',
    taskId: 'task-1',
    runId: 'run-1',
    prompt: 'Find AgentRuntime',
    acceptance: {
      schemaVersion: '1.0',
      checks: [{ checkId: 'result-reviewed', description: 'Result was reviewed' }],
    },
    contextItems: [
      { id: 'instructions', kind: 'instruction', content: 'Read only', priority: 10 },
      { id: 'task', kind: 'task', content: 'Find AgentRuntime', priority: 9 },
    ],
    contextBudget: { maxTokens: 100, maxItems: 10, maxChars: 1000 },
    ...overrides,
  };
}

function readPlan(
  callId = 'call-1',
  args: Record<string, unknown> = { query: 'AgentRuntime' },
): RuntimePlan {
  return {
    schemaVersion: '1.0',
    summary: 'Search source',
    toolCalls: [{
      call: {
        id: callId,
        toolName: 'code.search',
        args,
        approvalLevel: ApprovalLevel.READ_ONLY,
      },
    }],
    verificationRequirements: [{
      checkId: 'result-reviewed',
      description: 'Search result was reviewed',
    }],
    usage: { inputTokens: 5, outputTokens: 5 },
  };
}

function writePlan(callId = 'write-1'): RuntimePlan {
  return {
    schemaVersion: '1.0',
    summary: 'Write source',
    toolCalls: [{
      call: {
        id: callId,
        toolName: 'fs.writeFile',
        args: { path: 'a.ts', content: 'x' },
        approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
        approvalContext: {
          previewSha256: 'preview-sha',
          baselineSha256: 'baseline-sha',
        },
      },
    }],
    verificationRequirements: [{
      checkId: 'result-reviewed',
      description: 'Write result was reviewed',
    }],
    usage: { inputTokens: 4, outputTokens: 4 },
  };
}

function finalPlan(content = 'Done'): RuntimePlan {
  return {
    schemaVersion: '1.0',
    summary: content,
    finalResponse: content,
    toolCalls: [],
    verificationRequirements: [{
      checkId: 'result-reviewed',
      description: 'Result was reviewed',
    }],
    usage: { inputTokens: 3, outputTokens: 2 },
  };
}

function summaryPlan(content = 'Progress saved'): RuntimePlan {
  return {
    schemaVersion: '1.0',
    summary: content,
    finalResponse: content,
    toolCalls: [],
    verificationRequirements: [],
    usage: { inputTokens: 1, outputTokens: 2 },
  };
}

function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    schemaVersion: '2.0',
    name: 'code.search',
    description: 'Search source',
    approvalLevel: ApprovalLevel.READ_ONLY,
    capability: 'code.search',
    inputSchema: {
      properties: {
        query: { type: 'string', description: 'Source text to search for.' },
        mode: {
          type: 'string',
          description: 'Search interpretation mode.',
          enum: ['literal', 'regex'],
          default: 'literal',
        },
      },
      required: ['query'],
    },
  });
  registry.register({
    schemaVersion: '2.0',
    name: 'fs.writeFile',
    description: 'Write one workspace file',
    approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
    capability: 'workspace_write',
    inputSchema: {
      properties: {
        path: { type: 'string', description: 'Workspace-relative target path.' },
        content: { type: 'string', description: 'Complete replacement content.' },
      },
      required: ['path', 'content'],
    },
  });
  return registry;
}

interface HarnessOptions {
  plans?: RuntimePlan[];
  model?: (input: RuntimeModelInput, callIndex: number) => Promise<RuntimePlan>;
  executor?: RuntimeToolExecutor;
  verifier?: RuntimeVerificationProvider;
  eventAppend?: (
    event: RuntimeEvent,
    appendIndex: number,
  ) => void | { seq: number } | Promise<void | { seq: number }>;
  toolResult?: ToolExecutionResult;
  verificationStatus?: 'passed' | 'failed' | 'unavailable';
  policy?: PolicyEngine;
  loopDetectorThreshold?: number;
  monotonicMs?: () => number;
  modelRetry?: { maxAttempts: number; baseDelayMs: number };
  projectedMessages?: readonly unknown[];
  disableMessageProjector?: boolean;
  compactContext?: (input: {
    request: RuntimeRequest;
    messages: readonly RuntimeMessage[];
    error: unknown;
  }) => Promise<{
    messages: readonly RuntimeMessage[];
    compactionId: string;
    replacedSeqRange: { fromSeq: number; toSeq: number };
    summary: unknown;
  }>;
}

function createHarness(options: HarnessOptions = {}) {
  const events: RuntimeEvent[] = [];
  const modelInputs: RuntimeModelInput[] = [];
  const executorCalls: string[] = [];
  const plans = options.plans ?? [readPlan(), finalPlan()];
  let modelCallIndex = 0;
  let eventAppendIndex = 0;
  const executor: RuntimeToolExecutor = options.executor ?? {
    async execute(_spec, call) {
      executorCalls.push(call.id);
      return options.toolResult ?? {
        callId: call.id,
        toolName: call.toolName,
        success: true,
        status: 'succeeded',
        output: ['src/core/src/runtime.ts'],
      };
    },
  };
  const runtime = new AgentRuntime({
    model: {
      async createPlan(input) {
        modelInputs.push(input);
        const index = modelCallIndex;
        modelCallIndex += 1;
        if (options.model) return options.model(input, index);
        if (input.toolChoice === 'none') return summaryPlan();
        return plans[Math.min(index, plans.length - 1)];
      },
    },
    tools: createRegistry(),
    executor,
    policy: options.policy ?? new PolicyEngine(),
    verifier: options.verifier ?? {
      async collect({ acceptance }) {
        return acceptance.checks.map((requirement) => ({
          checkId: requirement.checkId,
          status: options.verificationStatus ?? 'passed',
          complete: true,
          summary: 'reviewed',
          source: 'mock verifier',
          timestamp: '2026-07-30T00:00:00.000Z',
        }));
      },
    },
    verificationGate: new VerificationGate(
      () => new Date('2026-07-30T00:00:00.000Z'),
    ),
    events: {
      async append(event) {
        const appendIndex = eventAppendIndex;
        eventAppendIndex += 1;
        const receipt = await options.eventAppend?.(event, appendIndex);
        events.push(event);
        return receipt;
      },
    },
    ...(!options.disableMessageProjector
      ? {
        messageProjector: {
          projectMessages: () => options.projectedMessages ?? projectRuntimeMessages(events),
        },
      }
      : {}),
    modelRetry: options.modelRetry ?? { maxAttempts: 3, baseDelayMs: 0 },
    compactContext: options.compactContext,
    loopDetectorThreshold: options.loopDetectorThreshold,
    monotonicMs: options.monotonicMs,
    now: () => new Date('2026-07-30T00:00:00.000Z'),
  });
  return {
    runtime,
    events,
    modelInputs,
    executorCalls,
    get modelCallCount() {
      return modelCallIndex;
    },
  };
}

function projectRuntimeMessages(events: readonly RuntimeEvent[]): RuntimeMessage[] {
  const messages: RuntimeMessage[] = [];
  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;
    if (event.type === 'turn.started' && typeof payload.prompt === 'string') {
      messages.push({ role: 'user', content: payload.prompt });
    } else if (event.type === 'model.plan') {
      const plan = payload.plan as RuntimePlan;
      messages.push({
        role: 'assistant',
        content: plan.finalResponse ?? plan.summary,
        ...(plan.toolCalls.length > 0
          ? { toolCalls: plan.toolCalls.map(({ call }) => ({ ...call, args: { ...call.args } })) }
          : {}),
      });
    } else if (event.type === 'tool.result') {
      const result = payload as unknown as ToolExecutionResult;
      messages.push({ role: 'tool', toolCallId: result.callId, content: JSON.stringify(result) });
    }
  }
  return messages;
}

describe('AgentRuntime production Agent Loop', () => {
  it('uses the event projection instead of a supplied message snapshot', async () => {
    const harness = createHarness({
      plans: [finalPlan()],
      projectedMessages: [{ role: 'assistant', content: 'projected fact' }],
    });
    await harness.runtime.run(createRequest({
      previousMessages: [{ role: 'assistant', content: 'stale snapshot' }],
    }));

    expect(harness.modelInputs[0].messages).toEqual([
      { role: 'system', content: 'Read only' },
      { role: 'user', content: 'Find AgentRuntime' },
      { role: 'assistant', content: 'projected fact' },
      { role: 'user', content: 'Find AgentRuntime' },
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('<working_memory revision="0">'),
      }),
    ]);
    expect(harness.modelInputs[0]).not.toHaveProperty('request');
    expect(harness.modelInputs[0].run).toEqual({
      sessionId: 'session-1', threadId: 'thread-1', turnId: 'turn-1', taskId: 'task-1', runId: 'run-1',
    });
  });

  it('runs model -> tool -> model and completes only after verification', async () => {
    const harness = createHarness();
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.state).toBe(AgentState.COMPLETED);
    expect(result.traceComplete).toBe(true);
    expect(result.finalResponse).toBe('Done');
    expect(result.evidenceBundle).toMatchObject({ passed: true });
    expect(harness.modelInputs).toHaveLength(2);
    expect(harness.modelInputs[1].messages.at(-3)).toMatchObject({
      role: 'assistant',
      toolCalls: [expect.objectContaining({ id: 'call-1' })],
    });
    expect(harness.modelInputs[1].messages.at(-2)).toMatchObject({
      role: 'tool',
      toolCallId: 'call-1',
    });
    expect(harness.events.map((event) => event.sequence))
      .toEqual(harness.events.map((_event, index) => index + 1));
    expect(harness.events.every((event) => event.turnId === 'turn-1')).toBe(true);
    const transitions = harness.events
      .filter((event) => event.type === 'state.transition')
      .map((event) => (event.payload as { to: AgentState }).to);
    expect(transitions).toEqual([
      AgentState.PLANNING,
      AgentState.EXECUTING,
      AgentState.VERIFYING,
      AgentState.COMPLETED,
    ]);
  });

  it('pauses plan mode before the first tool and resumes only after explicit approval', async () => {
    const harness = createHarness();
    const first = await harness.runtime.run(createRequest({ executionMode: 'plan' }));

    expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(first.state).toBe(AgentState.AWAITING_APPROVAL);
    expect(first.checkpoint).toBeDefined();
    expect(harness.executorCalls).toHaveLength(0);
    expect(harness.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'approval.requested',
        payload: expect.objectContaining({ approvalKind: 'execution_plan' }),
      }),
    ]));

    const resumed = await harness.runtime.run(createRequest({
      executionMode: 'plan',
      resumeCheckpoint: first.checkpoint,
      planApprovalDecision: 'approved',
    }));

    expect(resumed.outcome).toBe(TurnOutcome.COMPLETED);
    expect(harness.executorCalls).toEqual(['call-1']);
    expect(harness.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'approval.resolved',
        payload: expect.objectContaining({
          approvalKind: 'execution_plan', resolution: 'approved',
        }),
      }),
    ]));
  });

  it('rejects a plan without starting any tool', async () => {
    const harness = createHarness();
    const first = await harness.runtime.run(createRequest({ executionMode: 'plan' }));
    const rejected = await harness.runtime.run(createRequest({
      executionMode: 'plan',
      resumeCheckpoint: first.checkpoint,
      planApprovalDecision: 'rejected',
    }));

    expect(rejected.outcome).toBe(TurnOutcome.CANCELLED);
    expect(harness.executorCalls).toHaveLength(0);
    expect(harness.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'approval.resolved',
        payload: expect.objectContaining({
          approvalKind: 'execution_plan', resolution: 'rejected',
        }),
      }),
    ]));
  });

  it('applies agent.update_plan internally and recites the new revision at the tail', async () => {
    const updatePlan: RuntimePlan = {
      schemaVersion: '1.0',
      summary: 'Update plan',
      toolCalls: [{
        call: {
          id: 'wm-1',
          toolName: 'agent.update_plan',
          approvalLevel: ApprovalLevel.READ_ONLY,
          args: {
            expectedRevision: 0,
            plan: ['[x] inspect', '[ ] verify'],
            currentStep: 'verify',
            findings: ['runtime is bounded'],
          },
        },
      }],
      verificationRequirements: [],
    };
    const harness = createHarness({ plans: [updatePlan, finalPlan()] });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(harness.executorCalls).toHaveLength(0);
    expect(result.toolResults[0]).toMatchObject({
      toolName: 'agent.update_plan',
      status: 'succeeded',
    });
    expect(harness.modelInputs[1].messages.at(-1)?.content)
      .toContain('<working_memory revision="1">');
    expect(harness.modelInputs[1].messages.at(-1)?.content)
      .toContain('current_step: verify');
    expect(harness.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'working_memory.updated' }),
    ]));
  });

  it('keeps goal and protected constraints in tail working memory across 24 steps', async () => {
    const harness = createHarness({
      model: async (input, callIndex) => {
        const tail = input.messages.at(-1)?.content ?? '';
        expect(tail).toContain('goal: Finish a 24-step migration');
        expect(tail).toContain('Never change the database schema');
        expect(tail).toContain(`<working_memory revision="${callIndex}">`);
        if (callIndex === 24) return finalPlan('24-step task completed');
        return {
          schemaVersion: '1.0',
          summary: `Update step ${callIndex + 1}`,
          toolCalls: [{
            call: {
              id: `wm-${callIndex + 1}`,
              toolName: 'agent.update_plan',
              approvalLevel: ApprovalLevel.READ_ONLY,
              args: {
                expectedRevision: callIndex,
                plan: [
                  ...Array.from({ length: callIndex + 1 }, (_value, index) => `[x] step ${index + 1}`),
                  ...Array.from({ length: 23 - callIndex }, (_value, index) => `[ ] step ${callIndex + index + 2}`),
                ],
                currentStep: `step ${callIndex + 1}`,
                findings: [`completed ${callIndex} prior steps`],
              },
            },
          }],
          verificationRequirements: [],
        };
      },
    });
    const result = await harness.runtime.run(createRequest({
      prompt: 'Finish a 24-step migration',
      contextItems: [{
        id: 'hard-constraint',
        kind: 'instruction',
        content: 'Never change the database schema',
        priority: 100,
        protection: 'protected',
        placement: 'stable_prefix',
      }],
      contextBudget: {
        maxTokens: 20_000,
        maxItems: 20,
        maxChars: 100_000,
      },
    }));

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.usage.steps).toBe(25);
    expect(result.toolResults).toHaveLength(24);
    expect(harness.modelInputs).toHaveLength(25);
    expect(harness.executorCalls).toHaveLength(0);
  });

  it('executes a normalized tool call with schema defaults applied', async () => {
    let executedArgs: Record<string, unknown> | undefined;
    const harness = createHarness({
      executor: {
        async execute(_spec, call) {
          executedArgs = call.args;
          return {
            callId: call.id,
            toolName: call.toolName,
            success: true,
            status: 'succeeded',
            output: [],
          };
        },
      },
    });

    const result = await harness.runtime.run(createRequest());
    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(executedArgs).toEqual({
      query: 'AgentRuntime',
      mode: 'literal',
    });
  });

  it('feeds a failed verification gate back to the model and trips only after three failures', async () => {
    const harness = createHarness({ verificationStatus: 'failed' });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.FAILED);
    expect(result.state).toBe(AgentState.FAILED);
    expect(result.evidenceBundle?.passed).toBe(false);
    expect(result.error?.code).toBe(AgentErrorCode.VERIFICATION_STUCK);
    expect(result.error?.context).toMatchObject({ gateId: 'result-reviewed', attempts: 3 });
    expect((result.error?.context.failureHistory as unknown[])).toHaveLength(3);
    expect(harness.events.filter((event) => event.type === 'verification.feedback')).toHaveLength(3);
    expect(harness.modelInputs[2].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('repair attempt 1/3'),
      }),
    ]));
  });

  it('rejects a missing trusted acceptance contract before invoking the model or tools', async () => {
    const harness = createHarness();
    const request = createRequest();
    delete (request as Partial<RuntimeRequest>).acceptance;

    await expect(harness.runtime.run(request)).rejects.toMatchObject({
      code: AgentErrorCode.RUNTIME_INPUT_INVALID,
      message: expect.stringContaining('TaskAcceptance'),
    });
    expect(harness.modelCallCount).toBe(0);
    expect(harness.executorCalls).toHaveLength(0);
  });

  it('uses request-side acceptance rather than model-suggested verification requirements', async () => {
    const plan = finalPlan();
    plan.verificationRequirements = [{ checkId: 'model-only', description: 'Model suggestion' }];
    const seenCheckIds: string[][] = [];
    const harness = createHarness({
      plans: [plan],
      verifier: {
        async collect({ acceptance }) {
          seenCheckIds.push(acceptance.checks.map((check) => check.checkId));
          return acceptance.checks.map((check) => ({
            checkId: check.checkId, status: 'passed' as const, complete: true,
            summary: 'trusted acceptance passed', source: 'test', timestamp: '2026-07-31T00:00:00.000Z',
          }));
        },
      },
    });

    const result = await harness.runtime.run(createRequest());
    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(seenCheckIds).toEqual([['result-reviewed']]);
    expect(result.evidenceBundle?.requirements.map((check) => check.checkId)).toEqual(['result-reviewed']);
  });

  it('returns an invalid tool call to the model as a paired failed result', async () => {
    const invalid = readPlan();
    invalid.toolCalls[0].call.toolName = 'unknown.tool';
    const harness = createHarness({ plans: [invalid, finalPlan()] });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.toolResults[0]).toMatchObject({
      toolName: 'unknown.tool',
      status: 'failed',
      success: false,
    });
    expect(harness.executorCalls).toHaveLength(0);
    expect(harness.modelInputs[1].messages.at(-2)?.content)
      .toContain('Tool is not registered');
  });

  it('returns a thrown tool failure to the model so it can recover', async () => {
    const harness = createHarness({
      executor: {
        async execute() {
          throw new Error('search index unavailable');
        },
      },
    });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.toolResults[0]).toMatchObject({
      status: 'failed',
      error: 'search index unavailable',
    });
    expect(harness.modelInputs[1].messages.at(-2)?.content)
      .toContain('search index unavailable');
  });

  it('pauses with NEEDS_APPROVAL and emits a serializable approval point', async () => {
    const harness = createHarness({ plans: [writePlan()] });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(result.state).toBe(AgentState.AWAITING_APPROVAL);
    expect(result.error?.code).toBe(AgentErrorCode.APPROVAL_REQUIRED);
    expect(result.plan).toEqual(writePlan());
    expect(harness.events.some((event) => event.type === 'approval.requested'))
      .toBe(true);
    expect(harness.events.find((event) => event.type === 'turn.suspended')
      ?.payload).toMatchObject({
      checkpoint: {
        schemaVersion: '2.0',
        pendingPlan: { summary: 'Write source' },
      },
    });
    expect(harness.events.some((event) => event.type === 'tool.request'))
      .toBe(false);
  });

  it('can suspend for approval when a later Step proposes a write', async () => {
    const harness = createHarness({ plans: [readPlan(), writePlan()] });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(result.state).toBe(AgentState.AWAITING_APPROVAL);
    expect(result.toolResults).toEqual([
      expect.objectContaining({ callId: 'call-1', status: 'succeeded' }),
    ]);
    const transitions = harness.events
      .filter((event) => event.type === 'state.transition')
      .map((event) => (event.payload as { to: AgentState }).to);
    expect(transitions).toEqual([
      AgentState.PLANNING,
      AgentState.EXECUTING,
      AgentState.AWAITING_APPROVAL,
    ]);
  });

  it('executes a valid approved write and still requires a final model Step', async () => {
    const plan = writePlan();
    const token = tokenFor(plan, 'tok-1');
    const harness = createHarness({
      plans: [plan, finalPlan()],
      policy: approvingPolicy(token),
    });
    const request = createRequest({
      tokenIdsByCallId: { 'write-1': token.tokenId },
    });
    const result = await harness.runtime.run(request);

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.evidenceBundle?.passed).toBe(true);
    expect(harness.modelInputs).toHaveLength(2);
  });

  it('resumes the exact approved plan without asking the model to recreate it', async () => {
    const plan = writePlan();
    const token = tokenFor(plan, 'tok-1');
    const harness = createHarness({
      plans: [plan, finalPlan()],
      policy: approvingPolicy(token),
    });

    const first = await harness.runtime.run(createRequest());
    expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(first.checkpoint).toBeDefined();
    expect(first.checkpoint).not.toHaveProperty('messages');
    expect(first.checkpoint?.schemaVersion).toBe('2.0');
    expect(first.usage.steps).toBe(1);
    expect(first.checkpoint?.budget.maxSteps).toBe(40);
    expect(first.checkpoint?.lastEventSequence).toBe(
      (harness.events.find((event) => event.type === 'turn.suspended')?.sequence ?? 1) - 1,
    );
    expect(harness.modelCallCount).toBe(1);

    const resumed = await harness.runtime.run(createRequest({
      resumeCheckpoint: first.checkpoint,
      tokenIdsByCallId: { 'write-1': token.tokenId },
    }));

    expect(resumed.outcome).toBe(TurnOutcome.COMPLETED);
    expect(resumed.usage.steps).toBe(2);
    expect(harness.modelCallCount).toBe(2);
    const resumedPlanEvent = harness.events
      .filter((event) => event.type === 'model.plan')
      .find((event) =>
        (event.payload as { resumed?: boolean }).resumed === true);
    expect(resumedPlanEvent).toBeDefined();
    expect(harness.events.some((event) => event.type === 'turn.suspended'))
      .toBe(true);
    expect(harness.events.some((event) => event.type === 'turn.resumed'))
      .toBe(true);
    expect(harness.events.map((event) => event.sequence))
      .toEqual(harness.events.map((_event, index) => index + 1));
  });

  it('returns an approval rejection reason to the model as a denied ToolResult', async () => {
    const plan = writePlan();
    const harness = createHarness({ plans: [plan, finalPlan('Accepted rejection')] });
    const first = await harness.runtime.run(createRequest());

    const resumed = await harness.runtime.run(createRequest({
      resumeCheckpoint: first.checkpoint,
      approvalRejection: {
        callId: 'write-1',
        reason: 'Do not modify generated files',
      },
    }));

    expect(resumed.outcome).toBe(TurnOutcome.COMPLETED);
    expect(resumed.toolResults[0]).toMatchObject({
      callId: 'write-1',
      status: 'denied',
      error: expect.stringContaining('Do not modify generated files'),
    });
    expect(harness.executorCalls).toHaveLength(0);
    expect(harness.modelInputs.at(-1)?.messages.at(-2)?.content)
      .toContain('Do not modify generated files');
    expect(harness.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'approval.resolved',
        payload: expect.objectContaining({ resolution: 'rejected' }),
      }),
    ]));
  });

  it('rejects approval rejection input without the original checkpoint', async () => {
    await expect(createHarness().runtime.run(createRequest({
      approvalRejection: { callId: 'write-1', reason: 'No' },
    }))).rejects.toMatchObject({
      code: AgentErrorCode.RUNTIME_INPUT_INVALID,
    });
  });

  it('refuses Checkpoint v2 recovery without an event-backed projector', async () => {
    const firstHarness = createHarness({ plans: [writePlan()] });
    const first = await firstHarness.runtime.run(createRequest());
    const resumedHarness = createHarness({ disableMessageProjector: true });

    await expect(resumedHarness.runtime.run(createRequest({
      resumeCheckpoint: first.checkpoint,
    }))).rejects.toMatchObject({
      code: AgentErrorCode.RUNTIME_INPUT_INVALID,
      message: expect.stringContaining('event-backed message projector'),
    });
  });

  it('keeps the canonical State sequence separate from the Core Run sequence', async () => {
    const harness = createHarness({
      plans: [writePlan()],
      eventAppend: async (_event, appendIndex) => ({ seq: 100 + appendIndex }),
    });
    const first = await harness.runtime.run(createRequest());

    expect(first.checkpoint?.lastEventSequence).toBeGreaterThan(100);
    expect(first.checkpoint?.lastRuntimeSequence).toBeLessThan(100);
  });

  it('does not reset or expand the Turn budget while resuming approval', async () => {
    const plan = writePlan();
    const token = tokenFor(plan, 'tok-1');
    const harness = createHarness({
      plans: [plan],
      policy: approvingPolicy(token),
    });
    const first = await harness.runtime.run(createRequest({
      turnBudget: { maxSteps: 1 },
    }));

    const resumed = await harness.runtime.run(createRequest({
      resumeCheckpoint: first.checkpoint,
      turnBudget: { maxSteps: 99 },
      tokenIdsByCallId: { 'write-1': token.tokenId },
    }));

    expect(resumed.outcome).toBe(TurnOutcome.BUDGET_EXCEEDED);
    expect(resumed.error?.context).toMatchObject({ reason: 'max_steps' });
    expect(harness.executorCalls).toHaveLength(0);
  });

  it('continues event sequence when a checkpoint is resumed in a new Runtime', async () => {
    const plan = writePlan();
    const firstHarness = createHarness({ plans: [plan] });
    const first = await firstHarness.runtime.run(createRequest());
    const checkpoint = first.checkpoint!;
    const token = tokenFor(plan, 'tok-1');
    const resumedHarness = createHarness({
      plans: [finalPlan()],
      policy: approvingPolicy(token),
      projectedMessages: projectRuntimeMessages(firstHarness.events),
    });

    const resumed = await resumedHarness.runtime.run(createRequest({
      resumeCheckpoint: checkpoint,
      tokenIdsByCallId: { 'write-1': token.tokenId },
    }));

    expect(resumed.outcome).toBe(TurnOutcome.COMPLETED);
    expect(resumedHarness.events[0].type).toBe('turn.resumed');
    expect(resumedHarness.events[0].sequence)
      .toBe(checkpoint.lastRuntimeSequence + 1);
  });

  it('rejects replaying an approval checkpoint in a different Turn', async () => {
    const plan = writePlan();
    const firstHarness = createHarness({ plans: [plan] });
    const first = await firstHarness.runtime.run(createRequest());
    const resumedHarness = createHarness({ plans: [finalPlan()] });

    const resumed = await resumedHarness.runtime.run(createRequest({
      turnId: 'turn-2',
      resumeCheckpoint: first.checkpoint,
    }));

    expect(resumed.outcome).toBe(TurnOutcome.FAILED);
    expect(resumed.error?.code).toBe(AgentErrorCode.APPROVAL_INVALID);
    expect(resumed.error?.message).toContain('identity');
  });

  it('rejects resume when the approved context digest changed', async () => {
    const harness = createHarness();
    const result = await harness.runtime.run(createRequest({
      approvedPlan: readPlan(),
      approvedContextDigestSha256: 'stale-digest',
    }));

    expect(result.outcome).toBe(TurnOutcome.FAILED);
    expect(result.state).toBe(AgentState.FAILED);
    expect(result.error?.code).toBe(AgentErrorCode.APPROVAL_INVALID);
  });

  it('retries only the failed model Step and records each attempt', async () => {
    let regularAttempts = 0;
    const harness = createHarness({
      model: async (input) => {
        if (input.toolChoice === 'none') return summaryPlan();
        regularAttempts += 1;
        if (regularAttempts === 1) {
          throw Object.assign(new Error('temporary gateway failure'), { code: 100 });
        }
        return finalPlan();
      },
    });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.usage.steps).toBe(1);
    expect(result.usage.modelAttempts).toBe(2);
    expect(harness.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'step.retry' }),
    ]));
  });

  it('does not retry a non-retriable model error', async () => {
    const harness = createHarness({
      model: async () => {
        throw Object.assign(new Error('invalid credentials'), { code: 301 });
      },
    });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.FAILED);
    expect(result.error?.code).toBe(AgentErrorCode.MODEL_FAILED);
    expect(result.error?.context).toEqual(expect.objectContaining({
      attempts: 1,
      retryAction: 'FAIL',
    }));
    expect(harness.modelCallCount).toBe(1);
    expect(harness.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'step.retry' }),
    ]));
  });

  it('compacts context exactly once before retrying a context overflow', async () => {
    let attempts = 0;
    const compactContext = jest.fn(async () => ({
      messages: [{ role: 'system' as const, content: 'compacted history' }],
      compactionId: 'compact-1',
      replacedSeqRange: { fromSeq: 1, toSeq: 4 },
      summary: { role: 'system', content: 'compacted history' },
    }));
    const harness = createHarness({
      compactContext,
      model: async (input) => {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error('context too long'), { code: 403 });
        expect(input.messages).toEqual([
          { role: 'system', content: 'Read only' },
          { role: 'user', content: 'Find AgentRuntime' },
          { role: 'system', content: 'compacted history' },
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('<working_memory revision="0">'),
          }),
        ]);
        return finalPlan();
      },
    });

    const result = await harness.runtime.run(createRequest());
    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(compactContext).toHaveBeenCalledTimes(1);
    expect(harness.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'compaction.applied' }),
      expect.objectContaining({ type: 'step.retry' }),
    ]));
  });

  it('uses the production compactor before an explicit model window crosses 75 percent', async () => {
    const harness = createHarness({
      plans: [finalPlan()],
      projectedMessages: Array.from({ length: 20 }, (_value, index) => ({
        role: 'assistant',
        content: `historical message ${index} ${'x'.repeat(800)}`,
      })),
    });
    const result = await harness.runtime.run(createRequest({
      contextBudget: {
        maxTokens: 20_000,
        maxItems: 50,
        maxChars: 200_000,
        modelWindowTokens: 6_000,
        highWatermarkPercent: 75,
        outputReservePercent: 20,
      },
    }));

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(harness.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'compaction.applied',
        payload: expect.objectContaining({ reason: 'input_high_watermark' }),
      }),
    ]));
    expect(harness.modelInputs[0].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('<context_summary'),
      }),
    ]));
  });

  it('folds stale tool observations in batches while keeping the newest four full', async () => {
    const harness = createHarness({
      model: async (input, callIndex) => {
        if (callIndex === 12) {
          const observations = input.messages
            .filter((message) => message.role === 'tool')
            .map((message) => message.observation?.state);
          expect(observations.slice(0, 8)).toEqual(Array(8).fill('folded'));
          expect(observations.slice(-4)).toEqual(Array(4).fill('full'));
          return finalPlan();
        }
        return readPlan(`call-${callIndex}`, { query: `query-${callIndex}` });
      },
    });
    const result = await harness.runtime.run(createRequest());
    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.toolResults).toHaveLength(12);
  });

  it('feeds Policy DENY back as a ToolResult instead of failing the Turn', async () => {
    const harness = createHarness({
      policy: new PolicyEngine({ toolWhitelist: new Set() }),
    });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.toolResults[0]).toMatchObject({
      status: 'denied',
      success: false,
    });
    expect(harness.executorCalls).toHaveLength(0);
    expect(harness.modelInputs[1].messages.at(-2)?.content)
      .toContain('不在白名单内');
  });

  it('audits an ASK decision before suspending for approval', async () => {
    const plan = writePlan('call-approval');
    const harness = createHarness({ plans: [plan] });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    const policyIndex = harness.events.findIndex((event) => event.type === 'policy.decision');
    const approvalIndex = harness.events.findIndex((event) => event.type === 'approval.requested');
    expect(policyIndex).toBeGreaterThanOrEqual(0);
    expect(policyIndex).toBeLessThan(approvalIndex);
    expect(harness.events[policyIndex].payload).toMatchObject({
      decision: { verdict: 'ask', ruleId: 'POLICY_APPROVAL_REQUIRED' },
    });
  });

  it('stops after three consecutive semantically identical tool calls', async () => {
    const harness = createHarness({
      model: async (input, index) => {
        if (input.toolChoice === 'none') return summaryPlan();
        return readPlan(`call-${index + 1}`, { query: 'missingSymbol' });
      },
      loopDetectorThreshold: 3,
    });
    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.STUCK);
    expect(result.state).toBe(AgentState.FAILED);
    expect(result.error?.code).toBe(AgentErrorCode.LOOP_STUCK);
    expect(harness.executorCalls).toEqual(['call-1', 'call-2']);
    expect(result.toolResults.at(-1)).toMatchObject({
      callId: 'call-3',
      status: 'denied',
    });
  });

  it('pairs later calls when STUCK terminates a model-issued tool batch', async () => {
    const plan = readPlan('call-1', { query: 'same' });
    plan.toolCalls.push(
      readPlan('call-2', { query: 'same' }).toolCalls[0],
      readPlan('call-3', { query: 'later' }).toolCalls[0],
    );
    const harness = createHarness({
      plans: [plan],
      loopDetectorThreshold: 2,
    });

    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.STUCK);
    expect(harness.executorCalls).toEqual(['call-1']);
    expect(result.toolResults).toEqual([
      expect.objectContaining({ callId: 'call-1', status: 'succeeded' }),
      expect.objectContaining({ callId: 'call-2', status: 'denied' }),
      expect.objectContaining({ callId: 'call-3', status: 'denied' }),
    ]);
  });

  it('uses a no-tool final summary after the step budget is exhausted', async () => {
    const harness = createHarness();
    const result = await harness.runtime.run(createRequest({
      turnBudget: { maxSteps: 1 },
    }));

    expect(result.outcome).toBe(TurnOutcome.BUDGET_EXCEEDED);
    expect(result.error?.code).toBe(AgentErrorCode.BUDGET_EXCEEDED);
    expect(result.summary).toBe('Progress saved');
    expect(result.toolResults).toHaveLength(1);
    expect(harness.modelInputs).toHaveLength(2);
    expect(harness.modelInputs[1].toolChoice).toBe('none');
    expect(harness.modelInputs[1].messages.at(-2)).toMatchObject({
      role: 'tool',
      toolCallId: 'call-1',
    });
  });

  it('does not execute tool calls after the token budget is consumed', async () => {
    const harness = createHarness();
    const result = await harness.runtime.run(createRequest({
      turnBudget: { maxTokens: 10 },
    }));

    expect(result.outcome).toBe(TurnOutcome.BUDGET_EXCEEDED);
    expect(harness.executorCalls).toHaveLength(0);
    expect(result.toolResults[0]).toMatchObject({ status: 'denied' });
  });

  it('pairs remaining calls when the tool-call budget is exhausted', async () => {
    const plan = readPlan('call-1');
    plan.toolCalls.push(readPlan('call-2').toolCalls[0]);
    const harness = createHarness({ plans: [plan] });
    const result = await harness.runtime.run(createRequest({
      turnBudget: { maxToolCalls: 1 },
    }));

    expect(result.outcome).toBe(TurnOutcome.BUDGET_EXCEEDED);
    expect(harness.executorCalls).toEqual(['call-1']);
    expect(result.toolResults).toEqual([
      expect.objectContaining({ callId: 'call-1', status: 'succeeded' }),
      expect.objectContaining({ callId: 'call-2', status: 'denied' }),
    ]);
  });

  it('aborts a hanging model call when the wall budget expires', async () => {
    const harness = createHarness({
      model: async (input) => {
        if (input.toolChoice === 'none') return summaryPlan('Wall-time summary');
        return new Promise<RuntimePlan>(() => undefined);
      },
      modelRetry: { maxAttempts: 1, baseDelayMs: 0 },
    });
    const result = await harness.runtime.run(createRequest({
      turnBudget: { maxWallMs: 10, finalSummaryGraceMs: 100 },
    }));

    expect(result.outcome).toBe(TurnOutcome.BUDGET_EXCEEDED);
    expect(result.summary).toBe('Wall-time summary');
    expect(result.error?.context).toMatchObject({ reason: 'max_wall_ms' });
  });

  it('cancels a Turn while waiting for the model', async () => {
    const controller = new AbortController();
    const harness = createHarness({
      model: async () => new Promise<RuntimePlan>(() => undefined),
      modelRetry: { maxAttempts: 1, baseDelayMs: 0 },
    });
    const pending = harness.runtime.run(createRequest({
      abortSignal: controller.signal,
    }));
    controller.abort();
    const result = await pending;

    expect(result.outcome).toBe(TurnOutcome.CANCELLED);
    expect(result.state).toBe(AgentState.CANCELLED);
  });

  it('cancels the Turn while verification is running', async () => {
    const controller = new AbortController();
    const harness = createHarness({
      plans: [finalPlan()],
      verifier: {
        async collect() {
          setImmediate(() => controller.abort());
          return new Promise(() => undefined);
        },
      },
    });
    const result = await harness.runtime.run(createRequest({
      abortSignal: controller.signal,
    }));

    expect(result.outcome).toBe(TurnOutcome.CANCELLED);
    expect(result.state).toBe(AgentState.CANCELLED);
  });

  it('cancels a running tool, waits for cleanup, and records a paired result', async () => {
    const controller = new AbortController();
    const cancelCalls: string[] = [];
    const harness = createHarness({
      executor: {
        async execute() {
          setImmediate(() => controller.abort());
          return new Promise<ToolExecutionResult>(() => undefined);
        },
        async cancel(call) {
          cancelCalls.push(call.id);
          return {
            terminationRequested: true,
            cleanupComplete: true,
            detail: 'Job Object process tree reaped',
          };
        },
      },
    });
    const result = await harness.runtime.run(createRequest({
      abortSignal: controller.signal,
    }));

    expect(result.outcome).toBe(TurnOutcome.CANCELLED);
    expect(cancelCalls).toEqual(['call-1']);
    expect(result.toolResults[0]).toMatchObject({
      callId: 'call-1',
      status: 'cancelled',
      cancellation: { cleanupComplete: true },
    });
    expect(harness.events.some((event) =>
      event.type === 'tool.result' &&
      (event.payload as ToolExecutionResult).status === 'cancelled'))
      .toBe(true);
  });

  it('pairs later calls when cancellation terminates a running tool batch', async () => {
    const controller = new AbortController();
    const plan = readPlan('call-1');
    plan.toolCalls.push(readPlan('call-2').toolCalls[0]);
    const harness = createHarness({
      plans: [plan],
      executor: {
        async execute() {
          setImmediate(() => controller.abort());
          return new Promise<ToolExecutionResult>(() => undefined);
        },
        async cancel() {
          return {
            terminationRequested: true,
            cleanupComplete: true,
          };
        },
      },
    });

    const result = await harness.runtime.run(createRequest({
      abortSignal: controller.signal,
    }));

    expect(result.outcome).toBe(TurnOutcome.CANCELLED);
    expect(result.toolResults).toEqual([
      expect.objectContaining({ callId: 'call-1', status: 'cancelled' }),
      expect.objectContaining({ callId: 'call-2', status: 'cancelled' }),
    ]);
  });

  it('fails closed when a side-effecting tool cannot confirm cancellation cleanup', async () => {
    const controller = new AbortController();
    const plan = writePlan();
    const token = tokenFor(plan, 'tok-1');
    const harness = createHarness({
      plans: [plan],
      policy: approvingPolicy(token),
      executor: {
        async execute() {
          setImmediate(() => controller.abort());
          return new Promise<ToolExecutionResult>(() => undefined);
        },
      },
    });
    const result = await harness.runtime.run(createRequest({
      abortSignal: controller.signal,
      tokenIdsByCallId: { 'write-1': token.tokenId },
    }));

    expect(result.outcome).toBe(TurnOutcome.FAILED);
    expect(result.error?.code).toBe(AgentErrorCode.CANCELLATION_FAILED);
    expect(result.toolResults[0]).toMatchObject({
      status: 'cancelled',
      cancellation: { cleanupComplete: false },
    });
  });

  it('pairs later calls when side-effect cancellation cleanup is unconfirmed', async () => {
    const controller = new AbortController();
    const plan = writePlan('write-1');
    const second = writePlan('write-2').toolCalls[0];
    second.call.args = { path: 'b.ts', content: 'y' };
    plan.toolCalls.push(second);
    const firstToken = tokenFor(plan, 'tok-1', 0);
    const secondToken = tokenFor(plan, 'tok-2', 1);
    const harness = createHarness({
      plans: [plan],
      policy: approvingPolicy(firstToken, secondToken),
      executor: {
        async execute() {
          setImmediate(() => controller.abort());
          return new Promise<ToolExecutionResult>(() => undefined);
        },
      },
    });

    const result = await harness.runtime.run(createRequest({
      abortSignal: controller.signal,
      tokenIdsByCallId: {
        'write-1': firstToken.tokenId,
        'write-2': secondToken.tokenId,
      },
    }));

    expect(result.outcome).toBe(TurnOutcome.FAILED);
    expect(result.error?.code).toBe(AgentErrorCode.CANCELLATION_FAILED);
    expect(result.toolResults).toEqual([
      expect.objectContaining({ callId: 'write-1', status: 'cancelled' }),
      expect.objectContaining({ callId: 'write-2', status: 'cancelled' }),
    ]);
  });

  it('returns a structured running-stage failure when the event sink fails', async () => {
    const harness = createHarness({
      eventAppend(event) {
        if (event.type === 'tool.result') {
          throw new Error('event disk full');
        }
      },
    });

    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.FAILED);
    expect(result.state).toBe(AgentState.FAILED);
    expect(result.error?.code).toBe(AgentErrorCode.EVENT_STORE_FAILED);
    expect(result.traceComplete).toBe(false);
    expect(result.storageFailureStage).toBe('running');
    expect(result.eventStoreError?.message).toContain('event disk full');
  });

  it('preserves the business outcome when only the final event append fails', async () => {
    const harness = createHarness({
      eventAppend(event) {
        if (event.type === 'turn.finished') {
          throw new Error('final flush failed');
        }
      },
    });

    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.state).toBe(AgentState.COMPLETED);
    expect(result.traceComplete).toBe(false);
    expect(result.storageFailureStage).toBe('finalizing');
    expect(result.eventStoreError?.code)
      .toBe(AgentErrorCode.EVENT_STORE_FAILED);
  });

  it('fails closed when an approval suspension cannot be persisted', async () => {
    const harness = createHarness({
      plans: [writePlan()],
      eventAppend(event) {
        if (event.type === 'turn.suspended') {
          throw new Error('checkpoint event not persisted');
        }
      },
    });

    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.FAILED);
    expect(result.state).toBe(AgentState.FAILED);
    expect(result.checkpoint).toBeUndefined();
    expect(result.error?.code).toBe(AgentErrorCode.EVENT_STORE_FAILED);
    expect(result.storageFailureStage).toBe('running');
  });

  it('returns EVENT_STORE_FAILED instead of rejecting when startup audit fails', async () => {
    const harness = createHarness({
      eventAppend(event) {
        if (event.type === 'turn.started') {
          throw new Error('event store unavailable');
        }
      },
    });

    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.FAILED);
    expect(result.state).toBe(AgentState.FAILED);
    expect(result.error?.code).toBe(AgentErrorCode.EVENT_STORE_FAILED);
    expect(result.traceComplete).toBe(false);
    expect(result.storageFailureStage).toBe('startup');
  });

  it('rejects invalid pre-Turn input with a structured AgentError', async () => {
    const harness = createHarness();

    await expect(harness.runtime.run(createRequest({
      turnBudget: { maxSteps: 0 },
    }))).rejects.toMatchObject({
      name: 'AgentError',
      code: AgentErrorCode.RUNTIME_INPUT_INVALID,
    });
  });

  it('classifies unexpected orchestration exceptions as INTERNAL', async () => {
    const policy = new PolicyEngine();
    jest.spyOn(policy, 'evaluate').mockImplementation(() => {
      throw new Error('unexpected policy crash');
    });
    const harness = createHarness({ policy });

    const result = await harness.runtime.run(createRequest());

    expect(result.outcome).toBe(TurnOutcome.FAILED);
    expect(result.error?.code).toBe(AgentErrorCode.INTERNAL);
    expect(result.error?.message).toContain('unexpected policy crash');
  });

  it('releases per-Run sequence state after a terminal result', async () => {
    const harness = createHarness({ plans: [finalPlan()] });

    await harness.runtime.run(createRequest());

    const internalRuntime = harness.runtime as unknown as {
      sequenceByRun: Map<string, number>;
    };
    expect(internalRuntime.sequenceByRun.size).toBe(0);
  });
});

function tokenFor(
  plan: RuntimePlan,
  tokenId: string,
  callIndex = 0,
): CapabilityToken {
  return {
    tokenId,
    sessionId: 'session-1',
    capabilities: ['workspace_write'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revoked: false,
    binding: bindCapabilityToToolCall(plan.toolCalls[callIndex].call),
  };
}

function approvingPolicy(...tokens: CapabilityToken[]): PolicyEngine {
  const tokensById = new Map(tokens.map((token) => [token.tokenId, token]));
  return new PolicyEngine({
    tokenValidator: (tokenId) => {
      const token = tokensById.get(tokenId);
      return token
        ? { valid: true, token }
        : { valid: false, reason: 'unknown token' };
    },
  });
}
