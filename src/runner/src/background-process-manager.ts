/**
 * @module background-process-manager
 * @description A9 托管后台进程管理器 (PRD §4 A9-SH03 / ADR-0089)
 *
 * 合同：最多 3 个；日志有界；start/poll/stop；启动失败不能返回成功；
 * 状态不把“正在运行”写成 exited；保存 PID/命令/启动事实；重启后只探测
 * 不自动重放；提供退出时停止或留给系统的选择。
 */

import { ChildProcess, spawn } from 'child_process';
import { killProcessTree } from './process-cleanup';

export interface BackgroundProcessHandle {
  handleId: string;
  command: string;
  cwd: string;
  pid: number | undefined;
  startTime: string;
  status: 'starting' | 'running' | 'exited' | 'stopped' | 'failed';
  exitCode: number | null;
  logs: { stdout: string[]; stderr: string[] };
  /** 有界日志丢弃的行数（日志已满时继续运行但丢弃旧行）。 */
  droppedLogLines: { stdout: number; stderr: number };
  /** 重启后恢复的探测事实：PID 存活但可能已被其他进程复用。 */
  pidReusePossible?: boolean;
}

export interface PollResult {
  handleId: string;
  status: BackgroundProcessHandle['status'];
  exitCode: number | null;
  stdoutDelta: string;
  stderrDelta: string;
  totalStdoutLines: number;
  totalStderrLines: number;
  logsDropped: { stdout: number; stderr: number };
}

export interface ProbeFact {
  pid: number;
  command: string;
  cwd: string;
  startTime: string;
}

/** 每流日志行数上限；超出后丢弃最旧行并计数。 */
const MAX_LOG_LINES = 2000;

export class BackgroundProcessManager {
  private static readonly MAX_PROCESSES = 3;
  private readonly processes = new Map<string, {
    handle: BackgroundProcessHandle;
    child: ChildProcess | undefined;
    lastPolledStdoutIdx: number;
    lastPolledStderrIdx: number;
    /** 重启恢复的探测事实没有子进程句柄。 */
    recoveredFact: boolean;
  }>();

