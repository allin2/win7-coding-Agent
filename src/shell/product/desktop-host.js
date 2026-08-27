'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { ReplayModelAdapter } = require('./replay');
const { createGatewayRuntimeModel, getSystemPromptContract } = require('./gateway-runtime');

function loadModules() {
  return {
    core: requireModule('core/dist'),
    gateway: requireModule('gateway/dist'),
    state: requireModule('state/dist'),
    workspace: requireModule('workspace/dist'),
    runner: requireModule('runner/dist'),
  };
}

function requireModule(relativeName) {
  const candidates = [
    path.join(__dirname, '../../', relativeName),
    path.join(__dirname, '../', relativeName),
  ];
  const candidate = candidates.find((item) => fs.existsSync(item));
  if (!candidate) throw new Error(`Desktop Alpha module is not packaged: ${relativeName}`);
  return require(candidate);
}

function createDesktopHost(options) {
  const config = options || {};
  const modules = config.modules || loadModules();
  const core = modules.core;
  const state = modules.state;
  const workspace = modules.workspace;
  const gateway = modules.gateway;
  const runnerExecutor = config.runner || new modules.runner.UnavailableRunner();
  const maxSessions = config.maxSessions || 16;
  const maxEvents = config.maxEvents || 10_000;
  const credentialVault = config.credentialVault || null;
  const ledger = config.ledger || new state.InMemoryEventLedger(maxEvents);
  const eventStream = new state.EventStream();
  const eventSubscription = eventStream.subscribe(config.maxPendingEvents || 1_024);
  const broker = new core.CapabilityBroker();
  const sessions = new Map();
  const sessionCatalog = config.sessionCatalog || new state.A8SessionCatalog({
    idFactory: config.idFactory || (() => crypto.randomUUID()),
    clock: config.clock,
  });
  let selectedWorkspace = null;
  let selectedWorkspaceId = null;
  let gatewaySettings = { mode: 'replay' };
  let gatewayProvider = null;
  let activeTask = null;
  let eventTimer = null;
  let disposed = false;

  const host = {
    selectWorkspace,
    getSelectedWorkspace: () => selectedWorkspace,
    // A9（F1）：主进程确认的当前活动工作区；未选择时为 null。
    getActiveWorkspacePath: () => selectedWorkspace,
    createSession,
    listSessions,
    closeSession,
    getSessionProjection,
    setGoal,
    resolveGoal,
    listWorkspace,
    readWorkspaceFile,
    prepareReview,
    getReview,
    decideReview,
    issueReviewApproval,
    applyReview,
    recordReviewValidation,
    restoreReviewRecovery,
    submitTask,
    cancelTask,
    approveTask,
    rejectTask,
    approvePlan,
    rejectPlan,
    prepareUndo,
    getRecovery,
    restoreRecovery,
    getDiagnostics,
    getSettings,
    setSettings,
    clearSavedApiKey,
    flushEvents,
    dispose,
    get activeTask() { return activeTask; },
    get ledgerSize() { return ledger.size; },
  };

  function createSessionRuntime(record) {
    const workspaceRecord = typeof sessionCatalog.getWorkspace === 'function'
      ? sessionCatalog.getWorkspace(record.workspaceId)
      : null;
    if (!workspaceRecord) throw productError('WORKSPACE_NOT_FOUND', '持久化会话引用的工作区不存在', '在 Diagnostics 检查数据恢复状态。');
    const workspacePath = normalizeWorkspacePath(workspaceRecord.canonicalPath);
    const session = {
      sessionId: record.sessionId,
      workspaceId: record.workspaceId,
      threadId: record.threadId,
      label: record.label,
      workspacePath,
      createdAt: record.createdAt,
      status: record.status,
      ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
      ...(record.goal ? { goal: record.goal } : {}),
      tasks: new Map(),
      reviews: new Map(),
      contextByTurn: new Map(),
      writeContext: createWriteContext(workspacePath),
    };
    if (typeof sessionCatalog.listTasks === 'function') {
      sessionCatalog.listTasks(session.sessionId).forEach((persisted) => {
        const task = createPersistedTaskRuntime(persisted, session, record.threadId);
        session.tasks.set(task.taskId, task);
        if (persisted.currentReviewId && task.scenario === 'review') {
          const restoredReview = restorePersistedReview(task, session, persisted.currentReviewId);
          if (restoredReview) session.reviews.set(task.taskId, restoredReview);
        }
      });
    }
    return session;
  }

  function createPersistedTaskRuntime(persisted, session, threadId) {
    return {
      taskId: persisted.taskId,
      sessionId: persisted.sessionId,
      threadId,
      turnId: persisted.turnId,
      runId: persisted.currentRunId || `persisted-${persisted.taskId}`,
      ordinal: 0,
      prompt: '',
      scenario: persisted.currentReviewId ? 'review' : 'structure',
      executionMode: 'direct',
      sequence: persisted.lastEventSeq,
      eventIds: new Set(),
      status: persistedTaskRuntimeStatus(persisted.state),
      result: null,
      protocol: null,
      writeIntent: undefined,
      pendingApproval: null,
      pendingPlanApproval: null,
      runnerAbort: null,
      contextRefs: [],
      contextItems: [],
      review: null,
      reviewAwaitingEmitted: persisted.state === 'AWAITING_REVIEW',
      startedAt: persisted.startedAt,
      persisted: true,
    };
  }

  function restorePersistedReview(task, session, reviewId) {
    if (typeof sessionCatalog.getReview !== 'function' || typeof sessionCatalog.getReviewFiles !== 'function' ||
        !workspace.ReviewStagingSession || typeof workspace.ReviewStagingSession.restore !== 'function') return null;
    const persisted = sessionCatalog.getReview(reviewId);
    const files = sessionCatalog.getReviewFiles(reviewId);
    if (!persisted || files.length === 0) return null;
    const payload = persisted.payload && typeof persisted.payload === 'object' ? persisted.payload : {};
    const restoredReview = {
      schemaVersion: 1,
      reviewId: persisted.reviewId,
      revision: persisted.revision,
      workspaceId: session.workspaceId,
      sessionId: persisted.sessionId,
      taskId: persisted.taskId,
      status: persisted.status,
      workspaceBaseHash: persisted.workspaceBaseHash,
      previewHash: persisted.previewHash,
      acceptedSetHash: persisted.acceptedSetHash,
      files: files.map((file) => ({
        schemaVersion: 1,
        relativePath: file.relativePath,
        comparisonKey: file.comparisonKey,
        operation: file.operation,
        beforeExists: file.beforeExists,
        afterExists: file.afterExists,
        beforeBytes: file.beforeBytes,
        afterBytes: file.afterBytes,
        beforeSha256: file.beforeSha256,
        afterSha256: file.afterSha256,
        beforeEncoding: 'utf-8',
        afterEncoding: 'utf-8',
        beforeBom: false,
        afterBom: false,
        beforeEol: 'none',
        afterEol: 'none',
        diff: {
          schemaVersion: 1,
          encoding: 'utf-8',
          beforeSha256: file.beforeSha256,
          afterSha256: file.afterSha256,
          startLine: 1,
          removedLineCount: 0,
          addedLineCount: 0,
          unifiedDiff: '[restored hash-only projection; private staging bytes remain outside SQLite]',
          truncated: true,
          diffSha256: file.diffSha256,
        },
        beforeBlobRef: file.beforeBlobRef,
        afterBlobRef: file.afterBlobRef,
        decision: file.decision,
        writable: file.writable,
      })),
      validationRuns: typeof sessionCatalog.listValidations === 'function'
        ? sessionCatalog.listValidations(reviewId).map((validation) => ({
          schemaVersion: 1,
          validationId: validation.validationRunId,
          reviewId: validation.reviewId,
          revision: validation.revision,
          previewHash: persisted.previewHash,
          validatedSetHash: validation.validatedSetHash,
          acceptedSetHash: persisted.acceptedSetHash,
          profileId: validation.profileId === 'not-run' ? null : validation.profileId,
          argvDigestSha256: validation.argvDigest === '0'.repeat(64) ? null : validation.argvDigest,
          status: validation.result,
          complete: validation.result !== 'NOT_RUN',
          outputTruncated: false,
          summary: validation.outputSummary,
          source: 'persisted-catalog',
          trustedAdapter: false,
          applicablePaths: validation.applicableFiles,
          startedAt: validation.finishedAt,
          completedAt: validation.finishedAt,
          createdAt: validation.finishedAt,
          stale: false,
        }))
        : [],
      unverifiedItems: Array.isArray(payload.unverifiedItems) ? payload.unverifiedItems.map(String) : [],
      createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : persisted.updatedAt,
      updatedAt: persisted.updatedAt,
      lastEventSeq: Number.isSafeInteger(payload.lastEventSeq) ? payload.lastEventSeq : 0,
    };
    const restored = workspace.ReviewStagingSession.restore({
      workspaceRoot: session.workspacePath,
      sessionId: session.sessionId,
      taskId: task.taskId,
      stagingRoot: path.join(config.reviewDirectory || path.join(os.tmpdir(), 'win7-coding-agent-a8-reviews'), session.sessionId, task.taskId),
      review: restoredReview,
      knownSecrets: knownCredentialValues(),
    });
    task.review = restored;
    return restored;
  }

  function persistedTaskRuntimeStatus(state) {
    if (state === 'AWAITING_REVIEW') return 'awaiting_review';
    if (state === 'AWAITING_PLAN_APPROVAL') return 'awaiting_approval';
    if (state === 'INTERRUPTED') return 'interrupted';
    if (state === 'CANCELLED') return 'cancelled';
    if (state === 'FAILED') return 'failed';
    if (state === 'COMPLETED') return 'completed';
    return 'running';
  }

  // Hydrate durable Session/Goal records before Renderer access. A broken reference
  // must fail startup rather than silently presenting an empty session list.
  sessionCatalog.listSessions().forEach((record) => {
    const session = createSessionRuntime(record);
    sessions.set(session.sessionId, session);
  });
  const restoredActiveSessions = Array.from(sessions.values()).filter((session) => session.status === 'ACTIVE');
  const restoredWorkspaceIds = new Set(restoredActiveSessions.map((session) => session.workspaceId));
  if (restoredWorkspaceIds.size > 1) {
    throw productError('WORKSPACE_SESSION_BOUND', '恢复数据包含多个活动工作区', '在 Diagnostics 检查会话数据并归档冲突会话。');
  }
  if (restoredActiveSessions.length > 0) {
    selectedWorkspace = restoredActiveSessions[0].workspacePath;
    selectedWorkspaceId = restoredActiveSessions[0].workspaceId;
  }

  eventTimer = setInterval(flushEvents, 10);

  async function selectWorkspace(candidatePath) {
    if (activeTask) throw productError('WORKSPACE_BUSY', '任务运行期间不能切换工作区', '先取消或等待当前任务结束。');
    const normalized = normalizeWorkspacePath(candidatePath);
    if (Array.from(sessions.values()).some((session) => session.status === 'ACTIVE') && selectedWorkspace && normalized !== selectedWorkspace) {
      throw productError('WORKSPACE_SESSION_BOUND', '已有会话绑定当前工作区，不能切换到另一个目录', '关闭现有会话后再选择新的工作区。');
    }
    if (typeof config.onWorkspaceSelected === 'function') {
      await config.onWorkspaceSelected(normalized);
    }
    selectedWorkspace = normalized;
    selectedWorkspaceId = sessionCatalog.ensureWorkspace(normalized).workspaceId;
    return {
      schemaVersion: 1,
      workspaceId: selectedWorkspaceId,
      workspacePath: normalized,
      displayName: path.basename(normalized),
    };
  }

  function createSession(input) {
    if (Array.from(sessions.values()).filter((session) => session.status === 'ACTIVE').length >= maxSessions) {
      throw productError('SESSION_LIMIT', '会话数量已达到上限', '归档不用的会话后重试。');
    }
    if (!selectedWorkspace) throw productError('WORKSPACE_REQUIRED', '必须先通过主进程选择工作区', '使用工作区选择器选择一个本地目录。');
    const workspacePath = normalizeWorkspacePath(selectedWorkspace);
    if (input && input.workspacePath && normalizeWorkspacePath(input.workspacePath) !== workspacePath) {
      throw productError('WORKSPACE_BINDING_MISMATCH', '会话工作区与当前选择不一致', '重新选择工作区或新建独立会话。');
    }
    selectedWorkspace = workspacePath;
    const record = sessionCatalog.createSession({
      workspaceId: selectedWorkspaceId,
      label: input && input.label ? String(input.label).slice(0, 80) : path.basename(workspacePath),
    });
    const session = createSessionRuntime(record);
    sessions.set(session.sessionId, session);
    return publicSession(session);
  }

  function listSessions() {
    return Array.from(sessions.values(), (session) => publicSession(session, taskCount(session)));
  }

  async function closeSession(sessionId) {
    const session = requireSession(sessionId);
    if (activeTask && activeTask.sessionId === sessionId) {
      throw productError('SESSION_BUSY', '任务运行期间不能关闭当前会话', '先取消或等待当前任务结束。');
    }
    const archived = sessionCatalog.archiveSession(sessionId);
    session.status = archived.status;
    session.archivedAt = archived.archivedAt;
    return { sessionId, archived: true, status: archived.status };
  }

  function getSessionProjection(sessionId) {
    const session = requireSession(sessionId, true);
    return {
      schemaVersion: 1,
      session: publicSession(session, taskCount(session)),
      goal: (sessionCatalog.getSession(sessionId) || {}).goal || null,
      contextTurns: Array.from(session.contextByTurn.entries()).map(([turnId, refs]) => ({ turnId, refs })),
      persistedTasks: typeof sessionCatalog.listTasks === 'function'
        ? sessionCatalog.listTasks(sessionId).map((task) => ({
          schemaVersion: 1,
          taskId: task.taskId,
          turnId: task.turnId,
          state: task.state,
          lastEventSeq: task.lastEventSeq,
          ...(task.currentReviewId ? { currentReviewId: task.currentReviewId } : {}),
          ...(task.errorCode ? { errorCode: task.errorCode } : {}),
        }))
        : [],
    };
  }

  function taskCount(session) {
    const inMemory = Array.from(session.tasks.keys());
    const persisted = typeof sessionCatalog.listTasks === 'function'
      ? sessionCatalog.listTasks(session.sessionId).map((task) => task.taskId)
      : [];
    return new Set(inMemory.concat(persisted)).size;
  }

  function setGoal(input) {
    const session = requireSession(input && input.sessionId);
    const goal = sessionCatalog.setGoal({
      sessionId: session.sessionId,
      text: input && input.text,
      expectedRevision: input && input.expectedRevision,
    });
    session.goal = goal;
    return { schemaVersion: 1, goal };
  }

  function resolveGoal(input) {
    const session = requireSession(input && input.sessionId);
    const goal = sessionCatalog.resolveGoal({
      sessionId: session.sessionId,
      status: input && input.status,
      expectedRevision: input && input.expectedRevision,
    });
    session.goal = goal;
    return { schemaVersion: 1, goal };
  }

  function listWorkspace(input) {
    const session = requireSession(input && input.sessionId, true);
    return workspace.createReadonlyWorkspacePort(session.workspacePath).listDirectory({
      path: input && input.path ? input.path : '',
      maxEntries: 300,
      maxOutputBytes: 64 * 1024,
    });
  }

  function readWorkspaceFile(input) {
    const session = requireSession(input && input.sessionId, true);
    return workspace.createReadonlyWorkspacePort(session.workspacePath).readText({
      path: input && input.path,
      encoding: input && input.encoding,
      startLine: input && input.startLine,
      maxLines: input && input.maxLines ? input.maxLines : 500,
      maxOutputBytes: 128 * 1024,
    });
  }

  function submitTask(input) {
    const session = requireSession(input && input.sessionId);
    if (activeTask) throw productError('TASK_BUSY', '当前已有活动任务', '先等待当前任务结束或取消它。');
    const prompt = input && typeof input.prompt === 'string' ? input.prompt.trim() : '';
    if (!prompt || prompt.length > 8_000) throw productError('TASK_INPUT_INVALID', '只读任务不能为空且不能超过 8000 字符', '缩短任务描述后重试。');
    assertNoKnownCredentialValue({ prompt, context: input && input.context });
    const scenario = normalizeScenario(input && input.scenario, prompt);
    const preparedContext = prepareContextRefs(
      input && input.context && input.context.refs,
      session,
      workspace,
    );
    const identity = sessionCatalog.beginTurn(session.sessionId);
    const task = {
      taskId: identity.taskId,
      sessionId: session.sessionId,
      threadId: session.threadId,
      turnId: identity.turnId,
      runId: identity.runId,
      ordinal: identity.ordinal,
      prompt,
      scenario,
      executionMode: input && (
        input.executionMode === 'plan' ||
        (input.context && input.context.executionMode === 'plan')
      ) ? 'plan' : 'direct',
      sequence: 0,
      eventIds: new Set(),
      status: 'running',
      result: null,
      protocol: null,
      writeIntent: input && input.writeIntent ? input.writeIntent : undefined,
      reviewProposals: isReviewCapableScenario(scenario) && input && Array.isArray(input.reviewProposals)
        ? input.reviewProposals
        : undefined,
      write: scenario === 'edit' || scenario === 'undo' ? session.writeContext : undefined,
      pendingApproval: null,
      pendingPlanApproval: null,
      runnerAbort: scenario === 'runner_acceptance' ? new AbortController() : null,
      contextRefs: preparedContext.refs,
      contextItems: preparedContext.items,
      review: null,
      reviewAwaitingEmitted: false,
      startedAt: new Date().toISOString(),
    };
    activeTask = task;
    session.tasks.set(task.taskId, task);
    session.contextByTurn.set(task.turnId, preparedContext.refs);
    persistTaskState(task, 'PLANNING');
    emitTaskEvent(task, 'task.accepted', {
      status: 'accepted', scenario, executionMode: task.executionMode,
      ordinal: task.ordinal, contextRefs: task.contextRefs,
    });
    if (scenario === 'runner_acceptance') void runRunnerAcceptance(task, session);
    else void runTask(task, session);
    return {
      taskId: task.taskId, sessionId: task.sessionId, threadId: task.threadId,
      turnId: task.turnId, runId: task.runId, ordinal: task.ordinal,
      status: 'accepted', scenario, executionMode: task.executionMode,
    };
  }

  function prepareReview(input) {
    const session = requireSession(input && input.sessionId);
    const task = requireReviewTask(input && input.taskId, session.sessionId);
    if (task.review) throw productError('REVIEW_ALREADY_EXISTS', '当前任务已经存在 Review 准备区', '先处理当前 Review 或重新提交任务。');
    const proposals = normalizeReviewProposals(input && input.proposals);
    const reviewDirectory = config.reviewDirectory || path.join(os.tmpdir(), 'win7-coding-agent-a8-reviews');
    const review = new workspace.ReviewStagingSession({
      workspaceRoot: session.workspacePath,
      workspaceId: session.workspaceId,
      sessionId: session.sessionId,
      taskId: task.taskId,
      proposals,
      stagingRoot: path.join(reviewDirectory, session.sessionId, task.taskId),
      knownSecrets: knownCredentialValues(),
      ...(typeof config.reviewFailureInjector === 'function' ? { failureInjector: config.reviewFailureInjector } : {}),
    });
    task.review = review;
    session.reviews.set(task.taskId, review);
    task.status = 'awaiting_review';
    persistReviewState(task);
    emitTaskEvent(task, 'review.created', { review: review.review });
    task.reviewAwaitingEmitted = true;
    emitTaskEvent(task, 'review.awaiting_decision', { reviewId: review.review.reviewId, revision: review.review.revision });
    return { taskId: task.taskId, review: review.review };
  }

  function getReview(input) {
    const session = requireSession(input && input.sessionId, true);
    const task = requireReviewTask(input && input.taskId, session.sessionId);
    if (!task.review) throw productError('REVIEW_NOT_FOUND', '当前任务没有 Review 准备区', '先提交一个包含多文件提案的 Review 任务。');
    return { taskId: task.taskId, review: task.review.review, locked: task.review.isLocked };
  }

  function decideReview(input) {
    const session = requireSession(input && input.sessionId);
    const task = requireReviewTask(input && input.taskId, session.sessionId);
    requireActiveReviewTask(task);
    if (!task.review) throw productError('REVIEW_NOT_FOUND', '当前任务没有 Review 准备区', '先提交一个包含多文件提案的 Review 任务。');
    const review = task.review.decide(input.relativePath, input.decision);
    persistReviewState(task);
    emitTaskEvent(task, 'review.updated', { review });
    if (review.status === 'REJECTED') {
      task.status = 'completed';
      emitTaskEvent(task, 'task.completed', { outcome: 'completed', reviewStatus: 'REJECTED' });
      if (activeTask === task) activeTask = null;
    }
    return { taskId: task.taskId, review };
  }

  function issueReviewApproval(input) {
    const session = requireSession(input && input.sessionId);
    const task = requireReviewTask(input && input.taskId, session.sessionId);
    requireActiveReviewTask(task);
    if (!task.review) throw productError('REVIEW_NOT_FOUND', '当前任务没有 Review 准备区', '先提交一个包含多文件提案的 Review 任务。');
    const approval = task.review.issueApproval(input.subject || 'desktop-user');
    persistReviewState(task);
    emitTaskEvent(task, 'review.approval_requested', { approval, review: task.review.review });
    return { taskId: task.taskId, approval, review: task.review.review };
  }

  function applyReview(input) {
    const session = requireSession(input && input.sessionId);
    const task = requireReviewTask(input && input.taskId, session.sessionId);
    requireActiveReviewTask(task);
    if (!task.review) throw productError('REVIEW_NOT_FOUND', '当前任务没有 Review 准备区', '先提交一个包含多文件提案的 Review 任务。');
    const result = task.review.apply(input.approval);
    emitTaskEvent(task, result.status === 'APPLIED' ? 'review.applied' : result.status === 'STALE' ? 'review.stale' : 'review.apply_failed', { result, review: task.review.review });
    if (result.status === 'APPLIED' || result.status === 'REJECTED') {
      task.status = 'completed';
      emitTaskEvent(task, 'task.completed', { outcome: 'completed', reviewStatus: result.status });
      if (activeTask === task) activeTask = null;
    } else if (result.status === 'RECOVERY_REQUIRED') {
      task.status = 'failed';
      emitTaskEvent(task, 'task.failed', { outcome: 'failed', error: { code: 'RECOVERY_REQUIRED', message: 'Review 批量应用回滚未确认，写入已锁定。' } });
      if (activeTask === task) activeTask = null;
    } else if (result.status === 'STALE' || result.status === 'FAILED') {
      task.status = 'failed';
      const failureCode = result.status === 'STALE' ? 'REVIEW_STALE' : 'REVIEW_APPLY_FAILED';
      const failureMessage = result.status === 'STALE'
        ? '应用前工作区基线已变化，Review 已失效；请重新生成提案。'
        : 'Review 批量应用失败，已回滚或保留失败事实；请重试或重新生成提案。';
      emitTaskEvent(task, 'task.failed', { outcome: 'failed', error: { code: failureCode, message: failureMessage }, reviewStatus: result.status });
      if (activeTask === task) activeTask = null;
    } else {
      task.status = 'awaiting_review';
    }
    persistReviewState(task);
    return { taskId: task.taskId, result, review: task.review.review };
  }

  function recordReviewValidation(input) {
    const session = requireSession(input && input.sessionId);
    const task = requireReviewTask(input && input.taskId, session.sessionId);
    requireActiveReviewTask(task);
    if (!task.review) throw productError('REVIEW_NOT_FOUND', '当前任务没有 Review 准备区', '先提交一个包含多文件提案的 Review 任务。');
    try {
      const validation = task.review.recordValidation(input);
      persistReviewState(task);
      emitTaskEvent(task, 'review.validation_recorded', { validation, review: task.review.review });
      return { taskId: task.taskId, validation, review: task.review.review };
    } catch (error) {
      if (error && error.code === 'SENSITIVE_DATA_BLOCKED') {
        task.status = 'failed';
        persistReviewState(task);
        emitTaskEvent(task, 'review.security_blocked', {
          error: { code: 'SENSITIVE_DATA_BLOCKED', message: 'Review 验证证据包含已知敏感值，已清理私有准备区。' },
          review: task.review.review,
        });
        emitTaskEvent(task, 'task.failed', {
          outcome: 'failed',
          error: { code: 'SENSITIVE_DATA_BLOCKED', message: 'Review 验证证据包含已知敏感值，已清理私有准备区。' },
        });
        if (activeTask === task) activeTask = null;
      }
      throw error;
    }
  }

  function restoreReviewRecovery(input) {
    const session = requireSession(input && input.sessionId);
    const task = requireReviewTask(input && input.taskId, session.sessionId);
    if (!task.review) throw productError('REVIEW_NOT_FOUND', '当前任务没有 Review 准备区', '先提交一个包含多文件提案的 Review 任务。');
    if (activeTask && activeTask !== task) throw productError('TASK_BUSY', '另一个任务正在前台运行，暂不能恢复 Review。', '先等待或取消当前任务。');
    const result = task.review.restoreRecovery();
    if (result.restored) {
      task.status = 'awaiting_review';
      activeTask = task;
    }
    persistReviewState(task);
    emitTaskEvent(task, 'review.recovery', { result, review: task.review.review });
    return { taskId: task.taskId, result, review: task.review.review };
  }

  async function runRunnerAcceptance(task, session) {
    const action = config.runnerAcceptanceAction || {};
    const request = {
      requestId: `${task.taskId}-acceptance`,
      command: action.profileId || 'unconfigured-runner-profile',
      args: Array.isArray(action.args) ? action.args.slice() : [],
      approvalLevel: 'read_only',
      signal: task.runnerAbort.signal,
      config: {
        timeoutMs: action.timeoutMs || 15_000,
        idleTimeoutMs: action.idleTimeoutMs || 5_000,
        maxStdoutBytes: action.maxStdoutBytes || 64 * 1024,
        maxStderrBytes: action.maxStderrBytes || 64 * 1024,
        workDir: config.runnerWorkDirectory || session.workspacePath,
        stdinPolicy: 'closed',
      },
    };
    emitTaskEvent(task, 'runner.started', { profileId: request.command, cwd: request.config.workDir });
    try {
      task.result = await runnerExecutor.execute(request);
      if (task.result.stdout && task.result.stdout.text) emitTaskEvent(task, 'runner.stdout', {
        text: task.result.stdout.text, bytes: task.result.stdout.bytesRead,
      });
      if (task.result.stderr && task.result.stderr.text) emitTaskEvent(task, 'runner.stderr', {
        text: task.result.stderr.text, bytes: task.result.stderr.bytesRead,
      });
      if (task.result.stdout && task.result.stdout.truncated) emitTaskEvent(task, 'runner.truncated', {
        stream: 'stdout', omittedBytes: task.result.stdout.omittedBytes,
      });
      if (task.result.stderr && task.result.stderr.truncated) emitTaskEvent(task, 'runner.truncated', {
        stream: 'stderr', omittedBytes: task.result.stderr.omittedBytes,
      });
      emitTaskEvent(task, 'runner.finished', {
        status: task.result.status, exitCode: task.result.exitCode, durationMs: task.result.durationMs,
      });
      if (task.result.status === 'exited') {
        task.status = 'completed';
        emitTaskEvent(task, 'task.completed', { outcome: 'completed', runnerStatus: task.result.status });
      } else if (task.result.status === 'cancelled') {
        task.status = 'cancelled';
        emitTaskEvent(task, 'task.cancelled', { outcome: 'cancelled', runnerStatus: task.result.status });
      } else {
        task.status = 'failed';
        emitTaskEvent(task, 'task.failed', task.result.error || { message: `Runner ${task.result.status}` });
      }
    } catch (error) {
      task.status = 'failed';
      task.result = { status: 'failed', error: serializeError(error) };
      emitTaskEvent(task, 'runner.finished', { status: 'failed', durationMs: 0 });
      emitTaskEvent(task, 'task.failed', serializeError(error));
    } finally {
      task.runnerAbort = null;
      if (activeTask === task) activeTask = null;
    }
  }

  function getSettings() {
    const credentialPersistence = getCredentialPersistenceStatus();
    return {
      schemaVersion: 1,
      mode: gatewaySettings.mode,
      gatewayUrl: gatewaySettings.gatewayUrl || '',
      model: gatewaySettings.model || '',
      caBundlePath: gatewaySettings.caBundlePath || '',
      proxy: gatewaySettings.proxy
        ? { host: gatewaySettings.proxy.host, port: gatewaySettings.proxy.port }
        : null,
      credentials: {
        apiKeyConfigured: Boolean(gatewaySettings.apiKeyConfigured),
        apiKeySaved: credentialPersistence.saved,
        persistenceAvailable: credentialPersistence.available,
        proxyCredentialsConfigured: Boolean(gatewaySettings.proxyCredentialsConfigured),
      },
      persistence: credentialPersistence.saved
        ? 'windows-dpapi-current-user'
        : 'process-memory-only',
    };
  }

  function getCredentialPersistenceStatus() {
    if (!credentialVault) return { available: false, saved: false };
    try {
      const status = credentialVault.getStatus();
      return {
        available: Boolean(status && status.available),
        saved: Boolean(status && status.saved),
      };
    } catch (_error) {
      return { available: false, saved: false };
    }
  }

  function knownCredentialValues() {
    const values = [];
    try {
      const savedApiKey = credentialVault && typeof credentialVault.loadApiKey === 'function'
        ? credentialVault.loadApiKey()
        : undefined;
      if (typeof savedApiKey === 'string' && savedApiKey) values.push(savedApiKey);
    } catch (_error) { /* a credential adapter failure must not expose a value */ }
    try {
      const apiKey = gatewayProvider && gatewayProvider.credentialStore && gatewayProvider.credentialStore.getApiKey
        ? gatewayProvider.credentialStore.getApiKey()
        : undefined;
      if (typeof apiKey === 'string' && apiKey) values.push(apiKey);
    } catch (_error) { /* a credential adapter failure must not expose a value */ }
    const password = gatewaySettings && gatewaySettings.proxy && gatewaySettings.proxy.auth && gatewaySettings.proxy.auth.password;
    if (typeof password === 'string' && password) values.push(password);
    return values;
  }

  function setSettings(input) {
    const values = input && input.values && typeof input.values === 'object' ? input.values : {};
    const mode = values.mode === 'gateway'
      ? 'gateway'
      : values.mode === 'deepseek'
        ? 'deepseek'
        : values.mode === 'replay'
          ? 'replay'
          : undefined;
    if (!mode) throw productError('SETTINGS_INVALID', 'Gateway 模式必须明确选择 Replay 或 Gateway。', '选择一种受支持的连接模式后重试。');
    if (mode === 'replay') {
      if (gatewayProvider) {
        gatewayProvider.disconnect();
        gatewayProvider.credentialStore.clear();
      }
      gatewayProvider = null;
      gatewaySettings = { mode: 'replay' };
      return getSettings();
    }
    if (mode === 'deepseek') {
      gateway.validateDeepSeekBaseUrl(values.gatewayUrl);
      gateway.validateDeepSeekModel(values.model);
    }
    if (typeof values.gatewayUrl !== 'string' || !/^https?:\/\//i.test(values.gatewayUrl)) {
      throw productError('GATEWAY_CONFIG_INVALID', 'Gateway 只接受 HTTP 或 HTTPS URL。', '填写受控 Gateway 的 http:// 或 https:// 地址。');
    }
    const previousProxy = gatewaySettings.proxy;
    const proxy = values.proxy && values.proxy.host && values.proxy.port
      ? {
        host: values.proxy.host,
        port: Number(values.proxy.port),
        protocol: 'http',
        ...(values.proxy.username && values.proxy.password
          ? { auth: { username: values.proxy.username, password: values.proxy.password } }
          : previousProxy && previousProxy.auth
            ? { auth: previousProxy.auth }
            : {}),
      }
      : undefined;
    const previousCredentialStore = gatewayProvider && gatewayProvider.credentialStore
      ? gatewayProvider.credentialStore
      : null;
    let apiKey = values.apiKey || (previousCredentialStore ? previousCredentialStore.getApiKey() : undefined);
    if (!apiKey && values.rememberApiKey === true) {
      if (!credentialVault) {
        throw productError('CREDENTIAL_PROTECTION_UNAVAILABLE', '当前产品入口没有 Windows DPAPI 凭据库。', '取消“记住 API key”后使用仅内存模式。');
      }
      apiKey = credentialVault.loadApiKey();
    }
    const credentialStore = apiKey
      ? new gateway.InMemoryCredentialStore()
      : previousCredentialStore || new gateway.InMemoryCredentialStore();
    if (apiKey) credentialStore.setApiKey(apiKey);
    const next = {
      mode,
      gatewayUrl: values.gatewayUrl,
      model: mode === 'deepseek' ? values.model : values.model || undefined,
      caBundlePath: values.caBundlePath || undefined,
      apiKeyConfigured: Boolean(credentialStore.getApiKey()),
      proxy,
      proxyCredentialsConfigured: Boolean(proxy && proxy.auth),
    };
    const providerConfig = {
      tlsConfig: {
        verifyCertificate: true,
        minTLSVersion: gateway.TLSVersion.TLS_1_2,
        ...(next.caBundlePath ? { caBundle: next.caBundlePath } : {}),
      },
      credentialStore,
      proxyConfig: proxy,
      timeoutMs: 15_000,
      totalTimeoutMs: 60_000,
      retryConfig: { initialDelayMs: 100, maxDelayMs: 1_000, maxRetries: 2, backoffMultiplier: 2 },
    };
    const provider = typeof config.gatewayProviderFactory === 'function'
      ? config.gatewayProviderFactory({ mode, settings: next, providerConfig })
      : mode === 'deepseek'
        ? new gateway.DeepSeekOpenAIProvider({ ...providerConfig, baseUrl: next.gatewayUrl, model: next.model })
        : new gateway.GatewayProvider({ ...providerConfig, gatewayUrl: next.gatewayUrl });
    if (values.rememberApiKey === true) {
      const keyToSave = credentialStore.getApiKey();
      if (!credentialVault || !keyToSave) {
        throw productError('CREDENTIAL_NOT_SAVED', '勾选记住 API key 时必须输入 key 或已有 DPAPI 密文。', '输入 API key 后重新应用设置。');
      }
      credentialVault.saveApiKey(keyToSave);
    } else if (values.rememberApiKey === false && credentialVault && credentialVault.getStatus().saved) {
      credentialVault.clearApiKey();
    }
    if (gatewayProvider) gatewayProvider.disconnect();
    gatewayProvider = provider;
    gatewaySettings = next;
    return getSettings();
  }

  function clearSavedApiKey() {
    if (credentialVault) credentialVault.clearApiKey();
    if (gatewayProvider) {
      gatewayProvider.disconnect();
      gatewayProvider.credentialStore.clear();
      gatewayProvider = null;
    }
    gatewaySettings = { mode: 'replay' };
    return getSettings();
  }

  async function runTask(task, session, resumeOptions) {
    const runtime = createRuntime(session.workspacePath, task);
    const protocol = new core.AgentRuntimeProtocol(
      { run: (request) => runtime.run(request) },
      eventStream,
    );
    task.protocol = protocol;
    const request = {
      sessionId: task.sessionId,
      threadId: task.threadId,
      turnId: task.turnId,
      taskId: task.taskId,
      runId: task.runId,
      prompt: task.prompt,
      executionMode: task.executionMode,
      acceptance: {
        schemaVersion: '1.0',
        checks: [
          { checkId: 'workspace-tools', description: 'Replay used list, search and read workspace tools.' },
          { checkId: 'analysis-result', description: 'Replay produced a bounded user-visible result.' },
          ...(task.scenario === 'edit' || task.scenario === 'undo'
            ? [{ checkId: 'workspace-write', description: 'A2 applied exactly one approved single-file write.' }]
            : []),
          ...(task.scenario === 'review'
            ? [{ checkId: 'review-staging', description: 'A8 Replay created a private multi-file Review staging set.' }]
            : []),
        ],
      },
      contextBootstrap: {
        repoRoot: session.workspacePath,
        cwd: session.workspacePath,
        environment: {
          cwd: session.workspacePath,
          targetOs: 'Windows 7 SP1 x64',
          shell: 'desktop-replay',
          date: new Date().toISOString().slice(0, 10),
          sandboxMode: 'read-only-replay',
          approvalMode: task.scenario === 'edit' || task.scenario === 'undo' ? 'workspace-write-replay' : 'read-only',
          git: { available: false, repository: false, detail: 'A1 does not probe or invoke Git.' },
        },
      },
      contextItems: task.contextItems,
      // A product-level input budget enables Core's proactive compaction even
      // when the selected Provider does not advertise its native window. This
      // is a reviewed product cap, not a claim about the Provider maximum.
      contextBudget: {
        maxTokens: 8_000,
        maxItems: 64,
        maxChars: 64_000,
        modelWindowTokens: 8_000,
        highWatermarkPercent: 75,
        outputReservePercent: 20,
      },
      turnBudget: task.scenario === 'cancellable'
        ? { maxSteps: 20, maxWallMs: 120_000, maxToolCalls: 20 }
        : { maxSteps: 12, maxWallMs: 30_000, maxToolCalls: 12 },
      ...(resumeOptions && resumeOptions.resumeCheckpoint ? { resumeCheckpoint: resumeOptions.resumeCheckpoint } : {}),
      ...(resumeOptions && resumeOptions.tokenIdsByCallId ? { tokenIdsByCallId: resumeOptions.tokenIdsByCallId } : {}),
      ...(resumeOptions && resumeOptions.approvalRejection ? { approvalRejection: resumeOptions.approvalRejection } : {}),
      ...(resumeOptions && resumeOptions.planApprovalDecision ? { planApprovalDecision: resumeOptions.planApprovalDecision } : {}),
    };
    try {
      task.result = await protocol.submit({ kind: 'turn.run', request });
      flushEvents();
    } catch (error) {
      task.result = { outcome: 'failed', error: serializeError(error) };
      flushEvents();
      emitTaskEvent(task, 'task.failed', serializeError(error));
    } finally {
      if (task.result && task.result.outcome === 'needs_approval') task.status = 'awaiting_approval';
      else if (task.result && task.result.outcome === 'cancelled') task.status = 'cancelled';
      else if (task.result && task.result.outcome === 'completed') task.status = task.replanRequired
        ? 'failed'
        : (task.scenario === 'review' && task.review ? 'awaiting_review' : 'completed');
      else if (task.status !== 'cancelled') task.status = 'failed';
      task.protocol = null;
      if (activeTask === task && task.status !== 'awaiting_approval' && task.status !== 'awaiting_review') activeTask = null;
    }
  }

  async function approveTask(input) {
    const task = findTask(input && input.taskId);
    if (task && task.pendingPlanApproval) return resolvePlanApproval(input, 'approved');
    if (!task || task.status !== 'awaiting_approval' || !task.pendingApproval) {
      throw productError('APPROVAL_NOT_PENDING', '当前任务没有待处理的 A2 审批', '重新生成一个单文件修改计划。');
    }
    const pending = task.pendingApproval;
    if (input.approvalId !== pending.approvalId || input.planHash !== pending.planHash || input.workspaceBaseHash !== pending.baseSha256) {
      throw productError('APPROVAL_BINDING_MISMATCH', '审批标识、计划哈希或工作区基线已变化', '重新查看当前 Diff 后再审批。');
    }
    const plan = task.write && task.write.preparer.get(pending.planId);
    if (!plan || plan.planHash !== pending.planHash) throw productError('REPLAN_REQUIRED', '可信写入计划已失效', '重新生成单文件修改计划。');
    const call = task.result && task.result.checkpoint && task.result.checkpoint.pendingPlan && task.result.checkpoint.pendingPlan.toolCalls[0]
      ? task.result.checkpoint.pendingPlan.toolCalls[0].call
      : undefined;
    if (!call) throw productError('REPLAN_REQUIRED', '审批检查点缺少原始写入调用', '重新生成单文件修改计划。');
    const binding = task.write.coordinator.issueApproval(plan, {
      planId: plan.planId, taskId: task.taskId, turnId: task.turnId, callId: call.id,
      planHash: plan.planHash, sessionId: task.sessionId, subject: 'desktop-user',
      previewSha256: plan.previewSha256, baselineSha256: plan.baseSha256,
    });
    const token = broker.issueToken(task.sessionId, ['workspace_write'], 5 * 60 * 1000, core.bindCapabilityToToolCall({
      ...call,
      approvalContext: { previewSha256: plan.previewSha256, baselineSha256: plan.baseSha256, planId: plan.planId, planHash: plan.planHash },
    }));
    plan.status = 'approved';
    task.write.approvalBinding = binding;
    task.write.tokenId = token.tokenId;
    task.pendingApproval = null;
    task.status = 'running';
    emitTaskEvent(task, 'approval.resolved', { approvalId: binding.approvalId, resolution: 'approved', planId: plan.planId });
    void runTask(task, taskSession(task), {
      resumeCheckpoint: task.result.checkpoint,
      tokenIdsByCallId: { [call.id]: token.tokenId },
    });
    return { taskId: task.taskId, approvalId: binding.approvalId, status: 'resuming' };
  }

  async function rejectTask(input) {
    const task = findTask(input && input.taskId);
    if (task && task.pendingPlanApproval) return resolvePlanApproval(input, 'rejected');
    if (!task || task.status !== 'awaiting_approval' || !task.pendingApproval) {
      throw productError('APPROVAL_NOT_PENDING', '当前任务没有待处理的 A2 审批', '重新生成一个单文件修改计划。');
    }
    if (input.approvalId !== task.pendingApproval.approvalId) throw productError('APPROVAL_BINDING_MISMATCH', '审批标识已变化', '重新查看当前 Diff 后再拒绝。');
    const call = task.result && task.result.checkpoint && task.result.checkpoint.pendingPlan && task.result.checkpoint.pendingPlan.toolCalls[0]
      ? task.result.checkpoint.pendingPlan.toolCalls[0].call : undefined;
    if (!call) throw productError('REPLAN_REQUIRED', '审批检查点缺少原始写入调用', '重新生成单文件修改计划。');
    const plan = task.write && task.write.preparer.get(task.pendingApproval.planId);
    if (plan) {
      plan.status = 'rejected';
    }
    task.pendingApproval = null;
    task.status = 'running';
    emitTaskEvent(task, 'approval.resolved', { approvalId: input.approvalId, resolution: 'rejected', reason: input.reason });
    void runTask(task, taskSession(task), {
      resumeCheckpoint: task.result.checkpoint,
      approvalRejection: { callId: call.id, reason: String(input.reason || '用户拒绝') },
    }).then(() => {
      if (plan) task.write.preparer.remove(plan.planId);
    });
    return { taskId: task.taskId, approvalId: input.approvalId, status: 'resuming' };
  }

  async function approvePlan(input) {
    return resolvePlanApproval(input, 'approved');
  }

  async function rejectPlan(input) {
    return resolvePlanApproval(input, 'rejected');
  }

  function resolvePlanApproval(input, resolution) {
    const task = findTask(input && input.taskId);
    const pending = task && task.pendingPlanApproval;
    if (!task || task.status !== 'awaiting_approval' || !pending) {
      throw productError('PLAN_APPROVAL_NOT_PENDING', '当前任务没有待处理的执行计划审批', '重新提交计划模式任务。');
    }
    if (input.approvalId !== pending.approvalId || (input.planHash !== undefined && input.planHash !== pending.planHash)) {
      throw productError('PLAN_APPROVAL_BINDING_MISMATCH', '执行计划审批标识或哈希已变化', '重新查看当前计划后再决定。');
    }
    if (!task.result || !task.result.checkpoint) {
      throw productError('PLAN_CHECKPOINT_MISSING', '执行计划检查点不可用', '重新提交计划模式任务。');
    }
    task.pendingPlanApproval = null;
    task.status = 'running';
    emitTaskEvent(task, 'plan.approval_resolved', {
      approvalId: pending.approvalId,
      planHash: pending.planHash,
      resolution,
      ...(resolution === 'rejected' ? { reason: String(input.reason || '用户拒绝执行计划') } : {}),
    });
    void runTask(task, taskSession(task), {
      resumeCheckpoint: task.result.checkpoint,
      planApprovalDecision: resolution,
    });
    return { taskId: task.taskId, approvalId: pending.approvalId, status: 'resuming', resolution };
  }

  function prepareUndo(input) {
    const source = findTask(input && input.taskId);
    if (!source || source.status !== 'completed' || !source.write || !source.write.plan || source.write.plan.status !== 'applied') {
      throw productError('UNDO_NOT_AVAILABLE', '只有已完成的 A2 写入任务可以撤销', '先完成并核对一次受控写入。');
    }
    const plan = source.write.plan;
    const decode = (buffer) => buffer.subarray(plan.bom ? 3 : 0).toString('utf8');
    // Free the single active-plan slot only after capturing the immutable
    // before/after buffers; the undo is a new plan and new approval.
    source.write.preparer.remove(plan.planId);
    return submitTask({
      sessionId: source.sessionId,
      prompt: '撤销上一笔已完成的单文件修改（仍需重新审批）。',
      scenario: 'undo',
      writeIntent: { path: plan.relativePath, oldText: decode(plan.afterContent), newText: decode(plan.beforeContent) },
    });
  }

  async function cancelTask(taskId) {
    const task = activeTask;
    if (!task || task.taskId !== taskId) throw productError('TASK_NOT_ACTIVE', '任务不存在或已经结束', '刷新会话时间线后重试。');
    task.status = 'cancelling';
    emitTaskEvent(task, 'task.cancelling', { status: 'cancelling' });
    const acknowledgement = task.runnerAbort
      ? (task.runnerAbort.abort(), { runId: task.runId, accepted: true })
      : task.protocol
      ? await task.protocol.submit({ kind: 'turn.cancel', runId: task.runId })
      : { runId: task.runId, accepted: false };
    return { taskId, ...acknowledgement };
  }

  function getRecovery(sessionId) {
    const session = requireSession(sessionId);
    return { pending: session.writeContext.coordinator.getPendingRecovery(), locked: session.writeContext.coordinator.isLocked() };
  }

  function restoreRecovery(sessionId) {
    const session = requireSession(sessionId);
    return session.writeContext.coordinator.restorePending();
  }

  function createRuntime(workspaceRoot, task) {
    const writeMode = task.scenario === 'edit' || task.scenario === 'undo';
    const reviewMode = isReviewCapableScenario(task.scenario);
    const registry = new core.ToolRegistry();
    if (writeMode) core.registerWorkspaceTools(registry);
    else {
      core.registerWorkspaceReadOnlyTools(registry);
      if (reviewMode) core.registerReviewTools(registry);
    }
    const port = workspace.createReadonlyWorkspacePort(workspaceRoot);
    const fallback = writeMode ? {
      async execute(spec, call) {
        if (call.toolName !== 'workspace.str_replace') throw new Error(`A2 executor refused ${call.toolName}`);
        const plan = task.write.preparer.getByCall(call.id);
        if (!plan || !task.write.approvalBinding) throw new Error('A2 approval plan is unavailable');
        const result = task.write.coordinator.apply(plan, task.write.approvalBinding);
        if (result.success) task.write.plan = plan;
        // Retain the immutable plan on the task for undo/audit, but release
        // the single active-plan slot for the next independent task.
        task.write.preparer.remove(plan.planId);
        if (task.write.tokenId) {
          try { broker.revokeToken(task.write.tokenId); } catch (_error) { /* audit state is already fail-closed */ }
          task.write.tokenId = null;
        }
        const failure = !result.success && Array.isArray(result.operations)
          ? result.operations.find((operation) => operation && operation.success === false)
          : undefined;
        const failureReason = failure && typeof failure.error === 'string' ? failure.error : '';
        if (/Base content (changed|disappeared)/i.test(failureReason)) task.replanRequired = true;
        return {
          callId: call.id,
          toolName: call.toolName,
          success: result.success,
          status: result.success ? 'succeeded' : 'failed',
          ...(failureReason ? { error: failureReason } : {}),
          output: result,
        };
      },
    } : reviewMode ? {
      async execute(_spec, call) {
        if (call.toolName !== 'workspace.review_prepare') throw new Error(`A8 Review executor refused ${call.toolName}`);
        let proposals;
        try {
          proposals = JSON.parse(String(call.args.proposalsJson || ''));
        } catch (_error) {
          throw new Error('A8 Review proposalsJson is not valid JSON');
        }
        const result = prepareReview({
          sessionId: task.sessionId,
          taskId: task.taskId,
          proposals,
        });
        return {
          callId: call.id,
          toolName: call.toolName,
          success: true,
          status: 'succeeded',
          output: result.review,
        };
      },
    } : undefined;
    const unguardedExecutor = new core.WorkspaceReadOnlyToolExecutor(port, fallback);
    const executor = {
      async execute(...args) {
        const result = await unguardedExecutor.execute(...args);
        assertNoKnownCredentialValue(result);
        return result;
      },
    };
    const runtime = new core.AgentRuntime({
      model: gatewaySettings.mode !== 'replay'
        ? createGatewayRuntimeModel(core, gateway, gatewayProvider, {
          model: gatewaySettings.model,
          getSensitiveValues: knownCredentialValues,
          onChunk: ({ requestId, chunk }) => recordGatewayDelta(task, {
            requestId, index: chunk.index, chunk: chunk.content, isFinal: false, finishReason: null,
          }),
          onComplete: ({ requestId, index, finishReason }) => recordGatewayDelta(task, {
            requestId, index, chunk: '', isFinal: true, finishReason,
          }),
        })
        : new ReplayModelAdapter(core, task.scenario, {
          writeIntent: task.writeIntent,
          reviewProposals: task.reviewProposals,
        }),
      tools: registry,
      executor,
      policy: new core.PolicyEngine(writeMode ? { tokenValidator: (tokenId) => broker.validateToken(tokenId) } : undefined),
      ...(writeMode ? {
        toolCallPreparation: {
          async prepare({ request, call }) {
            const existing = task.write.preparer.getByCall(call.id);
            const plan = existing || task.write.preparer.prepare({
              workspaceRoot,
              path: String(call.args.path || ''),
              oldText: String(call.args.oldText || ''),
              newText: String(call.args.newText || ''),
              sessionId: task.sessionId,
              taskId: task.taskId,
              turnId: task.turnId,
              callId: call.id,
              modelPreviewSha256: call.approvalContext && call.approvalContext.previewSha256,
              modelBaselineSha256: call.approvalContext && call.approvalContext.baselineSha256,
            });
            const trustedCall = {
              ...call,
              approvalContext: {
                previewSha256: plan.previewSha256,
                baselineSha256: plan.baseSha256,
                planId: plan.planId,
                planHash: plan.planHash,
              },
            };
            if (request.resumeCheckpoint && existing && existing.planHash !== trustedCall.approvalContext.planHash) {
              throw new Error('A2 resume plan identity changed');
            }
            task.write.plan = plan;
            return { call: trustedCall, preparation: task.write.preparer.public(plan) };
          },
        },
      } : {}),
      verifier: {
        async collect({ acceptance, plan, toolResults }) {
          const names = new Set(toolResults.filter((result) => result.success).map((result) => result.toolName));
          return acceptance.checks.map((check) => {
            const passed = check.checkId === 'workspace-tools'
              ? (writeMode
                ? (names.has('workspace.str_replace') || task.replanRequired || (task.write && task.write.plan && task.write.plan.status === 'rejected') || (names.has('workspace.list_directory') && names.has('workspace.search_text') && names.has('workspace.read_text')))
                : names.has('workspace.list_directory') && names.has('workspace.search_text') && names.has('workspace.read_text'))
              : check.checkId === 'analysis-result'
                ? Boolean(plan.finalResponse || plan.summary)
              : check.checkId === 'review-staging'
                ? (reviewMode && names.has('workspace.review_prepare') && Boolean(task.review))
              : check.checkId === 'workspace-write'
                  ? task.write && task.write.plan && (['applied', 'rejected', 'failed'].includes(task.write.plan.status))
                : false;
            return {
              checkId: check.checkId,
              status: passed ? 'passed' : 'failed',
              complete: true,
              summary: passed ? 'Deterministic Replay evidence collected.' : 'Required Replay evidence is missing.',
              source: 'desktop-alpha-replay-verifier',
              timestamp: new Date().toISOString(),
            };
          });
        },
      },
      verificationGate: new core.VerificationGate(),
      events: new state.RuntimeEventLedgerSink(ledger, eventStream),
      messageProjector: new state.RuntimeMessageProjection(ledger),
      modelRetry: { maxAttempts: 1, baseDelayMs: 0 },
      loopDetectorThreshold: 3,
    });
    return runtime;
  }

  function flushEvents() {
    if (disposed) return;
    const events = eventSubscription.drain();
    for (const event of events) routeStateEvent(event);
  }

  function routeStateEvent(event) {
    if (typeof config.onStateEvent === 'function') config.onStateEvent(event);
    const task = findTask(event.taskId, event.runId);
    if (!task || task.eventIds.has(event.eventId)) return;
    task.eventIds.add(event.eventId);
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    if (event.type === 'model.response.received') {
      const plan = payload.plan && typeof payload.plan === 'object' ? payload.plan : payload;
      emitTaskEvent(task, 'plan.presented', publicExecutionPlan(plan));
      const text = typeof plan.finalResponse === 'string' ? plan.finalResponse : (typeof plan.summary === 'string' ? plan.summary : '');
      if (text) emitTaskEvent(task, 'assistant.delta', { delta: text, final: Boolean(plan.finalResponse) });
    } else if (event.type === 'compaction.applied') {
      // Do not copy the summary body into the product projection a second
      // time. State retains the authoritative summary and source range; the
      // UI only needs a non-sensitive lifecycle marker.
      emitTaskEvent(task, 'compaction.applied', {
        compactionId: payload.compactionId,
        replacedSeqRange: payload.replacedSeqRange,
        reason: payload.reason,
        beforeTokens: payload.beforeTokens,
      });
    } else if (event.type === 'tool.call.started') {
      emitTaskEvent(task, 'tool.started', { toolCallId: payload.toolCallId, toolName: payload.toolName || 'unknown', args: payload.args || {} });
    } else if (event.type === 'tool.call.finished') {
      emitTaskEvent(task, 'tool.completed', {
        toolCallId: payload.toolCallId,
        toolName: payload.toolName || 'unknown',
        status: payload.status || 'completed',
        output: payload.output,
        error: payload.error,
      });
      emitFileReferences(task, payload.output);
    } else if (event.type === 'approval.requested') {
      if (payload.approvalKind === 'execution_plan') {
        const plan = payload.plan && typeof payload.plan === 'object' ? payload.plan : {};
        const visiblePlan = publicExecutionPlan(plan);
        const planHash = sha256Canonical(visiblePlan);
        task.pendingPlanApproval = {
          approvalId: `plan-apr-${task.taskId}-${planHash}`,
          planHash,
          plan: visiblePlan,
        };
        emitTaskEvent(task, 'plan.approval_requested', {
          approvalId: task.pendingPlanApproval.approvalId,
          planHash,
          contextDigestSha256: payload.contextDigestSha256,
          plan: task.pendingPlanApproval.plan,
        });
        return;
      }
      const preparation = payload.preparation && typeof payload.preparation === 'object' ? payload.preparation : null;
      if (preparation && task.write) {
        task.pendingApproval = {
          approvalId: `apr-ui-${task.taskId}-${preparation.planId}`,
          planId: preparation.planId,
          planHash: preparation.planHash,
          previewSha256: preparation.previewSha256,
          baseSha256: preparation.baseSha256,
          preparation,
        };
      }
      emitTaskEvent(task, 'approval.requested', {
        approvalId: task.pendingApproval && task.pendingApproval.approvalId,
        action: 'workspace.str_replace',
        planHash: preparation && preparation.planHash,
        workspaceBaseHash: preparation && preparation.baseSha256,
        preparation,
        description: '请核对单文件 Diff、编码、基线哈希后审批；审批只对这一笔计划有效。',
      });
    } else if (event.type === 'turn.suspended') {
      emitTaskEvent(task, task.pendingPlanApproval ? 'plan.awaiting_approval' : 'task.awaiting_approval', {
        outcome: payload.outcome,
      });
    } else if (event.type === 'state.transition') {
      emitTaskEvent(task, 'state.changed', {
        from: payload.from,
        to: payload.to,
        trigger: payload.trigger,
      });
    } else if (event.type === 'error.raised') {
      emitTaskEvent(task, 'error.occurred', serializeError(payload));
    } else if (event.type === 'turn.finished') {
      const outcome = payload.outcome;
      if (outcome === 'completed' && task.replanRequired) {
        emitTaskEvent(task, 'task.failed', {
          outcome: 'failed',
          state: 'failed',
          error: { code: 'REPLAN_REQUIRED', message: '审批前后工作区基线已变化，未执行写入。请重新生成单文件修改计划。' },
        });
      } else if (outcome === 'completed' && isReviewCapableScenario(task.scenario) && task.review) {
        // A Review task is complete from Core's perspective only after the
        // private proposal has been staged. Product completion waits for the
        // separate per-file decision and exact batch-apply lifecycle.
        if (!task.reviewAwaitingEmitted) {
          task.reviewAwaitingEmitted = true;
          emitTaskEvent(task, 'review.awaiting_decision', {
            reviewId: task.review.review.reviewId,
            revision: task.review.review.revision,
          });
        }
      } else if (outcome === 'completed') emitTaskEvent(task, 'task.completed', { outcome, state: payload.state });
      else if (outcome === 'cancelled') emitTaskEvent(task, 'task.cancelled', { outcome, state: payload.state });
      else emitTaskEvent(task, 'task.failed', { outcome, state: payload.state, error: payload.error });
    }
  }

  function emitFileReferences(task, output) {
    if (output && typeof output === 'object' && output.output !== undefined) output = output.output;
    const paths = [];
    if (output && typeof output.path === 'string' && typeof output.encoding === 'string') paths.push(output.path);
    if (output && Array.isArray(output.entries)) {
      output.entries.forEach((entry) => {
        if (entry && entry.type === 'file' && typeof entry.path === 'string') paths.push(entry.path);
      });
    }
    if (output && Array.isArray(output.matches)) {
      output.matches.forEach((match) => { if (match && typeof match.path === 'string') paths.push(match.path); });
    }
    Array.from(new Set(paths)).forEach((filePath) => emitTaskEvent(task, 'file.reference', { path: filePath }));
  }

  function recordGatewayDelta(task, input) {
    if (!task || typeof input.requestId !== 'string' || input.requestId.length === 0 ||
        !Number.isInteger(input.index) || input.index < 0 || typeof input.chunk !== 'string' ||
        (input.chunk.length === 0 && input.isFinal !== true)) {
      throw productError('GATEWAY_DELTA_INVALID', 'Gateway 返回了无效流式事件', '检查 Provider 的 requestId、index、chunk 与 final 合同。');
    }
    const payload = {
      schemaVersion: 1,
      taskId: task.taskId,
      requestId: String(input.requestId),
      index: input.index,
      chunk: String(input.chunk),
      isFinal: Boolean(input.isFinal),
      finishReason: input.finishReason === undefined ? null : input.finishReason,
    };
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 64 * 1024) {
      throw productError('GATEWAY_DELTA_TOO_LARGE', 'Gateway 单个流块超过 64 KiB 事件上限', '让 Provider 在写入审计前按 UTF-8 边界拆分流块。');
    }
    ledger.submit({
      eventId: `gateway:${task.runId}:${payload.requestId}:${payload.index}`,
      schemaVersion: 2,
      sessionId: task.sessionId,
      threadId: task.threadId,
      turnId: task.turnId,
      runId: task.runId,
      occurredAt: new Date().toISOString(),
      type: 'gateway.delta',
      payload,
    });
    emitTaskEvent(task, 'gateway.delta', payload);
  }

  function emitTaskEvent(task, eventKind, data) {
    if (!task || disposed) return;
    task.sequence += 1;
    const eventId = `product:${task.taskId}:${task.sequence}:${eventKind}`;
    const event = {
      taskId: task.taskId,
      eventId,
      eventKind,
      sequence: task.sequence,
      timestamp: new Date().toISOString(),
      data: {
        ...normalizeObject(data),
        sessionId: task.sessionId,
        threadId: task.threadId,
        turnId: task.turnId,
        runId: task.runId,
      },
    };
    persistTaskState(task, persistentTaskState(eventKind, task), data);
    if (typeof config.onTaskEvent === 'function') config.onTaskEvent(event, task);
  }

  function persistentTaskState(eventKind, task) {
    if (eventKind === 'task.accepted') return task.executionMode === 'plan' ? 'AWAITING_PLAN_APPROVAL' : 'EXECUTING';
    if (eventKind === 'review.created' || eventKind === 'review.awaiting_decision' || eventKind === 'review.updated' || eventKind === 'review.validation_recorded') return 'AWAITING_REVIEW';
    if (eventKind === 'review.approval_requested') return 'AWAITING_REVIEW';
    if (eventKind === 'review.applied') return 'COMPLETED';
    if (eventKind === 'review.apply_failed' || eventKind === 'review.security_blocked') return 'FAILED';
    if (eventKind === 'review.recovery') return 'AWAITING_REVIEW';
    if (eventKind === 'task.cancelled') return 'CANCELLED';
    if (eventKind === 'task.failed') return 'FAILED';
    if (eventKind === 'task.completed') return 'COMPLETED';
    if (eventKind === 'runner.started' || eventKind === 'tool.started') return 'EXECUTING';
    if (eventKind === 'task.plan_requested') return 'AWAITING_PLAN_APPROVAL';
    return task && task.status === 'awaiting_review' ? 'AWAITING_REVIEW' : 'EXECUTING';
  }

  function persistTaskState(task, explicitState, data) {
    if (!sessionCatalog || typeof sessionCatalog.persistTask !== 'function' || !task) return;
    const terminal = explicitState === 'CANCELLED' || explicitState === 'FAILED' || explicitState === 'COMPLETED';
    const reviewId = data && (data.reviewId || (data.review && data.review.reviewId));
    sessionCatalog.persistTask({
      schemaVersion: 1,
      taskId: task.taskId,
      sessionId: task.sessionId,
      turnId: task.turnId,
      state: explicitState,
      currentRunId: task.runId,
      ...(reviewId ? { currentReviewId: reviewId } : {}),
      lastEventSeq: task.sequence,
      ...(data && data.error && data.error.code ? { errorCode: data.error.code } : {}),
      startedAt: task.startedAt || new Date().toISOString(),
      ...(terminal ? { finishedAt: new Date().toISOString() } : {}),
    }, {
      schemaVersion: 1,
      runId: task.runId,
      taskId: task.taskId,
      attempt: 1,
      state: explicitState,
      ...(data && data.error && data.error.code ? { errorCode: data.error.code } : {}),
      startedAt: task.startedAt || new Date().toISOString(),
      ...(terminal ? { finishedAt: new Date().toISOString() } : {}),
    });
  }

  /** Persist only the Review projection and hash/file metadata.  Private
   * staging bytes remain under ReviewStagingSession's content-addressed root;
   * the SQLite catalog is never a proposal/content store. */
  function persistReviewState(task) {
    if (!sessionCatalog || !task || !task.review || typeof sessionCatalog.persistReview !== 'function') return;
    const review = task.review.review;
    const summary = {
      schemaVersion: 1,
      fileCount: review.files.length,
      acceptedPaths: review.files.filter((item) => item.decision === 'ACCEPTED').map((item) => item.relativePath),
      rejectedPaths: review.files.filter((item) => item.decision === 'REJECTED').map((item) => item.relativePath),
      pendingPaths: review.files.filter((item) => item.decision === 'PENDING').map((item) => item.relativePath),
      unverifiedItems: review.unverifiedItems.slice(),
      validationIds: review.validationRuns.map((run) => run.validationId),
      createdAt: review.createdAt,
      lastEventSeq: review.lastEventSeq,
    };
    sessionCatalog.persistReview({
      schemaVersion: 1,
      reviewId: review.reviewId,
      sessionId: review.sessionId,
      taskId: review.taskId,
      revision: review.revision,
      status: review.status,
      workspaceBaseHash: review.workspaceBaseHash,
      previewHash: review.previewHash,
      acceptedSetHash: review.acceptedSetHash,
      updatedAt: review.updatedAt,
      payload: summary,
    });
    if (typeof sessionCatalog.persistReviewFiles === 'function') {
      sessionCatalog.persistReviewFiles(review.reviewId, review.revision, review.files.map((item) => ({
        schemaVersion: 1,
        reviewId: review.reviewId,
        comparisonKey: item.comparisonKey,
        relativePath: item.relativePath,
        revision: review.revision,
        operation: item.operation,
        decision: item.decision,
        beforeExists: item.beforeExists,
        afterExists: item.afterExists,
        beforeBytes: item.beforeBytes,
        afterBytes: item.afterBytes,
        beforeSha256: item.beforeSha256,
        afterSha256: item.afterSha256,
        diffSha256: item.diff.diffSha256,
        beforeBlobRef: item.beforeBlobRef,
        afterBlobRef: item.afterBlobRef,
        writable: item.writable,
      })));
    }
    if (typeof sessionCatalog.persistValidation === 'function') {
      review.validationRuns.forEach((run) => sessionCatalog.persistValidation({
        schemaVersion: 1,
        validationRunId: run.validationId,
        reviewId: run.reviewId,
        revision: run.revision,
        validatedSetHash: run.validatedSetHash,
        profileId: run.profileId || 'not-run',
        argvDigest: run.argvDigestSha256 || '0'.repeat(64),
        result: run.status,
        outputSummary: run.summary,
        applicableFiles: run.applicablePaths.slice(),
        finishedAt: run.completedAt,
      }));
    }
  }

  function getDiagnostics() {
    const identity = config.productIdentity || {};
    return {
      schemaVersion: 1,
      product: identity.product || 'Win7 Coding Agent Desktop Alpha 3',
      version: identity.version || '0.5.0-a3.2',
      capabilities: {
        shell: 'trusted-local-electron',
        core: 'replay-runtime',
        state: config.stateCapability || `bounded-in-memory:${maxEvents}`,
        workspace: 'readonly-list-search-read + trusted-single-file-approval',
        write: 'single-file-str-replace-atomic-rollback-undo-reapproval',
        gateway: gatewaySettings.mode === 'deepseek'
          ? `configured-deepseek-openai-${gatewaySettings.model}-public-https-${getCredentialPersistenceStatus().saved ? 'dpapi-current-user' : 'memory'}-credentials`
          : gatewaySettings.mode === 'gateway'
            ? `configured-${gatewaySettings.gatewayUrl && gatewaySettings.gatewayUrl.toLowerCase().startsWith('http://') ? 'http' : 'https'}-node-${getCredentialPersistenceStatus().saved ? 'dpapi-current-user' : 'memory'}-credentials`
            : 'replay-default',
        runner: config.runnerAcceptanceAction ? 'native-trusted-profile-only' : 'unavailable-no-validated-release-helper',
        git: 'unavailable-not-probed',
        terminal: 'unavailable',
      },
      disabledCapabilities: config.disabledCapabilities || {
        interactiveTerminal: 'disabled-not-packaged',
        arbitraryShell: 'disabled-structured-runner-only',
      },
      stateRuntimeProfile: config.stateRuntimeProfile || null,
      persistenceRecovery: config.recoveryReport || null,
      persistedTaskCount: typeof sessionCatalog.listTasks === 'function' ? sessionCatalog.listTasks().length : null,
      systemPrompt: getSystemPromptContract(),
      selectedWorkspace,
      sessionCount: Array.from(sessions.values()).filter((session) => session.status === 'ACTIVE').length,
      activeTask: activeTask ? { taskId: activeTask.taskId, sessionId: activeTask.sessionId, status: activeTask.status } : null,
      stateEvents: ledger.size,
      gateway: getSettings(),
    };
  }

  function assertNoKnownCredentialValue(value) {
    const known = knownCredentialValues();
    if (known.length === 0) return;
    let text;
    try {
      text = typeof value === 'string' ? value : JSON.stringify(value);
    } catch (_error) {
      text = String(value);
    }
    const matched = known.some((secret) => [
      secret,
      Buffer.from(secret, 'utf8').toString('base64'),
      `Bearer ${secret}`,
    ].some((candidate) => candidate && text.includes(candidate)));
    if (matched) {
      throw productError(
        'SENSITIVE_DATA_BLOCKED',
        '内容命中已知凭据值，已在进入普通事件、聊天或工具证据前阻断。',
        '移除凭据内容，清理受影响的上下文后重试。',
      );
    }
  }

  function dispose() {
    disposed = true;
    if (eventTimer) clearInterval(eventTimer);
    if (gatewayProvider) {
      gatewayProvider.disconnect();
      gatewayProvider.credentialStore.clear();
      gatewayProvider = null;
    }
    eventSubscription.unsubscribe();
    sessions.clear();
    activeTask = null;
    if (typeof config.closeState === 'function') config.closeState();
  }

  function requireSession(sessionId, allowArchived) {
    const session = sessions.get(sessionId);
    if (!session) throw productError('SESSION_NOT_FOUND', `Session 不存在: ${sessionId || '(empty)'}`, '先创建或选择有效会话。');
    if (!allowArchived && session.status !== 'ACTIVE') {
      throw productError('SESSION_ARCHIVED', '归档会话只允许查看历史', '新建活动会话后再提交任务或修改 Goal。');
    }
    return session;
  }

  function findTask(taskId, runId) {
    for (const session of sessions.values()) {
      if (taskId) {
        const task = session.tasks.get(taskId);
        if (task) return task;
      }
      if (runId) {
        const task = Array.from(session.tasks.values()).find((candidate) => candidate.runId === runId);
        if (task) return task;
      }
    }
    return undefined;
  }

  function requireReviewTask(taskId, sessionId) {
    if (typeof taskId !== 'string' || !taskId) throw productError('REVIEW_INVALID', 'Review taskId is required.', '使用当前任务标识重试。');
    const task = findTask(taskId);
    if (!task || task.sessionId !== sessionId) throw productError('SESSION_SCOPE_DENIED', 'Review task 不属于当前会话。', '使用当前会话的 Review 标识。');
    if (!isReviewCapableScenario(task.scenario)) throw productError('REVIEW_TASK_REQUIRED', '只有 Review 任务可以访问多文件准备区（普通 Agent 或显式 Review）。', '从普通 Agent 对话重新生成修改提案后重试。');
    return task;
  }

  function requireActiveReviewTask(task) {
    // A restored AWAITING_REVIEW projection is inert until the user invokes a
    // Review action.  That explicit action may claim the foreground slot, but
    // startup recovery never resumes execution or Apply on its own.
    if (!activeTask && task && task.persisted && task.status === 'awaiting_review') {
      activeTask = task;
    }
    if (activeTask !== task) throw productError('TASK_NOT_ACTIVE', 'Review 任务已结束或不在前台。', '重新打开活动 Review 后重试。');
  }

  function taskSession(task) {
    return requireSession(task.sessionId);
  }

  function createWriteContext(workspaceRoot) {
    const recoveryDirectory = config.recoveryDirectory || path.join(os.tmpdir(), 'win7-coding-agent-a2-recovery');
    return {
      preparer: new workspace.TrustedWritePreparer(),
      coordinator: new workspace.WriteTransactionCoordinator(workspaceRoot, recoveryDirectory),
      plan: null,
      approvalBinding: null,
      tokenId: null,
    };
  }

  return host;
}

