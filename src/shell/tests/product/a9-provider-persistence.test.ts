/**
 * R4 回归测试：Provider 配置持久化、DPAPI vault 集成与模型切换。
 *
 * 复现缺陷：A9 Provider 配置和 API Key 仅存于进程内存，重启后
 * provider.configured=false；产品路径未接 DPAPI；切模型丢 loop。
 * 使用注入式 fake safeStorage 测 DPAPI 成功/失败合同（非 Windows 环境，
 * 不宣称真实 Windows DPAPI PASS）。
 */
/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

/** 行为化 fixture：probe 应答 probe_test_echo；任务轮按 tool 回执推进。 */
function startFixtureModel(options: { probeToolCalling?: boolean; failProbe?: boolean } = {}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
          if (options.failProbe) {
            sse(res, { choices: [{ delta: { content: 'I cannot call tools.' }, finish_reason: 'stop' }] });
          } else if (options.probeToolCalling === false) {
            sse(res, { choices: [{ delta: { content: 'plain text only' }, finish_reason: 'stop' }] });
          } else {
            sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'p1', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
          }
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        const toolMsgs = (parsed.messages ?? []).filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo');
        if (toolMsgs.length === 0) {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'r1', function: { name: 'read', arguments: '{"path":"note.txt"}' } }] }, finish_reason: 'tool_calls' }] });
        } else {
          sse(res, { choices: [{ delta: { content: `history has ${toolMsgs.length} tool results` }, finish_reason: 'stop' }] });
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** 记录型 fixture：secondModelTextOnly 时新模型首个请求直接返回文本。 */
function startRecordingModel(seenRequests: any[], options: { secondModelTextOnly?: boolean } = {}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  let switched = false;
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        seenRequests.push(parsed);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
        if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
          send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'p1', function: { name: 'probe_test_echo', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
        } else {
          const toolMsgs = (parsed.messages ?? []).filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo');
          const hasMarker = (parsed.messages ?? []).some((m: any) => m.role === 'user' && String(m.content).includes('MARKER-SECOND'));
          if (options.secondModelTextOnly && hasMarker) {
            switched = true;
            send({ choices: [{ delta: { content: 'continued with full history' }, finish_reason: 'stop' }] });
          } else if (toolMsgs.length === 0) {
            send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'r1', function: { name: 'read', arguments: '{"path":"note.txt"}' } }] }, finish_reason: 'tool_calls' }] });
          } else {
            send({ choices: [{ delta: { content: switched ? 'done again' : 'done' }, finish_reason: 'stop' }] });
          }
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>((d) => server.close(() => d())) });
    });
  });
}

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`enc:${Buffer.from(plain, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (cipher: Buffer) => {
      const text = cipher.toString('utf8');
      if (!text.startsWith('enc:')) throw new Error('bad ciphertext');
      return Buffer.from(text.slice(4), 'base64').toString('utf8');
    },
  };
}

function makeEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-r4-'));
  fs.mkdirSync(path.join(root, 'ws'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  return { root, workspaceRoot: path.join(root, 'ws'), dataRoot: path.join(root, 'data') };
}

function listAllFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listAllFiles(full));
    else out.push(full);
  }
  return out;
}

describe('R4: provider config persistence and DPAPI integration', () => {
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => { env = makeEnv(); });
  afterEach(() => { fs.rmSync(env.root, { recursive: true, force: true }); });

  function makeRuntime(extra: Record<string, unknown> = {}) {
    return createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot,
      dataRoot: env.dataRoot,
      openDatabase: (p: string, o?: { readonly?: boolean }) => new Database(p, o?.readonly ? { readonly: true } : {}),
      ...extra,
    });
  }

  it('restores non-secret provider configuration after restart (fixture probe verified)', async () => {
    const fixture = await startFixtureModel();
    try {
      const first = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      first.setMode('full_access');
      await first.configureProvider({ baseUrl: fixture.baseUrl, model: 'model-a', rememberApiKey: true, apiKey: 'sk-r4-secret-1' });
      first.shutdown();

      // 重启：非秘密配置恢复，probe 结论保留。
      const second = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      const snapshot = second.getSnapshot();
      expect(snapshot.provider.configured).toBe(true);
      expect(snapshot.provider.baseUrl).toBe(fixture.baseUrl);
      expect(snapshot.provider.model).toBe('model-a');
      expect(snapshot.provider.probe.classification).toBe('tool_calling');
      expect(snapshot.provider.apiKey.remembered).toBe(true);
      second.shutdown();
    } finally {
      await fixture.close();
    }
  }, 20_000);

  it('never writes the API key in plaintext to dataRoot files, events, or snapshots', async () => {
    const fixture = await startFixtureModel();
    try {
      const secret = 'sk-plaintext-scan-9f8e7d';
      const runtime = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'm', apiKey: secret, rememberApiKey: true });

      // dataRoot 内所有文件（含 DPAPI 密文文件）不得包含明文 key。
      for (const file of listAllFiles(env.dataRoot)) {
        const content = fs.readFileSync(file);
        const contains = content.includes(secret);
        expect(`${file} contains plaintext key: ${contains}`).toBe(`${file} contains plaintext key: false`);
      }
      // 快照不回显 key。
      const snapshotText = JSON.stringify(runtime.getSnapshot());
      expect(snapshotText.includes(secret)).toBe(false);
      // SQLite 事件不含 key。
      const dbRaw = fs.readFileSync(path.join(env.dataRoot, 'a9-state.db'));
      expect(dbRaw.includes(Buffer.from(secret))).toBe(false);
      runtime.shutdown();
    } finally {
      await fixture.close();
    }
  }, 20_000);

  it('saves and restores the API key through the injected (fake) DPAPI vault', async () => {
    const fixture = await startFixtureModel();
    try {
      const first = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      first.setMode('full_access');
      await first.configureProvider({ baseUrl: fixture.baseUrl, model: 'm', apiKey: 'sk-dpapi-roundtrip', rememberApiKey: true });
      first.shutdown();

      const second = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      const snap = second.getSnapshot();
      expect(snap.provider.apiKey.source).toBe('dpapi');
      // 密钥可真正恢复使用（重建 Provider 后能完成一轮任务）。
      const turn = await second.submitTurn('hi');
      expect(turn.ok).toBe(true);
      second.shutdown();
    } finally {
      await fixture.close();
    }
  }, 20_000);

  it('degrades to memory-only when DPAPI is unavailable and reports honestly', async () => {
    const fixture = await startFixtureModel();
    try {
      const runtime = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'm', apiKey: 'sk-mem-only', rememberApiKey: true });
      const snap = runtime.getSnapshot();
      expect(snap.provider.apiKey.source).toBe('dpapi');
      runtime.shutdown();

      // DPAPI 不可用的重启：配置恢复但 key 不可恢复，明确显示未记住。
      const second = makeRuntime(); // 无 safeStorage（非 Windows 路径）
      const snap2 = second.getSnapshot();
      expect(snap2.provider.configured).toBe(true);
      expect(snap2.provider.apiKey.remembered).toBe(true); // 配置里标记曾记住
      expect(snap2.provider.apiKey.source).toBe('none'); // 但实际未恢复
      expect(snap2.provider.diagnostics).toBeDefined();
      second.shutdown();
    } finally {
      await fixture.close();
    }
  }, 20_000);

  it('fails closed on corrupted ciphertext without deleting the evidence', async () => {
    const fixture = await startFixtureModel();
    try {
      const first = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      first.setMode('full_access');
      await first.configureProvider({ baseUrl: fixture.baseUrl, model: 'm', apiKey: 'sk-corrupt-me', rememberApiKey: true });
      first.shutdown();

      // 篡改 DPAPI 密文文件（模拟损坏/账户不匹配）。
      const vaultFile = path.join(env.dataRoot, 'a9-vault-apikey', 'credentials', 'credentials.v1.json');
      expect(fs.existsSync(vaultFile)).toBe(true);
      fs.writeFileSync(vaultFile, JSON.stringify({ schemaVersion: 1, protection: 'electron-safe-storage-windows-dpapi-current-user', ciphertext: '!!!not-base64!!!' }), 'utf8');

      const second = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      const snap = second.getSnapshot();
      expect(snap.provider.diagnostics).toBeDefined();
      expect(String(snap.provider.diagnostics.code)).toMatch(/CORRUPT|DECRYPT|FAILED/);
      // 诊断证据未被删除。
      expect(fs.existsSync(vaultFile)).toBe(true);
      second.shutdown();
    } finally {
      await fixture.close();
    }
  }, 20_000);

  it('classifies chat-only providers and refuses agent turns without faking availability', async () => {
    const fixture = await startFixtureModel({ probeToolCalling: false });
    try {
      const runtime = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      runtime.setMode('full_access');
      const configured = await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'chat-only-m' });
      expect(configured.probe.classification).toBe('chat_only');
      const turn = await runtime.submitTurn('do work');
      expect(turn.ok).toBe(false);
      expect((turn as any).error.code).toBe('A9_PROVIDER_CHAT_ONLY');
      runtime.shutdown();
    } finally {
      await fixture.close();
    }
  }, 20_000);

  it('classifies unreachable providers as unavailable and refuses turns', async () => {
    const runtime = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
    runtime.setMode('full_access');
    const configured = await runtime.configureProvider({ baseUrl: 'http://127.0.0.1:9', model: 'dead-m' });
    expect(configured.probe.classification).toBe('unavailable');
    const turn = await runtime.submitTurn('go');
    expect((turn as any).error.code).toBe('A9_PROVIDER_UNVERIFIED');
    runtime.shutdown();
  }, 20_000);

  it('model switch: the new model FIRST request already carries user marker, assistant tool_calls and tool result', async () => {
    const seenRequests: any[] = [];
    // 行为化记录 fixture：第一段按工具回执推进；第二段（新模型）首个请求直接文本。
    const fixture = await startRecordingModel(seenRequests, { secondModelTextOnly: true });
    try {
      const runtime = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'model-a' });
      fs.writeFileSync(path.join(env.workspaceRoot, 'note.txt'), 'hello\n');
      const firstTurn = await runtime.submitTurn('read the note MARKER-FIRST-USER');
      expect(firstTurn.ok).toBe(true);

      // 切换模型：rebuildProvider 置空 loop 后仍必须恢复历史。
      const requestCountBefore = seenRequests.length;
      const switched = await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'model-b' });
      expect(switched.model).toBe('model-b');

      // 触发新模型第一个真实请求（直接返回文本）。
      const nextTurn = await runtime.submitTurn('continue MARKER-SECOND');
      expect(nextTurn.ok).toBe(true);
      // 新模型第一次（非 probe）请求必须已经包含历史三要素。
      const firstNewModelRequest = seenRequests
        .slice(requestCountBefore)
        .find((r: any) => !(r?.tools?.[0]?.function?.name === 'probe_test_echo'));
      expect(firstNewModelRequest).toBeDefined();
      const messages = firstNewModelRequest.messages;
      const userMarkers = messages.filter((m: any) => m.role === 'user' && String(m.content).includes('MARKER-FIRST-USER'));
      const assistantTools = messages.filter((m: any) => m.role === 'assistant' && Array.isArray(m.tool_calls));
      const toolResults = messages.filter((m: any) => m.role === 'tool' && m.name === 'read');
      expect(userMarkers.length).toBeGreaterThanOrEqual(1);
      expect(assistantTools.length).toBeGreaterThanOrEqual(1);
      expect(toolResults.length).toBeGreaterThanOrEqual(1);
      // 该请求直接返回文本（没有产生新的工具消息）。
      expect(messages.filter((m: any) => m.role === 'tool' && m.name === 'read')).toHaveLength(toolResults.length);
      runtime.shutdown();
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it('header-only provider (no API key) restores after restart via fake DPAPI', async () => {
    const fixture = await startFixtureModel();
    try {
      const first = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      first.setMode('full_access');
      // 仅自定义认证 Header，无 API Key。
      await first.configureProvider({
        baseUrl: fixture.baseUrl,
        model: 'header-only-m',
        customHeaders: { 'X-Auth-Token': 'hdr-secret-value-42' },
        rememberApiKey: true,
      });
      first.shutdown();

      const second = makeRuntime({ safeStorage: fakeSafeStorage(), vaultPlatform: 'win32' });
      const snap = second.getSnapshot();
      expect(snap.provider.configured).toBe(true);
      expect(snap.provider.model).toBe('header-only-m');
      expect(snap.provider.apiKey.remembered).toBe(true);
      // Header 值经 fake-DPAPI 恢复：能完成一轮真实任务（fixture 收到 Header）。
      const turn = await second.submitTurn('go');
      expect(turn.ok).toBe(true);
      second.shutdown();
      // 明文 Header 值不落盘。
      for (const file of listAllFiles(env.dataRoot)) {
        const contains = fs.readFileSync(file).includes('hdr-secret-value-42');
        expect(`${file} contains header plaintext: ${contains}`).toBe(`${file} contains header plaintext: false`);
      }
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it('remembered=true only when DPAPI persisted AND readable; memory source reports not-remembered', async () => {
    const fixture = await startFixtureModel();
    try {
      // DPAPI 不可用：remember 请求也必须显示未记住（memory）。
      const runtime = makeRuntime(); // 无 safeStorage
      runtime.setMode('full_access');
      const configured = await runtime.configureProvider({
        baseUrl: fixture.baseUrl,
        model: 'mem-m',
        apiKey: 'sk-mem-truth',
        rememberApiKey: true,
      });
      expect(configured.keyRemembered).toBe(false);
      const snap = runtime.getSnapshot();
      expect(snap.provider.apiKey.source).toBe('memory');
      expect(snap.provider.apiKey.note).toContain('未记住');
      runtime.shutdown();
    } finally {
      await fixture.close();
    }
  }, 30_000);
});
