'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const c = require('../run-context.cjs');
const phases = require('../phase-plan.cjs');
const runtime = require('../remote-inputs.cjs');
const target = require('../target-binding.cjs');
const admission = require('../admission.cjs');
const local = require('../local-entry.cjs');
const gate = require('../rehearsal-gate.cjs');
const gpu = require('../gpu-contract.cjs');
const source = path.resolve(__dirname, '..');
const repo = path.resolve(__dirname, '../../../../../..');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const clone = x => JSON.parse(JSON.stringify(x));
const now = Date.parse('2026-10-30T12:00:00.000Z');
const temporary = [];
function temp() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a9-p2-controller-')));
  temporary.push(dir); return dir; // Retained: this task does not authorize deletion.
}
function fixture(evidenceClass = 'DEV_CHANNEL', id = crypto.randomUUID()) {
  const d = c.descriptor(id, evidenceClass), roots = c.roots(d);
  const budget = {
    run_id: id, new_remote_root: roots.run_root, ...Object.fromEntries(Object.entries(roots).filter(([k]) => /_root$/.test(k))),
    target_machine: 'TEST-ONLY-HOST', target_sid: 'S-1-5-21-1-2-3-1001',
    target_record: { machine_name: 'TEST-ONLY-HOST', account_sid: 'S-1-5-21-1-2-3-1001', account_name: 'agent' },
    selected_plan: 'FULL',
    p1: { plan: 'FULL', phases: phases.PRODUCTS.slice(), dispatch_stages: phases.DISPATCH.slice(),
      gate_requests: 1, max_phase_requests: phases.PRODUCTS.length, gate_ceiling_seconds: 120,
      phase_ceiling_seconds: Object.fromEntries(phases.PRODUCTS.map(p => [p, 100])),
      target_session_id: 2, remote_root: roots.run_root, ssh_host: d.ssh_host, evidence_class: evidenceClass,
      max_real_model_requests: 0, r1_start_max_seconds: 300, request_ttl_seconds: 180,
      cleanup_reserve_seconds: 120, stop_dispatch_after_seconds: 2470, max_total_seconds: 2590,
      sftp_upload_sessions: 3, sftp_download_sessions: 3, ssh_control_sessions: 31,
      total_ssh_transport_sessions: 37, execution_ssh_sessions: 31, normal_execution_ssh_sessions: 28,
      ssh_allocation: { R1: 1, R2: 1, R3: 4, R4: 1, R5_R6: 22, R7: 1, R8: 1 } },
    candidate_wall_budget: { from_first_request_to_last_completion_max_seconds: 1000, kit_max_wall_seconds: 2000 },
    transfer_planning: { upload_state_query_max_sessions: 2, upload_state_query_seconds: 120 },
    budget_derivation: { register: 660, runwait: 1120, transport_overhead: 660,
      r1_r2_upload_verify: 10, expand: 10, local_processing: 10, dispatch: 2470, total: 2590 },
  };
  const facts = { source_commit: hash('TEST_ONLY_SOURCE').slice(0, 40), helper_sha256: hash('TEST_ONLY_HELPER'),
    formal_input_lock_sha256: hash('TEST_ONLY_LOCK'),
    approval_registry: { commit: hash('TEST_ONLY_APPROVAL').slice(0, 40), sha256: hash('TEST_ONLY_REGISTRY') },
    builds: [{ zip_top: 'TEST_ONLY_PRODUCT', zip_entries: 1, zip_entries_sha256: hash('TEST_ONLY_ENTRIES'), sha256: hash('TEST_ONLY_PACKAGE'), manifest_sha256: hash('TEST_ONLY_MANIFEST'), kit_sha256: hash('TEST_ONLY_KIT') }] };
  const data = { schema_version: 1, execution_layout: clone(c.LAYOUT), descriptor: d,
    window: { starts_at_utc: '2026-10-30T11:00:00.000Z', expires_at_utc: '2026-10-30T14:00:00.000Z' }, budget, facts };
  const ctx = c.context(d, path.join(os.tmpdir(), 'TEST_ONLY_NO_IO'), data);
  const binding = { schema_version: 1, kind: 'WIN7_56_EXECUTION_BINDING', evidence_class: evidenceClass, run_id: id,
    formal_input_lock_sha256: facts.formal_input_lock_sha256, approval_registry: facts.approval_registry,
    candidate: { source_commit: facts.source_commit, package_sha256: facts.builds[0].sha256,
      manifest_sha256: facts.builds[0].manifest_sha256, kit_sha256: facts.builds[0].kit_sha256, helper_sha256: facts.helper_sha256 },
    target: { machine_name: budget.target_machine, account_sid: budget.target_sid } };
  const bytes = c.encode(binding); ctx.executionBindingSha256 = hash(bytes);
  return { ctx, data, binding, bytes };
}
function probe(ctx) {
  return { run_root: ctx.descriptor.remote_root, run_directory_exists: false, a9_dev_tasks: 0,
    channel_processes: 0, lock_idle: true, ancestors_non_reparse: true,
    machine_name: ctx.budget.target_machine, account_sid: ctx.budget.target_sid,
    session_id: ctx.budget.p1.target_session_id, console_active: true, logonui_present: false };
}
function inputOptions(f) {
  const executionToolsManifestBytes=c.encode({schema_version:1,source_commit:f.ctx.facts.source_commit,files:require('../execution-tools.cjs').pins()});
  const runContextBytes=c.encode(f.ctx.data),phasePlanBytes=c.encode(phases.fromBudget(f.ctx.budget));
  return {executionToolsManifestBytes,runContextBytes,phasePlanBytes,inputBindings:{
    execution_tools_manifest_sha256:hash(executionToolsManifestBytes),run_context_sha256:hash(runContextBytes),
    phase_plan_sha256:hash(phasePlanBytes),target:{session_id:f.ctx.budget.p1.target_session_id}}};
}
function localOptions(f) {
  return { ...inputOptions(f), mode: f.ctx.mode, runId: f.binding.run_id, executionBindingBytes: f.bytes, ledgerDir: temp(), now,
    developmentScope: { execution_inputs:inputOptions(f).inputBindings, schema_version: 1, authorization: 'A9-43/ENGINEERING_03-r2',
      source_commit: f.ctx.facts.source_commit, account_sid: f.binding.target.account_sid,
      machine_name: f.binding.target.machine_name, expires_at_utc: f.ctx.window.expires_at_utc,
      max_requests: 10, max_wall_seconds: 2590, max_real_model_requests: 0 } };
}
function formalOptions(f) {
  const denyBytes = c.encode({ schema_version: 1, namespace: 'a9-win7-execution-run-prefix8', revision: 1,
    previous: null, match: { algorithm: 'sha256', input: 'lowercase-uuid-v4-prefix8-utf8' },
    denied_prefix_sha256: [], provenance: ['TEST_ONLY_SYNTHETIC_NOT_A_SEED'] });
  const payload = { schema_version: 1, kind: 'WIN7_56_GATE_A_PAYLOAD', run_id: f.binding.run_id,
    execution_layout: clone(c.LAYOUT), evidence_class: f.ctx.mode, formal_input_lock_sha256: f.binding.formal_input_lock_sha256,
    approval_registry: f.binding.approval_registry, candidate: f.binding.candidate, target: {...f.binding.target,session_id:f.ctx.budget.p1.target_session_id},
    execution_tools_manifest_sha256:inputOptions(f).inputBindings.execution_tools_manifest_sha256,
    run_context_sha256:inputOptions(f).inputBindings.run_context_sha256,phase_plan_sha256:inputOptions(f).inputBindings.phase_plan_sha256,
    execution_binding: { path: 'TEST_ONLY_BINDING.json', sha256: hash(f.bytes) },
    deny_set: { path: 'TEST_ONLY_DENY.json', bytes: denyBytes.length, sha256: hash(denyBytes), revision: 1,
      trusted_previous_sha256: null, initial_baseline_sha256: hash(denyBytes) },
    window: f.ctx.window, budget: { max_requests: 10, max_wall_seconds: 2590, max_real_model_requests: 0 } };
  const payloadBytes = c.encode(payload), pin = hash(payloadBytes);
  const receiptBytes = c.encode({ schema_version: 1, status: 'OWNER_CONFIRMED_FINAL_SHA', signed: true,
    run_id: f.binding.run_id, owner_reply_verbatim: '批准本次测试合成载荷 SHA-256 ' + pin, independent_pin: pin,
    owner_receipt_utc: f.ctx.window.starts_at_utc, expires_at_utc: f.ctx.window.expires_at_utc,
    confirmation_utc: '2026-10-30T11:05:00.000Z' });
  return { ...inputOptions(f), mode: f.ctx.mode, executionBindingBytes: f.bytes, runId: f.binding.run_id, payloadBytes,
    payloadSha256: pin, receiptBytes, denySetBytes: denyBytes, ledgerDir: temp(), now };
}

