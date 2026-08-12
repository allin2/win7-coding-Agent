import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractZip, getZipEntry, normalizeZipPath, readZipEntries, writeDeterministicZip } from '../zip-utils.mjs';

test('deterministic ZIP output is byte-identical and round-trips Unicode paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a7-zip-'));
  const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, '中文 空格'), { recursive: true });
  fs.writeFileSync(path.join(source, 'a.txt'), 'alpha\r\n', 'utf8');
  fs.writeFileSync(path.join(source, '中文 空格', 'b.bin'), Buffer.from([0, 1, 2, 255]));
  const one = path.join(root, 'one.zip');
  const two = path.join(root, 'two.zip');
  writeDeterministicZip(source, one, 1786464000);
  writeDeterministicZip(source, two, 1786464000);
  assert.deepEqual(fs.readFileSync(one), fs.readFileSync(two));
  assert.equal(getZipEntry(one, 'a.txt').toString('utf8'), 'alpha\r\n');
  assert.deepEqual(getZipEntry(one, '中文 空格/b.bin'), Buffer.from([0, 1, 2, 255]));
  const extracted = path.join(root, 'extracted');
  extractZip(one, extracted);
  assert.deepEqual(fs.readFileSync(path.join(extracted, '中文 空格', 'b.bin')), Buffer.from([0, 1, 2, 255]));
});

test('ZIP path normalization rejects absolute and traversal paths', () => {
  assert.equal(normalizeZipPath('a\\b.txt'), 'a/b.txt');
  assert.throws(() => normalizeZipPath('../escape.txt'), /ZIP_PATH_TRAVERSAL/);
  assert.throws(() => normalizeZipPath('C:\\escape.txt'), /ZIP_PATH_ABSOLUTE/);
  assert.throws(() => normalizeZipPath('/escape.txt'), /ZIP_PATH_ABSOLUTE/);
});

test('CRC corruption is detected fail-closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a7-crc-'));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'payload.txt'), 'payload', 'utf8');
  const archivePath = path.join(root, 'payload.zip');
  writeDeterministicZip(source, archivePath, 1786464000);
  const entries = readZipEntries(archivePath);
  const bytes = fs.readFileSync(archivePath);
  const entry = entries[0];
  const nameLength = bytes.readUInt16LE(entry.localOffset + 26);
  const extraLength = bytes.readUInt16LE(entry.localOffset + 28);
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  bytes[dataOffset] ^= 0xff;
  fs.writeFileSync(archivePath, bytes);
  assert.throws(() => getZipEntry(archivePath, 'payload.txt'));
});
