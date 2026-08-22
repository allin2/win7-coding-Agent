/**
 * @module trusted-shell-adapter
 * @description TrustedShellRunner ↔ A9AgentLoop 运行时适配器 (A9-02)
 *
 * 以结构化类型实现 core 模块的 A9RunnerPort 合同（runner 模块不依赖 core），
 * 完整传递 command、cwd、timeoutMs、background、shell kind/path、AbortSignal
 * 与环境覆盖；不引入固定 60 秒默认硬超时。
 */

import { TrustedShellRunner, TrustedShellResult } from './trusted-shell-runner';
import { ShellKind } from './shell-detection';

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
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled?: boolean;
  rawStdoutBytes?: number;
  rawStderrBytes?: number;
  logPaths?: { stdout: string; stderr: string };
  backgroundHandle?: string;
  processTreeReaped?: boolean;
  residueRisk?: boolean;
  softDurationExceeded?: boolean;
}

export interface TrustedShellLoopAdapter {
  execute(command: string, options?: LoopRunnerOptions): Promise<LoopRunnerResult>;
}

function toShellKind(value: string | undefined): ShellKind | undefined {
  if (value === 'powershell' || value === 'cmd' || value === 'sh' || value === 'bash') return value;
  return undefined;
}

function toLoopResult(result: TrustedShellResult): LoopRunnerResult {
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    timedOut: result.status === 'timeout',
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
    logsDropped: { stdout: number; stderr: number };
  };
  stopBackground(handleId: string): Promise<unknown>;
}

export function createTrustedShellLoopAdapter(
  runner: TrustedShellRunner,
): TrustedShellLoopAdapterHandle {
  return {
    async execute(command: string, options: LoopRunnerOptions = {}): Promise<LoopRunnerResult> {
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
    pollBackground(handleId: string) {
      return runner.getBackgroundManager().poll(handleId);
    },
    stopBackground(handleId: string) {
      return runner.getBackgroundManager().stop(handleId);
    },
  };
}