function publicSession(session, taskCountOverride) {
  const goal = session.goal;
  return {
    schemaVersion: 1,
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    threadId: session.threadId,
    label: session.label,
    workspacePath: session.workspacePath,
    createdAt: session.createdAt,
    status: session.status,
    ...(session.archivedAt ? { archivedAt: session.archivedAt } : {}),
    ...(goal ? { goal } : {}),
    taskCount: taskCountOverride === undefined ? session.tasks.size : taskCountOverride,
  };
}

function normalizeWorkspacePath(candidatePath) {
  if (typeof candidatePath !== 'string' || candidatePath.trim().length === 0) {
    throw productError('WORKSPACE_REQUIRED', '尚未选择工作区', '使用工作区选择器选择一个本地目录。');
  }
  validateWin7PathShape(candidatePath, process.platform);
  const lexical = path.resolve(candidatePath);
  let normalized;
  try { normalized = fs.realpathSync(lexical); } catch (_error) {
    throw productError('WORKSPACE_INVALID', '工作区路径不存在或无法解析', '选择一个存在且可读取的目录。');
  }
  if (process.platform === 'win32' && normalized.length >= 260) {
    throw productError('WORKSPACE_PATH_TOO_LONG', '工作区路径超过 Win7 MAX_PATH 安全边界', 'A8 v1 没有长路径 Profile；请选择较短的工作区路径。');
  }
  let stat;
  try { stat = fs.statSync(normalized); } catch (_error) { stat = null; }
  if (!stat || !stat.isDirectory()) throw productError('WORKSPACE_INVALID', '工作区必须是目录', '选择一个本地代码工作区目录。');
  return normalized;
}

