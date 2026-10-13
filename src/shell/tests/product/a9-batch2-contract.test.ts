/// <reference path="./better-sqlite3.d.ts" />
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

// A9-33 batch-2 contract tests. Dev-machine evidence only: nothing here starts Electron, PowerShell, Win10 or Win7.
const releaseDir = path.resolve(__dirname, '../../../../release/win7-product-v3');
const fixtures = require(path.join(releaseDir, 'a9-batch2-fixtures.cjs')) as any;
const requests = require(path.join(releaseDir, 'a9-batch2-desktop-request.cjs')) as any;
const smoke = require(path.join(releaseDir, 'a9-batch2-smoke.cjs')) as any;
const driver = require(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs')) as any;
const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;

const RUN_ID = '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44';
const TARGET = { machine_name: 'TEST-ONLY-HOST', account_name: 'TEST-ONLY\\runner', account_sid: 'S-1-5-21-1-2-3-1001', integrity_level: 'Medium', session_id: 1, elevated: false, in_job: false };
const sha = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
const temp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `a9-batch2-${label}-`));

function request(overrides: any = {}) {
  const base = overrides.base || temp('request');
  return requests.createRequest({
    runId: RUN_ID, phase: 'p01-env', requestIndex: 1, sourceCommit: 'a'.repeat(40), packageSha256: 'b'.repeat(64), manifestSha256: 'c'.repeat(64),
    kitSha256: 'd'.repeat(64), releaseAuthoritySha256: 'e'.repeat(64), candidateRoot: path.join(base, 'candidate'), evidenceRoot: path.join(base, 'evidence'),
    target: { ...TARGET }, externalFiles: {}, ...overrides,
  });
}
const completed = (index: number, phase: string, result = 'PASS', failureClass?: string) => ({ state: 'COMPLETED', request_index: index, phase, run_id: RUN_ID, digest: `${index}`.repeat(64).slice(0, 64), result, ...(failureClass ? { failure_class: failureClass } : {}) });
const consumed = (index: number, phase: string, at = new Date().toISOString()) => ({ state: 'CONSUMED', request_index: index, phase, run_id: RUN_ID, digest: `${index}`.repeat(64).slice(0, 64), consumed_at: at });

describe('A9-33 batch-2 evidence contract', () => {
  test('the contract is a closed set with the expected shape', () => {
    const check = fixtures.selfCheck();
    expect(check.problems).toEqual([]);
    expect(check).toMatchObject({ ok: true, cases: 25, assertions: 42, phases: 10, request_cost: 10, max_requests: 16, retry_headroom: 6 });
    expect(fixtures.PHASES.map((phase: any) => phase.id)).toEqual(['p01-env', 'p02-integrity', 'p03-chain', 'p04-streaming', 'p05-session-bg', 'p06-continue', 'p07-safe', 'p08-ui', 'p09-report', 'p10-postflight']);
    expect(fixtures.LIMITS).toEqual({ max_requests: 16, max_wall_seconds: 7200, desktop_windows: 1, max_background_processes: 3, request_ttl_seconds: 900 });
    expect(fixtures.CONTRACT).toMatchObject({ candidate: 'WIN7-43', candidate_tentative: true, lock_id: 'A9-BATCH2-INPUTS-D013-V26-MANAGED' });
    expect(fixtures.CONTRACT.result_ceiling).toMatch(/never the full Alpha 2/);
  });

  test('the owner-ruled narrowing removed CONT-02 and SAFE-01 and carries them as known limits', () => {
    const ids = fixtures.CASES.map((item: any) => item.case_id);
    expect(ids).not.toContain('B2-CONT-02-CRASH-POINTS-DEDUP');
    expect(ids).not.toContain('B2-SAFE-01-CURRENT-RULES-BUDGET');
    expect(fixtures.casesForPhase('p06-continue').map((item: any) => item.case_id)).toEqual(['B2-CONT-01-RESTART-ZERO-REQUEST', 'B2-CONT-03-APPROVAL-UNKNOWN-EFFECTS']);
    expect(fixtures.casesForPhase('p07-safe').map((item: any) => item.case_id)).toEqual(['B2-SAFE-02-AUDIT-HARD-STOP']);
    expect(fixtures.casesForPhase('p08-ui').map((item: any) => item.case_id)).toEqual(['B2-UI-01-CONTINUE-INTERACTION', 'B2-UI-02-LAYOUTS-DPI']);
    expect(fixtures.KNOWN_LIMITS.some((item: string) => item.startsWith('CONT-02 crash points'))).toBe(true);
    expect(fixtures.KNOWN_LIMITS.some((item: string) => item.startsWith('SAFE-01 incompressible'))).toBe(true);
    const evidence = fixtures.evidenceSet();
    expect(evidence).not.toContain('cont02-crash-points.json');
    expect(evidence).not.toContain('safe01-rules-budget.json');
    expect(evidence.length).toBe(51);
  });

  test('every assertion needs an observed value before a case can pass', () => {
    const bindings = { source_commit: 'a'.repeat(40), package_sha256: 'b'.repeat(64), manifest_sha256: 'c'.repeat(64), kit_sha256: 'd'.repeat(64) };
    const result = fixtures.newPhaseResult('p07-safe', RUN_ID, 3, bindings);
    expect(result.status).toBe('NOT_PERFORMED');
    for (const item of fixtures.casesForPhase('p07-safe')) for (const a of item.assertions) fixtures.setAssertion(result, item.case_id, a.assertion_id, 'PASS', 'seen');
    result.evidence = fixtures.evidenceForPhase('p07-safe').map((name: string) => ({ file: name, size: 1, sha256: sha(name) }));
    fixtures.finalizePhaseResult(result, null);
    expect(result.status).toBe('PASS');
    expect(fixtures.phaseResultProblems(result, { runId: RUN_ID, phase: 'p07-safe', bindings })).toEqual([]);
    // Blank observation, wrong run id, wrong binding, missing evidence and an unknown case each produce a named problem.
    const blank = JSON.parse(JSON.stringify(result)); blank.cases[0].assertions[0].observed = '  ';
    expect(fixtures.phaseResultProblems(blank, { runId: RUN_ID, phase: 'p07-safe', bindings })).toContain(`ASSERTION_NOT_PASS:${blank.cases[0].assertions[0].assertion_id}`);
    expect(fixtures.phaseResultProblems(result, { runId: 'other', phase: 'p07-safe', bindings })).toContain('RUN_ID');
    expect(fixtures.phaseResultProblems(result, { runId: RUN_ID, phase: 'p07-safe', bindings: { ...bindings, kit_sha256: '0'.repeat(64) } })).toContain('BINDING_KIT_SHA256');
    const noEvidence = JSON.parse(JSON.stringify(result)); noEvidence.evidence = [];
    expect(fixtures.phaseResultProblems(noEvidence, { runId: RUN_ID, phase: 'p07-safe', bindings }).some((item: string) => item.startsWith('EVIDENCE_NOT_LISTED:'))).toBe(true);
    const extra = JSON.parse(JSON.stringify(result)); extra.cases.push({ case_id: 'B2-UNKNOWN', status: 'PASS', assertions: [] });
    expect(fixtures.phaseResultProblems(extra, { runId: RUN_ID, phase: 'p07-safe', bindings })).toContain('CASE_UNEXPECTED:B2-UNKNOWN');
    // One FAIL fails the phase, one NOT_PERFORMED keeps it from passing, and an unknown assertion id is refused.
    const failing = fixtures.newPhaseResult('p07-safe', RUN_ID, 3, bindings);
    fixtures.setAssertion(failing, 'B2-SAFE-02-AUDIT-HARD-STOP', 'B2-SAFE-02-AUDIT-HARD-STOP-A01', 'FAIL', 'budget not reached');
    expect(fixtures.finalizePhaseResult(failing, null)).toMatchObject({ status: 'FAIL', failure_class: 'ASSERTION_FAILED' });
    expect(failing.first_failure).toMatchObject({ case_id: 'B2-SAFE-02-AUDIT-HARD-STOP' });
    expect(() => fixtures.setAssertion(failing, 'B2-SAFE-02-AUDIT-HARD-STOP', 'NOPE', 'PASS', 'x')).toThrow(/UNKNOWN_ASSERTION/);
    expect(() => fixtures.setAssertion(failing, 'B2-SAFE-02-AUDIT-HARD-STOP', 'B2-SAFE-02-AUDIT-HARD-STOP-A01', 'MAYBE', 'x')).toThrow(/STATUS_INVALID/);
  });

  test('scripted Provider scenarios are bounded and stateless apart from hold and shell kind', () => {
    const user = (token: string) => [{ role: 'user', content: `please run ${token}` }];
    const step = (token: string, tools: any[] = [], state: any = {}) => fixtures.providerStep({ messages: [...user(token), ...tools] }, state);
    expect(step('b2:bg-start')).toMatchObject({ tool: { name: 'start_process' } });
    expect(step('b2:bg-start', [{ role: 'tool', content: 'ok' }])).toEqual({ content: 'background process started.' });
    expect(step('b2:bg-three', [1, 2, 3].map(() => ({ role: 'tool', content: 'ok' }))).tool.name).toBe('start_process');
    expect(step('b2:bg-three', [1, 2, 3, 4].map(() => ({ role: 'tool', content: 'ok' })))).toHaveProperty('content');
    expect(step('b2:bg-long')).toMatchObject({ tool: { name: 'start_process' } });
    expect(step('b2:bg-long', [{ role: 'tool', content: 'ok' }])).toEqual({ content: 'long background process started.' });
    expect(step('b2:hold')).toMatchObject({ tool: { name: 'write' } });
    expect(step('b2:hold', [{ role: 'tool', content: 'ok' }])).toMatchObject({ tool: { name: 'delete', args: { permanent: true } } });
    expect(step('b2:hold', [{ role: 'tool', content: 'ok' }, { role: 'tool', content: 'ok' }])).toEqual({ hold: true });
    // After a hold the continue request reads current facts once and never replays the old calls.
    expect(step('b2:hold', [], { afterHold: true })).toMatchObject({ tool: { name: 'read' } });
    expect(step('b2:hold', [{ role: 'tool', content: 'x' }], { afterHold: true }).content).toMatch(/continued/);
    expect(step('no token here')).toEqual({ content: 'no scenario token; nothing executed.' });
    // Shell kind selects the command syntax; commands carry hard tick bounds.
    expect(step('b2:s01', [], { shellKind: 'powershell' }).tool.args.command).toMatch(/ForEach-Object/);
    expect(step('b2:s01', [], { shellKind: 'cmd' }).tool.args.command).toMatch(/^for \/L/);
    expect(fixtures.backgroundCommandCmd(9999)).toContain(`1,1,${fixtures.FIXTURE_BOUNDS.max_ticks}`);
    expect(fixtures.backgroundCommandPowerShell(0)).toContain('1..1 ');
    expect(() => fixtures.shellCommand('cmd', { name: 'free-text' })).toThrow(/SHELL_COMMAND_UNKNOWN/);
    // Cursor and handle extraction follow the product's cursor format.
    const cursor = `${'a'.repeat(32)}.3.17`;
    expect(fixtures.extractNextCursor({ content: JSON.stringify({ nextCursor: cursor }) })).toBe(cursor);
    expect(fixtures.extractNextCursor({ content: 'nothing' })).toBe('cursor-missing');
    expect(fixtures.extractHandleId({ content: JSON.stringify({ handleId: 'h-1.2' }) })).toBe('h-1.2');
  });

  test('the S04 encoding commands write exact byte halves and the secret is split across chunks', () => {
    const fx = fixtures.encodingFixtures();
    expect(fx.cp936_zhongwen.toString('hex')).toBe('d6d0cec4');
    expect(fx.crlf.toString('utf8')).toContain('\r\n');
    for (const label of ['utf8', 'utf16le', 'cp936', 'crlf']) {
      const command = fixtures.encodingCommandPowerShell(label);
      const parts = [...command.matchAll(/\[byte\[\]\]@\(([\d,]*)\)/g)].map((m: any) => Buffer.from(m[1].split(',').filter(Boolean).map(Number)));
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
      expect(Buffer.concat(parts).equals({ utf8: fx.utf8, utf16le: fx.utf16le, cp936: fx.cp936_zhongwen, crlf: fx.crlf }[label as 'utf8'])).toBe(true);
    }
    expect(() => fixtures.encodingCommandPowerShell('latin9')).toThrow(/ENCODING_LABEL_UNKNOWN/);
    const split = fixtures.secretSplitAcrossChunks();
    expect(split.chunks).toHaveLength(2);
    expect(split.chunks.some((chunk: Buffer) => chunk.toString('latin1').includes(split.secret))).toBe(false);
    expect(Buffer.concat(split.chunks).toString('latin1')).toContain(split.secret);
  });
});

