/**
 * Runner boundary contracts and deterministic implementations used before the
 * SPIKE_02 native helper is available. No implementation in this file starts a
 * process; production execution remains fail-closed.
 */

import {
  RunRequest,
  RunResult,
  RunnerConfig,
  RunnerErrorCode,
  RunStatus,
} from './types';
import { ApprovalLedger, buildRunApprovalRequest } from './approval';
import { captureText } from './output';

const PROHIBITED_SHELL_HOSTS = new Set([
  'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'sh', 'bash', 'zsh',
]);

export function findProhibitedShellHost(command: string): string | null {
  const basename = command.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
  return PROHIBITED_SHELL_HOSTS.has(basename) ? basename : null;
}

/** Only harness/programming defects may reject this promise. */
export interface IRunner {
  execute(request: RunRequest): Promise<RunResult>;
}

export interface MockRunnerConfig {
  defaultExitCode?: number;
  defaultStdout?: string;
  defaultStderr?: string;
  mockDurationMs?: number;
  simulateStatus?: Extract<RunStatus, 'timeout' | 'idle_timeout' | 'cancelled' | 'spawn_failed' | 'cleanup_failed'>;
  approvalLedger?: ApprovalLedger;
}

/**
 * Deterministic runner for tests and explicit simulations. It mirrors the
 * execution boundary validation and result envelope of the eventual native
 * Runner but deliberately never invokes child_process.
 */
export class MockRunner implements IRunner {
  private readonly config: {
    defaultExitCode: number;
    defaultStdout: string;
    defaultStderr: string;
    mockDurationMs: number;
    simulateStatus?: MockRunnerConfig['simulateStatus'];
  };
  private readonly approvalLedger?: ApprovalLedger;

  constructor(config: MockRunnerConfig = {}) {
    this.approvalLedger = config.approvalLedger;
    this.config = {
      defaultExitCode: config.defaultExitCode ?? 0,
      defaultStdout: config.defaultStdout ?? '',
      defaultStderr: config.defaultStderr ?? '',
      mockDurationMs: config.mockDurationMs ?? 10,
      simulateStatus: config.simulateStatus ?? undefined,
    };
  }

  async execute(request: RunRequest): Promise<RunResult> {
    const invalid = validateRequest(request);
    if (invalid) return rejected(invalid.code, invalid.message, invalid.action);

    const shellHost = findProhibitedShellHost(request.command);
    if (shellHost) {
      return rejected(
        RunnerErrorCode.SHELL_HOST_PROHIBITED,
        `Shell host "${shellHost}" is prohibited in the generic runner`,
        '使用获批工具适配器和结构化 command + args；固定脚本必须由任务书单独授权。',
      );
    }

    if (request.approvalLevel === 'workspace_write') {
      if (!this.approvalLedger) {
        return rejected(
          RunnerErrorCode.APPROVAL_REQUIRED,
          'Workspace write cannot execute without an approval ledger',
          '重新生成预览与工作区基线，并取得一次性审批。',
        );
      }
      const approval = this.approvalLedger.validateAndConsume(
        request.approval,
        buildRunApprovalRequest(request),
      );
      if (!approval.valid) {
        const code = approval.code === 'APPROVAL_REPLAYED'
          ? RunnerErrorCode.APPROVAL_REPLAYED
          : approval.code === 'APPROVAL_REQUIRED'
            ? RunnerErrorCode.APPROVAL_REQUIRED
            : RunnerErrorCode.APPROVAL_INVALID;
        return rejected(
          code,
          approval.reason ?? 'Approval validation failed',
          '执行内容已变化或审批失效；重新生成预览、基线并审批。',
        );
      }
    }

    if (this.config.mockDurationMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.config.mockDurationMs));
    }

    const status = this.config.simulateStatus ?? 'exited';
    const durationMs = status === 'timeout'
      ? request.config.timeoutMs
      : status === 'idle_timeout'
        ? request.config.idleTimeoutMs
        : this.config.mockDurationMs;
    const failed = status !== 'exited';
    return result(
      status,
      status === 'exited' ? this.config.defaultExitCode : null,
      this.config.defaultStdout,
      failed ? failureText(status) : this.config.defaultStderr,
      durationMs,
      failed
        ? {
          code: status === 'spawn_failed' ? RunnerErrorCode.INVALID_REQUEST : RunnerErrorCode.CONTAINMENT_UNAVAILABLE,
          message: failureText(status),
          recommendedAction: recommendedAction(status),
        }
        : undefined,
      status === 'cleanup_failed',
      request.config,
    );
  }
}

/** Production placeholder until SPIKE_02 validates the native containment helper. */
export class UnavailableRunner implements IRunner {
  async execute(_request: RunRequest): Promise<RunResult> {
    return result(
      'capability_unavailable',
      null,
      '',
      'Real command execution is unavailable because Win7 containment has not been validated',
      0,
      {
        code: RunnerErrorCode.CONTAINMENT_UNAVAILABLE,
        message: 'Real command execution is unavailable because Win7 containment has not been validated',
        recommendedAction: '继续使用只读分析，或先完成 SPIKE_02 并安装通过哈希校验的原生 helper。',
      },
    );
  }
}

