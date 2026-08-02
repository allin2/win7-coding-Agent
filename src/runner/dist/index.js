"use strict";
/**
 * @module runner
 * @description Runner 模块公共 API 导出入口
 * @remarks 统一导出 Runner 接口、Mock 实现、审批逻辑和 Containment 探测
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockContainmentProbe = exports.checkApproval = exports.fingerprintApprovalRequest = exports.buildRunApprovalRequest = exports.ApprovalLedger = exports.findProhibitedShellHost = exports.UnavailableRunner = exports.MockRunner = exports.captureText = exports.OutputCapture = exports.RunnerErrorCode = exports.RunnerError = void 0;
// 类型定义
var types_1 = require("./types");
Object.defineProperty(exports, "RunnerError", { enumerable: true, get: function () { return types_1.RunnerError; } });
Object.defineProperty(exports, "RunnerErrorCode", { enumerable: true, get: function () { return types_1.RunnerErrorCode; } });
var output_1 = require("./output");
Object.defineProperty(exports, "OutputCapture", { enumerable: true, get: function () { return output_1.OutputCapture; } });
Object.defineProperty(exports, "captureText", { enumerable: true, get: function () { return output_1.captureText; } });
// Runner 接口与 Mock 实现
var runner_1 = require("./runner");
Object.defineProperty(exports, "MockRunner", { enumerable: true, get: function () { return runner_1.MockRunner; } });
Object.defineProperty(exports, "UnavailableRunner", { enumerable: true, get: function () { return runner_1.UnavailableRunner; } });
Object.defineProperty(exports, "findProhibitedShellHost", { enumerable: true, get: function () { return runner_1.findProhibitedShellHost; } });
// 审批逻辑
var approval_1 = require("./approval");
Object.defineProperty(exports, "ApprovalLedger", { enumerable: true, get: function () { return approval_1.ApprovalLedger; } });
Object.defineProperty(exports, "buildRunApprovalRequest", { enumerable: true, get: function () { return approval_1.buildRunApprovalRequest; } });
Object.defineProperty(exports, "fingerprintApprovalRequest", { enumerable: true, get: function () { return approval_1.fingerprintApprovalRequest; } });
Object.defineProperty(exports, "checkApproval", { enumerable: true, get: function () { return approval_1.checkApproval; } });
// Containment 探测
var containment_1 = require("./containment");
Object.defineProperty(exports, "MockContainmentProbe", { enumerable: true, get: function () { return containment_1.MockContainmentProbe; } });
//# sourceMappingURL=index.js.map