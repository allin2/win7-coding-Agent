'use strict';

const crypto = require('crypto');

const A8_SYSTEM_PROMPT_VERSION = 'a8-system-prompt-v1';
const A8_SYSTEM_PROMPT = [
  `[${A8_SYSTEM_PROMPT_VERSION}] You are the Win7 Coding Agent for an A8 conversation.`,
  'Use only the tools supplied in this request, inspect workspace facts before proposing changes, and never invent file contents or execution results.',
  'If workspace_review_prepare is supplied, you may create a bounded CREATE/MODIFY/DELETE proposal in the private A8 Review staging area; that action never writes the target workspace.',
  'You cannot accept, approve, or apply Review files. Target-workspace changes require the user\'s per-file decisions and a separate exact Apply approval enforced outside the model.',
  'Never claim tests passed from model text, inference, Replay, or an untrusted result. Only a trusted Runner or remote validation adapter can produce PASS; otherwise report the work as not run or unverified.',
  'Do not request or simulate process, terminal, arbitrary shell, Git write, arbitrary network, credential, or any other capability that is not supplied.',
  'If a required tool or validation capability is unavailable, state the limitation and preserve the Review or conversation facts instead of bypassing policy.',
].join('\n');
const A8_SYSTEM_PROMPT_SHA256 = crypto.createHash('sha256').update(A8_SYSTEM_PROMPT, 'utf8').digest('hex');

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
      let lastChunkIndex = -1;
      const toolNames = createToolNameMap(input.tools);
      const sensitiveValues = readSensitiveValues(config);
      let response;
      try {
        response = await provider.sendStreamRequest(
          {
            id: requestId,
            model: config.model || 'controlled-a3-model',
            messages: [
              {
                role: 'system',
                content: A8_SYSTEM_PROMPT,
              },
              ...input.messages.map((message) => toGatewayMessage(message, toolNames.coreToModel)),
            ],
            tools: input.tools.map((spec) => toOpenAIFunctionTool(spec, toolNames.coreToModel.get(spec.name))),
            toolChoice: input.toolChoice,
            stream: true,
          },
          (chunk) => {
            assertNoSensitiveData(chunk, sensitiveValues);
            if (!input.signal.aborted && typeof config.onChunk === 'function') {
              lastChunkIndex = chunk.index;
              config.onChunk({ requestId, chunk });
            }
          },
          { signal: input.signal },
        );
        assertNoSensitiveData(response, sensitiveValues);
      } catch (error) {
        if (containsSensitiveData(error && error.message ? error.message : error, sensitiveValues)) {
          throw sensitiveDataError();
        }
        throw error;
      }
      if (input.signal.aborted) throw cancelledError();
      if (typeof config.onComplete === 'function') {
        config.onComplete({
          requestId,
          index: lastChunkIndex + 1,
          finishReason: response.finishReason || null,
        });
      }
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

function readSensitiveValues(config) {
  if (!config || typeof config.getSensitiveValues !== 'function') return [];
  try {
    const values = config.getSensitiveValues();
    return Array.isArray(values)
      ? values.filter((value) => typeof value === 'string' && value.length > 0)
      : [];
  } catch (_error) {
    return [];
  }
}

function sensitiveRepresentations(values) {
  const result = new Set();
  for (const value of values) {
    result.add(value);
    result.add(Buffer.from(value, 'utf8').toString('base64'));
    result.add(`Bearer ${value}`);
  }
  return Array.from(result).filter(Boolean);
}

function containsSensitiveData(value, sensitiveValues) {
  if (!sensitiveValues || sensitiveValues.length === 0) return false;
  let text;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch (_error) {
    text = String(value);
  }
  return sensitiveRepresentations(sensitiveValues).some((candidate) => text.includes(candidate));
}

function assertNoSensitiveData(value, sensitiveValues) {
  if (containsSensitiveData(value, sensitiveValues)) throw sensitiveDataError();
}

function sensitiveDataError() {
  const error = new Error('Gateway content matched a known sensitive value and was blocked before persistence.');
  error.code = 'SENSITIVE_DATA_BLOCKED';
  return error;
}

function getSystemPromptContract() {
  return Object.freeze({
    schemaVersion: 1,
    version: A8_SYSTEM_PROMPT_VERSION,
    sha256: A8_SYSTEM_PROMPT_SHA256,
    content: A8_SYSTEM_PROMPT,
  });
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

module.exports = {
  A8_SYSTEM_PROMPT_SHA256,
  A8_SYSTEM_PROMPT_VERSION,
  createGatewayRuntimeModel,
  getSystemPromptContract,
  toOpenAIFunctionTool,
  toModelToolName,
};
