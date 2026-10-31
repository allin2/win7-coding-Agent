'use strict';
// Deterministic, minimal OOXML fixtures; no Office runtime or new dependency on the host.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { hash } = require('./a9-42-office-journey.cjs');
const FILES = { doc: '原稿 核对.docx', book: '数据 核对.xlsx', report: '数据 报告.docx', copy: '修改 副本.docx' };
const MARKERS = { doc: '原稿核对甲7F29', book: '销售核对乙83B1', copy: '修订核对丙4D62', answer: '确认核对丁9A15' };
const need = (v, code) => { if (!v) throw new Error(code); };
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const n = Buffer.from(name), b = Buffer.from(value, 'utf8'); const c = crc32(b);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt32LE(c, 14);
    h.writeUInt32LE(b.length, 18); h.writeUInt32LE(b.length, 22); h.writeUInt16LE(n.length, 26);
    const d = Buffer.alloc(46); d.writeUInt32LE(0x02014b50); d.writeUInt16LE(20, 4); d.writeUInt16LE(20, 6);
    d.writeUInt32LE(c, 16); d.writeUInt32LE(b.length, 20); d.writeUInt32LE(b.length, 24); d.writeUInt16LE(n.length, 28); d.writeUInt32LE(offset, 42);
    local.push(h, n, b); central.push(d, n); offset += h.length + n.length + b.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dir, end]);
}
function samples() {
  const types = kind => `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="json" ContentType="application/json"/>${kind}</Types>`;
  const rel = (type, target) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`;
  const fixture = (entries, format) => zip({ ...entries, 'office-lite.json': JSON.stringify({ schemaVersion: 1, format, parts: Object.fromEntries(Object.entries(entries).map(([n, text]) => [n, hash(Buffer.from(text, 'utf8'))])) }) });
  const doc = fixture({ '[Content_Types].xml': types('<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'),
    '_rels/.rels': rel('officeDocument', 'word/document.xml'), 'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${MARKERS.doc}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>` }, 'docx');
  const book = fixture({ '[Content_Types].xml': types('<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'),
    '_rels/.rels': rel('officeDocument', 'xl/workbook.xml'), 'xl/_rels/workbook.xml.rels': rel('worksheet', 'worksheets/sheet1.xml'),
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="数据" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${MARKERS.book}</t></is></c><c r="B1" t="inlineStr"><is><t>数量</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>甲</t></is></c><c r="B2"><v>17</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>乙</t></is></c><c r="B3"><v>23</v></c></row></sheetData></worksheet>` }, 'xlsx');
  return { [FILES.doc]: doc, [FILES.book]: book };
}
function xmlText(bytes) {
  need(bytes.length < 16 * 1024 * 1024 && bytes.subarray(0, 2).toString() === 'PK', 'OFFICE_PK');
  // Central directory sizes support data descriptors emitted by real Office engines.
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) if (bytes.readUInt32LE(end) === 0x06054b50) break;
  need(end >= 0, 'OFFICE_ZIP_END'); let pos = bytes.readUInt32LE(end + 16), total = 0; const texts = [];
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    need(pos + 46 <= bytes.length && bytes.readUInt32LE(pos) === 0x02014b50, 'OFFICE_ZIP_DIRECTORY');
    const method = bytes.readUInt16LE(pos + 10), size = bytes.readUInt32LE(pos + 20), unpacked = bytes.readUInt32LE(pos + 24);
    const n = bytes.readUInt16LE(pos + 28), extra = bytes.readUInt16LE(pos + 30), comment = bytes.readUInt16LE(pos + 32), off = bytes.readUInt32LE(pos + 42);
    const name = bytes.subarray(pos + 46, pos + 46 + n).toString('utf8'); pos += 46 + n + extra + comment;
    if (!/^(word\/document|xl\/(sharedStrings|worksheets\/sheet\d+))\.xml$/.test(name)) continue;
    total += unpacked; need(total <= 8 * 1024 * 1024 && off + 30 <= bytes.length && bytes.readUInt32LE(off) === 0x04034b50, 'OFFICE_ZIP_LIMIT');
    const start = off + 30 + bytes.readUInt16LE(off + 26) + bytes.readUInt16LE(off + 28);
    need(start + size <= bytes.length && [0, 8].includes(method), 'OFFICE_ZIP_ENTRY');
    const data = bytes.subarray(start, start + size), xml = method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: 8 * 1024 * 1024 }) : data;
    need(xml.length === unpacked && crc32(xml) === bytes.readUInt32LE(pos - (46 + n + extra + comment) + 16), 'OFFICE_ZIP_CRC');
    texts.push(xml.toString('utf8').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  }
  return texts.join('\n');
}
function workspaceFacts(root) {
  const facts = {};
  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      need(!entry.isSymbolicLink(), 'WORKSPACE_LINK'); const rel = prefix + entry.name, file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file, rel + '/');
      else { const stat = fs.statSync(file); need(stat.isFile(), 'WORKSPACE_FILE_TYPE'); const b = fs.readFileSync(file);
        facts[rel] = { sha256: hash(b), size: b.length, mtime_ms: stat.mtimeMs, ctime_ms: stat.ctimeMs,
          ...( /\.(docx|xlsx)$/.test(rel) ? { pk: b.subarray(0, 2).toString() === 'PK', text: xmlText(b) } : {}) }; }
    }
  }
  walk(root, ''); return facts;
}
const PROMPTS = {
  S1: `请用 document_read 读取“${FILES.doc}”，只回答其中原样出现的核对标记。禁止写入任何文件。`,
  S2: `请用 document_read 读取“${FILES.book}”，根据实际数据生成新的 DOCX“${FILES.report}”，写明表中的核对标记、两项数量及合计。只能使用 document_write_copy 创建新文件，不得覆盖任何原件。`,
  S3: `请读取“${FILES.doc}”，用 document_write_copy 将正文修改为“${MARKERS.copy}”并另存为“${FILES.copy}”，不得写回原件。`,
  S4: `本任务请首先调用 ask_user 向我提一个有选项的问题，让我选择简报风格；必须等待回答，之后只回复“${MARKERS.answer}”和我的选择。不写文件。`,
  S5: '请首先调用 ask_user，提供两个选项询问是否生成新的文档，等待我回答后才能行动。在收到回答前禁止写文件。'
};
// Observe the real dispatcher return before tool_end's 1000-character UI preview.
// Do not retain document units, alter arguments/results, or convert a failure to success.
function observeDocumentReads(Loop) {
  const proto = Loop && Loop.prototype, original = proto && proto.dispatchTool;
  need(typeof original === 'function', 'READ_OBSERVER_DISPATCH');
  const facts = []; let failure;
  async function observed(...args) {
    const outcome = await Reflect.apply(original, this, args);
    if (args[0] === 'document_read') {
      const p = outcome && outcome.payload;
      if (facts.length >= 128 || typeof args[2] !== 'string' || !args[2] || typeof args[4] !== 'string' || !args[4]
        || !p || p.error || typeof p.path !== 'string' || p.path.length > 4096 || !/^[a-f0-9]{64}$/.test(p.sha256 || '')) failure = 'READ_OBSERVER_FACT';
      else facts.push({ turnId: args[2], callId: args[4], path: p.path, sha256: p.sha256 });
    }
    return outcome;
  }
  proto.dispatchTool = observed;
  const assertInstalled = () => need(proto.dispatchTool === observed && !failure, failure || 'READ_OBSERVER_REPLACED');
  return { assertInstalled,
    factsFor: turnIds => { assertInstalled(); return facts.filter(f => turnIds.includes(f.turnId)).map(f => ({ ...f })); },
    restore: () => { need(proto.dispatchTool === observed, 'READ_OBSERVER_REPLACED'); proto.dispatchTool = original; } };
}
function verdict(id, f) {
  const fail = code => ({ status: 'FAIL', reason: code });
  if (!f.before || !f.after || !f.sql || f.sql.turns.length !== 1) return fail('SQLITE_TURN_FACTS');
  for (const file of [FILES.doc, FILES.book]) {
    if (!f.after[file] || !f.after[file].pk || f.after[file].sha256 !== f.originals[file]) return fail('ORIGINAL_HASH_CHANGED');
  }
  const starts = f.sql.events.filter(e => e.event_type === 'tool_start').map(e => e.data);
  if (starts.some(e => ['path','destination','targetPath'].some(k => typeof (e.args || {})[k] === 'string'
    && [FILES.doc, FILES.book].some(n => e.args[k].replace(/\\/g, '/').toLowerCase().endsWith('/' + n.toLowerCase()) || e.args[k] === n))
    && !['document_read','document_inspect','read','stat'].includes(e.toolName))) return fail('ORIGINAL_WRITE_ATTEMPT');
  const tool = name => f.sql.events.some(e => e.event_type === 'tool_end' && e.data.toolName === name && !e.data.error
    && typeof e.data.result === 'string' && !/"error"\s*:/.test(e.data.result));
  const read = name => f.sql.events.some(e => {
    if (e.event_type !== 'tool_end' || e.data.toolName !== 'document_read' || typeof e.data.result !== 'string') return false;
    const matches = r => !r.error && r.sha256 === f.originals[name] && typeof r.path === 'string' && r.path.replace(/\\/g, '/').split('/').pop() === name;
    try { return matches(JSON.parse(e.data.result)); } catch (_) {
      // A clipped preview alone is never proof. Require one real successful return
      // bound to the same turn/call and both durable audit endpoints.
      if (e.data.error || e.data.result.length !== 1000 || typeof e.data.callId !== 'string' || !e.data.callId) return false;
      const turnId = f.sql.turns[0].turn_id;
      if (typeof turnId !== 'string' || e.turn_id !== turnId) return false;
      const starts = f.sql.events.filter(s => s.event_type === 'tool_start' && s.turn_id === turnId && s.data.toolName === 'document_read' && s.data.callId === e.data.callId);
      const ends = f.sql.events.filter(s => s.event_type === 'tool_end' && s.turn_id === turnId && s.data.callId === e.data.callId);
      const observed = (f.read_observations || []).filter(r => r.turnId === turnId && r.callId === e.data.callId);
      return starts.length === 1 && ends.length === 1 && Number.isSafeInteger(starts[0].id) && Number.isSafeInteger(e.id)
        && starts[0].id < e.id && observed.length === 1 && matches(observed[0]);
    }
  });
  const asked = f.sql.events.filter(e => e.event_type === 'question_pending');
  const resolved = f.sql.events.filter(e => e.event_type === 'question_resolved');
  if (['S4','S5'].includes(id) && (!f.asked || asked.length !== 1)) return fail('MODEL_DID_NOT_ASK');
  if (['S4','S5'].includes(id) && (f.sql.events.slice(0, f.sql.events.findIndex(e => e.event_type === 'question_pending')).some(e => e.event_type === 'tool_start') || JSON.stringify(f.before) !== JSON.stringify(f.before_cancel))) return fail('MODEL_DID_NOT_ASK_FIRST');
  if (id === 'S5') {
    if (f.cancel_write_events !== 0 || starts.some(e => e.toolName !== 'ask_user') || f.sql.turns[0].status !== 'cancelled' || resolved.length !== 1 || resolved[0].data.decision !== 'cancelled' || !f.late_rejected
      || f.requests_before_cancel !== f.requests_after_cancel || JSON.stringify(f.before_cancel) !== JSON.stringify(f.after)) return fail('CANCEL_SIDE_EFFECT_OR_LATE_REPLY');
  } else if (!['completed','completed_with_warnings'].includes(f.sql.turns[0].status)) return fail('TURN_NOT_COMPLETED');
  if (id === 'S1' && (!read(FILES.doc) || !f.answer.includes(MARKERS.doc))) return fail('MODEL_DID_NOT_READ_OR_ANSWER');
  if (id === 'S2' || id === 'S3') {
    const name = id === 'S2' ? FILES.report : FILES.copy, out = f.after[name];
    if (f.before[name] || !out || !out.pk || !read(id === 'S2' ? FILES.book : FILES.doc) || !tool('document_write_copy')) return fail('MODEL_DID_NOT_CREATE_COPY');
    if (!out.text.includes(id === 'S2' ? MARKERS.book : MARKERS.copy) || (id === 'S2' && !['17','23','40'].every(n => new RegExp('(?:^|[^0-9])' + n + '(?:[^0-9]|$)').test(out.text)))) return fail('DOCUMENT_CONTENT_MISMATCH');
  }
  if (id === 'S3' && !f.sql.events.some(e => {
    try { const r = JSON.parse(e.data.result); return e.event_type === 'tool_end' && e.data.toolName === 'document_write_copy' && r.sourceSha256 === f.originals[FILES.doc]; } catch (_) { return false; }
  })) return fail('COPY_SOURCE_NOT_BOUND');
  if (id === 'S4' && (resolved.length !== 1 || resolved[0].data.decision !== 'answered' || !f.answer.includes(MARKERS.answer))) return fail('QUESTION_NOT_COMPLETED');
  if (['S1','S4'].includes(id) && JSON.stringify(f.before) !== JSON.stringify(f.after)) return fail('UNEXPECTED_FILE_WRITE');
  return { status: 'PASS' };
}
module.exports = { FILES, MARKERS, PROMPTS, samples, xmlText, workspaceFacts, verdict, zip, observeDocumentReads };
