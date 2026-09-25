/**
 * A9-21 M2：模型输出端到端上限 — Gateway 测试（真实回环 SSE）。
 *
 * 覆盖交接书 §5 用例 1–8：内容 1 MiB 截断、截断粘性、UTF-8 边界、
 * 上限后中止、小 chunk 线性、工具参数/函数名/槽位上限、SSE 行缓冲、畸形事件样本。
 */
import * as http from 'http';
import {
  OpenAICompatibleProvider,
  FinishReason,
  SseParser,
  ToolCallAccumulator,
  truncateUtf8ToByteLimit,
} from '../src';

const MIB = 1024 * 1024;

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function sseContent(res: http.ServerResponse, content: string): void {
  sse(res, { choices: [{ delta: { content }, finish_reason: null }] });
}

interface Fixture {
  server: http.Server;
  baseUrl: string;
  close: () => Promise<void>;
}

function startFixture(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<Fixture> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => handler(req, res));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as import('net').AddressInfo;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function makeProvider(baseUrl: string): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({ baseUrl, model: 'm1', totalTimeoutMs: 30_000, noDataTimeoutMs: 10_000 });
}

describe('A9-21 M2 G-1/G-2: response content limit', () => {
  it('1. 700KiB + 700KiB then stop: content is 1 MiB, finishReason length, truncation fields set', async () => {
    const part = 'A'.repeat(700 * 1024);
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sseContent(res, part);
      sseContent(res, part);
      sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = makeProvider(fixture.baseUrl);
      const chunks: string[] = [];
      const response = await provider.sendStreamRequest(
        { id: 'r1', messages: [{ role: 'user', content: 'go' }] },
        (c) => { chunks.push(c.content); },
      );
      expect(Buffer.byteLength(response.content, 'utf8')).toBe(MIB);
      expect(response.finishReason).toBe(FinishReason.LENGTH);
      expect(response.truncated).toBe(true);
      expect(response.truncation?.reason).toBe('response_content_limit');
      expect(response.truncation?.limitBytes).toBe(MIB);
      expect(response.truncation?.retainedBytes).toBe(MIB);
      expect(response.truncation?.droppedAtLeastBytes).toBeGreaterThan(0);
      // onChunk 总和不超过保留内容
      const emitted = Buffer.byteLength(chunks.join(''), 'utf8');
      expect(emitted).toBeLessThanOrEqual(response.truncation!.retainedBytes);
      // G-2：截断响应不携带 toolCalls
      expect(response.toolCalls).toBeUndefined();
    } finally {
      await fixture.close();
    }
  });

  it('2. tool_calls frame after truncation: no toolCalls, truncation sticky', async () => {
    const big = 'B'.repeat(600 * 1024);
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sseContent(res, big);
      sseContent(res, big); // hits limit
      sse(res, {
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'read', arguments: '{"path":"a"}' } }] }, finish_reason: 'tool_calls' }],
      });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = makeProvider(fixture.baseUrl);
      const response = await provider.sendStreamRequest(
        { id: 'r1', messages: [{ role: 'user', content: 'go' }] },
        () => {},
      );
      expect(response.truncated).toBe(true);
      expect(response.finishReason).toBe(FinishReason.LENGTH);
      expect(response.toolCalls).toBeUndefined();
    } finally {
      await fixture.close();
    }
  });

  it('3. multi-byte char across limit: retained part is exact char prefix, no U+FFFD', async () => {
    // 每个汉字 3 字节；用 333_000 个汉字 ≈ 999_000 字节，再追加一个汉字越过 1 MiB。
    const chunk1 = '中'.repeat(333_000);
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sseContent(res, chunk1);
      sseContent(res, '文'.repeat(20_000)); // pushes past 1 MiB
      sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = makeProvider(fixture.baseUrl);
      const response = await provider.sendStreamRequest(
        { id: 'r1', messages: [{ role: 'user', content: 'go' }] },
        () => {},
      );
      expect(response.truncated).toBe(true);
      expect(response.content.includes('�')).toBe(false);
      expect(Buffer.byteLength(response.content, 'utf8')).toBeLessThanOrEqual(MIB);
      // 前缀必须是原文的精确字符前缀（每个保留字符都是「中」或「文」，且无乱码）
      for (const ch of response.content) {
        expect(ch === '中' || ch === '文').toBe(true);
      }
    } finally {
      await fixture.close();
    }
  });

  it('4. after limit the client stops reading; result is truncated not STREAM_INTERRUPTED', async () => {
    let clientClosed = false;
    let writeFailed = false;
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sseContent(res, 'C'.repeat(800 * 1024));
      sseContent(res, 'D'.repeat(800 * 1024)); // exceeds → client should abort
      // 此后服务端继续发送，直到写入失败/连接关闭
      const timer = setInterval(() => {
        if (clientClosed || writeFailed) {
          clearInterval(timer);
          try { res.end(); } catch (_e) { /* ignore */ }
          return;
        }
        try {
          sseContent(res, 'E'.repeat(1024));
        } catch (_e) {
          writeFailed = true;
          clearInterval(timer);
        }
      }, 5);
      res.on('close', () => {
        clientClosed = true;
        clearInterval(timer);
      });
    });
    try {
      const provider = makeProvider(fixture.baseUrl);
      const response = await provider.sendStreamRequest(
        { id: 'r1', messages: [{ role: 'user', content: 'go' }] },
        () => {},
      );
      expect(response.truncated).toBe(true);
      expect(response.finishReason).toBe(FinishReason.LENGTH);
      // 不是 STREAM_INTERRUPTED：这里 resolve 的是截断结果而非 throw
      expect(response.truncation?.reason).toBe('response_content_limit');
    } finally {
      await fixture.close();
    }
  });

  it('5. 1 MiB content in 16-byte chunks completes within 2s (linear incremental counting)', async () => {
    // 略超 1 MiB，确保走截断路径并覆盖增量计数；小 chunk 是二次复杂度的触发条件。
    const payload = 'F'.repeat(MIB + 64);
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (let i = 0; i < payload.length; i += 16) {
        sseContent(res, payload.slice(i, i + 16));
      }
      sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = makeProvider(fixture.baseUrl);
      const started = Date.now();
      const response = await provider.sendStreamRequest(
        { id: 'r1', messages: [{ role: 'user', content: 'go' }] },
        () => {},
      );
      const elapsed = Date.now() - started;
      expect(response.truncated).toBe(true);
      expect(Buffer.byteLength(response.content, 'utf8')).toBe(MIB);
      expect(elapsed).toBeLessThan(2000);
      // eslint-disable-next-line no-console
      console.log(`[a9-21-m2] §5.5 1 MiB+ in 16-byte chunks: ${elapsed} ms`);
    } finally {
      await fixture.close();
    }
  });
});