function validateWin7PathShape(candidatePath, platform) {
  if (platform !== 'win32') return { normalized: candidatePath };
  if (!path.win32.isAbsolute(candidatePath)) {
    throw productError('WORKSPACE_PATH_NOT_ABSOLUTE', 'Win7 工作区必须使用绝对盘符或 UNC 路径', '使用例如 C:\\repo 的绝对路径。');
  }
  const normalized = path.win32.normalize(candidatePath);
  if (normalized.length >= 260) {
    throw productError('WORKSPACE_PATH_TOO_LONG', '工作区路径超过 Win7 MAX_PATH 安全边界', 'A8 v1 没有长路径 Profile；请选择较短的工作区路径。');
  }
  return { normalized };
}

function prepareContextRefs(rawRefs, session, workspace) {
  if (rawRefs === undefined) return { refs: [], items: [] };
  if (!Array.isArray(rawRefs) || rawRefs.length > 24) {
    throw productError('CONTEXT_LIMIT_EXCEEDED', '单轮上下文引用不能超过 24 项', '移除不必要的文件、目录或文本附件。');
  }
  const port = workspace.createReadonlyWorkspacePort(session.workspacePath);
  const refs = [];
  const items = [];
  let totalBytes = 0;
  rawRefs.forEach((raw, ordinal) => {
    if (!raw || typeof raw !== 'object') throw productError('CONTEXT_REF_INVALID', '上下文引用必须是对象', '重新从只读文件面板添加上下文。');
    const kind = raw.kind;
    let content;
    let relativePath;
    let lineStart;
    let lineEnd;
    if (kind === 'file') {
      if (typeof raw.path !== 'string' || !raw.path) throw productError('CONTEXT_REF_INVALID', '文件上下文缺少相对路径', '重新选择文件。');
      const startLine = Number.isInteger(raw.startLine) ? raw.startLine : 1;
      const maxLines = Number.isInteger(raw.endLine) ? raw.endLine - startLine + 1 : 500;
      if (maxLines < 1 || maxLines > 500) throw productError('CONTEXT_RANGE_INVALID', '文件上下文每项最多 500 行', '缩小选择范围。');
      const result = port.readText({ path: raw.path, startLine, maxLines, maxOutputBytes: 64 * 1024 });
      content = result.lines.map((line) => `${line.line}: ${line.text}`).join('\n');
      relativePath = result.path;
      lineStart = result.startLine;
      lineEnd = result.endLine;
    } else if (kind === 'directory') {
      if (typeof raw.path !== 'string') throw productError('CONTEXT_REF_INVALID', '目录上下文缺少相对路径', '重新选择目录。');
      const result = port.listDirectory({ path: raw.path, maxEntries: 200, maxOutputBytes: 48 * 1024 });
      content = JSON.stringify(result.entries);
      relativePath = result.path;
    } else if (kind === 'text') {
      if (typeof raw.content !== 'string' || !raw.content.trim()) throw productError('CONTEXT_REF_INVALID', '文本附件不能为空', '输入需要附加的文本。');
      content = raw.content;
      relativePath = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 120) : `attachment-${ordinal + 1}.txt`;
    } else {
      throw productError('CONTEXT_KIND_UNSUPPORTED', '只支持文件、目录和文本附件', '使用 file、directory 或 text 类型。');
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    totalBytes += bytes;
    if (totalBytes > 64 * 1024) throw productError('CONTEXT_LIMIT_EXCEEDED', '单轮上下文总量超过 64 KiB', '缩小行范围或移除大型附件。');
    const contentSha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    const ref = {
      schemaVersion: 1,
      ordinal: ordinal + 1,
      kind,
      relativePath,
      ...(lineStart ? { lineStart, lineEnd } : {}),
      contentSha256,
      bytes,
    };
    refs.push(ref);
    items.push({
      id: `context-ref-${ordinal + 1}-${contentSha256.slice(0, 12)}`,
      kind: 'workspace',
      content: `[${kind}:${relativePath}${lineStart ? `#L${lineStart}-L${lineEnd}` : ''}]\n${content}`,
      priority: 70,
      protection: 'normal',
      placement: 'rolling',
      source: relativePath,
    });
  });
  return { refs, items };
}

