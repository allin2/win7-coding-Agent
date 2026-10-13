// A9-33 batch2 validation contract and bounded fixtures (WIN7-43 tentative, ADR-0155 Proposed).
//
// This module is the single definition of the batch2 acceptance contract. The producer
// (scripts/release/build-a9-product-v3.mjs) builds the validation kit from it, and the packaged
// integrity verifier, smoke runner, report verifier and desktop request generator require the
// same file from validation/, so the case, phase and evidence sets cannot drift apart.
// Nothing here touches the file system, spawns a process or contacts a network at load time.
// Compatible with Electron 22 / Node 16.17.1 (no optional chaining on assignment targets, no
// Array.prototype.at, no structuredClone).
'use strict';

const CONTRACT = Object.freeze({
  schema_version: 1,
  task: 'A9-33',
  decision: 'ADR-0155 (Proposed; not accepted by A9-33 section 6.7)',
  lock_id: 'A9-BATCH2-INPUTS-D013-V26-MANAGED',
  release_id: 'WIN7-CODING-AGENT-A9-ALPHA2',
  version: '0.3.0-alpha.2',
  // WIN7-43 is tentative. Before freeze the number is checked against refs, registrations and
  // directories; a renumber changes this file, the profile, the lock and the kit together.
  candidate: 'WIN7-43',
  candidate_tentative: true,
  result_on_complete: 'A9_33_WIN7_43_BATCH2_EXECUTION_CAPABILITY_PASS',
  result_ceiling: 'Batch-2 execution capability only; never the full Alpha 2 or an RC verdict.',
});

// Resource ceiling proposed by A9-33 section 5/6.3. These are caps, not a granted budget:
// every prepare, repeat and failed call counts against max_requests.
const LIMITS = Object.freeze({
  max_requests: 16,
  max_wall_seconds: 7200,
  desktop_windows: 1,
  max_background_processes: 3,
  request_ttl_seconds: 900,
});

const GATES = Object.freeze(['G0', 'G1', 'G2', 'G3', 'G4']);

// One phase = one approved request. Order is the execution order. The argv templates are the only
// commands the desktop controller may run; "{...}" tokens are filled from the request, never from
// free text. All phases run the packaged electron.exe in its declared Node mode.
const PHASES = Object.freeze([
  { id: 'p01-env', gate: 'G0', order: 1, script: 'smoke', requires: [], cost: 1,
    summary: 'Target identity, runtime, shell, codepage, patches, space and process-tree admission' },
  { id: 'p02-integrity', gate: 'G1', order: 2, script: 'integrity', requires: ['p01-env'], cost: 1,
    summary: 'Package, lock, manifest, authority, pin and physical closure; actual module loading' },
  { id: 'p03-chain', gate: 'G2', order: 3, script: 'smoke', requires: ['p02-integrity'], cost: 1,
    summary: 'Shortest real chain: start, background output, Stop, interrupt/restart with zero requests, explicit continue, normal exit' },
  { id: 'p04-streaming', gate: 'G2', order: 4, script: 'smoke', requires: ['p03-chain'], cost: 1,
    summary: 'S01-S05 Shell live output, encodings, limits, secrets, backpressure, cancel and Job recovery' },
  { id: 'p05-session-bg', gate: 'G2', order: 5, script: 'smoke', requires: ['p03-chain'], cost: 1,
    summary: 'S06 refresh/paging/restart and BG ownership, cursor, limit, Stop, release' },
  { id: 'p06-continue', gate: 'G2', order: 6, script: 'smoke', requires: ['p03-chain'], cost: 1,
    summary: 'CONT-01 and CONT-03 restart, one click one Turn, stale approvals, unknown side effects and zero-request guards' },
  { id: 'p07-safe', gate: 'G2', order: 7, script: 'smoke', requires: ['p03-chain'], cost: 1,
    summary: 'SAFE-02 audit hard stop and unknown side effects' },
  { id: 'p08-ui', gate: 'G2', order: 8, script: 'smoke', requires: ['p03-chain'], cost: 1,
    summary: 'UI-01..02 continue card interaction, focus/scroll, Stop and reachable layouts' },
  { id: 'p09-report', gate: 'G3', order: 9, script: 'report', requires: ['p04-streaming', 'p05-session-bg', 'p06-continue', 'p07-safe', 'p08-ui'], cost: 1,
    summary: 'Ordinary-user report verification and negative controls' },
  { id: 'p10-postflight', gate: 'G4', order: 10, script: 'smoke', requires: ['p09-report'], cost: 1,
    summary: 'Secret scan, full post-flight, process-tree residue and evidence manifest' },
]);

// Shortest real chain (A9-33 section 6.2). Evidence names are the registered closed set.
const CHAIN_STEPS = Object.freeze([
  { id: 'STEP-01-START', index: 1, evidence: ['01-start-identity.json', '01-package-load.json', '01-start.png', 'product.log'] },
  { id: 'STEP-02-BACKGROUND', index: 2, evidence: ['02-background.json', '02-output-frames.jsonl', 'state.sqlite', '02-output.png'] },
  { id: 'STEP-03-STOP', index: 3, evidence: ['03-stop.json', '03-held-exit.json', '03-process-tree.json', '03-stop.png'] },
  { id: 'STEP-04-INTERRUPT-RESTART', index: 4, evidence: ['04-interruption.json', '04-restart-counters.json', '04-task-turn-events.json', '04-card.png'] },
  { id: 'STEP-05-CONTINUE', index: 5, evidence: ['05-continue-ipc.json', '05-provider-requests.jsonl', '05-tool-audit.jsonl', '05-turn-dedup.json', '05-focus-scroll.png'] },
  { id: 'STEP-06-NORMAL-EXIT', index: 6, evidence: ['06-dialog-response.json', '06-held-exit.json', '06-postflight.json', 'evidence-manifest.json'] },
]);

