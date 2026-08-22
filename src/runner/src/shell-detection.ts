/**
 * @module shell-detection
 * @description Windows 7 Shell 探测与选择 (PRD §4 A9-SH01 / ADR-0089 / D-019)
 *
 * 选择合同：工作区显式设置 → Windows PowerShell 5.1 → cmd.exe。
 * PowerShell 2～4 仅 Best Effort，默认降级 CMD，用户显式强制时才使用；
 * PowerShell 缺失时使用 CMD。非 Windows Shell 只作为开发机替代，
 * 不构成 Win7 证据（result.evidence 标记 dev_host_only）。
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
  /** win7_contract：该 Shell 满足 A9-SH01 正式合同；dev_host_only：开发机替代。 */
  evidence: 'win7_contract' | 'dev_host_only';
  notes?: string;
}

export interface ShellSelection {
  kind: ShellKind;
  path: string;
  version?: string;
  evidence: 'win7_contract' | 'dev_host_only';
  /** 记录实际选择原因，进入审计与模型上下文。 */
  reason: string;
  notes?: string;
}

export interface ShellDetectionOptions {
  /** 工作区显式配置：kind 或完整路径。 */
  workspacePreferred?: string;
  /** 用户显式强制 PowerShell（PS 2～4 Best Effort 也允许）。 */
  forcePowershell?: boolean;
  systemPath?: string;
}

/** PowerShell 正式基线：Windows PowerShell 5.1（WMF 5.1）。 */
const POWERSHELL_MIN_VERSION = '5.1';

function parseVersion(text: string): { major: number; minor: number } | undefined {
  const match = /(\d+)\.(\d+)/.exec(text.trim());
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function versionAtLeast(text: string, baseline: string): boolean {
  const actual = parseVersion(text);
  const base = parseVersion(baseline);
  if (!actual || !base) return false;
  if (actual.major !== base.major) return actual.major > base.major;
  return actual.minor >= base.minor;
}

function probePowershell(exe: string): { available: boolean; version?: string } {
  try {
    const probe = spawnSync(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
    });
    if (probe.status === 0 && probe.stdout) {
      return { available: true, version: probe.stdout.trim() };
    }
  } catch (_err) {
    // fall through
  }
  return { available: false };
}

/**
 * 探测系统可用 Shell。探测本身不缓存：调用方按会话缓存探测结果。
 */
