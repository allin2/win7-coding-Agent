"use strict";
/**
 * @module runner/approval
 * @description 三档审批逻辑（ADR-0030）
 * @remarks
 * - READ_ONLY: 始终批准（只读操作无需审批）
 * - WORKSPACE_WRITE: 需显式审批（工作区写操作）
 * - FULL_ACCESS: 始终拒绝（ADR-0030 明令不做）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkApproval = exports.ApprovalLevel = void 0;
/**
 * ApprovalLevel — 本地镜像类型（与 @win7-agent/core 保持兼容）
 * @remarks 避免跨模块编译依赖，值语义与 core/types.ts 完全一致
 */
var ApprovalLevel;
(function (ApprovalLevel) {
    ApprovalLevel["READ_ONLY"] = "read_only";
    ApprovalLevel["WORKSPACE_WRITE"] = "workspace_write";
    ApprovalLevel["FULL_ACCESS"] = "full_access";
})(ApprovalLevel || (exports.ApprovalLevel = ApprovalLevel = {}));
/**
 * 检查操作是否获得审批
 * @param level - 当前会话的审批级别（已获授权的最高级别）
 * @param requestedLevel - 本次请求的操作所需的审批级别
 * @returns 审批结果
 *
 * @example
 * ```typescript
 * // 只读操作始终批准
 * checkApproval(ApprovalLevel.READ_ONLY, ApprovalLevel.READ_ONLY);
 * // => { approved: true, reason: 'Read-only operations are always approved' }
 *
 * // 写操作需显式审批
 * checkApproval(ApprovalLevel.WORKSPACE_WRITE, ApprovalLevel.WORKSPACE_WRITE);
 * // => { approved: true, reason: 'Workspace write approved' }
 *
 * // 完全访问始终拒绝
 * checkApproval(ApprovalLevel.FULL_ACCESS, ApprovalLevel.FULL_ACCESS);
 * // => { approved: false, reason: 'FULL_ACCESS is prohibited by ADR-0030' }
 * ```
 */
function checkApproval(level, requestedLevel) {
    // FULL_ACCESS 始终拒绝（ADR-0030 明令不做）
    if (requestedLevel === ApprovalLevel.FULL_ACCESS) {
        return {
            approved: false,
            reason: 'FULL_ACCESS is prohibited by ADR-0030 — unrestricted operations are not supported',
        };
    }
    // 如果当前会话级别为 FULL_ACCESS，也拒绝（防止越权）
    if (level === ApprovalLevel.FULL_ACCESS) {
        return {
            approved: false,
            reason: 'Session has FULL_ACCESS level which is prohibited by ADR-0030',
        };
    }
    // READ_ONLY: 只读操作始终批准
    if (requestedLevel === ApprovalLevel.READ_ONLY) {
        return {
            approved: true,
            reason: 'Read-only operations are always approved',
        };
    }
    // WORKSPACE_WRITE: 需显式审批
    if (requestedLevel === ApprovalLevel.WORKSPACE_WRITE) {
        // 当前会话级别必须至少为 WORKSPACE_WRITE 才能批准
        if (level === ApprovalLevel.WORKSPACE_WRITE) {
            return {
                approved: true,
                reason: 'Workspace write operation approved with explicit authorization',
            };
        }
        // 当前级别为 READ_ONLY 时，写操作被拒绝
        return {
            approved: false,
            reason: 'Workspace write requires explicit approval — current session level is READ_ONLY',
        };
    }
    // 未知级别，fail-closed
    return {
        approved: false,
        reason: `Unknown approval level: "${requestedLevel}" — denied by fail-closed policy`,
    };
}
exports.checkApproval = checkApproval;
//# sourceMappingURL=approval.js.map