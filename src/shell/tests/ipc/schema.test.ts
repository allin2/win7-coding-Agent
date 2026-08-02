/**
 * IPC Schema 校验正/负向测试
 */

import { SchemaValidator, schemaValidator } from '../../src/ipc/schema';
import { IPCMessageType, IPCDirection, IPCMessage } from '../../src/ipc/messages';

function makeValidMessage(overrides: Partial<IPCMessage> = {}): IPCMessage {
  return {
    protocolVersion: '1.0.0',
    id: 'msg-001',
    type: IPCMessageType.SESSION_CREATE,
    direction: IPCDirection.RENDERER_TO_CORE,
    sessionId: 'sess-001',
    timestamp: new Date().toISOString(),
    payload: { workspacePath: '/home/user/project' },
    ...overrides,
  };
}

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  // ─── 正向测试 ──────────────────────────────────────────────────────────────

  describe('正向：合法消息通过校验', () => {
    it('session.create 合法消息通过', () => {
      const msg = makeValidMessage();
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('task.submit 合法消息通过', () => {
      const msg = makeValidMessage({
        type: IPCMessageType.TASK_SUBMIT,
        payload: { sessionId: 'sess-001', prompt: '帮我写一个函数' },
      });
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(true);
    });

    it('diff.preview 合法消息通过', () => {
      const msg = makeValidMessage({
        type: IPCMessageType.DIFF_PREVIEW,
        direction: IPCDirection.CORE_TO_RENDERER,
        payload: {
          taskId: 'task-001',
          filePath: '/src/main.ts',
          originalContent: 'old',
          proposedContent: 'new',
          diff: '--- a\n+++ b',
          contentEncoding: 'utf-8',
          eol: 'lf',
          truncated: false,
          previewHash: 'a'.repeat(64),
          workspaceBaseHash: 'base-001',
        },
      });
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(true);
    });

    it('error.occurred 合法消息通过', () => {
      const msg = makeValidMessage({
        type: IPCMessageType.ERROR_OCCURRED,
        direction: IPCDirection.CORE_TO_RENDERER,
        payload: {
          code: 'ERR_001',
          message: '出错了',
          recoverable: true,
          recommendedAction: '重试或导出诊断',
        },
      });
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(true);
    });

    it('stream.event 合法消息通过', () => {
      const msg = makeValidMessage({
        type: IPCMessageType.STREAM_EVENT,
        direction: IPCDirection.CORE_TO_RENDERER,
        payload: { taskId: 'task-001', chunk: 'hello', sequence: 0, isFinal: false },
      });
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(true);
    });

    it('approval.request 合法消息通过', () => {
      const msg = makeValidMessage({
        type: IPCMessageType.APPROVAL_REQUEST,
        direction: IPCDirection.CORE_TO_RENDERER,
        payload: {
          taskId: 'task-001',
          approvalId: 'appr-001',
          action: 'write_file',
          description: '写入文件',
          risk: 'medium',
          ruleId: 'POLICY_APPROVAL_REQUIRED',
          targets: ['/src/main.ts'],
          planHash: 'b'.repeat(64),
          previewHash: 'c'.repeat(64),
          workspaceBaseHash: 'base-001',
        },
      });
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(true);
    });
  });

  // ─── 负向测试 ──────────────────────────────────────────────────────────────

  describe('负向：非法消息拒绝校验', () => {
    it('null 消息被拒绝', () => {
      const result = validator.validateMessage(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('非对象消息被拒绝', () => {
      const result = validator.validateMessage('string');
      expect(result.valid).toBe(false);
    });

    it('未知消息类型被拒绝', () => {
      const msg = { id: '1', type: 'unknown.type', direction: 'x', sessionId: '1', timestamp: new Date().toISOString(), payload: {} };
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(false);
      expect(validator.getAuditLog()).toHaveLength(1);
    });

    it('缺少必填字段被拒绝', () => {
      const msg = { id: '1', type: IPCMessageType.SESSION_CREATE, direction: IPCDirection.RENDERER_TO_CORE };
      const result = validator.validateMessage(msg as unknown);
      expect(result.valid).toBe(false);
    });

    it('session.create 缺少 workspacePath 被拒绝', () => {
      const msg = makeValidMessage({ payload: {} });
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(false);
    });

    it('task.submit 缺少 prompt 被拒绝', () => {
      const msg = makeValidMessage({
        type: IPCMessageType.TASK_SUBMIT,
        payload: { sessionId: 'sess-001' },
      });
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(false);
    });

    it('approval.request risk 值非法被拒绝', () => {
      const msg = makeValidMessage({
        type: IPCMessageType.APPROVAL_REQUEST,
        direction: IPCDirection.CORE_TO_RENDERER,
        payload: {
          taskId: 'task-001',
          approvalId: 'appr-001',
          action: 'write',
          description: 'desc',
          risk: 'critical', // 不在 low/medium/high 中
          ruleId: 'POLICY_APPROVAL_REQUIRED',
          targets: ['/src/main.ts'],
          planHash: 'b'.repeat(64),
          previewHash: 'c'.repeat(64),
          workspaceBaseHash: 'base-001',
        },
      });
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(false);
    });

    it('approval.request without a Policy ruleId is rejected', () => {
      const msg = makeValidMessage({
        type: IPCMessageType.APPROVAL_REQUEST,
        direction: IPCDirection.CORE_TO_RENDERER,
        payload: {
          taskId: 'task-001',
          approvalId: 'appr-001',
          action: 'write',
          description: 'desc',
          risk: 'medium',
          targets: ['/src/main.ts'],
          planHash: 'b'.repeat(64),
          previewHash: 'c'.repeat(64),
          workspaceBaseHash: 'base-001',
        },
      });
      expect(validator.validateMessage(msg).valid).toBe(false);
    });

    it('task.reject requires a non-empty user reason', () => {
      const msg = makeValidMessage({
        type: IPCMessageType.TASK_REJECT,
        direction: IPCDirection.RENDERER_TO_CORE,
        payload: { taskId: 'task-001', approvalId: 'appr-001', reason: '' },
      });
      expect(validator.validateMessage(msg).valid).toBe(false);
    });

    it('额外属性被拒绝', () => {
      const msg = makeValidMessage({
        payload: { workspacePath: '/path', extraField: 'bad' },
      });
      const result = validator.validateMessage(msg);
      expect(result.valid).toBe(false);
    });
  });

  // ─── 审计日志 ──────────────────────────────────────────────────────────────

  describe('审计日志', () => {
    it('校验失败时记录审计日志', () => {
      const msg = makeValidMessage({ payload: {} });
      validator.validateMessage(msg);
      const log = validator.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].rejected).toBe(true);
      expect(log[0].messageType).toBe(IPCMessageType.SESSION_CREATE);
    });

    it('校验成功时不记录审计日志', () => {
      const msg = makeValidMessage();
      validator.validateMessage(msg);
      const log = validator.getAuditLog();
      expect(log).toHaveLength(0);
    });

    it('清空审计日志', () => {
      validator.validateMessage(makeValidMessage({ payload: {} }));
      validator.clearAuditLog();
      expect(validator.getAuditLog()).toHaveLength(0);
    });
  });

  // ─── getMessageSchema ──────────────────────────────────────────────────────

  describe('getMessageSchema', () => {
    it('返回合法 JSON Schema', () => {
      const schema = validator.getMessageSchema(IPCMessageType.SESSION_CREATE);
      expect(schema).toBeDefined();
      expect((schema as Record<string, unknown>)['type']).toBe('object');
    });
  });

  // ─── 单例 ──────────────────────────────────────────────────────────────────

  describe('单例 schemaValidator', () => {
    it('单例可正常使用', () => {
      const result = schemaValidator.validateMessage(makeValidMessage());
      expect(result.valid).toBe(true);
    });
  });
});