test('both evidence classes share the same layout, plan, limits and target checks', () => {
  const dev = fixture(), formal = fixture('FORMAL_GATE_A_EXECUTION', dev.binding.run_id);
  const normalized = f => JSON.parse(JSON.stringify(f.data).split(f.ctx.mode).join('RUN_CLASS'));
  assert.deepEqual(normalized(dev), normalized(formal));
  for (const f of [dev, formal]) {
    assert.equal(target.verify(f.bytes, hash(f.bytes), f.ctx, now).run_id, f.binding.run_id);
    assert.equal(gate.presign(f.binding, f.ctx, 'FULL').ok, true);
    assert.equal(admission.admit(f.ctx, probe(f.ctx)).ok, true);
    gpu.verifyOrdinaryBinding({ ...f.binding, rehearsal: f.ctx.budget.p1 }, 2, f.binding.target.machine_name);
    assert.throws(() => gpu.verifyOrdinaryBinding({ ...f.binding, rehearsal: f.ctx.budget.p1 }, 3, f.binding.target.machine_name), /SESSION/);
  }
});

test('local entry calls P1: development needs scope; formal needs receipt/pin/deny set', () => {
  const dev = fixture(), formal = fixture('FORMAL_GATE_A_EXECUTION', dev.binding.run_id);
  const d = local.prepare(dev.ctx, localOptions(dev));
  const f = local.prepare(formal.ctx, formalOptions(formal));
  assert.equal(d.authority.reservation.record.deny_set_sha256, null);
  assert.match(f.authority.reservation.record.deny_set_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(d.files), Object.keys(f.files));
  assert.equal(Object.keys(f.files).some(n => /receipt|deny-set|gate-a-payload/i.test(n)), false);
  const badFormal = formalOptions(formal); delete badFormal.receiptBytes;
  assert.throws(() => local.prepare(formal.ctx, badFormal), /RECEIPT_REQUIRED/);
  const badDev = localOptions(dev); delete badDev.developmentScope;
  assert.throws(() => local.prepare(dev.ctx, badDev), /DEV_SCOPE/);
});

test('reservation remains consumed after a failed later run and rejects a prefix collision', () => {
  const f = fixture(), options = localOptions(f);
  local.prepare(f.ctx, options);
  assert.throws(() => local.prepare(f.ctx, options), /RUN_ALREADY_RESERVED/);
  const other = crypto.randomUUID(), colliding = f.binding.run_id.slice(0, 8) + other.slice(8);
  const next = fixture('DEV_CHANNEL', colliding);
  assert.throws(() => local.prepare(next.ctx, { ...localOptions(next), ledgerDir: options.ledgerDir }), /RUN_ALREADY_RESERVED/);
});

test('source hashes and generated PowerShell/XML are unchanged by run/class/session/budget data', () => {
  const before = runtime.sourcePins(), a = fixture(), b = fixture('FORMAL_GATE_A_EXECUTION');
  b.data.budget.p1.target_session_id = 5;
  b.data.budget.p1.phase_ceiling_seconds['p01-env'] = 90;
  b.ctx = c.context(b.data.descriptor, b.ctx.prep, b.data);
  const aa = runtime.files(a.ctx), bb = runtime.files(b.ctx);
  assert.notDeepEqual(aa['external/runtime-data.json'], bb['external/runtime-data.json']);
  assert.notDeepEqual(aa['external/RUN_CONTEXT.json'], bb['external/RUN_CONTEXT.json']);
  for (const name of Object.keys(aa).filter(n => /\.(?:cjs|js|ps1|cs|xml)$/.test(n))) assert.deepEqual(aa[name], bb[name], name);
  assert.deepEqual(c.runtimePS(a.ctx.descriptor), c.runtimePS(b.ctx.descriptor));
  for (const phase of phases.DISPATCH) assert.equal(phases.task(a.ctx.budget, 'tasks/' + phase + '.xml'), phases.task(b.ctx.budget, 'tasks/' + phase + '.xml'));
  assert.deepEqual(runtime.sourcePins(), before);
});

for (const [key, invalid, error] of [
  ['run_directory_exists', true, /RUN_DIRECTORY/], ['a9_dev_tasks', 1, /A9_DEV_TASKS/],
  ['channel_processes', 1, /CHANNEL_PROCESSES/], ['lock_idle', false, /LOCK/],
]) test('ADR-0305 admission refuses ' + key, () => {
  for (const klass of c.CLASSES) {
    const { ctx } = fixture(klass), facts = probe(ctx);
    facts[key] = invalid; assert.throws(() => admission.admit(ctx, facts), error);
    delete facts[key]; assert.throws(() => admission.admit(ctx, facts), error);
  }
});

test('admission retains identity, Session and reparse hard gates without close', () => {
  const { ctx } = fixture();
  for (const patch of [{ account_sid: 'wrong' }, { session_id: 3 }, { console_active: false }, { logonui_present: true }, { ancestors_non_reparse: false }])
    assert.throws(() => admission.admit(ctx, { ...probe(ctx), ...patch }), /IDENTITY|SESSION|ANCESTORS/);
  assert.doesNotMatch(fs.readFileSync(path.join(source, 'admission.cjs'), 'utf8'), /close|stop\.ps1|unlink|Terminate/);
});

test('target closure never imports local authority modules or reads receipts/deny sets', () => {
  for (const name of runtime.sourceNames().filter(n => /\.(cjs|js|ps1)$/.test(n))) {
    const text = fs.readFileSync(runtime.sourceFile(name), 'utf8');
    assert.doesNotMatch(text, /OWNER_RECEIPT|deny-set\.cjs|validateReceipt|validateFormal|require\(['"][^'"]*(?:local-entry|finalize-signing|authority\.cjs)['"]\)/, name);
  }
  const f = fixture('FORMAL_GATE_A_EXECUTION');
  assert.equal(target.verify(f.bytes, hash(f.bytes), f.ctx, now).kind, 'WIN7_56_EXECUTION_BINDING');
});

