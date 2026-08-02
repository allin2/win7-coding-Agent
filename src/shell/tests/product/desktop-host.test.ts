import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { createDesktopHost } = require('../../product/desktop-host') as {
  createDesktopHost(options?: { onTaskEvent?: (event: any) => void }): any;
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
});
