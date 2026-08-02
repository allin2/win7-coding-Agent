import { buildContentDiffPreview, computeDiff } from '../../src/diff';

describe('content diff preview', () => {
  it('includes bounded content rather than status only', () => {
    const before = Buffer.from('first\nold\nlast\n');
    const after = Buffer.from('first\nnew\nlast\n');
    const preview = buildContentDiffPreview(before, after);

    expect(preview).toMatchObject({
      encoding: 'utf-8',
      startLine: 2,
      removedLineCount: 1,
      addedLineCount: 1,
      truncated: false,
    });
    expect(preview.unifiedDiff).toContain('-old');
    expect(preview.unifiedDiff).toContain('+new');
    expect(preview.beforeSha256).not.toBe(preview.afterSha256);
  });

  it('does not guess binary or non-UTF-8 content', () => {
    const preview = buildContentDiffPreview(
      Buffer.from([0x80]),
      Buffer.from([0x81]),
    );
    expect(preview.encoding).toBe('binary');
    expect(preview.unifiedDiff).toContain('binary or non-UTF-8');
  });

  it('attaches previews to added, modified, and deleted entries', () => {
    const result = computeDiff(
      new Map([
        ['/modified', Buffer.from('old')],
        ['/deleted', Buffer.from('gone')],
      ]),
      new Map([
        ['/modified', Buffer.from('new')],
        ['/added', Buffer.from('fresh')],
      ]),
    );
    expect(result.entries).toHaveLength(3);
    expect(result.entries.every((entry) => Boolean(entry.preview.unifiedDiff))).toBe(true);
  });

  it('marks oversized previews as truncated and keeps a visible notice', () => {
    const before = Buffer.from(Array.from({ length: 200 }, (_, index) => `old-${index}`).join('\n'));
    const after = Buffer.from(Array.from({ length: 200 }, (_, index) => `new-${index}`).join('\n'));
    const preview = buildContentDiffPreview(before, after, 256);
    expect(preview.truncated).toBe(true);
    expect(preview.unifiedDiff).toContain('diff preview truncated');
    expect(Buffer.byteLength(preview.unifiedDiff, 'utf8')).toBeLessThanOrEqual(256);
  });

  it('does not split UTF-8 code points at the preview boundary', () => {
    const preview = buildContentDiffPreview(
      Buffer.from('旧'.repeat(200)),
      Buffer.from('新'.repeat(200)),
      256,
    );
    expect(preview.truncated).toBe(true);
    expect(preview.unifiedDiff).not.toContain('\uFFFD');
    expect(Buffer.byteLength(preview.unifiedDiff, 'utf8')).toBeLessThanOrEqual(256);
  });
});
