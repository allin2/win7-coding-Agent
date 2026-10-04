/**
 * @module policy
 * @description Agent Core Policy 引擎 — 工具调用裁决与结构化 argv 验证
 * @remarks ADR-0030: FULL_ACCESS 明令不做；结构化 argv 绝不拼接 shell 字符串（C09）
 */

import { ToolCall, ApprovalLevel, PolicyDecision, PolicyVerdict, CapabilityToken } from './types';
import { bindCapabilityToToolCall } from './approval-binding';
import { policyDeniedError } from './errors';
import { classifyGitCommand, MAX_ANALYZABLE_GIT_COMMAND_BYTES, tokenizeCommand } from './git-command-policy';

const PROHIBITED_SHELL_HOSTS = new Set([
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
  'sh',
  'bash',
  'zsh',
]);

/**
 * 工具名白名单 — 所有允许调用的工具必须在此列表中
 * @remarks 工具名区分大小写，支持中文路径（C10）
 */
const TOOL_WHITELIST: ReadonlySet<string> = new Set([
  // 文件系统只读
  'fs.readFile',
  'fs.readdir',
  'fs.stat',
  'fs.exists',
  'fs.search',
  // 文件系统写入
  'fs.writeFile',
  'fs.mkdir',
  'fs.rename',
  'fs.delete',
  // 代码分析
  'code.analyze',
  'code.search',
  'code.lint',
  // 终端（受限）
  'terminal.exec',
  'terminal.readOutput',
  // Git 操作
  'git.status',
  'git.diff',
  'git.commit',
  'git.log',
  'git.branch',
  // 工作区管理（历史）
  'workspace.create',
  'workspace.list',
  'workspace.delete',
  'workspace.list_directory',
  'workspace.read_text',
  'workspace.search_text',
  'workspace.review_prepare',
  'workspace.str_replace',
  // A9 核心工具集（PRD A9-T01）
  'list',
  'read',
  'search',
  'write',
  'edit',
  'copy',
  'move',
  'delete',
  'shell',
  'update_plan',
]);

const SHELL_DELETE_COMMANDS = new Set(['remove-item', 'ri', 'rm', 'rmdir', 'rd', 'del', 'erase', 'unlink']);
const SHELL_DATA_COMMANDS = new Set(['echo', 'echo.', 'printf', 'rem', '::', 'write-output', 'write-host', 'out-host']);
const SHELL_HOSTS = new Set(['cmd', 'powershell', 'pwsh', 'sh', 'bash', 'dash', 'zsh']);
type ShellImpact = 'delete' | 'publish' | 'system' | 'global_install' | 'unanalysed';
const PACKAGE_COMMANDS = new Set(['npm', 'yarn', 'pnpm', 'cargo', 'twine']);
const PACKAGE_VALUE_OPTIONS: Record<string, Set<string>> = {
  npm: new Set(['--registry', '--tag', '--workspace', '-w', '--prefix', '--cache', '--userconfig', '--globalconfig',
    '--user-agent', '--loglevel', '--otp', '--access', '--scope', '--proxy', '--https-proxy']),
  yarn: new Set(['--registry', '--cwd', '--cache-folder', '--use-yarnrc', '--modules-folder', '--mutex',
    '--network-timeout', '--proxy', '--https-proxy']),
  pnpm: new Set(['--registry', '--tag', '--dir', '-c', '--workspace', '--prefix', '--store-dir', '--config-dir']),
  cargo: new Set(['--registry', '--config', '--manifest-path', '--target', '--target-dir', '--package', '-p',
    '--features', '--jobs', '-j', '--color', '-c']),
  twine: new Set(['--repository', '-r', '--repository-url', '--username', '-u', '--password', '-p',
    '--config-file', '--cert', '--client-cert']),
};

