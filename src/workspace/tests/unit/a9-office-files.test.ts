import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { A9WorkspaceService, readOfficeFile, createOfficeCopy } from '../../src';

describe('Office Lite file boundary and checkpoint', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-files-'));
  it('creates a complete new file on a Chinese path and participates in durable undo', async () => {
    const service = new A9WorkspaceService(root);
    const bytes = Buffer.from([0x50, 0x4b, 3, 4]);
    const result = await service.writeDocumentCopy('中文 空格.docx', bytes, { turnId: 'office-turn' });
    expect(result).toMatchObject({ created: true, encoding: 'binary', outsideWorkspace: false });
    expect((await readOfficeFile(root, '中文 空格.docx')).buffer).toEqual(bytes);
    const restarted = new A9WorkspaceService(root);
    const undone = restarted.getCheckpointManager().undoTurn('office-turn');
    expect(undone.errors).toEqual([]);
    expect(fs.existsSync(path.join(root, '中文 空格.docx'))).toBe(false);
  });
  it('never overwrites an original or an existing target, including a hard-linked alias', async () => {
    fs.writeFileSync(path.join(root, 'source.docx'), 'original');
    fs.linkSync(path.join(root, 'source.docx'), path.join(root, 'alias.docx'));
    for (const name of ['source.docx', 'alias.docx']) expect(() => createOfficeCopy(root, name, Buffer.from('bad'))).toThrow('A9_OFFICE_TARGET_EXISTS_OR_LINK');
    expect(fs.readFileSync(path.join(root, 'source.docx'), 'utf8')).toBe('original');
  });
  it('rejects outside paths, reparse escapes, folders and pre-cancelled reads', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-office-outside-'));
    fs.writeFileSync(path.join(outside, 'x.docx'), 'secret');
    fs.symlinkSync(outside, path.join(root, 'escape'));
    await expect(readOfficeFile(root, 'escape/x.docx')).rejects.toHaveProperty('code', 'A9_OFFICE_OUTSIDE_WORKSPACE');
    expect(() => createOfficeCopy(root, 'escape/new.docx', Buffer.from('bad'))).toThrow('A9_OFFICE_OUTSIDE_WORKSPACE');
    await expect(readOfficeFile(root, '.')).rejects.toHaveProperty('code', 'A9_OFFICE_OUTSIDE_WORKSPACE');
    const controller = new AbortController(); controller.abort();
    await expect(readOfficeFile(root, 'missing.docx', controller.signal)).rejects.toHaveProperty('code', 'A9_OFFICE_CANCELLED');
  });
  it('rejects a target raced in during publication and cleans only its own temporary file', () => {
    const actualLink = fs.linkSync;
    const destination = path.join(root, 'raced.docx');
    const spy = jest.spyOn(require('fs'), 'linkSync').mockImplementation((from: any, to: any) => {
      fs.writeFileSync(destination, 'other writer', { flag: 'wx' });
      return actualLink(from, to);
    });
    try { expect(() => createOfficeCopy(root, 'raced.docx', Buffer.from('mine'))).toThrow(); }
    finally { spy.mockRestore(); }
    expect(fs.readFileSync(destination, 'utf8')).toBe('other writer');
    expect(fs.readdirSync(root).filter(name => name.startsWith('.office-'))).toEqual([]);
  });
  it('detects content replacement while reading and enforces the compressed byte limit', async () => {
    const target = path.join(root, 'changing.docx'); fs.writeFileSync(target, 'before');
    const open = fs.promises.open.bind(fs.promises);
    const spy = jest.spyOn(fs.promises, 'open').mockImplementation(async (...args: any[]) => {
      const handle = await (open as any)(...args); const read = handle.read.bind(handle);
      handle.read = (async (...values: any[]) => { const r = await (read as any)(...values); fs.writeFileSync(target, 'changed!'); return r; }) as any;
      return handle;
    });
    try { await expect(readOfficeFile(root, 'changing.docx')).rejects.toHaveProperty('code', 'A9_OFFICE_CHANGED'); }
    finally { spy.mockRestore(); }
    fs.writeFileSync(target, Buffer.alloc(4 * 1024 * 1024 + 1));
    await expect(readOfficeFile(root, 'changing.docx')).rejects.toHaveProperty('code', 'A9_OFFICE_BYTE_LIMIT');
  });
});