function normalizeScenario(value, prompt) {
  if (value === 'agent' || value === 'structure' || value === 'encoding' || value === 'cancellable' || value === 'edit' || value === 'undo' || value === 'runner_acceptance' || value === 'review') return value;
  // Natural-language edits must enter the Review-first Agent path. The
  // legacy A2 single-file write remains available only to explicit internal
  // callers that pass scenario:'edit'.
  if (/修改|写入|edit|write/i.test(prompt)) return 'agent';
  if (/取消|cancel/i.test(prompt)) return 'cancellable';
  if (/GBK|CP936|编码|encoding/i.test(prompt)) return 'encoding';
  return 'agent';
}

function isReviewCapableScenario(scenario) {
  return scenario === 'review' || scenario === 'agent';
}

function normalizeReviewProposals(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 128) {
    throw productError('REVIEW_INVALID', 'Review 提案必须包含 1～128 个文件。', '缩小提案范围后重试。');
  }
  let totalBytes = 0;
  return raw.map((proposal) => {
    if (!proposal || typeof proposal !== 'object' || typeof proposal.relativePath !== 'string') {
      throw productError('REVIEW_INVALID', 'Review 提案缺少相对路径。', '使用工作区相对路径重新提交。');
    }
    if (!['CREATE', 'MODIFY', 'DELETE'].includes(proposal.operation)) {
      throw productError('REVIEW_INVALID', 'Review 提案操作必须是 CREATE、MODIFY 或 DELETE。', '修正提案操作后重试。');
    }
    let afterContent;
    if (proposal.operation !== 'DELETE') {
      if (Buffer.isBuffer(proposal.afterContent)) afterContent = Buffer.from(proposal.afterContent);
      else if (typeof proposal.afterContentBase64 === 'string') {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(proposal.afterContentBase64)) {
          throw productError('REVIEW_INVALID', 'Review afterContentBase64 格式无效。', '使用标准 Base64 字节内容。');
        }
        afterContent = Buffer.from(proposal.afterContentBase64, 'base64');
      } else throw productError('REVIEW_INVALID', 'CREATE/MODIFY 提案必须包含 afterContentBase64。', '补充完整的 after 字节。');
      totalBytes += afterContent.length;
      if (afterContent.length > 2 * 1024 * 1024 || totalBytes > 16 * 1024 * 1024) {
        throw productError('REVIEW_INVALID', 'Review 提案字节数超过产品上限。', '拆分或缩小多文件提案。');
      }
    } else if (proposal.afterContent !== undefined || proposal.afterContentBase64 !== undefined) {
      throw productError('REVIEW_INVALID', 'DELETE 提案不能携带 after 内容。', '移除 DELETE 提案中的 after 字段。');
    }
    return { relativePath: proposal.relativePath, operation: proposal.operation, ...(afterContent ? { afterContent } : {}) };
  });
}

