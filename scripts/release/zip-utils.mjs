import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const LOCAL_FILE = 0x04034b50;
const CENTRAL_FILE = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const UTF8_FLAG = 0x0800;

export function normalizeZipPath(value) {
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

export function readZipEntries(zipPath) {
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

export function readZipEntry(entry) {
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

export function extractZip(zipPath, destination, select = () => true) {
  const root = path.resolve(destination);
  for (const entry of readZipEntries(zipPath)) {
    if (!select(entry.name)) continue;
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

export function getZipEntry(zipPath, requestedName) {
  const normalized = normalizeZipPath(requestedName).replace(/\/$/, '');
  const matches = readZipEntries(zipPath).filter((entry) => !entry.directory && entry.name.replace(/\/$/, '') === normalized);
  if (matches.length !== 1) throw new Error(`ZIP_REQUIRED_ENTRY_COUNT:${normalized}:${matches.length}`);
  return readZipEntry(matches[0]);
}

export function writeDeterministicZip(sourceDirectory, outputPath, epochSeconds) {
  const files = listFiles(sourceDirectory);
  const date = dosDateTime(epochSeconds);
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  for (const relative of files) {
    const name = Buffer.from(relative, 'utf8');
    const content = fs.readFileSync(path.join(sourceDirectory, ...relative.split('/')));
    const compressed = zlib.deflateRawSync(content, { level: 9 });
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(date.time, 10);
    local.writeUInt16LE(date.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_FILE, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(date.time, 12);
    central.writeUInt16LE(date.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralOffset = offset;
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (files.length > 0xffff || centralOffset > 0xffffffff || centralSize > 0xffffffff) {
    throw new Error('ZIP64_OUTPUT_UNSUPPORTED');
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(END_OF_CENTRAL, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.concat([...localChunks, ...centralChunks, eocd]));
  return files;
}

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL) return offset;
  }
  throw new Error('ZIP_END_OF_CENTRAL_DIRECTORY_MISSING');
}

function listFiles(root) {
  const output = [];
  function visit(current, relative) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const child = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`ZIP_SYMLINK_PROHIBITED:${childRelative}`);
      if (entry.isDirectory()) visit(child, childRelative);
      else if (entry.isFile()) output.push(normalizeZipPath(childRelative));
      else throw new Error(`ZIP_SPECIAL_FILE_PROHIBITED:${childRelative}`);
    }
  }
  visit(path.resolve(root), '');
  return output.sort((a, b) => a.localeCompare(b, 'en'));
}

function dosDateTime(epochSeconds) {
  const date = new Date(Math.max(Number(epochSeconds) || 0, 315532800) * 1000);
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
  };
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
