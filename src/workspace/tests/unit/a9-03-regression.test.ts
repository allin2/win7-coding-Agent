/**
 * A9-03 回归测试：把审查复现的四个数据损坏问题转为自动化断言。
 *
 * A. GBK 写入：encoding=gbk 时字节必须是 CP936（中文=d6 d0 ce c4），
 *    绝不能写 UTF-8 (e4 b8 ad e6 96 87) 却报告 GBK。
 * B. UTF-16LE：编辑带 FF FE BOM 的文件后必须保留 BOM 和 UTF-16LE。
 * C. 目录删除：permanent:false 删除非空目录后，undo 必须恢复目录及内容。
 * D. 基线漂移：读取后外部进程修改文件，再 edit/write 必须拒绝覆盖。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { A9WorkspaceService } from '../../src';

describe('A9-03 regression: experiment A — GBK byte fidelity', () => {
  let tempDir: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-gbk-'));
    service = new A9WorkspaceService(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes real CP936 bytes for encoding=gbk (中文 = d6 d0 ce c4)', async () => {
    const result = await service.write('cn.txt', '中文', { encoding: 'gbk', turnId: 't1' });
    expect(result.encoding).toBe('gbk');
    const bytes = fs.readFileSync(path.join(tempDir, 'cn.txt'));
    expect([...bytes]).toEqual([0xd6, 0xd0, 0xce, 0xc4]);
    // 绝不能是 UTF-8 的 e4 b8 ad e6 96 87。
    expect([...bytes]).not.toEqual([0xe4, 0xb8, 0xad, 0xe6, 0x96, 0x87]);
  });

  it('reads GBK files back with correct detection', async () => {
    fs.writeFileSync(path.join(tempDir, 'legacy.txt'), Buffer.from([0xd6, 0xd0, 0xce, 0xc4]));
    const readResult = await service.read('legacy.txt');
    expect(readResult.encoding).toBe('gbk');
    expect(readResult.content).toContain('中文');
  });

  it('keeps GBK encoding across edit (no silent UTF-8 rewrite)', async () => {
    fs.writeFileSync(path.join(tempDir, 'legacy2.txt'), Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0a]));
    await service.read('legacy2.txt');
    await service.edit('legacy2.txt', '中文', '中文OK', { turnId: 't2' });
    const bytes = fs.readFileSync(path.join(tempDir, 'legacy2.txt'));
    // “中文” 仍是 CP936 双字节，'O','K' 为 ASCII。
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]));
    expect(bytes.subarray(4, 6).toString('ascii')).toBe('OK');
    expect(bytes[6]).toBe(0x0a);
  });
});

describe('A9-03 regression: experiment B — UTF-16LE BOM preservation', () => {
  let tempDir: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-u16-'));
    service = new A9WorkspaceService(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('preserves FF FE BOM and UTF-16LE after editing', async () => {
    const originalText = 'function hello() {\r\n  return "hi";\r\n}\r\n';
    const bom = Buffer.from([0xff, 0xfe]);
    const body = Buffer.from(originalText, 'utf16le');
    fs.writeFileSync(path.join(tempDir, 'u16.js'), Buffer.concat([bom, body]));

    await service.read('u16.js');
    await service.edit('u16.js', 'return "hi";', 'return "hello";', { turnId: 't3' });

    const after = fs.readFileSync(path.join(tempDir, 'u16.js'));
    expect(after.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]));
    const decoded = new TextDecoder('utf-16le').decode(after.subarray(2));
    expect(decoded).toContain('return "hello";');
    // CRLF 换行与末尾换行保持。
    expect(decoded).toContain('\r\n');
    expect(decoded.endsWith('\r\n')).toBe(true);
  });

  it('preserves UTF-8 BOM files without introducing one on plain UTF-8', async () => {
    fs.writeFileSync(path.join(tempDir, 'u8bom.ts'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('const x = 1;\n', 'utf8')]));
    await service.read('u8bom.ts');
    await service.edit('u8bom.ts', 'const x = 1;', 'const x = 2;', { turnId: 't4' });
    const after = fs.readFileSync(path.join(tempDir, 'u8bom.ts'));
    expect(after.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(after.subarray(3).toString('utf8')).toBe('const x = 2;\n');
  });

  it('preserves CRLF and trailing-newline contract on LF-submitted edits', async () => {
    fs.writeFileSync(path.join(tempDir, 'crlf.txt'), Buffer.from('alpha\r\nbeta\r\n', 'utf8'));
    await service.read('crlf.txt');
    // 模型提交的 newText 通常以 LF 结尾。
    await service.edit('crlf.txt', 'beta', 'gamma', { turnId: 't5' });
    const after = fs.readFileSync(path.join(tempDir, 'crlf.txt'), 'utf8');
    expect(after).toBe('alpha\r\ngamma\r\n');
  });
});

describe('A9-03 regression: experiment C — directory delete and undo', () => {
  let tempDir: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-dir-'));
    service = new A9WorkspaceService(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('undo restores a non-empty directory deleted with permanent:false', async () => {
    const dirAbs = path.join(tempDir, 'assets', 'theme');
    fs.mkdirSync(dirAbs, { recursive: true });
    fs.writeFileSync(path.join(dirAbs, 'main.css'), 'body { color: red; }\n', 'utf8');
    fs.writeFileSync(path.join(dirAbs, '中文 文件.css'), '/* 中文内容 */\n', 'utf8');
    fs.mkdirSync(path.join(dirAbs, 'nested'));
    fs.writeFileSync(path.join(dirAbs, 'nested', 'deep.txt'), 'deep\n', 'utf8');

    const del = await service.delete('assets/theme', { recursive: true, permanent: false, turnId: 't6' });
    expect(del.deleted).toBe(true);
    expect(del.permanent).toBe(false);
    expect(fs.existsSync(dirAbs)).toBe(false);

    // undo 必须恢复目录及全部内容，而不是返回空 errors 却什么都没恢复。
    const undo = service.getCheckpointManager().undoTurn('t6');
    expect(undo.errors).toEqual([]);
    expect(undo.drifted).toEqual([]);
    expect(fs.existsSync(dirAbs)).toBe(true);
    expect(fs.readFileSync(path.join(dirAbs, 'main.css'), 'utf8')).toBe('body { color: red; }\n');
    expect(fs.readFileSync(path.join(dirAbs, '中文 文件.css'), 'utf8')).toBe('/* 中文内容 */\n');
    expect(fs.readFileSync(path.join(dirAbs, 'nested', 'deep.txt'), 'utf8')).toBe('deep\n');
  });

  it('rejects non-recursive delete of a non-empty directory instead of destroying it', async () => {
    const dirAbs = path.join(tempDir, 'keep');
    fs.mkdirSync(dirAbs);
    fs.writeFileSync(path.join(dirAbs, 'a.txt'), 'a', 'utf8');
    await expect(service.delete('keep', { permanent: false, turnId: 't7' })).rejects.toThrow(/非空/);
    expect(fs.existsSync(path.join(dirAbs, 'a.txt'))).toBe(true);
  });

  it('undo restores the ORIGINAL target after copy overwrote it', async () => {
    fs.writeFileSync(path.join(tempDir, 'src.txt'), 'new content from copy', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'target.txt'), 'original target content', 'utf8');
    await service.read('target.txt');
    await service.copy('src.txt', 'target.txt', { overwrite: true, turnId: 't8' });
    expect(fs.readFileSync(path.join(tempDir, 'target.txt'), 'utf8')).toBe('new content from copy');

    const undo = service.getCheckpointManager().undoTurn('t8');
    expect(undo.errors).toEqual([]);
    // 撤销恢复原目标内容，而不是简单删除目标。
    expect(fs.readFileSync(path.join(tempDir, 'target.txt'), 'utf8')).toBe('original target content');
  });
});

