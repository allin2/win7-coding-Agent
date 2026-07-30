/**
 * @module runner/approval
 * @description 三档审批逻辑（ADR-0030）
 * @remarks
 * - READ_ONLY: 始终批准（只读操作无需审批）
 * - WORKSPACE_WRITE: 需显式审批（工作区写操作）
 * - FULL_ACCESS: 始终拒绝（ADR-0030 明令不做）
 */
/**
 * ApprovalLevel — 本地镜像类型（与 @win7-agent/core 保持兼容）
 * @remarks 避免跨模块编译依赖，值语义与 core/types.ts 完全一致
 */
export declare enum ApprovalLevel {
    READ_ONLY = "read_only",
    WORKSPACE_WRITE = "workspace_write",
    FULL_ACCESS = "full_access"
}
/**
 * 审批检查结果
 */
export interface ApprovalResult {
    /** 是否批准执行 */
    approved: boolean;
    /** 拒绝或批准原因说明 */
    reason?: string;
}
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
export declare function checkApproval(level: ApprovalLevel, requestedLevel: ApprovalLevel): ApprovalResult;
//# sourceMappingURL=approval.d.ts.map