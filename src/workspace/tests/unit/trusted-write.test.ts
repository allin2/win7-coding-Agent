import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  RecoveryManifestStore,
  TrustedWritePreparer,
  WriteTransactionCoordinator,
} from '../../src/trusted-write';

describe('Desktop Alpha 2 trusted write boundary', () => {
  let root: string;
  let recovery: string;
  let target: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a2-write-'));
    recovery = path.join(root, 'recovery');
    target = path.join(root, 'src', 'hello.ts');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'const value = 1;\r\nconst keep = true;\r\n', 'utf8');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function intent(callId = 'call-1') {
    return {
      workspaceRoot: root,
      path: 'src/hello.ts',
      oldText: 'const value = 1;',
      newText: 'const value = 2;',
      sessionId: 'session-1',
      taskId: 'task-1',
      turnId: 'turn-1',
      callId,
      modelPreviewSha256: '0'.repeat(64),
      modelBaselineSha256: 'f'.repeat(64),
    };
  }

  function prepared() {
    return new TrustedWritePreparer().prepare(intent());
  }

  it('prepares trusted hashes and a complete non-truncated diff without writing', () => {
    const plan = prepared();
    expect(plan.status).toBe('awaiting_approval');
    expect(plan.relativePath).toBe('src/hello.ts');
    expect(plan.baseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.contentSha256).toBe(sha256(plan.afterContent));
    expect(plan.previewSha256).not.toBe('0'.repeat(64));
    expect(plan.preview.truncated).toBe(false);
    expect(plan.preview.unifiedDiff).toContain('-const value = 1;');
    expect(plan.preview.unifiedDiff).toContain('+const value = 2;');
    expect(plan.eol).toBe('crlf');
    expect(fs.readFileSync(target, 'utf8')).toContain('const value = 1;');
  });

  it('rejects boundary escapes, non-UTF-8 files and a second active plan', () => {
    const preparer = new TrustedWritePreparer();
    expect(() => preparer.prepare({ ...intent(), path: '../outside.txt' })).toThrow(/WORKSPACE_BOUNDARY/);
    fs.writeFileSync(target, Buffer.from([0x80, 0x81, 0x82]));
    expect(() => preparer.prepare(intent())).toThrow(/unambiguous UTF-8/);
    fs.writeFileSync(target, 'const value = 1;\r\nconst keep = true;\r\n', 'utf8');
    preparer.prepare(intent());
    expect(() => preparer.prepare({ ...intent(), callId: 'call-2' })).toThrow(/one active A2 write plan/);
  });

  it('requires a second explicit approval and consumes it once at the apply boundary', () => {
    const plan = prepared();
    const coordinator = new WriteTransactionCoordinator(root, recovery);
    const approval = coordinator.issueApproval(plan, {
      planId: plan.planId,
      taskId: plan.taskId,
      turnId: plan.turnId,
      callId: plan.callId,
      planHash: plan.planHash,
      sessionId: plan.sessionId,
      subject: 'workspace.str_replace',
      previewSha256: plan.previewSha256,
      baselineSha256: plan.baseSha256,
    });
    const result = coordinator.apply(plan, approval);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('const value = 2;\r\nconst keep = true;\r\n');
    expect(fs.existsSync(target + '.bak')).toBe(false);
    expect(coordinator.recovery.load()).toBeUndefined();
    expect(() => coordinator.apply(plan, approval)).toThrow(/not pending application/);
  });

  it('returns REPLAN_REQUIRED and leaves the file unchanged after content drift', () => {
    const plan = prepared();
    const coordinator = new WriteTransactionCoordinator(root, recovery);
    const approval = coordinator.issueApproval(plan, {
      planId: plan.planId, taskId: plan.taskId, turnId: plan.turnId, callId: plan.callId,
      planHash: plan.planHash, sessionId: plan.sessionId, subject: 'workspace.str_replace',
      previewSha256: plan.previewSha256, baselineSha256: plan.baseSha256,
    });
    fs.writeFileSync(target, 'const value = 99;\r\nconst keep = true;\r\n', 'utf8');
    const result = coordinator.apply(plan, approval);
    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.operations[0].error).toContain('Base content changed');
    expect(fs.readFileSync(target, 'utf8')).toContain('const value = 99;');
  });

  it('identifies a pending recovery manifest without auto-resuming', () => {
    const store = new RecoveryManifestStore(recovery);
    store.save({
      schemaVersion: '1.0', transactionId: 'txn-1', planId: 'plan-1', workspaceRoot: root,
      targetPath: target, originalSha256: sha256(Buffer.from('old')), targetSha256: sha256(Buffer.from('new')),
      backupPath: target + '.bak', phase: 'rollback_failed', createdAt: new Date().toISOString(),
    });
    expect(store.load()).toMatchObject({ planId: 'plan-1', phase: 'rollback_failed' });
    expect(fs.existsSync(target)).toBe(true);
  });

  it('locks writes after rollback failure and clears the lock only after manual recovery', () => {
    const plan = prepared();
    const coordinator = new WriteTransactionCoordinator(root, recovery, {
      workspace: { writeFile: () => { throw new Error('injected post-replace failure'); } } as any,
      restoreBackup: () => { throw new Error('injected rollback failure'); },
    });
    const approval = coordinator.issueApproval(plan, {
      planId: plan.planId, taskId: plan.taskId, turnId: plan.turnId, callId: plan.callId,
      planHash: plan.planHash, sessionId: plan.sessionId, subject: 'workspace.str_replace',
      previewSha256: plan.previewSha256, baselineSha256: plan.baseSha256,
    });
    const result = coordinator.apply(plan, approval);
    expect(result.success).toBe(false);
    expect(result.rollbackStatus).toBe('failed');
    expect(coordinator.isLocked()).toBe(true);
    expect(coordinator.getPendingRecovery()).toMatchObject({ phase: 'rollback_failed' });
    expect(() => coordinator.issueApproval(plan, {
      planId: plan.planId, taskId: plan.taskId, turnId: plan.turnId, callId: plan.callId,
      planHash: plan.planHash, sessionId: plan.sessionId, subject: 'workspace.str_replace',
      previewSha256: plan.previewSha256, baselineSha256: plan.baseSha256,
    })).toThrow(/locked after a rollback failure/);

    const restored = coordinator.restorePending();
    expect(restored.restored).toBe(true);
    expect(coordinator.isLocked()).toBe(false);
    expect(coordinator.getPendingRecovery()).toBeUndefined();
    expect(fs.readFileSync(target, 'utf8')).toBe('const value = 1;\r\nconst keep = true;\r\n');
    expect(fs.existsSync(target + '.bak')).toBe(false);
  });
});

function sha256(value: Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
