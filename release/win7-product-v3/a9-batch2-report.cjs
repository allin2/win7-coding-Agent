// A9-33 batch2 report verifier (WIN7-43 tentative, ADR-0155 Proposed).
//
// Re-derives the verdict of a finished or partial run from the raw files: the independently pinned release authority,
// the append-only request ledger, one phase-result.json per attempt (hashed into the ledger) and every evidence file
// those results list. A stored PASS is never trusted on its own: every contract case and assertion must carry an
// observation, every evidence hash must match the bytes on disk, failed attempts must stay on disk and the request,
// wall-time and prerequisite rules must hold. Negative controls (wrong pin, missing evidence, edited result, wrong
// candidate, replayed request) must each be rejected with the expected problem class or the verifier itself fails.
// Runs under the packaged electron.exe in ELECTRON_RUN_AS_NODE=1 mode as an ordinary user; no network, no child process.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fixtures = require('./a9-batch2-fixtures.cjs');
const requests = require('./a9-batch2-desktop-request.cjs');

const CONTRACT = fixtures.CONTRACT;
const AUTHORITY_KIND = `${CONTRACT.candidate.replace('-', '_')}_RELEASE_AUTHORITY`;
const AUTHORITY_STATUS = `APPROVED_FOR_${CONTRACT.candidate.replace('-', '_')}_VALIDATION`;
const HEX64 = /^[a-f0-9]{64}$/;

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

// io abstracts the evidence files so negative controls can overlay edits without touching the disk.
function diskIo() {
  return {
    exists: (file) => fs.existsSync(file),
    readFile: (file) => fs.readFileSync(file),
  };
}
function overlayIo(base, overlay) {
  return {
    exists: (file) => (overlay.hide && overlay.hide.has(file) ? false : base.exists(file)),
    readFile: (file) => {
      if (overlay.hide && overlay.hide.has(file)) throw new Error('ENOENT');
      if (overlay.replace && overlay.replace.has(file)) return overlay.replace.get(file);
      return base.readFile(file);
    },
  };
}

function problem(list, code) { if (!list.includes(code)) list.push(code); }

function readJsonVia(io, file) {
  try { return JSON.parse(io.readFile(file).toString('utf8')); } catch (_error) { return null; }
}

