import * as fs from 'fs';
import * as path from 'path';

describe('A8 Review Renderer contract', () => {
  const productRoot = path.join(__dirname, '../../product');
  const html = fs.readFileSync(path.join(productRoot, 'renderer/index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(productRoot, 'renderer/renderer.js'), 'utf8');
  const workspaceCss = fs.readFileSync(path.join(productRoot, 'renderer/a8-workspace.css'), 'utf8');
  const harness = fs.readFileSync(path.join(__dirname, 'review-renderer-harness.js'), 'utf8');

  it('keeps the Review surface bounded to the declared controls and metadata', () => {
    [
      'review-panel', 'review-status', 'review-summary', 'review-files', 'review-diff',
      'review-accept', 'review-reject', 'review-issue-approval', 'review-apply',
      'review-validation-state', 'review-validation-detail', 'review-validation-not-run',
      'review-unverified',
    ].forEach((id) => expect(html).toContain(`id="${id}"`));
    expect(html).toContain('class="review-validation"');
    expect(html).toContain('id="review-nav"');
  });

  it('wires the Review journey through product preload actions and terminal events', () => {
    [
      'function renderReview(data)',
      'async function decideReviewFile(decision)',
      'async function issueReviewApproval()',
      'async function applyReview()',
      'async function recordReviewNotRun()',
      'async function restoreReviewRecovery()',
      'window.win7Agent.submitReviewTask',
      'window.win7Agent.decideReview',
      'window.win7Agent.issueReviewApproval',
      'window.win7Agent.applyReview',
      'window.win7Agent.recordReviewValidation',
      'window.win7Agent.restoreReviewRecovery',
      "event.eventKind === 'review.created'",
      "event.eventKind === 'review.awaiting_decision'",
      "event.eventKind === 'review.validation_recorded'",
      "event.eventKind === 'review.recovery'",
      "event.eventKind === 'review.security_blocked'",
      "event.eventKind === 'review.stale'",
      "event.eventKind === 'review.apply_failed'",
    ].forEach((fragment) => expect(renderer).toContain(fragment));
  });

  it('keeps Review decisions and recovery fail-closed in the Renderer', () => {
    expect(renderer).toMatch(/review-accept'\)\.disabled = !canDecide \|\| !selected\.writable/);
    expect(renderer).toMatch(/review-issue-approval'\)\.disabled = !allDecided \|\| !hasAccepted/);
    expect(renderer).toMatch(/recoveryButton\.disabled = review\.status !== 'RECOVERY_REQUIRED' \|\| state\.taskRunning/);
    expect(renderer).toContain("status: 'NOT_RUN'");
    expect(renderer).toContain('trustedAdapter: false');
  });

  it('rehydrates the running affordance from the authoritative task.accepted event', () => {
    expect(renderer).toContain("if (event.eventKind === 'task.accepted') {");
    expect(renderer).toContain('state.activeTaskSessionId = eventSessionId;');
    expect(renderer).toContain('setRunning(true);');
    expect(renderer).toContain("setTaskState('运行中', 'running');");
  });

  it('allows a new task start after the previous task reached a terminal state', () => {
    expect(renderer).toContain("event.eventKind === 'task.accepted' && !state.taskRunning");
    expect(renderer).toContain('Product event sequences are scoped to a task.');
    expect(renderer).toContain("if (event.eventKind !== 'task.accepted' || state.taskRunning) return;");
    expect(renderer).toContain('resetTaskState();');
  });

  it('re-enables recovery after the terminal failure clears taskRunning', () => {
    expect(renderer).toContain("if (state.review && state.review.status === 'RECOVERY_REQUIRED') renderReview(state.review);");
  });

  it('keeps session closing usable after the last active session is archived', () => {
    expect(html).toContain('id="empty-session"');
    expect(html).toContain('id="empty-session-action"');
    expect(html).toContain('aria-label="关闭当前会话"');
    expect(html).toContain('id="close-session-header"');
    expect(html).toContain('id="archived-session-list"');
    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(renderer).toContain('pendingCloseSessionId');
    expect(renderer).toContain('async function archiveSession(sessionId)');
    expect(renderer).toContain('selectNextSession(state.sessions, sessionId)');
    expect(renderer).toContain("state.session = next;");
    expect(renderer).toContain('window.win7AgentSessionUi.closeLabel(state.session, running, state.activeTaskSessionId)');
    expect(renderer).toContain("event.key !== 'Escape'");
    expect(renderer).toContain("button.className = 'session-item'");
  });

  it('keeps the active task handle when a different idle session is archived', () => {
    expect(renderer).toContain('shouldPreserveActiveTask(state.taskRunning, state.activeTaskSessionId, sessionId)');
    expect(renderer).toContain('if (!preserveActiveTask) {');
    expect(renderer).toContain('const submissionSessionId = state.session.sessionId;');
    expect(renderer).toContain('state.pendingCloseSessionId === submissionSessionId');
    expect(renderer).toContain('window.win7Agent.cancelTask(sessionId, taskId)');
  });

  it('keeps Review and the code inspector reachable at constrained width', () => {
    expect(html).toContain('id="open-inspector"');
    expect(html).toContain('id="close-inspector"');
    expect(html).toContain('id="inspector-backdrop"');
    expect(renderer).toContain('function toggleInspector(open, focusTarget)');
    expect(renderer).toContain("byId('review-nav').setAttribute('aria-expanded', String(shouldOpen))");
    expect(renderer).toContain("if (byId('inspector').classList.contains('open'))");
  });

  it('keeps workspace and session navigation reachable at very narrow Windows viewports', () => {
    expect(html).toContain('id="navigation-rail"');
    expect(html).toContain('id="open-navigation"');
    expect(html).toContain('id="close-navigation"');
    expect(html).toContain('id="navigation-backdrop"');
    expect(renderer).toContain('function toggleNavigation(open)');
    expect(renderer).toContain("byId('open-navigation').setAttribute('aria-expanded', String(shouldOpen))");
    expect(renderer).toContain("if (byId('navigation-rail').classList.contains('open'))");
    expect(workspaceCss).toContain('@media(max-width:760px)');
    expect(workspaceCss).toContain('.rail.open{transform:translateX(0);visibility:visible;transition-delay:0s}');
  });

  it('contains modal drawer focus and uses semantic controls for file interaction', () => {
    expect(renderer).toContain('function trapDrawerFocus(event, drawer)');
    expect(renderer).toContain('workbench.inert = true');
    expect(renderer).toContain('workbench.inert = false');
    expect(renderer).toContain("const row = document.createElement('button'); row.type = 'button'; row.className = 'code-line'");
    expect(renderer).toContain("const button = document.createElement('button'); button.type = 'button'; button.textContent = filePath;");
  });

  it('gives the Chromium harness real close, cancel, archive and create seams', () => {
    expect(harness).toContain('closeSession: async (sessionId) =>');
    expect(harness).toContain('cancelTask: async (sessionId, taskId) =>');
    expect(harness).toContain('submitTask: async (sessionId, prompt) =>');
    expect(harness).toContain("report(`session:archived:${sessionId}`)");
    expect(harness).toContain("report('task:cancelled')");
  });
});
