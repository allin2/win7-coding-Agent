/**
 * @module trusted-shell-adapter
 * @description TrustedShellRunner ↔ A9AgentLoop 运行时适配器 (A9-02)
 *
 * 以结构化类型实现 core 模块的 A9RunnerPort 合同（runner 模块不依赖 core），
 * 完整传递 command、cwd、timeoutMs、background、shell kind/path、AbortSignal
 * 与环境覆盖；不引入固定 60 秒默认硬超时。
 */
/// <reference types="node" />
import { TrustedShellRunner } from './trusted-shell-runner';
/** 与 @win7-agent/core 的 A9RunnerExecutionOptions 结构兼容。 */
export interface LoopRunnerOptions {
    cwd?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    background?: boolean;
    shellKind?: string;
    shellPath?: string;
    envOverlay?: Record<string, string>;
    maxOutputBytes?: number;
}
/** 与 @win7-agent/core 的 A9RunnerExecutionResult 结构兼容。 */
export interface LoopRunnerResult {
    status?: 'exited' | 'timeout' | 'cancelled' | 'failed' | 'background_started';
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
    truncated?: boolean;
    cancelled?: boolean;
    rawStdoutBytes?: number;
    rawStderrBytes?: number;
    logPaths?: {
        stdout: string;
        stderr: string;
    };
    backgroundHandle?: string;
    processTreeReaped?: boolean;
    residueRisk?: boolean;
    softDurationExceeded?: boolean;
}
export interface TrustedShellLoopAdapter {
    execute(command: string, options?: LoopRunnerOptions): Promise<LoopRunnerResult>;
}
/**
 * 创建 A9AgentLoop 可直接使用的 TrustedShellRunner 适配器。
 * 附带后台进程 poll 透传，供产品层暴露句柄操作。
 */
export interface TrustedShellLoopAdapterHandle extends TrustedShellLoopAdapter {
    pollBackground(handleId: string): {
        handleId: string;
        status: 'starting' | 'running' | 'exited' | 'stopped' | 'failed';
        exitCode: number | null;
        stdoutDelta: string;
        stderrDelta: string;
        totalStdoutLines: number;
        totalStderrLines: number;
        logsDropped: {
            stdout: number;
            stderr: number;
        };
    };
    stopBackground(handleId: string): Promise<unknown>;
}
export declare function createTrustedShellLoopAdapter(runner: TrustedShellRunner): TrustedShellLoopAdapterHandle;
//# sourceMappingURL=trusted-shell-adapter.d.ts.map