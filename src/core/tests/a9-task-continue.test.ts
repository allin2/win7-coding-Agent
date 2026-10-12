import { A9AgentLoop, PermissionMode } from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const continuation = { turnId: 'new-turn', taskId: 'task', interruptedTurnId: 'old-turn', recoveryRevision: 'a'.repeat(64), unknownPaths: ['中文 文件.txt'], opaqueUnknown: false };
function scenario(calls: Array<{ name: string; args: any }>, options: { readFailure?: boolean; auditFailure?: boolean; budget?: number; instructions?: any; readError?: any; readResult?: any; listError?: any; auditEventFailure?: string; platform?: 'win32' | 'posix'; caseInsensitive?: boolean; workspaceRoot?: string; onRead?: () => void } = {}) {
  let round = 0;
  const events: any[] = [];
  const provider = { sendStreamRequest: jest.fn(async () => {
    const call = calls[round++];
    return call ? { id: String(round), content: '', finishReason: 'tool_calls', toolCalls: [{ id: `c${round}`, name: call.name, arguments: JSON.stringify(call.args) }] }
      : { id: 'done', content: 'done', finishReason: 'stop' };
  }) };
  const workspaceService: any = { read: jest.fn(async () => { options.onRead?.(); if (options.readError) throw options.readError; if (options.readFailure) throw new Error('read failed'); return options.readResult || { content: 'current facts' }; }), write: jest.fn(async () => ({ written: true })), list: jest.fn(async () => { if (options.listError) throw options.listError; return { entries: [] }; }) };
  const runner = { execute: jest.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false })) };
  const loop = new A9AgentLoop({ workspaceRoot: options.workspaceRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-core-')), recoveryPathPlatform: options.platform, recoveryPathCaseInsensitive: options.caseInsensitive, permissionMode: PermissionMode.FULL_ACCESS, provider, workspaceService, runner,
    contextBudgetChars: options.budget, loadProjectInstructions: () => options.instructions || { status: 'missing', bytes: 0 },
    onAuditEvent: (event) => { events.push(event); if ((options.auditFailure && event.type === 'turn_started') || options.auditEventFailure === event.type) throw new Error('audit failed'); } });
  return { loop, provider, workspaceService, runner, events };
}
it('binds the new Turn and prevents an unknown write until the affected current file is read', async () => {
  const f = scenario([{ name: 'write', args: { path: '中文 文件.txt', content: 'unsafe replay' } }, { name: 'read', args: { path: 'other.txt' } },
    { name: 'write', args: { path: '中文 文件.txt', content: 'still blocked' } }, { name: 'read', args: { path: '中文 文件.txt' } }, { name: 'write', args: { path: '中文 文件.txt', content: 'fresh proposal' } }]);
  const result = await f.loop.runTurn('continue facts', { continuation });
  expect(result.turnId).toBe('new-turn');
  expect(f.workspaceService.write).toHaveBeenCalledTimes(1);
  expect(f.workspaceService.write.mock.calls[0][1]).toBe('fresh proposal');
  expect(f.events.find((e) => e.type === 'turn_started').data.continuation).toMatchObject({ interruptedTurnId: 'old-turn', taskId: 'task' });
  expect(f.loop.getConversationHistory().filter((m) => m.role === 'tool' && m.content.includes('A9_CONTINUE_READ_ONLY_CHECK_REQUIRED'))).toHaveLength(2);
});
it('a failed read does not satisfy recovery; opaque shell also waits for a successful observation', async () => {
  const f = scenario([{ name: 'read', args: { path: '中文 文件.txt' } }, { name: 'shell', args: { command: 'echo unsafe' } }], { readFailure: true });
  await f.loop.runTurn('continue', { continuation }); expect(f.runner.execute).not.toHaveBeenCalled();
  const opaque = scenario([{ name: 'shell', args: { command: 'echo unsafe' } }, { name: 'list', args: { path: '.' } }, { name: 'shell', args: { command: 'echo fresh' } }]);
  await opaque.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: [], opaqueUnknown: true } });
  expect(opaque.runner.execute).toHaveBeenCalledTimes(1);
});
it('fresh high-impact proposal still requires a new approval after recovery observation', async () => {
  const f = scenario([{ name: 'read', args: { path: '中文 文件.txt' } }, { name: 'shell', args: { command: 'git push origin main' } }]);
  const result = await f.loop.runTurn('continue', { continuation });
  expect(result.outcome).toBe('needs_approval'); expect(result.pendingApproval!.turnId).toBe('new-turn'); expect(f.runner.execute).not.toHaveBeenCalled();
  await expect(f.loop.resumeAfterApproval({ approvalId: 'old-approval', bindingDigest: 'old-digest', decision: 'approved' })).rejects.toThrow();
  expect(f.runner.execute).not.toHaveBeenCalled();
});
it('mandatory audit failure and oversized current AGENTS prefix both make zero Provider requests', async () => {
  const audit = scenario([], { auditFailure: true }); const result = await audit.loop.runTurn('continue', { continuation });
  expect(result.auditIncomplete).toBeDefined(); expect(audit.provider.sendStreamRequest).not.toHaveBeenCalled();
  const budget = scenario([], { budget: 16000, instructions: { status: 'loaded', bytes: 30000, sha256: 'changed', content: 'x'.repeat(30000) } });
  const oversized = await budget.loop.runTurn('continue', { continuation });
  expect(oversized.outcome).toBe('failed'); expect(oversized.finalMessage).toContain('上下文');
  expect(budget.events.find((event) => event.type === 'turn_failed').data.code).toBe('A9_CONTEXT_BUDGET_EXCEEDED');
  expect(budget.provider.sendStreamRequest).not.toHaveBeenCalled();
});