export function detectSystemShells(options: ShellDetectionOptions = {}): DetectedShell[] {
  const isWindows = process.platform === 'win32';
  const shells: DetectedShell[] = [];

  if (isWindows) {
    const ps = probePowershell('powershell.exe');
    const psMeetsBaseline = ps.available && ps.version !== undefined && versionAtLeast(ps.version, POWERSHELL_MIN_VERSION);
    shells.push({
      kind: 'powershell',
      path: 'powershell.exe',
      version: ps.version,
      available: ps.available,
      isDefault: false,
      evidence: 'win7_contract',
      notes: !ps.available
        ? 'PowerShell not found; falling back to cmd.exe'
        : psMeetsBaseline
          ? `Windows PowerShell ${ps.version} (>= 5.1 baseline)`
          : `PowerShell ${ps.version} is below the 5.1 baseline; Best Effort only (explicit force required)`,
    });

    const cmdPath = process.env.ComSpec || 'cmd.exe';
    let cmdAvailable = false;
    try {
      const probe = spawnSync(cmdPath, ['/d', '/c', 'ver'], {
        encoding: 'utf8',
        timeout: 5000,
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
      isDefault: false,
      evidence: 'win7_contract',
      notes: 'Standard Command Prompt (Win7 built-in)',
    });
  } else {
    // 非 Windows：仅作为开发机替代，不得冒充 Win7 证据。
    const pwsh = probePowershell('pwsh');
    if (pwsh.available) {
      shells.push({
        kind: 'powershell',
        path: 'pwsh',
        version: pwsh.version,
        available: true,
        isDefault: true,
        evidence: 'dev_host_only',
        notes: `PowerShell Core ${pwsh.version} on ${os.platform()} — development substitute, NOT Win7 evidence`,
      });
    }
    shells.push({
      kind: 'sh',
      path: '/bin/sh',
      available: true,
      isDefault: !pwsh.available,
      evidence: 'dev_host_only',
      notes: `POSIX Shell on ${os.platform()} — development substitute, NOT Win7 evidence`,
    });
  }
  return shells;
}

/**
 * 按 A9-SH01 合同选择 Shell：
 * 工作区显式配置 → Windows PowerShell >= 5.1 → CMD（PS 2～4/缺失降级）。
 */
export function selectShell(options: ShellDetectionOptions = {}): ShellSelection {
  const isWindows = process.platform === 'win32';
  const shells = detectSystemShells(options);
  const lower = (s: string) => s.toLowerCase().trim();

  // 1. 工作区显式配置优先（匹配 kind 或路径包含）。
  if (options.workspacePreferred) {
    const preferred = lower(options.workspacePreferred);
    const matched = shells.find(
      (s) => s.kind === preferred || lower(s.path).includes(preferred) || preferred.includes(lower(s.kind)),
    );
    if (matched && matched.available) {
      // PS 2～4 只有在用户显式配置/强制时才作为 Best Effort 使用。
      return {
        kind: matched.kind,
        path: matched.path,
        version: matched.version,
        evidence: matched.evidence,
        reason: `workspace explicit shell preference: ${options.workspacePreferred}`,
        notes: matched.notes,
      };
    }
  }

  if (isWindows) {
    const ps = shells.find((s) => s.kind === 'powershell');
    const cmd = shells.find((s) => s.kind === 'cmd');

    // 2. 用户显式强制 PowerShell：允许 PS 2～4 Best Effort。
    if (options.forcePowershell && ps?.available) {
      return {
        kind: 'powershell',
        path: ps.path,
        version: ps.version,
        evidence: 'win7_contract',
        reason: 'user forced PowerShell (Best Effort for versions below 5.1)',
        notes: ps.notes,
      };
    }

    // 3. Windows PowerShell >= 5.1 为默认。
    if (ps?.available && ps.version && versionAtLeast(ps.version, POWERSHELL_MIN_VERSION)) {
      return {
        kind: 'powershell',
        path: ps.path,
        version: ps.version,
        evidence: 'win7_contract',
        reason: `Windows PowerShell ${ps.version} >= 5.1 baseline`,
        notes: ps.notes,
      };
    }

    // 4. PowerShell 2～4 或缺失：降级 CMD。
    if (cmd?.available) {
      return {
        kind: 'cmd',
        path: cmd.path,
        evidence: 'win7_contract',
        reason: !ps?.available
          ? 'PowerShell not found; degraded to cmd.exe'
          : `PowerShell ${ps.version ?? 'unknown'} below 5.1 baseline; degraded to cmd.exe`,
        notes: cmd.notes,
      };
    }
  }

  // 5. 非 Windows 开发机替代。
  const devDefault = shells.find((s) => s.available && s.isDefault) ?? shells.find((s) => s.available);
  if (devDefault) {
    return {
      kind: devDefault.kind,
      path: devDefault.path,
      version: devDefault.version,
      evidence: 'dev_host_only',
      reason: 'non-Windows development host substitute',
      notes: devDefault.notes,
    };
  }

  return {
    kind: process.platform === 'win32' ? 'cmd' : 'sh',
    path: process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh',
    evidence: process.platform === 'win32' ? 'win7_contract' : 'dev_host_only',
    reason: 'no shell responded to probes; using platform default without evidence',
  };
}

/**
 * 兼容入口：返回首选激活 Shell。
 */
export function getActiveShell(options: ShellDetectionOptions = {}): DetectedShell {
  const selection = selectShell(options);
  return {
    kind: selection.kind,
    path: selection.path,
    version: selection.version,
    available: true,
    isDefault: true,
    evidence: selection.evidence,
    notes: [selection.reason, selection.notes].filter(Boolean).join('; '),
  };
}
