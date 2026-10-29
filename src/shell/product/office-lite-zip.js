'use strict';
const zlib = require('zlib');
const { TextDecoder } = require('util');
const MAX_BYTES = 4 * 1024 * 1024;
function fail(code = 'A9_OFFICE_ZIP_INVALID') { throw Object.assign(new Error(code), { code }); }
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
/** Decode ZIP parts in memory with limits on actual inflation, before an Office library sees them. */
function readOfficeZip(input) {
  const bytes = Buffer.from(input);
  if (bytes.length > MAX_BYTES) fail('A9_OFFICE_BYTE_LIMIT');
  if (bytes.length < 22) fail();
  let end = -1;
  for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--) {
    if (bytes.readUInt32LE(n) === 0x06054b50 && n + 22 + bytes.readUInt16LE(n + 20) === bytes.length) { end = n; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) fail();
  const count = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12), centralStart = bytes.readUInt32LE(end + 16);
  if (!count || count > 256) fail('A9_OFFICE_ZIP_LIMIT');
  if (bytes.readUInt16LE(end + 8) !== count || centralStart + centralSize !== end || centralStart === 0xffffffff) fail();
  const parts = new Map(), spans = [];
  let cursor = centralStart, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) fail();
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16), compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    if (flags & ~0x080e || flags & 1 || ![0, 8].includes(method) || bytes.readUInt16LE(cursor + 34)) fail();
    if (compressed === 0xffffffff || size > MAX_BYTES || total + size > 16 * 1024 * 1024) fail('A9_OFFICE_ZIP_LIMIT');
    if (cursor + 46 + nameLength + extra + comment > end || local + 30 > centralStart) fail();
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    let name;
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(rawName); } catch (_) { fail(); }
    if (!name || name.length > 512 || /[\x00-\x1f\\:%]/.test(name) || name.startsWith('/') ||
        name.split('/').some(p => p === '..' || p === '.') || parts.has(name)) fail();
    const unixMode = bytes.readUInt32LE(cursor + 38) >>> 16;
    if ((unixMode & 0xf000) === 0xa000) fail();
    if (bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) fail();
    const localName = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
    const dataStart = local + 30 + localName + localExtra;
    if (dataStart + compressed > centralStart || !bytes.subarray(local + 30, local + 30 + localName).equals(rawName)) fail();
    if (!(flags & 8) && (bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== size)) fail();
    let spanEnd = dataStart + compressed;
    if (flags & 8) {
      let descriptor = spanEnd;
      if (descriptor + 4 <= centralStart && bytes.readUInt32LE(descriptor) === 0x08074b50) descriptor += 4;
      if (descriptor + 12 > centralStart || bytes.readUInt32LE(descriptor) !== crc ||
          bytes.readUInt32LE(descriptor + 4) !== compressed || bytes.readUInt32LE(descriptor + 8) !== size) fail();
      spanEnd = descriptor + 12;
    }
    if (spans.some(([a, b]) => local < b && spanEnd > a)) fail();
    spans.push([local, spanEnd]);
    let decoded;
    try { decoded = method === 0 ? Buffer.from(bytes.subarray(dataStart, dataStart + compressed)) :
      zlib.inflateRawSync(bytes.subarray(dataStart, dataStart + compressed), { maxOutputLength: Math.min(MAX_BYTES, 16 * 1024 * 1024 - total) }); }
    catch (_) { fail('A9_OFFICE_ZIP_LIMIT_OR_INVALID'); }
    if (decoded.length !== size || crc32(decoded) !== crc) fail();
    total += decoded.length;
    if (name.endsWith('/') && size !== 0) fail();
    parts.set(name, decoded);
    cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== end) fail();
  return parts;
}
module.exports = { readOfficeZip, crc32, MAX_BYTES };
