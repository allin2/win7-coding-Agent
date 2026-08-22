/**
 * @module git-command-policy
 * @description A9 Trusted Git 命令行为策略 (PRD §6 A9-G02 / ADR-0089)
 *
 * 取代“容易绕过的简单正则”：完整命令字符串先按 shell 引号规则 tokenize，
 * 再按 git 子命令 + 参数结构分类。审批绑定提取 remote、branch、force、
 * 删除目标与完整命令摘要；参数变化即产生不同摘要，旧审批自然失效。
 */

import * as crypto from 'crypto';

export type GitCommandCategory =
  /** 可自主执行：只读与本地安全操作（status/diff/log/branch 列表/fetch/add/stash/merge/rebase）。 */
  | 'autonomous'
  /** 本地写且影响提交历史：仅当用户明确要求时执行（commit）。 */
  | 'commit_requires_user_request'
  /** 外部写 / 破坏性：始终绑定目标的一次性确认。 */
  | 'always_confirm';

export interface GitCommandApprovalBinding {
  /** 目标 remote（push/pull/fetch 涉及时）。 */
  remote?: string;
  /** 目标 branch（push/branch -d 涉及时）。 */
  branch?: string;
  force: boolean;
  /** 删除目标（branch -D / push --delete / clean 的路径）。 */
  deleteTarget?: string;
  /** 完整命令摘要：参数变化后旧审批失效。 */
  commandSha256: string;
  /** 人类可读的操作摘要（审批 UI 展示）。 */
  summary: string;
}

export interface GitCommandDecision {
  category: GitCommandCategory;
  binding: GitCommandApprovalBinding;
  reason: string;
  /** 该 git 操作会修改工作区/提交历史（供诚实完成状态跟踪）。 */
  mutatesWorktree: boolean;
}

/** 按双引号/单引号与反斜杠转义 tokenize（覆盖常见 Shell 语法，不追求完备 shell 语义）。 */
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let hasToken = false;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        current += command[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (hasToken || current.length > 0) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (hasToken || current.length > 0) tokens.push(current);
  return tokens;
}

function findGitStart(tokens: string[]): number {
  // 支持前置包装（env VAR=x git ...、cd x && git ... 之外的常见形式只按 token 序列识别）。
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i].toLowerCase();
    if (t === 'git' || t === 'git.exe' || t.endsWith('/git') || t.endsWith('\\git.exe') || t.endsWith('/git.exe')) return i;
  }
  return -1;
}

const READ_ONLY_SUBCOMMANDS = new Set([
  'status', 'diff', 'log', 'show', 'branch', 'tag', 'remote', 'rev-parse', 'ls-files',
  'ls-remote', 'describe', 'shortlog', 'blame', 'grep', 'cat-file', 'config --get',
  'help', 'version', 'worktree', 'submodule',
]);

const AUTONOMOUS_LOCAL_WRITE = new Set([
  'fetch', 'add', 'stash', 'merge', 'rebase', 'restore', 'switch', 'checkout',
  'commit', 'init', 'apply', 'am', 'cherry-pick', 'revert', 'reset', 'clean',
  'push', 'tag --delete', 'branch --delete', 'mv', 'rm',
]);

/**
 * 分类一条完整命令字符串中的 git 操作。返回 null 表示命令串中没有 git 操作
 * （由其他 shell 策略处理）。
 */
