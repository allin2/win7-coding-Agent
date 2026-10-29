const fs = require('fs');
const os = require('os');
const path = require('path');
const { createImageService } = require('../../product/a9-image-service') as {
  createImageService: (options: any) => {
    read: (target: string, owner: any, signal?: AbortSignal) => Promise<any>;
    preview: (reference: string, conversationId: string) => Promise<any>;
    clear: () => void;
  };
};

const workspace = require('../../../workspace/dist') as {
  inspectImage: (bytes: Buffer) => { mimeType: string; width: number; height: number };
  readWorkspaceImage: (...args: any[]) => Promise<{ metadata: any; buffer: Buffer }>;
};

function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = Buffer.alloc(4);
  const chunks = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat(chunks);
}

function chunk(kind: string, data: Buffer): Buffer {
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  output.write(kind, 4, 4, 'ascii');
  data.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, 8 + data.length)), 8 + data.length);
  return output;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

describe('A9-42 image service lifecycle and normalization', () => {
  let root: string;
  let owner: { conversationId: string; turnId: string };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-42-image-service-'));
    owner = { conversationId: 'conversation-1', turnId: 'turn-1' };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  function fakeNativeImage(size = { width: 1, height: 1 }, outputBytes?: number) {
    const calls: any[] = [];
    const pngOutput = png(size.width, size.height);
    return {
      calls,
      createFromBuffer(buffer: Buffer) {
        calls.push({ type: 'create', bytes: buffer.length });
        return {
          isEmpty: () => false,
          getSize: () => size,
          resize: (options: any) => {
            calls.push({ type: 'resize', options });
            return {
              toPNG: () => outputBytes === undefined
                ? png(options.width, options.height)
                : Buffer.alloc(outputBytes, 1),
            };
          },
          toPNG: () => outputBytes === undefined ? pngOutput : Buffer.alloc(outputBytes, 1),
        };
      },
    };
  }

  it('normalizes a real workspace image to bounded PNG and keeps only a reference in metadata', async () => {
    fs.writeFileSync(path.join(root, 'image.png'), png(1600, 900));
    const decoder = fakeNativeImage({ width: 1600, height: 900 });
    const service = createImageService({
      workspaceRoot: root, workspace, nativeImage: decoder,
    });
    const result = await service.read('image.png', owner);
    expect(result.metadata).toMatchObject({
      path: 'image.png',
      width: 1600,
      height: 900,
      outputWidth: 1280,
      outputHeight: 720,
      outputBytes: png(1280, 720).length,
      resized: true,
      conversationId: 'conversation-1',
      turnId: 'turn-1',
    });
    expect(result.metadata.reference).toMatch(/^[a-f0-9]{40}$/);
    expect(result.metadata).not.toHaveProperty('data');
    expect(result.metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.image).toEqual({ mimeType: 'image/png', data: png(1280, 720).toString('base64') });
    expect(decoder.calls).toEqual([
      { type: 'create', bytes: fs.statSync(path.join(root, 'image.png')).size },
      { type: 'resize', options: { width: 1280, height: 720, quality: 'good' } },
    ]);
  });

  it('enforces the output byte limit and decoder/header dimension consistency', async () => {
    fs.writeFileSync(path.join(root, 'image.png'), png(2, 2));
    const oversizedOutput = createImageService({
      workspaceRoot: root, workspace, nativeImage: fakeNativeImage({ width: 2, height: 2 }, 2 * 1024 * 1024 + 1),
    });
    await expect(oversizedOutput.read('image.png', owner)).rejects.toMatchObject({ code: 'A9_IMAGE_OUTPUT_LIMIT' });

    const mismatch = createImageService({
      workspaceRoot: root, workspace, nativeImage: fakeNativeImage({ width: 3, height: 2 }),
    });
    await expect(mismatch.read('image.png', owner)).rejects.toMatchObject({ code: 'A9_IMAGE_SIZE_MISMATCH' });

    const empty = createImageService({
      workspaceRoot: root, workspace,
      nativeImage: { createFromBuffer: () => ({ isEmpty: () => true, getSize: () => ({ width: 1, height: 1 }), toPNG: () => Buffer.alloc(1) }) },
    });
    await expect(empty.read('image.png', owner)).rejects.toMatchObject({ code: 'A9_IMAGE_DECODE_FAILED' });

    const throwing = createImageService({
      workspaceRoot: root, workspace,
      nativeImage: { createFromBuffer: () => { throw new Error('decoder failed'); } },
    });
    await expect(throwing.read('image.png', owner)).rejects.toMatchObject({ code: 'A9_IMAGE_DECODE_FAILED' });
  });

  it('returns preview data only for a live matching session and rejects expired/foreign references', async () => {
    fs.writeFileSync(path.join(root, 'image.png'), png(10, 10));
    const service = createImageService({
      workspaceRoot: root, workspace, nativeImage: fakeNativeImage({ width: 10, height: 10 }),
    });
    const result = await service.read('image.png', owner);
    const preview = await service.preview(result.metadata.reference, owner.conversationId);
    expect(preview).toEqual({
      schemaVersion: 1, reference: result.metadata.reference, width: 10, height: 10,
      dataUrl: pngDataUrl(png(10, 10)),
    });
    await expect(service.preview('unknown-reference', owner.conversationId))
      .rejects.toMatchObject({ code: 'A9_IMAGE_REFERENCE_EXPIRED' });
    await expect(service.preview(result.metadata.reference, 'conversation-2'))
      .rejects.toMatchObject({ code: 'A9_IMAGE_REFERENCE_EXPIRED' });
    service.clear();
    await expect(service.preview(result.metadata.reference, owner.conversationId))
      .rejects.toMatchObject({ code: 'A9_IMAGE_REFERENCE_EXPIRED' });
  });

  it('rejects a preview when the source hash or dimensions changed after read', async () => {
    fs.writeFileSync(path.join(root, 'image.png'), png(10, 10));
    const service = createImageService({
      workspaceRoot: root, workspace, nativeImage: fakeNativeImage({ width: 10, height: 10 }),
    });
    const result = await service.read('image.png', owner);
    fs.writeFileSync(path.join(root, 'image.png'), png(11, 10));
    await expect(service.preview(result.metadata.reference, owner.conversationId))
      .rejects.toMatchObject({ code: 'A9_IMAGE_CHANGED' });
  });

  it('does not publish a reference when clear runs during read or preview', async () => {
    fs.writeFileSync(path.join(root, 'image.png'), png(10, 10));
    const actualRead = workspace.readWorkspaceImage;
    let releaseRead: () => void = () => {};
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    jest.spyOn(workspace, 'readWorkspaceImage').mockImplementation(async (...args: any[]) => {
      await readGate;
      return actualRead(...args);
    });
    const service = createImageService({
      workspaceRoot: root, workspace, nativeImage: fakeNativeImage({ width: 10, height: 10 }),
    });
    const pending = service.read('image.png', owner);
    service.clear();
    releaseRead();
    await expect(pending).rejects.toMatchObject({ code: 'A9_IMAGE_SESSION_CLOSED' });

    jest.restoreAllMocks();
    fs.writeFileSync(path.join(root, 'image.png'), png(10, 10));
    const second = createImageService({
      workspaceRoot: root, workspace, nativeImage: fakeNativeImage({ width: 10, height: 10 }),
    });
    const saved = await second.read('image.png', owner);
    let releasePreview: () => void = () => {};
    const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
    jest.spyOn(workspace, 'readWorkspaceImage').mockImplementation(async (...args: any[]) => {
      await previewGate;
      return actualRead(...args);
    });
    const pendingPreview = second.preview(saved.metadata.reference, owner.conversationId);
    second.clear();
    releasePreview();
    await expect(pendingPreview).rejects.toMatchObject({ code: 'A9_IMAGE_REFERENCE_EXPIRED' });
  });

  it('rejects missing owners, sensitive paths and unavailable decoders', async () => {
    fs.writeFileSync(path.join(root, 'secret.png'), png(1, 1));
    const service = createImageService({
      workspaceRoot: root, workspace, nativeImage: fakeNativeImage(),
      containsSensitiveData: (value: string) => value.includes('secret'),
    });
    await expect(service.read('secret.png', owner)).rejects.toMatchObject({ code: 'A9_IMAGE_PATH_SENSITIVE' });
    await expect(service.read('secret.png', { conversationId: '', turnId: 'turn-1' }))
      .rejects.toMatchObject({ code: 'A9_IMAGE_OWNER_INVALID' });
    const unavailable = createImageService({ workspaceRoot: root, workspace, nativeImage: null });
    await expect(unavailable.read('secret.png', owner)).rejects.toMatchObject({ code: 'A9_IMAGE_DECODER_UNAVAILABLE' });
  });
});
