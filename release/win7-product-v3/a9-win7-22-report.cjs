'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { verifyAcceptanceCandidate } = require('./a9-package-integrity.cjs');

function physicalFs() {
  if (!process.versions.electron) return fs;
  const original = require('original-fs');
  for (const name of ['existsSync', 'readFileSync', 'realpathSync', 'statSync', 'readdirSync']) {
    if (typeof original[name] !== 'function') throw new Error(`A9_W22_PHYSICAL_FS_MISSING:${name}`);
  }
  return original;
}

function argumentsOf(argv) {
  const values = { command: argv[0] || '' };
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`A9_W22_ARGUMENT_INVALID:${item}`);
    const equal = item.indexOf('=');
    if (equal > 2) values[item.slice(2, equal)] = item.slice(equal + 1);
    else {
      if (index + 1 >= argv.length) throw new Error(`A9_W22_ARGUMENT_VALUE_MISSING:${item}`);
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
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function requiredFile(value, label, fileSystem) {
  assert(typeof value === 'string' && value.length > 0, `A9_W22_${label}_REQUIRED`);
  const unresolved = path.resolve(value);
  assert(fileSystem.existsSync(unresolved) && fileSystem.statSync(unresolved).isFile(), `A9_W22_${label}_NOT_FILE`);
  const resolved = fileSystem.realpathSync(unresolved);
  assert(fileSystem.statSync(resolved).isFile(), `A9_W22_${label}_NOT_FILE`);
  return resolved;
}
function rejectSecretMaterial(value) {
  const serialized = JSON.stringify(value);
  assert(!/(?:Bearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-[A-Za-z0-9_-]{8,})/i.test(serialized), 'A9_W22_REPORT_SECRET_MATERIAL');
  const walk = (item) => {
    if (!plain(item) && !Array.isArray(item)) return;
    if (plain(item)) {
      for (const key of Object.keys(item)) {
        assert(!/^(?:api[_-]?key|apikey|authorization|password|secret|token|access[_-]?token|refresh[_-]?token|credentials?|private[_-]?key|access[_-]?key)$/i.test(key), `A9_W22_REPORT_SECRET_FIELD:${key}`);
        walk(item[key]);
      }
    } else item.forEach(walk);
  };
  walk(value);
}

function identityFrom(options, fileSystem) {
  const zipPath = requiredFile(options.zip, 'ZIP', fileSystem);
  const manifestPath = requiredFile(options['release-manifest'], 'MANIFEST', fileSystem);
  const kitPath = requiredFile(options.kit, 'KIT', fileSystem);
  const formalInputLockPath = requiredFile(options['formal-input-lock'], 'FORMAL_INPUT_LOCK', fileSystem);
  const approvalRegistryPath = requiredFile(options['approval-registry'], 'APPROVAL_REGISTRY', fileSystem);
  const { manifest, packageSha256, manifestSha256, authorityIdentity } = verifyAcceptanceCandidate(
    zipPath,
    manifestPath,
    kitPath,
    {
      formalInputLockPath, approvalRegistryPath,
      releaseAuthorityPath: requiredFile(options['release-authority'], 'RELEASE_AUTHORITY', fileSystem),
      releaseAuthoritySha256: options['release-authority-sha256'],
    },
    fileSystem,
  );
  return {
    release_id: manifest.release_id,
    version: manifest.version,
    source_commit: manifest.source_commit,
    package_filename: path.basename(zipPath),
    package_sha256: packageSha256,
    manifest_sha256: manifestSha256,
    ...authorityIdentity,
  };
}

function template(kit, identity) {
  return {
    schema_version: 2,
    report_kind: 'WIN7_22_INCREMENTAL_ACCEPTANCE',
    candidate: identity,
    inherited_evidence_policy: kit.inherited_evidence,
    status: 'NOT_PERFORMED',
    results: kit.incremental_win7_cases.map((validationCase) => ({
      case_id: validationCase.case_id,
      status: 'NOT_PERFORMED',
      ...(validationCase.case_id.startsWith('W17-')
        ? {
          inherited_from: kit.inherited_evidence.candidate,
          evidence_refs: kit.inherited_evidence.case_bindings[validationCase.case_id],
        }
        : validationCase.case_id === 'W22-WIN7-19-SCHEMA-V4-COMPAT'
          ? {
            inherited_from: kit.schema_v4_inheritance.from_candidate,
            evidence: kit.schema_v4_inheritance.evidence,
          }
          : { executions: [] }),
    })),
  };
}

function validateEvidenceEntries(entries, evidenceRoot, fileSystem, label) {
  assert(Array.isArray(entries) && entries.length > 0, `A9_W22_${label}_EVIDENCE_REQUIRED`);
  for (const item of entries) {
    assert(plain(item) && typeof item.path === 'string' && /^[a-f0-9]{64}$/.test(String(item.sha256)), `A9_W22_${label}_EVIDENCE_ENTRY_INVALID`);
    const absolute = fileSystem.realpathSync(path.resolve(evidenceRoot, item.path));
    assert(contained(evidenceRoot, absolute), `A9_W22_EVIDENCE_ESCAPES_ROOT:${item.path}`);
    assert(fileSystem.statSync(absolute).isFile(), `A9_W22_EVIDENCE_NOT_FILE:${item.path}`);
    assert(sha256File(absolute, fileSystem) === item.sha256, `A9_W22_EVIDENCE_HASH_MISMATCH:${item.path}`);
  }
}

function loadJsonEvidence(entries, evidenceRoot, fileSystem, label) {
  assert(Array.isArray(entries) && entries.length === 1, `A9_W22_${label}_SINGLE_JSON_EVIDENCE_REQUIRED`);
  validateEvidenceEntries(entries, evidenceRoot, fileSystem, label);
  const absolute = fileSystem.realpathSync(path.resolve(evidenceRoot, entries[0].path));
  try { return JSON.parse(fileSystem.readFileSync(absolute, 'utf8')); }
  catch (_error) { throw new Error(`A9_W22_${label}_JSON_INVALID`); }
}

function jsonPointer(document, pointer, label) {
  assert(typeof pointer === 'string' && (pointer === '' || pointer.startsWith('/')), `A9_W22_${label}_POINTER_INVALID`);
  let value = document;
  for (const segment of pointer.split('/').slice(1)) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    assert((plain(value) || Array.isArray(value)) && Object.prototype.hasOwnProperty.call(value, key), `A9_W22_${label}_POINTER_MISSING:${pointer}`);
    value = value[key];
  }
  return value;
}