function assertion(caseId, n, description) {
  return { assertion_id: `${caseId}-A${String(n).padStart(2, '0')}`, description };
}
function makeCase(id, gate, phase, requirement, purpose, descriptions, evidence) {
  return {
    case_id: id, gate, phase, requirement, purpose,
    assertions: descriptions.map((text, index) => assertion(id, index + 1, text)),
    evidence,
    evidence_class: 'DIRECT_CURRENT_CANDIDATE',
  };
}

const CASES = Object.freeze([
  makeCase('B2-G0-ENV', 'G0', 'p01-env', 'ENV', 'Bind the target, identity and runtime before any product action.', [
    'Windows 7 SP1 x64 build 7601 on the approved machine; no unknown stale product, driver, helper or Shell tree',
    'Ordinary desktop token: SID, Session, Integrity, Elevation and Job membership recorded and equal to the approved contract',
    'Electron 22.3.27, Node 16.17.1 and ABI 110 read from the packaged runtime',
    'PowerShell version, OEM/ANSI codepage and signing/TLS patch facts recorded; unknown facts stop the dependent phases',
    'Free space and evidence root outside the candidate verified',
  ], ['g0-env.json', 'g0-identity.json', 'g0-processes-before.json']),
  makeCase('B2-G1-PACKAGE', 'G1', 'p02-integrity', 'PACKAGE', 'Verify the exact frozen package and the actual loaded modules.', [
    'ZIP, manifest, input lock, release authority and the independent pin agree; the authority is outside the candidate',
    'Every manifest file matches on disk with zero mismatches and zero unmanifested files',
    'Helper and SQLite binding hashes match the lock; PE contracts hold; native files are outside app and ASAR',
    'main, preload, State, Core and Runtime modules load from the package with the expected Profile and protocol 3',
  ], ['a9-package-integrity.json', 'g1-module-load.json']),

  makeCase('B2-CH-01-START', 'G2', 'p03-chain', 'CHAIN', 'Chain step 1: ordinary desktop start with the current package.', [
    'First paint of the current product; actual source, native, SQLite and ABI identities match the package',
    'SID, Session, Integrity, Elevation and Job satisfy the contract; no old tree has an unknown exit',
  ], CHAIN_STEPS[0].evidence),
  makeCase('B2-CH-02-BACKGROUND', 'G2', 'p03-chain', 'CHAIN', 'Chain step 2: bounded background output through the real product entry.', [
    'Tick, stdout and stderr are visible before the process ends; SQLite persists before the card shows them',
    'The card and the output are bound to one owner and one handle',
  ], CHAIN_STEPS[1].evidence),
  makeCase('B2-CH-03-STOP', 'G2', 'p03-chain', 'CHAIN', 'Chain step 3: Stop on the owned handle.', [
    'Immediate card feedback; the same Job and process tree actually exits; output and audit terminal states agree',
    'No PID argument is accepted; no cleanup_required residue is left unexplained',
  ], CHAIN_STEPS[2].evidence),
  makeCase('B2-CH-04-INTERRUPT-RESTART', 'G2', 'p03-chain', 'CHAIN', 'Chain step 4: interrupt at an approved point, restart, zero requests.', [
    'The recovery fact card appears; the old Turn terminal state is unchanged',
    'Restart and refresh add zero Provider requests and zero tool requests against the recorded baseline',
  ], CHAIN_STEPS[3].evidence),
  makeCase('B2-CH-05-CONTINUE', 'G2', 'p03-chain', 'CHAIN', 'Chain step 5: explicit continue on the current recoveryRevision.', [
    'One new Turn linked to the original task; a duplicate key returns the same identity and adds no request',
    'The old high-impact approval cannot execute; an unknown side effect is observed before dispatch; Stop works on the new Turn',
  ], CHAIN_STEPS[4].evidence),
  makeCase('B2-CH-06-NORMAL-EXIT', 'G2', 'p03-chain', 'CHAIN', 'Chain step 6: normal exit through the real exit dialog.', [
    'The visible exit choice and its actual return value are recorded',
    'The product process exits with a recorded exit code and time; every driver, helper and Shell process of a non-empty pre-exit tree is absent by creation-date identity, with the absence observation time recorded; evidence is fully collected',
  ], CHAIN_STEPS[5].evidence),

  makeCase('B2-S01-LIVE-TICK', 'G2', 'p04-streaming', 'S01', 'Shell output is visible before the command exits.', [
    'A tick line is rendered at least 1 s before the command ends',
  ], ['s01-live-tick.json']),
  makeCase('B2-S02-STREAM-ORDER', 'G2', 'p04-streaming', 'S02', 'stdout/stderr keep a stable sequence.', [
    'Interleaved stdout and stderr frames keep their sequence numbers in the persisted order',
  ], ['s02-stream-order.json']),
  makeCase('B2-S03-SQLITE-BEFORE-IPC', 'G2', 'p04-streaming', 'S03', 'Persist first, then deliver.', [
    'SQLite holds each frame before the IPC and Renderer observation of the same frame',
  ], ['s03-sqlite-before-ipc.json']),
  makeCase('B2-S03T-TERMINAL-AUDIT', 'G2', 'p04-streaming', 'S03', 'Terminal verification and audit failure dispatch nothing more.', [
    'A required audit failure at the terminal state stops all later dispatch and keeps the executed counts exact',
  ], ['s03t-terminal-audit.json']),
  makeCase('B2-S04-ENCODING-CROSSCHUNK', 'G2', 'p04-streaming', 'S04', 'Decode across chunk boundaries.', [
    'UTF-8, CP936 and UTF-16LE text split across chunks decodes losslessly; CRLF and a final line without newline are preserved',
  ], ['s04-encoding.json']),
  makeCase('B2-S05-LIMITS-SECRET-BACKPRESSURE', 'G2', 'p04-streaming', 'S05', 'Limits, secrets, backpressure, cancel and Job recovery.', [
    'Output over the limit is truncated with a structured count; a secret split across chunks is redacted',
    'Backpressure does not lose frames; cancel reaches the real Job; the process tree is recovered on the same instance',
  ], ['s05-limits-secret.json']),
  makeCase('B2-S06-REFRESH-PAGING-RESTART', 'G2', 'p05-session-bg', 'S06', 'Refresh, paging, return and restart keep streamed output.', [
    'After refresh, view return, pagination and restart the streamed rows are present once and in order',
  ], ['s06-refresh-paging.json']),
  makeCase('B2-BG-01-LIMIT-THREE', 'G2', 'p05-session-bg', 'BG', 'Three background processes allowed, the fourth rejected.', [
    'Three handles start and stay available; the fourth start is rejected with a structured error and zero process',
  ], ['bg01-limit.json']),
  makeCase('B2-BG-02-OWNERSHIP-CURSOR', 'G2', 'p05-session-bg', 'BG', 'Owner, handle and cursor bindings.', [
    'A wrong owner, wrong handle or out-of-range cursor is refused; a valid cursor returns exactly the next frames',
  ], ['bg02-ownership-cursor.json']),
  makeCase('B2-BG-03-STOP-RELEASE-EXIT', 'G2', 'p05-session-bg', 'BG', 'Double Stop, ready failure, release and normal exit.', [
    'A second Stop is idempotent; a ready failure leaves no process; release ends ownership; normal exit leaves no managed process',
  ], ['bg03-stop-release.json']),
  makeCase('B2-CONT-01-RESTART-ZERO-REQUEST', 'G2', 'p06-continue', 'CONT-01', 'Restart and refresh send nothing; one click creates one Turn.', [
    'Restart and refresh add zero Provider and tool requests; single click and double click create one new Turn',
    'The old Turn terminal state is unchanged',
  ], ['cont01-restart.json']),
  makeCase('B2-CONT-03-APPROVAL-UNKNOWN-EFFECTS', 'G2', 'p06-continue', 'CONT-03', 'Approvals and unknown side effects.', [
    'An old approval cannot execute; an unknown write, edit, delete or Shell effect is observed first',
    'A healthy owned background process coexists; residue, wrong owner, revision drift or unreadable mode settings (mode diagnostics) dispatch nothing',
  ], ['cont03-approval-unknown.json']),
  makeCase('B2-SAFE-02-AUDIT-HARD-STOP', 'G2', 'p07-safe', 'SAFE', 'Required audit failure is a hard stop.', [
    'A required audit failure stops the Turn; an unknown side effect is never recorded as zero',
  ], ['safe02-audit-hard-stop.json']),
  makeCase('B2-UI-01-CONTINUE-INTERACTION', 'G2', 'p08-ui', 'UI', 'Continue card interaction.', [
    'Loading/retry, continue feedback, Enter/Space, focus staying on the card, no scroll theft, view return, Stop and a new failure card',
  ], ['ui01-interaction.json', 'ui01-interaction.png']),
  makeCase('B2-UI-02-LAYOUTS-DPI', 'G2', 'p08-ui', 'UI', 'Reachable layouts and DPI.', [
    '1366x768 at page zoom 100% and 125% (not Windows DPI scaling), the four reachable layouts and a shorter window keep the prompt, the run control and the continuation card button usable; below 800 px stays NOT_VERIFIED',
  ], ['ui02-layouts.json', 'ui02-layouts.png']),

  makeCase('B2-G3-REPORT-NEGATIVES', 'G3', 'p09-report', 'REPORT', 'Ordinary-user report verification with negative controls.', [
    'The report verifier accepts the exact case set and rejects a wrong pin, a missing evidence file, an edited report and a wrong candidate',
  ], ['g3-report-verify.json', 'g3-negatives.json']),
  makeCase('B2-G4-SECRETS-POSTFLIGHT', 'G4', 'p10-postflight', 'POSTFLIGHT', 'Secret scan and post-flight.', [
    'The secret scanner finds no real secret and detects the positive control',
    'Post-flight finds no residue in any registered tree; the evidence manifest hashes every collected file',
  ], ['g4-secret-scan.json', 'g4-postflight.json', 'evidence-manifest.json']),
]);

