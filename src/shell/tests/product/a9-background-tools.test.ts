/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { createRequire } from 'module';
import Database from 'better-sqlite3';
import * as Core from '../../../core/src';
import * as State from '../../../state/src/a9-persistence';
import { BackgroundProcessManager } from '../../../runner/src/background-process-manager';

function testPlatform(value: NodeJS.Platform) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { ...original, value });
  return { restore: () => Object.defineProperty(process, 'platform', original) };
}

async function scenario(auditFailure = false, releaseFailure = false, options: {
  workspace?: string; canonicalize?: (workspace: string) => string; startingAuditFailure?: boolean;
} = {}) {
  const workspace = options.workspace ?? '/memory/workspace';
  const disk = new Map<string, unknown>();
  const memoryFs = { mkdirSync() {}, existsSync: (p: string) => disk.has(p), writeFileSync: (p: string, v: unknown) => disk.set(p, v),
    readFileSync: (p: string) => disk.get(p), renameSync: (a: string, b: string) => { disk.set(b, disk.get(a)); disk.delete(a); } };
  const file = path.resolve(__dirname, '../../product/a9-agent-runtime.js'), req = createRequire(file);
  const box: any = { module: { exports: {} }, exports: {}, require: (n: string) => n === 'fs' ? memoryFs : req(n), __dirname: path.dirname(file),
    Buffer, URL, process, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, console };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), box, { filename: file });
  const projected: string[] = []; let audited = 0;
  let db: any, manager!: BackgroundProcessManager, publish!: (c: any) => Promise<void>;
  let complete!: (c: any) => void; let requests = 0, seq = 0, bytes = 0, nativeStarts = 0;
  class Mode { static settingsFilePathFor() { return '/memory/mode'; } static legacyBasenameFilePathFor() { return '/memory/legacy'; }
    load() { return { status: 'configured', settings: { permissionMode: 'full_access' } }; } }
  class Workspace { getCheckpointManager() { return { loadCheckpoint() {}, revalidatePersistedTurns() {}, getRecoveryDiagnostics: () => [] }; }
    async freezeTurnBaseline() { return {}; } async collectExternalChanges() { return { changes: [], unrecoverable: [] }; } }
  class Runner {
    constructor(opts: any) {
      manager = new BackgroundProcessManager({ invoke: jest.fn(), startManaged: (_request: any, _env: any, callback: any) => {
        nativeStarts++;
        const intent = db.prepare("SELECT payload_json FROM a9_events WHERE event_type='managed_process_ownership' ORDER BY id DESC LIMIT 1").get();
        expect(intent).toBeDefined();
        expect(JSON.parse(intent.payload_json)).toMatchObject({ handleId: 'h', ownershipState: 'owned' });
        expect(db.prepare('SELECT last_probe_status FROM a9_managed_processes WHERE handle_id=?').get('h')).toEqual({ last_probe_status: 'starting' });
        publish = callback; const completion = new Promise<any>((r) => { complete = r; });
        return { ready: Promise.resolve({ childPid: 345 } as any), completion, cancel: () => complete({ kind: 'response', response: {
          schemaVersion: 3, type: 'execution_result', requestId: 'req', profileId: 'a9-trusted-shell-current-user-v2',
          exitCode: 1, canceled: true, timedOut: false, idleTimedOut: false, containmentVerified: true,
          inputDetached: true, cleanupConfirmed: true, workDirAclModified: false,
          hostJob: { detected: false, breakaway: 'none', childJobAssignmentVerified: true },
          tokenAudit: { verified: true, tokenMode: 'current_user', restrictedToken: false, tokenType: 'primary', sameUser: true, lowIntegrity: false },
          lastOutputSeq: seq, stdout: { rawBytesRead: bytes, emittedBytes: bytes, omittedBytes: 0 }, stderr: { rawBytesRead: 0, emittedBytes: 0, omittedBytes: 0 },
        } }),
          release: async (releaseId: string) => {
            if (releaseFailure) { complete({ kind: 'helper_crashed', detail: 'lost receipt', cleanupConfirmed: false }); throw new Error('A9_RELEASE_UNKNOWN'); }
            const receipt: any = { type: 'execution_released', schemaVersion: 3, releaseId, requestId: 'req', childPid: 345, lastOutputSeq: seq,
              stdout: { rawBytesRead: bytes, emittedBytes: bytes, omittedBytes: 0 }, stderr: { rawBytesRead: 0, emittedBytes: 0, omittedBytes: 0 }, jobKillOnCloseDisabled: true, ownershipReleased: true };
            complete({ kind: 'response', response: receipt }); return receipt;
          } };
      } }, (s) => { const safe = opts.redactText(s); projected.push(safe); return safe; }, opts.getSensitiveValues, opts.onBackgroundStateChange);
    }
    getBackgroundManager() { return manager; }
  }
  class Provider { async sendStreamRequest() { return ++requests === 1
    ? { id: 'tools', content: '', finishReason: 'tool_calls', toolCalls: [{ id: 'start-call', name: 'start_process', arguments: '{"command":"echo tick"}' }] }
    : { id: 'done', content: 'done', finishReason: 'stop' }; } }
  const runtime = box.module.exports.createA9AgentRuntime({ workspaceRoot: workspace, dataRoot: '/memory/data', ownerId: 'managed-test',
    modules: { core: { ...Core, canonicalizeWorkspacePath: options.canonicalize ?? ((p: string) => p), WorkspaceModeSettingsStore: Mode }, state: State,
      workspace: { A9WorkspaceService: Workspace }, gateway: { OpenAICompatibleProvider: Provider }, gitAdapter: {},
      runner: { TrustedShellRunner: Runner, selectShell: () => ({ available: true, kind: 'cmd' }), validateTrustedShellEnvironmentOverlay: (x: any) => x,
        createTrustedShellLoopAdapter: () => ({ execute: async (_command: string, opts: any) => {
          await manager.start('h', 'echo tick', 'cmd.exe', [], workspace, undefined,
            { schemaVersion: 3, requestId: 'req', outputEncoding: { stdout: 'utf-8', stderr: 'utf-8' }, managed: true } as any, { owner: opts.managedOwner, onOutput: async (c) => { audited++; await opts.onOutput(c); } });
          return { status: 'background_started', backgroundHandle: 'h', exitCode: null, stdout: '', stderr: '', durationMs: 1, timedOut: false };
        } }) } }, openDatabase: () => { db = new Database(':memory:'); return db; } });
  await runtime.configureProvider({ baseUrl: 'http://example.invalid', model: 'fixture', skipProbe: true });
  if (options.startingAuditFailure) db.exec("CREATE TRIGGER fail_intent BEFORE INSERT ON a9_events WHEN NEW.event_type='managed_process_ownership' BEGIN SELECT RAISE(FAIL,'intent disk failed'); END");
  const result = await runtime.submitTurn('start background');
  if (!options.startingAuditFailure && !result.ok) { db.close(); expect(result.ok).toBe(true); }
  if (auditFailure) db.exec("CREATE TRIGGER fail_output BEFORE INSERT ON a9_events WHEN NEW.event_type='tool_output' BEGIN SELECT RAISE(FAIL,'disk failed'); END");
  async function output(text: string) { const b = Buffer.from(text); bytes += b.length; await publish({ type: 'output_chunk', requestId: 'req', stream: 'stdout', seq: ++seq, streamOffset: bytes - b.length, byteLength: b.length, dataBase64: b.toString('base64') }); }
  return { runtime, db, manager, output, result, trace: () => ({ audited, projected, nativeStarts, requests }), close: () => db.close(),
    ipc: req('./a9-product-ipc').createA9ProductRequestHandler({ getA9Runtime: () => runtime, isValidRendererSender: () => true }) };
}