it('audited ENOENT observes an absent exact target and permits fresh unrelated and target writes', async () => {
  const f = scenario([{ name: 'read', args: { path: 'new.txt' } }, { name: 'write', args: { path: 'other.txt', content: 'other' } }, { name: 'write', args: { path: 'new.txt', content: 'new' } }], { readError: Object.assign(new Error('absent'), { code: 'ENOENT' }) });
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: ['new.txt'] } });
  expect(f.workspaceService.write).toHaveBeenCalledTimes(2);
  expect(f.events.find((e) => e.type === 'tool_end').data.result).toContain('ENOENT');
});
it.each(['EACCES', 'EPERM', 'ETIMEDOUT', 'ECANCELED', 'EIO'])('%s read failure keeps unrelated writes closed', async (code) => {
  const f = scenario([{ name: 'read', args: { path: 'new.txt' } }, { name: 'write', args: { path: 'other.txt', content: 'unsafe' } }], { readError: Object.assign(new Error(code), { code }) });
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: ['new.txt'] } });
  expect(f.workspaceService.write).not.toHaveBeenCalled();
});
it.each([{ outsideWorkspace: true }, { error: 'failure' }, { timedOut: true }, { cancelled: true }, { status: 'timeout' }])('unsuccessful read payload keeps the gate closed: %j', async (readResult) => {
  const f = scenario([{ name: 'read', args: { path: '中文 文件.txt' } }, { name: 'write', args: { path: 'other.txt', content: 'unsafe' } }], { readResult });
  await f.loop.runTurn('continue', { continuation }); expect(f.workspaceService.write).not.toHaveBeenCalled();
});
it.each(['read', 'list'])('tool_end audit failure on %s cannot release recovery', async (name) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-audit-'));
  fs.mkdirSync(path.join(workspaceRoot, 'dir'));
  const f = scenario([{ name, args: { path: name === 'read' ? 'missing' : 'dir' } }, { name: 'write', args: { path: 'other', content: 'unsafe' } }], { workspaceRoot, auditEventFailure: 'tool_end', ...(name === 'read' ? { readError: Object.assign(new Error('absent'), { code: 'ENOENT' }) } : {}) });
  const result = await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: [name === 'read' ? 'missing' : 'dir'] } });
  expect(result.auditIncomplete).toBeDefined(); expect(f.workspaceService.write).not.toHaveBeenCalled();
});
it('directory scan permissions are checked even when Workspace list reports success', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-directory-'));
  fs.mkdirSync(path.join(workspaceRoot, 'dir'));
  const scan = jest.spyOn(fs.promises, 'readdir').mockRejectedValue(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
  try {
    const f = scenario([{ name: 'list', args: { path: 'dir' } }, { name: 'write', args: { path: 'other', content: 'unsafe' } }], { workspaceRoot });
    await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: ['dir'] } });
    expect(f.workspaceService.write).not.toHaveBeenCalled();
  } finally { scan.mockRestore(); }
});
it.each(['../outside-missing', 'link/missing'])('outside or symlink escape ENOENT stays closed: %s', async (target) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-boundary-')), workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot); fs.symlinkSync(root, path.join(workspaceRoot, 'link'));
  const f = scenario([{ name: 'read', args: { path: target } }, { name: 'write', args: { path: 'other', content: 'unsafe' } }], { workspaceRoot, readError: Object.assign(new Error('absent'), { code: 'ENOENT' }) });
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: [target] } });
  expect(f.workspaceService.write).not.toHaveBeenCalled();
});
it('cancelled ENOENT observation does not dispatch another side effect', async () => {
  const controller = new AbortController();
  const f = scenario([{ name: 'read', args: { path: 'missing' } }, { name: 'write', args: { path: 'other', content: 'unsafe' } }], { readError: Object.assign(new Error('absent'), { code: 'ENOENT' }), onRead: () => controller.abort() });
  await f.loop.runTurn('continue', { signal: controller.signal, continuation: { ...continuation, unknownPaths: ['missing'] } });
  expect(f.workspaceService.write).not.toHaveBeenCalled();
});
it.each([
  { pending: './note.txt', observed: 'note.txt', platform: 'posix', allowed: true },
  { pending: 'sub/../note.txt', observed: './note.txt', platform: 'posix', allowed: true },
  { pending: '.\\Sub\\..\\NOTE.TXT', observed: 'note.txt', platform: 'win32', allowed: true },
  { pending: 'dir\\NOTE.TXT', observed: 'DIR/note.txt', platform: 'win32', allowed: true },
  { pending: 'note.txt', observed: '../note.txt', platform: 'posix', allowed: false },
  { pending: 'a/note.txt', observed: 'b/note.txt', platform: 'win32', allowed: false },
  { pending: 'NOTE.TXT', observed: 'note.txt', platform: 'posix', allowed: false },
  { pending: 'dir\\note.txt', observed: 'dir/note.txt', platform: 'posix', allowed: false },
])('normalizes only the same contained target: %j', async ({ pending, observed, platform, allowed }) => {
  const f = scenario([{ name: 'read', args: { path: observed } }, { name: 'write', args: { path: 'other.txt', content: 'fresh' } }], { platform: platform as 'win32' | 'posix' });
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: [pending] } });
  expect(f.workspaceService.write).toHaveBeenCalledTimes(allowed ? 1 : 0);
});
it('absolute workspace paths match relative paths; explicit case-fold override is respected', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-path-'));
  const f = scenario([{ name: 'read', args: { path: path.join(workspaceRoot, 'note.txt') } }, { name: 'write', args: { path: 'other', content: 'fresh' } }], { workspaceRoot });
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: ['./note.txt'] } });
  expect(f.workspaceService.write).toHaveBeenCalledTimes(1);
  const exact = scenario([{ name: 'read', args: { path: 'note.txt' } }, { name: 'write', args: { path: 'other', content: 'unsafe' } }], { platform: 'win32', caseInsensitive: false });
  await exact.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: ['NOTE.TXT'] } });
  expect(exact.workspaceService.write).not.toHaveBeenCalled();
});


