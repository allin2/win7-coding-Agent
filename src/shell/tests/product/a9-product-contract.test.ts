/**
 * A9-06 合同测试：桌面 A9 运行时复合组件 + 版本化 IPC。
 *
 * 使用真实模块 dist（A9AgentLoop/A9WorkspaceService/TrustedShellRunner/
 * OpenAICompatibleProvider/A9PersistenceManager）与真实 better-sqlite3。
 * Renderer 边界：未知 action / 多余字段 / 旧 schema 一律结构化拒绝；
 * 首次未选模式或未配置 Provider 时拒绝执行（正式 UI 不默认 Replay）。
 */
/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;
const { createA9ProductRequestHandler, A9_IPC_SCHEMA_VERSION } = require('../../product/a9-product-ipc') as any;

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function startFixtureModel(script: Array<{ tool?: { id: string; name: string; args: unknown }; content?: string; contentChunks?: string[] }>, onRequest?: (body: any) => void): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  let round = 0;
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
        onRequest?.(parsed);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        // 能力探测请求：以 probe_test_echo 应答（真实 tool_calls 证明）。
        if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe_1', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        const step = script[Math.min(round, script.length - 1)];
        round += 1;
        if (step.tool) {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: step.tool.id, function: { name: step.tool.name, arguments: JSON.stringify(step.tool.args) } }] }, finish_reason: 'tool_calls' }] });
        } else if (step.contentChunks) {
          step.contentChunks.forEach((content, index) => {
            sse(res, { choices: [{ delta: { content }, finish_reason: index === step.contentChunks!.length - 1 ? 'stop' : null }] });
          });
        } else {
          sse(res, { choices: [{ delta: { content: step.content ?? 'done' }, finish_reason: 'stop' }] });
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

function makeEnv(): { workspaceRoot: string; dataRoot: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-desktop-'));
  return {
    workspaceRoot: path.join(root, 'ws'),
    dataRoot: path.join(root, 'data'),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function openReal(databasePath: string, opts?: { readonly?: boolean }): any {
  return new Database(databasePath, opts?.readonly ? { readonly: true } : {});
}

const validSender = () => true;

function loadRuntimeModules(): any {
  return {
    core: require(path.join(__dirname, '../../../core/dist')),
    gateway: require(path.join(__dirname, '../../../gateway/dist')),
    state: require(path.join(__dirname, '../../../state/dist')),
    workspace: require(path.join(__dirname, '../../../workspace/dist')),
    runner: require(path.join(__dirname, '../../../runner/dist')),
    gitAdapter: require(path.join(__dirname, '../../../git-adapter/dist')),
  };
}

describe('A9-06: desktop a9 runtime composite (real modules, real sqlite)', () => {
  it('delivers explicit Chinese encodings, binary metadata and large-file ranges through the real A9 product loop', async () => {
    const received: any[] = [];
    const fixture = await startFixtureModel([
      { tool: { id: 'cn-gbk', name: 'read', args: { path: '单字.txt', encoding: 'gbk' } } },
      { tool: { id: 'cn-u16', name: 'read', args: { path: '无BOM.txt', encoding: 'utf-16le' } } },
      { tool: { id: 'bin', name: 'read', args: { path: '无BOM.txt', encoding: 'binary' } } },
      { tool: { id: 'large', name: 'read', args: { path: '大文件.txt', start_line: 750001, max_lines: 1 } } },
      { content: '读取完成。' },
    ], (body) => received.push(body));
    let runtime: any;
    try {
      fs.writeFileSync(path.join(env.workspaceRoot, '单字.txt'), Buffer.from([0xd6, 0xd0]));
      fs.writeFileSync(path.join(env.workspaceRoot, '无BOM.txt'), Buffer.from('中文', 'utf16le'));
      fs.writeFileSync(path.join(env.workspaceRoot, '大文件.txt'), '中文 line\r\n'.repeat(750000) + '末尾中文', 'utf8');
      runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
      runtime.setMode('read_only');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'fixture-read-model' });
      const turn = await runtime.submitTurn('读取中文和大文件');
      expect(turn.ok).toBe(true);
      expect(turn.result.toolCallsExecuted).toBe(4);
      const messages = received[received.length - 1].messages.filter((message: any) => message.role === 'tool');
      const results = new Map(messages.map((message: any) => [message.tool_call_id, JSON.parse(message.content)]));
      expect(results.get('cn-gbk')).toMatchObject({ encoding: 'gbk', content: '1: 中' });
      expect(results.get('cn-u16')).toMatchObject({ encoding: 'utf-16le', content: '1: 中文' });
      expect(results.get('bin')).toMatchObject({ isText: false, encoding: 'binary' });
      expect(results.get('large')).toMatchObject({ content: '750001: 末尾中文', totalLines: 750001, truncated: false });
    } finally {
      if (runtime) await runtime.shutdown();
      await fixture.close();
    }
  });
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    env = makeEnv();
    fs.mkdirSync(env.workspaceRoot, { recursive: true });
    fs.mkdirSync(env.dataRoot, { recursive: true });
  });

  afterEach(() => {
    env.cleanup();
  });

  it('refuses turns until a mode is explicitly selected (no silent full access)', () => {
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    expect(runtime.status).toBe('ready');
    expect(runtime.getSnapshot().mode).toBe('needs_selection');
    expect(runtime.getSnapshot().modeRecommended).toBe('full_access');
    const result = runtime.submitTurn('do something');
    return result.then((r: any) => {
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe('A9_MODE_SELECTION_REQUIRED');
    });
  });

  it('caches automatic Shell probing per runtime and invalidates only after an explicit Shell setting change', async () => {
    const modules = loadRuntimeModules();
    const selectShell = jest.fn(() => ({
      kind: 'sh', path: '/bin/sh', available: true, evidence: 'dev_host_only', reason: 'test fixture',
    }));
    modules.runner = { ...modules.runner, selectShell };
    const runtime = createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot,
      dataRoot: env.dataRoot,
      openDatabase: openReal,
      modules,
    });
    expect(runtime.getSnapshot().shell.available).toBe(true);
    expect(runtime.getSnapshot().shell.available).toBe(true);
    expect(runtime.getSnapshot().shell.available).toBe(true);
    expect(selectShell).toHaveBeenCalledTimes(1);

    await runtime.configureShell({ kind: 'automatic', envOverlay: {} });
    expect(selectShell).toHaveBeenCalledTimes(2);
    runtime.getSnapshot();
    expect(selectShell).toHaveBeenCalledTimes(2);
    await runtime.shutdown();
  });

  it('retries a previously blocked workspace lock and acquires it after the persisted heartbeat expires', async () => {
    const first = createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal, ownerId: 'window-old-owner',
    });
    const second = createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal, ownerId: 'main-62002',
      processLivenessProbe: () => undefined,
    });
    expect(second.getSnapshot().lock).toMatchObject({ held: false, holder: 'window-old-owner' });

    const db = new Database(path.join(env.dataRoot, 'a9-state.db'));
    const aged = db.prepare('UPDATE a9_workspace_locks SET heartbeat_at = ? WHERE owner_id = ?')
      .run(new Date(Date.now() - 16 * 60 * 1000).toISOString(), 'window-old-owner');
    expect(Number(aged.changes)).toBe(1);
    db.close();
    expect(second.getSnapshot().lock).toMatchObject({ held: true, holder: 'main-62002' });
    await second.shutdown();
    await first.shutdown();
  });

  it('redacts a known secret split across model chunks before timeline and SQLite persistence', async () => {
    const secret = 'A9-SPLIT-STREAM-SECRET-42';
    const fixture = await startFixtureModel([{ contentChunks: [secret.slice(0, 9), secret.slice(9, 18), secret.slice(18)] }]);
    let runtime: any;
    try {
      runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'split-secret-model', apiKey: secret, skipProbe: true });
      const turn = await runtime.submitTurn('return fixture text');
      expect(turn.ok).toBe(true);
      const snapshot = JSON.stringify(runtime.getSnapshot());
      expect(snapshot).toContain('***redacted***');
      expect(snapshot).not.toContain(secret);
      const modelEvents = runtime.getSnapshot().timeline.filter((event: any) => event.type === 'model_chunk');
      expect(modelEvents).toHaveLength(1);
      expect(modelEvents[0].data.content).toBe('***redacted***');
      await runtime.shutdown();
      runtime = null;
      for (const file of fs.readdirSync(env.dataRoot).map((name) => path.join(env.dataRoot, name))) {
        if (fs.statSync(file).isFile()) expect(fs.readFileSync(file).includes(Buffer.from(secret, 'utf8'))).toBe(false);
      }
    } finally {
      if (runtime) await runtime.shutdown();
      await fixture.close();
    }
  });

  it('serves bounded A9 Viewer reads with auto/explicit encoding and rejects path escape', async () => {
    fs.writeFileSync(path.join(env.workspaceRoot, '短GBK.txt'), Buffer.from([0xd6, 0xd0]));
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    expect(await runtime.readWorkspaceFile({ path: '短GBK.txt', startLine: 1, maxLines: 10 })).toMatchObject({
      ok: true, result: { isText: false, lines: [] },
    });
    expect(await runtime.readWorkspaceFile({ path: '短GBK.txt', startLine: 1, maxLines: 10, encoding: 'gbk' })).toMatchObject({
      ok: true, result: { isText: true, encoding: 'gbk', lines: [{ line: 1, text: '中' }], endLine: 1 },
    });
    await expect(runtime.readWorkspaceFile({ path: '../outside.txt', startLine: 1, maxLines: 10 }))
      .rejects.toMatchObject({ code: 'A9_WORKSPACE_READ_PATH_INVALID' });
    await runtime.shutdown();
  });

  it('refuses turns until a real provider is configured (production never defaults to Replay)', async () => {
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    runtime.setMode('full_access');
    const snapshot = runtime.getSnapshot();
    expect(snapshot.provider.configured).toBe(false);
    expect(snapshot.provider.note).toContain('Replay 仅测试');
    const result = await runtime.submitTurn('hello');
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe('A9_PROVIDER_UNCONFIGURED');
  });

  it('fails closed when packaged composition requires D-013 without a manifest-bound helper path', () => {
    expect(() => createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot,
      dataRoot: env.dataRoot,
      openDatabase: openReal,
      requireRunnerHelper: true,
    })).toThrow('A9_RUNNER_HELPER_REQUIRED');
  });

  it('persists a user-explicit shell per workspace without echoing environment values', async () => {
    const runtime = createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot,
      dataRoot: env.dataRoot,
      openDatabase: openReal,
      selectShellExecutable: async () => process.execPath,
    });
    const configured = await runtime.configureShell({
      kind: 'bash',
      envOverlay: { PROJECT_MODE: 'alpha-value-not-for-snapshot' },
    });
    expect(configured.ok).toBe(true);
    expect(configured.shell).toMatchObject({ source: 'workspace_explicit', kind: 'bash', envKeys: ['PROJECT_MODE'] });
    expect(JSON.stringify(configured)).not.toContain('alpha-value-not-for-snapshot');
    const persistedShell = JSON.parse(fs.readFileSync(path.join(env.dataRoot, 'a9-shell-config.v1.json'), 'utf8'));
    const persistedEntry = Object.values(persistedShell.workspaces)[0] as any;
    expect(persistedShell.schemaVersion).toBe(3);
    expect(persistedEntry.identity).toEqual(expect.objectContaining({
      canonicalPath: fs.realpathSync.native(process.execPath),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      fileId: expect.any(String),
      version: expect.any(String),
    }));
    await runtime.shutdown();

    const reopened = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    const snapshot = reopened.getSnapshot();
    expect(snapshot.shell).toMatchObject({ source: 'workspace_explicit', kind: 'bash', envKeys: ['PROJECT_MODE'] });
    expect(JSON.stringify(snapshot)).not.toContain('alpha-value-not-for-snapshot');
    await reopened.shutdown();
  });

  it('rejects known Provider, header and proxy values in Shell overlays before persistence', async () => {
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    const secret = 'a9-env-known+/ 中文?';
    await runtime.configureProvider({ baseUrl: 'https://example.test/v1', model: 'm', apiKey: secret,
      customHeaders: { 'X-Authorization': 'header-private-sentinel' },
      proxy: { host: 'proxy.example.test', port: 8080, protocol: 'http', password: 'proxy-private-sentinel' },
      skipProbe: true });
    const base64 = Buffer.from(secret).toString('base64');
    for (const value of [secret, 'prefix ' + secret, base64, base64.replace(/=+$/g, ''),
      base64.replace(/\+/g, '-').replace(/\//g, '_'), encodeURIComponent(secret),
      encodeURIComponent(base64), encodeURIComponent(secret).replace(/%20/g, '+'),
      'header-private-sentinel', 'proxy-private-sentinel']) {
      await expect(runtime.configureShell({ kind: 'automatic', envOverlay: { BUILD_MODE: value } }))
        .rejects.toThrow('A9_ENV_OVERLAY_REJECTED');
      expect(fs.existsSync(path.join(env.dataRoot, 'a9-shell-config.v1.json'))).toBe(false);
      expect(JSON.stringify(runtime.getSnapshot())).not.toContain(value);
    }
    await runtime.configureProvider({ baseUrl: 'https://example.test/v2', model: 'm', skipProbe: true });
    await expect(runtime.configureShell({ kind: 'automatic', envOverlay: { BUILD_MODE: secret } }))
      .rejects.toThrow('A9_ENV_OVERLAY_REJECTED');
    await runtime.shutdown();
  });

  it('scrubs newly known secrets from every persisted workspace and keeps rejection across restart', async () => {
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    const secret = 'newly-known-env-credential';
    await runtime.configureShell({ kind: 'automatic', envOverlay: { BUILD_MODE: secret } });
    const file = path.join(env.dataRoot, 'a9-shell-config.v1.json');
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    doc.workspaces.other = { workspace: '/other', envOverlay: { LEGACY: Buffer.from(secret).toString('base64') } };
    doc.workspaces.safe = { workspace: '/safe', envOverlay: { MODE: 'release' } };
    fs.writeFileSync(file, JSON.stringify(doc), 'utf8');
    await expect(runtime.configureProvider({ baseUrl: 'https://example.test/v1', model: 'm',
      apiKey: secret, skipProbe: true })).rejects.toThrow('A9_ENV_OVERLAY_REJECTED');
    const scrubbed = fs.readFileSync(file, 'utf8');
    expect(scrubbed).not.toContain(secret);
    expect(scrubbed).not.toContain(Buffer.from(secret).toString('base64'));
    expect(JSON.parse(scrubbed).workspaces.safe.envOverlay).toEqual({ MODE: 'release' });
    expect(runtime.getSnapshot().shell.available).toBe(false);
    await runtime.shutdown();
    const reopened = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    expect(reopened.getSnapshot().shell).toMatchObject({ available: false, diagnostics: { code: 'A9_ENV_OVERLAY_REJECTED' } });
    await reopened.configureShell({ kind: 'automatic', envOverlay: { BUILD_MODE: 'release' } });
    expect(reopened.getSnapshot().shell.available).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).workspaces.other.environmentRejected).toBe(true);
    await reopened.shutdown();
  });

  it('does not claim persisted environment cleanup when atomic replacement fails', async () => {
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    const secret = 'env-write-failure-sentinel';
    await runtime.configureShell({ kind: 'automatic', envOverlay: { BUILD_MODE: secret } });
    const file = path.join(env.dataRoot, 'a9-shell-config.v1.json');
    const rename = jest.spyOn(require('fs'), 'renameSync').mockImplementation(() => { throw new Error('fixture write failure'); });
    try {
      await expect(runtime.configureProvider({ baseUrl: 'https://example.test/v1', model: 'm',
        apiKey: secret, skipProbe: true })).rejects.toThrow('A9_SHELL_CONFIG_WRITE_FAILED');
      expect(runtime.getSnapshot().shell).toMatchObject({
        available: false, diagnostics: { code: 'A9_SHELL_CONFIG_WRITE_FAILED' },
      });
      expect(JSON.stringify(runtime.getSnapshot())).not.toContain(secret);
      expect(fs.readFileSync(file, 'utf8')).toContain(secret);
      // An explicit Apply must not swallow the failed scrub or discard other
      // workspaces by falling back to a new empty document.
      await expect(runtime.configureShell({ kind: 'automatic', envOverlay: {} }))
        .rejects.toThrow('A9_SHELL_CONFIG_WRITE_FAILED');
    } finally { rename.mockRestore(); }
    await runtime.configureShell({ kind: 'automatic', envOverlay: {} });
    expect(fs.readFileSync(file, 'utf8')).not.toContain(secret);
    await runtime.shutdown();
  });

  it('migrates legacy overlays after restoring DPAPI secrets and rejects NODE controls', async () => {
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (plain: string) => Buffer.from('fixture:' + Buffer.from(plain).toString('base64')),
      decryptString: (cipher: Buffer) => Buffer.from(cipher.toString().slice(8), 'base64').toString(),
    };
    const options = { workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal,
      safeStorage, vaultPlatform: 'win32' };
    const secret = 'legacy-env-api-key-sentinel';
    const runtime = createA9AgentRuntime(options);
    await runtime.configureShell({ kind: 'automatic', envOverlay: { MODE: 'release' } });
    await runtime.configureProvider({ baseUrl: 'https://example.test/v1', model: 'm',
      apiKey: secret, rememberApiKey: true, skipProbe: true });
    await runtime.shutdown();
    const file = path.join(env.dataRoot, 'a9-shell-config.v1.json');
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    doc.schemaVersion = 2;
    (Object.values(doc.workspaces)[0] as any).envOverlay = { BUILD_MODE: encodeURIComponent(secret) };
    doc.workspaces.other = { workspace: '/other', envOverlay: { NODE_DEBUG: 'http' } };
    fs.writeFileSync(file, JSON.stringify(doc), 'utf8');
    const reopened = createA9AgentRuntime(options);
    expect(reopened.getSnapshot().shell.available).toBe(false);
    const scrubbed = fs.readFileSync(file, 'utf8');
    expect(scrubbed).not.toContain(secret);
    expect(scrubbed).not.toContain('NODE_DEBUG');
    expect(JSON.parse(scrubbed).schemaVersion).toBe(3);
    expect(JSON.parse(scrubbed).workspaces.other.environmentRejected).toBe(true);
    await reopened.shutdown();
  });

  it('requires user reselection when a persisted explicit Shell file is replaced', async () => {
    const selected = path.join(path.dirname(env.workspaceRoot), 'selected-shell.exe');
    const replacement = path.join(path.dirname(env.workspaceRoot), 'replacement-shell.exe');
    fs.writeFileSync(selected, 'shell-v1', 'utf8');
    const runtime = createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot,
      dataRoot: env.dataRoot,
      openDatabase: openReal,
      selectShellExecutable: async () => selected,
    });
    await runtime.configureShell({ kind: 'cmd', envOverlay: {} });
    await runtime.shutdown();

    fs.writeFileSync(replacement, 'shell-v2', 'utf8');
    fs.renameSync(replacement, selected);
    const reopened = createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot,
      dataRoot: env.dataRoot,
      openDatabase: openReal,
    });
    expect(reopened.getSnapshot().shell).toMatchObject({
      source: 'invalid_saved_setting',
      available: false,
      diagnostics: { code: 'A9_SHELL_IDENTITY_CHANGED' },
    });
    await reopened.shutdown();
  });

  it('rejects a user-supplied Shell version label and stores only the measured version', async () => {
    const runtime = createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot,
      dataRoot: env.dataRoot,
      openDatabase: openReal,
      selectShellExecutable: async () => process.execPath,
    });
    await expect(runtime.configureShell({
      kind: 'bash', version: 'user-spoofed-version', envOverlay: {},
    })).rejects.toThrow(/Shell 版本只能由文件测量/);
    expect(fs.existsSync(path.join(env.dataRoot, 'a9-shell-config.v1.json'))).toBe(false);
    await runtime.shutdown();
  });

  it('rejects secret-shaped or process-control environment settings before persistence', async () => {
    const runtime = createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot,
      dataRoot: env.dataRoot,
      openDatabase: openReal,
      selectShellExecutable: async () => process.execPath,
    });
    await expect(runtime.configureShell({
      kind: 'bash', envOverlay: { API_TOKEN: 'do-not-store' },
    })).rejects.toThrow(/A9_ENV_OVERLAY_REJECTED/);
    expect(fs.existsSync(path.join(env.dataRoot, 'a9-shell-config.v1.json'))).toBe(false);
    runtime.shutdown();
  });

  it('serializes native Shell picker requests so settings cannot race', async () => {
    let finishPicker: (value: string | null) => void = () => {};
    const runtime = createA9AgentRuntime({
      workspaceRoot: env.workspaceRoot,
      dataRoot: env.dataRoot,
      openDatabase: openReal,
      selectShellExecutable: () => new Promise((resolve) => { finishPicker = resolve; }),
    });
    const first = runtime.configureShell({ kind: 'bash', envOverlay: {} });
    await expect(runtime.configureShell({ kind: 'cmd', envOverlay: {} }))
      .rejects.toThrow(/A9_SHELL_RECONFIGURE_BUSY/);
    finishPicker(null);
    await expect(first).resolves.toEqual({ ok: false, cancelled: true });
    runtime.shutdown();
  });

  it('accepts an arbitrary base URL and manual model id, then runs a full fixture round', async () => {
    const fixture = await startFixtureModel([
      { tool: { id: 'r1', name: 'read', args: { path: 'calc.ts' } } },
      { tool: { id: 'e1', name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } },
      { tool: { id: 's1', name: 'shell', args: { command: 'node -e \"console.log(\'verified\')\"' } } },
      { content: 'Fixed and verified.' },
    ]);
    try {
      fs.writeFileSync(path.join(env.workspaceRoot, 'calc.ts'), 'export function add(a, b) {\n  return a - b;\n}\n');
      const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
      runtime.setMode('full_access');
      const configured = await runtime.configureProvider({
        baseUrl: fixture.baseUrl,
        model: 'my-manual-model-id',
        customHeaders: { 'X-Workspace': 'a9' },
      });
      expect(configured.ok).toBe(true);
      expect(configured.model).toBe('my-manual-model-id');
      expect(configured.probe.classification).toBe('tool_calling');
      expect(configured.keyRemembered).toBe(false);

      const turn = await runtime.submitTurn('fix the bug');
      expect(turn.ok).toBe(true);
      expect(turn.result.outcome).toBe('completed');
      expect(turn.result.verification).toBe('verified');
      expect(fs.readFileSync(path.join(env.workspaceRoot, 'calc.ts'), 'utf8')).toContain('a + b');

      // Diff 与撤销可用。
      const diff = runtime.getDiff(turn.result.turnId);
      expect(diff.ok).toBe(true);
      expect(JSON.stringify(diff.diff)).toContain('calc.ts');
      const undone = await runtime.undoTurn(turn.result.turnId);
      expect(undone.ok).toBe(true);
      expect(fs.readFileSync(path.join(env.workspaceRoot, 'calc.ts'), 'utf8')).toContain('a - b');

      const snapshot = runtime.getSnapshot();
      expect(snapshot.mode).toBe('full_access');
      expect(snapshot.shell.kind).toBeDefined();
      expect(snapshot.provider.model).toBe('my-manual-model-id');
      expect(snapshot.checkpoints.length).toBeGreaterThanOrEqual(1);
      const shellEvent = snapshot.timeline.find((event: any) => event.type === 'tool_end' && event.data.toolName === 'shell');
      expect(shellEvent.data.shell).toMatchObject({
        schemaVersion: 1, status: 'exited', exitCode: 0, stdout: expect.stringContaining('verified'),
        timedOut: false, truncated: false,
      });
      runtime.shutdown();
    } finally {
      await fixture.close();
    }
  }, 30_000);

  it('exposes honest git status including non-git degradation', async () => {
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    const git = await runtime.gitStatus();
    expect(git.ok).toBe(true);
    expect(git.projection.isGit).toBe(false);
    expect(git.projection.degradedReason).toContain('不是 Git 仓库');
    runtime.shutdown();
  });

  it('redacts known Provider secrets from Git diff and configuration projections', async () => {
    const secret = 'GIT-PROJECTION-SECRET-42';
    const git = (...args: string[]) => execFileSync('git', args, { cwd: env.workspaceRoot, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 'agent@example.test');
    git('config', 'user.name', 'A9 Test');
    fs.writeFileSync(path.join(env.workspaceRoot, 'note.txt'), 'safe\n');
    git('add', 'note.txt');
    git('commit', '-q', '-m', 'initial');
    fs.writeFileSync(path.join(env.workspaceRoot, 'note.txt'), `${secret}\n`);
    git('config', 'credential.helper', `!echo ${secret}`);
    const runtime = createA9AgentRuntime({ workspaceRoot: env.workspaceRoot, dataRoot: env.dataRoot, openDatabase: openReal });
    await runtime.configureProvider({ baseUrl: 'https://example.test/v1', model: 'm', apiKey: secret, skipProbe: true });
    const projection = JSON.stringify((await runtime.gitStatus()).projection);
    expect(projection).toContain('***redacted***');
    expect(projection).not.toContain(secret);
    await runtime.shutdown();
  });
});