test('binding rejects tampering, old CANDIDATE/release authority identity, stale source and expiration', () => {
  const f = fixture();
  assert.throws(() => target.verify(Buffer.concat([f.bytes, Buffer.from(' ')]), hash(f.bytes), f.ctx, now), /REQUEST_SHA/);
  for (const kind of ['CANDIDATE', 'WIN7_55_RELEASE_AUTHORITY']) {
    const bytes = c.encode({ ...f.binding, kind }); assert.throws(() => target.verify(bytes, hash(bytes), f.ctx, now), /KIND/);
  }
  const bytes = c.encode({ ...f.binding, candidate: { ...f.binding.candidate, source_commit: hash('OTHER_SOURCE').slice(0, 40) } });
  assert.throws(() => target.verify(bytes, hash(bytes), f.ctx, now), /CANDIDATE_BINDING/);
  assert.throws(() => target.verify(f.bytes, hash(f.bytes), f.ctx, Date.parse(f.ctx.window.expires_at_utc)), /WINDOW/);
  assert.throws(() => gate.parseJSON('{"kind":1,"k\\u0069nd":2}'), /DUPLICATE_KEY/);
});

test('old W46 roots, traversal, ADS, prefix lookalikes and relay hosts are refused', () => {
  const f = fixture();
  for (const root of ['C:\\A9-W46\\run\\' + f.binding.run_id.slice(0, 8), f.ctx.descriptor.remote_root + '-other',
    f.ctx.descriptor.remote_root + '\\..', f.ctx.descriptor.remote_root + ':stream']) {
    assert.throws(() => c.validate({ ...f.ctx.descriptor, remote_root: root }), /PATH_OR_TASK_PREFIX/);
  }
  assert.throws(() => c.descriptor(f.binding.run_id, 'DEV_CHANNEL', 'RELAY_NOT_ALLOWED'), /SSH_HOST/);
  for (const value of ['../x', '/x', 'tools/x:stream', 'tools//x', 'tools/..']) assert.throws(() => runtime.safeName(value), /PATH/);
  const nested = clone(f.data); nested.budget.candidate_root = path.win32.join(f.ctx.budget.evidence_root, 'p');
  assert.throws(() => c.context(nested.descriptor, f.ctx.prep, nested), /ROOT_LAYOUT/);
});

test('FULL order and scheduler limits cannot be weakened by input data', () => {
  const f = fixture();
  const reordered = clone(f.data); reordered.budget.p1.phases.reverse();
  assert.throws(() => c.context(reordered.descriptor, f.ctx.prep, reordered), /FULL_ORDER/);
  const tooLong = clone(f.data); tooLong.budget.p1.phase_ceiling_seconds['p09-report'] = 301;
  assert.throws(() => c.context(tooLong.descriptor, f.ctx.prep, tooLong), /TIMEOUT/);
  const omitted = clone(f.data); delete omitted.budget.p1.target_session_id;
  assert.throws(() => c.context(omitted.descriptor, f.ctx.prep, omitted), /TARGET_SESSION/);
});

test('both classes reject the other class binding without any target authorization read', () => {
  const a = fixture(), b = fixture('FORMAL_GATE_A_EXECUTION', a.binding.run_id);
  assert.throws(() => target.verify(a.bytes, hash(a.bytes), b.ctx, now), /RUN_CLASS/);
  assert.throws(() => target.verify(b.bytes, hash(b.bytes), a.ctx, now), /RUN_CLASS/);
});

test('programmatic controller requires an injected executor before reading any input', () => {
  let spawned = false;
  assert.throws(() => require('../run-rehearsal.cjs').run({}), /INJECTED_EXECUTOR_REQUIRED/);
  assert.equal(spawned, false);
});

test('current packaged cleanup refuses unbound root-external descendants before any termination', () => {
  const smoke = require(path.join(repo, 'release/win7-product-v3/a9-batch2-smoke.cjs'));
  const f = fixture(), container = f.ctx.descriptor.remote_root, runRoot = container + '\\e', candidateRoot = container + '\\p';
  const runtime = { electronPath: runRoot + '\\driver-electron\\electron.exe' };
  const row = (pid, parent, image, second) => ({ ProcessId: String(pid), ParentProcessId: String(parent), Name: path.win32.basename(image),
    ExecutablePath: image, SessionId: '2', CreationDate: '202610301200' + String(second).padStart(2, '0') + '.123400+000' });
  const rows = [row(90, 80, 'C:\\Windows\\System32\\services.exe', 0), row(100, 90, runtime.electronPath, 1),
    row(200, 100, 'C:\\Windows\\System32\\calc.exe', 2)];
  const sid = 'S-1-5-21-1708701742-428676696-1831205153-1001', killed = [];
  const ctx = { runId: f.binding.run_id, phase: 'p05-session-bg', runRoot, candidateRoot, attemptDir: temp(),
    request: { target: { account_sid: sid, machine_name: 'DCCS-CHAIZL-PC', session_id: 2 },
      expires_at: new Date(Date.now() + 60000).toISOString(), evidence_root: runRoot, candidate_root: candidateRoot,
      bindings: { source_commit: hash('TEST_ONLY_SOURCE').slice(0, 40) } } };
  const exec = name => {
    if (name === 'wmic_process_commands') return { status: 0, stdout: rows.map(r => 'CommandLine=\r\nProcessId=' + r.ProcessId + '\r\n\r\n').join('') };
    assert.equal(name, 'wmic_processes');
    const keys = ['CreationDate', 'ExecutablePath', 'Name', 'ParentProcessId', 'ProcessId', 'SessionId'];
    return { status: 0, stdout: 'Node,' + keys.join(',') + '\r\n' + rows.map(r => 'TEST_ONLY,' + keys.map(k => r[k]).join(',')).join('\r\n') + '\r\n' };
  };
  const owner = (pid, expected) => {
    const r = rows.find(x => Number(x.ProcessId) === pid);
    if (expected) killed.push(pid);
    return { status: 'FACTS', identity: { ...smoke.cleanupIdentity({ ...r, ImagePath: r.ExecutablePath, ImageSource: 'executable_path' }), sid } };
  };
  const scope = smoke.createCleanupScope(ctx, runtime, 'release_exit', { exec, owner, pause() {}, hostname: () => 'DCCS-CHAIZL-PC' });
  scope.bind(100);
  assert.throws(() => scope.terminate(100, true), /TARGET_NOT_AUTHORIZED/);
  assert.deepEqual(killed, []);
});

