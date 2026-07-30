"use strict";
/**
 * @module runner
 * @description Runner 模块公共 API 导出入口
 * @remarks 统一导出 Runner 接口、Mock 实现、审批逻辑和 Containment 探测
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockContainmentProbe = exports.checkApproval = exports.findShellMetaChar = exports.MockRunner = void 0;
// Runner 接口与 Mock 实现
var runner_1 = require("./runner");
Object.defineProperty(exports, "MockRunner", { enumerable: true, get: function () { return runner_1.MockRunner; } });
Object.defineProperty(exports, "findShellMetaChar", { enumerable: true, get: function () { return runner_1.findShellMetaChar; } });
// 审批逻辑
var approval_1 = require("./approval");
Object.defineProperty(exports, "checkApproval", { enumerable: true, get: function () { return approval_1.checkApproval; } });
// Containment 探测
var containment_1 = require("./containment");
Object.defineProperty(exports, "MockContainmentProbe", { enumerable: true, get: function () { return containment_1.MockContainmentProbe; } });
//# sourceMappingURL=index.js.map