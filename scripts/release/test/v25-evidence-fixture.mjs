// Structural fixtures only. These bytes are never executed or accepted as
// Windows evidence outside an explicitly test-only approved-kit registry.
export function syntheticV25Pe({ dll = 'KERNEL32.dll', api = 'GetLastError', characteristics = 2 } = {}) {
  const bytes = Buffer.alloc(0x1200);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.writeUInt32LE(0x4550, 0x80);
  bytes.writeUInt16LE(0x8664, 0x84);
  bytes.writeUInt16LE(1, 0x86);
  bytes.writeUInt16LE(240, 0x94);
  bytes.writeUInt16LE(characteristics, 0x96);
  const optional = 0x98;
  bytes.writeUInt16LE(0x20b, optional);
  bytes.writeUInt16LE(6, optional + 40);
  bytes.writeUInt16LE(1, optional + 42);
  bytes.writeUInt16LE(6, optional + 48);
  bytes.writeUInt16LE(1, optional + 50);
  bytes.writeUInt16LE(3, optional + 68);
  bytes.writeUInt32LE(16, optional + 108);
  bytes.writeUInt32LE(0x1000, optional + 120);
  bytes.writeUInt32LE(40, optional + 124);
  bytes.writeUInt32LE(0x1200, optional + 128);
  bytes.writeUInt32LE(0x500, optional + 132);
  const section = optional + 240;
  bytes.write('.rdata', section, 'ascii');
  bytes.writeUInt32LE(0x1000, section + 12);
  bytes.writeUInt32LE(0x1000, section + 16);
  bytes.writeUInt32LE(0x200, section + 20);
  bytes.writeUInt32LE(0x1080, 0x200);
  bytes.writeUInt32LE(0x1100, 0x20c);
  bytes.writeUInt32LE(0x1080, 0x210);
  bytes.writeUInt32LE(0x1140, 0x280);
  bytes.write(dll, 0x300, 'ascii');
  bytes.write(api, 0x342, 'ascii');
  for (const offset of [0x400, 0x418, 0x430]) bytes.writeUInt16LE(1, offset + 14);
  bytes.writeUInt32LE(24, 0x410);
  bytes.writeUInt32LE(0x80000018, 0x414);
  bytes.writeUInt32LE(1, 0x428);
  bytes.writeUInt32LE(0x80000030, 0x42c);
  bytes.writeUInt32LE(1033, 0x440);
  bytes.writeUInt32LE(0x48, 0x444);
  const xml = '<assembly><requestedExecutionLevel level="asInvoker" uiAccess="false"/><supportedOS Id="{35138b9a-5d96-4fbd-8e2d-a2440225f93a}"/></assembly>';
  bytes.writeUInt32LE(0x1300, 0x448);
  bytes.writeUInt32LE(Buffer.byteLength(xml), 0x44c);
  bytes.write(xml, 0x500, 'utf8');
  return bytes;
}

export function syntheticV25Evidence() {
  const tokenAudit = { tokenMode: 'current_user', restrictedToken: false, lowIntegrity: false, sameUser: true,
    source: 'suspended_child_process_token', verified: true, tokenType: 'primary' };
  const v2 = (id, canceled) => [
    {
      schemaVersion: 2, profileId: 'a9-trusted-shell-current-user-v1', requestId: id,
      type: 'execution_started', childPid: 123, tokenAudit,
      ready: { childJobAssignmentVerified: true, inputDetached: true, stdoutCaptureReady: true, stderrCaptureReady: true },
    },
    {
      schemaVersion: 2, profileId: 'a9-trusted-shell-current-user-v1', requestId: id,
      type: 'execution_result', status: 'completed', canceled, exitCode: 0, timedOut: false, idleTimedOut: false,
      containmentVerified: true, inputDetached: true, cleanupConfirmed: true, workDirAclModified: false,
      hostJob: { childJobAssignmentVerified: true }, tokenAudit,
      stdoutBase64: Buffer.from('D013_V25_CURRENT_USER').toString('base64'),
    },
  ].map((value) => JSON.stringify(value)).join('\n');
  const v1 = (id, canceled) => ({
    schema_version: 1, type: 'execution_result', status: 'completed', requestId: id, canceled, exitCode: 0, timedOut: false, idleTimedOut: false,
    containmentVerified: true, inputDetached: true, hostJob: { childJobAssignmentVerified: true },
    tokenAudit: { source: 'suspended_child_process_token', verified: true, isRestricted: true, tokenType: 'primary',
      restrictedSidSetVerified: true, userRestrictedSid: true, worldRestrictedSid: true, administratorsRestrictedSid: false,
      restrictedSidCount: 2, integritySid: 'S-1-16-4096', integrityRid: 4096 },
    aclChanges: (canceled ? ['low_integrity_label'] : ['low_integrity_label', 'deny_ace']).map((mechanism) => ({ mechanism, applied: true, verified: true, rolledBack: true })),
    stdoutBase64: Buffer.from('D013_NATIVE_SMOKE').toString('base64'),
  });
  const files = {
    'pe-helper-headers.txt': '8664 machine (x64)',
    'pe-helper-dependents.txt': 'KERNEL32.dll',
    'pe-helper-imports.txt': 'KERNEL32.dll GetLastError',
    'logic-tests.txt': 'logic_tests: ALL PASS\n',
    'capture-selftest-stdout.bin': 'D013_中文',
    'capture-selftest-stderr.bin': '',
    'build-transcript.txt': 'synthetic test transcript, not Windows execution',
    'version-stdout.txt': 'win7-agent-helper 1.3.0-d013-v25 win7-x64 profiles=v1-low-risk,v2-current-user',
    'v25-smoke-stdout.txt': v2('d013-v25-smoke', false),
    'v25-cancel-smoke-stdout.txt': v2('d013-v25-cancel', true),
  };
  for (const stem of ['version', 'smoke', 'cancel-smoke', 'v25-smoke', 'v25-cancel-smoke', 'v25-env-overlay-reject']) files[`${stem}-stderr.txt`] = '';
  for (const [name, value] of Object.entries({
    'pe-api-crt-analysis.json': {
      schema_version: 1, status: 'PASS', files: [{ path: 'helper.exe', status: 'PASS', x64: true, forbidden_imports: [], dynamic_crt_dependencies: [] }],
    },
    'capture-selftest.json': {
      schema_version: 1, status: 'PASS', exit_code: 0, output_object_count: 1,
      raw_bytes_persisted_before_decode: true, strict_utf8: true, stdout_size: 11, stderr_size: 0, decoded_marker: 'D013_中文',
    },
    'return-package-selftest.json': { schema_version: 1, status: 'PASS', scenario: 'synthetic TOKEN_CREATE_FAILED', expected_candidate_eligible: false },
    'smoke-stdout.txt': v1('d013-smoke', false),
    'cancel-smoke-stdout.txt': v1('d013-cancel-smoke', true),
    'v25-env-overlay-reject-stdout.txt': { type: 'error', error: 'JSON_PARSE_FAILED' },
  })) files[name] = JSON.stringify(value);
  return files;
}
