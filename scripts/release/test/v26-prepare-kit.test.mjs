import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { recordA9V26HelperInput, verifyCommittedApprovalRegistry } from '../record-a9-v26-helper-input.mjs';
import { writeDeterministicZip } from '../zip-utils.mjs';
import { digest, writeJson, createV26ReturnFixture } from './v26-evidence-fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const req=createRequire(import.meta.url);
const {SOURCES,INPUTS}=req('../../../native/helper/build-win10-kit-v26/prepare-kit.cjs');
const runIds=['318e27e4-ec82-4d65-9975-18fd28a904dc','b70f9534-6e7e-4f2f-a51d-26f035644bba'];
function fixture(managed=false) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'A9-V26-TEST_ONLY-'));const helper=path.join(dir,'native/helper');const kit=path.join(helper,managed?'build-win10-kit-v26-managed':'build-win10-kit-v26');
  fs.mkdirSync(kit,{recursive:true});for(const n of SOURCES)fs.writeFileSync(path.join(helper,n),managed?fs.readFileSync(path.join(root,'native/helper',n)):execFileSync('git',['show','c2b6356f83ef8502a34516010924547c57a3bec2:native/helper/'+n],{cwd:root}));
  for(const n of INPUTS.filter(n=>!managed||!n.startsWith('SOURCE_COMMIT')))fs.copyFileSync(path.join(root,'native/helper',managed?'build-win10-kit-v26-managed':'build-win10-kit-v26',n),path.join(kit,n));
  const git=(args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['init','--quiet']);git(['add','native/helper']);git(['-c','user.name=A9 TEST_ONLY','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','TEST_ONLY committed fixture, not production source']);
  const commit=git(['rev-parse','HEAD']);fs.writeFileSync(path.join(kit,'SOURCE_COMMIT.txt'),commit+'\n');fs.writeFileSync(path.join(kit,'SOURCE_COMMIT_TIMESTAMP.txt'),git(['show','-s','--format=%cI','HEAD'])+'\n');
  return {dir,helper,kit,commit,git,managed};
}
const prepare=(f)=>spawnSync(process.execPath,[path.join(f.kit,'prepare-kit.cjs')],{cwd:f.dir,encoding:'utf8'});
function authorized(f) {
  const p=prepare(f);assert.equal(p.status,0,p.stderr);
  const kitZip=path.join(f.dir,'TEST_ONLY-buildkit.zip');writeDeterministicZip(f.kit,kitZip,1787443200);
  const registry=path.join(f.dir,'release/win7-product-v3/a9-v26-approved-build-kits.json');
  writeJson(registry,{schema_version:1,kits:[{revision:f.managed?'a9-31-managed-r1':'TEST_ONLY-r1',filename:path.basename(kitZip),sha256:digest(fs.readFileSync(kitZip)),source_commit:f.commit,input_lock_sha256:digest(fs.readFileSync(path.join(f.kit,'input-lock.json'))),package_manifest_sha256:digest(fs.readFileSync(path.join(f.kit,'PACKAGE_MANIFEST.json'))),status:'APPROVED_FOR_RETURN_RECORDING'}]});
  return {kitZip,registry};
}
function inputPair(f, mutate=()=>{}, secondId=runIds[1]) {
  const a=authorized(f);const first=createV26ReturnFixture(f.dir,f.kit,runIds[0],'a');const second=createV26ReturnFixture(f.dir,f.kit,secondId,'b',mutate);
  const registered=JSON.parse(fs.readFileSync(a.registry));registered.kits[0].return_review={status:'APPROVED_FOR_INPUT_LOCK',independent_reviewer:'TEST_ONLY reviewer',implementation_author:'TEST_ONLY implementer',reviewed_at:'2026-10-01T00:00:00Z',report_sha256:'b'.repeat(64),builds:[{run_id:runIds[0],sha256:digest(fs.readFileSync(first))},{run_id:secondId,sha256:digest(fs.readFileSync(second))}]};writeJson(a.registry,registered);
  const base=path.join(f.dir,'base-lock.json');fs.copyFileSync(path.join(root,'release/win7-product-v3/a9-27-win7-42-input-lock.json'),base);
  return {runnerZip:first,runnerZip2:second,kitZip:a.kitZip,baseLock:base,output:path.join(f.dir,'TEST_ONLY-lock.json'),sourceRepositoryRoot:f.dir,testOnly:true,testOnlyApprovedKitRegistry:a.registry};
}
test('v26 generator extracts committed sources and produces deterministic complete closure',()=>{
  const f=fixture();assert.equal(prepare(f).status,0);
  const manifest=JSON.parse(fs.readFileSync(path.join(f.kit,'PACKAGE_MANIFEST.json')));
  assert.equal(manifest.source_commit,f.commit);assert.equal(manifest.files.length,INPUTS.length+SOURCES.length+1);
  for(const e of manifest.files){const bytes=fs.readFileSync(path.join(f.kit,e.path));assert.equal(bytes.length,e.size);assert.equal(digest(bytes),e.sha256);}
  const before=fs.readFileSync(path.join(f.kit,'PACKAGE_MANIFEST.json'));assert.equal(prepare(f).status,0);assert.deepEqual(fs.readFileSync(path.join(f.kit,'PACKAGE_MANIFEST.json')),before);
});
for(const mode of ['uncommitted','missing','extra','symlink','timestamp','not_locked','profile','smoke'])test('v26 generation fails before replacing locks: '+mode,()=>{
  const f=fixture();assert.equal(prepare(f).status,0);const before=fs.readFileSync(path.join(f.kit,'input-lock.json'));
  if(mode==='uncommitted')fs.appendFileSync(path.join(f.helper,'stream_writer.cpp'),'\n// TEST_ONLY drift\n');
  if(mode==='missing')fs.renameSync(path.join(f.helper,'stream_writer.h'),path.join(f.dir,'saved-stream_writer.h'));
  if(mode==='extra')fs.writeFileSync(path.join(f.kit,'unexpected.txt'),'extra');
  if(mode==='symlink')fs.symlinkSync(path.join(f.kit,'build.ps1'),path.join(f.kit,'unexpected'));
  if(mode==='timestamp')fs.writeFileSync(path.join(f.kit,'SOURCE_COMMIT_TIMESTAMP.txt'),'2020-01-01T00:00:00Z\n');
  if(mode==='not_locked')fs.writeFileSync(path.join(f.kit,'SOURCE_COMMIT.txt'),'NOT_LOCKED\n');
  if(mode==='profile'){const p=JSON.parse(fs.readFileSync(path.join(f.kit,'build-profile.json')));p.build_host.windows_sdk_version='10.0.99999.0';writeJson(path.join(f.kit,'build-profile.json'),p);}
  if(mode==='smoke')fs.writeFileSync(path.join(f.kit,'build.ps1'),'# incomplete smoke');
  const result=prepare(f);assert.notEqual(result.status,0,mode);assert.deepEqual(fs.readFileSync(path.join(f.kit,'input-lock.json')),before);
});
test('v26 packager verifies every byte, rejects extra files and never overwrites output',()=>{
  const f=fixture();assert.equal(prepare(f).status,0);const output=path.join(f.dir,'handoff.zip');
  const run=()=>spawnSync(process.execPath,[path.join(f.kit,'package-kit.cjs'),'--out',output],{encoding:'utf8'});
  fs.writeFileSync(path.join(f.kit,'unexpected.txt'),'extra');assert.notEqual(run().status,0);fs.renameSync(path.join(f.kit,'unexpected.txt'),path.join(f.dir,'preserved-extra.txt'));
  const source=path.join(f.kit,'src/stream_writer.h');const saved=fs.readFileSync(source);fs.appendFileSync(source,'drift');assert.notEqual(run().status,0);fs.writeFileSync(source,saved);
  const positive=run();assert.equal(positive.status,0,positive.stderr);assert.equal(JSON.parse(positive.stdout).status,'PACKAGE_READY_NOT_APPROVED');assert.notEqual(run().status,0);
});
test('recording validates raw v3 evidence and two independent builds without forging Win7 gates',()=>{
  const f=fixture();const opts=inputPair(f);const result=recordA9V26HelperInput(opts);const lock=JSON.parse(fs.readFileSync(opts.output));
  assert.equal(lock.lock_id,'A9-30-DEVELOPER-INPUTS-D013-V26');assert.equal(lock.inputs.runner_return_zip.protocol_version,3);assert.equal(lock.gates.win7,'NOT_PERFORMED');assert.equal(lock.provenance.development_only,true);assert.notEqual(result.runnerZipSha256,result.runnerZip2Sha256);
  assert.throws(()=>recordA9V26HelperInput(opts),/REFUSES_OVERWRITE/);
});
for(const mode of ['missing','rebound-drift'])test('returned application manifest must match approved kit: '+mode,()=>{
  const f=fixture();const opts=inputPair(f,(dir)=>{const file=path.join(dir,'helper.exe.manifest');if(mode==='missing')fs.renameSync(file,path.join(f.dir,'preserved-return-manifest.xml'));else fs.appendFileSync(file,'<!-- TEST_ONLY drift rebound into return manifest -->');});
  assert.throws(()=>recordA9V26HelperInput(opts),mode==='missing'?/RETURN_FILE_SET_MISMATCH/:/AUTHORIZED_KIT_BINDING_MISMATCH/);assert.equal(fs.existsSync(opts.output),false);
});
for(const mode of ['request_id','sequence','base64','counts','invalid_json','extra_field','missing_terminal','prestart','offset','exit_type','tool_drift','extra_return','missing_return','source_mismatch','not_live','not_clean','encoding','tools','wrong_profile','fail','api','crt','pe_arch','changed_helper','identity_missing','identity_elevated','identity_full','identity_high','identity_sid','identity_type','identity_job','identity_unknown_job'])test('rebound return evidence cannot conceal '+mode,()=>{
  const f=fixture();const mutate=(dir)=>{
    const edit=(n,change)=>{const file=path.join(dir,'evidence',n);const value=JSON.parse(fs.readFileSync(file));change(value);writeJson(file,value);};
    if(['request_id','sequence','base64','counts','not_clean','extra_field','missing_terminal','prestart','offset','exit_type'].includes(mode)){
      const file=path.join(dir,'evidence/v26-tick-stdout.jsonl');const values=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
      if(mode==='request_id')values[1].requestId='wrong';if(mode==='sequence')values[1].seq=2;if(mode==='base64')values[1].dataBase64='%%%';if(mode==='counts')values.at(-1).stdout.rawBytesRead++;if(mode==='not_clean')values.at(-1).cleanupConfirmed=false;
      if(mode==='extra_field')values.at(-1).unexpected='TEST_ONLY';
      if(mode==='missing_terminal'){values.pop();edit('v26-streaming.json',v=>{v.rows.find(r=>r.name==='tick').frame_times_ms.pop();});}
      if(mode==='prestart')[values[0],values[1]]=[values[1],values[0]];
      if(mode==='offset')values[1].streamOffset=1;
      if(mode==='exit_type')values.at(-1).exitCode='0';
      fs.writeFileSync(file,values.map(JSON.stringify).join('\n')+'\n');
    }
    if(mode==='invalid_json')fs.writeFileSync(path.join(dir,'evidence/v26-tick-stdout.jsonl'),'TEST_ONLY-secret-marker-invalid-json\n');
    if(mode==='extra_return')fs.writeFileSync(path.join(dir,'evidence/unapproved.txt'),'TEST_ONLY');
    if(mode==='missing_return')fs.renameSync(path.join(dir,'evidence/v26-utf8-stderr.bin'),path.join(dir,'preserved-stderr.bin'));
    if(mode==='source_mismatch')edit('build-result.json',v=>{v.source_commit='f'.repeat(40);});
    if(mode==='not_live')edit('v26-streaming.json',(v)=>{v.rows.find((r)=>r.name==='tick').frame_times_ms=[4100,4100,4100,4100,4100];});
    if(mode==='encoding')edit('v26-cp936-request.json',(v)=>{v.outputEncoding.stdout='utf-8';});
    if(mode==='tool_drift')edit('v26-tools.json',v=>{v.tools[0].sha256='f'.repeat(64);});
    if(mode==='tools')edit('v26-tools.json',(v)=>{v.tools.pop();});
    if(mode.startsWith('identity_'))edit('environment.json',v=>{
      if(mode==='identity_missing')delete v.token_is_elevated;
      if(mode==='identity_elevated')v.token_is_elevated=true;
      if(mode==='identity_full')v.token_elevation_type=2;
      if(mode==='identity_high'){v.integrity_rid=12288;v.integrity_sid='S-1-16-12288';}
      if(mode==='identity_sid')v.integrity_sid='S-1-16-12288';
      if(mode==='identity_type')v.integrity_rid='8192';
      if(mode==='identity_job')v.in_host_job=true;
      if(mode==='identity_unknown_job')delete v.job_probe_ok;
    });
    if(mode==='wrong_profile')edit('build-result.json',(v)=>{v.helper_protocol=2;});
    if(mode==='fail')edit('build-result.json',(v)=>{v.status='FAIL';});
    if(['api','crt','pe_arch','changed_helper'].includes(mode)){
      const file=path.join(dir,'output/helper.exe');let bytes=fs.readFileSync(file);
      if(mode==='api')bytes.write('CreatePseudoConsole',0x342,'ascii');if(mode==='crt')bytes.write('UCRTBASE.dll',0x300,'ascii');if(mode==='pe_arch')bytes.writeUInt16LE(0x14c,0x84);if(mode==='changed_helper')bytes[0x1100]=1;
      fs.writeFileSync(file,bytes);edit('build-result.json',(v)=>{v.artifacts[0].sha256=digest(bytes);});
    }
  };
  const opts=inputPair(f,mutate);assert.throws(()=>recordA9V26HelperInput(opts),error=>{assert.match(error.message,/A9_V26_/);assert.doesNotMatch(error.message,/TEST_ONLY-secret-marker/);return true;});assert.equal(fs.existsSync(opts.output),false);
});
test('return lock requires independent review of the exact two returned hashes',()=>{
  const f=fixture();const opts=inputPair(f);const registry=opts.testOnlyApprovedKitRegistry;const value=JSON.parse(fs.readFileSync(registry));const review=value.kits[0].return_review;
  for(const mutate of [v=>{v.return_review=undefined;},v=>{v.return_review.independent_reviewer=v.return_review.implementation_author;},v=>{v.return_review.builds[1].sha256='c'.repeat(64);}]) {
    const copy=JSON.parse(JSON.stringify(value));mutate(copy.kits[0]);writeJson(registry,copy);assert.throws(()=>recordA9V26HelperInput(opts),/INDEPENDENT_RETURN_REVIEW/);assert.equal(fs.existsSync(opts.output),false);
  }
});
test('identical returned archive and altered inherited lock are rejected',()=>{
  const f=fixture();const opts=inputPair(f);fs.copyFileSync(opts.runnerZip,opts.runnerZip2);fs.writeFileSync(opts.runnerZip2+'.sha256',digest(fs.readFileSync(opts.runnerZip2))+'  '+path.basename(opts.runnerZip2)+'\n');
  assert.throws(()=>recordA9V26HelperInput(opts),/RETURN_HASH_REUSED/);
  const g=fixture();const other=inputPair(g);fs.appendFileSync(other.baseLock,' ');assert.throws(()=>recordA9V26HelperInput(other),/HISTORICAL_V25_LOCK_HASH_MISMATCH/);
});
test('duplicate build identity and unapproved or dirty registry are rejected',()=>{
  const f=fixture();const opts=inputPair(f,()=>{},runIds[0]);assert.throws(()=>recordA9V26HelperInput(opts),/RUN_ID_REUSED/);
  const registry=opts.testOnlyApprovedKitRegistry;const value=JSON.parse(fs.readFileSync(registry));value.kits[0].status='PENDING_REVIEW';writeJson(registry,value);assert.throws(()=>recordA9V26HelperInput(opts),/NOT_PREAPPROVED/);
  assert.throws(()=>verifyCommittedApprovalRegistry(registry,f.dir),/NOT_COMMITTED/);
  f.git(['add','release/win7-product-v3/a9-v26-approved-build-kits.json']);f.git(['-c','user.name=A9 TEST_ONLY','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','TEST_ONLY registry fixture']);
  assert.equal(verifyCommittedApprovalRegistry(registry,f.dir).path,'release/win7-product-v3/a9-v26-approved-build-kits.json');
  fs.appendFileSync(registry,' ');assert.throws(()=>verifyCommittedApprovalRegistry(registry,f.dir),/NOT_CLEAN_HEAD/);
});
test('Windows smoke harness syntax and actual execution remain target-platform checks', {skip:process.platform!=='win32'?'Windows PowerShell 5.1 NOT_PERFORMED':false},()=>{
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'native/helper/build-win10-kit-v26/build.ps1'),'-TestSmokeRequestOnly'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});

