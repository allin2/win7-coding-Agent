'use strict';

const crypto = require('crypto');
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 4_000_000;
function fail(code) { throw Object.assign(new Error(code), { code }); }

/** No pixels are cached: preview references only contain identities and metadata. */
function createImageService({ workspaceRoot, workspace, nativeImage, containsSensitiveData }) {
  const references = new Map();
  let generation = 0;
  function normalize(buffer, metadata) {
    if (!nativeImage || typeof nativeImage.createFromBuffer !== 'function') fail('A9_IMAGE_DECODER_UNAVAILABLE');
    let image;
    try {
      image = nativeImage.createFromBuffer(buffer);
    } catch (_error) {
      fail('A9_IMAGE_DECODE_FAILED');
    }
    if (image.isEmpty()) fail('A9_IMAGE_DECODE_FAILED');
    const size = image.getSize();
    if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1 ||
        size.width * size.height > MAX_PIXELS || size.width !== metadata.width ||
        size.height !== metadata.height) fail('A9_IMAGE_SIZE_MISMATCH');
    const ratio = Math.min(1, 1280 / Math.max(size.width, size.height));
    const width = Math.max(1, Math.round(size.width * ratio));
    const height = Math.max(1, Math.round(size.height * ratio));
    const output = ratio < 1 ? image.resize({ width, height, quality: 'good' }) : image;
    const encoded = output.toPNG();
    if (!Buffer.isBuffer(encoded) || !encoded.length || encoded.length > MAX_BYTES) fail('A9_IMAGE_OUTPUT_LIMIT');
    const checked = workspace.inspectImage(encoded);
    if (checked.mimeType !== 'image/png' || checked.width !== width || checked.height !== height) fail('A9_IMAGE_OUTPUT_INVALID');
    return { encoded, width, height, resized: ratio < 1 };
  }
  async function read(target, owner, signal) {
    if (!owner || !owner.conversationId || !owner.turnId) fail('A9_IMAGE_OWNER_INVALID');
    const readGeneration = generation;
    const { metadata, buffer } = await workspace.readWorkspaceImage(workspaceRoot, target, { signal });
    if (readGeneration !== generation) fail('A9_IMAGE_SESSION_CLOSED');
    if (containsSensitiveData && containsSensitiveData(metadata.path)) fail('A9_IMAGE_PATH_SENSITIVE');
    const result = normalize(buffer, metadata);
    if (signal && signal.aborted) fail('A9_IMAGE_CANCELLED');
    if (readGeneration !== generation) fail('A9_IMAGE_SESSION_CLOSED');
    const reference = crypto.randomBytes(20).toString('hex');
    const projection = { ...metadata, reference, conversationId: owner.conversationId, turnId: owner.turnId,
      outputWidth: result.width, outputHeight: result.height, outputBytes: result.encoded.length, resized: result.resized };
    references.set(reference, projection);
    while (references.size > 32) references.delete(references.keys().next().value);
    return { metadata: projection, image: { mimeType: 'image/png', data: result.encoded.toString('base64') } };
  }
  async function preview(reference, conversationId) {
    const saved = references.get(reference);
    if (!saved || saved.conversationId !== conversationId) fail('A9_IMAGE_REFERENCE_EXPIRED');
    const previewGeneration = generation;
    const { metadata, buffer } = await workspace.readWorkspaceImage(workspaceRoot, saved.path, { sha256: saved.sha256 });
    if (previewGeneration !== generation || references.get(reference) !== saved) fail('A9_IMAGE_REFERENCE_EXPIRED');
    const result = normalize(buffer, metadata);
    if (previewGeneration !== generation || references.get(reference) !== saved) fail('A9_IMAGE_REFERENCE_EXPIRED');
    return { schemaVersion: 1, reference, width: result.width, height: result.height,
      dataUrl: `data:image/png;base64,${result.encoded.toString('base64')}` };
  }
  function clear() {
    generation += 1;
    references.clear();
  }
  return { read, preview, clear };
}

module.exports = { createImageService };
