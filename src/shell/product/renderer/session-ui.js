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

  function utf8ByteLength(value) {
    const text = String(value || '');
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xDC00 && text.charCodeAt(index + 1) <= 0xDFFF) { bytes += 4; index += 1; }
      else bytes += 3;
    }
    return bytes;
  }

  function validateTextAttachment(input) {
    const source = input || {};
    const label = String(source.label || '').trim() || 'notes.txt';
    const content = String(source.content || '');
    const bytes = utf8ByteLength(content);
    if (label.length > 120) return { ok: false, field: 'label', error: '附件名称不能超过 120 个字符。', label, content, bytes };
    if (!content) return { ok: false, field: 'content', error: '请粘贴要加入上下文的文本。', label, content, bytes };
    if (bytes > 64 * 1024) return { ok: false, field: 'content', error: '文本附件超过 64 KiB，请缩小内容后重试。', label, content, bytes };
    const existingLabels = Array.isArray(source.existingLabels) ? source.existingLabels.map((value) => String(value).toLowerCase()) : [];
    if (existingLabels.includes(label.toLowerCase())) return { ok: false, field: 'label', error: '当前轮次已有同名文本附件，请修改名称。', label, content, bytes };
    return { ok: true, label, content, bytes };
  }

  function validateGoalText(value) {
    const text = String(value || '').trim();
    if (!text) return { ok: false, error: 'Goal 不能为空。', text };
    if (text.length > 2000) return { ok: false, error: 'Goal 不能超过 2,000 个字符。', text };
    return { ok: true, text };
  }

  root.win7AgentSessionUi = Object.freeze({ isCurrentTask, selectNextSession, closeLabel, shouldPreserveActiveTask, isNearConversationBottom, utf8ByteLength, validateTextAttachment, validateGoalText });
}(window));