export function classifyGitCommand(command: string): GitCommandDecision | null {
  const tokens = tokenizeCommand(command);
  const gitIndex = findGitStart(tokens);
  if (gitIndex < 0) return null;

  const rest = tokens.slice(gitIndex + 1);
  // 跳过全局选项及其带值参数。
  let i = 0;
  while (i < rest.length && rest[i].startsWith('-')) {
    if (['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(rest[i]) && i + 1 < rest.length) {
      i += 2;
    } else {
      i += 1;
    }
  }
  const subcommand = (rest[i] || '').toLowerCase();
  if (!subcommand) {
    return {
      category: 'autonomous',
      binding: bindingFor(command, { summary: 'git (no subcommand)' }),
      reason: 'bare git invocation treated as read-only',
      mutatesWorktree: false,
    };
  }

  const args = rest.slice(i + 1);
  const force = args.some((a) => /^(-f|--force)$/.test(a)) || subcommand === 'push' && args.some((a) => a.startsWith('-') && a.includes('force'));

  if (subcommand === 'push') {
    const nonFlags = args.filter((a) => !a.startsWith('-'));
    const remote = nonFlags[0] ?? 'origin';
    const refspec = nonFlags[1];
    const branch = refspec?.split(':').pop()?.replace(/^refs\/heads\//, '');
    const deletesRemoteRef = args.some((a) => a === '--delete' || a === '-d');
    return {
      category: 'always_confirm',
      binding: bindingFor(command, {
        remote,
        branch,
        force: force || (refspec !== undefined && refspec.startsWith('+')),
        deleteTarget: deletesRemoteRef ? (branch ?? remote) : undefined,
        summary: `git push${force ? ' (force)' : ''}${deletesRemoteRef ? ' (delete remote ref)' : ''} remote=${remote}${branch ? ` branch=${branch}` : ''}`,
      }),
      reason: '外部 git push 写远端，始终需要绑定目标的确认',
      mutatesWorktree: false,
    };
  }

  if (subcommand === 'reset') {
    const hard = args.some((a) => /^--hard$/.test(a));
    if (hard) {
      return {
        category: 'always_confirm',
        binding: bindingFor(command, { force: true, summary: `git reset --hard ${args.filter((a) => !a.startsWith('-')).join(' ')}`.trim() }),
        reason: 'git reset --hard 丢弃工作区/索引修改，破坏性操作',
        mutatesWorktree: true,
      };
    }
    return autonomous(command, 'git reset (soft/mixed) is a local operation', true);
  }

  if (subcommand === 'clean') {
    const target = args.filter((a) => !a.startsWith('-')).join(' ');
    return {
      category: 'always_confirm',
      binding: bindingFor(command, { deleteTarget: target || '.', force: true, summary: `git clean ${args.join(' ')}` }),
      reason: 'git clean 删除未跟踪文件，破坏性操作',
      mutatesWorktree: true,
    };
  }

  if (subcommand === 'branch') {
    const deletes = args.some((a) => a === '-d' || a === '-D' || a === '--delete' || a === '--delete-force');
    if (deletes) {
      const target = lastNonFlag(args) ?? '';
      const looksRemote = target.includes('/') || args.some((a) => a === '-r' || a === '--remotes');
      if (looksRemote || args.some((a) => a === '-D')) {
        return {
          category: 'always_confirm',
          binding: bindingFor(command, { deleteTarget: target, force: args.some((a) => a === '-D'), summary: `git branch delete ${target}` }),
          reason: '删除分支（远端或强制）是破坏性操作',
          mutatesWorktree: true,
        };
      }
      return {
        category: 'always_confirm',
        binding: bindingFor(command, { deleteTarget: target, force: false, summary: `git branch delete ${target}` }),
        reason: '删除本地分支需要确认',
        mutatesWorktree: true,
      };
    }
    // branch 列表/创建。
    if (args.filter((a) => !a.startsWith('-')).length === 0) {
      return autonomous(command, 'git branch listing is read-only');
    }
    return autonomous(command, 'git branch create/rename is a local write', true);
  }

  if (subcommand === 'tag') {
    if (args.some((a) => a === '-d' || a === '--delete')) {
      const target = lastNonFlag(args) ?? '';
      return {
        category: 'always_confirm',
        binding: bindingFor(command, { deleteTarget: target, summary: `git tag delete ${target}` }),
        reason: '删除标签需要确认',
        mutatesWorktree: true,
      };
    }
    return autonomous(command, 'git tag create/list is local', args.filter((a) => !a.startsWith('-')).length > 0);
  }

  if (subcommand === 'commit') {
    return {
      category: 'commit_requires_user_request',
      binding: bindingFor(command, { summary: `git commit ${args.filter((a) => !a.startsWith('-')).join(' ')}`.trim() }),
      reason: '仅在用户明确要求时才创建 commit',
      mutatesWorktree: true,
    };
  }

  if (READ_ONLY_SUBCOMMANDS.has(subcommand)) {
    // remote add/remove 是配置写。
    if (subcommand === 'remote' && (args[0] === 'add' || args[0] === 'remove' || args[0] === 'rm' || args[0] === 'set-url')) {
      return {
        category: 'always_confirm',
        binding: bindingFor(command, { remote: lastNonFlag(args), summary: `git remote ${args.join(' ')}` }),
        reason: '修改 remote 配置需要确认',
        mutatesWorktree: false,
      };
    }
    return autonomous(command, `git ${subcommand} is read-only`);
  }

  if (AUTONOMOUS_LOCAL_WRITE.has(subcommand)) {
    return autonomous(command, `git ${subcommand} is a local operation`, MUTATING_LOCAL_SUBCOMMANDS.has(subcommand));
  }

  // 未知子命令：保守按需确认，防止新破坏性子命令绕过。
  return {
    category: 'always_confirm',
    binding: bindingFor(command, { summary: `git ${subcommand} ${args.join(' ')}`.slice(0, 160) }),
    reason: `git 子命令 ${subcommand} 未在策略中列为可自主执行，保守要求确认`,
    mutatesWorktree: true,
  };
}

function autonomous(command: string, reason: string, mutatesWorktree = false): GitCommandDecision {
  return { category: 'autonomous', binding: bindingFor(command, { summary: command.slice(0, 160) }), reason, mutatesWorktree };
}

/** 本地写但可自主执行的 git 子命令（影响工作区/暂存区/提交历史）。 */
const MUTATING_LOCAL_SUBCOMMANDS = new Set([
  'add', 'stash', 'merge', 'rebase', 'restore', 'switch', 'checkout', 'apply',
  'am', 'cherry-pick', 'revert', 'init', 'mv', 'rm',
]);

function bindingFor(
  command: string,
  partial: { remote?: string; branch?: string; force?: boolean; deleteTarget?: string; summary: string },
): GitCommandApprovalBinding {
  return {
    ...(partial.remote !== undefined ? { remote: partial.remote } : {}),
    ...(partial.branch !== undefined ? { branch: partial.branch } : {}),
    force: partial.force ?? false,
    ...(partial.deleteTarget !== undefined && partial.deleteTarget.length > 0 ? { deleteTarget: partial.deleteTarget } : {}),
    commandSha256: crypto.createHash('sha256').update(command, 'utf8').digest('hex'),
    summary: partial.summary,
  };
}

function firstNonFlag(args: string[]): string | undefined {
  return args.find((a) => !a.startsWith('-'));
}

function lastNonFlag(args: string[]): string | undefined {
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (!args[i].startsWith('-')) return args[i];
  }
  return undefined;
}

/**
 * 审批是否仍然有效：命令摘要一致（参数变化后旧审批失效）。
 */
export function gitApprovalStillValid(
  originalCommandSha256: string,
  currentCommand: string,
): boolean {
  const current = crypto.createHash('sha256').update(currentCommand, 'utf8').digest('hex');
  return originalCommandSha256 === current;
}
