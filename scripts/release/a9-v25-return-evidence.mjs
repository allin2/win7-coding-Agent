import crypto from 'node:crypto';

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const check = (condition, code) => { if (!condition) throw new Error(`A9_V25_${code}`); };

export const requiredV25Evidence = [
  'environment.json', 'input-verification.json', 'build-result.json',
  'pe-api-crt-analysis.json', 'pe-helper-headers.txt', 'pe-helper-dependents.txt', 'pe-helper-imports.txt',
  'logic-tests.txt', 'return-package-selftest.json', 'capture-selftest.json',
  'capture-selftest-stdout.bin', 'capture-selftest-stderr.bin', 'build-transcript.txt',
  'version-stdout.txt', 'version-stderr.txt', 'smoke-stdout.txt', 'smoke-stderr.txt',
  'cancel-smoke-stdout.txt', 'cancel-smoke-stderr.txt', 'v25-smoke-stdout.txt', 'v25-smoke-stderr.txt',
  'v25-cancel-smoke-stdout.txt', 'v25-cancel-smoke-stderr.txt',
  'v25-env-overlay-reject-stdout.txt', 'v25-env-overlay-reject-stderr.txt',
].map((name) => `evidence/${name}`);

// Read the actual PE, not dumpbin's caller-supplied PASS summary. This reader
// deliberately rejects delay imports/ordinals and ambiguous or truncated RVAs.
export function inspectV25Pe(bytes, profile) {
  const range = (offset, size) => {
    check(Number.isSafeInteger(offset) && offset >= 0 && offset + size <= bytes.length, 'PE_TRUNCATED');
    return offset;
  };
  const u16 = (offset) => bytes.readUInt16LE(range(offset, 2));
  const u32 = (offset) => bytes.readUInt32LE(range(offset, 4));
  check(u16(0) === 0x5a4d, 'PE_DOS_SIGNATURE_INVALID');
  const pe = u32(0x3c);
  check(u32(pe) === 0x4550 && u16(pe + 4) === 0x8664, 'PE_NOT_AMD64');
  const count = u16(pe + 6);
  const optionalSize = u16(pe + 20);
  const optional = pe + 24;
  check(count > 0 && count <= 96 && optionalSize >= 240 && u16(optional) === 0x20b
    && (u16(pe + 22) & 0x2002) === 2 && u16(optional + 68) === 3, 'PE_NOT_X64_CONSOLE_EXECUTABLE');
  for (const offset of [40, 48]) {
    check(u16(optional + offset) < 6 || (u16(optional + offset) === 6 && u16(optional + offset + 2) <= 1), 'PE_REQUIRES_POST_WIN7');
  }
  check(u32(optional + 108) >= 16, 'PE_DATA_DIRECTORIES_MISSING');
  const sections = [];
  for (let index = 0; index < count; index += 1) {
    const section = range(optional + optionalSize + index * 40, 40);
    const rawSize = u32(section + 16);
    const raw = u32(section + 20);
    range(raw, rawSize);
    sections.push({ rva: u32(section + 12), size: rawSize, raw });
  }
  const rvaOffset = (rva, size = 1) => {
    const matches = sections.filter((section) => rva >= section.rva && rva + size <= section.rva + section.size);
    check(matches.length === 1, 'PE_RVA_INVALID');
    return range(matches[0].raw + rva - matches[0].rva, size);
  };
  const cstring = (rva) => {
    const chars = [];
    for (let index = 0; index < 4096; index += 1) {
      const byte = bytes[rvaOffset(rva + index)];
      if (byte === 0) return Buffer.from(chars).toString('ascii');
      check(byte >= 32 && byte < 127, 'PE_IMPORT_NAME_INVALID');
      chars.push(byte);
    }
    throw new Error('A9_V25_PE_IMPORT_NAME_UNTERMINATED');
  };
  const directory = (index) => ({ rva: u32(optional + 112 + index * 8), size: u32(optional + 116 + index * 8) });
  check(directory(13).rva === 0 && directory(13).size === 0, 'PE_DELAY_IMPORTS_UNSUPPORTED');
  const imports = directory(1);
  check(imports.rva > 0 && imports.size >= 40 && imports.size <= 65536, 'PE_IMPORT_DIRECTORY_INVALID');
  const dlls = [];
  const apis = [];
  let terminated = false;
  for (let index = 0; index * 20 + 20 <= imports.size; index += 1) {
    const descriptor = rvaOffset(imports.rva + index * 20, 20);
    if (bytes.subarray(descriptor, descriptor + 20).every((byte) => byte === 0)) { terminated = true; break; }
    dlls.push(cstring(u32(descriptor + 12)).toUpperCase());
    const thunk = u32(descriptor) || u32(descriptor + 16);
    let thunkTerminated = false;
    for (let entry = 0; entry < 65536; entry += 1) {
      const offset = rvaOffset(thunk + entry * 8, 8);
      const name = u32(offset);
      check(u32(offset + 4) === 0, 'PE_ORDINAL_OR_INVALID_IMPORT');
      if (name === 0) { thunkTerminated = true; break; }
      apis.push(cstring(name + 2));
    }
    check(thunkTerminated, 'PE_IMPORT_THUNKS_UNTERMINATED');
  }
  check(terminated && dlls.length > 0 && apis.length > 0, 'PE_IMPORTS_UNTERMINATED');
  const forbidden = new Set(profile.forbidden_imports || []);
  check(Array.isArray(profile.forbidden_imports) && forbidden.has('CreatePseudoConsole'), 'PE_PROFILE_DENY_RULES_MISSING');
  check(!apis.some((api) => forbidden.has(api)), 'PE_FORBIDDEN_API');
  check(!dlls.some((dll) => /^(?:VCRUNTIME|MSVCP|UCRTBASE|API-MS-WIN-CRT-)/i.test(dll)), 'PE_DYNAMIC_CRT');
  const resources = directory(2);
  check(resources.rva > 0 && resources.size > 0, 'PE_MANIFEST_MISSING');
  const resourceOffset = (relative, size) => {
    check(relative >= 0 && relative + size <= resources.size, 'PE_RESOURCE_INVALID');
    return rvaOffset(resources.rva + relative, size);
  };
  const resourceEntries = (relative) => {
    const header = resourceOffset(relative, 16);
    const total = u16(header + 12) + u16(header + 14);
    check(total > 0 && total < 1024, 'PE_RESOURCE_INVALID');
    return Array.from({ length: total }, (_, index) => {
      const entry = resourceOffset(relative + 16 + index * 8, 8);
      return { id: u32(entry), target: u32(entry + 4) };
    });
  };
  const manifestType = resourceEntries(0).find((entry) => entry.id === 24);
  check(manifestType && (manifestType.target & 0x80000000), 'PE_MANIFEST_MISSING');
  const manifestId = resourceEntries(manifestType.target & 0x7fffffff).find((entry) => entry.id === 1);
  check(manifestId && (manifestId.target & 0x80000000), 'PE_MANIFEST_MISSING');
  const languages = resourceEntries(manifestId.target & 0x7fffffff);
  for (const entry of languages) {
    check((entry.target & 0x80000000) === 0, 'PE_RESOURCE_INVALID');
    const data = resourceOffset(entry.target, 16);
    const size = u32(data + 4);
    const start = rvaOffset(u32(data), size);
    const xml = bytes.subarray(start, start + size).toString('utf8');
    check(/requestedExecutionLevel\s+level="asInvoker"\s+uiAccess="false"/.test(xml)
      && xml.includes('35138b9a-5d96-4fbd-8e2d-a2440225f93a'), 'PE_MANIFEST_CONTRACT_INVALID');
  }
  return { dlls, apis };
}

