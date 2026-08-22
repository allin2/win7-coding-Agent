/**
 * @module trusted-shell-runner
 * @description A9 TrustedShellRunner 核心实现 (PRD §4 / ADR-0089)
 */

import { spawn } from 'child_process';
import { getActiveShell, ShellKind } from './shell-detection';
import { BackgroundProcessManager } from './background-process-manager';
import { killProcessTree } from './process-cleanup';

export interface TrustedShellRequest {
  id?: string;
  command: string;
  cwd?: string;
  shellKind?: ShellKind;
  shellPath?: string;
  envOverlay?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxOutputLines?: number;
  background?: boolean;
  signal?: AbortSignal;
}

export interface TrustedShellResult {
  schemaVersion: '2.0';
  status: 'exited' | 'timeout' | 'cancelled' | 'failed';
  exitCode: number | null;
  stdout: string;
  stderr: string;
  rawStdoutBytes: number;
  rawStderrBytes: number;
  truncated: boolean;
  durationMs: number;
  shell: { kind: ShellKind; path: string };
  backgroundHandle?: string;
  termination: {
    requested: boolean;
    processTreeReaped: boolean;
    detail?: string;
  };
  error?: string;
}

export class TrustedShellRunner {
  private readonly backgroundManager = new BackgroundProcessManager();

  getBackgroundManager(): BackgroundProcessManager {
    return this.backgroundManager;
  }

