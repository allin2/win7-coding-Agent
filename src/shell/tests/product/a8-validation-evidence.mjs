import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export const A8_EVIDENCE_SCHEMA_VERSION = 2;
export const A8_EVIDENCE_RESULT_VALUES = Object.freeze([
  'PASS',
  'FAIL',
  'PARTIAL',
  'NOT_RUN',
  'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE',
]);
export const A8_EVIDENCE_REQUIRED_FIELDS = Object.freeze([
  'schema_version',
  'record_id',
  'status',
  'candidate_id',
  'candidate_manifest_sha256',
  'runtime_profile',
  'cases',
  'external_validation',
  'cleanup',
  'operator',
  'recorded_at',
]);

const TARGET_RUNTIME = Object.freeze({
  platform: 'win32',
  arch: 'x64',
  electron: '22.3.27',
  node: '16.17.1',
  node_abi: 110,
});

function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function selectCandidateFileSystem(runtimeVersions = process.versions, loadOriginalFs = () => require('original-fs')) {
  if (!runtimeVersions || !runtimeVersions.electron) return fs;
  try {
    const physicalFs = loadOriginalFs();
    for (const method of ['existsSync', 'statSync', 'readFileSync', 'readdirSync']) {
      if (!physicalFs || typeof physicalFs[method] !== 'function') throw new Error(`missing_${method}`);
    }
    return physicalFs;
  } catch (error) {
    throw new Error(`A8_PHYSICAL_FILESYSTEM_UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`);
  }
}

const candidateFs = selectCandidateFileSystem();

function sha256File(filePath) {
  return sha256Bytes(candidateFs.readFileSync(filePath));
}

function listFiles(root) {
  const files = [];
  function visit(current, relative) {
    const entries = candidateFs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const item = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`A8_CANDIDATE_SYMLINK_PROHIBITED:${item}`);
      if (entry.isDirectory()) visit(absolute, item);
      else if (entry.isFile()) files.push(item.replace(/\\/g, '/'));
      else throw new Error(`A8_CANDIDATE_SPECIAL_FILE_PROHIBITED:${item}`);
    }
  }
  visit(root, '');
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function requireSha256(value, label) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ''))) throw new Error(`${label}_INVALID`);
  return String(value);
}

function normalizeLayer(value) {
  const layer = String(value || 'developer').toLowerCase();
  if (!['developer', 'win10', 'win7'].includes(layer)) throw new Error(`A8_VALIDATION_LAYER_INVALID:${layer}`);
  return layer;
}

function normalizeRuntime(environment = {}) {
  return {
    platform: String(environment.platform || process.platform),
    arch: String(environment.arch || process.arch),
    electron: environment.electron ? String(environment.electron) : null,
    node: String(environment.node || process.versions.node),
    node_abi: Number(environment.node_abi || process.versions.modules),
    system_version: String(environment.system_version || ''),
  };
}

function assertTargetRuntime(runtime) {
  for (const [key, expected] of Object.entries(TARGET_RUNTIME)) {
    if (runtime[key] !== expected) {
      throw new Error(`A8_TARGET_RUNTIME_MISMATCH:${key}:expected=${expected};actual=${runtime[key]}`);
    }
  }
}

function isTargetRuntime(runtime) {
  return Object.entries(TARGET_RUNTIME).every(([key, expected]) => runtime[key] === expected);
}

function assertValidationLayerOs(runtime, layer) {
  const expected = layer === 'win7' ? /^6\.1(?:\.|$)/ : /^10\./;
  if (!expected.test(runtime.system_version)) {
    throw new Error(`A8_VALIDATION_LAYER_OS_MISMATCH:${layer}:actual=${runtime.system_version || 'unknown'}`);
  }
}

export function assertEvidenceOutsideCandidate(candidateRoot, evidencePath) {
  const root = path.resolve(candidateRoot);
  const target = path.resolve(evidencePath);
  const relative = path.relative(root, target);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error(`A8_EVIDENCE_INSIDE_CANDIDATE_PROHIBITED:${target}`);
  }
  return target;
}