describe('A9-03 regression: experiment D — baseline drift rejection', () => {
  let tempDir: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-drift-'));
    service = new A9WorkspaceService(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects edit after an external process modified the file', async () => {
    const filePath = path.join(tempDir, 'config.ts');
    fs.writeFileSync(filePath, 'export const version = 1;\n', 'utf8');
    await service.read('config.ts');

    // 模拟外部进程（如编辑器/构建工具）在读取之后修改文件。
    fs.writeFileSync(filePath, 'export const version = 2; // externally changed\n', 'utf8');

    await expect(service.edit('config.ts', 'version = 1', 'version = 99', { turnId: 't9' }))
      .rejects.toThrow(/外部修改|BASELINE_DRIFT/);
    // 原样保留外部版本，不被覆盖。
    expect(fs.readFileSync(filePath, 'utf8')).toContain('externally changed');
  });

  it('rejects overwrite-style write after external modification', async () => {
    const filePath = path.join(tempDir, 'doc.md');
    fs.writeFileSync(filePath, 'original doc\n', 'utf8');
    await service.read('doc.md');
    fs.writeFileSync(filePath, 'changed externally\n', 'utf8');
    await expect(service.write('doc.md', 'agent rewrite\n', { turnId: 't10' }))
      .rejects.toThrow(/外部修改|BASELINE_DRIFT/);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('changed externally\n');
  });

  it('requires a read before the first overwrite of an existing file', async () => {
    fs.writeFileSync(path.join(tempDir, 'unread.txt'), 'never read\n', 'utf8');
    await expect(service.write('unread.txt', 'agent content\n', { turnId: 't11' }))
      .rejects.toThrow(/尚未读取|READ_REQUIRED/);
  });

  it('allows the edit again after re-reading the drifted file', async () => {
    const filePath = path.join(tempDir, 'again.ts');
    fs.writeFileSync(filePath, 'const value = 1;\n', 'utf8');
    await service.read('again.ts');
    fs.writeFileSync(filePath, 'const value = 2;\n', 'utf8');
    await expect(service.edit('again.ts', 'value = 2', 'value = 3', { turnId: 't12' })).rejects.toThrow(/外部修改/);
    // 重新读取后建立新基线，编辑应成功。
    await service.read('again.ts');
    await service.edit('again.ts', 'value = 2', 'value = 3', { turnId: 't12' });
    expect(fs.readFileSync(filePath, 'utf8')).toBe('const value = 3;\n');
  });
});