export function verifyV25ReturnEvidence(read, helperBytes, buildResult, profile) {
  const json = (name) => {
    try { return JSON.parse(read(`evidence/${name}`).toString('utf8').replace(/^\uFEFF/, '')); }
    catch (_error) { throw new Error(`A9_V25_EVIDENCE_JSON_INVALID:${name}`); }
  };
  const text = (name) => read(`evidence/${name}`).toString('utf8').replace(/^\uFEFF/, '').trim();
  const declared = profile.delivery?.evidence;
  const artifact = buildResult.artifacts?.find((entry) => entry.path === 'helper.exe');
  check(artifact && artifact.size === helperBytes.length && artifact.sha256 === hash(helperBytes), 'BUILD_ARTIFACT_BINDING_MISMATCH');
  check(Array.isArray(declared) && requiredV25Evidence.every((name) => declared.includes(name))
    && declared.includes('evidence/validation-binding.json'), 'EVIDENCE_PROFILE_CLOSURE_MISSING');
  const binding = json('validation-binding.json');
  check(binding.schema_version === 1 && binding.status === 'PASS' && binding.run_id === buildResult.run_id
    && binding.source_commit === buildResult.source_commit && binding.profile === buildResult.profile
    && binding.helper_sha256 === hash(helperBytes) && Array.isArray(binding.files), 'EVIDENCE_RUN_HELPER_BINDING_MISMATCH');
  const required = declared.filter((name) => name !== 'evidence/validation-binding.json');
  check(binding.files.length === required.length && new Set(binding.files.map((entry) => entry.path)).size === required.length,
    'EVIDENCE_BINDING_FILE_SET_MISMATCH');
  for (const name of required) {
    const entry = binding.files.find((item) => item.path === name);
    const bytes = read(name);
    check(entry && entry.size === bytes.length && entry.sha256 === hash(bytes), 'EVIDENCE_BINDING_HASH_MISMATCH');
  }
  const expectedChecks = ['logic', 'capture', 'version', 'v1_smoke', 'v1_cancel', 'v2_smoke', 'v2_cancel', 'v2_overlay_reject'];
  check(binding.exit_codes && Object.keys(binding.exit_codes).length === expectedChecks.length
    && expectedChecks.every((name) => binding.exit_codes[name] === 0), 'EVIDENCE_EXECUTION_FAILED');
  const pe = inspectV25Pe(helperBytes, profile);
  const analysis = json('pe-api-crt-analysis.json');
  check(analysis.schema_version === 1 && analysis.status === 'PASS' && analysis.files?.length === 1
    && analysis.files[0].path === 'helper.exe' && analysis.files[0].status === 'PASS' && analysis.files[0].x64 === true
    && analysis.files[0].forbidden_imports?.length === 0 && analysis.files[0].dynamic_crt_dependencies?.length === 0,
  'PE_ANALYSIS_NOT_PASS');
  check(/8664.*\(x64\)/i.test(text('pe-helper-headers.txt')), 'PE_HEADERS_EVIDENCE_MISMATCH');
  const dependencies = text('pe-helper-dependents.txt').toUpperCase();
  const imports = text('pe-helper-imports.txt');
  check(pe.dlls.every((dll) => dependencies.includes(dll)) && pe.apis.every((api) => imports.includes(api))
    && !profile.forbidden_imports.some((api) => imports.includes(api))
    && !/(?:VCRUNTIME[0-9_A-Z]*|MSVCP[0-9_A-Z]*|UCRTBASE|API-MS-WIN-CRT-[0-9A-Z-]+)\.DLL/i.test(`${dependencies}\n${imports}`), 'PE_RAW_EVIDENCE_MISMATCH');
  check(/(?:^|\n)logic_tests: ALL PASS(?:\r?\n|$)/.test(text('logic-tests.txt')), 'LOGIC_EVIDENCE_NOT_PASS');
  const capture = json('capture-selftest.json');
  check(capture.status === 'PASS' && capture.schema_version === 1 && capture.exit_code === 0
    && capture.output_object_count === 1 && capture.raw_bytes_persisted_before_decode === true && capture.strict_utf8 === true
    && capture.stdout_size === 11 && capture.stderr_size === 0 && capture.decoded_marker === 'D013_中文'
    && read('evidence/capture-selftest-stdout.bin').equals(Buffer.from('D013_中文'))
    && read('evidence/capture-selftest-stderr.bin').length === 0, 'CAPTURE_EVIDENCE_NOT_PASS');
  const selftest = json('return-package-selftest.json');
  check(selftest.schema_version === 1 && selftest.status === 'PASS' && selftest.scenario === 'synthetic TOKEN_CREATE_FAILED'
    && selftest.expected_candidate_eligible === false, 'RETURN_SELFTEST_NOT_PASS');
  check(text('build-transcript.txt').length > 0, 'BUILD_TRANSCRIPT_EMPTY');
  check(text('version-stdout.txt') === 'win7-agent-helper 1.3.0-d013-v25 win7-x64 profiles=v1-low-risk,v2-current-user', 'VERSION_EVIDENCE_MISMATCH');
  for (const stem of ['version', 'smoke', 'cancel-smoke', 'v25-smoke', 'v25-cancel-smoke', 'v25-env-overlay-reject']) {
    check(text(`${stem}-stderr.txt`) === '', 'SMOKE_STDERR_NOT_EMPTY');
  }
  const v1 = json('smoke-stdout.txt');
  const v1Cancel = json('cancel-smoke-stdout.txt');
  for (const [result, id] of [[v1, 'd013-smoke'], [v1Cancel, 'd013-cancel-smoke']]) {
    check(result.schema_version === 1 && result.type === 'execution_result' && result.status === 'completed'
      && result.requestId === id && result.containmentVerified === true && result.inputDetached === true
      && result.timedOut === false && result.idleTimedOut === false
      && Array.isArray(result.aclChanges) && result.aclChanges.length > 0
      && result.aclChanges.every((entry) => entry.applied === true && entry.verified === true && entry.rolledBack === true), 'V1_SMOKE_PROOF_INVALID');
    const token = result.tokenAudit;
    check(token?.source === 'suspended_child_process_token' && token.verified === true && token.isRestricted === true
      && token.tokenType === 'primary' && token.restrictedSidSetVerified === true && token.userRestrictedSid === true
      && token.worldRestrictedSid === true && token.administratorsRestrictedSid === false && token.restrictedSidCount >= 2
      && token.integritySid === 'S-1-16-4096' && token.integrityRid === 4096
      && result.hostJob?.childJobAssignmentVerified === true, 'V1_TOKEN_PROOF_INVALID');
  }
  check(v1.aclChanges.length === 2 && v1.aclChanges.some((entry) => entry.mechanism === 'low_integrity_label')
    && v1.aclChanges.some((entry) => entry.mechanism === 'deny_ace')
    && v1Cancel.aclChanges.length === 1 && v1Cancel.aclChanges[0].mechanism === 'low_integrity_label', 'V1_ACL_PROOF_INVALID');
  check(v1.exitCode === 0 && v1Cancel.canceled === true
    && Buffer.from(v1.stdoutBase64, 'base64').toString('utf8').includes('D013_NATIVE_SMOKE'), 'V1_SMOKE_RESULT_INVALID');
  for (const [stem, id, canceled] of [['v25-smoke', 'd013-v25-smoke', false], ['v25-cancel-smoke', 'd013-v25-cancel', true]]) {
    let lines;
    try { lines = text(`${stem}-stdout.txt`).split(/\r?\n/).map((line) => JSON.parse(line)); }
    catch (_error) { throw new Error('A9_V25_SMOKE_JSON_INVALID'); }
    check(lines.length === 2, 'SMOKE_READY_RESULT_COUNT');
    const [started, result] = lines;
    for (const item of lines) {
      check(item.schemaVersion === 2 && item.requestId === id && item.profileId === 'a9-trusted-shell-current-user-v1'
        && item.tokenAudit?.tokenMode === 'current_user' && item.tokenAudit.restrictedToken === false
        && item.tokenAudit.lowIntegrity === false && item.tokenAudit.sameUser === true
        && item.tokenAudit.verified === true && item.tokenAudit.tokenType === 'primary'
        && item.tokenAudit.source === 'suspended_child_process_token', 'SMOKE_IDENTITY_PROOF_INVALID');
    }
    check(started.type === 'execution_started' && Number.isSafeInteger(started.childPid) && started.childPid > 0
      && ['childJobAssignmentVerified', 'inputDetached', 'stdoutCaptureReady', 'stderrCaptureReady'].every((key) => started.ready?.[key] === true), 'SMOKE_READY_PROOF_INVALID');
    check(result.type === 'execution_result' && result.status === 'completed' && result.canceled === canceled && result.timedOut === false && result.idleTimedOut === false
      && result.containmentVerified === true && result.inputDetached === true && result.cleanupConfirmed === true
      && result.workDirAclModified === false && result.hostJob?.childJobAssignmentVerified === true, 'SMOKE_CLEANUP_PROOF_INVALID');
    if (!canceled) check(result.exitCode === 0 && Buffer.from(result.stdoutBase64, 'base64').toString('utf8').includes('D013_V25_CURRENT_USER'), 'SMOKE_OUTPUT_INVALID');
  }
  const rejection = json('v25-env-overlay-reject-stdout.txt');
  check(rejection.type === 'error' && rejection.error === 'JSON_PARSE_FAILED'
    && !text('v25-env-overlay-reject-stdout.txt').includes('D013_FORBIDDEN_OVERLAY_VALUE'), 'SMOKE_OVERLAY_REJECTION_INVALID');
  return { helperSha256: binding.helper_sha256, bindingSha256: hash(read('evidence/validation-binding.json')) };
}
