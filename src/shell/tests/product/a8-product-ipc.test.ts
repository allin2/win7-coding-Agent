const { createA8ProductRequestHandler } = require('../../product/a8-product-ipc') as {
  createA8ProductRequestHandler(options: Record<string, unknown>): (event: unknown, request: unknown) => Promise<any>;
};

describe('A8 product IPC boundary', () => {
  function setup() {
    const host = {
      getSessionProjection: jest.fn(() => ({ schemaVersion: 1 })),
      setGoal: jest.fn((input) => input),
      resolveGoal: jest.fn((input) => input),
      listWorkspace: jest.fn(() => ({ entries: [] })),
      readWorkspaceFile: jest.fn(() => ({ lines: [] })),
      prepareReview: jest.fn((input) => input),
      getReview: jest.fn(() => ({ review: { schemaVersion: 1 } })),
      decideReview: jest.fn((input) => input),
      issueReviewApproval: jest.fn(() => ({ approval: { approvalId: 'a8r-apr-test' } })),
      applyReview: jest.fn((input) => input),
      recordReviewValidation: jest.fn((input) => input),
      restoreReviewRecovery: jest.fn((input) => input),
      submitTask: jest.fn((input) => input),
    };
    const handler = createA8ProductRequestHandler({
      getDesktopHost: () => host,
      isValidRendererSender: (event: any) => event?.trusted === true,
    });
    return { host, handler };
  }

  const request = (action: string, payload: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    action,
    sessionId: '00000000-0000-4000-8000-000000000001',
    payload,
  });

  it('denies an untrusted Renderer before dispatch', async () => {
    const { handler } = setup();
    await expect(handler({}, request('session.get'))).rejects.toThrow('RENDERER_CAPABILITY_DENIED');
  });

  it('rejects unknown actions and additional properties fail-closed', async () => {
    const { host, handler } = setup();
    const unknown = await handler({ trusted: true }, request('workspace.write', { path: 'x' }));
    const injected = await handler({ trusted: true }, {
      ...request('workspace.read', { path: 'sample.ts' }),
      filesystem: true,
    });
    expect(unknown).toMatchObject({ ok: false, error: { code: 'A8_REQUEST_SCHEMA_INVALID' } });
    expect(injected).toMatchObject({ ok: false, error: { code: 'A8_REQUEST_SCHEMA_INVALID' } });
    expect(host.readWorkspaceFile).not.toHaveBeenCalled();
  });

  it('dispatches only bounded read and revision-bound Goal actions', async () => {
    const { host, handler } = setup();
    const read = await handler({ trusted: true }, request('workspace.read', {
      path: 'src/中文 file.ts', startLine: 4, maxLines: 20, encoding: 'utf-8',
    }));
    const goal = await handler({ trusted: true }, request('goal.set', {
      text: '完成 A8-02', expectedRevision: 0,
    }));
    expect(read.ok).toBe(true);
    expect(goal.ok).toBe(true);
    expect(host.readWorkspaceFile).toHaveBeenCalledWith(expect.objectContaining({ sessionId: expect.any(String), path: 'src/中文 file.ts' }));
    expect(host.setGoal).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0 }));
  });

  it('dispatches exact Review actions and rejects forged approval fields', async () => {
    const { host, handler } = setup();
    const prepared = await handler({ trusted: true }, request('review.prepare', {
      taskId: 'task-1',
      proposals: [{ relativePath: 'src/中文.ts', operation: 'CREATE', afterContentBase64: Buffer.from('export const x = 1;\n').toString('base64') }],
    }));
    expect(prepared.ok).toBe(true);
    expect(host.prepareReview).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1', proposals: expect.any(Array) }));

    const forged = await handler({ trusted: true }, request('review.apply', {
      taskId: 'task-1',
      approval: {
        approvalId: 'a8r-apr-test', sessionId: 'session-1', taskId: 'task-1', reviewId: 'review-1', revision: 1,
        workspaceBaseHash: 'a'.repeat(64), previewHash: 'b'.repeat(64), acceptedSetHash: 'c'.repeat(64),
        subject: 'desktop-user', expiresAt: new Date(Date.now() + 60_000).toISOString(), extra: 'write-anything',
      },
    }));
    expect(forged).toMatchObject({ ok: false, error: { code: 'A8_REQUEST_SCHEMA_INVALID' } });
    expect(host.applyReview).not.toHaveBeenCalled();
  });

  it('submits the diagnostics Review scenario through its own exact product action', async () => {
    const { host, handler } = setup();
    const result = await handler({ trusted: true }, request('review.task.submit', { prompt: '准备 Review' }));
    expect(result.ok).toBe(true);
    expect(host.submitTask).toHaveBeenCalledWith(expect.objectContaining({
      scenario: 'review', prompt: '准备 Review', sessionId: expect.any(String),
    }));
    const forged = await handler({ trusted: true }, request('review.task.submit', { prompt: '准备 Review', scenario: 'edit' }));
    expect(forged).toMatchObject({ ok: false, error: { code: 'A8_REQUEST_SCHEMA_INVALID' } });
  });
});
