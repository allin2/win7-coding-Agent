import {
  A9AgentLoop,
  A9ModelPort,
  A9WorkspacePort,
  A9RunnerPort,
  PermissionMode,
  TurnOutcome,
} from '../src';

describe('A9-05: A9AgentLoop and Coding Workflow', () => {
  it('passes explicit read encoding and the original cancellation signal without defaulting auto-detection', async () => {
    const controller = new AbortController();
    let round = 0;
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        round += 1;
        if (round <= 2) return {
          id: `r${round}`, content: '', finishReason: 'tool_calls',
          toolCalls: [{ id: `c${round}`, name: 'read', arguments: JSON.stringify({
            path: '中文.txt', ...(round === 1 ? { encoding: 'gbk' } : {}), start_line: 2, max_lines: 1,
          }) }],
        };
        return { id: 'done', content: 'Read complete', finishReason: 'stop' };
      }),
    };
    const loop = new A9AgentLoop({ workspaceRoot: '/test/workspace', provider,
      workspaceService: mockWorkspace, runner: mockRunner, permissionMode: PermissionMode.READ_ONLY });
    await loop.runTurn('read', { signal: controller.signal });
    expect(mockWorkspace.read).toHaveBeenNthCalledWith(1, '中文.txt', {
      startLine: 2, maxLines: 1, encoding: 'gbk', signal: controller.signal,
    });
    expect(mockWorkspace.read).toHaveBeenNthCalledWith(2, '中文.txt', {
      startLine: 2, maxLines: 1, encoding: undefined, signal: controller.signal,
    });
  });
  let mockWorkspace: A9WorkspacePort;
  let mockRunner: A9RunnerPort;

  beforeEach(() => {
    mockWorkspace = {
      list: jest.fn().mockResolvedValue({ totalEntries: 1, entries: [{ name: 'calc.ts', type: 'file' }] }),
      read: jest.fn().mockResolvedValue({ content: '1: export function add(a, b) { return a - b; }' }),
      search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
      write: jest.fn().mockResolvedValue({ bytesWritten: 50, created: true }),
      edit: jest.fn().mockResolvedValue({ replaced: true }),
      copy: jest.fn().mockResolvedValue({ copied: true }),
      move: jest.fn().mockResolvedValue({ moved: true }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };

    mockRunner = {
      execute: jest.fn().mockResolvedValue({ exitCode: 0, stdout: 'PASS all tests', stderr: '', durationMs: 120, timedOut: false }),
    };
  });

  it('runs complete coding agent loop: read -> edit -> test -> complete', async () => {
    let callCount = 0;
    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async (_req, onChunk) => {
        callCount++;
        if (callCount === 1) {
          // Step 1: Read file
          return {
            id: 'res-1',
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'tc-1', name: 'read', arguments: JSON.stringify({ path: 'calc.ts' }) }],
          };
        } else if (callCount === 2) {
          // Step 2: Edit file
          return {
            id: 'res-2',
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'tc-2', name: 'edit', arguments: JSON.stringify({ path: 'calc.ts', old_text: 'return a - b;', new_text: 'return a + b;' }) }],
          };
        } else if (callCount === 3) {
          // Step 3: Run test command via shell
          return {
            id: 'res-3',
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'tc-3', name: 'shell', arguments: JSON.stringify({ command: 'npm test' }) }],
          };
        } else {
          // Step 4: Final summary
          onChunk({ content: 'Bug fixed and verified by test.', index: 0 });
          return {
            id: 'res-4',
            content: 'Bug fixed and verified by test.',
            finishReason: 'stop',
          };
        }
      }),
    };

    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });

    const result = await loop.runTurn('Fix bug in calc.ts');
    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.totalSteps).toBe(4);
    expect(result.toolCallsExecuted).toBe(3);
    expect(mockWorkspace.read).toHaveBeenCalledWith('calc.ts', expect.anything());
    expect(mockWorkspace.edit).toHaveBeenCalledWith('calc.ts', 'return a - b;', 'return a + b;', expect.anything());
    expect(mockRunner.execute).toHaveBeenCalledWith('npm test', expect.anything());
  });

  it('emits a versioned bounded Shell result DTO for Renderer and audit consumers', async () => {
    const events: any[] = [];
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn()
        .mockResolvedValueOnce({
          id: 'shell-1', content: '', finishReason: 'tool_calls',
          toolCalls: [{ id: 'shell-call', name: 'shell', arguments: '{"command":"npm test"}' }],
        })
        .mockResolvedValueOnce({ id: 'done', content: 'done', finishReason: 'stop' }),
    };
    mockRunner.execute = jest.fn().mockResolvedValue({
      status: 'exited', exitCode: 7, stdout: '中文 stdout', stderr: '失败 stderr',
      durationMs: 42, timedOut: false, truncated: true,
      rawStdoutBytes: 99, rawStderrBytes: 88,
      logPaths: { stdout: 'stdout.log', stderr: 'stderr.log' },
    });
    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace', provider, workspaceService: mockWorkspace,
      runner: mockRunner, permissionMode: PermissionMode.FULL_ACCESS,
      onEvent: (event) => events.push(event),
    });

    await loop.runTurn('run tests');

    const toolEnd = events.find((event) => event.type === 'tool_end' && event.data.toolName === 'shell');
    expect(toolEnd.data).toMatchObject({
      schemaVersion: 1,
      shell: {
        schemaVersion: 1, status: 'exited', exitCode: 7,
        stdout: '中文 stdout', stderr: '失败 stderr', durationMs: 42,
        timedOut: false, truncated: true, rawStdoutBytes: 99, rawStderrBytes: 88,
        logPaths: { stdout: 'stdout.log', stderr: 'stderr.log' },
      },
    });
  });

  it('emits model_note only when a tool-call step also carries content, and tags tool events with callId/step (ADR-0114)', async () => {
    const events: any[] = [];
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn()
        .mockResolvedValueOnce({
          id: 'note-1', content: 'I will read the file first to locate the bug.', finishReason: 'tool_calls',
          toolCalls: [{ id: 'note-tc-1', name: 'read', arguments: '{"path":"calc.ts"}' }],
        })
        .mockResolvedValueOnce({
          id: 'silent-1', content: '', finishReason: 'tool_calls',
          toolCalls: [{ id: 'note-tc-2', name: 'read', arguments: '{"path":"calc.ts","start_line":2}' }],
        })
        .mockResolvedValueOnce({ id: 'done', content: 'Bug fixed and verified.', finishReason: 'stop' }),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace', provider, workspaceService: mockWorkspace,
      runner: mockRunner, permissionMode: PermissionMode.FULL_ACCESS,
      onEvent: (event) => events.push(event),
    });

    await loop.runTurn('fix the bug');

    // 步骤 1：content + toolCalls → model_note（完整语义段，非逐 chunk）。
    const notes = events.filter((event) => event.type === 'model_note');
    expect(notes).toHaveLength(1);
    expect(notes[0].data).toEqual({ content: 'I will read the file first to locate the bug.', step: 1 });
    expect(notes[0].turnId).toBe(events[0].turnId);

    // 纯最终答案（toolCalls 为空）与 content 为空的步骤都不发 model_note。

    // tool_start/tool_end 均携带稳定 callId 与 step。
    const toolStarts = events.filter((event) => event.type === 'tool_start');
    const toolEnds = events.filter((event) => event.type === 'tool_end');
    expect(toolStarts).toHaveLength(2);
    expect(toolEnds).toHaveLength(2);
    expect(toolStarts.map((e) => e.data.callId)).toEqual(['note-tc-1', 'note-tc-2']);
    expect(toolEnds.map((e) => e.data.callId)).toEqual(['note-tc-1', 'note-tc-2']);
    expect(toolStarts.map((e) => e.data.step)).toEqual([1, 2]);
    expect(toolEnds.map((e) => e.data.step)).toEqual([1, 2]);
  });

  it('detects 3-turn no-progress loop and halts with STUCK outcome', async () => {
    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn().mockResolvedValue({
        id: 'stuck-res',
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'tc-dup', name: 'search', arguments: JSON.stringify({ pattern: 'infinite' }) }],
      }),
    };

    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
    });

    const result = await loop.runTurn('Infinite loop test');
    expect(result.outcome).toBe(TurnOutcome.STUCK);
    expect(result.finalMessage).toContain('repeated 3 times');
  });

  it('intercepts high-impact git push and requests approval', async () => {
    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn().mockResolvedValue({
        id: 'push-res',
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'tc-push', name: 'shell', arguments: JSON.stringify({ command: 'git push origin main' }) }],
      }),
    };

    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });

    const result = await loop.runTurn('Push changes to remote');
    expect(result.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(result.pendingApproval?.toolName).toBe('shell');
    expect(result.pendingApproval?.args).toEqual(expect.objectContaining({ command: 'git push origin main' }));
  });

  it('requires a fresh one-shot approval when the same absolute git push is requested in a new Turn', async () => {
    const command = 'cmd.exe /d /s /c "if exist alpha.txt (C:\\acceptance\\mvp_mingit\\cmd\\git.exe push origin HEAD:refs/heads/w18-cmd-if)"';
    const toolResponse = {
      id: 'push-res',
      content: '',
      finishReason: 'tool_calls',
      toolCalls: [{ id: 'tc-push', name: 'shell', arguments: JSON.stringify({ command }) }],
    };
    const finalResponse = { id: 'done', content: 'done', finishReason: 'stop' };
    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn()
        .mockResolvedValueOnce(toolResponse)
        .mockResolvedValueOnce(finalResponse)
        .mockResolvedValueOnce(toolResponse)
        .mockResolvedValueOnce(finalResponse),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });

    const first = await loop.runTurn('first push');
    expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(mockRunner.execute).not.toHaveBeenCalled();
    await loop.resumeAfterApproval({
      approvalId: first.pendingApproval!.approvalId,
      decision: 'approved',
      bindingDigest: first.pendingApproval!.bindingDigest,
    });
    expect(mockRunner.execute).toHaveBeenCalledTimes(1);

    const second = await loop.runTurn('same push in a new turn');
    expect(second.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(second.turnId).not.toBe(first.turnId);
    expect(second.pendingApproval!.approvalId).not.toBe(first.pendingApproval!.approvalId);
    expect(mockRunner.execute).toHaveBeenCalledTimes(1);

    await expect(loop.resumeAfterApproval({
      approvalId: first.pendingApproval!.approvalId,
      decision: 'approved',
      bindingDigest: first.pendingApproval!.bindingDigest,
    })).rejects.toMatchObject({ code: 'APPROVAL_INVALID' });
    expect(mockRunner.execute).toHaveBeenCalledTimes(1);

    await loop.resumeAfterApproval({
      approvalId: second.pendingApproval!.approvalId,
      decision: 'approved',
      bindingDigest: second.pendingApproval!.bindingDigest,
    });
    expect(mockRunner.execute).toHaveBeenCalledTimes(2);
  });

  describe('A9-20 G07: verification evidence after a mutation', () => {
    async function runEditThenShell(command: string) {
      let round = 0;
      const provider: A9ModelPort = {
        sendStreamRequest: jest.fn().mockImplementation(async () => {
          round += 1;
          if (round === 1) return { id: 'r1', content: '', finishReason: 'tool_calls', toolCalls: [{
            id: 'edit', name: 'edit', arguments: JSON.stringify({ path: 'calc.ts', old_text: 'a - b', new_text: 'a + b' }),
          }] };
          if (round === 2) return { id: 'r2', content: '', finishReason: 'tool_calls', toolCalls: [{
            id: 'sh', name: 'shell', arguments: JSON.stringify({ command }),
          }] };
          return { id: 'done', content: 'done', finishReason: 'stop' };
        }),
      };
      const loop = new A9AgentLoop({ workspaceRoot: '/test/workspace', provider,
        workspaceService: mockWorkspace, runner: mockRunner, permissionMode: PermissionMode.FULL_ACCESS });
      let result = await loop.runTurn('fix and check');
      if (result.outcome === TurnOutcome.NEEDS_APPROVAL) {
        result = await loop.resumeAfterApproval({
          approvalId: result.pendingApproval!.approvalId,
          decision: 'approved',
          bindingDigest: result.pendingApproval!.bindingDigest,
        });
      }
      expect(mockRunner.execute).toHaveBeenCalledTimes(1);
      return result;
    }

    it.each(['npm test', 'cmd /c npm test', 'cmd.exe /d /s /c "npm test"', 'bash -lc "npm test"'])(
      'counts a real check as verification: %s',
      async (command) => {
        expect((await runEditThenShell(command)).verification).toBe('verified');
      },
    );

    it.each([
      'cmd /c echo done',
      'powershell -File build.ps1',
      'git push origin main',
      'cmd /c"git push origin main"',
      'bash -lc "git push origin main"',
    ])('does not count shell-host prose, opaque payloads or Git external writes: %s', async (command) => {
      expect((await runEditThenShell(command)).verification).toBe('unverified');
    });

    it('asks for confirmation before a glued CMD git push runs', async () => {
      const provider: A9ModelPort = {
        sendStreamRequest: jest.fn().mockResolvedValue({ id: 'p', content: '', finishReason: 'tool_calls', toolCalls: [{
          id: 'push', name: 'shell', arguments: JSON.stringify({ command: 'cmd /c"git push origin main"' }),
        }] }),
      };
      const loop = new A9AgentLoop({ workspaceRoot: '/test/workspace', provider,
        workspaceService: mockWorkspace, runner: mockRunner, permissionMode: PermissionMode.FULL_ACCESS });
      const result = await loop.runTurn('push');
      expect(result.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
      expect(result.pendingApproval?.summary).toContain('remote=origin branch=main');
      expect(mockRunner.execute).not.toHaveBeenCalled();
    });
  });

  it('handles user cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    const mockModel: A9ModelPort = {
      sendStreamRequest: jest.fn(),
    };

    const loop = new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider: mockModel,
      workspaceService: mockWorkspace,
      runner: mockRunner,
    });

    const result = await loop.runTurn('Cancelled task', { signal: controller.signal });
    expect(result.outcome).toBe(TurnOutcome.CANCELLED);
  });
});