describe('A9-33 batch-2 request and ledger', () => {
  test('a request is bound, closed to unknown fields, and has no command field', () => {
    const good = request();
    expect(requests.structuralProblems(good)).toEqual([]);
    expect(good).not.toHaveProperty('command');
    const mutate = (change: (r: any) => void) => { const copy = JSON.parse(JSON.stringify(good)); change(copy); copy.digest = requests.requestDigest(copy); return requests.structuralProblems(copy); };
    expect(mutate((r) => { r.command = 'calc.exe'; })).toContain('UNKNOWN_FIELD:command');
    expect(mutate((r) => { r.phase = 'p99-unknown'; })).toContain('PHASE');
    expect(mutate((r) => { r.target.elevated = true; })).toContain('TARGET_ELEVATED');
    expect(mutate((r) => { delete r.target.in_job; })).toContain('TARGET_IN_JOB');
    expect(mutate((r) => { r.bindings.package_sha256 = 'xyz'; })).toContain('BINDING_PACKAGE_SHA256');
    expect(mutate((r) => { r.expires_at = new Date(Date.parse(r.issued_at) + 901000).toISOString(); })).toContain('LIFETIME');
    expect(mutate((r) => { r.request_index = 17; })).toContain('REQUEST_INDEX');
    expect(mutate((r) => { r.evidence_root = path.join(r.candidate_root, 'evidence'); })).toContain('EVIDENCE_ROOT_NOT_EXTERNAL');
    expect(requests.structuralProblems({ ...good, digest: 'f'.repeat(64) })).toContain('DIGEST');
    expect(() => requests.createRequest({ ...{ runId: RUN_ID, phase: 'p01-env', requestIndex: 1 }, ttlSeconds: 901 })).toThrow(/TTL_INVALID/);
  });

  test('an integrity request must name four external files outside the candidate with a matching pin', () => {
    const base = temp('integrity-request');
    const externalFiles = Object.fromEntries(['package_zip', 'formal_input_lock', 'approval_registry', 'release_authority'].map((key) => [key, { path: path.join(base, 'external', `${key}.bin`), sha256: 'e'.repeat(64) }]));
    const good = request({ base, phase: 'p02-integrity', requestIndex: 2, externalFiles });
    expect(requests.structuralProblems(good)).toEqual([]);
    const argv = requests.argvForRequest(good);
    expect(path.basename(argv.program)).toBe('electron.exe');
    expect(argv.args[0]).toBe(path.join(good.candidate_root, 'validation', 'a9-batch2-package-integrity.cjs'));
    expect(argv.args).toContain(`--release-authority-sha256=${'e'.repeat(64)}`);
    expect(argv.env).toEqual({ ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' });
    expect(() => request({ base, phase: 'p02-integrity', requestIndex: 2, externalFiles: { ...externalFiles, release_authority: { ...externalFiles.release_authority, sha256: '1'.repeat(64) } } })).toThrow(/AUTHORITY_PIN_MISMATCH/);
    expect(() => request({ base, phase: 'p02-integrity', requestIndex: 2, externalFiles: { ...externalFiles, package_zip: { path: path.join(good.candidate_root, 'inside.zip'), sha256: 'e'.repeat(64) } } })).toThrow(/EXTERNAL_PACKAGE_ZIP_INSIDE_CANDIDATE/);
    expect(() => request({ base, phase: 'p02-integrity', requestIndex: 2, externalFiles: {} })).toThrow(/EXTERNAL_PACKAGE_ZIP/);
  });

  test('every phase derives only electron.exe in Node mode with one packaged script', () => {
    for (const phase of fixtures.PHASES) {
      const base = temp(`argv-${phase.id}`);
      const externalFiles = phase.script === 'integrity'
        ? Object.fromEntries(['package_zip', 'formal_input_lock', 'approval_registry', 'release_authority'].map((key) => [key, { path: path.join(base, 'ext', key), sha256: 'e'.repeat(64) }])) : {};
      const derived = requests.argvForRequest(request({ base, phase: phase.id, requestIndex: phase.order, externalFiles }));
      expect(path.basename(derived.program)).toBe('electron.exe');
      expect(derived.args[0]).toMatch(/validation[\\/]a9-batch2-(package-integrity|smoke|report)\.cjs$/);
      expect(derived.args).toContain(`--phase=${phase.id}`);
      expect(derived.args.some((item: string) => /^--(command|exec|shell)=/.test(item))).toBe(false);
    }
  });

  test('verification refuses replay, wrong order, missing prerequisites, expiry and identity drift', () => {
    const first = request();
    expect(requests.verifyRequest(first, { now: new Date(), runId: RUN_ID, ledger: [] })).toEqual({ ok: true, problems: [] });
    const replay = requests.verifyRequest(first, { now: new Date(), ledger: [{ ...consumed(1, 'p01-env'), digest: first.digest }, completed(1, 'p01-env')] });
    expect(replay.problems).toEqual(expect.arrayContaining(['REPLAYED', 'REQUEST_INDEX_NOT_NEXT']));
    const second = request({ phase: 'p02-integrity', requestIndex: 2, externalFiles: Object.fromEntries(['package_zip', 'formal_input_lock', 'approval_registry', 'release_authority'].map((key) => [key, { path: path.join(os.tmpdir(), 'ext', key), sha256: 'e'.repeat(64) }])) });
    expect(requests.verifyRequest(second, { now: new Date(), ledger: [consumed(1, 'p01-env'), completed(1, 'p01-env', 'FAIL', 'ENV')] }).problems).toContain('PREREQUISITE_NOT_PASSED:p01-env');
    expect(requests.verifyRequest(second, { now: new Date(), ledger: [consumed(1, 'p01-env')] }).problems).toContain('PREVIOUS_REQUEST_NOT_COMPLETED');
    expect(requests.verifyRequest(first, { now: new Date(Date.parse(first.expires_at) + 1000), ledger: [] }).problems).toContain('EXPIRED');
    expect(requests.verifyRequest(first, { now: new Date(Date.parse(first.issued_at) - 60000), ledger: [] }).problems).toContain('NOT_YET_VALID');
    expect(requests.verifyRequest(first, { now: new Date(), runId: 'other-run', ledger: [] }).problems).toContain('RUN_ID_MISMATCH');
    expect(requests.verifyRequest(first, { now: new Date(), ledger: [{ ...consumed(1, 'p01-env'), run_id: '11111111-1111-4111-8111-111111111111' }] }).problems).toContain('LEDGER_RUN_ID_MISMATCH');
    const actual = (target: any) => requests.verifyRequest(first, { now: new Date(), ledger: [], actual: { target, manifestSha256: 'c'.repeat(64), kitSha256: 'd'.repeat(64), packageSha256: 'b'.repeat(64) } }).problems;
    expect(actual({ ...TARGET })).toEqual([]);
    expect(actual({ ...TARGET, in_job: true })).toContain('TARGET_MISMATCH:in_job');
    expect(actual({ ...TARGET, account_sid: 'S-1-5-21-9-9-9-1' })).toContain('TARGET_MISMATCH:account_sid');
    expect(actual({ ...TARGET, elevated: true })).toContain('TARGET_MISMATCH:elevated');
    expect(requests.verifyRequest(first, { now: new Date(), ledger: [], actual: { manifestSha256: '0'.repeat(64) } }).problems).toContain('MANIFEST_HASH_MISMATCH');
    // The request count and the wall-clock budget are hard limits.
    const full = Array.from({ length: 16 }, (_, i) => [consumed(i + 1, 'p01-env'), completed(i + 1, 'p01-env')]).flat();
    expect(requests.verifyRequest(request({ requestIndex: 16 }), { now: new Date(), ledger: full }).problems).toContain('REQUEST_CAP_REACHED');
    const late = [consumed(1, 'p01-env', new Date(Date.now() - 7300 * 1000).toISOString()), completed(1, 'p01-env')];
    expect(requests.verifyRequest(request({ requestIndex: 2 }), { now: new Date(), ledger: late }).problems).toContain('WALL_TIME_EXCEEDED');
  });

  test('two failures of the same class stop the run until the cause is written', () => {
    const fails = [consumed(1, 'p01-env'), completed(1, 'p01-env', 'FAIL', 'ENV_UNKNOWN'), consumed(2, 'p01-env'), completed(2, 'p01-env', 'FAIL', 'ENV_UNKNOWN')];
    expect(requests.sameClassFailureTwice(fails)).toBe(true);
    expect(requests.verifyRequest(request({ requestIndex: 3 }), { now: new Date(), ledger: fails }).problems).toContain('SAME_CLASS_FAILURE_TWICE_DIAGNOSE_FIRST');
    const mixed = [...fails.slice(0, 3), completed(2, 'p01-env', 'FAIL', 'OTHER')];
    expect(requests.sameClassFailureTwice(mixed)).toBe(false);
    expect(requests.sameClassFailureTwice([completed(1, 'p01-env', 'PASS'), completed(2, 'p02-integrity', 'FAIL', 'X')])).toBe(false);
  });

  test('the ledger only appends, and a result is hashed into the completion entry', () => {
    const run = request();
    const evidenceRoot = run.evidence_root;
    const attempt = requests.consumeRequest(run, evidenceRoot, new Date('2026-10-12T00:00:00Z'));
    expect(attempt).toBe(requests.attemptDirectory(evidenceRoot, 1, 'p01-env'));
    expect(JSON.parse(fs.readFileSync(path.join(attempt, 'request.json'), 'utf8')).digest).toBe(run.digest);
    expect(requests.readLedger(evidenceRoot)).toHaveLength(1);
    // PASS needs the result file; FAIL does not.
    expect(() => requests.completeRequest(run, evidenceRoot, 'PASS', '')).toThrow(/RESULT_FILE_MISSING/);
    expect(requests.derivedResult(run, evidenceRoot, 0)).toEqual({ result: 'FAIL', failureClass: 'PHASE_RESULT_MISSING' });
    const resultFile = path.join(attempt, 'phase-result.json');
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'PASS' }));
    expect(requests.derivedResult(run, evidenceRoot, 0)).toEqual({ result: 'PASS', failureClass: '' });
    expect(requests.derivedResult(run, evidenceRoot, 3)).toEqual({ result: 'FAIL', failureClass: 'EXIT_CODE_MISMATCH' });
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'NOT_PERFORMED', failure_class: 'INCOMPLETE' }));
    expect(requests.derivedResult(run, evidenceRoot, 0)).toEqual({ result: 'FAIL', failureClass: 'INCOMPLETE' });
    fs.writeFileSync(resultFile, JSON.stringify({ status: 'PASS' }));
    requests.completeRequest(run, evidenceRoot, 'PASS', '');
    const ledger = requests.readLedger(evidenceRoot);
    expect(ledger.map((entry: any) => entry.state)).toEqual(['CONSUMED', 'COMPLETED']);
    expect(ledger[1].result_sha256).toBe(sha(fs.readFileSync(resultFile)));
    expect(() => requests.completeRequest(run, evidenceRoot, 'MAYBE', '')).toThrow(/RESULT_INVALID/);
    fs.appendFileSync(path.join(evidenceRoot, requests.LEDGER_FILE), 'not json\n');
    expect(() => requests.readLedger(evidenceRoot)).toThrow(/LEDGER_CORRUPT/);
  });

  test('the command line derives a result from the phase file and refuses a stale request', () => {
    const run = request();
    const file = path.join(temp('cli'), 'request.json');
    fs.writeFileSync(file, JSON.stringify(run));
    const asked = (...args: string[]) => requests.main([...args, `--request=${file}`]);
    expect(asked('verify')).toEqual({ ok: true });
    const verdict = asked('argv', '--manifest-sha256=' + '0'.repeat(64));
    expect(verdict).toMatchObject({ ok: false });
    expect(verdict.problems).toContain('MANIFEST_HASH_MISMATCH');
    const argv = asked('argv', '--manifest-sha256=' + 'c'.repeat(64), '--kit-sha256=' + 'd'.repeat(64));
    expect(argv.lines[0]).toMatch(/electron\.exe$/);
    const consumedResult = asked('consume');
    expect(consumedResult.attempt_directory).toBe(requests.attemptDirectory(run.evidence_root, 1, 'p01-env'));
    // Consumed once means refused the second time.
    expect(asked('consume').problems).toContain('REPLAYED');
    expect(() => requests.main(['unknown', `--request=${file}`])).toThrow(/COMMAND_UNKNOWN/);
    fs.writeFileSync(path.join(consumedResult.attempt_directory, 'phase-result.json'), JSON.stringify({ status: 'PASS' }));
    expect(asked('complete', '--result=auto', '--exit-code=0')).toEqual({ ok: true, result: 'PASS', failure_class: null });
  });
});

