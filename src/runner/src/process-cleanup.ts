/**
 * @module process-cleanup
 * @description 进程树终止与清理 (C08 / ADR-0089)
 *
 * 返回值必须真实：只有能证明目标 PID 已不存在时才报告 success。
 * taskkill/PID kill 是尽力回收，不是安全隔离；调用方必须保留
 * containment 事实而非把本模块描述为沙箱等价物。
 */

import * as childProcess from 'child_process';

export interface KillResult {
  success: boolean;
  error?: string;
  /** 回收方式：仅描述事实，不宣称隔离等价。 */
  method: 'taskkill_tree' | 'posix_signal' | 'already_gone';
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === 'EPERM';
  }
}

export function parseWindowsProcessTable(output: string, rootPid: number): number[] {
  const children = new Map<number, number[]>();
  for (const line of String(output).split(/\r?\n/)) {
    const numbers = line.match(/\d+/g);
    if (!numbers || numbers.length < 2) continue;
    const parentPid = Number(numbers[numbers.length - 2]);
    const processId = Number(numbers[numbers.length - 1]);
    if (!Number.isInteger(parentPid) || !Number.isInteger(processId)) continue;
    const values = children.get(parentPid) || [];
    values.push(processId);
    children.set(parentPid, values);
  }
  const descendants: number[] = [];
  const pending = [...(children.get(rootPid) || [])];
  const seen = new Set<number>();
  while (pending.length > 0) {
    const pid = pending.shift()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    descendants.push(pid);
    pending.push(...(children.get(pid) || []));
  }
  return descendants;
}

function enumerateWindowsDescendants(pid: number): Promise<number[] | null> {
  return new Promise((resolve) => {
    childProcess.execFile(
      'wmic', ['process', 'get', 'ParentProcessId,ProcessId', '/format:csv'],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => resolve(error ? null : parseWindowsProcessTable(String(stdout), pid)),
    );
  });
}

/**
 * 终止指定 PID 及其整棵子进程树。返回值反映可证明的清理结果：
 * - success=true + method=already_gone：进程已不存在；
 * - success=true + method=taskkill_tree/posix_signal：终止命令成功且 PID 已消失；
 * - success=false：无法证明清理完成，调用方必须报告残留风险。
 */
export async function killProcessTree(pid: number): Promise<KillResult> {
  if (!pid || pid <= 0) return { success: false, error: 'Invalid PID', method: 'posix_signal' };

  if (process.platform === 'win32') {
    if (!isPidAlive(pid)) {
      return { success: true, method: 'already_gone' };
    }
    const descendants = await enumerateWindowsDescendants(pid);
    return new Promise<KillResult>((resolve) => {
      childProcess.execFile('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true }, (err, _stdout, stderr) => {
        if (!err) {
          // taskkill 成功后再验证 PID 确已消失，防止命令成功但树仍有残留。
          setTimeout(() => {
            const survivors = [pid, ...(descendants || [])].filter(isPidAlive);
            if (survivors.length > 0) {
              resolve({ success: false, error: `taskkill reported success but PID(s) ${survivors.join(',')} are still alive`, method: 'taskkill_tree' });
            } else if (descendants === null) {
              resolve({ success: false, error: 'taskkill completed but descendant enumeration was unavailable; whole-tree cleanup is unproven', method: 'taskkill_tree' });
            } else {
              resolve({ success: true, method: 'taskkill_tree' });
            }
          }, 120);
          return;
        }
        const message = String(err.message || err);
        const notFound = message.includes('not found') || message.includes('没有找到') || message.includes('128') || String(stderr).includes('128');
        if (notFound && !isPidAlive(pid)) {
          resolve({ success: true, method: 'already_gone' });
        } else {
          resolve({ success: false, error: `taskkill failed for PID ${pid}: ${message}`, method: 'taskkill_tree' });
        }
      });
    });
  }

  // POSIX：先尝试进程组，再直接信号，最后以 liveness 验证收尾。
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (_groupErr) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (directErr: any) {
      if (directErr?.code === 'ESRCH') {
        return { success: true, method: 'already_gone' };
      }
    }
  }
  // 等待内核完成回收后验证。
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 40));
    if (!isPidAlive(pid)) {
      return { success: true, method: 'posix_signal' };
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch (retryErr: any) {
      if (retryErr?.code === 'ESRCH') return { success: true, method: 'posix_signal' };
    }
  }
  return isPidAlive(pid)
    ? { success: false, error: `PID ${pid} still alive after SIGKILL attempts`, method: 'posix_signal' }
    : { success: true, method: 'posix_signal' };
}