/** Locate the package subcommand; option values such as a registry named publish are data. */
function packageOperation(name: string, args: string[]): ShellImpact | undefined {
  let subcommand: string | undefined;
  let subcommandIndex = -1;
  let global = false;
  let uncertain = false;
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i].replace(/\^(?=.)|`(?=.)/g, '').toLowerCase();
    const option = token.split('=')[0];
    if (PACKAGE_VALUE_OPTIONS[name].has(option)) {
      if (!token.includes('=')) i += 1;
    } else if (token === '-g' || option === '--global') {
      global = token !== '--global=false';
    } else if (!subcommand && token === '--') {
      subcommand = args[++i]?.toLowerCase(); subcommandIndex = i;
      if (subcommand?.startsWith('-')) uncertain = true;
    } else if (!subcommand && !token.startsWith('-')) {
      subcommand = token; subcommandIndex = i;
    } else if (!subcommand && token.startsWith('-') &&
        !['--silent', '--verbose', '--no-color', '--non-interactive', '--offline', '--locked', '--frozen', '--dry-run'].includes(token)) {
      // An unknown option may consume the following token; do not infer a safe
      // subcommand if an explicit publish/upload operation remains later.
      uncertain = true;
    }
  }
  if (subcommand === 'publish' || (name === 'twine' && subcommand === 'upload')) return 'publish';
  if (uncertain && args.some((arg) => /^(?:publish|upload)$/i.test(arg))) return 'publish';
  if (name === 'cargo' && ['install', 'uninstall'].includes(subcommand || '')) return 'global_install';
  if (name === 'yarn' && subcommand === 'global' &&
      ['add', 'remove', 'upgrade', 'upgrade-interactive'].includes(args[subcommandIndex + 1]?.toLowerCase())) return 'global_install';
  if (global && ['install', 'i', 'add', 'remove', 'rm', 'uninstall', 'update', 'upgrade'].includes(subcommand || '')) return 'global_install';
  return undefined;
}

function directShellImpact(name: string, args: string[]): ShellImpact | undefined {
  if (SHELL_DELETE_COMMANDS.has(name)) return 'delete';
  if (PACKAGE_COMMANDS.has(name)) return packageOperation(name, args);
  const action = args[0]?.replace(/\^(?=.)|`(?=.)/g, '').toLowerCase();
  if (name === 'reg' && ['add', 'delete', 'import', 'restore', 'load', 'unload', 'copy', 'save'].includes(action)) return 'system';
  if (name === 'net' && action === 'user') return 'system';
  const serviceAction = name === 'sc' && args[0]?.startsWith('\\\\') ? args[1]?.toLowerCase() : action;
  if (name === 'sc' && ['config', 'create', 'delete', 'start', 'stop', 'pause', 'continue', 'control', 'sdset',
    'failure', 'failureflag', 'description', 'privs', 'sidtype'].includes(serviceAction)) return 'system';
  if (name === 'icacls') return 'system';
  return undefined;
}

function shellCommandName(token: string = ''): string {
  return token.replace(/\^(?=.)|`(?=.)/g, '').replace(/^@/, '').replace(/\\/g, '/').split('/').pop()!.toLowerCase().replace(/\.(?:exe|cmd|bat)$/, '');
}

/** Track only literal executable assignments; do not evaluate variable expressions. */
function recordShellCommandAssignment(segment: string, variables: Map<string, string>, cmdShell: boolean): void {
  if (cmdShell) {
    const assignment = /^@?set\s+(?:"([A-Za-z_]\w*)=([^"]*)"|([A-Za-z_]\w*)=(.*))$/i.exec(segment);
    if (assignment) {
      const key = (assignment[1] || assignment[3]).toLowerCase();
      const value = assignment[2] ?? assignment[4];
      variables.delete(key);
      if (!/[%!^]/.test(value)) variables.set(key, value.trim());
    }
  } else {
    const assignment = /^\$(?:([A-Za-z_]\w*)|\{([A-Za-z_]\w*)\})\s*=\s*(.*)$/.exec(segment);
    if (assignment) {
      const key = (assignment[1] || assignment[2]).toLowerCase();
      const literal = /^(?:'([^']*)'|"([^"$`]*)")$/.exec(assignment[3]);
      variables.delete(key);
      if (literal) variables.set(key, literal[1] ?? literal[2]);
    }
  }
}

function resolveShellCommandToken(token: string = '', variables: Map<string, string>, cmdShell: boolean): string {
  const reference = cmdShell ? /^(?:%([A-Za-z_]\w*)%|!([A-Za-z_]\w*)!)$/.exec(token)
    : /^\$(?:([A-Za-z_]\w*)|\{([A-Za-z_]\w*)\})$/.exec(token);
  return reference ? variables.get((reference[1] || reference[2]).toLowerCase()) ?? token : token;
}