// Known limits that travel with the verdict (A9-33 section 5). They do not enter the pass criteria.
const KNOWN_LIMITS = Object.freeze([
  'A9-34 recovered-cleanup disposition is deferred; a recovered cleanup_required has no in-product disposition',
  'Native exit cancellation (Esc) is not measured',
  'CONT-02 crash points inside the persistence transaction and around Provider or tool dispatch cannot be hit from outside the product; they stay covered by the A9-32 developer-machine tests only',
  'SAFE-01 incompressible over-budget request is not constructible because the Renderer exposes no context budget setting; it stays covered by the A9-32 developer-machine tests only',
  'Real Provider and enterprise environment are not covered; loopback fixtures only',
  'POSIX executability and PowerShell /Command real execution are not measured',
  'Layouts below 800 px are PRODUCT_UNREACHABLE / NOT_VERIFIED',
  'No INHERITED_EVIDENCE is approved while ADR-0155 is Proposed',
]);

function evidenceSet() {
  const names = [];
  for (const item of CASES) for (const name of item.evidence) if (!names.includes(name)) names.push(name);
  return names;
}

function phaseById(id) {
  return PHASES.find((phase) => phase.id === id) || null;
}

function selfCheck() {
  const problems = [];
  const caseIds = new Set();
  const assertionIds = new Set();
  for (const item of CASES) {
    if (caseIds.has(item.case_id)) problems.push(`DUPLICATE_CASE:${item.case_id}`);
    caseIds.add(item.case_id);
    if (!GATES.includes(item.gate)) problems.push(`BAD_GATE:${item.case_id}`);
    const phase = phaseById(item.phase);
    if (!phase) problems.push(`UNKNOWN_PHASE:${item.case_id}:${item.phase}`);
    else if (phase.gate !== item.gate) problems.push(`GATE_PHASE_MISMATCH:${item.case_id}`);
    if (!item.assertions.length || !item.evidence.length) problems.push(`EMPTY_CASE:${item.case_id}`);
    for (const a of item.assertions) {
      if (assertionIds.has(a.assertion_id)) problems.push(`DUPLICATE_ASSERTION:${a.assertion_id}`);
      assertionIds.add(a.assertion_id);
    }
  }
  const phaseIds = new Set();
  let cost = 0;
  PHASES.forEach((phase, index) => {
    if (phaseIds.has(phase.id)) problems.push(`DUPLICATE_PHASE:${phase.id}`);
    phaseIds.add(phase.id);
    if (phase.order !== index + 1) problems.push(`PHASE_ORDER:${phase.id}`);
    for (const need of phase.requires) {
      const required = phaseById(need);
      if (!required || required.order >= phase.order) problems.push(`PHASE_REQUIRES:${phase.id}:${need}`);
    }
    if (!CASES.some((item) => item.phase === phase.id)) problems.push(`PHASE_WITHOUT_CASE:${phase.id}`);
    cost += phase.cost;
  });
  if (cost > LIMITS.max_requests) problems.push(`PHASE_COST_OVER_LIMIT:${cost}`);
  const seenEvidence = new Map();
  for (const item of CASES) {
    for (const name of item.evidence) {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(name) || /\.\./.test(name)) problems.push(`BAD_EVIDENCE_NAME:${name}`);
      const owner = seenEvidence.get(name);
      // product.log, state.sqlite and evidence-manifest.json are shared by design; others must be unique.
      if (owner && !['evidence-manifest.json'].includes(name)) problems.push(`EVIDENCE_REUSED:${name}:${owner}:${item.case_id}`);
      seenEvidence.set(name, item.case_id);
    }
  }
  CHAIN_STEPS.forEach((step, index) => {
    if (step.index !== index + 1) problems.push(`CHAIN_INDEX:${step.id}`);
    const chainCase = CASES.find((item) => item.case_id.startsWith(`B2-CH-0${step.index}-`));
    if (!chainCase) problems.push(`CHAIN_WITHOUT_CASE:${step.id}`);
    else if (JSON.stringify(chainCase.evidence) !== JSON.stringify(step.evidence)) problems.push(`CHAIN_EVIDENCE:${step.id}`);
  });
  return {
    ok: problems.length === 0,
    problems,
    cases: CASES.length,
    assertions: assertionIds.size,
    phases: PHASES.length,
    request_cost: cost,
    max_requests: LIMITS.max_requests,
    retry_headroom: LIMITS.max_requests - cost,
    evidence_files: evidenceSet().length,
  };
}

