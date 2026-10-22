/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { createRequire } from 'module';
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import * as RunnerModule from '../../../runner/dist';
import * as Core from '../../../core/src';
import * as State from '../../../state/src/a9-persistence';

describe('A9-29 real Runtime and SQLite audit failure', () => {
  async function scenario(failedEvent?: string, failAll = false, streaming = false) {
    const disk = new Map<string, unknown>();
    const memoryFs = { mkdirSync() {}, existsSync: (p: string) => disk.has(p),
      writeFileSync: (p: string, value: unknown) => disk.set(p, value), readFileSync: (p: string) => disk.get(p),
      renameSync: (a: string, b: string) => { disk.set(b, disk.get(a)); disk.delete(a); } };
    const file = path.resolve(__dirname, '../../product/a9-agent-runtime.js');
    const req = createRequire(file);
    const box: any = { module: { exports: {} }, exports: {}, require: (name: string) => name === 'fs' ? memoryFs : req(name),
      __dirname: path.dirname(file), Buffer, URL, process, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, console };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), box, { filename: file });
    let db: any;
    let edits = 0;
    let requests = 0;
    class Mode {
      static settingsFilePathFor() { return '/memory/mode'; }
      static legacyBasenameFilePathFor() { return '/memory/legacy'; }
      load() { return { status: 'configured', settings: { permissionMode: 'full_access' } }; }
    }
    const checkpoint = { loadCheckpoint() {}, revalidatePersistedTurns() {}, getRecoveryDiagnostics: () => [] };
    class Workspace {
      getCheckpointManager() { return checkpoint; }
      async freezeTurnBaseline() { return {}; }
      async collectExternalChanges() { return []; }
      async edit() { edits++; return { replaced: true }; }
    }
    class Runner { getBackgroundManager() { return { getActiveCount: () => 0, list: () => [] }; } }
    const cp = require('child_process');
    let helperRequest: any; let helper: any;
    const spawnSpy = streaming ? jest.spyOn(cp, 'spawn').mockImplementation(() => {
      helper = new EventEmitter(); helper.pid = 4321;
      helper.stdout = new PassThrough(); helper.stderr = new PassThrough();
      helper.kill = jest.fn(() => { setImmediate(() => helper.emit('close', 1)); return true; });
      helper.stdin = new PassThrough({ write(chunk, _encoding, callback) {
        const message = JSON.parse(chunk.toString());
        if (message.type === 'cancel') { callback(Object.assign(new Error('private broken pipe'), { code: 'EPIPE' })); return; }
        helperRequest = message;
        const tokenAudit = { source: 'suspended_child_process_token', verified: true, tokenMode: 'current_user',
          restrictedToken: false, tokenType: 'primary', sameUser: true, lowIntegrity: false, integritySid: 'S-1-16-8192', integrityRid: 8192 };
        const frame = (value: any) => helper.stdout.write(JSON.stringify({ schemaVersion: 3, requestId: message.requestId,
          profileId: message.profileId, ...value }) + '\n');
        callback(); setImmediate(() => {
          frame({ type: 'execution_started', helperPid: 4321, childPid: 5331, ready: { childJobAssignmentVerified: true,
            inputDetached: true, stdoutCaptureReady: true, stderrCaptureReady: true }, tokenAudit });
          const text = 'synthetic output '.repeat(32) + '\n';
          frame({ type: 'output_chunk', seq: 1, stream: 'stdout', streamOffset: 0, byteLength: Buffer.byteLength(text), dataBase64: Buffer.from(text).toString('base64') });
        });
      } });
      return helper;
    }) : undefined;
    const identity = { canonicalPath: 'C:\\Windows\\System32\\cmd.exe', sha256: 'a'.repeat(64), fileId: 'fixture', version: '6.1.7601' };
    class StreamingRunner extends RunnerModule.TrustedShellRunner {
      constructor(options: any) { super({ ...options, platform: 'win32', logDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'a9-audit-pipe-')),
        resolveShellIdentity: () => identity, getConfiguredShellIdentity: () => identity }); }
      execute(request: any) { return super.execute({ ...request, shellKind: 'cmd', shellPath: identity.canonicalPath }); }
    }
    class Provider { async sendStreamRequest() { return ++requests === 1
      ? { id: 'tools', content: '', finishReason: 'tool_calls', toolCalls: [1, 2].map((i) => ({ id: `edit-${i}`, name: streaming ? 'shell' : 'edit',
        arguments: streaming ? '{"command":"echo synthetic"}' : '{"path":"x","old_text":"a","new_text":"b"}' })) }
      : { id: 'done', content: 'done', finishReason: 'stop' }; } }
    const rt = box.module.exports.createA9AgentRuntime({ workspaceRoot: '/memory/workspace', dataRoot: '/memory/data', ownerId: 'audit-test',
      ...(streaming ? { runnerHelperPath: 'synthetic-helper', runnerPlatform: 'win32' } : {}),
      modules: { core: { ...Core, canonicalizeWorkspacePath: (p: string) => p, WorkspaceModeSettingsStore: Mode }, state: State,
        workspace: { A9WorkspaceService: Workspace }, gateway: { OpenAICompatibleProvider: Provider },
        runner: { ...(streaming ? RunnerModule : {}), TrustedShellRunner: streaming ? StreamingRunner : Runner,
          createTrustedShellLoopAdapter: streaming ? RunnerModule.createTrustedShellLoopAdapter : () => ({}),
          selectShell: () => ({ available: true, kind: 'cmd' }), validateTrustedShellEnvironmentOverlay: (x: unknown) => x }, gitAdapter: {} },
      openDatabase: () => { db = new Database(':memory:'); return db; } });
    try {
      await rt.configureProvider({ baseUrl: 'http://example.invalid', model: 'fixture', skipProbe: true });
      if (failedEvent || failAll) db!.exec(`CREATE TRIGGER audit_fail BEFORE INSERT ON a9_events ${failAll ? '' : `WHEN NEW.event_type = '${failedEvent}'`}
        BEGIN SELECT RAISE(FAIL, 'private injected audit failure'); END`);
      const result = await rt.submitTurn('edit twice');
      if (result.result?.auditIncomplete) {
        const beforeTasks = db!.prepare('SELECT task_id FROM a9_tasks').all().length;
        const retry = await rt.submitTurn('retry without reopening');
        expect(retry.ok).toBe(false);
        expect(retry.result.auditIncomplete).toEqual(result.result.auditIncomplete);
        expect(db!.prepare('SELECT task_id FROM a9_tasks').all()).toHaveLength(beforeTasks);
      }
      return { result, edits, helperRequest, helper, events: db!.prepare('SELECT event_type FROM a9_events').all() as any[] };
    } finally { db!.close(); spawnSpy?.mockRestore(); }
  }

  it('control writes both start/end records and dispatches twice', async () => {
    const { result, edits, events } = await scenario();
    expect(result.ok).toBe(true);
    expect(edits).toBe(2);
    expect(events.filter((event) => event.event_type === 'tool_start')).toHaveLength(2);
    expect(events.filter((event) => event.event_type === 'tool_end')).toHaveLength(2);
  });

  it.each([['tool_start', 0], ['tool_end', 1], ['turn_completed', 2]])(
    'SQLite %s failure exposes incomplete audit with %i actual edits', async (event, expected) => {
      const { result, edits, events } = await scenario(event as string);
      expect(edits).toBe(expected);
      expect(result.ok).toBe(false);
      expect(result.result.outcome).toBe('failed');
      expect(result.result.auditIncomplete).toEqual({ code: 'A9_AUDIT_PERSISTENCE_FAILED', failedEvent: event });
      expect(result.result.toolCallsExecuted).toBe(expected);
      expect(events.filter((item) => item.event_type === event)).toHaveLength(0);
      expect(JSON.stringify(result)).not.toContain('private injected');
    });

  it('tool_output SQLite rejection traverses the compiled Runner and contains asynchronous cancel EPIPE', async () => {
    const { result, helperRequest, helper, events } = await scenario('tool_output', false, true);
    expect(helperRequest).toMatchObject({ schemaVersion: 3 });
    expect(helper.kill).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.result.auditIncomplete).toEqual({ code: 'A9_AUDIT_PERSISTENCE_FAILED', failedEvent: 'tool_output' });
    expect(events.filter((item) => item.event_type === 'tool_start')).toHaveLength(1);
    expect(events.filter((item) => item.event_type === 'tool_output')).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('unavailable audit storage returns structured failure without recursively throwing', async () => {
    const { result, edits } = await scenario(undefined, true);
    expect(edits).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
