import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bindingFixture, shapeFixture, temporary, historicalTest, archiveFile } from './fixtures/win10-test-fixture.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ui = require('../validation/win10/exit-dialog-action.cjs');
const api = require('../validation/win10/input-binding.cjs');
const now = Date.parse('2026-10-06T04:07:58.166Z');
const current = { request_id: 'a'.repeat(32), source: '8d207ab11d2c8134a81e4e62900f395aae99944e', master_sha256: 'b'.repeat(64), revision_sha256: 'c'.repeat(64), phase: 'StopExit', product_pid: 900, creation_ticks: '639268559292611658' };
const opened = { schema_version: 1, ...Object.fromEntries(Object.entries(current).filter(([k]) => k !== 'creation_ticks')), sequence: 1, status: 'ACTUAL_NATIVE_API_CALLED', called_at: new Date(now).toISOString() };
const window = { product_pid: current.product_pid, creation_ticks: current.creation_ticks, title: ui.TITLE, buttons: ui.BUTTONS.map(name => ({ name, enabled: true })), provider_status: 'SEMANTIC_WINDOW_OBSERVED' };
const receipt = { ...opened, status: 'ACTUAL_NATIVE_API_RETURNED', response: 0, returned_at: new Date(now + 2100).toISOString() }; delete receipt.called_at;

test('UI contract selects meaning and checks actual response separately; no GUI provider is invoked', () => {
  const plan = ui.planAction(opened, current, [window], now + 100);
  assert.equal(plan.status, 'NOT_PERFORMED'); assert.equal(plan.expected_button, '停止后退出');
  assert.equal(ui.verifyResponse(receipt, opened, current).elapsed_ms, 2100);
  assert.throws(() => ui.performAction(plan), /SCOPE_GUI_NOT_AUTHORIZED/);
  const c = { ...current, phase: 'ReleaseExit' }, o = { ...opened, phase: 'ReleaseExit' }, r = { ...receipt, phase: 'ReleaseExit', response: 1 };
  assert.equal(ui.planAction(o, c, [window], now).expected_button, '留给系统后退出'); assert.equal(ui.verifyResponse(r, o, c).response, 1);
});
test('ambiguous/old/disabled/wrong native windows and swapped/late/cancelled responses reject', () => {
  for (const windows of [[], [window, window], [{ ...window, product_pid: 1 }], [{ ...window, creation_ticks: '639268559292611659' }], [{ ...window, title: 'other' }], [{ ...window, buttons: [...window.buttons].reverse() }], [{ ...window, buttons: window.buttons.map(b => ({ ...b, enabled: false })) }]]) assert.throws(() => ui.planAction(opened, current, windows, now));
  assert.throws(() => ui.planAction(opened, current, [window], now + 120001), /TIMEOUT_NATIVE_DIALOG/);
  for (const patch of [{ response: 1 }, { response: 2 }, { sequence: 2 }, { request_id: 'd'.repeat(32) }, { returned_at: new Date(now - 1).toISOString() }, { returned_at: new Date(now + 160500).toISOString() }]) assert.throws(() => ui.verifyResponse({ ...receipt, ...patch }, opened, current));
  assert.equal(ui.verifyResponse({ ...receipt, returned_at: new Date(now + 120000).toISOString() }, opened, current).elapsed_ms, 120000);
});
historicalTest('historical wrong-choice and late observations remain failure records, while R2 response meanings match', () => {
  const r7 = api.readJson(archiveFile('a9-31-developer/product-r3-retry-r7/win10-evidence-matrix-r7.json'));
  assert.equal(r7.phases.filter(p => p.phase.startsWith('StopExit')).length, 3);
  assert.match(r7.phases.find(p => p.phase === 'StopExit attempt 1').result, /160\.5/);
  assert.match(r7.entry, /HALTED/);
  const r2 = api.readJson(archiveFile('a9-31-developer/product-r4-win10-r2/win10-evidence-matrix-r4-r2.json'));
  for (const [phase, response] of [['StopExit', 0], ['ReleaseExit', 1]]) {
    const click = r2.clicks[phase]; const c = { ...current, phase }, o = { ...opened, phase, called_at: click.opened }, r = { ...receipt, phase, response: click.response, returned_at: click.returned };
    assert.equal(ui.verifyResponse(r, o, c).response, response);
  }
});
test('PS source audit: native proof bodies stay unchanged, dual identities are consumed, no target execution is claimed', () => {
  const migrated = fs.readFileSync('scripts/release/validation/win10/serve-product-desktop.ps1', 'utf8');
  assert.ok(migrated.includes('$build.source -cne $engineering.components.capture.legacy_source_binding'));
  assert.ok(migrated.includes('$a.source -cne $engineering.components.capture.legacy_source_binding'));
  assert.ok(migrated.includes('$x.source -cne $engineering.components.observer.legacy_source_binding'));
  for (const name of ['stage-product.ps1', 'launch-product-desktop.ps1', 'serve-product-desktop.ps1', 'launch-manifest-observer.ps1']) {
    const s = fs.readFileSync(path.join('scripts/release/validation/win10', name), 'utf8');
    assert.ok(s.includes('Read-EngineeringBinding')); assert.ok(s.includes("Invoke-EngineeringJson 'authorize'")); assert.ok(s.includes("Invoke-EngineeringJson 'verify-static'"));
  }
  // PS5.1 parsing/ETW/NT-path execution are NOT_PERFORMED on this development machine.
});

