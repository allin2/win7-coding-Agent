import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createTextReplacePlan } from '../../src/replace';

describe('createTextReplacePlan', () => {
  let root: string;
  let target: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-replace-'));
    target = path.join(root, '中文 file.ts');
    fs.writeFileSync(target, 'const first = 1;\r\nconst target = 2;\r\nconst last = 3;\r\n', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('creates a base-bound WritePlan and content-level preview without writing', () => {
    const result = createTextReplacePlan(
      target,
      'const target = 2;',
      'const target = 42;',
    );

    expect(result.matchLine).toBe(2);
    expect(result.plan.operations[0].baseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.plan.operations[0].content.toString('utf8')).toContain('target = 42');
    expect(result.preview).toMatchObject({
      encoding: 'utf-8',
      startLine: 2,
      removedLineCount: 1,
      addedLineCount: 1,
      truncated: false,
    });
    expect(result.preview.unifiedDiff).toContain('-const target = 2;');
    expect(result.preview.unifiedDiff).toContain('+const target = 42;');
    expect(fs.readFileSync(target, 'utf8')).toContain('target = 2;');
  });

  it('preserves a UTF-8 BOM and untouched CRLF content', () => {
    fs.writeFileSync(target, Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('a\r\nanchor\r\nz\r\n', 'utf8'),
    ]));

    const result = createTextReplacePlan(target, 'anchor', 'updated');
    const content = result.plan.operations[0].content;
    expect(content.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(content.subarray(3).toString('utf8')).toBe('a\r\nupdated\r\nz\r\n');
  });

  it('reports a closest line and a recovery action when the anchor is absent', () => {
    expect(() => createTextReplacePlan(
      target,
      'const targte = 2;',
      'const target = 42;',
    )).toThrow(/Closest text starts at line 2.*Re-read that range/);
  });

  it('reports match count and lines when the anchor is ambiguous', () => {
    fs.writeFileSync(target, 'same\nother\nsame\n', 'utf8');
    expect(() => createTextReplacePlan(target, 'same', 'changed'))
      .toThrow(/matched 2 locations.*first lines: 1, 3.*more surrounding text/);
  });

  it('treats overlapping anchors as ambiguous and counts CR-only lines', () => {
    fs.writeFileSync(target, 'head\raaa\rtail', 'utf8');
    expect(() => createTextReplacePlan(target, 'aa', 'b'))
      .toThrow(/matched 2 locations.*first lines: 2, 2/);
  });

  it('refuses ambiguous encodings and oversized files with actionable errors', () => {
    fs.writeFileSync(target, Buffer.from([0x80, 0x81, 0x82]));
    expect(() => createTextReplacePlan(target, 'x', 'y'))
      .toThrow(/requires unambiguous UTF-8/);

    fs.writeFileSync(target, 'large text', 'utf8');
    expect(() => createTextReplacePlan(target, 'large', 'small', { maxFileBytes: 4 }))
      .toThrow(/refused 10 bytes.*narrow the file/);
  });
});
