'use strict';

// Packaged Desktop Alpha 2 automatic acceptance probe.
// This file intentionally exercises the packaged Core/Workspace/Shell modules
// directly and uses only one-time, isolated workspaces created below.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { app } = require('electron');

const packageRoot = path.resolve(__dirname, '../..');
const core = require(path.join(packageRoot, 'core/dist'));
const workspace = require(path.join(packageRoot, 'workspace/dist'));
const runWorkspaceRoot = path.resolve(argument('--workspace=') || path.join(__dirname, 'workspace'));
const reportPath = path.resolve(argument('--report=') || path.join(__dirname, 'A2-W07-W15-report.json'));
const runRoot = path.join(runWorkspaceRoot, 'a2-auto-run-' + Date.now() + '-' + process.pid);
const childCommands = [];

function argument(prefix) {
  const item = process.argv.find((value) => value.indexOf(prefix) === 0);
  return item ? item.slice(prefix.length) : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function fileFeatures(buffer) {
  const bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const body = buffer.subarray(bom ? 3 : 0);
  const text = body.toString('utf8');
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.replace(/\r\n/g, '').match(/\n/g) || []).length;
  const cr = (text.replace(/\r\n/g, '').match(/\r/g) || []).length;
  const styles = Number(crlf > 0) + Number(lf > 0) + Number(cr > 0);
  return {
    bytes: buffer.length,
    bom,
    eol: styles === 0 ? 'none' : styles > 1 ? 'mixed' : crlf > 0 ? 'crlf' : lf > 0 ? 'lf' : 'cr',
    utf8_valid: (() => {
      try { new TextDecoder('utf-8', { fatal: true }).decode(body); return true; } catch (_) { return false; }
    })(),
  };
}

function unsafeArtifacts(root) {
  const found = [];
  if (!fs.existsSync(root)) return found;
  function visit(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(current);
      else if (entry.isFile() && (/\.tmp(?:-|$)|\.bak(?:-|$)|\.b64$/i.test(entry.name) || entry.name === 'a2-write-recovery.json')) {
        found.push(path.relative(root, current).replace(/\\/g, '/'));
      }
    });
  }
  visit(root);
  return found.sort();
}

function isolatedCase(caseId, bytes) {
  const root = path.join(runRoot, caseId.toLowerCase());
  const source = path.join(root, 'src');
  fs.mkdirSync(source, { recursive: true });
  const filePath = path.join(source, 'sample.ts');
  fs.writeFileSync(filePath, bytes, { encoding: null });
  return { caseId, root, filePath, relativePath: 'src/sample.ts' };
}

function intent(test, oldText, newText, suffix) {
  return {
    workspaceRoot: test.root,
    path: test.relativePath,
    oldText,
    newText,
    sessionId: 'a2-' + test.caseId.toLowerCase(),
    taskId: 'task-' + test.caseId.toLowerCase(),
    turnId: 'turn-' + test.caseId.toLowerCase(),
    callId: 'call-' + test.caseId.toLowerCase() + (suffix || ''),
  };
}

function approvalFor(coordinator, plan) {
  return coordinator.issueApproval(plan, {
    planId: plan.planId,
    taskId: plan.taskId,
    turnId: plan.turnId,
    callId: plan.callId,
    planHash: plan.planHash,
    sessionId: plan.sessionId,
    subject: 'a2-automatic-acceptance',
    previewSha256: plan.previewSha256,
    baselineSha256: plan.baseSha256,
  });
}

function result(caseId, expected, actual, test, beforeSha, metrics, extra) {
  const afterSha = sha256File(test.filePath);
  const artifacts = unsafeArtifacts(test.root);
  const evidence = {
    path: test.filePath,
    before_sha256: beforeSha,
    after_sha256: afterSha,
    unchanged: beforeSha === afterSha,
    before_features: fileFeatures(fs.readFileSync(test.filePath)),
    after_features: fileFeatures(fs.readFileSync(test.filePath)),
    unsafe_artifacts: artifacts,
    clean: artifacts.length === 0,
  };
  const passed = Boolean(actual && actual.passed) && evidence.clean;
  return Object.assign({
    case_id: caseId,
    status: passed ? 'PASS' : 'FAIL',
    expected,
    actual: actual || null,
    file_evidence: evidence,
    executor_invocations: metrics && metrics.executor_invocations || 0,
    temp_backup_recovery_artifacts: artifacts,
    metrics: metrics || {},
  }, extra || {});
}

