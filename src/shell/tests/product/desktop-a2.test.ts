import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createDesktopHost } = require('../../product/desktop-host') as { createDesktopHost: (options?: any) => any };

describe('Desktop Alpha 2 controlled single-file write loop', () => {
  let root: string;
  let host: any;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-alpha2-'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'hello.ts'), 'export const hello = "world";\r\n', 'utf8');
  });

  afterEach(() => {
    if (host) host.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function waitFor(predicate: () => boolean): Promise<void> {
    for (let index = 0; index < 300 && !predicate(); index += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(predicate()).toBe(true);
    host.flushEvents();
  }

  it('pauses on a trusted Diff and writes only after one-time approval', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: '修改 hello', scenario: 'edit' });

    await waitFor(() => Boolean(events.find((event) => event.eventKind === 'approval.requested')));
    const approval = events.find((event) => event.eventKind === 'approval.requested').data;
    expect(approval.preparation.relativePath).toBe('src/hello.ts');
    expect(approval.preparation.preview.truncated).toBe(false);
    expect(fs.readFileSync(path.join(root, 'src', 'hello.ts'), 'utf8')).toContain('world');

    const result = await host.approveTask({
      taskId: accepted.taskId,
      approvalId: approval.approvalId,
      planHash: approval.planHash,
      workspaceBaseHash: approval.workspaceBaseHash,
    });
    expect(result.status).toBe('resuming');
    await waitFor(() => Boolean(events.find((event) => event.eventKind === 'task.completed')));
    expect(fs.readFileSync(path.join(root, 'src', 'hello.ts'), 'utf8')).toContain('A2 Replay edit');
    expect(events.some((event) => event.eventKind === 'approval.resolved')).toBe(true);
  });

  it('rejects without changing the file', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: '修改 hello', scenario: 'edit' });
    await waitFor(() => Boolean(events.find((event) => event.eventKind === 'approval.requested')));
    const approval = events.find((event) => event.eventKind === 'approval.requested').data;
    await host.rejectTask({ taskId: accepted.taskId, approvalId: approval.approvalId, reason: '不批准' });
    await waitFor(() => Boolean(events.find((event) => event.eventKind === 'task.completed')));
    expect(fs.readFileSync(path.join(root, 'src', 'hello.ts'), 'utf8')).toBe('export const hello = "world";\r\n');
  });

  it('requires replanning after base drift', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const accepted = host.submitTask({ sessionId: session.sessionId, prompt: '修改 hello', scenario: 'edit' });
    await waitFor(() => Boolean(events.find((event) => event.eventKind === 'approval.requested')));
    const approval = events.find((event) => event.eventKind === 'approval.requested').data;
    fs.writeFileSync(path.join(root, 'src', 'hello.ts'), 'external change\r\n', 'utf8');
    await host.approveTask({ taskId: accepted.taskId, approvalId: approval.approvalId, planHash: approval.planHash, workspaceBaseHash: approval.workspaceBaseHash });
    await waitFor(() => Boolean(events.find((event) => event.eventKind === 'task.failed')));
    expect(fs.readFileSync(path.join(root, 'src', 'hello.ts'), 'utf8')).toBe('external change\r\n');
  });

  it('creates a fresh approval for undo', async () => {
    const events: any[] = [];
    host = createDesktopHost({ onTaskEvent: (event: any) => events.push(event) });
    await host.selectWorkspace(root);
    const session = host.createSession({});
    const first = host.submitTask({ sessionId: session.sessionId, prompt: '修改 hello', scenario: 'edit' });
    await waitFor(() => Boolean(events.find((event) => event.eventKind === 'approval.requested')));
    const firstApproval = events.find((event) => event.eventKind === 'approval.requested').data;
    await host.approveTask({ taskId: first.taskId, approvalId: firstApproval.approvalId, planHash: firstApproval.planHash, workspaceBaseHash: firstApproval.workspaceBaseHash });
    await waitFor(() => Boolean(events.find((event) => event.eventKind === 'task.completed')));
    const undo = host.prepareUndo({ sessionId: session.sessionId, taskId: first.taskId });
    await waitFor(() => Boolean(events.find((event) => event.taskId === undo.taskId && event.eventKind === 'approval.requested')));
    const undoApproval = events.find((event) => event.taskId === undo.taskId && event.eventKind === 'approval.requested').data;
    expect(undoApproval.planHash).not.toBe(firstApproval.planHash);
    expect(fs.readFileSync(path.join(root, 'src', 'hello.ts'), 'utf8')).toContain('A2 Replay edit');
    await host.approveTask({ taskId: undo.taskId, approvalId: undoApproval.approvalId, planHash: undoApproval.planHash, workspaceBaseHash: undoApproval.workspaceBaseHash });
    await waitFor(() => events.some((event) => event.taskId === undo.taskId && event.eventKind === 'task.completed'));
    expect(fs.readFileSync(path.join(root, 'src', 'hello.ts'), 'utf8')).toBe('export const hello = "world";\r\n');
  });
});
