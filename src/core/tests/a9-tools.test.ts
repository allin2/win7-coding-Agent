import {
  ApprovalLevel,
  PermissionMode,
  ToolRegistry,
  a9ToolSpecs,
  registerA9Tools,
} from '../src';

describe('A9-01: A9 Tool Spec Catalog', () => {
  it('describes read auto-detection without forcing UTF-8 and bounded integer ranges', () => {
    const read = a9ToolSpecs(PermissionMode.FULL_ACCESS).find((spec) => spec.name === 'read')!;
    const properties = read.inputSchema.properties as any;
    expect(properties.encoding.default).toBeUndefined();
    expect(properties.encoding.description).toContain('省略则自动探测');
    expect(properties.startLine.description).toContain('正整数');
    expect(properties.maxLines.description).toContain('正整数');
    expect(properties.maxLines.maximum).toBe(2000);
  });
  it('declares all 14 standard A9 tools for Full Access mode', () => {
    const specs = a9ToolSpecs(PermissionMode.FULL_ACCESS);
    const names = specs.map((s) => s.name);
    expect(names).toEqual([
      'list',
      'read',
      'search',
      'update_plan',
      'ask_user',
      'read_process_output',
      'write',
      'edit',
      'copy',
      'move',
      'delete',
      'shell',
      'start_process',
      'stop_process',
    ]);
  });

  it('bounds ask_user prompt/options while keeping free-form answers available', () => {
    const spec = a9ToolSpecs(PermissionMode.FULL_ACCESS).find((item) => item.name === 'ask_user')!;
    expect(spec.approvalLevel).toBe(ApprovalLevel.READ_ONLY);
    expect(spec.capability).toBe('agent_control.ask_user');
    expect(spec.inputSchema.required).toEqual(['prompt']);
    expect(spec.inputSchema.properties.prompt.maxLength).toBe(2000);
    expect(spec.inputSchema.properties.options.type).toBe('string[]');
    expect(spec.inputSchema.properties.options.items).toBe('string');
    expect(spec.inputSchema.properties.options.maxItems).toBe(6);
    expect(spec.inputSchema.properties.options.maxLength).toBe(200);
  });

  it('filters tool catalog in Read Only mode', () => {
    const specs = a9ToolSpecs(PermissionMode.READ_ONLY);
    const names = specs.map((s) => s.name);
    expect(names).toEqual(['list', 'read', 'search', 'update_plan', 'ask_user', 'read_process_output']);
    expect(specs.every((s) => s.approvalLevel === ApprovalLevel.READ_ONLY)).toBe(true);
  });

  it('sets REVIEW approval level in Review mode for mutating tools', () => {
    const specs = a9ToolSpecs(PermissionMode.REVIEW);
    const writeSpec = specs.find((s) => s.name === 'write');
    const shellSpec = specs.find((s) => s.name === 'shell');
    expect(writeSpec?.approvalLevel).toBe(ApprovalLevel.REVIEW);
    expect(shellSpec?.approvalLevel).toBe(ApprovalLevel.REVIEW);
  });

  it('successfully registers tools into ToolRegistry and validates calls', () => {
    const registry = new ToolRegistry();
    registerA9Tools(registry, PermissionMode.FULL_ACCESS);

    const validReadCall = {
      id: 'call-1',
      toolName: 'read',
      args: { path: 'package.json', startLine: 1, maxLines: 50 },
      approvalLevel: ApprovalLevel.READ_ONLY,
    };
    expect(() => registry.validateCall(validReadCall)).not.toThrow();

    const invalidArgsCall = {
      id: 'call-2',
      toolName: 'read',
      args: { startLine: 1 }, // missing 'path'
      approvalLevel: ApprovalLevel.READ_ONLY,
    };
    expect(() => registry.validateCall(invalidArgsCall as any)).toThrow();
  });
});
