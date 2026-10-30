import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bindingFixture, shapeFixture, temporary, historicalTest, archiveFile } from './fixtures/win10-test-fixture.mjs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const api = require('../validation/win10/input-binding.cjs');
const driver = require('../validation/win10/product-driver.cjs');
const file = path.resolve('scripts/release/validation/win10/product-driver.cjs');
const source = fs.readFileSync(file, 'utf8');
const base = temporary('entry-');
const dir = temporary('entry-files-');

test('TEST_ONLY exclusion with an UNKNOWN observation rejects; complete constructed two-observation exclusion and counterexamples use the real consumer', () => {
  const saved = shapeFixture('exclusion');
  const context = { source: '8d207ab11d2c8134a81e4e62900f395aae99944e', master_sha256: 'a'.repeat(64), revision_sha256: 'b'.repeat(64), request_id: 'c'.repeat(32) };
  const parent = { pid: saved.parent_pid, creation_ticks: saved.binding.ParentCreationTicks, session: 2, image: '\\Device\\HarddiskVolume4\\Windows\\System32\\cmd.exe' };
  const child = { pid: saved.pid, creation_ticks: saved.binding.CreationTicks, session: 2, image: saved.binding.Image };
  // Added observations are explicitly SURROGATE data, not historical facts or Win10 admission.
  const record = { schema_version: 1, status: 'RELATIONSHIP_EXCLUDED_NOT_PROCESS_EXIT', reason: 'CHILD_CREATED_BEFORE_PINNED_PARENT', ...context, parent, child, second_parent: { ...parent }, second_child: { ...child }, snapshots: [saved.binding.SnapshotStartedTicks, '639269659974650246'].map(started_ticks => ({ started_ticks, captured_ticks: (BigInt(started_ticks)+10n).toString(), pid: child.pid, parent_pid: parent.pid, image: 'SogouCloud.exe', clock_profile: api.POLICY.capture_clock })), query_ticks: [saved.binding.QueryTicks, '639269659974660246'], handle_evidence: 'RETAINED_BOTH_INSTANCES_TWO_QUERIES' };
  assert.equal(api.validateCaptureExclusion(record, context).process_exit, 'NOT_PROVEN_BY_RELATIONSHIP_EXCLUSION');
  for (const mutate of [r => r.second_child.creation_ticks='639269657968140712', r => r.second_parent.pid++, r => r.second_parent.image='UNKNOWN', r => r.child.creation_ticks=r.parent.creation_ticks, r => r.query_ticks[1]='UNKNOWN', r => r.snapshots[1].started_ticks=r.snapshots[0].started_ticks, r => r.snapshots[1].parent_pid++, r => r.snapshots[0].clock_profile='UNKNOWN', r => r.request_id='d'.repeat(32), r => r.snapshots[1].captured_ticks='UNKNOWN', r => delete r.second_child, r => r.extra=true]) {
    const bad = JSON.parse(JSON.stringify(record)); mutate(bad); assert.throws(() => api.validateCaptureExclusion(bad, context));
  }
  const historicalOnly = JSON.parse(JSON.stringify(record)); historicalOnly.snapshots[1].started_ticks = saved.binding.SecondStartedTicks;
  assert.throws(() => api.validateCaptureExclusion(historicalOnly, context), /LIFECYCLE_CREATION_TICKS/);
});

test('exact instance ledger allows closed PID reuse; duplicate, wrong End, unresolved reuse and clock edges fail closed', () => {
  const startSchema='CreateTime:17,ImageName:1,ParentProcessID:8,ProcessID:8,SessionID:8', endSchema='CreateTime:17,ExitCode:8,ExitTime:17,ImageName:2,ProcessID:8';
  const event = (seq,id,pid,parent,create,exit=null) => ({ seq,id,version:3,pid,parent:id===1?parent:-1,session:id===1?2:-1,image:'cmd.exe',create_ft:String(create),event_ft:String(id===1?create:exit),exit_ft:id===1?null:String(exit),exit_code:id===1?null:0,schema:id===1?startSchema:endSchema });
  const root={pid:50,create_ft:'100000000000000000'};
  const records=[event(1,1,100,50,100000000000000001n),event(2,1,200,100,100000000000000002n),event(3,2,200,-1,100000000000000002n,100000000000000004n),event(4,2,100,-1,100000000000000001n,100000000000000005n),event(5,1,100,50,100000000000000006n),event(6,1,200,100,100000000000000007n),event(7,2,200,-1,100000000000000007n,100000000000000008n),event(8,2,100,-1,100000000000000006n,100000000000000009n)];
  const result=api.verifyObserverGenerations(records,root); assert.equal(result.instances,4); assert.deepEqual(result.open_instances,[]);
  for (const make of [() => [...records,{...records[4],seq:9}],() => [...records,{...records[6],seq:9}],() => records.map((r,i)=>i===6?{...r,create_ft:'100000000000000010'}:r),() => records.filter((r,i)=>i!==3).map((r,i)=>({...r,seq:i+1})),() => records.map((r,i)=>i===5?{...r,parent:999}:r),() => records.map((r,i)=>i===1?{...r,event_ft:'100000000000000001'}:r),() => records.map((r,i)=>i===6?{...r,exit_ft:'100000000000000006'}:r)]) assert.throws(()=>api.verifyObserverGenerations(make(),root));
  assert.deepEqual(api.verifyObserverGenerations(records.slice(0,6),root).open_instances.map(x=>x.create_ft),['100000000000000006','100000000000000007']);
});

historicalTest('ETW red log prefix is replayed without fabricating the missing rejected event', () => {
  const rel='engineering-win10-entry-r1/resume-4/short-first-failure-return-r1/observers/f49752aa72d4ddd733e483cd61bd5dab/';
  const bytes=fs.readFileSync(archiveFile(rel+'observer-final.json')), final=api.parseStrict(bytes.toString());
  assert.equal(final.status,'NOT_PROVEN'); assert.equal(final.callback_error,'InvalidOperationException:DUPLICATE_START_PID');
  const records=fs.readFileSync(archiveFile(rel+'observer-events.jsonl'),'utf8').trimEnd().split('\n').map(api.parseStrict);
  const dispatcher={pid:final.dispatcher_pid,create_ft:final.dispatcher_creation_filetime};
  const audit=api.verifyObserverGenerations(records.slice(0,65),dispatcher);assert.ok(audit.open_instances.length>0);
  // Seq66 points at a closed old parent; the rejected new parent Start was never written.
  assert.equal(records[65].seq,66);assert.equal(records[65].parent,11196);
  assert.throws(()=>api.verifyObserverGenerations(records,dispatcher),/INSTANCE_PARENT_GENERATION_UNKNOWN_OR_AMBIGUOUS/);
  assert.deepEqual(fs.readFileSync(archiveFile(rel+'observer-final.json')),bytes);
});
test('current ETW consumer retains generation identity and reuse proofs', () => {
  const native=fs.readFileSync('scripts/release/validation/win10/manifest-process-observer.cs','utf8');
  assert.ok(native.includes('ValidateInstanceEvent(recs, e, dispatcher, dispatcherCreateFt)'));
  assert.ok(native.includes('x.create_ft == s.create_ft')); assert.ok(!native.includes('HashSet<int> tracked'));
  assert.ok(native.includes('REUSED_PARENT_AND_CHILD_PROOF')); // Actual CLR SelfTest is still NOT_PERFORMED here.
});