test('shared consume preserves request pin, identity, Session, Medium, Job and TTL gates', () => {
  for (const klass of c.CLASSES) {
    const f = fixture(klass), ctx = f.ctx; ctx.prep = temp(); ctx.executionStartedAt = now - 1000;
    const files = gate.activationPaths(ctx); fs.mkdirSync(files.root);
    const activation = { ok: true, verifier: 'ACCEPTED', run_id: f.binding.run_id,
      authority_sha256: hash(f.bytes), started_at_utc: new Date(ctx.executionStartedAt).toISOString(),
      common_deadline_utc: new Date(ctx.executionStartedAt + (ctx.budget.p1.r1_start_max_seconds + ctx.budget.p1.max_total_seconds) * 1000).toISOString() };
    const raw = c.encode(activation); fs.writeFileSync(files.file, raw);
    fs.writeFileSync(files.anchor, c.encode({ schema_version: 1, run_id: f.binding.run_id, authority_sha256: hash(f.bytes), activation_sha256: hash(raw) }));
    const env = gate.expectedEnvironment({ rehearsal: ctx.budget.p1 });
    const observed = { ...f.binding.target, integrity_level: 'Medium', elevated: false, session_id: 2,
      active_console_session_id: 2, console_state: 'Active', in_job: false,
      observed_at_utc: new Date(now).toISOString(), product_user_data: path.win32.join(env.LOCALAPPDATA, 'Win7CodingAgent') };
    const request = { phase: 'p01-env', run_id: f.binding.run_id, request_index: 1,
      candidate_root: ctx.budget.candidate_root, evidence_root: ctx.budget.evidence_root,
      target: { ...observed, account_name: 'agent' }, bindings: { ...f.binding.candidate, release_authority_sha256: hash(f.bytes) },
      issued_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 10000).toISOString() };
    const consume = (r = request, o = observed) => gate.consume(f.bytes, null, ctx, 'FULL', r, [], o, activation, env, now);
    assert.equal(consume().ok, true);
    for (const patch of [{ account_sid: 'wrong' }, { integrity_level: 'High' }, { elevated: true },
      { session_id: 3, active_console_session_id: 3 }, { in_job: 'UNKNOWN' }]) assert.throws(() => consume(request, { ...observed, ...patch }), /ACTUAL_TARGET|ORDINARY_ACTIVE_CONSOLE|IN_JOB_UNKNOWN/);
    assert.throws(() => consume({ ...request, bindings: { ...request.bindings, release_authority_sha256: hash('tamper') } }), /REQUEST_PIN/);
    assert.throws(() => consume({ ...request, expires_at: new Date(now).toISOString() }), /REQUEST_TTL/);
    assert.throws(() => consume({ ...request, candidate_root: ctx.budget.evidence_root }), /REQUEST_RUN_ROOT/);
  }
});

test('assembled closure reloads through its deployed shared modules and rejects changed run data', () => {
  const f = fixture(), at = Date.now();
  f.data.window = { starts_at_utc: new Date(at - 60000).toISOString(), expires_at_utc: new Date(at + 7200000).toISOString() };
  const out = path.join(temp(), 'projection');
  const result = require('../make-run.cjs').make(f.data, f.bytes, out, at);
  assert.equal(result.status, 'PREPARED_NOT_AUTHORIZED');
  const deployedGate = require(path.join(out, 'tools/rehearsal-gate.cjs'));
  const deployed = deployedGate.inputs(out);
  assert.equal(deployed.executionBindingSha256, hash(f.bytes));
  assert.equal(deployed.descriptor.run_id, f.binding.run_id);
  const file = path.join(out, 'external/runtime-data.json');
  fs.appendFileSync(file, ' ');
  assert.throws(() => deployedGate.inputs(out), /INPUT_HASH/);
});

test('fixed PS reader grammar accepts emitted JSON and rejects executable/duplicate suffixes', () => {
  // This checks the actual emitted grammar on the development machine, not PowerShell parsing.
  const ps = fs.readFileSync(path.join(source, 'runtime.ps1'), 'utf8'), definitions = {};
  for (const name of ['phaseList', 'dispatchList', 'pattern']) {
    const line = ps.split('\n').find(l => l.startsWith('$' + name + ' = ')).slice(name.length + 4);
    definitions[name] = Array.from(line.matchAll(/'([^']*)'|\$(phaseList|dispatchList)/g)).map(m => m[2] ? definitions[m[2]] : m[1]).join('');
  }
  const pattern = new RegExp(definitions.pattern.replace('\\A', '^').replace('\\z', '(?![\\s\\S])'));
  const f = fixture(), projection = JSON.stringify(c.runtimeData(f.ctx)) + '\n';
  assert.equal(pattern.test(projection), true);
  assert.equal(pattern.test(projection + 'Start-Process anything'), false);
  assert.equal(pattern.test(projection.replace('"schema_version":1', '"schema_version":1,"schema_version":1')), false);
  assert.doesNotMatch(ps.split('\n').filter(line => !line.trim().startsWith('#')).join('\n'), /Invoke-Expression|ConvertFrom-Json|\[pscustomobject\]|\$PSScriptRoot/);
});

test.after(() => { process.stdout.write('# retained_test_directories=' + JSON.stringify(temporary) + '\n'); });

