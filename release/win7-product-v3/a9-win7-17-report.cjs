'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function physicalFs() {
  if (!process.versions.electron) return fs;
  const original = require('original-fs');
  for (const name of ['existsSync', 'readFileSync', 'realpathSync', 'statSync']) {
    if (typeof original[name] !== 'function') throw new Error(`A9_W17_PHYSICAL_FS_MISSING:${name}`);
  }
  return original;
}

function argumentsOf(argv) {
  const values = { command: argv[0] || '' };
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`A9_W17_ARGUMENT_INVALID:${item}`);
    const equal = item.indexOf('=');
    if (equal > 2) values[item.slice(2, equal)] = item.slice(equal + 1);
    else {
      if (index + 1 >= argv.length) throw new Error(`A9_W17_ARGUMENT_VALUE_MISSING:${item}`);
      values[item.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return values;
}

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function sha256File(filePath, fileSystem) { return sha256(fileSystem.readFileSync(filePath)); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function assert(condition, code) { if (!condition) throw new Error(code); }
function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function requiredFile(value, label, fileSystem) {
  assert(typeof value === 'string' && value.length > 0, `A9_W17_${label}_REQUIRED`);
  const resolved = fileSystem.realpathSync(path.resolve(value));
  assert(fileSystem.statSync(resolved).isFile(), `A9_W17_${label}_NOT_FILE`);
  return resolved;
}
function rejectSecretMaterial(value) {
  const serialized = JSON.stringify(value);
  assert(!/(?:Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{8,})/i.test(serialized), 'A9_W17_REPORT_SECRET_MATERIAL');
  const walk = (item) => {
    if (!plain(item) && !Array.isArray(item)) return;
    if (plain(item)) {
      for (const key of Object.keys(item)) {
        assert(!/^(?:api[_-]?key|authorization|password|secret|credential)$/i.test(key), `A9_W17_REPORT_SECRET_FIELD:${key}`);
        walk(item[key]);
      }
    } else item.forEach(walk);
  };
  walk(value);
}

function identityFrom(options, fileSystem) {
  const zipPath = requiredFile(options.zip, 'ZIP', fileSystem);
  const manifestPath = requiredFile(options['release-manifest'], 'MANIFEST', fileSystem);
  const manifest = JSON.parse(fileSystem.readFileSync(manifestPath, 'utf8'));
  assert(manifest.release_id && manifest.version && manifest.source_commit, 'A9_W17_MANIFEST_IDENTITY_INVALID');
  return {
    release_id: manifest.release_id,
    version: manifest.version,
    source_commit: manifest.source_commit,
    package_filename: path.basename(zipPath),
    package_sha256: sha256File(zipPath, fileSystem),
    manifest_sha256: sha256File(manifestPath, fileSystem),
  };
}

function template(kit, identity) {
  return {
    schema_version: 1,
    report_kind: 'WIN7_17_INCREMENTAL_ACCEPTANCE',
    candidate: identity,
    status: 'NOT_PERFORMED',
    results: kit.incremental_win7_cases.map((validationCase) => ({
      case_id: validationCase.case_id,
      status: 'NOT_PERFORMED',
      executions: [],
    })),
  };
}

function validateEvidence(execution, evidenceRoot, fileSystem) {
  assert(plain(execution.environment), 'A9_W17_ENVIRONMENT_REQUIRED');
  const environment = execution.environment;
  for (const field of ['windows_version', 'architecture', 'token_kind', 'elevation', 'dpi', 'shell_profile']) {
    assert(typeof environment[field] === 'string' && environment[field].length > 0, `A9_W17_ENVIRONMENT_${field.toUpperCase()}_REQUIRED`);
  }
  assert(environment.architecture.toLowerCase() === 'x64', 'A9_W17_ARCHITECTURE_NOT_X64');
  const declaredRoot = fileSystem.realpathSync(path.resolve(String(environment.evidence_root || '')));
  assert(declaredRoot === evidenceRoot, 'A9_W17_EVIDENCE_ROOT_MISMATCH');
  assert(Array.isArray(execution.assertions) && execution.assertions.length > 0, 'A9_W17_ASSERTIONS_REQUIRED');
  for (const assertion of execution.assertions) {
    assert(plain(assertion) && typeof assertion.assertion_id === 'string', 'A9_W17_ASSERTION_ID_REQUIRED');
    assert(assertion.passed === true, `A9_W17_ASSERTION_NOT_PASS:${assertion.assertion_id}`);
    assert(typeof assertion.detail === 'string' && assertion.detail.length > 0, `A9_W17_ASSERTION_DETAIL_REQUIRED:${assertion.assertion_id}`);
    assert(Array.isArray(assertion.evidence) && assertion.evidence.length > 0, `A9_W17_ASSERTION_EVIDENCE_REQUIRED:${assertion.assertion_id}`);
    for (const item of assertion.evidence) {
      assert(plain(item) && typeof item.path === 'string' && /^[a-f0-9]{64}$/.test(String(item.sha256)), `A9_W17_EVIDENCE_ENTRY_INVALID:${assertion.assertion_id}`);
      const absolute = fileSystem.realpathSync(path.resolve(evidenceRoot, item.path));
      assert(contained(evidenceRoot, absolute), `A9_W17_EVIDENCE_ESCAPES_ROOT:${item.path}`);
      assert(fileSystem.statSync(absolute).isFile(), `A9_W17_EVIDENCE_NOT_FILE:${item.path}`);
      assert(sha256File(absolute, fileSystem) === item.sha256, `A9_W17_EVIDENCE_HASH_MISMATCH:${item.path}`);
    }
  }
}

function verifyReport(report, kit, identity, evidenceRoot, fileSystem) {
  rejectSecretMaterial(report);
  assert(plain(report) && report.schema_version === 1 && report.report_kind === 'WIN7_17_INCREMENTAL_ACCEPTANCE', 'A9_W17_REPORT_SCHEMA_INVALID');
  assert(JSON.stringify(report.candidate) === JSON.stringify(identity), 'A9_W17_CANDIDATE_BINDING_MISMATCH');
  assert(Array.isArray(report.results), 'A9_W17_RESULTS_REQUIRED');
  const expectedCases = new Map(kit.incremental_win7_cases.map((item) => [item.case_id, item]));
  assert(report.results.length === expectedCases.size, 'A9_W17_CASE_COUNT_MISMATCH');
  const seen = new Set();
  for (const result of report.results) {
    assert(plain(result) && expectedCases.has(result.case_id) && !seen.has(result.case_id), `A9_W17_CASE_ID_INVALID:${result && result.case_id}`);
    seen.add(result.case_id);
    assert(['PASS', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING'].includes(result.status), `A9_W17_CASE_STATUS_INVALID:${result.case_id}`);
    assert(Array.isArray(result.executions), `A9_W17_CASE_EXECUTIONS_REQUIRED:${result.case_id}`);
    if (result.status === 'PASS') {
      assert(result.executions.length > 0, `A9_W17_CASE_PASS_WITHOUT_EXECUTION:${result.case_id}`);
      const required = new Set(expectedCases.get(result.case_id).assertions.map((item) => item.assertion_id));
      for (const execution of result.executions) {
        validateEvidence(execution, evidenceRoot, fileSystem);
        for (const assertion of execution.assertions) required.delete(assertion.assertion_id);
      }
      assert(required.size === 0, `A9_W17_ASSERTIONS_MISSING:${result.case_id}:${Array.from(required).join(',')}`);
    }
  }
  const allPass = report.results.every((item) => item.status === 'PASS');
  assert(report.status === (allPass ? 'PASS' : 'EVIDENCE_PENDING'), 'A9_W17_OVERALL_STATUS_INVALID');
  return { status: report.status, candidate: identity, verified_cases: report.results.length };
}

function main(argv = process.argv.slice(2)) {
  const options = argumentsOf(argv);
  const fileSystem = physicalFs();
  const kitPath = requiredFile(options.kit, 'KIT', fileSystem);
  const kit = JSON.parse(fileSystem.readFileSync(kitPath, 'utf8'));
  assert(Array.isArray(kit.incremental_win7_cases) && kit.incremental_win7_cases.length === 8, 'A9_W17_KIT_INVALID');
  const identity = identityFrom(options, fileSystem);
  if (options.command === 'init') {
    process.stdout.write(`${JSON.stringify(template(kit, identity), null, 2)}\n`);
    return;
  }
  assert(options.command === 'verify', 'A9_W17_COMMAND_INVALID');
  const reportPath = requiredFile(options.report, 'REPORT', fileSystem);
  assert(typeof options['evidence-root'] === 'string' && options['evidence-root'], 'A9_W17_EVIDENCE_ROOT_REQUIRED');
  const evidenceRoot = fileSystem.realpathSync(path.resolve(options['evidence-root']));
  const report = JSON.parse(fileSystem.readFileSync(reportPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(verifyReport(report, kit, identity, evidenceRoot, fileSystem), null, 2)}\n`);
}

module.exports = { argumentsOf, identityFrom, template, verifyReport };
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
