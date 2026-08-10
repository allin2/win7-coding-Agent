/* Local protection/regression tests for the D-013 acceptance harness.
 *
 * These tests run on the build machine (macOS/Linux); they never connect to
 * Win7 and never touch SSH. They verify:
 *   1. the C04 authorization policy (ACL targets must live under the per-run
 *      root),
 *   2. the harness end-to-end flow against the mock helper (request shape,
 *      C06/C07 classification, evidence JSON schema),
 *   3. the orchestrator dry-run (no SSH/SCP, NOT_PERFORMED stages),
 *   4. the execute-mode gate requires a signed ADR-0065 lease before Runner
 *      construction or any SSH/SCP can occur,
 *   5. profile validation rejections.
 */
'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const PY = '/usr/bin/python3';
const NODE = process.execPath;
const HARNESS = path.join(HERE, 'run_d013_win7.py');
const ORCHESTRATOR = path.join(HERE, 'run_d013_win7.mjs');
const MOCK = path.join(HERE, 'mock_helper.py');
const PROFILE = path.join(HERE, 'd013_profile.json');
const ORCHESTRATOR_SOURCE = fs.readFileSync(ORCHESTRATOR, 'utf8');

function run(command, args, opts = {}) {
  return spawnSync(command, args, { encoding: 'utf8', shell: false, ...opts });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'd013-test-'));
let failures = 0;

function check(name, ok, detail = '') {
  if (ok) {
    process.stdout.write(`PASS ${name}\n`);
  } else {
    process.stdout.write(`FAIL ${name} ${detail}\n`);
    failures += 1;
  }
}

