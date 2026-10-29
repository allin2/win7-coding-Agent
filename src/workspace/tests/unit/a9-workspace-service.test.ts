import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { A9WorkspaceService } from '../../src';
import { buildEditFeedback, unavailableEditFeedback } from '../../src/a9-edit-feedback';

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
    // Write (new file)
    const writeRes = await service.write('test.ts', 'const a = 10;\nconst b = 20;\n', { turnId: 'turn-1' });
    expect(writeRes.created).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'test.ts'), 'utf8')).toBe('const a = 10;\nconst b = 20;\n');

    // Edit（写入后基线已刷新，可直接编辑）
    const editRes = await service.edit('test.ts', 'const a = 10;', 'const a = 100;', { turnId: 'turn-1' });
    expect(editRes.replaced).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'test.ts'), 'utf8')).toBe('const a = 100;\nconst b = 20;\n');

    // Edit error on ambiguous match
    fs.writeFileSync(path.join(tempDir, 'dup.txt'), 'dup\ndup\n');
    await service.read('dup.txt');
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

    // Delete（默认 permanent:false 进入恢复区）
    const delRes = await service.delete('moved.txt');
    expect(delRes.deleted).toBe(true);
    expect(delRes.permanent).toBe(false);
    expect(delRes.recoverableVia).toBeDefined();
    expect(fs.existsSync(path.join(tempDir, 'moved.txt'))).toBe(false);
  });
});

