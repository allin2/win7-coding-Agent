import * as http from 'http';
import {
  ErrorCode,
  GatewayError,
  OpenAICompatibleProvider,
} from '../src';
import { imageContent } from '../src/provider/image-input';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////'
  + '2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAA'
  + 'AAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAA'
  + 'AP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/a'
  + 'AAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgB'
  + 'AQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAA'
  + 'AAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAU'
  + 'EQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAA'
  + 'AAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//'
  + 'xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==',
  'base64',
);
const base64 = (bytes: Buffer) => bytes.toString('base64');

function startFixture(): Promise<{ baseUrl: string; requests: any[]; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const requests: any[] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
      req.on('end', () => {
        requests.push(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'seen image' }, finish_reason: 'stop' }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as import('net').AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

describe('A9-42 OpenAI-compatible image request contract', () => {
  it('accepts only normalized PNG payloads with matching decoded signatures', () => {
    expect(imageContent('look', [
      { mimeType: 'image/png', data: base64(PNG) },
      { mimeType: 'image/png', data: base64(PNG) },
    ])).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${base64(PNG)}`, detail: 'auto' } },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${base64(PNG)}`, detail: 'auto' } },
    ]);

    for (const images of [
      [],
      [{ mimeType: 'image/png', data: base64(PNG) }, { mimeType: 'image/png', data: base64(PNG) }, { mimeType: 'image/png', data: base64(PNG) }],
    ]) {
      expect(() => imageContent('look', images)).toThrow(GatewayError);
    }
    expect(() => imageContent('look', [{ mimeType: 'image/gif', data: base64(PNG) }])).toThrow('A9_IMAGE_REQUEST_INVALID');
    expect(() => imageContent('look', [{ mimeType: 'image/png', data: base64(JPEG) }])).toThrow('A9_IMAGE_REQUEST_INVALID');
    expect(() => imageContent('look', [{ mimeType: 'image/jpeg', data: base64(JPEG) }])).toThrow('A9_IMAGE_REQUEST_INVALID');
    expect(() => imageContent('look', [{ mimeType: 'image/png', data: 'not-base64!' }])).toThrow('A9_IMAGE_REQUEST_INVALID');
    expect(() => imageContent('look', [{ mimeType: 'image/png', data: base64(PNG), extra: true }])).toThrow('A9_IMAGE_REQUEST_INVALID');
    expect(() => imageContent('look', [{ mimeType: 'image/png', url: 'https://example.invalid/image.png' }]))
      .toThrow('A9_IMAGE_REQUEST_INVALID');
    expect(() => imageContent('look', [{ mimeType: 'image/png', data: 'https://example.invalid/image.png' }]))
      .toThrow('A9_IMAGE_REQUEST_INVALID');
    expect(() => imageContent('look', [{ mimeType: 'image/png', data: `data:image/png;base64,${base64(PNG)}` }]))
      .toThrow('A9_IMAGE_REQUEST_INVALID');
  });

  it('rejects bytes above 2 MiB and invalid base64 before serialization', () => {
    const oversized = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    expect(() => imageContent('look', [{ mimeType: 'image/png', data: base64(oversized) }]))
      .toThrow(expect.objectContaining({ code: ErrorCode.INVALID_FRAME }));
    expect(() => imageContent('look', [{ mimeType: 'image/png', data: 'AAAA=' }])).toThrow('A9_IMAGE_REQUEST_INVALID');
    expect(() => imageContent('look', [{ mimeType: 'image/png', data: 'AB==' }])).toThrow('A9_IMAGE_REQUEST_INVALID');
  });

  it('maps image messages into actual Chat Completions content parts and preserves text-only messages', () => {
    const provider = new OpenAICompatibleProvider({ baseUrl: 'https://example.invalid', model: 'vision-model' });
    const built = provider.buildOpenAIMessages([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'look', images: [{ mimeType: 'image/png', data: base64(PNG) }] },
      { role: 'assistant', content: 'seen' },
    ]);
    expect(built).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: [
        { type: 'text', text: 'look' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64(PNG)}`, detail: 'auto' } },
      ] },
      { role: 'assistant', content: 'seen' },
    ]);
    expect(JSON.stringify(built)).not.toContain('images');
  });

  it('serializes the image content parts on the actual OpenAI-compatible HTTP request', async () => {
    const fixture = await startFixture();
    try {
      const provider = new OpenAICompatibleProvider({ baseUrl: fixture.baseUrl, model: 'vision-model' });
      const chunks: string[] = [];
      const response = await provider.sendStreamRequest({
        id: 'image-request',
        model: 'vision-model',
        messages: [{ role: 'user', content: 'look', images: [{ mimeType: 'image/png', data: base64(PNG) }] }],
      }, (chunk) => chunks.push(chunk.content));
      expect(response.content).toBe('seen image');
      expect(chunks).toEqual(['seen image']);
      expect(fixture.requests).toHaveLength(1);
      expect(fixture.requests[0].messages[0]).toEqual({
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64(PNG)}`, detail: 'auto' } },
        ],
      });
      expect(fixture.requests[0].messages[0]).not.toHaveProperty('images');
    } finally {
      await fixture.close();
    }
  });

  it('rejects image data on non-user roles, extra fields, more than two total images, and non-string content', () => {
    const provider = new OpenAICompatibleProvider({ baseUrl: 'https://example.invalid', model: 'vision-model' });
    const image = { mimeType: 'image/png' as const, data: base64(PNG) };
    expect(() => provider.buildOpenAIMessages([
      { role: 'assistant', content: 'bad', images: [image] } as any,
    ])).toThrow('A9_IMAGE_ROLE_INVALID');
    expect(() => provider.buildOpenAIMessages([
      { role: 'user', content: 'bad', images: [image], toolName: 'x' } as any,
    ])).toThrow('A9_IMAGE_REQUEST_INVALID');
    expect(() => provider.buildOpenAIMessages([
      { role: 'user', content: 'one', images: [image] },
      { role: 'user', content: 'two', images: [image, image] },
    ])).toThrow('A9_IMAGE_REQUEST_LIMIT');
    expect(() => provider.buildOpenAIMessages([
      { role: 'user', content: 42 as any, images: [image] },
    ])).toThrow('A9_IMAGE_REQUEST_INVALID');
  });
});