describe('A9-03 regression: persistent checkpoints and crash recovery', () => {
  it('recovers a checkpoint from disk after the service instance is recreated', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-crash-'));
    try {
      const first = new A9WorkspaceService(tempDir);
      fs.writeFileSync(path.join(tempDir, 'code.ts'), 'const a = 1;\n', 'utf8');
      await first.read('code.ts');
      await first.edit('code.ts', 'const a = 1;', 'const a = 2;', { turnId: 'turn-crash' });
      expect(fs.readFileSync(path.join(tempDir, 'code.ts'), 'utf8')).toContain('const a = 2;');

      // 模拟崩溃：新实例没有内存 checkpoint。
      const second = new A9WorkspaceService(tempDir);
      const restored = second.getCheckpointManager().loadCheckpoint('turn-crash');
      expect(restored).toBeDefined();
      const undo = second.getCheckpointManager().undoTurn('turn-crash');
      expect(undo.errors).toEqual([]);
      expect(fs.readFileSync(path.join(tempDir, 'code.ts'), 'utf8')).toBe('const a = 1;\n');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('undo reports drift instead of overwriting externally changed files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-undodrift-'));
    try {
      const service = new A9WorkspaceService(tempDir);
      fs.writeFileSync(path.join(tempDir, 'x.txt'), 'v1\n', 'utf8');
      await service.read('x.txt');
      await service.edit('x.txt', 'v1', 'v2', { turnId: 'turn-drift' });
      // 变更后外部又改写了该文件。
      fs.writeFileSync(path.join(tempDir, 'x.txt'), 'external v3\n', 'utf8');
      const undo = service.getCheckpointManager().undoTurn('turn-drift');
      expect(undo.drifted.length).toBe(1);
      expect(fs.readFileSync(path.join(tempDir, 'x.txt'), 'utf8')).toBe('external v3\n');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('A9-03 regression: outside-workspace marking and search bounds', () => {
  it('marks results that resolve outside the workspace root', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-out-'));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-outside-'));
    try {
      fs.writeFileSync(path.join(outsideDir, 'outside.txt'), 'outside content\n', 'utf8');
      const service = new A9WorkspaceService(tempDir);
      const readResult = await service.read(path.join(outsideDir, 'outside.txt'));
      expect(readResult.outsideWorkspace).toBe(true);
      const writeResult = await service.write(path.join(outsideDir, 'written.txt'), 'data\n', { turnId: 't13' });
      expect(writeResult.outsideWorkspace).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('supports cancellation during search', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-cancel-'));
    try {
      for (let i = 0; i < 20; i++) {
        fs.writeFileSync(path.join(tempDir, `f${i}.txt`), `needle in file ${i}\n`, 'utf8');
      }
      const service = new A9WorkspaceService(tempDir);
      const controller = new AbortController();
      controller.abort();
      await expect(service.search('needle', { signal: controller.signal })).rejects.toThrow(/取消/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