// ---- Phase result contract ---------------------------------------------------------------------
// Every phase attempt ends with one phase-result.json. The smoke writes it after the raw evidence files are on disk;
// the report verifier re-derives the verdict from the same contract and never trusts the stored status alone.

const RESULT_KIND = 'A9_BATCH2_PHASE_RESULT';
const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;

function casesForPhase(phaseId) { return CASES.filter((item) => item.phase === phaseId); }

// Builds a result skeleton in which every contract case and assertion is NOT_PERFORMED until an evaluator sets it.
function newPhaseResult(phaseId, runId, requestIndex, bindings) {
  return {
    schema_version: 1, kind: RESULT_KIND, candidate_label: CONTRACT.candidate, run_id: runId, phase: phaseId, request_index: requestIndex,
    status: 'NOT_PERFORMED', failure_class: null, bindings: { ...bindings },
    started_at: new Date().toISOString(), finished_at: null,
    cases: casesForPhase(phaseId).map((item) => ({
      case_id: item.case_id, status: 'NOT_PERFORMED',
      assertions: item.assertions.map((a) => ({ assertion_id: a.assertion_id, status: 'NOT_PERFORMED', observed: '' })),
    })),
    evidence: [],
    first_failure: null,
  };
}

function setAssertion(result, caseId, assertionId, status, observed) {
  const found = result.cases.find((item) => item.case_id === caseId);
  const assertionResult = found && found.assertions.find((item) => item.assertion_id === assertionId);
  if (!assertionResult) throw new Error(`A9_BATCH2_RESULT_UNKNOWN_ASSERTION:${caseId}:${assertionId}`);
  if (!['PASS', 'FAIL', 'NOT_PERFORMED', 'UNKNOWN'].includes(status)) throw new Error(`A9_BATCH2_RESULT_STATUS_INVALID:${status}`);
  assertionResult.status = status;
  assertionResult.observed = String(observed === undefined ? '' : observed).slice(0, 2000);
  if (status === 'FAIL' && !result.first_failure) result.first_failure = { case_id: caseId, assertion_id: assertionId, detail: assertionResult.observed };
}

