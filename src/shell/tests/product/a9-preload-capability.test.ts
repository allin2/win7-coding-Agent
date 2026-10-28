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

  it('routes Shell settings only through the A9 v7 settings action', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js']);
    const payload = { kind: 'automatic', envOverlay: { PROJECT_MODE: 'alpha' } };
    await api.a9.configureShell(payload);
    expect(invoke).toHaveBeenCalledWith('product:a9-request', {
      schemaVersion: 7,
      action: 'a9.shell.configure',
      payload,
    });
  });

  it('exposes bounded Viewer reads only through the A9 v7 workspace action', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js']);
    await api.a9.readWorkspaceFile('中文.txt', 2, 500, 'gbk');
    expect(invoke).toHaveBeenCalledWith('product:a9-request', {
      schemaVersion: 7,
      action: 'a9.workspace.read',
      payload: { path: '中文.txt', startLine: 2, maxLines: 500, encoding: 'gbk' },
    });
  });

  it('exposes the ADR-0114 event query only through the A9 v7 events action', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js']);
    await api.a9.queryEvents({ conversationId: 'conv-1', limit: 50 });
    expect(invoke).toHaveBeenCalledWith('product:a9-request', {
      schemaVersion: 7,
      action: 'a9.events.query',
      payload: { conversationId: 'conv-1', limit: 50 },
    });
  });

  it('passes the complete checkpoint cursor object unchanged through preload', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js']);
    const before = { createdAt: '2026-09-26T00:00:00.000Z', turnId: 'turn-1' };
    await api.a9.listCheckpoints({ conversationId: 'conv-1', before, limit: 20 });
    expect(invoke).toHaveBeenCalledWith('product:a9-request', {
      schemaVersion: 7, action: 'a9.checkpoint.list',
      payload: { conversationId: 'conv-1', before, limit: 20 },
    });
  });

  it('accepts the exact first Undo request emitted by preload while keeping confirmationId strictly optional', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js']);
    await api.a9.undoTurn('turn-first');
    const request: any = (invoke.mock.calls as any)[0][1];
    expect(request).toEqual({
      schemaVersion: 7,
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

  it('A9-34 exposes only the narrow recovered disposition function and preserves its v7 identity', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js']);
    const revision = 'a'.repeat(64);
    await api.a9.dismissRecovered('c', 'h', revision, { pid: 999, workspace: '/other' });
    expect(invoke).toHaveBeenCalledTimes(1);
    const request: any = (invoke.mock.calls as any)[0][1];
    expect(request).toEqual({ schemaVersion: 7, action: 'a9.managed.dismissRecovered',
      payload: { conversationId: 'c', handleId: 'h', recoveryRevision: revision } });
    expect(api.a9.request).toBeUndefined(); expect(api.a9.invoke).toBeUndefined();
    const dismissRecovered = jest.fn(() => ({ ok: true }));
    const getA9Runtime = jest.fn(() => ({ dismissRecovered }));
    const { createA9ProductRequestHandler } = require('../../product/a9-product-ipc');
    const denied = createA9ProductRequestHandler({ getA9Runtime, isValidRendererSender: () => false });
    expect(await denied({}, request)).toMatchObject({ ok: false, error: { code: 'RENDERER_CAPABILITY_DENIED' } });
    expect(getA9Runtime).not.toHaveBeenCalled(); expect(dismissRecovered).not.toHaveBeenCalled();
    const handler = createA9ProductRequestHandler({ getA9Runtime, isValidRendererSender: () => true });
    expect(await handler({}, request)).toEqual({ ok: true });
    expect(dismissRecovered).toHaveBeenCalledWith(request.payload);
    dismissRecovered.mockClear();
    const invalid = [null, [], {}, { ...request.payload, pid: 999 }, { ...request.payload, workspace: '/other' },
      ...['conversationId', 'handleId', 'recoveryRevision'].flatMap((key) => {
        const missing = { ...request.payload }; delete missing[key];
        return [missing, { ...request.payload, [key]: '' }, { ...request.payload, [key]: 42 },
          { ...request.payload, [key]: ' '.repeat(3) }, { ...request.payload, [key]: 'a'.repeat(257) }];
      }), { ...request.payload, recoveryRevision: 'A'.repeat(64) }, { ...request.payload, recoveryRevision: 'a'.repeat(63) }];
    for (const payload of invalid) {
      expect(await handler({}, { ...request, payload })).toMatchObject({ ok: false, error: { code: 'A9_PAYLOAD_INVALID' } });
    }
    expect(dismissRecovered).not.toHaveBeenCalled();
    // The new action does not change acceptance of the existing schema 6 stop action.
    const stop = jest.fn(() => ({ ok: true }));
    const old = createA9ProductRequestHandler({ getA9Runtime: () => ({ stop }), isValidRendererSender: () => true });
    expect(await old({}, { schemaVersion: 6, action: 'a9.turn.stop', payload: {} })).toEqual({ ok: true });
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
