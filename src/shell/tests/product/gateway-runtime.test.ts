const { createGatewayRuntimeModel, toOpenAIFunctionTool, toModelToolName } = require('../../product/gateway-runtime') as {
  createGatewayRuntimeModel: (core: any, gateway: any, provider: any, options?: any) => any;
  toOpenAIFunctionTool: (spec: any) => any;
  toModelToolName: (name: string) => string;
};

describe('Desktop Gateway RuntimeModel adapter', () => {
  const readSpec = {
    schemaVersion: '2.0',
    name: 'workspace.read_text',
    description: 'Read one file.',
    approvalLevel: 'read_only',
    capability: 'workspace.read',
    inputSchema: {
      properties: {
        path: { type: 'string', description: 'Relative file path.' },
        maxLines: { type: 'number', description: 'Maximum lines.', default: 200, minimum: 1, maximum: 1000 },
        tags: { type: 'string[]', description: 'Optional tags.' },
      },
      required: ['path'],
    },
  };

  it('maps reviewed ToolSpec metadata to an OpenAI function definition', () => {
    expect(toOpenAIFunctionTool(readSpec)).toEqual({
      name: 'workspace_read_text',
      description: 'Read one file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
          maxLines: { type: 'number', description: 'Maximum lines.', default: 200, minimum: 1, maximum: 1000 },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    });
  });

  it('creates a DeepSeek-compatible reversible alias for dotted Core tool names', () => {
    expect(toModelToolName('workspace.list_directory')).toBe('workspace_list_directory');
    expect(toModelToolName('workspace.search_text')).toBe('workspace_search_text');
  });

  it('sends system safety instructions, tools and tool choice through the provider', async () => {
    let providerRequest: any;
    const provider = {
      async sendStreamRequest(request: any, onChunk: (chunk: any) => void) {
        providerRequest = request;
        onChunk({ content: 'partial', index: 0 });
        return {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'call-1', name: 'workspace_read_text', arguments: '{"path":"sample.ts"}' }],
          usage: { promptTokens: 12, completionTokens: 3 },
        };
      },
    };
    const deltas: any[] = [];
    const runtime = createGatewayRuntimeModel(
      { ApprovalLevel: { READ_ONLY: 'read_only' } },
      {},
      provider,
      { model: 'deepseek-v4-flash', onChunk: (value: any) => deltas.push(value) },
    );
    const plan = await runtime.createPlan({
      run: { runId: 'run-1' },
      step: 1,
      messages: [
        { role: 'user', content: 'Inspect the workspace.' },
        {
          role: 'assistant',
          content: 'I will inspect it.',
          toolCalls: [{
            id: 'prior-call',
            toolName: 'workspace.read_text',
            args: { path: 'README.md' },
            approvalLevel: 'read_only',
          }],
        },
        { role: 'tool', toolCallId: 'prior-call', content: '{"ok":true}' },
      ],
      tools: [readSpec],
      toolChoice: 'auto',
      signal: new AbortController().signal,
    });

    expect(providerRequest.model).toBe('deepseek-v4-flash');
    expect(providerRequest.messages[0].role).toBe('system');
    expect(providerRequest.messages[0].content).toContain('read-only');
    expect(providerRequest.messages[2].toolCalls).toEqual([{
      id: 'prior-call',
      name: 'workspace_read_text',
      arguments: '{"path":"README.md"}',
    }]);
    expect(providerRequest.messages[3]).toEqual({
      role: 'tool',
      toolCallId: 'prior-call',
      content: '{"ok":true}',
    });
    expect(providerRequest.tools[0].name).toBe('workspace_read_text');
    expect(providerRequest.toolChoice).toBe('auto');
    expect(plan.toolCalls[0].call).toEqual(expect.objectContaining({
      id: 'call-1',
      toolName: 'workspace.read_text',
      args: { path: 'sample.ts' },
      approvalLevel: 'read_only',
    }));
    expect(plan.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(deltas).toEqual([{ requestId: 'run-1-step-1', chunk: { content: 'partial', index: 0 } }]);
  });

  it('round-trips three sequential Core tool calls through model-safe aliases', async () => {
    const specs = [
      { ...readSpec, name: 'workspace.list_directory' },
      { ...readSpec, name: 'workspace.search_text' },
      readSpec,
    ];
    const sequence = [
      ['workspace_list_directory', '{}'],
      ['workspace_search_text', '{"pattern":"function"}'],
      ['workspace_read_text', '{"path":"sample.ts"}'],
    ];
    let providerCall = 0;
    const provider = {
      async sendStreamRequest(request: any) {
        for (const message of request.messages.filter((item: any) => item.role === 'assistant')) {
          for (const call of message.toolCalls || []) {
            expect(call.name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
          }
        }
        const [name, args] = sequence[providerCall++];
        return {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{ id: `call-${providerCall}`, name, arguments: args }],
        };
      },
    };
    const runtime = createGatewayRuntimeModel(
      { ApprovalLevel: { READ_ONLY: 'read_only' } },
      {},
      provider,
      { model: 'deepseek-v4-flash' },
    );
    const messages: any[] = [{ role: 'user', content: 'Inspect in sequence.' }];
    const expectedCoreNames = [
      'workspace.list_directory',
      'workspace.search_text',
      'workspace.read_text',
    ];

    for (let step = 0; step < sequence.length; step += 1) {
      const plan = await runtime.createPlan({
        run: { runId: 'run-sequential' },
        step: step + 1,
        messages,
        tools: specs,
        toolChoice: 'auto',
        signal: new AbortController().signal,
      });
      const call = plan.toolCalls[0].call;
      expect(call.toolName).toBe(expectedCoreNames[step]);
      messages.push({ role: 'assistant', content: '', toolCalls: [call] });
      messages.push({ role: 'tool', toolCallId: call.id, content: '{"success":true}' });
    }
    expect(providerCall).toBe(3);
  });
});
