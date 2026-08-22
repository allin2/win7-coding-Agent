/**
 * @module a9-tools
 * @description A9 Trusted Agent Runtime 工具规格与目录生成
 * @remarks 依据 PRD §3 A9-T01 / ADR-0089 定义统一的简短、稳定工具面
 */

import { ApprovalLevel, PermissionMode } from './types';
import { ToolRegistry, ToolSpec } from './tools';

/**
 * 生成 A9 核心工具规格列表
 * @param mode 权限模式（默认 FULL_ACCESS）
 */
export function a9ToolSpecs(mode: PermissionMode = PermissionMode.FULL_ACCESS): ToolSpec[] {
  const writeLevel = mode === PermissionMode.FULL_ACCESS
    ? ApprovalLevel.FULL_ACCESS
    : mode === PermissionMode.REVIEW
      ? ApprovalLevel.REVIEW
      : ApprovalLevel.READ_ONLY;

  const readOnlyTools: ToolSpec[] = [
    {
      schemaVersion: '2.0',
      name: 'list',
      description: '列出目录内容，支持递归或单层扫描、条目上限与输出预算控制。',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'workspace.list',
      inputSchema: {
        properties: {
          path: {
            type: 'string',
            description: '目录路径，留空或 "." 表示当前工作区根目录。',
            default: '',
          },
          recursive: {
            type: 'boolean',
            description: '是否递归列出子目录（默认 false）。',
            default: false,
          },
          maxEntries: {
            type: 'number',
            description: '最大返回条目数。',
            default: 500,
            minimum: 1,
            maximum: 2000,
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
    {
      schemaVersion: '2.0',
      name: 'read',
      description: '读取文本文件内容（带行号、范围、编码探测）或识别二进制文件元数据。',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'workspace.read',
      inputSchema: {
        properties: {
          path: {
            type: 'string',
            description: '文件路径（相对工作区或绝对路径）。',
          },
          startLine: {
            type: 'number',
            description: '起始行号（1-based，默认 1）。',
            default: 1,
            minimum: 1,
          },
          maxLines: {
            type: 'number',
            description: '最大读取行数（默认 200）。',
            default: 200,
            minimum: 1,
            maximum: 2000,
          },
          encoding: {
            type: 'string',
            description: '显式解码器（utf-8, gbk, utf-16le, binary，默认 utf-8）。',
            enum: ['utf-8', 'gbk', 'utf-16le', 'binary'],
            default: 'utf-8',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      schemaVersion: '2.0',
      name: 'search',
      description: '按字面量或正则表达式搜索文本内容或按名称匹配文件。',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'workspace.search',
      inputSchema: {
        properties: {
          pattern: {
            type: 'string',
            description: '搜索关键词或正则表达式。',
          },
          path: {
            type: 'string',
            description: '搜索起始目录（相对工作区或留空表示根目录）。',
            default: '',
          },
          isRegex: {
            type: 'boolean',
            description: '是否按正则表达式匹配（默认 false）。',
            default: false,
          },
          maxMatches: {
            type: 'number',
            description: '最大匹配数量。',
            default: 200,
            minimum: 1,
            maximum: 1000,
          },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    },
    {
      schemaVersion: '2.0',
      name: 'update_plan',
      description: '更新当前任务的可见多步骤计划。',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'agent_control.update_plan',
      inputSchema: {
        properties: {
          plan: {
            type: 'string',
            description: '最新多步骤计划文本（Markdown 格式列表）。',
          },
          explanation: {
            type: 'string',
            description: '计划变更原因或当前进展简要说明。',
            default: '',
          },
        },
        required: ['plan'],
        additionalProperties: false,
      },
    },
  ];

  if (mode === PermissionMode.READ_ONLY) {
    return readOnlyTools;
  }

  const mutatingTools: ToolSpec[] = [
    {
      schemaVersion: '2.0',
      name: 'write',
      description: '创建新文件或完整覆写已有文件内容，保持编码与换行。',
      approvalLevel: writeLevel,
      capability: 'workspace.write',
      inputSchema: {
        properties: {
          path: {
            type: 'string',
            description: '目标文件路径。',
          },
          content: {
            type: 'string',
            description: '完整文件内容。',
          },
          encoding: {
            type: 'string',
            description: '文件编码（utf-8, gbk, utf-16le，默认 utf-8）。',
            enum: ['utf-8', 'gbk', 'utf-16le'],
            default: 'utf-8',
          },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
    {
      schemaVersion: '2.0',
      name: 'edit',
      description: '精确替换文件中的特定文本块或锚点，生成清晰 Diff 并建立 checkpoint。',
      approvalLevel: writeLevel,
      capability: 'workspace.edit',
      inputSchema: {
        properties: {
          path: {
            type: 'string',
            description: '目标文件路径。',
          },
          oldText: {
            type: 'string',
            description: '待替换的原始文本（必须在文件中唯一存在）。',
          },
          newText: {
            type: 'string',
            description: '替换后的新文本。',
          },
        },
        required: ['path', 'oldText', 'newText'],
        additionalProperties: false,
      },
    },
    {
      schemaVersion: '2.0',
      name: 'copy',
      description: '复制文件或目录到目标路径。',
      approvalLevel: writeLevel,
      capability: 'workspace.manage',
      inputSchema: {
        properties: {
          source: {
            type: 'string',
            description: '源文件或目录路径。',
          },
          destination: {
            type: 'string',
            description: '目标文件或目录路径。',
          },
          overwrite: {
            type: 'boolean',
            description: '目标已存在时是否覆盖（默认 false）。',
            default: false,
          },
        },
        required: ['source', 'destination'],
        additionalProperties: false,
      },
    },
    {
      schemaVersion: '2.0',
      name: 'move',
      description: '移动或重命名文件或目录。',
      approvalLevel: writeLevel,
      capability: 'workspace.manage',
      inputSchema: {
        properties: {
          source: {
            type: 'string',
            description: '源文件或目录路径。',
          },
          destination: {
            type: 'string',
            description: '目标文件或目录路径。',
          },
          overwrite: {
            type: 'boolean',
            description: '目标已存在时是否覆盖（默认 false）。',
            default: false,
          },
        },
        required: ['source', 'destination'],
        additionalProperties: false,
      },
    },
    {
      schemaVersion: '2.0',
      name: 'delete',
      description: '删除文件或目录（默认移至恢复区/回收站，设置 permanent 为 true 时彻底删除）。',
      approvalLevel: writeLevel,
      capability: 'workspace.manage',
      inputSchema: {
        properties: {
          path: {
            type: 'string',
            description: '待删除的文件或目录路径。',
          },
          recursive: {
            type: 'boolean',
            description: '是否递归删除非空目录（默认 false）。',
            default: false,
          },
          permanent: {
            type: 'boolean',
            description: '是否永久删除而不放入恢复区（默认 false；永久删除将触发确认）。',
            default: false,
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      schemaVersion: '2.0',
      name: 'shell',
      description: '通过系统 Shell (PowerShell 5.1 / CMD) 执行命令、脚本、测试或构建。',
      approvalLevel: writeLevel,
      capability: 'shell.exec',
      inputSchema: {
        properties: {
          command: {
            type: 'string',
            description: '完整命令字符串（支持管道、重定向、参数与多行脚本）。',
          },
          cwd: {
            type: 'string',
            description: '执行工作目录（留空表示当前工作区根目录）。',
            default: '',
          },
          timeoutMs: {
            type: 'number',
            description: '可选命令软超时（毫秒）。',
            minimum: 1000,
            maximum: 3600000,
          },
          background: {
            type: 'boolean',
            description: '是否作为托管后台进程启动（如 dev server 或 watcher，默认 false）。',
            default: false,
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  ];

  return [...readOnlyTools, ...mutatingTools];
}

/**
 * 注册 A9 工具规格到 ToolRegistry
 */
export function registerA9Tools(registry: ToolRegistry, mode: PermissionMode = PermissionMode.FULL_ACCESS): void {
  for (const spec of a9ToolSpecs(mode)) {
    registry.register(spec);
  }
}

/**
 * 已知参数别名（snake_case → 规范 camelCase）。别名只做名称级映射，
 * `timeout_seconds` 额外换算为毫秒；映射后仍未知字段由 ToolRegistry 按
 * additionalProperties:false 拒绝。
 */
const TOOL_ARG_ALIASES: Readonly<Record<string, Record<string, string>>> = {
  list: { max_entries: 'maxEntries' },
  read: { start_line: 'startLine', max_lines: 'maxLines' },
  search: { is_regex: 'isRegex', max_matches: 'maxMatches' },
  edit: { old_text: 'oldText', new_text: 'newText' },
  shell: {},
  update_plan: {},
};

/**
 * 将模型提交的工具参数按别名表规范化。返回规范化后的参数副本；
 * 未经别名覆盖的未知字段保持原样，交由 ToolRegistry 的
 * additionalProperties:false 校验拒绝。
 */
export function normalizeToolCallArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const aliases = TOOL_ARG_ALIASES[toolName];
  if (!aliases) return { ...args };
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === 'timeout_seconds' && toolName === 'shell') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        normalized.timeoutMs = value * 1000;
        continue;
      }
    }
    const mapped = aliases[key];
    if (mapped) normalized[mapped] = value;
    else normalized[key] = value;
  }
  return normalized;
}
