/**
 * A9-21 M1：密钥轮换触发的全量复核仍逐个校验全部历史清单，但不把它们写入缓存；
 * 否则一次复核就会让整个 checkpoint 历史常驻内存。之后按需加载的行为不变。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { A9WorkspaceService, CheckpointManager } from '../../src';

function cacheSize(manager: CheckpointManager): number {
  return (manager as unknown as { checkpoints: Map<string, unknown> }).checkpoints.size;
}

describe('A9-21 M1: revalidating persisted Turns does not fill the checkpoint cache', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-21-revalidate-'));
    const service = new A9WorkspaceService(workspaceRoot);
    fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'history-marker', 'utf8');
    for (const turnId of ['t-1', 't-2', 't-3']) {
      const baseline = await service.freezeTurnBaseline(turnId);
      fs.appendFileSync(path.join(workspaceRoot, 'note.txt'), `\n${turnId}`, 'utf8');
      await service.collectExternalChanges(turnId, baseline);
    }
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('validates every manifest without caching it, then loads on demand', () => {
    const manager = new CheckpointManager(workspaceRoot);
    expect(manager.listPersistedTurns().sort()).toEqual(['t-1', 't-2', 't-3']);
    manager.revalidatePersistedTurns();
    expect(cacheSize(manager)).toBe(0);
    expect(manager.loadCheckpoint('t-2')?.turnId).toBe('t-2');
    expect(cacheSize(manager)).toBe(1);
  });

  it('still blocks on newly known secret material found in any historical artifact', () => {
    const sensitive = (value: string | Buffer) =>
      (Buffer.isBuffer(value) ? value.toString('utf8') : value).includes('history-marker');
    const manager = new CheckpointManager(workspaceRoot, undefined, sensitive);
    expect(() => manager.revalidatePersistedTurns()).toThrow(/A9_CHECKPOINT_SECRET_BLOCKED/);
    expect(cacheSize(manager)).toBe(0);
  });
});
