/**
 * @module background-process-manager
 * @description A9 托管后台进程管理器 (PRD §4 A9-SH03 / ADR-0089)
 *
 * 合同：最多 3 个；日志有界；start/poll/stop；启动失败不能返回成功；
 * 状态不把“正在运行”写成 exited；保存 PID/命令/启动事实；重启后只探测
 * 不自动重放；提供退出时停止或留给系统的选择。
 */
/// <reference types="node" />
import { HelperTransport } from './native-transport';
import { NativeHelperRequest } from './native-protocol';
export interface BackgroundProcessHandle {
    handleId: string;
    command: string;
    cwd: string;
    pid: number | undefined;
    startTime: string;
    status: 'starting' | 'running' | 'exited' | 'stopped' | 'failed';
    exitCode: number | null;
    logs: {
        stdout: string[];
        stderr: string[];
    };
    /** 有界日志丢弃的行数（日志已满时继续运行但丢弃旧行）。 */
    droppedLogLines: {
        stdout: number;
        stderr: number;
    };
    /** 重启后恢复的探测事实：PID 存活但可能已被其他进程复用。 */
    pidReusePossible?: boolean;
    /** Helper 已结束但 Job Object 清理尚未证实时，仍须向产品暴露 Stop 重试入口。 */
    cleanupRequired?: boolean;
}
export interface PollResult {
    handleId: string;
    status: BackgroundProcessHandle['status'];
    exitCode: number | null;
    stdoutDelta: string;
    stderrDelta: string;
    totalStdoutLines: number;
    totalStderrLines: number;
    logsDropped: {
        stdout: number;
        stderr: number;
    };
}
export interface ProbeFact {
    pid: number;
    command: string;
    cwd: string;
    startTime: string;
    cleanupRequired?: boolean;
}
export declare class BackgroundProcessManager {
    private readonly helperTransport?;
    private readonly redactText;
    private readonly getSensitiveValues;
    private readonly onStateChange;
    private static readonly MAX_PROCESSES;
    private readonly processes;
    constructor(helperTransport?: HelperTransport | undefined, redactText?: (text: string) => string, getSensitiveValues?: () => readonly string[], onStateChange?: (handle: BackgroundProcessHandle) => void);
    private notifyStateChange;
    private containAfterStatePersistenceFailure;
    /**
     * 启动托管后台进程。异步方法会等到首个事件循环 tick，使同步 spawn 错误
     * （可执行文件不存在等）在返回前反映到 status，避免把失败报告为成功。
     */
    start(handleId: string, command: string, shellExe: string, shellArgs: string[], cwd: string, environment?: NodeJS.ProcessEnv, helperRequest?: NativeHelperRequest): Promise<BackgroundProcessHandle>;
    private startViaHelper;
    private finishHelperInvocation;
    private appendLog;
    private flushPendingLog;
    private appendRedactedText;
    /**
     * 轮询后台进程日志增量和状态。状态来自本管理器持有的事实
     * （close 事件），不通过 PID 推断，避免 PID 复用误判。
     */
    poll(handleId: string): PollResult;
    /**
     * 停止指定的后台进程。只有 kill 可证明成功才标记 stopped；
     * 否则保持 running 并抛出结构化错误，提示残留风险。
     */
    stop(handleId: string): Promise<BackgroundProcessHandle>;
    /**
     * 重启后恢复：只记录探测事实，绝不自动重放命令。PID 存活只代表
     * “有进程使用该 PID”，复用可能性必须如实标记，由用户决定处置。
     */
    adoptRecoveredFact(handleId: string, fact: ProbeFact): BackgroundProcessHandle;
    isRecoveredFact(handleId: string): boolean;
    /** PID 存活探测（仅事实，不区分是否同一命令）。 */
    static probeProcessAlive(pid: number): boolean;
    list(): BackgroundProcessHandle[];
    getActiveCount(): number;
    private requiresCleanupAttention;
    /**
     * 应用退出策略：stopManaged=true 停止全部受管进程后移除已终止项；
     * 清理无法确认的活动项必须保留，以便上层阻止退出并允许再次处置。
     * false 将进程留给系统（仅忘记句柄，不发送信号）。
     */
    dispose(options: {
        stopManaged: boolean;
    }): Promise<{
        stopped: string[];
        leftToSystem: string[];
    }>;
    /** 兼容旧入口：停止全部。 */
    cleanupAll(): Promise<void>;
}
//# sourceMappingURL=background-process-manager.d.ts.map