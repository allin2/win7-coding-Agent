import * as http from 'http';
import {
  OpenAICompatibleProvider,
  FinishReason,
  ErrorCode,
} from '../src';

describe('A9-04: OpenAICompatibleProvider', () => {
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      if (req.url?.includes('/chat/completions')) {
        let body = '';
        req.on('data', (d) => { body += d; });
        req.on('end', () => {
          const parsed = JSON.parse(body);

          // 模拟 401 场景
          if (parsed.model === 'invalid-auth-model') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Unauthorized' } }));
            return;
          }

          // 模拟普通流式输出
          if (parsed.messages?.[0]?.content?.includes('hello')) {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello ' }, finish_reason: null }] })}\n\n`);
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'world!' }, finish_reason: 'stop' }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }

          // 模拟 Tool Calling 流式输出
          if (parsed.tools && parsed.tools.length > 0) {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'probe_test_echo', arguments: '{"message":' } }] }, finish_reason: null }] })}\n\n`);
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write('data: [DONE]\n\n');
          res.end();
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      serverPort = addr.port;
      baseUrl = `http://127.0.0.1:${serverPort}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('accepts vendor-neutral base URL, custom model, and custom headers', () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'http://custom-host:8080/v1',
      model: 'qwen2.5-coder-32b',
      customHeaders: { 'X-Custom-Auth': 'token123' },
    });

    expect(provider.getBaseUrl()).toBe('http://custom-host:8080/v1');
    expect(provider.getModel()).toBe('qwen2.5-coder-32b');
  });

  it('streams text completions and aggregates content chunks', async () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl,
      model: 'test-model',
      apiKey: 'test-key',
    });

    const chunks: string[] = [];
    const response = await provider.sendStreamRequest(
      {
        id: 'req-1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'hello' }],
      },
      (chunk) => {
        chunks.push(chunk.content);
      },
    );

    expect(response.content).toBe('Hello world!');
    expect(chunks).toEqual(['Hello ', 'world!']);
    expect(response.finishReason).toBe(FinishReason.STOP);
  });

  it('streams tool_calls and parses function arguments', async () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl,
      model: 'test-model',
    });

    const response = await provider.sendStreamRequest(
      {
        id: 'req-2',
        model: 'test-model',
        messages: [{ role: 'user', content: 'run tool' }],
        tools: [{ name: 'probe_test_echo', description: 'test', parameters: {} }],
      },
      () => {},
    );

    expect(response.finishReason).toBe(FinishReason.TOOL_CALLS);
    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls?.[0].name).toBe('probe_test_echo');
    expect(response.toolCalls?.[0].arguments).toBe('{"message":"probe_ok"}');
  });

  it('performs capability probe and reports successful tool calling', async () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl,
      model: 'test-model',
    });

    const probeRes = await provider.probeCapability();
    expect(probeRes.ok).toBe(true);
    expect(probeRes.hasToolCalling).toBe(true);
    expect(probeRes.hasStreaming).toBe(true);
  });

  it('fails fast without infinite retry on 401 unauthorized', async () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl,
      model: 'invalid-auth-model',
      retryConfig: { maxRetries: 3, initialDelayMs: 50, maxDelayMs: 200, backoffMultiplier: 2 },
    });

    await expect(
      provider.sendStreamRequest(
        {
          id: 'req-auth-fail',
          model: 'invalid-auth-model',
          messages: [{ role: 'user', content: 'test' }],
        },
        () => {},
      ),
    ).rejects.toThrow(/status 401/);
  });
});