// options: { runRoot, authorityPath, authoritySha256, through, candidateLabel }
function verifyRun(io, options) {
  const problems = [];
  const runRoot = options.runRoot;
  const through = options.through ? fixtures.phaseById(options.through) : null;
  if (options.through && !through) { problem(problems, 'THROUGH_PHASE_UNKNOWN'); return { ok: false, problems, phases: [], totals: null }; }
  if ((options.candidateLabel || CONTRACT.candidate) !== CONTRACT.candidate) problem(problems, 'CANDIDATE_LABEL_MISMATCH');

  // 1. Independently pinned release authority.
  let authority = null;
  if (!io.exists(options.authorityPath)) problem(problems, 'AUTHORITY_MISSING');
  else {
    const bytes = io.readFile(options.authorityPath);
    if (!HEX64.test(String(options.authoritySha256 || '')) || sha256(bytes) !== options.authoritySha256) problem(problems, 'AUTHORITY_PIN_MISMATCH');
    try { authority = JSON.parse(bytes.toString('utf8')); } catch (_error) { problem(problems, 'AUTHORITY_JSON_INVALID'); }
  }
  if (authority) {
    if (authority.kind !== AUTHORITY_KIND || authority.status !== AUTHORITY_STATUS) problem(problems, 'AUTHORITY_KIND_OR_STATUS');
    if (authority.candidate_label !== undefined && authority.candidate_label !== CONTRACT.candidate) problem(problems, 'CANDIDATE_LABEL_MISMATCH');
  }
  const bindings = authority && authority.candidate ? {
    source_commit: authority.candidate.source_commit, package_sha256: authority.candidate.package_sha256,
    manifest_sha256: authority.candidate.manifest_sha256, kit_sha256: authority.candidate.kit_sha256,
  } : {};
  const runId = authority ? authority.run_id : null;

  // 2. Ledger.
  const ledgerFile = path.join(runRoot, requests.LEDGER_FILE);
  let ledger = [];
  if (!io.exists(ledgerFile)) problem(problems, 'LEDGER_MISSING');
  else {
    try { ledger = requests.parseLedger(io.readFile(ledgerFile).toString('utf8')); } catch (_error) { problem(problems, 'LEDGER_CORRUPT'); }
  }
  const consumed = ledger.filter((entry) => entry.state === 'CONSUMED');
  const completed = ledger.filter((entry) => entry.state === 'COMPLETED');
  consumed.forEach((entry, index) => {
    if (entry.request_index !== index + 1) problem(problems, 'LEDGER_INDEX_GAP');
    if (runId && entry.run_id !== runId) problem(problems, 'LEDGER_RUN_ID_MISMATCH');
  });
  if (new Set(consumed.map((entry) => entry.digest)).size !== consumed.length) problem(problems, 'LEDGER_REPLAYED_REQUEST');
  if (consumed.length > fixtures.LIMITS.max_requests) problem(problems, 'REQUEST_CAP_EXCEEDED');
  consumed.forEach((entry, index) => {
    const done = completed.filter((item) => item.request_index === entry.request_index);
    const isLast = index === consumed.length - 1;
    // The request being verified right now (the report phase itself) is allowed to be the only open one.
    if (done.length !== 1 && !(isLast && done.length === 0)) problem(problems, 'LEDGER_COMPLETION_INVALID');
  });
  // Every completion must belong to a consumed request with the same index, phase, run and digest; a completion without
  // its consumption would let a PASS exist that no counted request produced.
  completed.forEach((entry) => {
    const match = consumed.find((item) => item.request_index === entry.request_index);
    if (!match || match.phase !== entry.phase || match.digest !== entry.digest || match.run_id !== entry.run_id) problem(problems, 'LEDGER_COMPLETION_ORPHAN');
    if (runId && entry.run_id !== runId) problem(problems, 'LEDGER_RUN_ID_MISMATCH');
  });
  if (consumed.length > 0) {
    const started = Date.parse(consumed[0].consumed_at);
    const ended = Math.max(...completed.map((entry) => Date.parse(entry.completed_at)).filter(Number.isFinite), started);
    if (Number.isFinite(started) && (ended - started) / 1000 > fixtures.LIMITS.max_wall_seconds) problem(problems, 'WALL_TIME_EXCEEDED');
  }

  // 3. Phases up to `through` (default: every phase with a PASS completion).
  const phaseReports = [];
  const passIndex = new Map();
  const plan = fixtures.PHASES.filter((phase) => !through || phase.order <= through.order);
  let casesPassed = 0;
  let assertionsPassed = 0;
  for (const phase of plan) {
    const passes = completed.filter((entry) => entry.phase === phase.id && entry.result === 'PASS');
    const entry = passes[passes.length - 1];
    const report = { phase: phase.id, gate: phase.gate, status: 'NOT_PERFORMED', request_index: null, problems: [] };
    phaseReports.push(report);
    if (!entry) {
      // A partial run (--allow-partial=1) reports the missing phases as NOT_PERFORMED instead of failing.
      if (options.requireAll !== false) { problem(problems, `PHASE_NOT_PASSED:${phase.id}`); report.problems.push('PHASE_NOT_PASSED'); }
      continue;
    }
    passIndex.set(phase.id, entry.request_index);
    report.request_index = entry.request_index;
    const attempt = requests.attemptDirectory(runRoot, entry.request_index, phase.id);
    const resultFile = path.join(attempt, 'phase-result.json');
    if (!io.exists(resultFile)) { problem(problems, `RESULT_MISSING:${phase.id}`); report.problems.push('RESULT_MISSING'); continue; }
    const resultBytes = io.readFile(resultFile);
    if (!HEX64.test(String(entry.result_sha256 || '')) || sha256(resultBytes) !== entry.result_sha256) {
      problem(problems, `RESULT_HASH_MISMATCH:${phase.id}`); report.problems.push('RESULT_HASH_MISMATCH'); continue;
    }
    let result = null;
    try { result = JSON.parse(resultBytes.toString('utf8')); } catch (_error) { problem(problems, `RESULT_JSON_INVALID:${phase.id}`); continue; }
    const resultProblems = fixtures.phaseResultProblems(result, { runId, phase: phase.id, bindings });
    for (const code of resultProblems) { problem(problems, `${code}@${phase.id}`); report.problems.push(code); }
    if (result.status !== 'PASS') { problem(problems, `RESULT_STATUS_NOT_PASS:${phase.id}`); report.problems.push('RESULT_STATUS_NOT_PASS'); }
    if (result.request_index !== entry.request_index) { problem(problems, `RESULT_REQUEST_INDEX:${phase.id}`); report.problems.push('RESULT_REQUEST_INDEX'); }
    for (const item of result.evidence || []) {
      const evidenceFile = path.join(attempt, String(item.file || ''));
      if (!io.exists(evidenceFile)) { problem(problems, `EVIDENCE_MISSING:${phase.id}:${item.file}`); report.problems.push(`EVIDENCE_MISSING:${item.file}`); continue; }
      const bytes = io.readFile(evidenceFile);
      if (bytes.length !== item.size || sha256(bytes) !== item.sha256) { problem(problems, `EVIDENCE_HASH_MISMATCH:${phase.id}:${item.file}`); report.problems.push(`EVIDENCE_HASH_MISMATCH:${item.file}`); }
    }
    if (report.problems.length === 0) {
      report.status = 'PASS';
      casesPassed += result.cases.length;
      assertionsPassed += result.cases.reduce((total, item) => total + item.assertions.length, 0);
    }
  }
  // 4. Prerequisite order.
  for (const phase of plan) {
    if (!passIndex.has(phase.id)) continue;
    for (const need of phase.requires) {
      if (!passIndex.has(need) || passIndex.get(need) >= passIndex.get(phase.id)) problem(problems, `PREREQUISITE_ORDER:${phase.id}:${need}`);
    }
  }
  // 5. Failed attempts are retained evidence, never removed.
  for (const entry of completed.filter((item) => item.result === 'FAIL')) {
    const attempt = requests.attemptDirectory(runRoot, entry.request_index, entry.phase);
    if (!io.exists(path.join(attempt, 'phase-result.json'))) problem(problems, `FAILED_ATTEMPT_EVIDENCE_REMOVED:${entry.request_index}`);
  }
  const expectedCases = plan.reduce((total, phase) => total + fixtures.casesForPhase(phase.id).length, 0);
  return {
    ok: problems.length === 0,
    problems,
    phases: phaseReports,
    totals: {
      phases_planned: plan.length,
      phases_passed: phaseReports.filter((item) => item.status === 'PASS').length,
      cases_expected: expectedCases,
      cases_passed: casesPassed,
      assertions_passed: assertionsPassed,
      requests_consumed: consumed.length,
      failed_attempts: completed.filter((item) => item.result === 'FAIL').length,
      max_requests: fixtures.LIMITS.max_requests,
    },
  };
}