function loadInheritedEvidence(policy, evidenceRoot, fileSystem) {
  assert(plain(policy) && policy.decision === 'ADR-0097' && policy.allowed_case_prefix === 'W17-'
    && Array.isArray(policy.evidence_sources) && plain(policy.case_bindings), 'A9_W22_INHERITANCE_POLICY_INVALID');
  const sources = new Map();
  for (const source of policy.evidence_sources) {
    assert(plain(source) && typeof source.source_id === 'string' && source.source_id.length > 0
      && typeof source.path === 'string' && /^[a-f0-9]{64}$/.test(String(source.sha256 || ''))
      && !sources.has(source.source_id), 'A9_W22_INHERITED_SOURCE_INVALID');
    const absolute = fileSystem.realpathSync(path.resolve(evidenceRoot, source.path));
    assert(contained(evidenceRoot, absolute) && fileSystem.statSync(absolute).isFile(), `A9_W22_INHERITED_SOURCE_PATH_INVALID:${source.source_id}`);
    assert(sha256File(absolute, fileSystem) === source.sha256, `A9_W22_INHERITED_SOURCE_HASH_MISMATCH:${source.source_id}`);
    let document;
    try { document = JSON.parse(fileSystem.readFileSync(absolute, 'utf8')); }
    catch (_error) { throw new Error(`A9_W22_INHERITED_SOURCE_JSON_INVALID:${source.source_id}`); }
    assert(Array.isArray(source.required_values) && source.required_values.length > 0, `A9_W22_INHERITED_SOURCE_REQUIREMENTS_MISSING:${source.source_id}`);
    for (const requirement of source.required_values) {
      assert(plain(requirement) && typeof requirement.json_pointer === 'string'
        && Object.prototype.hasOwnProperty.call(requirement, 'value'), `A9_W22_INHERITED_SOURCE_REQUIREMENT_INVALID:${source.source_id}`);
      assert(canonicalJson(jsonPointer(document, requirement.json_pointer, `INHERITED_${source.source_id}`)) === canonicalJson(requirement.value),
        `A9_W22_INHERITED_SOURCE_CONTENT_MISMATCH:${source.source_id}:${requirement.json_pointer}`);
    }
    sources.set(source.source_id, document);
  }
  return sources;
}

