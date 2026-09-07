/**
 * @module trusted-shell-runner
 * @description A9 TrustedShellRunner 核心实现 (PRD §4 / ADR-0089 / D-019)
 *
 * 合同要点：
 * - PowerShell 5.1 使用 UTF-16LE Base64 `-EncodedCommand`；CMD 使用 `/d /s /c`
 *   + windowsVerbatimArguments 保证空格/中文 cwd 与退出码正确；
 * - stdout/stderr 按原始字节计数并写入有界原始日志，解码按 UTF-8 → CP936 探测；
 * - 取消/超时后检查 killProcessTree 的真实返回值，只有可证明清理成功才写
 *   processTreeReaped:true；否则标记 residueRisk 并停止后续自动执行；
 * - taskkill/PID kill 是尽力回收，不是隔离等价物（containment:'none'）；
 * - 可选接入 D-013 Job Object helper（helperTransport）：接入时命令在 Job Object
 *   内执行并以 helper 证明为清理依据；
 * - 后台进程启动失败绝不返回成功，状态不把“正在运行”写成 exited。
 */
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { ShellKind } from './shell-detection';
import { BackgroundProcessHandle, BackgroundProcessManager } from './background-process-manager';
import { HelperTransport } from './native-transport';
export interface TrustedShellRequest {
    id?: string;
    command: string;
    cwd?: string;
    shellKind?: ShellKind;
    shellPath?: string;
    envOverlay?: Record<string, string>;
    /** 可选任务级 deadline；未设置时不施加固定硬超时（A9 对 C08 的局部取代）。 */
    timeoutMs?: number;
    /** 软时长提示阈值：超过后只提示不终止。 */
    softDurationMs?: number;
    maxOutputBytes?: number;
    maxOutputLines?: number;
    background?: boolean;
    signal?: AbortSignal;
}
export interface TrustedShellTermination {
    requested: boolean;
    processTreeReaped: boolean;
    /** none：直接子进程 + taskkill/PID kill 尽力回收，非隔离；job_object：经 D-013 helper。 */
    containment: 'none' | 'job_object';
    detail?: string;
}
export interface TrustedShellResult {
    schemaVersion: '2.0';
    status: 'exited' | 'timeout' | 'cancelled' | 'failed' | 'background_started';
    exitCode: number | null;
    stdout: string;
    stderr: string;
    rawStdoutBytes: number;
    rawStderrBytes: number;
    truncated: boolean;
    durationMs: number;
    shell: {
        kind: ShellKind;
        path: string;
        version?: string;
        evidence: string;
        reason: string;
    };
    /** stdout/stderr 的解码依据（字节流可能混合；预览截断不改变原始日志）。 */
    encoding: 'utf-8' | 'gbk' | 'utf-16le' | 'unknown';
    /** 有界原始日志路径；截断后仍可回看完整字节。 */
    logPaths?: {
        stdout: string;
        stderr: string;
    };
    /** 软时长提示（不终止进程）。 */
    softDurationExceeded?: boolean;
    /** 无法证明进程树清理完成时为 true：调用方必须停止后续自动执行并提示残留。 */
    residueRisk?: boolean;
    backgroundHandle?: string;
    /** Ready/start failures expose conservative process facts; unknown is never treated as not-spawned. */
    spawnFacts?: {
        helperSpawned: boolean;
        backgroundProcess: 'spawned' | 'not_spawned' | 'unknown';
        cleanupConfirmed: boolean;
        cleanupRequired: boolean;
    };
    termination: TrustedShellTermination;
    error?: string;
}
export interface TrustedShellRunnerOptions {
    /** 提供 D-013 helper 传输时，Windows 上命令在 Job Object 内执行。 */
    helperTransport?: HelperTransport;
    /** 原始日志目录；默认 os.tmpdir()/win7-agent-shell-logs。 */
    logDir?: string;
    /** 单流原始日志字节上限。 */
    maxLogBytes?: number;
    /** 仅供确定性合同测试覆盖；生产始终使用 process.platform。 */
    platform?: NodeJS.Platform;
    /** 产品注入的仅内存脱敏器；执行参数仍保留原值，输出/日志投影先脱敏。 */
    redactText?: (text: string) => string;
    /** 当前进程见过的秘密值；用于跨 chunk 的原始字节日志脱敏。 */
    getSensitiveValues?: () => readonly string[];
    /** Product persistence hook for asynchronous background terminal states. */
    onBackgroundStateChange?: (handle: BackgroundProcessHandle) => void;
    /** 测试可注入；生产绑定 canonical path + 当前文件 SHA-256。 */
    resolveShellIdentity?: (shellPath: string) => ShellFileIdentity;
    /** 用户选择时持久化的不可变 Shell 文件绑定；执行时必须与当前文件完全一致。 */
    getConfiguredShellIdentity?: (shellPath: string) => ShellFileIdentity | undefined;
}
export interface ShellFileIdentity {
    canonicalPath: string;
    sha256: string;
    fileId: string;
    version?: string;
}
export declare class TrustedShellRunner {
    private readonly options;
    private readonly backgroundManager;
    private readonly logDir;
    private readonly maxLogBytes;
    private readonly platform;
    constructor(options?: TrustedShellRunnerOptions);
    private redact;
    private resolveAndValidateShellIdentity;
    private createV2HelperRequest;
    getBackgroundManager(): BackgroundProcessManager;
    execute(request: TrustedShellRequest): Promise<TrustedShellResult>;
    private executeDirect;
    private executeViaHelper;
    private startBackground;
    private failureResult;
}
/**
 * 构造 Shell 调用。PowerShell 使用 UTF-16LE Base64 EncodedCommand 并归一化
 * $LASTEXITCODE；CMD 使用 /d /s /c（调用方需 windowsVerbatimArguments）。
 * 导出供合同测试验证调用结构，不承载执行逻辑。
 */
export declare function buildTrustedShellInvocation(shellKind: ShellKind, shellExe: string, command: string): {
    exe: string;
    args: string[];
    verbatim: boolean;
};
/** Bind the exact configured shell file. The digest is request metadata, not a model-controlled executable grant. */
export declare function resolveShellFileIdentity(shellPath: string): {
    canonicalPath: string;
    sha256: string;
    fileId: string;
    version?: string;
};
export declare function sameShellFileIdentity(expected: ShellFileIdentity, actual: ShellFileIdentity): boolean;
export { createTrustedShellEnvironment, validateTrustedShellEnvironmentOverlay, isForbiddenTrustedShellEnvironmentName } from './trusted-shell-environment';
/**
 * D-013 helper 传输失败 → TrustedShellResult 的纯映射：清理未确认时必须
 * 标记 residueRisk 且 processTreeReaped=false。
 */
export declare function mapHelperFailure(detail: string, kind: string, cleanupConfirmed: boolean): Omit<TrustedShellResult, 'durationMs' | 'shell'>;
/**
 * Shell 输出字节解码：先严格 UTF-8，失败则尝试 CP936/GBK；都无法确定时使用
 * replacement 保守解码并标记 unknown。字节计数始终以原始流为准。
 */
export declare function decodeShellBytes(buffer: Buffer): {
    text: string;
    encoding: 'utf-8' | 'gbk' | 'utf-16le' | 'unknown';
};
//# sourceMappingURL=trusted-shell-runner.d.ts.map