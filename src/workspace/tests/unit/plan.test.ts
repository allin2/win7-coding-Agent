import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { createPlan, createPlanBatch } from '../../src/plan';

describe('plan', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-plan-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // createPlan
  // -----------------------------------------------------------------------
  describe('createPlan', () => {
    it('creates a plan for a new file (no baseSha256)', () => {
      const target = path.join(tmpRoot, 'new.txt');
      const content = Buffer.from('hello');
      const plan = createPlan(target, content);

      expect(plan.operations).toHaveLength(1);
      expect(plan.operations[0].path).toBe(target);
      expect(plan.operations[0].content.equals(content)).toBe(true);
      expect(plan.operations[0].encoding).toBe('utf-8');
      expect(plan.operations[0].createDirectories).toBe(true);
      expect(plan.operations[0].baseSha256).toBeUndefined();
      expect(plan.version).toBe('0.1.0');
      expect(plan.timestamp).toBeTruthy();
    });

    it('computes baseSha256 for an existing file', () => {
      const target = path.join(tmpRoot, 'existing.txt');
      const original = Buffer.from('original content');
      fs.writeFileSync(target, original);

      const plan = createPlan(target, Buffer.from('new content'));
      const expected = crypto
        .createHash('sha256')
        .update(original)
        .digest('hex');

      expect(plan.operations[0].baseSha256).toBe(expected);
    });

    it('respects custom options', () => {
      const target = path.join(tmpRoot, 'custom.txt');
      const plan = createPlan(target, Buffer.from('x'), {
        encoding: 'gbk',
        createDirectories: false,
      });

      expect(plan.operations[0].encoding).toBe('gbk');
      expect(plan.operations[0].createDirectories).toBe(false);
    });

    it('does NOT create any files (pure)', () => {
      const target = path.join(tmpRoot, 'pure.txt');
      createPlan(target, Buffer.from('data'));
      expect(fs.existsSync(target)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // createPlanBatch
  // -----------------------------------------------------------------------
  describe('createPlanBatch', () => {
    it('creates a plan with multiple operations', () => {
      const items = [
        { path: path.join(tmpRoot, 'a.txt'), content: Buffer.from('A') },
        { path: path.join(tmpRoot, 'b.txt'), content: Buffer.from('B') },
      ];
      const plan = createPlanBatch(items);
      expect(plan.operations).toHaveLength(2);
      expect(plan.operations[0].path).toBe(items[0].path);
      expect(plan.operations[1].path).toBe(items[1].path);
    });

    it('computes baseSha256 only for existing files in batch', () => {
      const existing = path.join(tmpRoot, 'exists.txt');
      fs.writeFileSync(existing, 'data');
      const notExist = path.join(tmpRoot, 'nope.txt');

      const plan = createPlanBatch([
        { path: existing, content: Buffer.from('new') },
        { path: notExist, content: Buffer.from('fresh') },
      ]);

      expect(plan.operations[0].baseSha256).toBeDefined();
      expect(plan.operations[1].baseSha256).toBeUndefined();
    });
  });
});
