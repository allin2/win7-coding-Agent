import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { ErrorCode, FinishReason, OpenAICompatibleProvider } from '../src';
import { A9AgentLoop, PermissionMode } from '../../core/src';
import { A9WorkspaceService } from '../../workspace/src';
import { TrustedShellRunner, createTrustedShellLoopAdapter } from '../../runner/src';

function sse(res: http.ServerResponse, value: unknown): void {
  res.write(`data: ${JSON.stringify(value)}\n\n`);
}

async function fixture(write: (res: http.ServerResponse) => void): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    write(res);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function coreLoopFixture(write: (res: http.ServerResponse, requestCount: number) => void): Promise<{
  url: string;
  requests: number;
  close: () => Promise<void>;
  getRequests: () => number;
}> {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests += 1;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    write(res, requests);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    getRequests: () => requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function makeRealCoreLoop(baseUrl: string, workspaceRoot: string): Promise<A9AgentLoop> {
  const provider = new OpenAICompatibleProvider({ baseUrl, model: 'm' });
  const runner = new TrustedShellRunner();
  const workspaceService = new A9WorkspaceService(workspaceRoot);
  if (fs.existsSync(path.join(workspaceRoot, 'note.txt'))) {
    await workspaceService.read('note.txt', { encoding: 'utf-8' });
  }
  return new A9AgentLoop({
    workspaceRoot,
    provider,
    workspaceService,
    runner: createTrustedShellLoopAdapter(runner),
    permissionMode: PermissionMode.FULL_ACCESS,
  });
}

function request(url: string, tools = false) {
  return new OpenAICompatibleProvider({ baseUrl: url, model: 'm' }).sendStreamRequest(
    {
      id: 'a9-29',
      model: 'm',
      messages: [{ role: 'user', content: 'test' }],
      ...(tools ? { tools: [{ name: 'read', description: 'read', parameters: {} }] } : {}),
    },
    () => {},
  );
}

describe('A9-29 Provider response completeness', () => {
  it('accepts tool_calls with an explicit finish and DONE', async () => {
    const f = await fixture((res) => {
      sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'read', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
      res.write('data: [DONE]\n\n');
    });
    try {
      const response = await request(f.url, true);
      expect(response.finishReason).toBe(FinishReason.TOOL_CALLS);
      expect(response.toolCalls?.[0].id).toBe('c1');
    } finally { await f.close(); }
  });

  it('accepts tool_calls with an explicit finish and normal EOF without DONE', async () => {
    const f = await fixture((res) => {
      sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'read', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
    });
    try {
      const response = await request(f.url, true);
      expect(response.finishReason).toBe(FinishReason.TOOL_CALLS);
      expect(response.toolCalls).toHaveLength(1);
    } finally { await f.close(); }
  });

  it.each([
    ['only DONE', (res: http.ServerResponse) => res.write('data: [DONE]\n\n')],
    ['no finish reason', (res: http.ServerResponse) => sse(res, { choices: [{ delta: { content: 'partial' } }] })],
    ['empty stream', (_res: http.ServerResponse) => {}],
  ])('rejects %s without a complete response contract', async (_name, write) => {
    const f = await fixture(write);
    try {
      await expect(request(f.url)).rejects.toMatchObject({ code: ErrorCode.STREAM_INTERRUPTED });
    } finally { await f.close(); }
  });

  it('rejects stop plus non-empty tool calls instead of executing them', async () => {
    const f = await fixture((res) => {
      sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'read', arguments: '{}' } }] }, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
    });
    try {
      await expect(request(f.url, true)).rejects.toThrow(/tool calls with stop/);
    } finally { await f.close(); }
  });

  it('rejects data emitted after DONE', async () => {
    const f = await fixture((res) => {
      sse(res, { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      sse(res, { choices: [{ delta: { content: 'late' }, finish_reason: 'stop' }] });
    });
    try {
      await expect(request(f.url)).rejects.toMatchObject({ code: ErrorCode.STREAM_INTERRUPTED });
    } finally { await f.close(); }
  });

  it('rejects conflicting finish reasons', async () => {
    const f = await fixture((res) => {
      sse(res, { choices: [{ delta: { content: 'partial' }, finish_reason: 'stop' }] });
      sse(res, { choices: [{ delta: {}, finish_reason: 'length' }] });
      res.write('data: [DONE]\n\n');
    });
    try {
      await expect(request(f.url)).rejects.toMatchObject({ code: ErrorCode.STREAM_INTERRUPTED });
    } finally { await f.close(); }
  });

  it('rejects tool deltas appended after a tool_calls finish frame', async () => {
    const f = await fixture((res) => {
      sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
      sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'late', function: { name: 'edit', arguments: '{}' } }] } }] });
    });
    try {
      await expect(request(f.url, true)).rejects.toMatchObject({ code: ErrorCode.STREAM_INTERRUPTED });
    } finally { await f.close(); }
  });

  it('does not map legacy function_call finish to executable tool_calls', async () => {
    const f = await fixture((res) => {
      sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'legacy-tool', function: { name: 'edit', arguments: '{}' } }] }, finish_reason: 'function_call' }] });
      res.write('data: [DONE]\n\n');
    });
    try {
      await expect(request(f.url, true)).rejects.toMatchObject({ code: ErrorCode.STREAM_INTERRUPTED });
    } finally { await f.close(); }
  });

  it.each(['length', 'content_filter'])('preserves %s and discards incomplete tool calls', async (finishReason) => {
    const f = await fixture((res) => {
      sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'read', arguments: '{}' } }] }, finish_reason: finishReason }] });
      res.write('data: [DONE]\n\n');
    });
    try {
      const response = await request(f.url, true);
      expect(response.finishReason).toBe(finishReason);
      expect(response.toolCalls).toBeUndefined();
    } finally { await f.close(); }
  });
});

