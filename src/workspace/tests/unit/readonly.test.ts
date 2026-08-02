import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listDirectory, readText, searchText } from '../../src/readonly';

describe('bounded read-only workspace tools', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-readonly-'));
  });

  describe('listDirectory', () => {
    it('is shallow, deterministic, and reports totals when bounded', () => {
      fs.mkdirSync(path.join(root, 'z-directory'));
      fs.writeFileSync(path.join(root, 'b.txt'), 'b', 'utf8');
      fs.writeFileSync(path.join(root, 'a.txt'), 'a', 'utf8');
      fs.writeFileSync(path.join(root, 'z-directory', 'nested.txt'), 'nested', 'utf8');
      const result = listDirectory({
        workspaceRoot: root,
        maxEntries: 2,
      });
      expect(result).toMatchObject({
        depth: 1,
        totalEntries: 3,
        returnedEntries: 2,
        truncated: true,
        truncationReasons: ['entry_limit'],
      });
      expect(result.entries.map((entry) => entry.name)).toEqual(['a.txt', 'b.txt']);
      expect(result.entries.map((entry) => entry.path)).not.toContain('z-directory/nested.txt');
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('readText', () => {
    it('unifies range/full reads with line numbers and total line metadata', () => {
      fs.writeFileSync(path.join(root, '中文 file.txt'), 'one\r\ntwo\r\nthree\r\nfour\r\n', 'utf8');
      const result = readText({
        workspaceRoot: root,
        path: '中文 file.txt',
        startLine: 2,
        maxLines: 2,
      });

      expect(result).toMatchObject({
        path: '中文 file.txt',
        totalLines: 4,
        startLine: 2,
        endLine: 3,
        truncated: true,
        truncationReasons: ['line_limit'],
      });
      expect(result.content).toBe('2: two\n3: three');
      expect(result.lines).toEqual([
        { line: 2, text: 'two' },
        { line: 3, text: 'three' },
      ]);
    });

    it('returns similar paths and a corrective action for a missing file', () => {
      fs.writeFileSync(path.join(root, 'runtime.ts'), 'export {}', 'utf8');
      expect(() => readText({
        workspaceRoot: root,
        path: 'runtme.ts',
      })).toThrow(/Similar entries: runtime\.ts/);
    });

    it('fails closed for workspace escapes and unknown encodings', () => {
      expect(() => readText({
        workspaceRoot: root,
        path: '../outside.txt',
      })).toThrow(/WORKSPACE_BOUNDARY_VIOLATION/);

      fs.writeFileSync(path.join(root, 'unknown.txt'), Buffer.from([0x80, 0x81]));
      expect(() => readText({
        workspaceRoot: root,
        path: 'unknown.txt',
      })).toThrow(/requires unambiguous UTF-8/);
    });

    it('marks byte truncation explicitly without splitting UTF-8 code points', () => {
      fs.writeFileSync(path.join(root, 'long.txt'), '中'.repeat(300), 'utf8');
      const result = readText({
        workspaceRoot: root,
        path: 'long.txt',
        maxOutputBytes: 256,
      });
      expect(result.truncated).toBe(true);
      expect(result.truncationReasons).toEqual(expect.arrayContaining(['line_bytes', 'output_bytes']));
      expect(result.content).not.toContain('\uFFFD');
      expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThanOrEqual(256);
    });

    it('reads an explicitly declared GBK file and preserves CRLF as line boundaries', () => {
      fs.writeFileSync(path.join(root, '中文 file.gbk'), Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0x0d, 0x0a]), 'binary');
      const result = readText({
        workspaceRoot: root,
        path: '中文 file.gbk',
        encoding: 'gbk',
      });
      expect(result.encoding).toBe('gbk');
      expect(result.totalLines).toBe(1);
      expect(result.content).toBe('1: 你好');
    });

    it('reports the valid line range when startLine exceeds the file', () => {
      fs.writeFileSync(path.join(root, 'short.txt'), 'one\ntwo\n', 'utf8');
      expect(() => readText({
        workspaceRoot: root,
        path: 'short.txt',
        startLine: 3,
      })).toThrow(/exceeds the file's 2 lines.*1\.\.2/);
    });
  });

  describe('searchText', () => {
    it('counts all matches after the return cap and includes context lines', () => {
      fs.mkdirSync(path.join(root, 'src'));
      fs.writeFileSync(
        path.join(root, 'src', 'a.ts'),
        'before-1\nneedle first\nafter-1\nbefore-2\nneedle second\nafter-2\nneedle third\n',
        'utf8',
      );
      const result = searchText({
        workspaceRoot: root,
        path: 'src',
        pattern: 'needle',
        maxMatches: 2,
        contextLines: 1,
      });

      expect(result).toMatchObject({
        totalMatches: 3,
        totalMatchesExact: true,
        returnedMatches: 2,
        truncated: true,
      });
      expect(result.truncationReasons).toContain('matches');
      expect(result.matches[0]).toMatchObject({
        path: 'src/a.ts',
        line: 2,
        before: [{ line: 1, text: 'before-1' }],
        after: [{ line: 3, text: 'after-1' }],
      });
    });

    it('continues counting when output bytes prevent returning more rows', () => {
      fs.writeFileSync(
        path.join(root, 'many.txt'),
        Array.from({ length: 20 }, (_value, index) => `needle ${index} ${'x'.repeat(80)}`).join('\n'),
        'utf8',
      );
      const result = searchText({
        workspaceRoot: root,
        pattern: 'needle',
        maxMatches: 100,
        contextLines: 0,
        maxOutputBytes: 256,
      });
      expect(result.totalMatches).toBe(20);
      expect(result.totalMatchesExact).toBe(true);
      expect(result.returnedMatches).toBeLessThan(20);
      expect(result.truncationReasons).toContain('output_bytes');
    });

    it('reports a lower-bound total when scan budgets or unsupported files intervene', () => {
      fs.writeFileSync(path.join(root, 'a.txt'), 'needle\n', 'utf8');
      fs.writeFileSync(path.join(root, 'b.txt'), 'needle\n', 'utf8');
      fs.writeFileSync(path.join(root, 'binary.bin'), Buffer.from([0x00, 0x80]));
      const fileLimited = searchText({
        workspaceRoot: root,
        pattern: 'needle',
        maxFiles: 1,
      });
      expect(fileLimited.totalMatchesExact).toBe(false);
      expect(fileLimited.truncationReasons).toContain('file_count');

      const binarySkipped = searchText({
        workspaceRoot: root,
        pattern: 'needle',
      });
      expect(binarySkipped.totalMatches).toBe(2);
      expect(binarySkipped.totalMatchesExact).toBe(false);
      expect(binarySkipped.skippedBinary).toBe(1);
      expect(binarySkipped.truncationReasons).toContain('unsupported_encoding');
    });

    it('fails with directory candidates instead of a generic unexpected error', () => {
      fs.mkdirSync(path.join(root, 'source'));
      expect(() => searchText({
        workspaceRoot: root,
        path: 'sorce',
        pattern: 'needle',
      })).toThrow(/Similar entries: source/);
    });

    it('rejects unbounded search patterns with a corrective action', () => {
      expect(() => searchText({
        workspaceRoot: root,
        pattern: 'x'.repeat(4_097),
      })).toThrow(/exceeds 4096 UTF-8 bytes.*shorter literal/);
    });
  });
});
