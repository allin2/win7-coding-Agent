import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { A9WorkspaceService } from '../../src';

describe('A9-03: A9WorkspaceService', () => {
  let tempDir: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-ws-test-'));
    service = new A9WorkspaceService(tempDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('performs list, read, and search on workspace files', async () => {
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'Hello world\nSecond line\nTarget keyword here\n', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'subdir'));
    fs.writeFileSync(path.join(tempDir, 'subdir', 'file2.js'), 'console.log("target keyword in js");', 'utf8');

    // List
    const listRes = await service.list('', { recursive: true });
    expect(listRes.totalEntries).toBeGreaterThanOrEqual(2);
    expect(listRes.entries.some((e) => e.name === 'file1.txt')).toBe(true);

    // Read
    const readRes = await service.read('file1.txt', { startLine: 1, maxLines: 10 });
    expect(readRes.isText).toBe(true);
    expect(readRes.totalLines).toBe(4);
    expect(readRes.content).toContain('1: Hello world');

    // Search
    const searchRes = await service.search('target keyword');
    expect(searchRes.totalMatches).toBe(2);
    expect(searchRes.matches.some((m) => m.filePath.includes('file1.txt'))).toBe(true);
    expect(searchRes.matches.some((m) => m.filePath.includes('file2.js'))).toBe(true);
  });

  it('performs write and edit with atomic replacement and checkpoints', async () => {
    // Write
    const writeRes = await service.write('test.ts', 'const a = 10;\nconst b = 20;\n', { turnId: 'turn-1' });
    expect(writeRes.created).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'test.ts'), 'utf8')).toBe('const a = 10;\nconst b = 20;\n');

    // Edit
    const editRes = await service.edit('test.ts', 'const a = 10;', 'const a = 100;', { turnId: 'turn-1' });
    expect(editRes.replaced).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'test.ts'), 'utf8')).toBe('const a = 100;\nconst b = 20;\n');

    // Edit error on ambiguous match
    fs.writeFileSync(path.join(tempDir, 'dup.txt'), 'dup\ndup\n');
    await expect(service.edit('dup.txt', 'dup', 'new')).rejects.toThrow(/多处匹配/);

    // Edit error on missing anchor
    await expect(service.edit('test.ts', 'nonexistent', 'new')).rejects.toThrow(/未在/);
  });

  it('performs copy, move, and delete', async () => {
    fs.writeFileSync(path.join(tempDir, 'original.txt'), 'content to copy and move', 'utf8');

    // Copy
    const copyRes = await service.copy('original.txt', 'copied.txt');
    expect(copyRes.copied).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'copied.txt'))).toBe(true);

    // Move
    const moveRes = await service.move('copied.txt', 'moved.txt');
    expect(moveRes.moved).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'copied.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'moved.txt'))).toBe(true);

    // Delete
    const delRes = await service.delete('moved.txt');
    expect(delRes.deleted).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'moved.txt'))).toBe(false);
  });
});