describe('A9-29 Gateway to real Core execution boundary', () => {
  it.each(['tool_calls', 'missing', 'length', 'content_filter', 'stop', 'after_finish', 'after_done'])
    ('real workspace applies only the complete tool_calls response (%s)', async (scenario) => {
      const f = await coreLoopFixture((res, requestCount) => {
        if (requestCount > 1) {
          sse(res, { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] });
          res.write('data: [DONE]\n\n');
          return;
        }
        const edit = { choices: [{ delta: { tool_calls: [{ index: 0, id: 'edit-1', function: { name: 'edit',
          arguments: '{"path":"note.txt","old_text":"original","new_text":"changed"}' } }] },
          ...(scenario === 'missing' ? {} : { finish_reason: ['length', 'content_filter', 'stop'].includes(scenario) ? scenario : 'tool_calls' }) }] };
        if (scenario === 'after_finish') sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
        if (scenario === 'after_done') res.write('data: [DONE]\n\n');
        sse(res, edit);
      });
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-29-core-edit-'));
      const target = path.join(workspace, 'note.txt');
      fs.writeFileSync(target, 'original', 'utf8');
      try {
        const loop = await makeRealCoreLoop(f.url, workspace);
        const result = await loop.runTurn('edit note');
        const complete = scenario === 'tool_calls';
        expect(result.outcome).toBe(complete ? 'completed_with_warnings' : 'failed');
        expect(fs.readFileSync(target, 'utf8')).toBe(complete ? 'changed' : 'original');
        expect(result.toolCallsExecuted).toBe(complete ? 1 : 0);
        expect(f.getRequests()).toBe(complete ? 2 : 1);
      } finally {
        await f.close();
        fs.rmSync(workspace, { recursive: true, force: true });
      }
    });

  it('completes a no-tool control with one provider request', async () => {
    const f = await coreLoopFixture((res) => {
      sse(res, { choices: [{ delta: { content: 'control complete' }, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
    });
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-29-core-control-'));
    try {
      const result = await (await makeRealCoreLoop(f.url, workspace)).runTurn('answer without tools');
      expect(result.finalMessage).toContain('control complete');
      expect(f.getRequests()).toBe(1);
    } finally {
      await f.close();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('does not execute an edit when tool arguments are invalid JSON and does not retry', async () => {
    const f = await coreLoopFixture((res) => {
      sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad-edit', function: { name: 'edit', arguments: '{"path":' } }] }, finish_reason: 'tool_calls' }] });
      res.write('data: [DONE]\n\n');
    });
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-29-core-invalid-'));
    const target = path.join(workspace, 'note.txt');
    fs.writeFileSync(target, 'original', 'utf8');
    try {
      await (await makeRealCoreLoop(f.url, workspace)).runTurn('edit note');
      expect(fs.readFileSync(target, 'utf8')).toBe('original');
      expect(f.getRequests()).toBe(1);
    } finally {
      await f.close();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
