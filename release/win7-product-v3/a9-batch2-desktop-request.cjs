// A9-33 batch2: approved-phase request contract for the ordinary-desktop controller (WIN7-45 tentative, ADR-0155 Proposed).
//
// A request names exactly one phase from the closed set in a9-batch2-fixtures.cjs. It is bound to the run id,
// the package/manifest/kit/authority hashes, the approved target identity and a short lifetime. The controller
// (a9-batch2-desktop-controller.ps1) runs only the argv this module derives from a verified request; there is no
// free-text command field. A consumed request can never be replayed: the append-only ledger in the
// candidate-external evidence root records every request before it runs, and every request counts against the cap.
// Runs under Electron 22 / Node 16 (ELECTRON_RUN_AS_NODE=1); no network, no child process, no dependency.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fixtures = require('./a9-batch2-fixtures.cjs');

const REQUEST_SCHEMA = 1;
const REQUEST_KIND = 'A9_BATCH2_PHASE_REQUEST';
const LEDGER_FILE = 'request-ledger.jsonl';
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const SCRIPT_BY_KIND = Object.freeze({
  integrity: 'validation/a9-batch2-package-integrity.cjs',
  smoke: 'validation/a9-batch2-smoke.cjs',
  report: 'validation/a9-batch2-report.cjs',
});
const TARGET_FIELDS = Object.freeze(['machine_name', 'account_name', 'account_sid', 'integrity_level']);
const EXTERNAL_FIELDS = Object.freeze(['package_zip', 'formal_input_lock', 'approval_registry', 'release_authority']);
const BINDING_FIELDS = Object.freeze(['source_commit', 'package_sha256', 'manifest_sha256', 'kit_sha256', 'release_authority_sha256']);
const TARGET_EXTRA_FIELDS = Object.freeze(['session_id', 'elevated', 'in_job']);
const EXTERNAL_ITEM_FIELDS = Object.freeze(['path', 'sha256']);
// The integrity phase reads every external file; the report phase re-derives its verdict from the pinned authority alone.
function externalsNeeded(phase) {
  if (!phase) return [];
  if (phase.script === 'integrity') return EXTERNAL_FIELDS;
  if (phase.script === 'report') return ['release_authority'];
  return [];
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function requestDigest(request) {
  const body = { ...request };
  delete body.digest;
  return sha256(canonicalJson(body));
}
function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function isIsoInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

// ---- Ledger ------------------------------------------------------------------------------------

function parseLedger(text) {
  const entries = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch (_error) { throw new Error('A9_BATCH2_LEDGER_CORRUPT'); }
    if (!entry || typeof entry !== 'object' || !['CONSUMED', 'COMPLETED'].includes(entry.state)) throw new Error('A9_BATCH2_LEDGER_CORRUPT');
    entries.push(entry);
  }
  return entries;
}
function readLedger(evidenceRoot) {
  const file = path.join(evidenceRoot, LEDGER_FILE);
  return fs.existsSync(file) ? parseLedger(fs.readFileSync(file, 'utf8')) : [];
}
function appendLedger(evidenceRoot, entry) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  // The flag "a" appends atomically for one small line on the local file system; an entry is never rewritten.
  fs.appendFileSync(path.join(evidenceRoot, LEDGER_FILE), `${JSON.stringify(entry)}\n`, { encoding: 'utf8', flag: 'a' });
}
function consumedRequests(ledger) { return ledger.filter((entry) => entry.state === 'CONSUMED'); }
function completionFor(ledger, requestIndex) {
  return ledger.filter((entry) => entry.state === 'COMPLETED' && entry.request_index === requestIndex).pop() || null;
}
function phasePassed(ledger, phaseId) {
  return ledger.some((entry) => entry.state === 'COMPLETED' && entry.phase === phaseId && entry.result === 'PASS');
}
// A9-33 section 6.4: two consecutive failures of the same class stop the whole batch until a root cause is recorded.
function sameClassFailureTwice(ledger) {
  const completed = ledger.filter((entry) => entry.state === 'COMPLETED');
  if (completed.length < 2) return false;
  const [previous, last] = completed.slice(-2);
  return previous.result === 'FAIL' && last.result === 'FAIL' && typeof last.failure_class === 'string'
    && last.failure_class.length > 0 && previous.failure_class === last.failure_class;
}

// ---- Request creation and verification -----------------------------------------------------------

