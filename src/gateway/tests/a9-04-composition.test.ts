/**
 * A9-04 真实组合测试：A9AgentLoop → OpenAICompatibleProvider → 本地
 * OpenAI-compatible fixture → read/edit/shell tool_calls → 第二轮模型请求
 * → 最终回答。
 *
 * 不 Mock AgentLoop、Provider、Workspace 或 Runner：四者均为真实实现，
 * 仅模型服务端是本地 HTTP fixture（回环地址）。
 */
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { OpenAICompatibleProvider } from '../src';
import { A9AgentLoop, PermissionMode, TurnOutcome } from '../../core/src';
import { A9WorkspaceService } from '../../workspace/src';
import { TrustedShellRunner, createTrustedShellLoopAdapter } from '../../runner/src';

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

interface FixtureServer {
  baseUrl: string;
  requestBodies: any[];
  close: () => Promise<void>;
}

function startFixture(): Promise<FixtureServer> {
  const requestBodies: any[] = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        let parsed: any = {};
        try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
        requestBodies.push(parsed);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });

        const toolMessages = (parsed.messages ?? []).filter((m: any) => m.role === 'tool');
        const toolNames = toolMessages.map((m: any) => m.name || m.tool_call_id);

        if (toolMessages.length === 0) {
          // 第 1 轮：读文件。
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_read', function: { name: 'read', arguments: '{"path":"calc.ts"}' } }] }, finish_reason: 'tool_calls' }] });
        } else if (toolNames.includes('read') && !toolNames.includes('edit')) {
          // 第 2 轮：修复缺陷。
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_edit', function: { name: 'edit', arguments: JSON.stringify({ path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' }) } }] }, finish_reason: 'tool_calls' }] });
        } else if (toolNames.includes('edit') && !toolNames.includes('shell')) {
          // 第 3 轮：运行验证命令。
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_shell', function: { name: 'shell', arguments: JSON.stringify({ command: String.raw`node -e "if (1 + 2 !== 3) process.exit(1); console.log('verified: calc fixed')"` }) } }] }, finish_reason: 'tool_calls' }] });
        } else {
          // 第 4 轮：最终回答。
          sse(res, { choices: [{ delta: { content: 'Bug fixed: calc.ts now returns a + b; verification command passed.' }, finish_reason: 'stop' }] });
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as import('net').AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        requestBodies,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

describe('A9-04 composition: real loop + real provider + local fixture + real workspace + real runner', () => {
  let tempWorkspace: string;
  let fixture: FixtureServer;

  beforeAll(async () => {
    fixture = await startFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(() => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-compose-'));
    fs.writeFileSync(path.join(tempWorkspace, 'calc.ts'), 'export function add(a: number, b: number) {\n  return a - b;\n}\n', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tempWorkspace, { recursive: true, force: true });
  });

  it('completes a read → edit → shell → final-answer journey across model rounds', async () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl: fixture.baseUrl,
      model: 'fixture-model',
      apiKey: 'sk-fixture-only',
      timeoutMs: 10_000,
      totalTimeoutMs: 30_000,
    });

    const workspaceService = new A9WorkspaceService(tempWorkspace);
    const trustedRunner = new TrustedShellRunner();
    const runnerAdapter = createTrustedShellLoopAdapter(trustedRunner);

    const loop = new A9AgentLoop({
      workspaceRoot: tempWorkspace,
      provider,
      workspaceService,
      runner: runnerAdapter,
      permissionMode: PermissionMode.FULL_ACCESS,
    });

    const result = await loop.runTurn('Fix the bug in calc.ts and verify it');

    expect(result.outcome).toBe(TurnOutcome.COMPLETED);
    expect(result.finalMessage).toContain('Bug fixed');
    expect(result.toolCallsExecuted).toBe(3);

    // 文件被真实修复。
    expect(fs.readFileSync(path.join(tempWorkspace, 'calc.ts'), 'utf8')).toContain('return a + b;');

    // 四次模型请求，后三次携带完整 tool 协议事实。
    expect(fixture.requestBodies.length).toBe(4);
    const secondRequest = fixture.requestBodies[1];
    const assistantMsg = secondRequest.messages.find((m: any) => m.role === 'assistant' && Array.isArray(m.tool_calls));
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.tool_calls[0].id).toBe('call_read');
    expect(assistantMsg.tool_calls[0].function.name).toBe('read');
    const toolMsg = secondRequest.messages.find((m: any) => m.role === 'tool');
    expect(toolMsg.tool_call_id).toBe('call_read');
    expect(toolMsg.name).toBe('read');
    expect(toolMsg.content).toContain('return a - b;');

    // shell 工具真实执行（fixture 收到工具结果）。
    const fourthRequest = fixture.requestBodies[3];
    const shellToolMsg = fourthRequest.messages.find((m: any) => m.role === 'tool' && m.name === 'shell');
    expect(shellToolMsg.content).toContain('verified: calc fixed');
  }, 30_000);
});

