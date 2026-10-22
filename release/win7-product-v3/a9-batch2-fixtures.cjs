// A9-39 batch2 validation contract identity (WIN7-51 tentative, ADR-0250/0251; ADR-0155 Proposed).
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
  task: 'A9-39',
  decision: 'ADR-0250, ADR-0251 (ADR-0155 remains Proposed)',
  lock_id: 'A9-BATCH2-INPUTS-D013-V26-MANAGED',
  release_id: 'WIN7-CODING-AGENT-A9-ALPHA2',
  version: '0.3.0-alpha.2',
  // WIN7-51 is tentative. Before freeze the number is checked against refs, registrations and
  // directories; a renumber changes this file, the profile, the lock and the kit together.
  candidate: 'WIN7-51',
  candidate_tentative: true,
  result_on_complete: 'A9_39_WIN7_51_BATCH2_EXECUTION_CAPABILITY_PASS',
  result_ceiling: 'Batch-2 execution capability only; never the full Alpha 2 or an RC verdict.',
});

// A9-39 retains the ten phases/16 requests and increases the wall ceiling for fixed new samples. These are caps, not a granted budget:
// every prepare, repeat and failed call counts against max_requests.
const LIMITS = Object.freeze({
  max_requests: 16,
  max_wall_seconds: 21600,
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
    summary: 'SAFE-02 plus A37-01..04 and A38-01..08; isolated secrets, projections and restart journeys' },
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

// Fixed A9-39 inputs. Only sample IDs cross the loopback control boundary; never command text.
const SECRET_ENCODINGS = Object.freeze(['utf8', 'utf16le', 'gbk']);
const SECRET_FORMS = Object.freeze(['plain', 'base64', 'base64-unpadded', 'base64url', 'base64url-unpadded', 'percent', 'path']);
const BASIC_FORMS = Object.freeze(['pair', 'base64', 'base64-unpadded', 'base64url', 'base64url-unpadded', 'percent', 'header']);
const AUTH_SCHEMES = Object.freeze(['Basic', 'NTLM', 'Negotiate', '1Custom', '!Custom', '_Custom']);
const cartesian = (...sets) => sets.reduce((rows, set) => rows.flatMap((row) => set.map((value) => row.concat(value))), [[]]);
function fixedSamples(rows) { return rows.map((row, index) => ({ id: `s${String(index + 1).padStart(3, '0')}`, ...row })); }
const SECRET_SAMPLES = Object.freeze({
  'B2-A37-01': fixedSamples(cartesian(['header', 'source', 'url'], SECRET_ENCODINGS).map(([example, encoding]) => ({ example, encoding }))),
  'B2-A37-02': fixedSamples(cartesian(['api', 'proxy-password', 'custom-header', 'previous-api'], SECRET_FORMS, SECRET_ENCODINGS).map(([source, form, encoding]) => ({ source, form, encoding }))),
  'B2-A37-03': fixedSamples(['current', 'restart'].map((stage) => ({ stage }))),
  'B2-A37-04': fixedSamples([{ example: 'header', encoding: 'utf8', expected: 'secret_blocked' }, { example: 'url', encoding: 'utf8', expected: 'secret_blocked' },
    { example: 'header', encoding: 'utf16le', expected: 'decode_error' }, { example: 'header', encoding: 'gbk', expected: 'decode_error' }]),
  'B2-A38-01': fixedSamples(cartesian(['utf8', 'latin1'], BASIC_FORMS, SECRET_ENCODINGS).map(([material, form, encoding]) => ({ material, form, encoding }))),
  'B2-A38-02': fixedSamples([{ change: 'clear', pair: 'old' }, { change: 'username', pair: 'old' }, { change: 'username', pair: 'new' },
    { change: 'password', pair: 'old' }, { change: 'password', pair: 'new' }]),
  'B2-A38-03': fixedSamples(cartesian(['utf8', 'latin1'], ['base64', 'base64-unpadded', 'base64url'], ['new', 'revalidate']).map(([material, form, stage]) => ({ material, form, stage }))),
  'B2-A38-04': fixedSamples(cartesian(AUTH_SCHEMES, ['Authorization', 'pRoXy-aUtHoRiZaTiOn'], [':', '='], [' ', '\t']).map(([scheme, field, separator, gap]) => ({ scheme, field, separator, gap }))),
  'B2-A38-05': fixedSamples(cartesian(['model', 'shell'], ['utf8', 'latin1'], ['base64', 'base64-unpadded', 'base64url', 'base64url-unpadded', 'percent']).map(([surface, material, form]) => ({ surface, material, form }))),
  'B2-A38-06': fixedSamples([{ example: 'unregistered' }, { example: 'documentation' }, { example: 'unregistered-base64' }]),
  'B2-A38-07': fixedSamples([{ stage: 'saved' }, { stage: 'restart' }]),
  'B2-A38-08': fixedSamples(AUTH_SCHEMES.flatMap((scheme) => [' ', '\t'].map((gap) => ({ scheme, gap, boundary: 'token' }))).concat(
    AUTH_SCHEMES.map((scheme) => ({ scheme, gap: '', boundary: 'newline' })), [{ boundary: 'bearer' }, { boundary: 'url' }])),
});
const SECRET_CASE_IDS = Object.freeze(Object.keys(SECRET_SAMPLES));
const SECRET_BUDGET = Object.freeze({ provider_requests: 4096, provider_body_bytes: 4194304, stream_gap_ms: 5000 });
function secretCredentials(suffix = '') {
  return { username: `a9fixture${suffix}`, password: ['A9', '39-préxy-~~~???xyz'].join('-'), api: ['A9', '39-known-~~~???x'].join('-'),
    header: ['A9', '39-header-~~~???x'].join('-'), oldApi: ['A9', '39-old-~~~???x'].join('-') };
}
function secretForm(value, form, material = 'utf8') {
  const b64 = Buffer.from(value, material).toString('base64');
  switch (form) {
    case 'plain': case 'pair': return value;
    case 'base64': return b64;
    case 'base64-unpadded': return b64.replace(/=+$/, '');
    case 'base64url': return b64.replace(/\+/g, '-').replace(/\//g, '_');
    case 'base64url-unpadded': return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    case 'percent': case 'path': return encodeURIComponent(value);
    case 'header': return ['Proxy-Authorization:', ' Basic ', b64].join('');
    default: throw new Error('A9_39_SECRET_FORM');
  }
}
function secretExample(example) {
  return { header: ['Authorization:', ' Bearer YOUR_API_KEY'].join(''), source: 'const headers = { authorization: token };',
    url: ['https://demo', ':demo@example.invalid/api'].join(''), unregistered: secretForm('other:other-pass', 'header'),
    'unregistered-base64': secretForm('other:other-pass', 'base64'), documentation: ['Authorization:', ' Basic dXNlcjpwYXNz'].join('') }[example];
}
function secretInputBytes(text, encoding) {
  // GBK's fixed Chinese prefix forces the actual GBK decoder; the test credential is ASCII/Latin-1 base64.
  if (encoding === 'gbk') return Buffer.concat([Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0a]), ...text.split('é').flatMap((part, index) => index ? [Buffer.from([0xa8, 0xa6]), Buffer.from(part, 'ascii')] : [Buffer.from(part, 'ascii')])]);
  if (encoding === 'utf16le') return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  return Buffer.from(text, 'utf8');
}
const SECRET_DESCRIPTIONS = {
  'B2-A37-01': ['All nine example/encoding samples execute a real Shell, show a bound Diff and restore B2 exactly to B0 after B1 changed.', 'Checkpoint ownership, byte hashes and recovery copies are recorded for every sample; projections remain conservative.'],
  'B2-A37-02': ['All registered current/previous key, password and header forms refuse with A9_CHECKPOINT_SECRET_BLOCKED and zero Runner dispatch.', 'Every sample keeps its external marker unchanged and records tool_start counts and a clean recovery/projection scan with positive controls.'],
  'B2-A37-03': ['The current cache refuses a newly registered recovery secret without writing it back or reporting full undo.', 'A new product PID revalidates the persisted checkpoint and refuses the same unsafe restoration.'],
  'B2-A37-04': ['Both loadable UTF-8 instruction samples are secret_blocked; the Provider receives none of the instruction body.', 'UTF-16LE BOM and non-UTF-8 GBK instruction samples are decode_error; neither body reaches the Provider.'],
  'B2-A38-01': ['All registered proxy pair/Basic variants and UTF-8/Latin-1 material in three file encodings block checkpoint and dispatch zero Shell.', 'Per-sample input hashes, unchanged markers, tool counts and recovery/result/event scans bind the refusal.'],
  'B2-A38-02': ['Clearing, renaming and changing proxy password in one process retain all tested old pairs and block the new registered pairs.', 'Each configuration transition is recorded with zero Runner dispatch, unchanged marker and clean output/recovery scans.'],
  'B2-A38-03': ['New sensitive Shell overlays are rejected; overlays saved before registration are revalidated.', 'Automatic Shell selection and actual Runner inputs contain no rejected overlay; the new-setting refusals dispatch zero Runner.'],
  'B2-A38-04': ['Every fixed scheme/header/separator sample replaces the entire token in prompt, title, command and final message projections.', 'Snapshot, events and SQLite contain the exact expected redacted strings and no token.'],
  'B2-A38-05': ['Model samples inspect real liveModelPreview before chunk two, then final/events/SQLite/restart projections without a leaked prefix.', 'Shell samples inspect split output live, final/events/SQLite/restart without any registered composite or prefix.'],
  'B2-A38-06': ['All three unregistered file samples execute Shell and restore exactly B0 after the changed B1.', 'Recovery bytes remain exact while output projections remain conservatively redacted.'],
  'B2-A38-07': ['The current synthetic proxy is saved with real safeStorage/DPAPI and exits before the restart.', 'The same ordinary SID in a new PID loads the current encrypted configuration and blocks the bare pair with zero Runner dispatch.'],
  'B2-A38-08': ['Each single-token scheme handles spaces/tabs and preserves the ordinary next line exactly, including a bare scheme before newline.', 'Bearer and URL userinfo regressions redact credentials; exact snapshots/events/SQLite projections agree.'],
};

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
    'Tick, stdout and stderr are persisted in SQLite and present in the IPC snapshot while the process runs, never ahead of SQLite; page display after the Turn end is recorded, not asserted (KL-3)',
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
    'UTF-8 text split across chunks decodes losslessly under Windows PowerShell; CRLF and a final line without newline are preserved (CP936 and UTF-16LE are informational only, KL-5)',
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
  makeCase('B2-BG-03-STOP-RELEASE-EXIT', 'G2', 'p05-session-bg', 'BG', 'Double Stop, fast exit, failed start and release.', [
    'A second Stop is idempotent; a command that exits at once ends with a terminal fact and leaves no process; a start that fails on an unusable working directory leaves no process (the path taken is recorded; the helper readiness failure itself is KL-12)',
    'Release: choosing "leave to system" in the exit dialog records release_intent and then released for the owned handle with one release id, the product exits with code 0 and leaves no product, driver or helper process, the process of the released handle (PID and creation stamp recorded before the exit) is still alive after the exit, and the suite then removes it and its descendants by identity and observes them absent',
  ], ['bg03-stop-release.json', 'release-exit-before.json', 'release-dialog-response.json', 'release-ownership-events.json', 'release-held-exit.json']),
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
  ...SECRET_CASE_IDS.map((id) => makeCase(id, 'G2', 'p07-safe', id.slice(3), 'A9-37/38 fixed direct current-candidate journey.', SECRET_DESCRIPTIONS[id], [id.slice(3).toLowerCase() + '.json'])),
]);

