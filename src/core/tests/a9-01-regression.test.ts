/**
 * A9-01 回归测试：权限模式与工具合同修复后的行为矩阵。
 *
 * 覆盖审查缺陷：
 * - Read Only 的 read/list/search 不需要审批（不再映射为 REVIEW 写令牌）；
 * - Read Only 不暴露写、删除和 shell；
 * - Review 写入只进入 staging，不直接调用 A9WorkspaceService 写正式工作区；
 * - 审批拒绝零副作用；审批通过后可以继续原工具调用；
 * - 损坏的模式值不能自动升级权限（fail-closed 进入选择流程）。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  A9AgentLoop,
  A9ModelPort,
  A9ModelToolCall,
  A9ReviewStagingPort,
  A9RunnerPort,
  A9WorkspacePort,
  PermissionMode,
  TurnOutcome,
  parseWorkspaceModeSettings,
  WorkspaceModeSettingsStore,
} from '../src';

function modelReturningScript(script: Array<{ toolCalls?: A9ModelToolCall[]; content?: string }>): A9ModelPort {
  let call = 0;
  return {
    sendStreamRequest: jest.fn().mockImplementation(async () => {
      const step = script[Math.min(call, script.length - 1)];
      call++;
      return {
        id: `res-${call}`,
        content: step.content ?? '',
        finishReason: step.toolCalls ? 'tool_calls' : 'stop',
        toolCalls: step.toolCalls,
      };
    }),
  };
}

describe('A9-01 regression: Read Only mode', () => {
  let workspace: A9WorkspacePort;
  let runner: A9RunnerPort;

  beforeEach(() => {
    workspace = {
      list: jest.fn().mockResolvedValue({ totalEntries: 0, entries: [] }),
      read: jest.fn().mockResolvedValue({ content: 'ok', totalLines: 1 }),
      search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
      write: jest.fn(),
      edit: jest.fn(),
      copy: jest.fn(),
      move: jest.fn(),
      delete: jest.fn(),
    };
    runner = { execute: jest.fn() };
  });

  it('allows list/read/search/update_plan directly without approval or write tokens', async () => {
    const model = modelReturningScript([
      { toolCalls: [{ id: 't1', name: 'list', arguments: '{}' }] },
      { toolCalls: [{ id: 't2', name: 'read', arguments: JSON.stringify({ path: 'a.txt' }) }] },
      { toolCalls: [{ id: 't3', name: 'search', arguments: JSON.stringify({ pattern: 'x' }) }] },
      { toolCalls: [{ id: 't4', name: 'update_plan', arguments: JSON.stringify({ plan: '1. inspect' }) }] },
      { content: 'Analysis complete.' },
    ]);

    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: model,
      workspaceService: workspace,
      runner,
      permissionMode: PermissionMode.READ_ONLY,
    });

    const result = await loop.runTurn('Explain the project');
    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.toolCallsExecuted).toBe(4);
    expect(workspace.list).toHaveBeenCalled();
    expect(workspace.read).toHaveBeenCalledWith('a.txt', expect.anything());
    expect(workspace.search).toHaveBeenCalled();
  });

  it('does not expose write/delete/shell and denies them with structured feedback', async () => {
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: modelReturningScript([]),
      workspaceService: workspace,
      runner,
      permissionMode: PermissionMode.READ_ONLY,
    });
    expect(loop.getVisibleTools()).toEqual(['list', 'read', 'search', 'update_plan']);
    expect(loop.getVisibleTools()).not.toContain('write');
    expect(loop.getVisibleTools()).not.toContain('delete');
    expect(loop.getVisibleTools()).not.toContain('shell');

    const model = modelReturningScript([
      { toolCalls: [{ id: 'w1', name: 'write', arguments: JSON.stringify({ path: 'x.txt', content: 'x' }) }] },
      { toolCalls: [{ id: 'd1', name: 'delete', arguments: JSON.stringify({ path: 'x.txt' }) }] },
      { toolCalls: [{ id: 's1', name: 'shell', arguments: JSON.stringify({ command: 'dir' }) }] },
      { content: 'I cannot modify files in read-only mode.' },
    ]);
    const readonlyLoop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: model,
      workspaceService: workspace,
      runner,
      permissionMode: PermissionMode.READ_ONLY,
    });

    const result = await readonlyLoop.runTurn('Try to modify things');
    // 所有工具尝试都被权限拒绝 → 诚实标记 BLOCKED，而不是假装完成。
    expect(result.outcome).toBe(TurnOutcome.BLOCKED);
    expect(result.toolCallsExecuted).toBe(0);
    expect(workspace.write).not.toHaveBeenCalled();
    expect(workspace.delete).not.toHaveBeenCalled();
    expect(runner.execute).not.toHaveBeenCalled();
  });
});

describe('A9-01 regression: Review mode staging', () => {
  it('stages write operations instead of writing the real workspace', async () => {
    const workspace: A9WorkspacePort = {
      list: jest.fn().mockResolvedValue({ totalEntries: 0, entries: [] }),
      read: jest.fn().mockResolvedValue({ content: 'body', totalLines: 1 }),
      search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
      write: jest.fn(),
      edit: jest.fn(),
      copy: jest.fn(),
      move: jest.fn(),
      delete: jest.fn(),
    };
    const staging: A9ReviewStagingPort = {
      stageWrite: jest.fn().mockResolvedValue({ staged: true, path: 'a.txt' }),
      stageEdit: jest.fn().mockResolvedValue({ staged: true, path: 'a.txt' }),
      stageCopy: jest.fn().mockResolvedValue({ staged: true }),
      stageMove: jest.fn().mockResolvedValue({ staged: true }),
      stageDelete: jest.fn().mockResolvedValue({ staged: true }),
    };
    const model = modelReturningScript([
      { toolCalls: [{ id: 'e1', name: 'edit', arguments: JSON.stringify({ path: 'a.txt', old_text: 'old', new_text: 'new' }) }] },
      { content: 'Proposed the change for review.' },
    ]);

    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: model,
      workspaceService: workspace,
      runner: { execute: jest.fn() },
      reviewStaging: staging,
      permissionMode: PermissionMode.REVIEW,
    });

    const result = await loop.runTurn('Fix the typo');
    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    // 别名 old_text/new_text 被规范化后进入 staging。
    expect(staging.stageEdit).toHaveBeenCalledWith('a.txt', 'old', 'new', expect.anything());
    expect(workspace.edit).not.toHaveBeenCalled();
    expect(workspace.write).not.toHaveBeenCalled();
  });

  it('rejects Review writes when no staging backend is configured (never direct-write)', async () => {
    const workspace: A9WorkspacePort = {
      list: jest.fn().mockResolvedValue({ totalEntries: 0, entries: [] }),
      read: jest.fn().mockResolvedValue({ content: 'x', totalLines: 1 }),
      search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
      write: jest.fn(),
      edit: jest.fn(),
      copy: jest.fn(),
      move: jest.fn(),
      delete: jest.fn(),
    };
    const model = modelReturningScript([
      { toolCalls: [{ id: 'w1', name: 'write', arguments: JSON.stringify({ path: 'a.txt', content: 'data' }) }] },
      { content: 'Could not write; staging unavailable.' },
    ]);

    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: model,
      workspaceService: workspace,
      runner: { execute: jest.fn() },
      permissionMode: PermissionMode.REVIEW,
    });

    const result = await loop.runTurn('Write a file');
    // staging 后端缺失 → 写入被拒绝 → 诚实标记 BLOCKED，且从未直写工作区。
    expect(result.outcome).toBe(TurnOutcome.BLOCKED);
    expect(workspace.write).not.toHaveBeenCalled();
  });
});

describe('A9-01 regression: approval resume flow', () => {
  function buildLoop() {
    const workspace: A9WorkspacePort = {
      list: jest.fn().mockResolvedValue({ totalEntries: 0, entries: [] }),
      read: jest.fn().mockResolvedValue({ content: 'x', totalLines: 1 }),
      search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
      write: jest.fn(),
      edit: jest.fn(),
      copy: jest.fn(),
      move: jest.fn(),
      delete: jest.fn().mockResolvedValue({ deleted: true, permanent: true }),
    };
    const runner: A9RunnerPort = {
      execute: jest.fn().mockResolvedValue({ exitCode: 0, stdout: 'done', stderr: '', durationMs: 5, timedOut: false }),
    };
    let call = 0;
    const model: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call++;
        if (call === 1) {
          return {
            id: 'res-1',
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'pdel', name: 'delete', arguments: JSON.stringify({ path: 'tmp.log', permanent: true }) }],
          };
        }
        return { id: `res-${call}`, content: 'Finished after the decision.', finishReason: 'stop' };
      }),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: model,
      workspaceService: workspace,
      runner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });
    return { loop, workspace, runner };
  }

  it('approval denied has zero side effects and the model is informed', async () => {
    const { loop, workspace } = buildLoop();
    const first = await loop.runTurn('Delete the log permanently');
    expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(first.pendingApproval?.toolName).toBe('delete');
    expect(first.pendingApproval?.callId).toBe('pdel');
    expect(workspace.delete).not.toHaveBeenCalled();

    const second = await loop.resumeAfterApproval({
      approvalId: first.pendingApproval!.approvalId,
      decision: 'denied',
      bindingDigest: first.pendingApproval!.bindingDigest,
    });
    // 唯一的工具尝试被用户拒绝 → BLOCKED 且零副作用。
    expect(second.outcome).toBe(TurnOutcome.BLOCKED);
    expect(workspace.delete).not.toHaveBeenCalled();
  });

  it('approval granted continues the original tool call', async () => {
    const { loop, workspace } = buildLoop();
    const first = await loop.runTurn('Delete the log permanently');
    expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);

    const second = await loop.resumeAfterApproval({
      approvalId: first.pendingApproval!.approvalId,
      decision: 'approved',
      bindingDigest: first.pendingApproval!.bindingDigest,
    });
    // 删除已执行但无后续验证 → 诚实标记 COMPLETED_WITH_WARNINGS。
    expect(second.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
    expect(second.verification).toBe('unverified');
    expect(workspace.delete).toHaveBeenCalledWith('tmp.log', expect.objectContaining({ permanent: true }));
  });

  it('resume without a suspended turn is a structured error', async () => {
    const { loop } = buildLoop();
    await expect(loop.resumeAfterApproval({ approvalId: 'apr-x', decision: 'approved', bindingDigest: '0'.repeat(64) })).rejects.toThrow(/No suspended turn/);
  });

  it('rejects forged digest and replayed approvals', async () => {
    const { loop, workspace } = buildLoop();
    const first = await loop.runTurn('Delete the log permanently');
    expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    const approval = first.pendingApproval!;

    // 伪造摘要拒绝。
    await expect(loop.resumeAfterApproval({ approvalId: approval.approvalId, decision: 'approved', bindingDigest: 'f'.repeat(64) }))
      .rejects.toThrow(/bindingDigest|APPROVAL_INVALID/i);

    // 消费一次后重复审批拒绝（一次性）。
    await loop.resumeAfterApproval({ approvalId: approval.approvalId, decision: 'approved', bindingDigest: approval.bindingDigest });
    await expect(loop.resumeAfterApproval({ approvalId: approval.approvalId, decision: 'approved', bindingDigest: approval.bindingDigest }))
      .rejects.toThrow(/No suspended turn/);
    expect(workspace.delete).toHaveBeenCalledTimes(1);
  });


});

describe('A9-01 regression: strict tool schema validation', () => {
  const workspace: A9WorkspacePort = {
    list: jest.fn().mockResolvedValue({ totalEntries: 0, entries: [] }),
    read: jest.fn().mockResolvedValue({ content: 'x', totalLines: 1 }),
    search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
    write: jest.fn(),
    edit: jest.fn(),
    copy: jest.fn(),
    move: jest.fn(),
    delete: jest.fn(),
  };

  async function runWithToolCall(name: string, args: string) {
    let call = 0;
    const model: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call++;
        if (call === 1) {
          return { id: 'r1', content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name, arguments: args }] };
        }
        return { id: 'r2', content: 'ok', finishReason: 'stop' };
      }),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: model,
      workspaceService: workspace,
      runner: { execute: jest.fn() },
      permissionMode: PermissionMode.FULL_ACCESS,
    });
    const historyBefore = loop.getConversationHistory().length;
    const result = await loop.runTurn('validate');
    return { result, loop, historyBefore };
  }

  it('rejects missing required fields and unknown fields, executes nothing', async () => {
    const missing = await runWithToolCall('write', JSON.stringify({ content: 'no path' }));
    expect(missing.result.toolCallsExecuted).toBe(0);
    expect(workspace.write).not.toHaveBeenCalled();
    const toolMsg = missing.loop.getConversationHistory().find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('validation failed');

    const unknownField = await runWithToolCall('read', JSON.stringify({ path: 'a.txt', bogus: 1 }));
    expect(unknownField.result.toolCallsExecuted).toBe(0);

    const wrongType = await runWithToolCall('list', JSON.stringify({ path: 'x', maxEntries: 'many' }));
    expect(wrongType.result.toolCallsExecuted).toBe(0);
  });

  it('accepts snake_case aliases and maps them onto the canonical schema', async () => {
    const aliased = await runWithToolCall('read', JSON.stringify({ path: 'a.txt', start_line: 2, max_lines: 5 }));
    expect(aliased.result.toolCallsExecuted).toBe(1);
    expect(workspace.read).toHaveBeenCalledWith('a.txt', expect.objectContaining({ startLine: 2, maxLines: 5 }));
  });

  it('rejects malformed JSON arguments with a structured tool message', async () => {
    const malformed = await runWithToolCall('read', 'not-json{{');
    expect(malformed.result.toolCallsExecuted).toBe(0);
    const toolMsg = malformed.loop.getConversationHistory().find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('JSON object');
  });
});

describe('A9-01 regression: persisted mode settings fail closed', () => {
  it('corrupted persisted values must not escalate to full access', () => {
    expect(parseWorkspaceModeSettings(null, '/ws').status).toBe('needs_selection');
    expect(parseWorkspaceModeSettings({ schemaVersion: 2, workspaceRoot: '/other', selectedAt: 'now', permissionMode: 'full_access' }, '/ws').status).toBe('needs_selection');
    expect(parseWorkspaceModeSettings({ schemaVersion: 3, workspaceRoot: '/ws', selectedAt: 'now', permissionMode: 'full_access' }, '/ws').status).toBe('needs_selection');
    expect(parseWorkspaceModeSettings(undefined, '/ws').status).toBe('needs_selection');
    const ok = parseWorkspaceModeSettings({ schemaVersion: 2, workspaceRoot: '/ws', selectedAt: 'now', permissionMode: 'read_only', auditTrail: [] }, '/ws');
    expect(ok.status).toBe('configured');
  });

  it('store round-trips an explicit choice and reports missing settings as needs_selection', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-mode-'));
    try {
      const store = new WorkspaceModeSettingsStore(path.join(dir, 'modes', 'ws-test.json'));
      expect(store.load('/ws').status).toBe('needs_selection');
      const saved = store.save('/ws', PermissionMode.REVIEW);
      expect(saved.permissionMode).toBe(PermissionMode.REVIEW);
      const loaded = store.load('/ws');
      expect(loaded.status).toBe('configured');
      if (loaded.status === 'configured') {
        expect(loaded.settings.permissionMode).toBe(PermissionMode.REVIEW);
      }

      // 写入损坏内容后必须保持 needs_selection，而不是默认 Full Access。
      fs.writeFileSync(path.join(dir, 'modes', 'ws-test.json'), '{corrupted', 'utf8');
      const corrupted = store.load('/ws');
      expect(corrupted.status).toBe('needs_selection');
      if (corrupted.status === 'needs_selection') {
        expect(corrupted.reason).toBe('unparsable');
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
