/**
 * A9-19 P03：全树基线冻结与外部变化收集在 Electron 主进程执行，必须分片让出事件循环，
 * 同时结果（文件集合、哈希、跳过项、变化报告）不因让出而改变。
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { A9WorkspaceService } from '../../src';
import { CheckpointManager } from '../../src/checkpoint-manager';

const FILES = 6000;
const FILE_BYTES = 4 * 1024;

function buildTree(root: string): void {
  for (let index = 0; index < FILES; index += 1) {
    const dir = path.join(root, `pkg-${String(index % 60).padStart(2, '0')}`, `mod-${index % 7}`);
    fs.mkdirSync(dir, { recursive: true });
    const body = Buffer.alloc(FILE_BYTES, 97 + (index % 26));
    body.write(`file-${index}`, 0, 'utf8');
    fs.writeFileSync(path.join(dir, `f-${index}.ts`), body);
  }
}

/** Measures the longest gap between 5ms timer ticks while `work` runs. */
async function maxEventLoopGap<T>(work: () => Promise<T>): Promise<{ result: T; maxGapMs: number }> {
  let last = Date.now();
  let maxGapMs = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    maxGapMs = Math.max(maxGapMs, now - last);
    last = now;
  }, 5);
  try {
    const result = await work();
    const now = Date.now();
    maxGapMs = Math.max(maxGapMs, now - last);
    return { result, maxGapMs };
  } finally {
    clearInterval(timer);
  }
}

describe('A9-19 P03: baseline scans yield the event loop without changing results', () => {
  let workspaceRoot: string;

  beforeAll(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-19-yield-'));
    buildTree(workspaceRoot);
  });

  afterAll(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('keeps event-loop stalls bounded while scanning a 6000-file tree', async () => {
    // 只测本任务改动的扫描阶段：持久化后的整份 checkpoint 往返校验在 checkpoint-manager 中一次性同步执行，
    // 不在 A9-19 白名单内，单独度量并登记为残留（见下一个用例与任务书 §11）。
    const persist = jest.spyOn(CheckpointManager.prototype, 'persistExternalBaseline').mockImplementation(() => undefined);
    try {
      const scanOnly = new A9WorkspaceService(workspaceRoot);
      const freezeScan = await maxEventLoopGap(() => scanOnly.freezeTurnBaseline('scan-only-turn'));
      expect(freezeScan.maxGapMs).toBeLessThan(150);
    } finally {
      persist.mockRestore();
    }

    const service = new A9WorkspaceService(workspaceRoot);
    const baseline = await service.freezeTurnBaseline('yield-turn');
    fs.writeFileSync(path.join(workspaceRoot, 'pkg-00', 'mod-0', 'f-0.ts'), 'changed by shell');
    fs.writeFileSync(path.join(workspaceRoot, 'pkg-01', 'created.ts'), 'created by shell');
    const collect = await maxEventLoopGap(() => service.collectExternalChanges('yield-turn', baseline));
    expect(collect.maxGapMs).toBeLessThan(150);

    const hashed = Object.keys(baseline.files);
    expect(hashed.length).toBe(2000); // MAX_BASELINE_FILES
    expect(baseline.skipped.filter((item) => item.reason === 'too_large')).toHaveLength(FILES - 2000);
    for (const rel of hashed.slice(0, 50)) {
      const expected = crypto.createHash('sha256').update(fs.readFileSync(path.join(workspaceRoot, rel))).digest('hex');
      expect(baseline.files[rel].sha256).toBe(expected);
    }
    const changedPaths = collect.result.changes.map((change) => `${change.kind}:${change.path}`).sort();
    expect(changedPaths).toContain('created:pkg-01/created.ts');
    expect(collect.result.changes.some((change) => change.path === 'pkg-00/mod-0/f-0.ts')).toBe(true);
  }, 120_000);

  it('records the residual one-time checkpoint validation stall after freezing', async () => {
    const service = new A9WorkspaceService(workspaceRoot);
    const freeze = await maxEventLoopGap(() => service.freezeTurnBaseline('residual-turn'));
    // 残留：persistExternalBaseline → loadCheckpoint 往返校验整份 blob（本机 2000 文件约 0.4s），每轮一次。
    // 此处只防止回退到“整段扫描独占”的量级，不宣称已满足 50ms。
    console.log(`A9-19 P03 residual freeze gap (dev machine): ${freeze.maxGapMs}ms`);
    expect(freeze.maxGapMs).toBeLessThan(2000);
  }, 120_000);

  it('stays responsive to cancellation during a scan', async () => {
    const service = new A9WorkspaceService(workspaceRoot);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    await expect(service.freezeTurnBaseline('cancel-turn', { signal: controller.signal })).rejects.toThrow('基线冻结已被取消');
    expect(Date.now() - started).toBeLessThan(1000);
  }, 60_000);
});
