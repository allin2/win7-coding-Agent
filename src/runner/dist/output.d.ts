/// <reference types="node" />
/// <reference types="node" />
import { CapturedStream } from './types';
export type StreamEncoding = 'utf-8' | 'cp936' | 'auto';
/**
 * Bounded byte capture which retains complete output until its cap is crossed,
 * then preserves the first and last portions while still accounting for every
 * byte supplied by the transport.
 */
export declare class OutputCapture {
    private readonly maxBytes;
    private readonly preferredEncoding;
    private readonly headLimit;
    private readonly tailLimit;
    private readonly complete;
    private head;
    private tail;
    private completeBytes;
    private _bytesRead;
    private _truncated;
    constructor(maxBytes: number, preferredEncoding?: StreamEncoding);
    get bytesRead(): number;
    get truncated(): boolean;
    append(value: Buffer | string): void;
    toResult(): CapturedStream;
}
export declare function captureText(value: string, maxBytes: number): CapturedStream;
export declare function captureBytes(value: Buffer, maxBytes: number, encoding?: StreamEncoding): CapturedStream;
//# sourceMappingURL=output.d.ts.map