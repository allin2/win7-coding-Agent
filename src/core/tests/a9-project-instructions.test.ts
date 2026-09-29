import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { A9AgentLoop, A9LoopMessage, A9ModelPort, PermissionMode } from '../src';
import { loadProjectInstructions } from '../src/a9-project-instructions';

describe('A9-26 workspace-root project instructions', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-r2-'));
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const load = (workspace: string, secret = 'KNOWN_SECRET') => loadProjectInstructions(workspace, {
    containsSensitiveData: (value) => String(value).includes(secret),
  });

  it('R2-01 three turns keep one instruction message directly after System Prompt', async () => {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Use the local rule.\n', 'utf8');
    const requests: A9LoopMessage[][] = [];
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockImplementation(async (request) => {
      requests.push(request.messages.map((message: A9LoopMessage) => ({ ...message })));
      return { id: 'done', content: 'done', finishReason: 'stop' };
    }) };
    const events: any[] = [];
    const loop = new A9AgentLoop({ workspaceRoot: root, provider, workspaceService: {} as any, runner: {} as any,
      permissionMode: PermissionMode.READ_ONLY, loadProjectInstructions: () => load(root),
      onEvent: (event) => events.push(event) });
    await loop.runTurn('one');
    await loop.runTurn('two');
    await loop.runTurn('three');
    expect(requests).toHaveLength(3);
    for (const messages of requests) {
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toContain('<project_instructions source="AGENTS.md"');
      expect(messages.filter((message) => message.content.startsWith('<project_instructions'))).toHaveLength(1);
    }
    expect(events.filter((event) => event.type === 'turn_started').map((event) => event.data.projectInstructions.status))
      .toEqual(['loaded', 'loaded', 'loaded']);
  });

  it('R2-02 edits between turns replace content and sha256', async () => {
    const target = path.join(root, 'AGENTS.md');
    fs.writeFileSync(target, 'first\n', 'utf8');
    const requests: A9LoopMessage[][] = [];
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockImplementation(async (request) => {
      requests.push(request.messages.map((message: A9LoopMessage) => ({ ...message })));
      return { id: 'done', content: 'done', finishReason: 'stop' };
    }) };
    const loop = new A9AgentLoop({ workspaceRoot: root, provider, workspaceService: {} as any, runner: {} as any,
      loadProjectInstructions: () => load(root) });
    await loop.runTurn('one');
    fs.writeFileSync(target, 'second\n', 'utf8');
    await loop.runTurn('two');
    expect(requests[0][1].content).toContain('first');
    expect(requests[1][1].content).toContain('second');
    expect(requests[1][1].content).not.toContain('first');
    expect(requests[0][1].content.match(/sha256="([a-f0-9]+)"/)?.[1])
      .not.toBe(requests[1][1].content.match(/sha256="([a-f0-9]+)"/)?.[1]);
  });

  it('R2-03 absent, oversized, invalid UTF-8 and known-secret files do not expose content', () => {
    const target = path.join(root, 'AGENTS.md');
    expect(load(root).status).toBe('absent');
    fs.writeFileSync(target, Buffer.alloc(32 * 1024 + 1, 65));
    expect(load(root)).toMatchObject({ status: 'too_large', bytes: 32 * 1024 + 1 });
    fs.writeFileSync(target, Buffer.from([0xc3, 0x28]));
    expect(load(root).status).toBe('decode_error');
    fs.writeFileSync(target, 'rule KNOWN_SECRET\n', 'utf8');
    const blocked = load(root);
    expect(blocked.status).toBe('secret_blocked');
    expect(blocked.content).toBeUndefined();
    expect(JSON.stringify(blocked)).not.toContain('KNOWN_SECRET');
  });

  it('R2-03 secret-blocked instructions leave the turn and Provider request clean', async () => {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'KNOWN_SECRET instruction', 'utf8');
    const events: any[] = [];
    const requests: A9LoopMessage[][] = [];
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockImplementation(async (request) => {
      requests.push(request.messages);
      return { id: 'done', content: 'done', finishReason: 'stop' };
    }) };
    const loop = new A9AgentLoop({ workspaceRoot: root, provider, workspaceService: {} as any, runner: {} as any,
      loadProjectInstructions: () => load(root), onEvent: (event) => events.push(event) });
    const result = await loop.runTurn('ordinary prompt');
    expect(result.outcome).toBe('completed');
    expect(events.find((event) => event.type === 'turn_started').data.projectInstructions.status).toBe('secret_blocked');
    expect(JSON.stringify(requests)).not.toContain('KNOWN_SECRET');
    expect(JSON.stringify(events)).not.toContain('KNOWN_SECRET');
  });

  it('R2-04 Chinese and space paths work; an outside symlink is refused', () => {
    const workspace = path.join(root, '中文 空格');
    fs.mkdirSync(workspace);
    const target = path.join(workspace, 'AGENTS.md');
    fs.writeFileSync(target, '\uFEFF中文规则\n', 'utf8');
    expect(load(workspace)).toMatchObject({ status: 'loaded', content: '中文规则\n' });
    fs.unlinkSync(target);
    const outside = path.join(root, 'outside.md');
    fs.writeFileSync(outside, 'outside', 'utf8');
    fs.symlinkSync(outside, target);
    expect(load(workspace)).toMatchObject({ status: 'outside' });
  });

  it('R2-05 exported and restored history never contains project instruction content', async () => {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'private project rule', 'utf8');
    const provider: A9ModelPort = { sendStreamRequest: jest.fn().mockResolvedValue({ id: 'done', content: 'done', finishReason: 'stop' }) };
    const config = { workspaceRoot: root, provider, workspaceService: {} as any, runner: {} as any,
      loadProjectInstructions: () => load(root) };
    const first = new A9AgentLoop(config);
    await first.runTurn('one');
    const exported = first.getConversationHistory();
    expect(JSON.stringify(exported)).not.toContain('private project rule');
    const second = new A9AgentLoop(config);
    second.restoreConversationHistory([{ role: 'system', content: '<project_instructions source="AGENTS.md">old secret</project_instructions>' }, ...exported]);
    expect(JSON.stringify(second.getConversationHistory())).not.toContain('old secret');
  });
});
