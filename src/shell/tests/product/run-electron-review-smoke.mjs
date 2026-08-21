#!/usr/bin/env node

import childProcess from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assertEvidenceOutsideCandidate,
  bindCandidate,
  finalizeEvidenceReport,
} from './a8-validation-evidence.mjs';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, '../../../..');

function argument(name, required = true) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix));
  const value = item ? item.slice(prefix.length) : '';
  if (required && !value) throw new Error(`Missing required ${prefix}<path>`);
  return value;
}

function requireFile(filePath, label) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`${label}_NOT_FOUND:${resolved}`);
  return resolved;
}

function requireDirectory(directoryPath, label) {
  const resolved = path.resolve(directoryPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error(`${label}_NOT_FOUND:${resolved}`);
  return resolved;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function verifyArtifactHashes(product, evidence) {
  const expectedFiles = {
    main_js: path.join(product, 'main.js'),
    preload_js: path.join(product, 'preload.js'),
    desktop_host_js: path.join(product, 'desktop-host.js'),
    a8_product_ipc_js: path.join(product, 'a8-product-ipc.js'),
    gateway_runtime_js: path.join(product, 'gateway-runtime.js'),
    renderer_html: path.join(product, 'renderer/index.html'),
    renderer_js: path.join(product, 'renderer/renderer.js'),
    renderer_css: path.join(product, 'renderer/styles.css'),
    renderer_a8_css: path.join(product, 'renderer/a8-workspace.css'),
  };
  const reported = evidence && evidence.artifact_hashes;
  if (!reported || typeof reported !== 'object') throw new Error('A8_ELECTRON_REVIEW_ARTIFACT_HASHES_MISSING');
  Object.entries(expectedFiles).forEach(([name, filePath]) => {
    const expected = sha256File(requireFile(filePath, `PRODUCT_${name.toUpperCase()}`));
    if (reported[name] !== expected) throw new Error(`A8_ELECTRON_REVIEW_ARTIFACT_HASH_MISMATCH:${name}`);
  });
}

function main() {
  const electron = requireFile(argument('electron'), 'ELECTRON');
  const product = requireDirectory(argument('product', false) || path.join(repositoryRoot, 'src/shell/product'), 'PRODUCT');
  const report = path.resolve(argument('report'));
  const screenshot = path.resolve(argument('screenshot'));
  const validationLayer = argument('validation-layer', false) || 'developer';
  const candidateRootValue = argument('candidate-root', false);
  const binding = candidateRootValue ? bindCandidate({
    candidateRoot: candidateRootValue,
    manifestPath: argument('manifest', false),
    expectedManifestSha256: argument('expected-manifest-sha256', false),
    expectedCandidateId: argument('expected-candidate-id', false),
  }) : null;
  if (validationLayer !== 'developer' && !binding) throw new Error('A8_FORMAL_EVIDENCE_CANDIDATE_BINDING_REQUIRED');
  if (validationLayer !== 'developer' && binding.manifest.source_dirty === true) throw new Error('A8_FORMAL_CANDIDATE_SOURCE_DIRTY');
  if (validationLayer !== 'developer' && !argument('operator', false)) throw new Error('A8_FORMAL_EVIDENCE_OPERATOR_REQUIRED');
  if (binding) {
    if (electron !== path.join(binding.candidateRoot, 'electron.exe')) throw new Error('A8_ELECTRON_REVIEW_RUNTIME_ROOT_MISMATCH');
    if (product !== path.join(binding.candidateRoot, 'resources', 'app', 'product')) throw new Error('A8_ELECTRON_REVIEW_PRODUCT_ROOT_MISMATCH');
    assertEvidenceOutsideCandidate(binding.candidateRoot, report);
    assertEvidenceOutsideCandidate(binding.candidateRoot, screenshot);
  }
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'win7-a8-review-smoke-'));
  const workspace = path.join(runRoot, 'workspace');
  const userData = path.join(runRoot, 'user-data');
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.mkdirSync(path.dirname(screenshot), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src/app.ts'), 'export const value = "before";\r\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'docs/obsolete.md'), '# Keep this rejected file\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'src/drift-a.ts'), 'export const driftA = "before";\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'src/drift-b.ts'), 'export const driftB = "before";\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'src/recovery-a.ts'), 'export const recoveryA = "before";\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'src/recovery-b.ts'), 'export const recoveryB = "before";\n', 'utf8');

  const args = [
    product,
    '--mvp-id=A8-03-ELECTRON-REVIEW',
    `--a8-review-smoke-report=${report}`,
    `--a8-review-smoke-workspace=${workspace}`,
    `--a8-review-smoke-screenshot=${screenshot}`,
    `--user-data-dir=${userData}`,
    '--smoke-timeout-ms=60000',
  ];
  const result = childProcess.spawnSync(electron, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 90_000,
    windowsHide: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`A8_ELECTRON_REVIEW_SMOKE_EXIT_${result.status}`);
  if (!fs.existsSync(report)) throw new Error('A8_ELECTRON_REVIEW_REPORT_MISSING');
  if (!fs.existsSync(screenshot)) throw new Error('A8_ELECTRON_REVIEW_SCREENSHOT_MISSING');
  const evidence = JSON.parse(fs.readFileSync(report, 'utf8'));
  if (evidence.status !== 'PASS') throw new Error(`A8_ELECTRON_REVIEW_REPORT_${evidence.status || 'INVALID'}`);
  verifyArtifactHashes(product, evidence);
  if (!Array.isArray(evidence.cases) || evidence.cases.length < 8 || evidence.cases.some((item) => item.status !== 'PASS')) {
    throw new Error('A8_ELECTRON_REVIEW_CASE_MATRIX_INVALID');
  }
  if (fs.statSync(screenshot).size < 1024) throw new Error('A8_ELECTRON_REVIEW_SCREENSHOT_INVALID');
  fs.rmSync(runRoot, { recursive: true, force: true });
  const finalized = finalizeEvidenceReport(evidence, {
    binding,
    validationLayer,
    operatorId: argument('operator', false),
    environment: evidence.environment,
    temporaryRoot: runRoot,
    cleanupStatus: 'REMOVED_AFTER_PASS',
    developerCandidateId: 'A8-03-DEVELOPER-SOURCE-TREE',
    expectedCaseIds: [
      'A8R-01-02-ELECTRON-REVIEW',
      'A8C-02-FORGED-APPROVAL',
      'A8R-04-BASELINE-DRIFT-ZERO-WRITE',
      'A8R-05-RECOVERY-RENDERER',
    ],
  });
  finalized.evidence_artifacts = { screenshot_path: screenshot, screenshot_sha256: sha256File(screenshot), screenshot_size: fs.statSync(screenshot).size };
  fs.writeFileSync(report, `${JSON.stringify(finalized, null, 2)}\n`, 'utf8');
  process.stdout.write(JSON.stringify({
    status: 'PASS',
    candidate_id: finalized.candidate_id,
    candidate_manifest_sha256: finalized.candidate_manifest_sha256,
    electron: finalized.runtime_profile.electron,
    node_abi: finalized.runtime_profile.node_abi,
    evidence_class: finalized.evidence_class,
    report,
    screenshot,
    case_count: finalized.cases.length,
  }) + '\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`A8_ELECTRON_REVIEW_SMOKE_RUNNER_FAILED:${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
}
