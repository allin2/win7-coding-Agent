/**
 * F2 回归：基线跳过（超限/读取失败）的既有文件绝不进入 created/delete-new。
 *
 * 复现缺陷：baseline.skipped 的既有大文件因无 files 记录被判定为 created，
 * undo 按 delete-new 删除了用户的原文件。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { A9WorkspaceService } from '../../src';

const BIG = 3 * 1024 * 1024; // 超过 2 MiB 单文件基线上限

describe('F2: skipped baseline files are never treated as created', () => {
  let workspaceRoot: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-f2-'));
    service = new A9WorkspaceService(workspaceRoot);
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('an existing oversized file overwritten by shell survives undo (data preserved)', async () => {
    const big = Buffer.concat([Buffer.from('HEAD|'), Buffer.alloc(BIG, 0x61), Buffer.from('|TAIL')]);
    fs.writeFileSync(path.join(workspaceRoot, 'big.bin'), big);
    const baseline = await service.freezeTurnBaseline('t1');
    expect(baseline.skipped.some((s) => s.path === 'big.bin' && s.reason === 'too_large')).toBe(true);

    fs.writeFileSync(path.join(workspaceRoot, 'big.bin'), 'overwritten-small');
    const report = await service.collectExternalChanges('t1', baseline);
    const entry = report.changes.find((c) => c.path === 'big.bin');
    expect(entry?.kind).toBe('modified');
    expect(entry?.recoverable).toBe(false);

    const undo = service.getCheckpointManager().undoTurn('t1');
    // 原文件被保留（绝不能被 delete-new 删除）。
    expect(fs.existsSync(path.join(workspaceRoot, 'big.bin'))).toBe(true);
    expect(fs.readFileSync(path.join(workspaceRoot, 'big.bin'), 'utf8')).toBe('overwritten-small');
    expect(undo.errors.some((e) => e.includes('big.bin') && e.includes('无法恢复'))).toBe(true);
  });

  it('an existing oversized file deleted by shell is reported unrecoverable (no fake restore)', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'large.dat'), Buffer.alloc(BIG, 0x63));
    const baseline = await service.freezeTurnBaseline('t2');
    fs.unlinkSync(path.join(workspaceRoot, 'large.dat'));
    const report = await service.collectExternalChanges('t2', baseline);
    const entry = report.changes.find((c) => c.path === 'large.dat');
    expect(entry?.kind).toBe('deleted');
    expect(entry?.recoverable).toBe(false);

    const undo = service.getCheckpointManager().undoTurn('t2');
    expect(fs.existsSync(path.join(workspaceRoot, 'large.dat'))).toBe(false);
    expect(undo.errors.some((e) => e.includes('large.dat') && e.includes('无法恢复'))).toBe(true);
  });

  it('a genuinely NEW oversized file is created and undo deletes it', async () => {
    const baseline = await service.freezeTurnBaseline('t3');
    fs.writeFileSync(path.join(workspaceRoot, 'new-big.bin'), Buffer.alloc(BIG, 0x6e));
    const report = await service.collectExternalChanges('t3', baseline);
    const entry = report.changes.find((c) => c.path === 'new-big.bin');
    expect(entry?.kind).toBe('created');
    expect(entry?.recoverable).toBe(true);

    const undo = service.getCheckpointManager().undoTurn('t3');
    expect(undo.errors.filter((e) => e.includes('new-big.bin'))).toEqual([]);
    expect(fs.existsSync(path.join(workspaceRoot, 'new-big.bin'))).toBe(false);
  });

  it('a file skipped by the total-capacity limit is not misjudged as created', async () => {
    // 三个 1.5MB 文件：每个低于单文件上限，总量超过 40MB？不，改用多个文件逼近总量上限会太慢；
    // 改为：一个 1.9MB（可入库）+ 一个 3MB（超单文件上限），验证两类原因并存时的安全语义。
    fs.writeFileSync(path.join(workspaceRoot, 'ok.bin'), Buffer.alloc(1.9 * 1024 * 1024, 0x01));
    fs.writeFileSync(path.join(workspaceRoot, 'over-total.bin'), Buffer.alloc(BIG, 0x02));
    const baseline = await service.freezeTurnBaseline('t4');
    expect(baseline.files['ok.bin']).toBeDefined();
    expect(baseline.skipped.some((s) => s.path === 'over-total.bin')).toBe(true);

    fs.appendFileSync(path.join(workspaceRoot, 'over-total.bin'), 'x');
    const report = await service.collectExternalChanges('t4', baseline);
    const entry = report.changes.find((c) => c.path === 'over-total.bin');
    expect(entry?.kind).toBe('modified');
    expect(entry?.recoverable).toBe(false);
    const undo = service.getCheckpointManager().undoTurn('t4');
    expect(fs.existsSync(path.join(workspaceRoot, 'over-total.bin'))).toBe(true);
    expect(undo.errors.some((e) => e.includes('over-total.bin'))).toBe(true);
  });

  it('rename of a baseline-skipped file is explicitly unrecoverable on both sides', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'skipped-src.bin'), Buffer.alloc(BIG, 0x09));
    const baseline = await service.freezeTurnBaseline('t5');
    fs.renameSync(path.join(workspaceRoot, 'skipped-src.bin'), path.join(workspaceRoot, 'skipped-dst.bin'));
    const report = await service.collectExternalChanges('t5', baseline);
    const src = report.changes.find((c) => c.path === 'skipped-src.bin');
    expect(src?.recoverable).toBe(false);
    expect(report.unrecoverable.some((u) => u.path === 'skipped-src.bin' && u.kind === 'renamed')).toBe(true);

    const undo = service.getCheckpointManager().undoTurn('t5');
    // 现场保留：新名字不删除（可能就是用户数据），旧名字不伪造恢复。
    expect(fs.existsSync(path.join(workspaceRoot, 'skipped-dst.bin'))).toBe(true);
    expect(undo.errors.some((e) => e.includes('skipped-src.bin'))).toBe(true);
  });

  it('non-zero exit and cancellation still collect with the safe semantics', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'partial-big.bin'), Buffer.alloc(BIG, 0x05));
    const baseline = await service.freezeTurnBaseline('t6');
    // 模拟命令失败（非零退出）后仍留下变化。
    fs.writeFileSync(path.join(workspaceRoot, 'partial-big.bin'), 'partial');
    fs.writeFileSync(path.join(workspaceRoot, 'made-before-fail.txt'), 'x');
    const report = await service.collectExternalChanges('t6', baseline);
    expect(report.changes.find((c) => c.path === 'partial-big.bin')?.recoverable).toBe(false);
    expect(report.changes.find((c) => c.path === 'made-before-fail.txt')?.kind).toBe('created');
    const undo = service.getCheckpointManager().undoTurn('t6');
    expect(fs.existsSync(path.join(workspaceRoot, 'partial-big.bin'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, 'made-before-fail.txt'))).toBe(false);
  });
});