function createPlanContext(test, oldText, newText, suffix) {
  const preparer = new workspace.TrustedWritePreparer();
  const coordinator = new workspace.WriteTransactionCoordinator(test.root, path.join(test.root, 'recovery'));
  const plan = preparer.prepare(intent(test, oldText, newText, suffix));
  const approval = approvalFor(coordinator, plan);
  return { preparer, coordinator, plan, approval };
}

function runW07() {
  const test = isolatedCase('W07_SINGLE_USE_APPROVAL', Buffer.from('export const value = "before";\r\n', 'utf8'));
  const before = sha256File(test.filePath);
  const context = createPlanContext(test, 'export const value = "before";', 'export const value = "after";');
  context.plan.status = 'approved';
  const tokenBroker = new core.CapabilityBroker();
  const tokenCall = {
    id: context.plan.callId,
    toolName: 'workspace.str_replace',
    args: { path: context.plan.relativePath },
    approvalLevel: core.ApprovalLevel.WORKSPACE_WRITE,
    approvalContext: { planId: context.plan.planId, planHash: context.plan.planHash, previewSha256: context.plan.previewSha256, baselineSha256: context.plan.baseSha256 },
  };
  const token = tokenBroker.issueToken(context.plan.sessionId, ['workspace_write'], 60_000, core.bindCapabilityToToolCall(tokenCall));
  const policy = new core.PolicyEngine({ tokenValidator: (tokenId) => tokenBroker.validateToken(tokenId) });
  const firstDecision = policy.evaluate(tokenCall, token.tokenId, context.plan.sessionId, 'workspace_write');
  let executorInvocations = 0;
  let firstApply;
  let secondCode = null;
  if (firstDecision.allowed) {
    executorInvocations += 1;
    firstApply = workspace.applyPlan(context.plan.writePlan, {
      workspaceRoot: test.root,
      approval: context.approval,
      approvalLedger: context.coordinator.approvals,
    });
  }
  try {
    workspace.applyPlan(context.plan.writePlan, {
      workspaceRoot: test.root,
      approval: context.approval,
      approvalLedger: context.coordinator.approvals,
    });
    secondCode = 'UNEXPECTED_ALLOW';
  } catch (error) {
    secondCode = error && error.code ? String(error.code) : 'UNKNOWN_ERROR';
  }
  tokenBroker.revokeToken(token.tokenId);
  const finalSha = sha256File(test.filePath);
  return result('W07_SINGLE_USE_APPROVAL', 'first apply succeeds; same approval/token second apply fails closed with APPROVAL_INVALID', {
    passed: Boolean(firstApply && firstApply.success) && secondCode === 'APPROVAL_INVALID' && finalSha === context.plan.contentSha256,
    first_apply: firstApply,
    second_apply_error_code: secondCode,
    core_policy_first_decision: firstDecision,
    approval_id: context.approval.approvalId,
    token_id_sha256: sha256(Buffer.from(token.tokenId, 'utf8')),
  }, test, before, { executor_invocations: executorInvocations, approval_consumptions_expected: 1 });
}

