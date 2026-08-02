import { AgentErrorCode } from '../src/errors';
import { ToolRegistry } from '../src/tools';
import { ApprovalLevel } from '../src/types';
import { registerWorkspaceTools, workspaceToolSpecs } from '../src/workspace-tools';

describe('ToolRegistry', () => {
  function createRegistry(): ToolRegistry {
    const registry = new ToolRegistry();
    registry.register({
      schemaVersion: '2.0',
      name: 'code.search',
      description: 'Search code',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'code.search',
      inputSchema: {
        properties: {
          query: {
            type: 'string',
            description: 'Literal or regular-expression query to search for.',
          },
          paths: {
            type: 'string[]',
            description: 'Workspace-relative roots to search.',
            default: ['src'],
          },
          mode: {
            type: 'string',
            description: 'Interpret the query as literal text or a regex.',
            enum: ['literal', 'regex'],
            default: 'literal',
          },
        },
        required: ['query'],
      },
    });
    return registry;
  }

  it('resolves and validates a registered structured call', () => {
    const registry = createRegistry();
    expect(registry.validateCall({
      id: 'call-1',
      toolName: 'code.search',
      args: { query: 'AgentRuntime', paths: ['src'] },
      approvalLevel: ApprovalLevel.READ_ONLY,
    }).name).toBe('code.search');
  });

  it('applies declared defaults without mutating the model call', () => {
    const registry = createRegistry();
    const call = {
      id: 'call-defaults',
      toolName: 'code.search',
      args: { query: 'AgentRuntime' },
      approvalLevel: ApprovalLevel.READ_ONLY,
    };
    expect(registry.normalizeCall(call).args).toEqual({
      query: 'AgentRuntime',
      paths: ['src'],
      mode: 'literal',
    });
    expect(call.args).toEqual({ query: 'AgentRuntime' });
  });

  it('rejects values outside enum and malformed model-facing schemas', () => {
    const registry = createRegistry();
    expect(() => registry.validateCall({
      id: 'call-enum',
      toolName: 'code.search',
      args: { query: 'x', mode: 'glob' },
      approvalLevel: ApprovalLevel.READ_ONLY,
    })).toThrow('enum:mode');

    expect(() => registry.register({
      schemaVersion: '2.0',
      name: 'broken.tool',
      description: 'Broken schema',
      approvalLevel: ApprovalLevel.READ_ONLY,
      capability: 'code.search',
      inputSchema: {
        properties: {
          value: { type: 'string', description: '', default: 1 as unknown as string },
        },
        required: [],
      },
    })).toThrow('requires a description');
  });

  it('rejects numeric values outside declared bounds', () => {
    const registry = new ToolRegistry();
    registerWorkspaceTools(registry);
    expect(() => registry.validateCall({
      id: 'read-too-large',
      toolName: 'workspace.read_text',
      args: { path: 'src/a.ts', maxLines: 10_000 },
      approvalLevel: ApprovalLevel.READ_ONLY,
    })).toThrow('range:maxLines');
  });

  it('publishes a stable Workspace catalog with model-facing descriptions and defaults', () => {
    const specs = workspaceToolSpecs();
    expect(specs.map((spec) => spec.name)).toEqual([
      'workspace.list_directory',
      'workspace.read_text',
      'workspace.search_text',
      'workspace.str_replace',
    ]);
    const registry = new ToolRegistry();
    registerWorkspaceTools(registry);
    const normalized = registry.normalizeCall({
      id: 'search-defaults',
      toolName: 'workspace.search_text',
      args: { pattern: 'AgentRuntime' },
      approvalLevel: ApprovalLevel.READ_ONLY,
    });
    expect(normalized.args).toMatchObject({
      path: '',
      maxMatches: 200,
      contextLines: 2,
    });
    expect(registry.list().every((spec) =>
      Object.values(spec.inputSchema.properties)
        .every((property) => property.description.length > 0))).toBe(true);
  });

  it('rejects unregistered tools, unknown fields, wrong types, and approval downgrade', () => {
    const registry = createRegistry();
    expect(() => registry.resolve('terminal.exec')).toThrow('not registered');
    try {
      registry.resolve('terminal.exec');
    } catch (error) {
      expect(error).toMatchObject({ code: AgentErrorCode.TOOL_NOT_REGISTERED });
    }
    const invalidType = () => registry.validateCall({
      id: 'call-1',
      toolName: 'code.search',
      args: { query: 42, extra: true },
      approvalLevel: ApprovalLevel.READ_ONLY,
    });
    expect(invalidType).toThrow('validation failed');
    try {
      invalidType();
    } catch (error) {
      expect(error).toMatchObject({ code: AgentErrorCode.TOOL_INPUT_INVALID });
    }
    const approvalDowngrade = () => registry.validateCall({
      id: 'call-2',
      toolName: 'code.search',
      args: { query: 'x' },
      approvalLevel: ApprovalLevel.WORKSPACE_WRITE,
    });
    expect(approvalDowngrade).toThrow('approval level mismatch');
    try {
      approvalDowngrade();
    } catch (error) {
      expect(error).toMatchObject({ code: AgentErrorCode.TOOL_INPUT_INVALID });
    }
  });

  it('rejects duplicate specs', () => {
    const registry = createRegistry();
    expect(() => registry.register(registry.resolve('code.search')))
      .toThrow('already registered');
  });
});