it.each([
  { root: 'C:\\workspace', pending: 'dir\\note.txt', observed: 'c:/WORKSPACE/DIR/NOTE.txt', allowed: true },
  { root: 'C:\\workspace', pending: 'note.txt', observed: 'D:/workspace/note.txt', allowed: false },
  { root: '\\\\server\\share\\workspace', pending: 'note.txt', observed: '//SERVER/SHARE/WORKSPACE/NOTE.TXT', allowed: true },
])('win32 absolute drive and UNC paths follow workspace resolution: %j', async ({ root, pending, observed, allowed }) => {
  const f = scenario([{ name: 'read', args: { path: observed } }, { name: 'write', args: { path: 'other.txt', content: 'fresh' } }], { workspaceRoot: root, platform: 'win32' });
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: [pending] } });
  expect(f.workspaceService.write).toHaveBeenCalledTimes(allowed ? 1 : 0);
});

const gateBlocks = (f: ReturnType<typeof scenario>) => f.loop.getConversationHistory().filter((m) => m.role === 'tool' && m.content.includes('A9_CONTINUE_READ_ONLY_CHECK_REQUIRED')).length;
it.each([
  { label: 'absent (ENOENT)', readError: Object.assign(new Error('absent'), { code: 'ENOENT' }) },
  { label: 'existing', readError: undefined },
])('an unrelated $label read does not release an opaque unknown Shell; a verified list does', async ({ readError }) => {
  const f = scenario([{ name: 'read', args: { path: 'unrelated.txt' } }, { name: 'shell', args: { command: 'echo blocked' } },
    { name: 'list', args: { path: '.' } }, { name: 'shell', args: { command: 'echo fresh' } }], { readError });
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: [], opaqueUnknown: true } });
  expect(f.runner.execute).toHaveBeenCalledTimes(1);
  expect(gateBlocks(f)).toBe(1);
});
it('reading the affected path clears only that path; the opaque gate waits for a verified list', async () => {
  const f = scenario([{ name: 'read', args: { path: 'a.txt' } }, { name: 'write', args: { path: 'other.txt', content: 'blocked' } },
    { name: 'list', args: { path: '.' } }, { name: 'write', args: { path: 'other.txt', content: 'fresh' } }]);
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: ['a.txt'], opaqueUnknown: true } });
  expect(f.workspaceService.write).toHaveBeenCalledTimes(1);
  expect(f.workspaceService.write.mock.calls[0][1]).toBe('fresh');
  expect(gateBlocks(f)).toBe(1);
});
it.each(['ENOENT', 'ENOTDIR'])('%s below a file parent observes the exact target as absent', async (code) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-notdir-'));
  fs.writeFileSync(path.join(workspaceRoot, 'file.txt'), 'x');
  const f = scenario([{ name: 'read', args: { path: 'file.txt/child' } }, { name: 'write', args: { path: 'other.txt', content: 'fresh' } }],
    { workspaceRoot, readError: Object.assign(new Error(code), { code }) });
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: ['file.txt/child'] } });
  expect(f.workspaceService.write).toHaveBeenCalledTimes(1);
});
it('ENOTDIR below a symlink to an outside file stays closed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-32-notdir-link-')), workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot); fs.writeFileSync(path.join(root, 'outside.txt'), 'x'); fs.symlinkSync(path.join(root, 'outside.txt'), path.join(workspaceRoot, 'link'));
  const f = scenario([{ name: 'read', args: { path: 'link/child' } }, { name: 'write', args: { path: 'other.txt', content: 'unsafe' } }],
    { workspaceRoot, readError: Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' }) });
  await f.loop.runTurn('continue', { continuation: { ...continuation, unknownPaths: ['link/child'] } });
  expect(f.workspaceService.write).not.toHaveBeenCalled();
});
