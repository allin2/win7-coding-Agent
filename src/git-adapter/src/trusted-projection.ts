/**
 * @module trusted-projection
 * @description A9 Trusted Git 状态投影 (PRD §6 A9-G01 / ADR-0089)
 *
 * UI 的 Git 状态/Diff 使用本结构化投影：只读子命令白名单 + 用户真实 Git
 * 配置（非隔离），并探测 hooks/filters/textconv/credential helper 等外部
 * 执行机制供 UI 提示。真实 Git 写命令仍走 TrustedShellRunner + 行为策略；
 * 本模块绝不执行写操作。非 Git 工作区返回显式降级，不抛异常。
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface TrustedGitExternalMechanism {
  kind: 'hooks' | 'hooks_path_override' | 'filter' | 'textconv' | 'credential_helper' | 'pager' | 'fsmonitor' | 'ssh_command';
  detail: string;
}

export interface TrustedGitStatusEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
}

export interface TrustedGitProjection {
  schemaVersion: '1.0';
  isGit: boolean;
  /** 非 Git 工作区的降级说明（完整 Agent 能力保留）。 */
  degradedReason?: string;
  branch?: string;
  head?: string;
  ahead?: number;
  behind?: number;
  clean?: boolean;
  entries: TrustedGitStatusEntry[];
  diffPreview: string;
  diffTruncated: boolean;
  /** 仓库存在外部执行机制（hooks/filters/helpers）时如实列出。 */
  externalMechanisms: TrustedGitExternalMechanism[];
  notes: string[];
}

const MAX_DIFF_BYTES = 512 * 1024;
const READ_ONLY_COMMANDS = new Set(['status', 'rev-parse', 'diff', 'log', 'branch', 'config', 'remote', 'describe']);

function execGit(
  workDir: string,
  args: string[],
  options: { observeConfigOnly?: boolean; disabledFilters?: string[] } = {},
): Promise<{ code: number; stdout: string; stderr: string } | null> {
  return new Promise((resolve) => {
    try {
      // Projection is an observation path, not a request to execute repository
      // callbacks. `git config` itself only reads configuration and must remain
      // unmodified so we can report the real effective fsmonitor setting.
      const filterOverrides = (options.disabledFilters || []).flatMap((name) => [
        '-c', `filter.${name}.clean=`,
        '-c', `filter.${name}.smudge=`,
        '-c', `filter.${name}.process=`,
        '-c', `filter.${name}.required=false`,
      ]);
      const safeArgs = options.observeConfigOnly
        ? args
        : ['-c', 'core.fsmonitor=false', ...filterOverrides, ...args];
      execFile('git', safeArgs, {
        cwd: workDir,
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: '0',
          GIT_PAGER: 'cat',
          PAGER: 'cat',
          GIT_TERMINAL_PROMPT: '0',
        },
      }, (err, stdout, stderr) => {
        const code = err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0;
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      });
    } catch (_err) {
      resolve(null);
    }
  });
}

/**
 * 投影一个工作区的 Git 状态。所有 git 子命令限定只读白名单。
 */