/** Raw words retain data quotes when an unquoted host command spans several arguments. */
function rawShellWords(command: string): string[] {
  const words: string[] = [];
  let start = 0;
  let quote: string | undefined;
  for (let i = 0; i <= command.length; i += 1) {
    const ch = command[i];
    if ((ch === '`' || ch === '^') && command[i + 1] && quote !== "'") { i += 1; continue; }
    if (quote) {
      if (ch === '\\' && quote === '"' && /["\\]/.test(command[i + 1] || '')) i += 1;
      else if (ch === quote) quote = undefined;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (i === command.length || /\s/.test(ch)) {
      if (i > start) words.push(command.slice(start, i));
      start = i + 1;
    }
  }
  if (start < command.length && quote) words.push(command.slice(start));
  return words;
}

/** Find a PowerShell subexpression inside a double-quoted string, without evaluating it. */
function subexpressionEnd(command: string, start: number): number {
  let depth = 1;
  let quote: string | undefined;
  for (let i = start; i < command.length; i += 1) {
    const ch = command[i];
    if (ch === '`' && command[i + 1] && quote !== "'") { i += 1; continue; }
    if (quote) {
      if (ch === quote) {
        if (command[i + 1] === quote) i += 1;
        else quote = undefined;
      }
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')' && --depth === 0) return i;
  }
  return command.length;
}

/**
 * Preserve quoted data and expose executable segments/groups. This is bounded
 * Shell recognition, not a parser or a sandbox. Double-quoted $() is execution;
 * single-quoted text and comments are data. Unsupported execution containing a
 * high-impact operation is handled conservatively by the caller.
 */
function shellExecutionSegments(command: string, cmdShell: boolean): Array<{ command: string; expressions: string[] }> {
  const segments: Array<{ command: string; expressions: string[] }> = [];
  let expressions: string[] = [];
  let current = '';
  let quote: string | undefined;
  const flush = () => {
    if (current.trim()) segments.push({ command: current.trim(), expressions });
    current = ''; expressions = [];
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if ((cmdShell ? ch === '^' : ch === '`') && command[i + 1] && quote !== "'") {
      current += ch + command[++i];
      continue;
    }
    if (quote) {
      if (!cmdShell && quote === '"' && ch === '$' && command[i + 1] === '(') {
        const end = subexpressionEnd(command, i + 2);
        expressions.push(command.slice(i + 2, end));
        current += command.slice(i, end + 1);
        i = end;
        continue;
      }
      current += ch;
      if (ch === '\\' && quote === '"' && /["\\]/.test(command[i + 1] || '')) {
        current += command[++i];
      } else if (ch === quote) {
        if (command[i + 1] === quote) current += command[++i];
        else quote = undefined;
      }
      continue;
    }
    if (!cmdShell && ch === '<' && command[i + 1] === '#') {
      const end = command.indexOf('#>', i + 2);
      if (end < 0) break;
      current += ' ';
      i = end + 1;
    } else if (!cmdShell && ch === '#' && (!current.trim() || /\s/.test(command[i - 1] || ''))) {
      while (i < command.length && !/[\r\n]/.test(command[i])) i += 1;
      flush();
    } else if (ch === '"' || (!cmdShell && ch === "'")) {
      quote = ch;
      current += ch;
    } else if (!cmdShell && ch === '$' && command[i + 1] === '{' &&
        /^\$\{[A-Za-z_]\w*\}/.test(command.slice(i))) {
      const end = command.indexOf('}', i + 2);
      current += command.slice(i, end + 1);
      i = end;
    } else if ((cmdShell ? /[\r\n|&()]/ : /[;\r\n|&(){}]/).test(ch)) {
      flush();
    } else current += ch;
  }
  flush();
  return segments;
}

function shellImpact(command: string, depth = 0, cmdShell = false, commandVariables = new Map<string, string>()): ShellImpact | undefined {
  if (depth > 4) {
    // An unanalysed host can conceal an encoded or nested high-impact payload.
    return /\b(?:remove-item|ri|rm|rmdir|rd|del|erase|unlink|npm|yarn|pnpm|cargo|twine|reg|net|sc|icacls|cmd|powershell|pwsh|sh|bash|dash|zsh)\b/i.test(command.replace(/\^(?=.)|`(?=.)/g, '')) ? 'unanalysed' : undefined;
  }
  // Normalize executable-name escapes only at lookup; escaped delimiters and
  // quoted output remain data. The original command is bound by approval.
  const segments = shellExecutionSegments(command, cmdShell);
  for (const { command: segment, expressions } of segments) {
    // Resolve subexpressions with preceding literal assignments in this command,
    // before treating the enclosing output as data. Child assignments stay local.
    for (const expression of expressions) {
      const impact = shellImpact(expression, depth + 1, false, new Map(commandVariables));
      if (impact) return impact;
    }
    recordShellCommandAssignment(segment, commandVariables, cmdShell);
    let tokens = tokenizeCommand(segment);
    let start = 0;
    while (shellCommandName(tokens[start]) === 'call') start += 1;
    if (shellCommandName(tokens[start]) === 'env') {
      start += 1;
      while (tokens[start] && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[start]) || tokens[start].startsWith('-'))) start += 1;
    }
    const name = shellCommandName(resolveShellCommandToken(tokens[start], commandVariables, cmdShell));
    const direct = directShellImpact(name, tokens.slice(start + 1));
    if (direct) return direct;
    if (SHELL_DATA_COMMANDS.has(name)) continue;

    if (['do', 'else', 'iex', 'invoke-expression'].includes(name)) {
      const rawWords = rawShellWords(segment);
      const payload = start + 1 === tokens.length - 1 ? tokens[start + 1] : rawWords.slice(start + 1).join(' ');
      const impact = shellImpact(payload || '', depth + 1, cmdShell, new Map(commandVariables));
      if (impact) return impact;
      continue;
    }

    if (SHELL_HOSTS.has(name)) {
      // Preserve the quote boundary after a glued host switch (/c"...", -c'...').
      const hostCommand = segment.replace(/(^|\s)([-/][A-Za-z][A-Za-z0-9:/]*)(?=["'])/g, '$1$2 ');
      tokens = tokenizeCommand(hostCommand);
      const rawWords = rawShellWords(hostCommand);
      const rest = (index: number) => index === tokens.length - 1 ? tokens[index] : rawWords.slice(index).join(' ');
      for (let i = start + 1; i < tokens.length; i += 1) {
        const token = tokens[i].replace(/\^(?=.)|`(?=.)/g, '');
        let payload: string | undefined;
        if (name === 'cmd') {
          const match = /\/(?:c|k|r)(.*)$/i.exec(token);
          if (match) payload = [match[1], rest(i + 1)].filter(Boolean).join(' ');
        } else if (name === 'powershell' || name === 'pwsh') {
          const match = /^[-/]([^:]+)(?::(.*))?$/.exec(token);
          const option = match?.[1].toLowerCase();
          if (!option) payload = rest(i);
          else if ('command'.startsWith(option)) payload = [match?.[2], rest(i + 1)].filter(Boolean).join(' ');
          else if ('encodedcommand'.startsWith(option) || option === 'ec') {
            const encoded = match?.[2] || tokens[i + 1] || '';
            if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return 'unanalysed';
            payload = Buffer.from(encoded, 'base64').toString('utf16le');
          } else if ('file'.startsWith(option)) break;
          else if (match?.[2] === undefined && ['executionpolicy', 'ep', 'windowstyle', 'configurationname', 'inputformat', 'outputformat', 'psconsolefile', 'version', 'settingsfile', 'workingdirectory', 'custompipename'].some((value) => value.startsWith(option))) i += 1;
        } else if (/^-[A-Za-z]*c[A-Za-z]*$/.test(token)) payload = rest(i + 1);
        if (payload !== undefined) {
          const impact = shellImpact(payload, depth + 1, name === 'cmd');
          if (impact) return impact;
          break;
        }
      }
      continue;
    }

    // CMD's ungrouped IF predicates precede the executable body. Preserve the
    // data sink in `if exist x echo del y` instead of scanning later words.
    if (name === 'if') {
      let cursor = start + 1;
      if (tokens[cursor]?.toLowerCase() === '/i') cursor += 1;
      if (tokens[cursor]?.toLowerCase() === 'not') cursor += 1;
      if (['exist', 'defined', 'errorlevel', 'cmdextversion'].includes(tokens[cursor]?.toLowerCase())) cursor += 2;
      else if (tokens[cursor]?.includes('==')) cursor += 1;
      else if (['equ', 'neq', 'lss', 'leq', 'gtr', 'geq'].includes(tokens[cursor + 1]?.toLowerCase())) cursor += 3;
      if (cursor > start + 1) {
        const impact = shellImpact(rawShellWords(segment).slice(cursor).join(' '), depth + 1, cmdShell, new Map(commandVariables));
        if (impact) return impact;
        continue;
      }
    }
    // Dynamic assignment/evaluation and unsupported control prefixes with an
    // explicit high-impact command cannot be proven to be ordinary output data.
    if (/^(?:\$|set\b|if\b|for\b|foreach\b|while\b)/i.test(segment)) {
      if (tokens.some((token) => /(?:^|[\s='"])(?:remove-item|ri|rm|rmdir|rd|del|erase|unlink)(?:\.(?:exe|cmd|bat))?(?:$|[\s'"])/i.test(token.replace(/\^(?=.)|`(?=.)/g, '')))) return 'delete';
      for (let i = start + 1; i < tokens.length; i += 1) {
        const nested = directShellImpact(shellCommandName(tokens[i]), tokens.slice(i + 1));
        if (nested) return nested;
        if (/\s/.test(tokens[i]) && /\b(?:npm|yarn|pnpm|cargo|twine|reg|net|sc|icacls)\b/i.test(tokens[i])) {
          const embedded = shellImpact(tokens[i], depth + 1, cmdShell, new Map(commandVariables));
          if (embedded) return embedded;
        }
      }
    }
  }
  return undefined;
}

/**
 * 检查是否属于 A9-M03 规定的必须一次性确认的操作。
 * Git 命令使用 tokenize 分类器（git-command-policy），不依赖可绕过的正则。
 */
function checkAlwaysConfirmOperation(toolCall: ToolCall): { needsConfirm: boolean; reason?: string } {
  if (toolCall.toolName === 'delete' && toolCall.args.permanent === true) {
    return { needsConfirm: true, reason: '永久删除文件/目录操作需要用户显式确认' };
  }
  if (toolCall.toolName === 'shell') {
    const cmd = typeof toolCall.args.command === 'string' ? toolCall.args.command : '';
    if (cmd.trim().length === 0) return { needsConfirm: false };
    // 超出静态分析上限的命令无法证明不含外部写，一律确认（ADR-0137 G06，纵深防御）。
    if (Buffer.byteLength(cmd, 'utf8') > MAX_ANALYZABLE_GIT_COMMAND_BYTES) {
      return {
        needsConfirm: true,
        reason: `Shell 命令超过 ${MAX_ANALYZABLE_GIT_COMMAND_BYTES / 1024} KiB，无法完整分析，需要用户显式确认`,
      };
    }

    // Non-Git high-impact execution must not be masked by autonomous Git.
    const impact = shellImpact(cmd);
    if (impact) {
      const operation = {
        delete: 'Shell 永久删除文件/目录', publish: '发布/上传包', system: '系统服务/注册表/权限变更',
        global_install: '系统级/全局依赖变更', unanalysed: '无法完整分析的潜在高影响Shell',
      }[impact];
      return { needsConfirm: true, reason: `${operation}操作需要用户显式确认（绑定完整命令、目标与参数）` };
    }
    const gitDecision = classifyGitCommand(cmd);
    if (gitDecision) {
      if (gitDecision.category === 'always_confirm') {
        return { needsConfirm: true, reason: `${gitDecision.reason}（${gitDecision.binding.summary}）` };
      }
      if (gitDecision.category === 'commit_requires_user_request') {
        return { needsConfirm: true, reason: `${gitDecision.reason}（${gitDecision.binding.summary}）` };
      }
      return { needsConfirm: false };
    }

  }
  return { needsConfirm: false };
}

/**
 * Validate the command-specific structured execution envelope.
 * Metacharacters inside argv are data when execFile/spawn(shell=false) is used;
 * rejecting them breaks valid filenames and search expressions without adding
 * a security boundary.
 */
function validateArgs(
  toolName: string,
  args: Record<string, unknown>,
): { valid: boolean; reason?: string } {
  if (toolName === 'shell') {
    if (typeof args.command !== 'string' || args.command.trim().length === 0) {
      return { valid: false, reason: 'shell 工具必须提供非空 command 字符串' };
    }
    return { valid: true };
  }
  if (toolName !== 'terminal.exec') return { valid: true };
  if ('shell' in args || 'commandLine' in args || 'script' in args) {
    return {
      valid: false,
      reason: 'terminal.exec 仅接受 command + argv，拒绝 shell/commandLine/script 字符串（C09）',
    };
  }
  if (typeof args.command !== 'string' || args.command.length === 0 || /\s/.test(args.command)) {
    return { valid: false, reason: 'terminal.exec.command 必须是单一可执行文件名，不能包含空白或拼接参数' };
  }
  const basename = args.command.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
  if (PROHIBITED_SHELL_HOSTS.has(basename)) {
    return { valid: false, reason: `禁止通过 terminal.exec 启动 Shell 宿主 ${basename}` };
  }
  if (
    args.argv !== undefined &&
    (!Array.isArray(args.argv) || args.argv.some((arg) => typeof arg !== 'string'))
  ) {
    return { valid: false, reason: 'terminal.exec.argv 必须是字符串数组' };
  }
  return { valid: true };
}

function sensitivePathReason(toolName: string, args: Record<string, unknown>): string | undefined {
  if (!toolName.startsWith('fs.') && !toolName.startsWith('workspace.') && !['read', 'write', 'edit', 'delete'].includes(toolName)) return undefined;
  const target = args.path;
  if (typeof target !== 'string') return undefined;
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  if (/(^|\/)\.env(?:\.|$)/.test(normalized)) return '敏感配置文件 .env 不可由 Agent 工具直接读取或修改';
  if (/(^|\/)\.git(?:\/|$)/.test(normalized)) return '.git 管理目录不可由通用文件工具直接访问；请使用 Git Adapter';
  if (/(^|\/)(windows\/system32\/config\/(sam|security|system)|etc\/(shadow|passwd))$/.test(normalized)) {
    return '系统凭据或账户数据库不可由 Agent 工具访问';
  }
  return undefined;
}

/**
 * Policy 引擎配置
 */
export interface PolicyEngineConfig {
  /** 自定义工具白名单（覆盖默认） */
  toolWhitelist?: Set<string>;
  /** 能力令牌验证回调 */
  tokenValidator?: (tokenId: string) => { valid: boolean; token?: CapabilityToken; reason?: string };
}

/** Facts supplied by an approval/broker boundary. evaluateFacts is pure. */
export interface PolicyFacts {
  sessionId?: string;
  token?: CapabilityToken;
  tokenValidationReason?: string;
  /** Capability declared by the resolved ToolSpec, when available. */
  capability?: string;
}

function decision(verdict: PolicyVerdict, level: ApprovalLevel, ruleId: string, reason: string, conditions?: string[]): PolicyDecision {
  return { verdict, allowed: verdict === PolicyVerdict.ALLOW, level, ruleId, reason, ...(conditions ? { conditions } : {}) };
}

/**
 * Policy 引擎类 — 裁决工具调用是否允许执行
 */
export class PolicyEngine {
  private readonly toolWhitelist: ReadonlySet<string>;
  private readonly tokenValidator?: (tokenId: string) => { valid: boolean; token?: CapabilityToken; reason?: string };

  /**
   * 创建 Policy 引擎实例
   * @param config - 引擎配置
   */
  constructor(config: PolicyEngineConfig = {}) {
    this.toolWhitelist = config.toolWhitelist ?? TOOL_WHITELIST;
    this.tokenValidator = config.tokenValidator;
  }

  /**
   * 评估工具调用是否允许执行
   * @param toolCall - 工具调用请求
   * @param tokenId - 可选的能力令牌 ID（WORKSPACE_WRITE 必需）
   * @returns Policy 裁决结果
   */
  evaluate(toolCall: ToolCall, tokenId?: string, sessionId?: string, capability?: string): PolicyDecision {
    let token: CapabilityToken | undefined;
    let tokenValidationReason: string | undefined;
    if (tokenId) {
      if (!this.tokenValidator) tokenValidationReason = '未配置能力令牌验证器，写操作按 fail-closed 拒绝';
      else {
        const validation = this.tokenValidator(tokenId);
        token = validation.token;
        if (!validation.valid || !token) tokenValidationReason = `能力令牌验证失败: ${validation.reason ?? '未知原因'}`;
      }
    }
    return this.evaluateFacts(toolCall, { sessionId, token, tokenValidationReason, capability });
  }

  evaluateFacts(toolCall: ToolCall, facts: PolicyFacts = {}): PolicyDecision {
    // 1. 工具名白名单验证
    if (!this.toolWhitelist.has(toolCall.toolName)) {
      return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_TOOL_NOT_ALLOWLISTED', `工具 ${toolCall.toolName} 不在白名单内`);
    }

    // 2. 结构化 argv 验证
    const argsValidation = validateArgs(toolCall.toolName, toolCall.args);
    if (!argsValidation.valid) {
      return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_STRUCTURED_ARGS_REQUIRED', argsValidation.reason!);
    }
    const sensitivePath = sensitivePathReason(toolCall.toolName, toolCall.args);
    if (sensitivePath) {
      return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_SENSITIVE_PATH_DENIED', sensitivePath);
    }
    if (toolCall.toolName === 'terminal.exec' && toolCall.approvalLevel !== ApprovalLevel.FULL_ACCESS) {
      return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_COMMAND_PROFILE_REQUIRED', '通用 terminal.exec 尚无经批准的命令配置文件；执行请求按 fail-closed 拒绝');
    }

    if (facts.capability === 'workspace_write' && toolCall.approvalLevel !== ApprovalLevel.WORKSPACE_WRITE && toolCall.approvalLevel !== ApprovalLevel.REVIEW) {
      return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_CAPABILITY_LEVEL_MISMATCH', 'workspace_write capability requires workspace-write approval');
    }

    // 3. 按审批级别裁决
    switch (toolCall.approvalLevel) {
      case ApprovalLevel.READ_ONLY:
        return decision(PolicyVerdict.ALLOW, ApprovalLevel.READ_ONLY, 'POLICY_READ_ONLY_ALLOWED', '只读操作，无需审批');

      case ApprovalLevel.FULL_ACCESS: {
        const confirm = checkAlwaysConfirmOperation(toolCall);
        if (confirm.needsConfirm) {
          return decision(
            PolicyVerdict.ASK,
            ApprovalLevel.FULL_ACCESS,
            'POLICY_ALWAYS_CONFIRM_REQUIRED',
            confirm.reason || '高影响操作需要用户一次性确认',
            ['需用户显式批准目标操作'],
          );
        }
        return decision(PolicyVerdict.ALLOW, ApprovalLevel.FULL_ACCESS, 'POLICY_FULL_ACCESS_ALLOWED', 'Full Access 模式：允许执行');
      }

      case ApprovalLevel.REVIEW:
      case ApprovalLevel.WORKSPACE_WRITE:
        // 需要能力令牌
        if (!facts.token && !facts.tokenValidationReason) {
          return decision(PolicyVerdict.ASK, toolCall.approvalLevel, 'POLICY_APPROVAL_REQUIRED', '工作区写操作需要能力令牌', ['提供有效的 capability token']);
        }
        if (facts.tokenValidationReason || !facts.token) return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_APPROVAL_INVALID', facts.tokenValidationReason ?? '能力令牌验证失败');
        if (!facts.sessionId) return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_SESSION_REQUIRED', '写操作缺少会话标识，无法验证审批绑定');
        const token = facts.token;
        if (!token.capabilities.includes('workspace_write') && !token.capabilities.includes('workspace.review')) {
          return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_CAPABILITY_MISSING', '能力令牌不包含 workspace_write 权限');
        }
        if (token.sessionId !== facts.sessionId) {
          return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_SESSION_MISMATCH', '能力令牌不属于当前会话');
        }
        let expectedBinding;
        try {
          expectedBinding = bindCapabilityToToolCall(toolCall);
        } catch (error) {
          return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_APPROVAL_BINDING_INVALID', error instanceof Error ? error.message : String(error));
        }
        if (
          !token.binding ||
          token.binding.callId !== expectedBinding.callId ||
          token.binding.toolName !== expectedBinding.toolName ||
          token.binding.requestSha256 !== expectedBinding.requestSha256 ||
          token.binding.previewSha256 !== expectedBinding.previewSha256 ||
          token.binding.baselineSha256 !== expectedBinding.baselineSha256
        ) {
          return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_APPROVAL_BINDING_MISMATCH', '能力令牌与工具请求、预览或工作区基线不匹配');
        }
        return decision(PolicyVerdict.ALLOW, toolCall.approvalLevel, 'POLICY_APPROVAL_BOUND', '工作区写操作已授权', ['操作限于工作区目录内']);

      default:
        return decision(PolicyVerdict.DENY, toolCall.approvalLevel, 'POLICY_APPROVAL_LEVEL_FORBIDDEN', `未知的审批级别: ${toolCall.approvalLevel}`);
    }
  }
}

/**
 * 创建默认 Policy 引擎实例
 * @returns 默认 PolicyEngine 实例
 */
export function createPolicyEngine(config?: PolicyEngineConfig): PolicyEngine {
  return new PolicyEngine(config);
}