function validateInheritedCase(result, policy, sources) {
  const bindings = policy.case_bindings[result.case_id];
  assert(Array.isArray(bindings) && bindings.length > 0, `A9_W22_INHERITED_CASE_BINDING_MISSING:${result.case_id}`);
  assert(canonicalJson(result.evidence_refs) === canonicalJson(bindings), `A9_W22_INHERITED_CASE_REFS_MISMATCH:${result.case_id}`);
  for (const binding of bindings) {
    assert(plain(binding) && typeof binding.source_id === 'string' && typeof binding.json_pointer === 'string'
      && sources.has(binding.source_id), `A9_W22_INHERITED_CASE_REF_INVALID:${result.case_id}`);
    const referenced = jsonPointer(sources.get(binding.source_id), binding.json_pointer, `INHERITED_CASE_${result.case_id}`);
    if (plain(referenced) && Object.prototype.hasOwnProperty.call(referenced, 'case_id')) {
      assert(referenced.case_id === result.case_id, `A9_W22_INHERITED_SOURCE_CASE_MISMATCH:${result.case_id}`);
    }
  }
}

function validateSchemaV4Inheritance(result, kit, evidenceRoot, fileSystem) {
  const inheritance = kit.schema_v4_inheritance;
  assert(plain(inheritance)
    && inheritance.status === 'INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH'
    && /^[a-f0-9]{40}$/.test(String(inheritance.source_commit || ''))
    && plain(inheritance.source_artifact_hashes)
    && Object.keys(inheritance.source_artifact_hashes).length > 0,
  'A9_W22_SCHEMA_V4_INHERITANCE_INVALID');
  assert(canonicalJson(result.inherited_from) === canonicalJson(inheritance.from_candidate),
    'A9_W22_SCHEMA_V4_INHERITED_CANDIDATE_MISMATCH');
  assert(canonicalJson(result.evidence) === canonicalJson(inheritance.evidence),
    'A9_W22_SCHEMA_V4_INHERITED_EVIDENCE_LIST_MISMATCH');
  validateEvidenceEntries(result.evidence, evidenceRoot, fileSystem, 'SCHEMA_V4_INHERITED');
}

