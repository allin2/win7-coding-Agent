import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { atomicWrite, atomicWriteBatch } from '../../src/atomic';

describe('atomic', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-atomic-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // atomicWrite
  // -----------------------------------------------------------------------
  describe('atomicWrite', () => {
    it('writes content to a new file', () => {
      const target = path.join(tmpRoot, 'new.txt');
      atomicWrite(target, Buffer.from('hello'));
      expect(fs.readFileSync(target).toString()).toBe('hello');
    });

    it('overwrites an existing file', () => {
      const target = path.join(tmpRoot, 'existing.txt');
      fs.writeFileSync(target, 'old');
      atomicWrite(target, Buffer.from('new'));
      expect(fs.readFileSync(target).toString()).toBe('new');
    });

    it('leaves no temp files behind on success', () => {
      const target = path.join(tmpRoot, 'clean.txt');
      atomicWrite(target, Buffer.from('data'));
      const files = fs.readdirSync(tmpRoot);
      expect(files).toEqual(['clean.txt']);
    });

    it('cleans up temp file when rename fails', () => {
      // Use a directory as target to force rename to fail.
      const dir = path.join(tmpRoot, 'block');
      fs.mkdirSync(dir);
      expect(() => atomicWrite(dir, Buffer.from('x'))).toThrow();
      // No leftover .tmp-* files.
      const files = fs.readdirSync(tmpRoot);
      expect(files.every((f) => !f.startsWith('.tmp-'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // atomicWriteBatch
  // -----------------------------------------------------------------------
  describe('atomicWriteBatch', () => {
    it('writes multiple files atomically', () => {
      const items = [
        { path: path.join(tmpRoot, 'a.txt'), content: Buffer.from('A') },
        { path: path.join(tmpRoot, 'b.txt'), content: Buffer.from('B') },
        { path: path.join(tmpRoot, 'c.txt'), content: Buffer.from('C') },
      ];
      atomicWriteBatch(items);
      expect(fs.readFileSync(items[0].path).toString()).toBe('A');
      expect(fs.readFileSync(items[1].path).toString()).toBe('B');
      expect(fs.readFileSync(items[2].path).toString()).toBe('C');
    });

    it('leaves no temp files after successful batch', () => {
      const items = [
        { path: path.join(tmpRoot, 'x.txt'), content: Buffer.from('X') },
        { path: path.join(tmpRoot, 'y.txt'), content: Buffer.from('Y') },
      ];
      atomicWriteBatch(items);
      const files = fs.readdirSync(tmpRoot).filter((f) => !f.startsWith('.'));
      expect(files.sort()).toEqual(['x.txt', 'y.txt']);
    });

    it('rolls back on partial failure', () => {
      // First item succeeds, second fails (target is a directory).
      const okPath = path.join(tmpRoot, 'ok.txt');
      const failPath = path.join(tmpRoot, 'block');
      fs.mkdirSync(failPath);

      const items = [
        { path: okPath, content: Buffer.from('ok') },
        { path: failPath, content: Buffer.from('fail') },
      ];

      expect(() => atomicWriteBatch(items)).toThrow();

      // The first file should have been rolled back (deleted).
      expect(fs.existsSync(okPath)).toBe(false);
    });
  });
});
