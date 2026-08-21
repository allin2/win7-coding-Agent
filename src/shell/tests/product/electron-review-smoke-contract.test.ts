import * as fs from 'fs';
import * as path from 'path';

describe('A8 real Electron Review smoke contract', () => {
  const productRoot = path.join(__dirname, '../../product');
  const main = fs.readFileSync(path.join(productRoot, 'main.js'), 'utf8');
  const runner = fs.readFileSync(path.join(__dirname, 'run-electron-review-smoke.mjs'), 'utf8');

  it('binds an isolated three-file journey to the production BrowserWindow and IPC entry', () => {
    [
      '--a8-review-smoke-report=',
      '--a8-review-smoke-workspace=',
      '--a8-review-smoke-screenshot=',
      "scenario: 'review'",
      "operation: 'MODIFY'",
      "operation: 'CREATE'",
      "operation: 'DELETE'",
      "{ key: 'modify', relativePath: 'src/app.ts', actionId: 'review-accept', expected: 'ACCEPTED' }",
      "{ key: 'delete', relativePath: 'docs/obsolete.md', actionId: 'review-reject', expected: 'REJECTED' }",
      "document.getElementById('review-validation-not-run')",
      "window.win7Agent.applyReview",
      "forgedApproval.error.code === 'APPROVAL_INVALID'",
      "resultCase('A8R-04-BASELINE-DRIFT-ZERO-WRITE'",
      "resultCase('A8R-05-RECOVERY-RENDERER'",
      "a8ReviewSmokeFailureMode === 'verify-and-rollback'",
      'artifact_hashes: a8ReviewArtifactHashes()',
      'system_version: os.release()',
      'mainWindow.webContents.capturePage()',
    ].forEach((fragment) => expect(main).toContain(fragment));
  });

  it('uses structured argv, a unique temporary root and explicit PASS evidence', () => {
    expect(runner).toContain('fs.mkdtempSync');
    expect(runner).toContain('childProcess.spawnSync(electron, args');
    expect(runner).toContain("if (evidence.status !== 'PASS')");
    expect(runner).toContain('verifyArtifactHashes(product, evidence)');
    expect(runner).toContain('bindCandidate({');
    expect(runner).toContain('assertEvidenceOutsideCandidate(binding.candidateRoot, report)');
    expect(runner).toContain('finalizeEvidenceReport(evidence');
    expect(runner).toContain('candidate_manifest_sha256');
    expect(runner).toContain('A8_ELECTRON_REVIEW_CASE_MATRIX_INVALID');
    expect(runner).toContain('A8_ELECTRON_REVIEW_SCREENSHOT_INVALID');
    expect(runner).toContain("fs.rmSync(runRoot, { recursive: true, force: true })");
    expect(runner).not.toContain('execSync');
    expect(runner).not.toContain('shell: true');
  });
});
