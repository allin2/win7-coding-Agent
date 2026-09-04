describe('A9 preload capability boundary', () => {
  function loadPreload(argv: string[]) {
    jest.resetModules();
    const invoke = jest.fn(async () => ({ ok: true }));
    let exposed: Record<string, any> | undefined;
    jest.doMock('electron', () => ({
      contextBridge: {
        exposeInMainWorld: (_name: string, value: Record<string, any>) => { exposed = value; },
      },
      ipcRenderer: {
        invoke,
        on: jest.fn(),
        removeListener: jest.fn(),
        send: jest.fn(),
      },
    }), { virtual: true });
    const originalArgv = process.argv;
    process.argv = argv;
    try {
      require('../../product/preload');
    } finally {
      process.argv = originalArgv;
    }
    return { api: exposed!, invoke };
  }

  it('does not expose deferred A8 Review mutation methods to the normal A9 renderer', () => {
    const { api } = loadPreload(['electron', 'main.js']);
    expect(api.a9).toBeDefined();
    expect(api.listWorkspace).toBeDefined();
    for (const method of [
      'prepareReview', 'decideReview', 'issueReviewApproval', 'applyReview',
      'recordReviewValidation', 'restoreReviewRecovery', 'submitReviewTask',
    ]) expect(api[method]).toBeUndefined();
  });

  it('routes Shell settings only through the A9 v5 settings action', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js']);
    const payload = { kind: 'automatic', envOverlay: { PROJECT_MODE: 'alpha' } };
    await api.a9.configureShell(payload);
    expect(invoke).toHaveBeenCalledWith('product:a9-request', {
      schemaVersion: 5,
      action: 'a9.shell.configure',
      payload,
    });
  });

  it('exposes bounded Viewer reads only through the A9 v5 workspace action', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js']);
    await api.a9.readWorkspaceFile('中文.txt', 2, 500, 'gbk');
    expect(invoke).toHaveBeenCalledWith('product:a9-request', {
      schemaVersion: 5,
      action: 'a9.workspace.read',
      payload: { path: '中文.txt', startLine: 2, maxLines: 500, encoding: 'gbk' },
    });
  });

  it('accepts the exact first Undo request emitted by preload while keeping confirmationId strictly optional', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js']);
    await api.a9.undoTurn('turn-first');
    const request: any = (invoke.mock.calls as any)[0][1];
    expect(request).toEqual({
      schemaVersion: 5,
      action: 'a9.checkpoint.undoTurn',
      payload: { turnId: 'turn-first' },
    });

    const undoTurn = jest.fn(async () => ({ ok: true, needsConfirmation: true, confirmationId: 'confirm-1' }));
    const { createA9ProductRequestHandler } = require('../../product/a9-product-ipc');
    const handler = createA9ProductRequestHandler({
      getA9Runtime: () => ({ undoTurn }),
      isValidRendererSender: () => true,
    });
    expect(await handler({}, request)).toMatchObject({ ok: true, needsConfirmation: true });
    expect(undoTurn).toHaveBeenCalledWith('turn-first', undefined);

    const rejected = await handler({}, {
      ...request,
      payload: { turnId: 'turn-first', confirmationId: 42 },
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'A9_PAYLOAD_INVALID' } });
  });

  it('exposes legacy Review methods only for the explicit historical smoke entry', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js', '--a8-review-smoke-report=report.json']);
    expect(api.applyReview).toBeDefined();
    await api.applyReview('session-1', 'task-1', { approvalId: 'approval-1' });
    expect(invoke).toHaveBeenCalledWith('product:a8-request', expect.objectContaining({
      action: 'review.apply', sessionId: 'session-1',
    }));
  });
});
