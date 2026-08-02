import * as crypto from 'crypto';

export interface ToolObservation {
  schemaVersion: '1.0';
  content: string;
  truncated: boolean;
  originalChars: number;
  sha256: string;
  state: 'full' | 'folded';
  recovery?: string;
}

/** Turns untrusted tool output into a bounded model observation. */
export function createToolObservation(value: unknown, maxChars = 16_384): ToolObservation {
  if (!Number.isInteger(maxChars) || maxChars < 128) {
    throw new TypeError('Tool observation maxChars must be an integer >= 128');
  }
  const original = safeJson(value);
  const truncated = original.length > maxChars;
  const digest = sha256(original);
  const marker = `\n…[truncated; sha256=${digest}]…\n`;
  const available = Math.max(0, maxChars - marker.length);
  const headChars = Math.floor(available * 0.75);
  const content = truncated
    ? `${original.slice(0, headChars)}${marker}${original.slice(-(available - headChars))}`
    : original;
  return {
    schemaVersion: '1.0',
    content,
    truncated,
    originalChars: original.length,
    sha256: digest,
    state: 'full',
  };
}

export function foldToolObservation(
  observation: ToolObservation,
  toolCallId: string,
): ToolObservation {
  return {
    ...observation,
    state: 'folded',
    content: `[tool output folded; call=${toolCallId}; sha256=${observation.sha256}. Re-run the bounded tool to refresh it.]`,
    recovery: 'Re-run the original bounded tool; compare the new digest before treating it as the same snapshot.',
  };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return JSON.stringify({ serializationError: 'Tool result is not JSON serializable' });
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
