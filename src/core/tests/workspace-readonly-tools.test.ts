import {
  registerWorkspaceReadOnlyTools,
  WorkspaceReadOnlyToolExecutor,
} from '../src/workspace-readonly-tools';
import { ToolRegistry } from '../src/tools';
import { ApprovalLevel } from '../src/types';

describe('workspace read-only tool assembly', () => {
  it('registers fixed bounded contracts and routes real port calls', async () => {
    const registry = new ToolRegistry();
    registerWorkspaceReadOnlyTools(registry);
    expect(registry.list().map((spec) => spec.name)).toEqual([
      'workspace.list_directory',
      'workspace.read_text',
      'workspace.search_text',
    ]);
    const port = {
      listDirectory: jest.fn(() => ({ depth: 1, entries: [] })),
      readText: jest.fn(() => ({ content: '1: hello' })),
      searchText: jest.fn(() => ({ totalMatches: 1, matches: [] })),
    };
    const executor = new WorkspaceReadOnlyToolExecutor(port);
    const call = registry.normalizeCall({
      id: 'read-1',
      toolName: 'workspace.read_text',
      approvalLevel: ApprovalLevel.READ_ONLY,
      args: { path: 'README.md' },
    });
    const result = await executor.execute(registry.resolve(call.toolName), call, {
      signal: new AbortController().signal,
      deadlineMs: Date.now() + 1_000,
      sessionId: 's',
      threadId: 't',
      turnId: 'turn',
      runId: 'run',
    });
    expect(result).toMatchObject({ status: 'succeeded', success: true });
    expect(port.readText).toHaveBeenCalledWith({
      path: 'README.md',
      startLine: 1,
      maxLines: 200,
      maxOutputBytes: 65_536,
    });
  });
});
