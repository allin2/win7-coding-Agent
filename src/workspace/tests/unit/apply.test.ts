import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { applyPlan } from '../../src/apply';
import { WritePlan } from '../../src/types';

describe('apply', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-apply-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function sha256(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  // -----------------------------------------------------------------------
  // Successful apply
  // -----------------------------------------------------------------------
  describe('successful apply', () => {
    it('writes a new file', () => {
      const target = path.join(tmpRoot, 'new.txt');
      const plan: WritePlan = {
        operations: [
          {
            path: target,
            content: Buffer.from('hello'),
            encoding: 'utf-8',
            createDirectories: true,
          },
        ],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      const result = applyPlan(plan);
      expect(result.success).toBe(true);
      expect(result.rolledBack).toBe(false);
      expect(fs.readFileSync(target).toString()).toBe('hello');
    });

    it('overwrites an existing file and cleans up backup', () => {
      const target = path.join(tmpRoot, 'existing.txt');
      fs.writeFileSync(target, 'old');

      const plan: WritePlan = {
        operations: [
          {
            path: target,
            content: Buffer.from('new'),
            encoding: 'utf-8',
            createDirectories: true,
            baseSha256: sha256(Buffer.from('old')),
          },
        ],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      const result = applyPlan(plan);
      expect(result.success).toBe(true);
      expect(fs.readFileSync(target).toString()).toBe('new');
      // No leftover .bak file.
      expect(fs.existsSync(target + '.bak')).toBe(false);
    });

    it('creates intermediate directories', () => {
      const target = path.join(tmpRoot, 'deep', 'nested', 'file.txt');
      const plan: WritePlan = {
        operations: [
          {
            path: target,
            content: Buffer.from('deep'),
            encoding: 'utf-8',
            createDirectories: true,
          },
        ],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      const result = applyPlan(plan);
      expect(result.success).toBe(true);
      expect(fs.readFileSync(target).toString()).toBe('deep');
    });
  });

  // -----------------------------------------------------------------------
  // REPLAN_REQUIRED
  // -----------------------------------------------------------------------
  describe('REPLAN_REQUIRED', () => {
    it('fails when baseSha256 does not match', () => {
      const target = path.join(tmpRoot, 'changed.txt');
      fs.writeFileSync(target, 'original');

      const plan: WritePlan = {
        operations: [
          {
            path: target,
            content: Buffer.from('update'),
            encoding: 'utf-8',
            createDirectories: true,
            baseSha256: 'deadbeef', // wrong hash
          },
        ],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      const result = applyPlan(plan);
      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      // Original content preserved.
      expect(fs.readFileSync(target).toString()).toBe('original');
    });
  });

  // -----------------------------------------------------------------------
  // Rollback on write failure
  // -----------------------------------------------------------------------
  describe('rollback', () => {
    it('restores original content on write failure', () => {
      const goodTarget = path.join(tmpRoot, 'good.txt');
      const badTarget = path.join(tmpRoot, 'block'); // is a directory
      fs.mkdirSync(badTarget);
      fs.writeFileSync(goodTarget, 'original-good');

      const plan: WritePlan = {
        operations: [
          {
            path: goodTarget,
            content: Buffer.from('updated'),
            encoding: 'utf-8',
            createDirectories: true,
          },
          {
            path: badTarget,
            content: Buffer.from('fail'),
            encoding: 'utf-8',
            createDirectories: true,
          },
        ],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      const result = applyPlan(plan);
      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      // Original content restored.
      expect(fs.readFileSync(goodTarget).toString()).toBe('original-good');
    });

    it('removes newly-created files on rollback', () => {
      const newTarget = path.join(tmpRoot, 'brand-new.txt');
      const badTarget = path.join(tmpRoot, 'block');
      fs.mkdirSync(badTarget);

      const plan: WritePlan = {
        operations: [
          {
            path: newTarget,
            content: Buffer.from('fresh'),
            encoding: 'utf-8',
            createDirectories: true,
          },
          {
            path: badTarget,
            content: Buffer.from('fail'),
            encoding: 'utf-8',
            createDirectories: true,
          },
        ],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      const result = applyPlan(plan);
      expect(result.success).toBe(false);
      expect(fs.existsSync(newTarget)).toBe(false);
    });
  });
});