function createRequest(options) {
  const input = options || {};
  const phase = fixtures.phaseById(input.phase);
  if (!phase) throw new Error(`A9_BATCH2_REQUEST_PHASE_UNKNOWN:${input.phase}`);
  const ttl = input.ttlSeconds === undefined ? fixtures.LIMITS.request_ttl_seconds : input.ttlSeconds;
  if (!Number.isInteger(ttl) || ttl < 30 || ttl > fixtures.LIMITS.request_ttl_seconds) throw new Error('A9_BATCH2_REQUEST_TTL_INVALID');
  const issued = input.now instanceof Date ? input.now : new Date();
  const request = {
    schema_version: REQUEST_SCHEMA,
    kind: REQUEST_KIND,
    candidate: fixtures.CONTRACT.candidate,
    lock_id: fixtures.CONTRACT.lock_id,
    run_id: input.runId,
    phase: phase.id,
    request_index: input.requestIndex,
    max_requests: fixtures.LIMITS.max_requests,
    issued_at: issued.toISOString(),
    expires_at: new Date(issued.getTime() + ttl * 1000).toISOString(),
    bindings: {
      source_commit: input.sourceCommit,
      package_sha256: input.packageSha256,
      manifest_sha256: input.manifestSha256,
      kit_sha256: input.kitSha256,
      release_authority_sha256: input.releaseAuthoritySha256,
    },
    target: { ...(input.target || {}) },
    candidate_root: input.candidateRoot,
    evidence_root: input.evidenceRoot,
    external_files: { ...(input.externalFiles || {}) },
  };
  request.digest = requestDigest(request);
  const problems = structuralProblems(request);
  if (problems.length) throw new Error(`A9_BATCH2_REQUEST_INVALID:${problems.join(',')}`);
  return request;
}

function structuralProblems(request) {
  const problems = [];
  if (!request || typeof request !== 'object' || Array.isArray(request)) return ['NOT_AN_OBJECT'];
  const allowedKeys = ['schema_version', 'kind', 'candidate', 'lock_id', 'run_id', 'phase', 'request_index', 'max_requests', 'issued_at',
    'expires_at', 'bindings', 'target', 'candidate_root', 'evidence_root', 'external_files', 'digest'];
  for (const key of Object.keys(request)) if (!allowedKeys.includes(key)) problems.push(`UNKNOWN_FIELD:${key}`);
  if (request.schema_version !== REQUEST_SCHEMA || request.kind !== REQUEST_KIND) problems.push('SCHEMA');
  if (request.candidate !== fixtures.CONTRACT.candidate) problems.push('CANDIDATE');
  if (request.lock_id !== fixtures.CONTRACT.lock_id) problems.push('LOCK_ID');
  if (!RUN_ID_PATTERN.test(String(request.run_id || ''))) problems.push('RUN_ID');
  if (!fixtures.phaseById(request.phase)) problems.push('PHASE');
  if (!Number.isInteger(request.request_index) || request.request_index < 1 || request.request_index > fixtures.LIMITS.max_requests) problems.push('REQUEST_INDEX');
  if (request.max_requests !== fixtures.LIMITS.max_requests) problems.push('MAX_REQUESTS');
  if (!isIsoInstant(request.issued_at) || !isIsoInstant(request.expires_at)) problems.push('INSTANTS');
  else {
    const lifetime = (Date.parse(request.expires_at) - Date.parse(request.issued_at)) / 1000;
    if (lifetime < 30 || lifetime > fixtures.LIMITS.request_ttl_seconds) problems.push('LIFETIME');
  }
  const bindings = request.bindings || {};
  for (const key of Object.keys(bindings)) if (!BINDING_FIELDS.includes(key)) problems.push(`BINDING_UNKNOWN_FIELD:${key}`);
  if (!HEX40.test(String(bindings.source_commit || ''))) problems.push('BINDING_SOURCE_COMMIT');
  for (const key of ['package_sha256', 'manifest_sha256', 'kit_sha256', 'release_authority_sha256']) {
    if (!HEX64.test(String(bindings[key] || ''))) problems.push(`BINDING_${key.toUpperCase()}`);
  }
  const target = request.target || {};
  for (const key of Object.keys(target)) if (![...TARGET_FIELDS, ...TARGET_EXTRA_FIELDS].includes(key)) problems.push(`TARGET_UNKNOWN_FIELD:${key}`);
  for (const key of TARGET_FIELDS) if (typeof target[key] !== 'string' || !target[key] || target[key].length > 256 || /[\r\n]/.test(target[key])) problems.push(`TARGET_${key.toUpperCase()}`);
  if (!Number.isInteger(target.session_id) || target.session_id < 0) problems.push('TARGET_SESSION_ID');
  if (target.elevated !== false) problems.push('TARGET_ELEVATED');
  if (typeof target.in_job !== 'boolean') problems.push('TARGET_IN_JOB');
  if (typeof request.candidate_root !== 'string' || !path.isAbsolute(request.candidate_root)) problems.push('CANDIDATE_ROOT');
  if (typeof request.evidence_root !== 'string' || !path.isAbsolute(request.evidence_root)) problems.push('EVIDENCE_ROOT');
  else if (typeof request.candidate_root === 'string' && path.isAbsolute(request.candidate_root)
    && (contained(request.candidate_root, request.evidence_root) || contained(request.evidence_root, request.candidate_root))) problems.push('EVIDENCE_ROOT_NOT_EXTERNAL');
  const phase = fixtures.phaseById(request.phase);
  const externals = request.external_files || {};
  const needed = externalsNeeded(phase);
  for (const key of Object.keys(externals)) if (!EXTERNAL_FIELDS.includes(key)) problems.push(`EXTERNAL_UNKNOWN:${key}`);
  for (const key of Object.keys(externals)) {
    const item = externals[key];
    if (item && typeof item === 'object') for (const field of Object.keys(item)) if (!EXTERNAL_ITEM_FIELDS.includes(field)) problems.push(`EXTERNAL_UNKNOWN_FIELD:${key}.${field}`);
  }
  if (needed.length > 0) {
    for (const key of needed) {
      const item = externals[key];
      if (!item || typeof item.path !== 'string' || !path.isAbsolute(item.path) || !HEX64.test(String(item.sha256 || ''))) problems.push(`EXTERNAL_${key.toUpperCase()}`);
      else if (typeof request.candidate_root === 'string' && path.isAbsolute(request.candidate_root) && contained(request.candidate_root, item.path)) problems.push(`EXTERNAL_${key.toUpperCase()}_INSIDE_CANDIDATE`);
    }
  }
  if (externals.release_authority && externals.release_authority.sha256 !== bindings.release_authority_sha256) problems.push('AUTHORITY_PIN_MISMATCH');
  if (request.digest !== undefined && request.digest !== requestDigest(request)) problems.push('DIGEST');
  if (request.digest === undefined) problems.push('DIGEST_MISSING');
  return problems;
}

