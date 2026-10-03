import crypto from 'node:crypto';

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const check = (condition, code) => { if (!condition) throw new Error(`A9_V26_${code}`); };

export const requiredV26Evidence = [
  'environment.json', 'input-verification.json', 'build-result.json',
  'pe-api-crt-analysis.json', 'pe-helper-headers.txt', 'pe-helper-dependents.txt', 'pe-helper-imports.txt',
  'logic-tests.txt', 'return-package-selftest.json', 'capture-selftest.json',
  'capture-selftest-stdout.bin', 'capture-selftest-stderr.bin', 'build-transcript.txt',
  'version-stdout.txt', 'version-stderr.txt', 'smoke-stdout.txt', 'smoke-stderr.txt',
  'cancel-smoke-stdout.txt', 'cancel-smoke-stderr.txt', 'v25-smoke-stdout.txt', 'v25-smoke-stderr.txt',
  'v25-smoke-request.json', 'v25-smoke-response.jsonl', 'v25-smoke-marker.bin',
  'v25-cancel-smoke-stdout.txt', 'v25-cancel-smoke-stderr.txt',
  'v25-env-overlay-reject-stdout.txt', 'v25-env-overlay-reject-stderr.txt',
].concat(['v26-streaming.json', 'v26-tools.json', ...['tick','utf8','cp936','utf16le','limit','cancel','backpressure'].flatMap((name) => [`v26-${name}-request.json`, `v26-${name}-stdout.jsonl`, `v26-${name}-stderr.bin`])]).map((name) => `evidence/${name}`);

export const requiredV26ManagedEvidence = ['evidence/v26-managed.json', ...['release', 'cancel', 'cancel-release', 'release-cancel'].flatMap((name) =>
  ['request.json', 'stdout.jsonl', 'stderr.bin'].map((suffix) => `evidence/v26-managed-${name}-${suffix}`))];