describe('A9-42: bounded edit result feedback', () => {
  let tempDir: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-edit-feedback-'));
    service = new A9WorkspaceService(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFixture(name: string, bytes: Buffer | string): string {
    fs.writeFileSync(path.join(tempDir, name), bytes, typeof bytes === 'string' ? 'utf8' : undefined);
    return name;
  }

  it('reports the actual first changed line and exact local context', async () => {
    const name = writeFixture('lines.txt', 'zero\nalpha\nbeta\ngamma\ndelta\nepsilon\n');
    await service.read(name);

    const result = await service.edit(name, 'beta', 'BETA', { turnId: 'feedback-line' });
    expect(result).toMatchObject({
      replaced: true,
      noOp: false,
      feedback: {
        schemaVersion: '1.0',
        available: true,
        changed: true,
        firstChangedLine: 3,
        truncated: false,
        patchApplicable: false,
      },
    });
    expect(result.feedback.unifiedDiff).toBe(
      ' zero\n alpha\n-beta\n+BETA\n gamma\n delta\n',
    );
    expect(fs.readFileSync(path.join(tempDir, name), 'utf8')).toBe(
      'zero\nalpha\nBETA\ngamma\ndelta\nepsilon\n',
    );
  });

  it('reports an insertion at a line boundary without a false deletion line', async () => {
    const name = writeFixture('insert.txt', 'one\ntwo\nthree\n');
    await service.read(name);

    const result = await service.edit(name, 'two\nthree', 'two\ninserted\nthree', { turnId: 'feedback-insert' });
    expect(result.feedback.firstChangedLine).toBe(3);
    expect(result.feedback.unifiedDiff).toBe(
      ' one\n two\n+inserted\n three\n',
    );
    expect(fs.readFileSync(path.join(tempDir, name), 'utf8')).toBe('one\ntwo\ninserted\nthree\n');
  });

  it('uses re-encoded CRLF and BOM bytes for feedback and preserves file semantics', async () => {
    const name = writeFixture('crlf-bom.txt', Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('alpha\r\nbeta\r\ngamma\r\n', 'utf8'),
    ]));
    await service.read(name);

    const result = await service.edit(name, 'beta', 'BETA', { turnId: 'feedback-crlf' });
    const bytes = fs.readFileSync(path.join(tempDir, name));
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(bytes.subarray(3).toString('utf8')).toBe('alpha\r\nBETA\r\ngamma\r\n');
    expect(result.encoding).toBe('utf-8');
    expect(result.eol).toBe('crlf');
    expect(result.feedback.firstChangedLine).toBe(2);
    expect(result.feedback.unifiedDiff).toBe(' alpha\n-beta\n+BETA\n gamma\n');
    expect(result.feedback.afterSha256).toBe(
      require('crypto').createHash('sha256').update(bytes).digest('hex'),
    );
  });

  it('does not duplicate CRLF context before an edited second line', () => {
    const before = 'first\r\nsecond\r\nthird\r\n';
    const after = 'first\r\nSECOND\r\nthird\r\n';
    const result = buildEditFeedback(Buffer.from(before), Buffer.from(after), before, after);
    expect(result.firstChangedLine).toBe(2);
    expect(result.unifiedDiff).toBe(' first\n-second\n+SECOND\n third\n');
  });

  it('preserves UTF-16LE BOM and reports actual decoded feedback', async () => {
    const name = writeFixture('utf16.txt', Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('甲\r\n乙\r\n', 'utf16le'),
    ]));
    await service.read(name);

    const result = await service.edit(name, '乙', '丙', { turnId: 'feedback-utf16' });
    const bytes = fs.readFileSync(path.join(tempDir, name));
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]));
    expect(new TextDecoder('utf-16le').decode(bytes.subarray(2))).toBe('甲\r\n丙\r\n');
    expect(result.feedback).toMatchObject({
      firstChangedLine: 2,
      truncated: false,
    });
    expect(result.feedback.unifiedDiff).toBe(' 甲\n-乙\n+丙\n');
  });

  it('keeps CP936 bytes and feedback as Unicode text', async () => {
    const name = writeFixture('gbk.txt', Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0d, 0x0a]));
    await service.read(name);

    const result = await service.edit(name, '中文', '中文好', { turnId: 'feedback-gbk' });
    expect(fs.readFileSync(path.join(tempDir, name))).toEqual(
      Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xba, 0xc3, 0x0d, 0x0a]),
    );
    expect(result.encoding).toBe('gbk');
    expect(result.feedback.firstChangedLine).toBe(1);
    expect(result.feedback.unifiedDiff).toBe('-中文\n+中文好\n');
  });

  it('reports a byte-identical no-op without claiming a write happened', async () => {
    const name = writeFixture('noop.txt', 'same\n');
    await service.read(name);

    const result = await service.edit(name, 'same', 'same', { turnId: 'feedback-noop' });
    expect(result).toMatchObject({
      replaced: false,
      noOp: true,
      feedback: {
        available: true,
        changed: false,
        firstChangedLine: null,
        truncated: false,
        patchApplicable: false,
      },
    });
    expect(result.feedback.beforeSha256).toBe(result.feedback.afterSha256);
    expect(fs.readFileSync(path.join(tempDir, name), 'utf8')).toBe('same\n');
    expect(service.getCheckpointManager().loadCheckpoint('feedback-noop')?.changes[name]).toBeUndefined();
  });

  it('bounds a huge single-line replacement by output bytes, not whole-file splitting', async () => {
    const prefix = 'a'.repeat(2 * 1024 * 1024);
    const oldText = 'b'.repeat(1024 * 1024);
    const newText = '中'.repeat(1024 * 1024);
    const name = writeFixture('huge.txt', `${prefix}${oldText}tail\n`);
    await service.read(name);

    const result = await service.edit(name, oldText, newText, { turnId: 'feedback-huge' });
    expect(result.replaced).toBe(true);
    expect(result.feedback).toMatchObject({
      available: true,
      changed: true,
      firstChangedLine: 1,
      truncated: true,
      patchApplicable: false,
      maxDiffBytes: 4 * 1024,
    });
    expect(result.feedback.renderedDiffBytes).toBeLessThanOrEqual(4 * 1024);
    expect(result.feedback.unifiedDiff).toContain('not a complete patch');
    expect(Buffer.byteLength(result.feedback.unifiedDiff, 'utf8')).toBe(result.feedback.renderedDiffBytes);
    expect(fs.statSync(path.join(tempDir, name)).size).toBeGreaterThan(4 * 1024);
  });

  it('keeps truncated Unicode preview valid at an emoji byte boundary', () => {
    const before = `x${'a'.repeat(300)}`;
    const after = `x😀${'b'.repeat(300)}`;
    const result = buildEditFeedback(Buffer.from(before), Buffer.from(after), before, after, {
      maxDiffBytes: 512,
    });
    expect(result.truncated).toBe(true);
    expect(result.unifiedDiff).not.toContain('\ufffd');
    expect(result.renderedDiffBytes).toBeLessThanOrEqual(512);
  });

  it('does not write or replace feedback when anchor or baseline checks reject', async () => {
    const duplicate = writeFixture('duplicate.txt', 'dup\ndup\n');
    await service.read(duplicate);
    await expect(service.edit(duplicate, 'dup', 'new', { turnId: 'feedback-reject' })).rejects.toThrow(/多处匹配/);
    expect(fs.readFileSync(path.join(tempDir, duplicate), 'utf8')).toBe('dup\ndup\n');

    const drift = writeFixture('drift.txt', 'version 1\n');
    await service.read(drift);
    fs.writeFileSync(path.join(tempDir, drift), 'version 2 external\n', 'utf8');
    await expect(service.edit(drift, 'version 1', 'version 9', { turnId: 'feedback-drift' }))
      .rejects.toMatchObject({ code: 'BASELINE_DRIFT' });
    expect(fs.readFileSync(path.join(tempDir, drift), 'utf8')).toBe('version 2 external\n');
  });

  it('marks unavailable feedback without changing the successful edit result', async () => {
    const before = Buffer.from('a\n', 'utf8');
    const after = Buffer.from('b\n', 'utf8');
    expect(unavailableEditFeedback(before, after)).toMatchObject({
      schemaVersion: '1.0',
      available: false,
      changed: null,
      firstChangedLine: null,
      truncated: false,
      patchApplicable: false,
      unavailableReason: 'A9_EDIT_FEEDBACK_UNAVAILABLE',
    });
  });

  it('rejects invalid feedback byte budgets instead of silently unbounded output', () => {
    expect(() => buildEditFeedback(Buffer.from('a'), Buffer.from('b'), 'a', 'b', { maxDiffBytes: 128 }))
      .toThrow(/at least 256/);
  });

  it('suppresses sensitive previews before clipping while preserving the actual write', async () => {
    const secret = 'CREDENTIAL-' + 's'.repeat(5000);
    service = new A9WorkspaceService(tempDir, {
      containsSensitiveFeedbackData: (value) => value.toString().includes(secret),
    });
    const name = writeFixture('sensitive.txt', `old ${secret}\n`);
    await service.read(name);
    const result = await service.edit(name, 'old', 'new', { turnId: 'sensitive-edit' });
    expect(result.replaced).toBe(true);
    expect(result.feedback).toMatchObject({ available: false, unifiedDiff: '',
      unavailableReason: 'A9_EDIT_FEEDBACK_SENSITIVE' });
    expect(JSON.stringify(result)).not.toContain('CREDENTIAL-');
    expect(fs.readFileSync(path.join(tempDir, name), 'utf8')).toBe(`new ${secret}\n`);
  });
});
