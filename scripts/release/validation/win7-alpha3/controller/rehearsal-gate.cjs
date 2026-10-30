'use strict';
// Candidate-external, Node 16/20, builtins only. Never dispatches a product or contacts a host.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const vm = require('vm');
const { createRequire } = require('module');
const runContext = require('./run-context.cjs');
const phasePlan = require('./phase-plan.cjs');
const PREP = path.resolve(__dirname, '..');
const TAG = 'FORMAL_GATE_A_EXECUTION';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
// JSON.parse silently accepts duplicate keys. Validate the token stream first, including escaped key aliases.
function parseJSON(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes;
  must(typeof text === 'string' && text[0] !== '\ufeff', 'JSON_TEXT');
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  function string() {
    const start = i++; must(text[start] === '"', 'JSON_STRING');
    while (i < text.length) { const c = text[i++]; if (c === '\\') i++; else if (c === '"') return JSON.parse(text.slice(start, i)); }
    must(false, 'JSON_UNTERMINATED');
  }
  function value() {
    ws(); const c = text[i];
    if (c === '{') {
      i++; ws(); const seen = new Set(); if (text[i] === '}') { i++; return; }
      for (;;) { ws(); const key = string(); must(!seen.has(key), 'JSON_DUPLICATE_KEY:' + key); seen.add(key);
        ws(); must(text[i++] === ':', 'JSON_COLON'); value(); ws(); const end = text[i++];
        if (end === '}') return; must(end === ',', 'JSON_OBJECT'); }
    }
    if (c === '[') { i++; ws(); if (text[i] === ']') { i++; return; }
      for (;;) { value(); ws(); const end = text[i++]; if (end === ']') return; must(end === ',', 'JSON_ARRAY'); } }
    if (c === '"') { string(); return; }
    const start = i; while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
    must(i > start, 'JSON_VALUE'); JSON.parse(text.slice(start, i));
  }
  value(); ws(); must(i === text.length, 'JSON_TRAILING'); return JSON.parse(text);
}
const json = p => parseJSON(fs.readFileSync(p));
const encode = v => Buffer.from(JSON.stringify(v, null, 2) + '\n');
const sameMachine = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
function must(ok, why) { if (!ok) throw new Error('REHEARSAL_GATE:' + why); }
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
  return v;
}
function equal(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
function keys(obj, expected, label) {
  must(obj && typeof obj === 'object' && !Array.isArray(obj), label + ':OBJECT');
  must(equal(Object.keys(obj).sort(), [...expected].sort()), label + ':FIELDS');
}
function utc(value, label) {
  must(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), label + ':UTC');
  const n = Date.parse(value);
  must(Number.isFinite(n) && new Date(n).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'), label + ':TIME');
  return n;
}
function noPlaceholders(v, where = 'authority') {
  must(v !== null && v !== undefined, where + ':PLACEHOLDER');
  if (typeof v === 'number') must(Number.isSafeInteger(v) && v >= 0, where + ':NONNEGATIVE_FINITE_INTEGER');
  else if (typeof v === 'string') must(v.trim() !== '' && !/PENDING|\bTBD\b/i.test(v), where + ':PLACEHOLDER');
  else if (Array.isArray(v)) v.forEach((x, i) => noPlaceholders(x, where + '.' + i));
  else if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => noPlaceholders(x, where + '.' + k));
}
function inputs(file) {
  const candidate = file || path.join(PREP, 'external/RUN_DESCRIPTOR.json');
  const dfile = fs.statSync(candidate).isDirectory() ? path.join(candidate, 'external/RUN_DESCRIPTOR.json') : candidate;
  const ctx = runContext.load(dfile, runContext.loadMode(dfile));
  const verified = require('./remote-inputs.cjs').verifyRemote(ctx.prep, ctx);
  ctx.executionBindingSha256 = verified.executionBindingSha256;
  ctx.executionTools = verified.execution_tools;
  return ctx;
}
function classification(ctx) { return ctx.descriptor.evidence_class; }
function toolPins(prep) { return require('./remote-inputs.cjs').sourcePins(prep); }
function beneath(root, file, label) {
  const r = path.relative(fs.realpathSync(root), fs.realpathSync(file));
  must(r !== '' && r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r), label);
}
function verifyRoots(a, b) {
  const root = a.rehearsal.remote_root;
  for (const [key, suffix] of Object.entries({ candidate_root:'p', tools_root:'t', evidence_root:'e', work_root:'w', data_root:'d' })) {
    must(b[key] === path.win32.join(root, suffix), 'ROOT_LAYOUT:' + key);
  }
  must(/^C:\\A9-DEV\\run\\[a-f0-9]{8}$/.test(root), 'RUN_ROOT');
}
function activationPaths(ctx) {
  let root = path.join(ctx.prep, 'activation-evidence');
  if (ctx.localRunRoot) {
    must(ctx.localRunRoot === runContext.paths(ctx).out, 'LOCAL_RUN_ROOT');
    root = path.join(ctx.localRunRoot, 'activation-evidence');
  }
  return { root, file: path.join(root, 'activation.json'), anchor: path.join(root, 'activation-anchor.json') };
}
// Shared safety checks; local signing is exclusively in local-entry.cjs.
function presign(a, ctx, selectedPlan) {
  must(selectedPlan === 'FULL', 'FULL_REQUIRED');
  verifyPlan(ctx.budget.p1, ctx.budget);
  verifyRoots({ rehearsal: ctx.budget.p1 }, ctx.budget);
  must(a.kind === 'WIN7_56_EXECUTION_BINDING', 'EXECUTION_BINDING_KIND');
  return { ok:true, stage:'binding', evidence_class:classification(ctx) };
}
function verifyPlan(r,b){
 const expected=b.p1,full=phasePlan.fromBudget(b); must(equal(r.phases,full.products)&&r.max_phase_requests===full.requestCount&&equal(r.dispatch_stages,full.dispatch),'FULL_PHASES');
 must(r.max_phase_requests<=16&&b.candidate_wall_budget.from_first_request_to_last_completion_max_seconds<=b.candidate_wall_budget.kit_max_wall_seconds,'KIT_LIMITS');
 must(r.sftp_upload_sessions===3&&r.sftp_download_sessions===3&&r.ssh_control_sessions+r.sftp_upload_sessions+r.sftp_download_sessions===r.total_ssh_transport_sessions,'SFTP_RESUME_BUDGET');
 must(b.transfer_planning.upload_state_query_max_sessions===2&&b.transfer_planning.upload_state_query_seconds===120&&r.ssh_allocation.R3===4,'UPLOAD_STATE_QUERY_BUDGET');
 const d=b.budget_derivation;must(d.register===r.dispatch_stages.length*60&&d.runwait===Object.values(r.phase_ceiling_seconds).reduce((n,x)=>n+x,0)+r.gate_ceiling_seconds&&d.transport_overhead===r.dispatch_stages.length*60,'DERIVED_BUDGET');
 must(d.dispatch===d.register+d.runwait+d.transport_overhead+d.r1_r2_upload_verify+d.expand+d.local_processing&&d.dispatch===r.stop_dispatch_after_seconds&&d.total===d.dispatch+r.cleanup_reserve_seconds&&d.total===r.max_total_seconds,'BUDGET_CLOSURE');
 must(Object.values(r.ssh_allocation).reduce((n,x)=>n+x,0)===r.execution_ssh_sessions&&r.ssh_allocation.R5_R6===2*r.dispatch_stages.length&&r.normal_execution_ssh_sessions===6+2*r.dispatch_stages.length,'SSH_ALLOCATION');
}
function validateExecution(bytes, ctx, plan, now = Date.now()) {
  const expected = ctx.executionBindingSha256;
  must(/^[a-f0-9]{64}$/.test(expected || ''), 'REQUEST_BINDING_SHA_REQUIRED');
  const original = require('./target-binding.cjs').verify(bytes, expected, ctx, now);
  presign(original, ctx, plan);
  const a = Object.assign({}, original, { rehearsal: ctx.budget.p1, execution_tools: ctx.executionTools });
  let begun = ctx.executionStartedAt;
  const active = activationPaths(ctx).file;
  if (begun === undefined && fs.existsSync(active)) begun = utc(json(active).started_at_utc, 'R1_START');
  if (begun === undefined) begun = now;
  must(Number.isFinite(begun) && begun <= now && begun >= Date.parse(ctx.window.starts_at_utc), 'START_RANGE');
  return { authority:a, pin:expected, start:begun, confirmed:begun, end:Date.parse(ctx.window.expires_at_utc) };
}
// Read only the required entries into a fresh directory. No unzip executable, npm or product execution.
function extractFrozen(zipPath, scratchRoot, ctx) {
  const zip = fs.readFileSync(zipPath);
  must(sha(zip) === ctx.facts.builds[0].sha256, 'FROZEN_ZIP_HASH');
  let end = zip.length - 22;
  while (end >= Math.max(0, zip.length - 65557) && zip.readUInt32LE(end) !== 0x06054b50) end--;
  must(end >= 0 && zip.readUInt32LE(end) === 0x06054b50, 'ZIP_END');
  must(zip.readUInt16LE(end + 10) === ctx.facts.builds[0].zip_entries, 'ZIP_BOUND_COUNT');
  const seenNames = new Set();
  const needed = new Set(['release-manifest.json', 'A9_BATCH2_VALIDATION_KIT.json', 'a9-batch2-input-lock.json',
    'validation/a9-batch2-package-integrity.cjs', 'validation/a9-batch2-fixtures.cjs', 'validation/a9-batch2-desktop-request.cjs', 'validation/a9-batch2-smoke.cjs']);
  fs.mkdirSync(scratchRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratchRoot, 'zip-verifier-'));
  let pos = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    must(zip.readUInt32LE(pos) === 0x02014b50, 'ZIP_CENTRAL');
    const method = zip.readUInt16LE(pos + 10), size = zip.readUInt32LE(pos + 20), plainSize = zip.readUInt32LE(pos + 24);
    const n = zip.readUInt16LE(pos + 28), extra = zip.readUInt16LE(pos + 30), comment = zip.readUInt16LE(pos + 32);
    const full = zip.subarray(pos + 46, pos + 46 + n).toString('utf8');
    const top = ctx.facts.builds[0].zip_top;
    must(full.startsWith(top + '/') && !/[\\:\x00-\x1f]/.test(full)
      && full.split('/').every(p => p && p !== '.' && p !== '..' && !/[. ]$/.test(p)), 'ZIP_BOUND_TOP_OR_PATH');
    must(!seenNames.has(full.toLowerCase()), 'ZIP_DUPLICATE'); seenNames.add(full.toLowerCase());
    const relative = full.slice(top.length + 1);
    if (needed.has(relative)) {
      const offset = zip.readUInt32LE(pos + 42);
      must(zip.readUInt32LE(offset) === 0x04034b50 && plainSize < 4 * 1024 * 1024, 'ZIP_LOCAL');
      const data = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
      const packed = zip.subarray(data, data + size);
      must(method === 0 || method === 8, 'ZIP_METHOD');
      const bytes = method === 0 ? packed : zlib.inflateRawSync(packed, { maxOutputLength: 4 * 1024 * 1024 });
      must(bytes.length === plainSize, 'ZIP_SIZE');
      const dest = path.join(root, ...relative.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes, { flag: 'wx' });
      needed.delete(relative);
    }
    pos += 46 + n + extra + comment;
  }
  must(needed.size === 0, 'ZIP_REQUIRED_ENTRY');
  const manifest = json(path.join(root, 'release-manifest.json'));
  must(sha(fs.readFileSync(path.join(root, 'release-manifest.json'))) === ctx.facts.builds[0].manifest_sha256, 'MANIFEST_HASH');
  for (const name of ['validation/a9-batch2-package-integrity.cjs', 'validation/a9-batch2-fixtures.cjs', 'validation/a9-batch2-desktop-request.cjs', 'validation/a9-batch2-smoke.cjs']) {
    must(sha(fs.readFileSync(path.join(root, name))) === manifest.files.find(x => x.path === name).sha256, 'EXTRACT_HASH:' + name);
  }
  must(sha(fs.readFileSync(path.join(root, 'A9_BATCH2_VALIDATION_KIT.json'))) === ctx.facts.builds[0].kit_sha256, 'KIT_HASH');
  const file = path.join(root, 'validation/a9-batch2-package-integrity.cjs');
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\nmodule.exports.verifyAuthority = verifyAuthority;\n',
    { module: mod, exports: mod.exports, require: createRequire(file), process, Buffer, __dirname: path.dirname(file) }, { filename: file });
  return { root, manifest, verifyAuthority: mod.exports.verifyAuthority, requests: require(path.join(root, 'validation/a9-batch2-desktop-request.cjs')) };
}
function verifyFrozen(bytes, ctx, frozen, zipPath) {
  // The approved positive fixture exists only in memory. The original verifier sees a read-only filesystem overlay.
  const file = path.join(ctx.prep, '__memory_authority__.json');
  const io = Object.assign({}, fs, {
    existsSync: p => p === file || fs.existsSync(p),
    statSync: p => p === file ? { isFile: () => true } : fs.statSync(p),
    realpathSync: p => p === file ? file : fs.realpathSync(p),
    readFileSync: (p, enc) => p === file ? (enc ? bytes.toString(enc) : bytes) : fs.readFileSync(p, enc),
  });
  return frozen.verifyAuthority(frozen.root, frozen.manifest, zipPath, ctx.facts.builds[0].kit_sha256, {
    formalInputLockPath: path.join(ctx.prep, 'external/a9-batch2-input-lock.json'),
    approvalRegistryPath: path.join(ctx.prep, 'external/a9-v26-approved-build-kits.json'),
    releaseAuthorityPath: file, releaseAuthoritySha256: sha(bytes),
  }, io);
}
function activate(bytes, _unused, ctx, plan, frozen, zipPath, now = Date.now()) {
  const v = validateExecution(bytes, ctx, plan, now), files = activationPaths(ctx);
  must(now >= v.confirmed && now <= v.confirmed + v.authority.rehearsal.r1_start_max_seconds * 1000, 'R1_START_WINDOW');
  must(!fs.existsSync(files.file) && !fs.existsSync(files.anchor), 'ALREADY_ACTIVATED');
  verifyFrozen(bytes, ctx, frozen, zipPath);
  const result = { ok: true, stage: 'activate', verifier: 'ACCEPTED', evidence_class: classification(ctx), run_id: v.authority.run_id,
    authority_sha256: v.pin, started_at_utc: new Date(now).toISOString(),execution_started_at_utc:new Date(v.confirmed).toISOString(),
    common_deadline_utc: new Date(Math.min(v.end, v.confirmed + (v.authority.rehearsal.r1_start_max_seconds + v.authority.rehearsal.max_total_seconds) * 1000)).toISOString() };
  fs.mkdirSync(files.root, { recursive: true });
  const raw = encode(result);
  fs.writeFileSync(files.file, raw, { flag: 'wx' });
  fs.writeFileSync(files.anchor, encode({ schema_version: 1, run_id: v.authority.run_id, authority_sha256: v.pin,
    activation_sha256: sha(raw) }), { flag: 'wx' });
  return result;
}
function verifyActivation(v, activation, ctx, now) {
  const files = activationPaths(ctx), raw = fs.readFileSync(files.file), anchor = json(files.anchor);
  must(anchor.schema_version === 1 && anchor.run_id === v.authority.run_id && anchor.authority_sha256 === v.pin
    && anchor.activation_sha256 === sha(raw) && equal(parseJSON(raw), activation), 'ACTIVATION_ANCHOR');
  must(activation && activation.ok === true && activation.verifier === 'ACCEPTED' && activation.run_id === v.authority.run_id
    && activation.authority_sha256 === v.pin, 'ACTIVATION');
  const begun = utc(activation.started_at_utc, 'R1_START');
  must(begun >= v.confirmed && begun <= now && begun <= v.confirmed + v.authority.rehearsal.r1_start_max_seconds * 1000, 'R1_START_RANGE');
  must(activation.common_deadline_utc === new Date(Math.min(v.end, v.confirmed
    + (v.authority.rehearsal.r1_start_max_seconds + v.authority.rehearsal.max_total_seconds) * 1000)).toISOString(), 'ACTIVATION_DEADLINE');
}
function expectedEnvironment(a) {
  const root = a.rehearsal.remote_root;
  return { APPDATA: path.win32.join(root, 'd/profile/Roaming'), LOCALAPPDATA: path.win32.join(root, 'd/profile/Local'),
    TEMP: path.win32.join(root, 'd/tmp'), TMP: path.win32.join(root, 'd/tmp'),
    WIN7AGENT_A9_DATAROOT: path.win32.join(root, 'd/product'), WIN7AGENT_PORTABLE: '0' };
}
function verifyPhysicalIsolation(authority, env, ctx) {
  const root = fs.realpathSync(authority.rehearsal.remote_root);
  const b = (ctx || inputs()).budget;
  verifyRoots(authority, b);
  for (const key of ['candidate_root','work_root','evidence_root','data_root']) beneath(root, b[key], 'PHYSICAL_ROOT:' + key);
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'WIN7AGENT_A9_DATAROOT']) {
    const actual = fs.realpathSync(env[key]), relative = path.relative(root, actual);
    must(relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'PHYSICAL_ENV:' + key);
  }
  const oldDb = path.join(env.LOCALAPPDATA, 'Win7CodingAgent/state/agent-events-v2.db');
  must(!fs.existsSync(oldDb), 'A8_DATABASE_MUST_NOT_EXIST');
}
function readLedger(evidenceRoot) {
  const file = path.join(evidenceRoot, 'request-ledger.jsonl');
  if (!fs.existsSync(file)) return [];
  beneath(evidenceRoot, file, 'LEDGER_PATH');
  const text = fs.readFileSync(file, 'utf8');
  must(text === '' || (text.endsWith('\n') && !text.split('\n').slice(0,-1).some(x => !x.trim())), 'LEDGER_TRUNCATED');
  return text === '' ? [] : text.slice(0,-1).split('\n').map(parseJSON);
}
function verifyLedgerFiles(ledger, evidenceRoot, a) {
  must(a && Array.isArray(ledger) && ledger.length % 2 === 0, 'LEDGER_PAIR_COUNT');
  const expected = [];
  // Validate every row before forming any path or reading any result.
  for (let i = 0; i < ledger.length; i++) {
    const row = ledger[i], index = Math.floor(i/2) + 1;
    must(row && typeof row === 'object' && row.state === (i % 2 ? 'COMPLETED' : 'CONSUMED')
      && Number.isSafeInteger(row.request_index) && row.request_index === index && index <= a.rehearsal.phases.length
      && row.phase === a.rehearsal.phases[index-1] && row.run_id === a.run_id, 'LEDGER_SCHEMA_SEQUENCE');
    must(/^[a-f0-9]{64}$/.test(row.digest || ''), 'LEDGER_DIGEST');
    if (i % 2 === 0) { utc(row.consumed_at, 'CONSUMED_AT'); expected.push(String(index).padStart(2,'0') + '-' + row.phase); }
    else {
      must(row.digest === ledger[i-1].digest && row.result === 'PASS' && /^[a-f0-9]{64}$/.test(row.result_sha256 || ''), 'LEDGER_COMPLETION');
      must(utc(row.completed_at,'COMPLETED_AT') >= utc(ledger[i-1].consumed_at,'CONSUMED_AT'), 'LEDGER_TIME');
    }
  }
  const attempts = path.join(evidenceRoot,'requests');
  const actual = fs.existsSync(attempts) ? fs.readdirSync(attempts).sort() : [];
  if (fs.existsSync(attempts)) beneath(evidenceRoot, attempts, 'ATTEMPTS_PATH');
  must(equal(actual, expected.sort()), 'LEDGER_DIRECTORY_RECONCILIATION');
  for (const row of ledger.filter(x => x.state === 'COMPLETED')) {
    const dir = path.join(attempts, String(row.request_index).padStart(2,'0') + '-' + row.phase);
    must(fs.lstatSync(dir).isDirectory() && !fs.lstatSync(dir).isSymbolicLink(), 'ATTEMPT_DIRECTORY');
    beneath(evidenceRoot, dir, 'ATTEMPT_PATH');
    const file = path.join(dir,'phase-result.json'); beneath(evidenceRoot,file,'RESULT_PATH');
    must(sha(fs.readFileSync(file)) === row.result_sha256, 'LEDGER_RESULT_HASH');
    const result = json(file);
    must(result.kind === 'A9_BATCH2_PHASE_RESULT' && result.status === 'PASS' && result.run_id === a.run_id
      && result.phase === row.phase && result.request_index === row.request_index, 'LEDGER_RESULT_BINDING');
  }
}
function consume(bytes, _unused, ctx, plan, request, ledger, observed, activation, env, now = Date.now()) {
  const v = validateExecution(bytes, ctx, plan, now), a = v.authority, r = a.rehearsal;
  verifyActivation(v, activation, ctx, now);
  must(!fs.existsSync(path.join(ctx.budget.evidence_root, 'rehearsal-stop.json')), 'PREVIOUS_EXTERNAL_FAILURE');
  verifyLedgerFiles(ledger, ctx.budget.evidence_root, a);
  const deadline = Math.min(v.end, v.confirmed + (r.r1_start_max_seconds + r.max_total_seconds) * 1000);
  must(now < Math.min(deadline - r.cleanup_reserve_seconds * 1000,
    v.confirmed + (r.r1_start_max_seconds + r.stop_dispatch_after_seconds) * 1000), 'DISPATCH_STOP');
  const phase = request.phase;
  requireGpuGate(ctx,phase,ctx.budget.evidence_root, v.pin);
  must(r.phases.includes(phase), 'PHASE_OUTSIDE_PLAN');
  must(now + (r.phase_ceiling_seconds[phase] + r.cleanup_reserve_seconds) * 1000 <= deadline, 'INSUFFICIENT_TIME');
  must(request.run_id === a.run_id && request.evidence_root === ctx.budget.evidence_root && request.candidate_root === ctx.budget.candidate_root, 'REQUEST_RUN_ROOT');
  must(Array.isArray(ledger), 'LEDGER');
  const consumed = ledger.filter(x => x.state === 'CONSUMED');
  must(ledger.every(x => ['CONSUMED', 'COMPLETED'].includes(x.state) && x.run_id === a.run_id), 'LEDGER_RUN_STATE');
  must(consumed.length < r.max_phase_requests, 'REQUEST_CAP');
  must(consumed.every((x, i) => x.request_index === i + 1 && x.phase === r.phases[i]), 'LEDGER_SEQUENCE');
  must(!consumed.some(x => x.phase === phase), 'PHASE_ALREADY_CONSUMED');
  must(!ledger.some(x => x.state === 'COMPLETED' && x.result !== 'PASS'), 'FAILURE_STOPS_RUN');
  must(consumed.length * 2 === ledger.length, 'UNCOMPLETED_OR_DUPLICATE');
  for (const old of consumed) {
    const done = ledger.filter(x => x.state === 'COMPLETED' && x.request_index === old.request_index && x.phase === old.phase && x.digest === old.digest);
    must(done.length === 1 && done[0].result === 'PASS', 'LEDGER_COMPLETION');
  }
  must(request.request_index === consumed.length + 1 && phase === r.phases[consumed.length], 'PHASE_SEQUENCE');
  must(observed && sameMachine(observed.machine_name, a.target.machine_name) && observed.account_sid === a.target.account_sid, 'ACTUAL_TARGET');
  must(observed.integrity_level === 'Medium' && observed.elevated === false && Number.isSafeInteger(observed.session_id)
    && observed.session_id > 0 && observed.session_id === observed.active_console_session_id
    && observed.session_id === r.target_session_id && observed.console_state === 'Active', 'ORDINARY_ACTIVE_CONSOLE');
  must(typeof observed.in_job === 'boolean', 'IN_JOB_UNKNOWN');
  must(Math.abs(now - utc(observed.observed_at_utc, 'OBSERVED')) <= 30000, 'STALE_IDENTITY');
  must(request.target && sameMachine(request.target.machine_name, a.target.machine_name) && request.target.account_sid === a.target.account_sid, 'REQUEST_AUTHORITY_TARGET');
  for (const k of ['machine_name', 'account_sid', 'integrity_level', 'session_id', 'elevated', 'in_job']) must(request.target[k] === observed[k], 'REQUEST_ACTUAL:' + k);
  must(request.target.account_name === observed.machine_name + '\\' + ctx.budget.target_record.account_name, 'ACCOUNT_NAME');
  for (const [k, value] of Object.entries(expectedEnvironment(a))) must(env[k] === value, 'ENV:' + k);
  must(observed.product_user_data === path.win32.join(env.LOCALAPPDATA, 'Win7CodingAgent'), 'USER_DATA');
  for (const k of ['source_commit', 'package_sha256', 'manifest_sha256', 'kit_sha256']) must(request.bindings[k] === a.candidate[k], 'REQUEST_BINDING:' + k);
  must(request.bindings.release_authority_sha256 === v.pin, 'REQUEST_PIN');
  const issued = utc(request.issued_at, 'ISSUED'), expires = utc(request.expires_at, 'EXPIRES');
  must(issued <= now && now < expires && expires > issued && expires - issued <= r.request_ttl_seconds * 1000, 'REQUEST_TTL');
  return { ok: true, stage: 'consume', evidence_class: classification(ctx), phase, authority_sha256: v.pin, common_deadline_utc: new Date(deadline).toISOString() };
}
// Developer-side admission only. Actual request creation and full identity/consume stay in the ordinary agent task.
function consumeDispatch(bytes, _unused, ctx, phase, activation, ledger, snapshotRoot, submitted, now = Date.now()) {
  const v = validateExecution(bytes, ctx, 'FULL', now), a = v.authority, r = a.rehearsal;
  verifyActivation(v, activation, ctx, now);
  const index = r.dispatch_stages.indexOf(phase);
  must(index >= 0 && submitted.length === index && submitted.every((x, i) => x === r.dispatch_stages[i]), 'DISPATCH_SEQUENCE');
  verifyLedgerFiles(ledger, snapshotRoot, a);
  const productBefore=r.dispatch_stages.slice(0,index).filter(p=>r.phases.includes(p)).length;
  must(ledger.length === productBefore * 2, 'DISPATCH_LEDGER_COUNT');
  if(index>phasePlan.fromBudget(ctx.budget).gateIndex)requireGpuGate(ctx,phase,snapshotRoot,v.pin);
  if(phase==='gpu-entry-gate')must(!fs.existsSync(path.join(snapshotRoot,'gpu-entry-gate/gate-result.json')),'GATE_ALREADY_COMPLETED');
  const deadline = Math.min(v.end, v.confirmed + (r.r1_start_max_seconds + r.max_total_seconds) * 1000);
  must(now < Math.min(deadline - r.cleanup_reserve_seconds * 1000,
    v.confirmed + (r.r1_start_max_seconds + r.stop_dispatch_after_seconds) * 1000), 'DISPATCH_STOP');
  must(now + ((phase==='gpu-entry-gate'?r.gate_ceiling_seconds:r.phase_ceiling_seconds[phase]) + r.cleanup_reserve_seconds) * 1000 <= deadline, 'INSUFFICIENT_TIME');
  return { ok: true, stage: 'consume-dispatch', phase, stage_index:index+1, request_index:phase==='gpu-entry-gate'?null:productBefore+1, category:phase==='gpu-entry-gate'?'gate':'product',
    evidence_class: classification(ctx), ordinary_identity_and_full_consume: 'REQUIRED_IN_AGENT_TASK' };
}
function requireGpuGate(ctx,phase,root,pin) {
  if(!phasePlan.fromBudget(ctx.budget).afterGate.includes(phase))return;
  const file=path.join(root,'gpu-entry-gate/gate-result.json');
  must(fs.existsSync(file),'GPU_GATE_MISSING');beneath(root,file,'GPU_GATE_PATH');
  const result=json(file);
  must(result.kind==='REHEARSAL4_GPU_ENTRY_GATE' && result.run_id===ctx.budget.run_id && result.stage_index===phasePlan.fromBudget(ctx.budget).gateIndex+1 && result.product_request_index===null && result.status==='PASS' && result.evidence_class===classification(ctx) && result.consecutive_success===false && result.product_failure===false,'GPU_GATE_NOT_PASS');
  if(pin)must(result.authority_sha256===pin,'GPU_GATE_AUTHORITY_PIN');
  must(require('./gpu-contract.cjs').classify(result.facts).status==='PASS','GPU_GATE_FIELDS');
}
module.exports = { classification, verifyPlan, sha, parseJSON, json, encode, inputs, toolPins,
  activationPaths, verifyRoots, readLedger, presign, validateExecution, extractFrozen, verifyFrozen,
  activate, consume, consumeDispatch, expectedEnvironment, verifyPhysicalIsolation, verifyLedgerFiles,
  requireGpuGate };
if (require.main === module) throw Error('REHEARSAL_GATE:MODULE_ONLY');