export async function projectTrustedGit(workDir: string): Promise<TrustedGitProjection> {
  const notes: string[] = [];
  const projection: TrustedGitProjection = {
    schemaVersion: '1.0',
    isGit: false,
    entries: [],
    diffPreview: '',
    diffTruncated: false,
    externalMechanisms: [],
    notes,
  };

  if (!workDir || !fs.existsSync(workDir)) {
    projection.degradedReason = '工作区目录不存在';
    return projection;
  }

  const toplevel = await execGit(workDir, ['rev-parse', '--show-toplevel']);
  if (!toplevel || toplevel.code !== 0) {
    projection.degradedReason = '当前工作区不是 Git 仓库（或 git 不可用）；Agent 文件/Shell 能力不受影响，仅无 Git 状态/Diff 投影。';
    return projection;
  }

  projection.isGit = true;

  const filterConfig = await execGit(
    workDir,
    ['config', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|smudge|process|required)$'],
    { observeConfigOnly: true },
  );
  const disabledFilters = filterConfig?.code === 0
    ? Array.from(new Set(filterConfig.stdout.split(/\r?\n/).map((line) => {
      const match = /^filter\.(.+)\.(?:clean|smudge|process|required)$/.exec(line.trim());
      return match ? match[1] : '';
    }).filter(Boolean)))
    : [];

  const branchResult = await execGit(workDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  projection.branch = branchResult?.code === 0 ? branchResult.stdout.trim() : undefined;

  const headResult = await execGit(workDir, ['rev-parse', 'HEAD']);
  projection.head = headResult?.code === 0 ? headResult.stdout.trim() : undefined;

  const statusResult = await execGit(workDir, ['status', '--porcelain=v1', '-b'], { disabledFilters });
  if (statusResult && statusResult.code === 0) {
    for (const line of statusResult.stdout.split('\n')) {
      if (!line) continue;
      if (line.startsWith('##')) {
        const aheadMatch = /ahead (\d+)/.exec(line);
        const behindMatch = /behind (\d+)/.exec(line);
        if (aheadMatch) projection.ahead = Number(aheadMatch[1]);
        if (behindMatch) projection.behind = Number(behindMatch[1]);
        continue;
      }
      projection.entries.push({
        indexStatus: line.slice(0, 1),
        worktreeStatus: line.slice(1, 2),
        path: line.slice(3),
      });
    }
    projection.clean = projection.entries.length === 0;
  }

  const diffResult = await execGit(workDir, [
    'diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--stat', '--patch', `--unified=3`,
  ], { disabledFilters });
  if (diffResult && diffResult.code === 0) {
    if (diffResult.stdout.length > MAX_DIFF_BYTES) {
      projection.diffPreview = diffResult.stdout.slice(0, MAX_DIFF_BYTES);
      projection.diffTruncated = true;
    } else {
      projection.diffPreview = diffResult.stdout;
    }
  }

  projection.externalMechanisms = await detectExternalMechanisms(workDir);

  if (projection.externalMechanisms.length > 0) {
    notes.push('该仓库存在 hooks/filters/helpers 等外部执行机制：Trusted Full Access 经 Shell 使用用户真实 Git 环境时，这些机制拥有当前用户执行权（ADR-0089）。');
  }
  notes.push('本投影只读；模型的真实 Git 写命令经 TrustedShellRunner 与行为策略执行。');
  return projection;
}

/**
 * 探测仓库/用户配置中的外部执行机制（提示用途，不阻断）。
 */
export async function detectExternalMechanisms(workDir: string): Promise<TrustedGitExternalMechanism[]> {
  const mechanisms: TrustedGitExternalMechanism[] = [];

  const hooksPath = await execGit(workDir, ['config', '--get', 'core.hooksPath'], { observeConfigOnly: true });
  if (hooksPath?.code === 0 && hooksPath.stdout.trim()) {
    mechanisms.push({ kind: 'hooks_path_override', detail: `core.hooksPath=${hooksPath.stdout.trim()}` });
  } else {
    const defaultHooksDir = path.join(workDir, '.git', 'hooks');
    try {
      if (fs.existsSync(defaultHooksDir)) {
        const activeHooks = fs.readdirSync(defaultHooksDir).filter((name) => !name.endsWith('.sample') && !name.startsWith('.'));
        if (activeHooks.length > 0) {
          mechanisms.push({ kind: 'hooks', detail: `active hooks: ${activeHooks.join(', ')}` });
        }
      }
    } catch (_err) { /* unreadable hooks dir */ }
  }

  for (const attrFile of [path.join(workDir, '.gitattributes'), path.join(workDir, '.git', 'info', 'attributes')]) {
    try {
      if (!fs.existsSync(attrFile)) continue;
      const text = fs.readFileSync(attrFile, 'utf8');
      if (/(^|\s)filter\b/.test(text)) mechanisms.push({ kind: 'filter', detail: `${attrFile} 定义了 filter` });
      if (/(^|\s)diff\s*=\s*\S+/.test(text) && /(^|\s)diff\b/.test(text)) {
        const named = /diff\s*=\s*(\S+)/.exec(text);
        if (named) mechanisms.push({ kind: 'textconv', detail: `${attrFile}: diff=${named[1]}` });
      }
    } catch (_err) { /* unreadable */ }
  }

  const credentialHelper = await execGit(workDir, ['config', '--get', 'credential.helper'], { observeConfigOnly: true });
  if (credentialHelper?.code === 0 && credentialHelper.stdout.trim()) {
    mechanisms.push({ kind: 'credential_helper', detail: `credential.helper=${credentialHelper.stdout.trim()}` });
  }

  const pager = await execGit(workDir, ['config', '--get', 'core.pager'], { observeConfigOnly: true });
  if (pager?.code === 0 && pager.stdout.trim() && pager.stdout.trim() !== 'cat') {
    mechanisms.push({ kind: 'pager', detail: `core.pager=${pager.stdout.trim()}` });
  }

  const fsmonitor = await execGit(workDir, ['config', '--get', 'core.fsmonitor'], { observeConfigOnly: true });
  if (fsmonitor?.code === 0 && fsmonitor.stdout.trim() && fsmonitor.stdout.trim() !== 'false') {
    mechanisms.push({ kind: 'fsmonitor', detail: `core.fsmonitor=${fsmonitor.stdout.trim()}` });
  }

  const sshCommand = await execGit(workDir, ['config', '--get', 'core.sshCommand'], { observeConfigOnly: true });
  if (sshCommand?.code === 0 && sshCommand.stdout.trim()) {
    mechanisms.push({ kind: 'ssh_command', detail: `core.sshCommand=${sshCommand.stdout.trim()}` });
  }

  return mechanisms;
}

export { READ_ONLY_COMMANDS };
