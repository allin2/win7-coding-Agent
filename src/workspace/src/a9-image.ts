import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 4_000_000;
const MAX_IMAGE_DIMENSION = 65_535;
export interface ImageMetadata {
  schemaVersion: 1;
  path: string;
  sha256: string;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
}

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

function dimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION ||
      width * height > MAX_IMAGE_PIXELS) fail('A9_IMAGE_PIXEL_LIMIT');
  return { width, height };
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function inspectPng(bytes: Buffer): Pick<ImageMetadata, 'mimeType' | 'width' | 'height'> {
  if (bytes.length < 33 || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    fail('A9_IMAGE_INVALID');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const size = dimensions(width, height);
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!depths[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 ||
      bytes[27] !== 0 || bytes[28] > 1) fail('A9_IMAGE_FORMAT_UNSUPPORTED');

  let offset = 8;
  let ended = false;
  let data = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) fail('A9_IMAGE_INVALID');
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (kind === 'IHDR' && offset !== 8) fail('A9_IMAGE_INVALID');
    if (['acTL', 'fcTL', 'fdAT'].includes(kind)) fail('A9_IMAGE_ANIMATION_UNSUPPORTED');
    if (kind === 'IDAT') data = true;
    offset += 12 + length;
    if (kind === 'IEND') {
      if (length !== 0 || offset !== bytes.length) fail('A9_IMAGE_INVALID');
      ended = true;
      break;
    }
  }
  if (!ended || !data) fail('A9_IMAGE_INVALID');
  return { mimeType: 'image/png', ...size };
}

function jpegSegmentEnd(bytes: Buffer, offset: number, length: number): number {
  if (length < 2 || offset + length > bytes.length) fail('A9_IMAGE_INVALID');
  return offset + length;
}

function inspectJpeg(bytes: Buffer): Pick<ImageMetadata, 'mimeType' | 'width' | 'height'> {
  let offset = 2;
  let dimensionsFound: { width: number; height: number } | undefined;
  let scanSeen = false;
  let terminated = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) fail('A9_IMAGE_INVALID');
    offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) fail('A9_IMAGE_INVALID');
    const marker = bytes[offset++];

    if (marker === 0xd9) {
      if (!dimensionsFound || !scanSeen) fail('A9_IMAGE_INVALID');
      if (offset !== bytes.length) fail('A9_IMAGE_INVALID');
      terminated = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0x00 || marker === 0xd8) fail('A9_IMAGE_INVALID');

    if (offset + 2 > bytes.length) fail('A9_IMAGE_INVALID');
    const segmentEnd = jpegSegmentEnd(bytes, offset, bytes.readUInt16BE(offset));
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      // Restrict this header gate to baseline/progressive, single-frame JPEG.
      if (marker !== 0xc0 && marker !== 0xc2) fail('A9_IMAGE_FORMAT_UNSUPPORTED');
      if (dimensionsFound || segmentEnd - offset < 8) fail('A9_IMAGE_INVALID');
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      dimensionsFound = dimensions(width, height);
    }
    if (marker === 0xda) {
      if (!dimensionsFound || segmentEnd - offset < 1) fail('A9_IMAGE_INVALID');
      scanSeen = true;
      offset = segmentEnd;
      // Entropy-coded bytes are bounded by EOI, restart markers, or the next marker.
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        let next = offset + 1;
        while (next < bytes.length && bytes[next] === 0xff) next += 1;
        if (next >= bytes.length) {
          // EOI can be the final two bytes; a run of 0xff fill bytes must be followed by a marker.
          if (bytes[offset + 1] !== 0xd9 || next !== bytes.length) fail('A9_IMAGE_INVALID');
          offset = bytes.length - 2;
          break;
        }
        const scanMarker = bytes[next];
        // 0xff 0x00 is a stuffed data byte; 0xff 0xff... may be fill followed by a real marker.
        if (scanMarker === 0x00) {
          offset = next + 1;
          continue;
        }
        if (scanMarker >= 0xd0 && scanMarker <= 0xd7) {
          offset = next + 1;
          continue;
        }
        offset = next - 1;
        break;
      }
      continue;
    }
    offset = segmentEnd;
  }

  if (!terminated || !dimensionsFound) fail('A9_IMAGE_INVALID');
  return { mimeType: 'image/jpeg', ...dimensionsFound };
}

/** Header gate before handing any bytes to the existing native decoder. */
export function inspectImage(bytes: Buffer): Pick<ImageMetadata, 'mimeType' | 'width' | 'height'> {
  if (bytes.length > MAX_IMAGE_BYTES) fail('A9_IMAGE_BYTE_LIMIT');
  if (isPng(bytes)) return inspectPng(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return inspectJpeg(bytes);
  return fail('A9_IMAGE_FORMAT_UNSUPPORTED');
}

export async function readWorkspaceImage(
  root: string,
  target: string,
  options: { signal?: AbortSignal; sha256?: string } = {},
): Promise<{ metadata: ImageMetadata; buffer: Buffer }> {
  const cancelled = () => { if (options.signal?.aborted) fail('A9_IMAGE_CANCELLED'); };
  cancelled();
  if (typeof target !== 'string' || !target || target.length > 4096 || target.includes('\0')) fail('A9_IMAGE_PATH_INVALID');
  let realRoot: string;
  try {
    realRoot = await fs.promises.realpath(root);
  } catch (_error) {
    fail('A9_IMAGE_PATH_INVALID');
  }
  const requested = path.resolve(realRoot, target);
  let absolute: string;
  try {
    absolute = await fs.promises.realpath(requested);
  } catch (_error) {
    fail('A9_IMAGE_PATH_INVALID');
  }
  const relative = path.relative(realRoot, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('A9_IMAGE_OUTSIDE_WORKSPACE');
  const linkStat = await fs.promises.lstat(requested);
  if (linkStat.isSymbolicLink()) fail('A9_IMAGE_NOT_REGULAR_FILE');
  const stat = await fs.promises.lstat(absolute);
  if (!stat.isFile()) fail('A9_IMAGE_NOT_FILE');
  if (stat.size > MAX_IMAGE_BYTES) fail('A9_IMAGE_BYTE_LIMIT');
  const handle = await fs.promises.open(absolute, 'r');
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino ||
        opened.size !== stat.size || opened.mtimeMs !== stat.mtimeMs) fail('A9_IMAGE_CHANGED');
    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      cancelled();
      const read = await handle.read(buffer, offset, Math.min(64 * 1024, buffer.length - offset), offset);
      if (!read.bytesRead) fail('A9_IMAGE_CHANGED');
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    if (!after.isFile() || after.dev !== opened.dev || after.ino !== opened.ino ||
        after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) fail('A9_IMAGE_CHANGED');
    const finalPathStat = await fs.promises.lstat(absolute);
    if (!finalPathStat.isFile() || finalPathStat.dev !== opened.dev ||
        finalPathStat.ino !== opened.ino || finalPathStat.size !== opened.size ||
        finalPathStat.mtimeMs !== opened.mtimeMs) fail('A9_IMAGE_CHANGED');
    const finalRealPath = await fs.promises.realpath(absolute);
    if (finalRealPath !== absolute) fail('A9_IMAGE_CHANGED');
    cancelled();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    if (options.sha256 && options.sha256 !== sha256) fail('A9_IMAGE_CHANGED');
    const metadata: ImageMetadata = { schemaVersion: 1, path: relative.replace(/\\/g, '/'), sha256,
      bytes: buffer.length, ...inspectImage(buffer) };
    return { metadata, buffer };
  } finally { await handle.close(); }
}