historicalTest('native PS proof body comparison', () => {
  const old = fs.readFileSync(archiveFile('a9-31-developer/product-r4-win10-r2/control-scripts/serve-product-r3-desktop.ps1'), 'utf8');
  const migrated = fs.readFileSync('scripts/release/validation/win10/serve-product-desktop.ps1', 'utf8');
  const functionBody = (s, n) => { const start = s.indexOf('function ' + n + '('); assert.ok(start >= 0); return s.slice(start, s.indexOf('\nfunction ', start + 1)); };
  assert.equal(functionBody(migrated, 'Resolve-ManifestObservation'), functionBody(old, 'Resolve-ManifestObservation').replace('pin_sha256=$o.pin_sha256','build_scope_sha256=$o.build_scope.sha256').replace("$kind=if($image -ieq ($dev+'\\Windows\\System32\\cmd.exe')){'cmd'}elseif($image -ieq ($dev+'\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')){'powershell'}else{$null}", '$kind=Manifest-ParentKind $image $dev'));
});

test('current admission rejects old schema, missing cases, PASS substrings and constructed development results', () => {
  const current = bindingFixture('current');
  const checks = { schema_version: 3, status: 'DIRECTED_WIN10_CHECKS_PASS_NOT_PRODUCT', master_sha256: 'a'.repeat(64), execution_scope_sha256: api.scopeDigest(current), source: current.product_identity.source, tool_digest: current.tool_identity.files_digest, component_digest: api.componentDigest(current), run_id: 'b'.repeat(32), results: [] };
  assert.throws(() => api.verifyCurrentChecks(checks, current, checks.master_sha256, '/private/tmp'), /INTEGRITY_ADMISSION_SET/);
  assert.throws(() => api.verifyCurrentChecks({ ...checks, schema_version: 1 }, current, checks.master_sha256, '/private/tmp'), /INTEGRITY_CURRENT_ADMISSION/);
  const source = fs.readFileSync('scripts/release/validation/win10/serve-product-desktop.ps1', 'utf8');
  assert.ok(source.includes("Invoke-EngineeringJson 'assert-registration'"));
  assert.ok(source.includes("$i.Session -ne $script:ManifestSession"));
  assert.ok(source.includes('INTEGRITY_LEGACY_CHECKS_NOT_SUPPORTED'));
  assert.ok(!source.includes('$script:ManifestSession=3;'));
});

