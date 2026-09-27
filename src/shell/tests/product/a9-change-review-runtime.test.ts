/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;
const { A9WorkspaceService } = require('../../../workspace/dist') as any;

describe('A9-24 runtime change review response', () => {
  let root: string;
  let workspaceRoot: string;
  let runtime: any;
  let service: any;
  let sessionId: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-review-runtime-'));
    workspaceRoot = path.join(root, '中文 空格');
    fs.mkdirSync(workspaceRoot);
    runtime = createA9AgentRuntime({
      workspaceRoot, dataRoot: path.join(root, 'data'),
      openDatabase: (file: string, options?: { readonly?: boolean }) =>
        new Database(file, options?.readonly ? { readonly: true } : {}),
    });
    expect(runtime.status).toBe('ready');
    service = new A9WorkspaceService(workspaceRoot);
    sessionId = runtime.getSnapshot().activeConversationId;
  });
  afterEach(async () => {
    await runtime.shutdown();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function register(turnId: string, second: number) {
    const db = new Database(path.join(root, 'data', 'a9-state.db'));
    db.prepare('INSERT INTO a9_checkpoints (turn_id, session_id, created_at, payload_json) VALUES (?, ?, ?, ?)')
      .run(turnId, sessionId, new Date(1700000000000 + second * 1000).toISOString(), '{}');
    db.close();
  }

  it('preserves the legacy diff array and outcome while adding review and later-turn drift evidence', async () => {
    const file = path.join(workspaceRoot, 'calc.ts');
    fs.writeFileSync(file, 'one', 'utf8');
    await service.read('calc.ts');
    await service.edit('calc.ts', 'one', 'two', { turnId: 'turn-1' });
    register('turn-1', 1);
    const legacyDiff = service.getCheckpointManager().getTurnDiff('turn-1');
    const response = runtime.getDiff('turn-1');
    expect(JSON.stringify(response.diff)).toBe(JSON.stringify(legacyDiff));
    expect(response.review.files).toMatchObject([{ path: 'calc.ts', additions: 1, deletions: 1, undone: false }]);
    await service.read('calc.ts');
    await service.edit('calc.ts', 'two', 'three', { turnId: 'turn-2' });
    register('turn-2', 2);
    const before = fs.readFileSync(file);
    const undone = await runtime.undoFile('turn-1', 'calc.ts');
    expect(undone.outcome).toEqual({ restored: [], errors: [], drifted: expect.arrayContaining([expect.stringContaining('calc.ts')]) });
    expect(undone.driftReasons).toEqual([{ path: 'calc.ts', kind: 'later_turn', laterTurnId: 'turn-2' }]);
    expect(fs.readFileSync(file)).toEqual(before);
  });

  it('classifies a user editor change as external and leaves the file untouched', async () => {
    const file = path.join(workspaceRoot, 'calc.ts');
    fs.writeFileSync(file, 'one', 'utf8');
    await service.read('calc.ts');
    await service.edit('calc.ts', 'one', 'two', { turnId: 'turn-editor' });
    register('turn-editor', 1);
    fs.writeFileSync(file, 'user edit', 'utf8');
    const before = fs.readFileSync(file);
    const undone = await runtime.undoTurn('turn-editor');
    expect(undone.outcome.drifted).toEqual(expect.arrayContaining([expect.stringContaining('calc.ts')]));
    expect(undone.driftReasons).toEqual([{ path: 'calc.ts', kind: 'external' }]);
    expect(fs.readFileSync(file)).toEqual(before);
  });

  it('reports a whole-turn partial undo without overwriting the drifted file', async () => {
    const safe = path.join(workspaceRoot, 'safe.ts');
    const edited = path.join(workspaceRoot, 'edited.ts');
    fs.writeFileSync(safe, 'before-safe', 'utf8');
    fs.writeFileSync(edited, 'before-edited', 'utf8');
    await service.read('safe.ts');
    await service.read('edited.ts');
    await service.edit('safe.ts', 'before-safe', 'after-safe', { turnId: 'turn-partial' });
    await service.edit('edited.ts', 'before-edited', 'after-edited', { turnId: 'turn-partial' });
    register('turn-partial', 1);
    fs.writeFileSync(edited, 'user edit', 'utf8');
    const undone = await runtime.undoTurn('turn-partial');
    expect(undone.outcome.restored).toEqual(expect.arrayContaining([expect.stringContaining('safe.ts')]));
    expect(undone.outcome.drifted).toEqual(expect.arrayContaining([expect.stringContaining('edited.ts')]));
    expect(undone.driftReasons).toEqual([{ path: 'edited.ts', kind: 'external' }]);
    expect(fs.readFileSync(safe, 'utf8')).toBe('before-safe');
    expect(fs.readFileSync(edited, 'utf8')).toBe('user edit');
  });
});