try {
  // ── 1. C04 authorization policy (pure logic, any host) ────────────────────
  const root = path.join(tempRoot, 'acceptance', 'A4-20260807-000001');
  fs.mkdirSync(path.join(root, 'inside'), { recursive: true });
  const insideTarget = path.join(root, 'inside');
  const outsideTarget = path.join(tempRoot, 'elsewhere');

  const allow = run(PY, [HARNESS, '--check-policy', root, insideTarget]);
  check('policy allows in-root target', allow.status === 0 && /"allowed": true/.test(allow.stdout));

  const deny = run(PY, [HARNESS, '--check-policy', root, outsideTarget]);
  check('policy refuses out-of-root target', deny.status === 1 && /"allowed": false/.test(deny.stdout));

  // ── 2. Harness end-to-end against the mock helper ─────────────────────────
  const acceptanceRoot = path.join(tempRoot, 'acceptance-root');
  const harnessRoot = path.join(acceptanceRoot, 'harness-root');
  const fixtures = path.join(tempRoot, 'fixtures.json');
  const requestLog = path.join(tempRoot, 'requests.json');
  const resultsOut = path.join(tempRoot, 'results.json');
  // The harness creates the protected dir at <harnessRoot>/protected-outside.
  const protectedDir = path.join(harnessRoot, 'protected-outside');

  fs.writeFileSync(fixtures, JSON.stringify({
    'c03-restricted-boundary': { schema_version: 1, type: 'execution_result', requestId: 'c03-restricted-boundary', status: 'completed', exitCode: 0, executionTimeMs: 30, timedOut: false, canceled: false, outputTruncated: false, containmentVerified: true, inputDetached: true, tokenAudit: { source: 'suspended_child_process_token', verified: true, isRestricted: true, tokenType: 'primary', restrictedSidSetVerified: true, userRestrictedSid: true, worldRestrictedSid: true, administratorsRestrictedSid: false, restrictedSidCount: 8, integritySid: 'S-1-16-4096', integrityRid: 4096 }, stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '', aclChanges: [{ path: path.join(harnessRoot, 'c03-boundary'), mechanism: 'low_integrity_label', applied: true, verified: true, rolledBack: true, error: '' }] },
    'c06-argv-reject': { schema_version: 1, type: 'error', requestId: 'c06-argv-reject', error: 'ARGV_REJECTED', message: 'mock' },
    'c06-cmd-k-reject': { schema_version: 1, type: 'error', requestId: 'c06-cmd-k-reject', error: 'ARGV_REJECTED', message: 'mock' },
    'c07-timeout': { schema_version: 1, type: 'execution_result', requestId: 'c07-timeout', status: 'completed', exitCode: 1, executionTimeMs: 3005, timedOut: true, canceled: false, outputTruncated: false, containmentVerified: true, inputDetached: true, stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '', aclChanges: [] },
    'c07-output-cap': { schema_version: 1, type: 'execution_result', requestId: 'c07-output-cap', status: 'completed', exitCode: 0, executionTimeMs: 50, timedOut: false, canceled: false, outputTruncated: true, containmentVerified: true, inputDetached: true, stdoutSize: 500, stderrSize: 0, stdoutBase64: '', stderrBase64: '', aclChanges: [] },
    'c04-acl-boundary': { schema_version: 1, type: 'execution_result', requestId: 'c04-acl-boundary', status: 'completed', exitCode: 0, executionTimeMs: 30, timedOut: false, canceled: false, outputTruncated: false, containmentVerified: true, inputDetached: true, stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '', aclChanges: [{ path: protectedDir, mechanism: 'deny_ace', applied: true, verified: true, rolledBack: true, error: '' }] },
  }));

  fs.chmodSync(MOCK, 0o755);
  const harnessRun = run(PY, [HARNESS, '--acceptance-id', 'A4-20260807-000001', '--helper', MOCK,
    '--root', harnessRoot, '--acceptance-root', acceptanceRoot, '--out', resultsOut], {
    env: { ...process.env, D013_MOCK_FIXTURES: fixtures, D013_MOCK_LOG: requestLog, D013_MOCK_SIDE_EFFECTS: '1' },
    timeout: 60000,
  });
  check('harness completes with mock helper', harnessRun.status === 1, harnessRun.stderr);
  check('harness writes evidence JSON', fs.existsSync(resultsOut), harnessRun.stderr);

  const results = JSON.parse(fs.readFileSync(resultsOut, 'utf8'));
  check('evidence schema', results.schema_version === 1 && Array.isArray(results.cases) && results.taskkill_used === false);
  check('evidence scope records C05 formal classification', results.scope?.formal_c05 === 'ENVIRONMENT_MISSING');
  const byId = Object.fromEntries(results.cases.map((c) => [c.id, c.status]));
  check('C06 classified PASS (ARGV_REJECTED from helper)', byId['C06-argv-whitelist'] === 'PASS');
  check('C07-timeout classified PASS (fixture)', byId['C07-timeout-process-tree'] === 'PASS');
  check('C07-output-cap classified PASS (fixture)', byId['C07-output-cap'] === 'PASS');
  check('C04-authorization-gate classified PASS (policy)', byId['C04-authorization-gate'] === 'PASS');
  check('C03 classification requires trusted suspended-child token audit',
    byId['C03-restricted-token-boundary'] === 'PASS'
      && results.cases.find((entry) => entry.id === 'C03-restricted-token-boundary')
        ?.token_evidence?.trusted_child_token_audit?.integritySid === 'S-1-16-4096');
  // The remaining file/process/network cases cannot pass on a non-Windows
  // host; this proves the local fixture does not fake their target evidence.
  check('C01/C05 NOT faked on non-Windows host',
    ['C01-job-tree-kill', 'C05-loopback-network']
      .every((id) => byId[id] === 'FAIL'));

  // A helper response that claims verification but binds the wrong integrity
  // SID must still fail closed. This protects the exact C03 trust contract.
  const badAuditRoot = path.join(acceptanceRoot, 'bad-audit-root');
  const badAuditOut = path.join(tempRoot, 'bad-audit-results.json');
  fs.writeFileSync(fixtures, JSON.stringify({
    'c03-restricted-boundary': { schema_version: 1, type: 'execution_result', requestId: 'c03-restricted-boundary', status: 'completed', exitCode: 0, executionTimeMs: 30, timedOut: false, canceled: false, outputTruncated: false, containmentVerified: true, inputDetached: true, tokenAudit: { source: 'suspended_child_process_token', verified: true, isRestricted: true, tokenType: 'primary', restrictedSidSetVerified: true, userRestrictedSid: true, worldRestrictedSid: true, administratorsRestrictedSid: false, restrictedSidCount: 8, integritySid: 'S-1-16-8192', integrityRid: 8192 }, stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '', aclChanges: [{ path: path.join(badAuditRoot, 'c03-boundary'), mechanism: 'low_integrity_label', applied: true, verified: true, rolledBack: true, error: '' }] },
  }));
  const badAuditRun = run(PY, [HARNESS, '--acceptance-id', 'A4-20260807-000009', '--helper', MOCK,
    '--root', badAuditRoot, '--acceptance-root', acceptanceRoot, '--out', badAuditOut], {
    env: { ...process.env, D013_MOCK_FIXTURES: fixtures, D013_MOCK_LOG: requestLog, D013_MOCK_SIDE_EFFECTS: '1' },
    timeout: 60000,
  });
  const badAuditResults = JSON.parse(fs.readFileSync(badAuditOut, 'utf8'));
  check('C03 rejects a mismatched trusted integrity SID', badAuditRun.status === 1
    && badAuditResults.cases.find((entry) => entry.id === 'C03-restricted-token-boundary')?.status === 'FAIL');

  // Reproduce the v17 construction/audit contradiction: claiming a restricted
  // token without the sole World restricting SID must fail closed even when
  // every Low Integrity field is otherwise correct.
  const missingWorldRoot = path.join(acceptanceRoot, 'missing-world-root');
  const missingWorldOut = path.join(tempRoot, 'missing-world-results.json');
  fs.writeFileSync(fixtures, JSON.stringify({
    'c03-restricted-boundary': { schema_version: 1, type: 'execution_result', requestId: 'c03-restricted-boundary', status: 'completed', exitCode: 0, executionTimeMs: 30, timedOut: false, canceled: false, outputTruncated: false, containmentVerified: true, inputDetached: true, tokenAudit: { source: 'suspended_child_process_token', verified: true, isRestricted: false, tokenType: 'primary', restrictedSidSetVerified: false, userRestrictedSid: false, worldRestrictedSid: false, administratorsRestrictedSid: false, restrictedSidCount: 0, integritySid: 'S-1-16-4096', integrityRid: 4096 }, stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '', aclChanges: [{ path: path.join(missingWorldRoot, 'c03-boundary'), mechanism: 'low_integrity_label', applied: true, verified: true, rolledBack: true, error: '' }] },
  }));
  const missingWorldRun = run(PY, [HARNESS, '--acceptance-id', 'A4-20260807-000010', '--helper', MOCK,
    '--root', missingWorldRoot, '--acceptance-root', acceptanceRoot, '--out', missingWorldOut], {
    env: { ...process.env, D013_MOCK_FIXTURES: fixtures, D013_MOCK_LOG: requestLog, D013_MOCK_SIDE_EFFECTS: '1' },
    timeout: 60000,
  });
  const missingWorldResults = JSON.parse(fs.readFileSync(missingWorldOut, 'utf8'));
  check('C03 rejects the v17 empty restricting-SID contract', missingWorldRun.status === 1
    && missingWorldResults.cases.find((entry) => entry.id === 'C03-restricted-token-boundary')?.status === 'FAIL');

  // The remaining v19 audit flags must each be independently fail-closed.
  // In particular, v18's sole-World set is not accepted even though it makes
  // IsTokenRestricted true: it does not preserve user/group/logon ACL grants.
  const negativeSidAudits = [
    {
      name: 'v18 sole-World restricting-SID contract',
      patch: { restrictedSidSetVerified: false, userRestrictedSid: false, worldRestrictedSid: true,
        administratorsRestrictedSid: false, restrictedSidCount: 1 },
    },
    {
      name: 'child/source restricting-SID set mismatch',
      patch: { restrictedSidSetVerified: false, userRestrictedSid: true, worldRestrictedSid: true,
        administratorsRestrictedSid: false, restrictedSidCount: 7 },
    },
    {
      name: 'Administrators in restricting-SID set',
      patch: { restrictedSidSetVerified: false, userRestrictedSid: true, worldRestrictedSid: true,
        administratorsRestrictedSid: true, restrictedSidCount: 9 },
    },
    {
      name: 'missing user restricting SID',
      patch: { restrictedSidSetVerified: false, userRestrictedSid: false, worldRestrictedSid: true,
        administratorsRestrictedSid: false, restrictedSidCount: 7 },
    },
  ];
  for (let index = 0; index < negativeSidAudits.length; index += 1) {
    const negative = negativeSidAudits[index];
    const root = path.join(acceptanceRoot, `sid-negative-${index}`);
    const out = path.join(tempRoot, `sid-negative-${index}.json`);
    fs.writeFileSync(fixtures, JSON.stringify({
      'c03-restricted-boundary': {
        schema_version: 1, type: 'execution_result', requestId: 'c03-restricted-boundary',
        status: 'completed', exitCode: 0, executionTimeMs: 30, timedOut: false,
        canceled: false, outputTruncated: false, containmentVerified: true,
        inputDetached: true,
        tokenAudit: {
          source: 'suspended_child_process_token', verified: true, isRestricted: true,
          tokenType: 'primary', integritySid: 'S-1-16-4096', integrityRid: 4096,
          ...negative.patch,
        },
        stdoutSize: 0, stderrSize: 0, stdoutBase64: '', stderrBase64: '',
        aclChanges: [{ path: path.join(root, 'c03-boundary'), mechanism: 'low_integrity_label',
          applied: true, verified: true, rolledBack: true, error: '' }],
      },
    }));
    const negativeRun = run(PY, [HARNESS, '--acceptance-id', `A4-20260807-00002${index}`,
      '--helper', MOCK, '--root', root, '--acceptance-root', acceptanceRoot, '--out', out], {
      env: { ...process.env, D013_MOCK_FIXTURES: fixtures, D013_MOCK_LOG: requestLog,
        D013_MOCK_SIDE_EFFECTS: '1' },
      timeout: 60000,
    });
    const negativeResults = JSON.parse(fs.readFileSync(out, 'utf8'));
    check(`C03 rejects ${negative.name}`, negativeRun.status === 1
      && negativeResults.cases.find((entry) => entry.id === 'C03-restricted-token-boundary')?.status === 'FAIL');
  }

  // Request-shape recording: the harness must send the right protocol.
  const requests = JSON.parse(fs.readFileSync(requestLog, 'utf8'));
  const c03Request = requests.find((r) => r.requestId === 'c03-restricted-boundary');
  const c04Request = requests.find((r) => r.requestId === 'c04-acl-boundary');
  const c06Request = requests.find((r) => r.requestId === 'c06-argv-reject');
  check('C03 request carries allowedDirectories under root',
    c03Request && c03Request.allowedDirectories && c03Request.allowedDirectories[0].startsWith(harnessRoot));
  check('C04 request carries protectedDirectories under root',
    c04Request && c04Request.protectedDirectories && c04Request.protectedDirectories[0].startsWith(harnessRoot));
  check('C06 request targets non-whitelisted executable',
    c06Request && /notepad\.exe$/i.test(c06Request.executable));
  check('requests use structured argv (array, no shell string)',
    requests.every((r) => Array.isArray(r.argv)));

  // ── 3. Orchestrator dry-run ────────────────────────────────────────────────
  const dryOut = path.join(tempRoot, 'dry.json');
  const dry = run(NODE, [ORCHESTRATOR, '--dry-run', '--acceptance-id', 'A4-20260807-000002', '--out', dryOut], { timeout: 60000 });
  check('orchestrator dry-run exits 0', dry.status === 0, dry.stderr);
  const dryReport = JSON.parse(fs.readFileSync(dryOut, 'utf8'));
  check('dry-run report mode', dryReport.mode === 'DRY_RUN' && dryReport.result.automatic_status === 'DRY_RUN');
  check('dry-run never executes SSH/SCP',
    dryReport.stages.every((s) => s.commands.every((c) => c.command !== 'ssh' && c.command !== 'scp')));
  check('dry-run stages are NOT_PERFORMED', dryReport.stages.every((s) => s.status === 'NOT_PERFORMED'));
  check('dry-run safety: win7 not connected', dryReport.safety.win7_connected === false);
  check('worker only emits candidate evidence', ORCHESTRATOR_SOURCE.includes('D013_CANDIDATE_EVIDENCE')
    && ORCHESTRATOR_SOURCE.includes("classification: 'CANDIDATE_EVIDENCE'")
    && !ORCHESTRATOR_SOURCE.includes('D013_EXECUTION_PASS'));
  check('evidence retrieval captures remote and local SHA-256',
    ORCHESTRATOR_SOURCE.includes("'EVIDENCE_REMOTE_HASH_FAILED'")
      && ORCHESTRATOR_SOURCE.includes("'EVIDENCE_HASH_MISMATCH'")
      && ORCHESTRATOR_SOURCE.includes('remote_sha256: remoteHash')
      && ORCHESTRATOR_SOURCE.includes('local_sha256: localHash'));
  check('empty evidence uses fail-closed Win7 zero-length fallback',
    ORCHESTRATOR_SOURCE.includes('ZERO_LENGTH_CANONICAL_AFTER_CERTUTIL_FAILURE')
      && ORCHESTRATOR_SOURCE.includes("const EMPTY_SHA256 = 'e3b0c442")
      && ORCHESTRATOR_SOURCE.includes('remoteSize === 0')
      && ORCHESTRATOR_SOURCE.includes('attempt <= 3'));
  check('evidence download loop is unique',
    (ORCHESTRATOR_SOURCE.match(/for \(const name of this\.profile\.remote\.evidence_files\)/g) || []).length === 1);
  check('preflight documents CreateProcessAsUserW path',
    ORCHESTRATOR_SOURCE.includes('restricted primary token uses CreateProcessAsUserW')
      && !ORCHESTRATOR_SOURCE.includes('CreateProcessWithTokenW usable'));
  check('fixed Ed25519 public key replaces mutable profile grant',
    ORCHESTRATOR_SOURCE.includes("win7_coordinator/lease_public.pem")
      && ORCHESTRATOR_SOURCE.includes('verifyLeaseFiles(')
      && !ORCHESTRATOR_SOURCE.includes("gates['GATE-WIN7-LEASE'] !== 'GRANTED'"));

  // ── 4. Execute-mode gate: signed lease arguments are mandatory ────────────
  const profile = JSON.parse(fs.readFileSync(PROFILE, 'utf8'));
  const execOut = path.join(tempRoot, 'exec.json');
  const execRun = run(NODE, [ORCHESTRATOR, '--execute-win7', '--acceptance-id', 'A4-20260807-000003', '--out', execOut], { timeout: 60000 });
  check('execute-mode exits non-zero without lease', execRun.status === 1, execRun.stderr);
  check('missing signed lease is rejected before report or SSH',
    /requires --lease-payload/.test(execRun.stderr) && !fs.existsSync(execOut));
  check('profile cannot self-grant Win7 lease',
    profile.gates['GATE-WIN7-LEASE'] === 'RECOVERY_REQUIRED'
      && profile.gates['GATE-WIN7-LEASE'] !== 'GRANTED');

  // ── 5. Profile validation rejections ──────────────────────────────────────
  const badTarget = { ...profile, target: { ...profile.target, address: '10.0.0.1' } };
  fs.writeFileSync(path.join(tempRoot, 'bad-target.json'), JSON.stringify(badTarget));
  const badTargetRun = run(NODE, [ORCHESTRATOR, '--dry-run', '--acceptance-id', 'A4-20260807-000004', '--profile', path.join(tempRoot, 'bad-target.json')]);
  check('profile rejects non-locked target', badTargetRun.status === 1 && /locked Win7 target/.test(badTargetRun.stderr));

  const keyContent = { ...profile, ssh: { ...profile.ssh, private_key: '-----BEGIN OPENSSH PRIVATE KEY-----' } };
  fs.writeFileSync(path.join(tempRoot, 'bad-key.json'), JSON.stringify(keyContent));
  const badKeyRun = run(NODE, [ORCHESTRATOR, '--dry-run', '--acceptance-id', 'A4-20260807-000004', '--profile', path.join(tempRoot, 'bad-key.json')]);
  check('profile rejects private-key content', badKeyRun.status === 1 && /private key content/.test(badKeyRun.stderr));

  process.stdout.write(failures === 0 ? 'D-013 harness tests: ALL PASS\n' : `D-013 harness tests: ${failures} failure(s)\n`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
process.exit(failures === 0 ? 0 : 1);
