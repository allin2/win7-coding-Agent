'use strict';

const { IPCDirection, IPCMessageType } = require('../dist/ipc/messages');
const { schemaValidator } = require('../dist/ipc/schema');
const { serializeError } = require('./desktop-host');

function createDesktopRequestHandler(options) {
  const config = options || {};

  return async function handleDesktopRequest(event, rawMessage) {
    if (!config.isValidRendererSender(event)) throw new Error('RENDERER_CAPABILITY_DENIED');
    const validation = schemaValidator.validateMessage(rawMessage);
    if (!validation.valid) throw new Error('IPC_SCHEMA_INVALID:' + validation.errors.join('; '));
    if (rawMessage.direction !== IPCDirection.RENDERER_TO_CORE) throw new Error('IPC_DIRECTION_DENIED');

    const desktopHost = config.getDesktopHost();
    if (!desktopHost) throw new Error('DESKTOP_HOST_UNAVAILABLE');
    const payload = rawMessage.payload || {};

    try {
      switch (rawMessage.type) {
        case IPCMessageType.WORKSPACE_SELECT: {
          let chosen = payload.path;
          if (!chosen && typeof config.chooseWorkspace === 'function') chosen = await config.chooseWorkspace();
          if (!chosen) return { ok: false, cancelled: true };
          const selected = await desktopHost.selectWorkspace(chosen);
          if (typeof config.sendProductEvent === 'function') {
            config.sendProductEvent(IPCMessageType.WORKSPACE_SELECTED, 'desktop', selected);
          }
          return { ok: true, selected };
        }
        case IPCMessageType.SESSION_CREATE:
          return { ok: true, session: desktopHost.createSession(payload) };
        case IPCMessageType.SESSION_LIST:
          return { ok: true, sessions: desktopHost.listSessions() };
        case IPCMessageType.SESSION_CLOSE:
          requireSessionScope(rawMessage, payload);
          return { ok: true, result: await desktopHost.closeSession(payload.sessionId) };
        case IPCMessageType.TASK_SUBMIT:
          requireSessionScope(rawMessage, payload);
          return { ok: true, task: desktopHost.submitTask(payload) };
        case IPCMessageType.TASK_CANCEL:
          requireActiveTaskScope(rawMessage, desktopHost);
          return { ok: true, result: await desktopHost.cancelTask(payload.taskId) };
        case IPCMessageType.TASK_APPROVE:
          requireActiveTaskScope(rawMessage, desktopHost);
          return { ok: true, result: await desktopHost.approveTask(payload) };
        case IPCMessageType.TASK_REJECT:
          requireActiveTaskScope(rawMessage, desktopHost);
          return { ok: true, result: await desktopHost.rejectTask(payload) };
        case IPCMessageType.TASK_UNDO_PREPARE:
          requireSessionScope(rawMessage, payload);
          return { ok: true, task: desktopHost.prepareUndo(payload) };
        case IPCMessageType.RECOVERY_GET:
          requireSessionScope(rawMessage, payload);
          return { ok: true, recovery: desktopHost.getRecovery(payload.sessionId) };
        case IPCMessageType.RECOVERY_RESTORE:
          requireSessionScope(rawMessage, payload);
          return { ok: true, result: desktopHost.restoreRecovery(payload.sessionId) };
        case IPCMessageType.SETTINGS_GET:
          return { ok: true, settings: desktopHost.getSettings() };
        case IPCMessageType.SETTINGS_SET:
          return { ok: true, settings: desktopHost.setSettings(payload) };
        case IPCMessageType.SETTINGS_CREDENTIAL_CLEAR:
          return { ok: true, settings: desktopHost.clearSavedApiKey() };
        case IPCMessageType.DIAGNOSTICS_GET:
        case IPCMessageType.DIAGNOSTICS_REQUEST:
          if (config.runtimeState) config.runtimeState.diagnosticsRequested = true;
          return { ok: true, diagnostics: config.buildDiagnostics() };
        case IPCMessageType.TERMINAL_INPUT:
          return requestError({
            code: 'CAPABILITY_UNAVAILABLE',
            message: 'Win7 v1 不提供终端输入、粘贴或按键注入能力。',
            recommendedAction: '使用产品注入的受信非交互 Runner profile；stdin 始终关闭。',
          });
        default:
          return requestError({
            code: 'CAPABILITY_UNAVAILABLE',
            message: `当前未启用 ${rawMessage.type}`,
            recommendedAction: '使用当前 Alpha 允许的只读或单文件审批闭环；Runner、Git、终端和真实 Gateway 尚未启用。',
          });
      }
    } catch (error) {
      if (config.runtimeState) {
        config.runtimeState.errors.push('desktop-request:' + String(error && error.message ? error.message : error));
      }
      return requestError(error);
    }
  };
}

function requireSessionScope(rawMessage, payload) {
  if (rawMessage.sessionId !== payload.sessionId) throw scopeError();
}

function requireActiveTaskScope(rawMessage, desktopHost) {
  const activeTask = desktopHost.activeTask;
  if (activeTask && activeTask.sessionId !== rawMessage.sessionId) throw scopeError();
}

function scopeError() {
  const error = new Error('IPC session scope does not match the target resource.');
  error.code = 'SESSION_SCOPE_DENIED';
  error.recommendedAction = '使用当前会话的标识后重试。';
  return error;
}

function requestError(error) {
  const result = serializeError(error);
  if (error && error.recommendedAction) result.recommendedAction = error.recommendedAction;
  return { ok: false, error: result };
}

module.exports = { createDesktopRequestHandler };
