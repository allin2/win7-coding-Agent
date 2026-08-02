import { AgentError, AgentErrorCode } from './errors';
import { ApprovalLevel, ToolCall } from './types';

export type ToolInputType = 'string' | 'number' | 'boolean' | 'string[]';

export type ToolInputValue = string | number | boolean | string[];

/** Reviewed capability vocabulary; extending it requires Policy review. */
export type ToolCapability =
  | 'agent_control.update_plan'
  | 'code.search'
  | 'workspace.read'
  | 'workspace.search'
  | 'workspace_write';

/**
 * Model-facing parameter contract. Descriptions are mandatory because the
 * model cannot infer path rules, units, or intent from a property name alone.
 */
export interface ToolInputProperty {
  type: ToolInputType;
  description: string;
  enum?: ToolInputValue[];
  default?: ToolInputValue;
  minimum?: number;
  maximum?: number;
}

export interface ToolInputSchema {
  properties: Record<string, ToolInputProperty>;
  required: string[];
  additionalProperties?: boolean;
}

export interface ToolSpec {
  schemaVersion: '2.0';
  name: string;
  description: string;
  approvalLevel: ApprovalLevel;
  capability: ToolCapability;
  inputSchema: ToolInputSchema;
}

export class ToolRegistry {
  private readonly specs = new Map<string, ToolSpec>();

  register(spec: ToolSpec): void {
    if (spec.schemaVersion !== '2.0' || !spec.name || !spec.capability) {
      throw new Error('ToolSpec requires schemaVersion 2.0, name, and capability');
    }
    if (this.specs.has(spec.name)) {
      throw new Error(`ToolSpec already registered: ${spec.name}`);
    }
    for (const required of spec.inputSchema.required) {
      if (!(required in spec.inputSchema.properties)) {
        throw new Error(`Required input is not declared for ${spec.name}: ${required}`);
      }
    }
    for (const [name, property] of Object.entries(spec.inputSchema.properties)) {
      if (!property.description || property.description.trim().length === 0) {
        throw new Error(`Tool input requires a description for ${spec.name}.${name}`);
      }
      if (property.enum) {
        if (property.enum.length === 0) {
          throw new Error(`Tool input enum cannot be empty for ${spec.name}.${name}`);
        }
        if (property.enum.some((value) => !matchesType(value, property.type))) {
          throw new Error(`Tool input enum has an invalid type for ${spec.name}.${name}`);
        }
      }
      if (property.default !== undefined) {
        if (!matchesType(property.default, property.type)) {
          throw new Error(`Tool input default has an invalid type for ${spec.name}.${name}`);
        }
        if (property.enum && !property.enum.some((value) => valuesEqual(value, property.default!))) {
          throw new Error(`Tool input default is not in enum for ${spec.name}.${name}`);
        }
      }
      if (property.minimum !== undefined || property.maximum !== undefined) {
        if (property.type !== 'number') {
          throw new Error(`Tool input numeric bounds require number type for ${spec.name}.${name}`);
        }
        if (
          (property.minimum !== undefined && !Number.isFinite(property.minimum)) ||
          (property.maximum !== undefined && !Number.isFinite(property.maximum)) ||
          (
            property.minimum !== undefined &&
            property.maximum !== undefined &&
            property.minimum > property.maximum
          )
        ) {
          throw new Error(`Tool input numeric bounds are invalid for ${spec.name}.${name}`);
        }
        if (
          typeof property.default === 'number' &&
          (
            (property.minimum !== undefined && property.default < property.minimum) ||
            (property.maximum !== undefined && property.default > property.maximum)
          )
        ) {
          throw new Error(`Tool input default is outside numeric bounds for ${spec.name}.${name}`);
        }
      }
      if (spec.inputSchema.required.includes(name) && property.default !== undefined) {
        throw new Error(`Required tool input cannot declare a default for ${spec.name}.${name}`);
      }
    }
    this.specs.set(spec.name, cloneSpec(spec));
  }

  resolve(name: string): ToolSpec {
    const spec = this.specs.get(name);
    if (!spec) {
      throw new AgentError(
        AgentErrorCode.TOOL_NOT_REGISTERED,
        `Tool is not registered: ${name}`,
        { toolName: name },
        '使用版本化 ToolSpec 注册该工具后重试。',
      );
    }
    return cloneSpec(spec);
  }

  validateCall(call: ToolCall): ToolSpec {
    const spec = this.resolve(call.toolName);
    if (call.approvalLevel !== spec.approvalLevel) {
      throw new AgentError(
        AgentErrorCode.TOOL_INPUT_INVALID,
        `Tool approval level mismatch for ${call.toolName}`,
        {
          declared: spec.approvalLevel,
          requested: call.approvalLevel,
        },
        '按 ToolSpec 的审批级别重新生成计划。',
      );
    }
    const errors: string[] = [];
    for (const required of spec.inputSchema.required) {
      if (!(required in call.args)) errors.push(`missing:${required}`);
    }
    for (const [key, value] of Object.entries(call.args)) {
      const property = spec.inputSchema.properties[key];
      if (!property) {
        if (!spec.inputSchema.additionalProperties) errors.push(`unknown:${key}`);
        continue;
      }
      if (!matchesType(value, property.type)) {
        errors.push(`type:${key}:${property.type}`);
      } else if (property.enum && !property.enum.some((candidate) => valuesEqual(candidate, value))) {
        errors.push(`enum:${key}`);
      } else if (
        typeof value === 'number' &&
        (
          (property.minimum !== undefined && value < property.minimum) ||
          (property.maximum !== undefined && value > property.maximum)
        )
      ) {
        errors.push(`range:${key}`);
      }
    }
    if (errors.length > 0) {
      throw new AgentError(
        AgentErrorCode.TOOL_INPUT_INVALID,
        `Tool input validation failed for ${call.toolName}: ${errors.join(', ')}`,
        { toolName: call.toolName, errors },
        '按 ToolSpec 修正结构化参数，不要改用 Shell 字符串。',
      );
    }
    return spec;
  }

  /** Validate and return an execution copy with optional defaults applied. */
  normalizeCall(call: ToolCall): ToolCall {
    const spec = this.validateCall(call);
    const args: Record<string, unknown> = { ...call.args };
    for (const [name, property] of Object.entries(spec.inputSchema.properties)) {
      if (!(name in args) && property.default !== undefined) {
        args[name] = cloneValue(property.default);
      }
    }
    return { ...call, args };
  }

  list(): ToolSpec[] {
    return Array.from(this.specs.values(), cloneSpec)
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}

function matchesType(value: unknown, expected: ToolInputType): boolean {
  if (expected === 'string[]') {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }
  return typeof value === expected;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

function cloneValue(value: ToolInputValue): ToolInputValue {
  return Array.isArray(value) ? [...value] : value;
}

function cloneSpec(spec: ToolSpec): ToolSpec {
  return {
    ...spec,
    inputSchema: {
      properties: Object.fromEntries(
        Object.entries(spec.inputSchema.properties).map(([name, property]) => [
          name,
          {
            ...property,
            ...(property.enum ? { enum: property.enum.map(cloneValue) } : {}),
            ...(property.default !== undefined ? { default: cloneValue(property.default) } : {}),
          },
        ]),
      ),
      required: [...spec.inputSchema.required],
      additionalProperties: spec.inputSchema.additionalProperties ?? false,
    },
  };
}
