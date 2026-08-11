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
        const retained = this._truncated
            ? Buffer.concat([this.head, this.tail])
            : Buffer.concat(this.complete);
        const omittedBytes = this._bytesRead - retained.length;
        const decodedResult = decodeBytes(retained, this.preferredEncoding);
        const decoded = decodedResult.text;
        const replacementCount = (decoded.match(/\uFFFD/g) ?? []).length;
        const text = this._truncated
            ? `${decodeBytes(this.head, this.preferredEncoding).text}\n\n[output truncated: ${omittedBytes} bytes omitted; refine the command or filter its output]\n\n${decodeBytes(this.tail, this.preferredEncoding).text}`
            : decoded;
        return {
            text,
            bytesRead: this._bytesRead,
            bytesRetained: retained.length,
            omittedBytes,
            truncated: this._truncated,
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