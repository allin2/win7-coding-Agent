import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  inspectImage,
  readWorkspaceImage,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
} from '../../src';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const REAL_JPEG = fs.readFileSync(path.resolve(
  __dirname, '../../../../docs/reports/2026-08/a8_03_renderer_static_1280x720.jpg',
));

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(kind: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(kind, 4, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function png(width: number, height: number, options: {
  bitDepth?: number;
  colorType?: number;
  animation?: boolean;
  data?: boolean;
  trailing?: Buffer;
} = {}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = options.bitDepth ?? 8;
  ihdr[9] = options.colorType ?? 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const chunks = [PNG_SIGNATURE, pngChunk('IHDR', ihdr)];
  if (options.animation) {
    const animation = Buffer.alloc(8);
    animation.writeUInt32BE(1, 0);
    animation.writeUInt32BE(0, 4);
    chunks.push(pngChunk('acTL', animation));
  }
  if (options.data !== false) chunks.push(pngChunk('IDAT', Buffer.from([0, 0, 0, 0])));
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));
  if (options.trailing) chunks.push(options.trailing);
  return Buffer.concat(chunks);
}

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const length = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([length >> 8, length & 0xff]), payload]);
}

function sof(marker: number, width: number, height: number): Buffer {
  const payload = Buffer.from([8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return jpegSegment(marker, payload);
}

function jpeg(options: {
  width?: number;
  height?: number;
  firstMarker?: number;
  secondFrame?: boolean;
  secondWidth?: number;
  secondHeight?: number;
  secondMarker?: number;
  entropy?: Buffer;
  eoi?: boolean;
  trailing?: Buffer;
} = {}): Buffer {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  const scan = jpegSegment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
  const entropy = options.entropy ?? Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]);
  const parts = [
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])),
    sof(options.firstMarker ?? 0xc0, width, height),
    scan,
    entropy,
  ];
  if (options.secondFrame) {
    parts.push(sof(options.secondMarker ?? 0xc0, options.secondWidth ?? width, options.secondHeight ?? height));
  }
  if (options.eoi !== false) parts.push(Buffer.from([0xff, 0xd9]));
  if (options.trailing) parts.push(options.trailing);
  return Buffer.concat(parts);
}

function expectCode(code: string): object {
  return expect.objectContaining({ code });
}

