export type TokenEstimateSource = 'provided' | 'conservative_utf8';

export interface TokenEstimate {
  tokens: number;
  source: TokenEstimateSource;
}

/**
 * Tokenizer-independent fallback. ASCII runs receive the familiar 4 chars per
 * token estimate; every non-ASCII UTF-8 byte counts as one token. This is
 * intentionally conservative for Chinese and mixed-language project rules.
 */
export function estimateContextTokens(content: string, provided?: number): TokenEstimate {
  if (provided !== undefined) {
    if (!Number.isInteger(provided) || provided < 1) {
      throw new Error('Provided token estimate must be a positive integer');
    }
    return { tokens: provided, source: 'provided' };
  }
  let asciiChars = 0;
  let nonAsciiBytes = 0;
  for (const character of content) {
    if (character.codePointAt(0)! <= 0x7f) asciiChars += 1;
    else nonAsciiBytes += Buffer.byteLength(character, 'utf8');
  }
  return {
    tokens: Math.max(1, Math.ceil(asciiChars / 4) + nonAsciiBytes),
    source: 'conservative_utf8',
  };
}
