/**
 * IPC 消息 JSON Schema 校验层
 * 使用 ajv 对每条 IPC 消息进行结构验证
 * 未通过校验的消息拒绝并记录审计日志
 */

import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import { IPCMessageType, IPCDirection } from './messages';
import { ShellError, ShellErrorCode } from '../errors';

// ─── JSON Schema 定义 ────────────────────────────────────────────────────────

const baseEnvelopeSchema = {
  type: 'object',
  required: ['id', 'type', 'direction', 'sessionId', 'timestamp', 'payload'],
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { type: 'string' },
    direction: { type: 'string', enum: [IPCDirection.RENDERER_TO_CORE, IPCDirection.CORE_TO_RENDERER] },
    sessionId: { type: 'string', minLength: 1 },
    timestamp: { type: 'string', format: 'date-time' },
    payload: { type: 'object' },
  },
  additionalProperties: false,
};

// ─── Payload Schemas by Message Type ─────────────────────────────────────────

const payloadSchemas: Record<string, object> = {
  [IPCMessageType.SESSION_CREATE]: {
    type: 'object',
    required: ['workspacePath'],
    properties: {
      workspacePath: { type: 'string', minLength: 1 },
      label: { type: 'string' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.SESSION_LIST]: {
    type: 'object',
    properties: {
      limit: { type: 'number', minimum: 1 },
      offset: { type: 'number', minimum: 0 },
    },
    additionalProperties: false,
  },
  [IPCMessageType.SESSION_GET]: {
    type: 'object',
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  [IPCMessageType.TASK_SUBMIT]: {
    type: 'object',
    required: ['sessionId', 'prompt'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      prompt: { type: 'string', minLength: 1 },
      context: { type: 'object' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.TASK_CANCEL]: {
    type: 'object',
    required: ['taskId'],
    properties: {
      taskId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  [IPCMessageType.TASK_APPROVE]: {
    type: 'object',
    required: ['taskId', 'approvalId'],
    properties: {
      taskId: { type: 'string', minLength: 1 },
      approvalId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
  [IPCMessageType.TASK_REJECT]: {
    type: 'object',
    required: ['taskId', 'approvalId'],
    properties: {
      taskId: { type: 'string', minLength: 1 },
      approvalId: { type: 'string', minLength: 1 },
      reason: { type: 'string' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.TERMINAL_INPUT]: {
    type: 'object',
    required: ['sessionId', 'data'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      data: { type: 'string' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.SETTINGS_GET]: {
    type: 'object',
    properties: {
      keys: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  [IPCMessageType.SETTINGS_SET]: {
    type: 'object',
    required: ['values'],
    properties: {
      values: { type: 'object' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.DIAGNOSTICS_REQUEST]: {
    type: 'object',
    properties: {
      categories: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
  [IPCMessageType.STATE_CHANGED]: {
    type: 'object',
    required: ['sessionId', 'previousState', 'currentState'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      previousState: { type: 'string' },
      currentState: { type: 'string' },
      metadata: { type: 'object' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.STREAM_EVENT]: {
    type: 'object',
    required: ['taskId', 'chunk', 'sequence', 'isFinal'],
    properties: {
      taskId: { type: 'string', minLength: 1 },
      chunk: { type: 'string' },
      sequence: { type: 'number', minimum: 0 },
      isFinal: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.DIFF_PREVIEW]: {
    type: 'object',
    required: ['taskId', 'filePath', 'originalContent', 'proposedContent', 'diff'],
    properties: {
      taskId: { type: 'string', minLength: 1 },
      filePath: { type: 'string', minLength: 1 },
      originalContent: { type: 'string' },
      proposedContent: { type: 'string' },
      diff: { type: 'string' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.APPROVAL_REQUEST]: {
    type: 'object',
    required: ['taskId', 'approvalId', 'action', 'description', 'risk'],
    properties: {
      taskId: { type: 'string', minLength: 1 },
      approvalId: { type: 'string', minLength: 1 },
      action: { type: 'string', minLength: 1 },
      description: { type: 'string', minLength: 1 },
      risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    additionalProperties: false,
  },
  [IPCMessageType.TERMINAL_OUTPUT]: {
    type: 'object',
    required: ['sessionId', 'data'],
    properties: {
      sessionId: { type: 'string', minLength: 1 },
      data: { type: 'string' },
      exitCode: { type: 'number' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.ERROR_OCCURRED]: {
    type: 'object',
    required: ['code', 'message', 'recoverable'],
    properties: {
      code: { type: 'string', minLength: 1 },
      message: { type: 'string', minLength: 1 },
      detail: { type: 'string' },
      recoverable: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  [IPCMessageType.DIAGNOSTICS_RESULT]: {
    type: 'object',
    required: ['category', 'results'],
    properties: {
      category: { type: 'string', minLength: 1 },
      results: {
        type: 'array',
        items: {
          type: 'object',
          required: ['check', 'passed'],
          properties: {
            check: { type: 'string', minLength: 1 },
            passed: { type: 'boolean' },
            detail: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

// ─── Validator ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** 审计日志条目 */
export interface AuditLogEntry {
  timestamp: string;
  messageId: string;
  messageType: string;
  rejected: true;
  errors: string[];
}

class SchemaValidator {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction> = new Map();
  private auditLog: AuditLogEntry[] = [];

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    // 添加 date-time format 支持
    this.ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    this.buildValidators();
  }

  private buildValidators(): void {
    for (const [msgType, payloadSchema] of Object.entries(payloadSchemas)) {
      const fullSchema = {
        ...baseEnvelopeSchema,
        properties: {
          ...baseEnvelopeSchema.properties,
          type: { ...baseEnvelopeSchema.properties.type, const: msgType },
          payload: payloadSchema,
        },
      };
      this.validators.set(msgType, this.ajv.compile(fullSchema));
    }
  }

  /**
   * 校验一条 IPC 消息
   * 未通过校验时记录审计日志并抛出 ShellError
   */
  validateMessage(msg: unknown): ValidationResult {
    if (typeof msg !== 'object' || msg === null) {
      return { valid: false, errors: ['消息必须为非空对象'] };
    }

    const raw = msg as Record<string, unknown>;
    const msgType = raw['type'] as string | undefined;

    if (!msgType || !this.validators.has(msgType)) {
      return { valid: false, errors: [`未知消息类型: ${msgType ?? '(空)'}`] };
    }

    const validate = this.validators.get(msgType)!;
    const valid = validate(msg);

    if (!valid) {
      const errors = (validate.errors ?? []).map((e: ErrorObject) => {
        const path = e.instancePath || '/';
        return `${path}: ${e.message ?? '未知错误'}`;
      });

      // 记录审计日志
      this.auditLog.push({
        timestamp: new Date().toISOString(),
        messageId: (raw['id'] as string) ?? '(unknown)',
        messageType: msgType,
        rejected: true,
        errors,
      });

      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  /** 获取指定消息类型的 JSON Schema */
  getMessageSchema(type: IPCMessageType): object {
    const payloadSchema = payloadSchemas[type];
    if (!payloadSchema) {
      throw new ShellError(
        ShellErrorCode.IPC_SCHEMA_INVALID,
        `未找到消息类型的 Schema: ${type}`,
      );
    }
    return {
      ...baseEnvelopeSchema,
      properties: {
        ...baseEnvelopeSchema.properties,
        type: { ...baseEnvelopeSchema.properties.type, const: type },
        payload: payloadSchema,
      },
    };
  }

  /** 获取审计日志副本 */
  getAuditLog(): ReadonlyArray<AuditLogEntry> {
    return [...this.auditLog];
  }

  /** 清空审计日志 */
  clearAuditLog(): void {
    this.auditLog = [];
  }
}

// 单例导出
export const schemaValidator = new SchemaValidator();

export { SchemaValidator };
