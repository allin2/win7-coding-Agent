import type {
  RuntimeToolExecutionContext,
  RuntimeToolExecutor,
  ToolCancellationResult,
  ToolExecutionResult,
} from './runtime';
import { ToolRegistry, ToolSpec } from './tools';
import { ToolCall } from './types';
import { workspaceToolSpecs } from './workspace-tools';

const READ_ONLY_TOOL_NAMES = new Set([
  'workspace.list_directory',
  'workspace.read_text',
  'workspace.search_text',
]);

export interface WorkspaceReadOnlyPort {
  listDirectory(input: Record<string, unknown>): unknown | Promise<unknown>;
  readText(input: Record<string, unknown>): unknown | Promise<unknown>;
  searchText(input: Record<string, unknown>): unknown | Promise<unknown>;
}

export function workspaceReadOnlyToolSpecs(): ToolSpec[] {
  return workspaceToolSpecs()
    .filter((spec) => READ_ONLY_TOOL_NAMES.has(spec.name));
}

export function registerWorkspaceReadOnlyTools(registry: ToolRegistry): void {
  for (const spec of workspaceReadOnlyToolSpecs()) registry.register(spec);
}

/**
 * Routes bounded read-only Workspace tools to the real Workspace port and
 * delegates unrelated tools, including str_replace, to an explicit executor.
 */
export class WorkspaceReadOnlyToolExecutor implements RuntimeToolExecutor {
  constructor(
    private readonly port: WorkspaceReadOnlyPort,
    private readonly fallback?: RuntimeToolExecutor,
  ) {}

  async execute(
    spec: ToolSpec,
    call: ToolCall,
    context: RuntimeToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      let output: unknown;
      if (call.toolName === 'workspace.list_directory') {
        output = await this.port.listDirectory(call.args);
      } else if (call.toolName === 'workspace.read_text') {
        output = await this.port.readText(call.args);
      } else if (call.toolName === 'workspace.search_text') {
        output = await this.port.searchText(call.args);
      } else if (this.fallback) {
        return await this.fallback.execute(spec, call, context);
      } else {
        throw new Error(`No executor route for ${call.toolName}`);
      }
      return {
        callId: call.id,
        toolName: call.toolName,
        success: true,
        status: 'succeeded',
        output,
      };
    } catch (error) {
      return {
        callId: call.id,
        toolName: call.toolName,
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async cancel(
    call: ToolCall,
    reason: 'user_cancelled' | 'wall_budget_exceeded',
  ): Promise<ToolCancellationResult> {
    if (this.fallback?.cancel) return await this.fallback.cancel(call, reason);
    return {
      terminationRequested: false,
      cleanupComplete: true,
      detail: 'Synchronous read-only workspace operation has no child process',
    };
  }
}
