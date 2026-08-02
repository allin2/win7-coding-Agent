import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { ApplyPlanOptions, applyPlan } from '../../src/apply';
import { WritePlan } from '../../src/types';
import { createPlan } from '../../src/plan';

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

  function approvedOptions(
    overrides: Partial<ApplyPlanOptions> = {},
  ): ApplyPlanOptions {
    return {
      workspaceRoot: tmpRoot,
      approval: {
        approvalId: 'approval-1',
        sessionId: 'session-1',
        subject: 'workspace.apply',
        previewSha256: 'a'.repeat(64),
        baselineSha256: 'b'.repeat(64),
      },
      approvalLedger: {
        validateAndConsume: () => ({ valid: true }),
      },
      ...overrides,
    };
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

      const result = applyPlan(plan, approvedOptions());
      expect(result.success).toBe(true);
      expect(result.rolledBack).toBe(false);
      expect(result.rollbackStatus).toBe('not_required');
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

      const result = applyPlan(plan, approvedOptions());
      expect(result.success).toBe(true);
      expect(fs.readFileSync(target).toString()).toBe('new');
      // No leftover .bak file.
      expect(fs.existsSync(target + '.bak')).toBe(false);
    });

    it('returns the pre-approved content preview with a successful operation', () => {
      const target = path.join(tmpRoot, 'preview.txt');
      fs.writeFileSync(target, 'before\n');
      const plan = createPlan(target, Buffer.from('after\n'));
      const result = applyPlan(plan, approvedOptions());

      expect(result.success).toBe(true);
      expect(result.operations[0].preview?.unifiedDiff).toContain('-before');
      expect(result.operations[0].preview?.unifiedDiff).toContain('+after');
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

      const result = applyPlan(plan, approvedOptions());
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

      const result = applyPlan(plan, approvedOptions());
      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(result.rollbackStatus).toBe('completed');
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

      const result = applyPlan(plan, approvedOptions());
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

      const result = applyPlan(plan, approvedOptions());
      expect(result.success).toBe(false);
      expect(fs.existsSync(newTarget)).toBe(false);
    });
  });

  describe('workspace boundary', () => {
    it('rejects a lexical escape before creating files', () => {
      const outside = path.join(tmpRoot, '..', 'outside.txt');
      const plan: WritePlan = {
        operations: [{
          path: outside,
          content: Buffer.from('escape'),
          encoding: 'utf-8',
          createDirectories: true,
        }],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      const result = applyPlan(plan, approvedOptions());

      expect(result.success).toBe(false);
      expect(result.operations[0].error).toContain('WORKSPACE_BOUNDARY_VIOLATION');
      expect(fs.existsSync(outside)).toBe(false);
    });

    it('rejects a missing target beneath an escaping symlink ancestor', () => {
      const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-outside-'));
      const link = path.join(tmpRoot, 'linked');
      try {
        fs.symlinkSync(outsideRoot, link, 'dir');
      } catch {
        fs.rmSync(outsideRoot, { recursive: true, force: true });
        return;
      }
      const escapedTarget = path.join(link, 'new.txt');
      const plan: WritePlan = {
        operations: [{
          path: escapedTarget,
          content: Buffer.from('escape'),
          encoding: 'utf-8',
          createDirectories: true,
        }],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      const result = applyPlan(plan, approvedOptions());

      expect(result.success).toBe(false);
      expect(result.operations[0].error).toContain('WORKSPACE_BOUNDARY_VIOLATION');
      expect(fs.existsSync(path.join(outsideRoot, 'new.txt'))).toBe(false);
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    });

    it('requires an existing explicit workspace root', () => {
      const plan: WritePlan = {
        operations: [],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      expect(() => applyPlan(plan, approvedOptions({
        workspaceRoot: path.join(tmpRoot, 'missing'),
      }))).toThrow('Workspace root is not an existing directory');
    });
  });

  describe('rollback reporting', () => {
    it('reports rollback failure instead of claiming recovery', () => {
      const target = path.join(tmpRoot, 'existing.txt');
      const blocker = path.join(tmpRoot, 'block');
      fs.writeFileSync(target, 'original');
      fs.mkdirSync(blocker);
      const plan: WritePlan = {
        operations: [
          {
            path: target,
            content: Buffer.from('updated'),
            encoding: 'utf-8',
            createDirectories: true,
          },
          {
            path: blocker,
            content: Buffer.from('fail'),
            encoding: 'utf-8',
            createDirectories: true,
          },
        ],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      const result = applyPlan(plan, approvedOptions({
        restoreBackup() {
          throw new Error('restore denied');
        },
      }));

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(false);
      expect(result.rollbackStatus).toBe('failed');
      expect(result.rollbackErrors.join(' ')).toContain('restore denied');
    });
  });

  describe('approval binding', () => {
    it('rejects apply when approval is missing', () => {
      const plan: WritePlan = {
        operations: [],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };
      expect(() => applyPlan(plan, {
        workspaceRoot: tmpRoot,
      } as ApplyPlanOptions)).toThrow('exact, one-time approval binding');
    });

    it('passes the exact plan fingerprint input to approval revalidation', () => {
      const target = path.join(tmpRoot, 'approved.txt');
      const plan: WritePlan = {
        operations: [{
          path: target,
          content: Buffer.from('approved'),
          encoding: 'utf-8',
          createDirectories: true,
        }],
        timestamp: '2026-07-30T00:00:00.000Z',
        version: '0.1.0',
      };
      let approvalRequest: unknown;
      const result = applyPlan(plan, approvedOptions({
        approvalLedger: {
          validateAndConsume(_binding, request) {
            approvalRequest = request;
            return { valid: true };
          },
        },
      }));

      expect(result.success).toBe(true);
      expect(approvalRequest).toMatchObject({
        workspaceRoot: path.resolve(tmpRoot),
        plan: {
          version: '0.1.0',
          operations: [{
            path: path.resolve(target),
            contentSha256: sha256(Buffer.from('approved')),
          }],
        },
      });
    });

    it('performs no I/O when approval revalidation fails', () => {
      const target = path.join(tmpRoot, 'denied.txt');
      const plan: WritePlan = {
        operations: [{
          path: target,
          content: Buffer.from('denied'),
          encoding: 'utf-8',
          createDirectories: true,
        }],
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      };

      expect(() => applyPlan(plan, approvedOptions({
        approvalLedger: {
          validateAndConsume: () => ({
            valid: false,
            reason: 'plan changed after approval',
          }),
        },
      }))).toThrow('plan changed after approval');
      expect(fs.existsSync(target)).toBe(false);
    });
  });
});
