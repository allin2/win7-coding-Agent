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

  it('exposes legacy Review methods only for the explicit historical smoke entry', async () => {
    const { api, invoke } = loadPreload(['electron', 'main.js', '--a8-review-smoke-report=report.json']);
    expect(api.applyReview).toBeDefined();
    await api.applyReview('session-1', 'task-1', { approvalId: 'approval-1' });
    expect(invoke).toHaveBeenCalledWith('product:a8-request', expect.objectContaining({
      action: 'review.apply', sessionId: 'session-1',
    }));
  });
});