test('seven real fixture files with constructed PASS never become Win10 direct admission', () => {
  const dir = temporary('contract-');
  const current = bindingFixture('current');
  const fields = { schema_version: 3, status: 'PASS', evidence_scope: 'SURROGATE', machine: current.execution_scope.machine, master_sha256: 'a'.repeat(64), execution_scope_sha256: api.scopeDigest(current), tool_digest: current.tool_identity.files_digest, component_digest: api.componentDigest(current), run_id: 'b'.repeat(32), source: current.product_identity.source, pid: 123, creation_ticks: '639269600000000000', details: {} };
  const results = api.ADMISSION_CASES.map(case_id => { const file = path.join(dir, case_id + '.json'); api.writeNew(file, { ...fields, case_id }); return { case_id, status: 'PASS', record: api.fileRow(file) }; });
  const checks = { schema_version: 3, status: 'DIRECTED_WIN10_CHECKS_PASS_NOT_PRODUCT', master_sha256: fields.master_sha256, execution_scope_sha256: fields.execution_scope_sha256, source: fields.source, tool_digest: fields.tool_digest, component_digest: fields.component_digest, run_id: fields.run_id, results };
  assert.throws(() => api.verifyCurrentChecks(checks, current, fields.master_sha256, dir), /INTEGRITY_DIRECT_ADMISSION_RECORD/);
  for (const patch of [{ status: 'NOT_PASS' }, { status: 'NOT_PERFORMED' }]) assert.throws(() => api.verifyCurrentChecks({ ...checks, results: results.map((r,i) => i ? r : { ...r, ...patch }) }, current, fields.master_sha256, dir), /INTEGRITY_ADMISSION_RESULT/);
});

test('forensic consumer paths require actual new builds and persist explicit relationship exclusions without cleanup claims', () => {
  const base='scripts/release/validation/win10';
  const capture=fs.readFileSync(path.join(base,'capture-source.cs'),'utf8');
  assert.ok(capture.includes('childCheck=OpenQuery(row.Pid);parentCheck=OpenQuery(parent.Pid)'));
  assert.ok(capture.includes('foreach(Row x in second.GetFresh())'));
  assert.ok(capture.includes('AssertSameInstance(parent.Process,parentCheck'));
  assert.ok(capture.indexOf('p.Dispose();p=null;excluded.Add(exclusion)')>0);
  assert.ok(capture.includes('LIFECYCLE_CAPTURE_HELD_PID_REUSE_NOT_TRACKED'));
  assert.ok(!capture.includes('Sogou'));
  const serve=fs.readFileSync(path.join(base,'serve-product-desktop.ps1'),'utf8');
  assert.ok(serve.includes("Invoke-EngineeringJson 'validate-exclusion'"));
  assert.ok(serve.includes("Invoke-EngineeringJson 'validate-generations'"));
  assert.ok(serve.includes('RELATIONSHIP_EXCLUDED_NOT_PROCESS_EXIT'));
  assert.ok(serve.includes('build_scope_sha256=$o.build_scope.sha256'));
  assert.ok(serve.includes('INTEGRITY_CAPTURE_V5_CONTRACT'));
  assert.ok(serve.includes("Invoke-EngineeringJson 'assert-components'"));
  const observer=fs.readFileSync(path.join(base,'launch-manifest-observer.ps1'),'utf8');
  assert.ok(observer.includes('$build.artifact.mvid'));assert.ok(observer.includes('$build.artifact.sha256'));
  assert.ok(observer.includes("Invoke-EngineeringJson 'validate-generations'"));
  // Both schema consumers keep every existing forensic branch for v4.
  for(const text of [serve,observer]) {
    // ADR-0210: v3/v4 stay in one closed forensic family with v5 and v6.
    assert.ok(text.includes("$script:ForensicFamily=$engineering.tool_identity.version -cin @('engineering-02-v3','engineering-02-v4','engineering-02-v5-admission','engineering-02-v6-product')"));
    assert.doesNotMatch(text,/-c(?:eq|ne) 'engineering-02-v3'/);
  }
  assert.ok(serve.includes("(-not $script:ForensicFamily)"));

});

historicalTest('native import names retain original source closure', () => {
  const base='scripts/release/validation/win10';
  const capture=fs.readFileSync(path.join(base,'capture-source.cs'),'utf8');
  const importNames=s=>[...s.matchAll(/\[DllImport\([^\n]*?\)\]\s*(?:static\s+)?extern\s+\S+\s+(\w+)/g)].map(m=>m[1]).sort();
  const oldCapture=fs.readFileSync(archiveFile('a9-31-developer/product-r4-win10-r2/capture-built/capture-source.cs'),'utf8');
  const oldObserver=fs.readFileSync(archiveFile('engineering-win10-entry-r1/inputs/manifest-process-observer.cs'),'utf8');
  assert.ok(importNames(oldCapture).length>=10);assert.ok(importNames(oldObserver).length>=5);
  assert.deepEqual(importNames(capture),importNames(oldCapture));
  assert.deepEqual(importNames(fs.readFileSync(path.join(base,'manifest-process-observer.cs'),'utf8')),importNames(oldObserver));
});

