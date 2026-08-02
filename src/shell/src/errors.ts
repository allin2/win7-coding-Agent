/**
 * Shell 模块结构化错误码定义
 * 所有错误均通过 ShellError 抛出，不允许静默吞异常
 */

export enum ShellErrorCode {
  /** IPC 消息未通过 JSON Schema 校验 */
  IPC_SCHEMA_INVALID = 'IPC_SCHEMA_INVALID',
  /** Renderer 能力被安全策略拒绝 */
  RENDERER_CAPABILITY_DENIED = 'RENDERER_CAPABILITY_DENIED',
  /** 出站请求被白名单策略阻断 */
  OUTBOUND_BLOCKED = 'OUTBOUND_BLOCKED',
  /** 更新包校验失败（哈希/签名不匹配） */
  UPDATE_VERIFY_FAILED = 'UPDATE_VERIFY_FAILED',
  /** GPU 进程不可用，需降级到软件渲染 */
  GPU_FALLBACK_REQUIRED = 'GPU_FALLBACK_REQUIRED',
}

export class ShellError extends Error {
  public readonly code: ShellErrorCode;
  public readonly detail?: string;

  constructor(code: ShellErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'ShellError';
    this.code = code;
    this.detail = detail;
    // 保证 instanceof 在跨模块边界时正确
    Object.setPrototypeOf(this, ShellError.prototype);
  }

  toJSON(): { code: string; message: string; detail?: string } {
    return {
      code: this.code,
      message: this.message,
      ...(this.detail !== undefined ? { detail: this.detail } : {}),
    };
  }
}