// Derives case and phase status from the assertions; a case passes only when every assertion passes with an observation.
function finalizePhaseResult(result, failureClass) {
  for (const item of result.cases) {
    const states = item.assertions.map((a) => a.status);
    item.status = states.every((state) => state === 'PASS') ? 'PASS'
      : states.includes('FAIL') ? 'FAIL' : states.includes('UNKNOWN') ? 'UNKNOWN' : 'NOT_PERFORMED';
  }
  const all = result.cases.map((item) => item.status);
  result.status = all.length > 0 && all.every((state) => state === 'PASS') ? 'PASS' : all.includes('FAIL') ? 'FAIL' : 'NOT_PERFORMED';
  // A phase-level failure (a driver ERROR or non-zero exit, a secret or residue finding, a failed verification) outranks the
  // assertions recorded before it: a named failure class can never end in PASS.
  if (failureClass && result.status === 'PASS') {
    result.status = 'FAIL';
    if (!result.first_failure) result.first_failure = { case_id: null, assertion_id: null, detail: String(failureClass).slice(0, 200) };
  }
  result.failure_class = result.status === 'PASS' ? null : (failureClass || (result.first_failure ? 'ASSERTION_FAILED' : 'INCOMPLETE'));
  result.finished_at = new Date().toISOString();
  return result;
}

// context: { runId, phase, bindings } -> list of problem codes
function phaseResultProblems(result, context) {
  const problems = [];
  const phase = phaseById(context.phase);
  if (!result || typeof result !== 'object' || Array.isArray(result)) return ['RESULT_NOT_OBJECT'];
  if (!phase) return ['PHASE_UNKNOWN'];
  if (result.kind !== RESULT_KIND || result.schema_version !== 1) problems.push('RESULT_KIND');
  if (result.candidate_label !== CONTRACT.candidate) problems.push('CANDIDATE_LABEL');
  if (result.run_id !== context.runId) problems.push('RUN_ID');
  if (result.phase !== phase.id) problems.push('PHASE');
  const wanted = context.bindings || {};
  for (const key of ['source_commit', 'package_sha256', 'manifest_sha256', 'kit_sha256']) {
    if (!result.bindings || result.bindings[key] !== wanted[key]) problems.push(`BINDING_${key.toUpperCase()}`);
  }
  if (!HEX40.test(String(wanted.source_commit || '')) || !HEX64.test(String(wanted.package_sha256 || ''))) problems.push('EXPECTED_BINDINGS_INVALID');
  const contractCases = casesForPhase(phase.id);
  const seen = new Set();
  for (const item of result.cases || []) {
    const reference = contractCases.find((c) => c.case_id === item.case_id);
    if (!reference || seen.has(item.case_id)) { problems.push(`CASE_UNEXPECTED:${item.case_id}`); continue; }
    seen.add(item.case_id);
    if (!Array.isArray(item.assertions) || item.assertions.length !== reference.assertions.length) { problems.push(`CASE_ASSERTION_COUNT:${item.case_id}`); continue; }
    reference.assertions.forEach((a, index) => {
      const got = item.assertions[index];
      if (!got || got.assertion_id !== a.assertion_id) problems.push(`ASSERTION_MISMATCH:${a.assertion_id}`);
      else if (item.status === 'PASS' && (got.status !== 'PASS' || typeof got.observed !== 'string' || got.observed.trim() === '')) problems.push(`ASSERTION_NOT_PASS:${a.assertion_id}`);
    });
    if (item.status === 'PASS' && item.assertions.some((a) => a.status !== 'PASS')) problems.push(`CASE_STATUS_INCONSISTENT:${item.case_id}`);
  }
  for (const reference of contractCases) if (!seen.has(reference.case_id)) problems.push(`CASE_MISSING:${reference.case_id}`);
  if (result.status === 'PASS') {
    if ((result.cases || []).some((item) => item.status !== 'PASS')) problems.push('PHASE_STATUS_INCONSISTENT');
    if (result.first_failure) problems.push('PASS_WITH_FIRST_FAILURE');
    const listed = new Map((result.evidence || []).map((item) => [item.file, item]));
    for (const name of evidenceForPhase(phase.id)) {
      const item = listed.get(name);
      if (!item) problems.push(`EVIDENCE_NOT_LISTED:${name}`);
      else if (!HEX64.test(String(item.sha256 || '')) || !Number.isSafeInteger(item.size) || item.size < 0) problems.push(`EVIDENCE_ENTRY_INVALID:${name}`);
    }
    for (const item of result.evidence || []) if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(item.file || '')) || /\.\./.test(String(item.file))) problems.push(`EVIDENCE_NAME_INVALID:${item.file}`);
  } else if (!['FAIL', 'NOT_PERFORMED'].includes(result.status)) problems.push('PHASE_STATUS');
  return problems;
}