it.each(['stop', 'release'])('uses canonical Windows ownership before native start and keeps display-path facts through %s', async (choice) => {
  const platform = testPlatform('win32');
  const workspace = 'C:\\Users\\A9 Builder\\中文 空格%#\\Project';
  let f: Awaited<ReturnType<typeof scenario>> | undefined;
  try {
    f = await scenario(false, false, { workspace, canonicalize: Core.canonicalizeWorkspacePath });
    expect(f.result.ok).toBe(true);
    const owner = f.manager.list()[0].owner!;
    expect(owner.workspace).toBe(Core.canonicalizeWorkspacePath(workspace, 'win32'));
    expect(f.trace().nativeStarts).toBe(1);
    expect(f.db.prepare('SELECT workspace_path FROM a9_sessions').get()).toEqual({ workspace_path: owner.workspace });
    expect(f.db.prepare('SELECT workspace_path FROM a9_managed_processes').get()).toEqual({ workspace_path: workspace });
    await f.output('中文 tick after completed turn\n');
    expect(f.db.prepare("SELECT turn_id FROM a9_events WHERE event_type='tool_output'").get()).toEqual({ turn_id: owner.turnId });
    expect(f.runtime.getSnapshot().managedProcesses).toEqual([expect.objectContaining({ handleId: 'h' })]);
    expect(() => f!.manager.readOutput('h', { ...owner, workspace: owner.workspace + '-other' })).toThrow('WRONG_OWNER');
    const page = await f.ipc({}, { schemaVersion: 7, action: 'a9.events.query', payload: { conversationId: owner.conversationId, limit: 100 } });
    expect(page.events.some((e: any) => e.eventType === 'tool_output')).toBe(true);
    const result = await f.runtime.shutdown({ stopManaged: choice === 'stop' });
    expect(result.unresolved).toEqual([]);
    expect(result.leftToSystem).toEqual(choice === 'release' ? ['h'] : []);
    expect(f.db.prepare('SELECT last_probe_status FROM a9_managed_processes').get().last_probe_status).toBe(choice === 'release' ? 'released' : 'stopped');
  } finally { f?.close(); platform.restore(); }
});

