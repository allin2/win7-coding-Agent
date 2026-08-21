import * as fs from 'fs';
import * as path from 'path';

describe('A8-04 Terminal/Browser, Runner and Settings/Diagnostics boundary contract', () => {
  const productRoot = path.join(__dirname, '../../product');
  const main = fs.readFileSync(path.join(productRoot, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(productRoot, 'preload.js'), 'utf8');
  const html = fs.readFileSync(path.join(productRoot, 'renderer/index.html'), 'utf8');
  const runner = fs.readFileSync(path.join(__dirname, 'run-electron-a8-04-boundary-smoke.mjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(productRoot, 'renderer/renderer.js'), 'utf8');
  const securityPolicy = fs.readFileSync(path.join(productRoot, 'security-policy.js'), 'utf8');

  it('keeps Terminal and Browser disabled in the production navigation surface', () => {
    expect(html).toContain('Terminal <i>禁用</i>');
    expect(html).toContain('Browser <i>禁用</i>');
    expect(html).toContain('交互终端未授权');
    expect(html).toContain('任意公网浏览未授权');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(preload).not.toMatch(/terminal|pty|stdin|openUrl|navigate/i);
  });

  it('exposes only the bounded Runner/Settings/Diagnostics IPC surface', () => {
    expect(preload).toContain('getDiagnostics');
    expect(preload).toContain('getSettings');
    expect(preload).toContain('setSettings');
    expect(preload).not.toMatch(/\b(exec|spawn|shell|terminal|browser|navigate)\b/i);
    expect(main).toContain('a8BoundarySmokeReportPath');
    expect(main).toContain("resultCase('A8R-08-RUNNER-PRESENTATION'");
    expect(main).toContain("resultCase('A8R-09-RUNNER-LOG-BOUNDARY'");
    expect(main).toContain("resultCase('A8D-01-SETTINGS-REDACTION'");
    expect(main).toContain("resultCase('A8D-02-DIAGNOSTICS-SYSTEM-PROMPT'");
    expect(main).toContain("resultCase('A8C-04-IPC-TERMINAL-FAIL-CLOSED'");
    expect(main).toContain('system_version: os.release()');
  });

  it('keeps Renderer outbound and window capabilities deny-by-default', () => {
    expect(securityPolicy).toContain('setWindowOpenHandler');
    expect(renderer).not.toMatch(/window\.open|location\.assign|fetch\(|WebSocket\(/);
  });

  it('runs a real Electron boundary report with structured argv and locked artifact hashes', () => {
    expect(runner).toContain('fs.mkdtempSync');
    expect(runner).toContain('childProcess.spawnSync(electron, args');
    expect(runner).toContain('verifyArtifactHashes(product, evidence)');
    expect(runner).toContain('bindCandidate({');
    expect(runner).toContain('assertEvidenceOutsideCandidate(binding.candidateRoot, report)');
    expect(runner).toContain('finalizeEvidenceReport(evidence');
    expect(runner).toContain('candidate_manifest_sha256');
    expect(runner).toContain('evidence.cases.length !== 8');
    expect(runner).toContain('A8_BOUNDARY_SCREENSHOT_INVALID');
    expect(runner).toContain("fs.rmSync(runRoot, { recursive: true, force: true })");
    expect(runner).not.toContain('execSync');
    expect(runner).not.toContain('shell: true');
  });
});