export function bindCandidate(options) {
  const candidateRoot = path.resolve(options.candidateRoot);
  const manifestPath = path.resolve(options.manifestPath || path.join(candidateRoot, 'release-manifest.json'));
  const expectedManifestPath = path.join(candidateRoot, 'release-manifest.json');
  if (manifestPath !== expectedManifestPath) throw new Error('A8_CANDIDATE_MANIFEST_LOCATION_INVALID');
  if (!candidateFs.existsSync(manifestPath) || !candidateFs.statSync(manifestPath).isFile()) throw new Error('A8_CANDIDATE_MANIFEST_MISSING');

  const manifestBytes = candidateFs.readFileSync(manifestPath);
  const manifestSha256 = sha256Bytes(manifestBytes);
  if (options.expectedManifestSha256) {
    const expected = requireSha256(options.expectedManifestSha256, 'A8_EXPECTED_MANIFEST_SHA256');
    if (manifestSha256 !== expected) throw new Error(`A8_CANDIDATE_MANIFEST_SHA256_MISMATCH:expected=${expected};actual=${manifestSha256}`);
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema_version !== 1 || !manifest.release_id || !manifest.version || !Array.isArray(manifest.files)) {
    throw new Error('A8_CANDIDATE_MANIFEST_SCHEMA_INVALID');
  }
  if (options.expectedCandidateId && manifest.release_id !== options.expectedCandidateId) {
    throw new Error(`A8_CANDIDATE_ID_MISMATCH:expected=${options.expectedCandidateId};actual=${manifest.release_id}`);
  }

  const expectedFiles = new Map();
  for (const file of manifest.files) {
    const relativePath = String(file && file.path || '');
    if (!relativePath || relativePath.includes('\\') || path.posix.isAbsolute(relativePath) ||
        path.posix.normalize(relativePath) !== relativePath || relativePath.startsWith('../') || expectedFiles.has(relativePath)) {
      throw new Error(`A8_CANDIDATE_MANIFEST_PATH_INVALID:${relativePath}`);
    }
    expectedFiles.set(relativePath, file);
    const absolute = path.join(candidateRoot, ...relativePath.split('/'));
    if (!candidateFs.existsSync(absolute) || !candidateFs.statSync(absolute).isFile()) throw new Error(`A8_CANDIDATE_FILE_MISSING:${relativePath}`);
    const size = candidateFs.statSync(absolute).size;
    const digest = sha256File(absolute);
    if (size !== file.size || digest !== file.sha256) throw new Error(`A8_CANDIDATE_FILE_MISMATCH:${relativePath}`);
  }

  const allowed = new Set(expectedFiles.keys());
  allowed.add('release-manifest.json');
  for (const relativePath of listFiles(candidateRoot)) {
    if (!allowed.has(relativePath)) throw new Error(`A8_CANDIDATE_UNMANIFESTED_FILE:${relativePath}`);
  }
  if (allowed.size !== expectedFiles.size + 1 || listFiles(candidateRoot).length !== allowed.size) {
    throw new Error('A8_CANDIDATE_FILE_SET_MISMATCH');
  }

  return Object.freeze({
    candidateRoot,
    candidateId: manifest.release_id,
    manifestPath,
    manifestSha256,
    manifest,
  });
}