// These are local orchestration tests with an in-memory SSH/PowerShell/SFTP executor.
// They do not interpret PowerShell/C# or prove actual target ZIP/Scheduler/desktop behavior.
function migrationFixture(klass='DEV_CHANNEL') {
  const f=fixture(klass),root=temp(),repo=path.join(root,'repo');fs.mkdirSync(repo);
  f.ctx.repo=repo;
  const zip=Buffer.from('SYNTHETIC_ZIP_NOT_A_PRODUCT'),lock=Buffer.from('SYNTHETIC_LOCK'),registry=Buffer.from('SYNTHETIC_REGISTRY');
  const entries=Buffer.from(hash(zip)+'\t'+zip.length+'\tTEST_ONLY_PRODUCT/test.txt\n');
  Object.assign(f.data.facts.builds[0],{zip:'candidate.zip',bytes:zip.length,sha256:hash(zip),zip_entries_sha256:hash(entries)});
  f.data.facts.formal_input_lock_sha256=hash(lock);f.data.facts.approval_registry.sha256=hash(registry);
  f.binding.formal_input_lock_sha256=hash(lock);f.binding.candidate.package_sha256=hash(zip);f.bytes=c.encode(f.binding);
  Object.assign(f.data.budget.p1,{download_max_files:1000,download_max_bytes:10000000});
  Object.assign(f.data.budget.transfer_planning,{upload_max_bytes:10000000,upload_max_files:100});
  f.ctx=c.context(f.data.descriptor,path.join(repo,'prepared'),f.data);f.ctx.repo=repo;
  fs.writeFileSync(path.join(repo,'candidate.zip'),zip);
  require('../make-run.cjs').make(f.data,f.bytes,f.ctx.prep,now);
  fs.writeFileSync(path.join(f.ctx.prep,'external/a9-batch2-input-lock.json'),lock);
  fs.writeFileSync(path.join(f.ctx.prep,'external/a9-v26-approved-build-kits.json'),registry);
  fs.writeFileSync(path.join(f.ctx.prep,'ZIP_ENTRIES.tsv'),entries);
  f.options=klass==='DEV_CHANNEL'?localOptions(f):formalOptions(f);f.options.lockHolder='TEST_ONLY_HOLDER';
  return f;
}
function fakeExecutor(f,changes={}) {
  const inputs=[],calls=[],remote=new Map(),tasks=new Set(),ledger=[],results=[],codeBytes=[],gpuFacts={identity_complete:true,integrity_complete:true,
    cleanup_complete:true,lifecycle_complete:true,ready:true,window_loaded:true,gpu_launch_failures:0,os_exit_code:0,exit_code:0,close_code:0};
  const key=s=>s.replace(/\\/g,'/'),b64=x=>Buffer.from(x).toString('base64');
  const scan=()=>({positive_control_detected:true,phase2_controls_detected:true,findings:[]});
  const spawned=(command,argv,options)=>{
    if(command==='/usr/bin/sftp') {
      const lines=options.input.toString().trimEnd().split('\n');calls.push(lines[0].startsWith('put ')?'upload':'download');
      for(const line of lines){const m=/^(put|get) ("(?:[^"\\]|\\.)*") ("(?:[^"\\]|\\.)*")$/.exec(line);assert.ok(m,line);
        const a=JSON.parse(m[2]),b=JSON.parse(m[3]);
        if(m[1]==='put')remote.set(key(b),fs.readFileSync(a));
        else {assert.ok(remote.has(key(a)),a);fs.writeFileSync(b,remote.get(key(a)));}
      }
      return {status:0,stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)};
    }
    assert.equal(command,'/usr/bin/ssh');assert.ok(argv.includes('StrictHostKeyChecking=yes'));
    assert.ok(argv[argv.length-1].length<8191,'Windows bootstrap command limit');
    const text=options.input.toString(),split=text.indexOf('\n'),body=Buffer.from(text.slice(0,split),'base64');
    const input=JSON.parse(text.slice(split+1));inputs.push(input);
    const encoded=argv[argv.length-1].split(' ').slice(-1)[0],bootstrap=Buffer.from(encoded,'base64').toString('utf16le');
    assert.match(argv[argv.length-1],/-InputFormat Text -OutputFormat Text/);
    assert.match(bootstrap,/\$input \| ForEach-Object/);
    assert.doesNotMatch(bootstrap+body.toString('utf8'),/\[Console\]::In\.|OpenStandardInput/);
    assert.ok(bootstrap.includes(hash(body)),'fixed source bootstrap hash');codeBytes.push(body);calls.push(input.step+(input.phase?'-'+input.phase:''));
    assert.equal(input.run_id,f.binding.run_id);assert.ok(!body.includes(Buffer.from(f.binding.run_id)));
    if(changes.failStep===input.step) return {status:1,stdout:Buffer.from('{"ok":false,"error":"SYNTHETIC_TARGET_FAILURE"}\n'),stderr:Buffer.alloc(0)};
    let value;
    if(input.step==='R1')value={ok:true,kind:'R1_READ_ONLY',...probe(f.ctx),target_ip:'192.168.1.9',build:'7601',sp1_x64:true,
      channel_parent_exists:true,run_parent_exists:true,free_bytes:100000000000,channel_used_bytes:0,target_utc:new Date(now).toISOString(),...changes.admission};
    else if(input.step==='R2')value={ok:true,step:'R2',created_parent_directories:changes.parents||[]};
    else if(input.step==='R3') {
      const rows=Buffer.from(input.rows_base64,'base64').toString().trimEnd().split('\n');
      const stdout=rows.map(row=>{const v=row.split('\t'),raw=remote.get(key(v[2]));assert.ok(raw,v[2]);return hash(raw)+'\t'+raw.length+'\t'+v[2];}).join('\n')+'\n';
      return {status:0,stdout:Buffer.from(changes.corruptReadback?stdout.replace(/^[a-f0-9]/,'x'):stdout),stderr:Buffer.alloc(0)};
    } else if(input.step==='R4')value={ok:true,step:'R4'};
    else if(input.step==='R5') {assert.ok(remote.has(key(f.ctx.budget.tools_root+'/tasks/'+input.phase+'.xml')));tasks.add(input.phase);value={ok:true,step:'R5'};}
    else if(input.step==='R6') {
      assert.ok(tasks.has(input.phase));tasks.delete(input.phase);
      if(input.phase==='gpu-entry-gate') {
        const data=c.encode({kind:'REHEARSAL4_GPU_ENTRY_GATE',run_id:f.binding.run_id,authority_sha256:hash(f.bytes),
          stage_index:3,product_request_index:null,status:changes.badGpu?'UNKNOWN':'PASS',evidence_class:f.ctx.mode,
          consecutive_success:false,product_failure:false,facts:gpuFacts});
        value={ok:true,kind:'GATE_SNAPSHOT',base64:b64(data)};
      } else {
        const index=phases.PRODUCTS.indexOf(input.phase)+1,result=c.encode({kind:'A9_BATCH2_PHASE_RESULT',status:'PASS',run_id:f.binding.run_id,phase:input.phase,request_index:index});
        results.push({directory:String(index).padStart(2,'0')+'-'+input.phase,base64:b64(result)});
        const row={run_id:f.binding.run_id,phase:input.phase,request_index:index,digest:hash('REQUEST_'+index)};
        ledger.push({...row,state:'CONSUMED',consumed_at:new Date(now).toISOString()},
          {...row,state:'COMPLETED',completed_at:new Date(now).toISOString(),result:'PASS',result_sha256:hash(result)});
        value={ok:true,kind:'PHASE_SNAPSHOT',phase:input.phase,directories:results.map(x=>x.directory),results:results.slice(),
          ledger_base64:b64(ledger.map(x=>JSON.stringify(x)).join('\n')+'\n')};
      }
    } else if(input.step==='R7') {
      const files=new Map(),scans=[];
      for(const phase of ledger.filter(x=>x.state==='COMPLETED').map(x=>x.phase)) {
        const raw=c.encode({phase,evidence_class:f.ctx.mode,listing_failed:false,residue:[],scan:scan(),log_scan:scan(),data_scan:scan(),
          manifest:{files:[]},log_manifest:{files:[]},data_manifest:{files:[]}});
        files.set('e/rehearsal-postflight/'+phase+'.json',raw);scans.push({phase,base64:b64(raw)});
      }
      const seal=c.encode({schema_version:1,kind:'REHEARSAL4_TRACE_SEAL',run_id:f.binding.run_id,status:'PASS',scans:[],trace_scanned_before_download:!changes.badSeal});
      files.set('e/trace-seal.json',seal);
      for(const [name,raw] of files)remote.set(key(f.ctx.budget.new_remote_root+'/'+name),raw);
      value={ok:true,kind:'RECOVERY',owned:true,tree:[...files].map(([name,raw])=>hash(raw)+'\t'+raw.length+'\t'+name),scans,trace_seal_base64:b64(seal)};
    } else if(input.step==='R8') {
      if(changes.foreignToken)return {status:1,stdout:Buffer.from('{"ok":false,"error":"FOREIGN_LOCK_NO_RELEASE"}\n'),stderr:Buffer.alloc(0)};
      for(const phase of input.delete_phases.split(',').filter(Boolean))tasks.delete(phase);
      value={ok:true,lock_idle:true,kind:'POSTFLIGHT',tasks_remaining:tasks.size,processes:changes.residue?[{pid:123}]:[]};
    } else assert.fail('unexpected operation '+input.step);
    return {status:0,stdout:Buffer.from(JSON.stringify(value)+'\n'),stderr:Buffer.alloc(0)};
  };
  return {spawn:spawned,calls,remote,codeBytes,inputs};
}
function executeMigration(f,changes={}) {
  const fake=fakeExecutor(f,changes);
  // R0 uses an explicit synthetic frozen verifier. This does not prove a product ZIP, PE or manifest.
  const extractFrozen=()=>({root:f.ctx.prep,manifest:{},verifyAuthority(_root,_manifest,_zip,_kit,options,io){
    assert.equal(hash(io.readFileSync(options.releaseAuthorityPath)),hash(f.bytes));return {ok:true};}});
  const options={...f.options};
  for(const key of Object.keys(options).filter(k=>k.endsWith('Bytes'))) {
    const file=path.join(f.ctx.prep,key+'.json');fs.writeFileSync(file,options[key]);
    options[key.slice(0,-5)+'Path']=file;delete options[key];
  }
  options.executionBindingPath=path.join(f.ctx.prep,'external/release-authority.json');
  if(f.ctx.mode==='FORMAL_GATE_A_EXECUTION') {
    // Synthetic owner receipt rebinds the synthetic file path; this is never a real approval.
    const payload=JSON.parse(fs.readFileSync(options.payloadPath,'utf8'));
    payload.execution_binding.path=options.executionBindingPath;
    payload.deny_set.path=options.denySetPath;
    const raw=c.encode(payload),pin=hash(raw);fs.writeFileSync(options.payloadPath,raw);options.payloadSha256=pin;
    const receipt=JSON.parse(fs.readFileSync(options.receiptPath,'utf8'));
    receipt.independent_pin=pin;receipt.owner_reply_verbatim='批准本次测试合成载荷 SHA-256 '+pin;
    fs.writeFileSync(options.receiptPath,c.encode(receipt));
  }
  const auth=path.join(f.ctx.prep,'AUTHORIZATION.json');fs.writeFileSync(auth,c.encode(options));
  const result=require('../run-rehearsal.cjs').main([
    '--run-descriptor='+path.join(f.ctx.prep,'external/RUN_DESCRIPTOR.json'),'--authorization='+auth
  ],{repo:f.ctx.repo,now:()=>now,spawn:fake.spawn,extractFrozen});
  return {result,...fake};
}
test('local injected-executor R1-R8 loop: both classes use identical commands, 28 SSH, one upload/download',()=>{
  for(const klass of c.CLASSES) {
    const f=migrationFixture(klass),x=executeMigration(f);
    assert.equal(x.result.status,'PASS',JSON.stringify(x.result.first_failure));
    assert.deepEqual(x.result.submitted_phases,phases.DISPATCH);assert.equal(x.result.preflight_ssh,0);
    const pins=inputOptions(f).inputBindings;
    for(const name of ['execution_tools_manifest_sha256','run_context_sha256','phase_plan_sha256'])assert.equal(x.result.execution_inputs[name],pins[name]);
    assert.deepEqual(x.result.transport,{ssh:28,upload:1,download:1,sftp:2});
    assert.equal(x.codeBytes.every(b=>b.equals(x.codeBytes[0])),true);
    const paths=[...x.remote.keys()];assert.equal(paths.some(n=>/OWNER_RECEIPT|deny-set|gate-a-payload|run_set/.test(n)),false);
    assert.ok(paths.some(n=>n.includes('/t/external/package-data.json')));
  }
});
for(const condition of ['run_directory_exists','a9_dev_tasks','channel_processes','lock_idle'])test('R1 refuses '+condition+' before R2/upload and retains failure plus R8',()=>{
  const f=migrationFixture(),bad={run_directory_exists:true,a9_dev_tasks:1,channel_processes:1,lock_idle:false};
  const x=executeMigration(f,{admission:{[condition]:bad[condition]}});
  assert.equal(x.result.status,'HALTED');assert.equal(x.result.first_failure.step,'R1');assert.match(x.result.first_failure.error,/^CONTROLLER_ADMISSION:/);
  assert.equal(x.calls.includes('R2'),false);assert.equal(x.calls.includes('upload'),false);assert.ok(x.calls.includes('R8'));
});
test('R2 rejects disallowed/existing parent records before upload',()=>{
  for(const parents of [['C:\\A9-W46'],['C:\\A9-DEV']]) {
    const x=executeMigration(migrationFixture(),{parents});assert.equal(x.result.status,'HALTED');
    assert.equal(x.result.first_failure.step,'R2');assert.equal(x.calls.includes('upload'),false);
  }
});
test('R3 readback mismatch stops R4; R7 scan failure still runs R8; GPU failure stops products',()=>{
  for(const [changes,step,absent] of [[{corruptReadback:true},'R3-verify','R4'],[{badSeal:true},'R7',null],
    [{badGpu:true},'R6-gpu-entry-gate','R5-p03-chain'],[{residue:true},'R8',null]]) {
    const x=executeMigration(migrationFixture(),changes);assert.equal(x.result.status,'HALTED');
    assert.equal(x.result.first_failure.step,step);if(absent)assert.equal(x.calls.includes(absent),false);assert.ok(x.calls.includes('R8'));
  }
});
test('fixed admin stdin grammar and code are shared; no embedded run data or PS3 JSON syntax',()=>{
  const runner=require('../run-rehearsal.cjs'),a=fixture(),b=fixture('FORMAL_GATE_A_EXECUTION');
  a.ctx.lockHolder=b.ctx.lockHolder='TEST_HOLDER';b.ctx.budget.p1.target_session_id=5;
  assert.deepEqual(runner.adminScript(a.ctx),runner.adminScript(b.ctx));
  a.ctx.pinnedAdminScript=runner.adminScript(a.ctx);b.ctx.pinnedAdminScript=runner.adminScript(b.ctx);
  assert.equal(runner.adminCommand(a.ctx),runner.adminCommand(b.ctx));
  assert.notDeepEqual(runner.adminBody(a.ctx,'R1'),runner.adminBody(b.ctx,'R1'));
  const reader=fs.readFileSync(path.join(source,'admin-input.ps1'),'utf8');
  const raw=reader.split('\n').find(x=>x.trimStart().startsWith('$pattern = ')).trim().slice(12,-1);
  const regex=new RegExp(raw.replace('\\A','^').replace('\\z','(?![\\s\\S])'));
  const input=runner.adminBody(a.ctx,'R2').toString();assert.equal(regex.test(input),true);
  assert.equal(regex.test(input+'Start-Process anything'),false);
  assert.equal(regex.test(input.replace('"schema_version":1','"schema_version":1,"schema_version":1')),false);
  const ps=runner.adminScript(a.ctx).toString();assert.doesNotMatch(ps,/ConvertFrom-Json|ConvertTo-Json|ForEach-Object\s+-Parallel|\[ordered\]/);
});


