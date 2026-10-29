import * as path from 'path';

export interface EnvironmentFactsInput {
  platform?: string;
  release?: string;
  arch?: string;
  shell?: { kind?: string; version?: string; explicit?: boolean };
  runtime?: { node?: string; electron?: string };
  pathDirs: string[];
  /** Only reports a regular file; this does not establish executability. */
  exists: (candidate: string) => boolean;
}

const MAX_FACT_BYTES = 1536;
const MAX_PATH_DIRS = 32;

function bounded(value: string, budget: number): string {
  let used = 0;
  let text = '';
  for (const character of value) {
    const bytes = Buffer.byteLength(character, 'utf8');
    if (used + bytes > budget) return text + '…';
    text += character;
    used += bytes;
  }
  return text;
}

// Values are data inside a system fact block, never markup or extra lines.
function display(value: string | undefined, budget = 48): string {
  return bounded(value || '未知', budget).replace(/[\x00-\x1f\x7f<>]/g, '?');
}

export function buildEnvironmentFacts(input: EnvironmentFactsInput): string {
  const platform = input.platform || '未知';
  const release = input.release || '未知';
  const win7 = platform === 'win32' && /^6\.1\./.test(release);
  const shell = input.shell || {};
  const shellKind = shell.kind || '未知';
  const shellVersion = shell.version || '未知';
  const shellSelection = shell.explicit === true ? '用户显式选择' : shell.explicit === false ? '自动选择' : '未知';
  const lines = [
    `系统：${win7 ? 'Windows 7（NT 6.1；SP 未独立验证）' : display(platform)}；release=${display(release)}；arch=${display(input.arch)}`,
    `Shell：${display(shellKind)}；版本=${display(shellVersion)}；来源=${shellSelection}`,
    `宿主运行时：Node=${display(input.runtime?.node)}；Electron=${display(input.runtime?.electron)}（非 PATH 工具版本）`,
    '工具发现：本轮仅检查 PATH 文件；版本/可运行性=UNKNOWN；按需用 shell 验证。',
  ];
  if (win7) {
    lines.push('Win7：系统不自带 curl.exe/tar.exe；超过 260 字符路径可能失败；中文路径注意编码。');
    const major = Number.parseInt(shellVersion, 10);
    if (/powershell/i.test(shellKind) && Number.isFinite(major) && major < 3) {
      lines.push('PowerShell 2：不可使用 Invoke-WebRequest、ConvertFrom-Json、Get-FileHash。');
    }
    if (/^cmd$/i.test(shellKind)) lines.push('当前 Shell 为 CMD，请使用 CMD 语法。');
  }

  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const names = platform === 'win32'
    ? { git: 'git.exe', node: 'node.exe', python: 'python.exe', npm: 'npm.cmd' }
    : { git: 'git', node: 'node', python: 'python', npm: 'npm' };
  // Limit before normalizing: even a maliciously large PATH gets bounded work.
  const dirs = input.pathDirs.slice(0, MAX_PATH_DIRS);
  const toolLines = Object.entries(names).map(([tool, name]) => {
    if (input.pathDirs.length === 0) return `${tool}=未知（PATH 为空）`;
    let incomplete = input.pathDirs.length > MAX_PATH_DIRS;
    let priorUnknown = false;
    const seen = new Set<string>();
    for (const raw of dirs) {
      const dir = raw.replace(/^"(.*)"$/, '$1');
      // Avoid implicit cwd lookup and network I/O during fact collection.
      if (!dir || dir.length > 2048 || /[\x00-\x1f\x7f]/.test(dir) || !pathApi.isAbsolute(dir) ||
          (platform === 'win32' && (!/^[a-z]:[\\/]/i.test(dir) || /^[\\/]{2}/.test(dir)))) {
        incomplete = true;
        priorUnknown = true;
        continue;
      }
      const key = platform === 'win32' ? dir.toLowerCase() : dir;
      if (seen.has(key)) continue;
      seen.add(key);
      const candidate = pathApi.join(dir, name);
      try {
        if (input.exists(candidate)) {
          return `${tool}=发现文件 ${display(candidate, 160)}${priorUnknown ? '（更早路径未知）' : ''}`;
        }
      } catch (_error) { incomplete = true; priorUnknown = true; }
    }
    return `${tool}=${incomplete ? '未知（发现不完整）' : 'PATH 中未发现'}`;
  });
  const prefix = lines.join('\n');
  // Allocate equal per-tool space, preserving every status and the caveats above.
  const remaining = Math.max(0, MAX_FACT_BYTES - Buffer.byteLength(prefix, 'utf8') - toolLines.length);
  const perTool = Math.floor(remaining / toolLines.length);
  return prefix + toolLines.map((line) => '\n' + bounded(line, Math.max(0, perTool - 3))).join('');
}
