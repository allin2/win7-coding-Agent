/**
 * @win7-agent/shell — 公共 API 导出
 */

// ─── Errors ───────────────────────────────────────────────────────────────────
export { ShellError, ShellErrorCode } from './errors';

// ─── IPC ──────────────────────────────────────────────────────────────────────
export {
  IPCDirection,
  IPCMessageType,
  MESSAGE_DIRECTION_MAP,
  // Message envelope
  type IPCMessage,
  // Renderer → Core payloads
  type SessionCreatePayload,
  type SessionListPayload,
  type SessionGetPayload,
  type TaskSubmitPayload,
  type TaskCancelPayload,
  type TaskApprovePayload,
  type TaskRejectPayload,
  type TerminalInputPayload,
  type SettingsGetPayload,
  type SettingsSetPayload,
  type DiagnosticsRequestPayload,
  // Core → Renderer payloads
  type StateChangedPayload,
  type StreamEventPayload,
  type DiffPreviewPayload,
  type ApprovalRequestPayload,
  type TerminalOutputPayload,
  type ErrorOccurredPayload,
  type DiagnosticsResultPayload,
  // Union types
  type RendererToCorePayload,
  type CoreToRendererPayload,
} from './ipc/messages';

export {
  schemaValidator,
  SchemaValidator,
  type ValidationResult,
  type AuditLogEntry,
} from './ipc/schema';

export {
  IPCChannel,
  type IPCHandler,
  type MessageCallback,
  type SendResult,
} from './ipc/channel';

// ─── Security ─────────────────────────────────────────────────────────────────
export {
  generateCSP,
  getDefaultCSP,
  type CSPOptions,
} from './security/csp';

export {
  OutboundFilter,
  type AllowedHostEntry,
  type CheckResult,
} from './security/outbound';

// ─── Updater ──────────────────────────────────────────────────────────────────
export {
  Updater,
  type UpdaterConfig,
  type UpdateInfo,
  type DownloadResult,
  type VerifyResult,
  type ApplyResult,
  type RollbackResult,
} from './updater/updater';
