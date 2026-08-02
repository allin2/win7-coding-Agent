/**
 * @module runner/approval
 * @description 三档审批逻辑（ADR-0030）
 * @remarks
 * - READ_ONLY: 始终批准（只读操作无需审批）
 * - WORKSPACE_WRITE: 需显式审批（工作区写操作）
 * - 外部传入 full_access: 始终拒绝（ADR-0030 明令不做）
 */
import { ApprovalExecutionBinding, RunRequest } from './types';
/**
 * ApprovalLevel — 本地镜像类型（与 @win7-agent/core 保持兼容）
 * @remarks 避免跨模块编译依赖，值语义与 core/types.ts 完全一致
 */
export declare enum ApprovalLevel {
    READ_ONLY = "read_only",
    WORKSPACE_WRITE = "workspace_write"
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
export interface ApprovalGrant {
    sessionId: string;
    subject: string;
    request: unknown;
    previewSha256: string;
    baselineSha256: string;
    ttlMs?: number;
}
export interface ApprovalRecord {
    schemaVersion: '1.0';
    approvalId: string;
    sessionId: string;
    subject: string;
    requestSha256: string;
    previewSha256: string;
    baselineSha256: string;
    issuedAt: string;
    expiresAt: string;
    consumedAt?: string;
}
export interface ApprovalValidation {
    valid: boolean;
    code?: 'APPROVAL_REQUIRED' | 'APPROVAL_INVALID' | 'APPROVAL_REPLAYED';
    reason?: string;
    record?: ApprovalRecord;
}
/**
 * Execution-boundary approval ledger. Persistence belongs to the State
 * adapter; this class freezes request/baseline semantics and one-time use.
 */
export declare class ApprovalLedger {
    private readonly records;
    issue(grant: ApprovalGrant): ApprovalRecord;
    validateAndConsume(binding: ApprovalExecutionBinding | undefined, request: unknown, nowMs?: number): ApprovalValidation;
    get(approvalId: string): ApprovalRecord | undefined;
}
export declare function buildRunApprovalRequest(request: RunRequest): unknown;
export declare function fingerprintApprovalRequest(request: unknown): string;
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
 * checkApproval('full_access', 'full_access');
 * // => { approved: false, reason: 'FULL_ACCESS is prohibited by ADR-0030' }
 * ```
 */
export declare function checkApproval(level: ApprovalLevel | string, requestedLevel: ApprovalLevel | string): ApprovalResult;
//# sourceMappingURL=approval.d.ts.map