export function verifyV26ManagedEvidence(read) {
  const json = (name) => JSON.parse(read('evidence/' + name).toString('utf8').replace(/^\uFEFF/, ''));
  const summary = json('v26-managed.json');
  check(summary.schema_version === 2 && summary.revision === 'a9-31-managed-r1' && Array.isArray(summary.rows)
    && summary.rows.length === 4 && new Set(summary.rows.map((r) => r.name)).size === 4, 'MANAGED_MATRIX_INVALID');
  for (const name of ['release', 'cancel', 'cancel-release', 'release-cancel']) {
    const row = summary.rows.find((r) => r.name === name), req = json(`v26-managed-${name}-request.json`);
    check(row && req.schemaVersion === 3 && req.profileId === 'a9-trusted-shell-current-user-v2' && req.managed === true
      && req.requestId === 'd013-v26-managed-' + name && req.maxStdoutBytes === 1048576 && req.maxStderrBytes === 1048576, 'MANAGED_REQUEST_INVALID');
    const bytes = read(`evidence/v26-managed-${name}-stdout.jsonl`);
    check(bytes.length > 0 && bytes.length <= 4 * 1024 * 1024 && bytes.at(-1) === 10 && read(`evidence/v26-managed-${name}-stderr.bin`).length === 0, 'MANAGED_CAPTURE_INVALID');
    const frames = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trimEnd().split('\n').map((line) => { check(Buffer.byteLength(line) <= 32768, 'MANAGED_FRAME_LIMIT'); return JSON.parse(line); });
    const ready = frames.shift(), terminal = frames.pop();
    check(exact(ready, ['schemaVersion','profileId','requestId','type','helperPid','childPid','tokenAudit','ready']) && uint(ready.helperPid) && ready.helperPid > 0 && uint(ready.childPid) && ready.childPid > 0
      && ready?.type === 'execution_started' && ready.requestId === req.requestId && ready.helperPid === row.helper_pid && ready.childPid === row.root_pid
      && ready.schemaVersion === 3 && ready.profileId === req.profileId && ready.ready?.childJobAssignmentVerified === true
      && exact(ready.ready, ['childJobAssignmentVerified','inputDetached','stdoutCaptureReady','stderrCaptureReady'])
      && Object.values(ready.ready).every((v) => v === true) && tokenProof(ready.tokenAudit), 'MANAGED_READY_INVALID');
    let seq = 0; const offsets = { stdout: 0, stderr: 0 }, captured = { stdout: [], stderr: [] };
    for (const frame of frames) {
      check(exact(frame, ['schemaVersion','type','requestId','profileId','seq','stream','streamOffset','byteLength','dataBase64']) && frame.type === 'output_chunk' && frame.schemaVersion === 3 && frame.requestId === req.requestId && frame.profileId === req.profileId
        && ['stdout','stderr'].includes(frame.stream) && frame.seq === ++seq && frame.streamOffset === offsets[frame.stream]
        && Number.isSafeInteger(frame.byteLength) && frame.byteLength > 0 && frame.byteLength <= 16384, 'MANAGED_OUTPUT_ORDER');
      const data = Buffer.from(frame.dataBase64, 'base64'); check(data.toString('base64') === frame.dataBase64 && data.length === frame.byteLength, 'MANAGED_OUTPUT_BYTES');
      captured[frame.stream].push(data); offsets[frame.stream] += data.length;
      check(offsets[frame.stream] <= 1048576 && seq <= 8192, 'MANAGED_OUTPUT_LIMIT');
    }
    const marker = /A9_RELEASE_CHILD:([0-9]+):([0-9]+)[\r\n]/.exec(Buffer.concat(captured.stdout).toString('utf8'));
    const ticks = (value) => typeof value === 'string' && /^[1-9][0-9]{15,18}$/.test(value) && BigInt(value) <= 3155378975999999999n;
    const exitCode = (value) => Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647;
    check(marker && uint(row.helper_pid) && row.helper_pid > 0 && uint(row.root_pid) && row.root_pid > 0
      && uint(row.child_pid) && row.child_pid > 0 && Number(marker[1]) === row.child_pid && marker[2] === row.child_start_ticks
      && row.child_pid !== row.root_pid && row.child_pid !== row.helper_pid && row.root_pid !== row.helper_pid
      && row.root_parent_pid === row.helper_pid && row.child_parent_pid === row.root_pid
      && ticks(row.helper_start_ticks) && ticks(row.root_start_ticks) && ticks(row.child_start_ticks)
      && BigInt(row.helper_start_ticks) <= BigInt(row.root_start_ticks) && BigInt(row.root_start_ticks) <= BigInt(row.child_start_ticks)
      && exitCode(row.root_exit_code) && exitCode(row.child_exit_code)
      && row.identity_pinned_before_control === true && row.lifecycle_settled === true && row.exit_code === 0
      && uint(row.elapsed_ms) && row.elapsed_ms <= 30000 && Array.isArray(row.frame_times_ms)
      && row.frame_times_ms.length === frames.length + 2 && row.frame_times_ms.every((t, i, a) => Number.isSafeInteger(t) && t >= 0 && t <= row.elapsed_ms && (!i || t >= a[i-1])), 'MANAGED_LIFECYCLE_IDENTITY');
    check(terminal?.schemaVersion === 3 && terminal.requestId === req.requestId && terminal.profileId === req.profileId && terminal.lastOutputSeq === seq, 'MANAGED_TERMINAL_IDENTITY');
    for (const stream of ['stdout','stderr']) check(terminal[stream]?.rawBytesRead === offsets[stream] && terminal[stream].emittedBytes === offsets[stream] && terminal[stream].omittedBytes === 0, 'MANAGED_TERMINAL_COUNTS');
    const controls = row.control.split('\n').map((line) => JSON.parse(line));
    check(controls.every((c) => exact(c, c.type === 'release' ? ['schemaVersion','type','requestId','releaseId'] : ['schemaVersion','type','requestId']) && c.schemaVersion === 3 && c.requestId === req.requestId), 'MANAGED_CONTROL_BINDING');
    if (name === 'release' || name === 'release-cancel') check(exact(terminal, ['schemaVersion','type','requestId','profileId','releaseId','childPid','lastOutputSeq','stdout','stderr','jobKillOnCloseDisabled','ownershipReleased']) && controls.length === (name === 'release' ? 1 : 2) && controls[0].type === 'release' && controls[0].releaseId === 'release-' + name
      && (name !== 'release-cancel' || controls[1].type === 'cancel')
      && terminal.type === 'execution_released' && terminal.releaseId === controls[0].releaseId && terminal.childPid === ready.childPid
      && terminal.jobKillOnCloseDisabled === true && terminal.ownershipReleased === true && row.root_alive_after_helper_exit === true && row.child_alive_after_helper_exit === true
      && row.root_exit_code === 0 && row.child_exit_code === 0, 'MANAGED_RELEASE_NOT_PROVEN');
    else check(exact(terminal, ['schemaVersion','type','requestId','profileId','status','exitCode','executionTimeMs','timedOut','idleTimedOut','canceled','outputTruncated','containmentVerified','inputDetached','cleanupConfirmed','workDirAclModified','tokenAudit','hostJob','lastOutputSeq','stdout','stderr'])
      && tokenProof(terminal.tokenAudit) && terminal.containmentVerified === true && terminal.inputDetached === true && terminal.workDirAclModified === false
      && terminal.status === 'completed' && uint(terminal.exitCode) && uint(terminal.executionTimeMs) && terminal.timedOut === false && terminal.idleTimedOut === false && terminal.outputTruncated === false
      && exact(terminal.hostJob, ['detected','breakaway','limitFlags','childJobAssignmentVerified']) && terminal.hostJob.childJobAssignmentVerified === true
      && uint(terminal.hostJob.limitFlags) && typeof terminal.hostJob.detected === 'boolean'
      && (terminal.hostJob.detected ? ['explicit','silent'].includes(terminal.hostJob.breakaway) : terminal.hostJob.breakaway === 'none') && controls.length === (name === 'cancel' ? 1 : 2) && controls[0].type === 'cancel'
      && (name !== 'cancel-release' || (controls[1].type === 'release' && controls[1].releaseId === 'release-cancel-release'))
      && terminal.type === 'execution_result' && terminal.canceled === true && terminal.cleanupConfirmed === true
      && terminal.exitCode === (row.root_exit_code >>> 0)
      && row.root_alive_after_helper_exit === false && row.child_alive_after_helper_exit === false, 'MANAGED_CANCEL_NOT_PROVEN');
  }
  return { revision: 'a9-31-managed-r1', status: 'PASS_RELEASE_AND_CANCEL_LIFECYCLE' };
}

