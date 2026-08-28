/**
 * A9-04 回归测试：OpenAI-compatible Provider 协议合同。
 *
 * 覆盖审查缺陷：多轮 assistant tool_calls / tool_call_id / 工具名回传（修复
 * 第二次请求 400）、SSE 跨 chunk 行与末尾无换行 buffer、[DONE]、畸形事件
 * 结构化错误、RetryConfig 参数真实生效、401/403/400 不重试、代理真实生效、
 * 无数据超时取消、AbortSignal 监听器移除、API Key 不进入错误文本。
 */
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  OpenAICompatibleProvider,
  FinishReason,
  TLSVersion,
} from '../src';

interface CapturedRequest {
  url: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function startFixture(handler: (req: http.IncomingMessage, res: http.ServerResponse, captured: CapturedRequest) => void): Promise<{ server: http.Server; baseUrl: string; requests: CapturedRequest[]; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const requests: CapturedRequest[] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        let parsed: any = {};
        try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
        const captured: CapturedRequest = { url: req.url || '', headers: req.headers, body: parsed };
        requests.push(captured);
        handler(req, res, captured);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as import('net').AddressInfo;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
        requests,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

describe('A9-04: multi-turn tool protocol', () => {
  it('sends assistant tool_calls, tool_call_id and tool name on the second request (no 400)', async () => {
    const fixture = await startFixture((_req, res, captured) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (captured.body.messages?.some((m: any) => m.role === 'tool')) {
        // 第二轮：收到 tool 结果后给出最终回答。
        sse(res, { choices: [{ delta: { content: 'All tools done.' }, finish_reason: 'stop' }] });
      } else {
        sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'read', arguments: '{"path":"a.ts"}' } }] }, finish_reason: 'tool_calls' }] });
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'm1' });
      const first = await provider.sendStreamRequest(
        { id: 'r1', model: 'm1', messages: [{ role: 'user', content: 'go' }] },
        () => {},
      );
      expect(first.finishReason).toBe(FinishReason.TOOL_CALLS);
      expect(first.toolCalls?.[0].id).toBe('call_a');

      const second = await provider.sendStreamRequest(
        {
          id: 'r2',
          model: 'm1',
          messages: [
            { role: 'user', content: 'go' },
            { role: 'assistant', content: '', toolCalls: first.toolCalls },
            { role: 'tool', toolCallId: 'call_a', name: 'read', content: 'file content' },
          ],
        },
        () => {},
      );
      expect(second.content).toBe('All tools done.');

      const secondBody = fixture.requests[1].body;
      const assistant = secondBody.messages.find((m: any) => m.role === 'assistant');
      expect(assistant.tool_calls).toEqual([
        { id: 'call_a', type: 'function', function: { name: 'read', arguments: '{"path":"a.ts"}' } },
      ]);
      const toolMsg = secondBody.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg.tool_call_id).toBe('call_a');
      expect(toolMsg.name).toBe('read');
    } finally {
      await fixture.close();
    }
  });

  it('keeps protocol association for multiple parallel tool calls executed sequentially', async () => {
    const fixture = await startFixture((_req, res, captured) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const toolMsgs = (captured.body.messages ?? []).filter((m: any) => m.role === 'tool');
      if (toolMsgs.length === 0) {
        sse(res, { choices: [{ delta: { tool_calls: [
          { index: 0, id: 'call_x', function: { name: 'list', arguments: '{}' } },
          { index: 1, id: 'call_y', function: { name: 'search', arguments: '{"pattern":"x"}' } },
        ] }, finish_reason: 'tool_calls' }] });
      } else if (toolMsgs.length === 2) {
        sse(res, { choices: [{ delta: { content: 'both results received' }, finish_reason: 'stop' }] });
      } else {
        // 只回执了部分 tool 结果时继续等待（真实服务会 400；fixture 宽容）。
        sse(res, { choices: [{ delta: { content: 'waiting' }, finish_reason: null }] });
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'm1' });
      const first = await provider.sendStreamRequest({ id: 'r1', model: 'm1', messages: [{ role: 'user', content: 'go' }] }, () => {});
      expect(first.toolCalls?.map((t) => t.id)).toEqual(['call_x', 'call_y']);
      const second = await provider.sendStreamRequest({
        id: 'r2',
        model: 'm1',
        messages: [
          { role: 'user', content: 'go' },
          { role: 'assistant', content: '', toolCalls: first.toolCalls },
          { role: 'tool', toolCallId: 'call_x', name: 'list', content: 'ok1' },
          { role: 'tool', toolCallId: 'call_y', name: 'search', content: 'ok2' },
        ],
      }, () => {});
      expect(second.content).toBe('both results received');
    } finally {
      await fixture.close();
    }
  });
});

