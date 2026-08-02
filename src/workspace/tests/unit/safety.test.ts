import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { validatePath, isJunction } from '../../src/safety';

describe('safety', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-safety-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // validatePath
  // -----------------------------------------------------------------------
  describe('validatePath', () => {
    it('accepts a normal path inside workspace', () => {
      const result = validatePath('sub/file.txt', tmpRoot);
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toMatch(/sub[/\\]file\.txt$/);
    });

    it('rejects path that escapes via ../', () => {
      const result = validatePath('../../etc/passwd', tmpRoot);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('WORKSPACE_BOUNDARY_VIOLATION');
    });

    it('rejects absolute path outside workspace', () => {
      const result = validatePath('/etc/passwd', tmpRoot);
      expect(result.valid).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('accepts a direct child file path', () => {
      const filePath = path.join(tmpRoot, 'file.txt');
      fs.writeFileSync(filePath, 'test');
      const result = validatePath('file.txt', tmpRoot);
      expect(result.valid).toBe(true);
    });

    it('handles Chinese characters in path', () => {
      const result = validatePath('中文目录/文件.txt', tmpRoot);
      expect(result.valid).toBe(true);
    });

    it('handles spaces in path', () => {
      const result = validatePath('my folder/my file.txt', tmpRoot);
      expect(result.valid).toBe(true);
    });

    it.each(['.env', '.env.production', '.git/config'])('rejects sensitive workspace path %s at the enforcement layer', (target) => {
      const result = validatePath(target, tmpRoot);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('WORKSPACE_SENSITIVE_PATH');
    });

    it('rejects a symlink whose resolved target is a sensitive file', () => {
      const sensitive = path.join(tmpRoot, '.env');
      const link = path.join(tmpRoot, 'public-config');
      fs.writeFileSync(sensitive, 'TOKEN=value');
      try {
        fs.symlinkSync(sensitive, link);
      } catch {
        return;
      }
      const result = validatePath('public-config', tmpRoot);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('WORKSPACE_SENSITIVE_PATH');
    });

    it('detects symlink escape', () => {
      // Create a symlink pointing outside the workspace.
      const target = path.join(os.tmpdir(), 'outside-target.txt');
      fs.writeFileSync(target, 'outside');
      const link = path.join(tmpRoot, 'escape-link');
      try {
        fs.symlinkSync(target, link);
      } catch {
        // Skip on platforms that don't support symlinks.
        return;
      }

      const result = validatePath('escape-link', tmpRoot);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('WORKSPACE_BOUNDARY_VIOLATION');

      fs.unlinkSync(target);
    });

    it('detects a missing target beneath an escaping symlink ancestor', () => {
      const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-dir-'));
      const link = path.join(tmpRoot, 'escape-dir');
      try {
        fs.symlinkSync(outsideRoot, link, 'dir');
      } catch {
        fs.rmSync(outsideRoot, { recursive: true, force: true });
        return;
      }

      const result = validatePath('escape-dir/not-created.txt', tmpRoot);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('WORKSPACE_BOUNDARY_VIOLATION');
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    });
  });

  // -----------------------------------------------------------------------
  // isJunction / symbolic reparse detection
  // -----------------------------------------------------------------------
  describe('isJunction', () => {
    it('returns false for a missing path', () => {
      expect(isJunction('/any/path')).toBe(false);
    });

    it('returns true for a symbolic link or Windows junction', () => {
      const target = path.join(tmpRoot, 'target');
      const link = path.join(tmpRoot, 'link');
      fs.mkdirSync(target);
      try {
        fs.symlinkSync(target, link, 'dir');
      } catch {
        return;
      }
      expect(isJunction(link)).toBe(true);
    });
  });
});
