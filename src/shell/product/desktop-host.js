'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { ReplayModelAdapter } = require('./replay');

function loadModules() {
  return {
    core: requireModule('core/dist'),
    state: requireModule('state/dist'),
    workspace: requireModule('workspace/dist'),
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
  const maxSessions = config.maxSessions || 16;
  const maxEvents = config.maxEvents || 10_000;
  const ledger = new state.InMemoryEventLedger(maxEvents);
  const eventStream = new state.EventStream();
  const eventSubscription = eventStream.subscribe(config.maxPendingEvents || 1_024);
  const broker = new core.CapabilityBroker();
  const sessions = new Map();
  let sessionCounter = 0;
  let taskCounter = 0;
  let selectedWorkspace = null;
  let activeTask = null;
  let eventTimer = null;
  let disposed = false;

  const host = {
    selectWorkspace,
    getSelectedWorkspace: () => selectedWorkspace,
    createSession,
    listSessions,
    closeSession,
    submitTask,
    cancelTask,
    approveTask,
    rejectTask,
    prepareUndo,
    getRecovery,
    restoreRecovery,
    getDiagnostics,
    flushEvents,
    dispose,
    get activeTask() { return activeTask; },
    get ledgerSize() { return ledger.size; },
  };

  eventTimer = setInterval(flushEvents, 10);

  async function selectWorkspace(candidatePath) {
    if (activeTask) throw productError('WORKSPACE_BUSY', '任务运行期间不能切换工作区', '先取消或等待当前任务结束。');
    const normalized = normalizeWorkspacePath(candidatePath);
    if (sessions.size > 0 && selectedWorkspace && normalized !== selectedWorkspace) {
      throw productError('WORKSPACE_SESSION_BOUND', '已有会话绑定当前工作区，不能切换到另一个目录', '关闭现有会话后再选择新的工作区。');
    }
    selectedWorkspace = normalized;
    return {
      workspacePath: normalized,
      displayName: path.basename(normalized),
    };
  }

  function createSession(input) {
    if (sessions.size >= maxSessions) throw productError('SESSION_LIMIT', '会话数量已达到上限', '关闭不用的会话后重试。');
    if (!selectedWorkspace) throw productError('WORKSPACE_REQUIRED', '必须先通过主进程选择工作区', '使用工作区选择器选择一个本地目录。');
    const workspacePath = normalizeWorkspacePath(selectedWorkspace);
    if (input && input.workspacePath && normalizeWorkspacePath(input.workspacePath) !== workspacePath) {
      throw productError('WORKSPACE_BINDING_MISMATCH', '会话工作区与当前选择不一致', '重新选择工作区或新建独立会话。');
    }
    selectedWorkspace = workspacePath;
    sessionCounter += 1;
    const now = new Date().toISOString();
    const session = {
      sessionId: `session-${sessionCounter}`,
      label: input && input.label ? String(input.label).slice(0, 80) : path.basename(workspacePath),
      workspacePath,
      createdAt: now,
      tasks: new Map(),
      writeContext: createWriteContext(workspacePath),
    };
    sessions.set(session.sessionId, session);
    return publicSession(session);
  }

  function listSessions() {
    return Array.from(sessions.values(), publicSession);
  }

  async function closeSession(sessionId) {
    const session = requireSession(sessionId);
    if (activeTask && activeTask.sessionId === sessionId) {
      throw productError('SESSION_BUSY', '任务运行期间不能关闭当前会话', '先取消或等待当前任务结束。');
    }
    sessions.delete(sessionId);
    return { sessionId, closed: true };
  }

  function submitTask(input) {
    const session = requireSession(input && input.sessionId);
    if (activeTask) throw productError('TASK_BUSY', '当前已有活动任务', '先等待当前任务结束或取消它。');
    const prompt = input && typeof input.prompt === 'string' ? input.prompt.trim() : '';
    if (!prompt || prompt.length > 8_000) throw productError('TASK_INPUT_INVALID', '只读任务不能为空且不能超过 8000 字符', '缩短任务描述后重试。');
    const scenario = normalizeScenario(input && input.scenario, prompt);
    taskCounter += 1;
    const task = {
      taskId: `task-${taskCounter}`,
      sessionId: session.sessionId,
      threadId: `thread-${taskCounter}`,
      turnId: `turn-${taskCounter}`,
      runId: `run-${taskCounter}`,
      prompt,
      scenario,
      sequence: 0,
      eventIds: new Set(),
      status: 'running',
      result: null,
      protocol: null,
      writeIntent: input && input.writeIntent ? input.writeIntent : undefined,
      write: scenario === 'edit' || scenario === 'undo' ? session.writeContext : undefined,
      pendingApproval: null,
    };
    activeTask = task;
    session.tasks.set(task.taskId, task);
    emitTaskEvent(task, 'task.accepted', { status: 'accepted', scenario });
    void runTask(task, session);
    return { taskId: task.taskId, sessionId: task.sessionId, status: 'accepted', scenario };
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
      acceptance: {
        schemaVersion: '1.0',
        checks: [
          { checkId: 'workspace-tools', description: 'Replay used list, search and read workspace tools.' },
          { checkId: 'analysis-result', description: 'Replay produced a bounded user-visible result.' },
          ...(task.scenario === 'edit' || task.scenario === 'undo'
            ? [{ checkId: 'workspace-write', description: 'A2 applied exactly one approved single-file write.' }]
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
      contextBudget: { maxTokens: 8_000, maxItems: 64, maxChars: 64_000 },
      turnBudget: task.scenario === 'cancellable'
        ? { maxSteps: 20, maxWallMs: 120_000, maxToolCalls: 20 }
        : { maxSteps: 12, maxWallMs: 30_000, maxToolCalls: 12 },
      ...(resumeOptions && resumeOptions.resumeCheckpoint ? { resumeCheckpoint: resumeOptions.resumeCheckpoint } : {}),
      ...(resumeOptions && resumeOptions.tokenIdsByCallId ? { tokenIdsByCallId: resumeOptions.tokenIdsByCallId } : {}),
      ...(resumeOptions && resumeOptions.approvalRejection ? { approvalRejection: resumeOptions.approvalRejection } : {}),
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
      else if (task.result && task.result.outcome === 'completed') task.status = 'completed';
      else if (task.status !== 'cancelled') task.status = 'failed';
      task.protocol = null;
      if (activeTask === task && task.status !== 'awaiting_approval') activeTask = null;
    }
  }

  async function approveTask(input) {
    const task = findTask(input && input.taskId);
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
    if (!task || task.status !== 'awaiting_approval' || !task.pendingApproval) {
      throw productError('APPROVAL_NOT_PENDING', '当前任务没有待处理的 A2 审批', '重新生成一个单文件修改计划。');
    }
    if (input.approvalId !== task.pendingApproval.approvalId) throw productError('APPROVAL_BINDING_MISMATCH', '审批标识已变化', '重新查看当前 Diff 后再拒绝。');
    const call = task.result && task.result.checkpoint && task.result.checkpoint.pendingPlan && task.result.checkpoint.pendingPlan.toolCalls[0]
      ? task.result.checkpoint.pendingPlan.toolCalls[0].call : undefined;
    if (!call) throw productError('REPLAN_REQUIRED', '审批检查点缺少原始写入调用', '重新生成单文件修改计划。');
    const plan = task.write && task.write.preparer.get(task.pendingApproval.planId);
    if (plan) plan.status = 'rejected';
    task.pendingApproval = null;
    task.status = 'running';
    emitTaskEvent(task, 'approval.resolved', { approvalId: input.approvalId, resolution: 'rejected', reason: input.reason });
    void runTask(task, taskSession(task), {
      resumeCheckpoint: task.result.checkpoint,
      approvalRejection: { callId: call.id, reason: String(input.reason || '用户拒绝') },
    });
    return { taskId: task.taskId, approvalId: input.approvalId, status: 'resuming' };
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
    const acknowledgement = task.protocol
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
    const registry = new core.ToolRegistry();
    if (writeMode) core.registerWorkspaceTools(registry);
    else core.registerWorkspaceReadOnlyTools(registry);
    const port = workspace.createReadonlyWorkspacePort(workspaceRoot);
    const fallback = writeMode ? {
      async execute(spec, call) {
        if (call.toolName !== 'workspace.str_replace') throw new Error(`A2 executor refused ${call.toolName}`);
        const plan = task.write.preparer.getByCall(call.id);
        if (!plan || !task.write.approvalBinding) throw new Error('A2 approval plan is unavailable');
        const result = task.write.coordinator.apply(plan, task.write.approvalBinding);
        if (result.success) task.write.plan = plan;
        if (task.write.tokenId) {
          try { broker.revokeToken(task.write.tokenId); } catch (_error) { /* audit state is already fail-closed */ }
          task.write.tokenId = null;
        }
        return { callId: call.id, toolName: call.toolName, success: result.success, status: result.success ? 'succeeded' : 'failed', output: result };
      },
    } : undefined;
    const executor = new core.WorkspaceReadOnlyToolExecutor(port, fallback);
    const runtime = new core.AgentRuntime({
      model: new ReplayModelAdapter(core, task.scenario, { writeIntent: task.writeIntent }),
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
                ? (names.has('workspace.str_replace') || (task.write && task.write.plan && task.write.plan.status === 'rejected') || (names.has('workspace.list_directory') && names.has('workspace.search_text') && names.has('workspace.read_text')))
                : names.has('workspace.list_directory') && names.has('workspace.search_text') && names.has('workspace.read_text'))
              : check.checkId === 'analysis-result'
                ? Boolean(plan.finalResponse || plan.summary)
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
      const text = typeof plan.finalResponse === 'string' ? plan.finalResponse : (typeof plan.summary === 'string' ? plan.summary : '');
      if (text) emitTaskEvent(task, 'assistant.delta', { delta: text, final: Boolean(plan.finalResponse) });
    } else if (event.type === 'tool.call.started') {
      emitTaskEvent(task, 'tool.started', { toolName: payload.toolName || 'unknown', args: payload.args || {} });
    } else if (event.type === 'tool.call.finished') {
      emitTaskEvent(task, 'tool.completed', {
        toolName: payload.toolName || 'unknown',
        status: payload.status || 'completed',
        output: payload.output,
        error: payload.error,
      });
      emitFileReferences(task, payload.output);
    } else if (event.type === 'approval.requested') {
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
      emitTaskEvent(task, 'task.awaiting_approval', { outcome: payload.outcome, checkpoint: payload.checkpoint });
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
      if (outcome === 'completed') emitTaskEvent(task, 'task.completed', { outcome, state: payload.state });
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
      data: normalizeObject(data),
    };
    if (typeof config.onTaskEvent === 'function') config.onTaskEvent(event, task);
  }

  function getDiagnostics() {
    return {
      schemaVersion: 1,
      product: 'Win7 Coding Agent Desktop Alpha 2',
      version: '0.3.0-a2',
      capabilities: {
        shell: 'trusted-local-electron',
        core: 'replay-runtime',
        state: `bounded-in-memory:${maxEvents}`,
        workspace: 'readonly-list-search-read + trusted-single-file-approval',
        write: 'single-file-str-replace-atomic-rollback-undo-reapproval',
        gateway: 'unavailable-replay-only',
        runner: 'unavailable-fail-closed',
        git: 'unavailable-not-probed',
        terminal: 'unavailable',
      },
      selectedWorkspace,
      sessionCount: sessions.size,
      activeTask: activeTask ? { taskId: activeTask.taskId, status: activeTask.status } : null,
      stateEvents: ledger.size,
    };
  }

  function dispose() {
    disposed = true;
    if (eventTimer) clearInterval(eventTimer);
    eventSubscription.unsubscribe();
    sessions.clear();
    activeTask = null;
  }

  function requireSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) throw productError('SESSION_NOT_FOUND', `Session 不存在: ${sessionId || '(empty)'}`, '先创建或选择有效会话。');
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

function publicSession(session) {
  return {
    sessionId: session.sessionId,
    label: session.label,
    workspacePath: session.workspacePath,
    createdAt: session.createdAt,
    taskCount: session.tasks.size,
  };
}

function normalizeWorkspacePath(candidatePath) {
  if (typeof candidatePath !== 'string' || candidatePath.trim().length === 0) {
    throw productError('WORKSPACE_REQUIRED', '尚未选择工作区', '使用工作区选择器选择一个本地目录。');
  }
  const lexical = path.resolve(candidatePath);
  let normalized;
  try { normalized = fs.realpathSync(lexical); } catch (_error) {
    throw productError('WORKSPACE_INVALID', '工作区路径不存在或无法解析', '选择一个存在且可读取的目录。');
  }
  let stat;
  try { stat = fs.statSync(normalized); } catch (_error) { stat = null; }
  if (!stat || !stat.isDirectory()) throw productError('WORKSPACE_INVALID', '工作区必须是目录', '选择一个本地代码工作区目录。');
  return normalized;
}

function normalizeScenario(value, prompt) {
  if (value === 'structure' || value === 'encoding' || value === 'cancellable' || value === 'edit' || value === 'undo') return value;
  if (/修改|写入|edit|write/i.test(prompt)) return 'edit';
  if (/取消|cancel/i.test(prompt)) return 'cancellable';
  if (/GBK|CP936|编码|encoding/i.test(prompt)) return 'encoding';
  return 'structure';
}

function serializeError(error) {
  return {
    code: error && error.code ? String(error.code) : 'DESKTOP_RUNTIME_ERROR',
    message: error && error.message ? String(error.message) : String(error),
    recoverable: true,
    recommendedAction: '检查工作区和只读能力状态后重试；Runner、终端与真实 Gateway 当前不可用。',
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

module.exports = { createDesktopHost, normalizeWorkspacePath, serializeError };
