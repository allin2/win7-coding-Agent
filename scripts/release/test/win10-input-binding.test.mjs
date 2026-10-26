import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const api = require('../validation/win10/input-binding.cjs');
const tool = path.resolve('scripts/release/validation/win10/input-binding.cjs');
const history = '/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer';
const out = path.resolve('outputs/engineering-win10-entry-20261007-r1/fixtures');
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync(path.join(out, 'binding-'));
const target = 'C:\\Users\\a9builder.WIN-2JQ66JE4HTQ\\AppData\\Local\\A9-Engineering-Win10-Entry-20261007-R1';
const head = 'a53c9b9d861486e5923bc82ea70b31b76af1a939';
const b = api.createStatic(path.join(history, 'product-r4-win10-r2'), path.join(history, 'product-r4'), target, head);
const copy = () => structuredClone(b);
const cli = args => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });

test('strict parsing rejects duplicate/escaped keys, prototypes, invalid JSON and unsupported schema', () => {
  for (const value of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"x":{"k":1,"k":2}}', '{"__proto__":{}}', '{"a":NaN}', '\ufeff{}', '{} trailing']) assert.throws(() => api.parseStrict(value));
  assert.deepEqual(api.parseStrict('{"a":[true,null,"中文\\n"],"b":0}'), { a: [true, null, '中文\n'], b: 0 });
  const bad = copy(); bad.schema_version = 1; assert.throws(() => api.validateStatic(bad), /INTEGRITY_SCHEMA/);
});
test('actual CLI generates deterministic local static inputs and exclusively refuses overwrite', () => {
  const args = ['static', path.join(history, 'product-r4-win10-r2'), path.join(history, 'product-r4'), target, head];
  const a = path.join(dir, 'static-a.json'), c = path.join(dir, 'static-b.json');
  assert.equal(cli([...args, a]).status, 0); assert.equal(cli([...args, c]).status, 0);
  assert.deepEqual(fs.readFileSync(a), fs.readFileSync(c));
  const saved = fs.readFileSync(a); const digest = api.sha(saved);
  assert.equal(cli(['verify-static', a, digest]).status, 0);
  const denied = spawnSync(process.execPath, [path.join(path.dirname(tool), 'product-driver.cjs')], { encoding: 'utf8', env: { ...process.env, A9_ENGINEERING_BINDING: a, A9_ENGINEERING_BINDING_SHA256: digest } });
  assert.notEqual(denied.status, 0); assert.match(denied.stderr, /SCOPE_WIN10_NOT_AUTHORIZED/); assert.doesNotMatch(denied.stderr, /Cannot find module 'electron'/);
  const probe = spawnSync(process.execPath, [path.join(path.dirname(tool), 'product-driver.cjs'), '--sync-probe-preflight'], { encoding: 'utf8', env: { ...process.env, A9_ENGINEERING_BINDING: a, A9_ENGINEERING_BINDING_SHA256: digest, A9_SYNC_PREFLIGHT_INPUT: '' } });
  assert.notEqual(probe.status, 0); assert.match(probe.stderr, /SCOPE_WIN10_NOT_AUTHORIZED/); assert.doesNotMatch(probe.stderr, /ENOENT|ERR_INVALID_ARG_TYPE/);
  assert.notEqual(cli([...args, a]).status, 0); assert.deepEqual(fs.readFileSync(a), saved);
  assert.notEqual(cli(['verify-static', a, '0'.repeat(64)]).status, 0);
  assert.notEqual(cli(['static', ...args.slice(1), '/private/tmp/unauthorized-engineering.json']).status, 0);
  assert.notEqual(cli(['unknown']).status, 0);
});
test('component provenance is immutable; changing product identity does not rebind original component records', () => {
  const x = copy(); x.product_identity.source = 'a'.repeat(40);
  assert.equal(api.validateStatic(x), x);
  assert.equal(x.components.capture.legacy_source_binding, b.components.capture.legacy_source_binding);
  assert.equal(x.components.capture.build_bytes, b.components.capture.build_bytes);
  assert.equal(x.compatibility.master.source, b.compatibility.master.source);
  assert.equal(api.legacyMaster(x).source, x.product_identity.source);
  // This is an offline contract example, not a package or cross-product runtime PASS.
  for (const edit of [
    x => { x.product_identity.zip.sha256 = 'b'.repeat(64); },
    x => { x.compatibility.master.source = 'b'.repeat(40); },
    x => { x.compatibility.master.sync_contract.cmd.sha256 = 'b'.repeat(64); },
    x => { x.compatibility.master.manifest_observer.contract.tolerance_ticks++; },
    x => { x.components.capture.legacy_source_binding = 'b'.repeat(40); },
    x => { x.components.capture.legacy_build.compiler.sha256 = 'b'.repeat(64); },
    x => { x.components.capture.legacy_build.arguments += ' /reference:unapproved.dll'; },
    x => { x.components.capture.artifact.mvid = '00000000-0000-0000-0000-000000000000'; },
    x => { x.components.observer.legacy_build.mvid = '00000000-0000-0000-0000-000000000000'; },
    x => { x.components.observer.build_bytes = Buffer.from('{}').toString('base64'); },
    x => { x.tool_identity.files[0].sha256 = 'b'.repeat(64); },
    x => { x.policy.request_limit = 17; },
    x => { x.approval.scope = 'WIN10_EXECUTION'; },
    x => { x.deployment.root = b.compatibility.master.root; },
    x => { x.pid = 90920; }
  ]) { const x = copy(); edit(x); assert.throws(() => api.validateStatic(x)); }
});
test('four explicit revisions preserve closure and distinguish actual driver modes', () => {
  const digest = 'd'.repeat(64); const rows = [];
  for (const label of ['controlled-boot', 'normal-short', 'normal-full', 'ready-negative']) {
    const r = api.createRevision(b, digest, label); rows.push(r);
    const v = api.unwrapRevision(r, b, digest);
    assert.equal(v.root, target); assert.equal(v.source, b.product_identity.source);
    assert.equal(v.capture_library.sha256, b.components.capture.artifact.sha256);
    assert.equal(v.scripts.length, 4); assert.equal(v.status, 'LOCAL_ENGINEERING_REVISION_NOT_ADMITTED');
    const bad = structuredClone(r); bad.compatibility.revision.source = 'f'.repeat(40); assert.throws(() => api.unwrapRevision(bad, b, digest));
  }
  assert.equal(new Set(rows.map(r => api.sha(Buffer.from(JSON.stringify(r))))).size, 4);
  assert.throws(() => api.createRevision(b, digest, '../normal-full'));
});
test('real sync receipt replay binds current parent and rejects old parents, reused runs and clock changes', () => {
  const actual = api.readJson(path.join(history, 'product-r4-win10-r2/directed-validation-sync-actual.json'));
  const receipt = actual.actual_receipt[0];
  const context = { root: target, request_id: receipt.request_id, master_sha256: receipt.master_sha256, revision_sha256: receipt.revision_sha256, parent: receipt.parent, identity: actual.kernel_parent.identity, identity_scope: 'ADMIN_TOOL_ADMISSION' };
  const r = api.createRuntime(b, receipt, context, 'e'.repeat(32), []);
  assert.equal(api.verifyRuntime(r, b, context), r);
  assert.equal(typeof r.context.parent.creation_ticks, 'string');
  assert.equal(Object.keys(r.manifest_parameters).length, 5);
  assert.throws(() => api.createRuntime(b, receipt, context, r.run_id, [r.run_id]), /OLD_PROBE_RUN/);
  assert.throws(() => api.createRuntime(b, receipt, { ...context, identity_scope: 'ORDINARY_PRODUCT' }, r.run_id, []), /IDENTITY_ORDINARY_DESKTOP_REQUIRED/);
  for (const patch of [ { ...context, root: b.compatibility.master.root }, { ...context, parent: { ...receipt.parent, pid: 90920 } }, { ...context, parent: { ...receipt.parent, creation_ticks: Number(receipt.parent.creation_ticks) } } ]) assert.throws(() => api.createRuntime(b, receipt, patch, 'e'.repeat(32), []));
  for (const edit of [x => x.returned_monotonic_ns = '1', x => x.returned_utc_ms += 40, x => x.argv.push('delete'), x => x.result.status = null, x => x.parent.creation_ticks = '639268178456486735']) {
    const x = structuredClone(receipt); edit(x); assert.throws(() => api.createRuntime(b, x, context, 'e'.repeat(32), []));
  }
  const bad = structuredClone(r); delete bad.manifest_parameters.Tag; assert.throws(() => api.verifyRuntime(bad, b, context));
  api.writeNew(path.join(dir, 'receipt.json'), receipt); api.writeNew(path.join(dir, 'context.json'), context); api.writeNew(path.join(dir, 'used.json'), []);
  const staticFile = path.join(dir, 'static-a.json'); const hash = api.sha(fs.readFileSync(staticFile));
  const result = cli(['runtime', staticFile, hash, path.join(dir, 'receipt.json'), path.join(dir, 'context.json'), 'e'.repeat(32), path.join(dir, 'used.json'), path.join(dir, 'runtime.json')]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(cli(['verify-runtime', staticFile, hash, path.join(dir, 'runtime.json'), path.join(dir, 'context.json'), 'local-replay']).status, 0);
});
test('admission requires exact cases and shared identities, not PASS substrings or exit zero', () => {
  const a = { case_id: 'schema', status: 'PASS', source: b.product_identity.source, tool_digest: b.tool_identity.files_digest, run_id: 'a'.repeat(32) };
  api.verifyAdmission([a, { ...a, case_id: 'entry' }], ['schema', 'entry']);
  for (const rows of [[a], [a, a], [a, { ...a, case_id: 'entry', status: 'NOT_PERFORMED' }], [a, { ...a, case_id: 'entry', status: 'NOT_PASS' }], [a, { ...a, case_id: 'entry', run_id: 'b'.repeat(32) }]]) assert.throws(() => api.verifyAdmission(rows, ['schema', 'entry']));
  assert.throws(() => api.requireWin10Execution(b), /SCOPE_WIN10_NOT_AUTHORIZED/);
});
test('symlink inputs and outputs are refused without modifying the target', () => {
  const real = path.join(dir, 'symlink-original.json'); fs.writeFileSync(real, '{}', { flag: 'wx' });
  const link = path.join(dir, 'symlink.json'); fs.symlinkSync(real, link);
  assert.throws(() => api.readJson(link), /INTEGRITY_REPARSE/);
  assert.throws(() => api.writeNew(link, {}), /INTEGRITY_REPARSE/);
  assert.equal(fs.readFileSync(real, 'utf8'), '{}');
});

const currentComponent = path.resolve('.acceptance/engineering-win10-entry-r1/resume-2/component-return-r3');
const currentRoot = target.replace('-R1', '-R2');
const currentBinding = () => api.createWin10Static(path.join(history, 'product-r4-win10-r2'), path.join(history, 'product-r4'), currentComponent, currentRoot, head);
test('schema3 actual build and scope remain distinct from old pin and local approval', () => {
  const current = currentBinding();
  assert.equal(current.components.observer.artifact.sha256, '3ae30252c0eefdbd451432ee2e801656f0ffd530237cefde3194ffa7572651b6');
  const build = api.parseStrict(Buffer.from(current.components.observer.build_bytes, 'base64').toString('utf8'));
  assert.equal(build.scope_sha256, current.components.observer.build_scope.sha256); assert.equal(Object.hasOwn(build, 'pin_sha256'), false);
  assert.equal(current.implementation_approval.scope, 'LOCAL_IMPLEMENTATION_ONLY');
  assert.equal(current.execution_scope.approval.decision, 'ADR-0195');
  assert.equal(api.legacyMaster(current).manifest_observer.build_scope.sha256, build.scope_sha256);
  assert.equal(Object.hasOwn(api.legacyMaster(current).manifest_observer, 'pin_sha256'), false);
  const file = path.join(dir, 'win10-static.json');
  const result = cli(['win10-static', path.join(history, 'product-r4-win10-r2'), path.join(history, 'product-r4'), currentComponent, currentRoot, head, file]);
  assert.equal(result.status, 0, result.stderr); const digest = api.sha(fs.readFileSync(file));
  assert.equal(cli(['verify-static', file, digest]).status, 0);
  assert.equal(cli(['project-master', file, digest]).status, 0);
  assert.notEqual(cli(['authorize', file, digest, 'ORDINARY_PRODUCT']).status, 0);
  for (const edit of [x => x.components.observer.build_scope.sha256 = '0'.repeat(64), x => x.components.observer.build_bytes = b.components.observer.build_bytes, x => x.components.observer.artifact = b.components.observer.artifact, x => x.components.observer.bootstrap.sha256 = '0'.repeat(64), x => x.historical_reference.contract.manifest_observer.contract.tolerance_ticks++, x => x.execution_scope.roles.push('ADMIN_PRODUCT'), x => x.execution_scope.approval.response = 'yes', x => x.product_identity.source = '0'.repeat(40), x => x.product_identity.helper = '0'.repeat(64), x => x.deployment.observer_root = b.deployment.observer_root]) {
    const changed = structuredClone(current); edit(changed); assert.throws(() => api.validateStatic(changed));
  }
});
test('ordinary current Session is pinned while administrator, Host Job, old scope and historical receipts still reject', () => {
  const current = currentBinding(), parent = { pid: 123, creation_ticks: '639269600000000000', session: 2 };
  const identity = { Sid: 'S-1-5-21-3031939772-989444280-3099258187-1005', User: 'WIN-2JQ66JE4HTQ\\a9builder', IntegritySid: 'S-1-16-8192', Pid: 123, Session: 2, Rid: 8192, ElevationType: 3, Elevated: false, Ordinary: true, InJob: false };
  // Constructed contract fixture only. This is not a measured desktop or admission.
  api.currentIdentity(identity, parent, 'ORDINARY_PRODUCT', 2);
  for (const patch of [{ InJob: true }, { Elevated: true }, { Sid: 'S-1-5-21-3031939772-989444280-3099258187-500' }, { Session: 3 }]) assert.throws(() => api.currentIdentity({ ...identity, ...patch }, parent, 'ORDINARY_PRODUCT', 2));
  assert.throws(() => api.currentIdentity(identity, parent, 'ORDINARY_PRODUCT', 3));
  const digest = api.sha(Buffer.from(JSON.stringify(current, null, 2) + '\n'));
  const desktop = { schema_version: 3, status: 'ORDINARY_DESKTOP_OBSERVED', machine: 'WIN-2JQ66JE4HTQ', root: currentRoot, binding_sha256: digest, execution_scope_sha256: api.scopeDigest(current), observed_utc: new Date().toISOString(), parent, identity };
  assert.equal(api.validateDesktop(desktop, current, digest), desktop);
  for (const patch of [{ execution_scope_sha256: '0'.repeat(64) }, { binding_sha256: '0'.repeat(64) }, { observed_utc: '2026-10-01T00:00:00Z' }, { parent: { ...parent, creation_ticks: Number(parent.creation_ticks) } }]) assert.throws(() => api.validateDesktop({ ...desktop, ...patch }, current, digest));
  const actual = api.readJson(path.join(history, 'product-r4-win10-r2/directed-validation-sync-actual.json')), receipt = actual.actual_receipt[0];
  const context = { root: currentRoot, request_id: receipt.request_id, master_sha256: receipt.master_sha256, revision_sha256: receipt.revision_sha256, parent: receipt.parent, identity: actual.kernel_parent.identity, identity_scope: 'ADMIN_TOOL_ADMISSION', tool_digest: current.tool_identity.files_digest, execution_scope_sha256: api.scopeDigest(current) };
  assert.throws(() => api.createRuntime(current, receipt, context, receipt.request_id, []), /LIFECYCLE_CURRENT_INPUT_BINDING/);
});

test('new forensic build preparation pins origins and exact dependencies, and remains unauthorized remotely', () => {
  const previous = api.createWin10Static(path.join(history, 'product-r4-win10-r2'), path.join(history, 'product-r4'), '.acceptance/engineering-win10-entry-r1/resume-2/component-return-r3', target.replace(/R1$/, 'R2'), head);
  for (const component of ['capture', 'observer']) {
    const scope = api.createForensicScope(previous, component, 'e'.repeat(32));
    assert.equal(scope.status, 'LOCAL_PREPARATION_NOT_REMOTE_AUTHORIZATION'); assert.equal(scope.remote_approval, null);
    assert.equal(scope.product_execution_authorized, false); assert.equal(scope.dependencies.length, 10);
    assert.equal(scope.origin_snapshot.sha256, api.FORENSIC_ORIGINS[component].sha256);
    assert.equal(scope.source_snapshot.sha256, api.fileRow(path.join(path.dirname(tool), scope.source_snapshot.file)).sha256);
    assert.notEqual(scope.origin_snapshot.sha256, scope.source_snapshot.sha256);
    assert.match(api.buildArguments(scope), /\/platform:x64/);
    for (const change of [s => s.root=previous.deployment.root, s => s.source_snapshot.file='other.cs', s => s.origin_snapshot.sha256='0'.repeat(64), s => s.dependencies[0].sha256='0'.repeat(64), s => s.compile_timeout_ms=31000, s => s.product_execution_authorized=true, s => s.remote_approval={response:'approved',review_sha256:'a'.repeat(64)}, s => s.extra=true]) {
      const wrong=JSON.parse(JSON.stringify(scope)); change(wrong); assert.throws(()=>api.validateForensicScope(wrong));
    }
  }
  const builder=fs.readFileSync(path.join(path.dirname(tool),'build-forensic-components.ps1'),'utf8');
  assert.ok(builder.indexOf('SCOPE_REMOTE_BUILD_NOT_APPROVED') < builder.indexOf('[IO.Directory]::CreateDirectory'));
  assert.ok(builder.includes('WaitForExit(30000)')); assert.ok(builder.includes('1000-[int]$drain.ElapsedMilliseconds'));
  assert.ok(builder.includes('INTEGRITY_BUILD_SOURCE_DRIFT')); assert.ok(builder.includes('INTEGRITY_BUILD_VALIDATOR_SOURCE'));
});

test('constructed forensic build fixtures bind both artifacts; old build/MVID/source cannot cross-bind and execution remains blocked', () => {
  const previous = api.createWin10Static(path.join(history, 'product-r4-win10-r2'), path.join(history, 'product-r4'), '.acceptance/engineering-win10-entry-r1/resume-2/component-return-r3', target.replace(/R1$/, 'R2'), head);
  const fixture=path.join(dir,'forensic-SURROGATE');fs.mkdirSync(fixture);
  const directories={};
  for(const id of ['capture','observer']) {
    const d=path.join(fixture,id);fs.mkdirSync(d);directories[id]=d;
    const scope=api.createForensicScope(previous,id,(id==='capture'?'e':'f').repeat(32));
    // Constructed local positive-schema fixture. No compiler, native API or remote approval is executed.
    scope.status='OWNER_APPROVED_FORENSIC_BUILD_ONLY';scope.remote_approval={response:'SURROGATE fixture only',review_sha256:'0'.repeat(64)};
    fs.copyFileSync(path.join(path.dirname(tool),scope.source_snapshot.file),path.join(d,scope.source_snapshot.file),fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(path.join(path.dirname(tool),'build-forensic-components.ps1'),path.join(d,'build-forensic-components.ps1'),fs.constants.COPYFILE_EXCL);
    const artifactFile=id==='capture'?'capture-library.dll':'manifest-process-observer.exe';fs.writeFileSync(path.join(d,artifactFile),'SURROGATE bytes - not executable',{flag:'wx'});
    const artifact={...api.fileRow(path.join(d,artifactFile)),mvid:'00000000-0000-0000-0000-000000000001'};
    const output_rows=['compiler-out.json','compiler-err.json'].map(n=>{api.writeNew(path.join(d,n),{evidence_scope:'SURROGATE'});return api.fileRow(path.join(d,n));});
    const scopeHash=api.writeNew(path.join(d,id+'-build-scope.json'),scope);
    const build={schema_version:1,status:'FORENSIC_BUILD_AND_SELF_TEST_PASS_NOT_ADMISSION',build_kind:'INDEPENDENT_ENGINEERING_02_FORENSIC_V3',component_id:id,scope_sha256:scopeHash,bootstrap_sha256:scope.bootstrap.sha256,tool_source_head:head,origin_snapshot:scope.origin_snapshot,source_snapshot:scope.source_snapshot,artifact,dependencies:scope.dependencies,arguments:api.buildArguments(scope),compiler_pid:123,compiler_creation_ticks:'639269600000000000',compiler_exit_code:0,started_at:'2026-10-07T00:00:00Z',finished_at:'2026-10-07T00:00:01Z',self_test_cases:id==='capture'?1:43,output_rows,identity:{Sid:'S-1-5-21-3031939772-989444280-3099258187-500',User:'WIN-2JQ66JE4HTQ\\Administrator',IntegritySid:'S-1-16-12288',Pid:234,Session:0,Rid:12288,ElevationType:1,Elevated:true,Ordinary:false,InJob:true}};
    api.writeNew(path.join(d,id+'-build.json'),build);
  }
  const next=api.createForensicStatic(previous,directories.capture,directories.observer);
  assert.equal(next.tool_identity.version,'engineering-02-v3');assert.equal(next.tool_identity.files.length,10);
  assert.equal(next.deployment.root,api.FORENSIC_ROOT);assert.deepEqual(next.product_identity,previous.product_identity);
  assert.equal(next.execution_scope.status,'LOCAL_FORENSIC_REPAIR_REMOTE_NOT_AUTHORIZED');
  assert.throws(()=>api.requireWin10Execution(next,'ADMIN_TOOL_ADMISSION'),/SCOPE_R3_REMOTE_NOT_APPROVED/);
  const projection=api.legacyMaster(next);assert.equal(projection.capture_library.sha256,next.components.capture.artifact.sha256);
  assert.equal(projection.manifest_observer.exe.mvid,next.components.observer.artifact.mvid);
  for(const mutate of [b=>b.components.capture=previous.components.capture,b=>b.components.observer=previous.components.observer,b=>b.components.capture.artifact.mvid=previous.components.capture.artifact.mvid,b=>b.components.observer.source_snapshot.sha256=previous.components.observer.source_snapshot.sha256,b=>b.execution_scope.roles=['ORDINARY_PRODUCT'],b=>b.deployment.root=previous.deployment.root]) {
    const wrong=JSON.parse(JSON.stringify(next));mutate(wrong);assert.throws(()=>api.validateStatic(wrong));
  }
});

test('file rows accept object member permutations and reject missing, extra, typed or corrupt byte claims', () => {
  const file=path.join(dir,'ordered-row.json');api.writeNew(file,{text:'真实输出'});
  const r=api.fileRow(file);
  for(const names of [['sha256','file','size'],['size','sha256','file'],['file','size','sha256']]) {
    const reordered=Object.fromEntries(names.map(n=>[n,r[n]]));assert.doesNotThrow(()=>api.verifyFile(file,reordered));
  }
  for(const bad of [{file:r.file,size:r.size},{...r,extra:true},{...r,size:String(r.size)},{...r,size:r.size+1},{...r,sha256:'0'.repeat(64)},{...r,file:123}]) assert.throws(()=>api.verifyFile(file,bad));
  assert.throws(()=>api.parseStrict('{"file":"x","size":1,"sha256":"a","size":1}'));
});

test('actual immutable R3 returns bind inherited build validator separately from current tools through the real factory and CLI', () => {
  const base=path.resolve('.acceptance/engineering-win10-entry-r1');
  const returnRoot=path.join(base,'resume-6/component-return-r1');
  const validator=path.join(base,'resume-5/build-preparation-r3/tool-sources/input-binding.cjs');
  const previous=api.loadStatic(path.join(base,'resume-3/win10-static-v4.json'),'822856c4bc0c9dfa0bab623700e40150d54deba7caff9d2652863b7446af8da6',path.join(base,'resume-3/tool-sources-v4'));
  const next=api.createForensicStatic(previous,path.join(returnRoot,'capture'),path.join(returnRoot,'observer'),path.dirname(tool),validator);
  assert.equal(next.tool_identity.version,'engineering-02-v4');assert.deepEqual(next.product_identity,previous.product_identity);
  const currentValidator=next.tool_identity.files.find(r=>r.file==='input-binding.cjs');
  for(const id of ['capture','observer']) {
    const c=next.components[id],scope=api.parseStrict(Buffer.from(c.scope_bytes,'base64').toString('utf8'));
    assert.equal(c.build_provenance.schema_version,1);assert.equal(c.build_provenance.status,'INHERITED_EVIDENCE');
    assert.deepEqual(c.build_provenance.validator,scope.validator);assert.notEqual(scope.validator.sha256,currentValidator.sha256);
    assert.deepEqual(Buffer.from(c.build_provenance.validator_bytes,'base64'),fs.readFileSync(validator));
    assert.deepEqual(Buffer.from(c.build_bytes,'base64'),fs.readFileSync(path.join(returnRoot,id,id+'-build.json')));
    assert.equal(c.artifact.sha256,id==='capture'?'9a205e4cbe80bf768d5bedf96e3a670baf593291698aab54c2b458ed8ae144b6':'94472c1818e206079a74c371b37795e105618887b73d7794bdbfed42545ae7d7');
  }
  const file=path.join(dir,'actual-inherited-binding.json'),digest=api.writeNew(file,next);
  assert.equal(cli(['verify-static',file,digest]).status,0);assert.equal(cli(['project-master',file,digest]).status,0);
  const generated=path.join(dir,'actual-cli-inherited-binding.json');
  const arguments_=['forensic-static-inherited',path.join(base,'resume-3/win10-static-v4.json'),'822856c4bc0c9dfa0bab623700e40150d54deba7caff9d2652863b7446af8da6',path.join(base,'resume-3/tool-sources-v4'),path.join(returnRoot,'capture'),path.join(returnRoot,'observer'),validator,generated];
  assert.equal(cli(arguments_).status,0);assert.deepEqual(fs.readFileSync(generated),fs.readFileSync(file));
  const saved=fs.readFileSync(generated);assert.notEqual(cli(arguments_).status,0);assert.deepEqual(fs.readFileSync(generated),saved);
  assert.equal(next.execution_scope.roles.length,0);assert.throws(()=>api.requireWin10Execution(next,'ADMIN_TOOL_ADMISSION'),/SCOPE_R3_REMOTE_NOT_APPROVED/);
  for(const mutate of [
    b=>b.components.capture.build_provenance.validator=currentValidator,
    b=>b.components.observer.build_provenance.validator_bytes=Buffer.from('changed').toString('base64'),
    b=>b.components.capture.build_provenance.status='PASS',
    b=>b.components.capture.build_provenance.extra=true,
    b=>b.components.capture.build_record.sha256='0'.repeat(64),
    b=>b.components.observer.build_scope.sha256='0'.repeat(64),
    b=>b.components.capture.artifact.sha256=previous.components.capture.artifact.sha256,
    b=>b.components.capture.source_snapshot.sha256=previous.components.capture.source_snapshot.sha256,
    b=>b.execution_scope.roles=['ORDINARY_PRODUCT'],
    b=>b.tool_identity.version='engineering-02-v3',
    b=>{const c=b.components.capture,build=api.parseStrict(Buffer.from(c.build_bytes,'base64').toString('utf8'));build.compiler_exit_code=7;const bytes=Buffer.from(JSON.stringify(build));c.build_bytes=bytes.toString('base64');c.build_record.size=bytes.length;c.build_record.sha256=api.sha(bytes);}
  ]) {const wrong=structuredClone(next);mutate(wrong);assert.throws(()=>api.validateStatic(wrong));}
  assert.throws(()=>api.createForensicStatic(previous,path.join(returnRoot,'capture'),path.join(returnRoot,'observer'),path.dirname(tool),tool),/INTEGRITY_INHERITED_BUILD_VALIDATOR/);
});

test('new admission preparation preserves original builds and denies every product or unapproved operation', () => {
  assert.equal(typeof api.createAdmissionStatic, 'function');
  const priorRoot=path.resolve('.acceptance/engineering-win10-entry-r1/resume-7');
  const previous=api.loadStatic(path.join(priorRoot,'current-forensic-static-v4.json'),'89a5b7ac24c8b32b6bb415936ee90abab2d46a2686636eea3c2949b3023c895b',path.join(priorRoot,'tool-sources-v4'));
  const next=api.createAdmissionStatic(previous);
  assert.equal(next.tool_identity.version,'engineering-02-v5-admission');
  assert.equal(next.deployment.root,api.ADMISSION_ROOT);assert.deepEqual(next.components,previous.components);assert.deepEqual(next.product_identity,previous.product_identity);
  assert.equal(next.tool_identity.files.length,11);assert.deepEqual(next.execution_scope.roles,[]);
  assert.throws(()=>api.requireWin10Execution(next,'ORDINARY_PRODUCT'),/SCOPE_ADMISSION_OPERATION/);
  assert.throws(()=>api.requireWin10Execution(next,'ADMIN_TOOL_ADMISSION'),/SCOPE_ADMISSION_OPERATION/);
  assert.throws(()=>api.requireWin10Execution(next,'ADMIN_FORENSIC_ADMISSION','observer-admit'),/SCOPE_ADMISSION_REMOTE_NOT_APPROVED/);
  for(const op of ['Run','Stop','Build','Boot','Background','unknown','']) assert.throws(()=>api.validateAdmissionOperation(next,'ADMIN_FORENSIC_ADMISSION',op),/SCOPE_ADMISSION_OPERATION/);
  assert.throws(()=>api.requireWin10Execution(previous,'ADMIN_TOOL_ADMISSION'),/SCOPE_R3_REMOTE_NOT_APPROVED/);
});

test('real admission preparation CLI freezes exact eleven-file closure and canonical observer wrapper without an executable role', () => {
  const priorRoot=path.resolve('.acceptance/engineering-win10-entry-r1/resume-7'), file=path.join(dir,'admission-prepared.json');
  const args=['admission-static',path.join(priorRoot,'current-forensic-static-v4.json'),'89a5b7ac24c8b32b6bb415936ee90abab2d46a2686636eea3c2949b3023c895b',path.join(priorRoot,'tool-sources-v4'),file];
  const generated=cli(args);assert.equal(generated.status,0,generated.stderr);
  const pin=api.sha(fs.readFileSync(file)), b=api.loadStatic(file,pin);
  assert.deepEqual(b.execution_scope.roles,[]);assert.equal(b.execution_scope.remote_approval,null);
  assert.equal(cli(['verify-static',file,pin]).status,0);
  const wrapper=JSON.parse(cli(['admission-revision',file,pin]).stdout), bytes=Buffer.from(wrapper.bytes,'base64'), digests=JSON.parse(cli(['admission-digests',file,pin]).stdout);
  assert.equal(api.sha(bytes),wrapper.sha256);assert.equal(wrapper.sha256,digests.admission_revision_sha256);
  assert.deepEqual(api.parseStrict(bytes.toString()),api.createRevision(b,pin,'controlled-boot'));
  assert.equal(api.parseStrict(bytes.toString()).kind,'revision');
  const saved=fs.readFileSync(file);assert.notEqual(cli(args).status,0);assert.deepEqual(fs.readFileSync(file),saved);
  assert.match(cli(['authorize-admission-start',file,pin,'ADMIN_FORENSIC_ADMISSION','observer-admit']).stderr,/SCOPE_ADMISSION_REMOTE_NOT_APPROVED/);
  for(const role of ['ORDINARY_PRODUCT','ADMIN_TOOL_ADMISSION']) assert.match(cli(['authorize',file,pin,role]).stderr,/SCOPE_ADMISSION_OPERATION/);
});

// ADR-0210 / ENGINEERING_02 section 64-65: v6 product contract. Constructed fixtures only; not a Win10 measurement.
function v6Prepared() {
  const priorRoot = path.resolve('.acceptance/engineering-win10-entry-r1/resume-7');
  const previous = api.loadStatic(path.join(priorRoot, 'current-forensic-static-v4.json'), '89a5b7ac24c8b32b6bb415936ee90abab2d46a2686636eea3c2949b3023c895b', path.join(priorRoot, 'tool-sources-v4'));
  return { previous, next: api.createProductStatic(previous) };
}
function v6Approved(next, from = Date.now() - 60000, until = Date.now() + 7140000) {
  const prepared = api.sha(Buffer.from(JSON.stringify(next, null, 2) + '\n'));
  const iso = t => new Date(t).toISOString();
  return api.approveAdmissionStatic(next, { response: '批准', review_sha256: 'a'.repeat(64), prepared_binding_sha256: prepared, approved_at: iso(from), valid_until: iso(from + 7200000) });
}
test('v6 preparation keeps builds, roots and eleven-file closure, and grants no role before approval', () => {
  assert.equal(typeof api.createProductStatic, 'function');
  const { previous, next } = v6Prepared();
  assert.equal(next.tool_identity.version, 'engineering-02-v6-product');
  assert.equal(next.deployment.root, api.ADMISSION_ROOT); assert.deepEqual(next.components, previous.components); assert.deepEqual(next.product_identity, previous.product_identity);
  assert.equal(next.tool_identity.files.length, 11);
  assert.deepEqual(next.execution_scope.roles, []); assert.equal(next.execution_scope.product_execution_authorized, false);
  assert.equal(next.execution_scope.status, 'LOCAL_PRODUCT_CHAIN_PREPARATION_NOT_REMOTE_AUTHORIZATION'); assert.equal(next.execution_scope.local_approval.decision, 'ADR-0210');
  for (const role of ['ORDINARY_PRODUCT', 'ADMIN_TOOL_ADMISSION']) assert.throws(() => api.requireWin10Execution(next, role), /SCOPE_PRODUCT_REMOTE_NOT_APPROVED/);
  assert.throws(() => api.requireWin10Execution(next, 'ADMIN_FORENSIC_ADMISSION', 'observer-admit'), /SCOPE_ADMISSION_REMOTE_NOT_APPROVED/);
  assert.equal(api.admission(next), true); assert.equal(api.forensic(next), true); assert.equal(api.product(next), true);
});
test('v5 keeps rejecting every product role and operation; v6 operation table has no product operation', () => {
  const { previous, next } = v6Prepared();
  const v5 = api.createAdmissionStatic(previous);
  assert.equal(api.product(v5), false);
  for (const role of ['ORDINARY_PRODUCT', 'ADMIN_TOOL_ADMISSION']) assert.throws(() => api.requireWin10Execution(v5, role), /SCOPE_ADMISSION_OPERATION/);
  for (const op of ['Boot', 'Background', 'boot', 'sync', 'Run', 'Stop', 'Build', '']) assert.throws(() => api.validateAdmissionOperation(next, 'ORDINARY_PRODUCT', op), /SCOPE_ADMISSION_OPERATION/);
  assert.deepEqual(Object.keys(api.ADMISSION_OPERATIONS), ['ADMIN_FORENSIC_ADMISSION', 'ORDINARY_FORENSIC_ADMISSION']);
});
test('approved v6 opens exactly the two product roles for three requests; window, runtime and host gates still apply', () => {
  const { next } = v6Prepared();
  const ok = v6Approved(next);
  assert.equal(ok.execution_scope.status, 'OWNER_APPROVED_EXACT_SHORTEST_PRODUCT_CHAIN'); assert.equal(ok.execution_scope.product_execution_authorized, true);
  assert.deepEqual(ok.execution_scope.roles, ['ADMIN_FORENSIC_ADMISSION', 'ORDINARY_FORENSIC_ADMISSION', 'ADMIN_TOOL_ADMISSION', 'ORDINARY_PRODUCT']);
  assert.deepEqual(ok.execution_scope.product, { phases: ['Boot', 'Background'], revision_labels: ['normal-short'], requests: ['SYNC', 'Boot', 'Background'], request_limit: 3 });
  // The product gate passes; this macOS development host then stops at the locked Win10 runtime gate.
  for (const role of ['ORDINARY_PRODUCT', 'ADMIN_TOOL_ADMISSION']) assert.throws(() => api.requireWin10Execution(ok, role), /INTEGRITY_WIN10_EXECUTION_RUNTIME/);
  const expired = v6Approved(next, Date.now() - 7300000); assert.throws(() => api.requireWin10Execution(expired, 'ORDINARY_PRODUCT'), /SCOPE_PRODUCT_APPROVAL_EXPIRED/);
  const future = v6Approved(next, Date.now() + 600000); assert.throws(() => api.requireWin10Execution(future, 'ORDINARY_PRODUCT'), /SCOPE_PRODUCT_APPROVAL_EXPIRED/);
  assert.throws(() => api.requireWin10Execution(ok, 'ORDINARY_FORENSIC_ADMISSION'), /SCOPE_ADMISSION_OPERATION/);
  assert.throws(() => api.approveAdmissionStatic(ok, { response: '批准' }));
});
test('product request gate allows only Boot and Background with normal-short and only for v6', () => {
  const { previous, next } = v6Prepared(); const ok = v6Approved(next);
  assert.equal(typeof api.assertProductRequest, 'function');
  for (const phase of ['Boot', 'Background']) assert.doesNotThrow(() => api.assertProductRequest(ok, phase, 'normal-short'));
  for (const phase of ['Shell', 'EncodingSecurity', 'FailureBoundaries', 'StopExit', 'ReleaseExit', 'Recovery', 'CMD', 'boot', '']) assert.throws(() => api.assertProductRequest(ok, phase, 'normal-short'), /SCOPE_PRODUCT_REQUEST/);
  for (const label of ['controlled-boot', 'normal-full', 'ready-negative', 'unknown', '']) assert.throws(() => api.assertProductRequest(ok, 'Boot', label), /SCOPE_PRODUCT_REQUEST/);
  assert.throws(() => api.assertProductRequest(next, 'Boot', 'normal-short'), /SCOPE_PRODUCT_REMOTE_NOT_APPROVED/);
  assert.throws(() => api.assertProductRequest(api.createAdmissionStatic(previous), 'Boot', 'normal-short'), /SCOPE_PRODUCT_REQUEST/);
});
test('per-binding product record names are used only by v6 and legacy names stay for older versions', () => {
  const { next } = v6Prepared(); const pin = 'b'.repeat(64);
  assert.deepEqual(api.productRecordFiles(next, 'C:\\r', pin), { desktop: path.join('C:\\r', 'evidence', 'desktop-session-' + pin + '.json'), admission: path.join('C:\\r', 'inputs', 'admission-' + pin + '.json') });
  const legacy = copy(); legacy.tool_identity = { ...legacy.tool_identity, version: 'engineering-02-v2' };
  assert.deepEqual(api.productRecordFiles(legacy, 'C:\\r', pin), { desktop: path.join('C:\\r', 'evidence', 'desktop-session.json'), admission: path.join('C:\\r', 'inputs', 'admission.json') });
});
test('real v6 preparation CLI freezes the closure and refuses product roles until approved', () => {
  const priorRoot = path.resolve('.acceptance/engineering-win10-entry-r1/resume-7'), file = path.join(dir, 'product-prepared.json');
  const args = ['product-static', path.join(priorRoot, 'current-forensic-static-v4.json'), '89a5b7ac24c8b32b6bb415936ee90abab2d46a2686636eea3c2949b3023c895b', path.join(priorRoot, 'tool-sources-v4'), file];
  const generated = cli(args); assert.equal(generated.status, 0, generated.stderr);
  const pin = api.sha(fs.readFileSync(file)), b = api.loadStatic(file, pin);
  assert.equal(b.tool_identity.version, 'engineering-02-v6-product'); assert.equal(cli(['verify-static', file, pin]).status, 0);
  const saved = fs.readFileSync(file); assert.notEqual(cli(args).status, 0); assert.deepEqual(fs.readFileSync(file), saved);
  for (const role of ['ORDINARY_PRODUCT', 'ADMIN_TOOL_ADMISSION']) assert.match(cli(['authorize', file, pin, role]).stderr, /SCOPE_PRODUCT_REMOTE_NOT_APPROVED/);
  assert.match(cli(['assert-product-request', file, pin, 'Boot', 'normal-short']).stderr, /SCOPE_PRODUCT_REMOTE_NOT_APPROVED/);
  assert.match(cli(['authorize-admission-start', file, pin, 'ADMIN_FORENSIC_ADMISSION', 'observer-admit']).stderr, /SCOPE_ADMISSION_REMOTE_NOT_APPROVED/);
});