// ---- Bounded fixtures --------------------------------------------------------------------------
// Every fixture is finite: a hard upper bound on ticks, bytes and wall time is part of its shape.

const FIXTURE_BOUNDS = Object.freeze({ max_ticks: 30, tick_interval_ms: 400, max_output_bytes: 65536 });

// A bounded background command line for cmd.exe (always present on Win7). ping is the portable
// sub-second-free delay available in every cmd; one tick per second.
function backgroundCommandCmd(ticks) {
  const count = Math.min(Math.max(Number.isInteger(ticks) ? ticks : 10, 1), FIXTURE_BOUNDS.max_ticks);
  return `for /L %i in (1,1,${count}) do @(echo tick %i & echo err %i 1>&2 & ping -n 2 127.0.0.1 >nul)`;
}

// The same fixture for Windows PowerShell. Only syntax available in PowerShell 2.0 is used.
function backgroundCommandPowerShell(ticks) {
  const count = Math.min(Math.max(Number.isInteger(ticks) ? ticks : 10, 1), FIXTURE_BOUNDS.max_ticks);
  return `1..${count} | ForEach-Object { Write-Output ('tick ' + $_); [Console]::Error.WriteLine('err ' + $_); Start-Sleep -Milliseconds ${FIXTURE_BOUNDS.tick_interval_ms} }`;
}

// Text fixtures for S04: the byte sequences are produced here so tests and the driver agree.
function encodingFixtures() {
  const text = '中文 batch2 路径';
  return {
    text,
    utf8: Buffer.from(text, 'utf8'),
    utf16le: Buffer.from(text, 'utf16le'),
    // "中文" in CP936 (GBK): D6 D0 CE C4; the ASCII part is identical in every encoding.
    cp936_zhongwen: Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
    crlf: Buffer.from('line one\r\nline two\r\nlast line without newline', 'utf8'),
  };
}

// Splits a buffer at every given offset to build the cross-chunk cases.
function splitAt(buffer, offsets) {
  const cuts = [0].concat(offsets.filter((n) => n > 0 && n < buffer.length).sort((a, b) => a - b), [buffer.length]);
  const chunks = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) chunks.push(buffer.slice(cuts[i], cuts[i + 1]));
  return chunks;
}

// A fake secret assembled at run time, so no literal that looks like a credential is stored in the
// package payload (the producer's payload scanner would reject it). The value is inert test data.
function testOnlySecret() {
  return `sk-${'TESTONLYBATCH2'}${'0123456789abcdef'}`;
}

function secretSplitAcrossChunks() {
  const secret = testOnlySecret();
  const bytes = Buffer.from(`prefix ${secret} suffix`, 'utf8');
  const middle = 7 + Math.floor(secret.length / 2);
  return { secret, chunks: splitAt(bytes, [middle]) };
}

// ---- Scripted Provider steps ---------------------------------------------------------------------
// The loopback Provider (hosted by the smoke process) answers each request from providerStep(). A prompt carries one
// "b2:<scenario>" token; progress inside a scenario is derived from the tool messages after the last user message, so
// the script is stateless apart from the explicit `state` object (hold engaged, shell kind). Commands are bounded.

const SCENARIO_TOKEN = /b2:[a-z0-9-]+/;