test('actual Renderer expression works; missing DOM elements produce zero clicks', () => {
  assert.equal(driver.rendererScriptSelfTest(assert), 5);
  let clicked = 0; const choice = { checked: false };
  assert.equal(vm.runInNewContext(driver.APPLY_FULL_ACCESS_SCRIPT, { document: { querySelector: () => choice, getElementById: () => ({ click() { clicked++; } }) } }), true);
  assert.equal(clicked, 1); assert.equal(choice.checked, true);
  const old = "document.querySelector('input[name=\"a9-mode-choice\"][value='full_access']').checked=true";
  assert.throws(() => new vm.Script(old), SyntaxError);
});
test('actual query consumer uses the tested serializer; dynamic strings round-trip without executing them', () => {
  assert.ok(source.includes("query=async()=>exec(rendererCall('queryEvents',[{conversationId:(await snap()).activeConversationId,limit:1000}]))"));
  for (const value of ['中文 空格', "quote'\\\"\n", '");globalThis.injected=true;//', '\u2028\u2029']) {
    let received; const context = { window: { win7Agent: { a9: { queryEvents(x) { received = x; return x; } } } } };
    const script = driver.rendererCall('queryEvents', [{ conversationId: value, limit: 1000 }]);
    vm.runInNewContext(script, context); assert.equal(received.conversationId, value); assert.equal(context.injected, undefined);
  }
  assert.throws(() => driver.rendererCall('deleteEverything', []));
});
test('actual late-event entry creates distinct real files across restart and retains the original failure', () => {
  const names = ['restartAware', 'entry']; const code = names.map(n => source.match(new RegExp('^function ' + n + '\\([^\\n]*\\)\\{.*\\}$', 'm'))?.[0]).join('\n');
  assert.ok(code.includes("restartAware('post-final-event-'"));
  const context = restart => {
    const journalFile = path.join(dir, restart ? 'restart-journal.jsonl' : 'journal.jsonl');
    const journal = fs.openSync(journalFile, 'wx');
    const c = { fs, path, Buffer, evidence: dir, journal, journalBytes: 0, lateJournalEvents: 0, finalized: true, report: { status: 'FAIL', error: 'retained TIMEOUT' }, request: { request_id: 'a'.repeat(32) }, process: { env: { A9_TEST_RESTART: restart ? '1' : '0' } }, SOURCE: '8d207ab11d2c8134a81e4e62900f395aae99944e', phase: 'Recovery', safe: s => s };
    vm.createContext(c); vm.runInContext(code, c); return c;
  };
  const first = context(false), second = context(true);
  try {
    first.entry({ response: 0 }); const original = fs.readFileSync(path.join(dir, 'post-final-event-1.json'));
    second.entry({ response: 1 }); const restarted = JSON.parse(fs.readFileSync(path.join(dir, 'post-final-event-1-restart.json'), 'utf8'));
    assert.equal(restarted.original_status, 'FAIL'); assert.equal(restarted.observation.response, 1);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'post-final-event-1.json')), original);
    second.lateJournalEvents = 0; assert.throws(() => second.entry({ duplicate: true }), e => e.code === 'EEXIST');
    const oldEntry = code.replace("restartAware('post-final-event-'+lateJournalEvents+'.json')", "'post-final-event-'+lateJournalEvents+'.json'");
    const broken = { ...second, lateJournalEvents: 0 }; vm.createContext(broken); vm.runInContext(oldEntry, broken);
    assert.throws(() => broken.entry({ old: true }), e => e.code === 'EEXIST');
    second.lateJournalEvents = 32; assert.throws(() => second.entry({ overflow: true }), /SAFETY_POST_FINAL_JOURNAL_LIMIT/);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'post-final-event-1.json')), original);
  } finally { fs.closeSync(first.journal); fs.closeSync(second.journal); }
});
test('ordinary driver entry refuses before Electron import or product execution; inherited self-checks are exercised', () => {
  const denied = spawnSync(process.execPath, [file], { encoding: 'utf8', env: { ...process.env, A9_ENGINEERING_BINDING: '' } });
  assert.notEqual(denied.status, 0); assert.match(denied.stderr, /INTEGRITY_ENGINEERING_BINDING_REQUIRED/); assert.doesNotMatch(denied.stderr, /Cannot find module 'electron'/);
  for (const flag of ['--self-test', '--sync-receipt-self-test', '--restart-evidence-self-test', '--recovery-retained-self-test']) {
    const run = spawnSync(process.execPath, [file, flag], { encoding: 'utf8', env: { ...process.env, A9_ENGINEERING_BINDING: '' } });
    assert.equal(run.status, 0, flag + ': ' + run.stderr);
  }

});
historicalTest('driver sync safety source digest matches original', () => {
  const oldSource = fs.readFileSync(archiveFile('a9-31-developer/product-r4-win10-r2/control-scripts/product-r3-driver.cjs'), 'utf8');
  assert.equal(driver.syncSafetyDigest(source), driver.syncSafetyDigest(oldSource));
});
historicalTest('actual sync snapshot and receipt are uniquely associated; nanosecond boundary violations reject', () => {
  const raw = fs.readFileSync(archiveFile('a9-31-developer/product-r4-win10-r2/directed-validation-sync-actual.json'), 'utf8');
  const actual = api.parseStrict(raw.replace(/"(SnapshotStartedTicks|SnapshotCapturedTicks)"\s*:\s*([0-9]{18})/g, '"$1":"$2"'));
  const receipt = actual.actual_receipt[0], item = actual.unique_association.actual_supported[0];
  const m = api.readJson(archiveFile('a9-31-developer/product-r4-win10-r2/frozen-control/master-pin.json'));
  const binding = { source: receipt.source, request_id: receipt.request_id, master_sha256: receipt.master_sha256, revision_sha256: receipt.revision_sha256, parent: receipt.parent };
  const gap = { step: 'OpenQueryHandle', native_error_code: 87, exe: 'cmd.exe', parent_pid: receipt.parent.pid, pid: receipt.result.pid, snapshot_started_ticks: String(item.row.SnapshotStartedTicks), snapshot_captured_ticks: String(item.row.SnapshotCapturedTicks), snapshot_clock: item.snapshot_clock };
  assert.ok(driver.associateSyncReceipt([receipt], gap, binding, m.sync_contract));
  assert.throws(() => driver.associateSyncReceipt([receipt, receipt], gap, binding, m.sync_contract));
  assert.throws(() => driver.associateSyncReceipt([receipt], { ...gap, exe: 'other.exe' }, binding, m.sync_contract));
  const boundary = structuredClone(gap);
  const ending = BigInt(receipt.returned_monotonic_ns) + BigInt(m.sync_contract.snapshot_margin_ns) + 1n;
  const counter = (ending + 99n) / 100n;
  boundary.snapshot_clock.started_counter = counter.toString(); boundary.snapshot_clock.started_ns = (counter * 100n).toString();
  boundary.snapshot_clock.captured_counter = (counter + 1n).toString(); boundary.snapshot_clock.captured_ns = ((counter + 1n) * 100n).toString();
  assert.throws(() => driver.associateSyncReceipt([receipt], boundary, binding, m.sync_contract));
});
test('known Recovery failure retains cleanup_required and rejects fabricated exited facts', () => {
  const h = { handleId: 'old', pid: 35788, lastProbeStatus: 'cleanup_required', recoveryStatus: 'exited', cleanupRequired: true, pidReusePossible: false, ownershipState: 'owned' };
  const before = { ...h, lastProbeStatus: 'running' };
  assert.equal(driver.recoveredUnknownRetained([h], [before], 0), true);
  assert.equal(driver.recoveredUnknownRetained([{ ...h, lastProbeStatus: 'exited' }], [before], 0), false);
  assert.equal(driver.recoveredPidExitedByOs(h.pid, [{ pid: h.pid, exited: true, exit_code: 'UNKNOWN' }]), false);
});