describe('A9-06: a9 product IPC schema validation', () => {
  const handler = createA9ProductRequestHandler({
    getA9Runtime: () => ({ getSnapshot: () => ({ mode: 'read_only' }), setMode: (m: string) => ({ ok: true, mode: m }) }),
    isValidRendererSender: validSender,
  });

  it('rejects unknown actions, extra fields, and unsupported schema versions', async () => {
    const unknownAction = await handler({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.nope', payload: {} });
    expect(unknownAction.ok).toBe(false);
    expect(unknownAction.error.code).toBe('A9_ACTION_UNAVAILABLE');

    const extraField = await handler({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.mode.set', payload: { mode: 'review', evil: 1 } });
    expect(extraField.ok).toBe(false);
    expect(extraField.error.code).toBe('A9_PAYLOAD_INVALID');

    const missingField = await handler({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.mode.set', payload: {} });
    expect(missingField.ok).toBe(false);

    const oldSchema = await handler({}, { schemaVersion: 0, action: 'a9.snapshot.get', payload: {} });
    expect(oldSchema.ok).toBe(false);
    expect(oldSchema.error.code).toBe('A9_SCHEMA_VERSION_UNSUPPORTED');
  });

  it('rejects insecure TLS at the IPC schema boundary', async () => {
    const configureProvider = jest.fn();
    const providerHandler = createA9ProductRequestHandler({
      getA9Runtime: () => ({ configureProvider }),
      isValidRendererSender: validSender,
    });
    const response = await providerHandler({}, {
      schemaVersion: A9_IPC_SCHEMA_VERSION,
      action: 'a9.provider.configure',
      payload: { baseUrl: 'https://example.test/v1', model: 'm', allowInsecureTLS: true },
    });
    expect(response).toMatchObject({ ok: false, error: { code: 'A9_PAYLOAD_INVALID' } });
    expect(configureProvider).not.toHaveBeenCalled();
  });

  it('allows only the exact user shell settings payload', async () => {
    const configureShell = jest.fn(() => ({ ok: true }));
    const shellHandler = createA9ProductRequestHandler({
      getA9Runtime: () => ({ configureShell }),
      isValidRendererSender: validSender,
    });
    const payload = { kind: 'automatic', envOverlay: {} };
    expect(await shellHandler({}, {
      schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.shell.configure', payload,
    })).toEqual({ ok: true });
    expect(configureShell).toHaveBeenCalledWith(payload);
    const spoofedVersion = await shellHandler({}, {
      schemaVersion: A9_IPC_SCHEMA_VERSION,
      action: 'a9.shell.configure',
      payload: { ...payload, version: 'user-label' },
    });
    expect(spoofedVersion).toMatchObject({ ok: false, error: { code: 'A9_PAYLOAD_INVALID' } });
    const rejected = await shellHandler({}, {
      schemaVersion: A9_IPC_SCHEMA_VERSION,
      action: 'a9.shell.configure',
      payload: { ...payload, path: 'cmd.exe' },
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'A9_PAYLOAD_INVALID' } });
  });

  it('validates and forwards only bounded A9 workspace reads', async () => {
    const readWorkspaceFile = jest.fn(() => ({ ok: true, result: { lines: [] } }));
    const readHandler = createA9ProductRequestHandler({
      getA9Runtime: () => ({ readWorkspaceFile }),
      isValidRendererSender: validSender,
    });
    const valid = { path: '中文.txt', startLine: 1, maxLines: 500, encoding: 'gbk' };
    expect(await readHandler({}, {
      schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.workspace.read', payload: valid,
    })).toMatchObject({ ok: true });
    expect(readWorkspaceFile).toHaveBeenCalledWith(valid);
    for (const payload of [
      { path: 'x', startLine: 1, maxLines: 500, encoding: 'latin1' },
      { path: 'x', startLine: 0, maxLines: 500 },
      { path: 'x', startLine: 1, maxLines: 500, extra: true },
    ]) {
      const rejected = await readHandler({}, {
        schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.workspace.read', payload,
      });
      expect(rejected).toMatchObject({ ok: false, error: { code: 'A9_PAYLOAD_INVALID' } });
    }
  });

  it('rejects non-whitelisted senders (renderer capability boundary)', async () => {
    const strict = createA9ProductRequestHandler({
      getA9Runtime: () => ({ getSnapshot: () => ({}) }),
      isValidRendererSender: () => false,
    });
    const denied = await strict({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.snapshot.get', payload: {} });
    expect(denied.ok).toBe(false);
    expect(denied.error.code).toBe('RENDERER_CAPABILITY_DENIED');
  });

  it('forwards valid mode changes', async () => {
    const ok = await handler({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.mode.set', payload: { mode: 'read_only' } });
    expect(ok).toEqual({ ok: true, mode: 'read_only' });
  });

  it('whitelists conversation and encrypted-draft actions while rejecting extra fields', async () => {
    const calls: any[] = [];
    const conversationHandler = createA9ProductRequestHandler({
      getA9Runtime: () => ({
        createConversation: () => ({ ok: true, conversationId: 'a9c-new' }),
        activateConversation: (id: string) => { calls.push(['activate', id]); return { ok: true }; },
        renameConversation: (id: string, title: string) => { calls.push(['rename', id, title]); return { ok: true }; },
        archiveConversation: (id: string) => { calls.push(['archive', id]); return { ok: true }; },
        restoreConversation: (id: string) => { calls.push(['restore', id]); return { ok: true }; },
        saveDraft: (text: string) => { calls.push(['draft', text]); return { ok: true, persistence: 'dpapi' }; },
      }),
      isValidRendererSender: validSender,
    });
    const request = (action: string, payload: object) => conversationHandler({}, {
      schemaVersion: A9_IPC_SCHEMA_VERSION, action, payload,
    });
    expect(await request('a9.conversation.create', {})).toEqual({ ok: true, conversationId: 'a9c-new' });
    expect((await request('a9.conversation.activate', { conversationId: 'a9c-1' })).ok).toBe(true);
    expect((await request('a9.conversation.rename', { conversationId: 'a9c-1', title: '名称' })).ok).toBe(true);
    expect((await request('a9.conversation.archive', { conversationId: 'a9c-1' })).ok).toBe(true);
    expect((await request('a9.conversation.restore', { conversationId: 'a9c-1' })).ok).toBe(true);
    expect((await request('a9.draft.save', { text: '未发送草稿' })).ok).toBe(true);
    expect(calls).toEqual([
      ['activate', 'a9c-1'], ['rename', 'a9c-1', '名称'], ['archive', 'a9c-1'],
      ['restore', 'a9c-1'], ['draft', '未发送草稿'],
    ]);
    const extra = await request('a9.draft.save', { text: 'x', leak: true });
    expect(extra.error.code).toBe('A9_PAYLOAD_INVALID');
  });
});