test('Windows host gate rejects contradictory and unsupported runtime/registry facts', {skip:process.platform!=='win32'?'Windows PowerShell 5.1 NOT_PERFORMED':false},()=>{
  const script=String.raw`$BuildScript=$env:A9_V26_TEST_BUILD_SCRIPT;$ProbeActualHost=$false
$ErrorActionPreference='Stop';Set-StrictMode -Version 2
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($BuildScript,[ref]$tokens,[ref]$errors)
if($errors.Count -ne 0){throw 'Build script parse errors.'}
foreach($name in @('Assert-V26BuildHostOs','Get-V26BuildHostOs')){
 $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 if($null -eq $fn){throw 'Actual host gate function missing.'};Invoke-Expression $fn.Extent.Text
}
function New-TestRegistry {return [pscustomobject]@{ProductName='Windows 10 Pro';InstallationType='Client';CurrentMajorVersionNumber=10;CurrentMinorVersionNumber=0;CurrentBuildNumber='19045';UBR=6466}}
$positive=Assert-V26BuildHostOs ([version]'10.0.19045.0') (New-TestRegistry) 'Win32NT' $true
if($positive.Probe -cne 'runtime-version+readonly-HKLM' -or $positive.BuildNumber -cne '19045' -or $positive.UpdateBuildRevision -ne 6466){throw 'Positive host facts not retained.'}
$names=@('non-windows','x86','runtime-string','win7','win11','early-win10','minor','null-registry','missing-product','missing-ubr','wrong-product','server','major-type','major-mismatch','minor-type','minor-mismatch','build-type','build-mismatch','ubr-type','negative-ubr')
$rows=@()
foreach($name in $names){
 $r=New-TestRegistry;$v=[version]'10.0.19045.0';$platform='Win32NT';$is64=$true
 switch($name){
  'non-windows'{$platform='Unix'} 'x86'{$is64=$false} 'runtime-string'{$v='10.0.19045.0'}
  'win7'{$v=[version]'6.1.7601.0'} 'win11'{$v=[version]'10.0.22000.0'} 'early-win10'{$v=[version]'10.0.10239.0'} 'minor'{$v=[version]'10.1.19045.0'}
  'null-registry'{$r=$null} 'missing-product'{$r.PSObject.Properties.Remove('ProductName')} 'missing-ubr'{$r.PSObject.Properties.Remove('UBR')}
  'wrong-product'{$r.ProductName='Windows 11 Pro'} 'server'{$r.InstallationType='Server'}
  'major-type'{$r.CurrentMajorVersionNumber='10'} 'major-mismatch'{$r.CurrentMajorVersionNumber=6}
  'minor-type'{$r.CurrentMinorVersionNumber='0'} 'minor-mismatch'{$r.CurrentMinorVersionNumber=1}
  'build-type'{$r.CurrentBuildNumber=19045} 'build-mismatch'{$r.CurrentBuildNumber='19044'}
  'ubr-type'{$r.UBR='6466'} 'negative-ubr'{$r.UBR=-1}
 }
 $rejected=$false;try{$null=Assert-V26BuildHostOs $v $r $platform $is64}catch{$rejected=$true}
 if(-not $rejected){throw ('Invalid host accepted: '+$name)};$rows += [ordered]@{case=$name;rejected=$true}
}
$result=[ordered]@{status='HOST_GATE_TEST_PASS';parse_errors=0;positive_cases=1;negative_cases=$rows;build_script_sha256=(Get-FileHash -LiteralPath $BuildScript -Algorithm SHA256).Hash.ToLowerInvariant();native_build='NOT_PERFORMED'}
if($ProbeActualHost){$result.actual_host=Get-V26BuildHostOs;$result.sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}
$result|ConvertTo-Json -Depth 6 -Compress
`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',env:{...process.env,A9_V26_TEST_BUILD_SCRIPT:path.join(root,'native/helper/build-win10-kit-v26/build.ps1')}});
  assert.equal(result.status,0,result.stderr);const facts=JSON.parse(result.stdout);assert.equal(facts.status,'HOST_GATE_TEST_PASS');assert.equal(facts.positive_cases,1);assert.equal(facts.negative_cases.length,20);
});

