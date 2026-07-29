// Protocol versioning, codec, stream framing

import { ErrorCode, GatewayError } from '../types';

// ── Version ──────────────────────────────────────────────────────────────────

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(v: string): SemVer {
  const parts = v.split('.');
  if (parts.length !== 3) {
    throw new GatewayError(ErrorCode.DECODE_ERROR, `Invalid version string: ${v}`);
  }
  const [major, minor, patch] = parts.map(Number);
  if ([major, minor, patch].some(isNaN)) {
    throw new GatewayError(ErrorCode.DECODE_ERROR, `Invalid version string: ${v}`);
  }
  return { major, minor, patch };
}

export function versionToString(v: SemVer): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * Check if two versions are compatible (same major version).
 */
export function isCompatible(a: SemVer, b: SemVer): boolean {
  return a.major === b.major;
}

/**
 * Negotiate protocol version: pick the highest compatible version.
 * Returns the client version if compatible, otherwise throws.
 */
export function negotiateVersion(clientVersion: string, serverVersion: string): SemVer {
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);

  if (!isCompatible(client, server)) {
    throw new GatewayError(
      ErrorCode.PROTOCOL_VERSION_MISMATCH,
      `Incompatible versions: client=${clientVersion}, server=${serverVersion}`,
    );
  }

  // Pick the lower minor.patch within the same major
  if (client.minor < server.minor) return client;
  if (client.minor > server.minor) return server;
  return { major: client.major, minor: client.minor, patch: Math.min(client.patch, server.patch) };
}

// ── Frames ───────────────────────────────────────────────────────────────────

export interface Frame {
  type: string;
  payload: string;
}

const FRAME_DELIMITER = '\n';

/**
 * Encode a frame as a single line: `type:payload\n`
 */
export function encodeFrame(frame: Frame): string {
  return `${frame.type}:${frame.payload}${FRAME_DELIMITER}`;
}

/**
 * Parse a single frame line. Returns null for empty lines.
 */
export function parseFrame(line: string): Frame | null {
  const trimmed = line.replace(/\r?\n$/, '');
  if (trimmed.length === 0) return null;
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) {
    throw new GatewayError(ErrorCode.INVALID_FRAME, `Malformed frame: ${trimmed}`);
  }
  return {
    type: trimmed.slice(0, colonIdx),
    payload: trimmed.slice(colonIdx + 1),
  };
}

/**
 * Split a buffer into frames, handling partial lines.
 * Returns parsed frames and any remaining incomplete data.
 */
export function splitFrames(buffer: string): { frames: Frame[]; remainder: string } {
  const lines = buffer.split(FRAME_DELIMITER);
  const remainder = lines.pop() ?? '';
  const frames: Frame[] = [];
  for (const line of lines) {
    const frame = parseFrame(line);
    if (frame) frames.push(frame);
  }
  return { frames, remainder };
}

// ── SSE ──────────────────────────────────────────────────────────────────────

export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
}

/**
 * Parse a Server-Sent Events (SSE) stream block.
 * Input is one or more SSE blocks separated by double newlines.
 */
export function parseSSE(raw: string): SSEEvent[] {
  const blocks = raw.split(/\n\n+/).filter(Boolean);
  const events: SSEEvent[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    let event: SSEEvent | undefined;
    let dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        if (!event) event = { data: '' };
        event.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        if (!event) event = { data: '' };
        dataLines.push(line.slice(5).trim());
      } else if (line.startsWith('id:')) {
        if (!event) event = { data: '' };
        event.id = line.slice(3).trim();
      }
      // ignore comment lines starting with ':'
    }

    if (event) {
      event.data = dataLines.join('\n');
      events.push(event);
    }
  }

  return events;
}
