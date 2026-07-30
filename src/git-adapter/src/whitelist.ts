/**
 * @module git-adapter/whitelist
 * @description Git 命令白名单 — 读类/写类/网络类/禁止命令
 * @remarks
 * - 读类（READ）：始终允许
 * - 写类（WRITE）：需审批
 * - 网络类（NETWORK）：v1 禁止
 * - 其他未列命令：默认禁止（fail-closed）
 */

import { GitCommandCategory, GitCommandDef, GitRequest } from './types';

/**
 * Git 命令白名单注册表
 * @remarks 键格式为 "command" 或 "command:subcommand"
 */
const WHITELIST: Map<string, GitCommandDef> = new Map([
  // === 读类命令（允许） ===
  ['status', {
    command: 'status',
    subcommand: '',
    category: GitCommandCategory.READ,
    allowed: true,
  }],
  ['diff', {
    command: 'diff',
    subcommand: '',
    category: GitCommandCategory.READ,
    allowed: true,
  }],
  ['log', {
    command: 'log',
    subcommand: '',
    category: GitCommandCategory.READ,
    allowed: true,
  }],
  ['show', {
    command: 'show',
    subcommand: '',
    category: GitCommandCategory.READ,
    allowed: true,
  }],
  ['branch', {
    command: 'branch',
    subcommand: '',
    category: GitCommandCategory.READ,
    allowed: true,
  }],
  ['worktree:list', {
    command: 'worktree',
    subcommand: 'list',
    category: GitCommandCategory.READ,
    allowed: true,
  }],
  ['rev-parse', {
    command: 'rev-parse',
    subcommand: '',
    category: GitCommandCategory.READ,
    allowed: true,
  }],
  ['cat-file', {
    command: 'cat-file',
    subcommand: '',
    category: GitCommandCategory.READ,
    allowed: true,
  }],
  ['ls-files', {
    command: 'ls-files',
    subcommand: '',
    category: GitCommandCategory.READ,
    allowed: true,
  }],
  ['tag', {
    command: 'tag',
    subcommand: '',
    category: GitCommandCategory.READ,
    allowed: true,
  }],

  // === 写类命令（需审批） ===
  ['add', {
    command: 'add',
    subcommand: '',
    category: GitCommandCategory.WRITE,
    allowed: true,
  }],
  ['commit', {
    command: 'commit',
    subcommand: '',
    category: GitCommandCategory.WRITE,
    allowed: true,
  }],
  ['worktree:add', {
    command: 'worktree',
    subcommand: 'add',
    category: GitCommandCategory.WRITE,
    allowed: true,
  }],
  ['checkout', {
    command: 'checkout',
    subcommand: '',
    category: GitCommandCategory.WRITE,
    allowed: true,
  }],
  ['restore', {
    command: 'restore',
    subcommand: '',
    category: GitCommandCategory.WRITE,
    allowed: true,
  }],

  // === 网络类命令（v1 禁止） ===
  ['fetch', {
    command: 'fetch',
    subcommand: '',
    category: GitCommandCategory.NETWORK,
    allowed: false,
  }],
  ['push', {
    command: 'push',
    subcommand: '',
    category: GitCommandCategory.NETWORK,
    allowed: false,
  }],
  ['clone', {
    command: 'clone',
    subcommand: '',
    category: GitCommandCategory.NETWORK,
    allowed: false,
  }],
  ['pull', {
    command: 'pull',
    subcommand: '',
    category: GitCommandCategory.NETWORK,
    allowed: false,
  }],

  // === 禁止命令（显式列出） ===
  ['config:--global', {
    command: 'config',
    subcommand: '--global',
    category: GitCommandCategory.NETWORK,
    allowed: false,
  }],
  ['rebase:--interactive', {
    command: 'rebase',
    subcommand: '--interactive',
    category: GitCommandCategory.WRITE,
    allowed: false,
  }],
]);

/**
 * 白名单验证结果
 */
export interface WhitelistResult {
  /** 命令是否在白名单中 */
  found: boolean;
  /** 命令定义（如果找到） */
  commandDef?: GitCommandDef;
  /** 是否允许执行 */
  allowed: boolean;
  /** 拒绝原因（如果不允许） */
  reason?: string;
}

/**
 * 查找白名单中的命令定义
 * @param command - Git 命令名
 * @param subcommand - Git 子命令（可选）
 * @returns 命令定义，未找到时返回 undefined
 */
export function findCommandDef(command: string, subcommand?: string): GitCommandDef | undefined {
  if (subcommand) {
    const key = `${command}:${subcommand}`;
    if (WHITELIST.has(key)) {
      return WHITELIST.get(key);
    }
  }
  return WHITELIST.get(command);
}

/**
 * 验证 Git 请求是否在白名单中并允许执行
 * @param request - Git 执行请求
 * @returns 白名单验证结果
 * @remarks fail-closed：未在白名单中的命令默认拒绝
 */
export function validateWhitelist(request: GitRequest): WhitelistResult {
  const { command, args } = request;

  // 提取子命令（第一个参数如果不是 - 开头的选项）
  const subcommand = args.length > 0 && !args[0].startsWith('-') ? args[0] : undefined;

  // 查找白名单
  const commandDef = findCommandDef(command, subcommand);

  if (!commandDef) {
    return {
      found: false,
      allowed: false,
      reason: `Command "${command}${subcommand ? ' ' + subcommand : ''}" is not in the whitelist — denied by fail-closed policy`,
    };
  }

  if (!commandDef.allowed) {
    return {
      found: true,
      commandDef,
      allowed: false,
      reason: `Command "${command}${subcommand ? ' ' + subcommand : ''}" is prohibited (category: ${commandDef.category})`,
    };
  }

  // 网络类命令 v1 禁止
  if (commandDef.category === GitCommandCategory.NETWORK) {
    return {
      found: true,
      commandDef,
      allowed: false,
      reason: `Network command "${command}" is prohibited in v1`,
    };
  }

  return {
    found: true,
    commandDef,
    allowed: true,
  };
}

/**
 * 获取命令的分类信息
 * @param command - Git 命令名
 * @param subcommand - Git 子命令（可选）
 * @returns 命令分类，未找到时返回 undefined
 */
export function getCommandCategory(command: string, subcommand?: string): GitCommandCategory | undefined {
  const def = findCommandDef(command, subcommand);
  return def?.category;
}
