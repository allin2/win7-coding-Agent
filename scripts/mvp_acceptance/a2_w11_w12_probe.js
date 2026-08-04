'use strict';

// Packaged Desktop Alpha 2 W11/W12 acceptance probe.
// W11 is fully automatic. W12 deliberately leaves a versioned interrupted
// transaction for the user to inspect after a real GUI restart and restore.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const packageRoot = path.resolve(__dirname, '../..');
const workspace = require(path.join(packageRoot, 'workspace/dist'));
const workspaceRoot = path.resolve(argument('--workspace=') || path.join(__dirname, 'workspace'));
const reportPath = path.resolve(argument('--report=') || path.join(__dirname, 'A2-W11-W12-report.json'));
const w12UserDataRoot = path.resolve(argument('--w12-user-data=') || path.join(workspaceRoot, 'w12-user-data'));
const runRoot = path.join(workspaceRoot, 'a2-w11-w12-run-' + Date.now() + '-' + process.pid);

function argument(prefix) {
  const item = process.argv.find((value) => value.indexOf(prefix) === 0);
  return item ? item.slice(prefix.length) : null;
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256File(filePath) { return sha256(fs.readFileSync(filePath)); }
function writeFile(filePath, bytes) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, bytes); }

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

function intent(root, callId) {
  return {
    workspaceRoot: root,
    path: 'src/hello.ts',
    oldText: 'export const hello = "world";',
    newText: 'export const hello = "world"; // W11 injected failure',
    sessionId: 'a2-w11-w12', taskId: callId, turnId: callId, callId,
  };
}

function issueApproval(coordinator, plan) {
  return coordinator.issueApproval(plan, {
    planId: plan.planId, taskId: plan.taskId, turnId: plan.turnId, callId: plan.callId,
    planHash: plan.planHash, sessionId: plan.sessionId, subject: 'a2-w11-w12-probe',
    previewSha256: plan.previewSha256, baselineSha256: plan.baseSha256,
  });
}

function runW11() {
  const root = path.join(runRoot, 'w11-rollback-lock');
  const target = path.join(root, 'src', 'hello.ts');
  const recovery = path.join(root, 'recovery');
  const beforeBytes = Buffer.from('export const hello = "world";\r\n', 'utf8');
  writeFile(target, beforeBytes);
  const before = sha256File(target);
  const preparer = new workspace.TrustedWritePreparer();
  const coordinator = new workspace.WriteTransactionCoordinator(root, recovery, {
    workspace: { writeFile: () => { throw new Error('W11 injected post-replace failure'); } },
    restoreBackup: () => { throw new Error('W11 injected rollback failure'); },
  });
  const plan = preparer.prepare(intent(root, 'w11-call'));
  const approval = issueApproval(coordinator, plan);
  const failedApply = coordinator.apply(plan, approval);
  const pending = coordinator.getPendingRecovery();
  let lockError = null;
  try { coordinator.issueApproval(plan, approval); } catch (error) { lockError = error && error.code ? String(error.code) : String(error); }
  const failedSha = sha256File(target);
  const restored = coordinator.restorePending();
  const finalSha = sha256File(target);
  const artifacts = unsafeArtifacts(root);
  const passed = !failedApply.success && failedApply.rollbackStatus === 'failed'
    && coordinator.getPendingRecovery() === undefined && restored.restored
    && lockError === 'WORKSPACE_WRITE_LOCKED' && finalSha === before && artifacts.length === 0;
  return {
    case_id: 'W11_ROLLBACK_FAILURE_LOCK', status: passed ? 'PASS' : 'FAIL',
    expected: 'rollback failure locks writes, exposes rollback_failed recovery, manual restore clears lock and restores original',
    actual: {
      apply_success: failedApply.success,
      rollback_status: failedApply.rollbackStatus,
      lock_error_code: lockError,
      pending_phase_before_manual_restore: pending && pending.phase,
      manual_restore: restored,
      lock_after_manual_restore: coordinator.isLocked(),
    },
    file_evidence: {
      path: target, before_sha256: before, after_injected_failure_sha256: failedSha,
      final_sha256: finalSha, restored_to_original: finalSha === before,
      unsafe_artifacts: artifacts, clean: artifacts.length === 0,
    },
    executor_invocations: 1,
    notes: ['Failure and rollback seams are existing test seams; no system permissions were changed.'],
  };
}

