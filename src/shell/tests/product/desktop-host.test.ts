import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createDesktopHost, validateWin7PathShape } = require('../../product/desktop-host') as {
  createDesktopHost(options?: {
    onTaskEvent?: (event: any) => void;
    runner?: { execute(request: any): Promise<any> };
    runnerAcceptanceAction?: Record<string, unknown>;
    reviewFailureInjector?: (phase: string, item?: any) => void;
    reviewDirectory?: string;
    credentialVault?: Record<string, unknown>;
    ledger?: any;
    gatewayProviderFactory?: (input: any) => any;
  }): any;
  validateWin7PathShape(candidatePath: string, platform: string): { normalized: string };
};

describe('Desktop Alpha 1 composition root', () => {
  let root: string;
  let host: any;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-alpha-'));
    fs.writeFileSync(path.join(root, 'sample.ts'), 'export function hello() { return "hello"; }\r\n', 'utf8');
  });

  afterEach(() => {
    if (host) host.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function waitForIdle(): Promise<void> {
    for (let index = 0; index < 200 && host.activeTask; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    host.flushEvents();
  }

  async function waitForEvent(events: any[], kind: string): Promise<any> {
    for (let index = 0; index < 200; index += 1) {
      host.flushEvents();
      const event = events.find((candidate) => candidate.eventKind === kind);
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${kind}`);
  }

  it('runs Replay through Core list/search/read and State-backed product events', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    const selected = await host.selectWorkspace(root);
    expect(selected.workspacePath).toBe(fs.realpathSync(root));
    const session = host.createSession({});
    const accepted = host.submitTask({
      sessionId: session.sessionId,
      prompt: '分析代码结构',
      scenario: 'structure',
    });

    await waitForIdle();

    expect(accepted.status).toBe('accepted');
    expect(events.map((event) => event.eventKind)).toEqual(expect.arrayContaining([
      'tool.started', 'tool.completed', 'file.reference', 'assistant.delta', 'task.completed',
    ]));
    expect(events.find((event) => event.eventKind === 'task.completed')).toBeDefined();
    expect(events.filter((event) => event.eventKind === 'tool.started').map((event) => event.data.toolName)).toEqual([
      'workspace.list_directory', 'workspace.search_text', 'workspace.read_text',
    ]);
    expect(events.map((event) => event.sequence)).toEqual(
      [...events].sort((left, right) => left.sequence - right.sequence).map((event) => event.sequence),
    );
    expect(host.ledgerSize).toBeGreaterThan(0);
  });

  it('routes an ordinary natural-language edit into Review staging without direct workspace write', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: '修改 sample.ts 并修复 hello 函数' });

    await waitForEvent(events, 'review.created');

    expect(accepted.scenario).toBe('agent');
    expect(events.filter((event) => event.eventKind === 'tool.started').map((event) => event.data.toolName)).toContain('workspace.review_prepare');
    const review = host.getReview({ sessionId: session.sessionId, taskId: accepted.taskId }).review;
    expect(review.status).toBe('READY');
    expect(fs.readFileSync(path.join(root, 'sample.ts'), 'utf8')).toContain('return "hello"');
  });

  it('emits a bounded product compaction marker when the reviewed input budget is crossed', async () => {
    const events: any[] = [];
    for (let fileIndex = 0; fileIndex < 4; fileIndex += 1) {
      const body = Array.from({ length: 500 }, (_value, line) => `line-${fileIndex}-${line.toString().padStart(2, '0')}-${'x'.repeat(12)}`).join('\n') + '\n';
      fs.writeFileSync(path.join(root, `context-${fileIndex}.txt`), body, 'utf8');
    }
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({
      sessionId: session.sessionId,
      prompt: '分析这些上下文并给出摘要',
      context: {
        refs: Array.from({ length: 4 }, (_value, index) => ({ kind: 'file', path: `context-${index}.txt`, startLine: 1, endLine: 500 })),
      },
    });

    const compaction = await waitForEvent(events, 'compaction.applied');
    await waitForIdle();

    expect(accepted.scenario).toBe('agent');
    expect(compaction.data).toMatchObject({ compactionId: expect.any(String), replacedSeqRange: expect.any(Object) });
    expect(compaction.data.summary).toBeUndefined();
  });

  it('runs an A8-03 multi-file Review from private staging through exact apply', async () => {
    fs.writeFileSync(path.join(root, 'delete.txt'), 'remove me\n', 'utf8');
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({
      sessionId: session.sessionId,
      prompt: '准备多文件修改并等待 Review',
      scenario: 'review',
      reviewProposals: [
        { relativePath: 'sample.ts', operation: 'MODIFY', afterContent: Buffer.from('export function hello() { return "updated"; }\r\n') },
        { relativePath: 'new.ts', operation: 'CREATE', afterContent: Buffer.from('export const created = true;\n') },
        { relativePath: 'delete.txt', operation: 'DELETE' },
      ],
    });
    await waitForEvent(events, 'review.created');
    const prepared = host.getReview({ sessionId: session.sessionId, taskId: accepted.taskId });
    expect(prepared.review.files).toHaveLength(3);
    host.decideReview({ sessionId: session.sessionId, taskId: accepted.taskId, relativePath: 'sample.ts', decision: 'ACCEPTED' });
    host.decideReview({ sessionId: session.sessionId, taskId: accepted.taskId, relativePath: 'new.ts', decision: 'ACCEPTED' });
    host.decideReview({ sessionId: session.sessionId, taskId: accepted.taskId, relativePath: 'delete.txt', decision: 'REJECTED' });
    const validation = host.recordReviewValidation({
      sessionId: session.sessionId, taskId: accepted.taskId, status: 'NOT_RUN', complete: true,
      outputTruncated: false, summary: 'no registered project profile', source: 'desktop-product', trustedAdapter: false,
    });
    expect(validation.validation).toMatchObject({ status: 'NOT_RUN', previewHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const approval = host.issueReviewApproval({ sessionId: session.sessionId, taskId: accepted.taskId, subject: 'desktop-user' });
    const applied = host.applyReview({ sessionId: session.sessionId, taskId: accepted.taskId, approval: approval.approval });
    expect(applied.result).toMatchObject({ success: true, status: 'APPLIED', zeroWrites: false });
    expect(fs.readFileSync(path.join(root, 'sample.ts'), 'utf8')).toContain('updated');
    expect(fs.readFileSync(path.join(root, 'new.ts'), 'utf8')).toContain('created');
    expect(fs.existsSync(path.join(root, 'delete.txt'))).toBe(true);
    expect(events.map((event) => event.eventKind)).toEqual(expect.arrayContaining([
      'review.created', 'review.updated', 'review.validation_recorded', 'review.approval_requested', 'review.applied', 'task.completed',
    ]));
  });

  it('rejects Review staging actions for a non-Review task', () => {
    host = createDesktopHost();
    return host.selectWorkspace(root).then(() => {
      const session = host.createSession({});
      const task = host.submitTask({ sessionId: session.sessionId, prompt: '只读分析', scenario: 'structure' });
      expect(() => host.prepareReview({
        sessionId: session.sessionId,
        taskId: task.taskId,
        proposals: [{ relativePath: 'sample.ts', operation: 'MODIFY', afterContent: Buffer.from('blocked\n') }],
      })).toThrow('只有 Review 任务可以访问多文件准备区');
    });
  });

  it('blocks sensitive Review validation evidence and emits a redacted failure', async () => {
    const events: any[] = [];
    const credentialVault = {
      loadApiKey: jest.fn(() => 'known-review-secret'),
      getStatus: jest.fn(() => ({ available: true, saved: true })),
      clearApiKey: jest.fn(),
    };
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event), credentialVault });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({
      sessionId: session.sessionId,
      prompt: '校验 Review 证据安全边界',
      scenario: 'review',
      reviewProposals: [{ relativePath: 'sample.ts', operation: 'MODIFY', afterContent: Buffer.from('safe\n') }],
    });
    await waitForEvent(events, 'review.created');
    host.decideReview({ sessionId: session.sessionId, taskId: accepted.taskId, relativePath: 'sample.ts', decision: 'ACCEPTED' });
    expect(() => host.recordReviewValidation({
      sessionId: session.sessionId, taskId: accepted.taskId, status: 'NOT_RUN', complete: true,
      outputTruncated: false, summary: 'known-review-secret', source: 'desktop', trustedAdapter: false,
    })).toThrow('Known sensitive value');
    const blocked = events.find((event) => event.eventKind === 'review.security_blocked');
    expect(blocked?.data.error).toEqual({ code: 'SENSITIVE_DATA_BLOCKED', message: 'Review 验证证据包含已知敏感值，已清理私有准备区。' });
    expect(JSON.stringify(events)).not.toContain('known-review-secret');
    expect(host.activeTask).toBeNull();
    expect(host.getReview({ sessionId: session.sessionId, taskId: accepted.taskId }).review.status).toBe('FAILED');
  });

  it('lets the Review Replay derive a bounded proposal for the product diagnostics path', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: '诊断 Review 准备区', scenario: 'review' });
    await waitForEvent(events, 'review.created');
    await waitForEvent(events, 'review.awaiting_decision');
    const prepared = host.getReview({ sessionId: session.sessionId, taskId: accepted.taskId });
    expect(prepared.review.files).toHaveLength(1);
    expect(prepared.review.files[0]).toMatchObject({ relativePath: 'sample.ts', operation: 'MODIFY', decision: 'PENDING' });
    expect(events.filter((event) => event.eventKind === 'tool.started').map((event) => event.data.toolName)).toContain('workspace.review_prepare');
    expect(events.some((event) => event.eventKind === 'review.awaiting_decision')).toBe(true);
  });

  it('completes a Review with zero writes when the final file is rejected', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({
      sessionId: session.sessionId,
      prompt: '拒绝全部 Review 提案',
      scenario: 'review',
      reviewProposals: [{ relativePath: 'sample.ts', operation: 'MODIFY', afterContent: Buffer.from('not applied\n') }],
    });
    await waitForEvent(events, 'review.created');
    host.decideReview({ sessionId: session.sessionId, taskId: accepted.taskId, relativePath: 'sample.ts', decision: 'REJECTED' });
    await waitForEvent(events, 'task.completed');
    const review = host.getReview({ sessionId: session.sessionId, taskId: accepted.taskId });
    expect(review.review.status).toBe('REJECTED');
    expect(events.some((event) => event.eventKind === 'review.approval_requested')).toBe(false);
    expect(fs.readFileSync(path.join(root, 'sample.ts'), 'utf8')).toContain('hello');
    expect(host.activeTask).toBeNull();
  });

  it('fails and releases the active task when Review apply detects target drift', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({
      sessionId: session.sessionId,
      prompt: '漂移后重新生成 Review',
      scenario: 'review',
      reviewProposals: [{ relativePath: 'sample.ts', operation: 'MODIFY', afterContent: Buffer.from('drifted proposal\n') }],
    });
    await waitForEvent(events, 'review.created');
    host.decideReview({ sessionId: session.sessionId, taskId: accepted.taskId, relativePath: 'sample.ts', decision: 'ACCEPTED' });
    const approval = host.issueReviewApproval({ sessionId: session.sessionId, taskId: accepted.taskId, subject: 'desktop-user' });
    fs.writeFileSync(path.join(root, 'sample.ts'), 'changed outside Review\n', 'utf8');
    const applied = host.applyReview({ sessionId: session.sessionId, taskId: accepted.taskId, approval: approval.approval });
    expect(applied.result).toMatchObject({ status: 'STALE', zeroWrites: true, approvalConsumed: false });
    await waitForEvent(events, 'task.failed');
    expect(events.find((event) => event.eventKind === 'task.failed')?.data.error).toMatchObject({ code: 'REVIEW_STALE' });
    expect(host.activeTask).toBeNull();
    expect(host.getReview({ sessionId: session.sessionId, taskId: accepted.taskId }).review.status).toBe('STALE');
    expect(fs.readFileSync(path.join(root, 'sample.ts'), 'utf8')).toBe('changed outside Review\n');
  });

  it('fails and releases the active task after a rollback-complete Review apply error', async () => {
    const events: any[] = [];
    host = createDesktopHost({
      onTaskEvent: (event: any) => events.push(event),
      reviewFailureInjector: (phase: string, item?: any) => {
        if (phase === 'write' && item?.relativePath === 'second.ts') throw new Error('injected review write failure');
      },
    });
    fs.writeFileSync(path.join(root, 'second.ts'), 'second\n', 'utf8');
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({
      sessionId: session.sessionId,
      prompt: '批量 Review 写入失败后恢复',
      scenario: 'review',
      reviewProposals: [
        { relativePath: 'sample.ts', operation: 'MODIFY', afterContent: Buffer.from('first updated\n') },
        { relativePath: 'second.ts', operation: 'MODIFY', afterContent: Buffer.from('second updated\n') },
      ],
    });
    await waitForEvent(events, 'review.created');
    host.decideReview({ sessionId: session.sessionId, taskId: accepted.taskId, relativePath: 'sample.ts', decision: 'ACCEPTED' });
    host.decideReview({ sessionId: session.sessionId, taskId: accepted.taskId, relativePath: 'second.ts', decision: 'ACCEPTED' });
    const approval = host.issueReviewApproval({ sessionId: session.sessionId, taskId: accepted.taskId, subject: 'desktop-user' });
    const applied = host.applyReview({ sessionId: session.sessionId, taskId: accepted.taskId, approval: approval.approval });
    expect(applied.result).toMatchObject({ status: 'FAILED', success: false, rolledBack: true, recoveryRequired: false });
    await waitForEvent(events, 'task.failed');
    expect(events.find((event) => event.eventKind === 'task.failed')?.data.error).toMatchObject({ code: 'REVIEW_APPLY_FAILED' });
    expect(host.activeTask).toBeNull();
    expect(fs.readFileSync(path.join(root, 'sample.ts'), 'utf8')).toContain('hello');
    expect(fs.readFileSync(path.join(root, 'second.ts'), 'utf8')).toBe('second\n');
  });

  it('keeps plan mode tool-free until the exact plan approval is accepted', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({
      sessionId: session.sessionId,
      prompt: '先计划再分析代码结构',
      scenario: 'structure',
      context: { executionMode: 'plan' },
    });

    const approval = await waitForEvent(events, 'plan.approval_requested');
    expect(events.some((event) => event.eventKind === 'tool.started')).toBe(false);
    expect(host.activeTask.status).toBe('awaiting_approval');
    await host.approvePlan({
      taskId: accepted.taskId,
      approvalId: approval.data.approvalId,
      planHash: approval.data.planHash,
    });
    await waitForIdle();

    expect(events.some((event) => event.eventKind === 'tool.started')).toBe(true);
    expect(events.some((event) => event.eventKind === 'task.completed')).toBe(true);
  });

  it('rejects a visible plan with no tool side effect', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({
      sessionId: session.sessionId,
      prompt: '先计划再决定',
      scenario: 'structure',
      context: { executionMode: 'plan' },
    });
    const approval = await waitForEvent(events, 'plan.approval_requested');
    await host.rejectPlan({
      taskId: accepted.taskId,
      approvalId: approval.data.approvalId,
      planHash: approval.data.planHash,
      reason: '不执行',
    });
    await waitForIdle();

    expect(events.some((event) => event.eventKind === 'tool.started')).toBe(false);
    expect(events.some((event) => event.eventKind === 'task.cancelled')).toBe(true);
  });

  it('records every raw Gateway chunk and final marker in the V2 ledger before projection', async () => {
    const stateModule = require('../../../state/dist');
    const ledger = new stateModule.InMemoryEventLedger(10_000);
    const credentialStore = {
      setApiKey: jest.fn(), getApiKey: jest.fn(() => undefined), clear: jest.fn(),
    };
    const provider = {
      credentialStore,
      disconnect: jest.fn(),
      sendStreamRequest: jest.fn(async (_request: any, onChunk: (chunk: any) => void) => {
        onChunk({ content: 'raw-a', index: 0 });
        onChunk({ content: 'raw-b', index: 1 });
        return { content: 'raw-araw-b', finishReason: 'stop', toolCalls: [] };
      }),
    };
    host = createDesktopHost({ ledger, gatewayProviderFactory: () => provider });
    await host.selectWorkspace(root);
    host.setSettings({ values: { mode: 'gateway', gatewayUrl: 'http://127.0.0.1:8443' } });
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: 'Gateway 审计', scenario: 'structure' });
    await waitForIdle();

    const task = host.listSessions()[0];
    expect(task.taskCount).toBe(1);
    const facts = ledger.queryThread(accepted.threadId)
      .filter((event: any) => event.type === 'gateway.delta');
    expect(facts.slice(0, 3).map((event: any) => event.payload)).toEqual([
      expect.objectContaining({ schemaVersion: 1, taskId: accepted.taskId, index: 0, chunk: 'raw-a', isFinal: false }),
      expect.objectContaining({ schemaVersion: 1, taskId: accepted.taskId, index: 1, chunk: 'raw-b', isFinal: false }),
      expect.objectContaining({ schemaVersion: 1, taskId: accepted.taskId, index: 2, chunk: '', isFinal: true, finishReason: 'stop' }),
    ]);
  });

  it('lets the controlled Gateway Provider prepare A8 Review staging without workspace-write authority', async () => {
    const events: any[] = [];
    const providerRequests: any[] = [];
    const credentialStore = {
      setApiKey: jest.fn(), getApiKey: jest.fn(() => undefined), clear: jest.fn(),
    };
    const proposal = JSON.stringify([{
      relativePath: 'sample.ts',
      operation: 'MODIFY',
      afterContentBase64: Buffer.from('export function hello() { return "gateway-review"; }\r\n').toString('base64'),
    }]);
    const sequence = [
      { name: 'workspace_list_directory', arguments: '{}' },
      { name: 'workspace_search_text', arguments: '{"pattern":"hello"}' },
      { name: 'workspace_read_text', arguments: '{"path":"sample.ts","startLine":1,"maxLines":120}' },
      { name: 'workspace_review_prepare', arguments: JSON.stringify({ proposalsJson: proposal }) },
    ];
    let requestIndex = 0;
    const provider = {
      credentialStore,
      disconnect: jest.fn(),
      sendStreamRequest: jest.fn(async (request: any, onChunk: (chunk: any) => void) => {
        providerRequests.push(request);
        onChunk({ content: `controlled-${requestIndex}`, index: 0 });
        const next = sequence[requestIndex++];
        return next
          ? { content: '', finishReason: 'tool_calls', toolCalls: [{ id: `gateway-review-${requestIndex}`, ...next }] }
          : { content: 'Review 已进入私有准备区，等待用户决定。', finishReason: 'stop', toolCalls: [] };
      }),
    };
    host = createDesktopHost({
      onTaskEvent: (event: any) => events.push(event),
      gatewayProviderFactory: () => provider,
    });
    await host.selectWorkspace(root);
    host.setSettings({ values: { mode: 'gateway', gatewayUrl: 'http://127.0.0.1:8443' } });
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: '通过真实 Gateway seam 准备 Review', scenario: 'review' });
    await waitForEvent(events, 'review.created');
    await waitForEvent(events, 'review.awaiting_decision');

    const prepared = host.getReview({ sessionId: session.sessionId, taskId: accepted.taskId }).review;
    expect(prepared.files).toEqual([expect.objectContaining({
      relativePath: 'sample.ts', operation: 'MODIFY', decision: 'PENDING',
    })]);
    expect(fs.readFileSync(path.join(root, 'sample.ts'), 'utf8')).toBe('export function hello() { return "hello"; }\r\n');
    expect(providerRequests[0].messages[0].content).toContain('[a8-system-prompt-v1]');
    expect(providerRequests[0].messages[0].content).toContain('never writes the target workspace');
    expect(providerRequests.every((request) => request.tools.some((tool: any) => tool.name === 'workspace_review_prepare'))).toBe(true);
    expect(providerRequests.every((request) => request.tools.every((tool: any) => tool.name !== 'workspace_str_replace'))).toBe(true);
    expect(events.filter((event) => event.eventKind === 'tool.started').map((event) => event.data.toolName)).toContain('workspace.review_prepare');
  });

  it('blocks a Provider credential echo before immutable events, chat projection or failure evidence', async () => {
    const stateModule = require('../../../state/dist');
    const ledger = new stateModule.InMemoryEventLedger(10_000);
    const events: any[] = [];
    const secret = 'gateway-echo-secret-value';
    host = createDesktopHost({
      ledger,
      onTaskEvent: (event: any) => events.push(event),
      gatewayProviderFactory: ({ providerConfig }: any) => ({
        credentialStore: providerConfig.credentialStore,
        disconnect: jest.fn(),
        async sendStreamRequest(_request: any, onChunk: (chunk: any) => void) {
          onChunk({ content: `malicious echo ${secret}`, index: 0 });
          return { content: '', finishReason: 'stop', toolCalls: [] };
        },
      }),
    });
    await host.selectWorkspace(root);
    host.setSettings({ values: {
      mode: 'gateway', gatewayUrl: 'http://127.0.0.1:8443', apiKey: secret,
    } });
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: '凭据回显负向测试', scenario: 'review' });
    await waitForIdle();

    const serializedEvents = JSON.stringify(events);
    const serializedLedger = JSON.stringify(ledger.queryThread(accepted.threadId));
    expect(serializedEvents).not.toContain(secret);
    expect(serializedLedger).not.toContain(secret);
    expect(ledger.queryThread(accepted.threadId).filter((event: any) => event.type === 'gateway.delta')).toHaveLength(0);
    expect(events.find((event) => event.eventKind === 'task.failed')?.data).toEqual(expect.objectContaining({
      outcome: 'failed',
      error: expect.objectContaining({
        code: 'MODEL_FAILED',
        message: expect.stringContaining('Gateway content matched a known sensitive value and was blocked before persistence.'),
      }),
    }));
  });

  it('rejects a known credential in the user prompt before creating Turn, Task or event facts', async () => {
    const secret = 'prompt-secret-value';
    host = createDesktopHost({
      gatewayProviderFactory: ({ providerConfig }: any) => ({
        credentialStore: providerConfig.credentialStore,
        disconnect: jest.fn(),
        sendStreamRequest: jest.fn(),
      }),
    });
    await host.selectWorkspace(root);
    host.setSettings({ values: { mode: 'gateway', gatewayUrl: 'http://127.0.0.1:8443', apiKey: secret } });
    const session = host.createSession({});
    const before = host.getSessionProjection(session.sessionId).session;
    expect(() => host.submitTask({
      sessionId: session.sessionId,
      prompt: `请分析 ${secret}`,
      scenario: 'review',
    })).toThrow('内容命中已知凭据值');
    const after = host.getSessionProjection(session.sessionId).session;
    expect(after.taskCount).toBe(before.taskCount);
    expect(host.ledgerSize).toBe(0);
  });

  it('blocks a known credential read from the workspace before tool evidence reaches events', async () => {
    const stateModule = require('../../../state/dist');
    const ledger = new stateModule.InMemoryEventLedger(10_000);
    const events: any[] = [];
    const secret = 'workspace-tool-secret-value';
    fs.writeFileSync(path.join(root, 'sample.ts'), `export const leaked = "${secret}";\r\n`, 'utf8');
    let requestIndex = 0;
    host = createDesktopHost({
      ledger,
      onTaskEvent: (event: any) => events.push(event),
      gatewayProviderFactory: ({ providerConfig }: any) => ({
        credentialStore: providerConfig.credentialStore,
        disconnect: jest.fn(),
        async sendStreamRequest() {
          requestIndex += 1;
          return requestIndex === 1
            ? { content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'read-secret', name: 'workspace_read_text', arguments: '{"path":"sample.ts"}' }] }
            : { content: '敏感工作区内容已由产品边界阻断，未形成普通证据。', finishReason: 'stop', toolCalls: [] };
        },
      }),
    });
    await host.selectWorkspace(root);
    host.setSettings({ values: { mode: 'gateway', gatewayUrl: 'http://127.0.0.1:8443', apiKey: secret } });
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: '读取 sample.ts', scenario: 'review' });
    await waitForIdle();

    expect(JSON.stringify(events)).not.toContain(secret);
    expect(JSON.stringify(ledger.queryThread(accepted.threadId))).not.toContain(secret);
    const readFinished = events.find((event) => event.eventKind === 'tool.completed' && event.data.toolName === 'workspace.read_text');
    expect(readFinished?.data).toEqual(expect.objectContaining({
      status: 'failed',
      error: '内容命中已知凭据值，已在进入普通事件、聊天或工具证据前阻断。',
    }));
  });

  it('A8S-01 isolates multiple sessions under one workspace and keeps one Thread per session', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    const selected = await host.selectWorkspace(root);
    const first = host.createSession({ label: '会话一' });
    const second = host.createSession({ label: '会话二' });
    const accepted = host.submitTask({ sessionId: first.sessionId, prompt: '分析代码结构', scenario: 'structure' });
    await waitForIdle();

    expect(first.workspaceId).toBe(selected.workspaceId);
    expect(second.workspaceId).toBe(selected.workspaceId);
    expect(first.threadId).not.toBe(second.threadId);
    expect(accepted.threadId).toBe(first.threadId);
    expect(events.every((event) => event.data.sessionId === first.sessionId && event.data.threadId === first.threadId)).toBe(true);
    expect(host.getSessionProjection(second.sessionId).contextTurns).toEqual([]);
  });

  it('A8S-02 rejects a second foreground submit before creating Task/Turn/Run', async () => {
    host = createDesktopHost();
    await host.selectWorkspace(root);
    const first = host.createSession({ label: '一' });
    const second = host.createSession({ label: '二' });
    host.submitTask({ sessionId: first.sessionId, prompt: '长任务', scenario: 'cancellable' });
    const before = host.getSessionProjection(second.sessionId).session;
    expect(() => host.submitTask({ sessionId: second.sessionId, prompt: '不能排队', scenario: 'structure' }))
      .toThrow('当前已有活动任务');
    const after = host.getSessionProjection(second.sessionId).session;
    expect(after.taskCount).toBe(before.taskCount);
    expect(after.threadId).toBe(before.threadId);
    await host.cancelTask(host.activeTask.taskId);
    await waitForIdle();
  });

  it('A8S-03 edits, achieves and abandons Goal with revision conflicts kept atomic', async () => {
    host = createDesktopHost();
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const revision1 = host.setGoal({ sessionId: session.sessionId, text: '完成会话合同', expectedRevision: 0 }).goal;
    expect(() => host.setGoal({ sessionId: session.sessionId, text: '过期覆盖', expectedRevision: 0 }))
      .toThrow('GOAL_REVISION_CONFLICT');
    const achieved = host.resolveGoal({ sessionId: session.sessionId, status: 'ACHIEVED', expectedRevision: revision1.revision }).goal;
    const activeAgain = host.setGoal({ sessionId: session.sessionId, text: '验证上下文', expectedRevision: achieved.revision }).goal;
    const abandoned = host.resolveGoal({ sessionId: session.sessionId, status: 'ABANDONED', expectedRevision: activeAgain.revision }).goal;
    expect(host.getSessionProjection(session.sessionId).goal).toEqual(abandoned);
  });

  it('A8S-04 bounds read-only context and rejects workspace escapes through a symlink', async () => {
    fs.mkdirSync(path.join(root, '中文 空格'));
    fs.writeFileSync(path.join(root, '中文 空格', 'context.txt'), '第一行\n第二行\n', 'utf8');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret', 'utf8');
    try {
      fs.symlinkSync(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
      host = createDesktopHost();
      await host.selectWorkspace(root);
      const session = host.createSession({});
      const listing = host.listWorkspace({ sessionId: session.sessionId, path: '中文 空格' });
      const read = host.readWorkspaceFile({ sessionId: session.sessionId, path: '中文 空格/context.txt' });
      expect(listing.entries[0].path).toContain('中文 空格');
      expect(read.lines[0].text).toBe('第一行');
      expect(() => host.readWorkspaceFile({ sessionId: session.sessionId, path: 'escape/secret.txt' }))
        .toThrow(/WORKSPACE_BOUNDARY_VIOLATION/);
      expect(() => host.submitTask({
        sessionId: session.sessionId,
        prompt: '使用附件分析',
        context: { refs: [{ kind: 'file', path: '中文 空格/context.txt', startLine: 1, endLine: 600 }] },
      })).toThrow('文件上下文每项最多 500 行');
      const accepted = host.submitTask({
        sessionId: session.sessionId,
        prompt: '使用附件分析',
        context: { refs: [{ kind: 'file', path: '中文 空格/context.txt', startLine: 1, endLine: 2 }] },
      });
      expect(host.getSessionProjection(session.sessionId).contextTurns[0].refs[0]).toMatchObject({
        kind: 'file', relativePath: expect.stringContaining('中文 空格'), lineStart: 1, lineEnd: 2,
        contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      await waitForIdle();
      expect(accepted.status).toBe('accepted');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('A8S-04 classifies Win7 drive, Chinese/space and MAX_PATH inputs deterministically', () => {
    expect(validateWin7PathShape('C:\\中文 空格\\repo', 'win32').normalized).toBe('C:\\中文 空格\\repo');
    expect(() => validateWin7PathShape('relative\\repo', 'win32')).toThrow('Win7 工作区必须使用绝对盘符');
    expect(() => validateWin7PathShape(`C:\\${'a'.repeat(257)}`, 'win32')).toThrow('MAX_PATH');
  });

  it('descends into a workspace directory when the root search has no match', async () => {
    fs.unlinkSync(path.join(root, 'sample.ts'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'hello.ts'), 'export const hello = "world";\r\n', 'utf8');
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    host.submitTask({ sessionId: session.sessionId, prompt: '分析这个工作区的代码结构', scenario: 'structure' });

    await waitForIdle();

    expect(events.find((event) => event.eventKind === 'task.completed')).toBeDefined();
    expect(events.filter((event) => event.eventKind === 'tool.started').map((event) => event.data.toolName)).toEqual([
      'workspace.list_directory', 'workspace.search_text', 'workspace.list_directory',
      'workspace.search_text', 'workspace.read_text',
    ]);
  });

  it('cancels a long Replay without emitting task.completed', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: '可取消的长任务', scenario: 'cancellable' });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const acknowledgement = await host.cancelTask(accepted.taskId);
    await waitForIdle();

    expect(acknowledgement.accepted).toBe(true);
    expect(events.some((event) => event.eventKind === 'task.cancelled')).toBe(true);
    expect(events.some((event) => event.eventKind === 'task.completed')).toBe(false);
  });

  it('projects a product-injected Runner result through task.event without terminal input', async () => {
    const events: any[] = [];
    const runner = { execute: jest.fn(async () => ({
      schemaVersion: '2.0', status: 'exited', exitCode: 0, durationMs: 7,
      stdout: { text: 'runner output\r\n', bytesRead: 15, bytesRetained: 15, omittedBytes: 0, truncated: false, encoding: 'utf-8', replacementCount: 0 },
      stderr: { text: '', bytesRead: 0, bytesRetained: 0, omittedBytes: 0, truncated: false, encoding: 'utf-8', replacementCount: 0 },
      termination: { requested: false, processTreeReaped: true, containment: 'job_object' },
    })) };
    host = createDesktopHost({
      runner,
      runnerAcceptanceAction: { profileId: 'win7-whoami', args: ['/all'] },
      onTaskEvent: (event: any) => events.push(event),
    });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    host.submitTask({ sessionId: session.sessionId, prompt: '执行固定验收动作', scenario: 'runner_acceptance' });
    await waitForIdle();

    expect(runner.execute).toHaveBeenCalledWith(expect.objectContaining({
      command: 'win7-whoami', args: ['/all'], approvalLevel: 'read_only',
      config: expect.objectContaining({ stdinPolicy: 'closed', workDir: fs.realpathSync(root) }),
    }));
    expect(events.map((event) => event.eventKind)).toEqual(expect.arrayContaining([
      'runner.started', 'runner.stdout', 'runner.finished', 'task.completed',
    ]));
  });
});
