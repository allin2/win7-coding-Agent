/**
 * R1/R2 回归测试：工作区模式键隔离与审批不可变绑定。
 *
 * R1 复现：两个绝对路径不同、末级目录同名的工作区共用 basename 键，
 * 第二个工作区静默继承 full_access。
 * R2 复现：永久删除审批执行成功后 a9_approvals 记录 tool_name=unknown、
 * binding_json={}；Renderer 只回 boolean。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  A9AgentLoop,
  A9ApprovalRequest,
  A9ModelPort,
  A9ModelToolCall,
  A9RunnerPort,
  A9WorkspacePort,
  PermissionMode,
  TurnOutcome,
  WorkspaceModeSettingsStore,
  canonicalizeWorkspacePath,
  workspaceSettingsFileKey,
  buildA9ApprovalRequest,
} from '../src';

// ---------------------------------------------------------------------------
// R1: canonical path & key isolation
// ---------------------------------------------------------------------------

describe('R1: workspace path canonicalization contract', () => {
  it('normalizes win32 drive letter case, separators and trailing slashes (case-insensitive)', () => {
    expect(canonicalizeWorkspacePath('C:\\Projects\\App\\', 'win32')).toBe('c:\\projects\\app');
    expect(canonicalizeWorkspacePath('c:/projects/APP', 'win32')).toBe('c:\\projects\\app');
    expect(canonicalizeWorkspacePath('C:\\', 'win32')).toBe('c:\\');
    expect(canonicalizeWorkspacePath('\\\\Server\\Share\\Repo', 'win32')).toBe('\\\\server\\share\\repo');
  });

  it('keeps POSIX paths case-sensitive with normalized separators', () => {
    expect(canonicalizeWorkspacePath('/Users/x/Project/', 'darwin')).toBe('/Users/x/Project');
    expect(canonicalizeWorkspacePath('/users/x/project', 'darwin')).toBe('/users/x/project');
    expect(canonicalizeWorkspacePath('/Users/x/Project', 'darwin')).not.toBe(canonicalizeWorkspacePath('/Users/x/project', 'darwin'));
  });

  it('derives different keys for same-basename workspaces and same key for win32 case variants', () => {
    const keyOne = workspaceSettingsFileKey('/one/project', 'darwin');
    const keyTwo = workspaceSettingsFileKey('/two/project', 'darwin');
    expect(keyOne).not.toBe(keyTwo);
    expect(keyOne).toMatch(/^ws-[0-9a-f]{64}$/);

    expect(workspaceSettingsFileKey('C:\\Work\\Project', 'win32')).toBe(workspaceSettingsFileKey('c:/work/PROJECT', 'win32'));
  });
});

describe('R1: mode settings store isolation (reproduced defect)', () => {
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-r1-'));
  });

  afterEach(() => {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });

  function storeFor(ws: string): WorkspaceModeSettingsStore {
    return new WorkspaceModeSettingsStore(WorkspaceModeSettingsStore.settingsFilePathFor(dataRoot, ws, 'darwin'), {
      legacyPath: WorkspaceModeSettingsStore.legacyBasenameFilePathFor(dataRoot, ws),
      platform: 'darwin',
    });
  }

  it('does NOT let /two/project inherit full_access chosen for /one/project', () => {
    const one = storeFor('/one/project');
    one.save('/one/project', PermissionMode.FULL_ACCESS);

    const two = storeFor('/two/project');
    const loaded = two.load('/two/project');
    expect(loaded.status).toBe('needs_selection');
    // 第二个工作区没有任何文件被创建。
    expect(fs.readdirSync(path.join(dataRoot, 'workspace-modes'))).toHaveLength(1);
  });

  it('restores the same workspace mode across restarts', () => {
    storeFor('/one/project').save('/one/project', PermissionMode.REVIEW);
    const reloaded = storeFor('/one/project').load('/one/project');
    expect(reloaded.status).toBe('configured');
    if (reloaded.status === 'configured') {
      expect(reloaded.settings.permissionMode).toBe(PermissionMode.REVIEW);
    }
  });

  it('fails closed on corrupted documents', () => {
    const store = storeFor('/one/project');
    store.save('/one/project', PermissionMode.READ_ONLY);
    fs.writeFileSync(WorkspaceModeSettingsStore.settingsFilePathFor(dataRoot, '/one/project', 'darwin'), '{corrupt', 'utf8');
    const loaded = store.load('/one/project');
    expect(loaded.status).toBe('needs_selection');
    if (loaded.status === 'needs_selection') expect(loaded.reason).toBe('unparsable');
  });

  it('rejects a settings document that belongs to another workspace', () => {
    // 把 /one/project 的文档内容复制到 /two/project 的键文件。
    const onePath = WorkspaceModeSettingsStore.settingsFilePathFor(dataRoot, '/one/project', 'darwin');
    const twoPath = WorkspaceModeSettingsStore.settingsFilePathFor(dataRoot, '/two/project', 'darwin');
    storeFor('/one/project').save('/one/project', PermissionMode.FULL_ACCESS);
    fs.copyFileSync(onePath, twoPath);
    const loaded = storeFor('/two/project').load('/two/project');
    expect(loaded.status).toBe('needs_selection');
    if (loaded.status === 'needs_selection') expect(loaded.reason).toBe('workspace_mismatch');
  });

  it('migrates a legacy basename document only on exact workspace match', () => {
    // 旧格式（v1）：basename 键 + 原始 workspaceRoot。
    const legacyDir = path.join(dataRoot, 'workspace-modes');
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacyPath = path.join(legacyDir, 'project.v1.json');
    fs.writeFileSync(legacyPath, JSON.stringify({
      schemaVersion: 1,
      workspaceRoot: '/one/project',
      permissionMode: 'review',
      selectedAt: '2026-08-22T00:00:00.000Z',
    }), 'utf8');

    // /one/project 精确匹配 → 迁移成功并写入 v2 键。
    const one = storeFor('/one/project');
    const migrated = one.load('/one/project');
    expect(migrated.status).toBe('configured');
    if (migrated.status === 'configured') {
      expect(migrated.settings.permissionMode).toBe(PermissionMode.REVIEW);
      expect(migrated.settings.auditTrail.length).toBe(1);
    }
    expect(fs.existsSync(WorkspaceModeSettingsStore.settingsFilePathFor(dataRoot, '/one/project', 'darwin'))).toBe(true);

    // /two/project 同 basename 但 workspaceRoot 不匹配 → 拒绝迁移，needs_selection。
    const two = storeFor('/two/project');
    const rejected = two.load('/two/project');
    expect(rejected.status).toBe('needs_selection');
    if (rejected.status === 'needs_selection') expect(rejected.reason).toBe('workspace_mismatch');
  });

  it('records mode changes into the persistent audit trail', () => {
    const store = storeFor('/one/project');
    store.save('/one/project', PermissionMode.READ_ONLY);
    store.save('/one/project', PermissionMode.FULL_ACCESS);
    const loaded = store.load('/one/project');
    expect(loaded.status).toBe('configured');
    if (loaded.status === 'configured') {
      expect(loaded.settings.auditTrail.map((e) => `${e.from}->${e.to}`)).toEqual(['none->read_only', 'read_only->full_access']);
    }
  });
});

// ---------------------------------------------------------------------------
// R2: immutable approval binding
// ---------------------------------------------------------------------------

function modelReturning(toolCalls: A9ModelToolCall[], thenFinal = true): A9ModelPort {
  let call = 0;
  return {
    sendStreamRequest: jest.fn().mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return { id: `res-${call}`, content: '', finishReason: 'tool_calls', toolCalls };
      }
      if (thenFinal) {
        return { id: `res-${call}`, content: 'done', finishReason: 'stop' };
      }
      return { id: `res-${call}`, content: '', finishReason: 'tool_calls', toolCalls };
    }),
  };
}

function makeWorkspace(): A9WorkspacePort {
  return {
    list: jest.fn().mockResolvedValue({ totalEntries: 0, entries: [] }),
    read: jest.fn().mockResolvedValue({ content: 'x', totalLines: 1 }),
    search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
    write: jest.fn(),
    edit: jest.fn(),
    copy: jest.fn(),
    move: jest.fn(),
    delete: jest.fn().mockResolvedValue({ deleted: true, permanent: true }),
  };
}

describe('R2: immutable approval objects', () => {
  it('binds permanent-delete approvals to path/permanent in the summary', () => {
    const approval = buildA9ApprovalRequest('turn-1', 'call-1', 'delete', { path: 'tmp/log.txt', permanent: true }, '需要确认');
    expect(approval.summary).toBe('delete path=tmp/log.txt permanent=true');
    expect(approval.bindingDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(approval.approvalId).toMatch(/^apr-[0-9a-f]{24}$/);
    expect(approval.gitBinding).toBeUndefined();
  });

  it('binds git push approvals to remote/branch/force and the command digest', () => {
    const approval = buildA9ApprovalRequest('turn-1', 'call-2', 'shell', { command: 'git push --force origin main' }, '需要确认');
    expect(approval.gitBinding).toBeDefined();
    expect(approval.gitBinding!.remote).toBe('origin');
    expect(approval.gitBinding!.branch).toBe('main');
    expect(approval.gitBinding!.force).toBe(true);
    expect(approval.gitBinding!.commandSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(approval.summary).toContain('force');
    expect(approval.summary).toContain('origin');
  });

  it('digest changes when the target changes (old approval invalidated)', () => {
    const a = buildA9ApprovalRequest('t', 'c', 'delete', { path: 'a.txt', permanent: true }, 'r');
    const b = buildA9ApprovalRequest('t', 'c', 'delete', { path: 'b.txt', permanent: true }, 'r');
    expect(a.bindingDigest).not.toBe(b.bindingDigest);
  });

  it('issues a fresh one-shot identity when a provider repeats the same call in one turn', () => {
    const a = buildA9ApprovalRequest('turn-same', 'call-same', 'shell', { command: 'git push origin main' }, 'r');
    const b = buildA9ApprovalRequest('turn-same', 'call-same', 'shell', { command: 'git push origin main' }, 'r');
    expect(a.bindingDigest).toBe(b.bindingDigest);
    expect(a.approvalId).not.toBe(b.approvalId);
  });

  it('persists the pending approval before returning NEEDS_APPROVAL', async () => {
    const persisted: A9ApprovalRequest[] = [];
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: modelReturning([{ id: 'p1', name: 'delete', arguments: JSON.stringify({ path: 'x.txt', permanent: true }) }], false),
      workspaceService: makeWorkspace(),
      runner: { execute: jest.fn() } as A9RunnerPort,
      permissionMode: PermissionMode.FULL_ACCESS,
      onApprovalPending: (approval) => { persisted.push(approval); },
    });
    const result = await loop.runTurn('delete it');
    expect(result.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].approvalId).toBe(result.pendingApproval!.approvalId);
    expect(persisted[0].toolName).toBe('delete');
    expect(persisted[0].summary).toContain('x.txt');
  });

  it('rejects an approval issued for a different turn (cross-turn replay)', async () => {
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: modelReturning([{ id: 'p1', name: 'delete', arguments: JSON.stringify({ path: 'x.txt', permanent: true }) }], false),
      workspaceService: makeWorkspace(),
      runner: { execute: jest.fn() } as A9RunnerPort,
      permissionMode: PermissionMode.FULL_ACCESS,
    });
    const first = await loop.runTurn('delete it');
    expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    const firstApproval = first.pendingApproval!;

    // 新一轮 Turn 开始会清空挂起（跨 Turn 审批不可用）。
    const second = await loop.runTurn('another task');
    expect(second.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    await expect(loop.resumeAfterApproval({
      approvalId: firstApproval.approvalId,
      decision: 'approved',
      bindingDigest: firstApproval.bindingDigest,
    })).rejects.toThrow(/approvalId 不匹配|APPROVAL_INVALID/);
  });

  it('denial keeps zero side effects and the approval records the real target', async () => {
    const persisted: A9ApprovalRequest[] = [];
    const workspace = makeWorkspace();
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: modelReturning([{ id: 'p1', name: 'delete', arguments: JSON.stringify({ path: 'real-target.txt', permanent: true }) }]),
      workspaceService: workspace,
      runner: { execute: jest.fn() } as A9RunnerPort,
      permissionMode: PermissionMode.FULL_ACCESS,
      onApprovalPending: (approval) => { persisted.push(approval); },
    });
    const first = await loop.runTurn('delete it');
    const denied = await loop.resumeAfterApproval({
      approvalId: first.pendingApproval!.approvalId,
      decision: 'denied',
      bindingDigest: first.pendingApproval!.bindingDigest,
    });
    expect(denied.outcome).toBe(TurnOutcome.BLOCKED);
    expect(workspace.delete).not.toHaveBeenCalled();
    // SQLite 审计应从原始 pending approval 记录（真实工具与目标），而不是 unknown/{}。
    expect(persisted[0].toolName).toBe('delete');
    expect(persisted[0].args).toMatchObject({ path: 'real-target.txt', permanent: true });
    expect(Object.keys(persisted[0].args).length).toBeGreaterThan(0);
  });

  it('rejects a consumed card when the provider repeats the same call id and args in one turn', async () => {
    const workspace = makeWorkspace();
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: modelReturning([{ id: 'same-call', name: 'delete', arguments: JSON.stringify({ path: 'same.txt', permanent: true }) }], false),
      workspaceService: workspace,
      runner: { execute: jest.fn() } as A9RunnerPort,
      permissionMode: PermissionMode.FULL_ACCESS,
    });
    const first = await loop.runTurn('delete it');
    const oldCard = first.pendingApproval!;
    const repeated = await loop.resumeAfterApproval({
      approvalId: oldCard.approvalId,
      decision: 'denied',
      bindingDigest: oldCard.bindingDigest,
    });
    expect(repeated.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
    expect(repeated.pendingApproval!.approvalId).not.toBe(oldCard.approvalId);

    await expect(loop.resumeAfterApproval({
      approvalId: oldCard.approvalId,
      decision: 'approved',
      bindingDigest: oldCard.bindingDigest,
    })).rejects.toThrow(/approvalId 不匹配|APPROVAL_INVALID/);
    expect(workspace.delete).not.toHaveBeenCalled();
  });

  it('uses the resumed AbortSignal for the approved Shell call', async () => {
    let observedSignal: AbortSignal | undefined;
    const runner: A9RunnerPort = {
      execute: jest.fn().mockImplementation((_command, options) => new Promise((resolve) => {
        observedSignal = options?.signal;
        options?.signal?.addEventListener('abort', () => resolve({
          status: 'cancelled', exitCode: null, stdout: '', stderr: '', durationMs: 1,
          timedOut: false, cancelled: true, processTreeReaped: true,
        }), { once: true });
      })),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: modelReturning([{ id: 'p1', name: 'shell', arguments: JSON.stringify({ command: 'git push origin main' }) }]),
      workspaceService: makeWorkspace(),
      runner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });
    const first = await loop.runTurn('push it');
    const controller = new AbortController();
    const resumed = loop.resumeAfterApproval({
      approvalId: first.pendingApproval!.approvalId,
      decision: 'approved',
      bindingDigest: first.pendingApproval!.bindingDigest,
    }, { signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    expect(observedSignal).toBe(controller.signal);
    controller.abort();
    await resumed;
  });
});

describe('R3: durable Shell baseline gate', () => {
  it('does not execute Shell when the Turn-entry baseline cannot be persisted', async () => {
    const runner = { execute: jest.fn() } as unknown as A9RunnerPort;
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: modelReturning([{ id: 's1', name: 'shell', arguments: JSON.stringify({ command: 'echo safe' }) }]),
      workspaceService: makeWorkspace(),
      runner,
      permissionMode: PermissionMode.FULL_ACCESS,
      externalChangePort: {
        freezeTurnBaseline: jest.fn().mockRejectedValue(new Error('manifest write failed')),
        collectExternalChanges: jest.fn(),
      },
    });

    await expect(loop.runTurn('run it')).rejects.toThrow(/A9_CHECKPOINT_BASELINE_FAILED/);
    expect(runner.execute).not.toHaveBeenCalled();
  });

  it('stops the Turn when the Shell post-state cannot be collected', async () => {
    const runner = { execute: jest.fn().mockResolvedValue({ status: 'completed', stdout: 'ok', stderr: '' }) } as unknown as A9RunnerPort;
    const loop = new A9AgentLoop({
      workspaceRoot: '/ws',
      provider: modelReturning([{ id: 's1', name: 'shell', arguments: JSON.stringify({ command: 'echo safe' }) }]),
      workspaceService: makeWorkspace(),
      runner,
      permissionMode: PermissionMode.FULL_ACCESS,
      externalChangePort: {
        freezeTurnBaseline: jest.fn().mockResolvedValue({}),
        collectExternalChanges: jest.fn().mockRejectedValue(new Error('post-state unavailable')),
      },
    });

    await expect(loop.runTurn('run it')).rejects.toThrow(/A9_CHECKPOINT_COLLECTION_FAILED/);
    expect(runner.execute).toHaveBeenCalledTimes(1);
  });
});