function validateExecution(execution, identity, expectedAssertions, evidenceRoot, fileSystem) {
  assert(canonicalJson(execution.candidate) === canonicalJson(identity), 'A9_W22_EXECUTION_CANDIDATE_BINDING_MISMATCH');
  assert(plain(execution.environment), 'A9_W22_ENVIRONMENT_REQUIRED');
  const environment = execution.environment;
  for (const field of ['windows_version', 'architecture', 'token_kind', 'elevation', 'dpi', 'shell_profile']) {
    assert(typeof environment[field] === 'string' && environment[field].length > 0, `A9_W22_ENVIRONMENT_${field.toUpperCase()}_REQUIRED`);
  }
  assert(/^Windows 7(?: Professional)? SP1 build 7601$/i.test(environment.windows_version), 'A9_W22_WINDOWS_VERSION_NOT_WIN7_SP1_7601');
  assert(environment.architecture.toLowerCase() === 'x64', 'A9_W22_ARCHITECTURE_NOT_X64');
  assert(environment.token_kind === 'ordinary-user', 'A9_W22_TOKEN_NOT_ORDINARY_USER');
  assert(environment.elevation === 'not-elevated', 'A9_W22_PROCESS_ELEVATED');
  assert(/^(?:100|125)%$/.test(environment.dpi), 'A9_W22_DPI_NOT_ACCEPTED');
  assert(environment.shell_profile === 'D-013-v25-a9-trusted-shell-current-user', 'A9_W22_SHELL_PROFILE_MISMATCH');
  assert(fileSystem.realpathSync(path.resolve(String(environment.evidence_root || ''))) === evidenceRoot, 'A9_W22_EVIDENCE_ROOT_MISMATCH');
  assert(plain(execution.machine_binding), 'A9_W22_MACHINE_BINDING_REQUIRED');
  const machine = execution.machine_binding;
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(machine.probe_id || '')), 'A9_W22_MACHINE_PROBE_ID_INVALID');
  assert(machine.os_build === '6.1.7601' && machine.integrity_level === 'medium'
    && machine.os_probe_command === 'cmd.exe /d /s /c ver'
    && machine.token_probe_command === 'C:\\Windows\\System32\\whoami.exe /all', 'A9_W22_MACHINE_FACTS_INVALID');
  assert(canonicalJson(machine.candidate_start_candidate) === canonicalJson(identity)
    && canonicalJson(machine.postflight_candidate) === canonicalJson(identity), 'A9_W22_MACHINE_CANDIDATE_BINDING_MISMATCH');
  assert(plain(machine.evidence), 'A9_W22_MACHINE_EVIDENCE_REQUIRED');
  const osProbe = loadJsonEvidence(machine.evidence.os_probe, evidenceRoot, fileSystem, 'MACHINE_OS_PROBE');
  assert(osProbe.schema_version === 1 && osProbe.evidence_kind === 'WIN7_OS_PROBE'
    && osProbe.probe_id === machine.probe_id && osProbe.command === machine.os_probe_command
    && osProbe.windows_version === 'Microsoft Windows [Version 6.1.7601]', 'A9_W22_MACHINE_OS_PROBE_CONTENT_INVALID');
  const tokenProbe = loadJsonEvidence(machine.evidence.token_probe, evidenceRoot, fileSystem, 'MACHINE_TOKEN_PROBE');
  assert(tokenProbe.schema_version === 1 && tokenProbe.evidence_kind === 'WIN7_TOKEN_PROBE'
    && tokenProbe.probe_id === machine.probe_id && tokenProbe.command === machine.token_probe_command
    && tokenProbe.token_kind === 'ordinary-user' && tokenProbe.elevation === 'not-elevated'
    && tokenProbe.integrity_level === 'medium' && /^S-1-5-21-(?:\d+-){2}\d+-\d+$/.test(String(tokenProbe.user_sid || '')),
  'A9_W22_MACHINE_TOKEN_PROBE_CONTENT_INVALID');
  const candidateStart = loadJsonEvidence(machine.evidence.candidate_start, evidenceRoot, fileSystem, 'MACHINE_CANDIDATE_START');
  assert(candidateStart.schema_version === 1 && candidateStart.evidence_kind === 'WIN7_CANDIDATE_START'
    && candidateStart.probe_id === machine.probe_id && candidateStart.status === 'PASS'
    && candidateStart.executable === '.\\electron.exe'
    && canonicalJson(candidateStart.candidate) === canonicalJson(identity), 'A9_W22_MACHINE_CANDIDATE_START_CONTENT_INVALID');
  const postflight = loadJsonEvidence(machine.evidence.postflight_identity, evidenceRoot, fileSystem, 'MACHINE_POSTFLIGHT_IDENTITY');
  assert(postflight.schema_version === 1 && postflight.evidence_kind === 'WIN7_POSTFLIGHT_IDENTITY'
    && postflight.probe_id === machine.probe_id && postflight.status === 'PASS'
    && postflight.managed_processes === 0 && postflight.helper_processes === 0
    && postflight.package_hashes_unchanged === true
    && canonicalJson(postflight.candidate) === canonicalJson(identity), 'A9_W22_MACHINE_POSTFLIGHT_CONTENT_INVALID');
  assert(Array.isArray(execution.assertions) && execution.assertions.length > 0, 'A9_W22_ASSERTIONS_REQUIRED');
  const seenAssertions = new Set();
  for (const assertion of execution.assertions) {
    assert(plain(assertion) && typeof assertion.assertion_id === 'string', 'A9_W22_ASSERTION_ID_REQUIRED');
    assert(expectedAssertions.has(assertion.assertion_id) && !seenAssertions.has(assertion.assertion_id), `A9_W22_ASSERTION_ID_INVALID:${assertion.assertion_id}`);
    seenAssertions.add(assertion.assertion_id);
    assert(assertion.passed === true, `A9_W22_ASSERTION_NOT_PASS:${assertion.assertion_id}`);
    assert(typeof assertion.detail === 'string' && assertion.detail.length > 0, `A9_W22_ASSERTION_DETAIL_REQUIRED:${assertion.assertion_id}`);
    validateEvidenceEntries(assertion.evidence, evidenceRoot, fileSystem, `ASSERTION_${assertion.assertion_id}`);
  }
}