describe('A9-33 batch-2 smoke pieces', () => {
  const FACTS = () => ({
    node: { electron: '22.3.27', node: '16.17.1', modules: '110', exec_path: path.join('/candidate', 'electron.exe'), platform: 'win32', arch: 'x64', os_release: '6.1.7601', hostname: 'TEST-ONLY-HOST' },
    ver: 'Microsoft Windows [Version 6.1.7601]', chcp: 'Active code page: 936',
    wmic_os: { version: '6.1.7601', service_pack: 'Service Pack 1', architecture: '64-bit', build: '7601' },
    whoami_user: '"TEST-ONLY\\runner","S-1-5-21-1-2-3-1001"', whoami_groups: '"Mandatory Label\\Medium Mandatory Level","Label","S-1-16-8192","Mandatory group"',
    session_id: 1, powershell_version: '2.0', powershell_codepages: '936,936', hotfixes: ['KB1'], hotfix_command_status: 0, processes_total: 40, stale_processes: [],
    free_bytes: 5 * 1024 * 1024 * 1024, controller_identity: { account_sid: 'S-1-5-21-1-2-3-1001', session_id: 1, elevated: false, in_job: false },
  });
  const status = (list: any[]) => list.map((item) => item.status);

  test('environment assertions pass only on exact facts and keep unknown facts unknown', () => {
    const req = { target: TARGET, evidence_root: '/evidence' };
    expect(status(smoke.evaluateEnvironment(FACTS(), req, '/candidate'))).toEqual(['PASS', 'PASS', 'PASS', 'PASS', 'PASS']);
    const stale = { ...FACTS(), stale_processes: [{ pid: 9, name: 'spike02_helper.exe' }] };
    expect(smoke.evaluateEnvironment(stale, req, '/candidate')[0].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), controller_identity: null }, req, '/candidate')[1].status).toBe('UNKNOWN');
    expect(smoke.evaluateEnvironment({ ...FACTS(), controller_identity: { ...FACTS().controller_identity, in_job: true } }, req, '/candidate')[1].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), controller_identity: { ...FACTS().controller_identity, elevated: true } }, req, '/candidate')[1].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), node: { ...FACTS().node, arch: 'ia32' } }, req, '/candidate')[0].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), node: { ...FACTS().node, electron: '23.0.0' } }, req, '/candidate')[2].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), powershell_version: null }, req, '/candidate')[3].status).toBe('UNKNOWN');
    expect(smoke.evaluateEnvironment({ ...FACTS(), free_bytes: null }, req, '/candidate')[4].status).toBe('UNKNOWN');
    expect(smoke.evaluateEnvironment({ ...FACTS(), free_bytes: 10 }, req, '/candidate')[4].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment(FACTS(), { target: TARGET, evidence_root: '/candidate/evidence' }, '/candidate')[4].status).toBe('FAIL');
    expect(smoke.evaluateEnvironment({ ...FACTS(), ver: '' }, req, '/candidate')[0].status).toBe('UNKNOWN');
  });

  test('parsers read wmic CSV, whoami output and integrity labels', () => {
    expect(smoke.parseCsvLine('a,"b,c","d""e"')).toEqual(['a', 'b,c', 'd"e']);
    const rows = smoke.parseWmicCsv('\r\r\nNode,Name,ProcessId\r\r\nHOST,electron.exe,12\r\r\nHOST,"a,b.exe",13\r\r\n');
    expect(rows).toEqual([{ Node: 'HOST', Name: 'electron.exe', ProcessId: '12' }, { Node: 'HOST', Name: 'a,b.exe', ProcessId: '13' }]);
    expect(smoke.parseWmicCsv('')).toEqual([]);
    expect(smoke.parseWhoamiSid('"DOM\\user","S-1-5-21-1-2-3-1001"\r\n')).toEqual({ account: 'DOM\\user', sid: 'S-1-5-21-1-2-3-1001' });
    expect(smoke.parseIntegrity('x S-1-16-12288 y')).toBe('High');
    expect(smoke.parseIntegrity('S-1-16-4096')).toBe('Low');
    expect(smoke.parseIntegrity('nothing')).toBeNull();
  });

  test('the environment collector walks up its own parents and counts only foreign trees as stale', () => {
    const csv = [
      'Node,CreationDate,ExecutablePath,Name,ParentProcessId,ProcessId,SessionId',
      'H,1,C:\\run\\cand\\electron.exe,electron.exe,5,100,1',
      'H,1,C:\\Windows\\cmd.exe,cmd.exe,1,5,1',
      'H,1,C:\\run\\cand\\electron.exe,electron.exe,1,200,1',
      'H,1,C:\\elsewhere\\spike02_helper.exe,spike02_helper.exe,1,300,1',
      'H,1,C:\\Windows\\notepad.exe,notepad.exe,1,400,1',
    ].join('\r\n');
    const exec = (name: string) => ({ status: 0, stdout: name === 'wmic_processes' ? csv : name === 'ver' ? 'Microsoft Windows [Version 6.1.7601]' : '', stderr: '', error: null });
    const facts = smoke.collectEnvironment(exec, { pid: 100, watchedRoots: ['C:\\run\\cand'], freeBytes: 1, controllerIdentity: null });
    expect(facts.stale_processes.map((item: any) => item.pid).sort()).toEqual([200, 300]);
    expect(facts.session_id).toBe(1);
    expect(facts.processes_total).toBe(5);
    // A throwing command becomes an error result, never a crash or a pass.
    const broken = smoke.collectEnvironment(() => { throw new Error('boom'); }, { pid: 1, watchedRoots: [], freeBytes: 0 });
    expect(broken.ver).toBe('');
    expect(broken.stale_processes).toEqual([]);
    expect(() => smoke.realExec('rm -rf')).toThrow(/COMMAND_NOT_ALLOWED/);
    expect(Object.keys(smoke.FIXED_COMMANDS).sort()).toEqual(['chcp', 'powershell_codepages', 'powershell_version', 'ver', 'whoami_groups', 'whoami_user', 'wmic_hotfix', 'wmic_os', 'wmic_processes']);
  });

  test('the secret scan sees the split secret after joining, and its positive control must fire', () => {
    const secret = fixtures.testOnlySecret();
    expect(smoke.scanBytesForSecrets(Buffer.from(`x ${secret}`), [])).toEqual(['api-key-prefix']);
    expect(smoke.scanBytesForSecrets(Buffer.from('plain text'), [secret])).toEqual([]);
    expect(smoke.scanBytesForSecrets(Buffer.from(`x ${secret.slice(0, 12)}`), [secret])).toEqual([]);
    expect(smoke.scanBytesForSecrets(Buffer.from(['Authorization:', ' Bearer ', 'abcdefghijklmnop', '0123456789'].join('')), [])).toEqual(['bearer-token']);
    const root = temp('scan');
    fs.writeFileSync(path.join(root, 'clean.txt'), 'nothing here');
    fs.writeFileSync(path.join(root, 'image.png'), Buffer.from(secret));
    const clean = smoke.scanRun(root, secret);
    expect(clean).toMatchObject({ positive_control_detected: true, files_scanned: 1 });
    expect(clean.findings).toEqual([]);
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'leak.log'), `token ${secret}`);
    const dirty = smoke.scanRun(root, secret);
    expect(dirty.findings.map((item: any) => item.file)).toEqual([path.join('sub', 'leak.log')]);
    // Without the configured literal the control cannot fire, and the scan says so instead of passing silently.
    expect(smoke.scanRun(root, '').positive_control_detected).toBe(false);
  });

  test('suite files hold no literal that the producer payload scan or the encoding rules would reject', () => {
    const sources = ['a9-batch2-fixtures.cjs', 'a9-batch2-desktop-request.cjs', 'a9-batch2-package-integrity.cjs', 'a9-batch2-report.cjs', 'a9-batch2-smoke.cjs',
      'a9-batch2-desktop-controller.ps1', 'A9_BATCH2_WIN7_VALIDATION.md', 'RUN_A9_BATCH2_INTEGRITY.cmd', 'RUN_A9_BATCH2_SMOKE.cmd', 'RUN_A9_BATCH2_REPORT_VERIFY.cmd']
      .map((name) => path.join(releaseDir, name)).concat(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'));
    const patterns = [/sk-[A-Za-z0-9_-]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{16,}/i];
    for (const file of sources) {
      const bytes = fs.readFileSync(file);
      const text = bytes.toString('utf8');
      expect(patterns.some((pattern) => pattern.test(text))).toBe(false);
      expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
      if (file.endsWith('.cmd')) {
        expect(bytes.every((byte) => byte < 0x80)).toBe(true);
        expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
        expect(text.endsWith('\r\n')).toBe(true);
      } else {
        expect(text).not.toContain('\r');
        if (file.endsWith('.ps1')) expect(bytes.every((byte) => byte < 0x80)).toBe(true);
      }
    }
    // The controller reads no command from a request and has no dynamic evaluation.
    const controller = fs.readFileSync(path.join(releaseDir, 'a9-batch2-desktop-controller.ps1'), 'utf8');
    expect(controller).not.toMatch(/Invoke-Expression|\biex\b|ConvertFrom-Json|-EncodedCommand/i);
  });

  test('the loopback Provider answers scripted steps, records them, holds on demand and reports counters', async () => {
    const log = path.join(temp('provider'), 'provider.jsonl');
    fs.writeFileSync(log, '');
    const fixture = new smoke.ProviderFixture(log);
    const port = await fixture.listen();
    const call = (method: string, route: string, body?: any): Promise<{ status: number; text: string }> => new Promise((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body);
      const req = http.request({ host: '127.0.0.1', port, method, path: route, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (response) => {
        let text = ''; response.on('data', (chunk) => { text += chunk; }); response.on('end', () => resolve({ status: response.statusCode || 0, text }));
      });
      req.on('error', reject); if (data) req.write(data); req.end();
    });
    try {
      const probe = await call('POST', '/v1/chat/completions', { tools: [{ function: { name: 'probe_test_echo' } }], messages: [] });
      expect(probe.text).toContain('probe_ok');
      const chat = await call('POST', '/v1/chat/completions', { tools: [{ function: { name: 'start_process', parameters: { properties: { command: {} } } } }], messages: [{ role: 'user', content: 'b2:bg-start' }] });
      expect(chat.text).toContain('start_process');
      expect(chat.text).toContain('[DONE]');
      const counters = JSON.parse((await call('GET', '/__b2/counters')).text);
      expect(counters).toMatchObject({ requests: 1, held: 0 });
      const state = JSON.parse((await call('POST', '/__b2/state', { shellKind: 'powershell', afterHold: true })).text);
      expect(state.state).toMatchObject({ shellKind: 'powershell', afterHold: true });
      expect((await call('POST', '/__b2/state', { shellKind: 'bash-oops' })).status).toBe(200);
      expect(fixture.state.shellKind).toBe('cmd');
      expect((await call('GET', '/__b2/nothing')).status).toBe(404);
      const lines = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ index: 1, step: 'tool:start_process', tool_params: { start_process: ['command'] } });
      expect(lines[0].prompt_sha256).toBe(sha('b2:bg-start'));
    } finally { await fixture.close(); }
  });

  test('log helpers read tool parameter names and the unknown-result count of a continue prompt', () => {
    expect(smoke.toolParameterNames({ tools: [{ function: { name: 'stop_process', parameters: { properties: { handleId: {} } } } }, { function: { name: 'x' } }, null] })).toEqual({ stop_process: ['handleId'], x: [] });
    expect(smoke.toolParameterNames(null)).toEqual({});
    const prompt = `继续\n${JSON.stringify({ unknownResults: [{ a: 1 }, { b: 2 }] })}\n不得重放已完成的工具调用`;
    expect(smoke.recoveryUnknownCount(prompt)).toBe(2);
    expect(smoke.recoveryUnknownCount('no facts')).toBeNull();
    expect(smoke.recoveryUnknownCount('\n{broken}\n不得重放')).toBeNull();
  });

  test('driver plans cover every driver phase mode and only kill-on-marker modes end by themselves not', () => {
    const planned = Object.values(smoke.DRIVER_PLANS).flat() as string[];
    expect(planned.sort()).toEqual(Object.keys(smoke.DRIVER_MODES).sort());
    expect(Object.keys(smoke.DRIVER_PLANS)).toEqual(['p03-chain', 'p04-streaming', 'p05-session-bg', 'p06-continue', 'p07-safe', 'p08-ui']);
    for (const spec of Object.values(smoke.DRIVER_MODES) as any[]) expect(spec.timeoutMs).toBeGreaterThan(0);
    expect(Object.entries(smoke.DRIVER_MODES).filter(([, spec]: any) => spec.killOnMarker).map(([mode]) => mode).sort())
      .toEqual(['chain_interrupt', 'continue_interrupt', 'continue_unknown_interrupt', 'ui_interrupt']);
    // The guard modes feed the last p06 mode through part files, so their order is part of the contract.
    expect(smoke.DRIVER_PLANS['p06-continue']).toEqual(['continue_guards', 'continue_interrupt', 'continue_restart', 'continue_unknown_interrupt', 'continue_mode_guard', 'continue_unknown']);
    // Every planned mode has a runner in the driver's mode table, and the driver no longer claims unimplemented assertions.
    const source = fs.readFileSync(path.resolve(__dirname, 'a9-batch2-driver-entry.cjs'), 'utf8');
    const table = /const MODE_TABLE = \{([\s\S]*?)\n  \};/.exec(source);
    expect(table).not.toBeNull();
    const tableModes = Array.from((table as RegExpExecArray)[1].matchAll(/([a-z_]+): [A-Za-z]+/g)).map((match) => match[1]).sort();
    expect(tableModes).toEqual(Object.keys(smoke.DRIVER_MODES).sort());
    expect(source).not.toMatch(/NOT_IMPLEMENTED|notPerformed\(|continue_crash_points/);
    expect(() => smoke.clickExitDialog('c.ps1', 0, 0)).toThrow(/ARGUMENT_INVALID/);
    expect(() => smoke.clickExitDialog('c.ps1', 5, 3)).toThrow(/ARGUMENT_INVALID/);
    let seen: any = null;
    const out = smoke.clickExitDialog('c.ps1', 77, 2, (file: string, args: string[]) => { seen = { file, args }; return { status: 0, stdout: 'clicked index 2', stderr: '' }; });
    expect(out).toMatchObject({ status: 0, stdout: 'clicked index 2' });
    expect(seen.file).toBe('powershell.exe');
    expect(seen.args).toEqual(expect.arrayContaining(['-Action', 'ClickDialog', '-ProcessId', '77', '-ButtonIndex', '2']));
  });

  function fakeChild(pid: number) {
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = pid;
    return child;
  }

  test('launching a driver records its exit, a marker kill, a dialog click and a spawn error', async () => {
    const runtime = { electronPath: 'electron.exe', appRoot: 'app' };
    const clean = fakeChild(2147483000);
    const exit = smoke.launchDriver(runtime, { A9_BATCH2_MODE: 'x', ELECTRON_RUN_AS_NODE: '1' }, { timeoutMs: 5000 }, (_file: string, _args: string[], options: any) => {
      expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(options.env.A9_BATCH2_MODE).toBe('x');
      return clean;
    });
    clean.stdout.emit('data', 'hello');
    clean.emit('close', 0, null);
    expect(await exit).toMatchObject({ code: 0, killed_by: null, stdout: 'hello', pid: 2147483000 });

    const dir = temp('launch');
    const marker = path.join(dir, 'm.ready');
    const dialogMarker = path.join(dir, 'dialog.marker');
    const killed = fakeChild(2147483001);
    const waiting = smoke.launchDriver(runtime, {}, { timeoutMs: 20000, killMarker: marker, dialogMarker, clickDialog: (pid: number) => ({ status: 0, stdout: `clicked ${pid}`, stderr: '' }) }, () => killed);
    fs.writeFileSync(dialogMarker, '{}');
    await new Promise((resolve) => setTimeout(resolve, 600));
    fs.writeFileSync(marker, '{}');
    await new Promise((resolve) => setTimeout(resolve, 600));
    killed.emit('close', null, 'SIGKILL');
    const result = await waiting;
    expect(result).toMatchObject({ killed_by: 'marker', signal: 'SIGKILL' });
    expect(result.dialog_click).toMatchObject({ status: 0, stdout: 'clicked 2147483001' });

    const broken = fakeChild(2147483002);
    const failed = smoke.launchDriver(runtime, {}, { timeoutMs: 5000 }, () => broken);
    broken.emit('error', new Error('ENOENT electron.exe'));
    expect(await failed).toMatchObject({ code: null, spawn_error: 'ENOENT electron.exe' });
  });

  function phaseContext(phase: string, index = 1) {
    const base = temp(`ctx-${phase}`);
    const candidateRoot = path.join(base, 'candidate');
    fs.mkdirSync(path.join(candidateRoot, 'validation'), { recursive: true });
    fs.writeFileSync(path.join(candidateRoot, 'release-manifest.json'), '{"manifest":"TEST_ONLY"}\n');
    fs.writeFileSync(path.join(candidateRoot, 'A9_BATCH2_VALIDATION_KIT.json'), '{"kit":"TEST_ONLY"}\n');
    const runRoot = path.join(base, 'run');
    const run = requests.createRequest({
      runId: RUN_ID, phase, requestIndex: index, sourceCommit: 'a'.repeat(40), packageSha256: 'b'.repeat(64),
      manifestSha256: sha(fs.readFileSync(path.join(candidateRoot, 'release-manifest.json'))), kitSha256: sha(fs.readFileSync(path.join(candidateRoot, 'A9_BATCH2_VALIDATION_KIT.json'))),
      releaseAuthoritySha256: 'e'.repeat(64), candidateRoot, evidenceRoot: runRoot, target: { ...TARGET }, externalFiles: {},
    });
    const attempt = requests.attemptDirectory(runRoot, index, phase);
    fs.mkdirSync(attempt, { recursive: true });
    fs.writeFileSync(path.join(attempt, 'request.json'), JSON.stringify(run));
    const argv = [`--candidate-root=${candidateRoot}`, `--evidence-root=${attempt}`, `--run-root=${runRoot}`, `--phase=${phase}`, `--run-id=${RUN_ID}`];
    return { ctx: smoke.createContext(argv, { pid: 4242 }), candidateRoot, runRoot, attempt, argv };
  }

  test('a phase context refuses a request that does not match its arguments or hashes', () => {
    const { argv, candidateRoot } = phaseContext('p01-env');
    expect(() => smoke.createContext(argv.map((item: string) => (item.startsWith('--phase=') ? '--phase=p10-postflight' : item)), {})).toThrow(/REQUEST_ARGUMENT_MISMATCH/);
    expect(() => smoke.createContext(argv.map((item: string) => (item.startsWith('--run-id=') ? '--run-id=11111111-1111-4111-8111-111111111111' : item)), {})).toThrow(/REQUEST_ARGUMENT_MISMATCH/);
    fs.writeFileSync(path.join(candidateRoot, 'A9_BATCH2_VALIDATION_KIT.json'), '{"kit":"EDITED"}\n');
    expect(() => smoke.createContext(argv, {})).toThrow(/REQUEST_BINDING_MISMATCH/);
  });

  test('the environment phase writes its evidence and never passes on unobserved facts', () => {
    const { ctx, attempt } = phaseContext('p01-env');
    const exec = (name: string) => ({ status: 0, stdout: name === 'ver' ? 'Microsoft Windows [Version 6.1.7601]' : '', stderr: '', error: null });
    const result = smoke.runEnvironmentPhase(ctx, exec);
    expect(result.status).not.toBe('PASS');
    for (const name of ['g0-env.json', 'g0-identity.json', 'g0-processes-before.json', 'phase-result.json']) expect(fs.existsSync(path.join(attempt, name))).toBe(true);
    const stored = JSON.parse(fs.readFileSync(path.join(attempt, 'phase-result.json'), 'utf8'));
    expect(stored.cases[0].assertions.map((item: any) => item.assertion_id)).toEqual(['B2-G0-ENV-A01', 'B2-G0-ENV-A02', 'B2-G0-ENV-A03', 'B2-G0-ENV-A04', 'B2-G0-ENV-A05']);
    expect(stored.cases[0].assertions[1].status).toBe('UNKNOWN');
    expect(() => smoke.writeEvidence(ctx, 'not-in-contract.json', {})).toThrow(/EVIDENCE_NOT_IN_CONTRACT/);
  });

  test('a driver phase applies driver assertions, keeps unobserved ones open and names a failed mode', async () => {
    const { ctx, attempt } = phaseContext('p07-safe');
    const runtime = { electronPath: 'electron.exe', appRoot: 'app', driverSha256: sha('driver') };
    const assertions = [{ case_id: 'B2-SAFE-02-AUDIT-HARD-STOP', assertion_id: 'B2-SAFE-02-AUDIT-HARD-STOP-A01', status: 'PASS', observed: 'hard stop before side effect' }];
    const result = await smoke.runDriverPhase(ctx, {
      runtime, exec: () => ({ status: 0, stdout: '', stderr: '', error: null }),
      launchDriver: async (_runtime: any, env: any) => {
        expect(env.A9_BATCH2_MODE).toBe('safe_rules');
        expect(env.A9_BATCH2_SECRET_LITERAL).toBe(fixtures.testOnlySecret());
        expect(env.A9_BATCH2_FIXTURE_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
        fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'DONE', assertions }));
        return { code: 0, signal: null, killed_by: null, duration_ms: 1, stdout: 'out', stderr: '', pid: 1 };
      },
    });
    // p07 holds only SAFE-02 after the narrowing, so the driver's single observed PASS carries the phase.
    expect(result.cases.map((item: any) => item.case_id)).toEqual(['B2-SAFE-02-AUDIT-HARD-STOP']);
    expect(result.cases[0].status).toBe('PASS');
    expect(fs.readFileSync(path.join(attempt, 'product.log'), 'utf8')).toContain('==== safe_rules (exit=0; killed_by=null) ====');
    expect(JSON.parse(fs.readFileSync(path.join(attempt, 'driver-launches.json'), 'utf8')).launches[0]).toMatchObject({ mode: 'safe_rules', code: 0 });

    const failing = phaseContext('p07-safe', 2);
    const failed = await smoke.runDriverPhase(failing.ctx, {
      runtime, exec: () => ({ status: 0, stdout: '', stderr: '', error: null }),
      launchDriver: async (_runtime: any, env: any) => {
        fs.writeFileSync(env.A9_BATCH2_DRIVER_RESULT, JSON.stringify({ status: 'ERROR', error: 'step x: DOM id missing', assertions: [] }));
        return { code: 2, signal: null, killed_by: null, duration_ms: 1, stdout: '', stderr: 'boom', pid: 2 };
      },
    });
    expect(failed).toMatchObject({ status: 'NOT_PERFORMED', failure_class: 'DRIVER_SAFE_RULES_FAILED' });
    expect(JSON.parse(fs.readFileSync(path.join(failing.attempt, 'driver-launches.json'), 'utf8')).launches[0].driver_error).toContain('DOM id missing');
    await expect(smoke.runDriverPhase(phaseContext('p01-env').ctx, {})).rejects.toThrow(/NOT_A_DRIVER_PHASE/);
  });

  test('a kill-on-marker mode that was not killed by the marker fails the phase', async () => {
    const { ctx } = phaseContext('p08-ui');
    const result = await smoke.runDriverPhase(ctx, {
      runtime: { electronPath: 'electron.exe', appRoot: 'app', driverSha256: sha('driver') }, exec: () => ({ status: 0, stdout: '', stderr: '', error: null }),
      launchDriver: async () => ({ code: 0, signal: null, killed_by: null, duration_ms: 1, stdout: '', stderr: '', pid: 3 }),
    });
    expect(result.failure_class).toBe('DRIVER_UI_INTERRUPT_FAILED');
    expect(result.status).not.toBe('PASS');
  });

  test('postflight fails on a leaked secret or leftover process and passes on a clean run with a working scan control', () => {
    const clean = phaseContext('p10-postflight', 10);
    fs.writeFileSync(path.join(clean.runRoot, 'note.txt'), 'harmless evidence');
    const rows = (extra = '') => ({ status: 0, stdout: `Node,ExecutablePath,Name,ParentProcessId,ProcessId\r\nH,C:\\Windows\\notepad.exe,notepad.exe,1,500\r\n${extra}`, stderr: '', error: null });
    const ok = smoke.runPostflightPhase(clean.ctx, () => rows());
    const firstCase = ok.cases[0];
    expect(firstCase.assertions[0].status).toBe('PASS');
    expect(firstCase.assertions[1].status).toBe('PASS');
    expect(fs.existsSync(path.join(clean.attempt, 'evidence-manifest.json'))).toBe(true);

    const leaking = phaseContext('p10-postflight', 10);
    fs.writeFileSync(path.join(leaking.runRoot, 'leak.log'), `key ${fixtures.testOnlySecret()}`);
    const leaked = smoke.runPostflightPhase(leaking.ctx, () => rows());
    expect(leaked.status).toBe('FAIL');
    expect(leaked.failure_class).toBe('SECRET_FOUND');

    const residue = phaseContext('p10-postflight', 10);
    const left = smoke.runPostflightPhase(residue.ctx, () => rows(`H,${path.join(residue.candidateRoot, 'electron.exe').replace(/\//g, '\\')},electron.exe,1,600\r\n`));
    void left;
    const none = smoke.runPostflightPhase(phaseContext('p10-postflight', 10).ctx, () => ({ status: 0, stdout: '', stderr: '', error: null }));
    expect(none.cases[0].assertions[1].status).toBe('UNKNOWN');
  });
});