describe('A9-04: SSE parser edge cases', () => {
  it('parses lines split across chunks and a final event without trailing newline', async () => {
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const event = JSON.stringify({ choices: [{ delta: { content: 'split-ok' }, finish_reason: 'stop' }] });
      const half = `data: ${event}`;
      // 跨 chunk 拆分行。
      res.write(half.slice(0, 20));
      setTimeout(() => {
        res.write(half.slice(20));
        res.write('\n\n');
        // 末尾无换行的残余事件。
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })}`);
        res.end();
      }, 60);
    });
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'm', timeoutMs: 5000, noDataTimeoutMs: 5000 });
      const response = await provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {});
      expect(response.content).toBe('split-ok');
      expect(response.usage?.totalTokens).toBe(7);
    } finally {
      await fixture.close();
    }
  });

  it('returns a structured error for malformed complete SSE events', async () => {
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {not valid json}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'm' });
      await expect(provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {}))
        .rejects.toThrow(/Malformed SSE events/);
    } finally {
      await fixture.close();
    }
  });

  it('handles keepalive comments, CRLF, and missing explicit [DONE]', async () => {
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': keepalive\r\n');
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'crlf-ok' } }] })}\r\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\r\n`);
      res.end();
    });
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'm' });
      const response = await provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {});
      expect(response.content).toBe('crlf-ok');
      expect(response.finishReason).toBe(FinishReason.STOP);
    } finally {
      await fixture.close();
    }
  });
});

describe('A9-04: retry, timeout and proxy behavior', () => {
  it('retries 5xx with RetryConfig delays and succeeds', async () => {
    let hits = 0;
    const fixture = await startFixture((_req, res) => {
      hits += 1;
      if (hits <= 2) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'boom' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sse(res, { choices: [{ delta: { content: 'recovered' }, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const started = Date.now();
      const provider = new OpenAICompatibleProvider({
        baseUrl: fixture.baseUrl,
        model: 'm',
        retryConfig: { maxRetries: 3, initialDelayMs: 60, maxDelayMs: 500, backoffMultiplier: 3 },
      });
      const response = await provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {});
      expect(response.content).toBe('recovered');
      expect(hits).toBe(3);
      // initialDelayMs=60 * multiplier^attempt：60 + 180 = 240ms 下限。
      expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    } finally {
      await fixture.close();
    }
  });

  it('does not retry 400 parameter/tool-format errors', async () => {
    let hits = 0;
    const fixture = await startFixture((_req, res) => {
      hits += 1;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'assistant tool_calls missing' } }));
    });
    try {
      const provider = new OpenAICompatibleProvider({
        baseUrl: fixture.baseUrl,
        model: 'm',
        retryConfig: { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 20, backoffMultiplier: 2 },
      });
      await expect(provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {}))
        .rejects.toThrow(/status 400/);
      expect(hits).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it('cancels the request when no SSE data arrives within noDataTimeoutMs', async () => {
    const fixture = await startFixture((_req, res) => {
      // 接受请求但从不响应。
      void res;
    });
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'm', noDataTimeoutMs: 150, timeoutMs: 10_000, totalTimeoutMs: 10_000 });
      await expect(provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {}))
        .rejects.toThrow(/No SSE data received/);
    } finally {
      await fixture.close();
    }
  });

  it('enforces totalTimeoutMs across attempts', async () => {
    const fixture = await startFixture((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'unavailable' } }));
    });
    try {
      const provider = new OpenAICompatibleProvider({
        baseUrl: fixture.baseUrl,
        model: 'm',
        totalTimeoutMs: 120,
        retryConfig: { maxRetries: 10, initialDelayMs: 50, maxDelayMs: 60_000, backoffMultiplier: 2 },
      });
      await expect(provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {}))
        .rejects.toThrow(/Total timeout/i);
    } finally {
      await fixture.close();
    }
  });

  it('removes the AbortSignal listener after the request settles', async () => {
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sse(res, { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const controller = new AbortController();
      const addCalls: string[] = [];
      const removeCalls: string[] = [];
      const signal = Object.create(controller.signal, {}) as AbortSignal;
      const origAdd = controller.signal.addEventListener.bind(controller.signal);
      const origRemove = controller.signal.removeEventListener.bind(controller.signal);
      (signal as any).addEventListener = (type: string, listener: any, opts: any) => {
        addCalls.push(type);
        return origAdd(type, listener, opts);
      };
      (signal as any).removeEventListener = (type: string, listener: any, opts: any) => {
        removeCalls.push(type);
        return origRemove(type, listener, opts);
      };

      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'm' });
      await provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {}, { signal });
      expect(addCalls).toContain('abort');
      expect(removeCalls).toContain('abort');
    } finally {
      await fixture.close();
    }
  });

  it('routes plain-HTTP targets through an HTTP proxy in absolute form', async () => {
    // 目标 fixture（真实后端）。
    const backend = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sse(res, { choices: [{ delta: { content: 'via proxy' }, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    // 代理：验证收到绝对形式请求后转发。
    let proxiedPath = '';
    let proxyAuthHeader = '';
    const proxy = await new Promise<{ server: http.Server; close: () => Promise<void> }>((resolve) => {
      const server = http.createServer((preq, pres) => {
        proxiedPath = preq.url || '';
        proxyAuthHeader = String(preq.headers['proxy-authorization'] || '');
        const target = preq.url!.startsWith('http') ? new URL(preq.url!) : undefined;
        if (!target) {
          pres.writeHead(400);
          pres.end('expected absolute-form');
          return;
        }
        const fwd = http.request(
          { hostname: target.hostname, port: target.port, path: target.pathname, method: preq.method, headers: { ...preq.headers, host: target.host } },
          (upstream) => {
            pres.writeHead(upstream.statusCode || 502, upstream.headers);
            upstream.pipe(pres);
          },
        );
        fwd.on('error', () => {
          pres.writeHead(502);
          pres.end('upstream error');
        });
        preq.pipe(fwd);
      });
      server.listen(0, '127.0.0.1', () => {
        resolve({ server, close: () => new Promise<void>((done) => server.close(() => done())) });
      });
    });
    try {
      const backendUrl = new URL(backend.baseUrl);
      const provider = new OpenAICompatibleProvider({
        baseUrl: backend.baseUrl,
        model: 'm',
        proxyConfig: {
          host: '127.0.0.1',
          port: (proxy.server.address() as import('net').AddressInfo).port,
          auth: { username: 'user', password: 'pass' },
        },
      });
      const response = await provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {});
      expect(response.content).toBe('via proxy');
      expect(proxiedPath.startsWith('http://')).toBe(true);
      expect(proxiedPath).toContain('/v1/chat/completions');
      expect(proxyAuthHeader.startsWith('Basic ')).toBe(true);
      void backendUrl;
    } finally {
      await proxy.close();
      await backend.close();
    }
  });

  it('redacts the API key from server error bodies', async () => {
    const secret = 'sk-super-secret-123456';
    const fixture = await startFixture((req, res) => {
      void req;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `key ${secret} rejected (echo)` } }));
    });
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'm', apiKey: secret, retryConfig: { maxRetries: 0, initialDelayMs: 1, maxDelayMs: 1, backoffMultiplier: 1 } });
      await expect(provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {}))
        .rejects.toThrow(/\*\*\*redacted-api-key\*\*\*/);
    } finally {
      await fixture.close();
    }
  });

  it('never puts the API key into the JSON payload sent to the model', async () => {
    const secret = 'sk-payload-secret-999';
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sse(res, { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] });
      res.end();
    });
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'm', apiKey: secret });
      await provider.sendStreamRequest({ id: 'r', model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {});
      expect(JSON.stringify(fixture.requests[0].body)).not.toContain(secret);
      expect(String(fixture.requests[0].headers.authorization)).toBe(`Bearer ${secret}`);
    } finally {
      await fixture.close();
    }
  });
});

