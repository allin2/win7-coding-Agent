'use strict';
const crypto = require('crypto');
const posix = require('path').posix;
const { TextDecoder } = require('util');
const { readOfficeZip, MAX_BYTES } = require('./office-lite-zip');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const MARKER = 'office-lite.json';
const LIMITS = ['仅核对内容结构；不保证原稿版式、分页、复杂对象或公式重算。'];
function fail(code = 'A9_OFFICE_INVALID_DOCUMENT') { throw Object.assign(new Error(code), { code }); }
function keys(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k)) ||
      required.some(k => !Object.prototype.hasOwnProperty.call(value, k))) fail('A9_OFFICE_CONTENT_INVALID');
}
function validText(text) {
  if (typeof text !== 'string' || text.length > 4096 || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(text)) fail('A9_OFFICE_TEXT_LIMIT_OR_INVALID');
  for (let i = 0; i < text.length; i++) {
    const n = text.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) { const next = text.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) fail('A9_OFFICE_TEXT_LIMIT_OR_INVALID'); }
    else if (n >= 0xdc00 && n <= 0xdfff) fail('A9_OFFICE_TEXT_LIMIT_OR_INVALID');
  }
  return text;
}
function children(node, local, ns) {
  return Array.from(node.childNodes || []).filter(n => n.nodeType === 1 && (!local || n.localName === local) && (!ns || n.namespaceURI === ns));
}
function descendants(node, local, ns) { return Array.from(node.getElementsByTagNameNS(ns, local)); }
function parseXml(buffer) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (_) { fail('A9_OFFICE_XML_INVALID'); }
  if (text.includes('\0') || /<!\s*(?:DOCTYPE|ENTITY)/i.test(text)) fail('A9_OFFICE_XML_ENTITY_UNSUPPORTED');
  const { DOMParser } = require('../office-lite/node_modules/@xmldom/xmldom');
  let doc;
  try { doc = new DOMParser({ onError: () => { fail('A9_OFFICE_XML_INVALID'); } }).parseFromString(text, 'application/xml'); }
  catch (_) { fail('A9_OFFICE_XML_INVALID'); }
  const stack = [doc]; let count = 0;
  while (stack.length) {
    const n = stack.pop(); if (++count > 100000) fail('A9_OFFICE_XML_LIMIT');
    for (let child = n.lastChild; child; child = child.previousSibling) stack.push(child);
  }
  return doc;
}
function checkedParts(buffer, format) {
  const parts = readOfficeZip(buffer), xml = new Map();
  for (const [name, bytes] of parts) {
    if (/(?:^|\/)(?:vbaproject|embeddings|activex|externallinks|connections)(?:[.\/]|$)|_xmlsignatures/i.test(name)) fail('A9_OFFICE_ACTIVE_CONTENT_UNSUPPORTED');
    if (/\.(?:xml|rels)$/i.test(name)) {
      const doc = parseXml(bytes); xml.set(name, doc);
      if (name.endsWith('.rels')) for (const relation of descendants(doc, 'Relationship', 'http://schemas.openxmlformats.org/package/2006/relationships')) {
        const target = relation.getAttribute('Target') || '';
        if ((relation.getAttribute('TargetMode') || '').toLowerCase() === 'external' || /^(?:[a-z][\w+.-]*:|\/|\\)/i.test(target) || target.includes('\\') || target.includes('%')) fail('A9_OFFICE_EXTERNAL_RELATION_UNSUPPORTED');
        const base = name === '_rels/.rels' ? '' : posix.dirname(posix.dirname(name));
        const resolved = posix.normalize(posix.join(base, target));
        if (resolved.startsWith('../')) fail('A9_OFFICE_EXTERNAL_RELATION_UNSUPPORTED');
      }
    }
  }
  const types = xml.get('[Content_Types].xml');
  const core = format === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  const expected = format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  if (!types || !xml.has(core) || !descendants(types, 'Override', 'http://schemas.openxmlformats.org/package/2006/content-types')
    .some(n => n.getAttribute('PartName') === '/' + core && n.getAttribute('ContentType') === expected)) fail('A9_OFFICE_FORMAT_MISMATCH');
  return { parts, xml };
}
function collectUnits(checked, format) {
  const units = [], warnings = [...LIMITS]; let textBytes = 0, cells = 0;
  function text(t) { validText(t); textBytes += Buffer.byteLength(t); if (textBytes > 256 * 1024) fail('A9_OFFICE_CONTENT_LIMIT'); return t; }
  function add(value) { if (units.length >= 10000) fail('A9_OFFICE_UNIT_LIMIT'); units.push({ index: units.length, ...value }); }
  if (format === 'docx') {
    const doc = checked.xml.get('word/document.xml');
    const body = descendants(doc, 'body', W)[0]; if (!body) fail();
    function paragraph(node) {
      let t = '';
      const stack = [node];
      while (stack.length) {
        const n = stack.pop();
        if (n.namespaceURI === W && n.localName === 't') { t += n.textContent; continue; }
        if (n.namespaceURI === W && n.localName === 'tab') t += '\t';
        else if (n.namespaceURI === W && ['br', 'cr'].includes(n.localName)) t += '\n';
        for (let c = n.lastChild; c; c = c.previousSibling) stack.push(c);
      }
      return t;
    }
    for (const node of children(body)) {
      if (node.namespaceURI !== W) { warnings.push('部分非正文对象未提取。'); continue; }
      if (node.localName === 'p') {
        const style = descendants(node, 'pStyle', W)[0]; const id = style && style.getAttributeNS(W, 'val');
        const heading = /^Heading([1-6])$/i.exec(id || '');
        add({ type: heading ? 'heading' : 'paragraph', ...(heading ? { level: Number(heading[1]) } : {}), text: text(paragraph(node)) });
      } else if (node.localName === 'tbl') {
        for (const row of children(node, 'tr', W)) {
          const values = children(row, 'tc', W).map(cell => {
            if (++cells > 10000) fail('A9_OFFICE_UNIT_LIMIT');
            return text(children(cell, 'p', W).map(paragraph).join('\n'));
          });
          add({ type: 'table_row', cells: values });
        }
      } else if (node.localName !== 'sectPr') warnings.push('部分复杂正文对象未提取。');
    }
    if (['drawing', 'pict', 'ins', 'del', 'fldChar', 'sdt', 'altChunk'].some(n => descendants(doc, n, W).length)) warnings.push('文档含复杂对象；仅提取普通正文与简单表格。');
    if ([...checked.parts.keys()].some(n => /^word\/(?:header|footer|footnotes|endnotes|comments)/.test(n))) warnings.push('页眉页脚、批注和脚注未提取。');
  } else {
    const workbook = checked.xml.get('xl/workbook.xml');
    const relationships = checked.xml.get('xl/_rels/workbook.xml.rels'); if (!relationships) fail();
    const rels = new Map(descendants(relationships, 'Relationship', 'http://schemas.openxmlformats.org/package/2006/relationships').map(n => [n.getAttribute('Id'), n.getAttribute('Target')]));
    const shared = checked.xml.get('xl/sharedStrings.xml');
    const strings = shared ? descendants(shared, 'si', S).map(n => descendants(n, 't', S).map(t => t.textContent).join('')) : [];
    if (strings.length > 10000) fail('A9_OFFICE_UNIT_LIMIT');
    const sheets = descendants(workbook, 'sheet', S); if (sheets.length > 8) fail('A9_OFFICE_UNIT_LIMIT');
    const allNames = new Set();
    for (const sheet of sheets) {
      const name = validText(sheet.getAttribute('name'));
      if (allNames.has(name.toLowerCase())) fail(); allNames.add(name.toLowerCase());
      const target = rels.get(sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const doc = target && checked.xml.get(posix.normalize(posix.join('xl', target))); if (!doc) fail();
      for (const cell of descendants(doc, 'c', S)) {
        const reference = /^([A-Z]{1,3})([1-9]\d*)$/.exec(cell.getAttribute('r')); if (!reference) fail();
        const row = Number(reference[2]); const column = [...reference[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
        if (row > 1048576 || column > 16384) fail();
        const type = cell.getAttribute('t'); const v = children(cell, 'v', S)[0]; const raw = v ? v.textContent : '';
        let value = null;
        if (type === 's') { if (!/^\d+$/.test(raw) || Number(raw) >= strings.length) fail(); value = text(strings[Number(raw)]); }
        else if (type === 'inlineStr') value = text(descendants(cell, 't', S).map(n => n.textContent).join(''));
        else if (['str', 'e', 'd'].includes(type)) value = text(raw);
        else if (type === 'b') { if (!['0', '1'].includes(raw)) fail(); value = raw === '1'; }
        else if (raw !== '') { value = Number(raw); if (!Number.isFinite(value)) fail(); }
        const formula = children(cell, 'f', S)[0];
        add({ type: 'cell', sheet: name, row, column, value: formula ? null : value,
          ...(formula ? { formula: text(formula.textContent), cachedValue: value, calculation: 'cached_not_recalculated' } : {}),
          ...(cell.getAttribute('s') ? { styleIndex: Number(cell.getAttribute('s')), numberFormatInterpretation: 'raw_value_not_formatted' } : {}) });
      }
    }
    warnings.push('数值按存储值读取；日期格式未转换，公式缓存可能过期。');
    if ([...checked.parts.keys()].some(n => /(?:charts|pivotTables|drawings|tables)\//.test(n))) warnings.push('复杂表格、图表或透视对象仅提取单元格。');
  }
  return { units, warnings: [...new Set(warnings)] };
}
function validateContent(input, format) {
  keys(input, ['schemaVersion', 'format', format === 'docx' ? 'blocks' : 'sheets'], ['schemaVersion', 'format', format === 'docx' ? 'blocks' : 'sheets']);
  if (input.schemaVersion !== 1 || input.format !== format || Buffer.byteLength(JSON.stringify(input)) > 256 * 1024) fail('A9_OFFICE_CONTENT_INVALID');
  let count = 0;
  const value = t => { if (++count > 10000) fail('A9_OFFICE_UNIT_LIMIT'); return validText(t); };
  if (format === 'docx') {
    if (!Array.isArray(input.blocks) || input.blocks.length > 10000) fail('A9_OFFICE_CONTENT_INVALID');
    for (const block of input.blocks) {
      if (!block || typeof block !== 'object') fail('A9_OFFICE_CONTENT_INVALID');
      if (block.type === 'table') {
        keys(block, ['type', 'rows'], ['type', 'rows']);
        if (!Array.isArray(block.rows) || !block.rows.length) fail('A9_OFFICE_CONTENT_INVALID');
        let columns;
        for (const row of block.rows) {
          if (!Array.isArray(row) || !row.length || (columns && columns !== row.length)) fail('A9_OFFICE_CONTENT_INVALID');
          columns = row.length; row.forEach(value);
        }
      } else {
        keys(block, block.type === 'heading' ? ['type', 'level', 'text'] : ['type', 'text'], ['type', 'text']);
        if (!['paragraph', 'heading'].includes(block.type) || (block.type === 'heading' && (!Number.isInteger(block.level) || block.level < 1 || block.level > 6))) fail('A9_OFFICE_CONTENT_INVALID');
        value(block.text);
      }
    }
  } else {
    if (!Array.isArray(input.sheets) || !input.sheets.length || input.sheets.length > 8) fail('A9_OFFICE_CONTENT_INVALID');
    const names = new Set();
    for (const sheet of input.sheets) {
      keys(sheet, ['name', 'rows'], ['name', 'rows']); validText(sheet.name);
      if (!sheet.name || sheet.name.length > 31 || /[\\/?*\[\]:]/.test(sheet.name) || /^'|'$/.test(sheet.name) || names.has(sheet.name.toLowerCase()) || !Array.isArray(sheet.rows)) fail('A9_OFFICE_CONTENT_INVALID');
      names.add(sheet.name.toLowerCase());
      if (sheet.rows.length > 10000) fail('A9_OFFICE_UNIT_LIMIT');
      for (const row of sheet.rows) {
        if (++count > 10000) fail('A9_OFFICE_UNIT_LIMIT');
        if (!Array.isArray(row) || row.length > 16384) fail('A9_OFFICE_CONTENT_INVALID');
        for (const cell of row) {
          if (++count > 10000 || (cell !== null && !['string', 'number', 'boolean'].includes(typeof cell)) || (typeof cell === 'number' && !Number.isFinite(cell))) fail('A9_OFFICE_CONTENT_INVALID');
          if (typeof cell === 'string') validText(cell);
        }
      }
    }
  }
  return input;
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function editable(checked, format) {
  if (!checked.parts.has(MARKER)) return false;
  try {
    const marker = JSON.parse(checked.parts.get(MARKER).toString('utf8'));
    if (marker.schemaVersion !== 1 || marker.format !== format || !marker.parts) return false;
    const names = [...checked.parts.keys()].filter(n => !n.endsWith('/') && n !== MARKER).sort();
    return names.length === Object.keys(marker.parts).length && names.every(n => marker.parts[n] === hash(checked.parts.get(n)));
  } catch (_) { return false; }
}
async function generate(content, format) {
  validateContent(content, format);
  let buffer;
  if (format === 'docx') {
    const { Document, Paragraph, TextRun, Table, TableRow, TableCell, Packer, HeadingLevel } = require('../office-lite/node_modules/docx');
    const paragraph = t => new Paragraph({ children: [new TextRun(t)] });
    const body = content.blocks.map(block => block.type === 'table' ? new Table({ rows: block.rows.map(row => new TableRow({ children: row.map(t => new TableCell({ children: [paragraph(t)] })) })) }) :
      new Paragraph({ ...(block.type === 'heading' ? { heading: HeadingLevel['HEADING_' + block.level] } : {}), children: [new TextRun(block.text)] }));
    buffer = await Packer.toBuffer(new Document({ sections: [{ children: body }] }));
  } else {
    const ExcelJS = require('../office-lite/node_modules/exceljs'); const workbook = new ExcelJS.Workbook();
    for (const sheet of content.sheets) { const ws = workbook.addWorksheet(sheet.name); for (const row of sheet.rows) ws.addRow(row); }
    buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const parts = readOfficeZip(buffer);
  const JSZip = require('../office-lite/node_modules/jszip'); const zip = await JSZip.loadAsync(buffer);
  const types = parts.get('[Content_Types].xml').toString('utf8');
  zip.file('[Content_Types].xml', types.replace('</Types>', '<Default Extension="json" ContentType="application/json"/></Types>'));
  const typesBytes = Buffer.from(types.replace('</Types>', '<Default Extension="json" ContentType="application/json"/></Types>'));
  parts.set('[Content_Types].xml', typesBytes);
  const bindings = Object.fromEntries([...parts].filter(([n]) => !n.endsWith('/')).map(([n, b]) => [n, hash(b)]));
  zip.file(MARKER, JSON.stringify({ schemaVersion: 1, format, parts: bindings }));
  buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (buffer.length > MAX_BYTES) fail('A9_OFFICE_BYTE_LIMIT');
  const checked = checkedParts(buffer, format); const result = collectUnits(checked, format);
  // Semantic read-back of the declared subset, independent of ZIP entry byte order.
  const expected = format === 'docx' ? content.blocks.flatMap(b => b.type === 'table' ? b.rows.map(cells => ({ type: 'table_row', cells })) :
    [{ type: b.type, ...(b.type === 'heading' ? { level: b.level } : {}), text: b.text }]) :
    content.sheets.flatMap(sheet => sheet.rows.flatMap((row, r) => row.flatMap((value, c) => value === null ? [] :
      [{ type: 'cell', sheet: sheet.name, row: r + 1, column: c + 1, value }])));
  const actual = result.units.map(({ index, ...unit }) => unit);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) fail('A9_OFFICE_READBACK_MISMATCH');
  return { schemaVersion: 1, format, buffer, unitCount: result.units.length, fidelity: 'content_only', warnings: result.warnings };
}
async function processOffice(input) {
  if (!input || !['docx', 'xlsx'].includes(input.format) || !['write', 'read', 'inspect'].includes(input.action)) fail('A9_OFFICE_FORMAT_UNSUPPORTED');
  if (input.action === 'write') return generate(input.content, input.format);
  if (!(input.buffer instanceof Uint8Array)) fail();
  const checked = checkedParts(input.buffer, input.format); const result = collectUnits(checked, input.format);
  const response = { schemaVersion: 1, format: input.format, unitCount: result.units.length, canModify: editable(checked, input.format), fidelity: 'content_only', warnings: result.warnings };
  if (input.action === 'inspect') return response;
  const start = input.start === undefined ? 0 : input.start, limit = input.limit === undefined ? 50 : input.limit;
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) fail('A9_OFFICE_RANGE_INVALID');
  const selected = [];
  for (let i = start; i < Math.min(result.units.length, start + limit); i++) {
    const unit = result.units[i];
    if (Buffer.byteLength(JSON.stringify({ ...response, units: [...selected, unit] })) > 30 * 1024) {
      if (!selected.length) selected.push({ index: unit.index, type: unit.type, contentTruncated: true, message: '单元超过单次预览预算；请使用原文查看。' });
      break;
    }
    selected.push(unit);
  }
  const next = Math.min(result.units.length, start + selected.length);
  return { ...response, units: selected, nextStart: next < result.units.length ? next : null, truncated: next < result.units.length || selected.some(u => u.contentTruncated) };
}
module.exports = { processOffice };