// Negative controls: each must be rejected with its own problem class. Only meaningful when the baseline is clean.
// The closed list of negative controls a report must have run and passed; a missing id fails the report.
const REQUIRED_NEGATIVES = Object.freeze(['NEG-WRONG-PIN', 'NEG-WRONG-CANDIDATE', 'NEG-MISSING-EVIDENCE', 'NEG-EDITED-EVIDENCE', 'NEG-EDITED-REPORT',
  'NEG-STRIPPED-OBSERVATION', 'NEG-REPLAYED-REQUEST', 'NEG-ORPHAN-COMPLETION']);

function runNegativeControls(io, options) {
  const baseline = verifyRun(io, options);
  if (!baseline.ok) return { performed: false, reason: 'BASELINE_NOT_CLEAN', results: [] };
  const results = [];
  function control(id, expectedPrefix, verdict) {
    const rejected = !verdict.ok;
    const matched = verdict.problems.some((code) => code.startsWith(expectedPrefix));
    results.push({ id, expected: expectedPrefix, rejected, matched_expected_class: matched, status: rejected && matched ? 'PASS' : 'FAIL',
      problems: verdict.problems.slice(0, 5) });
  }
  const flipped = options.authoritySha256.replace(/^./, (digit) => (digit === '0' ? '1' : '0'));
  control('NEG-WRONG-PIN', 'AUTHORITY_PIN_MISMATCH', verifyRun(io, { ...options, authoritySha256: flipped }));
  control('NEG-WRONG-CANDIDATE', 'CANDIDATE_LABEL_MISMATCH', verifyRun(io, { ...options, candidateLabel: 'WIN7-99' }));

  const ledger = requests.parseLedger(io.readFile(path.join(options.runRoot, requests.LEDGER_FILE)).toString('utf8'));
  const passes = ledger.filter((entry) => entry.state === 'COMPLETED' && entry.result === 'PASS');
  const target = passes.find((entry) => entry.phase !== 'p09-report' && entry.phase !== 'p10-postflight') || passes[0];
  const attempt = requests.attemptDirectory(options.runRoot, target.request_index, target.phase);
  const resultFile = path.join(attempt, 'phase-result.json');
  const result = JSON.parse(io.readFile(resultFile).toString('utf8'));
  const firstEvidence = (result.evidence || [])[0];
  if (firstEvidence) {
    const evidenceFile = path.join(attempt, firstEvidence.file);
    control('NEG-MISSING-EVIDENCE', 'EVIDENCE_MISSING', verifyRun(overlayIo(io, { hide: new Set([evidenceFile]) }), options));
    control('NEG-EDITED-EVIDENCE', 'EVIDENCE_HASH_MISMATCH', verifyRun(overlayIo(io, { replace: new Map([[evidenceFile, Buffer.from('edited')]]) }), options));
  }
  const edited = JSON.parse(JSON.stringify(result));
  edited.cases[0].assertions[0].observed = `${edited.cases[0].assertions[0].observed} (edited)`;
  control('NEG-EDITED-REPORT', 'RESULT_HASH_MISMATCH', verifyRun(overlayIo(io, { replace: new Map([[resultFile, Buffer.from(JSON.stringify(edited))]]) }), options));
  // Re-hashed edit: the ledger entry is updated too, so only the content rules can catch a stripped observation.
  const stripped = JSON.parse(JSON.stringify(result));
  stripped.cases[0].assertions[0].observed = '';
  const strippedBytes = Buffer.from(JSON.stringify(stripped));
  const ledgerFile = path.join(options.runRoot, requests.LEDGER_FILE);
  const rewrittenLedger = ledger.map((entry) => (entry === passes.find((item) => item.request_index === target.request_index && item.phase === target.phase)
    ? { ...entry, result_sha256: sha256(strippedBytes) } : entry)).map((entry) => JSON.stringify(entry)).join('\n').concat('\n');
  control('NEG-STRIPPED-OBSERVATION', 'ASSERTION_NOT_PASS', verifyRun(overlayIo(io, { replace: new Map([[resultFile, strippedBytes], [ledgerFile, Buffer.from(rewrittenLedger)]]) }), options));
  const replayed = ledger.concat([{ ...ledger.find((entry) => entry.state === 'CONSUMED') }]);
  control('NEG-REPLAYED-REQUEST', 'LEDGER_REPLAYED_REQUEST', verifyRun(overlayIo(io, { replace: new Map([[ledgerFile, Buffer.from(replayed.map((entry) => JSON.stringify(entry)).join('\n').concat('\n'))]]) }), options));
  // A PASS completion for a request that was never consumed (the first consumption is dropped from a copy of the ledger).
  const firstConsumed = ledger.find((entry) => entry.state === 'CONSUMED');
  const withoutConsumption = ledger.filter((entry) => entry !== firstConsumed);
  control('NEG-ORPHAN-COMPLETION', 'LEDGER_COMPLETION_ORPHAN', verifyRun(overlayIo(io, { replace: new Map([[ledgerFile, Buffer.from(withoutConsumption.map((entry) => JSON.stringify(entry)).join('\n').concat('\n'))]]) }), options));
  return { performed: true, reason: null, results };
}