function publicExecutionPlan(plan) {
  const source = plan && typeof plan === 'object' ? plan : {};
  const targets = Array.isArray(source.toolCalls)
    ? source.toolCalls.map((entry) => {
      const call = entry && entry.call && typeof entry.call === 'object' ? entry.call : {};
      return {
        toolCallId: typeof call.id === 'string' ? call.id : '',
        toolName: typeof call.toolName === 'string' ? call.toolName : 'unknown',
        paths: extractPlanPaths(call.args),
        approvalLevel: typeof call.approvalLevel === 'string' ? call.approvalLevel : 'unknown',
      };
    })
    : [];
  return {
    schemaVersion: 1,
    summary: typeof source.summary === 'string' ? source.summary : '执行计划',
    targets,
    verificationRequirements: Array.isArray(source.verificationRequirements)
      ? source.verificationRequirements.map((item) => normalizeObject(item))
      : [],
    risks: targets
      .filter((target) => target.approvalLevel !== 'read_only')
      .map((target) => `${target.toolName}: ${target.approvalLevel}`),
  };
}

function extractPlanPaths(args) {
  if (!args || typeof args !== 'object') return [];
  return Array.from(new Set(['path', 'root', 'cwd']
    .map((key) => args[key])
    .filter((value) => typeof value === 'string')));
}

function sha256Canonical(value) {
  return crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function serializeError(error) {
  return {
    code: error && error.code ? String(error.code) : 'DESKTOP_RUNTIME_ERROR',
    message: error && error.message ? String(error.message) : String(error),
    recoverable: true,
    recommendedAction: '检查工作区和能力状态后重试；终端输入永久不可用，Runner 仅接受产品注入的受信 profile。',
  };
}

function productError(code, message, recommendedAction) {
  const error = new Error(message);
  error.code = code;
  error.recommendedAction = recommendedAction;
  return error;
}

function normalizeObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return { value };
}

module.exports = {
  createDesktopHost,
  normalizeWorkspacePath,
  validateWin7PathShape,
  serializeError,
  publicExecutionPlan,
  sha256Canonical,
};
