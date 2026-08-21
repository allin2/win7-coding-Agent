'use strict';

/*
 * Chromium-only Review seam harness. It loads the production Renderer markup
 * and scripts in an iframe, then supplies the same narrow Preload surface
 * shape used by Electron. It intentionally has no filesystem, process,
 * network, or real IPC capability; Host/IPC behavior remains covered by the
 * product tests. The harness exists to exercise the actual DOM state machine
 * and button/disabled-state transitions in a real Chromium page.
 */

(function startReviewHarness() {
  const frame = document.getElementById('renderer-frame');
  const stateNode = document.getElementById('qa-state');

  function createInjectedReviewApi() {
    const session = {
      schemaVersion: 1,
      sessionId: 'session-qa-1',
      workspaceId: 'workspace-qa-1',
      threadId: 'thread-qa-1',
      label: 'Review Harness',
      workspacePath: 'C:/qa/review-harness',
      createdAt: '2026-08-21T00:00:00.000Z',
      status: 'ACTIVE',
      taskCount: 0,
    };
    const files = [
      { relativePath: 'src/app.ts', operation: 'MODIFY', beforeEncoding: 'utf-8', afterEncoding: 'utf-8', beforeEol: 'lf', afterEol: 'lf', decision: 'PENDING', writable: true, diff: { unifiedDiff: '@@ -1 +1 @@\n-old\n+new\n' } },
      { relativePath: 'src/new.ts', operation: 'CREATE', beforeEncoding: 'utf-8', afterEncoding: 'utf-8', beforeEol: 'none', afterEol: 'lf', decision: 'PENDING', writable: true, diff: { unifiedDiff: '@@ -0,0 +1 @@\n+new file\n' } },
      { relativePath: 'docs/obsolete.md', operation: 'DELETE', beforeEncoding: 'utf-8', afterEncoding: 'utf-8', beforeEol: 'lf', afterEol: 'none', decision: 'PENDING', writable: true, diff: { unifiedDiff: '@@ -1 +0,0 @@\n-old\n' } },
    ];
    let review = makeReview();
    let taskEventListener;
    let approval;
    let eventSequence = 0;
    const calls = [];

    function clone(value) { return value === undefined ? null : JSON.parse(JSON.stringify(value)); }
    function makeReview() {
      return {
        schemaVersion: 1,
        reviewId: 'review-qa-1',
        revision: 1,
        workspaceId: session.workspaceId,
        sessionId: session.sessionId,
        taskId: 'task-qa-1',
        status: 'READY',
        workspaceBaseHash: 'a'.repeat(64),
        previewHash: 'b'.repeat(64),
        acceptedSetHash: 'c'.repeat(64),
        files: clone(files),
        validationRuns: [],
        unverifiedItems: files.map((file) => file.relativePath),
        createdAt: '2026-08-21T00:00:00.000Z',
        updatedAt: '2026-08-21T00:00:00.000Z',
        lastEventSeq: 0,
      };
    }
    function report(state) {
      const value = { state, calls: clone(calls), review: clone(review), approval: clone(approval) };
      window.__reviewHarnessReport = value;
      window.parent.postMessage({ type: 'review-harness-state', value }, '*');
    }
    function emit(eventKind, data) {
      if (typeof taskEventListener !== 'function') return;
      taskEventListener({
        taskId: review.taskId,
        eventId: `qa:${eventKind}:${eventSequence + 1}`,
        eventKind,
        sequence: ++eventSequence,
        timestamp: new Date().toISOString(),
        data: { ...clone(data || {}), sessionId: session.sessionId, threadId: session.threadId, turnId: 'turn-qa-1', runId: 'run-qa-1' },
      });
    }
    function result() { return { result: { review: clone(review) } }; }
    function updateDecision(relativePath, decision) {
      const file = review.files.find((candidate) => candidate.relativePath === relativePath);
      if (file) file.decision = decision;
      review.revision += 1;
      review.acceptedSetHash = `${'c'.repeat(63)}${review.revision % 10}`;
      review.unverifiedItems = review.files.filter((candidate) => candidate.decision === 'ACCEPTED').map((candidate) => candidate.relativePath);
      report(`decide:${relativePath}:${decision}`);
    }
    return {
      getDiagnostics: async () => ({ capabilities: { core: 'replay', state: 'memory', workspace: 'readonly', runner: 'unavailable', terminal: 'unavailable' } }),
      getSettings: async () => ({ settings: { mode: 'replay', gatewayUrl: '', model: 'replay', caBundlePath: '', credentials: { apiKeySaved: false, persistenceAvailable: false } } }),
      listSessions: async () => ({ sessions: [clone(session)] }),
      getSession: async () => ({ projection: { schemaVersion: 1, session: clone(session), goal: null, contextTurns: [] } }),
      listWorkspace: async () => ({ result: { path: '', entries: [] } }),
      readWorkspaceFile: async () => ({ result: { path: 'src/app.ts', encoding: 'utf-8', lines: [{ line: 1, text: 'old' }], startLine: 1, endLine: 1 } }),
      getRecovery: async () => ({ recovery: { pending: null } }),
      onTaskEvent: (callback) => { taskEventListener = callback; return () => { taskEventListener = null; }; },
      signalReady: () => { report('ready'); window.parent.postMessage({ type: 'review-harness-ready' }, '*'); },
      submitReviewTask: async (_sessionId, prompt) => {
        calls.push({ method: 'submitReviewTask', prompt });
        report('submitted');
        setTimeout(() => emit('task.accepted', { status: 'accepted' }), 0);
        setTimeout(() => emit('review.created', { review: clone(review) }), 20);
        setTimeout(() => emit('review.awaiting_decision', { reviewId: review.reviewId, revision: review.revision }), 30);
        return { task: { taskId: review.taskId, sessionId: session.sessionId, status: 'accepted', scenario: 'review' } };
      },
      decideReview: async (_sessionId, _taskId, relativePath, decision) => {
        calls.push({ method: 'decideReview', relativePath, decision });
        updateDecision(relativePath, decision);
        return result();
      },
      recordReviewValidation: async () => {
        calls.push({ method: 'recordReviewValidation', status: 'NOT_RUN' });
        review.validationRuns.push({ status: 'NOT_RUN', stale: false, summary: 'No registered Runner Profile', applicablePaths: [] });
        review.unverifiedItems = review.files.filter((candidate) => candidate.decision === 'ACCEPTED').map((candidate) => candidate.relativePath);
        report('validation:NOT_RUN');
        return result();
      },
      issueReviewApproval: async () => {
        calls.push({ method: 'issueReviewApproval' });
        approval = { approvalId: 'approval-qa-1', sessionId: session.sessionId, taskId: review.taskId, reviewId: review.reviewId, revision: review.revision, workspaceBaseHash: review.workspaceBaseHash, previewHash: review.previewHash, acceptedSetHash: review.acceptedSetHash, subject: 'desktop-user', expiresAt: '2099-01-01T00:00:00.000Z' };
        report('approval:issued');
        return { result: { approval: clone(approval), review: clone(review) } };
      },
      applyReview: async () => {
        calls.push({ method: 'applyReview' });
        review.status = 'APPLIED';
        report('applied');
        emit('review.applied', { review: clone(review), result: { status: 'APPLIED', success: true, zeroWrites: false } });
        emit('task.completed', { outcome: 'completed', reviewStatus: 'APPLIED' });
        return { result: { review: clone(review), result: { status: 'APPLIED', success: true, zeroWrites: false } } };
      },
    };
  }

  window.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'review-harness-ready') stateNode.textContent = 'renderer-ready';
    if (event.data.type === 'review-harness-state') stateNode.textContent = JSON.stringify(event.data.value);
  });
  fetch('../../product/renderer/index.html')
    .then((response) => response.text())
    .then((html) => {
      const withoutCsp = html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/i, '');
      const withBase = withoutCsp.replace('<head>', '<head>\n<base href="../../product/renderer/">');
      const stub = `<script>window.win7Agent = (${createInjectedReviewApi.toString()})();<\/script>`;
      frame.srcdoc = withBase.replace('<script src="renderer.js"></script>', `${stub}<script src="renderer.js"></script>`);
    })
    .catch((error) => { stateNode.textContent = `harness-error:${error.message}`; });
})();
