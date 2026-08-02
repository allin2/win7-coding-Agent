/**
 * IPC 通道管理
 * 所有消息经 Schema 校验后才路由到对应 handler
 */

import { IPCMessage, IPCMessageType } from './messages';
import { schemaValidator } from './schema';
import { ShellError, ShellErrorCode } from '../errors';

export type IPCHandler = (message: IPCMessage) => void | Promise<void>;
export type MessageCallback = (message: IPCMessage) => void;
export interface IPCChannelErrorEvent {
  stage: 'listener' | 'handler' | 'sync_async_mismatch';
  messageId: string;
  messageType: IPCMessageType;
  error: string;
  timestamp: string;
}
export type IPCErrorCallback = (event: IPCChannelErrorEvent) => void;

export interface SendResult {
  success: boolean;
  error?: string;
  code?: 'HANDLER_NOT_FOUND' | 'HANDLER_FAILED' | 'ASYNC_HANDLER_REQUIRES_ASYNC_API';
  recommendedAction?: string;
}

export class IPCChannel {
  private handlers: Map<IPCMessageType, IPCHandler> = new Map();
  private listeners: MessageCallback[] = [];
  private errorListeners: IPCErrorCallback[] = [];
  private channelErrors: IPCChannelErrorEvent[] = [];

  /**
   * 注册指定消息类型的处理器
   * 同一类型只允许一个 handler，重复注册会覆盖
   */
  registerHandler(type: IPCMessageType, handler: IPCHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * 移除指定消息类型的 handler
   */
  unregisterHandler(type: IPCMessageType): void {
    this.handlers.delete(type);
  }

  /**
   * 发送消息（经 Schema 校验后才路由）
   * 校验失败时抛出 ShellError(IPC_SCHEMA_INVALID)
   */
  send(message: IPCMessage): SendResult {
    const result = schemaValidator.validateMessage(message);
    if (!result.valid) {
      throw new ShellError(
        ShellErrorCode.IPC_SCHEMA_INVALID,
        `IPC 消息校验失败: ${result.errors.join('; ')}`,
        JSON.stringify(result.errors),
      );
    }

    const handler = this.handlers.get(message.type);
    if (!handler) {
      return this.missingHandler(message);
    }

    try {
      const handlerResult = handler(message);
      if (isPromiseLike(handlerResult)) {
        void handlerResult.catch((error) => this.recordError('handler', message, error));
        this.recordError(
          'sync_async_mismatch',
          message,
          '同步 send/receive 调用了异步 handler',
        );
        return {
          success: false,
          code: 'ASYNC_HANDLER_REQUIRES_ASYNC_API',
          error: '该消息处理器是异步的，不能通过同步 send 调用',
          recommendedAction: '改用 sendAsync，并等待返回结果后再更新界面状态。',
        };
      }
      return { success: true };
    } catch (err) {
      this.recordError('handler', message, err);
      return this.handlerFailure(err);
    }
  }

  /**
   * 异步发送消息（支持 async handler）
   */
  async sendAsync(message: IPCMessage): Promise<SendResult> {
    const result = schemaValidator.validateMessage(message);
    if (!result.valid) {
      throw new ShellError(
        ShellErrorCode.IPC_SCHEMA_INVALID,
        `IPC 消息校验失败: ${result.errors.join('; ')}`,
        JSON.stringify(result.errors),
      );
    }

    const handler = this.handlers.get(message.type);
    if (!handler) {
      return this.missingHandler(message);
    }

    try {
      await handler(message);
      return { success: true };
    } catch (err) {
      this.recordError('handler', message, err);
      return this.handlerFailure(err);
    }
  }

  /**
   * 注册消息监听回调（所有通过校验的消息均会触发）
   */
  onMessage(callback: MessageCallback): void {
    this.listeners.push(callback);
  }

  /**
   * 移除消息监听回调
   */
  offMessage(callback: MessageCallback): void {
    const idx = this.listeners.indexOf(callback);
    if (idx >= 0) {
      this.listeners.splice(idx, 1);
    }
  }

  onError(callback: IPCErrorCallback): () => void {
    this.errorListeners.push(callback);
    return () => {
      const index = this.errorListeners.indexOf(callback);
      if (index >= 0) this.errorListeners.splice(index, 1);
    };
  }

  getErrors(): ReadonlyArray<IPCChannelErrorEvent> {
    return this.channelErrors.slice();
  }

  clearErrors(): void {
    this.channelErrors = [];
  }

  /**
   * 接收并路由消息（供底层调用）
   * 校验失败抛出 ShellError，校验成功后触发 listeners 和 handler
   */
  receive(rawMessage: unknown): SendResult {
    const result = schemaValidator.validateMessage(rawMessage);
    if (!result.valid) {
      throw new ShellError(
        ShellErrorCode.IPC_SCHEMA_INVALID,
        `IPC 消息校验失败: ${result.errors.join('; ')}`,
        JSON.stringify(result.errors),
      );
    }

    const message = rawMessage as IPCMessage;

    // 通知所有 listeners
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (error) {
        // Listener failure must not block routing, but it is observable and
        // retained for diagnostics instead of being silently swallowed.
        this.recordError('listener', message, error);
      }
    }

    // 路由到 handler
    const handler = this.handlers.get(message.type);
    if (!handler) {
      return this.missingHandler(message);
    }

    try {
      const handlerResult = handler(message);
      if (isPromiseLike(handlerResult)) {
        void handlerResult.catch((error) => this.recordError('handler', message, error));
        this.recordError('sync_async_mismatch', message, '同步 receive 调用了异步 handler');
        return {
          success: false,
          code: 'ASYNC_HANDLER_REQUIRES_ASYNC_API',
          error: '该消息处理器是异步的，不能通过同步 receive 调用',
          recommendedAction: '改用 receiveAsync，并等待返回结果。',
        };
      }
      return { success: true };
    } catch (err) {
      this.recordError('handler', message, err);
      return this.handlerFailure(err);
    }
  }