describe('A9-21 M2 G-4: tool call limits', () => {
  it('6a. tool arguments over 512 KiB are marked truncated', async () => {
    const hugeArgs = '{"data":"' + 'x'.repeat(520 * 1024) + '"}';
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sse(res, {
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'write', arguments: hugeArgs } }] }, finish_reason: 'tool_calls' }],
      });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = makeProvider(fixture.baseUrl);
      const response = await provider.sendStreamRequest(
        { id: 'r1', messages: [{ role: 'user', content: 'go' }] },
        () => {},
      );
      expect(response.toolCalls?.length).toBe(1);
      expect(response.toolCalls?.[0].truncated).toBe(true);
      expect(response.toolCalls?.[0].arguments.length).toBeLessThan(hugeArgs.length);
    } finally {
      await fixture.close();
    }
  });

  it('6b. function name over 4 KiB is marked truncated', async () => {
    const hugeName = 'n'.repeat(5000);
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sse(res, {
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: hugeName, arguments: '{}' } }] }, finish_reason: 'tool_calls' }],
      });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = makeProvider(fixture.baseUrl);
      const response = await provider.sendStreamRequest(
        { id: 'r1', messages: [{ role: 'user', content: 'go' }] },
        () => {},
      );
      expect(response.toolCalls?.[0].truncated).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it('6c. 65th tool call slot truncates the whole response with no toolCalls', async () => {
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (let i = 0; i < 65; i++) {
        sse(res, {
          choices: [{ delta: { tool_calls: [{ index: i, id: `c${i}`, function: { name: 'read', arguments: '{}' } }] }, finish_reason: null }],
        });
      }
      sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = makeProvider(fixture.baseUrl);
      const response = await provider.sendStreamRequest(
        { id: 'r1', messages: [{ role: 'user', content: 'go' }] },
        () => {},
      );
      expect(response.truncated).toBe(true);
      expect(response.truncation?.reason).toBe('tool_call_limit');
      expect(response.finishReason).toBe(FinishReason.LENGTH);
      expect(response.toolCalls).toBeUndefined();
    } finally {
      await fixture.close();
    }
  });
});

