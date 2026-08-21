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
});
