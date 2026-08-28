import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

type Session = { sessionId: string; status: 'ACTIVE' | 'ARCHIVED'; label?: string };

describe('A8 session UI helpers', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../product/renderer/session-ui.js'), 'utf8');
  const context: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(source, context);
  const api = context.window.win7AgentSessionUi as {
    isCurrentTask: (session: Session | null, taskRunning: boolean, activeTaskSessionId: string | null) => boolean;
    selectNextSession: (sessions: Session[], closedSessionId: string) => Session | null;
    closeLabel: (session: Session | null, taskRunning: boolean, activeTaskSessionId: string | null) => string;
    shouldPreserveActiveTask: (taskRunning: boolean, activeTaskSessionId: string | null, closingSessionId: string) => boolean;
    isNearConversationBottom: (metrics: { scrollHeight: number; scrollTop: number; clientHeight: number }, threshold?: number) => boolean;
    utf8ByteLength: (value: string) => number;
    validateTextAttachment: (input: { label?: string; content?: string; existingLabels?: string[] }) => { ok: boolean; label: string; content: string; bytes: number; field?: string; error?: string };
    validateGoalText: (value: string) => { ok: boolean; text: string; error?: string };
  };

  it('recognizes only the active task for the selected session', () => {
    const session: Session = { sessionId: 's1', status: 'ACTIVE' };
    expect(api.isCurrentTask(session, true, 's1')).toBe(true);
    expect(api.isCurrentTask(session, true, 's2')).toBe(false);
    expect(api.isCurrentTask(session, false, 's1')).toBe(false);
    expect(api.closeLabel(session, true, 's1')).toBe('停止并关闭');
    expect(api.closeLabel(session, false, null)).toBe('关闭当前会话');
  });

  it('chooses another active session and never reselects the archived one', () => {
    const sessions: Session[] = [
      { sessionId: 'closed', status: 'ARCHIVED' },
      { sessionId: 'next', status: 'ACTIVE' },
      { sessionId: 'other', status: 'ACTIVE' },
    ];
    expect(api.selectNextSession(sessions, 'closed')?.sessionId).toBe('next');
    expect(api.selectNextSession(sessions, 'next')?.sessionId).toBe('other');
    expect(api.selectNextSession([{ sessionId: 'closed', status: 'ARCHIVED' }], 'closed')).toBeNull();
  });

  it('preserves an active task only when a different session is being archived', () => {
    expect(api.shouldPreserveActiveTask(true, 'task-session', 'idle-session')).toBe(true);
    expect(api.shouldPreserveActiveTask(true, 'task-session', 'task-session')).toBe(false);
    expect(api.shouldPreserveActiveTask(false, 'task-session', 'idle-session')).toBe(false);
    expect(api.shouldPreserveActiveTask(true, null, 'idle-session')).toBe(false);
  });

  it('keeps streaming pinned only while the reader remains near the conversation bottom', () => {
    expect(api.isNearConversationBottom({ scrollHeight: 1200, scrollTop: 752, clientHeight: 400 })).toBe(true);
    expect(api.isNearConversationBottom({ scrollHeight: 1200, scrollTop: 700, clientHeight: 400 })).toBe(false);
    expect(api.isNearConversationBottom({ scrollHeight: 1200, scrollTop: 750, clientHeight: 400 }, 50)).toBe(true);
    expect(api.isNearConversationBottom({ scrollHeight: 1200, scrollTop: 749, clientHeight: 400 }, 50)).toBe(false);
  });

  it('validates UTF-8 text attachments and rejects empty, oversized or duplicate labels', () => {
    expect(api.utf8ByteLength('中文A😀')).toBe(11);
    expect(api.validateTextAttachment({ label: '', content: '' })).toMatchObject({ ok: false, field: 'content', label: 'notes.txt' });
    expect(api.validateTextAttachment({ label: 'notes.txt', content: '内容', existingLabels: ['NOTES.TXT'] })).toMatchObject({ ok: false, field: 'label' });
    expect(api.validateTextAttachment({ label: 'large.txt', content: '中'.repeat(21846) })).toMatchObject({ ok: false, field: 'content', bytes: 65538 });
    expect(api.validateTextAttachment({ label: '  需求.txt  ', content: '中文' })).toMatchObject({ ok: true, label: '需求.txt', bytes: 6 });
  });

  it('validates Goal input before sending revision-bound IPC', () => {
    expect(api.validateGoalText('   ')).toMatchObject({ ok: false });
    expect(api.validateGoalText('x'.repeat(2001))).toMatchObject({ ok: false });
    expect(api.validateGoalText('  完成验收  ')).toEqual({ ok: true, text: '完成验收' });
  });
});