function shellCommand(kind, spec) {
  const powershell = kind === 'powershell';
  switch (spec.name) {
    case 'ticks': return powershell ? backgroundCommandPowerShell(spec.ticks) : backgroundCommandCmd(spec.ticks);
    case 'foreground-ticks': {
      const count = Math.min(Math.max(spec.ticks || 8, 2), FIXTURE_BOUNDS.max_ticks);
      return powershell
        ? `1..${count} | ForEach-Object { Write-Output ('tick ' + $_); Start-Sleep -Milliseconds 500 }`
        : `for /L %i in (1,1,${count}) do @(echo tick %i & ping -n 2 127.0.0.1 >nul)`;
    }
    case 'interleave':
      return powershell
        ? "1..4 | ForEach-Object { Write-Output ('out ' + $_); [Console]::Error.WriteLine('err ' + $_); Start-Sleep -Milliseconds 300 }"
        : 'for /L %i in (1,1,4) do @(echo out %i & echo err %i 1>&2 & ping -n 2 127.0.0.1 >nul)';
    case 'over-limit':
      return powershell
        ? '1..4000 | ForEach-Object { Write-Output (\'line \' + $_ + \' \' + (\'x\' * 100)) }'
        : 'for /L %i in (1,1,4000) do @echo line %i xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    case 'secret-split': {
      const secret = testOnlySecret();
      const middle = Math.floor(secret.length / 2);
      const head = secret.slice(0, middle);
      const tail = secret.slice(middle);
      return powershell
        ? `[Console]::Out.Write('${head}'); Start-Sleep -Milliseconds 400; [Console]::Out.WriteLine('${tail}')`
        : `<nul set /p =${head} & ping -n 2 127.0.0.1 >nul & echo ${tail}`;
    }
    case 'fail-fast': return powershell ? 'exit 9' : 'cmd /c exit 9';
    case 'long-running':
      return powershell
        ? 'while ($true) { Write-Output (\'alive \' + (Get-Date).Ticks); Start-Sleep -Milliseconds 300 }'
        : 'for /L %i in (1,1,600) do @(echo alive %i & ping -n 2 127.0.0.1 >nul)';
    default: throw new Error(`A9_BATCH2_SHELL_COMMAND_UNKNOWN:${spec.name}`);
  }
}

// S04 needs exact bytes split inside multibyte sequences; only Windows PowerShell can write raw bytes to stdout.
function encodingCommandPowerShell(label) {
  const fx = encodingFixtures();
  const table = { utf8: fx.utf8, utf16le: fx.utf16le, cp936: fx.cp936_zhongwen, crlf: fx.crlf };
  const bytes = table[label];
  if (!bytes) throw new Error(`A9_BATCH2_ENCODING_LABEL_UNKNOWN:${label}`);
  const first = Math.max(1, Math.floor(bytes.length / 2) - (label === 'crlf' ? 0 : 1));
  const list = (buffer) => `@(${Array.from(buffer).join(',')})`;
  return `$o=[Console]::OpenStandardOutput(); $a=[byte[]]${list(bytes.slice(0, first))}; $b=[byte[]]${list(bytes.slice(first))}; `
    + '$o.Write($a,0,$a.Length); $o.Flush(); Start-Sleep -Milliseconds 400; $o.Write($b,0,$b.Length); $o.Flush()';
}

function lastUserPrompt(parsed) {
  const messages = parsed.messages || [];
  const index = messages.map((item) => item.role).lastIndexOf('user');
  return { index, prompt: index >= 0 ? String(messages[index].content || '') : '', after: index >= 0 ? messages.slice(index + 1) : [] };
}
function extractNextCursor(message) {
  const text = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content || '');
  const found = /nextCursor["']?\s*[:=]\s*\\?["']([a-f0-9]{32}\.[0-9]+\.[0-9]+)/.exec(text);
  return found ? found[1] : 'cursor-missing';
}
function extractHandleId(message) {
  const text = typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content || '');
  const found = /(?:handleId|backgroundHandle)["']?\s*[:=]\s*["']?([A-Za-z0-9_.:-]+)/.exec(text);
  return found ? found[1] : '';
}
// Some gateways omit the tool name on result messages; then the order of the result messages identifies the call.
function toolResultsNamed(after, name) {
  const results = after.filter((item) => item.role === 'tool');
  const named = results.filter((item) => item.name === name);
  return named.length > 0 || results.some((item) => typeof item.name === 'string' && item.name) ? named : results;
}

