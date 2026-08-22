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

function a8Request(action, sessionId, payload) {
  return ipcRenderer.invoke('product:a8-request', {
    schemaVersion: 1,
    action,
    sessionId,
    payload: payload || {},
  });
}

function a9Request(action, payload) {
  return ipcRenderer.invoke('product:a9-request', {
    schemaVersion: 1,
    action,
    payload: payload || {},
  });
}

const productApi = Object.freeze({
  getDiagnostics: () => ipcRenderer.invoke('product:get-diagnostics'),
  a9: Object.freeze({
    snapshot: () => a9Request('a9.snapshot.get', {}),
    setMode: (mode) => a9Request('a9.mode.set', { mode }),
    configureProvider: (values) => a9Request('a9.provider.configure', values),
    probeProvider: () => a9Request('a9.provider.probe', {}),
    submitTurn: (prompt) => a9Request('a9.turn.submit', { prompt }),
    resumeApproval: (approvalId, decision, bindingDigest) => a9Request('a9.turn.resumeApproval', { approvalId, decision, bindingDigest }),
    stop: () => a9Request('a9.turn.stop', {}),
    listCheckpoints: () => a9Request('a9.checkpoint.list', {}),
    undoTurn: (turnId) => a9Request('a9.checkpoint.undoTurn', { turnId }),
    undoFile: (turnId, path) => a9Request('a9.checkpoint.undoFile', { turnId, path }),
    getDiff: (turnId) => a9Request('a9.diff.get', { turnId }),
    gitStatus: () => a9Request('a9.git.status', {}),
  }),
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
  getSession: (sessionId) => a8Request('session.get', sessionId, {}),
  setGoal: (sessionId, text, expectedRevision) => a8Request('goal.set', sessionId, { text, expectedRevision }),
  resolveGoal: (sessionId, status, expectedRevision) => a8Request('goal.resolve', sessionId, { status, expectedRevision }),
  listWorkspace: (sessionId, path) => a8Request('workspace.list', sessionId, { path: path || '' }),
  readWorkspaceFile: (sessionId, path, startLine, maxLines, encoding) => a8Request('workspace.read', sessionId, {
    path,
    ...(startLine ? { startLine } : {}),
    ...(maxLines ? { maxLines } : {}),
    ...(encoding ? { encoding } : {}),
  }),
  prepareReview: (sessionId, taskId, proposals) => a8Request('review.prepare', sessionId, { taskId, proposals }),
  getReview: (sessionId, taskId) => a8Request('review.get', sessionId, { taskId }),
  decideReview: (sessionId, taskId, relativePath, decision) => a8Request('review.decide', sessionId, { taskId, relativePath, decision }),
  issueReviewApproval: (sessionId, taskId, subject) => a8Request('review.approval.issue', sessionId, { taskId, subject: subject || 'desktop-user' }),
  applyReview: (sessionId, taskId, approval) => a8Request('review.apply', sessionId, { taskId, approval }),
  recordReviewValidation: (sessionId, taskId, input) => a8Request('review.validation', sessionId, { taskId, ...input }),
  restoreReviewRecovery: (sessionId, taskId) => a8Request('review.recovery', sessionId, { taskId }),
  submitReviewTask: (sessionId, prompt) => a8Request('review.task.submit', sessionId, { prompt }),
  submitTask: (sessionId, prompt, scenario, executionMode, refs) => request('task.submit', sessionId, {
    sessionId,
    prompt,
    ...(scenario ? { scenario } : {}),
    ...((executionMode || (Array.isArray(refs) && refs.length > 0)) ? { context: {
      ...(executionMode ? { executionMode } : {}),
      ...(Array.isArray(refs) && refs.length > 0 ? { refs } : {}),
    } } : {}),
  }),
  cancelTask: (sessionId, taskId) => request('task.cancel', sessionId, { taskId }),
  approveTask: (sessionId, taskId, approvalId, planHash, workspaceBaseHash) => request('task.approve', sessionId, {
    taskId, approvalId, planHash, workspaceBaseHash,
  }),
  rejectTask: (sessionId, taskId, approvalId, reason) => request('task.reject', sessionId, {
    taskId, approvalId, reason,
  }),
  approvePlan: (sessionId, taskId, approvalId, planHash) => request('task.approve', sessionId, {
    taskId, approvalId, planHash, workspaceBaseHash: 'execution-plan',
  }),
  rejectPlan: (sessionId, taskId, approvalId, _planHash, reason) => request('task.reject', sessionId, {
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
