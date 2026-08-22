/**
 * @module shell-detection
 * @description Windows 7 Shell 探测与选择 (PRD §4 A9-SH01 / ADR-0089)
 */

import { spawnSync } from 'child_process';
import * as os from 'os';

export type ShellKind = 'powershell' | 'cmd' | 'sh' | 'bash';

export interface DetectedShell {
  kind: ShellKind;
  path: string;
  version?: string;
  isDefault: boolean;
  available: boolean;
  notes?: string;
}

export interface ShellDetectionOptions {
  workspacePreferred?: string;
  systemPath?: string;
}

/**
 * 探测系统可用 Shell
 * 探测顺序：显式工作区设置 -> Windows PowerShell 5.1 -> cmd.exe -> POSIX sh
 */
export function detectSystemShells(options: ShellDetectionOptions = {}): DetectedShell[] {
  const isWindows = process.platform === 'win32';
  const shells: DetectedShell[] = [];

  if (isWindows) {
    // 1. PowerShell 探测
    const psPath = 'powershell.exe';
    let psAvailable = false;
    let psVersion: string | undefined;
    try {
      const probe = spawnSync(psPath, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      });
      if (probe.status === 0 && probe.stdout) {
        psAvailable = true;
        psVersion = probe.stdout.trim();
      }
    } catch (_err) {
      psAvailable = false;
    }

    shells.push({
      kind: 'powershell',
      path: psPath,
      version: psVersion,
      available: psAvailable,
      isDefault: psAvailable,
      notes: psAvailable ? `PowerShell ${psVersion || 'detected'}` : 'PowerShell not responding',
    });

    // 2. CMD 探测
    const cmdPath = process.env.ComSpec || 'cmd.exe';
    let cmdAvailable = false;
    try {
      const probe = spawnSync(cmdPath, ['/d', '/c', 'ver'], {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true,
      });
      cmdAvailable = probe.status === 0;
    } catch (_err) {
      cmdAvailable = false;
    }

    shells.push({
      kind: 'cmd',
      path: cmdPath,
      available: cmdAvailable,
      isDefault: !psAvailable && cmdAvailable,
      notes: 'Standard Command Prompt',
    });
  } else {
    // 非 Windows（开发机兼容）
    let pwshAvailable = false;
    let pwshVersion: string | undefined;
    try {
      const probe = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
        encoding: 'utf8',
        timeout: 5000,
      });
      if (probe.status === 0 && probe.stdout) {
        pwshAvailable = true;
        pwshVersion = probe.stdout.trim();
      }
    } catch (_err) {
      pwshAvailable = false;
    }

    if (pwshAvailable) {
      shells.push({
        kind: 'powershell',
        path: 'pwsh',
        version: pwshVersion,
        available: true,
        isDefault: true,
        notes: `PowerShell Core ${pwshVersion}`,
      });
    }

    shells.push({
      kind: 'sh',
      path: '/bin/sh',
      available: true,
      isDefault: !pwshAvailable,
      notes: 'POSIX Shell (Development Host)',
    });
  }

  // 工作区显式覆盖处理
  if (options.workspacePreferred) {
    const preferred = options.workspacePreferred.toLowerCase().trim();
    const matched = shells.find((s) => s.kind === preferred || s.path.toLowerCase().includes(preferred));
    if (matched && matched.available) {
      for (const s of shells) s.isDefault = false;
      matched.isDefault = true;
    }
  }

  return shells;
}

/**
 * 获取首选激活的 Shell
 */
export function getActiveShell(options: ShellDetectionOptions = {}): DetectedShell {
  const shells = detectSystemShells(options);
  const preferred = shells.find((s) => s.isDefault && s.available);
  if (preferred) return preferred;
  const available = shells.find((s) => s.available);
  if (available) return available;
  return {
    kind: process.platform === 'win32' ? 'cmd' : 'sh',
    path: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    available: false,
    isDefault: true,
    notes: 'Fallback shell (unavailable)',
  };
}