it('does not launch or publish a Windows managed process when its starting audit transaction fails', async () => {
  const platform = testPlatform('win32');
  let f: Awaited<ReturnType<typeof scenario>> | undefined;
  try {
    f = await scenario(false, false, { workspace: 'C:\\Users\\A9 Builder\\Project', canonicalize: Core.canonicalizeWorkspacePath, startingAuditFailure: true });
    expect(f.result).toMatchObject({ ok: false, error: { code: 'A9_AUDIT_PERSISTENCE_FAILED', failedEvent: 'tool_end' } });
    expect(f.trace().nativeStarts).toBe(0);
    expect(f.manager.list()).toEqual([]);
    expect(f.db.prepare('SELECT count(*) AS n FROM a9_managed_processes').get()).toEqual({ n: 0 });
    expect(f.db.prepare("SELECT count(*) AS n FROM a9_events WHERE event_type IN ('managed_process_ownership','tool_output')").get()).toEqual({ n: 0 });
    const requests = f.trace().requests;
    expect((await f.runtime.submitTurn('retry')).error.code).toBe('A9_AUDIT_PERSISTENCE_FAILED');
    expect(f.trace().requests).toBe(requests);
  } finally { f?.close(); platform.restore(); }
});
it('keeps late background output bound to original completed turn and exposes SQLite identity through IPC', async () => {
  const f = await scenario(); try {
    const owner = f.manager.list()[0].owner!;
    await f.output('tick after turn\n');
    const events = f.db.prepare("SELECT session_id,turn_id,payload_json FROM a9_events WHERE event_type='tool_output'").all();
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ session_id: owner.conversationId, turn_id: owner.turnId });
    expect(JSON.parse(events[0].payload_json).data).toMatchObject({ toolName: 'start_process', taskId: owner.taskId, toolCallId: owner.toolCallId, outputSeq: 1 });
    const page = await f.ipc({}, { schemaVersion: 7, action: 'a9.events.query', payload: { conversationId: owner.conversationId, limit: 100 } });
    expect(page.events.some((e: any) => e.eventType === 'tool_output')).toBe(true);
    expect(f.runtime.getSnapshot().timeline.some((e: any) => e.type === 'tool_output')).toBe(true);
    const released = await f.runtime.shutdown({ stopManaged: false }); expect(released).toMatchObject({ leftToSystem: ['h'], unresolved: [] });
    expect(f.db.prepare('SELECT last_probe_status FROM a9_managed_processes WHERE handle_id=?').get('h').last_probe_status).toBe('released');
    expect(JSON.parse(f.db.prepare("SELECT payload_json FROM a9_events WHERE event_type='managed_process_ownership' ORDER BY id DESC LIMIT 1").get().payload_json).ownershipState).toBe('released');
  } finally { f.close(); }
});
it.each(['tick\n', 'visible tick\n', '中文 late output\r\n'])('late mandatory output audit failure blocks future turns without publishing output (%#)', async (text) => {
  const f = await scenario(true); try {
    const check = f.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='fail_output'").get(); expect(check).toBeDefined();
    let caught: any; try { await f.output(text); } catch (error) { caught = error; }
    expect({ caught: caught?.message, trace: f.trace() }).toMatchObject({ caught: expect.stringContaining('disk failed') });
    expect(f.manager.readOutput('h', f.manager.list()[0].owner!).entries).toEqual([]);
    const result = await f.runtime.submitTurn('retry'); expect(result.ok).toBe(false); expect(result.error.code).toBe('A9_AUDIT_PERSISTENCE_FAILED');
    expect(f.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='tool_output'").get().n).toBe(0);
  } finally { f.close(); }
});
it('identifies the historical cross-realm SqliteError matcher failure without weakening audit assertions', async () => {
  const f = await scenario(true);
  const req = createRequire(path.resolve(__dirname, '../../product/a9-agent-runtime.js'));
  const addon = req(path.resolve(path.dirname(req.resolve('better-sqlite3')), '../build/Release/better_sqlite3.node'));
  let originalConstructor: any;
  try { f.db.exec('SELECT * FROM audit_matcher_missing_table'); }
  catch (error) { originalConstructor = Object.getPrototypeOf(error).constructor; }
  const foreign: any = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.resolve(path.dirname(req.resolve('better-sqlite3')), 'sqlite-error.js'), 'utf8'), foreign);
  // The native addon retains its first initialized constructor across Jest VMs.
  // Reproduce that prior-suite realm explicitly, then restore its constructor.
  addon.setErrorConstructor(foreign.module.exports);
  try {
    let caught: any; try { await f.output('tick\n'); } catch (error) { caught = error; }
    expect(caught?.message).toContain('disk failed');
    expect(caught?.name).toBe('SqliteError');
    expect(Object.prototype.toString.call(caught)).toBe('[object Object]');
    expect(caught instanceof Error).toBe(false);
    // A prior realm's SQLite Error prototype differs from this Jest VM's,
    // so rejects.toThrow misclassifies an actual rejected audit write.
    let matcherFailure: any;
    try { await expect(Promise.reject(caught)).rejects.toThrow('disk failed'); }
    catch (error) { matcherFailure = error; }
    expect(matcherFailure?.message).toContain('Received function did not throw');
    await expect(Promise.reject(new Error(caught.message))).rejects.toThrow('disk failed');
    expect(f.trace().audited).toBe(1);
    expect(f.manager.readOutput('h', f.manager.list()[0].owner!).entries).toEqual([]);
    expect(f.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='tool_output'").get().n).toBe(0);
    expect((await f.runtime.submitTurn('retry')).error.code).toBe('A9_AUDIT_PERSISTENCE_FAILED');
  } finally { addon.setErrorConstructor(originalConstructor); f.close(); }
});
it('lost release acknowledgement retains workspace lock and visible unknown ownership', async () => {
  const f = await scenario(false, true); try {
    const result = await f.runtime.shutdown({ stopManaged: false }); expect(result.leftToSystem).toEqual([]); expect(result.unresolved).toHaveLength(1);
    expect(f.manager.getActiveCount()).toBe(1); expect(f.manager.list()[0].ownershipState).toBe('release_unknown');
    const ownership = JSON.parse(f.db.prepare("SELECT payload_json FROM a9_events WHERE event_type='managed_process_ownership' ORDER BY id DESC LIMIT 1").get().payload_json);
    expect(ownership.ownershipState).toBe('release_unknown');
  } finally { f.close(); }
});

