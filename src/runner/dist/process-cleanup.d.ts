/**
 * @module process-cleanup
 * @description 进程树终止与清理 (C08 / ADR-0089)
 *
 * 返回值必须真实：只有能证明目标 PID 已不存在时才报告 success。
 * taskkill/PID kill 是尽力回收，不是安全隔离；调用方必须保留
 * containment 事实而非把本模块描述为沙箱等价物。
 */
export interface KillResult {
    success: boolean;
    error?: string;
    /** 回收方式：仅描述事实，不宣称隔离等价。 */
    method: 'taskkill_tree' | 'posix_signal' | 'already_gone';
}
export declare function parseWindowsProcessTable(output: string, rootPid: number): number[];
/**
 * 终止指定 PID 及其整棵子进程树。返回值反映可证明的清理结果：
 * - success=true + method=already_gone：进程已不存在；
 * - success=true + method=taskkill_tree/posix_signal：终止命令成功且 PID 已消失；
 * - success=false：无法证明清理完成，调用方必须报告残留风险。
 */
export declare function killProcessTree(pid: number): Promise<KillResult>;
//# sourceMappingURL=process-cleanup.d.ts.map