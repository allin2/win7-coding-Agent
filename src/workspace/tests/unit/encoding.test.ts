import { detectEncoding } from '../../src/encoding';

describe('detectEncoding', () => {
  // -----------------------------------------------------------------------
  // Empty buffer
  // -----------------------------------------------------------------------
  it('returns utf-8 for empty buffer', () => {
    const result = detectEncoding(Buffer.alloc(0));
    expect(result).toEqual({ encoding: 'utf-8', bom: false, confidence: 1 });
  });

  // -----------------------------------------------------------------------
  // BOM detection
  // -----------------------------------------------------------------------
  it('detects UTF-8 BOM (EF BB BF)', () => {
    const buf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('hello'),
    ]);
    const result = detectEncoding(buf);
    expect(result.encoding).toBe('utf-8');
    expect(result.bom).toBe(true);
    expect(result.confidence).toBe(1);
  });

  it('detects UTF-16LE BOM (FF FE)', () => {
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from([0x68, 0x00]), // 'h' in UTF-16LE
    ]);
    const result = detectEncoding(buf);
    expect(result.encoding).toBe('utf-16le');
    expect(result.bom).toBe(true);
    expect(result.confidence).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Valid UTF-8 without BOM
  // -----------------------------------------------------------------------
  it('detects plain ASCII as utf-8', () => {
    const result = detectEncoding(Buffer.from('hello world'));
    expect(result.encoding).toBe('utf-8');
    expect(result.bom).toBe(false);
    expect(result.confidence).toBe(0.95);
  });

  it('detects valid UTF-8 with multi-byte characters', () => {
    const result = detectEncoding(Buffer.from('你好世界'));
    expect(result.encoding).toBe('utf-8');
    expect(result.bom).toBe(false);
    expect(result.confidence).toBe(0.95);
  });

  it('detects UTF-8 with mixed ASCII and CJK', () => {
    const result = detectEncoding(Buffer.from('hello 你好'));
    expect(result.encoding).toBe('utf-8');
    expect(result.bom).toBe(false);
    expect(result.confidence).toBe(0.95);
  });

  // -----------------------------------------------------------------------
  // Invalid UTF-8 → ambiguous
  // -----------------------------------------------------------------------
  it('returns ambiguous for invalid UTF-8 bytes', () => {
    // 0xC0 0x80 is an overlong encoding — illegal in UTF-8.
    const buf = Buffer.from([0xc0, 0x80, 0x41]);
    const result = detectEncoding(buf);
    expect(result.encoding).toBe('ambiguous');
    expect(result.bom).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('returns ambiguous for lone continuation byte', () => {
    const buf = Buffer.from([0x80]);
    const result = detectEncoding(buf);
    expect(result.encoding).toBe('ambiguous');
    expect(result.confidence).toBe(0);
  });

  it('returns ambiguous for truncated multi-byte sequence', () => {
    // 0xE4 0xBD is the start of a 3-byte sequence but missing the 3rd byte.
    const buf = Buffer.from([0xe4, 0xbd]);
    const result = detectEncoding(buf);
    expect(result.encoding).toBe('ambiguous');
    expect(result.confidence).toBe(0);
  });

  // -----------------------------------------------------------------------
  // CRLF / LF preservation (encoding detection should not care)
  // -----------------------------------------------------------------------
  it('handles CRLF content as valid utf-8', () => {
    const result = detectEncoding(Buffer.from('line1\r\nline2\r\n'));
    expect(result.encoding).toBe('utf-8');
    expect(result.bom).toBe(false);
  });
});
