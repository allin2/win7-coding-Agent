import { CapturedStream } from './types';

/**
 * Bounded byte capture which retains complete output until its cap is crossed,
 * then preserves the first and last portions while still accounting for every
 * byte supplied by the transport.
 */
export class OutputCapture {
  private readonly headLimit: number;
  private readonly tailLimit: number;
  private readonly complete: Buffer[] = [];
  private head = Buffer.alloc(0);
  private tail = Buffer.alloc(0);
  private completeBytes = 0;
  private _bytesRead = 0;
  private _truncated = false;

  constructor(private readonly maxBytes: number) {
    if (!Number.isInteger(maxBytes) || maxBytes < 0) {
      throw new TypeError('maxBytes must be a non-negative integer');
    }
    this.headLimit = Math.floor(maxBytes / 2);
    this.tailLimit = maxBytes - this.headLimit;
  }

  get bytesRead(): number {
    return this._bytesRead;
  }

  get truncated(): boolean {
    return this._truncated;
  }

  append(value: Buffer | string): void {
    const chunk = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
    this._bytesRead += chunk.length;
    if (!this._truncated && this.completeBytes + chunk.length <= this.maxBytes) {
      this.complete.push(chunk);
      this.completeBytes += chunk.length;
      return;
    }

    if (!this._truncated) {
      const combined = Buffer.concat([...this.complete, chunk]);
      this.head = combined.subarray(0, this.headLimit);
      this.tail = this.tailLimit === 0
        ? Buffer.alloc(0)
        : combined.subarray(Math.max(0, combined.length - this.tailLimit));
      this.complete.length = 0;
      this.completeBytes = 0;
      this._truncated = true;
      return;
    }

    if (this.tailLimit > 0) {
      const tailAndChunk = Buffer.concat([this.tail, chunk]);
      this.tail = tailAndChunk.subarray(Math.max(0, tailAndChunk.length - this.tailLimit));
    }
  }

  toResult(): CapturedStream {
    const retained = this._truncated
      ? Buffer.concat([this.head, this.tail])
      : Buffer.concat(this.complete);
    const omittedBytes = this._bytesRead - retained.length;
    const decoded = retained.toString('utf8');
    const replacementCount = (decoded.match(/\uFFFD/g) ?? []).length;
    const text = this._truncated
      ? `${this.head.toString('utf8')}\n\n[output truncated: ${omittedBytes} bytes omitted; refine the command or filter its output]\n\n${this.tail.toString('utf8')}`
      : decoded;
    return {
      text,
      bytesRead: this._bytesRead,
      bytesRetained: retained.length,
      omittedBytes,
      truncated: this._truncated,
      encoding: replacementCount === 0 ? 'utf-8' : 'unknown',
      replacementCount,
    };
  }
}

export function captureText(value: string, maxBytes: number): CapturedStream {
  const capture = new OutputCapture(maxBytes);
  capture.append(value);
  return capture.toResult();
}
