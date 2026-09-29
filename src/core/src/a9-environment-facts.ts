import * as path from 'path';

export interface EnvironmentFactsInput {
  platform?: string;
  release?: string;
  arch?: string;
  shell?: { kind?: string; version?: string; explicit?: boolean };
  pathDirs: string[];
  exists: (candidate: string) => boolean;
}

export function buildEnvironmentFacts(input: EnvironmentFactsInput): string {
  const platform = input.platform || '未知';
  const release = input.release || '未知';
  const arch = input.arch || '未知';
  const win7 = platform === 'win32' && /^6\.1\./.test(release);
  const shell = input.shell || {};
  const shellKind = shell.kind || '未知';
  const shellVersion = shell.version || '未知';
  const shellSelection = shell.explicit === true ? '用户显式选择' : shell.explicit === false ? '自动选择' : '未知';
  const toolNames = platform === 'win32'
    ? { git: 'git.exe', node: 'node.exe', python: 'python.exe', npm: 'npm.cmd' }
    : { git: 'git', node: 'node', python: 'python', npm: 'npm' };
  const toolFacts = Object.entries(toolNames).map(([tool, name]) => {
    if (input.pathDirs.length === 0) return `${tool}=未知`;
    let uncertain = false;
    for (const dir of input.pathDirs) {
      try { if (input.exists(path.join(dir, name))) return `${tool}=PATH 中存在`; }
      catch (_error) { uncertain = true; }
    }
    return `${tool}=${uncertain ? '未知' : 'PATH 中未发现'}`;
  });
  const lines = [
    `系统：${win7 ? 'Windows 7 SP1（NT 6.1）' : platform}；release=${release}；arch=${arch}`,
    `Shell：${shellKind}；版本=${shellVersion}；来源=${shellSelection}`,
    `工具：${toolFacts.join('；')}`,
  ];
  if (win7) {
    lines.push('Win7 注意：系统不自带 curl.exe 或 tar.exe；超过 260 字符的路径可能失败；中文路径需注意编码。');
    const major = Number.parseInt(shellVersion, 10);
    if (/powershell/i.test(shellKind) && Number.isFinite(major) && major < 3) {
      lines.push('当前 PowerShell 版本不可使用 Invoke-WebRequest、ConvertFrom-Json、Get-FileHash 等较新命令。');
    }
    if (/^cmd$/i.test(shellKind)) lines.push('当前 Shell 为 CMD，请使用 CMD 语法。');
  }
  const content = lines.join('\n');
  if (Buffer.byteLength(content, 'utf8') <= 1536) return content;
  let bounded = '';
  for (const character of content) {
    if (Buffer.byteLength(bounded + character, 'utf8') > 1536) break;
    bounded += character;
  }
  return bounded;
}