describe('A9-42 workspace image byte inspection', () => {
  it('accepts bounded real PNG/JPEG headers and rejects format spoofing', () => {
    expect(inspectImage(REAL_PNG)).toEqual({ mimeType: 'image/png', width: 1, height: 1 });
    expect(inspectImage(REAL_JPEG)).toEqual({ mimeType: 'image/jpeg', width: 1280, height: 720 });
    expect(inspectImage(png(640, 480))).toEqual({ mimeType: 'image/png', width: 640, height: 480 });
    expect(inspectImage(jpeg({ width: 800, height: 600 }))).toEqual({ mimeType: 'image/jpeg', width: 800, height: 600 });
    expect(() => inspectImage(Buffer.from('GIF89a', 'ascii'))).toThrow('A9_IMAGE_FORMAT_UNSUPPORTED');
    expect(() => inspectImage(Buffer.concat([PNG_SIGNATURE, Buffer.alloc(24)]))).toThrow('A9_IMAGE_INVALID');
  });

  it('enforces 2 MiB and 4,000,000 pixel limits before native decoding', () => {
    expect(() => inspectImage(Buffer.alloc(MAX_IMAGE_BYTES + 1))).toThrow('A9_IMAGE_BYTE_LIMIT');
    expect(() => inspectImage(png(2001, 2000))).toThrow('A9_IMAGE_PIXEL_LIMIT');
    expect(() => inspectImage(jpeg({ width: 2001, height: 2000 }))).toThrow('A9_IMAGE_PIXEL_LIMIT');
    expect(MAX_IMAGE_PIXELS).toBe(4_000_000);
  });

  it('accepts standard PNG depths and rejects animation, missing data, invalid depths and trailing bytes', () => {
    expect(() => inspectImage(png(1, 1, { animation: true }))).toThrow('A9_IMAGE_ANIMATION_UNSUPPORTED');
    expect(() => inspectImage(png(1, 1, { data: false }))).toThrow('A9_IMAGE_INVALID');
    expect(inspectImage(png(1, 1, { bitDepth: 16 }))).toMatchObject({ mimeType: 'image/png', width: 1 });
    expect(inspectImage(png(1, 1, { bitDepth: 1, colorType: 0 }))).toMatchObject({ mimeType: 'image/png' });
    expect(() => inspectImage(png(1, 1, { bitDepth: 3 }))).toThrow('A9_IMAGE_FORMAT_UNSUPPORTED');
    expect(() => inspectImage(png(1, 1, { trailing: Buffer.from('tail') }))).toThrow('A9_IMAGE_INVALID');
  });

  it('walks JPEG scans to EOI and rejects malformed, multi-frame and unsupported frame shapes', () => {
    expect(() => inspectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])))
      .toThrow(expect.objectContaining({ code: 'A9_IMAGE_INVALID' }));
    expect(inspectImage(jpeg())).toEqual({ mimeType: 'image/jpeg', width: 1, height: 1 });
    expect(inspectImage(jpeg({ entropy: Buffer.from([0x12, 0xff, 0xd0, 0x34, 0xff, 0x00]) })))
      .toEqual({ mimeType: 'image/jpeg', width: 1, height: 1 });
    expect(() => inspectImage(jpeg({ secondFrame: true }))).toThrow('A9_IMAGE_INVALID');
    expect(() => inspectImage(jpeg({ secondFrame: true, secondMarker: 0xc2, secondWidth: 2, secondHeight: 2 })))
      .toThrow('A9_IMAGE_INVALID');
    expect(() => inspectImage(jpeg({ width: 1, height: 1, eoi: false }))).toThrow('A9_IMAGE_INVALID');
    expect(() => inspectImage(jpeg({ trailing: Buffer.from('tail') }))).toThrow('A9_IMAGE_INVALID');
    expect(() => inspectImage(jpeg({ entropy: Buffer.from([0x12, 0xff]), eoi: false }))).toThrow('A9_IMAGE_INVALID');
    expect(() => inspectImage(jpeg({ firstMarker: 0xc1 }))).toThrow('A9_IMAGE_FORMAT_UNSUPPORTED');
  });
});