test('managed generator and recorder create a distinct lock only with pinned release lifecycle',()=>{
  const f=fixture(true), opts=inputPair(f); const result=recordA9V26HelperInput({...opts,lockId:'A9-31-DEVELOPER-INPUTS-D013-V26-MANAGED'});
  const lock=JSON.parse(fs.readFileSync(opts.output));assert.equal(lock.provenance.task,'A9-31');assert.equal(lock.inputs.runner_return_zip.profile,'D-013-v26-managed-a9-trusted-shell-current-user');
  assert.equal(lock.inputs.runner_return_zip.managed_contract.revision,'a9-31-managed-r1'); assert.equal(lock.gates.win7,'NOT_PERFORMED');
});
for(const mode of ['wrong_pid','lost_receipt','not_alive','not_settled','cancel_released','wrong_sequence','wrong_counts','old_profile','ready_input_attached','ready_token_incomplete','extra_frame_field'])test('managed recorder rejects '+mode,()=>{
  const f=fixture(true),opts=inputPair(f,(dir)=>{
    const summaryFile=path.join(dir,'evidence/v26-managed.json');const summary=JSON.parse(fs.readFileSync(summaryFile));
    if(mode==='wrong_pid')summary.rows[0].root_pid=999;if(mode==='not_alive')summary.rows[0].child_alive_after_helper_exit=false;if(mode==='not_settled')summary.rows[0].lifecycle_settled=false;writeJson(summaryFile,summary);
    const file=path.join(dir,'evidence/v26-managed-release-stdout.jsonl'),frames=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
    if(mode==='ready_input_attached')frames[0].ready.inputDetached=false;if(mode==='ready_token_incomplete')delete frames[0].tokenAudit.tokenType;if(mode==='extra_frame_field')frames[1].pid=999;
    if(mode==='lost_receipt')frames.pop();if(mode==='wrong_sequence')frames[1].seq=2;if(mode==='wrong_counts')frames.at(-1).stdout.rawBytesRead++;if(mode==='old_profile')frames[0].profileId='a9-trusted-shell-current-user-v1';fs.writeFileSync(file,frames.map(JSON.stringify).join('\n')+'\n');
    if(mode==='cancel_released'){const f=path.join(dir,'evidence/v26-managed-cancel-stdout.jsonl');const v=fs.readFileSync(f,'utf8').trim().split('\n').map(JSON.parse);v.at(-1).type='execution_released';fs.writeFileSync(f,v.map(JSON.stringify).join('\n')+'\n');}
  });assert.throws(()=>recordA9V26HelperInput({...opts,lockId:'A9-31-DEVELOPER-INPUTS-D013-V26-MANAGED'}),/A9_V26_/);assert.equal(fs.existsSync(opts.output),false);
});

