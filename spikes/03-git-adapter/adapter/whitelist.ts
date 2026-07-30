/**
 * SPIKE 03 - 命令白名单
 *
 * Git 命令白名单验证：
 *   - 读类命令：status, diff, log, show, branch, worktree list
 *   - 写类命令：add, commit, worktree add
 *   - 禁止命令：config --global, fetch, push, clone 等
 *
 * TypeScript target: ES2020
 * Win7-Validation: NOT_PERFORMED
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface WhitelistResult {
  /** 是否允许 */
  allowed: boolean;
  /** 命令类型 */
  commandType?: 'read' | 'write';
  /** 拒绝原因 */
  reason?: string;
}

interface WhitelistRule {
  /** 命令名称 */
  command: string;
  /** 命令类型 */
  type: 'read' | 'write';
  /** 允许的子命令（可选） */
  subcommands?: string[];
  /** 禁止的参数模式（可选） */
  forbiddenArgs?: RegExp[];
}

// ─── 白名单规则 ──────────────────────────────────────────────────────────────

/** 读类命令白名单 */
const READ_COMMANDS: WhitelistRule[] = [
  { command: 'status', type: 'read' },
  { command: 'diff', type: 'read' },
  { command: 'log', type: 'read' },
  { command: 'show', type: 'read' },
  { command: 'branch', type: 'read', subcommands: ['-l', '--list', '-a', '-r'] },
  { command: 'worktree', type: 'read', subcommands: ['list'] },
  { command: 'tag', type: 'read', subcommands: ['-l', '--list'] },
  { command: 'remote', type: 'read', subcommands: ['-v', '--verbose'] },
  { command: 'rev-parse', type: 'read' },
  { command: 'cat-file', type: 'read' },
  { command: 'ls-files', type: 'read' },
  { command: 'ls-tree', type: 'read' },
  { command: 'blame', type: 'read' },
  { command: 'grep', type: 'read' },
];

/** 写类命令白名单 */
const WRITE_COMMANDS: WhitelistRule[] = [
  { command: 'add', type: 'write' },
  { command: 'commit', type: 'write' },
  { command: 'worktree', type: 'write', subcommands: ['add'] },
  { command: 'checkout', type: 'write', 
    forbiddenArgs: [/--orphan/, /-B/] // 禁止危险操作
  },
  { command: 'reset', type: 'write',
    forbiddenArgs: [/--hard/] // 禁止 hard reset
  },
  { command: 'rm', type: 'write' },
  { command: 'mv', type: 'write' },
];

/** 明确禁止的命令（无论参数） */
const FORBIDDEN_COMMANDS: string[] = [
  'config',        // 防止修改全局配置（N10）
  'fetch',         // 防止网络操作
  'push',          // 防止网络操作
  'pull',          // 防止网络操作
  'clone',         // 防止网络操作
  'submodule',     // 防止子模块操作（可能执行恶意代码）
  'init',          // 防止初始化新仓库
  'gc',            // 防止垃圾回收（可能影响性能）
  'fsck',          // 防止文件系统检查
  'prune',         // 防止剪枝
  'reflog',        // 防止操作引用日志
  'rebase',        // 防止变基（可能导致冲突）
  'merge',         // 防止合并
  'cherry-pick',   // 防止摘取
  'revert',        // 防止回退
  'stash',         // 防止暂存操作
  'clean',         // 防止清理未跟踪文件
  'bisect',        // 防止二分查找
];

/** 禁止的参数模式（适用于所有命令） */
const FORBIDDEN_ARG_PATTERNS: RegExp[] = [
  /--global/,           // 禁止全局配置
  /--system/,           // 禁止系统配置
  /--upload-pack/,      // 禁止上传包
  /--receive-pack/,     // 禁止接收包
  /--exec/,             // 禁止执行命令
  /--upload-arch/,      // 禁止上传归档
];

// ─── 白名单类 ───────────────────────────────────────────────────────────────

/**
 * Git 命令白名单验证器
 */