describe('A9-42 workspace image file identity', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-42-image-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reads a real regular PNG with a relative path, hash, dimensions and normalized separators', async () => {
    fs.mkdirSync(path.join(root, '中文 空格'));
    fs.writeFileSync(path.join(root, '中文 空格', '图片.png'), png(640, 480));
    const result = await readWorkspaceImage(root, '中文 空格/图片.png');
    expect(result.metadata).toMatchObject({
      path: '中文 空格/图片.png',
      mimeType: 'image/png',
      width: 640,
      height: 480,
      bytes: fs.statSync(path.join(root, '中文 空格', '图片.png')).size,
    });
    expect(result.metadata.sha256).toBe(crypto.createHash('sha256').update(result.buffer).digest('hex'));
  });

  it('rejects outside, symlink and non-regular paths', async () => {
    fs.writeFileSync(path.join(root, 'image.png'), png(1, 1));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-42-image-outside-'));
    fs.writeFileSync(path.join(outside, 'outside.png'), png(1, 1));
    fs.symlinkSync(path.join(root, 'image.png'), path.join(root, 'inside-link.png'));
    fs.symlinkSync(path.join(outside, 'outside.png'), path.join(root, 'outside-link.png'));
    fs.mkdirSync(path.join(root, 'directory'));
    try {
      await expect(readWorkspaceImage(root, '../' + path.basename(outside) + '/outside.png'))
        .rejects.toMatchObject(expectCode('A9_IMAGE_OUTSIDE_WORKSPACE'));
      await expect(readWorkspaceImage(root, 'inside-link.png')).rejects.toMatchObject(expectCode('A9_IMAGE_NOT_REGULAR_FILE'));
      await expect(readWorkspaceImage(root, 'outside-link.png')).rejects.toMatchObject(expectCode('A9_IMAGE_OUTSIDE_WORKSPACE'));
      await expect(readWorkspaceImage(root, 'directory')).rejects.toMatchObject(expectCode('A9_IMAGE_NOT_FILE'));
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects oversized input and cancellation without opening a handle', async () => {
    fs.writeFileSync(path.join(root, 'large.png'), Buffer.alloc(MAX_IMAGE_BYTES + 1));
    await expect(readWorkspaceImage(root, 'large.png')).rejects.toMatchObject(expectCode('A9_IMAGE_BYTE_LIMIT'));
    const controller = new AbortController();
    controller.abort();
    const open = jest.spyOn(fs.promises, 'open');
    await expect(readWorkspaceImage(root, 'large.png', { signal: controller.signal }))
      .rejects.toMatchObject(expectCode('A9_IMAGE_CANCELLED'));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('rejects append or hash changes during a read and closes the handle', async () => {
    const target = path.join(root, 'changing.png');
    const bytes = png(640, 480);
    fs.writeFileSync(target, bytes);
    const actualOpen = fs.promises.open.bind(fs.promises);
    let closed = false;
    jest.spyOn(fs.promises, 'open').mockImplementation(async (...args: any[]) => {
      const handle = await (actualOpen as any)(...args);
      const read = handle.read.bind(handle);
      const close = handle.close.bind(handle);
      let changed = false;
      handle.read = (async (...readArgs: any[]) => {
        const result = await read(...readArgs);
        if (!changed) {
          changed = true;
          fs.appendFileSync(target, Buffer.from('changed'));
        }
        return result;
      }) as any;
      handle.close = async () => { closed = true; await close(); };
      return handle;
    });
    await expect(readWorkspaceImage(root, 'changing.png')).rejects.toMatchObject(expectCode('A9_IMAGE_CHANGED'));
    expect(closed).toBe(true);
    jest.restoreAllMocks();

    fs.writeFileSync(target, bytes);
    await expect(readWorkspaceImage(root, 'changing.png', {
      sha256: crypto.createHash('sha256').update('different').digest('hex'),
    })).rejects.toMatchObject(expectCode('A9_IMAGE_CHANGED'));
  });

  it('rejects path replacement and truncation during a read', async () => {
    const target = path.join(root, 'changing.png');
    const bytes = png(640, 480);
    const actualOpen = fs.promises.open.bind(fs.promises);
    for (const mode of ['replace', 'truncate'] as const) {
      fs.writeFileSync(target, bytes);
      let closed = false;
      jest.spyOn(fs.promises, 'open').mockImplementation(async (...args: any[]) => {
        const handle = await (actualOpen as any)(...args);
        const read = handle.read.bind(handle);
        const close = handle.close.bind(handle);
        let changed = false;
        handle.read = (async (...readArgs: any[]) => {
          const result = await read(...readArgs);
          if (!changed) {
            changed = true;
            if (mode === 'replace') {
              fs.renameSync(target, path.join(root, 'original.png'));
              fs.writeFileSync(target, bytes);
            } else {
              fs.truncateSync(target, 1);
            }
          }
          return result;
        }) as any;
        handle.close = async () => { closed = true; await close(); };
        return handle;
      });
      await expect(readWorkspaceImage(root, 'changing.png')).rejects.toMatchObject(expectCode('A9_IMAGE_CHANGED'));
      expect(closed).toBe(true);
      jest.restoreAllMocks();
    }
  });

  it('accepts a real JPEG through the same file and hash path', async () => {
    fs.writeFileSync(path.join(root, 'photo.jpg'), jpeg({ width: 800, height: 600 }));
    const result = await readWorkspaceImage(root, 'photo.jpg');
    expect(result.metadata).toMatchObject({ mimeType: 'image/jpeg', width: 800, height: 600 });
  });

  it('reads real PNG and JPEG bytes through the same regular-file path', async () => {
    fs.writeFileSync(path.join(root, 'real.png'), REAL_PNG);
    fs.writeFileSync(path.join(root, 'real.jpg'), REAL_JPEG);
    await expect(readWorkspaceImage(root, 'real.png')).resolves.toMatchObject({
      metadata: { mimeType: 'image/png', width: 1, height: 1 },
    });
    await expect(readWorkspaceImage(root, 'real.jpg')).resolves.toMatchObject({
      metadata: { mimeType: 'image/jpeg', width: 1280, height: 720 },
    });
  });
});