test('current sync preflight and ordinary driver are gated before native control', () => {
  const source = fs.readFileSync('scripts/release/validation/win10/product-driver.cjs', 'utf8');
  assert.ok(source.includes("engineeringBinding.requireWin10Execution(engineering,'ADMIN_TOOL_ADMISSION')"));
  assert.ok(source.indexOf('engineeringBinding.assertRegistration(') < source.indexOf("const {app,BrowserWindow,ipcMain,dialog}=require('electron')"));
});

test('new LibraryOnly context cannot skip the central operation gate before component load', () => {
  const ps=fs.readFileSync('scripts/release/validation/win10/serve-product-desktop.ps1','utf8');
  assert.ok(ps.includes('SCOPE_ADMISSION_LIBRARY_CONTEXT_REQUIRED'));
  const gate=ps.indexOf("Invoke-EngineeringJson 'authorize-admission'");
  assert.ok(gate>=0&&gate<ps.indexOf('$bootstrapMaster=Assert-Master;Load-Capture'));
  assert.ok(ps.includes("@('engineering-02-v5-admission','engineering-02-v6-product')"));assert.ok(ps.includes('if($script:ContextMode){'));
  const observerFiles=ps.slice(ps.indexOf('function Assert-ObserverFiles('),ps.indexOf('function Load-Observer('));
  assert.ok(observerFiles.includes("$base=if($script:AdmissionFamily -and $row.file -ceq $o.launcher.file){$script:EngineeringToolRoot}else{$o.component_dir}"));
  assert.ok(observerFiles.includes('$f=Join-Path $base $row.file;Assert-Plain $f;'));
  assert.ok(observerFiles.includes('$row.size -or (Hash $f) -cne $row.sha256'));
  const scopeReader=ps.slice(ps.indexOf('function Read-ExecutionScope('),ps.indexOf('function Assert-Master{'));
  assert.ok(scopeReader.includes("$file -cne (Join-Path (Split-Path -Parent $script:EngineeringFile) 'scope-approval.json')"));
  assert.ok(scopeReader.includes('(Hash $file) -cne $scopeSha'));
  assert.ok(scopeReader.includes("Invoke-EngineeringJson 'execution-scope' @()"));
  assert.ok(scopeReader.includes('INTEGRITY_CURRENT_SCOPE_RECORD'));
  assert.ok(ps.includes("if($v.schema_version -eq 2){throw 'INTEGRITY_LOCAL_REPLAY_NOT_EXECUTABLE'}"));
});

// Local source evaluation only. PS5.1 parsing and the real ordinary token remain target checks.
function fixedOrdinaryCommand(ps, values) {
  const expression = ps.match(/\$cmd=(.+)$/m)?.[1];
  assert.ok(expression, 'actual CMD producer is required');
  const token = /\s*(?:'([^']*)'|"([^"]*)"|\$([A-Za-z][A-Za-z0-9]*)|(\+))/gy;
  let offset = 0, command = '', needsValue = true;
  while (offset < expression.length) {
    token.lastIndex = offset;
    const match = token.exec(expression);
    assert.ok(match, 'unsupported producer syntax at ' + offset);
    offset = token.lastIndex;
    if (match[4]) { assert.equal(needsValue, false); needsValue = true; continue; }
    assert.equal(needsValue, true);
    if (match[1] !== undefined) command += match[1];
    else if (match[2] !== undefined) {
      assert.doesNotMatch(match[2], /\$/);
      command += match[2].replace(/`r/g, '\r').replace(/`n/g, '\n');
    } else {
      assert.ok(Object.hasOwn(values, match[3]), 'unknown producer variable');
      command += values[match[3]];
    }
    needsValue = false;
  }
  assert.equal(needsValue, false);
  return command;
}

test('ordinary fixed CMD declares only RemoteSigned for its process and preserves the exact entry arguments', () => {
  const ps = fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1', 'utf8');
  const Root = api.ADMISSION_ROOT, PinSha256 = 'a'.repeat(64), run = 'b'.repeat(32);
  const script = Root + '\\control\\versions\\' + 'c'.repeat(64) + '\\forensic-admission.ps1';
  const actual = fixedOrdinaryCommand(ps, { ps: script, Root, PinSha256, run });
  const expected = '@echo off\r\n' + '"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "' + script + '" -Mode Ordinary -Root "' + Root + '" -PinSha256 ' + PinSha256 + ' -CanaryRunId ' + run + '\r\npause\r\n';
  assert.equal(actual, expected);
  assert.ok(ps.includes('[Text.Encoding]::ASCII.GetBytes($cmd)'));
  assert.doesNotMatch(ps, /Set-ExecutionPolicy|Unblock-File|-ExecutionPolicy\s+(?:Bypass|Unrestricted)/i);
});