it('main offers stop/release/cancel before shutdown and blocks unknown release', async () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../../product/main.js'), 'utf8');
  const start = main.indexOf('async function selectA9ShutdownPolicy()'), end = main.indexOf('function beginA9ShutdownBeforeQuit(', start);
  let response = 1; const runtime = { getSnapshot: () => ({ managedProcesses: [{ handleId: 'h', lastProbeStatus: 'running' }] }), shutdown: jest.fn(async () => ({ unresolved: [] as string[], leftToSystem: ['h'] })) };
  const dialog = { showMessageBox: jest.fn(async () => { expect(runtime.shutdown).not.toHaveBeenCalled(); return { response }; }) };
  const choose = vm.runInNewContext(main.slice(start, end) + '; executeA9ShutdownChoice', { a9RuntimeInstance: runtime, dialog });
  expect(await choose()).toBe(true); expect(runtime.shutdown).toHaveBeenCalledWith({ stopManaged: false });
  runtime.shutdown.mockClear(); response = 2; expect(await choose()).toBe(false); expect(runtime.shutdown).not.toHaveBeenCalled();
  runtime.shutdown.mockClear(); response = 0; runtime.shutdown.mockResolvedValueOnce({ unresolved: [] as string[], leftToSystem: [] }); expect(await choose()).toBe(true); expect(runtime.shutdown).toHaveBeenCalledWith();
  runtime.shutdown.mockClear(); response = 1; runtime.shutdown.mockResolvedValueOnce({ unresolved: ['release_unknown'], leftToSystem: [] }); await expect(choose()).rejects.toThrow('RESIDUE');
});
it('renderer keeps late output on the original settled tool card and ignores duplicate sequence', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../product/renderer/a9-workbench.js'), 'utf8');
  const start = source.indexOf('  function appendEventNode('), end = source.indexOf('\n  function ', start + 10);
  const calls: any[] = []; const original: any = { li: { appendChild() {} }, tag: {}, outputEl: null };
  const block: any = { pendingItems: new Map([['call', original]]), outputItems: new Map([['call', original]]) };
  const append = vm.runInNewContext(source.slice(start, end) + '; appendEventNode', { document: { createElement: () => ({ setAttribute() {}, textContent: '' }) },
    state: {}, TOOL_OUTPUT_LIMIT: 32000, ensureActivityGroup() {}, settleItem() {}, toolEndStatus: () => ['completed', '完成'], attachActivityDetail() {},
    addActivityItem: (...args: any[]) => { calls.push(args); return original; } });
  append(block, { type: 'tool_end', data: { toolName: 'start_process', callId: 'call' } }); expect(block.pendingItems.has('call')).toBe(false);
  const event = { type: 'tool_output', turnId: 'turn', data: { schemaVersion: 1, toolName: 'start_process', toolCallId: 'call', outputSeq: 1, stream: 'stdout', text: 'late tick\n', truncated: false } };
  append(block, event); append(block, event); expect(calls).toHaveLength(0); expect(original.streamOutput.stdout).toBe('late tick\n');
});
