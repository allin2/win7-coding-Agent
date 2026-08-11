import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createDesktopHost } = require('../../product/desktop-host') as {
  createDesktopHost(options?: {
    onTaskEvent?: (event: any) => void;
    runner?: { execute(request: any): Promise<any> };
    runnerAcceptanceAction?: Record<string, unknown>;
  }): any;
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
