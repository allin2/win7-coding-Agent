/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;
const { createA9ProductRequestHandler, A9_IPC_SCHEMA_VERSION } = require('../../product/a9-product-ipc') as any;

describe('A9-21 M3 runtime and real checkpoint IPC', () => {
  let root: string;
  let runtime: any;
  let conversationId: string;
  let handler: any;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-m3-ipc-'));
    const workspaceRoot = path.join(root, '中文 空格');
    fs.mkdirSync(workspaceRoot);
    runtime = createA9AgentRuntime({
      workspaceRoot, dataRoot: path.join(root, 'data'),
      openDatabase: (file: string, options?: { readonly?: boolean }) => new Database(file, options?.readonly ? { readonly: true } : {}),
    });
    expect(runtime.status).toBe('ready');
    conversationId = runtime.getSnapshot().activeConversationId;
    handler = createA9ProductRequestHandler({ getA9Runtime: () => runtime, isValidRendererSender: () => true });
    const db = new Database(path.join(root, 'data', 'a9-state.db'));
    const insert = db.prepare('INSERT INTO a9_checkpoints (turn_id, session_id, created_at, payload_json) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < 65; i += 1) {
      insert.run(`turn-${String(i).padStart(3, '0')}`, conversationId, new Date(1700000000000 + i).toISOString(), '{}');
    }
    db.close();
  });
  afterEach(async () => {
    await runtime.shutdown();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function request(payload: any) {
    return handler({}, { schemaVersion: A9_IPC_SCHEMA_VERSION, action: 'a9.checkpoint.list', payload });
  }

  it('keeps the snapshot at 50 while total is 65 and the legacy call returns all rows', async () => {
    const snapshot = runtime.getSnapshot();
    expect(snapshot.checkpoints).toHaveLength(50);
    expect(snapshot.checkpointsTotal).toBe(65);
    expect(snapshot.checkpoints[0].turnId).toBe('turn-015');
    const legacy = await request({});
    expect(legacy).toMatchObject({ ok: true, conversationId, total: 65, hasMore: false, nextBefore: null });
    expect(legacy.checkpoints).toHaveLength(65);
    expect(legacy.checkpoints[0].turnId).toBe('turn-000');
  });

  it('passes nextBefore through the real IPC and gets the adjacent, disjoint second page (R12)', async () => {
    const first = await request({ conversationId, limit: 20 });
    expect(first).toMatchObject({ ok: true, total: 65, hasMore: true });
    expect(first.checkpoints[0].turnId).toBe('turn-045');
    expect(first.nextBefore).toEqual({ createdAt: first.checkpoints[0].createdAt, turnId: 'turn-045' });
    const second = await request({ conversationId, before: first.nextBefore, limit: 20 });
    expect(second.checkpoints.map((row: any) => row.turnId)).toEqual(
      Array.from({ length: 20 }, (_, index) => `turn-${String(index + 25).padStart(3, '0')}`));
    expect(new Set(first.checkpoints.map((row: any) => row.turnId).filter((id: string) =>
      second.checkpoints.some((row: any) => row.turnId === id))).size).toBe(0);
  });

  it('rejects malformed cursors, limits, top-level fields and a foreign conversation', async () => {
    const valid = { createdAt: '2026-09-26T00:00:00.000Z', turnId: 'turn-001' };
    const invalid = [
      { before: { createdAt: valid.createdAt } },
      { before: { turnId: valid.turnId } },
      { before: { ...valid, extra: true } },
      { before: { ...valid, createdAt: '' } },
      { before: { ...valid, turnId: '' } },
      { before: { ...valid, createdAt: 1 } },
      { before: { ...valid, turnId: 1 } },
      { before: 'wrong' },
      { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: '20' },
      { conversationId: '' }, { conversationId: 2 },
      { unknown: true },
      null,
    ];
    for (const payload of invalid) {
      const result = await request(payload);
      expect(result.error?.code).toBe('A9_PAYLOAD_INVALID');
    }
    expect((await request({ conversationId: 'foreign', limit: 20 })).error.code)
      .toBe('A9_CHECKPOINT_CONVERSATION_MISMATCH');
  });
});

describe('A9-21 M3 restricted runtimes', () => {
  it('exposes structured checkpoint-list errors in both SQLite-unavailable and diagnostics modes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-m3-restricted-'));
    const workspaceRoot = path.join(root, 'ws');
    fs.mkdirSync(workspaceRoot);
    const unavailable = createA9AgentRuntime({ workspaceRoot, dataRoot: path.join(root, 'unavailable'), electronSqliteRoot: path.join(root, 'missing-sqlite') });
    expect(unavailable.listCheckpoints()).toEqual({ ok: false, error: { code: 'ELECTRON_SQLITE_UNAVAILABLE' } });
    const dataRoot = path.join(root, 'diagnostics');
    fs.mkdirSync(dataRoot);
    fs.writeFileSync(path.join(dataRoot, 'a9-state.db'), 'invalid SQLite bytes', 'utf8');
    const diagnostics = createA9AgentRuntime({
      workspaceRoot, dataRoot,
      openDatabase: (file: string, options?: { readonly?: boolean }) => new Database(file, options?.readonly ? { readonly: true } : {}),
    });
    try {
      expect(diagnostics.status).not.toBe('ready');
      expect(diagnostics.listCheckpoints()).toEqual({ ok: false, error: { code: 'A9_DIAGNOSTICS_MODE' } });
    } finally {
      await unavailable.shutdown();
      await diagnostics.shutdown();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
