"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureBytes = exports.captureText = exports.OutputCapture = void 0;
const util_1 = require("util");
/**
 * Bounded byte capture which retains complete output until its cap is crossed,
 * then preserves the first and last portions while still accounting for every
 * byte supplied by the transport.
 */
class OutputCapture {
    constructor(maxBytes, preferredEncoding = 'utf-8') {
        this.maxBytes = maxBytes;
        this.preferredEncoding = preferredEncoding;
        this.complete = [];
        this.head = Buffer.alloc(0);
        this.tail = Buffer.alloc(0);
        this.completeBytes = 0;
        this._bytesRead = 0;
        this._truncated = false;
        if (!Number.isInteger(maxBytes) || maxBytes < 0) {
            throw new TypeError('maxBytes must be a non-negative integer');
        }
        this.headLimit = Math.floor(maxBytes / 2);
        this.tailLimit = maxBytes - this.headLimit;
    }
    get bytesRead() {
        return this._bytesRead;
    }
    get truncated() {
        return this._truncated;
    }
    append(value) {
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
    toResult() {
        if (this._truncated) {
            // Head and tail are separated by omitted bytes, so decoding their
            // concatenation can pair bytes that were never adjacent. Align both cut
            // edges independently to preserve CP936/UTF-8 character boundaries.
            const head = decodeAtTruncationBoundary(this.head, this.preferredEncoding, 'end');
            const tail = decodeAtTruncationBoundary(this.tail, this.preferredEncoding, 'start');
            const bytesRetained = head.bytes.length + tail.bytes.length;
            const omittedBytes = this._bytesRead - bytesRetained;
            const replacementCount = countReplacements(head.text) + countReplacements(tail.text);
            const encoding = replacementCount === 0 && head.encoding === tail.encoding
                ? head.encoding
                : 'unknown';
            return {
                text: `${head.text}\n\n[output truncated: ${omittedBytes} bytes omitted; refine the command or filter its output]\n\n${tail.text}`,
                bytesRead: this._bytesRead,
                bytesRetained,
                omittedBytes,
                truncated: true,
                encoding,
                replacementCount,
            };
        }
        const retained = Buffer.concat(this.complete);
        const decodedResult = decodeBytes(retained, this.preferredEncoding);
        const replacementCount = countReplacements(decodedResult.text);
        return {
            text: decodedResult.text,
            bytesRead: this._bytesRead,
            bytesRetained: retained.length,
            omittedBytes: 0,
            truncated: false,
            encoding: replacementCount === 0 ? decodedResult.encoding : 'unknown',
            replacementCount,
        };
    }
}
exports.OutputCapture = OutputCapture;
function captureText(value, maxBytes) {
    const capture = new OutputCapture(maxBytes);
    capture.append(value);
    return capture.toResult();
}
exports.captureText = captureText;
function captureBytes(value, maxBytes, encoding = 'auto') {
    const capture = new OutputCapture(maxBytes, encoding);
    capture.append(value);
    return capture.toResult();
}
exports.captureBytes = captureBytes;
function decodeBytes(value, preferred) {
    if (preferred === 'cp936')
        return decodeCp936(value);
    const utf8 = value.toString('utf8');
    if (preferred === 'utf-8' || !utf8.includes('\uFFFD')) {
        return { text: utf8, encoding: utf8.includes('\uFFFD') ? 'unknown' : 'utf-8' };
    }
    const cp936 = decodeCp936(value);
    return cp936.text.includes('\uFFFD')
        ? { text: utf8, encoding: 'unknown' }
        : cp936;
}
function decodeAtTruncationBoundary(value, preferred, boundary) {
    const original = decodeBytes(value, preferred);
    if (!original.text.includes('\uFFFD'))
        return { bytes: value, ...original };
    // CP936 needs at most one cut byte removed; UTF-8 needs at most three.
    // `auto` may select either encoding, so it uses the larger safe bound.
    const maxTrim = preferred === 'cp936' ? 1 : 3;
    for (let trim = 1; trim <= Math.min(maxTrim, value.length); trim += 1) {
        const candidate = boundary === 'start'
            ? value.subarray(trim)
            : value.subarray(0, value.length - trim);
        const decoded = decodeBytes(candidate, preferred);
        if (!decoded.text.includes('\uFFFD'))
            return { bytes: candidate, ...decoded };
    }
    return { bytes: value, ...original };
}
function countReplacements(value) {
    return (value.match(/\uFFFD/g) ?? []).length;
}
function decodeCp936(value) {
    try {
        const text = new util_1.TextDecoder('gbk', { fatal: false }).decode(value);
        return { text, encoding: text.includes('\uFFFD') ? 'unknown' : 'cp936' };
    }
    catch (_error) {
        return { text: value.toString('utf8'), encoding: 'unknown' };
    }
}
//# sourceMappingURL=output.js.map