test('managed README prepares and packages its own revision through the documented command paths',()=>{
  const f=fixture(true),readme=fs.readFileSync(path.join(f.kit,'README_BUILD.md'),'utf8');
  const prepareCommand=readme.split('\n').find(line=>line.startsWith('node ')&&line.includes('/prepare-kit.cjs'));
  const packageCommand=readme.split('\n').find(line=>line.startsWith('node ')&&line.includes('/package-kit.cjs'));
  assert.ok(prepareCommand);assert.ok(packageCommand);
  const prepared=spawnSync(process.execPath,[prepareCommand.split(' ')[1]],{cwd:f.dir,encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
  const zip=path.join(f.dir,'TEST_ONLY-readme-managed.zip');
  const packaged=spawnSync(process.execPath,[packageCommand.split(' ')[1],'--out',zip],{cwd:f.dir,encoding:'utf8'});assert.equal(packaged.status,0,packaged.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.kit,'PACKAGE_MANIFEST.json'))).revision,'a9-31-managed-r1');
  assert.match(readme,/--lock-id A9-31-DEVELOPER-INPUTS-D013-V26-MANAGED/);
});
for(const mode of ['revision','control','release_terminal','persistent_adoption'])test('managed prepare rejects contract drift before replacing locks: '+mode,()=>{
  const f=fixture(true);assert.equal(prepare(f).status,0);const before=fs.readFileSync(path.join(f.kit,'input-lock.json'));
  const profile=JSON.parse(fs.readFileSync(path.join(f.kit,'build-profile.json')));
  if(mode==='revision')profile.managed_contract.revision='a9-30-r6';
  if(mode==='control')profile.managed_contract.control=['cancel'];
  if(mode==='release_terminal')profile.managed_contract.release_terminal='execution_result';
  if(mode==='persistent_adoption')profile.managed_contract.persistent_adoption=true;
  writeJson(path.join(f.kit,'build-profile.json'),profile);assert.notEqual(prepare(f).status,0);assert.deepEqual(fs.readFileSync(path.join(f.kit,'input-lock.json')),before);
});
test('managed packager rejects a wrong manifest revision before emitting any ZIP',()=>{
  const f=fixture(true);assert.equal(prepare(f).status,0);const file=path.join(f.kit,'PACKAGE_MANIFEST.json');
  const m=JSON.parse(fs.readFileSync(file));m.revision='a9-30-r6';writeJson(file,m);const zip=path.join(f.dir,'TEST_ONLY-wrong-revision.zip');
  const result=spawnSync(process.execPath,[path.join(f.kit,'package-kit.cjs'),'--out',zip],{encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(fs.existsSync(zip),false);
});
