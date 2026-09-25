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

// ── A9-21 M2 第 2 版 §9.3 补充测试 ──────────────────────────────────────────

describe('A9-21 M2 §9.3.1: G-5 linearity with 16-byte fragments', () => {
  function feedPending(fragmentSize: number, totalBytes: number): number {
    const parser = new SseParser();
    const frag = 'x'.repeat(fragmentSize);
    const started = Date.now();
    for (let sent = 0; sent < totalBytes; sent += fragmentSize) {
      parser.feed(frag);
    }
    // 尚未送换行：仍在线性累计
    return Date.now() - started;
  }

  function feedPendingThenNewline(fragmentSize: number, totalBytes: number): number {
    const parser = new SseParser();
    const frag = 'x'.repeat(fragmentSize);
    const started = Date.now();
    for (let sent = 0; sent < totalBytes; sent += fragmentSize) {
      parser.feed(frag);
    }
    parser.feed('\n');
    parser.finish();
    return Date.now() - started;
  }

  it('0.5 MiB vs 2 MiB pending (then newline): 2 MiB time ≤ 8× of 0.5 MiB (floor 50ms)', () => {
    const tHalf = feedPendingThenNewline(16, 512 * 1024);
    const tTwo = feedPendingThenNewline(16, 2 * 1024 * 1024);
    const tHalfAdj = Math.max(tHalf, 50);
    // eslint-disable-next-line no-console
    console.log(`[a9-21-m2] §9.3.1 16B fragments: 0.5MiB=${tHalf}ms, 2MiB=${tTwo}ms, ratio=${(tTwo / tHalfAdj).toFixed(2)}`);
    expect(tTwo).toBeLessThanOrEqual(tHalfAdj * 8);
  });

  it('16-byte fragments until 2 MiB error complete within 1s', () => {
    const parser = new SseParser();
    const frag = 'y'.repeat(16);
    const started = Date.now();
    let threw: Error | undefined;
    try {
      for (let i = 0; i < (2 * 1024 * 1024) / 16 + 16; i++) {
        parser.feed(frag);
      }
    } catch (err: any) {
      threw = err;
    }
    const elapsed = Date.now() - started;
    expect(threw).toBeDefined();
    expect((threw as any).code).toBe(201);
    expect(elapsed).toBeLessThan(1000);
    // eslint-disable-next-line no-console
    console.log(`[a9-21-m2] §9.3.1 16B until error: ${elapsed} ms`);
  });
});

describe('A9-21 M2 §9.3.2: G-5 UTF-8 byte counting (Chinese)', () => {
  it('~700k Chinese chars (~2.1 MB) without newline triggers error', () => {
    const parser = new SseParser();
    const unit = '中'; // 3 bytes
    let threw: Error | undefined;
    try {
      // 每次 1000 字符 = 3000 字节
      for (let i = 0; i < 700; i++) {
        parser.feed(unit.repeat(1000));
      }
    } catch (err: any) {
      threw = err;
    }
    expect(threw).toBeDefined();
    expect((threw as any).code).toBe(201);
  });

  it('~600k Chinese chars (~1.8 MB) without newline does not trigger', () => {
    const parser = new SseParser();
    const unit = '中';
    let threw: Error | undefined;
    try {
      for (let i = 0; i < 600; i++) {
        parser.feed(unit.repeat(1000));
      }
      parser.feed('\n');
      parser.finish();
    } catch (err: any) {
      threw = err;
    }
    expect(threw).toBeUndefined();
  });
});