function runW12() {
  const root = path.join(workspaceRoot, 'A2-W12-restart-recovery-workspace');
  const target = path.join(root, 'src', 'hello.ts');
  const recovery = path.join(w12UserDataRoot, 'a2-recovery');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(w12UserDataRoot, { recursive: true, force: true });
  const original = Buffer.from('export const hello = "world";\r\n', 'utf8');
  const interrupted = Buffer.from('export const hello = "world"; // W12 interrupted\r\n', 'utf8');
  writeFile(target, interrupted);
  const backupPath = target + '.bak';
  writeFile(backupPath, original);
  const originalSha = sha256(original);
  const targetSha = sha256(interrupted);
  const manifest = {
    schemaVersion: '1.0', transactionId: 'txn_w12_interrupted', planId: 'w12-plan',
    workspaceRoot: root, targetPath: target, originalSha256: originalSha,
    targetSha256: targetSha, backupPath, phase: 'replacing', createdAt: new Date().toISOString(),
  };
  writeFile(path.join(recovery, 'a2-write-recovery.json'), Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'));
  const freshCoordinator = new workspace.WriteTransactionCoordinator(root, recovery);
  const pending = freshCoordinator.getPendingRecovery();
  const artifacts = unsafeArtifacts(root).concat(unsafeArtifacts(w12UserDataRoot)).sort();
  const prepared = Boolean(pending && pending.phase === 'replacing' && pending.targetPath === target);
  return {
    case_id: 'W12_RESTART_RECOVERY_FIXTURE', status: prepared ? 'BLOCKED' : 'FAIL',
    expected: 'fresh Coordinator detects versioned interrupted recovery without auto-writing; user must restart GUI and click restore',
    actual: { pending_detected: prepared, phase: pending && pending.phase, auto_restore: false },
    file_evidence: {
      path: target, before_manual_restore_sha256: sha256File(target),
      expected_original_sha256: originalSha, expected_interrupted_target_sha256: targetSha,
      recovery_manifest_path: path.join(recovery, 'a2-write-recovery.json'),
      unsafe_artifacts: artifacts, manual_restore_required: true,
    },
    executor_invocations: 0,
    manual_next: {
      workspace_root: root,
      user_data_root: w12UserDataRoot,
      action: 'restart Desktop Alpha 2, confirm recovery page, then click 恢复原文件',
    },
    notes: ['This is intentionally not marked PASS before a real GUI restart and user restore.'],
  };
}

function prepareW11GuiFixture() {
  const root = path.resolve(argument('--w11-gui-workspace=') || path.join(workspaceRoot, 'A2-W11-GUI-workspace'));
  const userDataRoot = path.resolve(argument('--w11-gui-user-data=') || path.join(workspaceRoot, 'w11-gui-user-data'));
  const target = path.join(root, 'src', 'hello.ts');
  const recovery = path.join(userDataRoot, 'a2-recovery');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(userDataRoot, { recursive: true, force: true });
  const original = Buffer.from('export const hello = "world";\r\n', 'utf8');
  const interrupted = Buffer.from('export const hello = "world"; // W11 rollback failed\r\n', 'utf8');
  writeFile(target, interrupted);
  const backupPath = target + '.bak';
  writeFile(backupPath, original);
  const manifestStore = new workspace.RecoveryManifestStore(recovery);
  manifestStore.save({
    schemaVersion: '1.0', transactionId: 'txn_w11_gui_rollback_failed', planId: 'w11-gui-plan',
    workspaceRoot: root, targetPath: target, originalSha256: sha256(original),
    targetSha256: sha256(interrupted), backupPath, phase: 'rollback_failed', createdAt: new Date().toISOString(),
  });
  const coordinator = new workspace.WriteTransactionCoordinator(root, recovery);
  const pending = coordinator.getPendingRecovery();
  return {
    case_id: 'W11_GUI_ROLLBACK_FAILURE_LOCK', status: pending && pending.phase === 'rollback_failed' ? 'BLOCKED' : 'FAIL',
    expected: 'real GUI displays rollback_failed, explicitly states writes are locked, and shows manual restore guidance without claiming rollback completed',
    actual: { pending_detected: Boolean(pending), phase: pending && pending.phase, auto_restore: false },
    file_evidence: {
      path: target, interrupted_sha256: sha256File(target), original_sha256: sha256(original),
      recovery_manifest_path: path.join(recovery, 'a2-write-recovery.json'), unsafe_artifacts: unsafeArtifacts(root),
    },
    executor_invocations: 0,
    manual_next: {
      workspace_root: root, user_data_root: userDataRoot,
      action: 'restart Desktop Alpha 2, create a session, confirm the W11 lock and recovery guidance, then click 恢复原文件',
    },
    notes: ['This fixture is isolated and intentionally remains pending until the real GUI check and user restore.'],
  };
}

async function main() {
  fs.rmSync(runRoot, { recursive: true, force: true });
  fs.mkdirSync(runRoot, { recursive: true });
  let cases;
  try { cases = process.argv.includes('--prepare-w11-gui') ? [prepareW11GuiFixture()] : [runW11(), runW12()]; } catch (error) {
    cases = [{ case_id: 'W11_W12_PROBE', status: 'FAIL', expected: 'probe completes', actual: { error: String(error && error.stack || error) } }];
  }
  const failed = cases.some((item) => item.status === 'FAIL');
  const report = {
    schema_version: 1, mvp_id: argument('--mvp-id=') || 'A2-W11-W12-20260804',
    suite: 'A2_WIN7_W11_W12_PACKAGED_PROBE', generated_at: new Date().toISOString(),
    environment: { platform: process.platform, arch: process.arch, electron: process.versions.electron, node: process.versions.node, package_root: packageRoot, workspace_root: workspaceRoot, run_root: runRoot },
    command: process.argv.slice(1), cases,
    summary: { total: cases.length, passed: cases.filter((item) => item.status === 'PASS').length, blocked: cases.filter((item) => item.status === 'BLOCKED').length, failed: cases.filter((item) => item.status === 'FAIL').length },
    exit_code: failed ? 1 : 0,
    notes: [process.argv.includes('--prepare-w11-gui') ? 'W11 GUI fixture intentionally remains BLOCKED until a real GUI check and user-controlled restore.' : 'W12 intentionally remains BLOCKED until a real GUI restart and user-controlled restore.', 'No Runner, Git, terminal, Gateway, SQLite or system configuration was used.'],
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  app.exit(report.exit_code);
}

app.whenReady().then(main);