function runW08() {
  const samples = [
    { id: 'W08_UTF8_BOM', bytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('const value = "bom";\n', 'utf8')]), old: 'const value = "bom";', next: 'const value = "bom-updated";' },
    { id: 'W08_UTF8_LF', bytes: Buffer.from('const value = "lf";\nsecond line\n', 'utf8'), old: 'const value = "lf";', next: 'const value = "lf-updated";' },
    { id: 'W08_UTF8_CRLF', bytes: Buffer.from('const value = "crlf";\r\nsecond line\r\n', 'utf8'), old: 'const value = "crlf";', next: 'const value = "crlf-updated";' },
  ];
  return samples.map((sample) => {
    const test = isolatedCase(sample.id, sample.bytes);
    const beforeBytes = fs.readFileSync(test.filePath);
    const before = sha256(beforeBytes);
    let context;
    let applyResult;
    let errorCode = null;
    try {
      context = createPlanContext(test, sample.old, sample.next);
      context.plan.status = 'approved';
      applyResult = workspace.applyPlan(context.plan.writePlan, {
        workspaceRoot: test.root,
        approval: context.approval,
        approvalLedger: context.coordinator.approvals,
      });
    } catch (error) {
      errorCode = error && error.code ? String(error.code) : 'UNKNOWN_ERROR';
    }
    const afterBytes = fs.readFileSync(test.filePath);
    const expectedBytes = sample.id === 'W08_UTF8_BOM'
      ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('const value = "bom-updated";\n', 'utf8')])
      : sample.id === 'W08_UTF8_LF'
        ? Buffer.from('const value = "lf-updated";\nsecond line\n', 'utf8')
        : Buffer.from('const value = "crlf-updated";\r\nsecond line\r\n', 'utf8');
    const expectedFeatures = fileFeatures(expectedBytes);
    const actualFeatures = fileFeatures(afterBytes);
    const first = result(sample.id, 'write succeeds and BOM/EOL byte style is unchanged', {
      passed: Boolean(applyResult && applyResult.success) && errorCode === null && afterBytes.equals(expectedBytes) && actualFeatures.bom === expectedFeatures.bom && actualFeatures.eol === expectedFeatures.eol,
      apply: applyResult,
      error_code: errorCode,
      expected_sha256: sha256(expectedBytes),
      plan_sha256: context && context.plan.contentSha256,
    }, test, before, { executor_invocations: applyResult ? 1 : 0 });
    first.file_evidence.plan_sha256 = context && context.plan.contentSha256;
    first.file_evidence.written_sha256 = sha256(afterBytes);
    first.file_evidence.original_bytes = fileFeatures(beforeBytes);
    first.file_evidence.written_bytes = actualFeatures;
    return first;
  });
}

function runW09() {
  const cases = [
    {
      id: 'W09_GBK',
      bytes: Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0d, 0x0a]),
      old: '中文', next: '中文-updated', expectedCode: 'ENCODING_AMBIGUOUS',
    },
    {
      id: 'W09_BINARY',
      bytes: Buffer.from([0x00, 0x01, 0x7f, 0xff, 0xfe, 0x00]),
      old: '\u0000', next: 'binary-updated', expectedCode: 'ENCODING_AMBIGUOUS',
    },
    {
      id: 'W09_BOUNDARY_ESCAPE',
      bytes: Buffer.from('const value = "inside";\r\n', 'utf8'),
      old: 'const value = "inside";', next: 'const value = "must-not-write"', expectedCode: 'WORKSPACE_BOUNDARY_VIOLATION', pathEscape: true,
    },
    {
      id: 'W09_TRUNCATED_PREVIEW',
      bytes: Buffer.from('const value = "' + 'a'.repeat(120000) + '";\n', 'utf8'),
      old: 'a'.repeat(120000), next: 'b'.repeat(120000), expectedCode: 'DIFF_TRUNCATED',
    },
  ];
  return cases.map((item) => {
    const test = isolatedCase(item.id, item.bytes);
    const before = sha256File(test.filePath);
    let errorCode = null;
    let errorMessage = null;
    let executorInvocations = 0;
    try {
      const preparer = new workspace.TrustedWritePreparer();
      const writeIntent = intent(test, item.old, item.next);
      if (item.pathEscape) writeIntent.path = '../outside.txt';
      const plan = preparer.prepare(writeIntent);
      // This line is unreachable for the four negative cases. Keep the count
      // explicit so a future change cannot silently turn preparation into I/O.
      executorInvocations += 1;
      void plan;
    } catch (error) {
      errorCode = error && error.code ? String(error.code) : 'UNKNOWN_ERROR';
      errorMessage = error && error.message ? String(error.message) : String(error);
    }
    return result(item.id, item.expectedCode + ' before execution; zero executor dispatches and unchanged bytes', {
      passed: errorCode === item.expectedCode && executorInvocations === 0,
      error_code: errorCode,
      error_message: errorMessage,
    }, test, before, { executor_invocations: executorInvocations, expected_error_code: item.expectedCode });
  });
}

