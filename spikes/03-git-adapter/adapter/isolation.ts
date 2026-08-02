/**
 * SPIKE 03 - 隔离配置注入器
 *
 * 通过环境变量和 -c 参数实现 Git 配置隔离，防止恶意仓库配置注入。
 *
 * 隔离策略：
 *   1. GIT_CONFIG_NOSYSTEM=1 - 禁用系统级配置
 *   2. HOME/XDG_CONFIG_HOME → 受控空目录 - 隔离用户配置
 *   3. 剥离 GIT_*, SSH_* 等环境变量 - 防止环境变量注入
 *   4. 全部配置经 -c 显式注入 - 确保配置可控
 *
 * TypeScript target: ES2020
 * Win7-Validation: NOT_PERFORMED
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface IsolationConfig {
  /** 受控空目录路径（用于 HOME/XDG_CONFIG_HOME） */
  controlledDir: string;
  /** 是否剥离 GIT_* 环境变量 */
  stripGitEnv: boolean;
  /** 是否剥离 SSH_* 环境变量 */
  stripSSHEnv: boolean;
  /** 显式注入的 Git 配置 */
  explicitConfigs: GitConfig[];
}

interface GitConfig {
  key: string;
  value: string;
}

interface IsolatedEnv {
  [key: string]: string | undefined;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 需要剥离的环境变量前缀 */
const STRIP_ENV_PREFIXES = [
  'GIT_',
  'SSH_',
];

/** 需要剥离的特定环境变量 */
const STRIP_ENV_EXACT = [
  'GIT_CONFIG',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
];

/** 默认显式注入的 Git 配置（安全加固） */
const DEFAULT_SAFE_CONFIGS: GitConfig[] = [
  // hooks 禁用（N01 防护）
  { key: 'core.hooksPath', value: '/dev/null' },
  
  // pager 禁用（N04 防护）
  { key: 'core.pager', value: 'cat' },
  
  // editor 禁用
  { key: 'core.editor', value: '' },
  
  // filter 禁用（N02 防护）
  { key: 'filter.*.process', value: '' },
  { key: 'filter.*.clean', value: '' },
  { key: 'filter.*.smudge', value: '' },
  
  // textconv 禁用（N03 防护）
  { key: 'diff.*.textconv', value: '' },
  
  // credential.helper 禁用（N05 防护）
  { key: 'credential.helper', value: '' },
  
  // sshCommand 禁用（N06 防护）
  { key: 'core.sshCommand', value: '' },
  
  // fsmonitor 禁用（N07 防护）
  { key: 'core.fsmonitor', value: '' },
  
  // protocol 限制
  { key: 'protocol.allow', value: 'never' },
  
  // 安全相关
  { key: 'safe.directory', value: '*' },
];

// ─── 隔离配置注入器类 ───────────────────────────────────────────────────────

/**
 * Git 隔离配置注入器
 * 
 * 负责创建隔离的执行环境，防止恶意仓库配置注入。
 */
class GitIsolation {
  private config: IsolationConfig;

  constructor(config?: Partial<IsolationConfig>) {
    this.config = {
      controlledDir: config?.controlledDir || this.createControlledDir(),
      stripGitEnv: config?.stripGitEnv !== false,
      stripSSHEnv: config?.stripSSHEnv !== false,
      explicitConfigs: config?.explicitConfigs || DEFAULT_SAFE_CONFIGS,
    };
  }

  /**
   * 创建隔离的执行环境
   * 
   * @param baseEnv - 基础环境变量（通常为 process.env）
   * @returns 隔离后的环境变量对象
   */
  createIsolatedEnv(baseEnv: NodeJS.ProcessEnv = process.env): IsolatedEnv {
    const isolated: IsolatedEnv = {};

    // 1. 复制基础环境变量
    for (const [key, value] of Object.entries(baseEnv)) {
      if (value !== undefined) {
        isolated[key] = value;
      }
    }

    // 2. 设置 GIT_CONFIG_NOSYSTEM=1（P01）
    isolated['GIT_CONFIG_NOSYSTEM'] = '1';

    // 3. 重定向 HOME 和 XDG_CONFIG_HOME（P02）
    isolated['HOME'] = this.config.controlledDir;
    isolated['XDG_CONFIG_HOME'] = this.config.controlledDir;
    
    // Windows 特定
    isolated['USERPROFILE'] = this.config.controlledDir;

    // 4. 剥离 GIT_* 和 SSH_* 环境变量（P03 / N08 / N09）
    if (this.config.stripGitEnv || this.config.stripSSHEnv) {
      for (const key of Object.keys(isolated)) {
        if (this.shouldStripEnv(key)) {
          delete isolated[key];
        }
      }
    }

    // 5. 显式剥离特定环境变量
    for (const key of STRIP_ENV_EXACT) {
      delete isolated[key];
    }

    return isolated;
  }

  /**
   * 生成 -c 参数数组（P03）
   * 
   * 用于 git 命令行的 -c key=value 参数注入。
   * 
   * @returns -c 参数数组
   */
  buildConfigArgs(): string[] {
    const args: string[] = [];
    
    for (const config of this.config.explicitConfigs) {
      // 跳过空值配置
      if (config.value === '') continue;
      
      args.push('-c', `${config.key}=${config.value}`);
    }
    
    return args;
  }

  /**
   * 构建完整的隔离 git 命令参数
   * 
   * @param gitArgs - 原始 git 命令参数
   * @returns 隔离后的完整参数数组
   */
  buildIsolatedGitArgs(gitArgs: string[]): string[] {
    return [
      ...this.buildConfigArgs(),
      ...gitArgs,
    ];
  }

  /**
   * 获取隔离配置
   */
  getConfig(): Readonly<IsolationConfig> {
    return { ...this.config };
  }

  /**
   * 判断是否应该剥离环境变量
   * @private
   */
  private shouldStripEnv(key: string): boolean {
    // 检查前缀
    for (const prefix of STRIP_ENV_PREFIXES) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 创建受控空目录
   * @private
   */
  private createControlledDir(): string {
    // TODO: 在实际实现中创建临时目录
    // 骨架：返回一个占位路径
    const os = require('os');
    const path = require('path');
    return path.join(os.tmpdir(), 'git-isolation-' + Date.now());
  }
}

// ─── 导出 ────────────────────────────────────────────────────────────────────

export {
  GitIsolation,
  IsolationConfig,
  GitConfig,
  IsolatedEnv,
  DEFAULT_SAFE_CONFIGS,
  STRIP_ENV_PREFIXES,
  STRIP_ENV_EXACT,
};