// Known limits that travel with the verdict (A9-33 section 5). They do not enter the pass criteria.
const KNOWN_LIMITS = Object.freeze([
  'A9-34 recovered-cleanup disposition is deferred; a recovered cleanup_required has no in-product disposition',
  'Native exit cancellation (Esc) is not measured',
  'CONT-02 crash points inside the persistence transaction and around Provider or tool dispatch cannot be hit from outside the product; they stay covered by the A9-32 developer-machine tests only',
  'SAFE-01 incompressible over-budget request is not constructible because the Renderer exposes no context budget setting; it stays covered by the A9-32 developer-machine tests only',
  'KL-5: under Windows PowerShell the product decodes Shell output as strict UTF-8, so CP936 and UTF-16LE output ends in A9_OUTPUT_ENCODING_ERROR; B2-S04 decides on UTF-8 and CRLF only and reports the other two as INFORMATIONAL; their decoder evidence is the A9-30 module level only',
  'Real Provider and enterprise environment are not covered; loopback fixtures only',
  'POSIX executability and PowerShell /Command real execution are not measured',
  'Layouts below 800 px are PRODUCT_UNREACHABLE / NOT_VERIFIED',
  'A9-38 limits: unregistered usernames, Digest trailing parameters, historical projections, quoted/JSON Authorization and code points above U+00FF remain outside the guarantee; GBK direct evidence is NOT_PERFORMED until the new candidate runs',
  'No INHERITED_EVIDENCE is approved while ADR-0155 is Proposed',
  'KL-12: the helper readiness failure of a managed start (D-013) cannot be induced from outside the product; B2-BG-03 records the path that a start with an unusable working directory takes (refused before the helper, or a helper start failure) and judges that no process is left; the readiness failure itself stays covered by the developer-machine tests in trusted-shell-runner-contract.test.ts only',
  'KL-13: after a managed background process naturally exits, the page still shows Stop and disables New Conversation until the next submit, stop or switch refreshes it; the backend gate remains correct, with no authorization or data risk; the product fix is deferred to RC (ADR-0260)',
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
  problems.push(...encodingCutProblems());
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

const FIXTURE_BOUNDS = Object.freeze({ max_ticks: 30, tick_interval_ms: 400, max_output_bytes: 65536, release_hold_seconds: 300 });

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

// Where the first write ends. Each cut falls inside the unit that the label is about, so the product has to join two chunks to read it
// (rehearsal 6 review: the earlier cut at half the length fell on ASCII bytes for utf8 and between two lines for crlf).
//   utf8:    after the first byte of the three-byte character 文 (bytes 3 to 5), so its lead byte and two tail bytes are in two chunks
//   utf16le: after the first byte of the two-byte unit of 文 (bytes 2 and 3)
//   cp936:   after the first byte of the two-byte character 中 (D6 D0)
//   crlf:    between CR and LF of the first line end
const ENCODING_CUTS = { utf8: 4, utf16le: 3, cp936: 1, crlf: 9 };

function encodingCutProblems(cuts = ENCODING_CUTS) {
  const fx = encodingFixtures();
  const bytes = { utf8: fx.utf8, utf16le: fx.utf16le, cp936: fx.cp936_zhongwen, crlf: fx.crlf };
  const problems = [];
  for (const [label, cut] of Object.entries(cuts)) {
    const buffer = bytes[label];
    if (!buffer || !(cut > 0 && cut < buffer.length)) { problems.push(`ENCODING_CUT_RANGE:${label}`); continue; }
    const inside = {
      utf8: () => buffer[cut] >= 0x80 && buffer[cut] <= 0xbf && buffer[cut - 1] >= 0xc0,
      utf16le: () => cut % 2 === 1 && buffer[cut - 1] !== 0 && buffer[cut] !== 0,
      cp936: () => buffer[cut - 1] >= 0x81 && buffer[cut - 1] <= 0xfe && cut % 2 === 1,
      crlf: () => buffer[cut - 1] === 0x0d && buffer[cut] === 0x0a,
    }[label];
    if (!inside()) problems.push(`ENCODING_CUT_NOT_INSIDE_UNIT:${label}:${cut}`);
  }
  return problems;
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

// Pieces of at most SECRET_PIECE_MAX characters; a leak check looks for the whole secret or its first 10 characters.
const SECRET_PIECE_MAX = 4;
function splitPieces(text) {
  const pieces = [];
  for (let i = 0; i < text.length; i += SECRET_PIECE_MAX) pieces.push(text.slice(i, i + SECRET_PIECE_MAX));
  return pieces;
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
const AUDIT_READ_FILES = ['b2-audit-read-0.txt', 'b2-audit-read-1.txt', 'b2-audit-read-2.txt'];

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
      // The command text goes into events, the page and snapshots, so it must not contain the secret or its first characters: the secret
      // is cut into short pieces that the shell joins at run time (rehearsal 6, p04 S05-A01: a 16-character literal made every leak check hit).
      const secret = testOnlySecret();
      const middle = Math.floor(secret.length / 2);
      const head = secret.slice(0, middle);
      const tail = secret.slice(middle);
      const joined = (text) => `(${splitPieces(text).map((piece) => `'${piece}'`).join('+')})`;
      const caretted = (text) => splitPieces(text).join('^');
      return powershell
        ? `[Console]::Out.Write(${joined(head)}); Start-Sleep -Milliseconds 400; [Console]::Out.WriteLine(${joined(tail)})`
        : `<nul set /p =${caretted(head)} & ping -n 2 127.0.0.1 >nul & echo ${caretted(tail)}`;
    }
    case 'fail-fast': return powershell ? 'exit 9' : 'cmd /c exit 9';
    case 'released-hold':
      // The one process the product is asked to leave to the system. It ends by itself after release_hold_seconds, so a failed cleanup cannot leave it for good;
      // the suite still removes it by identity right after the exit (B2-BG-03 A02).
      return powershell
        ? `1..${FIXTURE_BOUNDS.release_hold_seconds} | ForEach-Object { Write-Output ('held ' + $_); Start-Sleep -Milliseconds 1000 }`
        : `for /L %i in (1,1,${FIXTURE_BOUNDS.release_hold_seconds}) do @(echo held %i & ping -n 2 127.0.0.1 >nul)`;
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
  const first = ENCODING_CUTS[label];
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
// Fixed provider behavior for A9-39. Control only selects a registered sample; no scripts/commands are accepted.
function phase2Sample(caseId, id) {
  return (SECRET_SAMPLES[caseId] || []).find((s) => s.id === id) || null;
}
function phase2Token(sample) { return `A939CRED${sample.id.toUpperCase()}TOKEN`; }
function phase2AuthInput(sample) {
  const token = phase2Token(sample);
  if (sample.boundary === 'url') return { input: `https://user:${token}@example.invalid/api\nNEXT-LINE-KEPT`, expected: 'https://***redacted***@example.invalid/api\nNEXT-LINE-KEPT', token };
  if (sample.boundary === 'bearer') return { input: `Authorization: Bearer ${token}\nNEXT-LINE-KEPT`, expected: 'Authorization: ***redacted***\nNEXT-LINE-KEPT', token };
  const field = sample.field || 'Authorization'; const separator = sample.separator || ':'; const scheme = sample.scheme || 'Basic';
  const line = sample.boundary === 'newline' ? `${field}${separator} ${scheme}\nNEXT-LINE-KEPT` : `${field}${separator} ${scheme}${sample.gap}${token}\nNEXT-LINE-KEPT`;
  return { input: line, expected: `${field}${separator} ***redacted***\nNEXT-LINE-KEPT`, token };
}
function phase2SecretValue(sample, suffix = '') {
  const c = secretCredentials(suffix);
  return secretForm(`${c.username}:${c.password}`, sample.form || 'base64', sample.material || 'utf8');
}
function phase2ProviderStep(parsed, state) {
  const caseId = state.phase2Case; const sample = phase2Sample(caseId, state.phase2Sample);
  if (!sample) throw new Error('A9_39_PROVIDER_SAMPLE_UNKNOWN');
  const done = lastUserPrompt(parsed).after.filter((m) => m.role === 'tool').length;
  const call = (command) => ({ id: `a939-${caseId.slice(3)}-${sample.id}`, tool: { name: 'shell', args: { command } }, note: '固定验收样本。' });
  const kind = state.shellKind;
  const changed = kind === 'powershell' ? "[IO.File]::WriteAllText((Join-Path (Get-Location) 'sample.txt'),'changed',[Text.Encoding]::UTF8)" : '>sample.txt echo changed';
  if (caseId === 'B2-A38-06') return done === 0 ? call(changed)
    : { content: sample.example === 'unregistered-base64' ? `Authorization: Basic ${secretExample(sample.example)}` : secretExample(sample.example) };
  if (['B2-A37-01', 'B2-A37-03'].includes(caseId)) return done === 0 ? call(changed) : { content: 'example changed.' };
  if (['B2-A37-02', 'B2-A38-01', 'B2-A38-02', 'B2-A38-03', 'B2-A38-07'].includes(caseId)) {
    return done === 0 ? call(kind === 'powershell' ? "[IO.File]::WriteAllText((Join-Path (Get-Location) 'dispatch-marker.txt'),'DISPATCHED')" : '>dispatch-marker.txt echo DISPATCHED') : { content: 'refusal sample ended.' };
  }
  if (caseId === 'B2-A37-04') return { content: 'instruction gate observed.' };
  if (caseId === 'B2-A38-04' || caseId === 'B2-A38-08') {
    const auth = phase2AuthInput(sample);
    if (done === 0) {
      // The command is projected before and after actual execution. It contains the same synthetic unregistered header.
      const lines = auth.input.split('\n');
      return call(kind === 'powershell' ? `Write-Output 'A939-COMMAND'; # ${lines[0]}\n# ${lines[1]}` : `echo A939-COMMAND & rem ${lines[0]}\nrem ${lines[1]}`);
    }
    return { content: auth.input };
  }
  if (caseId === 'B2-A38-05') {
    const value = phase2SecretValue(sample); const cut = Math.floor(value.length / 2); const head = value.slice(0, cut); const tail = value.slice(cut);
    if (sample.surface === 'model') return { phase2Stream: { head: 'x'.repeat(512) + head, tail: tail + ' END', id: sample.id } };
    const ps = (text) => `(${splitPieces(text).map((s) => `'${s}'`).join('+')})`;
    const cmd = (text) => splitPieces(text).join('^');
    return done === 0 ? call(kind === 'powershell'
      ? `[Console]::Out.Write(${ps('x'.repeat(32) + head)}); Start-Sleep -Milliseconds ${SECRET_BUDGET.stream_gap_ms}; [Console]::Out.WriteLine(${ps(tail + ' END')})`
      : `<nul set /p =${cmd('x'.repeat(32) + head)} & ping -n 6 127.0.0.1 >nul & echo ${cmd(tail + ' END')}`) : { content: 'Shell stream observed.' };
  }
  throw new Error('A9_39_PROVIDER_CASE_UNKNOWN');
}

function providerStep(parsed, state) {
  const ctx = state || {};
  if (ctx.phase2Case) return phase2ProviderStep(parsed, ctx);
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
    case 'b2:bg-release':
      return done === 0 ? call('b2-rel-1', 'start_process', { command: shellCommand(kind, { name: 'released-hold' }) }) : { content: 'release candidate started.' };
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
    case 'b2:bg-fast-exit':
      // A command that exits at once is a successful start followed by a natural exit; it is not a readiness failure (WIN7-43 formal review, P1).
      return done === 0 ? call('b2-fe-1', 'start_process', { command: shellCommand(kind, { name: 'fail-fast' }) }) : { content: 'fast exit observed.' };
    case 'b2:bg-badcwd':
      // A start that fails on its working directory. Whether the product refuses it before the helper or the helper fails to start is recorded, not assumed (KL-12).
      return done === 0 ? call('b2-bc-1', 'start_process', { command: shellCommand(kind, { name: 'ticks', ticks: 2 }), cwd: 'b2-no-such-directory' }) : { content: 'start failure observed.' };
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
      // One call id per prompt: four prompts of one conversation that share an id cannot be told apart in the stored frames (rehearsal 6, p04 S04).
      return done === 0 ? call(`b2-s04-${token.slice('b2:s04-'.length)}`, 'shell', { command: encodingCommandPowerShell(token.slice('b2:s04-'.length)) }) : { content: 'encoding command finished.' };
    case 'b2:s05-limit':
      return done === 0 ? call('b2-s05-l', 'shell', { command: shellCommand(kind, { name: 'over-limit' }) }) : { content: 'limit command finished.' };
    case 'b2:s05-secret':
      return done === 0 ? call('b2-s05-s', 'shell', { command: shellCommand(kind, { name: 'secret-split' }) }) : { content: 'secret command finished.' };
    case 'b2:s05-cancel':
      return done === 0 ? call('b2-s05-c', 'shell', { command: shellCommand(kind, { name: 'long-running' }) }) : { content: 'cancel command observed.' };
    case 'b2:audit-write':
      return done === 0 ? call('b2-aw-1', 'write', { path: 'b2-audit.txt', content: 'b2 audit write\n' }) : { content: 'audit write scenario finished.' };
    case 'b2:audit-three':
      // Three reads with identical arguments end the Turn as stuck (loop detector), so every read names its own file.
      return done < AUDIT_READ_FILES.length ? call(`b2-audit-${done}`, 'read', { path: AUDIT_READ_FILES[done] }) : { content: 'audit scenario finished.' };
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
  phase2Sample, phase2AuthInput, phase2Token, phase2SecretValue, phase2ProviderStep,
  SECRET_ENCODINGS, SECRET_FORMS, BASIC_FORMS, AUTH_SCHEMES, SECRET_SAMPLES, SECRET_CASE_IDS, SECRET_BUDGET, secretCredentials, secretForm, secretExample, secretInputBytes,
  evidenceSet, evidenceForPhase, phaseById, selfCheck,
  backgroundCommandCmd, backgroundCommandPowerShell, encodingFixtures, ENCODING_CUTS, encodingCutProblems, splitAt,
  testOnlySecret, secretSplitAcrossChunks, AUDIT_READ_FILES,
  RESULT_KIND, casesForPhase, newPhaseResult, setAssertion, finalizePhaseResult, phaseResultProblems,
  shellCommand, encodingCommandPowerShell, providerStep, lastUserPrompt, extractHandleId, extractNextCursor,
};

if (require.main === module) {
  const result = selfCheck();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