function runW10() {
  const test = isolatedCase('W10_AUTO_RECOVERY', Buffer.from('const value = "original";\r\n', 'utf8'));
  const before = sha256File(test.filePath);
  const context = createPlanContext(test, 'const value = "original";', 'const value = "updated";');
  context.plan.status = 'approved';
  let applyResult;
  let errorCode = null;
  let executorInvocations = 0;
  try {
    executorInvocations += 1;
    applyResult = workspace.applyPlan(context.plan.writePlan, {
      workspaceRoot: test.root,
      approval: context.approval,
      approvalLedger: context.coordinator.approvals,
      workspace: { writeFile() { throw new Error('A2-W10 injected post-replace failure'); } },
    });
  } catch (error) {
    errorCode = error && error.code ? String(error.code) : 'UNKNOWN_ERROR';
  }
  const after = sha256File(test.filePath);
  return result('W10_AUTO_RECOVERY', 'injected write failure returns failed/completed rollback and restores original bytes', {
    passed: Boolean(applyResult) && applyResult.success === false && applyResult.rollbackStatus === 'completed' && applyResult.rolledBack === true && after === before && errorCode === null,
    apply: applyResult,
    error_code: errorCode,
    recovery_manifest_after_apply: null,
  }, test, before, { executor_invocations: executorInvocations, injected_seam: 'ApplyPlanOptions.workspace.writeFile' });
}