export function validateRequest(request: RunRequest): { code: RunnerErrorCode; message: string; action: string } | undefined {
  if (!request || !request.command || /[\r\n\0]/.test(request.command)) {
    return {
      code: RunnerErrorCode.INVALID_REQUEST,
      message: 'Runner command is empty or contains control characters',
      action: '提供单一可执行文件路径；参数放入 args 数组。',
    };
  }
  if (!Array.isArray(request.args) || request.args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
    return {
      code: RunnerErrorCode.INVALID_REQUEST,
      message: 'Runner args must be a string array without NUL characters',
      action: '将每个参数作为独立字符串传入 args。',
    };
  }
  const config = request.config;
  if (!config || !isAbsolutePath(config.workDir) || containsParentSegment(config.workDir)) {
    return {
      code: RunnerErrorCode.INVALID_REQUEST,
      message: 'Runner workDir must be a normalized absolute path without parent traversal',
      action: '提供工作区内的绝对 cwd，先完成路径规范化。',
    };
  }
  if (!positiveInteger(config.timeoutMs) || !positiveInteger(config.idleTimeoutMs) || config.idleTimeoutMs > config.timeoutMs) {
    return {
      code: RunnerErrorCode.INVALID_REQUEST,
      message: 'Runner timeoutMs and idleTimeoutMs must be positive integers with idleTimeoutMs <= timeoutMs',
      action: '为命令设置受控的总超时和空闲超时。',
    };
  }
  if (!nonNegativeInteger(config.maxStdoutBytes) || !nonNegativeInteger(config.maxStderrBytes)) {
    return {
      code: RunnerErrorCode.INVALID_REQUEST,
      message: 'Runner output caps must be non-negative byte counts',
      action: '使用以字节为单位的 stdout/stderr 输出上限。',
    };
  }
  if (config.stdinPolicy !== 'closed') {
    return {
      code: RunnerErrorCode.INVALID_REQUEST,
      message: 'Agent Runner stdin must remain closed',
      action: '交互输入只能通过独立且经批准的用户终端。',
    };
  }
  for (const [key, value] of Object.entries(config.envOverlay ?? {})) {
    if (!key || key.includes('=') || /[\0\r\n]/.test(key) || /\0/.test(value)) {
      return {
        code: RunnerErrorCode.INVALID_REQUEST,
        message: `Invalid environment overlay entry: ${key || '(empty)'}`,
        action: '环境变量使用不含控制字符或等号的名称和值。',
      };
    }
    if (isSensitiveEnvironmentName(key)) {
      return {
        code: RunnerErrorCode.SENSITIVE_ENVIRONMENT_REJECTED,
        message: `Sensitive environment variable is not accepted from an Agent request: ${key}`,
        action: '凭据只能由受控凭据提供方在获批执行边界注入，不能随工具参数传递。',
      };
    }
  }
  return undefined;
}

function isSensitiveEnvironmentName(key: string): boolean {
  return /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API[_-]?KEY|PRIVATE[_-]?KEY)/i.test(key) ||
    /^SSH_AUTH_SOCK$/i.test(key);
}

export function result(
  status: RunStatus,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  durationMs: number,
  error?: RunResult['error'],
  cleanupFailed = false,
  outputConfig?: RunnerConfig,
): RunResult {
  const requestedTermination = status === 'timeout' || status === 'idle_timeout' || status === 'cancelled' || cleanupFailed;
  return {
    schemaVersion: '2.0',
    status,
    exitCode,
    // Boundary rejections and the fail-closed placeholder have no valid
    // request config. Preserve their small diagnostic payload rather than
    // accidentally reducing it to a truncation marker.
    stdout: captureText(stdout, outputConfig?.maxStdoutBytes ?? 4 * 1024),
    stderr: captureText(stderr, outputConfig?.maxStderrBytes ?? 4 * 1024),
    durationMs,
    termination: {
      requested: requestedTermination,
      processTreeReaped: status === 'exited' || status === 'spawn_failed' || status === 'rejected' || status === 'capability_unavailable',
      containment: 'none',
      ...(cleanupFailed ? { detail: 'Mock cleanup could not confirm process-tree reaping' } : {}),
    },
    ...(error ? { error } : {}),
  };
}

export function rejected(code: RunnerErrorCode, message: string, recommendedAction: string): RunResult {
  return result('rejected', null, '', message, 0, { code, message, recommendedAction });
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value);
}

function containsParentSegment(value: string): boolean {
  return value.replace(/\\/g, '/').split('/').includes('..');
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function failureText(status: Exclude<RunStatus, 'exited' | 'rejected' | 'capability_unavailable'>): string {
  switch (status) {
    case 'timeout': return 'Command exceeded its total timeout';
    case 'idle_timeout': return 'Command produced no stdout or stderr within the idle timeout';
    case 'cancelled': return 'Command was cancelled before completion';
    case 'spawn_failed': return 'Command could not be started';
    case 'cleanup_failed': return 'Command termination was requested but process-tree cleanup could not be confirmed';
  }
}

function recommendedAction(status: Exclude<RunStatus, 'exited' | 'rejected' | 'capability_unavailable'>): string {
  switch (status) {
    case 'idle_timeout': return '改用非交互命令；Agent Runner 不支持等待 stdin。';
    case 'timeout': return '缩小命令范围，或由获批 Adapter 提供更合适的总超时。';
    case 'cancelled': return '检查取消原因；若命令有副作用，请先确认清理结果。';
    case 'spawn_failed': return '确认命令已登记、工件存在且运行前置满足。';
    case 'cleanup_failed': return '按 fail-closed 处理；检查 Win7 containment 证据和进程残留。';
  }
}
