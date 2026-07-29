/**
 * IPC 通道管理
 * 所有消息经 Schema 校验后才路由到对应 handler
 */

import { IPCMessage, IPCMessageType } from './messages';
import { schemaValidator } from './schema';
import { ShellError, ShellErrorCode } from '../errors';

export type IPCHandler = (message: IPCMessage) => void | Promise<void>;
export type MessageCallback = (message: IPCMessage) => void;

export interface SendResult {
  success: boolean;
  error?: string;
}

export class IPCChannel {
  private handlers: Map<IPCMessageType, IPCHandler> = new Map();
  private listeners: MessageCallback[] = [];

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
      return { success: false, error: `未注册 handler: ${message.type}` };
    }

    try {
      handler(message);
      return { success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errMsg };
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
      return { success: false, error: `未注册 handler: ${message.type}` };
    }

    try {
      await handler(message);
      return { success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errMsg };
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
      } catch {
        // listener 异常不阻断路由
      }
    }

    // 路由到 handler
    const handler = this.handlers.get(message.type);
    if (!handler) {
      return { success: false, error: `未注册 handler: ${message.type}` };
    }

    try {
      handler(message);
      return { success: true };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errMsg };
    }
  }

  /** 获取已注册 handler 的消息类型列表 */
  getRegisteredTypes(): IPCMessageType[] {
    return Array.from(this.handlers.keys());
  }
}
