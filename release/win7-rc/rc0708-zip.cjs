'use strict';

// Reading half of scripts/release/zip-utils.mjs ported to CommonJS so the
// RC0708 lifecycle kit stays self-contained when executed through the
// packaged electron.exe in ELECTRON_RUN_AS_NODE mode. Byte-level behavior
// (CRC verification, path normalization, escape protection) must stay in
// sync with the dev-side module; scripts/release/test/rc0708-lifecycle.test.mjs
// cross-checks both implementations against writeDeterministicZip output.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOCAL_FILE = 0x04034b50;
const CENTRAL_FILE = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const UTF8_FLAG = 0x0800;

function normalizeZipPath(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('ZIP_PATH_INVALID');
  const replaced = value.replace(/\\/g, '/');
  if (/^(?:\/|[A-Za-z]:\/)/.test(replaced)) throw new Error(`ZIP_PATH_ABSOLUTE:${value}`);
  const directory = replaced.endsWith('/');
  const parts = replaced.split('/').filter((item) => item.length > 0);
  if (parts.length === 0 || parts.some((item) => item === '.' || item === '..')) {
    throw new Error(`ZIP_PATH_TRAVERSAL:${value}`);
  }
  return parts.join('/') + (directory ? '/' : '');
}

function readZipEntries(zipPath) {
  const archive = fs.readFileSync(zipPath);
  const eocd = findEndOfCentralDirectory(archive);
  const diskNumber = archive.readUInt16LE(eocd + 4);
  const centralDisk = archive.readUInt16LE(eocd + 6);
  const entryCount = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64_OR_MULTIDISK_UNSUPPORTED');
  }
  if (centralOffset + centralSize > archive.length) throw new Error('ZIP_CENTRAL_DIRECTORY_TRUNCATED');
  const entries = [];
  const names = new Set();
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== CENTRAL_FILE) {
      throw new Error('ZIP_CENTRAL_ENTRY_INVALID');
    }
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const crc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > archive.length) throw new Error('ZIP_ENTRY_NAME_TRUNCATED');
    const rawName = archive.subarray(nameStart, nameEnd);
    const decoded = rawName.toString((flags & UTF8_FLAG) !== 0 ? 'utf8' : 'latin1');
    const name = normalizeZipPath(decoded);
    if (names.has(name)) throw new Error(`ZIP_DUPLICATE_ENTRY:${name}`);
    names.add(name);
    if ((flags & 0x0001) !== 0) throw new Error(`ZIP_ENCRYPTED_ENTRY:${name}`);
    if (method !== 0 && method !== 8) throw new Error(`ZIP_COMPRESSION_UNSUPPORTED:${name}:${method}`);
    entries.push({ archive, name, method, crc, compressedSize, size, localOffset, directory: name.endsWith('/') });
    cursor = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(entry) {
  const archive = entry.archive;
  const offset = entry.localOffset;
  if (offset + 30 > archive.length || archive.readUInt32LE(offset) !== LOCAL_FILE) {
    throw new Error(`ZIP_LOCAL_ENTRY_INVALID:${entry.name}`);
  }
  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > archive.length) throw new Error(`ZIP_ENTRY_TRUNCATED:${entry.name}`);
  const compressed = archive.subarray(start, end);
  const content = entry.method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
  if (content.length !== entry.size) throw new Error(`ZIP_ENTRY_SIZE_MISMATCH:${entry.name}`);
  if (crc32(content) !== entry.crc) throw new Error(`ZIP_ENTRY_CRC_MISMATCH:${entry.name}`);
  return content;
}

function extractZip(zipPath, destination) {
  const root = path.resolve(destination);
  for (const entry of readZipEntries(zipPath)) {
    const target = path.resolve(root, entry.name);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`ZIP_PATH_ESCAPE:${entry.name}`);
    if (entry.directory) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, readZipEntry(entry));
  }
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL) return offset;
  }
  throw new Error('ZIP_END_OF_CENTRAL_DIRECTORY_MISSING');
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

module.exports = { normalizeZipPath, readZipEntries, readZipEntry, extractZip, crc32 };
