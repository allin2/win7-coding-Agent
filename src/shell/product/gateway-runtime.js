'use strict';

/**
 * Product-side RuntimeModel adapter for the controlled A3 Gateway slice.
 * The adapter deliberately accepts only the Core model boundary and keeps all
 * Gateway credentials inside the main-process provider/credential store.
 */
function createGatewayRuntimeModel(core, gateway, provider, options) {
  const config = options || {};
  return {
    provider,
    async createPlan(input) {
      if (input.signal.aborted) throw cancelledError();
      const requestId = `${input.run.runId}-step-${input.step}`;
      const toolNames = createToolNameMap(input.tools);
      const response = await provider.sendStreamRequest(
        {
          id: requestId,
          model: config.model || 'controlled-a3-model',
          messages: [
            {
              role: 'system',
              content: 'You are a read-only coding agent. Use only the supplied tools, inspect the workspace before answering, never invent file contents, and never request write, process, terminal, Git, network, or credential capabilities.',
            },
            ...input.messages.map((message) => toGatewayMessage(message, toolNames.coreToModel)),
          ],
          tools: input.tools.map((spec) => toOpenAIFunctionTool(spec, toolNames.coreToModel.get(spec.name))),
          toolChoice: input.toolChoice,
          stream: true,
        },
        (chunk) => {
          if (!input.signal.aborted && typeof config.onChunk === 'function') {
            config.onChunk({ requestId, chunk });
          }
        },
        { signal: input.signal },
      );
      if (input.signal.aborted) throw cancelledError();
      return {
        schemaVersion: '1.0',
        summary: response.content || 'Gateway returned a structured plan.',
        ...(response.content ? { finalResponse: response.content } : {}),
        toolCalls: (response.toolCalls || []).map((toolCall) => {
          const coreToolName = toolNames.modelToCore.get(toolCall.name);
          if (!coreToolName) throw new Error(`Gateway returned an unknown function tool: ${toolCall.name}`);
          return {
            call: {
              id: toolCall.id,
              toolName: coreToolName,
              args: parseArguments(toolCall.arguments),
              approvalLevel: core.ApprovalLevel.READ_ONLY,
            },
          };
        }),
        verificationRequirements: [],
        usage: response.usage
          ? { inputTokens: response.usage.promptTokens, outputTokens: response.usage.completionTokens }
          : undefined,
      };
    },
  };
}

function toOpenAIFunctionTool(spec, modelName) {
  const properties = {};
  Object.entries(spec.inputSchema.properties || {}).forEach(([name, property]) => {
    const schema = property.type === 'string[]'
      ? { type: 'array', items: { type: 'string' } }
      : { type: property.type };
    properties[name] = {
      ...schema,
      description: property.description,
      ...(property.enum ? { enum: property.enum } : {}),
      ...(property.default !== undefined ? { default: property.default } : {}),
      ...(property.minimum !== undefined ? { minimum: property.minimum } : {}),
      ...(property.maximum !== undefined ? { maximum: property.maximum } : {}),
    };
  });
  return {
    name: modelName || toModelToolName(spec.name),
    description: spec.description,
    parameters: {
      type: 'object',
      properties,
      required: spec.inputSchema.required || [],
      additionalProperties: false,
    },
  };
}

function toGatewayMessage(message, coreToModel) {
  if (message.role === 'tool') {
    return { role: 'tool', toolCallId: message.toolCallId || 'unknown', content: String(message.content || '') };
  }
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: String(message.content || ''),
      ...(message.toolCalls ? {
        toolCalls: message.toolCalls.map((call) => ({
          id: call.id,
          name: requireModelToolName(call.toolName, coreToModel),
          arguments: JSON.stringify(call.args || {}),
        })),
      } : {}),
    };
  }
  return { role: message.role, content: String(message.content || '') };
}

function createToolNameMap(specs) {
  const coreToModel = new Map();
  const modelToCore = new Map();
  for (const spec of specs) {
    const modelName = toModelToolName(spec.name);
    const collision = modelToCore.get(modelName);
    if (collision && collision !== spec.name) {
      throw new Error(`Gateway tool alias collision: ${collision} and ${spec.name}`);
    }
    coreToModel.set(spec.name, modelName);
    modelToCore.set(modelName, spec.name);
  }
  return { coreToModel, modelToCore };
}

function toModelToolName(coreName) {
  const modelName = String(coreName || '').replace(/[^A-Za-z0-9_-]/g, '_');
  if (!modelName || modelName.length > 64) {
    throw new Error(`Core tool name cannot be represented by the Gateway function contract: ${coreName}`);
  }
  return modelName;
}

function requireModelToolName(coreName, coreToModel) {
  const modelName = coreToModel.get(coreName);
  if (!modelName) throw new Error(`Core message referenced an unavailable Gateway tool: ${coreName}`);
  return modelName;
}

function parseArguments(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_error) {
    throw new Error('Gateway tool call arguments are not valid JSON.');
  }
}

function cancelledError() {
  const error = new Error('Gateway RuntimeModel request was cancelled.');
  error.code = 'REQUEST_CANCELLED';
  return error;
}

module.exports = { createGatewayRuntimeModel, toOpenAIFunctionTool, toModelToolName };
