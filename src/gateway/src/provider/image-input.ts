import { GatewayError, ErrorCode } from '../types';

export interface ModelImageInput {
  mimeType: 'image/png';
  data: string;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function hasExpectedSignature(mimeType: ModelImageInput['mimeType'], bytes: Buffer): boolean {
  return mimeType === 'image/png' && bytes.length >= PNG_SIGNATURE.length &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

/** Images exist on a request only; callers must never put them in persisted history. */
export function imageContent(text: string, images: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(images) || images.length < 1 || images.length > 2) {
    throw new GatewayError(ErrorCode.INVALID_FRAME, 'A9_IMAGE_REQUEST_LIMIT');
  }
  if (typeof text !== 'string') {
    throw new GatewayError(ErrorCode.INVALID_FRAME, 'A9_IMAGE_REQUEST_INVALID');
  }
  const parts: Array<Record<string, unknown>> = [{ type: 'text', text }];
  for (const image of images) {
    const candidate = image as Record<string, unknown>;
    const mimeType = candidate && candidate.mimeType;
    const data = candidate && candidate.data;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
        Object.keys(candidate).length !== 2 || !Object.prototype.hasOwnProperty.call(candidate, 'mimeType') ||
        !Object.prototype.hasOwnProperty.call(candidate, 'data') ||
        mimeType !== 'image/png' ||
        typeof data !== 'string' || data.length === 0 ||
        data.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3) ||
        data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      throw new GatewayError(ErrorCode.INVALID_FRAME, 'A9_IMAGE_REQUEST_INVALID');
    }
    const byteLength = data.length / 4 * 3 -
      (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (byteLength > MAX_IMAGE_BYTES) throw new GatewayError(ErrorCode.INVALID_FRAME, 'A9_IMAGE_REQUEST_LIMIT');
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length !== byteLength || !hasExpectedSignature(mimeType, bytes)) {
      throw new GatewayError(ErrorCode.INVALID_FRAME, 'A9_IMAGE_REQUEST_INVALID');
    }
    parts.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}`, detail: 'auto' } });
  }
  return parts;
}
