const { A8_SYSTEM_PROMPT_SHA256, A8_SYSTEM_PROMPT_VERSION, createGatewayRuntimeModel, getSystemPromptContract, toOpenAIFunctionTool, toModelToolName } = require('../../product/gateway-runtime') as {
  A8_SYSTEM_PROMPT_SHA256: string;
  A8_SYSTEM_PROMPT_VERSION: string;
  createGatewayRuntimeModel: (core: any, gateway: any, provider: any, options?: any) => any;
  getSystemPromptContract: () => { schemaVersion: number; version: string; sha256: string; content: string };
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
    const completions: any[] = [];
    const runtime = createGatewayRuntimeModel(
      { ApprovalLevel: { READ_ONLY: 'read_only' } },
      {},
      provider,
      {
        model: 'deepseek-v4-flash',
        onChunk: (value: any) => deltas.push(value),
        onComplete: (value: any) => completions.push(value),
      },
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
    expect(providerRequest.messages[0].content).toContain('[a8-system-prompt-v1]');
    expect(providerRequest.messages[0].content).toContain('private A8 Review staging area');
    expect(providerRequest.messages[0].content).toContain('never writes the target workspace');
    expect(providerRequest.messages[0].content).toContain('separate exact Apply approval');
    expect(providerRequest.messages[0].content).toContain('Only a trusted Runner or remote validation adapter can produce PASS');
    expect(providerRequest.messages[0].content).toContain('Do not request or simulate process, terminal, arbitrary shell, Git write, arbitrary network, credential');
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
    expect(completions).toEqual([{ requestId: 'run-1-step-1', index: 1, finishReason: 'tool_calls' }]);
  });

  it('locks the A8 System Prompt V1 bytes to a versioned SHA-256 contract', () => {
    const contract = getSystemPromptContract();
    expect(contract).toEqual({
      schemaVersion: 1,
      version: A8_SYSTEM_PROMPT_VERSION,
      sha256: A8_SYSTEM_PROMPT_SHA256,
      content: expect.stringContaining('workspace_review_prepare'),
    });
    expect(A8_SYSTEM_PROMPT_VERSION).toBe('a8-system-prompt-v1');
    expect(A8_SYSTEM_PROMPT_SHA256).toBe('f1bdcace084d27d71383b4ddfe81cef61029796a36859995c6e9614f1cbc9160');
    expect(contract.content).not.toContain('You are a read-only coding agent');
    expect(contract.content).toContain('that action never writes the target workspace');
    expect(contract.content).not.toContain('workspace.str_replace');
  });

  it('keeps a Review proposal model-call inside the registered ToolSpec boundary', async () => {
    const reviewSpec = {
      ...readSpec,
      name: 'workspace.review_prepare',
      description: 'Create a private Review proposal without writing the target workspace.',
      inputSchema: {
        properties: { proposalsJson: { type: 'string', description: 'Bounded JSON proposal.' } },
        required: ['proposalsJson'],
      },
    };
    let providerRequest: any;
    const provider = {
      async sendStreamRequest(request: any) {
        providerRequest = request;
        return {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [{
            id: 'review-call-1',
            name: 'workspace_review_prepare',
            arguments: '{"proposalsJson":"[]"}',
          }],
        };
      },
    };
    const runtime = createGatewayRuntimeModel(
      { ApprovalLevel: { READ_ONLY: 'read_only' } },
      {},
      provider,
      { model: 'registered-internal-model' },
    );
    const plan = await runtime.createPlan({
      run: { runId: 'run-review' },
      step: 1,
      messages: [{ role: 'user', content: 'Prepare a two-file Review.' }],
      tools: [readSpec, reviewSpec],
      toolChoice: 'auto',
      signal: new AbortController().signal,
    });

    expect(providerRequest.tools.map((tool: any) => tool.name)).toEqual([
      'workspace_read_text',
      'workspace_review_prepare',
    ]);
    expect(plan.toolCalls[0].call).toEqual({
      id: 'review-call-1',
      toolName: 'workspace.review_prepare',
      args: { proposalsJson: '[]' },
      approvalLevel: 'read_only',
    });
  });

  it('blocks known credential values before Gateway chunks or tool arguments reach callbacks', async () => {
    const secret = 'known-provider-secret-value';
    const deltas: any[] = [];
    const provider = {
      async sendStreamRequest(_request: any, onChunk: (chunk: any) => void) {
        onChunk({ content: `unexpected ${secret}`, index: 0 });
        return { content: '', finishReason: 'stop', toolCalls: [] };
      },
    };
    const runtime = createGatewayRuntimeModel(
      { ApprovalLevel: { READ_ONLY: 'read_only' } },
      {},
      provider,
      { getSensitiveValues: () => [secret], onChunk: (value: any) => deltas.push(value) },
    );
    await expect(runtime.createPlan({
      run: { runId: 'run-sensitive-chunk' }, step: 1,
      messages: [{ role: 'user', content: 'Inspect.' }], tools: [readSpec], toolChoice: 'auto',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'SENSITIVE_DATA_BLOCKED' });
    expect(deltas).toEqual([]);

    const encoded = Buffer.from(secret, 'utf8').toString('base64');
    const toolProvider = {
      async sendStreamRequest() {
        return {
          content: '', finishReason: 'tool_calls',
          toolCalls: [{ id: 'secret-call', name: 'workspace_read_text', arguments: JSON.stringify({ path: encoded }) }],
        };
      },
    };
    const toolRuntime = createGatewayRuntimeModel(
      { ApprovalLevel: { READ_ONLY: 'read_only' } }, {}, toolProvider,
      { getSensitiveValues: () => [secret] },
    );
    await expect(toolRuntime.createPlan({
      run: { runId: 'run-sensitive-tool' }, step: 1,
      messages: [{ role: 'user', content: 'Inspect.' }], tools: [readSpec], toolChoice: 'auto',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'SENSITIVE_DATA_BLOCKED' });
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
