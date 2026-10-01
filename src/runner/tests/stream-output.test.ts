import { SafeOutputStream, secretVariants } from '../src/stream-output';

const identity = (s: string) => s;
function splitProject(bytes: Buffer, encoding: 'utf-8' | 'cp936' | 'utf-16le', split: number, secrets: string[] = []) {
  const stream = new SafeOutputStream(encoding, secretVariants(secrets), identity);
  return { text: stream.push(bytes.subarray(0, split)) + stream.push(bytes.subarray(split)) + stream.finish(), stream };
}
describe('A9-30 incremental decode/redaction', () => {
  for (const [encoding, bytes] of [
    ['utf-8', Buffer.from('中文 tick\r\n下一行')],
    ['utf-16le', Buffer.from('\uFEFF中文 tick\r\n下一行', 'utf16le')],
    ['cp936', Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 32, 116, 105, 99, 107, 13, 10])],
  ] as const) {
    it(`${encoding} retains every byte/CR-LF boundary`, () => {
      for (let n = 0; n <= bytes.length; n++) expect(splitProject(bytes, encoding, n).text).toBe(encoding === 'cp936' ? '中文 tick\r\n' : '中文 tick\r\n下一行');
    });
  }
  const secret = 'sentinel-秘密-abc123';
  for (const value of secretVariants([secret])) {
    it(`redacts all split points of variant ${Buffer.byteLength(value)}`, () => {
      const bytes = Buffer.from(`before ${value} after\n`);
      for (let n = 0; n <= bytes.length; n++) expect(splitProject(bytes, 'utf-8', n, [secret]).text).not.toContain(value);
    });
  }
  it.each(['Authorization: Bearer hidden-token\n', 'api_key="hidden-token"\n', 'password=hidden-token&ok=1', 'https://user:hidden-token@host/path?token=hidden-token\n'])('shields unknown credentials at every split: %s', (text) => {
    const bytes = Buffer.from(text);
    for (let n = 0; n <= bytes.length; n++) expect(splitProject(bytes, 'utf-8', n).text).not.toContain('hidden-token');
  });
  it('displays safe output without a newline before EOF', () => {
    const s = new SafeOutputStream('utf-8', [], identity);
    expect(s.push(Buffer.from('tick 1'))).toBe('tick 1');
  });
  it('masks an unbounded secret value without accumulating it', () => {
    const s = new SafeOutputStream('utf-8', [], identity);
    expect(s.push(Buffer.from('password='))).not.toContain('value');
    for (let i = 0; i < 100; i++) { const text = s.push(Buffer.from('value'.repeat(4096))); expect(text).not.toContain('value'); expect(text.length).toBeLessThanOrEqual('***redacted***'.length); }
    expect(s.finish()).toBe('');
  });
  it.each(['utf-8', 'utf-16le'] as const)('does not change encoding after malformed %s', (encoding) => {
    const s = new SafeOutputStream(encoding, [], identity);
    s.push(Buffer.from([0xff])); s.finish();
    expect(s.warning).toBe('A9_OUTPUT_ENCODING_ERROR');
  });
  it('rejects oversized frozen secret sets before execution', () => expect(() => secretVariants(['x'.repeat(65536)])).toThrow('A9_OUTPUT_SECRET_SET_LIMIT'));
});

it('normalizes mixed percent-escape hex case before releasing a known secret', () => {
  const secret = '中文 secret';
  const escaped = encodeURIComponent(secret).replace(/%[0-9A-F]{2}/g, (v, i) => i % 2 ? v.toLowerCase() : v);
  const s = new SafeOutputStream('utf-8', secretVariants([secret]), identity);
  let output = ''; for (const c of escaped) output += s.push(Buffer.from(c)); output += s.finish();
  expect(output).toBe('***redacted***');
});

it.each(['password="hidden secret value"\n', 'api_key="hidden \\"quoted\\" secret value"\n', 'private_key=-----BEGIN PRIVATE KEY-----\nhidden secret value\n-----END PRIVATE KEY-----\n'])('shields quoted/multiline credential values at every byte split', (text) => {
  const bytes = Buffer.from(text);
  for (let n = 0; n <= bytes.length; n++) {
    const out = splitProject(bytes, 'utf-8', n).text;
    expect(out).not.toContain('hidden'); expect(out).not.toContain('secret value');
  }
});


it.each(['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY', 'OPENSSH PRIVATE KEY'])('holds standalone %s armor and body at every split', (kind) => {
  const text = `before -----BEGIN ${kind}-----\nhidden secret body\n-----END ${kind}----- after\n`;
  const bytes = Buffer.from(text);
  for (let n = 0; n <= bytes.length; n++) {
    const out = splitProject(bytes, 'utf-8', n).text;
    expect(out).not.toContain('hidden'); expect(out).toContain('after');
  }
  const stream = new SafeOutputStream('utf-8', [], identity);
  let out = ''; for (const b of bytes) out += stream.push(Buffer.from([b])); out += stream.finish();
  expect(out).not.toContain('hidden'); expect(out).toContain('after');
});