// Read the actual PE, not dumpbin's caller-supplied PASS summary. This reader
// deliberately rejects delay imports/ordinals and ambiguous or truncated RVAs.
export function inspectV26Pe(bytes, profile) {
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
    throw new Error('A9_V26_PE_IMPORT_NAME_UNTERMINATED');
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

export function verifyV26ReturnEvidence(read, helperBytes, buildResult, profile) {
  const json = (name) => {
    try { return JSON.parse(read(`evidence/${name}`).toString('utf8').replace(/^\uFEFF/, '')); }
    catch (_error) { throw new Error(`A9_V26_EVIDENCE_JSON_INVALID:${name}`); }
  };
  const text = (name) => read(`evidence/${name}`).toString('utf8').replace(/^\uFEFF/, '').trim();
  const declared = profile.delivery?.evidence;
  const managed = profile.profile === 'WIN10-VS2019-V142-SDK19041-D013-V26-MANAGED-X64';
  if (managed) { check(profile.managed_contract?.revision === 'a9-31-managed-r1'
    && profile.managed_contract.evidence_schema_version === 2 && profile.managed_contract.parent_process_probe === 'Toolhelp32'
    && profile.managed_contract.release_natural_exit_code === 0
    && requiredV26ManagedEvidence.every((name) => declared?.includes(name)), 'MANAGED_PROFILE_CLOSURE'); verifyV26ManagedEvidence(read); }
  const artifact = buildResult.artifacts?.find((entry) => entry.path === 'helper.exe');
  check(artifact && artifact.size === helperBytes.length && artifact.sha256 === hash(helperBytes), 'BUILD_ARTIFACT_BINDING_MISMATCH');
  check(Array.isArray(declared) && requiredV26Evidence.every((name) => declared.includes(name))
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
  const expectedChecks = ['logic', 'capture', 'version', 'v1_smoke', 'v1_cancel', 'v2_smoke', 'v2_cancel', 'v2_overlay_reject', 'v3_streaming'];
  check(binding.exit_codes && Object.keys(binding.exit_codes).length === expectedChecks.length
    && expectedChecks.every((name) => binding.exit_codes[name] === 0), 'EVIDENCE_EXECUTION_FAILED');
  const pe = inspectV26Pe(helperBytes, profile);
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
  check(text('version-stdout.txt') === (managed ? 'win7-agent-helper 1.4.1-d013-v26-managed win7-x64 profiles=v1-low-risk,v2-current-user,v3-streaming,v3-managed-release' : 'win7-agent-helper 1.4.0-d013-v26 win7-x64 profiles=v1-low-risk,v2-current-user,v3-streaming'), 'VERSION_EVIDENCE_MISMATCH');
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
    catch (_error) { throw new Error('A9_V26_SMOKE_JSON_INVALID'); }
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
  const cmdRequest = json('v25-smoke-request.json');
  const cmdMarker = read('evidence/v25-smoke-marker.bin');
  check(cmdRequest.schemaVersion === 2 && cmdRequest.requestId === 'd013-v25-smoke'
    && cmdRequest.shellKind === 'cmd' && cmdRequest.command === cmdRequest.argv?.[3]
    && cmdRequest.argv?.length === 4
    && cmdRequest.argv.slice(0, 3).map((value) => String(value).toLowerCase()).join(' ') === '/d /s /c'
    && cmdRequest.command.includes('> "%A9_D013_MARKER_PATH%"')
    && cmdRequest.command.includes('& type "%A9_D013_MARKER_PATH%"')
    && typeof cmdRequest.envOverlay?.A9_D013_MARKER_PATH === 'string'
    && /(?:^|[\\/])中文 空格[\\/]cmd-current-user\.txt$/.test(cmdRequest.envOverlay.A9_D013_MARKER_PATH)
    && cmdMarker.equals(Buffer.from('D013_V25_CURRENT_USER', 'ascii')), 'CMD_VERBATIM_SMOKE_PROOF_INVALID');
  check(read('evidence/v25-smoke-response.jsonl').equals(read('evidence/v25-smoke-stdout.txt')),
    'CMD_VERBATIM_RESPONSE_CAPTURE_MISMATCH');
  const rejection = json('v25-env-overlay-reject-stdout.txt');
  check(rejection.type === 'error' && rejection.error === 'JSON_PARSE_FAILED'
    && !text('v25-env-overlay-reject-stdout.txt').includes('D013_FORBIDDEN_OVERLAY_VALUE'), 'SMOKE_OVERLAY_REJECTION_INVALID');
  verifyStreamingEvidence(read);
  const tools = JSON.parse(read('evidence/v26-tools.json').toString('utf8'));
  const toolIdentitySha256 = hash(Buffer.from(JSON.stringify(tools.tools.map((t) => ({name:t.path.split(/[\\/]/).at(-1).toLowerCase(),sha256:t.sha256})).sort((a,b)=>a.name.localeCompare(b.name)))));
  return { toolIdentitySha256, helperSha256: binding.helper_sha256, bindingSha256: hash(read('evidence/validation-binding.json')) };
}

const V3_PROFILE = 'a9-trusted-shell-current-user-v2';
const uint = (n) => Number.isSafeInteger(n) && n >= 0;
const exact = (v, names) => v && typeof v === 'object' && !Array.isArray(v)
  && JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...names].sort());