function gitFixture(f,changes={}) {
  const tools=require('../execution-tools.cjs'),files=tools.pins(),names=Object.keys(files),calls=[];
  const git=args=>{
    calls.push(args);
    if(args[0]==='rev-parse')return Buffer.from((args[1]==='HEAD'?f.ctx.facts.source_commit:repo)+'\n');
    if(args[0]==='ls-files')return Buffer.from(names.filter((_,i)=>!changes.untracked||i!==0)
      .map(name=>'100644 '+'a'.repeat(40)+' 0\t'+name+'\0').join(''));
    if(args[0]==='status')return Buffer.from(changes.dirty?' M '+names[0]+'\0':'');
    if(args[0]==='cat-file')return changes.changedBlob?Buffer.from('DIFFERENT_HEAD_BYTES'):fs.readFileSync(path.join(repo,args[2].slice(41)));
    assert.fail('unexpected Git read '+args[0]);
  };
  return {git,calls};
}
test('Git manifest producer requires tracked clean regular files and exact original HEAD bytes',()=>{
  const f=fixture(),tools=require('../execution-tools.cjs'),x=gitFixture(f);
  const raw=tools.produce(f.ctx,x.git);assert.equal(tools.verify(raw,f.ctx),hash(raw));
  assert.ok(x.calls.some(a=>a[0]==='ls-files'&&a.includes('-z')));
  for(const [changes,error] of [[{untracked:true},/UNTRACKED/],[{dirty:true},/DIRTY/],[{changedBlob:true},/HEAD_BYTES/]])
    assert.throws(()=>tools.produce(f.ctx,gitFixture(f,changes).git),error);
  assert.throws(()=>tools.produce(f.ctx),/INJECTED_GIT_REQUIRED/);
});
function materialFixture(klass='DEV_CHANNEL') {
  const f=fixture(klass),root=temp();
  // Compact valid raw context: material production must preserve its exact bytes.
  const raw=Buffer.from(JSON.stringify(f.data)+'\n');
  const contextFile=path.join(root,'context.json'),bindingFile=path.join(root,'binding.json'),out=path.join(root,'materials');
  fs.writeFileSync(contextFile,raw);fs.writeFileSync(bindingFile,f.bytes);
  return {f,root,raw,contextFile,bindingFile,out,args:['--run-context='+contextFile,'--execution-binding='+bindingFile,'--out='+out]};
}
test('material CLI produces raw context, FULL plan and Git execution manifest; dirty Git writes no output',()=>{
  const m=materialFixture(),make=require('../make-run.cjs'),g=gitFixture(m.f);
  const result=make.main(m.args,{git:g.git,now});assert.equal(result.authorization,'NOT_PROVIDED');
  assert.deepEqual(fs.readFileSync(path.join(m.out,'external/RUN_CONTEXT.json')),m.raw);
  const bindings=JSON.parse(fs.readFileSync(path.join(m.out,'INPUT_BINDINGS.json'),'utf8'));
  for(const [key,file] of [['execution_tools_manifest_sha256','EXECUTION_TOOLS.json'],['phase_plan_sha256','PHASE_PLAN.json'],['run_context_sha256','external/RUN_CONTEXT.json']])
    assert.equal(bindings[key],hash(fs.readFileSync(path.join(m.out,file))));
  const bad=materialFixture();assert.throws(()=>make.main(bad.args,{git:gitFixture(bad.f,{dirty:true}).git,now}),/DIRTY/);
  assert.equal(fs.existsSync(bad.out),false);
});
test('material CLI attaches development/formal file AUTHORIZATION without inventing signed expected hashes',()=>{
  const make=require('../make-run.cjs');
  for(const klass of c.CLASSES) {
    const m=materialFixture(klass),f=m.f,options=klass==='DEV_CHANNEL'?localOptions(f):formalOptions(f);
    const bindings={...inputOptions(f).inputBindings,run_context_sha256:hash(m.raw)};
    options.lockHolder='TEST_HOLDER';options.inputBindings=bindings;
    if(klass==='DEV_CHANNEL')options.developmentScope.execution_inputs=bindings;
    if(klass==='FORMAL_GATE_A_EXECUTION') {
      const payload=JSON.parse(options.payloadBytes);
      payload.run_context_sha256=bindings.run_context_sha256;
      payload.execution_binding.path=path.join(m.out,'external/release-authority.json');
      const deny=path.join(m.root,'deny.json');fs.writeFileSync(deny,options.denySetBytes);options.denySetPath=deny;delete options.denySetBytes;
      payload.deny_set.path=deny;options.payloadBytes=c.encode(payload);options.payloadSha256=hash(options.payloadBytes);
      const receipt=JSON.parse(options.receiptBytes);receipt.independent_pin=options.payloadSha256;
      receipt.owner_reply_verbatim='批准本次测试合成载荷 SHA-256 '+options.payloadSha256;options.receiptBytes=c.encode(receipt);
    }
    // All JSON material options use actual files, as in a caller's AUTHORIZATION.
    for(const key of Object.keys(options).filter(k=>k.endsWith('Bytes'))) {
      const file=path.join(m.root,key+'.json');fs.writeFileSync(file,options[key]);options[key.slice(0,-5)+'Path']=file;delete options[key];
    }
    options.executionBindingPath=path.join(m.out,'external/release-authority.json');
    const auth=path.join(m.root,'authorization.json');fs.writeFileSync(auth,c.encode(options));
    make.main(m.args,{git:gitFixture(f).git,now});
    const before=hash(fs.readFileSync(path.join(m.out,'EXECUTION_TOOLS.json')));
    const result=make.main([...m.args,'--authorization='+auth],{git:gitFixture(f).git,now});
    assert.equal(hash(fs.readFileSync(path.join(m.out,'EXECUTION_TOOLS.json'))),before);
    assert.equal(result.authorization,'VALIDATED_NOT_RESERVED');
    const emitted=local.loadOptions(path.join(m.out,'AUTHORIZATION.json'));
    assert.equal(fs.existsSync(emitted.ledgerDir)&&fs.readdirSync(emitted.ledgerDir).length>0,false);
    const ctx=c.context(f.data.descriptor,m.out,f.data);
    const check=local.validate(ctx,{...emitted,mode:klass,runId:f.binding.run_id,now});assert.equal(check.authority.mode,klass);
    if(klass==='FORMAL_GATE_A_EXECUTION') {
      assert.equal(emitted.payloadSha256,options.payloadSha256);
      fs.appendFileSync(emitted.phasePlanPath,' ');
      assert.throws(()=>local.validate(ctx,{...emitted,mode:klass,runId:f.binding.run_id,now}),/EXECUTION_INPUT_BYTES_MISMATCH/);
    }
  }
});
test('actual run CLI refuses duplicate, relative, missing and unknown arguments without invoking executor',()=>{
  const main=require('../run-rehearsal.cjs').main;
  for(const args of [[],['--run-descriptor=relative','--authorization=/tmp/a'],['--run-descriptor=/tmp/a','--run-descriptor=/tmp/b'],['--mode=FORMAL_GATE_A_EXECUTION']])
    assert.throws(()=>main(args,{spawn(){assert.fail('unexpected spawn');}}),/USAGE|ARGUMENTS|LOCAL_INPUTS_REQUIRED/);
});
test('R2 partial failure retains cleanup ownership; R8 failure preserves original failure',()=>{
  const x=executeMigration(migrationFixture(),{failStep:'R2'});
  assert.equal(x.result.first_failure.step,'R2');assert.equal(x.calls.includes('upload'),false);assert.ok(x.calls.includes('R8'));
  assert.equal(x.inputs.find(row=>row.step==='R8').owned,true);
  assert.equal(x.inputs.find(row=>row.step==='R7').owned,true);
});
test('administrator source keeps R2 exclusive admission, partial failure cleanup and token check before task deletion',()=>{
  const text=fs.readFileSync(path.join(source,'run-admin.ps1'),'utf8');
  const r2=text.slice(text.indexOf("} elseif ($Step -ceq 'R2')"),text.indexOf("} elseif ($Step -ceq 'R3-state')"));
  assert.ok(r2.indexOf("Run-Lock 'acquire'")<r2.indexOf('Read-Admission $true'));
  assert.ok(r2.indexOf('Read-Admission $true')<r2.indexOf('New-Item'));
  assert.match(r2,/finally \{ if \(\$null -ne \$script:RunLockStream\)/);
  assert.match(text,/if \(\$operation -ceq 'acquire'\) \{ \$script:RunLockStream = \$stream; \$stream = \$null \}/);
  const r8=text.slice(text.indexOf("} elseif ($Step -ceq 'R8')"));
  assert.ok(r8.indexOf("Run-Lock 'assert'")<r8.indexOf('& $admin -Action DeleteTask'));
  assert.match(r8,/if \(\$Owned -and \$tasks.Count -eq 0 -and \$procs.Count -eq 0\) \{ Run-Lock 'release' \}/);
  assert.match(text,/FOREIGN_LOCK_NO_RELEASE/);
  const r3=text.slice(text.indexOf("} elseif ($Step -ceq 'R3')"),text.indexOf("} elseif ($Step -ceq 'R4'"));
  assert.match(r3,/Transfer-Path \$v\[2\]/);assert.match(r3,/TRANSFER_DUPLICATE/);assert.match(r3,/TRANSFER_BOUND/);
});

test('actual issue-request entry uses projected rehearsal and the same uploaded package path',()=>{
  const vm=require('vm'),f=fixture(),b=f.ctx.budget,prep=b.tools_root,phase='p02-integrity',timestamp=new Date().toISOString();
  f.ctx.prep=prep;
  const modulePath=path.win32.join(b.candidate_root,'validation/a9-batch2-desktop-request.cjs');
  const fixturePath=path.win32.join(b.candidate_root,'validation/a9-batch2-fixtures.cjs');
  const files=new Map([[modulePath,Buffer.from('TEST_ONLY_REQUEST_MODULE')],[fixturePath,Buffer.from('TEST_ONLY_FIXTURES')]]);
  const manifest=c.encode({files:[...files].map(([file,raw])=>({path:'validation/'+path.win32.basename(file),sha256:hash(raw)}))});
  files.set(path.win32.join(b.candidate_root,'release-manifest.json'),manifest);
  f.binding.candidate.manifest_sha256=hash(manifest);f.bytes=c.encode(f.binding);
  files.set(path.win32.join(prep,'external/release-authority.json'),f.bytes);
  const zip=path.win32.join(b.work_root,'package/candidate.zip');files.set(zip,Buffer.from('TEST_ONLY_ZIP'));
  const parent={machine_name:b.target_machine,account_sid:b.target_sid,integrity_level:'Medium',session_id:2,elevated:false,
    process_id:100,in_job:false,active_console_session_id:2,observed_at_utc:timestamp};
  const probeRow={...parent,schema_version:2,kind:'A9_39_CONTROLLER_LAUNCH_PROBE',launcher:'launcher-chain-v2',phase,query_ok:true,
    in_job_attempts:1,in_job_last_error:0,process_id:300,parent_process_id:444,chain:{task:{pid:100},child:{pid:300,ppid:444}}};
  let ledgerChecked=false,requestChecked=false;
  const gateStub={...gate,inputs:()=>f.ctx,validateExecution:()=>({authority:{...f.binding,rehearsal:b.p1}}),
    json:file=>file==='parent'?parent:file.endsWith('-controller-probe.json')?probeRow:file.endsWith('-issue-launch.json')?{}:
      file.endsWith('-controller-probe-chain.json')?probeRow.chain:{},
    readLedger:()=>[{state:'CONSUMED'},{state:'COMPLETED'}],requireGpuGate(){},verifyPhysicalIsolation(){},
    verifyLedgerFiles(_rows,_root,a){assert.deepEqual(a.rehearsal.phases,phases.PRODUCTS);ledgerChecked=true;},consume:()=>({ok:true})};
  const chainStub={verify:row=>row,waitFile:()=>({task:{pid:100},child:{pid:process.pid,ppid:process.ppid}})};
  const api={externalsNeeded:()=>['package_zip'],createRequest:input=>{
    assert.equal(input.externalFiles.package_zip.path,zip);assert.equal(input.requestIndex,2);requestChecked=true;return input;
  },verifyRequest:()=>({ok:true})};
  const req=name=>name==='fs'?{readFileSync:file=>{assert.ok(files.has(file),file);return files.get(file);},mkdirSync(){},writeFileSync(){}}:
    name==='path'?path:name==='./rehearsal-gate.cjs'?gateStub:name==='./launcher-contract.cjs'?chainStub:
    name==='./trace-contract.cjs'?{}:name==='./phase-plan.cjs'?phases:name===modulePath?api:name===fixturePath?{phaseById:p=>({id:p})}:assert.fail(name);
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(source,'issue-request.cjs'),'utf8'),{require:req,module:mod,exports:mod.exports,process,Buffer});
  assert.equal(mod.exports.run(prep,phase,'parent').ok,true);assert.ok(ledgerChecked&&requestChecked);
});