describe('A9-21 M2 C-1..C-5: turn output budget and truncation', () => {
  let mockWorkspace: A9WorkspacePort;
  let mockRunner: A9RunnerPort;

  beforeEach(() => {
    mockWorkspace = {
      list: jest.fn().mockResolvedValue({ totalEntries: 0, entries: [] }),
      read: jest.fn().mockResolvedValue({ content: 'ok' }),
      search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
      write: jest.fn().mockResolvedValue({ bytesWritten: 1, created: true }),
      edit: jest.fn().mockResolvedValue({ replaced: true }),
      copy: jest.fn().mockResolvedValue({ copied: true }),
      move: jest.fn().mockResolvedValue({ moved: true }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };
    mockRunner = {
      execute: jest.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '', durationMs: 1, timedOut: false }),
    };
  });

  function makeLoop(provider: A9ModelPort, onEvent?: (e: any) => void) {
    return new A9AgentLoop({
      workspaceRoot: '/test/workspace',
      provider,
      workspaceService: mockWorkspace,
      runner: mockRunner,
      permissionMode: PermissionMode.FULL_ACCESS,
      ...(onEvent ? { onEvent } : {}),
    });
  }

  it('9. accumulates tool-argument bytes across responses and ends BUDGET_EXCEEDED without executing the over-budget response tools', async () => {
    const bigArgs = JSON.stringify({ path: 'a', content: 'x'.repeat(1.2 * 1024 * 1024) });
    const bigArgs2 = JSON.stringify({ path: 'b', content: 'y'.repeat(1.2 * 1024 * 1024) });
    let call = 0;
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            id: 'r1', content: '', finishReason: 'tool_calls',
            toolCalls: [{ id: 't1', name: 'write', arguments: bigArgs }],
          };
        }
        return {
          id: 'r2', content: '', finishReason: 'tool_calls',
          toolCalls: [{ id: 't2', name: 'write', arguments: bigArgs2 }],
        };
      }),
    };
    const events: any[] = [];
    const loop = makeLoop(provider, (e) => events.push(e));
    const result = await loop.runTurn('write big');
    // 两次 1.2 MiB 参数累加 > 2 MiB → BUDGET_EXCEEDED
    expect(result.outcome).toBe(TurnOutcome.BUDGET_EXCEEDED);
    expect(events.some((e) => e.type === 'turn_failed')).toBe(true);
    // 超限响应的工具未执行（只允许第一次 write）
    expect(mockWorkspace.write).toHaveBeenCalledTimes(1);
  });

  it('10. budget is not reset across approval suspend/resume; resume continues toward the cap', async () => {
    const bigWrite = JSON.stringify({ path: 'a', content: 'x'.repeat(1.5 * 1024 * 1024) });
    const afterWrite = JSON.stringify({ path: 'b', content: 'y'.repeat(1.0 * 1024 * 1024) });
    let call = 0;
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          // 同一响应：先 write（入账 1.5 MiB）再 git push（触发审批挂起）
          return {
            id: 'r1', content: '', finishReason: 'tool_calls',
            toolCalls: [
              { id: 'w1', name: 'write', arguments: bigWrite },
              { id: 'push', name: 'shell', arguments: '{"command":"git push origin main"}' },
            ],
          };
        }
        // 恢复后下一响应：再 1.0 MiB → 累计 2.5 MiB 超限
        return {
          id: 'r2', content: '', finishReason: 'tool_calls',
          toolCalls: [{ id: 'w2', name: 'write', arguments: afterWrite }],
        };
      }),
    };
    const loop = makeLoop(provider);
    const suspended = await loop.runTurn('write then push');
    expect(suspended.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    const approval = suspended.pendingApproval!;
    const resumed = await loop.resumeAfterApproval({
      approvalId: approval.approvalId,
      bindingDigest: approval.bindingDigest,
      decision: 'approved',
    });
    // 若预算在恢复时被错误清零，r2 的 1.0 MiB 不会触发上限。
    expect(resumed.outcome).toBe(TurnOutcome.BUDGET_EXCEEDED);
    expect(mockWorkspace.write).toHaveBeenCalledTimes(1); // w1 执行，w2 因超限未执行
  });

  it('11. truncated response: tools not executed, model_note has Chinese content, COMPLETED_WITH_WARNINGS + outputTruncated', async () => {
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn().mockResolvedValue({
        id: 'r1',
        content: 'partial',
        finishReason: 'length',
        truncated: true,
        truncation: {
          reason: 'response_content_limit',
          retainedBytes: 1024 * 1024,
          limitBytes: 1024 * 1024,
          droppedAtLeastBytes: 100,
        },
        toolCalls: [{ id: 'c1', name: 'write', arguments: '{"path":"a","content":"b"}' }],
      }),
    };
    const events: any[] = [];
    const loop = makeLoop(provider, (e) => events.push(e));
    const result = await loop.runTurn('go');
    expect(result.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
    expect(result.outputTruncated).toBe(true);
    expect(mockWorkspace.write).not.toHaveBeenCalled();
    const notes = events.filter((e) => e.type === 'model_note');
    expect(notes.length).toBeGreaterThan(0);
    const note = notes.find((e) => typeof e.data?.content === 'string' && e.data.content.includes('截断'));
    expect(note).toBeDefined();
    expect(note.data.content.length).toBeGreaterThan(0);
    expect(note.data.truncated).toBe(true);
  });

  it('12. single truncated tool call is not executed and history records the explanation', async () => {
    let call = 0;
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            id: 'r1', content: '', finishReason: 'tool_calls',
            toolCalls: [
              { id: 'good', name: 'write', arguments: '{"path":"a","content":"ok"}', truncated: false },
              { id: 'bad', name: 'write', arguments: '{"path":"b","content":"no"}', truncated: true },
            ],
          };
        }
        return { id: 'r2', content: 'done', finishReason: 'stop' };
      }),
    };
    const loop = makeLoop(provider);
    const result = await loop.runTurn('go');
    expect(mockWorkspace.write).toHaveBeenCalledTimes(1);
    expect(mockWorkspace.write).toHaveBeenCalledWith('a', 'ok', expect.anything());
    const history = loop.getConversationHistory();
    const note = history.find((m) => m.role === 'tool' && m.toolCallId === 'bad');
    expect(note).toBeDefined();
    expect(note!.content).toContain('截断');
    expect(result.outputTruncated).toBe(true);
    expect(result.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
  });

  it('13. A9-20 verification evidence cases still pass (edit then npm test → verified)', async () => {
    let call = 0;
    const provider: A9ModelPort = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            id: 'r1', content: '', finishReason: 'tool_calls',
            toolCalls: [{ id: 'e', name: 'edit', arguments: JSON.stringify({ path: 'calc.ts', old_text: 'a', new_text: 'b' }) }],
          };
        }
        if (call === 2) {
          return {
            id: 'r2', content: '', finishReason: 'tool_calls',
            toolCalls: [{ id: 's', name: 'shell', arguments: JSON.stringify({ command: 'npm test' }) }],
          };
        }
        return { id: 'r3', content: 'ok', finishReason: 'stop' };
      }),
    };
    const loop = makeLoop(provider);
    const result = await loop.runTurn('fix');
    expect(result.verification).toBe('verified');
    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
  });
});

