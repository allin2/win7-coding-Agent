'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const packageRoot = path.resolve(__dirname, '../..');
const productRoot = path.join(packageRoot, 'product');
const distRoot = path.join(packageRoot, 'dist');
const core = require(path.join(packageRoot, 'core/dist'));
const workspace = require(path.join(packageRoot, 'workspace/dist'));
const { createDesktopRequestHandler } = require(path.join(productRoot, 'desktop-ipc'));
const { createDesktopHost } = require(path.join(productRoot, 'desktop-host'));
const { IPCDirection, IPCMessageType } = require(path.join(distRoot, 'ipc/messages'));

const workspaceRoot = path.resolve(argument('--workspace=') || path.join(__dirname, 'workspace'));
const reportPath = path.resolve(argument('--report=') || path.join(__dirname, 'W06-tamper-report.json'));
const runRoot = path.join(workspaceRoot, `run-${Date.now()}-${process.pid}`);

function argument(prefix) {
  const value = process.argv.find((item) => item.indexOf(prefix) === 0);
  return value ? value.slice(prefix.length) : null;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await wait(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function message(type, sessionId, payload) {
  return {
    protocolVersion: '1.0.0',
    id: `w06-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    direction: IPCDirection.RENDERER_TO_CORE,
    sessionId,
    timestamp: new Date().toISOString(),
    payload,
  };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function flipHash(value) {
  return value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
}

function createCaseWorkspace(caseId) {
  const root = path.join(runRoot, caseId.toLowerCase());
  const sourceRoot = path.join(root, 'src');
  fs.mkdirSync(sourceRoot, { recursive: true });
  const filePath = path.join(sourceRoot, 'hello.ts');
  fs.writeFileSync(filePath, 'export const hello = "world";\r\n', 'utf8');
  return { root, filePath, relativePath: 'src/hello.ts', recoveryRoot: path.join(root, 'recovery') };
}

function findUnsafeArtifacts(root) {
  const results = [];
  if (!fs.existsSync(root)) return results;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(current);
      else if (entry.isFile() && (/\.(bak|tmp|b64)$/i.test(entry.name) || entry.name === 'a2-write-recovery.json')) {
        results.push(path.relative(root, current).replace(/\\/g, '/'));
      }
    }
  };
  visit(root);
  return results;
}

function fileEvidence(testWorkspace, beforeSha256) {
  const afterSha256 = sha256File(testWorkspace.filePath);
  const unsafeArtifacts = findUnsafeArtifacts(testWorkspace.root);
  return {
    path: testWorkspace.filePath,
    before_sha256: beforeSha256,
    after_sha256: afterSha256,
    unchanged: beforeSha256 === afterSha256,
    unsafe_artifacts: unsafeArtifacts,
    clean: unsafeArtifacts.length === 0,
  };
}

function resultCase(caseId, rejected, expected, actual, evidence, metrics) {
  const passed = rejected && evidence.unchanged && evidence.clean;
  return {
    case_id: caseId,
    status: passed ? 'PASS' : 'FAIL',
    expected,
    actual,
    file_evidence: evidence,
    metrics: metrics || {},
  };
}

function createHandler(host) {
  return createDesktopRequestHandler({
    getDesktopHost: () => host,
    isValidRendererSender: (event) => Boolean(event && event.trusted === true),
    runtimeState: { diagnosticsRequested: false, errors: [] },
    buildDiagnostics: () => host.getDiagnostics(),
  });
}

async function preparePendingHost(caseId, twoSessions) {
  const testWorkspace = createCaseWorkspace(caseId);
  const host = createDesktopHost({ recoveryDirectory: testWorkspace.recoveryRoot });
  await host.selectWorkspace(testWorkspace.root);
  const sessionA = host.createSession({ workspacePath: testWorkspace.root, label: `${caseId}-A` });
  const sessionB = twoSessions
    ? host.createSession({ workspacePath: testWorkspace.root, label: `${caseId}-B` })
    : undefined;
  host.submitTask({
    sessionId: sessionA.sessionId,
    prompt: `${caseId} controlled edit tamper probe`,
    scenario: 'edit',
    writeIntent: {
      path: testWorkspace.relativePath,
      oldText: 'export const hello = "world";',
      newText: 'export const hello = "tampered-write-must-not-run";',
    },
  });
  const activeTask = await waitFor(
    () => host.activeTask && host.activeTask.status === 'awaiting_approval' && host.activeTask.pendingApproval
      ? host.activeTask
      : null,
    15_000,
    `${caseId} approval`,
  );
  return { testWorkspace, host, handler: createHandler(host), sessionA, sessionB, activeTask };
}

async function rejectPending(context) {
  const pending = context.activeTask.pendingApproval;
  await context.handler(
    { trusted: true },
    message(IPCMessageType.TASK_REJECT, context.sessionA.sessionId, {
      taskId: context.activeTask.taskId,
      approvalId: pending.approvalId,
      reason: 'W06 probe cleanup after verified rejection',
    }),
  );
  await wait(100);
  context.host.dispose();
}

async function runPlanHashTamper() {
  const context = await preparePendingHost('PLAN_HASH_TAMPER', false);
  const before = sha256File(context.testWorkspace.filePath);
  const pending = context.activeTask.pendingApproval;
  const response = await context.handler(
    { trusted: true },
    message(IPCMessageType.TASK_APPROVE, context.sessionA.sessionId, {
      taskId: context.activeTask.taskId,
      approvalId: pending.approvalId,
      planHash: flipHash(pending.planHash),
      workspaceBaseHash: pending.baseSha256,
    }),
  );
  const evidence = fileEvidence(context.testWorkspace, before);
  const actualCode = response && response.error && response.error.code;
  const result = resultCase(
    'PLAN_HASH_TAMPER',
    response && response.ok === false && actualCode === 'APPROVAL_BINDING_MISMATCH',
    'APPROVAL_BINDING_MISMATCH and no write',
    actualCode || response,
    evidence,
    { approval_response: response, original_plan_hash: pending.planHash, forged_plan_hash: flipHash(pending.planHash) },
  );
  await rejectPending(context);
  return result;
}

async function runCrossSessionTamper() {
  const context = await preparePendingHost('SESSION_TAMPER', true);
  const before = sha256File(context.testWorkspace.filePath);
  const pending = context.activeTask.pendingApproval;
  const response = await context.handler(
    { trusted: true },
    message(IPCMessageType.TASK_APPROVE, context.sessionB.sessionId, {
      taskId: context.activeTask.taskId,
      approvalId: pending.approvalId,
      planHash: pending.planHash,
      workspaceBaseHash: pending.baseSha256,
    }),
  );
  const evidence = fileEvidence(context.testWorkspace, before);
  const actualCode = response && response.error && response.error.code;
  const result = resultCase(
    'SESSION_TAMPER',
    response && response.ok === false && actualCode === 'SESSION_SCOPE_DENIED',
    'SESSION_SCOPE_DENIED and no write',
    actualCode || response,
    evidence,
    { approval_response: response, owner_session: context.sessionA.sessionId, forged_session: context.sessionB.sessionId },
  );
  await rejectPending(context);
  return result;
}

function runPreviewHashTamper() {
  const testWorkspace = createCaseWorkspace('PREVIEW_HASH_TAMPER');
  const before = sha256File(testWorkspace.filePath);
  const preparer = new workspace.TrustedWritePreparer();
  const coordinator = new workspace.WriteTransactionCoordinator(testWorkspace.root, testWorkspace.recoveryRoot);
  const plan = preparer.prepare({
    workspaceRoot: testWorkspace.root,
    path: testWorkspace.relativePath,
    oldText: 'export const hello = "world";',
    newText: 'export const hello = "tampered-preview-must-not-run";',
    sessionId: 'w06-preview-session',
    taskId: 'w06-preview-task',
    turnId: 'w06-preview-turn',
    callId: 'w06-preview-call',
  });
  const binding = coordinator.issueApproval(plan, {
    planId: plan.planId,
    taskId: plan.taskId,
    turnId: plan.turnId,
    callId: plan.callId,
    planHash: plan.planHash,
    sessionId: plan.sessionId,
    subject: 'w06-probe',
    previewSha256: plan.previewSha256,
    baselineSha256: plan.baseSha256,
  });
  const forgedBinding = { ...binding, previewSha256: flipHash(binding.previewSha256) };
  let actualCode = '';
  let actualMessage = '';
  try {
    workspace.applyPlan(plan.writePlan, {
      workspaceRoot: testWorkspace.root,
      approval: forgedBinding,
      approvalLedger: coordinator.approvals,
    });
    actualCode = 'UNEXPECTED_ALLOW';
  } catch (error) {
    actualCode = error && error.code ? String(error.code) : 'UNKNOWN_ERROR';
    actualMessage = String(error && error.message ? error.message : error);
  }
  const evidence = fileEvidence(testWorkspace, before);
  return resultCase(
    'PREVIEW_HASH_TAMPER',
    actualCode === 'APPROVAL_INVALID' && actualMessage.indexOf('previewSha256') !== -1,
    'APPROVAL_INVALID(previewSha256) and no write',
    `${actualCode}: ${actualMessage}`,
    evidence,
    { original_preview_sha256: binding.previewSha256, forged_preview_sha256: forgedBinding.previewSha256 },
  );
}

function runTokenTamper() {
  const testWorkspace = createCaseWorkspace('TOKEN_TAMPER');
  const before = sha256File(testWorkspace.filePath);
  const sessionId = 'w06-token-session';
  const call = {
    id: 'w06-token-call',
    toolName: 'workspace.str_replace',
    args: {
      path: testWorkspace.relativePath,
      oldText: 'export const hello = "world";',
      newText: 'export const hello = "forged-token-must-not-run";',
    },
    approvalLevel: core.ApprovalLevel.WORKSPACE_WRITE,
    approvalContext: {
      previewSha256: sha256Text('w06-token-preview'),
      baselineSha256: before,
      planId: 'w06-token-plan',
      planHash: sha256Text('w06-token-plan'),
    },
  };
  const broker = new core.CapabilityBroker();
  const issued = broker.issueToken(sessionId, ['workspace_write'], 60_000, core.bindCapabilityToToolCall(call));
  const policy = new core.PolicyEngine({ tokenValidator: (tokenId) => broker.validateToken(tokenId) });
  const forgedTokenId = flipHash(issued.tokenId);
  const decision = policy.evaluate(call, forgedTokenId, sessionId, 'workspace_write');
  let executorInvocations = 0;
  if (decision.allowed) executorInvocations += 1;
  const evidence = fileEvidence(testWorkspace, before);
  return resultCase(
    'TOKEN_TAMPER',
    decision.allowed === false && decision.ruleId === 'POLICY_APPROVAL_INVALID' && executorInvocations === 0,
    'POLICY_APPROVAL_INVALID, zero executor dispatches and no write',
    decision.ruleId,
    evidence,
    {
      decision,
      executor_invocations: executorInvocations,
      issued_token_sha256: sha256Text(issued.tokenId),
      forged_token_sha256: sha256Text(forgedTokenId),
    },
  );
}

async function run() {
  fs.mkdirSync(runRoot, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const cases = [];
  cases.push(await runPlanHashTamper());
  cases.push(runPreviewHashTamper());
  cases.push(await runCrossSessionTamper());
  cases.push(runTokenTamper());
  const report = {
    schema_version: 1,
    mvp_id: argument('--mvp-id=') || 'MVP-UNKNOWN',
    suite: 'A2_WIN7_W06_APPROVAL_TAMPER_NEGATIVE_PROBE',
    generated_at: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      package_root: packageRoot,
      workspace_root: workspaceRoot,
      run_root: runRoot,
    },
    artifact_hashes: {
      probe: sha256File(__filename),
      ipc_router: sha256File(path.join(packageRoot, 'product', 'desktop-ipc.js')),
      desktop_host: sha256File(path.join(packageRoot, 'product', 'desktop-host.js')),
      core_policy: sha256File(path.join(packageRoot, 'core/dist/policy.js')),
      core_broker: sha256File(path.join(packageRoot, 'core/dist/broker.js')),
      workspace_trusted_write: sha256File(path.join(packageRoot, 'workspace/dist/trusted-write.js')),
      workspace_apply: sha256File(path.join(packageRoot, 'workspace/dist/apply.js')),
    },
    command: [process.execPath].concat(process.argv.slice(1)),
    cases,
    summary: {
      total: cases.length,
      passed: cases.filter((item) => item.status === 'PASS').length,
      failed: cases.filter((item) => item.status !== 'PASS').length,
    },
    exit_code: cases.every((item) => item.status === 'PASS') ? 0 : 1,
    notes: [
      'Plan and session tampering are submitted through the packaged Electron IPC/desktop host boundary.',
      'Preview tampering is submitted to the packaged Workspace approval ledger before any filesystem operation.',
      'Token tampering is submitted to the packaged Core Broker/Policy boundary and records zero executor dispatches.',
      'Every case uses an isolated UTF-8 CRLF file and records before/after SHA-256 plus unsafe-artifact cleanup evidence.',
    ],
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

app.whenReady().then(async () => {
  try {
    const report = await run();
    app.exit(report.exit_code);
  } catch (error) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
      schema_version: 1,
      mvp_id: argument('--mvp-id=') || 'MVP-UNKNOWN',
      suite: 'A2_WIN7_W06_APPROVAL_TAMPER_NEGATIVE_PROBE',
      generated_at: new Date().toISOString(),
      exit_code: 1,
      error: String(error && error.stack ? error.stack : error),
    }, null, 2) + '\n', 'utf8');
    app.exit(1);
  }
});
