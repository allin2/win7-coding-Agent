/**
 * @module background-process-manager
 * @description A9 托管后台进程管理器 (PRD §4 A9-SH03 / ADR-0089)
 */

import { ChildProcess, spawn } from 'child_process';
import { killProcessTree } from './process-cleanup';

export interface BackgroundProcessHandle {
  handleId: string;
  command: string;
  cwd: string;
  pid: number | undefined;
  startTime: string;
  status: 'running' | 'exited' | 'stopped' | 'failed';
  exitCode: number | null;
  logs: { stdout: string[]; stderr: string[] };
}

export interface PollResult {
  handleId: string;
  status: 'running' | 'exited' | 'stopped' | 'failed';
  exitCode: number | null;
  stdoutDelta: string;
  stderrDelta: string;
  totalStdoutLines: number;
  totalStderrLines: number;
}

export class BackgroundProcessManager {
  private static readonly MAX_PROCESSES = 3;
  private readonly processes = new Map<string, {
    handle: BackgroundProcessHandle;
    child: ChildProcess;
    lastPolledStdoutIdx: number;
    lastPolledStderrIdx: number;
  }>();

  /**
   * 启动托管后台进程
   */
  start(
    handleId: string,
    command: string,
    shellExe: string,
    shellArgs: string[],
    cwd: string,
    env?: Record<string, string>,
  ): BackgroundProcessHandle {
    if (this.getActiveCount() >= BackgroundProcessManager.MAX_PROCESSES) {
      throw new Error(`已达到托管后台进程上限 (${BackgroundProcessManager.MAX_PROCESSES})，请先停止已有后台进程。`);
    }
    if (this.processes.has(handleId)) {
      throw new Error(`后台进程句柄已存在: ${handleId}`);
    }

    const child = spawn(shellExe, shellArgs, {
      cwd,
      env: { ...process.env, ...(env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true,
    });

    const handle: BackgroundProcessHandle = {
      handleId,
      command,
      cwd,
      pid: child.pid,
      startTime: new Date().toISOString(),
      status: 'running',
      exitCode: null,
      logs: { stdout: [], stderr: [] },
    };

    const entry = {
      handle,
      child,
      lastPolledStdoutIdx: 0,
      lastPolledStderrIdx: 0,
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      handle.logs.stdout.push(text);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      handle.logs.stderr.push(text);
    });

    child.on('error', (_err) => {
      handle.status = 'failed';
    });

    child.on('close', (code) => {
      if (handle.status === 'running') {
        handle.status = 'exited';
      }
      handle.exitCode = code;
    });

    this.processes.set(handleId, entry);
    return { ...handle };
  }

  /**
   * 轮询后台进程日志增量和状态
   */
  poll(handleId: string): PollResult {
    const entry = this.processes.get(handleId);
    if (!entry) {
      throw new Error(`未找到后台进程: ${handleId}`);
    }

    const { handle, lastPolledStdoutIdx, lastPolledStderrIdx } = entry;
    const stdoutDelta = handle.logs.stdout.slice(lastPolledStdoutIdx).join('');
    const stderrDelta = handle.logs.stderr.slice(lastPolledStderrIdx).join('');

    entry.lastPolledStdoutIdx = handle.logs.stdout.length;
    entry.lastPolledStderrIdx = handle.logs.stderr.length;

    return {
      handleId,
      status: handle.status,
      exitCode: handle.exitCode,
      stdoutDelta,
      stderrDelta,
      totalStdoutLines: handle.logs.stdout.length,
      totalStderrLines: handle.logs.stderr.length,
    };
  }

  /**
   * 停止指定的后台进程
   */
  async stop(handleId: string): Promise<BackgroundProcessHandle> {
    const entry = this.processes.get(handleId);
    if (!entry) {
      throw new Error(`未找到后台进程: ${handleId}`);
    }

    const { handle, child } = entry;
    if (handle.status === 'running' && child.pid) {
      await killProcessTree(child.pid);
      handle.status = 'stopped';
    }
    return { ...handle };
  }

  /**
   * 列出所有托管后台进程
   */
  list(): BackgroundProcessHandle[] {
    return Array.from(this.processes.values()).map((e) => ({ ...e.handle }));
  }

  /**
   * 获取当前活动的后台进程数
   */
  getActiveCount(): number {
    return Array.from(this.processes.values()).filter((e) => e.handle.status === 'running').length;
  }

  /**
   * 清理全部后台进程
   */
  async cleanupAll(): Promise<void> {
    for (const [id, entry] of this.processes.entries()) {
      if (entry.handle.status === 'running' && entry.child.pid) {
        await killProcessTree(entry.child.pid);
        entry.handle.status = 'stopped';
      }
    }
    this.processes.clear();
  }
}
