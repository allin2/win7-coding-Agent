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
export function a9ToolSpecs(mode: PermissionMode = PermissionMode.FULL_ACCESS, options: { images?: boolean; office?: boolean } = {}): ToolSpec[] {
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
            description: '起始行号（正整数、1-based，默认 1；大文件同样支持分段读取）。',
            default: 1,
            minimum: 1,
          },
          maxLines: {
            type: 'number',
            description: '最大读取行数（正整数、默认 200，最多 2000）；预览最多 128 KiB，长行截断会明确标记。',
            default: 200,
            minimum: 1,
            maximum: 2000,
          },
          encoding: {
            type: 'string',
            description: '省略则自动探测 BOM/UTF-8/GBK；显式 utf-8、gbk、utf-16le 优先。无 BOM UTF-16LE 请显式指定；binary 仅返回元数据。',
            enum: ['utf-8', 'gbk', 'utf-16le', 'binary'],
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
    {
      schemaVersion: '2.0',
      name: 'ask_user',
      description: '向用户提出一个有界问题并暂停本轮，等待回答后由模型重新规划。只补充信息，不批准任何文件、命令、Git 或网络操作。',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'agent_control.ask_user',
      inputSchema: {
        properties: {
          prompt: {
            type: 'string',
            description: '要向用户展示的问题；最多 2000 字符。',
            maxLength: 2000,
          },
          options: {
            type: 'string[]',
            description: '可选回答项，最多 6 项、每项最多 200 字符；用户始终可以自由填写回答。',
            items: 'string',
            maxItems: 6,
            maxLength: 200,
          },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
    },
  ];

  readOnlyTools.push({
    schemaVersion: '2.0', name: 'read_process_output', description: '读取当前工作区及对话的托管后台输出。游标可重读；过期必须重新取得 oldestCursor。',
    approvalLevel: ApprovalLevel.READ_ONLY, capability: 'workspace.read',
    inputSchema: { properties: { handleId: { type: 'string', description: '产品返回的进程句柄。' }, cursor: { type: 'string', description: '上次返回的不透明游标。' },
      maxBytes: { type: 'number', description: '安全文本 UTF-8 字节预算。', default: 8192, minimum: 1, maximum: 16384 } }, required: ['handleId'], additionalProperties: false },
  });

  if (options.images) readOnlyTools.push({
    schemaVersion: '2.0', name: 'read_image',
    description: '读取工作区内 PNG/JPEG 供当前已启用图片输入的模型查看。单图最多 2 MiB/400 万像素，必要时缩至最长边 1280；每次请求最多 2 张，每轮最多 4 次。',
    approvalLevel: ApprovalLevel.READ_ONLY, capability: 'workspace.read',
    inputSchema: { properties: { path: { type: 'string', description: '工作区内 PNG/JPEG 图片路径。' } },
      required: ['path'], additionalProperties: false },
  });

  if (options.office) {
    for (const name of ['document_inspect', 'document_read']) readOnlyTools.push({
      schemaVersion: '2.0', name,
      description: name === 'document_inspect' ? '检查 DOCX/XLSX 内容能力、单元数、保真限制与修改支持。PDF 和旧二进制格式不支持。' :
        '分页读取 DOCX 段落/标题/表格行或 XLSX 单元格；公式和缓存值分开，不重算。使用 nextStart 续读。',
      approvalLevel: ApprovalLevel.READ_ONLY, capability: 'workspace.read',
      inputSchema: { properties: { path: { type: 'string', description: '工作区内 .docx 或 .xlsx 文件。', maxLength: 4096 },
        ...(name === 'document_read' ? { start: { type: 'number' as const, description: '零起始单元位置。', minimum: 0, default: 0 },
          limit: { type: 'number' as const, description: '单次最多单元数。', minimum: 1, maximum: 200, default: 50 } } : {}) },
      required: ['path'], additionalProperties: false },
    });
    if (mode === PermissionMode.FULL_ACCESS) readOnlyTools.push({
      schemaVersion: '2.0', name: 'document_write_copy', approvalLevel: writeLevel, capability: 'workspace.write',
      description: '创建新的 DOCX/XLSX 副本，拒绝覆盖。content 是 schemaVersion:1 的 JSON。DOCX: {schemaVersion:1,format:"docx",blocks:[{type:"paragraph",text:"正文"},{type:"heading",level:1,text:"标题"},{type:"table",rows:[["单元格"]]}]}。XLSX: {schemaVersion:1,format:"xlsx",sheets:[{name:"Sheet1",rows:[["文本",12,true,null]]}]}。修改本模块文档时提供 sourcePath 与 document_read/inspect 返回的 sha256，再给完整替换内容；不承诺原稿版式保真。',
      inputSchema: { properties: {
        path: { type: 'string', description: '工作区内尚不存在的输出路径，父目录须存在。', maxLength: 4096 },
        content: { type: 'string', description: 'schemaVersion:1 的结构化 JSON 内容，最多256 KiB。', maxLength: 262144 },
        sourcePath: { type: 'string', description: '可选原件路径，仅允许本模块生成的受支持子集。', maxLength: 4096 },
        sourceSha256: { type: 'string', description: '原件的 SHA-256；与 sourcePath 一起提供。', maxLength: 64 },
      }, required: ['path', 'content'], additionalProperties: false },
    });
  }
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
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  ];

  mutatingTools.push({
    schemaVersion: '2.0', name: 'start_process', description: '通过批准的 Shell 启动托管后台进程，最多三个；不提供任意 PID 操作。后台启动和输出不构成验证成功。',
    approvalLevel: writeLevel, capability: 'shell.exec',
    inputSchema: { properties: { command: { type: 'string', description: '完整非空命令。' }, cwd: { type: 'string', description: '工作目录，省略为当前工作区。', default: '' } }, required: ['command'], additionalProperties: false },
  }, {
    schemaVersion: '2.0', name: 'stop_process', description: '停止当前工作区及对话的托管进程，必须取得实际清理证明。',
    approvalLevel: writeLevel, capability: 'shell.exec',
    inputSchema: { properties: { handleId: { type: 'string', description: '产品返回的进程句柄。' } }, required: ['handleId'], additionalProperties: false },
  });
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
