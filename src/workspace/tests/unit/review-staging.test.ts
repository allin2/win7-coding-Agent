import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ReviewStagingSession,
  createReviewStagingSession,
  sha256,
} from '../../src/review-staging';
import type { ReviewProposal, ReviewStagingOptions, ReviewStagingRestoreOptions } from '../../src/review-staging';
import { WorkspaceError } from '../../src/types';

describe('A8-03 Review staging', () => {
  let workspaceRoot: string;
  let stagingRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-review-workspace-'));
    stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a8-review-staging-'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  });

  function session(overrides: { proposals: readonly ReviewProposal[]; knownSecrets?: readonly string[] }, failureInjector?: ReviewStagingOptions['failureInjector']): ReviewStagingSession {
    const base: ReviewStagingOptions = {
      workspaceRoot,
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      stagingRoot,
      now: () => new Date('2026-08-20T00:00:00.000Z'),
      idFactory: (kind) => `${kind}-fixed`,
      failureInjector,
      proposals: overrides.proposals,
    };
    if (overrides.knownSecrets) base.knownSecrets = overrides.knownSecrets;
    return createReviewStagingSession(base);
  }

  function write(relativePath: string, content: Buffer): string {
    const target = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  }

  it('builds a deterministic CREATE/MODIFY/DELETE ReviewSet without workspace writes', () => {
    write('z.txt', Buffer.from('old\r\n', 'utf8'));
    write('gone.txt', Buffer.from('remove me\n', 'utf8'));
    const before = fs.readdirSync(workspaceRoot).sort();
    const review = session({
      proposals: [{ relativePath: 'new.txt', operation: 'CREATE', afterContent: Buffer.from('new\n') },
        { relativePath: 'z.txt', operation: 'MODIFY', afterContent: Buffer.from('new\r\n') },
        { relativePath: 'gone.txt', operation: 'DELETE' }],
    });
    expect(review.review.status).toBe('READY');
    expect(review.review.files.map((item) => item.relativePath)).toEqual(['gone.txt', 'new.txt', 'z.txt']);
    expect(review.review.files.find((item) => item.relativePath === 'z.txt')).toMatchObject({
      operation: 'MODIFY', beforeEol: 'crlf', afterEol: 'crlf', decision: 'PENDING', writable: true,
    });
    expect(review.review.files.find((item) => item.relativePath === 'gone.txt')).toMatchObject({
      operation: 'DELETE', beforeExists: true, afterExists: false, afterSha256: null,
    });
    expect(fs.readdirSync(workspaceRoot).sort()).toEqual(before);
    expect(review.review.workspaceBaseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(review.review.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(review.review.acceptedSetHash).toBe(sha256([]));
    for (const item of review.review.files) {
      if (item.beforeBlobRef) expect(fs.existsSync(path.join(stagingRoot, 'blobs', item.beforeBlobRef.slice(0, 2), item.beforeBlobRef))).toBe(true);
      if (item.afterBlobRef) expect(fs.existsSync(path.join(stagingRoot, 'blobs', item.afterBlobRef.slice(0, 2), item.afterBlobRef))).toBe(true);
    }
  });

  it('keeps Review hashes and file ordering stable when proposal input order changes', () => {
    write('alpha.ts', Buffer.from('const alpha = 1;\n', 'utf8'));
    write('beta.ts', Buffer.from('const beta = 1;\n', 'utf8'));
    const proposals: ReviewProposal[] = [
      { relativePath: 'beta.ts', operation: 'MODIFY', afterContent: Buffer.from('const beta = 2;\n') },
      { relativePath: 'new.ts', operation: 'CREATE', afterContent: Buffer.from('export const created = true;\n') },
      { relativePath: 'alpha.ts', operation: 'MODIFY', afterContent: Buffer.from('const alpha = 2;\n') },
    ];
    const first = session({ proposals });
    const second = session({ proposals: proposals.slice().reverse() });
    expect(second.review.files.map((item) => item.relativePath)).toEqual(first.review.files.map((item) => item.relativePath));
    expect(second.review.workspaceBaseHash).toBe(first.review.workspaceBaseHash);
    expect(second.review.previewHash).toBe(first.review.previewHash);
    expect(second.review.acceptedSetHash).toBe(first.review.acceptedSetHash);
    expect(second.review.files).toEqual(first.review.files);
  });

  it('normalizes Windows separators and rejects case-folded duplicates and sensitive paths', () => {
    write('src/file.ts', Buffer.from('old\n', 'utf8'));
    expect(() => session({ proposals: [
      { relativePath: 'src\\file.ts', operation: 'MODIFY', afterContent: Buffer.from('one\n') },
      { relativePath: 'SRC/file.ts', operation: 'MODIFY', afterContent: Buffer.from('two\n') },
    ] })).toThrow('Duplicate Windows path');
    try {
      session({ proposals: [{ relativePath: '.git/config', operation: 'CREATE', afterContent: Buffer.from('unsafe\n') }] });
    } catch (error) {
      expect((error as WorkspaceError).code).toBe('WORKSPACE_SENSITIVE_PATH');
    }
  });

  it('supports partial decisions and applies only the accepted subset atomically', () => {
    const first = write('first.txt', Buffer.from('one\n'));
    const second = write('second.txt', Buffer.from('two\n'));
    const deleted = write('delete.txt', Buffer.from('delete me\n'));
    const review = session({ proposals: [
      { relativePath: 'first.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') },
      { relativePath: 'second.txt', operation: 'MODIFY', afterContent: Buffer.from('TWO\n') },
      { relativePath: 'new.txt', operation: 'CREATE', afterContent: Buffer.from('three\n') },
      { relativePath: 'delete.txt', operation: 'DELETE' },
    ] });
    review.decide('first.txt', 'ACCEPTED');
    review.decide('second.txt', 'REJECTED');
    review.decide('new.txt', 'ACCEPTED');
    review.decide('delete.txt', 'ACCEPTED');
    const binding = review.issueApproval('desktop-user');
    const result = review.apply(binding);
    expect(result).toMatchObject({ success: true, status: 'APPLIED', zeroWrites: false, approvalConsumed: true });
    expect(fs.readFileSync(first, 'utf8')).toBe('ONE\n');
    expect(fs.readFileSync(second, 'utf8')).toBe('two\n');
    expect(fs.readFileSync(path.join(workspaceRoot, 'new.txt'), 'utf8')).toBe('three\n');
    expect(fs.existsSync(deleted)).toBe(false);
    expect(fs.existsSync(path.join(stagingRoot, 'blobs'))).toBe(false);
    expect(review.review.files.find((item) => item.relativePath === 'second.txt')?.decision).toBe('REJECTED');
  });

  it('turns any target drift into STALE with zero workspace writes', () => {
    const target = write('drift.txt', Buffer.from('old\n'));
    const review = session({ proposals: [{ relativePath: 'drift.txt', operation: 'MODIFY', afterContent: Buffer.from('new\n') }] });
    review.decide('drift.txt', 'ACCEPTED');
    const binding = review.issueApproval('desktop-user');
    fs.writeFileSync(target, 'changed by user\n');
    const result = review.apply(binding);
    expect(result).toMatchObject({ success: false, status: 'STALE', zeroWrites: true, approvalConsumed: false });
    expect(fs.readFileSync(target, 'utf8')).toBe('changed by user\n');
    expect(review.review.status).toBe('STALE');
  });

  it('rolls back the complete accepted subset on a write failure', () => {
    const first = write('first.txt', Buffer.from('one\n'));
    const second = write('second.txt', Buffer.from('two\n'));
    const review = session({ proposals: [
      { relativePath: 'first.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') },
      { relativePath: 'second.txt', operation: 'MODIFY', afterContent: Buffer.from('TWO\n') },
    ] }, (_phase, item) => {
      if (_phase === 'write' && item?.relativePath === 'second.txt') throw new Error('injected write failure');
    });
    review.decide('first.txt', 'ACCEPTED');
    review.decide('second.txt', 'ACCEPTED');
    const result = review.apply(review.issueApproval('desktop-user'));
    expect(result).toMatchObject({ success: false, status: 'FAILED', rolledBack: true, rollbackStatus: 'completed' });
    expect(fs.readFileSync(first, 'utf8')).toBe('one\n');
    expect(fs.readFileSync(second, 'utf8')).toBe('two\n');
  });

  it('invalidates old validation and approval bindings when a decision changes', () => {
    write('one.txt', Buffer.from('one\n'));
    const review = session({ proposals: [{ relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') }] });
    review.decide('one.txt', 'ACCEPTED');
    const validation = review.recordValidation({ profileId: 'win7-whoami', argv: ['win7-whoami'], status: 'NOT_RUN', complete: true, summary: 'profile unavailable', source: 'desktop-runner', trustedAdapter: false });
    expect(validation.stale).toBe(false);
    expect(validation.previewHash).toBe(review.review.previewHash);
    expect(validation.validatedSetHash).toBe(review.review.acceptedSetHash);
    expect(validation.startedAt).toBe(validation.completedAt);
    const binding = review.issueApproval('desktop-user');
    expect(binding).toMatchObject({ sessionId: 'session-1', taskId: 'task-1' });
    const revision = review.review.revision;
    review.decide('one.txt', 'REJECTED');
    expect(review.review.revision).toBe(revision + 1);
    expect(review.review.validationRuns[0].stale).toBe(true);
    expect(review.review.status).toBe('REJECTED');
    expect(fs.existsSync(path.join(stagingRoot, 'blobs'))).toBe(false);
    expect(() => review.apply(binding)).toThrow('Review is REJECTED');
  });

  it('rejects a stale approval when a changed decision leaves another accepted file', () => {
    write('one.txt', Buffer.from('one\n'));
    write('two.txt', Buffer.from('two\n'));
    const review = session({ proposals: [
      { relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') },
      { relativePath: 'two.txt', operation: 'MODIFY', afterContent: Buffer.from('TWO\n') },
    ] });
    review.decide('one.txt', 'ACCEPTED');
    review.decide('two.txt', 'ACCEPTED');
    const binding = review.issueApproval('desktop-user');
    review.decide('one.txt', 'REJECTED');
    expect(() => review.apply(binding)).toThrow('approval was not found');
    expect(review.review.status).toBe('READY');
  });

  it('binds approval to the exact session and task identity', () => {
    write('one.txt', Buffer.from('one\n'));
    const review = session({ proposals: [{ relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') }] });
    review.decide('one.txt', 'ACCEPTED');
    const approval = review.issueApproval('desktop-user');
    const forged = { ...approval, taskId: 'task-other' };
    expect(() => review.apply(forged)).toThrow('approval binding changed');
    expect(review.review.status).toBe('READY');
    expect(fs.readFileSync(path.join(workspaceRoot, 'one.txt'), 'utf8')).toBe('one\n');
  });

  it('records UTF-16/GBK/mixed-EOL metadata and refuses binary acceptance', () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hello\r\n', 'utf16le')]);
    const gbk = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0x0d, 0x0a]);
    const mixed = Buffer.from('first\r\nsecond\nthird\rfourth', 'utf8');
    write('utf16.txt', utf16);
    write('gbk.txt', gbk);
    write('mixed.txt', mixed);
    write('binary.bin', Buffer.from([0x00, 0x01, 0xff, 0x00]));
    const review = session({ proposals: [
      { relativePath: 'utf16.txt', operation: 'MODIFY', afterContent: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('updated\r\n', 'utf16le')]) },
      { relativePath: 'gbk.txt', operation: 'MODIFY', afterContent: Buffer.from([0xd3, 0xfb, 0xc4, 0xe3, 0x0d, 0x0a]) },
      { relativePath: 'mixed.txt', operation: 'MODIFY', afterContent: Buffer.from('changed\r\nline\nwith\rmixed', 'utf8') },
      { relativePath: 'binary.bin', operation: 'MODIFY', afterContent: Buffer.from([0x00, 0x02, 0xff]) },
    ] });
    expect(review.getFile('utf16.txt')).toMatchObject({ beforeEncoding: 'utf-16le', afterEncoding: 'utf-16le', beforeBom: true });
    expect(review.getFile('gbk.txt')).toMatchObject({ beforeEncoding: 'gbk', afterEncoding: 'gbk', beforeEol: 'crlf' });
    expect(review.getFile('mixed.txt')).toMatchObject({ beforeEol: 'mixed', afterEol: 'mixed' });
    expect(review.getFile('binary.bin')).toMatchObject({ writable: false, beforeEncoding: 'binary', afterEncoding: 'binary' });
    expect(() => review.decide('binary.bin', 'ACCEPTED')).toThrow();
    try { review.decide('binary.bin', 'ACCEPTED'); } catch (error) { expect((error as WorkspaceError).code).toBe('BINARY_WRITE_DENIED'); }
    review.decide('utf16.txt', 'ACCEPTED');
    review.decide('gbk.txt', 'ACCEPTED');
    review.decide('mixed.txt', 'ACCEPTED');
    review.decide('binary.bin', 'REJECTED');
    const result = review.apply(review.issueApproval('desktop-user'));
    expect(result).toMatchObject({ success: true, status: 'APPLIED' });
    expect(fs.readFileSync(path.join(workspaceRoot, 'utf16.txt'))).toEqual(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('updated\r\n', 'utf16le')]));
    expect(fs.readFileSync(path.join(workspaceRoot, 'gbk.txt'))).toEqual(Buffer.from([0xd3, 0xfb, 0xc4, 0xe3, 0x0d, 0x0a]));
    expect(fs.readFileSync(path.join(workspaceRoot, 'mixed.txt'))).toEqual(Buffer.from('changed\r\nline\nwith\rmixed', 'utf8'));
    expect(fs.readFileSync(path.join(workspaceRoot, 'binary.bin'))).toEqual(Buffer.from([0x00, 0x01, 0xff, 0x00]));
  });

  it('blocks known secrets before bytes enter blobs, diffs or evidence', () => {
    write('secret.txt', Buffer.from('token=secret-value\n'));
    expect(() => session({
      knownSecrets: ['secret-value'],
      proposals: [{ relativePath: 'secret.txt', operation: 'MODIFY', afterContent: Buffer.from('token=secret-value-2\n') }],
    })).toThrow();
    try {
      session({
        knownSecrets: ['secret-value'],
        proposals: [{ relativePath: 'secret.txt', operation: 'MODIFY', afterContent: Buffer.from('token=secret-value-2\n') }],
      });
    } catch (error) { expect((error as WorkspaceError).code).toBe('SENSITIVE_DATA_BLOCKED'); }
    expect(fs.existsSync(stagingRoot)).toBe(false);
  });

  it('cleans private blobs and fails closed when validation evidence contains a known secret', () => {
    write('one.txt', Buffer.from('one\n'));
    const review = session({
      knownSecrets: ['secret-value'],
      proposals: [{ relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') }],
    });
    review.decide('one.txt', 'ACCEPTED');
    const approval = review.issueApproval('desktop-user');
    expect(() => review.recordValidation({
      status: 'NOT_RUN', complete: true, summary: 'secret-value leaked', source: 'desktop', trustedAdapter: false,
    })).toThrow('Known sensitive value');
    expect(review.review.status).toBe('FAILED');
    expect(review.isLocked).toBe(false);
    expect(fs.existsSync(path.join(stagingRoot, 'blobs'))).toBe(false);
    expect(() => review.apply(approval)).toThrow('Review is FAILED');
  });

  it('requires a trusted complete adapter for PASS and supports NOT_RUN', () => {
    write('one.txt', Buffer.from('one\n'));
    const review = session({ proposals: [{ relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') }] });
    review.decide('one.txt', 'ACCEPTED');
    expect(() => review.recordValidation({ profileId: 'fake', argv: [], status: 'PASS', complete: true, summary: 'claimed', source: 'model', trustedAdapter: false })).toThrow();
    try { review.recordValidation({ profileId: 'fake', argv: [], status: 'PASS', complete: true, summary: 'claimed', source: 'model', trustedAdapter: false }); } catch (error) { expect((error as WorkspaceError).code).toBe('VALIDATION_INVALID'); }
    const notRun = review.recordValidation({ status: 'NOT_RUN', complete: true, summary: 'no registered profile', source: 'desktop', trustedAdapter: false });
    expect(notRun.status).toBe('NOT_RUN');
    expect(notRun.previewHash).toBe(review.review.previewHash);
    expect(review.review.unverifiedItems).toEqual(['one.txt']);
  });

  it('records FAIL/CANCELLED truthfully and rejects truncated PASS evidence', () => {
    write('one.txt', Buffer.from('one\n'));
    const review = session({ proposals: [{ relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') }] });
    review.decide('one.txt', 'ACCEPTED');
    expect(() => review.recordValidation({
      profileId: 'registered-profile', argv: ['project-test'], status: 'PASS', complete: true,
      outputTruncated: true, summary: 'truncated', source: 'trusted-adapter', trustedAdapter: true,
    })).toThrow('PASS requires');
    const failed = review.recordValidation({
      profileId: 'registered-profile', argv: ['project-test'], status: 'FAIL', complete: true,
      outputTruncated: false, summary: 'project test failed', source: 'trusted-adapter', trustedAdapter: true,
    });
    expect(failed).toMatchObject({ status: 'FAIL', stale: false, applicablePaths: ['one.txt'] });
    expect(review.review.unverifiedItems).toEqual([]);
    const cancelled = review.recordValidation({
      profileId: 'registered-profile', argv: ['project-test'], status: 'CANCELLED', complete: false,
      outputTruncated: false, summary: 'user cancelled', source: 'trusted-adapter', trustedAdapter: true,
    });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', stale: false });
    expect(review.review.unverifiedItems).toEqual(['one.txt']);
  });

  it('marks a non-equivalent validation set stale and revokes prior approval evidence', () => {
    write('one.txt', Buffer.from('one\n'));
    write('two.txt', Buffer.from('two\n'));
    const review = session({ proposals: [
      { relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') },
      { relativePath: 'two.txt', operation: 'MODIFY', afterContent: Buffer.from('TWO\n') },
    ] });
    review.decide('one.txt', 'ACCEPTED');
    review.decide('two.txt', 'ACCEPTED');
    const approval = review.issueApproval('desktop-user');
    const validation = review.recordValidation({
      profileId: 'registered-test-profile', argv: ['test'], status: 'PASS', complete: true,
      summary: 'only one accepted file checked', source: 'trusted-adapter', trustedAdapter: true,
      applicablePaths: ['one.txt'],
    });
    expect(validation.stale).toBe(true);
    expect(validation.validatedSetHash).not.toBe(validation.acceptedSetHash);
    expect(review.review.unverifiedItems).toEqual(['two.txt']);
    expect(() => review.apply(approval)).toThrow('approval was not found');
  });

  it('locks after rollback uncertainty and can restore from the recovery manifest', () => {
    const target = write('one.txt', Buffer.from('one\n'));
    const review = session({ proposals: [{ relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') }] }, (phase) => {
      if (phase === 'verify' || phase === 'rollback') throw new Error(phase === 'verify' ? 'verification unavailable' : 'rollback unavailable');
    });
    review.decide('one.txt', 'ACCEPTED');
    const binding = review.issueApproval('desktop-user');
    // Force verification failure so the rollback path is entered.
    const original = review.blobs.get(review.getFile('one.txt')!.afterBlobRef!);
    review.blobs.put(original);
    const result = review.apply(binding);
    expect(result.status).toBe('RECOVERY_REQUIRED');
    expect(review.isLocked).toBe(true);
    expect(fs.existsSync(path.join(stagingRoot, 'recovery.v1.json'))).toBe(true);
    const restored = review.restoreRecovery();
    expect(restored.restored).toBe(true);
    expect(review.isLocked).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('one\n');
  });

  it('restores a persisted projection and marks target drift STALE before any apply', () => {
    write('one.txt', Buffer.from('one\n'));
    const original = session({ proposals: [{ relativePath: 'one.txt', operation: 'MODIFY', afterContent: Buffer.from('ONE\n') }] });
    original.decide('one.txt', 'ACCEPTED');
    const projection = original.review;
    fs.writeFileSync(path.join(workspaceRoot, 'one.txt'), 'changed outside Review\n', 'utf8');
    const restoreOptions: ReviewStagingRestoreOptions = {
      workspaceRoot, sessionId: 'session-1', taskId: 'task-1', stagingRoot, review: projection,
      now: () => new Date('2026-08-20T00:00:01.000Z'), idFactory: (kind) => `${kind}-restored`,
    };
    const restored = ReviewStagingSession.restore(restoreOptions);
    expect(restored.review.status).toBe('STALE');
    expect(restored.isLocked).toBe(false);
    expect(() => restored.issueApproval('desktop-user')).toThrow('not ready');
    expect(fs.readFileSync(path.join(workspaceRoot, 'one.txt'), 'utf8')).toBe('changed outside Review\n');
  });
});
