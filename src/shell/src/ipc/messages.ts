/**
 * IPC 消息类型定义 — Renderer ↔ Core 双向通信协议
 */

export enum IPCDirection {
  RENDERER_TO_CORE = 'renderer_to_core',
  CORE_TO_RENDERER = 'core_to_renderer',
}

export enum IPCMessageType {
  // Renderer → Core
  SESSION_CREATE = 'session.create',
  SESSION_LIST = 'session.list',
  SESSION_GET = 'session.get',
  TASK_SUBMIT = 'task.submit',
  TASK_CANCEL = 'task.cancel',
  TASK_APPROVE = 'task.approve',
  TASK_REJECT = 'task.reject',
  TERMINAL_INPUT = 'terminal.input',
  SETTINGS_GET = 'settings.get',
  SETTINGS_SET = 'settings.set',
  DIAGNOSTICS_REQUEST = 'diagnostics.request',
  // Core → Renderer
  STATE_CHANGED = 'state.changed',
  STREAM_EVENT = 'stream.event',
  DIFF_PREVIEW = 'diff.preview',
  APPROVAL_REQUEST = 'approval.request',
  TERMINAL_OUTPUT = 'terminal.output',
  ERROR_OCCURRED = 'error.occurred',
  DIAGNOSTICS_RESULT = 'diagnostics.result',
}

export interface IPCMessage<T = unknown> {
  id: string;
  type: IPCMessageType;
  direction: IPCDirection;
  sessionId: string;
  timestamp: string;
  payload: T;
}

// ─── Renderer → Core Payloads ────────────────────────────────────────────────

export interface SessionCreatePayload {
  workspacePath: string;
  label?: string;
}

export interface SessionListPayload {
  limit?: number;
  offset?: number;
}

export interface SessionGetPayload {
  sessionId: string;
}

export interface TaskSubmitPayload {
  sessionId: string;
  prompt: string;
  context?: Record<string, unknown>;
}

export interface TaskCancelPayload {
  taskId: string;
}

export interface TaskApprovePayload {
  taskId: string;
  approvalId: string;
}

export interface TaskRejectPayload {
  taskId: string;
  approvalId: string;
  reason?: string;
}

export interface TerminalInputPayload {
  sessionId: string;
  data: string;
}

export interface SettingsGetPayload {
  keys?: string[];
}

export interface SettingsSetPayload {
  values: Record<string, unknown>;
}

export interface DiagnosticsRequestPayload {
  categories?: string[];
}

// ─── Core → Renderer Payloads ────────────────────────────────────────────────

export interface StateChangedPayload {
  sessionId: string;
  previousState: string;
  currentState: string;
  metadata?: Record<string, unknown>;
}

export interface StreamEventPayload {
  taskId: string;
  chunk: string;
  sequence: number;
  isFinal: boolean;
}

export interface DiffPreviewPayload {
  taskId: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  diff: string;
}

export interface ApprovalRequestPayload {
  taskId: string;
  approvalId: string;
  action: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
  exitCode?: number;
}

export interface ErrorOccurredPayload {
  code: string;
  message: string;
  detail?: string;
  recoverable: boolean;
}

export interface DiagnosticsResultPayload {
  category: string;
  results: Array<{
    check: string;
    passed: boolean;
    detail?: string;
  }>;
}

// ─── Payload 联合类型 ────────────────────────────────────────────────────────

export type RendererToCorePayload =
  | SessionCreatePayload
  | SessionListPayload
  | SessionGetPayload
  | TaskSubmitPayload
  | TaskCancelPayload
  | TaskApprovePayload
  | TaskRejectPayload
  | TerminalInputPayload
  | SettingsGetPayload
  | SettingsSetPayload
  | DiagnosticsRequestPayload;

export type CoreToRendererPayload =
  | StateChangedPayload
  | StreamEventPayload
  | DiffPreviewPayload
  | ApprovalRequestPayload
  | TerminalOutputPayload
  | ErrorOccurredPayload
  | DiagnosticsResultPayload;

// ─── 消息类型 → 方向映射 ─────────────────────────────────────────────────────

export const MESSAGE_DIRECTION_MAP: Record<IPCMessageType, IPCDirection> = {
  [IPCMessageType.SESSION_CREATE]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SESSION_LIST]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SESSION_GET]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TASK_SUBMIT]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TASK_CANCEL]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TASK_APPROVE]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TASK_REJECT]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TERMINAL_INPUT]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SETTINGS_GET]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SETTINGS_SET]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.DIAGNOSTICS_REQUEST]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.STATE_CHANGED]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.STREAM_EVENT]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.DIFF_PREVIEW]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.APPROVAL_REQUEST]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.TERMINAL_OUTPUT]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.ERROR_OCCURRED]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.DIAGNOSTICS_RESULT]: IPCDirection.CORE_TO_RENDERER,
};
