'use strict';

(function exposeSessionUi(root) {
  function isCurrentTask(session, taskRunning, activeTaskSessionId) {
    return Boolean(taskRunning && session && session.sessionId === activeTaskSessionId);
  }

  function selectNextSession(sessions, closedSessionId) {
    return (Array.isArray(sessions) ? sessions : [])
      .find((session) => session && session.status === 'ACTIVE' && session.sessionId !== closedSessionId) || null;
  }

  function closeLabel(session, taskRunning, activeTaskSessionId) {
    return isCurrentTask(session, taskRunning, activeTaskSessionId) ? '停止并关闭' : '关闭当前会话';
  }

  root.win7AgentSessionUi = Object.freeze({ isCurrentTask, selectNextSession, closeLabel });
}(window));