  /**
   * 启动托管后台进程。异步方法会等到首个事件循环 tick，使同步 spawn 错误
   * （可执行文件不存在等）在返回前反映到 status，避免把失败报告为成功。
   */
  async start(
    handleId: string,
    command: string,
    shellExe: string,
    shellArgs: string[],
    cwd: string,
    env?: Record<string, string>,
  ): Promise<BackgroundProcessHandle> {
    if (this.getActiveCount() >= BackgroundProcessManager.MAX_PROCESSES) {
      throw new Error(`已达到托管后台进程上限 (${BackgroundProcessManager.MAX_PROCESSES})，请先停止已有后台进程。`);
    }
    if (this.processes.has(handleId)) {
      throw new Error(`后台进程句柄已存在: ${handleId}`);
    }

    let child: ChildProcess;
    try {
      child = spawn(shellExe, shellArgs, {
        cwd,
        env: { ...process.env, ...(env || {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        windowsHide: true,
      });
    } catch (err: any) {
      throw new Error(`后台进程启动失败: ${err?.message || err}`);
    }

    const handle: BackgroundProcessHandle = {
      handleId,
      command,
      cwd,
      pid: child.pid,
      startTime: new Date().toISOString(),
      status: child.pid === undefined ? 'failed' : 'starting',
      exitCode: null,
      logs: { stdout: [], stderr: [] },
      droppedLogLines: { stdout: 0, stderr: 0 },
    };

    const entry = {
      handle,
      child,
      lastPolledStdoutIdx: 0,
      lastPolledStderrIdx: 0,
      recoveredFact: false,
    };
    this.processes.set(handleId, entry);

    child.stdout?.on('data', (chunk: Buffer) => {
      this.appendLog(handle.logs.stdout, 'stdout', handle, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.appendLog(handle.logs.stderr, 'stderr', handle, chunk);
    });
    child.on('error', (_err) => {
      handle.status = 'failed';
    });
    child.on('close', (code) => {
      // 只把真正退出的进程标记为 exited；stopped/failed 不被覆盖。
      if (handle.status === 'running' || handle.status === 'starting') {
        handle.status = 'exited';
      }
      handle.exitCode = code;
    });

    // 等一个 macrotask 让 spawn error 事件有机会触发。
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    if (handle.status === 'starting' && child.pid !== undefined) {
      handle.status = 'running';
    }
    return { ...handle, logs: { stdout: [...handle.logs.stdout], stderr: [...handle.logs.stderr] } };
  }

  private appendLog(target: string[], stream: 'stdout' | 'stderr', handle: BackgroundProcessHandle, chunk: Buffer): void {
    const text = chunk.toString('utf8');
    for (const line of text.split('\n')) {
      target.push(line);
      if (target.length > MAX_LOG_LINES) {
        target.shift();
        if (stream === 'stdout') handle.droppedLogLines.stdout += 1;
        else handle.droppedLogLines.stderr += 1;
      }
    }
  }

  /**
   * 轮询后台进程日志增量和状态。状态来自本管理器持有的事实
   * （close 事件），不通过 PID 推断，避免 PID 复用误判。
   */
  poll(handleId: string): PollResult {
    const entry = this.processes.get(handleId);
    if (!entry) {
      throw new Error(`未找到后台进程: ${handleId}`);
    }

    const { handle, lastPolledStdoutIdx, lastPolledStderrIdx } = entry;
    const stdoutDelta = handle.logs.stdout.slice(lastPolledStdoutIdx).join('\n');
    const stderrDelta = handle.logs.stderr.slice(lastPolledStdoutIdx).join('\n');

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
      logsDropped: { ...handle.droppedLogLines },
    };
  }

  /**
   * 停止指定的后台进程。只有 kill 可证明成功才标记 stopped；
   * 否则保持 running 并抛出结构化错误，提示残留风险。
   */
  async stop(handleId: string): Promise<BackgroundProcessHandle> {
    const entry = this.processes.get(handleId);
    if (!entry) {
      throw new Error(`未找到后台进程: ${handleId}`);
    }

    const { handle, child } = entry;
    if (handle.status === 'running' || handle.status === 'starting') {
      const targetPid = child?.pid ?? handle.pid;
      if (targetPid) {
        const kill = await killProcessTree(targetPid);
        if (!kill.success) {
          throw new Error(`后台进程 ${handleId} (PID ${targetPid}) 清理无法确认: ${kill.error ?? 'unknown'}；可能存在残留，请手工检查。`);
        }
        handle.status = 'stopped';
      } else {
        handle.status = 'stopped';
      }
    }
    return { ...handle, logs: { stdout: [...handle.logs.stdout], stderr: [...handle.logs.stderr] } };
  }

  /**
   * 重启后恢复：只记录探测事实，绝不自动重放命令。PID 存活只代表
   * “有进程使用该 PID”，复用可能性必须如实标记，由用户决定处置。
   */
  adoptRecoveredFact(handleId: string, fact: ProbeFact): BackgroundProcessHandle {
    if (this.processes.has(handleId)) {
      throw new Error(`后台进程句柄已存在: ${handleId}`);
    }
    const alive = BackgroundProcessManager.probeProcessAlive(fact.pid);
    const handle: BackgroundProcessHandle = {
      handleId,
      command: fact.command,
      cwd: fact.cwd,
      pid: fact.pid,
      startTime: fact.startTime,
      status: alive ? 'running' : 'exited',
      exitCode: alive ? null : null,
      logs: { stdout: [], stderr: [] },
      droppedLogLines: { stdout: 0, stderr: 0 },
      pidReusePossible: alive,
    };
    this.processes.set(handleId, {
      handle,
      child: undefined,
      lastPolledStdoutIdx: 0,
      lastPolledStderrIdx: 0,
      recoveredFact: true,
    });
    return { ...handle };
  }

  isRecoveredFact(handleId: string): boolean {
    return this.processes.get(handleId)?.recoveredFact ?? false;
  }

  /** PID 存活探测（仅事实，不区分是否同一命令）。 */
  static probeProcessAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err?.code === 'EPERM';
    }
  }

  list(): BackgroundProcessHandle[] {
    return Array.from(this.processes.values()).map((e) => ({
      ...e.handle,
      logs: { stdout: [...e.handle.logs.stdout], stderr: [...e.handle.logs.stderr] },
    }));
  }

  getActiveCount(): number {
    return Array.from(this.processes.values()).filter((e) => e.handle.status === 'running' || e.handle.status === 'starting').length;
  }

  /**
   * 应用退出策略：stopManaged=true 停止全部受管进程后清空；
   * false 将进程留给系统（仅忘记句柄，不发送信号）。
   */
  async dispose(options: { stopManaged: boolean }): Promise<{ stopped: string[]; leftToSystem: string[] }> {
    const stopped: string[] = [];
    const leftToSystem: string[] = [];
    if (options.stopManaged) {
      for (const [id, entry] of this.processes.entries()) {
        const status = entry.handle.status;
        if ((status === 'running' || status === 'starting') && entry.recoveredFact) {
          // 重启恢复的 PID 可能已复用；应用退出不能代替用户确认去杀未知进程。
          leftToSystem.push(`${id} (recovered PID fact requires explicit stop confirmation)`);
        } else if ((status === 'running' || status === 'starting') && entry.child?.pid) {
          const kill = await killProcessTree(entry.child.pid);
          if (kill.success) {
            entry.handle.status = 'stopped';
            stopped.push(id);
          } else {
            // 清理失败也必须如实暴露，不静默转为“留给系统”。
            leftToSystem.push(`${id} (cleanup unconfirmed: ${kill.error ?? 'unknown'})`);
          }
        }
      }
    } else {
      for (const [id, entry] of this.processes.entries()) {
        if (entry.handle.status === 'running' || entry.handle.status === 'starting') {
          leftToSystem.push(id);
        }
      }
    }
    this.processes.clear();
    return { stopped, leftToSystem };
  }

  /** 兼容旧入口：停止全部。 */
  async cleanupAll(): Promise<void> {
    await this.dispose({ stopManaged: true });
  }
}
