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
        const next = command[i + 1];
        // Windows paths commonly appear inside CMD /c double-quoted payloads.
        // A backslash before an ordinary path character is data, not a shell
        // escape; dropping it can turn an absolute ...\git.exe into an
        // unrecognised token and bypass the always-confirm Git policy.
        if (next === '"' || next === '\\') {
          current += next;
          i += 1;
          continue;
        }
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

function isGitExecutable(token: string): boolean {
  const value = token.replace(/^@/, '').replace(/^[({]+/, '').replace(/[)}]+$/, '').toLowerCase();
  return value === 'git' || value === 'git.exe' || value.endsWith('/git') ||
    value.endsWith('\\git.exe') || value.endsWith('/git.exe');
}

function shellKeyword(token: string | undefined): string {
  return (token || '').replace(/^@/, '').replace(/^[({]+/, '').replace(/[)}]+$/, '').toLowerCase();
}

const GIT_PROSE_COMMANDS = new Set([
  'echo', 'echo.', 'printf', 'rem', '::', 'write-output', 'write-host', 'out-host',
]);

function gitTokenIndex(tokens: string[], start: number): number {
  const executable = shellKeyword(tokens[start]);
  if (GIT_PROSE_COMMANDS.has(executable) || executable.startsWith('#')) return -1;
  const index = tokens.findIndex((token, tokenIndex) => tokenIndex >= start && isGitExecutable(token));
  if (index < 0) return -1;
  if (tokens.slice(start, index).some((token) => GIT_PROSE_COMMANDS.has(shellKeyword(token)))) return -1;
  return index;
}

function exposeControlPunctuation(command: string): string {
  let result = '';
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (quote) {
      result += ch;
      if (ch === quote && command[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      result += ch;
    } else if (ch === '(' || ch === ')' || ch === '{' || ch === '}') {
      result += ` ${ch} `;
    } else {
      result += ch;
    }
  }
  return result;
}

function normalizeEmbeddedGitTokens(tokens: string[]): string[] {
  const normalized = [...tokens];
  normalized[0] = normalized[0].replace(/^[({]+/, '');
  const last = normalized.length - 1;
  normalized[last] = normalized[last].replace(/[)}]+$/, '');
  return normalized;
}

function conservativeGitDecision(command: string): GitCommandDecision {
  return {
    category: 'always_confirm',
    binding: bindingFor(command, { summary: 'unclassified compound Git execution (full command digest bound)' }),
    reason: '复合 Shell 中检测到 Git 可执行词但无法完整分类，保守要求目标绑定确认',
    mutatesWorktree: true,
  };
}

/**
 * Extract the executable body of the two control-flow forms used by the
 * supported Win7 shells. This is deliberately narrower than a shell parser:
 * prose such as `echo git push` remains data, while an actual command after a
 * CMD `if` or inside a PowerShell script block is classified recursively.
 */
function unwrapConditionalPayload(tokens: string[], start: number): string | undefined {
  if (shellKeyword(tokens[start]) !== 'if') return undefined;

  // PowerShell: if (<condition>) { <command> }
  const blockIndex = tokens.findIndex((token, index) => index > start && token.startsWith('{'));
  if (blockIndex >= 0) {
    const first = tokens[blockIndex].replace(/^\{+/, '');
    return [first, ...tokens.slice(blockIndex + 1)].filter(Boolean).join(' ');
  }

  // CMD: if [not] exist <path> <command>, plus the equivalent one-argument
  // predicates. Do not scan arbitrary later words: the command itself is
  // recursively classified, which avoids treating `if exist x echo git push`
  // as Git execution.
  let cursor = start + 1;
  if (shellKeyword(tokens[cursor]) === 'not') cursor += 1;
  const predicate = shellKeyword(tokens[cursor]);
  if (['exist', 'defined', 'errorlevel', 'cmdextversion'].includes(predicate)) {
    cursor += 2;
  } else if ((tokens[cursor] || '').includes('==')) {
    cursor += 1;
  } else {
    return undefined;
  }
  return cursor < tokens.length ? tokens.slice(cursor).join(' ') : undefined;
}

function executableIndex(tokens: string[]): number {
  let index = 0;
  while (index < tokens.length && (tokens[index] === '&' || tokens[index].toLowerCase() === 'call')) index += 1;
  if (tokens[index]?.toLowerCase() === 'env') {
    index += 1;
    while (index < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]) || tokens[index].startsWith('-'))) index += 1;
  }
  return index;
}

function shellBasename(token: string): string {
  return token.replace(/^@/, '').replace(/\\/g, '/').split('/').pop()!.toLowerCase();
}

