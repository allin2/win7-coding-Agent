/**
 * IPC 消息类型定义 — Renderer ↔ Core 双向通信协议
 */

export enum IPCDirection {
  RENDERER_TO_CORE = 'renderer_to_core',
  CORE_TO_RENDERER = 'core_to_renderer',
}

export enum IPCMessageType {
  // Renderer → Core
  WORKSPACE_SELECT = 'workspace.select',
  SESSION_CREATE = 'session.create',
  SESSION_LIST = 'session.list',
  SESSION_GET = 'session.get',
  SESSION_CLOSE = 'session.close',
  TASK_SUBMIT = 'task.submit',
  TASK_CANCEL = 'task.cancel',
  TASK_APPROVE = 'task.approve',
  TASK_REJECT = 'task.reject',
  TASK_UNDO_PREPARE = 'task.undo_prepare',
  RECOVERY_GET = 'recovery.get',
  RECOVERY_RESTORE = 'recovery.restore',
  TERMINAL_INPUT = 'terminal.input',
  SETTINGS_GET = 'settings.get',
  SETTINGS_SET = 'settings.set',
  SETTINGS_CREDENTIAL_CLEAR = 'settings.credential_clear',
  DIAGNOSTICS_GET = 'diagnostics.get',
  DIAGNOSTICS_REQUEST = 'diagnostics.request',
  // Core → Renderer
  WORKSPACE_SELECTED = 'workspace.selected',
  STATE_CHANGED = 'state.changed',
  TASK_EVENT = 'task.event',
  STREAM_EVENT = 'stream.event',
  DIFF_PREVIEW = 'diff.preview',
  APPROVAL_REQUEST = 'approval.request',
  TERMINAL_OUTPUT = 'terminal.output',
  ERROR_OCCURRED = 'error.occurred',
  DIAGNOSTICS_RESULT = 'diagnostics.result',
}

export interface IPCMessage<T = unknown> {
  protocolVersion: '1.0.0';
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

export interface WorkspaceSelectPayload {
  /** Optional test/deployment hint; the production UI normally opens the main-process picker. */
  path?: string;
}

export interface SessionListPayload {
  limit?: number;
  offset?: number;
}

export interface SessionGetPayload {
  sessionId: string;
}

export interface SessionClosePayload {
  sessionId: string;
}

export interface TaskSubmitPayload {
  sessionId: string;
  prompt: string;
  context?: Record<string, unknown>;
  scenario?: 'structure' | 'encoding' | 'cancellable' | 'edit' | 'undo';
}

export interface TaskCancelPayload {
  taskId: string;
}

export interface TaskApprovePayload {
  taskId: string;
  approvalId: string;
  /** Hash of the exact plan shown to the user. */
  planHash: string;
  /** Workspace baseline bound to the preview. */
  workspaceBaseHash: string;
}

export interface TaskRejectPayload {
  taskId: string;
  approvalId: string;
  /** User-visible reason returned to Core/model as rejection evidence. */
  reason: string;
}

export interface TaskUndoPreparePayload {
  taskId: string;
}

export interface RecoveryPayload {
  sessionId: string;
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

export interface SettingsCredentialClearPayload {
  credential: 'api-key';
}

export interface DiagnosticsRequestPayload {
  categories?: string[];
}

export interface WorkspaceSelectedPayload {
  workspacePath: string;
  displayName: string;
}

export interface TaskEventPayload {
  taskId: string;
  eventId: string;
  eventKind: string;
  sequence: number;
  timestamp: string;
  data: Record<string, unknown>;
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
  contentEncoding: 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'gbk' | 'binary';
  eol: 'lf' | 'crlf' | 'mixed' | 'none';
  truncated: boolean;
  previewHash: string;
  workspaceBaseHash: string;
}

export interface ApprovalRequestPayload {
  taskId: string;
  approvalId: string;
  action: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  /** Stable Policy rule shown to the user and recorded in the decision audit. */
  ruleId: string;
  targets: string[];
  planHash: string;
  previewHash: string;
  workspaceBaseHash: string;
}

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
  exitCode?: number;
  sequence: number;
  truncated: boolean;
}

export interface ErrorOccurredPayload {
  code: string;
  message: string;
  detail?: string;
  recoverable: boolean;
  recommendedAction: string;
  retryAfterMs?: number;
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
  | WorkspaceSelectPayload
  | SessionCreatePayload
  | SessionListPayload
  | SessionGetPayload
  | SessionClosePayload
  | TaskSubmitPayload
  | TaskCancelPayload
  | TaskApprovePayload
  | TaskRejectPayload
  | TaskUndoPreparePayload
  | RecoveryPayload
  | TerminalInputPayload
  | SettingsGetPayload
  | SettingsSetPayload
  | SettingsCredentialClearPayload
  | DiagnosticsRequestPayload;

export type CoreToRendererPayload =
  | WorkspaceSelectedPayload
  | StateChangedPayload
  | TaskEventPayload
  | StreamEventPayload
  | DiffPreviewPayload
  | ApprovalRequestPayload
  | TerminalOutputPayload
  | ErrorOccurredPayload
  | DiagnosticsResultPayload;

// ─── 消息类型 → 方向映射 ─────────────────────────────────────────────────────

export const MESSAGE_DIRECTION_MAP: Record<IPCMessageType, IPCDirection> = {
  [IPCMessageType.WORKSPACE_SELECT]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SESSION_CREATE]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SESSION_LIST]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SESSION_GET]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SESSION_CLOSE]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TASK_SUBMIT]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TASK_CANCEL]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TASK_APPROVE]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TASK_REJECT]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TASK_UNDO_PREPARE]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.RECOVERY_GET]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.RECOVERY_RESTORE]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.TERMINAL_INPUT]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SETTINGS_GET]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SETTINGS_SET]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.SETTINGS_CREDENTIAL_CLEAR]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.DIAGNOSTICS_GET]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.DIAGNOSTICS_REQUEST]: IPCDirection.RENDERER_TO_CORE,
  [IPCMessageType.WORKSPACE_SELECTED]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.STATE_CHANGED]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.TASK_EVENT]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.STREAM_EVENT]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.DIFF_PREVIEW]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.APPROVAL_REQUEST]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.TERMINAL_OUTPUT]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.ERROR_OCCURRED]: IPCDirection.CORE_TO_RENDERER,
  [IPCMessageType.DIAGNOSTICS_RESULT]: IPCDirection.CORE_TO_RENDERER,
};