function tokenProof(v) {
  return exact(v, ['source','verified','tokenMode','tokenType','sameUser','restrictedToken','lowIntegrity','integrityRid','integritySid']) && v.source === 'suspended_child_process_token' && v.verified === true && v.tokenMode === 'current_user'
    && v.tokenType === 'primary' && v.sameUser === true && v.restrictedToken === false && v.lowIntegrity === false
    && uint(v.integrityRid) && v.integritySid === 'S-1-16-' + v.integrityRid;
}
export function verifyStreamingEvidence(read) {
  const json = (file) => {
    try { return JSON.parse(read('evidence/' + file).toString('utf8').replace(/^\uFEFF/, '')); }
    catch (_error) { throw new Error('A9_V26_STREAMING_JSON_INVALID'); }
  };
  const summary = json('v26-streaming.json');
  const tools = json('v26-tools.json');
  check(tools.schema_version === 1 && tools.tools?.length === 5 && new Set(tools.tools.map((t) => t.path)).size === 5
    && tools.tools.every((t) => typeof t.path === 'string' && /^[a-f0-9]{64}$/.test(t.sha256)), 'TOOL_IDENTITY_MISSING');
  for (const name of ['cl.exe','dumpbin.exe','mt.exe','vswhere.exe','powershell.exe']) check(tools.tools.some((t) => t.path.toLowerCase().endsWith('\\' + name)), 'TOOL_IDENTITY_MISSING');
  const names = ['tick','utf8','cp936','utf16le','limit','cancel','backpressure'];
  check(summary.schema_version === 1 && summary.rows?.length === names.length
    && new Set(summary.rows.map((row) => row.name)).size === names.length, 'STREAMING_MATRIX_INCOMPLETE');
  for (const name of names) {
    const row = summary.rows.find((r) => r.name === name);
    const request = json(`v26-${name}-request.json`);
    const raw = read(`evidence/v26-${name}-stdout.jsonl`);
    check(raw.length > 0 && raw.length <= 4 * 1024 * 1024 && raw[raw.length - 1] === 10, 'STREAMING_FRAME_CAPTURE_INVALID');
    const lines = new TextDecoder('utf-8', { fatal: true }).decode(raw).trimEnd().split('\n');
    check(lines.every((line) => Buffer.byteLength(line) <= 32768), 'STREAMING_FRAME_LIMIT');
    let frames;
    try { frames = lines.map((line) => JSON.parse(line)); }
    catch (_error) { throw new Error('A9_V26_STREAMING_JSON_INVALID'); }
    check(row && row.timed_out === false && row.reader_failed === false && uint(row.elapsed_ms) && row.elapsed_ms <= 20000
      && row.frame_times_ms?.length === frames.length && row.frame_times_ms.every((ms, i, all) => uint(ms) && ms <= row.elapsed_ms && (i === 0 || ms >= all[i - 1]))
      && read(`evidence/v26-${name}-stderr.bin`).length === 0, 'STREAMING_TIMING_INVALID');
    const expectedEncoding = name === 'cp936' ? 'cp936' : name === 'utf16le' ? 'utf-16le' : 'utf-8';
    check(request.schemaVersion === 3 && request.profileId === V3_PROFILE && request.requestId === 'd013-v26-' + name
      && request.outputEncoding?.stdout === expectedEncoding && request.outputEncoding?.stderr === expectedEncoding
      && request.shellKind === 'cmd' && request.command === request.argv?.[3] && request.argv.slice(0,3).join(' ') === '/d /s /c'
      && request.managed === false && request.maxStdoutBytes === (name === 'limit' ? 4096 : 1048576)
      && request.maxStderrBytes === 1048576, 'STREAMING_REQUEST_INVALID');
    const started = frames[0];
    check(exact(started, ['schemaVersion','profileId','requestId','type','helperPid','childPid','tokenAudit','ready']) && uint(started.helperPid) && started.helperPid > 0
      && started.type === 'execution_started' && uint(started.childPid) && started.childPid > 0 && tokenProof(started.tokenAudit)
      && exact(started.ready, ['childJobAssignmentVerified','inputDetached','stdoutCaptureReady','stderrCaptureReady'])
      && ['childJobAssignmentVerified','inputDetached','stdoutCaptureReady','stderrCaptureReady'].every((k) => started.ready?.[k] === true), 'STREAMING_READY_INVALID');
    const output = { stdout: [], stderr: [] }; const offsets = { stdout: 0, stderr: 0 }; const truncated = { stdout: false, stderr: false };
    let seq = 0; let terminal; let firstOutputMs;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      check(f.schemaVersion === 3 && f.requestId === request.requestId && f.profileId === V3_PROFILE && !terminal, 'STREAMING_IDENTITY_ORDER');
      if (i === 0) continue;
      if (f.type === 'output_chunk') {
        check(exact(f, ['schemaVersion','type','requestId','profileId','seq','stream','streamOffset','byteLength','dataBase64'])
          && ['stdout','stderr'].includes(f.stream) && f.seq === seq + 1 && f.streamOffset === offsets[f.stream]
          && uint(f.byteLength) && f.byteLength > 0 && f.byteLength <= 16384 && !truncated[f.stream] && typeof f.dataBase64 === 'string', 'STREAMING_SEQUENCE_INVALID');
        const bytes = Buffer.from(f.dataBase64, 'base64');
        check(bytes.toString('base64') === f.dataBase64 && bytes.length === f.byteLength
          && offsets[f.stream] + bytes.length <= (f.stream === 'stdout' ? request.maxStdoutBytes : request.maxStderrBytes), 'STREAMING_BYTES_INVALID');
        seq++; offsets[f.stream] += bytes.length; output[f.stream].push(bytes); firstOutputMs ??= row.frame_times_ms[i];
      } else if (f.type === 'output_truncated') {
        check(exact(f, ['schemaVersion','type','requestId','profileId','stream','reason']) && ['stdout','stderr'].includes(f.stream)
          && !truncated[f.stream] && f.reason === 'byte_limit' && offsets[f.stream] === (f.stream === 'stdout' ? request.maxStdoutBytes : request.maxStderrBytes), 'STREAMING_TRUNCATION_INVALID');
        truncated[f.stream] = true;
      } else {
        check(exact(f, ['schemaVersion','type','requestId','profileId','status','exitCode','executionTimeMs','timedOut','idleTimedOut','canceled','outputTruncated','containmentVerified','inputDetached','cleanupConfirmed','workDirAclModified','tokenAudit','hostJob','lastOutputSeq','stdout','stderr'])
          && f.type === 'execution_result' && Number.isSafeInteger(f.exitCode) && f.exitCode >= 0 && f.exitCode <= 4294967295
          && uint(f.executionTimeMs) && typeof f.canceled === 'boolean' && f.lastOutputSeq === seq && tokenProof(f.tokenAudit)
          && f.status === 'completed' && f.inputDetached === true && f.containmentVerified === true && f.cleanupConfirmed === true
          && f.workDirAclModified === false && f.hostJob?.childJobAssignmentVerified === true
          && exact(f.hostJob, ['detected','breakaway','limitFlags','childJobAssignmentVerified'])
          && typeof f.hostJob.detected === 'boolean' && uint(f.hostJob.limitFlags)
          && (f.hostJob.detected ? ['explicit','silent'].includes(f.hostJob.breakaway) : f.hostJob.breakaway === 'none')
          && f.timedOut === false && f.idleTimedOut === false && f.outputTruncated === (truncated.stdout || truncated.stderr), 'STREAMING_TERMINAL_INVALID');
        for (const stream of ['stdout','stderr']) {
          const c = f[stream]; check(exact(c, ['rawBytesRead','emittedBytes','omittedBytes']) && Object.values(c).every(uint)
            && c.emittedBytes === offsets[stream] && c.rawBytesRead === c.emittedBytes + c.omittedBytes
            && (truncated[stream] || c.omittedBytes === 0), 'STREAMING_COUNTS_INVALID');
        }
        terminal = f;
      }
    }
    if (name === 'backpressure') {
      check(row.slow_consumer_ms === 2500 && row.cancel_written === true && Number.isSafeInteger(row.exit_code) && row.elapsed_ms < 15000 && (row.exit_code !== 0 || terminal?.canceled === true), 'STREAMING_BACKPRESSURE_NOT_FAIL_CLOSED');
      // An absent terminal is explicitly unknown cleanup, never a success proof.
      continue;
    }
    check(terminal && row.exit_code === 0 && terminal.canceled === (name === 'cancel')
      && (name === 'cancel' || terminal.exitCode === 0), 'STREAMING_RESULT_MISSING');
    if (name === 'cancel') check(row.cancel_written === true && row.elapsed_ms < 10000, 'STREAMING_CANCEL_NOT_PROVEN');
    const out = Buffer.concat(output.stdout); const err = Buffer.concat(output.stderr);
    if (name === 'tick') check(out.toString().includes('tick-1') && out.toString().includes('tick-2') && err.toString().includes('stderr-tick')
      && firstOutputMs < 2000 && row.frame_times_ms.at(-1) - firstOutputMs >= 3500, 'STREAMING_NOT_LIVE');
    if (['utf8','cp936','utf16le'].includes(name)) check(new TextDecoder(expectedEncoding === 'cp936' ? 'gbk' : expectedEncoding, {fatal:true}).decode(out) === '中文 no-newline\r\n', 'STREAMING_ENCODING_BYTES');
    if (name === 'limit') check(out.equals(Buffer.alloc(4096, 'x')) && terminal.stdout.rawBytesRead === 32768 && truncated.stdout === true, 'STREAMING_LIMIT_NOT_PROVEN');
  }
}

// This validates the independent human review registration, not the review itself.
export function verifyV26ReturnReview(review, builds) {
  check(review?.status === 'APPROVED_FOR_INPUT_LOCK' && typeof review.independent_reviewer === 'string'
    && review.independent_reviewer.trim().length > 0 && typeof review.implementation_author === 'string'
    && review.implementation_author.trim().length > 0 && review.independent_reviewer !== review.implementation_author
    && typeof review.reviewed_at === 'string' && Number.isFinite(Date.parse(review.reviewed_at))
    && /^[a-f0-9]{64}$/.test(review.report_sha256 || '') && Array.isArray(review.builds)
    && review.builds.length === 2 && builds.length === 2, 'INDEPENDENT_RETURN_REVIEW_REQUIRED');
  check(new Set(review.builds.map((b) => b.run_id)).size === 2
    && builds.every((b) => review.builds.some((r) => exact(r, ['run_id','sha256']) && r.run_id === b.run_id && r.sha256 === b.sha256)),
    'INDEPENDENT_RETURN_REVIEW_BINDING_MISMATCH');
}