// context: { now: Date, runId, ledger: [], actual?: { packageSha256, manifestSha256, kitSha256, target } }
function verifyRequest(request, context) {
  const ctx = context || {};
  const problems = structuralProblems(request);
  if (problems.length) return { ok: false, problems };
  const now = ctx.now instanceof Date ? ctx.now.getTime() : Date.now();
  const ledger = ctx.ledger || [];
  if (ctx.runId !== undefined && ctx.runId !== request.run_id) problems.push('RUN_ID_MISMATCH');
  if (now < Date.parse(request.issued_at)) problems.push('NOT_YET_VALID');
  if (now > Date.parse(request.expires_at)) problems.push('EXPIRED');
  const consumed = consumedRequests(ledger);
  if (consumed.some((entry) => entry.digest === request.digest)) problems.push('REPLAYED');
  if (consumed.some((entry) => entry.run_id !== request.run_id)) problems.push('LEDGER_RUN_ID_MISMATCH');
  if (request.request_index !== consumed.length + 1) problems.push('REQUEST_INDEX_NOT_NEXT');
  if (consumed.length >= fixtures.LIMITS.max_requests) problems.push('REQUEST_CAP_REACHED');
  if (consumed.length > 0) {
    const started = Date.parse(consumed[0].consumed_at);
    if (Number.isFinite(started) && (now - started) / 1000 > fixtures.LIMITS.max_wall_seconds) problems.push('WALL_TIME_EXCEEDED');
  }
  if (sameClassFailureTwice(ledger)) problems.push('SAME_CLASS_FAILURE_TWICE_DIAGNOSE_FIRST');
  const lastConsumed = consumed[consumed.length - 1];
  if (lastConsumed && !completionFor(ledger, lastConsumed.request_index)) problems.push('PREVIOUS_REQUEST_NOT_COMPLETED');
  const phase = fixtures.phaseById(request.phase);
  for (const need of phase.requires) if (!phasePassed(ledger, need)) problems.push(`PREREQUISITE_NOT_PASSED:${need}`);
  const actual = ctx.actual;
  if (actual) {
    if (actual.packageSha256 !== undefined && actual.packageSha256 !== request.bindings.package_sha256) problems.push('PACKAGE_HASH_MISMATCH');
    if (actual.manifestSha256 !== undefined && actual.manifestSha256 !== request.bindings.manifest_sha256) problems.push('MANIFEST_HASH_MISMATCH');
    if (actual.kitSha256 !== undefined && actual.kitSha256 !== request.bindings.kit_sha256) problems.push('KIT_HASH_MISMATCH');
    if (actual.target) {
      for (const key of ['machine_name', 'account_sid', 'integrity_level', 'session_id', 'elevated', 'in_job']) {
        if (actual.target[key] !== request.target[key]) problems.push(`TARGET_MISMATCH:${key}`);
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

// Each request writes into its own directory, so a retry or a failure never overwrites earlier raw evidence.
function attemptDirectory(runRoot, requestIndex, phaseId) {
  return path.join(runRoot, 'requests', `${String(requestIndex).padStart(2, '0')}-${phaseId}`);
}

// The only command a request can produce: the packaged electron.exe in its declared Node mode running one packaged script.
function argvForRequest(request, layout) {
  const phase = fixtures.phaseById(request.phase);
  if (!phase) throw new Error('A9_BATCH2_REQUEST_PHASE_UNKNOWN');
  const script = SCRIPT_BY_KIND[phase.script];
  if (!script) throw new Error('A9_BATCH2_REQUEST_SCRIPT_UNKNOWN');
  const candidateRoot = path.resolve((layout && layout.candidateRoot) || request.candidate_root);
  const evidenceRoot = path.resolve((layout && layout.evidenceRoot) || request.evidence_root);
  const args = [path.join(candidateRoot, ...script.split('/')), `--phase=${phase.id}`, `--run-id=${request.run_id}`,
    `--request-index=${request.request_index}`, `--run-root=${evidenceRoot}`,
    `--evidence-root=${attemptDirectory(evidenceRoot, request.request_index, phase.id)}`];
  const externals = request.external_files || {};
  if (phase.script === 'integrity') {
    args.push(`--package-zip=${externals.package_zip.path}`, `--formal-input-lock=${externals.formal_input_lock.path}`,
      `--approval-registry=${externals.approval_registry.path}`, `--release-authority=${externals.release_authority.path}`,
      `--release-authority-sha256=${request.bindings.release_authority_sha256}`);
  } else if (phase.script === 'report') {
    // The report phase must be able to re-read the same pinned authority; without these two arguments it cannot start.
    args.push(`--release-authority=${externals.release_authority.path}`, `--release-authority-sha256=${request.bindings.release_authority_sha256}`);
  }
  return {
    program: path.join(candidateRoot, 'electron.exe'),
    args,
    env: { ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
  };
}

// Consuming first claims the attempt directory with a non-recursive mkdir, which the file system makes exclusive: of two
// processes that both passed verification, only one gets the claim and the other stops. Only the claimant re-reads the
// ledger, records the request and copies it into the attempt directory. A request refused before anything was recorded
// releases its empty claim; a request whose index already has another claim (another phase) is refused the same way; a claim left behind by a crash keeps that request index closed (fail closed), and the operator
// records the cause instead of reusing the index.
function consumeRequest(request, evidenceRoot, now) {
  const when = (now instanceof Date ? now : new Date()).toISOString();
  const attempt = attemptDirectory(evidenceRoot, request.request_index, request.phase);
  fs.mkdirSync(path.dirname(attempt), { recursive: true });
  try { fs.mkdirSync(attempt); } catch (error) {
    if (error && error.code === 'EEXIST') throw new Error('A9_BATCH2_REQUEST_ALREADY_CLAIMED');
    throw error;
  }
  let recorded = false;
  try {
    // The claim directory name carries the phase, so two requests of one index but different phases claim different
    // directories. After claiming, any other directory of this index means a rival got in: both back off (fail closed).
    const indexPrefix = `${String(request.request_index).padStart(2, '0')}-`;
    const rivals = fs.readdirSync(path.dirname(attempt)).filter((name) => name.startsWith(indexPrefix) && name !== path.basename(attempt));
    if (rivals.length > 0) throw new Error('A9_BATCH2_REQUEST_ALREADY_CLAIMED');
    const ledger = readLedger(evidenceRoot);
    const consumed = consumedRequests(ledger);
    if (consumed.some((entry) => entry.digest === request.digest || entry.request_index === request.request_index)) throw new Error('A9_BATCH2_REQUEST_REPLAYED');
    if (request.request_index !== consumed.length + 1) throw new Error('A9_BATCH2_REQUEST_INDEX_NOT_NEXT');
    appendLedger(evidenceRoot, { state: 'CONSUMED', request_index: request.request_index, phase: request.phase,
      run_id: request.run_id, digest: request.digest, consumed_at: when });
    recorded = true;
  } finally {
    // A refused request that recorded nothing must not close its index: the empty directory this call created is released.
    if (!recorded) { try { fs.rmdirSync(attempt); } catch (_error) { /* not empty or already gone: leave it */ } }
  }
  fs.writeFileSync(path.join(attempt, 'request.json'), `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  return attempt;
}
// The controller cannot parse JSON on PowerShell 2.0, so it passes "auto": the verdict is read from the phase result the
// phase script wrote. A missing or unreadable result file, or a non-zero process exit with a PASS result, is a FAIL.
function derivedResult(request, evidenceRoot, exitCode) {
  const resultFile = path.join(attemptDirectory(evidenceRoot, request.request_index, request.phase), 'phase-result.json');
  let parsed = null;
  try { parsed = JSON.parse(fs.readFileSync(resultFile, 'utf8')); } catch (_error) { parsed = null; }
  if (!parsed || typeof parsed.status !== 'string') return { result: 'FAIL', failureClass: 'PHASE_RESULT_MISSING' };
  if (parsed.status !== 'PASS') return { result: 'FAIL', failureClass: parsed.failure_class || 'PHASE_RESULT_NOT_PASS' };
  if (exitCode !== undefined && exitCode !== 0) return { result: 'FAIL', failureClass: 'EXIT_CODE_MISMATCH' };
  return { result: 'PASS', failureClass: '' };
}

// The result file is hashed into the ledger entry, so editing phase-result.json afterwards is detectable.
// A completion is only accepted for a request this ledger consumed with the same index, phase, run and digest, and only once.
// A PASS completion also needs a phase-result.json whose own status is PASS.
function completeRequest(request, evidenceRoot, result, failureClass, now) {
  if (!['PASS', 'FAIL'].includes(result)) throw new Error('A9_BATCH2_LEDGER_RESULT_INVALID');
  const ledger = readLedger(evidenceRoot);
  const match = consumedRequests(ledger).find((entry) => entry.request_index === request.request_index);
  if (!match || match.phase !== request.phase || match.run_id !== request.run_id || match.digest !== request.digest) throw new Error('A9_BATCH2_LEDGER_NOT_CONSUMED');
  if (completionFor(ledger, request.request_index)) throw new Error('A9_BATCH2_LEDGER_ALREADY_COMPLETED');
  const resultFile = path.join(attemptDirectory(evidenceRoot, request.request_index, request.phase), 'phase-result.json');
  const resultSha256 = fs.existsSync(resultFile) ? sha256(fs.readFileSync(resultFile)) : null;
  if (result === 'PASS' && !resultSha256) throw new Error('A9_BATCH2_LEDGER_RESULT_FILE_MISSING');
  if (result === 'PASS') {
    let parsed = null;
    try { parsed = JSON.parse(fs.readFileSync(resultFile, 'utf8')); } catch (_error) { parsed = null; }
    if (!parsed || parsed.status !== 'PASS') throw new Error('A9_BATCH2_LEDGER_RESULT_NOT_PASS');
  }
  appendLedger(evidenceRoot, { state: 'COMPLETED', request_index: request.request_index, phase: request.phase,
    run_id: request.run_id, digest: request.digest, result, result_sha256: resultSha256,
    ...(failureClass ? { failure_class: String(failureClass).slice(0, 80) } : {}),
    completed_at: (now instanceof Date ? now : new Date()).toISOString() });
}

// ---- Command line --------------------------------------------------------------------------------

function option(argv, name) {
  const prefix = `--${name}=`;
  const found = argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}
function readRequestFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_error) { throw new Error('A9_BATCH2_REQUEST_UNREADABLE'); }
}

function main(argv) {
  const command = argv[0];
  if (command === 'verify' || command === 'argv' || command === 'consume' || command === 'complete') {
    const requestFile = option(argv, 'request');
    const request = readRequestFile(requestFile);
    const evidenceRoot = path.resolve(option(argv, 'evidence-root') || request.evidence_root || '');
    if (command === 'complete') {
      let result = option(argv, 'result');
      let failureClass = option(argv, 'failure-class');
      if (result === 'auto') {
        const exitText = option(argv, 'exit-code');
        const derived = derivedResult(request, evidenceRoot, exitText === '' ? undefined : Number(exitText));
        result = derived.result;
        failureClass = derived.failureClass;
      }
      completeRequest(request, evidenceRoot, result, failureClass);
      return { ok: true, result, failure_class: failureClass || null };
    }
    const actual = {};
    if (option(argv, 'manifest-sha256')) actual.manifestSha256 = option(argv, 'manifest-sha256');
    if (option(argv, 'kit-sha256')) actual.kitSha256 = option(argv, 'kit-sha256');
    if (option(argv, 'package-sha256')) actual.packageSha256 = option(argv, 'package-sha256');
    if (option(argv, 'actual-account-sid')) {
      actual.target = {
        machine_name: option(argv, 'actual-machine-name'), account_sid: option(argv, 'actual-account-sid'), integrity_level: option(argv, 'actual-integrity-level'),
        session_id: Number(option(argv, 'actual-session-id')), elevated: option(argv, 'actual-elevated') === 'true',
        // Anything other than the words true or false (for example unknown) is not a boolean and never equals the approved value.
        in_job: option(argv, 'actual-in-job') === 'true' ? true : option(argv, 'actual-in-job') === 'false' ? false : null,
      };
    }
    const verdict = verifyRequest(request, { now: new Date(), runId: option(argv, 'run-id') || undefined, ledger: readLedger(evidenceRoot), actual });
    // The actual target is echoed so a TARGET_MISMATCH refusal shows the observed values next to the approved ones (rehearsal 4: in_job refused with no value shown).
    if (!verdict.ok) return { ok: false, problems: verdict.problems, actual_target: actual.target || null };
    if (command === 'verify') return { ok: true };
    if (command === 'consume') { return { ok: true, attempt_directory: consumeRequest(request, evidenceRoot) }; }
    const derived = argvForRequest(request);
    return { ok: true, argv: derived, lines: [derived.program, ...derived.args] };
  }
  if (command === 'create') {
    const request = createRequest({
      runId: option(argv, 'run-id'), phase: option(argv, 'phase'), requestIndex: Number(option(argv, 'request-index')),
      sourceCommit: option(argv, 'source-commit'), packageSha256: option(argv, 'package-sha256'), manifestSha256: option(argv, 'manifest-sha256'),
      kitSha256: option(argv, 'kit-sha256'), releaseAuthoritySha256: option(argv, 'release-authority-sha256'),
      candidateRoot: option(argv, 'candidate-root'), evidenceRoot: option(argv, 'evidence-root'),
      target: {
        machine_name: option(argv, 'machine-name'), account_name: option(argv, 'account-name'), account_sid: option(argv, 'account-sid'),
        integrity_level: option(argv, 'integrity-level'), session_id: Number(option(argv, 'session-id')), elevated: false,
        in_job: option(argv, 'in-job') === 'true',
      },
      externalFiles: option(argv, 'external-files') ? JSON.parse(option(argv, 'external-files')) : {},
    });
    return { ok: true, request };
  }
  throw new Error('A9_BATCH2_REQUEST_COMMAND_UNKNOWN');
}

module.exports = {
  REQUEST_SCHEMA, REQUEST_KIND, LEDGER_FILE, SCRIPT_BY_KIND, TARGET_FIELDS, EXTERNAL_FIELDS, BINDING_FIELDS, externalsNeeded,
  canonicalJson, requestDigest, attemptDirectory, createRequest, structuralProblems, verifyRequest, argvForRequest,
  parseLedger, readLedger, appendLedger, consumeRequest, completeRequest, derivedResult, sameClassFailureTwice, phasePassed, main,
};

if (require.main === module) {
  try {
    const argvIn = process.argv.slice(2);
    const result = main(argvIn);
    // "argv-lines" prints the program and each argument on its own line, for a caller that cannot parse JSON.
    if (argvIn[0] === 'argv' && option(argvIn, 'format') === 'lines' && result.ok) process.stdout.write(`${result.lines.join('\n')}\n`);
    else process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