describe('A9-21 M2 G-5: SSE pending line buffer limit', () => {
  it('7. single line without newline over 2 MiB fails structured; long-line fragments stay linear', () => {
    const parser = new SseParser();
    const fragment = 'x'.repeat(64 * 1024);
    const started = Date.now();
    let threw: Error | undefined;
    try {
      for (let i = 0; i < 40; i++) {
        parser.feed(fragment);
      }
    } catch (err: any) {
      threw = err;
    }
    const elapsed = Date.now() - started;
    expect(threw).toBeDefined();
    expect(threw!.message).toMatch(/pending line exceeds/i);
    expect((threw as any).code).toBe(201); // ErrorCode.INVALID_FRAME
    expect(elapsed).toBeLessThan(2000);
    // eslint-disable-next-line no-console
    console.log(`[a9-21-m2] §5.7 long-line fragments: ${elapsed} ms`);
  });
});

describe('A9-21 M2 G-6: malformed event samples', () => {
  it('8. keeps at most 20 samples and counts the true total', () => {
    const parser = new SseParser();
    for (let i = 0; i < 50; i++) {
      parser.feed(`data: {bad json ${i}\n\n`);
    }
    expect(parser.malformedEvents.length).toBe(20);
    expect(parser.malformedEventCount).toBe(50);
  });
});

describe('A9-21 M2 truncateUtf8ToByteLimit', () => {
  it('cuts on character boundary without U+FFFD', () => {
    const text = '汉字ab';
    const cut = truncateUtf8ToByteLimit(text, 4); // 汉 = 3 bytes; 4 bytes cuts into 字
    expect(cut.text).toBe('汉');
    expect(cut.bytes).toBe(3);
    expect(cut.text.includes('�')).toBe(false);
  });
});

describe('A9-21 M2 ToolCallAccumulator unit', () => {
  it('marks per-call truncation when args exceed max', () => {
    const acc = new ToolCallAccumulator(10, 10, 4);
    acc.apply({ index: 0, id: 'a', functionName: 'f', argumentsDelta: '0123456789' });
    acc.apply({ index: 0, argumentsDelta: 'xyz' });
    const arr = acc.toArray();
    expect(arr[0].truncated).toBe(true);
    expect(arr[0].arguments.length).toBe(10);
    expect(acc.slotsOverflowed).toBe(false);
  });

  it('flags slotsOverflowed when index exceeds max slots', () => {
    const acc = new ToolCallAccumulator(100, 100, 2);
    acc.apply({ index: 0, id: 'a', functionName: 'f', argumentsDelta: '{}' });
    acc.apply({ index: 5, id: 'b', functionName: 'g', argumentsDelta: '{}' });
    expect(acc.slotsOverflowed).toBe(true);
    expect(acc.toArray().length).toBe(1);
  });
});