describe('A9-04: custom TLS/CA configuration surface', () => {
  it('accepts an existing CA bundle and rejects every TLS verification bypass', async () => {
    const caDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-ca-'));
    try {
      const caPath = path.join(caDir, 'ca.pem');
      fs.writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\nplaceholder\n-----END CERTIFICATE-----\n');
      const provider = new OpenAICompatibleProvider({
        baseUrl: 'https://internal-gateway.example.com',
        model: 'm',
        tlsConfig: { caBundle: caPath, verifyCertificate: true, minTLSVersion: TLSVersion.TLS_1_2 },
      });
      expect(provider.getBaseUrl()).toBe('https://internal-gateway.example.com');
      const partialTlsConfig = new OpenAICompatibleProvider({
        baseUrl: 'https://internal-gateway.example.com', model: 'm',
        tlsConfig: { caBundle: caPath, verifyCertificate: true } as any,
      });
      expect(partialTlsConfig.getBaseUrl()).toBe('https://internal-gateway.example.com');
      expect(() => new OpenAICompatibleProvider({
        baseUrl: 'https://internal-gateway.example.com', model: 'm', allowInsecureTLS: true,
      })).toThrow('TLS certificate verification cannot be disabled');
      expect(() => new OpenAICompatibleProvider({
        baseUrl: 'https://internal-gateway.example.com',
        model: 'm',
        tlsConfig: { caBundle: path.join(caDir, 'missing.pem'), verifyCertificate: true, minTLSVersion: TLSVersion.TLS_1_2 },
      })).toThrow('CA bundle does not exist');
    } finally {
      fs.rmSync(caDir, { recursive: true, force: true });
    }
  });
});