// state: { shellKind, afterHold, holdEngaged }; returns { tool: {name,args}, id, note } | { content } | { hold: true }
function providerStep(parsed, state) {
  const ctx = state || {};
  const kind = ctx.shellKind === 'powershell' ? 'powershell' : 'cmd';
  const { prompt, after } = lastUserPrompt(parsed);
  const token = (SCENARIO_TOKEN.exec(prompt) || [''])[0];
  const tools = after.filter((item) => item.role === 'tool');
  const done = tools.length;
  const call = (id, name, args, note) => ({ id, note: note || `步骤 ${done + 1}`, tool: { name, args } });
  if (ctx.afterHold) {
    // Restart/continue run: look at current facts first, then finish. Old tool calls are never replayed.
    return done === 0 ? call('b2-recover-read', 'read', { path: 'b2-hold.txt' }, '先核对当前文件事实。') : { content: 'continued from recovered facts.' };
  }
  switch (token) {
    case 'b2:bg-start':
      // The longest bounded run: the journeys read the tree, take screenshots and click Stop (or the exit dialog) while it is still alive.
      // Rehearsal 2 used 14 ticks (about 6 s on Win7), which leaves too little margin for those steps.
      return done === 0 ? call('b2-bg-1', 'start_process', { command: shellCommand(kind, { name: 'ticks', ticks: FIXTURE_BOUNDS.max_ticks }) }) : { content: 'background process started.' };
    case 'b2:bg-long':
      // Outlives the guard journey of p06; it ends only by Stop, and the journey stops it in its own cleanup.
      return done === 0 ? call('b2-bgl-1', 'start_process', { command: shellCommand(kind, { name: 'long-running' }) }) : { content: 'long background process started.' };
    case 'b2:bg-three':
      return done < 4 ? call(`b2-bg3-${done}`, 'start_process', { command: shellCommand(kind, { name: 'ticks', ticks: 20 + done }) }) : { content: 'three plus one start attempted.' };
    case 'b2:bg-cursor': {
      const started = toolResultsNamed(after, 'start_process')[0];
      const handle = started ? extractHandleId(started) : '';
      if (done === 0) return call('b2-cur-1', 'start_process', { command: shellCommand(kind, { name: 'ticks', ticks: 20 }) });
      if (done === 1) return call('b2-cur-2', 'read_process_output', { handleId: 'not-owned-handle' });
      if (done === 2) return call('b2-cur-3', 'read_process_output', { handleId: handle, cursor: 'cursor-out-of-range' });
      if (done === 3) return call('b2-cur-4', 'read_process_output', { handleId: handle, maxBytes: 16 });
      if (done === 4) return call('b2-cur-5', 'read_process_output', { handleId: handle, cursor: extractNextCursor(tools[tools.length - 1]), maxBytes: 16 });
      return { content: 'cursor checks done.' };
    }
    case 'b2:bg-stop-twice': {
      const started = toolResultsNamed(after, 'start_process')[0];
      const handle = started ? extractHandleId(started) : '';
      if (done === 0) return call('b2-st-1', 'start_process', { command: shellCommand(kind, { name: 'ticks', ticks: 25 }) });
      if (done === 1) return call('b2-st-2', 'stop_process', { handleId: handle });
      if (done === 2) return call('b2-st-3', 'stop_process', { handleId: handle });
      return { content: 'double stop attempted.' };
    }
    case 'b2:bg-ready-fail':
      return done === 0 ? call('b2-rf-1', 'start_process', { command: shellCommand(kind, { name: 'fail-fast' }) }) : { content: 'ready failure observed.' };
    case 'b2:hold':
      // The approved interruption point: a permanent delete waits for the user's approval, which the Provider never answers.
      if (done === 0) return call('b2-hold-1', 'write', { path: 'b2-hold.txt', content: 'b2 hold marker\n' }, '先写入可恢复点文件。');
      if (done === 1) return call('b2-hold-2', 'delete', { path: 'b2-hold.txt', permanent: true }, '请求永久删除，等待用户审批。');
      return { hold: true };
    case 'b2:unknown-shell':
      return done === 0 ? call('b2-unk-1', 'shell', { command: shellCommand(kind, { name: 'long-running' }) }, '启动长时间 Shell。') : { content: 'unknown-shell scenario finished.' };
    case 'b2:s01':
      return done === 0 ? call('b2-s01', 'shell', { command: shellCommand(kind, { name: 'foreground-ticks', ticks: 8 }) }) : { content: 'tick command finished.' };
    case 'b2:s02':
      return done === 0 ? call('b2-s02', 'shell', { command: shellCommand(kind, { name: 'interleave' }) }) : { content: 'interleave command finished.' };
    case 'b2:s04-utf8': case 'b2:s04-utf16le': case 'b2:s04-cp936': case 'b2:s04-crlf':
      return done === 0 ? call('b2-s04', 'shell', { command: encodingCommandPowerShell(token.slice('b2:s04-'.length)) }) : { content: 'encoding command finished.' };
    case 'b2:s05-limit':
      return done === 0 ? call('b2-s05-l', 'shell', { command: shellCommand(kind, { name: 'over-limit' }) }) : { content: 'limit command finished.' };
    case 'b2:s05-secret':
      return done === 0 ? call('b2-s05-s', 'shell', { command: shellCommand(kind, { name: 'secret-split' }) }) : { content: 'secret command finished.' };
    case 'b2:s05-cancel':
      return done === 0 ? call('b2-s05-c', 'shell', { command: shellCommand(kind, { name: 'long-running' }) }) : { content: 'cancel command observed.' };
    case 'b2:audit-write':
      return done === 0 ? call('b2-aw-1', 'write', { path: 'b2-audit.txt', content: 'b2 audit write\n' }) : { content: 'audit write scenario finished.' };
    case 'b2:audit-three':
      return done < 3 ? call(`b2-audit-${done}`, 'read', { path: 'b2-hold.txt' }) : { content: 'audit scenario finished.' };
    default:
      return { content: 'no scenario token; nothing executed.' };
  }
}

// Evidence-file names the driver may write for a phase (closed set).
function evidenceForPhase(phaseId) {
  const names = [];
  for (const item of CASES) if (item.phase === phaseId) for (const name of item.evidence) if (!names.includes(name)) names.push(name);
  return names;
}

module.exports = {
  CONTRACT, LIMITS, GATES, PHASES, CHAIN_STEPS, CASES, KNOWN_LIMITS, FIXTURE_BOUNDS,
  evidenceSet, evidenceForPhase, phaseById, selfCheck,
  backgroundCommandCmd, backgroundCommandPowerShell, encodingFixtures, splitAt,
  testOnlySecret, secretSplitAcrossChunks,
  RESULT_KIND, casesForPhase, newPhaseResult, setAssertion, finalizePhaseResult, phaseResultProblems,
  shellCommand, encodingCommandPowerShell, providerStep, lastUserPrompt, extractHandleId, extractNextCursor,
};

if (require.main === module) {
  const result = selfCheck();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