describe('A9-21 M2 §9.3.5: C-4 downgrade with single truncated call then final text', () => {
  it('truncated tool call then final answer → COMPLETED_WITH_WARNINGS + outputTruncated', async () => {
    const workspace = {
      list: jest.fn().mockResolvedValue({ totalEntries: 0, entries: [] }),
      read: jest.fn().mockResolvedValue({ content: 'ok' }),
      search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
      write: jest.fn().mockResolvedValue({ bytesWritten: 1, created: true }),
      edit: jest.fn().mockResolvedValue({ replaced: true }),
      copy: jest.fn().mockResolvedValue({ copied: true }),
      move: jest.fn().mockResolvedValue({ moved: true }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };
    const runner = {
      execute: jest.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '', durationMs: 1, timedOut: false }),
    };
    let call = 0;
    const provider: any = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            id: 'r1', content: '', finishReason: 'tool_calls',
            toolCalls: [
              { id: 'good', name: 'write', arguments: '{"path":"a","content":"ok"}', truncated: false },
              { id: 'cut', name: 'write', arguments: 'PARTIAL', truncated: true },
            ],
          };
        }
        return { id: 'r2', content: 'all done', finishReason: 'stop' };
      }),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/test/ws', provider, workspaceService: workspace as any, runner: runner as any,
      permissionMode: PermissionMode.FULL_ACCESS,
    });
    const result = await loop.runTurn('go');
    expect(result.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
    expect(result.outputTruncated).toBe(true);
    // 只执行了 good
    expect(workspace.write).toHaveBeenCalledTimes(1);
  });
});