test('ordinary process policy source predicates reject wrong scopes before any component or claim', () => {
  const ps = fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1', 'utf8');
  const gate = ps.match(/function Assert-OrdinaryExecutionPolicy\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(gate, 'actual policy gate is required');
  for (const scope of ['MachinePolicy', 'UserPolicy', 'Process']) {
    assert.ok(gate.includes('Microsoft.PowerShell.Security\\Get-ExecutionPolicy -Scope ' + scope));
  }
  assert.ok(gate.includes('$effectivePolicy=[string](Microsoft.PowerShell.Security\\Get-ExecutionPolicy)'));
  assert.ok(gate.includes("status='ORDINARY_EXECUTION_POLICY_OBSERVED_NOT_ADMISSION'"));
  const predicates = [...gate.matchAll(/if\(([^\n]+)\)\{throw '([^']+)'\}/g)];
  assert.equal(predicates.length, 2);
  // SURROGATE: evaluate the source predicates; this is not execution of PowerShell cmdlets.
  const evaluate = values => {
    for (const [, condition, failure] of predicates) {
      assert.match(condition, /^\$\w+ -cne '[A-Za-z]+' -or \$\w+ -cne '[A-Za-z]+'$/);
      const js = condition.replace(/\$(\w+)/g, '$1').replace(/ -cne /g, ' !== ').replace(/ -or /g, ' || ');
      if (vm.runInNewContext(js, values)) throw new Error(failure);
    }
  };
  const valid = { machinePolicy: 'Undefined', userPolicy: 'Undefined', processPolicy: 'RemoteSigned', effectivePolicy: 'RemoteSigned' };
  assert.doesNotThrow(() => evaluate(valid));
  for (const field of ['machinePolicy', 'userPolicy']) {
    for (const policy of ['Restricted', 'RemoteSigned', 'AllSigned']) assert.throws(() => evaluate({ ...valid, [field]: policy }), /SCOPE_ORDINARY_GROUP_POLICY/);
  }
  for (const field of ['processPolicy', 'effectivePolicy']) {
    for (const policy of ['Undefined', 'Restricted', 'Bypass', 'Unrestricted', 'AllSigned', 'UNKNOWN']) assert.throws(() => evaluate({ ...valid, [field]: policy }), /SCOPE_ORDINARY_EXECUTION_POLICY/);
  }
  const invocation = ps.indexOf("if($Mode -ceq 'Ordinary'){Assert-OrdinaryExecutionPolicy}");
  assert.ok(invocation > ps.indexOf("'SCOPE_ADMISSION_VERSION'"));
  for (const downstream of ["Invoke-Central 'authorize-admission-start'", '[Reflection.Assembly]::Load', '$run=[Guid]::NewGuid()', '$claimFile=']) assert.ok(invocation < ps.indexOf(downstream), downstream);
});

// SURROGATE: read only the fixed projection expressions from the PS source.
// This does not execute PS5.1, native queries, or a desktop probe.
function diagnosticFunction(ps, name) {
  const body = ps.match(new RegExp('function ' + name + '\\([^)]*\\)\\{([\\s\\S]*?)\\n\\}'))?.[1];
  assert.ok(body, 'actual diagnostic function is required: ' + name);
  return body;
}
function diagnosticReference(expression, values) {
  assert.match(expression, /^\$[\w]+(?:\.[\w]+)*$/);
  const [variable, ...properties] = expression.slice(1).split('.');
  let value = values[variable];
  assert.ok(Object.hasOwn(values, variable), 'unknown source variable');
  for (const property of properties) {
    if ((Array.isArray(value) || Buffer.isBuffer(value) || typeof value === 'string') && ['Count', 'Length'].includes(property)) value = value.length;
    else { assert.ok(value != null && Object.hasOwn(value, property), 'unknown source property: ' + property); value = value[property]; }
  }
  return value;
}
function diagnosticCondition(expression, values) {
  const translated = expression.replace(/\$\w+(?:\.\w+)*/g, ref => JSON.stringify(diagnosticReference(ref, values)))
    .replace(/ -gt /g, ' > ').replace(/ -ne /g, ' !== ').replace(/ -or /g, ' || ');
  assert.match(translated, /^[\w\d\s.><=!|]+$/);
  return vm.runInNewContext(translated);
}
function diagnosticProjection(ps, name, values) {
  const body = diagnosticFunction(ps, name);
  const fields = body.match(/\[ordered\]@\{([^\n]+)\}/)?.[1];
  assert.ok(fields, 'actual fixed map is required');
  const evaluate = expression => {
    const cast = expression.startsWith('[string]');
    if (cast) expression = expression.slice(8);
    let value;
    if (/^'[^']*'$/.test(expression)) value = expression.slice(1, -1);
    else if (/^\d+$/.test(expression)) value = Number(expression);
    else if (/^if\(/.test(expression)) {
      const match = expression.match(/^if\((\$\w+\.\w+)\)\{(\$\w+\.\w+)\}else\{'([^']+)'\}$/);
      assert.ok(match, 'unsupported source conditional');
      value = diagnosticReference(match[1], values) ? diagnosticReference(match[2], values) : match[3];
    } else if (/^Capture-Diagnostic/.test(expression)) {
      const [helper, argument] = expression.split(' ');
      const parameter = ps.match(new RegExp('function ' + helper + '\\(\\$(\\w+)\\)'))?.[1];
      assert.ok(parameter, 'actual projection parameter required');
      value = diagnosticProjection(ps, helper, { [parameter]: diagnosticReference(argument, values) });
    } else value = diagnosticReference(expression, values);
    return cast ? String(value ?? '') : value;
  };
  return Object.fromEntries(fields.split(';').map(field => {
    const [key, ...expression] = field.split('=');
    return [key.trim(), evaluate(expression.join('=').trim())];
  }));
}
function diagnosticRecord(ps, capture, context, child) {
  const body = diagnosticFunction(ps, 'Save-CaptureDiagnostic');
  const guard = body.match(/if\((\$v\.Added\.Count[^\n]+?)\)\{throw 'SAFETY_CAPTURE_DIAGNOSTIC_LIMIT'\}/)?.[1];
  assert.ok(guard, 'actual row bound is required');
  if (diagnosticCondition(guard, { v: capture })) throw new Error('SAFETY_CAPTURE_DIAGNOSTIC_LIMIT');
  const values = { v: capture, c: context, child };
  for (const [, variable, field, helper] of body.matchAll(/\$(added|gaps|excluded)=@\(\$v\.(Added|Gaps|Excluded)\|ForEach-Object\{(Capture-Diagnostic\w+) \$_\}\)/g)) {
    const parameter = ps.match(new RegExp('function ' + helper + '\\(\\$(\\w+)\\)'))?.[1];
    assert.ok(parameter);
    values[variable] = capture[field].map(row => diagnosticProjection(ps, helper, { [parameter]: row }));
  }
  return diagnosticProjection(ps, 'Save-CaptureDiagnostic', values);
}

test('capture diagnostic precedes complete-set classification, held-instance proof, release and bounded exit', () => {
  const ps = fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1', 'utf8');
  const capture = ps.indexOf('$capture=[A31Capture]::Capture(@($tree.Values|ForEach-Object{$_.capture}))');
  const save = ps.indexOf("Save-CaptureDiagnostic $capture $context $lifecycle (Join-Path $dir 'capture-before-assert.json')");
  const classify = ps.indexOf('$captureSet=Get-OrdinaryCaptureSet $capture $context $lifecycle',capture), proof=ps.indexOf('[A31Capture]::AssertSameInstance($held.capture.Process,$h.Process',classify),release=ps.indexOf("$null=Save (Join-Path $dir 'child-release.txt')",proof),wait=ps.indexOf('$h.Process.WaitForExit(',release);
  assert.ok(capture >= 0 && save > capture && classify > save && proof > classify && release > proof && wait > release);
  assert.doesNotMatch(ps,/\$capture\.Added\[0\]|Accept-Capture \$tree \$capture/);
  const classifier=diagnosticFunction(ps,'Get-OrdinaryCaptureSet');
  for(const gate of ['$v.Gaps.Count -ne 0','$v.Excluded.Count -ne 0','$v.Added.Count -lt 1','$v.Added.Count -gt 2','$roots.Count -ne 1','$r.CreationTicks.ToString() -cne $child.creation_ticks','$h.Parent -ne $parentPid','$b.Ownership -cne \'PROVEN\'','$seen.ContainsKey([string]$h.Pid)','$b.Image -ine $expectedImage','$b.ParentCreationTicks -cne $parentTicks']) assert.ok(classifier.includes(gate) || classifier.includes(gate.replace('$b.ParentCreationTicks','[string]$b.ParentCreationTicks')),gate);
  assert.ok(ps.includes('[A31Capture]::OpenQuery($row.pid)'));assert.ok(ps.includes('[A31Capture]::AssertSameInstance($h.Process,$check'));
  assert.ok(ps.includes('foreach($h in $capture.Added){$queries+=@($h.Process)}'));
  assert.ok(ps.includes('[Object]::ReferenceEquals($_,$q)'));assert.ok(ps.includes('$q.Dispose()'));
  assert.ok(ps.includes('capture_set=$captureSet'));assert.ok(ps.includes("$row.exit_ticks=$h.Process.ReadExitTime().ToUniversalTime().Ticks.ToString()"));
  assert.ok(ps.includes('$until=[DateTime]::UtcNow.AddSeconds(8)'));
  assert.ok(ps.includes('$budget.ElapsedMilliseconds -ge 8000'));
  assert.ok(ps.includes('[Math]::Max(0,8000-[int]$budget.ElapsedMilliseconds)'));
});

test('capture diagnostic SURROGATE preserves zero, one, wrong, multiple, gap and exclusion observations without exposing handles', () => {
  const ps = fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1', 'utf8');
  const proof = Object.fromEntries(['SnapshotStartedTicks','SnapshotCapturedTicks','QueryTicks','CreationTicks','ParentCreationTicks','Session','Image','ClockProfile','SecondObservation','Ownership'].map(key => [key, 'UNKNOWN']));
  proof.CreationTicks = 639270224368866093n;
  const held = { Pid: 22012, Parent: 25324, CreationTicks: proof.CreationTicks, Session: 2, Binding: proof };
  Object.defineProperty(held, 'Process', { get() { throw new Error('handle must never be serialized'); } });
  const context = { source: '8d207ab11d2c8134a81e4e62900f395aae99944e', binding_sha256: 'a'.repeat(64), execution_scope_sha256: 'b'.repeat(64), tool_digest: 'c'.repeat(64), component_digest: 'd'.repeat(64), run_id: 'e'.repeat(32), role: 'ORDINARY_FORENSIC_ADMISSION', operation: 'ordinary-probe', parent: { pid: 25324, creation_ticks: '639270224296104728', session: 2 } };
  const child = { pid: 22012, creation_ticks: String(proof.CreationTicks), session: 2, image: '\\Device\\HarddiskVolume3\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' };
  const gap = { Pid: 22012, Parent: 25324, Exe: 'powershell.exe', Step: 'OpenQueryHandle', ErrorType: 'Win32Exception', NativeErrorKnown: false, NativeError: null, Binding: proof };
  const exclusion = { Pid: 22012, Parent: 25324, Reason: 'CHILD_CREATED_BEFORE_PINNED_PARENT', Binding: proof };
  const cases = [[], [held], [{ ...held, Pid: 22013 }], [held, { ...held, Pid: 22013 }]];
  for (const Added of cases) {
    const capture = { Added, Gaps: [], Excluded: [] }, record = diagnosticRecord(ps, capture, context, child);
    assert.equal(record.schema_version, 1); assert.equal(record.status, 'OWN_CHILD_CAPTURE_DIAGNOSTIC_V1_NOT_ADMISSION');
    assert.equal(record.binding_sha256, context.binding_sha256); assert.equal(record.run_id, context.run_id);
    assert.equal(record.added_count, Added.length); assert.equal(record.gaps_count, 0); assert.equal(record.excluded_count, 0);
    assert.deepEqual(record.added.map(row => row.pid), Added.map(row => row.Pid));
    for (const row of record.added) assert.equal(row.creation_ticks, '639270224368866093');
    assert.doesNotMatch(JSON.stringify(record), /"Process"|Handle|CommandLine|Environment/);
  }
  const record = diagnosticRecord(ps, { Added: [], Gaps: [gap], Excluded: [exclusion] }, context, child);
  assert.equal(record.gaps_count, 1); assert.equal(record.excluded_count, 1);
  assert.equal(record.gaps[0].native_error_code, 'UNKNOWN'); assert.equal(record.gaps[0].binding.creation_ticks, '639270224368866093');
  assert.equal(record.excluded[0].reason, exclusion.Reason);
});

test('TEST_ONLY two-row diagnostic complete-set proof is explicitly SURROGATE', () => {
  const j=shapeFixture('capture');
  const exit=(BigInt(j.added[1].binding.query_ticks)+1n).toString();
  // Only the capture/identity fields are actual observations. These successful exits and actual_pid fields are SURROGATE.
  const set={schema_version:1,raw_added_count:j.added_count,root_count:1,console_count:1,gap_count:0,excluded_count:0,instances:j.added.map(row=>({kind:row.pid===j.owned.pid?'powershell':'conhost',pid:row.pid,parent_pid:row.parent_pid,creation_ticks:row.creation_ticks,parent_creation_ticks:row.binding.parent_creation_ticks,session:row.session,image:row.binding.image,proof:{...row.binding,actual_pid:row.pid},same_instance:true,exit_code:0,exit_ticks:exit,held_query_after_exit:true}))};
  const child={...j.owned,same_instance:true,exit_code:0,exit_ticks:exit,held_query_after_exit:true,capture_added:2};
  assert.equal(api.validateOrdinaryCaptureSet(set,child,j.parent,BigInt(j.parent.creation_ticks)+1n,BigInt(exit)+1n),set);
  const reversed=JSON.parse(JSON.stringify(set));reversed.instances.reverse();assert.equal(api.validateOrdinaryCaptureSet(reversed,child,j.parent,BigInt(j.parent.creation_ticks)+1n,BigInt(exit)+1n),reversed);

});

test('capture diagnostic bounds and exclusive write stay fail closed in SURROGATE fixtures', () => {
  const ps = fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1', 'utf8');
  const body = diagnosticFunction(ps, 'Save-CaptureDiagnostic');
  for (const field of ['Added','Gaps','Excluded']) {
    const capture = { Added: [], Gaps: [], Excluded: [] }; capture[field] = Array(129).fill({});
    assert.throws(() => diagnosticRecord(ps, capture, {}, {}), /SAFETY_CAPTURE_DIAGNOSTIC_LIMIT/);
  }
  assert.ok(body.includes("throw 'INTEGRITY_CAPTURE_DIAGNOSTIC_ARRAYS'"));
  assert.ok(body.includes('$null=Save $file $record'));
  assert.doesNotMatch(body, /catch|Set-ExecutionPolicy|Add-Type|Start-Process/);
  const save = ps.slice(ps.indexOf('function Save('), ps.indexOf('function Fresh-Directory('));
  assert.ok(save.includes('ConvertTo-Json -Depth 25 -Compress'));
  assert.ok(save.includes('$raw.Length -gt 262144'));
  assert.ok(save.includes('[IO.FileMode]::CreateNew'));
  const bound = save.match(/if\((\$raw\.Length -gt \d+)\)\{throw 'OUTPUT_LIMIT'\}/)?.[1];
  assert.ok(bound);
  assert.equal(diagnosticCondition(bound, { raw: Buffer.alloc(262144) }), false);
  assert.equal(diagnosticCondition(bound, { raw: Buffer.from('中'.repeat(87382), 'utf8') }), true);
  const fixture = path.join(dir, 'capture-diagnostic.json');
  fs.writeFileSync(fixture, 'retained first failure', { flag: 'wx', encoding: 'utf8' });
  assert.throws(() => fs.writeFileSync(fixture, '{}', { flag: 'wx', encoding: 'utf8' }), e => e.code === 'EEXIST');
  assert.equal(fs.readFileSync(fixture, 'utf8'), 'retained first failure');
});


// SURROGATE: evaluate only the bounded decoded-text operations and fixed maps
// extracted from the production PS helper. This is not a PS5.1/runtime result.
function streamDiagnosticReplay(ps, task) {
  const body = diagnosticFunction(ps, 'Get-ChildStreamDiagnostic');
  assert.ok(body.includes("if(-not $task.IsCompleted -or [string]$task.Status -cne 'RanToCompletion'){throw 'LIFECYCLE_OWN_CHILD_DRAIN_UNKNOWN'}"));
  if (!task.IsCompleted || task.Status !== 'RanToCompletion') throw new Error('LIFECYCLE_OWN_CHILD_DRAIN_UNKNOWN');
  assert.ok(body.includes("$text=$task.Result;if($null -eq $text){throw 'LIFECYCLE_OWN_CHILD_DRAIN_UNKNOWN'}"));
  const text = task.Result;
  if (text == null) throw new Error('LIFECYCLE_OWN_CHILD_DRAIN_UNKNOWN');
  const limit = Number(body.match(/\$limit=\[Math\]::Min\((\d+),\$text\.Length\)/)?.[1]);
  assert.equal(limit, 4096);
  assert.ok(body.includes('$limit -lt $text.Length -and $limit -gt 0 -and [char]::IsHighSurrogate($text,$limit-1) -and [char]::IsLowSurrogate($text,$limit)'));
  assert.ok(body.includes('{$limit--}'));
  let cut = Math.min(limit, text.length);
  if (cut < text.length && cut > 0 && text.charCodeAt(cut - 1) >= 0xd800 && text.charCodeAt(cut - 1) <= 0xdbff && text.charCodeAt(cut) >= 0xdc00 && text.charCodeAt(cut) <= 0xdfff) cut--;
  assert.ok(body.includes('$saved=$text.Substring(0,$limit);$truncated=$saved.Length -ne $text.Length'));
  assert.ok(body.includes('$bytes=(New-Object Text.UTF8Encoding($false)).GetBytes($saved)'));
  assert.ok(body.includes('[Security.Cryptography.SHA256]::Create()'));
  assert.ok(body.includes('$sha.ComputeHash($bytes)'));
  assert.ok(body.includes('$sha.Dispose()'));
  assert.ok(body.includes("$fullHash=if($truncated){'UNKNOWN'}else{$digest}"));
  const saved = text.slice(0, cut), truncated = saved.length !== text.length, bytes = Buffer.from(saved, 'utf8'), digest = api.sha(bytes), fullHash = truncated ? 'UNKNOWN' : digest;
  return diagnosticProjection(ps, 'Get-ChildStreamDiagnostic', { task, text, saved, truncated, bytes, digest, fullHash });
}
function streamRecordReplay(ps, context, child, stdout, stderr) {
  const body = diagnosticFunction(ps, 'Save-ChildStreamDiagnostic');
  assert.ok(body.includes('$out=Get-ChildStreamDiagnostic $stdout;$err=Get-ChildStreamDiagnostic $stderr'));
  assert.ok(body.includes('$null=Save $file $record'));
  return diagnosticProjection(ps, 'Save-ChildStreamDiagnostic', { c: context, child, out: streamDiagnosticReplay(ps, stdout), err: streamDiagnosticReplay(ps, stderr) });
}
const completedStream = Result => ({ IsCompleted: true, Status: 'RanToCompletion', Result });

test('fixed ordinary child sets its own progress preference as the first decoded statement', () => {
  const ps = fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1', 'utf8');
  const assignments = [...ps.matchAll(/^   \$fixture="([^"\r\n]*)"/gm)];
  assert.equal(assignments.length, 1);
  const prefix = "`$ProgressPreference='SilentlyContinue';";
  assert.ok(assignments[0][1].startsWith(prefix));
  // Source inspection only: this decodes the escaped variable in the fixed
  // first string segment. Actual PS5.1 child execution is a separate gate.
  const firstSegment = assignments[0][1].replace(/`\$/g, '$');
  assert.equal(firstSegment.split(';')[0], "$ProgressPreference='SilentlyContinue'");
  assert.equal(ps.split(prefix).length - 1, 1);
  const ordinary = ps.slice(ps.indexOf('   $fixture='), ps.indexOf('\n   $directions='));
  assert.ok(ordinary.includes('[Text.Encoding]::Unicode.GetBytes($fixture)'));
  assert.ok(ordinary.includes("$pi.Arguments='-NoProfile -NonInteractive -EncodedCommand '"));
  assert.doesNotMatch(ordinary.replace(assignments[0][0], ''), /ProgressPreference|Write-Progress|SilentlyContinue|Import-Clixml/);
});

test('decoded stream diagnostic is saved after all held exits/drain and before unchanged output assertions in the same 8s budget', () => {
  const ps = fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1', 'utf8');
  const ordinary = ps.slice(ps.indexOf('   $fixture='), ps.indexOf('\n   $directions='));
  const release=ordinary.indexOf("'child-release.txt'"), heldExit=ordinary.indexOf('$row.held_query_after_exit=$true'), drain=ordinary.indexOf('if(-not $owned.WaitForExit(0)');
  const call="Save-ChildStreamDiagnostic $context $lifecycle $o $e (Join-Path $dir 'child-stream-before-assert.json')";
  const save=ordinary.indexOf(call), budget=ordinary.indexOf("if($budget.ElapsedMilliseconds -ge 8000){throw 'LIFECYCLE_OWN_CHILD_EXIT_UNKNOWN'}",save);
  const gates="if($o.Result.Length -gt 4096 -or $e.Result.Length -gt 4096){throw 'OUTPUT_LIMIT'};if($e.Result.Length){throw 'OWN_CHILD_STDERR'}";
  assert.ok(release>=0 && heldExit>release && drain>heldExit && save>drain && budget>save && ordinary.indexOf(gates)>budget);
  assert.equal(ps.split(call).length-1,1);
  assert.ok(ordinary.includes('$o=$owned.StandardOutput.ReadToEndAsync();$e=$owned.StandardError.ReadToEndAsync()'));
  assert.ok(ordinary.includes('$pi.StandardOutputEncoding=[Text.Encoding]::UTF8;$pi.StandardErrorEncoding=[Text.Encoding]::UTF8'));
  assert.ok(ordinary.includes('$until=[DateTime]::UtcNow.AddSeconds(8)'));
  assert.ok(ordinary.includes('[Math]::Min(1000,8000-[int]$budget.ElapsedMilliseconds)'));
  const helper=diagnosticFunction(ps,'Save-ChildStreamDiagnostic');
  assert.doesNotMatch(helper,/Invoke-Central|Read-Json|Get-Content|Environment|catch|Start-Sleep|Set-ExecutionPolicy/);
});

test('decoded stream SURROGATE preserves empty/marker/Chinese/nonBMP text and correct UTF8 size/hash', () => {
  const ps=fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1','utf8');
  for(const text of ['', 'A9-FORENSIC-OWNED-CHILD','ASCII stderr','中文路径和错误😀𠮷']){
    const row=streamDiagnosticReplay(ps,completedStream(text));
    assert.equal(row.completed,true);assert.equal(row.task_status,'RanToCompletion');
    assert.equal(row.decoded_utf16_code_units,text.length);assert.equal(row.saved_utf16_code_units,text.length);
    assert.equal(row.text,text);assert.equal(row.truncated,false);
    assert.equal(row.saved_utf8_bytes,Buffer.byteLength(text,'utf8'));
    assert.equal(row.saved_utf8_sha256,api.sha(Buffer.from(text,'utf8')));
    assert.equal(row.full_decoded_utf8_sha256,row.saved_utf8_sha256);
    assert.equal(row.encoding_scope,'UTF8_STREAMREADER_DECODED_TEXT_REENCODED_UTF8');
  }
});

test('decoded stream SURROGATE limits UTF16 prefixes without splitting pairs; truncated full hash is UNKNOWN', () => {
  const ps=fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1','utf8');
  for(const [text,saved,truncated] of [
    ['a'.repeat(4096),'a'.repeat(4096),false],
    ['a'.repeat(4097),'a'.repeat(4096),true],
    ['中'.repeat(4096),'中'.repeat(4096),false],
    ['a'.repeat(4094)+'😀','a'.repeat(4094)+'😀',false],
    ['a'.repeat(4095)+'😀','a'.repeat(4095),true],
    ['a'.repeat(4094)+'😀z','a'.repeat(4094)+'😀',true]
  ]){
    const row=streamDiagnosticReplay(ps,completedStream(text));
    assert.equal(row.text,saved);assert.equal(row.truncated,truncated);
    assert.equal(row.decoded_utf16_code_units,text.length);assert.ok(row.saved_utf16_code_units<=4096);
    assert.equal(row.saved_utf8_bytes,Buffer.byteLength(saved));assert.equal(row.saved_utf8_sha256,api.sha(Buffer.from(saved)));
    assert.equal(row.full_decoded_utf8_sha256,truncated?'UNKNOWN':row.saved_utf8_sha256);
  }
});

test('incomplete/faulted/canceled decoded stream tasks never access Result in SURROGATE replay', () => {
  const ps=fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1','utf8');
  for(const [IsCompleted,Status] of [[false,'WaitingForActivation'],[true,'Faulted'],[true,'Canceled']]){
    const task={IsCompleted,Status};let reads=0;
    Object.defineProperty(task,'Result',{get(){reads++;throw new Error('must not access incomplete Result');}});
    assert.throws(()=>streamDiagnosticReplay(ps,task),/LIFECYCLE_OWN_CHILD_DRAIN_UNKNOWN/);assert.equal(reads,0);
  }
  assert.throws(()=>streamDiagnosticReplay(ps,completedStream(null)),/LIFECYCLE_OWN_CHILD_DRAIN_UNKNOWN/);
});

test('stream diagnostic SURROGATE fixed map binds current source/run/parent/child and excludes unrelated fields', () => {
  const ps=fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1','utf8');
  const context={source:'8d207ab11d2c8134a81e4e62900f395aae99944e',binding_sha256:'a'.repeat(64),execution_scope_sha256:'b'.repeat(64),tool_digest:'c'.repeat(64),component_digest:'d'.repeat(64),run_id:'e'.repeat(32),role:'ORDINARY_FORENSIC_ADMISSION',operation:'ordinary-probe',parent:{pid:25324,creation_ticks:'639270224296104728',session:2,extra:'do not serialize'},extra:'do not serialize'};
  const child={pid:22012,creation_ticks:'639270224368866093',session:2,image:'\\Device\\HarddiskVolume3\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',exit_code:'UNKNOWN',extra:'do not serialize'};
  const record=streamRecordReplay(ps,context,child,completedStream('A9-FORENSIC-OWNED-CHILD'),completedStream(''));
  const fixed=['schema_version','status','evidence_scope','source','binding_sha256','execution_scope_sha256','tool_digest','component_digest','run_id','role','operation','parent','child','original_pipe_byte_identity','stdout','stderr'];
  assert.deepEqual(Object.keys(record),fixed);
  assert.equal(record.status,'OWN_CHILD_STREAM_DIAGNOSTIC_V1_NOT_ADMISSION');assert.equal(record.evidence_scope,'WIN10_DIRECT');assert.equal(record.original_pipe_byte_identity,'UNKNOWN');
  const verifyReplay=actual=>{
    assert.deepEqual(Object.keys(actual),fixed);
    for(const key of ['source','binding_sha256','execution_scope_sha256','tool_digest','component_digest','run_id','role','operation'])assert.equal(actual[key],context[key]);
    assert.deepEqual(actual.parent,{pid:context.parent.pid,creation_ticks:context.parent.creation_ticks,session:context.parent.session});
    assert.deepEqual(actual.child,{pid:child.pid,creation_ticks:child.creation_ticks,session:child.session,image:child.image});
  };
  verifyReplay(record);
  for(const mutate of [r=>r.binding_sha256='f'.repeat(64),r=>r.run_id='f'.repeat(32),r=>r.parent.pid++,r=>r.child.creation_ticks='UNKNOWN',r=>r.extra=true]){
    const bad=JSON.parse(JSON.stringify(record));mutate(bad);assert.throws(()=>verifyReplay(bad));
  }
  assert.doesNotMatch(JSON.stringify(record),/exit_code|do not serialize|Environment|CommandLine|Handle/);
});

test('CLIXML progress/error remain nonempty stderr failures; output limit keeps precedence in SURROGATE gate replay', () => {
  const ps=fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1','utf8');
  const ordinary=ps.slice(ps.indexOf('   $fixture='));
  const gate=ordinary.match(/if\(\$o\.Result\.Length -gt (\d+) -or \$e\.Result\.Length -gt (\d+)\)\{throw 'OUTPUT_LIMIT'\};if\(\$e\.Result\.Length\)\{throw 'OWN_CHILD_STDERR'\}/);
  assert.ok(gate);
  const classify=(stdout,stderr)=>stdout.length>Number(gate[1])||stderr.length>Number(gate[2])?'OUTPUT_LIMIT':stderr.length?'OWN_CHILD_STDERR':null;
  assert.equal(classify('A9-FORENSIC-OWNED-CHILD',''),null);
  for(const stderr of ['ASCII stderr',' ','\r\n','#< CLIXML\r\n<Objs><Obj S="progress">准备模块</Obj></Objs>','#< CLIXML\r\n<Objs><S S="Error">error</S></Objs>']){
    assert.equal(streamDiagnosticReplay(ps,completedStream(stderr)).text,stderr);
    assert.equal(classify('A9-FORENSIC-OWNED-CHILD',stderr),'OWN_CHILD_STDERR');
  }
  assert.equal(classify('a'.repeat(4097),'error'),'OUTPUT_LIMIT');assert.equal(classify('', 'e'.repeat(4097)),'OUTPUT_LIMIT');
});

test('stream diagnostic exclusive persistence preserves first file and the existing total JSON bound', () => {
  const ps=fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1','utf8');
  const save=ps.slice(ps.indexOf('function Save('),ps.indexOf('function Fresh-Directory('));
  for(const fragment of ['Plain (Split-Path -Parent $p)','[IO.FileMode]::CreateNew','New-Object Text.UTF8Encoding($false)','$raw.Length -gt 262144','$f.Flush()','$f.Dispose()'])assert.ok(save.includes(fragment));
  const file=path.join(dir,'child-stream-before-assert.json'),first=Buffer.from('{"first_failure":"preserved"}');
  fs.writeFileSync(file,first,{flag:'wx'});assert.throws(()=>fs.writeFileSync(file,'{}',{flag:'wx'}),e=>e.code==='EEXIST');
  assert.deepEqual(fs.readFileSync(file),first);
});

test('driver keeps rejecting forensic versions but lets v6 reach the central product gate before Electron loads', () => {
  const src = source;
  const gate = src.indexOf('SCOPE_FORENSIC_EXECUTION_CONTRACT');
  assert.ok(gate > 0); assert.match(src.slice(src.lastIndexOf('\n', gate), gate + 60), /forensic\(engineering\)&&!engineeringBinding\.product\(engineering\)/);
  assert.ok(src.includes('engineeringBinding.requireWin10Execution(engineering,undefined,undefined,undefined,process.env.A9_ENGINEERING_BINDING_SHA256)'));
  const request = src.indexOf('engineeringBinding.assertProductRequest(engineering,phase,engineeringRevision.label)');
  assert.ok(request > 0 && request > src.indexOf('const request=validateRequest(') - 400 && request < src.indexOf("const evidence=path.join(root,'evidence')"));
  const dirv = fs.mkdtempSync(path.join(base, 'v6-driver-'));
  const previous = bindingFixture('forensic');
  const run = (binding) => { const f = path.join(dirv, binding.tool_identity.version + '.json'); fs.writeFileSync(f, JSON.stringify(binding, null, 2) + '\n'); return spawnSync(process.execPath, [file], { encoding: 'utf8', env: { ...process.env, A9_ENGINEERING_BINDING: f, A9_ENGINEERING_BINDING_SHA256: api.sha(fs.readFileSync(f)) } }); };
  const v5 = run(api.createAdmissionStatic(previous)); assert.notEqual(v5.status, 0); assert.match(v5.stderr, /SCOPE_FORENSIC_EXECUTION_CONTRACT/);
  const v6 = run(api.createProductStatic(previous)); assert.notEqual(v6.status, 0); assert.match(v6.stderr, /SCOPE_PRODUCT_REMOTE_NOT_APPROVED/); assert.doesNotMatch(v6.stderr, /SCOPE_FORENSIC_EXECUTION_CONTRACT|Cannot find module 'electron'/);
});

test('v6 PS consumers accept the R4 layout and the v6 family, keep older versions, and stay free of force or system actions', () => {
  const base = 'scripts/release/validation/win10', rd = n => fs.readFileSync(path.join(base, n), 'utf8');
  const [serve, observer, stage, launch] = ['serve-product-desktop.ps1', 'launch-manifest-observer.ps1', 'stage-product.ps1', 'launch-product-desktop.ps1'].map(rd);
  const R4 = 'A9-Engineering-Win10-Entry-20261007-R4';
  for (const [name, text] of Object.entries({ serve, observer, stage, launch })) {
    assert.ok(text.includes("'engineering-02-v6-product'"), name + ' names v6');
    assert.ok(text.includes("@('engineering-02-v5-admission','engineering-02-v6-product')"), name + ' admission family');
    assert.ok(text.includes("'evidence\\desktop-session-'+"), name + ' per-binding desktop record for v6');
    assert.ok(text.includes("'evidence\\desktop-session.json'"), name + ' keeps the legacy desktop record');
    assert.ok(text.includes('inputs\\bindings\\') && text.includes('control\\versions\\'), name + ' versioned layout');
    assert.doesNotMatch(text, /Stop-Process|taskkill|Kill\(|Set-Acl|icacls|Invoke-Expression|Start-Service|New-Service/);
  }
  for (const [name, text] of Object.entries({ stage, launch })) {
    assert.ok(text.includes(R4), name + ' accepts R4'); assert.ok(text.includes('-20261007-R2') && text.includes('-20261007-R3'), name + ' keeps R2/R3');
    assert.ok(text.includes("Join-Path $base 'control'"), name + ' keeps the legacy tool root'); assert.ok(text.includes('$script:EngineeringToolRoot'), name + ' uses a tool root variable');
    assert.doesNotMatch(text, /Join-Path \$script:EngineeringRoot 'control\\input-binding\.cjs'/); assert.doesNotMatch(text, /Join-Path \$root \('control\\'\+\$(row|f)\.file\)/);
    assert.doesNotMatch(text, /Join-Path \$root \('control\\revisions\\'/);
  }
  assert.ok(serve.includes("Join-Path $script:EngineeringToolRoot ('revisions\\'+$sha)") && serve.includes("Join-Path $script:EngineeringToolRoot ('revisions\\'+$RevisionSha256)"));
  assert.ok(stage.includes("Join-Path $script:EngineeringToolRoot ('revisions\\'+$RevisionSha256)") && launch.includes("Join-Path $script:EngineeringToolRoot ('revisions\\'+$q.pin_sha256)"));
  // v5 still needs a context; v6 needs one only for the forensic admission operations.
  assert.ok(serve.includes('SCOPE_ADMISSION_LIBRARY_CONTEXT_REQUIRED') && serve.includes('$script:ContextMode'));
  assert.ok(serve.includes("$script:ContextMode=$script:AdmissionFamily -and (-not $script:ProductContract -or $AdmissionOperation)"));
  // Read-Json unwraps revision files, so the label must come from the raw wrapper file (ENGINEERING_02 section 67).
  assert.ok(serve.includes("$revisionLabel=(Get-Content -LiteralPath (Join-Path $root ('inputs\\revision-'+$RevisionSha256+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json).label"));
  assert.ok(serve.includes("Invoke-EngineeringJson 'assert-product-request' @($q.phase,[string]$revisionLabel)"));
  assert.doesNotMatch(serve, /\$revision\.label/);
  assert.ok(serve.indexOf("Invoke-EngineeringJson 'assert-product-request'") > serve.indexOf('$q=Parse-Request'));
  // The observer keeps the context-only Admit rule for v5 and opens Run/Stop only through the central product gate for v6.
  assert.ok(observer.includes("$Mode -cne 'Admit'") && observer.includes("Assert-EngineeringExecution 'ADMIN_TOOL_ADMISSION'"));
  assert.ok(observer.includes("($engineering.tool_identity.version -ceq 'engineering-02-v5-admission' -or $Mode -ceq 'Admit')"));
  assert.doesNotMatch(observer, /\$Mode -ceq 'Build'\)\{[^}]*Assert-EngineeringExecution/); assert.ok(observer.includes("if($Mode -ceq 'Build'){throw 'SCOPE_LOCKED_COMPONENT_NOT_REBUILT'}"));
});

test('v6 consumers read the binding file they verified, not a fixed inputs\\master-pin.json, and the v6 worker never uses Bypass', () => {
  const base = 'scripts/release/validation/win10', rd = n => fs.readFileSync(path.join(base, n), 'utf8');
  const [serve, stage, launch] = ['serve-product-desktop.ps1', 'stage-product.ps1', 'launch-product-desktop.ps1'].map(rd);
  assert.ok(launch.includes('$masterFile=$script:EngineeringFile;'));
  assert.ok(stage.includes('$f=$script:EngineeringFile;if((Get-FileHash -LiteralPath $f).Hash.ToLowerInvariant() -cne $PinSha256)'));
  assert.ok(serve.includes("$psi.EnvironmentVariables['A9_ENGINEERING_BINDING']=$script:EngineeringFile"));
  for (const text of [serve, stage, launch]) assert.doesNotMatch(text, /=Join-Path \$root 'inputs\\master-pin\.json'/);
  assert.ok(launch.includes("$workerPolicy=if($engineering.tool_identity.version -ceq 'engineering-02-v6-product'){'RemoteSigned'}else{'Bypass'}"));
  assert.ok(launch.includes("'-NoProfile -NonInteractive -ExecutionPolicy '+$workerPolicy+' -File \"'"));
});

test('forensic admission accepts exactly the v5 and v6 admission-family bindings (ENGINEERING_02 section 73)', () => {
  const ps = fs.readFileSync('scripts/release/validation/win10/forensic-admission.ps1', 'utf8');
  assert.ok(ps.includes("if($binding.tool_identity.version -cnotin @('engineering-02-v5-admission','engineering-02-v6-product')){throw 'SCOPE_ADMISSION_VERSION'}"));
  assert.doesNotMatch(ps, /version -cne 'engineering-02-v5-admission'/);
  assert.equal(ps.split("'SCOPE_ADMISSION_VERSION'").length - 1, 1);
});

historicalTest('R2 first failure and original two-row diagnostic remain UNKNOWN/FAIL', () => {
  const file = archiveFile('engineering-win10-entry-r1/resume-4/short-first-failure-return-r1/runs/f49752aa72d4ddd733e483cd61bd5dab/evidence/query-failure-f19490c2fad94115a6de8b6a79be2899.json');
  const saved = api.parseStrict(fs.readFileSync(file, 'utf8').replace(/:\s*([0-9]{18})/g, ':"$1"'));
  assert.equal(saved.error, 'LIFECYCLE_PARENT_CREATION_MISMATCH'); assert.equal(saved.ownership, 'UNKNOWN'); assert.equal(saved.binding.SecondStartedTicks, 'UNKNOWN');
  assert.equal(BigInt(saved.binding.ParentCreationTicks) - BigInt(saved.binding.CreationTicks), 1998146173n);
  const j=api.readJson(archiveFile('engineering-win10-entry-r1/resume-18/ordinary-direct/capture-before-assert.json'));
  const old=fs.readFileSync(archiveFile('engineering-win10-entry-r1/resume-17/tool-sources-v5-r6/forensic-admission.ps1'),'utf8');
  const condition=old.match(/if\((\$capture\.Gaps\.Count[^\n]+?)\)\{throw 'LIFECYCLE_OWN_CHILD_CAPTURE'\}/)[1];
  const capture={Gaps:{Count:j.gaps_count},Excluded:{Count:j.excluded_count},Added:{Count:j.added_count,0:{Pid:j.added[0].pid}}};
  assert.equal(vm.runInNewContext(condition.replace(/\$(capture|owned)/g,'$1').replace(/ -ne /g,' !== ').replace(/ -or /g,' || '),{capture,owned:{Id:j.owned.pid}}),true);
  const failure=api.readJson(archiveFile('engineering-win10-entry-r1/resume-18/ordinary-direct/capability-result.json'));assert.equal(failure.status,'FAIL');assert.equal(failure.details.owned_lifecycle.status,'UNKNOWN');
});
