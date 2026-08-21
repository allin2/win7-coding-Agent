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

  function shouldPreserveActiveTask(taskRunning, activeTaskSessionId, closingSessionId) {
    return Boolean(taskRunning && activeTaskSessionId && activeTaskSessionId !== closingSessionId);
  }

  function isNearConversationBottom(metrics, threshold) {
    const source = metrics || {};
    const limit = Number.isFinite(threshold) ? Math.max(0, threshold) : 48;
    const scrollHeight = Number.isFinite(source.scrollHeight) ? source.scrollHeight : 0;
    const scrollTop = Number.isFinite(source.scrollTop) ? source.scrollTop : 0;
    const clientHeight = Number.isFinite(source.clientHeight) ? source.clientHeight : 0;
    return scrollHeight - scrollTop - clientHeight <= limit;
  }

  root.win7AgentSessionUi = Object.freeze({ isCurrentTask, selectNextSession, closeLabel, shouldPreserveActiveTask, isNearConversationBottom });
}(window));
