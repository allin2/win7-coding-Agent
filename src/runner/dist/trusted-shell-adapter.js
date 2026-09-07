"use strict";
/**
 * @module trusted-shell-adapter
 * @description TrustedShellRunner ↔ A9AgentLoop 运行时适配器 (A9-02)
 *
 * 以结构化类型实现 core 模块的 A9RunnerPort 合同（runner 模块不依赖 core），
 * 完整传递 command、cwd、timeoutMs、background、shell kind/path、AbortSignal
 * 与环境覆盖；不引入固定 60 秒默认硬超时。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTrustedShellLoopAdapter = void 0;
function toShellKind(value) {
    if (value === 'powershell' || value === 'cmd' || value === 'sh' || value === 'bash')
        return value;
    return undefined;
}
function toLoopResult(result) {
    return {
        status: result.status,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        timedOut: result.status === 'timeout',
        truncated: result.truncated,
        cancelled: result.status === 'cancelled',
        rawStdoutBytes: result.rawStdoutBytes,
        rawStderrBytes: result.rawStderrBytes,
        ...(result.logPaths ? { logPaths: result.logPaths } : {}),
        ...(result.backgroundHandle ? { backgroundHandle: result.backgroundHandle } : {}),
        ...(result.termination.processTreeReaped !== undefined
            ? { processTreeReaped: result.termination.processTreeReaped }
            : {}),
        ...(result.residueRisk ? { residueRisk: true } : {}),
        ...(result.softDurationExceeded ? { softDurationExceeded: true } : {}),
    };
}
function createTrustedShellLoopAdapter(runner) {
    return {
        async execute(command, options = {}) {
            const result = await runner.execute({
                command,
                ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
                // 未提供 timeoutMs 时不设置任何固定硬超时。
                ...(options.timeoutMs !== undefined && options.timeoutMs > 0 ? { timeoutMs: options.timeoutMs } : {}),
                ...(options.signal ? { signal: options.signal } : {}),
                ...(options.background !== undefined ? { background: options.background } : {}),
                ...(options.shellKind !== undefined ? { shellKind: toShellKind(options.shellKind) } : {}),
                ...(options.shellPath !== undefined ? { shellPath: options.shellPath } : {}),
                ...(options.envOverlay !== undefined ? { envOverlay: options.envOverlay } : {}),
                ...(options.maxOutputBytes !== undefined ? { maxOutputBytes: options.maxOutputBytes } : {}),
            });
            return toLoopResult(result);
        },
        pollBackground(handleId) {
            return runner.getBackgroundManager().poll(handleId);
        },
        stopBackground(handleId) {
            return runner.getBackgroundManager().stop(handleId);
        },
    };
}
exports.createTrustedShellLoopAdapter = createTrustedShellLoopAdapter;
//# sourceMappingURL=trusted-shell-adapter.js.map