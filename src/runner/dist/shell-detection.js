"use strict";
/**
 * @module shell-detection
 * @description Windows 7 Shell 探测与选择 (PRD §4 A9-SH01 / ADR-0089 / D-019)
 *
 * 选择合同：工作区显式设置 → Windows PowerShell 5.1 → cmd.exe。
 * PowerShell 2～4 仅 Best Effort，默认降级 CMD，用户显式强制时才使用；
 * PowerShell 缺失时使用 CMD。非 Windows Shell 只作为开发机替代，
 * 不构成 Win7 证据（result.evidence 标记 dev_host_only）。
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveShell = exports.selectShell = exports.detectSystemShells = void 0;
const child_process_1 = require("child_process");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const trusted_shell_environment_1 = require("./trusted-shell-environment");
/** PowerShell 正式基线：Windows PowerShell 5.1（WMF 5.1）。 */
const POWERSHELL_MIN_VERSION = '5.1';
function parseVersion(text) {
    const match = /(\d+)\.(\d+)/.exec(text.trim());
    if (!match)
        return undefined;
    return { major: Number(match[1]), minor: Number(match[2]) };
}
function versionAtLeast(text, baseline) {
    const actual = parseVersion(text);
    const base = parseVersion(baseline);
    if (!actual || !base)
        return false;
    if (actual.major !== base.major)
        return actual.major > base.major;
    return actual.minor >= base.minor;
}
function probePowershell(exe, environment) {
    try {
        const probe = (0, child_process_1.spawnSync)(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
            encoding: 'utf8',
            timeout: 8000,
            windowsHide: true,
            env: environment,
        });
        if (probe.status === 0 && probe.stdout) {
            return { available: true, version: probe.stdout.trim() };
        }
    }
    catch (_err) {
        // fall through
    }
    return { available: false };
}
/**
 * 探测系统可用 Shell。探测本身不缓存：调用方按会话缓存探测结果。
 */
function detectSystemShells(options = {}) {
    const isWindows = process.platform === 'win32';
    const shells = [];
    const environment = (0, trusted_shell_environment_1.createTrustedShellEnvironment)(process.env, {}, options.sensitiveValues);
    if (isWindows) {
        const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
        const powershellPath = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        const ps = probePowershell(powershellPath, environment);
        const psMeetsBaseline = ps.available && ps.version !== undefined && versionAtLeast(ps.version, POWERSHELL_MIN_VERSION);
        shells.push({
            kind: 'powershell',
            path: powershellPath,
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
        // A9 automatic selection is bound to the canonical system host. Do not
        // trust a caller-controlled ComSpec override for the automatic profile.
        const cmdPath = path.win32.join(systemRoot, 'System32', 'cmd.exe');
        let cmdAvailable = false;
        try {
            const probe = (0, child_process_1.spawnSync)(cmdPath, ['/d', '/c', 'ver'], {
                encoding: 'utf8',
                timeout: 5000,
                windowsHide: true,
                env: environment,
            });
            cmdAvailable = probe.status === 0;
        }
        catch (_err) {
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
    }
    else {
        // 非 Windows：仅作为开发机替代，不得冒充 Win7 证据。
        const pwsh = probePowershell('pwsh', environment);
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
exports.detectSystemShells = detectSystemShells;
/**
 * 按 A9-SH01 合同选择 Shell：
 * 工作区显式配置 → Windows PowerShell >= 5.1 → CMD（PS 2～4/缺失降级）。
 */
function selectShell(options = {}) {
    const isWindows = process.platform === 'win32';
    const shells = detectSystemShells(options);
    const lower = (s) => s.toLowerCase().trim();
    // 1. 工作区显式配置优先（匹配 kind 或路径包含）。
    if (options.workspacePreferred) {
        const preferred = lower(options.workspacePreferred);
        const matched = shells.find((s) => s.kind === preferred || lower(s.path).includes(preferred) || preferred.includes(lower(s.kind)));
        if (matched && matched.available) {
            // PS 2～4 只有在用户显式配置/强制时才作为 Best Effort 使用。
            return {
                kind: matched.kind,
                path: matched.path,
                version: matched.version,
                available: true,
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
                available: true,
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
                available: true,
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
                available: true,
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
            available: true,
            evidence: 'dev_host_only',
            reason: 'non-Windows development host substitute',
            notes: devDefault.notes,
        };
    }
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    return {
        kind: process.platform === 'win32' ? 'cmd' : 'sh',
        path: process.platform === 'win32'
            ? path.win32.join(systemRoot, 'System32', 'cmd.exe')
            : '/bin/sh',
        available: false,
        evidence: 'unavailable',
        reason: 'no canonical system shell responded to probes; automatic shell is unavailable',
    };
}
exports.selectShell = selectShell;
/**
 * 兼容入口：返回首选激活 Shell。
 */
function getActiveShell(options = {}) {
    const selection = selectShell(options);
    return {
        kind: selection.kind,
        path: selection.path,
        version: selection.version,
        available: selection.available,
        isDefault: true,
        evidence: selection.evidence,
        notes: [selection.reason, selection.notes].filter(Boolean).join('; '),
    };
}
exports.getActiveShell = getActiveShell;
//# sourceMappingURL=shell-detection.js.map