/**
 * @module policy
 * @description Agent Core Policy 引擎 — 工具调用裁决与结构化 argv 验证
 * @remarks ADR-0030: FULL_ACCESS 明令不做；结构化 argv 绝不拼接 shell 字符串（C09）
 */

import { ToolCall, ApprovalLevel, PolicyDecision, PolicyVerdict, CapabilityToken } from './types';
import { bindCapabilityToToolCall } from './approval-binding';
import { policyDeniedError } from './errors';
import { classifyGitCommand } from './git-command-policy';

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

    // 非 Git 的外部写/系统级操作。
    const nonGit = cmd.trim();
    if (/\b(?:npm|yarn|pnpm|cargo|twine)\s+publish\b/i.test(nonGit)) {
      return { needsConfirm: true, reason: '发布/上传包操作需要用户显式确认' };
    }
    if (/\btwine\s+upload\b/i.test(nonGit)) {
      return { needsConfirm: true, reason: '发布/上传包操作需要用户显式确认' };
    }
    if (/\b(?:reg(?:\.exe)?\s+(?:add|delete|import)|net(?:\.exe)?\s+user|sc(?:\.exe)?\s+(?:config|create|delete)|icacls(?:\.exe)?)\b/i.test(nonGit)) {
      return { needsConfirm: true, reason: '系统服务/注册表/权限变更操作需要用户显式确认' };
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
