import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { A9WorkspaceService } from '../../src';

const CHUNK = 64 * 1024;
const hash = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');

describe('A9-10 explicit encoding and bounded streaming read', () => {
  // Keep this isolated fixture directory; never clean user/workspace paths.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-read-streaming-'));
  const target = path.join(root, '中文 空格 %#.txt');
  let service: A9WorkspaceService;
  beforeEach(() => { service = new A9WorkspaceService(root); });
  afterEach(() => { jest.restoreAllMocks(); });

  function fixture(bytes: Buffer | string) {
    fs.writeFileSync(target, bytes, typeof bytes === 'string' ? 'utf8' : undefined);
    return path.basename(target);
  }

  it.each([
    ['gbk', Buffer.from([0xd6, 0xd0]), '中'],
    ['utf-16le', Buffer.from('中文', 'utf16le'), '中文'],
    ['utf-16le', Buffer.from('中', 'utf16le'), '中'],
    ['utf-8', Buffer.from('中文😀', 'utf8'), '中文😀'],
  ])('explicit %s wins over automatic ambiguity', async (encoding, bytes, text) => {
    const result = await service.read(fixture(bytes as Buffer), { encoding: encoding as string });
    expect(result).toMatchObject({ isText: true, encoding, content: `1: ${text}`, totalLines: 1 });
    expect(result.contentSha256).toBe(hash(bytes as Buffer));
  });

  it.each([
    ['gbk', Buffer.from([0xd6, 0xd0]), Buffer.from([0xce, 0xc4])],
    ['utf-16le', Buffer.from('中', 'utf16le'), Buffer.from('文', 'utf16le')],
  ])('binds explicit %s to the read baseline so a short ambiguous file can be edited safely', async (encoding, before, after) => {
    const name = fixture(before as Buffer);
    await service.read(name, { encoding: encoding as string });
    const result = await service.edit(name, '中', '文', { turnId: `edit-${encoding}` });
    expect(result.encoding).toBe(encoding);
    expect(fs.readFileSync(target)).toEqual(after);
  });

  it.each([
    ['utf-8', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('中文\r\n')])],
    ['utf-16le', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文\r\n', 'utf16le')])],
    ['gbk', Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0d, 0x0a])],
  ])('automatic %s detection preserves BOM/CRLF behavior', async (encoding, bytes) => {
    const result = await service.read(fixture(bytes as Buffer));
    expect(result).toMatchObject({ encoding, content: '1: 中文\n2: ', totalLines: 2 });
    expect(fs.readFileSync(target)).toEqual(bytes);
  });

  it('binary requests never return decoded file contents', async () => {
    const bytes = Buffer.from('private fixture 中文');
    const result = await service.read(fixture(bytes), { encoding: 'binary' });
    expect(result).toMatchObject({ isText: false, encoding: 'binary', linesRead: 0, totalLines: 0, contentSha256: hash(bytes) });
    expect(result.content).not.toContain('private fixture');
  });

  it('invalid explicit encoding fails instead of substituting replacement characters or creating a baseline', async () => {
    const name = fixture(Buffer.from([0xff]));
    await expect(service.read(name, { encoding: 'utf-8' })).rejects.toMatchObject({ code: 'ENCODING_AMBIGUOUS' });
    expect((service as any).baselines.size).toBe(0);
    await expect(service.read(name, { encoding: 'unknown' })).rejects.toThrow(/encoding/);
  });

  it('ambiguous and NUL-containing automatic input returns metadata, not guessed text', async () => {
    for (const bytes of [Buffer.from([0xd6, 0xd0]), Buffer.from([0, 1, 2]), Buffer.from([0xfe, 0xff, 0, 65])]) {
      expect((await service.read(fixture(bytes))).isText).toBe(false);
    }
  });

  it.each(['utf-8', 'gbk', 'utf-16le'])('%s characters and CRLF survive chunk boundaries', async (encoding) => {
    const expected = encoding === 'gbk' ? '中文' : encoding === 'utf-16le' ? '😀中文' : '中文😀';
    const body = encoding === 'gbk' ? Buffer.from([0xd6, 0xd0, 0xce, 0xc4]) : Buffer.from(expected, encoding === 'utf-8' ? 'utf8' : 'utf16le');
    const padding = encoding === 'utf-16le' ? Buffer.from('x'.repeat(CHUNK / 2 - 1), 'utf16le') : Buffer.from('x'.repeat(CHUNK - 1));
    const newline = Buffer.from('\r\n', encoding === 'utf-16le' ? 'utf16le' : 'utf8');
    const bytes = Buffer.concat([padding, body, newline, body]);
    const result = await service.read(fixture(bytes), { startLine: 2, maxLines: 1, encoding });
    expect(result.content).toBe(`2: ${expected}`);
    expect(result.contentSha256).toBe(hash(bytes));
    const crBoundary = Buffer.concat([Buffer.from('a'.repeat(CHUNK - 1)), Buffer.from('\r\n中文')]);
    expect((await service.read(fixture(crBoundary), { startLine: 2 })).content).toBe('2: 中文');
  });

  it('automatic GBK detection scans beyond a long ASCII prefix and preserves split pairs', async () => {
    const bytes = Buffer.concat([Buffer.from('a'.repeat(CHUNK - 1)), Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 10, 0xd6, 0xd0, 0xce, 0xc4])]);
    const result = await service.read(fixture(bytes), { startLine: 2 });
    expect(result).toMatchObject({ encoding: 'gbk', content: '2: 中文', totalLines: 2 });
  });

  it('handles short reads in BOM, surrogate pairs and CRLF without losing bytes', async () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('😀中文\r\n末尾', 'utf16le')]);
    const name = fixture(bytes);
    const actualOpen = fs.promises.open.bind(fs.promises);
    jest.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await actualOpen(...args);
      const read = handle.read.bind(handle);
      handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) =>
        read(buffer, offset, Math.min(length, 1), position)) as any;
      return handle;
    });
    expect(await service.read(name)).toMatchObject({ content: '1: 😀中文\n2: 末尾', encoding: 'utf-16le', contentSha256: hash(bytes) });
  });

  it('supports binary metadata over 8 MiB and does not leak the preview', async () => {
    const bytes = Buffer.alloc(8 * 1024 * 1024 + 1, 0);
    expect(await service.read(fixture(bytes), { encoding: 'binary' })).toMatchObject({
      isText: false, contentSha256: hash(bytes), linesRead: 0,
    });
  });

  it('rejects directories and already-canceled reads before opening a handle', async () => {
    const open = jest.spyOn(fs.promises, 'open');
    await expect(service.read(root)).rejects.toThrow(/不是文件/);
    const controller = new AbortController();
    controller.abort();
    await expect(service.read(fixture('hello'), { signal: controller.signal })).rejects.toThrow(/取消/);
    expect(open).not.toHaveBeenCalled();
  });

  it('reads a range beyond 8 MiB without whole-file loading and hashes the complete file', async () => {
    const bytes = Buffer.from('中文 line\r\n'.repeat(750000) + '尾行');
    expect(bytes.length).toBeGreaterThan(8 * 1024 * 1024);
    const name = fixture(bytes);
    const wholeRead = jest.spyOn(require('fs'), 'readFileSync');
    const actualOpen = fs.promises.open.bind(fs.promises);
    let largestRead = 0;
    let closed = false;
    jest.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await actualOpen(...args);
      const read = handle.read.bind(handle);
      const close = handle.close.bind(handle);
      handle.read = (async (...readArgs: any[]) => {
        largestRead = Math.max(largestRead, readArgs[2]);
        return (read as any)(...readArgs);
      }) as any;
      handle.close = async () => { closed = true; await close(); };
      return handle;
    });
    const result = await service.read(name, { startLine: 749999, maxLines: 3 });
    expect(result).toMatchObject({ content: '749999: 中文 line\n750000: 中文 line\n750001: 尾行', totalLines: 750001, linesRead: 3, truncated: false });
    expect(result.contentSha256).toBe(hash(bytes));
    expect((service as any).baselines.get(name).sha256).toBe(hash(bytes));
    expect(largestRead).toBeLessThanOrEqual(CHUNK);
    expect(closed).toBe(true);
    expect(wholeRead).not.toHaveBeenCalled();
    wholeRead.mockRestore();
    fs.appendFileSync(target, 'changed', 'utf8');
    await expect(service.edit(name, '尾行', 'edited')).rejects.toMatchObject({ code: 'BASELINE_DRIFT' });
  });

  it('bounds a giant Chinese line without cutting a UTF-8 character; later lines remain readable', async () => {
    const bytes = Buffer.from('中文😀'.repeat(950000) + '\r\n最后一行');
    const name = fixture(bytes);
    const result = await service.read(name, { maxLines: 1 });
    expect(result.truncationReasons).toEqual(['line_limit', 'byte_limit']);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.content, 'utf8')).toBeLessThanOrEqual(128 * 1024);
    expect(result.content).not.toContain('\ufffd');
    expect(result.content).toContain('[preview truncated: byte limit]');
    expect((await service.read(name, { startLine: 2 })).content).toBe('2: 最后一行');
  });

  it('reports line truncation, EOF, trailing newline and empty files consistently', async () => {
    const name = fixture('one\ntwo\n');
    expect(await service.read(name, { maxLines: 1 })).toMatchObject({ content: '1: one', truncated: true, truncationReasons: ['line_limit'] });
    expect(await service.read(name, { startLine: 4 })).toMatchObject({ content: '', linesRead: 0, totalLines: 3, truncated: false });
    expect(await service.read(fixture(''))).toMatchObject({ content: '1: ', linesRead: 1, totalLines: 1 });
  });

  it.each([{ startLine: 0 }, { startLine: 1.5 }, { startLine: NaN }, { maxLines: 0 }, { maxLines: 2001 }, { maxLines: Infinity }])('rejects invalid range %j', async (options) => {
    await expect(service.read(fixture('x'), options)).rejects.toThrow(/read requires/);
  });

  it.each(['cancel', 'change', 'replace', 'truncate'])('closes the handle and refuses a baseline after %s during reading', async (mode) => {
    const name = fixture(Buffer.alloc(CHUNK * 3, 65));
    const controller = new AbortController();
    const actualOpen = fs.promises.open.bind(fs.promises);
    let closed = false;
    jest.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await actualOpen(...args);
      const read = handle.read.bind(handle);
      const close = handle.close.bind(handle);
      let changed = false;
      handle.read = (async (...readArgs: any[]) => {
        const result = await (read as any)(...readArgs);
        if (!changed && readArgs[2] > 3) {
          changed = true;
          if (mode === 'cancel') controller.abort();
          if (mode === 'change') fs.appendFileSync(target, 'changed', 'utf8');
          if (mode === 'truncate') fs.truncateSync(target, 1);
          if (mode === 'replace') { fs.renameSync(target, path.join(root, 'replaced-original.txt')); fs.writeFileSync(target, Buffer.alloc(CHUNK * 3, 65)); }
        }
        return result;
      }) as any;
      handle.close = async () => { closed = true; await close(); };
      return handle;
    });
    await expect(service.read(name, { signal: controller.signal })).rejects.toThrow(mode === 'cancel' ? /取消/ : /读取期间/);
    expect((service as any).baselines.size).toBe(0);
    expect(closed).toBe(true);
  });
});