function argument(argv, name, fallback = '') {
  const prefix = `--${name}=`;
  const value = argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}
function writeRaw(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// Phase mode (p09): writes the attempt's evidence and phase-result.json. Ordinary-user mode: prints the verdict only.
function main(argv = process.argv.slice(2), io = diskIo()) {
  const runRoot = path.resolve(argument(argv, 'run-root'));
  const options = {
    runRoot,
    authorityPath: path.resolve(argument(argv, 'release-authority')),
    authoritySha256: argument(argv, 'release-authority-sha256'),
    through: argument(argv, 'through') || undefined,
    requireAll: argument(argv, 'allow-partial') !== '1',
  };
  const phaseMode = argument(argv, 'phase') === 'p09-report';
  if (phaseMode) options.through = 'p08-ui';
  const verdict = verifyRun(io, options);
  const negatives = runNegativeControls(io, options);
  const negativesOk = negatives.performed && REQUIRED_NEGATIVES.every((id) => negatives.results.some((item) => item.id === id))
    && negatives.results.every((item) => item.status === 'PASS');
  const report = {
    schema_version: 1, kind: 'A9_BATCH2_REPORT_VERIFICATION', candidate_label: CONTRACT.candidate, candidate_tentative: true,
    recorded_at: new Date().toISOString(), run_root: runRoot, through: options.through || null,
    status: verdict.ok && negativesOk ? 'PASS' : 'FAIL',
    problems: verdict.problems, phases: verdict.phases, totals: verdict.totals,
    negative_controls: negatives,
    note: 'Win7 execution capability is decided only by the owner at gate B after independent review.',
  };
  if (phaseMode) {
    const attempt = path.resolve(argument(argv, 'evidence-root'));
    writeRaw(path.join(attempt, 'g3-report-verify.json'), report);
    writeRaw(path.join(attempt, 'g3-negatives.json'), { schema_version: 1, ...negatives });
    const bindings = io.exists(options.authorityPath) ? (() => {
      const authority = readJsonVia(io, options.authorityPath) || {};
      const candidate = authority.candidate || {};
      return { source_commit: candidate.source_commit, package_sha256: candidate.package_sha256, manifest_sha256: candidate.manifest_sha256, kit_sha256: candidate.kit_sha256 };
    })() : {};
    const result = fixtures.newPhaseResult('p09-report', argument(argv, 'run-id'), Number(argument(argv, 'request-index')) || 0, bindings);
    const caseId = 'B2-G3-REPORT-NEGATIVES';
    const assertionId = fixtures.casesForPhase('p09-report')[0].assertions[0].assertion_id;
    fixtures.setAssertion(result, caseId, assertionId, report.status === 'PASS' ? 'PASS' : 'FAIL',
      `verified=${verdict.totals ? verdict.totals.phases_passed : 0}/${verdict.totals ? verdict.totals.phases_planned : 0} phases; negatives=${negatives.results.map((item) => `${item.id}:${item.status}`).join(',')}; problems=${verdict.problems.slice(0, 3).join('|') || 'none'}`);
    result.evidence = ['g3-report-verify.json', 'g3-negatives.json'].map((name) => {
      const bytes = fs.readFileSync(path.join(attempt, name));
      return { file: name, size: bytes.length, sha256: sha256(bytes) };
    });
    fixtures.finalizePhaseResult(result, report.status === 'PASS' ? null : 'REPORT_VERIFICATION_FAILED');
    writeRaw(path.join(attempt, 'phase-result.json'), result);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
  return report;
}

module.exports = { verifyRun, runNegativeControls, diskIo, overlayIo, main, AUTHORITY_KIND, AUTHORITY_STATUS, REQUIRED_NEGATIVES };
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
