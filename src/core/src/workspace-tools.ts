import { ApprovalLevel } from './types';
import { ToolRegistry, ToolSpec } from './tools';

/**
 * Stable model-facing ACI catalog for the bounded Workspace services.
 * Implementations are injected by product assembly; this module declares
 * names, intent, limits, defaults, and approval levels only.
 */
export function workspaceToolSpecs(): ToolSpec[] {
  return [
    {
      schemaVersion: '2.0',
      name: 'workspace.list_directory',
      description: 'List exactly one workspace directory level with deterministic ordering, totals, and explicit truncation.',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'workspace.read',
      inputSchema: {
        properties: {
          path: {
            type: 'string',
            description: 'Workspace-relative directory; empty means the workspace root.',
            default: '',
          },
          maxEntries: {
            type: 'number',
            description: 'Maximum returned entries.',
            default: 500,
            minimum: 1,
            maximum: 2_000,
          },
          maxOutputBytes: {
            type: 'number',
            description: 'Maximum serialized response bytes.',
            default: 65_536,
            minimum: 256,
            maximum: 1_048_576,
          },
        },
        required: [],
      },
    },
    {
      schemaVersion: '2.0',
      name: 'workspace.read_text',
      description: 'Read one UTF-8 workspace file with numbered lines, an explicit range, total line count, and bounded output.',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'workspace.read',
      inputSchema: {
        properties: {
          path: {
            type: 'string',
            description: 'Workspace-relative file path. This tool requires an existing UTF-8 text file.',
          },
          startLine: {
            type: 'number',
            description: 'One-based first line to return.',
            default: 1,
            minimum: 1,
          },
          maxLines: {
            type: 'number',
            description: 'Maximum numbered lines to return. Use a smaller range after a truncation notice.',
            default: 200,
            minimum: 1,
            maximum: 1_000,
          },
          encoding: {
            type: 'string',
            description: 'Explicit text decoder. Use utf-8 for the default strict path or gbk for a known CP936/GBK file; unknown encodings are rejected.',
            enum: ['utf-8', 'gbk'],
          },
          maxOutputBytes: {
            type: 'number',
            description: 'Maximum retained UTF-8 response bytes.',
            default: 65_536,
            minimum: 256,
            maximum: 262_144,
          },
        },
        required: ['path'],
      },
    },
    {
      schemaVersion: '2.0',
      name: 'workspace.search_text',
      description: 'Search literal UTF-8 text under a workspace directory with context lines, total-match accounting, and explicit scan/output budgets.',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'workspace.search',
      inputSchema: {
        properties: {
          pattern: {
            type: 'string',
            description: 'Non-empty literal text to find. Shell syntax and regular-expression syntax are not interpreted.',
          },
          path: {
            type: 'string',
            description: 'Workspace-relative directory to search; empty means the workspace root.',
            default: '',
          },
          maxMatches: {
            type: 'number',
            description: 'Maximum matches returned. Counting continues within scan budgets so totalMatches can still be reported.',
            default: 200,
            minimum: 1,
            maximum: 500,
          },
          contextLines: {
            type: 'number',
            description: 'Number of surrounding lines returned before and after every match.',
            default: 2,
            minimum: 0,
            maximum: 10,
          },
        },
        required: ['pattern'],
      },
    },
    {
      schemaVersion: '2.0',
      name: 'workspace.str_replace',
      description: 'Create an approval-bound WritePlan by replacing one unique exact anchor in an existing UTF-8 file; this tool does not write directly.',
      approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
      capability: 'workspace_write',
      inputSchema: {
        properties: {
          path: {
            type: 'string',
            description: 'Workspace-relative existing UTF-8 file path.',
          },
          oldText: {
            type: 'string',
            description: 'Non-empty exact current text that must occur exactly once. Include more surrounding text when ambiguous.',
          },
          newText: {
            type: 'string',
            description: 'Replacement text. The resulting plan includes a content diff and remains subject to approval and base-SHA revalidation.',
          },
        },
        required: ['path', 'oldText', 'newText'],
      },
    },
  ];
}

export function registerWorkspaceTools(registry: ToolRegistry): void {
  for (const spec of workspaceToolSpecs()) registry.register(spec);
}
