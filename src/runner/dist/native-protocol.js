"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNativeHelperResponse = void 0;
function parseNativeHelperResponse(line, expectedRequestId) {
    let value;
    try {
        value = JSON.parse(line);
    }
    catch (_error) {
        throw new Error('Helper response is not valid JSON');
    }
    if (!value || typeof value !== 'object')
        throw new Error('Helper response is not an object');
    const response = value;
    if (response.schema_version !== 1 || response.requestId !== expectedRequestId ||
        (response.type !== 'execution_result' && response.type !== 'error')) {
        throw new Error('Helper response envelope or request binding is invalid');
    }
    return response;
}
exports.parseNativeHelperResponse = parseNativeHelperResponse;
//# sourceMappingURL=native-protocol.js.map