class Whitelist {
  private readCommands: Map<string, WhitelistRule>;
  private writeCommands: Map<string, WhitelistRule>;
  private forbiddenCommands: Set<string>;

  constructor() {
    this.readCommands = new Map(READ_COMMANDS.map(r => [r.command, r]));
    this.writeCommands = new Map(WRITE_COMMANDS.map(r => [r.command, r]));
    this.forbiddenCommands = new Set(FORBIDDEN_COMMANDS);
  }

  /**
   * 验证 git 命令是否在白名单中
   * 
   * @param args - git 命令参数数组（如 ['status', '--porcelain']）
   * @returns 验证结果
   */
  validate(args: string[]): WhitelistResult {
    if (!args || args.length === 0) {
      return { allowed: false, reason: '空命令' };
    }

    // 提取命令名称（跳过 -c 参数）
    const commandName = this.extractCommand(args);
    if (!commandName) {
      return { allowed: false, reason: '无法提取命令名称' };
    }

    // 检查是否在禁止列表中
    if (this.forbiddenCommands.has(commandName)) {
      return { 
        allowed: false, 
        reason: `命令 "${commandName}" 被明确禁止` 
      };
    }

    // 检查禁止的参数模式
    for (const arg of args) {
      for (const pattern of FORBIDDEN_ARG_PATTERNS) {
        if (pattern.test(arg)) {
          return {
            allowed: false,
            reason: `参数 "${arg}" 匹配禁止模式`,
          };
        }
      }
    }

    // 检查读命令白名单
    const readRule = this.readCommands.get(commandName);
    if (readRule) {
      return this.validateRule(readRule, args);
    }

    // 检查写命令白名单
    const writeRule = this.writeCommands.get(commandName);
    if (writeRule) {
      return this.validateRule(writeRule, args);
    }

    // 未知命令
    return {
      allowed: false,
      reason: `未知命令 "${commandName}"`,
    };
  }

  /**
   * 获取所有允许的命令列表
   */
  getAllowedCommands(): { read: string[]; write: string[] } {
    return {
      read: Array.from(this.readCommands.keys()),
      write: Array.from(this.writeCommands.keys()),
    };
  }

  /**
   * 从参数中提取命令名称
   * @private
   */
  private extractCommand(args: string[]): string | null {
    // 跳过 -c 参数及其值
    let i = 0;
    while (i < args.length && args[i] === '-c') {
      i += 2; // 跳过 -c 和它的值
    }
    
    if (i >= args.length) {
      return null;
    }
    
    return args[i];
  }

  /**
   * 验证特定规则
   * @private
   */
  private validateRule(rule: WhitelistRule, args: string[]): WhitelistResult {
    // 检查子命令限制
    if (rule.subcommands && rule.subcommands.length > 0) {
      const subcommand = this.extractSubcommand(args);
      if (subcommand && !rule.subcommands.includes(subcommand)) {
        return {
          allowed: false,
          reason: `子命令 "${subcommand}" 不在允许列表中`,
        };
      }
    }

    // 检查禁止的参数
    if (rule.forbiddenArgs) {
      for (const arg of args) {
        for (const pattern of rule.forbiddenArgs) {
          if (pattern.test(arg)) {
            return {
              allowed: false,
              reason: `参数 "${arg}" 对命令 "${rule.command}" 被禁止`,
            };
          }
        }
      }
    }

    return {
      allowed: true,
      commandType: rule.type,
    };
  }

  /**
   * 提取子命令
   * @private
   */
  private extractSubcommand(args: string[]): string | null {
    const commandName = this.extractCommand(args);
    const commandIndex = args.indexOf(commandName!);
    if (commandIndex + 1 < args.length) {
      const next = args[commandIndex + 1];
      // 如果下一个参数不是选项（不以 - 开头），则视为子命令
      if (!next.startsWith('-')) {
        return next;
      }
    }
    return null;
  }
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

export {
  Whitelist,
  WhitelistResult,
  WhitelistRule,
  READ_COMMANDS,
  WRITE_COMMANDS,
  FORBIDDEN_COMMANDS,
  FORBIDDEN_ARG_PATTERNS,
};