  async receiveAsync(rawMessage: unknown): Promise<SendResult> {
    const result = schemaValidator.validateMessage(rawMessage);
    if (!result.valid) {
      throw new ShellError(
        ShellErrorCode.IPC_SCHEMA_INVALID,
        `IPC 消息校验失败: ${result.errors.join('; ')}`,
        JSON.stringify(result.errors),
      );
    }
    const message = rawMessage as IPCMessage;
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (error) {
        this.recordError('listener', message, error);
      }
    }
    const handler = this.handlers.get(message.type);
    if (!handler) return this.missingHandler(message);
    try {
      await handler(message);
      return { success: true };
    } catch (error) {
      this.recordError('handler', message, error);
      return this.handlerFailure(error);
    }
  }

  /** 获取已注册 handler 的消息类型列表 */
  getRegisteredTypes(): IPCMessageType[] {
    return Array.from(this.handlers.keys());
  }

  private recordError(
    stage: IPCChannelErrorEvent['stage'],
    message: IPCMessage,
    error: unknown,
  ): void {
    const event: IPCChannelErrorEvent = {
      stage,
      messageId: message.id,
      messageType: message.type,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
    this.channelErrors.push(event);
    if (this.channelErrors.length > 100) this.channelErrors.shift();
    for (const listener of this.errorListeners) {
      try {
        listener(event);
      } catch {
        // The event is already retained in channelErrors. Error observers are
        // diagnostics only and cannot recursively break message delivery.
      }
    }
  }

  private missingHandler(message: IPCMessage): SendResult {
    return {
      success: false,
      code: 'HANDLER_NOT_FOUND',
      error: `未注册 handler: ${message.type}`,
      recommendedAction: '重新启动相关 Core 进程；若问题持续，请导出诊断日志。',
    };
  }

  private handlerFailure(error: unknown): SendResult {
    return {
      success: false,
      code: 'HANDLER_FAILED',
      error: error instanceof Error ? error.message : String(error),
      recommendedAction: '操作未确认完成，请保持当前页面并查看诊断详情后重试。',
    };
  }
}

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return typeof value === 'object' && value !== null && typeof value.then === 'function';
}
