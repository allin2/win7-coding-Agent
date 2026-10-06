/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { createRequire } from 'module';
import Database from 'better-sqlite3';
import * as Core from '../../../core/src';
import * as State from '../../../state/src/a9-persistence';

describe('A9-30 real Runtime, SQLite and IPC streaming', () => {
  async function scenario(failedEvent?: string, failAll = false) {
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
    let shellCalls = 0;
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
      async collectExternalChanges() { return { changes: [], unrecoverable: [] }; }
      async edit() { edits++; return { replaced: true }; }
    }
    class Runner { getBackgroundManager() { return { getActiveCount: () => 0, list: () => [] }; } }
    class Provider { async sendStreamRequest() { return ++requests === 1
      ? { id: 'tools', content: '', finishReason: 'tool_calls', toolCalls: [1, 2].map((i) => ({ id: `shell-${i}`, name: 'shell', arguments: '{"command":"echo tick"}' })) }
      : { id: 'done', content: 'done', finishReason: 'stop' }; } }
    const rt = box.module.exports.createA9AgentRuntime({ workspaceRoot: '/memory/workspace', dataRoot: '/memory/data', ownerId: 'audit-test',
      modules: { core: { ...Core, canonicalizeWorkspacePath: (p: string) => p, WorkspaceModeSettingsStore: Mode }, state: State,
        workspace: { A9WorkspaceService: Workspace }, gateway: { OpenAICompatibleProvider: Provider },
        runner: { TrustedShellRunner: Runner, createTrustedShellLoopAdapter: () => ({ execute: async (_command: string, opts: any) => {
            shellCalls++;
            await opts.onOutput({ requestId: `req-${shellCalls}`, stream: 'stdout', outputSeq: 1, sourceSeqThrough: 1, text: 'tick before exit\n', rawBytesRead: 17, truncated: false });
            const records = db.prepare("SELECT event_type FROM a9_events WHERE event_type = 'tool_output'").all();
            expect(records).toHaveLength(shellCalls);
            expect(rt.getSnapshot().timeline.some((e: any) => e.type === 'tool_output')).toBe(true);
            return { exitCode: 0, stdout: 'tick before exit\n', stderr: '', durationMs: 1, timedOut: false, outputProtocolVersion: 3 };
          } }),
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
      const { createA9ProductRequestHandler } = req('./a9-product-ipc.js');
      const handler = createA9ProductRequestHandler({ getA9Runtime: () => rt, isValidRendererSender: () => true });
      const page = await handler({}, { schemaVersion: 7, action: 'a9.events.query', payload: { conversationId: rt.getSnapshot().activeConversationId, limit: 100 } });
      return { page, result, edits, shellCalls, timeline: rt.getSnapshot().timeline, events: db!.prepare('SELECT event_type FROM a9_events').all() as any[] };
    } finally { db!.close(); }
  }

  it('publishes output only after actual SQLite insertion and restores it via Schema IPC', async () => {
    const { result, shellCalls, page, timeline } = await scenario();
    expect(result.ok).toBe(true); expect(shellCalls).toBe(2);
    const output = timeline.filter((e: any) => e.type === 'tool_output');
    expect(output).toHaveLength(2);
    expect(output[0].data).toMatchObject({ schemaVersion: 1, toolCallId: 'shell-1', outputSeq: 1 });
    expect(output[0].data.conversationId).toBeDefined(); expect(output[0].data.taskId).toBeDefined();
    expect(page.ok).toBe(true);
    expect(page.events.filter((e: any) => e.eventType === 'tool_output')).toHaveLength(2);
  });
  it('output insertion failure suppresses IPC/UI and stops later Shell dispatch', async () => {
    const { result, shellCalls, timeline, page } = await scenario('tool_output');
    expect(result.ok).toBe(false); expect(shellCalls).toBe(1);
    expect(result.result.auditIncomplete).toEqual({ code: 'A9_AUDIT_PERSISTENCE_FAILED', failedEvent: 'tool_output' });
    expect(timeline.some((e: any) => e.type === 'tool_output')).toBe(false);
    expect(page.events.some((e: any) => e.eventType === 'tool_output')).toBe(false);
  });
});