for(const failed of ['R4','R5','R6','R7','R8'])test('CLI loop retains '+failed+' failure and performs independent bounded cleanup',()=>{
  const x=executeMigration(migrationFixture(),{failStep:failed});
  assert.equal(x.result.status,'HALTED');assert.ok(x.result.first_failure.step.startsWith(failed));
  assert.ok(x.calls.includes('R8'));assert.ok(x.result.transport.ssh<=31);
});
test('R0 local ZIP reader binds the same single top-level directory as the target adapter',()=>{
  for(const name of ['OTHER/file.txt','TEST_ONLY_PRODUCT/../file.txt','TEST_ONLY_PRODUCT/file.txt:ads']) {
    const f=fixture(),root=temp(),n=Buffer.from(name),central=Buffer.alloc(46+n.length),end=Buffer.alloc(22);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(n.length,28);n.copy(central,46);
    end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(0,16);
    const bytes=Buffer.concat([central,end]),zip=path.join(root,'test.zip');fs.writeFileSync(zip,bytes);f.ctx.facts.builds[0].sha256=hash(bytes);
    assert.throws(()=>gate.extractFrozen(zip,path.join(root,'extract'),f.ctx),/ZIP_BOUND_TOP_OR_PATH/);
  }
});
test('task deletion remains exact-name/template bound and ZIP target removes only the locked top directory',()=>{
  const ps=fs.readFileSync(path.join(source,'admin-materials.ps1'),'utf8');
  assert.match(ps,/Compare-Task \$boundTask \$templateFile\)\s*\n\s*\$folder.DeleteTask\(\$name,0\)/);
  assert.match(ps,/Compare-Task \(\$folder.GetTask\(\$name\)\) \$templateFile\)\s*\n\s*\$folder.DeleteTask\(\$name,0\)/);
  assert.match(ps,/\$task.Run\(\[string\]\$root\)/);assert.doesNotMatch(ps,/DeleteTask\([^\n]*\*/);
  const cs=fs.readFileSync(path.join(source,'admin-zip.cs'),'utf8');
  assert.match(cs,/name.StartsWith\(expectedTop \+ "\/",StringComparison.Ordinal\)/);
  assert.match(cs,/name.Substring\(expectedTop.Length \+ 1\)/);assert.match(cs,/FileMode.CreateNew/);
  const issue=fs.readFileSync(path.join(source,'issue-request.cjs'),'utf8');assert.doesNotMatch(issue,/package\/Win7CodingAgent-/);
});

test('foreign-token R8 refusal cannot become POSTFLIGHT PASS or replace the first R2 failure',()=>{
  const x=executeMigration(migrationFixture(),{failStep:'R2',foreignToken:true});
  assert.equal(x.result.status,'HALTED');assert.equal(x.result.first_failure.step,'R2');
  assert.ok(x.result.failures.some(row=>row.step==='R8'));assert.deepEqual(x.result.submitted_phases,[]);
  assert.equal(x.inputs.find(row=>row.step==='R8').owned,true);
});

// Independent review P1-1: every target script writes observations under the short work root `w`.
test('target scripts use the short layout and never the retired work root', () => {
  for (const name of fs.readdirSync(source).filter((n) => /\.(ps1|cs|xml|cjs)$/.test(n))) {
    const text = fs.readFileSync(path.join(source, name), 'latin1');
    assert.equal(/(^|[\\'"])work\\observed\\/.test(text), false, name);
  }
  const probe = fs.readFileSync(path.join(source, 'controller-injob-probe.ps1'), 'latin1');
  assert.match(probe, /'w\\observed\\' \+ \$Phase/);
});