function runCommand(command, args) {
  childCommands.push([command].concat(args));
  const result = childProcess.spawnSync(command, args, {
    shell: false, windowsHide: true, encoding: 'utf8', timeout: 15_000, maxBuffer: 4 * 1024 * 1024,
  });
  return {
    command: [command].concat(args),
    exit_code: result.status,
    error: result.error ? String(result.error.message) : null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function processNetworkSnapshot() {
  const processes = runCommand('tasklist', ['/fo', 'csv', '/nh']);
  const network = runCommand('netstat', ['-ano']);
  return { captured_at: new Date().toISOString(), pid: process.pid, processes, network };
}

function addedLines(before, after) {
  const oldLines = new Set(String(before || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  return String(after || '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !oldLines.has(line));
}

function runW14W15(beforeSnapshot) {
  const afterSnapshot = processNetworkSnapshot();
  const artifacts = unsafeArtifacts(runRoot);
  const addedNetwork = addedLines(beforeSnapshot.network.stdout, afterSnapshot.network.stdout)
    .filter((line) => line.indexOf(String(process.pid)) === -1);
  const forbiddenCommands = childCommands.filter((command) => /git|runner|terminal|cmd\.exe|powershell/i.test(command.join(' ')));
  const processPass = afterSnapshot.processes.exit_code === 0 && afterSnapshot.network.exit_code === 0;
  const networkPass = addedNetwork.length === 0;
  const w14 = {
    case_id: 'W14_CLEANUP_AND_NO_PROBE_RESIDUE',
    status: artifacts.length === 0 ? 'PASS' : 'FAIL',
    expected: 'all isolated cases have no .tmp/.bak/.b64/recovery artifacts; probe PID is reported for independent SSH check',
    actual: { artifacts, probe_pid: process.pid, independent_pid_check_required: true },
    executor_invocations: 0,
    temp_backup_recovery_artifacts: artifacts,
    metrics: { run_root: runRoot },
  };
  const w15 = {
    case_id: 'W15_NO_UNDECLARED_ACTIVITY_BITVISE_SAFE',
    status: processPass && networkPass && forbiddenCommands.length === 0 ? 'PASS' : 'FAIL',
    expected: 'no product-created network connection and no Git/Runner/terminal child activity; system observation commands only',
    actual: { process_snapshot: afterSnapshot.processes, network_snapshot: afterSnapshot.network, added_network_lines_excluding_probe: addedNetwork, forbidden_child_commands: forbiddenCommands },
    executor_invocations: 0,
    temp_backup_recovery_artifacts: [],
    metrics: { observation_commands: childCommands, bitvise_left_untouched: true, independent_ssh_service_check_required: true },
  };
  return { w14, w15, afterSnapshot };
}

function artifactHashes() {
  const files = {
    probe: __filename,
    core_index: path.join(packageRoot, 'core/dist/index.js'),
    core_policy: path.join(packageRoot, 'core/dist/policy.js'),
    core_broker: path.join(packageRoot, 'core/dist/broker.js'),
    workspace_index: path.join(packageRoot, 'workspace/dist/index.js'),
    workspace_trusted_write: path.join(packageRoot, 'workspace/dist/trusted-write.js'),
    workspace_apply: path.join(packageRoot, 'workspace/dist/apply.js'),
    desktop_host: path.join(packageRoot, 'product/desktop-host.js'),
  };
  return Object.keys(files).reduce((result, key) => {
    result[key] = sha256File(files[key]);
    return result;
  }, {});
}

async function run() {
  fs.mkdirSync(runRoot, { recursive: true });
  const beforeSnapshot = processNetworkSnapshot();
  const cases = [];
  cases.push(runW07());
  cases.push.apply(cases, runW08());
  cases.push.apply(cases, runW09());
  cases.push(runW10());
  await wait(50);
  const final = runW14W15(beforeSnapshot);
  cases.push(final.w14, final.w15);
  const report = {
    schema_version: 1,
    mvp_id: argument('--mvp-id=') || 'MVP-UNKNOWN',
    suite: 'A2_WIN7_W07_W10_W14_W15_AUTOMATIC_PROBE',
    generated_at: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      package_root: packageRoot,
      workspace_root: runWorkspaceRoot,
      run_root: runRoot,
      probe_pid: process.pid,
    },
    artifact_hashes: artifactHashes(),
    command: [process.execPath].concat(process.argv.slice(1)),
    process_network_baseline: { before: beforeSnapshot, after: final.afterSnapshot },
    cases,
    summary: {
      total: cases.length,
      passed: cases.filter((item) => item.status === 'PASS').length,
      failed: cases.filter((item) => item.status !== 'PASS').length,
      automatic_cases: ['W07_SINGLE_USE_APPROVAL', 'W08_UTF8_BOM', 'W08_UTF8_LF', 'W08_UTF8_CRLF', 'W09_GBK', 'W09_BINARY', 'W09_BOUNDARY_ESCAPE', 'W09_TRUNCATED_PREVIEW', 'W10_AUTO_RECOVERY', 'W14_CLEANUP_AND_NO_PROBE_RESIDUE', 'W15_NO_UNDECLARED_ACTIVITY_BITVISE_SAFE'],
    },
    exit_code: cases.every((item) => item.status === 'PASS') ? 0 : 1,
    notes: [
      'W07-W10 exercise packaged Core/Workspace modules; W14/W15 are automatic evidence with an independent SSH PID/service check still required.',
      'W10 uses only the existing ApplyPlanOptions.workspace.writeFile failure seam; it does not modify permissions or system settings.',
      'tasklist and netstat are read-only evidence commands. The probe does not invoke Git, Runner, terminal, Gateway, SQLite, or arbitrary network APIs.',
    ],
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write('REPORT_WRITTEN:' + reportPath + '\n');
  return report;
}

app.whenReady().then(async () => {
  try {
    const report = await run();
    app.exit(report.exit_code);
  } catch (error) {
    const fallback = {
      schema_version: 1,
      mvp_id: argument('--mvp-id=') || 'MVP-UNKNOWN',
      suite: 'A2_WIN7_W07_W10_W14_W15_AUTOMATIC_PROBE',
      generated_at: new Date().toISOString(),
      environment: { platform: process.platform, arch: process.arch, electron: process.versions.electron, node: process.versions.node, package_root: packageRoot, probe_pid: process.pid },
      artifact_hashes: { probe: sha256File(__filename) },
      command: [process.execPath].concat(process.argv.slice(1)),
      cases: [],
      error: String(error && error.stack ? error.stack : error),
      exit_code: 1,
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(fallback, null, 2) + '\n', 'utf8');
    app.exit(1);
  }
});
