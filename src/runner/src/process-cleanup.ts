/**
 * @module process-cleanup
 * @description 进程树终止与清理 (C08 / ADR-0089)
 */

import * as childProcess from 'child_process';

/**
 * 终止指定 PID 及其整棵子进程树
 */
export async function killProcessTree(pid: number): Promise<{ success: boolean; error?: string }> {
  if (!pid || pid <= 0) return { success: false, error: 'Invalid PID' };

  if (process.platform === 'win32') {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      if (typeof childProcess.execFile !== 'function') {
        try {
          process.kill(pid, 'SIGKILL');
          resolve({ success: true });
        } catch (e: any) {
          resolve({ success: false, error: String(e) });
        }
        return;
      }
      childProcess.execFile('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true }, (err) => {
        if (!err) {
          resolve({ success: true });
          return;
        }
        const message = String(err.message || err);
        if (message.includes('not found') || message.includes('没有找到') || message.includes('128')) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: message });
        }
      });
    });
  } else {
    // POSIX 平台
    try {
      process.kill(-pid, 'SIGKILL');
      return { success: true };
    } catch (_err1) {
      try {
        process.kill(pid, 'SIGKILL');
        return { success: true };
      } catch (_err2) {
        return { success: true }; // Process likely already terminated
      }
    }
  }
}