/** Split executable command segments while preserving text inside shell quotes. */
function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < command.length; index += 1) {
    const ch = command[index];
    if (quote) {
      current += ch;
      if (ch === quote && command[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '\r' || ch === '|' || ch === '&') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      if ((ch === '|' || ch === '&') && command[index + 1] === ch) index += 1;
      continue;
    }
    current += ch;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function unwrapShellPayload(tokens: string[], start: number): string | undefined {
  const shell = shellBasename(tokens[start] || '');
  if (shell === 'cmd' || shell === 'cmd.exe') {
    const commandIndex = tokens.findIndex((token, index) => index > start && token.toLowerCase() === '/c');
    return commandIndex >= 0 ? tokens.slice(commandIndex + 1).join(' ') : undefined;
  }
  if (shell === 'powershell' || shell === 'powershell.exe' || shell === 'pwsh' || shell === 'pwsh.exe') {
    const encodedIndex = tokens.findIndex((token, index) => index > start && /^-(?:encodedcommand|enc)$/i.test(token));
    if (encodedIndex >= 0 && tokens[encodedIndex + 1]) {
      try {
        const decoded = Buffer.from(tokens[encodedIndex + 1], 'base64').toString('utf16le');
        return decoded.length <= 256 * 1024 ? decoded : undefined;
      } catch (_error) {
        return undefined;
      }
    }
    const commandIndex = tokens.findIndex((token, index) => index > start && /^-(?:command|c)$/i.test(token));
    return commandIndex >= 0 ? tokens.slice(commandIndex + 1).join(' ') : undefined;
  }
  return undefined;
}

const READ_ONLY_SUBCOMMANDS = new Set([
  'status', 'diff', 'log', 'show', 'branch', 'tag', 'remote', 'rev-parse', 'ls-files',
  'ls-remote', 'describe', 'shortlog', 'blame', 'grep', 'cat-file', 'config --get',
  'help', 'version', 'worktree', 'submodule',
]);

const AUTONOMOUS_LOCAL_WRITE = new Set([
  'fetch', 'pull', 'add', 'stash', 'merge', 'rebase', 'restore', 'switch', 'checkout',
  'commit', 'init', 'apply', 'am', 'cherry-pick', 'revert', 'reset', 'clean',
  'push', 'tag --delete', 'branch --delete', 'mv', 'rm',
]);

/**
 * 分类一条完整命令字符串中的 git 操作。返回 null 表示命令串中没有 git 操作
 * （由其他 shell 策略处理）。
 */
export function classifyGitCommand(command: string): GitCommandDecision | null {
  const decisions = collectGitDecisions(command, command, 0);
  if (decisions.length === 0) {
    return containsExecutableGitRisk(command) ? conservativeGitDecision(command) : null;
  }
  const rank: Record<GitCommandCategory, number> = {
    autonomous: 1,
    commit_requires_user_request: 2,
    always_confirm: 3,
  };
  const highestRank = Math.max(...decisions.map((decision) => rank[decision.category]));
  const highest = decisions.filter((decision) => rank[decision.category] === highestRank);
  const selected = highest[0];
  const summaries = Array.from(new Set(highest.map((decision) => decision.binding.summary)));
  return {
    ...selected,
    binding: {
      ...selected.binding,
      ...(summaries.length > 1 ? { summary: `compound git operations: ${summaries.join(' | ')}`.slice(0, 320) } : {}),
    },
    ...(summaries.length > 1
      ? { reason: `复合 Shell 包含 ${summaries.length} 个同级 Git 操作，整条原始命令需要一次性目标绑定确认` }
      : {}),
    mutatesWorktree: decisions.some((decision) => decision.mutatesWorktree),
  };
}

function collectGitDecisions(command: string, originalCommand: string, depth: number): GitCommandDecision[] {
  if (depth > 4 || command.length > 256 * 1024) return [];
  const decisions: GitCommandDecision[] = [];
  for (const segment of splitShellSegments(command)) {
    const tokens = tokenizeCommand(exposeControlPunctuation(segment));
    const start = executableIndex(tokens);
    if (start >= tokens.length) continue;
    const embeddedGitIndex = gitTokenIndex(tokens, start);
    if (embeddedGitIndex >= 0) {
      decisions.push(classifyGitTokens(normalizeEmbeddedGitTokens(tokens.slice(embeddedGitIndex)), originalCommand));
      continue;
    }
    const payload = unwrapShellPayload(tokens, start);
    if (payload !== undefined && payload.trim() !== segment.trim()) {
      decisions.push(...collectGitDecisions(payload, originalCommand, depth + 1));
      continue;
    }
    const conditionalPayload = unwrapConditionalPayload(tokens, start);
    if (conditionalPayload !== undefined && conditionalPayload.trim() !== segment.trim()) {
      decisions.push(...collectGitDecisions(conditionalPayload, originalCommand, depth + 1));
    }
  }
  return decisions;
}

function containsExecutableGitRisk(command: string): boolean {
  // This fallback is used for parser depth/size limits and unfamiliar control
  // syntax. Known prose sinks remain exempt; all other executable-looking Git
  // tokens fail closed instead of becoming indistinguishable from “no Git”.
  for (const segment of splitShellSegments(command)) {
    const tokens = tokenizeCommand(exposeControlPunctuation(segment));
    const start = executableIndex(tokens);
    if (start < tokens.length && gitTokenIndex(tokens, start) >= 0) return true;
  }
  return false;
}

function classifyGitTokens(tokens: string[], originalCommand: string): GitCommandDecision {
  const gitIndex = 0;

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
      binding: bindingFor(originalCommand, { summary: 'git (no subcommand)' }),
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
      binding: bindingFor(originalCommand, {
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
        binding: bindingFor(originalCommand, { force: true, summary: `git reset --hard ${args.filter((a) => !a.startsWith('-')).join(' ')}`.trim() }),
        reason: 'git reset --hard 丢弃工作区/索引修改，破坏性操作',
        mutatesWorktree: true,
      };
    }
    return autonomous(originalCommand, 'git reset (soft/mixed) is a local operation', true);
  }

  if (subcommand === 'clean') {
    const target = args.filter((a) => !a.startsWith('-')).join(' ');
    return {
      category: 'always_confirm',
      binding: bindingFor(originalCommand, { deleteTarget: target || '.', force: true, summary: `git clean ${args.join(' ')}` }),
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
          binding: bindingFor(originalCommand, { deleteTarget: target, force: args.some((a) => a === '-D'), summary: `git branch delete ${target}` }),
          reason: '删除分支（远端或强制）是破坏性操作',
          mutatesWorktree: true,
        };
      }
      return {
        category: 'always_confirm',
        binding: bindingFor(originalCommand, { deleteTarget: target, force: false, summary: `git branch delete ${target}` }),
        reason: '删除本地分支需要确认',
        mutatesWorktree: true,
      };
    }
    // branch 列表/创建。
    if (args.filter((a) => !a.startsWith('-')).length === 0) {
      return autonomous(originalCommand, 'git branch listing is read-only');
    }
    return autonomous(originalCommand, 'git branch create/rename is a local write', true);
  }

  if (subcommand === 'tag') {
    if (args.some((a) => a === '-d' || a === '--delete')) {
      const target = lastNonFlag(args) ?? '';
      return {
        category: 'always_confirm',
        binding: bindingFor(originalCommand, { deleteTarget: target, summary: `git tag delete ${target}` }),
        reason: '删除标签需要确认',
        mutatesWorktree: true,
      };
    }
    return autonomous(originalCommand, 'git tag create/list is local', args.filter((a) => !a.startsWith('-')).length > 0);
  }

  if (subcommand === 'commit') {
    return {
      category: 'commit_requires_user_request',
      binding: bindingFor(originalCommand, { summary: `git commit ${args.filter((a) => !a.startsWith('-')).join(' ')}`.trim() }),
      reason: '仅在用户明确要求时才创建 commit',
      mutatesWorktree: true,
    };
  }

  if (READ_ONLY_SUBCOMMANDS.has(subcommand)) {
    // remote add/remove 是配置写。
    if (subcommand === 'remote' && (args[0] === 'add' || args[0] === 'remove' || args[0] === 'rm' || args[0] === 'set-url')) {
      return {
        category: 'always_confirm',
        binding: bindingFor(originalCommand, { remote: lastNonFlag(args), summary: `git remote ${args.join(' ')}` }),
        reason: '修改 remote 配置需要确认',
        mutatesWorktree: false,
      };
    }
    return autonomous(originalCommand, `git ${subcommand} is read-only`);
  }

  if (AUTONOMOUS_LOCAL_WRITE.has(subcommand)) {
    return autonomous(originalCommand, `git ${subcommand} is a local operation`, MUTATING_LOCAL_SUBCOMMANDS.has(subcommand));
  }

  // 未知子命令：保守按需确认，防止新破坏性子命令绕过。
  return {
    category: 'always_confirm',
    binding: bindingFor(originalCommand, { summary: `git ${subcommand} ${args.join(' ')}`.slice(0, 160) }),
    reason: `git 子命令 ${subcommand} 未在策略中列为可自主执行，保守要求确认`,
    mutatesWorktree: true,
  };
}

function autonomous(command: string, reason: string, mutatesWorktree = false): GitCommandDecision {
  return { category: 'autonomous', binding: bindingFor(command, { summary: command.slice(0, 160) }), reason, mutatesWorktree };
}

/** 本地写但可自主执行的 git 子命令（影响工作区/暂存区/提交历史）。 */
const MUTATING_LOCAL_SUBCOMMANDS = new Set([
  'pull', 'add', 'stash', 'merge', 'rebase', 'restore', 'switch', 'checkout', 'apply',
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