describe('A9-21 M2 §9.3.3: line split equivalence vs split(/\r?\n/)', () => {
  /** 采集 parseLine 收到的原始行，与基线 split 逐条比对。 */
  function collectLines(text: string, feedAs: (p: SseParser, chunk: string) => void): string[] {
    const parser = new SseParser();
    const lines: string[] = [];
    const orig = (parser as any).parseLine.bind(parser);
    (parser as any).parseLine = (raw: string) => {
      lines.push(raw);
      return orig(raw);
    };
    feedAs(parser, text);
    parser.finish();
    return lines;
  }

  it('10000 seeded cases: raw lines identical to split(/\r?\n/) (lone \r stays inside)', () => {
    let s = 0xa9210002 >>> 0;
    const rng = () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s;
    };
    const alphabet = ['a', 'b', '\n', '\r', '\r\n', '中', ' ', 'c'];
    for (let caseI = 0; caseI < 10000; caseI++) {
      const parts: string[] = [];
      const n = 1 + (rng() % 12);
      for (let j = 0; j < n; j++) parts.push(alphabet[rng() % alphabet.length]);
      const text = parts.join('');
      const expected = text.split(/\r?\n/);
      // finish 把无换行残余作为最后一行；split 末尾若无 \n 残余已在 expected 中，
      // 若有 \n 则 split 末尾是 ''，finish 不产生额外空行 → 丢弃末尾 ''。
      const exp = expected[expected.length - 1] === '' && text.includes('\n')
        ? expected.slice(0, -1)
        : expected;
      // 随机切片送入
      const cuts = [0];
      const nCuts = rng() % 4;
      for (let c = 0; c < nCuts; c++) cuts.push(rng() % (text.length + 1));
      cuts.push(text.length);
      cuts.sort((a, b) => a - b);
      const got = collectLines(text, (p, _t) => {
        let prev = 0;
        for (const cut of cuts) {
          if (cut > prev) p.feed(text.slice(prev, cut));
          prev = cut;
        }
      });
      if (got.length !== exp.length || got.some((line, i) => line !== exp[i])) {
        throw new Error(
          `case ${caseI}: text=${JSON.stringify(text)}\nexpected=${JSON.stringify(exp)}\ngot=${JSON.stringify(got)}`,
        );
      }
    }
  });

  it('lone \\r stays inside the line; \\r\\n ends the line', () => {
    const got = collectLines('a\rb\r\nc\nd', (p, t) => p.feed(t));
    expect(got).toEqual(['a\rb', 'c', 'd']);
  });
});