export function finalizeEvidenceReport(report, options) {
  const layer = normalizeLayer(options.validationLayer);
  const runtime = normalizeRuntime(options.environment);
  const binding = options.binding || null;
  const reportPassed = report.status === 'PASS' && Array.isArray(report.cases) && report.cases.every((item) => item.status === 'PASS');
  if (layer !== 'developer') {
    if (!binding) throw new Error('A8_FORMAL_EVIDENCE_CANDIDATE_BINDING_REQUIRED');
    if (binding.manifest.source_dirty === true) throw new Error('A8_FORMAL_CANDIDATE_SOURCE_DIRTY');
    if (!String(options.operatorId || '').trim()) throw new Error('A8_FORMAL_EVIDENCE_OPERATOR_REQUIRED');
    if (reportPassed) {
      assertTargetRuntime(runtime);
      assertValidationLayerOs(runtime, layer);
    }
  }
  const candidateId = binding ? binding.candidateId : String(options.developerCandidateId || 'A8-DEVELOPER-SOURCE-TREE');
  const externalValidation = {
    electron_22: reportPassed && isTargetRuntime(runtime) ? 'PASS' : (layer === 'developer' ? 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE' : 'FAIL'),
    win10: layer === 'win10' ? (reportPassed && isTargetRuntime(runtime) ? 'PASS' : 'FAIL') : 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE',
    win7: layer === 'win7' ? (reportPassed && isTargetRuntime(runtime) ? 'PASS' : 'FAIL') : 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE',
  };
  const finalized = {
    ...report,
    schema_version: A8_EVIDENCE_SCHEMA_VERSION,
    candidate_id: candidateId,
    candidate_manifest_sha256: binding ? binding.manifestSha256 : null,
    candidate: binding ? {
      release_id: binding.manifest.release_id,
      version: binding.manifest.version,
      source_commit: binding.manifest.source_commit,
      source_dirty: binding.manifest.source_dirty === true,
      manifest_sha256: binding.manifestSha256,
      manifested_file_count: binding.manifest.files.length,
    } : null,
    runtime_profile: runtime,
    external_validation: externalValidation,
    cleanup: {
      temporary_root: String(options.temporaryRoot || ''),
      status: String(options.cleanupStatus || 'PRESERVED_FOR_DIAGNOSIS'),
      candidate_unchanged: Boolean(binding),
    },
    operator: {
      id: String(options.operatorId || 'AUTOMATED_DEVELOPER'),
      mode: 'AUTOMATED',
      validation_layer: layer,
      platform: runtime.platform,
      arch: runtime.arch,
      node: runtime.node,
      electron: runtime.electron,
      node_abi: runtime.node_abi,
    },
    recorded_at: report.recorded_at || new Date().toISOString(),
  };
  validateEvidenceReport(finalized, { validationLayer: layer, expectedCaseIds: options.expectedCaseIds });
  return finalized;
}

export function validateEvidenceReport(report, options = {}) {
  if (!report || typeof report !== 'object') throw new Error('A8_EVIDENCE_REPORT_INVALID');
  for (const field of A8_EVIDENCE_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(report, field)) throw new Error(`A8_EVIDENCE_FIELD_MISSING:${field}`);
  }
  if (report.schema_version !== A8_EVIDENCE_SCHEMA_VERSION) throw new Error('A8_EVIDENCE_SCHEMA_VERSION_INVALID');
  if (!Array.isArray(report.cases) || report.cases.length === 0) throw new Error('A8_EVIDENCE_CASES_INVALID');
  for (const item of report.cases) {
    if (!item || !item.id || !A8_EVIDENCE_RESULT_VALUES.includes(item.status)) throw new Error('A8_EVIDENCE_CASE_INVALID');
  }
  for (const expectedCaseId of options.expectedCaseIds || []) {
    if (!report.cases.some((item) => item.id === expectedCaseId)) throw new Error(`A8_EVIDENCE_CASE_MISSING:${expectedCaseId}`);
  }
  const layer = normalizeLayer(options.validationLayer || report.operator.validation_layer);
  if (layer !== 'developer') {
    requireSha256(report.candidate_manifest_sha256, 'A8_EVIDENCE_MANIFEST_SHA256');
    if (report.status === 'PASS') {
      if (report.external_validation[layer] !== 'PASS' || report.external_validation.electron_22 !== 'PASS') {
        throw new Error(`A8_EVIDENCE_EXTERNAL_LAYER_NOT_PASS:${layer}`);
      }
      assertTargetRuntime(normalizeRuntime(report.runtime_profile));
      assertValidationLayerOs(normalizeRuntime(report.runtime_profile), layer);
    }
  }
  return report;
}