function validateSchemaCompatibilityEvidence(execution, identity, evidenceRoot, fileSystem) {
  const proof = execution.schema_compatibility;
  assert(plain(proof), 'A9_W22_SCHEMA_COMPAT_EVIDENCE_REQUIRED');
  const preimage = loadJsonEvidence(proof.preimage, evidenceRoot, fileSystem, 'SCHEMA_COMPAT_PREIMAGE');
  const migration = loadJsonEvidence(proof.migration, evidenceRoot, fileSystem, 'SCHEMA_COMPAT_MIGRATION');
  const rollback = loadJsonEvidence(proof.rollback, evidenceRoot, fileSystem, 'SCHEMA_COMPAT_ROLLBACK');
  const rollbackInjection = loadJsonEvidence(
    proof.rollback_injection, evidenceRoot, fileSystem, 'SCHEMA_COMPAT_ROLLBACK_INJECTION',
  );
  const rollbackDiagnostics = loadJsonEvidence(
    proof.rollback_diagnostics, evidenceRoot, fileSystem, 'SCHEMA_COMPAT_ROLLBACK_DIAGNOSTICS',
  );
  const inspectDatabase = (entries, label) => {
    assert(Array.isArray(entries) && entries.length === 1, `A9_W22_${label}_SINGLE_FILE_REQUIRED`);
    validateEvidenceEntries(entries, evidenceRoot, fileSystem, label);
    const absolute = fileSystem.realpathSync(path.resolve(evidenceRoot, entries[0].path));
    let Database;
    try { Database = require(path.join(__dirname, '..', 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3')); }
    catch (_packagedError) {
      try { Database = require('better-sqlite3'); }
      catch (_developerError) { throw new Error('A9_W22_SCHEMA_COMPAT_SQLITE_RUNTIME_UNAVAILABLE'); }
    }
    let inspectA9SchemaV4Profile;
    try {
      ({ inspectA9SchemaV4Profile } = require(path.join(
        __dirname, '..', 'resources', 'app', 'state', 'dist', 'a9-persistence.js',
      )));
    } catch (_packagedError) {
      try {
        ({ inspectA9SchemaV4Profile } = require(path.join(
          __dirname, '..', '..', 'src', 'state', 'dist', 'a9-persistence.js',
        )));
      } catch (_developerError) { throw new Error('A9_W22_SCHEMA_COMPAT_STATE_INSPECTOR_UNAVAILABLE'); }
    }
    assert(typeof inspectA9SchemaV4Profile === 'function', 'A9_W22_SCHEMA_COMPAT_STATE_INSPECTOR_UNAVAILABLE');
    let database;
    try {
      database = new Database(absolute, { readonly: true, fileMustExist: true });
      const profile = inspectA9SchemaV4Profile(database);
      const table = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='a9_sessions'").get();
      const normalized = String(table?.sql ?? '').toLowerCase()
        .replace(/if\s+not\s+exists/g, '').replace(/[\s"`\[\];]+/g, '');
      const facts = database.prepare(`
        SELECT session_id, workspace_path, title, title_source, state, created_at, updated_at,
          COALESCE(last_activated_at, updated_at, created_at) AS last_activated_at,
          draft_ciphertext, metadata_json
        FROM a9_sessions ORDER BY session_id
      `).all();
      return {
        fileSha256: entries[0].sha256,
        profile,
        sessionSignatureSha256: crypto.createHash('sha256').update(normalized).digest('hex'),
        factsSha256: crypto.createHash('sha256').update(canonicalJson(facts)).digest('hex'),
      };
    } catch (error) {
      if (String(error?.message || error).startsWith('A9_W22_')) throw error;
      throw new Error(`A9_W22_${label}_SQLITE_INVALID`);
    } finally {
      try { database?.close(); } catch (_closeError) { /* best effort */ }
    }
  };
  const preimageDatabase = inspectDatabase(proof.preimage_database, 'SCHEMA_COMPAT_PREIMAGE_DATABASE');
  const migrationBackup = inspectDatabase(proof.migration_backup_database, 'SCHEMA_COMPAT_MIGRATION_BACKUP_DATABASE');
  const migrationPost = inspectDatabase(proof.migration_post_database, 'SCHEMA_COMPAT_MIGRATION_POST_DATABASE');
  const rollbackPre = inspectDatabase(proof.rollback_pre_database, 'SCHEMA_COMPAT_ROLLBACK_PRE_DATABASE');
  const rollbackAfter = inspectDatabase(proof.rollback_after_database, 'SCHEMA_COMPAT_ROLLBACK_AFTER_DATABASE');
  const rollbackBackup = inspectDatabase(proof.rollback_backup_database, 'SCHEMA_COMPAT_ROLLBACK_BACKUP_DATABASE');
  const legacySessionSignature = '19af696cd314930ef840219a4dd6db66e461ee9cdbc97cdf7325bd29a44a1de7';
  const canonicalSessionSignature = '100f6f987ef676263c8cff5b4987c97bb44c267228c96669c0b4999006ec9f6c';
  assert(preimage.schema_version === 1 && preimage.evidence_kind === 'WIN7_19_SCHEMA_V4_PREIMAGE'
    && preimageDatabase.profile === 'win7_19_legacy'
    && preimage.schema_profile === 'WIN7_19_LEGACY_V4'
    && preimage.quick_check === 'ok' && preimage.db_sha256 === preimageDatabase.fileSha256
    && preimage.session_table_signature_sha256 === legacySessionSignature
    && preimage.session_table_signature_sha256 === preimageDatabase.sessionSignatureSha256
    && preimage.facts_sha256 === preimageDatabase.factsSha256
    && canonicalJson(preimage.candidate) === canonicalJson(identity), 'A9_W22_SCHEMA_COMPAT_PREIMAGE_INVALID');
  assert(migration.schema_version === 1 && migration.evidence_kind === 'WIN7_22_SCHEMA_V4_MIGRATION'
    && canonicalJson(migration.candidate) === canonicalJson(identity)
    && migration.source_db_sha256 === preimage.db_sha256
    && migration.backup_sha256 === migrationBackup.fileSha256 && migration.backup_quick_check === 'ok'
    && migrationBackup.profile === 'win7_19_legacy' && migrationPost.profile === 'canonical'
    && migration.backup_session_table_signature_sha256 === legacySessionSignature
    && migration.backup_session_table_signature_sha256 === migrationBackup.sessionSignatureSha256
    && migration.canonical_session_table_signature_sha256 === canonicalSessionSignature
    && migration.canonical_session_table_signature_sha256 === migrationPost.sessionSignatureSha256
    && migration.pre_facts_sha256 === preimage.facts_sha256
    && migration.backup_facts_sha256 === migrationBackup.factsSha256
    && migration.post_facts_sha256 === migrationPost.factsSha256
    && migration.backup_facts_sha256 === preimage.facts_sha256
    && migration.post_facts_sha256 === preimage.facts_sha256
    && migration.electron_startup === 'READY' && migration.diagnostics_absent === true,
  'A9_W22_SCHEMA_COMPAT_MIGRATION_INVALID');
  assert(rollback.schema_version === 1 && rollback.evidence_kind === 'WIN7_22_SCHEMA_V4_ROLLBACK'
    && rollbackPre.profile === 'win7_19_legacy' && rollbackAfter.profile === 'win7_19_legacy'
    && rollbackBackup.profile === 'win7_19_legacy'
    && canonicalJson(rollback.candidate) === canonicalJson(identity)
    && rollback.fault_injection === 'SQLITE_BEGIN_IMMEDIATE_EXTERNAL_CONNECTION'
    && rollback.pre_db_sha256 === rollbackPre.fileSha256 && rollback.after_db_sha256 === rollbackAfter.fileSha256
    && rollback.after_db_sha256 === rollback.pre_db_sha256
    && rollback.backup_sha256 === rollbackBackup.fileSha256 && rollback.backup_quick_check === 'ok'
    && rollback.pre_session_table_signature_sha256 === legacySessionSignature
    && rollback.backup_session_table_signature_sha256 === legacySessionSignature
    && rollback.after_session_table_signature_sha256 === legacySessionSignature
    && rollback.pre_session_table_signature_sha256 === rollbackPre.sessionSignatureSha256
    && rollback.backup_session_table_signature_sha256 === rollbackBackup.sessionSignatureSha256
    && rollback.after_session_table_signature_sha256 === rollbackAfter.sessionSignatureSha256
    && rollback.pre_facts_sha256 === rollbackPre.factsSha256
    && rollback.backup_facts_sha256 === rollbackBackup.factsSha256
    && rollback.after_facts_sha256 === rollbackAfter.factsSha256
    && rollback.pre_facts_sha256 === preimage.facts_sha256
    && rollback.backup_facts_sha256 === preimage.facts_sha256
    && rollback.after_facts_sha256 === preimage.facts_sha256
    && rollback.diagnostics_code === 'A9_PERSISTENCE_DIAGNOSTICS'
    && rollback.electron_startup === 'RESTRICTED_DIAGNOSTICS', 'A9_W22_SCHEMA_COMPAT_ROLLBACK_INVALID');
  assert(rollbackInjection.schema_version === 1
    && rollbackInjection.evidence_kind === 'WIN7_22_SCHEMA_V4_WRITE_LOCK_INJECTION'
    && canonicalJson(rollbackInjection.candidate) === canonicalJson(identity)
    && rollbackInjection.mechanism === 'SQLITE_BEGIN_IMMEDIATE_EXTERNAL_CONNECTION'
    && rollbackInjection.runtime === '.\\electron.exe (ELECTRON_RUN_AS_NODE=1)'
    && rollbackInjection.lock_acquired_before_candidate_start === true
    && rollbackInjection.lock_released_after_diagnostics === true,
  'A9_W22_SCHEMA_COMPAT_ROLLBACK_INJECTION_INVALID');
  assert(rollbackDiagnostics.schema_version === 1
    && rollbackDiagnostics.evidence_kind === 'WIN7_22_SCHEMA_V4_RESTRICTED_DIAGNOSTICS'
    && canonicalJson(rollbackDiagnostics.candidate) === canonicalJson(identity)
    && rollbackDiagnostics.status === 'RESTRICTED_DIAGNOSTICS'
    && rollbackDiagnostics.error_code === 'A9_PERSISTENCE_DIAGNOSTICS'
    && rollbackDiagnostics.sqlite_error === 'database is locked',
  'A9_W22_SCHEMA_COMPAT_ROLLBACK_DIAGNOSTICS_INVALID');
}

function verifyReport(report, kit, identity, evidenceRoot, fileSystem) {
  rejectSecretMaterial(report);
  assert(plain(kit) && kit.schema_version === 2 && Array.isArray(kit.incremental_win7_cases)
    && kit.incremental_win7_cases.length === 13, 'A9_W22_KIT_INVALID');
  assert(plain(report) && report.schema_version === 2 && report.report_kind === 'WIN7_22_INCREMENTAL_ACCEPTANCE', 'A9_W22_REPORT_SCHEMA_INVALID');
  assert(canonicalJson(report.candidate) === canonicalJson(identity), 'A9_W22_CANDIDATE_BINDING_MISMATCH');
  assert(canonicalJson(report.inherited_evidence_policy) === canonicalJson(kit.inherited_evidence), 'A9_W22_INHERITANCE_POLICY_MISMATCH');
  const inheritedSources = loadInheritedEvidence(kit.inherited_evidence, evidenceRoot, fileSystem);
  assert(Array.isArray(report.results), 'A9_W22_RESULTS_REQUIRED');
  const expectedCases = new Map(kit.incremental_win7_cases.map((item) => [item.case_id, item]));
  assert(kit.incremental_win7_cases.filter((item) => item.case_id.startsWith('W17-')).length === 8
    && kit.incremental_win7_cases.filter((item) => item.case_id.startsWith('W22-')).length === 5
    && kit.incremental_win7_cases.some((item) => item.case_id === 'W22-WIN7-19-SCHEMA-V4-COMPAT'),
  'A9_W22_KIT_CASE_PARTITION_INVALID');
  assert(report.results.length === expectedCases.size, 'A9_W22_CASE_COUNT_MISMATCH');
  const seen = new Set();
  for (const result of report.results) {
    assert(plain(result) && expectedCases.has(result.case_id) && !seen.has(result.case_id), `A9_W22_CASE_ID_INVALID:${result && result.case_id}`);
    seen.add(result.case_id);
    const inheritedCase = result.case_id.startsWith('W17-');
    const schemaInheritedCase = result.case_id === 'W22-WIN7-19-SCHEMA-V4-COMPAT';
    const allowed = inheritedCase
      ? ['PASS', 'INHERITED_EVIDENCE', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING']
      : schemaInheritedCase
        ? ['PASS', 'INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING']
        : ['PASS', 'FAIL', 'NOT_PERFORMED', 'EVIDENCE_PENDING'];
    assert(allowed.includes(result.status), `A9_W22_CASE_STATUS_INVALID:${result.case_id}`);
    if (result.status === 'INHERITED_EVIDENCE') {
      assert(inheritedCase, `A9_W22_IMPACTED_CASE_CANNOT_INHERIT:${result.case_id}`);
      assert(canonicalJson(result.inherited_from) === canonicalJson(kit.inherited_evidence.candidate), `A9_W22_INHERITED_CANDIDATE_MISMATCH:${result.case_id}`);
      validateInheritedCase(result, kit.inherited_evidence, inheritedSources);
      continue;
    }
    if (result.status === 'INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH') {
      assert(schemaInheritedCase, `A9_W22_IMPACTED_CASE_CANNOT_INHERIT:${result.case_id}`);
      validateSchemaV4Inheritance(result, kit, evidenceRoot, fileSystem);
      continue;
    }
    assert(Array.isArray(result.executions), `A9_W22_CASE_EXECUTIONS_REQUIRED:${result.case_id}`);
    if (result.status === 'PASS') {
      assert(result.executions.length > 0, `A9_W22_CASE_PASS_WITHOUT_EXECUTION:${result.case_id}`);
      const required = new Set(expectedCases.get(result.case_id).assertions.map((item) => item.assertion_id));
      for (const execution of result.executions) {
        validateExecution(execution, identity, new Set(required), evidenceRoot, fileSystem);
        if (result.case_id === 'W22-WIN7-19-SCHEMA-V4-COMPAT') {
          validateSchemaCompatibilityEvidence(execution, identity, evidenceRoot, fileSystem);
        }
        for (const assertion of execution.assertions) required.delete(assertion.assertion_id);
      }
      assert(required.size === 0, `A9_W22_ASSERTIONS_MISSING:${result.case_id}:${Array.from(required).join(',')}`);
    }
  }
  const complete = report.results.every((item) => item.status === 'PASS'
    || item.status === 'INHERITED_EVIDENCE'
    || item.status === 'INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH');
  const expectedStatus = report.results.some((item) => item.status === 'FAIL') ? 'FAIL' : complete ? 'PASS' : 'EVIDENCE_PENDING';
  assert(report.status === expectedStatus, 'A9_W22_OVERALL_STATUS_INVALID');
  return {
    status: report.status,
    candidate: identity,
    verified_cases: report.results.length,
    direct_current_candidate_cases: report.results.filter((item) => item.case_id.startsWith('W22-') && item.status === 'PASS').length,
    inherited_cases: report.results.filter((item) => item.status === 'INHERITED_EVIDENCE'
      || item.status === 'INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH').length,
  };
}

function main(argv = process.argv.slice(2)) {
  const options = argumentsOf(argv);
  const fileSystem = physicalFs();
  const kitPath = requiredFile(options.kit, 'KIT', fileSystem);
  const kit = JSON.parse(fileSystem.readFileSync(kitPath, 'utf8'));
  const identity = identityFrom(options, fileSystem);
  if (options.command === 'init') {
    process.stdout.write(`${JSON.stringify(template(kit, identity), null, 2)}\n`);
    return;
  }
  assert(options.command === 'verify', 'A9_W22_COMMAND_INVALID');
  const reportPath = requiredFile(options.report, 'REPORT', fileSystem);
  assert(typeof options['evidence-root'] === 'string' && options['evidence-root'], 'A9_W22_EVIDENCE_ROOT_REQUIRED');
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