describe('A9-21 M2 §9.3.4: history protocol via buildOpenAIMessages', () => {
  // 经 core dist 构造真实历史（仅测试引用，不构成包依赖）
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { A9AgentLoop, PermissionMode } = require('../../core/dist/index.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { OpenAICompatibleProvider } = require('../src');

  function makeProvider() {
    return new OpenAICompatibleProvider({ baseUrl: 'http://127.0.0.1:9', model: 'm1' });
  }

  function assertHistoryProtocol(messages: any[]): void {
    const wire = makeProvider().buildOpenAIMessages(messages);
    for (let i = 0; i < wire.length; i++) {
      if (wire[i].role !== 'tool') continue;
      const toolCallId = wire[i].tool_call_id;
      // 找紧邻之前最近的 assistant 且带 tool_calls 的消息
      let found = false;
      for (let j = i - 1; j >= 0; j--) {
        if (wire[j].role === 'assistant' && Array.isArray(wire[j].tool_calls)) {
          found = wire[j].tool_calls.some((tc: any) => tc.id === toolCallId);
          break; // 紧邻的前一条带 tool_calls 的 assistant
        }
      }
      if (!found) {
        throw new Error(`isolated tool message tool_call_id=${toolCallId} at wire index ${i}: ${JSON.stringify(wire[i])}`);
      }
    }
  }

  function loopMocks() {
    const workspace = {
      list: jest.fn().mockResolvedValue({ totalEntries: 0, entries: [] }),
      read: jest.fn().mockResolvedValue({ content: 'ok' }),
      search: jest.fn().mockResolvedValue({ totalMatches: 0, matches: [] }),
      write: jest.fn().mockResolvedValue({ bytesWritten: 1, created: true }),
      edit: jest.fn().mockResolvedValue({ replaced: true }),
      copy: jest.fn().mockResolvedValue({ copied: true }),
      move: jest.fn().mockResolvedValue({ moved: true }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    };
    const runner = {
      execute: jest.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '', durationMs: 1, timedOut: false }),
    };
    return { workspace, runner };
  }

  it('after content truncation: next-turn history has no isolated tool message', async () => {
    const { workspace, runner } = loopMocks();
    let call = 0;
    const provider = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            id: 'r1', content: 'partial kept', finishReason: 'length',
            truncated: true,
            truncation: {
              reason: 'response_content_limit', retainedBytes: 100,
              limitBytes: 1024 * 1024, droppedAtLeastBytes: 10,
            },
            toolCalls: [{ id: 'c1', name: 'write', arguments: '{"path":"a"}' }],
          };
        }
        return { id: 'r2', content: 'done', finishReason: 'stop' };
      }),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/test/ws', provider, workspaceService: workspace, runner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });
    await loop.runTurn('go');
    const history = loop.getConversationHistory();
    assertHistoryProtocol(history);
    // R-2：截断后历史只有一条 assistant（+ 前面 system/user），无 truncation-notice tool
    const afterTrunc = history.filter((m: any) => m.toolCallId === 'truncation-notice');
    expect(afterTrunc).toHaveLength(0);
    const assistantCount = history.filter((m: any) => m.role === 'assistant').length;
    expect(assistantCount).toBe(1);
  });

  it('after slot overflow: next-turn history has no isolated tool message', async () => {
    const { workspace, runner } = loopMocks();
    let call = 0;
    const provider = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            id: 'r1', content: 'slot', finishReason: 'length',
            truncated: true,
            truncation: {
              reason: 'tool_call_limit', retainedBytes: 0,
              limitBytes: 1024 * 1024, droppedAtLeastBytes: 0, limitSlots: 64,
            },
          };
        }
        return { id: 'r2', content: 'done', finishReason: 'stop' };
      }),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/test/ws', provider, workspaceService: workspace, runner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });
    await loop.runTurn('go');
    const history = loop.getConversationHistory();
    assertHistoryProtocol(history);
    expect(history.filter((m: any) => m.toolCallId === 'truncation-notice')).toHaveLength(0);
    expect(history.filter((m: any) => m.role === 'assistant').length).toBe(1);
  });

  it('after single truncated tool call: history has paired tool result and arguments "{}"', async () => {
    const { workspace, runner } = loopMocks();
    let call = 0;
    const provider = {
      sendStreamRequest: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            id: 'r1', content: '', finishReason: 'tool_calls',
            toolCalls: [
              { id: 'ok1', name: 'write', arguments: '{"path":"a","content":"x"}' },
              { id: 'bad1', name: 'write', arguments: 'x'.repeat(600 * 1024), truncated: true },
            ],
          };
        }
        return { id: 'r2', content: 'done', finishReason: 'stop' };
      }),
    };
    const loop = new A9AgentLoop({
      workspaceRoot: '/test/ws', provider, workspaceService: workspace, runner,
      permissionMode: PermissionMode.FULL_ACCESS,
    });
    await loop.runTurn('go');
    const history = loop.getConversationHistory();
    // R-3：历史中截断调用 arguments 为 '{}'
    const assistantWithTools = history.find((m: any) => m.role === 'assistant' && m.toolCalls?.length);
    const badInHistory = assistantWithTools.toolCalls.find((tc: any) => tc.id === 'bad1');
    expect(badInHistory.arguments).toBe('{}');
    expect(badInHistory.name).toBe('write');
    assertHistoryProtocol(history);
    // 非截断调用参数保留
    const okInHistory = assistantWithTools.toolCalls.find((tc: any) => tc.id === 'ok1');
    expect(okInHistory.arguments).toContain('"path":"a"');
  });
});

describe('A9-21 M2 §9.3.6: R-4 limit fields/note and R-5 empty onChunk', () => {
  it('tool_call_limit reports limitBytes=1MiB, limitSlots=64, and slot-specific note fields', async () => {
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (let i = 0; i < 65; i++) {
        sse(res, {
          choices: [{ delta: { tool_calls: [{ index: i, id: `c${i}`, function: { name: 'read', arguments: '{}' } }] }, finish_reason: null }],
        });
      }
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
      expect(response.truncation?.limitBytes).toBe(1024 * 1024);
      expect(response.truncation?.limitSlots).toBe(64);
    } finally {
      await fixture.close();
    }
  });

  it('R-5: content "" events still trigger onChunk (baseline behavior)', async () => {
    const fixture = await startFixture((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      sse(res, { choices: [{ delta: { content: '' }, finish_reason: null }] });
      sse(res, { choices: [{ delta: { content: 'hi' }, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
    try {
      const provider = makeProvider(fixture.baseUrl);
      const chunks: string[] = [];
      await provider.sendStreamRequest(
        { id: 'r1', messages: [{ role: 'user', content: 'go' }] },
        (c) => { chunks.push(c.content); },
      );
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0]).toBe('');
      expect(chunks.join('')).toBe('hi');
    } finally {
      await fixture.close();
    }
  });
});