describe('A9-04 fixtures: two behaviorally different compatible servers', () => {
  it('fixture A (single tool call, split argument deltas) and fixture B (parallel calls in one delta) both work', async () => {
    // Fixture A：参数 JSON 拆分到多个 delta；usage 事件单独出现。
    const fixtureA = await new Promise<FixtureServer>((resolve) => {
      const requestBodies: any[] = [];
      const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
        req.on('end', () => {
          requestBodies.push(JSON.parse(body));
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a1', function: { name: 'search', arguments: '{"pat' } }] } }] });
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'tern":"a9"}' } }] }, finish_reason: 'tool_calls' }] });
          sse(res, { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } });
          res.write('data: [DONE]\n\n');
          res.end();
        });
      });
      server.listen(0, '127.0.0.1', () => resolve({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, requestBodies, close: () => new Promise<void>((d) => server.close(() => d())) }));
    });

    // Fixture B：一个 delta 内并行返回两个工具调用 + content 前缀。
    const fixtureB = await new Promise<FixtureServer>((resolve) => {
      const requestBodies: any[] = [];
      const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
        req.on('end', () => {
          requestBodies.push(JSON.parse(body));
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          sse(res, { choices: [{ delta: { content: 'Working' } }] });
          sse(res, { choices: [{ delta: { tool_calls: [
            { index: 0, id: 'b1', function: { name: 'list', arguments: '{}' } },
            { index: 1, id: 'b2', function: { name: 'update_plan', arguments: '{"plan":"1. survey"}' } },
          ] }, finish_reason: 'tool_calls' }] });
          res.write('data: [DONE]\n\n');
          res.end();
        });
      });
      server.listen(0, '127.0.0.1', () => resolve({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, requestBodies, close: () => new Promise<void>((d) => server.close(() => d())) }));
    });

    try {
      const providerA = new OpenAICompatibleProvider({ baseUrl: fixtureA.baseUrl, model: 'fa' });
      const responseA = await providerA.sendStreamRequest({ id: 'a', model: 'fa', messages: [{ role: 'user', content: 'x' }] }, () => {});
      expect(responseA.toolCalls).toEqual([{ id: 'a1', name: 'search', arguments: '{"pattern":"a9"}' }]);
      expect(responseA.usage?.totalTokens).toBe(14);

      const providerB = new OpenAICompatibleProvider({ baseUrl: fixtureB.baseUrl, model: 'fb' });
      const responseB = await providerB.sendStreamRequest({ id: 'b', model: 'fb', messages: [{ role: 'user', content: 'x' }] }, () => {});
      expect(responseB.toolCalls?.map((t) => t.name)).toEqual(['list', 'update_plan']);
      expect(responseB.content).toBe('Working');
    } finally {
      await fixtureA.close();
      await fixtureB.close();
    }
  });
});
