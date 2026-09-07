/**
 * @module shell-detection
 * @description Windows 7 Shell 探测与选择 (PRD §4 A9-SH01 / ADR-0089 / D-019)
 *
 * 选择合同：工作区显式设置 → Windows PowerShell 5.1 → cmd.exe。
 * PowerShell 2～4 仅 Best Effort，默认降级 CMD，用户显式强制时才使用；
 * PowerShell 缺失时使用 CMD。非 Windows Shell 只作为开发机替代，
 * 不构成 Win7 证据（result.evidence 标记 dev_host_only）。
 */
export type ShellKind = 'powershell' | 'cmd' | 'sh' | 'bash';
export interface DetectedShell {
    kind: ShellKind;
    path: string;
    version?: string;
    isDefault: boolean;
    available: boolean;
    /** win7_contract：满足正式合同；dev_host_only：开发机替代；unavailable：探测失败。 */
    evidence: 'win7_contract' | 'dev_host_only' | 'unavailable';
    notes?: string;
}
export interface ShellSelection {
    kind: ShellKind;
    path: string;
    version?: string;
    available: boolean;
    evidence: 'win7_contract' | 'dev_host_only' | 'unavailable';
    /** 记录实际选择原因，进入审计与模型上下文。 */
    reason: string;
    notes?: string;
}
export interface ShellDetectionOptions {
    /** 工作区显式配置：kind 或完整路径。 */
    workspacePreferred?: string;
    /** 用户显式强制 PowerShell（PS 2～4 Best Effort 也允许）。 */
    forcePowershell?: boolean;
    systemPath?: string;
    /** Probe children must obey the same secret boundary as execution children. */
    sensitiveValues?: readonly string[];
}
/**
 * 探测系统可用 Shell。探测本身不缓存：调用方按会话缓存探测结果。
 */
export declare function detectSystemShells(options?: ShellDetectionOptions): DetectedShell[];
/**
 * 按 A9-SH01 合同选择 Shell：
 * 工作区显式配置 → Windows PowerShell >= 5.1 → CMD（PS 2～4/缺失降级）。
 */
export declare function selectShell(options?: ShellDetectionOptions): ShellSelection;
/**
 * 兼容入口：返回首选激活 Shell。
 */
export declare function getActiveShell(options?: ShellDetectionOptions): DetectedShell;
//# sourceMappingURL=shell-detection.d.ts.map