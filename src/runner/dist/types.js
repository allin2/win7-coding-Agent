"use strict";
/**
 * @module runner/types
 * @description Runner 接口层类型定义 — 执行结果、配置、请求与 Containment 状态
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunnerError = exports.RunnerErrorCode = void 0;
var RunnerErrorCode;
(function (RunnerErrorCode) {
    RunnerErrorCode["CONTAINMENT_UNAVAILABLE"] = "CONTAINMENT_UNAVAILABLE";
    RunnerErrorCode["SHELL_HOST_PROHIBITED"] = "SHELL_HOST_PROHIBITED";
    RunnerErrorCode["INVALID_REQUEST"] = "INVALID_REQUEST";
    RunnerErrorCode["APPROVAL_REQUIRED"] = "APPROVAL_REQUIRED";
    RunnerErrorCode["APPROVAL_INVALID"] = "APPROVAL_INVALID";
    RunnerErrorCode["APPROVAL_REPLAYED"] = "APPROVAL_REPLAYED";
    RunnerErrorCode["SENSITIVE_ENVIRONMENT_REJECTED"] = "SENSITIVE_ENVIRONMENT_REJECTED";
})(RunnerErrorCode || (exports.RunnerErrorCode = RunnerErrorCode = {}));
class RunnerError extends Error {
    constructor(code, message, recommendedAction) {
        super(message);
        this.code = code;
        this.recommendedAction = recommendedAction;
        this.name = 'RunnerError';
        Object.setPrototypeOf(this, RunnerError.prototype);
    }
}
exports.RunnerError = RunnerError;
//# sourceMappingURL=types.js.map