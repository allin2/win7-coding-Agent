import * as fs from 'fs';
import * as path from 'path';
const { processOffice } = require('../../product/office-lite-engine');
const { readOfficeZip } = require('../../product/office-lite-zip');
const JSZip = require('../../office-lite/node_modules/jszip');
const ExcelJS = require('../../office-lite/node_modules/exceljs');
const docx = { schemaVersion: 1, format: 'docx', blocks: [{ type: 'heading', level: 2, text: '标题' },
  { type: 'paragraph', text: '中文 & <正文>' }, { type: 'table', rows: [['甲', '乙'], ['1', '2']] }] };
const xlsx = { schemaVersion: 1, format: 'xlsx', sheets: [{ name: '数据', rows: [['文本', 2, true, null, '=1+1']] }, { name: '空表', rows: [] }] };
const make = (content: any) => processOffice({ action: 'write', format: content.format, content });
async function mutate(buffer: Buffer, change: (zip: any) => any) {
  const zip = await JSZip.loadAsync(buffer); await change(zip); return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
describe('Office Lite bounded engine with real DOCX/XLSX bytes', () => {
  it.each([docx, xlsx])('generates, validates and reads $format with explicit content fidelity', async content => {
    const result = await make(content);
    const read = await processOffice({ action: 'read', format: content.format, buffer: result.buffer });
    expect(read.canModify).toBe(true); expect(read.fidelity).toBe('content_only');
    expect(read.nextStart).toBe(null);
    expect(JSON.stringify(read)).toContain(content.format === 'docx' ? '中文 & <正文>' : '=1+1');
    if (content.format === 'xlsx') {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(result.buffer);
      expect(wb.worksheets[0].getCell('E1').value).toBe('=1+1');
    }
  });
  it('keeps formulas/cached values separate and never recalculates', async () => {
    const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet('Formula');
    sheet.getCell('A1').value = { formula: '2+3', result: 99 };
    sheet.getCell('B1').value = new Date('2020-01-01T00:00:00Z');
    const result = await processOffice({ action: 'read', format: 'xlsx', buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
    expect(result.canModify).toBe(false);
    expect(result.units[0]).toMatchObject({ value: null, formula: '2+3', cachedValue: 99, calculation: 'cached_not_recalculated' });
    expect(result.units[1]).toMatchObject({ value: 43831, numberFormatInterpretation: 'raw_value_not_formatted' });
  });
  it('ordinary documents read normally, while changed or absent provenance cannot authorize a rewrite', async () => {
    const generated = await make(docx);
    const unmarked = await mutate(generated.buffer, zip => zip.remove('office-lite.json'));
    expect((await processOffice({ action: 'inspect', format: 'docx', buffer: unmarked })).canModify).toBe(false);
    const edited = await mutate(generated.buffer, async zip => {
      const xml = await zip.file('word/document.xml').async('string'); zip.file('word/document.xml', xml.replace('标题', '改变'));
    });
    expect((await processOffice({ action: 'inspect', format: 'docx', buffer: edited })).canModify).toBe(false);
  });
  it('paginates with a valid nextStart and bounds a single large table row', async () => {
    const data = { schemaVersion: 1, format: 'docx', blocks: Array.from({ length: 12 }, (_, n) => ({ type: 'paragraph', text: '行' + n })) };
    const file = await make(data); let cursor = 0; const values = [];
    do { const page = await processOffice({ action: 'read', format: 'docx', buffer: file.buffer, start: cursor, limit: 3 });
      values.push(...page.units.map((u: any) => u.text)); cursor = page.nextStart; expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(32768);
    } while (cursor !== null);
    expect(values).toEqual(data.blocks.map(b => b.text));
    const large = await make({ schemaVersion: 1, format: 'docx', blocks: [{ type: 'table', rows: [Array(10).fill('长'.repeat(4000))] }] });
    const page = await processOffice({ action: 'read', format: 'docx', buffer: large.buffer });
    expect(page.units[0].contentTruncated).toBe(true); expect(page.nextStart).toBe(null);
    await expect(processOffice({ action: 'read', format: 'docx', buffer: file.buffer, start: 0.5 })).rejects.toHaveProperty('code', 'A9_OFFICE_RANGE_INVALID');
  });
  it('rejects external relationships, macros, entities, malformed XML and disguised files', async () => {
    const generated = await make(docx);
    const variants = [
      (zip: any) => zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="evil" TargetMode="External" Target="https://example.com/secret"/></Relationships>'),
      (zip: any) => zip.file('word/vbaProject.bin', 'macro'),
      (zip: any) => zip.file('word/document.xml', '<!DOCTYPE x [<!ENTITY x "secret">]><x>&x;</x>'),
      (zip: any) => zip.file('word/document.xml', '<broken>'),
    ];
    for (const change of variants) await expect(processOffice({ action: 'inspect', format: 'docx', buffer: await mutate(generated.buffer, change) })).rejects.toHaveProperty('code');
    await expect(processOffice({ action: 'read', format: 'xlsx', buffer: generated.buffer })).rejects.toHaveProperty('code', 'A9_OFFICE_FORMAT_MISMATCH');
    await expect(processOffice({ action: 'read', format: 'pdf', buffer: Buffer.from('PDF') })).rejects.toHaveProperty('code', 'A9_OFFICE_FORMAT_UNSUPPORTED');
  });
  it('rejects malformed/oversized archives using actual inflated size and CRC', async () => {
    const zip = new JSZip(); zip.file('bomb.xml', Buffer.alloc(4 * 1024 * 1024 + 1, 65));
    const bomb = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(() => readOfficeZip(bomb)).toThrow('A9_OFFICE_ZIP_LIMIT');
    const lying = Buffer.from(bomb); const central = lying.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
    lying.writeUInt32LE(1, central + 24); lying.writeUInt32LE(1, 22);
    expect(() => readOfficeZip(lying)).toThrow('A9_OFFICE_ZIP_LIMIT_OR_INVALID');
    const file = await make(xlsx); const truncated = file.buffer.subarray(0, file.buffer.length - 1);
    expect(() => readOfficeZip(truncated)).toThrow('A9_OFFICE_ZIP_INVALID');
    const corrupt = Buffer.from(file.buffer); const local = corrupt.indexOf(Buffer.from([0x50, 0x4b, 3, 4]));
    corrupt.writeUInt32LE(1, local + 14); expect(() => readOfficeZip(corrupt)).toThrow('A9_OFFICE_ZIP_INVALID');
    const many = new JSZip(); for (let i = 0; i < 257; i++) many.file('a' + i, '');
    expect(() => readOfficeZip(Buffer.alloc(4 * 1024 * 1024 + 1))).toThrow('A9_OFFICE_BYTE_LIMIT');
    expect(() => readOfficeZip(Buffer.from('notzip'))).toThrow('A9_OFFICE_ZIP_INVALID');
    expect(() => readOfficeZip(file.buffer)).not.toThrow();
    const crowded = await many.generateAsync({ type: 'nodebuffer' }); expect(() => readOfficeZip(crowded)).toThrow('A9_OFFICE_ZIP_LIMIT');
  });
  it('rejects invalid structures and keeps strings as strings', async () => {
    for (const content of [
      { ...docx, extra: true }, { ...docx, blocks: [{ type: 'heading', level: 7, text: 'bad' }] },
      { ...xlsx, sheets: [{ name: 'a', rows: [[{ formula: 'evil' }]] }] },
      { ...xlsx, sheets: [{ name: 'a', rows: [] }, { name: 'A', rows: [] }] },
      { ...docx, blocks: [{ type: 'paragraph', text: '\0' }] },
    ]) await expect(make(content)).rejects.toHaveProperty('code');
  });
});
