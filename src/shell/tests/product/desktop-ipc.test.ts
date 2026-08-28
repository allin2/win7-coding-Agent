import { IPCDirection, IPCMessageType } from '../../src/ipc/messages';

const { createDesktopRequestHandler } = require('../../product/desktop-ipc') as {
  createDesktopRequestHandler(options: Record<string, unknown>): (event: unknown, message: unknown) => Promise<any>;
};

function message(type: IPCMessageType, sessionId: string, payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: '1.0.0',
    id: 'w08-test',
    type,
    direction: IPCDirection.RENDERER_TO_CORE,
    sessionId,
    timestamp: new Date().toISOString(),
    payload,
    ...overrides,
  };
}

describe('Desktop IPC acceptance boundary', () => {
  function setup() {
    const host = {
      activeTask: { taskId: 'task-1', sessionId: 'session-a' },
      selectWorkspace: jest.fn(),
      createSession: jest.fn(),
      listSessions: jest.fn(() => []),
      closeSession: jest.fn(),
      submitTask: jest.fn((input: { sessionId: string }) => {
        if (input.sessionId === 'session-forged') {
          const error = new Error('Session 不存在');
          (error as Error & { code?: string }).code = 'SESSION_NOT_FOUND';
          throw error;
        }
        return { taskId: 'task-1' };
      }),
      cancelTask: jest.fn(),
      approveTask: jest.fn(() => ({ status: 'resuming' })),
      clearSavedApiKey: jest.fn(() => ({ mode: 'replay' })),
    };
    const handler = createDesktopRequestHandler({
      getDesktopHost: () => host,
      isValidRendererSender: (event: any) => Boolean(event && event.trusted),
      runtimeState: { errors: [], diagnosticsRequested: false },
      buildDiagnostics: () => ({}),
    });
    return { host, handler };
  }

  it('rejects unknown IPC messages before dispatch', async () => {
    const { handler } = setup();
    await expect(handler({ trusted: true }, message('evil.message' as IPCMessageType, 'desktop', {}))).rejects.toThrow('IPC_SCHEMA_INVALID');
  });

  it('rejects a forged session task with a structured error', async () => {
    const { handler } = setup();
    const result = await handler({ trusted: true }, message(IPCMessageType.TASK_SUBMIT, 'session-forged', {
      sessionId: 'session-forged',
      prompt: 'forged',
    }));
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SESSION_NOT_FOUND');
  });

  it('rejects cross-session cancellation before calling the host', async () => {
    const { host, handler } = setup();
    const result = await handler({ trusted: true }, message(IPCMessageType.TASK_CANCEL, 'session-b', { taskId: 'task-1' }));
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SESSION_SCOPE_DENIED');
    expect(host.cancelTask).not.toHaveBeenCalled();
  });

  it('dispatches the schema-validated API key clear intent without accepting a value', async () => {
    const { host, handler } = setup();
    const result = await handler({ trusted: true }, message(
      IPCMessageType.SETTINGS_CREDENTIAL_CLEAR,
      'desktop',
      { credential: 'api-key' },
    ));
    expect(result).toEqual({ ok: true, settings: { mode: 'replay' } });
    expect(host.clearSavedApiKey).toHaveBeenCalledTimes(1);
  });

  it('keeps terminal.input as a compatibility schema but always returns unavailable', async () => {
    const { handler } = setup();
    const result = await handler({ trusted: true }, message(
      IPCMessageType.TERMINAL_INPUT,
      'session-a',
      { sessionId: 'session-a', data: 'dir\r' },
    ));
    expect(result).toMatchObject({ ok: false, error: { code: 'CAPABILITY_UNAVAILABLE' } });
  });

  it('dispatches a session-scoped exact approval through the existing fail-closed envelope', async () => {
    const { host, handler } = setup();
    const payload = { taskId: 'task-1', approvalId: 'plan-1', planHash: 'a'.repeat(64) };
    const envelope = { ...payload, workspaceBaseHash: 'execution-plan' };
    const result = await handler({ trusted: true }, message(IPCMessageType.TASK_APPROVE, 'session-a', envelope));
    expect(result).toEqual({ ok: true, result: { status: 'resuming' } });
    expect(host.approveTask).toHaveBeenCalledWith(envelope);
  });
});