  async execute(request: TrustedShellRequest): Promise<TrustedShellResult> {
    const startTime = Date.now();
    const activeShell = getActiveShell({ workspacePreferred: request.shellKind || request.shellPath });
    const shellKind = request.shellKind || activeShell.kind;
    const shellExe = request.shellPath || activeShell.path;
    const cwd = request.cwd || process.cwd();
    const maxOutputBytes = request.maxOutputBytes || 65_536;
    const maxOutputLines = request.maxOutputLines || 500;

    const { exe, args } = this.buildShellInvocation(shellKind, shellExe, request.command);

    // 托管后台进程处理
    if (request.background) {
      const handleId = request.id || `bg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        const handle = this.backgroundManager.start(
          handleId,
          request.command,
          exe,
          args,
          cwd,
          request.envOverlay,
        );
        return {
          schemaVersion: '2.0',
          status: 'exited',
          exitCode: 0,
          stdout: `[Background process started with handle: ${handle.handleId}, PID: ${handle.pid}]`,
          stderr: '',
          rawStdoutBytes: 0,
          rawStderrBytes: 0,
          truncated: false,
          durationMs: Date.now() - startTime,
          shell: { kind: shellKind, path: exe },
          backgroundHandle: handle.handleId,
          termination: { requested: false, processTreeReaped: false },
        };
      } catch (err: any) {
        return {
          schemaVersion: '2.0',
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: String(err?.message || err),
          rawStdoutBytes: 0,
          rawStderrBytes: 0,
          truncated: false,
          durationMs: Date.now() - startTime,
          shell: { kind: shellKind, path: exe },
          termination: { requested: false, processTreeReaped: false },
          error: String(err?.message || err),
        };
      }
    }

    return new Promise<TrustedShellResult>((resolve) => {
      let stdoutBuffers: Buffer[] = [];
      let stderrBuffers: Buffer[] = [];
      let totalStdoutBytes = 0;
      let totalStderrBytes = 0;
      let isCancelled = false;
      let isTimedOut = false;
      let timeoutTimer: NodeJS.Timeout | undefined;

      const child = spawn(exe, args, {
        cwd,
        env: { ...process.env, ...(request.envOverlay || {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const onAbort = async () => {
        isCancelled = true;
        if (child.pid) {
          await killProcessTree(child.pid);
        }
      };

      if (request.signal) {
        if (request.signal.aborted) {
          onAbort();
        } else {
          request.signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      if (request.timeoutMs && request.timeoutMs > 0) {
        timeoutTimer = setTimeout(async () => {
          isTimedOut = true;
          if (child.pid) {
            await killProcessTree(child.pid);
          }
        }, request.timeoutMs);
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        totalStdoutBytes += chunk.length;
        if (totalStdoutBytes <= maxOutputBytes * 2) {
          stdoutBuffers.push(chunk);
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        totalStderrBytes += chunk.length;
        if (totalStderrBytes <= maxOutputBytes * 2) {
          stderrBuffers.push(chunk);
        }
      });

      child.on('error', (err) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (request.signal) request.signal.removeEventListener('abort', onAbort);
        resolve({
          schemaVersion: '2.0',
          status: 'failed',
          exitCode: null,
          stdout: Buffer.concat(stdoutBuffers).toString('utf8'),
          stderr: `Spawn error: ${err.message}`,
          rawStdoutBytes: totalStdoutBytes,
          rawStderrBytes: totalStderrBytes,
          truncated: false,
          durationMs: Date.now() - startTime,
          shell: { kind: shellKind, path: exe },
          termination: { requested: isCancelled || isTimedOut, processTreeReaped: true },
          error: err.message,
        });
      });

      child.on('close', (code) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (request.signal) request.signal.removeEventListener('abort', onAbort);

        const fullStdout = Buffer.concat(stdoutBuffers).toString('utf8');
        const fullStderr = Buffer.concat(stderrBuffers).toString('utf8');

        const { text: stdoutText, truncated: stdoutTruncated } = truncateOutput(fullStdout, maxOutputBytes, maxOutputLines);
        const { text: stderrText, truncated: stderrTruncated } = truncateOutput(fullStderr, maxOutputBytes, maxOutputLines);
        const truncated = stdoutTruncated || stderrTruncated || totalStdoutBytes > maxOutputBytes || totalStderrBytes > maxOutputBytes;

        let status: 'exited' | 'timeout' | 'cancelled' | 'failed' = 'exited';
        if (isCancelled) status = 'cancelled';
        else if (isTimedOut) status = 'timeout';

        resolve({
          schemaVersion: '2.0',
          status,
          exitCode: code,
          stdout: stdoutText,
          stderr: stderrText,
          rawStdoutBytes: totalStdoutBytes,
          rawStderrBytes: totalStderrBytes,
          truncated,
          durationMs: Date.now() - startTime,
          shell: { kind: shellKind, path: exe },
          termination: {
            requested: isCancelled || isTimedOut,
            processTreeReaped: isCancelled || isTimedOut,
          },
        });
      });
    });
  }

  private buildShellInvocation(
    shellKind: ShellKind,
    shellExe: string,
    command: string,
  ): { exe: string; args: string[] } {
    if (shellKind === 'powershell') {
      // 构造 PowerShell 包装脚本并以 UTF-16LE 进行 Base64 编码
      const wrappedScript = `$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ${command}; if ($LASTEXITCODE -ne $null) { exit $LASTEXITCODE }`;
      const encodedCommand = Buffer.from(wrappedScript, 'utf16le').toString('base64');
      return {
        exe: shellExe,
        args: [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-EncodedCommand',
          encodedCommand,
        ],
      };
    }

    if (shellKind === 'cmd') {
      return {
        exe: shellExe,
        args: ['/d', '/s', '/c', command],
      };
    }

    // POSIX sh / bash fallback
    return {
      exe: shellExe,
      args: ['-c', command],
    };
  }
}

function truncateOutput(content: string, maxBytes: number, maxLines: number): { text: string; truncated: boolean } {
  const lines = content.split(/\r?\n/);
  let truncated = false;
  let resultLines = lines;

  if (resultLines.length > maxLines) {
    resultLines = resultLines.slice(0, maxLines);
    truncated = true;
  }

  let text = resultLines.join('\n');
  const textBuffer = Buffer.from(text, 'utf8');
  if (textBuffer.length > maxBytes) {
    text = textBuffer.slice(0, maxBytes).toString('utf8');
    truncated = true;
  }

  if (truncated) {
    text += `\n[Output truncated: capped at ${maxLines} lines / ${maxBytes} bytes]`;
  }

  return { text, truncated };
}