// These are in-memory rejection fixtures. They do not execute Windows APIs or produce direct evidence.
const admissionNow = Date.parse('2026-10-07T14:30:00.000Z');
const utcTicks = ms => (BigInt(ms) * 10000n + 621355968000000000n).toString();
const clone = value => structuredClone(value);
function admissionFixture(ordinary = false) {
  const previous = bindingFixture('forensic');
  const prepared = api.createAdmissionStatic(previous), preparedHash = api.sha(Buffer.from(JSON.stringify(prepared,null,2)+'\n'));
  const approval = {response:'SURROGATE_NO_REMOTE_PERMISSION',review_sha256:'a'.repeat(64),prepared_binding_sha256:preparedHash,approved_at:new Date(admissionNow-1000).toISOString(),valid_until:new Date(admissionNow-1000+7200000).toISOString()};
  const b = api.approveAdmissionStatic(prepared,approval), pin = api.sha(Buffer.from(JSON.stringify(b,null,2)+'\n'));
  const parent = {pid:100,creation_ticks:utcTicks(admissionNow-100000),session:ordinary?3:0};
  const identity = {Sid:'S-1-5-21-3031939772-989444280-3099258187-'+(ordinary?'1005':'500'),User:'WIN-2JQ66JE4HTQ\\'+(ordinary?'a9builder':'Administrator'),IntegritySid:ordinary?'S-1-16-8192':'S-1-16-12288',Pid:100,Session:parent.session,Rid:ordinary?8192:12288,ElevationType:1,Elevated:!ordinary,Ordinary:ordinary,InJob:false};
  const c = {schema_version:1,status:'CURRENT_FORENSIC_CONTEXT_NOT_ADMISSION',evidence_scope:'WIN10_DIRECT',machine:b.execution_scope.machine,root:b.deployment.root,binding_sha256:pin,execution_scope_sha256:api.scopeDigest(b),tool_digest:b.tool_identity.files_digest,component_digest:api.componentDigest(b),source:b.product_identity.source,run_id:'1'.repeat(32),role:ordinary?'ORDINARY_FORENSIC_ADMISSION':'ADMIN_FORENSIC_ADMISSION',operation:ordinary?'ordinary-probe':'capture-self-query',parent,identity,explorer:null,created_at:new Date(admissionNow).toISOString(),deadline_at:new Date(admissionNow+180000).toISOString()};
  if(ordinary) {
    const cmd = {pid:99,creation_ticks:utcTicks(admissionNow-200000),session:3}, explorer = {pid:98,creation_ticks:utcTicks(admissionNow-300000),session:3};
    c.explorer = {parent:explorer,identity:{...identity,Pid:98},image:'C:\\Windows\\explorer.exe',chain:[{child:parent,parent:cmd},{child:cmd,parent:explorer}]};
  }
  const r = {schema_version:1,status:'PASS',evidence_scope:'WIN10_DIRECT',...Object.fromEntries(['binding_sha256','execution_scope_sha256','tool_digest','component_digest','source','run_id','role','operation','parent'].map(k=>[k,c[k]])),started_at:new Date(admissionNow+1).toISOString(),finished_at:new Date(admissionNow+1000).toISOString(),details:{artifact_sha256:b.components.capture.artifact.sha256,mvid:b.components.capture.artifact.mvid,pid:100,creation_ticks:parent.creation_ticks,session:parent.session,image:'\\Device\\HarddiskVolume3\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',snapshot_count:12,clock_before:utcTicks(admissionNow+2),clock_after:utcTicks(admissionNow+3),access:1052672,inheritable:false},error:null};
  return {previous,prepared,preparedHash,approval,b,pin,c,r};
}
test('admission approval binds exact preparation and two-hour window; product and legacy roles still deny', () => {
  const {prepared,approval,b} = admissionFixture();
  assert.equal(api.legacyMaster(b).scope_contract_sha256,api.ADMISSION_LOCAL_APPROVAL.adr_sha256);
  assert.deepEqual(b.components,prepared.components);
  for(const patch of [{prepared_binding_sha256:'0'.repeat(64)},{valid_until:approval.approved_at},{extra:true},{response:''}]) assert.throws(()=>api.approveAdmissionStatic(prepared,{...approval,...patch}));
  for(const patch of [{roles:['ORDINARY_PRODUCT']},{product_execution_authorized:true},{operations:{...b.execution_scope.operations,ORDINARY_FORENSIC_ADMISSION:['Boot']}}]) assert.throws(()=>api.validateStatic({...b,execution_scope:{...b.execution_scope,...patch}}));
  for(const op of ['Boot','Run','Stop','Build','Background','']) assert.throws(()=>api.requireWin10Execution(b,'ADMIN_FORENSIC_ADMISSION',op),/SCOPE_ADMISSION_OPERATION/);
  assert.throws(()=>api.requireWin10Execution(b,'ORDINARY_PRODUCT','ordinary-probe'),/SCOPE_ADMISSION_OPERATION/);
  assert.throws(()=>api.requireWin10Execution(prepared,'ADMIN_FORENSIC_ADMISSION','capture-self-query'),/SCOPE_ADMISSION_REMOTE_NOT_APPROVED/);
});
test('current context rejects stale time, reused PID, wrong root/source/digests and substituted desktop identity', () => {
  const {b,pin,c} = admissionFixture(true);
  assert.equal(api.validateAdmissionContext(c,b,pin,admissionNow+1),c);
  for(const mutate of [x=>x.root=x.root.replace('R4','R3'),x=>x.source='0'.repeat(40),x=>x.binding_sha256='0'.repeat(64),x=>x.tool_digest='0'.repeat(64),x=>x.component_digest='0'.repeat(64),x=>x.evidence_scope='SURROGATE',x=>delete x.explorer,x=>x.explorer.chain[0].parent.pid=x.parent.pid,x=>x.explorer.parent.creation_ticks=x.parent.creation_ticks,x=>x.identity.InJob=true,x=>x.identity.Elevated=true,x=>x.identity.Session=0,x=>x.parent.creation_ticks=utcTicks(admissionNow+2),x=>x.extra=true]) {const wrong=clone(c);mutate(wrong);assert.throws(()=>api.validateAdmissionContext(wrong,b,pin,admissionNow+1));}
  assert.throws(()=>api.validateAdmissionContext(c,b,pin,admissionNow-1),/LIFECYCLE_ADMISSION_CONTEXT_TIME/);
  assert.throws(()=>api.validateAdmissionContext(c,b,pin,admissionNow+180000),/LIFECYCLE_ADMISSION_CONTEXT_TIME/);
});
test('query capability checks exact native instance, access and current clock interval rather than a claimed PASS', () => {
  const {prepared,b,c,r} = admissionFixture();
  assert.equal(api.verifyCapability(r,b,c),r);
  assert.throws(()=>api.verifyCapability(r,prepared,c),/SCOPE_ADMISSION_REMOTE_NOT_APPROVED/);
  for(const patch of [{pid:101},{creation_ticks:utcTicks(admissionNow-99999)},{image:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'},{image:'\\Device\\HarddiskVolume3wrong\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'},{mvid:b.components.observer.artifact.mvid},{access:2035711},{inheritable:true},{clock_after:utcTicks(admissionNow+1)},{clock_before:utcTicks(admissionNow-1)},{clock_after:utcTicks(admissionNow+1002)}]) assert.throws(()=>api.verifyCapability({...r,details:{...r.details,...patch}},b,c));
  for(const patch of [{status:'UNKNOWN'},{evidence_scope:'SURROGATE'},{run_id:'2'.repeat(32)},{finished_at:c.deadline_at},{parent:{...c.parent,creation_ticks:utcTicks(admissionNow-99999)}}]) assert.throws(()=>api.verifyCapability({...r,...patch},b,c));
});
function ordinarySet(child, parent) {
  return {schema_version:1,raw_added_count:1,root_count:1,console_count:0,gap_count:0,excluded_count:0,instances:[{kind:'powershell',pid:child.pid,parent_pid:parent.pid,creation_ticks:child.creation_ticks,parent_creation_ticks:parent.creation_ticks,session:child.session,image:child.image,proof:{actual_pid:child.pid,snapshot_started_ticks:child.creation_ticks,snapshot_captured_ticks:child.creation_ticks,query_ticks:child.creation_ticks,creation_ticks:child.creation_ticks,parent_creation_ticks:parent.creation_ticks,session:String(child.session),image:child.image,clock_profile:api.POLICY.capture_clock,second_observation:'NOT_REQUIRED',ownership:'PROVEN'},same_instance:true,exit_code:child.exit_code,exit_ticks:child.exit_ticks,held_query_after_exit:true}]};
}
test('ordinary capability retains exit query and reports only its observed canary directions', () => {
  const {b,c,r} = admissionFixture(true);
  r.details = {child:{pid:101,creation_ticks:utcTicks(admissionNow+2),session:3,image:'\\Device\\HarddiskVolume3\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',exit_code:0,exit_ticks:utcTicks(admissionNow+20),same_instance:true,capture_added:1,capture_gaps:0,capture_exclusions:0,output:'A9-FORENSIC-OWNED-CHILD',held_query_after_exit:true},canary:{canary_run_id:'3'.repeat(32),binding_sha256:c.binding_sha256,files:['admin-a.json','admin-b.json','ordinary-a.json','ordinary-b.json'].map(file=>({file,size:100,sha256:'4'.repeat(64)})),directions:['admin-write-user-read','user-read-admin-write'].map(direction=>({direction,status:'PASS'}))}};
  r.details.capture_set=ordinarySet(r.details.child,r.parent);
  assert.equal(api.verifyCapability(r,b,c),r);
  for(const patch of [{exit_code:'UNKNOWN'},{held_query_after_exit:false},{same_instance:false},{capture_gaps:1},{capture_exclusions:1},{exit_ticks:utcTicks(admissionNow+1002)},{creation_ticks:c.parent.creation_ticks},{image:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'}]) assert.throws(()=>api.verifyCapability({...r,details:{...r.details,child:{...r.details.child,...patch}}},b,c));
  for(const mutate of [x=>x.binding_sha256='0'.repeat(64),x=>x.files[0].file='old.json',x=>x.directions.push({direction:'user-write-admin-read',status:'PASS'})]) {const wrong=clone(r);mutate(wrong.details.canary);assert.throws(()=>api.verifyCapability(wrong,b,c));}
});
test('complete ordinary capture consumer replays the real two-row counterexample as SURROGATE, rejects every unproven row and old shape', () => {
  const actual=shapeFixture('capture');
  assert.equal(actual.added_count,2);assert.equal(actual.gaps_count,0);assert.equal(actual.excluded_count,0);
  const {b,c,r}=admissionFixture(true),parent=r.parent,rootTicks=utcTicks(admissionNow+2),consoleTicks=utcTicks(admissionNow+3),exit=utcTicks(admissionNow+20);
  const child={pid:101,creation_ticks:rootTicks,session:parent.session,image:actual.owned.image,exit_code:0,exit_ticks:exit,same_instance:true,capture_added:2,capture_gaps:0,capture_exclusions:0,output:'A9-FORENSIC-OWNED-CHILD',held_query_after_exit:true};
  // Exit values and rebased identity/time are explicitly SURROGATE, never reconstructed Win10 facts.
  const set=ordinarySet(child,parent);set.raw_added_count=2;set.console_count=1;
  set.instances.push({kind:'conhost',pid:102,parent_pid:101,creation_ticks:consoleTicks,parent_creation_ticks:rootTicks,session:parent.session,image:actual.added[1].binding.image,proof:{...set.instances[0].proof,actual_pid:102,creation_ticks:consoleTicks,parent_creation_ticks:rootTicks,image:actual.added[1].binding.image,snapshot_started_ticks:utcTicks(admissionNow+4),snapshot_captured_ticks:utcTicks(admissionNow+5),query_ticks:utcTicks(admissionNow+6)},same_instance:true,exit_code:0,exit_ticks:exit,held_query_after_exit:true});
  r.details={child,capture_set:set,canary:{canary_run_id:'3'.repeat(32),binding_sha256:c.binding_sha256,files:['admin-a.json','admin-b.json','ordinary-a.json','ordinary-b.json'].map(file=>({file,size:100,sha256:'4'.repeat(64)})),directions:['admin-write-user-read','user-read-admin-write'].map(direction=>({direction,status:'PASS'}))}};
  assert.equal(api.verifyCapability(r,b,c),r);const reversed=clone(r);reversed.details.capture_set.instances.reverse();assert.equal(api.verifyCapability(reversed,b,c),reversed);
  const oldShape=clone(r);delete oldShape.details.capture_set;assert.throws(()=>api.verifyCapability(oldShape,b,c));
  for(const field of ['schema_version','raw_added_count','root_count','console_count','gap_count','excluded_count']){const bad=clone(r);bad.details.capture_set[field]++;assert.throws(()=>api.verifyCapability(bad,b,c),field);}
  for(const mutate of [x=>delete x.capture_set,x=>x.capture_set.instances=[],x=>x.capture_set.instances.push(clone(x.capture_set.instances[1])),x=>x.capture_set.instances[1].pid=x.capture_set.instances[0].pid,x=>x.child.capture_added=1,x=>x.child.exit_ticks=utcTicks(admissionNow+19)]){const bad=clone(r);mutate(bad.details);assert.throws(()=>api.verifyCapability(bad,b,c));}
  for(let index=0;index<2;index++){
    for(const [key,value] of Object.entries({kind:'other',pid:999,parent_pid:999,creation_ticks:'UNKNOWN',parent_creation_ticks:'UNKNOWN',session:99,image:'C:\\Windows\\System32\\conhost.exe',same_instance:false,exit_code:9,exit_ticks:'UNKNOWN',held_query_after_exit:false})){const bad=clone(r);bad.details.capture_set.instances[index][key]=value;assert.throws(()=>api.verifyCapability(bad,b,c),key);}
    for(const key of Object.keys(set.instances[index].proof)){const bad=clone(r);bad.details.capture_set.instances[index].proof[key]='UNKNOWN';assert.throws(()=>api.verifyCapability(bad,b,c),key);}
  }
  for(const mutate of [x=>x.image=x.image.replace('Volume3','Volume32'),x=>x.image+='\\other',x=>x.parent_creation_ticks=utcTicks(admissionNow+1),x=>x.creation_ticks=parent.creation_ticks,x=>x.proof.snapshot_captured_ticks=utcTicks(admissionNow),x=>x.proof.query_ticks=utcTicks(admissionNow+30),x=>x.exit_ticks=utcTicks(admissionNow+8003)]){const bad=clone(r);mutate(bad.details.capture_set.instances[1]);assert.throws(()=>api.verifyCapability(bad,b,c));}
  const unknown=clone(r);unknown.status='FAIL';unknown.error='LIFECYCLE_OWN_CHILD_CAPTURE';assert.throws(()=>api.verifyCapability(unknown,b,c));
});
test('administrator canary result binds a separate ordinary receipt before claiming four directions', () => {
  const {b,c,r}=admissionFixture();c.operation=r.operation='canary-admin';
  const canary={canary_run_id:'3'.repeat(32),binding_sha256:c.binding_sha256,files:['admin-a.json','admin-b.json','ordinary-a.json','ordinary-b.json'].map(file=>({file,size:100,sha256:'4'.repeat(64)})),directions:['admin-write-user-read','user-write-admin-read','admin-read-user-write','user-read-admin-write'].map(direction=>({direction,status:'PASS'})),ordinary_receipt:{run_id:'5'.repeat(32),context_sha256:'6'.repeat(64),result_sha256:'7'.repeat(64)}};
  r.details={canary};assert.equal(api.verifyCapability(r,b,c),r);
  for(const mutate of [x=>delete x.ordinary_receipt,x=>x.ordinary_receipt.run_id=c.run_id,x=>x.ordinary_receipt.result_sha256='UNKNOWN',x=>x.directions.pop()]) {const wrong=clone(r);mutate(wrong.details.canary);assert.throws(()=>api.verifyCapability(wrong,b,c));}
});
test('observer receipt requires exact native volume, both generation proofs and a closed current session', () => {
  const {b,c,r}=admissionFixture();c.operation=r.operation='observer-admit';
  const old=shapeFixture('observer'), a=clone(old);
  Object.assign(a,{label:c.run_id,exe_sha256:b.components.observer.artifact.sha256,mvid:b.components.observer.artifact.mvid,build_scope_sha256:b.components.observer.build_scope.sha256,own_session_absent:true,native_images:[]});
  Object.assign(a.observer_final,{source:b.components.observer.legacy_source_binding,master_sha256:c.binding_sha256,dispatcher_pid:c.parent.pid,dispatcher_creation_filetime:(BigInt(c.parent.creation_ticks)-504911232000000000n).toString(),revision_sha256:api.sha(Buffer.from(JSON.stringify(api.createRevision(b,c.binding_sha256,'controlled-boot'),null,2)+'\n'))});
  for(let i=0;i<2;i++) {
    const root=a.roots[i], created=utcTicks(admissionNow+2+i*20), exited=utcTicks(admissionNow+15+i*20);
    Object.assign(root,{parent:c.parent.pid,create_ticks:created,exit_ticks:exited,create_filetime:(BigInt(created)-504911232000000000n).toString()});
    Object.assign(a.proofs[i],{parent_create_filetime:root.create_filetime,snapshot_start_filetime:root.create_filetime,snapshot_captured_filetime:(BigInt(exited)-504911232000000000n).toString(),create_filetime:(BigInt(created)+10000n-504911232000000000n).toString(),exit_filetime:(BigInt(exited)-504911232000000000n).toString()});
    const tail=i?'\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe':'\\Windows\\System32\\cmd.exe';
    a.native_images.push({kind:root.kind,pid:root.pid,creation_ticks:created,session:0,image:a.observer_final.c_device_mapping+tail,normalized:('c:'+tail).replaceAll('\\','/').toLowerCase(),held_query_after_exit:true});
  }
  r.details={admission:a};assert.equal(api.verifyCapability(r,b,c),r);
  for(const mutate of [x=>x.own_session_absent=false,x=>x.observer_final.events_lost=1,x=>x.observer_final.consumer_ended=false,x=>x.observer_final.open_instances=[{}],x=>x.observer_final.revision_sha256='0'.repeat(64),x=>x.proofs[0].parent_create_filetime='134000000000000000',x=>x.native_images[0].image=x.native_images[0].image.replace('HarddiskVolume3','HarddiskVolume32'),x=>x.native_images[1].held_query_after_exit=false,x=>x.roots[0].create_ticks=Number(x.roots[0].create_ticks)]) {const wrong=clone(r);mutate(wrong.details.admission);assert.throws(()=>api.verifyCapability(wrong,b,c));}
});
test('fixed PS orchestration persists first failures and binds same-round canaries; no arbitrary product or force action', () => {
  const base='scripts/release/validation/win10', harness=fs.readFileSync(path.join(base,'forensic-admission.ps1'),'utf8'), observer=fs.readFileSync(path.join(base,'launch-manifest-observer.ps1'),'utf8'), serve=fs.readFileSync(path.join(base,'serve-product-desktop.ps1'),'utf8');
  assert.ok(harness.indexOf("Invoke-Central 'authorize-admission-start'")<harness.indexOf('[Reflection.Assembly]::Load'));
  assert.ok(harness.includes('$ordinaryResult.details.canary.canary_run_id -cne $CanaryRunId'));
  assert.ok(harness.includes("$capture=[A31Capture]::Capture"));assert.ok(harness.includes('Get-OrdinaryCaptureSet $capture $context $lifecycle'));
  assert.ok(harness.includes('owned_lifecycle=$lifecycle'));assert.ok(harness.includes("[IO.FileMode]::CreateNew"));
  assert.ok(serve.includes('$kind=Manifest-ParentKind $image $dev'));assert.ok(harness.includes('Manifest-ParentKind $native.image'));
  for(const text of [harness,observer,serve]) {assert.ok(text.includes('inputs\\bindings\\'));assert.ok(text.includes('control\\versions\\'));}
  assert.ok(observer.includes("$Mode -cne 'Admit'"));assert.ok(observer.includes('native_images=$nativeImages'));assert.ok(observer.includes('stop_recovery=$stopRecovery'));
  assert.ok(observer.indexOf("'admission-session-intent.json'")<observer.indexOf('$h=Start-Observer $rid $self.Id'));assert.ok(observer.includes("'root-dispatch-'"));
  assert.ok(observer.includes("query_code='UNKNOWN'"));assert.ok(observer.includes('[A31ManifestObserver]::NormalizeImage($q.ImagePath,$mapping)'));
  assert.equal(api.ADMISSION_CASES.length,7);
  for(const text of [harness,observer]) assert.doesNotMatch(text,/Stop-Process|taskkill|Kill\(|Set-Acl|icacls|Invoke-Expression|Start-Service|New-Service/);
  // Real PS5.1 parsing, query handles, ETW and ordinary desktop input remain NOT_PERFORMED here.
});
