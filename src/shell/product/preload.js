'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let messageCounter = 0;

function request(type, sessionId, payload) {
  messageCounter += 1;
  return ipcRenderer.invoke('desktop:request', {
    protocolVersion: '1.0.0',
    id: `renderer-${Date.now()}-${messageCounter}`,
    type,
    direction: 'renderer_to_core',
    sessionId: sessionId || 'desktop',
    timestamp: new Date().toISOString(),
    payload: payload || {},
  });
}

const productApi = Object.freeze({
  getDiagnostics: () => ipcRenderer.invoke('product:get-diagnostics'),
  getSettings: () => request('settings.get', 'desktop', {}),
  setSettings: (values) => request('settings.set', 'desktop', { values }),
  clearSavedApiKey: () => request('settings.credential_clear', 'desktop', { credential: 'api-key' }),
  selectWorkspace: () => request('workspace.select', 'desktop', {}),
  createSession: (workspacePath, label) => request('session.create', 'desktop', {
    workspacePath,
    ...(label ? { label } : {}),
  }),
  listSessions: () => request('session.list', 'desktop', {}),
  closeSession: (sessionId) => request('session.close', sessionId, { sessionId }),
  submitTask: (sessionId, prompt, scenario) => request('task.submit', sessionId, {
    sessionId,
    prompt,
    ...(scenario ? { scenario } : {}),
  }),
  cancelTask: (sessionId, taskId) => request('task.cancel', sessionId, { taskId }),
  approveTask: (sessionId, taskId, approvalId, planHash, workspaceBaseHash) => request('task.approve', sessionId, {
    taskId, approvalId, planHash, workspaceBaseHash,
  }),
  rejectTask: (sessionId, taskId, approvalId, reason) => request('task.reject', sessionId, {
    taskId, approvalId, reason,
  }),
  prepareUndo: (sessionId, taskId) => request('task.undo_prepare', sessionId, { sessionId, taskId }),
  getRecovery: (sessionId) => request('recovery.get', sessionId, { sessionId }),
  restoreRecovery: (sessionId) => request('recovery.restore', sessionId, { sessionId }),
  onTaskEvent: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('onTaskEvent callback must be a function');
    const listener = (_event, message) => {
      if (!message || message.type !== 'task.event') return;
      callback(message.payload);
    };
    ipcRenderer.on('desktop:event', listener);
    return () => ipcRenderer.removeListener('desktop:event', listener);
  },
  signalReady: () => ipcRenderer.send('product:renderer-ready', {
    protocolVersion: '1.0.0',
    ready: true,
  }),
});

contextBridge.exposeInMainWorld('win7Agent', productApi);
