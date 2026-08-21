import * as fs from 'fs';
import * as path from 'path';

describe('A8-05 persistence, recovery and migration production wiring', () => {
  const root = path.join(__dirname, '../../product');
  const host = fs.readFileSync(path.join(root, 'desktop-host.js'), 'utf8');
  const composition = fs.readFileSync(path.join(root, 'rc-composition.js'), 'utf8');
  const state = fs.readFileSync(path.join(__dirname, '../../../state/src/a8-persistence.ts'), 'utf8');
  const smoke = fs.readFileSync(path.join(__dirname, 'run-a8-05-persistence-smoke.mjs'), 'utf8');
  const electronRunner = fs.readFileSync(path.join(__dirname, 'run-a8-05-electron-smoke.mjs'), 'utf8');
  const evidence = fs.readFileSync(path.join(__dirname, 'a8-validation-evidence.mjs'), 'utf8');
  const evidenceSet = fs.readFileSync(path.join(__dirname, 'verify-a8-evidence-set.mjs'), 'utf8');

  it('hydrates durable Session/Goal projections and records task/review transitions', () => {
    expect(host).toContain('sessionCatalog.listSessions()');
    expect(host).toContain('sessionCatalog.listTasks(sessionId)');
    expect(host).toContain('persistTaskState(task, explicitState, data)');
    expect(host).toContain('sessionCatalog.persistReview');
    expect(host).toContain('sessionCatalog.persistReviewFiles');
    expect(host).toContain('sessionCatalog.persistValidation');
    expect(host).toContain('persistenceRecovery: config.recoveryReport || null');
  });

  it('runs A8 recovery before constructing the product Runner and fails closed', () => {
    expect(composition).toContain('new stateModule.A8PersistentCatalog');
    expect(composition).toContain('new stateModule.A8RecoveryCoordinator(sessionCatalog).recover()');
    expect(composition).toContain('A8_RECOVERY_READ_ONLY');
    expect(composition.indexOf('A8RecoveryCoordinator')).toBeLessThan(composition.indexOf('runner = createProductRunner'));
    expect(composition).not.toContain('sessionCatalog.recoverAndResume');
  });

  it('interrupts only executing states and keeps bounded, hash-checked entities', () => {
    expect(state).toContain("const RECOVERABLE_TASK_STATES: A8PersistedTaskState[] = ['PLANNING', 'EXECUTING', 'VERIFYING', 'APPLYING']");
    expect(state).toContain('a8_schema_version');
    expect(state).toContain('persistReviewFiles');
    expect(state).toContain('SENSITIVE_DATA_BLOCKED');
    expect(state).toContain('fs.renameSync(tempRoot, path.join(targetRoot, \'a8-state-v1\'))');
    expect(state).toContain('fsyncDirectory(targetRoot)');
  });

  it('ships a deterministic source-locked persistence smoke entry for D-014 validation', () => {
    expect(smoke).toContain('--require-d014');
    expect(smoke).toContain("process.versions.electron !== '22.3.27'");
    expect(smoke).toContain('Number(process.versions.modules) !== 110');
    expect(smoke).toContain('A8_FORMAL_D014_REQUIRED');
    expect(smoke).toContain('system_version: os.release()');
    expect(smoke).toContain('bindCandidate({');
    expect(smoke).toContain('finalizeEvidenceReport({');
    expect(smoke).toContain('D-014-E22-SQLITE343-LOCAL-SSD');
    expect(smoke).toContain('A8P-03-REVIEW-DRIFT');
    expect(smoke).toContain('A8M-03-MIGRATION-RETRY');
    expect(smoke).toContain('A8C-01-SENSITIVE-DATA-BLOCK');
    expect(smoke).not.toContain('execSync');
    expect(smoke).not.toContain('shell: true');
  });

  it('launches D-014 with packaged Electron ABI 110 and binds the complete evidence set', () => {
    expect(electronRunner).toContain("ELECTRON_RUN_AS_NODE: '1'");
    expect(electronRunner).toContain("NODE_OPTIONS: ''");
    expect(electronRunner).toContain('childProcess.spawnSync(electron, childArguments');
    expect(electronRunner).toContain('--expected-manifest-sha256=');
    expect(electronRunner).toContain("evidence.storage_profile !== 'D-014-E22-SQLITE343-LOCAL-SSD'");
    expect(evidence).toContain("'candidate_manifest_sha256'");
    expect(evidence).toContain('A8_CANDIDATE_UNMANIFESTED_FILE');
    expect(evidence).toContain('A8_FORMAL_CANDIDATE_SOURCE_DIRTY');
    expect(evidence).toContain('A8_VALIDATION_LAYER_OS_MISMATCH');
    expect(evidenceSet).toContain('A8_EVIDENCE_CANDIDATE_MISMATCH');
    expect(evidenceSet).toContain('source_dirty: false');
    expect(electronRunner).not.toContain('shell: true');
  });
});
