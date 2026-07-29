/**
 * @module policy
 * @description Agent Core Policy 引擎 — 工具调用裁决与结构化 argv 验证
 * @remarks ADR-0030: FULL_ACCESS 明令不做；结构化 argv 绝不拼接 shell 字符串（C09）
 */

import { ToolCall, ApprovalLevel, PolicyDecision, CapabilityToken } from './types';
import { policyDeniedError } from './errors';

/**
 * Shell 元字符正则 — 用于检测参数中是否包含 shell 注入风险字符
 * @remarks 匹配: | ; && || ` $() ${} 换行符
 */
const SHELL_META_REGEX = /[|;&`$]|\$\(|\$\{|\|\||&&|\n|\r/;

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
  // 工作区管理
  'workspace.create',
  'workspace.list',
  'workspace.delete',
]);

/**
 * 检查值中是否包含 shell 元字符（递归检查）
 * @param value - 待检查的值
 * @returns 是否包含 shell 元字符
 */
function containsShellMetaChars(value: unknown): boolean {
  if (typeof value === 'string') {
    return SHELL_META_REGEX.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsShellMetaChars(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((v) =>
      containsShellMetaChars(v),
    );
  }
  return false;
}

/**
 * 验证工具调用参数的结构化安全性
 * @param args - 工具调用参数
 * @returns 验证结果
 */
function validateArgs(args: Record<string, unknown>): { valid: boolean; reason?: string } {
  if (containsShellMetaChars(args)) {
    return {
      valid: false,
      reason: '参数中包含 shell 元字符，违反结构化 argv 约束（C09）',
    };
  }
  return { valid: true };
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
  evaluate(toolCall: ToolCall, tokenId?: string): PolicyDecision {
    // 1. 工具名白名单验证
    if (!this.toolWhitelist.has(toolCall.toolName)) {
      return {
        allowed: false,
        level: toolCall.approvalLevel,
        reason: `工具 ${toolCall.toolName} 不在白名单内`,
      };
    }

    // 2. 结构化 argv 验证
    const argsValidation = validateArgs(toolCall.args);
    if (!argsValidation.valid) {
      return {
        allowed: false,
        level: toolCall.approvalLevel,
        reason: argsValidation.reason,
      };
    }

    // 3. 按审批级别裁决
    switch (toolCall.approvalLevel) {
      case ApprovalLevel.READ_ONLY:
        return {
          allowed: true,
          level: ApprovalLevel.READ_ONLY,
          reason: '只读操作，无需审批',
        };

      case ApprovalLevel.WORKSPACE_WRITE:
        // 需要能力令牌
        if (!tokenId) {
          return {
            allowed: false,
            level: ApprovalLevel.WORKSPACE_WRITE,
            reason: '工作区写操作需要能力令牌',
            conditions: ['提供有效的 capability token'],
          };
        }
        if (this.tokenValidator) {
          const validation = this.tokenValidator(tokenId);
          if (!validation.valid) {
            return {
              allowed: false,
              level: ApprovalLevel.WORKSPACE_WRITE,
              reason: `能力令牌验证失败: ${validation.reason ?? '未知原因'}`,
            };
          }
          // 检查令牌是否包含 workspace_write 能力
          if (validation.token && !validation.token.capabilities.includes('workspace_write')) {
            return {
              allowed: false,
              level: ApprovalLevel.WORKSPACE_WRITE,
              reason: '能力令牌不包含 workspace_write 权限',
            };
          }
        }
        return {
          allowed: true,
          level: ApprovalLevel.WORKSPACE_WRITE,
          reason: '工作区写操作已授权',
          conditions: ['操作限于工作区目录内'],
        };

      case ApprovalLevel.FULL_ACCESS:
        // ADR-0030: 明令不做，始终拒绝
        return {
          allowed: false,
          level: ApprovalLevel.FULL_ACCESS,
          reason: 'FULL_ACCESS 级别已被 ADR-0030 明令禁止',
        };

      default:
        return {
          allowed: false,
          level: toolCall.approvalLevel,
          reason: `未知的审批级别: ${toolCall.approvalLevel}`,
        };
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
