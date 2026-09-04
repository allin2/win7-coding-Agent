"use strict";
/**
 * @module runner
 * @description Runner 模块公共 API 导出入口
 * @remarks 统一导出 Runner 接口、Mock 实现、审批逻辑和 Containment 探测
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.killProcessTree = exports.BackgroundProcessManager = exports.getActiveShell = exports.selectShell = exports.detectSystemShells = exports.createTrustedShellLoopAdapter = exports.decodeShellBytes = exports.buildTrustedShellInvocation = exports.TrustedShellRunner = exports.MockContainmentProbe = exports.checkApproval = exports.fingerprintApprovalRequest = exports.buildRunApprovalRequest = exports.ApprovalLedger = exports.NativeRunner = exports.StdioHelperTransport = exports.parseNativeHelperResponse = exports.ProfileResolutionError = exports.ExecutableProfileRegistry = exports.validateRequest = exports.findProhibitedShellHost = exports.UnavailableRunner = exports.MockRunner = exports.captureBytes = exports.captureText = exports.OutputCapture = exports.RunnerErrorCode = exports.RunnerError = void 0;
// 类型定义
var types_1 = require("./types");
Object.defineProperty(exports, "RunnerError", { enumerable: true, get: function () { return types_1.RunnerError; } });
Object.defineProperty(exports, "RunnerErrorCode", { enumerable: true, get: function () { return types_1.RunnerErrorCode; } });
var output_1 = require("./output");
Object.defineProperty(exports, "OutputCapture", { enumerable: true, get: function () { return output_1.OutputCapture; } });
Object.defineProperty(exports, "captureText", { enumerable: true, get: function () { return output_1.captureText; } });
Object.defineProperty(exports, "captureBytes", { enumerable: true, get: function () { return output_1.captureBytes; } });
// Runner 接口与 Mock 实现
var runner_1 = require("./runner");
Object.defineProperty(exports, "MockRunner", { enumerable: true, get: function () { return runner_1.MockRunner; } });
Object.defineProperty(exports, "UnavailableRunner", { enumerable: true, get: function () { return runner_1.UnavailableRunner; } });
Object.defineProperty(exports, "findProhibitedShellHost", { enumerable: true, get: function () { return runner_1.findProhibitedShellHost; } });
Object.defineProperty(exports, "validateRequest", { enumerable: true, get: function () { return runner_1.validateRequest; } });
var profiles_1 = require("./profiles");
Object.defineProperty(exports, "ExecutableProfileRegistry", { enumerable: true, get: function () { return profiles_1.ExecutableProfileRegistry; } });
Object.defineProperty(exports, "ProfileResolutionError", { enumerable: true, get: function () { return profiles_1.ProfileResolutionError; } });
var native_protocol_1 = require("./native-protocol");
Object.defineProperty(exports, "parseNativeHelperResponse", { enumerable: true, get: function () { return native_protocol_1.parseNativeHelperResponse; } });
var native_transport_1 = require("./native-transport");
Object.defineProperty(exports, "StdioHelperTransport", { enumerable: true, get: function () { return native_transport_1.StdioHelperTransport; } });
var native_runner_1 = require("./native-runner");
Object.defineProperty(exports, "NativeRunner", { enumerable: true, get: function () { return native_runner_1.NativeRunner; } });
// 审批逻辑
var approval_1 = require("./approval");
Object.defineProperty(exports, "ApprovalLedger", { enumerable: true, get: function () { return approval_1.ApprovalLedger; } });
Object.defineProperty(exports, "buildRunApprovalRequest", { enumerable: true, get: function () { return approval_1.buildRunApprovalRequest; } });
Object.defineProperty(exports, "fingerprintApprovalRequest", { enumerable: true, get: function () { return approval_1.fingerprintApprovalRequest; } });
Object.defineProperty(exports, "checkApproval", { enumerable: true, get: function () { return approval_1.checkApproval; } });
// Containment 探测
var containment_1 = require("./containment");
Object.defineProperty(exports, "MockContainmentProbe", { enumerable: true, get: function () { return containment_1.MockContainmentProbe; } });
// A9 TrustedShellRunner 与后台进程管理
var trusted_shell_runner_1 = require("./trusted-shell-runner");
Object.defineProperty(exports, "TrustedShellRunner", { enumerable: true, get: function () { return trusted_shell_runner_1.TrustedShellRunner; } });
Object.defineProperty(exports, "buildTrustedShellInvocation", { enumerable: true, get: function () { return trusted_shell_runner_1.buildTrustedShellInvocation; } });
Object.defineProperty(exports, "decodeShellBytes", { enumerable: true, get: function () { return trusted_shell_runner_1.decodeShellBytes; } });
var trusted_shell_adapter_1 = require("./trusted-shell-adapter");
Object.defineProperty(exports, "createTrustedShellLoopAdapter", { enumerable: true, get: function () { return trusted_shell_adapter_1.createTrustedShellLoopAdapter; } });
var shell_detection_1 = require("./shell-detection");
Object.defineProperty(exports, "detectSystemShells", { enumerable: true, get: function () { return shell_detection_1.detectSystemShells; } });
Object.defineProperty(exports, "selectShell", { enumerable: true, get: function () { return shell_detection_1.selectShell; } });
Object.defineProperty(exports, "getActiveShell", { enumerable: true, get: function () { return shell_detection_1.getActiveShell; } });
var background_process_manager_1 = require("./background-process-manager");
Object.defineProperty(exports, "BackgroundProcessManager", { enumerable: true, get: function () { return background_process_manager_1.BackgroundProcessManager; } });
var process_cleanup_1 = require("./process-cleanup");
Object.defineProperty(exports, "killProcessTree", { enumerable: true, get: function () { return process_cleanup_1.killProcessTree; } });
//# sourceMappingURL=index.js.map