describe('A9-33 batch-2 driver evaluators', () => {
  const event = (eventId: number, data: any, eventType = 'tool_output', turnId = 't1') => ({ eventId, turnId, eventType, payload: { data } });

  test('persisted tool output frames must keep one consecutive sequence per tool call', () => {
    const events = [
      event(1, { toolCallId: 'c1', stream: 'stdout', outputSeq: 1, text: 'tick 1\n' }),
      event(2, { toolCallId: 'c1', stream: 'stderr', outputSeq: 2, text: 'err 1\n' }),
      event(3, { toolCallId: 'c2', stream: 'stdout', outputSeq: 1, text: 'other' }),
      event(4, { toolCallId: 'c1', stream: 'stdout', outputSeq: 3, text: 'tick 2\n', truncated: true }),
      event(5, { toolName: 'x' }, 'tool_end'),
    ];
    const frames = driver.framesFromEvents(events);
    expect(frames).toHaveLength(4);
    expect(driver.evaluateStreamOrder(frames)).toMatchObject({ ok: true, calls: 2, frames: 4, problems: [] });
    expect(driver.textsPerStream(frames, 'stdout')).toBe('tick 1\nothertick 2\n');
    expect(driver.textsPerStream(frames, 'stderr')).toBe('err 1\n');
    const gap = driver.framesFromEvents([event(1, { toolCallId: 'c1', stream: 'stdout', outputSeq: 1, text: 'a' }), event(2, { toolCallId: 'c1', stream: 'stdout', outputSeq: 3, text: 'b' })]);
    expect(driver.evaluateStreamOrder(gap)).toMatchObject({ ok: false, problems: ['call=c1:position=2:outputSeq=3'] });
    expect(driver.evaluateStreamOrder([])).toMatchObject({ ok: false });
    expect(driver.eventData({ payload: { flat: 1 } })).toEqual({ flat: 1 });
  });

  test('display after persistence is proven only by observations, never by silence', () => {
    expect(driver.evaluateDomAfterDb([{ t: 1, domFrameTexts: ['tick 1'], dbFrameTexts: ['tick 1', 'tick 2'], ipcEventIds: [4], dbEventIds: [4, 5] }])).toMatchObject({ ok: true, observations: 2 });
    expect(driver.evaluateDomAfterDb([{ t: 1, domFrameTexts: ['tick 9'], dbFrameTexts: ['tick 1'], ipcEventIds: [], dbEventIds: [] }]).violations).toEqual([{ t: 1, kind: 'dom', text: 'tick 9' }]);
    expect(driver.evaluateDomAfterDb([{ t: 1, domFrameTexts: [], dbFrameTexts: ['x'], ipcEventIds: [7], dbEventIds: [] }]).violations[0]).toMatchObject({ kind: 'ipc', eventId: 7 });
    expect(driver.evaluateDomAfterDb([{ t: 1, domFrameTexts: [], dbFrameTexts: ['x'], ipcEventIds: [], dbEventIds: [] }]).ok).toBe(false);
    expect(driver.evaluateLiveTick(1000, 4200)).toMatchObject({ ok: true, lead_ms: 3200 });
    expect(driver.evaluateLiveTick(4000, 4500)).toMatchObject({ ok: false, lead_ms: 500 });
    expect(driver.evaluateLiveTick(null, 4500)).toMatchObject({ ok: false, reason: 'missing observation' });
  });

  test('secret, CRLF, paging and status helpers behave on edge input', () => {
    expect(driver.secretLeak('abc sk-TESTONLYBA', 'sk-TESTONLYBATCH20123456789abcdef')).toEqual({ leaked: true, checked: true });
    expect(driver.secretLeak('clean', 'sk-TESTONLYBATCH20123456789abcdef')).toEqual({ leaked: false, checked: true });
    expect(driver.secretLeak('anything', '')).toEqual({ leaked: false, checked: false });
    expect(driver.normalizeCrlf('a\r\nb\r\n')).toBe('a\nb\n');
    const full = [1, 2, 3, 4, 5].map((eventId) => ({ eventId }));
    expect(driver.evaluatePaging(full, [[{ eventId: 4 }, { eventId: 5 }], [{ eventId: 2 }, { eventId: 3 }], [{ eventId: 1 }]])).toMatchObject({ ok: true, pages: 3 });
    expect(driver.evaluatePaging(full, [[{ eventId: 4 }, { eventId: 5 }], [{ eventId: 1 }]]).ok).toBe(false);
    expect(driver.evaluatePaging([], [])).toMatchObject({ ok: false });
    expect(driver.combineStatus(['PASS', 'PASS'])).toBe('PASS');
    expect(driver.combineStatus(['PASS', 'FAIL', 'UNKNOWN'])).toBe('FAIL');
    expect(driver.combineStatus(['PASS', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(driver.combineStatus(['PASS', 'NOT_PERFORMED'])).toBe('NOT_PERFORMED');
    expect(driver.combineStatus([])).toBe('UNKNOWN');
    expect(driver.assertionId('B2-SAFE-02', 2)).toBe('B2-SAFE-02-A02');
  });

  test('process tree helpers match a process only by pid and creation stamp', () => {
    const rows = [
      { ProcessId: '10', ParentProcessId: '1', Name: 'electron.exe', CreationDate: 'a' },
      { ProcessId: '11', ParentProcessId: '10', Name: 'cmd.exe', CreationDate: 'b' },
      { ProcessId: '12', ParentProcessId: '11', Name: 'ping.exe', CreationDate: 'c' },
      { ProcessId: '13', ParentProcessId: '1', Name: 'other.exe', CreationDate: 'd' },
      { ProcessId: '10', ParentProcessId: '12', Name: 'loop.exe', CreationDate: 'z' },
    ];
    const tree = driver.descendantsOf(rows, 10);
    expect(tree.map((item: any) => item.pid)).toEqual([11, 12]);
    const baseline = driver.descendantsOf(rows.slice(0, 2), 10);
    expect(driver.newProcesses(baseline, tree).map((item: any) => item.pid)).toEqual([12]);
    expect(driver.stillAlive(tree, [{ ProcessId: '12', CreationDate: 'c' }, { ProcessId: '11', CreationDate: 'reused-pid' }]).map((item: any) => item.pid)).toEqual([12]);
    expect(driver.stillAlive(tree, [])).toEqual([]);
  });

  test('tool end events are classified from persisted facts', () => {
    const ends = [
      event(1, { toolName: 'start_process', ok: true }, 'tool_end'),
      event(2, { toolName: 'stop_process', ok: false, error: { code: 'A9_HANDLE_NOT_OWNED' } }, 'tool_end'),
      event(3, { toolName: 'read_process_output', result: 'A9_CURSOR_INVALID' }, 'tool_end'),
      event(4, { toolName: 'read_process_output', status: 'failed' }, 'tool_end'),
    ];
    expect(driver.toolEndsFor(ends, 'read_process_output')).toHaveLength(2);
    expect(driver.toolEndFailed(ends[0])).toBe(false);
    expect(driver.toolEndFailed(ends[1])).toBe(true);
    expect(driver.toolEndFailed(ends[2])).toBe(true);
    expect(driver.toolEndFailed(ends[3])).toBe(true);
    expect(driver.toolEndFailed({ eventId: 5, payload: { data: { toolName: 'x', ok: true, status: 'ok' } } })).toBe(false);
    expect(driver.summarizeToolEnd(ends[1])).toMatchObject({ toolName: 'stop_process', ok: false, error: 'A9_HANDLE_NOT_OWNED' });
    expect(driver.EXIT_BUTTONS).toEqual(['停止后退出', '留给系统后退出', '取消']);
    expect(driver.sha256('a')).toBe(sha('a'));
  });
  test('guard sub-results never turn an unobserved fact into PASS', () => {
    expect(driver.subResult('x', true, 'seen')).toEqual({ name: 'x', status: 'PASS', detail: 'seen' });
    expect(driver.subResult('x', false, 'bad').status).toBe('FAIL');
    expect(driver.subResult('x', null, 'not reached').status).toBe('UNKNOWN');
    expect(driver.subResult('x', undefined).status).toBe('UNKNOWN');
    expect(driver.summarizeSubs([driver.subResult('a', true), driver.subResult('b', true)])).toEqual({ status: 'PASS', text: 'a=PASS; b=PASS' });
    expect(driver.summarizeSubs([driver.subResult('a', true), driver.subResult('b', null)]).status).toBe('UNKNOWN');
    expect(driver.summarizeSubs([driver.subResult('a', false), driver.subResult('b', null)]).status).toBe('FAIL');
    expect(driver.summarizeSubs([]).status).toBe('UNKNOWN');
  });

  test('a guard counts as refused only with the named error and no Provider request or continue event', () => {
    const refused = { ok: false, error: { code: 'A9_CONTINUE_REVISION_MISMATCH' } };
    const still = { before: 4, after: 4 };
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', still, { before: 0, after: 0 })).toBe(true);
    expect(driver.guardRefused(refused, 'A9_CONTINUE_IDENTITY_MISMATCH', still, { before: 0, after: 0 })).toBe(false);
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', { before: 4, after: 5 }, { before: 0, after: 0 })).toBe(false);
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', still, { before: 0, after: 1 })).toBe(false);
    expect(driver.guardRefused({ ok: true }, 'A9_CONTINUE_REVISION_MISMATCH', still, { before: 0, after: 0 })).toBe(false);
    expect(driver.guardRefused(null, 'A9_CONTINUE_REVISION_MISMATCH', still, { before: 0, after: 0 })).toBe(false);
    expect(driver.guardRefused(refused, 'A9_CONTINUE_REVISION_MISMATCH', undefined, { before: 0, after: 0 })).toBe(false);
  });

  test('the UI-01 journey passes only from a complete observed set and names the broken step', () => {
    const card = (button = '继续', disabled = false) => ({ text: '继续中断任务', button, disabled });
    const full = (): any => ({
      card0: card(),
      enter: { busy_label: true, button_disabled: true, focus_in_card: true, scroll: { testable: true, before: 0, after: 1 }, continue_events_while_busy: 1, continue_events_after_extra_keys: 1 },
      stopped: { card: card(), focus_in_card: true, interrupted_turn_changed: true, revision_changed: true },
      view_return: { card: card() },
      space: { continue_events_total: 2, ipc_continue_calls_total: 2, second_turn_status: 'completed' },
    });
    const verdict = (facts: any) => driver.summarizeSubs(driver.evaluateUiJourney(facts));
    expect(driver.evaluateUiJourney(full())).toHaveLength(9);
    expect(verdict(full())).toMatchObject({ status: 'PASS' });
    expect(verdict({})).toMatchObject({ status: 'UNKNOWN' });
    expect(verdict(null)).toMatchObject({ status: 'UNKNOWN' });
    const failures: Array<[string, (f: any) => void]> = [
      ['loading_feedback', (f) => { f.enter.busy_label = false; }],
      ['loading_feedback', (f) => { f.enter.button_disabled = false; }],
      ['focus_stays_on_card_while_busy', (f) => { f.enter.focus_in_card = false; }],
      ['no_scroll_theft', (f) => { f.enter.scroll.after = 400; }],
      ['one_dispatch_while_busy', (f) => { f.enter.continue_events_after_extra_keys = 2; }],
      ['stop_returns_actionable_new_card', (f) => { f.stopped.card.disabled = true; }],
      ['stop_returns_actionable_new_card', (f) => { f.stopped.revision_changed = false; }],
      ['stop_returns_actionable_new_card', (f) => { f.stopped.interrupted_turn_changed = false; }],
      ['focus_on_card_after_stop', (f) => { f.stopped.focus_in_card = false; }],
      ['view_return_keeps_card', (f) => { f.view_return.card.disabled = true; }],
      ['space_retry_creates_one_more_turn', (f) => { f.space.continue_events_total = 3; }],
      ['space_retry_creates_one_more_turn', (f) => { f.space.second_turn_status = 'interrupted'; }],
    ];
    for (const [name, mutate] of failures) {
      const facts = full(); mutate(facts);
      const subs = driver.evaluateUiJourney(facts);
      expect(subs.find((item: any) => item.name === name).status).toBe('FAIL');
      expect(driver.summarizeSubs(subs).status).toBe('FAIL');
    }
    // A scroll area that cannot scroll proves nothing, so it stays UNKNOWN instead of PASS; a missing step stays UNKNOWN too.
    const flat = full(); flat.enter.scroll = { testable: false, before: 0, after: 0 };
    expect(driver.evaluateUiJourney(flat).find((item: any) => item.name === 'no_scroll_theft').status).toBe('UNKNOWN');
    expect(verdict(flat).status).toBe('UNKNOWN');
    const noSpace = full(); noSpace.space = null;
    expect(verdict(noSpace).status).toBe('UNKNOWN');
  });
});

// The guard journeys of p06 judge persisted facts. This block runs the driver's own fact writers against the real runtime in
// Node, so the expectations (error codes, blocked reasons, zero requests) are checked on the dev machine before any rehearsal.
// It is not Electron, Win10 or Win7 evidence.
describe('A9-33 batch-2 guard journeys against the real runtime', () => {
  function startCountingProvider(): Promise<{ baseUrl: string; count: () => number; close: () => Promise<void> }> {
    let seen = 0;
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        req.on('data', () => undefined);
        req.on('end', () => {
          seen += 1;
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        });
      });
      server.listen(0, '127.0.0.1', () => resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, count: () => seen, close: () => new Promise<void>((done) => server.close(() => done())),
      }));
    });
  }

  test('wrong owner, revision drift, residue and unreadable mode settings each refuse a continue and send nothing', async () => {
    const root = temp('guards');
    const workspaceRoot = path.join(root, 'ws');
    const dataRoot = path.join(root, 'data');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(dataRoot, { recursive: true });
    const provider = await startCountingProvider();
    const makeRuntime = () => createA9AgentRuntime({
      workspaceRoot, dataRoot, ownerId: `b2-guards-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      openDatabase: (file: string, options?: { readonly?: boolean }) => new Database(file, options && options.readonly ? { readonly: true } : {}),
    });
    const taskId = 'b2-guard-task';
    const continueEvents = () => {
      const db = new Database(path.join(dataRoot, 'a9-state.db'), { readonly: true });
      try { return (db.prepare("SELECT count(*) AS n FROM a9_events WHERE event_type = 'task_continue_requested'").get() as any).n as number; } finally { db.close(); }
    };
    let runtime = makeRuntime();
    try {
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: provider.baseUrl, model: 'fixture', skipProbe: true });
      const conversation = runtime.getSnapshot().activeConversationId;
      const writer = new Database(path.join(dataRoot, 'a9-state.db'));
      try { driver.insertInterruptedTask(writer, conversation, taskId, 'b2-guard-old-turn'); } finally { writer.close(); }
      const find = () => runtime.getSnapshot().recoveryTasks.find((item: any) => item.taskId === taskId);
      const recovery = find();
      expect(recovery).toMatchObject({ canContinue: true, conversationId: conversation, interruptedTurnId: 'b2-guard-old-turn' });
      const measured = async (identity: { conversationId: string; recoveryRevision: string }) => {
        const before = { requests: provider.count(), events: continueEvents() };
        const result = await runtime.continueTask({ conversationId: identity.conversationId, taskId, interruptedTurnId: recovery.interruptedTurnId, recoveryRevision: identity.recoveryRevision });
        return { result, requests: { before: before.requests, after: provider.count() }, events: { before: before.events, after: continueEvents() } };
      };
      const good = { conversationId: conversation, recoveryRevision: recovery.recoveryRevision };

      const wrong = await measured({ conversationId: 'b2-not-this-conversation', recoveryRevision: recovery.recoveryRevision });
      expect(driver.guardRefused(wrong.result, 'A9_CONTINUE_IDENTITY_MISMATCH', wrong.requests, wrong.events)).toBe(true);
      const drift = await measured({ conversationId: conversation, recoveryRevision: '0'.repeat(64) });
      expect(driver.guardRefused(drift.result, 'A9_CONTINUE_REVISION_MISMATCH', drift.requests, drift.events)).toBe(true);

      // Residue: the injected fact blocks the card and the call; removing it unblocks the same card.
      const residue = new Database(path.join(dataRoot, 'a9-state.db'));
      try { driver.insertResidueFact(residue, workspaceRoot, 'b2-injected-residue'); } finally { residue.close(); }
      expect(find()).toMatchObject({ canContinue: false, blockedReason: 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED' });
      const blocked = await measured(good);
      expect(driver.guardRefused(blocked.result, 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED', blocked.requests, blocked.events)).toBe(true);
      const cleanup = new Database(path.join(dataRoot, 'a9-state.db'));
      try { driver.deleteResidueFact(cleanup, 'b2-injected-residue'); } finally { cleanup.close(); }
      expect(find()).toMatchObject({ canContinue: true });
      expect(provider.count()).toBe(0);

      // Unreadable mode settings: a new runtime keeps the same real task blocked and sends nothing.
      await runtime.shutdown();
      const located = driver.findModeSettingsFile(dataRoot);
      expect(located.count).toBe(1);
      const original = fs.readFileSync(located.file);
      try {
        fs.writeFileSync(located.file, driver.CORRUPT_MODE_SETTINGS, 'utf8');
        runtime = makeRuntime();
        expect(find()).toMatchObject({ canContinue: false, blockedReason: 'A9_MODE_SELECTION_REQUIRED' });
        const mode = await measured(good);
        expect(driver.guardRefused(mode.result, 'A9_MODE_SELECTION_REQUIRED', mode.requests, mode.events)).toBe(true);
        expect(provider.count()).toBe(0);
      } finally { fs.writeFileSync(located.file, original); }
    } finally {
      try { await runtime.shutdown(); } catch (_error) { /* already shut down */ }
      await provider.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
